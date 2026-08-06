/**
 * EngineeringIntelligenceDashboard.tsx — Phase 3B
 * Engineering intelligence: summary, inspection trends, measurement analytics,
 * observation analytics, and physics quality metrics.
 * Route: /engineer/intelligence
 */
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";

function KpiCard({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${warn ? "#fca5a5" : "#e5e7eb"}`, borderRadius: 10, padding: "14px 18px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: warn ? "#dc2626" : "#111" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: "20px 0 10px" }}>{children}</h3>;
}

export default function EngineeringIntelligenceDashboard() {
  const [days, setDays] = useState(90);
  const { data: summary, isLoading } = trpc.engineeringIntelligence.getSummary.useQuery({ days });
  const { data: trends } = trpc.engineeringIntelligence.getInspectionTrends.useQuery({ days });
  const { data: measurements } = trpc.engineeringIntelligence.getMeasurementAnalytics.useQuery({ days });
  const { data: observations } = trpc.engineeringIntelligence.getObservationAnalytics.useQuery({ days });
  const { data: physics } = trpc.engineeringIntelligence.getPhysicsQualityMetrics.useQuery({ days });
  const { data: recent } = trpc.engineeringIntelligence.getRecentInspections.useQuery({ limit: 10 });

  const s = summary as any;
  const t = trends as any;
  const m = measurements as any;
  const o = observations as any;
  const p = physics as any;
  const r = recent as any;

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#F7F8F6", minHeight: "100vh", padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", margin: 0 }}>Engineering Intelligence</h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Analytics and quality metrics for the engineering team</p>
        </div>
        <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ padding: "7px 12px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 12, background: "#fff" }}>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
          <option value={365}>Last 365 days</option>
        </select>
      </div>

      {isLoading ? (
        <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>Loading intelligence data…</div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 4 }}>
            <KpiCard label="Total Inspections" value={Number(s?.totalInspections ?? 0)} />
            <KpiCard label="Completed" value={Number(s?.completedInspections ?? 0)} />
            <KpiCard label="Physics Reconciled" value={Number(s?.physicsReconciledCount ?? 0)} />
            <KpiCard label="KINGA Approved" value={Number(s?.aiApprovedCount ?? 0)} />
            <KpiCard label="Avg Duration" value={s?.avgDurationMinutes ? `${Math.round(Number(s.avgDurationMinutes))}m` : "—"} />
          </div>

          {/* Inspection Trends Chart */}
          {t?.trends?.length > 0 && (
            <>
              <SectionTitle>Inspection Trends</SectionTitle>
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 20px", height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={t.trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#111" strokeWidth={2} dot={false} name="Inspections" />
                    <Line type="monotone" dataKey="completed" stroke="#16a34a" strokeWidth={2} dot={false} name="Completed" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* Measurement Analytics */}
          {m && (
            <>
              <SectionTitle>Measurement Analytics</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <KpiCard label="Total Measurements" value={Number(m.totalMeasurements ?? 0)} />
                <KpiCard label="Avg per Inspection" value={m.avgPerInspection ? Number(m.avgPerInspection).toFixed(1) : "—"} />
                <KpiCard label="Unique Zones" value={m.uniqueZones ?? "—"} />
              </div>
            </>
          )}

          {/* Observation Analytics */}
          {o && (
            <>
              <SectionTitle>Observation Analytics</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <KpiCard label="Total Observations" value={Number(o.totalObservations ?? 0)} />
                <KpiCard label="KINGA Drafted" value={Number(o.aiDraftedCount ?? 0)} />
                <KpiCard label="Voice Transcribed" value={Number(o.voiceTranscribedCount ?? 0)} />
              </div>
            </>
          )}

          {/* Physics Quality Metrics */}
          {p && (
            <>
              <SectionTitle>Physics Quality Metrics</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <KpiCard label="Physics Runs" value={Number(p.totalPhysicsRuns ?? 0)} />
                <KpiCard label="Passed" value={Number(p.passedCount ?? 0)} />
                <KpiCard label="Failed" value={Number(p.failedCount ?? 0)} warn={(p.failedCount ?? 0) > 0} />
                <KpiCard label="Pass Rate" value={p.passRate ? `${Math.round(Number(p.passRate))}%` : "—"} />
              </div>
            </>
          )}

          {/* Recent Inspections */}
          {(r?.inspections?.length ?? 0) > 0 && (
            <>
              <SectionTitle>Recent Inspections</SectionTitle>
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["ID", "Status", "Physics", "AI", "Duration", "Date"].map(h => (
                        <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #f3f4f6" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(r.inspections ?? []).map((ins: any) => (
                      <tr key={ins.id} style={{ borderBottom: "1px solid #f9fafb" }}>
                        <td style={{ padding: "9px 12px", fontSize: 12, fontFamily: "monospace" }}>#{ins.id}</td>
                        <td style={{ padding: "9px 12px", fontSize: 12 }}>{ins.status}</td>
                        <td style={{ padding: "9px 12px", fontSize: 12 }}>{ins.physicsReconciled ? "✅" : "—"}</td>
                        <td style={{ padding: "9px 12px", fontSize: 12 }}>{ins.aiAnalysisApproved ? "✅" : "—"}</td>
                        <td style={{ padding: "9px 12px", fontSize: 12, color: "#6b7280" }}>{ins.durationMinutes ? `${ins.durationMinutes}m` : "—"}</td>
                        <td style={{ padding: "9px 12px", fontSize: 12, color: "#9ca3af" }}>{ins.createdAt ? new Date(ins.createdAt).toLocaleDateString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
