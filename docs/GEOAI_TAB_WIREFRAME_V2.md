# GeoAI Tab — Wireframe v2.0 (Post-Hank Review)

> 🌈 IRIS · 2026-02-20 · Incorporates Hank's feedback from Council #59
> Changes from v1: Results → floating panel, Task Cards by function category,
> History merged with Tasks, Data integration evaluation

---

## Key Changes from v1

| Area | v1 | v2 |
|------|----|----|
| Results | In sidebar | **Floating panel** (draggable, resizable) |
| Task Cards | By specific task | **By function** (Segmentation → Detection → Classification) |
| History | Separate section | **Merged with Tasks** (commit-log tree) |
| AOI | Custom buttons | **Quick-access buttons → Kepler editor** (no custom drawing tools) |

---

## Side Panel Layout (GeoAI Tab)

```
┌─────────────────────────────────────┐
│ [Layers] [Filters] [🧠 GeoAI] [Map]│
├─────────────────────────────────────┤
│                                     │
│  ┌─ 1. AOI Quick Access ─────────┐  │
│  │                               │  │
│  │  [□ Rectangle] [⬠ Polygon]    │  │
│  │                               │  │
│  │  📐 124.5 ha · 1.23°N 103.4°E │  │
│  │  [Clear]                       │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─ 2. Analysis Function ────────┐  │
│  │                               │  │
│  │  ┌───────────┐ ┌───────────┐  │  │
│  │  │ 🔍        │ │ 📍        │  │  │
│  │  │ Segment-  │ │ Detect-   │  │  │
│  │  │ ation     │ │ ion       │  │  │
│  │  └───────────┘ └───────────┘  │  │
│  │  ┌───────────┐ ┌───────────┐  │  │
│  │  │ 🗺️        │ │ 🔄        │  │  │
│  │  │ Classifi- │ │ Change    │  │  │
│  │  │ cation    │ │ Detection │  │  │
│  │  └───────────┘ └───────────┘  │  │
│  │                               │  │
│  │  Selected: Detection          │  │
│  │  ┌───────────────────────────┐│  │
│  │  │ What to detect?           ││  │
│  │  │ ┌───────────────────────┐ ││  │
│  │  │ │ Oil palm trees        │ ││  │
│  │  │ └───────────────────────┘ ││  │
│  │  │ Quick: [🌴Palm] [🌳Tree]  ││  │
│  │  │        [🏠Building] [🚗Car]││  │
│  │  └───────────────────────────┘│  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─ 3. Model Config (▸ collapsed)┐  │
│  │  Auto-select · YOLOv8-Palm     │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐   │
│  │  ▶ Run Analysis              │   │
│  └──────────────────────────────┘   │
│                                     │
│  ┌─ 4. Task History ─────────────┐  │
│  │                               │  │
│  │  ● 18:30 Detection · 1,247🌴 │  │
│  │  │                            │  │
│  │  ● 17:15 Classification · 5c │  │
│  │  │                            │  │
│  │  ● 16:00 Segmentation · 42   │  │
│  │                               │  │
│  │  ▸ Show older (2 more)        │  │
│  └───────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

---

## Floating Results Panel (on map canvas)

Triggered when analysis completes. Appears over the map, not in sidebar.

```
┌─ Results ─────────────────── [📌] [─] [✕] ─┐
│                                              │
│  🌴 Palm Detection · 12.3s                   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                              │
│  ┌────────┐  ┌────────┐  ┌────────┐         │
│  │ 1,247  │  │ 124.5  │  │   3    │         │
│  │ palms  │  │   ha   │  │ alerts │         │
│  └────────┘  └────────┘  └────────┘         │
│                                              │
│  Confidence ━━━━━━━━●━━━━ 0.70               │
│  Showing 1,247 / 1,502 detections            │
│                                              │
│  ┌─ Class Breakdown ──────────────────────┐  │
│  │ 🟢 Healthy    1,180  ████████████░░░   │  │
│  │ 🟡 Stressed      52  ██░░░░░░░░░░░░   │  │
│  │ 🔴 Disease        15  █░░░░░░░░░░░░░   │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  [Export ▾]  [Add to Map]  [View Report]     │
│                                              │
└──────────────────────────────────────────────┘

Controls:
  [📌] Pin/unpin (pinned = stays visible when interacting with map)
  [─]  Minimize (collapse to title bar only)
  [✕]  Close (results remain in history)
```

### Floating Panel Behavior
- **Position:** Bottom-right of map canvas (default), draggable
- **Size:** 400×350px default, resizable (min 300×200, max 600×500)
- **Backdrop:** Semi-transparent `rgba(41, 50, 60, 0.92)` — Kepler panel style
- **Z-index:** Above map, below modals
- **State sync:** Panel state lives in `geoAiState.resultsPanel`
- **Implementation:** Extend Kepler's `MapControlPanel` pattern + CSS `resize` + drag handler

### TypeScript Addition
```typescript
export interface ResultsPanelState {
  isVisible: boolean;
  isPinned: boolean;
  isMinimized: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

// Add to GeoAiState
export interface GeoAiState {
  // ... existing fields ...
  resultsPanel: ResultsPanelState;
}
```

---

## Section 2: Function-Based Task Flow

### Step 1: Select Function Category

| Card | Description | Models Available |
|------|-------------|-----------------|
| 🔍 Segmentation | Segment objects with boundaries | SAM2 |
| 📍 Detection | Detect and count objects | YOLOv8-Palm, YOLO-general |
| 🗺️ Classification | Classify land cover types | Prithvi-EO |
| 🔄 Change Detection | Compare temporal changes | BIT-CD |

### Step 2: Specify Target (after function selected)

**Detection selected → "What to detect?"**
- Text input with quick-select chips
- Chips: Palm, Tree, Building, Car, Road (configurable per deployment)
- Free text for custom targets → sent to backend NLP

**Classification selected → "Classification scheme?"**
- Quick-select: [LULC 5-class] [LULC 10-class] [Crop Type] [Custom]
- Custom → multi-chip input for class names

**Segmentation selected → "What to segment?"**
- Quick-select: [Everything] [Vegetation] [Buildings] [Water]
- Free text for specific objects

**Change Detection selected → "Compare what?"**
- Date range picker (before / after)
- Quick: [Last month] [Last quarter] [Last year]
- Type: [Any change] [Deforestation] [Urban expansion]

---

## Section 4: Task History (commit-log tree)

Merged with task flow. Shows chronologically, most recent first.

```typescript
export interface TaskHistoryNode {
  taskId: string;
  taskType: TaskType;
  functionCategory: 'segmentation' | 'detection' | 'classification' | 'change_detection';
  target: string;           // "oil palm trees", "LULC 5-class", etc.
  modelId: string;
  timestamp: string;
  stats: AnalysisResult['stats'];
  aoiGeometry: GeoJSON.Polygon;
  parentTaskId?: string;    // for re-runs / refinements → tree structure
}
```

Visual: vertical timeline with dots connected by lines (like git log).
Click a node → loads results in floating panel + highlights AOI on map.

---

## Data Integration Evaluation

### Method A: Extend Layers Tab
- **Pro:** Natural place for "add data" (users expect it there)
- **Con:** Deep Kepler surgery; `LayerManagerFactory` replacement is complex; merge conflicts on every Kepler update
- **Risk:** HIGH — Kepler's layer panel is tightly coupled

### Method B: New 'Data' Tab (RECOMMENDED ✅)
- **Pro:** Clean separation via `CustomPanelsFactory` (same pattern as GeoAI tab); no Kepler core changes; easy to maintain across updates
- **Con:** Extra tab in sidebar (5 tabs total: Layers, Filters, GeoAI, Data, Map)
- **Risk:** LOW

### Recommendation
**Method B.** Use `CustomPanelsFactory` to add both GeoAI and Data tabs. The Data tab handles:
- GEE catalog browser + date/band selection + export-to-project
- STAC search interface (collection → item → asset)
- Upload panel (drag & drop GeoTIFF, GeoJSON, Shapefile)
- Connected datasets management

This keeps all PalmView additions in the CustomPanels injection point, making Kepler upgrades clean (rebase fork, our additions are isolated).

```
CustomPanels.panels = [
  { id: 'geoai', label: 'GeoAI',  iconComponent: BrainIcon,    component: GeoAiPanel },
  { id: 'data',  label: 'Data',   iconComponent: DatabaseIcon,  component: DataPanel },
];
```

---

## Updated Action Types

```typescript
// New actions for v2
const PREFIX = '@@palmview/';
export const GeoAiActionTypes = {
  // ... existing ...

  // Function-based task flow
  SET_FUNCTION_CATEGORY:  `${PREFIX}SET_FUNCTION_CATEGORY`,
  SET_TARGET_SPEC:        `${PREFIX}SET_TARGET_SPEC`,

  // Floating results panel
  TOGGLE_RESULTS_PANEL:   `${PREFIX}TOGGLE_RESULTS_PANEL`,
  PIN_RESULTS_PANEL:      `${PREFIX}PIN_RESULTS_PANEL`,
  MINIMIZE_RESULTS_PANEL: `${PREFIX}MINIMIZE_RESULTS_PANEL`,
  MOVE_RESULTS_PANEL:     `${PREFIX}MOVE_RESULTS_PANEL`,
  RESIZE_RESULTS_PANEL:   `${PREFIX}RESIZE_RESULTS_PANEL`,
};
```

---

## Migration Notes (v1 → v2)

| v1 Interface | v2 Change |
|-------------|-----------|
| `TaskType` | Kept, but nested under `functionCategory` |
| `TaskState` | Add `functionCategory`, `targetSpec` |
| `ResultsPanel` in sidebar | Remove; add `ResultsPanelState` as floating |
| `TaskHistory` separate | Merge into main panel, add `parentTaskId` for tree |
| `AnalysisInputProps` | Split into `FunctionSelectorProps` + `TargetInputProps` |
