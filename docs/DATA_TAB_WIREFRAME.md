# Data Tab — Wireframe & Component Design

> 🌈 IRIS · 2026-02-20 · Method B: New tab via CustomPanelsFactory
> Handles GEE browsing, STAC search, file upload, dataset management

---

## Tab Registration

```typescript
CustomPanels.panels = [
  { id: 'geoai', label: 'GeoAI',  iconComponent: BrainIcon,    component: GeoAiPanel },
  { id: 'data',  label: 'Data',   iconComponent: DatabaseIcon,  component: DataPanel },
];
```

---

## Panel Layout

```
┌─────────────────────────────────────────┐
│ [Layers][Filters][🧠GeoAI][📊Data][Map]│
├─────────────────────────────────────────┤
│                                         │
│  ┌─ Data Sources ─────────────────────┐ │
│  │                                    │ │
│  │  [🛰 Satellite] [📁 Upload] [🔗 URL]│ │
│  │                                    │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ══════════════════════════════════════  │
│                                         │
│  (content changes based on source)      │
│                                         │
│  ┌─ Connected Datasets ──────────────┐  │
│  │                                   │  │
│  │  📄 palm_detections.geojson  [✕]  │  │
│  │  🛰 S2A_2026-01-15 RGB      [✕]  │  │
│  │  📊 land_cover_2025.tif     [✕]  │  │
│  │                                   │  │
│  │  3 datasets · 124 MB total        │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

---

## Source Views

### 🛰 Satellite (GEE + STAC)

```
┌─ Satellite Imagery ───────────────────┐
│                                       │
│  Provider: [GEE ▾]                    │
│                                       │
│  Collection:                          │
│  ┌─────────────────────────────────┐  │
│  │ 🔍 Search collections...       │  │
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │ 🛰 Sentinel-2 L2A              │  │
│  │    10m · 5 day revisit          │  │
│  ├─────────────────────────────────┤  │
│  │ 🛰 Landsat 8/9 Collection 2    │  │
│  │    30m · 16 day revisit         │  │
│  ├─────────────────────────────────┤  │
│  │ 🛰 Planet NICFI Basemaps       │  │
│  │    4.77m · monthly              │  │
│  └─────────────────────────────────┘  │
│                                       │
│  Date Range:                          │
│  [2025-01-01] → [2026-02-20]         │
│                                       │
│  Cloud Cover: ━━━━━━●━━ < 20%        │
│                                       │
│  Bands: [RGB ▾] [NDVI] [Custom...]   │
│                                       │
│  Area: Use current map extent ✓       │
│        Or draw AOI ☐                  │
│                                       │
│  [Search] → shows results below       │
│                                       │
│  ┌─ Results (12 scenes) ───────────┐  │
│  │ 📷 2026-02-18 · 3% cloud · ✓   │  │
│  │ 📷 2026-02-13 · 8% cloud · ☐   │  │
│  │ 📷 2026-02-08 · 15% cloud · ☐  │  │
│  │ ...                              │  │
│  └──────────────────────────────────┘ │
│                                       │
│  [Add to Map]  [Export COG]           │
└───────────────────────────────────────┘
```

### 📁 Upload

```
┌─ Upload Data ─────────────────────────┐
│                                       │
│  ┌─────────────────────────────────┐  │
│  │                                 │  │
│  │    📂 Drag & drop files here    │  │
│  │    or click to browse           │  │
│  │                                 │  │
│  │    GeoJSON · GeoTIFF · SHP      │  │
│  │    CSV · KML · GeoParquet       │  │
│  │                                 │  │
│  └─────────────────────────────────┘  │
│                                       │
│  Max file size: 500 MB                │
│  Storage: MinIO (palmview-assets)     │
│                                       │
│  ┌─ Upload Queue ─────────────────┐   │
│  │ ✓ fields.geojson    2.3 MB     │   │
│  │ ◉ imagery.tif      ████░ 67%  │   │
│  └────────────────────────────────┘   │
└───────────────────────────────────────┘
```

### 🔗 URL

```
┌─ External URL ────────────────────────┐
│                                       │
│  URL:                                 │
│  ┌─────────────────────────────────┐  │
│  │ https://example.com/data.geojson│  │
│  └─────────────────────────────────┘  │
│                                       │
│  Type: [Auto-detect ▾]               │
│  (GeoJSON / CSV / WMS / WMTS / XYZ)  │
│                                       │
│  [Preview]  [Add to Map]             │
└───────────────────────────────────────┘
```

---

## TypeScript Interfaces

```typescript
// ── Data Tab State ───────────────────────────────────
export type DataSourceView = 'satellite' | 'upload' | 'url';
export type SatelliteProvider = 'gee' | 'stac';

export interface SatelliteSearchParams {
  provider: SatelliteProvider;
  collectionId: string;
  dateRange: [string, string];  // ISO dates
  maxCloudCover: number;        // 0-100
  bands: string[];
  bbox: [number, number, number, number] | null;  // from map extent
}

export interface SatelliteScene {
  id: string;
  date: string;
  cloudCover: number;
  thumbnailUrl: string;
  assetUrl: string;
  provider: SatelliteProvider;
}

export interface UploadItem {
  id: string;
  filename: string;
  sizeBytes: number;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  progress: number;  // 0-1
  datasetId?: string;  // after processing
}

export interface ConnectedDataset {
  id: string;
  name: string;
  sourceType: string;
  sizeBytes: number;
  addedAt: string;
  keplerDatasetId: string;  // link to Kepler store
}

export interface DataTabState {
  activeView: DataSourceView;
  satellite: {
    provider: SatelliteProvider;
    searchParams: SatelliteSearchParams;
    results: SatelliteScene[];
    selectedSceneIds: string[];
    isSearching: boolean;
  };
  upload: {
    queue: UploadItem[];
    isDragOver: boolean;
  };
  url: {
    inputUrl: string;
    detectedType: string | null;
  };
  connectedDatasets: ConnectedDataset[];
}

// ── Component Props ──────────────────────────────────

export interface DataPanelProps {
  dataState: DataTabState;
  dispatch: (action: any) => void;
  mapState: KeplerMapState;  // for bbox
}

export interface DataSourceSelectorProps {
  activeView: DataSourceView;
  onSelect: (view: DataSourceView) => void;
}

export interface SatelliteSearchProps {
  params: SatelliteSearchParams;
  results: SatelliteScene[];
  selectedIds: string[];
  isSearching: boolean;
  onSearch: () => void;
  onParamChange: (params: Partial<SatelliteSearchParams>) => void;
  onSelectScene: (sceneId: string) => void;
  onAddToMap: () => void;
}

export interface FileUploadProps {
  queue: UploadItem[];
  isDragOver: boolean;
  onFileDrop: (files: FileList) => void;
  onRemove: (id: string) => void;
}

export interface ConnectedDatasetsProps {
  datasets: ConnectedDataset[];
  onRemove: (id: string) => void;
}
```

---

## Actions

```typescript
export const DataTabActions = {
  SET_DATA_VIEW:           '@@palmview/SET_DATA_VIEW',
  SET_SATELLITE_PROVIDER:  '@@palmview/SET_SATELLITE_PROVIDER',
  SET_SEARCH_PARAMS:       '@@palmview/SET_SEARCH_PARAMS',
  SEARCH_SATELLITE:        '@@palmview/SEARCH_SATELLITE',
  SET_SEARCH_RESULTS:      '@@palmview/SET_SEARCH_RESULTS',
  TOGGLE_SCENE_SELECTION:  '@@palmview/TOGGLE_SCENE_SELECTION',
  ADD_SCENES_TO_MAP:       '@@palmview/ADD_SCENES_TO_MAP',

  UPLOAD_FILES:            '@@palmview/UPLOAD_FILES',
  UPDATE_UPLOAD_PROGRESS:  '@@palmview/UPDATE_UPLOAD_PROGRESS',
  UPLOAD_COMPLETE:         '@@palmview/UPLOAD_COMPLETE',
  REMOVE_UPLOAD:           '@@palmview/REMOVE_UPLOAD',

  SET_URL_INPUT:           '@@palmview/SET_URL_INPUT',
  ADD_URL_TO_MAP:          '@@palmview/ADD_URL_TO_MAP',

  REMOVE_CONNECTED_DATASET:'@@palmview/REMOVE_CONNECTED_DATASET',
} as const;
```

---

## API Endpoints (Backend)

```
# Satellite / STAC
GET  /api/v1/data/collections              → available collections
POST /api/v1/data/search                   → search scenes (body: SatelliteSearchParams)
POST /api/v1/data/scenes/{id}/add-to-map   → import scene → dataset_ref

# GEE (proxy)
POST /api/v1/data/gee/export               → trigger GEE export to COG
GET  /api/v1/data/gee/exports/{id}/status   → export progress

# Upload
POST /api/v1/data/upload                   → multipart file upload → MinIO
GET  /api/v1/data/uploads/{id}/status      → processing status

# Connected datasets
GET  /api/v1/data/datasets                 → list connected datasets
DELETE /api/v1/data/datasets/{id}          → remove from project

# Tiles (served via TiTiler/Martin)
GET  /api/v1/tiles/cog/{z}/{x}/{y}         → COG tiles
GET  /api/v1/tiles/vector/{z}/{x}/{y}      → PostGIS vector tiles
```

---

## Component Hierarchy

```
DataPanel
├── DataSourceSelector
│   ├── SourceTab('satellite')
│   ├── SourceTab('upload')
│   └── SourceTab('url')
├── SatelliteSearch (when satellite active)
│   ├── ProviderSelector
│   ├── CollectionList
│   ├── DateRangePicker
│   ├── CloudCoverSlider
│   ├── BandSelector
│   ├── SearchButton
│   └── SceneResultList
│       └── SceneCard × N
├── FileUpload (when upload active)
│   ├── DropZone
│   └── UploadQueue
│       └── UploadItem × N
├── UrlInput (when url active)
│   ├── UrlField
│   └── TypeDetector
└── ConnectedDatasets (always visible at bottom)
    └── DatasetRow × N
```

---

## MVP Scope

**Sprint 1 (implement now):**
- Data source selector (3 tabs)
- File upload with drag & drop → MinIO
- Connected datasets list
- URL import (basic)

**Sprint 2 (next):**
- STAC search integration
- GEE proxy + export
- Scene preview thumbnails
- Band selection + visualization
