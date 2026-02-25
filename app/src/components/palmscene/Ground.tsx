'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

interface GroundProps {
  boundary?: GeoJSONPolygon;
}

/**
 * Compute approximate width/height in meters from a GeoJSON Polygon bbox.
 * Uses simple equirectangular approximation — good enough for plantation scale.
 */
function computeSizeFromBoundary(boundary?: GeoJSONPolygon): [number, number] {
  if (!boundary || !boundary.coordinates[0]) return [100, 100];

  const coords = boundary.coordinates[0];
  const lngs = coords.map(([lng]) => lng);
  const lats = coords.map(([, lat]) => lat);

  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const R = 6371000; // Earth radius in metres
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const width = (maxLng - minLng) * (Math.PI / 180) * R * Math.cos(midLat);
  const height = (maxLat - minLat) * (Math.PI / 180) * R;

  // Clamp to reasonable scene units (1 unit ≈ 1 m, max 500 m per side)
  return [Math.min(Math.max(width, 20), 500), Math.min(Math.max(height, 20), 500)];
}

export default function Ground({ boundary }: GroundProps) {
  const [width, height] = useMemo(() => computeSizeFromBoundary(boundary), [boundary]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.01, 0]}>
      <planeGeometry args={[width, height, 32, 32]} />
      {/* Earthy green — replace with texture later */}
      <meshLambertMaterial color="#5a7a45" side={THREE.DoubleSide} />
    </mesh>
  );
}
