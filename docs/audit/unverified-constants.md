# KINGA AutoVerify AI — Unverified Calibration Constants

**Document type:** Maintenance handoff  
**Produced by:** Batch 9a — Magic Number Extraction (Remediation Track)  
**Date:** 2026-07-10  
**Status:** Living document — update whenever a constant is data-verified or changed

---

## Purpose

This document lists every numeric constant in the KINGA pipeline that was tagged with a
`// CALIBRATION: origin unknown, do not change without benchmarking` comment during the
Batch 9a readability pass. These values were introduced as engineering-judgment estimates
at some point in the system's development and have **not** been validated against a labelled
dataset or a formal calibration study.

The distinction matters for the same reason it mattered for the `LABOUR_RATES` estimates
and the original R-E-02 cost-cap analysis: a value that looks reasonable can be quietly
wrong at the tails, and the only way to know is to trace its origin. If you are changing
any constant in this list, **benchmark first and document the result here**.

---

## How to Read This Table

| Column | Meaning |
|---|---|
| **Constant name** | The named constant as it appears in the source file after Batch 9a extraction |
| **Current value** | The numeric value at time of this document's creation |
| **File** | Source file path relative to project root |
| **Role** | What the constant controls in the pipeline |
| **Origin status** | `UNVERIFIED` = no calibration study found; `DATA-GROUNDED` = calibration document exists; `PHYSICAL` = fixed physical/mathematical constant |

---

## Unverified Constants (require benchmarking before change)

### Image Intelligence (`server/pipeline-v2/imageIntelligence.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| `HIGH_CONFIDENCE_THRESHOLD` | `0.75` | Damage likelihood score above which an image is classified HIGH-confidence without LLM review | UNVERIFIED |
| `LOW_CONFIDENCE_THRESHOLD` | `0.40` | Damage likelihood score below which an image is classified LOW-confidence (document) | UNVERIFIED |
| `BLUR_SCORE_NORMALISER` | `1000` | Laplacian variance divisor for blur score normalisation (0–1) | UNVERIFIED |
| `WHITE_BG_BRIGHTNESS_THRESHOLD` | `180` | Mean brightness above which a page is considered white-background | UNVERIFIED |
| `WHITE_BG_COLOUR_THRESHOLD` | `0.25` | Colour variance below which a page is considered low-colour (text document) | UNVERIFIED |
| `DOCUMENT_OVERRIDE_BRIGHTNESS` | `220` | Brightness above which a very-white image is hard-overridden to "document" class | UNVERIFIED |
| `DOCUMENT_OVERRIDE_COLOUR` | `0.15` | Colour variance below which a very-white image is hard-overridden to "document" class | UNVERIFIED |
| `DARK_RESCUE_BRIGHTNESS_THRESHOLD` | `80` | Brightness below which an image is considered "dark" for the R-B-03b night-photo rescue path | UNVERIFIED |
| `DARK_RESCUE_COLOUR_THRESHOLD` | `0.05` | Colour variance above which a dark image is rescued to the LLM ambiguous pool | UNVERIFIED |
| `DEDUP_HAMMING_THRESHOLD` | `8` | Maximum Hamming distance (bits out of 64) for two images to be considered near-duplicates | UNVERIFIED |
| Scoring weights: `colourWeight`, `edgeWeight`, `textPenalty`, `blurWeight`, `aspectWeight` | `0.35 / 0.25 / 0.20 / 0.15 / 0.05` | Weighted formula for `scoreDamageLikelihood` — determines which image features most influence the damage classification | UNVERIFIED |

**Benchmarking note:** All `imageIntelligence.ts` thresholds were tuned for the KINGA dataset of South African motor insurance claims. A labelled image dataset of at least 500 images (damage photos vs. documents vs. quotations) is required to validate or adjust these values.

---

### Image Classifier (`server/pipeline-v2/imageClassifier.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| `HIGH_CONFIDENCE_THRESHOLD` | `0.75` | Heuristic score above which classification is HIGH-confidence | UNVERIFIED |
| `LOW_CONFIDENCE_THRESHOLD` | `0.40` | Heuristic score below which classification is LOW-confidence | UNVERIFIED |
| `DOCUMENT_OVERRIDE_BRIGHTNESS` | `220` | Hard-override brightness for document classification | UNVERIFIED |
| `DOCUMENT_OVERRIDE_COLOUR` | `0.15` | Hard-override colour variance for document classification | UNVERIFIED |
| Scoring weights (damage likelihood formula) | Various | See file for full weight table | UNVERIFIED |

---

### Speed Inference Ensemble (`server/pipeline-v2/speedInferenceEnsemble.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| `DIVERGENCE_THRESHOLD_PCT` | `40` | Percentage spread above which ensemble estimates are considered divergent | UNVERIFIED |
| `FMVSS_CONFIDENCE_WEIGHT` | `0.70` | Weight given to FMVSS-derived speed estimate in the ensemble | UNVERIFIED |
| Campbell equation stiffness multipliers | Various | Per-direction stiffness multipliers in the Campbell speed formula | UNVERIFIED |

**Benchmarking note:** The Campbell equation parameters are derived from published crash-test literature but the specific multiplier values used here have not been validated against a KINGA-specific crash dataset. The FMVSS weight was set by engineering judgment.

---

### Claim Quality Scorer (`server/pipeline-v2/claimQualityScorer.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| Grade band thresholds (A/B/C/D/F) | Various | Score thresholds for claim quality grade assignment | UNVERIFIED |
| Section weight coefficients | Various | Per-section weights in the overall quality score formula | UNVERIFIED |

---

### Evidence Strength Scorer (`server/pipeline-v2/evidenceStrengthScorer.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| `ENGINE_WEIGHTS` (all 10 entries) | Various | Per-engine weights in the overall evidence strength formula | UNVERIFIED |
| Per-scorer increment values (`DAMAGE_SCORER_WEIGHTS`, `PHYSICS_SCORER_WEIGHTS`, etc.) | Various | Score increments within each sub-scorer | UNVERIFIED |

**Benchmarking note:** The ENGINE_WEIGHTS block is the single highest-risk unverified constant group in the system. A miscalibrated weight can silently shift the overall evidence strength score for every claim. Validation requires a labelled dataset of at least 200 claims with known ground-truth evidence quality.

---

### Severity Consensus Engine (`server/pipeline-v2/severityConsensusEngine.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| `DAMAGE_SCORE_MINOR_THRESHOLD` | `25` | Damage score below which severity maps to "minor" | UNVERIFIED |
| `DAMAGE_SCORE_MODERATE_THRESHOLD` | `55` | Damage score below which severity maps to "moderate" (else "severe") | UNVERIFIED |
| `CONF_BASE_FULL` | `92` | Base confidence for FULL source alignment | UNVERIFIED |
| `CONF_BASE_PARTIAL` | `72` | Base confidence for PARTIAL source alignment | UNVERIFIED |
| `CONF_BASE_CONFLICT` | `45` | Base confidence for CONFLICT source alignment | UNVERIFIED |
| `CONF_ALL_SOURCES_BONUS` | `5` | Bonus for having all 3 severity sources available | UNVERIFIED |
| `CONF_SINGLE_SOURCE_PENALTY` | `15` | Penalty for having only 1 severity source | UNVERIFIED |
| `CONF_MISSING_SOURCE_PENALTY` | `8` | Per-missing-source confidence penalty | UNVERIFIED |
| `CONF_PHYSICS_CONFIRM_BONUS` | `3` | Bonus when verdict is SEVERE and physics confirms it | UNVERIFIED |
| `CONF_PHYSICS_CONTRADICT_PENALTY` | `10` | Penalty when verdict is SEVERE but physics says minor | UNVERIFIED |

**Note:** `DAMAGE_SCORE_MINOR_THRESHOLD` and `DAMAGE_SCORE_MODERATE_THRESHOLD` must stay in sync with the corresponding bands in `crossEngineConsensus.ts`. A change to one without the other will produce inconsistent severity outputs across the pipeline.

---

### Photo Forensics Engine (`server/pipeline-v2/photoForensicsEngine.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| `EDITING_SOFTWARE_SCORE` | `0.6` | Manipulation score increment when editing software is detected in EXIF | UNVERIFIED |
| `STRIPPED_EXIF_SCORE` | `0.3` | Manipulation score increment when EXIF is stripped (< 3 fields) | UNVERIFIED |
| `FUTURE_DATE_SCORE` | `0.5` | Manipulation score increment when capture date is in the future | UNVERIFIED |
| `THUMBNAIL_ANOMALY_SCORE` | `0.25` | Manipulation score increment when thumbnail-to-image ratio is abnormal | UNVERIFIED |
| `EXIF_ERROR_SCORE` | `0.2` | Manipulation score increment when EXIF extraction fails entirely | UNVERIFIED |
| `SUSPICIOUS_THRESHOLD` | `0.4` | Cumulative manipulation score above which a photo is flagged as suspicious | UNVERIFIED |
| `MANIPULATION_COUNT_THRESHOLD` | `0.5` | Per-photo manipulation score above which a photo counts toward `manipulationCount` | UNVERIFIED |
| Fraud indicator scores: manipulation (cap 25, multiplier 12), editing software (15), future date (20), thumbnail anomaly (10), no EXIF (10), partial EXIF (5), no GPS (5) | Various | FraudIndicator score values emitted to Stage 8 | UNVERIFIED |

---

### Stage 5 — Assembly (`server/pipeline-v2/stage-5-assembly.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| `DEFAULT_VEHICLE_MASS_KG` | `1400` | Default vehicle mass used when no mass data is available | UNVERIFIED |
| Assembly confidence threshold | Various | See file | UNVERIFIED |

**Benchmarking note:** 1400 kg is a reasonable median for South African passenger vehicles but has not been validated against the KINGA vehicle fleet distribution.

---

### Stage 6 — Damage Analysis (`server/pipeline-v2/stage-6-damage-analysis.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| `CRUSH_DEPTH_FORCE_THRESHOLD_N` | `30000` | Force threshold (Newtons) for crush depth severity classification | UNVERIFIED |
| Image quality threshold | Various | See file | UNVERIFIED |

---

### Stage 7 — Physics (`server/pipeline-v2/stage-7-physics.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| `DEFORMATION_RATIO_SEVERE` | `0.28` | Deformation ratio above which damage is classified severe | UNVERIFIED |
| `DEFORMATION_RATIO_MODERATE` | `0.19` | Deformation ratio above which damage is classified moderate | UNVERIFIED |
| `DEFORMATION_RATIO_MINOR` | `0.12` | Deformation ratio above which damage is classified minor | UNVERIFIED |
| Component count threshold | Various | See file | UNVERIFIED |

---

### Stage 7b — Causal Reasoning (`server/pipeline-v2/stage-7b-causal-reasoning.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| Plausibility band thresholds | Various | Confidence bands for causal reasoning plausibility classification | UNVERIFIED |

---

### Stage 8 — Fraud (`server/pipeline-v2/stage-8-fraud.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| Completeness score thresholds | Various | See file | UNVERIFIED |
| `ACCIDENT_DATE_CROSS_CHECK_DAYS` | Various | See file | UNVERIFIED |

---

### Orchestrator (`server/pipeline-v2/orchestrator.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| `HIGH_IMPACT_ASSUMPTION_CONFIDENCE_THRESHOLD` | `30` | Assumption confidence below which it is flagged HIGH-impact for manual review | UNVERIFIED |
| `PB_NAME_OVERLAP_THRESHOLD` | `0.6` | Minimum token overlap ratio for fuzzy panel-builder name matching | UNVERIFIED |
| `CG1_CONSENSUS_BLOCK_THRESHOLD` | `40` | Consensus score below which a CONFLICTING label triggers a CG-1 decision block | UNVERIFIED |
| `CG4_CONGRUENCY_WARN_THRESHOLD` | `50` | Congruency score below which a CG-4 warning is raised | UNVERIFIED |

**Note:** `HEURISTIC_SPEED_MINOR_KMPH` (30), `HEURISTIC_SPEED_MODERATE_KMPH` (45), and `HEURISTIC_SPEED_SEVERE_KMPH` (60) are **not** listed here — they are intentional heuristic defaults assigned by Stage 3 when no speed is available, and their values are documented in the code as such.

---

### Scenario Fraud Engine (`server/pipeline-v2/scenarioFraudEngine.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| Score-to-risk-level thresholds | Various | See file | UNVERIFIED |
| Timeline gap thresholds (non-48h) | Various | See file | UNVERIFIED |
| Assessor trust scoring weights | Various | See file | UNVERIFIED |

**Note:** The 48-hour administrative gap threshold is explicitly documented in the code as an administrative policy value and is **not** listed here as unverified.

---

### Cost Decision Engine (`server/pipeline-v2/costDecisionEngine.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| Negotiation efficiency thresholds | Various | See file | UNVERIFIED |
| Decision confidence model weights | Various | See file | UNVERIFIED |

---

### Decision Readiness Engine (`server/pipeline-v2/decisionReadinessEngine.ts`)

| Constant name | Current value | Role | Origin status |
|---|---|---|---|
| Readiness score thresholds | Various | See file | UNVERIFIED |

---

## Data-Grounded Constants (verified — do not change without re-running the study)

These constants are explicitly **not** in the unverified list. They have calibration documentation.

| Constant / value | File | Calibration source |
|---|---|---|
| FSS-2026-001 fraud band thresholds (81 / 61 / 40 / 20) | `shared/fraudScoring.ts` | FSS-2026-001 Fraud Scoring Standard, Batch 4 |
| Severe cost cap (R 89,500) | `server/pipeline-v2/stage-9-cost.ts` | R-E-02 analysis: 892 claims, 99.7th percentile — see `server/pipeline-v2/R-E-02-cost-distribution-analysis.md` |
| `ECONOMIC_WRITE_OFF_THRESHOLD` (0.65) | `server/pipeline-v2/pipelineCostConstants.ts` | Insurer-agreed threshold, documented in file comment |
| `COST_TIER_TOTAL_LOSS_THRESHOLD` (0.75) | `server/pipeline-v2/pipelineCostConstants.ts` | Insurer-agreed threshold, documented in file comment |
| `CHANNEL_STD_MAX` (127) | `server/pipeline-v2/imageIntelligence.ts` | Fixed physical constant (max std dev for 8-bit channel) |

---

## Physical / Mathematical Constants (not calibration values)

These are fixed by physics or mathematics and should never be changed.

| Constant / value | File | Rationale |
|---|---|---|
| `CHANNEL_STD_MAX = 127` | `imageIntelligence.ts` | Theoretical max std dev for 8-bit colour channel |
| Laplacian kernel `[-1,-1,-1,-1,8,-1,-1,-1,-1]` | `imageIntelligence.ts` | Standard discrete Laplacian operator |
| `EDGE_RESIZE_PX = 256` | `imageIntelligence.ts` | Engineering choice (not physics), but well-established default for image processing |

---

## Recommended Calibration Priority

The following groups are the highest-risk unverified constants, ranked by their potential
to silently affect claim outcomes at scale:

1. **`ENGINE_WEIGHTS` in `evidenceStrengthScorer.ts`** — affects every claim's overall evidence score.
2. **Scoring weights in `imageIntelligence.ts`** — affects which images reach Stage 6 vision analysis.
3. **`DEFORMATION_RATIO_*` in `stage-7-physics.ts`** — directly affects severity classification.
4. **`DAMAGE_SCORE_*_THRESHOLD` in `severityConsensusEngine.ts`** — affects the final severity verdict.
5. **`SUSPICIOUS_THRESHOLD` in `photoForensicsEngine.ts`** — affects fraud flag generation from photo EXIF.

---

## Maintenance Instructions

When a constant is data-verified:

1. Remove it from the relevant table in this document.
2. Move it to the "Data-Grounded Constants" table with a citation to the calibration study.
3. Replace the `// CALIBRATION: origin unknown` comment in the source file with a comment citing the study and its date.
4. Commit both changes together so the document and the code stay in sync.

When a constant is changed:

1. Update the "Current value" column in this document.
2. Add a note in the "Role" column describing why it was changed and what dataset was used.
3. Commit the source change and this document update together.
