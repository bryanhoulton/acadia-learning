import { useCallback, useEffect, useState } from "react";

import { formatDistanceToNow } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useValues } from "kea";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit2,
  FlaskConical,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  ActionIcon,
  Button,
  cn,
  Select,
  TextArea,
  TextInput,
} from "slate-ui";
import { toast } from "sonner";

import { authLogic } from "../logic/authLogic";
import client from "../utils/api";

// Types
interface Eval {
  id: string;
  name: string;
  input: unknown;
  input_preview?: string;
  rubric: string;
  category: string;
  source_span: string | null;
  created_at: string;
  updated_at?: string;
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

// Eval Detail Side Panel
function EvalDetailPanel({
  evalId,
  onClose,
  onUpdate,
  onDelete,
}: {
  evalId: string;
  onClose: () => void;
  onUpdate: (updated: Eval) => void;
  onDelete: (id: string) => void;
}) {
  const [evalItem, setEvalItem] = useState<Eval | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [rubric, setRubric] = useState("");
  const [category, setCategory] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch full eval data
  useEffect(() => {
    const fetchEval = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await client.GET(
          "/api/tracing/evals/{eval_id}/",
          {
            params: { path: { eval_id: evalId } },
          }
        );
        if (!error && data) {
          setEvalItem(data as Eval);
          setName(data.name || "");
          setRubric(data.rubric || "");
          setCategory(data.category || "");
        }
      } catch (error) {
        console.error("Failed to fetch eval:", error);
        toast.error("Failed to load eval");
      } finally {
        setIsLoading(false);
      }
    };
    fetchEval();
  }, [evalId]);

  const handleSave = async () => {
    if (!evalItem) return;
    setIsSaving(true);
    try {
      const { data, error } = await client.PATCH(
        "/api/tracing/evals/{eval_id}/update/",
        {
          params: { path: { eval_id: evalItem.id } },
          body: { name, rubric, category },
        }
      );

      if (!error && data) {
        setEvalItem(data as Eval);
        onUpdate(data as Eval);
        setIsEditing(false);
        toast.success("Eval updated");
      } else {
        throw new Error("Failed to update");
      }
    } catch (error) {
      console.error("Failed to update eval:", error);
      toast.error("Failed to update eval");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!evalItem) return;
    if (!confirm("Are you sure you want to delete this eval?")) return;

    setIsDeleting(true);
    try {
      const { error } = await client.DELETE(
        "/api/tracing/evals/{eval_id}/delete/",
        {
          params: { path: { eval_id: evalItem.id } },
        }
      );

      if (!error) {
        onDelete(evalItem.id);
        onClose();
        toast.success("Eval deleted");
      } else {
        throw new Error("Failed to delete");
      }
    } catch (error) {
      console.error("Failed to delete eval:", error);
      toast.error("Failed to delete eval");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <motion.div
      className="border-l border-neutral-200 flex flex-col h-full bg-white shrink-0 w-[480px]"
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 100, opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-100 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
              <FlaskConical size={14} className="text-violet-600" />
            </div>
            {isEditing ? (
              <TextInput
                value={name}
                onChange={setName}
                placeholder="Eval name"
                className="flex-1"
              />
            ) : (
              <h3 className="text-sm font-semibold text-neutral-900 truncate">
                {evalItem?.name || "Untitled Eval"}
              </h3>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!isEditing && !isLoading && (
              <>
                <ActionIcon
                  onClick={() => setIsEditing(true)}
                  variant="subtle"
                  icon={Edit2}
                />
                <ActionIcon
                  onClick={handleDelete}
                  variant="subtle"
                  icon={Trash2}
                  className="text-red-500 hover:text-red-600"
                  disabled={isDeleting}
                />
              </>
            )}
            <ActionIcon onClick={onClose} variant="subtle" icon={X} />
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <motion.div
            className="w-6 h-6 rounded-full border-2 border-neutral-200 border-t-neutral-900"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        </div>
      ) : evalItem ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Category */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5 block">
              Category
            </label>
            {isEditing ? (
              <TextInput
                value={category}
                onChange={setCategory}
                placeholder="Category (optional)"
              />
            ) : (
              <span
                className={cn(
                  "inline-block px-2 py-1 rounded text-xs",
                  evalItem.category
                    ? "bg-violet-100 text-violet-700"
                    : "bg-neutral-100 text-neutral-500"
                )}
              >
                {evalItem.category || "Uncategorized"}
              </span>
            )}
          </div>

          {/* Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] uppercase tracking-wider text-neutral-400">
                Input
              </label>
              <ActionIcon
                onClick={() => {
                  navigator.clipboard.writeText(
                    JSON.stringify(evalItem.input, null, 2)
                  );
                  toast.success("Copied to clipboard");
                }}
                variant="subtle"
                icon={Copy}
              />
            </div>
            <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-3 font-mono text-xs max-h-64 overflow-auto">
              <pre className="whitespace-pre-wrap break-words text-neutral-600">
                {JSON.stringify(evalItem.input, null, 2)}
              </pre>
            </div>
          </div>

          {/* Rubric */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5 block">
              Rubric
            </label>
            {isEditing ? (
              <TextArea
                value={rubric}
                onChange={setRubric}
                placeholder="Enter evaluation rubric/criteria..."
                rows={6}
              />
            ) : (
              <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-3 text-xs text-neutral-600 whitespace-pre-wrap min-h-[80px]">
                {evalItem.rubric || (
                  <span className="text-neutral-400 italic">No rubric set</span>
                )}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="text-[10px] text-neutral-400 space-y-1 pt-2 border-t border-neutral-100">
            <p>
              Created{" "}
              {formatDistanceToNow(new Date(evalItem.created_at), {
                addSuffix: true,
              })}
            </p>
            {evalItem.source_span && (
              <p className="font-mono">Source span: {evalItem.source_span}</p>
            )}
            <p className="font-mono text-neutral-300">{evalItem.id}</p>
          </div>

          {/* Edit Actions */}
          {isEditing && (
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="subtle"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setName(evalItem.name);
                  setRubric(evalItem.rubric);
                  setCategory(evalItem.category);
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </motion.div>
  );
}

// Create Eval Modal
function CreateEvalModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (evalItem: Eval) => void;
}) {
  const [name, setName] = useState("");
  const [inputText, setInputText] = useState("{}");
  const [rubric, setRubric] = useState("");
  const [category, setCategory] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const validateInput = (text: string) => {
    try {
      JSON.parse(text);
      setInputError(null);
      return true;
    } catch {
      setInputError("Invalid JSON");
      return false;
    }
  };

  const handleCreate = async () => {
    if (!validateInput(inputText)) return;

    setIsCreating(true);
    try {
      const { data, error } = await client.POST("/api/tracing/evals/", {
        body: {
          name,
          input: JSON.parse(inputText),
          rubric,
          category,
        },
      });

      if (!error && data) {
        onCreate(data as Eval);
        onClose();
        toast.success("Eval created");
      } else {
        throw new Error("Failed to create");
      }
    } catch (error) {
      console.error("Failed to create eval:", error);
      toast.error("Failed to create eval");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <Plus size={16} className="text-violet-600" />
            </div>
            <h2 className="text-lg font-semibold text-neutral-900">
              Create New Eval
            </h2>
          </div>
          <ActionIcon onClick={onClose} variant="subtle" icon={X} />
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <TextInput
            label="Name"
            value={name}
            onChange={setName}
            placeholder="Eval name"
          />

          <TextInput
            label="Category"
            value={category}
            onChange={setCategory}
            placeholder="Category (optional)"
          />

          <div>
            <label className="text-xs uppercase tracking-wider text-neutral-400 mb-2 block">
              Input (JSON)
            </label>
            <TextArea
              value={inputText}
              onChange={(v) => {
                setInputText(v);
                validateInput(v);
              }}
              placeholder='{"key": "value"}'
              rows={6}
              className={cn("font-mono", inputError ? "border-red-300" : undefined)}
            />
            {inputError && (
              <p className="text-red-500 text-xs mt-1">{inputError}</p>
            )}
          </div>

          <TextArea
            label="Rubric"
            value={rubric}
            onChange={setRubric}
            placeholder="Enter evaluation rubric/criteria..."
            rows={4}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !!inputError}
          >
            {isCreating ? "Creating..." : "Create Eval"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Eval Table Row
function EvalTableRow({
  evalItem,
  onClick,
  rowNumber,
  isSelected,
}: {
  evalItem: Eval;
  onClick: () => void;
  rowNumber: number;
  isSelected?: boolean;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "cursor-pointer border-b border-neutral-50 transition-colors",
        isSelected ? "bg-violet-50" : "hover:bg-neutral-50"
      )}
    >
      {/* Row number */}
      <td className="px-3 py-3 text-[10px] text-neutral-300 font-mono w-10">
        {rowNumber}
      </td>

      {/* Name */}
      <td className="px-3 py-3">
        <span className="text-sm font-medium text-neutral-800 truncate block max-w-[200px]">
          {evalItem.name || "Untitled"}
        </span>
      </td>

      {/* Category */}
      <td className="px-3 py-3 w-32">
        {evalItem.category ? (
          <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-1 rounded">
            {evalItem.category}
          </span>
        ) : (
          <span className="text-xs text-neutral-400">—</span>
        )}
      </td>

      {/* Input Preview */}
      <td className="px-3 py-3">
        <span className="text-xs font-mono text-neutral-500 truncate block max-w-[300px]">
          {evalItem.input_preview || JSON.stringify(evalItem.input).slice(0, 50)}
        </span>
      </td>

      {/* Rubric Preview */}
      <td className="px-3 py-3 w-48">
        <span className="text-xs text-neutral-500 truncate block max-w-[180px]">
          {evalItem.rubric
            ? evalItem.rubric.slice(0, 50) + (evalItem.rubric.length > 50 ? "..." : "")
            : "No rubric"}
        </span>
      </td>

      {/* Created */}
      <td className="px-3 py-3 text-xs text-neutral-500 w-28">
        {formatDistanceToNow(new Date(evalItem.created_at), { addSuffix: true })}
      </td>
    </tr>
  );
}

export function Evals() {
  const { account, isAccountLoading, hasAttemptedFetch } = useValues(authLogic);

  // List state
  const [evals, setEvals] = useState<Eval[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  // Panel state
  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const limit = 50;
  const isAdmin = account?.is_admin ?? false;

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const { data, error } = await client.GET(
        "/api/tracing/evals/categories/"
      );
      if (!error && data) {
        setCategories(data.categories);
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  }, []);

  // Fetch evals
  const fetchEvals = useCallback(
    async (reset = false) => {
      setLoading(true);
      const newOffset = reset ? 0 : offset;

      try {
        const { data, error } = await client.GET("/api/tracing/evals/list/", {
          params: {
            query: {
              limit,
              offset: newOffset,
              search: searchQuery || undefined,
              category: selectedCategory || undefined,
            },
          },
        });

        if (!error && data) {
          const paginatedData = data as PaginatedResponse<Eval>;
          setEvals(paginatedData.results);
          setTotalCount(paginatedData.pagination.total_count);
          if (reset) {
            setOffset(0);
          }
        } else {
          toast.error("Failed to load evals");
        }
      } catch (error) {
        console.error("Failed to fetch evals:", error);
        toast.error("Failed to load evals");
      } finally {
        setLoading(false);
      }
    },
    [offset, searchQuery, selectedCategory]
  );

  // Initial load
  useEffect(() => {
    if (isAdmin) {
      fetchCategories();
      fetchEvals(true);
    }
  }, [isAdmin, fetchCategories, fetchEvals]);

  // Re-fetch when filters change
  useEffect(() => {
    if (isAdmin) {
      const timer = setTimeout(() => {
        fetchEvals(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchQuery, selectedCategory, isAdmin, fetchEvals]);

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
      fetchEvals(false);
    }
  }, [offset, isAdmin, fetchEvals]);

  const handleEvalUpdate = (updated: Eval) => {
    setEvals((prev) =>
      prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e))
    );
  };

  const handleEvalDelete = (id: string) => {
    setEvals((prev) => prev.filter((e) => e.id !== id));
    setTotalCount((prev) => prev - 1);
  };

  const handleEvalCreate = (created: Eval) => {
    setEvals((prev) => [created, ...prev]);
    setTotalCount((prev) => prev + 1);
    fetchCategories(); // Refresh categories
  };

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

  const categoryItems = [
    { id: "", name: "All categories" },
    ...categories.map((c) => ({ id: c, name: c })),
  ];

  return (
    <div className="h-screen bg-white flex overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 border-b border-neutral-100 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <FlaskConical size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-neutral-900">Evals</h1>
                <p className="text-sm text-neutral-500">
                  {totalCount} evaluation{totalCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ActionIcon
                onClick={() => fetchEvals(true)}
                disabled={loading}
                variant="subtle"
                icon={RefreshCw}
                className={cn(loading && "[&_svg]:animate-spin")}
              />
              <Button
                onClick={() => setShowCreateModal(true)}
                iconLeft={Plus}
              >
                New Eval
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <TextInput
              placeholder="Search evals..."
              value={searchQuery}
              onChange={setSearchQuery}
              iconLeft={Search}
              className="w-64"
            />
            <Select
              items={categoryItems}
              value={selectedCategory || ""}
              onChange={(v) => setSelectedCategory(v || null)}
              placeholder="Category"
              variant="subtle"
              className="min-w-[150px]"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-100 sticky top-0">
              <tr>
                <th className="px-3 py-3 text-left w-10">
                  <span className="text-[10px] text-neutral-400">#</span>
                </th>
                <th className="px-3 py-3 text-left">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
                    Name
                  </span>
                </th>
                <th className="px-3 py-3 text-left w-32">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
                    Category
                  </span>
                </th>
                <th className="px-3 py-3 text-left">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
                    Input
                  </span>
                </th>
                <th className="px-3 py-3 text-left w-48">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
                    Rubric
                  </span>
                </th>
                <th className="px-3 py-3 text-left w-28">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
                    Created
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && evals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16">
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
              ) : evals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-3">
                        <FlaskConical size={20} className="text-neutral-400" />
                      </div>
                      <p className="text-neutral-500 text-sm mb-2">No evals found</p>
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() => setShowCreateModal(true)}
                        iconLeft={Plus}
                      >
                        Create your first eval
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                evals.map((evalItem, idx) => (
                  <EvalTableRow
                    key={evalItem.id}
                    evalItem={evalItem}
                    onClick={() => setSelectedEvalId(evalItem.id)}
                    rowNumber={offset + idx + 1}
                    isSelected={selectedEvalId === evalItem.id}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > limit && (
          <div className="px-4 py-3 border-t border-neutral-100 flex items-center justify-between shrink-0">
            <span className="text-xs text-neutral-400">
              {offset + 1}–{Math.min(offset + limit, totalCount)} of {totalCount}
            </span>
            <div className="flex gap-1">
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
      </div>

      {/* Side Panel */}
      <AnimatePresence>
        {selectedEvalId && (
          <EvalDetailPanel
            evalId={selectedEvalId}
            onClose={() => setSelectedEvalId(null)}
            onUpdate={handleEvalUpdate}
            onDelete={handleEvalDelete}
          />
        )}
      </AnimatePresence>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateEvalModal
            onClose={() => setShowCreateModal(false)}
            onCreate={handleEvalCreate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

