/**
 * FleetRiskAnalyticsTab
 *
 * Shown inside the Fleet Manager Dashboard under the "Risk Analytics" tab.
 * Displays:
 *  - Risk driver leaderboard (employees with most claims)
 *  - Accident date/time heatmap (day of week × hour)
 *  - Claim quantum summary (total, average, by department)
 *  - Monthly claim frequency trend
 */
import { useMemo } from "react";
import {
  AlertTriangle,
  User,
  Calendar,
  Clock,
  DollarSign,
  TrendingUp,
  BarChart3,
  Building2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface FleetClaim {
  id: number;
  claimNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleRegistration: string;
  incidentDate: string | null;
  incidentLocation: string | null;
  status: string;
  createdAt: string | null;
  submittedByName: string | null;
  claimantDepartment: string | null;
  fleetVehicleRef: string | null;
}

interface Props {
  claims: FleetClaim[];
  accountName: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_BLOCKS = ["00-04", "04-08", "08-12", "12-16", "16-20", "20-24"];

function getHourBlock(dateStr: string): string {
  const d = new Date(dateStr);
  const h = d.getHours();
  if (h < 4) return "00-04";
  if (h < 8) return "04-08";
  if (h < 12) return "08-12";
  if (h < 16) return "12-16";
  if (h < 20) return "16-20";
  return "20-24";
}

function heatmapColor(count: number, max: number): string {
  if (max === 0 || count === 0) return "bg-muted/20";
  const ratio = count / max;
  if (ratio > 0.75) return "bg-red-500 text-white";
  if (ratio > 0.5) return "bg-orange-400 text-white";
  if (ratio > 0.25) return "bg-amber-300 text-foreground";
  return "bg-amber-100 text-foreground";
}

export function FleetRiskAnalyticsTab({ claims, accountName }: Props) {
  // ── Risk Drivers (top claimants) ─────────────────────────────────────────
  const riskDrivers = useMemo(() => {
    const map = new Map<string, { name: string; count: number; vehicles: Set<string>; departments: Set<string> }>();
    for (const c of claims) {
      const name = c.submittedByName ?? "Unknown";
      if (!map.has(name)) {
        map.set(name, { name, count: 0, vehicles: new Set(), departments: new Set() });
      }
      const entry = map.get(name)!;
      entry.count++;
      entry.vehicles.add(c.vehicleRegistration);
      if (c.claimantDepartment) entry.departments.add(c.claimantDepartment);
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [claims]);

  // ── Accident day-of-week × hour heatmap ─────────────────────────────────
  const heatmapData = useMemo(() => {
    const grid: Record<string, Record<string, number>> = {};
    for (const day of DAYS) {
      grid[day] = {};
      for (const block of HOUR_BLOCKS) {
        grid[day][block] = 0;
      }
    }
    for (const c of claims) {
      if (!c.incidentDate) continue;
      try {
        const d = new Date(c.incidentDate);
        const day = DAYS[d.getDay()];
        const block = getHourBlock(c.incidentDate);
        grid[day][block]++;
      } catch { /* skip */ }
    }
    const maxVal = Math.max(...DAYS.flatMap((d) => HOUR_BLOCKS.map((b) => grid[d][b])));
    return { grid, maxVal };
  }, [claims]);

  // ── Monthly claim frequency ──────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of claims) {
      const d = c.incidentDate ? new Date(c.incidentDate) : c.createdAt ? new Date(c.createdAt) : null;
      if (!d) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12);
  }, [claims]);

  const maxMonthly = Math.max(...monthlyData.map(([, v]) => v), 1);

  // ── Department breakdown ─────────────────────────────────────────────────
  const deptData = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of claims) {
      const dept = c.claimantDepartment ?? "Unassigned";
      map.set(dept, (map.get(dept) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a);
  }, [claims]);

  const maxDept = Math.max(...deptData.map(([, v]) => v), 1);

  if (claims.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No claims data available for risk analytics.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="py-3">
          <CardContent className="pt-0 pb-0 px-4">
            <p className="text-xs text-muted-foreground">Total Claims</p>
            <p className="text-2xl font-bold">{claims.length}</p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="pt-0 pb-0 px-4">
            <p className="text-xs text-muted-foreground">Unique Vehicles</p>
            <p className="text-2xl font-bold text-blue-600">
              {new Set(claims.map((c) => c.vehicleRegistration)).size}
            </p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="pt-0 pb-0 px-4">
            <p className="text-xs text-muted-foreground">Unique Drivers</p>
            <p className="text-2xl font-bold text-purple-600">
              {new Set(claims.map((c) => c.submittedByName ?? "unknown")).size}
            </p>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="pt-0 pb-0 px-4">
            <p className="text-xs text-muted-foreground">Departments</p>
            <p className="text-2xl font-bold text-emerald-600">
              {new Set(claims.map((c) => c.claimantDepartment).filter(Boolean)).size}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Drivers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Risk Drivers
            </CardTitle>
            <p className="text-xs text-muted-foreground">Employees with highest claim frequency</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {riskDrivers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No driver data available</p>
            ) : (
              riskDrivers.map((driver, idx) => (
                <div key={driver.name} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    idx === 0 ? "bg-red-100 text-red-700" :
                    idx === 1 ? "bg-orange-100 text-orange-700" :
                    idx === 2 ? "bg-amber-100 text-amber-700" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{driver.name}</span>
                      <Badge variant="outline" className={`text-xs flex-shrink-0 ${
                        driver.count >= 3 ? "text-red-600 border-red-200 bg-red-50" :
                        driver.count === 2 ? "text-amber-600 border-amber-200 bg-amber-50" :
                        "text-muted-foreground"
                      }`}>
                        {driver.count} claim{driver.count !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>{driver.vehicles.size} vehicle{driver.vehicles.size !== 1 ? "s" : ""}</span>
                      {driver.departments.size > 0 && (
                        <span className="truncate">{Array.from(driver.departments).join(", ")}</span>
                      )}
                    </div>
                    {/* Mini bar */}
                    <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          driver.count >= 3 ? "bg-red-500" :
                          driver.count === 2 ? "bg-amber-400" :
                          "bg-emerald-400"
                        }`}
                        style={{ width: `${(driver.count / (riskDrivers[0]?.count || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Department breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-500" />
              Claims by Department / Branch
            </CardTitle>
            <p className="text-xs text-muted-foreground">Distribution of claims across departments</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {deptData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No department data — add department when submitting claims</p>
            ) : (
              deptData.map(([dept, count]) => (
                <div key={dept} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate font-medium">{dept}</span>
                    <span className="text-muted-foreground text-xs ml-2 flex-shrink-0">
                      {count} ({Math.round((count / claims.length) * 100)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${(count / maxDept) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Accident time heatmap */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-500" />
            Accident Time Heatmap
          </CardTitle>
          <p className="text-xs text-muted-foreground">When accidents happen — day of week vs. time of day</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left pr-3 py-1 text-muted-foreground font-normal w-12">Day</th>
                  {HOUR_BLOCKS.map((b) => (
                    <th key={b} className="text-center px-1 py-1 text-muted-foreground font-normal">{b}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day) => (
                  <tr key={day}>
                    <td className="pr-3 py-1 font-medium text-muted-foreground">{day}</td>
                    {HOUR_BLOCKS.map((block) => {
                      const count = heatmapData.grid[day][block];
                      return (
                        <td key={block} className="px-1 py-1 text-center">
                          <div
                            className={`rounded w-full h-8 flex items-center justify-center text-xs font-medium ${heatmapColor(count, heatmapData.maxVal)}`}
                          >
                            {count > 0 ? count : ""}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
            <span>Intensity:</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-amber-100" /> Low
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-amber-300" /> Medium
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-orange-400" /> High
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-red-500" /> Critical
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly trend */}
      {monthlyData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Monthly Claim Frequency
            </CardTitle>
            <p className="text-xs text-muted-foreground">Number of claims per month (last 12 months)</p>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1.5 h-32">
              {monthlyData.map(([month, count]) => (
                <div key={month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground">{count}</span>
                  <div
                    className="w-full rounded-t bg-emerald-500 transition-all"
                    style={{ height: `${(count / maxMonthly) * 96}px` }}
                  />
                  <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                    {month.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
