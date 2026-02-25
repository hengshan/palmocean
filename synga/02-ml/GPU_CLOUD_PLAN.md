# PalmView GeoAI — Modal GPU 推理服务方案

> 版本：v1.0 | 日期：2026-02-24 | 作者：Claude (云架构师)

---

## 目录

1. [Modal GPU 定价参考](#1-modal-gpu-定价参考)
2. [成本估算](#2-成本估算)
3. [Modal 接入方案](#3-modal-接入方案)
4. [代码示例](#4-代码示例)
5. [部署流程](#5-部署流程)
6. [与现有代码集成](#6-与现有代码集成)
7. [备选方案对比](#7-备选方案对比)
8. [决策建议](#8-决策建议)

---

## 1. Modal GPU 定价参考

> 数据来源：https://modal.com/pricing（2026-02 确认）

### 1.1 GPU 按秒计费价格

| GPU 型号 | 显存 | 每秒费用 | 换算每小时 | 推荐用途 |
|---------|------|---------|-----------|--------|
| T4 | 16GB | $0.000164/s | **$0.59/hr** | YOLOv8、小模型 |
| L4 | 24GB | $0.000222/s | **$0.80/hr** | SAM2、CLIP、BIT-CD |
| A10G | 24GB | $0.000306/s | **$1.10/hr** | 大批量推理 |
| L40S | 48GB | $0.000542/s | **$1.95/hr** | 多模型并发 |
| A100 40G | 40GB | $0.000583/s | **$2.10/hr** | 训练/大批量 |
| H100 80G | 80GB | ~$0.00195/s | **~$7.00/hr** | 大规模训练 |

> ⚠️ **重要**：Modal 只在函数执行期间计费（serverless），空闲不收费。
> `keep_warm=1` 会保持容器常驻，空闲时也计费。

### 1.2 套餐计划

| 套餐 | 月费 | 免费额度 | GPU 并发上限 |
|-----|------|---------|------------|
| Starter | $0 | **$30/月** | 10 GPU |
| Team | $250 | **$100/月** | 50 GPU |
| Enterprise | 定制 | 定制 | 无上限 |

> 注：早期创业公司可申请最高 **$25,000** 免费算力。

### 1.3 各模型 GPU 选型推荐

| 模型 | 显存需求 | 推荐 GPU | 理由 |
|-----|---------|---------|-----|
| SAM2 hiera-large | 6-8GB | **L4** | 24GB 宽裕，价格适中 |
| RemoteCLIP ViT-L-14 | 4-6GB | **L4** | 批量 tile 推理效率好 |
| YOLOv8 | 2GB | **T4** | 最便宜，够用 |
| BIT-CD | 4GB | **L4** | 与 SAM2 共享容器可节省 |

---

## 2. 成本估算

### 2.1 基础假设

```
每月天数：30 天
模型冷启动加载时间（从 Modal Volume 缓存）：
  - SAM2:      3-5秒（首次下载后缓存）
  - CLIP:      2-3秒
  - YOLOv8:   0.5秒
  - BIT-CD:    1-2秒
容器 boot 时间：~1-2秒（Modal 优化后）
实际推理时间：
  - SAM2:      ~0.5秒/次
  - CLIP:      ~0.3秒/tile（100 tiles = 30秒）
  - YOLOv8:   ~0.05秒/次
  - BIT-CD:    ~0.2秒/次
有效 GPU 时间（含开销）= 推理时间 × 1.2 + 偶发冷启动分摊
```

### 2.2 场景 A：早期 Demo（5 个用户）

**每日工作量：**
- SAM2：50 次点/框分割
- RemoteCLIP：10 次搜索 × 100 tiles = 1,000 tile 推理
- YOLOv8：20 次检测
- BIT-CD：偶尔（~5 次/天）

**每日 GPU 用时计算：**

| 模型 | 计算过程 | GPU 秒/天 |
|-----|---------|----------|
| SAM2 (L4) | 50次 × 3.5s有效 | 175s |
| CLIP (L4) | 10次搜索 × 35s(加载+100tiles) | 350s |
| YOLOv8 (T4) | 20次 × 1.0s | 20s |
| BIT-CD (L4) | 5次 × 5.2s | 26s |

**月度费用：**

| 模型 | GPU 小时/月 | 费率 | 月成本 |
|-----|-----------|-----|-------|
| SAM2 | 1.46 hr | $0.80/hr | $1.17 |
| CLIP | 2.92 hr | $0.80/hr | $2.33 |
| YOLOv8 | 0.17 hr | $0.59/hr | $0.10 |
| BIT-CD | 0.22 hr | $0.80/hr | $0.18 |
| **合计** | **4.77 hr** | | **$3.78/月** |

> ✅ **结论：Starter 套餐（$30 免费额度）完全覆盖，实际费用 $0**

### 2.3 场景 B：小规模使用（50 个用户，10× A）

| 指标 | 数值 |
|-----|-----|
| GPU 总时长/月 | **47.7 小时** |
| 计算成本 | **$37.8/月** |
| 扣除免费额度 | -$30 (Starter) |
| **实际净费用** | **~$8/月** |

> 可选：不升级套餐，$8/月运行 50 用户规模的 GeoAI 平台

### 2.4 场景 C：中等规模（500 个用户，100× A）

**两种配置方案：**

**方案 C1 — 纯按需（无 keep_warm）：**
| 指标 | 数值 |
|-----|-----|
| GPU 总时长/月 | **477 小时** |
| 计算成本 | **$378/月** |
| + Team 套餐 | +$250/月 |
| - 免费额度 | -$100/月 |
| **实际净费用** | **$528/月** |

**方案 C2 — SAM2 保持预热（keep_warm=1）：**
| 费用项 | 金额 |
|-------|-----|
| 其他模型按需 | ~$100/月 |
| SAM2 keep_warm (L4, 24h) | $0.80 × 24 × 30 = $576/月 |
| Team 套餐 | $250/月 |
| - 免费额度 | -$100/月 |
| **合计** | **$826/月** |

> 推荐：**方案 C1**（纯按需），配合前端加载状态提示，用户体验可接受。

### 2.5 与自建 GPU 服务器对比

| 方案 | 场景 A | 场景 B | 场景 C | 特点 |
|-----|-------|-------|-------|-----|
| **Modal（推荐）** | $0/月 | $8/月 | $528/月 | 按需付费，零运维 |
| RTX 4090 自建 | $0（已买）+ $40电费 | $40/月电费 | $40/月电费 | 一次性成本~$3,000，24/7需在线 |
| AWS on-demand A10G | - | - | ~$806/月(24/7) | 固定收费不弹性 |
| RunPod A40 | - | - | ~$400/月 | 灵活但无 Python SDK |

> **小结**：场景 A/B 用 Modal 比自建更合算（免运维）；场景 C 需权衡（$528 vs $40 自建电费，但自建需 24/7 在线且不弹性）。

---

## 3. Modal 接入方案

### 3.1 整体架构

```
┌─────────────┐     HTTP/REST     ┌─────────────────┐
│  Next.js    │ ─────────────────▶│  FastAPI        │
│  (Vercel)   │                   │  (Railway)      │
└─────────────┘                   └────────┬────────┘
                                           │ modal.Function.remote()
                                           │ (Python SDK，同步/异步)
                                  ┌────────▼────────┐
                                  │  Modal Cloud    │
                                  │  ┌───────────┐  │
                                  │  │ SAM2 App  │  │
                                  │  │ (L4 GPU)  │  │
                                  │  └───────────┘  │
                                  │  ┌───────────┐  │
                                  │  │ CLIP App  │  │
                                  │  │ (L4 GPU)  │  │
                                  │  └───────────┘  │
                                  │  ┌───────────┐  │
                                  │  │ YOLO App  │  │
                                  │  │ (T4 GPU)  │  │
                                  │  └───────────┘  │
                                  │  ┌───────────┐  │
                                  │  │ BIT-CD    │  │
                                  │  │ (L4 GPU)  │  │
                                  │  └───────────┘  │
                                  └─────────────────┘
```

### 3.2 模型预热策略

```python
# 策略矩阵：根据使用频率和冷启动代价决定 keep_warm

模型         keep_warm值    场景A    场景B    场景C
──────────────────────────────────────────────────
SAM2           0            ✓        ✓        1（建议）
RemoteCLIP     0            ✓        ✓        0（批量够快）
YOLOv8         0            ✓        ✓        ✓
BIT-CD         0            ✓        ✓        ✓
```

### 3.3 冷启动优化策略

1. **Modal Volume 模型缓存**（最重要）
   - 模型文件存入 Modal Volume，只下载一次
   - 后续冷启动从 Volume 加载：SAM2 从 3min 降到 ~5s

2. **镜像层优化**
   - 把 `pip install` 等依赖打入镜像层（`.pip_install()`）
   - 不在容器启动时安装包

3. **`@modal.enter()` 装饰器**
   - 在 `@modal.enter()` 中做模型加载
   - 同一容器复用时不重复加载

4. **并发复用**
   - `container_idle_timeout=300`（5分钟）：容器空闲不立即销毁
   - `allow_concurrent_inputs=1`：SAM2 这种有状态模型不共享

### 3.4 错误处理和重试

```python
# FastAPI 端重试策略
import tenacity

@tenacity.retry(
    stop=tenacity.stop_after_attempt(3),
    wait=tenacity.wait_exponential(multiplier=1, min=1, max=10),
    retry=tenacity.retry_if_exception_type((modal.exception.TimeoutError,)),
    reraise=True
)
async def call_modal_with_retry(fn, *args, **kwargs):
    return await fn.remote.aio(*args, **kwargs)
```

---

## 4. 代码示例

### 4.1 Modal 应用定义（以 SAM2 为例）

**文件：`ml/modal/sam2_modal.py`**

```python
"""
SAM2 Modal Inference Service
将 sam2_server.py 的核心逻辑封装为 Modal Function
"""

import modal
from pathlib import Path

# ─── 1. 定义 Modal 镜像 ──────────────────────────────────────────────────────

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(["libgl1-mesa-glx", "libglib2.0-0", "libsm6", "libxext6"])
    .pip_install([
        "torch==2.5.1",
        "torchvision==0.20.1",
        "--index-url", "https://download.pytorch.org/whl/cu121",
    ])
    .pip_install([
        "sam2",
        "numpy",
        "opencv-python-headless",
        "rasterio",
        "Pillow",
        "fastapi",
        "uvicorn",
    ])
)

# ─── 2. Modal Volume（模型缓存）──────────────────────────────────────────────

model_volume = modal.Volume.from_name("palmview-models", create_if_missing=True)
MODEL_DIR = Path("/models")

# ─── 3. Modal App 定义 ────────────────────────────────────────────────────────

app = modal.App("palmview-sam2", image=image)

# ─── 4. 下载模型（一次性脚本）─────────────────────────────────────────────────

@app.function(
    volumes={MODEL_DIR: model_volume},
    timeout=600,
)
def download_models():
    """预下载模型到 Volume（只需运行一次）"""
    import torch
    from huggingface_hub import hf_hub_download
    import os

    sam2_dir = MODEL_DIR / "sam2"
    sam2_dir.mkdir(parents=True, exist_ok=True)

    # 下载 SAM2 hiera-large checkpoint
    if not (sam2_dir / "sam2.1_hiera_large.pt").exists():
        print("Downloading SAM2 checkpoint...")
        hf_hub_download(
            repo_id="facebook/sam2.1-hiera-large",
            filename="sam2.1_hiera_large.pt",
            local_dir=str(sam2_dir),
        )
        print("SAM2 downloaded!")
    
    model_volume.commit()
    print("Models committed to Volume.")


# ─── 5. SAM2 推理 Class ───────────────────────────────────────────────────────

@app.cls(
    gpu="L4",                          # 24GB VRAM，适合 SAM2
    volumes={MODEL_DIR: model_volume},
    container_idle_timeout=300,        # 空闲 5 分钟后销毁
    allow_concurrent_inputs=1,         # SAM2 有状态，不并发
    # keep_warm=0,                     # 场景 A/B：按需启动
    # keep_warm=1,                     # 场景 C：保持预热（$576/月）
)
class SAM2Inference:

    @modal.enter()
    def load_model(self):
        """容器启动时加载模型（只执行一次）"""
        import torch
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {self.device}")

        checkpoint_path = str(MODEL_DIR / "sam2" / "sam2.1_hiera_large.pt")
        config = "configs/sam2.1/sam2.1_hiera_l.yaml"

        model = build_sam2(config, ckpt_path=checkpoint_path, device=self.device)
        self.predictor = SAM2ImagePredictor(model)
        print("SAM2 model loaded successfully!")

    @modal.method()
    def segment_point(
        self,
        image_bytes: bytes,
        point_x: float,
        point_y: float,
        label: int = 1,
        geo_info: dict = None,
    ) -> dict:
        """
        点提示分割
        
        Args:
            image_bytes: 图像二进制数据（PNG/JPG/GeoTIFF）
            point_x: 点的 x 坐标（像素或经度）
            point_y: 点的 y 坐标（像素或纬度）
            label: 1=前景，0=背景
            geo_info: 地理信息（含 transform, crs 等）
        
        Returns:
            GeoJSON 格式的分割结果
        """
        import numpy as np
        import cv2
        from PIL import Image
        import io

        # 解码图像
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_np = np.array(image)

        # SAM2 推理
        self.predictor.set_image(image_np)
        masks, scores, _ = self.predictor.predict(
            point_coords=np.array([[point_x, point_y]]),
            point_labels=np.array([label]),
            multimask_output=True,
        )

        # 取最高分 mask
        best_mask = masks[np.argmax(scores)]
        
        # 转换为 GeoJSON 坐标
        polygons = self._mask_to_polygons(best_mask, geo_info)

        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [poly]},
                    "properties": {"score": float(scores.max()), "model": "sam2"},
                }
                for poly in polygons
            ],
        }

    @modal.method()
    def segment_box(
        self,
        image_bytes: bytes,
        box: list,  # [x1, y1, x2, y2]
        geo_info: dict = None,
    ) -> dict:
        """框提示分割"""
        import numpy as np
        from PIL import Image
        import io

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_np = np.array(image)

        self.predictor.set_image(image_np)
        masks, scores, _ = self.predictor.predict(
            box=np.array(box),
            multimask_output=False,
        )

        polygons = self._mask_to_polygons(masks[0], geo_info)

        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [poly]},
                    "properties": {"score": float(scores[0]), "model": "sam2"},
                }
            ],
        }

    def _mask_to_polygons(self, mask: "np.ndarray", geo_info: dict = None) -> list:
        """将 mask 转为多边形坐标列表"""
        import cv2
        import numpy as np

        contours, _ = cv2.findContours(
            mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        polygons = []
        for contour in contours:
            if len(contour) >= 3:
                coords = contour.squeeze().tolist()
                if geo_info and geo_info.get("transform"):
                    # 像素坐标 → 地理坐标
                    coords = self._pixels_to_geo(coords, geo_info)
                coords.append(coords[0])  # 闭合多边形
                polygons.append(coords)
        return polygons

    def _pixels_to_geo(self, pixel_coords: list, geo_info: dict) -> list:
        """像素坐标转地理坐标"""
        import rasterio.transform
        t = geo_info["transform"]
        return [
            list(rasterio.transform.xy(t, y, x))
            for x, y in pixel_coords
        ]
```

### 4.2 RemoteCLIP Modal 服务

**文件：`ml/modal/clip_modal.py`**

```python
import modal
from pathlib import Path

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install([
        "torch==2.5.1", "torchvision==0.20.1",
        "--index-url", "https://download.pytorch.org/whl/cu121",
    ])
    .pip_install(["open_clip_torch", "numpy", "Pillow", "huggingface_hub"])
)

app = modal.App("palmview-clip", image=image)
model_volume = modal.Volume.from_name("palmview-models", create_if_missing=True)
MODEL_DIR = Path("/models")


@app.cls(
    gpu="L4",
    volumes={MODEL_DIR: model_volume},
    container_idle_timeout=300,
    allow_concurrent_inputs=4,  # CLIP 推理无状态，允许并发
)
class RemoteCLIPInference:

    @modal.enter()
    def load_model(self):
        import torch
        import open_clip

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # 从 Volume 加载模型
        model_path = MODEL_DIR / "clip" / "RemoteCLIP-ViT-L-14.pt"
        
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            "ViT-L-14", pretrained=str(model_path)
        )
        self.tokenizer = open_clip.get_tokenizer("ViT-L-14")
        self.model = self.model.to(self.device).eval()
        print("RemoteCLIP loaded!")

    @modal.method()
    def encode_text(self, text: str) -> list:
        """编码文本查询"""
        import torch
        tokens = self.tokenizer([text]).to(self.device)
        with torch.no_grad():
            features = self.model.encode_text(tokens)
            features = features / features.norm(dim=-1, keepdim=True)
        return features.cpu().numpy().tolist()[0]

    @modal.method()
    def encode_images_batch(self, images_bytes: list[bytes]) -> list:
        """批量编码图像 tile（核心：批处理提升效率）"""
        import torch
        from PIL import Image
        import io

        images = [
            self.preprocess(Image.open(io.BytesIO(b)).convert("RGB"))
            for b in images_bytes
        ]
        batch = torch.stack(images).to(self.device)

        with torch.no_grad():
            features = self.model.encode_image(batch)
            features = features / features.norm(dim=-1, keepdim=True)
        return features.cpu().numpy().tolist()

    @modal.method()
    def search_tiles(
        self, text_query: str, tile_images: list[bytes], top_k: int = 10
    ) -> list:
        """文本 → 图像搜索（一次调用完成所有 tiles）"""
        import torch
        import numpy as np

        # 编码文本
        text_feat = torch.tensor(self.encode_text.local(text_query))

        # 批量编码图像（分批处理防 OOM）
        batch_size = 32
        all_img_feats = []
        for i in range(0, len(tile_images), batch_size):
            batch = tile_images[i : i + batch_size]
            feats = self.encode_images_batch.local(batch)
            all_img_feats.extend(feats)

        img_feats = torch.tensor(all_img_feats)

        # 计算相似度
        similarities = (img_feats @ text_feat.unsqueeze(-1)).squeeze(-1)
        top_indices = similarities.argsort(descending=True)[:top_k].tolist()

        return [
            {"tile_index": int(i), "score": float(similarities[i])}
            for i in top_indices
        ]
```

### 4.3 FastAPI（Railway）调用 Modal

**文件：`backend/services/modal_client.py`**

```python
"""
Modal Client Service
FastAPI (Railway) 调用 Modal GPU 服务的封装层
"""

import asyncio
import logging
from typing import Optional
import httpx
import modal

logger = logging.getLogger(__name__)

# ─── Modal Function 引用 ─────────────────────────────────────────────────────
# 这些引用在 Railway 启动时懒加载，不需要 GPU

class ModalClient:
    """Modal GPU 服务客户端（单例）"""

    _sam2_cls: Optional[object] = None
    _clip_cls: Optional[object] = None
    _yolo_fn: Optional[object] = None
    _cd_cls: Optional[object] = None

    @classmethod
    def _get_sam2(cls):
        if cls._sam2_cls is None:
            # 从已部署的 Modal App 获取 Class 引用
            cls._sam2_cls = modal.Cls.from_name("palmview-sam2", "SAM2Inference")
        return cls._sam2_cls

    @classmethod
    def _get_clip(cls):
        if cls._clip_cls is None:
            cls._clip_cls = modal.Cls.from_name("palmview-clip", "RemoteCLIPInference")
        return cls._clip_cls

    @classmethod
    async def segment_point(
        cls,
        image_bytes: bytes,
        lng: float,
        lat: float,
        label: int = 1,
        geo_info: dict = None,
    ) -> dict:
        """调用 Modal SAM2 点分割"""
        try:
            sam2 = cls._get_sam2()
            result = await sam2().segment_point.remote.aio(
                image_bytes=image_bytes,
                point_x=lng,
                point_y=lat,
                label=label,
                geo_info=geo_info,
            )
            return result
        except modal.exception.TimeoutError:
            logger.error("SAM2 Modal timeout")
            raise
        except Exception as e:
            logger.error(f"SAM2 Modal error: {e}")
            raise

    @classmethod
    async def segment_box(
        cls,
        image_bytes: bytes,
        box: list,
        geo_info: dict = None,
    ) -> dict:
        """调用 Modal SAM2 框分割"""
        sam2 = cls._get_sam2()
        return await sam2().segment_box.remote.aio(
            image_bytes=image_bytes,
            box=box,
            geo_info=geo_info,
        )

    @classmethod
    async def search_tiles(
        cls,
        text_query: str,
        tile_images: list[bytes],
        top_k: int = 10,
    ) -> list:
        """调用 Modal CLIP 语义搜索"""
        clip = cls._get_clip()
        return await clip().search_tiles.remote.aio(
            text_query=text_query,
            tile_images=tile_images,
            top_k=top_k,
        )
```

### 4.4 FastAPI 路由修改（最小改动）

**文件：`backend/routers/inference.py`（修改示例）**

```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import aiofiles
from services.modal_client import ModalClient

router = APIRouter(prefix="/inference", tags=["inference"])


class PointSegmentRequest(BaseModel):
    image_path: str
    lng: float
    lat: float
    label: int = 1


@router.post("/segment/point")
async def segment_point(req: PointSegmentRequest):
    """
    SAM2 点分割 — 原来调本地服务，现在改为调 Modal
    改动极小：只替换调用方式
    """
    try:
        # 读取图像文件（或从 S3/云存储获取）
        async with aiofiles.open(req.image_path, "rb") as f:
            image_bytes = await f.read()

        # 调用 Modal（替换原来的 httpx.post("localhost:8001/segment/point")）
        result = await ModalClient.segment_point(
            image_bytes=image_bytes,
            lng=req.lng,
            lat=req.lat,
            label=req.label,
        )
        return result

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Image not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search/semantic")
async def semantic_search(text_query: str, tile_paths: list[str]):
    """RemoteCLIP 语义搜索"""
    # 批量读取 tile 图像
    tile_bytes = []
    for path in tile_paths:
        async with aiofiles.open(path, "rb") as f:
            tile_bytes.append(await f.read())

    results = await ModalClient.search_tiles(
        text_query=text_query,
        tile_images=tile_bytes,
    )
    return {"results": results, "query": text_query}
```

---

## 5. 部署流程

### 5.1 Modal 账户设置

```bash
# 1. 安装 Modal SDK
pip install modal

# 2. 认证（会打开浏览器）
modal setup

# 3. 验证认证
modal token show
```

### 5.2 Secret 管理

```bash
# 在 Modal 创建 Secrets（用于 HuggingFace token 等）
modal secret create palmview-secrets \
  HF_TOKEN="hf_xxx..." \
  PALMVIEW_API_KEY="your-key"
```

```python
# 在 Modal Function 中使用 Secret
@app.cls(
    gpu="L4",
    secrets=[modal.Secret.from_name("palmview-secrets")],
)
class SAM2Inference:
    @modal.enter()
    def load(self):
        import os
        hf_token = os.environ["HF_TOKEN"]  # 自动注入
```

### 5.3 部署命令

```bash
# 首次：下载并缓存模型到 Volume
modal run ml/modal/sam2_modal.py::download_models

# 部署 SAM2 服务
modal deploy ml/modal/sam2_modal.py

# 部署 CLIP 服务
modal deploy ml/modal/clip_modal.py

# 部署 YOLOv8 服务
modal deploy ml/modal/yolo_modal.py

# 部署变化检测服务
modal deploy ml/modal/cd_modal.py

# 查看部署状态
modal app list
```

### 5.4 Railway 环境变量

```bash
# 在 Railway 的 FastAPI 服务中添加环境变量
MODAL_TOKEN_ID=ak-xxxxx
MODAL_TOKEN_SECRET=as-xxxxx

# 这样 Railway 上的 FastAPI 就能调用 Modal
```

### 5.5 CI/CD 集成（GitHub Actions）

```yaml
# .github/workflows/deploy-modal.yml

name: Deploy Modal Services

on:
  push:
    branches: [main]
    paths:
      - "ml/modal/**"

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      
      - name: Install Modal
        run: pip install modal
      
      - name: Deploy Modal Apps
        env:
          MODAL_TOKEN_ID: ${{ secrets.MODAL_TOKEN_ID }}
          MODAL_TOKEN_SECRET: ${{ secrets.MODAL_TOKEN_SECRET }}
        run: |
          modal deploy ml/modal/sam2_modal.py
          modal deploy ml/modal/clip_modal.py
          modal deploy ml/modal/yolo_modal.py
          modal deploy ml/modal/cd_modal.py
```

### 5.6 监控和日志

```bash
# 实时查看日志
modal app logs palmview-sam2

# 查看调用历史和指标
# → https://modal.com/apps（Web Dashboard）

# 查看 Volume 使用情况
modal volume list
modal volume ls palmview-models
```

---

## 6. 与现有代码集成

### 6.1 迁移分析

| 文件 | 当前状态 | 迁移方式 | 改动量 |
|-----|---------|---------|-------|
| `sam2_server.py` (1005行) | FastAPI 本地服务 | 核心推理逻辑迁入 `SAM2Inference` Class | ~200行（抽取） |
| `cd_server.py` (395行) | FastAPI 本地服务 | 核心推理逻辑迁入 `CDInference` Class | ~150行（抽取） |
| `predict.py` (262行) | CLI 推理脚本 | 封装为 Modal Function | ~100行（封装） |

### 6.2 sam2_server.py 迁移指南

**现有代码结构：**
```python
# sam2_server.py — 现有
class SAM2Inference:
    def load_model(self, model_name):     # ← 迁移到 @modal.enter()
    def load_image_with_geo_info(self):   # ← 直接复用
    def geo_to_pixel(self):               # ← 直接复用
    def pixel_to_geo(self):               # ← 直接复用
    def mask_to_geojson_polygon(self):    # ← 直接复用

app = FastAPI()
@app.post("/segment/point")              # ← 改为 @modal.method()
@app.post("/segment/box")               # ← 改为 @modal.method()
@app.post("/segment/auto")              # ← 改为 @modal.method()
```

**迁移步骤：**
```python
# ml/modal/sam2_modal.py — 迁移后
@app.cls(gpu="L4", volumes={MODEL_DIR: model_volume})
class SAM2Inference:
    @modal.enter()
    def load_model(self):
        # 直接复制 sam2_server.py 的 load_model 逻辑
        # 只需修改 model_name → 从 Volume 路径加载
        ...

    @modal.method()
    def segment_point(self, image_bytes, lng, lat, ...):
        # 直接复制 /segment/point endpoint 的处理逻辑
        # image_path → image_bytes（bytes 传递替代文件路径）
        ...
```

**关键改动（2 处）：**
1. `@app.post()` → `@modal.method()`
2. `image_path: str` → `image_bytes: bytes`（文件路径改为字节流传输）

### 6.3 cd_server.py 迁移指南

```python
# ml/modal/cd_modal.py

@app.cls(gpu="L4", volumes={MODEL_DIR: model_volume})
class CDInference:
    @modal.enter()
    def load_model(self):
        # 直接复制 cd_server.py 的模型加载逻辑
        from models.change_detection.bit_cd import build_bit_cd
        self.model = build_bit_cd(...)
    
    @modal.method()
    def detect_change(
        self,
        before_bytes: bytes,
        after_bytes: bytes,
        threshold: float = 0.5,
    ) -> dict:
        # 直接复制 /segment/change-detection 处理逻辑
        ...
```

### 6.4 目录结构（迁移后）

```
ml/
├── inference/           # 原有本地推理服务（保留作为本地调试用）
│   ├── sam2_server.py
│   ├── cd_server.py
│   └── predict.py
├── modal/               # ← 新增：Modal 部署文件
│   ├── __init__.py
│   ├── sam2_modal.py    # SAM2 Modal 服务
│   ├── clip_modal.py    # RemoteCLIP Modal 服务
│   ├── yolo_modal.py    # YOLOv8 Modal 服务
│   ├── cd_modal.py      # BIT-CD Modal 服务
│   └── download_models.py  # 模型下载脚本
└── models/              # 原有模型定义（Modal 服务内复用）
    └── change_detection/
        └── bit_cd.py

backend/
├── services/
│   └── modal_client.py  # ← 新增：Modal 调用客户端
└── routers/
    └── inference.py     # ← 微改：替换本地调用为 Modal 调用
```

---

## 7. 备选方案对比

### 7.1 综合对比

| 维度 | **Modal** ⭐ | RunPod | Replicate | HuggingFace Endpoints |
|-----|-----------|--------|-----------|----------------------|
| **定价模式** | 按秒计费，serverless | 按时计费（Pod 运行期间） | 按次计费 | 按时计费（端点运行期间） |
| **冷启动** | ~5-15s（Volume 优化后） | 较快（Pod 常驻） | ~10-30s | ~20-60s |
| **Python SDK** | ✅ 原生支持，`modal.Function` | ❌ 仅 REST API | ✅ 有 Python client | ✅ 有 Python client |
| **自定义代码** | ✅ 完整 Python | ✅ 完整（Docker） | ⚠️ Cog 格式封装 | ⚠️ 需要适配 Transformers |
| **模型控制** | ✅ 完全自由 | ✅ 完全自由 | ⚠️ 有限 | ⚠️ 主要 HF 模型 |
| **GeoTIFF 支持** | ✅ 可安装 rasterio | ✅ 可安装 rasterio | ⚠️ 需要封装 | ❌ 难以定制 |
| **免费额度** | $30/月 | ❌ 无 | 有限次数 | 免费 CPU Tier |
| **最小月费** | $0 (Starter) | ~$0（按需） | 按使用量 | ~$0-50 |
| **并发弹性** | ✅ 自动 | ⚠️ 手动管理 | ✅ 自动 | ✅ 自动 |
| **Railway 集成** | ✅ Python SDK 直接调用 | ⚠️ HTTP 调用 | ⚠️ HTTP 调用 | ⚠️ HTTP 调用 |

### 7.2 详细分析

**Modal（推荐）**
- ✅ Python 原生：从 Railway FastAPI 直接 `import modal`，无需 HTTP 客户端
- ✅ Serverless：只在推理时付费，完美匹配 PalmView 的间歇性使用
- ✅ Volume：模型文件持久化，冷启动快
- ✅ 活跃开发：2025-2026 年快速迭代
- ❌ 相比 RunPod：长时间常驻场景成本更高（keep_warm 代价大）

**RunPod**
- ✅ 成本可控：固定 Pod 按时计费，适合 24/7 业务
- ✅ 完整 Docker 支持
- ❌ 无 Python SDK：Railway 需要通过 HTTP 调用，增加复杂度
- ❌ 无内置弹性扩容
- 适合场景：用户量稳定、需要常驻的场景（>200h GPU/月时比 Modal 便宜）

**Replicate**
- ✅ 托管热门开源模型（SAM2 已有）
- ✅ API 简单
- ❌ 使用 Cog 封装，难以定制 GeoTIFF 处理逻辑
- ❌ 模型版本锁定，升级麻烦
- ❌ 不支持 rasterio 等地理空间库的深度定制
- 适合场景：快速验证，不适合生产

**HuggingFace Inference Endpoints**
- ✅ 简单，无需写 Modal 代码
- ✅ HF Hub 模型直接部署
- ❌ SAM2、BIT-CD 等模型无法原生支持地理坐标
- ❌ 冷启动慢（~60s）
- ❌ 定制化程度低
- 适合场景：标准 Transformers 模型，不适合地理空间 AI

### 7.3 成本对比（场景 C，500 用户）

| 平台 | 估算月成本 | 备注 |
|-----|----------|-----|
| **Modal（按需）** | **$528/月** | Starter 套餐，含 $100 免费 |
| RunPod A40（3个Pod）| ~$400/月 | 但需要 24/7 运行 |
| Replicate | ~$500-800/月 | 视调用次数 |
| AWS SageMaker | ~$1,200/月 | 管理开销大 |
| 自建 RTX 4090 | ~$40/月（电费） | 一次性 $3,000+，不可扩展 |

---

## 8. 决策建议

### 8.1 推荐方案：Modal（分阶段演进）

```
阶段 1（现在）：Demo → 使用 Modal Starter（$0/月，$30 免费额度）
                         SAM2 + CLIP 按需，无 keep_warm

阶段 2（50用户）：Modal Starter + 少量付费（~$8-50/月）

阶段 3（500用户）：
  - 选项 A：Modal Team（$528/月）→ 无运维，弹性
  - 选项 B：Modal + RunPod 混合（SAM2 用 RunPod 常驻 $120/月，CLIP 用 Modal 按需 $100/月）
            总计 ~$220/月，节省 ~$300/月

超过 1000 用户：重新评估自建 GPU 服务器 vs Modal Enterprise（协商折扣）
```

### 8.2 立即行动项

1. **[今天]** 注册 Modal 账户，申请初创公司 $25k 额度
   → https://modal.com/signup

2. **[本周]** 创建 `ml/modal/` 目录，迁移 SAM2 服务（~4小时工作量）

3. **[本周]** 配置 Modal Volume，下载并缓存 4 个模型

4. **[下周]** 修改 `backend/services/` 添加 `modal_client.py`，替换本地调用

5. **[下周]** 配置 Railway 环境变量，端到端测试

### 8.3 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|-----|-----|------|-----|
| Modal 冷启动导致首次请求慢 | 高 | 中 | 前端加 loading 状态，提示"AI 正在启动" |
| Modal 服务中断 | 低 | 高 | 保留本地 sam2_server.py 作为 fallback |
| 费用超出预期 | 低 | 中 | 设置 Modal 月度支出上限告警 |
| 模型迁移中 GeoTIFF 坐标精度问题 | 中 | 高 | 迁移时写单测验证坐标转换 |

---

## 附录

### A. Modal GPU 价格速查（2026-02）

```
GPU       显存   每秒        每小时    适用模型
────────────────────────────────────────────────
T4        16GB  $0.000164   $0.59    YOLOv8
L4        24GB  $0.000222   $0.80    SAM2, CLIP, BIT-CD
A10G      24GB  $0.000306   $1.10    大批量场景
L40S      48GB  $0.000542   $1.95    多模型并发
A100-40G  40GB  $0.000583   $2.10    训练
```

### B. 关键 Modal 文档链接

- 定价：https://modal.com/pricing
- Volume（模型缓存）：https://modal.com/docs/guide/volumes
- 冷启动优化：https://modal.com/docs/guide/cold-start
- `@modal.enter()` 生命周期：https://modal.com/docs/guide/lifecycle-functions
- Python SDK 参考：https://modal.com/docs/reference/modal.App

### C. 估算数据汇总

| 场景 | GPU 小时/月 | 原始计算费用 | 净费用（含免费额度） |
|-----|-----------|------------|-----------------|
| A（5用户）| 4.8 hr | $3.8/月 | **$0/月** ✅ |
| B（50用户）| 47.7 hr | $37.8/月 | **~$8/月** |
| C（500用户，按需）| 477 hr | $378/月 | **~$528/月** |
| C（500用户，SAM2预热）| 477 hr + 720 hr | $954/月 | **~$1,104/月** |
