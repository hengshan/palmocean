# PalmView — Agent Context

> **永远保持 < 200 行。这是 agent 启动必读文件，必须最新、最准确。**
> 详细内容通过链接跳转到 `synga/` 文件夹。

---

## 🌍 我们在做什么

PalmView 是 Synga 的核心产品，**不是可视化工具，而是**：

| 系统 | 定位 |
|------|------|
| 🌍 PalmView | 宏观遥感指挥系统 — 卫星/无人机图像 → AI 分析 → 决策支持 |
| 🌴 PalmOcean | 微观三维数字孪生系统 — 地块级精准管理 |
| 🧠 Platform GIS Console | 数据与模型管理内核 — 数据资产 + AI 引擎 + 机器人调度 |

核心行业：棕榈油 AgriTech（空天地一体化智能）

---

## 🏗️ 技术架构速查

```
Frontend (Kepler.gl fork + GeoAI Tab)  port 8080
    ↓
GeoAI API Layer (FastAPI)              port 8000
    ↓
ML Inference (SAM2 / YOLO / RemoteCLIP) port 8001
    ↓
PostgreSQL/PostGIS                     port 5434
MinIO Object Storage                   port 9000
```

**部署机器：** szls (szls.taila366a3.ts.net)
**访问地址：** http://szls.taila366a3.ts.net:8080

---

## 🌿 Git 分支规范

| 分支 | 用途 |
|------|------|
| `synga/main` | ⭐ 我们的主干，唯一长期分支 |
| `master` | upstream kepler.gl 基础，**永远不推代码** |
| `synga/feature/xxx` | 功能分支，merge 后立即删除 |

详细规范 → [synga/GIT_WORKFLOW.md](synga/GIT_WORKFLOW.md)

---

## 📊 Sprint 状态

| Sprint | 状态 | 关键成果 |
|--------|------|---------|
| Sprint 1 | ✅ 完成 (2026-02-25) | GeoAI 推理链路闭环，MVP 可演示 |
| Sprint 2 | 🔜 规划中 | 待 Hank 确认方向 |

---

## 🔄 最新变更（滚动，保留最近 5 条）

- `2026-02-25` 0866eb5 — ml/weights/ 纳入 DVC 管理（存 MinIO szls:9000）
- `2026-02-25` 87da7fd — 文档体系重构，synga/ 目录建立，ROADMAP v2
- `2026-02-25` 0cadbd7 — 分支规范化：synga/main 主干建立，Git 规范文档
- `2026-02-25` 533479cc — GeoJSON 持久化 + WS complete → Kepler 自动渲染
- `2026-02-25` 2b31bd4 — GeoJSON 路由修复，推理链路完全闭环

---

## 📁 文档导航

| 需要了解 | 看这里 |
|---------|--------|
| 产品愿景与角色 | [synga/00-vision/PRODUCT_VISION.md](synga/00-vision/PRODUCT_VISION.md) |
| 技术架构 | [synga/01-architecture/SYSTEM_ARCHITECTURE.md](synga/01-architecture/SYSTEM_ARCHITECTURE.md) |
| 数据库设计 | [synga/01-architecture/DATABASE_DESIGN.md](synga/01-architecture/DATABASE_DESIGN.md) |
| DVC 数据管理 | [synga/01-architecture/DVC_GUIDE.md](synga/01-architecture/DVC_GUIDE.md) |
| ML 模型 | [synga/02-ml/MODEL_COMPARISON.md](synga/02-ml/MODEL_COMPARISON.md) |
| 设计规范 | [synga/03-design/DESIGN_SYSTEM.md](synga/03-design/DESIGN_SYSTEM.md) |
| API 规范 | [synga/04-api/DATA_ACQUISITION_API.md](synga/04-api/DATA_ACQUISITION_API.md) |
| Sprint 记录 | [synga/05-sprint-log/](synga/05-sprint-log/) |
| Git 规范 | [synga/GIT_WORKFLOW.md](synga/GIT_WORKFLOW.md) |

---

*最后更新：2026-02-25 by Lyra*
