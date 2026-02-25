# PalmScene UI 设计规范

> PalmScene（Field Workspace）的 3D 界面结构与交互规范
> 主引擎：CesiumJS | 辅引擎：Three.js（高度定制元素）
> 最后更新：2026-02-25

---

## 一、三维界面结构

```
┌─────────────────────────────────────────────────────────┐
│  顶部工具栏：测量 | 标记 | 任务 | [返回 PalmView ←]     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                                                         │
│              3D 场景 Canvas (CesiumJS)                  │
│                                                         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  右侧属性面板：                                          │
│  ──────────────                                         │
│  Tree ID:          T-007                                │
│  Height:           12.4m                                │
│  Crown Diameter:   4.2m                                 │
│  Health Score:     68 / 100                             │
│  Fruit Maturity:   78%                                  │
│  Last Inspection:  2026-02-20                           │
│                                                         │
│  ────── 机器人联动 ──────                                │
│  [+ Create Task]                                        │
│  路径规划 / 采摘任务 / 巡检任务                           │
└─────────────────────────────────────────────────────────┘
```

---

## 二、技术选型说明

### 主引擎：CesiumJS

适用于：
- 大地坐标系下的地形渲染（真实高程）
- 棕榈树点云 / LiDAR 扫描 → 3D Tiles 大规模渲染
- 种植园地块 3D 边界（GeoJSON → CesiumJS Entity）
- 机器人路径实时动画（时序轨迹回放）
- 卫星影像底图叠加（Ion Assets）

### 辅引擎：Three.js + @react-three/fiber

适用于：
- 机器人机械臂动画（需要精细控制 mesh 节点）
- 仪表 overlay UI（HUD 风格信息展示）
- 高度定制的视觉特效
- CesiumJS 难以实现的自定义 shader

---

## 三、三维操作规范

### 基础导航

| 操作 | 方式 |
|------|------|
| Orbit（旋转视角）| 左键拖拽 |
| Zoom（缩放）| 滚轮 / 右键拖拽 |
| Pan（平移）| 中键拖拽 |
| 重置视角 | 双击目标对象 |

### 对象交互

**树木选中：**
- 单击选中 → 右侧属性面板更新
- 选中后树木高亮（颜色变化 + 边框光晕）
- 支持批量框选（绘制矩形选区）

**选中树木后，右侧属性面板显示：**
```
Tree ID:         T-007
Height:          12.4m
Crown Diameter:  4.2m
Health Score:    68 / 100
Fruit Maturity:  78%
Last Inspection: 2026-02-20
上次采收时间:     2026-01-15
推荐下次采收:     2026-03-10 (预测)
```

---

## 四、从 PalmView 跳转进入

**触发方式：**
1. PalmView GeoAI 结果面板点击 `[Enter 3D View]`
2. PalmView 地图上选中单棵树后点击 `Enter 3D View`

**跳转行为：**
1. 相机平滑飞行动画（2D 鸟瞰 → 3D 视角，约 2 秒）
2. 自动定位到目标地理坐标
3. 目标树 / 区域高亮
4. PalmView 分析数据（health score、confidence 等）自动带入属性面板

---

## 五、机器人联动（预留）

右侧面板底部预留机器人任务区域：

```
────── 机器人联动 ──────
[+ Create Task]

任务类型：
○ 采摘任务（自动路径规划）
○ 巡检任务（拍照 + 健康评估）
○ 施肥/灌溉任务

目标：已选中 5 棵树

[确认派发 →]
```

对接 HarvestBot：
- 任务下发 → PalmOcean API → 机器人路径规划
- 机器人实时位置 → WebSocket → PalmScene 渲染机器人位置动画

---

## 六、3D 资产规范

### 棕榈树资产
- 来源：Seed3D API（火山引擎）从真实照片生成
- 格式：GLTF/GLB（发布前转换）
- LOD 级别：LOD0（近景）/ LOD1（中景）/ LOD2（远景/图标）
- 健康度颜色编码：绿（>80）→ 黄（50-80）→ 红（<50）

### 地形资产
- 来源：LiDAR 点云 → 地形网格
- 格式：Quantized Mesh（CesiumJS 原生支持）
- 精度：1m 分辨率（园区级）/ 10cm（精细区域）

### 机器人资产
- 格式：GLTF（支持骨骼动画）
- 状态动画：idle / moving / harvesting
- 实时位置：PalmOcean WebSocket 更新

---

## 七、性能指标目标

| 指标 | 目标 |
|------|------|
| FPS | ≥ 30fps（10万棵树场景）|
| 加载时间 | 初始场景 < 5s |
| 点云规模 | 单场景 > 1000万点（3D Tiles 流式加载）|
| 切换延迟 | PalmView → PalmScene < 2s |

---

*相关文档：*
- *[UX_DESIGN.md](../00-vision/UX_DESIGN.md) — 完整 UX 设计*
- *[PALMVIEW_UI.md](PALMVIEW_UI.md) — PalmView 界面规范*
- *[SYSTEM_ARCHITECTURE.md](../01-architecture/SYSTEM_ARCHITECTURE.md) — 技术架构*
