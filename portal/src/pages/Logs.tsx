import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  formatDistanceToNow,
  subDays,
  subHours,
  subWeeks,
} from 'date-fns';
import {
  AnimatePresence,
  motion,
} from 'framer-motion';
import { useValues } from 'kea';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  Lock,
  RefreshCw,
  Search,
  Server,
  X,
} from 'lucide-react';
import {
  ActionIcon,
  Button,
  cn,
  Select,
  TextInput,
} from 'slate-ui';
import { toast } from 'sonner';

import {
  ResizeHandle,
  TraceDetail,
  TraceViewer,
} from '../components/traces';
import { authLogic } from '../logic/authLogic';
import client from '../utils/api';

// Types
interface Entity {
  id: number;
  name: string;
  account_name: string | null;
}

interface TraceListItem {
  id: string;
  name: string;
  entity: number | null;
  entity_name: string | null;
  account_name: string | null;
  session: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
  span_count: number;
}

interface PaginatedResponse<T> {
  results: T[];
  pagination: {
    total_count: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

type SortField = "started_at" | "name" | "duration_ms" | "span_count";
type SortDirection = "asc" | "desc";
type TimeRange = "1h" | "24h" | "3d" | "7d" | "30d" | "all";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24 hours" },
  { value: "3d", label: "Last 3 days" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

function formatDurationCompact(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function getTimeRangeDate(range: TimeRange): Date | null {
  const now = new Date();
  switch (range) {
    case "1h":
      return subHours(now, 1);
    case "24h":
      return subDays(now, 1);
    case "3d":
      return subDays(now, 3);
    case "7d":
      return subWeeks(now, 1);
    case "30d":
      return subDays(now, 30);
    case "all":
      return null;
  }
}

// Table Header Component
function SortableHeader({
  label,
  field,
  currentSort,
  currentDirection,
  onSort,
  className,
}: {
  label: string;
  field: SortField;
  currentSort: SortField;
  currentDirection: SortDirection;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const isActive = currentSort === field;

  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium transition-colors",
        isActive
          ? "text-neutral-900"
          : "text-neutral-400 hover:text-neutral-600",
        className
      )}
    >
      {label}
      {isActive &&
        (currentDirection === "desc" ? (
          <ArrowDown size={10} />
        ) : (
          <ArrowUp size={10} />
        ))}
    </button>
  );
}

// Time Range Dropdown
function TimeRangeDropdown({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
}) {
  const selectItems = TIME_RANGE_OPTIONS.map((o) => ({
    id: o.value,
    name: o.label,
  }));

  return (
    <Select
      items={selectItems}
      value={value}
      onChange={(v) => v && onChange(v as TimeRange)}
      variant="subtle"
      iconLeft={Calendar}
      placeholder="Time range"
      className="shrink-0"
      styles={{
        root: { minWidth: 110 },
      }}
    />
  );
}

// Trace Table Row
function TraceTableRow({
  trace,
  isSelected,
  onClick,
  rowNumber,
}: {
  trace: TraceListItem;
  isSelected: boolean;
  onClick: () => void;
  rowNumber: number;
}) {
  const isComplete = trace.ended_at !== null;

  return (
    <tr
      onClick={onClick}
      className={cn(
        "cursor-pointer border-b border-neutral-50 transition-colors",
        isSelected ? "bg-blue-50" : "hover:bg-neutral-50"
      )}
    >
      {/* Row number */}
      <td className="px-3 py-2.5 text-[10px] text-neutral-300 font-mono w-10">
        {rowNumber}
      </td>

      {/* Status */}
      <td className="px-2 py-2.5 w-8">
        {isComplete ? (
          <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center">
            <Check size={10} className="text-emerald-600" />
          </div>
        ) : (
          <motion.div
            className="w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Activity size={10} className="text-amber-600" />
          </motion.div>
        )}
      </td>

      {/* Created */}
      <td className="px-3 py-2.5 text-xs text-neutral-500 w-28">
        {formatDistanceToNow(new Date(trace.started_at), { addSuffix: true })}
      </td>

      {/* Name */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-mono text-neutral-800 truncate">
            {trace.name}
          </span>
        </div>
        {trace.account_name && (
          <span className="text-[10px] text-neutral-400 flex items-center gap-1 mt-0.5">
            <Server size={9} />
            {trace.account_name}
          </span>
        )}
      </td>

      {/* Duration */}
      <td className="px-3 py-2.5 text-xs font-mono text-neutral-500 w-20">
        {formatDurationCompact(trace.duration_ms)}
      </td>

      {/* Spans */}
      <td className="px-3 py-2.5 text-xs text-neutral-500 w-16">
        <span className="bg-neutral-100 px-1.5 py-0.5 rounded text-[10px]">
          {trace.span_count}
        </span>
      </td>
    </tr>
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

export function Logs() {
  const { account, isAccountLoading, hasAttemptedFetch } = useValues(authLogic);

  // List state
  const [traces, setTraces] = useState<TraceListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  // Detail state
  const [selectedTrace, setSelectedTrace] = useState<TraceDetail | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [loadingMoreSpans, setLoadingMoreSpans] = useState(false);

  // Filter state
  const [entities, setEntities] = useState<Entity[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [entitySearchQuery, setEntitySearchQuery] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [sortField, setSortField] = useState<SortField>("started_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [timeRange, setTimeRange] = useState<TimeRange>("3d");
  const [showFilters, setShowFilters] = useState(false);

  // Panel widths (resizable)
  const [leftPanelWidth, setLeftPanelWidth] = useState(480);
  const [rightPanelWidth, setRightPanelWidth] = useState(384);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize handlers
  const handleLeftResize = useCallback((delta: number) => {
    setLeftPanelWidth((prev) => Math.min(Math.max(prev + delta, 380), 700));
  }, []);

  const handleRightResize = useCallback((delta: number) => {
    setRightPanelWidth((prev) => Math.min(Math.max(prev - delta, 300), 600));
  }, []);

  // Filtered entities for dropdown
  const filteredEntities = useMemo(() => {
    if (!entitySearchQuery) return entities;
    const query = entitySearchQuery.toLowerCase();
    return entities.filter(
      (e) =>
        e.name.toLowerCase().includes(query) ||
        e.id.toString().includes(query) ||
        (e.account_name && e.account_name.toLowerCase().includes(query))
    );
  }, [entities, entitySearchQuery]);

  const limit = 50;
  const isAdmin = account?.is_admin ?? false;

  // Handle sort
  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
      } else {
        setSortField(field);
        setSortDirection("desc");
      }
    },
    [sortField]
  );

  // Get sort param for API
  const sortParam = useMemo(() => {
    const prefix = sortDirection === "desc" ? "-" : "";
    return `${prefix}${sortField}`;
  }, [sortField, sortDirection]);

  // Fetch entities for filter dropdown
  const fetchEntities = useCallback(async () => {
    try {
      const { data, error } = await client.GET("/api/tracing/entities/list/");
      if (!error && data) {
        setEntities(data as Entity[]);
      }
    } catch (error) {
      console.error("Failed to fetch entities", error);
    }
  }, []);

  // Fetch traces
  const fetchTraces = useCallback(
    async (reset = false) => {
      setLoading(true);
      const newOffset = reset ? 0 : offset;

      try {
        // Add time range filter
        const startDate = getTimeRangeDate(timeRange);

        const { data, error } = await client.GET("/api/tracing/traces/list/", {
          params: {
            query: {
              limit,
              offset: newOffset,
              sort: sortParam,
              name: searchQuery || undefined,
              entity_id: selectedEntityId ?? undefined,
              started_after: startDate?.toISOString(),
            },
          },
        });

        if (!error && data) {
          const paginatedData = data as PaginatedResponse<TraceListItem>;
          setTraces(paginatedData.results);
          setTotalCount(paginatedData.pagination.total_count);
          if (reset) {
            setOffset(0);
          }
        } else {
          toast.error("Failed to load traces");
        }
      } catch (error) {
        console.error("Failed to fetch traces", error);
        toast.error("Failed to load traces");
      } finally {
        setLoading(false);
      }
    },
    [offset, sortParam, searchQuery, selectedEntityId, timeRange]
  );

  // Fetch single trace with spans (paginated)
  const fetchTraceDetail = useCallback(
    async (traceId: string, reset = true) => {
      if (reset) {
        setTraceLoading(true);
        setSelectedTrace(null);
      }

      try {
        const { data, error } = await client.GET(
          "/api/tracing/traces/{trace_id}/",
          {
            params: {
              path: { trace_id: traceId },
              query: {
                limit: 100,
                offset: reset ? 0 : (selectedTrace?.spans.length || 0),
              },
            },
          }
        );

        if (!error && data) {
          const traceData = data as TraceDetail;
          if (reset) {
            setSelectedTrace(traceData);
          } else {
            // Append new spans to existing
            setSelectedTrace((prev) =>
              prev
                ? {
                    ...prev,
                    spans: [...prev.spans, ...traceData.spans],
                    spans_pagination: traceData.spans_pagination,
                  }
                : traceData
            );
          }
        } else {
          toast.error("Failed to load trace details");
        }
      } catch (error) {
        console.error("Failed to fetch trace detail", error);
        toast.error("Failed to load trace details");
      } finally {
        setTraceLoading(false);
        setLoadingMoreSpans(false);
      }
    },
    [selectedTrace?.spans.length]
  );

  // Load more spans for current trace
  const loadMoreSpans = useCallback(() => {
    if (!selectedTrace || loadingMoreSpans) return;
    setLoadingMoreSpans(true);
    fetchTraceDetail(selectedTrace.id, false);
  }, [selectedTrace, loadingMoreSpans, fetchTraceDetail]);

  const handleTraceSelect = useCallback(
    (trace: TraceListItem) => {
      setSelectedTraceId(trace.id);
      fetchTraceDetail(trace.id, true);
    },
    [fetchTraceDetail]
  );

  // Initial load
  useEffect(() => {
    if (isAdmin) {
      fetchEntities();
      fetchTraces(true);
    }
  }, [isAdmin, fetchEntities, fetchTraces]);

  // Re-fetch when filters change
  useEffect(() => {
    if (isAdmin) {
      const timer = setTimeout(() => {
        fetchTraces(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [sortParam, searchQuery, selectedEntityId, timeRange, isAdmin, fetchTraces]);

  // Pagination
  const handleNextPage = () => {
    const newOffset = offset + limit;
    setOffset(newOffset);
  };

  const handlePrevPage = () => {
    const newOffset = Math.max(0, offset - limit);
    setOffset(newOffset);
  };

  useEffect(() => {
    if (isAdmin && offset > 0) {
      fetchTraces(false);
    }
  }, [offset, isAdmin, fetchTraces]);

  // Poll running traces every second for live updates
  useEffect(() => {
    if (!selectedTrace || selectedTrace.ended_at) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        // When polling, request enough spans to cover what we've already loaded
        const currentSpanCount = selectedTrace.spans.length;

        const { data, error } = await client.GET(
          "/api/tracing/traces/{trace_id}/",
          {
            params: {
              path: { trace_id: selectedTrace.id },
              query: {
                limit: Math.max(100, currentSpanCount + 50), // Get at least current + some buffer
                offset: 0,
              },
            },
          }
        );

        if (!error && data) {
          setSelectedTrace(data as TraceDetail);
        }
      } catch (error) {
        console.error("Failed to poll trace", error);
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [selectedTrace]);

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
            This page is only available to admin accounts.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-screen bg-white flex overflow-hidden">
      {/* Trace List Panel */}
      <div
        className="border-r border-neutral-100 flex flex-col h-full shrink-0 relative"
        style={{ width: leftPanelWidth }}
      >
        {/* Header */}
        <div className="p-4 border-b border-neutral-100 shrink-0">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h1 className="text-sm font-semibold text-neutral-900 flex items-center gap-2 shrink-0">
              <Activity size={16} className="shrink-0" />
              Logs
            </h1>
            <div className="flex items-center gap-1 shrink-0">
              <TimeRangeDropdown value={timeRange} onChange={setTimeRange} />
              <ActionIcon
                onClick={() => fetchTraces(true)}
                disabled={loading}
                variant="subtle"
                icon={RefreshCw}
                className={cn(loading && "[&_svg]:animate-spin")}
              />
              <ActionIcon
                onClick={() => setShowFilters(!showFilters)}
                variant={showFilters ? "secondary" : "subtle"}
                icon={Filter}
              />
            </div>
          </div>

          {/* Search */}
          <TextInput
            placeholder="Search traces..."
            value={searchQuery}
            onChange={setSearchQuery}
            iconLeft={Search}
          />
        </div>

        {/* Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              className="p-4 border-b border-neutral-100 space-y-3 shrink-0 bg-neutral-50"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Entity filter */}
              <div>
                <TextInput
                  label="Entity"
                  placeholder="Search by name, ID, or account..."
                  value={entitySearchQuery}
                  onChange={setEntitySearchQuery}
                  iconLeft={Search}
                />
                {selectedEntityId !== null && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs bg-white border border-neutral-200 px-2 py-1 rounded flex items-center gap-1.5">
                      <Server size={10} />
                      {entities.find((e) => e.id === selectedEntityId)?.name ||
                        selectedEntityId}
                      <button
                        onClick={() => setSelectedEntityId(null)}
                        className="ml-1 text-neutral-400 hover:text-neutral-600"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  </div>
                )}
                <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-neutral-200 bg-white">
                  <button
                    onClick={() => {
                      setSelectedEntityId(null);
                      setEntitySearchQuery("");
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-xs hover:bg-neutral-50 transition-colors",
                      selectedEntityId === null && "bg-neutral-50 font-medium"
                    )}
                  >
                    All entities
                  </button>
                  {filteredEntities.slice(0, 10).map((entity) => (
                    <button
                      key={entity.id}
                      onClick={() => {
                        setSelectedEntityId(entity.id);
                        setEntitySearchQuery("");
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-xs hover:bg-neutral-50 transition-colors border-t border-neutral-100",
                        selectedEntityId === entity.id &&
                          "bg-neutral-50 font-medium"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{entity.name}</span>
                        <span className="text-[10px] text-neutral-400 ml-2 shrink-0">
                          #{entity.id}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Table */}
        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full">
            <thead className="sticky top-0 bg-white border-b border-neutral-100">
              <tr>
                <th className="px-3 py-2 text-left w-10">
                  <span className="text-[10px] text-neutral-300">#</span>
                </th>
                <th className="px-2 py-2 w-8" />
                <th className="px-3 py-2 text-left w-28">
                  <SortableHeader
                    label="Created"
                    field="started_at"
                    currentSort={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-3 py-2 text-left">
                  <SortableHeader
                    label="Name"
                    field="name"
                    currentSort={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-3 py-2 text-left w-20">
                  <SortableHeader
                    label="Duration"
                    field="duration_ms"
                    currentSort={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-3 py-2 text-left w-16">
                  <SortableHeader
                    label="Spans"
                    field="span_count"
                    currentSort={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && traces.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <div className="flex items-center justify-center">
                      <motion.div
                        className="w-6 h-6 rounded-full border-2 border-neutral-200 border-t-neutral-900"
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ) : traces.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-xs text-neutral-400"
                  >
                    No traces found
                  </td>
                </tr>
              ) : (
                traces.map((trace, idx) => (
                  <TraceTableRow
                    key={trace.id}
                    trace={trace}
                    isSelected={selectedTraceId === trace.id}
                    onClick={() => handleTraceSelect(trace)}
                    rowNumber={offset + idx + 1}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > limit && (
          <div className="p-3 border-t border-neutral-100 flex items-center justify-between shrink-0 bg-white">
            <span className="text-xs text-neutral-400">
              {offset + 1}–{Math.min(offset + limit, totalCount)} of{" "}
              {totalCount}
            </span>
            <div className="flex gap-1 shrink-0">
              <Button
                onClick={handlePrevPage}
                disabled={offset === 0}
                variant="subtle"
                iconLeft={ChevronLeft}
              >
                Previous
              </Button>
              <Button
                onClick={handleNextPage}
                disabled={offset + limit >= totalCount}
                variant="subtle"
                iconRight={ChevronRight}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Left Resize Handle - positioned at right edge */}
        <ResizeHandle onResize={handleLeftResize} />
      </div>

      {/* Main Content - Trace Viewer */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {selectedTrace && (
          <div className="p-2 border-b border-neutral-100 shrink-0 flex justify-end">
            {selectedTrace.session && (
              <a
                href={`/annotate?session=${selectedTrace.session}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-neutral-200 text-neutral-600 text-xs hover:bg-neutral-50 transition-colors"
              >
                <ExternalLink size={11} />
                Session
              </a>
            )}
          </div>
        )}
        <TraceViewer
          key={selectedTrace?.id}
          trace={selectedTrace}
          loading={traceLoading}
          rightPanelWidth={rightPanelWidth}
          onRightPanelResize={handleRightResize}
          onLoadMoreSpans={loadMoreSpans}
          loadingMoreSpans={loadingMoreSpans}
        />
      </div>
    </div>
  );
}
