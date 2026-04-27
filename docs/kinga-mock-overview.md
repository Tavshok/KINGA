# KINGA AutoVerify AI
## Mock Report & Dashboard Overview
### For Review and Commercial Testing — April 2026

---

> **How to use this document:** Four interactive HTML files accompany this overview. Open each file directly in a browser — no internet connection required. Each file has tab buttons at the top to switch between views. This document explains what each file shows and what commercial value it is testing.

---

## File 1 — `mock-layer-a-claims-report.html`
### Insurer Claims Assessment Report — All Four Tier Variants

**What it shows:** A single claims report for the same vehicle (or comparable claims) rendered four different ways depending on the insurer's subscription tier. Switch between tabs at the top: Starter, Tier 1 (Process), Tier 2 (Protect), Tier 3 (Prove).

**What each tab demonstrates:**

| Tab | What the insurer sees | What is locked |
|---|---|---|
| Starter | AI verdict, damage table, quote vs benchmark chart | Physics, fraud scoring |
| Tier 1 — Process | + Physics summary, FCDI score (number only), per-line quote optimisation | Fraud signal breakdown |
| Tier 2 — Protect | + Full fraud signal cards with evidence, negotiation intelligence, signal charts | Full physics reconstruction |
| Tier 3 — Prove | + Full speed ensemble table, per-component physics table, M5 dual-path, validated determination workflow | Nothing — full package |

**Value being tested:** Does the tier boundary feel natural and commercially justified? Does a Tier 1 insurer look at the locked Tier 2 panel and immediately understand what they are missing and why it is worth paying for? Does the Tier 3 validated determination workflow feel credible enough for an insurer to use in a dispute or IPEC submission?

**Key design features to evaluate:**
- Black/white/grey base with colour only on charts and status flags
- FCDI gauge (doughnut chart) with colour-coded score
- Fraud signal cards with severity indicators and specific evidence descriptions
- Speed ensemble table with method-by-method breakdown
- Per-component crush depth and deformation energy charts
- Validated determination signature block at Tier 3

---

## File 2 — `mock-layer-b-dashboards.html`
### Operational Dashboard (Tier 1) and Executive Intelligence Dashboard (Tier 2+)

**What it shows:** Two distinct dashboards for two distinct roles within the same insurer. Switch between tabs: Operational Dashboard (Claims Manager) and Executive Intelligence Dashboard (CFO/CEO/Head of Claims).

**Operational Dashboard — what it demonstrates:**
The claims manager's daily working view. Five KPI cards at the top (queue size, processed today, average confidence, savings identified, FCDI alerts). A live claims queue table with AI verdict, FCDI score, and one-click action buttons. Processing velocity trend chart. Verdict distribution doughnut. Top fraud signals this month.

**Value being tested:** Does this feel like a tool a claims manager would actually use every day? Is the information density right — enough to act without being overwhelming? Does the FCDI alert count in the top KPI row create urgency to investigate?

**Executive Intelligence Dashboard — what it demonstrates:**
The portfolio-level strategic view. Six KPI cards including loss ratio impact and portfolio risk score. A 12-month dual-axis chart showing submitted vs settled amounts — the gap is KINGA's value made visible. Fraud detection funnel. Cumulative savings tracker from deployment date. Top repairers by quote deviation. Monthly intelligence summary paragraph.

**Value being tested:** Can a CFO look at this dashboard for 60 seconds and understand the financial return on the KINGA subscription? Does the savings tracker create a compelling renewal argument? Does the repairer deviation table identify actionable intelligence that the insurer could not see before?

---

## File 3 — `mock-layer-c-forensic-assessor.html`
### Forensic Intelligence Package (Tier 3) and Assessor Tier Reports (Free / Professional / Forensic Partner)

**What it shows:** Two distinct product lines sharing the same engine. Switch between tabs: Forensic Intelligence Package (insurer Tier 3 output) and three assessor tier reports.

**Forensic Intelligence Package — what it demonstrates:**
The full physics-backed reconstruction document for a disputed claim. Cover page with prominent disclaimer transferring legal ownership to the insurer. Section 1: data integrity and input fidelity scores. Section 2: full speed ensemble with all five methods, mathematical basis, and consensus. Section 3: per-component physics measurements with charts. Section 4: M5 Vision dual-path cross-validation showing Path A (Campbell) and Path B (energy balance) side by side. Section 5: fraud signal evidence dossier with specific evidence references. Section 6: validated determination workflow with signature fields.

**Value being tested:** Does this document feel credible enough to submit to IPEC or use in a legal dispute? Does the risk transfer mechanism (insurer signs the validated determination) feel commercially and legally sound? Would an insurer pay $100 on-demand for this on a disputed $15,000 claim?

**Assessor Reports — what they demonstrate:**

| Tab | What the assessor sees | Value proposition |
|---|---|---|
| Free | Damage detection, component list, repair type | Entry product — gets assessors onto the platform |
| Professional | + Cost benchmarks, quote deviation, parts sourcing intelligence | Replaces manual rate-card lookups and benchmark research |
| Forensic Partner | + Full physics reconstruction, speed ensemble, insurer referral workflow | Positions the assessor as an expert witness and generates insurer referrals |

**Value being tested:** Does the free tier feel genuinely useful — enough to attract assessors without giving away the paid value? Does the Professional tier justify $150/month for a working assessor? Does the Forensic Partner tier create a credible new revenue stream (insurer referrals) that an experienced assessor would pay $400/month for?

---

## File 4 — `mock-claim-intake.html`
### Claimant Portal and Insurer Direct Intake

**What it shows:** The two channels through which claims enter the KINGA platform. Switch between tabs: Claimant Portal (self-service) and Insurer Direct Intake (handler-assisted).

**Claimant Portal — what it demonstrates:**
A five-step guided submission flow designed for a claimant with no insurance knowledge. Step 1: vehicle details. Step 2: incident details. Step 3: guided photo upload with required angle prompts. Step 4: supporting documents. Step 5: review and submit. Progress indicator at the top. Plain language throughout. Immediate acknowledgement with claim reference on submission.

**Value being tested:** Is this simple enough for a claimant to complete on a mobile phone at the roadside? Does the guided photo upload prompt produce the right photos for the KINGA pipeline to analyse? Does the immediate acknowledgement reduce inbound calls to the insurer's claims line?

**Insurer Direct Intake — what it demonstrates:**
The same five-step flow optimised for a trained claims handler. Additional fields: handler notes, priority flag, queue assignment. Designed to be completed in under three minutes. Batch upload capability for multiple photos. Direct assignment to a specific processor.

**Value being tested:** Is this fast enough for a high-volume claims environment? Does the priority flag and queue assignment integrate naturally with the Operational Dashboard claims queue?

---

## Summary — What We Are Testing

These four HTML files are not a finished product. They are a commercial test of three hypotheses:

**Hypothesis 1 — Tier boundaries are commercially justified.** Each tier boundary should feel like a natural upgrade decision, not an arbitrary restriction. The locked panel messaging should create genuine urgency, not frustration.

**Hypothesis 2 — The reports are valuable enough to pay for.** An insurer looking at the Tier 2 fraud signal breakdown should feel that $900/month is a reasonable price for the intelligence it provides. An assessor looking at the Forensic Partner report should feel that $400/month opens a new revenue stream.

**Hypothesis 3 — The design signals authority.** The black/white/grey typographic foundation with colour reserved for data should feel like a forensic or engineering document — not a software dashboard. It should signal precision, objectivity, and credibility.

**Feedback requested on each file:**
1. Is the information density right — too much, too little, or well-calibrated?
2. Do the locked sections create the right upgrade tension?
3. Does the design feel authoritative enough for an insurer to present to their board or to IPEC?
4. Is there any intelligence that is visible at a lower tier that should be locked behind a higher tier?
5. Is there any intelligence that is locked that should be visible at a lower tier to demonstrate value?

---

*KINGA AutoVerify AI · Mock Overview · April 2026 · Confidential*
