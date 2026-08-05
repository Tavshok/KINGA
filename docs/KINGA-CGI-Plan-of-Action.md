# KINGA Contact Geometry Intelligence (CGI) — Plan of Action

**Document Reference:** KINGA-ARCH-CGI-001  
**Author:** Tavonga Shoko (Lead Engineer)  
**Date:** 5 August 2026  
**Status:** Approved for Execution  
**Classification:** Internal — Engineering & Product

---

## Executive Summary

This document defines the phased plan of action for the Contact Geometry Intelligence (CGI) capability within the KINGA motor claims intelligence platform. CGI is a forensic geometry engine that validates the physical coherence of a collision scenario by comparing observed damage geometry against the expected geometry for the stated collision type, using KINGA's existing vehicle geometry database, VGE calibration outputs, and Stage 6 damage fraction estimates.

The plan is structured in three phases. Phase 1 (immediate, pre-production) delivers the Technical Decision Record for M3 and the single highest-value CGI indicator — the Contact Patch Ratio — as a new Stage 8 fraud signal. Phase 2 (v1.1, post three months of production data) delivers the full CGI engine as a first-class intelligence domain. Phase 3 (v2.0) delivers the contact patch visualisation, the full three-layer indicator architecture, and the CGI feedback loop into the benchmark learning system.

The guiding constraint throughout is that CGI must not increase claim analysis time and must not add complexity to the production pipeline before it has been validated against real claim outcomes.

---

## 1. Strategic Context

### 1.1 Why CGI Exists

Every existing signal in KINGA's fraud and risk engines answers a pattern-matching question: does this claim resemble previous fraud, does this cost deviate from the benchmark, does this speed contradict the stated narrative? These are valid and valuable signals, but they are all probabilistic. They can be challenged as statistical profiling.

CGI answers a different class of question: is the physics of this specific collision geometrically coherent? A finding that the observed contact patch fraction is 18% when the stated full-width frontal impact requires a minimum of 55% is a falsifiable physical statement. It either holds or it does not. That is a qualitatively different class of evidence — one that is usable in dispute resolution, repudiation letters, and court submissions in a way that a fraud score is not.

### 1.2 Why the Geometry Database Makes This Possible

The `vehicle_geometry_measurements` table was built to support VGE photogrammetric scale calibration. It stores `bumper_width_mm`, `front_bumper_height_mm`, `overall_width_mm`, `wheel_diameter_mm`, and twelve other per-vehicle measurements for over 40 vehicle models common in the Southern African market. This database, combined with Stage 6's per-component `damageFractionEstimate` and the VGR consensus crush depth, provides everything needed to compute contact geometry indicators without any new data sources, any new LLM calls, or any new external integrations.

### 1.3 Why Now Is Not the Right Time for the Full Engine

Building the full ten-indicator, three-layer CGI engine before production deployment would be premature for two reasons. First, the indicator weights and thresholds are currently theoretical — derived from published crash test data rather than calibrated against KINGA's own claim outcomes. Three months of production data will reveal which indicators fire on real claims, which produce false positives, and what the correct thresholds are for the Southern African vehicle fleet. Second, the full engine requires a report section, a portal UI component, and a benchmark loop integration — all of which are more valuable when the indicators have been validated against real data.

The single Contact Patch Ratio indicator, by contrast, is the most directly falsifiable of the ten indicators and the least sensitive to calibration. Its threshold (full-width frontal ≥ 55%, offset ≥ 25%, pole < 15%) is derived from published IIHS and Euro NCAP test protocols and does not require empirical calibration against claim outcomes to be defensible.

---

## 2. Intelligence Domain Architecture

Before defining the phases, it is important to establish the architectural framing within which CGI sits. KINGA is best understood as five distinct intelligence domains, each producing structured evidence that the next layer consumes.

| Domain | Engine(s) | Current Status |
|---|---|---|
| **Vision Intelligence** | Stage 6 damage analysis, Stage 6.5A VGE, Stage 6.5B VGR | Production-ready |
| **Physics Intelligence** | Stage 7 physics analysis, speed inference ensemble (M1–M7) | Production-ready |
| **Geometry Intelligence** | CGI (Stage 8.5 / future Stage 9) | Phase 1 in progress |
| **Risk Intelligence** | Stage 8 fraud scoring, cross-engine consensus, TRE | Production-ready |
| **Commercial Intelligence** | Stage 9 cost engine, benchmark learning loop | Production-ready |

This framing is the correct way to describe KINGA to insurers, investors, and patent examiners. It communicates that the system is not a collection of features but a layered intelligence architecture where each domain produces evidence that the next domain consumes.

CGI's position in this architecture is between Physics Intelligence and Risk Intelligence. It takes the outputs of the physics and vision engines and produces geometric coherence evidence that the risk and commercial engines consume. It is not a fraud engine — it is a forensic geometry engine whose primary consumer happens to be the fraud scoring engine, but whose outputs are also consumed by the cost engine (hidden damage probability), the report renderer (geometry coherence section), and eventually the TRE (geometric coherence as a top-level risk signal).

---

## 3. Phase 1 — Immediate (Pre-Production v1.0)

**Objective:** Protect the IP, record the architectural decision, and deliver the single highest-value CGI indicator without adding pipeline complexity or increasing analysis time.

**Target completion:** Before v1.0 production deployment.

**Estimated engineering effort:** 3–4 days.

### 3.1 Action 1: Technical Decision Record — M3 and CGI

**What it is:** A formal document in `docs/` that records the architectural decision to retire M3 as an independent speed-estimation method in its current implementation, explains the reasoning (the stiffness-derived impulse formulation reduces to a variant of M1), defines the conditions under which M3 could become viable in a future implementation (LiDAR-derived contact volume, EDR data, photogrammetric 3D reconstruction, finite element approximation), and establishes CGI as the correct destination for the contact geometry capability.

**Why it matters:** This document protects the patent position by establishing a clear prior-art record for the CGI architecture. It also prevents a future engineer from re-enabling M3 without understanding why it was retired, and it gives the patent attorney the technical narrative needed to draft the CGI patent claims.

**Deliverable:** `docs/TDR-001-M3-Retirement-and-CGI-Architecture.md` committed to GitHub.

**Owner:** Tavonga Shoko.

**Effort:** Half a day.

### 3.2 Action 2: Contact Patch Ratio Indicator (Stage 8)

**What it is:** A single new `FraudIndicator` entry added to the Stage 8 fraud scoring output, with `category: "contact_geometry"` and `indicator: "contact_patch_ratio"`. It computes the ratio of the observed contact patch area to the expected contact patch area for the stated collision type, and flags the claim when the ratio is below the threshold for the stated scenario.

**Formula:**

> `A_observed = panel_area_m2 × damageFractionEstimate` (primary impact component)  
> `A_expected = bumper_width_mm × front_bumper_height_mm × expected_fraction` (from geometry DB)  
> `CPR = A_observed / A_expected`

**Thresholds (from IIHS and Euro NCAP full-width and offset test protocols):**

| Collision type | Expected CPR | Flag threshold |
|---|---|---|
| Full-width frontal | ≥ 0.55 | < 0.40 |
| 40% offset frontal | 0.25–0.50 | < 0.20 |
| Pole / narrow object | < 0.15 | > 0.25 (too wide for a pole) |
| Rear full-width | ≥ 0.50 | < 0.35 |
| Side (door) | ≥ 0.30 | < 0.20 |

**Conditions for the indicator to run:**
- `visionSourceReliability` is HIGH or MEDIUM (LOW or NONE → indicator skipped, not flagged).
- The primary impact component has a `damageFractionEstimate` value (not omitted by the LLM).
- The vehicle geometry database has a record for the vehicle make/model with `bumper_width_mm` and `front_bumper_height_mm`.
- If any condition is not met, the indicator returns `status: "INSUFFICIENT_DATA"` — it does not produce a false flag.

**Output added to Stage 8:**

```typescript
{
  indicator: "contact_patch_ratio",
  category: "contact_geometry",
  score: 35,  // 0 = no concern, 100 = strong geometric incoherence
  severity: "medium",
  description: "Observed contact patch fraction (0.18) is significantly below the expected minimum (0.55) for a full-width frontal impact on this vehicle class.",
  evidence: [
    "Observed contact fraction: 0.18 (front bumper, damageFractionEstimate from Stage 6 vision analysis)",
    "Expected minimum for full-width frontal: 0.55 (IIHS full-width rigid barrier test protocol)",
    "Vehicle geometry: Toyota Allion T260 — bumper_width: 1660 mm, bumper_height: 500 mm",
    "Geometry source reliability: HIGH (VGE calibration confirmed)"
  ]
}
```

**Report integration:** The indicator appears in the existing Fraud Indicators section of the Forensic Audit Report under a new sub-heading "Contact Geometry." No new report section is required at this stage.

**Schema change:** One new optional field `contactGeometryFlag: boolean` on `Stage8Output`. All existing fields are untouched. The flag is `true` when any contact geometry indicator fires, `false` otherwise. This field can be used as a filter in the claim list portal immediately.

**Tests required:**
- CPR fires correctly for a full-width frontal claim with `damageFractionEstimate: 0.18`.
- CPR does not fire for a full-width frontal claim with `damageFractionEstimate: 0.65`.
- CPR returns `INSUFFICIENT_DATA` when `visionSourceReliability` is LOW.
- CPR returns `INSUFFICIENT_DATA` when the vehicle has no geometry DB record.
- CPR does not fire for a pole impact with `damageFractionEstimate: 0.10` (consistent with scenario).

**Owner:** Tavonga Shoko.

**Effort:** 2–3 days (implementation + tests + report integration).

### 3.3 Action 3: Patent Claims Update

**What it is:** Update the provisional patent claims document (`KINGA-Patent-Claims-Draft.md`) to add CGI as a fifth invention, with independent and dependent claims covering the Contact Patch Ratio indicator and the broader CGI architecture. The TDR provides the technical narrative; the patent claims document provides the claim language.

**Why now:** The provisional patent filing establishes the priority date. CGI must be in the provisional before any public disclosure of the capability (including the pitch deck or any press coverage).

**Deliverable:** Updated `KINGA-Patent-Claims-Draft.md` with CGI claims (Invention 5, claims 24–30), committed to GitHub.

**Owner:** Tavonga Shoko.

**Effort:** Half a day.

---

## 4. Phase 2 — v1.1 (Post Three Months of Production Data)

**Objective:** Build the full CGI engine as a first-class intelligence domain, calibrated against real claim outcomes from the production system.

**Target completion:** Three months after v1.0 production deployment.

**Estimated engineering effort:** 2–3 weeks.

**Prerequisite:** A minimum of 200 processed claims in production, with at least 30 claims where the Contact Patch Ratio indicator fired. This sample is needed to validate the thresholds and weights before building the full engine.

### 4.1 Stage Renumbering

Before building the full CGI engine, the pipeline stages should be renumbered to give CGI a first-class position:

| Current | New | Engine |
|---|---|---|
| Stage 8 | Stage 8 | Fraud Scoring (unchanged) |
| Stage 8.5 (new) | Stage 9 | Contact Geometry Intelligence |
| Stage 9 | Stage 10 | Cost Optimisation |

This renumbering is a breaking change to test files, log messages, report section references, and documentation. It should be done as a single dedicated PR with a comprehensive find-and-replace pass, not incrementally.

### 4.2 Full CGI Engine — Three Layers

The full CGI engine produces indicators in three layers, as defined in the architectural review.

**Layer 1 — Geometry Indicators** (pure measurement, no weighting required):

| Indicator | Formula | Data sources |
|---|---|---|
| Contact Patch Ratio (CPR) | `A_observed / A_expected` | Stage 6 `damageFractionEstimate`, geometry DB |
| Offset Percentage | `contact_centroid_y / (bumper_width / 2)` | VGR per-image crush depth distribution, geometry DB |
| Crush-to-Width Ratio | `crushDepthM / contact_patch_width_m` | VGR consensus, geometry DB |
| Crush-to-Height Ratio | `crushDepthM / contact_patch_height_m` | VGR consensus, geometry DB |
| Contact Symmetry Score | `1 - |left_crush - right_crush| / max(left, right)` | VGR per-image breakdown |
| Contact Centroid | Lateral position of damage centre relative to vehicle centreline | VGR per-image, geometry DB |
| Vertical Alignment | Bumper height match between stated vehicle and counterpart | geometry DB, Stage 3 extraction |

**Layer 2 — Structural Intelligence Indicators** (derived engineering metrics):

| Indicator | Formula | Data sources |
|---|---|---|
| Force Density Index | `(k × crushDepthM) / A_contact` | Stage 7 stiffness, VGR, Layer 1 CPR |
| Local Energy Density | `deformationEnergyJ / A_contact` | Stage 6 `deformationEnergyJ`, Layer 1 CPR |
| Structural Loading Severity | `k × crushDepthM` (peak force in kN) | Stage 7 stiffness, VGR |
| Progressive Collapse Probability | `f(forceDensityIndex, structuralDamageFlag)` | Layer 2 FDI, Stage 6 structural flag |
| Hidden Damage Probability | `f(forceDensityIndex, structuralLoadingSeverity, crushToAreaRatio)` | Layer 2 FDI + SLS + Layer 1 CAR |

**Layer 3 — Forensic Conclusions** (human-readable, adjuster-facing):

Layer 3 is not a set of additional calculations. It is a structured interpretation of Layer 1 and Layer 2 outputs, expressed as a set of boolean findings that map directly to adjuster decisions:

- Geometry supports claimant narrative
- Geometry contradicts claimant narrative
- Offset impact likely (when Contact Symmetry Score < 0.6)
- Underride/override likely (when Vertical Alignment mismatch > 150 mm)
- Secondary impact likely (when Contact Symmetry Score < 0.3 and damagedZoneCount > 1)
- Multiple impacts likely (when damagedZoneCount > 2 and CPR > 0.85)
- Hidden structural inspection recommended (when Hidden Damage Probability > 0.65)

### 4.3 Integration Points for the Full Engine

**Stage 8 (Fraud Scoring):** All Layer 1 and Layer 2 indicators that indicate geometric incoherence contribute `FraudIndicator` entries with `category: "contact_geometry"`. The existing fraud score aggregation picks them up automatically.

**Stage 10 (Cost Engine, formerly Stage 9):** The `hiddenDamageProbability` output from Layer 2 replaces the current fixed-lookup latent damage probability table. This makes the reserve estimate physics-derived rather than severity-class-derived.

**Report Renderer:** A new Section 2B is added to the Forensic Audit Report: "Contact Geometry Analysis." It contains the Layer 1 indicator table, the Layer 3 forensic conclusions, and the contact patch visualisation (see Section 4.4 below). The section is included in the Forensic Audit Report and Executive Summary tiers but not the Basic Assessment tier.

**TRE (Total Risk Engine):** The `geometryCoherenceVerdict` (COHERENT / PARTIALLY_COHERENT / INCOHERENT) is added as a top-level input to the TRE alongside the fraud score, cost deviation, and speed plausibility. This allows the TRE to weight geometric incoherence independently from pattern-based fraud signals.

**Benchmark Learning Loop:** When a claim is finalised, the CGI indicator values are stored alongside the outcome in `component_repair_outcomes`. This builds the calibration dataset needed to validate and refine the indicator thresholds and weights against real outcomes.

### 4.4 Contact Patch Visualisation

The contact patch visualisation is a static SVG generated deterministically from the geometry database and the CGI Layer 1 outputs. It shows:

- The vehicle's front (or rear, or side) face as a rectangle, scaled from `bumper_width_mm` and `front_bumper_height_mm`.
- The expected contact zone as a shaded rectangle, sized from the expected CPR for the stated collision type.
- The observed contact zone as a differently-shaded rectangle, sized from `A_observed`.
- An overlap percentage label.

This is not an AI-generated image. It is a deterministic SVG built from known dimensions. It renders in under 1 millisecond. Adjusters will understand the finding in five seconds without reading any numbers.

---

## 5. Phase 3 — v2.0 (Long-Term)

**Objective:** Elevate CGI to a platform capability that serves not only fraud detection but also repair estimation, litigation support, subrogation, salvage decisions, fleet analytics, and portfolio intelligence.

**Target completion:** v2.0 roadmap (date to be determined based on production experience).

### 5.1 CGI as a Standalone API

In v2.0, CGI should be exposed as a standalone API endpoint — not just a pipeline stage. This allows:
- External assessors to submit a vehicle make/model, collision direction, crush depth, and damage fraction and receive a geometry coherence assessment without running the full KINGA pipeline.
- Fleet operators to run CGI assessments on historical claims data to identify patterns of geometric incoherence across their portfolio.
- Litigation support teams to request a CGI assessment for a specific claim as a standalone forensic report.

### 5.2 M3 Re-evaluation

The M3 method stub should be retained in the codebase with a comment referencing TDR-001. It should be re-evaluated when any of the following become available:
- LiDAR-derived contact volume measurements from physical inspections.
- Event Data Recorder (EDR) data from the vehicle's crash data recorder.
- Photogrammetric 3D reconstruction producing a deformation volume estimate.
- Finite element approximations from structural analysis software.

Under any of these conditions, M3 can be re-enabled as a genuinely independent speed-estimation method because the contact patch area would be a measured input rather than a model-derived estimate.

### 5.3 Vehicle Compatibility Score

The Vehicle Compatibility Score — which assesses the bumper height mismatch between the claimant's vehicle and the stated counterpart vehicle — requires the counterpart vehicle's geometry data. This is only possible when the counterpart vehicle is identified and its make/model is in the geometry database. In v2.0, when third-party claim data is available, this indicator becomes computable and should be added to the CGI engine.

---

## 6. Success Criteria

The following criteria define success for each phase.

**Phase 1:**
- TDR-001 committed to GitHub and referenced in the patent claims document.
- Contact Patch Ratio indicator passing all five specified tests.
- `contactGeometryFlag` field present in `Stage8Output` and visible in the claim list portal filter.
- Updated patent claims document filed with patent attorney for provisional application.
- Zero increase in median claim analysis time (measured against v1.0 baseline).

**Phase 2:**
- Full CGI engine passing a minimum of 40 unit tests covering all Layer 1 and Layer 2 indicators.
- Contact patch visualisation rendering correctly in the Forensic Audit Report for at least 80% of claims (those with HIGH or MEDIUM vision source reliability and a geometry DB record).
- `hiddenDamageProbability` replacing the fixed latent damage lookup in the cost engine, with a measurable reduction in supplementary claim frequency (target: ≥ 10% reduction over the first quarter of v1.1 production).
- CGI indicator weights calibrated against a minimum of 200 production claims.

**Phase 3:**
- CGI standalone API documented and available to external assessors and fleet operators.
- M3 re-evaluation criteria documented and reviewed against available data sources.
- Vehicle Compatibility Score implemented for claims where counterpart vehicle data is available.

---

## 7. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `damageFractionEstimate` omitted by Stage 6 LLM for the primary impact component | Medium | CPR returns INSUFFICIENT_DATA — no false flag, but reduced coverage | Monitor omission rate in production; adjust Stage 6 prompt if omission rate > 30% |
| Vehicle not in geometry DB — CPR cannot run | Medium | CPR returns INSUFFICIENT_DATA | Prioritise geometry DB expansion for the 20 most common vehicles in the claim portfolio |
| CPR threshold too aggressive — false positives on legitimate claims | Low | Adjuster friction; potential insurer complaints | Phase 1 threshold is conservative (< 0.40 for full-width frontal); review after 200 claims |
| Stage renumbering in Phase 2 introduces regressions | Medium | Test failures; report section errors | Dedicated renumbering PR with full test run before merging |
| Patent prior-art search reveals existing CGI-equivalent system | Low | Weakens patent position | Prior-art search commissioned before full patent filing (provisional already filed) |

---

## 8. Immediate Next Steps

The following actions are to be completed before v1.0 production deployment, in sequence:

1. **Write TDR-001** (`docs/TDR-001-M3-Retirement-and-CGI-Architecture.md`) — half a day.
2. **Implement Contact Patch Ratio indicator** in Stage 8 fraud scoring — 2 days.
3. **Write five CPR tests** — half a day.
4. **Update patent claims document** with CGI as Invention 5 (claims 24–30) — half a day.
5. **Commit all four deliverables to GitHub** and save checkpoint — 1 hour.
6. **Send updated patent claims to patent attorney** for provisional filing — same day as step 5.

Total estimated effort: 3.5–4 days.

---

*Document ends.*

*Next document in this series: TDR-001 — M3 Retirement and CGI Architecture.*
