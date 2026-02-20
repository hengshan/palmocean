# dataset_refs ↔ Kepler Store — Data Flow Design

> 🌈 IRIS · Sprint 1 · 2026-02-20
> How inference results and external data sources flow into Kepler's visualization

---

## Overview

Kepler.gl manages datasets in its Redux store (`visState.datasets`). PalmView's backend persists dataset metadata in `dataset_refs` (PostgreSQL). This document defines the bidirectional sync protocol.

```
┌─────────────┐     save      ┌──────────────┐     load      ┌─────────────┐
│   Kepler    │ ──────────► │   Backend    │ ──────────► │   Kepler    │
│   Store     │              │  dataset_refs │              │   Store     │
│ (runtime)   │ ◄────────── │  map_configs  │ ◄────────── │ (restored)  │
└─────────────┘   restore    └──────────────┘    fetch     └─────────────┘
                                    │
                                    │ inference_output
                                    ▼
                             ┌──────────────┐
                             │  Tile Server  │
                             │ TiTiler/Martin│
                             └──────────────┘
```

---

## 1. source_type Schemas

### `internal` — PalmView-managed data (uploads, generated)
```json
{
  "source_type": "internal",
  "source_config": {
    "storage_key": "projects/{pid}/uploads/{filename}",
    "format": "geojson" | "csv" | "arrow",
    "size_bytes": 1234567,
    "crs": "EPSG:4326"
  }
}
```

### `stac` — STAC catalog items
```json
{
  "source_type": "stac",
  "source_config": {
    "stac_api_url": "https://earth-search.aws.element84.com/v1",
    "collection_id": "sentinel-2-l2a",
    "item_id": "S2A_MSIL2A_20260101...",
    "asset_key": "visual",
    "tile_url_template": "/api/v1/tiles/stac/{z}/{x}/{y}?url={asset_href}"
  }
}
```

### `inference_output` — GeoAI analysis results ⭐ NEW
```json
{
  "source_type": "inference_output",
  "source_config": {
    "output_id": "uuid",
    "run_id": "uuid",
    "task_type": "palm_detection",
    "model_id": "yolov8-palm",
    "format": "geojson",
    "feature_count": 1247,
    "storage_key": "projects/{pid}/outputs/{output_id}.geojson",
    "cog_key": "projects/{pid}/outputs/{output_id}.tif",
    "tile_url_template": "/api/v1/tiles/cog/{z}/{x}/{y}?url={cog_key}"
  }
}
```

### `gee` — Google Earth Engine export
```json
{
  "source_type": "gee",
  "source_config": {
    "gee_export_id": "uuid",
    "asset_id": "projects/palmview/assets/...",
    "bands": ["B4", "B3", "B2"],
    "scale_m": 10,
    "cog_key": "projects/{pid}/gee/{export_id}.tif"
  }
}
```

### `pmtiles` — Pre-generated tile archive
```json
{
  "source_type": "pmtiles",
  "source_config": {
    "pmtiles_url": "https://cdn.palmview.ai/tiles/{archive}.pmtiles",
    "layer_name": "palm_detections",
    "min_zoom": 10,
    "max_zoom": 18
  }
}
```

### `external_url` — Third-party data source
```json
{
  "source_type": "external_url",
  "source_config": {
    "url": "https://example.com/data.geojson",
    "format": "geojson" | "csv" | "wms",
    "refresh_interval_s": null
  }
}
```

---

## 2. Save Flow (Kepler → Backend)

When user saves a map configuration:

```typescript
// Frontend: extract Kepler config + dataset metadata
async function saveMapConfig(keplerState: KeplerGlState, projectId: string) {
  const config = KeplerGlSchema.getConfigToSave(keplerState);
  const datasets = keplerState.visState.datasets;

  // Build dataset_refs from current Kepler datasets
  const datasetRefs = Object.entries(datasets).map(([dataId, dataset]) => ({
    kepler_dataset_id: dataId,
    label: dataset.label,
    source_type: dataset._palmview?.sourceType ?? 'internal',
    source_config: dataset._palmview?.sourceConfig ?? {
      format: 'unknown',
      storage_key: `uploads/${dataId}`
    },
    layer_order: dataset._palmview?.layerOrder ?? 0,
    visible: true,
  }));

  // POST to backend
  const response = await fetch(`/api/v1/projects/${projectId}/maps`, {
    method: 'POST',
    body: JSON.stringify({
      name: config.config?.visState?.mapInfo?.title || 'Untitled',
      config: config,           // Full Kepler config JSON
      config_hash: await sha256(JSON.stringify(config)),
      dataset_refs: datasetRefs,
    }),
  });
  return response.json(); // { config_id, version }
}
```

**Key design:** We attach `_palmview` metadata to Kepler dataset objects at load time. This carries source provenance through the Kepler store without modifying Kepler's core data model.

---

## 3. Load Flow (Backend → Kepler)

When user opens a saved map:

```typescript
async function loadMapConfig(configId: string, dispatch: Dispatch) {
  // 1. Fetch config + refs
  const { config, dataset_refs } = await fetch(`/api/v1/maps/${configId}`).then(r => r.json());

  // 2. Resolve each dataset_ref into actual data
  const datasets = await Promise.all(
    dataset_refs.map(async (ref: DatasetRef) => {
      const data = await resolveDataset(ref);
      return {
        info: {
          id: ref.kepler_dataset_id,
          label: ref.label,
          _palmview: {
            sourceType: ref.source_type,
            sourceConfig: ref.source_config,
            layerOrder: ref.layer_order,
          },
        },
        data,
      };
    })
  );

  // 3. Load into Kepler
  dispatch(addDataToMap({
    datasets,
    config: config.config,
    options: { centerMap: true, readOnly: false },
  }));
}

async function resolveDataset(ref: DatasetRef): Promise<any> {
  switch (ref.source_type) {
    case 'internal':
      return fetch(`/api/v1/data/${ref.source_config.storage_key}`).then(processData);

    case 'inference_output':
      return fetch(`/api/v1/outputs/${ref.source_config.output_id}/geojson`).then(processGeoJSON);

    case 'stac':
      // For raster: return tile URL config (rendered by TiTiler)
      // For vector: fetch and convert
      return fetchSTACAsset(ref.source_config);

    case 'gee':
      // COG already exported → serve via TiTiler
      return { tileUrl: ref.source_config.cog_key };

    case 'pmtiles':
      return { pmtilesUrl: ref.source_config.pmtiles_url };

    case 'external_url':
      return fetch(ref.source_config.url).then(processData);
  }
}
```

---

## 4. GeoAI Results → Kepler Integration

When analysis completes, the "Add to Map" button:

```typescript
function addResultsToMap(result: AnalysisResult, dispatch: Dispatch) {
  const dataset = {
    info: {
      id: `geoai-${result.taskId}`,
      label: `${result.stats.totalDetections} detections — ${new Date().toLocaleDateString()}`,
      _palmview: {
        sourceType: 'inference_output',
        sourceConfig: {
          output_id: result.taskId,
          task_type: result.stats.classBreakdown ? 'land_classification' : 'palm_detection',
          feature_count: result.stats.totalDetections,
        },
      },
    },
    data: processGeoJSON(result.geojson),
  };

  // addDataToMap is Kepler's standard action for injecting data
  dispatch(addDataToMap({
    datasets: [dataset],
    options: { centerMap: false, readOnly: false },
  }));

  // Kepler auto-creates a layer for the new dataset
  // We can further customize layer styling via updateLayerConfig
}
```

---

## 5. Streaming Results → Progressive Map Update

During analysis (WebSocket streaming):

```typescript
function handleWSMessage(msg: WSMessage, dispatch: Dispatch, taskId: string) {
  if (msg.type === 'partial_result') {
    // Append features to existing dataset
    // Option A: Accumulate in geoAiState, render via custom layer
    // Option B: Use Kepler's dataset update (heavier, causes re-render)

    // Recommended: Option A for streaming, Option B on complete
    dispatch({
      type: GeoAiActionTypes.UPDATE_PROGRESS,
      payload: { partialFeatures: msg.features },
    });
  }

  if (msg.type === 'complete') {
    // Final: inject full result as Kepler dataset
    dispatch({
      type: GeoAiActionTypes.SET_RESULTS,
      payload: { taskId: msg.task_id, duration: msg.duration },
    });
  }
}
```

**Streaming render strategy:**
- During processing: Custom `DetectionResultLayer` (deck.gl ScatterplotLayer / GeoJsonLayer) reads from `geoAiState.analysis.partialFeatures`
- On complete: Promote to full Kepler dataset via `addDataToMap`
- This avoids heavy Kepler re-renders during streaming

---

## 6. Confidence Filter → Map Layer

The confidence slider filters the map visualization in real-time:

```typescript
// In DetectionResultLayer or via Kepler filter
function getFilteredFeatures(
  features: GeoJSON.Feature[],
  threshold: number
): GeoJSON.Feature[] {
  return features.filter(f =>
    (f.properties?.confidence ?? 1) >= threshold
  );
}
```

For Kepler-native filtering after "Add to Map":
```typescript
dispatch(setFilter({
  dataId: `geoai-${taskId}`,
  name: 'confidence',
  type: 'range',
  value: [threshold, 1.0],
}));
```

---

## 7. Architecture Decision Records

### ADR-001: _palmview metadata on Kepler datasets
**Decision:** Attach `_palmview` object to dataset.info for provenance tracking.
**Rationale:** Non-invasive; Kepler ignores unknown fields. Survives serialization/restore cycle.
**Alternative rejected:** Separate lookup table — adds complexity, sync issues.

### ADR-002: Streaming via custom layer, then promote
**Decision:** Use custom deck.gl layer during streaming, promote to Kepler dataset on complete.
**Rationale:** Kepler's `addDataToMap` triggers full vis state recomputation (~100ms+). Unacceptable for per-tile updates (every 0.5-3s).
**Alternative rejected:** Direct Kepler dataset mutation — breaks immutability contract.

### ADR-003: inference_output as source_type
**Decision:** Add 'inference_output' to dataset_refs.source_type enum.
**Rationale:** Creates clean lineage: inference_job → run → output → dataset_ref → Kepler layer. Enables "show me all analyses for this area" queries.
