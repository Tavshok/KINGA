# R2 PDF-Direct Operational Acceptance Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Approval required before execution

## Purpose

Validate the completed R2 PDF-direct image-evidence behavior through a current-code runtime path: contextual PDF-derived damage evidence remains visible, unsupported numeric physics is excluded, and the three reports disclose the evidence boundary.

## Constraint Identified

The available pipeline runners call `triggerAiAssessment(claimId)`. They persist assessment state and can update an existing claim. They are therefore **not suitable** for a no-side-effect acceptance run against a live claim.

## Controlled Options

| Option | Data effect | Acceptance value | Recommendation |
|---|---|---|---|
| A. Add an explicit dry-run Stage 6/7/report harness using a source PDF and transient in-memory output | No claim, quote, assessment, report job, or decision persistence | Verifies current-code PDF-direct envelopes, Stage 7 numeric exclusion, and CL/CI/FR report fragments | Preferred |
| B. Run an isolated synthetic claim through the normal pipeline | Creates isolated test records and external model execution | Verifies full persistence and rendering lifecycle | Only with explicit approval and an isolated tenant/test fixture |
| C. Re-run an existing claim | Alters a live historic assessment and possibly downstream report state | Highest operational similarity but unacceptable side-effect risk | Not proposed |

## Scope for Option A

The harness would call the relevant Stage 6 and Stage 7 code with a fixed, source-backed PDF-direct fixture and a non-persistent repository/context adapter. It would assert:

1. PDF-direct targeted and single-pass fallback evidence emit source page, classifier, fallback/selection reason, and crush-depth eligibility.
2. Contextual-only components retain damage-analysis fields but no numeric crush-depth, deformation-energy, or displacement values.
3. Stage 7 receives no numeric vision crush-depth from contextual-only inputs.
4. Shared CL, CI, and FR photo-panel fragments show the qualified/non-physics disclosure.

No customer or insurer data would be inserted, updated, or deleted. No claim workflow, quote, payment, settlement, or report-job state would be changed.

## Acceptance Criteria

The implementation is accepted operationally only if the harness records each assertion, uses no database writes, and passes alongside the R2 focused regression suite and production builds.
