# DVC 使用指南 — PalmView

> DVC（Data Version Control）管理所有大文件：训练数据集、ML 模型权重、遥感影像。
> 代码走 git，大文件走 DVC + MinIO。

---

## 存储配置

| 参数 | 值 |
|------|-----|
| Remote | `s3://palmview-data/dvc` |
| MinIO Endpoint | `http://szls.taila366a3.ts.net:9000`（Tailscale）|
| Bucket | `palmview-data` |
| MinIO Web Console | `http://szls.taila366a3.ts.net:9001` |

szls 本地优化（速度更快）：
```bash
dvc remote modify --local default endpointurl http://localhost:9000
```

---

## DVC 管理的目录

| DVC 文件 | 内容 | 大小参考 |
|---------|------|---------|
| `data.dvc` | `data/` 训练数据集（图像、标注） | ~500MB，21,080 文件 |
| `ml/weights.dvc` | `ml/weights/` 模型权重 | ~1.6GB（RemoteCLIP 等）|

**注意：** `ml/weights/` 和 `data/` 已加入 `.gitignore`，只用 DVC 追踪，不进 git。

---

## 安装

```bash
source ~/miniconda3/etc/profile.d/conda.sh && conda activate lntorch
pip install dvc dvc-s3
```

---

## 日常操作

### 新机器初次拉取（clone 后）
```bash
cd ~/projects/palmview
git checkout synga/main
dvc pull          # 拉取数据集 + 模型权重（约 2GB，需时间）
```

### 添加新模型权重
```bash
# 把新权重放入 ml/weights/
cp new_model.pt ml/weights/

# DVC 追踪
dvc add ml/weights/
dvc push

# Git 提交 .dvc 指针文件
git add ml/weights.dvc
git commit -m "chore(ml): add new model weights via DVC"
git push origin synga/main
```

### 添加新训练数据
```bash
# 放入 data/ 目录后：
dvc add data/
dvc push
git add data.dvc
git commit -m "data: update dataset vX.X"
git push origin synga/main
```

### 检查同步状态
```bash
dvc status          # 本地文件是否与 .dvc 指针一致
dvc diff            # 查看变更详情
```

---

## 各机器操作说明

| 机器 | 路径 | 备注 |
|------|------|------|
| shanzi (WSL2) | `~/projects/palmview` | 主开发机，通过 Tailscale 连 MinIO |
| szls | `~/projects/palmview` | MinIO 所在机器，建议用 localhost:9000 |
| nano (Iris) | `~/.openclaw/workspace/palmview` | 通过 Tailscale 连 MinIO |
| rpi (Altair) | `/mnt/hanku/clawd/palmview` | 通过 Tailscale 连 MinIO |

---

## 规范

1. **大文件永远不进 git** — 超过 50MB 的文件用 DVC
2. **先 dvc push，再 git push** — 确保 MinIO 有数据后再提交指针
3. **`.dvc` 文件要进 git** — 这是 DVC 的"指针"，轻量
4. **模型版本管理** — 重要模型用目录区分版本：`ml/weights/v1/`, `ml/weights/v2/`

---

*更新：2026-02-25 | 迁移自 docs/DVC_GUIDE.md 并补充 ml/weights 规范*
