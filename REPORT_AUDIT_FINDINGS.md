# KINGA Report Audit Findings

## Source Document Facts (AFF 1102 / NATPHARM / MAZDA BT50)

### Claim Form (CI-024NATPHARMMAZDABT50AFF1102)
- Insured: NATPHARM
- Vehicle: MAZDA BT50 2018, Reg AFF 1102
- Incident: HIT AN ANIMAL (cow), 02-09-2024
- Location: 339 km peg Harare–Bulawayo Road
- Speed claimed: 90 km/h
- Repairer: SKINNERS Auto Body Repairs
- Assessor: Clarence Garatsa, inspected 03-12-2024
- Market Value: USD 20,000.00
- Repair Cost (quote): USD 591.33
- Cost Agreed Less Excess: USD 462.33
- Savings: USD 129.00

### Skinners Quotation (Quotation No: 20241022603, dated 11/26/2024)
- Client: NATPHARM, Make: BT50 MAZDA, Reg: AFF1102
- Insurance Co: CELL INSURANCE COMPANY
- Line items:
  - S028 SUNDRIES: Parts $158, Labour $0, Qty 1.00, Tax $0.63 → Total $4.83 (NOTE: likely OCR error, should be $148+)
  - S440 SUPPLY FRONT SEAT BELTS X2: Parts $300.00, Labour $0, Qty 1.00, Tax $45.00 → Total $348.00 (NOTE: 316+45=361 but listed as 348)
  - R121 REPROGRAMMING: Labour $150.00, Qty 1.00, Tax $22.50 → Total $172.50
  - R120 REMOVE REFIT SEAT BELTS: Labour $60.00, Qty 1.00, Tax $9.00 → Total $69.00
- Parts Total: $300.00
- Labour Total: $210.00
- Total Excl Tax: $514.20
- Tax: $77.13
- Total Incl Tax: $591.33
- Agreed: $462.33 (signed 03/12/24)

### Key Conflicts Found in AI Report vs Source
1. **Cost conflict**: AI report shows "AI ESTIMATED TOTAL: $462.00" and "EST. PARTS (AI): $840.00" — Parts $840 is WRONG. Actual parts from quote = $300.00. Labour = $210.00.
2. **Incident type**: AI report says "INCIDENT TYPE: N/A" — WRONG. Claim form clearly states "HIT AN ANIMAL". Should be ANIMAL_STRIKE.
3. **Damage consistency 20%**: Report shows 20% but proposed format says 27% — needs to reflect actual physics analysis.
4. **Photo ingestion failure**: 42 photos detected but 0 processed — this is a SYSTEM ERROR not claimant omission. Report must clearly distinguish this.
5. **Fraud score**: Report shows 58/100 but proposed format shows 52/100 — need to check actual engine output.
6. **Cost section**: Shows "AI Cost Optimisation not yet triggered" — misleading. Actual agreed cost is $462.33 from the signed quote.
7. **Header shows "Claim: | Report Date:"** — blank fields, claim ref and date not being populated.
8. **Large black empty areas** in the PDF — sections rendering but with black backgrounds (dark mode CSS not working in print/PDF).

## Proposed 6-Section Structure

### Section 0: Cover Page — Executive Authority Card
- KINGA header + claim ref + vehicle + date
- Decision pill (ESCALATE) + fraud score
- 3 metric tiles: Physics (27% consistency), Cost ($462 agreed vs $591 quoted), Evidence (42 photos / ingestion fail)
- Primary blockers list
- Pre-flight status badges
- Timeline: Incident → Inspection → Quote → Report

### Section 1: Incident & Data Integrity
- Incident type, speed, location
- Chronology (validated dates)
- Data completeness checklist with confidence bars
- Auto-corrections applied

### Section 2: Technical Forensics
- 2.1 Impact Physics: mass, claimed speed, Delta-V, energy, classification
- Speed comparison bar chart
- 2.2 Damage Consistency: score, comparative table (Expected vs Observed)
- Constraint status table (with thresholds shown)
- Anomaly assessment + possible explanations

### Section 3: Financial Validation
- Cost waterfall: Quote $591.33 → Adjustments → Agreed $462.33
- Breakdown table: AI estimate vs Quote vs Agreed vs Variance
- Parts & Labour reconciliation (from actual quote)
- Auto-correction note

### Section 4: Evidence Inventory
- Photo grid (3x3 thumbnails of detected photos)
- Extraction status with clear SYSTEM ERROR flag
- Document extraction table (claim form, quote, police report)

### Section 5: Risk & Fraud Assessment
- Fraud score gauge (52/100 MODERATE)
- Indicator breakdown table — system errors EXCLUDED from score
- Final risk statement (narrative)

### Section 6: Decision Authority & Audit Trail
- Decision flowchart (gates: data → physics → safety → fraud → total loss)
- Trigger conditions (numbered rules)
- Blocked actions
- Required next steps (checklist)
- Audit trail (engine version, hash, corrections, human review flag)

### Appendix (optional)
- Full component list (10 items with severity and source)

## Colour Issues
- All batch components use hardcoded dark hex values
- Large black empty areas in PDF = dark mode CSS applied to print
- Fix: ALL structural colours must use CSS variables
- Status colours (green/amber/red) are intentional — keep
- Need @media print rules to force white backgrounds

## Data Path Issues (confirmed)
- enforcement.weightedFraud.score (not .totalScore)
- enforcement._phase2.physicsConsistency (not .consistencyScore)  
- enforcement._phase2.photoAnalysis.photoStatus (not ._phase2.photoStatus)
- costExtraction has: ai_estimate, parts, labour, fair_range (not repairerQuoteUsd)
- _normalised is on aiAssessment, NOT on enforcement
- _phase1 is on aiAssessment (allCorrections, gates)
