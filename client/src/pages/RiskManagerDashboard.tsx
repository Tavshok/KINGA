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
import { Link, useSearch } from "wouter";
import { currencySymbol } from "@/lib/currency";
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler,
} from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler);

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

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${accent ?? "text-foreground"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <Icon className="h-5 w-5 text-muted-foreground" />
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
  const [showAnalytics, setShowAnalytics] = useState(true);

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
              <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200">High Value</Badge>
            )}
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
      <Link href={`/insurer/comparison/${claim.id}`}>
        <Button size="sm" variant="ghost" className="w-full"><Eye className="h-4 w-4 mr-1.5" /> Review</Button>
      </Link>
    </>
  );

  const OversightActions = ({ claim }: { claim: any }) => (
    <>
      <AiAssessButton claimId={claim.id} currentStatus={claim.status} onSuccess={() => {}} />
      <Link href={`/insurer/comparison/${claim.id}`}>
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
            <Button variant="outline" size="sm" onClick={() => refetchQueue()}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
            </Button>
            <KingaLogo showText={false} size="sm" />
          </div>
        </div>

        {/* ── Analytics Section ── */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Analytics Period:</span>
              <input type="date" value={analyticsFrom} onChange={e => setAnalyticsFrom(e.target.value)} className="border rounded px-2 py-1 text-xs h-8 bg-background" />
              <span className="text-xs text-muted-foreground">to</span>
              <input type="date" value={analyticsTo} onChange={e => setAnalyticsTo(e.target.value)} className="border rounded px-2 py-1 text-xs h-8 bg-background" />
            </div>
            <button onClick={() => setShowAnalytics(v => !v)} className="text-xs text-muted-foreground hover:text-foreground">
              {showAnalytics ? 'Hide Analytics ▲' : 'Show Analytics ▼'}
            </button>
          </div>

          {showAnalytics && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Risk Distribution Donut */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold">Risk Level Distribution</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {riskAnalytics?.riskDistribution ? (
                    <Doughnut
                      data={{
                        labels: ['Low (<40)', 'Medium (40-69)', 'High (70+)'],
                        datasets: [{ data: [riskAnalytics.riskDistribution.low ?? 0, riskAnalytics.riskDistribution.medium ?? 0, riskAnalytics.riskDistribution.high ?? 0], backgroundColor: ['#22c55e','#f59e0b','#ef4444'], borderWidth: 0 }],
                      }}
                      options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } } }, cutout: '65%' }}
                    />
                  ) : <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">{riskAnalyticsLoading ? 'Loading…' : 'No data for period'}</div>}
                </CardContent>
              </Card>

              {/* Fraud by Incident Type Bar */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold">Fraud Alerts by Incident Type</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {riskAnalytics?.fraudByIncidentType && Object.keys(riskAnalytics.fraudByIncidentType).length > 0 ? (
                    <Bar
                      data={{
                        labels: Object.keys(riskAnalytics.fraudByIncidentType).map(k => k.replace(/_/g,' ')),
                        datasets: [{ label: 'Fraud Alerts', data: Object.values(riskAnalytics.fraudByIncidentType), backgroundColor: '#ef4444', borderRadius: 4 }],
                      }}
                      options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } }, x: { ticks: { font: { size: 9 } } } } }}
                    />
                  ) : <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">{riskAnalyticsLoading ? 'Loading…' : 'No data for period'}</div>}
                </CardContent>
              </Card>

              {/* Portfolio KPIs */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold">Portfolio Overview</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {[
                    { label: 'Total Claims', value: riskAnalytics?.totalClaims ?? allClaims.length, color: 'text-foreground' },
                    { label: 'High Risk Claims', value: riskAnalytics?.highRiskCount ?? escalationsData.length, color: 'text-red-600' },
                    { label: 'Fraud Rate', value: `${(riskAnalytics?.fraudRate ?? 0).toFixed(1)}%`, color: 'text-orange-600' },
                    { label: 'Avg Risk Score', value: `${riskAnalytics?.avgRiskScore ?? avgRisk}%`, color: avgRisk >= 60 ? 'text-red-600' : avgRisk >= 35 ? 'text-amber-600' : 'text-green-600' },
                    { label: 'Total Exposure', value: (() => { const sym = currencySymbol(undefined); const total = financialQueue.reduce((s: number, c: any) => s + (c.totalClaimAmount ?? 0), 0); return total > 0 ? `${sym} ${(total/100).toLocaleString()}` : '—'; })(), color: 'text-blue-600' },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                      <span className={`text-sm font-semibold ${item.color}`}>{riskAnalyticsLoading ? '…' : item.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Stat Bar */}
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
            label="Portfolio Risk Score"
            value={`${avgRisk}%`}
            sub={`${escalatedClaims.length} high-risk claims`}
            icon={BarChart3}
            accent={avgRisk >= 60 ? "text-red-600" : avgRisk >= 35 ? "text-amber-600" : "text-green-600"}
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full max-w-2xl">
            <TabsTrigger value="approval" className="relative">
              Technical Approval
              {approvalQueue.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  {approvalQueue.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="financial">
              Financial Decisions
              {financialQueue.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold">
                  {financialQueue.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="escalations">
              Escalations
              {escalatedClaims.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {escalatedClaims.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="oversight">Portfolio Oversight</TabsTrigger>
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
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center gap-3">
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
                        <Button size="sm" onClick={() => authorisePayment.mutate({ claimId: claim.id, approved: true, notes: '' })} disabled={authorisePayment.isPending}>
                          <CheckCircle className="h-4 w-4 mr-1.5" /> {authorisePayment.isPending ? 'Authorising…' : 'Authorise Payment'}
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => openDialog(claim, "reject")}>
                          <XCircle className="h-4 w-4 mr-1.5" /> Dispute
                        </Button>
                        <Link href={`/insurer/comparison/${claim.id}`}>
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
                        <Link href={`/insurer/comparison/${claim.id}`}>
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
