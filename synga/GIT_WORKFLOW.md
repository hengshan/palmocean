# Synga Git 工作流规范

> 适用于所有基于 upstream fork 的 Synga 项目（PalmView、RipeEye 等）

---

## 🌿 分支策略

```
upstream (kepler-orgs/kepler.gl)
    ↓ 只 fetch，永远不 push
origin (hengshan/palmview)
    ├── master        ← upstream 基础，只读，永不推代码
    └── synga/main   ← 我们的主干 ⭐
            ↓ 功能开发
        synga/feature/xxx  ← PR 后立即删除
```

### 黄金法则

1. **永远不要 push 到 `master`**（upstream kepler.gl 基础）
2. **功能分支生命周期 = PR 合并之前**，merge 后立即删除
3. **PR 目标永远是 `synga/main`**，不是 `master`
4. **ML 模型权重不进 git**（存 MinIO，见下方）

---

## 📋 日常工作流

### 开发新功能

```bash
# 1. 从 synga/main 切出功能分支
git checkout synga/main && git pull
git checkout -b synga/feature/your-feature

# 2. 开发、提交
git add . && git commit -m "feat(scope): description"

# 3. 推到 origin
git push origin synga/feature/your-feature

# 4. 在 GitHub 发起 PR → synga/main（不是 master！）

# 5. PR merge 后，删除分支
git push origin --delete synga/feature/your-feature
git branch -D synga/feature/your-feature
```

### 拉取上游更新（kepler.gl 有重要更新时）

```bash
# 只 fetch，不 merge（先评估）
git fetch origin master

# 评估变更后，有选择地 cherry-pick 或 merge
# 由 Lyra 主导，需要全员 review
```

---

## 📝 Commit Message 规范

遵循 **Conventional Commits**：

```
<type>(<scope>): <description>

Types: feat | fix | chore | docs | refactor | test | style
Scope: geoai | backend | ml | deploy | ui | infra | docs

示例:
feat(geoai): add confidence color gradient to Kepler layer
fix(backend): cache GeoJSON in memory for WS broadcast
chore: exclude ML weights from git tracking
docs: update CONTEXT.md sprint status
```

---

## 📦 文件存储规范

| 文件类型 | 存放位置 | 原因 |
|---------|---------|------|
| ML 模型权重 (*.pt, *.pth, *.bin) | MinIO `synga-models/` | 体积大（GB级），git 不适合 |
| 训练数据集 | MinIO `synga-datasets/` | 同上 |
| 遥感影像 | MinIO `synga-imagery/` | 同上 |
| 推理结果 GeoJSON | MinIO / DB | 按需持久化 |
| 代码 & 配置 | git | ✅ |
| 文档 | git `synga/` 文件夹 | ✅ |

`.gitignore` 已配置排除：`ml/weights/`, `ml/runs/`, `*.pt`, `*.pth`, `*.bin`, `*.onnx`

---

## 📁 目录结构规范（Fork 项目）

```
project-root/
├── CONTEXT.md        ← Agent 必读（我们创建，无 upstream 冲突）
├── ROADMAP.md        ← 产品路线图（我们创建）
├── AGENTS.md         ← AI 协作规范（我们创建）
│
├── synga/            ← ⭐ 所有 Synga 文档（绝不与 upstream 冲突）
│   ├── 00-vision/
│   ├── 01-architecture/
│   ├── 02-ml/
│   ├── 03-design/
│   ├── 04-api/
│   ├── 05-sprint-log/
│   └── GIT_WORKFLOW.md（本文件）
│
├── docs/             ← 不动！upstream kepler.gl 文档
├── src/              ← kepler.gl 核心源码（最小化修改）
├── app/              ← PalmView 前端主应用
└── backend/          ← PalmView 后端 API
```

**原则：** 我们的文件放 `synga/`，绝不在 `docs/` 创建 Synga 文件。

---

## 🚀 新项目初始化清单（RipeEye 等）

Fork 一个新 upstream 后，立即执行：

```bash
# 1. 重命名默认分支
git checkout -b synga/main
git push origin synga/main

# 2. 在 GitHub 设置 synga/main 为默认分支

# 3. 创建文档结构
mkdir -p synga/{00-vision,01-architecture,02-ml,03-design,04-api,05-sprint-log}

# 4. 创建初始文档
touch CONTEXT.md AGENTS.md ROADMAP.md
touch synga/GIT_WORKFLOW.md

# 5. 更新 .gitignore（ML 权重等）
echo "ml/weights/\nml/runs/\n*.pt\n*.pth" >> .gitignore

# 6. 初始 commit
git add -A && git commit -m "chore(synga): init project structure and docs"
```

---

*版本：v1.0 | 2026-02-25 | 由 Lyra 制定*
