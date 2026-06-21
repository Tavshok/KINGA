/**
 * Attention Required Panel
 *
 * Row 2 of the Claims Manager Command Centre.
 * Shows seven exception categories that require immediate attention.
 * Data source: trpc.claimsManager.getAttentionRequired
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, TrendingUp, Shield, Zap, FileWarning, BarChart3 } from "lucide-react";

interface CategoryCardProps {
  label: string;
  count: number;
  icon: React.ReactNode;
  severity: "critical" | "high" | "medium";
  topClaims?: Array<{ claimNumber: string; ageDays: number }>;
}

function CategoryCard({ label, count, icon, severity, topClaims }: CategoryCardProps) {
  const colors = {
    critical: "bg-red-50 border-red-200 text-red-700",
    high: "bg-amber-50 border-amber-200 text-amber-700",
    medium: "bg-blue-50 border-blue-200 text-blue-700",
  };
  const countColors = {
    critical: "text-red-600",
    high: "text-amber-600",
    medium: "text-blue-600",
  };

  return (
    <div className={`rounded-lg border p-3 ${count > 0 ? colors[severity] : "bg-muted/30 border-border text-muted-foreground"}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {icon}
          <span>{label}</span>
        </div>
        <span className={`text-lg font-bold ${count > 0 ? countColors[severity] : "text-muted-foreground"}`}>
          {count}
        </span>
      </div>
      {count > 0 && topClaims && topClaims.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {topClaims.slice(0, 3).map((c, i) => (
            <div key={i} className="text-[10px] opacity-75 flex justify-between">
              <span>{c.claimNumber}</span>
              <span>{c.ageDays}d</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AttentionRequiredPanel() {
  const { data, isLoading } = trpc.claimsManager.getAttentionRequired.useQuery(undefined, {
    refetchInterval: 60000,
  });

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
          <div className="animate-pulse grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = data?.totalAttentionRequired ?? 0;

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
            <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
              All clear
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <CategoryCard
            label="High Value Pending"
            count={data?.highValuePending?.count ?? 0}
            icon={<TrendingUp className="h-3 w-3" />}
            severity="high"
            topClaims={data?.highValuePending?.topClaims}
          />
          <CategoryCard
            label="High Fraud Risk"
            count={data?.highFraudActive?.count ?? 0}
            icon={<Shield className="h-3 w-3" />}
            severity="critical"
            topClaims={data?.highFraudActive?.topClaims}
          />
          <CategoryCard
            label="Stuck Claims"
            count={data?.stuckClaims?.count ?? 0}
            icon={<Clock className="h-3 w-3" />}
            severity="high"
            topClaims={data?.stuckClaims?.topClaims}
          />
          <CategoryCard
            label="SLA Breaches"
            count={data?.slaBreaches?.count ?? 0}
            icon={<AlertTriangle className="h-3 w-3" />}
            severity="critical"
            topClaims={data?.slaBreaches?.topClaims}
          />
          <CategoryCard
            label="Awaiting Tech Approval"
            count={data?.awaitingTechApproval?.count ?? 0}
            icon={<FileWarning className="h-3 w-3" />}
            severity="medium"
            topClaims={data?.awaitingTechApproval?.topClaims}
          />
          <CategoryCard
            label="Awaiting Financial Decision"
            count={data?.awaitingFinancialDecision?.count ?? 0}
            icon={<BarChart3 className="h-3 w-3" />}
            severity="medium"
            topClaims={data?.awaitingFinancialDecision?.topClaims}
          />
          <CategoryCard
            label="Escalated"
            count={data?.escalatedClaims?.count ?? 0}
            icon={<Zap className="h-3 w-3" />}
            severity="critical"
            topClaims={data?.escalatedClaims?.topClaims}
          />
        </div>
      </CardContent>
    </Card>
  );
}
