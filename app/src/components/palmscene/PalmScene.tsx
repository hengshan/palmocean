'use client';

import { Suspense, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';

import Ground from './Ground';
import SkyEnvironment from './SkyEnvironment';
import PalmTree from './PalmTree';
import HarvestBot from './HarvestBot';
import SceneControls from './SceneControls';
import SceneUI, { type SelectedAsset } from './SceneUI';
import type { BotStatus } from './HarvestBot';

// ─── GeoJSON Polygon type ───────────────────────────────────────────────────
export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

// ─── PalmScene props ─────────────────────────────────────────────────────────
export interface PalmSceneProps {
  plantationId: string;
  boundary?: GeoJSONPolygon;
  onClose: () => void;
}

// ─── Mock data ───────────────────────────────────────────────────────────────
const MOCK_TREES: Array<{
  id: string;
  position: [number, number, number];
  age: number;
  health: number;
}> = [
  { id: 'T-001', position: [-12, 0, -8],  age: 8,  health: 0.95 },
  { id: 'T-002', position: [ -6, 0, -8],  age: 6,  health: 0.80 },
  { id: 'T-003', position: [  0, 0, -8],  age: 12, health: 0.55 },
  { id: 'T-004', position: [  6, 0, -8],  age: 4,  health: 0.92 },
  { id: 'T-005', position: [ 12, 0, -8],  age: 9,  health: 0.30 },
  { id: 'T-006', position: [-12, 0,  0],  age: 7,  health: 0.88 },
  { id: 'T-007', position: [ -6, 0,  0],  age: 10, health: 0.70 },
  { id: 'T-008', position: [  0, 0,  0],  age: 5,  health: 0.99 },
  { id: 'T-009', position: [  6, 0,  0],  age: 11, health: 0.45 },
  { id: 'T-010', position: [ 12, 0,  0],  age: 3,  health: 0.85 },
  { id: 'T-011', position: [-12, 0,  8],  age: 6,  health: 0.78 },
  { id: 'T-012', position: [ -6, 0,  8],  age: 8,  health: 0.62 },
  { id: 'T-013', position: [  0, 0,  8],  age: 15, health: 0.20 },
  { id: 'T-014', position: [  6, 0,  8],  age: 4,  health: 0.97 },
  { id: 'T-015', position: [ 12, 0,  8],  age: 7,  health: 0.75 },
];

const MOCK_BOTS: Array<{
  id: string;
  position: [number, number, number];
  status: BotStatus;
}> = [
  { id: 'BOT-01', position: [3, 0, 3],   status: 'harvesting' },
  { id: 'BOT-02', position: [-9, 0, 5],  status: 'moving' },
  { id: 'BOT-03', position: [9, 0, -5],  status: 'idle' },
];

// ─── Mock plantation metadata ─────────────────────────────────────────────────
const MOCK_META: Record<string, { name: string; areaHa: number }> = {
  default: { name: 'Ladang Sawit Utara', areaHa: 42.5 },
};

// ─── Loading fallback inside Canvas ─────────────────────────────────────────
function SceneFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#2d4a1e" wireframe />
    </mesh>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PalmScene({ plantationId, boundary, onClose }: PalmSceneProps) {
  const [selected, setSelected] = useState<SelectedAsset>(null);

  const meta = MOCK_META[plantationId] ?? MOCK_META.default;

  const handleSelectTree = useCallback(
    (tree: (typeof MOCK_TREES)[number]) => {
      setSelected({
        type: 'tree',
        id: tree.id,
        age: tree.age,
        health: tree.health,
        position: tree.position,
      });
    },
    []
  );

  const handleSelectBot = useCallback(
    (bot: (typeof MOCK_BOTS)[number]) => {
      setSelected({
        type: 'bot',
        id: bot.id,
        status: bot.status,
        position: bot.position,
      });
    },
    []
  );

  return (
    // Outer container — position: relative so the UI overlay can be absolute
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0a140a' }}>
      {/* ── Three.js Canvas ────────────────────────────────────────────────── */}
      <Canvas
        shadows
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
        camera={{ fov: 50, near: 0.1, far: 2000 }}
        style={{ width: '100%', height: '100%' }}
        // Deselect asset when clicking empty canvas space
        onClick={() => setSelected(null)}
      >
        <Suspense fallback={<SceneFallback />}>
          {/* Environment */}
          <SkyEnvironment />

          {/* Ground plane */}
          <Ground boundary={boundary} />

          {/* Palm trees */}
          {MOCK_TREES.map((tree) => (
            <PalmTree
              key={tree.id}
              position={tree.position}
              age={tree.age}
              health={tree.health}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                handleSelectTree(tree);
              }}
            />
          ))}

          {/* Harvest bots */}
          {MOCK_BOTS.map((bot) => (
            <HarvestBot
              key={bot.id}
              position={bot.position}
              status={bot.status}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                handleSelectBot(bot);
              }}
            />
          ))}

          {/* Camera orbit controls */}
          <SceneControls />
        </Suspense>
      </Canvas>

      {/* ── HTML overlay UI ───────────────────────────────────────────────── */}
      <SceneUI
        plantationName={meta.name}
        areaHa={meta.areaHa}
        onClose={onClose}
        selected={selected}
        onDeselect={() => setSelected(null)}
      />
    </div>
  );
}
