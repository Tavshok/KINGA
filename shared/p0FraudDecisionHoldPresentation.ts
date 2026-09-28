export const P0_B1_FRAUD_EVIDENCE_REQUIREMENTS = Object.freeze([
  Object.freeze({
    code: "CLAIM_LINKED_EVIDENCE",
    missing:
      "Independently verifiable, claim-linked documentary or metadata evidence",
    resolver:
      "A claims or fraud investigator attaches the source record or metadata and an immutable evidence reference to the claim.",
  }),
  Object.freeze({
    code: "HUMAN_PROVENANCE_REVIEW",
    missing: "Human-reviewed evidence with auditable provenance",
    resolver:
      "An assigned fraud reviewer verifies the evidence and records reviewer identity, timestamp, rationale, and source provenance.",
  }),
  Object.freeze({
    code: "QUALIFIED_POLICY_AUTHORITY",
    missing: "A future owner-approved qualified automated-decision policy",
    resolver:
      "The fraud-governance owner approves and versions the permitted inputs, authority scope, retention, publication, and action policy.",
  }),
]);

export const P0_B1_FRAUD_DECISION_HOLD = Object.freeze({
  status: "FRAUD_DECISION_WITHHELD" as const,
  reviewRequired: true as const,
  actionAllowed: false as const,
  allowedActions: Object.freeze([]) as readonly never[],
  explanation:
    "Automated fraud scoring, risk classification, routing, certification, and publication are withheld because current evidence has no qualified governing authority.",
  requiredEvidence: Object.freeze(
    P0_B1_FRAUD_EVIDENCE_REQUIREMENTS.map(requirement => requirement.missing)
  ),
  evidenceRequirements: P0_B1_FRAUD_EVIDENCE_REQUIREMENTS,
  resolver: Object.freeze({
    owner: "Assigned claims or fraud reviewer",
    action:
      "Obtain and validate every required evidence item, record auditable provenance, and reprocess only through a future owner-approved qualified automated-decision policy.",
    unresolvedAction:
      "Keep the claim in manual review; do not infer, score, route, certify, notify, persist, or publish fraud risk.",
  }),
});

export type P0B1FraudDecisionHold = typeof P0_B1_FRAUD_DECISION_HOLD;

type P0B1WithheldPayload =
  | { status: "FRAUD_DECISION_WITHHELD" }
  | { fraudDecision: { status: "FRAUD_DECISION_WITHHELD" } };

/**
 * A discriminated boundary for browser consumers of a potentially held P0-B1
 * response. `AVAILABLE.value` deliberately excludes the direct and nested
 * hold shapes, making any later legacy numeric access type-checkable only in
 * the executable branch where the withheld sentinel has already stopped it.
 */
export type P0B1FraudDecisionResponse<T> =
  | {
      kind: "WITHHELD";
      hold: P0B1FraudDecisionHold;
      value: null;
    }
  | {
      kind: "AVAILABLE";
      hold: null;
      value: Exclude<T, P0B1WithheldPayload>;
    };

/**
 * Identifies the canonical P0-B1 withheld-decision sentinel at either a
 * direct route boundary or a nested `fraudDecision` projection. The check is
 * deliberately status-based: a malformed sentinel must still take the
 * fail-closed rendering path, where the UI normalizes it to actionable shared
 * guidance instead of treating absent legacy fields as zeroes or statistics.
 */
export function getP0B1FraudDecisionHold(
  value: unknown
): P0B1FraudDecisionHold | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  if (candidate.status === "FRAUD_DECISION_WITHHELD") {
    return P0_B1_FRAUD_DECISION_HOLD;
  }

  const nested = candidate.fraudDecision;
  if (
    nested &&
    typeof nested === "object" &&
    (nested as Record<string, unknown>).status === "FRAUD_DECISION_WITHHELD"
  ) {
    return P0_B1_FRAUD_DECISION_HOLD;
  }

  return null;
}

export function discriminateP0B1FraudDecisionResponse<T>(
  value: T
): P0B1FraudDecisionResponse<T> {
  const hold = getP0B1FraudDecisionHold(value);
  if (hold) {
    return {
      kind: "WITHHELD",
      hold,
      value: null,
    };
  }

  return {
    kind: "AVAILABLE",
    hold: null,
    value: value as Exclude<T, P0B1WithheldPayload>,
  };
}

/**
 * Returns a mutable per-use copy of the shared P0-B1 manual-review contract.
 * Shared constants remain immutable so neither browser nor server consumers can
 * alter another consumer's required evidence or resolution guidance.
 */
export function buildP0B1FraudDecisionHold<T extends Record<string, unknown>>(
  additions?: T
): T & P0B1FraudDecisionHold {
  return {
    ...additions,
    ...P0_B1_FRAUD_DECISION_HOLD,
    allowedActions: [],
    requiredEvidence: [...P0_B1_FRAUD_DECISION_HOLD.requiredEvidence],
    evidenceRequirements: P0_B1_FRAUD_EVIDENCE_REQUIREMENTS.map(
      requirement => ({
        ...requirement,
      })
    ),
    resolver: { ...P0_B1_FRAUD_DECISION_HOLD.resolver },
  } as unknown as T & P0B1FraudDecisionHold;
}
