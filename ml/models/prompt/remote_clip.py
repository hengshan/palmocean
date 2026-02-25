"""
RemoteCLIP Text Encoder — Adapter for open_clip / RemoteCLIP weights.

Encodes natural language prompts into embedding vectors for text-guided
segmentation of remote sensing imagery.
"""

from __future__ import annotations

from typing import Optional

import torch
import torch.nn as nn
from torch import Tensor


class RemoteCLIPTextEncoder(nn.Module):
    """
    Text encoder using open_clip as backbone, optionally loading RemoteCLIP
    fine-tuned weights from HuggingFace or a local path.

    Args:
        model_name: open_clip model architecture (e.g. "ViT-L-14", "ViT-B-32").
        pretrained: Pretrained weights tag (e.g. "openai", "laion2b_s34b_b79k").
        remote_clip_weights: Optional path/HF repo for RemoteCLIP fine-tuned weights.
        device: Device to load model on.
    """

    def __init__(
        self,
        model_name: str = "ViT-L-14",
        pretrained: str = "openai",
        remote_clip_weights: Optional[str] = None,
        device: str = "cuda",
    ):
        super().__init__()
        import open_clip

        self.device = device
        self.model, _, _ = open_clip.create_model_and_transforms(
            model_name, pretrained=pretrained, device=device
        )
        self.tokenizer = open_clip.get_tokenizer(model_name)

        # Optionally load RemoteCLIP fine-tuned weights
        if remote_clip_weights is not None:
            self._load_remote_clip_weights(remote_clip_weights)

        # Freeze text encoder — we only need embeddings
        for param in self.model.parameters():
            param.requires_grad = False

        self.embed_dim = self.model.text_projection.shape[-1] if hasattr(self.model, "text_projection") else 768

    def _load_remote_clip_weights(self, path: str) -> None:
        """Load RemoteCLIP weights from local path or HuggingFace."""
        import os

        if os.path.isfile(path):
            state_dict = torch.load(path, map_location=self.device)
        else:
            # Try HuggingFace hub
            try:
                from huggingface_hub import hf_hub_download
                local_path = hf_hub_download(repo_id=path, filename="model.pt")
                state_dict = torch.load(local_path, map_location=self.device)
            except Exception:
                raise FileNotFoundError(
                    f"Could not load RemoteCLIP weights from '{path}'. "
                    "Provide a local file path or valid HuggingFace repo ID."
                )

        # Handle different checkpoint formats
        if "state_dict" in state_dict:
            state_dict = state_dict["state_dict"]

        self.model.load_state_dict(state_dict, strict=False)

    @torch.no_grad()
    def encode_text(self, text: str) -> Tensor:
        """
        Encode a single text prompt into a normalized embedding vector.

        Args:
            text: Natural language description.

        Returns:
            Tensor of shape [1, embed_dim], L2-normalized.
        """
        tokens = self.tokenizer([text]).to(self.device)
        embedding = self.model.encode_text(tokens)
        embedding = embedding / embedding.norm(dim=-1, keepdim=True)
        return embedding  # [1, embed_dim]

    @torch.no_grad()
    def encode_texts(self, texts: list[str]) -> Tensor:
        """
        Encode multiple text prompts into normalized embedding vectors.

        Args:
            texts: List of natural language descriptions.

        Returns:
            Tensor of shape [N, embed_dim], L2-normalized.
        """
        tokens = self.tokenizer(texts).to(self.device)
        embeddings = self.model.encode_text(tokens)
        embeddings = embeddings / embeddings.norm(dim=-1, keepdim=True)
        return embeddings  # [N, embed_dim]

    def forward(self, text: str | list[str]) -> Tensor:
        """Convenience forward — accepts single string or list."""
        if isinstance(text, str):
            return self.encode_text(text)
        return self.encode_texts(text)
