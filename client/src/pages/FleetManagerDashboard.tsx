/**
 * FleetManagerDashboard
 *
 * Visible to fleet_manager and fleet_admin roles.
 * Shows all claims linked to the user's fleet account, with:
 *  - Time at garage (submitted → quotes received)
 *  - Time awaiting authorisation (quotes received → approved)
 *  - Total elapsed time
 *  - Current status
 *  - CSV download for in-progress and completed claims
 */
import React, { useState, useMemo } from "react";
import { SLADeadlineChip } from "@/components/portal/SLADeadlineChip";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Building2,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Filter,
  Car,
  Calendar,
  MapPin,
  FileText,
  Users,
  ShieldCheck,
  XCircle,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FleetVehicleTrackingTab } from "@/components/FleetVehicleTrackingTab";
import { PortalHeroBand, ProtoAlertBar, ProtoTabBar, ProtoCard, P } from "@/components/PortalHeroBand";
import { PortalHeader, PortalKPIStrip, PortalAlerts, type PortalKPI, type PortalAlert } from "@/components/KingaPortalShell";
import { FleetRiskAnalyticsTab } from "@/components/FleetRiskAnalyticsTab";
import { FleetIntelligenceTab } from "@/components/FleetIntelligenceTab";
import { FleetCostAnalyticsTab } from "@/components/FleetCostAnalyticsTab";
import { PredictiveAnalyticsTab } from "@/components/PredictiveAnalyticsTab";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  return `${Math.floor(ms / 60_000)}m`;
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string; style?: React.CSSProperties }> = {
    submitted: { label: "Submitted", className: "border", style: { background: "#EEF4FB", color: "#4878A8", borderColor: "#B8D0E8" } },
    in_review: { label: "In Review", className: "border", style: { background: "#FFF8E6", color: "#8A5C00", borderColor: "#E8C97A" } },
    ai_complete: { label: "KINGA Complete", className: "border", style: { background: "#E7F1EA", color: "#1C5C39", borderColor: "#A8CCB4" } },
    approved: { label: "Approved", className: "border", style: { background: "#F0F7F2", color: "#3C7844", borderColor: "#C8E0CE" } },
    rejected: { label: "Rejected", className: "border", style: { background: "#FDF0F0", color: "#A32D2D", borderColor: "#E8B8B8" } },
    completed: { label: "Completed", className: "bg-slate-100 text-slate-700 border-slate-200" },
    pending: { label: "Pending", className: "bg-gray-100 text-gray-600 border-gray-200" },
  };
  const s = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <Badge variant="outline" className={`text-xs ${s.className}`}>
      {s.label}
    </Badge>
  );
}

function downloadCSV(rows: FleetClaim[], filename: string) {
  const headers = [
    "Claim Number",
    "Vehicle",
    "Registration",
    "Incident Date",
    "Location",
    "Status",
    "Submitted By",
    "Submitted At",
    "Time at Garage (hrs)",
    "Time Awaiting Auth (hrs)",
    "Total Elapsed (hrs)",
    "Branch / Department",
  ];
  const now = Date.now();
  const lines = rows.map((c) => {
    const submittedAt = c.createdAt ? new Date(c.createdAt).getTime() : 0;
    const totalMs = submittedAt ? now - submittedAt : 0;
    return [
      c.claimNumber,
      `${c.vehicleMake} ${c.vehicleModel} ${c.vehicleYear}`,
      c.vehicleRegistration,
      c.incidentDate ? new Date(c.incidentDate).toLocaleDateString() : "",
      c.incidentLocation ?? "",
      c.status,
      c.submittedByName ?? "",
      c.createdAt ? new Date(c.createdAt).toLocaleString() : "",
      (totalMs / 3_600_000).toFixed(1),
      "—",
      (totalMs / 3_600_000).toFixed(1),
      c.claimantDepartment ?? "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface FleetClaim {
  id: number;
  claimNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleRegistration: string;
  incidentDate: string | null;
  incidentLocation: string | null;
  status: string;
  createdAt: string | null;
  submittedByName: string | null;
  claimantDepartment: string | null;
  fleetVehicleRef: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FleetManagerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tab, setTab] = useState("active");
  const [mainTab, setMainTab] = useState("claims");
  // Flag for review state
  const [flagDialogClaimId, setFlagDialogClaimId] = useState<number | null>(null);
  const [flagDialogClaimNumber, setFlagDialogClaimNumber] = useState<string>("");
  const [flagReason, setFlagReason] = useState("");
  const flagMutation = trpc.fleetAccounts.flagClaimForReview.useMutation({
    onSuccess: (data) => {
      toast({ title: "Flagged for review", description: `Claim ${data.claimNumber} has been flagged. The Claims Manager has been notified.` });
      setFlagDialogClaimId(null);
      setFlagReason("");
    },
    onError: (err) => {
      toast({ title: "Flag failed", description: err.message, variant: "destructive" });
    },
  });

  // Check registration status first (for pending-approval gate)
  const { data: regStatus, isLoading: regLoading } =
    trpc.fleetAccounts.getMyRegistrationStatus.useQuery(undefined);

  // Fetch fleet account info
  const { data: fleetAccounts, isLoading: accountsLoading } =
    trpc.fleetAccounts.listMyAccounts.useQuery({});

  const primaryAccount = (fleetAccounts as any)?.[0];

  // Fetch all claims for the fleet account
  const { data: claimsData, isLoading: claimsLoading } =
    trpc.fleetAccounts.getClaimsForAccount.useQuery(
      { accountId: primaryAccount?.id ?? 0 },
      { enabled: !!primaryAccount?.id }
    );

  const allClaims: FleetClaim[] = (claimsData?.claims ?? []) as unknown as FleetClaim[];

  // H-03: Fraud-flagged vehicles in this fleet
  const { data: fraudFlaggedVehicles = [] } = trpc.fleetAccounts.getFraudFlaggedVehicles.useQuery(
    {},
    { enabled: !!primaryAccount?.id }
  );

  const activeClaims = useMemo(
    () =>
      allClaims.filter((c) =>
        ["submitted", "in_review", "ai_complete"].includes(c.status)
      ),
    [allClaims]
  );

  const completedClaims = useMemo(
    () =>
      allClaims.filter((c) =>
        ["approved", "rejected", "completed"].includes(c.status)
      ),
    [allClaims]
  );

  const displayClaims = (tab === "active" ? activeClaims : completedClaims).filter((c) => {
    const matchesSearch =
      !search ||
      c.claimNumber.toLowerCase().includes(search.toLowerCase()) ||
      c.vehicleRegistration.toLowerCase().includes(search.toLowerCase()) ||
      `${c.vehicleMake} ${c.vehicleModel}`.toLowerCase().includes(search.toLowerCase()) ||
      (c.submittedByName ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const now = Date.now();

  if (accountsLoading || regLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Pending approval gate
  if (regStatus?.status === "pending") {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <div className="text-center py-12 space-y-5">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: "#FFF8E6" }}>
            <Clock className="h-8 w-8" style={{ color: "#8A5C00" }} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Awaiting Approval</h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Your fleet manager registration for <strong>{regStatus.request?.companyName}</strong> is pending review by a claims manager.
            </p>
          </div>
          <div className="rounded-lg p-4 text-left space-y-2 border" style={{ background: "#FFF8E6", borderColor: "#E8C97A" }}>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Request submitted {regStatus.request?.createdAt ? new Date(regStatus.request.createdAt).toLocaleDateString() : ""}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">Once approved, you will have full access to the fleet dashboard, vehicle tracking, and risk analytics.</p>
          </div>
        </div>
      </div>
    );
  }

  // Rejected gate
  if (regStatus?.status === "rejected") {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <div className="text-center py-12 space-y-5">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: "#FDF0F0" }}>
            <XCircle className="h-8 w-8" style={{ color: "#A32D2D" }} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Registration Rejected</h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Your fleet manager registration was not approved.
            </p>
          </div>
          {regStatus.request?.reviewNotes && (
            <div className="rounded-lg p-4 text-left border" style={{ background: "#FDF0F0", borderColor: "#E8B8B8" }}>
              <p className="text-xs text-red-700 dark:text-red-400"><span className="font-medium">Reason: </span>{regStatus.request.reviewNotes}</p>
            </div>
          )}
          <Button
            style={{ background: "#3C7844" }}
            onClick={() => (window.location.href = "/claimant/fleet-register")}
          >
            <Building2 className="mr-2 h-4 w-4" />
            Re-apply
          </Button>
        </div>
      </div>
    );
  }

  // No fleet account yet — show registration prompt
  if (!primaryAccount) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="text-center py-16 space-y-4">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <h2 className="text-xl font-semibold">No Fleet Account Found</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            You don't have a fleet account yet. To manage your company's vehicle claims, register as a fleet manager.
          </p>
          <Button
            style={{ background: "#3C7844" }}
            onClick={() => (window.location.href = "/claimant/fleet-register")}
          >
            <Building2 className="mr-2 h-4 w-4" />
            Register Fleet Account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--body-bg)', fontFamily: 'Inter, sans-serif', minHeight: '100vh' }}>
         {/* ── IDENTITY STRIP ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', background:'#FFFFFF', borderBottom:'1px solid #E7E2D6', position:'sticky', top:0, zIndex:100, height:'52px', fontFamily:'Inter, sans-serif' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style={{ height:28, width:'auto', objectFit:'contain', flexShrink:0 }} />
          <div style={{ width:1, height:22, background:'#C8C4BA' }} />
          <span style={{ fontSize:13, fontWeight:600, color:'#15201A', letterSpacing:'-0.01em' }}>Fleet Manager</span>
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
            <div className="p11-breadcrumb">KINGA · Fleet Manager</div>
            <div className="p11-hero-title">Fleet Management Overview</div>
            <div className="p11-hero-subtitle">
              {primaryAccount ? primaryAccount.accountName : 'Loading fleet account…'}
            </div>
          </div>
          <div className="p11-hero-actions">
            <button className="p11-btn-ghost" onClick={() => setMainTab('vehicles')}>
              <Car style={{ width: 13, height: 13 }} />
              Vehicle Tracking
            </button>
            <button className="p11-btn-gold">
              <Download style={{ width: 13, height: 13 }} />
              Export Report
            </button>
          </div>
        </div>
        <div className="p11-kpi-grid">
          <div className="p11-kpi-tile headline">
            <div className="p11-kpi-label">Active Claims</div>
            <div className="p11-kpi-value num">{activeClaims.length}</div>
            <div className="p11-kpi-delta">In progress</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Completed</div>
            <div className="p11-kpi-value num">{completedClaims.length}</div>
            <div className="p11-kpi-delta">Resolved claims</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">SLA Breached</div>
            <div className="p11-kpi-value num">{allClaims.filter(c => { const ms = c.createdAt ? now - new Date(c.createdAt).getTime() : 0; return ms > 72 * 3600000 && ['submitted','in_review','ai_complete'].includes(c.status); }).length}</div>
            <div className="p11-kpi-delta down">&gt;72h outstanding</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Total Claims</div>
            <div className="p11-kpi-value num">{allClaims.length}</div>
            <div className="p11-kpi-delta">All time</div>
          </div>
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <nav className="p11-tab-bar">
        {[
          { id: 'claims', label: 'Claims', count: allClaims.length, countClass: '' },
          { id: 'vehicles', label: 'Vehicle Tracking', count: 0, countClass: '' },
          { id: 'risk', label: 'Risk Analytics', count: 0, countClass: '' },
          { id: 'cost', label: '💰 Cost Analytics', count: 0, countClass: '' },
          { id: 'intelligence', label: '🛡 Fleet Intelligence', count: 0, countClass: '' },
          { id: 'predictive', label: '📈 Predictive Analytics', count: 0, countClass: '' },
        ].map(t => (
          <div
            key={t.id}
            className={`p11-tab-item${mainTab === t.id ? ' active' : ''}`}
            onClick={() => setMainTab(t.id)}
          >
            {t.label}
            {t.count > 0 && <span className="p11-tab-badge">{t.count}</span>}
          </div>
        ))}
      </nav>

      {/* ── ALERT BAR ── */}
      {(allClaims.filter(c => { const ms = c.createdAt ? now - new Date(c.createdAt).getTime() : 0; return ms > 72 * 3600000 && ['submitted','in_review','ai_complete'].includes(c.status); }).length > 0 || (fraudFlaggedVehicles as any[]).length > 0) && (
        <div className="p11-alert-bar">
          {allClaims.filter(c => { const ms = c.createdAt ? now - new Date(c.createdAt).getTime() : 0; return ms > 72 * 3600000 && ['submitted','in_review','ai_complete'].includes(c.status); }).length > 0 && (
            <div className="p11-alert-item red">
              <span className="p11-alert-count">{allClaims.filter(c => { const ms = c.createdAt ? now - new Date(c.createdAt).getTime() : 0; return ms > 72 * 3600000 && ['submitted','in_review','ai_complete'].includes(c.status); }).length}</span>
              <span>claim(s) have exceeded 72-hour SLA — escalation required</span>
            </div>
          )}
          {/* H-03: Fraud flagged vehicles alert */}
          {(fraudFlaggedVehicles as any[]).length > 0 && (
            <div className="p11-alert-item" style={{ background: '#FFF3CD', borderColor: '#E8C97A', color: '#7A4F00' }}>
              <span className="p11-alert-count" style={{ background: '#E8A000', color: '#fff' }}>{(fraudFlaggedVehicles as any[]).length}</span>
              <span>vehicle claim(s) have active KINGA fraud flags — review recommended</span>
            </div>
          )}
        </div>
      )}

      {/* ── BODY ── */}
      <div className="p11-body">
        {mainTab === 'vehicles' && (
          <FleetVehicleTrackingTab claims={allClaims} />
        )}
        {mainTab === 'risk' && (
          <FleetRiskAnalyticsTab claims={allClaims} accountName={primaryAccount?.accountName ?? ''} />
        )}
        {mainTab === 'cost' && (
          <FleetCostAnalyticsTab />
        )}
        {mainTab === 'intelligence' && (
          <div className="p-6">
            <FleetIntelligenceTab />
          </div>
        )}
        {mainTab === 'predictive' && (
          <div className="p-6">
            <PredictiveAnalyticsTab />
          </div>
        )}
        {mainTab === 'claims' && (
          <div className="p11-body-2col">
            {/* ── MAIN COLUMN ── */}
            <div>
              <div className="p11-card">
                {/* Filter bar */}
                <div className="p11-filter-bar">
                  <div className="p11-search-wrap">
                    <Search className="p11-search-icon" style={{ width: 14, height: 14 }} />
                    <input
                      className="p11-search-input"
                      placeholder="Search claims, vehicles, staff…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  <select
                    className="p11-select"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="submitted">Submitted</option>
                    <option value="in_review">In Review</option>
                    <option value="ai_complete">KINGA Complete</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="completed">Completed</option>
                  </select>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={`p11-tab-item${tab === 'active' ? ' active' : ''}`}
                      style={{ padding: '4px 12px', fontSize: 12, borderRadius: 4 }}
                      onClick={() => setTab('active')}
                    >
                      Active ({activeClaims.length})
                    </button>
                    <button
                      className={`p11-tab-item${tab === 'completed' ? ' active' : ''}`}
                      style={{ padding: '4px 12px', fontSize: 12, borderRadius: 4 }}
                      onClick={() => setTab('completed')}
                    >
                      Completed ({completedClaims.length})
                    </button>
                  </div>
                </div>

                {claimsLoading ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                    <Loader2 style={{ width: 24, height: 24, margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
                    Loading claims…
                  </div>
                ) : displayClaims.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                    <FileText style={{ width: 32, height: 32, margin: '0 auto 8px', opacity: 0.3 }} />
                    <div>No {tab} claims found</div>
                    {search && <div style={{ fontSize: 12, marginTop: 4 }}>Try clearing the search filter</div>}
                  </div>
                ) : (
                  <div className="p11-table-wrap">
                    <table className="p11-table">
                      <thead>
                        <tr>
                          <th>Claim #</th>
                          <th>Vehicle</th>
                          <th>Registration</th>
                          <th>Status</th>
                          <th>SLA</th>
                          <th>Submitted By</th>
                          <th>Elapsed</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayClaims.map((c) => {
                          const submittedAt = c.createdAt ? new Date(c.createdAt).getTime() : 0;
                          const elapsedMs = submittedAt ? now - submittedAt : 0;
                          const isLong = elapsedMs > 72 * 3_600_000;
                          const elapsedHours = Math.floor(elapsedMs / 3_600_000);
                          const elapsedLabel = elapsedHours < 24
                            ? `${elapsedHours}h`
                            : `${Math.floor(elapsedHours / 24)}d ${elapsedHours % 24}h`;
                          return (
                            <tr key={c.id} style={isLong ? { background: 'rgba(239,68,68,0.04)' } : {}}>
                              <td><span className="p11-id-mono">{c.claimNumber}</span></td>
                              <td style={{ fontSize: 12 }}>{c.vehicleMake} {c.vehicleModel}</td>
                              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{c.vehicleRegistration}</td>
                              <td>
                                <span className={`p11-badge ${c.status === 'approved' || c.status === 'completed' ? 'green' : c.status === 'rejected' ? 'red' : 'muted'}`}>
                                  {c.status.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td><SLADeadlineChip createdAt={c.createdAt ?? undefined} /></td>
                              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{c.submittedByName ?? '—'}</td>
                              <td>
                                <span style={{ fontSize: 12, color: isLong ? 'var(--red)' : 'var(--muted)', fontWeight: isLong ? 600 : 400 }}>
                                  {elapsedLabel}
                                </span>
                              </td>
                              <td>
                                <button
                                  className="p11-btn-outline"
                                  style={{ padding: '3px 8px', fontSize: 11, color: 'var(--red)', borderColor: 'var(--red)' }}
                                  onClick={() => { setFlagDialogClaimId(c.id); setFlagDialogClaimNumber(c.claimNumber); }}
                                >
                                  <AlertCircle style={{ width: 10, height: 10 }} /> Flag
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#8A5C00' }} />
                  Elapsed &gt;24h — monitor
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} />
                  Elapsed &gt;72h — escalate
                </div>
              </div>
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
                    <div className="p11-card-subtitle">SLA breaches & flagged claims</div>
                  </div>
                </div>
                <div className="p11-card-body">
                  {allClaims.filter(c => { const ms = c.createdAt ? now - new Date(c.createdAt).getTime() : 0; return ms > 72 * 3600000 && ['submitted','in_review','ai_complete'].includes(c.status); }).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)' }}>
                      <CheckCircle2 style={{ width: 24, height: 24, margin: '0 auto 6px', color: 'var(--g-500)' }} />
                      <div style={{ fontSize: 12 }}>All claims within SLA</div>
                    </div>
                  ) : (
                    allClaims.filter(c => { const ms = c.createdAt ? now - new Date(c.createdAt).getTime() : 0; return ms > 72 * 3600000 && ['submitted','in_review','ai_complete'].includes(c.status); }).slice(0, 5).map((c) => (
                      <div key={c.id} className="p11-attention-item">
                        <div className="p11-attention-dot red" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }} className="p11-id-mono">{c.claimNumber}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.vehicleRegistration}</div>
                        </div>
                        <button className="p11-btn-outline" style={{ padding: '3px 7px', fontSize: 10 }}
                          onClick={() => { setFlagDialogClaimId(c.id); setFlagDialogClaimNumber(c.claimNumber); }}>
                          Flag
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Fleet Summary */}
              <div className="p11-card">
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <BarChart3 style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                    Fleet Summary
                  </div>
                </div>
                <div className="p11-card-body">
                  {[
                    { label: 'Submitted', value: allClaims.filter(c => c.status === 'submitted').length, cls: 'muted' },
                    { label: 'In Review', value: allClaims.filter(c => c.status === 'in_review').length, cls: 'amber' },
                    { label: 'KINGA Complete', value: allClaims.filter(c => c.status === 'ai_complete').length, cls: 'green' },
                    { label: 'Approved', value: allClaims.filter(c => c.status === 'approved').length, cls: 'green' },
                    { label: 'Rejected', value: allClaims.filter(c => c.status === 'rejected').length, cls: 'red' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                      <span className={`p11-badge ${row.cls}`}>{row.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

            {/* Flag for Review Dialog */}
      <Dialog open={flagDialogClaimId !== null} onOpenChange={(open) => { if (!open) { setFlagDialogClaimId(null); setFlagReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              Flag Claim for Review
            </DialogTitle>
            <DialogDescription>
              Flagging <span className="font-mono font-semibold">{flagDialogClaimNumber}</span> will notify the Claims Manager to review this claim. This does not change the claim's status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">Reason for flagging</label>
            <Textarea
              placeholder="Describe the concern (e.g. repair taking too long, incorrect vehicle listed, suspected fraud)..."
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">{flagReason.length}/500 characters (minimum 10)</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFlagDialogClaimId(null); setFlagReason(""); }}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={flagReason.length < 10 || flagReason.length > 500 || flagMutation.isPending}
              onClick={() => {
                if (flagDialogClaimId !== null) {
                  flagMutation.mutate({ claimId: flagDialogClaimId, reason: flagReason });
                }
              }}
            >
              {flagMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <AlertCircle className="h-4 w-4 mr-2" />}
              Flag for Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
