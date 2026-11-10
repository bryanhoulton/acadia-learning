/**
 * VehicleCanvas - React Three Fiber Canvas wrapper for the 3D vehicle viewer
 *
 * Provides:
 * - Large canvas for prominent model display
 * - Bright environment lighting
 * - Smooth OrbitControls for rotation
 * - Part selection via click
 * - Loading state handling
 * - WebGL fallback detection
 */

import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react';

import { LoaderCircle } from 'lucide-react';

import {
  ContactShadows,
  Environment,
  OrbitControls,
} from '@react-three/drei';
import { Canvas } from '@react-three/fiber';

import {
  type SelectedPart,
  VehicleModel,
} from './VehicleModel';

interface VehicleCanvasProps {
  /** Path to the LDraw model file */
  modelPath: string;
  /** Current building step (0 to totalSteps-1) */
  buildingStep: number;
  /** Total number of building steps */
  totalSteps: number;
  /** Callback when total steps is determined from model */
  onTotalStepsChange?: (steps: number) => void;
  /** Body color override */
  bodyColor?: string;
  /** Whether the model is currently loading */
  onLoadingChange?: (loading: boolean) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Callback when a part is selected */
  onPartSelect?: (part: SelectedPart | null) => void;
  /** Color to apply to selected part */
  selectedPartColor?: string | null;
  /** Custom container class name */
  containerClassName?: string;
}

function LoadingFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
      <div className="flex flex-col items-center gap-3">
        <LoaderCircle className="w-10 h-10 animate-spin text-yellow-500" />
        <span className="text-sm text-gray-500 font-medium">
          Loading vehicle...
        </span>
      </div>
    </div>
  );
}

function WebGLNotSupported() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
      <div className="text-center p-4">
        <p className="text-gray-600 mb-2 font-medium">3D view not available</p>
        <p className="text-sm text-gray-500">
          Your browser doesn't support WebGL
        </p>
      </div>
    </div>
  );
}

export function VehicleCanvas({
  modelPath,
  buildingStep,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  totalSteps,
  onTotalStepsChange,
  bodyColor,
  onLoadingChange,
  onError,
  onPartSelect,
  selectedPartColor,
  containerClassName,
}: VehicleCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webGLSupported, setWebGLSupported] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Check WebGL support
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      setWebGLSupported(!!gl);
    } catch {
      setWebGLSupported(false);
    }
  }, []);

  // Notify parent of loading state
  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  if (!webGLSupported) {
    return (
      <div
        ref={containerRef}
        className={
          containerClassName ??
          "relative w-full h-full rounded-2xl overflow-hidden"
        }
      >
        <WebGLNotSupported />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={
        containerClassName ??
        "relative w-full h-full rounded-2xl overflow-hidden"
      }
    >
      {isLoading && <LoadingFallback />}

      <Canvas
        camera={{ position: [100, 40, 100], fov: 45, near: 1, far: 10000 }}
        gl={{ antialias: true, alpha: true }}
        onCreated={() => setIsLoading(false)}
      >
        {/* Bright ambient lighting */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 15, 10]} intensity={1} castShadow />
        <directionalLight position={[-10, 10, -5]} intensity={0.5} />
        <hemisphereLight intensity={0.3} />

        {/* Environment for reflections - using studio for brighter look */}
        <Environment preset="studio" />

        {/* Ground shadow */}
        <ContactShadows
          position={[0, -40, 0]}
          opacity={0.3}
          scale={150}
          blur={2}
          far={80}
        />

        {/* Vehicle model */}
        <Suspense fallback={null}>
          <VehicleModel
            modelPath={modelPath}
            buildingStep={buildingStep}
            onTotalStepsChange={onTotalStepsChange}
            bodyColor={bodyColor}
            onError={onError}
            onPartSelect={onPartSelect}
            selectedPartColor={selectedPartColor}
          />
        </Suspense>

        {/* Controls - target below model center to push it higher in view */}
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={60}
          maxDistance={250}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.2}
          autoRotate={true}
          autoRotateSpeed={0.8}
          target={[0, -30, 0]}
        />
      </Canvas>
    </div>
  );
}
