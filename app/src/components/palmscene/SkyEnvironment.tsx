'use client';

import { Sky, Environment } from '@react-three/drei';

/**
 * Tropical sky + IBL environment.
 * Sun elevation is set high (azimuth=180°, inclination≈0.5) to mimic
 * midday equatorial sunlight.
 */
export default function SkyEnvironment() {
  return (
    <>
      {/* Physically-based sky shader */}
      <Sky
        distance={450000}
        sunPosition={[100, 60, -20]}
        inclination={0.52}
        azimuth={0.25}
        rayleigh={0.4}
        mieCoefficient={0.003}
        mieDirectionalG={0.9}
      />

      {/* Ambient IBL — sunset/park preset gives warm tropical feel */}
      <Environment preset="park" background={false} />

      {/* Directional sun light with shadows */}
      <directionalLight
        position={[50, 80, -30]}
        intensity={2.5}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={500}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
      />

      {/* Soft fill light from sky */}
      <ambientLight intensity={0.4} color="#b0d0f0" />
    </>
  );
}
