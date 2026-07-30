# KINGA — Benchmark Comparability Audit: Scope, Part Type, and Side Segmentation

**Document type:** Internal Technical Audit  
**Audience:** Product, engineering, and actuarial stakeholders  
**Status:** Diagnosis only — no code changes  
**Date:** July 2026  
**Follows from:** KINGA-Cost-Architecture.md

---

## Executive Summary

This audit confirms that **none of the three benchmark tiers — ML (Tier 1), statistical (Tier 2), or legacy DB (Tier 3) — segment by repair-vs-replace scope or by part type (OEM/aftermarket/used)**. Side (L/R) is handled differently: the Tier 2 statistical file and Tier 3 legacy DB do maintain separate entries for left and right components where the training corpus had sufficient data, but the ML models do not distinguish side at all.

The consequence is that the L2 per-component formula compares a submitted price — which may be for a replacement OEM part — against a benchmark P50 that blends repair and replace observations, OEM and aftermarket prices, and in some cases both sides of a symmetric component. This is a structural comparability gap that affects the reliability of the 30% deviation check and the benchmark verdict signals (`ABOVE_MARKET`, `MARKET_RATE`, `BELOW_MARKET`) for a material subset of the 34 Tier 2 and 6 Tier 1 components.

The L2 formula's asymmetric behaviour (benchmark never used to justify a cost *higher* than the cheapest submitted quote) is confirmed as intentional design.

---

## Section 1 — Scope Segmentation (Repair vs. Replace)

### Finding: All three tiers blend repair and replace observations

Inspection of `component_benchmarks.json` confirms that the file schema contains exactly eleven fields per entry: `component_id`, `component_name`, `make`, `n`, `p25`, `median`, `p75`, `p95`, `min`, `max`, and `confidence`. There is no `scope`, `repair_scope`, `replace_scope`, or equivalent field. A single P25/P50/P75 triplet is stored per component-make combination, and the `n` count reflects all observations pooled regardless of whether the underlying claim involved a repair or a replacement.

The six ML model files (`engine.json`, `boot_lid.json`, `roof.json`, `dashboard.json`, `left_front_door.json`, `right_front_door.json`) each store three GBM quantile regression models (P25, P50, P75) with exactly two features: `make_ordinal` and `vehicle_age`. Scope is not a feature in any of the models. The training corpus rows that produced these models were pooled across repair and replace outcomes before training.

The `component_repair_outcomes` DB table (Tier 3) does store separate `repair_cost_usd` and `replace_cost_usd` columns per row, and the `outcome` enum field records whether the final decision was `repair`, `replace`, or `write_off`. However, the `getComponentBenchmarks()` query in `db.ts` computes a single IQR from the `repair_cost_usd` column only — it does not separate repair-scope rows from replace-scope rows when building the P25/P50/P75 percentiles. The `replace_cost_usd` column is stored but not used in the benchmark calculation.

### Materiality

The scope blending is most consequential for components where repair and replace prices are structurally different. The table below classifies the 34 Tier 2 components by their typical repair-vs-replace price gap.

| Risk level | Components | Reason |
|---|---|---|
| **High** | `engine`, `gearbox`, `dashboard`, `boot_lid`, `roof` | Replace cost is typically 3–10× repair cost; blended benchmark is unreliable for either scope |
| **High** | `driver_airbag`, `passenger_airbag` | Safety-critical: replacement only; any repair-scope observations in the corpus are anomalous |
| **Medium** | `bonnet`, `left_front_door`, `right_front_door`, `left_rear_door`, `right_rear_door`, `left_fender`, `right_fender` | Repair is common for minor damage; replace for severe; blended P50 sits between the two |
| **Medium** | `windscreen`, `rear_window` | Repair (chip/crack) is a distinct market from full replacement; prices differ by 5–10× |
| **Low** | `front_bumper`, `rear_bumper`, `grille`, `fog_light`, `radiator`, `condenser`, `intercooler`, `exhaust`, `steering_rack`, `steering_wheel`, `tie_rod_end`, `wheel_bearing`, `left_shock`, `right_shock`, `control_arm_left`, `right_side_mirror` | Repair is rare or non-standard for these components; most observations are replace-scope, so blending has limited effect |

For the five High-risk components where the ML model is active (`engine`, `boot_lid`, `roof`, `dashboard`, `left_front_door`/`right_front_door`), the model's P50 prediction is a blended signal. A claim where the assessor has determined that the engine requires replacement will receive a benchmark comparison against a P50 that includes repair-scope observations, making the benchmark appear lower than it should be for a replace-scope job and increasing the likelihood of an `ABOVE_MARKET` verdict that is not genuinely above market for the scope being priced.

### Feasibility of Re-deriving Scope-Segmented Benchmarks

The `component_repair_outcomes` table already stores both `repair_cost_usd` and `replace_cost_usd` per row, and the `outcome` column records the final decision. This means scope-segmented benchmarks for Tier 3 can be re-derived from the existing DB data without new data collection, by running separate IQR calculations on the `repair_cost_usd` rows where `outcome = 'repair'` and the `replace_cost_usd` rows where `outcome = 'replace'`.

For Tier 2 (statistical file), the benchmark generation script reads from the same training corpus. If the source corpus rows included a scope label (repair/replace), scope-segmented percentiles can be re-derived by re-running the generation script with a scope filter. Whether the source corpus rows include this label is not confirmed from the available files — the `component_benchmarks.json` generation script is not present in the repository, so the source corpus schema cannot be directly verified. This requires confirmation from whoever generated the May 2026 corpus.

For Tier 1 (ML models), adding scope as a feature would require retraining. The current two-feature model (`make_ordinal`, `vehicle_age`) would need a third feature (`scope_ordinal`: 0 = repair, 1 = replace), and the training corpus would need scope labels for all 7,625 rows. If the source corpus has scope labels, this is feasible. If not, scope labels would need to be inferred from the `outcome` field in `component_repair_outcomes` for the subset of rows that are linked to live claims.

---

## Section 2 — Part Type Segmentation (OEM / Aftermarket / Used)

### Finding: No benchmark tier segments by part type

The `component_benchmarks.json` schema has no `part_type`, `oem`, `aftermarket`, or equivalent field. All submitted prices in the training corpus were pooled regardless of whether the part was OEM, aftermarket, reconditioned, or used. The ML model feature set (`make_ordinal`, `vehicle_age`) contains no part-type dimension. The `component_repair_outcomes` table schema includes a `part_origin` field (`oem`, `aftermarket`, `reconditioned`, `used`, `unknown`) with a comment noting it is "populated opportunistically — null when not stated in the quote." No query in `db.ts` filters or groups by `part_origin` when building benchmark percentiles.

### Part-type capture at Stage 3

The `ExtractedQuoteLineItem` type in `types.ts` does include a `part_origin` field (`"oem" | "aftermarket" | "reconditioned" | "used" | "unknown"`). This field is extracted by the Stage 3 LLM quote extraction engine and is carried through to `documentedLineItems` in Stage 9 (line 1261 of `stage-9-cost.ts`). However, when `compositeInputQuotes` is built for `buildCompositeQuote()` (lines 1787–1795 of `stage-9-cost.ts`), the `part_origin` field is **not included** in the mapped line item objects passed to the composite engine. The composite engine's `InputQuoteWithLineItems` type does not have a `part_origin` field. The part-type information is extracted, carried through the pipeline, and then discarded at the point where it would be most useful for comparability checking.

### Materiality

The OEM-vs-aftermarket price gap is largest for components with complex electronics, proprietary sensors, or brand-specific fitment. The following components from the 34 Tier 2 entries and 6 Tier 1 entries are most exposed:

| Exposure level | Components | Typical OEM/aftermarket price ratio |
|---|---|---|
| **High** | `driver_airbag`, `passenger_airbag` | 3–8× (OEM airbag modules are proprietary; aftermarket equivalents are rare and often not accepted by insurers) |
| **High** | `dashboard` | 2–5× (OEM dashboards include integrated electronics; aftermarket alternatives are often partial) |
| **High** | `right_side_mirror`, `left_shock`, `right_shock` | 2–4× (OEM mirrors include integrated sensors/cameras on modern vehicles) |
| **Medium** | `left_front_door`, `right_front_door`, `left_rear_door`, `right_rear_door` | 1.5–3× (OEM doors include wiring harnesses and seals; aftermarket doors are bare shells) |
| **Medium** | `windscreen`, `rear_window` | 1.5–2.5× (OEM glass includes ADAS calibration targets; aftermarket glass may not) |
| **Medium** | `front_bumper`, `rear_bumper` | 1.5–2× (OEM bumpers include sensor mounts and mounting brackets; aftermarket often excludes these) |
| **Low** | `radiator`, `condenser`, `intercooler`, `exhaust`, `steering_rack`, `tie_rod_end`, `wheel_bearing`, `control_arm_left` | Aftermarket is widely accepted and price-competitive; gap is typically < 50% |

For the High-exposure components, a submitted quote for an OEM replacement will routinely appear `ABOVE_MARKET` against a blended benchmark that includes cheaper aftermarket observations, even when the OEM price is entirely appropriate for the claim.

### Feasibility of Re-deriving Part-Type-Segmented Benchmarks

The `component_repair_outcomes` table stores `part_origin` per row, but the field is populated "opportunistically" — it is null when not stated in the quote. The fill rate for this field is not known from the available data. If fill rate is low (< 30%), segmented benchmarks derived from this table would have insufficient sample sizes for most components. A data quality check on the `part_origin` fill rate in the live DB is required before feasibility can be confirmed.

For the Tier 2 statistical file, the same question applies to the source corpus: whether `part_origin` was captured per row when the May 2026 corpus was assembled. This cannot be confirmed from the available repository files.

---

## Section 3 — Side (L/R) Handling

### Finding: Side is tracked separately in Tier 2 and Tier 3, but not in Tier 1

The `component_benchmarks.json` file contains separate entries for left and right components where the training corpus had sufficient data. The 34 global entries include distinct rows for `left_fender` (n=30), `right_fender` (n=11), `left_front_door` (n=58), `right_front_door` (n=57), `left_rear_door` (n=60), `right_rear_door` (n=41), `left_headlight` (n=6), `right_headlight` (n=5), `left_shock` (n=21), `right_shock` (n=1), and `right_side_mirror` (n=10). There is no `left_side_mirror` entry (insufficient data). This means Tier 2 does maintain side-specific benchmarks where data permits.

The ML models (Tier 1) include separate model files for `left_front_door.json` and `right_front_door.json`, which is consistent with side-specific treatment for those two components. No other ML models distinguish side.

The `component_repair_outcomes` table stores the raw `componentName` string, which will reflect whatever canonical name was used at the time of the outcome record. If the canonicalisation correctly distinguishes `left_fender` from `right_fender`, then Tier 3 benchmarks are also side-specific for those components. The `getComponentBenchmarks()` query looks up by `componentName` directly, so side specificity depends entirely on whether the component name passed to the query is the side-specific canonical form.

### Asymmetric componentry risk

For most symmetric components (doors, fenders, shocks), left and right prices are equivalent in practice because the same part number is used on both sides or the price difference is negligible. The risk of side-pooling is most relevant for components where left and right genuinely differ:

- **Steering rack**: always driver-side specific; left-hand-drive and right-hand-drive vehicles have different racks. The `steering_rack` benchmark entry is not side-specific (single entry, n=7), which is a comparability concern for mixed-market data.
- **Wiring harnesses integrated into door panels**: OEM door assemblies for the driver's door include more complex wiring than the passenger door on some models. This is a minor effect and not separately tracked.
- **ADAS sensor placement**: on some vehicles, front radar is offset to one side. This is a component-level issue rather than a benchmark-level one.

For the current 34 Tier 2 components, the side-pooling risk is limited to `steering_rack` (n=7, single entry) and the absence of a `left_side_mirror` entry (only `right_side_mirror` exists). All other side-specific components have separate entries.

---

## Section 4 — L2 Formula Asymmetric Behaviour

### Confirmation: The asymmetry is intentional design

The L2 per-component formula, as implemented in `quoteOptimisationEngine.ts` (lines 1174–1200), applies the benchmark P50 only when two conditions are simultaneously met: the benchmark must be **cheaper** than the lowest submitted price (`p50 < lowestSubmitted`), **and** the deviation must be within 30% (`deviation <= 0.30`). When the benchmark is higher than the lowest submitted price, the code path at line 1189 sets `tierLabel` to `"Lowest Quote · {repairer} (benchmark above market)"` and uses `lowestSubmitted` as the L2 component cost. The benchmark is never used to justify a cost higher than the cheapest quote on the table.

This is confirmed as deliberate design, documented in the `buildCompositeQuote` function header comment (lines 923–952):

> "L2_total MAY exceed L1 (when 30% floor engages on all components). KINGA reports both; insurer can accept L1 as the authorisation amount."

The asymmetry reflects the system's purpose: KINGA is an insurer-side tool whose objective is to identify savings opportunities, not to justify higher costs. Using a benchmark to argue that a submitted price is too low would be operationally inappropriate in the claims context — a repairer willing to do the job for less than the benchmark is a favourable outcome for the insurer, not a problem to be corrected. The design is sound.

The one consequence worth noting is that when the benchmark is above market (i.e., the benchmark is stale and the market has moved down), the system silently uses the lower submitted price without flagging that the benchmark may be outdated. This is correct behaviour from an authorisation perspective but means the benchmark staleness is not surfaced to the adjuster.

---

## Section 5 — Recommended Next Steps

The following items are ordered by feasibility and impact. No implementation is proposed in this document.

| # | Gap | Feasibility of fix from existing data | Priority |
|---|---|---|---|
| **C-1** | **Scope-segmented Tier 3 benchmarks.** Re-derive separate repair-scope and replace-scope IQR from `component_repair_outcomes` using the existing `outcome` + `repair_cost_usd`/`replace_cost_usd` columns. | **High** — data already exists in the DB; requires a query change in `getComponentBenchmarks()` and a schema addition to the benchmark output | **High** |
| **C-2** | **Pass scope to L2 selection.** The composite engine already knows the scope of each line item (`isRepair`/`isReplacement`). Once scope-segmented benchmarks exist, the `buildCompositeQuote()` function can select the correct benchmark tier for each line item. | **High** — depends on C-1; no new data needed | **High** |
| **C-3** | **Part-type fill rate audit.** Run a DB query to determine the fill rate of `part_origin` in `component_repair_outcomes`. If fill rate is ≥ 30% for High-exposure components, scope-segmented part-type benchmarks are feasible from existing data. | **High** — single SQL query | **Medium** |
| **C-4** | **Pass part_origin through to composite engine.** The `part_origin` field is already extracted at Stage 3 and carried to `documentedLineItems`. The gap is in the `compositeInputQuotes` mapping (line 1787–1795 of `stage-9-cost.ts`) where it is dropped. Adding it to `InputQuoteWithLineItems` and using it for benchmark selection requires a type extension and a query change. | **Medium** — depends on C-3 for benchmark data; the pipeline plumbing change is straightforward | **Medium** |
| **C-5** | **Scope-segmented Tier 2 re-derivation.** Confirm whether the May 2026 training corpus rows include scope labels. If yes, re-run the benchmark generation script with a scope filter to produce separate P25/P50/P75 for repair and replace. If no, scope labels must be inferred from `component_repair_outcomes.outcome` for the linked rows. | **Medium** — depends on source corpus schema confirmation | **Medium** |
| **C-6** | **Scope feature in Tier 1 ML models.** Add `scope_ordinal` as a third feature and retrain. Requires scope-labelled training data for all 7,625 rows. | **Low** — requires source corpus scope labels and a full retraining cycle | **Low** |
| **C-7** | **`steering_rack` side disambiguation.** The single `steering_rack` entry (n=7) pools left-hand-drive and right-hand-drive observations. For markets with mixed LHD/RHD fleets, this is a comparability concern. Requires a `drive_side` field in the benchmark schema and sufficient stratified data. | **Low** — requires new data collection | **Low** |

---

*End of document.*
