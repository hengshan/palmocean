# GeoAI Inference Persist API — T2 Spec

**Sprint 2 · T2:** GeoAI 推理结果持久化到 PalmOcean  
**Owner:** Lyra (backend) + Iris (frontend)  
**Status:** Draft · 2026-02-25

---

## Overview

当前 GeoAI 推理是"无状态"的：结果作为 JSON 直接返回给前端，刷新即消失。  
T2 目标：让推理结果持久化到 PalmOcean DB，形成可查询、可关联种植园的历史记录。

**现有 DB 表（已定义在 `backend/app/models/ml.py`）：**
- `inference_jobs` — 任务记录（状态机）
- `inference_outputs` — 输出文件/数据（GeoJSON/raster）
- `inference_result_index` — 可空间查询的结果索引

---

## New Endpoints

### 1. Persist Inference Result

```
POST /api/inference/persist
Content-Type: application/json
```

**Request Body:**
```json
{
  "project_id": "uuid",              // 所属项目（必填）
  "plantation_id": "uuid | null",    // 关联种植园（可选）
  "model_slug": "sam2 | yolov8n | remoteclip",
  "task_type": "segmentation | detection | text_retrieval",
  "prompt_type": "point | box | auto | text | semantic",
  "prompt_params": {                 // 原始 prompt（用于复现）
    "image_id": "...",
    "point": {"lng": 103.5, "lat": 3.1}  // 或 bbox / classes / prompt
  },
  "geojson": {                       // InferenceResponse.results 原样传入
    "type": "FeatureCollection",
    "features": [...]
  },
  "stats": {
    "count": 42,
    "total_area": 1234.56
  },
  "inference_time_ms": 450,          // 可选，用于性能追踪
  "image_url": "s3://... | null"     // 原始图片 URL（可选）
}
```

**Response `201 Created`:**
```json
{
  "job_id": "uuid",
  "output_id": "uuid",
  "created_at": "2026-02-25T07:00:00Z",
  "permalink": "/api/inference/results/{output_id}"
}
```

**Response `422`:** validation error  
**Response `503`:** DB unavailable

---

### 2. Get Saved Result

```
GET /api/inference/results/{output_id}
```

**Response `200`:**
```json
{
  "output_id": "uuid",
  "job_id": "uuid",
  "project_id": "uuid",
  "plantation_id": "uuid | null",
  "model_slug": "sam2",
  "task_type": "segmentation",
  "prompt_type": "point",
  "geojson": { "type": "FeatureCollection", "features": [...] },
  "stats": { "count": 42, "total_area": 1234.56 },
  "created_at": "2026-02-25T07:00:00Z",
  "bbox_wkt": "POLYGON(...)"         // 结果空间范围，用于地图显示
}
```

---

### 3. List Saved Results (Paginated)

```
GET /api/inference/results
  ?project_id=uuid           (required)
  &plantation_id=uuid        (optional)
  &model_slug=sam2           (optional)
  &task_type=segmentation    (optional)
  &page=1
  &page_size=20
```

**Response `200`:**
```json
{
  "total": 87,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "output_id": "uuid",
      "job_id": "uuid",
      "model_slug": "sam2",
      "task_type": "segmentation",
      "stats": { "count": 42, "total_area": 1234.56 },
      "created_at": "2026-02-25T07:00:00Z",
      "thumbnail_url": "..."          // 可选，后期接 MinIO
    }
  ]
}
```

---

## Implementation Plan (Lyra)

### Phase 1: Minimal Viable Persist (今天)
1. Add `PersistRequest` schema to `backend/app/schemas/inference.py`
2. Add `PersistResponse`, `SavedResultResponse`, `SavedResultListItem`
3. Implement service `backend/app/services/inference/persist_service.py`:
   - Create `InferenceJob` (status=completed, no model_version_id for now)
   - Store GeoJSON in `InferenceOutput` (format="geojson", uri=f"db://inline/{job_id}")
   - Create `InferenceResultIndex` entries for spatial indexing
4. Add endpoints to `backend/app/api/routes/inference.py`
5. Register nothing new (already registered via `/api/inference`)

### Phase 2: MinIO Integration (Sprint 2 后半)
- Save GeoJSON as `.geojson` file in MinIO → `uri = s3://palmview-data/...`
- Thumbnail generation

---

## Frontend Integration (Iris)

### After inference completes:
```typescript
// In FloatingResultsPane or wherever inference results are displayed
const handlePersist = async () => {
  const response = await fetch('/api/inference/persist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: currentProjectId,
      plantation_id: selectedPlantationId ?? null,
      model_slug: currentModel,
      task_type: inferenceResponse.task_type,
      prompt_type: lastPromptType,
      prompt_params: lastPromptParams,
      geojson: inferenceResponse.results,
      stats: inferenceResponse.stats,
    })
  });
  const { job_id, output_id } = await response.json();
  dispatch(setLastSavedResultId(output_id));  // Redux action
};
```

### Redux state additions needed:
```typescript
// In inferenceStore / mapStore (Redux slice)
lastSavedResultId: string | null;
savedResults: SavedResultListItem[];  // for history panel
```

---

## Notes

- `model_version_id` 先设为 null（Phase 1 不依赖 Model Registry）
- `org_id` 先用 hardcoded default org（auth 完整后再接）
- 不需要新的 DB 迁移：复用现有 `inference_jobs` + `inference_outputs` + `inference_result_index`
- Phase 1 inline GeoJSON 直接存 `InferenceOutput.manifest`（省去 MinIO 依赖）
