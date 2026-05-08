/**
 * InsurerAdminDashboard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Insurer-level administration panel.
 * Accessible by: insurer_admin role only.
 *
 * Sections:
 *  1. KPI Overview — live claims, fraud, processing metrics
 *  2. Team Members — list of all insurer users in this tenant with their roles
 *  3. Quick Actions — links to workflow settings, reports, fraud analytics
 *  4. Recent Activity — latest claims activity across the tenant
 */

import InsurerPortalLayout from "@/components/InsurerPortalLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

// ─── Role display helpers ─────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  executive:         { label: "Executive",          color: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  claims_manager:    { label: "Claims Manager",     color: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  claims_processor:  { label: "Claims Processor",   color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  assessor_internal: { label: "Internal Assessor",  color: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  assessor_external: { label: "External Assessor",  color: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  risk_manager:      { label: "Risk Manager",       color: "bg-red-500/15 text-red-300 border-red-500/30" },
  recovery_officer:  { label: "Recovery Officer",   color: "bg-lime-500/15 text-lime-300 border-lime-500/30" },
  insurer_admin:     { label: "Insurer Admin",      color: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
};

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_LABELS[role] ?? { label: role, color: "bg-slate-500/15 text-slate-300 border-slate-500/30" };
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
    color: "text-violet-400",
    bg: "bg-violet-500/10",
  },
  {
    label: "Workflow Analytics",
    description: "Processing times, throughput, and bottlenecks",
    icon: BarChart3,
    href: "/insurer-portal/workflow-analytics",
    color: "text-teal-400",
    bg: "bg-teal-500/10",
  },
  {
    label: "Fraud Analytics",
    description: "Fraud detection overview and FCDI flags",
    icon: ShieldAlert,
    href: "/insurer/fraud-analytics",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
  },
  {
    label: "Reports Centre",
    description: "Generate and download all report types",
    icon: FileBarChart,
    href: "/insurer-portal/reports-centre",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    label: "Claims Triage",
    description: "Review and action incoming claims",
    icon: ClipboardList,
    href: "/insurer/claims/triage",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    label: "Recovery Cases",
    description: "Monitor third-party recovery queue",
    icon: Layers,
    href: "/insurer-portal/recovery",
    color: "text-lime-400",
    bg: "bg-lime-500/10",
  },
];

// ─── Status chip ──────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    submitted:             "bg-blue-500/15 text-blue-300",
    triage:                "bg-yellow-500/15 text-yellow-300",
    assessment_in_progress:"bg-amber-500/15 text-amber-300",
    comparison:            "bg-violet-500/15 text-violet-300",
    completed:             "bg-emerald-500/15 text-emerald-300",
    fraud_flagged:         "bg-rose-500/15 text-rose-300",
    rejected:              "bg-red-500/15 text-red-300",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${map[status] ?? "bg-slate-500/15 text-slate-300"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function InsurerAdminDashboard() {
  const { user } = useAuth();
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

  // KPI card data
  const kpiSummary = (kpis as any)?.summaryMetrics;
  const kpiCards = [
    {
      label: "Total Claims",
      value: kpiSummary?.totalClaims ?? "—",
      icon: ClipboardList,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      sub: `${kpiSummary?.activeClaims ?? 0} active`,
    },
    {
      label: "Completion Rate",
      value: kpiSummary?.completionRate != null ? `${kpiSummary.completionRate}%` : "—",
      icon: CheckCircle2,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      sub: `${kpiSummary?.completedClaims ?? 0} completed`,
    },
    {
      label: "Fraud Detected",
      value: kpiSummary?.fraudDetected ?? "—",
      icon: AlertTriangle,
      color: "text-rose-400",
      bg: "bg-rose-500/10",
      sub: "flagged cases",
    },
    {
      label: "Avg Processing",
      value: kpiSummary?.avgProcessingTime != null ? `${kpiSummary.avgProcessingTime}d` : "—",
      icon: Clock,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      sub: "days per claim",
    },
    {
      label: "AI Savings",
      value: kpiSummary?.totalSavings != null
        ? `R ${Number(kpiSummary.totalSavings).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`
        : "—",
      icon: TrendingUp,
      color: "text-teal-400",
      bg: "bg-teal-500/10",
      sub: "total AI-driven savings",
    },
    {
      label: "High-Value Claims",
      value: kpiSummary?.highValueClaims ?? "—",
      icon: Activity,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
      sub: "above threshold",
    },
  ];

  return (
    <InsurerPortalLayout>
      <div className="p-6 space-y-8">
        {/* ── Page header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Insurer Administration</h1>
            <p className="text-sm text-slate-400 mt-1">
              Company-wide overview, team management, and portal configuration
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs text-slate-300 font-medium">
                {(user as any)?.tenantName ?? "Your Organisation"}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
              onClick={() => setRefreshKey(k => k + 1)}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>
        </div>

        {/* ── KPI cards ── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">
            Live KPIs
          </h2>
          {kpisLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-slate-800/60 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {kpiCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.label}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-2"
                  >
                    <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
                      <Icon className={`h-4 w-4 ${card.color}`} />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-white leading-none">{card.value}</p>
                      <p className="text-[11px] text-slate-400 mt-1">{card.label}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">{card.sub}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Quick actions ── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={() => setLocation(action.href)}
                  className="group bg-slate-900 border border-slate-800 rounded-xl p-4 text-left hover:bg-slate-800/80 hover:border-slate-700 transition-all duration-150 flex flex-col gap-3"
                >
                  <div className={`w-9 h-9 rounded-lg ${action.bg} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                    <Icon className={`h-4 w-4 ${action.color}`} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white leading-tight">{action.label}</p>
                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed line-clamp-2">{action.description}</p>
                  </div>
                  <div className="flex items-center gap-1 mt-auto">
                    <span className={`text-[10px] font-medium ${action.color}`}>Open</span>
                    <ArrowRight className={`h-3 w-3 ${action.color} group-hover:translate-x-0.5 transition-transform`} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Bottom grid: recent claims + role summary ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent claims */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Recent Claims Activity</h2>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-slate-400 hover:text-white h-7 px-2"
                onClick={() => setLocation("/insurer/claims/triage")}
              >
                View all <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
            <div className="divide-y divide-slate-800">
              {recentClaims.length === 0 ? (
                <div className="px-5 py-8 text-center text-slate-500 text-sm">
                  No recent claims activity
                </div>
              ) : (
                recentClaims.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="px-5 py-3 flex items-center gap-4 hover:bg-slate-800/40 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/insurer/claims/${claim.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {claim.claimNumber ?? `CLM-${claim.id.slice(0, 8).toUpperCase()}`}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {claim.vehicleRegistration ?? "—"} · {claim.incidentType ?? "Motor"}
                      </p>
                    </div>
                    <StatusChip status={claim.status} />
                    <p className="text-xs text-slate-500 flex-shrink-0 hidden sm:block">
                      {claim.createdAt
                        ? new Date(claim.createdAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })
                        : "—"}
                    </p>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-600 flex-shrink-0" />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Role summary + admin info */}
          <div className="space-y-4">
            {/* Admin profile card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Your Admin Profile</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-white">
                      {(user?.name ?? user?.email ?? "A").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{user?.name ?? "Admin User"}</p>
                    <p className="text-xs text-slate-400 truncate">{user?.email ?? ""}</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Role</span>
                    <RoleBadge role="insurer_admin" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Access Level</span>
                    <span className="text-white font-medium">Full Admin</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Permissions</span>
                    <span className="text-teal-400 font-medium">All modules</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Role summary */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Portal Roles</h2>
              <div className="space-y-2">
                {Object.entries(ROLE_LABELS).map(([roleKey, cfg]) => (
                  <div key={roleKey} className="flex items-center justify-between">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-slate-500 hover:text-white"
                      onClick={() => {
                        const paths: Record<string, string> = {
                          executive:         "/insurer-portal/executive",
                          claims_manager:    "/insurer-portal/claims-manager",
                          claims_processor:  "/insurer-portal/claims-processor",
                          assessor_internal: "/insurer-portal/internal-assessor",
                          assessor_external: "/insurer-portal/external-assessor",
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
            </div>
          </div>
        </div>
      </div>
    </InsurerPortalLayout>
  );
}
