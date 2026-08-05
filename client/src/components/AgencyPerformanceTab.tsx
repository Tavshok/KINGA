/**
 * AgencyPerformanceTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * M-06: Agency performance analytics — conversion rate, revenue pipeline,
 * and insurer breakdown.
 */

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Target, DollarSign, CheckCircle2, Clock, XCircle, Building2 } from "lucide-react";
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCents(cents: number): string {
  if (cents >= 100_000_00) return `$${(cents / 100_000_00).toFixed(1)}M`;
  if (cents >= 1_000_00) return `$${(cents / 1_000_00).toFixed(1)}K`;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
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
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
        <p className="text-xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AgencyPerformanceTab() {
  const [periodDays, setPeriodDays] = useState(90);

  const { data: metrics, isLoading } =
    trpc.agencyBroker.getPerformanceMetrics.useQuery({ days: periodDays });

  const funnel = metrics?.funnel;
  const insurerBreakdown = metrics?.insurerBreakdown ?? [];

  const conversionRate = funnel?.conversionRate ?? 0;
  const radialData = [{ name: "Conversion", value: conversionRate, fill: "#22C55E" }];

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex justify-end">
        <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 180 days</SelectItem>
            <SelectItem value="365">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted/40 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPITile
              label="Total Submissions"
              value={String(funnel?.total ?? 0)}
              sub={`Last ${periodDays} days`}
              icon={Target}
              accent="bg-blue-600"
            />
            <KPITile
              label="Accepted"
              value={String(funnel?.accepted ?? 0)}
              sub={`${conversionRate}% conversion`}
              icon={CheckCircle2}
              accent="bg-emerald-600"
            />
            <KPITile
              label="Pending"
              value={String(funnel?.pending ?? 0)}
              sub="Awaiting decision"
              icon={Clock}
              accent="bg-amber-500"
            />
            <KPITile
              label="Est. Commission"
              value={fmtCents(funnel?.totalEstimatedCommissionCents ?? 0)}
              sub="From accepted quotes"
              icon={DollarSign}
              accent="bg-purple-600"
            />
          </div>

          {/* Conversion Rate + Insurer Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Conversion Rate Gauge */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Conversion Rate
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <div className="relative" style={{ height: 160, width: "100%" }}>
                  <ResponsiveContainer width="100%" height={160}>
                    <RadialBarChart
                      cx="50%"
                      cy="60%"
                      innerRadius="60%"
                      outerRadius="90%"
                      barSize={16}
                      data={radialData}
                      startAngle={180}
                      endAngle={0}
                    >
                      <RadialBar
                        background={{ fill: "var(--muted)" }}
                        dataKey="value"
                        cornerRadius={8}
                        max={100}
                      />
                      <Tooltip formatter={(v: number) => [`${v}%`, "Conversion Rate"]} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-end justify-center pb-4">
                    <div className="text-center">
                      <p className="text-3xl font-bold">{conversionRate}%</p>
                      <p className="text-xs text-muted-foreground">of submissions accepted</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 w-full mt-2">
                  <div className="text-center p-2 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Accepted</p>
                    <p className="text-sm font-bold text-emerald-600">{funnel?.accepted ?? 0}</p>
                  </div>
                  <div className="text-center p-2 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Pending</p>
                    <p className="text-sm font-bold text-amber-600">{funnel?.pending ?? 0}</p>
                  </div>
                  <div className="text-center p-2 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground">Rejected</p>
                    <p className="text-sm font-bold text-red-600">{funnel?.rejected ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Insurer Breakdown */}
            <Card className="lg:col-span-2 border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Insurer Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {insurerBreakdown.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No insurer data yet for this period.
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Insurer</th>
                        <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">Submissions</th>
                        <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">Accepted</th>
                        <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">Conversion</th>
                        <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">Est. Commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insurerBreakdown.map((ins: any, i: number) => (
                        <tr key={i} className="border-b border-border hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 px-4 text-sm font-mono text-muted-foreground">
                            {ins.insurerTenantId ?? "Unknown"}
                          </td>
                          <td className="py-2.5 px-4 text-sm text-right">{ins.total}</td>
                          <td className="py-2.5 px-4 text-sm text-right text-emerald-600 font-medium">{ins.accepted}</td>
                          <td className="py-2.5 px-4 text-right">
                            <Badge
                              variant="secondary"
                              className={`text-xs ${ins.conversionRate >= 50 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : ins.conversionRate >= 25 ? "bg-amber-100 text-amber-800" : ""}`}
                            >
                              {ins.conversionRate}%
                            </Badge>
                          </td>
                          <td className="py-2.5 px-4 text-sm text-right font-medium">
                            {fmtCents(ins.totalCommissionCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
