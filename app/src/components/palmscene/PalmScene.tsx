'use client';

/**
 * PalmScene.tsx — Dual-layer 3D scene for PalmView
 *
 * Layer 1 (CesiumJS)   — terrain, real geo-coordinates, tree points, boundary
 * Layer 2 (Three.js)   — HarvestBot robots (custom 3D mesh + animation)
 * Layer 3 (HTML)       — SceneUI overlay (asset info card, close button, etc.)
 */

import { Suspense, useState, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';

import CesiumViewer, { type TreeFeature } from './CesiumViewer';
import HarvestBot from './HarvestBot';
import SceneUI, { type SelectedAsset } from './SceneUI';
import { useSceneStore } from '../../lib/store/sceneStore';
import type { BotStatus } from './HarvestBot';

// ─── GeoJSON Polygon type ─────────────────────────────────────────────────────
export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

// ─── PalmScene props ──────────────────────────────────────────────────────────
export interface PalmSceneProps {
  plantationId: string;
  boundary?: GeoJSONPolygon;
  onClose: () => void;
}

// ─── Mock data ────────────────────────────────────────────────────────────────
// Tree positions are expressed as [longitude, latitude] offsets from a mock
// plantation centre (Sabah, Malaysia: ~117.56°E, 5.98°N).
// Each 0.0001° ≈ ~11 m, so the grid spans roughly 150 × 150 m.
const PLANTATION_CENTER: [number, number] = [117.5600, 5.9800];

const MOCK_TREES: Array<{
  id: string;
  /** [col, row] grid offset in units of 0.0006° each */
  grid: [number, number];
  age: number;
  health: number;
}> = [
  { id: 'T-001', grid: [-2, -2], age: 8,  health: 0.95 },
  { id: 'T-002', grid: [-1, -2], age: 6,  health: 0.80 },
  { id: 'T-003', grid: [ 0, -2], age: 12, health: 0.55 },
  { id: 'T-004', grid: [ 1, -2], age: 4,  health: 0.92 },
  { id: 'T-005', grid: [ 2, -2], age: 9,  health: 0.30 },
  { id: 'T-006', grid: [-2,  0], age: 7,  health: 0.88 },
  { id: 'T-007', grid: [-1,  0], age: 10, health: 0.70 },
  { id: 'T-008', grid: [ 0,  0], age: 5,  health: 0.99 },
  { id: 'T-009', grid: [ 1,  0], age: 11, health: 0.45 },
  { id: 'T-010', grid: [ 2,  0], age: 3,  health: 0.85 },
  { id: 'T-011', grid: [-2,  2], age: 6,  health: 0.78 },
  { id: 'T-012', grid: [-1,  2], age: 8,  health: 0.62 },
  { id: 'T-013', grid: [ 0,  2], age: 15, health: 0.20 },
  { id: 'T-014', grid: [ 1,  2], age: 4,  health: 0.97 },
  { id: 'T-015', grid: [ 2,  2], age: 7,  health: 0.75 },
];

const MOCK_BOTS: Array<{
  id: string;
  position: [number, number, number];
  status: BotStatus;
}> = [
  { id: 'BOT-01', position: [ 3, 0,  3], status: 'harvesting' },
  { id: 'BOT-02', position: [-9, 0,  5], status: 'moving' },
  { id: 'BOT-03', position: [ 9, 0, -5], status: 'idle' },
];

// ─── Mock plantation metadata ─────────────────────────────────────────────────
const MOCK_META: Record<string, { name: string; areaHa: number }> = {
  default: { name: 'Ladang Sawit Utara', areaHa: 42.5 },
};

// ─── Three.js bot layer ───────────────────────────────────────────────────────

interface HarvestBotLayerProps {
  bots: Array<{ id: string; position: [number, number, number]; status: BotStatus }>;
  onSelectBot: (bot: { id: string; position: [number, number, number]; status: BotStatus }) => void;
}

function HarvestBotLayer({ bots, onSelectBot }: HarvestBotLayerProps) {
  return (
    <>
      {/* Minimal ambient light so bots are visible */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} />

      {bots.map((bot) => (
        <HarvestBot
          key={bot.id}
          position={bot.position}
          status={bot.status}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onSelectBot(bot);
          }}
        />
      ))}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PalmScene({ plantationId, boundary, onClose }: PalmSceneProps) {
  const [selected, setSelected] = useState<SelectedAsset>(null);

  const meta = MOCK_META[plantationId] ?? MOCK_META.default;

  const selectAsset = useSceneStore((s) => s.selectAsset);

  // Build CesiumViewer-compatible TreeFeature list from mock data
  const treeFeatures = useMemo<TreeFeature[]>(() =>
    MOCK_TREES.map((tree) => ({
      id: tree.id,
      coordinates: [
        PLANTATION_CENTER[0] + tree.grid[0] * 0.0006,
        PLANTATION_CENTER[1] + tree.grid[1] * 0.0006,
      ],
      health: tree.health,
      age: tree.age,
    })),
    []
  );

  // Build a quick lookup map for tree metadata (by id)
  const treeById = useMemo(() => {
    const m = new Map<string, typeof MOCK_TREES[number]>();
    MOCK_TREES.forEach((t) => m.set(t.id, t));
    return m;
  }, []);

  const handleTreeSelect = useCallback(
    (treeId: string) => {
      selectAsset(treeId);
      const tree = treeById.get(treeId);
      if (tree) {
        setSelected({
          type: 'tree',
          id: tree.id,
          age: tree.age,
          health: tree.health,
          // Position in local scene units — kept for SceneUI display
          position: [tree.grid[0] * 6, 0, tree.grid[1] * 6],
        });
      }
    },
    [selectAsset, treeById]
  );

  const handleBotSelect = useCallback(
    (bot: { id: string; position: [number, number, number]; status: BotStatus }) => {
      selectAsset(bot.id);
      setSelected({
        type: 'bot',
        id: bot.id,
        status: bot.status,
        position: bot.position,
      });
    },
    [selectAsset]
  );

  const handleDeselect = useCallback(() => {
    selectAsset(null);
    setSelected(null);
  }, [selectAsset]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#0a140a',
        overflow: 'hidden',
      }}
    >
      {/* ── Layer 1: CesiumJS — terrain, geo-coordinates, tree points ─────── */}
      <CesiumViewer
        plantationId={plantationId}
        boundary={boundary}
        treeFeatures={treeFeatures}
        onTreeSelect={handleTreeSelect}
      />

      {/* ── Layer 2: Three.js overlay — HarvestBot robots ─────────────────── */}
      {/*
          pointer-events: none so mouse clicks pass through to CesiumJS.
          The HarvestBot meshes handle their own onClick via Three.js raycasting
          which is independent of the DOM event chain.
      */}
      <Canvas
        gl={{ antialias: true, alpha: true }}
        camera={{ fov: 50, near: 0.1, far: 2000, position: [0, 30, 30] }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        <Suspense fallback={null}>
          <HarvestBotLayer
            bots={MOCK_BOTS}
            onSelectBot={handleBotSelect}
          />
        </Suspense>
      </Canvas>

      {/* ── Layer 3: HTML overlay UI ───────────────────────────────────────── */}
      <SceneUI
        plantationName={meta.name}
        areaHa={meta.areaHa}
        onClose={onClose}
        selected={selected}
        onDeselect={handleDeselect}
      />
    </div>
  );
}
