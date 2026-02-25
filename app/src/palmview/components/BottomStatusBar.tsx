// SPDX-License-Identifier: MIT
// Copyright ©Synga — PalmView Bottom Status Bar
// Displays real-time mouse coordinates, scale, CRS and zoom level.

import React, {useState, useEffect, useCallback} from 'react';
import styled from 'styled-components';
import {useSelector} from 'react-redux';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BottomStatusBarProps {
  /** Mapbox GL JS Map instance (from window.__PALMVIEW_MAP or passed directly) */
  mapRef?: any;
}

// ─── Styled Components ───────────────────────────────────────────────────────

const Bar = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 22px;
  background: rgba(18, 22, 28, 0.88);
  backdrop-filter: blur(4px);
  color: #8b95a5;
  font-size: 10.5px;
  font-family: 'Roboto Mono', 'SF Mono', 'Fira Code', monospace, sans-serif;
  display: flex;
  align-items: center;
  padding: 0 10px;
  z-index: 900; /* above map, below modals */
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
`;

const Seg = styled.span`
  padding: 0 10px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  line-height: 1;
  &:first-child {
    padding-left: 0;
  }
  &:last-child {
    border-right: none;
  }
`;

const Label = styled.span`
  color: #5a6478;
  margin-right: 3px;
`;

const Value = styled.span`
  color: #b0bac8;
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatScale(zoom: number): string {
  // Approximate: scale = 559082264 / 2^zoom (metres per pixel × 96 DPI)
  const scale = 559082264 / Math.pow(2, zoom);
  if (scale >= 1_000_000) return `1:${(scale / 1_000_000).toFixed(1)}M`;
  if (scale >= 1_000) return `1:${Math.round(scale / 1000)}k`;
  return `1:${Math.round(scale)}`;
}

function formatCoord(value: number, posLabel: string, negLabel: string): string {
  return `${Math.abs(value).toFixed(4)}°${value >= 0 ? posLabel : negLabel}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

const BottomStatusBar: React.FC<BottomStatusBarProps> = ({mapRef}) => {
  const [coords, setCoords] = useState<{lng: number; lat: number} | null>(null);

  // Zoom from Kepler.gl Redux store (mapState.zoom)
  const zoom: number = useSelector(
    (state: any) => state?.demo?.keplerGl?.map?.mapState?.zoom ?? 0
  );

  const handleMouseMove = useCallback((e: any) => {
    if (e?.lngLat) {
      setCoords({lng: e.lngLat.lng, lat: e.lngLat.lat});
    }
  }, []);

  useEffect(() => {
    // Prefer the passed mapRef; fall back to window.__PALMVIEW_MAP
    const map = mapRef || (typeof window !== 'undefined' ? (window as any).__PALMVIEW_MAP : null);
    if (!map) return;

    map.on('mousemove', handleMouseMove);
    return () => {
      map.off('mousemove', handleMouseMove);
    };
  }, [mapRef, handleMouseMove]);

  const latStr = coords ? formatCoord(coords.lat, 'N', 'S') : '—';
  const lngStr = coords ? formatCoord(coords.lng, 'E', 'W') : '—';

  return (
    <Bar>
      <Seg>
        <Label>坐标:</Label>
        <Value>
          {latStr}, {lngStr}
        </Value>
      </Seg>
      <Seg>
        <Label>Scale:</Label>
        <Value>{formatScale(zoom)}</Value>
      </Seg>
      <Seg>
        <Label>CRS:</Label>
        <Value>EPSG:4326</Value>
      </Seg>
      <Seg>
        <Label>Zoom:</Label>
        <Value>{zoom.toFixed(1)}</Value>
      </Seg>
    </Bar>
  );
};

export default BottomStatusBar;
