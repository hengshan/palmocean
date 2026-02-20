# GeoAI Tab — Wireframe & Interaction Spec v1.0

> 🌈 IRIS · Sprint 1 前置工作 · 2026-02-20
> 讨论方：Hank（产品）× Lyra（后端/ML）× IRIS（前端架构）

---

## Extension Strategy

Based on Kepler architecture analysis (see `KEPLER_EXTENSION_POINTS.md`):

- **Injection point:** `CustomPanelsFactory` replacement via `injectComponents()`
- **State management:** Parallel `geoAiReducer` with `@@palmview/` action prefix
- **AOI drawing:** Reuse Kepler's `editor-layer` + `@nebula.gl` (no reinvention)
- **Results overlay:** Custom `DetectionResultLayer` extending Kepler's `Layer` base class
- **AI chat:** Extend existing AI Assistant with PalmView-specific tools

---

## Panel Layout

The GeoAI tab occupies the same side panel slot as Layers/Filters/Interactions/Map.

```
┌─────────────────────────────────────┐
│ [Layers] [Filters] [🧠 GeoAI] [Map]│  ← Tab bar (CustomPanels.panels)
├─────────────────────────────────────┤
│                                     │
│  ┌─ 1. AOI Selection ────────────┐  │
│  │                               │  │
│  │  [□ Rect] [⬠ Poly] [✏ Free]  │  │
│  │                               │  │
│  │  📐 Area: 124.5 ha            │  │
│  │  📍 Center: 1.23°N, 103.45°E  │  │
│  │                               │  │
│  │  [Clear AOI]                   │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─ 2. Analysis ─────────────────┐  │
│  │                               │  │
│  │  💬 What would you like to do? │  │
│  │  ┌───────────────────────────┐│  │
│  │  │ Detect all oil palms in   ││  │
│  │  │ this area                 ││  │
│  │  └───────────────────────────┘│  │
│  │                               │  │
│  │  — or select a task —         │  │
│  │  ┌───────────┐ ┌───────────┐ │  │
│  │  │ 🌴 Tree   │ │ 🏗️ Change │ │  │
│  │  │ Detection │ │ Detection │ │  │
│  │  └───────────┘ └───────────┘ │  │
│  │  ┌───────────┐ ┌───────────┐ │  │
│  │  │ 🗺️ Land   │ │ 🔍 Object │ │  │
│  │  │ Classify  │ │ Segment   │ │  │
│  │  └───────────┘ └───────────┘ │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─ 3. Model Config (collapsed) ─┐  │
│  │  ▸ Model: Auto-select         │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐   │
│  │  ▶ Run Analysis              │   │  ← Primary CTA
│  └──────────────────────────────┘   │
│                                     │
│  ┌─ 4. Results (after run) ──────┐  │
│  │  ✓ Complete · 12.3s           │  │
│  │                               │  │
│  │  🌴 1,247 palms detected      │  │
│  │  ⚠️  3 disease zones           │  │
│  │  📐 124.5 ha analyzed          │  │
│  │                               │  │
│  │  Confidence ━━━━━━●━━ 0.70    │  │
│  │  Showing 1,247 / 1,502        │  │
│  │                               │  │
│  │  [Export ▾] [Add to Map]      │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─ 5. Task History (collapsed) ─┐  │
│  │  ▸ 3 previous analyses        │  │
│  └───────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

---

## Section Details

### Section 1: AOI Selection

**State:** `geoAiState.aoi`
```ts
interface AOIState {
  mode: 'rectangle' | 'polygon' | 'freehand' | null;
  geometry: GeoJSON.Polygon | null;
  areaHa: number;
  center: [number, number] | null;
}
```

**Interaction:**
1. User clicks a drawing tool → activates Kepler's `editor` mode
2. Drawing on map creates GeoJSON polygon
3. Area auto-calculated (Turf.js `area()`)
4. "Clear AOI" resets to null
5. If no AOI drawn → "Run Analysis" analyzes visible viewport

**Integration:** Dispatch `toggleEditorVisibility` + `setEditorMode` from `@kepler.gl/actions`.

---

### Section 2: Analysis

**Dual-input design:** NLP input OR task cards (progressive disclosure)

**Natural Language Input:**
- Text field with placeholder: "Detect all oil palms...", "Find deforestation changes...", "Classify land use..."
- Sends to backend NLP parser → maps to task + model + params
- Extends Kepler's AI Assistant tool system with PalmView tools

**Task Cards (Quick Select):**
| Card | Backend Task | Default Model |
|------|-------------|---------------|
| 🌴 Tree Detection | `palm_detection` | YOLOv8-Palm |
| 🏗️ Change Detection | `change_detection` | BIT-CD |
| 🗺️ Land Classify | `land_classification` | Prithvi-EO |
| 🔍 Object Segment | `segmentation` | SAM2 |

Clicking a card pre-fills the task; user can still modify via NLP.

---

### Section 3: Model Config (Collapsible)

**Default:** Collapsed, showing "Auto-select" (backend picks best model for task).

**Expanded:**
```
┌─ Model Configuration ──────────────┐
│                                     │
│  ○ Auto-select (recommended)        │
│  ● Manual selection:                │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ 🌴 YOLOv8-Palm       v1.2  │ ✓  │
│  │ P: 0.888 · R: 0.903        │    │
│  │ Speed: ~2s/tile             │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ 🧠 SAM2              v2.1  │    │
│  │ General segmentation        │    │
│  │ Speed: ~5s/tile             │    │
│  └─────────────────────────────┘    │
│                                     │
│  Advanced:                          │
│  Tile size: [256] × [256]           │
│  Overlap:   [32] px                 │
│  Batch:     [4]                     │
└─────────────────────────────────────┘
```

---

### Section 4: Results

**State transitions:**
```
Idle → Processing → Complete / Error
         ↓
   ┌─────────────────┐
   │ ◉ Analyzing...  │
   │ ████████░░ 78%   │
   │ Tile 312/400     │
   │ [Cancel]         │
   └─────────────────┘
```

**Complete state shows:**
- Summary stats (count, area, time)
- Confidence threshold slider (filters map overlay in real-time)
- Export dropdown: GeoJSON, Shapefile, CSV, GeoPackage
- "Add to Map" creates a Kepler layer from results

**Results → Map Integration:**
- Detection results rendered as `DetectionResultLayer` (custom Kepler layer)
- Points: circle markers colored by confidence ramp
- Polygons: filled with class colors from design system
- Hover: tooltip with confidence score, class, area

---

### Section 5: Task History

**Collapsed:** Shows count of previous analyses.

**Expanded:**
```
┌─ Task History ──────────────────────┐
│ 📋 2026-02-20 15:30                 │
│    🌴 Palm Detection · 1,247 trees  │
│    [Load] [Delete]                  │
│                                     │
│ 📋 2026-02-19 09:15                 │
│    🗺️ Land Classification · 5 class │
│    [Load] [Delete]                  │
└─────────────────────────────────────┘
```

---

## Map Interactions

### AOI Drawing Mode
- Cyan dashed border (`--geoai-cyan`) for AOI polygon
- Semi-transparent fill `rgba(0, 210, 255, 0.1)`
- Vertex handles for editing
- Double-click to complete polygon

### Detection Results Overlay
- Points: circles (radius by confidence), colored by class
- Polygons: filled with 40% opacity class color, 2px solid border
- Hover: tooltip card with details
- Click: select → highlight in results panel (bidirectional)

### Processing Visualization
- Tile grid overlay showing progress (processed tiles slightly highlighted)
- Current processing tile has pulsing cyan border

---

## Responsive Behavior

| Viewport | Layout |
|----------|--------|
| Desktop (>1200px) | Standard side panel |
| Tablet (768-1200px) | Collapsible panel, sections stacked |
| Mobile (<768px) | Bottom sheet (half height), map fills screen, swipe up to expand |

---

## Component Hierarchy (Implementation)

```
CustomPanelsFactory (replaced)
└── GeoAiPanel
    ├── AOISelector
    │   ├── DrawToolbar
    │   └── AOIInfo
    ├── AnalysisInput
    │   ├── NLPInput
    │   └── TaskCardGrid
    │       └── TaskCard × N
    ├── ModelConfig (collapsible)
    │   ├── ModelSelector
    │   │   └── ModelCard × N
    │   └── AdvancedParams
    ├── RunButton
    ├── ProcessingIndicator
    ├── ResultsPanel
    │   ├── ResultSummary
    │   ├── ConfidenceSlider
    │   └── ExportActions
    └── TaskHistory (collapsible)
        └── TaskHistoryItem × N
```

---

## Action/Reducer Design

```ts
// Actions (@@palmview/ prefix)
SET_AOI_MODE       // Toggle drawing tool
SET_AOI_GEOMETRY   // Store drawn AOI
SET_TASK_TYPE      // Select analysis task
SET_MODEL_CONFIG   // Manual model selection
RUN_ANALYSIS       // Trigger backend call
UPDATE_PROGRESS    // WebSocket progress updates
SET_RESULTS        // Store analysis results
SET_CONFIDENCE     // Filter threshold
CLEAR_RESULTS      // Reset
LOAD_HISTORY_ITEM  // Restore previous analysis

// Reducer shape
geoAiState: {
  aoi: AOIState,
  task: TaskState,
  model: ModelConfigState,
  analysis: AnalysisState,  // status, progress, results
  history: TaskHistoryItem[],
  confidence: number,       // 0-1 threshold
}
```

---

## API Contract (Frontend ↔ Backend)

```
POST /api/v1/analyze
Body: {
  aoi: GeoJSON.Polygon,
  task: "palm_detection" | "change_detection" | "land_classification" | "segmentation",
  model?: string,           // override auto-select
  params?: { tileSize, overlap, batchSize },
  nlpQuery?: string         // natural language input
}

Response: WebSocket stream
  → { type: "progress", tile: 312, total: 400, pct: 0.78 }
  → { type: "result", geojson: FeatureCollection, stats: {...} }
  → { type: "complete", taskId: "uuid", duration: 12.3 }
```

---

## Open Questions for Discussion

1. **@Hank:** Should NLP input be the primary interface or equal weight with task cards?
2. **@Lyra:** What's the expected latency per tile? Affects progress UX design.
3. **@Lyra:** Can we stream partial results (show detections as each tile completes)?
4. **@Altair:** Vercel edge functions for the NLP parsing, or all through FastAPI backend?
5. **All:** Tab icon — brain+satellite? Or something more distinctive?

---

*每一个像素都是宇宙给用户的情书 💌*
