import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, CheckCircle2, Clock, AlertTriangle,
  CheckCheck, Filter
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  claims_manager: "Claims Manager",
  claims_processor: "Claims Processor",
  internal_assessor: "Internal Assessor",
  external_assessor: "External Assessor",
  risk_manager: "Risk Manager",
  executive: "Executive",
  panel_beater: "Panel Beater",
  insurer: "Insurer",
  assessor: "Assessor",
};

const ROLE_COLORS: Record<string, string> = {
  claims_manager: "bg-blue-100 text-blue-800",
  claims_processor: "bg-cyan-100 text-cyan-800",
  internal_assessor: "bg-purple-100 text-purple-800",
  external_assessor: "bg-violet-100 text-violet-800",
  risk_manager: "bg-orange-100 text-orange-800",
  executive: "bg-gray-100 text-gray-800",
  panel_beater: "bg-green-100 text-green-800",
  insurer: "bg-blue-100 text-blue-800",
  assessor: "bg-purple-100 text-purple-800",
};

const TYPE_COLORS: Record<string, string> = {
  clarification: "bg-yellow-100 text-yellow-800",
  instruction: "bg-blue-100 text-blue-800",
  escalation: "bg-red-100 text-red-800",
  approval_note: "bg-green-100 text-green-800",
  rejection_note: "bg-red-100 text-red-800",
  inspection_request: "bg-orange-100 text-orange-800",
  general: "bg-gray-100 text-gray-700",
};

type FilterType = "all" | "unread" | "requires_response" | "resolved";

const FILTERS: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "requires_response", label: "Requires Response" },
  { value: "resolved", label: "Resolved" },
];

// ── NotificationCard ──────────────────────────────────────────────────────────

interface NotificationRecord {
  id: number;
  claimId: number;
  claimNumber?: string;
  authorRole: string;
  authorName?: string;
  commentType: string;
  requiresResponse: boolean;
  responseDeadlineAt?: string | null;
  body: string;
  isResolved: boolean;
  createdAt: string;
  isRead?: boolean;
}

interface NotificationCardProps {
  notification: NotificationRecord;
  onMarkRead: (id: number) => void;
  onResolve: (id: number) => void;
}

function NotificationCard({ notification, onMarkRead, onResolve }: NotificationCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isOverdue = notification.requiresResponse &&
    notification.responseDeadlineAt &&
    new Date(notification.responseDeadlineAt) < new Date() &&
    !notification.isResolved;

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 cursor-pointer transition-colors ${
        notification.isResolved
          ? "bg-muted/20 border-border opacity-60"
          : notification.isRead === false
          ? "bg-primary/5 border-primary/30"
          : "bg-card border-border hover:bg-muted/20"
      }`}
      onClick={() => {
        setExpanded(!expanded);
        if (!notification.isRead) onMarkRead(notification.id);
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {notification.isRead === false && (
            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-0.5" />
          )}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${ROLE_COLORS[notification.authorRole] ?? "bg-gray-100 text-gray-700"}`}>
            {ROLE_LABELS[notification.authorRole] ?? notification.authorRole}
          </span>
          {notification.authorName && (
            <span className="text-xs text-muted-foreground truncate">{notification.authorName}</span>
          )}
          <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${TYPE_COLORS[notification.commentType] ?? "bg-gray-100 text-gray-700"}`}>
            {notification.commentType.replace(/_/g, " ")}
          </span>
          {notification.claimNumber && (
            <span className="text-xs font-mono text-muted-foreground">#{notification.claimNumber}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isOverdue && (
            <span className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Overdue
            </span>
          )}
          {notification.requiresResponse && !notification.isResolved && !isOverdue && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {notification.responseDeadlineAt
                ? `By ${new Date(notification.responseDeadlineAt).toLocaleDateString()}`
                : "Response needed"}
            </span>
          )}
          {notification.isResolved && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Resolved
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {new Date(notification.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Body preview / expanded */}
      <p className={`text-sm leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
        {notification.body}
      </p>

      {/* Actions */}
      {expanded && !notification.isResolved && (
        <div className="flex items-center gap-2 pt-1" onClick={e => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-green-600 hover:text-green-700"
            onClick={() => onResolve(notification.id)}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Mark Resolved
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

/**
 * NotificationsInbox — used in the Notifications tab of every role dashboard.
 * Shows all claim communications directed to the current user.
 */
export function NotificationsInbox() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterType>("all");
  const utils = trpc.useUtils();

  const { data: notifications, isLoading } = trpc.claimComms.myNotifications.useQuery(
    { filter },
    { enabled: !!user, refetchInterval: 30000 }
  );

  const markRead = trpc.claimComms.markRead.useMutation({
    onSuccess: () => utils.claimComms.unreadCount.invalidate(),
  });

  const markAllRead = trpc.claimComms.markAllRead.useMutation({
    onSuccess: () => {
      utils.claimComms.myNotifications.invalidate();
      utils.claimComms.unreadCount.invalidate();
    },
  });

  const resolve = trpc.claimComms.resolve.useMutation({
    onSuccess: () => {
      utils.claimComms.myNotifications.invalidate();
      utils.claimComms.unreadCount.invalidate();
    },
  });

  const unreadCount = (notifications ?? []).filter(n => !n.isRead).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {f.label}
              {f.value === "unread" && unreadCount > 0 && (
                <span className="ml-1 bg-primary-foreground text-primary rounded-full px-1 text-xs">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground text-center py-8">Loading notifications...</div>
      ) : !notifications || notifications.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {filter === "unread" ? "No unread notifications" :
             filter === "requires_response" ? "No pending responses required" :
             filter === "resolved" ? "No resolved threads" :
             "No notifications yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <NotificationCard
              key={n.id}
              notification={n as any}
              onMarkRead={id => markRead.mutate({ commentId: id })}
              onResolve={id => resolve.mutate({ commentId: id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * NotificationsTabBadge — shows unread count for the tab trigger.
 */
export function NotificationsTabBadge() {
  const { user } = useAuth();
  const { data } = trpc.claimComms.unreadCount.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000,
  });

  const count = data?.count ?? 0;
  if (count === 0) return <span>Notifications</span>;

  return (
    <span className="flex items-center gap-1.5">
      Notifications
      <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center">
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
