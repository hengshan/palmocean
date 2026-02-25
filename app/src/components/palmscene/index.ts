// Barrel export — use lazy imports from here for code-splitting
export { default as PalmScene } from './PalmScene';
export { default as Ground } from './Ground';
export { default as SkyEnvironment } from './SkyEnvironment';
export { default as PalmTree } from './PalmTree';
export { default as HarvestBot } from './HarvestBot';
export { default as SceneControls } from './SceneControls';
export { default as SceneUI } from './SceneUI';

// Re-export types
export type { PalmSceneProps, GeoJSONPolygon } from './PalmScene';
export type { PalmTreeProps } from './PalmTree';
export type { HarvestBotProps, BotStatus } from './HarvestBot';
export type { SelectedAsset } from './SceneUI';
