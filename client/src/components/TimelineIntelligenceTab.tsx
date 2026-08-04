/**
 * TimelineIntelligenceTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Epic 4 — Timeline Intelligence
 *
 * Renders a platform-wide activity feed and a vehicle-specific timeline lookup.
 * Used in: KingaAgency portal (Timeline Intelligence tab).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Clock, AlertTriangle, Car, Search, Activity,
  FileText, Shield, RefreshCw,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: string | number | null | undefined): string {
  if (!ts) return "—";
  const ms = typeof ts === "number" ? ts : new Date(ts).getTime();
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const SEVERITY_COLOUR: Record<string, string> = {
  critical: "#e74c3c",
  high:     "#e67e22",
  medium:   "#f39c12",
  low:      "#27ae60",
};

// ─── Activity Feed ────────────────────────────────────────────────────────────

function PlatformActivityFeed() {
  const { data, isLoading, refetch } = trpc.timelineIntelligence.getPlatformActivityFeed.useQuery(
    { limit: 25 }
  );

  if (isLoading) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "#888", fontSize: "13px" }}>
        Loading activity feed…
      </div>
    );
  }

  const claims = data?.recentClaims ?? [];
  const alerts = data?.recentAlerts ?? [];

  // Merge and sort by createdAt desc
  type FeedItem =
    | { kind: "claim"; id: number; claimNumber: string; status: string; createdAt: string | number; vehicleRegistration: string | null }
    | { kind: "alert"; id: number; alertType: string; alertSeverity: string; createdAt: string | number; claimId: number };

  const feed: FeedItem[] = [
    ...claims.map((c: any) => ({ kind: "claim" as const, ...c })),
    ...alerts.map((a: any) => ({ kind: "alert" as const, ...a })),
  ].sort((a, b) => {
    const ta = typeof a.createdAt === "number" ? a.createdAt : new Date(a.createdAt).getTime();
    const tb = typeof b.createdAt === "number" ? b.createdAt : new Date(b.createdAt).getTime();
    return tb - ta;
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Activity size={15} style={{ color: "#27ae60" }} />
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#111" }}>Platform Activity Feed</span>
          <span style={{ fontSize: "11px", color: "#888", background: "#f5f5f5", padding: "2px 8px", borderRadius: "10px" }}>
            {feed.length} events
          </span>
        </div>
        <button
          onClick={() => refetch()}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#888", display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {feed.length === 0 ? (
        <div style={{ padding: "32px", textAlign: "center", color: "#888", fontSize: "13px" }}>
          No recent activity.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {feed.map((item, idx) => (
            <div
              key={`${item.kind}-${item.id}-${idx}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "10px 14px",
                background: "#fafafa",
                border: "1px solid #f0f0f0",
                borderRadius: "6px",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: item.kind === "alert" ? "#e74c3c18" : "#27ae6018",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "2px",
                }}
              >
                {item.kind === "alert"
                  ? <AlertTriangle size={13} style={{ color: SEVERITY_COLOUR[item.alertSeverity] ?? "#e74c3c" }} />
                  : <FileText size={13} style={{ color: "#27ae60" }} />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {item.kind === "claim" ? (
                  <>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#111" }}>
                      Claim {item.claimNumber}
                      <span style={{ fontWeight: 400, color: "#666", marginLeft: "6px" }}>
                        · {(item.status ?? "").replace(/_/g, " ")}
                      </span>
                    </div>
                    {item.vehicleRegistration && (
                      <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
                        <Car size={10} style={{ display: "inline", marginRight: "3px" }} />
                        {item.vehicleRegistration}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#111" }}>
                      Fraud Alert
                      <span
                        style={{
                          marginLeft: "6px",
                          fontSize: "10px",
                          fontWeight: 600,
                          padding: "1px 6px",
                          borderRadius: "8px",
                          background: (SEVERITY_COLOUR[item.alertSeverity] ?? "#e74c3c") + "22",
                          color: SEVERITY_COLOUR[item.alertSeverity] ?? "#e74c3c",
                          textTransform: "uppercase",
                        }}
                      >
                        {item.alertSeverity}
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
                      {(item.alertType ?? "").replace(/_/g, " ")} · Claim #{item.claimId}
                    </div>
                  </>
                )}
              </div>
              <div style={{ fontSize: "11px", color: "#aaa", whiteSpace: "nowrap", flexShrink: 0 }}>
                {timeAgo(item.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Vehicle Timeline Lookup ──────────────────────────────────────────────────

function VehicleTimelineLookup() {
  const [reg, setReg] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data, isLoading } = trpc.timelineIntelligence.getVehicleTimeline.useQuery(
    { vehicleRegistration: submitted, limit: 50 },
    { enabled: !!submitted }
  );

  const events = data?.events ?? [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <Car size={15} style={{ color: "#2980b9" }} />
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#111" }}>Vehicle Timeline Lookup</span>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={13} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#aaa" }} />
          <input
            value={reg}
            onChange={e => setReg(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && reg.trim() && setSubmitted(reg.trim())}
            placeholder="Enter vehicle registration (e.g. ABC 1234)"
            style={{
              width: "100%",
              padding: "8px 10px 8px 30px",
              border: "1px solid #e0e0e0",
              borderRadius: "6px",
              fontSize: "13px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <button
          onClick={() => reg.trim() && setSubmitted(reg.trim())}
          style={{
            padding: "8px 16px",
            background: "#1a3a2a",
            color: "#D4A800",
            border: "none",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Search
        </button>
      </div>

      {isLoading && submitted && (
        <div style={{ padding: "24px", textAlign: "center", color: "#888", fontSize: "13px" }}>
          Loading timeline for {submitted}…
        </div>
      )}

      {!isLoading && submitted && events.length === 0 && (
        <div style={{ padding: "24px", textAlign: "center", color: "#888", fontSize: "13px" }}>
          No timeline events found for <strong>{submitted}</strong>.
        </div>
      )}

      {events.length > 0 && (
        <div style={{ position: "relative" }}>
          {/* Timeline line */}
          <div style={{ position: "absolute", left: "13px", top: "8px", bottom: "8px", width: "2px", background: "#e8e8e8" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {events.map((ev: any, idx: number) => (
              <div key={idx} style={{ display: "flex", gap: "16px", paddingLeft: "4px" }}>
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    background: "#fff",
                    border: "2px solid #27ae60",
                    flexShrink: 0,
                    marginTop: "2px",
                    zIndex: 1,
                  }}
                />
                <div style={{ flex: 1, paddingBottom: "4px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#111" }}>
                    {(ev.eventType ?? "").replace(/_/g, " ")}
                  </div>
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "2px", lineHeight: 1.5 }}>
                    {ev.description}
                  </div>
                  <div style={{ fontSize: "10px", color: "#aaa", marginTop: "3px" }}>
                    {ev.eventDate ? new Date(ev.eventDate).toLocaleDateString() : "—"}
                    {" · "}
                    {(ev.sourceTable ?? "").replace(/_/g, " ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function TimelineIntelligenceTab() {
  return (
    <div style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <Clock size={16} style={{ color: "#27ae60" }} />
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#111", margin: 0 }}>
            Timeline Intelligence
          </h2>
          <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "8px", background: "#27ae6018", color: "#27ae60", textTransform: "uppercase" }}>
            Epic 4
          </span>
        </div>
        <p style={{ fontSize: "12px", color: "#888", margin: 0 }}>
          Unified chronological event feed across claims, fraud alerts, and vehicle history.
        </p>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px" }}>
        <PlatformActivityFeed />
        <VehicleTimelineLookup />
      </div>
    </div>
  );
}
