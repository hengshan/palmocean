#!/usr/bin/env python3
"""
PalmView Training Script — Train semantic segmentation models.

Usage:
    python ml/training/train.py --config ml/configs/default.yaml --data_dir /path/to/data --output_dir ./runs/exp1

Requirements (install on training machine):
    pip install torch torchvision pyyaml numpy pillow
    pip install transformers  # for Prithvi-EO encoder
    pip install rasterio      # optional, for GeoTIFF support
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from pathlib import Path

import numpy as np
import yaml

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from ml.models.palmview_model import PalmViewModel
from ml.training.dataset import PalmViewDataset


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

class SegmentationMetrics:
    """Tracks mIoU, pixel accuracy, and per-class IoU."""

    def __init__(self, num_classes: int):
        self.num_classes = num_classes
        self.confusion = np.zeros((num_classes, num_classes), dtype=np.int64)

    def update(self, pred: np.ndarray, target: np.ndarray):
        """Update confusion matrix with a batch of predictions."""
        mask = (target >= 0) & (target < self.num_classes)
        self.confusion += np.bincount(
            target[mask] * self.num_classes + pred[mask],
            minlength=self.num_classes ** 2,
        ).reshape(self.num_classes, self.num_classes)

    def pixel_accuracy(self) -> float:
        correct = np.diag(self.confusion).sum()
        total = self.confusion.sum()
        return correct / max(total, 1)

    def per_class_iou(self) -> np.ndarray:
        tp = np.diag(self.confusion)
        fp = self.confusion.sum(axis=0) - tp
        fn = self.confusion.sum(axis=1) - tp
        denom = tp + fp + fn
        iou = np.where(denom > 0, tp / denom, 0.0)
        return iou

    def miou(self) -> float:
        iou = self.per_class_iou()
        valid = (self.confusion.sum(axis=1) > 0)
        return iou[valid].mean() if valid.any() else 0.0

    def reset(self):
        self.confusion[:] = 0


# ---------------------------------------------------------------------------
# Training Loop
# ---------------------------------------------------------------------------

def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    metrics: SegmentationMetrics,
) -> dict:
    model.train()
    metrics.reset()
    total_loss = 0.0
    num_batches = 0

    for batch in loader:
        images = batch["image"].to(device)
        masks = batch["mask"].to(device)

        optimizer.zero_grad()
        logits = model(images)

        # Handle size mismatch
        if logits.shape[2:] != masks.shape[1:]:
            logits = nn.functional.interpolate(
                logits, size=masks.shape[1:], mode="bilinear", align_corners=False
            )

        loss = criterion(logits, masks)
        loss.backward()
        optimizer.step()

        total_loss += loss.item()
        num_batches += 1

        # Track metrics
        pred = logits.argmax(dim=1).cpu().numpy()
        target = masks.cpu().numpy()
        metrics.update(pred, target)

    return {
        "loss": total_loss / max(num_batches, 1),
        "pixel_acc": metrics.pixel_accuracy(),
        "miou": metrics.miou(),
        "per_class_iou": metrics.per_class_iou().tolist(),
    }


@torch.no_grad()
def validate(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    metrics: SegmentationMetrics,
) -> dict:
    model.eval()
    metrics.reset()
    total_loss = 0.0
    num_batches = 0

    for batch in loader:
        images = batch["image"].to(device)
        masks = batch["mask"].to(device)

        logits = model(images)
        if logits.shape[2:] != masks.shape[1:]:
            logits = nn.functional.interpolate(
                logits, size=masks.shape[1:], mode="bilinear", align_corners=False
            )

        loss = criterion(logits, masks)
        total_loss += loss.item()
        num_batches += 1

        pred = logits.argmax(dim=1).cpu().numpy()
        target = masks.cpu().numpy()
        metrics.update(pred, target)

    return {
        "loss": total_loss / max(num_batches, 1),
        "pixel_acc": metrics.pixel_accuracy(),
        "miou": metrics.miou(),
        "per_class_iou": metrics.per_class_iou().tolist(),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="PalmView Segmentation Training")
    parser.add_argument("--config", type=str, default="ml/configs/default.yaml", help="Path to config YAML")
    parser.add_argument("--data_dir", type=str, required=True, help="Path to dataset directory")
    parser.add_argument("--val_dir", type=str, default=None, help="Separate validation directory (overrides split)")
    parser.add_argument("--output_dir", type=str, default="./runs/default", help="Output directory for checkpoints/logs")
    parser.add_argument("--resume", type=str, default=None, help="Path to checkpoint to resume from")
    parser.add_argument("--device", type=str, default=None, help="Device (cuda/cpu, auto-detected if not set)")
    args = parser.parse_args()

    # Load config
    with open(args.config) as f:
        config = yaml.safe_load(f)

    train_cfg = config["training"]
    data_cfg = config["data"]
    class_names = config.get("classes", {})
    num_classes = config["model"]["decoder"]["num_classes"]

    # Output dir
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    weights_dir = output_dir / "weights"
    weights_dir.mkdir(exist_ok=True)

    # Save config copy
    with open(output_dir / "config.yaml", "w") as f:
        yaml.dump(config, f)

    # Device
    if args.device:
        device = torch.device(args.device)
    else:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    # Dataset
    train_dataset = PalmViewDataset(
        data_dir=args.data_dir,
        image_size=data_cfg.get("image_size", 512),
        augmentation=data_cfg.get("augmentation", True),
        format=data_cfg.get("format", "simple"),
        num_classes=num_classes,
    )

    if args.val_dir:
        # Separate validation directory
        val_dataset = PalmViewDataset(
            data_dir=args.val_dir,
            image_size=data_cfg.get("image_size", 512),
            augmentation=False,
            format=data_cfg.get("format", "simple"),
            num_classes=num_classes,
        )
        train_ds = train_dataset
        val_ds = val_dataset
    else:
        # Split from single directory
        n = len(train_dataset)
        train_n = int(n * data_cfg.get("train_split", 0.8))
        val_n = n - train_n
        train_ds, val_ds = random_split(train_dataset, [train_n, val_n])

    train_loader = DataLoader(
        train_ds,
        batch_size=train_cfg.get("batch_size", 8),
        shuffle=True,
        num_workers=data_cfg.get("num_workers", 4),
        pin_memory=data_cfg.get("pin_memory", True),
        drop_last=True,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=train_cfg.get("batch_size", 8),
        shuffle=False,
        num_workers=data_cfg.get("num_workers", 4),
        pin_memory=data_cfg.get("pin_memory", True),
    )

    print(f"Dataset: {len(train_ds)} train / {len(val_ds)} val")

    # Model
    model = PalmViewModel(config).to(device)
    trainable = model.get_trainable_params()
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in trainable)
    print(f"Model: {total_params:,} params ({trainable_params:,} trainable)")

    # Loss
    criterion = nn.CrossEntropyLoss(ignore_index=255)

    # Optimizer
    opt_name = train_cfg.get("optimizer", "adamw")
    lr = train_cfg.get("learning_rate", 1e-4)
    wd = train_cfg.get("weight_decay", 0.01)
    if opt_name == "adamw":
        optimizer = torch.optim.AdamW(trainable, lr=lr, weight_decay=wd)
    elif opt_name == "adam":
        optimizer = torch.optim.Adam(trainable, lr=lr, weight_decay=wd)
    elif opt_name == "sgd":
        optimizer = torch.optim.SGD(trainable, lr=lr, weight_decay=wd, momentum=0.9)
    else:
        raise ValueError(f"Unknown optimizer: {opt_name}")

    # Scheduler
    epochs = train_cfg.get("epochs", 50)
    warmup = train_cfg.get("warmup_epochs", 5)
    sched_name = train_cfg.get("scheduler", "cosine")

    if sched_name == "cosine":
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs - warmup)
    elif sched_name == "step":
        scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size=15, gamma=0.1)
    else:
        scheduler = None

    # Resume
    start_epoch = 0
    best_miou = 0.0
    if args.resume:
        ckpt = torch.load(args.resume, map_location=device)
        model.load_state_dict(ckpt["model_state_dict"], strict=False)
        optimizer.load_state_dict(ckpt["optimizer_state_dict"])
        start_epoch = ckpt.get("epoch", 0) + 1
        best_miou = ckpt.get("best_miou", 0.0)
        print(f"Resumed from epoch {start_epoch}, best mIoU={best_miou:.4f}")

    # CSV logger
    csv_path = output_dir / "metrics.csv"
    csv_file = open(csv_path, "w", newline="")
    csv_writer = csv.writer(csv_file)
    csv_writer.writerow(["epoch", "train_loss", "train_miou", "train_acc", "val_loss", "val_miou", "val_acc", "lr"])

    train_metrics = SegmentationMetrics(num_classes)
    val_metrics = SegmentationMetrics(num_classes)
    patience_counter = 0
    early_stop = train_cfg.get("early_stopping", 0)

    print(f"\nStarting training for {epochs} epochs...")
    print(f"Classes: {class_names}")
    print("-" * 70)

    for epoch in range(start_epoch, epochs):
        t0 = time.time()

        # Warmup LR
        if epoch < warmup:
            warmup_lr = lr * (epoch + 1) / warmup
            for pg in optimizer.param_groups:
                pg["lr"] = warmup_lr

        # Train
        train_stats = train_one_epoch(model, train_loader, criterion, optimizer, device, train_metrics)

        # Validate
        val_stats = validate(model, val_loader, criterion, device, val_metrics)

        # Step scheduler (after warmup)
        if scheduler and epoch >= warmup:
            scheduler.step()

        current_lr = optimizer.param_groups[0]["lr"]
        elapsed = time.time() - t0

        # Log
        print(
            f"Epoch {epoch+1:3d}/{epochs} | "
            f"Train loss={train_stats['loss']:.4f} mIoU={train_stats['miou']:.4f} | "
            f"Val loss={val_stats['loss']:.4f} mIoU={val_stats['miou']:.4f} acc={val_stats['pixel_acc']:.4f} | "
            f"lr={current_lr:.2e} | {elapsed:.1f}s"
        )

        csv_writer.writerow([
            epoch + 1,
            f"{train_stats['loss']:.6f}",
            f"{train_stats['miou']:.6f}",
            f"{train_stats['pixel_acc']:.6f}",
            f"{val_stats['loss']:.6f}",
            f"{val_stats['miou']:.6f}",
            f"{val_stats['pixel_acc']:.6f}",
            f"{current_lr:.2e}",
        ])
        csv_file.flush()

        # Save checkpoint
        ckpt = {
            "epoch": epoch,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "train_stats": train_stats,
            "val_stats": val_stats,
            "best_miou": best_miou,
            "config": config,
        }

        torch.save(ckpt, weights_dir / "last.pt")

        if val_stats["miou"] > best_miou:
            best_miou = val_stats["miou"]
            ckpt["best_miou"] = best_miou
            torch.save(ckpt, weights_dir / "best.pt")
            print(f"  ★ New best mIoU: {best_miou:.4f}")
            patience_counter = 0
        else:
            patience_counter += 1

        if early_stop > 0 and patience_counter >= early_stop:
            print(f"Early stopping after {patience_counter} epochs without improvement.")
            break

    csv_file.close()
    print(f"\nTraining complete. Best mIoU: {best_miou:.4f}")
    print(f"Checkpoints saved to: {weights_dir}")
    print(f"Metrics log: {csv_path}")


if __name__ == "__main__":
    main()
