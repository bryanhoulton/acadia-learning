/**
 * VehicleModel - Three.js component for loading and displaying LDraw models
 * 
 * Features:
 * - Loads packed LDraw .mpd files
 * - Renders with edge lines (no conditional lines)
 * - Supports part selection via click
 * - Part color customization
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { LDrawLoader } from "three/examples/jsm/loaders/LDrawLoader.js";
import { LDrawConditionalLineMaterial } from "three/examples/jsm/materials/LDrawConditionalLineMaterial.js";

export interface SelectedPart {
  mesh: THREE.Mesh;
  name: string;
  color: string;
}

interface VehicleModelProps {
  modelPath: string;
  buildingStep: number;
  onTotalStepsChange?: (steps: number) => void;
  bodyColor?: string;
  onError?: (error: Error) => void;
  onPartSelect?: (part: SelectedPart | null) => void;
  selectedPartColor?: string | null;
}

// Common LDraw part names for friendly display
const PART_NAMES: Record<string, string> = {
  '3001': 'Brick 2x4',
  '3002': 'Brick 2x3',
  '3003': 'Brick 2x2',
  '3004': 'Brick 1x2',
  '3005': 'Brick 1x1',
  '3010': 'Brick 1x4',
  '3020': 'Plate 2x4',
  '3021': 'Plate 2x3',
  '3022': 'Plate 2x2',
  '3023': 'Plate 1x2',
  '3024': 'Plate 1x1',
  '3037': 'Slope 45 2x4',
  '3039': 'Slope 45 2x2',
  '3040': 'Slope 45 1x2',
  '3068': 'Tile 2x2',
  '3069': 'Tile 1x2',
  '3070': 'Tile 1x1',
  '4624': 'Wheel Rim',
  '6014': 'Wheel Rim',
  '30027': 'Wheel',
  '50950': 'Slope Curved 3x1',
  '61678': 'Slope Curved 4x1',
  '85984': 'Slope 30 1x2',
};

export function VehicleModel({
  modelPath,
  buildingStep,
  onTotalStepsChange,
  bodyColor,
  onError,
  onPartSelect,
  selectedPartColor,
}: VehicleModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [model, setModel] = useState<THREE.Group | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [totalSteps, setTotalSteps] = useState(1);
  const [selectedMesh, setSelectedMesh] = useState<THREE.Mesh | null>(null);
  const originalColorsRef = useRef<Map<string, THREE.Color>>(new Map());
  
  const { raycaster, camera, gl } = useThree();
  const mouseRef = useRef(new THREE.Vector2());

  // Get friendly part name
  const getPartName = useCallback((mesh: THREE.Mesh): string => {
    let node: THREE.Object3D | null = mesh;
    while (node) {
      if (node.userData?.partName) {
        return node.userData.partName;
      }
      if (node.userData?.fileName) {
        return node.userData.fileName;
      }
      node = node.parent;
    }
    return mesh.name || 'Part';
  }, []);

  const formatPartName = useCallback((name: string): string => {
    if (!name) return 'Unknown';
    
    let clean = name.replace(/^.*[/\\]/, '').replace(/\.(dat|ldr|mpd)$/i, '');
    clean = clean.replace(/^(parts\/|p\/|models\/)/, '');
    
    // Try to look up a friendly name
    const partNum = clean.match(/^(\d+)/);
    if (partNum && PART_NAMES[partNum[1]]) {
      return PART_NAMES[partNum[1]];
    }
    
    for (const [num, friendlyName] of Object.entries(PART_NAMES)) {
      if (clean.includes(num)) {
        return friendlyName;
      }
    }
    
    if (clean.length > 25) {
      clean = clean.slice(0, 22) + '...';
    }
    return clean;
  }, []);

  // Handle click for part selection
  const handleClick = useCallback((event: MouseEvent) => {
    if (!model || !onPartSelect) return;
    
    const rect = gl.domElement.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouseRef.current, camera);
    const intersects = raycaster.intersectObject(model, true);
    
    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh;
      if (mesh.isMesh) {
        setSelectedMesh(mesh);
        
        // Get color
        let colorHex = '#666666';
        if (mesh.material) {
          const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          if ((mat as THREE.MeshStandardMaterial).color) {
            colorHex = '#' + (mat as THREE.MeshStandardMaterial).color.getHexString().toUpperCase();
          }
        }
        
        onPartSelect({
          mesh,
          name: formatPartName(getPartName(mesh)),
          color: colorHex,
        });
        return;
      }
    }
    
    // Clicked outside - clear selection
    setSelectedMesh(null);
    onPartSelect(null);
  }, [model, onPartSelect, raycaster, camera, gl, formatPartName, getPartName]);

  // Add click listener
  useEffect(() => {
    if (!onPartSelect) return;
    
    gl.domElement.addEventListener('click', handleClick);
    return () => {
      gl.domElement.removeEventListener('click', handleClick);
    };
  }, [gl, handleClick, onPartSelect]);

  // Apply color to selected part
  useEffect(() => {
    if (!selectedMesh || !selectedPartColor) return;
    
    const newColor = new THREE.Color(selectedPartColor);
    
    if (selectedMesh.material) {
      // Clone material so we only affect this mesh
      if (Array.isArray(selectedMesh.material)) {
        selectedMesh.material = selectedMesh.material.map(mat => {
          const cloned = mat.clone();
          if ((cloned as THREE.MeshStandardMaterial).color) {
            (cloned as THREE.MeshStandardMaterial).color.copy(newColor);
          }
          return cloned;
        });
      } else {
        const cloned = selectedMesh.material.clone();
        if ((cloned as THREE.MeshStandardMaterial).color) {
          (cloned as THREE.MeshStandardMaterial).color.copy(newColor);
        }
        selectedMesh.material = cloned;
      }
    }
  }, [selectedMesh, selectedPartColor]);

  // Load the model
  useEffect(() => {
    let cancelled = false;
    
    const loader = new LDrawLoader();
    loader.smoothNormals = true;
    loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
    
    // Load from root public folder
    loader.setPath('/');
    
    console.log("[LDraw] Loading model:", modelPath);
    
    loader.load(
      modelPath,
      (group: THREE.Group) => {
        if (cancelled) return;
        
        console.log("[LDraw] Model loaded successfully");
        
        // Rotate from LDraw coordinates
        group.rotation.x = Math.PI;
        
        // Store original colors and configure visibility
        originalColorsRef.current.clear();
        group.traverse((child) => {
          // Store original colors
          if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
            const mesh = child as THREE.Mesh;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach(mat => {
              if ((mat as THREE.MeshStandardMaterial).color && !originalColorsRef.current.has(mat.uuid)) {
                originalColorsRef.current.set(mat.uuid, (mat as THREE.MeshStandardMaterial).color.clone());
              }
            });
          }
          
          // Hide conditional lines, show edge lines
          if ((child as THREE.LineSegments).isLineSegments) {
            const lineObj = child as THREE.LineSegments & { isConditionalLine?: boolean };
            if (lineObj.isConditionalLine) {
              lineObj.visible = false; // Hide conditional lines
            } else {
              lineObj.visible = true; // Show edge lines
            }
          }
        });
        
        // Center the model
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        group.position.sub(center);
        
        // Scale to fit view
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = maxDim > 0 ? 100 / maxDim : 1;
        group.scale.setScalar(scale);
        
        // Get total building steps
        const numSteps = group.userData.numBuildingSteps || 1;
        setTotalSteps(numSteps);
        onTotalStepsChange?.(numSteps);
        
        setModel(group);
      },
      (progress: ProgressEvent) => {
        if (progress.lengthComputable) {
          console.log(`[LDraw] Loading: ${Math.round((progress.loaded / progress.total) * 100)}%`);
        }
      },
      (error: unknown) => {
        if (cancelled) return;
        console.error("[LDraw] Error loading model:", error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        onError?.(error instanceof Error ? error : new Error(errorMsg));
      }
    );

    return () => {
      cancelled = true;
      setSelectedMesh(null);
    };
  }, [modelPath, onTotalStepsChange, onError]);

  // Update building step visibility
  useEffect(() => {
    if (!model) return;
    
    model.traverse((child) => {
      if (child instanceof THREE.Group && child.userData.buildingStep !== undefined) {
        child.visible = child.userData.buildingStep <= buildingStep;
      }
    });
  }, [model, buildingStep]);

  // Subtle idle animation
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 2;
    }
  });

  // Show placeholder while loading
  if (!model) {
    return (
      <group ref={groupRef}>
        <mesh position={[0, 10, 0]}>
          <boxGeometry args={[60, 20, 30]} />
          <meshStandardMaterial color={bodyColor || "#C91A09"} />
        </mesh>
        <mesh position={[5, 25, 0]}>
          <boxGeometry args={[30, 15, 25]} />
          <meshStandardMaterial color={bodyColor || "#C91A09"} />
        </mesh>
        <mesh position={[-20, 0, 18]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[8, 8, 5, 16]} />
          <meshStandardMaterial color="#1b1b1b" />
        </mesh>
        <mesh position={[-20, 0, -18]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[8, 8, 5, 16]} />
          <meshStandardMaterial color="#1b1b1b" />
        </mesh>
        <mesh position={[20, 0, 18]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[8, 8, 5, 16]} />
          <meshStandardMaterial color="#1b1b1b" />
        </mesh>
        <mesh position={[20, 0, -18]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[8, 8, 5, 16]} />
          <meshStandardMaterial color="#1b1b1b" />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={groupRef}>
      <primitive object={model} />
    </group>
  );
}
