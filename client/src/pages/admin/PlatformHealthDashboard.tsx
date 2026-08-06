import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle, AlertTriangle, XCircle, Activity, Brain, Users, Zap,
  Database, Clock, TrendingUp, RefreshCw, ArrowRight, Shield, Server
} from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";

// Engine name mapping from stage IDs to human-readable names
const ENGINE_MAP: Record<string, string> = {
  "1_intake": "Document Intelligence",
  "2_ocr": "Document Intelligence",
  "3_structured_extraction": "Document Intelligence",
  "4_validation": "Document Intelligence",
  "5_claim_assembly": "Document Intelligence",
  "6_vehicle_valuation": "Vehicle Valuation",
  "7_damage_analysis": "Damage Detection",
  "7a_photo_forensics": "Photo Forensics",
  "7b_causal_reasoning": "Physics Engine",
  "7c_physics": "Physics Engine",
  "7d_fraud_scoring": "Fraud Engine",
  "7e_narrative": "Fraud Engine",
  "8_repair_intelligence": "Cost Engine",
  "9_parts_reconciliation": "Cost Engine",
  "10_cost_intelligence": "Cost Engine",
  "10a_interpretation": "Explainability Engine",
  "10b_decision_authority": "Explainability Engine",
  "10c_report_readiness": "Reporting Engine",
  "10d_cgi": "CGI Engine",
  "10e_risk": "Risk Engine",
  "11_vision_enrichment": "Damage Detection",
};

const ENGINES = [
  "Document Intelligence","Vehicle Valuation","Damage Detection","Photo Forensics",
  "Physics Engine","Fraud Engine","Cost Engine","Risk Engine","CGI Engine",
  "Explainability Engine","Reporting Engine"
];

function statusColor(status: string) {
  if (status === "online") return "#22c55e";
  if (status === "degraded") return "#f59e0b";
  return "#ef4444";
}

function statusBg(status: string) {
  if (status === "online") return "#f0fdf4";
  if (status === "degraded") return "#fffbeb";
  return "#fef2f2";
}

function deriveEngineStatus(stageStats: any[], engineName: string): { status: string; total: number; failed: number; last1h: number } {
  const stages = stageStats.filter((s: any) => ENGINE_MAP[s.stageId] === engineName);
  if (stages.length === 0) return { status: "online", total: 0, failed: 0, last1h: 0 };
  const total = stages.reduce((s: number, r: any) => s + Number(r.total), 0);
  const failed = stages.reduce((s: number, r: any) => s + Number(r.failed), 0);
  const last1h = stages.reduce((s: number, r: any) => s + Number(r.last1h), 0);
  const failRate = total > 0 ? failed / total : 0;
  const status = failRate > 0.2 ? "offline" : failRate > 0.05 ? "degraded" : "online";
  return { status, total, failed, last1h };
}

export default function PlatformHealthDashboard() {
  const [, setLocation] = useLocation();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const { data: health, isLoading, refetch } = trpc.admin.getPlatformHealth.useQuery(undefined, {
    refetchInterval: autoRefresh ? 15_000 : false,
  });
  const { data: opsSummary } = trpc.platformOperations.getOperationsSummary.useQuery();
  const { data: aiStats } = trpc.platformOperations.getAiProcessingStats.useQuery();

  const jobStats = (health as any)?.jobStats;
  const stageStats: any[] = (health as any)?.stageStats ?? [];
  const assessStats = (health as any)?.assessStats;
  const tenantStats: any[] = (health as any)?.tenantStats ?? [];
  const recentFailed: any[] = (health as any)?.recentFailed ?? [];

  // Derive platform alerts
  const alerts: { level: "critical" | "warning" | "info"; message: string; action?: string; path?: string }[] = [];
  if (jobStats && Number(jobStats.failed24h) > 10) alerts.push({ level: "critical", message: `${jobStats.failed24h} pipeline jobs failed in the last 24 hours`, action: "View Pipeline Health", path: "/admin/pipeline-health" });
  if (jobStats && Number(jobStats.pending) > 50) alerts.push({ level: "warning", message: `${jobStats.pending} jobs are queued — potential backlog`, action: "View Jobs", path: "/admin/operational-health" });
  if (assessStats && Number(assessStats.highFraud) > 20) alerts.push({ level: "warning", message: `${assessStats.highFraud} high-risk fraud flags require review`, action: "View Fraud", path: "/admin/pipeline-health" });
  if (recentFailed.length > 5) alerts.push({ level: "warning", message: `${recentFailed.length} recent pipeline failures detected`, action: "View Failures", path: "/admin/pipeline-health" });
  if (tenantStats.length === 0) alerts.push({ level: "info", message: "No tenants registered — platform is awaiting first customer onboarding", action: "Register Tenant", path: "/admin/tenants/register" });

  // Overall platform status
  const criticalAlerts = alerts.filter(a => a.level === "critical").length;
  const warningAlerts = alerts.filter(a => a.level === "warning").length;
  const platformStatus = criticalAlerts > 0 ? "critical" : warningAlerts > 0 ? "degraded" : "healthy";

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#F7F8F6', minHeight: '100vh', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>Platform Health</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            {health ? `Last updated ${new Date((health as any).collectedAt).toLocaleTimeString()}` : 'Loading…'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setAutoRefresh(v => !v)}
            style={{ fontSize: 12, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: autoRefresh ? '#f0fdf4' : '#fff', color: autoRefresh ? '#16a34a' : '#374151', cursor: 'pointer' }}
          >
            <RefreshCw style={{ width: 12, height: 12, display: 'inline', marginRight: 4 }} />
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </button>
          <button onClick={() => refetch()} style={{ fontSize: 12, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', color: '#374151', cursor: 'pointer' }}>
            Refresh Now
          </button>
        </div>
      </div>

      {/* Platform Status Banner */}
      <div style={{ padding: '16px 20px', borderRadius: 10, marginBottom: 20, background: platformStatus === 'healthy' ? '#f0fdf4' : platformStatus === 'degraded' ? '#fffbeb' : '#fef2f2', border: `1px solid ${platformStatus === 'healthy' ? '#bbf7d0' : platformStatus === 'degraded' ? '#fde68a' : '#fecaca'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {platformStatus === 'healthy' ? <CheckCircle style={{ width: 20, height: 20, color: '#16a34a' }} /> : platformStatus === 'degraded' ? <AlertTriangle style={{ width: 20, height: 20, color: '#d97706' }} /> : <XCircle style={{ width: 20, height: 20, color: '#dc2626' }} />}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: platformStatus === 'healthy' ? '#15803d' : platformStatus === 'degraded' ? '#92400e' : '#991b1b' }}>
              {platformStatus === 'healthy' ? 'All Systems Operational' : platformStatus === 'degraded' ? 'Platform Degraded — Attention Required' : 'Critical Issues Detected'}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {criticalAlerts} critical · {warningAlerts} warnings · {alerts.filter(a => a.level === 'info').length} informational
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.map((alert, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderRadius: 8, background: alert.level === 'critical' ? '#fef2f2' : alert.level === 'warning' ? '#fffbeb' : '#eff6ff', border: `1px solid ${alert.level === 'critical' ? '#fecaca' : alert.level === 'warning' ? '#fde68a' : '#bfdbfe'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {alert.level === 'critical' ? <XCircle style={{ width: 14, height: 14, color: '#dc2626' }} /> : alert.level === 'warning' ? <AlertTriangle style={{ width: 14, height: 14, color: '#d97706' }} /> : <Activity style={{ width: 14, height: 14, color: '#2563eb' }} />}
                <span style={{ fontSize: 13, color: '#374151' }}>{alert.message}</span>
              </div>
              {alert.action && alert.path && (
                <button onClick={() => setLocation(alert.path!)} style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {alert.action} <ArrowRight style={{ width: 11, height: 11 }} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Jobs (24h)', value: isLoading ? '…' : Number(jobStats?.completed24h ?? 0), icon: <Zap style={{ width: 16, height: 16, color: '#16a34a' }} />, sub: 'completed' },
          { label: 'Failed Jobs (24h)', value: isLoading ? '…' : Number(jobStats?.failed24h ?? 0), icon: <XCircle style={{ width: 16, height: 16, color: '#dc2626' }} />, sub: 'failed' },
          { label: 'Queue Depth', value: isLoading ? '…' : Number(jobStats?.pending ?? 0), icon: <Clock style={{ width: 16, height: 16, color: '#d97706' }} />, sub: 'pending' },
          { label: 'Assessments (24h)', value: isLoading ? '…' : Number(assessStats?.last24h ?? 0), icon: <Brain style={{ width: 16, height: 16, color: '#7c3aed' }} />, sub: 'AI runs' },
          { label: 'Tenants', value: isLoading ? '…' : tenantStats.length, icon: <Users style={{ width: 16, height: 16, color: '#2563eb' }} />, sub: 'active' },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>{kpi.icon}<span style={{ fontSize: 11, color: '#6b7280' }}>{kpi.label}</span></div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#111' }}>{kpi.value}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
        {/* Intelligence Engine Health */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Brain style={{ width: 16, height: 16, color: '#7c3aed' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>Intelligence Engine Health</span>
            </div>
            <button onClick={() => setLocation('/admin/engine-monitoring')} style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
              Full Engine Monitoring →
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {ENGINES.map(engine => {
              const { status, total, failed, last1h } = deriveEngineStatus(stageStats, engine);
              return (
                <div key={engine} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: statusBg(status), border: `1px solid ${statusColor(status)}22` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(status) }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{engine}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{last1h} /hr</div>
                    {failed > 0 && <div style={{ fontSize: 10, color: '#dc2626' }}>{failed} fail</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Tenant Health */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users style={{ width: 14, height: 14, color: '#2563eb' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Tenant Status</span>
              </div>
              <button onClick={() => setLocation('/admin/tenant-monitoring')} style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
                Full View →
              </button>
            </div>
            {tenantStats.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>No tenants registered</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tenantStats.slice(0, 5).map((t: any) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{t.name || t.id}</span>
                    <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{t.tier ?? 'standard'}</span>
                  </div>
                ))}
                {tenantStats.length > 5 && <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>+{tenantStats.length - 5} more tenants</div>}
              </div>
            )}
          </div>

          {/* Quick Navigation */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 12 }}>Quick Navigation</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { label: 'Engine Monitoring', path: '/admin/engine-monitoring', icon: <Brain style={{ width: 12, height: 12 }} /> },
                { label: 'Tenant Monitoring', path: '/admin/tenant-monitoring', icon: <Users style={{ width: 12, height: 12 }} /> },
                { label: 'Operational Health', path: '/admin/operational-health', icon: <Activity style={{ width: 12, height: 12 }} /> },
                { label: 'Activity Timeline', path: '/admin/activity-timeline', icon: <Clock style={{ width: 12, height: 12 }} /> },
                { label: 'Panel Beaters', path: '/admin/panel-beaters', icon: <Shield style={{ width: 12, height: 12 }} /> },
                { label: 'Pipeline Health', path: '/admin/pipeline-health', icon: <Server style={{ width: 12, height: 12 }} /> },
              ].map(item => (
                <button key={item.path} onClick={() => setLocation(item.path)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'none', border: '1px solid #f3f4f6', borderRadius: 6, cursor: 'pointer', textAlign: 'left', color: '#374151', fontSize: 12 }}>
                  {item.icon}{item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
