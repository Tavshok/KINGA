import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, Clock, Star, AlertTriangle } from "lucide-react";

function getTierColor(tier: string) {
  switch (tier) {
    case "elite": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
    case "senior": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "standard": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  }
}

function getScoreColor(score: number) {
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export function WorkforceIntelligence() {
  const { data: assessorData, isLoading: assessorLoading } =
    trpc.analytics.getAssessorPerformance.useQuery();

  const { data: productivityData, isLoading: productivityLoading } =
    trpc.workflowAnalytics.getUserProductivity.useQuery({});

  const isLoading = assessorLoading || productivityLoading;

  const assessors = (assessorData as any)?.assessors ?? [];
  const productivity = productivityData?.data ?? [];

  // Top processors by transition count
  const processors = productivity
    .filter((u: any) => u.userRole === "claims_processor")
    .sort((a: any, b: any) => b.transitionCount - a.transitionCount)
    .slice(0, 5);

  // Identify potential overload: processors with > 2x average
  const avgTransitions =
    processors.length > 0
      ? processors.reduce((sum: number, p: any) => sum + p.transitionCount, 0) / processors.length
      : 0;
  const overloadedProcessors = processors.filter(
    (p: any) => p.transitionCount > avgTransitions * 1.8
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-5 bg-muted rounded w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[0, 1, 2].map((j) => (
                  <div key={j} className="h-10 bg-muted rounded" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Assessor Performance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500" />
            Assessor Performance
            <Badge variant="outline" className="ml-auto text-xs">
              {assessors.length} assessors
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {assessors.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No assessor data available
            </p>
          ) : (
            <div className="space-y-2">
              {assessors.slice(0, 5).map((a: any) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/40"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{a.name}</span>
                      <Badge className={`text-xs px-1.5 py-0 ${getTierColor(a.tier)}`}>
                        {a.tier}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {a.totalAssessments} assessments
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {a.avgCompletionTime}h avg
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-sm font-bold ${getScoreColor(a.performanceScore)}`}>
                      {a.performanceScore}
                    </span>
                    <p className="text-xs text-muted-foreground">score</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Processor Workload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            Processor Workload
            {overloadedProcessors.length > 0 && (
              <Badge className="ml-auto bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {overloadedProcessors.length} overloaded
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {processors.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No processor activity data available
            </p>
          ) : (
            <div className="space-y-2">
              {processors.map((p: any, idx: number) => {
                const isOverloaded = p.transitionCount > avgTransitions * 1.8;
                const pct = avgTransitions > 0
                  ? Math.min(100, Math.round((p.transitionCount / (avgTransitions * 2)) * 100))
                  : 50;
                return (
                  <div key={idx} className="p-2 rounded-lg bg-muted/40">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        User #{p.userId}
                        {isOverloaded && (
                          <span className="ml-2 text-xs text-red-500 font-normal">
                            ⚠ High load
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.transitionCount} actions · {p.claimsHandled} claims
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isOverloaded ? "bg-red-500" : "bg-blue-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
