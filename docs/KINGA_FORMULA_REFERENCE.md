# KINGA AutoVerify AI — Voltron FDR Formula Reference

**Document type:** Canonical formula and inputs specification  
**Scope:** All critical calculations in the Voltron FDR pipeline (Stage 9 Cost Intelligence + `buildCompositeQuote`)  
**Code file:** `server/pipeline-v2/quoteOptimisationEngine.ts`  
**Last verified:** 2026-07-23

---

## 1. Definitions and Inputs

### 1.1 Primary Inputs

| Symbol | Name | Source | DB Column / Field |
|---|---|---|---|
| **Q₁…Qₙ** | Submitted quotes | Panel beaters | `panel_beater_quotes` |
| **L₁** | L1 baseline — lowest submitted quote total | `min(Q₁.total … Qₙ.total)` | `panel_beater_quotes.quoted_amount / 100` |
| **Cᵢⱼ** | Component price: component *i* from quote *j* | Line items | `quote_line_items.line_total` |
| **P25ᵢ** | Benchmark 25th percentile for component *i* | KINGA benchmark DB | `component_benchmarks.p25_usd` |
| **P50ᵢ** | KINGA model price for component *i* (P50) | KINGA benchmark / ML model | `component_benchmarks.p50_usd` |
| **P75ᵢ** | Benchmark 75th percentile for component *i* | KINGA benchmark DB | `component_benchmarks.p75_usd` |
| **Lⱼ** | Labour total from quote *j* | Extracted from quote | `panel_beater_quotes.labour_cost` |
| **Rⱼ** | Coverage ratio of quote *j* | Computed (see §2.1) | — |

### 1.2 Calibration Constants

| Constant | Value | Meaning |
|---|---|---|
| `MAX_MODEL_DISCOUNT_PCT` | **0.30** | Maximum fraction by which KINGA model may be below lowest submitted price |
| `OUTLIER_THRESHOLD_PCT` | **30%** | Quote-level outlier flag: total > 30% above median of all quotes |
| `CG_MIN_COVERAGE_RATIO` | **0.40** | Minimum fraction of all damaged components a quote must cover to pass the credibility gate |
| `CG_P25_FLOOR_FACTOR` | **0.70** | Per-component credibility floor: price must be ≥ P25 × 0.70 |
| `CG_P75_CEILING_FACTOR` | **2.00** | Per-component credibility ceiling: price must be ≤ P75 × 2.00 |
| `LABOUR_CRED_LOWER` | **0.60** | Labour credibility lower bound: reject labour below 60% of median labour |
| `LABOUR_CRED_UPPER` | **1.50** | Labour credibility upper bound: reject labour above 150% of median labour |

---

## 2. Formula Definitions

### 2.1 Coverage Ratio

For each quote *j*, the coverage ratio measures what fraction of all damaged components it prices:

```
Rⱼ = (number of components in quote j that appear in ANY quote) / (total unique components across ALL quotes)
```

A quote with `Rⱼ < 0.40` fails the credibility gate for all its line items.

### 2.2 Per-Component Credibility Gate

Before a submitted price `Cᵢⱼ` can enter the component matrix, it must pass three checks:

```
GATE PASS conditions (all must be true):
  (a) Rⱼ ≥ 0.40                          — quote covers enough of the damage scope
  (b) Cᵢⱼ ≥ P25ᵢ × 0.70  (if P25ᵢ known) — price is not implausibly low (fitment exclusion risk)
  (c) Cᵢⱼ ≤ P75ᵢ × 2.00  (if P75ᵢ known) — price is not a data entry error or scope mismatch
```

A price that fails the gate is **not discarded** — it is retained as a fallback but labelled `passedGate = false`. The optimiser prefers gated prices; if no gated price exists for a component, the lowest ungated price is used.

### 2.3 L2 Per-Component Selection Formula

This is the core KINGA optimisation formula. For each component *i*:

**Step 1 — Find the best submitted price:**
```
bestSubmitted_i = min(Cᵢⱼ for all j where passedGate = true)
                  OR min(Cᵢⱼ for all j) if no gated price exists
```

**Step 2 — Compare against KINGA model price (P50):**
```
deviation_i = (bestSubmitted_i − P50_i) / bestSubmitted_i
```

**Step 3 — Apply the 30% rule:**
```
IF P50_i < bestSubmitted_i AND deviation_i ≤ 0.30:
    selectedPrice_i = P50_i          ← KINGA model wins (cheaper and realistic)
    tier = T1 (ML model) or T2 (statistical benchmark)

ELSE:
    selectedPrice_i = bestSubmitted_i ← Submitted price wins
    tier = T3 (multi-quote competition) or T4 (single quote)
```

**Plain language:** Compare the lowest credible submitted price against the KINGA model price. If the model is cheaper and the difference is within 30%, take the model price. If the submitted price is cheaper, or if the model is more than 30% below the submitted price (suggesting the model may be calibrated to a different market), take the submitted price.

**When no P50 is available:**
```
selectedPrice_i = bestSubmitted_i    (tier = T3 or T4)
```

**When no submitted prices exist for a component:**
```
selectedPrice_i = P50_i              (tier = T1 or T2, benchmark fill)
```

### 2.4 Composite Parts Total

```
compositePartsUsd = Σ selectedPrice_i  for all components i
```

### 2.5 Labour Selection Formula (Single-Source Labour Rule)

Labour is **not** mixed across quotes. The lowest credible labour total from a single quote is used:

**Step 1 — Compute median labour across all quotes:**
```
medianLabour = median(L₁, L₂, … Lₙ)
```

**Step 2 — Apply credibility band:**
```
credibleLabour = { Lⱼ : medianLabour × 0.60 ≤ Lⱼ ≤ medianLabour × 1.50 }
```

**Step 3 — Select best:**
```
IF credibleLabour is non-empty:
    bestLabourUsd = min(credibleLabour)
ELSE (all labour values are outliers):
    bestLabourUsd = min(L₁, L₂, … Lₙ)   ← fallback: use lowest regardless
```

**Rationale for single-source rule:** Labour rates are repairer-specific and not independently comparable at the component level. Mixing labour from different repairers would produce a cost that no single repairer would actually charge.

### 2.6 L2 Composite Optimised Cost

```
L2 = compositePartsUsd + bestLabourUsd
```

### 2.7 Savings Metrics

Three savings metrics are computed:

| Metric | Formula | Meaning |
|---|---|---|
| **Negotiation Savings** | `max(0, L1 − L2)` | How much the insurer saves by using the KINGA composite vs the lowest submitted quote |
| **Market Overprice Delta** | `L2 − benchmarkReference` | How much the composite exceeds the pure benchmark reference (can be negative) |
| **Total Savings Opportunity** | `max(0, L1 − benchmarkReference)` | Maximum theoretical savings if all components were priced at benchmark P50 |

Where:
```
benchmarkReference = Σ P50_i  for all components i where P50 is available
```

### 2.8 Quote-Level Outlier Flag

Before the composite is built, each submitted quote is checked for inflation:

```
medianTotal = median(Q₁.total, Q₂.total, … Qₙ.total)
deviationPct_j = ((Qⱼ.total − medianTotal) / medianTotal) × 100

IF deviationPct_j > 30%:
    quote j is flagged as INFLATED (retained but flagged in the report)
```

This is a **quote-level flag only** — it does not remove the quote from the component matrix. Individual component prices from an inflated quote can still be selected if they are the lowest credible price for that component.

### 2.9 Benchmark Verdict per Component

After `selectedPrice_i` is determined, a benchmark verdict is assigned for the report:

| Verdict | Condition |
|---|---|
| `BELOW_MARKET` | `selectedPrice_i < P25_i` |
| `MARKET_RATE` | `P25_i ≤ selectedPrice_i ≤ P75_i` |
| `ABOVE_MARKET` | `selectedPrice_i > P75_i` |
| `NO_DATA` | P25 or P75 not available |

---

## 3. Tier Classification

Each selected component price is assigned a tier that explains its source:

| Tier | Label | Condition |
|---|---|---|
| **T1** | ML Model | KINGA ML model price used; model is cheaper than submitted AND within 30% |
| **T2** | Market Benchmark | KINGA statistical benchmark (P50) used; same conditions as T1 but source is statistical |
| **T3** | Best Quote | Submitted price used; 2 or more quotes competed for this component |
| **T4** | Quoted | Submitted price used; only 1 quote covered this component |

---

## 4. Data Flow — Stage 9 to Report

```
DB: panel_beater_quotes + quote_line_items
        ↓
Stage 9 (stage-9-cost.ts)
  → resolvedExtractedQuotes (with line_items[] attached)
  → buildCompositeQuote(quotes, benchmarks, l1TotalUsd)
        ↓
quoteOptimisationEngine.ts
  → compositeOptimisedCostUsd   (L2)
  → negotiationSavingsUsd       (L1 − L2)
  → compositeLineItems[]        (per-component breakdown)
  → bestLabourUsd
  → compositePartsUsd
        ↓
costIntelligenceJson (stored in DB)
  → l2CompositeOptimisedCostUsd
  → kingaSavingsL2OptimisedUsd
        ↓
FDR / CIR reports read:
  → compositeOptimisation.l2CompositeOptimisedCostUsd
  → costIntel.kingaSavingsL2OptimisedUsd
```

---

## 5. Known Calibration Notes

The following constants are marked in the code as **engineering-judgment values** that should not be changed without benchmarking against labelled data:

- `LABOUR_CRED_LOWER = 0.60` and `LABOUR_CRED_UPPER = 1.50` — the labour credibility band was set by engineering judgment. It should be validated against a dataset of labelled labour costs before being treated as definitive.
- `CG_P25_FLOOR_FACTOR = 0.70` — the 30% discount below P25 as the credibility floor is a conservative estimate. If KINGA's benchmark dataset has high variance, this may need to be tightened.
- `CG_P75_CEILING_FACTOR = 2.00` — the 2× P75 ceiling is intentionally permissive to avoid rejecting legitimate high-cost repairs. It may need tightening for high-value components.

---

## 6. What the Formula Does NOT Cover

The following are **not** part of the `buildCompositeQuote` formula and are handled separately:

- **Total Loss determination** — handled by `costDecisionEngine.ts` using a separate write-off threshold
- **Fraud scoring** — handled by `fraudDetectionEngine.ts`
- **Structural damage assessment** — handled by earlier pipeline stages (Stage 3–6)
- **VAT / tax adjustments** — not applied in the optimisation layer; all prices are treated as submitted (inclusive or exclusive of VAT depending on the repairer's quote format)
