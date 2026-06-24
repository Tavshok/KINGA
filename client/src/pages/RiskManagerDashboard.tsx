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
import { PortalHeroBand, ProtoAlertBar, ProtoTabBar, ProtoCard, P } from "@/components/PortalHeroBand";
import { PortalHeader, PortalKPIStrip, PortalAlerts, type PortalKPI, type PortalAlert } from "@/components/KingaPortalShell";
import { GeographicRiskClustersPanel } from "@/components/risk/GeographicRiskClustersPanel";
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
    <Card className="shadow-none" style={{ border: '1px solid #E5E7EB', borderRadius: 10, background: '#FFFFFF' }}>
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

  // T4: Fraud Rule Accuracy — false positive rate from fraudRules table
  const { data: fraudRuleAccuracy, isLoading: fraudRuleAccuracyLoading } =
    trpc.claims.getFraudRuleAccuracy.useQuery();

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
    <div className="p-4 rounded-lg transition-colors" style={{ border: '1px solid #E5E7EB', background: '#FFFFFF', borderRadius: 8 }}>
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
    <div style={{ background: 'var(--body-bg)', fontFamily: 'Inter, sans-serif', minHeight: '100vh' }}>
         {/* ── IDENTITY STRIP ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', background:'#FFFFFF', borderBottom:'1px solid #E7E2D6', position:'sticky', top:0, zIndex:100, height:'52px', fontFamily:'Inter, sans-serif' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style={{ height:28, width:'auto', objectFit:'contain', flexShrink:0 }} />
          <div style={{ width:1, height:22, background:'#C8C4BA' }} />
          <span style={{ fontSize:13, fontWeight:600, color:'#15201A', letterSpacing:'-0.01em' }}>Risk Manager</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button title="Notifications" style={{ width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:6, cursor:'pointer', color:'#6B7568', background:'none', border:'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
        </div>
      </div>

      {/* ── HERO BAND ── */}
      <div className="p11-hero">
        <div className="p11-hero-top">
          <div>
            <div className="p11-breadcrumb">KINGA · Risk Manager</div>
            <div className="p11-hero-title">Risk & Fraud Intelligence</div>
            <div className="p11-hero-subtitle">
              {riskAnalyticsLoading ? 'Loading analytics…' : `Portfolio risk overview · ${allClaims.length} total claims`}
            </div>
          </div>
          <div className="p11-hero-actions">
            <button className="p11-btn-ghost" onClick={() => setActiveTab('oversight')}>
              <Shield style={{ width: 13, height: 13 }} />
              Portfolio View
            </button>
            <button className="p11-btn-gold">
              <Shield style={{ width: 13, height: 13 }} />
              Export Risk Report
            </button>
          </div>
        </div>
        {/* KPI Strip */}
        <div className="p11-kpi-grid">
          <div className="p11-kpi-tile headline">
            <div className="p11-kpi-label">Fraud Rate</div>
            <div className="p11-kpi-value num">{riskAnalyticsLoading ? '…' : `${riskAnalytics?.kpis?.fraudRate ?? 0}%`}</div>
            <div className="p11-kpi-delta">Of total claims</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Pending Approval</div>
            <div className="p11-kpi-value num">{approvalQueue.length}</div>
            <div className="p11-kpi-delta">Technical basis review</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Financial Decisions</div>
            <div className="p11-kpi-value num">{financialQueue.length}</div>
            <div className="p11-kpi-delta">Awaiting sign-off</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Escalations</div>
            <div className="p11-kpi-value num">{escalatedClaims.length}</div>
            <div className="p11-kpi-delta down">Disputed / review</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">High-Value Claims</div>
            <div className="p11-kpi-value num">{highValueClaims.length}</div>
            <div className="p11-kpi-delta">Above threshold</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Avg Fraud Score</div>
            <div className="p11-kpi-value num">{riskAnalyticsLoading ? '…' : `${riskAnalytics?.kpis?.avgFraudScore ?? avgRisk}%`}</div>
            <div className="p11-kpi-delta">Portfolio average</div>
          </div>
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <nav className="p11-tab-bar">
        {[
          { id: 'approval', label: 'Approval Queue', count: approvalQueue.length, countClass: approvalQueue.length > 0 ? 'alert' : '' },
          { id: 'financial', label: 'Financial Decisions', count: financialQueue.length, countClass: '' },
          { id: 'escalations', label: 'Escalations', count: escalatedClaims.length, countClass: escalatedClaims.length > 0 ? 'alert' : '' },
          { id: 'oversight', label: 'Portfolio Oversight', count: 0, countClass: '' },
          { id: 'notifications', label: 'Notifications', count: 0, countClass: '' },
        ].map(tab => (
          <div
            key={tab.id}
            className={`p11-tab-item${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`p11-tab-badge ${tab.countClass}`}>{tab.count}</span>
            )}
          </div>
        ))}
      </nav>

      {/* ── ALERT BAR ── */}
      {(escalatedClaims.length > 0 || allClaims.filter((c: any) => (c.fraudRiskScore ?? 0) >= 70).length > 0) && (
        <div className="p11-alert-bar">
          {escalatedClaims.length > 0 && (
            <div className="p11-alert-item red">
              <span className="p11-alert-count">{escalatedClaims.length}</span>
              <span>escalated claim(s) requiring risk review</span>
            </div>
          )}
          {allClaims.filter((c: any) => (c.fraudRiskScore ?? 0) >= 70).length > 0 && (
            <div className="p11-alert-item amber">
              <span className="p11-alert-count">{allClaims.filter((c: any) => (c.fraudRiskScore ?? 0) >= 70).length}</span>
              <span>claim(s) flagged for fraud investigation</span>
            </div>
          )}
          <div className="p11-alert-cta" onClick={() => setActiveTab('escalations')}>
            View escalations →
          </div>
        </div>
      )}

      {/* ── BODY ── */}
      <div className="p11-body">
        {activeTab === 'notifications' ? (
          <NotificationsInbox />
        ) : (
          <div className="p11-body-2col">
            {/* ── MAIN COLUMN ── */}
            <div>
              {activeTab === 'approval' && (
                <div className="p11-card">
                  <div className="p11-card-header">
                    <div>
                      <div className="p11-card-title">
                        <Shield style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                        Approval Queue
                      </div>
                      <div className="p11-card-subtitle">Claims awaiting technical basis review</div>
                    </div>
                  </div>
                  {queueLoading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
                  ) : approvalQueue.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                      <CheckCircle style={{ width: 32, height: 32, margin: '0 auto 8px', color: 'var(--g-500)' }} />
                      <div style={{ fontWeight: 600 }}>No claims pending approval</div>
                    </div>
                  ) : (
                    <div className="p11-table-wrap">
                      <table className="p11-table">
                        <thead>
                          <tr>
                            <th>Claim</th>
                            <th>Vehicle</th>
                            <th>Risk Score</th>
                            <th>Value</th>
                            <th>Submitted</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {approvalQueue.map((claim: any) => (
                            <tr key={claim.id}>
                              <td><span className="p11-id-mono">{claim.claimNumber}</span></td>
                              <td style={{ color: 'var(--muted)' }}>{claim.vehicleRegistration || '—'}</td>
                              <td>
                                <span className={`p11-badge ${(claim.fraudRiskScore ?? 0) >= 70 ? 'red' : (claim.fraudRiskScore ?? 0) >= 40 ? 'amber' : 'green'}`}>
                                  {claim.fraudRiskScore ?? 0}%
                                </span>
                              </td>
                              <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtCost(claim)}</td>
                              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(claim.createdAt).toLocaleDateString()}</td>
                              <td>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button className="p11-btn-outline" style={{ padding: '4px 8px', fontSize: 11 }}
                                    onClick={() => openDialog(claim, 'approve')}>
                                    <CheckCircle style={{ width: 11, height: 11 }} /> Approve
                                  </button>
                                  <button className="p11-btn-outline" style={{ padding: '4px 8px', fontSize: 11 }}
                                    onClick={() => openDialog(claim, 'reject')}>
                                    <XCircle style={{ width: 11, height: 11 }} /> Reject
                                  </button>
                                  <Link href={`/insurer/claims/${claim.id}/comparison?report=standard`}>
                                    <button className="p11-btn-outline" style={{ padding: '4px 8px', fontSize: 11 }}>
                                      <Eye style={{ width: 11, height: 11 }} /> Review
                                    </button>
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'financial' && (
                <div className="p11-card">
                  <div className="p11-card-header">
                    <div>
                      <div className="p11-card-title">
                        <DollarSign style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                        Financial Decisions
                      </div>
                      <div className="p11-card-subtitle">Claims awaiting financial sign-off</div>
                    </div>
                  </div>
                  {finLoading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
                  ) : financialQueue.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                      <CheckCircle style={{ width: 32, height: 32, margin: '0 auto 8px', color: 'var(--g-500)' }} />
                      <div style={{ fontWeight: 600 }}>No financial decisions pending</div>
                    </div>
                  ) : (
                    <div className="p11-table-wrap">
                      <table className="p11-table">
                        <thead>
                          <tr>
                            <th>Claim</th>
                            <th>Vehicle</th>
                            <th>Risk</th>
                            <th>Value</th>
                            <th>Submitted</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {financialQueue.map((claim: any) => (
                            <tr key={claim.id}>
                              <td><span className="p11-id-mono">{claim.claimNumber}</span></td>
                              <td style={{ color: 'var(--muted)' }}>{claim.vehicleRegistration || '—'}</td>
                              <td>
                                <span className={`p11-badge ${(claim.fraudRiskScore ?? 0) >= 70 ? 'red' : (claim.fraudRiskScore ?? 0) >= 40 ? 'amber' : 'green'}`}>
                                  {claim.fraudRiskScore ?? 0}%
                                </span>
                              </td>
                              <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtCost(claim)}</td>
                              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(claim.createdAt).toLocaleDateString()}</td>
                              <td>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button className="p11-btn-outline" style={{ padding: '4px 8px', fontSize: 11 }}
                                    onClick={() => openDialog(claim, 'approve')}>
                                    Approve
                                  </button>
                                  <button className="p11-btn-outline" style={{ padding: '4px 8px', fontSize: 11 }}
                                    onClick={() => openDialog(claim, 'request_info')}>
                                    Request Info
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'escalations' && (
                <div className="p11-card">
                  <div className="p11-card-header">
                    <div>
                      <div className="p11-card-title">
                        <AlertCircle style={{ width: 14, height: 14, color: 'var(--red)' }} />
                        Escalations
                      </div>
                      <div className="p11-card-subtitle">High-risk claims requiring manual review</div>
                    </div>
                  </div>
                  {escalatedClaims.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                      <CheckCircle style={{ width: 32, height: 32, margin: '0 auto 8px', color: 'var(--g-500)' }} />
                      <div style={{ fontWeight: 600 }}>No escalations</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>Claims with fraud score ≥ 70 appear here automatically</div>
                    </div>
                  ) : (
                    <div className="p11-table-wrap">
                      <table className="p11-table">
                        <thead>
                          <tr>
                            <th>Claim</th>
                            <th>Vehicle</th>
                            <th>Fraud Score</th>
                            <th>Value</th>
                            <th>Submitted</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {escalatedClaims.map((claim: any) => (
                            <tr key={claim.id}>
                              <td><span className="p11-id-mono">{claim.claimNumber}</span></td>
                              <td style={{ color: 'var(--muted)' }}>{claim.vehicleRegistration || '—'}</td>
                              <td>
                                <span className="p11-badge red">{claim.fraudRiskScore ?? 0}%</span>
                              </td>
                              <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtCost(claim)}</td>
                              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(claim.createdAt).toLocaleDateString()}</td>
                              <td>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <AiAssessButton claimId={claim.id} currentStatus={claim.status} onSuccess={() => {}} />
                                  <button className="p11-btn-outline" style={{ padding: '4px 8px', fontSize: 11 }}
                                    onClick={() => openDialog(claim, 'request_info')}>
                                    <MessageSquare style={{ width: 11, height: 11 }} /> Request Info
                                  </button>
                                  <Link href={`/insurer/claims/${claim.id}/comparison?report=standard`}>
                                    <button className="p11-btn-outline" style={{ padding: '4px 8px', fontSize: 11 }}>
                                      <Eye style={{ width: 11, height: 11 }} /> Review
                                    </button>
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'oversight' && (
                <div className="p11-card">
                  <div className="p11-filter-bar">
                    <div className="p11-search-wrap">
                      <Search className="p11-search-icon" style={{ width: 14, height: 14 }} />
                      <input
                        className="p11-search-input"
                        placeholder="Search by claim number, vehicle…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                      />
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filteredAll.length} claims</span>
                  </div>
                  {allLoading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading portfolio…</div>
                  ) : (
                    <div className="p11-table-wrap">
                      <table className="p11-table">
                        <thead>
                          <tr>
                            <th>Claim</th>
                            <th>Vehicle</th>
                            <th>Status</th>
                            <th>Risk</th>
                            <th style={{ textAlign: 'right' }}>Value</th>
                            <th>Submitted</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAll.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>No claims found</td></tr>
                          ) : filteredAll.map((claim: any) => (
                            <tr key={claim.id}>
                              <td><span className="p11-id-mono">{claim.claimNumber}</span></td>
                              <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                                {[claim.vehicleRegistration, claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(' · ') || '—'}
                              </td>
                              <td>
                                <span className="p11-badge muted">{statusLabel(claim.workflowState ?? claim.status ?? 'pending')}</span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <RiskTrend score={claim.fraudRiskScore ?? 0} />
                                  <span style={{ fontSize: 12 }}>{claim.fraudRiskScore ?? 0}%</span>
                                </div>
                              </td>
                              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtCost(claim)}</td>
                              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(claim.createdAt).toLocaleDateString()}</td>
                              <td><OversightActions claim={claim} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── SIDEBAR ── */}
            <div className="p11-sidebar">
              {/* Attention Required */}
              <div className="p11-card">
                <div className="p11-card-header">
                  <div>
                    <div className="p11-card-title">
                      <AlertCircle style={{ width: 14, height: 14, color: 'var(--red)' }} />
                      Attention Required
                    </div>
                    <div className="p11-card-subtitle">High-priority risk items</div>
                  </div>
                </div>
                <div className="p11-card-body">
                  {escalatedClaims.length === 0 && approvalQueue.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)' }}>
                      <CheckCircle style={{ width: 24, height: 24, margin: '0 auto 6px', color: 'var(--g-500)' }} />
                      <div style={{ fontSize: 12 }}>No urgent items</div>
                    </div>
                  ) : (
                    <>
                      {escalatedClaims.slice(0, 3).map((c: any) => (
                        <div key={c.id} className="p11-attention-item">
                          <div className="p11-attention-dot red" />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }} className="p11-id-mono">{c.claimNumber}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Fraud score: {c.fraudRiskScore ?? 0}%</div>
                          </div>
                          <button className="p11-btn-outline" style={{ padding: '3px 7px', fontSize: 10 }}
                            onClick={() => openDialog(c, 'approve')}>Review</button>
                        </div>
                      ))}
                      {approvalQueue.slice(0, 3).map((c: any) => (
                        <div key={c.id} className="p11-attention-item">
                          <div className="p11-attention-dot amber" />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }} className="p11-id-mono">{c.claimNumber}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Pending approval</div>
                          </div>
                          <button className="p11-btn-outline" style={{ padding: '3px 7px', fontSize: 10 }}
                            onClick={() => openDialog(c, 'approve')}>Approve</button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* Risk Summary */}
              <div className="p11-card">
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <TrendingUp style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                    Risk Summary
                  </div>
                </div>
                <div className="p11-card-body">
                  {[
                    { label: 'Low Risk (0–39%)', value: allClaims.filter((c: any) => (c.fraudRiskScore ?? 0) < 40).length, cls: 'green' },
                    { label: 'Medium Risk (40–69%)', value: allClaims.filter((c: any) => { const s = c.fraudRiskScore ?? 0; return s >= 40 && s < 70; }).length, cls: 'amber' },
                    { label: 'High Risk (70%+)', value: allClaims.filter((c: any) => (c.fraudRiskScore ?? 0) >= 70).length, cls: 'red' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                      <span className={`p11-badge ${row.cls}`}>{row.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Analytics Period */}
              <div className="p11-card">
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <Calendar style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                    Analytics Period
                  </div>
                </div>
                <div className="p11-card-body">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>From</div>
                      <input type="date" value={analyticsFrom} onChange={e => setAnalyticsFrom(e.target.value)}
                        className="p11-select" style={{ width: '100%' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>To</div>
                      <input type="date" value={analyticsTo} onChange={e => setAnalyticsTo(e.target.value)}
                        className="p11-select" style={{ width: '100%' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

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
  );
}
