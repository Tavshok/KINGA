import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, AlertTriangle } from "lucide-react";

type Assignee = {
  id: string;
  name: string;
  activeCount: number;
  oldestDaysAgo: number;
};

function AssigneeRow({ person, avgCount }: { person: Assignee; avgCount: number }) {
  const isOverloaded = avgCount > 0 && person.activeCount > avgCount * 1.8;
  const pct = avgCount > 0
    ? Math.min(100, Math.round((person.activeCount / (avgCount * 2)) * 100))
    : 50;

  return (
    <div className="p-2 rounded-lg bg-muted/40">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium truncate max-w-[160px]">
          {person.name}
          {isOverloaded && (
            <span className="ml-2 text-xs text-red-500 font-normal">⚠ High load</span>
          )}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {person.oldestDaysAgo}d oldest
          </span>
          <Badge
            className={`text-xs px-1.5 py-0 ${
              isOverloaded
                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                : "bg-[#1A6B3A]/10 text-[#1A6B3A] dark:bg-[#3C7844]/20 dark:text-[#68A890]"
            }`}
          >
            {person.activeCount} active
          </Badge>
        </div>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${
            isOverloaded ? "bg-red-500" : "bg-[#1A6B3A]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function WorkloadDistributionPanel() {
  const { data, isLoading } = trpc.claimsManager.getWorkloadDistribution.useQuery();

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

  const processors: Assignee[] = (data?.processors ?? []).slice(0, 6);
  const assessors: Assignee[] = (data?.assessors ?? []).slice(0, 6);

  const avgProcessorCount =
    processors.length > 0
      ? processors.reduce((s, p) => s + p.activeCount, 0) / processors.length
      : 0;
  const avgAssessorCount =
    assessors.length > 0
      ? assessors.reduce((s, a) => s + a.activeCount, 0) / assessors.length
      : 0;

  const overloadedCount =
    processors.filter((p) => p.activeCount > avgProcessorCount * 1.8).length +
    assessors.filter((a) => a.activeCount > avgAssessorCount * 1.8).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Workload Distribution
        </span>
        <div className="flex items-center gap-2">
          {overloadedCount > 0 && (
            <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {overloadedCount} overloaded
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {data?.totalActive ?? 0} active claims
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Processors */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-[#1A6B3A]" />
              Processor Backlog
              <Badge variant="outline" className="ml-auto text-xs">
                {processors.length} assigned
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {processors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No active processor assignments
              </p>
            ) : (
              <div className="space-y-2">
                {processors.map((p) => (
                  <AssigneeRow key={p.id} person={p} avgCount={avgProcessorCount} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assessors */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-[#3C7844]" />
              Assessor Backlog
              <Badge variant="outline" className="ml-auto text-xs">
                {assessors.length} assigned
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {assessors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No active assessor assignments
              </p>
            ) : (
              <div className="space-y-2">
                {assessors.map((a) => (
                  <AssigneeRow key={a.id} person={a} avgCount={avgAssessorCount} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
