# AUD-P1-017/018 Claims Manager Canonical Cost Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 15 August 2026  
**Status:** Corrected and verified  
**Scope:** Decision-facing Claims Manager quote presentation only. No source quotation, claim, L1/L2 formula, workflow, policy, payment, settlement, or stored record was changed.

## Corrected Authority Model

Claims Manager now consumes `buildClaimsManagerCostProjection`, a small client projection derived from the persisted Stage 9 `compositeOptimisation` payload. The projection uses the canonical ledger’s active/supplementary entries and accepts an explicit `final_l2_eligible` marker where supplied. It derives L1, L2, verification, and potential savings from the existing shared cost-decision contract rather than recalculating a new cost from raw rows.

Raw quotation rows remain present in the comparison view. Entries outside the canonical eligible set are visibly marked **Quote history** and the summary states that they are excluded from L1/L2 comparison. This preserves evidence transparency without allowing cancelled, rejected, superseded, duplicate, inferred, or explicitly ineligible rows to determine a professional cost conclusion.

> **Display rule:** Stored `quotedAmount` is a cent value. It is passed to the tenant currency formatter exactly once. No professional summary may print a cent integer as a currency amount.

## Corrected Rendering Outcome

| Evidence input | Corrected Claims Manager result |
|---|---|
| Cancelled quotation: 80,000 cents | Rendered as **USD 800.00**, labelled Quote history, excluded from L1/L2 |
| Eligible submitted quotation: 120,000 cents | Drives canonical L1 of **USD 1,200.00** |
| Persisted complete L2: USD 1,100 | Rendered as **KINGA Optimised Quote — USD 1,100.00** |
| Complete L1/L2 difference: USD 100 | Rendered as **Potential savings — USD 100.00** |

The prior raw path displayed the cancelled 80,000-cent value as `$80,000` and selected it as “Lowest Quote.” The corrected renderer proves that neither result remains possible in the approved fixture.

## Validation Evidence

| Validation | Result |
|---|---|
| Canonical projection and actual Claims Manager render regression | 4 tests passed |
| Canonical L1/L2 and cross-surface presentation group | 5 files, 13 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

## Conclusion

AUD-P1-017 and AUD-P1-018 are resolved. Claims Manager now shares the same eligible evidence authority as CL, CI, FR, and client Top Cost, while retaining qualified quotation history. The correction is presentation- and projection-only; it does not alter the underlying quotation evidence or approved calculation policy.

## References

1. [Claims Manager canonical projection](../client/src/lib/claimsManagerCostProjection.ts)
2. [Claims Manager comparison view](../client/src/pages/ClaimsManagerComparisonView.tsx)
3. [Shared cost-decision contract](../shared/costDecisionPresentation.ts)
4. [Projection regression](../server/reporting/claimsManagerCostProjection.p1.test.ts)
5. [Actual rendering regression](../server/reporting/crossReportUiTruthAudit.p1.test.ts)
