# PalmView UI/UX 评估报告
**日期**: 2026-02-21  
**评估人**: Lyra  
**版本**: Sprint 1 Day 1 (feature/geoai-tab branch)  
**方法**: Playwright headless 自动化截图 + 逐 Tab 功能审查

---

## 📊 总体评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 正确性 | ⭐⭐⭐ 3/5 | 基础框架可用，但多处功能是占位符 |
| 流程优化 | ⭐⭐ 2/5 | 用户流程不连贯，关键路径断裂 |
| 简单易用性 | ⭐⭐⭐ 3/5 | Kepler 基础 UI 质量高，但自定义部分风格不统一 |

---

## 🗂️ Tab 结构审查（6 个 Tab）

| Tab | 内容 | 状态 | 评价 |
|-----|------|------|------|
| 0 - Layers | Kepler 原生图层管理 | ✅ 正常 | 标准 Kepler，质量好 |
| 1 - Filters | Kepler 原生过滤器 | ✅ 正常 | 空状态，需要先加载数据 |
| 2 - Interactions | Tooltip/Geocoder/Brush/Coordinates | ✅ 正常 | 标准 Kepler |
| 3 - Base Map | 地图样式选择 | ✅ 正常 | 标准 Kepler |
| 4 - 🧠 GeoAI | 分析任务/模型配置/运行 | ⚠️ 部分可用 | 见详细评价 |
| 5 - 🛰 Data | STAC/GEE 数据搜索 | ⚠️ 部分可用 | 见详细评价 |

---

## 🧠 GeoAI Tab 详细评价

### 👍 做得好的
- 4 种分析任务卡片（Detection/Segmentation/Classification/Change Detection）分类清晰
- 暗色主题与 Kepler 原生风格基本一致
- 有 Model Config 区域和 Run Analysis 按钮

### ❌ 问题

1. **任务卡片没有视觉反馈**
   - 点击任务卡片后无明显选中状态（无高亮、无边框变化）
   - 用户不知道自己选了什么
   - **建议**: 选中卡片应有明显的绿色边框/#1FBF6E accent 高亮

2. **Model Config 折叠**
   - 模型配置区域默认折叠，用户可能不知道需要展开
   - **建议**: 选择任务后自动展开 Model Config，显示该任务可用的模型

3. **Run Analysis 按钮位置**
   - 在 sidebar 底部，容易被忽略
   - **建议**: 应在选择任务 + 模型后更显眼

4. **缺少引导流程**
   - 用户进来面对 4 个卡片，不知道下一步是什么
   - **建议**: 添加步骤指引 (Step 1: 选择任务 → Step 2: 配置模型 → Step 3: 选择 AOI → Step 4: 运行)

5. **AOI 选择完全缺失**
   - 没有画框/画多边形的入口
   - 这是核心功能缺失——用户无法指定分析区域

---

## 🛰 Data Tab 详细评价

### 👍 做得好的
- STAC / GEE 双源切换设计合理
- Provider 下拉（Planetary Computer / Earth Search / Copernicus）完整
- Collection 选择合理（sentinel-2-l2a 默认选择好）
- 有搜索参数区域（bbox、日期范围、云量）

### ❌ 问题

1. **Bounding Box 手动输入**
   - 用户需要手动输入 west/south/east/north 坐标！
   - 这对普通用户来说完全不可接受
   - **建议**: 应该用 "Search Current View" 按钮自动获取地图视野 bbox，或者让用户在地图上画框

2. **搜索结果区域为空**
   - 没有搜索过所以是空的，但空状态提示不够友好
   - **建议**: 显示引导文字 "Move map to your area of interest, then click Search"

3. **"Load to Map" 功能未真正实现**
   - 缺少 mapbox map 实例引用（#92 阻塞点）
   - 栅格图层无法真正加载
   - **Status**: 等 Altair 实现 getMapboxRef 方案

4. **下载进度缺失**
   - Download 按钮点击后无进度反馈
   - **建议**: 需要下载进度条或至少 loading spinner

5. **GEE 模式未测试**
   - GEE 后端已就绪但前端可能未完全对接
   - 切换到 GEE 后 collection 列表是否正确加载？

---

## 🎨 视觉设计评价

### 👍 做得好的
- PalmView logo 和品牌色（绿色 #1FBF6E）辨识度好
- 整体暗色主题统一
- 地图默认定位新加坡 ✅

### ❌ 问题

1. **Tab 图标不统一**
   - 前 4 个 Tab 用 Kepler 原生 SVG 图标（精致）
   - GeoAI Tab 用 emoji 🧠（风格突兀）
   - Data Tab 用 emoji 🛰（同上）
   - **建议**: 所有 tab 统一使用 SVG 图标，设计自定义的 GeoAI 和 Data 图标

2. **Kepler 3.1 + DuckDB 横幅**
   - 右上角有 Kepler 原生的广告横幅 "kepler.gl 3.1 + DuckDB"
   - 不应该出现在 PalmView 产品中
   - **建议**: 移除或替换为 PalmView 的信息

3. **自定义 Tab 内容样式与 Kepler 原生 Tab 有差异**
   - GeoAI 和 Data Tab 的字体大小、间距与原生 Tab 略有不同
   - **建议**: 仔细对齐 padding、font-size、color 与 Kepler 原生面板

---

## 🔄 用户流程分析

### 理想流程: 用户想分析一块区域的棕榈树
```
1. 打开 PalmView → 看到新加坡地图 ✅
2. 加载卫星数据 → Data Tab → 搜索 → 加载到地图 ❌ (bbox 手动输入, Load 未实现)
3. 选择分析区域 → 在地图上画框 ❌ (AOI 选择缺失)
4. 选择分析任务 → GeoAI Tab → Detection ⚠️ (选中状态不明显)
5. 配置模型 → Model Config ⚠️ (默认折叠)
6. 运行分析 → Run Analysis ⚠️ (simulation placeholder)
7. 查看结果 → 地图上叠加结果 ❌ (结果加载未实现)
```

**结论**: 核心用户流程的 7 步中，只有第 1 步完全可用。这是 Sprint 1 需要重点打通的。

---

## 🏆 竞品参考

调研了以下平台的 UI/UX 设计：

1. **Felt.com** — 云原生 GIS，极简设计，AI 驱动
   - 学习点：极简 UI、一键操作、AI 辅助建图

2. **OpenGeoAI (opengeoai.org)** — 开源 GeoAI 平台
   - 学习点：搜索→下载→训练→推理的完整流程

3. **GeoWGS84.ai** — GeoAI 分析平台
   - 学习点：在线工具和模型工作流

### 关键学习
- **Felt 的核心优势**: 零学习成本，用户不需要懂 GIS 术语
- **我们的定位**: 专业 GeoAI 用户，可以接受一定学习成本，但操作流程必须流畅
- **建议方向**: Data Tab 做成 "一键搜索当前视野" 而非手动输入坐标

---

## 📋 Sprint 1 优先修复建议

### P0 — 必须修复（阻塞演示）
1. **Data Tab bbox 自动获取** — "Search Current View" 用地图视野
2. **Map ref 实现** — getMapboxRef 方案，解除栅格加载阻塞
3. **移除 Kepler 广告横幅** — "kepler.gl 3.1 + DuckDB"

### P1 — 重要改进
4. **GeoAI 任务选中状态** — 视觉反馈
5. **Tab 图标统一** — SVG 替换 emoji
6. **AOI 选择入口** — 接入 Kepler editor 画框工具

### P2 — 体验优化
7. **步骤引导** — GeoAI Tab 加步骤提示
8. **空状态优化** — Data Tab 和 GeoAI Tab 的空状态引导
9. **下载进度反馈** — Loading 状态
10. **样式对齐** — 自定义面板与 Kepler 原生风格统一

---

*评估完毕。建议每次前端有重大更新后重新执行评估。 — Lyra ✨*
