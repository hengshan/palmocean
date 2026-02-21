# PalmView 重构计划 (REFACTOR_PLAN.md)

> **起草**: Lyra · 2026-02-21
> **状态**: RFC (Request for Comments) — 团队讨论中
> **目标**: 从 Kepler.gl fork 演进为独立的 PalmView 平台架构

---

## 1. 背景

PalmView 基于 Kepler.gl v3.2.5 fork 构建。Kepler.gl 是 Uber 在 2018 年开源的地理可视化引擎，最后一次实质性更新在 2023 年底。Nebula.gl（Uber 的另一个 GeoJSON 编辑库）已 3 年无更新。

我们 fork 了 Kepler，意味着**我们拥有这份代码**。我们不是维护者，而是建设者。应该以产品需求为导向，大胆取舍。

### 当前技术栈现状

| 维度 | 现状 | 问题 |
|------|------|------|
| Node.js | 18.18.2 (`.nvmrc` 锁定) | 2025-04 已 EOL |
| React | 18.x | 可接受，19 不急 |
| 构建 | Webpack 5 + Babel (demo-app 用 esbuild) | 开发体验差，HMR 慢 |
| 状态管理 | Redux + 自定义 action/reducer/updater 三层 | 过度工程化 |
| 组件系统 | Factory + `injectComponents()` + connect HOC | 笨重，难 debug |
| 样式 | styled-components + theme + 内联混用 | 不一致 |
| 包结构 | Monorepo 15+ packages | 仅发布 npm 时有价值 |
| 类型 | 部分 TypeScript，大量 JS | 类型安全不足 |

---

## 2. 设计原则

1. **保留 Deck.gl 渲染管线** — 这是 Kepler 的核心价值，GPU 加速、大数据渲染、图层抽象
2. **保留数据处理器** — CSV/GeoJSON/Arrow 自动推断 + `addDataToMap` pipeline
3. **简化一切中间层** — 能直接调用就不要包装，能用 hook 就不用 HOC
4. **PalmView 新功能用现代方式写** — 不被 Kepler 旧模式绑架
5. **渐进式重构** — 不做 big bang rewrite，逐模块迁移

---

## 3. 分阶段计划

### Phase 0: 隔离层（当前 Sprint 1 — 不动 Kepler 核心）

**目标**: PalmView 新功能独立于 Kepler 架构，形成清晰边界。

已完成 / 进行中：
- [x] `src/palmview/` 模块：独立的 API、类型、状态管理
- [x] `raster-state.ts`：简洁的 singleton store（不依赖 Redux）
- [x] AOI 工具栏：Geoman 集成，独立组件
- [x] Data Tab / GeoAI Panel：通过 `CustomPanelsFactory` 注入但内部逻辑自包含
- [ ] 定义 `palmview/` 与 Kepler 的接口边界文档

**原则**：在 `src/palmview/` 里自由发挥，不改 `src/` 根目录下的 Kepler 代码（除非必须）。

---

### Phase 1: 构建系统现代化（Sprint 2 初期，1-2 周）

**目标**: Webpack → Vite，开发体验质变。

#### 1.1 Vite 迁移
- demo-app 已用 esbuild，离 Vite 一步之遥
- 创建 `vite.config.ts`，替换 `webpack.config.js`
- 处理 Kepler 的 `process.env` 引用（`define` 全局替换）
- 验证 Deck.gl / MapLibre GL 在 Vite 下正常工作

#### 1.2 Node.js 升级
- `.nvmrc` 18.18.2 → 22.x LTS
- 更新依赖中的 Node API 兼容性问题
- CI pipeline 同步更新

#### 1.3 去除 Monorepo 冗余
- 当前 `packages/` 下 15+ 子包，PalmView 不需要发布 npm
- 方案 A：拍扁为单包（激进）
- 方案 B：保留 `packages/` 结构但去掉独立发布配置，用 workspace 引用（温和）
- **推荐方案 B**，降低风险

#### 讨论点 🗳️
- [ ] Vite vs Rspack？（Rspack 对 Webpack 生态兼容更好，迁移成本更低）
- [ ] Node 22 还是 20 LTS？
- [ ] 单包 vs 保留 workspace？

---

### Phase 2: 状态管理简化（Sprint 2 中后期，1-2 周）

**目标**: 统一状态管理，去掉三层套娃。

#### 2.1 现状分析

Kepler 的 Redux 架构：
```
Action Creator → Action → Root Reducer → Module Updater → State
                            ↓
            visStateReducer → visStateUpdaters.addDataToMap()
```

一个功能改动需要触碰：
1. `actions/vis-state-actions.ts` — 定义 action
2. `constants/action-types.ts` — 注册 action type
3. `reducers/vis-state.ts` — reducer case
4. `reducers/vis-state-updaters.ts` — 实际逻辑
5. `selectors/` — 读取

#### 2.2 方案

**PalmView 新状态统一到 Zustand：**

```typescript
// palmview/store.ts
import { create } from 'zustand';

interface PalmviewStore {
  // AOI
  aoiGeometry: GeoJSON.Geometry | null;
  aoiMode: 'idle' | 'drawing' | 'drawn' | 'editing';
  setAoi: (geometry: GeoJSON.Geometry | null) => void;

  // Raster layers
  rasterLayers: RasterLayer[];
  addRasterLayer: (layer: RasterLayer) => void;
  removeRasterLayer: (id: string) => void;

  // GeoAI
  activeTask: string | null;
  inferenceJobs: InferenceJob[];
  submitJob: (params: JobParams) => Promise<void>;

  // Project
  currentProject: Project | null;
}

export const usePalmviewStore = create<PalmviewStore>((set, get) => ({
  // ... 实现
}));
```

- `raster-state.ts` singleton → Zustand store（一对一迁移）
- Kepler 自身的 Redux store 保持不动，通过 selector 读取
- 桥接层：Zustand ↔ Kepler Redux 用 `subscribe` 同步必要状态

#### 讨论点 🗳️
- [ ] Zustand vs Jotai vs 继续用 Redux Toolkit（RTK）？
- [ ] 是否需要 Kepler Redux ↔ PalmView store 双向同步？还是单向（读 Kepler，写 PalmView）？

---

### Phase 3: 组件系统重构（Sprint 3，2-3 周）

**目标**: 去掉 Factory 模式，用 React 组件组合替代。

#### 3.1 现状

Kepler 的组件注入：
```javascript
// 当前方式 — Factory + injectComponents
const CustomPanelsFactory = () => {
  const OriginalPanels = PanelToggleFactory();
  const MyPanel = (props) => <div>...</div>;
  return MyPanel;
};
CustomPanelsFactory.deps = [PanelToggleFactory];

const KeplerGl = injectComponents([
  [PanelToggleFactory, CustomPanelsFactory],
]);
```

问题：
- 依赖注入是黑箱，IDE 无法跳转
- HOC 层层包裹（connect + styled + forwardRef），React DevTools 里 10 层 wrapper
- 类型推断困难

#### 3.2 方案

```tsx
// 目标方式 — 直接组合
<PalmViewApp>
  <KeplerCore
    mapboxApiAccessToken={token}
    id="map"
  />
  <PalmviewSidebar>
    <GeoAIPanel />
    <DataPanel />
  </PalmviewSidebar>
  <AoiToolbar />
  <FloatingResultsPanel />
</PalmViewApp>
```

- 用 Kepler 作为「地图渲染引擎」，外面包 PalmView shell
- 侧边栏、工具栏、浮动面板都是 PalmView 组件，不通过 Factory 注入
- 保留 `addDataToMap` / `removeDataset` 等 Kepler dispatch 接口

#### 讨论点 🗳️
- [ ] 是否保留 Kepler 侧边栏（Filter/Layer/Interaction）？还是全部用 PalmView 侧边栏替代？
- [ ] Kepler 的 Map Control（3D/地图切换等）是否保留？

---

### Phase 4: 长期演进（Sprint 4+）

| 项目 | 优先级 | 说明 |
|------|--------|------|
| TypeScript 全覆盖 | P1 | 新代码必须 TS，旧代码逐步迁移 |
| Deck.gl 升级 | P2 | 跟进最新版本（v9+） |
| React 19 | P3 | 等 Deck.gl 官方支持后再升 |
| 测试覆盖 | P2 | Playwright E2E + Vitest 单元测试 |
| 国际化 (i18n) | P3 | Kepler 有基础框架，需要扩展中文 |
| 移动端适配 | P3 | 响应式布局，触屏 AOI 绘制 |

---

## 4. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Vite 迁移后 Deck.gl WebGL shader 编译异常 | 中 | 高 | 先在分支验证，Rspack 作为 fallback |
| 去 Factory 后丢失 Kepler 内置功能 | 低 | 中 | 保留 Kepler 核心渲染，只重构 UI 壳 |
| Zustand ↔ Redux 状态同步 bug | 中 | 中 | 单向读取优先，减少双向同步 |
| 团队对 Kepler 内部机制不够熟悉 | 中 | 中 | Lyra 负责架构层，Iris/Altair 专注 PalmView 组件 |

---

## 5. 时间线总览

```
Sprint 1 (当前)  ──── Phase 0: 隔离层 + MVP 功能闭环
Sprint 2 (3月初) ──── Phase 1: Vite + Node 22 + Phase 2: Zustand
Sprint 3 (3月中) ──── Phase 3: 去 Factory，PalmView shell
Sprint 4+ ──────── Phase 4: 持续演进
```

---

## 6. 团队分工建议

| 角色 | 负责 |
|------|------|
| **Lyra** | 架构决策、Phase 1/2 实施、状态管理设计、Code Review |
| **Vega** | 后端 API 持续迭代、CI/CD 更新（Node 22、Vite 构建） |
| **Altair** | Phase 3 组件重构、PalmView shell 搭建 |
| **Iris** | 新功能 UI 组件（用重构后的模式编写）、E2E 测试 |
| **Hank** | 产品方向、最终决策、用户验证 |

---

## 请团队回复以下投票项 🗳️

1. **构建工具**：Vite / Rspack / 继续 Webpack？
2. **Node 版本**：22 LTS / 20 LTS？
3. **状态管理**：Zustand / Jotai / Redux Toolkit？
4. **Monorepo**：拍扁单包 / 保留 workspace？
5. **Kepler 侧边栏**：保留 / 全部替换为 PalmView？
6. **其他意见、顾虑、建议？**

请在 Council 回复你的投票和想法，Lyra 将综合意见后做最终架构决策。

---

*星图已经展开，等待大家的星光汇入 ✨*
