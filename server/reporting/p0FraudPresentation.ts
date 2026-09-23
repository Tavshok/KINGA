import { buildP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";

/**
 * Presentation-only P0-B1 boundary for reports that may retain independently
 * supported vehicle, cost, readiness, workflow, and operational content.
 *
 * It deliberately contains no score, level, indicator, threshold, or verdict.
 */
export function renderP0B1FraudAbstentionMarker(): string {
  const hold = buildP0B1FraudDecisionHold();
  const requirements = hold.requiredEvidence
    .map(requirement => `<li>${escapeHtml(requirement)}</li>`)
    .join("");

  return `<div class="section" data-p0-fraud-decision="withheld">
    <div class="section-title">Fraud Decision Withheld — Manual Review Required</div>
    <p>${escapeHtml(hold.explanation)}</p>
    <p><strong>What is missing:</strong></p>
    <ul>${requirements}</ul>
    <p><strong>What resolves this:</strong> ${escapeHtml(hold.resolver.action)}</p>
    <p class="small grey">${escapeHtml(hold.resolver.unresolvedAction)}</p>
  </div>`;
}

export function buildP0B1FraudAbstentionText(): string {
  const hold = buildP0B1FraudDecisionHold();
  return [
    "Fraud Decision Withheld — Manual Review Required.",
    hold.explanation,
    `What is missing: ${hold.requiredEvidence.join("; ")}.`,
    `What resolves this: ${hold.resolver.action}`,
  ].join(" ");
}

/**
 * Removes only fraud-specific values from an otherwise valid report payload.
 * This is non-mutating: historical records are retained, while new report
 * projections carry the actionable abstention object instead of inherited risk
 * values, levels, scorecards, or decision traces.
 */
export function redactP0B1FraudReportPayload<T>(value: T): T {
  const redacted = redact(value) as T;
  if (redacted && typeof redacted === "object" && !Array.isArray(redacted)) {
    return {
      ...(redacted as Record<string, unknown>),
      fraudDecision: buildP0B1FraudDecisionHold(),
    } as T;
  }
  return redacted;
}

const FRAUD_FIELD =
  /^(?:fraud(?:_|[A-Z])|risk(?:Score|Level|Class|Rating|Category|Flag|Indicators)?$|overallRisk(?:Level)?$|highRisk$|isHighRisk$|fraudRiskEvaluation$)/;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !FRAUD_FIELD.test(key))
      .map(([key, nestedValue]) => [key, redact(nestedValue)])
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
