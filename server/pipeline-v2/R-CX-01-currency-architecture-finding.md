# R-CX-01 — Currency / Multi-Country Architecture Finding
**Date:** 2026-07-08  
**Severity:** **High** (pipeline correctness degraded for any non-USD, non-ZW/ZA market)  
**Status:** Open — no code changes made; scope assessment only  
**Prerequisite for:** Batch 7 (Infrastructure Hardening) — hold until design decision made

---

## 1. Immediate Question: ZWL / ZiG Claims in the Current Dataset

### 1a. Does `costRealismValidator` convert non-USD quotes before comparison?

**No.** The validator receives `totalExpectedCents` from Stage 9, which is computed in the *policy currency* (not always USD). Stage 9 determines the policy currency via:

1. Tenant override (`ctx.tenantRates.currencyCode`)
2. Inferred from repair country (`getDefaultCurrencyForCountry(extractedRepairCountry)`)
3. Tenant country default (`getDefaultCurrencyForCountry(ctx.tenantCountry)`)
4. Hard fallback: `'USD'`

For a ZW claim where the policy currency is USD (the primary ZW transactional currency), the validator operates correctly in USD cents. For a ZA claim where the policy currency is ZAR, the validator would compare ZAR cents against the `SEVERITY_COST_RANGES_CENTS` table — which is calibrated in USD cents. This is a latent bug that does not affect current ZW/ZA USD claims but would misfire for ZAR-denominated claims.

### 1b. What do real ZWL / ZiG claims in the dataset show?

From the `panel_beater_quotes` table (897 total quotes):

| Currency | Count | Max `quoted_amount` | Interpretation |
|----------|-------|---------------------|----------------|
| USD | 892 | 351,348,000 (= $3.5M) | Primary ZW transactional currency |
| ZWL/ZWG | 4 | 690,000 | ZWL cents ≈ ZWL $6,900 ≈ USD $0.04 at current rate |
| Other | 1 | — | Unclassified |

The 4 ZWL/ZiG quotes are legacy entries with amounts so small (ZWL $6,900 at ~1,800:1 rate ≈ USD $3.83) that they fall far below the `cosmetic` band minimum and would not affect any severity-band comparison. The `severe.maxCents` recalibration to $150k (15,000,000 cents) is therefore unaffected by ZWL/ZiG data.

**Conclusion on the immediate question:** The $150k cap is correct. ZWL/ZiG claims in the current dataset are negligible in value and do not interact with the severity bands. The deeper architectural issue is prospective, not retrospective.

---

## 2. Full Currency / Multi-Country Architecture Inventory

The following table enumerates every location in the pipeline where a cost value assumes USD or where currency-awareness is incomplete. Each item is rated by its impact on a **second country with a different primary currency** (e.g., Kenya/KES, Zambia/ZMW, South Africa/ZAR).

### 2a. Severity bands and absolute cost thresholds

| # | File | Location | Current behaviour | Currency-aware? | Impact if wrong currency |
|---|------|----------|-------------------|-----------------|--------------------------|
| CX-01-A | `costRealismValidator.ts` | `SEVERITY_COST_RANGES_CENTS` (lines 62–79) | Bands calibrated in USD cents (e.g., `severe.maxCents = 15_000_000` = USD $150k) | **No** — no currency parameter | A ZAR claim with a ZAR $150k quote (~USD $8k) would be flagged as above-severe; a KES claim with KES 1.5M (~USD $12k) would be flagged as moderate-to-severe correctly by accident |
| CX-01-B | `costRealismValidator.ts` | `DEFAULT_AVG_COMPONENT_COST_CENTS = 35_000` (line 52) | USD $350/component default | **No** | ZAR: R350/component is far too low; KES: KES 350/component is absurd |
| CX-01-C | `caseSignatureGenerator.ts` | `inferCostTier` absolute fallback (lines 376–379) | `>= $15,000 → total_loss`, `>= $5,000 → high`, `>= $1,500 → medium` | **No** | ZMW: ZMW 15,000 ≈ USD $566 — would classify almost every claim as `total_loss` |
| CX-01-D | `costLearningRecorder.ts` | `deriveCostTier` (lines 404–408) | `< $1,500 → low`, `$1,500–$5,000 → medium`, `> $5,000 → high` | **No** | Same issue as CX-01-C; learning DB benchmarks would be miscategorised by currency |
| CX-01-E | `crossEngineConsensus.ts` | `d9_damage_cost_consistency` (lines 475–489) | Thresholds: `>$5,000 = high cost`, `<$500 = very low cost` (USD assumed) | **No** | KES claim with KES 650,000 (~USD $5k) would be flagged as high-cost for minor damage |
| CX-01-F | `claimComplexityScorer.ts` | `HIGH_VALUE_CENTS = 5_000_000`, `LOW_VALUE_CENTS = 500_000` (lines 58–59) | Labelled as ZAR in comments but thresholds are applied to `quoteTotalCents` regardless of currency | **No** — comment says ZAR, code applies universally | For USD claims: R50,000 threshold ≈ USD $2,700 — far too low; for KES claims: KES 50,000 ≈ USD $387 — trivially low |

### 2b. Labour rates and component cost fallbacks

| # | File | Location | Current behaviour | Currency-aware? | Impact |
|---|------|----------|-------------------|-----------------|--------|
| CX-01-G | `stage-9-cost.ts` | `LABOUR_RATES` table (lines 40–42): `{ ZW: 25, ZA: 35, US: 75, UK: 65, AU: 60, DEFAULT: 40 }` | USD/hr rates for 5 countries; 8 supported countries (ZM, BW, NA, MZ, MW, TZ, KE, UG) have no entry and fall through to `DEFAULT: 40` (USD $40/hr) | **Partial** — ZW and ZA covered; others missing | ZM: ZMW $40/hr ≈ USD $1.51/hr — wildly incorrect; KE: KES $40/hr ≈ USD $0.31/hr |
| CX-01-H | `stage-9-cost.ts` | `paintCostPerPanelUsd = 45` default (lines 97, 127) | USD $45/panel default; tenant override available | **Partial** — overridable but default is USD | ZAR: R45/panel ≈ USD $2.43 — far too low |
| CX-01-I | `stage-9-cost.ts` | `estimateComponentCost` base parts costs (lines 60–72) | All `basePartCost` values in USD cents (e.g., bumper = 20,000 = USD $200) | **No** — no currency parameter | ZAR: R200/bumper is absurd; ZMW: ZMW 200/bumper is equally wrong |

### 2c. Currency detection in document extraction

| # | File | Location | Current behaviour | Currency-aware? | Impact |
|---|------|----------|-------------------|-----------------|--------|
| CX-01-J | `stage-3-structured-extraction.ts` | `currencyPattern` regex (line 788) | Detects: `USD`, `ZiG`, `ZWG`, `ZWL`, `ZWD`, `$` | **Partial** — ZW/USD only | ZAR `R` prefix, KES `KSh`, ZMW `K`, TZS `TSh` not in regex; amounts extracted without currency tag |
| CX-01-K | `stage-3-structured-extraction.ts` | Agreed-cost regex patterns (lines 791–798) | Same gap — only `USD|ZiG|ZWG|$` prefixes | **Partial** | ZAR-denominated agreed costs would be extracted as bare numbers with no currency context |
| CX-01-L | `stage-3-structured-extraction.ts` | Conversion instruction (line 298): `"Convert all monetary values to cents (multiply USD/ZWL figure by 100)"` | Instructs LLM to multiply by 100 regardless of currency | **No** — instruction is USD/ZWL-specific | For ZAR: correct (ZAR also uses 2 decimal places). For KES/TZS/UGX: correct. For ZMW: correct. The instruction is accidentally correct for all ISO 4217 currencies that use 2 decimal subunits, but the wording is misleading and could cause LLM confusion for currencies with 0 decimal subunits (none in SADC, so low risk currently) |
| CX-01-M | `quoteExtractionEngine.ts` | LLM prompt currency list (line 237): `"USD, ZAR, ZMW, BWP, NAD, MZN, KES, TZS, UGX, MWK"` | Full SADC currency list in LLM prompt | **Yes** — comprehensive | No gap here; the LLM extraction layer is already multi-currency aware |

### 2d. Cross-currency conversion logic

| # | File | Location | Current behaviour | Currency-aware? | Impact |
|---|------|----------|-------------------|-----------------|--------|
| CX-01-N | `stage-9-cost.ts` | ZAR→USD conversion (lines 824–834) | Explicit ZAR→USD path; all other cross-currency pairs use generic `total_cost / exchangeRate` | **Partial** — ZAR→USD explicit; others generic | For ZMW→USD: generic path works if ECE provides rate. For ZWG→USD: generic path works. For KES→USD: works. The ZAR special-case is redundant but not harmful |
| CX-01-O | `economicContextEngine.ts` | `DEFAULT_EXCHANGE_RATES` (lines 132–154) | Hardcoded fallback rates for 19 currencies as of Q1 2025 | **Yes** — comprehensive fallback | Rates will drift; DB is authoritative but fallback is stale. ZWG rate (25.0) is approximate and volatile |
| CX-01-P | `economicContextEngine.ts` | NCI (Normalised Cost Index) computation | USD-centric: NCI = `PPP_FACTOR × PARTS_MULTIPLIER × (labourRateUsdPerHour / 40)` | **Yes** — designed for multi-currency; NCI converts USD benchmarks to local costs | No gap; this is the correct architecture |

### 2e. Learning database

| # | File | Location | Current behaviour | Currency-aware? | Impact |
|---|------|----------|-------------------|-----------------|--------|
| CX-01-Q | `db.ts` (line 3688) / `costLearningRecords` schema | `finalCostUsdCents` column | Column name implies USD; schema has a `currency` column (line 4689) that defaults to `'USD'` but is **never written** by `db.ts` insert | **No** — currency column exists but is unused | All learning records are stored as if USD regardless of actual claim currency. Cross-currency benchmark queries (`AVG(final_cost_usd_cents)` in `routers.ts:5732`) mix currencies silently |
| CX-01-R | `costLearningRecorder.ts` | `deriveCostTier` and `CostLearningRecord.true_cost_usd` | All costs stored and compared as USD; no currency field in the `CostLearningRecord` interface | **No** | ZAR claims stored as `true_cost_usd = 45000` (ZAR $45,000 ≈ USD $2,430) would be classified as `high` tier; a USD claim of $45,000 would also be `high` — same bucket, incompatible values |

### 2f. Vehicle valuation

| # | File | Location | Current behaviour | Currency-aware? | Impact |
|---|------|----------|-------------------|-----------------|--------|
| CX-01-S | `stage-5-assembly.ts` | LLM market value prompt (lines 463–477) | Explicitly requests `market_value_usd` in USD; hardcoded Zimbabwe USD price examples | **Partial** — correct for ZW; wrong for ZA/ZM/KE | For a ZA claim, the LLM would return a USD value; the RTV ratio would then compare USD repair cost against USD market value — accidentally correct if both are USD, but the display would show "USD" for a ZAR claim |
| CX-01-T | `stage-5-assembly.ts` | RTV verdict text (lines 542–548) | Hardcodes `"USD"` in verdict strings | **No** | Display issue: ZAR claim verdict reads "Repair cost (USD 45,000)…" |

### 2g. Frontend display

| # | File | Location | Current behaviour | Currency-aware? | Impact |
|---|------|----------|-------------------|-----------------|--------|
| CX-01-U | `client/src/lib/currency.ts` | `formatCurrency` / `getCurrencyConfig` | Module-level mutable singleton; `TODO` comment acknowledges it should be fetched from tenant config but is not yet wired | **Partial** — infrastructure exists; not connected | All cost displays default to `$` symbol until `setCurrencyConfig` is called; no evidence it is called on page load |
| CX-01-V | `ForensicDecisionPanel.tsx` (line 1246) | `${validatedOutcome.metadata.true_cost_usd.toLocaleString()}` with hardcoded `$` prefix | Hardcoded `$` symbol | **No** | ZAR/KES claims show `$45,000` instead of `R45,000` or `KSh 45,000` |
| CX-01-W | `costIntelligenceNarrative.ts` | `fmt()` function (line 56–57): always prefixes `"USD "` | Hardcoded `"USD "` prefix in narrative text | **No** | Narrative text for ZAR claims reads "USD 45,000.00" |

---

## 3. Severity Assessment

**Overall severity: High.** The pipeline has a well-designed currency infrastructure layer (`shared/countryCurrency.ts`, `economicContextEngine.ts`, `quoteExtractionEngine.ts`) that is correctly multi-currency aware at the extraction and ECE level. However, the cost computation and validation layers were built for the ZW/USD market and have not been propagated through to the threshold tables, learning database, complexity scorer, and display layer. The gaps fall into three tiers:

**Tier 1 — Correctness-breaking for any non-USD market (must fix before launch in new country):**

- CX-01-A: `SEVERITY_COST_RANGES_CENTS` — wrong bands for ZAR/KES/ZMW claims
- CX-01-C/D: `inferCostTier` / `deriveCostTier` absolute USD thresholds — learning DB miscategorised
- CX-01-E: `crossEngineConsensus` USD cost thresholds — wrong fraud/consistency signals
- CX-01-Q/R: Learning DB currency column unused — cross-currency benchmark contamination
- CX-01-W: Narrative text hardcodes `"USD "` — incorrect for all non-USD markets

**Tier 2 — Degraded accuracy but not catastrophically wrong (fix before scale):**

- CX-01-F: `claimComplexityScorer` thresholds labelled ZAR but applied universally
- CX-01-G: `LABOUR_RATES` missing 8 of 10 supported countries — all fall to USD $40/hr default
- CX-01-H/I: Paint and component cost fallbacks in USD — wrong magnitude for non-USD markets
- CX-01-J/K: Stage 3 regex patterns miss ZAR `R`, `KSh`, `K` prefixes — currency tag lost on extraction
- CX-01-S/T: Vehicle valuation prompt and RTV text hardcoded to USD

**Tier 3 — Display/UX issues (low correctness risk, fix for polish):**

- CX-01-B: `DEFAULT_AVG_COMPONENT_COST_CENTS` USD default (only used as last-resort fallback)
- CX-01-U/V: Frontend `currency.ts` singleton not wired; `ForensicDecisionPanel` hardcoded `$`

---

## 4. Recommended Approach

This is not a patch-level fix. The correct architecture is:

1. **Currency context flows through the pipeline as a first-class parameter** — every threshold table and cost computation that currently assumes USD should accept a `currencyCode` parameter and look up a per-currency calibration (or apply the ECE's NCI multiplier to convert USD benchmarks to local costs).

2. **Learning DB must be currency-segmented** — the `currency` column already exists in the schema; it must be populated on insert and all benchmark queries must filter by currency.

3. **Stage 3 regex patterns must be extended** — add `ZAR|R\s`, `KSh|KES`, `ZMW|K\s`, `TZS|TSh`, `UGX|USh` to the currency detection patterns.

4. **Threshold tables should be expressed as USD reference values with NCI scaling**, not as hardcoded per-currency tables — this avoids maintaining N tables and leverages the existing ECE infrastructure.

The recommended batching is:

- **R-CX-01a** (Tier 1, ~1 batch): Fix learning DB currency column, `deriveCostTier`/`inferCostTier` USD thresholds, `crossEngineConsensus` USD thresholds, narrative `"USD "` hardcoding
- **R-CX-01b** (Tier 2, ~1 batch): Extend Stage 3 regex, add missing LABOUR_RATES entries, wire `SEVERITY_COST_RANGES_CENTS` to NCI scaling
- **R-CX-01c** (Tier 3, ~0.5 batch): Frontend currency singleton wiring, `ForensicDecisionPanel` `$` fix, vehicle valuation prompt generalisation

Total estimated scope: **2–3 dedicated batches**, or one larger "Currency Architecture" batch if done in a single pass. This should not be folded into the existing 8-theme backlog without a design decision on the NCI-scaling approach.

---

## 5. ZWL / ZiG Specific Summary

The original question is answered definitively:

- **ZiG (ZWG)** is correctly detected in `quoteExtractionEngine.ts` (line 237), `stage-3` LLM prompt (line 126), and `stage-3` regex (line 788). The `ZIG_CURRENCY` constant in `shared/countryCurrency.ts` is properly defined.
- **ZWL** is detected as a legacy code mapping to the old Zimbabwe Dollar. The `DEFAULT_EXCHANGE_RATES` table has both `ZWL: 361.0` and `ZWG: 25.0`.
- **In the current dataset**, ZWL/ZiG quotes are 4 records with values equivalent to < USD $4 each — negligible.
- **The $150k `severe.maxCents` cap is not affected** by ZWL/ZiG data.
- **The systemic risk** is not ZWL/ZiG specifically — it is that the pipeline's cost thresholds are calibrated in USD and will produce incorrect results for any market where the primary currency is not USD (ZAR, ZMW, KES, etc.).
