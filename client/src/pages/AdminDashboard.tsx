import { useAuth } from "@/_core/hooks/useAuth";
import { PendingRegistrationQueue } from "@/components/admin/PendingRegistrationQueue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Users, TrendingUp, AlertTriangle, CheckCircle, XCircle, Settings,
  Brain, Database, BarChart3, Target, Loader2, FileText, ArrowUpDown,
  Activity, Zap, Shield, GitBranch, LogOut, Download, Package
} from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { PortalHeroBand, ProtoAlertBar, ProtoTabBar, ProtoCard, P } from "@/components/PortalHeroBand";
import { PortalHeader, PortalKPIStrip, PortalAlerts, type PortalKPI, type PortalAlert } from "@/components/KingaPortalShell";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { AssetPassportPanel } from "@/components/AssetPassportPanel";

/**
 * Admin Dashboard
 * 
 * System-wide management interface for super admins to:
 * - Approve/reject panel beater applications
 * - View system analytics
 * - Configure fraud detection thresholds
 * - Manage KINGA Intelligence Training (ground truth, variance, benchmarks)
 * - Manage continuous learning loop
 */
export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedTab, setSelectedTab] = useState<"panel-beaters" | "analytics" | "intelligence" | "asset-passport" | "settings" | "tenants">("panel-beaters");

  // Tenant management
  const { data: tenantList = [], isLoading: tenantsLoading, refetch: refetchTenants } = trpc.tenant.list.useQuery();
  const updateTenant = trpc.tenant.update.useMutation({
    onSuccess: () => { toast.success("Tenant updated"); refetchTenants(); },
    onError: (e) => toast.error(e.message),
  });
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [tenantEditName, setTenantEditName] = useState("");
  const [tenantEditCurrency, setTenantEditCurrency] = useState("");

  // Ground truth form state
  const [gtClaimId, setGtClaimId] = useState("");
  const [gtDecision, setGtDecision] = useState("");
  const [gtFinalCost, setGtFinalCost] = useState("");
  const [gtPartsCost, setGtPartsCost] = useState("");
  const [gtLabourCost, setGtLabourCost] = useState("");
  const [gtPaintCost, setGtPaintCost] = useState("");
  const [gtAssessorName, setGtAssessorName] = useState("");
  const [gtRepairShop, setGtRepairShop] = useState("");
  const [gtNotes, setGtNotes] = useState("");
  const [submittingGt, setSubmittingGt] = useState(false);

  // Get all panel beaters
  const { data: panelBeaters = [] } = trpc.panelBeaters.list.useQuery();

  // Get system statistics using workflow states
  const { data: submittedClaimsData } = trpc.workflowQueries.getClaimsByState.useQuery({ state: "created", limit: 100, offset: 0 });
  const submittedClaims = submittedClaimsData?.claims || [];
  
  const { data: intakeClaimsData } = trpc.workflowQueries.getClaimsByState.useQuery({ state: "intake_verified", limit: 100, offset: 0 });
  const triageClaims = intakeClaimsData?.claims || [];
  
  const { data: assessmentClaimsData } = trpc.workflowQueries.getClaimsByState.useQuery({ state: "under_assessment", limit: 100, offset: 0 });
  const assessmentClaims = assessmentClaimsData?.claims || [];
  
  const { data: completedClaimsDataResponse } = trpc.workflowQueries.getClaimsByState.useQuery({ state: "closed", limit: 100, offset: 0 });
  const completedClaimsData = completedClaimsDataResponse?.claims || [];

  // Historical claims analytics (admin only)
  const { data: analyticsData } = trpc.historicalClaims.getAnalyticsSummary.useQuery(
    undefined,
    { retry: false }
  );
  const { data: varianceData } = trpc.historicalClaims.getVarianceDistribution.useQuery(
    { comparisonType: "quote_vs_final" },
    { retry: false }
  );
  const { data: assessorBenchmarks } = trpc.historicalClaims.getAssessorBenchmarks.useQuery(
    undefined,
    { retry: false }
  );
  const { data: vehiclePatterns } = trpc.historicalClaims.getVehicleCostPatterns.useQuery(
    undefined,
    { retry: false }
  );

  // Ground truth capture mutation
  const captureGt = trpc.historicalClaims.captureGroundTruth.useMutation({
    onSuccess: () => {
      toast.success("Ground truth captured successfully — KINGA model will learn from this data");
      setGtClaimId("");
      setGtDecision("");
      setGtFinalCost("");
      setGtPartsCost("");
      setGtLabourCost("");
      setGtPaintCost("");
      setGtAssessorName("");
      setGtRepairShop("");
      setGtNotes("");
    },
    onError: (err) => {
      toast.error(`Failed to capture ground truth: ${err.message}`);
    },
  });

  const allClaims = useMemo(
    () => [...submittedClaims, ...triageClaims, ...assessmentClaims, ...completedClaimsData] as any[],
    [submittedClaims, triageClaims, assessmentClaims, completedClaimsData]
  );

  const totalClaims = allClaims.length;
  const highRiskClaims = allClaims.filter((c: any) => (c.fraudRiskScore || 0) > 70).length;
  const completedClaims = allClaims.filter((c: any) => c.status === "completed").length;
  const avgProcessingTime = allClaims.length > 0
    ? Math.round(allClaims.reduce((sum: number, c: any) => {
        const created = new Date(c.createdAt).getTime();
        const updated = new Date(c.updatedAt).getTime();
        return sum + (updated - created) / (1000 * 60 * 60 * 24);
      }, 0) / allClaims.length)
    : 0;

  const handleApprove = (_id: number) => setLocation("/admin/dashboard");
  const handleReject = (_id: number) => setLocation("/admin/dashboard");

  const handleSubmitGroundTruth = async () => {
    if (!gtClaimId || !gtDecision || !gtFinalCost) {
      toast.error("Please fill in claim ID, decision, and final cost");
      return;
    }
    setSubmittingGt(true);
    try {
      await captureGt.mutateAsync({
        historicalClaimId: parseInt(gtClaimId),
        finalDecision: gtDecision as "approved_repair" | "approved_total_loss" | "cash_settlement" | "rejected" | "withdrawn",
        finalApprovedAmount: parseFloat(gtFinalCost),
        finalPartsCost: gtPartsCost ? parseFloat(gtPartsCost) : undefined,
        finalLaborCost: gtLabourCost ? parseFloat(gtLabourCost) : undefined,
        finalPaintCost: gtPaintCost ? parseFloat(gtPaintCost) : undefined,
        assessorName: gtAssessorName || undefined,
        repairShopName: gtRepairShop || undefined,
        approvalNotes: gtNotes || undefined,
      });
    } finally {
      setSubmittingGt(false);
    }
  };

  const getStatusBadge = (approved: number | null) => {
    if (approved === null) return <Badge variant="secondary">Pending</Badge>;
    if (approved === 1) return <Badge variant="default">Approved</Badge>;
    return <Badge variant="destructive">Rejected</Badge>;
  };

  return (
    <div className="min-h-screen" style={{ background: '#F7F8F6', fontFamily: 'Inter, sans-serif' }}>
      <PortalHeroBand
        portalName="Admin Panel"
        title="System Management"
        subtitle="KINGA · Platform Administration"
        actions={[
          { label: 'Sign Out', icon: <LogOut className="h-3 w-3" />, onClick: () => logout() },
          { label: 'Export Report', icon: <Download className="h-3 w-3" />, primary: true },
        ]}
        kpis={[
          { label: 'Total Claims', value: totalClaims, delta: 'All time', up: null, headline: true },
          { label: 'High Risk Claims', value: highRiskClaims, delta: 'Fraud score >70', up: false },
          { label: 'Completed Claims', value: completedClaims, delta: 'Resolved', up: true },
          { label: 'Avg Processing', value: `${avgProcessingTime}d`, delta: 'Resolution time', up: avgProcessingTime <= 14 },
        ]}
      />
      <ProtoAlertBar
        alerts={[
          { count: submittedClaims.length, label: 'new claim(s) awaiting intake processing', severity: 'red' },
          { count: highRiskClaims, label: 'high-risk claim(s) (fraud score >70) requiring review', severity: 'amber' },
        ]}
        ctaLabel="View all alerts"
      />



      {/* ── BODY ── */}
      <div className="p11-body">
        <div className="p11-body-2col">
          {/* ── MAIN COLUMN ── */}
          <div>
            {/* Pending Registration Queue */}
            <PendingRegistrationQueue />

            {/* Panel Beaters Table */}
            {selectedTab === "panel-beaters" && (
              <div className="p11-card" style={{ marginTop: 16 }}>
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <Users style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                    Panel Beater Registry
                  </div>
                  <button
                    onClick={() => setSelectedTab("panel-beaters")}
                    style={{ fontSize: 11, color: 'var(--g-600)', background: 'none', border: '1px solid var(--line)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                  >
                    Refresh
                  </button>
                </div>
                <div className="p11-card-body" style={{ padding: 0 }}>
                  {false ? (
                    <div style={{ padding: '16px 20px' }}>
                      {[1,2,3].map(i => <div key={i} style={{ height: 48, background: '#F3F4F6', borderRadius: 6, marginBottom: 8 }} />)}
                    </div>
                  ) : panelBeaters.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 20px', color: 'var(--muted)', fontSize: 13 }}>No panel beaters registered yet</div>
                  ) : (
                    <table className="p11-table">
                      <thead>
                        <tr>
                          <th>Business Name</th>
                          <th>City</th>
                          <th>Status</th>
                          <th>Performance</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {panelBeaters.map((pb: any) => (
                          <tr key={pb.id}>
                            <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{pb.businessName}</td>
                            <td style={{ color: 'var(--muted)', fontSize: 12 }}>{pb.city || '—'}</td>
                            <td>
                              <span className={`p11-badge ${pb.approved ? 'green' : 'amber'}`}>
                                {pb.approved ? 'Approved' : 'Pending'}
                              </span>
                            </td>
                            <td>
                              <span className={`p11-badge ${pb.performanceTier === 'A' ? 'green' : pb.performanceTier === 'D' ? 'red' : 'amber'}`}>
                                Tier {pb.performanceTier || 'B'}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {!pb.approved && (
                                  <button
                                    onClick={() => handleApprove(pb.id)}
                                    style={{ fontSize: 11, color: '#fff', background: 'var(--g-600)', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                                  >
                                    Approve
                                  </button>
                                )}
                                {pb.approved && (
                                  <button
                                    onClick={() => handleReject(pb.id)}
                                    style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: '1px solid var(--red)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                                  >
                                    Revoke
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Tenants Tab */}
            {selectedTab === "tenants" && (
              <div className="p11-card" style={{ marginTop: 16 }}>
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <GitBranch style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                    Insurer Tenants
                  </div>
                </div>
                <div className="p11-card-body" style={{ padding: 0 }}>
                  {tenantsLoading ? (
                    <div style={{ padding: '16px 20px' }}>
                      {[1,2,3].map(i => <div key={i} style={{ height: 48, background: '#F3F4F6', borderRadius: 6, marginBottom: 8 }} />)}
                    </div>
                  ) : tenantList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 20px', color: 'var(--muted)', fontSize: 13 }}>No tenants found</div>
                  ) : (
                    <table className="p11-table">
                      <thead>
                        <tr>
                          <th>Tenant ID</th>
                          <th>Name</th>
                          <th>Currency</th>
                          <th>Auto-Approve Below</th>
                          <th>Created</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenantList.map((t: any) => (
                          <tr key={t.id}>
                            <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{t.id}</td>
                            <td style={{ fontWeight: 600, color: 'var(--ink)' }}>
                              {editingTenantId === t.id ? (
                                <Input
                                  value={tenantEditName}
                                  onChange={(e) => setTenantEditName(e.target.value)}
                                  className="h-7 text-xs w-40"
                                />
                              ) : (
                                t.displayName || t.id
                              )}
                            </td>
                            <td style={{ color: 'var(--muted)', fontSize: 12 }}>{t.currency || 'ZAR'}</td>
                            <td style={{ color: 'var(--muted)', fontSize: 12 }}>R {Number(t.autoApproveBelow || 0).toLocaleString()}</td>
                            <td style={{ color: 'var(--muted)', fontSize: 12 }}>{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}</td>
                            <td>
                              {editingTenantId === t.id ? (
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button
                                    onClick={() => updateTenant.mutate({ tenantId: t.id, name: tenantEditName })}
                                    style={{ fontSize: 11, color: '#fff', background: 'var(--g-600)', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingTenantId(null)}
                                    style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: '1px solid var(--line)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditingTenantId(t.id); setTenantEditName(t.displayName || t.id); }}
                                  style={{ fontSize: 11, color: 'var(--g-600)', background: 'none', border: '1px solid var(--g-300)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                                >
                                  Edit
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Analytics Tab */}
            {selectedTab === "analytics" && (
              <div className="p11-card" style={{ marginTop: 16 }}>
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <TrendingUp style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                    Platform Analytics
                  </div>
                </div>
                <div className="p11-card-body">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      { label: 'Total Claims', value: totalClaims },
                      { label: 'Active Claims', value: allClaims.filter((c: any) => !["completed","closed","rejected"].includes(c.status)).length },
                      { label: 'Total Panel Beaters', value: panelBeaters.length },
                      { label: 'Avg Processing Days', value: `${avgProcessingTime}d` },
                    ].map(row => (
                      <div key={row.label} style={{ padding: '12px 16px', background: '#F7F8F6', borderRadius: 6, border: '1px solid var(--line)' }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{row.label}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{row.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Intelligence Tab */}
            {selectedTab === "intelligence" && (
              <div className="p11-card" style={{ marginTop: 16 }}>
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <Brain style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                    KINGA Intelligence Training
                  </div>
                </div>
                <div className="p11-card-body">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      { label: 'Model Version', value: 'GPT-4 Vision v1' },
                      { label: 'Confidence Threshold', value: '85%' },
                      { label: 'Cross-Validation', value: 'Enabled' },
                      { label: 'Physics Engine', value: 'Enabled' },
                    ].map(row => (
                      <div key={row.label} style={{ padding: '12px 16px', background: '#F7F8F6', borderRadius: 6, border: '1px solid var(--line)' }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{row.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-600)' }}>{row.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {/* Asset Passport Tab (Epic 4) */}
            {selectedTab === "asset-passport" && (
              <div className="p11-card" style={{ marginTop: 16, padding: '20px' }}>
                <AssetPassportPanel />
              </div>
            )}
            {selectedTab === "settings" && (
              <div className="p11-card" style={{ marginTop: 16 }}>
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <Settings style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                    Platform Settings
                  </div>
                </div>
                <div className="p11-card-body">
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>Platform configuration settings will appear here.</p>
                </div>
              </div>
            )}
          </div>

          {/* ── SIDEBAR ── */}
          <div className="p11-sidebar">
            {/* Platform Stats */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <BarChart3 style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Platform Stats
                </div>
              </div>
              <div className="p11-card-body">
                {[
                  { label: 'Total Claims', value: totalClaims, cls: 'muted' },
                  { label: 'Active Claims', value: allClaims.filter((c: any) => !["completed","closed","rejected"].includes(c.status)).length, cls: 'amber' },
                  { label: 'Panel Beaters', value: panelBeaters.length, cls: 'muted' },
                  { label: 'Pending Approval', value: panelBeaters.filter((pb: any) => !pb.approved).length, cls: 'red' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{row.label}</span>
                    <span className={`p11-badge ${row.cls}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <Settings style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Admin Navigation
                </div>
              </div>
              <div className="p11-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { id: 'panel-beaters', label: 'Panel Beaters', icon: Users },
                  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
                  { id: 'intelligence', label: 'KINGA Intelligence', icon: Brain },
                  { id: 'asset-passport', label: 'Asset Passport', icon: Package },
                  { id: 'tenants', label: 'Tenants', icon: GitBranch },
                  { id: 'settings', label: 'Settings', icon: Settings },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedTab(item.id as any)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                        background: selectedTab === item.id ? 'var(--g-50)' : 'none',
                        color: selectedTab === item.id ? 'var(--g-700)' : 'var(--muted)',
                        border: selectedTab === item.id ? '1px solid var(--g-200)' : '1px solid transparent',
                        borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: selectedTab === item.id ? 600 : 400,
                        textAlign: 'left',
                      }}
                    >
                      <Icon style={{ width: 13, height: 13 }} />
                      {item.label}
                    </button>
                  );
                })}
                <button
                  onClick={() => setLocation("/admin/market-quotes")}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'none', color: 'var(--muted)', border: '1px solid transparent', borderRadius: 6, cursor: 'pointer', fontSize: 12, textAlign: 'left' }}
                >
                  <Database style={{ width: 13, height: 13 }} />
                  KINGA Agency
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
