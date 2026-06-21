/**
 * Attention Required Panel
 *
 * Row 2 of the Claims Manager Command Centre.
 * Shows seven exception categories that require immediate attention.
 * Data source: trpc.claimsManager.getAttentionRequired
 *
 * Layout redesign: 2-column list rows instead of grid-cols-7.
 * Each row: left-border severity indicator + icon + label + count badge.
 * Eliminates mid-word text wrapping on "Awaiting Financial Decision" etc.
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, TrendingUp, Shield, Zap, FileWarning, BarChart3 } from "lucide-react";

interface CategoryRowProps {
  label: string;
  count: number;
  icon: React.ReactNode;
  severity: "critical" | "high" | "medium";
  topClaims?: Array<{ claimNumber: string; ageDays: number }>;
}

const SEV_BORDER: Record<string, string> = {
  critical: "border-l-red-400",
  high: "border-l-amber-400",
  medium: "border-l-blue-400",
};

const SEV_ICON: Record<string, string> = {
  critical: "text-red-500",
  high: "text-amber-500",
  medium: "text-blue-500",
};

const SEV_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
  medium: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
};

function CategoryRow({ label, count, icon, severity, topClaims }: CategoryRowProps) {
  const isActive = count > 0;
  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border-l-2 ${
        isActive ? SEV_BORDER[severity] : "border-l-border"
      } bg-muted/30 hover:bg-muted/50 transition-colors`}
    >
      {/* Icon */}
      <span
        className={`shrink-0 mt-0.5 ${
          isActive ? SEV_ICON[severity] : "text-muted-foreground"
        }`}
      >
        {icon}
      </span>

      {/* Label + optional top-claim pills */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-xs font-medium leading-snug ${
            isActive ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {label}
        </p>
        {isActive && topClaims && topClaims.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {topClaims.slice(0, 2).map((c, i) => (
              <span
                key={i}
                className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5 text-muted-foreground font-mono"
              >
                {c.claimNumber} · {c.ageDays}d
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Count badge */}
      <span
        className={`shrink-0 text-sm font-bold tabular-nums px-2 py-0.5 rounded-full border text-center min-w-[2rem] ${
          isActive
            ? SEV_BADGE[severity]
            : "bg-muted text-muted-foreground border-border"
        }`}
      >
        {count}
      </span>
    </div>
  );
}

export function AttentionRequiredPanel() {
  const { data, isLoading } = trpc.claimsManager.getAttentionRequired.useQuery(
    undefined,
    { refetchInterval: 60000 }
  );

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Attention Required
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="animate-pulse grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = data?.totalAttentionRequired ?? 0;

  const categories: CategoryRowProps[] = [
    {
      label: "High Value Pending",
      count: data?.highValuePending?.count ?? 0,
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      severity: "high",
      topClaims: data?.highValuePending?.topClaims,
    },
    {
      label: "High Fraud Risk",
      count: data?.highFraudActive?.count ?? 0,
      icon: <Shield className="h-3.5 w-3.5" />,
      severity: "critical",
      topClaims: data?.highFraudActive?.topClaims,
    },
    {
      label: "Stuck Claims",
      count: data?.stuckClaims?.count ?? 0,
      icon: <Clock className="h-3.5 w-3.5" />,
      severity: "high",
      topClaims: data?.stuckClaims?.topClaims,
    },
    {
      label: "SLA Breaches",
      count: data?.slaBreaches?.count ?? 0,
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      severity: "critical",
      topClaims: data?.slaBreaches?.topClaims,
    },
    {
      label: "Awaiting Tech Approval",
      count: data?.awaitingTechApproval?.count ?? 0,
      icon: <FileWarning className="h-3.5 w-3.5" />,
      severity: "medium",
      topClaims: data?.awaitingTechApproval?.topClaims,
    },
    {
      label: "Awaiting Financial Decision",
      count: data?.awaitingFinancialDecision?.count ?? 0,
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      severity: "medium",
      topClaims: data?.awaitingFinancialDecision?.topClaims,
    },
    {
      label: "Escalated",
      count: data?.escalatedClaims?.count ?? 0,
      icon: <Zap className="h-3.5 w-3.5" />,
      severity: "critical",
      topClaims: data?.escalatedClaims?.topClaims,
    },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Attention Required
          </CardTitle>
          {total > 0 ? (
            <Badge variant="destructive" className="text-xs">
              {total} claims need action
            </Badge>
          ) : (
            <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 text-xs">
              All clear
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {categories.map((cat) => (
            <CategoryRow key={cat.label} {...cat} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
