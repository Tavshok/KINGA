# KINGA Cost Intelligence Flow

**Author:** Tavonga Shoko, Lead Engineer

This diagram traces the complete path from a submitted repair quote PDF to the KINGA Optimised cost figure stored in the database.

```mermaid
flowchart TD
    A([Panel Beater submits\nrepair quote PDF or\nweb form]) --> B{Submission type}
    B -->|PDF upload| C[Stage 9: Quote Extraction\nquoteExtractionEngine.ts\nLLM OCR — extracts per-line prices]
    B -->|Web form| D[quotes.submit procedure\nquotes-core.ts\nStructured line items saved directly]
    C --> E[(quote_line_items table\nper-component prices)]
    D --> E
    E --> F[buildCompositeQuote\nquoteOptimisationEngine.ts\nPer-component minimum selection]
    F --> G{Benchmark data\navailable?}
    G -->|Yes — within 15% of P50| H[T1: Use benchmark P50\nMost accurate price]
    G -->|Yes — 15–30% above P50| I[T2: Adjusted benchmark\nP50 × 1.15 cap]
    G -->|No benchmark / >30% deviation| J[T3: Lowest submitted quote\nMarket price]
    G -->|Not in any quote| K[T4: Unpriced\nFlag for manual review]
    H & I & J --> L[Composite line items\nOne price per component\nfrom best source]
    K --> L
    L --> M{Minimum floor check\nBenchmark fills present?}
    M -->|Yes — composite < lowest quote| N[Apply floor:\ncomposite = lowest submitted total]
    M -->|No — composite ≥ lowest quote| O[Use composite as-is]
    N & O --> P[(ai_assessments\ncostIntelligenceJson\nl2CompositeOptimisedCostUsd)]
    P --> Q[Benchmark learning feed\nstage-9-cost.ts\nWrite selected prices to\ncomponent_repair_outcomes]
    Q --> R[(component_repair_outcomes\nGrows with every claim)]
    R --> S[Next claim:\nbetter benchmark data]

    style A fill:#1e3a5f,color:#fff
    style P fill:#1e5f3a,color:#fff
    style R fill:#3a5f1e,color:#fff
    style N fill:#7a4f00,color:#fff
```

## Critical Field Names

| Field | Location | Description |
|---|---|---|
| `l2CompositeOptimisedCostUsd` | `costIntelligenceJson.compositeOptimisation` | **KINGA Optimised total** — the canonical optimised cost |
| `documentedAgreedCostUsd` | `costIntelligenceJson` | Lowest submitted quote total — recommended settlement reference |
| `documentedOriginalQuoteUsd` | `costIntelligenceJson` | Highest submitted quote total |
| `compositeLineItems` | `costIntelligenceJson.compositeOptimisation` | Per-component selected prices with source (T1/T2/T3) |

> **Common mistake:** Do not read `compositeOptimisedCostUsd` — this field does not exist in DB data. Always use `l2CompositeOptimisedCostUsd`.

## Pricing Tier Summary

| Tier | Condition | Source | Accuracy |
|---|---|---|---|
| T1 | Benchmark exists, submitted within 15% of P50 | Benchmark P50 | Highest |
| T2 | Benchmark exists, submitted 15–30% above P50 | P50 × 1.15 cap | High |
| T3 | No benchmark, or deviation >30% | Lowest submitted price | Market |
| T4 | Component not in any quote | Unpriced | Requires manual review |

## What Feeds the Benchmark

Every T1, T2, and T3 selection is written back to `component_repair_outcomes` after Stage 9 completes. This means:
- Every claim processed makes future cost optimisation more accurate
- The benchmark grows automatically — no manual data entry required
- Paint, sundries, and labour are included (fixed Aug 2026 — previously excluded)
