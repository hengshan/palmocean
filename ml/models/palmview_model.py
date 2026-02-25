"""
PalmView Segmentation Model — Full pipeline combining encoder + decoder.

Supports:
    - Prithvi-EO 2.0 encoder (frozen or LoRA fine-tuned)
    - TransUNet or SwinUNet decoder
    - RemoteCLIP text encoder for text-guided segmentation (Phase 4)
"""

from __future__ import annotations

from typing import Optional

import torch
import torch.nn as nn
from torch import Tensor

from ml.models.encoder.prithvi import PrithviEncoder
from ml.models.encoder.resnet import ResNetEncoder
from ml.models.decoder.transunet import TransUNetDecoder
from ml.models.decoder.swinunet import SwinUNetDecoder
from ml.models.prompt.remote_clip import RemoteCLIPTextEncoder
from ml.models.prompt.text_fusion import TextGuidedFusion


DECODER_REGISTRY = {
    "transunet": TransUNetDecoder,
    "swinunet": SwinUNetDecoder,
}


class PalmViewModel(nn.Module):
    """
    End-to-end semantic segmentation model for remote sensing imagery.

    Args:
        config: Dictionary (or OmegaConf / yaml-loaded dict) with model configuration.
            Expected structure matches ml/configs/default.yaml.
    """

    def __init__(self, config: dict):
        super().__init__()
        self.config = config
        model_cfg = config["model"]
        enc_cfg = model_cfg["encoder"]
        dec_cfg = model_cfg["decoder"]

        # Encoder
        enc_name = enc_cfg.get("name", "prithvi-eo-2.0")
        if enc_name in ("resnet18", "resnet34", "resnet50"):
            self.encoder = ResNetEncoder(
                backbone=enc_name,
                pretrained=enc_cfg.get("pretrained", True),
                frozen=enc_cfg.get("frozen", False),
            )
        else:
            self.encoder = PrithviEncoder(
                pretrained=enc_cfg.get("pretrained", True),
                frozen=enc_cfg.get("frozen", True),
                lora_rank=enc_cfg.get("lora_rank", 0),
            )

        # Decoder
        decoder_name = dec_cfg.get("name", "transunet")
        decoder_cls = DECODER_REGISTRY.get(decoder_name)
        if decoder_cls is None:
            raise ValueError(f"Unknown decoder: {decoder_name}. Choose from {list(DECODER_REGISTRY)}")

        decoder_kwargs = {
            "encoder_channels": self.encoder.out_channels,
            "num_classes": dec_cfg.get("num_classes", 6),
        }
        if decoder_name == "transunet":
            decoder_kwargs["embed_dim"] = dec_cfg.get("embed_dim", 256)

        self.decoder = decoder_cls(**decoder_kwargs)

        # Text encoder for text-guided segmentation (Phase 4)
        text_cfg = model_cfg.get("text_encoder", {})
        fusion_cfg = model_cfg.get("fusion", {})

        if text_cfg.get("enabled", False):
            self.text_encoder = RemoteCLIPTextEncoder(
                model_name=text_cfg.get("model_name", "ViT-L-14"),
                pretrained=text_cfg.get("pretrained", "openai"),
                remote_clip_weights=text_cfg.get("remote_clip_weights"),
                device=text_cfg.get("device", "cuda"),
            )
            text_dim = text_cfg.get("embed_dim", 768)
            visual_dim = self.encoder.out_channels[-1] if isinstance(self.encoder.out_channels, (list, tuple)) else self.encoder.out_channels
            self.text_fusion = TextGuidedFusion(
                visual_dim=visual_dim,
                text_dim=text_dim,
                num_heads=fusion_cfg.get("num_heads", 8),
                fusion_type=fusion_cfg.get("type", "cross_attention"),
            )
        else:
            self.text_encoder = None
            self.text_fusion = None

    def forward(
        self,
        image: Tensor,
        text_prompt: Optional[str] = None,
    ) -> Tensor:
        """
        Args:
            image: [B, C, H, W] input imagery (3 or 6 bands).
            text_prompt: Optional text prompt for guided segmentation.

        Returns:
            [B, num_classes, H, W] per-pixel class logits.
        """
        features = self.encoder(image)

        # Text-guided fusion: condition visual features on text embedding
        if text_prompt is not None and self.text_encoder is not None and self.text_fusion is not None:
            text_emb = self.text_encoder.encode_text(text_prompt)
            # Fuse text with each feature level
            if isinstance(features, (list, tuple)):
                features = [self.text_fusion(f, text_emb) for f in features]
            else:
                features = self.text_fusion(features, text_emb)

        masks = self.decoder(features)
        return masks

    def predict(self, image: Tensor, text_prompt: Optional[str] = None) -> Tensor:
        """Run inference and return class predictions (argmax)."""
        self.eval()
        with torch.no_grad():
            logits = self.forward(image, text_prompt=text_prompt)
            return logits.argmax(dim=1)

    def get_trainable_params(self) -> list[nn.Parameter]:
        """Return parameters that should be optimized during training."""
        params = list(self.decoder.parameters())
        params.extend(self.encoder.get_trainable_params())
        if self.text_fusion is not None:
            params.extend(self.text_fusion.parameters())
        return params

    @classmethod
    def from_config_file(cls, config_path: str) -> "PalmViewModel":
        """Load model from a YAML config file."""
        import yaml
        with open(config_path) as f:
            config = yaml.safe_load(f)
        return cls(config)

    @classmethod
    def from_checkpoint(cls, checkpoint_path: str, config_path: str) -> "PalmViewModel":
        """Load model from checkpoint + config."""
        model = cls.from_config_file(config_path)
        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
        if "model_state_dict" in checkpoint:
            model.load_state_dict(checkpoint["model_state_dict"], strict=False)
        else:
            model.load_state_dict(checkpoint, strict=False)
        return model
