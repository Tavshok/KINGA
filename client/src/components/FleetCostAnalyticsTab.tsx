/**
 * FleetCostAnalyticsTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * H-06: Fleet cost analytics tab for the Fleet Manager Dashboard.
 * Shows total claim costs, cost trends, and top cost vehicles.
 */

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  TrendingUp,
  Car,
  AlertCircle,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCents(cents: number): string {
  if (cents >= 100_000_00) return `$${(cents / 100_000_00).toFixed(1)}M`;
  if (cents >= 1_000_00) return `$${(cents / 1_000_00).toFixed(1)}K`;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtMonth(yyyyMM: string): string {
  const [y, m] = yyyyMM.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

function KPITile({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub?: string; icon: React.ElementType; accent: string;
}) {
  return (
    <div className="p-4 bg-card border border-border rounded-lg flex items-start gap-3">
      <div className={`p-2 rounded-lg ${accent}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium truncate">{label}</p>
        <p className="text-xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function FleetCostAnalyticsTab() {
  const [periodDays, setPeriodDays] = useState(365);

  const { data: breakdown, isLoading: breakdownLoading } =
    trpc.fleetAccounts.getFleetCostBreakdown.useQuery({ days: periodDays });

  const { data: trends = [], isLoading: trendsLoading } =
    trpc.fleetAccounts.getFleetCostTrends.useQuery();

  const summary = breakdown?.summary;
  const topVehicles = breakdown?.topVehicles ?? [];

  const trendData = (trends as any[]).map((r) => ({
    month: fmtMonth(r.month),
    approved: r.approvedCents / 100,
    estimated: r.estimatedCents / 100,
    count: r.count,
  }));

  const vehicleBarData = topVehicles.map((v: any) => ({
    name: v.reg,
    label: `${v.make} ${v.model}`.trim() || v.reg,
    cost: v.totalCents / 100,
    count: v.count,
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            Fleet Cost Analytics
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Claim cost breakdown and trends for your fleet
          </p>
        </div>
        <Select
          value={String(periodDays)}
          onValueChange={(v) => setPeriodDays(Number(v))}
        >
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 180 days</SelectItem>
            <SelectItem value="365">Last 12 months</SelectItem>
            <SelectItem value="730">Last 24 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Strip */}
      {breakdownLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 bg-muted/40 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !summary ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No claim data available for the selected period.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KPITile
            label="Total Approved Cost"
            value={fmtCents(summary.totalApprovedCents)}
            sub={`${summary.completedClaims} completed claims`}
            icon={DollarSign}
            accent="bg-emerald-600"
          />
          <KPITile
            label="Total Estimated Cost"
            value={fmtCents(summary.totalEstimatedCents)}
            sub="Across all claims"
            icon={TrendingUp}
            accent="bg-blue-600"
          />
          <KPITile
            label="Avg Cost per Claim"
            value={fmtCents(summary.avgCostPerClaimCents)}
            sub={`${summary.totalClaims} total claims`}
            icon={BarChart3}
            accent="bg-purple-600"
          />
          <KPITile
            label="Open Claims"
            value={String(summary.openClaims)}
            sub="Pending settlement"
            icon={AlertCircle}
            accent="bg-amber-500"
          />
          <KPITile
            label="Completed Claims"
            value={String(summary.completedClaims)}
            sub="Fully settled"
            icon={CheckCircle2}
            accent="bg-teal-600"
          />
          <KPITile
            label="Vehicles Tracked"
            value={String(topVehicles.length > 0 ? topVehicles.length : "—")}
            sub="With claim history"
            icon={Car}
            accent="bg-slate-600"
          />
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Cost Trend */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Monthly Cost Trend (12 months)</CardTitle>
          </CardHeader>
          <CardContent>
            {trendsLoading ? (
              <div className="h-48 bg-muted/30 rounded animate-pulse" />
            ) : trendData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                No monthly data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="approvedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="estimatedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`}
                  />
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      `$${v.toLocaleString("en-US", { minimumFractionDigits: 0 })}`,
                      name === "approved" ? "Approved" : "Estimated",
                    ]}
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  />
                  <Area type="monotone" dataKey="estimated" stroke="#3B82F6" strokeWidth={1.5} fill="url(#estimatedGrad)" strokeDasharray="4 2" />
                  <Area type="monotone" dataKey="approved" stroke="#22C55E" strokeWidth={2} fill="url(#approvedGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
            <div className="flex items-center gap-4 mt-2 justify-center">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-3 h-0.5 bg-emerald-500 rounded" />
                Approved
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-3 h-0.5 bg-blue-500 rounded border-dashed" />
                Estimated
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Cost Vehicles */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Car className="h-4 w-4 text-muted-foreground" />
              Top Cost Vehicles
            </CardTitle>
          </CardHeader>
          <CardContent>
            {breakdownLoading ? (
              <div className="h-48 bg-muted/30 rounded animate-pulse" />
            ) : vehicleBarData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                No vehicle cost data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={vehicleBarData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`}
                  />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip
                    formatter={(v: number) => [`$${v.toLocaleString("en-US", { minimumFractionDigits: 0 })}`, "Total Cost"]}
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  />
                  <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                    {vehicleBarData.map((_: any, i: number) => (
                      <Cell key={i} fill={i === 0 ? "#EF4444" : i === 1 ? "#F97316" : "#3B82F6"} opacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Vehicle Cost Table */}
      {topVehicles.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Vehicle Cost Detail</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Registration</th>
                  <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
                  <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">Total Cost</th>
                  <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">Claims</th>
                  <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">Avg/Claim</th>
                </tr>
              </thead>
              <tbody>
                {topVehicles.map((v: any, i: number) => (
                  <tr key={v.reg} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-4 text-sm font-mono font-medium">{v.reg}</td>
                    <td className="py-2.5 px-4 text-sm text-muted-foreground">
                      {`${v.make} ${v.model}`.trim() || "—"}
                    </td>
                    <td className="py-2.5 px-4 text-sm font-semibold text-right">
                      <span className={i === 0 ? "text-red-600" : i === 1 ? "text-orange-600" : ""}>
                        {fmtCents(v.totalCents)}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-sm text-right">
                      <Badge variant="secondary" className="text-xs">{v.count}</Badge>
                    </td>
                    <td className="py-2.5 px-4 text-sm text-muted-foreground text-right">
                      {v.count > 0 ? fmtCents(Math.round(v.totalCents / v.count)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
