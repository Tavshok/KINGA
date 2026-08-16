# Focused L2 Formula Audit

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Verified — executable contract reconciled

## Confirmed Formula

For each component with traceable eligible submitted evidence, KINGA first identifies `Qmin`, the lowest submitted component price across active eligible quotations. KINGA compares `Qmin` to P50. If the absolute deviation is at most 30%, the selected L2 component cost is P50. If the deviation exceeds 30%, KINGA selects the lower of P50 and `Qmin` and records the material-deviation route. If no P50 exists, KINGA retains `Qmin`. L2 is the sum of selected component values only where complete required scope is priced.

> A benchmark validates selection; it never creates a component. A confirmed damaged component without a traceable submitted price remains an explicit data gap and requires review rather than an invented repair cost.

L1 remains the **lowest whole eligible active submitted quotation total**. Potential savings is L1 less complete L2 and is shown only where both inputs are complete eligible evidence and the difference is positive. It is not settlement authority.

## Executable Reconciliation

| Concern | Executable result | Audit outcome |
|---|---|---|
| Qmin calculation | Component matrix derives the minimum traceable submitted price across eligible active quote entries. | Verified |
| P50 tolerance | `abs(Qmin-P50)/P50 <= 30%` selects P50. | Verified |
| Material deviation | Above 30%, the lower of P50 and Qmin is selected with a selection remark. | Verified |
| No benchmark | Qmin remains the L2 component value. | Verified |
| No submitted component | Required scope enters a data-gap/review state; benchmark fill is false. | Verified |
| >20% line-item spread | Emits a like-for-like scope/specification variance remark. | Verified |
| L1 relationship | L1 uses the explicit eligible whole-quote total when provided, otherwise the lowest normalised eligible quote total. | Verified |
| Completeness and savings | Incomplete required scope presents review-qualified L2 context and suppresses savings. | Verified |
| Professional versus client output | Professionals retain authorised selection trace; claimant output retains concise KINGA Optimised Quote and Potential savings only. | Verified |

## Documentation Integrity Correction

The executable formula was correct, but two maintained comment blocks still described the superseded lowest-submitted-only behaviour. Those descriptions were aligned with the existing confirmed P50/30% rule. This was a documentation-consistency correction only; no calculation, decision, persistence, or presentation logic changed.

## Validation

The no-write reconciliation matrix passed **52 tests across 6 suites**:

| Test coverage | Result |
|---|---|
| Per-component P50/30%, no-benchmark, data-gap, L1, and savings calculations | Passed |
| L2 edge-case publication matrix | Passed |
| Decision-boundary states | Passed |
| CL/CI/FR L2 selection trace | Passed |
| L1/L2 source-to-decision trace | Passed |
| Client warning and disclosure boundary | Passed |

No claim, quote, benchmark, assessment, policy, payment, settlement, or other business record changed.

## References

1. [Composite formula implementation](../server/pipeline-v2/quoteOptimisationEngine.ts)
2. [Executable formula acceptance](../server/pipeline-v2/buildCompositeQuote.test.ts)
3. [L2 edge-case matrix](../server/pipeline-v2/l2EdgeCaseMatrix.p1.test.ts)
4. [Cross-surface L2 trace](../server/reporting/l2SelectionTrace.crossSurface.p1.test.ts)
5. [Claimant decision strip](../server/reporting/clientCostDecisionStrip.l2Warning.p1.test.ts)
