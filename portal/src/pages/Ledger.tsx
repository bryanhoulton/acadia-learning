import { useCallback, useEffect, useState } from "react";

import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useValues } from "kea";
import {
  ArrowDownUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Link,
  MessageSquare,
  Phone,
  Search,
  User,
  Video,
  X,
} from "lucide-react";
import { Button, cn, TextInput } from "slate-ui";
import { toast } from "sonner";

import { authLogic } from "../logic/authLogic";
import { components } from "../types/api";
import client from "../utils/api";

type AdminAccountList = components["schemas"]["AdminAccountList"];
type AccountLedgerResponse = components["schemas"]["AccountLedgerResponse"];
type LedgerEntry = components["schemas"]["LedgerEntry"];
type LedgerShareLink = components["schemas"]["LedgerShareLink"];

type SortOrder = "asc" | "desc";

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function AccountListItem({
  account,
  isSelected,
  onClick,
}: {
  account: AdminAccountList;
  isSelected: boolean;
  onClick: () => void;
}) {
  const displayName =
    account.profile_names.length > 0
      ? account.profile_names[0]
      : account.account_phone;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full px-4 py-3 text-left transition-colors",
        isSelected
          ? "bg-neutral-900 text-white"
          : "hover:bg-neutral-100 text-neutral-900"
      )}
    >
      <p className="font-medium text-sm truncate">{displayName}</p>
      <p
        className={cn(
          "text-xs truncate mt-0.5",
          isSelected ? "text-neutral-400" : "text-neutral-500"
        )}
      >
        {account.account_phone}
      </p>
    </button>
  );
}

function SMSEntry({ entry }: { entry: LedgerEntry }) {
  const sms = entry.sms!;
  const isOutbound = sms.direction === "outbound";

  return (
    <div className="px-6 py-4 border-b border-neutral-100">
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
            isOutbound ? "bg-blue-100" : "bg-neutral-100"
          )}
        >
          <MessageSquare
            className={cn(
              "w-4 h-4",
              isOutbound ? "text-blue-600" : "text-neutral-500"
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wide",
                isOutbound ? "text-blue-600" : "text-neutral-500"
              )}
            >
              {isOutbound ? "Sent" : "Received"}
            </span>
            <span className="text-[10px] text-neutral-400 uppercase tracking-wide">
              {format(new Date(entry.timestamp), "MMM d, h:mm a")}
            </span>
          </div>
          <p className="text-sm text-neutral-900 whitespace-pre-wrap">
            {sms.body}
          </p>
        </div>
      </div>
    </div>
  );
}

function SessionEntry({ entry }: { entry: LedgerEntry }) {
  const session = entry.session!;

  return (
    <div className="px-6 py-4 border-b border-neutral-100 bg-emerald-50/50">
      <div className="flex items-start gap-4">
        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Video className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
              Session
            </span>
            <span className="text-[10px] text-neutral-400 uppercase tracking-wide">
              {format(new Date(entry.timestamp), "MMM d, h:mm a")}
            </span>
            {session.audio_duration_seconds && (
              <span className="text-[10px] text-neutral-400">
                · {formatDuration(session.audio_duration_seconds)}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-neutral-900">
            {session.name || "Untitled Session"}
          </p>
          {session.description && (
            <p className="text-sm text-neutral-600 mt-1 line-clamp-2">
              {session.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function Ledger() {
  const { account } = useValues(authLogic);

  const [searchQuery, setSearchQuery] = useState("");
  const [accounts, setAccounts] = useState<AdminAccountList[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsPage, setAccountsPage] = useState(1);
  const [accountsTotalPages, setAccountsTotalPages] = useState(1);
  const [accountsCount, setAccountsCount] = useState(0);
  const [selectedAccount, setSelectedAccount] =
    useState<AdminAccountList | null>(null);
  const [ledger, setLedger] = useState<AccountLedgerResponse | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // Share modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareLink, setShareLink] = useState<LedgerShareLink | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Entries are already sorted by the backend based on sortOrder
  const sortedEntries = ledger?.entries ?? [];

  const fetchAccounts = useCallback(
    async (page: number, search?: string) => {
      setAccountsLoading(true);
      try {
        const { data, error } = await client.GET(
          "/api/lms/accounts/admin/accounts/",
          {
            params: {
              query: {
                page,
                page_size: 20,
                ...(search ? { search } : {}),
              },
            },
          }
        );
        if (error) throw error;
        const response = data as {
          results: AdminAccountList[];
          count: number;
          page: number;
          total_pages: number;
        };
        setAccounts(response?.results || []);
        setAccountsCount(response?.count || 0);
        setAccountsTotalPages(response?.total_pages || 1);
      } catch (err) {
        console.error("Failed to fetch accounts:", err);
      } finally {
        setAccountsLoading(false);
      }
    },
    []
  );

  const loadLedger = useCallback(
    async (accountId: string, page: number, order: SortOrder) => {
      setLedgerLoading(true);
      try {
        const { data, error } = await client.GET(
          "/api/lms/accounts/admin/accounts/{account_id}/ledger/",
          {
            params: {
              path: { account_id: accountId },
              query: { page_size: 50, page, sort_order: order },
            },
          }
        );
        if (error) throw error;
        setLedger(data || null);
      } catch (err) {
        console.error("Failed to load ledger:", err);
      } finally {
        setLedgerLoading(false);
      }
    },
    []
  );

  // Fetch accounts when page or search changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchAccounts(accountsPage, searchQuery || undefined);
    }, searchQuery ? 300 : 0); // Debounce search, immediate for page changes

    return () => clearTimeout(timeoutId);
  }, [accountsPage, searchQuery, fetchAccounts]);

  // Reset accounts page when search changes
  useEffect(() => {
    setAccountsPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (selectedAccount) {
      loadLedger(selectedAccount.id, currentPage, sortOrder);
    } else {
      setLedger(null);
    }
  }, [selectedAccount, currentPage, sortOrder, loadLedger]);

  // Reset page when account changes
  const handleSelectAccount = (account: AdminAccountList) => {
    if (selectedAccount?.id !== account.id) {
      setCurrentPage(1);
    }
    setSelectedAccount(account);
  };

  // Reset page when sort order changes
  const handleToggleSortOrder = () => {
    setCurrentPage(1);
    setSortOrder(sortOrder === "desc" ? "asc" : "desc");
  };

  // Create share link
  const handleCreateShareLink = async () => {
    if (!selectedAccount) return;

    setShareLoading(true);
    try {
      const { data, error } = await client.POST(
        "/api/lms/accounts/admin/share-links/",
        {
          body: {
            account_id: selectedAccount.id,
            description: "Shared ledger",
            expires_in_days: 30,
          },
        }
      );
      if (error) throw error;
      setShareLink(data);
      setShareModalOpen(true);
    } catch (err) {
      console.error("Failed to create share link:", err);
      toast.error("Failed to create share link");
    } finally {
      setShareLoading(false);
    }
  };

  // Copy share link to clipboard
  const handleCopyShareLink = async () => {
    if (!shareLink?.share_url) return;

    try {
      await navigator.clipboard.writeText(shareLink.share_url);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      toast.error("Failed to copy link");
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (ledger && currentPage < ledger.total_pages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleAccountsPrevPage = () => {
    if (accountsPage > 1) {
      setAccountsPage(accountsPage - 1);
    }
  };

  const handleAccountsNextPage = () => {
    if (accountsPage < accountsTotalPages) {
      setAccountsPage(accountsPage + 1);
    }
  };

  if (!account?.is_admin) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-50">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">
            Access Denied
          </h1>
          <p className="text-neutral-500">Admin access required.</p>
        </div>
      </div>
    );
  }

  const displayName = selectedAccount
    ? selectedAccount.profile_names.length > 0
      ? selectedAccount.profile_names[0]
      : selectedAccount.account_phone
    : null;

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <div className="w-72 border-r border-neutral-200 flex flex-col bg-neutral-50">
        <div className="p-4">
          <h1 className="text-sm font-semibold text-neutral-900 mb-3">
            Accounts
          </h1>
          <TextInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search..."
            iconLeft={Search}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {accountsLoading ? (
            <div className="px-4 py-8 text-center text-sm text-neutral-400">
              Loading...
            </div>
          ) : accounts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-neutral-400">
              {searchQuery ? "No results" : "No accounts"}
            </div>
          ) : (
            accounts.map((acct) => (
              <AccountListItem
                key={acct.id}
                account={acct}
                isSelected={selectedAccount?.id === acct.id}
                onClick={() => handleSelectAccount(acct)}
              />
            ))
          )}
        </div>

        <div className="px-4 py-3 border-t border-neutral-200 flex items-center justify-between">
          <span className="text-xs text-neutral-400">
            {accountsCount} account{accountsCount !== 1 ? "s" : ""}
          </span>
          {accountsTotalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={handleAccountsPrevPage}
                disabled={accountsPage === 1}
                className="p-1 text-neutral-400 hover:text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-neutral-500">
                {accountsPage}/{accountsTotalPages}
              </span>
              <button
                onClick={handleAccountsNextPage}
                disabled={accountsPage >= accountsTotalPages}
                className="p-1 text-neutral-400 hover:text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {selectedAccount ? (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">
                  {displayName}
                </h2>
                <p className="text-sm text-neutral-500 flex items-center gap-1.5 mt-0.5">
                  <Phone className="w-3.5 h-3.5" />
                  {selectedAccount.account_phone}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateShareLink}
                  disabled={shareLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors disabled:opacity-50"
                >
                  <Link className="w-3.5 h-3.5" />
                  {shareLoading ? "Creating..." : "Share"}
                </button>
                <button
                  onClick={handleToggleSortOrder}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors"
                >
                  {sortOrder === "desc" ? (
                    <ArrowDownUp className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  )}
                  {sortOrder === "desc" ? "Newest first" : "Oldest first"}
                </button>
              </div>
            </div>

            {/* Entries */}
            <div className="flex-1 overflow-y-auto">
              {ledgerLoading ? (
                <div className="px-6 py-12 text-center text-sm text-neutral-400">
                  Loading...
                </div>
              ) : sortedEntries.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-neutral-400">
                  No activity
                </div>
              ) : (
                sortedEntries.map((entry, i) =>
                  entry.type === "sms" && entry.sms ? (
                    <SMSEntry key={`sms-${i}`} entry={entry} />
                  ) : entry.type === "session" && entry.session ? (
                    <SessionEntry key={`session-${i}`} entry={entry} />
                  ) : null
                )
              )}
            </div>

            {/* Footer with Pagination */}
            {ledger && (
              <div className="px-6 py-3 border-t border-neutral-200 flex items-center justify-between">
                <span className="text-xs text-neutral-400">
                  Page {ledger.page} of {ledger.total_pages} ({ledger.total_entries} entries)
                </span>
                {ledger.total_pages > 1 && (
                  <div className="flex gap-1">
                    <Button
                      onClick={handlePrevPage}
                      disabled={currentPage === 1}
                      variant="subtle"
                      size="sm"
                      iconLeft={ChevronLeft}
                    >
                      Previous
                    </Button>
                    <Button
                      onClick={handleNextPage}
                      disabled={currentPage >= ledger.total_pages}
                      variant="subtle"
                      size="sm"
                      iconRight={ChevronRight}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <User className="w-10 h-10 mx-auto mb-3 text-neutral-300" />
              <p className="text-sm text-neutral-400">Select an account</p>
            </div>
          </div>
        )}
      </div>

      {/* Share Link Modal */}
      <AnimatePresence>
        {shareModalOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShareModalOpen(false)}
          >
            <motion.div
              className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                <h2 className="text-lg font-semibold text-neutral-900">
                  Share Ledger
                </h2>
                <button
                  onClick={() => setShareModalOpen(false)}
                  className="p-1 hover:bg-neutral-100 rounded-md transition-colors"
                >
                  <X className="w-5 h-5 text-neutral-400" />
                </button>
              </div>

              {/* Content */}
              <div className="px-6 py-4">
                <p className="text-sm text-neutral-600 mb-4">
                  Share this link with investors or stakeholders. The link
                  expires in 30 days.
                </p>
                {shareLink && (
                  <div className="flex items-center gap-2">
                    <TextInput
                      value={shareLink.share_url}
                      onChange={() => {}}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleCopyShareLink}
                      variant="secondary"
                      iconLeft={copied ? Check : Copy}
                    >
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-neutral-200 flex justify-end">
                <Button
                  variant="subtle"
                  onClick={() => setShareModalOpen(false)}
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
