# Physics Pipeline Audit Findings — Jul 2026

## Summary
Full end-to-end audit of the accident reconstruction pipeline: Stage 6 vision → Stage 6.5A VGE → Stage 6.5B VGR → Stage 7 speed ensemble → latent damage prediction.

---

## Gap 1 — VGR uses filename heuristics for view-angle, not LLM-reported angle (CRITICAL)
**File:** `stage-6-5b-vgr.ts` lines 103–123
**Problem:** Stage 6.5A LLM prompt explicitly asks the model to report `imageViewAngle` ("front", "rear", "side", "45_degree_front", etc.). This field is in the raw parsed JSON but is NOT stored in `PerImageCalibrationResult`. Stage 6.5B `inferViewAngle()` therefore falls back to filename heuristics (looking for "front", "side", "45" in the URL). Most S3-uploaded photos have opaque UUIDs as filenames — they will all return `UNKNOWN` view angle, which gets weight 0.50 instead of the correct FRONTAL (1.00) or SIDE (0.40). This means the view-angle-weighted consensus crush depth is systematically wrong.
**Fix:** Add `imageViewAngle?: string` to `PerImageCalibrationResult`, populate it from the LLM response in `calibrateImage()`, and use it in `inferViewAngle()` with the filename heuristic as fallback only.

---

## Gap 2 — Latent damage predictor is coarse and not geometry-driven (HIGH)
**File:** `accidentPhysics.ts` lines 870–935
**Problem:** `predictLatentDamage()` uses only: accident type, speed (single number), structuralDamage (boolean), and airbagDeployment (boolean). It does NOT consume:
- Calibrated crush depth from VGE/VGR (the most accurate geometry input)
- Per-component deformation energy from Stage 6
- Structural displacement measurements
- Damage zone specificity (front-left vs front-centre vs front-right)
The result is a coarse probability table that does not reflect the actual deformation geometry. A 50mm crush depth at the front-left corner implies very different latent damage (LH suspension, LH chassis rail, LH engine mount) than a 200mm centre crush (radiator support, engine cradle, both chassis rails).
**Fix:** Upgrade `predictLatentDamage()` to consume `calibratedCrushDepthM`, `vgrConsensusDepthM`, per-component `deformationEnergyJ`, and `structuralDisplacementM`. Map specific damage zones to specific hidden components with published probability ranges from NHTSA NCAP structural test data.

---

## Gap 3 — Source quality gate is filename-only; S3 UUIDs always return LIMITED (MEDIUM)
**File:** `stage-6-5a-vge.ts` lines 148–209
**Problem:** `assessSourceQuality()` classifies images as SUITABLE/LIMITED/UNSUITABLE using only URL/filename patterns. S3-uploaded photos from the KINGA portal have UUID-based filenames (e.g. `abc123def456.jpg`). These match the `.jpg` rule and return SUITABLE — which is correct. But PNG uploads without page- prefix return LIMITED with confidence 0.50, even if they are direct smartphone photos. The classification is conservative but not wrong.
**Status:** Acceptable as-is. The `.jpg/.jpeg/.heic` rule correctly catches most direct photos. PNG photos from smartphones are treated as LIMITED (calibration attempted with caution) which is the right conservative default.

---

## Gap 4 — Stage 6 deformation energy formula hint is approximate (LOW)
**File:** `stage-6-damage-analysis.ts` line 269
**Problem:** The prompt tells the LLM: `E = 0.5 × k × C² where k ≈ 1,000,000 N/m for body panels`. This is a reasonable first-order approximation but:
- k varies from ~400,000 N/m (thin aluminium hood) to ~2,000,000 N/m (steel bumper beam)
- The LLM is being asked to estimate energy from visual inspection, which is inherently uncertain
- The clamping range (0–500,000 J) is correct
**Status:** The prompt is adequate. The LLM is instructed to OMIT when uncertain, and Stage 7 handles null gracefully. The formula hint helps anchor the model's estimates to physically plausible ranges.

---

## Gap 5 — Latent damage not surfaced in the Forensic report §04 (MEDIUM)
**File:** `forensicDecisionReport.ts`
**Problem:** The `latentDamageProbability` object (engine, transmission, suspension, frame, electrical probabilities) is computed and stored in the assessment but is not rendered anywhere in the Forensic report. Adjusters cannot see the hidden damage risk assessment.
**Fix:** Add a Latent Damage Risk sub-panel to §04 Technical Forensics alongside the new Geometry Calibration panel.

---

## Gap 6 — physicsNumericalContract default crush depth is 0.3m (MEDIUM)
**File:** `physicsNumericalContract.ts` line 101
**Problem:** When no crush depth is available, the contract defaults to 0.3m (30cm). For a minor dent claim this would produce a wildly inflated speed estimate. However, this function is only called from Stage 7 as a cross-check, not as the primary ensemble input. The ensemble itself correctly excludes inferred crush depths (weight=0.00).
**Status:** Acceptable as-is — the contract is a cross-check, not the primary speed source.

---

## Fix Priority
1. **Gap 1 (CRITICAL):** Propagate `imageViewAngle` from VGE LLM response into `PerImageCalibrationResult` and use it in VGR `inferViewAngle()`.
2. **Gap 2 (HIGH):** Upgrade `predictLatentDamage()` to consume geometry inputs and produce zone-specific hidden component probabilities.
3. **Gap 5 (MEDIUM):** Add Latent Damage Risk sub-panel to §04 Forensic report.
