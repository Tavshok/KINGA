# CI Test-Isolation Remediation: Global `fetch` Stubs

**Date:** 18 September 2026
**Package:** CI-ISO-01
**Branch:** `fix/ci-global-fetch-isolation`
**Scope:** Test-only correction for leaked global `fetch` stubs. No application runtime, database, schema, authentication, WhatsApp provider, configuration, or deployment behavior changes.

## Root Cause

Vitest executes the repository in a single fork. `vi.stubGlobal("fetch", ...)` mutates the process-wide `fetch` function, but the existing `vi.restoreAllMocks()` calls do not restore globals installed through `stubGlobal()`.

The initial package corrected two suites. Integrated validation then identified a third, independent direct assignment:

| Test suite                                       | Existing behavior                                                  | Effect on later tests                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `server/vehicle-structural-intelligence.test.ts` | Stubs NHTSA `fetch` in individual tests and profile-builder setup. | Later loopback HTTP tests receive a vehicle mock instead of a real `Response`.                 |
| `server/services/photoEnrichment.test.ts`        | Installed one `fetch` stub at module load for all photo tests.     | The stub survived after the file and could return an incomplete response value to later tests. |
| `server/pdf-image-extractor.test.ts`             | Directly assigned `global.fetch` for image acquisition fixtures.   | The direct assignment bypassed Vitest mock restoration and contaminated later local HTTP tests. |

This caused the signed WhatsApp, maintenance-mode, and runtime-probe tests to fail in the full suite with `response` undefined while their isolated tests passed. It did **not** show a runtime fault in the WhatsApp signature boundary or the maintenance gate.

## Correction

The package makes the smallest safe test-only change:

1. The vehicle suite calls `vi.unstubAllGlobals()` after every test.
2. The photo suite creates its `fetch` mock in `beforeEach` and calls `vi.unstubAllGlobals()` in `afterEach`.
3. The PDF image-extractor suite captures the original `fetch` implementation and restores it in `afterEach`.

Each test retains the fixture it needs, and every subsequent test starts with the platform `fetch` implementation restored.

## Verification

| Command class                                                                                    |                                Result |
| ------------------------------------------------------------------------------------------------ | ------------------------------------: |
| Signed WhatsApp boundary alone                                                                   |                **15/15 tests passed** |
| Maintenance middleware, stack, production stack, and runtime probes alone                        |                  **9/9 tests passed** |
| Formerly failing shared-process sequence: PDF extractor → signed WhatsApp → maintenance/probes   | **34/34 tests passed across 6 files** |
| Diff whitespace guard                                                                            |                                Passed |

The final ordered reproduction includes the newly confirmed PDF mutator before every formerly affected HTTP suite. It therefore directly proves that the corrected cleanup prevents the specific observed contamination.

## Scope Guard

The executable change is limited to three test files; this evidence record is the only other branch file. The package contains no production implementation change. The remaining full-suite failures are deliberately untouched and separately classified.
