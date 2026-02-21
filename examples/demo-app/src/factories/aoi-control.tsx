/**
 * AOI Control — Kepler MapControl action component for Geoman integration.
 *
 * Follows MapDrawPanel pattern exactly:
 * - MapControlButton as the main toggle
 * - VerticalToolbar with ToolbarItems as the sub-menu
 * - Geoman API called from ToolbarItem onClick handlers
 * - Active/hover states match Kepler's native draw tools
 *
 * Author: Lyra · 2026-02-21
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import styled from 'styled-components';
import classnames from 'classnames';
import {MapControlButton} from '@kepler.gl/components';
import {setAoiGeometry, setAoiMode, clearAoi, getMapState, subscribe} from '../palmview/raster-state';
import type {AoiState} from '../palmview/raster-state';

// ── Styled Components (matching Kepler patterns) ─────

const StyledToolbar = styled.div<{$show?: boolean}>`
  display: flex;
  flex-direction: column;
  background-color: ${props => props.theme.dropdownListBgd};
  box-shadow: ${props => props.theme.dropdownListShadow};
  font-size: 12px;
  transition: ${props => props.theme.transitionSlow};
  margin-top: ${props => (props.$show ? '6px' : '20px')};
  opacity: ${props => (props.$show ? 1 : 0)};
  pointer-events: ${props => (props.$show ? 'all' : 'none')};
  z-index: 1000;
  position: absolute;
  right: 32px;
  transform: translateX(calc(-50% + 45px));

  .toolbar-item {
    width: 120px;
    padding: 13px 16px;
    flex-direction: row;
    justify-content: flex-start;

    .toolbar-item__svg-container {
      width: 16px;
      height: 16px;
      margin-right: 10px;
    }

    .toolbar-item__title {
      margin-left: auto;
      margin-right: auto;
    }
  }
`;

const StyledToolbarItem = styled.div<{$active?: boolean}>`
  color: ${props =>
    props.$active ? props.theme.toolbarItemIconHover : props.theme.panelHeaderIcon};
  padding: 13px 16px;
  align-items: center;
  display: flex;
  flex-direction: row;
  width: 140px;
  justify-content: flex-start;
  border: 1px solid ${props => (props.$active ? props.theme.toolbarItemBorderHover : 'transparent')};
  border-radius: ${props => props.theme.toolbarItemBorderRaddius || '2px'};
  background-color: ${props =>
    props.$active ? props.theme.toolbarItemBgdHover : props.theme.dropdownListBgd};
  cursor: pointer;
  gap: 8px;

  .toolbar-item__title {
    white-space: nowrap;
    color: ${props => props.theme.textColorHl};
    font-size: 11px;
  }

  &:hover {
    background-color: ${props => props.theme.toolbarItemBgdHover};
    border-color: ${props => props.theme.toolbarItemBorderHover};
    svg {
      color: ${props => props.theme.toolbarItemIconHover};
    }
  }
`;

// ── Icons ────────────────────────────────────────────

const AoiIcon = ({height = '18px'}: {height?: string}) => (
  <svg width={height} height={height} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="10" height="10" rx="1" />
    <line x1="8" y1="0" x2="8" y2="4" />
    <line x1="8" y1="12" x2="8" y2="16" />
    <line x1="0" y1="8" x2="4" y2="8" />
    <line x1="12" y1="8" x2="16" y2="8" />
  </svg>
);

const RectangleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="3" width="12" height="10" rx="1" />
  </svg>
);

const PolygonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polygon points="8,1 14,5 12,14 4,14 2,5" />
  </svg>
);

const CircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="6" />
  </svg>
);

const EditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
  </svg>
);

const DragIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M8 1v14M1 8h14M8 1l-2 2M8 1l2 2M8 15l-2-2M8 15l2-2M1 8l2-2M1 8l2 2M15 8l-2-2M15 8l-2 2" />
  </svg>
);

const DeleteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" />
  </svg>
);

const CutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="5" cy="12" r="2" />
    <circle cx="11" cy="12" r="2" />
    <path d="M5 10L11 2M11 10L5 2" />
  </svg>
);

const RotateIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M13 8A5 5 0 1 1 8 3" />
    <path d="M8 1l2 2-2 2" />
  </svg>
);

// No CSS hack needed — Geoman native UI disabled via controlsUiEnabledByDefault: false

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

// ── AOI draw modes ───────────────────────────────────

type AoiDrawMode = 'rectangle' | 'polygon' | 'circle' | 'edit' | 'drag' | 'delete' | 'cut' | 'rotate' | null;

const AOI_TOOLS: {mode: AoiDrawMode; label: string; Icon: React.FC}[] = [
  {mode: 'rectangle', label: 'Rectangle', Icon: RectangleIcon},
  {mode: 'polygon',   label: 'Polygon',   Icon: PolygonIcon},
  {mode: 'circle',    label: 'Circle',    Icon: CircleIcon},
  {mode: 'edit',      label: 'Edit',      Icon: EditIcon},
  {mode: 'drag',      label: 'Drag',      Icon: DragIcon},
  {mode: 'rotate',    label: 'Rotate',    Icon: RotateIcon},
  {mode: 'cut',       label: 'Cut',       Icon: CutIcon},
  {mode: 'delete',    label: 'Delete',    Icon: DeleteIcon},
];

// ── Status Dot ───────────────────────────────────────

const StatusDot = styled.div<{$hasAoi: boolean}>`
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${p => (p.$hasAoi ? '#4ecdc4' : 'transparent')};
  border: ${p => (p.$hasAoi ? '1px solid #4ecdc4' : 'none')};
  z-index: 1;
  transition: background 0.2s;
`;

// ── Component ────────────────────────────────────────

interface AoiControlProps {
  [key: string]: any;
}

const AoiControl: React.FC<AoiControlProps> = () => {
  const [panelActive, setPanelActive] = useState(false);
  const [activeMode, setActiveMode] = useState<AoiDrawMode>(null);
  const [aoiState, setLocalAoiState] = useState<AoiState>(getMapState().aoiState);
  const geomanRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const drawnFeaturesRef = useRef<Map<string, GeoJSON.Geometry>>(new Map());

  // Subscribe to AOI state
  useEffect(() => subscribe((s) => setLocalAoiState(s.aoiState)), []);

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

      // Initialize Geoman with NO native toolbar UI — we drive it via Kepler ToolbarItems
      const gm = new Geoman(map, {
        settings: {
          controlsUiEnabledByDefault: false,  // No native buttons, just the drawing engine
        },
      });
      geomanRef.current = gm;

      // Wait for Geoman to be fully ready
      const onReady = () => {
        console.log('[AOI] Geoman engine ready (no native toolbar, using Kepler UI)');
      };
      map.on('gm:loaded', onReady);

      // Fallback: poll until gm is responsive
      let polls = 0;
      const poller = setInterval(() => {
        polls++;
        if (gm.enableDraw) {
          clearInterval(poller);
          console.log('[AOI] Geoman API available (poll attempt', polls, ')');
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
      });

      console.log('[AOI] Geoman initialized (native toolbar hidden, using Kepler ToolbarItems)');
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

  // Disable all Geoman modes
  const disableAllModes = useCallback(() => {
    const gm = geomanRef.current;
    if (!gm) return;
    try {
      gm.disableDraw?.();
      gm.disableGlobalEditMode?.();
      gm.disableGlobalDragMode?.();
      gm.disableGlobalRemovalMode?.();
      gm.disableGlobalCutMode?.();
      gm.disableGlobalRotateMode?.();
    } catch (_) {}
  }, []);

  // Activate a Geoman mode
  const activateMode = useCallback((mode: AoiDrawMode) => {
    const gm = geomanRef.current;
    if (!gm) return;

    // First disable all
    disableAllModes();

    if (mode === activeMode) {
      // Toggle off
      setActiveMode(null);
      return;
    }

    setActiveMode(mode);
    console.log('[AOI] Activating mode:', mode);

    try {
      switch (mode) {
        case 'rectangle':
          gm.enableDraw('rectangle');
          console.log('[AOI] enableDraw(rectangle) called');
          break;
        case 'polygon':
          gm.enableDraw('polygon');
          console.log('[AOI] enableDraw(polygon) called');
          break;
        case 'circle':
          gm.enableDraw('circle');
          console.log('[AOI] enableDraw(circle) called');
          break;
        case 'edit':
          gm.enableGlobalEditMode();
          break;
        case 'drag':
          gm.enableGlobalDragMode();
          break;
        case 'delete':
          gm.enableGlobalRemovalMode();
          break;
        case 'cut':
          gm.enableGlobalCutMode();
          break;
        case 'rotate':
          gm.enableGlobalRotateMode();
          break;
      }
    } catch (err) {
      console.error('[AOI] Mode activation failed:', mode, err);
    }
  }, [activeMode, disableAllModes]);

  // Toggle panel
  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const next = !panelActive;
    setPanelActive(next);
    if (!next) {
      disableAllModes();
      setActiveMode(null);
      if (drawnFeaturesRef.current.size === 0) {
        setAoiMode('idle');
      } else {
        setAoiMode('drawn');
      }
    }
  }, [panelActive, disableAllModes]);

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
    <div className="map-aoi-controls" style={{position: 'relative'}}>
      {panelActive ? (
        <StyledToolbar $show={panelActive}>
          {AOI_TOOLS.map(({mode, label, Icon}) => (
            <StyledToolbarItem
              key={mode}
              $active={activeMode === mode}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                activateMode(mode);
              }}
            >
              <div style={{width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <Icon />
              </div>
              <div className="toolbar-item__title">{label}</div>
            </StyledToolbarItem>
          ))}
        </StyledToolbar>
      ) : null}
      <div style={{position: 'relative'}}>
        <StatusDot $hasAoi={!!aoiState.geometry} />
        <MapControlButton
          className={classnames('map-control-button', 'toggle-aoi', {isActive: panelActive})}
          onClick={handleToggle}
          active={panelActive}
        >
          <AoiIcon height="18px" />
        </MapControlButton>
      </div>
    </div>
  );
};

AoiControl.displayName = 'AoiControl';

export default React.memo(AoiControl);
