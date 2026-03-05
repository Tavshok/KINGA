# Repair Quote Intelligence Layer — Architecture Design

## Audit Findings

### Existing Modules

| Module | File | Role |
|--------|------|------|
| AI Damage Detection | `server/db.ts` (processClaimWithAI) | Calls GPT-4 Vision on damage photos; outputs `damagedComponentsJson` (array of `{name, location, damageType, severity}`) stored in `ai_assessments.damaged_components_json` |
| Quote Submission | `server/routers.ts` (marketplace router) | Panel beaters submit quotes into `panel_beater_quotes`; `itemized_breakdown` (text) + `components_json` (text) hold line items |
| Cost Optimisation Engine | `server/cost-optimization.ts` | Deterministic median/variance/fraud-flag engine; operates on `QuoteAnalysis[]` |
| AI Quote Optimisation | `server/quote-ai-optimisation.ts` | LLM-assisted analysis on top of cost-optimization; persists to `quote_optimisation_results` |
| Parts Pricing | `server/pricing/parts-pricing-engine.ts` | SA baseline + regional multipliers; reads `parts_pricing_baseline` table |
| Market Quotes | `server/routers/market-quotes.ts` | Admin uploads supplier quotes; AI extracts line items into `supplier_quotes` + `supplier_quote_line_items` |
| Historical Claims | `server/routers/historical-claims.ts` | Batch ingestion of legacy claims; stores in `historical_claims` + `extracted_repair_items` |

### Key Data Shapes

**Detected parts** (`ai_assessments.damaged_components_json`):
```json
[{ "name": "Front Bumper", "location": "front", "damageType": "cosmetic", "severity": "moderate" }]
```

**Quoted parts** (`panel_beater_quotes.components_json`):
```json
[{ "componentName": "Front Bumper Cover", "action": "replace", "partsCost": 450000, "laborCost": 120000 }]
```

**Historical repair items** (`extracted_repair_items`):
- `description`, `category`, `damage_location`, `repair_action`, `unit_price`, `line_total`

### What Does NOT Yet Exist

1. A **parts-name mapping dictionary** to canonicalise free-text part names
2. A **`country_repair_index`** table for VAT/duty/labour-rate adjustments
3. A **part reconciliation service** (detected vs quoted)
4. A **historical cost deviation calculator** using `extracted_repair_items`
5. A **risk classification** that combines deviation + missing/extra parts
6. A **Repair Intelligence Summary** panel on the claim review page

---

## Extension Design

### New Files

```
server/repair-intelligence/
  parts-dictionary.ts       ← SA canonical parts map + normalise()
  country-repair-index.ts   ← country_repair_index table helpers
  part-reconciliation.ts    ← reconcile(detected[], quoted[]) → {missing, extra}
  cost-deviation.ts         ← historicalDeviation(claimId, totalQuoted) → stats
  risk-classifier.ts        ← classifyRisk(reconciliation, deviation) → RiskLevel
  quote-intelligence.ts     ← orchestrator: runs all above, returns IntelligenceReport
  router.ts                 ← tRPC quoteIntelligence.getReport procedure
  DESIGN.md                 ← this file
```

### New Schema Additions (append-only, no existing table changes)

```sql
-- country_repair_index
CREATE TABLE country_repair_index (
  id INT AUTO_INCREMENT PRIMARY KEY,
  country_code VARCHAR(10) NOT NULL,
  country_name VARCHAR(100) NOT NULL,
  vat_rate DECIMAL(5,4) NOT NULL,        -- e.g. 0.15 for 15%
  import_duty_rate DECIMAL(5,4) NOT NULL, -- e.g. 0.25 for 25%
  avg_labour_rate_per_hour INT NOT NULL,  -- cents ZAR
  currency_code VARCHAR(10) NOT NULL,
  effective_from DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Intelligence Report Shape

```ts
interface IntelligenceReport {
  claimId: number;
  detectedParts: DetectedPart[];      // from ai_assessments
  quotedParts: QuotedPart[];          // from panel_beater_quotes (best/all)
  reconciliation: {
    missingParts: string[];           // detected but not quoted
    extraParts: string[];             // quoted but not detected
    matchedParts: string[];
    coverageScore: number;            // 0-1
  };
  historicalDeviation: {
    averageCost: number | null;       // cents, null if insufficient data
    medianCost: number | null;
    deviationPct: number | null;
    sampleSize: number;
    confidence: "high" | "medium" | "low";
  };
  countryContext: {
    countryCode: string;
    vatRate: number;
    importDutyRate: number;
    avgLabourRatePerHour: number;
  } | null;
  riskLevel: "low" | "medium" | "high";
  riskFactors: string[];              // human-readable reasons
  generatedAt: string;               // ISO timestamp
}
```

### Integration Points (read-only)

- Reads `ai_assessments` for detected parts — **no writes**
- Reads `panel_beater_quotes` for quoted parts — **no writes**
- Reads `extracted_repair_items` for historical deviation — **no writes**
- Reads `country_repair_index` (new table) — **no writes from intelligence layer**
- Does **not** modify `quote_optimisation_results` or any existing table
- Displayed as a **new panel** below `QuoteOptimisationPanel` in `InsurerComparisonView`

### Risk Classification Rules

| Condition | Risk Contribution |
|-----------|-----------------|
| coverageScore < 0.5 (>50% parts missing) | +high |
| coverageScore 0.5–0.8 | +medium |
| extraParts.length > 3 | +medium |
| deviationPct > 40% above historical median | +high |
| deviationPct 20–40% above | +medium |
| sampleSize < 5 | confidence = "low", no deviation risk |
| All checks pass | low |

Final risk = max(all contributions).
