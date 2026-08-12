# R0 L2 Submitted-Quote Comparison Correction — Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 12 August 2026  
**Status:** Submitted-price selection principle approved. Document-backed legacy reconstruction amendment awaiting explicit approval — no assessment or quotation data change authorised by this amendment.

## Decision principle

> **L2 is a comparison of submitted quotations, not a mechanism for generating repair costs.**

For every selected L2 amount, KINGA must retain a direct source reference to an active submitted quotation and, where applicable, to the submitted line item. L2 must not add, infer, predict, benchmark, estimate, or substitute labour, VAT, paint, consumables, fees, towing, or any other amount not explicitly supported by an active quotation.

## Evidence from the representative claim

The live records for claim `12909902` contain three active submitted quotations: The Dent Doctor, C.A.M.E.L BODY SHOP AUTO, and Stylin Auto. Their persisted line-item counts are 28, 20, and 28 respectively, for 76 rows in total. These are itemised quotation records, not total-only quotation records.

The historical assessment record was produced before the R1/R0 composite L2 contract. It therefore has no persisted canonical ledger, typed L2 status, quote-scope status, required-component list, or composite optimisation payload. The current report fallback reads the quotation headers but does not rebuild the component matrix from the persisted line items. It consequently maps “quotes received without new composite metadata” to `incomplete_scope`.

This is a backward-compatibility classification defect. It is not evidence that the claimant’s repair scope is unpriced.

Subsequent primary-source review established an additional integrity constraint: the current structured line ledger does not faithfully reconcile to the embedded original quotations. The Dent Doctor source quotation totals USD 6,500.00 while persisted header `10620001` is USD 5,915.00 with no documented adjustment; C.A.M.E.L’s primary source separates USD 5,425.00 spares and USD 1,805.00 repairs within its USD 7,230.00 total; and Stylin’s source explicitly states USD 7,265.00 carried forward plus USD 1,084.00 VAT, totalling USD 8,349.00. The detailed evidence register is `audit/r0-l2-source-evidence-12909902-2026-08-12.md`.

## Approved-behaviour target

### Formula separation

For each comparable component `c`, let `S_c` be the lowest valid **submitted** price across all active quotations that quote `c`. Let `B_c` be the available benchmark range for `c`, where one exists.

```text
L2 selected amount for c = S_c
Line-item comparison variance = S_c − B_c (and percentage variance, where B_c is available)
L2 submitted-quote comparison total = Σ S_c
```

`B_c` is shown alongside the selected submitted amount as comparative intelligence. It must never replace `S_c`, reduce `S_c`, fill a missing `S_c`, or be added to the L2 total. The legacy rule that allowed a benchmark P50 within a tolerance to become the selected L2 amount is specifically excluded from the proposed behaviour.

| Situation | Required L2 treatment |
|---|---|
| A component appears in more than one active quote | Compare the explicitly submitted comparable amounts and select the lowest valid submitted amount, retaining source repairer, quote, and line-item references. |
| A component appears in only one active quote | Retain that submitted amount. Do not replace it with a benchmark, estimate, or inferred value. |
| Labour, VAT, paint, fees, towing, or consumables are separately itemised | Treat them as separate submitted rows and use them only where the relevant amount is explicitly quoted. |
| An amount is stated only in a verified all-in quotation total | Keep the quote as an all-in package; do not fabricate a component allocation. |
| A required repair component appears in no active quote | Record the exact component and source evidence gap. Do not create a price. The decision may require review. |
| A benchmark exists | Keep it as a separate analytical/comparison reference only. It must not alter L2 or a settlement basis. |

## Proposed implementation scope

1. Replace the L2 per-component benchmark override with the stated formula: submitted-price-only selection across the active canonical quote ledger, with benchmark range and variance retained as a separate line-item comparison.
2. Preserve quote type, status, revision/supersession, scope, currency, and source references for each selected amount.
3. Build a document-backed quotation-evidence ledger for legacy assessments. Every recovered row must retain source document, page, source row or region where available, transcription/extraction method, confidence, arithmetic role, and verification status.
4. Reconstruct a legacy L2 composite only from source-verified document-backed quote lines. The existing `quote_line_items` table may be corroborating evidence but cannot substitute for a primary quotation page where the two conflict.
5. Surface source-to-ledger mismatches, missing source lines, unsupported quote amounts, and incomplete quote evidence as distinct reconciliation findings for verification. Do not describe them generically as unallocated VAT, labour, or scope.
6. Retain an L2 hold only where a defined required repair component is absent from every verified active quotation, or where the original submitted quote evidence cannot establish an all-in comparison.
7. Ensure CL, CI, FR, and the portal cost summary state whether each value is a verified submitted quote, L1 package total, document-backed L2 submitted-quote comparison, or separate benchmark reference.
8. Do not change claim intake, assessment execution, external notifications, insurer workflow, settlement authorisation, submitted quotation values, or stored quotation evidence under this correction.

## Verification criteria

| Test case | Required outcome |
|---|---|
| Same component in two active quotes | L2 selects the lower submitted amount and retains its exact source reference. |
| Component priced in only one active quote | L2 retains that submitted amount without a benchmark substitution. |
| Labour/VAT/fees absent from all submitted quotations | L2 does not add them. |
| Labour/VAT/fees explicitly itemised | L2 uses the submitted row only, with a source reference. |
| Legacy assessment with itemised active quotations | Composite is rebuilt and persisted only after primary-source quotation rows reconcile to structured evidence; no automatic `incomplete_scope` solely because new metadata was absent. |
| Component absent from every active quote | Explicit named evidence gap; no invented price; review state is permitted. |
| Representative claim `12909902` | Every selected value traces to original quotation document, page, row/region, repairer, quote, and verified arithmetic; source-to-ledger differences are named verification findings. |
| Report regression | CL, CI, FR, and portal UI display no benchmark-generated L2 amount, no unsupported saving, and no unsupported settlement recommendation. |

## Out of scope

This work notice does not authorise a write-off decision, change quotation values, alter panel-beater submissions, fabricate a missing item, or introduce payment/settlement actions. It also does not authorise an external notification or an automated re-run of any claimant assessment without a separately reviewed operational control.
