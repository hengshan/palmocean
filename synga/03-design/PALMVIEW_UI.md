# PalmView UI 设计规范

> PalmView（Operations Workspace）的界面结构、交互流程与设计标准
> 基于 Kepler.gl fork + Deck.gl + MapboxGL
> 最后更新：2026-02-25

---

## 一、Smart Default（默认即正确）

### 登录后默认行为
- 自动缩放至用户所属园区范围（根据账号角色）
- 自动选择对应默认底图
- 自动开启 NDVI 图层（健康度默认可见）

### 底图策略

| 用户角色 | 默认 Basemap |
|---------|-------------|
| 农场主 | 卫星影像 + NDVI 叠加 |
| 分析师 | Satellite Streets |
| GIS 管理员 | 矢量底图 + 边界叠加 |

**底图切换规范：**
- 位置：右上角 Layer Control
- 最多 5 种默认底图，快速切换
- 不展示复杂配置项

---

## 二、版权与状态栏

### ① 版权标注修正
```
❌ 当前：©kepler.gl
✅ 目标：©Synga
```
需修改 Kepler fork 底部版权字符串。

### ② Bottom Status Bar（新增）

地图底部固定状态栏，显示：

```
坐标: 3.1234°N, 101.5678°E  |  Scale: 1:5000  |  CRS: EPSG:4326  |  Zoom: 14.2
```

参考 QGIS / ArcGIS 的底部状态栏设计，鼠标移动时实时更新坐标。

---

## 三、数据加载（统一入口）

### 核心原则：唯一入口

**当前问题：** Layers panel、Filters panel、Data Panel 三处分散有"Add Data"按钮，体验割裂。

**解决方案：** 左侧 Panel 新增一个专用 Tab，作为唯一数据加载入口。

### 新增 "Add Data" Tab

**位置：** 左侧 Panel 第一个 Tab（排在 Layers 前面）

**图标：** `+` 加号 或 数据库图标 SVG（待定）

**功能整合：** 将以下数据源合并到一个弹出框：

```
┌─────────────────────────────────────────┐
│         Add Data to Map                 │
├─────────────────────────────────────────┤
│  📁 Upload Local File                   │
│     拖拽或点击上传                       │
│     支持：GeoJSON / Shapefile /          │
│           GeoTIFF / CSV / LAZ           │
├─────────────────────────────────────────┤
│  ☁️  Cloud Assets                        │
│     ├── Internal Storage（MinIO）        │
│     ├── Database（PostGIS）              │
│     └── S3 Bucket                       │
├─────────────────────────────────────────┤
│  🛰️  Satellite & Remote Sensing          │
│     ├── GEE（Google Earth Engine）       │
│     └── STAC Catalog（内部 + 外部）       │
├─────────────────────────────────────────┤
│  🔗  Tile Services                       │
│     ├── Vector Tiles（MVT）              │
│     ├── Raster Tiles（XYZ/WMTS）         │
│     └── 3D Tiles                        │
└─────────────────────────────────────────┘
```

> **集成原则：** 保留 Kepler 原始数据加载代码（vector, tiles, CSV 等），在此基础上扩展 GEE、STAC、Cloud Assets 入口。移除 Layers/Filters panel 中的"+ Add Data"入口。

### 数据加载后的行为规范

数据加载成功后自动执行：
1. 自动加入图层管理（Layers Panel）
2. 自动计算 Bounding Box
3. 自动 Zoom 到数据范围
4. 默认开启（可见）

---

## 四、图层管理（Layers Panel）

### 目标：统一所有图层类型

**当前问题：** 矢量、栅格、底图分散在不同地方。

**目标设计：** 所有图层统一在 Layers Panel，分 Sub Group：

```
Layers
├── 📐 Vector Layers
│   ├── 棕榈树检测结果 [●] [透明度] [样式]
│   └── 地块边界      [●] [透明度] [样式]
├── 🖼️  Raster Layers
│   ├── Sentinel-2 NDVI  [●] [透明度]
│   └── 无人机正射影像    [●] [透明度]
└── 🗺️  Base Maps
    └── Satellite Streets [●]
```

### 已支持的操作（保留）
- 显隐切换
- 透明度调整
- 排序拖拽
- 样式控制
- 属性查看

### 新增：按类型分组
矢量 / 栅格 / 底图 三组，渲染方式不同，折叠/展开管理。

---

## 五、GeoAI 分析流程（核心功能）

### 流程总览：🧠 选择 → 执行 → 渲染 → 跳转

---

### Step 1：选择（AOI 绘制）

使用 Nebula.gl 工具支持：
- `Rectangle` — 矩形框选
- `Polygon` — 多边形绘制
- `Lasso` — 自由套索绘制

**绘制完成后：** 自动弹出 GeoAI 分析侧边面板

---

### Step 2：执行（GeoAI 分析）

GeoAI 面板展示分析选项，**技术视角 ↔ 业务视角双模式：**

| 技术视角 | 业务视角 |
|---------|---------|
| Detection（目标检测）| 棕榈树单株计数 |
| Segmentation（语义分割）| 棕榈树边界分割 |
| Classification（分类）| 成熟度检测 / 病害检测 |
| Change Detection（变化检测）| 种植面积变化分析 |
| Height Estimation | 树高估计 |

> **界面设计：** 默认显示业务视角，可切换到技术视角（供分析师使用）

---

### Step 3：结果渲染

推理完成后自动执行：
1. **自动生成新图层**，加入 Layers Panel
2. **高亮渲染**（confidence 颜色梯度，绿 → 红）
3. **右侧展示统计卡片：**

```
┌─────────────────────┐
│  GeoAI Results      │
│  ─────────────────  │
│  Tree Count:   124  │
│  Avg Height:  5.6m  │
│  Health Score:  68  │
│  Confidence:  0.87  │
│                     │
│  [Export GeoJSON]   │
│  [Enter 3D View →]  │
└─────────────────────┘
```

---

### Step 4：进入 3D（核心差异化）

**这是 Synga PalmView 的核心差异化能力。**

当用户：
- 在结果面板点击 `[Enter 3D View]`
- 或在地图上选中单棵树后点击 `Enter 3D View`

触发：
1. 相机平滑飞行动画（从 2D 鸟瞰过渡到 3D 视角）
2. 自动定位到 PalmScene 对应地理位置
3. 目标树/区域在 3D 中高亮
4. 分析数据自动同步到 PalmScene 属性面板

---

## 六、待实现清单（按优先级）

| 优先级 | 功能 | 说明 |
|--------|------|------|
| 🔴 P0 | 版权改为 ©Synga | 修改 Kepler fork |
| 🔴 P0 | Bottom Status Bar | 坐标 / Scale / CRS / Zoom |
| 🔴 P0 | 统一数据加载入口 | 移除分散的 Add Data 按钮 |
| 🟡 P1 | Layers Panel 分组 | 矢量 / 栅格 / 底图 Sub Group |
| 🟡 P1 | GeoAI 业务/技术视角切换 | 分析类型双模式显示 |
| 🟡 P1 | 结果统计卡片 | Tree Count / Height / Health |
| 🟢 P2 | Enter 3D View 相机过渡 | PalmView → PalmScene 联动 |
| 🟢 P2 | 角色驱动底图默认值 | 按角色自动选底图 |

---

*相关文档：*
- *[UX_DESIGN.md](../00-vision/UX_DESIGN.md) — 完整 UX 交互哲学与角色主线*
- *[PALMSCENE_UI.md](PALMSCENE_UI.md) — PalmScene 3D 交互规范*
- *[SYSTEM_ARCHITECTURE.md](../01-architecture/SYSTEM_ARCHITECTURE.md) — 技术架构*
