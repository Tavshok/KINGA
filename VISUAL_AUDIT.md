# KINGA Report Visual Audit — DOC-20260605-2F51935B

## TYPOGRAPHY ISSUES (from PDF)

### 1. Mixed monospace / sans-serif in body text
- Page 4: "Sources: driver statement · Claim form · damage description" — italic monospace (DM Mono) mixed with DM Sans body
- Page 4: Italic monospace block "The narrative explicitly states..." — should be DM Sans italic, not monospace
- Page 6: "INSURED DRIVER" label — still uppercase monospace (DM Mono) 
- Page 6: "THIRD PARTY — Not applicable" — uppercase monospace
- Page 8: "RECONSTRUCTION SUMMARY" — uppercase monospace label
- Page 8: "PHYSICS DIAGRAM SUMMARY" — uppercase monospace label
- Page 9: "FORENSIC SPEED ESTIMATE", "IMPACT SEVERITY CONTEXT", "EVIDENCE CATEGORIES ASSESSED" — uppercase monospace
- Page 10: "STATED SPEED", "STRUCTURAL EVIDENCE", "DISCREPANCY", "SPEED COMPARISON — IMPACT SCALE" — uppercase monospace
- Page 14: "LOWEST SUBMITTED", "KINGA OPTIMISED", "SAVINGS OPPORTUNITY" — uppercase monospace
- Page 15: "MARKET CONTEXT", "COST ANALYSIS NARRATIVE" — uppercase monospace
- Page 16: "RECONCILIATION" — uppercase monospace
- Page 16: "COMPONENTS QUOTED BUT NOT CONFIRMED DAMAGED" — uppercase monospace
- Page 16: "DAMAGE IDENTIFIED — NOT INCLUDED IN ANY QUOTE" — uppercase monospace
- Page 17: "PROBABLE HIDDEN DAMAGE — ADVISORY" — uppercase monospace
- Page 18: "RISK PROFILE (RADAR)", "FACTOR CONTRIBUTIONS" — uppercase monospace

### 2. Font size inconsistencies
- Page 4: Source attribution text (italic) is too small and in wrong font
- Page 9: "Analysis 1–5" labels still showing (physics model names fix not yet in this PDF)
- Page 13: Component matrix table — "ZONE" column header has no content (blank)
- Page 13: Two quote columns have blank headers (should show repairer names)

### 3. Colour inconsistencies
- Page 6: "PARTIAL ALIGNMENT" badge — orange/amber background with white text (correct)
- Page 6: "Not provided" / "Not stated" values in grey — inconsistent with other sections
- Page 9: "Low Confidence" badge — blue background (correct)
- Page 10: Speed verification box — green border (correct)
- Page 13: "Best composite" label in green (correct)
- Page 16: "potential_scope_inflation" — raw underscore text, should be formatted label

## CONTENT ISSUES

### 1. Section 3.1 Component Matrix (Page 13-14)
- Two quote column headers are BLANK — should show repairer names
- "ZONE" column is always "—" (never populated)
- "potential_scope_inflation" shows raw snake_case text instead of formatted label

### 2. Section 2.6 Evidence Categories (Page 9)
- Still showing "Analysis 1–5" — physics model names fix not applied to this PDF (was fixed after)

### 3. Section 1.1a (Page 4)
- Source attribution in italic monospace — should be plain DM Sans 11px grey

### 4. Section 3.1c (Page 16)
- "RECONCILIATION" section uses uppercase monospace label
- "COMPONENTS QUOTED BUT NOT CONFIRMED DAMAGED" — uppercase monospace
- "potential_scope_inflation" raw text in the right column

### 5. Section 3.1c (Page 16-17)
- "DAMAGE IDENTIFIED — NOT INCLUDED IN ANY QUOTE" — uppercase monospace
- Damage items (r/f slide, l/s headlamp etc.) are lowercase — should be Title Case

## CSS ISSUES TO FIX

### Priority 1 — Uppercase monospace labels (most visible)
All these patterns need to be DM Sans 10px bold sentence-case or removed:
- `narr-seq-label` class (RECONSTRUCTED SEQUENCE, CROSS-VALIDATION)
- `narr-header-label` class (FORENSIC SPEED ESTIMATE, IMPACT SEVERITY CONTEXT etc.)
- `speed-col-label` class (STATED SPEED, STRUCTURAL EVIDENCE, DISCREPANCY)
- `speed-scale-label` class (SPEED COMPARISON — IMPACT SCALE)
- `cost-kpi-label` class (LOWEST SUBMITTED, KINGA OPTIMISED, SAVINGS OPPORTUNITY)
- `market-context-label` class (MARKET CONTEXT)
- `reconciliation-label` class (RECONCILIATION)
- `scope-section-label` class (COMPONENTS QUOTED BUT NOT CONFIRMED DAMAGED)
- `damage-not-quoted-label` class (DAMAGE IDENTIFIED — NOT INCLUDED IN ANY QUOTE)
- `hidden-damage-label` class (PROBABLE HIDDEN DAMAGE — ADVISORY)
- `radar-label` class (RISK PROFILE (RADAR), FACTOR CONTRIBUTIONS)

### Priority 2 — Raw snake_case text
- `potential_scope_inflation` → "Potential scope inflation"
- Damage item names in lowercase → Title Case

### Priority 3 — Quote column headers in component matrix
- Two blank columns → show repairer names from data
