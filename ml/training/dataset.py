"""
PalmView Dataset — loads image + mask pairs for semantic segmentation training.

Supports three data formats:
    - simple: images/ and masks/ folders with matching filenames
    - spacenet: SpaceNet challenge format (geotiff + geojson labels)
    - inria: Inria Aerial Image Labeling Dataset format

Usage:
    dataset = PalmViewDataset(
        data_dir="path/to/data",
        image_size=512,
        augmentation=True,
        format="simple",
    )
"""

from __future__ import annotations

import os
import random
from pathlib import Path
from typing import Optional

import numpy as np
import torch
from torch.utils.data import Dataset
from PIL import Image


# Prithvi-EO normalization (approximate Sentinel-2 stats)
PRITHVI_MEAN = [0.485, 0.456, 0.406]
PRITHVI_STD = [0.229, 0.224, 0.225]


class PalmViewDataset(Dataset):
    """
    Dataset for semantic segmentation with image + mask pairs.

    Args:
        data_dir: Root directory containing the data.
        image_size: Target size for images and masks (square crop/resize).
        augmentation: Enable random augmentations.
        format: Data format — "simple", "spacenet", or "inria".
        split: Optional split file (txt with filenames, one per line).
        num_classes: Number of segmentation classes.
    """

    def __init__(
        self,
        data_dir: str,
        image_size: int = 512,
        augmentation: bool = True,
        format: str = "simple",
        split: Optional[str] = None,
        num_classes: int = 6,
    ):
        self.data_dir = Path(data_dir)
        self.image_size = image_size
        self.augmentation = augmentation
        self.format = format
        self.num_classes = num_classes

        # Discover image-mask pairs based on format
        self.samples = self._discover_samples(split)

        if len(self.samples) == 0:
            raise RuntimeError(
                f"No samples found in {data_dir} with format={format}. "
                f"Expected structure depends on format."
            )

    def _discover_samples(self, split: Optional[str]) -> list[tuple[Path, Path]]:
        """Find all (image_path, mask_path) pairs."""
        if split:
            split_path = Path(split)
            if split_path.exists():
                names = split_path.read_text().strip().split("\n")
                return self._resolve_names(names)

        if self.format == "simple":
            return self._discover_simple()
        elif self.format == "spacenet":
            return self._discover_spacenet()
        elif self.format == "inria":
            return self._discover_inria()
        else:
            raise ValueError(f"Unknown format: {self.format}")

    def _discover_simple(self) -> list[tuple[Path, Path]]:
        """Simple format: data_dir/images/*.png + data_dir/masks/*.png"""
        img_dir = self.data_dir / "images"
        mask_dir = self.data_dir / "masks"
        if not img_dir.exists() or not mask_dir.exists():
            return []

        samples = []
        for img_path in sorted(img_dir.iterdir()):
            if img_path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".tif", ".tiff"}:
                continue
            # Try matching mask with same stem
            for ext in [".png", ".tif", ".tiff"]:
                mask_path = mask_dir / (img_path.stem + ext)
                if mask_path.exists():
                    samples.append((img_path, mask_path))
                    break
        return samples

    def _discover_spacenet(self) -> list[tuple[Path, Path]]:
        """SpaceNet format: RGB images + building footprint masks."""
        # SpaceNet typically has: RGB-PanSharpen/ and geojson/ or masks/
        img_dirs = ["RGB-PanSharpen", "PS-RGB", "images"]
        mask_dirs = ["masks", "geojson_buildings"]

        img_dir = None
        for d in img_dirs:
            p = self.data_dir / d
            if p.exists():
                img_dir = p
                break

        mask_dir = None
        for d in mask_dirs:
            p = self.data_dir / d
            if p.exists():
                mask_dir = p
                break

        if not img_dir or not mask_dir:
            return self._discover_simple()  # fallback

        samples = []
        for img_path in sorted(img_dir.iterdir()):
            if img_path.suffix.lower() not in {".tif", ".tiff", ".png"}:
                continue
            for ext in [".tif", ".tiff", ".png"]:
                mask_path = mask_dir / (img_path.stem + ext)
                if mask_path.exists():
                    samples.append((img_path, mask_path))
                    break
        return samples

    def _discover_inria(self) -> list[tuple[Path, Path]]:
        """Inria Aerial format: images/ and gt/ with matching names."""
        img_dir = self.data_dir / "images"
        mask_dir = self.data_dir / "gt"
        if not img_dir.exists():
            return self._discover_simple()

        samples = []
        for img_path in sorted(img_dir.iterdir()):
            if img_path.suffix.lower() not in {".tif", ".tiff", ".png"}:
                continue
            for ext in [".tif", ".tiff", ".png"]:
                mask_path = mask_dir / (img_path.stem + ext)
                if mask_path.exists():
                    samples.append((img_path, mask_path))
                    break
        return samples

    def _resolve_names(self, names: list[str]) -> list[tuple[Path, Path]]:
        """Resolve filenames from a split file."""
        samples = []
        for name in names:
            name = name.strip()
            if not name:
                continue
            img_path = self.data_dir / "images" / name
            mask_path = self.data_dir / "masks" / name
            if img_path.exists() and mask_path.exists():
                samples.append((img_path, mask_path))
        return samples

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        img_path, mask_path = self.samples[idx]

        # Load image
        image = self._load_image(img_path)
        mask = self._load_mask(mask_path)

        # Resize
        image = self._resize(image, self.image_size)
        mask = self._resize_mask(mask, self.image_size)

        # Augmentation
        if self.augmentation:
            image, mask = self._augment(image, mask)

        # Normalize
        image = self._normalize(image)

        # To tensors
        image_tensor = torch.from_numpy(image.transpose(2, 0, 1)).float()
        mask_tensor = torch.from_numpy(mask).long()

        return {
            "image": image_tensor,
            "mask": mask_tensor,
            "path": str(img_path),
        }

    def _load_image(self, path: Path) -> np.ndarray:
        """Load image as numpy array [H, W, C]."""
        try:
            # Try rasterio for geotiff
            import rasterio
            with rasterio.open(path) as src:
                img = src.read()  # [C, H, W]
                return img.transpose(1, 2, 0).astype(np.float32)
        except (ImportError, Exception):
            # Fallback to PIL
            img = Image.open(path).convert("RGB")
            return np.array(img, dtype=np.float32)

    def _load_mask(self, path: Path) -> np.ndarray:
        """Load mask as numpy array [H, W] with class indices."""
        try:
            import rasterio
            with rasterio.open(path) as src:
                mask = src.read(1)
                mask_arr = mask.astype(np.int64)
        except (ImportError, Exception):
            mask = Image.open(path)
            mask_arr = np.array(mask)
            # If RGB mask, convert to class indices
            if mask_arr.ndim == 3:
                mask_arr = mask_arr[:, :, 0]  # Use first channel
            mask_arr = mask_arr.astype(np.int64)

        # For binary masks where building=255, remap to class 1
        if self.num_classes == 2 and mask_arr.max() > 1:
            mask_arr = (mask_arr > 128).astype(np.int64)

        return mask_arr

    def _resize(self, image: np.ndarray, size: int) -> np.ndarray:
        img = Image.fromarray(image.astype(np.uint8) if image.max() > 1 else (image * 255).astype(np.uint8))
        img = img.resize((size, size), Image.BILINEAR)
        return np.array(img, dtype=np.float32)

    def _resize_mask(self, mask: np.ndarray, size: int) -> np.ndarray:
        m = Image.fromarray(mask.astype(np.uint8))
        m = m.resize((size, size), Image.NEAREST)
        return np.array(m, dtype=np.int64)

    def _normalize(self, image: np.ndarray) -> np.ndarray:
        """Normalize to [0,1] then apply Prithvi-style normalization."""
        if image.max() > 1.0:
            image = image / 255.0
        mean = np.array(PRITHVI_MEAN, dtype=np.float32)
        std = np.array(PRITHVI_STD, dtype=np.float32)
        # Handle different channel counts
        c = image.shape[-1]
        image = (image - mean[:c]) / std[:c]
        return image

    def _augment(self, image: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Apply random augmentations."""
        # Random horizontal flip
        if random.random() > 0.5:
            image = np.flip(image, axis=1).copy()
            mask = np.flip(mask, axis=1).copy()

        # Random vertical flip
        if random.random() > 0.5:
            image = np.flip(image, axis=0).copy()
            mask = np.flip(mask, axis=0).copy()

        # Random 90° rotation
        k = random.randint(0, 3)
        if k > 0:
            image = np.rot90(image, k, axes=(0, 1)).copy()
            mask = np.rot90(mask, k, axes=(0, 1)).copy()

        # Random color jitter (image only)
        if random.random() > 0.5:
            # Brightness
            factor = random.uniform(0.8, 1.2)
            image = image * factor

            # Contrast
            if random.random() > 0.5:
                mean = image.mean()
                factor = random.uniform(0.8, 1.2)
                image = (image - mean) * factor + mean

        image = np.clip(image, 0, 255 if image.max() > 1 else 1.0)
        return image, mask
