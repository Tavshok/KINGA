# P0 follow-up package proposals

**Date:** 22 September 2026
**Status:** Proposal only. No source implementation, schema/data change, migration, environment change, deployment, or external operation is authorised by this document.
**Predecessor:** PR #142, **P0-A: enforce quantitative evidence boundaries**, merged at `a18d692d` on 22 September 2026.

## Recommendation

P0-A correctly prevents current VGE, VGR, and raw Stage 6 crush-depth evidence from governing collision physics, causal reasoning, Physics Truth, or the Stage 10 physics report. The next work should remain **consumer-gating work**, but it should be split into bounded packages rather than attempting one broad change across fraud, decision authority, cost, valuation, learning, and reference data.

The first implementation candidate is **P0-B1: fraud and automated-decision consumer gates**. It closes the active path from unqualified visual/physics-derived values to fraud score, claim disposition, repairer selection, and fast-track routing. It is a data-integrity-critical package and therefore requires the established adversarial review process.

The separately requested **P0-A-NB2: visible quantitative abstention marker** is smaller and should precede or run independently of P0-B1. It addresses presentation truthfulness only. It must make the reason for withheld physics visible in the report and output rather than relying on internal logs or an easily overlooked degraded-status field.

Cost/valuation and learning/reference consumer work should remain planned as later P0 packages. They are materially larger and have different owner decisions. They should not be bundled into P0-B1.

## P0-A-NB2 — visible quantitative abstention marker

### Objective

When a report is downgraded from a quantitative collision-physics assessment to advisory-only or unavailable status, publish a **prominent, structured, actionable marker**. The marker must explain that the limitation is evidence eligibility, not a numerical zero or a benign result. It must also identify the next required evidence.

The current Stage 10 implementation already produces a review-required physics section and a degradation-reason string when geometry is insufficient. Those values are persisted and available to some consumers, but they do not provide a single stable, report-level indicator that is guaranteed to be visible in every rendered output. [1] [2]

### Proposed contract

Add a non-numeric report/output object, tentatively named `quantitativeAssessmentStatus`, with these fields:

| Field              | Proposed value under P0-A no-go                                                                                                     | Purpose                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `status`           | `PHYSICS_WITHHELD`                                                                                                                  | A machine-readable state distinct from pass, failure, or zero impact.        |
| `reasonCode`       | The canonical P0 disposition/reason, such as advisory visual geometry pending P1 qualification                                      | Supports stable display and API handling.                                    |
| `scope`            | `COLLISION_PHYSICS_AND_CAUSAL_OUTPUTS`                                                                                              | Names exactly what has been withheld.                                        |
| `effect`           | No governing force, energy, speed, delta-V, causal verdict, or physics-driven fraud conclusion was produced                         | Prevents a reader from treating blank or null fields as a favourable result. |
| `requiredEvidence` | Qualified P1 visual measurement, documented inspection measurement, EDR/telematics, or other future owner-approved governing source | Gives the adjuster an actionable next step.                                  |
| `reviewRequired`   | `true`                                                                                                                              | Makes the hold explicit at every presentation boundary.                      |

The marker must appear in three places: the structured Stage 10 output, the persisted/report-model projection, and the rendered report or decision UI. It must use plain language equivalent to:

> **Collision physics was withheld.** Current visual geometry is descriptive evidence only under P0 and was not used to calculate speed, force, energy, delta-V, causation, or physics-driven fraud. Obtain qualified measurement or documentary reconstruction evidence before relying on collision physics.

### Likely implementation surface

The initial trace identifies these likely files: `server/pipeline-v2/types.ts`, `server/pipeline-v2/stage-10-report.ts`, `server/db.ts`, `server/kingaReportGenerator.ts`, the active report/decision presentation component or model, and focused Stage 10 and renderer tests. The implementation must also inspect the legacy report and PDF export paths before changing them, so a marker cannot appear in one rendering while an older output remains silent. [1] [3]

### Boundaries

This package does **not** alter P0-A eligibility, introduce a governing visual measurement, change a fraud score, change a decision/readiness threshold, change API permissions, create a schema or migration, or rebuild report layout. It only makes an existing withheld result explicit and actionable.

### Estimate and review

The expected effort is **1.5–2.5 engineering days**: source-to-sink confirmation, typed marker/projection, report/UI rendering, focused regressions, and one independent review. The review may remain one pass because this package changes explanation and presentation rather than a quantitative authority rule. If discovery identifies a presentation path that can convert the marker into a decision state, the package must stop and receive data-integrity review treatment.

### Acceptance criteria

1. An advisory, unavailable, missing, forged, or stale P0 crush decision always produces the visible marker in every active Stage 10 report projection.
2. The marker names the withheld outputs and the evidence needed to proceed.
3. Neither a null numerical field nor a `reviewRequired` boolean alone is treated as sufficient presentation.
4. A non-collision/not-applicable case is not falsely labelled as a collision-physics failure.
5. Existing P0-A numerical and causal suppression tests remain green through the prescribed isolated test runner.

## P0-B1 — fraud and automated-decision consumer gates

### Objective

Prevent raw Stage 6 visual numerics, advisory visual evidence, ungoverned collision derivatives, and numeric fallbacks from becoming a fraud score, a fraud-based adverse disposition, a repairer-disqualification input, or an automated fast-track decision.

This package does not rebuild fraud detection. It only ensures that an input must carry an eligible P0 disposition before it can affect an automated fraud or claim-decision outcome.

### Active risk path

The source trace found several active paths where current P0-A no-go values can still be converted into score-bearing or decision-bearing output:

| Source class                                     | Current consumer risk                                                                                                                 | P0-B1 treatment                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Stage 7 collision quantities and derivatives     | Cross-engine conflicts, severity/physics mismatch, speed-forensics, and damage-consistency signals can enter Stage 8 fraud scoring    | Withhold those indicators under P0 no-go; preserve only a non-score review marker.                                                    |
| Raw Stage 6 severity and panel-fraction numerics | Stage 8 and contact-patch logic can treat them as observed quantitative damage                                                        | Make the numeric consumer unavailable; do not replace it with zero.                                                                   |
| Vision-based photo-forensic probabilities        | Manipulation and AI-generation estimates can become fraud-score points                                                                | Preserve descriptive provenance, but prohibit score-bearing or disposition-bearing use until separately qualified.                    |
| Fraud fallback values                            | A display fallback such as `50`/`moderate` can reach a threshold consumer                                                             | Mark it unavailable for every automated consumer; it cannot become a review, rejection, disqualification, or routing threshold input. |
| Fraud score/level at decision sinks              | Claim Truth, Stage 12, DOE, database fast-track, and repairer routing can treat absent or advisory risk as a usable score or low risk | Require explicit governing fraud-decision evidence; otherwise hold the automated action and require manual review.                    |

### Proposed design

P0-B1 adds a narrow, reusable **fraud-consumer eligibility result** beside the existing P0-A contract. It rebinds the P0 source snapshot at the consumer boundary and returns only a disposition and canonical reason. It must not contain an advisory number and cannot create a `GOVERNING` visual-physics path.

Stage 8 would classify each indicator before weighting. Under a non-governing P0 collision decision, it would not add or weight physics-derived mismatch, pattern, speed, photo-forensic, cross-engine, or contact-patch inputs. Instead, it would emit a non-score marker such as `P0_FRAUD_EVIDENCE_UNAVAILABLE` with a manual-review instruction.

Every current automated sink would require explicit fraud decision eligibility. Claim Truth and Stage 12 could not issue an escalation, rejection, or review solely because of an advisory/unavailable score. DOE could not silently default unavailable fraud risk to low. Fast-track would force `MANUAL_REVIEW` and would not dispatch an automated action when fraud evidence is unavailable or advisory.

### Scope and exclusions

Likely affected modules are `stage-8-fraud.ts`, `crossEngineConsistencyValidator.ts`, `contactPatchRatioEngine.ts`, `photoForensicsEngine.ts`, `engineFallback.ts`, `claimTruthLayer.ts`, `claimsDecisionAuthority.ts`, `stage-9-cost.ts`, `db.ts`, `fast-track-engine.ts`, and the shared quantitative-governance module. Tests would cover the shared gate, Stage 8, consistency validation, contact-patch calculation, photo forensics, fallback, claim truth, decision authority, DOE, and fast-track routing. [4]

`stage-9-5-cgi.ts` produces fraud-looking fields but has no active current runtime consumer path into Stage 8 or a decision sink. P0-B1 should retain a no-consumer regression assertion but must not rebuild CGI logic in this package.

This package excludes fraud-model calibration, new photo-forensic tooling, P1 visual qualification, P2 collision reconstruction, assessment of categorical/documentary evidence beyond the owner decision below, and any schema, migration, staging, production, or deployment action.

### Owner decisions required before implementation

1. **Photo-forensic numeric policy.** Recommended: treat current vision-model manipulation and AI-generation numeric estimates as advisory only for automated fraud purposes; retain EXIF, hash, and date provenance for manual review.
2. **Qualitative visual evidence.** Recommended: preserve genuinely qualitative/documentary evidence, such as a claim statement or externally verified metadata, while withholding only raw visual numeric and physics-derived fraud inputs. If all model-extracted visual evidence must be withheld, the package grows to include additional pattern checks.
3. **Fallback compatibility.** Recommended: retain legacy fallback presentation only when labelled unavailable, while making every automated sink fail closed. This avoids broader API/UI compatibility work while preventing threshold use.

### Estimate and review

The expected effort is **7–10 engineering days**: 3–5 days for Stage 8 and fraud-source gating, 3–4 days for downstream decision/fast-track gates and focused regressions, plus integration evidence. This is **data-integrity-critical** because it changes fraud and claim-disposition authority. It therefore requires adversarial independent review, including a second review round if the first review finds a live bypass.

### Acceptance criteria

1. Advisory, unavailable, stale, missing, or forged Stage 7 evidence cannot change a fraud score, level, or a score-derived decision.
2. Raw Stage 6 severity/fraction values and vision-based photo-forensic probabilities remain descriptive but cannot create score points.
3. Fraud fallback scores cannot cross Claim Truth, Stage 12, DOE, or fast-track thresholds.
4. No decision path defaults unavailable fraud to low risk or an automatic action.
5. Independently supported non-physics/documentary fraud evidence remains available only to the extent authorised by the owner decision.
6. Every blocked action returns a clear manual-review reason; it does not imply fraud from missing eligibility.

## Sequenced later P0 packages

P0-B1 should be followed by two separate packages, each requiring its own proposal and owner approval.

| Package                                                | Purpose                                                                                                                                                                                                            |               Estimate | Why it remains separate                                                                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0-B2 — cost and valuation consumer gates**          | Withhold generated quote optimisation, benchmark, CGI, repairability, total-loss, settlement, and valuation conclusions when their effective inputs are visual-advisory, unqualified, fallback, or default values. |   5–7 engineering days | It requires an owner decision on which document/ledger/assessor sources can ever be positive financial authority.                                                                               |
| **P0-B3 — learning and reference-data consumer gates** | Prevent visual, fallback, proxy, and unqualified result values from entering cost learning, fraud learning, calibration feedback, benchmark data, historical reference data, or truth-synthesis writes.            | 11–15 engineering days | It needs explicit allowlists for verified quote, human decision, settlement, and fraud-adjudication provenance. It also touches fire-and-forget writers and has a larger contamination surface. |

## Deferred P0-A review notes

The owner directed that P0-A review labels **NB-1, NB-3, and NB-4** remain tracked but receive no action now. The retained PR/review artefact does not contain standalone text for those historical labels, so they are recorded in the active backlog as label-preserving references to PR #142 rather than being reconstructed or expanded without an authoritative description. **NB-2** is superseded by the explicit P0-A-NB2 proposal above.

## References

[1]: file:///home/ubuntu/kinga-p0-evidence-contract-core/server/pipeline-v2/stage-10-report.ts "Stage 10 report projection and degradation reasons"
[2]: file:///home/ubuntu/kinga-p0-evidence-contract-core/server/pipeline-v2/types.ts "Stage 10 output contract"
[3]: file:///home/ubuntu/kinga-p0-evidence-contract-core/server/kingaReportGenerator.ts "Server report renderer"
[4]: file:///home/ubuntu/kinga-engine-research/quantitative-engine-llm-substitution-audit-2026-09-21.md "KINGA quantitative-engine LLM-substitution audit, 21 September 2026"
