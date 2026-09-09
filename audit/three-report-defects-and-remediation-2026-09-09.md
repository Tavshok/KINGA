# KINGA DOC-20260810-84080652 — Three-Report Quality Review and Remediation Plan

**Audit date:** 9 September 2026  
**Evidence reviewed:** user-supplied Claims, Claims Intelligence (CI), and Forensic (FR) PDFs; user-supplied browser print-preview screenshots; current report-generator and viewer source.  
**Boundary:** diagnostic only. This document does not change the claim, quotation, evidence, workflow, report data, or report calculations.

## Executive finding

The Claims Report prints acceptably. The CI and FR print problems should **not** be treated as isolated template defects. The evidence shows two print routes: a standard Claims Report route that prints a direct document and works, and iframe-backed CI/FR routes that have been routed through portal and embedded-document print paths. The resulting preview behaviour is inconsistent and remains unsuitable for insurer-facing use.

The three reports also describe quote evidence at different levels. The detailed ledger shown in CI/FR is truthful source evidence, but it is not a side-by-side commercial quote comparison. The current experience does not make that distinction understandable enough for an insurer. A fully qualified L1/L2 total must remain withheld until the necessary comparable, scope-equivalent source evidence exists; it must not be manufactured to make the table look complete.

## Evidence-led defect register

| ID | Severity | Confirmed evidence | Defect and impact | Likely source boundary |
|---|---|---|---|---|
| PRINT-01 | **Blocking** | CI supplied PDF has a blank opening page; browser preview screenshots show a blank first print-preview page. | CI is not dependable as a printable insurer report. The reader starts on a blank sheet and may assume report content is missing. | Browser printing of the iframe/portal path, not the server HTML alone. A server-rendered A4 document can have populated page 1 while browser print still creates a blank page. |
| PRINT-02 | **Blocking** | User reports FR prints only the visible area; screenshot shows intrusive vertical controls at the report edge during print preview. | FR cannot be relied upon to deliver its full record, and portal/iframe controls risk contaminating the print route. | Embedded-document print handling and report viewport/scroll containment. The screenshot establishes the defect; whether the vertical control is printed content or preview chrome must be proven with a saved output PDF. |
| PRINT-03 | High | Claims Report prints correctly; CI/FR do not. | There are multiple printing architectures for report tiers. Repeated tier-specific patches are increasing risk and do not give a single testable contract. | Direct parent-document printing for Claims vs. iframe-backed CI/FR printing. |
| QUOTE-01 | **High—usability and consistency** | CI/FR show a “Cost evidence audit ledger — submitted source rows only; not a quotation comparison, L1, L2, savings, or settlement table.” The user expected individual line items by quotation and a commensurate L2. | The ledger is factual but answers a different question from a quotation comparison. It presents source rows, not quote columns, so an insurer cannot see like-for-like repairer alternatives at a glance. | `evidenceGovernancePresentation.ts` is intentionally rendering source evidence; `sharedQuoteEvidencePresentation.ts` renders a comparison only for eligible active evidence. The page hierarchy does not sufficiently distinguish the two. |
| QUOTE-02 | High | The supplied report contains a submitted quote total and component source rows, while cost summary statements can say no submitted quotation is available for verification or show no final comparison. | Cross-tier wording can appear contradictory: a document exists, but the decision layer has no **eligible active comparable quotation**. The report does not consistently explain that technical distinction. | Divergent display projections: source-evidence ledger versus active comparison evidence. The Claims Report has an additional inline comparison path that needs to be brought behind the same presentation contract. |
| L1L2-01 | **High—evidence governance** | Current CI source resolves cost integrity from canonical quote evidence. The supplied report identifies an incomplete/qualified evidence state, including 62 of 63 explicit source rows verified, and does not display a complete L2 total. | No full L1/L2 comparison should be inferred from the source ledger. The missing amount is not evidence that an L2 calculation has failed; it can be a valid withholding because one or more required scope, eligibility, currency, or reconciliation conditions remain unresolved. | `costIntegrity.ts`, `costEvidenceStatePresentation.ts`, and `sharedQuoteEvidencePresentation.ts`. A diagnostic should classify the exact missing gate for this claim before any L2 is shown. |
| L1L2-02 | High | Current source contains several verbose L2 states and an evidence ledger note, spread across different sections. | The user must work through several explanations to understand one conclusion. The report needs one plain-language cost decision box before detailed evidence: available/not available, reason, what is needed next, and what is expressly not being calculated. | Cost-decision and cost-evidence presentation layer, not calculation logic. |
| VP-01 | Medium | User reports Vehicle Passport colour treatment is inconsistent in every report. Previous source trace found tier-specific Vehicle Passport markup and legacy inline colour treatments. | Vehicle Passport looks like a separate application widget rather than evidence in the same formal report. This weakens visual hierarchy and makes cross-tier reports feel inconsistent. | CI and FR Vehicle Passport sections plus shared report design tokens. The implementation should be consolidated into one neutral evidence-panel renderer. |
| LAYOUT-01 | Medium | CI PDF has sparse late pages; previous inspection recorded a low-content near-final page. | Unnecessary white space makes a report harder to review and creates the impression of missing content. | Over-use of `page-break-inside: avoid`, section wrappers, or table break rules. This needs targeted pagination rules, not removal of all breaks. |
| COPY-01 | Medium | Cost section uses technical phrases such as “source rows,” “reconstructed,” “scope pending,” and “qualification required.” | The terms are useful for audit, but without an initial business-language summary they are difficult for an insurer or assessor to interpret. | Evidence-governance ledger presentation. |

## What the quoted figures mean for this document

The line-item table visible in the supplied screenshot is a **source-evidence audit ledger**. It proves where a submitted amount or component line came from and records its status; it is deliberately not a quote-comparison table. It must therefore not be relabelled as L1, L2, savings, or settlement.

For this document, the evidence trace established a high—but not complete—source-evidence state: **62 of 63 explicit source rows were verified**. That is not sufficient, by itself, to publish a fully qualified L2 total. A complete L2 requires the canonical integrity gate to have a traceable amount for the full confirmed repair scope and to pass its eligibility/reconciliation rules. The system must retain this withholding rather than invent a “KINGA Optimised” total.

However, the report must say this once, plainly:

> **Comparison status: not yet available as a final insurer decision value.** A submitted repair document and its component evidence have been retained. At least one required qualification/reconciliation condition is outstanding, so KINGA is not presenting an L1, L2, saving, or settlement figure. The next step is to obtain or reconcile the missing scope-equivalent, traceable pricing evidence.

If a valid active comparison exists after reconciliation, the insurer-facing view should show a separate line-item matrix: one column per eligible repairer quotation, missing items marked “not priced,” and a final **L1** plus **L2** column only when their respective gates are satisfied. The source-evidence ledger should remain below it as an audit appendix.

## Proposed remediation sequence

### 1. Stabilise live frontend loading before further print testing

The published portal has repeatedly failed to load `Home-<hash>.js` after deployments. The stable-JavaScript-chunk repair is merged but needs publication and a fresh desktop/mobile check. Do not continue browser-print acceptance testing until the portal loads normally on a fresh session.

### 2. Replace iframe printing with one dedicated report-document print contract

The correct durable solution is not another variation of parent-window `window.print()` or child-iframe `window.print()`.

1. Create one shared print service for CI and FR.
2. In the synchronous user-click handler, open a dedicated, blank print window to avoid popup blocking.
3. Copy the complete server-rendered report document into that window, including its document CSS and a base URL for assets.
4. Await document readiness, images, and fonts; verify document height is non-zero; then invoke print on the dedicated document.
5. Close the window after printing if the browser permits, otherwise leave it as a readable report tab.
6. Retain the existing direct-print path for Claims Report, since its user validation is positive.

This removes portal wrappers, fixed-height iframes, scrollbars, dropdown controls, and parent-page CSS from the CI/FR print document. It should be covered by a shared behaviour regression plus saved Chromium PDFs for CI and FR that assert populated first/last pages.

### 3. Add a print acceptance matrix that reflects real user paths

For every release affecting report printing, test the **actual portal controls** separately:

| Report | Control | Required acceptance evidence |
|---|---|---|
| Claims Report | `Print / Export PDF` | First page populated; all pages present; no report viewport or portal shell. |
| Claims Intelligence | portal `Print / Export PDF` and report `Print full report` | Both route to the same dedicated document; populated first page; full document; no iframe scroll bar. |
| Forensic | portal `Print / Export PDF` and any report-level action | Both route to the same dedicated document; populated first page; full document; no iframe scroll bar, dropdown, or portal UI. |

The saved PDF—not merely the preview count—should be the acceptance artefact.

### 4. Make quote evidence readable without changing the evidence gate

Implement a single cross-tier **Cost Decision Summary** immediately before the detailed evidence. It should contain no more than four clearly labelled facts: comparison state, L1 state, L2 state, and next evidence action.

Then render in this strict order:

1. **Eligible quotation comparison** — only when there are eligible, scope-equivalent quotations on one approved basis.
2. **L1 / L2 decision row** — only values that pass the canonical eligibility gate.
3. **Submitted source-evidence ledger** — labelled as traceability evidence, never as a comparison.
4. **Required reconciliation actions** — the smallest factual list of what prevents a comparison or final L2.

The Claims Report’s existing inline `activeQuoteRows` comparison must be reconciled with `sharedQuoteEvidencePresentation.ts`; it should no longer independently decide that quotation evidence is absent or present. CI and FR must use the same presenter and the same status vocabulary.

### 5. Consolidate Vehicle Passport into a neutral shared evidence panel

Create one shared report renderer for Vehicle Passport evidence. It should use the formal report palette and typography, use colour only for verified/warning/unavailable state, and avoid application-widget colour blocks. The data contract must remain unchanged. Add a visual regression against the same normal, warning, and unavailable states across Claims, CI, and FR.

### 6. Repair sparse pagination deliberately

Remove the CI opening-page break only where it precedes the first substantive section. Replace blanket “avoid break” rules for long ledgers with table header repetition and controlled continuation labels. The goal is to keep headings with their first content row while allowing long evidence tables to paginate naturally.

## Decision gates

| Gate | Required before implementation | Status |
|---|---|---|
| Full L1/L2 for this claim | Canonical evidence trace must name every unresolved eligibility/reconciliation condition and confirm it is resolved from authoritative source evidence. | **Not authorised / not satisfied.** |
| Quote comparison | At least the required eligible, comparable, same-basis quotations and line-item evidence must exist. | **Do not infer from the source ledger.** |
| Dedicated CI/FR print window | Source inspection and contained browser/PDF regression. | Engineering change; no business-data decision required. |
| Vehicle Passport visual consolidation | Shared visual component, no data or evidence-rule change. | Engineering change; no business-data decision required. |

## Recommended priority

1. **P0:** restore dependable live frontend asset loading and publish it.
2. **P1:** implement the dedicated CI/FR print-document route and verify with saved PDFs from the actual portal controls.
3. **P1:** consolidate the cost-decision summary and remove cross-tier quote-state contradictions while preserving L1/L2 withholding.
4. **P2:** consolidate Vehicle Passport presentation and tune long-table pagination.

No remediation should create a final L1, L2, savings, settlement, or comparison ranking for this claim until the canonical evidence gate confirms that the underlying source evidence supports it.
