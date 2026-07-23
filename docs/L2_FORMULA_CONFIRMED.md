# KINGA L2 Formula — Confirmed Correct Architecture
# Confirmed by product owner, July 2026

## The Rule (verbatim from product owner)
"The lowest of the quotes then compared to the KINGA internal estimate and check for variation.
If it's within 30% you take the lowest of those 2. If above 30% you take the lowest of the quotes."

## Formula Steps

1. Normalise each submitted quote to a comparable total:
   - For each quote, sum all component rows (parts + associated repair-ops) to get the normalised total
   - Standalone overhead rows (VAT, general workshop fee not tied to a component) are excluded
   - Labour is NOT added separately — it is already inside each quote's component rows

2. L1 = lowest normalised quote total across all repairers
   - L1 is the market floor — the best price a real repairer has offered to do the full job

3. K = KINGA internal benchmark/model price for the full repair (P50)
   - If no benchmark exists: K = null

4. Apply the 30% rule:
   - If K is null: L2 = L1 (no benchmark available; accept market floor)
   - deviation = |L1 - K| / L1
   - If deviation <= 0.30: L2 = min(L1, K)  [K is within 30% of L1; take the lower]
   - If deviation > 0.30:  L2 = L1          [K is too far from market; use market floor]

5. Savings = L1 - L2
   - If L2 = L1 (no benchmark or benchmark above L1): savings = 0
   - L2 <= L1 ALWAYS — KINGA never increases cost burden on insurer

## What the per-component breakdown is for
- The per-component breakdown of the winning quote (L1 source) is the AUDIT TRAIL
- It explains why one quote is cheaper than another
- It is NOT used to construct a composite price
- The cherry-pick logic (cheapest component from each repairer, summed) is WRONG and DELETED

## Scope classification (repair vs replace)
- Used ONLY to normalise each quote correctly:
  - Safety-critical components (airbags, seat belts, chassis): replacement scope only
  - Severe/catastrophic damage: replacement scope preferred
  - Moderate/minor/cosmetic: both repair and replace valid; use the scope the repairer quoted
- NOT used to cherry-pick across quotes

## Claim 8880001 — Expected result with correct formula
- L1 = $24,782.31 (Grand Auto — lowest submitted quote)
- K = null (no benchmark loaded for this claim's components)
- L2 = L1 = $24,782.31
- Savings = $0 (no benchmark available to challenge the market price)
- Report should show: "KINGA confirms Grand Auto's quote of $24,782.31 as the market floor.
  No benchmark data is available to challenge this price. Savings opportunity: $0."
