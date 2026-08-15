# AUD-P0-002 Assessor Acceptance and Valid Submission Workflow Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 15 August 2026  
**Status:** Corrected and verified  
**Scope:** Authenticated assessor assignment acceptance and evaluation submission workflow only. No quotation, L1/L2 calculation, policy, payment, settlement, or assessor-report evidence lifecycle was changed.

## Corrected Workflow

The authorised sequence is now **assigned → accepted → under assessment → internal review**. Only the authenticated assessor who is currently assigned to the tenant-scoped claim can accept the in-app assignment. Acceptance updates the durable `claim_assignments` history and transitions the claim through the central workflow engine. The evaluator submission then requires that accepted assignment before it can persist an evaluation and transition the claim to internal review.

The duplicate internal-review transition was removed. The shared `updateClaimStatus` path already performs the governed workflow transition, so a second direct transition previously produced an invalid `internal_review → internal_review` state. The evaluator’s authenticated product role is mapped to the established `assessor_internal` workflow-audit vocabulary only after application-level assessor identity and assignment checks have passed.

## Actual Procedure Evidence

| Scenario | Result |
|---|---|
| Assigned same-tenant assessor accepts then submits | Accepted; evaluation persisted under authenticated assessor and claim tenant; workflow reaches internal review |
| Caller supplies a different `assessorId` | Ignored as non-authoritative compatibility input; authenticated assigned assessor remains the saved evaluator |
| Foreign-tenant assessor context | Denied before evaluation creation |
| Same-tenant but unassigned assessor | Denied before evaluation creation |
| Denied submission side effects | No evaluation, claim status/workflow transition, audit entry, or claim event is created |
| Pending assignment submission | Denied until authenticated acceptance is recorded |
| Internal review precondition | Existing KINGA assessment requirement remains enforced; the test uses a completed assessment fixture |

## Validation

| Validation | Result |
|---|---|
| Actual assessor ecosystem authority and transition matrix | 22 tests passed |
| Assignment-authority contract | 2 tests passed |
| Combined actual workflow matrix | 24 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

## Remaining Boundaries

This correction does **not** make the assessor evaluation summary traceable to a submitted assessor report. AUD-P1-021 through AUD-P1-023 remain open for the separate schema-first evidence, attestation, and claims-assessor/manager review-routing lifecycle. AUD-P1-024 remains open because optional email delivery has not yet been proven to reach the assigned assessor; in-app assignment and notification remain authoritative.

## References

1. [Assessor evaluation router](../server/routers.ts)
2. [Assignment history helper](../server/db.ts)
3. [Workflow engine](../server/workflow-engine.ts)
4. [Actual assessor ecosystem matrix](../server/assessor-ecosystem-integration.test.ts)
