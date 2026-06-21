/**
 * Escalation Centre
 *
 * Row 2 right of the Claims Manager Command Centre.
 * Shows claims in escalated states (disputed, manual_review, high/critical fraud)
 * grouped into six actionable categories.
 * Data source: trpc.claims.getEscalations
 *
 * Redesign: switched from grid-cols-3 tiles to a 2-column list-row layout
 * matching the AttentionRequiredPanel pattern for visual consistency.
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertOctagon, Scale, FileQuestion, ShieldAlert, Gavel, AlertTriangle, Loader2 } from "lucide-react";

interface EscalationCategory {
  label: string;
  count: number;
  icon: React.ReactNode;
  severity: "critical" | "high" | "medium" | "neutral";
  topClaims: Array<{ claimNumber: string; amount: number | null; currency: string }>;
}

function fmtAmt(cents: number | null, currency = "ZAR"): string {
  if (!cents) return "—";
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const SEV_BORDER: Record<string, string> = {
  critical: "border-l-red-400",
  high: "border-l-orange-400",
  medium: "border-l-amber-400",
  neutral: "border-l-slate-300",
};

const SEV_ICON: Record<string, string> = {
  critical: "text-red-500",
  high: "text-orange-500",
  medium: "text-amber-500",
  neutral: "text-slate-400",
};

const SEV_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300",
  medium: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
  neutral: "bg-muted text-muted-foreground border-border",
};

function EscalationRow({ label, count, icon, severity, topClaims }: EscalationCategory) {
  const isActive = count > 0;
  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border-l-2 ${
        isActive ? SEV_BORDER[severity] : "border-l-border"
      } bg-muted/30 hover:bg-muted/50 transition-colors`}
    >
      <span className={`shrink-0 mt-0.5 ${isActive ? SEV_ICON[severity] : "text-muted-foreground"}`}>
        {icon}
      </span>

      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium leading-snug ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
          {label}
        </p>
        {isActive && topClaims.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {topClaims.slice(0, 2).map((c, i) => (
              <span
                key={i}
                className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5 text-muted-foreground font-mono"
              >
                {c.claimNumber} · {fmtAmt(c.amount, c.currency)}
              </span>
            ))}
          </div>
        )}
      </div>

      <span
        className={`shrink-0 text-sm font-bold tabular-nums px-2 py-0.5 rounded-full border text-center min-w-[2rem] ${
          isActive ? SEV_BADGE[severity] : "bg-muted text-muted-foreground border-border"
        }`}
      >
        {count}
      </span>
    </div>
  );
}

export function EscalationCentre() {
  const { data: escalations, isLoading } = trpc.claims.getEscalations.useQuery(undefined, {
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const categories: EscalationCategory[] = (() => {
    if (!escalations) return [];
    const rows = escalations as any[];

    const highValue = rows.filter(r => (r.totalClaimAmount ?? r.estimatedClaimValue ?? 0) >= 10000000);
    const highFraud = rows.filter(r => r.fraudRiskLevel === "high" || r.fraudRiskLevel === "critical");
    const disputed = rows.filter(r => r.workflowState === "disputed");
    const manualReview = rows.filter(r => r.workflowState === "manual_review");
    const criticalFraud = rows.filter(r => r.fraudRiskLevel === "critical");
    const stale = rows.filter(r => {
      if (!r.updatedAt) return false;
      const daysSince = (Date.now() - new Date(r.updatedAt).getTime()) / 86400000;
      return daysSince > 7;
    });

    const toTop = (arr: any[]) =>
      arr.slice(0, 3).map(r => ({
        claimNumber: r.claimNumber ?? `#${r.id}`,
        amount: r.totalClaimAmount ?? r.estimatedClaimValue ?? null,
        currency: r.currencyCode ?? "ZAR",
      }));

    return [
      {
        label: "Critical Fraud",
        count: criticalFraud.length,
        icon: <AlertOctagon className="h-3.5 w-3.5" />,
        severity: "critical" as const,
        topClaims: toTop(criticalFraud),
      },
      {
        label: "High Value Disputed",
        count: highValue.length,
        icon: <Scale className="h-3.5 w-3.5" />,
        severity: "high" as const,
        topClaims: toTop(highValue),
      },
      {
        label: "Formal Disputes",
        count: disputed.length,
        icon: <Gavel className="h-3.5 w-3.5" />,
        severity: "medium" as const,
        topClaims: toTop(disputed),
      },
      {
        label: "Manual Review",
        count: manualReview.length,
        icon: <FileQuestion className="h-3.5 w-3.5" />,
        severity: "medium" as const,
        topClaims: toTop(manualReview),
      },
      {
        label: "High Fraud Risk",
        count: highFraud.length,
        icon: <ShieldAlert className="h-3.5 w-3.5" />,
        severity: "high" as const,
        topClaims: toTop(highFraud),
      },
      {
        label: "Stale (>7 days)",
        count: stale.length,
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        severity: "neutral" as const,
        topClaims: toTop(stale),
      },
    ];
  })();

  const totalEscalated = escalations?.length ?? 0;

  return (
    <Card className="border-0 shadow-sm h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-red-500" />
            Escalation Centre
          </span>
          {totalEscalated > 0 && (
            <Badge variant="destructive" className="text-xs font-bold">
              {totalEscalated} escalated
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Loading escalations...</span>
          </div>
        ) : totalEscalated === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <AlertOctagon className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm font-medium">No active escalations</p>
            <p className="text-xs mt-1 opacity-70">All claims are progressing normally</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {categories.map((cat) => (
              <EscalationRow key={cat.label} {...cat} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
