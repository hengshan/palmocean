import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RobotState {
  position: [number, number, number];
  status: "idle" | "moving" | "harvesting";
  battery: number;
  taskDescription?: string;
}

/** Minimal GeoJSON Feature shape (avoids importing the full @types/geojson). */
export interface TreeGeoFeature {
  type: "Feature";
  id?: string | number;
  geometry: {
    type: "Point";
    coordinates: [number, number] | [number, number, number];
  };
  properties: Record<string, unknown> | null;
}

// ─── Store interface ──────────────────────────────────────────────────────────

export interface SceneStore {
  // Plantation scene state
  selectedPlantationId: string | null;
  sceneVisible: boolean;

  // Camera
  cameraPosition: [number, number, number];

  // Selected asset in scene
  selectedAssetId: string | null;

  // Robot states (live from WebSocket)
  robotStates: Record<string, RobotState>;

  // ── CesiumJS additions ──────────────────────────────────────────────────

  /**
   * GeoJSON point features representing trees in the active plantation.
   * Populated by the plantation data loader; consumed by CesiumViewer.
   */
  treeFeatures: TreeGeoFeature[];

  /**
   * Camera flyTo handler registered by CesiumViewer on mount.
   * Calling this animates the Cesium camera to the given geo-coordinates.
   * `null` when CesiumViewer is not mounted.
   */
  flyToCoords: ((lng: number, lat: number, height?: number) => void) | null;

  // ── Actions ─────────────────────────────────────────────────────────────

  openScene: (plantationId: string) => void;
  closeScene: () => void;
  setCameraPosition: (pos: [number, number, number]) => void;
  selectAsset: (id: string | null) => void;
  updateRobotState: (robotId: string, state: RobotState) => void;

  /** Replace the full tree feature list (e.g. after fetching plantation data). */
  setTreeFeatures: (features: TreeGeoFeature[]) => void;

  /**
   * Called by CesiumViewer on mount to register its flyTo implementation.
   * Pass `null` to deregister (on unmount).
   */
  setFlyToHandler: (fn: ((lng: number, lat: number, height?: number) => void) | null) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSceneStore = create<SceneStore>((set) => ({
  selectedPlantationId: null,
  sceneVisible: false,
  cameraPosition: [0, 30, 30],
  selectedAssetId: null,
  robotStates: {},

  // CesiumJS additions
  treeFeatures: [],
  flyToCoords: null,

  // ── Actions ─────────────────────────────────────────────────────────────

  openScene: (plantationId) =>
    set({
      selectedPlantationId: plantationId,
      sceneVisible: true,
      selectedAssetId: null,
    }),

  closeScene: () =>
    set({
      sceneVisible: false,
      selectedPlantationId: null,
      selectedAssetId: null,
      // Clear flyTo handler when scene closes
      flyToCoords: null,
    }),

  setCameraPosition: (pos) => set({ cameraPosition: pos }),

  selectAsset: (id) => set({ selectedAssetId: id }),

  updateRobotState: (robotId, state) =>
    set((s) => ({
      robotStates: { ...s.robotStates, [robotId]: state },
    })),

  setTreeFeatures: (features) => set({ treeFeatures: features }),

  setFlyToHandler: (fn) => set({ flyToCoords: fn }),
}));
