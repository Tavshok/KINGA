# KINGA Physics Pipeline Redesign Report
## Direction-Agnostic Bidirectional Impact Validation
**Date:** 2026-07-27  
**Version:** ec9070eb  
**Scope:** `server/pipeline-v2/` — Stages 3, 5, 6.5A, 7 + new engines

---

## 1. Architecture Diagnosis

### 1.1 Front-Impact Hardcoding — Confirmed Gaps

| ID | Location | Issue | Severity |
|----|----------|-------|----------|
| G1 | `stage-3-structured-extraction.ts` | `airbagDeployment` description had no keyword hints (no "SRS", "airbag deployed", "curtain airbag", etc.) | HIGH |
| G2 | `stage-3-structured-extraction.ts` | `seatbeltPretensioner` description had no keyword hints | MEDIUM |
| G3 | `stage-5-assembly.ts` | `airbagDeployment: v.airbagDeployment ?? false` coerced `null` (not found) to `false` (not deployed), silently disabling M4 | HIGH |
| G4 | `stage-5-assembly.ts` | Same null→false coercion for `seatbeltPretensioner` | MEDIUM |
| G5 | `stage-6-5a-vge.ts` | `buildCalibrationPrompt` included `headlamp_spacing_mm` and `grille_width_mm` as reference objects — both front-only, invisible in rear/side photos | HIGH |
| G6 | `stage-6-5a-vge.ts` | Crush depth prompt said "frontal compression from bumper face to deepest point" — direction-specific language | MEDIUM |
| G7 | `stage-7-physics.ts` | Severity-based crush depth floors (0.05/0.12/0.19/0.28 m) were calibrated from NHTSA frontal barrier data only | HIGH |
| G8 | `speedInferenceEnsemble.ts` | M7 (claimant-stated speed) was missing entirely — `estimatedSpeedKmh` from Stage 3 was never fed into the ensemble | HIGH |
| G9 | `stage-7-physics.ts` | `airbagDeployed` truthy check used `if (airbagDeployed)` — treated `null` as `false` after G3 fix | MEDIUM |

### 1.2 Already Correct (No Fix Required)

| Component | Status |
|-----------|--------|
| `ACCIDENT_TYPE_MULTIPLIER` in `speedInferenceEnsemble.ts` | Already direction-specific (rear: 0.90, side: 1.10) |
| `DEFORM_EFFICIENCY` in `speedInferenceEnsemble.ts` | Already direction-specific (rear: 0.60, side: 0.55) |
| Zone-conditioned crush depth (FIX-A) in Stage 7 | Already direction-aware |
| `totalLossIndicated` | Correctly computed from `repairToValueRatio` |

---

## 2. Changes Implemented

### 2.1 Stage 3 — Extraction Keyword Improvements

**File:** `stage-3-structured-extraction.ts`

**airbagDeployment** — added explicit search terms:
> "SRS", "airbag deployed", "curtain airbag", "driver airbag", "passenger airbag", "airbags activated", "airbag warning light", "airbag module"

**seatbeltPretensioner** — added explicit search terms:
> "seatbelt pretensioner", "seatbelt tensioner", "pyrotechnic seatbelt", "seatbelt assembly", "belt tensioner", "seatbelt retractor"

### 2.2 Stage 5 — Null Preservation Fix

**File:** `stage-5-assembly.ts`

**Before:**
```ts
airbagDeployment: v.airbagDeployment ?? false,
seatbeltPretensioner: v.seatbeltPretensioner ?? false,
```

**After:**
```ts
airbagDeployment: v.airbagDeployment ?? null,
seatbeltPretensioner: v.seatbeltPretensioner ?? null,
```

**Impact:** `null` now correctly means "not found in documents". Stage 7 uses `=== true` checks, so M4 only fires when airbag deployment is confirmed, not when it is absent from the claim documents.

**Type change:** `AccidentDetails.airbagDeployment` changed from `boolean` to `boolean | null` in `types.ts`.

### 2.3 Stage 6.5A VGE — Direction-Aware Calibration

**File:** `stage-6-5a-vge.ts`

**buildCalibrationPrompt** now selects reference objects based on the photo's view angle:

| View | Primary Reference Objects | Fallback |
|------|--------------------------|---------|
| Front | `headlamp_spacing_mm`, `grille_width_mm`, `bonnet_width_mm`, `bumper_width_mm` | `overall_width_mm`, `wheel_diameter_mm` |
| Rear | `overall_width_mm`, `rear_track_mm`, `licence_plate_width_mm`, `licence_plate_height_mm` | `wheel_diameter_mm` |
| Side | `wheelbase_mm`, `overall_height_mm`, `wheel_diameter_mm` | `overall_width_mm` |
| Unknown | All available dimensions | — |

**Crush depth prompt language** changed from "frontal compression from bumper face to deepest point" to "maximum visible deformation depth from the undeformed panel surface to the deepest visible crush point".

### 2.4 Stage 7 — Direction-Adjusted Crush Depth Floors

**File:** `stage-7-physics.ts`

**Before:** Single set of floors from NHTSA frontal barrier data:
- minor: 0.05 m, moderate: 0.12 m, severe: 0.19 m, critical: 0.28 m

**After:** Direction-specific adjustment factors applied to the base frontal floors:

| Direction | Factor | Rationale |
|-----------|--------|-----------|
| frontal | 1.00 | NHTSA frontal barrier baseline |
| rear | 0.75 | Rear crumple zones shallower (RCAR test data) |
| side_driver / side_passenger | 0.60 | Side intrusion produces less linear crush depth (ANCAP MDB data) |
| rollover | 0.50 | Roof crush geometry differs from linear crush |
| multi_impact | 1.00 | Conservative — use frontal as upper bound |
| unknown | 1.00 | Conservative fallback |

**airbagDeployed truthy check** fixed from `if (airbagDeployed)` to `if (airbagDeployed === true)` to correctly handle `null` (not found) vs `false` (confirmed not deployed).

### 2.5 M7 — Claimant-Stated Speed

**File:** `speedInferenceEnsemble.ts`

New method `CLAIMANT_STATED` added to the ensemble:

- **Input:** `claimedSpeedKmh` from `claimRecord.accidentDetails.estimatedSpeedKmh`
- **Plausibility gate:** Reject if stated speed < 5 km/h or > 200 km/h
- **Weight:** 0.30 (MEDIUM confidence) when plausible, 0 when rejected
- **Output:** `claimedSpeedDeviationFlag` added to `SpeedInferenceResult`

**claimedSpeedDeviationFlag structure:**
```ts
{
  claimedSpeedKmh: number | null,
  consensusSpeedKmh: number | null,
  deviationKmh: number | null,
  deviationPct: number | null,
  deviationClass: 'consistent' | 'moderate' | 'significant' | 'critical' | 'no_claim',
  plausibilityRejected: boolean,
  requiresVerification: boolean,
  interpretation: string,
}
```

**Deviation thresholds:**
- consistent: ≤ 15% deviation
- moderate: 15–30% deviation
- significant: 30–50% deviation
- critical: > 50% deviation

### 2.6 Forward Damage Estimation Model

**File:** `server/pipeline-v2/forwardDamageEstimation.ts` (new)

Given a speed (km/h) and collision direction, predicts:
- Primary zones (must be damaged)
- Secondary zones (should be damaged)
- Possible zones (may be damaged)
- Whether structural damage is expected
- Whether airbag deployment is expected
- Expected crush depth range (min/max metres)
- Expected severity label

**Speed bands:**
- LOW: < 20 km/h
- MODERATE: 20–40 km/h
- HIGH: 40–60 km/h
- SEVERE: 60–80 km/h
- CRITICAL: > 80 km/h

**Data sources:** NHTSA NCAP, Euro NCAP ODB, IIHS, ANCAP MDB, RCAR, FMVSS 208, SAE 2002-01-0547

### 2.7 Damage Classification Engine

**File:** `server/pipeline-v2/damageClassificationEngine.ts` (new)

Classifies each observed damage component and image zone as:

| Class | Definition |
|-------|-----------|
| **POSSIBLE** | Physically consistent with stated speed and direction |
| **IMPOSSIBLE** | Physically inconsistent — the physics model cannot produce this damage from the stated incident |
| **UNEXPLAINED** | Damage exists but is not explained by the stated incident — may be prior damage, secondary contact, or undescribed impact |

**Overall classification:**
- `CONSISTENT` — no impossible or unexplained findings
- `ANOMALOUS` — unexplained findings present, no impossible findings
- `CONTRADICTORY` — one or more impossible findings

**Impossible triggers:**
- Zone is the primary impact zone for the opposite direction (e.g., rear bumper in frontal impact)
- Airbag deployed at < 15 km/h physics-derived speed (FMVSS 208 threshold: 25 km/h)

**Unexplained triggers:**
- Zone not in expected zone map for stated direction
- Structural damage when not expected for the speed/direction
- Crush depth outside expected range (with 5 cm tolerance)

**Restraint system check:**
- Airbag deployment consistent with physics speed (FMVSS 208 thresholds: 25 km/h frontal, 30 km/h side)
- Pretensioner activation consistent with physics speed (15 km/h threshold)

### 2.8 db.ts — Serialisation Fix

**File:** `server/db.ts`

Added `damageClassification` to the `physicsJson` serialisation block so the engine output is persisted to `ai_assessments.physics_analysis`.

---

## 3. VOLTRON-001 Live Re-Run Results

**Claim:** LIVE-RUN-VOLTRON-001 (Isuzu MU-X, rear impact, animal strike scenario)  
**Pipeline duration:** ~107 seconds  
**Stage 7 status:** SUCCESS

### 3.1 Damage Classification Output

| Field | Value |
|-------|-------|
| Overall classification | **ANOMALOUS** |
| Possible findings | 6 |
| Impossible findings | 0 |
| Unexplained findings | 19 |
| Consensus speed | 22 km/h |
| Direction | rear |
| Speed band | MODERATE |
| Structural expected | YES (rear crumple zone threshold: 20 km/h) |
| Airbag expected | NO (rear impacts rarely trigger frontal airbags) |

### 3.2 Notable Unexplained Findings

The following components were classified as UNEXPLAINED for a rear impact at 22 km/h:
- Passenger Airbag, Driver Airbag, RH Knee Airbag, Airbag Module
- LH/RH Seatbelt Assembly, Seatbelt Assembly
- LH/RH Front Control Arm, Camber Bolts
- LH/RH Front Door Skin, Wind Deflector, Cab Mounting, Cross Member Bracket
- Image zones: `general`, `undercarriage`

**Interpretation:** These components are consistent with a multi-impact event (front + rear) or pre-existing damage not declared at claim submission. The classification correctly flags them for adjuster investigation without concluding fraud.

### 3.3 Restraint System Check

| Check | Result |
|-------|--------|
| Airbag deployment observed | No |
| Airbag consistent | YES (no deployment = consistent with any speed) |
| Pretensioner observed | No |
| Pretensioner consistent | YES |

### 3.4 Crush Depth Check

| Field | Value |
|-------|-------|
| Observed crush depth | 2 cm |
| Expected range | 4–14 cm (MODERATE rear) |
| Consistent | YES (within tolerance) |

### 3.5 M7 Claimant-Stated Speed

| Field | Value |
|-------|-------|
| Claimed speed | null (not stated in documents) |
| Consensus speed | 22 km/h |
| Deviation class | `no_claim` |
| Requires verification | NO |

---

## 4. Before/After Comparison

### 4.1 Crush Depth Floors (frontal vs rear vs side)

| Severity | Before (frontal only) | After — Frontal | After — Rear | After — Side |
|----------|----------------------|-----------------|--------------|--------------|
| minor | 0.05 m | 0.05 m | 0.038 m | 0.030 m |
| moderate | 0.12 m | 0.12 m | 0.090 m | 0.072 m |
| severe | 0.19 m | 0.19 m | 0.143 m | 0.114 m |
| critical | 0.28 m | 0.28 m | 0.210 m | 0.168 m |

### 4.2 airbagDeployment Null Handling

| Scenario | Before | After |
|----------|--------|-------|
| Document mentions airbag deployed | `true` | `true` |
| Document says no airbag deployed | `false` | `false` |
| Document does not mention airbags | `false` (M4 disabled) | `null` (M4 skipped correctly) |

### 4.3 VGE Reference Objects

| Photo direction | Before | After |
|----------------|--------|-------|
| Front | headlamp_spacing, grille_width | headlamp_spacing, grille_width, bonnet_width, bumper_width |
| Rear | headlamp_spacing (WRONG) | overall_width, rear_track, licence_plate dimensions |
| Side | headlamp_spacing (WRONG) | wheelbase, overall_height, wheel_diameter |

---

## 5. File Inventory

| File | Status | Change |
|------|--------|--------|
| `stage-3-structured-extraction.ts` | Modified | airbagDeployment + seatbeltPretensioner keyword hints |
| `stage-5-assembly.ts` | Modified | null preservation for airbagDeployment + seatbeltPretensioner |
| `stage-6-5a-vge.ts` | Modified | Direction-aware reference object selection + neutral crush depth language |
| `stage-7-physics.ts` | Modified | Direction-adjusted crush depth floors + airbagDeployed === true check + damageClassification call |
| `speedInferenceEnsemble.ts` | Modified | M7 CLAIMANT_STATED method + claimedSpeedDeviationFlag |
| `types.ts` | Modified | AccidentDetails.airbagDeployment → boolean \| null; Stage7Output.damageClassification field |
| `server/db.ts` | Modified | damageClassification added to physicsJson serialisation |
| `forwardDamageEstimation.ts` | **New** | Forward damage estimation model (speed + direction → expected damage profile) |
| `damageClassificationEngine.ts` | **New** | Possible/Impossible/Unexplained damage classification engine |

---

## 6. Test Results

| Test | Result |
|------|--------|
| Speed band classification (5 cases) | ✓ PASS |
| Direction normalisation (5 cases) | ✓ PASS |
| Forward damage estimation — frontal 50 km/h | ✓ PASS |
| Forward damage estimation — rear 30 km/h | ✓ PASS |
| Forward damage estimation — side 15 km/h | ✓ PASS |
| Damage classification — CONSISTENT | ✓ PASS |
| Damage classification — CONTRADICTORY (rear bumper in frontal) | ✓ PASS (4 impossible findings) |
| Airbag at 10 km/h → IMPOSSIBLE | ✓ PASS |
| VOLTRON-001 live re-run — pipeline completes | ✓ PASS |
| VOLTRON-001 — damageClassification persisted to DB | ✓ PASS |
| VOLTRON-001 — M7 claimedSpeedDeviationFlag persisted | ✓ PASS |
| TypeScript LSP check | ✓ No errors |

---

## 7. Design Principles

1. **Never conclude fraud.** The classification is physical, not intentional. "Impossible" means the physics model cannot produce this result from the stated inputs — not that the claimant is lying.

2. **Conservative thresholds.** "Impossible" requires strong physical evidence. When in doubt, classify as "unexplained" rather than "impossible". The adjuster makes the final determination.

3. **Direction-aware throughout.** Every threshold, reference object, and zone map is now direction-specific. The pipeline no longer assumes frontal impact when direction is unknown.

4. **Null ≠ False.** `airbagDeployment: null` means "not found in documents". `airbagDeployment: false` means "confirmed not deployed". These are different states with different physics implications.

5. **Evidence-based explanations.** Every classification includes a plain-language explanation and the specific evidence basis (data source, threshold, standard). Adjusters must be able to explain the classification to a claimant.
