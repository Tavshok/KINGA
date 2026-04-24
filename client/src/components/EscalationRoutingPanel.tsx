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
    containerCls: "bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-800",
    textCls: "text-green-700 dark:text-green-300",
    badgeCls: "bg-green-200 text-green-900 dark:bg-green-900/50 dark:text-green-200",
  },
  ADJUSTER_REVIEW: {
    label: "Adjuster Review",
    icon: "⚑",
    containerCls: "bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800",
    textCls: "text-amber-700 dark:text-amber-300",
    badgeCls: "bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200",
  },
  FRAUD_TEAM: {
    label: "Fraud Investigation Unit",
    icon: "⚠",
    containerCls: "bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-800",
    textCls: "text-red-700 dark:text-red-300",
    badgeCls: "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200",
  },
} as const;

const PRIORITY_CONFIG = {
  LOW: { label: "Low Priority", textCls: "text-green-600 dark:text-green-400", dotCls: "bg-green-500 dark:bg-green-400" },
  MEDIUM: { label: "Medium Priority", textCls: "text-amber-600 dark:text-amber-400", dotCls: "bg-amber-500 dark:bg-amber-400" },
  HIGH: { label: "High Priority", textCls: "text-red-600 dark:text-red-400", dotCls: "bg-red-500 dark:bg-red-400" },
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
          ? "No KINGA assessment available for routing."
          : "Unable to determine escalation route. The claim may not have been assessed yet."}
      </div>
    );
  }

  const routeConf = ROUTE_CONFIG[data.route_to];
  const priorityConf = PRIORITY_CONFIG[data.priority];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Main Route Banner */}
      <div className={`rounded-lg px-5 py-4 flex items-start gap-3.5 border-2 ${routeConf.containerCls}`}>
        {/* Icon */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 text-white ${routeConf.badgeCls}`}>
          {routeConf.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
            <span className={`text-base font-bold ${routeConf.textCls}`}>
              {routeConf.label}
            </span>
            {/* Priority badge */}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded border uppercase tracking-wide ${priorityConf.textCls} border-current`}>
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
              ? "var(--status-approve-text)"
              : data.metadata.confidence_band === "MEDIUM"
              ? "var(--status-review-text)"
              : data.metadata.confidence_band === "LOW"
              ? "var(--status-reject-text)"
              : "var(--muted-foreground)"
          }
        />

        {/* Fraud Detected */}
        <MetaCard
          label="Fraud Signal"
          value={data.metadata.fraud_detected ? "Detected" : "None"}
          sub={data.metadata.fraud_detected ? "Fraud indicators present" : "No fraud indicators"}
          color={data.metadata.fraud_detected ? "var(--status-reject-text)" : "var(--status-approve-text)"}
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
              ? "var(--status-reject-text)"
              : data.metadata.anomaly_count > 0
              ? "var(--status-review-text)"
              : "var(--status-approve-text)"
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
