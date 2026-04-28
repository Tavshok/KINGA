# KINGA AutoVerify AI — Mock Feedback Synthesis
## Three-Source Analysis & Improvement Plan
### April 2026

---

## Overview

Three independent reviewers evaluated the four mock HTML files against the strategic architecture document. Their feedback converges on a single diagnosis: **the reports are technically strong but commercially immature** — they demonstrate capability without yet demonstrating value in the language insurers and assessors actually use to make purchasing decisions. The improvements required fall into three categories: tier discipline (what is shown at each level), value language (translating outputs into financial and legal outcomes), and depth of evidence (making the intelligence feel irrefutable rather than indicative).

This document synthesises all three feedback sources, identifies where they agree, and produces a prioritised improvement plan for the two files that matter most: `mock-layer-a-claims-report.html` and `mock-layer-c-forensic-assessor.html`.

---

## Section 1 — Where All Three Reviewers Agree (Highest Priority)

These issues appear in all three feedback sources and must be addressed first.

### 1.1 Tier 1 is Too Generous — Undermining the Upgrade Mechanic

**Feedback 1 (Architecture Review):** "Your mockup violates this. In Tier 1, you show full damage analysis table with 7 components, structural risk flags, detailed fraud signal breakdown with 4 signals, and full quote reconciliation table with benchmark ranges. This is Tier 2 content in a Tier 1 wrapper."

**Feedback 2 (Decision/Money/Defence Framework):** Tier 1 should answer only: "Can I process this quickly?" — validate claim, benchmark cost, basic fraud score, decision support. Nothing more.

**Feedback 3 (Data Richness Review):** Locked sections should show a mini-preview and a one-click upgrade button with pricing, not full content.

**Resolution:** Strip Tier 1 back to exactly what the architecture specifies:
- Single decision card (Approve / Review / Reject) with one-sentence summary
- FCDI score as a single number on a colour band — no signal breakdown, no descriptions
- Quote comparison: Submitted $4,820 | KINGA Fair Value $4,706 | Delta +$114 (+2.4%) — no line-item analysis
- Damage summary: "3 zones identified: Front, Right, Bonnet" — no per-component table
- AI Confidence: 84% — single number, no explanation

### 1.2 The Reports Speak to Capability, Not to Outcomes

**Feedback 2 (Decision/Money/Defence):** "Insurers don't pay for good visuals, good AI, good explanations. They pay for Speed + Savings + Confidence in decision."

**Feedback 3 (Data Richness):** "Expected leakage if approved as submitted in bold red."

**Feedback 1 (Architecture):** "The on-demand Forensic Reconstruction Report at $75–$150 as a critical Tier 3 gateway is invisible."

**Resolution:** Every section must answer one of three questions: Does this help the insurer approve faster? Pay less? Defend their decision? Add a **Decision Impact Panel** immediately after the verdict card at every tier showing the financial consequence of each available action.

### 1.3 Assessor Tier Names and Prices Do Not Match the Architecture

**Feedback 1 (Architecture):** "Your mockup names them Free → Professional → Forensic Partner. The architecture defines Draft ($5/claim), Assess Pro ($12/claim), Forensic Partner ($25/claim or $200/month). 'Free' doesn't exist in the architecture."

**Feedback 2 and 3:** Both note the assessor tiers need clearer economic positioning — the fee uplift from standard assessment ($40) to forensic assessment ($150–$300) is not visible.

**Resolution:** Rename all three assessor tiers to match the architecture. Show actual per-claim pricing in the locked panels. Add a "Report Value" panel in the Forensic Partner tier showing the fee progression and referral earnings.

---

## Section 2 — Where Two Reviewers Agree (High Priority)

### 2.1 Missing: Financial Decision Impact Panel

**Feedback 2:** "Right after your decision banner, add: IF APPROVED AS SUBMITTED: Cost $4,820, Risk of overpayment LOW (±2.4%). IF NEGOTIATED TO AI MIDPOINT: Target $4,706, Saving $114, Probability of acceptance 78%. IF ESCALATED FOR FORENSIC: Cost $200–$400, Expected saving $1,200–$3,800."

**Feedback 3:** "Show expected leakage if approved as submitted in bold red."

**Resolution:** Add Decision Impact Panel at Tier 1 and above. At Tier 2, expand with negotiation floor/target/ceiling. At Tier 3, add What-If negotiation simulator.

### 2.2 Missing: Confidence as a Progressive Product

**Feedback 1 (Architecture):** "Tier 1: Show AI Confidence: 84% as a single number. Tier 2: Show Confidence: High (84%) with tooltip. Tier 3: Show full statistical backing — ensemble confidence, per-method confidence, cross-validation agreement."

**Feedback 3:** "Add expandable rows that show detailed calculations when clicked."

**Resolution:** Confidence must be a tiered product. At Tier 1 it is a number. At Tier 2 it is a verdict with context. At Tier 3 it is a full statistical breakdown with per-method confidence intervals.

### 2.3 Missing: On-Demand Purchase CTA in Tier 2 Locked Panels

**Feedback 1 (Architecture):** "The Tier 2 locked panel for physics should read: [Upgrade to Prove — $1,500/month] or [Purchase this report — $100]."

**Feedback 2:** Escalation trigger logic should make the upgrade feel intelligent, not upsell-driven.

**Resolution:** Every locked panel at Tier 2 must offer two options: upgrade the subscription, or purchase this specific report on-demand. The on-demand price ($100) must be visible.

### 2.4 Missing: Fraud Narrative in Tier 2 That References Physics Without Revealing Numbers

**Feedback 1 (Architecture):** "In Tier 2, add a Fraud Narrative panel that reads: 'The impact pattern is inconsistent with a low-speed parking incident — upgrade to Prove to see the specific speed reconstruction.'"

**Feedback 2:** "Challenge Simulation — If claimant disputes: LIKELY ARGUMENT: 'Speed estimate is incorrect'. SYSTEM RESPONSE: 4 independent methods converge (32–38 km/h)."

**Resolution:** Tier 2 fraud section must include a plain-English narrative that connects the fraud score to the physical evidence without revealing the specific numbers. This creates the deliberate friction that drives Tier 3 upgrades.

### 2.5 Missing: Repairer Intelligence Layer

**Feedback 2:** "Panel Beater Profile: Historical average deviation +12%, Rework rate 8%, Avg repair duration 6.2 days, Ranking 7/23 in region. Tends to overprice labour hours."

**Feedback 3:** "Parts pricing source: Benchmark sourced from 3 local dealerships (Msasa, Willowvale, Harare CBD) and 2 aftermarket suppliers, updated weekly. Labour rate justification: Harare panel beating market rate $45–$55/hr. Claimant quote uses $68/hr → $322 excess flagged."

**Resolution:** Add Repairer Intelligence panel at Tier 2 and above. This transforms the report from a claim assessment into a market intelligence tool — a qualitatively different value proposition.

---

## Section 3 — Single-Source Additions (Medium Priority)

### 3.1 Forensic Report: Defensibility Score and Challenge Simulation (Feedback 2)

Add a Defensibility Score (e.g., 8.6/10) broken down by physics consistency, evidence integrity, photo authenticity, and cross-method agreement. Add a Challenge Simulation panel showing the most likely claimant argument, the system's response, and the probability that the insurer's position is upheld (e.g., 82%).

### 3.2 Forensic Report: Evidence Chain Integrity (Feedback 2 and 3)

Add: Photos hashed (YES), EXIF preserved (YES), Timestamp anomalies (DETECTED — 2 files), Tampering likelihood (MODERATE). This is what makes the report usable in a legal dispute.

### 3.3 Forensic Report: Enhanced Physics Table with Confidence Intervals (Feedback 3)

Upgrade the per-component physics table to include: 95% CI on crush depth (±0.5 cm), Energy/Area (kJ/m²), Stiffness k (N/m) with source citation, and a flag column. Show the formula E = ½kd² explicitly. Cite stiffness source as NHTSA crash test database.

### 3.4 Forensic Report: FCDI Waterfall Chart (Feedback 3)

Replace or supplement the FCDI bar chart with a waterfall chart that starts at 0 and adds each signal's contribution to reach the final score, with threshold lines for "mandatory review" and "automatic reject".

### 3.5 Forensic Report: Negotiation Script (Feedback 2)

Add a structured negotiation script: Opening position, Anchor, Fallback, Walk-away. This directly saves adjusters time and makes the report actionable rather than descriptive.

### 3.6 Assessor Tier 3: Expert Witness Fee Uplift Panel (Feedback 1 and 2)

Add a "Report Value" panel showing: Standard assessment fee $40, Forensic assessment fee $150–$300, KINGA referral earnings $150/report, Professional indemnity: assessor's own cover. Add a commission tracker widget: "3 reports this month → $450 earned."

### 3.7 Assessor Tier 2: Vehicle Damage Visualisation (Feedback 1 and 3)

Add a vehicle silhouette diagram with damage zones highlighted. Add damage fraction as a column in the component table. Add structural risk classification (e.g., "A-Pillar — Structural: Safety-critical. Requires NDT inspection.").

### 3.8 Tier 3: Dispute-Ready PDF Download CTA (Feedback 1 and 3)

Add a "Download Forensic Audit Report (PDF)" button. Show a preview of the PDF cover page and table of contents in the mockup. The PDF must include page numbers, document control (version, date, hash), evidence chain with timestamps, methodology appendix, and signature blocks.

---

## Section 4 — Items to Defer or Reject

| Item | Reviewer | Decision | Reason |
|---|---|---|---|
| Remove Starter tier entirely | Feedback 1 | **Defer** — user decision needed | Architecture does not define it; may be a pilot entry point |
| Impact vector diagram | Feedback 1 | **Defer** — requires SVG engineering work | Valid but lower commercial priority than tier discipline |
| Relationship intelligence network | Feedback 1 | **Defer** — portfolio-level feature | Not claim-level; belongs in dashboard, not report |
| Replay dashboard | Feedback 1 | **Defer** | Operational feature, not report feature |
| ELA thumbnail and GPS trail map | Feedback 3 | **Defer** — requires image processing | Valid for production; too complex for mock |
| Pixel-level displacement maps | Feedback 3 | **Defer** | Requires computer vision output |
| Dynamic savings calculator in locked panels | Feedback 3 | **Include simplified version** | Static example is sufficient for mock |

---

## Section 5 — Prioritised Build Order

The following improvements are sequenced by commercial impact and implementation effort.

| Priority | File | Change | Impact |
|---|---|---|---|
| P0 | Layer A | Strip Tier 1 to architecture spec | Fixes the upgrade mechanic — without this, tiers are meaningless |
| P0 | Layer C | Rename assessor tiers + correct pricing | Fixes commercial credibility of the assessor channel |
| P0 | Layer A | Add Decision Impact Panel (all tiers) | Makes every tier immediately valuable in financial language |
| P1 | Layer A | Add Fraud Narrative in Tier 2 (physics reference without numbers) | Creates deliberate upgrade friction to Tier 3 |
| P1 | Layer A | Add on-demand purchase CTA ($100) in Tier 2 locked panels | Enables conversion without subscription upgrade |
| P1 | Layer A | Add Repairer Intelligence panel (Tier 2+) | Transforms report into market intelligence tool |
| P1 | Layer A | Add tiered Confidence display (number → verdict → full stats) | Makes uncertainty a product, not a limitation |
| P1 | Layer C | Add Defensibility Score + Challenge Simulation (Tier 3) | Makes forensic report courtroom-ready |
| P1 | Layer C | Add Evidence Chain Integrity panel (Tier 3) | Makes report legally defensible |
| P1 | Layer C | Add Negotiation Script (Tier 3) | Makes report actionable, not just descriptive |
| P1 | Layer C | Add Expert Witness Fee Uplift + Commission Tracker (Assessor Tier 3) | Makes upgrade economics self-evident |
| P2 | Layer C | Enhanced physics table with CI and stiffness (Tier 3) | Proves formula is not a black box |
| P2 | Layer C | FCDI waterfall chart | Stronger visual for fraud signal contribution |
| P2 | Layer A | Add Uncertainty Disclosure panel | Reduces resistance to automation |
| P2 | Layer C | Vehicle damage visualisation (Assessor Tier 2) | Adds spatial context to damage assessment |
| P3 | Layer C | PDF dispute-ready download CTA | Required for production; mock preview sufficient |

---

## Section 6 — The Core Principle Extracted from All Three Reviews

Every reviewer, in different language, identified the same gap. The reports currently say: **"Here is what we found."** They need to say: **"Here is what you should do, what it will cost you if you don't, and whether it will hold up if challenged."**

The three-layer framework from Feedback 2 is the clearest articulation of this:

> **Decision** — Clear, fast, binary.
> **Money** — What is gained or lost depending on the decision.
> **Defence** — If challenged, will this stand?

Every section added to the reports should be tested against these three questions. If it does not help the insurer approve faster, pay less, or defend their decision, it does not belong in the report.

---

*KINGA AutoVerify AI · Feedback Synthesis · April 2026 · Internal*
