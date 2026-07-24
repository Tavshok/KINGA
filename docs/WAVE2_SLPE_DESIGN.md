# Wave 2 — Structural Load Path Engine (SLPE) Design Notes
# Saved: July 2026

## What exists in the DB
- `vehicle_models` — manufacturer, model, variant, year, bodyType, completenessScore
- `vehicle_geometry_measurements` — measurementType (code), valueMm, confidence, sourceType
- `vehicle_landmarks` — xMm, yMm, zMm in VVCS reference frame
- `vision_calibration_results` — per-image calibrated crush depth, scale, confidence
- `vehicleGeometryMeasurements` has 624 rows across 39 vehicle models

## Current latent damage predictor (accidentPhysics.ts line 870)
- Pure lookup table: base = speed/100, multiplied by fixed coefficients per accident type
- Does NOT use: crush depth, calibrated geometry, impact overlap, vehicle structural zones
- Output: { engine, transmission, suspension, frame, electrical } as % probabilities
- Called from analyzeAccidentPhysics() at line 266

## Wave 2 Architecture

### Stage 6.5C — Structural Load Path Engine (new file: stage-6-5c-slpe.ts)

**Inputs:**
- `crushDepthM` — from PTL (VGR consensus or VGE best single, or Stage 6 estimate)
- `crushDepthConfidence` — from PTL
- `impactZone` — front/rear/side-left/side-right/rollover
- `impactOverlapPct` — 0-100 (full/offset/narrow overlap)
- `vehicleProfile` — from vehicle_models + vehicle_geometry_measurements
- `deltaVKmh` — from PTL speed consensus
- `vehicleBodyType` — sedan/SUV/ute/van/hatchback/wagon

**Load path maps by vehicle class:**

FRONTAL FULL OVERLAP (>75%):
  bumperBeam → crashBox → frontRail → engineCradle → firewall → frontFloor
  Penetration thresholds (mm crush depth):
    0-50mm: bumperBeam only
    50-120mm: + crashBox absorbed
    120-200mm: + frontRail permanent deformation
    200-280mm: + engineCradle contact (engine push-back risk)
    280-350mm: + firewall intrusion (cabin deformation)
    >350mm: + frontFloor/toeboard (severe structural)

FRONTAL OFFSET (25-75% overlap):
  Same path but asymmetric — LH or RH rail only
  Higher torsional load on firewall at lower crush depths

FRONTAL NARROW (<25% overlap):
  Bumper end → wheel/strut tower → A-pillar base
  Chassis rail largely bypassed — higher suspension damage at lower crush depth

SIDE IMPACT:
  Door skin → door beam → B-pillar (or A/C pillar) → rocker sill → floor cross-member
  Penetration thresholds:
    0-30mm: door skin + outer panel
    30-80mm: door beam deformation
    80-150mm: B-pillar deformation (structural)
    >150mm: rocker sill + floor cross-member (frame)

REAR IMPACT:
  Rear bumper → rear rail → spare wheel well → rear floor → fuel tank zone
  Penetration thresholds:
    0-60mm: bumper + energy absorber
    60-140mm: rear rail deformation
    >140mm: spare wheel well + fuel tank proximity

**Component cascade output (per zone penetrated):**
Each component in the load path gets:
- `penetrationDepthMm` — estimated depth of deformation into that component
- `componentYieldStrengthMPa` — from vehicle profile or class default
- `estimatedEnergyAbsorbedJ` — based on component cross-section and yield
- `permanentDeformationProbability` — 0-1
- `hiddenDamageProbability` — 0-1 (component behind visible zone)
- `inspectionRequired` — boolean
- `replacementLikelihood` — 'low'|'medium'|'high'|'certain'

**Vehicle class structural defaults (when DB profile incomplete):**
- sedan/hatchback/wagon: front rail length 450mm, crash box 80mm, bumper beam 40mm
- SUV/4WD: front rail length 520mm, crash box 90mm, bumper beam 50mm, higher body-on-frame stiffness
- ute/pickup: ladder frame — higher frame stiffness, lower crash box absorption
- van: longer front overhang, different rail geometry

## Redesigned latent damage predictor

Replace the lookup table with SLPE-driven output:
- For each component in the load path that has `permanentDeformationProbability > 0.3`:
  - Map to system category (engine, transmission, suspension, frame, electrical)
  - Weight by `estimatedEnergyAbsorbedJ / totalEnergyJ`
  - Apply vehicle-age multiplier (older vehicles have less crush zone compliance)
  - Apply bodyType multiplier (body-on-frame vs unibody)
- Output same interface { engine, transmission, suspension, frame, electrical } as %
- Add new fields: `loadPathComponents[]`, `primaryPenetrationZone`, `structuralIntegrityRisk`

## Integration points
- Called from orchestrator after Stage 6.5B (VGR) — needs PTL crush depth
- Result stored in PTL as `loadPathAnalysis`
- Persisted to `physics_truth_json` (no new DB column needed)
- Rendered in Forensic report §05 Vehicle Structural Intelligence (new sub-panel)
- Also feeds §06 Hidden Damage & Latent Risk (replaces current lookup table output)

## Files to create/modify
- CREATE: server/pipeline-v2/stage-6-5c-slpe.ts
- MODIFY: server/accidentPhysics.ts — replace predictLatentDamage() to call SLPE
- MODIFY: server/pipeline-v2/physicsTruth.ts — add loadPathAnalysis field
- MODIFY: server/pipeline-v2/types.ts — add SLPEResult to Stage7Output or new context field
- MODIFY: server/pipeline-v2/orchestrator.ts — call SLPE after Stage 6.5B
- MODIFY: server/reporting/forensicDecisionReport.ts — render §05 load path panel
