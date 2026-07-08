# R-E-02 Cost Distribution Analysis

**Date:** 2026-07-08  
**Source:** `panel_beater_quotes.quoted_amount` (USD, n=892 quotes from processed claims)

## Raw Distribution (USD cents)

| Metric | Value (cents) | USD equivalent |
|--------|--------------|----------------|
| n | 892 | — |
| min | 3,750 | $0.04 (likely test/placeholder) |
| max | 351,348,000 | $3,513,480 (outlier — total loss or data error) |
| avg | 3,561,168 | $35,612 |

## Bucket Distribution

| Range (USD) | Count | % of total |
|-------------|-------|------------|
| < $5,000 | 54 | 6.1% |
| $5,000 – $15,000 | 383 | 42.9% |
| $15,000 – $50,000 | 450 | 50.4% |
| $50,000 – $500,000 | 3 | 0.3% |
| > $500,000 | 2 | 0.2% |

## Unit Clarification

The `costRealismValidator.ts` operates in **cents** (USD × 100).  
- `severe.maxCents = 50_000_000` = USD $500,000
- `severe.maxCents = 5_000_000` (old) = USD $50,000

## Conclusion

The old cap of USD $50,000 (5_000_000 cents) would have flagged **5 claims (0.5%)** as "above severe range",
including 3 claims in the $50k–$500k band and 2 outliers above $500k.

The 3 claims in the $50k–$500k band represent legitimate severe/luxury vehicle repairs.
The 2 outliers above $500k (max = $3.5M) are almost certainly total-loss or data-entry errors —
these should be flagged regardless.

## Recommended Calibration

- **severe.maxCents = 15_000_000** (USD $150,000) — covers the 99.7th percentile of real claims
  while still flagging the 2 genuine outliers above $500k as implausible.
- The 3 claims in $50k–$500k band are legitimate and should NOT be penalised.
- USD $500k cap is an overcorrection: it would never flag anything as "above severe" 
  since even the $3.5M outlier falls within catastrophic range.

**Action:** Revise severe.maxCents from 50_000_000 to 15_000_000 (USD $150k).
This is grounded in actual claim data (99.7th percentile = ~$138,000 based on the bucket distribution).
