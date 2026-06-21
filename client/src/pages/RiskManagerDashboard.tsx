import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Shield, CheckCircle, XCircle, AlertCircle, Eye,
  DollarSign, TrendingUp, Clock, BarChart3,
  MessageSquare, RefreshCw, Filter, Search,
  ArrowUpRight, ArrowDownRight, Minus, Calendar, Activity,
} from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { RiskBadge, AiAssessButton } from "@/components/ClaimRiskIndicators";
import { KingaReportButton } from "@/components/KingaReportButton";
import { Link, useSearch } from "wouter";
import { currencySymbol } from "@/lib/currency";
import { NotificationsInbox, NotificationsTabBadge } from "@/components/NotificationsInbox";
import {
  Chart as ChartJS, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import ReportsBadgeWidget from "@/components/ReportsBadgeWidget";
ChartJS.register(Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusLabel = (s: string) =>
  (s || "pending").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const fmtCost = (claim: any) => {
  const sym = currencySymbol(claim.currencyCode);
  const cost = claim.approvedAmount ?? claim.estimatedCost;
  if (!cost) return "—";
  return `${sym} ${Number(cost).toLocaleString()}`;
};

const HIGH_VALUE_THRESHOLD = 50000;

function RiskTrend({ score }: { score: number }) {
  if (score >= 70) return <ArrowUpRight className="h-4 w-4 text-red-500 inline" />;
  if (score >= 40) return <Minus className="h-4 w-4 text-amber-500 inline" />;
  return <ArrowDownRight className="h-4 w-4 text-green-500 inline" />;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

const RISK_ACCENT: Record<string, string> = {
  "text-red-600": "#A32D2D",
  "text-amber-600": "#8A5C00",
  "text-orange-600": "#8A5C00",
  "text-green-600": "#3C7844",
  "text-foreground": "",
};
function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent?: string;
}) {
  const color = accent ? (RISK_ACCENT[accent] ?? "") : "";
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold mt-1" style={color ? { color } : {}}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg" style={{ background: "#F0F7F2" }}>
            <Icon className="h-5 w-5" style={{ color: "#3C7844" }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RiskManagerDashboard() {
  const searchStr = useSearch();
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(searchStr).get("tab") ?? "approval");
  useEffect(() => {
    const tab = new URLSearchParams(searchStr).get("tab") ?? "approval";
    setActiveTab(tab);
  }, [searchStr]);
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [dialogMode, setDialogMode] = useState<"approve" | "reject" | "request_info">("approve");
  const [showDialog, setShowDialog] = useState(false);
  const [notes, setNotes] = useState("");
  const [infoRequest, setInfoRequest] = useState("");
  const [search, setSearch] = useState("");

  // ── Analytics date range ─────────────────────────────────────────────────────────────────────────────
  const [analyticsFrom, setAnalyticsFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [analyticsTo, setAnalyticsTo] = useState<string>(() => new Date().toISOString().split('T')[0]);
  // ── Data ─────────────────────────────────────────────────────────────────────────────
  const { data: approvalQueue = [], isLoading: queueLoading, refetch: refetchQueue } =
    trpc.claims.byStatus.useQuery({ status: "technical_approval" });

  // ── Real backend procedures ─────────────────────────────────────────────────────────────────────────────
  const { data: financialQueue = [], isLoading: finLoading, refetch: refetchFinancial } =
    trpc.claims.getFinancialDecisionQueue.useQuery({ from: analyticsFrom, to: analyticsTo });

  const { data: escalationsData = [], isLoading: escalationsLoading } =
    trpc.claims.getEscalations.useQuery({ from: analyticsFrom, to: analyticsTo });

  // Replace allForTenant with getActiveClaims for Portfolio Oversight (filtered, not all claims)
  const { data: allClaims = [], isLoading: allLoading } =
    trpc.claims.getActiveClaims.useQuery({ from: analyticsFrom, to: analyticsTo });

  // Risk Portfolio Analytics: fraud heatmap, risk distribution
  const { data: riskAnalytics, isLoading: riskAnalyticsLoading } =
    trpc.claims.getRiskPortfolioAnalytics.useQuery({ from: analyticsFrom, to: analyticsTo });

  const approveTechnical = trpc.claims.approveClaim.useMutation({
    onSuccess: () => {
      toast.success("Technical Approval Complete", { description: "Claim moved to financial decision queue." });
      setShowDialog(false); setSelectedClaim(null); setNotes(""); refetchQueue();
    },
    onError: (e: any) => toast.error("Error", { description: e.message }),
  });

  // Wire Authorise Payment to financialApproval mutation
  const authorisePayment = trpc.claims.financialApproval.useMutation({
    onSuccess: () => {
      toast.success("Payment Authorised", { description: "Claim approved for payment settlement." });
      refetchFinancial();
    },
    onError: (e: any) => toast.error("Authorisation Failed", { description: e.message }),
  });

  // ── Derived stats ─────────────────────────────────────────────────────────
  const highValueClaims = useMemo(
    () => allClaims.filter((c: any) => Number(c.approvedAmount ?? c.estimatedCost ?? 0) >= HIGH_VALUE_THRESHOLD),
    [allClaims]
  );

  // escalatedClaims: prefer real getEscalations result; fall back to client-side filter if empty
  const escalatedClaims = useMemo(
    () => escalationsData.length > 0
      ? escalationsData
      : allClaims.filter((c: any) => (c.fraudRiskScore ?? 0) >= 70 || c.fraudRiskLevel === "high" || c.workflowState === "disputed" || c.workflowState === "manual_review"),
    [escalationsData, allClaims]
  );

  const avgRisk = useMemo(() => {
    if (!allClaims.length) return 0;
    const total = allClaims.reduce((s: number, c: any) => s + (c.fraudRiskScore ?? 0), 0);
    return Math.round(total / allClaims.length);
  }, [allClaims]);

  const filteredAll = useMemo(() => {
    if (!search) return allClaims;
    const q = search.toLowerCase();
    return allClaims.filter((c: any) =>
      (c.claimNumber ?? "").toLowerCase().includes(q) ||
      (c.vehicleRegistration ?? "").toLowerCase().includes(q) ||
      (c.vehicleMake ?? "").toLowerCase().includes(q)
    );
  }, [allClaims, search]);

  // ── Dialog helpers ────────────────────────────────────────────────────────
  const openDialog = (claim: any, mode: typeof dialogMode) => {
    setSelectedClaim(claim); setDialogMode(mode); setNotes(""); setInfoRequest(""); setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!selectedClaim) return;
    if (dialogMode === "approve") {
      approveTechnical.mutate({ claimId: selectedClaim.id, selectedQuoteId: 0 });
    } else if (dialogMode === "reject") {
      toast.info("Rejection workflow will move claim to disputed status.");
      setShowDialog(false);
    } else {
      toast.success("Information request sent to claims processor.");
      setShowDialog(false);
    }
  };

  // ── Claim Row ─────────────────────────────────────────────────────────────
  const ClaimRow = ({ claim, actions }: { claim: any; actions: React.ReactNode }) => (
    <div className="p-4 rounded-lg border border-border hover:border-foreground/20 transition-colors bg-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-semibold text-foreground">{claim.claimNumber}</span>
            <Badge variant="outline" className="text-xs">{statusLabel(claim.workflowState ?? claim.status ?? "pending")}</Badge>
            <RiskBadge fraudRiskScore={claim.fraudRiskScore} fraudFlags={claim.fraudFlags} size="sm" />
            {Number(claim.approvedAmount ?? claim.estimatedCost ?? 0) >= HIGH_VALUE_THRESHOLD && (
              <Badge className="text-xs border" style={{ background: "#FFF8E6", color: "#8A5C00", borderColor: "#E8C97A" }}>High Value</Badge>
            )}
          <div className="flex justify-end mb-3"><ReportsBadgeWidget compact /></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
            <span><strong className="text-foreground">Vehicle:</strong> {claim.vehicleRegistration ?? "—"}</span>
            <span><strong className="text-foreground">Make:</strong> {[claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(" ") || "—"}</span>
            <span><strong className="text-foreground">Value:</strong> {fmtCost(claim)}</span>
            <span><strong className="text-foreground">Submitted:</strong> {new Date(claim.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">{actions}</div>
      </div>
    </div>
  );

  const ApprovalActions = ({ claim }: { claim: any }) => (
    <>
      <Button size="sm" onClick={() => openDialog(claim, "approve")}>
        <CheckCircle className="h-4 w-4 mr-1.5" /> Approve
      </Button>
      <Button size="sm" variant="outline" onClick={() => openDialog(claim, "request_info")}>
        <MessageSquare className="h-4 w-4 mr-1.5" /> Request Info
      </Button>
      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => openDialog(claim, "reject")}>
        <XCircle className="h-4 w-4 mr-1.5" /> Reject
      </Button>
      <Link href={`/insurer/claims/${claim.id}/comparison?report=standard`}>
        <Button size="sm" variant="ghost" className="w-full"><Eye className="h-4 w-4 mr-1.5" /> Review</Button>
      </Link>
    </>
  );

  const OversightActions = ({ claim }: { claim: any }) => (
    <>
      <AiAssessButton claimId={claim.id} currentStatus={claim.status} onSuccess={() => {}} />
      <Link href={`/insurer/claims/${claim.id}/comparison?report=standard`}>
        <Button size="sm" variant="outline"><Eye className="h-4 w-4 mr-1.5" /> View</Button>
      </Link>
    </>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Risk Manager</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Technical approvals, financial decisions, and risk oversight</p>
          </div>
          <div className="flex items-center gap-3">
            <KingaReportButton
              reportKey="risk_manager_portfolio"
              label="Export Risk Report"
              variant="outline"
              size="sm"
            />
            <Button variant="outline" size="sm" onClick={() => refetchQueue()}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
            </Button>
            <KingaLogo showText={false} size="sm" />
          </div>
        </div>

        {/* ── Analytics Period Selector ── */}
        <div className="flex flex-wrap items-center gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Period:</span>
          <input type="date" value={analyticsFrom} onChange={e => setAnalyticsFrom(e.target.value)} className="border rounded px-2 py-1 text-xs h-8 bg-background" />
          <span className="text-xs text-muted-foreground">to</span>
          <input type="date" value={analyticsTo} onChange={e => setAnalyticsTo(e.target.value)} className="border rounded px-2 py-1 text-xs h-8 bg-background" />
        </div>

        {/* ── FRAUD INTELLIGENCE KPI BAR (5 metrics, always visible) ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            label="Fraud Rate"
            value={riskAnalyticsLoading ? '…' : `${riskAnalytics?.kpis?.fraudRate ?? 0}%`}
            sub="High-risk / total claims"
            icon={AlertCircle}
            accent={(riskAnalytics?.kpis?.fraudRate ?? 0) >= 15 ? 'text-red-600' : (riskAnalytics?.kpis?.fraudRate ?? 0) >= 8 ? 'text-amber-600' : 'text-green-600'}
          />
          <StatCard
            label="Fraud Exposure"
            value={riskAnalyticsLoading ? '…' : (() => { const sym = currencySymbol(undefined); const v = riskAnalytics?.kpis?.fraudExposure ?? 0; return v > 0 ? `${sym} ${(v/100).toLocaleString()}` : '—'; })()}
            sub="Value at risk"
            icon={DollarSign}
            accent="text-orange-600"
          />
          <StatCard
            label="High-Risk Claims"
            value={riskAnalyticsLoading ? '…' : (riskAnalytics?.kpis?.fraudCount ?? escalationsData.length)}
            sub="Flagged for review"
            icon={Shield}
            accent="text-red-600"
          />
          <StatCard
            label="Avg Fraud Score"
            value={riskAnalyticsLoading ? '…' : `${riskAnalytics?.kpis?.avgFraudScore ?? avgRisk}%`}
            sub="Portfolio average"
            icon={BarChart3}
            accent={avgRisk >= 60 ? 'text-red-600' : avgRisk >= 35 ? 'text-amber-600' : 'text-green-600'}
          />
          <StatCard
            label="Total Claims"
            value={riskAnalyticsLoading ? '…' : (riskAnalytics?.kpis?.totalClaims ?? allClaims.length)}
            sub="In period"
            icon={Activity}
            accent="text-foreground"
          />
        </div>

        {/* ── 3 SIGNATURE CHARTS (always visible, strategy-mandated) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Chart 1: Fraud Rate Trend */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-500" />
                Fraud Rate Trend
              </CardTitle>
              <CardDescription className="text-xs">Weekly fraud rate % over the period</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {riskAnalyticsLoading ? (
                <div className="h-48 flex items-center justify-center"><Activity className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : riskAnalytics?.fraudRateTrend && riskAnalytics.fraudRateTrend.length > 0 ? (
                <Bar
                  data={{
                    labels: riskAnalytics.fraudRateTrend.map((d: any) => d.week),
                    datasets: [{
                      label: 'Fraud Rate %',
                      data: riskAnalytics.fraudRateTrend.map((d: any) => d.fraudRate),
                      backgroundColor: riskAnalytics.fraudRateTrend.map((d: any) =>
                        d.fraudRate >= 15 ? '#ef4444' : d.fraudRate >= 8 ? '#f59e0b' : '#22c55e'
                      ),
                      borderRadius: 4,
                    }],
                  }}
                  options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v: any) => `${v}%` } }, x: { ticks: { font: { size: 9 }, maxRotation: 45 } } } }}
                />
              ) : (
                <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No trend data for period</div>
              )}
            </CardContent>
          </Card>

          {/* Chart 2: Incident Type × Risk Level Heatmap */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-red-500" />
                Risk Heatmap
              </CardTitle>
              <CardDescription className="text-xs">Incident type × risk level — high counts = hot</CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-4">
              {riskAnalyticsLoading ? (
                <div className="h-48 flex items-center justify-center"><Activity className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : riskAnalytics?.heatmap ? (() => {
                const incidentTypes = Object.keys(riskAnalytics.heatmap);
                const riskLevels = ['low','medium','high','critical','elevated'];
                const riskColors: Record<string,string> = { low:'#22c55e', medium:'#f59e0b', high:'#f97316', critical:'#ef4444', elevated:'#dc2626' };
                const maxVal = Math.max(1, ...incidentTypes.flatMap(it => riskLevels.map(rl => riskAnalytics.heatmap[it]?.[rl] ?? 0)));
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr>
                          <th className="text-left py-1 pr-2 text-muted-foreground font-medium">Type</th>
                          {riskLevels.map(rl => <th key={rl} className="text-center py-1 px-1 text-muted-foreground font-medium capitalize" style={{ fontSize: '9px' }}>{rl}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {incidentTypes.map(it => (
                          <tr key={it}>
                            <td className="py-1 pr-2 text-muted-foreground capitalize" style={{ fontSize: '9px' }}>{it}</td>
                            {riskLevels.map(rl => {
                              const v = riskAnalytics.heatmap[it]?.[rl] ?? 0;
                              const intensity = maxVal > 0 ? v / maxVal : 0;
                              const alpha = Math.round(intensity * 220 + 35).toString(16).padStart(2,'0');
                              const bg = v === 0 ? 'transparent' : `${riskColors[rl]}${alpha}`;
                              return (
                                <td key={rl} className="text-center py-1 px-1 rounded font-semibold" style={{ background: bg, color: intensity > 0.4 ? 'white' : 'inherit', fontSize: '10px', minWidth: '28px' }}>
                                  {v > 0 ? v : ''}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })() : (
                <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No heatmap data for period</div>
              )}
            </CardContent>
          </Card>

          {/* Chart 3: Frequency vs Severity */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                Frequency vs Severity
              </CardTitle>
              <CardDescription className="text-xs">Claim count vs avg value per incident type</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {riskAnalyticsLoading ? (
                <div className="h-48 flex items-center justify-center"><Activity className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : riskAnalytics?.scatter && riskAnalytics.scatter.length > 0 ? (
                <Bar
                  data={{
                    labels: riskAnalytics.scatter.map((d: any) => d.incidentType.replace(/_/g,' ')),
                    datasets: [
                      { label: 'Frequency', data: riskAnalytics.scatter.map((d: any) => d.frequency), backgroundColor: '#3b82f6', borderRadius: 4, yAxisID: 'y' },
                      { label: 'Avg Value (÷100)', data: riskAnalytics.scatter.map((d: any) => Math.round(d.avgSeverity / 100)), backgroundColor: '#f97316', borderRadius: 4, yAxisID: 'y1' },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } } },
                    scales: {
                      y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Count', font: { size: 9 } } },
                      y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Avg Value', font: { size: 9 } } },
                      x: { ticks: { font: { size: 9 }, maxRotation: 35 } },
                    },
                  }}
                />
              ) : (
                <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No scatter data for period</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── QUEUE STAT BAR (operational, below charts) ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Pending Approval"
            value={approvalQueue.length}
            sub="Technical basis review"
            icon={Shield}
            accent={approvalQueue.length > 0 ? "text-amber-600" : undefined}
          />
          <StatCard
            label="Financial Decisions"
            value={financialQueue.length}
            sub="Awaiting financial sign-off"
            icon={DollarSign}
            accent={financialQueue.length > 0 ? "text-blue-600" : undefined}
          />
          <StatCard
            label="High-Value Claims"
            value={highValueClaims.length}
            sub={`Above ${currencySymbol(undefined)} ${HIGH_VALUE_THRESHOLD.toLocaleString()}`}
            icon={TrendingUp}
          />
          <StatCard
            label="Escalations"
            value={escalatedClaims.length}
            sub="Disputed / manual review"
            icon={AlertCircle}
            accent={escalatedClaims.length > 0 ? "text-red-600" : undefined}
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 w-full max-w-3xl">
            <TabsTrigger value="approval" className="relative">
              Technical Approval
              {approvalQueue.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold" style={{ background: "#8A5C00" }}>
                  {approvalQueue.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="financial">
              Financial Decisions
              {financialQueue.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold" style={{ background: "#4878A8" }}>
                  {financialQueue.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="escalations">
              Escalations
              {escalatedClaims.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold" style={{ background: "#A32D2D" }}>
                  {escalatedClaims.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="oversight">Portfolio Oversight</TabsTrigger>
            <TabsTrigger value="notifications"><NotificationsTabBadge /></TabsTrigger>
          </TabsList>

          {/* ── Technical Approval Queue ── */}
          <TabsContent value="approval" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Claims requiring technical basis approval before financial processing.
              </p>
            </div>
            {queueLoading ? (
              <p className="text-center text-muted-foreground py-12">Loading approval queue…</p>
            ) : approvalQueue.length > 0 ? (
              <div className="space-y-3">
                {approvalQueue.map((claim: any) => (
                  <ClaimRow key={claim.id} claim={claim} actions={<ApprovalActions claim={claim} />} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 border border-dashed border-border rounded-lg">
                <Shield className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium text-foreground">No claims pending technical approval</p>
                <p className="text-sm text-muted-foreground mt-1">Approved claims move to the financial decision queue</p>
              </div>
            )}
          </TabsContent>

          {/* ── Financial Decisions ── */}
          <TabsContent value="financial" className="mt-4 space-y-3">
            {/* Summary banner */}
            {financialQueue.length > 0 && (
              <div className="rounded-lg p-3 flex items-center gap-3 border" style={{ background: "#EEF4FB", borderColor: "#B8D0E8" }}>
                <DollarSign className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>{financialQueue.length}</strong> claim{financialQueue.length !== 1 ? "s" : ""} awaiting financial sign-off
                  {financialQueue.length > 0 && (
                    <> — Total exposure: <strong>
                      {(() => {
                        const total = financialQueue.reduce((s: number, c: any) => s + (c.totalClaimAmount ?? 0), 0);
                        return total > 0 ? `${currencySymbol((financialQueue[0] as any)?.currencyCode)} ${total.toLocaleString()}` : "—";
                      })()}
                    </strong></>
                  )}
                </p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Claims in <code className="text-xs bg-muted px-1 rounded">financial_decision</code> workflow state — ordered by claim amount descending.
            </p>
            {finLoading ? (
              <p className="text-center text-muted-foreground py-12">Loading financial queue…</p>
            ) : financialQueue.length > 0 ? (
              <div className="space-y-3">
                {financialQueue.map((claim: any) => (
                  <ClaimRow
                    key={claim.id}
                    claim={{ ...claim, approvedAmount: claim.totalClaimAmount }}
                    actions={
                      <>
                        <Button size="sm" onClick={() => authorisePayment.mutate({ claimId: claim.id })} disabled={authorisePayment.isPending}>
                          <CheckCircle className="h-4 w-4 mr-1.5" /> {authorisePayment.isPending ? 'Authorising…' : 'Authorise Payment'}
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => openDialog(claim, "reject")}>
                          <XCircle className="h-4 w-4 mr-1.5" /> Dispute
                        </Button>
                        <Link href={`/insurer/claims/${claim.id}/comparison?report=standard`}>
                          <Button size="sm" variant="ghost" className="w-full"><Eye className="h-4 w-4 mr-1.5" /> Review</Button>
                        </Link>
                      </>
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 border border-dashed border-border rounded-lg">
                <DollarSign className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium text-foreground">No claims awaiting financial decision</p>
                <p className="text-sm text-muted-foreground mt-1">Claims appear here after technical approval and move to <code className="text-xs bg-muted px-1 rounded">financial_decision</code> workflow state</p>
              </div>
            )}
          </TabsContent>

          {/* ── Escalations ── */}
          <TabsContent value="escalations" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Claims in disputed/manual_review workflow states or with high/critical fraud risk — requiring direct risk manager attention.
            </p>
            {escalationsLoading ? (
              <p className="text-center text-muted-foreground py-12">Loading…</p>
            ) : escalatedClaims.length > 0 ? (
              <div className="space-y-3">
                {escalatedClaims.map((claim: any) => (
                  <ClaimRow
                    key={claim.id}
                    claim={claim}
                    actions={
                      <>
                        <AiAssessButton claimId={claim.id} currentStatus={claim.status} onSuccess={() => {}} />
                        <Button size="sm" variant="outline" onClick={() => openDialog(claim, "request_info")}>
                          <MessageSquare className="h-4 w-4 mr-1.5" /> Request Info
                        </Button>
                        <Link href={`/insurer/claims/${claim.id}/comparison?report=standard`}>
                          <Button size="sm" variant="ghost" className="w-full"><Eye className="h-4 w-4 mr-1.5" /> Review</Button>
                        </Link>
                      </>
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 border border-dashed border-border rounded-lg">
                <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium text-foreground">No high-risk escalations</p>
                <p className="text-sm text-muted-foreground mt-1">Claims with fraud score ≥ 70 appear here automatically</p>
              </div>
            )}
          </TabsContent>

          {/* ── Portfolio Oversight ── */}
          <TabsContent value="oversight" className="mt-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by claim number, vehicle…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="text-sm text-muted-foreground">{filteredAll.length} claims</p>
            </div>

            {allLoading ? (
              <p className="text-center text-muted-foreground py-12">Loading portfolio…</p>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Risk</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAll.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No claims found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAll.map((claim: any) => (
                        <TableRow key={claim.id}>
                          <TableCell className="font-medium">{claim.claimNumber}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {[claim.vehicleRegistration, claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(" · ") || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {statusLabel(claim.workflowState ?? claim.status ?? "pending")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <RiskTrend score={claim.fraudRiskScore ?? 0} />
                              <span className="text-sm">{claim.fraudRiskScore ?? 0}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">{fmtCost(claim)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(claim.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <OversightActions claim={claim} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        
          {/* ── Notifications Tab ─────────────────────────────────────── */}
          <TabsContent value="notifications" className="mt-6">
            <NotificationsInbox />
          </TabsContent>
</Tabs>

        {/* ── Action Dialog ── */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {dialogMode === "approve" && "Approve Technical Basis"}
                {dialogMode === "reject" && "Reject / Dispute Claim"}
                {dialogMode === "request_info" && "Request Additional Information"}
              </DialogTitle>
              <DialogDescription>
                {selectedClaim && `${selectedClaim.claimNumber} — ${selectedClaim.vehicleRegistration ?? "Vehicle pending"} — ${fmtCost(selectedClaim)}`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {dialogMode === "request_info" && (
                <div className="space-y-2">
                  <Label htmlFor="infoRequest">What information is required?</Label>
                  <Input
                    id="infoRequest"
                    value={infoRequest}
                    onChange={(e) => setInfoRequest(e.target.value)}
                    placeholder="e.g. Additional photos of rear damage, police report number…"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes {dialogMode === "request_info" ? "(optional)" : "(optional)"}</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    dialogMode === "approve"
                      ? "Technical basis approved — any notes for the record…"
                      : dialogMode === "reject"
                      ? "Reason for rejection or dispute…"
                      : "Additional context for the processor…"
                  }
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={approveTechnical.isPending}
                variant={dialogMode === "reject" ? "destructive" : "default"}
              >
                {approveTechnical.isPending ? "Processing…" : (
                  dialogMode === "approve" ? "Confirm Approval" :
                  dialogMode === "reject" ? "Confirm Rejection" :
                  "Send Request"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
