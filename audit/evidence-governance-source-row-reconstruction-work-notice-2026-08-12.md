# KINGA Evidence Governance — Source-Row Reconstruction Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 12 August 2026  
**Status:** Awaiting explicit approval  
**Scope:** Historic claim `12909902` / `DOC-20260810-84080652` only

## 1. Purpose

The evidence-governance foundation is now live. Its report register accurately records the primary quotation totals, their original document pages, and the source-to-ledger discrepancies. **L2 will continue to run throughout reconciliation.** Where historic structured rows are not yet reliable enough for a complete financial conclusion, KINGA will present evidence-qualified comparison intelligence rather than hide the analysis or manufacture a total.

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

Every amount explicitly identified by the repairer is recorded as its own source-backed row. This includes a component, repair operation, labour, paint, VAT, workshop fee, discount, delivery charge, and adjustment. Each row retains its submitted label, source location, amount, currency, tax treatment, and controlled evidence status. KINGA may compare a row only against an equivalent row from another quote; it must not collapse explicit charges into a generic total.

An **Unclassified submitted adjustment** is permitted only where the original quotation displays a numerical amount but does not identify its purpose or basis. It remains a separate source-to-ledger reconciliation finding with its document, page, location, and exact amount. It is never re-labelled as a component, labour, VAT, fee, or discount without source evidence.

## 4. Prohibited Operations

The implementation must not change `panel_beater_quotes`, `quote_line_items`, `ai_assessments`, submitted claim evidence, repairer information, policy data, L1, L2, savings, settlement, payment, or a fraud decision. It must not add labour, VAT, paint, fees, discounts, or other costs that are not explicit in the source quotation.

No benchmark may replace a submitted source amount. A benchmark may only be presented beside a verified equivalent source row as comparative intelligence.

## 5. Progressive L2 Evidence-Reconciliation Model

L2 has two responsibilities: first, compare the quotation evidence that is available; second, identify what may safely be concluded from it. It must never convert an evidence limitation into a fabricated price, but an evidence limitation must not disable the intelligence function.

| L2 output | When it may be presented | Financial meaning |
|---|---|---|
| **Verified L2 comparable amount** | Equivalent, **Verified** source rows exist for the selected components. Equivalence requires the same component or operation, repair scope, tax basis, revision state, unit/quantity basis where applicable, and source traceability. | A transparent subtotal of verified comparable submitted prices. It is not represented as the full payable repair cost unless complete evidence supports that conclusion. |
| **Evidence-qualified L2 intelligence** | Some rows are comparable while others are reconstructed, have a scope difference, a source-to-ledger discrepancy, an evidence gap, or an unresolved tax/price basis. | Shows comparison rows, source differences, missing evidence, and pricing-variance review signals. It does not create an unsupported total, saving, or settlement recommendation. |
| **Verified full L2 decision** | Equivalent verified source rows cover the complete intended comparison on a consistent all-in basis. | KINGA may publish a final optimised submitted-quote comparison, and only then evaluate a savings or settlement recommendation. |

The report will show **L2 Evidence Coverage** as a transparent count of verified comparable rows over all relevant comparison rows, together with named counts for scope differences, source discrepancies, evidence gaps, and unresolved rows. Every explicit submitted component or charge remains visible as a separate row. Only an **Unclassified submitted adjustment**—a source amount with no stated purpose—appears separately as a reconciliation finding and is excluded from every verified subtotal and decision figure.

## 6. Report Presentation

The Claims Ledger, Claims Intelligence, and Forensic reports will present an **L2 Evidence Reconciliation** matrix with the component or operation, each submitted quote value, selected submitted value where comparable, benchmark range and variance where available, source repairer/document/page/row, controlled evidence status, and a neutral explanation. The report will distinguish the following statements:

* **“Comparison available — qualification required”** when L2 has useful evidence-qualified intelligence but not a complete decision basis.
* **“Verified comparable amount”** for a subtotal supported by equivalent verified rows, labelled explicitly as a comparison subtotal rather than a payable repair total when coverage is partial.
* **“Evidence reconciliation required for final total, savings, and settlement recommendation”** only for those financial conclusions that inherently require complete equivalent evidence.
* **“Unclassified submitted adjustment”** only when the source itself leaves a specific quoted amount without a stated component or charge category; it is always shown separately, never hidden or allocated.

Pricing variance is a review signal, not a fraud finding. A missing labour breakdown, VAT treatment, revision, or component source becomes a named L2 finding; it does not suppress all other verified comparisons and does not block the claim assessment.

## 7. Acceptance Evidence

| Check | Required outcome |
|---|---|
| Source traceability | Each reconstructed row identifies document `4650001`, page, and row/location. |
| Explicit-row preservation | Every stated component, labour, VAT, paint, fee, discount, and adjustment appears as a separate source-backed row with its submitted label and amount. |
| Arithmetic | Source-row totals reconcile exactly to each quoted subtotal and total, or a named reconciliation finding records the difference. |
| Tax treatment | VAT is retained only where explicitly stated; no VAT is allocated to a component by KINGA. |
| Quote immutability | Original `panel_beater_quotes` and `quote_line_items` values are unchanged. |
| Status accuracy | Each row is Verified, Reconstructed, Extraction Defect, Evidence Gap, or Unresolved according to the evidence actually available. |
| Progressive L2 | L2 runs for all source states and shows verified comparisons, evidence-qualified findings, coverage, and exact unresolved values without fabricating a total. |
| Financial decision boundary | Only an unsupported final total, saving, or settlement recommendation is qualified; verified component comparisons remain visible. |
| Report presentation | CL, CI, and FR display the L2 Evidence Reconciliation matrix, evidence coverage, source register, reconciliation findings, neutral review boundary, and no unsupported financial conclusion. |
| Regression and build | Focused evidence/L2/report tests and bundled server/Vite production builds pass. |

## 8. Deliberate Limits

This package is a historic source-evidence reconstruction for one claim. It does not backfill every historic claim and does not turn an extraction defect into a quote-inflation or fraud conclusion. Any broader historical programme will require a separate controlled work notice and claim-by-claim approval criteria.
