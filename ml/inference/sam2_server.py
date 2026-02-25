"""
SAM2 Inference Server

A FastAPI server that provides SAM2 segmentation capabilities.
Runs independently on port 8001 and serves three endpoints:
- /segment/point: Point-based segmentation
- /segment/box: Box-based segmentation  
- /segment/auto: Automatic segmentation

Handles GeoTIFF coordinate transformations from pixel to geographic coordinates.
"""

import os
import logging
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
import uuid

import numpy as np
import cv2
import rasterio
from rasterio.warp import transform
import torch
import torch.nn.functional as F
from PIL import Image
import torchvision.transforms as transforms
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import json
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to import PalmViewModel for semantic segmentation
try:
    import sys
    _project_root = str(Path(__file__).resolve().parent.parent.parent)
    if _project_root not in sys.path:
        sys.path.insert(0, _project_root)
    from ml.models.palmview_model import PalmViewModel
    import yaml
    SEMANTIC_MODEL_AVAILABLE = True
except ImportError as _e:
    logger.warning(f"PalmViewModel not available: {_e}. Semantic segmentation will not work.")
    SEMANTIC_MODEL_AVAILABLE = False

# Try to import BIT-CD model
try:
    from models.change_detection.bit_cd import build_bit_cd
    CD_MODEL_AVAILABLE = True
except ImportError:
    logger.warning("BIT-CD model not available. Change detection endpoints will not work.")
    CD_MODEL_AVAILABLE = False

# Request models
class PointSegmentRequest(BaseModel):
    image_path: str
    lng: float
    lat: float
    label: int = 1

class BoxSegmentRequest(BaseModel):
    image_path: str
    min_lng: float
    min_lat: float
    max_lng: float
    max_lat: float

class AutoSegmentRequest(BaseModel):
    image_path: str
    bbox: Optional[List[float]] = None  # [min_lng, min_lat, max_lng, max_lat]

class SemanticSegmentRequest(BaseModel):
    image_path: str
    classes: List[str] = ["building"]
    bbox: Optional[List[float]] = None  # [min_lng, min_lat, max_lng, max_lat]

class ChangeDetectionRequest(BaseModel):
    before_image: str  # Path to before image
    after_image: str   # Path to after image
    classes: Optional[List[str]] = ["unchanged", "changed"]
    threshold: Optional[float] = 0.5
    output_format: Optional[str] = "geojson"  # "geojson" or "raster"

class SAM2Inference:
    """SAM2 model inference handler"""
    
    def __init__(self):
        self.model = None
        self.predictor = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {self.device}")
    
    def load_model(self, model_name: str = "facebook/sam2.1-hiera-large"):
        """Load SAM2 model"""
        try:
            # Try to import SAM2
            try:
                from sam2.build_sam import build_sam2
                from sam2.sam2_image_predictor import SAM2ImagePredictor
            except ImportError:
                # Fallback for different SAM2 installations
                from segment_anything_2 import build_sam2, SAM2ImagePredictor
            
            # Model configuration mapping
            model_configs = {
                "facebook/sam2.1-hiera-large": "configs/sam2.1/sam2.1_hiera_l.yaml",
                "facebook/sam2.1-hiera-base-plus": "configs/sam2.1/sam2.1_hiera_b+.yaml",
            }
            
            config_path = model_configs.get(model_name, "configs/sam2.1/sam2.1_hiera_l.yaml")
            
            # Build model
            self.model = build_sam2(config_path, ckpt_path=None, device=self.device)
            self.predictor = SAM2ImagePredictor(self.model)
            
            logger.info(f"SAM2 model loaded successfully: {model_name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load SAM2 model: {e}")
            return False
    
    def load_image_with_geo_info(self, image_path: str) -> Tuple[np.ndarray, Dict]:
        """Load image and extract geographic information"""
        try:
            if image_path.lower().endswith(('.tif', '.tiff')):
                # GeoTIFF file
                with rasterio.open(image_path) as src:
                    # Read image data
                    image_data = src.read()
                    
                    # Convert to RGB if needed
                    if image_data.shape[0] == 3:
                        # RGB channels
                        image = np.transpose(image_data, (1, 2, 0))
                    elif image_data.shape[0] == 1:
                        # Single channel, convert to RGB
                        image = np.repeat(image_data[0][:, :, np.newaxis], 3, axis=2)
                    else:
                        # Multi-spectral, take first 3 channels
                        image = np.transpose(image_data[:3], (1, 2, 0))
                    
                    # Normalize to 0-255 if needed
                    if image.dtype != np.uint8:
                        image = ((image - image.min()) / (image.max() - image.min()) * 255).astype(np.uint8)
                    
                    # Geographic info
                    geo_info = {
                        'transform': src.transform,
                        'crs': src.crs,
                        'bounds': src.bounds,
                        'width': src.width,
                        'height': src.height
                    }
                    
                    return image, geo_info
            else:
                # Regular image file
                image = cv2.imread(image_path)
                if image is None:
                    raise ValueError(f"Could not read image: {image_path}")
                
                image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                
                # No geographic info for regular images
                geo_info = {
                    'transform': None,
                    'crs': None,
                    'bounds': None,
                    'width': image.shape[1],
                    'height': image.shape[0]
                }
                
                return image, geo_info
                
        except Exception as e:
            logger.error(f"Error loading image {image_path}: {e}")
            raise HTTPException(status_code=400, detail=f"Failed to load image: {e}")
    
    def geo_to_pixel(self, lng: float, lat: float, geo_info: Dict) -> Tuple[int, int]:
        """Convert geographic coordinates to pixel coordinates"""
        if geo_info['transform'] is None:
            # No geographic info, assume image coordinates
            return int(lng), int(lat)
        
        try:
            # Use rasterio transform to convert coordinates
            from rasterio.transform import rowcol
            row, col = rowcol(geo_info['transform'], lng, lat)
            return int(col), int(row)  # Return as (x, y)
        except Exception as e:
            logger.error(f"Error converting coordinates: {e}")
            return int(lng), int(lat)
    
    def pixel_to_geo(self, x: int, y: int, geo_info: Dict) -> Tuple[float, float]:
        """Convert pixel coordinates to geographic coordinates"""
        if geo_info['transform'] is None:
            # No geographic info, return pixel coordinates
            return float(x), float(y)
        
        try:
            # Use rasterio transform to convert coordinates
            lng, lat = rasterio.transform.xy(geo_info['transform'], y, x)
            return float(lng), float(lat)
        except Exception as e:
            logger.error(f"Error converting pixel to geo: {e}")
            return float(x), float(y)
    
    def mask_to_geojson_polygon(self, mask: np.ndarray, geo_info: Dict) -> List[List[float]]:
        """Convert binary mask to GeoJSON polygon coordinates"""
        # Find contours
        contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return []
        
        # Get the largest contour
        largest_contour = max(contours, key=cv2.contourArea)
        
        # Simplify contour
        epsilon = 0.02 * cv2.arcLength(largest_contour, True)
        approx_contour = cv2.approxPolyDP(largest_contour, epsilon, True)
        
        # Convert to coordinates
        coordinates = []
        for point in approx_contour:
            x, y = point[0][0], point[0][1]
            lng, lat = self.pixel_to_geo(x, y, geo_info)
            coordinates.append([lng, lat])
        
        # Close the polygon
        if coordinates and coordinates[0] != coordinates[-1]:
            coordinates.append(coordinates[0])
        
        return coordinates
    
    async def segment_point(self, image_path: str, lng: float, lat: float, label: int = 1) -> Dict[str, Any]:
        """Perform point-based segmentation"""
        if self.predictor is None:
            raise HTTPException(status_code=500, detail="SAM2 model not loaded")
        
        try:
            # Load image and geo info
            image, geo_info = self.load_image_with_geo_info(image_path)
            
            # Convert geographic coordinates to pixel coordinates
            point_x, point_y = self.geo_to_pixel(lng, lat, geo_info)
            
            # Set image in predictor
            self.predictor.set_image(image)
            
            # Predict
            input_points = np.array([[point_x, point_y]])
            input_labels = np.array([label])
            
            masks, scores, _ = self.predictor.predict(
                point_coords=input_points,
                point_labels=input_labels,
                multimask_output=True,
            )
            
            # Convert masks to GeoJSON features
            features = []
            for i, (mask, score) in enumerate(zip(masks, scores)):
                if score > 0.5:  # Filter by confidence
                    coords = self.mask_to_geojson_polygon(mask, geo_info)
                    if coords:
                        feature = {
                            "type": "Feature",
                            "id": str(uuid.uuid4()),
                            "geometry": {
                                "type": "Polygon",
                                "coordinates": [coords],
                            },
                            "properties": {
                                "id": str(uuid.uuid4()),
                                "confidence": float(score),
                                "area_pixels": int(np.sum(mask)),
                                "class": "segmented_object",
                            },
                        }
                        features.append(feature)
            
            return {
                "type": "FeatureCollection",
                "features": features,
                "_stats": {"count": len(features)},
            }
            
        except Exception as e:
            logger.error(f"Error in point segmentation: {e}")
            raise HTTPException(status_code=500, detail=f"Segmentation failed: {str(e)}")
    
    async def segment_box(self, image_path: str, min_lng: float, min_lat: float, 
                         max_lng: float, max_lat: float) -> Dict[str, Any]:
        """Perform box-based segmentation"""
        if self.predictor is None:
            raise HTTPException(status_code=500, detail="SAM2 model not loaded")
        
        try:
            # Load image and geo info
            image, geo_info = self.load_image_with_geo_info(image_path)
            
            # Convert geographic box to pixel coordinates
            min_x, max_y = self.geo_to_pixel(min_lng, min_lat, geo_info)
            max_x, min_y = self.geo_to_pixel(max_lng, max_lat, geo_info)
            
            # Set image in predictor
            self.predictor.set_image(image)
            
            # Predict with bounding box
            input_box = np.array([min_x, min_y, max_x, max_y])
            
            masks, scores, _ = self.predictor.predict(
                box=input_box,
                multimask_output=True,
            )
            
            # Convert masks to GeoJSON features
            features = []
            for i, (mask, score) in enumerate(zip(masks, scores)):
                if score > 0.5:  # Filter by confidence
                    coords = self.mask_to_geojson_polygon(mask, geo_info)
                    if coords:
                        feature = {
                            "type": "Feature",
                            "id": str(uuid.uuid4()),
                            "geometry": {
                                "type": "Polygon",
                                "coordinates": [coords],
                            },
                            "properties": {
                                "id": str(uuid.uuid4()),
                                "confidence": float(score),
                                "area_pixels": int(np.sum(mask)),
                                "class": "segmented_object",
                            },
                        }
                        features.append(feature)
            
            return {
                "type": "FeatureCollection",
                "features": features,
                "_stats": {"count": len(features)},
            }
            
        except Exception as e:
            logger.error(f"Error in box segmentation: {e}")
            raise HTTPException(status_code=500, detail=f"Segmentation failed: {str(e)}")
    
    async def segment_auto(self, image_path: str, bbox: Optional[List[float]] = None) -> Dict[str, Any]:
        """Perform automatic segmentation"""
        if self.predictor is None:
            raise HTTPException(status_code=500, detail="SAM2 model not loaded")
        
        try:
            # Load image and geo info
            image, geo_info = self.load_image_with_geo_info(image_path)
            
            # Set image in predictor
            self.predictor.set_image(image)
            
            # For automatic segmentation, we'll use a grid of points
            height, width = image.shape[:2]
            
            if bbox:
                # Convert bbox to pixel coordinates
                min_x, max_y = self.geo_to_pixel(bbox[0], bbox[1], geo_info)
                max_x, min_y = self.geo_to_pixel(bbox[2], bbox[3], geo_info)
            else:
                min_x, min_y = 0, 0
                max_x, max_y = width, height
            
            # Generate grid of points
            grid_size = 32  # Adjust based on image size
            x_points = np.linspace(min_x, max_x, grid_size)
            y_points = np.linspace(min_y, max_y, grid_size)
            
            features = []
            processed_areas = np.zeros((height, width), dtype=bool)
            
            for x in x_points:
                for y in y_points:
                    x, y = int(x), int(y)
                    if 0 <= x < width and 0 <= y < height and not processed_areas[y, x]:
                        
                        input_points = np.array([[x, y]])
                        input_labels = np.array([1])
                        
                        try:
                            masks, scores, _ = self.predictor.predict(
                                point_coords=input_points,
                                point_labels=input_labels,
                                multimask_output=False,
                            )
                            
                            if scores[0] > 0.7:  # Higher threshold for auto segmentation
                                mask = masks[0]
                                processed_areas |= mask
                                
                                coords = self.mask_to_geojson_polygon(mask, geo_info)
                                if coords and len(coords) > 3:  # Valid polygon
                                    feature = {
                                        "type": "Feature",
                                        "id": str(uuid.uuid4()),
                                        "geometry": {
                                            "type": "Polygon",
                                            "coordinates": [coords],
                                        },
                                        "properties": {
                                            "id": str(uuid.uuid4()),
                                            "confidence": float(scores[0]),
                                            "area_pixels": int(np.sum(mask)),
                                            "class": "auto_segmented",
                                        },
                                    }
                                    features.append(feature)
                                    
                        except Exception as e:
                            logger.warning(f"Failed to process point ({x}, {y}): {e}")
                            continue
            
            return {
                "type": "FeatureCollection",
                "features": features,
                "_stats": {"count": len(features)},
            }
            
        except Exception as e:
            logger.error(f"Error in auto segmentation: {e}")
            raise HTTPException(status_code=500, detail=f"Segmentation failed: {str(e)}")

# Initialize FastAPI app
app = FastAPI(title="SAM2 Inference Server", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize SAM2 inference
sam2_inference = SAM2Inference()

# Semantic segmentation globals
semantic_model = None
semantic_device = None
semantic_transform = None
SEMANTIC_CLASS_MAP = {}

def load_semantic_model(model_path: Optional[str] = None, config_path: Optional[str] = None):
    """Load the PalmViewModel for semantic segmentation"""
    global semantic_model, semantic_device, semantic_transform, SEMANTIC_CLASS_MAP

    if not SEMANTIC_MODEL_AVAILABLE:
        logger.warning("PalmViewModel not available")
        return False

    try:
        semantic_device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        config_path = config_path or os.path.join(_project_root, 'ml/configs/building_rgb.yaml')
        model_path = model_path or os.path.join(_project_root, 'runs/building_v1/weights/best.pt')

        if not os.path.exists(config_path):
            logger.warning(f"Semantic config not found: {config_path}")
            return False

        with open(config_path) as f:
            cfg = yaml.safe_load(f)

        SEMANTIC_CLASS_MAP = cfg.get('classes', {0: 'background', 1: 'building'})

        if os.path.exists(model_path):
            semantic_model = PalmViewModel.from_checkpoint(model_path, config_path)
            logger.info(f"Loaded semantic model from {model_path}")
        else:
            semantic_model = PalmViewModel.from_config_file(config_path)
            logger.warning(f"Checkpoint not found at {model_path}, using random weights")

        semantic_model = semantic_model.to(semantic_device)
        semantic_model.eval()

        semantic_transform = transforms.Compose([
            transforms.Resize((256, 256)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])

        logger.info("Semantic segmentation model loaded successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to load semantic model: {e}")
        return False

# Change Detection globals
cd_model = None
cd_device = None
cd_transform = None

def load_cd_model(model_path: Optional[str] = None):
    """Load the BIT-CD model"""
    global cd_model, cd_device, cd_transform
    
    if not CD_MODEL_AVAILABLE:
        logger.warning("BIT-CD model not available")
        return False
    
    try:
        cd_device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        logger.info(f"Loading Change Detection model on {cd_device}")
        
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
        
        cd_model = build_bit_cd(model_config)
        
        # Load checkpoint if provided
        if model_path and os.path.exists(model_path):
            checkpoint = torch.load(model_path, map_location=cd_device)
            if 'model_state_dict' in checkpoint:
                cd_model.load_state_dict(checkpoint['model_state_dict'])
            else:
                cd_model.load_state_dict(checkpoint)
            logger.info(f"Loaded CD model from {model_path}")
        else:
            logger.info("Using pretrained CD model (no checkpoint loaded)")
        
        cd_model = cd_model.to(cd_device)
        cd_model.eval()
        
        # Image preprocessing
        cd_transform = transforms.Compose([
            transforms.Resize((256, 256)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        logger.info("Change Detection model loaded successfully")
        return True
        
    except Exception as e:
        logger.error(f"Failed to load Change Detection model: {e}")
        return False

@app.on_event("startup")
async def startup_event():
    """Initialize the model on startup"""
    logger.info("Starting SAM2 Inference Server...")
    
    # Try to load SAM2 model
    model_name = os.environ.get("SAM2_MODEL", "facebook/sam2.1-hiera-large")
    success = sam2_inference.load_model(model_name)
    
    if not success:
        logger.warning("Failed to load SAM2 model. Server will start but inference will fail.")
    else:
        logger.info("SAM2 model loaded successfully!")
    
    # Try to load Semantic Segmentation model
    sem_model_path = os.environ.get('SEMANTIC_MODEL_PATH', None)
    sem_config_path = os.environ.get('SEMANTIC_CONFIG_PATH', None)
    sem_success = load_semantic_model(sem_model_path, sem_config_path)
    if sem_success:
        logger.info("Semantic segmentation model loaded successfully!")
    else:
        logger.warning("Semantic segmentation model not available")

    # Try to load Change Detection model
    cd_model_path = os.environ.get('CD_MODEL_PATH', None)
    cd_success = load_cd_model(cd_model_path)
    
    if cd_success:
        logger.info("Change Detection model loaded successfully!")
    else:
        logger.warning("Change Detection model not available")
    
    logger.info("Server startup completed!")

def load_image_cd(image_path: str) -> Tuple[np.ndarray, Dict]:
    """Load image and return array + metadata for change detection"""
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

def preprocess_image_cd(image: np.ndarray) -> torch.Tensor:
    """Preprocess image for change detection model input"""
    # Normalize to 0-1
    if image.dtype == np.uint16:
        image = (image / 65535.0 * 255).astype(np.uint8)
    elif image.dtype != np.uint8:
        image = (image * 255).astype(np.uint8)
    
    # Convert to PIL and apply transforms
    pil_image = Image.fromarray(image)
    tensor = cd_transform(pil_image)
    
    return tensor.unsqueeze(0)  # Add batch dimension

def predict_change_cd(before_tensor: torch.Tensor, after_tensor: torch.Tensor, 
                     threshold: float = 0.5) -> Tuple[torch.Tensor, torch.Tensor]:
    """Predict change between two images"""
    with torch.no_grad():
        before_tensor = before_tensor.to(cd_device)
        after_tensor = after_tensor.to(cd_device)
        
        # Model prediction
        output = cd_model(before_tensor, after_tensor)  # [B, C, H, W]
        
        # Get probabilities
        probs = F.softmax(output, dim=1)  # [B, C, H, W]
        
        # Binary change mask (probability of change)
        change_prob = probs[0, 1]  # [H, W] - probability of change class
        change_mask = (change_prob > threshold).float()  # [H, W] - binary mask
        
        return change_mask.cpu(), change_prob.cpu()

def mask_to_geojson_cd(mask: np.ndarray, metadata: Dict, classes: List[str]) -> Dict:
    """Convert change mask to GeoJSON features"""
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

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "sam2_model_loaded": sam2_inference.predictor is not None,
        "semantic_model_loaded": semantic_model is not None,
        "cd_model_loaded": cd_model is not None,
        "sam2_device": sam2_inference.device,
        "semantic_device": str(semantic_device) if semantic_device else None,
        "cd_device": str(cd_device) if cd_device else None,
    }

@app.post("/segment/point")
async def segment_point(request: PointSegmentRequest):
    """Point-based segmentation endpoint"""
    return await sam2_inference.segment_point(
        request.image_path, request.lng, request.lat, request.label
    )

@app.post("/segment/box")
async def segment_box(request: BoxSegmentRequest):
    """Box-based segmentation endpoint"""
    return await sam2_inference.segment_box(
        request.image_path, request.min_lng, request.min_lat, 
        request.max_lng, request.max_lat
    )

@app.post("/segment/auto")
async def segment_auto(request: AutoSegmentRequest):
    """Automatic segmentation endpoint"""
    return await sam2_inference.segment_auto(request.image_path, request.bbox)

@app.post("/segment/semantic")
async def segment_semantic(request: SemanticSegmentRequest):
    """
    Semantic segmentation using trained PalmViewModel.
    Returns GeoJSON FeatureCollection with class-labeled polygons.
    """
    if semantic_model is None:
        raise HTTPException(status_code=503, detail="Semantic segmentation model not available")

    try:
        image_path = request.image_path
        if not os.path.exists(image_path):
            raise HTTPException(status_code=404, detail=f"Image not found: {image_path}")

        # Load image and geo info (reuse SAM2's loader)
        image, geo_info = sam2_inference.load_image_with_geo_info(image_path)
        original_h, original_w = image.shape[:2]

        # Preprocess
        pil_image = Image.fromarray(image)
        input_tensor = semantic_transform(pil_image).unsqueeze(0).to(semantic_device)

        # Inference
        with torch.no_grad():
            logits = semantic_model(input_tensor)  # [1, C, 256, 256]
            probs = torch.softmax(logits, dim=1)
            pred = logits.argmax(dim=1)[0].cpu().numpy()  # [256, 256]
            prob_map = probs[0].cpu().numpy()  # [C, 256, 256]

        # Resize prediction back to original size
        pred_resized = cv2.resize(pred.astype(np.uint8), (original_w, original_h),
                                  interpolation=cv2.INTER_NEAREST)
        # Resize prob map
        prob_resized = np.zeros((prob_map.shape[0], original_h, original_w), dtype=np.float32)
        for c in range(prob_map.shape[0]):
            prob_resized[c] = cv2.resize(prob_map[c], (original_w, original_h),
                                         interpolation=cv2.INTER_LINEAR)

        # Convert each requested class to polygons
        # Build reverse map: class_name -> class_index
        name_to_idx = {v: int(k) for k, v in SEMANTIC_CLASS_MAP.items()}

        features = []
        for cls_name in request.classes:
            cls_idx = name_to_idx.get(cls_name)
            if cls_idx is None or cls_idx == 0:  # skip background or unknown
                continue

            binary_mask = (pred_resized == cls_idx).astype(np.uint8)
            if binary_mask.sum() == 0:
                continue

            # Find contours
            contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for contour in contours:
                if cv2.contourArea(contour) < 20:  # skip tiny regions
                    continue

                epsilon = 0.015 * cv2.arcLength(contour, True)
                simplified = cv2.approxPolyDP(contour, epsilon, True)

                if len(simplified) < 3:
                    continue

                coordinates = []
                for point in simplified:
                    x, y = int(point[0][0]), int(point[0][1])
                    lng, lat = sam2_inference.pixel_to_geo(x, y, geo_info)
                    coordinates.append([lng, lat])
                if coordinates and coordinates[0] != coordinates[-1]:
                    coordinates.append(coordinates[0])

                # Mean confidence for this contour region
                mask_region = np.zeros((original_h, original_w), dtype=np.uint8)
                cv2.drawContours(mask_region, [contour], -1, 1, -1)
                mean_conf = float(np.mean(prob_resized[cls_idx][mask_region > 0])) if mask_region.sum() > 0 else 0.5

                feature = {
                    "type": "Feature",
                    "id": str(uuid.uuid4()),
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [coordinates],
                    },
                    "properties": {
                        "id": str(uuid.uuid4()),
                        "confidence": round(mean_conf, 3),
                        "area_pixels": int(cv2.contourArea(contour)),
                        "class": cls_name,
                    },
                }
                features.append(feature)

        total_area = sum(f["properties"].get("area_pixels", 0) for f in features)
        return {
            "type": "FeatureCollection",
            "features": features,
            "_stats": {"count": len(features), "total_area": float(total_area)},
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in semantic segmentation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/segment/change-detection")
async def change_detection(request: ChangeDetectionRequest):
    """
    Detect changes between two temporal images
    
    Returns GeoJSON FeatureCollection with detected changes
    """
    if not CD_MODEL_AVAILABLE or cd_model is None:
        raise HTTPException(status_code=503, detail="Change detection model not available")
    
    try:
        # Load images
        logger.info(f"Loading before image: {request.before_image}")
        before_image, before_meta = load_image_cd(request.before_image)
        
        logger.info(f"Loading after image: {request.after_image}")
        after_image, after_meta = load_image_cd(request.after_image)
        
        # Check image dimensions match
        if before_image.shape[:2] != after_image.shape[:2]:
            # Resize after image to match before image
            logger.warning("Image dimensions don't match, resizing...")
            h, w = before_image.shape[:2]
            after_image = cv2.resize(after_image, (w, h))
        
        # Preprocess images
        before_tensor = preprocess_image_cd(before_image)
        after_tensor = preprocess_image_cd(after_image)
        
        # Predict changes
        logger.info("Running change detection...")
        change_mask, change_prob = predict_change_cd(before_tensor, after_tensor, request.threshold)
        
        # Convert to numpy
        change_mask_np = change_mask.numpy()
        change_prob_np = change_prob.numpy()
        
        # Resize mask back to original image size
        original_h, original_w = before_image.shape[:2]
        change_mask_resized = cv2.resize(change_mask_np, (original_w, original_h), 
                                       interpolation=cv2.INTER_NEAREST)
        
        # Convert to GeoJSON
        logger.info("Converting to GeoJSON...")
        geojson = mask_to_geojson_cd(change_mask_resized, before_meta, request.classes)
        
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
    """Get model information for all available models"""
    info = {
        "sam2": {
            "loaded": sam2_inference.predictor is not None,
            "device": sam2_inference.device,
            "model_type": "SAM2"
        }
    }
    
    if semantic_model is not None:
        total_params = sum(p.numel() for p in semantic_model.parameters())
        info["semantic_segmentation"] = {
            "loaded": True,
            "model_type": "PalmViewModel",
            "classes": SEMANTIC_CLASS_MAP,
            "total_parameters": total_params,
            "device": str(semantic_device),
            "input_size": 256,
        }
    else:
        info["semantic_segmentation"] = {"loaded": False}

    if CD_MODEL_AVAILABLE and cd_model is not None:
        # Count parameters
        total_params = sum(p.numel() for p in cd_model.parameters())
        trainable_params = sum(p.numel() for p in cd_model.parameters() if p.requires_grad)
        
        info["change_detection"] = {
            "loaded": True,
            "model_type": "BIT-CD",
            "architecture": "Bi-Temporal Image Transformer",
            "total_parameters": total_params,
            "trainable_parameters": trainable_params,
            "device": str(cd_device),
            "input_size": getattr(cd_model, 'img_size', 256),
            "num_classes": getattr(cd_model, 'num_classes', 2)
        }
    else:
        info["change_detection"] = {
            "loaded": False,
            "error": "Model not available"
        }
    
    return info

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)