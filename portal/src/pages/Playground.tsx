import { useCallback, useEffect, useMemo, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  Code2,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RotateCcw,
} from "lucide-react";
import { ActionIcon, cn, Select, TextArea } from "slate-ui";
import { toast } from "sonner";

import {
  createPlayground,
  getDefaultProps,
  getPlaygroundPresets,
  type Playground,
  PLAYGROUND_METADATA,
  type PlaygroundId,
  PlaygroundRenderer,
} from "../components/playground";

const STORAGE_KEY = "playground-state";

interface StoredPlaygroundState {
  playgroundType: PlaygroundId;
  props: Playground;
  presetId: string | null;
}

function loadFromStorage(): StoredPlaygroundState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as StoredPlaygroundState;
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
}

function saveToStorage(state: StoredPlaygroundState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function Playground() {
  // Load initial state from localStorage or use defaults
  const [selectedPlaygroundType, setSelectedPlaygroundType] =
    useState<PlaygroundId>(() => {
      const stored = loadFromStorage();
      return stored?.playgroundType ?? "number-line";
    });
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(
    () => {
      const stored = loadFromStorage();
      return stored?.presetId ?? "default";
    }
  );
  const [propsJson, setPropsJson] = useState<string>(() => {
    const stored = loadFromStorage();
    return JSON.stringify(
      stored?.props ?? getDefaultProps("number-line"),
      null,
      2
    );
  });
  const [currentProps, setCurrentProps] = useState<Playground>(() => {
    const stored = loadFromStorage();
    return stored?.props ?? getDefaultProps("number-line");
  });
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(true);

  // Save state to localStorage when it changes
  useEffect(() => {
    saveToStorage({
      playgroundType: selectedPlaygroundType,
      props: currentProps,
      presetId: selectedPresetId,
    });
  }, [selectedPlaygroundType, currentProps, selectedPresetId]);

  // Get presets for current playground
  const presets = useMemo(
    () => getPlaygroundPresets(selectedPlaygroundType),
    [selectedPlaygroundType]
  );

  const presetItems = useMemo(
    () => presets.map((p) => ({ id: p.id, name: p.name })),
    [presets]
  );

  const handlePlaygroundChange = useCallback(
    (playgroundTypeId: PlaygroundId) => {
      setSelectedPlaygroundType(playgroundTypeId);
      const playgroundPresets = getPlaygroundPresets(playgroundTypeId);
      const defaultProps =
        playgroundPresets.length > 0
          ? createPlayground(
              playgroundTypeId,
              playgroundPresets[0].config,
              playgroundPresets[0].state
            )
          : getDefaultProps(playgroundTypeId);
      setPropsJson(JSON.stringify(defaultProps, null, 2));
      setCurrentProps(defaultProps);
      setSelectedPresetId(
        playgroundPresets.length > 0 ? playgroundPresets[0].id : null
      );
      setJsonError(null);
    },
    []
  );

  const handlePresetChange = useCallback(
    (presetId: string | null) => {
      if (!presetId) return;
      setSelectedPresetId(presetId);
      const preset = presets.find((p) => p.id === presetId);
      if (preset) {
        const props = createPlayground(
          selectedPlaygroundType,
          preset.config,
          preset.state
        );
        setPropsJson(JSON.stringify(props, null, 2));
        setCurrentProps(props);
        setJsonError(null);
      }
    },
    [presets, selectedPlaygroundType]
  );

  const handleJsonChange = useCallback((value: string) => {
    setPropsJson(value);
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }, []);

  const handleApply = useCallback(() => {
    try {
      const parsed = JSON.parse(propsJson) as Playground;
      setCurrentProps(parsed);
      setJsonError(null);
      toast.success("Props applied");
    } catch (e) {
      setJsonError((e as Error).message);
      toast.error("Invalid JSON");
    }
  }, [propsJson]);

  const handleReset = useCallback(() => {
    // Find the currently selected preset, or fall back to playground defaults
    const preset = presets.find((p) => p.id === selectedPresetId);
    const resetProps = preset
      ? createPlayground(selectedPlaygroundType, preset.config, preset.state)
      : getDefaultProps(selectedPlaygroundType);
    setPropsJson(JSON.stringify(resetProps, null, 2));
    setCurrentProps(resetProps);
    setJsonError(null);
    toast.success(
      preset ? `Reset to "${preset.name}" preset` : "Reset to defaults"
    );
  }, [selectedPlaygroundType, selectedPresetId, presets]);

  const handlePlaygroundChange2 = useCallback(
    (updatedPlayground: Playground) => {
      setCurrentProps(updatedPlayground);
      setPropsJson(JSON.stringify(updatedPlayground, null, 2));
    },
    []
  );

  return (
    <div className="h-screen bg-neutral-100 flex flex-col overflow-hidden">
      {/* Top bar - Playground switcher */}
      <div className="bg-white shrink-0 border-b">
        <div className="flex items-center gap-2 overflow-x-auto px-4 py-3">
          {PLAYGROUND_METADATA.map((playground) => (
            <button
              key={playground.id}
              onClick={() =>
                handlePlaygroundChange(playground.id as PlaygroundId)
              }
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors border rounded-lg",
                selectedPlaygroundType === playground.id
                  ? "bg-blue-50 text-blue-700"
                  : "text-neutral-600 hover:bg-neutral-50"
              )}
            >
              <span className="text-lg">{playground.icon}</span>
              <span>{playground.name}</span>
              <span className="text-[10px] text-neutral-400 ml-1">
                {playground.grades}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Playground canvas */}

        {/* Playground component */}
        <div className="flex-1 bg-white h-full">
          <PlaygroundRenderer
            playground={currentProps}
            onChange={handlePlaygroundChange2}
          />
        </div>

        {/* Open editor button (when closed) */}
        {!showEditor && (
          <div className="absolute right-4 top-4 z-10">
            <ActionIcon
              onClick={() => setShowEditor(true)}
              icon={PanelRightOpen}
              title="Open editor"
            />
          </div>
        )}

        {/* JSON Editor sidebar */}
        <AnimatePresence>
          {showEditor && (
            <motion.div
              className="w-[400px] bg-white flex flex-col shrink-0 border-l"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Editor header */}
              <div className="px-4 py-3 flex items-center justify-between shrink-0 border-b">
                <div className="flex items-center gap-1.5 text-sm font-medium text-neutral-900">
                  <Code2 size={14} />
                  Props
                </div>
                <div className="flex items-center gap-1">
                  <ActionIcon
                    onClick={handleApply}
                    variant="subtle"
                    icon={Play}
                    title="Apply changes"
                    disabled={!!jsonError}
                  />
                  <ActionIcon
                    onClick={handleReset}
                    variant="subtle"
                    icon={RotateCcw}
                    title="Reset to defaults"
                  />
                  <ActionIcon
                    onClick={() => setShowEditor(false)}
                    variant="subtle"
                    icon={PanelRightClose}
                    title="Close editor"
                  />
                </div>
              </div>

              {/* Preset selector */}
              {presets.length > 0 && (
                <div className="px-4 pt-4 shrink-0">
                  <label className="text-xs font-medium text-neutral-500 mb-1.5 block">
                    Preset
                  </label>
                  <Select
                    items={presetItems}
                    value={selectedPresetId}
                    onChange={handlePresetChange}
                    placeholder="Select a preset..."
                  />
                </div>
              )}

              {/* JSON textarea */}
              <div className="flex-1 p-4 overflow-hidden flex flex-col min-h-0">
                <TextArea
                  value={propsJson}
                  onChange={handleJsonChange}
                  className={cn(
                    "flex-1 font-mono text-xs resize-none min-h-[200px]",
                    jsonError ? "border-red-300" : undefined
                  )}
                  placeholder="Enter JSON props..."
                />
                {jsonError && (
                  <div className="mt-2 text-xs text-red-500 bg-red-50 p-2 rounded">
                    {jsonError}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
