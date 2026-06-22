import { useState, useMemo } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, ScatterController } from 'chart.js';
import { Bar, Scatter, Doughnut, Line } from 'react-chartjs-2';
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, ScatterController);
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { SLADeadlineChip } from "@/components/portal/SLADeadlineChip";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  FileText, Clock, CheckCircle, DollarSign, FileEdit, Star,
  TrendingUp, AlertTriangle, BarChart3, Wrench, Award, RefreshCw,
  ChevronRight, Eye, Phone, MapPin, Calendar, Hammer
} from "lucide-react";
import { useLocation } from "wouter";
import KingaLogo from "@/components/KingaLogo";
import { NotificationBell } from "@/components/NotificationBell";
import RoleSwitcher from "@/components/RoleSwitcher";
import { KingaReportButton } from "@/components/KingaReportButton";
import { NotificationsInbox, NotificationsTabBadge } from "@/components/NotificationsInbox";
import { PortalHeader, PortalKPIStrip, type PortalKPI } from "@/components/KingaPortalShell";

function PerformanceTierBadge({ tier }: { tier: string | null | undefined }) {
  const config: Record<string, { label: string; className: string }> = {
    A: { label: "Tier A — Excellent", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    B: { label: "Tier B — Good", className: "bg-blue-100 text-blue-800 border-blue-200" },
    C: { label: "Tier C — Average", className: "border", style: { background: "#FFF8E6", color: "#8A5C00", borderColor: "#E8C97A" } },
    D: { label: "Tier D — Needs Improvement", className: "bg-red-100 text-red-800 border-red-200" },
  };
  const t = tier || "B";
  const c = config[t] || config["B"];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.className}`}>
      <Award className="h-3 w-3" />
      {c.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    submitted: "bg-blue-100 text-blue-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
    pending: "border" /* amber */,
    comparison: "bg-purple-100 text-purple-800",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] || "bg-gray-100 text-gray-800"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function PanelBeaterDashboard() {
  const { user, logout } = useAuth();
  const { fmt } = useTenantCurrency();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("queue");
  const [perfPeriod, setPerfPeriod] = useState<'weekly' | 'monthly'>('monthly');
  const [selectedInsurerId, setSelectedInsurerId] = useState<string | null>(null);

  // Real data from server
  const { data: profile } = trpc.claims.myPanelBeaterProfile.useQuery();
  const { data: myAnalytics } = trpc.claims.getMyAnalytics.useQuery();
  const { data: quoteRequests = [], isLoading: requestsLoading, refetch: refetchRequests } =
    trpc.claims.myQuoteRequests.useQuery();
  const { data: quoteHistory = [], isLoading: historyLoading } =
    trpc.claims.myQuoteHistory.useQuery();

  // Performance trend query
  const { data: perfTrend } = trpc.claims.getMyPerformanceTrend.useQuery({
    period: perfPeriod,
    tenantId: selectedInsurerId,
  });
  // Derived stats
  const pendingRequests = quoteRequests.filter((c: any) =>
    !["completed", "rejected", "cancelled"].includes(c.status)
  );
  const submittedQuotes = quoteHistory.filter((q: any) => q.status === "submitted").length;
  const approvedQuotes = quoteHistory.filter((q: any) => q.status === "approved").length;
  const totalRevenue = quoteHistory
    .filter((q: any) => q.status === "approved")
    .reduce((sum: number, q: any) => sum + (q.quotedAmount || 0), 0);

  const avgCostRatio = profile?.avgCostRatio ? parseFloat(String(profile.avgCostRatio)) : null;
  const avgQualityScore = profile?.avgQualityScore ? parseFloat(String(profile.avgQualityScore)) : null;

  return (
    <div className="min-h-screen" style={{ background: "#F9FAFB" }}>
      {/* Header (C1) */}
      <PortalHeader
        icon={<Hammer className="h-5 w-5 text-white" />}
        title="Panel Beater Portal"
        description={profile?.businessName ?? 'Repair partner workspace'}
        live
        actions={
          <div className="flex items-center gap-2">
            <KingaReportButton
              reportKey="portfolio.panel_beater_performance"
              label="Export Performance Report"
              variant="outline"
              size="sm"
            />
            <RoleSwitcher />
            <NotificationBell />
            <Button variant="outline" size="sm" onClick={() => logout()}>
              Sign Out
            </Button>
          </div>
        }
      />

      <main className="container mx-auto px-4 py-6 space-y-6">


        {/* ── KPI STRIP (C2) ── */}
        <PortalKPIStrip kpis={[
          {
            label: 'Quote Requests',
            value: pendingRequests.length,
            icon: <FileText className="h-4 w-4" />,
            accent: pendingRequests.length > 0 ? 'amber' : 'charcoal',
          },
          {
            label: 'Acceptance Rate',
            value: myAnalytics?.stats?.acceptanceRate != null ? `${myAnalytics.stats.acceptanceRate}%` : '—',
            icon: <CheckCircle className="h-4 w-4" />,
            accent: (myAnalytics?.stats?.acceptanceRate ?? 0) >= 70 ? 'green' : (myAnalytics?.stats?.acceptanceRate ?? 0) >= 50 ? 'amber' : 'red',
          },
          {
            label: 'Avg Variance',
            value: myAnalytics?.stats?.avgVariancePct != null ? `${myAnalytics.stats.avgVariancePct > 0 ? '+' : ''}${myAnalytics.stats.avgVariancePct}%` : '—',
            icon: <TrendingUp className="h-4 w-4" />,
            accent: Math.abs(myAnalytics?.stats?.avgVariancePct ?? 0) > 15 ? 'red' : Math.abs(myAnalytics?.stats?.avgVariancePct ?? 0) > 5 ? 'amber' : 'green',
          },
          {
            label: 'Approved Revenue',
            value: fmt(totalRevenue),
            icon: <DollarSign className="h-4 w-4" />,
            accent: 'teal',
          },
        ] as PortalKPI[]} />

        {/* ── SIGNATURE CHARTS (always visible) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                Quote Competitiveness
              </CardTitle>
              <CardDescription className="text-xs">Your quote (Y) vs KINGA estimate (X). Dots above the line = over-quoted. Green = accepted.</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div style={{ height: 240 }}>
                {myAnalytics?.quotes && myAnalytics.quotes.filter((q: any) => q.estimatedClaimValue && q.quotedAmount).length > 0 ? (
                  <Scatter
                    data={{
                      datasets: [
                        {
                          label: 'Your Quotes',
                          data: myAnalytics.quotes.filter((q: any) => q.estimatedClaimValue && q.quotedAmount).map((q: any) => ({ x: q.estimatedClaimValue, y: q.quotedAmount })),
                          backgroundColor: myAnalytics.quotes.filter((q: any) => q.estimatedClaimValue && q.quotedAmount).map((q: any) => q.status === 'accepted' ? 'rgba(34,197,94,0.7)' : 'rgba(59,130,246,0.6)'),
                          pointRadius: 5,
                        },
                        {
                          label: 'Perfect Match',
                          data: (() => { const vals = myAnalytics.quotes.map((q: any) => q.estimatedClaimValue).filter(Boolean); if (!vals.length) return []; const min = Math.min(...vals); const max = Math.max(...vals); return [{ x: min, y: min }, { x: max, y: max }]; })(),
                          type: 'line' as any, borderColor: '#22c55e', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0,
                        },
                      ],
                    }}
                    options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } } }, scales: { x: { title: { display: true, text: 'KINGA Estimate', font: { size: 10 } } }, y: { title: { display: true, text: 'Your Quote', font: { size: 10 } } } } }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No quote data with KINGA estimates yet</div>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Quote Outcomes
              </CardTitle>
              <CardDescription className="text-xs">Approved vs pending vs rejected across your quotes</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div style={{ height: 240 }}>
                {quoteHistory.length > 0 ? (() => { const approved = quoteHistory.filter((q: any) => q.status === 'approved').length; const pending = quoteHistory.filter((q: any) => ['submitted','pending','comparison'].includes(q.status)).length; const rejected = quoteHistory.filter((q: any) => q.status === 'rejected').length; return (<Bar data={{ labels: ['Approved', 'Pending Review', 'Rejected'], datasets: [{ label: 'Quotes', data: [approved, pending, rejected], backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'], borderRadius: 6 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }} />); })() : (<div className="flex items-center justify-center h-full text-muted-foreground text-sm">No quote history yet</div>)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Metrics */}
        {profile && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  Quality Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-3xl font-bold text-gray-900">
                    {avgQualityScore !== null ? avgQualityScore.toFixed(1) : "—"}
                  </span>
                  <span className="text-sm text-gray-500 mb-1">/ 100</span>
                </div>
                {avgQualityScore !== null && (
                  <Progress value={avgQualityScore} className="h-2" />
                )}
                <p className="text-xs text-gray-500 mt-2">Based on {profile.totalRepairs} completed repairs</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  Cost Accuracy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-3xl font-bold text-gray-900">
                    {avgCostRatio !== null ? `${(avgCostRatio * 100).toFixed(0)}%` : "—"}
                  </span>
                </div>
                {avgCostRatio !== null && (
                  <Progress value={Math.min(avgCostRatio * 100, 100)} className="h-2" />
                )}
                <p className="text-xs text-gray-500 mt-2">Quote vs KINGA benchmark ratio</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Fraud Flags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-3xl font-bold text-gray-900">
                    {profile.fraudFlagCount || 0}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {(profile.fraudFlagCount || 0) === 0
                    ? "Clean record — no flags raised"
                    : "Flags raised on your quotes"}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:inline-flex">
            <TabsTrigger value="queue" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Quote Queue
              {pendingRequests.length > 0 && (
                <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs text-white" style={{ background: "#A32D2D" }}>
                  {pendingRequests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Quote History
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="notifications"><NotificationsTabBadge /></TabsTrigger>
          </TabsList>

          {/* Quote Queue Tab */}
          <TabsContent value="queue" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Active Quote Requests</CardTitle>
                  <CardDescription>
                    Claims where you were selected — submit your quote to proceed
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchRequests()}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {requestsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : pendingRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <Wrench className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No active quote requests</p>
                    <p className="text-sm text-gray-400 mt-1">
                      When claimants select you, their claims will appear here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingRequests.map((claim: any) => (
                      <div
                        key={claim.id}
                        className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all"
                      >
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-gray-900">
                              {claim.claimNumber}
                            </span>
                            <StatusBadge status={claim.status} />
                            <SLADeadlineChip createdAt={claim.createdAt} slaHours={48} />
                            {claim.policyVerified && (
                              <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Policy Verified
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-700">
                            {[claim.vehicleMake, claim.vehicleModel, claim.vehicleYear]
                              .filter(Boolean).join(" ")}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            {claim.incidentLocation && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {claim.incidentLocation}
                              </span>
                            )}
                            {claim.incidentDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(claim.incidentDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(`/panel-beater/claims/${claim.id}/quote`)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setLocation(`/panel-beater/claims/${claim.id}/quote`)}
                          >
                            <FileEdit className="h-4 w-4 mr-1" />
                            Submit Quote
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Quote History Tab */}
          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Quote History</CardTitle>
                <CardDescription>
                  All quotes you have submitted — with status and outcome
                </CardDescription>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : quoteHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No quotes submitted yet</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Your submitted quotes and their outcomes will appear here
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-2 font-medium text-gray-600">Claim #</th>
                          <th className="text-right py-3 px-2 font-medium text-gray-600">Your Quote</th>
                          <th className="text-right py-3 px-2 font-medium text-gray-600">Labour</th>
                          <th className="text-right py-3 px-2 font-medium text-gray-600">Parts</th>
                          <th className="text-center py-3 px-2 font-medium text-gray-600">Status</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-600">SLA at Submit</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-600">Submitted</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {quoteHistory.map((quote: any) => (
                          <tr key={quote.id} className="hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-2">
                              <span className="font-mono text-xs text-gray-700">
                                #{quote.claimId}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right font-semibold text-gray-900">
                              {fmt(quote.quotedAmount || 0)}
                            </td>
                            <td className="py-3 px-2 text-right text-gray-600">
                              {quote.laborCost ? fmt(quote.laborCost) : "—"}
                            </td>
                            <td className="py-3 px-2 text-right text-gray-600">
                              {quote.partsCost ? fmt(quote.partsCost) : "—"}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <StatusBadge status={quote.status || "submitted"} />
                            </td>
                            <td className="py-3 px-2">
                              {/* D-07: SLA chip on History tab rows shows the SLA status
                                  at the time the quote was submitted (based on claim createdAt).
                                  Uses slaHours=48 consistent with the Pending Requests tab. */}
                              <SLADeadlineChip createdAt={quote.createdAt} slaHours={48} showOk />
                            </td>
                            <td className="py-3 px-2 text-gray-500 text-xs">
                              {quote.createdAt
                                ? new Date(quote.createdAt).toLocaleDateString()
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          {/* Analytics Tab */}
          <TabsContent value="analytics" className="mt-4">
            <div className="space-y-6">
              {/* Period + Insurer Selectors */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <button
                    onClick={() => setPerfPeriod('monthly')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${perfPeriod === 'monthly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >Monthly</button>
                  <button
                    onClick={() => setPerfPeriod('weekly')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${perfPeriod === 'weekly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >Weekly</button>
                </div>
                {/* Insurer filter pills */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedInsurerId(null)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${selectedInsurerId === null ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground'}`}
                  >All Insurers</button>
                  {perfTrend?.insurers?.map((ins: any) => (
                    <button
                      key={ins.tenantId}
                      onClick={() => setSelectedInsurerId(ins.tenantId)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${selectedInsurerId === ins.tenantId ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground'}`}
                    >{ins.displayName}</button>
                  ))}
                </div>
              </div>

              {/* Summary KPI bar for selected filter */}
              {perfTrend?.summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Quotes', value: perfTrend.summary.totalQuotes, icon: '📋', color: 'text-foreground' },
                    { label: 'Accepted', value: perfTrend.summary.acceptedQuotes, icon: '✅', color: 'text-emerald-600' },
                    { label: 'Acceptance Rate', value: perfTrend.summary.overallAcceptanceRate != null ? `${perfTrend.summary.overallAcceptanceRate}%` : '—', icon: '📈', color: perfTrend.summary.overallAcceptanceRate != null && perfTrend.summary.overallAcceptanceRate >= 70 ? 'text-emerald-600' : 'text-amber-600' },
                    { label: 'Avg Congruency', value: perfTrend.summary.overallCongruencyScore != null ? `${perfTrend.summary.overallCongruencyScore}%` : '—', icon: '🎯', color: 'text-blue-600' },
                  ].map((kpi, i) => (
                    <div key={i} className="p-3 rounded-lg border border-border bg-card">
                      <p className="text-xs text-muted-foreground">{kpi.label}</p>
                      <p className={`text-xl font-bold mt-0.5 ${kpi.color}`}>{kpi.value ?? '—'}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Per-Insurer Breakdown Table */}
              {perfTrend?.byInsurer && perfTrend.byInsurer.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-blue-500" /> Performance by Insurer
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Your acceptance rate and congruency score for each insurer you work with</p>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-3 font-medium text-muted-foreground">Insurer</th>
                            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Quotes</th>
                            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Accepted</th>
                            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Acceptance Rate</th>
                            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Avg Congruency</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {perfTrend.byInsurer.map((ins: any) => (
                            <tr
                              key={ins.tenantId}
                              className={`hover:bg-muted/30 cursor-pointer transition-colors ${selectedInsurerId === ins.tenantId ? 'bg-primary/5' : ''}`}
                              onClick={() => setSelectedInsurerId(selectedInsurerId === ins.tenantId ? null : ins.tenantId)}
                            >
                              <td className="py-2.5 px-3 font-medium text-foreground">{ins.displayName}</td>
                              <td className="py-2.5 px-3 text-right text-muted-foreground">{ins.totalQuotes}</td>
                              <td className="py-2.5 px-3 text-right text-emerald-600">{ins.acceptedQuotes}</td>
                              <td className="py-2.5 px-3 text-right">
                                {ins.acceptanceRate != null ? (
                                  <span className={`font-semibold ${ins.acceptanceRate >= 70 ? 'text-emerald-600' : ins.acceptanceRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                    {ins.acceptanceRate}%
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {ins.avgCongruencyScore != null ? (
                                  <span className={`font-semibold ${ins.avgCongruencyScore >= 70 ? 'text-emerald-600' : ins.avgCongruencyScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                    {ins.avgCongruencyScore}%
                                  </span>
                                ) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Click a row to filter the trend charts below to that insurer</p>
                  </CardContent>
                </Card>
              )}

              {/* Trend Charts */}
              {perfTrend?.trend && perfTrend.trend.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Acceptance Rate Trend */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Acceptance Rate Trend</CardTitle>
                      <p className="text-xs text-muted-foreground">{selectedInsurerId ? perfTrend.insurers?.find((i: any) => i.tenantId === selectedInsurerId)?.displayName : 'All Insurers'} · {perfPeriod === 'monthly' ? 'Monthly' : 'Weekly'}</p>
                    </CardHeader>
                    <CardContent>
                      <div style={{ height: 200 }}>
                        <Line
                          data={{
                            labels: perfTrend.trend.map((b: any) => b.label),
                            datasets: [{
                              label: 'Acceptance Rate %',
                              data: perfTrend.trend.map((b: any) => b.acceptanceRate),
                              borderColor: '#22c55e',
                              backgroundColor: 'rgba(34,197,94,0.1)',
                              fill: true,
                              tension: 0.4,
                              pointRadius: 4,
                            }]
                          }}
                          options={{
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                              y: { min: 0, max: 100, ticks: { callback: (v: any) => `${v}%`, font: { size: 10 } }, grid: { color: 'rgba(128,128,128,0.1)' } },
                              x: { ticks: { font: { size: 10 } }, grid: { display: false } }
                            }
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                  {/* Quote Volume Trend */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Quote Volume</CardTitle>
                      <p className="text-xs text-muted-foreground">Total submitted per {perfPeriod === 'monthly' ? 'month' : 'week'}</p>
                    </CardHeader>
                    <CardContent>
                      <div style={{ height: 200 }}>
                        <Bar
                          data={{
                            labels: perfTrend.trend.map((b: any) => b.label),
                            datasets: [
                              {
                                label: 'Accepted',
                                data: perfTrend.trend.map((b: any) => b.acceptedQuotes),
                                backgroundColor: 'rgba(34,197,94,0.8)',
                                borderRadius: 4,
                              },
                              {
                                label: 'Total',
                                data: perfTrend.trend.map((b: any) => b.totalQuotes - b.acceptedQuotes),
                                backgroundColor: 'rgba(148,163,184,0.5)',
                                borderRadius: 4,
                              }
                            ]
                          }}
                          options={{
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } } },
                            scales: {
                              x: { stacked: true, ticks: { font: { size: 10 } }, grid: { display: false } },
                              y: { stacked: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: 'rgba(128,128,128,0.1)' } }
                            }
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                  {/* Congruency Score Trend */}
                  <Card className="md:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Quote Congruency Score Trend</CardTitle>
                      <p className="text-xs text-muted-foreground">How closely your quotes align with the KINGA cost estimate — higher is better</p>
                    </CardHeader>
                    <CardContent>
                      <div style={{ height: 180 }}>
                        <Bar
                          data={{
                            labels: perfTrend.trend.map((b: any) => b.label),
                            datasets: [{
                              label: 'Avg Congruency %',
                              data: perfTrend.trend.map((b: any) => b.avgCongruencyScore),
                              backgroundColor: perfTrend.trend.map((b: any) =>
                                b.avgCongruencyScore == null ? 'rgba(148,163,184,0.3)' :
                                b.avgCongruencyScore >= 70 ? 'rgba(34,197,94,0.75)' :
                                b.avgCongruencyScore >= 50 ? 'rgba(245,158,11,0.75)' :
                                'rgba(239,68,68,0.75)'
                              ),
                              borderRadius: 4,
                            }]
                          }}
                          options={{
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                              y: { min: 0, max: 100, ticks: { callback: (v: any) => `${v}%`, font: { size: 10 } }, grid: { color: 'rgba(128,128,128,0.1)' } },
                              x: { ticks: { font: { size: 10 } }, grid: { display: false } }
                            }
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No performance data yet</p>
                  <p className="text-sm mt-1">Submit quotes to start building your performance history</p>
                </div>
              )}
            </div>
          </TabsContent>
        
          {/* ── Notifications Tab ─────────────────────────────────────── */}
          <TabsContent value="notifications" className="mt-6">
            <NotificationsInbox />
          </TabsContent>
</Tabs>

        {/* Workshop Details */}
        {profile && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Workshop Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-4 text-sm">
                {profile.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-gray-700">Address</p>
                      <p className="text-gray-500">{profile.address}</p>
                    </div>
                  </div>
                )}
                {profile.phone && (
                  <div className="flex items-start gap-2">
                    <Phone className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-gray-700">Phone</p>
                      <p className="text-gray-500">{profile.phone}</p>
                    </div>
                  </div>
                )}
                {profile.avgRepairDurationDays && (
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-gray-700">Avg Repair Time</p>
                      <p className="text-gray-500">
                        {parseFloat(String(profile.avgRepairDurationDays)).toFixed(1)} days
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
