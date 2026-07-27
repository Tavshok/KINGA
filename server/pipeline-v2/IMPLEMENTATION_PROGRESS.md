# Physics Pipeline Redesign — Implementation Progress

## Status: Phases 1–5 Complete, Phase 6 In Progress

---

## Phase 1: Architecture Diagnosis ✅

### Confirmed Gaps Fixed:
1. **Stage 3 airbagDeployment** — no keyword hints → added SRS, airbag deployed, curtain airbag, etc.
2. **Stage 3 seatbeltPretensioner** — no keyword hints → added pretensioner, seatbelt tensioner, etc.
3. **Stage 5 null→false coercion** — `?? false` silently disabled M4 → changed to `?? null`
4. **Stage 6 no vision airbag detection** — vision schema had no airbagDeployedVisible field (TODO: still to add)
5. **VGE front-only reference objects** — headlamp_spacing, grille_width, bonnet_width only → added rear_track_width, overall_width, overall_height
6. **VGE "frontal compression" language** — changed to direction-neutral "maximum visible deformation depth"
7. **Stage 7 severity floors frontal-calibrated** — added DIRECTION_CRUSH_FACTOR table
8. **M7 missing** — added CLAIMANT_STATED method with plausibility gate and claimedSpeedDeviationFlag

### Already Correct (no fix needed):
- totalLossIndicated — correctly computed from repairToValueRatio in Stage 7
- ACCIDENT_TYPE_MULTIPLIER — already direction-specific (rear: 0.90, side: 1.10)
- DEFORM_EFFICIENCY — already direction-specific (rear: 0.60, side: 0.55)
- Zone-conditioned crush depth (FIX-A) — already direction-aware

---

## Phase 2: Data-Extraction Gaps ✅

Files modified:
- `stage-3-structured-extraction.ts` — airbagDeployment and seatbeltPretensioner keyword hints
- `stage-5-assembly.ts` — `?? null` instead of `?? false`
- `types.ts` — `airbagDeployment: boolean | null` and `seatbeltPretensioner: boolean | null`

---

## Phase 3: Direction-Agnostic VGE Calibration ✅

Files modified:
- `stage-6-5a-vge.ts` — buildCalibrationPrompt rewritten with zone-indexed reference objects
  - FRONT: wheel, licence_plate, headlamp_spacing, grille_width, bonnet_width
  - REAR: wheel, licence_plate, rear_track_width, overall_width, bumper_width
  - SIDE: wheel, licence_plate, overall_height, wheelbase
  - Added rear_track_width (tier 2, 0.78), overall_width (tier 2, 0.70), overall_height (tier 2, 0.72) to REFERENCE_RELIABILITY
  - Crush depth language: "maximum visible deformation depth from undamaged panel face to deepest point"

---

## Phase 4: Direction-Adjusted Crush Depth Floors ✅

Files modified:
- `stage-7-physics.ts` — DIRECTION_CRUSH_FACTOR table added to inferCrushDepth
  - frontal: 1.00, rear: 0.85, side_driver/side_passenger: 0.70, rollover: 0.60, multi_impact: 0.90, unknown: 0.90
  - Source: SAE 2002-01-0547 (Varat & Husher, 2002)
  - airbagDeployment checks changed to `=== true` (null-safe)

---

## Phase 5: M7 Claimant-Stated Speed ✅

Files modified:
- `speedInferenceEnsemble.ts`:
  - MethodEstimate.method union: added 'CLAIMANT_STATED'
  - SpeedInferenceResult: added claimedSpeedDeviationFlag type
  - EnsembleInput: added claimedSpeedKmh?: number | null
  - runClaimantStated() function: plausibility gate 5–200 km/h, weight 0.30
  - computeClaimedSpeedDeviation() function: consistent/moderate/significant/critical taxonomy
- `stage-7-physics.ts` — claimedSpeedKmh wired into ensemble call

---

## Phase 6: Forward Damage Estimation Model (IN PROGRESS)

### Plan:
Create `forwardDamageEstimation.ts` — given speed + direction → expected damage profile.

### Key design decisions:
- Speed bands: <20, 20-40, 40-60, 60-80, >80 km/h
- Direction-specific zone maps: frontal, rear, side_driver, side_passenger, rollover
- Output: { expectedZones, expectedSeverity, expectedStructural, expectedAirbag }
- This is the prerequisite for Phase 7 (Possible/Impossible/Unexplained classification)

### Existing files to check:
- `damagePatternValidationEngine.ts` — has expected damage patterns per scenario
- `damagePhysicsCoherence.ts` — maps damage zones to impact directions
- `vehiclePanelDimensions.ts` — panel zone definitions

---

## Phase 7: Possible/Impossible/Unexplained Classification Engine (TODO)

### Plan:
Create `damageClassificationEngine.ts`:
- POSSIBLE: damage is consistent with stated speed + direction
- IMPOSSIBLE: damage is physically inconsistent with stated speed + direction
- UNEXPLAINED: damage exists that cannot be explained by the stated incident

---

## Phase 8: Wire + Test (TODO)
## Phase 9: Deliver Report (TODO)
