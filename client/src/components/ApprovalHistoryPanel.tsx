/**
 * ApprovalHistoryPanel
 *
 * Full audit trail of every approval decision at every stage for a claim.
 * Displays a timeline view with actor, timestamp, decision, and notes.
 */

import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  ArrowUpCircle,
  Clock,
  Loader2,
  History,
  User,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  claims_processor: "Claims Processor",
  internal_assessor: "Internal Assessor",
  external_assessor: "External Assessor",
  risk_manager: "Risk Manager",
  claims_manager: "Claims Manager",
  executive: "Executive / GM",
  underwriter: "Underwriter",
};

const DECISION_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; icon: React.ElementType }
> = {
  approved: {
    label: "Approved",
    color: "text-green-700 dark:text-green-200",
    bgColor: "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    color: "text-red-700 dark:text-red-200",
    bgColor: "bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700",
    icon: XCircle,
  },
  returned: {
    label: "Returned",
    color: "text-yellow-700 dark:text-yellow-200",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/40 border-yellow-300 dark:border-yellow-700",
    icon: RotateCcw,
  },
  escalated: {
    label: "Escalated",
    color: "text-orange-700 dark:text-orange-200",
    bgColor: "bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700",
    icon: ArrowUpCircle,
  },
  external_received: {
    label: "External Received",
    color: "text-purple-700 dark:text-purple-200",
    bgColor: "bg-purple-100 dark:bg-purple-900/40 border-purple-300 dark:border-purple-700",
    icon: CheckCircle2,
  },
};

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

// ─── Timeline Entry ────────────────────────────────────────────────────────────

function TimelineEntry({
  entry,
  isLast,
}: {
        entry: {
    id: number;
    stageOrder: number | null;
    stageName: string | null;
    roleKey: string | null;
    actorName: string | null;
    decision: string;
    notes: string | null;
    actedAt: string | null;
  };
  isLast: boolean;
}) {
  const cfg = DECISION_CONFIG[entry.decision] ?? {
    label: entry.decision,
    color: "text-gray-700 dark:text-gray-200",
    bgColor: "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600",
    icon: Clock,
  };
  const Icon = cfg.icon;

  return (
    <div className="flex gap-3">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${cfg.bgColor}`}>
          <Icon className={`h-4 w-4 ${cfg.color}`} />
        </div>
        {!isLast && <div className="w-0.5 bg-border flex-1 mt-1" />}
      </div>

      {/* Content */}
      <div className={`pb-4 flex-1 ${isLast ? "" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                Stage {entry.stageOrder ?? "?"}
              </span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">
                {entry.roleKey ? (ROLE_LABELS[entry.roleKey] ?? entry.roleKey) : "Unknown"}
              </span>
            </div>
            <p className="text-sm font-medium mt-0.5">{entry.stageName ?? "Approval Stage"}</p>
          </div>
          <Badge className={`${cfg.bgColor} ${cfg.color} border text-xs shrink-0`}>
            {cfg.label}
          </Badge>
        </div>

        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <User className="h-3 w-3" />
          <span>{entry.actorName}</span>
          <span>·</span>
          <span>{formatTimestamp(entry.actedAt)}</span>
        </div>

        {entry.notes && (
          <div className="mt-2 text-xs bg-muted/50 rounded p-2 text-muted-foreground italic">
            "{entry.notes}"
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ApprovalHistoryPanel({ claimId }: { claimId: number }) {
  const { data: history, isLoading } = trpc.approval.getApprovalHistory.useQuery(
    { claim_id: claimId },
    { refetchOnWindowFocus: false }
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Approval History</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Full audit trail of every decision at every approval stage
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && (!history || history.length === 0) && (
          <div className="text-center py-8">
            <History className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No approval actions recorded yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Actions will appear here as the claim progresses through the workflow.
            </p>
          </div>
        )}

        {history && history.length > 0 && (
          <div className="space-y-0">
            {history.map((entry, i) => (
              <TimelineEntry
                key={entry.id}
                entry={{
                  id: entry.id,
                  stageOrder: entry.stageOrder ?? null,
                  stageName: entry.stageName ?? null,
                  roleKey: entry.roleKey ?? null,
                  actorName: entry.actorName ?? null,
                  decision: entry.decision,
                  notes: entry.notes ?? null,
                  actedAt: entry.actedAt ?? null,
                }}
                isLast={i === history.length - 1}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
