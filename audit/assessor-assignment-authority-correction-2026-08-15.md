# AUD-P0-002 Assessor Evaluation Authority and Assignment-History Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 15 August 2026  
**Status:** P0 corrected and verified; optional email delivery remains separately open  
**Scope:** Assessor evaluation identity/tenant enforcement and authoritative in-app assignment history. No L1/L2 formula, quotation, policy, payment, settlement, or report lifecycle was changed.

## Corrected Security Boundary

The evaluation submission path no longer trusts a caller-supplied assessor identity. It derives the evaluator from the authenticated user and rejects the submission unless that user has the `assessor` role, belongs to the claim tenant, and is the assessor currently assigned to that claim. The evaluation is persisted with that authorised claim tenant. An optional legacy `assessorId` input remains only for compatibility and is not used as an authority value.

> A person may not submit an assessor evaluation merely by naming an assessor. KINGA verifies the signed-in assessor, the claim assignment, and the tenant before accepting the evaluation.

## Assignment History and Notification Model

The migration introduced `claim_assignments` as the authoritative in-app assignment history. It records assignment/reassignment lineage, actor, assignee, tenant, assignment source, acceptance-ready status fields, reason, in-app notification state, and email-delivery metadata. Existing `claims.assigned_assessor_id` continues as the active pointer for compatibility, while `claim_assignments` retains the durable history.

| Assignment behaviour | Implemented result |
|---|---|
| In-app authority | A new assignment record is written before notification; assignment authority never depends on email. |
| Reassignment history | Previous active assessor history is marked `reassigned`; the new assignment is appended. |
| In-app notification | The assignment record is updated once the existing in-app notification is created. |
| Email request | Email may be requested as an optional delivery channel and is recorded as delivery metadata only. It cannot create, change, accept, or approve an assignment. |
| Legacy continuity | The migration created **420** `legacy_import` history snapshots for already assigned claims. Existing claim values were not changed. |

## Remaining Email Delivery Boundary

The existing `notifyAssessorAssignment` helper currently invokes the platform owner-notification channel after looking up the assessor. It is therefore **not yet verified as delivery to the assigned assessor’s mailbox**. This is recorded as **AUD-P1-024**. The correction has made email opt-in and non-authoritative, but a real assignee email-delivery adapter and delivery-reference contract require separately approved work. KINGA’s in-app notification and assignment record remain the complete operational path in the meantime.

## Validation Evidence

| Validation | Result |
|---|---|
| Authoritative evaluator and assignment-history no-write contract | 2 tests passed |
| Existing assessor ecosystem assignment integration | 20 tests passed |
| Combined authority/routing/assignment group | 3 files, 26 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |
| Migration verification | `claim_assignments`: 422 rows, of which 420 are legacy snapshots |

## Conclusion

AUD-P0-002 is corrected: evaluator identity, claim assignment, and tenant scope are now enforced before write. Assignment is durably recorded in-app with reassignment history. This provides the secure foundation required before the separate assessor-report evidence, attestation, review, and routing lifecycle can be implemented. Optional external email delivery is intentionally not treated as completed until it demonstrably reaches the assigned assessor and returns an auditable provider reference.

## References

1. [Evaluation submission procedure](../server/routers.ts)
2. [Claims assignment procedure](../server/routers/claims-core.ts)
3. [Assignment history helper](../server/db.ts)
4. [Claim assignment migration](../drizzle/migrations/20260815_claim_assignment_history.sql)
5. [Assignment authority regression](../server/reporting/assessorAssignmentAuthority.p0.test.ts)
