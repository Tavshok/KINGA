/**
 * Executive Analytics Charts
 *
 * Recharts visualisations for the executive dashboard, including:
 *  - Claims volume trend (existing)
 *  - Fraud detection trends (existing)
 *  - Cost breakdown by status (existing)
 *  - Average processing time (existing)
 *  - Fraud risk distribution (existing)
 *  - AI Override Rate KPI (NEW)
 *  - Most Overridden Repairers bar chart (NEW)
 *  - Average Cost Delta on Override KPI (NEW)
 *  - Total AI Savings KPI (NEW)
 */

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from "recharts";
import {
  TrendingUp, DollarSign, Clock, AlertTriangle,
  RotateCcw, Wrench, TrendingDown, Banknote,
} from "lucide-react";

/// ─── Colour palette — KINGA BI Dark Theme ─────────────────────────────────────────

const COLORS = {
  blue:   "#5ba3f5",  // Bright blue for dark bg
  red:    "#f87171",  // Soft red
  green:  "#4ade80",  // Emerald green — KINGA primary
  orange: "#fb923c",  // Amber
  purple: "#c084fc",  // Soft purple
  amber:  "#fbbf24",  // Gold amber
  teal:   "#2dd4bf",  // Teal
  slate:  "#94a3b8",  // Slate grey
};

// Chart grid and axis colors for dark theme
const CHART_GRID = "rgba(255,255,255,0.06)";
const CHART_AXIS = "rgba(255,255,255,0.35)";
const TOOLTIP_STYLE = {
  contentStyle: { background: '#0f1929', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#e2e8f0' },
  labelStyle: { color: '#94a3b8', fontSize: 11 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// formatRands replaced by useTenantCurrency hook in component body

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
      Loading…
    </div>
  );
}

function EmptyPlaceholder({ message = "No data available" }: { message?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
      <AlertTriangle className="h-6 w-6 opacity-40" />
      <span>{message}</span>
    </div>
  );
}

// ─── KPI mini-card used for the four new metrics ──────────────────────────────

interface MiniKPIProps {
  title:    string;
  value:    string | number;
  subtitle?: string;
  icon:     React.ElementType;
  color:    "blue" | "green" | "red" | "amber" | "purple" | "teal";
  loading?: boolean;
}

function MiniKPI({ title, value, subtitle, icon: Icon, color, loading }: MiniKPIProps) {
  const iconStyle: Record<MiniKPIProps["color"], React.CSSProperties> = {
    blue:   { background: 'rgba(91,163,245,0.12)', color: '#5ba3f5' },
    green:  { background: 'rgba(74,222,128,0.12)', color: '#4ade80' },
    red:    { background: 'rgba(248,113,113,0.12)', color: '#f87171' },
    amber:  { background: 'rgba(251,191,36,0.12)',  color: '#fbbf24' },
    purple: { background: 'rgba(192,132,252,0.12)', color: '#c084fc' },
    teal:   { background: 'rgba(45,212,191,0.12)',  color: '#2dd4bf' },
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={iconStyle[color]}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        ) : (
          <>
            <div className="text-2xl font-bold tracking-tight">{value}</div>
            {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExecutiveAnalyticsCharts() {
  const { fmt, currencySymbol } = useTenantCurrency();
  // formatRands: takes already-divided value (rands, not cents), compact notation
  const formatRands = (rands: number) => fmt(Math.round(rands * 100), { compact: true });
  const [timeRange, setTimeRange] = useState<number>(30);

  // ── Existing queries ────────────────────────────────────────────────────────
  const { data: volumeData,        isLoading: volumeLoading }   = trpc.executive.getClaimsVolumeOverTime.useQuery({ days: timeRange });
  const { data: fraudTrends,       isLoading: fraudLoading }    = trpc.executive.getFraudDetectionTrends.useQuery({ days: timeRange });
  const { data: costBreakdown,     isLoading: costLoading }     = trpc.executive.getCostBreakdownByStatus.useQuery();
  const { data: processingTime,    isLoading: timeLoading }     = trpc.executive.getAverageProcessingTime.useQuery();
  const { data: fraudDistribution, isLoading: distLoading }     = trpc.executive.getFraudRiskDistribution.useQuery();

  // ── New queries ─────────────────────────────────────────────────────────────
  const { data: overrideRateData,     isLoading: overrideRateLoading }     = trpc.executive.getOverrideRate.useQuery({ days: timeRange });
  const { data: overridedRepairers,   isLoading: overridedRepairersLoading } = trpc.executive.getMostOverriddenRepairers.useQuery({ days: timeRange });
  const { data: costDeltaData,        isLoading: costDeltaLoading }         = trpc.executive.getAverageCostDeltaOnOverride.useQuery({ days: timeRange });
  const { data: aiSavingsData,        isLoading: aiSavingsLoading }         = trpc.executive.getTotalAISavings.useQuery({ days: timeRange });

  // ── Transform: volume ───────────────────────────────────────────────────────
  const volumeChartData = useMemo(() => {
    return (volumeData?.data ?? []).map((d: any) => ({
      date:          new Date(d.date).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }),
      total:         Number(d.count ?? 0),
      fraudDetected: 0, // fraud count comes from fraudTrends
    }));
  }, [volumeData]);

  // ── Transform: fraud trends ─────────────────────────────────────────────────
  const fraudRateData = useMemo(() => {
    return (fraudTrends?.data ?? []).map((d: any) => ({
      date:   new Date(d.date).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }),
      high:   Number(d.high   ?? 0),
      medium: Number(d.medium ?? 0),
      low:    Number(d.low    ?? 0),
    }));
  }, [fraudTrends]);

  // ── Transform: cost breakdown ───────────────────────────────────────────────
  const costData = useMemo(() => {
    return (costBreakdown?.data ?? []).map((d: any) => ({
      status:        (d.status ?? "").replace(/_/g, " ").toUpperCase(),
      count:         Number(d.count       ?? 0),
      avg_amount:    Number(d.avg_amount  ?? 0),
      total_amount:  Number(d.total_amount ?? 0),
    }));
  }, [costBreakdown]);

  // ── Transform: processing time ──────────────────────────────────────────────
  const processingData = useMemo(() => {
    const avgDays = Number((processingTime?.data as any)?.avg_days ?? 0);
    return [
      { stage: "Completed",          days: avgDays,  fill: COLORS.green  },
      { stage: "Pending Triage",     days: 0,        fill: COLORS.orange },
      { stage: "Under Assessment",   days: 0,        fill: COLORS.blue   },
      { stage: "Awaiting Approval",  days: 0,        fill: COLORS.purple },
    ];
  }, [processingTime]);

  // ── Transform: fraud distribution ──────────────────────────────────────────
  const fraudDistData = useMemo(() => {
    const d = fraudDistribution?.data ?? [];
    return [
      { name: "Low Risk",    value: Number((d as any[]).find(x => x.level === "low")?.count    ?? 0), fill: COLORS.green  },
      { name: "Medium Risk", value: Number((d as any[]).find(x => x.level === "medium")?.count ?? 0), fill: COLORS.orange },
      { name: "High Risk",   value: Number((d as any[]).find(x => x.level === "high")?.count   ?? 0), fill: COLORS.red    },
    ];
  }, [fraudDistribution]);

  // ── Transform: most overridden repairers ────────────────────────────────────
  const overridedRepairersChart = useMemo(() => {
    return (overridedRepairers?.data ?? []).map((r: any) => ({
      name:              r.company_name ?? "Unknown",
      overrides:         Number(r.total_overrides   ?? 0),
      recommended:       Number(r.total_recommended ?? 0),
      override_rate:     Number(r.override_rate     ?? 0),
    }));
  }, [overridedRepairers]);

  // ── Derived KPI values ──────────────────────────────────────────────────────
  const overridePercent   = overrideRateData?.override_percentage ?? 0;
  const totalOptimisations = overrideRateData?.total_optimisations ?? 0;
  const totalOverrides    = overrideRateData?.total_overrides ?? 0;

  const avgCostDeltaRands = costDeltaData?.avg_cost_delta_rands ?? 0;
  const overrideCount     = costDeltaData?.override_count ?? 0;
  const deltaPositive     = avgCostDeltaRands >= 0;

  const totalSavingsRands = aiSavingsData?.total_ai_savings_rands ?? 0;
  const acceptedCount     = aiSavingsData?.accepted_count ?? 0;
  const avgSavingRands    = aiSavingsData?.avg_saving_per_claim_rands ?? 0;

  return (
    <div className="space-y-8">
      {/* ── Time Range Selector ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Analytics Dashboard</h3>
        <Select value={timeRange.toString()} onValueChange={(v) => setTimeRange(parseInt(v))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── AI Quote Optimisation KPIs ─────────────────────────────────────── */}
      <section>
        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          AI Quote Optimisation
        </h4>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Override Rate */}
          <MiniKPI
            title="Override Rate"
            value={`${overridePercent.toFixed(1)}%`}
            subtitle={`${totalOverrides} overrides of ${totalOptimisations} optimisations`}
            icon={RotateCcw}
            color={overridePercent > 40 ? "red" : overridePercent > 20 ? "amber" : "green"}
            loading={overrideRateLoading}
          />

          {/* Total AI Savings */}
          <MiniKPI
            title="Total AI Savings"
            value={formatRands(totalSavingsRands)}
            subtitle={`Across ${acceptedCount} accepted recommendation${acceptedCount !== 1 ? "s" : ""}`}
            icon={Banknote}
            color="green"
            loading={aiSavingsLoading}
          />

          {/* Avg Saving Per Claim */}
          <MiniKPI
            title="Avg Saving / Claim"
            value={formatRands(avgSavingRands)}
            subtitle="When AI recommendation accepted"
            icon={TrendingDown}
            color="teal"
            loading={aiSavingsLoading}
          />

          {/* Avg Cost Delta on Override */}
          <MiniKPI
            title="Avg Cost Delta on Override"
            value={`${deltaPositive ? "+" : ""}${formatRands(avgCostDeltaRands)}`}
            subtitle={`${overrideCount} override${overrideCount !== 1 ? "s" : ""} with cost data${deltaPositive ? " — insurer paid more" : " — insurer paid less"}`}
            icon={deltaPositive ? TrendingUp : TrendingDown}
            color={deltaPositive ? "red" : "green"}
            loading={costDeltaLoading}
          />
        </div>
      </section>

      {/* ── Most Overridden Repairers ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-amber-600" />
            <CardTitle>Most Overridden Repairers</CardTitle>
          </div>
          <CardDescription>
            AI-recommended repairers most frequently overridden by insurers (top 10)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            {overridedRepairersLoading ? (
              <LoadingPlaceholder />
            ) : overridedRepairersChart.length === 0 ? (
              <EmptyPlaceholder message="No override data yet. Data appears once insurers record decisions on optimisation results." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={overridedRepairersChart}
                  layout="vertical"
                  margin={{ top: 4, right: 60, left: 10, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                  <XAxis type="number" fontSize={11} allowDecimals={false} tick={{ fill: CHART_AXIS }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    fontSize={11}
                    width={130}
                    tick={{ fill: CHART_AXIS }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: any, name: string) => {
                      if (name === "overrides")   return [value, "Overrides"];
                      if (name === "recommended") return [value, "Times Recommended"];
                      return [value, name];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="recommended" name="Times Recommended" fill={COLORS.blue}   radius={[0, 3, 3, 0]} />
                  <Bar dataKey="overrides"   name="Overrides"         fill={COLORS.red}    radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          {/* Override rate badges */}
          {overridedRepairersChart.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {overridedRepairersChart.slice(0, 5).map((r) => (
                <Badge
                  key={r.name}
                  variant="outline"
                  className={
                    r.override_rate > 60 ? "border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30" :
                    r.override_rate > 30 ? "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30" :
                    "border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30"
                  }
                >
                  {r.name}: {r.override_rate.toFixed(0)}% override rate
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Existing Charts Grid ───────────────────────────────────────────── */}
      <section>
        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Claims &amp; Fraud Analytics
        </h4>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Claims Volume Over Time */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <CardTitle>Claims Volume Trend</CardTitle>
              </div>
              <CardDescription>Daily claim submissions over the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                {volumeLoading ? <LoadingPlaceholder /> : volumeChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={volumeChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                      <XAxis dataKey="date" fontSize={11} tick={{ fill: CHART_AXIS }} axisLine={false} tickLine={false} />
                      <YAxis fontSize={11} allowDecimals={false} tick={{ fill: CHART_AXIS }} axisLine={false} tickLine={false} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Legend />
                      <Area type="monotone" dataKey="total" name="Total Claims" stroke={COLORS.blue} fill={COLORS.blue} fillOpacity={0.15} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <EmptyPlaceholder />}
              </div>
            </CardContent>
          </Card>

          {/* Fraud Detection Trends */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <CardTitle>Fraud Detection Trends</CardTitle>
              </div>
              <CardDescription>Daily fraud risk level distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                {fraudLoading ? <LoadingPlaceholder /> : fraudRateData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fraudRateData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                      <XAxis dataKey="date" fontSize={11} tick={{ fill: CHART_AXIS }} axisLine={false} tickLine={false} />
                      <YAxis fontSize={11} allowDecimals={false} tick={{ fill: CHART_AXIS }} axisLine={false} tickLine={false} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Legend />
                      <Bar dataKey="high"   name="High Risk"   fill={COLORS.red}    stackId="a" radius={[0,0,0,0]} />
                      <Bar dataKey="medium" name="Medium Risk" fill={COLORS.orange} stackId="a" />
                      <Bar dataKey="low"    name="Low Risk"    fill={COLORS.green}  stackId="a" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyPlaceholder />}
              </div>
            </CardContent>
          </Card>

          {/* Cost Breakdown by Status */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <CardTitle>Cost Breakdown by Status</CardTitle>
              </div>
              <CardDescription>Average and total approved amounts by claim status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                {costLoading ? <LoadingPlaceholder /> : costData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={costData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                      <XAxis dataKey="status" fontSize={9} tick={{ fill: CHART_AXIS }} axisLine={false} tickLine={false} />
                      <YAxis fontSize={11} tick={{ fill: CHART_AXIS }} axisLine={false} tickLine={false} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [`${currencySymbol}${Number(v).toLocaleString("en-US")}`, ""]} />
                      <Legend />
                      <Bar dataKey="avg_amount"   name={`Avg Approved (${currencySymbol})`}   fill={COLORS.blue}  radius={[4,4,0,0]} />
                      <Bar dataKey="total_amount" name={`Total Approved (${currencySymbol})`} fill={COLORS.green} radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyPlaceholder />}
              </div>
            </CardContent>
          </Card>

          {/* Average Processing Time */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-purple-600" />
                <CardTitle>Average Processing Time</CardTitle>
              </div>
              <CardDescription>Average days to close completed claims</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                {timeLoading ? <LoadingPlaceholder /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={processingData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                      <XAxis dataKey="stage" fontSize={10} tick={{ fill: CHART_AXIS }} axisLine={false} tickLine={false} />
                      <YAxis fontSize={11} tick={{ fill: CHART_AXIS }} axisLine={false} tickLine={false} label={{ value: "Days", angle: -90, position: "insideLeft", fontSize: 11, fill: CHART_AXIS }} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Bar dataKey="days" name="Average Days" radius={[4,4,0,0]}>
                        {processingData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Fraud Risk Distribution */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <CardTitle>Fraud Risk Distribution</CardTitle>
              </div>
              <CardDescription>Distribution of claims by AI-assessed fraud risk level</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mx-auto h-[280px] max-w-md">
                {distLoading ? <LoadingPlaceholder /> : fraudDistData.some(d => d.value > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={fraudDistData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {fraudDistData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyPlaceholder />}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
