# GeoAI Tab — Component Interfaces & TypeScript Definitions

> 🌈 IRIS · Sprint 1 · 2026-02-20
> Reference: GEOAI_TAB_WIREFRAME.md, KEPLER_EXTENSION_POINTS.md

---

## 1. State Types (geoAiReducer)

```typescript
// ── AOI ──────────────────────────────────────────────
export type AOIMode = 'rectangle' | 'polygon' | 'freehand' | null;

export interface AOIState {
  mode: AOIMode;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  areaHa: number;
  center: [number, number] | null;  // [lng, lat]
  isDrawing: boolean;
}

// ── Task ─────────────────────────────────────────────
export type TaskType =
  | 'palm_detection'
  | 'change_detection'
  | 'land_classification'
  | 'segmentation';

export interface TaskCard {
  id: TaskType;
  label: string;
  icon: string;        // emoji or icon component key
  description: string;
  defaultModel: string;
}

export interface TaskState {
  selectedTask: TaskType | null;
  nlpQuery: string;
}

// ── Model Config ─────────────────────────────────────
export type ModelSelectionMode = 'auto' | 'manual';

export interface ModelInfo {
  id: string;
  name: string;
  version: string;
  taskTypes: TaskType[];
  metrics?: {
    precision?: number;
    recall?: number;
    mAP50?: number;
  };
  estimatedSpeed: string;  // e.g. "~0.5s/tile"
}

export interface AdvancedParams {
  tileSize: number;    // default 256
  overlap: number;     // default 32
  batchSize: number;   // default 4
}

export interface ModelConfigState {
  selectionMode: ModelSelectionMode;
  selectedModelId: string | null;
  availableModels: ModelInfo[];
  advancedParams: AdvancedParams;
  isExpanded: boolean;
}

// ── Analysis ─────────────────────────────────────────
export type AnalysisStatus = 'idle' | 'submitting' | 'processing' | 'complete' | 'error';

export interface AnalysisProgress {
  currentTile: number;
  totalTiles: number;
  percentage: number;
  elapsedMs: number;
}

export interface AnalysisResult {
  taskId: string;
  geojson: GeoJSON.FeatureCollection;
  stats: {
    totalDetections: number;
    areaAnalyzedHa: number;
    durationSec: number;
    classBreakdown?: Record<string, number>;
    diseaseZones?: number;
  };
  confidenceRange: [number, number];
}

export interface AnalysisState {
  status: AnalysisStatus;
  progress: AnalysisProgress | null;
  result: AnalysisResult | null;
  error: string | null;
}

// ── History ──────────────────────────────────────────
export interface TaskHistoryItem {
  taskId: string;
  taskType: TaskType;
  modelId: string;
  timestamp: string;   // ISO-8601
  stats: AnalysisResult['stats'];
  aoiGeometry: GeoJSON.Polygon;
}

// ── Confidence Filter ────────────────────────────────
export interface ConfidenceState {
  threshold: number;   // 0-1, default 0.5
  filteredCount: number;
  totalCount: number;
}

// ── Root State ───────────────────────────────────────
export interface GeoAiState {
  aoi: AOIState;
  task: TaskState;
  model: ModelConfigState;
  analysis: AnalysisState;
  confidence: ConfidenceState;
  history: TaskHistoryItem[];
  isHistoryExpanded: boolean;
}
```

---

## 2. Action Types

```typescript
const PREFIX = '@@palmview/';

export const GeoAiActionTypes = {
  // AOI
  SET_AOI_MODE:        `${PREFIX}SET_AOI_MODE`,
  SET_AOI_GEOMETRY:    `${PREFIX}SET_AOI_GEOMETRY`,
  CLEAR_AOI:           `${PREFIX}CLEAR_AOI`,

  // Task
  SET_TASK_TYPE:        `${PREFIX}SET_TASK_TYPE`,
  SET_NLP_QUERY:        `${PREFIX}SET_NLP_QUERY`,

  // Model
  SET_MODEL_MODE:       `${PREFIX}SET_MODEL_MODE`,
  SELECT_MODEL:         `${PREFIX}SELECT_MODEL`,
  SET_ADVANCED_PARAMS:  `${PREFIX}SET_ADVANCED_PARAMS`,
  TOGGLE_MODEL_EXPAND:  `${PREFIX}TOGGLE_MODEL_EXPAND`,
  LOAD_AVAILABLE_MODELS:`${PREFIX}LOAD_AVAILABLE_MODELS`,

  // Analysis
  RUN_ANALYSIS:         `${PREFIX}RUN_ANALYSIS`,
  UPDATE_PROGRESS:      `${PREFIX}UPDATE_PROGRESS`,
  SET_RESULTS:          `${PREFIX}SET_RESULTS`,
  SET_ANALYSIS_ERROR:   `${PREFIX}SET_ANALYSIS_ERROR`,
  CANCEL_ANALYSIS:      `${PREFIX}CANCEL_ANALYSIS`,
  RESET_ANALYSIS:       `${PREFIX}RESET_ANALYSIS`,

  // Confidence
  SET_CONFIDENCE:       `${PREFIX}SET_CONFIDENCE`,

  // History
  LOAD_HISTORY:         `${PREFIX}LOAD_HISTORY`,
  RESTORE_HISTORY_ITEM: `${PREFIX}RESTORE_HISTORY_ITEM`,
  DELETE_HISTORY_ITEM:  `${PREFIX}DELETE_HISTORY_ITEM`,
  TOGGLE_HISTORY:       `${PREFIX}TOGGLE_HISTORY`,

  // Results → Kepler integration
  ADD_RESULTS_TO_MAP:   `${PREFIX}ADD_RESULTS_TO_MAP`,
} as const;
```

---

## 3. Component Props

```typescript
// ── GeoAiPanel (root) ────────────────────────────────
export interface GeoAiPanelProps {
  geoAiState: GeoAiState;
  dispatch: (action: any) => void;
  // Kepler props passed through from SidePanel
  datasets: KeplerDatasets;
  layers: KeplerLayer[];
  mapState: KeplerMapState;
}

// ── AOISelector ──────────────────────────────────────
export interface AOISelectorProps {
  aoi: AOIState;
  onSetMode: (mode: AOIMode) => void;
  onClear: () => void;
}

// ── AnalysisInput ────────────────────────────────────
export interface AnalysisInputProps {
  task: TaskState;
  availableTasks: TaskCard[];
  onSelectTask: (taskType: TaskType) => void;
  onNlpQueryChange: (query: string) => void;
  onNlpSubmit: () => void;
}

// ── TaskCard ─────────────────────────────────────────
export interface TaskCardProps {
  card: TaskCard;
  isSelected: boolean;
  onClick: () => void;
}

// ── ModelConfig ──────────────────────────────────────
export interface ModelConfigProps {
  model: ModelConfigState;
  onSetMode: (mode: ModelSelectionMode) => void;
  onSelectModel: (modelId: string) => void;
  onSetParams: (params: Partial<AdvancedParams>) => void;
  onToggleExpand: () => void;
}

// ── ModelCard ────────────────────────────────────────
export interface ModelCardProps {
  model: ModelInfo;
  isSelected: boolean;
  onClick: () => void;
}

// ── RunButton ────────────────────────────────────────
export interface RunButtonProps {
  canRun: boolean;      // AOI set + task selected
  status: AnalysisStatus;
  onRun: () => void;
  onCancel: () => void;
}

// ── ProcessingIndicator ──────────────────────────────
export interface ProcessingIndicatorProps {
  progress: AnalysisProgress;
  onCancel: () => void;
}

// ── ResultsPanel ─────────────────────────────────────
export interface ResultsPanelProps {
  result: AnalysisResult;
  confidence: ConfidenceState;
  onSetConfidence: (threshold: number) => void;
  onExport: (format: 'geojson' | 'shapefile' | 'csv' | 'geopackage') => void;
  onAddToMap: () => void;
}

// ── ConfidenceSlider ─────────────────────────────────
export interface ConfidenceSliderProps {
  threshold: number;
  filteredCount: number;
  totalCount: number;
  onChange: (value: number) => void;
}

// ── TaskHistory ──────────────────────────────────────
export interface TaskHistoryProps {
  items: TaskHistoryItem[];
  isExpanded: boolean;
  onToggle: () => void;
  onRestore: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}
```

---

## 4. API Types (Frontend ↔ Backend Contract)

```typescript
// ── Request ──────────────────────────────────────────
export interface AnalyzeRequest {
  aoi: GeoJSON.Polygon;
  task: TaskType;
  model?: string;
  params?: {
    tile_size?: number;
    overlap?: number;
    batch_size?: number;
  };
  nlp_query?: string;
}

// ── WebSocket Messages (backend → frontend) ──────────
export type WSMessage =
  | { type: 'progress'; tile: number; total: number; pct: number }
  | { type: 'partial_result'; features: GeoJSON.Feature[] }
  | { type: 'result'; geojson: GeoJSON.FeatureCollection; stats: AnalysisResult['stats'] }
  | { type: 'complete'; task_id: string; duration: number }
  | { type: 'error'; message: string; code: string };

// ── REST Endpoints ───────────────────────────────────
// POST /api/v1/analyze         → returns { task_id, ws_url }
// GET  /api/v1/tasks/{id}      → returns AnalysisResult
// GET  /api/v1/tasks           → returns TaskHistoryItem[]
// DELETE /api/v1/tasks/{id}    → soft delete
// GET  /api/v1/models          → returns ModelInfo[]
// POST /api/v1/tasks/{id}/export?format=geojson → download
```

---

## 5. dataset_refs ↔ Kepler Store Data Flow

See dedicated document: `DATASET_REFS_DATAFLOW.md`

---

## 6. Initial State & Defaults

```typescript
export const INITIAL_GEOAI_STATE: GeoAiState = {
  aoi: {
    mode: null,
    geometry: null,
    areaHa: 0,
    center: null,
    isDrawing: false,
  },
  task: {
    selectedTask: null,
    nlpQuery: '',
  },
  model: {
    selectionMode: 'auto',
    selectedModelId: null,
    availableModels: [],
    advancedParams: { tileSize: 256, overlap: 32, batchSize: 4 },
    isExpanded: false,
  },
  analysis: {
    status: 'idle',
    progress: null,
    result: null,
    error: null,
  },
  confidence: {
    threshold: 0.5,
    filteredCount: 0,
    totalCount: 0,
  },
  history: [],
  isHistoryExpanded: false,
};

export const AVAILABLE_TASKS: TaskCard[] = [
  {
    id: 'palm_detection',
    label: 'Tree Detection',
    icon: '🌴',
    description: 'Detect and count individual trees',
    defaultModel: 'yolov8-palm',
  },
  {
    id: 'change_detection',
    label: 'Change Detection',
    icon: '🏗️',
    description: 'Detect land use changes over time',
    defaultModel: 'bit-cd',
  },
  {
    id: 'land_classification',
    label: 'Land Classification',
    icon: '🗺️',
    description: 'Classify land cover types',
    defaultModel: 'prithvi-eo',
  },
  {
    id: 'segmentation',
    label: 'Object Segmentation',
    icon: '🔍',
    description: 'Segment objects with precise boundaries',
    defaultModel: 'sam2',
  },
];
```
