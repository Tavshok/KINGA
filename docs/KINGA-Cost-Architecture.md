# KINGA — Cost Optimisation & Benchmark Learning Architecture

**Document type:** Internal Technical Reference  
**Audience:** Product, engineering, and actuarial stakeholders  
**Status:** Discovery documentation — no code changes  
**Date:** July 2026

---

## Overview

This document describes, end to end, how KINGA processes submitted repair quotes into a defensible optimised cost, how benchmark reference data is sourced and tiered, and whether a feedback loop exists that updates those benchmarks from real claim outcomes. It is written so that a non-engineer stakeholder can follow the logic, while remaining precise enough to support engineering decisions.

---

## Section 1 — Quote Optimisation Logic

### 1.1 From Damage Detection to `lCompositeOptimisedCostUsd`

The cost optimisation pipeline begins at Stage 6, where a computer-vision pass over claim photographs produces a list of damaged parts with per-component severity labels (`cosmetic`, `minor`, `moderate`, `severe`, `catastrophic`). This list is the authoritative source of what needs to be repaired or replaced. Stage 9 then receives both this damage list and the extracted repair quotes from Stage 3, and runs the following sequence.

**Canonicalisation.** Every component name — whether it comes from the Stage 6 damage list or from a quote line item — is passed through `resolveComponent()` in `shared/vehicleParts.ts`. This function resolves aliases and shorthands to a single canonical display name using a three-step cascade: exact alias match against the `VEHICLE_PARTS` catalogue, then substring containment for keys of four or more characters, then token-overlap matching requiring at least two shared tokens. Examples of what this collapses: `"LH Headlamp"`, `"Left Head Light"`, and `"Headlight Assembly (Left)"` all resolve to the same canonical entry. A local `SYNONYM_MAP` in `quoteOptimisationEngine.ts` provides an additional layer of normalisation for common shorthand forms (`"bonnet"` → `"bonnet/hood"`, `"F/B"` → `"front bumper assembly"`, etc.), and `normalise()` delegates to `resolveToCanonical()` from the same catalogue as its single source of truth.

**Deduplication.** After canonicalisation, a `seenCanonicalIds` set ensures that multiple raw names that resolve to the same canonical ID are counted only once in the component list. This prevents double-counting when, for example, a Stage 6 damage list contains both `"front bumper"` and `"bumper assembly"`.

**Quote matching.** For each canonical component name, Stage 9 scans all extracted quote line items using the same `resolveComponent()` path. If the resolved IDs match, the line item is attributed to that component. If no canonical ID match is found, a fallback token-overlap check is used with a minimum similarity threshold of 0.40 (i.e., at least 40% of tokens must overlap between the damage component name and the quote line item description). This fallback is calibrated conservatively to avoid false matches on generic terms.

**Sub-line bundling.** When a quote contains multiple rows for the same component (for example, separate rows for parts cost and labour cost on the same headlight), the composite engine groups them by `normName + scope` key before building the component matrix. The costs are summed within each group, so the total cost of operation for that component in that quote is the combined parts-plus-labour figure, not just the parts price. Standalone overhead rows that are not tied to any specific component (general workshop fees, VAT lines) are excluded from the normalised total.

**Repair-vs-replace scope selection.** When a quote contains both a repair-scope row and a replace-scope row for the same component, the engine resolves the conflict using the Stage 6 severity signal. If severity is `severe` or `catastrophic`, or if the component is safety-critical (airbags, seat belts, chassis members), the replace-scope cost is always used. For all other severity levels, the lower-cost scope is preferred. Safety-critical components for which only a repair-scope quote is available are flagged as data gaps and excluded from the normalised total, because a replacement-scope quote is required but absent.

**The composite matrix.** Once each quote is normalised to a per-component cost, the engine builds a cross-quote component matrix: for every canonical component that appears in at least one quote, it collects all submitted prices from all repairers. This matrix is the input to the L2 selection step.

**L2 per-component selection.** For each component in the matrix, the engine applies the following confirmed formula:

> Let `lowestSubmitted_c` = the minimum price across all quotes for component *c*.  
> Let `K_c` = the KINGA benchmark P50 for component *c*.  
> Let `deviation_c` = |`lowestSubmitted_c` − `K_c`| / `lowestSubmitted_c`.  
> If `K_c` < `lowestSubmitted_c` **and** `deviation_c` ≤ 30%: use `K_c` as the L2 component cost.  
> Otherwise: use `lowestSubmitted_c`.

The 30% floor prevents the benchmark from being applied when the gap between the benchmark and the submitted price is so large that using the benchmark would be operationally unrealistic. When the benchmark is applied, the composite line item records `selectedFromQuote = "kinga_benchmark"` and `kingaOptimisedTier = "T1"`. When the lowest submitted price is used, the line item records the repairer name and `kingaOptimisedTier = "T3"`. `lCompositeOptimisedCostUsd` is the sum of all per-component L2 selections.

### 1.2 L1 and L2 Independence

**L1** is computed independently of L2. It is the lowest total quoted cost across all submitted repair quotes, filtered to `document_category = "repair_quote"` (or `quote_type ≠ "parts_supplier"` for legacy data). Parts supplier quotes, assessor fee invoices, and agreed-cost settlement documents are excluded from L1 because they are not repairer estimates. L1 represents the best available package deal from a single repairer.

**L2** is the per-component cherry-pick: for each component, the cheapest credible price from any repairer, subject to the 30% benchmark floor. L2 may exceed L1 in cases where the 30% floor engages on most components and no single repairer is cheapest across the board. KINGA reports both figures; the insurer may authorise at L1 when L2 exceeds it.

**KINGA savings** = L1 − L2. This is the headline value proposition: the amount the insurer saves by using per-component optimisation rather than approving the cheapest submitted quote as a whole.

### 1.3 `true_cost_usd` Decision Logic

The `costDecisionEngine.ts` module resolves the single authoritative cost figure for a claim using a strict two-step hierarchy:

| Priority | Condition | `true_cost_usd` | `cost_basis` |
|---|---|---|---|
| 1 | POST_ASSESSMENT mode **and** `agreed_cost_usd` > 0 | `agreed_cost_usd` | `assessor_validated` |
| 2 | `optimised_cost_usd` > 0 (either mode) | `optimised_cost_usd` (= L1 weighted average) | `system_optimised` |
| 3 | Neither available | 0 | `system_optimised` (triggers manual review anomaly) |

In PRE_ASSESSMENT mode, no agreed cost exists yet, so `true_cost_usd` is always the system-optimised baseline. In POST_ASSESSMENT mode, the assessor-agreed cost always overrides the system baseline. The AI estimate (`ai_estimate_usd`) is never used as the `true_cost_usd`; it appears only in the deviation analysis as a reference signal.

The `optimised_cost_usd` that feeds priority 2 is the output of the legacy `quoteOptimisationEngine` (a weighted average of structurally complete quotes), not the L2 composite. The L2 composite (`lCompositeOptimisedCostUsd`) is a separate, newer signal that is reported alongside `true_cost_usd` but does not currently override it.

---

## Section 2 — Benchmark Sourcing

### 2.1 The Three-Tier Hierarchy

For each damaged component, Stage 9 runs a hybrid benchmark lookup that routes through three tiers in strict priority order:

| Tier | `modelSource` | UI badge | Condition for use | Sample-size threshold |
|---|---|---|---|---|
| 1 | `ml` | `ML★` | A GBM quantile regression model file exists for this `componentId` in `server/pipeline-v2/ml-models/` | Model trained on n ≥ 57 (smallest current model: `right_front_door`, n = 57) |
| 2 | `statistical` | `Stat★ n=N` | A row exists in `component_benchmarks.json` for this `componentId` with `n ≥ 10` | n ≥ 10 (make-specific); global fallback has no minimum beyond what is in the file |
| 3 | `db_legacy` | `Legacy n=N` | A row exists in the `component_repair_outcomes` DB table for this component name | Minimum 1 row; IQR computed on whatever sample is available |
| — | `none` | `No Data` | None of the above | — |

The tier is determined at runtime for each component individually. A component that has an ML model file will always use Tier 1, regardless of how many statistical or legacy records exist. A component without an ML model but with a `component_benchmarks.json` entry will use Tier 2. Only if both are absent does the engine fall back to the live DB query.

### 2.2 What "Vehicle-Make Filtered" Means

Vehicle-make filtering is applied at Tier 2 and Tier 3 only. The ML models (Tier 1) already incorporate make as a feature in the GBM tree (`make_ordinal` feature derived from the `make_categories` array in the model file), so no separate make filter is needed.

For Tier 2 (statistical), the engine first searches `component_benchmarks.json` for a row where `component_id` matches **and** `make` matches the vehicle's make (case-insensitive, title-cased). If a make-specific row with `n ≥ 10` is found, it is used. Otherwise the engine falls back to the global row where `make = null`. The filter is **make only** — not make+model, not make+model+year, and not region. The `vehicleMakeFiltered` flag in the output records whether the make-specific or global row was used.

For Tier 3 (legacy DB), the same make-first, global-fallback pattern applies: the query filters `LOWER(vehicleMake) = LOWER(inputMake)` first, then retries without the make filter if no rows are returned.

---

## Section 3 — The Learning Mechanism

### 3.1 Direct Answer: What Exists and What Does Not

**The ML models (Tier 1) and the statistical benchmark file (Tier 2) are static.** They were trained once on a 7,625-row corpus as of 14 May 2026 and are stored as static files (`ml-models/*.json` and `component_benchmarks.json`). There is no automated process that retrains or updates these files from incoming claims. Retraining requires a manual offline step.

**Two separate learning mechanisms do exist**, but neither updates the Tier 1 or Tier 2 benchmarks in real time:

**Mechanism A — Stage 9 Cost Learning Corpus** (`costLearningRecorder.ts`). After each claim assessment, Stage 9 attempts to write a `CostLearningRecord` to the database. This record stores the claim's `true_cost_usd`, `cost_basis`, `case_signature` (a human-readable descriptor of the claim type), per-component relative cost weights, and quality flags. It does **not** store raw component prices as benchmark values. The record is an analytics pattern — it describes the cost structure of the claim in relative terms — and is intended to serve as training data for future model retraining, not as a live benchmark update.

**Mechanism B — Repair Cost Intelligence Loop** (`repair-intelligence/learning-loop.ts`). A separate module updates the `repair_cost_intelligence` table after each completed or closed claim. It derives a coarse `damageCategory` from claim metadata, then upserts a rolling median repair cost for that vehicle make/model/damage category combination. Confidence tiers are assigned based on claim count: `high` when count ≥ 20, `medium` when count ≥ 10, `low` below that. This table is a whole-claim rolling median keyed on vehicle descriptor and damage category, not a per-component benchmark. It is a separate subsystem from the hybrid benchmark engine and is not currently consumed by Stage 9's benchmark lookup.

### 3.2 Update Cadence

Mechanism A (Stage 9 learning corpus) writes per-claim in real time, fire-and-forget, as part of the Stage 9 pipeline. Mechanism B (repair cost intelligence) is triggered after a claim is marked completed or closed. Neither mechanism updates the Tier 1 ML models or the Tier 2 statistical benchmark file, which require offline retraining.

### 3.3 Admission Gate for the Stage 9 Learning Corpus

The `checkValidatedOutcomePolicy()` function in `costLearningRecorder.ts` gates every record before it is written:

| Condition | Decision |
|---|---|
| `cost_basis = "assessor_validated"` (any confidence) | **Accept** — human assessor review is the highest validation |
| `cost_basis = "system_optimised"` and `confidence ≥ 60` | **Accept** — high-confidence system baseline |
| `cost_basis = "system_optimised"` and `confidence < 60` | **Reject** — insufficient validation |
| `cost_basis = null` or `true_cost_usd ≤ 0` | **Reject** — no cost signal |

### 3.4 Contamination Safeguard — Gap Identified

**There is no explicit exclusion for claims with elevated fraud risk before a record is admitted to the Stage 9 learning corpus.** The admission gate checks cost basis and confidence score, but it does not check the claim's fraud risk score, forensic findings, or whether the settlement was disputed. A claim that passes the confidence threshold but carries a high XV (cross-vehicle) fraud risk score, a contradictory forensic finding, or an inflated assessor-agreed cost will be admitted to the learning corpus without any flag or exclusion.

This is a material gap. If inflated agreed costs from fraudulent or disputed settlements are admitted, they will enter the training data used for future model retraining. Because the statistical and ML benchmarks are retrained from this corpus, a systematic pattern of inflated settlements on a particular component type could gradually raise the "normal" benchmark price for that component, which would in turn reduce the sensitivity of future fraud detection on the same component type. The risk is not immediate (the current benchmarks are static), but it will become active at the next retraining cycle.

The Mechanism B rolling median (repair cost intelligence) has the same gap: it uses the accepted or lowest quote cost from any completed claim without checking fraud risk.

### 3.5 Drift Monitoring — Gap Identified

**There is no active drift monitoring on the benchmark values.** A `calibrationDriftDetector.ts` module exists in the codebase and defines logic for flagging cost drift greater than 20% and severity mismatch greater than 20% across validated outcome windows. However, this module analyses already-validated prediction-vs-actual records; it does not monitor whether the benchmark percentile values themselves are trending in a direction inconsistent with genuine market data. There is no scheduled job, alert, or dashboard that would surface a systematic upward drift in benchmark P50 values caused by contaminated training data.

---

## Section 4 — Data Provenance for Each Benchmark Tier

### 4.1 Tier 1 — ML Models (`modelSource: "ml"`)

| Attribute | Value |
|---|---|
| File location | `server/pipeline-v2/ml-models/{componentId}.json` |
| Components covered | 6: `engine`, `boot_lid`, `roof`, `dashboard`, `left_front_door`, `right_front_door` |
| Training corpus size | 7,625 rows (shared with Tier 2 statistical benchmark) |
| Training vintage | 14 May 2026 |
| Model type | GBM quantile regression (three models per component: P25, P50, P75) |
| Features | `make_ordinal` (vehicle make as ordinal integer) + `vehicle_age` (years) |
| In-sample IQR coverage | 40–57% (varies by component; `left_front_door` lowest at 40%, `dashboard` highest at 57%) |
| In-sample MAPE P50 | 80–283% (high variance; `right_front_door` best at 80%, `engine` worst at 283%) |
| Last refreshed | Never since initial training; static file |
| Update mechanism | Manual offline retraining required |

The high MAPE values on some components (particularly `engine` at 283%) reflect the wide natural price variance for those components across makes, models, and repair types, rather than a model deficiency per se. The IQR coverage metric (what fraction of test cases fall within the predicted P25–P75 band) is the more operationally relevant figure.

### 4.2 Tier 2 — Statistical Benchmarks (`modelSource: "statistical"`)

| Attribute | Value |
|---|---|
| File location | `component_benchmarks.json` (project root) |
| Components covered | 34 component IDs |
| Vehicle makes covered | 73 (make-specific rows) + global fallback rows |
| Training corpus size | 7,625 rows |
| Generated | 14 May 2026 |
| Confidence tiers | `HIGH` (n ≥ 163 in current data), `MEDIUM`, `LOW` |
| Minimum n for make-specific | 10 |
| Last refreshed | Never since initial generation; static file |
| Update mechanism | Manual regeneration from updated corpus required |

The confidence tier labels (`HIGH`, `MEDIUM`, `LOW`) in the JSON file are assigned at generation time based on sample size. The UI `Stat★ n=N` badge displays the `n` value directly from this file.

### 4.3 Tier 3 — Legacy DB (`modelSource: "db_legacy"`)

| Attribute | Value |
|---|---|
| DB table | `component_repair_outcomes` |
| Query function | `getComponentBenchmarks()` in `server/db.ts` |
| Percentile computation | Computed live from raw rows at query time (sort + index arithmetic) |
| Make filtering | Make-specific first (exact case-insensitive match), global fallback |
| Fallback table | `component_benchmarks` DB table, queried by `getComponentBenchmarksFromTrainingData()` |
| Original data source | Seeded from a training parquet file at project initialisation |
| Refresh history | **Not documented; no refresh has been recorded since initial seed** |
| Update mechanism | Manual re-seed or adjuster-outcome write-back required |

The legacy DB tier is the most opaque in terms of provenance. The `getComponentBenchmarksFromTrainingData()` function comment states the table was "seeded from training parquet," but there is no record in the codebase of when that parquet was generated, what claims it was derived from, or whether it has ever been updated. The `component_repair_outcomes` table is written to by the `repairReplaceEngine.ts` module when adjuster outcomes are recorded, which means it does grow over time — but there is no documented baseline for what was in the table at initial seed.

---

## Section 5 — Summary of Gaps for Follow-Up

The following items were identified during this discovery pass. No code changes are proposed here; these are flagged for prioritisation.

| # | Gap | Risk level | Affected tier |
|---|---|---|---|
| G-1 | **No fraud-risk exclusion in learning corpus admission gate.** Claims with high XV risk or disputed settlements are admitted to the Stage 9 learning corpus and the repair cost intelligence table without any check. At the next retraining cycle, inflated settled costs could raise benchmark P50 values for affected components. | **High** — benchmark integrity risk | Tier 1 & 2 (at retraining), Tier 3 (live) |
| G-2 | **No benchmark drift monitoring.** There is no scheduled job or alert that detects systematic upward drift in benchmark percentile values. Contamination from G-1 would be silent until a manual audit. | **High** — detection gap | All tiers |
| G-3 | **Legacy DB provenance undocumented.** The `component_benchmarks` and `component_repair_outcomes` tables were seeded from a training parquet at project initialisation, but the vintage, source, and refresh history of that parquet are not recorded anywhere in the codebase. | **Medium** — audit/compliance risk | Tier 3 |
| G-4 | **Static Tier 1 and Tier 2 benchmarks.** The ML models and statistical benchmark file have not been updated since 14 May 2026. As the live claims corpus grows, the benchmarks will become increasingly stale. There is no scheduled retraining pipeline. | **Medium** — accuracy drift over time | Tier 1 & 2 |
| G-5 | **Mechanism B (repair cost intelligence) not consumed by Stage 9.** The rolling median table updated by `learning-loop.ts` is not queried by the hybrid benchmark engine. It exists as a parallel data store with no current consumer in the cost optimisation path. | **Low** — wasted computation | Tier 3 (parallel) |
| G-6 | **Quote extraction non-determinism.** Stage 3 LLM extraction runs at default temperature, causing variance in line-item splitting and description normalisation across re-runs of the same claim. This produces different `quoteDeviationPct` values on re-assessment. Fixing this requires setting `temperature: 0` for the extraction step and caching extracted line items in the DB on first extraction. | **Medium** — reproducibility | Quote extraction |

---

*End of document.*
