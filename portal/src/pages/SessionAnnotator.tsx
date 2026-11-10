import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatDistanceToNow } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useValues } from "kea";
import {
  Activity,
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Flag,
  List,
  Lock,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";
import { cn } from "slate-ui";
import { toast } from "sonner";

import { PlaygroundReplayer } from "../components/playground";
import { TraceDetail, TraceViewer } from "../components/traces";
import { authLogic } from "../logic/authLogic";
import { components } from "../types/api";
import client from "../utils/api";

type Session = Omit<components["schemas"]["Session"], "leveling_assessment"> & {
  leveling_assessment?: {
    status: "too_advanced" | "too_simple" | "appropriate" | "no_signal";
    reasoning: string;
    evidence: string;
    suggested_level: string;
  };
};
type ActiveSession = Session & { offset: number };
type SessionList = components["schemas"]["SessionList"];
type PaginatedSessionListResponse =
  components["schemas"]["PaginatedSessionListResponse"];
type AnnotationSeverity = components["schemas"]["SeverityEnum"];
type Annotation = components["schemas"]["Annotation"];
type AnnotationRequest = components["schemas"]["AnnotationRequest"];
type Sentiment = components["schemas"]["SentimentEnum"];
type Category =
  | components["schemas"]["CategoryEnum"]
  | components["schemas"]["BlankEnum"];
type SessionGradeKey = "engagement" | "effectiveness";
type SessionGradeValue = "yes" | "no" | null;

type SortOption = "recent" | "oldest" | "longest" | "shortest" | "name";
type DateFilter = "all" | "today" | "week" | "month";
type ContentTab =
  | "transcription"
  | "summary"
  | "traces"
  | "leveling"
  | "playground";
const CATEGORY_LABELS: Record<string, string> = {
  off_topic: "Off Topic",
  unclear: "Unclear",
  canvas_rendering: "Canvas Rendering",
  canvas_coherence: "Canvas Coherence",
  unresponsive: "Unresponsive",
  premature_answer: "Premature Answer",
  premature_end: "Premature End",
  bad_pedagogy: "Bad Pedagogy",
  bad_explanation: "Bad Explanation",
  ignoring_student_misunderstanding: "Ignoring Student Misunderstanding",
  misleveling: "Misleveling",
  not_reading_the_room: "Not Reading the Room",
  not_changing_pedagogical_method: "Not Changing Pedagogical Method",
  canvas_misuse: "Canvas Misuse",
  missing_motivational_techniques: "Missing Motivational Techniques",
  incomplete_scaffolding: "Incomplete Scaffolding",
  other: "Other",
};

const ADDABLE_CATEGORY_OPTIONS: { id: Category; name: string }[] = [
  { id: "premature_answer", name: CATEGORY_LABELS["premature_answer"] },
  { id: "bad_explanation", name: CATEGORY_LABELS["bad_explanation"] },
  {
    id: "ignoring_student_misunderstanding",
    name: CATEGORY_LABELS["ignoring_student_misunderstanding"],
  },
  { id: "misleveling", name: CATEGORY_LABELS["misleveling"] },
  { id: "not_reading_the_room", name: CATEGORY_LABELS["not_reading_the_room"] },
  {
    id: "not_changing_pedagogical_method",
    name: CATEGORY_LABELS["not_changing_pedagogical_method"],
  },
  { id: "canvas_misuse", name: CATEGORY_LABELS["canvas_misuse"] },
  {
    id: "missing_motivational_techniques",
    name: CATEGORY_LABELS["missing_motivational_techniques"],
  },
  {
    id: "incomplete_scaffolding",
    name: CATEGORY_LABELS["incomplete_scaffolding"],
  },
];

const SEVERITY_LABELS: Record<AnnotationSeverity, string> = {
  preference: "Preference",
  recoverable_failure: "Recoverable Failure",
  total_failure: "Total Failure",
};

const SEVERITY_STYLES: Record<AnnotationSeverity, string> = {
  preference: "bg-neutral-100 text-neutral-500 border-neutral-200",
  recoverable_failure: "bg-amber-50 text-amber-700 border-amber-200",
  total_failure: "bg-red-50 text-red-700 border-red-200",
};

const SEVERITY_BG_COLORS: Record<AnnotationSeverity, string> = {
  preference: "rgb(245 245 245)",
  recoverable_failure: "rgb(255 251 235)",
  total_failure: "rgb(254 242 242)",
};

const SEVERITY_OPTIONS = Object.entries(SEVERITY_LABELS).map(([id, name]) => ({
  id: id as AnnotationSeverity,
  name,
}));

const SESSION_GRADE_KEYS: SessionGradeKey[] = ["engagement", "effectiveness"];
const SESSION_GRADE_LABELS: Record<SessionGradeKey, string> = {
  engagement: "Engagement",
  effectiveness: "Effectiveness",
};
const SESSION_GRADE_DESCRIPTIONS: Record<SessionGradeKey, string> = {
  engagement:
    "Was the student engaged and did the tutor keep them involved throughout?",
  effectiveness:
    "Did the tutor meet the learning goal from the tutor or the student?",
};
const SESSION_GRADE_TAG = "[SESSION_GRADE]";

function buildSessionGradeNote(
  key: SessionGradeKey,
  value: Exclude<SessionGradeValue, null>,
  notes?: string
) {
  const suffix = notes?.trim();
  const header = `${SESSION_GRADE_TAG} ${key}:${value}`;
  return suffix ? `${header}\n${suffix}` : header;
}

function parseSessionGradeNote(notes?: string | null): {
  key: SessionGradeKey;
  value: Exclude<SessionGradeValue, null>;
  notes: string;
} | null {
  if (!notes || !notes.startsWith(SESSION_GRADE_TAG)) return null;

  const [header, ...rest] = notes.split("\n");
  const payload = header.replace(SESSION_GRADE_TAG, "").trim();
  const [rawKey, rawValue] = payload.split(":");

  if (
    !rawKey ||
    !rawValue ||
    !SESSION_GRADE_KEYS.includes(rawKey as SessionGradeKey)
  ) {
    return null;
  }

  if (rawValue !== "yes" && rawValue !== "no") return null;

  return {
    key: rawKey as SessionGradeKey,
    value: rawValue,
    notes: rest.join("\n").trim(),
  };
}

function parseSessionGradeAnnotation(annotation: Annotation) {
  return parseSessionGradeNote(annotation.notes);
}

function isSessionGradeAnnotation(annotation: Annotation) {
  return Boolean(parseSessionGradeAnnotation(annotation));
}

type SessionGradeDraft = Record<
  SessionGradeKey,
  { value: SessionGradeValue; notes: string }
>;

function createEmptySessionGradeDraft(): SessionGradeDraft {
  return SESSION_GRADE_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: { value: null, notes: "" } }),
    {} as SessionGradeDraft
  );
}

function deriveSessionGradeDraft(
  annotations: Annotation[] | undefined
): SessionGradeDraft {
  const base = createEmptySessionGradeDraft();
  (annotations || []).forEach((annotation) => {
    const parsed = parseSessionGradeAnnotation(annotation);
    if (parsed) {
      base[parsed.key] = {
        value: parsed.value,
        notes: parsed.notes,
      };
    }
  });
  return base;
}

function createEmptySessionGradeSavingState(): Record<
  SessionGradeKey,
  boolean
> {
  return SESSION_GRADE_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: false }),
    {} as Record<SessionGradeKey, boolean>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

type ParsedTimestamp = {
  seconds: number;
  display: string;
};

function parseTimestamp(timestamp: string): ParsedTimestamp | null {
  // Try mm:ss or hh:mm:ss format first
  if (timestamp.includes(":")) {
    const parts = timestamp.split(":").map(Number);
    if (parts.length === 2) {
      const seconds = parts[0] * 60 + parts[1];
      return { seconds, display: timestamp };
    } else if (parts.length === 3) {
      const seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      return { seconds, display: timestamp };
    }
  }

  // Try format like 1m46s438ms or 1m46s or 46s438ms
  const durationMatch = timestamp.match(
    /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?(?:(\d+)ms)?$/
  );
  if (durationMatch) {
    const hours = parseInt(durationMatch[1] || "0", 10);
    const minutes = parseInt(durationMatch[2] || "0", 10);
    const secs = parseInt(durationMatch[3] || "0", 10);
    // Ignore milliseconds for seeking purposes
    const totalSeconds = hours * 3600 + minutes * 60 + secs;

    // Format as mm:ss or h:mm:ss
    if (hours > 0) {
      const mins = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      return {
        seconds: totalSeconds,
        display: `${hours}:${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`,
      };
    } else {
      const mins = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return {
        seconds: totalSeconds,
        display: `${mins}:${s.toString().padStart(2, "0")}`,
      };
    }
  }

  return null;
}

function TextWithClickableTimestamps({
  text,
  onSeek,
  className,
}: {
  text: string;
  onSeek: (time: number) => void;
  className?: string;
}) {
  // Match timestamps like:
  // - 0:00, 00:00, 0:00:00, 00:00:00
  // - 1m46s438ms, 1m46s, 46s, 1h2m3s, etc.
  // Note: Duration format requires at least one component (can't match empty string)
  const timestampRegex =
    /\b(\d{1,2}:\d{2}(?::\d{2})?|\d+h(?:\d+m)?(?:\d+s)?(?:\d+ms)?|\d+m(?:\d+s)?(?:\d+ms)?|\d+s(?:\d+ms)?|\d+ms)\b/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = timestampRegex.exec(text)) !== null) {
    const timestamp = match[1];
    const parsed = parseTimestamp(timestamp);

    // Skip if we couldn't parse it or it's just empty - but always advance lastIndex
    if (!parsed || parsed.seconds === 0) {
      lastIndex = match.index + match[0].length;
      continue;
    }

    // Add text before the timestamp
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add the clickable timestamp
    parts.push(
      <button
        key={`${match.index}-${timestamp}`}
        onClick={() => onSeek(parsed.seconds)}
        className="font-mono bg-neutral-200 rounded-md px-1 text-neutral-700 hover:text-neutral-900 hover:underline cursor-pointer border-none"
      >
        {parsed.display}
      </button>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span className={className}>{parts}</span>;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 text-[10px] font-medium bg-neutral-100 border border-neutral-200 rounded text-neutral-500 font-mono">
      {children}
    </kbd>
  );
}

function SessionListItem({
  session,
  isSelected,
  onClick,
}: {
  session: SessionList;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-lg group border",
        isSelected
          ? "bg-neutral-100 border-neutral-200"
          : "border-transparent hover:bg-neutral-50"
      )}
      initial={false}
      animate={{
        backgroundColor: isSelected ? "rgb(245 245 245)" : "rgb(255 255 255)",
      }}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3
            className={cn(
              "font-medium text-sm truncate",
              isSelected ? "text-neutral-900" : "text-neutral-700"
            )}
          >
            {session.name || "Untitled Session"}
          </h3>
          <p className="text-xs text-neutral-400 line-clamp-1 mt-0.5">
            {session.description || "No description"}
          </p>
          <div className="flex items-center gap-2 mt-2">
            {session.profile_name && (
              <span className="flex items-center gap-1 text-[10px] text-neutral-400">
                <User size={10} />
                {session.profile_name}
              </span>
            )}
            {session.audio_duration_seconds && (
              <span className="flex items-center gap-1 text-[10px] text-neutral-400">
                <Clock size={10} />
                {formatDuration(session.audio_duration_seconds)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-[10px] text-neutral-400">
            {session.created_at &&
              formatDistanceToNow(new Date(session.created_at), {
                addSuffix: true,
              })}
          </span>
          {Number(session.annotation_count) > 0 && (
            <motion.span
              className="text-[10px] bg-neutral-200 text-neutral-600 px-1.5 py-0.5 rounded-full font-medium"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {session.annotation_count}
            </motion.span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

type DragMode = "none" | "move" | "resize-left" | "resize-right";

function AnnotationMarker({
  annotation,
  duration,
  isActive,
  onClick,
  onUpdate,
  containerRef,
}: {
  annotation: Annotation;
  duration: number;
  isActive: boolean;
  onClick: () => void;
  onUpdate?: (startTime: number, endTime: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [dragMode, setDragMode] = useState<DragMode>("none");
  const [dragStart, setDragStart] = useState<{
    x: number;
    startTime: number;
    endTime: number;
  } | null>(null);
  const [previewTimes, setPreviewTimes] = useState<{
    start: number;
    end: number;
  } | null>(null);

  // Use ref to track latest previewTimes for mouseUp handler without causing re-renders
  const previewTimesRef = useRef(previewTimes);
  previewTimesRef.current = previewTimes;

  const startTime = previewTimes?.start ?? annotation.start_time;
  const endTime = previewTimes?.end ?? annotation.end_time;

  const left = (startTime / duration) * 100;
  const width = ((endTime - startTime) / duration) * 100;

  const getTimeFromX = useCallback(
    (clientX: number): number => {
      if (!containerRef.current) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      return percent * duration;
    },
    [containerRef, duration]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, mode: DragMode) => {
      e.stopPropagation();
      e.preventDefault();
      setDragMode(mode);
      setDragStart({
        x: e.clientX,
        startTime: annotation.start_time,
        endTime: annotation.end_time,
      });
    },
    [annotation.start_time, annotation.end_time]
  );

  useEffect(() => {
    if (dragMode === "none" || !dragStart) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentTime = getTimeFromX(e.clientX);
      const deltaTime = currentTime - getTimeFromX(dragStart.x);

      let newStart = dragStart.startTime;
      let newEnd = dragStart.endTime;

      if (dragMode === "move") {
        const annotationDuration = dragStart.endTime - dragStart.startTime;
        newStart = Math.max(0, dragStart.startTime + deltaTime);
        newEnd = newStart + annotationDuration;
        // Clamp to duration
        if (newEnd > duration) {
          newEnd = duration;
          newStart = duration - annotationDuration;
        }
      } else if (dragMode === "resize-left") {
        newStart = Math.max(0, Math.min(dragStart.endTime - 1, currentTime));
      } else if (dragMode === "resize-right") {
        newEnd = Math.min(
          duration,
          Math.max(dragStart.startTime + 1, currentTime)
        );
      }

      setPreviewTimes({ start: newStart, end: newEnd });
    };

    const handleMouseUp = () => {
      const times = previewTimesRef.current;
      if (times && onUpdate) {
        onUpdate(times.start, times.end);
      }
      setDragMode("none");
      setDragStart(null);
      setPreviewTimes(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragMode, dragStart, duration, getTimeFromX, onUpdate]);

  const isDragging = dragMode !== "none";
  const isGemini = annotation.created_by_name === "Gemini";
  const bgColor = isGemini
    ? "bg-blue-500"
    : annotation.sentiment === "positive"
      ? "bg-emerald-500"
      : "bg-red-500";

  return (
    <motion.div
      className={cn("absolute h-full group", bgColor)}
      style={{
        left: `${left}%`,
        width: `${Math.max(width, 0.5)}%`,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation();
          onClick();
        }
      }}
      onMouseDown={(e) => handleMouseDown(e, "move")}
      initial={{ opacity: 0, scaleY: 0 }}
      animate={{
        opacity: isDragging ? 0.45 : isActive ? 0.35 : 0.18,
        scaleY: 1,
      }}
      whileHover={{ opacity: 0.3, scaleY: 1.05 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 opacity-0 group-hover:opacity-100 hover:bg-black/20 transition-opacity"
        onMouseDown={(e) => handleMouseDown(e, "resize-left")}
      />
      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 opacity-0 group-hover:opacity-100 hover:bg-black/20 transition-opacity"
        onMouseDown={(e) => handleMouseDown(e, "resize-right")}
      />
      {/* Time preview tooltip while dragging */}
      {isDragging && previewTimes && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-neutral-900 text-white text-[10px] font-mono whitespace-nowrap z-30 pointer-events-none">
          {formatTime(previewTimes.start)} → {formatTime(previewTimes.end)}
        </div>
      )}
    </motion.div>
  );
}

function AnnotationCard({
  annotation,
  isActive,
  onSeek,
  onDelete,
  onUpdate,
}: {
  annotation: Annotation;
  isActive: boolean;
  onSeek: (time: number) => void;
  onDelete: () => void;
  onUpdate?: (
    annotationId: string,
    updates: Partial<AnnotationRequest>
  ) => Promise<boolean> | boolean | void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const severity: AnnotationSeverity =
    (annotation.severity as AnnotationSeverity) || "preference";
  const [localSeverity, setLocalSeverity] =
    useState<AnnotationSeverity>(severity);

  useEffect(() => {
    setLocalSeverity(severity);
  }, [severity]);

  useEffect(() => {
    if (isActive && cardRef.current) {
      cardRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [isActive]);

  const hasNotes = annotation.notes && annotation.notes.length > 0;
  const shouldTruncate = hasNotes && annotation.notes!.length > 100;

  return (
    <motion.div
      ref={cardRef}
      className={cn(
        "p-3 rounded-lg border cursor-pointer",
        isActive
          ? "bg-neutral-100 border-neutral-200"
          : "bg-white border-neutral-100"
      )}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        backgroundColor: isActive ? "rgb(245 245 245)" : "rgb(255 255 255)",
      }}
      exit={{ opacity: 0, x: -10, scale: 0.98 }}
      whileHover={{ borderColor: "rgb(229 229 229)" }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      layout
      onClick={() => shouldTruncate && setIsExpanded(!isExpanded)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <motion.span
              className={cn(
                "w-2 h-2 rounded-full shrink-0",
                annotation.created_by_name === "Gemini"
                  ? "bg-blue-500"
                  : annotation.sentiment === "positive"
                    ? "bg-emerald-500"
                    : "bg-red-500"
              )}
              animate={{ scale: isActive ? 1.2 : 1 }}
              transition={{ duration: 0.15 }}
            />
            <motion.button
              onClick={(e) => {
                e.stopPropagation();
                onSeek(annotation.start_time);
              }}
              className="text-xs font-mono text-neutral-500 hover:text-neutral-900"
              whileHover={{ x: 1 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.1 }}
            >
              {formatTime(annotation.start_time)} →{" "}
              {formatTime(annotation.end_time)}
            </motion.button>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded border shrink-0",
                SEVERITY_STYLES[localSeverity]
              )}
            >
              {SEVERITY_LABELS[localSeverity]}
            </span>
          </div>

          {annotation.category && (
            <div className="mt-1.5">
              <span className="text-[10px] bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded">
                {CATEGORY_LABELS[annotation.category] || annotation.category}
              </span>
            </div>
          )}

          {hasNotes && (
            <motion.div
              className="mt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.05 }}
            >
              <p
                className={cn(
                  "text-xs text-neutral-600 leading-relaxed",
                  !isExpanded && shouldTruncate ? "line-clamp-2" : ""
                )}
              >
                {annotation.notes}
              </p>
              {shouldTruncate && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                  }}
                  className="text-[10px] text-neutral-400 hover:text-neutral-600 mt-1 flex items-center gap-1"
                >
                  {isExpanded ? (
                    <>
                      Show less <ChevronDown size={10} className="rotate-180" />
                    </>
                  ) : (
                    <>
                      Show more <ChevronDown size={10} />
                    </>
                  )}
                </button>
              )}
            </motion.div>
          )}

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-100">
                  <p className="text-[10px] uppercase tracking-wider text-neutral-400">
                    Severity
                  </p>
                  <select
                    value={localSeverity}
                    onChange={async (e) => {
                      e.stopPropagation();
                      const newSeverity = e.target.value as AnnotationSeverity;
                      const previousSeverity = localSeverity;
                      setLocalSeverity(newSeverity);
                      const result = await onUpdate?.(annotation.id, {
                        severity: newSeverity,
                      });
                      if (result === false) {
                        setLocalSeverity(previousSeverity);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs px-2 py-1 rounded border border-neutral-200 bg-white text-neutral-600 focus:outline-none focus:border-neutral-400"
                  >
                    {SEVERITY_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </div>
                {annotation.created_by_name && (
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-neutral-400">
                    <User size={10} />
                    {annotation.created_by_name}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1.5 rounded-md text-neutral-300 hover:text-red-500 hover:bg-red-50 shrink-0"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.1 }}
        >
          <Trash2 size={14} />
        </motion.button>
      </div>
    </motion.div>
  );
}

function AudioPlayer({
  sessions,
  currentTime,
  setCurrentTime,
  isPlaying,
  setIsPlaying,
  annotations,
  onAnnotationClick,
  onAnnotationUpdate,
  activeAnnotation,
  seekRef,
}: {
  sessions: Session[];
  currentTime: number;
  setCurrentTime: (time: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  annotations: Annotation[];
  onAnnotationClick: (annotation: Annotation) => void;
  onAnnotationUpdate: (
    annotationId: string,
    updates: Partial<AnnotationRequest>
  ) => Promise<boolean> | boolean | void;
  activeAnnotation: Annotation | null;
  seekRef?: React.MutableRefObject<((time: number) => void) | null>;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Calculate segment offsets and total duration
  const { segments, totalDuration } = useMemo(() => {
    let total = 0;
    const segs = sessions.map((s) => {
      const start = total;
      const duration = s.audio_duration_seconds || 0;
      total += duration;
      return {
        ...s,
        offset: start,
        duration,
      };
    });
    return { segments: segs, totalDuration: total };
  }, [sessions]);

  // Determine current active segment
  const currentSegmentIndex = useMemo(() => {
    const index = segments.findIndex(
      (s) => currentTime >= s.offset && currentTime < s.offset + s.duration
    );
    return index === -1 ? segments.length - 1 : index;
  }, [currentTime, segments]);

  const currentSegment = segments[currentSegmentIndex];

  const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

  // Generate waveform data from all audio files
  useEffect(() => {
    const generateWaveform = async () => {
      if (sessions.length === 0) return;
      setIsLoadingWaveform(true);

      try {
        const audioContext = new AudioContext();

        // Calculate how many bars each segment should contribute to the total 150 bars
        const TOTAL_TARGET_BARS = 150;
        let cumulativeBars = 0;
        const segmentBarsCount = sessions.map((s) => {
          const durationRatio =
            (s.audio_duration_seconds || 0) / (totalDuration || 1);
          const bars = Math.round(durationRatio * TOTAL_TARGET_BARS);
          cumulativeBars += bars;
          return bars;
        });
        // Adjust last segment's bars to ensure total is exactly TOTAL_TARGET_BARS
        if (segmentBarsCount.length > 0) {
          segmentBarsCount[segmentBarsCount.length - 1] +=
            TOTAL_TARGET_BARS - cumulativeBars;
        }

        // Fetch all audio buffers
        const buffers = await Promise.all(
          sessions.map(async (session) => {
            if (!session.presigned_url) return null;
            try {
              const response = await fetch(session.presigned_url);
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const arrayBuffer = await response.arrayBuffer();
              return await audioContext.decodeAudioData(arrayBuffer);
            } catch (e) {
              console.error("Failed to fetch/decode audio:", e);
              return null;
            }
          })
        );

        // Process buffers into a single waveform
        const allSamples: number[] = [];

        buffers.forEach((audioBuffer, index) => {
          const numBarsForThisSegment = segmentBarsCount[index] || 0;

          if (!audioBuffer || numBarsForThisSegment === 0) {
            // Generate flat placeholder for missing audio
            for (let k = 0; k < numBarsForThisSegment; k++) {
              allSamples.push(0.3);
            }
            return;
          }

          const rawData = audioBuffer.getChannelData(0);
          const blockSize = Math.floor(rawData.length / numBarsForThisSegment);

          for (let i = 0; i < numBarsForThisSegment; i++) {
            const blockStart = blockSize * i;
            let sum = 0;
            // Sum absolute values within the block
            for (let j = 0; j < blockSize; j++) {
              sum += Math.abs(rawData[blockStart + j]);
            }
            allSamples.push(sum / (blockSize || 1));
          }
        });

        // Normalize
        const maxVal = Math.max(...allSamples, 0.01);
        const normalizedData = allSamples.map((val) => val / maxVal);

        setWaveformData(normalizedData);
        audioContext.close();
      } catch (error) {
        console.error("Failed to generate waveform:", error);
        // Fallback to flat placeholder
        setWaveformData(Array.from({ length: 150 }, () => 0.3));
      } finally {
        setIsLoadingWaveform(false);
      }
    };

    generateWaveform();
  }, [sessions, totalDuration]);

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveformData.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const barWidth = width / waveformData.length;
    const centerY = height / 2;
    const gap = 2;

    ctx.clearRect(0, 0, width, height);

    const progress = currentTime / (totalDuration || 1);
    const playedWidth = width * progress;

    // Draw all bars
    waveformData.forEach((value, index) => {
      const x = index * barWidth;
      const barHeight = Math.max(value * (height * 0.8), 2);
      const isPlayed = x < playedWidth;

      ctx.fillStyle = isPlayed ? "rgba(0, 0, 0, 0.8)" : "rgba(0, 0, 0, 0.15)";

      const barX = x + gap / 2;
      const barY = centerY - barHeight / 2;
      const actualBarWidth = Math.max(1, barWidth - gap);

      ctx.beginPath();
      ctx.roundRect(barX, barY, actualBarWidth, barHeight, 1);
      ctx.fill();
    });

    // Draw segment dividers
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    segments.forEach((seg) => {
      if (seg.offset > 0) {
        const x = (seg.offset / totalDuration) * width;
        ctx.fillRect(x, 0, 1, height);
      }
    });
  }, [waveformData, currentTime, totalDuration, segments]);

  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * totalDuration;

    setCurrentTime(newTime);
    // Seek logic handled by useEffect on currentTime change
  };

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const time = percentage * totalDuration;

    setHoverTime(time);
    setHoverX(x);
  };

  const handleProgressLeave = () => {
    setHoverTime(null);
    setHoverX(null);
  };

  // Sync audio element with currentTime and segment
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSegment) return;

    // Check if source needs to change
    const currentSrc = audio.getAttribute("src");
    if (currentSrc !== currentSegment.presigned_url) {
      const wasPlaying = !audio.paused;
      audio.src = currentSegment.presigned_url || "";
      // When src changes, we need to load and then seek
      audio.load();
      // Seek to relative time
      const relativeTime = Math.max(0, currentTime - currentSegment.offset);
      audio.currentTime = relativeTime;
      if (wasPlaying || isPlaying) {
        audio.play().catch(() => {});
      }
    } else {
      // Source matches, check if time sync is needed (e.g. user scrubbed)
      const relativeTime = Math.max(0, currentTime - currentSegment.offset);
      if (Math.abs(audio.currentTime - relativeTime) > 0.5) {
        audio.currentTime = relativeTime;
      }
    }
  }, [currentSegment, currentTime, isPlaying]); // Watch isPlaying to resume if needed

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (!currentSegment) return;
      const newGlobalTime = currentSegment.offset + audio.currentTime;
      // Only update if difference is significant to avoid jitter/loops
      if (Math.abs(newGlobalTime - currentTime) > 0.1) {
        setCurrentTime(newGlobalTime);
      }
    };

    const handleEnded = () => {
      // Go to next segment if available
      if (currentSegmentIndex < segments.length - 1) {
        // Next segment
        const nextSeg = segments[currentSegmentIndex + 1];
        setCurrentTime(nextSeg.offset);
        // The useEffect above will catch the currentTime change and switch src
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [
    currentSegment,
    currentSegmentIndex,
    segments,
    setCurrentTime,
    setIsPlaying,
    currentTime,
  ]);

  // Handle Play/Pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      if (audio.paused) audio.play().catch(console.error);
    } else {
      if (!audio.paused) audio.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  const seekTo = useCallback(
    (time: number) => {
      setCurrentTime(time);
    },
    [setCurrentTime]
  );

  // Expose seekTo to parent via ref
  useEffect(() => {
    if (seekRef) {
      seekRef.current = seekTo;
    }
    return () => {
      if (seekRef) {
        seekRef.current = null;
      }
    };
  }, [seekRef, seekTo]);

  const skip = useCallback(
    (seconds: number) => {
      const newTime = Math.max(
        0,
        Math.min(totalDuration, currentTime + seconds)
      );
      setCurrentTime(newTime);
    },
    [totalDuration, currentTime, setCurrentTime]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement
      )
        return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          setIsPlaying(!isPlaying);
          break;
        case "ArrowLeft":
          e.preventDefault();
          skip(e.shiftKey ? -30 : -5);
          break;
        case "ArrowRight":
          e.preventDefault();
          skip(e.shiftKey ? 30 : 5);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, setIsPlaying, skip]);

  return (
    <div className="p-6 border-b border-neutral-100">
      <audio ref={audioRef} preload="metadata" />

      {/* Waveform container */}
      <div
        ref={progressRef}
        onClick={handleProgressClick}
        onMouseMove={handleProgressHover}
        onMouseLeave={handleProgressLeave}
        className="relative h-20 rounded-lg cursor-pointer overflow-hidden bg-neutral-50"
      >
        {/* Waveform canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: "none" }}
        />

        {/* Loading indicator */}
        <AnimatePresence>
          {isLoadingWaveform && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <motion.div
                className="w-5 h-5 rounded-full border-2 border-neutral-200 border-t-neutral-500"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Waveform reveal mask */}
        {!isLoadingWaveform && waveformData.length > 0 && (
          <motion.div
            className="absolute inset-0 bg-neutral-50 origin-right"
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            style={{ pointerEvents: "none" }}
          />
        )}

        {/* Annotation markers */}
        {annotations.map((annotation) => (
          <AnnotationMarker
            key={annotation.id}
            annotation={annotation}
            duration={totalDuration}
            isActive={activeAnnotation?.id === annotation.id}
            onClick={() => {
              onAnnotationClick(annotation);
              seekTo(annotation.start_time);
            }}
            onUpdate={(startTime, endTime) =>
              onAnnotationUpdate(annotation.id, {
                start_time: startTime,
                end_time: endTime,
              })
            }
            containerRef={progressRef}
          />
        ))}

        {/* Hover preview */}
        <AnimatePresence>
          {hoverTime !== null && hoverX !== null && (
            <motion.div
              className="absolute top-0 bottom-0 pointer-events-none z-20"
              style={{ left: hoverX }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
            >
              <div className="absolute top-0 bottom-0 w-px bg-neutral-400" />
              <motion.div
                className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-neutral-900 text-white"
                initial={{ y: 4, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 4, opacity: 0 }}
                transition={{ duration: 0.1 }}
              >
                <span className="text-[10px] font-mono">
                  {formatTime(hoverTime)}
                </span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-neutral-900 pointer-events-none z-10"
          style={{
            left: `${(currentTime / (totalDuration || 1)) * 100}%`,
            transition: isPlaying ? "left 0.25s linear" : "left 0.1s ease-out",
          }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-1">
          <motion.button
            onClick={() => skip(-5)}
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92, x: -2 }}
            transition={{ duration: 0.1 }}
          >
            <ChevronLeft size={18} />
          </motion.button>

          <motion.button
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-10 h-10 rounded-full bg-neutral-900 text-white hover:bg-neutral-800 flex items-center justify-center"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.1 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {isPlaying ? (
                <motion.div
                  key="pause"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.1 }}
                >
                  <Pause size={16} />
                </motion.div>
              ) : (
                <motion.div
                  key="play"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="ml-0.5"
                >
                  <Play size={16} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>

          <motion.button
            onClick={() => skip(5)}
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92, x: 2 }}
            transition={{ duration: 0.1 }}
          >
            <ChevronRight size={18} />
          </motion.button>

          {/* Playback speed */}
          <div className="ml-2 flex items-center gap-1">
            {PLAYBACK_RATES.map((rate) => (
              <motion.button
                key={rate}
                onClick={() => setPlaybackRate(rate)}
                className={cn(
                  "px-2 py-1 rounded text-xs font-medium",
                  playbackRate === rate
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100"
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                animate={{
                  backgroundColor:
                    playbackRate === rate
                      ? "rgb(23 23 23)"
                      : "rgb(255 255 255)",
                  color:
                    playbackRate === rate
                      ? "rgb(255 255 255)"
                      : "rgb(163 163 163)",
                }}
                transition={{ duration: 0.12 }}
              >
                {rate}x
              </motion.button>
            ))}
          </div>
        </div>

        <motion.div
          className="font-mono text-sm text-neutral-500 tabular-nums"
          key={Math.floor(currentTime)}
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.1 }}
        >
          <span className="text-neutral-900">{formatTime(currentTime)}</span>
          <span className="text-neutral-300 mx-1">/</span>
          <span>{formatTime(totalDuration)}</span>
        </motion.div>

        <div className="flex items-center gap-2 text-neutral-400">
          <Kbd>Space</Kbd>
          <span className="text-[10px]">play</span>
          <span className="text-neutral-200 mx-1">·</span>
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
          <span className="text-[10px]">skip</span>
        </div>
      </div>
    </div>
  );
}

function AnnotationForm({
  currentTime,
  onSubmit,
  onCancel,
}: {
  currentTime: number;
  onSubmit: (annotation: Omit<AnnotationRequest, "session">) => void;
  onCancel: () => void;
}) {
  const [startTime, setStartTime] = useState(Math.max(0, currentTime - 2));
  const [endTime, setEndTime] = useState(currentTime + 3);
  const [sentiment, setSentiment] = useState<Sentiment>("negative");
  const [severity, setSeverity] = useState<AnnotationSeverity>("preference");
  const [category, setCategory] = useState<Category | null>(null);
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      start_time: startTime,
      end_time: endTime,
      sentiment,
      category,
      notes: notes || undefined,
      severity,
    });
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 space-y-4"
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-900 flex items-center gap-2">
          <Flag size={14} />
          New Annotation
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded text-neutral-400 hover:text-neutral-900 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Time inputs */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">
            Start
          </label>
          <input
            type="number"
            value={startTime}
            onChange={(e) => setStartTime(parseFloat(e.target.value))}
            className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-mono focus:outline-none focus:border-neutral-400 transition-all"
            step="0.1"
          />
        </div>
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">
            End
          </label>
          <input
            type="number"
            value={endTime}
            onChange={(e) => setEndTime(parseFloat(e.target.value))}
            className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-mono focus:outline-none focus:border-neutral-400 transition-all"
            step="0.1"
          />
        </div>
      </div>

      {/* Sentiment */}
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">
          Sentiment
        </label>
        <div className="flex gap-2">
          <motion.button
            type="button"
            onClick={() => setSentiment("positive")}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-medium border",
              sentiment === "positive"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-white border-neutral-200 text-neutral-500"
            )}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            animate={{
              backgroundColor:
                sentiment === "positive"
                  ? "rgb(236 253 245)"
                  : "rgb(255 255 255)",
            }}
            transition={{ duration: 0.12 }}
          >
            Positive
          </motion.button>
          <motion.button
            type="button"
            onClick={() => setSentiment("negative")}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-medium border",
              sentiment === "negative"
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-white border-neutral-200 text-neutral-500"
            )}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            animate={{
              backgroundColor:
                sentiment === "negative"
                  ? "rgb(254 242 242)"
                  : "rgb(255 255 255)",
            }}
            transition={{ duration: 0.12 }}
          >
            Negative
          </motion.button>
        </div>
      </div>

      {/* Severity */}
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">
          Severity
        </label>
        <div className="flex flex-wrap gap-2">
          {SEVERITY_OPTIONS.map((opt) => (
            <motion.button
              key={opt.id}
              type="button"
              onClick={() => setSeverity(opt.id)}
              className={cn(
                "flex-1 min-w-[140px] py-2 rounded-lg text-sm font-medium border",
                severity === opt.id
                  ? SEVERITY_STYLES[opt.id]
                  : "bg-white border-neutral-200 text-neutral-500"
              )}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              animate={{
                backgroundColor:
                  severity === opt.id
                    ? SEVERITY_BG_COLORS[opt.id]
                    : "rgb(255 255 255)",
              }}
              transition={{ duration: 0.12 }}
            >
              {opt.name}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">
          Category
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ADDABLE_CATEGORY_OPTIONS.map((opt, index) => (
            <motion.button
              key={opt.id}
              type="button"
              onClick={() => setCategory(category === opt.id ? null : opt.id)}
              className={cn(
                "px-2 py-1 rounded text-xs border",
                category === opt.id
                  ? "bg-neutral-900 border-neutral-900 text-white"
                  : "bg-white border-neutral-200 text-neutral-500"
              )}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: index * 0.02 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {opt.name}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add context..."
          rows={2}
          className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm placeholder:text-neutral-300 focus:outline-none focus:border-neutral-400 transition-all resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <motion.button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-sm text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.1 }}
        >
          Cancel
        </motion.button>
        <motion.button
          type="submit"
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-neutral-900 text-white hover:bg-neutral-800"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.1 }}
        >
          Save
        </motion.button>
      </div>
    </motion.form>
  );
}

function SessionGradeCard({
  session,
  draft,
  saving,
  onDraftChange,
  onSave,
  isFocused = false,
}: {
  session: Session;
  draft: SessionGradeDraft;
  saving?: Record<SessionGradeKey, boolean>;
  onDraftChange: (
    key: SessionGradeKey,
    value: SessionGradeDraft[SessionGradeKey]
  ) => void;
  onSave: (key: SessionGradeKey) => void;
  isFocused?: boolean;
}) {
  const firstInputRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isFocused && firstInputRef.current) {
      requestAnimationFrame(() => {
        firstInputRef.current?.focus();
      });
    }
  }, [isFocused]);

  return (
    <div className="p-4 rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">
            Session Grade
          </p>
          <h4 className="text-sm font-semibold text-neutral-900">
            {session.name || "Untitled Session"}
          </h4>
          {session.profile_name && (
            <p className="text-xs text-neutral-400 mt-0.5">
              {session.profile_name}
            </p>
          )}
        </div>
        {session.audio_duration_seconds !== undefined && (
          <span className="text-[11px] text-neutral-400">
            {formatDuration(session.audio_duration_seconds || 0)}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {SESSION_GRADE_KEYS.map((key, idx) => {
          const value = draft[key]?.value ?? null;
          const notes = draft[key]?.notes ?? "";
          const isSaving = saving?.[key];

          return (
            <motion.div
              key={key}
              className="p-3 rounded-lg border border-neutral-100 bg-neutral-50"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: idx * 0.02 }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-neutral-400">
                    {SESSION_GRADE_LABELS[key]}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                    {SESSION_GRADE_DESCRIPTIONS[key]}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <motion.button
                    type="button"
                    ref={isFocused && idx === 0 ? firstInputRef : null}
                    onClick={() => onDraftChange(key, { value: "yes", notes })}
                    className={cn(
                      "px-2 py-1 rounded text-xs font-medium border",
                      value === "yes"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-white border-neutral-200 text-neutral-500"
                    )}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Yes
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => onDraftChange(key, { value: "no", notes })}
                    className={cn(
                      "px-2 py-1 rounded text-xs font-medium border",
                      value === "no"
                        ? "bg-red-50 border-red-200 text-red-700"
                        : "bg-white border-neutral-200 text-neutral-500"
                    )}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    No
                  </motion.button>
                </div>
              </div>

              <div className="mt-3">
                <textarea
                  value={notes}
                  onChange={(e) =>
                    onDraftChange(key, {
                      value,
                      notes: e.target.value,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      onSave(key);
                    }
                  }}
                  placeholder="Add context (optional) - Ctrl+Enter to save"
                  rows={2}
                  className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm placeholder:text-neutral-300 focus:outline-none focus:border-neutral-400 transition-all resize-none"
                />
              </div>

              <div className="flex justify-end mt-2">
                <motion.button
                  type="button"
                  onClick={() => onSave(key)}
                  disabled={!value || isSaving}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.1 }}
                >
                  {isSaving ? "Saving..." : "Save"}
                </motion.button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <motion.div
          className="w-8 h-8 rounded-full border-2 border-neutral-200 border-t-neutral-900 mx-auto"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        <p className="text-neutral-400 text-sm mt-4">{message}</p>
      </div>
    </div>
  );
}

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center cursor-pointer"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 max-w-lg w-full shadow-xl cursor-default"
        onClick={(e) => e.stopPropagation()} // Prevent click from bubbling to dismiss overlay
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-neutral-900">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-neutral-100"
          >
            <X size={20} className="text-neutral-500" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-neutral-600">Previous Session</span>
            <Kbd>Shift</Kbd> + <Kbd>↑</Kbd>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-neutral-600">Next Session</span>
            <Kbd>Shift</Kbd> + <Kbd>↓</Kbd>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-neutral-600">Toggle Grades Panel</span>
            <Kbd>g</Kbd>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-neutral-600">Add Annotation</span>
            <Kbd>a</Kbd>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-neutral-600">Cancel Annotation</span>
            <Kbd>Esc</Kbd>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-neutral-600">Play / Pause Audio</span>
            <Kbd>Space</Kbd>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-neutral-600">Skip Back 5s</span>
            <Kbd>←</Kbd>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-neutral-600">Skip Forward 5s</span>
            <Kbd>→</Kbd>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-neutral-600">Save Grade Notes</span>
            <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-neutral-600">Toggle Shortcuts Overlay</span>
            <Kbd>?</Kbd>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function SessionAnnotator() {
  const { account, isAccountLoading, hasAttemptedFetch } = useValues(authLogic);
  const [sessions, setSessions] = useState<SessionList[]>([]);
  // Map of session ID to full session details
  const [sessionDetailsMap, setSessionDetailsMap] = useState<
    Record<string, Session>
  >({});
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);

  // Get session from URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const sessionFromUrl = urlParams.get("session");

  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAddingAnnotation, setIsAddingAnnotation] = useState(false);
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(
    null
  );
  const [severityFilter, setSeverityFilter] = useState<
    AnnotationSeverity | "all"
  >("all");
  const seekRef = useRef<((time: number) => void) | null>(null);

  const handleSeek = useCallback((time: number) => {
    if (seekRef.current) {
      seekRef.current(time);
    } else {
      setCurrentTime(time);
    }
  }, []);

  // Filter/sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [showFilters, setShowFilters] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 20;
  const [showGrades, setShowGrades] = useState(false);
  const [sessionGradeDrafts, setSessionGradeDrafts] = useState<
    Record<string, SessionGradeDraft>
  >({});
  const [sessionGradeSaving, setSessionGradeSaving] = useState<
    Record<string, Record<SessionGradeKey, boolean>>
  >({});
  const [showShortcutsOverlay, setShowShortcutsOverlay] = useState(false);
  const [activeTab, setActiveTab] = useState<ContentTab>("transcription");
  const [sessionTrace, setSessionTrace] = useState<TraceDetail | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [loadingMoreSpans, setLoadingMoreSpans] = useState(false);
  const [clearModalSessionId, setClearModalSessionId] = useState<string | null>(
    null
  );
  const [clearSelectionMode, setClearSelectionMode] = useState<"all" | "users">(
    "all"
  );
  const [clearSelectedUsers, setClearSelectedUsers] = useState<Set<string>>(
    new Set()
  );
  const [clearingAnnotations, setClearingAnnotations] = useState(false);
  const [rerunningGemini, setRerunningGemini] = useState<
    Record<string, boolean>
  >({});

  const isAdmin = account?.is_admin ?? false;
  const clearModalSession = useMemo(
    () => (clearModalSessionId ? sessionDetailsMap[clearModalSessionId] : null),
    [clearModalSessionId, sessionDetailsMap]
  );
  const clearModalUserOptions = useMemo(() => {
    if (!clearModalSession) return [];
    const map = new Map<string, string>();
    (clearModalSession.annotations || [])
      .filter((a) => !isSessionGradeAnnotation(a))
      .forEach((annotation) => {
        const key =
          annotation.created_by || annotation.created_by_name || "unknown-user";
        const name = annotation.created_by_name || "Unknown user";
        if (!map.has(key)) {
          map.set(key, name);
        }
      });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [clearModalSession]);

  const openClearModal = useCallback((sessionId: string) => {
    setClearModalSessionId(sessionId);
    setClearSelectionMode("all");
    setClearSelectedUsers(new Set());
  }, []);

  const closeClearModal = useCallback(() => {
    setClearModalSessionId(null);
    setClearSelectionMode("all");
    setClearSelectedUsers(new Set());
  }, []);

  const toggleClearUser = useCallback((userId: string) => {
    setClearSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  // Filter and sort sessions (search is now server-side)
  const filteredSessions = useMemo(() => {
    let filtered = [...sessions];

    // Date filter (client-side for quick filtering within current page)
    const now = new Date();
    if (dateFilter === "today") {
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
      filtered = filtered.filter(
        (s) => s.created_at && new Date(s.created_at) >= todayStart
      );
    } else if (dateFilter === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(
        (s) => s.created_at && new Date(s.created_at) >= weekAgo
      );
    } else if (dateFilter === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(
        (s) => s.created_at && new Date(s.created_at) >= monthAgo
      );
    }

    // Sort (client-side for current page)
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "recent":
          return (
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
          );
        case "oldest":
          return (
            new Date(a.created_at || 0).getTime() -
            new Date(b.created_at || 0).getTime()
          );
        case "longest":
          return (
            (b.audio_duration_seconds || 0) - (a.audio_duration_seconds || 0)
          );
        case "shortest":
          return (
            (a.audio_duration_seconds || 0) - (b.audio_duration_seconds || 0)
          );
        case "name":
          return (a.name || "").localeCompare(b.name || "");
        default:
          return 0;
      }
    });

    return filtered;
  }, [sessions, sortBy, dateFilter]);

  // Derived active sessions with offsets
  const activeSessions = useMemo(() => {
    if (selectedSessionIds.length === 0) return [];

    // Sort selected IDs by creation date (using the summary list)
    const sortedIds = [...selectedSessionIds].sort((a, b) => {
      const sessionA = sessions.find((s) => s.id === a);
      const sessionB = sessions.find((s) => s.id === b);
      if (!sessionA || !sessionB) return 0;
      return (
        new Date(sessionA.created_at || 0).getTime() -
        new Date(sessionB.created_at || 0).getTime()
      );
    });

    let currentOffset = 0;
    return sortedIds
      .map((id) => sessionDetailsMap[id])
      .filter(Boolean)
      .map((session): ActiveSession => {
        const offset = currentOffset;
        currentOffset += session.audio_duration_seconds || 0;
        return { ...session, offset };
      });
  }, [selectedSessionIds, sessionDetailsMap, sessions]);

  // Combined annotations from all sessions
  const allAnnotations = useMemo(() => {
    return activeSessions
      .flatMap((session) =>
        (session.annotations || [])
          .filter((a) => !isSessionGradeAnnotation(a))
          .map((a) => ({
            ...a,
            start_time: a.start_time + session.offset,
            end_time: a.end_time + session.offset,
            original_session_id: session.id,
          }))
      )
      .sort((a, b) => a.start_time - b.start_time);
  }, [activeSessions]);

  const annotations = useMemo(() => {
    if (severityFilter === "all") return allAnnotations;
    return allAnnotations.filter((a) => {
      const aSeverity = (a.severity as AnnotationSeverity) || "preference";
      return aSeverity === severityFilter;
    });
  }, [allAnnotations, severityFilter]);

  // Current active session segment
  const currentSegment = useMemo(() => {
    if (activeSessions.length === 0) return null;
    const active = activeSessions.find(
      (s) =>
        currentTime >= s.offset &&
        currentTime < s.offset + (s.audio_duration_seconds || 0)
    );
    return active || activeSessions[activeSessions.length - 1];
  }, [currentTime, activeSessions]);

  useEffect(() => {
    if (activeSessions.length === 0) return;

    setSessionGradeDrafts((prev) => {
      const next = { ...prev };
      activeSessions.forEach((session) => {
        const derived = deriveSessionGradeDraft(session.annotations);
        if (!next[session.id]) {
          next[session.id] = derived;
        } else {
          SESSION_GRADE_KEYS.forEach((key) => {
            if (!next[session.id][key]) {
              next[session.id][key] = derived[key];
            }
          });
        }
      });
      return next;
    });

    setSessionGradeSaving((prev) => {
      const next = { ...prev };
      activeSessions.forEach((session) => {
        if (!next[session.id]) {
          next[session.id] = createEmptySessionGradeSavingState();
        }
      });
      return next;
    });
  }, [activeSessions]);

  const fetchSessions = useCallback(
    async (search: string = "", page: number = 1) => {
      setLoading(true);
      const { data, error } = await client.GET("/api/entities/sessions/", {
        params: {
          query: {
            search: search || undefined,
            page,
            page_size: PAGE_SIZE,
            processed_only: "true",
          },
        },
      });
      setLoading(false);

      if (error) {
        toast.error("Failed to load sessions");
        console.error(error);
        return;
      }

      // The API returns a paginated response object (typed as array due to DRF defaults)
      const paginatedData = data as unknown as PaginatedSessionListResponse;
      setSessions(paginatedData.results);
      setTotalCount(paginatedData.count);
      setTotalPages(paginatedData.total_pages);
      setCurrentPage(paginatedData.page);
    },
    []
  );

  const fetchSessionTrace = useCallback(
    async (sessionId: string, spanName?: string) => {
      setTraceLoading(true);
      try {
        // First, get the list of traces for this session
        const { data: listData, error: listError } = await client.GET(
          "/api/tracing/sessions/{session_id}/traces/",
          {
            params: {
              path: { session_id: sessionId },
              query: { limit: 1 },
            },
          }
        );
        if (listError || !listData) {
          setSessionTrace(null);
          return;
        }

        const traces =
          (listData as { results: { id: string }[] }).results || [];

        if (traces.length === 0) {
          setSessionTrace(null);
          return;
        }

        // Fetch full trace details for the first trace
        const traceId = traces[0].id;
        const { data: traceData, error: traceError } = await client.GET(
          "/api/tracing/traces/{trace_id}/",
          {
            params: {
              path: { trace_id: traceId },
              query: spanName ? { name: spanName, limit: 1000 } : undefined,
            },
          }
        );

        if (!traceError && traceData) {
          setSessionTrace(traceData as TraceDetail);
        } else {
          setSessionTrace(null);
        }
      } catch (error) {
        console.error("Failed to fetch trace", error);
        setSessionTrace(null);
      } finally {
        setTraceLoading(false);
      }
    },
    []
  );

  // Load more spans for the current trace (pagination)
  const loadMoreSpans = useCallback(async () => {
    if (
      !sessionTrace ||
      loadingMoreSpans ||
      !sessionTrace.spans_pagination?.has_more
    )
      return;

    setLoadingMoreSpans(true);
    try {
      const { data, error } = await client.GET(
        "/api/tracing/traces/{trace_id}/",
        {
          params: {
            path: { trace_id: sessionTrace.id },
            query: {
              limit: 100,
              offset: sessionTrace.spans.length,
            },
          },
        }
      );

      if (!error && data) {
        const traceData = data as TraceDetail;
        // Append new spans to existing
        setSessionTrace((prev) =>
          prev
            ? {
                ...prev,
                spans: [...prev.spans, ...traceData.spans],
                spans_pagination: traceData.spans_pagination,
              }
            : traceData
        );
      }
    } catch (error) {
      console.error("Failed to load more spans", error);
    } finally {
      setLoadingMoreSpans(false);
    }
  }, [sessionTrace, loadingMoreSpans]);

  const fetchSessionDetails = useCallback(
    async (ids: string[]) => {
      // Only fetch what we don't have
      const missingIds = ids.filter((id) => !sessionDetailsMap[id]);
      if (missingIds.length === 0) return;

      setSessionLoading(true);

      // Parallel fetch
      const results = await Promise.all(
        missingIds.map((id) =>
          client
            .GET("/api/entities/sessions/{id}/", { params: { path: { id } } })
            .then((res) => ({ id, ...res }))
        )
      );

      setSessionLoading(false);

      const newDetails = { ...sessionDetailsMap };
      let hasError = false;

      results.forEach(({ id, data, error }) => {
        if (error) {
          console.error(`Failed to load session ${id}`, error);
          hasError = true;
        } else if (data) {
          newDetails[id] = data as Session;
        }
      });

      if (hasError) toast.error("Failed to load some sessions");
      setSessionDetailsMap(newDetails);
    },
    [sessionDetailsMap]
  );

  const handleSessionSelect = useCallback(
    (session: SessionList, e: React.MouseEvent) => {
      let newIds = [session.id];

      if (e.metaKey || e.ctrlKey) {
        // Toggle selection
        if (selectedSessionIds.includes(session.id)) {
          newIds = selectedSessionIds.filter((id) => id !== session.id);
        } else {
          newIds = [...selectedSessionIds, session.id];
        }
      } else if (e.shiftKey && selectedSessionIds.length > 0) {
        // Range select (simplified: just add to current if not present, or basic logic)
        // Implementing full range select requires finding indices in filteredSessions
        const lastSelected = selectedSessionIds[selectedSessionIds.length - 1];
        const idx1 = filteredSessions.findIndex((s) => s.id === lastSelected);
        const idx2 = filteredSessions.findIndex((s) => s.id === session.id);

        if (idx1 !== -1 && idx2 !== -1) {
          const start = Math.min(idx1, idx2);
          const end = Math.max(idx1, idx2);
          const rangeIds = filteredSessions
            .slice(start, end + 1)
            .map((s) => s.id);
          // Merge unique
          newIds = Array.from(new Set([...selectedSessionIds, ...rangeIds]));
        } else {
          newIds = [...selectedSessionIds, session.id];
        }
      }

      if (newIds.length === 0) newIds = [session.id]; // Always keep one selected if clicking? Or allow empty?
      // Let's allow empty if deselecting the only one with ctrl
      if (e.metaKey || e.ctrlKey) {
        if (
          selectedSessionIds.includes(session.id) &&
          selectedSessionIds.length === 1
        ) {
          newIds = [];
        }
      }

      setSelectedSessionIds(newIds);
      if (newIds.length > 0) {
        fetchSessionDetails(newIds);
        setCurrentTime(0);
        setIsPlaying(false);
        setActiveAnnotation(null);
        setSessionTrace(null);
        // If we have exactly one session, fetch its trace
        if (newIds.length === 1) {
          fetchSessionTrace(newIds[0]);
        }
      }
    },
    [
      selectedSessionIds,
      filteredSessions,
      fetchSessionDetails,
      fetchSessionTrace,
    ]
  );

  // Load trace for the current audio segment if needed
  useEffect(() => {
    if (
      (activeTab === "playground" || activeTab === "traces") &&
      currentSegment?.id &&
      sessionTrace?.session !== currentSegment.id &&
      !traceLoading
    ) {
      fetchSessionTrace(currentSegment.id);
    }
  }, [
    activeTab,
    currentSegment?.id,
    sessionTrace?.session,
    traceLoading,
    fetchSessionTrace,
  ]);

  const createAnnotation = useCallback(
    async (annotationData: Omit<AnnotationRequest, "session">) => {
      // Find which session this time belongs to
      const session = activeSessions.find(
        (s) =>
          annotationData.start_time >= s.offset &&
          annotationData.start_time < s.offset + (s.audio_duration_seconds || 0)
      );

      if (!session) {
        toast.error("Could not determine session for this time");
        return;
      }

      // Adjust times to be relative to session
      const localAnnotation = {
        ...annotationData,
        start_time: annotationData.start_time - session.offset,
        end_time: annotationData.end_time - session.offset,
        session: session.id,
      };

      const { data, error } = await client.POST("/api/entities/annotations/", {
        body: localAnnotation,
      });

      if (error) {
        toast.error("Failed to create annotation");
        console.error(error);
      } else {
        toast.success("Annotation saved");
        // Update local state
        const updatedSession = {
          ...session,
          annotations: [...session.annotations, data].sort(
            (a, b) => a.start_time - b.start_time
          ),
        };
        setSessionDetailsMap((prev) => ({
          ...prev,
          [session.id]: updatedSession,
        }));

        setIsAddingAnnotation(false);
        // Update counts in list
        setSessions((prev) =>
          prev.map((s) =>
            s.id === session.id
              ? {
                  ...s,
                  annotation_count: (s.annotation_count ?? 0) + 1,
                }
              : s
          )
        );
      }
    },
    [activeSessions]
  );

  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      // Find session that has this annotation
      // We attached `original_session_id` to annotations in `annotations` memo,
      // but `deleteAnnotation` receives ID. We need to look it up.
      // The `activeAnnotation` has the ID.

      let targetSessionId = "";
      for (const s of activeSessions) {
        if (s.annotations.some((a) => a.id === annotationId)) {
          targetSessionId = s.id;
          break;
        }
      }
      if (!targetSessionId) return;

      const { error } = await client.DELETE("/api/entities/annotations/{id}/", {
        params: { path: { id: annotationId } },
      });

      if (error) {
        toast.error("Failed to delete annotation");
        console.error(error);
      } else {
        toast.success("Annotation deleted");

        // Update local state
        setSessionDetailsMap((prev) => ({
          ...prev,
          [targetSessionId]: {
            ...prev[targetSessionId],
            annotations: prev[targetSessionId].annotations.filter(
              (a) => a.id !== annotationId
            ),
          },
        }));

        if (activeAnnotation?.id === annotationId) setActiveAnnotation(null);
        setSessions((prev) =>
          prev.map((s) =>
            s.id === targetSessionId
              ? {
                  ...s,
                  annotation_count: Math.max(0, (s.annotation_count ?? 0) - 1),
                }
              : s
          )
        );
      }
    },
    [activeSessions, activeAnnotation]
  );

  const updateAnnotation = useCallback(
    async (
      annotationId: string,
      updates: Partial<AnnotationRequest>
    ): Promise<boolean> => {
      let targetSessionId = "";
      let offset = 0;

      for (const s of activeSessions) {
        if (s.annotations.some((a) => a.id === annotationId)) {
          targetSessionId = s.id;
          offset = s.offset;
          break;
        }
      }
      if (!targetSessionId) return false;

      const body: Partial<AnnotationRequest> = { ...updates };
      if (updates.start_time !== undefined) {
        body.start_time = updates.start_time - offset;
      }
      if (updates.end_time !== undefined) {
        body.end_time = updates.end_time - offset;
      }

      const { data, error } = await client.PATCH(
        "/api/entities/annotations/{id}/",
        {
          params: { path: { id: annotationId } },
          body,
        }
      );

      if (error) {
        toast.error("Failed to update annotation");
        console.error(error);
        return false;
      } else if (data) {
        setSessionDetailsMap((prev) => ({
          ...prev,
          [targetSessionId]: {
            ...prev[targetSessionId],
            annotations: prev[targetSessionId].annotations
              .map((a) => (a.id === annotationId ? data : a))
              .sort((a, b) => a.start_time - b.start_time),
          },
        }));
        return true;
      }
      return false;
    },
    [activeSessions]
  );

  const clearAnnotationsForSession = useCallback(async () => {
    if (!clearModalSessionId) return;
    const session = sessionDetailsMap[clearModalSessionId];
    if (!session) return;

    const userFilter =
      clearSelectionMode === "users" ? clearSelectedUsers : null;

    const targets = (session.annotations || []).filter(
      (annotation) =>
        !isSessionGradeAnnotation(annotation) &&
        (!userFilter ||
          userFilter.has(
            annotation.created_by ||
              annotation.created_by_name ||
              "unknown-user"
          ))
    );

    if (targets.length === 0) {
      toast.info("No matching annotations to clear");
      closeClearModal();
      return;
    }

    setClearingAnnotations(true);

    const results = await Promise.all(
      targets.map((annotation) =>
        client
          .DELETE("/api/entities/annotations/{id}/", {
            params: { path: { id: annotation.id } },
          })
          .then((res) => ({
            id: annotation.id,
            error: res.error,
          }))
      )
    );

    const deletedIds = new Set(
      results.filter((r) => !r.error).map((r) => r.id)
    );
    const failed = results.filter((r) => r.error);

    if (deletedIds.size > 0) {
      setSessionDetailsMap((prev) => {
        const current = prev[clearModalSessionId];
        if (!current) return prev;

        const remaining = (current.annotations || []).filter(
          (a) => !deletedIds.has(a.id)
        );

        return {
          ...prev,
          [clearModalSessionId]: { ...current, annotations: remaining },
        };
      });

      setSessions((prev) =>
        prev.map((s) =>
          s.id === clearModalSessionId
            ? {
                ...s,
                annotation_count: Math.max(
                  0,
                  (s.annotation_count ?? 0) - deletedIds.size
                ),
              }
            : s
        )
      );

      if (activeAnnotation && deletedIds.has(activeAnnotation.id)) {
        setActiveAnnotation(null);
      }
    }

    if (failed.length === 0) {
      toast.success(`Cleared ${deletedIds.size} annotations`);
    } else {
      toast.error(
        `Cleared ${deletedIds.size} annotations, ${failed.length} failed`
      );
    }

    setClearingAnnotations(false);
    closeClearModal();
  }, [
    activeAnnotation,
    clearModalSessionId,
    clearSelectedUsers,
    clearSelectionMode,
    closeClearModal,
    sessionDetailsMap,
    setSessionDetailsMap,
    setSessions,
  ]);

  const rerunGeminiAnnotations = useCallback(
    async (sessionId: string) => {
      setRerunningGemini((prev) => ({ ...prev, [sessionId]: true }));

      const session = sessionDetailsMap[sessionId];
      const existingGemini = (session?.annotations || []).filter(
        (a) => a.created_by_name === "Gemini" && !isSessionGradeAnnotation(a)
      );

      try {
        const { data, error } = await client.POST(
          "/api/entities/sessions/{id}/rerun-gemini/",
          { params: { path: { id: sessionId } } }
        );

        if (error || !data) {
          throw new Error("Failed to rerun Gemini annotations");
        }

        const cleared = data.cleared ?? existingGemini.length;

        if (session) {
          const remaining = (session.annotations || []).filter(
            (a) =>
              !(a.created_by_name === "Gemini" && !isSessionGradeAnnotation(a))
          );
          setSessionDetailsMap((prev) => ({
            ...prev,
            [sessionId]: { ...session, annotations: remaining },
          }));
          if (existingGemini.length > 0) {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      annotation_count: Math.max(
                        0,
                        (s.annotation_count ?? 0) - existingGemini.length
                      ),
                    }
                  : s
              )
            );
          }
        }

        toast.success(
          `Gemini re-run started${cleared ? `, cleared ${cleared} annotations` : ""}`
        );
      } catch (error) {
        console.error("Failed to rerun Gemini annotations", error);
        toast.error("Failed to re-run Gemini annotations");
      } finally {
        setRerunningGemini((prev) => ({ ...prev, [sessionId]: false }));
      }
    },
    [sessionDetailsMap, setSessionDetailsMap, setSessions]
  );

  const confirmAndRerunGemini = useCallback(
    (sessionId: string) => {
      if (rerunningGemini[sessionId]) return;
      const shouldRerun = window.confirm(
        "Re-run Gemini annotations? Existing Gemini annotations (non-grade) will be cleared and regenerated."
      );
      if (!shouldRerun) return;
      rerunGeminiAnnotations(sessionId);
    },
    [rerunGeminiAnnotations, rerunningGemini]
  );

  const saveSessionGrade = useCallback(
    async (sessionId: string, key: SessionGradeKey) => {
      const draft = sessionGradeDrafts[sessionId]?.[key];
      const session = sessionDetailsMap[sessionId];

      if (!session || !draft) return;
      if (!draft.value) {
        toast.error("Choose Yes or No before saving");
        return;
      }

      setSessionGradeSaving((prev) => ({
        ...prev,
        [sessionId]: {
          ...(prev[sessionId] || createEmptySessionGradeSavingState()),
          [key]: true,
        },
      }));

      const note = buildSessionGradeNote(key, draft.value, draft.notes);
      const payloadBase = {
        start_time: 0,
        end_time: session.audio_duration_seconds || 0,
        sentiment: (draft.value === "yes"
          ? "positive"
          : "negative") as Sentiment,
        notes: note,
        category: null,
      };

      const existing = (session.annotations || []).find((annotation) => {
        const parsed = parseSessionGradeAnnotation(annotation);
        return parsed?.key === key;
      });

      const request = existing
        ? client.PATCH("/api/entities/annotations/{id}/", {
            params: { path: { id: existing.id } },
            body: payloadBase,
          })
        : client.POST("/api/entities/annotations/", {
            body: { ...payloadBase, session: session.id },
          });

      const { data, error } = await request;

      if (error) {
        toast.error("Failed to save grade");
        console.error(error);
      } else if (data) {
        toast.success("Session grade saved");
        setSessionDetailsMap((prev) => {
          const current = prev[sessionId];
          if (!current) return prev;

          const annotations = existing
            ? current.annotations.map((a) => (a.id === existing.id ? data : a))
            : [...(current.annotations || []), data];

          return {
            ...prev,
            [sessionId]: {
              ...current,
              annotations: annotations.sort(
                (a, b) => a.start_time - b.start_time
              ),
            },
          };
        });

        if (!existing) {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    annotation_count: (s.annotation_count ?? 0) + 1,
                  }
                : s
            )
          );
        }
      }

      setSessionGradeSaving((prev) => ({
        ...prev,
        [sessionId]: {
          ...(prev[sessionId] || createEmptySessionGradeSavingState()),
          [key]: false,
        },
      }));
    },
    [
      sessionGradeDrafts,
      sessionDetailsMap,
      setSessionGradeSaving,
      setSessionDetailsMap,
      setSessions,
    ]
  );

  const handleSessionGradeDraftChange = useCallback(
    (
      sessionId: string,
      key: SessionGradeKey,
      value: SessionGradeDraft[SessionGradeKey]
    ) => {
      setSessionGradeDrafts((prev) => ({
        ...prev,
        [sessionId]: {
          ...(prev[sessionId] ||
            deriveSessionGradeDraft(sessionDetailsMap[sessionId]?.annotations)),
          [key]: value,
        },
      }));
    },
    [sessionDetailsMap]
  );

  const canMerge = useMemo(() => {
    if (activeSessions.length < 2) return false;
    const firstProfile = activeSessions[0].profile;
    return activeSessions.every((s) => s.profile === firstProfile);
  }, [activeSessions]);

  const mergeSessions = useCallback(async () => {
    if (!canMerge) {
      toast.error("Cannot merge sessions from different users");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to merge ${activeSessions.length} sessions? This will combine annotations/transcripts and delete the original source sessions.`
      )
    ) {
      return;
    }

    setSessionLoading(true);
    const { data, error } = await client.POST("/api/entities/sessions/merge/", {
      body: { session_ids: activeSessions.map((s) => s.id) },
    });

    if (error) {
      toast.error("Failed to merge sessions");
      console.error(error);
      setSessionLoading(false);
    } else if (data) {
      const mergedSession = data as unknown as Session;
      toast.success("Sessions merged successfully");
      await fetchSessions(debouncedSearch, currentPage);
      setSelectedSessionIds([mergedSession.id]);
      // Also fetch the full details for the merged session
      fetchSessionDetails([mergedSession.id]);
      // The loading state will be cleared by fetchSessionDetails
    }
  }, [
    activeSessions,
    fetchSessions,
    fetchSessionDetails,
    canMerge,
    debouncedSearch,
    currentPage,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow Escape to cancel actions even when focused on inputs
      if (e.key === "Escape") {
        if (isAddingAnnotation) {
          e.preventDefault();
          setIsAddingAnnotation(false);
          return;
        }
        if (showShortcutsOverlay) {
          e.preventDefault();
          setShowShortcutsOverlay(false);
          return;
        }
      }

      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement
      ) {
        return;
      }

      if (e.key === "a") {
        e.preventDefault();
        setIsAddingAnnotation(true);
        setIsPlaying(false);
        return;
      }

      if (e.key === "g") {
        e.preventDefault();
        setShowGrades((prev) => !prev);
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setShowShortcutsOverlay((prev) => !prev);
        return;
      }

      if (e.shiftKey) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const currentId = selectedSessionIds[0];
          if (!currentId) return;

          const currentIndex = filteredSessions.findIndex(
            (s) => s.id === currentId
          );
          if (currentIndex === -1) return;

          let nextIndex = -1;
          if (e.key === "ArrowDown") {
            nextIndex = Math.min(currentIndex + 1, filteredSessions.length - 1);
          } else {
            nextIndex = Math.max(currentIndex - 1, 0);
          }

          if (nextIndex !== currentIndex && nextIndex !== -1) {
            const nextSession = filteredSessions[nextIndex];
            setSelectedSessionIds([nextSession.id]);
            fetchSessionDetails([nextSession.id]);
            setCurrentTime(0);
            setIsPlaying(false);
            setActiveAnnotation(null);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    filteredSessions,
    selectedSessionIds,
    fetchSessionDetails,
    isAddingAnnotation,
    showShortcutsOverlay,
  ]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch sessions when search or page changes
  useEffect(() => {
    if (isAdmin) fetchSessions(debouncedSearch, currentPage);
  }, [fetchSessions, isAdmin, debouncedSearch, currentPage]);

  // Auto-select session from URL parameter
  useEffect(() => {
    if (
      sessionFromUrl &&
      sessions.length > 0 &&
      selectedSessionIds.length === 0
    ) {
      // Check if the session exists in the loaded sessions
      const sessionExists = sessions.some((s) => s.id === sessionFromUrl);
      if (sessionExists) {
        setSelectedSessionIds([sessionFromUrl]);
        fetchSessionDetails([sessionFromUrl]);
        setCurrentTime(0);
        setIsPlaying(false);
        setActiveAnnotation(null);
        setSessionTrace(null);
        fetchSessionTrace(sessionFromUrl);
      }
    }
  }, [
    sessionFromUrl,
    sessions,
    selectedSessionIds.length,
    fetchSessionDetails,
    fetchSessionTrace,
  ]);

  useEffect(() => {
    if (activeSessions.length === 0 || isAddingAnnotation) return;
    const active = annotations.find(
      (a) => currentTime >= a.start_time && currentTime <= a.end_time
    );
    // When finding active from global list, it has adjusted times.
    // That's what we want for display.
    setActiveAnnotation(active || null);
  }, [currentTime, activeSessions, isAddingAnnotation, annotations]);

  if (isAccountLoading || !hasAttemptedFetch) {
    return <LoadingScreen message="Checking access..." />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={24} className="text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-neutral-900 mb-1">
            Access Denied
          </h1>
          <p className="text-neutral-400 text-sm">
            This tool is only available to admin accounts.
          </p>
        </motion.div>
      </div>
    );
  }

  // Representative session for display (header etc)
  const primarySession = activeSessions[0];

  return (
    <div className="h-screen bg-white flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 border-r border-neutral-100 flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-neutral-100 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-semibold text-neutral-900">
                Session Annotator
              </h1>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                {totalCount} sessions
                {debouncedSearch && ` matching "${debouncedSearch}"`}
              </p>
            </div>
            <motion.button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                showFilters
                  ? "bg-neutral-100 text-neutral-900"
                  : "text-neutral-400 hover:text-neutral-600"
              )}
              whileTap={{ scale: 0.95 }}
            >
              <ChevronDown
                size={16}
                className={cn(
                  "transition-transform",
                  showFilters && "rotate-180"
                )}
              />
            </motion.button>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-400 transition-colors"
            />
          </div>
        </div>

        {/* Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              className="p-4 border-b border-neutral-100 space-y-3 shrink-0"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Sort */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">
                  Sort by
                </label>
                <div className="flex flex-wrap gap-1">
                  {[
                    { value: "recent", label: "Recent", icon: ArrowDownAZ },
                    { value: "oldest", label: "Oldest", icon: ArrowUpAZ },
                    { value: "longest", label: "Longest", icon: Clock },
                    { value: "shortest", label: "Shortest", icon: Clock },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setSortBy(opt.value as SortOption)}
                      className={cn(
                        "px-2 py-1 rounded text-xs transition-colors",
                        sortBy === opt.value
                          ? "bg-neutral-900 text-white"
                          : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date filter */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">
                  Date range
                </label>
                <div className="flex flex-wrap gap-1">
                  {[
                    { value: "all", label: "All time" },
                    { value: "today", label: "Today" },
                    { value: "week", label: "This week" },
                    { value: "month", label: "This month" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDateFilter(opt.value as DateFilter)}
                      className={cn(
                        "px-2 py-1 rounded text-xs transition-colors",
                        dateFilter === opt.value
                          ? "bg-neutral-900 text-white"
                          : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clear filters */}
              {(searchQuery || sortBy !== "recent" || dateFilter !== "all") && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSortBy("recent");
                    setDateFilter("all");
                  }}
                  className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  Clear filters
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Session list - scrollable */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
          {loading ? (
            <div className="text-center py-8">
              <p className="text-xs text-neutral-400">Loading sessions...</p>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-neutral-400">No sessions found</p>
            </div>
          ) : (
            filteredSessions.map((session) => (
              <SessionListItem
                key={session.id}
                session={session}
                isSelected={selectedSessionIds.includes(session.id)}
                onClick={(e: React.MouseEvent) =>
                  handleSessionSelect(session, e)
                }
              />
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-neutral-100 bg-white">
            <span className="text-[10px] text-neutral-400">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="p-1 rounded hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {sessionLoading && activeSessions.length === 0 ? (
          <LoadingScreen message="Loading session..." />
        ) : primarySession ? (
          <motion.div
            className="flex flex-col flex-1 h-full overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            key={primarySession.id}
          >
            {/* Header */}
            <div className="p-6 border-b border-neutral-100">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-neutral-900">
                      {activeSessions.length > 1
                        ? `${activeSessions.length} Sessions Selected`
                        : primarySession.name || "Untitled Session"}
                    </h2>
                    {isAdmin && primarySession?.id && (
                      <a
                        href={`${import.meta.env.VITE_API_URL}/admin/entities/session/${primarySession.id}/change/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neutral-400 hover:text-neutral-700 transition-colors"
                        title="View in admin"
                      >
                        <Lock size={14} />
                      </a>
                    )}
                  </div>
                  <p className="text-sm text-neutral-400 mt-1 max-w-2xl">
                    {activeSessions.length > 1 ? (
                      "Merged View"
                    ) : primarySession.description ? (
                      <TextWithClickableTimestamps
                        text={primarySession.description}
                        onSeek={handleSeek}
                      />
                    ) : (
                      "No description"
                    )}
                  </p>
                  {primarySession.profile_name && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-neutral-400">
                      <User size={12} />
                      {primarySession.profile_name}
                      {activeSessions.length > 1 && (
                        <span className="ml-2 text-neutral-300 italic">
                          (+ {activeSessions.length - 1} others)
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <motion.button
                    onClick={() => setShowGrades(!showGrades)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border",
                      showGrades
                        ? "bg-neutral-900 text-white border-neutral-900"
                        : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50"
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.1 }}
                  >
                    <Flag size={16} />
                    {showGrades ? "Hide Grades" : "Grade Session"}
                  </motion.button>
                  {primarySession && (
                    <motion.button
                      onClick={() => openClearModal(primarySession.id)}
                      className="p-2 rounded-lg text-red-600 border border-red-200 bg-red-50 hover:bg-red-100"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ duration: 0.1 }}
                      title="Clear annotations"
                      aria-label="Clear annotations"
                    >
                      <Trash2 size={16} />
                    </motion.button>
                  )}
                  {primarySession && (
                    <motion.button
                      onClick={() => confirmAndRerunGemini(primarySession.id)}
                      disabled={Boolean(rerunningGemini[primarySession.id])}
                      className="p-2 rounded-lg text-neutral-600 border border-neutral-200 bg-white hover:bg-neutral-100 disabled:opacity-50"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ duration: 0.1 }}
                      title="Re-run Gemini annotations"
                      aria-label="Re-run Gemini annotations"
                    >
                      <RotateCcw
                        size={16}
                        className={cn(
                          rerunningGemini[primarySession.id] && "animate-spin"
                        )}
                      />
                    </motion.button>
                  )}
                  {activeSessions.length > 1 && (
                    <motion.button
                      onClick={mergeSessions}
                      disabled={!canMerge}
                      title={
                        !canMerge
                          ? "Sessions must belong to the same user to merge"
                          : undefined
                      }
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border",
                        canMerge
                          ? "bg-red-50 text-red-600 hover:bg-red-100 border-red-200"
                          : "bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed"
                      )}
                      whileHover={canMerge ? { scale: 1.02 } : undefined}
                      whileTap={canMerge ? { scale: 0.98 } : undefined}
                      transition={{ duration: 0.1 }}
                    >
                      <Trash2 size={16} />
                      Merge & Delete
                    </motion.button>
                  )}
                  <motion.button
                    onClick={() => setIsAddingAnnotation(true)}
                    disabled={isAddingAnnotation}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.1 }}
                  >
                    <Plus size={16} />
                    Annotate
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Audio Player */}
            <AudioPlayer
              sessions={activeSessions}
              currentTime={currentTime}
              setCurrentTime={setCurrentTime}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              annotations={annotations}
              onAnnotationClick={setActiveAnnotation}
              onAnnotationUpdate={updateAnnotation}
              activeAnnotation={activeAnnotation}
              seekRef={seekRef}
            />

            {/* Content with Tabs */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Tab Bar */}
              <div className="border-b border-neutral-100 px-4 flex items-center gap-1 shrink-0 bg-neutral-50">
                <button
                  onClick={() => setActiveTab("transcription")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
                    activeTab === "transcription"
                      ? "border-neutral-900 text-neutral-900"
                      : "border-transparent text-neutral-400 hover:text-neutral-600"
                  )}
                >
                  <FileText size={14} />
                  Transcription
                </button>
                <button
                  onClick={() => setActiveTab("summary")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
                    activeTab === "summary"
                      ? "border-neutral-900 text-neutral-900"
                      : "border-transparent text-neutral-400 hover:text-neutral-600"
                  )}
                >
                  <List size={14} />
                  Timeline
                </button>
                <button
                  onClick={() => setActiveTab("leveling")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
                    activeTab === "leveling"
                      ? "border-neutral-900 text-neutral-900"
                      : "border-transparent text-neutral-400 hover:text-neutral-600"
                  )}
                >
                  <Activity size={14} />
                  Leveling
                </button>
                <button
                  onClick={() => setActiveTab("traces")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
                    activeTab === "traces"
                      ? "border-neutral-900 text-neutral-900"
                      : "border-transparent text-neutral-400 hover:text-neutral-600"
                  )}
                >
                  <Lock size={14} />
                  Traces
                </button>
                <button
                  onClick={() => setActiveTab("playground")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
                    activeTab === "playground"
                      ? "border-neutral-900 text-neutral-900"
                      : "border-transparent text-neutral-400 hover:text-neutral-600"
                  )}
                >
                  <Activity size={14} />
                  Playground
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Main content area */}
                <div className="flex-1 overflow-y-auto">
                  {activeTab === "transcription" && (
                    <div className="p-6">
                      {activeSessions.map((session, index) => (
                        <div key={session.id} className="mb-8">
                          {activeSessions.length > 1 && (
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-neutral-100">
                              <span className="text-xs font-mono text-neutral-400">
                                Session {index + 1}
                              </span>
                              <span className="text-xs font-medium text-neutral-600">
                                {session.name}
                              </span>
                              <span className="text-[10px] text-neutral-300">
                                {formatTime(session.offset)}
                              </span>
                            </div>
                          )}

                          <h3 className="text-[10px] uppercase tracking-wider text-neutral-400 mb-4">
                            Transcript
                          </h3>
                          {session.transcript ? (
                            <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">
                              <TextWithClickableTimestamps
                                text={session.transcript}
                                onSeek={(t) => handleSeek(t + session.offset)}
                              />
                            </p>
                          ) : (
                            <p className="text-sm text-neutral-300 italic">
                              No transcript available
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === "summary" && (
                    <div className="p-6">
                      {activeSessions.map((session, index) => (
                        <div key={session.id} className="mb-8">
                          {activeSessions.length > 1 && (
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-neutral-100">
                              <span className="text-xs font-mono text-neutral-400">
                                Session {index + 1}
                              </span>
                              <span className="text-xs font-medium text-neutral-600">
                                {session.name}
                              </span>
                              <span className="text-[10px] text-neutral-300">
                                {formatTime(session.offset)}
                              </span>
                            </div>
                          )}

                          <h3 className="text-[10px] uppercase tracking-wider text-neutral-400 mb-4">
                            Timestamped Summary
                          </h3>
                          {session.timestamped_summary ? (
                            <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">
                              <TextWithClickableTimestamps
                                text={session.timestamped_summary}
                                onSeek={(t) => handleSeek(t + session.offset)}
                              />
                            </p>
                          ) : (
                            <p className="text-sm text-neutral-300 italic">
                              No timestamped summary available
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === "traces" && (
                    <TraceViewer
                      trace={sessionTrace}
                      loading={traceLoading}
                      showHeader={false}
                      currentTimeSeconds={
                        currentTime - (currentSegment?.offset || 0)
                      }
                      sessionStartedAt={currentSegment?.session_started_at}
                      onLoadMoreSpans={loadMoreSpans}
                      loadingMoreSpans={loadingMoreSpans}
                    />
                  )}

                  {activeTab === "playground" && (
                    <PlaygroundReplayer
                      trace={sessionTrace}
                      currentTimeSeconds={
                        currentTime - (currentSegment?.offset || 0)
                      }
                      sessionStartedAt={currentSegment?.session_started_at}
                    />
                  )}

                  {activeTab === "leveling" && (
                    <div className="p-6 max-w-2xl h-full overflow-y-auto">
                      {activeSessions.map((session: ActiveSession, index) => {
                        const la = session.leveling_assessment;
                        if (!la) return null;

                        const statusColors: Record<string, string> = {
                          too_advanced: "bg-red-50 text-red-700 border-red-100",
                          too_simple:
                            "bg-amber-50 text-amber-700 border-amber-100",
                          appropriate:
                            "bg-emerald-50 text-emerald-700 border-emerald-100",
                          no_signal:
                            "bg-neutral-50 text-neutral-600 border-neutral-100",
                        };

                        return (
                          <div key={session.id} className="mb-8">
                            {activeSessions.length > 1 && (
                              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-neutral-100">
                                <span className="text-xs font-mono text-neutral-400">
                                  Session {index + 1}
                                </span>
                                <span className="text-xs font-medium text-neutral-600">
                                  {session.name}
                                </span>
                              </div>
                            )}

                            <div className="space-y-6">
                              <div>
                                <h3 className="text-[10px] uppercase tracking-wider text-neutral-400 mb-2">
                                  Teaching Level Status
                                </h3>
                                <div
                                  className={cn(
                                    "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border uppercase tracking-wide",
                                    statusColors[la.status] ||
                                      statusColors.no_signal
                                  )}
                                >
                                  {(la.status || "no_signal").replace("_", " ")}
                                </div>
                              </div>

                              <div>
                                <h3 className="text-[10px] uppercase tracking-wider text-neutral-400 mb-2">
                                  Suggested Level
                                </h3>
                                <p className="text-sm text-neutral-900 font-medium">
                                  {la.suggested_level || "No suggestion"}
                                </p>
                              </div>

                              <div>
                                <h3 className="text-[10px] uppercase tracking-wider text-neutral-400 mb-2">
                                  Reasoning
                                </h3>
                                <p className="text-sm text-neutral-600 leading-relaxed">
                                  {la.reasoning || "No reasoning provided"}
                                </p>
                              </div>

                              <div>
                                <h3 className="text-[10px] uppercase tracking-wider text-neutral-400 mb-2">
                                  Evidence
                                </h3>
                                <p className="text-sm text-neutral-600 leading-relaxed italic">
                                  {la.evidence
                                    ? `"${la.evidence}"`
                                    : "No evidence provided"}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {!activeSessions.some(
                        (s: ActiveSession) => s.leveling_assessment
                      ) && (
                        <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                          <Activity size={32} className="mb-2 opacity-20" />
                          <p className="text-sm italic">
                            No leveling assessment available for this session
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Annotations Panel */}
                <div className="w-80 border-l border-neutral-100 flex flex-col">
                  <div className="p-4 border-b border-neutral-100">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[10px] uppercase tracking-wider text-neutral-400">
                        Annotations ·{" "}
                        {severityFilter !== "all" ? (
                          <>
                            <span className="text-neutral-900">
                              {annotations.length}
                            </span>{" "}
                            / {allAnnotations.length}
                          </>
                        ) : (
                          annotations.length
                        )}
                      </h3>
                    </div>
                    <div className="flex gap-1">
                      <motion.button
                        onClick={() => setSeverityFilter("all")}
                        className={cn(
                          "flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors",
                          severityFilter === "all"
                            ? "bg-neutral-900 text-white"
                            : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                        )}
                        whileTap={{ scale: 0.96 }}
                      >
                        All
                      </motion.button>
                      {SEVERITY_OPTIONS.map((option) => (
                        <motion.button
                          key={option.id}
                          onClick={() => setSeverityFilter(option.id)}
                          className={cn(
                            "flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors border",
                            severityFilter === option.id
                              ? SEVERITY_STYLES[option.id]
                              : "bg-white border-neutral-200 text-neutral-400 hover:border-neutral-300"
                          )}
                          whileTap={{ scale: 0.96 }}
                          title={option.name}
                        >
                          {option.name.split(" ")[0]}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    <AnimatePresence>
                      {showGrades && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden space-y-3 mb-4"
                        >
                          {activeSessions.map((session, index) => (
                            <SessionGradeCard
                              key={session.id}
                              session={session}
                              isFocused={showGrades && index === 0}
                              draft={
                                sessionGradeDrafts[session.id] ||
                                createEmptySessionGradeDraft()
                              }
                              saving={
                                sessionGradeSaving[session.id] ||
                                createEmptySessionGradeSavingState()
                              }
                              onDraftChange={(key, value) =>
                                handleSessionGradeDraftChange(
                                  session.id,
                                  key,
                                  value
                                )
                              }
                              onSave={(key) =>
                                saveSessionGrade(session.id, key)
                              }
                            />
                          ))}
                          <div className="h-px bg-neutral-100 my-2" />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence mode="popLayout">
                      {isAddingAnnotation && (
                        <AnnotationForm
                          key="form"
                          currentTime={currentTime}
                          onSubmit={createAnnotation}
                          onCancel={() => setIsAddingAnnotation(false)}
                        />
                      )}
                      {annotations.map((annotation) => (
                        <AnnotationCard
                          key={annotation.id}
                          annotation={annotation}
                          isActive={activeAnnotation?.id === annotation.id}
                          onSeek={(time) => {
                            handleSeek(time);
                            setActiveAnnotation(annotation);
                          }}
                          onUpdate={updateAnnotation}
                          onDelete={() => deleteAnnotation(annotation.id)}
                        />
                      ))}
                    </AnimatePresence>
                    {annotations.length === 0 && !isAddingAnnotation && (
                      <div className="text-center py-12">
                        <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
                          <Minus size={16} className="text-neutral-300" />
                        </div>
                        <p className="text-xs text-neutral-400">
                          No annotations yet
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                <Clock size={20} className="text-neutral-300" />
              </div>
              <p className="text-neutral-400 text-sm">
                Select a session to start
                <br />
                <span className="text-xs text-neutral-300 mt-2 block">
                  Hold Cmd/Ctrl to select multiple
                </span>
              </p>
            </div>
          </div>
        )}
      </div>
      <AnimatePresence>
        {showShortcutsOverlay && (
          <ShortcutsOverlay onClose={() => setShowShortcutsOverlay(false)} />
        )}
        {clearModalSession && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={closeClearModal}
          >
            <motion.div
              className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900">
                    Clear annotations
                  </h3>
                  <p className="text-sm text-neutral-500 mt-1">
                    Choose which users' annotations to clear for{" "}
                    <span className="font-medium text-neutral-800">
                      {clearModalSession.name || "Untitled Session"}
                    </span>
                    .
                  </p>
                </div>
                <button
                  onClick={closeClearModal}
                  className="p-1 rounded-full text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="radio"
                    name="clear-mode"
                    checked={clearSelectionMode === "all"}
                    onChange={() => setClearSelectionMode("all")}
                  />
                  All users
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="radio"
                    name="clear-mode"
                    checked={clearSelectionMode === "users"}
                    onChange={() => setClearSelectionMode("users")}
                  />
                  Specific users
                </label>

                <div className="border rounded-lg p-3 bg-neutral-50">
                  {clearModalUserOptions.length === 0 ? (
                    <p className="text-sm text-neutral-400">
                      No user information available; clearing will remove all
                      non-grade annotations.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {clearModalUserOptions.map((user) => (
                        <label
                          key={user.id}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1 rounded border text-sm",
                            clearSelectedUsers.has(user.id)
                              ? "border-neutral-400 bg-white"
                              : "border-transparent bg-white",
                            clearSelectionMode === "all" && "opacity-50"
                          )}
                        >
                          <input
                            type="checkbox"
                            disabled={clearSelectionMode === "all"}
                            checked={clearSelectedUsers.has(user.id)}
                            onChange={() => toggleClearUser(user.id)}
                          />
                          {user.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={closeClearModal}
                  className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  onClick={clearAnnotationsForSession}
                  disabled={
                    clearingAnnotations ||
                    (clearSelectionMode === "users" &&
                      clearSelectedUsers.size === 0)
                  }
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-sm font-medium text-white",
                    "bg-red-600 hover:bg-red-700 disabled:opacity-50"
                  )}
                >
                  {clearingAnnotations ? "Clearing..." : "Clear annotations"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
