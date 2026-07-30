# KINGA Benchmark Comparability Diagnosis
## Like-for-Like Verification: Scope, Part Type, and Side Segmentation

**Classification:** Internal — Engineering & Data Science  
**Date:** July 2026  
**Scope:** Read-only diagnosis. No code changes made.

---

## Executive Summary

This report confirms the segmentation status of all three benchmark tiers (Tier 1 ML, Tier 2 Statistical, Tier 3 Legacy DB) across three comparability dimensions: repair-vs-replace scope, part type (OEM/aftermarket/used), and left/right side. The central finding is that **none of the three tiers are segmented by scope or part type**. Side is handled at the component-ID level in Tier 2 and Tier 3 but not as a within-component dimension. The L2 formula's asymmetric behaviour — the benchmark is never used to justify a cost higher than the cheapest submitted quote — is confirmed as intentional design. Feasibility of re-deriving scope-segmented benchmarks from the existing `component_repair_outcomes` table is assessed as **conditional**: the schema supports it fully, but the table is currently empty in the live database, meaning re-derivation depends on populating it from completed claims data before any re-derivation work can begin.

---

## 1. Scope Segmentation (Repair vs. Replace)

### 1.1 Tier 1 — ML Models

The six ML model JSON files (`engine.json`, `boot_lid.json`, `dashboard.json`, `left_front_door.json`, `right_front_door.json`, `roof.json`) each store a single set of scalar statistics: `p25`, `p50`, `p75`, `insample_iqr_coverage`, and `insample_mape_p50`. The `feature_names` array is empty in all six files, confirming that these are not gradient-boosted trees with learned features — they are static percentile stores derived from a training corpus at a fixed point in time (all trained `2026-05-14`).

**Scope segmentation: Absent.** There is a single P25/P50/P75 per component, with no separate repair-scope and replace-scope distributions. The training corpus from which these percentiles were derived is the same 7,625-row corpus used for Tier 2 (confirmed by the matching `trained_at` timestamps and `corpus_size` metadata in `component_benchmarks.json`). Since the Tier 2 corpus is not scope-segmented (see §1.2), the Tier 1 models are derived from blended observations.

The practical consequence is most acute for `engine` (n=1,133 training observations) and `roof` (n=173). Engine replacements are typically two to five times the cost of engine repairs; blending these into a single P50 produces a benchmark that is neither representative of repair-scope claims nor of replace-scope claims. The `insample_mape_p50` for engine is 283%, which is consistent with a bimodal distribution being summarised by a single median.

### 1.2 Tier 2 — Statistical Benchmarks (`component_benchmarks.json`)

The file contains 191 entries across 34 unique component IDs, generated from a corpus of 7,625 rows on 2026-05-14. The complete field schema for every entry is: `component_id`, `component_name`, `make`, `n`, `p25`, `median`, `p75`, `p95`, `min`, `max`, `confidence`. There are no `scope`, `repair_cost`, `replace_cost`, `part_type`, `part_origin`, or `side` fields anywhere in the file.

**Scope segmentation: Absent.** All submitted prices for a given component — regardless of whether the quote was for a repair operation or a replacement supply — are pooled into the same percentile distribution. A single `median` (P50) is used as the benchmark reference.

The `min`/`max` spread for scope-sensitive components reveals the extent of blending. For `engine`, the range is $8 to $42,000 across 1,133 observations. For `front_bumper`, the range is $7 to $144 (Toyota-specific sub-entry) up to $454 (all-makes). These ranges are too wide to be explained by market variation alone and are consistent with repair and replace observations being pooled.

### 1.3 Tier 3 — Legacy DB (`component_repair_outcomes`)

The `component_repair_outcomes` table schema (confirmed from `drizzle/schema.ts` lines 4931–4960) stores both `repair_cost_usd` and `replace_cost_usd` as separate decimal columns, and stores `outcome` as an enum (`repair`, `replace`, `write_off`). This is the correct schema for scope-segmented benchmark derivation.

However, the table is currently **empty** in the live database (total_rows = 0 confirmed by direct query). The table was designed as a learning corpus that accumulates records as claims are decided by adjusters, but no records have been written to it yet. This means:

- Scope-segmented Tier 3 benchmarks cannot be derived today because there is no source data.
- The feasibility assessment for re-derivation is conditional on first populating the table.

The `costLearningRecorder.ts` service is responsible for writing to this table after each claim decision. Whether it is being called correctly in the current pipeline is a separate investigation item.

---

## 2. Part-Type Segmentation (OEM / Aftermarket / Used)

### 2.1 Extraction — Stage 3

The `ExtractedQuoteLineItem` type (defined in `types.ts` line 382) includes a `part_origin` field typed as `"oem" | "aftermarket" | "reconditioned" | "used" | "unknown"`. This field is populated by the Stage 3 LLM extraction when the quote document explicitly states part origin. The `documentedLineItems` array (used for DB persistence) also carries `part_origin` at line 1492.

**Extraction status: Captured.** Part origin is extracted at Stage 3 when stated in the quote. The default is `"unknown"` when not stated.

### 2.2 Flow into Composite Engine

The `InputQuoteLineItem` type (defined in `quoteOptimisationEngine.ts` line 786) contains `componentName`, `costUsd`, `isRepair`, `isReplacement`, and `isNonPartCost`. It does **not** contain `part_origin`. The `InputQuoteWithLineItems` type (line 797) extends `InputQuote` with `lineItems?: InputQuoteLineItem[]`, and `part_origin` is not present.

**Part-type flow into composite: Discarded.** The `part_origin` field extracted at Stage 3 is not passed through to the composite engine. The `buildCompositeQuote()` function has no awareness of whether a submitted price is for an OEM, aftermarket, or used part.

### 2.3 Benchmark Tiers

None of the three benchmark tiers store part-type information. The Tier 2 `component_benchmarks.json` has no `part_origin` field. The Tier 1 ML model JSON files have no part-type feature. The Tier 3 `component_repair_outcomes` schema includes `partOrigin` (line 4950) but the table is empty.

**Part-type segmentation in benchmarks: Absent across all tiers.**

### 2.4 Components Most Exposed to OEM/Aftermarket Price Gap

The following components from the 34 Tier 2 entries and 6 Tier 1 components are most exposed to part-type comparability risk, based on known OEM-vs-aftermarket price differentials in the Southern African market:

| Component | Tier | n | Typical OEM/Aftermarket Gap | Exposure |
|---|---|---|---|---|
| `engine` | T1 + T2 | 1,133 | 3–8× | **Critical** — engine replacements are almost always OEM; repairs are labour-only |
| `dashboard` | T1 + T2 | 76 | 2–4× | **High** — OEM dashboards include airbag housings; aftermarket often excludes |
| `left_front_door` / `right_front_door` | T1 + T2 | 58 / 57 | 1.5–3× | **High** — OEM doors include wiring looms; aftermarket shells are significantly cheaper |
| `front_bumper` | T2 | 454 | 1.5–2.5× | **High** — most common component; aftermarket bumpers are widely available |
| `rear_bumper` | T2 | 354 | 1.5–2.5× | **High** — same as front bumper |
| `windscreen` | T2 | 230 | 1.3–2× | **Medium** — OEM glass with ADAS calibration is materially more expensive |
| `radiator` | T2 | 3,619 | 1.3–2× | **Medium** — aftermarket radiators are common; OEM required for turbocharged engines |
| `bonnet` | T2 | 303 | 1.2–1.8× | **Medium** — OEM bonnets with active pedestrian protection differ significantly |
| `boot_lid` | T1 + T2 | 146 | 1.2–1.5× | **Medium** |
| `fog_light` | T2 | 73 | 1.5–3× | **Medium** — OEM fog lights with integrated DRL differ significantly |
| `left_headlight` / `right_headlight` | T2 | 6 / 5 | 2–5× | **High** — OEM adaptive headlights vs. aftermarket fixed-beam; very small sample |
| `driver_airbag` / `passenger_airbag` | T2 | 6 / 18 | 1.5–2× | **High** — safety-critical; OEM is standard but aftermarket exists |
| `condenser` | T2 | 24 | 1.3–2× | **Medium** |
| `intercooler` | T2 | 32 | 1.5–2.5× | **Medium** |

The `left_headlight` and `right_headlight` entries are particularly concerning: with only 6 and 5 observations respectively, the benchmark is already statistically fragile, and part-type blending makes it additionally unreliable.

---

## 3. Side (L/R) Handling

### 3.1 Tier 2 — Statistical Benchmarks

The 34 unique component IDs in `component_benchmarks.json` include separate entries for `left_fender`, `right_fender`, `left_front_door`, `right_front_door`, `left_rear_door`, `right_rear_door`, `left_shock`, `right_shock`, `left_headlight`, `right_headlight`, and `right_side_mirror`. These are distinct component IDs — left and right are not collapsed into a single entry.

**Side handling in Tier 2: Correct.** Left and right variants are tracked as separate component IDs with separate percentile distributions. The `resolveComponent()` canonicalisation function in Stage 9 maps `"LH Headlamp"` and `"RH Headlamp"` to `left_headlight` and `right_headlight` respectively, preserving the distinction.

However, the sample sizes for side-specific components are small. `left_headlight` has n=6 and `right_headlight` has n=5 in the all-makes pool. `right_shock` has n=1. At these sample sizes, the percentile values are not statistically meaningful and should be treated as indicative only.

### 3.2 Tier 1 — ML Models

The Tier 1 ML models include `left_front_door` (n=58) and `right_front_door` (n=57) as separate models. No other side-specific Tier 1 models exist.

**Side handling in Tier 1: Partial.** Front doors are correctly separated. All other side-specific components (fenders, rear doors, shocks, headlights, mirrors) fall back to Tier 2 or Tier 3.

### 3.3 Asymmetric Componentry Risk

For most symmetric components (doors, fenders, shocks), left and right prices are genuinely comparable and the separation is primarily for tracking purposes. The comparability risk from side handling is low for these components.

The exception is components where left and right variants differ in hardware complexity due to vehicle architecture — specifically `steering_rack` (which is a single unit, not side-specific, but is currently tracked as a single entry with n=7) and any components that integrate with driver-side vs. passenger-side electronics. For the current 34-component set, no confirmed asymmetric pricing risk was identified beyond the sample-size concern for `right_shock` (n=1) and the headlight entries.

---

## 4. L2 Formula Asymmetric Behaviour — Confirmed Intentional

The L2 per-component selection formula is implemented at `quoteOptimisationEngine.ts` lines 1131–1200. The code comment at line 1133 reads:

> `CONFIRMED FORMULA (product owner, July 2026):`  
> `If K < lowestSubmitted AND deviation <= 30%: L2_component = K`  
> `Else: L2_component = lowestSubmitted  (30% floor or no benchmark)`  
> `L2_component <= lowestSubmitted for every component.`

The implementation at line 1178 enforces this exactly:

```typescript
if (p50 < lowestSubmitted && deviation <= MAX_MODEL_DISCOUNT_PCT) {
  // Benchmark is cheaper and within 30% — use benchmark
  l2Component = Math.round(p50 * 100) / 100;
} else {
  // 30% floor engaged or benchmark above market — use lowest submitted
  l2Component = Math.round(lowestSubmitted * 100) / 100;
}
```

When `p50 >= lowestSubmitted` (benchmark above market), the `else` branch fires and `l2Component = lowestSubmitted`. The benchmark is never used to justify a cost higher than the cheapest submitted quote. The `scopeDecisionRule` is set to `'BENCHMARK_ABOVE_MARKET'` in this case, making the decision auditable.

**Confirmed: The asymmetric behaviour is intentional design, not an oversight.** The product owner confirmation is documented inline in the source code. The rationale is sound for an insurer-side tool: the system should never use a benchmark to argue for a higher settlement than the market has already offered.

The one side-effect noted in the previous audit remains valid: when a benchmark is stale and above market, the system uses the lower submitted price silently without flagging benchmark staleness to the adjuster. The `BENCHMARK_ABOVE_MARKET` rule label is written to the `compositeLineItems` output and is available for display in the UI, but whether it is currently surfaced to adjusters is a UI implementation question.

---

## 5. Feasibility Assessment for Re-Deriving Segmented Benchmarks

### 5.1 Scope-Segmented Tier 3 Benchmarks

**Schema feasibility: High.** The `component_repair_outcomes` table already has the correct schema: separate `repair_cost_usd` and `replace_cost_usd` columns, an `outcome` enum, and `vehicle_make`/`vehicle_model` columns for make-specific segmentation. No schema changes are required.

**Data feasibility: Blocked.** The table is currently empty. Re-derivation requires populating it first. The path to population is:

1. Confirm that `costLearningRecorder.ts` is being called correctly after each claim decision. If it is not, fix the call site.
2. Allow the table to accumulate records from completed claims. Given the 7,625-row training corpus used for Tier 2, a comparable number of completed claims would be needed before scope-segmented benchmarks are statistically meaningful.
3. Once sufficient data is accumulated, re-run the benchmark generation script with a `GROUP BY component_name, outcome` clause to produce separate repair-scope and replace-scope P25/P50/P75 values.

The minimum viable threshold for a scope-segmented benchmark is approximately n=5 per scope per component. For high-frequency components (engine, front bumper, radiator), this threshold is likely reachable within the existing claims volume. For low-frequency components (headlights, shocks, control arms), new data collection may be required.

### 5.2 Part-Type-Segmented Benchmarks

**Schema feasibility: High.** The `component_repair_outcomes` table includes `part_origin`. The `ExtractedQuoteLineItem` type captures `part_origin` at Stage 3. The `documentedLineItems` persistence path carries `part_origin` to the DB.

**Data feasibility: Blocked by two gaps.** First, the table is empty (same blocker as §5.1). Second, the fill rate for `part_origin` in submitted quotes is unknown — it depends on how frequently panel beaters state part origin in their quotes. A fill-rate audit of the `quote_line_items` table (which stores extracted line items from submitted quotes) would establish whether sufficient part-origin-labelled observations exist to derive segmented benchmarks. This audit is recommended as a prerequisite.

### 5.3 Scope-Segmented Tier 2 Benchmarks

The 7,625-row training corpus used to generate `component_benchmarks.json` is not stored in the repository. The `generated_at` timestamp (2026-05-14) and `corpus_size` field confirm its existence at training time, but the source data is not available for re-derivation without access to the original corpus. **Additional information is required** to assess whether the source corpus contains scope labels that were discarded during benchmark generation, or whether scope was never captured.

### 5.4 Scope-Segmented Tier 1 ML Models

Re-deriving scope-segmented Tier 1 models requires: (a) a scope-labelled training corpus of sufficient size per component per scope, (b) a retraining pipeline, and (c) validation against held-out data. Given that the current models have `insample_mape_p50` values of 80–283%, the priority should be improving scope segmentation in Tier 3 first, then using the accumulated scope-labelled data to retrain Tier 1 models in a subsequent cycle.

---

## 6. Summary Table

| Dimension | Tier 1 (ML) | Tier 2 (Statistical) | Tier 3 (Legacy DB) | Re-derivation Feasibility |
|---|---|---|---|---|
| **Scope (repair/replace)** | Absent — blended P50 | Absent — blended median | Schema supports it; table empty | Conditional on populating `component_repair_outcomes` |
| **Part type (OEM/aftermarket)** | Absent | Absent | Schema supports it; table empty | Conditional on fill-rate audit of `quote_line_items` |
| **Side (L/R)** | Partial — front doors only | Correct — separate component IDs | Inherits from component ID | Not required — already handled |
| **L2 asymmetric behaviour** | N/A | N/A | N/A | Confirmed intentional (July 2026) |

---

## 7. Recommended Next Steps

The following actions are ordered by prerequisite dependency, not by priority.

**Step 1 — Confirm `costLearningRecorder.ts` is writing records.** Query `component_repair_outcomes` after a completed claim decision to confirm records are being written. If the table remains empty after a completed claim, the call site in the pipeline needs to be identified and fixed. This is a prerequisite for all subsequent steps.

**Step 2 — Audit `part_origin` fill rate in `quote_line_items`.** Run a query against the `quote_line_items` table to determine what percentage of extracted line items have a non-null, non-unknown `part_origin`. This establishes whether part-type-segmented benchmarks are feasible from existing data.

**Step 3 — Re-derive scope-segmented Tier 3 benchmarks once sufficient data exists.** Once `component_repair_outcomes` has accumulated records, re-run the benchmark generation with scope segmentation. The minimum viable threshold is approximately n=5 per scope per component for a benchmark to be used; below this threshold, fall back to the blended benchmark with a `SCOPE_INSUFFICIENT_DATA` flag.

**Step 4 — Pass scope through to the composite engine.** Add `scope: 'repair' | 'replace'` to `InputQuoteLineItem`. In `buildCompositeQuote()`, select the scope-appropriate benchmark (repair P50 or replace P50) rather than the blended P50. This is a bounded change once scope-segmented benchmarks exist.

**Step 5 — Surface `BENCHMARK_ABOVE_MARKET` to adjusters.** Confirm that the `scopeDecisionRule: 'BENCHMARK_ABOVE_MARKET'` label is displayed in the ComponentCostMatrix UI. If it is not, add a visual indicator so adjusters are aware when the benchmark has been superseded by a lower market price.

**Step 6 — Locate the Tier 2 training corpus.** Determine whether the 7,625-row source corpus contains scope labels. If it does, re-derive scope-segmented Tier 2 benchmarks without waiting for `component_repair_outcomes` to accumulate. If it does not, Tier 2 re-derivation must wait for Step 3.

---

*End of KINGA Benchmark Comparability Diagnosis*  
*Generated: July 2026 | Classification: Internal — Engineering*
