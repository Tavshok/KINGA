/**
 * PredictiveAnalyticsTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Epic 4 — Predictive Analytics
 *
 * Portfolio loss forecast + vehicle renewal risk lookup.
 * Used in: FleetManagerDashboard (Predictive Analytics tab).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { TrendingUp, Car, Search, RefreshCw, AlertTriangle, BarChart2 } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RISK_COLOUR: Record<string, string> = {
  high:   "#e74c3c",
  medium: "#f39c12",
  low:    "#27ae60",
};

function RiskMeter({ score, level }: { score: number; level?: string }) {
  const colour = RISK_COLOUR[level ?? (score >= 70 ? "high" : score >= 40 ? "medium" : "low")] ?? "#888";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div
        style={{
          flex: 1,
          height: "8px",
          borderRadius: "4px",
          background: "#f0f0f0",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(score, 100)}%`,
            height: "100%",
            background: colour,
            borderRadius: "4px",
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span style={{ fontSize: "13px", fontWeight: 700, color: colour, minWidth: "32px", textAlign: "right" }}>
        {score}
      </span>
    </div>
  );
}

// ─── Portfolio Loss Forecast ──────────────────────────────────────────────────

function PortfolioLossForecast() {
  const { fmt: fmtCurrency } = useTenantCurrency();
  const [days, setDays] = useState(90);

  const { data, isLoading, refetch } = trpc.predictiveAnalytics.getPortfolioLossForecast.useQuery(
    { forecastDays: days }
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <BarChart2 size={14} style={{ color: "#2980b9" }} />
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#111" }}>Portfolio Loss Forecast</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            style={{ padding: "4px 8px", border: "1px solid #e0e0e0", borderRadius: "4px", fontSize: "12px", outline: "none" }}
          >
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
            <option value={365}>1 year</option>
          </select>
          <button
            onClick={() => refetch()}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#888", display: "flex", alignItems: "center", gap: "4px", fontSize: "11px" }}
          >
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: "24px", textAlign: "center", color: "#888", fontSize: "12px" }}>Computing forecast…</div>
      ) : !data ? null : (
        <div>
          {/* Forecast tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "16px" }}>
            {[
              {
                label: `Forecasted Claims (${days}d)`,
                value: data.forecastedClaims,
                sub: `Baseline: ${data.baselineClaims} in 90d`,
                colour: "#2980b9",
              },
              {
                label: `Forecasted Loss (${days}d)`,
                value: fmtCurrency(data.forecastedLossCents ?? 0),
                sub: `Avg claim: ${fmtCurrency(data.avgClaimValueCents ?? 0)}`,
                colour: "#e67e22",
              },
              {
                label: "Model Confidence",
                value: `${data.confidence}%`,
                sub: (data.methodology ?? "").replace(/_/g, " "),
                colour: "#27ae60",
              },
            ].map(tile => (
              <div
                key={tile.label}
                style={{
                  padding: "14px 16px",
                  background: tile.colour + "0d",
                  border: `1px solid ${tile.colour}33`,
                  borderRadius: "8px",
                }}
              >
                <div style={{ fontSize: "11px", color: "#666", marginBottom: "6px" }}>{tile.label}</div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: tile.colour }}>{tile.value}</div>
                <div style={{ fontSize: "10px", color: "#aaa", marginTop: "4px" }}>{tile.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "10px", color: "#bbb", textAlign: "right" }}>
            Calculated {new Date(data.calculatedAt ?? "").toLocaleString()} · Sources: {(data.dataSources ?? []).join(", ")}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vehicle Renewal Risk Lookup ──────────────────────────────────────────────

function VehicleRenewalRisk() {
  const [reg, setReg] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data, isLoading } = trpc.predictiveAnalytics.getVehicleRenewalRisk.useQuery(
    { vehicleRegistration: submitted },
    { enabled: !!submitted }
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <Car size={14} style={{ color: "#8e44ad" }} />
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#111" }}>Vehicle Renewal Risk</span>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={12} style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", color: "#aaa" }} />
          <input
            value={reg}
            onChange={e => setReg(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && reg.trim() && setSubmitted(reg.trim())}
            placeholder="Vehicle registration…"
            style={{
              width: "100%",
              padding: "7px 10px 7px 27px",
              border: "1px solid #e0e0e0",
              borderRadius: "6px",
              fontSize: "12px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <button
          onClick={() => reg.trim() && setSubmitted(reg.trim())}
          style={{
            padding: "7px 14px",
            background: "#1a3a2a",
            color: "#D4A800",
            border: "none",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Score
        </button>
      </div>

      {isLoading && submitted && (
        <div style={{ padding: "16px", textAlign: "center", color: "#888", fontSize: "12px" }}>
          Computing renewal risk for {submitted}…
        </div>
      )}

      {!isLoading && data && (
        <div style={{ padding: "16px", background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#111" }}>{data.vehicleRegistration}</span>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: "10px",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                background: (RISK_COLOUR[data.riskLevel ?? "low"] ?? "#888") + "22",
                color: RISK_COLOUR[data.riskLevel ?? "low"] ?? "#888",
              }}
            >
              {data.riskLevel ?? "—"} risk
            </span>
          </div>

          <RiskMeter score={data.score ?? 0} level={data.riskLevel} />

          {data.factors && data.factors.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#888", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Score Factors
              </div>
              {(data.factors as any[]).map((f: any, idx: number) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "5px 0",
                    borderBottom: idx < data.factors!.length - 1 ? "1px solid #f0f0f0" : "none",
                  }}
                >
                  <span style={{ fontSize: "11px", color: "#666" }}>{f.description ?? f.factor}</span>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: f.contribution > 0 ? "#e67e22" : "#27ae60" }}>
                    +{f.contribution}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: "10px", color: "#bbb", marginTop: "10px", textAlign: "right" }}>
            Confidence {data.confidence}% · {data.cached ? "cached" : "live"} · {(data.dataSources ?? []).join(", ")}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function PredictiveAnalyticsTab() {
  return (
    <div style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <TrendingUp size={16} style={{ color: "#2980b9" }} />
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#111", margin: 0 }}>
            Predictive Analytics
          </h2>
          <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "8px", background: "#2980b918", color: "#2980b9", textTransform: "uppercase" }}>
            Epic 4
          </span>
        </div>
        <p style={{ fontSize: "12px", color: "#888", margin: 0 }}>
          Deterministic risk scoring and portfolio loss forecasting.
        </p>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px" }}>
        <PortfolioLossForecast />
        <VehicleRenewalRisk />
      </div>
    </div>
  );
}
