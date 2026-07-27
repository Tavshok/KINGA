# KINGA Pipeline Architecture Diagnosis
## Date: 2026-07-27

---

## Phase 1 Findings: Front-Impact Hardcoding

### 1. Stage 3 (Structured Extraction) — airbagDeployment
- **File**: `stage-3-structured-extraction.ts` line 137
- **Issue**: `airbagDeployment` description is "Whether airbags deployed" — NO extraction hints (no "airbag deployed", "airbags activated", "SRS", "curtain airbag", "driver airbag", "passenger airbag" keywords)
- **seatbeltPretensioner** has better hints (line 138) but still missing: "SRS", "belt lock", "belt tensioner activated"
- **Fix needed**: Enrich airbagDeployment description with extraction keywords

### 2. Stage 5 (Assembly) — airbagDeployment / seatbeltPretensioner
- **File**: `stage-5-assembly.ts` line 352-353
- **Issue**: `airbagDeployment: v.airbagDeployment ?? false` — defaults to `false` when null
- **Impact**: If Stage 3 returns null (not found), Stage 7 treats it as "not deployed"
- **Fix needed**: Preserve null vs false distinction; Stage 7 should treat null as "unknown"

### 3. Stage 6 (Damage Analysis) — airbag detection
- **File**: `stage-6-damage-analysis.ts`
- **Issue**: Stage 6 vision analysis has NO airbag detection in its LLM prompt or JSON schema
- **Impact**: Deployed airbags visible in photos are never detected
- **Fix needed**: Add `airbagDeployedVisible` boolean to VISION_RESPONSE_SCHEMA and prompt

### 4. Stage 6 (Damage Analysis) — inferDamageFromDescription (lines 1320-1370)
- **File**: `stage-6-damage-analysis.ts`
- **Issue**: `inferDamageFromDescription` fallback has hardcoded component lists per direction
  - frontal: Front Bumper, Bonnet, Grille, LH/RH Headlamp ✓
  - rear: Rear Bumper, Boot Lid, LH/RH Tail Lamp ✓
  - side_driver/side_passenger: LH/RH Front Door, Rear Door, B-Pillar, Sill Panel, Fender, Quarter Panel, Door Glass, Door Mirror ✓
  - rollover: Windscreen, Rear Windscreen, LH/RH Sill Panel ✓
  - default: Front Bumper only ← **HARDCODED FRONT FALLBACK**
- **Fix needed**: Default fallback should be direction-neutral

### 5. Stage 6.5A (VGE) — reference object filter
- **File**: `stage-6-5a-vge.ts` line 314
- **Issue**: `buildCalibrationPrompt` filters measurements to: `['wheel_diameter_mm', 'wheel_diameter_alt_mm', 'licence_plate_width_mm', 'headlamp_spacing_mm', 'grille_width_mm', 'bumper_width_mm', 'overall_width_mm']`
- **headlamp_spacing_mm** and **grille_width_mm** are FRONT-ONLY reference objects
- For rear-impact photos, these are not visible — calibration degrades
- **Fix needed**: Direction-aware reference object selection

### 6. Stage 6.5A (VGE) — crush depth prompt
- **File**: `stage-6-5a-vge.ts` line 334
- **Issue**: `rawCrushDepthPx: the maximum visible crush/deformation depth in pixels (frontal compression from bumper face to deepest point)` — explicitly says "frontal compression"
- **Fix needed**: Direction-neutral crush depth description

### 7. Stage 7 (Physics) — stiffness table
- **File**: `speedInferenceEnsemble.ts` line 206
- **Issue**: `VEHICLE_STIFFNESS_KNM` is labelled "Per-model **frontal** stiffness" — all values are frontal barrier test values
- **Rear stiffness** is typically 60-80% of frontal (rear crumple zones are shorter)
- **Side stiffness** is typically 40-60% of frontal (doors/pillars have less crush depth)
- **Fix needed**: Direction multiplier applied to stiffness

### 8. Stage 7 (Physics) — M4 deployment threshold
- **File**: `speedInferenceEnsemble.ts` line 449
- **Issue**: M4 basis text says "FMVSS 208 typical **frontal** deployment range: 25–35 km/h"
- The weight reduction for non-barrier events (line 436) is correct but the point estimate (28 km/h) is frontal-only
- **Fix needed**: Direction-specific deployment thresholds (rear: 20-30 km/h, side: 15-25 km/h)

### 9. Stage 7 (Physics) — zone-conditioned crush depth (FIX-A)
- **File**: `stage-7-physics.ts` lines 839-880
- **Status**: ALREADY DIRECTION-AWARE ✓
- Zone matching for front/rear/side/rollover is implemented

### 10. Stage 7 (Physics) — severity-based crush depth floors
- **File**: `stage-7-physics.ts` lines 155-185
- **Issue**: Severity baselines (0.05/0.12/0.19/0.28 m) are calibrated for frontal barrier tests
- Side impacts have less crush depth for same severity (doors are thinner)
- **Fix needed**: Direction-adjusted severity baselines

### 11. Stage 7 (Physics) — totalLossIndicated
- **File**: `stage-7-physics.ts` line 972
- **Issue**: `totalLossIndicated: !!(claimRecord.valuation?.repairToValueRatio && claimRecord.valuation.repairToValueRatio > 0.75)`
- `repairToValueRatio` in Stage 5 is stored as a ratio (0.75), but the check is `> 0.75` (correct)
- **Status**: Logic is correct ✓ but depends on Stage 5 valuation being available

---

## Phase 2: Data Extraction Gaps

### airbagDeployment
- Stage 3 description too sparse → null returned for most claims
- Stage 5 defaults null → false → M4 disabled
- Stage 6 vision has no airbag detection

### seatbeltPretensioner
- Stage 3 has some hints but missing: "SRS", "belt lock", "belt tensioner activated", "pretensioner replaced"
- Stage 5 defaults null → false

### totalLossIndicated
- Correctly computed from `claimRecord.valuation.repairToValueRatio` in Stage 7
- Stage 5 valuation runs before Stage 7 so it IS available
- **Status**: Working correctly ✓

---

## Phase 3: VGE Direction-Agnostic Calibration

### Reference object availability by view angle:
| View | Available Objects |
|------|-------------------|
| Front | wheel, licence_plate, headlamp_spacing, grille_width, bonnet_width, bumper_width |
| Rear | wheel, licence_plate, rear_bumper_width, tail_lamp_spacing |
| Side | wheel, door_width, overall_height |
| 45° Front | wheel, licence_plate, headlamp_spacing |
| 45° Rear | wheel, licence_plate, tail_lamp_spacing |

### DB measurements available for Isuzu MU-X:
- bonnet_width_mm: 1790
- bumper_width_mm: 1830
- front_bumper_height_mm: 820
- front_track_mm: 1510
- grille_width_mm: 1060
- headlamp_spacing_mm: 1380
- licence_plate_height_mm: 110
- licence_plate_width_mm: 520
- overall_height_mm: 1825
- overall_width_mm: 1860
- rear_track_mm: 1510
- vehicle_mass_kg: 2085
- wheel_diameter_alt_mm: 745
- wheel_diameter_mm: 776
- wheelbase_mm: 2845
- windscreen_width_mm: 1530

### Missing rear-specific measurements:
- rear_bumper_width_mm (not in DB — use bumper_width_mm as proxy)
- tail_lamp_spacing_mm (not in DB)
- boot_width_mm (not in DB)

---

## Phase 4: Crush Depth Floors by Direction

### Current floors (frontal-calibrated):
- cosmetic/minor: 0.05 m
- moderate: 0.12 m
- severe: 0.19 m
- catastrophic: 0.28 m

### Proposed direction-adjusted floors:
| Direction | Minor | Moderate | Severe | Catastrophic |
|-----------|-------|----------|--------|--------------|
| frontal | 0.05 | 0.12 | 0.19 | 0.28 |
| rear | 0.04 | 0.10 | 0.16 | 0.24 |
| side | 0.03 | 0.07 | 0.12 | 0.18 |
| rollover | 0.02 | 0.05 | 0.08 | 0.12 |

### Stiffness direction multipliers:
| Direction | Multiplier | Rationale |
|-----------|-----------|-----------|
| frontal | 1.00 | Baseline (NHTSA frontal barrier) |
| rear | 0.70 | Rear crumple zones shorter than front |
| side | 0.50 | Door/pillar crush depth limited |
| rollover | 0.30 | Roof crush — very different mechanics |

---

## Phase 5: M7 Claimant-Stated Speed

### Current state:
- `estimatedSpeedKmh` extracted in Stage 3 from claim form
- Used in `speedForensics` via `computeSpeedForensics` in `accidentPhysics.ts`
- NOT currently a separate ensemble method (M7)

### Proposed M7:
- Input: `claimRecord.accidentDetails.estimatedSpeedKmh`
- Plausibility gate: if > 200 km/h or < 0, reject
- `claimedSpeedDeviationFlag`: true if |claimed - ensemble| > 30%
- Weight: 0.20 (lower than physics methods)

---

## Phase 6: Forward Damage Estimation

### Concept:
- Given speed + direction → compute expected damage
- Compare expected vs actual → possible/impossible/unexplained

### Expected damage floors by speed:
| Speed (km/h) | Expected Severity | Expected Crush (frontal) |
|---|---|---|
| < 15 | cosmetic | < 0.05 m |
| 15-30 | minor-moderate | 0.05-0.12 m |
| 30-60 | moderate-severe | 0.12-0.25 m |
| 60-100 | severe | 0.20-0.40 m |
| > 100 | catastrophic | > 0.35 m |

---

## Phase 7: Damage Classification Engine

### Classification categories:
- **Possible**: Damage consistent with claimed speed + direction
- **Impossible**: Damage physically impossible at claimed speed + direction
- **Unexplained**: Damage present but not consistent with any claimed scenario

### Key rules:
- Airbag deployed at < 20 km/h → IMPOSSIBLE
- Front damage claimed as rear impact → IMPOSSIBLE
- Crush depth > 0.30 m at < 30 km/h → IMPOSSIBLE
- Rear damage in frontal claim → UNEXPLAINED
- Side damage in frontal claim (no sideswipe) → UNEXPLAINED

---

## DB Claims Available for Testing

### Side-impact claims (collision_direction in claim_record_json):
- Claim 5580001: Toyota Hilux 2016, side_passenger
- Claim 5970001: Toyota Landcruiser 2018, side_driver
- Claim 6630002: Isuzu D-MAX 2021, side_passenger
- Claim 7110001: Isuzu D-MAX 2021, side_driver
- Claim 7560001: Volkswagen Polo 2008, side_passenger
- Claim 7650001: Chevrolet Trailblazer 2014, side_passenger
- Claim 7680001: Chevrolet Trailblazer 2014, side_passenger
- Claim 7830001: Toyota Hilux 2010, side_driver
- Claim 7920001: Toyota Hilux 2010, side_passenger
- Claim 7950001: Toyota Hilux 2010, side_driver

### Collision direction distribution:
- frontal: 72 claims
- rear: 15 claims
- side_passenger: 7 claims
- side_driver: 4 claims
- multi_impact: 1 claim
- unknown: 1 claim

---

## Files to Modify

1. `stage-3-structured-extraction.ts` — enrich airbagDeployment/seatbeltPretensioner descriptions
2. `stage-5-assembly.ts` — preserve null vs false for airbagDeployment/seatbeltPretensioner
3. `stage-6-damage-analysis.ts` — add airbagDeployedVisible to vision schema
4. `stage-6-5a-vge.ts` — direction-aware reference object selection + neutral crush depth description
5. `speedInferenceEnsemble.ts` — direction stiffness multiplier + M7 claimant speed + M4 direction-specific thresholds
6. `stage-7-physics.ts` — direction-adjusted crush depth floors + forward damage estimation + damage classification
7. New file: `damageClassificationEngine.ts` — possible/impossible/unexplained classification
