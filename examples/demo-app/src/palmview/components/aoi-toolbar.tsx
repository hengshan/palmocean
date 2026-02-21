/**
 * AOI Toolbar — Floating map control for drawing Areas of Interest
 * Uses @geoman-io/maplibre-geoman-free for draw/edit on the map.
 * Author: IRIS · 2026-02-21
 */

import React, {useEffect, useState, useCallback, useRef} from 'react';
import styled from 'styled-components';
import {setAoiGeometry, setAoiMode, clearAoi, getMapState, subscribe} from '../raster-state';
import type {AoiState} from '../raster-state';

// ── Styles ───────────────────────────────────────────

const ToolbarContainer = styled.div`
  position: absolute;
  top: 80px;
  right: 12px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: rgba(36, 39, 48, 0.92);
  border-radius: 8px;
  padding: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
`;

const ToolButton = styled.button<{$active?: boolean}>`
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 6px;
  background: ${(p) => (p.$active ? '#4B8BF5' : 'transparent')};
  color: ${(p) => (p.$active ? '#fff' : '#a0a7b4')};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: ${(p) => (p.$active ? '#4B8BF5' : 'rgba(255,255,255,0.08)')};
    color: #fff;
  }
`;

const Divider = styled.div`
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 2px 0;
`;

const StatusBadge = styled.div<{$hasAoi: boolean}>`
  font-size: 10px;
  text-align: center;
  color: ${(p) => (p.$hasAoi ? '#4ecdc4' : '#a0a7b4')};
  padding: 2px 0 0;
  user-select: none;
`;

// ── Types ────────────────────────────────────────────

type DrawMode = 'none' | 'rectangle' | 'polygon' | 'edit';

interface AoiToolbarProps {
  /** Optional: provide map externally; defaults to window.__PALMVIEW_MAP */
  map?: any;
}

// ── Component ────────────────────────────────────────

const AoiToolbar: React.FC<AoiToolbarProps> = ({map: mapProp}) => {
  const [drawMode, setDrawMode] = useState<DrawMode>('none');
  const [aoiState, setLocalAoiState] = useState<AoiState>(getMapState().aoiState);
  const geomanRef = useRef<any>(null);
  const mapRef = useRef<any>(null);

  // Subscribe to state changes
  useEffect(() => {
    return subscribe((s) => setLocalAoiState(s.aoiState));
  }, []);

  // Get map instance
  useEffect(() => {
    const m = mapProp || (window as any).__PALMVIEW_MAP;
    if (m) {
      mapRef.current = m;
    } else {
      // Poll for map availability
      const interval = setInterval(() => {
        const m2 = (window as any).__PALMVIEW_MAP;
        if (m2) {
          mapRef.current = m2;
          clearInterval(interval);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [mapProp]);

  // Initialize Geoman when map is ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map || geomanRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        // Dynamic import to avoid SSR issues
        const {Geoman} = await import('@geoman-io/maplibre-geoman-free');
        // Import Geoman CSS for proper rendering
        await import('@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.css');
        if (cancelled) return;

        // Initialize Geoman — hide default toolbar, we provide our own
        const gm = new Geoman(map);
        geomanRef.current = gm;

        // Wait for Geoman to be fully loaded before using draw modes
        map.on('gm:loaded', () => {
          if (cancelled) return;
          console.log('[AOI] Geoman fully loaded');

          // Hide default Geoman toolbar — we use our custom one
          try {
            gm.setControls({hide: true});
          } catch (_) {
            // Controls API may differ, ignore
          }
        });

        // Listen for draw complete
        map.on('gm:create', (e: any) => {
          const feature = e.feature;
          const geometry = feature?.geometry || e.shape?.geometry;
          if (geometry) {
            setAoiGeometry(geometry);
            setDrawMode('none');
            // Disable draw after creation
            try { gm.disableDraw(); } catch (_) {}
            console.log('[AOI] Created:', JSON.stringify(geometry));
          }
        });

        // Listen for edit complete
        map.on('gm:edit', (e: any) => {
          const feature = e.feature;
          const geometry = feature?.geometry || e.shape?.geometry;
          if (geometry) {
            setAoiGeometry(geometry);
            console.log('[AOI] Edited:', JSON.stringify(geometry));
          }
        });

        // Listen for remove
        map.on('gm:remove', () => {
          clearAoi();
          setDrawMode('none');
          console.log('[AOI] Removed');
        });

        console.log('[AOI] Geoman initialized successfully');
      } catch (err) {
        console.error('[AOI] Failed to initialize Geoman:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapRef.current]);

  // Handle draw mode changes
  const activateMode = useCallback((mode: DrawMode) => {
    const gm = geomanRef.current;
    if (!gm) return;

    // Deactivate current mode
    try {
      gm.disableDraw();
      gm.disableGlobalEditMode();
    } catch (_) { /* ignore */ }

    if (mode === drawMode) {
      // Toggle off
      setDrawMode('none');
      setAoiMode('idle');
      return;
    }

    setDrawMode(mode);

    switch (mode) {
      case 'rectangle':
        setAoiMode('drawing');
        gm.enableDraw('rectangle');
        break;
      case 'polygon':
        setAoiMode('drawing');
        gm.enableDraw('polygon');
        break;
      case 'edit':
        setAoiMode('editing');
        gm.enableGlobalEditMode();
        break;
      default:
        setAoiMode('idle');
    }
  }, [drawMode]);

  const handleClear = useCallback(() => {
    const gm = geomanRef.current;
    if (gm) {
      try {
        gm.disableDraw();
        gm.disableGlobalEditMode();
        // Remove all Geoman features
        const map = mapRef.current;
        if (map && map.gm) {
          try {
            const features = map.gm.features?.getFeatures?.() || [];
            features.forEach((f: any) => map.gm.features.removeFeature(f));
          } catch (_) {
            // Fallback: try alternative API
            try { map.gm.removeAll?.(); } catch (_2) {}
          }
        }
      } catch (_) { /* ignore */ }
    }
    clearAoi();
    setDrawMode('none');
  }, []);

  return (
    <ToolbarContainer>
      <ToolButton
        $active={drawMode === 'rectangle'}
        onClick={() => activateMode('rectangle')}
        title="Draw Rectangle AOI"
      >
        ▭
      </ToolButton>
      <ToolButton
        $active={drawMode === 'polygon'}
        onClick={() => activateMode('polygon')}
        title="Draw Polygon AOI"
      >
        ⬠
      </ToolButton>
      <Divider />
      <ToolButton
        $active={drawMode === 'edit'}
        onClick={() => activateMode('edit')}
        title="Edit AOI"
      >
        ✎
      </ToolButton>
      <ToolButton
        onClick={handleClear}
        title="Clear AOI"
      >
        ✕
      </ToolButton>
      <Divider />
      <StatusBadge $hasAoi={!!aoiState.geometry}>
        {aoiState.geometry ? 'AOI ✓' : 'AOI'}
      </StatusBadge>
    </ToolbarContainer>
  );
};

export default AoiToolbar;
