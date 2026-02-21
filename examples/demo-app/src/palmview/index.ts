/**
 * PalmView module — barrel export
 */
export * from './types';
export * from './api';
export * from './api-data';
export {FloatingResultsPanel} from './components/floating-results-panel';
export {buildKeplerPayload, addResultsToKeplerMap} from './kepler-integration';
export * from './raster-state';
// aoi-toolbar removed — AOI drawing now uses Nebula.gl via Kepler editor (see factories/aoi-control.tsx)
