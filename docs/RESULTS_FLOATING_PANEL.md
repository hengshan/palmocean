# Results Floating Panel — Detailed Component Design

> 🌈 IRIS · 2026-02-20 · P0 for Altair implementation
> Reference: GEOAI_TAB_WIREFRAME_V2.md, Kepler MapControlPanel pattern

---

## 1. Visual Spec

```
                          Map Canvas
    ┌──────────────────────────────────────────────┐
    │                                              │
    │                                              │
    │                                              │
    │                                              │
    │                                              │
    │         (map content)                        │
    │                                              │
    │                                              │
    │                       ┌──────────────────┐   │
    │                       │ Results Panel    │   │
    │                       │                  │   │
    │                       │                  │   │
    │                       └──────────────────┘   │
    └──────────────────────────────────────────────┘
```

- **Default position:** bottom-right, 16px from edges
- **Default size:** 380×320px
- **Min size:** 280×180px
- **Max size:** 600×500px
- **Z-index:** 100 (above map controls, below modals)

---

## 2. Component Hierarchy

```
FloatingResultsPanel
├── PanelDragHandle (header bar — drag target)
│   ├── PanelTitle ("🌴 Palm Detection · 12.3s")
│   └── PanelControls
│       ├── PinButton [📌]
│       ├── MinimizeButton [─]
│       └── CloseButton [✕]
├── PanelBody (scrollable content)
│   ├── StatCards (row of 3 metric cards)
│   ├── ConfidenceSlider
│   ├── ClassBreakdown (optional, for classification/detection)
│   └── ActionBar
│       ├── ExportDropdown
│       ├── AddToMapButton
│       └── ViewReportButton
└── ResizeHandle (bottom-right corner)
```

---

## 3. TypeScript Interfaces

```typescript
// ── Panel State ──────────────────────────────────────
export interface ResultsPanelPosition {
  x: number;  // px from left
  y: number;  // px from top
}

export interface ResultsPanelSize {
  width: number;
  height: number;
}

export interface ResultsPanelState {
  isVisible: boolean;
  isPinned: boolean;       // pinned = stays when clicking map
  isMinimized: boolean;    // collapsed to header only
  position: ResultsPanelPosition;
  size: ResultsPanelSize;
  activeTaskId: string | null;  // which result to display
}

export const INITIAL_RESULTS_PANEL: ResultsPanelState = {
  isVisible: false,
  isPinned: true,
  isMinimized: false,
  position: { x: -16, y: -16 },  // negative = offset from right/bottom
  size: { width: 380, height: 320 },
  activeTaskId: null,
};

// ── Component Props ──────────────────────────────────

export interface FloatingResultsPanelProps {
  panel: ResultsPanelState;
  result: AnalysisResult | null;
  confidence: ConfidenceState;
  // Actions
  onClose: () => void;
  onPin: () => void;
  onMinimize: () => void;
  onDrag: (position: ResultsPanelPosition) => void;
  onResize: (size: ResultsPanelSize) => void;
  onSetConfidence: (threshold: number) => void;
  onExport: (format: ExportFormat) => void;
  onAddToMap: () => void;
  onViewReport: () => void;
}

export interface PanelDragHandleProps {
  title: string;
  isPinned: boolean;
  isMinimized: boolean;
  onPin: () => void;
  onMinimize: () => void;
  onClose: () => void;
  onMouseDown: (e: React.MouseEvent) => void;  // drag start
}

export interface StatCardProps {
  value: string | number;
  label: string;
  icon?: string;
  color?: string;
}

export interface ClassBreakdownProps {
  classes: Array<{
    name: string;
    count: number;
    color: string;
    percentage: number;
  }>;
}

export interface ExportDropdownProps {
  onExport: (format: ExportFormat) => void;
}

export type ExportFormat = 'geojson' | 'shapefile' | 'csv' | 'geopackage';
```

---

## 4. Actions

```typescript
export const ResultsPanelActions = {
  SHOW_RESULTS_PANEL:     '@@palmview/SHOW_RESULTS_PANEL',
  HIDE_RESULTS_PANEL:     '@@palmview/HIDE_RESULTS_PANEL',
  PIN_RESULTS_PANEL:      '@@palmview/PIN_RESULTS_PANEL',
  MINIMIZE_RESULTS_PANEL: '@@palmview/MINIMIZE_RESULTS_PANEL',
  MOVE_RESULTS_PANEL:     '@@palmview/MOVE_RESULTS_PANEL',
  RESIZE_RESULTS_PANEL:   '@@palmview/RESIZE_RESULTS_PANEL',
  SET_ACTIVE_RESULT:      '@@palmview/SET_ACTIVE_RESULT',
} as const;

// Action creators
export const showResultsPanel = (taskId: string) => ({
  type: ResultsPanelActions.SHOW_RESULTS_PANEL,
  payload: { taskId },
});

export const hideResultsPanel = () => ({
  type: ResultsPanelActions.HIDE_RESULTS_PANEL,
});

export const pinResultsPanel = () => ({
  type: ResultsPanelActions.PIN_RESULTS_PANEL,
});

export const minimizeResultsPanel = () => ({
  type: ResultsPanelActions.MINIMIZE_RESULTS_PANEL,
});

export const moveResultsPanel = (position: ResultsPanelPosition) => ({
  type: ResultsPanelActions.MOVE_RESULTS_PANEL,
  payload: position,
});

export const resizeResultsPanel = (size: ResultsPanelSize) => ({
  type: ResultsPanelActions.RESIZE_RESULTS_PANEL,
  payload: size,
});
```

---

## 5. Styled Components

```typescript
import styled from 'styled-components';

export const StyledFloatingPanel = styled.div<{
  x: number; y: number; width: number; height: number; minimized: boolean;
}>`
  position: absolute;
  ${props => props.x < 0
    ? `right: ${Math.abs(props.x)}px;`
    : `left: ${props.x}px;`
  }
  ${props => props.y < 0
    ? `bottom: ${Math.abs(props.y)}px;`
    : `top: ${props.y}px;`
  }
  width: ${props => props.width}px;
  height: ${props => props.minimized ? '36px' : `${props.height}px`};
  background-color: ${props => props.theme.mapPanelBackgroundColor};
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: height 200ms ease-out;
  resize: ${props => props.minimized ? 'none' : 'both'};
  min-width: 280px;
  min-height: ${props => props.minimized ? '36px' : '180px'};
  max-width: 600px;
  max-height: 500px;
`;

export const StyledDragHandle = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 36px;
  padding: 0 12px;
  background-color: ${props => props.theme.mapPanelHeaderBackgroundColor};
  cursor: grab;
  user-select: none;
  flex-shrink: 0;

  &:active { cursor: grabbing; }
`;

export const StyledPanelTitle = styled.span`
  font-size: 11px;
  font-weight: 500;
  color: ${props => props.theme.titleTextColor};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const StyledPanelControls = styled.div`
  display: flex;
  gap: 4px;
  align-items: center;
`;

export const StyledControlButton = styled.button<{ active?: boolean }>`
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 2px;
  background: transparent;
  color: ${props => props.active
    ? props.theme.activeColor
    : props.theme.textColor};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;

  &:hover {
    background-color: ${props => props.theme.panelBackgroundHover};
    color: ${props => props.theme.textColorHl};
  }
`;

export const StyledPanelBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  ${props => props.theme.sidePanelScrollBar};
`;

export const StyledStatRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
`;

export const StyledStatCard = styled.div`
  flex: 1;
  background: ${props => props.theme.sidePanelBg};
  border-radius: 4px;
  padding: 8px;
  text-align: center;
`;

export const StyledStatValue = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: ${props => props.theme.textColorHl};
`;

export const StyledStatLabel = styled.div`
  font-size: 10px;
  color: ${props => props.theme.textColor};
  margin-top: 2px;
`;

export const StyledActionBar = styled.div`
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid ${props => props.theme.sidePanelBorderColor};
`;
```

---

## 6. Drag Implementation

```typescript
// useDrag hook for the floating panel
function usePanelDrag(
  onDrag: (pos: ResultsPanelPosition) => void,
  initialPos: ResultsPanelPosition
) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef(initialPos);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = initialPos;
  }, [initialPos]);

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      onDrag({
        x: posStart.current.x + dx,
        y: posStart.current.y + dy,
      });
    };

    const onMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, onDrag]);

  return { onMouseDown, isDragging };
}
```

---

## 7. Integration Point

The floating panel renders **inside the map container**, not in the sidebar.
In Kepler's component hierarchy:

```
KeplerGl
├── SidePanel (left sidebar — GeoAI tab lives here)
├── MapContainer
│   ├── DeckGL / MapLibre
│   ├── MapControl (top-right map buttons)
│   ├── MapPopover (hover tooltips)
│   └── FloatingResultsPanel ← HERE (injected)
```

**Injection strategy:** Replace `MapContainerFactory` to add our panel, OR use a React Portal from the GeoAI tab to render into the map container DOM node.

**Recommended: Portal approach** — less invasive, no factory replacement needed:
```typescript
// In GeoAiPanel component
const mapContainer = document.querySelector('.kepler-gl .map-container');
return mapContainer ? createPortal(<FloatingResultsPanel {...props} />, mapContainer) : null;
```

---

## 8. State Flow

```
Analysis Complete
  → dispatch(SET_RESULTS)
  → dispatch(showResultsPanel(taskId))
  → FloatingResultsPanel renders with result data
  → User adjusts confidence slider → dispatch(SET_CONFIDENCE)
  → Map layer filters in real-time
  → User clicks "Add to Map" → dispatch(addDataToMap(...))
  → User closes panel → dispatch(hideResultsPanel())
  → Result stays in history, can be reopened

History item clicked
  → dispatch(SET_ACTIVE_RESULT(taskId))
  → dispatch(showResultsPanel(taskId))
  → Panel shows historical result
```
