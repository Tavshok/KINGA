# KINGA Multi-Quote Composite Optimisation — Strategic Design

**Version:** 2.0  
**Date:** 2026-05-14  
**Author:** Manus AI  
**Status:** Design — approved for implementation

---

## 1. Problem Statement

The current quote optimisation engine treats each submitted quote as an atomic unit and selects the "best" quote as a whole. This is insufficient for three reasons:

1. **No quote is uniformly best.** Panel Beater A may price a radiator competitively but overcharge for a bonnet. Panel Beater B may do the opposite. The true optimal repair cost is a composite drawn from the best credible line item for each component across all quotes.

2. **The system has independent benchmark data.** The ML/statistical benchmark engine holds P25/P50/P75 market prices for 33 components derived from 7,625 validated claims. These represent market reality — not what any single panel beater charges — and must anchor the recommended cost range.

3. **Quotes contain components that do not match the damage assessment, and the damage assessment contains components that no quote covers.** Both cases carry distinct analytical and fraud implications that must be surfaced explicitly.

---

## 2. Three-Layer Cost Reference Model

Every claim produces three distinct cost figures. These must never be collapsed into a single number.

| Layer | Name | Definition | Business Purpose |
|-------|------|-----------|-----------------|
| **L1** | Submitted Quote Total | Total cost as submitted by the policyholder's chosen repairer | Authoritative document-sourced cost; the claim amount |
| **L2** | Composite Optimised Cost | Best credible line item per component drawn from all submitted quotes | Operationally achievable negotiation target |
| **L3** | Benchmark Reference Cost | Sum of P50 market prices for all damaged components (ML/statistical) | Independent statistical market truth |

**Savings reported separately and distinctly:**

| Metric | Formula | Meaning |
|--------|---------|---------|
| Negotiation Savings | `max(0, L1 − L2)` | What can be saved by directing the repairer to match the best prices from other quotes |
| Market Overprice Signal | `L2 − L3` | How much even the optimised composite exceeds the statistical market median |
| Total Savings Opportunity | `max(0, L1 − L3)` | Full gap between the submitted claim and market evidence |

This separation is strategically important for audit defensibility, regulator reviews, reinsurer reporting, SIU investigations, and panel beater performance scoring.

---

## 3. Component Classification Matrix

Before any cost computation, every component must be classified into one of four categories. This classification drives both the cost analysis and the report presentation.

| Category | Definition | Report Treatment |
|----------|-----------|-----------------|
| **Confirmed Damaged + Quoted** | Component appears in both the damage assessment and at least one quote | Full benchmark comparison; included in composite |
| **Quoted but Not Confirmed Damaged** | Component appears in one or more quotes but was NOT identified in the damage assessment | Flagged as potential scope inflation; shown separately with amber indicator |
| **Confirmed Damaged but Not Quoted** | Component identified in damage assessment but absent from all submitted quotes | Flagged as potential scope gap; shown with probability estimate |
| **Probable Hidden Damage** | Component not in damage assessment and not in any quote, but statistically probable given the collision pattern and damaged components | Shown as a probabilistic advisory with confidence band |

### 3.1 Quoted-but-Not-Damaged (Scope Inflation Detection)

When a line item appears in a quote but the component was not identified as damaged in the AI damage assessment, the system must:

1. Check whether the component is structurally adjacent to a confirmed damaged component (e.g., a headlamp bracket quoted alongside a confirmed headlamp — this is legitimate). Adjacent components within one structural zone are classified as **plausible scope extension**, not inflation.
2. If the component is not adjacent and not a known fitment/clip item, classify it as **potential scope inflation** and surface it with an amber flag.
3. Never automatically reject the line item. The assessor must make the final determination. The system provides the signal, not the decision.

**Report language (analytical, non-instructional):**
> "Component [X] appears in the submitted quotation but was not identified in the damage assessment. Assessor verification of physical damage is recommended."

### 3.2 Confirmed-Damaged-but-Not-Quoted (Scope Gap Detection)

When a component is confirmed damaged but absent from all submitted quotes, this has two possible explanations:

1. **Legitimate omission:** The repairer intends to include it under a catch-all labour line or will quote it separately after teardown.
2. **Quote incompleteness:** The quote is not a full-scope quote and should not be used as the sole basis for settlement.

The system flags these components and estimates their probable cost using the benchmark P50 as a reference. This estimate is clearly labelled as a **benchmark fill** — not a quoted price — and is shown in the report as an advisory.

**Report language:**
> "Component [X] identified as damaged in the assessment was not included in any submitted quotation. Benchmark reference pricing for this component is $[P50]. Assessor should confirm whether this component is included in the repairer's scope."

### 3.3 Probable Hidden Damage (Probabilistic Advisory)

Some components are statistically likely to be damaged given the collision pattern, even if not visually confirmed in the assessment photos. The system computes a **hidden damage probability** based on:

- Collision direction (front, rear, side, rollover)
- Confirmed damaged components (structural adjacency graph)
- Historical co-occurrence rates from the training corpus (e.g., "radiator damaged in 73% of claims where bonnet + front bumper are both confirmed damaged")

Components with a hidden damage probability ≥ 40% are shown in the report as a **probabilistic advisory** with the confidence band clearly stated.

**Report language:**
> "Based on the collision pattern and confirmed damage profile, [component X] has a [N]% probability of hidden damage. This is an advisory signal only. Physical inspection is required to confirm."

**Critical governance rule:** Probabilistic advisories must NEVER be included in the claim cost or the composite optimised cost. They are informational only. Including them in the payable amount would constitute an AI-driven cost inflation that is both legally and ethically indefensible.

---

## 4. Composite Quote Construction Algorithm

### Step 1: Build the Component-Level Quote Matrix

For each component in the **Confirmed Damaged + Quoted** category, build a matrix:

```
Component     | Quote A  | Quote B  | Quote C  | Benchmark P25 | P50  | P75
──────────────┼──────────┼──────────┼──────────┼───────────────┼──────┼──────
Radiator      | $450     | $380     | $520     | $310          | $492 | $680
Front Bumper  | $280     | $310     | —        | $180          | $265 | $390
Bonnet        | $600     | —        | $540     | $420          | $580 | $760
Headlamp (L)  | $220     | $195     | $210     | $140          | $208 | $310
```

### Step 2: Credibility Gate

For each line item, apply the credibility gate before it is eligible for selection:

- Price ≥ P25 × 0.70 (not suspiciously cheap — may exclude fitment, clips, or use unfit parts)
- Price ≤ P75 × 2.00 (not an obvious data entry error or scope mismatch)
- Source quote coverage ratio ≥ 0.40 (the quote covers ≥ 40% of damaged components — it is a real quote for this job)

Line items that fail the gate are shown in the matrix with a strikethrough and a note explaining which gate they failed.

### Step 3: Select Best Credible Price Per Component

From the credibility-gated prices, select the lowest for each component. Record the source quote.

If no line item passes the gate for a component, use the benchmark P50 as a **fill** (labelled distinctly).

### Step 4: Labour Optimisation (Single-Source Rule)

Labour is not mixed across quotes. The composite uses the lowest credible labour total from a single quote:

- Labour total ≥ 60% of the median labour total across all quotes
- Labour total ≤ 150% of the median labour total

If only one quote provides a labour total, use it regardless of the threshold (single-source fallback).

### Step 5: Composite Total

```
L2 = sum(best credible component prices) + best credible labour total
```

---

## 5. Negotiation Feasibility Score (NFS)

The NFS is an internal metric (not shown in the primary report) that measures whether L2 is realistically achievable operationally. A mathematically optimal composite may be commercially impractical if the best prices come from many different repairers.

**NFS components:**

| Factor | Measurement | Weight |
|--------|------------|--------|
| Concentration ratio | % of composite line items sourced from a single quote | 40% |
| Supplier overlap | Whether the best labour and best parts come from the same repairer | 25% |
| Geographic proximity | Whether all source repairers are in the same city/region | 20% |
| Parts ecosystem consistency | Whether OEM/aftermarket mix is consistent across selected items | 15% |

**NFS scale:** 0–100. Score ≥ 70 = "Operationally Achievable". Score 40–69 = "Partially Achievable". Score < 40 = "Analytically Optimal but Operationally Complex".

The NFS is stored internally and used for:
- Procurement optimisation analytics
- Preferred repairer routing
- Insurer network performance scoring

It is not shown in the primary forensic report to avoid creating the impression that the system is directing procurement decisions.

---

## 6. Quote Scoring (Benchmark-Aware)

The existing weight formula gains a benchmark alignment multiplier:

```
weight = coverage_ratio × confidence_score × (1 − structural_penalty) 
         × outlier_modifier × (0.70 + 0.30 × benchmark_alignment_ratio)
```

Where `benchmark_alignment_ratio` = (components with price in P25–P75 range) / (components with benchmark data).

The multiplier is intentionally modest (range: 0.70–1.00) to avoid:
- Unfairly penalising repairers in regions with limited benchmark data
- Distorting scores for rare vehicle makes with sparse training data
- Creating false suspicion from regional supply constraints

---

## 7. Report Language Governance

All report language must be **analytical and non-instructional**. The system is decision support infrastructure, not claims authority.

### Approved language patterns:

| Signal | Approved Wording |
|--------|-----------------|
| Price within benchmark | "Comparable market-aligned pricing identified." |
| Price above P75 | "Potential negotiation opportunity exists based on alternative credible quotations." |
| Price materially above P75 | "Pricing materially exceeds benchmark reference ranges. Assessor review recommended." |
| Scope inflation flag | "Component appears in quotation but was not identified in the damage assessment. Assessor verification recommended." |
| Scope gap flag | "Component identified as damaged was not included in any submitted quotation. Benchmark reference pricing: $[P50]." |
| Probabilistic advisory | "Based on the collision pattern, [component] has a [N]% probability of hidden damage. Physical inspection recommended." |

### Prohibited language:

- "must", "instruct", "should force", "repairer overcharging", "fraudulent pricing"
- Any language that implies the AI is making a settlement decision
- Any language that could be construed as coercive pricing direction

### Optional Operational Layer (future):

A separate "Negotiation Guidance Module" can be enabled per-tenant (disabled by default, internal-use only, non-customer-facing) that surfaces:
> "Suggested negotiation reference: [Repairer] quoted [component] at $[price]."

This module is architecturally separate from the forensic report and requires explicit insurer configuration.

---

## 8. Output Schema

### New fields on `Stage9Output`:

```typescript
// Three-layer cost model
compositeOptimisedCostCents: number;           // L2
benchmarkReferenceCostCents: number;           // L3
negotiationSavingsCents: number;               // max(0, L1 - L2)
marketOverpriceDeltaCents: number;             // L2 - L3
totalSavingsOpportunityCents: number;          // max(0, L1 - L3)

// Composite line items
compositeLineItems: CompositeLineItem[];

// Component classification
quotedNotDamagedComponents: QuotedNotDamagedFlag[];
damagedNotQuotedComponents: DamagedNotQuotedFlag[];
probableHiddenDamage: ProbableHiddenDamageAdvisory[];

// Negotiation Feasibility Score (internal)
negotiationFeasibilityScore: number;           // 0–100
negotiationFeasibilityLabel: 'achievable' | 'partial' | 'complex';

// Coverage
benchmarkCoverageComponents: number;           // How many components have benchmark data
quoteCount: number;                            // Number of quotes submitted
```

```typescript
interface CompositeLineItem {
  componentName: string;
  selectedCostUsd: number;
  selectedFromQuote: string;                   // Repairer name or "benchmark_fill"
  isBenchmarkFill: boolean;
  benchmarkVerdict: 'ABOVE_MARKET' | 'MARKET_RATE' | 'BELOW_MARKET' | 'NO_DATA';
  benchmarkSignal: string;                     // Approved language string
  p25Usd: number | null;
  p50Usd: number | null;
  p75Usd: number | null;
  allQuotedPrices: { quote: string; costUsd: number; passedGate: boolean; gateFailReason?: string }[];
}

interface QuotedNotDamagedFlag {
  componentName: string;
  quotedByRepairers: string[];
  totalQuotedCostUsd: number;
  isAdjacentToConfirmedDamage: boolean;
  classification: 'plausible_scope_extension' | 'potential_scope_inflation';
  reportSignal: string;                        // Approved language string
}

interface DamagedNotQuotedFlag {
  componentName: string;
  severity: string;
  benchmarkP50Usd: number | null;
  reportSignal: string;
}

interface ProbableHiddenDamageAdvisory {
  componentName: string;
  probabilityPct: number;                      // 0–100
  confidenceBand: string;                      // e.g. "35–55%"
  basisComponents: string[];                   // What confirmed damage drives this estimate
  reportSignal: string;
}
```

---

## 9. Implementation Sequence

1. Add new interfaces to `types.ts` — no runtime impact
2. Add `buildCompositeQuote()` and `computeNFS()` to `quoteOptimisationEngine.ts` — new functions, backward compatible
3. Add benchmark alignment multiplier to existing `validateQuote()` weight formula — optional param, backward compatible
4. Refactor `stage-9-cost.ts` to run benchmark assessment **before** `optimiseRepairCost()` — key structural change
5. Build component classification logic in `stage-9-cost.ts`
6. Compute composite quote and all three cost layers
7. Update `ForensicAuditReport.tsx` with three-layer summary, component matrix, and classification flags
8. Write vitest tests for composite construction, NFS, and component classification
