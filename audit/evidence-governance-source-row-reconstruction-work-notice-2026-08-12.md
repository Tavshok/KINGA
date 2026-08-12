# KINGA Evidence Governance — Source-Row Reconstruction Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 12 August 2026  
**Status:** Awaiting explicit approval  
**Scope:** Historic claim `12909902` / `DOC-20260810-84080652` only

## 1. Purpose

The evidence-governance foundation is now live. Its report register accurately records the primary quotation totals, their original document pages, and the source-to-ledger discrepancies. It deliberately does **not** republish an L2 comparison because the historic structured line ledger does not faithfully retain the primary quote evidence.

This controlled package reconstructs source rows from the original quotation pages into the additive `quote_evidence_ledger`. It does not alter any submitted quotation header, quote line item, repairer record, cost model, payment, settlement, or claim decision.

## 2. Evidence Boundary

| Repairer | Original evidence | Current verified fact | Reconstruction requirement |
|---|---|---|---|
| The Dent Doctor | Quote 3359, PDF pages 11–12 | The primary total is USD 6,500.00; the stored header is USD 5,915.00, with no documented revision. | Record each visible source row with page and table-row reference; retain the USD 585.00 mismatch as a blocking source-to-ledger finding. |
| C.A.M.E.L Body Shop Auto | Quote E1693, PDF page 14 | The primary grand total is USD 7,230.00. The source separates spares and repairs; the structured ledger has not faithfully retained that split. | Record the source spares and repairs rows and prove the source arithmetic before any component can enter comparison. |
| Stylin Auto | Quote 1245, PDF page 13 | USD 7,265.00 carried forward plus explicit VAT of USD 1,084.00 equals USD 8,349.00. | Record every visible source row, source VAT, and source total; do not allocate VAT to components unless the quote explicitly does so. |

## 3. Permitted Operations

The implementation may create only additive `quote_evidence_ledger` rows and `claim_evidence_findings` records. Every recorded monetary row must contain the source document, page, visual/OCR row location, submitted text, currency, tax basis, revision state, extraction method, confidence, and controlled status.

The implementation may use OCR as transcription assistance, but the source PDF image is controlling evidence. A faint, ambiguous, handwritten, or unlocatable amount remains **Unresolved**; it is not normalised, estimated, proportionally distributed, or silently omitted.

## 4. Prohibited Operations

The implementation must not change `panel_beater_quotes`, `quote_line_items`, `ai_assessments`, submitted claim evidence, repairer information, policy data, L1, L2, savings, settlement, payment, or a fraud decision. It must not add labour, VAT, paint, fees, discounts, or other costs that are not explicit in the source quotation.

No benchmark may replace a submitted source amount. A benchmark may only be presented beside a verified equivalent source row as comparative intelligence.

## 5. L2 Eligibility Rules After Reconstruction

L2 remains withheld unless every selected component has an equivalent, **Verified** source row. Equivalence requires the same component or operation, repair scope, tax basis, revision state, unit/quantity basis where applicable, and source traceability. An incomplete or unresolved source row prevents only the affected comparison from being published; it does not stop the claim assessment.

## 6. Acceptance Evidence

| Check | Required outcome |
|---|---|
| Source traceability | Each reconstructed row identifies document `4650001`, page, and row/location. |
| Arithmetic | Source-row totals reconcile exactly to each quoted subtotal and total, or a named reconciliation finding records the difference. |
| Tax treatment | VAT is retained only where explicitly stated; no VAT is allocated to a component by KINGA. |
| Quote immutability | Original `panel_beater_quotes` and `quote_line_items` values are unchanged. |
| Status accuracy | Each row is Verified, Reconstructed, Extraction Defect, Evidence Gap, or Unresolved according to the evidence actually available. |
| L2 safety | L2, savings, and settlement remain withheld until equivalent verified source rows cover the relevant comparison. |
| Report presentation | CL, CI, and FR display the evidence register, reconciliation findings, neutral review boundary, and no unsupported cost conclusion. |
| Regression and build | Focused evidence/L2/report tests and bundled server/Vite production builds pass. |

## 7. Deliberate Limits

This package is a historic source-evidence reconstruction for one claim. It does not backfill every historic claim and does not turn an extraction defect into a quote-inflation or fraud conclusion. Any broader historical programme will require a separate controlled work notice and claim-by-claim approval criteria.

