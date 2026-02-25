'use client';

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

interface SceneControlsProps {
  /** Look-at target in world space [x, y, z]. Defaults to origin. */
  target?: [number, number, number];
}

export default function SceneControls({ target = [0, 0, 0] }: SceneControlsProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null!);
  const { camera } = useThree();

  // Set initial 45° bird's-eye camera position once on mount
  useEffect(() => {
    const dist = 60;
    camera.position.set(dist, dist, dist);
    camera.lookAt(target[0], target[1], target[2]);
    if (controlsRef.current) {
      controlsRef.current.target.set(...target);
      controlsRef.current.update();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan
      enableZoom
      enableRotate
      // Zoom limits
      minDistance={5}
      maxDistance={300}
      // Restrict to above-ground views (0° = top-down, 90° = horizon)
      minPolarAngle={0}
      maxPolarAngle={Math.PI / 2.1}
      // Smooth damping
      enableDamping
      dampingFactor={0.08}
    />
  );
}
