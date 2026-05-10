/**
 * RecoveryPerformanceTab
 *
 * Displays live recovery KPIs, case status breakdown, approaching-deadline
 * cases, and a PDF export of the recovery performance report.
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import {
  Scale, TrendingUp, DollarSign, Target, Award, AlertOctagon,
  Download, RefreshCw, ExternalLink, Clock, CheckCircle,
  AlertTriangle, Search, Gavel, Archive, ClipboardList, Activity, Send
} from "lucide-react";
import { Link } from "wouter";

// ─── Helpers ────────────────────────────────────────────────────────────────

// fmt is provided by useTenantCurrency hook inside the component

function pct(value: number) {
  return `${value}%`;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className={`p-2 rounded-lg ${accent ?? "bg-teal-50"}`}>
          <Icon className={`h-4 w-4 ${accent ? "text-white" : "text-teal-600"}`} />
        </div>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ─── Status Row ──────────────────────────────────────────────────────────────

function StatusRow({
  icon: Icon,
  label,
  count,
  color,
  href,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  color: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <a className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors group">
        <div className="flex items-center gap-3">
          <Icon className={`h-4 w-4 ${color}`} />
          <span className="text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{count}</span>
          <ExternalLink className="h-3 w-3 text-gray-300 group-hover:text-gray-500" />
        </div>
      </a>
    </Link>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function RecoveryPerformanceTab() {
  const { toast } = useToast();
  const { fmt, currencyCode } = useTenantCurrency();
  const [exporting, setExporting] = useState(false);

  const { data: kpis, isLoading, refetch, isFetching } = trpc.recovery.getKPIs.useQuery(undefined, {
    staleTime: 2 * 60 * 1000,
  });

  const { data: casesData } = trpc.recovery.getCases.useQuery(
    { pageSize: 100 },
    { staleTime: 2 * 60 * 1000 }
  );

  // Find approaching-deadline cases (within 90 days)
  const today = new Date();
  const in90Days = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const approachingCases = (casesData ?? []).filter(
    (c: any) =>
      c.recoveryDeadline &&
      c.recoveryDeadline <= in90Days &&
      !["settled_full", "settled_partial", "closed_no_recovery", "archived"].includes(c.status)
  );

  // Repeat offenders
  const repeatOffenders = (casesData ?? []).filter((c: any) => c.isRepeatOffender);

  const handleExportPDF = async () => {
    if (!kpis) return;
    setExporting(true);
    try {
      // Build a simple printable HTML report and open in new tab
      const reportDate = new Date().toLocaleDateString("en-ZA", {
        day: "2-digit", month: "long", year: "numeric",
      });
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Recovery Performance Report — ${reportDate}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1a1a1a; }
    h1 { font-size: 22px; color: #0F172A; border-bottom: 2px solid #4DB8A8; padding-bottom: 8px; }
    h2 { font-size: 15px; color: #334155; margin-top: 28px; }
    .meta { font-size: 12px; color: #64748b; margin-bottom: 24px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 16px 0; }
    .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
    .kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .kpi-value { font-size: 22px; font-weight: 700; color: #0F172A; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
    th { background: #f1f5f9; padding: 8px 12px; text-align: left; font-size: 11px; color: #475569; text-transform: uppercase; }
    td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; }
    .badge-orange { background: #fff7ed; color: #c2410c; }
    .badge-red { background: #fef2f2; color: #b91c1c; }
    .footer { margin-top: 40px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>KINGA Intelligence — Subrogation Recovery Performance Report</h1>
  <p class="meta">Generated: ${reportDate} &nbsp;|&nbsp; DRAFT — For internal use only</p>

  <h2>Portfolio Summary</h2>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Total Cases</div><div class="kpi-value">${kpis.total}</div></div>
    <div class="kpi"><div class="kpi-label">Total Quantum</div><div class="kpi-value">${fmt(kpis.totalSettlementAmount)}</div></div>
    <div class="kpi"><div class="kpi-label">Total Recovered</div><div class="kpi-value">${fmt(kpis.totalRecovered)}</div></div>
    <div class="kpi"><div class="kpi-label">Recovery Rate</div><div class="kpi-value">${pct(kpis.recoveryRate)}</div></div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Avg RPS Score</div><div class="kpi-value">${kpis.avgRPS}/100</div></div>
    <div class="kpi"><div class="kpi-label">Settled Cases</div><div class="kpi-value">${kpis.settled}</div></div>
    <div class="kpi"><div class="kpi-label">Active Cases</div><div class="kpi-value">${(kpis.open ?? 0) + (kpis.pendingReview ?? 0) + (kpis.demandSent ?? 0)}</div></div>
    <div class="kpi"><div class="kpi-label">Approaching Deadline</div><div class="kpi-value">${kpis.approachingDeadlines}</div></div>
  </div>

  <h2>Case Status Breakdown</h2>
  <table>
    <thead><tr><th>Status</th><th>Count</th><th>% of Total</th></tr></thead>
    <tbody>
      <tr><td>Pending Review</td><td>${kpis.pendingReview}</td><td>${kpis.total > 0 ? Math.round((kpis.pendingReview / kpis.total) * 100) : 0}%</td></tr>
      <tr><td>Under Investigation</td><td>${kpis.underInvestigation}</td><td>${kpis.total > 0 ? Math.round((kpis.underInvestigation / kpis.total) * 100) : 0}%</td></tr>
      <tr><td>Open</td><td>${kpis.open}</td><td>${kpis.total > 0 ? Math.round((kpis.open / kpis.total) * 100) : 0}%</td></tr>
      <tr><td>Demand Sent</td><td>${kpis.demandSent}</td><td>${kpis.total > 0 ? Math.round((kpis.demandSent / kpis.total) * 100) : 0}%</td></tr>
      <tr><td>Disputed / Legal</td><td>${kpis.disputedLegal}</td><td>${kpis.total > 0 ? Math.round((kpis.disputedLegal / kpis.total) * 100) : 0}%</td></tr>
      <tr><td>Settled</td><td>${kpis.settled}</td><td>${kpis.total > 0 ? Math.round((kpis.settled / kpis.total) * 100) : 0}%</td></tr>
      <tr><td>Archived</td><td>${kpis.archived}</td><td>${kpis.total > 0 ? Math.round((kpis.archived / kpis.total) * 100) : 0}%</td></tr>
    </tbody>
  </table>

  ${approachingCases.length > 0 ? `
  <h2>Approaching Recovery Deadline (within 90 days)</h2>
  <table>
    <thead><tr><th>Claim #</th><th>Third Party</th><th>Quantum</th><th>RPS</th><th>Deadline</th><th>Status</th></tr></thead>
    <tbody>
      ${approachingCases.slice(0, 20).map((c: any) => `
      <tr>
        <td>${c.claimNumber ?? "—"}</td>
        <td>${c.thirdPartyName ?? "—"}</td>
        <td>${fmt(c.approvedSettlementAmount ?? 0)}</td>
        <td>${c.recoveryPotentialScore}/100</td>
        <td><span class="badge badge-orange">${c.recoveryDeadline}</span></td>
        <td>${c.status.replace(/_/g, " ")}</td>
      </tr>`).join("")}
    </tbody>
  </table>` : ""}

  ${repeatOffenders.length > 0 ? `
  <h2>Repeat Third-Party Offenders</h2>
  <table>
    <thead><tr><th>Claim #</th><th>Third Party</th><th>Registration</th><th>Prior Cases</th><th>RPS</th></tr></thead>
    <tbody>
      ${repeatOffenders.slice(0, 10).map((c: any) => `
      <tr>
        <td>${c.claimNumber ?? "—"}</td>
        <td>${c.thirdPartyName ?? "—"}</td>
        <td>${c.thirdPartyRegistration ?? "—"}</td>
        <td><span class="badge badge-red">${c.priorCaseCount ?? "?"} prior</span></td>
        <td>${c.recoveryPotentialScore}/100</td>
      </tr>`).join("")}
    </tbody>
  </table>` : ""}

  <div class="footer">
    KINGA Intelligence &nbsp;|&nbsp; Subrogation Recovery Module &nbsp;|&nbsp; DRAFT — Confidential &nbsp;|&nbsp; ${reportDate}
  </div>
</body>
</html>`;
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) {
        win.onload = () => {
          setTimeout(() => win.print(), 500);
        };
      }
      toast({ title: "Report opened", description: "Use your browser's Print > Save as PDF to export." });
    } catch {
      toast({ title: "Export failed", description: "Could not generate the report.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-teal-500 mr-3" />
        <span className="text-gray-500">Loading recovery data…</span>
      </div>
    );
  }

  if (!kpis) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Scale className="h-10 w-10 text-gray-300 mb-3" />
        <p className="text-gray-500 text-sm">No recovery data available.</p>
        <p className="text-gray-400 text-xs mt-1">Recovery cases are created automatically when claims are settled.</p>
      </div>
    );
  }

  const activeCount = (kpis.open ?? 0) + (kpis.pendingReview ?? 0) + (kpis.demandSent ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Recovery Performance</h2>
          <p className="text-xs text-gray-500 mt-0.5">Live subrogation recovery metrics for your insurer portfolio</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleExportPDF}
            disabled={exporting}
            className="text-xs bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export PDF (Draft)
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={DollarSign}
          label="Total Quantum"
          value={fmt(kpis.totalSettlementAmount)}
          sub="Approved settlement amounts"
          accent="bg-slate-700"
        />
        <KpiCard
          icon={TrendingUp}
          label="Total Recovered"
          value={fmt(kpis.totalRecovered)}
          sub={`${pct(kpis.recoveryRate)} recovery rate`}
        />
        <KpiCard
          icon={Target}
          label="Avg RPS Score"
          value={`${kpis.avgRPS}/100`}
          sub="Recovery Potential Score"
        />
        <KpiCard
          icon={Award}
          label="Settled Cases"
          value={String(kpis.settled)}
          sub={`of ${kpis.total} total cases`}
        />
      </div>

      {/* Two-column: status breakdown + approaching deadlines */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Case Status Breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Case Status Breakdown</h3>
          <div className="space-y-1">
            <StatusRow icon={ClipboardList} label="Pending Review" count={kpis.pendingReview ?? 0} color="text-gray-400" href="/insurer-portal/recovery?tab=pending" />
            <StatusRow icon={Search} label="Under Investigation" count={kpis.underInvestigation ?? 0} color="text-blue-400" href="/insurer-portal/recovery?tab=investigation" />
            <StatusRow icon={Activity} label="Open" count={kpis.open ?? 0} color="text-teal-500" href="/insurer-portal/recovery?tab=open" />
            <StatusRow icon={Send} label="Demand Sent" count={kpis.demandSent ?? 0} color="text-amber-500" href="/insurer-portal/recovery?tab=demand-sent" />
            <StatusRow icon={Gavel} label="Disputed / Legal" count={kpis.disputedLegal ?? 0} color="text-red-400" href="/insurer-portal/recovery?tab=legal" />
            <StatusRow icon={CheckCircle} label="Settled" count={kpis.settled ?? 0} color="text-green-500" href="/insurer-portal/recovery?tab=settled" />
            <StatusRow icon={Archive} label="Archived" count={kpis.archived ?? 0} color="text-gray-300" href="/insurer-portal/recovery?tab=archived" />
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">Active cases</span>
            <span className="text-sm font-bold text-teal-600">{activeCount}</span>
          </div>
        </div>

        {/* Approaching Deadlines */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800">Approaching Recovery Deadlines</h3>
            {kpis.approachingDeadlines > 0 && (
              <Badge variant="destructive" className="text-xs">{kpis.approachingDeadlines} within 90 days</Badge>
            )}
          </div>
          {approachingCases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="h-8 w-8 text-green-300 mb-2" />
              <p className="text-sm text-gray-500">No cases approaching deadline</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {approachingCases.slice(0, 10).map((c: any) => {
                const daysLeft = c.recoveryDeadline
                  ? Math.ceil((new Date(c.recoveryDeadline).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                  : null;
                const urgency = daysLeft !== null && daysLeft <= 30 ? "text-red-600 bg-red-50" : "text-amber-600 bg-amber-50";
                return (
                  <Link key={c.id} href={`/insurer-portal/recovery/${c.id}`}>
                    <a className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-teal-200 hover:bg-teal-50/30 transition-colors group">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{c.claimNumber ?? `Case #${c.id}`}</p>
                        <p className="text-xs text-gray-500 truncate">{c.thirdPartyName ?? "Unknown third party"}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${urgency}`}>
                          {daysLeft !== null ? `${daysLeft}d` : c.recoveryDeadline}
                        </span>
                        <ExternalLink className="h-3 w-3 text-gray-300 group-hover:text-teal-500" />
                      </div>
                    </a>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Repeat Offenders */}
      {repeatOffenders.length > 0 && (
        <div className="bg-white border border-red-100 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertOctagon className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-semibold text-gray-800">Repeat Third-Party Offenders</h3>
            <Badge variant="destructive" className="text-xs">{repeatOffenders.length}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Claim #</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Third Party</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Registration</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Prior Cases</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">RPS</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {repeatOffenders.slice(0, 10).map((c: any) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-red-50/30">
                    <td className="py-2 px-3">
                      <Link href={`/insurer-portal/recovery/${c.id}`}>
                        <a className="text-teal-600 hover:underline">{c.claimNumber ?? `#${c.id}`}</a>
                      </Link>
                    </td>
                    <td className="py-2 px-3 text-gray-700">{c.thirdPartyName ?? "—"}</td>
                    <td className="py-2 px-3 text-gray-500">{c.thirdPartyRegistration ?? "—"}</td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                        <AlertTriangle className="h-3 w-3" />
                        {c.priorCaseCount ?? "?"} prior
                      </span>
                    </td>
                    <td className="py-2 px-3 font-semibold text-gray-800">{c.recoveryPotentialScore}/100</td>
                    <td className="py-2 px-3 text-gray-500 capitalize">{c.status.replace(/_/g, " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Draft disclaimer */}
      <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          <strong>Draft report.</strong> This report is for internal management use only. Recovery amounts and rates reflect data as at the time of generation. Exported PDFs are watermarked as DRAFT and should be reviewed by a qualified recovery officer before external use.
        </p>
      </div>
    </div>
  );
}
