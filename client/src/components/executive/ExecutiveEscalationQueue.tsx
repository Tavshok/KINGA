import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Clock } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

function riskBadge(level: string | null) {
  if (!level) return null;
  const map: Record<string, string> = {
    high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  };
  return (
    <Badge className={`text-xs px-1.5 py-0 capitalize ${map[level] ?? "bg-muted text-muted-foreground"}`}>
      {level}
    </Badge>
  );
}

export function ExecutiveEscalationQueue() {
  const { data, isLoading } = trpc.executive.getEscalationQueue.useQuery();
  const { fmt } = useTenantCurrency();

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2">
          <div className="h-5 bg-muted rounded w-56" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const items = data?.items ?? [];
  const threshold = data?.threshold ?? 2_500_000;
  const totalExposure = data?.totalExposure ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Executive Escalation Queue
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs">
              {items.length} pending sign-off
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Claims in financial decision stage above {fmt(threshold)} requiring executive approval.
          Total exposure: <span className="font-semibold text-foreground">{fmt(totalExposure)}</span>
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No high-value claims awaiting executive sign-off</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-2 px-2">Claim #</th>
                  <th className="text-left py-2 px-2">Vehicle</th>
                  <th className="text-right py-2 px-2">Amount</th>
                  <th className="text-left py-2 px-2">Fraud Risk</th>
                  <th className="text-left py-2 px-2">Priority</th>
                  <th className="text-right py-2 px-2">Age</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-2 font-mono text-xs font-medium">
                      {item.claimNumber ?? `#${item.id}`}
                    </td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">
                      {item.vehicleRegistration ?? "—"}
                    </td>
                    <td className="py-2 px-2 text-right text-xs font-semibold text-[#1A6B3A]">
                      {fmt(item.amount)}
                    </td>
                    <td className="py-2 px-2">
                      {riskBadge(item.fraudRiskLevel)}
                    </td>
                    <td className="py-2 px-2">
                      {item.priority ? (
                        <Badge variant="outline" className="text-xs capitalize">
                          {item.priority}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span className={`text-xs flex items-center justify-end gap-1 ${item.ageDays >= 3 ? "text-red-500" : "text-muted-foreground"}`}>
                        <Clock className="h-3 w-3" />
                        {item.ageDays}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
