/**
 * AssetPassport.tsx — Phase 3A
 * List all assets and view the full passport for each.
 * Route: /engineer/asset-passport
 */
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Package, ChevronLeft, Shield, Wrench, FileText, AlertTriangle } from "lucide-react";

function RiskBadge({ rating }: { rating?: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    low: { bg: "#dcfce7", text: "#166534" },
    medium: { bg: "#fef9c3", text: "#854d0e" },
    high: { bg: "#fee2e2", text: "#991b1b" },
    critical: { bg: "#fce7f3", text: "#831843" },
  };
  const c = colors[rating ?? "low"] ?? colors.low;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: c.bg, color: c.text }}>
      {rating ?? "low"}
    </span>
  );
}

function PassportDetail({ assetId, onBack }: { assetId: number; onBack: () => void }) {
  const { data, isLoading } = trpc.assetPassport.getPassport.useQuery({ assetId });
  const { data: history } = trpc.assetPassport.getInspectionHistory.useQuery({ assetId, limit: 10 });

  if (isLoading) return <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>Loading passport…</div>;
  if (!data) return <div style={{ padding: 32, textAlign: "center", color: "#dc2626" }}>Asset not found</div>;

  const { asset, inspectionSummary, claimSummary, riskSummary } = data;

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", background: "none", border: "none", color: "#6b7280", fontSize: 13, cursor: "pointer", marginBottom: 16 }}>
        <ChevronLeft style={{ width: 14, height: 14 }} /> Back to Assets
      </button>

      {/* Header */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111", margin: 0 }}>{asset.assetName ?? asset.assetRef}</h2>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              {asset.manufacturer} {asset.model} {asset.yearManufactured ? `(${asset.yearManufactured})` : ""} · Ref: {asset.assetRef}
            </div>
            {asset.vehicleRegistration && <div style={{ fontSize: 12, color: "#6b7280" }}>Registration: {asset.vehicleRegistration}</div>}
          </div>
          <RiskBadge rating={asset.riskRating} />
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "Total Inspections", value: Number(inspectionSummary.totalInspections), icon: FileText },
          { label: "Completed", value: Number(inspectionSummary.completedInspections), icon: Wrench },
          { label: "Claims", value: claimSummary.totalClaims, icon: Shield },
          { label: "Open Risks", value: Number(riskSummary.openRisks ?? 0), icon: AlertTriangle, warn: Number(riskSummary.openRisks ?? 0) > 0 },
        ].map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} style={{ background: "#fff", border: `1px solid ${k.warn ? "#fca5a5" : "#e5e7eb"}`, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Icon style={{ width: 14, height: 14, color: k.warn ? "#dc2626" : "#6b7280" }} />
                <span style={{ fontSize: 11, color: "#6b7280" }}>{k.label}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.warn ? "#dc2626" : "#111" }}>{k.value}</div>
            </div>
          );
        })}
      </div>

      {/* Inspection History */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", fontWeight: 600, fontSize: 13, color: "#111" }}>Inspection History</div>
        {(history?.inspections?.length ?? 0) === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No inspections recorded</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["ID", "Status", "Physics", "AI Approved", "Duration", "Date"].map(h => (
                  <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #f3f4f6" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(history?.inspections ?? []).map((ins: any) => (
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
        )}
      </div>
    </div>
  );
}

export default function AssetPassport() {
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [riskFilter, setRiskFilter] = useState<"" | "low" | "medium" | "high" | "critical">("");
  const { data, isLoading } = trpc.assetPassport.listAssets.useQuery({ limit: 100, riskRating: riskFilter || undefined });
  const assets = data?.assets ?? [];

  if (selectedAssetId !== null) {
    return (
      <div style={{ fontFamily: "Inter, sans-serif", background: "#F7F8F6", minHeight: "100vh", padding: "24px" }}>
        <PassportDetail assetId={selectedAssetId} onBack={() => setSelectedAssetId(null)} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#F7F8F6", minHeight: "100vh", padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", margin: 0 }}>Asset Passport</h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Full lifecycle view of every inspected asset</p>
        </div>
        <select value={riskFilter} onChange={e => setRiskFilter(e.target.value as any)} style={{ padding: "7px 12px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 12, background: "#fff" }}>
          <option value="">All Risk Ratings</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {isLoading ? (
        <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>Loading assets…</div>
      ) : assets.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 40, textAlign: "center" }}>
          <Package style={{ width: 32, height: 32, color: "#d1d5db", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>No assets registered yet</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {assets.map((a: any) => (
            <div key={a.id} onClick={() => setSelectedAssetId(a.id)} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{a.assetName ?? a.assetRef}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{a.manufacturer} {a.model} {a.yearManufactured ? `· ${a.yearManufactured}` : ""}</div>
                </div>
                <RiskBadge rating={a.riskRating} />
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#6b7280" }}>
                <span>📋 {a.inspectionCount ?? 0} inspections</span>
                {a.vehicleRegistration && <span>🚗 {a.vehicleRegistration}</span>}
                {a.lastInspectedAt && <span>🕐 {new Date(a.lastInspectedAt).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
