# TDR-001 — M3 Retirement and Contact Geometry Intelligence Architecture

**Document Reference:** KINGA-TDR-001  
**Author:** Tavonga Shoko (Lead Engineer)  
**Date:** 5 August 2026  
**Status:** Accepted  
**Classification:** Internal — Engineering

---

## 1. Context

The KINGA speed inference ensemble (M1–M7) contains a stub for M3 — the Impulse-Momentum method — which has been disabled since the ensemble was first built. The stub carries the comment:

> *"M3 — Impulse-Momentum Damage contact patch area — Disabled 0 — requires primary contact patch area, this formula has been disabled."*

During the v1.0 pre-production review, the question was raised whether M3 could be re-enabled using KINGA's existing photogrammetric (VGE) and vehicle geometry database capabilities. This TDR records the outcome of that investigation and the architectural decision that followed.

---

## 2. The M3 Formula and What It Requires

The impulse-momentum theorem applied to a vehicle collision states:

> **Δv = F × Δt / m**

Where **F** is the average contact force during impact, **Δt** is the contact duration, and **m** is the vehicle mass. To solve for Δv (impact speed), both F and Δt must be estimated from physical evidence.

The standard approach for estimating F from photographic evidence is:

> **F = P × A_contact**

Where **P** is the contact pressure (derived from material yield strength) and **A_contact** is the primary contact patch area — the area of the vehicle surface actively resisting the impact at peak force. This is the measurement that M3 requires and that KINGA cannot obtain directly from its current evidence base.

---

## 3. Investigation: Can KINGA Derive A_contact?

The investigation examined whether KINGA's existing capabilities could supply a reliable contact patch area estimate without new data sources.

### 3.1 Available Data

The following data is available within the existing pipeline:

| Data | Source | Relevance to A_contact |
|---|---|---|
| `bumper_width_mm` | `vehicle_geometry_measurements` DB | Maximum contact width for frontal impact |
| `front_bumper_height_mm` | `vehicle_geometry_measurements` DB | Maximum contact height for frontal impact |
| `damageFractionEstimate` per component | Stage 6 LLM vision analysis | Fraction of panel surface visibly damaged |
| `PANEL_AREAS` lookup | `vehiclePanelDimensions.ts` | Total panel surface area by body type |
| VGR consensus crush depth | Stage 6.5B | Depth of deformation — not width |
| `collisionDirection` | Stage 3 structured extraction | Identifies which panel face is the contact surface |

### 3.2 The Derivable Estimate

Combining the geometry database with the Stage 6 damage fraction, a bounded contact patch area estimate is derivable:

> **A_contact ≈ bumper_width_mm × front_bumper_height_mm × damageFractionEstimate_bumper**

This gives the fraction of the bumper face that is deformed, which is a reasonable proxy for the contact patch area in a full-width or partial-width frontal impact.

### 3.3 The Problem: Contact Duration

Even with A_contact, Δt is still required. The standard approximation for contact duration from the stiffness model is:

> **Δt ≈ π × √(m / k)**

Where k is the structural stiffness in N/m. This is the natural period of a mass-spring system — the standard approximation for contact duration in a crash. Both m (vehicle mass) and k (stiffness, from `getStiffnessKnm`) are already available in the ensemble.

### 3.4 The Critical Finding: M3 Reduces to a Variant of M1

Substituting the stiffness-derived force and duration estimates into the impulse-momentum formula:

> **F = k × crushDepthM** (force from stiffness model)  
> **Δt = π × √(m / k)** (contact duration from stiffness model)  
> **Δv = F × Δt / m = (k × C × π × √(m/k)) / m = π × C × √(k/m)**

This simplifies to:

> **Δv = π × C × √(k/m)**

This is structurally equivalent to the Campbell formula (M1), which computes:

> **Δv = √(2 × (0.5 × k × C²) / m) × 3.6 = C × √(k/m) × 3.6**

The two formulas differ only by a constant factor (π vs. 3.6 × √2 ≈ 5.09, compared to π ≈ 3.14). Both use the same physical inputs — crush depth C, stiffness k, and mass m — and the same underlying model. **Contact patch area drops out entirely when the stiffness model is used to estimate both force and contact duration.**

This is not a universal property of the impulse-momentum formula. Contact area remains relevant in other formulations — for example, when contact pressure is measured independently (as in material yield tests), or when contact duration is measured directly (as in EDR data). The statement is specific to the stiffness-derived formulation used here.

### 3.5 Conclusion on M3 Re-enablement

M3 cannot be re-enabled as an **independent** speed-estimation method given KINGA's current evidence base. Any M3 formulation that uses KINGA's available data reduces to a variant of M1 with additional assumptions layered on top. Adding M3 to the ensemble would introduce a method that is mathematically correlated with M1, overstating the independence of the consensus and potentially biasing the weighted average.

The value of the ensemble comes from orthogonal evidence — different physical phenomena measured independently. M3 in its current derivable form does not meet that criterion.

---

## 4. The Correct Destination for Contact Geometry Data

The investigation revealed that while contact patch area cannot serve as an independent speed estimator, it has significant value as a **forensic coherence signal**. The key insight is:

> Instead of asking "How fast was the vehicle?", contact geometry data enables the question: "Is this collision geometry physically plausible?"

This is a stronger forensic question. A finding that the observed contact patch fraction is 18% when the stated full-width frontal impact requires a minimum of 55% is a falsifiable physical statement — one that is directly usable in dispute resolution, repudiation letters, and court submissions.

This capability is designated **Contact Geometry Intelligence (CGI)** and is defined as a separate intelligence domain within the KINGA architecture. See Section 6 for the full CGI architecture.

---

## 5. Decision

### 5.1 M3 Status

M3 is **retired in its current implementation**. The method stub is retained in `speedInferenceEnsemble.ts` with a weight of 0 and a comment referencing this TDR. It is not deleted because the method may become viable in a future implementation under different evidence conditions (see Section 5.2).

The method description in the stub is updated from:

> *"requires primary contact patch area, this formula has been disabled"*

To:

> *"Retired in current implementation — see TDR-001. The stiffness-derived impulse formulation reduces to a variant of M1 (Campbell). M3 becomes viable as an independent method when contact patch area is a measured input rather than a model-derived estimate. Re-evaluate when LiDAR, EDR, or photogrammetric 3D reconstruction data is available."*

### 5.2 Conditions for M3 Re-evaluation

M3 should be re-evaluated when any of the following evidence sources become available:

| Evidence source | What it provides | Why it makes M3 independent |
|---|---|---|
| LiDAR scan from physical inspection | 3D deformation volume and contact boundary | Contact patch area is a direct measurement, not a model estimate |
| Event Data Recorder (EDR) data | Delta-V directly from the vehicle's crash data recorder | M3 is not needed — EDR provides Δv directly |
| Photogrammetric 3D reconstruction | Deformation volume from calibrated multi-angle photographs | Contact patch area derivable from 3D surface reconstruction |
| Finite element approximation | Structural collapse simulation from known geometry and material properties | Contact pressure is computed independently of the stiffness model |

### 5.3 Contact Geometry Intelligence

The contact geometry capability is implemented as CGI — a new intelligence domain within the KINGA architecture. Phase 1 of CGI (the Contact Patch Ratio indicator) is implemented in Stage 8 as a new `FraudIndicator` with `category: "contact_geometry"`. The full CGI engine is deferred to v1.1 after production calibration data is available. See `KINGA-CGI-Plan-of-Action.md` for the full phased plan.

---

## 6. CGI Architecture Overview

CGI is positioned between Physics Intelligence and Risk Intelligence in the KINGA intelligence domain architecture:

```
Vision Intelligence  →  Physics Intelligence  →  Geometry Intelligence (CGI)
                                                          ↓
                                               Risk Intelligence (TRE)
                                                          ↓
                                              Commercial Intelligence
```

CGI takes the outputs of the vision and physics engines and produces geometric coherence evidence. Its outputs are consumed by:

- **Stage 8 (Fraud Scoring):** CGI indicators contribute `FraudIndicator` entries with `category: "contact_geometry"`.
- **Stage 9 (Cost Engine):** `hiddenDamageProbability` from CGI Layer 2 replaces the fixed latent damage lookup table (v1.1).
- **Report Renderer:** A geometry coherence section is added to the Forensic Audit Report (v1.1).
- **TRE:** `geometryCoherenceVerdict` is added as a top-level risk signal (v1.1).
- **Benchmark Learning Loop:** CGI indicator values are stored with finalised outcomes for calibration (v1.1).

The full three-layer CGI architecture (Layer 1: Geometry, Layer 2: Structural Intelligence, Layer 3: Forensic Conclusions) is defined in `KINGA-CGI-Plan-of-Action.md`.

---

## 7. Patent Implications

The CGI architecture — specifically the combination of calibrated vehicle geometry database, AI-derived per-component damage fractions, VGR consensus crush depth, and collision direction to produce a contact geometry coherence verdict — is a novel technical contribution. It is added to the KINGA provisional patent claims as Invention 5 in `KINGA-Patent-Claims-Draft.md`.

The M3 retirement decision is documented here as a prior-art record establishing that the contact geometry capability was deliberately designed as a forensic coherence engine rather than a speed estimator, and that this design choice was made on the basis of a rigorous analysis of the available evidence base.

---

## 8. References

- `server/pipeline-v2/speedInferenceEnsemble.ts` — M3 stub and Campbell formula implementation
- `server/pipeline-v2/vehiclePanelDimensions.ts` — Panel area lookup table
- `server/pipeline-v2/stage-7-physics.ts` — `totalDamageAreaM2` resolution and ensemble input construction
- `drizzle/schema.ts` — `vehicle_geometry_measurements` table schema
- `docs/KINGA-CGI-Plan-of-Action.md` — Full phased CGI implementation plan
- `KINGA-Patent-Claims-Draft.md` — Patent claims including CGI as Invention 5
- SAE 2002-01-0547 (Varat & Husher, 2002) — Accident type multipliers and deformation efficiency factors
- IIHS Full-Width Rigid Barrier Test Protocol — Contact patch fraction thresholds
- Euro NCAP Offset Deformable Barrier Test Protocol — Offset impact contact fraction thresholds

---

*Document ends.*
