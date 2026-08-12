# L2 All-In Coverage and Quote-Unicity Audit

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 12 August 2026  
**Method:** Read-only code and rendered-report audit. No claim, quotation, assessment, or report code was changed.

> **Correction to the earlier audit interpretation:** `documentedAgreedCostUsd` is an assessor comparison and calibration reference. It is not an L2 input, settlement source, or valid replacement for L2 on a new claim. L2 must be calculated from the repair scope and verifiable market evidence alone.

## 1. Governing Cost Rules

| Rule | Required behaviour |
|---|---|
| **All-in L2** | L2 must represent the whole repair scope on a defined payable-cost basis. It may not become smaller by omitting unbenchmarked components. |
| **Unbenchmarked component** | Where a component has a submitted price but no KINGA benchmark, L2 uses the lowest traceable submitted price for that component and records the source repairer. |
| **Unquoted/unaligned component** | Where a confirmed repair component has no price in the normalised quote ledger, L2 is **incomplete**, not low. The system must surface the gap and request/reconcile the missing scope; it must not publish a settlement-ready L2 total. |
| **Agreed cost** | `documentedAgreedCostUsd` remains a comparison/calibration field for assessing a prior assessor decision. It must never supply L2, L1, savings, or a settlement recommendation. |
| **Duplicate quote** | A repeat submission from the same panel beater for the same scope and amount counts once in every calculation and report. Original/revised/supplementary quotes remain traceable but only the applicable version can influence the active comparison. |

## 2. Verified Evidence

### 2.1 The intended L2 formula is already correct for a priced, normalised component

The active composite engine is designed to use the lowest submitted component price whenever no benchmark exists. It includes paint, sundries, diagnostics, strip-and-assemble work, and other component-linked non-part rows, while excluding only standalone overhead rows such as a generic workshop fee. The test suite contains a specific test proving that no-benchmark paint and sundries are included from the submitted quotation. [1]

| Active implementation evidence | What it establishes |
|---|---|
| `quoteOptimisationEngine.ts`, lines 1019–1033 | Paint and sundries are deliberately retained unless a row is a true standalone overhead item. |
| `quoteOptimisationEngine.ts`, lines 1211–1217 | A component without benchmark data uses the lowest submitted price, not zero and not a benchmark substitute. |
| `buildCompositeQuote.test.ts`, lines 354–405 | Regression test expects paint, sundries, and the part to appear in L2 and sums all three. |

This is the right principle. The fault is that the current implementation does **not enforce the principle across the complete confirmed repair scope before an L2 total is released**.

### 2.2 Claim 11,709,902 proves that an incomplete L2 can still be persisted and reported

The rendered Claims Report for claim **11,709,902** states that L2 is **$993.00**, derived from only **4 of 13 components**, and explicitly says that paint, labour, and sundries are excluded. The same output presents the $993.00 amount as the KINGA Optimised figure. That is not a defensible all-in L2; it is a partial component subtotal. [2]

| Claim 11,709,902 report evidence | Observed value |
|---|---:|
| Lowest submitted quotation (L1) | **$1,995.33** |
| Persisted/reported L2 | **$993.00** |
| Components priced by L2 | **4** |
| Components represented in the report’s scope analysis | **13** |
| Report’s own disclosure | Paint, labour, and sundries excluded |

The failure is not that a no-benchmark component has no prescribed fallback. The code prescribes one. The failure is that the L2 calculation accepts an incomplete input/component matrix and then sums only the items that arrived in it. It records `damagedNotQuoted` after the calculation, but does not use that result as a **coverage gate** that prevents an incomplete L2 from being published as an all-in recommendation. [3]

### 2.3 VAT and mandatory payable costs are a second comparability defect

L1 is currently taken from each repair quote’s extracted `total_cost`, with the source comment saying that this includes VAT where applicable. The L2 composite excludes standalone VAT and generic workshop-fee rows. Therefore, L1 and L2 can be presented as comparable while using different cost bases. [3] [4]

The correction must establish one explicit basis for every comparison: **all-in payable repair cost**. Where VAT or a mandatory fee applies, it must be included consistently in both L1 and L2, or separately stated and added to both totals using an auditable rule. A pre-tax L2 must never be compared to a VAT-inclusive L1 as a savings figure.

### 2.4 Duplicate panel-beater quotations are not removed before current L2/L1 processing

The Stage 9 preparation code passes every raw repair quote into the composite builder, derives L1 from the raw list, and stores `quotesEvaluated` as the raw input count. The composite input type contains a panel-beater name but no durable panel-beater identifier, source-document fingerprint, or revision chain. The composite builder has no quote-uniqueness step. [3] [4]

Claim **11,709,902** visibly demonstrates the failure mode. Its rendered reports count **4 quotes** and list two $2,300.00 submissions as `SUPREME PANEL BEATERS AND SPRAY PAINTERS` and `SUPREME PANEL BEATERS`. The report’s own similarity analysis flags a **100% copy-quotation pattern**. The user has confirmed that one panel beater’s quote is being counted twice. The application currently has no canonical identity resolution at this point in the pipeline, so the duplicate is allowed to influence quote count, variance, and report display. [2] [3]

> A small local de-duplication in `costDecisionEngine.ts` applies only to selected downstream views such as highest-quote/overpricing guidance. It does **not** de-duplicate the Stage 9 input, L1, L2 component matrix, savings, stored `quotesEvaluated`, or report arrays. It is therefore not a remedy. [5]

## 3. Root-Cause Classification

| ID | Proven condition | Root cause | Consequence |
|---|---|---|---|
| L2-01 | Partial L2 can be stored and rendered as a complete recommendation. | No mandatory repair-scope coverage invariant before persisting/publishing L2. | $993.00 can appear against a materially broader submitted repair package. |
| L2-02 | Components lacking benchmark data are handled correctly only if they enter the normalised ledger. | Missing line-item/scope reconciliation is tolerated rather than blocking L2 completion. | Unbenchmarked but quoted work can disappear when extraction/matching is incomplete. |
| L2-03 | L1 can include VAT while L2 excludes standalone VAT/mandatory fees. | Different cost bases are compared. | Apparent L1–L2 savings can be overstated. |
| QU-01 | Raw repair-quote arrays flow into L1, L2, quote counts, and reports. | No canonical quote identity or revision-aware deduplication before Stage 9. | One repairer may be counted as multiple market quotes. |
| QU-02 | Duplicate names vary by suffix/wording. | Name text is treated as the practical identity where a durable ID/fingerprint is unavailable. | `SUPREME PANEL BEATERS` and `SUPREME PANEL BEATERS AND SPRAY PAINTERS` are presented as distinct quotes. |
| RP-01 | Reports use the persisted partial L2 and raw quote count without an integrity status. | Report layer trusts the stored number without enforcing coverage/uniqueness metadata. | A reader sees an apparently authoritative cost and quote count without the limitations. |

## 4. Corrected R1 — Cost Engine and Report Remediation

| Workstream | Required correction | Acceptance test |
|---|---|---|
| **Canonical quote ledger** | Build a single claim-scoped ledger before any L1/L2 calculation. Assign a durable repairer identity using `panel_beater_id` where present; otherwise use a controlled normalised-name match and source-document fingerprint. Preserve every submission but mark each as `active`, `superseded`, `supplementary`, or `duplicate`. | The two Supreme submissions on claim 11,709,902 produce **one active market quote** and retain both source references for audit. |
| **Exact duplicate rule** | Collapse same repairer + same currency + same all-in amount + same normalised scope/fingerprint into one active quote. Do not silently delete it. A revised, strip, or supplementary quote may be active only under an explicit scope/revision rule. | Duplicate counts cannot change L1, L2, highest quote, price variance, savings, quote count, or report columns. |
| **L2 scope contract** | Before building L2, form a canonical repair-scope ledger from confirmed damage plus normalised quote line items. Every included repair-scope item must receive one of: benchmark-selected cost, submitted-quote fallback, or explicit unresolved state. | No L2 can be labelled `complete` unless every required component has a traceable price and source. |
| **Unbenchmarked fallback** | For each priced item with no benchmark P50, select the lowest credible submitted price. Feed the selected T3 price and repairer into the learning record. | A no-benchmark paint, labour, sundry, or part line contributes to both the L2 total and the line-level audit trail. |
| **Unresolved scope rule** | If a required item lacks a traceable submitted price, persist L2 as `incomplete` with a named missing component list and issue an in-app workflow warning/requote request. It must not create a settlement, savings, or “optimised” headline. | A claim with 4 priced items and 9 unresolved repair-scope items cannot output a numeric settlement-ready L2. |
| **All-in basis** | Reconcile L1 and L2 to the same payable-cost basis, including applicable VAT and mandatory fees by an explicit, source-traceable rule. | Every L1–L2 comparison exposes identical `costBasis` and `taxTreatment`; cross-basis savings calculation is rejected. |
| **Agreed-cost isolation** | Keep documented/agreed cost in an assessor calibration panel only. Remove it from all fallback, recommendation, and settlement calculation paths. | New claims produce L1/L2/recommendation without reading `documentedAgreedCostUsd`; reports show it only as a labelled comparison where available. |
| **Report integrity strip** | CL, CI, and FR consume the same deduplicated ledger and L2 completeness metadata. Display submitted quote ledger, L1, L2 status, benchmark coverage, unresolved scope, and calculation basis. | Claim 11,709,902 no longer shows `4 quotes` or a settlement-ready `$993.00` until the scope/duplicate issues are resolved. |
| **Historical repair** | Re-run only approved historical claims after code correction; preserve the original assessment version and write a new version with the corrected ledger. | Claim 11,709,902 produces a versioned, auditable recomputation; no original data is overwritten. |

## 5. Out of Scope for R1

This batch will not invent benchmark prices, change a submitted quotation, or automatically approve/reject a claim. It will not use the agreed-cost field as a shortcut to make an incomplete L2 look complete. It will surface an incomplete scope for human action and use **in-app notifications only**, consistent with the platform’s operating rules.

## References

[1]: `server/pipeline-v2/quoteOptimisationEngine.ts`, lines 1019–1033 and 1211–1217; `server/pipeline-v2/buildCompositeQuote.test.ts`, lines 354–405.  
[2]: Read-only generated CL, CI, and FR HTML for claim 11,709,902 in `/tmp/kinga-report-audit-11709902/`, reviewed 12 August 2026.  
[3]: `server/pipeline-v2/stage-9-cost.ts`, lines 1770–1951.  
[4]: `server/pipeline-v2/quoteOptimisationEngine.ts`, lines 974–1330.  
[5]: `server/pipeline-v2/costDecisionEngine.ts`, lines 261–304 and 365–401.
