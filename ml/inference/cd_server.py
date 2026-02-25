"""
Change Detection Inference Server

A FastAPI server that provides BIT-CD change detection capabilities.
Runs independently and serves change detection endpoints:
- /segment/change-detection: Bi-temporal change detection

Handles GeoTIFF coordinate transformations and returns GeoJSON results.
"""

import os
import logging
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
import uuid
import json
from datetime import datetime

import numpy as np
import cv2
import rasterio
from rasterio.warp import transform
from rasterio.crs import CRS
import torch
import torch.nn.functional as F
from PIL import Image
import torchvision.transforms as transforms
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add parent directory to path for imports
import sys
sys.path.append(str(Path(__file__).parent.parent))

from models.change_detection.bit_cd import build_bit_cd

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Request models
class ChangeDetectionRequest(BaseModel):
    before_image: str  # Path to before image
    after_image: str   # Path to after image
    classes: Optional[List[str]] = ["unchanged", "changed"]
    threshold: Optional[float] = 0.5
    output_format: Optional[str] = "geojson"  # "geojson" or "raster"

# Global variables
app = FastAPI(title="Change Detection API", version="1.0.0")
model = None
device = None
transform_func = None

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def load_model(model_path: Optional[str] = None):
    """Load the BIT-CD model"""
    global model, device, transform_func
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    logger.info(f"Using device: {device}")
    
    # Model configuration
    model_config = {
        'img_size': 256,
        'num_classes': 2,
        'backbone': 'resnet18',
        'embed_dim': 256,
        'num_heads': 8,
        'num_layers': 4,
        'dropout': 0.1
    }
    
    model = build_bit_cd(model_config)
    
    # Load checkpoint if provided
    if model_path and os.path.exists(model_path):
        checkpoint = torch.load(model_path, map_location=device)
        if 'model_state_dict' in checkpoint:
            model.load_state_dict(checkpoint['model_state_dict'])
        else:
            model.load_state_dict(checkpoint)
        logger.info(f"Loaded model from {model_path}")
    else:
        logger.info("Using pretrained model (no checkpoint loaded)")
    
    model = model.to(device)
    model.eval()
    
    # Image preprocessing
    transform_func = transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    logger.info("Model loaded successfully")

def load_image(image_path: str) -> Tuple[np.ndarray, Dict]:
    """Load image and return array + metadata"""
    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail=f"Image not found: {image_path}")
    
    try:
        # Try loading as GeoTIFF first
        with rasterio.open(image_path) as src:
            image = src.read()
            if image.shape[0] == 1:  # Grayscale
                image = np.repeat(image, 3, axis=0)
            elif image.shape[0] > 3:  # Multi-band, take first 3
                image = image[:3]
            
            # Transpose to H, W, C
            image = np.transpose(image, (1, 2, 0))
            
            metadata = {
                'transform': src.transform,
                'crs': src.crs,
                'width': src.width,
                'height': src.height,
                'bounds': src.bounds
            }
            
            return image, metadata
            
    except Exception as e:
        logger.warning(f"Failed to read as GeoTIFF: {e}, trying as regular image")
        
        # Fallback to PIL
        image = Image.open(image_path).convert('RGB')
        image = np.array(image)
        
        # Create dummy metadata
        metadata = {
            'transform': None,
            'crs': None,
            'width': image.shape[1],
            'height': image.shape[0],
            'bounds': None
        }
        
        return image, metadata

def preprocess_image(image: np.ndarray) -> torch.Tensor:
    """Preprocess image for model input"""
    # Normalize to 0-1
    if image.dtype == np.uint16:
        image = (image / 65535.0 * 255).astype(np.uint8)
    elif image.dtype != np.uint8:
        image = (image * 255).astype(np.uint8)
    
    # Convert to PIL and apply transforms
    pil_image = Image.fromarray(image)
    tensor = transform_func(pil_image)
    
    return tensor.unsqueeze(0)  # Add batch dimension

def predict_change(before_tensor: torch.Tensor, after_tensor: torch.Tensor, 
                  threshold: float = 0.5) -> Tuple[torch.Tensor, torch.Tensor]:
    """Predict change between two images"""
    with torch.no_grad():
        before_tensor = before_tensor.to(device)
        after_tensor = after_tensor.to(device)
        
        # Model prediction
        output = model(before_tensor, after_tensor)  # [B, C, H, W]
        
        # Get probabilities
        probs = F.softmax(output, dim=1)  # [B, C, H, W]
        
        # Binary change mask (probability of change)
        change_prob = probs[0, 1]  # [H, W] - probability of change class
        change_mask = (change_prob > threshold).float()  # [H, W] - binary mask
        
        return change_mask.cpu(), change_prob.cpu()

def mask_to_geojson(mask: np.ndarray, metadata: Dict, classes: List[str]) -> Dict:
    """Convert change mask to GeoJSON features"""
    import cv2
    
    # Ensure mask is binary
    binary_mask = (mask > 0.5).astype(np.uint8)
    
    # Find contours
    contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    features = []
    
    for i, contour in enumerate(contours):
        # Simplify contour
        epsilon = 0.02 * cv2.arcLength(contour, True)
        simplified = cv2.approxPolyDP(contour, epsilon, True)
        
        if len(simplified) < 3:
            continue
        
        # Convert pixel coordinates to geographic coordinates
        coordinates = []
        
        if metadata['transform'] and metadata['crs']:
            # GeoTIFF case
            for point in simplified:
                x, y = point[0]
                # Transform pixel to geographic coordinates
                geo_x, geo_y = rasterio.transform.xy(metadata['transform'], y, x)
                coordinates.append([geo_x, geo_y])
        else:
            # Regular image case (use pixel coordinates)
            for point in simplified:
                x, y = point[0]
                coordinates.append([float(x), float(y)])
        
        # Close the polygon
        if coordinates and coordinates[0] != coordinates[-1]:
            coordinates.append(coordinates[0])
        
        # Create feature
        feature = {
            "type": "Feature",
            "properties": {
                "change_type": "changed",  # Could be expanded to multi-class
                "area_pixels": float(cv2.contourArea(contour)),
                "detection_id": str(uuid.uuid4()),
                "confidence": 1.0  # Could use probability from model
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [coordinates]
            }
        }
        
        features.append(feature)
    
    # Create GeoJSON
    geojson = {
        "type": "FeatureCollection",
        "features": features,
        "properties": {
            "timestamp": datetime.now().isoformat(),
            "model": "BIT-CD",
            "total_changes": len(features),
            "image_metadata": {
                "crs": str(metadata['crs']) if metadata['crs'] else None,
                "bounds": metadata['bounds']
            }
        }
    }
    
    return geojson

@app.on_event("startup")
async def startup_event():
    """Initialize model on startup"""
    model_path = os.environ.get('CD_MODEL_PATH', None)
    load_model(model_path)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "model_loaded": model is not None}

@app.post("/segment/change-detection")
async def change_detection(request: ChangeDetectionRequest):
    """
    Detect changes between two temporal images
    
    Returns GeoJSON FeatureCollection with detected changes
    """
    try:
        # Load images
        logger.info(f"Loading before image: {request.before_image}")
        before_image, before_meta = load_image(request.before_image)
        
        logger.info(f"Loading after image: {request.after_image}")
        after_image, after_meta = load_image(request.after_image)
        
        # Check image dimensions match
        if before_image.shape[:2] != after_image.shape[:2]:
            # Resize after image to match before image
            logger.warning("Image dimensions don't match, resizing...")
            h, w = before_image.shape[:2]
            after_image = cv2.resize(after_image, (w, h))
        
        # Preprocess images
        before_tensor = preprocess_image(before_image)
        after_tensor = preprocess_image(after_image)
        
        # Predict changes
        logger.info("Running change detection...")
        change_mask, change_prob = predict_change(before_tensor, after_tensor, request.threshold)
        
        # Convert to numpy
        change_mask_np = change_mask.numpy()
        change_prob_np = change_prob.numpy()
        
        # Resize mask back to original image size
        original_h, original_w = before_image.shape[:2]
        change_mask_resized = cv2.resize(change_mask_np, (original_w, original_h), 
                                       interpolation=cv2.INTER_NEAREST)
        
        # Convert to GeoJSON
        logger.info("Converting to GeoJSON...")
        geojson = mask_to_geojson(change_mask_resized, before_meta, request.classes)
        
        # Add summary statistics
        total_pixels = np.prod(change_mask_resized.shape)
        changed_pixels = np.sum(change_mask_resized > 0.5)
        change_percentage = (changed_pixels / total_pixels) * 100
        
        geojson["properties"].update({
            "change_statistics": {
                "total_pixels": int(total_pixels),
                "changed_pixels": int(changed_pixels),
                "change_percentage": float(change_percentage),
                "threshold": request.threshold
            }
        })
        
        logger.info(f"Change detection completed. Found {len(geojson['features'])} change regions")
        logger.info(f"Change percentage: {change_percentage:.2f}%")
        
        return geojson
        
    except Exception as e:
        logger.error(f"Error in change detection: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/model/info")
async def model_info():
    """Get model information"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    # Count parameters
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    
    return {
        "model_type": "BIT-CD",
        "architecture": "Bi-Temporal Image Transformer",
        "total_parameters": total_params,
        "trainable_parameters": trainable_params,
        "device": str(device),
        "input_size": getattr(model, 'img_size', 256),
        "num_classes": getattr(model, 'num_classes', 2)
    }

@app.post("/predict/batch")
async def batch_change_detection(requests: List[ChangeDetectionRequest]):
    """
    Process multiple change detection requests in batch
    """
    results = []
    
    for i, req in enumerate(requests):
        try:
            logger.info(f"Processing batch item {i+1}/{len(requests)}")
            result = await change_detection(req)
            results.append({
                "index": i,
                "status": "success",
                "result": result
            })
        except Exception as e:
            logger.error(f"Error processing batch item {i}: {str(e)}")
            results.append({
                "index": i,
                "status": "error",
                "error": str(e)
            })
    
    return {
        "total_requests": len(requests),
        "successful": sum(1 for r in results if r["status"] == "success"),
        "failed": sum(1 for r in results if r["status"] == "error"),
        "results": results
    }

if __name__ == "__main__":
    import uvicorn
    
    # Get port from environment or default
    port = int(os.environ.get("CD_SERVER_PORT", 8002))
    
    logger.info(f"Starting Change Detection server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)