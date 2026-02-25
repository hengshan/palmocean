# 🌴 PalmView 产品路线图

**空天地一体化 AI 决策系统**
*版本 2.0 | 2026-02-25*

> 我们做的不是可视化工具，而是：**决策系统 · 数字孪生系统 · 数据资产管理系统 · AI 分析引擎 · 机器人调度中枢**

详细产品愿景 → [synga/00-vision/PRODUCT_VISION.md](synga/00-vision/PRODUCT_VISION.md)

---

## 🏗️ 三层系统架构

```
🌍 PalmView          — 宏观遥感指挥系统（当前主力）
🌴 PalmOcean         — 微观三维数字孪生系统（Sprint 2+ 启动）
🧠 Platform Console  — 数据与模型管理内核（持续演进）
```

---

## ✅ Sprint 1（2026-02-20 ~ 02-25）— 已完成

**目标：** GeoAI 推理链路 MVP

- [x] Kepler.gl fork + GeoAI Tab 集成
- [x] AOI 绘制 → SAM2 推理 → GeoJSON → Kepler 渲染（端到端）
- [x] WebSocket 实时进度推送
- [x] Confidence 颜色渐变图层
- [x] FloatingResultsPanel 统计面板
- [x] systemd 四服务稳定部署（szls）
- [x] 文档体系重构（CONTEXT.md + synga/ 目录）
- [x] Git 分支规范化（synga/main）

**演示地址：** http://szls.taila366a3.ts.net:8080

---

## 🚀 Sprint 2（进行中）

**目标：** PalmOcean 数据中台基础 + PalmScene CesiumJS 迁移 + GeoAI 闭环

| 任务 | 负责人 | 状态 |
|------|--------|------|
| T1 PalmOcean 后端基础（TimescaleDB + 状态机）| Vega | 🔜 |
| T2 GeoAI 推理结果持久化到 PalmOcean | Iris + Lyra | 🔜 |
| T3 PalmScene CesiumJS 主引擎迁移 | Iris | 🔜 |
| T4 PalmView UI 优化（版权/状态栏/数据入口）| Altair | 🔜 |
| T5 PalmView → PalmScene 2D/3D 联动 | Altair + Iris | 🔜 |
| T6 YOLOv8 真实推理接入（替换 mock）| Lyra | 🔜 |

---

## 🗺️ 中长期路线（Phase 2-3）

### Phase 2 — 专业场景深化

- 时序分析（种植面积变化、健康度趋势）
- 多模型协同（YOLO + SAM2 + RemoteCLIP）
- 数据标注工作台（人工校正 → 训练数据飞轮）
- PalmOcean MVP（3D 单株建模）

### Phase 3 — 机器人协同

- 无人机任务规划与调度
- HarvestBot 集成（自动采收路径优化）
- 实时传感器数据融合
- 跨农场多租户 SaaS

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Kepler.gl fork + React + Redux |
| 后端 | FastAPI + PostgreSQL/PostGIS |
| ML 推理 | SAM2 + YOLOv8 + RemoteCLIP + Prithvi-EO |
| 存储 | MinIO（影像/模型权重）|
| 部署 | systemd on szls (Tailscale) |
| 3D（未来）| NVIDIA Isaac Sim + Seed3D |

---

*最后更新：2026-02-25 by Lyra*
