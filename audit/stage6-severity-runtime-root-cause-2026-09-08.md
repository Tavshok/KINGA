# Stage 6 Severity Runtime Root Cause — 2026-09-08

## Confirmed runtime evidence

Current server logs show repeated Stage 6 failures on 2026-09-08: `ReferenceError: calculateOverallSeverity is not defined`. The affected stage catches the error, emits a degraded fallback, and does not halt the pipeline; nevertheless, it loses the intended Stage 6 damage-analysis result.

## Root cause

Commit `f4c9174c` split the original Stage 6 module. The pure helpers `normaliseSeverity`, `inferZone`, and `calculateOverallSeverity` moved into `stage-6-damage-analysis.vision.ts` as private functions. The PDF-direct reader also became private. The coordinator retained calls to all four functions but imported only `readDamageFromPhotos`, leaving each affected path unbound at runtime. Existing helper tests duplicated their logic locally, so they did not execute the production exports or the coordinator path.

## Bounded correction

The repair moves the three shared pure helpers into a dedicated Stage 6 helper module, imports them explicitly into both the coordinator and the vision concern, and replaces the duplicate helper-test implementations with imports from production code. It also exports and imports the PDF-direct reader explicitly. Coordinator regressions execute a structured-damage, no-photo path and a mocked PDF-direct path, proving severity normalisation, zone calculation, aggregate scoring, and the PDF bridge complete without invoking external services or changing claim records.
