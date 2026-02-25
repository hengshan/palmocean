'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import type { Group } from 'three';

export type BotStatus = 'idle' | 'moving' | 'harvesting';

export interface HarvestBotProps {
  position: [number, number, number];
  status?: BotStatus;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

/** Colour per operational status */
const STATUS_COLOR: Record<BotStatus, string> = {
  idle: '#607d8b',       // steel blue-grey
  moving: '#1976d2',     // bright blue — in motion
  harvesting: '#f9a825', // amber — active harvesting
};

/**
 * Harvest robot placeholder:
 * - Box body + head + arm stubs + track base
 * - Bobbing animation when moving, pulsing when harvesting
 */
export default function HarvestBot({
  position,
  status = 'idle',
  onClick,
}: HarvestBotProps) {
  const groupRef = useRef<Group>(null!);
  const color = STATUS_COLOR[status];

  useFrame(() => {
    if (!groupRef.current) return;
    if (status === 'moving') {
      // Gentle bob up/down relative to base position
      groupRef.current.position.y =
        position[1] + Math.sin(Date.now() * 0.005) * 0.08;
    } else if (status === 'harvesting') {
      // Faster pulse scale
      const s = 1 + Math.sin(Date.now() * 0.01) * 0.05;
      groupRef.current.scale.setScalar(s);
    } else {
      groupRef.current.position.y = position[1];
      groupRef.current.scale.setScalar(1);
    }
  });

  const bodyMat = <meshLambertMaterial color={color} />;

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={onClick}
    >
      {/* Body */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.6, 0.8, 0.4]} />
        {bodyMat}
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[0.35, 0.3, 0.35]} />
        {bodyMat}
      </mesh>

      {/* Left arm */}
      <mesh position={[-0.45, 0.55, 0]} castShadow>
        <boxGeometry args={[0.15, 0.5, 0.15]} />
        {bodyMat}
      </mesh>

      {/* Right arm */}
      <mesh position={[0.45, 0.55, 0]} castShadow>
        <boxGeometry args={[0.15, 0.5, 0.15]} />
        {bodyMat}
      </mesh>

      {/* Tracks (base) */}
      <mesh position={[0, 0.07, 0]} castShadow>
        <boxGeometry args={[0.75, 0.15, 0.5]} />
        <meshLambertMaterial color="#37474f" />
      </mesh>

      {/* Status indicator light on head */}
      <mesh position={[0, 1.28, 0.18]}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={status === 'idle' ? 0.5 : 2}
        />
      </mesh>
    </group>
  );
}
