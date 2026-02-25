/**
 * Plantation data types — shared between PalmView (2D map) and PalmScene (3D).
 * Matches backend Plantation API response schema.
 */

export interface Plantation {
  id: string;
  name: string;
  description: string | null;
  location: GeoJSON.Point;
  boundary: GeoJSON.Polygon;
  area_hectares: number;
  tree_count: number;
  health_score: number; // 0-1
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  assets?: PlantationAsset[];
}

export interface PlantationAsset {
  id: string;
  plantation_id: string;
  asset_type: "palm_tree" | "robot" | "building" | "sensor";
  position: { x: number; y: number; z: number };
  asset_metadata: Record<string, unknown>;
  model_url: string | null;
  created_at: string;
}

/**
 * Context passed from PalmView map click → PalmScene modal.
 */
export interface PlantationSceneContext {
  plantation: Plantation;
  assets: PlantationAsset[];
  /** Initial camera focus point (center of boundary) */
  focusPoint: [number, number, number];
}

/**
 * Calculate center point from GeoJSON Polygon boundary.
 */
export function getBoundaryCenter(boundary: GeoJSON.Polygon): [number, number] {
  const coords = boundary.coordinates[0];
  const len = coords.length;
  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of coords) {
    sumLng += lng;
    sumLat += lat;
  }
  return [sumLng / len, sumLat / len];
}

/**
 * Approximate area dimensions in meters from GeoJSON Polygon
 * (for sizing the 3D ground plane).
 */
export function getBoundaryDimensions(boundary: GeoJSON.Polygon): {
  width: number;
  height: number;
} {
  const coords = boundary.coordinates[0];
  const lngs = coords.map(([lng]) => lng);
  const lats = coords.map(([, lat]) => lat);
  const lngSpan = Math.max(...lngs) - Math.min(...lngs);
  const latSpan = Math.max(...lats) - Math.min(...lats);
  // Rough conversion: 1 degree ≈ 111km at equator
  const width = lngSpan * 111_000 * Math.cos(((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180));
  const height = latSpan * 111_000;
  return { width, height };
}
