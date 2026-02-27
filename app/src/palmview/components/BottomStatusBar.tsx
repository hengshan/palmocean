// SPDX-License-Identifier: MIT
// Copyright ©Synga — PalmView Bottom Status Bar
// Displays real-time mouse coordinates, scale, CRS and zoom level.

import React, {useState, useEffect, useRef} from 'react';
import styled from 'styled-components';
import {useSelector} from 'react-redux';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BottomStatusBarProps {
  mapRef?: any;
}

// ─── Styled Components ───────────────────────────────────────────────────────

const Bar = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  width: fit-content;
  height: 22px;
  background: rgba(18, 22, 28, 0.88);
  backdrop-filter: blur(4px);
  color: #8b95a5;
  font-size: 10.5px;
  font-family: 'Roboto Mono', 'SF Mono', 'Fira Code', monospace, sans-serif;
  display: flex;
  align-items: center;
  padding: 0 10px;
  z-index: 900;
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
  &:first-child { padding-left: 0; }
  &:last-child  { border-right: none; }
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
  const scale = 559082264 / Math.pow(2, zoom);
  if (scale >= 1_000_000) return `1:${(scale / 1_000_000).toFixed(1)}M`;
  if (scale >= 1_000) return `1:${Math.round(scale / 1000)}k`;
  return `1:${Math.round(scale)}`;
}

function formatCoord(value: number, pos: string, neg: string): string {
  return `${Math.abs(value).toFixed(4)}°${value >= 0 ? pos : neg}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

const BottomStatusBar: React.FC<BottomStatusBarProps> = ({mapRef}) => {
  const [coords, setCoords] = useState<{lng: number; lat: number} | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const zoom: number = useSelector(
    (state: any) => state?.demo?.keplerGl?.map?.mapState?.zoom ?? 0
  );

  useEffect(() => {
    // Clean up any previous listener
    cleanupRef.current?.();
    cleanupRef.current = null;

    const attach = (map: any) => {
      const container: HTMLElement | null = map.getContainer?.();
      if (!container) return;

      const onMove = (e: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        try {
          const ll = map.unproject([x, y]);
          setCoords({lng: ll.lng, lat: ll.lat});
        } catch {
          // map not ready yet
        }
      };

      container.addEventListener('mousemove', onMove);
      cleanupRef.current = () => container.removeEventListener('mousemove', onMove);
    };

    // If mapRef is already available, use it immediately
    const immediate = mapRef || (window as any).__PALMVIEW_MAP;
    if (immediate) {
      attach(immediate);
      return;
    }

    // Otherwise poll until window.__PALMVIEW_MAP is set (max 10s)
    let attempts = 0;
    const timer = setInterval(() => {
      const map = (window as any).__PALMVIEW_MAP;
      if (map) {
        clearInterval(timer);
        attach(map);
      } else if (++attempts > 100) {
        clearInterval(timer);
      }
    }, 100);

    return () => {
      clearInterval(timer);
      cleanupRef.current?.();
    };
  }, [mapRef]);

  const latStr = coords ? formatCoord(coords.lat, 'N', 'S') : '—';
  const lngStr = coords ? formatCoord(coords.lng, 'E', 'W') : '—';

  return (
    <Bar>
      <Seg>
        <Label>坐标:</Label>
        <Value>{latStr}, {lngStr}</Value>
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
