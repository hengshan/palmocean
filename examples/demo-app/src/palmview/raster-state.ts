/**
 * PalmView Raster Layer State Management
 * Manages raster layers loaded from STAC/GEE onto the Mapbox map.
 * Author: IRIS · 2026-02-21
 */

// ── Types ────────────────────────────────────────────

export type RasterSourceType = 'stac' | 'gee' | 'local';

export interface RasterLayer {
  id: string;
  name: string;
  sourceType: RasterSourceType;
  /** Original URL (COG, tile endpoint, etc.) */
  sourceUrl: string;
  /** Bounding box [west, south, east, north] */
  bbox: [number, number, number, number];
  visible: boolean;
  opacity: number;
  /** ISO-8601 timestamp of the source imagery */
  acquisitionDate?: string;
  /** STAC collection / GEE asset id */
  collectionId?: string;
  /** Thumbnail URL for the panel list */
  thumbnailUrl?: string;
  /** Metadata from search result */
  metadata?: Record<string, unknown>;
  /** Timestamp when added to map */
  addedAt: number;
}

export interface AoiState {
  /** Current AOI mode */
  mode: 'idle' | 'drawing' | 'drawn' | 'editing';
  /** GeoJSON geometry of the AOI, null when idle */
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
}

export interface PalmviewMapState {
  rasterLayers: RasterLayer[];
  aoiState: AoiState;
}

// ── Initial State ────────────────────────────────────

export function createInitialMapState(): PalmviewMapState {
  return {
    rasterLayers: [],
    aoiState: {
      mode: 'idle',
      geometry: null,
    },
  };
}

// ── Singleton store (simple, no Redux dependency) ────

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
