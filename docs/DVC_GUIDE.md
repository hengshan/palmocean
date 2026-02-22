# DVC 使用指南 — PalmView

## 安装

```bash
# 在 lntorch conda 环境中
source ~/miniconda3/etc/profile.d/conda.sh && conda activate lntorch
pip install dvc dvc-s3
```

## 远端存储

使用 szls 上的 MinIO（S3 兼容）：
- **Endpoint**: `http://szls.taila366a3.ts.net:9000` (Tailscale) 或 `http://100.81.217.18:9000`
- **Bucket**: `palmview-data`
- **Web Console**: `http://szls.taila366a3.ts.net:9001`

配置已写入 `.dvc/config`。Credentials 使用 MinIO 的 `palmview` 用户。

## 日常操作

### 拉取数据（新机器 / clone 后）
```bash
cd ~/projects/palmview
dvc pull
```

### 添加新数据
```bash
# 把文件放入 data/ 目录，然后：
dvc add data/
git add data.dvc .gitignore
git commit -m "data: update dataset"
dvc push
git push
```

### 检查状态
```bash
dvc status        # 本地是否与 .dvc 文件一致
dvc diff          # 查看变更详情
```

## 各机器配置说明

| 机器 | palmview 路径 | 备注 |
|------|-------------|------|
| shanzi (WSL2) | `~/projects/palmview` | 主开发机 |
| szls | `~/projects/palmview` | MinIO 所在机器，可直连 localhost:9000 |
| nano | `~/projects/palmview` | Jetson，通过 Tailscale 连 MinIO |
| rpi | `~/projects/palmview` | 树莓派，通过 Tailscale 连 MinIO |

**szls 本地优化**：可将 endpoint 改为 localhost：
```bash
dvc remote modify --local default endpointurl http://localhost:9000
```

## 注意事项

- `data/` 目录由 DVC 管理，不要直接 `git add data/` 中的大文件
- `.dvc` 文件和 `.dvc/` 目录需要提交到 git
- `dvc push` 前确保 MinIO 可达（Tailscale 需连接）
- 大文件变更后先 `dvc add`，再 `git commit`，最后 `dvc push`
