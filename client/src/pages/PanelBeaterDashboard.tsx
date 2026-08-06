import React, { useState, useMemo, useCallback } from "react";
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
, Download} from "lucide-react";
import { useLocation } from "wouter";
import KingaLogo from "@/components/KingaLogo";
import { NotificationBell } from "@/components/NotificationBell";
import RoleSwitcher from "@/components/RoleSwitcher";
import { KingaReportButton } from "@/components/KingaReportButton";
import { NotificationsInbox, NotificationsTabBadge } from "@/components/NotificationsInbox";
import { PortalHeroBand, ProtoAlertBar, ProtoTabBar, ProtoCard, P } from "@/components/PortalHeroBand";
import { PortalHeader, PortalKPIStrip, PortalAlerts, type PortalKPI, type PortalAlert } from "@/components/KingaPortalShell";
import { toast } from "sonner";

function PerformanceTierBadge({ tier }: { tier: string | null | undefined }) {
  const config: Record<string, { label: string; className: string; style?: React.CSSProperties }> = {
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

/**
 * SR-C04 + SR-M04: Sub-component for a single repair-in-progress row.
 * Fetches repair history for the claim, shows Mark Repair Complete button,
 * and allows uploading repair completion photos.
 */
function RepairInProgressRow({
  claim,
  onMarkComplete,
  isPending,
}: {
  claim: any;
  onMarkComplete: (repairHistoryId: number) => void;
  isPending: boolean;
}) {
  const { data: repairRecords = [] } = trpc.repairHistory.getByClaim.useQuery(
    { claimId: claim.id },
    { enabled: !!claim.id }
  );
  // Find the most recent open repair record (no repairDate set)
  const openRepair = repairRecords.find((r: any) => !r.repairDate);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);

  const uploadRepairPhotos = trpc.panelBeaters.uploadRepairPhotos.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.uploadedCount} photo(s) uploaded successfully`);
      setUploadedCount(prev => prev + data.uploadedCount);
      setUploadingPhotos(false);
    },
    onError: (err) => {
      toast.error(`Upload failed: ${err.message}`);
      setUploadingPhotos(false);
    },
  });

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploadingPhotos(true);
    const photoPromises = files.map(file => new Promise<{ fileName: string; fileData: string; mimeType: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve({ fileName: file.name, fileData: base64, mimeType: file.type });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }));
    Promise.all(photoPromises).then(photos => {
      uploadRepairPhotos.mutate({ claimId: claim.id, photos });
    }).catch(() => {
      toast.error('Failed to read photo files');
      setUploadingPhotos(false);
    });
    // Reset input
    e.target.value = '';
  }

  return (
    <tr>
      <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink)' }}>{claim.claimNumber}</td>
      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{claim.vehicleDescription || '—'}</td>
      <td>
        <span className="p11-badge green">{claim.status.replace(/_/g, ' ')}</span>
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* SR-M04: Upload repair photos */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: uploadingPhotos ? '#9CA3AF' : '#1D4ED8', background: uploadingPhotos ? '#F3F4F6' : '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 4, padding: '4px 10px', cursor: uploadingPhotos ? 'not-allowed' : 'pointer' }}>
            <Download style={{ width: 11, height: 11 }} />
            {uploadingPhotos ? 'Uploading…' : `Upload Photos${uploadedCount > 0 ? ` (${uploadedCount})` : ''}`}
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoUpload} disabled={uploadingPhotos} />
          </label>
          {/* SR-C04: Mark repair complete */}
          {openRepair ? (
            <button
              onClick={() => onMarkComplete(openRepair.id)}
              disabled={isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 600,
                color: isPending ? '#9CA3AF' : '#065F46',
                background: isPending ? '#F3F4F6' : '#D1FAE5',
                border: '1px solid #A7F3D0',
                borderRadius: 4, padding: '4px 10px', cursor: isPending ? 'not-allowed' : 'pointer'
              }}
            >
              <CheckCircle style={{ width: 11, height: 11 }} />
              {isPending ? 'Saving…' : 'Mark Complete'}
            </button>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>No open repair record</span>
          )}
        </div>
      </td>
    </tr>
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

  // SR-C04: Repairs in progress — claims in repair_assigned / repair_in_progress status
  const repairsInProgress = useMemo(() => {
    return quoteRequests.filter((c: any) =>
      ['repair_assigned', 'repair_in_progress'].includes(c.status)
    );
  }, [quoteRequests]);

  // SR-C04: Mark repair complete mutation
  const utils = trpc.useUtils();
  const markRepairComplete = trpc.repairHistory.markRepairComplete.useMutation({
    onSuccess: () => {
      toast.success("Repair marked as complete — quality score updated");
      utils.claims.myQuoteRequests.invalidate();
      utils.repairHistory.getByClaim.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // SR-C04: Per-claim repair history fetch helper — used in RepairRow
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
    <div className="min-h-screen" style={{ background: '#F7F8F6', fontFamily: 'Inter, sans-serif' }}>
      <PortalHeroBand
        portalName="Panel Beater Portal"
        title={profile?.businessName ?? 'Repair Partner Workspace'}
        subtitle="Last refreshed: just now"
        actions={[
          { label: 'Export Performance', icon: <Download className="h-3 w-3" />, primary: true },
        ]}
        kpis={[
          { label: 'Quote Requests', value: pendingRequests.length, delta: 'Awaiting response', up: null, headline: true },
          { label: 'Acceptance Rate', value: myAnalytics?.stats?.acceptanceRate != null ? `${myAnalytics.stats.acceptanceRate}%` : '—', delta: 'Approved / submitted', up: (myAnalytics?.stats?.acceptanceRate ?? 0) >= 70 },
          { label: 'Avg Variance', value: myAnalytics?.stats?.avgVariancePct != null ? `${myAnalytics.stats.avgVariancePct > 0 ? '+' : ''}${myAnalytics.stats.avgVariancePct}%` : '—', delta: 'vs KINGA estimate', up: Math.abs(myAnalytics?.stats?.avgVariancePct ?? 0) <= 5 },
          { label: 'Approved Revenue', value: fmt(totalRevenue), delta: 'This period', up: true },
        ]}
      />
      <ProtoAlertBar
        alerts={[
          { count: pendingRequests.length, label: 'pending quote request(s) awaiting your response', severity: 'amber' },
        ]}
        ctaLabel="View requests"
      />

      {/* ── BODY ── */}
      <div className="p11-body">
        <div className="p11-body-2col">
          {/* ── MAIN COLUMN ── */}
          <div>
            {/* SR-C04: Repairs In Progress */}
            {repairsInProgress.length > 0 && (
              <div className="p11-card" style={{ marginBottom: 16, border: '1px solid #D1FAE5' }}>
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <Hammer style={{ width: 14, height: 14, color: '#059669' }} />
                    <span style={{ color: '#065F46' }}>Repairs In Progress</span>
                    <span className="p11-badge green" style={{ marginLeft: 6 }}>{repairsInProgress.length}</span>
                  </div>
                </div>
                <div className="p11-card-body" style={{ padding: 0 }}>
                  <table className="p11-table">
                    <thead>
                      <tr>
                        <th>Claim #</th>
                        <th>Vehicle</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repairsInProgress.map((claim: any) => (
                        <RepairInProgressRow
                          key={claim.id}
                          claim={claim}
                          onMarkComplete={(repairHistoryId) => {
                            const today = new Date().toISOString().split('T')[0];
                            markRepairComplete.mutate({ repairHistoryId, repairDate: today });
                          }}
                          isPending={markRepairComplete.isPending}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Quote Queue */}
            <div className="p11-card" style={{ marginBottom: 16 }}>
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <FileText style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Quote Queue
                  {pendingRequests.length > 0 && (
                    <span className="p11-badge red" style={{ marginLeft: 6 }}>{pendingRequests.length}</span>
                  )}
                </div>
                <button
                  onClick={() => refetchRequests()}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--g-600)', background: 'none', border: '1px solid var(--line)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                >
                  <RefreshCw style={{ width: 11, height: 11 }} />
                  Refresh
                </button>
              </div>
              <div className="p11-card-body" style={{ padding: 0 }}>
                {requestsLoading ? (
                  <div style={{ padding: '16px 20px' }}>
                    {[1,2,3].map(i => <div key={i} style={{ height: 56, background: '#F3F4F6', borderRadius: 6, marginBottom: 8 }} />)}
                  </div>
                ) : pendingRequests.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)' }}>
                    <Wrench style={{ width: 32, height: 32, margin: '0 auto 8px', color: '#D1D5DB' }} />
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>No active quote requests</p>
                    <p style={{ fontSize: 12, marginTop: 4 }}>When claimants select you, their claims will appear here</p>
                  </div>
                ) : (
                  <table className="p11-table">
                    <thead>
                      <tr>
                        <th>Claim #</th>
                        <th>Vehicle</th>
                        <th>Status</th>
                        <th>SLA</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingRequests.map((claim: any) => (
                        <tr key={claim.id}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink)' }}>{claim.claimNumber}</td>
                          <td style={{ color: 'var(--muted)', fontSize: 12 }}>{claim.vehicleDescription || '—'}</td>
                          <td><StatusBadge status={claim.status} /></td>
                          <td><SLADeadlineChip createdAt={claim.createdAt} slaHours={48} /></td>
                          <td>
                            <button
                              onClick={() => setLocation(`/panel-beater/claims/${claim.id}`)}
                              style={{ fontSize: 11, color: 'var(--g-600)', background: 'none', border: '1px solid var(--g-300)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Quote History */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <BarChart3 style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Quote History
                </div>
              </div>
              <div className="p11-card-body" style={{ padding: 0 }}>
                {historyLoading ? (
                  <div style={{ padding: '16px 20px' }}>
                    {[1,2,3].map(i => <div key={i} style={{ height: 48, background: '#F3F4F6', borderRadius: 6, marginBottom: 8 }} />)}
                  </div>
                ) : quoteHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 20px', color: 'var(--muted)', fontSize: 13 }}>No quote history yet</div>
                ) : (
                  <table className="p11-table">
                    <thead>
                      <tr>
                        <th>Claim #</th>
                        <th>Quoted</th>
                        <th>KINGA Est.</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quoteHistory.slice(0, 10).map((q: any) => (
                        <tr key={q.id}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink)' }}>{q.claimNumber || `#${q.claimId}`}</td>
                          <td style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>R {Number(q.quotedAmount || 0).toLocaleString()}</td>
                          <td style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{q.estimatedClaimValue ? `R ${Number(q.estimatedClaimValue).toLocaleString()}` : '—'}</td>
                          <td>
                            <span className={`p11-badge ${q.status === 'approved' ? 'green' : q.status === 'rejected' ? 'red' : 'amber'}`}>
                              {q.status}
                            </span>
                          </td>
                          <td style={{ color: 'var(--muted)', fontSize: 12 }}>{q.createdAt ? new Date(q.createdAt).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* ── SIDEBAR ── */}
          <div className="p11-sidebar">
            {/* Performance Summary */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <TrendingUp style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Performance
                </div>
              </div>
              <div className="p11-card-body">
                {[
                  { label: 'Acceptance Rate', value: myAnalytics?.stats?.acceptanceRate != null ? `${myAnalytics.stats.acceptanceRate}%` : '—', cls: (myAnalytics?.stats?.acceptanceRate ?? 0) >= 70 ? 'green' : 'amber' },
                  { label: 'Avg Variance', value: myAnalytics?.stats?.avgVariancePct != null ? `${myAnalytics.stats.avgVariancePct}%` : '—', cls: Math.abs(myAnalytics?.stats?.avgVariancePct ?? 0) <= 5 ? 'green' : 'amber' },
                  { label: 'Total Quotes', value: quoteHistory.length, cls: 'muted' },
                  { label: 'Approved Revenue', value: `R ${Number(totalRevenue || 0).toLocaleString()}`, cls: 'green' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{row.label}</span>
                    <span className={`p11-badge ${row.cls}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quote Outcomes */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <BarChart3 style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Quote Outcomes
                </div>
              </div>
              <div className="p11-card-body" style={{ padding: '12px 16px' }}>
                {quoteHistory.length > 0 ? (() => {
                  const approved = quoteHistory.filter((q: any) => q.status === 'approved').length;
                  const pending = quoteHistory.filter((q: any) => ['submitted','pending','comparison'].includes(q.status)).length;
                  const rejected = quoteHistory.filter((q: any) => q.status === 'rejected').length;
                  const total = quoteHistory.length;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { label: 'Approved', count: approved, color: 'var(--g-500)' },
                        { label: 'Pending', count: pending, color: 'var(--amber)' },
                        { label: 'Rejected', count: rejected, color: 'var(--red)' },
                      ].map(item => (
                        <div key={item.label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                            <span style={{ color: 'var(--muted)' }}>{item.label}</span>
                            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{item.count}</span>
                          </div>
                          <div style={{ height: 6, background: '#F3F4F6', borderRadius: 3 }}>
                            <div style={{ height: 6, background: item.color, borderRadius: 3, width: total > 0 ? `${(item.count / total) * 100}%` : '0%' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })() : (
                  <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No data yet</div>
                )}
              </div>
            </div>

            {/* Profile Summary */}
            {profile && (
              <div className="p11-card">
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <Wrench style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                    Workshop Profile
                  </div>
                </div>
                <div className="p11-card-body">
                  {[
                    { label: 'Rating', value: (profile as any).rating ? `${Number((profile as any).rating).toFixed(1)}/5` : '—' },
                    { label: 'Avg Repair Time', value: profile.avgRepairDurationDays ? `${parseFloat(String(profile.avgRepairDurationDays)).toFixed(1)}d` : '—' },
                    { label: 'Tier', value: (profile as any).tier ?? 'Free' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{row.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
