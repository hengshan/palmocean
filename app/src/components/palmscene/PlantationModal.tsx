"use client";

import React, { Suspense, lazy, useEffect, useState } from "react";
import { useSceneStore } from "@/lib/store/sceneStore";
import type { Plantation, PlantationAsset } from "@/lib/plantation";

// Lazy load PalmScene (three.js is heavy, ~1MB)
const PalmScene = lazy(() => import("./PalmScene"));

interface PlantationModalProps {
  plantationId: string;
  onClose: () => void;
}

export default function PlantationModal({
  plantationId,
  onClose,
}: PlantationModalProps) {
  const [plantation, setPlantation] = useState<Plantation | null>(null);
  const [assets, setAssets] = useState<PlantationAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(`/api/plantations/${plantationId}`);
        if (!res.ok) throw new Error(`Failed to fetch plantation: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setPlantation(data);
        setAssets(data.assets ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [plantationId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-[90vw] h-[80vh] rounded-xl overflow-hidden bg-gray-900 shadow-2xl">
        {/* Loading / Error states */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <div className="text-center">
              <div className="animate-spin w-10 h-10 border-4 border-white/30 border-t-white rounded-full mb-4 mx-auto" />
              <p className="text-lg">Loading plantation...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-red-400">
            <div className="text-center">
              <p className="text-lg mb-2">⚠️ {error}</p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* 3D Scene */}
        {!loading && !error && plantation && (
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <p>Loading 3D scene...</p>
              </div>
            }
          >
            <PalmScene
              plantationId={plantationId}
              boundary={plantation.boundary}
              onClose={onClose}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
