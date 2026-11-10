/**
 * BuildStep - Car configuration with weight and tire selection
 *
 * Features:
 * - Full-height 3D model view with part selection
 * - Carousel vehicle selector with left/right navigation
 * - Compact bottom bar for weight and tire selection
 * - Vehicle info as floating overlay
 * - Math-focused educational tooltips
 */

import { useCallback, useEffect, useState } from "react";

import { ChevronLeft, ChevronRight, RotateCcw, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button, cn } from "slate-ui";

import {
  COLOR_PALETTE_ORDER,
  DEFAULT_CAR_CONFIG,
  LDRAW_COLORS,
  TIRE_OPTIONS,
  VEHICLE_ARCHETYPES,
  type VehicleArchetype,
  WEIGHT_ADJUSTMENT_OPTIONS,
  weightToFraction,
} from "./data";
import type { CarConfig, StatAdjustments } from "./schema";
import { type SelectedPart, VehicleCanvas } from "./three";

// ============================================================================
// COMPACT WEIGHT SELECTOR (Pill buttons)
// ============================================================================

function CompactWeightSelector({
  adjustment,
  defaultWeight,
  onChange,
}: {
  adjustment: number;
  defaultWeight: number;
  onChange: (value: number) => void;
}) {
  const finalWeight = defaultWeight + adjustment;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">⚖️</span>
        <span className="text-sm font-bold text-purple-700">
          {finalWeight.toLocaleString()} lbs
        </span>
        <span className="text-xs text-purple-500">
          ({weightToFraction(finalWeight)})
        </span>
      </div>
      <div className="flex gap-1">
        {WEIGHT_ADJUSTMENT_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
              adjustment === option.value
                ? "bg-purple-500 text-white shadow-md"
                : "bg-white border border-gray-200 text-gray-600 hover:border-purple-300 hover:bg-purple-50"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// COMPACT TIRE SELECTOR (Pill buttons)
// ============================================================================

function CompactTireSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const selectedTire =
    TIRE_OPTIONS.find((t) => t.value === value) ?? TIRE_OPTIONS[1];

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{selectedTire.icon}</span>
        <span className="text-sm font-bold text-amber-700">
          {selectedTire.name}
        </span>
        <span className="text-xs text-amber-500">
          ({selectedTire.frictionLabel})
        </span>
      </div>
      <div className="flex gap-1">
        {TIRE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1",
              value === option.value
                ? "bg-amber-500 text-white shadow-md"
                : "bg-white border border-gray-200 text-gray-600 hover:border-amber-300 hover:bg-amber-50"
            )}
          >
            <span>{option.icon}</span>
            <span className="hidden sm:inline">
              {option.name.split(" ")[0]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// COLOR PICKER POPUP
// ============================================================================

function ColorPicker({
  selectedPart,
  onColorSelect,
  onClose,
}: {
  selectedPart: SelectedPart;
  onColorSelect: (color: string) => void;
  onClose: () => void;
}) {
  const orderedColors = COLOR_PALETTE_ORDER.map((code) =>
    LDRAW_COLORS.find((c) => c.code === code)
  ).filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 5 }}
      className="absolute bottom-3 left-3 bg-white/95 backdrop-blur rounded-xl shadow-lg border border-gray-200 p-2 z-30"
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-5 h-5 rounded border border-gray-300 flex-shrink-0"
          style={{ backgroundColor: selectedPart.color }}
        />
        <span className="text-xs text-gray-700 font-medium truncate max-w-[100px]">
          {selectedPart.name}
        </span>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-gray-100 transition-colors ml-auto"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="grid grid-cols-12 gap-1">
        {orderedColors.map((color) => (
          <button
            key={color!.code}
            onClick={() => onColorSelect(color!.hex)}
            className={cn(
              "w-5 h-5 rounded border transition-all hover:scale-110",
              selectedPart.color.toUpperCase() === color!.hex.toUpperCase()
                ? "border-purple-500 ring-1 ring-purple-300"
                : "border-gray-200 hover:border-gray-400"
            )}
            style={{ backgroundColor: color!.hex }}
            title={color!.name}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ============================================================================
// VEHICLE INFO OVERLAY (Floating on 3D view)
// ============================================================================

function VehicleInfoOverlay({ vehicle }: { vehicle: VehicleArchetype }) {
  return (
    <div className="absolute top-3 left-3 z-20">
      <AnimatePresence mode="wait">
        <motion.div
          key={vehicle.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.2 }}
          className="bg-white/95 backdrop-blur rounded-xl px-3 py-2 shadow-lg border border-gray-200"
        >
          <div className="flex items-center gap-2">
            <span className="text-2xl">{vehicle.icon}</span>
            <div>
              <h2 className="text-sm font-bold text-gray-800">
                {vehicle.name}
              </h2>
              <p className="text-xs text-gray-500">
                {vehicle.defaultWeight.toLocaleString()} lbs base
              </p>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// DOT INDICATORS
// ============================================================================

function DotIndicators({
  count,
  selectedIndex,
  onSelect,
}: {
  count: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-2 bg-white/80 backdrop-blur rounded-full px-3 py-1.5">
      {Array.from({ length: count }).map((_, idx) => (
        <button
          key={idx}
          onClick={() => onSelect(idx)}
          className={cn(
            "w-2 h-2 rounded-full transition-all",
            idx === selectedIndex
              ? "bg-amber-500 scale-125"
              : "bg-gray-400 hover:bg-gray-500"
          )}
        />
      ))}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export interface BuildStepProps {
  selectedVehicleIndex: number;
  onSelectVehicle: (index: number) => void;
  carConfig: CarConfig;
  onSetCarConfig: (
    config: CarConfig | ((prev: CarConfig) => CarConfig)
  ) => void;
  statAdjustments: StatAdjustments;
  onSetStatAdjustment: (stat: keyof StatAdjustments, value: number) => void;
  onResetAdjustments: () => void;
  onComplete: () => void;
  onUserAction: (action: string, data?: Record<string, unknown>) => void;
}

export function BuildStep({
  selectedVehicleIndex,
  onSelectVehicle,
  carConfig,
  onSetCarConfig,
  onResetAdjustments,
  onComplete,
  onUserAction,
}: BuildStepProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPart, setSelectedPart] = useState<SelectedPart | null>(null);
  const [selectedPartColor, setSelectedPartColor] = useState<string | null>(
    null
  );

  const vehicle = VEHICLE_ARCHETYPES[selectedVehicleIndex];

  // Reset when vehicle changes
  useEffect(() => {
    onResetAdjustments();
    onSetCarConfig(DEFAULT_CAR_CONFIG);
    setSelectedPart(null);
    setSelectedPartColor(null);
  }, [selectedVehicleIndex, onResetAdjustments, onSetCarConfig]);

  const handleWeightAdjustmentChange = useCallback(
    (weightAdjustment: number) => {
      const finalWeight = vehicle.defaultWeight + weightAdjustment;
      onSetCarConfig((prev: CarConfig) => ({ ...prev, weightAdjustment }));
      onUserAction("set_weight_adjustment", {
        weightAdjustment,
        defaultWeight: vehicle.defaultWeight,
        finalWeight,
        vehicleName: vehicle.name,
      });
    },
    [onSetCarConfig, onUserAction, vehicle]
  );

  const handleTireChange = useCallback(
    (tireType: number) => {
      const tireOption = TIRE_OPTIONS[tireType];
      onSetCarConfig((prev: CarConfig) => ({ ...prev, tireType }));
      onUserAction("set_tire_type", {
        tireType,
        tireName: tireOption?.name,
        frictionLabel: tireOption?.frictionLabel,
        frictionValue: tireOption?.friction,
        vehicleName: vehicle.name,
      });
    },
    [onSetCarConfig, onUserAction, vehicle.name]
  );

  const handleVehicleSelect = useCallback(
    (index: number) => {
      const selectedVehicle = VEHICLE_ARCHETYPES[index];
      onSelectVehicle(index);
      onUserAction("select_vehicle", {
        vehicleId: selectedVehicle.id,
        vehicleName: selectedVehicle.name,
        defaultWeight: selectedVehicle.defaultWeight,
      });
    },
    [onSelectVehicle, onUserAction]
  );

  const handleReset = useCallback(() => {
    onResetAdjustments();
    onSetCarConfig(DEFAULT_CAR_CONFIG);
    onUserAction("reset_build");
  }, [onResetAdjustments, onSetCarConfig, onUserAction]);

  const handleTestRun = useCallback(() => {
    onUserAction("start_simulation", {
      vehicleId: vehicle.id,
      carConfig,
    });
    onComplete();
  }, [vehicle.id, carConfig, onUserAction, onComplete]);

  const handlePartSelect = useCallback(
    (part: SelectedPart | null) => {
      setSelectedPart(part);
      setSelectedPartColor(null);
      if (part) {
        onUserAction("select_part", {
          partName: part.name,
          partColor: part.color,
        });
      }
    },
    [onUserAction]
  );

  const handleColorSelect = useCallback(
    (color: string) => {
      setSelectedPartColor(color);
      if (selectedPart) {
        setSelectedPart((prev) => (prev ? { ...prev, color } : null));
        onUserAction("paint_part", { partName: selectedPart.name, color });
      }
    },
    [selectedPart, onUserAction]
  );

  const handleCloseColorPicker = useCallback(() => {
    setSelectedPart(null);
    setSelectedPartColor(null);
  }, []);

  const goToPrev = useCallback(() => {
    const newIndex =
      selectedVehicleIndex === 0
        ? VEHICLE_ARCHETYPES.length - 1
        : selectedVehicleIndex - 1;
    handleVehicleSelect(newIndex);
  }, [selectedVehicleIndex, handleVehicleSelect]);

  const goToNext = useCallback(() => {
    const newIndex =
      selectedVehicleIndex === VEHICLE_ARCHETYPES.length - 1
        ? 0
        : selectedVehicleIndex + 1;
    handleVehicleSelect(newIndex);
  }, [selectedVehicleIndex, handleVehicleSelect]);

  // Check if config has been modified from default
  const isModified =
    carConfig.weightAdjustment !== DEFAULT_CAR_CONFIG.weightAdjustment ||
    carConfig.tireType !== DEFAULT_CAR_CONFIG.tireType;

  return (
    <div className="h-full flex flex-col p-4">
      {/* 3D Model View - takes most of the space */}
      <div className="relative flex-1 min-h-0 mb-4">
        <div className="absolute inset-0 bg-gradient-to-b from-gray-100 to-gray-200 rounded-2xl overflow-hidden shadow-inner border-4 border-white">
          <VehicleCanvas
            modelPath={vehicle.modelPath}
            buildingStep={999}
            totalSteps={1}
            bodyColor={vehicle.defaultColor}
            onLoadingChange={setIsLoading}
            onPartSelect={handlePartSelect}
            selectedPartColor={selectedPartColor}
          />
        </div>

        {/* Vehicle Info Overlay - top left */}
        <VehicleInfoOverlay vehicle={vehicle} />

        {/* Navigation arrows */}
        <button
          onClick={goToPrev}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/90 shadow-lg border-2 border-gray-200 flex items-center justify-center hover:bg-white hover:border-amber-400 hover:scale-110 transition-all"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>

        <button
          onClick={goToNext}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/90 shadow-lg border-2 border-gray-200 flex items-center justify-center hover:bg-white hover:border-amber-400 hover:scale-110 transition-all"
        >
          <ChevronRight className="w-5 h-5 text-gray-700" />
        </button>

        {/* Dot indicators */}
        <DotIndicators
          count={VEHICLE_ARCHETYPES.length}
          selectedIndex={selectedVehicleIndex}
          onSelect={handleVehicleSelect}
        />

        {/* Part selection hint or color picker */}
        <AnimatePresence mode="wait">
          {selectedPart ? (
            <ColorPicker
              key="color-picker"
              selectedPart={selectedPart}
              onColorSelect={handleColorSelect}
              onClose={handleCloseColorPicker}
            />
          ) : (
            <motion.div
              key="hint"
              className="absolute top-3 right-3 bg-white/90 backdrop-blur rounded-lg px-2 py-1 shadow-lg border border-amber-200 z-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: isLoading ? 0 : 1 }}
              transition={{ delay: 0.5 }}
            >
              <p className="text-xs text-gray-600">
                <span className="font-bold text-purple-600">
                  Click any part
                </span>{" "}
                to paint
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Compact Bottom Bar - Configuration and Actions */}
      <div className="bg-white/95 backdrop-blur rounded-xl p-3 shadow-lg border border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Weight and Tire Selectors */}
          <div className="flex flex-wrap items-center gap-4">
            <CompactWeightSelector
              adjustment={carConfig.weightAdjustment}
              defaultWeight={vehicle.defaultWeight}
              onChange={handleWeightAdjustmentChange}
            />
            <div className="w-px h-8 bg-gray-200 hidden sm:block" />
            <CompactTireSelector
              value={carConfig.tireType}
              onChange={handleTireChange}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="subtle"
              size="sm"
              onClick={handleReset}
              iconLeft={RotateCcw}
              disabled={!isModified}
            >
              Reset
            </Button>

            <button
              onClick={handleTestRun}
              className="flex items-center justify-center gap-2 font-bold px-5 py-2.5 rounded-xl shadow-lg transition-all bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white hover:shadow-xl transform hover:scale-[1.02]"
            >
              <Zap className="w-4 h-4" />
              Race!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
