# Kepler.gl Architecture & Extension Points

> Analysis of the Kepler.gl fork at `~/projects/kepler.gl` for PalmView GeoAI integration.
> Generated: 2026-02-20

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Side Panel Extension](#2-side-panel-extension)
3. [AI Assistant Integration](#3-ai-assistant-integration)
4. [Custom Layer Types](#4-custom-layer-types)
5. [Action/Reducer Extension](#5-actionreducer-extension)
6. [Component Injection Points](#6-component-injection-points)
7. [Data Processing Pipeline](#7-data-processing-pipeline)
8. [Recommended Extension Strategy for PalmView GeoAI](#8-recommended-extension-strategy-for-palmview-geoai)

---

## 1. Architecture Overview

### Redux State Shape

Kepler.gl uses a multi-instance Redux architecture. The root reducer (`src/reducers/src/root.ts`) manages a map of instance states keyed by instance ID:

```
store.keplerGl = {
  [instanceId]: {
    visState:      // Layers, filters, datasets, interactions, animations
    mapState:      // Viewport (lat, lng, zoom, bearing, pitch)
    mapStyle:      // Basemap style, layer groups, custom styles
    uiState:       // Active panel, modals, export settings, locale
    providerState: // Cloud provider auth state
  }
}
```

### Key Files

| Concern | File |
|---------|------|
| State shape | `src/reducers/src/core.ts` — `KeplerGlState` type |
| Root reducer | `src/reducers/src/root.ts` — multi-instance routing via `_actionFor(id, action)` |
| Action types | `src/actions/src/action-types.ts` — all `@@kepler.gl/` prefixed constants |
| Action creators | `src/actions/src/vis-state-actions.ts`, `ui-state-actions.ts`, `map-state-actions.ts`, `map-style-actions.ts` |
| Updaters | `src/reducers/src/vis-state-updaters.ts` (largest, ~2000+ lines), etc. |

### Action Routing Pattern

Actions are prefixed with `@@kepler.gl/` and routed to the correct instance via `_actionFor(instanceId, action)`. The `action-wrapper.ts` module wraps actions with an `address` field so the root reducer can dispatch to the right sub-state.

### Task/Side-Effect Pattern

Kepler.gl uses **react-palm** for side effects. Updaters return `withTask(newState, task)` where tasks are declarative descriptions of side effects (file loading, data processing, delayed actions). The `taskMiddleware` must be applied to the Redux store.

### Lens Pattern

State selectors called "lenses" (`mapStateLens`, `visStateLens`, `uiStateLens`, `mapStyleLens`, `providerStateLens`) in `src/reducers/src/core.ts` extract sub-states for component injection via `withState()`.

---

## 2. Side Panel Extension

### How the Sidebar Works

**Entry point:** `src/components/src/side-panel.tsx` — `SidePanelFactory`

The sidebar has a **tab system** defined by the `SIDEBAR_PANELS` constant in `src/constants/src/default-settings.ts`:

```ts
export const SIDEBAR_PANELS = [
  { id: 'layer',       label: 'sidebar.panels.layer',       onClick: null },
  { id: 'filter',      label: 'sidebar.panels.filter',      onClick: null },
  { id: 'interaction', label: 'sidebar.panels.interaction', onClick: null },
  { id: 'map',         label: 'sidebar.panels.basemap',     onClick: null }
];
```

### Panel Registration Flow

1. `SidePanelFactory` maps each panel ID to a **component** and **icon**:
   ```ts
   const SIDEBAR_COMPONENTS = {
     layer: LayerManager,
     filter: FilterManager,
     interaction: InteractionManager,
     map: MapManager
   };
   const SIDEBAR_ICONS = {
     layer: Layers, filter: FilterFunnel,
     interaction: PointerClick, map: BaseMap
   };
   ```

2. These are merged into `SidePanelItem[]`:
   ```ts
   type SidePanelItem = {
     id: string;
     label: string;
     iconComponent: React.ComponentType;
     component: React.ComponentType;
     onClick?: (id: string) => void;
   };
   ```

3. **Custom panels** are appended via `CustomPanelsFactory` (`src/components/src/side-panel/custom-panel.tsx`):
   ```ts
   const fullPanels = [...defaultSidePanels, ...(CustomPanels.panels || [])];
   ```

4. `PanelToggle` renders tab icons; clicking sets `uiState.activeSidePanel` via `toggleSidePanel(panelId)`.

5. The active panel's component is rendered:
   ```ts
   const currentPanel = panels.find(({id}) => id === activeSidePanel);
   const PanelComponent = currentPanel?.component;
   ```

### ⭐ How to Add a "GeoAI" Tab

**Option A: Replace `CustomPanelsFactory` (Recommended)**

```tsx
import {CustomPanelsFactory} from '@kepler.gl/components';
import {GeoAIIcon} from './icons';
import GeoAIPanel from './geo-ai-panel';

function CustomGeoAIPanelsFactory() {
  const CustomPanels = () => <div />;
  
  CustomPanels.panels = [{
    id: 'geoai',
    label: 'GeoAI',
    iconComponent: GeoAIIcon,
    component: GeoAIPanel
  }];
  
  CustomPanels.getProps = (sidePanelProps) => ({
    datasets: sidePanelProps.datasets,
    layers: sidePanelProps.layers,
    visStateActions: sidePanelProps.visStateActions
  });
  
  return CustomPanels;
}

// Register replacement
const replacements = [[CustomPanelsFactory, CustomGeoAIPanelsFactory]];
```

**Option B: Replace `SidePanelFactory` entirely** — gives full control but more maintenance burden.

### Props Available to Panel Components

Panel components receive all `SidePanelProps` (datasets, layers, filters, layerClasses, all action dispatchers) plus any props returned by `CustomPanels.getProps()`.

---

## 3. AI Assistant Integration

### Architecture

The AI assistant lives in `src/ai-assistant/src/` and operates as a **separate reducer** alongside Kepler.gl's state (not inside it):

```
store = {
  keplerGl: { map: KeplerGlState },
  aiAssistant: AiAssistantState    // <-- parallel, not nested
}
```

### State Shape (`AiAssistantState`)

```ts
{
  config: {
    isReady: boolean;
    provider: 'openai' | 'google' | string;
    model: string;
    apiKey: string;
    baseUrl?: string;
    temperature: number;
    topP: number;
  },
  messages: MessageModel[],
  screenshotToAsk: {
    startScreenCapture: boolean;
    screenCaptured: string;
  },
  keplerGl?: {
    mapBoundary?: { nw: [number, number]; se: [number, number] }
  }
}
```

### Actions

| Action | Purpose |
|--------|---------|
| `UPDATE_AI_ASSISTANT_CONFIG` | Update LLM provider/model/apiKey settings |
| `UPDATE_AI_ASSISTANT_MESSAGES` | Persist chat messages |
| `SET_START_SCREEN_CAPTURE` | Trigger screenshot for visual Q&A |
| `SET_SCREEN_CAPTURED` | Store captured screenshot |
| `SET_MAP_BOUNDARY` | Store current map viewport boundary |

Action prefix: `@@openassistant/`

### LLM Tool System

The AI assistant uses **function-calling tools** registered in `src/ai-assistant/src/tools/tools.tsx`:

```ts
export function setupLLMTools({ visState, aiAssistant, dispatch }) {
  return {
    ...getKeplerTools(visState, aiAssistant),    // Layer, basemap, data ops
    ...getEchartsTools(visState.datasets, ...),  // Chart generation
    ...getGeoTools(aiAssistant, ...),            // Geo operations
    ...getQueryTool(visState.datasets, ...)      // Data queries
  };
}
```

**Kepler Tools** (`src/ai-assistant/src/tools/kepler-tools/`):
- `basemap-tool.tsx` — Change basemap style
- `boundary-tool.tsx` — Set/get map boundary
- `layer-creation-tool.tsx` — Create layers via NL
- `layer-style-tool.tsx` — Modify layer styling
- `loaddata-tool.tsx` — Load datasets
- `save-data-tool.tsx` — Export data
- `table-tool.tsx` — Data table operations

**Other Tools:**
- `echarts-tools.tsx` — Generate charts from data
- `geo-tools.tsx` — Spatial operations
- `query-tool.tsx` — SQL-like data queries
- `lisa-tool.tsx` — Spatial autocorrelation (LISA)

### UI Component

`AiAssistantComponent` (`src/ai-assistant/src/components/ai-assistant-component.tsx`) uses:
- `@openassistant/core` — `useAssistant` hook for LLM conversation management
- `@openassistant/ui` — `AiAssistant` chat UI component
- Dataset context is injected into LLM instructions via `getDatasetContext()`
- Tools are re-initialized when datasets/layers change

### ⭐ Extending for GeoAI

The tool system is **highly extensible**. To add PalmView GeoAI capabilities:

1. **Create new tools** in `tools/palmview-tools/`:
   - `aoi-tool.tsx` — Draw AOI, get coordinates
   - `detection-tool.tsx` — Trigger palm/building detection model
   - `result-tool.tsx` — Load detection results as layers
   
2. **Register them** by extending `setupLLMTools()`:
   ```ts
   ...getPalmViewTools(visState, aiAssistant, dispatch)
   ```

3. **Or run a parallel assistant** — since the AI assistant is a standalone component, you can instantiate a separate GeoAI-specific assistant in the GeoAI panel with different instructions and tools.

---

## 4. Custom Layer Types

### Layer Registration

All layer types are registered in `src/layers/src/index.ts` via a `LayerClasses` map:

```ts
import { LAYER_TYPES } from '@kepler.gl/constants';

export const LayerClasses = {
  [LAYER_TYPES.point]: PointLayer,
  [LAYER_TYPES.arc]: ArcLayer,
  [LAYER_TYPES.geojson]: GeojsonLayer,
  // ... 14+ layer types
};
```

`LAYER_TYPES` is defined in `@kepler.gl/constants` and maps string keys to string values.

### Layer Class Hierarchy

```
Layer (base-layer.ts)
├── AggregationLayer
│   ├── GridLayer
│   ├── HexagonLayer
│   └── ClusterLayer
├── PointLayer
├── ArcLayer / LineLayer
├── GeojsonLayer
├── IconLayer
├── HeatmapLayer
├── H3Layer
├── TripLayer
├── ScenegraphLayer
├── VectorTileLayer
├── RasterTileLayer
└── WMSLayer
```

### Extending with a Custom Layer

Every layer extends `Layer` (from `base-layer.ts`) and must implement:

```ts
class DetectionResultLayer extends Layer {
  // Required overrides
  get type() { return 'detectionResult'; }
  get name() { return 'Detection Results'; }
  get layerIcon() { return DetectionResultIcon; }
  get visualChannels() { /* color, size channels */ }
  
  static findDefaultLayerProps(dataset, foundLayers) { /* auto-detect */ }
  
  getDefaultLayerConfig(props) { /* config shape */ }
  formatLayerData(datasets, oldLayerData) { /* prepare deck.gl data */ }
  renderLayer(opts) { /* return deck.gl layer instance */ }
  
  // Optional
  get supportedColumnModes() { /* column configuration modes */ }
  calculateDataAttribute(dataset, getPosition) { /* data transform */ }
}
```

### Registering Custom Layers

**Option 1: Fork — add to `LayerClasses` directly**

**Option 2: Runtime — pass `layerClasses` prop** to KeplerGl component:
```tsx
import {LayerClasses} from '@kepler.gl/layers';

const customLayerClasses = {
  ...LayerClasses,
  detectionResult: DetectionResultLayer
};

<KeplerGl layerClasses={customLayerClasses} />
```

The `layerClasses` prop flows through to `visState` and is used by `addLayer` and `layerTypeChange` updaters.

---

## 5. Action/Reducer Extension

### Three Extension Mechanisms

#### A. `.plugin()` — Add Custom Reducer Logic

The exported `keplerGlReducer` has a `.plugin()` method that lets you intercept actions:

```ts
const enhancedReducer = keplerGlReducer
  .plugin({
    // Reducer map: action type → handler
    'PALMVIEW_DETECTION_COMPLETE': (state, action) => ({
      ...state,
      visState: {
        ...state.visState,
        // Add detection results as new dataset/layer
      }
    })
  });

// Or with override to replace default behavior:
keplerGlReducer.plugin(customReducer, {
  override: { [ActionTypes.ADD_LAYER]: true }
});
```

**Important:** The state passed to plugin handlers is the **instance state** (`KeplerGlState`), not the root state. Each instance is processed individually.

#### B. `.initialState()` — Custom Initial State + Extra Reducers

```ts
const reducer = keplerGlReducer
  .initialState(
    { uiState: { readOnly: false } },
    { geoAiState: geoAiReducer }  // extra sub-reducers!
  );
```

The `extraReducers` parameter in `coreReducerFactory` is passed to `combineReducers`, adding new sub-states alongside `visState`, `mapState`, etc.

#### C. Listen to Kepler Actions from External Reducers

Since all actions are prefixed `@@kepler.gl/`, any reducer in the store can listen:

```ts
const appReducer = handleActions({
  [ActionTypes.UPDATE_MAP]: (state, action) => ({
    ...state,
    viewport: action.payload
  }),
  [ActionTypes.ADD_DATA]: (state, action) => ({
    ...state,
    lastDatasetAdded: Date.now()
  })
}, initialState);
```

### Custom Action Pattern

Define PalmView-specific actions with a different prefix:

```ts
const PALMVIEW_PREFIX = '@@palmview/';
export const PalmViewActionTypes = {
  START_DETECTION: `${PALMVIEW_PREFIX}START_DETECTION`,
  DETECTION_PROGRESS: `${PALMVIEW_PREFIX}DETECTION_PROGRESS`,
  DETECTION_COMPLETE: `${PALMVIEW_PREFIX}DETECTION_COMPLETE`,
  SET_AOI: `${PALMVIEW_PREFIX}SET_AOI`,
  SELECT_MODEL: `${PALMVIEW_PREFIX}SELECT_MODEL`,
};
```

---

## 6. Component Injection Points

### Factory/Dependency Injection System

Kepler.gl uses a **factory pattern** for all components. Every component is created by a factory function, and factories declare their dependencies:

```ts
SidePanelFactory.deps = [
  SidebarFactory,
  PanelHeaderFactory,
  PanelToggleFactory,
  LayerManagerFactory,
  FilterManagerFactory,
  InteractionManagerFactory,
  MapManagerFactory,
  CustomPanelsFactory   // <-- injection point for custom panels!
];
```

### `injectComponents()` — Replace Any Component

The `injector` system (`src/components/src/injector.tsx`) allows replacing any factory:

```tsx
import {injectComponents, SidePanelFactory, CustomPanelsFactory} from '@kepler.gl/components';

// Replace CustomPanelsFactory with our own
const KeplerGl = injectComponents([
  [CustomPanelsFactory, MyCustomPanelsFactory],
  // Can replace ANY factory
  [PanelHeaderFactory, MyPanelHeaderFactory],
]);

// Use the customized KeplerGl
<KeplerGl id="map" />
```

### `withState()` — Connect Custom Components to Kepler State

For custom components that need Kepler's internal state:

```tsx
import {withState, visStateLens, mapStateLens} from '@kepler.gl/components';
import {visStateActions} from '@kepler.gl/actions';

const ConnectedGeoAIPanel = withState(
  [visStateLens, mapStateLens],       // which sub-states to inject
  (state) => ({ app: state.app }),     // additional mapStateToProps
  { addLayer: visStateActions.addLayer } // action creators to bind
)(GeoAIPanel);
```

### Key Injectable Factories

| Factory | Purpose | Extension Use |
|---------|---------|---------------|
| `CustomPanelsFactory` | Custom sidebar tabs | **Primary — add GeoAI tab** |
| `SidePanelFactory` | Entire sidebar | Replace sidebar layout |
| `PanelHeaderFactory` | Top header with export menu | Add GeoAI menu items |
| `MapContainerFactory` | Map viewport | Add overlay controls |
| `MapControlFactory` | Map control buttons | Add AOI drawing toggle |
| `LayerPanelFactory` | Individual layer config | Custom layer config UI |
| `FilterPanelFactory` | Filter configuration | Custom filter types |

---

## 7. Data Processing Pipeline

### Flow: Upload → Processing → Visualization

```
User uploads file
    │
    ▼
LOAD_FILES action
    │
    ▼
vis-state-updaters.ts: loadFilesUpdater()
    │  Creates LOAD_FILE_TASK (react-palm)
    ▼
File reader (CSV, JSON, GeoJSON, Arrow)
    │
    ▼
PROCESS_FILE_DATA task
    │  Runs processors from src/processors/src/data-processor.ts
    │  - processCsvData() / processGeojson() / processArrowTable()
    │  - Type analysis, field detection, geospatial column detection
    ▼
LOAD_FILE_STEP_SUCCESS / LOAD_BATCH_DATA_SUCCESS
    │
    ▼
ADD_DATA action (can also be called directly)
    │  payload: { datasets: [{ info, data }], options, config }
    ▼
vis-state-updaters.ts: updateVisDataUpdater()
    │  1. Create KeplerTable dataset(s)
    │  2. Auto-detect and create layers (findDefaultLayer)
    │  3. Apply filters
    │  4. Build layer data arrays
    ▼
State updated → React re-renders → deck.gl renders layers
```

### Key Processing Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `processCsvData` | `src/processors/src/data-processor.ts` | Parse CSV → rows + fields |
| `processGeojson` | same | Normalize GeoJSON features |
| `processArrowTable` | same | Apache Arrow table processing |
| `createNewDataEntry` | `src/table/src/` | Create `KeplerTable` from processed data |
| `findDefaultLayer` | `src/reducers/src/layer-utils.ts` | Auto-detect appropriate layer types |

### Adding Data Programmatically

```ts
import {addDataToMap} from '@kepler.gl/actions';

dispatch(addDataToMap({
  datasets: {
    info: { id: 'detection_results', label: 'Palm Detections' },
    data: processedGeoJson
  },
  options: { centerMap: true, readOnly: false },
  config: { /* optional layer/filter config */ }
}));
```

---

## 8. Recommended Extension Strategy for PalmView GeoAI

### Architecture Decision

**Use a hybrid approach:**
1. **`CustomPanelsFactory` replacement** for the GeoAI sidebar tab
2. **Parallel `geoAiState` reducer** via `.initialState()`'s `extraReducers`
3. **Extend AI assistant tools** for NL commands
4. **Custom layer type** for detection result visualization

### Implementation Plan

#### Phase 1: GeoAI Panel (Sprint 1)

```
src/palmview/
├── actions/
│   ├── action-types.ts          # @@palmview/ prefixed actions
│   └── geoai-actions.ts         # AOI, model selection, detection actions
├── reducers/
│   └── geoai-reducer.ts         # GeoAI state management
├── components/
│   ├── geoai-panel.tsx          # Main GeoAI sidebar panel
│   ├── aoi-selector.tsx         # AOI drawing interface
│   ├── model-selector.tsx       # ML model picker (palm, building, etc.)
│   ├── detection-progress.tsx   # Job progress tracker
│   └── result-viewer.tsx        # Detection results summary
├── layers/
│   └── detection-layer.ts       # Custom layer for bounding boxes / polygons
├── tools/
│   └── palmview-tools.ts        # LLM function-calling tools
└── index.ts                     # Factory exports
```

#### Phase 2: Store Setup

```ts
import keplerGlReducer from '@kepler.gl/reducers';
import { geoAiReducer } from './palmview/reducers/geoai-reducer';

const reducer = keplerGlReducer
  .initialState(
    { uiState: { activeSidePanel: 'layer' } },
    { geoAiState: geoAiReducer }
  );

const store = createStore(
  combineReducers({
    keplerGl: reducer,
    aiAssistant: aiAssistantReducer  // Keep existing AI assistant
  }),
  applyMiddleware(taskMiddleware)
);
```

#### Phase 3: Component Injection

```tsx
import {injectComponents, CustomPanelsFactory} from '@kepler.gl/components';
import GeoAIPanelFactory from './palmview/components/geoai-panel';

// Replace CustomPanelsFactory
function PalmViewCustomPanelsFactory() {
  const CustomPanels = () => <div />;
  CustomPanels.panels = [{
    id: 'geoai',
    label: 'GeoAI',
    iconComponent: PalmTreeIcon,  // Custom icon
    component: GeoAIPanel
  }];
  CustomPanels.getProps = (props) => ({
    datasets: props.datasets,
    layers: props.layers,
    mapState: props.mapState,
    visStateActions: props.visStateActions
  });
  return CustomPanels;
}

export const PalmViewApp = injectComponents([
  [CustomPanelsFactory, PalmViewCustomPanelsFactory]
]);
```

#### Phase 4: GeoAI State Shape

```ts
interface GeoAiState {
  aoi: {
    geometry: GeoJSON.Polygon | null;
    drawingMode: boolean;
  };
  model: {
    selected: 'palm-detection' | 'building-footprint' | null;
    version: string;
    config: Record<string, any>;
  };
  detection: {
    status: 'idle' | 'submitting' | 'processing' | 'complete' | 'error';
    jobId: string | null;
    progress: number;  // 0-100
    results: {
      datasetId: string;
      layerId: string;
      count: number;
      summary: Record<string, any>;
    } | null;
    error: string | null;
  };
  history: Array<{
    jobId: string;
    model: string;
    aoi: GeoJSON.Polygon;
    timestamp: number;
    resultCount: number;
  }>;
}
```

#### Phase 5: Detection Result Flow

```
User draws AOI → SET_AOI action
    │
User selects model → SELECT_MODEL action
    │
User clicks "Run Detection" → START_DETECTION action
    │
    ▼
Middleware/thunk calls PalmView API
    │  POST /api/detect { aoi, model, config }
    ▼
Poll for results → DETECTION_PROGRESS updates
    │
    ▼
Results ready → DETECTION_COMPLETE
    │  1. Download GeoJSON results from API
    │  2. Dispatch addDataToMap() with detection GeoJSON
    │  3. Auto-create DetectionResultLayer
    │  4. Fit map bounds to results
    ▼
Detection results visible on map
```

#### Phase 6: LLM Tools for GeoAI

```ts
// tools/palmview-tools.ts
export function getPalmViewTools(geoAiState, visState, dispatch) {
  return {
    detect_palms: {
      description: 'Run palm tree detection on the current map view or specified area',
      parameters: {
        model: { type: 'string', enum: ['palm-v1', 'palm-v2'] },
        area: { type: 'string', description: 'Area description or "current view"' }
      },
      execute: async ({ model, area }) => {
        // Set AOI from current viewport or geocode area
        // Trigger detection
      }
    },
    show_detection_results: {
      description: 'Display detection results on the map',
      parameters: { jobId: { type: 'string' } },
      execute: async ({ jobId }) => { /* load results */ }
    }
  };
}
```

### Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Kepler.gl updates breaking fork | Minimize direct file changes; prefer injection/plugin patterns |
| State isolation | Keep `geoAiState` separate from Kepler's internal state |
| Large detection results | Use Arrow format + streaming; leverage Kepler's batch loading |
| AOI drawing conflicts with map interaction | Use Kepler's existing editor layer (`src/layers/src/editor-layer/`) which already handles draw modes |

### Existing Editor Layer — AOI Drawing

Kepler already has an **editor layer** (`src/layers/src/editor-layer/`) with draw/edit capabilities using `@nebula.gl/edit-modes`. This can be reused for AOI drawing rather than building from scratch:

- `EditorLayerUtils.isDrawingActive()` — check if drawing mode is active
- `EditorLayerUtils.onClick()` / `onHover()` — handle map interactions during drawing
- The editor supports polygon, rectangle, and lasso drawing modes
- Features are stored in `visState.editor.features`

---

## Appendix: Key Import Paths

```ts
// Actions
import { ActionTypes, addDataToMap, toggleSidePanel } from '@kepler.gl/actions';

// Reducers
import keplerGlReducer, { visStateLens, mapStateLens } from '@kepler.gl/reducers';

// Components
import {
  injectComponents,
  CustomPanelsFactory,
  SidePanelFactory,
  PanelHeaderFactory,
  withState
} from '@kepler.gl/components';

// Layers
import { Layer, LayerClasses } from '@kepler.gl/layers';

// Constants
import { SIDEBAR_PANELS, LAYER_TYPES } from '@kepler.gl/constants';

// Processors
import { processGeojson, processCsvData } from '@kepler.gl/processors';

// AI Assistant
import { aiAssistantReducer, setupLLMTools } from '@kepler.gl/ai-assistant';
```
