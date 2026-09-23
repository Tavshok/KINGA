# P0-B1-Client Scope Estimate: Reachable Browser Fraud Consumers

**Prepared:** 2026-09-23
**Status:** Proposal only. No implementation is authorized by this document.
**Baseline:** `main` at `063c6fc65adfdcc35003b1f17782685f6485f0fd`, immediately after PR #148.

## Recommendation

P0-B1-Client should be treated as a **20–28 engineer-day integrity program**, delivered as three independently reviewable implementation packages under one approved scope. It is not a purely presentational cleanup. Seven reachable browser files presently use raw fraud fields to shape approval, escalation, decision recommendation, or routing. Fourteen reachable files create or feed a browser-created report, print, spreadsheet, PDF, or server-report artifact. The remaining twenty-six runtime files render or locally classify raw fields beside operational actions and can influence manual decisions even when they do not directly submit a mutation.

Each implementation package should use the same pattern established in P0-A, P0-A-2, and P0-B1: server-issued allowlisted view models, server-side enforcement of every approval or routing decision, raw-field removal from browser state, actionable withholding where the policy is not yet qualified, focused guarded regressions, and an adversarial review before merge. No browser score, level, flag, indicator, threshold, or fallback may substitute for a governed server conclusion.

## Reconciled file count

The original scan found **51 reachable files** with an exact direct-field match. The six approved containment locations belong to two files, not six separate files: `ClaimReviewDialog.tsx` and `ExecutiveDashboard.tsx`. The mechanically remaining count is therefore **49 reachable files**, rather than 45. Two are not runtime consumers: `labelUtils.ts` contains only a documentation example, and `pdfExport.shared.ts` declares permissive input types without rendering or saving a fraud value. They should be corrected while the relevant artifact DTOs are replaced, but they do not justify a standalone remediation path.

The recommended active P0-B1-Client implementation scope is consequently **47 runtime consumer files**. Thirteen additional direct-field files are not reached by the current static browser graph. They are not an exemption from policy; they are excluded only from this active scope and should remain listed in the inventory with a no-new-import gate until separately retired or governed.

| Category                                             | Runtime files | Character of risk                                                                                                    | Delivery package               |
| ---------------------------------------------------- | ------------: | -------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Browser authority and workflow logic                 |             7 | Client score or level changes approval, escalation, routing, decision recommendation, or snapshot lifecycle behavior | P0-B1-Client A                 |
| Report, print, PDF, spreadsheet, and artifact inputs |            14 | Raw values can become a browser-created artifact or enter a server artifact through an identifier-only flow          | P0-B1-Client B                 |
| Presentation, dashboard, queue, and triage surfaces  |            26 | Raw values and locally derived labels can steer review, triage, or operational action                                | P0-B1-Client C                 |
| Type-only or documentation contracts                 |             2 | No direct runtime disclosure, but permissive contracts can enable future leakage                                     | Fold into the relevant package |
| Unreached direct-field files                         |            13 | No current browser path; future import could reactivate disclosure                                                   | Deferred, gated backlog        |

## P0-B1-Client A — Browser authority and workflow logic

**Estimate:** 6–8 engineer-days. **Review:** adversarial. **Purpose:** remove browser-held fraud values from actual approval, escalation, decision, routing, and snapshot authority.

The seven files are `ClaimApprovalToolbar.tsx`, `DecisionAuthorityPanel.tsx`, `AssessorClaimDetails.tsx`, `ClaimDecisionReport.page.tsx`, `InsurerComparisonView.tsx`, `InternalAssessorDashboard.tsx`, and `RiskManagerDashboard.tsx`. They contain more than display logic. Examples include a `fraudScore >= 70` approval gate, construction of a raw `fraud_result` for decision evaluation, client fallback escalation queues, client-selected levels that imply routing, and raw values embedded in decision snapshots.

The remediation must add claim-scoped, role-aware server DTOs and server enforcement at the downstream approval, routing, report-finalisation, attestation, and snapshot APIs. The browser will receive a governed decision state or the shared P0-B1 actionable hold, never raw fields used to assemble a decision. Existing client mutations must be tested to prove that adding a fraud field to a browser payload neither alters server behavior nor bypasses the hold.

## P0-B1-Client B — Browser and report artifact boundaries

**Estimate:** 7–10 engineer-days. **Review:** adversarial. **Purpose:** stop raw fraud values from entering user-created reports, PDFs, print views, spreadsheets, integrity seals, and identifier-only server report flows.

The fourteen runtime files include `Batch3ReportComponents.tsx`, `ForensicCharts.tsx`, `KingaClaimsReport.tsx`, `Phase3ReportComponents.tsx`, `export-excel.ts`, `exportUtils.ts`, `fleetReportExport.ts`, `pdfExport.claimSummary.ts`, `pdfExport.comparison.ts`, `pdfExport.damage.ts`, `AssessmentResults.tsx`, `InteractiveReport.tsx`, `ReportsCentre.tsx`, and `PlatformClaimTrace.tsx`.

This package must replace the permissive browser artifact inputs with a server-issued, audience-scoped report and export DTO. The DTO requires an explicit template and role allowlist. Default client artifacts omit all raw fraud numerics, levels, indicators, score breakdowns, and raw narratives. Identifier-only server report requests are not assumed safe: the server template must impose the same allowlist before it reads a snapshot or report record. Regression coverage must inspect generated text or structured export inputs and prove that forbidden fields are absent.

## P0-B1-Client C — Presentation, dashboard, queue, and triage surfaces

**Estimate:** 7–10 engineer-days. **Review:** adversarial for shared DTO and server response changes; one independent review per isolated client-only replacement. **Purpose:** remove raw fraud display and client-side risk classification from operational views.

The twenty-six runtime files include intelligence cards, drill-downs, indicators, checklists, forensic panels, governance panels, replay views, assessor and processor work queues, fleet views, insurer triage, fraud analytics, administrator views, relationship intelligence, risk analytics, and monitoring surfaces. The precise file list is preserved in the companion inventory.

Most of these are display or advisory paths rather than direct mutations, but they are not low risk. A browser-calculated badge, threshold, queue ordering, risk color, or “requires attention” statement can steer an assessor, claims manager, or executive toward a decision. Each consuming API must stop returning raw fraud fields to the browser while the P0-B1 policy is unresolved. The UI must show the common actionable hold or, only where proven independently non-fraud, a documented neutral operational status. Geographic and relationship aggregate labels such as `high_risk` require provenance tracing before they are retained.

## Shared implementation invariants

Every P0-B1-Client package must preserve the following invariants.

1. **Authority remains server-side.** The browser cannot determine approval eligibility, escalation, report finalisation, payment eligibility, queue inclusion, or decision recommendation from a raw fraud field.
2. **The evidence boundary is explicit.** Server DTOs use field allowlists. They never return raw score, risk level, indicator, flags, analysis, breakdown, or fraud narrative to a general browser consumer merely because the underlying record contains it.
3. **Withholding is actionable.** When a fraud conclusion is not authorized, the standard P0-B1 marker states the missing evidence and the resolution path. A blank card, zero, low-risk default, or silent omission is not sufficient.
4. **Independent content survives.** Claim, vehicle, cost, quote, workflow, documented human review, and other independently supported non-fraud content remain available when they do not imply a fraud conclusion.
5. **Artifacts receive the same controls.** Browser export and print code, server PDF/report routes, snapshots, shared-report links, and email/report delivery all consume the same audience-scoped allowlist rather than their own raw object shapes.
6. **No scope laundering.** An unqualified legacy fraud result does not become authoritative when renamed `highRisk`, `riskSignal`, `flagCount`, `overallRisk`, `fraudRate`, or a derived aggregate.

## Validation plan

Each package will use `scripts/run-isolated-vitest.ts` against `kinga_ci_test` only. The minimum test matrix will include a positive non-fraud preservation case; an adversarial raw-field fixture containing score, level, flags, indicators, analysis, and a readable marker string; a cross-tenant and wrong-role negative case for each new server DTO; a browser behavior check that renders the actionable hold; and an artifact-content assertion for every export package. Authority packages additionally require mutation-level negative tests that show a forged browser fraud field cannot alter approval, routing, escalation, or finalisation.

Full guarded-suite and production-build validation occur only at each genuine merge-readiness checkpoint. The complete browser graph must be re-inventoried after P0-B1-Client C; a zero count is not assumed from the baseline scan.

## Explicit exclusions

This estimate does not authorize P0-B2, P0-A-3, new automated fraud eligibility criteria, a new data model, a schema migration, staging or production access, or any remediation of the thirteen currently unreached direct-field files. It also does not declare the existing P0-B1 integration a complete client-side closure.

## References

[1]: https://github.com/Tavshok/KINGA/tree/063c6fc65adfdcc35003b1f17782685f6485f0fd "KINGA pinned post-PR-148 baseline"
[2]: https://github.com/Tavshok/KINGA "KINGA source repository"
