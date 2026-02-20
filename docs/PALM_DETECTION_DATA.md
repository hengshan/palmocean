# 🌴 Palm Tree Detection — Training Data Sources

## Available Open-Source Datasets

### 1. CROPTD (Cross-Regional Oil Palm Tree Detection)
- **URL**: https://github.com/rs-dl/CROPTD
- **Paper**: Cross-regional oil palm tree counting and detection (ISPRS 2020)
- **Data**: QuickBird satellite imagery, bounding box annotations per tree
- **Coverage**: South Malaysia (Johor area — our target market!)
- **Resolution**: ~0.6m (QuickBird)
- **Use**: Individual tree detection training
- **Priority**: ⭐⭐⭐ HIGH — directly relevant to our use case

### 2. Roboflow Oil Palm Detection
- **URL**: https://universe.roboflow.com/manfred-michael/oil-palm-detection/dataset/6
- **Data**: 4,063 annotated images, multiple export formats (YOLO, COCO, etc.)
- **Use**: Quick prototyping with YOLOv8
- **Priority**: ⭐⭐⭐ HIGH — easiest to get started

### 3. WiDS Datathon 2019 (Oil Palm Plantations)
- **Source**: Planet satellite imagery (3m resolution)
- **Data**: ~20k 256x256 pixel chips, binary classification (oil-palm vs other)
- **Use**: Plantation-level segmentation (not individual trees)
- **Priority**: ⭐⭐ MEDIUM — good for PalmView Stage 1 (plantation mapping)

### 4. GEE Oil Palm Plantation Layers
- **URL**: https://gee-community-catalog.org/projects/oil-palm/
- **Data**: Sentinel-2 (10m), 3 classes (industrial, smallholder, other)
- **Coverage**: Global
- **Use**: Large-scale plantation boundary detection
- **Priority**: ⭐⭐ MEDIUM — free, integrates with our existing GEE pipeline

### 5. MDPI Large-Scale Detection (Li et al. 2018)
- **Paper**: https://www.mdpi.com/2072-4292/11/1/11
- **Data**: QuickBird imagery, south Malaysia
- **Method**: Two-stage CNN
- **Priority**: ⭐ Reference — methodology and benchmark

## Recommended Training Strategy

### Phase A — Quick MVP (Week 1-2)
1. Download Roboflow dataset (4k images, YOLO format)
2. Fine-tune YOLOv8x on palm tree detection
3. Integrate into PalmView inference pipeline
4. Demo-ready in days

### Phase B — Production Model (Week 3-6)
1. Download CROPTD dataset (South Malaysia, high-res)
2. Combine with Roboflow data for larger training set
3. Train with Prithvi-EO encoder + detection head
4. Add health classification (healthy/stressed/dead/young)

### Phase C — Proprietary Data (Ongoing)
1. Partner with SD Guthrie for real plantation imagery
2. Drone flights over Johor plantations
3. Active learning: use model to pre-annotate, humans verify
4. Build competitive moat through proprietary training data

## Model Architecture Options

| Approach | Pros | Cons | Recommended |
|----------|------|------|-------------|
| **YOLOv8x** | Fast, well-tested, easy export | Less accurate on small trees | Phase A ✅ |
| **RT-DETR** | Better accuracy, transformer-based | Slower | Phase B |
| **Prithvi-EO + Det Head** | Leverages our existing encoder | More complex integration | Phase B ✅ |
| **SAM2 + prompting** | Zero-shot capable | Needs per-image prompts | Interactive mode |

---
*Created: 2026-02-19 by Lyra*
