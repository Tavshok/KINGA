# Mock Intelligence Report — Audit Notes (26 Jun 2026)

## Source files reviewed
- PDF: KINGA—DOC-20260626-33B1FDFE26.06.26.pdf (25 pages, Forensic Claim Decision Report)
- Audit text: pasted_content_3.txt (15 numbered issues from reviewer)

## Real data extracted from PDF (to correct/enrich mock report)

### Claim identity
- KINGA Ref: KNG-TENANT17-2026-000080-FR (note: -FR suffix = Forensic Report)
- Claim Ref: DOC-20260626-33B1FDFE / COR 6002812
- Driver: NATHANIEL MAIPISI (licence 9295850)
- Claimant: VOLTRON MINING (company, not individual)
- Insurer: CELL INSURANCE
- Police report: 5826549, GWERY TRAFFIC station, date 2025-05-25, status UNDER_INVESTIGATION, officer findings PARTIAL ALIGNMENT
- Policy excess: $2,110.53
- Market value: $48,500.00 (KINGA system benchmark) — note p.2 shows $45,000 (data conflict)
- Odometer: 75,000 km
- Incident time: 08:15
- Road surface: Dust road
- Repairer selected: Cedric Jonker Spraypaints

### Physics / reconstruction
- Delta-V: 15.0 km/h
- Kinetic energy: 18.0 kJ (reviewer notes this falls in Moderate band per glossary, not Severe)
- Impact force: 2,709.6 kN
- Vehicle mass: 2,150 kg
- Deceleration: 50.0 g
- Energy absorbed: 4%
- Consensus speed: 70 km/h (claimed by driver)
- Speed analysis methods: KINGA Crush-Depth 7 km/h, Safety System Activation 28 km/h, KINGA Vision Deformation 9 km/h
- Physics score: 50/100 — Minor anomaly
- Damage consistency: 50/100 — Moderate
- Physics constraints: 0 of 2 passed (airbag_deployment Advisory, seatbelt_pretensioner Failed)

### Financial data
- Quotes submitted (4 or 5 — count is disputed):
  - KINGFISHER AUTO MOTORS T/A GRAND AUTO PREMIER: parts $24,981.06, total $24,782.31 (parts > total — math error)
  - KINGFISHER AUTO MOTORS T/A GRAND AUT: parts $23,862.31, total $24,782.31 (same total as above — likely duplicate)
  - SWISS MOTORS: parts $22,220.00, total $25,553.00
  - Cedric Jonker Spraypaints: parts $21,714.00, total $25,005.60
  - KINGA Optimised Estimate: $18,244.29 (26.4% below lowest quote)
  - Potential savings: $6,538.02
- FCDI: 32/100 — LOW evidence quality
- Data completeness: 80% — below 90% threshold

### Fraud score
- Headline: 22/100 Low Risk
- Factor contributions from p.17: Damage 0 + Cost Deviation 15 + Direction 0 + Repeat 0 + Missing Data 10 + Severity-vs-Physics 10 = 35 (doesn't sum to 22)

### Quote coverage (p.9 vs p.12 discrepancy)
- p.9: 30 matched, 25 missing, 80 extra, 48% coverage, 62 total
- p.12: 35 matched, 27 missing, 80 extra, 56% coverage, 62 total
- Arithmetic: 62 − 30 = 32 missing (not 25 as stated on p.9)

### Decision status conflict
- p.2 banner: APPROVED (green)
- p.4 executive summary: Manual review required: Cost Verdict
- p.19 decision rationale: REVIEW REQUIRED
- p.20 validation status: FAIL
- p.25 approval workflow: 0 of 4 stages complete, Pending

### Report hash conflict (3 different values for same report)
- p.1 upper right: #4C2C2824
- p.1 lower card: #9F4D4280
- p.20 audit trail: #483C935B

### Brand/colour issues
- Blue used for: Low confidence badge (p.8), active stage in approval workflow (p.25), chart legend accents
- Brand palette should use KINGA green (#3C7844) for active/info states

## Issues to fix in the mock HTML report
1. Add real claimant name (VOLTRON MINING) and driver name (NATHANIEL MAIPISI)
2. Add police report number (5826549), station (GWERY TRAFFIC), status (UNDER_INVESTIGATION)
3. Add policy excess ($2,110.53), correct market value ($48,500 per KINGA benchmark)
4. Add odometer (75,000 km), incident time (08:15), road surface (dust road)
5. Add KINGA Optimised Estimate ($18,244.29) as a fourth financial card
6. Add physics section: delta-V 15.0 km/h, KE 18.0 kJ, force 2,709.6 kN, decel 50.0 g
7. Add FCDI score (32/100) and physics score (50/100) to the score banner
8. Add Swiss Motors as a fourth quote entry
9. Fix fraud score factor breakdown to show real components (Cost Deviation 15, Missing Data 10, Severity-vs-Physics 10 = 35 raw → normalised to 22)
10. Add 13-month reporting delay flag (already in mock — keep)
11. Add physics constraints section (0 of 2 passed)
12. Add note about speed analysis method outputs (7/28/9 km/h vs 70 km/h consensus — low confidence)
13. Replace blue accent colours with KINGA green (#3C7844)
14. Note the data-integrity issues from the reviewer (decision status conflict, hash conflict, quote math) as known issues in the mock
