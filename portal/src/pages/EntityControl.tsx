import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  Brain,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Target,
} from 'lucide-react';
import {
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  ActionIcon,
  Badge,
  cn,
  EmptyState,
  Select,
  Tabs,
} from 'slate-ui';
import { toast } from 'sonner';

import {
  DocsTasksGoalsTab,
} from '../components/entity-control/DocsTasksGoalsTab';
import { EmailTab } from '../components/entity-control/EmailTab';
import { SMSTab } from '../components/entity-control/SMSTab';
import { components } from '../types/api';
import client from '../utils/api';

type Entity = components["schemas"]["EntityListResponse"];
type EntityContext = components["schemas"]["EntityContextResponse"];

// Entity selector component
function EntitySelector({
  entities,
  selectedId,
  onSelect,
  loading,
}: {
  entities: Entity[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading entities...</span>
      </div>
    );
  }

  const items = entities.map((e) => ({
    id: e.id,
    name: `${e.str}`,
  }));

  return (
    <Select
      items={items}
      value={selectedId}
      onChange={(val) => val && onSelect(val)}
      placeholder="Select an entity..."
      className="w-80"
    />
  );
}

// Main component
export function EntityControl() {
  const { entityId } = useParams<{ entityId: string }>();
  const navigate = useNavigate();

  const [entities, setEntities] = useState<Entity[]>([]);
  const [entitiesLoading, setEntitiesLoading] = useState(true);
  const [context, setContext] = useState<EntityContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  // Fetch entities list
  const fetchEntities = useCallback(async () => {
    setEntitiesLoading(true);
    try {
      const { data, error } = await client.GET("/api/entities/control/", {
        params: { query: { human_controlled: "true" } },
      });
      if (error) throw new Error("Failed to fetch entities");
      setEntities(data || []);
    } catch (e) {
      console.error("Error fetching entities:", e);
      toast.error("Failed to fetch entities");
    } finally {
      setEntitiesLoading(false);
    }
  }, []);

  // Fetch entity context
  const fetchContext = useCallback(async (id: number) => {
    setContextLoading(true);
    try {
      const { data, error } = await client.GET(
        "/api/entities/control/{entity_id}/",
        {
          params: { path: { entity_id: id } },
        },
      );
      if (error) throw new Error("Failed to fetch context");
      setContext(data);
    } catch (e) {
      console.error("Error fetching context:", e);
      toast.error("Failed to fetch entity context");
    } finally {
      setContextLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  // Fetch context when entity changes
  useEffect(() => {
    if (entityId) {
      fetchContext(parseInt(entityId));
    }
  }, [entityId, fetchContext]);

  // Handle entity selection
  const handleEntitySelect = (id: number) => {
    navigate(`/entity-control/${id}`);
  };

  const selectedEntityId = entityId ? parseInt(entityId) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">Entity Control Panel</h1>
            <EntitySelector
              entities={entities}
              selectedId={selectedEntityId}
              onSelect={handleEntitySelect}
              loading={entitiesLoading}
            />
          </div>
          {context && (
            <div className="flex items-center gap-3">
              <Badge
                variant={
                  context.entity.status === "running" ? "primary" : "secondary"
                }
              >
                {context.entity.status.toUpperCase()}
              </Badge>
              <span className="text-sm text-muted">
                {context.entity.timezone}
              </span>
              <ActionIcon
                icon={RefreshCw}
                variant="subtle"
                onClick={() =>
                  selectedEntityId && fetchContext(selectedEntityId)
                }
                className={cn(contextLoading && "animate-spin")}
                tooltip="Refresh context"
              />
            </div>
          )}
        </div>

        {/* Inbox alerts */}
        {context &&
          (context.inbox.unread_sms || context.inbox.unread_emails > 0) && (
            <div className="mt-3 flex gap-2">
              {context.inbox.unread_sms && (
                <Badge variant="primary" iconLeft={MessageSquare}>
                  Unread SMS
                </Badge>
              )}
              {context.inbox.unread_emails > 0 && (
                <Badge variant="primary" iconLeft={Mail}>
                  {context.inbox.unread_emails} unread emails
                </Badge>
              )}
            </div>
          )}
      </div>

      {/* Main content */}
      {!selectedEntityId ? (
        <div className="flex items-center justify-center h-96">
          <EmptyState icon={Target} title="Select an entity" />
        </div>
      ) : contextLoading && !context ? (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : context ? (
        <div className="p-6">
          <Tabs
            defaultTab="sms"
            tabs={[
              {
                id: "sms",
                name: "SMS Inbox",
                iconLeft: MessageSquare,
                content: <SMSTab entityId={selectedEntityId} />,
              },
              {
                id: "email",
                name: "Email Inbox",
                iconLeft: Mail,
                content: <EmailTab entityId={selectedEntityId} />,
              },
              {
                id: "docs",
                name: "Docs / Tasks / Goals",
                iconLeft: FileText,
                content: <DocsTasksGoalsTab entityId={selectedEntityId} />,
              },
              {
                id: "memory",
                name: "Memory Context",
                iconLeft: Brain,
                content: (
                  <div className="bg-white rounded-lg border shadow-sm p-6">
                    <h3 className="font-semibold text-lg mb-4">
                      Entity Memory Context
                    </h3>
                    <pre className="bg-gray-50 rounded-lg p-4 text-sm whitespace-pre-wrap overflow-auto max-h-[600px] font-mono">
                      {context.memory_context || "No memory context available"}
                    </pre>
                  </div>
                ),
              },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}
