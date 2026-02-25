'use client';

/**
 * CesiumViewer.tsx
 *
 * Layer 1 of the PalmScene dual-layer architecture.
 * Renders the plantation terrain and tree points via CesiumJS.
 *
 * Key decisions:
 * - OSM imagery (no Ion token required)
 * - Tree points rendered as PointPrimitiveCollection for performance
 * - Boundary rendered as a filled+outlined polygon Entity
 * - Click handler resolves tree id → calls onTreeSelect
 * - Exposes flyToCoords via ref (registered in sceneStore)
 */

import { useEffect, useRef, useCallback } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useSceneStore } from '../../lib/store/sceneStore';
import type { GeoJSONPolygon } from './PalmScene';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TreeFeature {
  id: string;
  /** [longitude, latitude] in WGS-84 degrees */
  coordinates: [number, number];
  /** 0–1 health score */
  health: number;
  age?: number;
}

export interface CesiumViewerProps {
  plantationId: string;
  boundary?: GeoJSONPolygon;
  treeFeatures?: TreeFeature[];
  onTreeSelect?: (treeId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map a 0–1 health score to a Cesium Color (green → yellow → red). */
function healthToColor(health: number): Cesium.Color {
  if (health >= 0.7) {
    // healthy: green
    return Cesium.Color.fromCssColorString('#4caf50');
  } else if (health >= 0.4) {
    // moderate: amber
    return Cesium.Color.fromCssColorString('#ffc107');
  } else {
    // poor: red
    return Cesium.Color.fromCssColorString('#f44336');
  }
}

/** Convert a GeoJSON Polygon ring to a Cesium CartesianArray. */
function ringToCartesians(ring: number[][]): Cesium.Cartesian3[] {
  return ring.map(([lng, lat]) =>
    Cesium.Cartesian3.fromDegrees(lng, lat)
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CesiumViewer({
  plantationId,
  boundary,
  treeFeatures = [],
  onTreeSelect,
}: CesiumViewerProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const viewerRef      = useRef<Cesium.Viewer | null>(null);
  const pointsRef      = useRef<Cesium.PointPrimitiveCollection | null>(null);
  /** Map from point primitive id → tree feature id */
  const pointIdMapRef  = useRef<Map<string, string>>(new Map());

  const setFlyToHandler = useSceneStore((s) => s.setFlyToHandler);

  // ── Initialise viewer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    // Silence Ion telemetry — we use OSM, token is optional
    Cesium.Ion.defaultAccessToken = process.env.CESIUM_ION_TOKEN ?? '';

    const viewer = new Cesium.Viewer(containerRef.current, {
      // OSM imagery — no Ion token required
      imageryProvider: new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      }),
      // Disable terrain (use flat ellipsoid) until a terrain provider is configured
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      // Hide all default toolbar widgets — PalmScene provides its own UI
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      geocoder: false,
      selectionIndicator: false,
      creditContainer: document.createElement('div'), // suppress credits overlay
    });

    // Dark background to match PalmScene palette
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a140a');

    // Make sure the underlying canvas fills the container
    viewer.canvas.style.width  = '100%';
    viewer.canvas.style.height = '100%';

    viewerRef.current = viewer;

    // ── Register flyTo handler in store ───────────────────────────────────
    const flyToCoords = (lng: number, lat: number, height = 500) => {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lng, lat, height),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 1.5,
      });
    };
    setFlyToHandler(flyToCoords);

    // ── Click handler ─────────────────────────────────────────────────────
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(movement.position);
      if (Cesium.defined(picked) && picked.id) {
        const primitiveId: string | undefined =
          typeof picked.id === 'string' ? picked.id : picked.id?.id;
        if (primitiveId) {
          const treeId = pointIdMapRef.current.get(primitiveId);
          if (treeId && onTreeSelect) {
            onTreeSelect(treeId);
          }
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current  = null;
      pointsRef.current  = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Register onTreeSelect changes without re-initialising ─────────────────
  const onTreeSelectRef = useRef(onTreeSelect);
  useEffect(() => {
    onTreeSelectRef.current = onTreeSelect;
  }, [onTreeSelect]);

  // ── Render boundary ────────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !boundary) return;

    // Remove any previous boundary entities
    viewer.entities.removeAll();

    const outerRing = boundary.coordinates[0];
    if (!outerRing || outerRing.length === 0) return;

    const positions = ringToCartesians(outerRing);

    viewer.entities.add({
      name: `plantation-${plantationId}-boundary`,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(positions),
        material: Cesium.Color.fromCssColorString('#4caf50').withAlpha(0.12),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#4caf50').withAlpha(0.8),
        outlineWidth: 2,
        // Clamp to terrain (flat ellipsoid for now)
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    // Fly camera to fit the boundary on first load
    const cartographics = outerRing.map(([lng, lat]) =>
      Cesium.Cartographic.fromDegrees(lng, lat)
    );
    const rect = Cesium.Rectangle.fromCartographicArray(cartographics);
    viewer.camera.flyTo({
      destination: rect,
      duration: 1.5,
    });
  }, [boundary, plantationId]);

  // ── Render tree points ─────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Remove the old collection if it exists
    if (pointsRef.current) {
      viewer.scene.primitives.remove(pointsRef.current);
      pointsRef.current = null;
    }
    pointIdMapRef.current.clear();

    if (treeFeatures.length === 0) return;

    const collection = new Cesium.PointPrimitiveCollection();

    treeFeatures.forEach((tree) => {
      const [lng, lat] = tree.coordinates;
      const pointId    = `cesium-tree-${tree.id}`;

      collection.add({
        id: pointId,
        position: Cesium.Cartesian3.fromDegrees(lng, lat, 0),
        color: healthToColor(tree.health),
        pixelSize: 8,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.6),
        outlineWidth: 1,
        // Raise slightly so points are visible above the ground plane
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      });

      pointIdMapRef.current.set(pointId, tree.id);
    });

    viewer.scene.primitives.add(collection);
    pointsRef.current = collection;
  }, [treeFeatures]);

  // ── Resize observer — keep Cesium canvas in sync with container ───────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      viewerRef.current?.resize();
    });
    ro.observe(container);

    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
      // Prevent Cesium widget CSS from leaking outside this element
      data-palmscene-cesium
    />
  );
}
