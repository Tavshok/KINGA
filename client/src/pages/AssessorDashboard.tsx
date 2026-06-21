/**
 * Assessor Dashboard — rebuilt to KINGA Portal Design Standard v1.0
 *
 * Tabs:
 *   1. My Queue      — assigned claims with SLA indicators, AI confidence, actions
 *   2. Appointments  — scheduled site visits and inspection appointments
 *   3. Performance   — accuracy score, tier, completion trend
 *
 * Governance: ✅ DashboardLayout ✅ Standard Header ✅ Standard KPI Cards
 *             ✅ Attention Area ✅ SLA Visibility ✅ Brand Palette ✅ Standard Tabs
 */

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
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
  Calendar, TrendingUp, Star, MapPin, Phone, BarChart3, ShieldAlert,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
function slaBadge(createdAt: string | Date | null | undefined) {
  if (!createdAt) return null;
  const h = (Date.now() - new Date(createdAt as string).getTime()) / 3_600_000;
  if (h > 72) return { label: "SLA Breached", color: KINGA_RED,   bg: KINGA_RED_BG };
  if (h > 48) return { label: "SLA Warning",  color: KINGA_AMBER, bg: KINGA_AMBER_BG };
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
  const sla = slaBadge(claim.createdAt);
  const aiConf = claim.aiConfidenceScore ?? claim.confidenceScore ?? null;
  const fraud  = claim.fraudScore ?? null;
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4 border-b last:border-0 hover:bg-gray-50 transition-colors" style={{ borderColor: "#E5E7EB" }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-semibold" style={{ color: "#111827" }}>{claim.claimNumber}</span>
          {sla && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: sla.bg, color: sla.color, border: `1px solid ${sla.color}30` }}>
              <Clock size={10} />{sla.label}
            </span>
          )}
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
          {aiConf !== null && <span className="text-xs" style={{ color: KINGA_TEAL }}>AI Confidence: {Math.round(aiConf)}%</span>}
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
    trpc.assessorEvaluations.getPerformanceDashboard.useQuery(undefined, { staleTime: 60_000 });

  const { data: appointments, isLoading: apptsLoading } =
    trpc.appointments.myAppointments.useQuery(undefined, { staleTime: 60_000 });

  const assignedClaims: any[] = perfData?.assignedClaims ?? [];
  const recentAssessments: any[] = perfData?.recentAssessments ?? [];

  const slaBreached = useMemo(() => assignedClaims.filter((c) => slaBadge(c.createdAt)?.label === "SLA Breached").length, [assignedClaims]);
  const slaWarning  = useMemo(() => assignedClaims.filter((c) => slaBadge(c.createdAt)?.label === "SLA Warning").length,  [assignedClaims]);
  const pendingAss  = useMemo(() => assignedClaims.filter((c) => c.workflowState === "assessment_pending" || c.workflowState === "awaiting_assessment").length, [assignedClaims]);
  const upcomingAppts = useMemo(() => (appointments ?? []).filter((a: any) => a.scheduledAt && new Date(a.scheduledAt) > new Date()), [appointments]);

  const kpis: PortalKPI[] = [
    { label: "Assigned Claims",        value: perfLoading ? "—" : assignedClaims.length,                         icon: <ClipboardList size={18} />, accent: "blue"  },
    { label: "Pending Assessment",     value: perfLoading ? "—" : pendingAss,                                    icon: <Clock size={18} />,         accent: "amber" },
    { label: "SLA Breached",           value: perfLoading ? "—" : slaBreached,                                   icon: <AlertTriangle size={18} />, accent: slaBreached > 0 ? "red" : "green" },
    { label: "Completed",              value: perfLoading ? "—" : (perfData?.totalAssessmentsCompleted ?? 0),    icon: <CheckCircle2 size={18} />,  accent: "green" },
    { label: "Performance Score",      value: perfLoading ? "—" : `${perfData?.performanceScore ?? 0}%`,         icon: <Star size={18} />,          accent: "teal"  },
    { label: "Upcoming Appointments",  value: apptsLoading ? "—" : upcomingAppts.length,                        icon: <Calendar size={18} />,      accent: "blue"  },
  ];

  const alerts: PortalAlert[] = [
    { id: "breach",  severity: "critical", label: "SLA Breached",        count: slaBreached, onClick: () => setActiveTab("queue") },
    { id: "warning", severity: "warning",  label: "SLA Warning",         count: slaWarning,  onClick: () => setActiveTab("queue") },
    { id: "pending", severity: "info",     label: "Awaiting Assessment",  count: pendingAss,  onClick: () => setActiveTab("queue") },
  ];

  const tabs: PortalTab[] = [
    { id: "queue",        label: "My Queue",     badge: assignedClaims.length },
    { id: "appointments", label: "Appointments", badge: upcomingAppts.length || undefined },
    { id: "performance",  label: "Performance" },
  ];

  return (
    <DashboardLayout>
      <KingaPortalShell
        icon={<ClipboardList size={22} />}
        title="Assessor Workspace"
        description={`Welcome back, ${user?.name ?? "Assessor"} — manage your assessment queue and track performance`}
        live
        kpis={kpis}
        alerts={alerts}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {/* Subscription banner */}
        <AssessorSubscriptionBanner />

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
      </KingaPortalShell>
    </DashboardLayout>
  );
}
