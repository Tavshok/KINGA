import { trpc } from "@/lib/trpc";
import { Brain, CheckCircle, AlertTriangle, XCircle, Activity, RefreshCw, Clock } from "lucide-react";
import { useState } from "react";

const ENGINES = [
  { name: "Document Intelligence", stages: ["1_intake","2_ocr","3_structured_extraction","4_validation","5_claim_assembly"], icon: "📄" },
  { name: "Vehicle Valuation", stages: ["6_vehicle_valuation"], icon: "🚗" },
  { name: "Damage Detection", stages: ["7_damage_analysis","11_vision_enrichment"], icon: "🔍" },
  { name: "Photo Forensics", stages: ["7a_photo_forensics"], icon: "📷" },
  { name: "Physics Engine", stages: ["7b_causal_reasoning","7c_physics"], icon: "⚡" },
  { name: "Fraud Engine", stages: ["7d_fraud_scoring","7e_narrative"], icon: "🛡️" },
  { name: "Cost Engine", stages: ["8_repair_intelligence","9_parts_reconciliation","10_cost_intelligence"], icon: "💰" },
  { name: "Risk Engine", stages: ["10e_risk"], icon: "📊" },
  { name: "CGI Engine", stages: ["10d_cgi"], icon: "🎨" },
  { name: "Explainability Engine", stages: ["10a_interpretation","10b_decision_authority"], icon: "💡" },
  { name: "Reporting Engine", stages: ["10c_report_readiness"], icon: "📋" },
];

function deriveStatus(stageStats: any[], stages: string[]) {
  const rows = stageStats.filter((s: any) => stages.includes(s.stageId));
  const total = rows.reduce((n: number, r: any) => n + Number(r.total), 0);
  const failed = rows.reduce((n: number, r: any) => n + Number(r.failed), 0);
  const completed = rows.reduce((n: number, r: any) => n + Number(r.completed), 0);
  const running = rows.reduce((n: number, r: any) => n + Number(r.running), 0);
  const last1h = rows.reduce((n: number, r: any) => n + Number(r.last1h), 0);
  const failRate = total > 0 ? failed / total : 0;
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 100;
  const status = failRate > 0.2 ? "offline" : failRate > 0.05 ? "degraded" : "online";
  return { total, failed, completed, running, last1h, successRate, status };
}

const STATUS_STYLES: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  online:   { bg: "#f0fdf4", border: "#bbf7d0", dot: "#22c55e", label: "Online" },
  degraded: { bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b", label: "Degraded" },
  offline:  { bg: "#fef2f2", border: "#fecaca", dot: "#ef4444", label: "Offline" },
};

export default function IntelligenceEngineMonitoring() {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const { data: health, isLoading, refetch } = trpc.admin.getPlatformHealth.useQuery(undefined, {
    refetchInterval: autoRefresh ? 15_000 : false,
  });
  const stageStats: any[] = (health as any)?.stageStats ?? [];
  const assessStats = (health as any)?.assessStats;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#F7F8F6', minHeight: '100vh', padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>Intelligence Engine Monitoring</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>Real-time status for all 11 shared AI engines</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setAutoRefresh(v => !v)} style={{ fontSize: 12, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: autoRefresh ? '#f0fdf4' : '#fff', color: autoRefresh ? '#16a34a' : '#374151', cursor: 'pointer' }}>
            <RefreshCw style={{ width: 12, height: 12, display: 'inline', marginRight: 4 }} />
            {autoRefresh ? 'Live' : 'Manual'}
          </button>
          <button onClick={() => refetch()} style={{ fontSize: 12, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Refresh</button>
        </div>
      </div>

      {/* Platform-wide quality strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Assessments', value: isLoading ? '…' : Number(assessStats?.total ?? 0) },
          { label: 'Avg Confidence', value: isLoading ? '…' : `${Math.round(Number(assessStats?.avgConf ?? 0))}%` },
          { label: 'High Fraud Flags', value: isLoading ? '…' : Number(assessStats?.highFraud ?? 0) },
          { label: 'Assessments (24h)', value: isLoading ? '…' : Number(assessStats?.last24h ?? 0) },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{kpi.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Engine cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {ENGINES.map(engine => {
          const stats = deriveStatus(stageStats, engine.stages);
          const style = STATUS_STYLES[stats.status];
          return (
            <div key={engine.name} style={{ background: '#fff', border: `1px solid ${style.border}`, borderRadius: 12, padding: 20, borderTop: `3px solid ${style.dot}` }}>
              {/* Engine header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{engine.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{engine.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 20, background: style.bg, border: `1px solid ${style.border}` }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: style.dot }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: style.dot }}>{style.label}</span>
                </div>
              </div>

              {/* Activity metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div style={{ padding: '8px 10px', background: '#f9fafb', borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>Requests today</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>{stats.total}</div>
                </div>
                <div style={{ padding: '8px 10px', background: '#f9fafb', borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>This hour</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>{stats.last1h}</div>
                </div>
                <div style={{ padding: '8px 10px', background: '#f9fafb', borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>Success rate</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: stats.successRate >= 95 ? '#16a34a' : stats.successRate >= 80 ? '#d97706' : '#dc2626' }}>{stats.successRate}%</div>
                </div>
                <div style={{ padding: '8px 10px', background: '#f9fafb', borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>Failed requests</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: stats.failed > 0 ? '#dc2626' : '#111' }}>{stats.failed}</div>
                </div>
              </div>

              {/* Stages */}
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>Pipeline stages</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {engine.stages.map(s => (
                  <span key={s} style={{ fontSize: 10, padding: '2px 6px', background: '#f3f4f6', borderRadius: 4, color: '#6b7280', fontFamily: 'monospace' }}>{s}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
