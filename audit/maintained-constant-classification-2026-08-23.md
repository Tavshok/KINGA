# Maintained Constant Inventory Classification — 2026-08-23

## Scope

This note tracks the narrowed maintainability batch approved for the preserved `scripts/magic-numbers-raw.json` inventory only. The recorded scan contains **92 candidate lines**. A context-aware comparison of the final branch diff against that inventory confirmed every source replacement recorded below.

## Current classification status

| Category | Count | Notes |
|---|---:|---|
| Recorded candidate lines in maintained inventory | 92 | Source: `scripts/magic-numbers-raw.json` |
| Executable references extracted into named constants | 45 | Context-aware diff matcher confirmed each replacement against the maintained inventory; no effective-value change |
| Excluded from this batch | 47 | Already named, prompt/example text, stale scan location, low-level guard, or a deliberately deferred grouped request-budget value |
| Unresolved candidate lines | 0 | All 92 maintained candidates now have a documented outcome |

## Reviewed exclusions so far

| File group | Inventory status | Classification | Rationale |
|---|---|---|---|
| `server/pipeline-v2/stage-2-extraction.ts` line 76 (`300`) | Current | Exclude from extraction | Already named as `MIN_TEXT_LENGTH_CHARS` in live source |
| `server/pipeline-v2/stage-2-extraction.ts` line 77 (`40`) | Current | Exclude from extraction | Embedded in a confidence/flags example block, not a standalone unnamed threshold declaration |
| `server/pipeline-v2/stage-2-extraction.ts` line 107 (`32`) | Current | Exclude from extraction for now | Low-level codepoint guard inside garbled-text detection; keep for a later, file-focused pass rather than mixing semantic and byte-level thresholds |
| `server/pipeline-v2/stage-2-extraction.ts` lines 151/395/613 (`16384`) | Current | Exclude from this batch for now | LLM request budget values repeated across extraction paths; should be normalised together in a dedicated request-budget pass |
| `server/pipeline-v2/stage-3-structured-extraction.ts` lines 67/80/132 (`2024`, `59133`, `3166`) | Current | Exclude from extraction | These are prompt/example literals in schema descriptions, not executable runtime thresholds |
| `server/pipeline-v2/stage-3-structured-extraction.ts` line 573 (`20`) | Current | Extracted | Named as `MIN_GARBLED_TEXT_CHARS` with no change to the existing comparison |
| `server/pipeline-v2/costDecisionEngine.ts` lines 175/177/798 (`20`, `30`, `80`) | Current | Exclude from extraction | Live source already names its negotiation, review, and anomaly thresholds in the constants block |
| `server/pipeline-v2/photoForensicsEngine.ts` line 372 (`120`) | Current | Exclude from extraction | Numeric image-analysis examples inside an LLM prompt, not an executable threshold |
| `server/pipeline-v2/evidenceStrengthScorer.ts` lines 144/148 (`0.36`, `0.18`) | Current | Exclude from extraction | Live source already names both assumption penalty caps as exported constants |
| `server/pipeline-v2/scenarioFraudEngine.ts` lines 53/54/101/604/614/810 (`48`, `90`) | Current | Exclude from extraction | Values appear only in comments and flag narratives; the actual `recently_purchased` condition is supplied by enrichment rather than a runtime day-count comparison in this module |
| `server/pipeline-v2/stage-8-fraud.ts` line 891 (`15`) | Stale | Exclude from extraction | The current source location is a photo-forensics object-property mapping, not a numeric threshold |
| `server/pipeline-v2/stage-5-assembly.ts` line 483 (`2020`) | Stale | Exclude from extraction | The current source location is a third-party record mapping, not a numeric threshold |
| `server/pipeline-v2/speedInferenceEnsemble.ts` line 745 (`60`) | Stale | Exclude from extraction | The current source vicinity is weighted-consensus computation with no numeric threshold; the scan’s original match no longer applies |
| `server/pipeline-v2/orchestrator.ts` line 2401 (`30`) | Stale | Exclude from extraction | The current source location is a Truth Reconciliation Engine comment, not a numeric threshold |

## Reviewed extractions already preserved on branch

| File group | Extracted references |
|---|---|
| `server/pdf-image-extractor.ts` | 5 |
| `server/pipeline-v2/stage-3-structured-extraction.ts` | 1 |
| `server/pipeline-v2/quoteExtractionEngine.ts` | 1 |
| `server/pipeline-v2/imageClassifier.ts` | 12 |
| `server/pipeline-v2/stage-6-damage-analysis.ts` | 2 |
| `server/pipeline-v2/scenarioFraudEngine.ts` | 3 |
| `server/pipeline-v2/fraudPatternLearningEngine.ts` | 1 |
| `server/pipeline-v2/quoteOptimisationEngine.ts` | 4 |
| `server/pipeline-v2/decisionReadinessEngine.ts` | 3 |
| `server/pipeline-v2/forensicCDI.ts` | 3 |
| `server/pipeline-v2/orchestrator.ts` | 6 |
| `server/pipeline-v2/stage-4-validation.ts` | 1 |
| `server/pipeline-v2/incidentClassificationEngine.ts` | 1 |
| `server/pipeline-v2/fieldValidationEngine.ts` | 1 |
| `server/pipeline-v2/extractionQualityScorer.ts` | 1 |

## Working conclusion

The maintained scan is **meaningfully smaller than the earlier 170-item figure**: the committed source of truth contains only 92 lines. Of those, **45** were executable references safely extracted into named constants and **47** were excluded with recorded rationale. No maintained candidate was skipped or left unresolved.
