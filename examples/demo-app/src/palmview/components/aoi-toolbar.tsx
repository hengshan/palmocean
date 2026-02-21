/**
 * AOI Manager — Initializes Geoman on the map and manages AOI state.
 * Geoman's native toolbar provides all draw/edit tools (snap, rotate, cut, etc.)
 * This component only handles: initialization, toolbar toggle, AOI state capture.
 * Author: Lyra · 2026-02-21
 */

import React, {useEffect, useState, useCallback, useRef} from 'react';
import styled from 'styled-components';
import {setAoiGeometry, setAoiMode, clearAoi, getMapState, subscribe} from '../raster-state';
import type {AoiState} from '../raster-state';

// ── Styles ───────────────────────────────────────────

const ToggleButton = styled.button<{$active?: boolean}>`
  /* This button goes into Kepler's map-control toolbar area */
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

// ── Component ────────────────────────────────────────

interface AoiToolbarProps {
  map?: any;
}

const AoiToolbar: React.FC<AoiToolbarProps> = ({map: mapProp}) => {
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [aoiState, setLocalAoiState] = useState<AoiState>(getMapState().aoiState);
  const geomanRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const geomanLoadedRef = useRef(false);

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

  // Initialize Geoman
  const initGeoman = useCallback(async (map: any) => {
    if (geomanRef.current) return;

    try {
      const {Geoman} = await import('@geoman-io/maplibre-geoman-free');
      await import('@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.css');

      // Initialize with default config — Geoman creates its own toolbar
      const gm = new Geoman(map);
      geomanRef.current = gm;

      map.on('gm:loaded', () => {
        geomanLoadedRef.current = true;
        console.log('[AOI] Geoman fully loaded with all tools');

        // Initially hide — user toggles via AOI icon
        if (!toolbarVisible) {
          hideGeomanToolbar();
        }
      });

      // Capture AOI creation
      map.on('gm:create', (e: any) => {
        const geometry = e.feature?.geometry || e.shape?.geometry;
        if (geometry) {
          setAoiGeometry(geometry);
          setAoiMode('drawn');
          console.log('[AOI] Created:', JSON.stringify(geometry));
        }
      });

      // Capture AOI edits
      map.on('gm:edit', (e: any) => {
        const geometry = e.feature?.geometry || e.shape?.geometry;
        if (geometry) {
          setAoiGeometry(geometry);
          console.log('[AOI] Edited:', JSON.stringify(geometry));
        }
      });

      // Capture AOI removal
      map.on('gm:remove', () => {
        clearAoi();
        console.log('[AOI] Removed');
      });

      console.log('[AOI] Geoman initialized');
    } catch (err) {
      console.error('[AOI] Failed to initialize Geoman:', err);
    }
  }, []);

  // Show/hide Geoman's native toolbar via DOM
  const getGeomanToolbarEl = useCallback((): HTMLElement | null => {
    const container = mapRef.current?.getContainer?.();
    if (!container) return null;
    // Geoman creates a .geoman-controls inside maplibregl-ctrl-top-left
    return container.querySelector('.geoman-controls') as HTMLElement;
  }, []);

  const hideGeomanToolbar = useCallback(() => {
    const el = getGeomanToolbarEl();
    if (el) el.style.display = 'none';
  }, [getGeomanToolbarEl]);

  const showGeomanToolbar = useCallback(() => {
    const el = getGeomanToolbarEl();
    if (el) {
      el.style.display = 'block';
      // Move Geoman toolbar to the right of the sidebar (sidebar is ~310px)
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
          gm.disableGlobalEditMode();
          gm.disableGlobalDragMode();
        }
      } catch (_) {}
      setAoiMode('idle');
    }
  }, [toolbarVisible, showGeomanToolbar, hideGeomanToolbar]);

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
