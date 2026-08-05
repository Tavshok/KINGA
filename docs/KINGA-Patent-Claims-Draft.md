# KINGA Technologies  
## Provisional Patent Claims — Draft for Attorney Review

**Document Reference:** KINGA-PATENT-PROV-001  
**Prepared by:** Tavonga Shoko (Lead Engineer)  
**Date:** August 2026  
**Status:** Provisional draft — for filing priority date establishment and attorney review

---

> **Purpose of this document.** This document sets out draft patent claim language for four core inventions embodied in the KINGA motor claims assessment platform. It is intended to be filed as a provisional patent application in Zimbabwe (Zimbabwe Intellectual Property Office, ZIPO) and South Africa (Companies and Intellectual Property Commission, CIPC) to establish a priority date. A provisional application does not require finalised claims and is not examined — its purpose is to secure the filing date. The applicant has twelve months from the provisional filing date to file a complete application. This document should be reviewed and finalised by a patent attorney before filing.

---

## Invention 1: Multi-Method Speed Inference Ensemble for Motor Vehicle Collision Analysis

### Abstract

A computer-implemented system and method for inferring the speed of a motor vehicle at the time of a collision by executing a plurality of independent estimation methods in parallel, applying a weighted consensus algorithm with dynamic outlier rejection, detecting physical impossibility conditions, and generating a structured speed estimate with confidence bounds and divergence diagnostics. The system includes an anti-circularity mechanism that prevents a damage-severity-anchored estimation method from incorporating crush depth values that were themselves derived from a prior speed estimate, thereby avoiding circular reasoning in the speed inference chain.

### Field of the Invention

The invention relates to computer-implemented forensic reconstruction systems for motor vehicle collision analysis, and more particularly to systems that infer vehicle impact speed from physical evidence using a multi-method weighted ensemble with anti-circularity safeguards.

### Background

Existing motor vehicle collision analysis systems typically rely on a single estimation method — most commonly the Campbell crush energy model — to infer impact speed from observed damage. Single-method systems are vulnerable to measurement error, evidence gaps, and the circular dependency that arises when a damage-severity estimate is used both as an input to a speed inference method and as a cross-check of that method's output. No prior system known to the applicant combines multiple independent estimation methods in a weighted ensemble with dynamic outlier rejection, a structured anti-circularity guard, and a physical impossibility detection mechanism operating on the post-consensus result.

### Brief Description of the System

The system executes up to seven estimation methods (M1–M7), each producing a point estimate, a confidence weight, and a boolean `ran` flag indicating whether the method had sufficient evidence to produce a valid estimate. The methods are:

- **M1 (Campbell crush energy model):** derives speed from measured crush depth and vehicle-specific stiffness coefficients. Operates in two modes: `depthSource='measured'` (high confidence, full weight) and `depthSource='inferred'` (low confidence, excluded from consensus).
- **M2 (Energy dissipation model):** derives speed from estimated energy absorbed by vehicle structure.
- **M3 (Momentum conservation):** applies conservation of momentum to multi-vehicle collisions.
- **M4 (Deployment threshold):** derives a hard lower bound from airbag or seatbelt pretensioner deployment evidence, using published FMVSS 208 deployment thresholds. Applies a 0.6 weight reduction for non-barrier impacts.
- **M5 (Structural deformation index):** derives speed from the pattern and extent of structural deformation. Weight is fixed at 0.10 to prevent double-counting with M1, which shares the crush depth input.
- **M6 (Severity-anchored inference):** derives speed from crash energy signature data for the observed damage severity category. Excluded from consensus when its input crush depth is derived from an inferred (not measured) value, preventing circular reasoning.
- **M7 (Claimant-stated speed):** incorporates the driver's stated speed as a corroborating signal with weight 0.30, subject to a plausibility gate (valid range 5–250 km/h). Excluded from the physics consensus; a separate deviation flag reports the gap between the stated speed and the physics-only consensus.

The consensus algorithm: (1) collects all methods where `ran=true` and `confidenceWeight > 0`; (2) computes an initial weighted mean; (3) applies outlier rejection by down-weighting methods more than two standard deviations from the initial mean by 50%; (4) recomputes the weighted mean to produce the consensus speed; (5) applies a post-consensus physical impossibility check — if the consensus speed is below the deployment-confirmed hard lower bound, a `physicalImpossibilityFlag` is raised with the gap value; (6) computes a 90% confidence interval as ± (weighted standard deviation × 1.645); (7) raises a `highDivergence` flag with a structured explanation when method outputs diverge materially.

### Claims

**Claim 1 (Independent — System).** A computer-implemented system for inferring the impact speed of a motor vehicle in a collision, comprising:

a processor configured to execute a plurality of independent speed estimation methods in parallel, each method producing a speed estimate in kilometres per hour, a confidence weight, and a boolean indicator of whether the method produced a valid estimate for the available evidence;

a consensus module configured to compute a weighted mean of the speed estimates produced by methods having a valid estimate and a positive confidence weight, apply outlier rejection by reducing the weight of estimates deviating more than two standard deviations from an initial weighted mean, and recompute the weighted mean to produce a consensus speed estimate;

an anti-circularity module configured to detect when a damage-severity-anchored estimation method has received a crush depth value that was derived from a prior speed estimate rather than from a direct physical measurement, and to exclude that method from the consensus computation when such a condition is detected;

a physical impossibility detection module configured to compare the consensus speed estimate against a hard lower bound derived from vehicle safety system deployment evidence, and to generate a physical impossibility flag with a gap value when the consensus speed falls below that bound; and

an output module configured to produce a structured speed inference result comprising the consensus speed, a confidence interval, a divergence indicator, and the physical impossibility flag where applicable.

**Claim 2 (Dependent on Claim 1).** The system of Claim 1, wherein the plurality of independent speed estimation methods includes a Campbell crush energy method operating in a measured-depth mode and an inferred-depth mode, wherein the inferred-depth mode assigns a confidence weight of zero, excluding the method from the consensus computation.

**Claim 3 (Dependent on Claim 1).** The system of Claim 1, wherein the plurality of independent speed estimation methods includes a deployment threshold method that derives a hard lower bound from airbag deployment evidence using published Federal Motor Vehicle Safety Standard 208 deployment thresholds, and applies a weight reduction factor for non-barrier impact configurations.

**Claim 4 (Dependent on Claim 1).** The system of Claim 1, wherein the plurality of independent speed estimation methods includes a structural deformation index method whose confidence weight is fixed at a value that prevents it from dominating the consensus when a crush energy method is also contributing, to avoid double-counting of the shared crush depth input.

**Claim 5 (Dependent on Claim 1).** The system of Claim 1, wherein the output module further produces a claimant-stated speed deviation flag comprising the stated speed, the physics-only consensus speed, the deviation in kilometres per hour and as a percentage, and a human-readable interpretation of the deviation.

**Claim 6 (Dependent on Claim 1).** The system of Claim 1, wherein the consensus module raises a high-divergence indicator with a structured explanation of the source of divergence when the spread of contributing method estimates exceeds a threshold.

**Claim 7 (Independent — Method).** A computer-implemented method for inferring the impact speed of a motor vehicle in a collision, comprising:

executing, by a processor, a plurality of independent speed estimation methods in parallel, each producing a speed estimate, a confidence weight, and a validity indicator;

detecting, by the processor, a circular dependency condition in which a damage-severity-anchored estimation method has received a crush depth value derived from a prior speed estimate, and excluding that method from a consensus computation when the condition is detected;

computing, by the processor, a weighted consensus speed estimate from the remaining valid method outputs, applying outlier rejection to down-weight estimates deviating materially from an initial weighted mean;

comparing, by the processor, the consensus speed estimate against a hard lower bound derived from vehicle safety system deployment evidence, and generating a physical impossibility indicator when the consensus speed falls below that bound; and

outputting a structured speed inference result comprising the consensus speed, a confidence interval, and the physical impossibility indicator.

---

## Invention 2: Bidirectional Vehicle Physics Model for Collision Damage Verification

### Abstract

A computer-implemented system and method for verifying the physical consistency of a motor vehicle collision claim by operating a vehicle physics model in two directions: a forward direction that predicts the expected damage profile from a known or estimated impact speed, and a reverse direction that reconstructs the implied impact speed from observed damage. The system uses the outputs of both directions to cross-validate the claim, detecting inconsistencies between the stated speed, the predicted damage, and the observed damage that would not be detectable by either direction alone.

### Field of the Invention

The invention relates to computer-implemented forensic verification systems for motor vehicle collision claims, and more particularly to systems that apply a bidirectional physics model to detect speed-damage inconsistencies in insurance claim assessments.

### Background

Existing collision analysis systems operate in a single direction: either predicting damage from a known speed, or inferring speed from observed damage. Operating in only one direction limits the system's ability to detect inconsistencies — a fraudulent claim may present a speed and a damage profile that are individually plausible but mutually inconsistent. No prior system known to the applicant applies a vehicle physics model in both directions simultaneously within a single assessment pipeline and uses the cross-validation between the two directions as a fraud and consistency signal.

### Brief Description of the System

The Vehicle Geometry Engine (VGE) operates in the forward direction: given an impact speed and vehicle parameters (mass, stiffness coefficients, geometry), it predicts the expected crush depth, deformation zone, and damage severity. The Vehicle Geometry Reconstructor (VGR) operates in the reverse direction: given observed crush depth and damage evidence, it reconstructs the implied impact speed. The system compares the VGE-predicted damage against the observed damage, and compares the VGR-reconstructed speed against the stated speed and the VGE-input speed. Deviations between the predicted and observed values, and between the reconstructed and stated speeds, are reported as structured consistency signals fed into the downstream fraud-scoring pipeline.

### Claims

**Claim 8 (Independent — System).** A computer-implemented system for verifying the physical consistency of a motor vehicle collision claim, comprising:

a forward physics module configured to receive an impact speed estimate and vehicle parameters and to compute a predicted damage profile comprising at least a predicted crush depth and a predicted damage severity;

a reverse physics module configured to receive observed damage evidence comprising at least a measured or estimated crush depth and to reconstruct an implied impact speed;

a cross-validation module configured to compare the predicted damage profile from the forward physics module against the observed damage evidence, and to compare the reconstructed impact speed from the reverse physics module against the stated impact speed and the input speed to the forward physics module; and

an output module configured to produce a structured consistency report comprising at least a speed-damage consistency indicator, a deviation value between the reconstructed and stated speeds, and a human-readable interpretation of any detected inconsistency.

**Claim 9 (Dependent on Claim 8).** The system of Claim 8, wherein the forward physics module applies vehicle-class-specific stiffness coefficients to compute the predicted crush depth, and wherein the reverse physics module applies the same stiffness coefficients in the inverse computation to reconstruct the implied speed, ensuring that the two directions share a common physical model.

**Claim 10 (Dependent on Claim 8).** The system of Claim 8, wherein the cross-validation module classifies the speed-damage relationship into one of a plurality of consistency categories comprising at least: consistent, minor inconsistency, material inconsistency, and significant inconsistency, based on the percentage deviation between the reconstructed speed and the stated speed.

**Claim 11 (Dependent on Claim 8).** The system of Claim 8, wherein the output module further produces a staged accident indicator when the observed damage pattern is inconsistent with the stated speed in a manner characteristic of pre-existing or artificially inflicted damage.

**Claim 12 (Independent — Method).** A computer-implemented method for verifying the physical consistency of a motor vehicle collision claim, comprising:

computing, by a processor, a predicted damage profile from an impact speed estimate and vehicle parameters using a forward vehicle physics model;

reconstructing, by the processor, an implied impact speed from observed damage evidence using a reverse vehicle physics model that is the mathematical inverse of the forward model;

comparing, by the processor, the predicted damage profile against the observed damage evidence to produce a damage consistency indicator; and

comparing, by the processor, the reconstructed implied speed against the stated impact speed to produce a speed consistency indicator, wherein both indicators are reported as structured outputs for use in downstream claim assessment.

---

## Invention 3: Integrated Cross-Validation and Fraud-Scoring Pipeline for Motor Insurance Claims

### Abstract

A computer-implemented system and method for detecting fraudulent motor insurance claims by first cross-validating repair quotation line items against photographic damage evidence using a computer vision analysis, and then feeding the cross-validation results as structured signals into a multi-factor fraud-scoring engine that produces a tiered risk classification. The system distinguishes between externally visible and internally hidden vehicle components when evaluating whether a quoted repair item should be visible in photographs, preventing false fraud signals for legitimately hidden damage.

### Field of the Invention

The invention relates to computer-implemented fraud detection systems for motor insurance claims, and more particularly to systems that combine photographic evidence analysis with repair quotation cross-validation and multi-factor fraud scoring in an integrated pipeline.

### Background

Existing insurance fraud detection systems typically apply fraud scoring rules to claim metadata (claim amount, claimant history, incident characteristics) without cross-validating the specific repair items quoted against photographic evidence of the damage. No prior system known to the applicant integrates a component-level cross-validation of repair quotations against computer-vision-analysed photographs, with explicit handling of the visibility distinction between external and internal vehicle components, as a structured input signal to a downstream fraud-scoring engine.

### Brief Description of the System

The cross-validation engine receives a list of quoted repair parts (from the panel beater quotation) and a set of damage photographs. For each quoted part, the engine: (1) resolves the part name to a canonical vehicle component identifier; (2) determines whether the part is externally visible or internally hidden; (3) invokes a computer vision analysis of the photographs to determine whether the part's damage is visible; (4) classifies the part into one of four categories: `confirmed` (quoted and visible), `quoted_not_visible` (quoted but not visible in photos — risk signal for external parts, legitimate for internal parts), `visible_not_quoted` (visible damage not quoted — possible underquoting), or `unaffected`. The cross-validation report, including a `photoMetadataScore` reflecting the quality and confidence of the photographic evidence, is passed as a structured input to the fraud-scoring engine. The fraud-scoring engine combines this signal with vehicle-level physics consistency signals, claimant history signals, incident narrative signals, and temporal signals to produce a composite fraud score and a five-level risk band (minimal, low, moderate, high, critical).

### Claims

**Claim 13 (Independent — System).** A computer-implemented system for detecting fraudulent motor insurance claims, comprising:

a cross-validation module configured to receive a list of quoted repair parts from a repair quotation and a set of damage photographs, and for each quoted part to: resolve the part name to a canonical vehicle component identifier; determine whether the part is classified as externally visible or internally hidden on the vehicle; invoke a computer vision analysis of the photographs to determine whether damage to the part is visible; and classify the part into one of a plurality of validation categories based on the combination of whether the part was quoted and whether its damage was visible in the photographs;

a visibility-awareness module configured to apply different risk interpretations to the same validation category depending on whether the part is externally visible or internally hidden, such that a quoted-but-not-visible classification generates a fraud risk signal for external parts but not for internal parts; and

a fraud-scoring module configured to receive the cross-validation report as a structured input signal and to combine it with a plurality of additional claim signals to produce a composite fraud score and a tiered risk classification.

**Claim 14 (Dependent on Claim 13).** The system of Claim 13, wherein the cross-validation module further computes a photographic evidence quality score reflecting the resolution, lighting, and coverage of the damage photographs, and wherein the fraud-scoring module incorporates this quality score as a signal indicating the reliability of the cross-validation result.

**Claim 15 (Dependent on Claim 13).** The system of Claim 13, wherein the cross-validation module detects a false-pass condition when the photographic evidence quality score falls below a threshold and all quoted parts are classified as confirmed, and wherein the system flags the cross-validation result as inconclusive rather than clean under this condition.

**Claim 16 (Dependent on Claim 13).** The system of Claim 13, wherein the fraud-scoring module produces a five-level risk band comprising at least: minimal risk, low risk, moderate risk, high risk, and critical risk, and wherein claims classified at or above a threshold risk level are excluded from downstream benchmark data recording to prevent contamination of the calibration dataset.

**Claim 17 (Independent — Method).** A computer-implemented method for detecting fraudulent motor insurance claims, comprising:

receiving, by a processor, a list of quoted repair parts and a set of damage photographs;

for each quoted repair part, determining, by the processor, whether the part is externally visible or internally hidden on the vehicle, and invoking a computer vision analysis to determine whether damage to the part is visible in the photographs;

classifying, by the processor, each part into a validation category based on the combination of quoted status and photographic visibility, and applying a visibility-aware risk interpretation that distinguishes between external and internal parts; and

combining, by the processor, the cross-validation results with a plurality of additional claim signals in a fraud-scoring computation to produce a composite fraud score and a tiered risk classification.

---

## Invention 4: Fraud-Gated Benchmark Learning System for Motor Insurance Cost Calibration

### Abstract

A computer-implemented system and method for maintaining a self-calibrating benchmark dataset of motor vehicle repair costs, in which the write path to the benchmark dataset is gated by a fraud risk score, preventing the contamination of the calibration dataset with outcomes from claims that have been assessed as having a material fraud risk. The system supports two write paths: an automated finalization path that records the system's cost assessment at the point of claim completion, and an adjuster correction path that allows a human adjuster to overwrite the automated record with a verified outcome, with the adjuster correction taking precedence over the automated record.

### Field of the Invention

The invention relates to self-calibrating cost estimation systems for motor insurance claims, and more particularly to systems that maintain a benchmark dataset of component repair costs with a fraud-gated write path and a human-adjuster correction mechanism.

### Background

Existing insurance cost estimation systems that learn from historical outcomes do not apply a fraud gate to the write path of the learning dataset. As a result, fraudulent or inflated claims that are paid out contaminate the calibration dataset, causing the system to learn inflated cost norms over time. No prior system known to the applicant implements a fraud-score-gated write path to a benchmark learning dataset, combined with a human adjuster correction mechanism that allows verified outcomes to overwrite automated records.

### Brief Description of the System

The system maintains a `component_repair_outcomes` table recording, for each claim component, the repair action taken, the actual cost, the currency, and the source (automated finalization or adjuster correction). The write path applies the G-1 fraud guard: before writing any record, the system queries the claim's fraud risk score; if the score is 50 or above, the write is skipped and a reason is logged. If the database connection is unavailable or the guard query fails, the write is also skipped as a fail-safe (fail-closed design). The automated finalization path uses an `INSERT IGNORE` statement, which does not overwrite an existing record. The adjuster correction path uses an `UPSERT` (INSERT with ON DUPLICATE KEY UPDATE), which overwrites the automated record with the adjuster's verified outcome. The benchmark query uses the recorded outcomes to compute median repair costs by component, repair action, and vehicle class, weighted by outcome recency and quality tier.

### Claims

**Claim 18 (Independent — System).** A computer-implemented system for maintaining a self-calibrating benchmark dataset of motor vehicle repair costs, comprising:

a fraud guard module configured to query a fraud risk score for a claim before writing any repair outcome record for that claim to the benchmark dataset, and to skip the write operation and log a reason when the fraud risk score meets or exceeds a threshold value;

a fail-safe module configured to skip the write operation and log a reason when the fraud guard module cannot complete the fraud risk score query due to a database connection failure or query error, such that the benchmark dataset is not written to under conditions of uncertainty;

an automated finalization module configured to write a repair outcome record to the benchmark dataset upon claim completion, using a non-overwriting insert operation that does not replace an existing record for the same claim component;

an adjuster correction module configured to write a repair outcome record to the benchmark dataset upon receipt of a verified outcome from a human adjuster, using an overwriting insert operation that replaces any existing automated record for the same claim component; and

a benchmark query module configured to compute median repair cost estimates by component, repair action, and vehicle class from the benchmark dataset.

**Claim 19 (Dependent on Claim 18).** The system of Claim 18, wherein the fraud guard threshold is set at a fraud risk score of 50 on a scale of 0 to 100, such that claims classified at moderate risk or above are excluded from the benchmark dataset.

**Claim 20 (Dependent on Claim 18).** The system of Claim 18, wherein the benchmark dataset records, for each repair outcome, at least: the component identifier, the repair action, the actual cost, the currency code, the claim identifier, a source indicator distinguishing automated finalization records from adjuster correction records, and a timestamp.

**Claim 21 (Dependent on Claim 18).** The system of Claim 18, wherein the benchmark query module applies a recency weighting to repair outcome records such that more recent outcomes contribute more weight to the median cost estimate than older outcomes, enabling the benchmark to adapt to changing repair cost conditions.

**Claim 22 (Dependent on Claim 18).** The system of Claim 18, wherein the benchmark query module applies a currency normalisation step that converts all repair cost records to a common reference currency before computing median estimates, and applies a regional cost index adjustment to account for cost-of-living differences between operating jurisdictions.

**Claim 23 (Independent — Method).** A computer-implemented method for maintaining a self-calibrating benchmark dataset of motor vehicle repair costs, comprising:

querying, by a processor, a fraud risk score for a claim before writing any repair outcome record for that claim to a benchmark dataset;

skipping the write operation when the fraud risk score meets or exceeds a threshold value, or when the fraud risk score cannot be determined due to a system failure, and logging a reason for the skip in both cases;

writing a repair outcome record to the benchmark dataset upon claim completion using a non-overwriting insert operation; and

writing a repair outcome record to the benchmark dataset upon receipt of a verified outcome from a human adjuster using an overwriting insert operation that replaces any existing automated record for the same claim component, such that human-verified outcomes take precedence over automated records in the benchmark dataset.

---

## Invention 5: Contact Geometry Intelligence — Contact Patch Ratio Indicator for Motor Claims Fraud Detection

### Abstract

A computer-implemented system and method for detecting geometric incoherence between a stated motor vehicle collision scenario and the observed pattern of vehicle damage, by computing a Contact Patch Ratio (CPR) from the fraction of the primary impact panel's surface area that exhibits visible damage, comparing that ratio against a minimum threshold derived from published collision test protocols for the stated impact type, and generating a fraud indicator when the observed contact patch is geometrically inconsistent with the stated collision scenario. The system uses a calibrated vehicle geometry database and per-component damage fraction estimates produced by a vision analysis engine to derive the contact patch area without requiring physical measurement or additional data sources.

### Field of the Invention

The invention relates to computer-implemented fraud detection systems for motor vehicle insurance claims, and more particularly to systems that detect geometric incoherence between a stated collision scenario and observed damage patterns using vehicle geometry data and vision-derived damage fraction estimates.

### Background

Existing motor vehicle claims fraud detection systems rely primarily on statistical pattern matching, document cross-checking, and financial anomaly detection. No prior system known to the applicant uses the geometric relationship between the observed contact patch area on the primary impact panel and the minimum contact patch area expected for the stated collision type — as defined by published collision test protocols — as a fraud detection signal. This geometric approach produces a forensically defensible, falsifiable physical statement about the consistency of the claim, which is qualitatively different from statistical pattern-matching signals.

### Brief Description of the System

The system operates as follows:

1. **Vehicle geometry lookup.** The system queries a calibrated vehicle geometry database to obtain the total surface area of the primary impact panel for the stated vehicle body type (e.g., front bumper area for a frontal impact, rear bumper area for a rear impact).

2. **Damage fraction extraction.** The system reads the per-component damage fraction estimate produced by a vision analysis engine for the primary impact panel. This estimate represents the fraction of the panel’s total surface area that exhibits visible damage, as assessed from photographic evidence.

3. **CPR computation.** The Contact Patch Ratio is computed as: `CPR = (panel area × damage fraction) / panel area = damage fraction`. The observed damaged area in square metres is `panel area × damage fraction`.

4. **Threshold comparison.** The system applies a minimum CPR threshold for the stated collision direction, derived from published IIHS and Euro NCAP collision test protocols. A conservative margin is subtracted from the threshold before comparison to reduce false positives arising from partial photo coverage and angle-limited visibility.

5. **Indicator generation.** When the observed CPR falls below the effective threshold, the system generates a structured fraud indicator with a score, severity level, and a human-readable description citing the specific CPR values, the expected minimum, the panel area, and the source protocol.

6. **Anti-circularity.** The CPR computation uses only the vehicle geometry database and the vision-derived damage fraction. It does not use any speed estimate or physics output, ensuring it cannot be circular with the speed inference ensemble.

7. **Fail-closed design.** The system returns a null indicator (no fraud signal) rather than throwing an exception when required data is unavailable, ensuring it cannot halt the downstream fraud scoring pipeline.

### Claims

**Claim 24 (Independent — System).** A computer-implemented system for detecting geometric incoherence in a motor vehicle insurance claim, comprising:

a vehicle geometry database storing the surface area of primary impact panels for a plurality of vehicle body types;

a damage fraction input module configured to receive, for each damaged vehicle component, a damage fraction value representing the fraction of that component’s surface area exhibiting visible damage, as produced by a vision analysis engine operating on photographic evidence of the claimed damage;

a contact patch ratio computation module configured to compute, for the primary impact panel associated with the stated collision direction, a Contact Patch Ratio as the product of the panel’s total surface area and the damage fraction value for that panel, divided by the panel’s total surface area;

a threshold comparison module configured to compare the computed Contact Patch Ratio against a minimum threshold derived from published collision test protocols for the stated collision direction, applying a conservative margin to the threshold to reduce false positives from partial photographic coverage;

an indicator generation module configured to generate a structured fraud indicator when the Contact Patch Ratio falls below the effective threshold, the indicator comprising the observed ratio, the expected minimum ratio, the observed damaged area in square metres, the total panel area, and the collision direction; and

a fail-safe module configured to return a null indicator rather than raising an exception when required data is unavailable, ensuring the system cannot halt downstream fraud scoring processes.

**Claim 25 (Dependent on Claim 24).** The system of Claim 24, wherein the minimum threshold for each collision direction is derived from the minimum contact patch ratio observed in published IIHS full-width rigid barrier, IIHS moderate overlap, IIHS small overlap, and Euro NCAP offset deformable barrier collision test protocols.

**Claim 26 (Dependent on Claim 24).** The system of Claim 24, wherein the primary impact panel for a frontal collision direction is the front bumper, the primary impact panel for a rear collision direction is the rear bumper, and the primary impact panel for a side collision direction is the front door of the impacted side.

**Claim 27 (Dependent on Claim 24).** The system of Claim 24, wherein the indicator generation module assigns a severity level to the generated indicator based on the magnitude of the gap between the effective threshold and the observed Contact Patch Ratio, assigning a high severity level when the gap exceeds a first threshold, a medium severity level when the gap exceeds a second lower threshold, and an advisory severity level otherwise.

**Claim 28 (Dependent on Claim 24).** The system of Claim 24, wherein the contact patch ratio computation module is configured to return a non-computable result rather than a fraud indicator when no damage fraction value is available for the primary impact panel, and the fail-safe module is configured to return a null indicator in response to a non-computable result.

**Claim 29 (Independent — Method).** A computer-implemented method for detecting geometric incoherence in a motor vehicle insurance claim, comprising:

receiving a stated collision direction and a vehicle body type for the claimed vehicle;

querying a vehicle geometry database to obtain the surface area of the primary impact panel associated with the stated collision direction and vehicle body type;

receiving a damage fraction value for the primary impact panel from a vision analysis engine that has processed photographic evidence of the claimed damage;

computing a Contact Patch Ratio as the product of the panel surface area and the damage fraction value, divided by the panel surface area;

comparing the Contact Patch Ratio against a minimum threshold derived from published collision test protocols for the stated collision direction, reduced by a conservative margin;

generating a structured fraud indicator when the Contact Patch Ratio falls below the effective threshold, the indicator comprising the observed ratio, the expected minimum ratio, and the collision direction; and

returning a null result rather than raising an exception when required data is unavailable.

**Claim 30 (Dependent on Claim 29).** The method of Claim 29, further comprising injecting the generated fraud indicator into a weighted composite fraud scoring pipeline as a physical consistency signal, wherein the indicator contributes to a physical consistency category score that is normalised against a calibrated maximum and scaled to a fixed budget within the composite score, such that the contact geometry signal cannot dominate the final fraud score independently of signals from other fraud detection categories.

---

## Filing Guidance for Patent Attorney

### Priority and Filing Strategy

| Action | Jurisdiction | Body | Recommended Timing |
|---|---|---|---|
| File provisional applications for all five inventions | Zimbabwe | Zimbabwe Intellectual Property Office (ZIPO) | Immediately — establishes priority date |
| File provisional applications for all five inventions | South Africa | Companies and Intellectual Property Commission (CIPC) | Immediately — South Africa does not substantively examine, easier to obtain |
| File PCT international application | International | WIPO | Within 12 months of provisional filing — covers UK, EU, US, East Africa in a single filing |
| File complete applications | Zimbabwe, South Africa | ZIPO, CIPC | Within 12 months of provisional filing |

### Claim Drafting Notes

The independent claims (Claims 1, 7, 8, 12, 13, 17, 18, 23, 24, 29) are drafted as system and method claims in parallel, which is standard practice to maximise coverage. The dependent claims add specific technical features that narrow the claim but provide fallback positions if the independent claim is challenged on novelty or inventive step grounds.

The claims are drafted to cover the technical implementation and the technical effect (improved accuracy of speed inference, detection of speed-damage inconsistencies, prevention of fraudulent claim payouts, prevention of benchmark dataset contamination, detection of geometric incoherence) rather than the underlying mathematical methods in the abstract. This framing is important for patentability in Zimbabwe and South Africa, where abstract mathematical methods are not patentable but technical processes producing technical results are.

**Note on Invention 5 (CGI — CPR).** The Contact Patch Ratio indicator is implemented in Phase 1 with conservative thresholds calibrated from published test protocols. The full Contact Geometry Intelligence engine (Phase 2, v1.1) will add nine additional indicators (structural zone compliance, vehicle compatibility score, underride/override detection, etc.) and will be added to these claims at the complete application stage. The provisional filing covers the full CGI architecture as described in the Brief Description of the System above.

### What Is Not Claimed Here

The following are protected as trade secrets via the KINGA Confidentiality Agreement and are deliberately not disclosed in these patent claims:

- The specific numerical values of fraud-scoring weights, band thresholds, and scoring parameters.
- The specific numerical values of physics calibration constants, stiffness coefficients, and method weights.
- The specific financial configuration values used in the cost optimisation engine.
- The specific CPR threshold values and conservative margin values used in the Contact Geometry Intelligence engine.

Trade secret protection is indefinite and does not require public disclosure. Patent protection requires disclosure and expires after 20 years. The strategy is to patent the architecture and the method, while protecting the specific parameter values as trade secrets.

---

*KINGA Technologies — Confidential*  
*Prepared by Tavonga Shoko (Lead Engineer) — August 2026*
