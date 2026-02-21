/**
 * AOI Toolbar — Geoman integration for PalmView
 * 
 * Full Geoman toolkit: draw, edit, snap, rotate, cut, drag, measure.
 * Toggle button in Kepler toolbar area. Geoman native toolbar appears on toggle.
 * Captures all drawn geometries into a FeatureCollection for GeoAI consumption.
 * 
 * Author: Lyra · 2026-02-21
 */

import React, {useEffect, useState, useCallback, useRef} from 'react';
import styled from 'styled-components';
import {setAoiGeometry, setAoiMode, clearAoi, getMapState, subscribe} from '../raster-state';
import type {AoiState} from '../raster-state';

// ── Styles ───────────────────────────────────────────

const ToggleButton = styled.button<{$active?: boolean}>`
  width: 29px;
  height: 29px;
  border: none;
  border-radius: 4px;
  background: ${(p) => (p.$active ? '#1FBF6E' : 'rgba(36, 39, 48, 0.9)')};
  color: ${(p) => (p.$active ? '#fff' : '#a0a7b4')};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: background 0.2s, color 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);

  &:hover {
    background: ${(p) => (p.$active ? '#17a85e' : 'rgba(255,255,255,0.12)')};
    color: #fff;
  }
`;

const AoiToggleContainer = styled.div`
  position: absolute;
  top: 130px;
  right: 12px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
`;

const StatusDot = styled.span<{$hasAoi: boolean}>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(p) => (p.$hasAoi ? '#4ecdc4' : 'transparent')};
  border: 1px solid ${(p) => (p.$hasAoi ? '#4ecdc4' : 'transparent')};
  transition: background 0.2s;
`;

// AOI SVG icon (crosshair + rectangle)
const AoiIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="10" height="10" rx="1" />
    <line x1="8" y1="0" x2="8" y2="4" />
    <line x1="8" y1="12" x2="8" y2="16" />
    <line x1="0" y1="8" x2="4" y2="8" />
    <line x1="12" y1="8" x2="16" y2="8" />
  </svg>
);

// ── Dark theme CSS override for Geoman ───────────────

const GEOMAN_DARK_CSS = `
/* Geoman dark theme for PalmView/Kepler */
.geoman-controls {
  --gm-primary: #1FBF6E;
  --gm-bg: rgba(36, 39, 48, 0.95);
  --gm-text: #a0a7b4;
  --gm-hover: rgba(255, 255, 255, 0.12);
  --gm-active: #1FBF6E;
  --gm-border: rgba(255, 255, 255, 0.1);
}
.geoman-controls .maplibregl-ctrl-group {
  background: var(--gm-bg) !important;
  border: 1px solid var(--gm-border) !important;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
  border-radius: 4px !important;
}
.geoman-controls button {
  background: transparent !important;
  border: none !important;
  width: 29px !important;
  height: 29px !important;
}
.geoman-controls button:hover {
  background: var(--gm-hover) !important;
}
.geoman-controls button.active,
.geoman-controls button[class*="active"] {
  background: var(--gm-active) !important;
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
/* Geoman tooltip dark */
.geoman-tooltip,
[class*="geoman"][class*="tooltip"] {
  background: rgba(36, 39, 48, 0.95) !important;
  color: #a0a7b4 !important;
  border: 1px solid rgba(255,255,255,0.1) !important;
  border-radius: 4px !important;
  font-size: 11px !important;
}
/* Draw shape styling */
.geoman-draw-shape {
  stroke: #1FBF6E !important;
  fill: rgba(31, 191, 110, 0.15) !important;
}
`;

// ── Helpers ──────────────────────────────────────────

function injectDarkThemeCSS() {
  if (document.getElementById('geoman-dark-theme')) return;
  const style = document.createElement('style');
  style.id = 'geoman-dark-theme';
  style.textContent = GEOMAN_DARK_CSS;
  document.head.appendChild(style);
}

/** Extract GeoJSON geometry from a Geoman event */
function extractGeometry(e: any): GeoJSON.Geometry | null {
  // Geoman free emits different shapes
  if (e.feature?.geometry) return e.feature.geometry;
  if (e.shape?.geometry) return e.shape.geometry;
  if (e.layer?.toGeoJSON) return e.layer.toGeoJSON().geometry;
  return null;
}

/** Merge multiple geometries into a single Polygon or MultiPolygon */
function mergeGeometries(geometries: GeoJSON.Geometry[]): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (geometries.length === 0) return null;
  if (geometries.length === 1) {
    const g = geometries[0];
    if (g.type === 'Polygon') return g;
    if (g.type === 'MultiPolygon') return g;
    // For other types (circle → polygon approximation), wrap bbox
    return null;
  }
  // Multiple → MultiPolygon
  const polygons: GeoJSON.Position[][][] = [];
  for (const g of geometries) {
    if (g.type === 'Polygon') {
      polygons.push(g.coordinates);
    } else if (g.type === 'MultiPolygon') {
      polygons.push(...g.coordinates);
    }
  }
  if (polygons.length === 0) return null;
  if (polygons.length === 1) return {type: 'Polygon', coordinates: polygons[0]};
  return {type: 'MultiPolygon', coordinates: polygons};
}

// ── Component ────────────────────────────────────────

interface AoiToolbarProps {
  map?: any;
}

const AoiToolbar: React.FC<AoiToolbarProps> = ({map: mapProp}) => {
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [aoiState, setLocalAoiState] = useState<AoiState>(getMapState().aoiState);
  const geomanRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const drawnFeaturesRef = useRef<Map<string, GeoJSON.Geometry>>(new Map());

  // Subscribe to AOI state changes
  useEffect(() => {
    return subscribe((s) => setLocalAoiState(s.aoiState));
  }, []);

  // Poll for map instance
  useEffect(() => {
    const check = () => {
      const m = mapProp || (window as any).__PALMVIEW_MAP;
      if (m && !mapRef.current) {
        mapRef.current = m;
        initGeoman(m);
      }
    };
    check();
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, [mapProp]);

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

  // Initialize Geoman
  const initGeoman = useCallback(async (map: any) => {
    if (geomanRef.current) return;

    try {
      const {Geoman} = await import('@geoman-io/maplibre-geoman-free');
      await import('@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.css');
      injectDarkThemeCSS();

      const gm = new Geoman(map, {
        controls: {
          helper: true,
        },
      });
      geomanRef.current = gm;

      // Wait for Geoman ready — use both event and polling
      const onLoaded = () => {
        console.log('[AOI] Geoman fully loaded');
        // Hide toolbar initially — user toggles via AOI icon
        hideGeomanToolbar();
      };

      map.on('gm:loaded', onLoaded);

      // Fallback: poll for Geoman DOM (gm:loaded sometimes doesn't fire)
      let pollCount = 0;
      const pollInterval = setInterval(() => {
        pollCount++;
        const el = getGeomanToolbarEl(map);
        if (el) {
          clearInterval(pollInterval);
          console.log('[AOI] Geoman toolbar found via polling (attempt', pollCount, ')');
          hideGeomanToolbar();
        }
        if (pollCount > 30) clearInterval(pollInterval); // Give up after 15s
      }, 500);

      // ── Event listeners ────────────────────────────

      // Shape created
      map.on('gm:create', (e: any) => {
        const geometry = extractGeometry(e);
        if (geometry) {
          const id = `aoi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          drawnFeaturesRef.current.set(id, geometry);
          syncAoiState();
          console.log('[AOI] Created:', geometry.type, '| Total shapes:', drawnFeaturesRef.current.size);
        }
      });

      // Shape edited
      map.on('gm:edit', (e: any) => {
        const geometry = extractGeometry(e);
        if (geometry) {
          // Update the most recently edited — Geoman doesn't give us a stable ID
          // For now, replace all with latest edit result
          syncAoiState();
          console.log('[AOI] Edited:', geometry.type);
        }
      });

      // Shape removed
      map.on('gm:remove', (e: any) => {
        // Try to match by geometry, otherwise clear last
        const geometry = extractGeometry(e);
        if (geometry) {
          const geoStr = JSON.stringify(geometry);
          for (const [id, g] of drawnFeaturesRef.current) {
            if (JSON.stringify(g) === geoStr) {
              drawnFeaturesRef.current.delete(id);
              break;
            }
          }
        } else {
          // Can't match — if only one, clear it
          if (drawnFeaturesRef.current.size === 1) {
            drawnFeaturesRef.current.clear();
          }
        }
        syncAoiState();
        console.log('[AOI] Removed | Remaining shapes:', drawnFeaturesRef.current.size);
      });

      // Global clear (delete mode clears all)
      map.on('gm:globaleditmodetoggled', () => {
        setAoiMode('editing');
      });

      console.log('[AOI] Geoman initialized');
    } catch (err) {
      console.error('[AOI] Failed to initialize Geoman:', err);
    }
  }, [syncAoiState]);

  // ── Toolbar visibility ─────────────────────────────

  const getGeomanToolbarEl = useCallback((m?: any): HTMLElement | null => {
    const container = (m || mapRef.current)?.getContainer?.();
    if (!container) return null;
    return (
      container.querySelector('.geoman-controls') ||
      container.querySelector('.maplibregl-ctrl-top-left .maplibregl-ctrl-group')
    ) as HTMLElement;
  }, []);

  const hideGeomanToolbar = useCallback(() => {
    const el = getGeomanToolbarEl();
    if (el) el.style.display = 'none';
  }, [getGeomanToolbarEl]);

  const showGeomanToolbar = useCallback(() => {
    const el = getGeomanToolbarEl();
    if (el) {
      el.style.display = 'block';
      // Position next to sidebar
      el.style.position = 'fixed';
      el.style.left = '320px';
      el.style.top = '12px';
      el.style.zIndex = '5';
    }
  }, [getGeomanToolbarEl]);

  const toggleToolbar = useCallback(() => {
    const next = !toolbarVisible;
    setToolbarVisible(next);
    if (next) {
      showGeomanToolbar();
    } else {
      hideGeomanToolbar();
      // Deactivate any active draw/edit modes
      try {
        const gm = geomanRef.current;
        if (gm) {
          gm.disableDraw();
          gm.disableGlobalEditMode?.();
          gm.disableGlobalDragMode?.();
          gm.disableGlobalRemovalMode?.();
          gm.disableGlobalCutMode?.();
          gm.disableGlobalRotateMode?.();
        }
      } catch (_) {}
      if (drawnFeaturesRef.current.size === 0) {
        setAoiMode('idle');
      } else {
        setAoiMode('drawn');
      }
    }
  }, [toolbarVisible, showGeomanToolbar, hideGeomanToolbar]);

  // Public method: clear all AOI shapes from map
  const clearAllAoi = useCallback(() => {
    drawnFeaturesRef.current.clear();
    clearAoi();
    // Also remove drawn layers from map
    try {
      const gm = geomanRef.current;
      if (gm) {
        // Geoman: remove all drawn features
        const features = gm.getFeatures?.() || [];
        features.forEach((f: any) => {
          try { gm.removeFeature?.(f); } catch (_) {}
        });
      }
    } catch (_) {}
  }, []);

  // Expose clearAllAoi on window for GeoAI panel access
  useEffect(() => {
    (window as any).__PALMVIEW_AOI = {
      clear: clearAllAoi,
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
  }, [clearAllAoi]);

  return (
    <AoiToggleContainer>
      <StatusDot $hasAoi={!!aoiState.geometry} />
      <ToggleButton
        $active={toolbarVisible}
        onClick={toggleToolbar}
        title={toolbarVisible ? 'Hide AOI Drawing Tools' : 'Show AOI Drawing Tools'}
      >
        <AoiIcon />
      </ToggleButton>
    </AoiToggleContainer>
  );
};

export default AoiToolbar;
