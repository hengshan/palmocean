# AGENTS.md — PalmView AI 协作规范

> 写给所有参与 PalmView 开发的 AI Agent（Lyra、Vega、Altair、Iris）

---

## 📖 每次启动必读

1. **`CONTEXT.md`** — 产品定位、当前 Sprint、最新变更（最重要！）
2. **`synga/GIT_WORKFLOW.md`** — 分支规范和提交规范
3. 根据任务按需读 `synga/` 下的具体文档

**不要读：** `docs/api-reference/`, `docs/user-guides/`（upstream kepler 文档，与我们无关）

---

## 🌿 Git 操作规范

- **工作分支：** `synga/main`（主干）或 `synga/feature/xxx`（功能）
- **PR 目标：** 永远是 `synga/main`，不是 `master`
- **Commit 格式：** `feat(scope): description`（Conventional Commits）
- **大文件：** ML 权重 (.pt/.pth/.bin) 不进 git，存 MinIO

详见 → [synga/GIT_WORKFLOW.md](synga/GIT_WORKFLOW.md)

---

## 🏗️ 代码架构原则

### 前端（Kepler.gl Fork）
- **走 Kepler 的 action/reducer/selector，不在 UI 层硬插私货**
- GeoAI Tab 通过 `CustomPanelsFactory` 注入，不修改 kepler 核心
- 状态管理：Redux store，通过 actions 交互
- 组件：参考 `synga/03-design/DESIGN_SYSTEM.md`

### 后端（FastAPI）
- API 路径：`/api/v1/...`
- 推理任务：异步 + WebSocket 进度推送
- GeoJSON 结果：内存缓存 + `/jobs/{id}/geojson` 端点
- 环境变量：`.env` 文件，参考 `.env.example`

### ML / 推理
- 模型权重存 MinIO，启动时按需下载
- 推理服务独立进程（`ml/inference/sam2_server.py` port 8001）
- GPU 推理优先走 shanzi RTX5090（Tailscale）

---

## 📝 文档维护规范

**什么时候更新文档：**
- 完成一个功能 → 更新 `CONTEXT.md` 的"最新变更"
- Sprint 结束 → Lyra 写 `synga/05-sprint-log/sprint-N-review.md`
- 架构变更 → 更新 `synga/01-architecture/SYSTEM_ARCHITECTURE.md`
- 新 API → 更新 `synga/04-api/`

**不要做的：**
- 在 `docs/` 文件夹创建 Synga 文档（upstream 冲突）
- 更新 `docs/user-guides/` 或 `docs/api-reference/`（kepler 原始文档）

---

## 🤝 跨 Agent 协作

- 沟通渠道：Synga Council（`council.py send/pull`）
- 任务分配：Lyra 统筹，Council 议事厅公告
- 代码 Review：发 PR 后在 Council 通知，@相关人 review
- 文件共享：Council `/files` API 或 git push

---

## ⚠️ 注意事项

1. **szls 是唯一部署节点** — 所有服务在 szls 跑 systemd
2. **不要直接 push 到 master** — 会污染 upstream 基础
3. **ML 权重下载** — 首次部署需从 MinIO 拉模型（脚本待建）
4. **环境变量** — `.env` 不进 git，参考 `.env.example`

---

*版本：v1.0 | 2026-02-25 | Lyra 制定*
