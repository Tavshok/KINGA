/**
 * Assessor Dashboard — KINGA Professional Assessor Workspace v2.0
 *
 * Tabs:
 *   1. My Queue       — assigned claims with SLA indicators, AI confidence, actions
 *   2. AI Toolkit     — KINGA engine insights: fraud scores, physics, cost benchmarks, damage analysis
 *   3. Appointments   — scheduled site visits and inspection appointments
 *   4. Performance    — accuracy score, tier, completion trend
 *   5. Calibration    — benchmark data, engine accuracy, variance analysis
 *
 * Governance: ✅ DashboardLayout ✅ Standard Header ✅ Standard KPI Cards
 *             ✅ Attention Area ✅ SLA Visibility ✅ Brand Palette ✅ Standard Tabs ✅ AI Toolkit
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { PortalHeroBand, ProtoAlertBar, ProtoTabBar } from "@/components/PortalHeroBand";
import {
  KingaPortalShell,
  KINGA_GREEN, KINGA_TEAL, KINGA_BLUE, KINGA_RED, KINGA_AMBER,
  KINGA_GREEN_BG, KINGA_TEAL_BG, KINGA_BLUE_BG, KINGA_RED_BG, KINGA_AMBER_BG,
} from "@/components/KingaPortalShell";
import type { PortalKPI, PortalAlert, PortalTab } from "@/components/KingaPortalShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AssessorSubscriptionBanner } from "@/components/AssessorSubscriptionBanner";
import {
  ClipboardList, Eye, AlertTriangle, Clock, CheckCircle2,
  Calendar, TrendingUp, Star, MapPin, Phone, BarChart3, ShieldAlert, Download,
  Brain, Zap, Target, Activity, Cpu, Shield, DollarSign, Camera, ChevronRight,
  BarChart2, TrendingDown, Gauge,
} from "lucide-react";
import { SLADeadlineChip, computeSLAFromCreatedAt } from "@/components/portal/SLADeadlineChip";

// ── Helpers ───────────────────────────────────────────────────────────────────
// D-02: slaBadge is now a thin wrapper around the shared computeSLAFromCreatedAt
// so that existing filter expressions (slaBadge(c.createdAt)?.label === ...) still
// compile while the actual chip logic is unified in SLADeadlineChip.
function slaBadge(createdAt: string | Date | null | undefined) {
  if (!createdAt) return null;
  const chip = computeSLAFromCreatedAt(createdAt as string, 72);
  if (!chip) return null;
  if (chip.status === "breached") return { label: "SLA Breached", color: KINGA_RED,   bg: KINGA_RED_BG };
  if (chip.status === "critical" || chip.status === "warning") return { label: "SLA Warning",  color: KINGA_AMBER, bg: KINGA_AMBER_BG };
  return null;
}

function workflowLabel(s: string | null | undefined) {
  if (!s) return "Unknown";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(ts: string | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts as string).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(ts: string | Date | null | undefined) {
  if (!ts) return "";
  return new Date(ts as string).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

// ── Claim row ─────────────────────────────────────────────────────────────────
function ClaimRow({ claim, onView }: { claim: any; onView: () => void }) {
  const aiConf = claim.aiConfidenceScore ?? claim.confidenceScore ?? null;
  const fraud  = claim.fraudScore ?? null;
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4 border-b last:border-0 hover:bg-gray-50 transition-colors" style={{ borderColor: "#E5E7EB" }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-semibold" style={{ color: "#111827" }}>{claim.claimNumber}</span>
          {/* D-02: Replaced local sla badge with shared SLADeadlineChip */}
          <SLADeadlineChip createdAt={claim.createdAt} slaHours={72} />
          {claim.policyVerified && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: KINGA_GREEN_BG, color: KINGA_GREEN, border: `1px solid ${KINGA_GREEN}30` }}>
              <CheckCircle2 size={10} />Verified
            </span>
          )}
        </div>
        <p className="text-sm mt-1" style={{ color: "#374151" }}>
          {[claim.vehicleYear, claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(" ") || "Vehicle details pending"}
        </p>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="text-xs" style={{ color: "#6B7280" }}>{workflowLabel(claim.workflowState)}</span>
          {aiConf !== null && <span className="text-xs" style={{ color: KINGA_TEAL }}>KINGA Confidence: {Math.round(aiConf)}%</span>}
          {fraud !== null && fraud > 0.5 && <span className="text-xs font-medium" style={{ color: KINGA_RED }}>Fraud Score: {Math.round(fraud * 100)}%</span>}
          <span className="text-xs" style={{ color: "#9CA3AF" }}>Submitted {fmtDate(claim.createdAt)}</span>
        </div>
      </div>
      <Button size="sm" onClick={onView} style={{ background: KINGA_GREEN, color: "#fff", border: "none" }} className="hover:opacity-90 flex-shrink-0">
        <Eye size={14} className="mr-1.5" />Assess
      </Button>
    </div>
  );
}

// ── Appointment row ───────────────────────────────────────────────────────────
function ApptRow({ appt }: { appt: any }) {
  const upcoming = appt.scheduledAt && new Date(appt.scheduledAt) > new Date();
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4 border-b last:border-0" style={{ borderColor: "#E5E7EB" }}>
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5" style={{ width: 36, height: 36, background: upcoming ? KINGA_BLUE_BG : "#F3F4F6" }}>
          <Calendar size={16} style={{ color: upcoming ? KINGA_BLUE : "#9CA3AF" }} />
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: "#111827" }}>{appt.claimNumber || `Claim #${appt.claimId}`}</p>
          <p className="text-sm mt-0.5" style={{ color: "#374151" }}>{fmtDate(appt.scheduledAt)} at {fmtTime(appt.scheduledAt)}</p>
          {appt.location && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "#6B7280" }}><MapPin size={10} />{appt.location}</p>}
          {appt.contactPhone && <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "#6B7280" }}><Phone size={10} />{appt.contactPhone}</p>}
        </div>
      </div>
      <span className="text-xs font-medium px-2 py-1 rounded-full flex-shrink-0" style={{ background: upcoming ? KINGA_BLUE_BG : "#F3F4F6", color: upcoming ? KINGA_BLUE : "#6B7280" }}>
        {upcoming ? "Upcoming" : "Past"}
      </span>
    </div>
  );
}

// ── Performance metric card ───────────────────────────────────────────────────
function PerfCard({ label, value, icon, accent }: { label: string; value: string | number; icon: React.ReactNode; accent: "green"|"teal"|"blue"|"amber" }) {
  const c = { green: { bg: KINGA_GREEN_BG, ic: KINGA_GREEN }, teal: { bg: KINGA_TEAL_BG, ic: KINGA_TEAL }, blue: { bg: KINGA_BLUE_BG, ic: KINGA_BLUE }, amber: { bg: KINGA_AMBER_BG, ic: KINGA_AMBER } }[accent];
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: "#fff", border: "1px solid #E5E7EB" }}>
      <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 40, height: 40, background: c.bg }}>
        <span style={{ color: c.ic, display: "flex" }}>{icon}</span>
      </div>
      <div>
        <div className="text-xl font-bold" style={{ color: "#111827" }}>{value}</div>
        <div className="text-xs" style={{ color: "#6B7280" }}>{label}</div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AssessorDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("queue");

  const { data: perfData, isLoading: perfLoading } =
    trpc.assessors.getPerformanceDashboard.useQuery(undefined, { staleTime: 60_000 });

  const { data: appointments, isLoading: apptsLoading } =
    trpc.appointments.myAppointments.useQuery(undefined, { staleTime: 60_000 });

  const assignedClaims: any[] = perfData?.assignedClaims ?? [];
  const recentAssessments: any[] = perfData?.recentAssessments ?? [];

  const slaBreached = useMemo(() => assignedClaims.filter((c) => slaBadge(c.createdAt)?.label === "SLA Breached").length, [assignedClaims]);
  const slaWarning  = useMemo(() => assignedClaims.filter((c) => slaBadge(c.createdAt)?.label === "SLA Warning").length,  [assignedClaims]);
  const pendingAss  = useMemo(() => assignedClaims.filter((c) => c.workflowState === "assessment_pending" || c.workflowState === "awaiting_assessment").length, [assignedClaims]);
  const upcomingAppts = useMemo(() => (appointments ?? []).filter((a: any) => a.scheduledAt && new Date(a.scheduledAt) > new Date()), [appointments]);

  const kpis: PortalKPI[] = [
    { label: "Assigned Claims",        value: perfLoading ? "—" : assignedClaims.length,                                                                                                    icon: <ClipboardList size={18} />, accent: "blue"  },
    { label: "Pending Assessment",     value: perfLoading ? "—" : pendingAss,                                                                                                               icon: <Clock size={18} />,         accent: "amber" },
    { label: "SLA Breached",           value: perfLoading ? "—" : slaBreached,                                                                                                              icon: <AlertTriangle size={18} />, accent: slaBreached > 0 ? "red" : "green" },
    { label: "Completed",              value: perfLoading ? "—" : (perfData?.totalAssessmentsCompleted ?? 0),                                                                               icon: <CheckCircle2 size={18} />,  accent: "green" },
    // D-06: Throughput This Week
    { label: "Throughput (7d)",        value: perfLoading ? "—" : (perfData?.throughputThisWeek ?? 0),                                                                                    icon: <TrendingUp size={18} />,    accent: "teal"  },
    // D-06: Avg Assessment Time
    { label: "Avg Assess. Time",       value: perfLoading ? "—" : (perfData?.avgCompletionTimeHours != null ? `${(perfData.avgCompletionTimeHours as number).toFixed(1)}h` : "—"),       icon: <BarChart3 size={18} />,     accent: "blue"  },
    { label: "Performance Score",      value: perfLoading ? "—" : `${perfData?.performanceScore ?? 0}%`,                                                                                   icon: <Star size={18} />,          accent: "teal"  },
    { label: "Upcoming Appointments",  value: apptsLoading ? "—" : upcomingAppts.length,                                                                                                   icon: <Calendar size={18} />,      accent: "blue"  },
  ];

  const alerts: PortalAlert[] = [
    { id: "breach",  severity: "critical", label: "SLA Breached",        count: slaBreached, onClick: () => setActiveTab("queue") },
    { id: "warning", severity: "warning",  label: "SLA Warning",         count: slaWarning,  onClick: () => setActiveTab("queue") },
    { id: "pending", severity: "info",     label: "Awaiting Assessment",  count: pendingAss,  onClick: () => setActiveTab("queue") },
  ];

  const tabs: PortalTab[] = [
    { id: "queue",        label: "My Queue",     badge: assignedClaims.length },
    { id: "ai-toolkit",  label: "AI Toolkit" },
    { id: "appointments", label: "Appointments", badge: upcomingAppts.length || undefined },
    { id: "performance",  label: "Performance" },
    { id: "calibration",  label: "Calibration" },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#F7F8F6', fontFamily: 'Inter, sans-serif' }}>
      <PortalHeroBand
        portalName="Assessor Workspace"
        title={`Welcome back, ${user?.name ?? 'Assessor'}`}
        subtitle="Manage your assessment queue and track performance"
        actions={[
          { label: 'Export Report', icon: <Download className="h-3 w-3" />, primary: true },
        ]}
        kpis={[
          { label: 'Assigned Claims', value: perfLoading ? '—' : assignedClaims.length, delta: 'In queue', up: null, headline: true },
          { label: 'Pending Assessment', value: perfLoading ? '—' : pendingAss, delta: 'Awaiting action', up: false },
          { label: 'SLA Breached', value: perfLoading ? '—' : slaBreached, delta: 'Immediate action', up: false },
          { label: 'Completed', value: perfLoading ? '—' : (perfData?.totalAssessmentsCompleted ?? 0), delta: 'Resolved', up: true },
          { label: 'Throughput (7d)', value: perfLoading ? '—' : (perfData?.throughputThisWeek ?? 0), delta: 'This week', up: null },
          { label: 'Performance Score', value: perfLoading ? '—' : `${perfData?.performanceScore ?? 0}%`, delta: 'Overall rating', up: (perfData?.performanceScore ?? 0) >= 70 },
        ]}
      />
      <ProtoAlertBar
        alerts={[
          { count: slaBreached, label: 'SLA Breached — immediate action required', severity: 'red', onClick: () => setActiveTab('queue') },
          { count: slaWarning, label: 'SLA Warning — approaching deadline', severity: 'amber', onClick: () => setActiveTab('queue') },
        ]}
      ctaLabel="View queue"
    />
    <ProtoTabBar tabs={tabs.map(t => ({ id: t.id, label: t.label, badge: t.badge }))} activeTab={activeTab} onTabChange={setActiveTab} />
    {/* ── BODY ── */}
    <div className="p11-body">
      {/* Subscription banner */}
      <AssessorSubscriptionBanner />
      <div className="p11-body-2col">
        {/* ── MAIN COLUMN ── */}
        <div>

      {/* ── My Queue ── */}
      {activeTab === "queue" && (
        <div className="space-y-4 mt-4">
          {perfLoading ? (
            <Card><CardContent className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</CardContent></Card>
          ) : assignedClaims.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <CheckCircle2 size={40} className="mx-auto mb-3" style={{ color: KINGA_GREEN }} />
                <p className="font-medium" style={{ color: "#111827" }}>Queue is clear</p>
                <p className="text-sm mt-1" style={{ color: "#6B7280" }}>No claims are currently assigned to you. New assignments will appear here.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {slaBreached > 0 && (
                <Card style={{ border: `1px solid ${KINGA_RED}40` }}>
                  <CardHeader className="pb-0 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: KINGA_RED }}>
                      <ShieldAlert size={15} />SLA Breached — Immediate Action Required
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 mt-2">
                    {assignedClaims.filter(c => slaBadge(c.createdAt)?.label === "SLA Breached").map(claim => (
                      <ClaimRow key={claim.id} claim={claim} onView={() => setLocation(`/assessor/claims/${claim.id}`)} />
                    ))}
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-0 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold" style={{ color: "#374151" }}>All Assigned Claims ({assignedClaims.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0 mt-2">
                  {assignedClaims.map(claim => (
                    <ClaimRow key={claim.id} claim={claim} onView={() => setLocation(`/assessor/claims/${claim.id}`)} />
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ── AI Toolkit ── */}
      {activeTab === "ai-toolkit" && (
        <div className="space-y-4 mt-4">
          {/* Engine Status Banner */}
          <Card style={{ background: 'linear-gradient(135deg, #0A2218 0%, #0D3B2A 100%)', border: 'none' }}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Brain size={18} style={{ color: '#34D399' }} />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#F9FAFB' }}>KINGA Intelligence Engines</p>
                  <p style={{ fontSize: 12, color: '#9CA3AF' }}>AI-powered tools to support your assessments</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { icon: <Shield size={14} />, label: 'Fraud Engine', status: 'Active', color: '#34D399' },
                  { icon: <Zap size={14} />, label: 'Physics Engine', status: 'Active', color: '#34D399' },
                  { icon: <DollarSign size={14} />, label: 'Cost Intelligence', status: 'Active', color: '#34D399' },
                  { icon: <Camera size={14} />, label: 'Photo Forensics', status: 'Active', color: '#34D399' },
                ].map(engine => (
                  <div key={engine.label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ color: engine.color }}>{engine.icon}</span>
                      <span style={{ fontSize: 11, color: '#E5E7EB', fontWeight: 600 }}>{engine.label}</span>
                    </div>
                    <span style={{ fontSize: 10, color: engine.color, fontWeight: 600 }}>● {engine.status}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Claims with AI Intelligence — click to open full toolkit */}
          <Card>
            <CardHeader className="pb-0 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: "#374151" }}>
                <Cpu size={14} style={{ color: KINGA_TEAL }} />
                Claims with AI Assessment — Open Toolkit
              </CardTitle>
              <CardDescription>Click any claim to access the full KINGA intelligence workspace</CardDescription>
            </CardHeader>
            <CardContent className="p-0 mt-2">
              {perfLoading ? (
                <div className="p-5 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
              ) : assignedClaims.length === 0 ? (
                <div className="py-12 text-center">
                  <Brain size={32} className="mx-auto mb-3" style={{ color: KINGA_TEAL }} />
                  <p className="text-sm font-medium" style={{ color: "#374151" }}>No claims in queue</p>
                  <p className="text-xs mt-1" style={{ color: "#6B7280" }}>AI toolkit activates when claims are assigned to you</p>
                </div>
              ) : (
                assignedClaims.map((claim: any) => {
                  const fraudScore = claim.fraudRiskScore ? Number(claim.fraudRiskScore) : null;
                  const fraudColor = fraudScore == null ? '#9CA3AF' : fraudScore >= 70 ? KINGA_RED : fraudScore >= 40 ? KINGA_AMBER : KINGA_GREEN;
                  const fraudLabel = fraudScore == null ? '—' : fraudScore >= 70 ? 'High' : fraudScore >= 40 ? 'Moderate' : 'Low';
                  const estCost = claim.estimatedCost ? (Number(claim.estimatedCost) / 100).toFixed(0) : null;
                  return (
                    <div
                      key={claim.id}
                      onClick={() => setLocation(`/assessor/claims/${claim.id}`)}
                      style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                              {claim.vehicleMake} {claim.vehicleModel} {claim.vehicleYear}
                            </span>
                            <span style={{ fontSize: 11, color: '#6B7280' }}>#{claim.id}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            {/* Fraud Score */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Shield size={11} style={{ color: fraudColor }} />
                              <span style={{ fontSize: 11, color: fraudColor, fontWeight: 600 }}>
                                Fraud: {fraudLabel}{fraudScore != null ? ` (${fraudScore}%)` : ''}
                              </span>
                            </div>
                            {/* Estimated Cost */}
                            {estCost && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <DollarSign size={11} style={{ color: KINGA_TEAL }} />
                                <span style={{ fontSize: 11, color: KINGA_TEAL, fontWeight: 600 }}>
                                  Est. ${Number(estCost).toLocaleString()}
                                </span>
                              </div>
                            )}
                            {/* Status */}
                            <span style={{ fontSize: 11, color: '#6B7280' }}>
                              {workflowLabel(claim.workflowState)}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <Button size="sm" variant="outline" style={{ fontSize: 11, height: 28, padding: '0 10px' }}
                            onClick={e => { e.stopPropagation(); setLocation(`/assessor/claims/${claim.id}`); }}>
                            <Brain size={11} className="mr-1" />Open Toolkit
                          </Button>
                          <ChevronRight size={14} style={{ color: '#9CA3AF' }} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Quick Reference — Engine Interpretation Guide */}
          <Card>
            <CardHeader className="pb-0 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: "#374151" }}>
                <Target size={14} style={{ color: KINGA_BLUE }} />
                Engine Interpretation Guide
              </CardTitle>
              <CardDescription>How to read KINGA engine outputs</CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    engine: 'Fraud Score',
                    icon: <Shield size={14} />,
                    color: KINGA_RED,
                    bg: KINGA_RED_BG,
                    ranges: [
                      { label: '0–30%', desc: 'Low risk — proceed normally', color: KINGA_GREEN },
                      { label: '31–60%', desc: 'Moderate — additional verification recommended', color: KINGA_AMBER },
                      { label: '61–100%', desc: 'High — escalate for investigation', color: KINGA_RED },
                    ],
                  },
                  {
                    engine: 'Physics Engine (Delta-V)',
                    icon: <Zap size={14} />,
                    color: KINGA_BLUE,
                    bg: KINGA_BLUE_BG,
                    ranges: [
                      { label: '< 20 km/h', desc: 'Low impact — minor damage expected', color: KINGA_GREEN },
                      { label: '20–50 km/h', desc: 'Moderate impact — structural check needed', color: KINGA_AMBER },
                      { label: '> 50 km/h', desc: 'High impact — significant structural damage likely', color: KINGA_RED },
                    ],
                  },
                  {
                    engine: 'Cost Intelligence',
                    icon: <DollarSign size={14} />,
                    color: KINGA_TEAL,
                    bg: KINGA_TEAL_BG,
                    ranges: [
                      { label: 'Within 15%', desc: 'Quote aligns with KINGA benchmark', color: KINGA_GREEN },
                      { label: '15–30%', desc: 'Minor deviation — review line items', color: KINGA_AMBER },
                      { label: '> 30%', desc: 'Significant deviation — negotiate or reject', color: KINGA_RED },
                    ],
                  },
                  {
                    engine: 'Confidence Score',
                    icon: <Gauge size={14} />,
                    color: KINGA_GREEN,
                    bg: KINGA_GREEN_BG,
                    ranges: [
                      { label: '> 80%', desc: 'High confidence — AI assessment reliable', color: KINGA_GREEN },
                      { label: '50–80%', desc: 'Moderate — human review recommended', color: KINGA_AMBER },
                      { label: '< 50%', desc: 'Low — manual assessment required', color: KINGA_RED },
                    ],
                  },
                ].map(item => (
                  <div key={item.engine} style={{ background: item.bg, borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <span style={{ color: item.color }}>{item.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{item.engine}</span>
                    </div>
                    <div className="space-y-2">
                      {item.ranges.map(r => (
                        <div key={r.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: r.color, minWidth: 70, flexShrink: 0 }}>{r.label}</span>
                          <span style={{ fontSize: 11, color: '#4B5563' }}>{r.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Appointments ── */}
      {activeTab === "appointments" && (
          <div className="space-y-4 mt-4">
            {apptsLoading ? (
              <Card><CardContent className="p-6 space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</CardContent></Card>
            ) : !appointments || (appointments as any[]).length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Calendar size={40} className="mx-auto mb-3" style={{ color: KINGA_BLUE }} />
                  <p className="font-medium" style={{ color: "#111827" }}>No appointments scheduled</p>
                  <p className="text-sm mt-1" style={{ color: "#6B7280" }}>Appointments booked through claim workflows will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {upcomingAppts.length > 0 && (
                  <Card>
                    <CardHeader className="pb-0 pt-4 px-5">
                      <CardTitle className="text-sm font-semibold" style={{ color: "#374151" }}>Upcoming ({upcomingAppts.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 mt-2">
                      {upcomingAppts.map((a: any) => <ApptRow key={a.id} appt={a} />)}
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader className="pb-0 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold" style={{ color: "#374151" }}>All Appointments ({(appointments as any[]).length})</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 mt-2">
                    {(appointments as any[]).map((a: any) => <ApptRow key={a.id} appt={a} />)}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

      {/* ── Performance ── */}
      {activeTab === "performance" && (
        <div className="space-y-4 mt-4">
          {perfLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <PerfCard label="Performance Score"       value={`${perfData?.performanceScore ?? 0}%`}                                                                                                  icon={<Star size={18} />}        accent="green" />
                <PerfCard label="Assessments Completed"   value={perfData?.totalAssessmentsCompleted ?? 0}                                                                                               icon={<CheckCircle2 size={18} />} accent="teal"  />
                <PerfCard label="Avg Variance from Final" value={perfData?.averageVarianceFromFinal != null ? `${Math.round((perfData.averageVarianceFromFinal as number) * 100) / 100}%` : "—"}        icon={<TrendingUp size={18} />}  accent="blue"  />
                <PerfCard label="Subscription Tier"       value={perfData?.tier ? (perfData.tier as string).charAt(0).toUpperCase() + (perfData.tier as string).slice(1) : "Free"}                      icon={<BarChart3 size={18} />}   accent="amber" />
              </div>
              <Card>
                <CardHeader className="pb-0 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold" style={{ color: "#374151" }}>Recent Assessments</CardTitle>
                  <CardDescription>Your last {recentAssessments.length} completed assessments</CardDescription>
                </CardHeader>
                <CardContent className="p-0 mt-2">
                  {recentAssessments.length === 0 ? (
                    <div className="py-10 text-center"><p className="text-sm" style={{ color: "#6B7280" }}>No assessments completed yet.</p></div>
                  ) : recentAssessments.map((ev: any) => (
                    <div key={ev.id} className="flex items-center justify-between px-5 py-3 border-b last:border-0" style={{ borderColor: "#E5E7EB" }}>
                      <div>
                        <p className="text-sm font-medium" style={{ color: "#111827" }}>Claim #{ev.claimId}</p>
                        <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>{fmtDate(ev.createdAt)}</p>
                      </div>
                      {ev.recommendedAction && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: KINGA_GREEN_BG, color: KINGA_GREEN }}>{ev.recommendedAction}</span>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ── Calibration ── */}
      {activeTab === "calibration" && (
        <div className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-0 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: "#374151" }}>
                <Activity size={14} style={{ color: KINGA_TEAL }} />
                Assessment Accuracy Calibration
              </CardTitle>
              <CardDescription>How your assessments compare to KINGA AI and final settled amounts</CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                <div style={{ background: KINGA_GREEN_BG, borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: KINGA_GREEN }}>{perfData?.performanceScore ?? 0}%</p>
                  <p style={{ fontSize: 11, color: '#4B5563', marginTop: 2 }}>Overall Performance Score</p>
                </div>
                <div style={{ background: KINGA_BLUE_BG, borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: KINGA_BLUE }}>
                    {perfData?.averageVarianceFromFinal != null ? `${Math.round((perfData.averageVarianceFromFinal as number) * 100) / 100}%` : '—'}
                  </p>
                  <p style={{ fontSize: 11, color: '#4B5563', marginTop: 2 }}>Avg Variance from Final</p>
                </div>
                <div style={{ background: KINGA_TEAL_BG, borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: KINGA_TEAL }}>{perfData?.totalAssessmentsCompleted ?? 0}</p>
                  <p style={{ fontSize: 11, color: '#4B5563', marginTop: 2 }}>Total Assessments</p>
                </div>
              </div>
              <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '14px 16px' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Calibration Guidance</p>
                <div className="space-y-3">
                  {[
                    { icon: <TrendingDown size={13} />, color: KINGA_GREEN, text: 'Variance below 10%: Excellent calibration — your estimates closely match final settlements' },
                    { icon: <BarChart2 size={13} />, color: KINGA_AMBER, text: 'Variance 10–20%: Good calibration — minor adjustments to cost estimation approach recommended' },
                    { icon: <TrendingUp size={13} />, color: KINGA_RED, text: 'Variance above 20%: Recalibration needed — review KINGA cost benchmarks and adjust estimation methodology' },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ color: item.color, marginTop: 1, flexShrink: 0 }}>{item.icon}</span>
                      <span style={{ fontSize: 12, color: '#4B5563' }}>{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Assessment History with AI comparison */}
          <Card>
            <CardHeader className="pb-0 pt-4 px-5">
              <CardTitle className="text-sm font-semibold" style={{ color: "#374151" }}>Recent Assessment History</CardTitle>
              <CardDescription>Your assessments and recommended actions</CardDescription>
            </CardHeader>
            <CardContent className="p-0 mt-2">
              {recentAssessments.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm" style={{ color: "#6B7280" }}>No assessments completed yet. Complete assessments to see calibration data.</p>
                </div>
              ) : recentAssessments.map((ev: any) => (
                <div key={ev.id} style={{ padding: '12px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Claim #{ev.claimId}</p>
                    <p style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{fmtDate(ev.createdAt)}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {ev.recommendedAction && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: KINGA_GREEN_BG, color: KINGA_GREEN }}>
                        {ev.recommendedAction}
                      </span>
                    )}
                    {ev.fraudRiskLevel && ev.fraudRiskLevel !== 'low' && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: KINGA_AMBER_BG, color: KINGA_AMBER }}>
                        {ev.fraudRiskLevel} fraud
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
        </div>
          {/* ── SIDEBAR ── */}
          <div className="p11-sidebar">
            {/* Performance Summary */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <BarChart3 style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Performance Summary
                </div>
              </div>
              <div className="p11-card-body">
                {[
                  { label: 'Performance Score', value: `${perfData?.performanceScore ?? 0}%`, cls: (perfData?.performanceScore ?? 0) >= 70 ? 'green' : 'amber' },
                  { label: 'Completed (Total)', value: perfData?.totalAssessmentsCompleted ?? 0, cls: 'green' },
                  { label: 'Throughput (7d)', value: perfData?.throughputThisWeek ?? 0, cls: 'muted' },
                  { label: 'Avg Variance', value: perfData?.averageVarianceFromFinal != null ? `${Math.round((perfData.averageVarianceFromFinal as number) * 100) / 100}%` : '—', cls: 'muted' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{row.label}</span>
                    <span className={`p11-badge ${row.cls}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* SLA Status */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <Clock style={{ width: 14, height: 14, color: 'var(--amber)' }} />
                  SLA Status
                </div>
              </div>
              <div className="p11-card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Breached</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: slaBreached > 0 ? 'var(--red)' : 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{slaBreached}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Warning</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: slaWarning > 0 ? 'var(--amber)' : 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{slaWarning}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>On Track</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-600)', fontVariantNumeric: 'tabular-nums' }}>{assignedClaims.length - slaBreached - slaWarning}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Subscription Tier */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <Star style={{ width: 14, height: 14, color: 'var(--gold)' }} />
                  Subscription Tier
                </div>
              </div>
              <div className="p11-card-body" style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--g-800)', textTransform: 'capitalize' }}>
                  {perfData?.tier ?? 'Free'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Current plan</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
