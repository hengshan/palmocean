# PalmView 系统技术架构

> 主架构文档 — 供全体开发成员（人类 + AI Agent）参考
> 最后更新：2026-02-25

---

## 一、产品定位与系统边界

PalmView 不是可视化工具，而是：
- **决策系统** — 把卫星/无人机图像转化为管理决策依据
- **数字孪生系统** — 现实种植园的数字镜像（PalmOcean）
- **AI 分析引擎** — 自动目标识别、变化检测、健康评估
- **机器人调度中枢** — 未来连接 HarvestBot 无人采摘

---

## 二、整体架构分层

```
┌─────────────────────────────────────────────────────────────────┐
│                    客户端层 (Browser)                            │
│                                                                  │
│  ┌─────────────────────────┐  ┌──────────────────────────────┐  │
│  │     PalmView (2D/GIS)   │  │     PalmOcean (3D 数字孪生)   │  │
│  │  Kepler.gl fork         │  │  Three.js + @react-three/fiber│  │
│  │  + GeoAI Tab            │  │  + @react-three/drei          │  │
│  │  + Redux store          │  │  + sceneStore (Zustand→Redux) │  │
│  └─────────┬───────────────┘  └──────────────┬───────────────┘  │
│            │ 用户在地图上点击种植园               │                  │
│            └───────────────┬──────────────────┘                  │
└────────────────────────────┼────────────────────────────────────┘
                             │ REST API / WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│                    后端 API 层 (FastAPI)                          │
│  端口: 8000 | 入口: main_v1.py                                   │
│                                                                  │
│  /api/v1/inference    — SAM2 推理任务（WebSocket 进度）           │
│  /api/v1/models       — AI 模型注册表                            │
│  /api/v1/projects     — 项目管理                                  │
│  /api/v1/map-configs  — Kepler 地图配置持久化                     │
│  /api/v1/assets       — 数据资产管理                              │
│  /api/v1/auth         — 认证                                      │
│  /api/v1/data/stac    — STAC 时空数据目录                         │
│  /api/v1/data/gee     — Google Earth Engine 接入                  │
│  /api/plantations     — 种植园 CRUD（PalmOcean）                  │
│  /api/seed3d          — Seed3D 3D 模型生成                        │
└──────────┬──────────────────────┬──────────────────────────────┘
           │                      │
    ┌──────▼──────┐      ┌────────▼────────┐
    │  ML 推理层  │      │   数据存储层     │
    │ port 8001   │      │                 │
    │ SAM2 server │      │ PostgreSQL/PostGIS│
    │ YOLOv8      │      │ port 5434        │
    │ RemoteCLIP  │      │                 │
    │ Prithvi-EO  │      │ MinIO (S3兼容)   │
    └──────┬──────┘      │ port 9000        │
           │              │ bucket: palmview-data │
    GPU 推理              └─────────────────┘
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

### 3.2 PalmOcean (3D 数字孪生 — Three.js)

**技术栈：** Three.js v0.183 + @react-three/fiber v9.5 + @react-three/drei v10.7

**组件结构：**
```
app/src/components/palmscene/
├── PalmScene.tsx          # 主场景容器（Canvas + 轨道控制）
├── Ground.tsx             # 地面平面（接收 GeoJSON boundary）
├── PalmTree.tsx           # 棕榈树 3D 对象（health 颜色编码）
├── HarvestBot.tsx         # 机器人可视化（idle/moving/harvesting 状态）
├── SkyEnvironment.tsx     # 天空盒 + 光照
├── SceneControls.tsx      # 轨道控制器（OrbitControls）
├── SceneUI.tsx            # 场景内 UI overlay（选中资产信息）
├── PlantationModal.tsx    # 从 PalmView 地图触发的入口模态框
└── index.ts               # 统一导出
```

**与 PalmView 的集成方式：**
- 用户在 Kepler 地图上点击种植园 polygon → 触发 Redux action
- `PlantationModal` 接收 `plantationId` + `boundary`（GeoJSON）
- PalmScene 根据 boundary 渲染地块 + 棕榈树 + 机器人

**⚠️ 待办：** `sceneStore.ts` 目前是 Zustand，需适配为 Redux（与 Kepler store 统一）

---

## 四、后端架构

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

## 五、ML / AI 推理层

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

## 六、数据架构

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

## 七、部署架构

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

## 八、未来规划（仿真层）

**Isaac Sim 集成（Phase 3）：**
```
Seed3D API（火山引擎）
    → USD/GLTF 3D 资产生成
    → NVIDIA Isaac Sim（shanzi RTX5090）
    → 机器人仿真训练
    → 策略模型 → 边缘部署 → HarvestBot
```

---

## 九、开发规范快速参考

| 原则 | 规范 |
|------|------|
| Git 分支 | `synga/main` 主干，`synga/feature/xxx` 功能分支 |
| 前端状态 | Redux（Kepler），Zustand 不引入新文件 |
| 大文件 | DVC 管理，不进 git |
| 文档 | Synga 文档放 `synga/`，不动 `docs/` |
| Commit | Conventional Commits（feat/fix/chore/docs）|

---

*维护人：Lyra | 每 Sprint 结束更新*
