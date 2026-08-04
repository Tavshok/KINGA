/**
 * CrossModuleIntelligencePanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Epic 4 — Cross-Module Intelligence
 *
 * Shows the platform-wide signal summary and recent cross-claim signal feed.
 * Used in: Recovery Portal (sidebar panel) and Risk Manager Dashboard.
 */
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Link2, Users, RefreshCw, Activity } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STRENGTH_COLOUR = (score: number) => {
  if (score >= 30) return "#e74c3c";
  if (score >= 20) return "#e67e22";
  if (score >= 10) return "#f39c12";
  return "#27ae60";
};

function timeAgo(ts: string | number | null | undefined): string {
  if (!ts) return "—";
  const ms = typeof ts === "number" ? ts : new Date(ts).getTime();
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ─── Signal Summary Strip ─────────────────────────────────────────────────────

function SignalSummary() {
  const { data, isLoading } = trpc.crossModuleIntelligence.getPlatformSignalSummary.useQuery();

  if (isLoading) {
    return <div style={{ padding: "16px", textAlign: "center", color: "#888", fontSize: "12px" }}>Loading…</div>;
  }

  const s = data?.signals ?? { totalSignals: 0, activeSignals: 0, highStrengthSignals: 0 };
  const f = data?.fraud ?? { totalAlerts: 0, highSeverityAlerts: 0 };
  const d = data?.drivers ?? { count: 0, stagedSuspects: 0 };

  const tiles = [
    { label: "Active Signals", value: s.activeSignals ?? 0, colour: "#e67e22" },
    { label: "High-Strength", value: s.highStrengthSignals ?? 0, colour: "#e74c3c" },
    { label: "Fraud Alerts", value: f.totalAlerts ?? 0, colour: "#e74c3c" },
    { label: "Repeat Claimers", value: d.count ?? 0, colour: "#8e44ad" },
    { label: "Staged Suspects", value: d.stagedSuspects ?? 0, colour: "#e74c3c" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px", marginBottom: "20px" }}>
      {tiles.map(t => (
        <div
          key={t.label}
          style={{
            padding: "10px 12px",
            background: t.colour + "0d",
            border: `1px solid ${t.colour}33`,
            borderRadius: "6px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "18px", fontWeight: 700, color: t.colour }}>{t.value}</div>
          <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>{t.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Signal Feed ──────────────────────────────────────────────────────────────

function SignalFeed() {
  const { data, isLoading, refetch } = trpc.crossModuleIntelligence.getSignalFeed.useQuery({ limit: 30 });

  const signals = data?.signals ?? [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Link2 size={13} style={{ color: "#8e44ad" }} />
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#111" }}>Cross-Claim Signal Feed</span>
          <span style={{ fontSize: "11px", color: "#888", background: "#f5f5f5", padding: "2px 7px", borderRadius: "10px" }}>
            {signals.length}
          </span>
        </div>
        <button
          onClick={() => refetch()}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#888", display: "flex", alignItems: "center", gap: "4px", fontSize: "11px" }}
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: "24px", textAlign: "center", color: "#888", fontSize: "12px" }}>Loading signals…</div>
      ) : signals.length === 0 ? (
        <div style={{ padding: "24px", textAlign: "center", color: "#888", fontSize: "12px" }}>
          No cross-claim signals found.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {signals.map((sig: any, idx: number) => {
            const score = sig.scoreContribution ?? 0;
            const colour = STRENGTH_COLOUR(score);
            return (
              <div
                key={`${sig.id}-${idx}`}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "9px 12px",
                  background: "#fafafa",
                  border: "1px solid #f0f0f0",
                  borderLeft: `3px solid ${colour}`,
                  borderRadius: "6px",
                }}
              >
                <div
                  style={{
                    minWidth: "32px",
                    textAlign: "center",
                    padding: "2px 6px",
                    borderRadius: "8px",
                    background: colour + "22",
                    color: colour,
                    fontSize: "11px",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  +{score}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#111" }}>
                    {(sig.signalLabel ?? sig.signalType ?? "Signal").replace(/_/g, " ")}
                  </div>
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                    Claim #{sig.claimId}
                    {sig.vehicleRegistration ? ` · ${sig.vehicleRegistration}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: "10px", color: "#aaa", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {timeAgo(sig.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function CrossModuleIntelligencePanel() {
  return (
    <div style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <Activity size={15} style={{ color: "#8e44ad" }} />
          <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#111", margin: 0 }}>
            Cross-Module Intelligence
          </h3>
          <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "8px", background: "#8e44ad18", color: "#8e44ad", textTransform: "uppercase" }}>
            Epic 4
          </span>
        </div>
        <p style={{ fontSize: "11px", color: "#888", margin: 0 }}>
          Signal propagation across claims, fraud, driver, and vehicle domains.
        </p>
      </div>

      <SignalSummary />
      <SignalFeed />
    </div>
  );
}
