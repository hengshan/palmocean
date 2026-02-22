/**
 * PalmView Raster Layer State Management
 * Manages raster layers loaded from STAC/GEE onto the Mapbox map.
 * Also manages Data Tab UI state so it persists across panel switches.
 * Author: IRIS · 2026-02-21
 */

// ── Types ────────────────────────────────────────────

export type RasterSourceType = 'stac' | 'gee' | 'local' | 'vector';

export interface RasterLayer {
  id: string;
  name: string;
  sourceType: RasterSourceType;
  sourceUrl: string;
  bbox: [number, number, number, number];
  visible: boolean;
  opacity: number;
  acquisitionDate?: string;
  collectionId?: string;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
  addedAt: number;
}

export interface AoiState {
  mode: 'idle' | 'drawing' | 'drawn' | 'editing';
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
}

// ── Data Tab UI State (persists across panel switches) ──

export interface STACSearchItemPersist {
  id: string;
  collection: string;
  datetime: string;
  bbox: number[];
  properties: Record<string, any>;
  assets: Record<string, { href: string; type?: string; title?: string }>;
  links?: Array<{ rel: string; href: string }>;
}

export interface LoadedLayerInfo {
  id: string;
  itemId: string;
  sourceId: string;
  visible: boolean;
  sourceType: RasterSourceType;
  opacity: number;
  /** Info needed to re-add layer after style change */
  tileUrl?: string;
  imageUrl?: string;
  bbox?: [number, number, number, number];
  /** For vector layers: GeoJSON data for re-add after style change */
  geojsonData?: any;
  /** For vector layers: geometry type to determine layer style */
  geomType?: string;
  /** Additional sub-layer ids (e.g. outline layer for polygons) */
  subLayerIds?: string[];
}

export interface DataTabState {
  source: 'stac' | 'gee' | 'local';
  // STAC search params
  selectedProvider: string;
  selectedCollection: string;
  dateFrom: string;
  dateTo: string;
  maxCloud: number;
  bboxStr: string;
  // STAC results
  results: STACSearchItemPersist[];
  searchError: string | null;
  // Loaded layers (across all sources)
  loadedLayers: LoadedLayerInfo[];
  // Upload status
  uploadStatus: string | null;
  // GEE state
  geeResults: any[];
  geeCollection: string;
  geeDateFrom: string;
  geeDateTo: string;
  geeMaxCloud: number;
  geeStatus: 'checking' | 'connected' | 'disconnected';
}

export interface PalmviewMapState {
  rasterLayers: RasterLayer[];
  aoiState: AoiState;
  dataTab: DataTabState;
}

// ── Initial State ────────────────────────────────────

function createInitialDataTabState(): DataTabState {
  return {
    source: 'stac',
    selectedProvider: 'planetary-computer',
    selectedCollection: 'sentinel-2-l2a',
    dateFrom: '2025-01-01',
    dateTo: '2025-12-31',
    maxCloud: 30,
    bboxStr: '103.6,1.2,104.0,1.45',
    results: [],
    searchError: null,
    loadedLayers: [],
    uploadStatus: null,
    geeResults: [],
    geeCollection: 'COPERNICUS/S2_SR_HARMONIZED',
    geeDateFrom: '2025-01-01',
    geeDateTo: '2025-12-31',
    geeMaxCloud: 30,
    geeStatus: 'checking',
  };
}

export function createInitialMapState(): PalmviewMapState {
  return {
    rasterLayers: [],
    aoiState: {
      mode: 'idle',
      geometry: null,
    },
    dataTab: createInitialDataTabState(),
  };
}

// ── Singleton store ──────────────────────────────────

let _state: PalmviewMapState = createInitialMapState();
const _listeners: Set<(s: PalmviewMapState) => void> = new Set();

function _notify() {
  _listeners.forEach((fn) => fn(_state));
}

export function getMapState(): PalmviewMapState {
  return _state;
}

export function subscribe(fn: (s: PalmviewMapState) => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ── Data Tab Actions ─────────────────────────────────

export function updateDataTab(partial: Partial<DataTabState>): void {
  _state = {
    ..._state,
    dataTab: { ..._state.dataTab, ...partial },
  };
  _notify();
}

export function addLoadedLayer(layer: LoadedLayerInfo): void {
  _state = {
    ..._state,
    dataTab: {
      ..._state.dataTab,
      loadedLayers: [..._state.dataTab.loadedLayers, layer],
    },
  };
  _notify();
}

export function updateLoadedLayer(layerId: string, partial: Partial<LoadedLayerInfo>): void {
  _state = {
    ..._state,
    dataTab: {
      ..._state.dataTab,
      loadedLayers: _state.dataTab.loadedLayers.map(l =>
        l.id === layerId ? { ...l, ...partial } : l
      ),
    },
  };
  _notify();
}

export function toggleLayerVisibility(id: string): void {
  const map = (window as any).__PALMVIEW_MAP;
  if (!map) return;
  const layer = _state.dataTab.loadedLayers.find(l => l.id === id);
  if (!layer) return;
  const newVisible = !layer.visible;
  try {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', newVisible ? 'visible' : 'none');
    }
    // Also toggle sub-layers (e.g. polygon outline)
    if (layer.subLayerIds) {
      for (const subId of layer.subLayerIds) {
        if (map.getLayer(subId)) {
          map.setLayoutProperty(subId, 'visibility', newVisible ? 'visible' : 'none');
        }
      }
    }
  } catch (e) {
    console.warn('[raster-state] toggleLayerVisibility failed:', e);
  }
  updateLoadedLayer(id, { visible: newVisible });
}

export function updateLayerOpacity(id: string, opacity: number): void {
  const map = (window as any).__PALMVIEW_MAP;
  if (!map) return;
  const layer = _state.dataTab.loadedLayers.find(l => l.id === id);
  if (!layer) return;
  const clamped = Math.max(0, Math.min(1, opacity));
  try {
    if (['stac', 'gee', 'local'].includes(layer.sourceType)) {
      if (map.getLayer(id)) map.setPaintProperty(id, 'raster-opacity', clamped);
    } else if (layer.sourceType === 'vector') {
      if (map.getLayer(id)) {
        const layerDef = map.getLayer(id);
        const type = layerDef?.type;
        if (type === 'fill') map.setPaintProperty(id, 'fill-opacity', clamped);
        else if (type === 'line') map.setPaintProperty(id, 'line-opacity', clamped);
        else if (type === 'circle') map.setPaintProperty(id, 'circle-opacity', clamped);
      }
      if (layer.subLayerIds) {
        for (const subId of layer.subLayerIds) {
          if (map.getLayer(subId)) {
            const subDef = map.getLayer(subId);
            if (subDef?.type === 'line') map.setPaintProperty(subId, 'line-opacity', clamped);
          }
        }
      }
    }
  } catch (e) {
    console.warn('[raster-state] updateLayerOpacity failed:', e);
  }
  updateLoadedLayer(id, { opacity: clamped });
}

export function removeLoadedLayer(layerId: string): void {
  _state = {
    ..._state,
    dataTab: {
      ..._state.dataTab,
      loadedLayers: _state.dataTab.loadedLayers.filter((l) => l.id !== layerId),
    },
  };
  _notify();
}

// ── Map Layer Re-add (after style change) ────────────

export function reAddAllLayers(): void {
  const map = (window as any).__PALMVIEW_MAP;
  if (!map) return;

  const layers = _state.dataTab.loadedLayers;
  if (layers.length === 0) return;

  console.log('[raster-state] Re-adding', layers.length, 'layers after style change');

  // Wait a tick for style to be fully loaded
  setTimeout(() => {
    const firstSymbolId = map.getStyle()?.layers?.find((l: any) => l.type === 'symbol')?.id;

    for (const layer of layers) {
      try {
        if (map.getSource(layer.sourceId)) continue; // already exists

        if (layer.sourceType === 'vector' && layer.geojsonData) {
          map.addSource(layer.sourceId, { type: 'geojson', data: layer.geojsonData });
          const geomType = layer.geomType || '';
          if (geomType.includes('Polygon')) {
            map.addLayer({ id: layer.id, type: 'fill', source: layer.sourceId, paint: { 'fill-color': '#1FBF6E', 'fill-opacity': layer.opacity ?? 0.4 } }, firstSymbolId);
            const outlineId = `${layer.id}-outline`;
            map.addLayer({ id: outlineId, type: 'line', source: layer.sourceId, paint: { 'line-color': '#1FBF6E', 'line-width': 1.5 } }, firstSymbolId);
          } else if (geomType.includes('Line')) {
            map.addLayer({ id: layer.id, type: 'line', source: layer.sourceId, paint: { 'line-color': '#1FBF6E', 'line-width': 2, 'line-opacity': layer.opacity ?? 0.85 } }, firstSymbolId);
          } else {
            map.addLayer({ id: layer.id, type: 'circle', source: layer.sourceId, paint: { 'circle-radius': 5, 'circle-color': '#1FBF6E', 'circle-opacity': layer.opacity ?? 0.85 } }, firstSymbolId);
          }
        } else if (layer.tileUrl) {
          map.addSource(layer.sourceId, { type: 'raster', tiles: [layer.tileUrl], tileSize: 256 });
          map.addLayer(
            { id: layer.id, type: 'raster', source: layer.sourceId, paint: { 'raster-opacity': layer.opacity ?? 0.85 } },
            firstSymbolId
          );
        } else if (layer.imageUrl && layer.bbox) {
          const [west, south, east, north] = layer.bbox;
          map.addSource(layer.sourceId, {
            type: 'image',
            url: layer.imageUrl,
            coordinates: [[west, north], [east, north], [east, south], [west, south]],
          });
          map.addLayer(
            { id: layer.id, type: 'raster', source: layer.sourceId, paint: { 'raster-opacity': layer.opacity ?? 0.85 } },
            firstSymbolId
          );
        } else {
          console.warn('[raster-state] Cannot re-add layer, no URL:', layer.id);
          continue;
        }
        console.log('[raster-state] Re-added layer:', layer.id);
      } catch (e) {
        console.warn('[raster-state] Failed to re-add layer:', layer.id, e);
      }
    }
  }, 100);
}

// Setup style.load listener (call once when map is available)
let _styleListenerAttached = false;
export function attachStyleListener(): void {
  if (_styleListenerAttached) return;
  const map = (window as any).__PALMVIEW_MAP;
  if (!map) return;
  _styleListenerAttached = true;
  map.on('style.load', () => {
    console.log('[raster-state] style.load detected, re-adding layers...');
    reAddAllLayers();
  });
  console.log('[raster-state] style.load listener attached');
}

// ── Raster Layer Actions ─────────────────────────────

let _counter = 0;

export function addRasterLayer(
  layer: Omit<RasterLayer, 'id' | 'addedAt' | 'visible' | 'opacity'>
): RasterLayer {
  const newLayer: RasterLayer = {
    ...layer,
    id: `raster-${++_counter}-${Date.now()}`,
    visible: true,
    opacity: 1,
    addedAt: Date.now(),
  };
  _state = {
    ..._state,
    rasterLayers: [..._state.rasterLayers, newLayer],
  };
  _notify();
  return newLayer;
}

export function removeRasterLayer(layerId: string): void {
  _state = {
    ..._state,
    rasterLayers: _state.rasterLayers.filter((l) => l.id !== layerId),
  };
  _notify();
}

export function toggleRasterLayer(layerId: string): void {
  _state = {
    ..._state,
    rasterLayers: _state.rasterLayers.map((l) =>
      l.id === layerId ? { ...l, visible: !l.visible } : l
    ),
  };
  _notify();
}

export function setRasterOpacity(layerId: string, opacity: number): void {
  _state = {
    ..._state,
    rasterLayers: _state.rasterLayers.map((l) =>
      l.id === layerId ? { ...l, opacity: Math.max(0, Math.min(1, opacity)) } : l
    ),
  };
  _notify();
}

export function getRasterLayerById(layerId: string): RasterLayer | undefined {
  return _state.rasterLayers.find((l) => l.id === layerId);
}

// ── AOI Actions ──────────────────────────────────────

export function setAoiMode(mode: AoiState['mode']): void {
  _state = {
    ..._state,
    aoiState: { ..._state.aoiState, mode },
  };
  _notify();
}

export function setAoiGeometry(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
): void {
  _state = {
    ..._state,
    aoiState: {
      mode: geometry ? 'drawn' : 'idle',
      geometry,
    },
  };
  _notify();
}

export function clearAoi(): void {
  _state = {
    ..._state,
    aoiState: { mode: 'idle', geometry: null },
  };
  _notify();
}
