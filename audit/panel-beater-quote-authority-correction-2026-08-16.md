# Panel-Beater and Assessor Quote Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The repair quotation router accepted a caller-supplied `panelBeaterId` for standard, strip-requote, and supplementary quote paths. It did not derive repairer identity from the session, verify the claim tenant, verify that the repairer was selected or assigned for that claim, or verify that a parent quote belonged to that repairer before supersession or supplementation. Standard quote writes also did not persist the authorised tenant ID. Separately, the assessor adjustment mutation accepted any authenticated caller and a numeric quote ID.

## Correction

All repairer-originated quote mutations now use one authenticated scope resolver. It requires a top-level panel-beater account, an approved same-tenant panel-beater profile bound to that exact user, a same-tenant claim, and evidence that the repairer is either selected for quotation or assigned for repair. The profile ID derived from the session is persisted; caller-supplied repairer ID cannot substitute another repairer.

Strip and supplementary requests additionally confirm that the parent quote has the same claim, repairer, and tenant before any quote status update or insert. Standard submissions now persist the authorised tenant ID. Assessor adjustment requires an authorised assessor role, a same-tenant quote claim, and the exact claim-assigned assessor identity before quote mutation.

| Mutation | Corrected authority boundary |
|---|---|
| `quotes.submit` | Authenticated approved repairer profile, same-tenant selected/assigned claim, and session-derived repairer ID required before quote/line-item/workflow/event/notification work. |
| `quotes.submitStripRequote` | Above boundary plus same-tenant, same-claim, same-repairer parent quote required before supersession. |
| `quotes.submitSupplementary` | Above boundary plus same-tenant, same-claim, same-repairer parent quote required before insertion. |
| `quotes.adjustByAssessor` | Exact assigned assessor and same-tenant target claim required before adjustment. |

## Verification

The isolated actual-procedure regression passed **4/4**. It proved that a foreign repairer cannot submit a quote or supersede another repairer's quote; an authorised repairer can submit and supplement only its own quote; caller-supplied repairer identity substitution is denied; and an unassigned assessor cannot adjust a quote while the exact assigned assessor can adjust the controlled fixture.

Final direct verification found zero synthetic claims, quotes, repairer profiles, and users. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No production quote, claim, L1/L2 result, valuation, policy, payment, settlement, or financial record changed.

## References

1. [Quote router](../server/routers/quotes-core.ts)
2. [Actual authority regression](../server/panel-beater/quoteSubmissionAuthority.p0.test.ts)
3. [Assessor authority helper](../server/assessor-role-authority.ts)
