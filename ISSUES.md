# UI Issues from Screenshots (19 March 2026)

## Issue 1 — Valuation: Wrong currency scale ($3,850,000 vs $38,500)
- Screen: 20260319_214347.jpg
- "Estimated Market Value: $3850000.00" and "Final Adjusted Value: $3850115.00"
- Market Price Range shows Min/Median/Max all as US$38,500.00
- The market range is correct ($38,500) but the headline figure is 100× too large ($3,850,000)
- Root: valuation figure is stored/displayed in cents or multiplied by 100 somewhere

## Issue 2 — Valuation: Min = Median = Max (no spread)
- Screen: 20260319_214347.jpg
- All three market price range values are identical: US$38,500.00
- Should show a realistic spread (e.g. Min $32,000 / Median $38,500 / Max $45,000)

## Issue 3 — Cost: AI Estimated Total ($56,800) vs Parts+Labour mismatch
- Screen: 20260319_214229.jpg and 20260319_214302.jpg
- Parts Cost: US$7,100 + Labour Cost: US$11,360 = US$18,460
- But AI Estimated Total shows US$56,800
- The total is ~3× the sum of parts+labour — clearly wrong

## Issue 4 — Cost: Repair/Value Ratio shows N/A
- Screen: 20260319_214302.jpg
- Repair/Value Ratio shows "N/A" even though vehicle market value IS available ($38,500)
- Should compute: $56,800 / $38,500 = 147.5% (total loss territory)

## Issue 5 — Physics: Hidden damage probability shows 3000%, 2000%, 4000%
- Screen: 20260319_214253.jpg
- "Potential hidden damage to engine system (3000% probability)"
- "Potential hidden damage to transmission system (2000% probability)"
- "Potential hidden damage to suspension system (4000% probability)"
- Probabilities are stored as decimals (0.30, 0.20, 0.40) but displayed multiplied by 10000 instead of 100

## Issue 6 — Physics: Invisible card titles in hidden damage section
- Screen: 20260319_214253.jpg
- The card title text (e.g. "Engine System") is invisible — white text on white/light background
- Only the description text and confidence badge are visible

## Issue 7 — Fraud: Indicator breakdown cards have invisible text
- Screen: 20260319_214309.jpg
- Three indicator cards show score "15" but the card title/label text is invisible
- Cards appear as light-coloured boxes with only the number visible

## Issue 8 — Section headers invisible/greyed out
- Screen: 20260319_214333.jpg, 20260319_214309.jpg
- Section headers like "Missing Information", "Claim Approval & Panel Beater Selection", "Vehicle Valuation" appear very faint/greyed out
- These are collapsed section headers — the text colour is too light against the background

## Issue 9 — Damage consistency shows 50% with no explanation
- Screen: 20260319_214253.jpg
- "Damage Consistency: 50%" — this is a raw number with no context
- Should show label like "Moderate" or a tooltip explaining what 50% means

## Issue 10 — Parts reconciliation: 27 detected, 0 quoted (expected for new claim)
- Screen: 20260319_214326.jpg
- This is correct behaviour (no quotes submitted yet) but the UI shows it as an error
- Should show as informational/warning, not critical red

## Issue 11 — AI Repair Intelligence confidence: 15% (correct but needs context)
- Screen: 20260319_214320.jpg
- 15% confidence is correct given no quotes, no historical data
- But the reasons listed are clear — this is working as intended

## Issue 12 — Mileage adjustment shows +$4.15 instead of meaningful amount
- Screen: 20260319_214347.jpg
- "Mileage adjustment (83000 km): +$4.15"
- This is essentially zero — the mileage adjustment logic is producing a near-zero result
- For 83,000 km on a $38,500 vehicle, a realistic adjustment would be -$3,000 to -$5,000
