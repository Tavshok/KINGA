import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileText, Clock, CheckCircle, Plus, ChevronRight, AlertCircle,
  Car, MapPin, Calendar, RefreshCw, Shield, FileCheck, Banknote,
  Wrench, Eye, ArrowRight, Search, X, Building2, ChevronDown, ThumbsUp, MessageSquareWarning, BarChart3,
  Loader2, BarChart2, Upload
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import KingaLogo from "@/components/KingaLogo";
import { NotificationBell } from "@/components/NotificationBell";
import RoleSwitcher from "@/components/RoleSwitcher";
import { PortalHeroBand, ProtoAlertBar, ProtoTabBar, ProtoCard, P } from "@/components/PortalHeroBand";
import { PortalHeader, PortalKPIStrip, PortalAlerts, PortalTabBar, type PortalKPI, type PortalAlert, type PortalTab } from "@/components/KingaPortalShell";

// Claim status → step index (0-based, 5 steps total)
const STATUS_STEPS: Record<string, number> = {
  submitted: 0,
  intake_pending: 0,
  triage: 1,
  assessment_pending: 1,
  assessment_in_progress: 2,
  assessment_complete: 2,
  quotes_pending: 2,
  comparison: 3,
  repair_assigned: 3,
  repair_in_progress: 3,
  financial_decision: 3,
  completed: 4,
  closed: 4,
  rejected: 4,
};

const STEPS = [
  { label: "Submitted", icon: FileText, description: "Claim received" },
  { label: "Under Review", icon: Shield, description: "Triage & policy check" },
  { label: "Assessment", icon: FileCheck, description: "KINGA & assessor review" },
  { label: "Decision", icon: Banknote, description: "Approval & quotes" },
  { label: "Resolved", icon: CheckCircle, description: "Completed or closed" },
];

function ClaimStatusTracker({ status }: { status: string }) {
  const currentStep = STATUS_STEPS[status] ?? 0;
  const isRejected = status === "rejected";

  return (
    <div className="w-full">
      <div className="flex items-center justify-between relative">
        {/* Progress line */}
        <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200 z-0" />
        <div
          className="absolute top-4 left-0 h-0.5 z-0 transition-all duration-500"
          style={{ background: "#3C7844", width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
        />

        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const done = idx < currentStep;
          const active = idx === currentStep;
          const rejected = isRejected && idx === currentStep;

          return (
            <div key={idx} className="flex flex-col items-center z-10 flex-1">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${
                  rejected
                    ? "border" /* rejected */
                    : done
                    ? "text-white" /* done */
                    : active
                    ? "bg-white" /* active */
                    : "bg-white border-gray-300 text-gray-400"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <p className={`text-xs mt-1 font-medium hidden sm:block ${
                rejected ? "text-red-600" : active || done ? "text-gray-900" : "text-gray-400"
              }`}>
                {step.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; style?: React.CSSProperties }> = {
    submitted: { label: "Submitted", className: "border", style: { background: "#EEF4FB", color: "#4878A8", borderColor: "#B8D0E8" } },
    intake_pending: { label: "Intake Pending", className: "border", style: { background: "#EEF4FB", color: "#4878A8", borderColor: "#B8D0E8" } },
    triage: { label: "Under Triage", className: "border", style: { background: "#FFF8E6", color: "#8A5C00", borderColor: "#E8C97A" } },
    assessment_pending: { label: "Assessment Pending", className: "border", style: { background: "#F0F0FA", color: "#4878A8", borderColor: "#B8D0E8" } },
    assessment_in_progress: { label: "Being Assessed", className: "border", style: { background: "#F0F0FA", color: "#4878A8", borderColor: "#B8D0E8" } },
    assessment_complete: { label: "Assessment Done", className: "border", style: { background: "#EEF4FB", color: "#4878A8", borderColor: "#B8D0E8" } },
    quotes_pending: { label: "Awaiting Quotes", className: "border", style: { background: "#FFF8E6", color: "#8A5C00", borderColor: "#E8C97A" } },
    comparison: { label: "Quote Comparison", className: "border", style: { background: "#FFF8E6", color: "#8A5C00", borderColor: "#E8C97A" } },
    repair_assigned: { label: "Repair Assigned", className: "border", style: { background: "#F0F7F2", color: "#3C7844", borderColor: "#C8E0CE" } },
    repair_in_progress: { label: "Repair In Progress", className: "border", style: { background: "#F0F7F2", color: "#3C7844", borderColor: "#C8E0CE" } },
    financial_decision: { label: "Financial Decision", className: "border", style: { background: "#FFF8E6", color: "#8A5C00", borderColor: "#E8C97A" } },
    completed: { label: "Completed", className: "border", style: { background: "#F0F7F2", color: "#3C7844", borderColor: "#C8E0CE" } },
    closed: { label: "Closed", className: "bg-gray-100 text-gray-800" },
    rejected: { label: "Rejected", className: "border", style: { background: "#FDF0F0", color: "#A32D2D", borderColor: "#E8B8B8" } },
  };
  const s = map[status] || { label: status.replace(/_/g, " "), className: "bg-gray-100 text-gray-800" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.className}`} style={s.style}>
      {s.label}
    </span>
  );
}

export default function ClaimantDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [expandedClaim, setExpandedClaim] = useState<number | null>(null);
  const [fleetBannerOpen, setFleetBannerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("my-claims");
  const [settlementDialog, setSettlementDialog] = useState<{ claimId: number; claimNumber: string } | null>(null);
  const [disputeDialog, setDisputeDialog] = useState<{ claimId: number; claimNumber: string } | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const { toast } = useToast();

  // Check if user already has a fleet registration — hides the banner once registered
  const { data: fleetRegStatus } = trpc.fleetAccounts.getMyRegistrationStatus.useQuery(
    undefined,
    { retry: false }
  );
  const showFleetBanner = !fleetRegStatus || fleetRegStatus.status === null;

  // Real data
  const { data: myClaims = [], isLoading, refetch } = trpc.claims.myClaims.useQuery();

  // Claimant action mutations
  const acceptSettlementMutation = trpc.claims.acceptSettlement.useMutation({
    onSuccess: () => {
      toast({ title: "Settlement accepted", description: "Your claim has been closed. Thank you." });
      setSettlementDialog(null);
      refetch();
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const initiateDisputeMutation = trpc.claims.initiateDispute.useMutation({
    onSuccess: () => {
      toast({ title: "Dispute submitted", description: "Your dispute has been registered and will be reviewed." });
      setDisputeDialog(null);
      setDisputeReason("");
      refetch();
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const searchTimeout = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimeout[0]) clearTimeout(searchTimeout[0]);
    const t = setTimeout(() => setDebouncedQuery(val.trim()), 400);
    searchTimeout[1](t);
  };
  const { data: searchResults = [], isFetching: searchLoading } = trpc.claims.searchByIdentifier.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );
  const isSearchActive = debouncedQuery.length >= 2;

  // Stats
  const activeClaims = myClaims.filter((c: any) =>
    !["completed", "closed", "rejected"].includes(c.status)
  );
  const completedClaims = myClaims.filter((c: any) =>
    ["completed", "closed"].includes(c.status)
  );
  const rejectedClaims = myClaims.filter((c: any) => c.status === "rejected");

  const avgResolutionDays = completedClaims.length > 0
    ? Math.round(
        completedClaims.reduce((sum: number, c: any) => {
          const created = new Date(c.createdAt).getTime();
          const updated = new Date(c.updatedAt).getTime();
          return sum + (updated - created) / (1000 * 60 * 60 * 24);
        }, 0) / completedClaims.length
      )
    : null;

  // C3 — PortalAlerts: derive from existing claim data
  const settlementReadyClaims = myClaims.filter((c: any) =>
    c.workflowState === "payment_authorized" || c.workflowState === "financial_decision"
  );
  const claimantAlerts: PortalAlert[] = [
    {
      id: "settlement-ready",
      severity: "critical",
      label: "settlement offer(s) awaiting your response",
      count: settlementReadyClaims.length,
      onClick: () => setActiveTab("my-claims"),
    },
    {
      id: "rejected",
      severity: "warning",
      label: "rejected claim(s) — review outcome",
      count: rejectedClaims.length,
      onClick: () => setActiveTab("my-claims"),
    },
  ];

  // C4 — PortalTabBar tabs
  // Quotations & Policies data (for the new tabs)
  const { data: myQuotations = [], isLoading: quotationsLoading } = trpc.insurance.getMyQuotes.useQuery();
  const { data: myPolicies = [], isLoading: policiesLoading } = trpc.insurance.getMyPolicies.useQuery();
  const renewalMutation = trpc.agency.requestRenewal.useMutation({
    onSuccess: () => toast({ title: "Renewal requested", description: "Your renewal request has been submitted." }),
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });
  const activePolicies = (myPolicies as any[]).filter((p: any) => p.status === "active");

  const claimantTabs: PortalTab[] = [
    { id: "my-claims", label: "My Claims", badge: activeClaims.length > 0 ? activeClaims.length : undefined },
    { id: "completed", label: "Completed", badge: completedClaims.length > 0 ? completedClaims.length : undefined },
    { id: "quotations", label: "Quotations", badge: (myQuotations as any[]).length > 0 ? (myQuotations as any[]).length : undefined },
    { id: "policies", label: "Policies", badge: activePolicies.length > 0 ? activePolicies.length : undefined },
    { id: "valuations", label: "Valuations" },
    { id: "quick-actions", label: "Quick Actions" },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#F7F8F6', fontFamily: 'Inter, sans-serif' }}>
      <PortalHeroBand
        portalName="My Claims Portal"
        title={`Welcome back, ${user?.name?.split(' ')[0] || 'there'}`}
        subtitle={activeClaims.length > 0 ? `${activeClaims.length} active claim${activeClaims.length > 1 ? 's' : ''} in progress` : 'No active claims — submit a new claim to get started'}
        actions={[
          { label: 'Submit New Claim', icon: <Plus className="h-3 w-3" />, onClick: () => setLocation('/claimant/submit-claim'), primary: true },
        ]}
        kpis={[
          { label: 'Total Claims', value: myClaims.length, delta: 'All time', up: null, headline: true },
          { label: 'Active', value: activeClaims.length, delta: 'In progress', up: null },
          { label: 'Completed', value: completedClaims.length, delta: 'Resolved', up: true },
          { label: 'Avg Resolution', value: avgResolutionDays !== null ? `${avgResolutionDays}d` : '—', delta: 'Days to resolve', up: avgResolutionDays !== null && avgResolutionDays <= 14 },
        ]}
      />
      <ProtoAlertBar alerts={claimantAlerts.map((a: any) => ({ count: a.count, label: a.label, severity: a.severity === 'critical' ? 'red' : 'amber' }))} ctaLabel="View alerts" />
      <ProtoTabBar tabs={claimantTabs.map((t: any) => ({ id: t.id, label: t.label, badge: t.badge }))} activeTab={activeTab} onTabChange={setActiveTab} />
      {/* ── BODY ── */}
      <div className="p11-body">
        <div className="p11-body-2col">
          {/* ── MAIN COLUMN ── */}
          <div>
            {/* ── QUOTATIONS TAB ── */}
            {activeTab === "quotations" && (
              <div className="p11-card">
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <FileText style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                    My Quotation Requests
                    {(myQuotations as any[]).length > 0 && <span className="p11-badge amber" style={{ marginLeft: 6 }}>{(myQuotations as any[]).length}</span>}
                  </div>
                </div>
                <div className="p11-card-body" style={{ padding: 0 }}>
                  {quotationsLoading ? (
                    <div style={{ padding: '24px', display: 'flex', justifyContent: 'center' }}><Loader2 style={{ width: 24, height: 24, color: 'var(--g-600)' }} /></div>
                  ) : (myQuotations as any[]).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)' }}>
                      <FileText style={{ width: 32, height: 32, margin: '0 auto 8px', color: '#D1D5DB' }} />
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>No quotation requests</p>
                      <p style={{ fontSize: 12, marginTop: 4 }}>Start a secure insurance request here in My Portal.</p>
                      <Button size="sm" className="mt-3" onClick={() => setLocation('/insurance/quote')}><Plus className="mr-1 h-3.5 w-3.5" /> Request Insurance Quote</Button>
                    </div>
                  ) : (
                    <table className="p11-table">
                      <thead><tr><th>Request #</th><th>Vehicle</th><th>Cover Type</th><th>Status</th><th>Premium</th><th>Submitted</th></tr></thead>
                      <tbody>
                        {(myQuotations as any[]).map((q: any) => (
                          <tr key={q.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{q.requestNumber}</td>
                            <td style={{ color: 'var(--muted)', fontSize: 12 }}>{[q.vehicleYear, q.vehicleMake, q.vehicleModel].filter(Boolean).join(' ')}{q.vehicleRegistration ? ` (${q.vehicleRegistration})` : ''}</td>
                            <td style={{ color: 'var(--muted)', fontSize: 12 }}>{q.insuranceType?.replace(/_/g, ' ')}</td>
                            <td><StatusBadge status={q.status} /></td>
                            <td style={{ fontWeight: 600, color: q.quotedPremium ? 'var(--g-600)' : 'var(--muted)', fontSize: 12 }}>{q.quotedPremium ? `$${Number(q.quotedPremium).toFixed(2)}/mo` : 'Awaiting quote'}</td>
                            <td style={{ color: 'var(--muted)', fontSize: 12 }}>{q.createdAt ? new Date(q.createdAt).toLocaleDateString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* ── POLICIES TAB ── */}
            {activeTab === "policies" && (
              <div className="p11-card">
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <Shield style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                    My Insurance Policies
                    {activePolicies.length > 0 && <span className="p11-badge green" style={{ marginLeft: 6 }}>{activePolicies.length} active</span>}
                  </div>
                </div>
                <div className="p11-card-body" style={{ padding: 0 }}>
                  {policiesLoading ? (
                    <div style={{ padding: '24px', display: 'flex', justifyContent: 'center' }}><Loader2 style={{ width: 24, height: 24, color: 'var(--g-600)' }} /></div>
                  ) : (myPolicies as any[]).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)' }}>
                      <Shield style={{ width: 32, height: 32, margin: '0 auto 8px', color: '#D1D5DB' }} />
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>No insurance policies</p>
                      <p style={{ fontSize: 12, marginTop: 4 }}>Submit a quotation request to get your first policy</p>
                    </div>
                  ) : (
                    <table className="p11-table">
                      <thead><tr><th>Policy #</th><th>Status</th><th>Premium</th><th>Coverage Start</th><th>Coverage End</th><th>Action</th></tr></thead>
                      <tbody>
                        {(myPolicies as any[]).map((p: any) => (
                          <tr key={p.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.policyNumber}</td>
                            <td><StatusBadge status={p.status} /></td>
                            <td style={{ fontWeight: 600, color: 'var(--g-600)', fontSize: 12 }}>${Number(p.premiumAmount).toFixed(2)}/{p.premiumFrequency}</td>
                            <td style={{ color: 'var(--muted)', fontSize: 12 }}>{p.coverageStartDate ? new Date(p.coverageStartDate).toLocaleDateString() : '—'}</td>
                            <td style={{ color: 'var(--muted)', fontSize: 12 }}>{p.coverageEndDate ? new Date(p.coverageEndDate).toLocaleDateString() : '—'}</td>
                            <td>{p.status === 'active' && <button onClick={() => renewalMutation.mutate({ policyId: p.id })} disabled={renewalMutation.isPending} style={{ fontSize: 11, color: 'var(--g-600)', background: 'none', border: '1px solid var(--g-300)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}><RefreshCw style={{ width: 10, height: 10, display: 'inline', marginRight: 3 }} />Renew</button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Valuations Tab */}
            {activeTab === "valuations" && (
              <div className="space-y-4 mt-4">
                {/* Header */}
                <div style={{ background: 'linear-gradient(135deg, #0A2218 0%, #0D3B2A 100%)', borderRadius: 10, padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Car size={18} style={{ color: '#34D399' }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#F9FAFB' }}>Vehicle Valuation Services</p>
                      <p style={{ fontSize: 12, color: '#9CA3AF' }}>Request a KINGA-powered vehicle valuation report</p>
                    </div>
                  </div>
                </div>

                {/* Single Vehicle Valuation */}
                <div className="p11-card">
                  <div className="p11-card-header">
                    <div className="p11-card-title">
                      <Car style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                      Single Vehicle Valuation
                    </div>
                  </div>
                  <div className="p11-card-body">
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.6 }}>
                      Request a valuation for your vehicle. A KINGA report will be generated using photo forensics, 
                      market data, and condition assessment. A teaser report is available immediately; the full report 
                      is unlocked when a policy is issued or via a standalone $25 payment.
                    </p>
                    <button
                      className="p11-btn-gold"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => setLocation('/client/valuation')}
                    >
                      <Car style={{ width: 13, height: 13 }} />
                      Request Vehicle Valuation
                    </button>
                  </div>
                </div>

                {/* Bulk CSV Valuation */}
                <div className="p11-card">
                  <div className="p11-card-header">
                    <div className="p11-card-title">
                      <BarChart2 style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                      Bulk Fleet Valuation
                      <span className="p11-badge amber" style={{ marginLeft: 6 }}>CSV Upload</span>
                    </div>
                  </div>
                  <div className="p11-card-body">
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.6 }}>
                      Have multiple vehicles to value? Upload a CSV file with your fleet details and receive 
                      a batch valuation report. Ideal for fleet managers and car dealers.
                    </p>
                    <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '12px 14px', marginBottom: 14, border: '1px dashed #D1D5DB' }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>CSV Format Required</p>
                      <code style={{ fontSize: 11, color: '#6B7280', display: 'block', lineHeight: 1.8 }}>
                        make, model, year, registration_number, condition, mileage
                      </code>
                    </div>
                    <button
                      className="p11-btn-outline"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => setLocation('/client/valuation/bulk')}
                    >
                      <Upload style={{ width: 13, height: 13 }} />
                      Upload CSV for Bulk Valuation
                    </button>
                  </div>
                </div>

                {/* Valuation Policy Note */}
                <div style={{ background: '#FFF7ED', borderRadius: 8, padding: '12px 14px', border: '1px solid #FED7AA' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#C2410C', marginBottom: 4 }}>Valuation Report Access</p>
                  <p style={{ fontSize: 11, color: '#EA580C', lineHeight: 1.6 }}>
                    A teaser valuation is available immediately. The full detailed report is unlocked automatically 
                    when a motor insurance policy is issued through KINGA, or can be purchased as a standalone 
                    report for $25.
                  </p>
                </div>
              </div>
            )}


            {/* Claims Table — shown on my-claims, completed, and quick-actions tabs */}
            {(activeTab === "my-claims" || activeTab === "completed" || activeTab === "quick-actions") && (
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <FileText style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  My Claims
                  {activeClaims.length > 0 && (
                    <span className="p11-badge amber" style={{ marginLeft: 6 }}>{activeClaims.length} active</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => refetch()}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--g-600)', background: 'none', border: '1px solid var(--line)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                  >
                    <RefreshCw style={{ width: 11, height: 11 }} />
                    Refresh
                  </button>
                  <button
                    onClick={() => setLocation("/claimant/submit-claim")}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#fff', background: 'var(--g-600)', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    <Plus style={{ width: 11, height: 11 }} />
                    New Claim
                  </button>
                </div>
              </div>
              {/* Search bar */}
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ position: 'relative' }}>
                  <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'var(--muted)', pointerEvents: 'none' }} />
                  <input
                    style={{ width: '100%', paddingLeft: 30, paddingRight: 10, height: 32, fontSize: 12, border: '1px solid var(--line)', borderRadius: 4, outline: 'none', background: '#fff', color: 'var(--ink)' }}
                    placeholder="Search by claim number, policy number, or vehicle registration…"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                  />
                </div>
              </div>
              <div className="p11-card-body" style={{ padding: 0 }}>
                {isLoading ? (
                  <div style={{ padding: '16px 20px' }}>
                    {[1,2,3].map(i => <div key={i} style={{ height: 56, background: '#F3F4F6', borderRadius: 6, marginBottom: 8 }} />)}
                  </div>
                ) : (debouncedQuery ? searchResults : myClaims).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)' }}>
                    <Car style={{ width: 32, height: 32, margin: '0 auto 8px', color: '#D1D5DB' }} />
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>No claims found</p>
                    <p style={{ fontSize: 12, marginTop: 4 }}>Submit your first claim to get started</p>
                  </div>
                ) : (
                  <table className="p11-table">
                    <thead>
                      <tr>
                        <th>Claim #</th>
                        <th>Vehicle</th>
                        <th>Status</th>
                        <th>Submitted</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(debouncedQuery ? searchResults : myClaims).map((claim: any) => (
                        <tr key={claim.id}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink)' }}>{claim.claimNumber}</td>
                          <td style={{ color: 'var(--muted)', fontSize: 12 }}>{[claim.vehicleMake, claim.vehicleModel, claim.vehicleYear].filter(Boolean).join(' ') || '—'}</td>
                          <td><StatusBadge status={claim.status} /></td>
                          <td style={{ color: 'var(--muted)', fontSize: 12 }}>{claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : '—'}</td>
                          <td>
                            <button
                              onClick={() => setLocation(`/claims/${claim.id}`)}
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
            )}
          </div>

          {/* ── SIDEBAR ── */}
          <div className="p11-sidebar">
            {/* Claim Summary */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <BarChart3 style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Claim Summary
                </div>
              </div>
              <div className="p11-card-body">
                {[
                  { label: 'Total Claims', value: myClaims.length, cls: 'muted' },
                  { label: 'Active', value: activeClaims.length, cls: activeClaims.length > 0 ? 'amber' : 'green' },
                  { label: 'Completed', value: completedClaims.length, cls: 'green' },
                  { label: 'Disputed', value: myClaims.filter((c: any) => c.status === 'disputed').length, cls: 'red' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{row.label}</span>
                    <span className={`p11-badge ${row.cls}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <Plus style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Quick Actions
                </div>
              </div>
              <div className="p11-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => setLocation("/claimant/submit-claim")}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--g-600)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  <FileText style={{ width: 14, height: 14 }} />
                  Submit New Claim
                </button>
                <button
                  onClick={() => refetch()}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'none', color: 'var(--g-600)', border: '1px solid var(--g-300)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
                >
                  <RefreshCw style={{ width: 14, height: 14 }} />
                  Refresh Status
                </button>
              </div>
            </div>


          </div>
        </div>
      </div>
      <Dialog open={!!settlementDialog} onOpenChange={(open) => !open && setSettlementDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Accept Settlement</DialogTitle>
            <DialogDescription>
              You are about to accept the settlement offer for claim <strong>{settlementDialog?.claimNumber}</strong>. This action is final and will close the claim.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSettlementDialog(null)}>Cancel</Button>
            <Button
              className="text-white"
              style={{ background: "#3C7844" }}
              disabled={acceptSettlementMutation.isPending}
              onClick={() => settlementDialog && acceptSettlementMutation.mutate({ claimId: settlementDialog.claimId })}
            >
              {acceptSettlementMutation.isPending ? "Processing..." : "Confirm Acceptance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute initiation dialog */}
      <Dialog open={!!disputeDialog} onOpenChange={(open) => { if (!open) { setDisputeDialog(null); setDisputeReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Raise a Dispute</DialogTitle>
            <DialogDescription>
              Describe why you are disputing the outcome of claim <strong>{disputeDialog?.claimNumber}</strong>. A claims manager will review your dispute.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              placeholder="Please explain your reason for disputing this claim outcome (minimum 10 characters)..."
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              rows={4}
              className="resize-none"
            />
            {disputeReason.length > 0 && disputeReason.length < 10 && (
              <p className="text-xs text-red-500 mt-1">Please provide at least 10 characters.</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDisputeDialog(null); setDisputeReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={disputeReason.length < 10 || initiateDisputeMutation.isPending}
              onClick={() => disputeDialog && initiateDisputeMutation.mutate({ claimId: disputeDialog.claimId, reason: disputeReason })}
            >
              {initiateDisputeMutation.isPending ? "Submitting..." : "Submit Dispute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
