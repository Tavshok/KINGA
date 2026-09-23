# P0-B1 Canonical Fraud-Hold Remediation Proposal

**Date:** 23 September 2026
**Status:** Proposal only. The rebased P0-B1 integration is blocked. No source remediation is authorized by this document.
**Author:** Manus AI

## Decision requested

Approve a narrow remediation that replaces the router-local fraud hold in `server/routers/ai-assessments-core.ts` with the shared P0-B1 fraud-hold contract. The work is separate from P0-B1-Client and does not widen the browser-consumer scope.

The independent adversarial review found that `P0_FRAUD_REVIEW_HOLD` and `withP0FraudHold()` define and distribute a second status, explanation, required-evidence, and evidence-requirements payload. The local payload is used by assessment retrieval, bulk listing, enforcement, snapshot creation and retrieval, finalisation, and claim-list output. Although it is fail-closed in intent, a second authority payload can drift from the canonical contract and undermine the single publication boundary.

> **Required correction:** every P0-B1 fraud hold must derive its authority-facing fields from the one shared canonical contract. An endpoint may add endpoint-specific, non-authority metadata only after it builds the canonical hold.

## Exact remediation scope

The package changes the following execution boundary and regression coverage.

| Surface                                         | Current concern                                                                                                                                  | Required change                                                                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/routers/ai-assessments-core.ts`         | Defines `P0_FRAUD_REVIEW_HOLD` and `withP0FraudHold()` locally, then returns or spreads them through six assessment and snapshot paths.          | Delete the local status, explanation, evidence, and decision-authority payload. Import `buildP0B1FraudDecisionHold`, `P0_B1_FRAUD_DECISION_HOLD`, and `throwP0B1FraudDecisionHold` from `server/evidence-governance/p0FraudDecisionHold`. |
| Assessment retrieval and listing                | Legacy assessment records are spread into output with local hold fields.                                                                         | Retain only independently supported assessment fields permitted by the existing allowlist. Attach a freshly built canonical hold; do not retain raw fraud fields or re-create evidence wording locally.                                   |
| Enforcement, snapshot, replay, and finalisation | The local contract is used as a response object, nested Phase 2 decision, validation error, or manually assembled `PRECONDITION_FAILED` message. | Use the canonical hold object for response shapes. Where an error is required, use `throwP0B1FraudDecisionHold()` so the message follows the same canonical explanation and evidence list.                                                |
| Claim-list projection                           | The list publishes the router-local hold as `fraudDecision`.                                                                                     | Publish `buildP0B1FraudDecisionHold()` with no score, level, indicator, classification, or router-local authority alias.                                                                                                                  |
| Regression coverage                             | Existing tests verify the old local alias rather than contractual identity.                                                                      | Add behavioral and source-bound regressions that prove each returned hold has the canonical status, review requirement, actionable explanation, and three required-evidence entries, while no local duplicate contract remains.           |

## Explicit non-scope

This package does not change fraud eligibility policy, add a governing fraud authority, modify P0-A-2 collision-physics controls, repair the separately inventoried browser consumers, change schema or data, or access staging or production. The 47 reachable runtime browser consumers identified by the P0-B1-Client estimate remain a separate program.

## Invariants

The remediation must preserve the following conditions.

1. **Single authority contract.** The shared P0-B1 hold is the only source of fraud-withholding status, explanation, required evidence, and actionable evidence requirements.
2. **Fail closed.** A missing, malformed, stale, or caller-supplied fraud value does not create a benign result, a score, a level, a classification, a routing action, or a decision conclusion.
3. **Authorization before withholding.** Existing session, tenant, claim, assessment, and snapshot authorization remains ahead of a P0 hold when a caller requests a tenant-scoped resource.
4. **Non-fraud evidence survives.** Existing allowlisted claim, vehicle, cost, quote, and workflow context remains available when independently supported.
5. **No new client claim.** This server-bound repair does not claim that the separate browser-consumer inventory is closed.

## Estimate and review plan

The expected implementation is **0.5–1 engineer-day** across **three to five files**: the assessment router, its focused tenant/assessment authority test, the P0-B1 fraud-decision regression, and, if needed, one narrow shared-contract assertion suite. Complexity is low, but review remains **adversarial** because the defect spans automated-decision authority, fraud publication, assessment snapshots, and tenant-scoped read paths.

Focused validation will use `scripts/run-isolated-vitest.ts` against `kinga_ci_test` only. It will cover each affected response shape, a malformed or caller-supplied fraud field, cross-tenant and tenantless requests, error-versus-response behavior, and preservation of the canonical P0-A-2 collision-physics marker. The existing P0-B1 combined matrix will then be rerun. A full guarded suite and production build remain merge-readiness gates, not intermediate gates.

## Current blocked state

The rebased P0-B1 integration has a green sequential guarded matrix of 30 suites, including the P0-A-2 collision-physics presentation, canonical-PDF, Stage 10, and Physics Truth invariants. That result does not override the independent review. The integration remains blocked until this canonical-contract remediation has been implemented, re-reviewed, and revalidated.

## References

[1]: https://github.com/Tavshok/KINGA/blob/main/server/evidence-governance/p0FraudDecisionHold.ts "Canonical P0-B1 fraud hold contract"
[2]: https://github.com/Tavshok/KINGA/blob/main/server/routers/ai-assessments-core.ts "Assessment router with P0-B1 hold consumers"
[3]: https://github.com/Tavshok/KINGA "KINGA repository"
