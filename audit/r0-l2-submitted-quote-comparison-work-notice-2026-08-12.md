# R0 L2 Submitted-Quote Comparison Correction — Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 12 August 2026  
**Status:** Awaiting explicit approval — no behaviour change authorised by this notice.

## Decision principle

> **L2 is a comparison of submitted quotations, not a mechanism for generating repair costs.**

For every selected L2 amount, KINGA must retain a direct source reference to an active submitted quotation and, where applicable, to the submitted line item. L2 must not add, infer, predict, benchmark, estimate, or substitute labour, VAT, paint, consumables, fees, towing, or any other amount not explicitly supported by an active quotation.

## Evidence from the representative claim

The live records for claim `12909902` contain three active submitted quotations: The Dent Doctor, C.A.M.E.L BODY SHOP AUTO, and Stylin Auto. Their persisted line-item counts are 28, 20, and 28 respectively, for 76 rows in total. These are itemised quotation records, not total-only quotation records.

The historical assessment record was produced before the R1/R0 composite L2 contract. It therefore has no persisted canonical ledger, typed L2 status, quote-scope status, required-component list, or composite optimisation payload. The current report fallback reads the quotation headers but does not rebuild the component matrix from the persisted line items. It consequently maps “quotes received without new composite metadata” to `incomplete_scope`.

This is a backward-compatibility classification defect. It is not evidence that the claimant’s repair scope is unpriced.

## Approved-behaviour target

| Situation | Required L2 treatment |
|---|---|
| A component appears in more than one active quote | Compare the explicitly submitted comparable amounts and select the lowest valid submitted amount, retaining source repairer, quote, and line-item references. |
| A component appears in only one active quote | Retain that submitted amount. Do not replace it with a benchmark, estimate, or inferred value. |
| Labour, VAT, paint, fees, towing, or consumables are separately itemised | Treat them as separate submitted rows and use them only where the relevant amount is explicitly quoted. |
| An amount is stated only in a verified all-in quotation total | Keep the quote as an all-in package; do not fabricate a component allocation. |
| A required repair component appears in no active quote | Record the exact component and source evidence gap. Do not create a price. The decision may require review. |
| A benchmark exists | Keep it as a separate analytical/comparison reference only. It must not alter L2 or a settlement basis. |

## Proposed implementation scope

1. Replace the L2 per-component benchmark override with submitted-price-only selection across the active canonical quote ledger.
2. Preserve quote type, status, revision/supersession, scope, currency, and source references for each selected amount.
3. Rebuild the canonical L2 composite for legacy assessments from persisted active quote line items before reports are generated or refreshed; persist the resulting immutable Stage 9 contract and provenance snapshot.
4. Retain an L2 hold only where a defined required repair component is absent from every active itemised quotation, or where a submitted all-in total cannot safely be allocated for a requested component comparison.
5. Ensure CL, CI, FR, and the portal cost summary state whether each value is a submitted quote, L1 package total, L2 submitted-quote comparison, or separate benchmark reference.
6. Do not change claim intake, assessment execution, external notifications, insurer workflow, settlement authorisation, or stored quotation evidence under this correction.

## Verification criteria

| Test case | Required outcome |
|---|---|
| Same component in two active quotes | L2 selects the lower submitted amount and retains its exact source reference. |
| Component priced in only one active quote | L2 retains that submitted amount without a benchmark substitution. |
| Labour/VAT/fees absent from all submitted quotations | L2 does not add them. |
| Labour/VAT/fees explicitly itemised | L2 uses the submitted row only, with a source reference. |
| Legacy assessment with itemised active quotations | Composite is rebuilt and persisted; no automatic `incomplete_scope` solely because new metadata was absent. |
| Component absent from every active quote | Explicit named evidence gap; no invented price; review state is permitted. |
| Representative claim `12909902` | Rebuilt matrix reconciles 76 persisted line items across the three active quotations; every displayed L2 selection is traceable. |
| Report regression | CL, CI, FR, and portal UI display no benchmark-generated L2 amount, no unsupported saving, and no unsupported settlement recommendation. |

## Out of scope

This work notice does not authorise a write-off decision, change quotation values, alter panel-beater submissions, fabricate a missing item, or introduce payment/settlement actions. It also does not authorise an external notification or an automated re-run of any claimant assessment without a separately reviewed operational control.
