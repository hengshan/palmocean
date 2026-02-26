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

---

## Cursor Cloud specific instructions

### Services overview

| Service | Port | How to start |
|---------|------|-------------|
| **Frontend** (kepler.gl + GeoAI) | 8080 | `cd app && NODE_ENV=local node esbuild.config.mjs --start` |
| **Backend** (FastAPI) | 8000 | `cd backend && source .venv/bin/activate && uvicorn app.main_v1:app --host 0.0.0.0 --port 8000 --reload` |
| **PostgreSQL + PostGIS** | 5434 | `sudo docker compose -f docker-compose.infra.yml up -d` |
| **MinIO** | 9000/9001 | Started with docker-compose above |

### Gotchas

- **Node version**: Despite `.nvmrc` saying 18.18.2, the esbuild config (`app/esbuild.config.mjs`) uses `import ... with {type: 'json'}` which requires **Node >= 20**. Use `nvm use 20` for the frontend.
- **Yarn version**: Must be **4.4.0** (Berry). Enable via `corepack enable && corepack prepare yarn@4.4.0 --activate`.
- **Alembic migrations** have a table ordering bug in `465b89dd9e71_initial_schema.py`. For fresh dev DBs, use `python -c "from app.database import init_db; init_db()"` instead.
- **Auth columns**: The `users` table created by `init_db()` is missing `id`, `username`, `password_hash`, `role`, `is_active` columns needed by `app/services/auth.py`. Add them with ALTER TABLE (see setup session for exact SQL).
- **Inference backend**: Set `GEO_INFERENCE_BACKEND=mock` in `backend/.env` when no GPU is available (no SAM2/YOLO servers).
- **Mapbox token**: Frontend needs a **public** token (`pk.xxx`) as `MapboxAccessToken` in `app/.env` for map tiles. Secret tokens (`sk.xxx`) will NOT work for browser map rendering. Without a valid public token, the app loads and all panels work but the map background is blank.
- **WebGL in Cloud VM**: The cloud VM has no GPU, so deck.gl/MapLibre GL map tile rendering fails silently (red toast: "An error in deck.gl: Failed to create"). All panels and UI components remain fully functional — only the map canvas is blank. This is expected and not a code issue.
- **Docker**: Required for PostgreSQL+PostGIS and MinIO. Start Docker daemon with `sudo dockerd &` if not already running, then `sudo docker compose -f docker-compose.infra.yml up -d`.
- **MinIO bucket**: After first start, create the assets bucket: `sudo docker exec palmview-minio mc alias set local http://localhost:9000 palmview RlICGo8ARMyYFc2FLQva && sudo docker exec palmview-minio mc mb --ignore-existing local/palmview-assets`.

### Lint & Test

- **Frontend lint**: `yarn typescript` (TS check) and `yarn lint` (ESLint). Note: `@types/three` causes TS errors due to version mismatch with TS 4.7 — pre-existing, not a blocker.
- **Frontend tests**: `yarn test-jest` (13 suites, 135 tests).
- **Backend lint**: `cd backend && source .venv/bin/activate && ruff check app/` (54 pre-existing warnings).
- **Backend tests**: No automated tests exist yet.
