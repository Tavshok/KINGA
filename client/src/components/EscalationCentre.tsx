/**
 * Escalation Centre
 *
 * Row 2 right of the Claims Manager Command Centre.
 * Shows claims in escalated states (disputed, manual_review, high/critical fraud)
 * grouped into six actionable categories.
 * Data source: trpc.claims.getEscalations
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertOctagon, Scale, FileQuestion, ShieldAlert, Gavel, AlertTriangle, Loader2 } from "lucide-react";

interface EscalationCategory {
  label: string;
  count: number;
  icon: React.ReactNode;
  color: string;
  badgeVariant: "destructive" | "secondary" | "outline";
  topClaims: Array<{ claimNumber: string; amount: number | null; currency: string }>;
}

function fmt(cents: number | null, currency = "ZAR"): string {
  if (!cents) return "—";
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function EscalationCentre() {
  const { data: escalations, isLoading } = trpc.claims.getEscalations.useQuery(undefined, {
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const categories: EscalationCategory[] = (() => {
    if (!escalations) return [];
    const rows = escalations as any[];

    const highValue = rows.filter(r => (r.totalClaimAmount ?? r.estimatedClaimValue ?? 0) >= 10000000); // ≥ R100k
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
        color: "bg-red-50 border-red-200 text-red-700",
        badgeVariant: "destructive" as const,
        topClaims: toTop(criticalFraud),
      },
      {
        label: "High Value Disputed",
        count: highValue.length,
        icon: <Scale className="h-3.5 w-3.5" />,
        color: "bg-orange-50 border-orange-200 text-orange-700",
        badgeVariant: "destructive" as const,
        topClaims: toTop(highValue),
      },
      {
        label: "Formal Disputes",
        count: disputed.length,
        icon: <Gavel className="h-3.5 w-3.5" />,
        color: "bg-amber-50 border-amber-200 text-amber-700",
        badgeVariant: "secondary" as const,
        topClaims: toTop(disputed),
      },
      {
        label: "Manual Review",
        count: manualReview.length,
        icon: <FileQuestion className="h-3.5 w-3.5" />,
        color: "bg-yellow-50 border-yellow-200 text-yellow-700",
        badgeVariant: "secondary" as const,
        topClaims: toTop(manualReview),
      },
      {
        label: "High Fraud Risk",
        count: highFraud.length,
        icon: <ShieldAlert className="h-3.5 w-3.5" />,
        color: "bg-purple-50 border-purple-200 text-purple-700",
        badgeVariant: "secondary" as const,
        topClaims: toTop(highFraud),
      },
      {
        label: "Stale (>7 days)",
        count: stale.length,
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        color: "bg-slate-50 border-slate-200 text-slate-600",
        badgeVariant: "outline" as const,
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {categories.map((cat) => (
              <div
                key={cat.label}
                className={`rounded-lg border p-2.5 ${cat.count > 0 ? cat.color : "bg-muted/20 border-border text-muted-foreground"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1 text-xs font-medium">
                    {cat.icon}
                    <span className="leading-tight">{cat.label}</span>
                  </div>
                  <span className={`text-lg font-bold ${cat.count > 0 ? "" : "text-muted-foreground"}`}>
                    {cat.count}
                  </span>
                </div>
                {cat.count > 0 && cat.topClaims.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {cat.topClaims.map((c, i) => (
                      <div key={i} className="text-[10px] opacity-75 flex justify-between">
                        <span className="font-mono">{c.claimNumber}</span>
                        <span>{fmt(c.amount, c.currency)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
