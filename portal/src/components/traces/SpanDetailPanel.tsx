import {
  useEffect,
  useRef,
  useState,
} from 'react';

import { format } from 'date-fns';
import { motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  Flag,
  FlaskConical,
  Loader2,
  Mic,
  Pause,
  Play,
  X,
} from 'lucide-react';
import {
  ActionIcon,
  Button,
  cn,
  TextArea,
} from 'slate-ui';
import { toast } from 'sonner';

import client from '../../utils/api';
import { ResizeHandle } from './ResizeHandle';
import { Span } from './types';
import {
  copyToClipboard,
  countTokens,
  formatDuration,
  SPAN_TYPE_CONFIG,
} from './utils';

interface SpanDetailPanelProps {
  span: Span;
  onClose: () => void;
  width?: number;
  onResize?: (delta: number) => void;
  onSpanUpdate?: (updatedSpan: Span) => void;
}

export function SpanDetailPanel({
  span,
  onClose,
  width = 384,
  onResize,
  onSpanUpdate,
}: SpanDetailPanelProps) {
  const typeConfig = SPAN_TYPE_CONFIG[span.span_type] || SPAN_TYPE_CONFIG.text;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Full span data (includes audio_data)
  const [fullSpan, setFullSpan] = useState<Span>(span);
  const [loadingFullSpan, setLoadingFullSpan] = useState(false);

  // Fetch full span details (including audio_data) on mount
  useEffect(() => {
    const fetchFullSpan = async () => {
      // Skip if we already have audio_data or no audio to load
      if (span.audio_data || !span.audio_duration_ms) return;

      setLoadingFullSpan(true);
      try {
        const { data } = await client.GET("/api/tracing/spans/{span_id}/", {
          params: { path: { span_id: span.id } },
        });
        if (data) {
          setFullSpan(data as Span);
        }
      } catch (error) {
        console.error("Failed to fetch full span details:", error);
      } finally {
        setLoadingFullSpan(false);
      }
    };

    fetchFullSpan();
  }, [span.id, span.audio_data, span.audio_duration_ms]);

  // Update fullSpan when span prop changes
  useEffect(() => {
    setFullSpan(span);
  }, [span]);

  // Reset audio player state when switching to a different span
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [span.id]);

  // Flagging state
  const [isFlagging, setIsFlagging] = useState(false);
  const [correctedTranscription, setCorrectedTranscription] = useState(
    span.metadata.corrected_transcription || span.output_text || ""
  );
  const [isSaving, setIsSaving] = useState(false);
  
  // Create eval state
  const [isCreatingEval, setIsCreatingEval] = useState(false);

  const isFlagged = span.metadata.flagged === true;
  const isAudioSpan = span.span_type === "audio";
  const isLLMSpan = span.span_type === "llm";

  // Build audio source - prefer audio_url, fallback to base64 audio_data (16kHz, 16-bit mono WAV)
  const audioSrc =
    fullSpan.audio_url ||
    (fullSpan.audio_data
      ? `data:audio/wav;base64,${fullSpan.audio_data}`
      : null);

  const animationRef = useRef<number | null>(null);

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  // Use requestAnimationFrame for smooth progress updates (especially for short audio)
  useEffect(() => {
    const updateProgress = () => {
      if (audioRef.current && isPlaying) {
        setCurrentTime(audioRef.current.currentTime);
        animationRef.current = requestAnimationFrame(updateProgress);
      }
    };

    if (isPlaying) {
      animationRef.current = requestAnimationFrame(updateProgress);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying]);

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // Format time - show milliseconds for short audio (<5s)
  const formatTime = (seconds: number) => {
    if (duration > 0 && duration < 5) {
      // Show with decimal for short clips
      return `${seconds.toFixed(1)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleFlag = async () => {
    if (!correctedTranscription.trim()) return;
    setIsSaving(true);
    try {
      const { data } = await client.POST("/api/tracing/spans/{span_id}/flag/", {
        params: { path: { span_id: span.id } },
        body: { corrected_transcription: correctedTranscription },
      });
      if (data && onSpanUpdate) {
        onSpanUpdate(data as Span);
      }
      setIsFlagging(false);
    } catch (error) {
      console.error("Failed to flag span:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnflag = async () => {
    setIsSaving(true);
    try {
      const { data } = await client.POST(
        "/api/tracing/spans/{span_id}/unflag/",
        {
          params: { path: { span_id: span.id } },
        }
      );
      if (data && onSpanUpdate) {
        onSpanUpdate(data as Span);
      }
      setCorrectedTranscription(span.output_text || "");
    } catch (error) {
      console.error("Failed to unflag span:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateEval = async () => {
    setIsCreatingEval(true);
    try {
      // Parse input as JSON if possible, otherwise wrap in object
      let inputJson: unknown;
      try {
        inputJson = JSON.parse(span.input_text || "{}");
      } catch {
        inputJson = { text: span.input_text };
      }

      const { error } = await client.POST("/api/tracing/evals/", {
        body: {
          name: span.name,
          input: inputJson,
          rubric: "",
          category: "",
          source_span_id: span.id,
        },
      });

      if (!error) {
        toast.success("Eval created successfully", {
          action: {
            label: "View Evals",
            onClick: () => window.open("/evals", "_blank"),
          },
        });
      } else {
        throw new Error("Failed to create eval");
      }
    } catch (error) {
      console.error("Failed to create eval:", error);
      toast.error("Failed to create eval");
    } finally {
      setIsCreatingEval(false);
    }
  };

  return (
    <motion.div
      className="border-l border-neutral-100 flex flex-col h-full bg-white shrink-0 relative"
      style={{ width }}
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 100, opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* Resize handle at left edge */}
      {onResize && <ResizeHandle onResize={onResize} position="start" />}
      {/* Header */}
      <div className="px-3 py-2 border-b border-neutral-100 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 uppercase shrink-0",
                typeConfig.bg,
                typeConfig.text
              )}
            >
              {typeConfig.icon}
              {span.span_type}
            </span>
            <h3 className="text-sm font-medium text-neutral-900 font-mono truncate">
              {span.name}
            </h3>
            {!span.ended_at && (
              <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded shrink-0">
                Running
              </span>
            )}
          </div>
          <ActionIcon
            onClick={onClose}
            variant="subtle"
            icon={X}
            className="shrink-0"
          />
        </div>

        {/* Metrics row */}
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-neutral-500">
          <span className="font-mono">
            {format(new Date(span.started_at), "HH:mm:ss")}
          </span>
          <span className="text-neutral-300">•</span>
          <span className="font-mono">{formatDuration(span.duration_ms)}</span>
          {span.span_type === "llm" && (
            <>
              <span className="text-neutral-300">•</span>
              <span className="font-mono">
                {countTokens(span.input_text)} → {countTokens(span.output_text)}{" "}
                tokens
              </span>
            </>
          )}
          <span className="text-neutral-300">•</span>
          <span className="font-mono truncate text-neutral-400 flex-1">
            {span.id}
          </span>
          <ActionIcon
            onClick={() => copyToClipboard(span.id)}
            variant="subtle"
            icon={Copy}
            className="shrink-0"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Input */}
        {span.input_text && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <h4 className="text-[10px] uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <ArrowDown size={10} />
                  Input
                </h4>
                {span.span_type === "llm" && (
                  <span className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                    {countTokens(span.input_text)} tokens
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {isLLMSpan && (
                  <ActionIcon
                    onClick={handleCreateEval}
                    variant="subtle"
                    icon={isCreatingEval ? Loader2 : FlaskConical}
                    className={cn("shrink-0", isCreatingEval && "[&_svg]:animate-spin")}
                    disabled={isCreatingEval}
                    title="Create Eval from this input"
                  />
                )}
                <ActionIcon
                  onClick={() => copyToClipboard(span.input_text || "")}
                  variant="subtle"
                  icon={Copy}
                  className="shrink-0"
                />
              </div>
            </div>
            <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-3">
              <pre className="text-xs text-neutral-600 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                {span.input_text}
              </pre>
            </div>
          </div>
        )}

        {/* Output / Transcription */}
        {span.output_text && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <h4 className="text-[10px] uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <ArrowUp size={10} />
                  {isAudioSpan ? "Transcription" : "Output"}
                  {isFlagged && (
                    <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[9px] font-medium">
                      Flagged
                    </span>
                  )}
                </h4>
                {span.span_type === "llm" && (
                  <span className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                    {countTokens(span.output_text)} tokens
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {isAudioSpan && !isFlagging && (
                  <ActionIcon
                    onClick={() =>
                      isFlagged ? handleUnflag() : setIsFlagging(true)
                    }
                    variant="subtle"
                    icon={isFlagged ? X : Flag}
                    className={cn("shrink-0", isFlagged && "text-amber-600")}
                    disabled={isSaving}
                  />
                )}
                <ActionIcon
                  onClick={() => copyToClipboard(span.output_text || "")}
                  variant="subtle"
                  icon={Copy}
                  className="shrink-0"
                />
              </div>
            </div>

            {/* Show corrected transcription if flagged */}
            {isFlagged && span.metadata.corrected_transcription && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 mb-2">
                <div className="text-[10px] uppercase tracking-wider text-green-600 mb-1 font-medium">
                  Corrected
                </div>
                <pre className="text-xs text-green-700 whitespace-pre-wrap font-mono">
                  {span.metadata.corrected_transcription}
                </pre>
              </div>
            )}

            {/* Original transcription */}
            <div
              className={cn(
                "rounded-lg border p-3",
                isFlagged
                  ? "bg-red-50 border-red-200"
                  : "bg-neutral-50 border-neutral-100"
              )}
            >
              {isFlagged && (
                <div className="text-[10px] uppercase tracking-wider text-red-600 mb-1 font-medium">
                  Original (incorrect)
                </div>
              )}
              <pre
                className={cn(
                  "text-xs whitespace-pre-wrap font-mono max-h-64 overflow-y-auto",
                  isFlagged ? "text-red-600 line-through" : "text-neutral-600"
                )}
              >
                {span.output_text}
              </pre>
            </div>

            {/* Flag input UI */}
            {isFlagging && (
              <div className="mt-3 space-y-2">
                <TextArea
                  value={correctedTranscription}
                  onChange={setCorrectedTranscription}
                  placeholder="Enter the correct transcription..."
                  rows={3}
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => {
                      setIsFlagging(false);
                      setCorrectedTranscription(span.output_text || "");
                    }}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleFlag}
                    disabled={isSaving || !correctedTranscription.trim()}
                    iconLeft={Check}
                  >
                    {isSaving ? "Saving..." : "Save Correction"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audio Player */}
        {(audioSrc ||
          loadingFullSpan ||
          (isAudioSpan &&
            !fullSpan.audio_data &&
            fullSpan.audio_duration_ms)) && (
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-1.5">
              <Mic size={10} />
              Audio
            </h4>
            {loadingFullSpan ? (
              <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-4 flex items-center justify-center gap-2 text-xs text-neutral-400">
                <Loader2 size={14} className="animate-spin" />
                Loading audio...
              </div>
            ) : audioSrc ? (
              <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-3 space-y-3">
                <audio
                  ref={audioRef}
                  src={audioSrc}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => {
                    setIsPlaying(false);
                    setCurrentTime(0);
                  }}
                  onLoadedMetadata={handleLoadedMetadata}
                  className="hidden"
                />

                {/* Play/Pause and Progress */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlayback}
                    className="w-8 h-8 rounded-full bg-neutral-900 hover:bg-neutral-800 flex items-center justify-center text-white transition-colors"
                  >
                    {isPlaying ? (
                      <Pause size={14} />
                    ) : (
                      <Play size={14} className="ml-0.5" />
                    )}
                  </button>

                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-[10px] font-mono text-neutral-500 w-10 text-right">
                      {formatTime(currentTime)}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={duration || 1}
                      step={0.01}
                      value={currentTime}
                      onChange={handleSeek}
                      className="flex-1 h-1 bg-neutral-200 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-neutral-900"
                    />
                    <span className="text-[10px] font-mono text-neutral-500 w-10">
                      {formatTime(duration)}
                    </span>
                  </div>
                </div>

                {/* Audio metadata */}
                <div className="flex items-center gap-3 text-[10px] text-neutral-500">
                  {fullSpan.audio_duration_ms && (
                    <span>
                      Duration: {formatDuration(fullSpan.audio_duration_ms)}
                    </span>
                  )}
                  {fullSpan.audio_format && (
                    <span>Format: {fullSpan.audio_format}</span>
                  )}
                  {fullSpan.audio_url && (
                    <a
                      href={fullSpan.audio_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700 flex items-center gap-1 ml-auto"
                    >
                      <ExternalLink size={10} />
                      Open
                    </a>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Metadata */}
        {Object.keys(span.metadata).length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] uppercase tracking-wider text-neutral-400">
                Metadata
              </h4>
              <ActionIcon
                onClick={() =>
                  copyToClipboard(JSON.stringify(span.metadata, null, 2))
                }
                variant="subtle"
                icon={Copy}
              />
            </div>
            <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-3">
              <pre className="text-xs text-neutral-600 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                {JSON.stringify(span.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-neutral-400 mb-2">
            Timestamps
          </h4>
          <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-neutral-500">Started</span>
              <span className="text-neutral-700 font-mono">
                {format(new Date(span.started_at), "yyyy-MM-dd HH:mm:ss.SSS")}
              </span>
            </div>
            {span.ended_at && (
              <div className="flex justify-between text-xs">
                <span className="text-neutral-500">Ended</span>
                <span className="text-neutral-700 font-mono">
                  {format(new Date(span.ended_at), "yyyy-MM-dd HH:mm:ss.SSS")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
