/**
 * useLDrawModel - Custom hook for loading and caching LDraw models
 * 
 * Features:
 * - Model caching to avoid reloading
 * - Progress tracking
 * - Error handling
 */

import { useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { LDrawLoader } from "three/examples/jsm/loaders/LDrawLoader.js";
import { LDrawUtils } from "three/examples/jsm/utils/LDrawUtils.js";

// Global cache for loaded models
const modelCache = new Map<string, THREE.Group>();

// LDraw library path
const LDRAW_PATH = "/models/ldraw/officialLibrary/";

interface UseLDrawModelOptions {
  /** Whether to merge geometries for better performance */
  mergeGeometries?: boolean;
  /** Whether to use smooth normals */
  smoothNormals?: boolean;
  /** Scale factor for the model */
  scale?: number;
}

interface UseLDrawModelResult {
  /** The loaded model, or null if still loading */
  model: THREE.Group | null;
  /** Whether the model is currently loading */
  isLoading: boolean;
  /** Loading progress (0-1) */
  progress: number;
  /** Error if loading failed */
  error: Error | null;
  /** Number of building steps in the model */
  totalSteps: number;
  /** Reload the model */
  reload: () => void;
}

export function useLDrawModel(
  modelPath: string,
  options: UseLDrawModelOptions = {}
): UseLDrawModelResult {
  const {
    mergeGeometries = true,
    smoothNormals = true,
    scale = 100,
  } = options;

  const [model, setModel] = useState<THREE.Group | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [totalSteps, setTotalSteps] = useState(1);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const reload = useCallback(() => {
    modelCache.delete(modelPath);
    setReloadTrigger((prev) => prev + 1);
  }, [modelPath]);

  useEffect(() => {
    let cancelled = false;

    // Check cache first
    const cached = modelCache.get(modelPath);
    if (cached) {
      setModel(cached.clone());
      setTotalSteps(cached.userData.numBuildingSteps || 1);
      setIsLoading(false);
      setProgress(1);
      return;
    }

    setIsLoading(true);
    setProgress(0);
    setError(null);

    const loader = new LDrawLoader();
    loader.smoothNormals = smoothNormals;

    loader
      .setPath(LDRAW_PATH)
      .load(
        modelPath,
        (group: THREE.Group) => {
          if (cancelled) return;

          // Rotate from LDraw coordinates
          group.rotation.x = Math.PI;

          // Merge geometries if requested
          const processedModel = mergeGeometries 
            ? LDrawUtils.mergeObject(group) 
            : group;

          // Center the model
          const box = new THREE.Box3().setFromObject(processedModel);
          const center = box.getCenter(new THREE.Vector3());
          processedModel.position.sub(center);

          // Scale to fit view
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const modelScale = scale / maxDim;
          processedModel.scale.setScalar(modelScale);

          // Store total steps
          const numSteps = group.userData.numBuildingSteps || 1;
          processedModel.userData.numBuildingSteps = numSteps;

          // Cache the model
          modelCache.set(modelPath, processedModel);

          setModel(processedModel.clone());
          setTotalSteps(numSteps);
          setIsLoading(false);
          setProgress(1);
        },
        (progressEvent: ProgressEvent) => {
          if (cancelled) return;
          if (progressEvent.lengthComputable) {
            setProgress(progressEvent.loaded / progressEvent.total);
          }
        },
        (err: unknown) => {
          if (cancelled) return;
          console.error("Error loading LDraw model:", err);
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      );

    return () => {
      cancelled = true;
    };
  }, [modelPath, mergeGeometries, smoothNormals, scale, reloadTrigger]);

  return {
    model,
    isLoading,
    progress,
    error,
    totalSteps,
    reload,
  };
}

/**
 * Clear all cached models
 */
export function clearModelCache(): void {
  modelCache.forEach((model) => {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
  });
  modelCache.clear();
}

/**
 * Preload a model into the cache
 */
export async function preloadModel(modelPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const loader = new LDrawLoader();
    loader.smoothNormals = true;

    loader
      .setPath(LDRAW_PATH)
      .load(
        modelPath,
        (group: THREE.Group) => {
          group.rotation.x = Math.PI;
          const merged = LDrawUtils.mergeObject(group);
          
          const box = new THREE.Box3().setFromObject(merged);
          const center = box.getCenter(new THREE.Vector3());
          merged.position.sub(center);
          
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          merged.scale.setScalar(100 / maxDim);
          
          merged.userData.numBuildingSteps = group.userData.numBuildingSteps || 1;
          
          modelCache.set(modelPath, merged);
          resolve();
        },
        undefined,
        reject
      );
  });
}
