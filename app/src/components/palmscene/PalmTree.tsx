'use client';

import { useRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { GLTF } from 'three-stdlib';
import type { Mesh } from 'three';
import type { ThreeEvent } from '@react-three/fiber';

export interface PalmTreeProps {
  /** World-space position [x, y, z] */
  position: [number, number, number];
  /** Tree age in years (affects scale) */
  age?: number;
  /** Health 0–1: 1=healthy green, 0=dying red */
  health?: number;
  /** Optional GLTF model URL — falls back to procedural mesh */
  modelUrl?: string;
  /** Called when the tree is clicked */
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

/** Interpolate health → colour: green → yellow → red */
function healthColor(health: number): THREE.Color {
  const h = Math.max(0, Math.min(1, health));
  if (h >= 0.5) {
    // healthy (green) → medium (yellow)
    const t = (h - 0.5) / 0.5;
    return new THREE.Color().setHSL(0.17 + t * (0.33 - 0.17), 0.8, 0.35);
  } else {
    // medium (yellow) → poor (red)
    const t = h / 0.5;
    return new THREE.Color().setHSL(t * 0.17, 0.9, 0.35);
  }
}

/** Procedural placeholder tree (cylinder trunk + sphere crown) */
function ProceduralTree({
  age = 5,
  health = 1,
  onClick,
}: Pick<PalmTreeProps, 'age' | 'health' | 'onClick'>) {
  const trunkRef = useRef<Mesh>(null!);

  const scale = useMemo(() => Math.max(0.5, Math.min(age / 10, 2)), [age]);
  const trunkHeight = 4 * scale;
  const trunkRadius = 0.15 * scale;
  const crownRadius = 1.5 * scale;
  const crownY = trunkHeight + crownRadius * 0.6;

  const crownColor = useMemo(() => healthColor(health ?? 1), [health]);
  const trunkColor = new THREE.Color('#8B6914');

  return (
    <group onClick={onClick}>
      {/* Trunk */}
      <mesh
        ref={trunkRef}
        position={[0, trunkHeight / 2, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[trunkRadius * 0.7, trunkRadius, trunkHeight, 8]} />
        <meshLambertMaterial color={trunkColor} />
      </mesh>

      {/* Crown */}
      <mesh position={[0, crownY, 0]} castShadow>
        <sphereGeometry args={[crownRadius, 12, 10]} />
        <meshLambertMaterial color={crownColor} />
      </mesh>
    </group>
  );
}

/** GLTF model variant — replaces procedural mesh when modelUrl is provided */
function GLTFTree({
  modelUrl,
  age = 5,
  onClick,
}: Pick<PalmTreeProps, 'modelUrl' | 'age' | 'onClick'>) {
  const { scene } = useGLTF(modelUrl!) as GLTF & { scene: THREE.Group };
  const scale = Math.max(0.5, Math.min(age / 10, 2));
  return (
    <primitive
      object={scene.clone()}
      scale={scale}
      onClick={onClick}
    />
  );
}

export default function PalmTree({
  position,
  age = 5,
  health = 1,
  modelUrl,
  onClick,
}: PalmTreeProps) {
  return (
    <group position={position}>
      {modelUrl ? (
        <GLTFTree modelUrl={modelUrl} age={age} onClick={onClick} />
      ) : (
        <ProceduralTree age={age} health={health} onClick={onClick} />
      )}
    </group>
  );
}
