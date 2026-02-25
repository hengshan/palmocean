import { create } from "zustand";

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

  // Actions
  openScene: (plantationId: string) => void;
  closeScene: () => void;
  setCameraPosition: (pos: [number, number, number]) => void;
  selectAsset: (id: string | null) => void;
  updateRobotState: (robotId: string, state: RobotState) => void;
}

export interface RobotState {
  position: [number, number, number];
  status: "idle" | "moving" | "harvesting";
  battery: number;
  taskDescription?: string;
}

export const useSceneStore = create<SceneStore>((set) => ({
  selectedPlantationId: null,
  sceneVisible: false,
  cameraPosition: [0, 30, 30],
  selectedAssetId: null,
  robotStates: {},

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
    }),

  setCameraPosition: (pos) => set({ cameraPosition: pos }),

  selectAsset: (id) => set({ selectedAssetId: id }),

  updateRobotState: (robotId, state) =>
    set((s) => ({
      robotStates: { ...s.robotStates, [robotId]: state },
    })),
}));
