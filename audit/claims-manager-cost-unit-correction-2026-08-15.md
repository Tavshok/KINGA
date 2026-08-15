# Claims Manager Assessment Cost-Unit Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 15 August 2026  
**Status:** Corrected and verified

The correction aligns the Claims Manager assessment and assessor comparison with the stored-cent monetary contract. `ai_assessments.estimated_cost` and the accepted assessor report’s `estimated_repair_cost` now remain in cents for comparison and are each supplied once to the tenant currency formatter.

| Audited input | Corrected display/result |
|---|---|
| KINGA assessment: 150,000 cents | USD 1,500.00 |
| Accepted assessor cost: 100,000 cents | USD 1,000.00 |
| Assessor versus KINGA variance | -33.3% |

The actual rendering regression proves the prior USD 150,000.00 display and -99.3% mixed-unit variance no longer render. The correction changes neither assessment values nor L1/L2, quote, policy, payment, settlement, or workflow logic.

| Validation | Result |
|---|---|
| Actual Claims Manager rendering regression | 4 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

## References

1. [Claims Manager comparison view](../client/src/pages/ClaimsManagerComparisonView.tsx)
2. [Actual rendering regression](../server/reporting/crossReportUiTruthAudit.p1.test.ts)
