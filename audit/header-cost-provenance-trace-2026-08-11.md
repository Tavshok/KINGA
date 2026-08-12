# Header Cost Provenance Trace — CL, CI, and FR

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 11 August 2026  
**Method:** Read-only trace from rendered HTML to report source code and canonical production assessment/quote records. No report or claim data was changed.

> **Key conclusion:** the principal cost shown in a report header is often **not a submitted quotation**. It is usually a derived KINGA L2 value, and in some fallbacks it can become an estimated or documented amount while retaining the `KINGA Optimised` label. That ambiguity is a proven report-integrity defect.

## 1. Canonical Cost Sources

| Source class | Canonical field(s) | Meaning | May be a submitted quote? |
|---|---|---|---|
| Individual submitted quotation | `panel_beater_quotes.quoted_amount` | Amount quoted by a named repair partner. Stored in cents. | **Yes** |
| Lowest submitted quotation (L1) | Minimum of `panel_beater_quotes.quoted_amount`; Stage 9 `l1LowestSubmittedCostUsd` | Lowest whole-quote market submission. | **Yes** |
| Documented/agreed amount | `cost_intelligence_json.documentedAgreedCostUsd` | Assessor comparison/calibration reference to test a prior decision against KINGA cost intelligence. | **No.** It is not a submitted quote, L2 source, settlement source, or new-claim fallback. |
| Benchmark expected cost | `expectedRepairCostCents`, component P50/median benchmarks | Data/benchmark-derived expected repair value. | **No** |
| KINGA Optimised (L2) | `l2CompositeOptimisedCostUsd`, `quoteOptimisation.optimised_cost_usd`, `kingaSavingsL2OptimisedUsd` | Derived per-component synthesis, intended as a recommendation rather than a repairer submission. | **No** |
| Legacy estimated cost | `ai_assessments.estimated_cost` | Pipeline fallback. Stored in cents for new records; older records need field-level provenance review. | **No** |

## 2. Exact Header and Decision-Summary Derivations

| Report | Displayed field | Actual calculation path | Proven label risk |
|---|---|---|---|
| **CL** | `KINGA Optimised` header | L2 composite → quote optimisation → L2 backfill → **documented/agreed or estimated-cost fallback** | If L2 does not exist, the report can label a documented/estimated amount as `KINGA Optimised`. |
| **CI** | `KINGA Optimised` and `Recommended Settlement` | L2 path above. Recommended settlement = `L2 − policy exclusions − excess`. | It is a recommendation, not proof of a negotiated or agreed settlement. Individual quoted amounts are not presented in the summary strip. |
| **FR** | `KINGA Optimised Estimate` and `Settlement Agreed` | L2 path above. `Settlement Agreed = L2 − policy exclusions − excess`. | `Settlement Agreed` is factually unsafe: this calculation does not read an agreement/settlement field. It is a derived recommendation. |

## 3. Real Claim Evidence

| Claim | Submitted quote evidence | Documented/agreed evidence | L2 evidence | What the reports did |
|---:|---|---|---|---|
| **10,719,902** | Four submitted quotes; lowest L1 = **$4,485.00** | **$5,817.00** | **$5,877.00** | CL contains $5,817.00 and $5,877.00. CI/FR contain $5,877.00 but omit $5,817.00. |
| **11,709,902** | L1 = **$1,995.33**; additional quotes include $2,300.00 and $2,443.75 | **$1,995.33** | **$993.00** | CL discloses that paint, labour, and sundries are excluded from the L2 figure. CI/FR show L2 in settlement output, making the quote-versus-derived distinction too weak. |
| **12,879,902** | L1 = **$1,950.00**; another quote = $2,840.00 | **$1,950.00** | **$2,409.35** | All reports contain the principal figures, but the summary hierarchy still does not consistently show their source classes. |

## 4. Proven Defects

| ID | Proven defect | Why it matters |
|---|---|---|
| CP-01 | L2/derived value can be labelled `KINGA Optimised` even when the code has fallen back to a documented or estimated amount. | The report can falsely imply that KINGA derived a figure it merely inherited. |
| CP-02 | FR labels `L2 − exclusions − excess` as `Settlement Agreed`. | A recommendation is presented as an agreement without reading any agreement evidence. |
| CP-03 | CI/FR omit documented/agreed value for claim 10,719,902 while CL shows it. | The same claim produces inconsistent financial narratives. |
| CP-04 | Header/decision strips do not present the complete submitted quote ledger for multi-quote claims. | Readers may mistake a derived figure for the market quotation picture. |
| CP-05 | Large L1–L2 variance can be displayed without a mandatory, prominent coverage statement. | A low component-only L2 can be mistaken for an all-in repair quote. |

## 5. Non-Negotiable Correction Rules

1. **Never label a value as a quote unless it comes from `panel_beater_quotes`.**
2. **Never label a value as agreed/settled unless the report reads an explicit agreement/settlement source.**
3. **Never label a fallback as L2/KINGA Optimised.** If L2 is unavailable or incomplete, show `L2 incomplete` and the missing scope; do not substitute documented/agreed or estimated cost on a new claim.
4. Every report header on a multi-quote claim must show a compact quotation ledger: repairer name, submitted amount, currency, and status/date when known.
5. L1, documented/agreed, benchmark, L2, and recommended settlement must remain distinct labelled rows. A value may appear in more than one category only when the report explicitly says why.
6. L2 must be **all-in**. Where an item lacks a benchmark but has a submitted price, use the traceable submitted-price fallback. Where an item lacks a traceable price, mark L2 incomplete and prohibit a savings/settlement headline.

## 6. Amended Correction Batch R1

| Workstream | Correction | Acceptance test |
|---|---|---|
| Cost provenance model | Create a shared typed report model whose amounts each carry `value`, `currency`, `sourceClass`, `sourceReference`, `isComplete`, and `explanation`. | Test fixtures assert no report label mismatches the model source class. |
| Quote ledger | Deduplicate same-repairer/same-scope/same-amount submissions, then render the active submitted quote ledger in each report header/decision area. | Claim 11,709,902 presents the Supreme duplicate once while retaining both source documents in the audit trail. |
| L2 integrity | Enforce all-in repair-scope coverage; use the submitted-price fallback for unbenchmarked items; prevent incomplete L2 publication. | No settled/recommended L2 is produced until every required component has a traceable price. |
| Quote uniqueness | Apply canonical repairer identity and revision-aware duplicate handling before L1/L2, savings, quote count, and reports. | Duplicate repairer submissions cannot inflate quotes, variance, savings, or report columns. |
| Settlement wording | Replace `Settlement Agreed` with `Recommended Settlement` unless an explicit agreement field is present. | FR can display `Agreed settlement` only with an agreement reference; otherwise it displays a recommendation. |
| Cross-report reconciliation | Ensure CL, CI, and FR consume the same provenance model. | Claim 10,719,902 shows $5,817.00 and $5,877.00 with identical source labels in all three reports. |

## References

[1]: `server/reporting/reportDefinitions.ts` — CL source and header derivation.  
[2]: `server/reporting/claimsIntelligenceReport.ts` — CI source, L2 fallback, and recommended-settlement derivation.  
[3]: `server/reporting/forensicDecisionReport.ts` — FR source, L2 fallback, and `Settlement Agreed` derivation.  
[4]: Read-only generated report HTML and production source data for claims 10,719,902; 11,709,902; and 12,879,902, 11 August 2026.
