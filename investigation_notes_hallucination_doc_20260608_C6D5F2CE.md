# Investigation Notes — DOC-20260608-C6D5F2CE

## Source
- Reviewed `/home/ubuntu/upload/KINGA—DOC-20260608-C6D5F2CEhallucination.pdf`
- Pages examined visually: 1-9

## Key observed inconsistencies / possible hallucinations

### 1. Fraud score inconsistency across pages
- Page 1 shows **Fraud Risk 83** and a banner saying escalation threshold is **70**.
- Page 3 executive summary says **fraud score of 100/100 exceeds the 60-point escalation threshold**.
- This is an internal inconsistency within the same report and strongly suggests either mixed score sources or stale/hardcoded summary text.

### 2. Physics consistency / direction mismatch narrative may be overstated
- Page 4 says the incident type is **Sideswipe** with **95% confidence**.
- Page 7 says **Damage zones (Rear) do not match expected zones for a side passenger collision**.
- Page 5 analyst reasoning states the damage list includes **REAR TONDER, TRIM, and REAR REFLECTORS** and says this could still be consistent with a sideswipe, but location specificity is unresolved.
- This suggests the report may be presenting a firm anomaly conclusion where the underlying evidence is actually ambiguous / partial rather than clearly contradictory.

### 3. Speed verification wording is internally inconsistent
- Page 8 says: **No independent physics estimate could be produced from the available evidence**.
- But the same page and nearby sections still show **Structural evidence: 13 km/h — derived from damage analysis** and the physics summary states **Estimated lateral contact speed: 13 km/h**.
- This can read as contradictory to end users even if technically the system means “no independently corroborated ensemble estimate.” Wording likely needs tightening.

### 4. Severity inconsistency
- Page 6 table says **Impact Severity: Minor** and **Severity Classification: Minor**.
- Page 8 narrative says **The physics model and damage analysis indicate Severe severity**.
- This appears to be a direct contradiction and likely a stale severity string from another source.

### 5. Missing data vs completed analysis tension
- Page 6 checklist says **Damage photographs: Not submitted**.
- Yet Section 2 contains a damage zone map, latent damage commentary, and speed derived from damage analysis.
- This may be valid if the system used quotation/repair document component extraction rather than photographs, but the report language should explicitly state the source basis to avoid looking hallucinated.

### 6. Structural intelligence fallback text is low confidence and may be too assertive elsewhere
- Page 9 says structural intelligence analysis could not be completed and formal crash test results were derived from generic class characteristics.
- Any downstream claims using vehicle-specific structural intelligence should therefore be carefully limited.

## Initial hypotheses
1. Executive summary text may be pulling from a different fraud-score field than the cover page.
2. Severity text may be mixing Stage 7 / damage-analysis / narrative-engine outputs without a single authoritative source.
3. Speed verification copy may be using the right logic but the displayed labels still imply an independent estimate exists.
4. Damage mismatch logic for sideswipe may be too rigid for rear-quarter / lateral glancing contact scenarios.

## Next code targets
- `client/src/components/ForensicAuditReport.tsx`
- Fraud score / executive summary generation helpers
- Damage pattern matching expectations for sideswipe
- Speed forensics wording and displayed labels
- Severity source selection / precedence

## PDF pages referenced
- Page 1: cover score summary
- Page 3: executive summary inconsistency
- Page 4: incident facts
- Page 5: analyst reasoning
- Page 6: checklist + impact physics table
- Page 7: direction conflict + damage pattern matching
- Page 8: speed verification + severe wording
- Page 9: structural intelligence note

## Additional findings from pages 10-14

### 7. Cost decision values are internally inconsistent
- Page 10 shows **Agreed / Settled Cost = $719.32**.
- Page 12 valuation note says **Repair cost (USD 719.32)** but also foregrounds **KINGA Optimised Cost: $176.00**.
- The report may be mixing the selected quote / adjusted cost / KINGA optimised benchmark without clearly distinguishing decision cost versus benchmark cost.

### 8. Evidence inventory contradicts other sections
- Page 13 says **Evidence Inventory: 0 detected, 0 processed, 0 fraud points**.
- The same page immediately lists supporting documents: claim form, repair quote, vehicle registration.
- Earlier sections also clearly rely on extracted documents and damage component data.
- This is a direct inconsistency and likely the wrong source/section logic for the evidence inventory counters.

### 9. Fraud score breakdown currently sums to 61, not 83
- Page 13 factor contributions show: Damage inconsistency 20, Cost deviation 0, Direction mismatch 15, Repeat/prior claim 0, Missing data 10, Severity vs physics 16.
- These total **61**, but the displayed fraud score is **83/100**.
- Page 14 breakdown shows Severity vs Physics Mismatch = **0/20**, not 16/20, making the inconsistency even larger.
- This strongly suggests the fraud summary panel and the detailed table are not reading the same scoring object.

### 10. Severity vs physics flag is contradictory across fraud section
- Page 13 factor contributions include **Severity vs Physics = 16/20**.
- Page 14 says **Severity vs Physics Mismatch = 0/20, Triggered: No**.
- This aligns with the earlier severity inconsistency and likely indicates stale or mixed fraud inputs.

### 11. Missing data weight may be too punitive for this case
- Missing data contributes **10/20** largely due to absent police report and policy number.
- However, the report already labels some missing items as having “no impact” or limited impact elsewhere.
- The calibration may be overweighting generic document absence relative to claim-specific contradiction evidence.

### 12. Direction mismatch may also be too rigidly scored
- The reported side-swipe narrative and analyst reasoning indicate ambiguity around rear-quarter / side location.
- Yet fraud adds **15/20** for impact direction mismatch, which may be too aggressive if the component-level evidence is only partially specified rather than clearly contradictory.

## Strongest code-investigation targets after pages 10-14
- Fraud score cover card vs executive summary vs fraud breakdown table must be reconciled to a single authoritative source.
- Evidence Inventory counters need to use the same extracted-document basis as Supporting Documents.
- Severity-vs-physics mismatch flag needs one source of truth.
- Direction mismatch scoring likely needs calibration or ambiguity handling for lateral / rear-quarter sideswipe cases.


## Incident narrative hallucination findings (pages 4-9)

### Raw narrative quality issue
- **Page 4, Section 1.1a Incident Narrative** contains the quoted text: "Insured side Susiped by anther carr on the left side".
- This is not acceptable final-report narrative text. It contains obvious extraction or OCR corruption and should either be marked as low-confidence source text or normalised with an explicit confidence disclaimer.

### Hallucinated or overconfident narrative upgrades
- **Page 4, Reconstructed Sequence** upgrades the corrupted text into a clean declarative sentence: "The insured vehicle was sideswiped by another car. The impact occurred on the left side of the insured vehicle."
- That may be a reasonable interpretation, but it is stronger and cleaner than the extracted wording and is presented as if fully established.
- **Page 7, Reconstruction Summary** further upgrades it into a technical narrative with exact event framing: "[SIDESWIPE] Lateral glancing contact ... Estimated lateral contact speed: 13 km/h ... 4 damaged component(s) identified." This reads as a definitive narrative despite the weak source narrative and partial location conflict.

### Internal contradiction in the incident narrative chain
- The report states a **left-side sideswipe** narrative, while the observed damage zone summary highlights **Rear** and the damage map / pattern-matching sections say expected side-passenger zones were not corroborated.
- **Page 8** still says the vehicle was travelling at approximately 13 km/h and that the impact is consistent with moderate-to-severe structural damage and expected component replacement, then immediately says one or more signals are not fully aligned.
- This creates a narrative problem: the report oscillates between confident reconstruction and unresolved contradiction.

### Specific sentence-level issues to fix
- Do not present corrupted source text as a normal narrative.
- Do not silently convert low-confidence extracted narrative into a clean factual reconstruction.
- Use wording such as **"the extracted narrative appears to indicate..."**, **"additional information is required to confirm..."**, or **"the available narrative is low-confidence / partially corrupted"**.
- Where damage direction remains unresolved, the report should explicitly say the narrative is **not independently corroborated by the observed damage distribution**.

### Related pages
- **Page 6** also contains a label issue: "Estimated Speed 13.0 km/h (driver stated)" while the figure is actually the physics estimate.
- **Pages 8-9** show both a structural-evidence speed and an "Insufficient Evidence for Independent Speed Verification" banner, which contributes to the narrative hallucination problem by overstating certainty in one place and understating it in another.
