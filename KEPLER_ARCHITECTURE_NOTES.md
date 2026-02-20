# Kepler.gl Architecture Analysis for GeoAI Tab

*By Altair 🦅 — Sprint 1 前置任务*

## 项目结构

Kepler.gl 是一个 **monorepo**（Yarn workspaces），核心源码在 `src/` 下：

```
src/
├── actions/       # Redux action creators (按领域分: vis-state, map-state, ui-state, etc.)
├── ai-assistant/  # 已有 AI 助手插件（参考！）
├── components/    # React 组件（styled-components）
│   └── src/
│       ├── side-panel/   # ⭐ 侧边栏面板 — GeoAI Tab 的注入点
│       ├── map/          # 地图容器
│       ├── modals/       # 弹窗
│       └── ...
├── reducers/      # Redux reducers (纯函数 updaters 模式)
├── layers/        # 图层类型定义
├── schemas/       # 数据 schema / 序列化
├── types/         # TypeScript 类型定义
└── utils/         # 工具函数
```

## ⭐ 核心发现：CustomPanelsFactory（GeoAI Tab 的入口）

**文件**: `src/components/src/side-panel/custom-panel.tsx`

Kepler 使用 **Factory + Dependency Injection** 模式。`CustomPanelsFactory` 是一个占位组件，专门设计来被替换：

```tsx
// 替换方法：创建新 factory，通过 injectComponents 注入
function GeoAIPanelFactory() {
  const GeoAIPanel = (props) => {
    if (props.activeSidePanel === 'geoai') {
      return <GeoAITabContent {...props} />;
    }
    return null;
  };
  
  GeoAIPanel.panels = [{
    id: 'geoai',
    label: 'GeoAI',
    iconComponent: Icons.Rocket  // 需要自定义图标
  }];
  
  GeoAIPanel.getProps = (sidePanelProps) => ({
    layers: sidePanelProps.layers,
    datasets: sidePanelProps.datasets
  });
  
  return GeoAIPanel;
}

// 在 app 入口注入
const KeplerGl = injectComponents([
  [CustomPanelsFactory, GeoAIPanelFactory]
]);
```

## 注入机制 (injector.tsx)

- `injector()` 维护一个 `Map<Factory, Factory>` 映射
- `provide(originalFactory, replacementFactory)` 注册替换
- `get(factory)` 递归解析依赖并缓存实例
- 支持 `factory.deps = [dep1, dep2]` 声明依赖

## 参考：ai-assistant 模块

已有的 AI 助手模块给我们很好的参考：
- `src/ai-assistant/src/components/` — 面板组件
- `src/ai-assistant/src/reducers/` — 独立 reducer
- `src/ai-assistant/src/actions.ts` — 独立 action
- 通过 `useSelector` 直接连接 Redux store

## Side Panel Tab 系统

- `panel-tab.tsx` — 单个 tab 按钮（图标 + tooltip）
- `panel-toggle.tsx` — tab 切换条
- 内置 tabs: Layer, Filter, Interaction, Map, (Custom...)
- `side-bar.tsx` — 可折叠侧边栏容器

## 技术栈

- React + Redux（传统 class 组件 + hooks 混用）
- styled-components 主题系统
- deck.gl / Mapbox GL 地图渲染
- Yarn 4.4.0 + Node 18

## GeoAI Tab 实现方案建议

1. **新建 `src/geoai/` 模块**（参考 ai-assistant 结构）
2. **通过 CustomPanelsFactory 注入** side panel tab
3. **独立 reducer** 管理 GeoAI 状态（AOI、模型选择、任务、结果）
4. **地图交互** 通过 deck.gl EditableGeoJsonLayer 实现 AOI 绘制
5. **后端通信** 通过 async thunk 调用 PalmView API

### 与 Lyra #38 设计方案的对接

Lyra 提出的 GeoAI 面板布局（AOI 工具栏 → 自然语言指令 → 模型选择 → 结果列表 → 任务历史）完全可以在 CustomPanels 框架内实现，每个区块作为一个子组件。
