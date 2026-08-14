# KINGA L2 Formula Audit and Confirmed Implementation

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 14 August 2026  
**Status:** User-confirmed formula implemented and pending final checkpoint

## Executive Conclusion

The original executable composite path used the lowest eligible submitted component price and displayed benchmark data as comparison metadata. It also contained a separate P25/P75 credibility helper that was not invoked by the composite path. The user has now confirmed the authoritative replacement: **benchmark-validated L2 selection with a 30% benchmark-relative tolerance and a 20% like-for-like submitted-price spread control**.

The implementation preserves KINGA's evidence boundary: no component can be created from a benchmark alone. A submitted eligible price remains the mandatory source anchor, and all submitted, benchmark, tolerance, variance, and selection-path evidence remains traceable.

## Authoritative Cost Formula

| Layer | Formula | Meaning |
|---|---|---|
| **Eligible input** | `Qmin = min(eligible active submitted component prices)` | Only canonical active repair evidence can enter final L1/L2. Withdrawn, comparison-only, ineligible, duplicate, and superseded rows remain historical evidence. |
| **L1** | `min(eligible active whole submitted quote totals)` | The lowest complete eligible submitted repair quotation. |
| **Benchmark deviation** | `D = abs(Qmin − B) / B` | `B` is the system P50 benchmark for the same normalised component and scope. |
| **L2 component** | `B`, if `D ≤ 30%`; otherwise `min(Qmin, B)`; if no benchmark, `Qmin` | The benchmark validates the component amount but never creates a component without submitted evidence. |
| **Line-item spread** | `(max submitted − min submitted) / min submitted` | A spread over 20% adds a scope-verification remark; it does not hide the evidence or invent another amount. |
| **L2 total** | `Σ L2 component` | The sum of benchmark-validated component values, only when scope is complete and submitted totals reconcile. |

## Decision Boundaries

The formula does not infer labour, VAT, fees, paint, or missing components. Explicitly quoted all-in amounts remain eligible under their submitted scope. When a required component is unpriced or submitted totals cannot reconcile, KINGA retains the evidence-qualified partial comparison but withholds a final numeric L2, savings, and settlement conclusion.

The later Stage 9 composite path now consumes the same canonical eligible active repair set used by initial L1/L2 selection. This prevents cancelled, rejected, explicitly ineligible, duplicate, or superseded evidence from re-entering the later composite matrix, evidence gate, or L1 baseline.

## Verified Traceability

| Audit finding | Resolution |
|---|---|
| **AUD-P1-004** — later composite path used raw quotes | Corrected to use canonical active eligible repair evidence. |
| **AUD-P1-005** — credibility function existed but was unused | Replaced with the user-confirmed explicit 30% P50 benchmark-selection rule in the composite builder. |
| Client component matrix | Displays selection method, benchmark deviation, and the high line-item variance verification remark. |
| Reports and decisions | Continue using the evidence-governed cost presentation; non-eligible history remains distinct from final cost inputs. |

## Validation Completed

The completed focused matrix covered no benchmark, within-tolerance benchmark below and above Qmin, outside-tolerance lower selection, 20% line-item spread boundary, high variance, active/withdrawn/rejected/ineligible/revised evidence, duplicate history, incomplete scope, unreconciled totals, savings/settlement suppression, cost integrity, rendered CL/CI/FR surfaces, and client quote contracts. The focused cross-surface suite passed **52 tests**. The bundled server and Vite production builds passed after the formula implementation.

## Remaining Assurance Boundary

The formula is implemented and code-validated. The separate external validation gates remain unchanged: real insurer/repairer data, a connected provider path, authenticated operational role testing, and curated visual evidence must still be exercised in their controlled acceptance environments.
