import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, AlertTriangle, TrendingDown } from "lucide-react";

export function SendBackAnalytics() {
  const { data, isLoading } = trpc.claimsManager.getSendBackAnalytics.useQuery();

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2">
          <div className="h-5 bg-muted rounded w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const hasData = data.totalSendBacks > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-orange-500" />
          Rework Intelligence
          {data.totalSendBacks > 0 && (
            <Badge className="ml-auto bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 text-xs">
              {data.totalSendBacks} send-backs
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {!hasData ? (
          <div className="text-center py-4">
            <TrendingDown className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              No send-backs recorded
            </p>
            <p className="text-xs text-muted-foreground">Workflow is progressing cleanly</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 p-3 text-center">
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {data.totalSendBacks}
                </p>
                <p className="text-xs text-muted-foreground">Total Send-backs</p>
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-center">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {data.last30DaysSendBacks}
                </p>
                <p className="text-xs text-muted-foreground">Last 30 Days</p>
              </div>
            </div>

            {/* Top transitions */}
            {data.topTransitions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Top Rework Paths
                </p>
                <div className="space-y-1">
                  {data.topTransitions.slice(0, 3).map((t, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/40"
                    >
                      <span className="font-mono text-muted-foreground truncate mr-2">
                        {t.transition}
                      </span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {t.count}×
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top reasons */}
            {data.topReasons.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Top Reasons
                </p>
                <div className="space-y-1">
                  {data.topReasons.slice(0, 3).map((r, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/40"
                    >
                      <span className="text-muted-foreground truncate mr-2">{r.reason}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {r.count}×
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top rework users */}
            {data.topReworkUsers.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-orange-500" />
                  High Rework Users
                </p>
                <div className="space-y-1">
                  {data.topReworkUsers.slice(0, 3).map((u, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/40"
                    >
                      <span className="text-muted-foreground">
                        User #{u.userId}{" "}
                        <span className="text-muted-foreground/60">({u.role})</span>
                      </span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {u.count} send-backs
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
