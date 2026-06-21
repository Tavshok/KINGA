/**
 * Approval Workbench
 *
 * Row 3 (left half) of the Claims Manager Command Centre.
 * Shows claims awaiting technical approval and financial decision.
 * Data source: trpc.claimsManager.getApprovalWorkbenchMetrics
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Clock, DollarSign, AlertTriangle } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

export function ApprovalWorkbench() {
  const { fmt } = useTenantCurrency();
  const { data, isLoading } = trpc.claimsManager.getApprovalWorkbenchMetrics.useQuery(undefined, {
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm h-full">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-violet-600" />
            Approval Workbench
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="animate-pulse space-y-3">
            <div className="h-16 bg-muted rounded-lg" />
            <div className="h-16 bg-muted rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const tech = data?.techApproval;
  const fin = data?.financialDecision;
  const oldest = data?.oldestApproval;

  return (
    <Card className="border-0 shadow-sm h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-violet-600" />
            Approval Workbench
          </CardTitle>
          {(data?.totalPendingApproval ?? 0) > 0 && (
            <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-xs">
              {data?.totalPendingApproval} pending
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {/* Technical Approval */}
        <div className={`rounded-lg p-3 border ${(tech?.count ?? 0) > 0 ? "bg-blue-50 border-blue-200" : "bg-muted/30 border-border"}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-blue-700 flex items-center gap-1">
              <CheckSquare className="h-3 w-3" />
              Awaiting Technical Approval
            </span>
            <span className="text-lg font-bold text-blue-600">{tech?.count ?? 0}</span>
          </div>
          {(tech?.count ?? 0) > 0 && (
            <div className="flex items-center gap-3 text-[11px] text-blue-600/70">
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                Avg {tech?.avgAgeDays ?? 0}d
              </span>
              {tech?.topClaims?.slice(0, 3).map((c: any, i: number) => (
                <span key={i} className="opacity-75">{c.claimNumber}</span>
              ))}
            </div>
          )}
        </div>

        {/* Financial Decision */}
        <div className={`rounded-lg p-3 border ${(fin?.count ?? 0) > 0 ? "bg-violet-50 border-violet-200" : "bg-muted/30 border-border"}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-violet-700 flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Awaiting Financial Decision
            </span>
            <span className="text-lg font-bold text-violet-600">{fin?.count ?? 0}</span>
          </div>
          {(fin?.count ?? 0) > 0 && (
            <div className="flex items-center gap-3 text-[11px] text-violet-600/70">
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                Avg {fin?.avgAgeDays ?? 0}d
              </span>
              {(data?.highValuePending?.count ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-amber-600 font-medium">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {data?.highValuePending?.count} high-value
                </span>
              )}
            </div>
          )}
        </div>

        {/* Oldest Approval */}
        {oldest && oldest.claimNumber && (
          <div className="rounded-lg p-2.5 bg-amber-50 border border-amber-200">
            <p className="text-[11px] font-medium text-amber-700 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Oldest pending: <span className="font-bold">{oldest.claimNumber}</span> — {oldest.age}d waiting
            </p>
          </div>
        )}

        {/* Summary */}
        {(data?.totalPendingApproval ?? 0) === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No claims pending approval.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
