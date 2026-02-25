"""
Text-Guided Fusion Module — Fuses text embeddings with visual features.

Supports two fusion strategies:
    - Cross-attention: text embedding attends to spatial visual features
    - FiLM: Feature-wise Linear Modulation (scale + shift)
"""

from __future__ import annotations

import torch
import torch.nn as nn
from torch import Tensor


class FiLMLayer(nn.Module):
    """Feature-wise Linear Modulation: γ * x + β, conditioned on text."""

    def __init__(self, visual_dim: int, text_dim: int):
        super().__init__()
        self.gamma_proj = nn.Linear(text_dim, visual_dim)
        self.beta_proj = nn.Linear(text_dim, visual_dim)

    def forward(self, visual: Tensor, text_emb: Tensor) -> Tensor:
        """
        Args:
            visual: [B, C, H, W] or [B, N, C] visual features.
            text_emb: [B, text_dim] or [1, text_dim] text embedding.
        """
        gamma = self.gamma_proj(text_emb)  # [B, C]
        beta = self.beta_proj(text_emb)    # [B, C]

        if visual.dim() == 4:
            # [B, C, H, W] — reshape gamma/beta to [B, C, 1, 1]
            gamma = gamma.unsqueeze(-1).unsqueeze(-1)
            beta = beta.unsqueeze(-1).unsqueeze(-1)
        elif visual.dim() == 3:
            # [B, N, C] — reshape to [B, 1, C]
            gamma = gamma.unsqueeze(1)
            beta = beta.unsqueeze(1)

        return gamma * visual + beta


class CrossAttentionFusion(nn.Module):
    """Multi-head cross-attention: visual features attend to text embedding."""

    def __init__(self, visual_dim: int, text_dim: int, num_heads: int = 8):
        super().__init__()
        self.text_proj = nn.Linear(text_dim, visual_dim)
        self.attn = nn.MultiheadAttention(
            embed_dim=visual_dim,
            num_heads=num_heads,
            batch_first=True,
        )
        self.norm = nn.LayerNorm(visual_dim)

    def forward(self, visual: Tensor, text_emb: Tensor) -> Tensor:
        """
        Args:
            visual: [B, C, H, W] visual features.
            text_emb: [B, text_dim] or [1, text_dim] text embedding.

        Returns:
            [B, C, H, W] text-conditioned visual features.
        """
        B, C, H, W = visual.shape

        # Flatten spatial dims: [B, H*W, C]
        v_flat = visual.permute(0, 2, 3, 1).reshape(B, H * W, C)

        # Project text to visual dim and expand: [B, 1, C]
        text_proj = self.text_proj(text_emb)
        if text_proj.dim() == 2:
            text_proj = text_proj.unsqueeze(1)

        # Cross-attention: query=visual, key/value=text
        attn_out, _ = self.attn(query=v_flat, key=text_proj, value=text_proj)
        v_fused = self.norm(v_flat + attn_out)

        # Reshape back to [B, C, H, W]
        return v_fused.reshape(B, H, W, C).permute(0, 3, 1, 2)


class TextGuidedFusion(nn.Module):
    """
    Unified text-guided fusion module.

    Args:
        visual_dim: Channel dimension of visual features.
        text_dim: Dimension of text embeddings.
        num_heads: Number of attention heads (for cross-attention mode).
        fusion_type: "cross_attention" or "film".
    """

    def __init__(
        self,
        visual_dim: int,
        text_dim: int,
        num_heads: int = 8,
        fusion_type: str = "cross_attention",
    ):
        super().__init__()
        self.fusion_type = fusion_type

        if fusion_type == "cross_attention":
            self.fusion = CrossAttentionFusion(visual_dim, text_dim, num_heads)
        elif fusion_type == "film":
            self.fusion = FiLMLayer(visual_dim, text_dim)
        else:
            raise ValueError(f"Unknown fusion type: {fusion_type}. Use 'cross_attention' or 'film'.")

    def forward(self, visual_features: Tensor, text_embedding: Tensor) -> Tensor:
        """
        Fuse text embedding into visual features.

        Args:
            visual_features: [B, C, H, W] encoder features.
            text_embedding: [B, text_dim] or [1, text_dim] text embedding.

        Returns:
            [B, C, H, W] text-conditioned visual features.
        """
        return self.fusion(visual_features, text_embedding)
