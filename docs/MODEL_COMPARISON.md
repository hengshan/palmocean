# Detection & Segmentation Model Comparison for PalmView

## 模型族谱：三大流派

```
┌─────────────────────────────────────────────────────────────┐
│                    Object Detection 模型                     │
├──────────────────┬──────────────────┬───────────────────────┤
│   CNN 流派       │  Transformer 流派 │   混合 / 基础模型      │
│   (快, 轻量)     │  (准, 全局理解)   │   (通用, 灵活)        │
├──────────────────┼──────────────────┼───────────────────────┤
│  YOLOv8          │  RT-DETR         │  SAM2 / SAM3          │
│  YOLOv11         │  RF-DETR ⭐      │  Grounding DINO       │
│  YOLOv12         │  Co-DETR         │  Florence-2           │
│                  │  DINO-DETR       │                       │
├──────────────────┼──────────────────┼───────────────────────┤
│                  Segmentation 模型                           │
├──────────────────┼──────────────────┼───────────────────────┤
│  U-Net (CNN)     │  SegFormer       │  SAM2 (Promptable)    │
│  DeepLabV3+      │  Swin-UNet       │  SAM3 (Auto)          │
│  TransUNet (混合)│  Mask2Former     │  Segment Anything     │
└──────────────────┴──────────────────┴───────────────────────┘
```

## 逐个分析

### YOLO 家族（v8 → v11 → v12）

| 版本 | 发布 | 架构 | COCO mAP | 速度 | 关键特性 |
|------|------|------|----------|------|----------|
| **YOLOv8** | 2023.01 | Pure CNN (CSPNet + C2f) | 53.9 | ⚡⚡⚡ | Ultralytics 生态, 最成熟 |
| **YOLOv11** | 2024.09 | CNN + Attention (C3k2) | 54.7 | ⚡⚡⚡ | 轻量化, 更好的小目标 |
| **YOLOv12** | 2025.02 | CNN + Self-Attention 混合 | 55.2 | ⚡⚡ | NeurIPS 2025, Attention-Centric |

**共同特点：**
- 单阶段检测器，端到端
- Ultralytics API 统一接口（`from ultralytics import YOLO`）
- 支持 detection / segmentation / pose / classify 多任务
- 训练简单，社区生态好

**选择建议：**
- YOLOv8: 最稳定，生产环境首选
- YOLOv11: 性价比最高（更快更准）
- YOLOv12: 最新最强，但生态还在追赶

### DETR 家族（RT-DETR → RF-DETR）

| 模型 | 发布 | 架构 | COCO mAP | 速度 | 关键特性 |
|------|------|------|----------|------|----------|
| **RT-DETR** | 2023.04 | Transformer encoder-decoder | 54.8 | ⚡⚡ | 百度, 首个实时DETR |
| **RF-DETR** | 2025.03 | Transformer (DINOv2 backbone) | **60.5** | ⚡⚡ | ICLR 2026, **COCO SOTA** |

**RF-DETR 为什么特别：**
- 基于 DINOv2 视觉基础模型做 backbone → 预训练知识丰富
- **小目标检测显著优于 YOLO** — 这对棕榈树和太阳能板很关键
- 专门为 fine-tuning 优化（少量数据就能训好）
- Roboflow 出品，跟我们的数据源无缝对接

### SAM 家族（SAM → SAM2 → SAM3）

| 模型 | 发布 | 架构 | 任务 | 关键特性 |
|------|------|------|------|----------|
| **SAM** | 2023.04 | ViT encoder + mask decoder | Promptable 分割 | 开创性, 零样本 |
| **SAM2** | 2024.07 | Hiera encoder + memory | 图像+视频分割 | 更快, 支持视频 |
| **SAM3** | 2025.11 | ViT + 多模态 decoder | 零样本+指令分割 | 自然语言提示 |

**SAM 系列不是检测器！** 它们是：
- **分割模型**：给定提示（点/框/文本）→ 输出精确 mask
- 不做分类，不做定位
- 适合做检测 pipeline 的后处理（先检测框 → 再用 SAM 精细分割）

### UNet 家族

| 模型 | 架构 | 用途 |
|------|------|------|
| **U-Net** | Pure CNN (encoder-decoder + skip connections) | 语义分割 |
| **TransUNet** | CNN encoder + Transformer + UNet decoder | 语义分割 (混合) |
| **Swin-UNet** | Pure Transformer (Swin blocks) | 语义分割 |
| **SegFormer** | Transformer encoder + MLP decoder | 语义分割 |

**UNet vs YOLO 的根本区别：**
- UNet: **像素级分割** — "这个像素是棕榈树还是背景"
- YOLO: **目标检测** — "这里有一棵树，框在这"

## 🌴 棕榈树检测：最优方案

### 需求分析
- 目标很小（树冠 8-10m, 在 0.5m 影像上只有 ~16-20 像素）
- 密集排列（一张图几百棵）
- 需要单棵树级别的定位 + 计数
- 背景相对单一（绿色植被）

### 推荐方案：RF-DETR > YOLOv11 > YOLOv8

**为什么 RF-DETR 最优：**

1. **小目标能力最强** — DINOv2 backbone 的全局注意力能捕获小树冠
2. **密集目标处理好** — Transformer 的集合预测避免了 NMS 的漏检
3. **少样本 fine-tune 效果好** — 我们的 Roboflow 数据 ~10k 张足够
4. **COCO mAP 60.5** — 绝对性能最高

**备选 YOLOv11 的优势：**
- 推理速度快 2-3x（如果需要实时无人机端部署）
- Ultralytics 生态完善，训练/部署更简单
- 社区 fine-tune 经验丰富

### 推荐 Pipeline

```
                    棕榈树检测 Pipeline
┌─────────────┐     ┌──────────────┐     ┌──────────┐
│ 高分影像输入  │ ──→ │ RF-DETR 检测  │ ──→ │ SAM2 分割 │
│ (0.5m/drone) │     │ (定位+分类)   │     │ (精确边界) │
└─────────────┘     └──────────────┘     └──────────┘
                         ↓                     ↓
                    每棵树的 bbox          每棵树的精确轮廓
                    + 类别 (健康/枯死)     + 面积/形状特征
```

## ☀️ 太阳能板检测：最优方案

### 需求分析
- 目标有规律（矩形，排列整齐）
- 大小中等（一个面板在 0.3m 影像上 ~50-100 像素）
- 需要精确边界（计算面积 → 估算发电量）
- 可能有遮挡（阴影、植被）

### 推荐方案：YOLOv11-seg 或 RF-DETR + SAM2

太阳能板更适合**实例分割**（不仅检测位置，还要画出精确形状）：
- YOLOv11-seg: 一步出检测框 + 分割 mask
- RF-DETR + SAM2: 两步但精度更高

## 🏗️ PalmView 中已有的模型

```
已有:
  ├── Prithvi-EO 2.0 (遥感 encoder)  → Level 1 特征提取
  ├── RemoteCLIP (文本-图像匹配)      → Level 1 语义搜索
  ├── TransUNet (混合 CNN+Transformer) → 语义分割
  ├── SAM2 (promptable 分割)           → 精细边界提取
  └── BIT-CD (变化检测)                → 时序对比

需要新增:
  └── RF-DETR 或 YOLOv11              → 单棵树检测 ⭐
```

## 最终建议

| 场景 | 首选模型 | 备选 | 原因 |
|------|---------|------|------|
| **棕榈树检测** | RF-DETR | YOLOv11 | 小目标+密集，Transformer 优势 |
| **太阳能板检测** | YOLOv11-seg | RF-DETR + SAM2 | 中等目标，需要 mask |
| **大范围地物分类** | RemoteCLIP + TransUNet | SegFormer | 已有，10m 够用 |
| **变化检测** | BIT-CD | — | 已有 |
| **精细边界** | SAM2/SAM3 | — | 已有，配合检测器 |

**总结：我建议先用 RF-DETR 训练棕榈树检测，它在我们的场景下是最优解。**
Roboflow 自己出的模型 + Roboflow 的数据 = 最佳适配。
