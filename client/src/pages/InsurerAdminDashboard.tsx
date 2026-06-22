/**
 * InsurerAdminDashboard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Insurer-level administration panel.
 * Accessible by: insurer_admin role only.
 *
 * Sections:
 *  1. KPI Overview — live claims, fraud, processing metrics
 *  2. Quick Actions — links to workflow settings, reports, fraud analytics
 *  3. Recent Activity — latest claims activity across the tenant
 *  4. Admin Profile + Portal Roles directory
 */

import InsurerPortalLayout from "@/components/InsurerPortalLayout";
import { PortalHeader, PortalKPIStrip, type PortalKPI } from "@/components/KingaPortalShell";
import { PendingTeamRequestQueue } from "@/components/insurer/PendingTeamRequestQueue";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useLocation } from "wouter";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Settings,
  BarChart3,
  ShieldAlert,
  FileBarChart,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  ChevronRight,
  Building2,
  Layers,
  ClipboardList,
  RefreshCw,
  ArrowRight,
  History,
  UserCog,
} from "lucide-react";

// ─── Role display helpers ─────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  executive:         { label: "Executive",          color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  claims_manager:    { label: "Claims Manager",     color: "border", style: { background: "#F0F7F2", color: "#3C7844", borderColor: "#C8E0CE" } },
  claims_processor:  { label: "Claims Processor",   color: "border", style: { background: "#F0F7F2", color: "#3C7844", borderColor: "#C8E0CE" } },
  assessor_internal: { label: "Internal Assessor",  color: "bg-orange-100 text-orange-700 border-orange-200" },
  risk_manager:      { label: "Risk Manager",       color: "border", style: { background: "#FDF0F0", color: "#A32D2D", borderColor: "#E8B8B8" } },
  recovery_officer:  { label: "Recovery Officer",   color: "bg-lime-100 text-lime-700 border-lime-200" },
  insurer_admin:     { label: "Insurer Admin",      color: "bg-slate-100 text-slate-700 border-slate-200" },
};

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_LABELS[role] ?? { label: role, color: "bg-slate-100 text-slate-700 border-slate-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ─── Quick action tiles ───────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    label: "Workflow Settings",
    description: "Configure automation rules and escalation policies",
    icon: Settings,
    href: "/admin/workflows",
    color: "text-violet-600",
    bg: "bg-violet-50",
  },
  {
    label: "Workflow Analytics",
    description: "Processing times, throughput, and bottlenecks",
    icon: BarChart3,
    href: "/insurer-portal/workflow-analytics",
    color: "text-[#3C7844]",
    bg: "bg-[#F0F7F2]",
  },
  {
    label: "Fraud Analytics",
    description: "Fraud detection overview and FCDI flags",
    icon: ShieldAlert,
    href: "/insurer/fraud-analytics",
    color: "text-rose-600",
    bg: "bg-rose-50",
  },
  {
    label: "Reports Centre",
    description: "Generate and download all report types",
    icon: FileBarChart,
    href: "/insurer-portal/reports-centre",
    color: "text-[#8A5C00]",
    bg: "bg-[#FFF8E6]",
  },
  {
    label: "Claims Triage",
    description: "Review and action incoming claims",
    icon: ClipboardList,
    href: "/insurer/claims/triage",
    color: "text-[#4878A8]",
    bg: "bg-[#EEF4FB]",
  },
  {
    label: "Recovery Cases",
    description: "Monitor third-party recovery queue",
    icon: Layers,
    href: "/insurer-portal/recovery",
    color: "text-lime-600",
    bg: "bg-lime-50",
  },
];

// ─── Status chip ──────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    submitted:              "border text-[#4878A8] bg-[#EEF4FB] border-[#B8D0E8]",
    triage:                 "bg-yellow-100 text-yellow-700",
    assessment_in_progress: "border text-[#8A5C00] bg-[#FFF8E6] border-[#E8C97A]",
    comparison:             "bg-violet-100 text-violet-700",
    completed:              "border text-[#3C7844] bg-[#F0F7F2] border-[#C8E0CE]",
    fraud_flagged:          "bg-rose-100 text-rose-700",
    rejected:               "border text-[#A32D2D] bg-[#FDF0F0] border-[#E8B8B8]",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${map[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function InsurerAdminDashboard() {
  const { user } = useAuth();
  const { fmt } = useTenantCurrency();
  const [, setLocation] = useLocation();
  const [refreshKey, setRefreshKey] = useState(0);

  // KPIs
  const { data: kpis, isLoading: kpisLoading } = trpc.analytics.getKPIs.useQuery(
    {},
    { staleTime: 3 * 60 * 1000 }
  );

  // Recent claims (all statuses, last 10)
  const { data: submittedClaims = [] } = trpc.claims.byStatus.useQuery({ status: "submitted" });
  const { data: triageClaims = [] }    = trpc.claims.byStatus.useQuery({ status: "triage" });
  const { data: fraudClaims = [] }     = trpc.claims.byStatus.useQuery({ status: "fraud_flagged" });

  const recentClaims = [...submittedClaims, ...triageClaims, ...fraudClaims]
    .sort((a: any, b: any) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 8);
  // Audit log
  const { data: auditLog = [], isLoading: auditLoading } = trpc.teamMembers.getAuditLog.useQuery(
    undefined,
    { staleTime: 2 * 60 * 1000 }
  );

  // KPI card data
  const kpiSummary = (kpis as any)?.summaryMetrics;
  const kpiCards = [
    {
      label: "Total Claims",
      value: kpiSummary?.totalClaims ?? "—",
      icon: ClipboardList,
      color: "text-[#4878A8]",
      sub: `${kpiSummary?.activeClaims ?? 0} active`,
    },
    {
      label: "Completion Rate",
      value: kpiSummary?.completionRate != null ? `${kpiSummary.completionRate}%` : "—",
      icon: CheckCircle2,
      color: "text-[#3C7844]",
      sub: `${kpiSummary?.completedClaims ?? 0} completed`,
    },
    {
      label: "Fraud Detected",
      value: kpiSummary?.fraudDetected ?? "—",
      icon: AlertTriangle,
      color: "text-red-600",
      sub: "flagged cases",
    },
    {
      label: "Avg Processing",
      value: kpiSummary?.avgProcessingTime != null ? `${kpiSummary.avgProcessingTime}d` : "—",
      icon: Clock,
      color: "text-orange-600",
      sub: "days per claim",
    },
    {
      label: "KINGA Savings",
      value: kpiSummary?.totalSavings != null
        ? fmt(Number(kpiSummary.totalSavings))
        : "—",
      icon: TrendingUp,
      color: "text-teal-600",
      sub: "total KINGA-driven savings",
    },
    {
      label: "High-Value Claims",
      value: kpiSummary?.highValueClaims ?? "—",
      icon: Activity,
      color: "text-purple-600",
      sub: "above threshold",
    },
  ];

  return (
    <InsurerPortalLayout>
      <div className="p-6 space-y-6">
        {/* ── Page header (C1) ── */}
        <PortalHeader
          icon={<Building2 className="h-5 w-5 text-white" />}
          title="Insurer Administration"
          description={`${(user as any)?.tenantName ?? 'Your Organisation'} — company-wide overview, team management, and portal configuration`}
          live
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey(k => k + 1)}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
          }
        />

        {/* ── KPI Strip (C2) ── */}
        <PortalKPIStrip kpis={kpiCards.map(card => ({
          label: card.label,
          value: kpisLoading ? '…' : card.value,
          icon: <card.icon className="h-4 w-4" />,
          accent: card.color.includes('red') ? 'red'
            : card.color.includes('green') ? 'green'
            : card.color.includes('teal') ? 'teal'
            : card.color.includes('orange') ? 'amber'
            : card.color.includes('purple') ? 'blue'
            : 'blue',
        } as PortalKPI))} />

        {/* ── Quick actions ── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Card
                  key={action.label}
                  className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setLocation(action.href)}
                >
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className={`w-9 h-9 rounded-lg ${action.bg} flex items-center justify-center`}>
                      <Icon className={`h-4 w-4 ${action.color}`} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold leading-tight">{action.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">{action.description}</p>
                    </div>
                    <div className="flex items-center gap-1 mt-auto">
                      <span className={`text-[10px] font-medium ${action.color}`}>Open</span>
                      <ArrowRight className={`h-3 w-3 ${action.color}`} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* ── Bottom grid: recent claims + role summary ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent claims */}
          <Card className="lg:col-span-2 border-0 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Recent Claims Activity</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                  onClick={() => setLocation("/insurer/claims/triage")}
                >
                  View all <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="divide-y divide-border">
                {recentClaims.length === 0 ? (
                  <div className="px-5 py-8 text-center text-muted-foreground text-sm">
                    No recent claims activity
                  </div>
                ) : (
                  recentClaims.map((claim: any) => (
                    <div
                      key={claim.id}
                      className="px-5 py-3 flex items-center gap-4 hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => setLocation(`/insurer/claims/${claim.id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {claim.claimNumber ?? `CLM-${claim.id.slice(0, 8).toUpperCase()}`}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {claim.vehicleRegistration ?? "—"} · {claim.incidentType ?? "Motor"}
                        </p>
                      </div>
                      <StatusChip status={claim.status} />
                      <p className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
                        {claim.createdAt
                          ? new Date(claim.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
                          : "—"}
                      </p>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Admin profile + role directory */}
          <div className="space-y-4">
            {/* Admin profile card */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">Your Admin Profile</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-teal-700">
                        {(user?.name ?? user?.email ?? "A").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{user?.name ?? "Admin User"}</p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Role</span>
                      <RoleBadge role="insurer_admin" />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Access Level</span>
                      <span className="font-medium">Full Admin</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Permissions</span>
                      <span className="text-teal-600 font-medium">All modules</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Role directory */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">Portal Roles</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-2">
                  {Object.entries(ROLE_LABELS).map(([roleKey, cfg]) => (
                    <div key={roleKey} className="flex items-center justify-between">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          const paths: Record<string, string> = {
                            executive:         "/insurer-portal/executive",
                            claims_manager:    "/insurer-portal/claims-manager",
                            claims_processor:  "/insurer-portal/claims-processor",
                            assessor_internal: "/insurer-portal/internal-assessor",
                            risk_manager:      "/insurer-portal/risk-manager",
                            recovery_officer:  "/insurer-portal/recovery",
                            insurer_admin:     "/insurer-portal/insurer-admin",
                          };
                          setLocation(paths[roleKey] ?? "/insurer-portal");
                        }}
                      >
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Pending Team Invitations ── */}
        <section className="mt-2">
          <PendingTeamRequestQueue />
        </section>

        {/* ── Audit Log ── */}
        <section className="mt-2">
          <div className="flex items-center gap-2 mb-3">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Recent Governance Activity</h2>
          </div>
          <Card className="border-0 shadow-sm">
            <CardContent className="px-0 pb-0">
              {auditLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : auditLog.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <History className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No role changes recorded yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {auditLog.map((entry: any) => {
                    const prevRole = entry.previousInsurerRole ?? entry.previousRole ?? "—";
                    const newRole  = entry.newInsurerRole  ?? entry.newRole  ?? "—";
                    const isDeactivation = !entry.newInsurerRole && entry.newRole === "user";
                    return (
                      <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                        <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${isDeactivation ? "bg-[#FDF0F0]" : "bg-[#F0F7F2]"}`}>
                          <UserCog className={`h-3.5 w-3.5 ${isDeactivation ? "text-red-500" : "text-teal-600"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">
                            <span className="text-foreground">{entry.actorName}</span>
                            {isDeactivation ? (
                              <span className="text-muted-foreground"> deactivated </span>
                            ) : (
                              <span className="text-muted-foreground"> changed role of </span>
                            )}
                            <span className="text-foreground">{entry.subjectName}</span>
                          </p>
                          {!isDeactivation && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {prevRole.replace(/_/g, " ")} → {newRole.replace(/_/g, " ")}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 pt-0.5">
                          {new Date(entry.timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </InsurerPortalLayout>
  );
}
