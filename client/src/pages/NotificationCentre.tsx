/**
 * Notification Centre — Epic 5-B
 *
 * Full-page notification hub accessible from all portals at /notifications.
 * Features:
 *   - Tabs: All / Unread / Archived
 *   - Module filter (claims, fraud, vehicle_passport, …)
 *   - Priority badges
 *   - Mark as read / archive per item
 *   - Mark all read / archive all read bulk actions
 *   - Link to Preferences page
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bell,
  Archive,
  CheckCheck,
  Settings,
  ExternalLink,
  AlertTriangle,
  Info,
  AlertCircle,
  Zap,
  ChevronLeft,
} from "lucide-react";
import { ShieldAlert, XCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifFilter = "all" | "unread" | "archived";

const MODULE_LABELS: Record<string, string> = {
  claims: "Claims",
  fraud: "Fraud",
  vehicle_passport: "Vehicle Passport",
  asset_passport: "Asset Passport",
  engineering: "Engineering",
  fleet: "Fleet",
  timeline: "Timeline",
  recoveries: "Recoveries",
  portfolio: "Portfolio",
  predictive: "Predictive Analytics",
};

const PRIORITY_CONFIG: Record<
  string,
  { label: string; icon: React.FC<{ className?: string }>; className: string }
> = {
  low: { label: "Low", icon: Info, className: "text-muted-foreground" },
  medium: { label: "Medium", icon: AlertCircle, className: "text-blue-500" },
  high: { label: "High", icon: AlertTriangle, className: "text-amber-500" },
  urgent: { label: "Urgent", icon: Zap, className: "text-red-500" },
};

// Type-specific icons for notification types
const TYPE_CONFIG: Record<string, { icon: React.FC<{ className?: string }>; className: string; label: string }> = {
  system_alert:       { icon: ShieldAlert,    className: "text-red-500",     label: "System Alert" },
  fraud_detected:     { icon: AlertTriangle,  className: "text-amber-500",   label: "Fraud Alert" },
  assessment_completed: { icon: CheckCircle2, className: "text-green-500",   label: "Assessment" },
  approval_required:  { icon: AlertCircle,    className: "text-blue-500",    label: "Approval" },
  status_changed:     { icon: RefreshCw,      className: "text-purple-500",  label: "Status" },
  claim_assigned:     { icon: Info,           className: "text-blue-400",    label: "Assigned" },
  quote_submitted:    { icon: Info,           className: "text-teal-500",    label: "Quote" },
  document_uploaded:  { icon: Info,           className: "text-slate-500",   label: "Document" },
};

// ─── Notification Item ────────────────────────────────────────────────────────

function NotificationItem({
  notif,
  onRead,
  onArchive,
}: {
  notif: any;
  onRead: (id: number) => void;
  onArchive: (id: number) => void;
}) {
  const [, setLocation] = useLocation();
  const priority = notif.priority ?? "medium";
  // Use type-specific icon if available, otherwise fall back to priority icon
  const typeConf = TYPE_CONFIG[notif.type as string];
  const PriorityIcon = typeConf?.icon ?? PRIORITY_CONFIG[priority]?.icon ?? Info;
  const iconClass = typeConf?.className ?? PRIORITY_CONFIG[priority]?.className;
  const isUnread = !notif.readAt;
  const isArchived = !!notif.archivedAt;

  const moduleLabel =
    typeConf?.label ??
    MODULE_LABELS[notif.module as string] ??
    (notif.entityType ? String(notif.entityType) : "System");

  return (
    <div
      className={cn(
        "flex gap-3 p-4 border-b last:border-b-0 transition-colors",
        isUnread && !isArchived
          ? "bg-primary/5 hover:bg-primary/10"
          : "hover:bg-muted/40"
      )}
    >
      {/* Priority icon */}
      <div className="mt-0.5 shrink-0">
        <PriorityIcon
          className={cn("h-4 w-4", iconClass)}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "text-sm leading-snug",
              isUnread && !isArchived ? "font-semibold" : "font-medium"
            )}
          >
            {notif.title}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {moduleLabel}
            </Badge>
            {isUnread && !isArchived && (
              <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {notif.message}
        </p>

        <div className="flex items-center gap-3 mt-2">
          <span className="text-[10px] text-muted-foreground">
            {notif.createdAt
              ? new Date(notif.createdAt).toLocaleString()
              : ""}
          </span>

          {/* Actions */}
          {!isArchived && (
            <div className="flex gap-2 ml-auto">
              {notif.actionUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={() => {
                    onRead(notif.id);
                    setLocation(notif.actionUrl);
                  }}
                >
                  <ExternalLink className="h-3 w-3" />
                  View
                </Button>
              )}
              {isUnread && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => onRead(notif.id)}
                >
                  Mark read
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => onArchive(notif.id)}
              >
                Archive
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NotificationCentre() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [filter, setFilter] = useState<NotifFilter>("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const utils = trpc.useUtils();

  // Data
  const { data: notifications = [], isLoading } =
    trpc.notifications.getAll.useQuery({
      filter,
      module: moduleFilter === "all" ? undefined : moduleFilter,
      limit: 100,
    }, {
      refetchInterval: 15_000,  // Poll every 15 seconds for real-time updates
      staleTime: 10_000,
    });

  const { data: unreadData } = trpc.notifications.getUnreadCount.useQuery();

  // Client-side filter for notification type (system_alert, fraud_detected, etc.)
  const filteredNotifications = typeFilter === "all"
    ? notifications
    : (notifications as any[]).filter((n: any) => n.type === typeFilter);

  const systemAlertCount = (notifications as any[]).filter((n: any) => n.type === "system_alert" && !n.readAt && !n.archivedAt).length;

  const unreadCount = unreadData?.count ?? 0;

  // Mutations
  const markAsRead = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.getAll.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
  });

  const markAllAsRead = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.getAll.invalidate();
      utils.notifications.getUnreadCount.invalidate();
      toast({ title: "All notifications marked as read" });
    },
  });

  const archive = trpc.notifications.archive.useMutation({
    onSuccess: () => {
      utils.notifications.getAll.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
  });

  const archiveAll = trpc.notifications.archiveAll.useMutation({
    onSuccess: () => {
      utils.notifications.getAll.invalidate();
      utils.notifications.getUnreadCount.invalidate();
      toast({ title: "All read notifications archived" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => window.history.back()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2 flex-1">
            <Bell className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Notification Centre</h1>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {unreadCount}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setLocation("/notifications/preferences")}
            >
              <Settings className="h-3 w-3" />
              Preferences
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        {/* Tabs + filters */}
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as NotifFilter)}
        >
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">
                Unread
                {unreadCount > 0 && (
                  <span className="ml-1.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5">
                    {unreadCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              {/* Module filter */}
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-7 text-xs w-44">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="system_alert">
                    🔴 System Alerts {systemAlertCount > 0 ? `(${systemAlertCount})` : ""}
                  </SelectItem>
                  <SelectItem value="fraud_detected">⚠️ Fraud Alerts</SelectItem>
                  <SelectItem value="assessment_completed">✅ Assessments</SelectItem>
                  <SelectItem value="approval_required">🔵 Approvals</SelectItem>
                  <SelectItem value="status_changed">🔄 Status Changes</SelectItem>
                  <SelectItem value="claim_assigned">📋 Assignments</SelectItem>
                </SelectContent>
              </Select>

              {/* Bulk actions */}
              {filter !== "archived" && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => markAllAsRead.mutate()}
                    disabled={markAllAsRead.isPending || unreadCount === 0}
                  >
                    <CheckCheck className="h-3 w-3" />
                    Mark all read
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => archiveAll.mutate()}
                    disabled={archiveAll.isPending}
                  >
                    <Archive className="h-3 w-3" />
                    Archive read
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Notification list */}
          {(["all", "unread", "archived"] as NotifFilter[]).map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-0">
              <div className="rounded-lg border bg-card overflow-hidden">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    Loading notifications…
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-12 text-center">
                    <Bell className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {tab === "archived"
                        ? "No archived notifications"
                        : tab === "unread"
                        ? "You're all caught up!"
                        : "No notifications yet"}
                    </p>
                  </div>
                ) : (
                  filteredNotifications.map((notif: any) => (
                    <NotificationItem
                      key={notif.id}
                      notif={notif}
                      onRead={(id) => markAsRead.mutate({ notificationId: id })}
                      onArchive={(id) => archive.mutate({ notificationId: id })}
                    />
                  ))
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
