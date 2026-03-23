/**
 * EscalationRoutingPanel.tsx
 *
 * Displays the escalation routing decision for a claim:
 * - Route destination (AUTO_APPROVE | ADJUSTER_REVIEW | FRAUD_TEAM)
 * - Priority (LOW | MEDIUM | HIGH)
 * - Reason text
 * - Metadata (confidence band, fraud detected, anomaly counts, routing rule)
 */

import { trpc } from "@/lib/trpc";

interface EscalationRoutingPanelProps {
  claimId: number;
}

const ROUTE_CONFIG = {
  AUTO_APPROVE: {
    label: "Auto-Approve",
    icon: "✓",
    bg: "oklch(0.25 0.08 145)",
    border: "oklch(0.45 0.18 145)",
    text: "oklch(0.85 0.18 145)",
    badge: "oklch(0.40 0.18 145)",
  },
  ADJUSTER_REVIEW: {
    label: "Adjuster Review",
    icon: "⚑",
    bg: "oklch(0.25 0.08 60)",
    border: "oklch(0.55 0.18 60)",
    text: "oklch(0.90 0.18 60)",
    badge: "oklch(0.50 0.18 60)",
  },
  FRAUD_TEAM: {
    label: "Fraud Investigation Unit",
    icon: "⚠",
    bg: "oklch(0.22 0.08 25)",
    border: "oklch(0.55 0.20 25)",
    text: "oklch(0.88 0.20 25)",
    badge: "oklch(0.50 0.20 25)",
  },
} as const;

const PRIORITY_CONFIG = {
  LOW: { label: "Low Priority", color: "oklch(0.65 0.15 145)", dot: "oklch(0.55 0.18 145)" },
  MEDIUM: { label: "Medium Priority", color: "oklch(0.75 0.18 60)", dot: "oklch(0.65 0.20 60)" },
  HIGH: { label: "High Priority", color: "oklch(0.75 0.20 25)", dot: "oklch(0.65 0.22 25)" },
} as const;

export default function EscalationRoutingPanel({ claimId }: EscalationRoutingPanelProps) {
  const { data, isLoading, error } = trpc.decision.routeClaimById.useQuery(
    { claimId },
    { retry: false }
  );

  if (isLoading) {
    return (
      <div style={{ padding: "16px", color: "var(--muted-foreground)", fontSize: "13px" }}>
        Determining escalation route…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: "16px", color: "var(--muted-foreground)", fontSize: "13px" }}>
        {error?.message?.includes("NOT_FOUND")
          ? "No AI assessment available for routing."
          : "Unable to determine escalation route. The claim may not have been assessed yet."}
      </div>
    );
  }

  const routeConf = ROUTE_CONFIG[data.route_to];
  const priorityConf = PRIORITY_CONFIG[data.priority];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Main Route Banner */}
      <div
        style={{
          background: routeConf.bg,
          border: `1.5px solid ${routeConf.border}`,
          borderRadius: "8px",
          padding: "16px 20px",
          display: "flex",
          alignItems: "flex-start",
          gap: "14px",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            background: routeConf.badge,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "18px",
            flexShrink: 0,
            color: "white",
          }}
        >
          {routeConf.icon}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
            <span style={{ fontSize: "16px", fontWeight: 700, color: routeConf.text }}>
              {routeConf.label}
            </span>
            {/* Priority badge */}
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: priorityConf.color,
                background: "rgba(255,255,255,0.06)",
                border: `1px solid ${priorityConf.dot}`,
                borderRadius: "4px",
                padding: "2px 8px",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              ● {priorityConf.label}
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: 0, lineHeight: 1.5 }}>
            {data.reason}
          </p>
        </div>
      </div>

      {/* Metadata Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "8px",
        }}
      >
        {/* Confidence Band */}
        <MetaCard
          label="Confidence Band"
          value={data.metadata.confidence_band}
          sub={data.metadata.confidence != null ? `${data.metadata.confidence}%` : "N/A"}
          color={
            data.metadata.confidence_band === "HIGH"
              ? "oklch(0.65 0.18 145)"
              : data.metadata.confidence_band === "MEDIUM"
              ? "oklch(0.70 0.18 60)"
              : data.metadata.confidence_band === "LOW"
              ? "oklch(0.70 0.18 30)"
              : "var(--muted-foreground)"
          }
        />

        {/* Fraud Detected */}
        <MetaCard
          label="Fraud Signal"
          value={data.metadata.fraud_detected ? "Detected" : "None"}
          sub={data.metadata.fraud_detected ? "Fraud indicators present" : "No fraud indicators"}
          color={data.metadata.fraud_detected ? "oklch(0.70 0.20 25)" : "oklch(0.65 0.18 145)"}
        />

        {/* Anomalies */}
        <MetaCard
          label="Anomalies"
          value={String(data.metadata.anomaly_count)}
          sub={
            data.metadata.critical_anomaly_count > 0
              ? `${data.metadata.critical_anomaly_count} critical`
              : "None critical"
          }
          color={
            data.metadata.critical_anomaly_count > 0
              ? "oklch(0.70 0.20 25)"
              : data.metadata.anomaly_count > 0
              ? "oklch(0.70 0.18 60)"
              : "oklch(0.65 0.18 145)"
          }
        />

        {/* Routing Rule */}
        <MetaCard
          label="Routing Rule"
          value={data.metadata.routing_rule.replace("RULE_", "R").replace(/_/g, " ")}
          sub={`Ref: ${data.metadata.routing_rule}`}
          color="var(--muted-foreground)"
          small
        />
      </div>

      {/* Routed At */}
      <div style={{ fontSize: "11px", color: "var(--muted-foreground)", textAlign: "right" }}>
        Routed at {new Date(data.metadata.routed_at).toLocaleString()}
        {data.metadata.claim_reference && ` · ${data.metadata.claim_reference}`}
      </div>
    </div>
  );
}

// ─── MetaCard ─────────────────────────────────────────────────────────────────

function MetaCard({
  label,
  value,
  sub,
  color,
  small = false,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  small?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: "10px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ fontSize: small ? "11px" : "14px", fontWeight: 600, color, lineHeight: 1.3 }}>
        {value}
      </div>
      <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "2px" }}>
        {sub}
      </div>
    </div>
  );
}
