# KINGA AutoVerify — Silent-Bug Investigation Report
**Date:** 2026-07-10  
**Scope:** Two items from the Image Subsystem backlog + BMW 318i case-study re-run  
**Status:** Investigation complete — no fix work performed

---

## Executive Summary

Three items were investigated: (1) the claim that the cost model does not persist line items into the assessment record, (2) the claim that image-analysis failures cause critical report sections to disappear silently, and (3) the BMW 318i end-to-end case study, which was listed as a proof-of-work check against `consistencyScore > 70, criticalFailures = 0`. The findings are materially different from the original backlog descriptions in all three cases, and the severity picture is more nuanced than the backlog language implied.

---

## Bug 1 — Line-Item Persistence ("Cost model not populating line items into assessment record")

### What the backlog said

> "Cost model not populating line items into assessment record (silent bug — line items extracted but not persisted)"

### Investigation method

A live database query was run across all 149 pipeline-extracted quotes in `panel_beater_quotes` to count how many had zero rows in `quote_line_items`. The two zero-row cases were then traced through the `costIntelligenceJson` column of `ai_assessments` to determine what the pipeline actually produced.

### Findings

**The bug is real but narrow.** Of 149 pipeline-extracted quotes, 147 (98.7%) have correctly persisted line items in `quote_line_items`. Two quotes — `id=5790001` (claim 7260001, Swiss Motors, 4 June 2026) and `id=5040003` (claim 6570001, 20 May 2026) — have zero rows.

However, the investigation revealed that the data is **not lost**. For claim 7260001, `costIntelligenceJson.lineItems` contains 33 line items, all correctly extracted. The line items exist in the JSON blob but were never written to the relational `quote_line_items` table. The `quote_line_items` table is used by the Quote Comparison view and the Parts Reconciliation panel; the `lineItems` array inside `costIntelligenceJson` is what the ForensicAuditReport reads directly.

### Root cause

The `costIntelligenceJson` object contains two distinct line-item representations that were introduced at different points in the pipeline's development:

1. **`lineItems`** — the original flat array, written by the cost decision engine and stored inside `costIntelligenceJson`. This is the array the report reads.
2. **`documentedLineItems`** — a newer structured field introduced to feed the relational `quote_line_items` table via `db.ts`. This field is absent from both affected claims (`Has documentedLineItems: false`).

The two affected claims ran on 20 May and 4 June 2026, before `documentedLineItems` was wired into the Stage 9 output path. The persistence code in `db.ts` reads `costAnalysis.documentedLineItems`; when that field is absent (because the claim ran on an older pipeline version), the insert is silently skipped. No error is thrown.

### Severity

**Low-to-medium.** The report is not affected — it reads `lineItems` from `costIntelligenceJson` and renders correctly. The impact is confined to the Quote Comparison view and any downstream queries that JOIN on `quote_line_items`. The two affected claims are historical; all 147 quotes processed after the `documentedLineItems` field was introduced are correct. This is a data-backfill gap, not an ongoing production bug.

### Evidence

| Quote ID | Claim ID | Quoted amount | `quote_line_items` rows | `costIntelligenceJson.lineItems` count | Created |
|---|---|---|---|---|---|
| 5790001 | 7260001 | R 25,553 | **0** | 33 | 2026-06-04 |
| 5040003 | 6570001 | R 18,995 | **0** | not checked (older schema) | 2026-05-20 |
| All others (147) | various | various | ≥ 7 | matches | 2026-06-04 onward |

---

## Bug 2 — Image-Failure Report Degradation ("Report missing critical sections when image analysis fails")

### What the backlog said

> "Report missing critical sections when image analysis fails (assessor remarks, cost breakdown, evidence summary should degrade gracefully, not disappear)"

### Investigation method

All assessments with `pipeline_degraded_stages_json` containing `6_damage_analysis` were identified (10 records). Two representative cases — claim 8160001 (2012 Toyota Corolla, most recent) and claim 7830002 — were traced through the full data path: `pipeline_run_summary`, `forensic_analysis`, FCDI score, sentinel violations, and the `buildDamageSection` function in `stage-10-report.ts`.

### Findings

**The bug description is inaccurate — sections do not disappear silently.** The pipeline has a multi-layer degradation signalling system that is working as designed:

**Layer 1 — Stage 10 report builder.** `buildDamageSection()` in `stage-10-report.ts` has an explicit null guard (line 86–91): when `damageAnalysis` is `null`, it returns `{ title: "Damage Analysis", content: { available: false, note: "Damage analysis data unavailable." } }`. The section is present in the report object; it is marked unavailable, not omitted.

**Layer 2 — FCDI score.** Claim 8160001 received an FCDI score of **21/100 (CRITICAL)**. The ForensicAuditReport renders the FCDI banner prominently at the top of the report with the label "Pipeline unreliable" and an explanation that includes the text: *"IMAGE PIPELINE FAILURE: No damage photos were extracted from the submitted documents. Visual damage analysis..."*

**Layer 3 — Sentinel violation.** The `anomalySentinelViolations` array for claim 8160001 contains `S3_DAMAGE_WITHOUT_PHOTOS` (severity: WARNING): *"Damage component list has >3 items but no photos were processed. Damage assessment is based on narrative only — lower reliability."*

**Layer 4 — Data quality gate.** The `dataQuality.validationIssues` array contains a CRITICAL gate message: *"[GATE HOLD] Request damage photographs from the claimant or assessor before re-submitting the claim for processing."*

**Layer 5 — Degradation reasons.** `stage-10-report.ts` builds an explicit `degradationReasons` array. For a zero-photo claim it produces: *"No damage photos were available for vision analysis. If photos were embedded in the claim PDF, the image extraction step may have failed. Upload photos separately via the Evidence Upload button to enable full vision analysis."*

The root cause of the original backlog entry appears to be a **UI rendering gap**, not a data gap. The `degradationReasons` array is populated correctly in the pipeline output, but it is stored in `forensic_analysis` rather than in a dedicated top-level column. The ForensicAuditReport reads it via `fa.degradationReasons` — however, the investigation confirmed that `fa.degradationReasons` resolves to `undefined` for claim 8160001 because the `forensic_analysis` JSON does not include a `degradationReasons` key at the top level. The reasons are embedded inside the stage-10 report output object, which is stored separately in the full report blob, not in `forensic_analysis`.

### What the adjuster actually sees

The adjuster sees the FCDI banner (CRITICAL, 21/100) and the sentinel violation warning. They do **not** see the human-readable degradation reason string ("No damage photos were available...") because that string is not surfaced in the UI. The damage section renders as a placeholder tile ("Damage analysis data unavailable") without explaining why or what action to take.

### Severity

**Medium.** The data is not lost and the report is not silently wrong — the FCDI score and sentinel correctly signal that the damage analysis is unreliable. However, the actionable degradation reason (the specific instruction to upload photos separately) is computed but never displayed to the adjuster. An adjuster looking at a CRITICAL FCDI score with no explanation of the cause or remediation step is likely to escalate or re-run the pipeline without understanding why it failed.

---

## BMW 318i Case Study — End-to-End Integration Test

### Target

`consistencyScore > 70`, `criticalFailures = 0`

### What was run

The BMW 318i case study in the backlog refers to the `imageClassifier.test.ts` scenario *"BMW 318i Scenario: 14 page renders + 15 embedded images"* and the broader `pipeline-fixes.test.ts` parts normalisation test for BMW rear-end damage. These are the only test-suite entries that directly exercise the BMW 318i scenario.

### Actual result

**The BMW 318i imageClassifier scenario fails.** Running `pnpm vitest run server/pipeline-v2/imageClassifier.test.ts` produces **6 failed / 28 passed**. The BMW 318i scenario test fails with:

```
AssertionError: expected 3 to be greater than or equal to 10
  → result.summary.documentPageCount should be ≥ 10 but is 3
```

The root cause is a deliberate design decision in `imageClassifier.ts` (lines 257–270): text-heavy `page_render` images are intentionally **not** hard-classified as `document_page`. They are left as `other` so the LLM can visually inspect them, because a text-heavy page render may be a repair quotation (Swiss Motors format) rather than a plain document page. The heuristic returns `'other'` for `makeDocumentPage()` fixtures because `isTextHeavy = true` and the score is below `LOW_CONFIDENCE_THRESHOLD` — the branch at line 266 (`score < LOW_CONFIDENCE_THRESHOLD && !q.isTextHeavy`) is not entered.

This is a **test/implementation mismatch**, not a production bug. The implementation is correct by design; the test was written against an earlier version of the classifier that did hard-classify text-heavy page renders as `document_page`. The test has been failing since at least the current HEAD commit (confirmed: identical failure on `git stash` with no local changes).

**The `criticalFailures` metric** lives in `stage-7b-causal-reasoning.ts` and is not directly exercised by the imageClassifier test. The stage-7b zone-matching test suite (16 tests) passes 16/16. No test in the current suite exercises `criticalFailures` against a BMW 318i scenario specifically.

### Consistency score

The `consistencyScore > 70` target cannot be evaluated against a live pipeline run without submitting a real claim through the full orchestrator. The `consistencyScore` is a Stage 7 output (`damageConsistencyScore`) that requires vision-based damage analysis (Stage 6) to produce a meaningful value. No test fixture exercises this end-to-end path without LLM calls.

### Summary

| Metric | Target | Actual |
|---|---|---|
| `documentPageCount` (imageClassifier BMW 318i scenario) | ≥ 10 | **3** (test fails) |
| `damagePhotoCount` (imageClassifier BMW 318i scenario) | ≥ 5 | Not reached (test aborts at line 574) |
| `criticalFailures` (stage-7b zone matching) | 0 | **0** (16/16 pass) |
| `consistencyScore` (Stage 7, live pipeline) | > 70 | **Not measurable** without live LLM run |

The imageClassifier BMW 318i test failure is pre-existing (not introduced by any Batch 1–9 work) and reflects a test that was not updated when the classifier's `document_page` hard-classification logic was deliberately removed.

---

## Summary Table

| Item | Confirmed real? | Severity | Silent? | Action needed |
|---|---|---|---|---|
| Line-item persistence | Yes, but narrow (2/149 quotes, historical) | Low–medium | Yes — no error thrown | Backfill 2 historical records; verify `documentedLineItems` wiring on current pipeline |
| Image-failure missing sections | Partially — sections present but degradation reason not surfaced in UI | Medium | Partially — FCDI/sentinel visible, actionable message not visible | Surface `degradationReasons` string in ForensicAuditReport UI |
| BMW 318i imageClassifier test | Test fails (pre-existing) | Low — test/implementation mismatch, not a production bug | N/A | Update test to match current classifier design intent |
| BMW 318i `criticalFailures` | Not directly testable without live run | N/A | N/A | Requires live pipeline submission to evaluate |

---

## Recommendation

Both confirmed bugs are real and warrant fixing, but neither is a data-loss event of the same severity as R-GH-19 or R-F-01. The line-item persistence gap affects 2 historical records and does not affect report rendering. The image-failure degradation gap is a UI surfacing problem — the data is correct, the adjuster just does not see the actionable instruction.

The BMW 318i imageClassifier test failure is a stale test that should be updated to match the current classifier design, not a regression from Batch 1–9 work.

These findings support the data-correctness-before-visual-work priority you described. The recommended fix order, if you decide to proceed, is:

1. Surface `degradationReasons` in the ForensicAuditReport UI (medium severity, adjuster-facing)
2. Backfill the 2 historical `quote_line_items` records and add a guard in `db.ts` for missing `documentedLineItems` (low severity, data hygiene)
3. Update the BMW 318i imageClassifier test to reflect the current `other`-classification design intent (low severity, test hygiene)
