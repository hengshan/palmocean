# PalmView 系统技术架构

> 主架构文档 — 供全体开发成员（人类 + AI Agent）参考
> 最后更新：2026-02-25

---

## 一、产品定位与系统边界

**四层产品架构：**

```
🌍 PalmView    — 2D/2.5D 遥感分析驾驶舱（Kepler.gl fork）
🌲 PalmScene   — 3D 地理空间数字孪生可视化（CesiumJS 主 + Three.js 辅）
────────────────────────────────────────────
🌊 PalmOcean   — 数字孪生数据中台（后端核心，不是展示平台）
🧠 Platform    — 数据与模型管理内核（管理员后台）
```

**PalmOcean 是什么：**
- PalmView 和 PalmScene 都只是 PalmOcean 的"窗口"，没有它两者都是空壳
- 物理世界每时每刻发生的事，都在 PalmOcean 里留下痕迹
- 核心能力：IoT 实时同步 + 时序存储 + 数字状态机 + 统一 API

**PalmScene 技术选型说明：**
- **主引擎 CesiumJS**：真实 WGS84 坐标、地形、3D Tiles、点云大规模渲染
- **辅助引擎 Three.js**：高度定制元素（机器人 mesh、仪表 overlay、特效）

---

## 二、整体架构分层

```
┌──────────────────────────────────────────────────────────────────┐
│                      客户端层 (Browser)                           │
│                                                                   │
│  ┌──────────────────────┐   ┌─────────────────────────────────┐  │
│  │  🌍 PalmView (2D/GIS) │   │  🌲 PalmScene (3D 孪生可视化)    │  │
│  │  Kepler.gl fork       │   │  主: CesiumJS (地形/点云/Tiles)  │  │
│  │  + GeoAI Tab          │   │  辅: Three.js + @react-three    │  │
│  │  + Redux store        │   │  (机器人/定制3D元素)             │  │
│  └──────────┬────────────┘   └────────────────┬────────────────┘  │
│             │ 点击种植园 →                       │ 实时状态订阅      │
│             └──────────────────┬───────────────┘                  │
└──────────────────────────────  │  ──────────────────────────────── ┘
                                 │ REST API / WebSocket
┌────────────────────────────────▼─────────────────────────────────┐
│                     🌊 PalmOcean — 数字孪生数据中台                │
│                                                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │  IoT 实时同步   │  │  时序数据存储    │  │  数字状态机     │  │
│  │  MQTT broker    │  │  TimescaleDB     │  │  每棵树/机器人  │  │
│  │  WebSocket      │  │  历史趋势分析    │  │  的数字镜像     │  │
│  └─────────────────┘  └──────────────────┘  └─────────────────┘  │
│                                                                   │
│  FastAPI 后端 (port 8000) — main_v1.py                            │
│  /api/v1/inference  /api/v1/models  /api/v1/projects              │
│  /api/v1/map-configs  /api/v1/assets  /api/v1/auth                │
│  /api/v1/data/stac  /api/v1/data/gee  /api/v1/data               │
│  /api/plantations (种植园 CRUD)  /api/seed3d (3D 模型生成)         │
└──────────┬───────────────────────────┬───────────────────────────┘
           │                           │
    ┌──────▼──────┐           ┌────────▼──────────┐
    │  ML 推理层  │           │    数据存储层       │
    │  port 8001  │           │                   │
    │  SAM2       │           │  PostgreSQL/PostGIS│
    │  YOLOv8     │           │  port 5434         │
    │  RemoteCLIP │           │                   │
    │  Prithvi-EO │           │  MinIO (S3兼容)    │
    └──────┬──────┘           │  port 9000         │
           │                  │  palmview-data     │
    GPU 推理                  └───────────────────┘
    shanzi RTX5090
    (Tailscale)
```

---

## 三、前端架构

### 3.1 PalmView (2D GIS — Kepler.gl Fork)

**技术栈：** React 18 + Redux + Deck.gl + MapboxGL

**关键架构原则：**
- 走 Kepler 的 `action/reducer/selector` 模式，不在 UI 层直接操作 store
- 自定义功能通过 `injectComponents` + `CustomPanelsFactory` 注入
- 不修改 kepler 核心源码（`src/`），只在 `app/` 层扩展

**我们的扩展点：**
```
app/src/
├── components/
│   ├── geoai-panel.tsx          # GeoAI Tab 主面板
│   ├── aoi-control.tsx          # AOI 绘制工具条
│   ├── floating-results-panel/  # 推理结果浮动面板
│   └── palmscene/               # PalmOcean 3D 入口（见下）
├── palmview/                    # 核心业务逻辑
│   ├── inference-service.ts     # 推理 API + WebSocket
│   └── types.ts                 # 业务类型定义
└── main.tsx                     # 入口：注入 GeoAI Tab
```

**GeoAI Tab 注入方式（重要！）：**
```tsx
// CustomPanelsFactory DI 模式
GeoAIPanel.panels = [{ id: 'geoai', label: 'GeoAI', iconComponent: ... }]
const KeplerGl = injectComponents([[CustomPanelsFactory, GeoAIPanelFactory]])
```
详见 → [KEPLER_EXTENSION_POINTS.md](KEPLER_EXTENSION_POINTS.md)

---

### 3.2 PalmScene (3D 数字孪生可视化)

**定位：** PalmOcean 数据的 3D 渲染层，不是独立系统

**技术栈（双引擎）：**

| 引擎 | 版本 | 职责 |
|------|------|------|
| **CesiumJS**（主） | latest | 地形、3D Tiles、点云、真实 WGS84 坐标 |
| **Three.js + r3f**（辅） | 0.183 + r3f 9.5 | 机器人 mesh、仪表 overlay、高度定制元素 |

**为什么 CesiumJS 是主引擎：**
- 棕榈树点云 / LiDAR 扫描 → 3D Tiles 标准，百万级点渲染
- 地形真实高程，机器人路径在真实地面上行走
- 原生时序支持，机器人作业路径可回放
- Three.js 只处理 CesiumJS 无法优雅实现的部分

**当前实现（Sprint 1 骨架，Three.js）：**
```
app/src/components/palmscene/
├── PalmScene.tsx          # 主场景容器（Canvas + 轨道控制）
├── Ground.tsx             # 地面平面（接收 GeoJSON boundary）
├── PalmTree.tsx           # 棕榈树 3D（health 颜色编码）
├── HarvestBot.tsx         # 机器人可视化（idle/moving/harvesting）
├── SkyEnvironment.tsx     # 天空盒 + 光照
├── SceneControls.tsx      # 轨道控制器
├── SceneUI.tsx            # 场景内 UI overlay
├── PlantationModal.tsx    # 从 PalmView 地图触发的入口
└── index.ts
```

**与 PalmView 的集成：**
- 用户在 Kepler 地图上点击种植园 polygon → Redux action → PlantationModal
- `PalmScene` 接收 `plantationId` + `boundary`（GeoJSON）
- 从 PalmOcean API 获取实时状态，渲染树 + 机器人

**待办（Sprint 2+）：**
- `sceneStore.ts` 从 Zustand 适配为 Redux
- CesiumJS 主引擎迁移（替换 Three.js Canvas 为 Cesium Viewer）
- 接入 PalmOcean 实时 WebSocket 数据流

---

## 四、PalmOcean — 数字孪生数据中台

**PalmOcean 是后端核心，不是展示层。** 它是整个系统的"心跳"。

### 四大核心能力

**1. 实时状态同步（物理 → 数字）**
```
IoT 传感器 (土壤/气温/NDVI)
    → MQTT broker
    → PalmOcean 状态引擎
    → 更新数字孪生状态
    → WebSocket 推送给 PalmView/PalmScene
```

**2. 时序数据存储**
- TimescaleDB（PostgreSQL 扩展）存储传感器时序数据
- 每棵树的历史健康分、NDVI、采收记录
- 每台设备的轨迹和操作日志

**3. 数字状态机**
- 每个物理实体（树/机器人/地块）都有一个数字镜像对象
- 状态变化 → 事件流 → 告警/通知/PalmView 实时着色

**4. 统一数据 API**
- REST — 历史查询（PalmView 图表数据）
- WebSocket — 实时推送（地图上的树实时变色）
- 开放 API — ERP/供应链第三方集成

### 当前实现状态
- `/api/plantations` — 种植园 CRUD ✅（Sprint 1 迁移完成）
- `/api/seed3d` — Seed3D 3D 模型生成 ✅（Mock，待接入真实 API）
- IoT 接入层 — 🔜 Sprint 3+ 规划

---

## 五、后端架构

**技术栈：** FastAPI + SQLAlchemy + PostgreSQL/PostGIS + MinIO

**服务启动：**
```bash
# szls 上 systemd 管理
systemctl --user start palmview-api.service    # FastAPI port 8000
systemctl --user start palmview-frontend.service  # Next/Kepler port 8080
systemctl --user start palmview-sam2.service   # SAM2 server port 8001
systemctl --user start palmview-db.service     # PostgreSQL port 5434
```

**数据库设计** → 详见 [DATABASE_DESIGN.md](DATABASE_DESIGN.md)

**推理流程（关键）：**
```
前端 AOI 绘制
    → POST /api/v1/inference/jobs（submit job）
    → WebSocket /api/v1/inference/jobs/{id}/ws（实时进度）
    → SAM2 server 执行推理（port 8001）
    → GeoJSON 结果存内存缓存
    → WS complete 消息内联 geojson
    → 前端 addGeoJSONToKeplerMap() 自动渲染
    → GET /api/v1/inference/jobs/{id}/geojson（可按需导出）
```

---

## 六、ML / AI 推理层

| 模型 | 用途 | 状态 |
|------|------|------|
| SAM2 | 交互式分割（点击/框选） | ✅ 已集成 |
| YOLOv8 | 棕榈树检测 | ✅ 权重已训练（ml/runs/palm_detect_v1/）|
| RemoteCLIP-ViT-L-14 | 自然语言 → 语义搜索 | ✅ 权重已下载（DVC）|
| Prithvi-EO 2.0 | 遥感多光谱特征提取 | 🔜 规划中 |

**模型权重管理：** DVC → MinIO（s3://palmview-data/dvc）
详见 → [DVC_GUIDE.md](DVC_GUIDE.md)

**GPU 策略：**
- 开发/重型推理 → shanzi RTX 5090 24GB（Tailscale 远程调用）
- 部署推理 → szls RTX 3060 12GB（SAM2 server 本地）

---

## 七、数据架构

```
数据流：
卫星影像(COG) / 无人机航片
    → MinIO 对象存储（原始数据）
    → titiler tile server（切片服务）
    → Kepler 地图渲染
    → 用户 AOI 框选
    → 推理服务裁剪 + 推理
    → GeoJSON 结果 → PostgreSQL/PostGIS + Kepler 渲染
    → DVC 版本化（训练数据集）
```

**存储位置：**
- `MinIO palmview-data/` — 影像、模型权重、推理结果
- `PostgreSQL palmview` — 项目、地图配置、种植园、任务历史
- `DVC` — 训练数据集版本 + 模型权重追踪

---

## 八、部署架构

**当前（MVP）：** 单机部署 on szls

```
szls (Tailscale: szls.taila366a3.ts.net)
├── systemd services:
│   ├── palmview-frontend  → :8080 (Kepler fork build)
│   ├── palmview-api       → :8000 (FastAPI)
│   ├── palmview-sam2      → :8001 (SAM2 inference)
│   └── (PostgreSQL :5434, MinIO :9000-9001 独立管理)
└── GPU: RTX 3060 12GB (推理)
```

**访问：** http://szls.taila366a3.ts.net:8080（Tailscale 内网）

**未来（Scale-out）：**
- 前端 → CDN / Vercel
- 后端 API → Kubernetes（火山引擎 VKE）
- 推理 → GPU 云节点弹性扩容
- 数据库 → 托管 PostgreSQL（火山引擎 RDS）

---

## 九、未来规划（仿真层）

**Isaac Sim 集成（Phase 3）：**
```
Seed3D API（火山引擎）
    → USD/GLTF 3D 资产生成
    → NVIDIA Isaac Sim（shanzi RTX5090）
    → 机器人仿真训练
    → 策略模型 → 边缘部署 → HarvestBot
```

---

## 十、开发规范快速参考

| 原则 | 规范 |
|------|------|
| Git 分支 | `synga/main` 主干，`synga/feature/xxx` 功能分支 |
| 前端状态 | Redux（Kepler），Zustand 不引入新文件 |
| 大文件 | DVC 管理，不进 git |
| 文档 | Synga 文档放 `synga/`，不动 `docs/` |
| Commit | Conventional Commits（feat/fix/chore/docs）|

---

*维护人：Lyra | 每 Sprint 结束更新*
