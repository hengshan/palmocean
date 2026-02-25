"""
Swin-UNet Decoder: Swin Transformer-based decoder for semantic segmentation.

Uses Swin Transformer blocks with patch expanding (upsampling) layers
as an alternative to the TransUNet decoder.

Reference: Cao et al., "Swin-Unet: Unet-like Pure Transformer for
Medical Image Segmentation" (adapted for remote sensing).
"""

from __future__ import annotations

import torch
import torch.nn as nn
from torch import Tensor


class WindowAttention(nn.Module):
    """Window-based multi-head self-attention (simplified Swin attention)."""

    def __init__(self, dim: int, window_size: int = 7, num_heads: int = 4):
        super().__init__()
        self.dim = dim
        self.window_size = window_size
        self.num_heads = num_heads
        self.head_dim = dim // num_heads
        self.scale = self.head_dim ** -0.5

        self.qkv = nn.Linear(dim, dim * 3)
        self.proj = nn.Linear(dim, dim)

        # Relative position bias
        self.relative_position_bias_table = nn.Parameter(
            torch.zeros((2 * window_size - 1) * (2 * window_size - 1), num_heads)
        )
        nn.init.trunc_normal_(self.relative_position_bias_table, std=0.02)

        # Compute relative position index
        coords_h = torch.arange(window_size)
        coords_w = torch.arange(window_size)
        coords = torch.stack(torch.meshgrid(coords_h, coords_w, indexing="ij"))
        coords_flatten = coords.view(2, -1)
        relative_coords = coords_flatten[:, :, None] - coords_flatten[:, None, :]
        relative_coords = relative_coords.permute(1, 2, 0).contiguous()
        relative_coords[:, :, 0] += window_size - 1
        relative_coords[:, :, 1] += window_size - 1
        relative_coords[:, :, 0] *= 2 * window_size - 1
        relative_position_index = relative_coords.sum(-1)
        self.register_buffer("relative_position_index", relative_position_index)

    def forward(self, x: Tensor) -> Tensor:
        """
        Args:
            x: [B*num_windows, window_size*window_size, C]
        """
        B_, N, C = x.shape
        qkv = self.qkv(x).reshape(B_, N, 3, self.num_heads, self.head_dim).permute(2, 0, 3, 1, 4)
        q, k, v = qkv.unbind(0)

        attn = (q @ k.transpose(-2, -1)) * self.scale

        # Add relative position bias
        ws2 = self.window_size * self.window_size
        if N == ws2:
            bias = self.relative_position_bias_table[self.relative_position_index.view(-1)].view(ws2, ws2, -1)
            bias = bias.permute(2, 0, 1).unsqueeze(0)
            attn = attn + bias

        attn = attn.softmax(dim=-1)
        out = (attn @ v).transpose(1, 2).reshape(B_, N, C)
        return self.proj(out)


def window_partition(x: Tensor, window_size: int) -> Tensor:
    """Partition spatial tensor into non-overlapping windows.

    Args:
        x: [B, H, W, C]
    Returns:
        [B * num_windows, window_size, window_size, C]
    """
    B, H, W, C = x.shape
    x = x.view(B, H // window_size, window_size, W // window_size, window_size, C)
    return x.permute(0, 1, 3, 2, 4, 5).contiguous().view(-1, window_size, window_size, C)


def window_reverse(windows: Tensor, window_size: int, H: int, W: int) -> Tensor:
    """Reverse window partition.

    Args:
        windows: [B * num_windows, window_size, window_size, C]
    Returns:
        [B, H, W, C]
    """
    B = windows.shape[0] // (H // window_size * W // window_size)
    x = windows.view(B, H // window_size, W // window_size, window_size, window_size, -1)
    return x.permute(0, 1, 3, 2, 4, 5).contiguous().view(B, H, W, -1)


class SwinTransformerBlock(nn.Module):
    """Swin Transformer block with window attention and shifted window attention."""

    def __init__(self, dim: int, num_heads: int = 4, window_size: int = 7,
                 shift_size: int = 0, mlp_ratio: float = 4.0, dropout: float = 0.1):
        super().__init__()
        self.dim = dim
        self.window_size = window_size
        self.shift_size = shift_size

        self.norm1 = nn.LayerNorm(dim)
        self.attn = WindowAttention(dim, window_size=window_size, num_heads=num_heads)
        self.norm2 = nn.LayerNorm(dim)
        mlp_hidden = int(dim * mlp_ratio)
        self.mlp = nn.Sequential(
            nn.Linear(dim, mlp_hidden),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(mlp_hidden, dim),
            nn.Dropout(dropout),
        )

    def forward(self, x: Tensor, H: int, W: int) -> Tensor:
        """
        Args:
            x: [B, H*W, C]
            H, W: spatial dimensions
        """
        B, L, C = x.shape
        shortcut = x
        x = self.norm1(x)
        x = x.view(B, H, W, C)

        # Pad if needed
        pad_r = (self.window_size - W % self.window_size) % self.window_size
        pad_b = (self.window_size - H % self.window_size) % self.window_size
        if pad_r > 0 or pad_b > 0:
            x = nn.functional.pad(x, (0, 0, 0, pad_r, 0, pad_b))
        Hp, Wp = x.shape[1], x.shape[2]

        # Cyclic shift
        if self.shift_size > 0:
            x = torch.roll(x, shifts=(-self.shift_size, -self.shift_size), dims=(1, 2))

        # Window partition
        windows = window_partition(x, self.window_size)
        windows = windows.view(-1, self.window_size * self.window_size, C)

        # Window attention
        attn_windows = self.attn(windows)
        attn_windows = attn_windows.view(-1, self.window_size, self.window_size, C)

        # Reverse window
        x = window_reverse(attn_windows, self.window_size, Hp, Wp)

        # Reverse shift
        if self.shift_size > 0:
            x = torch.roll(x, shifts=(self.shift_size, self.shift_size), dims=(1, 2))

        # Remove padding
        if pad_r > 0 or pad_b > 0:
            x = x[:, :H, :W, :]

        x = x.view(B, H * W, C)
        x = shortcut + x
        x = x + self.mlp(self.norm2(x))
        return x


class PatchExpand(nn.Module):
    """Patch expanding layer for upsampling (reverse of patch merging)."""

    def __init__(self, in_dim: int, out_dim: int, scale: int = 2):
        super().__init__()
        self.scale = scale
        self.expand = nn.Linear(in_dim, out_dim * scale * scale, bias=False)
        self.norm = nn.LayerNorm(out_dim)

    def forward(self, x: Tensor, H: int, W: int) -> Tensor:
        """
        Args:
            x: [B, H*W, C]
        Returns:
            [B, (H*scale)*(W*scale), C_out]
        """
        B, L, C = x.shape
        x = self.expand(x)  # [B, H*W, C_out * scale^2]
        x = x.view(B, H, W, self.scale, self.scale, -1)
        x = x.permute(0, 1, 3, 2, 4, 5).contiguous()
        x = x.view(B, H * self.scale, W * self.scale, -1)
        x = self.norm(x)
        return x.view(B, -1, x.shape[-1])


class SwinDecoderStage(nn.Module):
    """Single decoder stage: patch expand + skip concat + Swin blocks."""

    def __init__(self, in_dim: int, out_dim: int, skip_dim: int,
                 num_blocks: int = 2, num_heads: int = 4, window_size: int = 7):
        super().__init__()
        self.expand = PatchExpand(in_dim, out_dim)
        # After concat with skip: out_dim + skip_dim → out_dim
        self.skip_proj = nn.Linear(out_dim + skip_dim, out_dim)
        self.blocks = nn.ModuleList([
            SwinTransformerBlock(
                out_dim, num_heads=num_heads, window_size=window_size,
                shift_size=0 if i % 2 == 0 else window_size // 2,
            )
            for i in range(num_blocks)
        ])

    def forward(self, x: Tensor, skip: Tensor, H: int, W: int) -> tuple[Tensor, int, int]:
        """
        Args:
            x: [B, H*W, C_in]
            skip: [B, C_skip, 2H, 2W] encoder skip connection (spatial format)
        """
        # Expand
        x = self.expand(x, H, W)
        new_H, new_W = H * 2, W * 2

        # Concat skip connection
        B = skip.shape[0]
        skip_flat = skip.flatten(2).permute(0, 2, 1)  # [B, 4H*W, C_skip]

        # Handle size mismatch
        if skip_flat.shape[1] != x.shape[1]:
            skip_spatial = skip.permute(0, 2, 3, 1)  # [B, sH, sW, C]
            skip_spatial = nn.functional.interpolate(
                skip.float(), size=(new_H, new_W), mode="bilinear", align_corners=False
            )
            skip_flat = skip_spatial.flatten(2).permute(0, 2, 1)

        x = torch.cat([x, skip_flat], dim=-1)
        x = self.skip_proj(x)

        # Swin blocks
        for block in self.blocks:
            x = block(x, new_H, new_W)

        return x, new_H, new_W


class SwinUNetDecoder(nn.Module):
    """
    Swin-UNet style decoder using Swin Transformer blocks and patch expanding.

    Args:
        encoder_channels: Channel dims from encoder [shallowest, ..., deepest]
            e.g. [96, 192, 384, 768]
        num_classes: Number of output segmentation classes.
        num_heads: Base number of attention heads (scaled per stage).
        window_size: Window size for Swin attention.
        blocks_per_stage: Number of Swin blocks per decoder stage.
    """

    def __init__(
        self,
        encoder_channels: list[int],
        num_classes: int,
        num_heads: int = 4,
        window_size: int = 7,
        blocks_per_stage: int = 2,
    ):
        super().__init__()
        self.num_classes = num_classes
        n_levels = len(encoder_channels)

        # Decoder stages (from deepest to shallowest)
        self.stages = nn.ModuleList()
        for i in range(n_levels - 1):
            depth_idx = n_levels - 1 - i
            in_dim = encoder_channels[depth_idx]
            out_dim = encoder_channels[depth_idx - 1]
            skip_dim = encoder_channels[depth_idx - 1]
            heads = max(1, num_heads * (2 ** max(0, depth_idx - 2)))
            self.stages.append(SwinDecoderStage(
                in_dim, out_dim, skip_dim,
                num_blocks=blocks_per_stage,
                num_heads=heads,
                window_size=window_size,
            ))

        # Final segmentation head
        self.seg_head = nn.Sequential(
            nn.Linear(encoder_channels[0], encoder_channels[0] // 2),
            nn.GELU(),
            nn.Linear(encoder_channels[0] // 2, num_classes),
        )

        # Upsample to full resolution
        self.final_upsample = nn.Upsample(scale_factor=4, mode="bilinear", align_corners=False)

    def forward(self, features: list[Tensor]) -> Tensor:
        """
        Args:
            features: Multi-scale encoder features [shallowest → deepest].
                Each is [B, C, H, W].

        Returns:
            [B, num_classes, H_in, W_in] per-pixel class logits.
        """
        # Start from deepest
        x = features[-1]
        B, C, H, W = x.shape
        x = x.flatten(2).permute(0, 2, 1)  # [B, H*W, C]

        # Progressive decode
        skips = list(reversed(features[:-1]))
        for stage, skip in zip(self.stages, skips):
            x, H, W = stage(x, skip, H, W)

        # Segmentation head
        x = self.seg_head(x)  # [B, H*W, num_classes]
        x = x.permute(0, 2, 1).reshape(B, self.num_classes, H, W)

        # Upsample to input resolution
        x = self.final_upsample(x)

        return x
