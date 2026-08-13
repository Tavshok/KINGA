# R0 Controlled Work Notice — Evidence-Governed Top-Cost-Strip Replacement

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Proposed — no implementation is authorised by this notice  
**Related controls:** R0 report decision integrity, evidence governance foundation, progressive L2 intelligence, evidence-gap intelligence

## 1. Purpose

This controlled work package addresses the remaining R0-H/R0-I presentation risk: a report’s top cost strip can still appear to state a final figure or display an incomplete quote set before the reader reaches the evidence-governed cost sections. The replacement must make the first financial view consistent with the shared cost resolver and decision-integrity contract used by the Claims Ledger (CL), Cost Intelligence (CI), and Forensic Decision Report (FR).

The replacement is a **presentation and contract-convergence task only**. It must not alter submitted quotations, evidence, L2 calculations, claim state, insurer decisions, assessment data, policy records, premium, repair scope, settlement, payment, or user records.

## 2. Non-negotiable presentation contract

The new top-of-report cost presentation must be derived only from the shared evidence-governed report contract. It must never independently calculate, format, substitute, or infer a monetary result.

| Evidence state | Top-of-report presentation | Permitted conclusion |
|---|---|---|
| No submitted quote | State that no submitted quotation is available; show no monetary recommendation. | None. |
| Total-only submitted quote | Show the documented total with source status; make clear that component comparison is unavailable. | Documented total only. |
| Itemised but incomplete quote coverage | Show evidence-qualified component comparison and the explicit gap; suppress final all-in L2, savings, settlement, or approval conclusion. | Progressive L2 comparison only. |
| Complete all-in submitted quote coverage | Show submitted quote comparison and all-in L2 only when the shared decision resolver permits it. | Evidence-qualified decision, subject to the existing shared hold rules. |

The strip must display **all active, deduplicated submitted quotation totals** that the shared resolver recognises. It must not display a fabricated single quote, an assessor calibration amount as a settlement source, a benchmark substitution, an inferred labour/VAT/paint/fee line, `NaN`, `$0.00` used as a fallback, or an unqualified savings figure.

## 3. Cross-report requirements

The CL, CI, and FR must use the same source labels, monetary units, status vocabulary, and decision boundary. Layout may differ by report purpose, but a reader must not receive a conflicting cost conclusion when moving between reports.

| Report | Required top-cost content | Explicit boundary |
|---|---|---|
| Claims Ledger | Submitted quote coverage, progressive L2 state, gaps, and operational next step. | No settlement recommendation where scope is incomplete. |
| Cost Intelligence | Submitted quote comparison, component coverage, selected submitted prices, benchmarks as comparison metadata only. | No benchmark replacement and no inferred line items. |
| Forensic Decision Report | Evidence provenance, governing cost state, and qualified decision boundary beside technical findings. | Pre-loss evidence and cost comparison must not be represented as causation, liability, or settlement outcome. |

## 4. Implementation limits

The approved implementation, if granted, may:

1. Replace or suppress legacy top-cost-strip renderers in CL, CI, FR, and the shared top client-cost presentation where they diverge from the shared resolver.
2. Add a small shared presenter/view-model layer, keeping modules maintainable and avoiding duplicate cost logic.
3. Add immutable fixture-driven regressions for no quote, total-only, incomplete itemised, and complete all-in evidence states.
4. Add rendering regressions for no stale zero, `NaN`, missing submitted-quote total, benchmark substitution, or unsupported final conclusion.

The implementation may not alter the existing submitted-price-only L2 engine, modify quotation/evidence persistence, recalculate historical claim values, trigger assessment, generate reports in production, send notifications, or perform provider calls.

## 5. Acceptance matrix

| Test | Required result |
|---|---|
| Shared four-state fixture suite | CL, CI, FR, and top client-cost presentation show the same typed evidence state and permitted conclusion. |
| Deduplicated submitted quotes | Every active submitted quote total appears once, with no duplicate repairer quotation treated as a second source. |
| Incomplete component coverage | Progressive comparison remains visible; all-in L2, savings, approval, and settlement language remain withheld. |
| Complete all-in coverage | All-in L2 appears only when the shared decision contract authorises it. |
| Monetary safety | No raw cents/dollars mismatch, `$0.00` fallback, `NaN`, fabricated total, inferred charge, or benchmark replacement. |
| Cross-report decision parity | CL, CI, FR, and client top-cost view have no contradictory governing cost/hold state. |
| Regression and build | Focused Vitest suite, bundled server build, and Vite production build pass. |

## 6. Definition of done

The package is complete only when the legacy top strip no longer contradicts the evidence-governed cost resolver; all four evidence states are rendered accurately across CL, CI, FR, and the top client view; and the focused regression and production-build evidence is recorded. The package does not close any live-provider or authenticated-browser acceptance gate.

## 7. Approval request

Approval is requested to implement **only** the presentation convergence and regression work described above. Any discovery requiring a change to quote evidence, L2 selection, claim/assessment lifecycle, policy, premium, repair cost, settlement, payment, external provider, or operational data must be separately checkpointed and presented for approval.
