# KINGA Claims Intelligence Report — Section Definition
**Report Tier:** Protect + Prove  
**Audience:** Risk Manager, Claims Manager, Executive  
**Purpose:** Analytical layer between the operational Claims Assessment Report and the evidentiary Forensic Audit Report. Answers: *Is this claim suspicious? How much are we exposed? What is the pattern?*

---

## Report Structure

---

### Section 1 — Intelligence Summary

**One-page executive brief. The Risk Manager reads this and knows everything they need to act.**

| Field | Description |
|---|---|
| KINGA Intelligence Score | Composite 0–100 score combining fraud signal, cost leakage, and assessor variance |
| Risk Classification | LOW / ELEVATED / HIGH / CRITICAL with colour coding |
| Recommended Action | Pay / Investigate / Refer to Fraud Unit / Decline |
| Key Finding | Single sentence: the most important thing KINGA found on this claim |
| Financial Exposure | Submitted amount vs KINGA benchmark vs estimated leakage |
| Flags Triggered | Count of fraud signals, cost anomalies, and consistency issues |

---

### Section 2 — Fraud Signal Analysis

**What KINGA's fraud detection engine found. Not the full physics reconstruction (that is the Forensic Report) — the signal summary.**

**2.1 Fraud Risk Score**
- Overall fraud risk score (0–100) with confidence band
- Risk tier: Low / Medium / High / Critical
- Score components breakdown (weighted bar chart):
  - Photo inconsistency signal
  - Narrative consistency score
  - Claimant history signal
  - Timing anomaly signal
  - Repair cost anomaly signal
  - Network linkage signal (same claimant / assessor / panel beater patterns)

**2.2 Triggered Fraud Flags**
- Table of all fraud flags triggered, each with:
  - Flag name and category (Photo / Financial / Narrative / Network / Timing)
  - Severity (Low / Medium / High)
  - Brief explanation (1–2 sentences)
  - KINGA confidence level

**2.3 Photo Inconsistency Summary**
- Number of photos analysed
- Inconsistencies detected (EXIF anomalies, lighting mismatches, staging indicators)
- Specific pages/photos flagged with brief description
- No full forensic reconstruction — that is in the Forensic Audit Report

**2.4 Narrative Consistency**
- Claimant statement vs damage pattern alignment score
- Incident description vs physics plausibility (summary only — not full reconstruction)
- Key inconsistencies noted (bullet list, max 5)

---

### Section 3 — Financial Intelligence

**Where the money is. The leakage analysis.**

**3.1 Cost Exposure Summary**
- Submitted claim value
- KINGA AI benchmark estimate
- Variance amount and percentage
- Leakage classification: Within tolerance / Moderate overstatement / Significant overstatement / Suspected inflation

**3.2 Component-Level Cost Analysis**
- Table of submitted line items vs KINGA benchmark per component
- Colour-coded: green (within tolerance), amber (elevated), red (significant variance)
- Top 3 highest-variance items highlighted
- Repair vs replace recommendation per component

**3.3 Quote Intelligence**
- Panel beater quote vs market benchmark
- Historical quote accuracy score for this panel beater (if available)
- Structural gap rate for this panel beater (if available)
- Anomaly flags: unusual line items, duplicate charges, inflated labour rates

**3.4 Reserve Adequacy**
- Current reserve vs KINGA projected settlement range
- Reserve adequacy rating: Adequate / Under-reserved / Over-reserved
- Recommended reserve adjustment (if applicable)

---

### Section 4 — Claimant & Network Intelligence

**Who is involved and whether they have been seen before.**

**4.1 Claimant Profile**
- Claim history: number of prior claims, total value, outcomes
- Prior fraud flags (count only — no personal data beyond what is necessary)
- Risk profile: First-time claimant / Repeat claimant / Elevated history / High-risk history

**4.2 Vehicle Intelligence**
- Vehicle history on the KINGA platform (prior claims on this registration)
- Salvage or write-off history (if available)
- Registration anomalies (if detected)

**4.3 Network Linkage Analysis**
- Connections between claimant, assessor, and panel beater
- Prior co-appearances on other claims (same assessor + same panel beater pattern)
- Network risk rating: No linkage / Indirect linkage / Direct linkage / Flagged network

**4.4 Assessor Performance Context**
- Assigned assessor's accuracy score and variance rate
- Whether this assessor has a pattern of under-assessing or over-assessing
- Assessor-specific anomaly flags on this claim (if any)

---

### Section 5 — Temporal & Contextual Intelligence

**When things happened and whether the timing makes sense.**

**5.1 Claim Timeline Analysis**
- Days from incident to claim submission
- Days from submission to assessment
- SLA compliance status
- Timing anomaly flags: unusually fast submission, late submission, weekend/holiday incident

**5.2 Incident Context**
- Incident location risk profile (high-frequency accident zone, known fraud hotspot)
- Weather and road conditions at time and location (if available)
- Incident type frequency: is this type of incident common in this area?

**5.3 Seasonal & Portfolio Context**
- Is this claim type elevated in the current period?
- Portfolio-level context: is there a spike in similar claims this month?

---

### Section 6 — Intelligence Actions & Recommendations

**What to do next. Specific, actionable, prioritised.**

**6.1 Recommended Actions**
- Primary recommendation (Pay / Investigate / Refer / Decline) with rationale
- Specific next steps (bullet list, max 5):
  - e.g. "Request independent assessment — quote variance exceeds 35%"
  - e.g. "Verify incident report with traffic authority — timing anomaly detected"
  - e.g. "Refer to Fraud Unit — network linkage score above threshold"

**6.2 Investigation Triggers**
- List of specific items that, if confirmed, would change the recommendation
- e.g. "If assessor confirms structural damage to chassis, reserve should increase by $X"

**6.3 Escalation Path**
- Whether this claim requires Risk Manager sign-off, Claims Manager approval, or Fraud Unit referral
- Approval authority based on claim value and risk classification

**6.4 Forensic Report Trigger**
- Whether the fraud signal and financial exposure justify commissioning the full Forensic Audit Report
- KINGA recommendation: Forensic Report warranted / Not warranted at this stage
- Estimated value of forensic investigation relative to claim exposure

---

## Data Sources (All Available in Current Pipeline)

| Section | Data Source |
|---|---|
| Fraud Signal Analysis | `fraudScoreBreakdownJson`, `photoInconsistenciesJson`, stage-8 output |
| Financial Intelligence | `enrichedPhotosJson`, quote line items, `aiCostEstimate`, `repairVsReplaceJson` |
| Claimant & Network | `claims` table history, `assessorAssignments`, `panelBeaterQuotes` |
| Temporal & Contextual | `claims.incidentDate`, `claims.submittedAt`, workflow event log |
| Recommendations | Derived from fraud score, cost variance, and network linkage thresholds |

---

## What Distinguishes This from the Other Two Reports

| Dimension | Claims Assessment Report | Claims Intelligence Report | Forensic Audit Report |
|---|---|---|---|
| **Primary question** | What should I do with this claim? | Is this claim suspicious and how much am I exposed? | Can I prove this decision in court? |
| **Audience** | Claims Processor | Risk Manager, Claims Manager | Legal, Compliance, Reinsurance |
| **Physics reconstruction** | No | No (summary signal only) | Yes (full) |
| **Fraud score** | Flag only (yes/no) | Full score + components | Full breakdown + confidence intervals |
| **Financial analysis** | Quote comparison | Leakage analysis + reserve adequacy | Full forensic cost reconstruction |
| **Network analysis** | No | Yes (linkage summary) | Yes (full chain) |
| **Legal defensibility** | No | No | Yes |
| **Length** | 8–12 pages | 12–18 pages | 25–40 pages |
| **Generation time** | Immediate (pipeline output) | Near-immediate (derived from pipeline) | 2–5 minutes (full reconstruction) |
