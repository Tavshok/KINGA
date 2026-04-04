# Report Audit Findings

## Screenshots reviewed so far (1-5 of 20)

### CRITICAL: Cost Contradiction
- AI Estimated Total: US$462.00
- Est. Parts (AI): US$840.00
- Est. Labour (AI): US$300.00
- **BUG**: 840 + 300 = 1,140 ≠ 462. The total is WRONG — it should be US$1,140.00
- The total shown (US$462) appears to be a partial/stale value, not the sum of parts+labour

### Damage Components Cards
- All 4 components show "Unknown / Unknown" for location/severity detail
- Component names: SUNDRIES Reconchika, FRONT SEAT BELTS X2, REPROGRAMMING, SEAT BELTS
- All tagged MODERATE — but no cost breakdown per component
- "Unknown" fields look unprofessional and confusing to users

### AI Damage Analysis Summary
- Text is very small and hard to read
- Background colour makes text barely visible (low contrast)
- The summary text is good content but presentation is poor

### Structural Damage Alert
- Red banner for "Structural Damage Detected" — but this is a generic AI inference, not confirmed
- No distinction between confirmed vs inferred structural damage

### Three-Source Damage Consistency
- Shows "No consistency check has been run yet" — this should auto-run or be more prominent
- The "Run Check" button is not obvious

### Accident Reconstruction Section
- INCIDENT TYPE: N/A — should show "Animal Strike" based on the claim
- DAMAGE CONSISTENCY: 20% — this is very low and unexplained
- Hidden damage items (Front crash bar, Radiator support, Radiator/AC condenser, Wheel alignment) 
  all shown with "High Confidence" badges — but these are inferred, not confirmed
- The recommendation banner text is very long and hard to read

### Repair Cost Analysis
- "No panel beater quotes submitted" warning is correct
- But the cost figures shown (US$462 total, US$840 parts, US$300 labour) are contradictory
- "AI Cost Optimisation not yet triggered" — large empty box looks unfinished

## Issues to fix:
1. **MATH BUG**: Total = Parts + Labour (1,140, not 462)
2. **"Unknown" fields**: Extract and display actual component location/severity from AI data
3. **Low contrast**: AI summary text barely readable
4. **Incident Type N/A**: Should show classified incident type
5. **Cost display**: Contradictory figures across sections
6. **Empty state boxes**: "Not yet triggered" boxes look unfinished
7. **Component cards**: Need cost per component, not just severity badge
8. Need to see remaining 15 screenshots for more issues

## Screenshots 6-11 Additional Findings

### COST CONTRADICTIONS (Critical)
Multiple cost figures appear across different sections with NO consistency:
- Section "AI Photo Analysis" (top): Parts US$840, Labour US$300, Total US$462 — WRONG (840+300=1,140 ≠ 462)
- Section "Repair Cost Analysis": AI Estimated Total US$462, Parts US$840, Labour US$300 — same wrong total
- Section "Fair Cost Benchmark": Fair Cost Range $393–$601, Mid $462, Parts Projection $254, Labour $208
- So we have THREE different parts figures: $840 (AI photo), $254 (benchmark), and they never reconcile
- Labour also contradicts: $300 (AI photo) vs $208 (benchmark)
- The $462 "total" is actually the benchmark MID, not the sum of parts+labour

### FRAUD SCORE CONTRADICTION
- Fraud & Risk Analysis gauge shows: Score 58/100 — "Moderate Risk"
- Enforced Fraud Classification shows: "Minimal Risk" (score adjusted +15 from anomalies)
- Intelligence Enforcement Layer says: "Fraud score adjusted +15 points due to consistency anomaly"
- So the raw score is 58, adjusted is 73 (High), but it shows "Minimal Risk" — CONTRADICTION
- The system is showing two different fraud risk labels simultaneously

### CAUSAL REASONING VERDICT
- Plausibility: 0% "Very Low" — this is alarming and unexplained to the user
- Physics: "Inconsistent" badge — but Direction-Damage shows "Consistent" — CONTRADICTION
- The system flags the claim as potentially fraudulent but also says direction is consistent

### CONTRADICTIONS SECTION (Advanced Analytics)
- Shows MODERATE, CRITICAL, MAJOR level contradictions in very dense small text
- Wall of text — completely unreadable, no visual hierarchy
- Technical jargon like "physics_constraint vs observed_damage" means nothing to an insurer
- "Confidence in check: 70%" and "20%" appear with no explanation

### FAILED GENERATIONS (What system couldn't produce)
- Incident Type: N/A (should be "Animal Strike" — classification engine ran but result not surfaced)
- Photos: "no photos" badge — images were uploaded but not processed through analysis pipeline
- Damage pattern: "photos_not_ingested" — 5/20 score, photos detected but not processed
- "damage_pattern_unverified" — 8/20 score, photos not processed through analysis
- Consistency check: "No consistency check has been run yet" — should auto-run
- Repair/Value Ratio: N/A — should be calculated from available data

### INTELLIGENCE ENFORCEMENT LAYER
- Good structure but "Physics Intelligence" assessor insight text is very long and dense
- "Causal chain · evidence bundle · realism validation · benchmark deviation · cross-engine consensus (Stages 35–42)" — subtitle is technical jargon
- The entire section reads like a developer debug log, not an insurer-facing report

## Screenshots 12-16 Additional Findings

### CROSS-ENGINE CONSENSUS — MAJOR CONTRADICTION
- Consensus Score: 100/100 STRONG
- But immediately below: "2 dimension(s) in conflict: Damage Zone ↔ Document Direction; Photo Evidence Presence"
- All 8 dimensions show "CONFLICT" badges
- Dimension 5 and Dimension 3 show scores of 2000 — clearly a data rendering bug (should be 0-100 scale)
- A score of 100/100 STRONG while ALL 8 dimensions show CONFLICT is a fundamental logic contradiction

### EVIDENCE BUNDLE — DATA RENDERING ISSUES
- Fraud: HIGH 95% — but earlier fraud classification showed "Minimal Risk"
- Cost: HIGH 100% — but cost data has multiple contradictions
- Weighted composite formula shown raw: "damage×0.25 + physics×0.25 + fraud×0.2 + cost×0.2 + reconstruction×0.1" — this is developer debug text, not user-facing

### CAUSAL CHAIN
- Decision Outcome: ESCALATE, Confidence 82%
- Step 3: "1 required field(s) missing: policeReportNumber" — shown as a highlighted step, looks like an error
- The causal chain steps are good but the missing field highlight is confusing

### PHYSICS CONSTRAINT VALIDATION — TERMINOLOGY ISSUES
- All constraint names use snake_case: "no_structural_damage", "impact_force_range", "delta_v_consistency"
- These are internal code identifiers, not human-readable labels
- "Accept with explanation" links appear on failed constraints — good feature but needs better styling

### ALTERNATIVE CAUSES SECTION
- "Lower speed animal strike with pre-existing or unrelated damage" — 65%
- "Fraudulent claim with staged damage" — 30%
- These are good insights but presented as plain text paragraphs with no visual hierarchy
- The 65%/30% percentages appear at the far right with no label — unclear what they represent

### FORENSIC CONSTRAINT ANALYSIS
- Entire section is one massive wall of text with **bold** markdown syntax showing as literal asterisks
- "The inferred cause is **invalid**" — the double asterisks are rendering as text, not bold
- This is a markdown rendering failure — the LLM output is not being rendered as HTML

### WHAT THE SYSTEM FAILED TO GENERATE
1. Incident Type classification result not surfaced to the Accident Reconstruction section (shows N/A)
2. Photo analysis pipeline not triggered — photos uploaded but not processed
3. Three-source consistency check not auto-triggered
4. Repair/Value Ratio not calculated
5. SVG impact diagram not visible (blank space where diagram should be)
6. AI cost optimisation not triggered
7. Police report number not extracted from documents
