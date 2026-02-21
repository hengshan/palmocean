# Kepler.gl Editor 机制深度分析

## 架构全景

### 1. UI 层：MapDrawPanel (`map-draw-panel.tsx`)
- 是 `MapControlFactory` 的 `DEFAULT_ACTIONS` 之一（与 SplitMap, Toggle3d, LayerSelector, Locale, Legend 并列）
- 渲染为 `MapControlButton`（polygon 图标），点击触发 `onToggleMapControl('mapDraw')`
- 展开后显示 3 个 `ToolbarItem`：Select (EDIT), Polygon (DRAW_POLYGON), Rectangle (DRAW_RECTANGLE)
- 关键 props：`editor`, `mapControls`, `onSetEditorMode`, `onToggleMapControl`

### 2. 状态管理层：vis-state-updaters.ts
- `state.editor` 对象包含：`{ mode, features, selectedFeature, visible, selectionContext }`
- `setEditorModeUpdater` → 设置 `editor.mode` 为 DRAW_POLYGON/DRAW_RECTANGLE/EDIT
- `mapControls.mapDraw.active` → 控制绘图面板是否展开
- features 存在 `state.editor.features` 和 filter 的 `value` 中

### 3. Cursor 控制：EditorLayerUtils.getCursor()
- `isDrawingActive(editorMenuActive, editor.mode)` → return 'crosshair'
- 即：当 `mapDraw.active=true` 且 `mode=DRAW_POLYGON|DRAW_RECTANGLE` 时，cursor 变为 crosshair
- 这是在 `map-container.tsx` 的 `_getMapCursor` 中调用的

### 4. 渲染层：editor-layer.ts (deck.gl)
- 使用 `@nebula.gl/layers` 的 `EditableGeoJsonLayer`
- 使用 `@nebula.gl/edit-modes` 的 `DrawPolygonMode`, `DrawRectangleMode`, `TranslateMode`
- Layer ID: `EDITOR_LAYER_ID`
- 实际绘图通过 nebula.gl 的 EditableGeoJsonLayer 处理 click/drag 事件
- features 存储为 GeoJSON FeatureCollection

### 5. 事件处理
- `onClick` → EditorLayerUtils.onClick() → 在 drawingActive 时拦截其他图层点击
- `onHover` → EditorLayerUtils.onHover() → 在 drawingActive 时拦截
- `onEdit` callback → EDIT_TYPES.ADD_FEATURE/ADD_POSITION/MOVE_POSITION/TRANSLATING
- 新 feature 完成后 → `lastFeature.id = generateHashId(6)`, `setSelectedFeature(lastFeature)`

### 6. 关键流程：用户点击 "Draw Polygon"

```
1. MapDrawPanel → onSetEditorMode(EDITOR_MODES.DRAW_POLYGON)
2. vis-state-updaters → setEditorModeUpdater → state.editor.mode = 'DRAW_POLYGON'
3. map-container.tsx → isEditorDrawingMode = true → disables doubleClickZoom
4. map-container.tsx → getCursor() returns 'crosshair' → cursor 变化
5. editor-layer.ts → mode = DrawPolygonMode → EditableGeoJsonLayer 开始监听点击
6. 用户在地图上点击 → nebula.gl 捕获点击 → 添加 polygon 顶点
7. 完成绘制 → onEdit(ADD_FEATURE) → onSetFeatures → state.editor.features 更新
8. setSelectedFeature → state.editor.selectedFeature 设置
9. editor.tsx → 渲染 FeatureActionPanel（右键菜单）
```

## 结论：正确的 AOI 集成方案

### ❌ 不应该做的（当前方案的问题）
1. Geoman toolbar 作为独立 DOM 元素，不在 Kepler 的 action 系统里
2. Geoman 的事件系统与 Kepler 的 deck.gl/nebula.gl 完全独立
3. cursor 不变因为 Kepler 的 cursor 由 EditorLayerUtils.getCursor 控制，与 Geoman 无关

### ✅ 正确方案：扩展 Kepler 原生 Editor

**方案 A（推荐）：直接使用 Kepler 的 Editor + 扩展**
- Kepler 已有 Polygon 和 Rectangle 绘图（基于 nebula.gl）
- 只需把 AOI 功能挂载到现有 editor.features 上
- cursor、事件、状态全部由 Kepler 管理
- 缺点：缺少 Geoman 的 snap、rotate、cut 等高级功能

**方案 B：替换 Kepler Editor 的底层为 Geoman**
- 替换 nebula.gl 的 EditableGeoJsonLayer 为 Geoman
- 需要深度修改 editor-layer.ts、map-container.tsx
- 太侵入，升级困难

**方案 C（推荐折中）：扩展 MapDrawPanel + Geoman 处理高级编辑**
- 在 MapControlFactory 的 DEFAULT_ACTIONS 中添加 AOI 相关控件
- 基础绘图（polygon/rectangle）用 Kepler 原生（已能工作）
- Geoman 作为可选的"高级编辑"模式（snap、rotate、cut）
- AOI state 存入 Kepler 的 editor.features
