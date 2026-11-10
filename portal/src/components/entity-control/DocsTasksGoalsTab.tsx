import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { format } from 'date-fns';
import {
  Calendar,
  CheckCircle,
  Circle,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Target,
  Trash2,
} from 'lucide-react';
import {
  ActionIcon,
  Badge,
  Button,
  cn,
  EmptyState,
  Modal,
  Tabs,
  TextArea,
  TextInput,
} from 'slate-ui';
import { toast } from 'sonner';

import client from '../../utils/api';

// These types aren't strongly typed in the API schema (they're Dict), so we keep local definitions
interface Document {
  id: string;
  title: string;
  content: string;
  updated_at: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  due_date: string | null;
}

interface Goal {
  id: string;
  title: string;
  objective: string;
  status: "incomplete" | "complete";
  start_date: string;
  end_date: string;
  user_profile?: string;
  user_profile_name?: string;
}

// Documents Section
function DocumentsSection({ entityId }: { entityId: number }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await client.GET(
        "/api/entities/control/{entity_id}/documents/",
        {
          params: { path: { entity_id: entityId } },
        },
      );
      if (error) throw new Error("Failed to fetch documents");
      setDocuments((data?.documents as unknown as Document[]) || []);
    } catch (e) {
      console.error("Error fetching documents:", e);
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleCreate = async (title: string, content: string) => {
    try {
      const { error } = await client.POST(
        "/api/entities/control/{entity_id}/documents/",
        {
          params: { path: { entity_id: entityId } },
          body: { title, content },
        },
      );
      if (error) throw new Error("Failed to create document");
      toast.success("Document created");
      await fetchDocs();
    } catch (e) {
      toast.error((e as Error).message || "Failed to create document");
      throw e;
    }
  };

  const handleUpdate = async (id: string, title: string, content: string) => {
    try {
      const { error } = await client.PUT(
        "/api/entities/control/{entity_id}/documents/{document_id}/",
        {
          params: { path: { entity_id: entityId, document_id: id } },
          body: { title, content },
        },
      );
      if (error) throw new Error("Failed to update document");
      toast.success("Document updated");
      await fetchDocs();
    } catch (e) {
      toast.error((e as Error).message || "Failed to update document");
      throw e;
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    try {
      const { error } = await client.DELETE(
        "/api/entities/control/{entity_id}/documents/{document_id}/",
        {
          params: { path: { entity_id: entityId, document_id: id } },
        },
      );
      if (error) throw new Error("Failed to delete document");
      toast.success("Document deleted");
      await fetchDocs();
    } catch (e) {
      toast.error((e as Error).message || "Failed to delete document");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Documents ({documents.length})</h4>
        <Button size="sm" iconLeft={Plus} onClick={() => setCreateOpen(true)}>
          New Document
        </Button>
      </div>

      {documents.length === 0 ? (
        <EmptyState icon={FileText} title="No documents" />
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="p-4 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => setEditingDoc(doc)}
                >
                  <div className="font-medium">{doc.title}</div>
                  <div className="text-sm text-muted mt-1 line-clamp-2">
                    {doc.content || "(empty)"}
                  </div>
                  <div className="text-xs text-muted mt-2">
                    Updated {doc.updated_at}
                  </div>
                </div>
                <div className="flex gap-1">
                  <ActionIcon
                    icon={Pencil}
                    variant="subtle"
                    size="sm"
                    onClick={() => setEditingDoc(doc)}
                    tooltip="Edit"
                  />
                  <ActionIcon
                    icon={Trash2}
                    variant="subtle"
                    size="sm"
                    onClick={() => handleDelete(doc.id)}
                    tooltip="Delete"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <DocumentModal
        open={createOpen || !!editingDoc}
        onClose={() => {
          setCreateOpen(false);
          setEditingDoc(null);
        }}
        document={editingDoc}
        onSave={async (title, content) => {
          if (editingDoc) {
            await handleUpdate(editingDoc.id, title, content);
          } else {
            await handleCreate(title, content);
          }
        }}
      />
    </div>
  );
}

function DocumentModal({
  open,
  onClose,
  document,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  document: Document | null;
  onSave: (title: string, content: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (document) {
      setTitle(document.title);
      setContent(document.content);
    } else {
      setTitle("");
      setContent("");
    }
  }, [document, open]);

  const handleSave = async () => {
    if (!title) return;
    setSaving(true);
    try {
      await onSave(title, content);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          {document ? "Edit Document" : "New Document"}
        </h2>
        <div className="space-y-4">
          <TextInput
            label="Title"
            value={title}
            onChange={setTitle}
            placeholder="Document title"
          />
          <TextArea
            label="Content"
            value={content}
            onChange={setContent}
            placeholder="Document content..."
            rows={10}
          />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Tasks Section
function TasksSection({ entityId }: { entityId: number }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await client.GET(
        "/api/entities/control/{entity_id}/tasks/",
        {
          params: { path: { entity_id: entityId } },
        },
      );
      if (error) throw new Error("Failed to fetch tasks");
      setTasks((data?.tasks as unknown as Task[]) || []);
    } catch (e) {
      console.error("Error fetching tasks:", e);
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleCreate = async (
    title: string,
    dueDate: string,
    description?: string,
  ) => {
    try {
      const { error } = await client.POST(
        "/api/entities/control/{entity_id}/tasks/",
        {
          params: { path: { entity_id: entityId } },
          body: { title, due_date: dueDate, description },
        },
      );
      if (error) throw new Error("Failed to create task");
      toast.success("Task created");
      await fetchTasks();
    } catch (e) {
      toast.error((e as Error).message || "Failed to create task");
      throw e;
    }
  };

  const handleUpdate = async (
    id: string,
    title: string,
    dueDate: string,
    description?: string,
  ) => {
    try {
      const { error } = await client.PUT(
        "/api/entities/control/{entity_id}/tasks/{task_id}/",
        {
          params: { path: { entity_id: entityId, task_id: id } },
          body: { title, due_date: dueDate, description },
        },
      );
      if (error) throw new Error("Failed to update task");
      toast.success("Task updated");
      await fetchTasks();
    } catch (e) {
      toast.error((e as Error).message || "Failed to update task");
      throw e;
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this task?")) return;
    try {
      const { error } = await client.DELETE(
        "/api/entities/control/{entity_id}/tasks/{task_id}/",
        {
          params: { path: { entity_id: entityId, task_id: id } },
        },
      );
      if (error) throw new Error("Failed to delete task");
      toast.success("Task deleted");
      await fetchTasks();
    } catch (e) {
      toast.error((e as Error).message || "Failed to delete task");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Tasks ({tasks.length})</h4>
        <Button size="sm" iconLeft={Plus} onClick={() => setCreateOpen(true)}>
          New Task
        </Button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon={CheckCircle} title="No tasks" />
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="p-4 border rounded-lg bg-white flex items-start gap-3"
            >
              <Circle className="w-5 h-5 text-gray-300 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium">{task.title}</div>
                {task.description && (
                  <div className="text-sm text-muted mt-1">
                    {task.description}
                  </div>
                )}
                {task.due_date && (
                  <div className="text-xs text-muted mt-2 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Due: {task.due_date}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <ActionIcon
                  icon={Pencil}
                  variant="subtle"
                  size="sm"
                  onClick={() => setEditingTask(task)}
                  tooltip="Edit"
                />
                <ActionIcon
                  icon={Trash2}
                  variant="subtle"
                  size="sm"
                  onClick={() => handleDelete(task.id)}
                  tooltip="Delete"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <TaskModal
        open={createOpen || !!editingTask}
        onClose={() => {
          setCreateOpen(false);
          setEditingTask(null);
        }}
        task={editingTask}
        onSave={async (title, dueDate, description) => {
          if (editingTask) {
            await handleUpdate(editingTask.id, title, dueDate, description);
          } else {
            await handleCreate(title, dueDate, description);
          }
        }}
      />
    </div>
  );
}

function TaskModal({
  open,
  onClose,
  task,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  onSave: (
    title: string,
    dueDate: string,
    description?: string,
  ) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDueDate(task.due_date || "");
      setDescription(task.description || "");
    } else {
      setTitle("");
      // Default to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDueDate(tomorrow.toISOString().slice(0, 16));
      setDescription("");
    }
  }, [task, open]);

  const handleSave = async () => {
    if (!title || !dueDate) return;
    setSaving(true);
    try {
      await onSave(title, dueDate, description || undefined);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          {task ? "Edit Task" : "New Task"}
        </h2>
        <div className="space-y-4">
          <TextInput
            label="Title"
            value={title}
            onChange={setTitle}
            placeholder="Task title"
          />
          <TextInput
            label="Due Date"
            type="datetime-local"
            value={dueDate}
            onChange={setDueDate}
          />
          <TextArea
            label="Description (optional)"
            value={description}
            onChange={setDescription}
            placeholder="Task description..."
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title || !dueDate || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Goals Section
function GoalsSection({ entityId }: { entityId: number }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await client.GET(
        "/api/entities/control/{entity_id}/goals/",
        {
          params: { path: { entity_id: entityId } },
        },
      );
      if (error) throw new Error("Failed to fetch goals");
      setGoals((data?.goals as unknown as Goal[]) || []);
    } catch (e) {
      console.error("Error fetching goals:", e);
      toast.error("Failed to load goals");
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleCreate = async (
    title: string,
    objective: string,
    startDate: string,
    endDate: string,
  ) => {
    try {
      const { error } = await client.POST(
        "/api/entities/control/{entity_id}/goals/",
        {
          params: { path: { entity_id: entityId } },
          body: {
            title,
            objective,
            start_date: startDate,
            end_date: endDate,
          },
        },
      );
      if (error) throw new Error("Failed to create goal");
      toast.success("Goal created");
      await fetchGoals();
    } catch (e) {
      toast.error((e as Error).message || "Failed to create goal");
      throw e;
    }
  };

  const handleUpdate = async (
    id: string,
    title: string,
    objective: string,
    startDate: string,
    endDate: string,
    status: string,
  ) => {
    try {
      const { error } = await client.PUT(
        "/api/entities/control/{entity_id}/goals/{goal_id}/",
        {
          params: { path: { entity_id: entityId, goal_id: id } },
          body: {
            title,
            objective,
            start_date: startDate,
            end_date: endDate,
            status,
          },
        },
      );
      if (error) throw new Error("Failed to update goal");
      toast.success("Goal updated");
      await fetchGoals();
    } catch (e) {
      toast.error((e as Error).message || "Failed to update goal");
      throw e;
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this goal?")) return;
    try {
      const { error } = await client.DELETE(
        "/api/entities/control/{entity_id}/goals/{goal_id}/",
        {
          params: { path: { entity_id: entityId, goal_id: id } },
        },
      );
      if (error) throw new Error("Failed to delete goal");
      toast.success("Goal deleted");
      await fetchGoals();
    } catch (e) {
      toast.error((e as Error).message || "Failed to delete goal");
    }
  };

  const handleToggleStatus = async (goal: Goal) => {
    const newStatus = goal.status === "complete" ? "incomplete" : "complete";
    try {
      const { error } = await client.PUT(
        "/api/entities/control/{entity_id}/goals/{goal_id}/",
        {
          params: { path: { entity_id: entityId, goal_id: goal.id } },
          body: { status: newStatus },
        },
      );
      if (error) throw new Error("Failed to update goal");
      toast.success(`Goal marked ${newStatus}`);
      await fetchGoals();
    } catch (e) {
      toast.error((e as Error).message || "Failed to update goal");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Goals ({goals.length})</h4>
        <Button size="sm" iconLeft={Plus} onClick={() => setCreateOpen(true)}>
          New Goal
        </Button>
      </div>

      {goals.length === 0 ? (
        <EmptyState icon={Target} title="No goals" />
      ) : (
        <div className="space-y-2">
          {goals.map((goal) => (
            <div
              key={goal.id}
              className={cn(
                "p-4 border rounded-lg bg-white flex items-start gap-3",
                goal.status === "complete" && "opacity-60",
              )}
            >
              <button onClick={() => handleToggleStatus(goal)}>
                {goal.status === "complete" ? (
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-300 mt-0.5" />
                )}
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "font-medium",
                      goal.status === "complete" && "line-through",
                    )}
                  >
                    {goal.title}
                  </span>
                  <Badge
                    variant={
                      goal.status === "complete" ? "primary" : "secondary"
                    }
                    size="sm"
                  >
                    {goal.status}
                  </Badge>
                </div>
                <div className="text-sm text-muted mt-1">{goal.objective}</div>
                <div className="text-xs text-muted mt-2 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {goal.start_date} → {goal.end_date}
                </div>
                {goal.user_profile_name && (
                  <div className="text-xs text-muted mt-1">
                    Profile: {goal.user_profile_name}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <ActionIcon
                  icon={Pencil}
                  variant="subtle"
                  size="sm"
                  onClick={() => setEditingGoal(goal)}
                  tooltip="Edit"
                />
                <ActionIcon
                  icon={Trash2}
                  variant="subtle"
                  size="sm"
                  onClick={() => handleDelete(goal.id)}
                  tooltip="Delete"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <GoalModal
        open={createOpen || !!editingGoal}
        onClose={() => {
          setCreateOpen(false);
          setEditingGoal(null);
        }}
        goal={editingGoal}
        onSave={async (title, objective, startDate, endDate, status) => {
          if (editingGoal) {
            await handleUpdate(
              editingGoal.id,
              title,
              objective,
              startDate,
              endDate,
              status,
            );
          } else {
            await handleCreate(title, objective, startDate, endDate);
          }
        }}
      />
    </div>
  );
}

function GoalModal({
  open,
  onClose,
  goal,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  goal: Goal | null;
  onSave: (
    title: string,
    objective: string,
    startDate: string,
    endDate: string,
    status: string,
  ) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("incomplete");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (goal) {
      setTitle(goal.title);
      setObjective(goal.objective);
      setStartDate(goal.start_date);
      setEndDate(goal.end_date);
      setStatus(goal.status);
    } else {
      setTitle("");
      setObjective("");
      // Default to this week
      const today = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      setStartDate(format(today, "yyyy-MM-dd"));
      setEndDate(format(nextWeek, "yyyy-MM-dd"));
      setStatus("incomplete");
    }
  }, [goal, open]);

  const handleSave = async () => {
    if (!title || !objective || !startDate || !endDate) return;
    setSaving(true);
    try {
      await onSave(title, objective, startDate, endDate, status);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          {goal ? "Edit Goal" : "New Goal"}
        </h2>
        <div className="space-y-4">
          <TextInput
            label="Title"
            value={title}
            onChange={setTitle}
            placeholder="Goal title"
          />
          <TextArea
            label="Objective"
            value={objective}
            onChange={setObjective}
            placeholder="What should be achieved?"
            rows={3}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextInput
              label="Start Date"
              type="date"
              value={startDate}
              onChange={setStartDate}
            />
            <TextInput
              label="End Date"
              type="date"
              value={endDate}
              onChange={setEndDate}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!title || !objective || !startDate || !endDate || saving}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Main component
export function DocsTasksGoalsTab({ entityId }: { entityId: number }) {
  return (
    <div className="bg-white rounded-lg border shadow-sm p-6">
      <Tabs
        defaultTab="documents"
        tabs={[
          {
            id: "documents",
            name: "Documents",
            iconLeft: FileText,
            content: <DocumentsSection entityId={entityId} />,
          },
          {
            id: "tasks",
            name: "Tasks",
            iconLeft: CheckCircle,
            content: <TasksSection entityId={entityId} />,
          },
          {
            id: "goals",
            name: "Goals",
            iconLeft: Target,
            content: <GoalsSection entityId={entityId} />,
          },
        ]}
      />
    </div>
  );
}
