# KINGA Report Quality Audit and Remediation Plan

**Scope:** Claims Liability (CL), Claims Intelligence (CI) and Forensic Report (FR) PDFs supplied for claim `DOC-20260810-84080652`.

**Status:** Planning and diagnosis only. No report renderer, workflow, claim, quotation, tenant, database, or production-data change has been made.

## Executive conclusion

The supplied **Claims Intelligence** artefact is not currently suitable as an insurer-facing comparison report. It has a confirmed blank first page, incorrect static page numbering, a one-column line-item comparison that suppresses the active quotations needed for side-by-side review, and no clear lowest-submitted-quote figure adjacent to the KINGA Optimised amount. These are presentational defects, not evidence that the canonical quote ledger lacks the required values: the shared cost-integrity layer already exposes L1 (lowest submitted), L2 (KINGA Optimised), active comparison quotes, and individual line items.

There are also two higher-value integrity findings. CI calculates its displayed saving against the **highest** active quote, while the Forensic and interactive professional matrix use the **lowest** submitted quote as the comparison anchor. In addition, CI contains fallback copy that can state favourable findings such as “No prior claims” or “No physics anomaly detected” where the relevant evidence has not actually been loaded. These must be changed to explicit “not assessed” or “evidence unavailable” wording before the report is relied upon in a decision or dispute context.

## Evidence and priority ledger

| ID | Finding | Evidence | Root cause / code path | Priority |
|---|---|---|---|---|
| CI-PRINT-01 | CI PDF begins with a blank first page. | The supplied CI PDF opens with a branded but otherwise empty first page; substantive content begins on the next page. | The current generator says the former standalone cover wrapper was removed, yet the produced artefact still exhibits a blank opening page. The deployed artifact/version and `claimsIntelligenceReport.ts` opening/page-break assembly need to be reproduced together. | **P1** |
| CI-PRINT-02 | Page footers claim “Page 1 of 2” and “Page 2 of 2” although the supplied CI file has four pages. | Supplied CI PDF page count and visible footer labels. | Static strings in `server/reporting/claimsIntelligenceReport.ts` around the cover footer and cost page footer. | **P1** |
| CI-PRINT-03 | Browser print/export prints the parent page/visible iframe rather than the entire CI document. | The CI view writes server HTML into an iframe; the parent Report button calls `window.print()` without printing the iframe document. | `client/src/components/ClaimsIntelligenceReportView.tsx:20–95`; `client/src/pages/InsurerComparisonView.tsx:883–905`. | **P1** |
| CI-COST-01 | CI line-item comparison displays a single “Submitted” value, not one value for each active quotation. | Supplied CI comparison table; server template header is `Component | Type | Submitted | KINGA Benchmark | Status`. | `server/reporting/claimsIntelligenceReport.ts:640–708` deduplicates description and retains one line item, then renders a single submitted-price column. | **P0** |
| CI-COST-02 | KINGA Optimised is shown without a commensurate lowest submitted quote headline. | Supplied CI report and user observation. | `renderCostDecisionSummaryHtml()` displays submitted quote chips plus L2 but does not dedicate an L1 comparison cell; CI economics table displays only highest active quote and L2. | **P0** |
| CI-COST-03 | Savings/negotiation gap uses the highest active quote in CI, not the L1 lowest submitted quote used by the cross-report comparison model. | CI derives `savings = highestQuote - kingaOptimised`; current client matrix labels L1 as “Lowest Submitted”; FR uses lowest quote as its comparator. | `claimsIntelligenceReport.ts:163–201`, `costDecisionPresentation.ts:111–196`, and the existing forensic cost-intelligence path. | **P0** |
| CI-COST-04 | CI hides submitted quotations beyond the first three in its quote-card summary. | `quoteArr.slice(0, 3)` in the CI quote-card assembly. | `claimsIntelligenceReport.ts:621–638`. | **P2** |
| CI-INTEGRITY-01 | CI can present unsupported “clear” findings when evidence is unavailable. | Fallback fraud/risk rows include “No physics anomaly detected at this tier” and “No prior claims on this registration” without a demonstrated evidence query. | `claimsIntelligenceReport.ts:740–748`. | **P0** |
| CI-INTEGRITY-02 | CI defaults data completeness to 75 when canonical evidence is absent. | `ife?.completenessScore ?? … ?? 75`. | `claimsIntelligenceReport.ts:222–226`. | **P1** |
| CI-ARTIFACT-01 | The supplied CI PDF appears to contain a `nArray is not defined` error in a later section. | Artefact-level observation requiring exact-page reproduction before a code defect is attributed. An exact-word current-source search found no `nArray` identifier. | Likely older deployed report code, interpolated data/content, or an execution path outside the current source file. | **P1 — investigate** |

> **Meaning of P0:** The defect can mislead an insurer about the evidential comparison or present a conclusion not supported by loaded evidence. A P0 report fix must be verified against a real multi-quote claim before it is used for a decision workflow.

## What will change

### 1. Establish one report-print contract

The server-generated PDF route and the browser “Print / Export PDF” route must be treated as two different products. The server route already uses Puppeteer to render the entire supplied HTML document to A4 PDF; it is not a viewport screenshot. The browser route, however, places CI inside a sandboxed iframe and prints the parent window. The fix will introduce a dedicated CI print action that either prints the iframe’s full document after it has loaded or, preferably, calls the existing server-side queued/report PDF path and opens/downloads the rendered document. It will not use viewport capture.

The CI HTML must also have one page-break owner. The remediation will remove conflicting page wrapper/break behaviour, replace static `Page N of 2` strings with browser/Puppeteer page counters, and add print CSS that prevents header-only opening sheets, orphaned headings, table-column clipping, and content lost below the iframe’s visible height.

### 2. Replace CI’s one-cost table with a true comparison matrix

The canonical data required for comparison already exists. `ResolvedReportRecord` loads quote evidence and line items; the report cost-integrity layer exposes active comparison quotes and L1/L2 values. The client’s `ComponentCostMatrix` demonstrates the intended presentation: one column per active repairer quotation, a separate KINGA Optimised column, a total row, and blank cells where a repairer did not quote a component.

The server CI renderer will use the same comparison policy and create a stable, print-safe matrix:

| Column group | Intended content |
|---|---|
| Repair item | Canonical component description and, where available, zone/category. |
| Active submitted quotations | One named repairer column per eligible active/supplementary quote; each cell uses that repairer’s line total or an explicit “not quoted” marker. |
| L1 — Lowest Submitted | The lowest all-in eligible submitted quote, clearly labelled as the comparison anchor. |
| L2 — KINGA Optimised | The approved component-level L2 amount, shown only when evidence completeness/reconciliation permits it. |
| Evidence/comment | Selection rationale, scope mismatch, price spread, benchmark trace, and review-required flags—never a fabricated benchmark or unverified settlement value. |

For more quotes than can fit on A4 landscape, the report will use a deliberate multi-page continuation layout with repeated headers. It will not silently discard columns or use a horizontal overflow container that a PDF renderer cannot represent safely.

### 3. Make L1 and L2 directly comparable across all insurer-facing reports

The shared cost-decision presentation will be extended to show a dedicated **Lowest Submitted (L1)** headline beside **KINGA Optimised (L2)**, plus an explicit variance/savings statement only when both amounts are evidence-qualified. The CI settlement waterfall and narrative will use the same comparison anchor; it must not use the highest quote while another report uses the lowest quote.

The report will retain the individual quotation cards because insurers still need to see the submitted market evidence. However, the headline comparison will be unambiguous:

> **Lowest submitted eligible quote (L1) → KINGA Optimised (L2) → difference and rationale.**

If L2 is incomplete, unreconciled, or only partially evidenced, the report will say so and suppress savings, settlement, and “best” claims rather than manufacturing a comparison.

### 4. Remove unsupported favourable defaults

The CI renderer will use a three-state evidence model for each risk finding: **assessed**, **not assessed**, or **insufficient evidence**. The report will only say “no prior claims,” “no anomaly,” “within normal range,” or “clear” where the corresponding canonical search/analysis was actually executed and returned that result. The current 75% completeness fallback will be replaced with `Not assessed`/`Unavailable` or a conservative explicitly-labelled incomplete state.

The `nArray` artefact will be reproduced from the archived CI HTML/report-generation request for this claim in a non-production test path. Because the identifier is absent from current source, it will not be “fixed” by speculative search-and-replace.

## Delivery sequence

| Package | Scope | Key acceptance criteria | Dependencies |
|---|---|---|---|
| **A — Print/export correction** | CI iframe print path, server page assembly, dynamic page numbering, print CSS. | No blank first page; full CI document prints from browser and server export; generated footer count matches PDF page count; no clipped tables. | Representative CI fixture and browser print test harness. |
| **B — Canonical quote matrix** | Shared server-side comparison model and CI renderer matrix. | At least three active quotes appear side by side; per-component values and totals are traceable; each missing cell is explicit; no quote is hidden beyond three. | Canonical active quote and line-item fixture set. |
| **C — L1/L2 cross-report parity** | Shared cost-decision strip, CI headline/economics/waterfall, CL/FR parity. | Same claim/date/tenant produces numerically identical L1, L2, and allowed savings across CL, CI and FR; comparison-anchor labels agree. | Package B and existing report-parity suite. |
| **D — Evidence-integrity correction** | Risk/default wording, completeness state, `nArray` reproduction. | No hard-coded favourable claim/physics/quote conclusion without a source result; unknown values are labelled; no runtime error text appears in PDF. | Historical CI HTML or reproducible claim fixture. |
| **E — Regression and visual sign-off** | Rendering, browser print, server PDF, multi-quote and incomplete-evidence tests. | All report tier regressions pass; real page-count/text assertions pass; visual A4 review passes; no new tenant or report parity failure. | Packages A–D. |

## Required tests before release

The repair must not be accepted on an HTML string assertion alone. The following tests are required:

1. **Browser-print integration test:** Load the CI iframe, invoke its dedicated print/export path, and prove that all report sections—not the iframe viewport only—are included.
2. **Server PDF rendering test:** Generate a CI PDF with enough content for at least four pages; assert the first page contains the masthead/content, the final page is non-empty, and footer page counts are generated correctly.
3. **Three-quote matrix test:** Create exact owned quote fixtures with three active repairers and overlapping/non-overlapping line items. Assert one column per repairer, named headers, all three totals, and explicit “not quoted” cells.
4. **L1/L2 parity test:** Generate CL, CI and FR for the same tenant-scoped claim. Assert identical L1, L2, and savings/variance semantics and labels across each report.
5. **Incomplete-evidence test:** Omit the relevant history, physics, quote, or completeness input. Assert “not assessed” or “insufficient evidence,” and assert the prohibited “no prior claims,” “no anomaly,” and fabricated 75% wording are absent.
6. **Tenant and authority regression:** Keep the existing report resolver’s session-derived tenant scope and foreign-tenant denial checks in the focused run.
7. **Visual A4 review:** Inspect CI PDFs with one, three, and more than three eligible quotes at desktop and mobile-originated export paths.

## Open decisions for the business owner

No product judgement is needed to correct printing, pagination, or display all active quote columns. Two policy choices should nevertheless be confirmed before the L1/L2 labels are finalised:

| Decision | Proposed default | Why confirmation matters |
|---|---|---|
| Savings comparison anchor | **L1 — lowest eligible submitted all-in quote** | It gives an insurer a direct, conservative comparator against L2. The report can still show all quote totals separately. |
| Quote eligibility | Use the canonical active/supplementary comparison set; show legacy/unverified quotes separately and label them as not comparison-eligible. | Prevents historical or duplicate quote data from being represented as payable market evidence. |
| Settlement display when L2 is incomplete | Suppress the settlement/savings number and show the reconciliation/coverage condition. | Avoids an apparently final financial figure where scope or evidence is incomplete. |

## Artefact-specific observations

The three supplied reports share substantial identity and workflow data, but they do not present cost evidence consistently. The Forensic report is the closest to the desired evidence model because it already uses the lowest quote as its comparison anchor. The CI report needs to adopt the same canonical cost presentation, not add another independent quote calculation. The CL report also has a separate server-rendered line-item table; during Package C it will be audited for the same one-column defect and moved to the shared matrix where appropriate.

## Per-report findings matrix

| Report | Sections/artifact evidence reviewed | Confirmed result | Required action |
|---|---|---|---|
| **Claims Liability (CL)** | Opening, cost-decision data flow, line-item table, total row and fraud/physics section in the supplied PDF and `server/reporting/reportDefinitions.ts`. | **Does not share the CI one-cost table defect.** CL builds one column for every active quote, gives each repairer a labelled header and total, uses an explicit dash when a line is not quoted, and includes a KINGA Optimised column. It also calculates/display L1 from the shared cost-integrity contract. CL still needs the shared L1/L2 headline improvement for visual consistency; it should not be rewritten as an independent matrix. | Reuse the shared L1/L2 decision strip in Package C; retain CL's mature active-quote matrix and test it alongside CI. |
| **Claims Intelligence (CI)** | All four pages of the supplied PDF; cover/page transitions; cost summary; quote cards; line-item comparison; parent iframe view and Print / Export action; `claimsIntelligenceReport.ts`. | **Confirmed highest-priority report-quality gap.** It has the blank opening page/static 2-page footer problem, parent-window/visible-iframe print path, only one submitted line-item amount, a three-quote display cap, and inconsistent highest-quote rather than L1 anchor for the savings narrative. | Packages A–D are required before CI is again used as an insurer-facing decision comparison. |
| **Forensic Report (FR)** | Opening/financial-validation pages of the supplied PDF; submitted quote ledger; quote-comparison bars; financial-validation/L1/L2 table; `forensicDecisionReport.ts`. | **Does not share the CI L1/L2 headline defect.** FR lists every submitted active quote in its ledger and bar chart, displays `Lowest submitted (L1)` alongside `KINGA optimised (L2)`, and describes any saving as below the lowest submitted quote. It is therefore the correct semantic anchor for CI. FR's bar chart is a total-quote view, not a component-by-component matrix; that is appropriate for the forensic summary provided the separate CI/CL matrix remains the detailed comparison. | Preserve FR's L1/L2 semantics; add parity tests so CI and CL cannot regress to a different comparison anchor. No FR layout rewrite is proposed in this batch. |

### Cross-report conclusion

The source trace shows that current code contains more quote-presentation capability than the supplied artefacts demonstrate. That is **not evidence that the capability was populated for this claim**. The artefacts are authoritative for this audit: all three report PDFs lack a usable detailed multi-quote comparison and all three withhold a populated final L2 amount. The remedy must therefore verify the claim's canonical quotation ledger, line-item extraction, evidence eligibility, and report-version provenance before relying on any renderer capability.

## Correction: artefact-led cross-report finding

The initial source-led assessment was too broad in describing CL and FR as if their available renderer paths proved a populated comparison in the supplied reports. The following corrected position governs implementation planning.

| Report | What the supplied artefact actually shows | What current source capability means | Correct classification |
|---|---|---|---|
| **CL** | Its quotation section states that no submitted quotation evidence is available. It contains neither a side-by-side row matrix nor an L2 amount. | The current CL renderer has a *conditional* multi-quote matrix, but it renders only when the report record presents active quote rows and component descriptions. The delivered PDF did not meet that condition or was generated by a different deployed renderer revision. | **Not populated in the artefact.** Trace report-version provenance and canonical record inputs before treating the source matrix as a fix. |
| **CI** | It lists two submitted quote headers, labels the evidence as partial/history-only, provides no detailed line-item matrix, and withholds L2. | CI reduces its detailed comparison to a single submitted-price field and uses a browser print path that is separate from server-PDF output. | **Renderer and data-contract gap.** CI needs a canonical multi-quote matrix plus a complete print/export correction. |
| **FR** | It lists two submitted quote header totals and source-level evidence gaps, then displays `L1 — lowest active submitted quote: Not available` and `L2 comparison pending evidence`. It has no component-by-component multi-quote table. | FR intentionally provides a high-level total-quote bar/ledger and L1/L2 financial block. Its final L2 publication is correctly guarded by completeness, but the delivered L1 withholding despite visible header totals needs an evidence-state explanation. | **Data qualification plus presentation gap.** Preserve final-L2 safety gate; add a clearly labelled submitted-header comparison and detailed evidence matrix. |

### What must and must not be “fixed” about L2

The supplied reports state that the quote scope is incomplete: at least one damaged component has no traceable price and some source totals do not reconcile to itemised rows. A final **KINGA Optimised (L2)** amount must therefore remain unpopulated until the complete payable scope is supported by reconciled evidence. Publishing a number merely to fill the dashboard/report space would create an unsupported settlement-like output.

The fix is to make the distinction useful to an insurer:

1. Show every active submitted **quote-header total** side by side, clearly labelled as a submitted document total and separately labelled when unreconciled or incomplete.
2. Show every extracted **line item** side by side for all active quotes. A missing/illegible/unpriced cell must be an explicit evidence gap, never `0` and never silently hidden.
3. Show an **L2 component selection column** only for components with complete, qualified pricing. If the all-in L2 is incomplete, the total cell must say `Final L2 not published — incomplete scope`, with a linked count/list of the blocking components.
4. Where canonical data supports an evidence-qualified partial comparison, show that subtotal only as `Partial evidence comparison — not a payable total`, never as the final L2 or a saving/settlement amount.
5. Retain historical/superseded quotations outside the active comparison grid and never use them to derive L1, L2, savings, or a settlement recommendation.

### Revised delivery packages

| Package | Scope | Acceptance criteria |
|---|---|---|
| **A — Claim evidence/provenance trace** | For the supplied claim, trace canonical quote-ledger rows, active/legacy/evidence-eligibility state, line-item extraction, reconciliation state, and the deployed report renderer version. This is read-only first. | Explains why CL sees no active quote evidence while CI/FR show two header totals, and why FR's evidence-qualified L1 is null. No unscoped data access or data alteration. |
| **B — Shared quote-evidence matrix** | Create one provenance-preserving report component/HTML helper used by CL, CI, and FR. It receives canonical ledger data and line-item evidence; it does not calculate prices independently. | All active repairers appear as columns; each row identifies its source status; missing cells are explicit; historical rows are separated; no row invents a number. |
| **C — L1/L2 state presentation** | Provide a shared header/total strip that differentiates submitted header totals, evidence-qualified L1, partial comparison, final L2, and unavailable/reconciliation-required states. | A final L2 appears only when `l2Status === complete` and complete scope is present; header totals can remain visible with their evidence limitation; no savings/settlement language appears when L2 is incomplete. |
| **D — CI print and server-PDF repair** | Correct CI's blank opening page, static footer/page numbers, and parent-window iframe print path. | Browser print uses the report document's own print context; server PDF has no blank page and correct number of sheets; long matrix paginates with repeated headers. |
| **E — Regression and artefact sign-off** | Add unit, server-render, browser-print, and visual-PDF coverage using two active quotes, partial scope, complete scope, legacy history, and no-quote cases. | CL, CI, and FR are compared from the same canonical input. A reviewer confirms A4 artefacts, matrix completeness, L2 guard behaviour, tenant authority, and no fabricated cost/savings statement. |

### Required decision before Package C

The evidence-safe default is to display the lowest *usable evidence-qualified* submitted amount as L1 only when its supporting itemised evidence passes the existing contract. The product owner should decide whether an incomplete/unreconciled quote header may also be prominently shown as **“Lowest submitted document total (unreconciled; not L1 decision evidence)”**. This can help an insurer compare documents without misrepresenting the figure as an approved cost basis. No code should conflate that display-only document total with final L1/L2 decision logic.

## Boundaries

This plan does **not** authorise a claim replay, quote editing, report deletion, changes to production data, an automatic settlement decision, payment workflow work, schema migration, or external-provider change. The first implementation should be a review-only branch with the packages above separated into small commits. Re-running or replacing this claim’s production report should occur only after the code is reviewed, deployed, and you explicitly approve report regeneration.

## Evidence references

- Supplied artefacts: `KINGA—DOC-20260810-84080652cl1.pdf`, `KINGA—DOC-20260810-84080652ci2.pdf`, `KINGA—DOC-20260810-84080652fr.pdf`.
- CI server renderer: `server/reporting/claimsIntelligenceReport.ts`.
- Shared cost presentation: `server/reporting/costDecisionPresentation.ts`.
- Canonical cost ledger: `server/reporting/costIntegrity.ts` and `server/reporting/resolvedReportRecord.ts`.
- Server PDF renderer: `server/reporting/pdfRenderer.ts`.
- CI iframe view: `client/src/components/ClaimsIntelligenceReportView.tsx`.
- Parent browser print action: `client/src/pages/InsurerComparisonView.tsx`.
- Existing professional comparison matrix: `client/src/components/ComponentCostMatrix.tsx`.
