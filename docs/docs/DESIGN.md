# PALMVIEW — 地物智能提取与交互平台

## 🌍 项目愿景

一个**全栈 Web 应用**，让用户上传航片/卫片，通过自然语言或交互式 prompt（点击、框选、文本描述）智能提取地物（建筑物、太阳能板、道路、植被、水体等），并进行可视化、编辑、导出。

核心理念：**AI-assisted, Human-in-the-loop** — 模型做初步提取，用户做交互修正，形成闭环。

---

## 📊 竞品分析 & 借鉴

### 开源项目

| 项目 | 亮点 | 局限 |
|------|------|------|
| **SamGeo** (opengeos) | SAM3 + 地理空间, text/point/box prompt, GeoJSON 导出 | Jupyter-only, 无独立 Web UI |
| **GeoAI** (opengeos) | PyTorch segmentation, Overture Maps 集成 | 库级别, 非应用 |
| **TorchGeo** (Microsoft) | 丰富的遥感数据集 + 预训练模型 | 训练框架, 非终端产品 |
| **Raster Vision** (Azavea) | 端到端 pipeline (chip → train → predict → eval) | CLI 为主, 无交互 UI |
| **Leafmap** (Qiusheng Wu) | 交互式地图 + SAM 集成, Jupyter widgets | Notebook 体验, 非 Web App |
| **Label Studio** | 通用标注, 可扩展 ML backend | 非遥感专用, 无地图集成 |

### 商业产品

| 产品 | 亮点 | 参考价值 |
|------|------|---------|
| **Ecopia AI** | 高精度矢量化, 数字孪生 | 产品化思路, 地物分类体系 |
| **Mapflow.ai** | 一键检测建筑/道路/植被, Web 界面 | UX 设计, 任务化工作流 |
| **Picterra** | 无代码地物检测, 训练自定义检测器 | 交互训练流程, 少样本学习 |
| **Descartes Labs** | 地球观测平台, 大规模推理 | 平台架构, API 设计 |

### 🔑 我们的差异化

1. **自然语言 + 视觉 Prompt 融合** — 不只是点击/框选, 用户可以说 "提取所有屋顶太阳能板" 
2. **多模型管线** — Foundation Model (Prithvi/SAM) + 专用 UNet 微调模型, 按任务自动切换
3. **实时交互编辑** — 提取结果可立即手动修正, 修正反馈可用于模型微调
4. **Agent 架构** — 后端是一个 GeoAI Agent, 可以理解多步骤任务并自主执行

---

## 🧠 AI 模型架构

### 模型栈 (Model Stack)

```
┌─────────────────────────────────────────────────┐
│             PALMVIEW Model Pipeline             │
├─────────────────────────────────────────────────┤
│                                                   │
│  Layer 1: Foundation Models (Feature Extraction)  │
│  ┌─────────────┐  ┌──────────────┐               │
│  │ Prithvi-EO  │  │  SAM 2 / 3   │               │
│  │  2.0 (600M) │  │ (Segment      │               │
│  │ ViT-based   │  │  Anything)    │               │
│  └──────┬──────┘  └──────┬───────┘               │
│         │                │                        │
│  Layer 2: Task-Specific Decoders                  │
│  ┌──────────────────────────────────┐            │
│  │  UNet / TransUNet / Swin-UNet    │            │
│  │  (Semantic Segmentation Head)    │            │
│  │                                   │            │
│  │  Encoder: Frozen Foundation Model │            │
│  │  Decoder: UNet-style upsampling   │            │
│  │  Skip connections + attention     │            │
│  └──────────────────────────────────┘            │
│                                                   │
│  Layer 3: Prompt-Guided Segmentation              │
│  ┌──────────────────────────────────┐            │
│  │  CLIP/RemoteCLIP + SAM Fusion    │            │
│  │  Text → Embedding → Prompt →     │            │
│  │  Segmentation Mask               │            │
│  └──────────────────────────────────┘            │
│                                                   │
│  Layer 4: Post-Processing                         │
│  ┌──────────────────────────────────┐            │
│  │  CRF Refinement                   │            │
│  │  Polygon Simplification           │            │
│  │  Topology Correction              │            │
│  │  GeoJSON / Shapefile Export       │            │
│  └──────────────────────────────────┘            │
└─────────────────────────────────────────────────┘
```

### 关键模型选型

| 层次 | 模型 | 用途 | 备注 |
|------|------|------|------|
| **Foundation** | Prithvi-EO 2.0 | 多光谱遥感特征提取 | NASA/IBM, ViT, HuggingFace 开源 |
| **Foundation** | SAM 2/3 | 通用分割, 交互式 prompt | Meta, 点/框/文本 prompt |
| **Segmentation** | TransUNet | 语义分割 | Transformer encoder + UNet decoder |
| **Segmentation** | Swin-UNet | 高分辨率分割 | Swin Transformer + UNet, 效果好 |
| **Text-guided** | RemoteCLIP | 遥感文本-图像对齐 | 遥感领域 CLIP |
| **Detection** | YOLOv8/v9 | 目标检测 (太阳能板等) | 快速, 可做初筛 |
| **Refinement** | SkySense++ | 多模态融合 | Nature MI 2025, SOTA |

### 创新: Hybrid Encoder-Decoder

```python
# 概念架构
class PalmViewModel(nn.Module):
    def __init__(self):
        # Frozen foundation encoder
        self.encoder = Prithvi_EO_2_Encoder(pretrained=True, frozen=True)
        # Learnable adapter layers
        self.adapter = LoRA_Adapter(rank=16)
        # UNet-style decoder with attention
        self.decoder = TransUNet_Decoder(
            skip_channels=[256, 512, 1024, 2048],
            attention_type='cross'  # cross-attention with text embeddings
        )
        # Text prompt encoder
        self.text_encoder = RemoteCLIP_TextEncoder()
    
    def forward(self, image, text_prompt=None, point_prompts=None):
        features = self.encoder(image)
        features = self.adapter(features)
        if text_prompt:
            text_emb = self.text_encoder(text_prompt)
            masks = self.decoder(features, text_embedding=text_emb)
        else:
            masks = self.decoder(features)
        return masks
```

---

## 🏗️ 技术架构

### 整体架构图

```
┌─────────── Frontend (React/Next.js) ──────────────┐
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌───────────────────┐   │
│  │ MapView  │ │ ChatPanel│ │ ResultsPanel      │   │
│  │ (Deck.gl │ │ (NL      │ │ (GeoJSON viewer,  │   │
│  │  +MapLibre│ │ commands)│ │  statistics,      │   │
│  │  +Draw)  │ │          │ │  export options)   │   │
│  └──────────┘ └──────────┘ └───────────────────┘   │
│         │            │               │               │
│         └────────────┼───────────────┘               │
│                      │ WebSocket + REST              │
└──────────────────────┼───────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────┐
│          Backend (FastAPI + Python)                    │
│                      │                                │
│  ┌──────────────────────────────────────────┐        │
│  │           API Gateway / Router            │        │
│  └───┬──────────┬──────────┬────────────────┘        │
│      │          │          │                          │
│  ┌───▼──┐  ┌───▼──┐  ┌───▼──────────────┐          │
│  │Upload│  │Infer │  │  Agent Engine     │          │
│  │Svc   │  │Svc   │  │  (Task Planning,  │          │
│  │      │  │      │  │   Multi-step      │          │
│  │ S3/  │  │ GPU  │  │   Execution)      │          │
│  │ MinIO│  │ Queue│  │                    │          │
│  └──────┘  └──────┘  └───────────────────┘          │
│                │                                      │
│  ┌─────────────▼──────────────────────────┐          │
│  │         Model Serving Layer             │          │
│  │  ┌─────────┐ ┌──────┐ ┌──────────┐    │          │
│  │  │Prithvi  │ │ SAM3 │ │TransUNet │    │          │
│  │  │EO 2.0   │ │      │ │/SwinUNet │    │          │
│  │  └─────────┘ └──────┘ └──────────┘    │          │
│  │  Served via: TorchServe / Triton       │          │
│  └────────────────────────────────────────┘          │
│                                                       │
│  ┌────────────────────────────────────────┐          │
│  │         Data Layer                      │          │
│  │  PostgreSQL + PostGIS  │  Redis Cache   │          │
│  │  MinIO (imagery)       │  Celery Queue  │          │
│  └────────────────────────────────────────┘          │
└───────────────────────────────────────────────────────┘
```

### Tech Stack 详解

#### Frontend
| 组件 | 技术 | 理由 |
|------|------|------|
| **框架** | Next.js 14+ (App Router) | SSR, 文件路由, 生态成熟 |
| **地图引擎** | MapLibre GL JS + Deck.gl | 开源, 高性能WebGL渲染, 支持大规模矢量 |
| **绘图交互** | @mapbox/mapbox-gl-draw + 自定义 | 点/框/多边形 prompt 输入 |
| **UI 组件** | Shadcn/ui + Tailwind CSS | 美观, 可定制, 轻量 |
| **状态管理** | Zustand | 简单直观 |
| **实时通信** | WebSocket (Socket.io) | 推理进度推送, 实时协作 |
| **图表** | Recharts | 统计面板 |

#### Backend
| 组件 | 技术 | 理由 |
|------|------|------|
| **API 框架** | FastAPI | 异步, 类型安全, OpenAPI 自动文档 |
| **任务队列** | Celery + Redis | GPU 推理任务异步执行 |
| **模型服务** | NVIDIA Triton / TorchServe | 生产级模型服务, 支持多模型 |
| **数据库** | PostgreSQL + PostGIS | 空间查询, 矢量数据存储 |
| **对象存储** | MinIO (兼容 S3) | 本地部署, 存储影像 |
| **缓存** | Redis | Session, 结果缓存 |
| **容器化** | Docker Compose | 一键部署 |

#### AI/ML Stack
| 组件 | 技术 | 理由 |
|------|------|------|
| **深度学习** | PyTorch 2.x | 生态最佳 |
| **遥感工具** | TorchGeo + Rasterio + GDAL | 遥感数据处理标准 |
| **SAM** | segment-geospatial (samgeo) | SAM 的地理空间封装 |
| **Foundation** | Prithvi-EO 2.0 (HuggingFace) | 最强开源遥感 FM |
| **训练** | PyTorch Lightning | 简化训练流程 |
| **实验追踪** | MLflow / Weights & Biases | 模型版本管理 |

---

## 🎨 界面设计 & 用户旅程

### 主界面布局

```
┌─────────────────────────────────────────────────────┐
│  🌍 PALMVIEW              [Projects ▾] [User ▾]   │
├─────────┬───────────────────────────────┬───────────┤
│         │                               │           │
│  Layer  │       MAP VIEWPORT            │  Results  │
│  Panel  │    (MapLibre + Deck.gl)       │  Panel    │
│         │                               │           │
│ ☐ Sat   │   ┌───────────────────┐       │ 📊 Stats  │
│ ☐ Build │   │  Detection Result │       │           │
│ ☐ Solar │   │  overlaid on map  │       │ Buildings │
│ ☐ Road  │   │                   │       │  → 1,247  │
│ ☐ Veg   │   │                   │       │ Solar     │
│         │   └───────────────────┘       │  → 89     │
│ Tools   │                               │ Area      │
│ ─────── │                               │  → 2.3km² │
│ 📍 Point│                               │           │
│ ☐ Box   │                               │ [Export ▾]│
│ 🔷 Poly │                               │ GeoJSON   │
│ 💬 Text │                               │ Shapefile │
│         │                               │ KML       │
├─────────┴───────────────────────────────┴───────────┤
│  💬 Chat: "Extract all solar panels in this area"   │
│  [________________________________________________] │
└─────────────────────────────────────────────────────┘
```

### 用户旅程 (User Journey)

```
1️⃣ 上传或选区
   用户上传 GeoTIFF/航片  ──或──  在地图上框选区域 (自动拉取卫片)
                │
2️⃣ 选择提取目标
   ├── 点击预设类别 (建筑物、太阳能板、道路、水体、植被)
   ├── 自然语言描述 ("找出所有蓝色屋顶的建筑")
   └── 交互式 prompt (在地图上点击/框选目标样本)
                │
3️⃣ AI 推理
   系统自动选择最优模型管线 → 显示进度条 → 结果叠加在地图上
                │
4️⃣ 交互审核 & 修正
   ├── 查看检测结果 (高亮 + 透明遮罩)
   ├── 点击误检 → 删除
   ├── 手动补画漏检区域
   └── 调整置信度阈值 (slider)
                │
5️⃣ 统计 & 导出
   ├── 查看统计 (数量、面积、分布热力图)
   ├── 导出 GeoJSON / Shapefile / KML / CSV
   └── 保存为项目 (可回溯, 可分享)
```

### 关键交互细节

- **Prompt 模式切换**: 左侧工具栏一键切换 Point/Box/Polygon/Text prompt
- **实时预览**: 用户画框/点击时, SAM 实时返回预分割结果 (< 200ms)
- **置信度热力图**: 用颜色表示模型的确信程度, 红色 = 不确定需要人工审核
- **批量操作**: 框选多个结果进行批量确认/删除/重分类
- **时序对比**: 上传不同时间的影像, 自动做变化检测

---

## 📡 新加坡样例数据源

### 免费/开源数据

| 数据源 | 分辨率 | 类型 | 获取方式 |
|--------|--------|------|---------|
| **Sentinel-2** (ESA) | 10m | 多光谱 (13 bands) | Copernicus Open Access Hub / GEE |
| **Landsat 8/9** (USGS) | 30m (pan 15m) | 多光谱 | USGS EarthExplorer |
| **OneMap Singapore** | ~0.5m | 正射影像 tile | OneMap API (XYZ tiles) |
| **OpenAerialMap** | 变化 | RGB 航片 | openaerialmap.org 搜索 Singapore |
| **Google Earth Engine** | 多种 | 合成影像 | GEE Python API |
| **Overture Maps** | N/A | 建筑物 footprint 矢量 | DuckDB 直接下载 |

### 推荐实验数据集

| 数据集 | 说明 | 适用任务 |
|--------|------|---------|
| **SpaceNet** (Buildings) | 全球多城市高分辨率建筑物标注 | 建筑物提取 |
| **DOTA** | 遥感目标检测, 旋转框 | 目标检测 |
| **iSAID** | 大规模实例分割 | 语义/实例分割 |
| **Inria Aerial** | 建筑物语义分割, 多城市 | 建筑物分割 |
| **AIRS** (Aerial Imagery for Roof Segmentation) | 屋顶分割 | 太阳能板候选区 |
| **DeepGlobe** | 道路提取 + 建筑物 + 土地利用 | 多任务 |

### 新加坡特色

- **OneMap XYZ Tiles**: 可直接作为底图 + 高分辨率参考
- **data.gov.sg**: 新加坡开放数据门户, 有 Master Plan 分区数据
- **Sentinel-2 over Singapore**: 通过 GEE 获取 cloud-free 合成图
- **Overture Maps**: 获取新加坡所有建筑物 footprint 作为 ground truth

---

## 🚀 MVP 路线图 (分阶段)

### Phase 1: 基础功能 (2-3 周)
- [ ] FastAPI 后端骨架 + PostgreSQL/PostGIS
- [ ] Next.js 前端 + MapLibre 地图
- [ ] 影像上传 + 预览
- [ ] SAM3 集成: 点击/框选 → 分割
- [ ] GeoJSON 导出

### Phase 2: 智能提取 (2-3 周)
- [ ] Prithvi-EO 集成 (特征提取)
- [ ] TransUNet decoder (建筑物/道路语义分割)
- [ ] 文本 prompt → RemoteCLIP → SAM
- [ ] 结果可视化 (叠加层 + 统计)

### Phase 3: 交互体验 (2 周)
- [ ] 结果编辑 (删除/添加/修改)
- [ ] 置信度阈值调节
- [ ] 项目管理 (保存/加载)
- [ ] 批量导出 (多格式)

### Phase 4: 高级功能 (持续)
- [ ] 自然语言对话式交互
- [ ] 变化检测 (多时相对比)
- [ ] 自定义模型训练 (few-shot fine-tuning)
- [ ] 协作功能

---

## 💡 技术亮点总结

1. **Foundation Model + Task Decoder** — 不从零训练, 站在巨人肩膀上
2. **多模态 Prompt** — 点/框/多边形/自然语言, 用户选最顺手的
3. **实时交互** — SAM 的快速推理 + WebSocket 实时反馈
4. **GeoAI Agent** — 后端不只是 API, 是能理解意图并编排多步骤的智能体
5. **新加坡本地化** — OneMap 集成, 本地数据适配

---

*Generated by IRIS 🌈 for Hank's PALMVIEW project*
*2025-07-11*
