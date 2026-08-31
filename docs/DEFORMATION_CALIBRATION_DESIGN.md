# Deformation Calibration Design — Reference Data & Tolerance

Addresses the two open questions blocking implementation of the deformation
calibration spec (`docs/KINGA-CLAUDE-CODE-READINESS.md` Section 1), listed as
Section 4 items 6 and 7 of that document:

6. Vehicle reference-dimension data source (which "true value" do we correct
   against?)
7. Calibration tolerance threshold (how much correction-factor disagreement
   between independent reference dimensions is acceptable before routing to
   human review?)

This document is a decision and its reasoning, not an implementation. No code
is included. It's written to unblock Section 5 item 6 (implementing the
calibration spec) and should be read alongside Section 1 and Section 2 of the
readiness doc.

---

## 1. Vehicle reference-dimension data source

### Options on the table (from readiness doc Section 4.6)

- **A. Internal lookup table**, keyed by make/model/year.
- **B. Third-party vehicle-spec API.**
- **C. Manual entry per vehicle at intake.**

### What already exists

`server/pipeline-v2/vehiclePanelDimensions.ts` is the closest existing analog:
a hardcoded, internal lookup table of panel *areas* keyed by coarse body type
(sedan/hatchback/suv/pickup/van/bus/truck/coupe/wagon), sourced from SAE J1100,
NHTSA NCAP panel datasets, and OEM service manuals. It's used for damage-area
estimation, not calibration, and no third-party vehicle-spec API or VIN
decoder exists anywhere else in the repo — every vehicle-dimension number
currently in the codebase is self-contained.

This matters for two reasons. First, it's evidence of the team's established
pattern: prefer a hardcoded, versioned, internally-sourced table over a live
external dependency for physics/measurement inputs. Second, and more
important, it shows the failure mode to avoid: `vehiclePanelDimensions.ts`
buckets by *body type*, not by *make/model*. That's an acceptable
approximation for estimating damage area, where the consequence of being off
by a few percent is a rough cost estimate. It is not an acceptable
approximation here, because the reference dimension **is the ground truth the
correction factor is computed against** — if the "true value" itself carries
systematic error (e.g. using a generic "sedan windshield width" instead of
the actual Toyota Corolla's), that error gets baked into
`correction_factor = true_value / measured_value` and silently propagates
into every corrected deformation measurement on the claim. The calibration
spec exists specifically to catch measurement-pipeline error; it must not
introduce a new, invisible source of the same kind of error via a coarse
reference source.

### Recommendation: internal lookup table, keyed by make/model/generation, with manual entry as the fallback — reject the third-party API

**Primary source — internal table, keyed by make/model/generation (not
year):** OEM dimension specs are published per generation/facelift, not per
individual model year, and most of the four candidate reference dimensions
(windshield width, wheelbase, roof width, door height) don't change within a
generation. Keying by exact year would fragment the table for no accuracy
gain and make it harder to populate. Key by make + model + body
generation (e.g. "Toyota Corolla E170, 2013–2019"), with year used only to
resolve which generation a given vehicle falls into.

**Seed it from the claim corpus, not exhaustively.** Don't try to cover every
vehicle sold globally on day one. KINGA's claim population is concentrated in
the Zimbabwe/Zambia used-import market, which skews heavily toward a
relatively small number of recurring makes/models (Toyota, Honda, Nissan,
Mazda, and similar). Populate the table starting from whatever set of
vehicles actually appears in existing claims/inspections — a Pareto pass over
real intake data will likely cover a large majority of future claims with a
modest number of table rows. Grow it incrementally as new
makes/models/generations show up uncovered, rather than blocking rollout on
a comprehensive table.

**Fallback — manual entry at intake, not a blocker.** When a vehicle's
make/model/generation isn't yet in the table, the engineer enters the
reference dimension(s) directly (from the vehicle's spec plate, an OEM
manual, or a manufacturer's published spec sheet) as part of intake, the same
way `physical_measurements` already captures free-text `calibrationReference`
and `instrument`/`source` today. This keeps calibration available for every
claim from day one instead of only for table-covered vehicles, while still
producing something in the audit trail.

**Reject the third-party API**, for four reasons specific to this system:

- *Offline/field reliability.* Field inspections happen in Zimbabwe/Zambia
  under inconsistent connectivity. A ground-truth input to a safety- and
  legal-relevant calibration shouldn't have a live external dependency in the
  measurement path.
- *No existing precedent.* Every physics/measurement input in this codebase
  today (`vehiclePanelDimensions.ts`, `accidentPhysics.ts`'s N-03 constants)
  is self-contained and deterministic. An external API would be the first
  runtime dependency of its kind and adds a new failure mode (rate limits,
  auth/key management, service deprecation) to a component this document's
  auditability requirement treats as load-bearing.
- *Market coverage.* Third-party vehicle-spec/VIN-decode APIs are strongest
  for US/EU-market vehicles with clean VIN histories. KINGA's actual claim
  population — older, grey-import, Southern-African-market vehicles — is
  exactly the population these APIs tend to cover worst.
- *Licensing uncertainty.* Redistributing or deriving from a third-party
  provider's manufacturer-spec data inside a paid product is a legal
  question this document isn't positioned to resolve, and doesn't need to be
  resolved if the internal-table approach works.

**Confidence and auditability integration.** Every reference-dimension value
used in a calibration must carry its own provenance and be persisted
alongside the correction factor it produced, per Section 1 item 7's
persistence requirement: whether it came from the internal table (with the
table's source citation — OEM manual, spec plate photo, etc.) or from manual
intake entry. Table-sourced values should default to a higher confidence
than manually-entered ones, since manual entry has no independent
verification step at capture time; that distinction should feed into the
overall confidence field on the measurement (Section 1 item 8), not just the
raw/corrected values.

**Explicitly out of scope for this decision:** the exact set of "candidate"
reference dimensions beyond the four examples already named in Section 1
(windshield width, wheelbase, roof width, door height), and the intake UI/UX
for manual entry. Both are implementation details for whoever builds Section
1, not data-source-selection questions.

---

## 2. Calibration tolerance threshold

### What's actually being tolerance-checked

Section 1 step 5 requires: "if the correction factors derived from
independent reference dimensions agree within a defined tolerance, apply the
... correction factor." With ≥2 independent reference dimensions per photo
set, each produces its own `correction_factor = true_value / measured_value`.
If the photo set's error truly is systematic (camera distance, angle, lens
distortion) it should apply as roughly one global scale factor across the
whole image — so independent, correctly-identified reference dimensions
should yield correction factors that agree closely. Disagreement beyond
noise is the signal that a single-scalar correction isn't a valid model for
this photo set's error (wrong reference dimension identified, damaged panel
misclassified as undamaged, wrong spec looked up, non-uniform distortion),
which is exactly the case Section 1 step 6 routes to human review.

So the quantity to threshold is **relative disagreement between correction
factors**, not an absolute distance: `|cf_a − cf_b| / mean(cf_a, cf_b)`. A
relative measure is the right unit here because photogrammetric error scales
with the object's apparent size and distance from camera, not its absolute
dimension — and it makes the threshold meaningful across reference
dimensions of very different physical scale (a ~1.4 m windshield width vs. a
~2.6 m wheelbase).

### Recommended threshold: 5% relative disagreement, evaluated pairwise

Set the agreement-check threshold at **5% relative disagreement between any
pair of correction factors**. Below 5%, treat the correction factors as
agreeing and apply the averaged/reconciled correction factor. At or above
5% for any pair, route to human review per Section 1 step 6.

Rationale for the specific number: single-camera 2D photogrammetric
measurement under reasonable field conditions is generally understood to
carry a few percent of measurement uncertainty even when nothing is wrong.
Setting the threshold near the low end of that range is a deliberate choice
to fail toward human review rather than toward false-confidence
auto-correction — this calibration's output feeds engineer-facing and
potentially legal/insurance-facing reports, so a false "agreement" that
silently applies a wrong scalar correction is a worse failure mode than an
unnecessary human-review referral. This is an engineering-judgment starting
point, not a number derived from KINGA's own claim data — no such dataset
exists yet. It should be labeled and revisited exactly like the existing
`KINGA-N-03 CALIBRATION` markers in `server/accidentPhysics.ts` (e.g. the
20/40/70 km/h injury-risk thresholds at line 345): a comment stating the
basis, that it's unvalidated against KINGA's own corpus, and that it
shouldn't be adjusted without benchmarking against recorded claim data. Per
Section 7 item 4, this connects directly to the existing N-03
validation backlog — both should be validated against KINGA's own
Zimbabwe/Zambia claim corpus together, not treated as separate efforts.

**Aggregation rule for 3+ reference dimensions.** Evaluate the threshold over
every pairwise combination, not just the average pair or the mean-vs-each
comparison. Use the **maximum pairwise relative disagreement** across all
pairs as the gate: if any single pair exceeds 5%, route to human review, even
if the other pairs agree tightly. This follows directly from Section 1 step
6's instruction not to silently average — a single outlier reference
dimension (e.g. one of three was misidentified) must not be diluted by two
that happen to agree with each other.

**Where it lives.** No env-var or config-file pattern exists in this
codebase for thresholds of this kind — every existing calibration constant
(`accidentPhysics.ts`, `physics-deviation-calculator.ts`,
`claimQualityScorer.ts`, `costDecisionEngine.ts`,
`decisionReadinessEngine.ts`) is a named, commented constant in code. Follow
that convention: a single named constant with a `KINGA-N-03 CALIBRATION`-style
comment, not a scattered magic number and not a new configuration mechanism
introduced just for this one value.

**Revisit trigger.** Rather than an open-ended "revisit sometime," tie
re-validation to a concrete checkpoint: once a defined number of claims have
gone through the calibration step with recorded raw/corrected/correction-factor
data (the persistence Section 1 item 7 already requires), that data itself is
the input for validating or adjusting the 5% threshold. This mirrors the
existing go-to-market gate pattern (50 test claims / 30 days full access,
Section 8) rather than inventing a new review-cadence mechanism.

---

## 3. Summary

| Question | Decision | Confidence this is final |
|---|---|---|
| Reference-dimension source | Internal table, keyed by make/model/generation, seeded from claim-corpus vehicles; manual entry at intake as fallback for uncovered vehicles; third-party API rejected | High on internal-vs-external; the specific seed vehicle list is an implementation detail |
| Calibration tolerance | 5% relative disagreement between correction factors, evaluated pairwise, max-pairwise gates human-review routing | Medium — engineering-judgment starting point, explicitly flagged for revalidation against KINGA's own claim corpus (ties to Section 7 item 4 / N-03 backlog) |

Both decisions are written to unblock Section 5 item 6 (implementing the
Section 1 calibration spec) without leaving either input as an undocumented
magic constant. Neither should be read as requiring zero future change —
the tolerance in particular is explicitly provisional pending real
calibration data, consistent with how the existing N-03 markers are already
documented and tracked.
