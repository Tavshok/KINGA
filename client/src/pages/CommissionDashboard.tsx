/**
 * CommissionDashboard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * H-02: Agency broker commission tracking dashboard.
 * Shows earned, pending, and paid commissions with monthly trend chart.
 * Accessible by: agency, admin roles.
 */

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { useLocation } from "wouter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  if (cents >= 100_000_00) return `$${(cents / 100_000_00).toFixed(1)}M`;
  if (cents >= 1_000_00) return `$${(cents / 1_000_00).toFixed(1)}K`;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

const STATUS_COLORS: Record<string, string> = {
  paid: "#22C55E",
  pending: "#F59E0B",
  disputed: "#EF4444",
};

const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  disputed: "Disputed",
  all: "All",
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
              {label}
            </p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-opacity-10 ${color.replace("text-", "bg-")}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Commission Row ───────────────────────────────────────────────────────────

function CommissionRow({ record }: { record: any }) {
  const statusColor =
    record.paymentStatus === "paid"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
      : record.paymentStatus === "disputed"
      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
      : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";

  return (
    <tr className="border-b border-border hover:bg-muted/30 transition-colors">
      <td className="py-3 px-4 text-sm">
        <span className="font-mono text-xs text-muted-foreground">#{record.id}</span>
      </td>
      <td className="py-3 px-4 text-sm capitalize">{record.commissionType?.replace("_", " ") ?? "—"}</td>
      <td className="py-3 px-4 text-sm font-medium">
        ${(Number(record.commissionAmount) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground">
        {record.commissionPeriod ?? "—"}
      </td>
      <td className="py-3 px-4">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
          {STATUS_LABELS[record.paymentStatus] ?? record.paymentStatus}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground">
        {record.paymentDate
          ? new Date(record.paymentDate).toLocaleDateString()
          : "—"}
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CommissionDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [periodDays, setPeriodDays] = useState(90);
  const [statusFilter, setStatusFilter] = useState<"pending" | "paid" | "disputed" | "all">("all");
  const [page, setPage] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [commissionRate, setCommissionRate] = useState<string>("");
  const PAGE_SIZE = 15;

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } =
    trpc.agencyBroker.getCommissionSummary.useQuery({ days: periodDays });

  const { data: trends, isLoading: trendsLoading } =
    trpc.agencyBroker.getCommissionTrends.useQuery();

  const { data: commissionsData, isLoading: listLoading } =
    trpc.agencyBroker.listCommissions.useQuery({
      status: statusFilter,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });

  const { data: commissionProducts = [] } = trpc.agencyBroker.listCommissionProducts.useQuery();
  const { data: commissionConfigurations = [], refetch: refetchCommissionConfigurations } =
    trpc.agencyBroker.listCommissionConfigurations.useQuery();
  const saveCommissionConfiguration = trpc.agencyBroker.upsertCommissionConfiguration.useMutation({
    onSuccess: () => {
      setCommissionRate("");
      refetchCommissionConfigurations();
    },
  });

  const commissions = commissionsData?.commissions ?? [];
  const totalCommissions = commissionsData?.total ?? 0;

  // KPI values
  const estimatedCents = summary?.quoteCommissions.totalEstimatedCents ?? 0;
  const paidCents = summary?.formalCommissions.totalPaidCents ?? 0;
  const pendingCents = summary?.formalCommissions.totalPendingCents ?? 0;
  const disputedCents = summary?.formalCommissions.totalDisputedCents ?? 0;
  const acceptedCount = summary?.quoteCommissions.acceptedQuoteCount ?? 0;

  const trendData = (trends ?? []).map((r: any) => ({
    month: formatMonth(r.month),
    amount: r.totalEstimatedCents / 100,
    count: r.count,
  }));

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/agency")}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Agency
              </Button>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-600" />
                <h1 className="text-lg font-semibold">Commission Dashboard</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Select
                value={String(periodDays)}
                onValueChange={(v) => { setPeriodDays(Number(v)); setPage(0); }}
              >
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchSummary()}
                className="h-8 text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Agency Product Commission Configuration</CardTitle>
            <p className="text-xs text-muted-foreground">
              Agency-commercial metadata only. It does not affect RFQ acceptance, policy issuance, premiums, underwriting, claims, settlement, or insurer workflows.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <label className="flex-1 text-xs font-medium text-muted-foreground">
                Insurance product
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select a product" /></SelectTrigger>
                  <SelectContent>
                    {commissionProducts.map((product: any) => (
                      <SelectItem key={product.id} value={String(product.id)}>
                        {product.productName} ({product.productCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="w-full text-xs font-medium text-muted-foreground md:w-40">
                Commission rate (%)
                <input
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  type="number"
                  value={commissionRate}
                  onChange={(event) => setCommissionRate(event.target.value)}
                  placeholder="e.g. 12.5"
                />
              </label>
              <Button
                className="h-9"
                disabled={!selectedProductId || commissionRate === "" || saveCommissionConfiguration.isPending}
                onClick={() => saveCommissionConfiguration.mutate({
                  productId: Number(selectedProductId),
                  commissionRate: Number(commissionRate),
                })}
              >
                {saveCommissionConfiguration.isPending ? "Saving…" : "Save configuration"}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2">Product</th><th className="py-2 text-right">Rate</th><th className="py-2 text-right">Status</th></tr></thead>
                <tbody>
                  {commissionConfigurations.length === 0 ? (
                    <tr><td className="py-3 text-xs text-muted-foreground" colSpan={3}>No configuration entered. Commission is unavailable until this agency configures the product.</td></tr>
                  ) : commissionConfigurations.map((config: any) => (
                    <tr key={config.id} className="border-b border-border/60"><td className="py-2">{config.productName ?? `Product #${config.productId}`}</td><td className="py-2 text-right font-mono">{Number(config.commissionRate).toFixed(2)}%</td><td className="py-2 text-right"><Badge variant="outline">{config.isActive ? "Configured" : "Unavailable"}</Badge></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ── KPI Strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            label="RFQ-linked commission"
            value={summaryLoading ? "…" : formatCents(estimatedCents)}
            sub="Not calculated from RFQ acceptance"
            icon={TrendingUp}
            color="text-emerald-600"
          />
          <KPICard
            label="Formally Paid"
            value={summaryLoading ? "…" : formatCents(paidCents)}
            sub={`${summary?.formalCommissions.paidCount ?? 0} record${(summary?.formalCommissions.paidCount ?? 0) !== 1 ? "s" : ""}`}
            icon={CheckCircle2}
            color="text-blue-600"
          />
          <KPICard
            label="Pending Payment"
            value={summaryLoading ? "…" : formatCents(pendingCents)}
            sub={`${summary?.formalCommissions.pendingCount ?? 0} awaiting`}
            icon={Clock}
            color="text-amber-600"
          />
          <KPICard
            label="Disputed"
            value={summaryLoading ? "…" : formatCents(disputedCents)}
            sub={disputedCents > 0 ? "Requires attention" : "None outstanding"}
            icon={AlertTriangle}
            color={disputedCents > 0 ? "text-red-600" : "text-muted-foreground"}
          />
        </div>

        {/* ── Trend Chart + Filter Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Monthly Trend */}
          <Card className="lg:col-span-2 border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Monthly Commercial Ledger Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trendsLoading ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  Loading chart…
                </div>
              ) : trendData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  No commission data yet for the last 6 months.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}`}
                    />
                    <Tooltip
                      formatter={(v: number) => [`$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "Recorded"]}
                      contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {trendData.map((_: any, i: number) => (
                        <Cell key={i} fill="#22C55E" opacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Status Breakdown */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Paid", cents: paidCents, color: "bg-emerald-500", count: summary?.formalCommissions.paidCount ?? 0 },
                { label: "Pending", cents: pendingCents, color: "bg-amber-500", count: summary?.formalCommissions.pendingCount ?? 0 },
                { label: "Disputed", cents: disputedCents, color: "bg-red-500", count: 0 },
              ].map((item) => {
                const total = paidCents + pendingCents + disputedCents;
                const pct = total > 0 ? Math.round((item.cents / total) * 100) : 0;
                return (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium">{formatCents(item.cents)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.color}`}
                        style={{ width: `${pct}%`, transition: "width 0.4s ease" }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{pct}%</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* ── Commission Records Table ── */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Commission Records
                {totalCommissions > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs font-normal">
                    {totalCommissions}
                  </Badge>
                )}
              </CardTitle>
              <Select
                value={statusFilter}
                onValueChange={(v: any) => { setStatusFilter(v); setPage(0); }}
              >
                <SelectTrigger className="w-32 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="disputed">Disputed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {listLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading records…</div>
            ) : commissions.length === 0 ? (
              <div className="py-12 text-center">
                <DollarSign className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-sm text-muted-foreground">
                  {statusFilter === "all"
                    ? "No formal commission records yet. RFQ acceptance does not create commission."
                    : `No ${statusFilter} commission records found.`}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">ID</th>
                        <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Type</th>
                        <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Amount</th>
                        <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Period</th>
                        <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Status</th>
                        <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Payment Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map((record: any) => (
                        <CommissionRow key={record.id} record={record} />
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {totalCommissions > PAGE_SIZE && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCommissions)} of {totalCommissions}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 0}
                        onClick={() => setPage(p => p - 1)}
                        className="h-7 text-xs"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={(page + 1) * PAGE_SIZE >= totalCommissions}
                        onClick={() => setPage(p => p + 1)}
                        className="h-7 text-xs"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
