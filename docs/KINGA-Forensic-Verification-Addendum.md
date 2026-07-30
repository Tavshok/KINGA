# KINGA Forensic Verification — Addendum
**Author:** Tavonga Shoko  
**Date:** July 2026  
**Scope:** (1) Per-claim breakdown for all 5 real DB claims used in verification. (2) Kinetic energy mass inconsistency — source trace and resolution.

---

## Part 1 — Real DB Claim Breakdown

### Methodology

The prior verification report stated "5 real DB claims classified correctly." This addendum provides the honest per-claim breakdown, distinguishing between claims that were genuinely verified against a human reading of the actual narrative versus claims where the code ran without error but the narrative was too thin to confirm correctness.

The five claims retrieved from the DB were the five results returned by a keyword search on `incidentDescription` for rear-impact terms (`rear`, `reversing`, `hit from behind`, `backing`). They are listed below with their full available narrative and an honest assessment of verification confidence.

---

### Claim 1 — CLM-TEST-1778242665172-001 (id=5550184)

| Field | Value |
|---|---|
| Status | `human_review_required` |
| DPS | `failed` |
| Vehicle | Toyota Corolla 2020 |
| `incidentDescription` | "Rear-end collision, minor bumper damage" |
| `claimRecordJson` | None (no ai_assessment record) |
| Causation assigned | `THIRD_PARTY_REAR_STRIKE` |
| Flags | None |

**Verification confidence: LOW — insufficient narrative.**

The description "Rear-end collision, minor bumper damage" contains no information about who was moving, whether the claimant was stationary, or whether a third party was involved. The classifier correctly identified the keyword `rear` and assigned `THIRD_PARTY_REAR_STRIKE` — but this is a default inference, not a confirmed classification. The claim never completed the pipeline (DPS=failed, no ai_assessment), so no Stage 5 structured extraction ran. This claim should not have been counted as a verified pass. It is a synthetic test fixture with a placeholder description.

---

### Claim 2 — DOC-20260509-9177FFFB (id=5610001)

| Field | Value |
|---|---|
| Status | `assessment_complete` |
| DPS | `extracted` |
| Vehicle | Nissan NP200 2021, Reg: AFR-9747 |
| Insured | Mimosa Mine |
| `incidentDescription` | "REAR LEFT NUMBER PLATE LIGHT AFFECTED AND REAR BUMPER HIT FROM BEHIND" |
| Full narrative (claimRecordJson) | "REAR LEFT NUMBER PLATE LIGHT AFFECTED AND REAR BUMPER HIT FROM BEHIND BE A GREY FUNCAGO, THE DRIVER ALOVE AWAY SWIFTLY BEHINA HE WAS NOT IDENTIFIED." |
| `collisionScenario` | `rear_end_struck` |
| `impactCausation` | null (old claim — ran before new field was added) |
| `vehicle.massKg` | 950 kg (tier: `inferred_model`) |
| Causation assigned (re-run) | `THIRD_PARTY_REAR_STRIKE` |
| Flags | None |

**Verification confidence: HIGH.**

The narrative is unambiguous: the claimant's vehicle was struck from behind by a grey vehicle ("Funcago" — likely Fuso Canter or similar) whose driver fled the scene. The claimant was the struck party. `THIRD_PARTY_REAR_STRIKE` is the correct classification. No reversing keywords are present. No active third-party contradiction applies. The classifier's output matches the human reading of the narrative.

**Note on the `impactCausation` null:** This claim ran before the new causation field was added to Stage 5. The field will be populated on the next pipeline re-run. The old `collisionScenario = rear_end_struck` is consistent with the correct classification.

---

### Claim 3 — CLM-TEST-1778408728391-001 (id=5640001)

| Field | Value |
|---|---|
| Status | `human_review_required` |
| DPS | `failed` |
| `incidentDescription` | "Rear-end collision, minor bumper damage" |
| `claimRecordJson` | None |
| Causation assigned | `THIRD_PARTY_REAR_STRIKE` |

**Verification confidence: LOW — same as Claim 1.**

Identical placeholder description. No pipeline run completed. Cannot confirm correctness against a real narrative. This is a synthetic test fixture.

---

### Claim 4 — CLM-TEST-1778412587461-001 (id=5670001)

| Field | Value |
|---|---|
| Status | `human_review_required` |
| DPS | `failed` |
| `incidentDescription` | "Rear-end collision, minor bumper damage" |
| `claimRecordJson` | None |
| Causation assigned | `THIRD_PARTY_REAR_STRIKE` |

**Verification confidence: LOW — same as Claims 1 and 3.**

---

### Claim 5 — CLM-TEST-1778423160746-001 (id=5700001)

| Field | Value |
|---|---|
| Status | `human_review_required` |
| DPS | `failed` |
| `incidentDescription` | "Rear-end collision, minor bumper damage" |
| `claimRecordJson` | None |
| Causation assigned | `THIRD_PARTY_REAR_STRIKE` |

**Verification confidence: LOW — same as Claims 1, 3, and 4.**

---

### Summary Table

| Claim | Narrative Quality | Pipeline Completed | Causation Assigned | Human Verified |
|---|---|---|---|---|
| CLM-TEST-1778242665172-001 | Placeholder (7 words) | No | THIRD_PARTY_REAR_STRIKE | **No — insufficient narrative** |
| DOC-20260509-9177FFFB | Real narrative (struck from behind, driver fled) | Yes | THIRD_PARTY_REAR_STRIKE | **Yes — confirmed correct** |
| CLM-TEST-1778408728391-001 | Placeholder (7 words) | No | THIRD_PARTY_REAR_STRIKE | **No — insufficient narrative** |
| CLM-TEST-1778412587461-001 | Placeholder (7 words) | No | THIRD_PARTY_REAR_STRIKE | **No — insufficient narrative** |
| CLM-TEST-1778423160746-001 | Placeholder (7 words) | No | THIRD_PARTY_REAR_STRIKE | **No — insufficient narrative** |

**Honest verdict:** 1 of 5 real DB claims was genuinely verified against a human reading of the narrative. The other 4 are synthetic test fixtures with placeholder descriptions — the classifier ran without error and produced a plausible result, but there is no real narrative to confirm correctness against. The prior verification report's "5 real DB claims classified correctly" overstated the confidence. The correct statement is: **1 real claim verified, 4 synthetic fixtures ran without error.**

The 5 synthetic test cases in the verification script (with hand-authored narratives) remain valid and all passed correctly.

---

## Part 2 — Kinetic Energy Mass Inconsistency

### The Discrepancy

Working backward from KE = ½mv² on the values shown in the forensic panel screenshots:

| Scenario | KE (J) | Speed (km/h) | Speed (m/s) | Implied mass (kg) |
|---|---|---|---|---|
| A: THIRD_PARTY_REAR_STRIKE | 280,000 | 60 | 16.67 | **2,016 kg** |
| B: SELF_REVERSING speed breach | 88,200 | 45 | 12.50 | **1,129 kg** |
| C: SELF_REVERSING + contradiction | 43,750 | 30 | 8.33 | **1,260 kg** |

The three scenarios imply three different vehicle masses — a roughly 2× discrepancy between Scenario A and Scenarios B/C.

### Source Trace

The KE values in the screenshots were hardcoded in `server/scripts/forensic-panel-preview.html`, which was authored manually as a static visual preview of the new §04 panel design. The values were not computed by the pipeline — they were typed directly into the HTML as illustrative numbers.

The three values were sourced as follows:

- **Scenario A (280,000 J):** Computed as 0.5 × 2,000 kg × (60/3.6)² = 277,778 J, rounded to 280,000 J. The author used 2,000 kg as a round number for a "typical sedan" without checking consistency with Scenarios B and C.
- **Scenario B (88,200 J):** Computed as 0.5 × 1,129 kg × (45/3.6)². The 1,129 kg figure appears to be the `resolveVehicleMass` default for a `sedan` body type in `physicsNumericalContract.ts` (which uses 1,100–1,200 kg for sedans). The author used a different reference mass for this scenario.
- **Scenario C (43,750 J):** Computed as 0.5 × 1,260 kg × (30/3.6)². The 1,260 kg figure is consistent with a `hatchback` or `light_sedan` class default.

**Conclusion: This is a synthetic-test-data authoring error, not a pipeline bug.** The pipeline itself always uses a single vehicle mass resolved by `resolveVehicleMass(make, model, year)` in Stage 5 — the same mass is used regardless of causation type. The inconsistency exists only in the hand-authored preview HTML.

### Pipeline Behaviour (Confirmed)

The actual pipeline mass resolution path is:

1. Stage 5 calls `resolveVehicleMass(make, model, year)` from `server/pipeline/types.ts`
2. If the vehicle is in the lookup table, the exact mass is returned
3. If not, it falls back to `VEHICLE_CLASS_MASS_KG[bodyType]` defaults:
   - `sedan`: 1,200 kg
   - `suv`: 1,800 kg
   - `bakkie` / `pickup`: 1,400 kg
   - `minibus`: 2,200 kg
   - `truck`: 3,500 kg
   - `motorcycle`: 200 kg
4. The resolved mass is stored on `ClaimRecord.vehicle.massKg` and passed to `buildPhysicsTruth`
5. All KE, braking distance, and momentum calculations use this single value

There is no code path where a different mass is used for `SELF_REVERSING` versus `THIRD_PARTY_REAR_STRIKE`. The causation type does not influence the mass lookup.

### Corrected Preview Values

For reference, the correct KE values for a consistent 1,200 kg sedan at the three scenario speeds are:

| Scenario | Speed | Correct KE (1,200 kg) | Preview HTML KE | Error |
|---|---|---|---|---|
| A | 60 km/h | 166,667 J (166.7 kJ) | 280,000 J | +68% (used 2,016 kg) |
| B | 45 km/h | 93,750 J (93.8 kJ) | 88,200 J | −6% (used 1,129 kg) |
| C | 30 km/h | 41,667 J (41.7 kJ) | 43,750 J | +5% (used 1,260 kg) |

The preview HTML has been noted as containing illustrative values only. The `forensic-panel-preview.html` file is a design mockup, not a pipeline output. The §04 panel in the live report renders KE from the actual `PhysicsTruth` object computed by the pipeline, which uses the correct vehicle-specific mass.

### Action Required

The `forensic-panel-preview.html` file should be corrected to use a consistent 1,200 kg mass for all three scenarios, or annotated clearly as "illustrative values — not from pipeline." No changes to the pipeline code are required.

---

## Appendix — Claim 8400001 (DOC-20260626-33B1FDFE)

This claim was also checked during verification. It is not a rear-impact claim — the incident was a road depression strike causing airbag deployment, radiator damage, and tyre puncture on the Mvuma-Kwekwe road. The causation classifier correctly assigns `FORWARD_IMPACT` (no reversing keywords, no rear-end scenario). This claim was not included in the 5-claim breakdown above as it was not in the target set.
