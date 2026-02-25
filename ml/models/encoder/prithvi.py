"""
Prithvi-EO 2.0 Foundation Model Encoder Adapter.

Wraps the IBM/NASA Prithvi-EO-2.0-300M ViT encoder for use as a feature
extractor in semantic segmentation pipelines. Extracts multi-scale features
from intermediate transformer blocks for decoder consumption.

Reference: https://huggingface.co/ibm-nasa-geospatial/Prithvi-EO-2.0-300M

Requirements (install on training machine, NOT Jetson):
    pip install torch transformers einops timm
"""

from __future__ import annotations

import math
import os
from typing import Optional

import torch
import torch.nn as nn
from torch import Tensor

from .prithvi_mae import PrithviViT


class LoRALinear(nn.Module):
    """Low-Rank Adaptation wrapper for nn.Linear layers."""

    def __init__(self, original: nn.Linear, rank: int = 8, alpha: float = 16.0):
        super().__init__()
        self.original = original
        self.rank = rank
        self.alpha = alpha
        in_features = original.in_features
        out_features = original.out_features

        self.lora_A = nn.Parameter(torch.randn(in_features, rank) * 0.01)
        self.lora_B = nn.Parameter(torch.zeros(rank, out_features))
        self.scaling = alpha / rank

        # Freeze original weights
        self.original.weight.requires_grad_(False)
        if self.original.bias is not None:
            self.original.bias.requires_grad_(False)

    def forward(self, x: Tensor) -> Tensor:
        base = self.original(x)
        lora = (x @ self.lora_A @ self.lora_B) * self.scaling
        return base + lora


class PrithviEncoder(nn.Module):
    """
    Adapter for Prithvi-EO 2.0 (ViT-based) as a multi-scale feature encoder.

    Extracts features from 4 intermediate transformer layers and projects them
    to consistent channel dimensions for the decoder.

    Args:
        pretrained: Load pretrained weights from HuggingFace.
        frozen: Freeze all encoder weights (recommended for fine-tuning decoder only).
        lora_rank: If > 0, inject LoRA adapters into attention layers (unfreezes LoRA params).
        model_name: HuggingFace model identifier.
        feature_indices: Which transformer blocks to tap for multi-scale features.
            Defaults to layers [2, 5, 8, 11] for a 12-block ViT.
    """

    # Default multi-scale tap points for 24-layer Prithvi-EO 2.0
    DEFAULT_FEATURE_INDICES = [5, 11, 17, 23]

    # Prithvi-EO 2.0 300M hidden dimension
    HIDDEN_DIM = 1024

    # Output channel dimensions for each scale level (for decoder compatibility)
    OUTPUT_CHANNELS = [256, 512, 768, 1024]

    def __init__(
        self,
        pretrained: bool = True,
        frozen: bool = True,
        lora_rank: int = 0,
        model_name: str = "ibm-nasa-geospatial/Prithvi-EO-2.0-300M",
        feature_indices: Optional[list[int]] = None,
        img_size: int = 224,
        num_frames: int = 4,
        in_chans: int = 6,
    ):
        super().__init__()
        self.model_name = model_name
        self.frozen = frozen
        self.lora_rank = lora_rank
        self.feature_indices = feature_indices or self.DEFAULT_FEATURE_INDICES
        self.img_size = img_size
        self.num_frames = num_frames
        self.in_chans = in_chans

        # Load the backbone with Prithvi-EO 2.0 parameters
        self.backbone = self._load_backbone(pretrained)

        # Channel projection layers: project from hidden_dim to desired output channels
        self.projections = nn.ModuleList([
            nn.Sequential(
                nn.Conv2d(self.HIDDEN_DIM, ch, kernel_size=1, bias=False),
                nn.BatchNorm2d(ch),
                nn.GELU(),
            )
            for ch in self.OUTPUT_CHANNELS
        ])

        # Freeze if requested
        if frozen:
            self._freeze_backbone()

        # Apply LoRA if requested (after freezing so LoRA params stay trainable)
        if lora_rank > 0:
            self._apply_lora(lora_rank)

    def _load_backbone(self, pretrained: bool) -> PrithviViT:
        """Load Prithvi-EO backbone using custom PrithviViT class."""
        # Initialize with Prithvi-EO 2.0 300M parameters
        model = PrithviViT(
            img_size=self.img_size,
            patch_size=(1, 16, 16),  # Prithvi-EO 2.0 patch size
            num_frames=self.num_frames,
            in_chans=self.in_chans,
            embed_dim=1024,  # Prithvi-EO 2.0 embed dim
            depth=24,        # Prithvi-EO 2.0 depth
            num_heads=16,    # Prithvi-EO 2.0 num heads
            mlp_ratio=4.0,
            norm_layer=nn.LayerNorm,
        )
        
        if pretrained:
            # Load pretrained weights from HuggingFace cache
            model_cache_dir = os.path.expanduser(
                "~/.cache/huggingface/hub/models--ibm-nasa-geospatial--Prithvi-EO-2.0-300M/"
                "snapshots/9eb1b1102806593963daa333bcc491b1c6f8562f"
            )
            weights_path = os.path.join(model_cache_dir, "Prithvi_EO_V2_300M.pt")
            
            if os.path.exists(weights_path):
                print(f"Loading Prithvi-EO 2.0 weights from {weights_path}")
                checkpoint = torch.load(weights_path, map_location='cpu')
                
                # Handle different checkpoint formats
                if 'state_dict' in checkpoint:
                    state_dict = checkpoint['state_dict']
                elif 'model' in checkpoint:
                    state_dict = checkpoint['model']
                else:
                    state_dict = checkpoint
                    
                # Remove 'encoder.' prefix if present
                new_state_dict = {}
                for key, value in state_dict.items():
                    if key.startswith('encoder.'):
                        new_key = key[8:]  # Remove 'encoder.' prefix
                        new_state_dict[new_key] = value
                    else:
                        new_state_dict[key] = value
                        
                # Load state dict with strict=False to handle any mismatches
                missing_keys, unexpected_keys = model.load_state_dict(new_state_dict, strict=False)
                if missing_keys:
                    print(f"Missing keys: {missing_keys[:10]}...")  # Show first 10
                if unexpected_keys:
                    print(f"Unexpected keys: {unexpected_keys[:10]}...")  # Show first 10
            else:
                print(f"Pretrained weights not found at {weights_path}, using random initialization")
        
        return model

    def _freeze_backbone(self) -> None:
        """Freeze all backbone parameters."""
        for param in self.backbone.parameters():
            param.requires_grad = False

    def _apply_lora(self, rank: int) -> None:
        """Inject LoRA adapters into all attention QKV projections."""
        for name, module in self.backbone.named_modules():
            if isinstance(module, nn.Linear) and any(
                k in name for k in ["query", "key", "value", "q_proj", "k_proj", "v_proj", "qkv"]
            ):
                # Replace with LoRA-wrapped version
                parent_name, attr_name = name.rsplit(".", 1) if "." in name else ("", name)
                parent = self.backbone
                if parent_name:
                    for part in parent_name.split("."):
                        parent = getattr(parent, part)
                setattr(parent, attr_name, LoRALinear(module, rank=rank))

    def _reshape_tokens_to_spatial(self, tokens: Tensor, h: int, w: int) -> Tensor:
        """Reshape transformer output tokens [B, N, C] -> spatial [B, C, H, W].

        Assumes tokens include a CLS token at position 0 which is removed.
        For Prithvi with temporal dimension, we average across time frames.
        """
        B, N, C = tokens.shape
        # Remove CLS token if present
        spatial_tokens = N - 1
        expected = h * w * self.num_frames
        
        if spatial_tokens == expected:
            tokens = tokens[:, 1:, :]  # remove CLS
        elif N == expected:
            pass  # no CLS token
        else:
            # Try to infer — just remove first token
            tokens = tokens[:, 1:, :]
            spatial_tokens = tokens.shape[1]
        
        # Reshape to spatial format, accounting for temporal dimension
        # tokens shape: [B, T*H*W, C]
        tokens_per_frame = spatial_tokens // self.num_frames
        h_patches = int(math.sqrt(tokens_per_frame))
        w_patches = h_patches
        
        # Reshape: [B, T*H*W, C] -> [B, T, H, W, C] 
        tokens = tokens.view(B, self.num_frames, h_patches, w_patches, C)
        
        # Average across temporal dimension to get [B, H, W, C]
        tokens = tokens.mean(dim=1)  # [B, H, W, C]
        
        # Permute to [B, C, H, W]
        tokens = tokens.permute(0, 3, 1, 2).contiguous()  # [B, C, H, W]
        
        return tokens

    def forward(self, x: Tensor) -> list[Tensor]:
        """
        Extract multi-scale features from the encoder.

        Args:
            x: Input tensor [B, C, T, H, W] or [B, C, H, W]. 
               Prithvi expects 6-band (B02-B07) input with 4 temporal frames.

        Returns:
            List of 4 feature tensors at increasing depth/decreasing resolution:
                [B, 256, H/4, W/4], [B, 512, H/8, W/8],
                [B, 768, H/16, W/16], [B, 1024, H/32, W/32]
        """
        # Handle input shape - if 4D, add temporal dimension
        if len(x.shape) == 4:
            B, C, H, W = x.shape
            # Pad channels to match in_chans if needed (e.g. RGB 3ch → 6ch)
            if C < self.in_chans:
                pad = x.new_zeros(B, self.in_chans - C, H, W)
                x = torch.cat([x, pad], dim=1)
                C = self.in_chans
            # Expand to temporal dimension by repeating the frame
            x = x.unsqueeze(2).expand(B, C, self.num_frames, H, W)
        else:
            B, C, T, H, W = x.shape
            if C < self.in_chans:
                pad = x.new_zeros(B, self.in_chans - C, T, H, W)
                x = torch.cat([x, pad], dim=2)  # pad channels

        # Compute spatial dims after patch embedding (patch_size=16 for ViT)
        patch_size = 16
        h_patches = H // patch_size
        w_patches = W // patch_size

        # Hook into intermediate layers to get multi-scale features
        intermediate_outputs: list[Tensor] = []
        hooks = []

        def make_hook(idx: int):
            def hook_fn(module, input, output):
                # output is typically [B, N, C] for transformer blocks
                if isinstance(output, tuple):
                    intermediate_outputs.append(output[0])
                else:
                    intermediate_outputs.append(output)
            return hook_fn

        # Register hooks on target layers
        for i, layer_idx in enumerate(self.feature_indices):
            if layer_idx < len(self.backbone.blocks):
                h = self.backbone.blocks[layer_idx].register_forward_hook(make_hook(i))
                hooks.append(h)

        # Forward pass through backbone
        with torch.no_grad() if self.frozen and self.lora_rank == 0 else _null_context():
            # Use forward_features to get intermediate outputs without masking
            _ = self.backbone.forward_features(x)

        # Remove hooks
        for h in hooks:
            h.remove()

        # Process intermediate features into spatial format
        features = []
        for i, tokens in enumerate(intermediate_outputs):
            spatial = self._reshape_tokens_to_spatial(tokens, h_patches, w_patches)
            projected = self.projections[i](spatial)

            # Downsample progressively to create multi-scale pyramid
            if i > 0:
                scale = 2 ** i
                target_size = (h_patches // scale, w_patches // scale)
                projected = nn.functional.interpolate(
                    projected,
                    size=target_size,
                    mode="bilinear",
                    align_corners=False,
                )
            features.append(projected)

        return features

    @property
    def out_channels(self) -> list[int]:
        """Output channel dimensions for each scale level."""
        return list(self.OUTPUT_CHANNELS)

    def get_trainable_params(self) -> list[nn.Parameter]:
        """Return only trainable parameters (projection layers + LoRA if active)."""
        params = list(self.projections.parameters())
        if self.lora_rank > 0:
            for module in self.backbone.modules():
                if isinstance(module, LoRALinear):
                    params.extend([module.lora_A, module.lora_B])
        return params


class _null_context:
    """No-op context manager for conditional torch.no_grad()."""
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass