"""
BIT-CD: Bi-Temporal Image Transformer for Change Detection

Simplified implementation of BIT (Bi-Temporal Image Transformer) for remote sensing change detection.
Based on the paper: "Remote Sensing Image Change Detection with Transformers" (Arxiv 2021)

This implementation focuses on:
- Dual-branch encoder for before/after images
- Token-based difference feature extraction
- Transformer encoder for spatial-temporal modeling
- Lightweight design for practical use
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models
import math
from typing import Tuple, Optional


class PatchEmbed(nn.Module):
    """Image to Patch Embedding"""
    def __init__(self, img_size=256, patch_size=16, in_chans=3, embed_dim=768):
        super().__init__()
        self.img_size = img_size
        self.patch_size = patch_size
        self.num_patches = (img_size // patch_size) ** 2
        
        self.proj = nn.Conv2d(in_chans, embed_dim, kernel_size=patch_size, stride=patch_size)
        
    def forward(self, x):
        B, C, H, W = x.shape
        # Project and flatten: [B, C, H, W] -> [B, embed_dim, H//patch_size, W//patch_size] -> [B, num_patches, embed_dim]
        x = self.proj(x).flatten(2).transpose(1, 2)
        return x


class PositionalEncoding(nn.Module):
    """Positional encoding for transformer"""
    def __init__(self, d_model, max_len=5000):
        super().__init__()
        
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0).transpose(0, 1)
        
        self.register_buffer('pe', pe)
        
    def forward(self, x):
        return x + self.pe[:x.size(0), :]


class DifferenceModule(nn.Module):
    """Extract difference features between before and after images"""
    def __init__(self, embed_dim=256):
        super().__init__()
        self.embed_dim = embed_dim
        
        # Difference operations
        self.diff_conv = nn.Conv1d(embed_dim * 2, embed_dim, 1)
        self.norm = nn.LayerNorm(embed_dim)
        
    def forward(self, feat_a, feat_b):
        """
        feat_a: [B, N, C] - features from image A (before)
        feat_b: [B, N, C] - features from image B (after)
        """
        # Concatenate features
        concat_feat = torch.cat([feat_a, feat_b], dim=-1)  # [B, N, 2*C]
        
        # Apply difference operation
        concat_feat = concat_feat.transpose(1, 2)  # [B, 2*C, N]
        diff_feat = self.diff_conv(concat_feat)  # [B, C, N]
        diff_feat = diff_feat.transpose(1, 2)  # [B, N, C]
        
        # Normalize
        diff_feat = self.norm(diff_feat)
        
        return diff_feat


class ResNetEncoder(nn.Module):
    """ResNet-based encoder for feature extraction"""
    def __init__(self, backbone='resnet18', pretrained=True):
        super().__init__()
        
        if backbone == 'resnet18':
            resnet = models.resnet18(pretrained=pretrained)
            self.feature_dim = 512
        elif backbone == 'resnet34':
            resnet = models.resnet34(pretrained=pretrained)
            self.feature_dim = 512
        else:
            raise ValueError(f"Unsupported backbone: {backbone}")
        
        # Remove classifier and avgpool
        self.encoder = nn.Sequential(
            resnet.conv1,
            resnet.bn1,
            resnet.relu,
            resnet.maxpool,
            resnet.layer1,
            resnet.layer2,
            resnet.layer3,
            resnet.layer4
        )
        
        # Adaptive pooling to ensure consistent output size
        self.adaptive_pool = nn.AdaptiveAvgPool2d((16, 16))  # 16x16 = 256 patches
        
    def forward(self, x):
        features = self.encoder(x)  # [B, feature_dim, H', W']
        features = self.adaptive_pool(features)  # [B, feature_dim, 16, 16]
        
        # Flatten to patch-like format
        B, C, H, W = features.shape
        features = features.view(B, C, H*W).transpose(1, 2)  # [B, H*W, C]
        
        return features


class BITCD(nn.Module):
    """
    BIT-CD: Bi-Temporal Image Transformer for Change Detection
    
    Args:
        img_size: Input image size (default: 256)
        num_classes: Number of output classes (2 for binary change detection)
        backbone: CNN backbone ('resnet18', 'resnet34')
        embed_dim: Transformer embedding dimension
        num_heads: Number of attention heads
        num_layers: Number of transformer layers
        dropout: Dropout rate
    """
    
    def __init__(
        self,
        img_size: int = 256,
        num_classes: int = 2,
        backbone: str = 'resnet18',
        embed_dim: int = 256,
        num_heads: int = 8,
        num_layers: int = 4,
        dropout: float = 0.1
    ):
        super().__init__()
        
        self.img_size = img_size
        self.num_classes = num_classes
        self.embed_dim = embed_dim
        
        # Backbone encoder (shared for both images)
        self.encoder = ResNetEncoder(backbone, pretrained=True)
        
        # Feature dimension alignment
        if self.encoder.feature_dim != embed_dim:
            self.feature_proj = nn.Linear(self.encoder.feature_dim, embed_dim)
        else:
            self.feature_proj = nn.Identity()
        
        # Difference module
        self.diff_module = DifferenceModule(embed_dim)
        
        # Positional encoding
        max_patches = (img_size // 16) ** 2  # Assuming 16x16 patches after ResNet
        self.pos_encoding = PositionalEncoding(embed_dim, max_patches)
        
        # Transformer encoder
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=embed_dim,
            nhead=num_heads,
            dim_feedforward=embed_dim * 4,
            dropout=dropout,
            batch_first=True
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers)
        
        # Classification head
        self.classifier = nn.Sequential(
            nn.LayerNorm(embed_dim),
            nn.Linear(embed_dim, embed_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(embed_dim // 2, num_classes)
        )
        
        # Upsampling layers for dense prediction
        self.upsample = nn.Sequential(
            nn.ConvTranspose2d(num_classes, num_classes, 4, stride=2, padding=1),
            nn.ReLU(),
            nn.ConvTranspose2d(num_classes, num_classes, 4, stride=2, padding=1),
            nn.ReLU(),
            nn.ConvTranspose2d(num_classes, num_classes, 4, stride=2, padding=1),
            nn.ReLU(),
            nn.ConvTranspose2d(num_classes, num_classes, 4, stride=2, padding=1),
        )
        
    def forward(self, img_a, img_b):
        """
        Forward pass
        
        Args:
            img_a: Before image [B, 3, H, W]
            img_b: After image [B, 3, H, W]
            
        Returns:
            change_map: Change prediction [B, num_classes, H, W]
        """
        B = img_a.size(0)
        
        # Extract features from both images
        feat_a = self.encoder(img_a)  # [B, num_patches, feature_dim]
        feat_b = self.encoder(img_b)  # [B, num_patches, feature_dim]
        
        # Project features to embedding dimension
        feat_a = self.feature_proj(feat_a)  # [B, num_patches, embed_dim]
        feat_b = self.feature_proj(feat_b)  # [B, num_patches, embed_dim]
        
        # Extract difference features
        diff_feat = self.diff_module(feat_a, feat_b)  # [B, num_patches, embed_dim]
        
        # Add positional encoding
        diff_feat = diff_feat.transpose(0, 1)  # [num_patches, B, embed_dim]
        diff_feat = self.pos_encoding(diff_feat)
        diff_feat = diff_feat.transpose(0, 1)  # [B, num_patches, embed_dim]
        
        # Transformer encoding
        encoded_feat = self.transformer(diff_feat)  # [B, num_patches, embed_dim]
        
        # Classification
        logits = self.classifier(encoded_feat)  # [B, num_patches, num_classes]
        
        # Reshape to 2D map
        patch_size = int(math.sqrt(logits.size(1)))
        logits = logits.transpose(1, 2).view(B, self.num_classes, patch_size, patch_size)
        
        # Upsample to original size
        change_map = self.upsample(logits)  # [B, num_classes, H, W]
        
        # Ensure output size matches input
        change_map = F.interpolate(change_map, size=(self.img_size, self.img_size), 
                                 mode='bilinear', align_corners=False)
        
        return change_map
    
    def predict_change_mask(self, img_a, img_b, threshold=0.5):
        """
        Predict binary change mask
        
        Args:
            img_a: Before image [B, 3, H, W]
            img_b: After image [B, 3, H, W]
            threshold: Classification threshold
            
        Returns:
            change_mask: Binary change mask [B, 1, H, W]
        """
        with torch.no_grad():
            change_map = self.forward(img_a, img_b)
            
            if self.num_classes == 2:
                # Binary classification
                prob = F.softmax(change_map, dim=1)
                change_mask = (prob[:, 1:2] > threshold).float()
            else:
                # Multi-class: change if not background
                prob = F.softmax(change_map, dim=1)
                change_mask = (prob[:, 0:1] < threshold).float()
                
        return change_mask


def build_bit_cd(config=None):
    """Build BIT-CD model with config"""
    if config is None:
        config = {
            'img_size': 256,
            'num_classes': 2,
            'backbone': 'resnet18',
            'embed_dim': 256,
            'num_heads': 8,
            'num_layers': 4,
            'dropout': 0.1
        }
    
    model = BITCD(**config)
    return model


if __name__ == "__main__":
    # Test the model
    model = build_bit_cd()
    
    # Create dummy inputs
    img_a = torch.randn(2, 3, 256, 256)
    img_b = torch.randn(2, 3, 256, 256)
    
    # Forward pass
    output = model(img_a, img_b)
    print(f"Input shapes: {img_a.shape}, {img_b.shape}")
    print(f"Output shape: {output.shape}")
    
    # Test prediction
    mask = model.predict_change_mask(img_a, img_b)
    print(f"Change mask shape: {mask.shape}")
    
    print("BIT-CD model test passed!")