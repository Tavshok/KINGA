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
import { PortalHeroBand, ProtoAlertBar, ProtoTabBar, ProtoCard, P } from "@/components/PortalHeroBand";
import { PortalHeader, PortalKPIStrip, PortalAlerts, type PortalKPI, type PortalAlert } from "@/components/KingaPortalShell";
import { PendingTeamRequestQueue } from "@/components/insurer/PendingTeamRequestQueue";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useLocation } from "wouter";
import React, { useState } from "react";
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
  Download,
  Zap,
  FileText
} from "lucide-react";

// ─── Role display helpers ─────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, { label: string; color: string; style?: React.CSSProperties }> = {
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
    <div className="min-h-screen" style={{ background: '#F7F8F6', fontFamily: 'Inter, sans-serif' }}>
      <PortalHeroBand
        portalName="Insurer Administration"
        title={(user as any)?.tenantName ?? 'Your Organisation'}
        subtitle="Company-wide overview, team management, and portal configuration"
        actions={[
          { label: 'Refresh', icon: <RefreshCw className="h-3 w-3" />, onClick: () => setRefreshKey(k => k + 1) },
          { label: 'Export Report', icon: <Download className="h-3 w-3" />, primary: true },
        ]}
        kpis={kpiCards.map(card => ({
          label: card.label,
          value: kpisLoading ? '…' : card.value,
          delta: '',
          up: null as any,
          headline: false,
        }))}
      />
      <ProtoAlertBar
        alerts={[
          { count: submittedClaims.length, label: 'submitted claim(s) awaiting triage', severity: 'red' as const },
          { count: fraudClaims.length, label: 'fraud-flagged claim(s) requiring review', severity: 'amber' as const },
        ]}
        ctaLabel="View all alerts"
      />
      {/* ── BODY ── */}
      <div className="p11-body">
        <div className="p11-body-2col">
          {/* ── MAIN COLUMN ── */}
          <div>
            {/* Quick Actions */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <Zap style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Quick Actions
                </div>
              </div>
              <div className="p11-card-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {QUICK_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.label}
                        onClick={() => setLocation(action.href)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '10px 12px', background: '#F7F8F6', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <Icon style={{ width: 16, height: 16, color: 'var(--g-600)' }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{action.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>{action.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Recent Claims Activity */}
            <div className="p11-card" style={{ marginTop: 16 }}>
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <FileText style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Recent Claims Activity
                </div>
                <button
                  onClick={() => setLocation("/insurer/claims/triage")}
                  style={{ fontSize: 11, color: 'var(--g-600)', background: 'none', border: '1px solid var(--g-300)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                >
                  View All
                </button>
              </div>
              <div className="p11-card-body" style={{ padding: 0 }}>
                {recentClaims.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 20px', color: 'var(--muted)', fontSize: 13 }}>No recent claims activity</div>
                ) : (
                  <table className="p11-table">
                    <thead>
                      <tr>
                        <th>Claim #</th>
                        <th>Vehicle</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentClaims.map((claim: any) => (
                        <tr key={claim.id} style={{ cursor: 'pointer' }} onClick={() => setLocation(`/insurer/claims/${claim.id}`)}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--ink)', fontSize: 12 }}>
                            {claim.claimNumber ?? `CLM-${String(claim.id).slice(0, 8).toUpperCase()}`}
                          </td>
                          <td style={{ color: 'var(--muted)', fontSize: 12 }}>{claim.vehicleRegistration ?? '—'}</td>
                          <td><StatusChip status={claim.status} /></td>
                          <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                            {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                          </td>
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
            {/* KPI Summary */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <BarChart3 style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                  Portfolio Summary
                </div>
              </div>
              <div className="p11-card-body">
                {kpiCards.map((card: any) => (
                  <div key={card.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{card.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{kpisLoading ? '…' : card.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Attention Required */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <AlertTriangle style={{ width: 14, height: 14, color: 'var(--amber)' }} />
                  Attention Required
                </div>
              </div>
              <div className="p11-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Awaiting Triage', value: submittedClaims.length, severity: 'red' as const },
                  { label: 'Fraud Flagged', value: fraudClaims.length, severity: 'amber' as const },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: item.severity === 'red' ? '#FDF0F0' : '#FFF8E6', border: `1px solid ${item.severity === 'red' ? '#E8B8B8' : '#E8C97A'}`, borderRadius: 6 }}>
                    <span className={`p11-badge ${item.severity === 'red' ? 'red' : 'amber'}`}>{item.value}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink)' }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
