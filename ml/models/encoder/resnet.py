"""
ResNet Encoder for RGB imagery semantic segmentation.

Much faster than Prithvi-EO for standard RGB satellite images.
Uses torchvision pretrained ResNet as backbone with multi-scale feature extraction.
"""

from __future__ import annotations

import torch
import torch.nn as nn
from torch import Tensor
import torchvision.models as models


class ResNetEncoder(nn.Module):
    """
    ResNet-based multi-scale feature encoder for segmentation.
    
    Extracts 4 scale levels from ResNet stages:
        - Stage 1: [B, 64, H/4, W/4]
        - Stage 2: [B, 128, H/8, W/8] 
        - Stage 3: [B, 256, H/16, W/16]
        - Stage 4: [B, 512, H/32, W/32]
    
    Args:
        backbone: ResNet variant ('resnet18', 'resnet34', 'resnet50')
        pretrained: Use ImageNet pretrained weights
        frozen: Freeze backbone weights
    """
    
    CHANNEL_MAP = {
        'resnet18': [64, 128, 256, 512],
        'resnet34': [64, 128, 256, 512],
        'resnet50': [256, 512, 1024, 2048],
    }

    def __init__(
        self,
        backbone: str = 'resnet34',
        pretrained: bool = True,
        frozen: bool = False,
    ):
        super().__init__()
        self.backbone_name = backbone
        self._out_channels = self.CHANNEL_MAP[backbone]
        
        # Load pretrained ResNet
        weights = 'IMAGENET1K_V1' if pretrained else None
        resnet = getattr(models, backbone)(weights=weights)
        
        # Split into stages
        self.stem = nn.Sequential(resnet.conv1, resnet.bn1, resnet.relu, resnet.maxpool)
        self.stage1 = resnet.layer1  # /4
        self.stage2 = resnet.layer2  # /8
        self.stage3 = resnet.layer3  # /16
        self.stage4 = resnet.layer4  # /32
        
        if frozen:
            for p in self.parameters():
                p.requires_grad = False

    def forward(self, x: Tensor) -> list[Tensor]:
        x = self.stem(x)
        f1 = self.stage1(x)
        f2 = self.stage2(f1)
        f3 = self.stage3(f2)
        f4 = self.stage4(f3)
        return [f1, f2, f3, f4]
    
    @property
    def out_channels(self) -> list[int]:
        return list(self._out_channels)
    
    def get_trainable_params(self) -> list[nn.Parameter]:
        return [p for p in self.parameters() if p.requires_grad]
