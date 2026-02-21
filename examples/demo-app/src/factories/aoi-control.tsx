/**
 * AOI Control — Kepler MapControl action component for Geoman integration.
 * 
 * Follows the same pattern as AiAssistantControl / MapDrawPanel:
 * - Registers as an actionComponent in MapControl grid
 * - Uses MapControlButton for consistent hover/click UX  
 * - Geoman toolbar shown as a sub-panel (like MapDrawPanel's MapControlToolbar)
 *
 * Author: Lyra · 2026-02-21
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {MapControlButton} from '@kepler.gl/components';
import {setAoiGeometry, setAoiMode, clearAoi, getMapState, subscribe} from '../palmview/raster-state';
import type {AoiState} from '../palmview/raster-state';

// ── Dark theme CSS for Geoman ────────────────────────

const GEOMAN_DARK_CSS = `
.geoman-controls {
  z-index: 999 !important;
  pointer-events: all !important;
}
.geoman-controls .maplibregl-ctrl-group {
  background: rgba(36, 39, 48, 0.95) !important;
  border: 1px solid rgba(255,255,255,0.1) !important;
  box-shadow: 0 6px 12px 0 rgba(0,0,0,0.16) !important;
  border-radius: 4px !important;
  pointer-events: all !important;
}
.geoman-controls button {
  background: transparent !important;
  border: none !important;
  width: 29px !important;
  height: 29px !important;
  pointer-events: all !important;
  cursor: pointer !important;
  position: relative !important;
}
.geoman-controls button:hover {
  background: rgba(255,255,255,0.12) !important;
}
.geoman-controls button.active,
.geoman-controls button[class*="active"] {
  background: #1FBF6E !important;
}
.geoman-controls button svg,
.geoman-controls button img {
  filter: invert(0.7) !important;
}
.geoman-controls button.active svg,
.geoman-controls button.active img,
.geoman-controls button[class*="active"] svg,
.geoman-controls button[class*="active"] img {
  filter: invert(1) !important;
}
.geoman-tooltip,
[class*="geoman"][class*="tooltip"] {
  background: rgba(36, 39, 48, 0.95) !important;
  color: #a0a7b4 !important;
  border: 1px solid rgba(255,255,255,0.1) !important;
  border-radius: 4px !important;
  font-size: 11px !important;
}
`;

function injectDarkThemeCSS() {
  if (document.getElementById('geoman-dark-theme')) return;
  const style = document.createElement('style');
  style.id = 'geoman-dark-theme';
  style.textContent = GEOMAN_DARK_CSS;
  document.head.appendChild(style);
}

// ── AOI Icon (crosshair + rectangle) ─────────────────

const AoiIcon = ({height = '18px'}: {height?: string}) => (
  <svg 
    width={height} 
    height={height} 
    viewBox="0 0 16 16" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="1.5"
  >
    <rect x="3" y="3" width="10" height="10" rx="1" />
    <line x1="8" y1="0" x2="8" y2="4" />
    <line x1="8" y1="12" x2="8" y2="16" />
    <line x1="0" y1="8" x2="4" y2="8" />
    <line x1="12" y1="8" x2="16" y2="8" />
  </svg>
);

// ── Geometry helpers ─────────────────────────────────

function extractGeometry(e: any): GeoJSON.Geometry | null {
  if (e.feature?.geometry) return e.feature.geometry;
  if (e.shape?.geometry) return e.shape.geometry;
  if (e.layer?.toGeoJSON) return e.layer.toGeoJSON().geometry;
  return null;
}

function mergeGeometries(geometries: GeoJSON.Geometry[]): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (geometries.length === 0) return null;
  if (geometries.length === 1) {
    const g = geometries[0];
    if (g.type === 'Polygon') return g;
    if (g.type === 'MultiPolygon') return g;
    return null;
  }
  const polygons: GeoJSON.Position[][][] = [];
  for (const g of geometries) {
    if (g.type === 'Polygon') polygons.push(g.coordinates);
    else if (g.type === 'MultiPolygon') polygons.push(...g.coordinates);
  }
  if (polygons.length === 0) return null;
  if (polygons.length === 1) return {type: 'Polygon', coordinates: polygons[0]};
  return {type: 'MultiPolygon', coordinates: polygons};
}

// ── Status Dot ───────────────────────────────────────

const StatusDot = ({hasAoi}: {hasAoi: boolean}) => (
  <div style={{
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: hasAoi ? '#4ecdc4' : 'transparent',
    border: hasAoi ? '1px solid #4ecdc4' : 'none',
    zIndex: 1,
    transition: 'background 0.2s',
  }} />
);

// ── Component ────────────────────────────────────────

interface AoiControlProps {
  mapControls?: any;
  onToggleMapControl?: (control: string) => void;
  [key: string]: any;
}

const AoiControl: React.FC<AoiControlProps> = () => {
  const [active, setActive] = useState(false);
  const [aoiState, setLocalAoiState] = useState<AoiState>(getMapState().aoiState);
  const geomanRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const drawnFeaturesRef = useRef<Map<string, GeoJSON.Geometry>>(new Map());

  // Subscribe to AOI state
  useEffect(() => {
    return subscribe((s) => setLocalAoiState(s.aoiState));
  }, []);

  // Sync drawn features → AOI state
  const syncAoiState = useCallback(() => {
    const geometries = Array.from(drawnFeaturesRef.current.values());
    const merged = mergeGeometries(geometries);
    if (merged) {
      setAoiGeometry(merged);
      setAoiMode('drawn');
    } else {
      clearAoi();
    }
  }, []);

  // Initialize Geoman when map is available
  const initGeoman = useCallback(async (map: any) => {
    if (geomanRef.current) return;
    try {
      const {Geoman} = await import('@geoman-io/maplibre-geoman-free');
      await import('@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.css');
      injectDarkThemeCSS();

      const gm = new Geoman(map, {controls: {helper: true}});
      geomanRef.current = gm;

      // Hide toolbar initially
      const hideToolbar = () => {
        const container = map.getContainer?.();
        if (!container) return;
        const el = container.querySelector('.geoman-controls') ||
                   container.querySelector('.maplibregl-ctrl-top-left');
        if (el) (el as HTMLElement).style.display = 'none';
      };

      map.on('gm:loaded', () => {
        console.log('[AOI] Geoman loaded');
        hideToolbar();
      });

      // Fallback polling
      let polls = 0;
      const poller = setInterval(() => {
        polls++;
        const container = map.getContainer?.();
        const el = container?.querySelector('.geoman-controls');
        if (el) {
          clearInterval(poller);
          (el as HTMLElement).style.display = 'none';
          console.log('[AOI] Geoman toolbar found via polling');
        }
        if (polls > 30) clearInterval(poller);
      }, 500);

      // Events
      map.on('gm:create', (e: any) => {
        const geometry = extractGeometry(e);
        if (geometry) {
          const id = `aoi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          drawnFeaturesRef.current.set(id, geometry);
          syncAoiState();
          console.log('[AOI] Created:', geometry.type, '| Total:', drawnFeaturesRef.current.size);
        }
      });

      map.on('gm:edit', () => syncAoiState());

      map.on('gm:remove', (e: any) => {
        const geometry = extractGeometry(e);
        if (geometry) {
          const geoStr = JSON.stringify(geometry);
          for (const [id, g] of drawnFeaturesRef.current) {
            if (JSON.stringify(g) === geoStr) {
              drawnFeaturesRef.current.delete(id);
              break;
            }
          }
        } else if (drawnFeaturesRef.current.size === 1) {
          drawnFeaturesRef.current.clear();
        }
        syncAoiState();
        console.log('[AOI] Removed | Remaining:', drawnFeaturesRef.current.size);
      });

      console.log('[AOI] Geoman initialized');
    } catch (err) {
      console.error('[AOI] Geoman init failed:', err);
    }
  }, [syncAoiState]);

  // Poll for map
  useEffect(() => {
    const check = () => {
      const m = (window as any).__PALMVIEW_MAP;
      if (m && !mapRef.current) {
        mapRef.current = m;
        initGeoman(m);
      }
    };
    check();
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, [initGeoman]);

  // Show/hide Geoman toolbar
  const showGeomanToolbar = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer?.();
    if (!container) return;
    const el = container.querySelector('.geoman-controls') as HTMLElement;
    if (el) {
      el.style.display = 'block';
      el.style.position = 'fixed';
      el.style.left = '320px';
      el.style.top = '12px';
      el.style.zIndex = '999';
      el.style.pointerEvents = 'all';
      // Force clickable buttons
      el.querySelectorAll('button').forEach((btn: HTMLElement) => {
        btn.style.pointerEvents = 'all';
        btn.style.cursor = 'pointer';
      });
    }
  }, []);

  const hideGeomanToolbar = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer?.();
    if (!container) return;
    const el = container.querySelector('.geoman-controls') as HTMLElement;
    if (el) el.style.display = 'none';
  }, []);

  const disableAllModes = useCallback(() => {
    try {
      const gm = geomanRef.current;
      if (!gm) return;
      gm.disableDraw?.();
      gm.disableGlobalEditMode?.();
      gm.disableGlobalDragMode?.();
      gm.disableGlobalRemovalMode?.();
      gm.disableGlobalCutMode?.();
      gm.disableGlobalRotateMode?.();
    } catch (_) {}
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const next = !active;
    setActive(next);
    if (next) {
      showGeomanToolbar();
    } else {
      hideGeomanToolbar();
      disableAllModes();
      if (drawnFeaturesRef.current.size === 0) {
        setAoiMode('idle');
      } else {
        setAoiMode('drawn');
      }
    }
  }, [active, showGeomanToolbar, hideGeomanToolbar, disableAllModes]);

  // Expose API on window
  useEffect(() => {
    (window as any).__PALMVIEW_AOI = {
      clear: () => {
        drawnFeaturesRef.current.clear();
        clearAoi();
        try {
          const gm = geomanRef.current;
          const features = gm?.getFeatures?.() || [];
          features.forEach((f: any) => { try { gm.removeFeature?.(f); } catch (_) {} });
        } catch (_) {}
      },
      getGeometries: () => Array.from(drawnFeaturesRef.current.values()),
      getFeatureCollection: (): GeoJSON.FeatureCollection => ({
        type: 'FeatureCollection',
        features: Array.from(drawnFeaturesRef.current.values()).map((g, i) => ({
          type: 'Feature' as const,
          properties: {id: i, source: 'aoi-draw'},
          geometry: g,
        })),
      }),
    };
    return () => { delete (window as any).__PALMVIEW_AOI; };
  }, []);

  return (
    <div style={{position: 'relative'}}>
      <StatusDot hasAoi={!!aoiState.geometry} />
      <MapControlButton
        className="map-control-button toggle-aoi"
        onClick={handleClick}
        active={active}
      >
        <AoiIcon height="18px" />
      </MapControlButton>
    </div>
  );
};

AoiControl.displayName = 'AoiControl';

export default React.memo(AoiControl);
