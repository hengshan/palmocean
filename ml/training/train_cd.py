#!/usr/bin/env python3
"""
Training script for Change Detection (BIT-CD) model

This script trains the BIT-CD model on LEVIR-CD or synthetic dataset.

Usage:
    python train_cd.py --data_path data/levir-cd --epochs 100 --batch_size 8
"""

import argparse
import os
import sys
from pathlib import Path
import json
import time
from datetime import datetime

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
import torchvision.transforms as transforms
from torch.utils.tensorboard import SummaryWriter

import numpy as np
from PIL import Image
from tqdm import tqdm
from sklearn.metrics import f1_score, precision_score, recall_score, jaccard_score

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from models.change_detection.bit_cd import build_bit_cd


class ChangeDetectionDataset(Dataset):
    """Dataset for change detection"""
    
    def __init__(self, data_path, split='train', transform=None, img_size=256):
        self.data_path = Path(data_path) / split
        self.transform = transform
        self.img_size = img_size
        
        # Get all image files
        self.image_files = sorted(list((self.data_path / 'A').glob('*.png')))
        
        print(f"Found {len(self.image_files)} samples in {split} split")
        
    def __len__(self):
        return len(self.image_files)
    
    def __getitem__(self, idx):
        # Get image filename
        img_name = self.image_files[idx].name
        
        # Load images
        img_a_path = self.data_path / 'A' / img_name
        img_b_path = self.data_path / 'B' / img_name
        label_path = self.data_path / 'label' / img_name
        
        img_a = Image.open(img_a_path).convert('RGB')
        img_b = Image.open(img_b_path).convert('RGB')
        label = Image.open(label_path).convert('L')
        
        # Resize if necessary
        if img_a.size != (self.img_size, self.img_size):
            img_a = img_a.resize((self.img_size, self.img_size), Image.BILINEAR)
            img_b = img_b.resize((self.img_size, self.img_size), Image.BILINEAR)
            label = label.resize((self.img_size, self.img_size), Image.NEAREST)
        
        # Apply transforms
        if self.transform:
            # Apply same transform to both images and label
            seed = np.random.randint(0, 2**32)
            
            torch.manual_seed(seed)
            img_a = self.transform(img_a)
            
            torch.manual_seed(seed)
            img_b = self.transform(img_b)
            
            torch.manual_seed(seed)
            label = transforms.ToTensor()(label)
        else:
            img_a = transforms.ToTensor()(img_a)
            img_b = transforms.ToTensor()(img_b)
            label = transforms.ToTensor()(label)
        
        # Convert label to binary (0/1) and then to long for CrossEntropy
        label = (label > 0.5).long().squeeze(0)  # [H, W]
        
        return img_a, img_b, label, img_name


class DiceLoss(nn.Module):
    """Dice Loss for segmentation"""
    
    def __init__(self, smooth=1e-6):
        super().__init__()
        self.smooth = smooth
    
    def forward(self, pred, target):
        # pred: [B, C, H, W], target: [B, H, W]
        pred = torch.softmax(pred, dim=1)
        
        if pred.size(1) == 2:  # Binary classification
            pred = pred[:, 1]  # Take positive class
        else:
            pred = pred[:, 0]  # Take background class
            
        target = target.float()
        
        intersection = (pred * target).sum(dim=(1, 2))
        union = pred.sum(dim=(1, 2)) + target.sum(dim=(1, 2))
        
        dice = (2 * intersection + self.smooth) / (union + self.smooth)
        return 1 - dice.mean()


class CombinedLoss(nn.Module):
    """Combined BCE/CE + Dice Loss"""
    
    def __init__(self, alpha=0.5):
        super().__init__()
        self.alpha = alpha
        self.ce_loss = nn.CrossEntropyLoss()
        self.dice_loss = DiceLoss()
    
    def forward(self, pred, target):
        ce = self.ce_loss(pred, target)
        dice = self.dice_loss(pred, target)
        return self.alpha * ce + (1 - self.alpha) * dice


def calculate_metrics(pred_masks, true_masks):
    """Calculate evaluation metrics"""
    # Convert to numpy
    if isinstance(pred_masks, torch.Tensor):
        pred_masks = pred_masks.cpu().numpy()
    if isinstance(true_masks, torch.Tensor):
        true_masks = true_masks.cpu().numpy()
    
    # Flatten
    pred_flat = pred_masks.flatten()
    true_flat = true_masks.flatten()
    
    # Calculate metrics
    f1 = f1_score(true_flat, pred_flat, average='binary', zero_division=0)
    precision = precision_score(true_flat, pred_flat, average='binary', zero_division=0)
    recall = recall_score(true_flat, pred_flat, average='binary', zero_division=0)
    iou = jaccard_score(true_flat, pred_flat, average='binary', zero_division=0)
    
    return {
        'f1': f1,
        'precision': precision,
        'recall': recall,
        'iou': iou
    }


def train_epoch(model, dataloader, criterion, optimizer, device, epoch):
    """Train for one epoch"""
    model.train()
    running_loss = 0.0
    all_preds = []
    all_targets = []
    
    pbar = tqdm(dataloader, desc=f'Epoch {epoch+1} [Train]')
    
    for batch_idx, (img_a, img_b, target, _) in enumerate(pbar):
        img_a, img_b, target = img_a.to(device), img_b.to(device), target.to(device)
        
        optimizer.zero_grad()
        
        # Forward pass
        output = model(img_a, img_b)
        loss = criterion(output, target)
        
        # Backward pass
        loss.backward()
        optimizer.step()
        
        running_loss += loss.item()
        
        # Get predictions for metrics
        with torch.no_grad():
            pred = torch.argmax(output, dim=1)
            all_preds.append(pred.cpu())
            all_targets.append(target.cpu())
        
        # Update progress bar
        pbar.set_postfix({'loss': loss.item()})
    
    # Calculate metrics
    all_preds = torch.cat(all_preds, dim=0)
    all_targets = torch.cat(all_targets, dim=0)
    metrics = calculate_metrics(all_preds, all_targets)
    
    avg_loss = running_loss / len(dataloader)
    
    return avg_loss, metrics


def validate_epoch(model, dataloader, criterion, device, epoch):
    """Validate for one epoch"""
    model.eval()
    running_loss = 0.0
    all_preds = []
    all_targets = []
    
    pbar = tqdm(dataloader, desc=f'Epoch {epoch+1} [Val]')
    
    with torch.no_grad():
        for batch_idx, (img_a, img_b, target, _) in enumerate(pbar):
            img_a, img_b, target = img_a.to(device), img_b.to(device), target.to(device)
            
            # Forward pass
            output = model(img_a, img_b)
            loss = criterion(output, target)
            
            running_loss += loss.item()
            
            # Get predictions for metrics
            pred = torch.argmax(output, dim=1)
            all_preds.append(pred.cpu())
            all_targets.append(target.cpu())
            
            # Update progress bar
            pbar.set_postfix({'loss': loss.item()})
    
    # Calculate metrics
    all_preds = torch.cat(all_preds, dim=0)
    all_targets = torch.cat(all_targets, dim=0)
    metrics = calculate_metrics(all_preds, all_targets)
    
    avg_loss = running_loss / len(dataloader)
    
    return avg_loss, metrics


def save_checkpoint(model, optimizer, epoch, metrics, checkpoint_path, is_best=False):
    """Save model checkpoint"""
    checkpoint = {
        'epoch': epoch,
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'metrics': metrics
    }
    
    torch.save(checkpoint, checkpoint_path)
    
    if is_best:
        best_path = checkpoint_path.parent / 'best_model.pth'
        torch.save(checkpoint, best_path)
        print(f"Best model saved to {best_path}")


def main():
    parser = argparse.ArgumentParser(description='Train BIT-CD model')
    parser.add_argument('--data_path', default='data/levir-cd', 
                       help='Path to dataset')
    parser.add_argument('--output_dir', default='outputs/cd_training',
                       help='Output directory for checkpoints and logs')
    parser.add_argument('--batch_size', type=int, default=8, 
                       help='Batch size')
    parser.add_argument('--epochs', type=int, default=100,
                       help='Number of epochs')
    parser.add_argument('--lr', type=float, default=1e-4,
                       help='Learning rate')
    parser.add_argument('--img_size', type=int, default=256,
                       help='Input image size')
    parser.add_argument('--backbone', default='resnet18',
                       choices=['resnet18', 'resnet34'],
                       help='Backbone network')
    parser.add_argument('--num_classes', type=int, default=2,
                       help='Number of classes')
    parser.add_argument('--device', default='cuda',
                       help='Device to use')
    parser.add_argument('--resume', type=str, default=None,
                       help='Resume training from checkpoint')
    parser.add_argument('--save_freq', type=int, default=10,
                       help='Save checkpoint every N epochs')
    
    args = parser.parse_args()
    
    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Setup device
    device = torch.device(args.device if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    # Create model
    model_config = {
        'img_size': args.img_size,
        'num_classes': args.num_classes,
        'backbone': args.backbone,
        'embed_dim': 256,
        'num_heads': 8,
        'num_layers': 4,
        'dropout': 0.1
    }
    
    model = build_bit_cd(model_config)
    model = model.to(device)
    
    # Print model info
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Total parameters: {total_params:,}")
    print(f"Trainable parameters: {trainable_params:,}")
    
    # Data transforms
    train_transform = transforms.Compose([
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomVerticalFlip(p=0.5),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.1),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    val_transform = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    # Create datasets
    train_dataset = ChangeDetectionDataset(args.data_path, 'train', train_transform, args.img_size)
    val_dataset = ChangeDetectionDataset(args.data_path, 'val', val_transform, args.img_size)
    
    # Create dataloaders
    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, 
                             shuffle=True, num_workers=4, pin_memory=True)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size,
                           shuffle=False, num_workers=4, pin_memory=True)
    
    # Loss and optimizer
    criterion = CombinedLoss(alpha=0.5)
    optimizer = optim.Adam(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='max', 
                                                    factor=0.5, patience=10)
    
    # Setup logging
    writer = SummaryWriter(output_dir / 'tensorboard')
    
    # Resume training if checkpoint provided
    start_epoch = 0
    best_f1 = 0.0
    
    if args.resume:
        checkpoint = torch.load(args.resume, map_location=device)
        model.load_state_dict(checkpoint['model_state_dict'])
        optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        start_epoch = checkpoint['epoch'] + 1
        best_f1 = checkpoint['metrics'].get('f1', 0.0)
        print(f"Resumed training from epoch {start_epoch}, best F1: {best_f1:.4f}")
    
    # Training loop
    print("Starting training...")
    
    for epoch in range(start_epoch, args.epochs):
        epoch_start = time.time()
        
        # Train
        train_loss, train_metrics = train_epoch(model, train_loader, criterion, 
                                               optimizer, device, epoch)
        
        # Validate
        val_loss, val_metrics = validate_epoch(model, val_loader, criterion, 
                                             device, epoch)
        
        # Learning rate scheduling
        scheduler.step(val_metrics['f1'])
        
        # Logging
        epoch_time = time.time() - epoch_start
        
        print(f"\nEpoch {epoch+1}/{args.epochs} ({epoch_time:.1f}s)")
        print(f"Train - Loss: {train_loss:.4f}, F1: {train_metrics['f1']:.4f}, "
              f"IoU: {train_metrics['iou']:.4f}")
        print(f"Val   - Loss: {val_loss:.4f}, F1: {val_metrics['f1']:.4f}, "
              f"IoU: {val_metrics['iou']:.4f}")
        
        # TensorBoard logging
        writer.add_scalar('Loss/Train', train_loss, epoch)
        writer.add_scalar('Loss/Val', val_loss, epoch)
        writer.add_scalar('Metrics/Train_F1', train_metrics['f1'], epoch)
        writer.add_scalar('Metrics/Val_F1', val_metrics['f1'], epoch)
        writer.add_scalar('Metrics/Train_IoU', train_metrics['iou'], epoch)
        writer.add_scalar('Metrics/Val_IoU', val_metrics['iou'], epoch)
        writer.add_scalar('LR', optimizer.param_groups[0]['lr'], epoch)
        
        # Save checkpoint
        is_best = val_metrics['f1'] > best_f1
        if is_best:
            best_f1 = val_metrics['f1']
        
        if (epoch + 1) % args.save_freq == 0 or is_best:
            checkpoint_path = output_dir / f'checkpoint_epoch_{epoch+1}.pth'
            save_checkpoint(model, optimizer, epoch, val_metrics, 
                          checkpoint_path, is_best)
    
    print(f"\nTraining completed! Best validation F1: {best_f1:.4f}")
    
    # Save final model
    final_path = output_dir / 'final_model.pth'
    torch.save(model.state_dict(), final_path)
    print(f"Final model saved to {final_path}")
    
    # Save training config
    config_path = output_dir / 'config.json'
    config = vars(args)
    config.update(model_config)
    config['best_f1'] = best_f1
    
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    
    writer.close()


if __name__ == "__main__":
    main()