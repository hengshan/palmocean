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
  /** Top-level thumbnail URL returned by backend _standardize_item */
  thumbnail?: string;
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

// ── Style Injection (elegant layer persistence) ──────
//
// Instead of fighting with style.load timing, we PATCH map.setStyle() directly.
// Every time Kepler.gl changes the basemap, it calls map.setStyle(styleObject).
// We intercept this call and INJECT our custom sources/layers into the new style
// BEFORE MapLibre applies it.  This means our layers are always part of the style —
// they survive ALL basemap switches without any event listening, timeouts or tile
// re-fetching (MapLibre reuses cached tiles because the source URL is unchanged).
//
// Works for ALL basemap types:  CARTO (HTTPS), Mapbox proprietary (mapbox://), etc.

/**
 * Inject our custom loaded layers into a MapLibre style object.
 * Returns a shallow-merged style with our sources and layers inserted
 * before the first symbol layer (so labels/icons render above our tiles).
 */
function injectOurLayersIntoStyle(style: any): any {
  const layers = _state.dataTab.loadedLayers;
  if (layers.length === 0) return style;
  // Only handle plain style objects — URL strings are handled by MapLibre directly
  if (!style || typeof style !== 'object') return style;

  const ourSources: Record<string, any> = {};
  const ourLayerSpecs: any[] = [];

  for (const layer of layers) {
    if (layer.tileUrl) {
      ourSources[layer.sourceId] = { type: 'raster', tiles: [layer.tileUrl], tileSize: 256 };
      ourLayerSpecs.push({
        id: layer.id,
        type: 'raster',
        source: layer.sourceId,
        paint: { 'raster-opacity': layer.visible !== false ? (layer.opacity ?? 0.85) : 0 },
      });
    } else if (layer.imageUrl && layer.bbox) {
      const [west, south, east, north] = layer.bbox;
      ourSources[layer.sourceId] = {
        type: 'image',
        url: layer.imageUrl,
        coordinates: [[west, north], [east, north], [east, south], [west, south]],
      };
      ourLayerSpecs.push({
        id: layer.id,
        type: 'raster',
        source: layer.sourceId,
        paint: { 'raster-opacity': layer.visible !== false ? (layer.opacity ?? 0.85) : 0 },
      });
    } else if (layer.geojsonData) {
      ourSources[layer.sourceId] = { type: 'geojson', data: layer.geojsonData };
      const geomType = layer.geomType || '';
      if (geomType.includes('Polygon')) {
        ourLayerSpecs.push(
          { id: layer.id, type: 'fill', source: layer.sourceId,
            paint: { 'fill-color': '#1FBF6E', 'fill-opacity': layer.opacity ?? 0.4 } },
          { id: (layer.subLayerIds?.[0] ?? `${layer.id}-outline`), type: 'line', source: layer.sourceId,
            paint: { 'line-color': '#1FBF6E', 'line-width': 1.5 } }
        );
      } else if (geomType.includes('Line')) {
        ourLayerSpecs.push({ id: layer.id, type: 'line', source: layer.sourceId,
          paint: { 'line-color': '#1FBF6E', 'line-width': 2, 'line-opacity': layer.opacity ?? 0.85 } });
      } else {
        ourLayerSpecs.push({ id: layer.id, type: 'circle', source: layer.sourceId,
          paint: { 'circle-radius': 5, 'circle-color': '#1FBF6E', 'circle-opacity': layer.opacity ?? 0.85 } });
      }
    }
  }

  if (ourLayerSpecs.length === 0) return style;

  // Remove any stale versions of our layers from the style (guard against duplicates on re-injection)
  const ourLayerIds = new Set(ourLayerSpecs.map((l: any) => l.id));
  const existingLayers: any[] = (style.layers || []).filter((l: any) => !ourLayerIds.has(l.id));

  // Insert our layers before the first symbol layer so labels render above our tiles
  const firstSymbolIdx = existingLayers.findIndex((l: any) => l.type === 'symbol');
  const insertAt = firstSymbolIdx >= 0 ? firstSymbolIdx : existingLayers.length;

  return {
    ...style,
    sources: { ...(style.sources || {}), ...ourSources },
    layers: [
      ...existingLayers.slice(0, insertAt),
      ...ourLayerSpecs,
      ...existingLayers.slice(insertAt),
    ],
  };
}

/** Patch map.setStyle() once per map instance to inject our layers on every basemap switch. */
let _setStylePatched = false;
function patchMapSetStyle(map: any): void {
  if (_setStylePatched) return;
  _setStylePatched = true;
  const origSetStyle = map.setStyle.bind(map);
  map.setStyle = function(style: any, options?: any) {
    // react-map-gl uses styleDiffing:true by default.
    // MapLibre diff compares new style against the last-applied style JSON (NOT
    // current rendered state). If we inject our source into the new style AND it
    // already exists on the map from an imperative addSource() call, diff would
    // try to add it again → "Source already exists" exception → injection fails.
    //
    // Fix: remove our layers/sources BEFORE the style swap so diff sees them as
    // new additions and re-adds them cleanly from the injected style.
    const layers = _state.dataTab.loadedLayers;
    for (const layer of layers) {
      if (layer.subLayerIds) {
        for (const subId of layer.subLayerIds) {
          try { if (map.getLayer(subId)) map.removeLayer(subId); } catch (_) {}
        }
      }
      try { if (map.getLayer(layer.id)) map.removeLayer(layer.id); } catch (_) {}
      try { if (map.getSource(layer.sourceId)) map.removeSource(layer.sourceId); } catch (_) {}
    }
    return origSetStyle(injectOurLayersIntoStyle(style), options);
  };
  console.log('[raster-state] map.setStyle patched — layers injected on every basemap switch');
}

/**
 * Attach the setStyle patch (and a style.load fallback) to the current map instance.
 * Safe to call multiple times — only patches once.
 */
let _styleListenerMap: any = null;
export function attachStyleListener(): void {
  const map = (window as any).__PALMVIEW_MAP;
  if (!map) return;
  if (_styleListenerMap === map) return; // already attached to this instance
  _styleListenerMap = map;
  // Primary: patch setStyle so our layers are injected into every new style
  patchMapSetStyle(map);
  // Fallback: on the very first style.load (initial page load), re-add any layers
  // that were loaded before attachStyleListener was called
  map.on('style.load', () => {
    reAddAllLayers();
  });
  console.log('[raster-state] style listener attached');
}

/**
 * Imperatively re-add all loaded layers to the current map.
 * Used as a fallback for initial page load / edge cases.
 * With patchMapSetStyle in place, this should rarely be needed.
 */
export function reAddAllLayers(): void {
  const map = (window as any).__PALMVIEW_MAP;
  if (!map || !map.isStyleLoaded()) return;
  const layers = _state.dataTab.loadedLayers;
  if (layers.length === 0) return;
  const firstSymbolId = map.getStyle()?.layers?.find((l: any) => l.type === 'symbol')?.id;
  for (const layer of layers) {
    try {
      if (map.getLayer(layer.id)) continue; // already present
      if (map.getSource(layer.sourceId)) {
        try { map.removeSource(layer.sourceId); } catch (_) {}
      }
      if (layer.sourceType === 'vector' && layer.geojsonData) {
        map.addSource(layer.sourceId, { type: 'geojson', data: layer.geojsonData });
        const geomType = layer.geomType || '';
        if (geomType.includes('Polygon')) {
          map.addLayer({ id: layer.id, type: 'fill', source: layer.sourceId, paint: { 'fill-color': '#1FBF6E', 'fill-opacity': layer.opacity ?? 0.4 } }, firstSymbolId);
          const outlineId = layer.subLayerIds?.[0] ?? `${layer.id}-outline`;
          map.addLayer({ id: outlineId, type: 'line', source: layer.sourceId, paint: { 'line-color': '#1FBF6E', 'line-width': 1.5 } }, firstSymbolId);
        } else if (geomType.includes('Line')) {
          map.addLayer({ id: layer.id, type: 'line', source: layer.sourceId, paint: { 'line-color': '#1FBF6E', 'line-width': 2, 'line-opacity': layer.opacity ?? 0.85 } }, firstSymbolId);
        } else {
          map.addLayer({ id: layer.id, type: 'circle', source: layer.sourceId, paint: { 'circle-radius': 5, 'circle-color': '#1FBF6E', 'circle-opacity': layer.opacity ?? 0.85 } }, firstSymbolId);
        }
      } else if (layer.tileUrl) {
        map.addSource(layer.sourceId, { type: 'raster', tiles: [layer.tileUrl], tileSize: 256 });
        map.addLayer({ id: layer.id, type: 'raster', source: layer.sourceId, paint: { 'raster-opacity': layer.opacity ?? 0.85 } }, firstSymbolId);
      } else if (layer.imageUrl && layer.bbox) {
        const [west, south, east, north] = layer.bbox;
        map.addSource(layer.sourceId, { type: 'image', url: layer.imageUrl, coordinates: [[west, north], [east, north], [east, south], [west, south]] });
        map.addLayer({ id: layer.id, type: 'raster', source: layer.sourceId, paint: { 'raster-opacity': layer.opacity ?? 0.85 } }, firstSymbolId);
      }
    } catch (e) {
      console.warn('[raster-state] reAddAllLayers fallback failed for', layer.id, e);
    }
  }
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
