# VGE Known-Dimension Integrity Correction

**Status:** Source implementation prepared for independent review  
**Date:** 21 September 2026  
**Scope:** Stage 6.5A VGE, Stage 6.5B VGR, the Stage 7 calibrated-geometry admission boundary, Physics Truth provenance, CGI hand-off, and the immediately affected report/API status presentation.

## Purpose and approved boundary

This narrowly approved correction restores the intended known-dimension path. An LLM may nominate a reference object, identify its pixel span, and identify visual context. It cannot supply the physical dimension used to derive scale. The server binds an allowed nominated reference type to exactly one stored vehicle-geometry measurement and then applies the existing deterministic calibration contract.

The correction also closes the confirmed Stage 7 bypass. When no **MEDIUM** or **HIGH** VGE/VGR calibrated crush measurement is available, collision physics now returns a review-required, null-valued result rather than deriving governing force, energy, speed, or crush from raw Stage 6 visual output. It does not begin P0, create new persistence, alter historical data, enrich vehicle profiles, or qualify LLM pixel observations as decision-grade photogrammetry.

## Corrected behavior

| Concern                     | Corrected behavior                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Physical scale authority    | `physicalMeasurementMm` from the LLM response is ignored. The server resolves the nominated type through `PROFILE_REFERENCE_BINDINGS` and uses only a stored profile measurement.                                                                                                                                                                                      |
| Ambiguous profile data      | A candidate is rejected unless the make/model/year resolves to exactly one profile and its type resolves to exactly one positive stored measurement. A duplicate primary measurement invalidates the type even if an alternate value exists.                                                                                                                           |
| Plate reference orientation | The `licence_plate` prompt contract requires a width span and binds only `licence_plate_width_mm`. Height is not a substitute reference.                                                                                                                                                                                                                               |
| Prompt clarity              | Prompt-advertised profile dimensions now match the actual binding allow-list, preventing the vision model from nominating seeded but unsupported scale dimensions.                                                                                                                                                                                                     |
| Cross-reference calibration | The existing `deformationCalibration.ts` contract receives server-bound references and requires two independent, undamaged references whose scale factors agree within the configured tolerance. Disagreement remains a human-review outcome.                                                                                                                          |
| VGR reconciliation          | VGR requires at least two qualified calibrated images before it reports cross-image consensus.                                                                                                                                                                                                                                                                         |
| Stage 7 governing geometry  | VGR has priority over VGE only when its consensus is qualified. Absent qualified geometry returns `SKIPPED_INSUFFICIENT_GEOMETRY`, with null force, energy, speed, delta-V, and deceleration. A qualified-geometry engine failure returns the equally null-valued `SKIPPED_ENGINE_FAILURE`; it never emits generic numeric fallback values.                            |
| Raw Stage 6 fallback        | Raw component crush, structural displacement, deformation energy, severity-derived crush, and document crush are not passed into the Stage 7 speed ensemble as calibrated crush inputs.                                                                                                                                                                                |
| Resume and exception safety | Unversioned `7_unified` cache entries are discarded and rerun under the current gate. A unified-stage timeout or exception returns a null-valued review result whether geometry is absent or the qualified-geometry engine itself failed.                                                                                                                              |
| Physics Truth               | An uncalibrated Stage 6 LLM crush estimate, and any LOW/NONE or unavailable VGE/VGR value, cannot become canonical crush or contribute evidence-quality credit, including calibrated-photo score uplift.                                                                                                                                                               |
| CGI hand-off                | Stage 9.5 receives the populated `ctx.vgeReconciliationResult`, not the nonexistent `vgrConsensusResult` alias.                                                                                                                                                                                                                                                        |
| User-facing result          | The report and orchestration intervention summary state whether calibrated geometry is missing or physics failed without a numerical fallback. CGI returns an explicit `UNAVAILABLE` verdict and does not create a geometry conclusion, fraud flag, or hidden-damage override. Stage 10-I preserves that state rather than describing it as coherent or fully covered. |

## Fail-closed consequence

A collision claim with insufficient calibrated geometry now requires review. This is an intentional coverage reduction: the system must not create a confident-looking numerical reconstruction from an LLM-generated physical measurement. The raw Stage 6 visual observations remain available as descriptive evidence and for later human review, but they do not satisfy this package's physics-admission rule.

A direct claim-document measurement is not silently reclassified by this correction. The only new Stage 7 admission rule is the qualified VGE/VGR calibration path. P0 remains the separately gated programme that must define the shared, durable eligibility and provenance policy for all quantitative sources.

## Verification evidence

The guarded isolated quantitative regression matrix passed **288 tests in 16 files**. It includes the existing calibration, numerical-contract, physics-vector, ensemble, and interpretation suites as well as the added integrity tests. The behavior coverage proves that deliberately tempting raw Stage 6 crush, structural displacement, deformation energy, high severity, and document crush values cannot produce a governing physics result without qualified VGE/VGR geometry; it exercises the standard, parking-lot, qualified and unqualified unified-exception/timeout, the internal thrown `analyzeAccidentPhysics` path, and cache-resume boundaries. It also proves that duplicated measurement rows cannot be masked by an alternate fitment; LOW/unavailable geometry cannot enter Physics Truth or CGI; CGI unavailable state is not presented as coherent or complete by Stage 10-I; and the full Stage 10 report is degraded and review-required, while a qualified VGR consensus reaches deterministic collision physics.

The TypeScript baseline remains inherited debt: the worktree reports **1,000 diagnostics** and current `main` reports **1,002**. The two diagnostics in touched `orchestrator.ts` are the pre-existing `string | undefined` errors at lines 2022 and 2547; no new changed-path diagnostic remains. `git diff --check` passes. The source files fail `prettier --check` on both this worktree and current `main`, so no large-file formatter rewrite was applied. Every newly added test and this record pass Prettier.

## Review gate before a PR

This is a quantitative data-integrity change. The required independent review must confirm all of the following before a pull request is opened:

- An LLM-provided physical dimension cannot affect vehicle scale.
- A valid calibration requires two independent undamaged stored-dimension references.
- A single qualifying VGE image cannot be represented as VGR consensus.
- No raw Stage 6 crush path reaches Stage 7 legacy physics, the speed ensemble, a recomputation, a parking branch, an error fallback, a cache resume, or Physics Truth. A qualified-geometry outer failure must remain null-valued rather than receive a generic numeric fallback.
- The CGI VGR input comes from `vgeReconciliationResult`.
- The review-required outcome is visible to report, CGI, and Stage 10-I consumers without being reclassified as coherent or complete.

The repository-wide guarded suite is reserved for genuine merge readiness after the independent reviewer approves the corrected boundary. No PR has been opened, and no source or configuration has been deployed.

## References

[1]: file:///home/ubuntu/upload/pasted_content.txt "Owner approval: VGE/VGR known-dimension integrity correction, 21 September 2026"
[2]: file:///home/ubuntu/kinga-engine-research/vge-known-dimension-scaling-investigation-2026-09-21.md "KINGA VGE known-dimension scaling investigation, 21 September 2026"
[3]: file:///home/ubuntu/kinga-engine-research/P0-and-VGE-scope-estimates-2026-09-21.md "KINGA P0 and VGE scope estimates, 21 September 2026"
