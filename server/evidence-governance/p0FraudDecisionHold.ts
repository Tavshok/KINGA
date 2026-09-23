import { TRPCError } from "@trpc/server";

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

/**
 * Produces an immutable-shape, mutable-instance P0 fraud hold. The returned
 * arrays and nested objects are copied so a consumer cannot alter the shared
 * authority contract for another request.
 */
export function buildP0B1FraudDecisionHold<T extends Record<string, unknown>>(
  additions?: T
): T & typeof P0_B1_FRAUD_DECISION_HOLD {
  return {
    ...additions,
    ...P0_B1_FRAUD_DECISION_HOLD,
    allowedActions: [],
    requiredEvidence: [...P0_B1_FRAUD_DECISION_HOLD.requiredEvidence],
    evidenceRequirements: P0_B1_FRAUD_EVIDENCE_REQUIREMENTS.map(
      requirement => ({ ...requirement })
    ),
    resolver: { ...P0_B1_FRAUD_DECISION_HOLD.resolver },
  } as unknown as T & typeof P0_B1_FRAUD_DECISION_HOLD;
}

export function throwP0B1FraudDecisionHold(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `${P0_B1_FRAUD_DECISION_HOLD.explanation} Required evidence: ${P0_B1_FRAUD_DECISION_HOLD.requiredEvidence.join("; ")}`,
  });
}
