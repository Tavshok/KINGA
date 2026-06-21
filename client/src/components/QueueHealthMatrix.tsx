/**
 * Queue Health Matrix
 *
 * Row 1 of the Claims Manager Command Centre.
 * Shows count, average age, oldest claim, and SLA breach % per workflow stage.
 * Data source: trpc.claimsManager.getQueueHealthMatrix
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Clock, Activity } from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  intake_queue: "Intake Queue",
  intake_verified: "Intake Verified",
  assigned: "Assigned",
  under_assessment: "Under Assessment",
  internal_review: "Internal Review",
  technical_approval: "Tech Approval",
  financial_decision: "Financial Decision",
  payment_authorized: "Payment Auth",
  closed: "Closed",
  disputed: "Disputed",
};

function HealthBadge({ health }: { health: string }) {
  if (health === "critical") return (
    <Badge variant="destructive" className="text-xs px-1.5 py-0">Critical</Badge>
  );
  if (health === "warning") return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs px-1.5 py-0">Warning</Badge>
  );
  return (
    <Badge className="bg-green-100 text-green-700 border-green-200 text-xs px-1.5 py-0">Healthy</Badge>
  );
}

export function QueueHealthMatrix() {
  const { data, isLoading } = trpc.claimsManager.getQueueHealthMatrix.useQuery(undefined, {
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-teal-600" />
            Queue Health Matrix
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="animate-pulse space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const matrix = data?.matrix ?? [];
  const activeStages = matrix.filter(s => s.count > 0);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-teal-600" />
            Queue Health Matrix
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              {data?.totalActive ?? 0} active
            </span>
            {(data?.totalSlaBreaches ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-amber-600 font-medium">
                <AlertTriangle className="h-3 w-3" />
                {data?.totalSlaBreaches} SLA breaches
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {activeStages.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <CheckCircle className="h-4 w-4 text-green-500" />
            All queues are empty — no active claims in workflow.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-1.5 pr-3 font-medium">Stage</th>
                  <th className="text-right py-1.5 px-2 font-medium">Count</th>
                  <th className="text-right py-1.5 px-2 font-medium">Avg Age</th>
                  <th className="text-right py-1.5 px-2 font-medium">Oldest</th>
                  <th className="text-right py-1.5 px-2 font-medium">SLA Breaches</th>
                  <th className="text-right py-1.5 pl-2 font-medium">Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {activeStages.map((row) => (
                  <tr key={row.stage} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-3 font-medium text-foreground">
                      {STAGE_LABELS[row.stage] ?? row.stage}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-blue-600">
                      {row.count}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <span className={row.avgAgeDays > row.slaThresholdDays ? "text-amber-600 font-medium" : "text-foreground"}>
                        {row.avgAgeDays}d
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex flex-col items-end">
                        <span className={row.oldestAgeDays > row.slaThresholdDays * 2 ? "text-red-600 font-semibold" : "text-foreground"}>
                          {row.oldestAgeDays}d
                        </span>
                        {row.oldestClaimNumber && (
                          <span className="text-muted-foreground text-[10px]">{row.oldestClaimNumber}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right">
                      {row.slaBreachCount > 0 ? (
                        <span className="text-amber-600 font-medium">
                          {row.slaBreachCount} ({row.slaBreachPct}%)
                        </span>
                      ) : (
                        <span className="text-green-600">0</span>
                      )}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <HealthBadge health={row.health} />
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
