# Quote-Audit Target Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

`quotes.runAudit` accepted arbitrary numeric quote and claim identifiers from any authenticated account. It read quote line items, sent them to the audit engine, and wrote review fields without first proving that the quote belonged to the supplied claim, the claim belonged to the caller's tenant, or the caller was the claim's assigned assessor. This exposed a cross-tenant evidence-read and mutation path.

## Correction

The procedure now requires an authorised assessor identity and an actor tenant. It loads the target quote, requires its `claimId` to equal the supplied claim, resolves that claim in the actor's tenant, and requires the exact `assignedAssessorId` before any line-item read, assessment read, audit-engine invocation, or audit-field update. Denied requests return a non-enumerating `NOT_FOUND` result.

## Verification

The isolated actual-procedure suite passed **5/5**. The added regression proves an unassigned same-tenant assessor is denied before the quote-audit flow can read line items, invoke the audit engine, or write audit data. The wider suite also preserves authenticated repairer quote and exact-assigned-assessor adjustment authority.

Final direct verification found zero synthetic claims, quotes, repairer profiles, and users. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No production quote, claim, L1/L2 result, audit outcome, policy, payment, settlement, or financial record changed.

## References

1. [Quote router](../server/routers/quotes-core.ts)
2. [Actual authority regression](../server/panel-beater/quoteSubmissionAuthority.p0.test.ts)
3. [Assessor authority helper](../server/assessor-role-authority.ts)
