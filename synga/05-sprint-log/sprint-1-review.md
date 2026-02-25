# Sprint 1 Review — PalmView MVP

**日期：** 2026-02-20 ~ 2026-02-25
**状态：** ✅ 完成

---

## 🎯 目标与成果

Sprint 1 目标：打通 GeoAI 端到端推理链路，实现 MVP 可演示。

**全部完成 ✅**

| 任务 | 负责人 | 成果 |
|------|--------|------|
| T1 Docker Compose 部署 | Vega | 四服务 docker-compose + systemd 稳定运行 |
| T2 数据库 Seed | Vega | PostgreSQL/PostGIS 初始化 + 测试数据 |
| T3 AOI 绘制流程 | Altair | 12 个工具全显示，0 JS 错误 |
| T4 推理结果展示 | Iris | 自动渲染 + Confidence 5档颜色渐变 |
| T5 SAM2 推理服务 | Lyra | 推理链路全通，124 features 返回 |
| T6 Mapbox Token 配置 | Altair + Lyra | 地图底图正常显示 |
| systemd 四服务 | Vega + Lyra | szls 重启后自动拉起 |
| UI Review P1/P2 | Lyra | Add Data modal 修复等 |
| 端到端验证 | Lyra | submit→WS→GeoJSON→Kepler 全链路验证 |

---

## 🔑 关键技术决策

1. **GeoJSON 内存缓存**：推理完成后存 `_output_cache`，通过 `/jobs/{id}/geojson` 读取
2. **WS complete 内联 geojson**：完成即渲染，无需二次 HTTP 请求
3. **YOLOv8 weights 发现**：`ml/runs/palm_detect_v1/` 有训练好的权重，Sprint 2 接入真实推理
4. **ML 权重不进 git**：体积大（1.6GB），统一存 MinIO，.gitignore 已配置

---

## 🐛 重要 Bug 修复

- `WebSocket complete` 消息缺少 `geojson` 键 → 修复后 Kepler 自动渲染
- `/outputs/{job_id}/result.geojson` 路由不存在（404）→ 新建 `/jobs/{id}/geojson`
- Add Data modal 启动时自动弹出 → 通过 `initialUiState` + dispatch 修复
- RemoteCLIP-ViT-L-14.pt (1.6GB) 误入 git → filter-repo 清除，加入 .gitignore

---

## 🚀 MVP 演示地址

http://szls.taila366a3.ts.net:8080

操作流程：AOI 绘制 → Run Inference → 推理完成 → Kepler 地图显示颜色渐变结果

---

## 📋 遗留到 Sprint 2

- YOLOv8 真实权重接入 sam2_server（替换 mock）
- PalmOcean 3D 数字孪生基础架构
- 产品文档重构（CONTEXT.md / synga/ 体系）→ **已在 Sprint 1 结束时完成**

---

*记录人：Lyra | 2026-02-25*
