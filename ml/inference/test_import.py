#!/usr/bin/env python3

"""
Test script to verify that all SAM2 dependencies are working correctly.
"""

import sys

def test_imports():
    """Test all required imports"""
    try:
        print("Testing basic imports...")
        import numpy as np
        import cv2
        import torch
        import rasterio
        from PIL import Image
        print("✓ Basic imports successful")
        
        print(f"PyTorch version: {torch.__version__}")
        print(f"CUDA available: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            print(f"CUDA device: {torch.cuda.get_device_name(0)}")
            print(f"CUDA memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
        
        print("\nTesting SAM2 imports...")
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor
        print("✓ SAM2 imports successful")
        
        print("\nTesting FastAPI imports...")
        from fastapi import FastAPI
        import uvicorn
        print("✓ FastAPI imports successful")
        
        print("\nAll imports successful! SAM2 server should work.")
        return True
        
    except ImportError as e:
        print(f"✗ Import error: {e}")
        return False
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    success = test_imports()
    sys.exit(0 if success else 1)