/**
 * Capacity Forecast
 *
 * Row 3 (right half) of the Claims Manager Command Centre.
 * Shows 7-day intake vs completion trend and backlog trajectory.
 * Data source: trpc.claimsManager.getCapacityForecast
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, BarChart3, ArrowRight } from "lucide-react";

function TrajectoryBadge({ trajectory }: { trajectory: "growing" | "stable" | "shrinking" }) {
  if (trajectory === "growing") return (
    <Badge className="bg-red-100 text-red-700 border-red-200 text-xs flex items-center gap-1">
      <TrendingUp className="h-3 w-3" /> Growing
    </Badge>
  );
  if (trajectory === "shrinking") return (
    <Badge className="bg-green-100 text-green-700 border-green-200 text-xs flex items-center gap-1">
      <TrendingDown className="h-3 w-3" /> Shrinking
    </Badge>
  );
  return (
    <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs flex items-center gap-1">
      <Minus className="h-3 w-3" /> Stable
    </Badge>
  );
}

export function CapacityForecast() {
  const { data, isLoading } = trpc.claimsManager.getCapacityForecast.useQuery(undefined, {
    refetchInterval: 120000,
  });

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm h-full">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            Capacity Forecast
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="animate-pulse space-y-3">
            <div className="h-12 bg-muted rounded-lg" />
            <div className="h-24 bg-muted rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const days = data?.days ?? [];
  const maxVal = Math.max(...days.flatMap(d => [d.intake, d.completions]), 1);

  return (
    <Card className="border-0 shadow-sm h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            Capacity Forecast (7-day)
          </CardTitle>
          {data?.trajectory && <TrajectoryBadge trajectory={data.trajectory} />}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-2">
            <p className="text-base font-bold text-blue-600">{data?.avgDailyIntake ?? 0}</p>
            <p className="text-[10px] text-blue-600/70">Avg daily intake</p>
          </div>
          <div className="rounded-lg bg-green-50 border border-green-100 p-2">
            <p className="text-base font-bold text-green-600">{data?.avgDailyCompletions ?? 0}</p>
            <p className="text-[10px] text-green-600/70">Avg daily completions</p>
          </div>
          <div className={`rounded-lg border p-2 ${(data?.netBacklogChange ?? 0) > 0 ? "bg-amber-50 border-amber-100" : "bg-slate-50 border-slate-100"}`}>
            <p className={`text-base font-bold ${(data?.netBacklogChange ?? 0) > 0 ? "text-amber-600" : "text-slate-600"}`}>
              {(data?.netBacklogChange ?? 0) > 0 ? "+" : ""}{data?.netBacklogChange ?? 0}
            </p>
            <p className="text-[10px] text-muted-foreground">Net backlog Δ</p>
          </div>
        </div>

        {/* Mini bar chart */}
        {days.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-1">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-400 inline-block" />Intake</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-400 inline-block" />Completions</span>
            </div>
            <div className="flex items-end gap-1 h-16">
              {days.map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full flex items-end gap-0.5 h-12">
                    <div
                      className="flex-1 bg-blue-400 rounded-t-sm min-h-[2px]"
                      style={{ height: `${Math.max(2, (day.intake / maxVal) * 48)}px` }}
                      title={`Intake: ${day.intake}`}
                    />
                    <div
                      className="flex-1 bg-green-400 rounded-t-sm min-h-[2px]"
                      style={{ height: `${Math.max(2, (day.completions / maxVal) * 48)}px` }}
                      title={`Completions: ${day.completions}`}
                    />
                  </div>
                  <span className="text-[8px] text-muted-foreground">{day.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projection */}
        <div className="flex items-center justify-between text-xs border-t pt-2">
          <span className="text-muted-foreground">Active backlog now:</span>
          <span className="font-semibold">{data?.activeBacklog ?? 0}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Projected in 7d:</span>
          <span className={`font-semibold ${(data?.projectedBacklogIn7d ?? 0) > (data?.activeBacklog ?? 0) ? "text-amber-600" : "text-green-600"}`}>
            {data?.projectedBacklogIn7d ?? 0}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
