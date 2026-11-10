import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { format } from 'date-fns';
import { motion } from 'framer-motion';
import {
  Lock,
  Paperclip,
  User,
  Video,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import {
  Checkbox,
  cn,
  Pagination,
} from 'slate-ui';

import { components } from '../types/api';
import client from '../utils/api';

type SharedLedgerResponse = components["schemas"]["SharedLedgerResponse"];
type LedgerEntry = components["schemas"]["LedgerEntry"];
type SharedLedgerProfile = components["schemas"]["SharedLedgerProfile"];

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function SignUpEntry({
  timestamp,
  showDate,
}: {
  timestamp: string;
  showDate: boolean;
}) {
  return (
    <motion.div
      className="flex gap-4"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.2 }}
    >
      {/* Date column */}
      <div className="w-16 flex-shrink-0 text-right pt-3">
        {showDate && (
          <p className="text-xs text-[#999]">
            {format(new Date(timestamp), "MMM d")}
          </p>
        )}
        <p className="text-xs text-[#bbb]">
          {format(new Date(timestamp), "h:mm a")}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 pl-4 py-3 border-l border-[#eee]">
        <p className="text-xs text-[#999]">Customer signed up</p>
      </div>
    </motion.div>
  );
}

function getSenderName(profiles: SharedLedgerProfile[]): string {
  const student = profiles.find((p) => p.profile_type === "student");
  const parent = profiles.find((p) => p.profile_type === "parent");

  // If we have a student name, show "X's parent"
  if (student?.name) {
    return `${student.name}'s parent`;
  }
  // If parent has a name, use it
  if (parent?.name) {
    return parent.name;
  }
  // If we have any profile with a name, use it
  const anyWithName = profiles.find((p) => p.name);
  if (anyWithName?.name) {
    return anyWithName.name;
  }
  return "Customer";
}

function TimelineEntry({
  entry,
  profiles,
  showHeader = true,
  showDate = true,
}: {
  entry: LedgerEntry;
  profiles: SharedLedgerProfile[];
  showHeader?: boolean;
  showDate?: boolean;
}) {
  const isSMS = entry.type === "sms" && entry.sms;
  const isSession = entry.type === "session" && entry.session;

  if (isSMS) {
    const sms = entry.sms!;
    const isOutbound = sms.direction === "outbound";
    const senderName = isOutbound ? "Acadia" : getSenderName(profiles);

    return (
      <motion.div
        className="flex gap-4"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.2 }}
      >
        {/* Date column */}
        <div className={cn("w-16 flex-shrink-0 text-right", showHeader && "pt-3")}>
          {showHeader && (
            <>
              {showDate && (
                <p className="text-xs text-[#999]">
                  {format(new Date(entry.timestamp), "MMM d")}
                </p>
              )}
              <p className="text-xs text-[#bbb]">
                {format(new Date(entry.timestamp), "h:mm a")}
              </p>
            </>
          )}
        </div>

        {/* Content */}
        <div
          className={cn(
            "flex-1 pl-4 border-l border-[#eee]",
            showHeader ? "py-3" : "pb-2",
            isOutbound && "text-right"
          )}
        >
          {showHeader && (
            <p
              className={cn(
                "text-xs font-medium mb-1",
                isOutbound ? "text-[#0096FF]" : "text-[#999]"
              )}
            >
              {senderName}
            </p>
          )}
          <div
            className={cn(
              "rounded-2xl px-3 py-2 inline-block max-w-[90%]",
              isOutbound
                ? "bg-[#0096FF] text-white"
                : "bg-[#f5f5f5] text-[#1a1a1a]"
            )}
          >
            <p className="text-sm whitespace-pre-wrap text-left">{sms.body}</p>
            {sms.has_attachments && (
              <div
                className={cn(
                  "flex items-center gap-1 mt-2 text-xs",
                  isOutbound ? "text-white/60" : "text-[#999]"
                )}
              >
                <Paperclip className="w-3 h-3" />
                <span>Attachment</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  if (isSession) {
    const session = entry.session!;

    // Hide sessions under 2 minutes
    if (session.audio_duration_seconds !== null && session.audio_duration_seconds < 120) {
      return null;
    }

    return (
      <motion.div
        className="flex gap-4"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.2 }}
      >
        {/* Date column */}
        <div className="w-16 flex-shrink-0 text-right pt-3">
          {showDate && (
            <p className="text-xs text-[#999]">
              {format(new Date(entry.timestamp), "MMM d")}
            </p>
          )}
          <p className="text-xs text-[#bbb]">
            {format(new Date(entry.timestamp), "h:mm a")}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 pl-4 py-3 border-l border-[#eee]">
          <div className="flex items-center gap-2 mb-1">
            <Video className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-600">
              Tutoring Session
            </span>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between gap-4 mb-1">
              <p className="text-sm font-medium text-emerald-900">
                {session.name || "Learning Session"}
              </p>
              {session.audio_duration_seconds && (
                <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {formatDuration(session.audio_duration_seconds)}
                </span>
              )}
            </div>
            {session.description && (
              <p className="text-sm text-emerald-700 mt-2">
                {session.description}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  return null;
}

export function SharedLedger() {
  const { token } = useParams<{ token: string }>();

  const [confirmed, setConfirmed] = useState(false);
  const [ledger, setLedger] = useState<SharedLedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const loadLedger = useCallback(
    async (page: number) => {
      if (!token) return;

      setLoading(true);
      try {
        const { data, error: apiError } = await client.GET(
          "/api/lms/accounts/shared-ledger/{token}/",
          {
            params: {
              path: { token },
              query: { page_size: 50, page: page + 1, sort_order: "asc" },
            },
          }
        );
        if (apiError) throw apiError;
        setLedger(data || null);
        setError(null);
      } catch (err) {
        console.error("Failed to load shared ledger:", err);
        setError("This share link is invalid or has expired.");
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (confirmed) {
      loadLedger(currentPage);
    }
  }, [confirmed, currentPage, loadLedger]);

  // Show confirmation modal first
  if (!confirmed) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <motion.div
          className="max-w-sm w-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Icon */}
          <div className="w-16 h-16 rounded-full bg-[#1a1a1a] flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-white" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-[#1a1a1a] text-center mb-3">
            Confidential
          </h1>

          {/* Description */}
          <p className="text-[#666] text-center mb-8 leading-relaxed">
            You're about to view a real customer's journey with Acadia Learning.
            This data has been shared with you in confidence using a link
            created specifically for you.
          </p>

          {/* Warning */}
          <div className="bg-[#fafafa] rounded-xl px-4 py-4 mb-8">
            <p className="text-sm text-[#666] text-center">
              Please do not share this link or its contents with anyone outside
              your organization. The link will expire in 30 days.
            </p>
          </div>

          {/* Checkbox */}
          <div className="flex justify-center">
            <Checkbox
              label="I understand and agree"
              checked={confirmed}
              withBody={true}
              onCheckedChange={() => setConfirmed(!confirmed)}
            />
          </div>
        </motion.div>
      </div>
    );
  }

  if (loading && !ledger) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-[#eee] border-t-[#1a1a1a] rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#999]">Loading journey...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <div className="w-12 h-12 rounded-full bg-[#fafafa] flex items-center justify-center mx-auto mb-4">
            <span className="text-[#999] text-xl">!</span>
          </div>
          <h1 className="text-lg font-semibold text-[#1a1a1a] mb-2">
            Link Not Found
          </h1>
          <p className="text-sm text-[#666]">{error}</p>
        </div>
      </div>
    );
  }

  const entries = ledger?.entries ?? [];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Confidential Banner */}
      <div className="flex-shrink-0 bg-[#1a1a1a]">
        <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-center gap-2">
          <Lock className="w-3 h-3 text-[#999]" />
          <span className="text-xs text-[#999]">Confidential</span>
        </div>
      </div>

      {/* Header */}
      <div className="flex-shrink-0">
        <div className="max-w-2xl mx-auto px-4 pt-16 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <p className="text-xs text-[#999] uppercase tracking-wide mb-1">
              Customer Journey
            </p>
            <h1 className="text-2xl font-bold text-[#1a1a1a] mb-3">
              {ledger?.account_name}
            </h1>
            <p className="text-sm text-[#666] leading-relaxed">
              This timeline shows the complete interaction history between
              Acadia and this customer, including SMS conversations and tutoring
              sessions.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Timeline Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-[#999]">
              Loading...
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center">
              <User className="w-10 h-10 mx-auto mb-3 text-[#ccc]" />
              <p className="text-sm text-[#999]">No activity yet</p>
            </div>
          ) : (
            <div className="-ml-20">
              {(() => {
                // Calculate sign up timestamp for date comparison
                const signUpTimestamp = new Date(
                  new Date(entries[0].timestamp).getTime() - 60000
                ).toISOString();
                const signUpDate = format(new Date(signUpTimestamp), "yyyy-MM-dd");

                // Track last shown date
                let lastDate = currentPage === 0 ? signUpDate : "";

                return (
                  <>
                    {/* Sign Up event - show on first page only */}
                    {currentPage === 0 && entries.length > 0 && (
                      <SignUpEntry timestamp={signUpTimestamp} showDate={true} />
                    )}
                    {entries.map((entry, i) => {
                      const prev = entries[i - 1];
                      const isSameSender =
                        prev &&
                        entry.type === "sms" &&
                        prev.type === "sms" &&
                        entry.sms?.direction === prev.sms?.direction;

                      // Check if this is the first entry of this date
                      const entryDate = format(
                        new Date(entry.timestamp),
                        "yyyy-MM-dd"
                      );
                      const isFirstOfDate = entryDate !== lastDate;
                      if (isFirstOfDate) {
                        lastDate = entryDate;
                      }

                      return (
                        <TimelineEntry
                          key={`${entry.type}-${i}`}
                          entry={entry}
                          profiles={ledger?.profiles ?? []}
                          showHeader={!isSameSender}
                          showDate={isFirstOfDate}
                        />
                      );
                    })}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {ledger && ledger.total_pages > 1 && (
        <div className="flex-shrink-0 border-t border-[#eee] bg-white">
          <div className="max-w-2xl mx-auto px-4 py-3">
            <Pagination
              pageSize={ledger.page_size}
              maxRow={ledger.total_entries}
              page={currentPage}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex-shrink-0 py-4 border-t border-[#eee]">
        <p className="text-center text-xs text-[#bbb]">
          Powered by{" "}
          <a
            href="https://acadialearning.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#999] hover:text-[#1a1a1a] transition-colors"
          >
            Acadia Learning
          </a>
        </p>
      </div>
    </div>
  );
}
