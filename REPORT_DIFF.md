# KINGA Report Diff: PDF (Live) vs B&W HTML (Reference)

## Critical Observations

### Page 1 — Cover
**PDF (live):** 
- Shows "KINGA REPORTS" header with "2 reports generated for DOC-..." 
- Has a DRAFT watermark and orange "DRAFT — Missing: VIN" alert
- Cover layout: title block, decision badge (APPROVED, scores 30/50/32/60%), quote table, score summary
- Uses mixed fonts: DM Sans body, monospace for labels, Instrument Serif for large numbers
- Score cards show large numbers with /100 in different font weight
- Quote table has black header row with white text (good)

**B&W HTML (reference):**
- Clean page header: "KINGA FORENSIC AUDIT REPORT" left, "DOC-... | CONFIDENTIAL" right
- Cover: cover-doc (7pt uppercase), cover-main-title (16pt bold), cover-sub (9pt)
- Decision badge: "KINGA Decision" label + "APPROVED — LOW RISK" verdict + FCDI score
- Cover grid: 4 cells (Claim Reference, Claim Type, Incident Date, Data Completeness)
- Section 1 header (section-header div with section-num + section-title)
- two-col-kv with kv-table for Vehicle + Policyholder
- data-table for Repair Quote Summary
- score-row with score-cards (4 cards: FCDI, Fraud Risk, Physics Consistency, Data Completeness)
- alert box for critical issues

### Page 2 — Executive Summary
**PDF (live):**
- Shows "Vehicle Details" and "Policyholder & Claim Details" as two-col layout
- Repair Quote Summary table
- Score cards (FRAUD SCORE 30, PHYSICS 50, FCDI 32, DATA 60%)
- Decision Score Summary bar chart
- FCDI Score gauge + Claim Timeline

**B&W HTML (reference):**
- Page 2 is "Decision Score Summary + FCDI Gauge + Timeline"
- subsection "Decision Score Summary" + bar chart
- two-col-charts: FCDI gauge (left) + Claim Timeline (right)
- kv-table for FCDI breakdown
- timeline component with tl-dot + tl-label + tl-date
- alert for Executive Summary
- kv-table for Physics Snapshot + Cost Verdict

### Page 3 — Incident Facts
**PDF (live):**
- Shows "1.1 Incident Facts" as a wide table with many rows
- Shows "1.1A INCIDENT NARRATIVE" with the raw narrative text in italic
- Shows "RECONSTRUCTED SEQUENCE" paragraph
- Shows "CROSS-VALIDATION" header (empty)
- Uses monospace font for labels like "RECONSTRUCTED SEQUENCE", "CROSS-VALIDATION"

**B&W HTML (reference):**
- Section 1 header (section-header)
- subsection "1.1 Incident Facts" + two-col-kv with kv-table (7 rows each)
- subsection "1.1A Incident Narrative & Cross-Validation" + body-text paragraph
- data-table with 4 columns: Parameter | Extracted Value | Confidence | Cross-Validation Result
- subsection "1.2 Insurance & Policy Context" + two-col-kv
- subsection "1.3 Vehicle Details" + two-col-kv

### Page 4 — Driver/Police
**PDF (live):**
- "1.4 Driver Details" with "INSURED DRIVER" label + table
- "1.5 Police Report Details" with kv-table
- Officer findings shows raw text dump in monospace italic — THIS IS THE PROBLEM
- The raw text is: "No criminal action is contemplated against either party. A deposit fine of N/A was paid by N/A. RITA (THE DRIVER HAD NOTHING TO DO TO AVOID INCIDENT) The accident is under investigation..."
- This is clearly raw police report text, not AI-reasoned findings

**B&W HTML (reference):**
- subsection "1.4 Driver Details" + two-col-kv (3 rows each)
- subsection "1.5 Police Report" + kv-table (5 rows: Case Number, Station, Report Date, Status, Police Report Provided)
- NO officer findings raw text — just structured metadata
- subsection "1.6 Data Completeness Checklist" + data-table
- two-col-charts: 1.7 Extraction Confidence + 1.8 Data Gap Attribution

### Typography Issues (from PDF)
1. Mixed fonts: body text uses DM Sans but labels use monospace
2. "RECONSTRUCTED SEQUENCE", "CROSS-VALIDATION", "ANALYST REASONING" — these are uppercase monospace labels that look unprofessional
3. "INSURED DRIVER", "THIRD PARTY" — uppercase section dividers within tables
4. Officer findings: raw text in italic monospace — should be structured AI analysis
5. Section headers in PDF look like plain bold text, not the navy filled bar from B&W HTML

### Data Inconsistencies
1. PDF shows Odometer as "—" but B&W HTML shows "90,000 km"
2. PDF shows Market value as "$45,000.00" but B&W HTML shows "USD 42,500.00"
3. PDF shows Incident time as "06:15" but B&W HTML shows "08:15"
4. PDF shows Location as "Not Provided" but B&W HTML shows "25km peg, Mvuma Kwekwe Road"
5. PDF shows KINGA AI Estimate as "$23,262.67" but B&W HTML shows "USD 22,181.92"
6. PDF shows Repair ratio as "51%" but B&W HTML shows "49.7%"

## CSS System Differences

### B&W HTML shared.css (from file):
- Font: Helvetica Neue, Arial, sans-serif (body) — NOT DM Sans
- Font size: 8.5pt body, 7pt small, 9pt medium
- Colors: #000 text, #fff background, #166534 green, #DC2626 red, #D97706 amber
- section-header: black filled bar with white text (section-num + section-title)
- section-accent-line: 1.5pt solid black line
- subsection: 8.5pt bold, border-bottom 0.5pt solid black, margin-bottom 4pt
- kv-table: td padding 3pt 5pt, border-bottom 0.3pt solid #D4D4D4
- data-table: th background #000, color #fff, 7pt uppercase
- alert: left stripe + body with colored text
- s-red, s-green, s-amber: colored span classes

### Live component CSS:
- Font: DM Sans (our brand font — KEEP THIS)
- Colors: var(--kr-navy) for headers, var(--kr-green) for pass, etc.
- section-heading: navy filled bar (correct)
- sub-heading: navy border-bottom (correct)
- But inline styles still override with hardcoded values

## Action Plan
1. Fix officer findings: show PARTIAL ALIGNMENT badge + structured AI analysis (not raw text)
2. Fix "RECONSTRUCTED SEQUENCE", "CROSS-VALIDATION", "ANALYST REASONING" labels — remove uppercase monospace, use proper subsection styling
3. Fix "INSURED DRIVER", "THIRD PARTY" dividers — remove uppercase monospace
4. Ensure all section sub-labels use the sub-heading CSS class (navy, sentence case, 12px bold)
5. Data values: these come from the LLM extraction — the PDF shows different data than the B&W HTML because they are different claims/runs. The data itself is correct per claim.
