# PalmView Data Acquisition API

## 架构总览

```
/api/data/
├── gee/              # Google Earth Engine (Sentinel-2, Landsat, MODIS)
│   ├── status        # GEE 连接状态
│   ├── collections   # 可用数据集列表
│   ├── search        # 按区域+时间搜索影像
│   ├── thumbnail     # 生成缩略图
│   ├── export        # 下载 GeoTIFF
│   └── index         # 计算光谱指数 (NDVI, EVI, NDWI)
│
├── stac/             # STAC 标准接口 (Planetary Computer, Earth Search, Copernicus)
│   ├── providers     # 可用 STAC 数据源
│   ├── collections   # 按 provider 列出数据集
│   ├── search        # 搜索影像
│   ├── item          # 获取单张影像元数据
│   ├── download      # 下载 asset
│   └── tile-url      # COG tile URL
│
├── planet/           # Planet Labs API (TODO - Phase 2)
│   ├── search        # PlanetScope / SkySat 搜索
│   ├── order         # 下单获取影像
│   └── download      # 下载已完成订单
│
├── training/         # 训练数据管理
│   ├── datasets      # 已注册数据集列表
│   ├── download      # 下载公开数据集
│   └── status        # 下载进度
│
└── tiles/            # 统一 tile 管理
    ├── list          # 所有已索引 tiles
    ├── ingest        # 导入新 GeoTIFF
    ├── index         # 建立 CLIP 嵌入索引
    └── image/{id}    # 获取 tile PNG
```

## 已实现的端点

### GEE Service (`/api/data/gee/`)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/status` | GEE 连接状态 | ✅ |
| GET | `/collections` | 常用数据集列表 | ✅ |
| GET | `/search` | 搜索影像 (bbox, date, cloud) | ✅ |
| GET | `/image/{id}` | 影像元数据 | ✅ |
| GET | `/thumbnail` | 生成缩略图 URL | ✅ |
| GET | `/export` | 下载 GeoTIFF URL | ✅ |
| GET | `/index` | 计算光谱指数 | ✅ |

### STAC Service (`/api/data/stac/`)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/providers` | 列出 STAC providers | ✅ |
| GET | `/{provider}/collections` | 列出数据集 | ✅ |
| GET | `/{provider}/search` | 搜索影像 | ✅ |
| GET | `/{provider}/.../item` | 获取影像详情 | ✅ |
| POST | `/{provider}/.../download` | 下载 asset | ✅ |
| GET | `/{provider}/.../tile-url` | COG tile URL | ✅ |

### Search + Tiles (`/api/search/`)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/status` | 搜索服务状态 | ✅ |
| POST | `/build` | 建立 tile 嵌入索引 | ✅ |
| POST | `/text` | 文本语义搜索 | ✅ |
| POST | `/dense` | 密集子区域搜索 + 边界提取 | ✅ |
| GET | `/dense/heatmap/{file}` | 相似度热力图 PNG | ✅ |
| GET | `/tiles` | 列出所有已索引 tiles | ✅ |
| GET | `/tile-image/{file}` | Tile PNG 渲染 | ✅ |
| GET | `/regions` | 列出已索引区域 | ✅ |

### Training Data (`/api/data/training/`) — NEW

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/datasets` | 列出可用训练数据集 | 🔜 |
| POST | `/download/{dataset_id}` | 下载公开数据集 | 🔜 |
| GET | `/download/{task_id}/status` | 下载进度 | 🔜 |

## 数据集注册表

```yaml
datasets:
  # Level 1: Sentinel-2 (10m)
  - id: johor-s2
    name: Johor Sentinel-2 SR
    source: gee
    collection: COPERNICUS/S2_SR_HARMONIZED
    resolution: 10m
    bands: [B4, B3, B2, B8]
    regions: [kota_tinggi, kulai, pengerang]
    status: downloaded  # 56 tiles, 79MB

  # Level 2: High-res satellite
  - id: oilpalmuav
    name: Oil Palm UAV Dataset (MDPI 2022)
    source: url
    url: https://zenodo.org/records/...
    resolution: 5cm
    annotations: 56614 trees (YOLO format)
    status: pending

  - id: roboflow-palm
    name: Palm Tree Detection (Roboflow)
    source: roboflow
    resolution: mixed
    annotations: 4000+ images
    status: pending

  # Level 3: Drone / Very High Res
  - id: ts-cnn-palm
    name: TS-CNN Oil Palm Coordinates
    source: url
    resolution: 0.6m (QuickBird)
    annotations: 5000 tree coordinates
    status: pending
```

## 统一下载流程

```python
# 1. GEE 数据（Sentinel-2）
POST /api/data/gee/export
  → {"image_id": "COPERNICUS/S2_SR_HARMONIZED/...", "bbox": [...], "scale": 10}
  → Returns: download URL

# 2. STAC 数据（Planetary Computer 等）
POST /api/data/stac/{provider}/{collection}/{item}/download
  → {"asset_key": "visual", "output_dir": "data/..."}
  → Returns: local file path

# 3. 训练数据集
POST /api/data/training/download/oilpalmuav
  → Background task: download + extract + register
  → GET /api/data/training/download/{task_id}/status
  → {"status": "downloading", "progress": 45.2}
```
