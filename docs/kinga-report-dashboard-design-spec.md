# KINGA AutoVerify AI
## Report & Dashboard Design Specification
### Platform Visualisation Package — April 2026

---

> **Purpose of this document:** This specification defines the visual design, content architecture, and tier-gating logic for every report and dashboard produced by the KINGA AutoVerify AI platform. It is intended for use in commercial presentations to insurers and assessors, internal product planning, and implementation guidance. All data shown is representative of real pipeline output structures.

---

## Part 1 — Design Principles

### 1.1 Visual Language

All KINGA reports follow a strict black, white, and grey typographic foundation. This is a deliberate engineering aesthetic — the same visual language used in legal documents, forensic reports, and engineering specifications. It signals authority, precision, and objectivity.

**Colour is reserved exclusively for data.** Charts, gauges, risk indicators, and trend lines carry colour because colour in those contexts carries meaning: green means within range, amber means review, red means reject or fraud. Colour on a background or a heading carries no meaning and dilutes the signal.

| Element | Treatment |
|---|---|
| Page background | White (#ffffff) |
| Section headers | Black (#111111), uppercase, letter-spaced |
| Body text | Dark grey (#222222) |
| Secondary text | Medium grey (#555555) |
| Borders and dividers | Light grey (#e8e8e8) |
| Table headers | Black background, white text |
| Alternate table rows | Very light grey (#fafafa) |
| Charts and gauges | Full colour — green/amber/red/blue spectrum |
| Status flags | Colour-coded: green (verified), amber (review), red (dispute/fraud) |
| Decision banners | Colour-coded border only — not full-colour backgrounds |

### 1.2 Typography

- **Headings:** Arial, sans-serif, bold, letter-spaced
- **Body text:** Arial, sans-serif, regular
- **Numeric data:** Courier New, monospace — all financial figures, measurements, and scores
- **Labels:** Arial, 9px, 2px letter-spacing, uppercase — used for all field labels and section identifiers

### 1.3 Information Hierarchy

Every report and dashboard answers exactly one primary question for the person looking at it. The answer to that question is always the largest, most prominent element on the page. Supporting data is secondary. Evidence is tertiary.

| Report / Dashboard | Primary question answered |
|---|---|
| Claims Assessment Report (all tiers) | What should I do with this claim? |
| Operational Dashboard | What needs my attention right now? |
| Executive Intelligence Dashboard | How is our claims portfolio performing? |
| Forensic Intelligence Package | Can I prove this decision is correct? |
| Assessor Report (Free) | What damage is present on this vehicle? |
| Assessor Report (Professional) | What is the accurate repair cost? |
| Assessor Report (Forensic Partner) | What is the physics-backed reconstruction? |

---

## Part 2 — Insurer Tier Architecture

### 2.1 The Three-Layer Model

KINGA's intelligence is structured in three layers. The engine always runs all three layers on every claim. What changes between tiers is what the insurer is permitted to see and act on.

```
LAYER C — PROVE
Physics reconstruction · Speed ensemble · Per-method breakdown ·
Validated determination workflow · IPEC-ready package
────────────────────────────────────────────────────────────
LAYER B — PROTECT
Full FCDI fraud signal breakdown · Negotiation intelligence ·
Portfolio analytics · Executive Intelligence Dashboard
────────────────────────────────────────────────────────────
LAYER A — PROCESS
AI decision recommendation · Damage assessment · Quote benchmark ·
Physics summary · FCDI score (number only)
────────────────────────────────────────────────────────────
STARTER
AI decision · Damage summary · Quote benchmark only
```

### 2.2 Tier Pricing Summary

| Tier | Platform Fee | Per-Claim Fee | Target Insurer |
|---|---|---|---|
| Starter | $200/month | $18/claim | < 50 claims/month |
| Tier 1 — Process | $500/month | $12/claim | 50–200 claims/month |
| Tier 2 — Protect | $900/month | $12/claim | 200+ claims/month |
| Tier 3 — Prove | $1,800/month | $12/claim | High-value / disputed claims |

**On-demand Forensic Intelligence Package:** Available to any tier at $100 per claim. Unlocks the full Layer C output for a specific claim without requiring a Tier 3 subscription.

---

## Part 3 — Claims Assessment Report (Layer A)

### 3.1 Purpose and Audience

The Claims Assessment Report is the primary output document produced by KINGA for every processed claim. It is designed to be read by a claims processor, claims manager, or internal assessor. It answers the question: *what should I do with this claim, and why?*

It is a decision-support document. It is not a legal determination. The insurer owns every decision made on the basis of this report.

### 3.2 Starter Tier Report Content

The Starter tier report contains four sections:

**Section 1 — Decision Summary.** AI verdict (Approve / Negotiate / Reject), one-sentence plain-English reason, AI confidence percentage.

**Section 2 — Damage Assessment Table.** Component name, damage zone, damage description, repair type, quoted amount, KINGA verification status.

**Section 3 — Quote Benchmark.** Submitted amount vs benchmark range, deviation percentage, recommendation. Bar chart: quoted vs benchmark by component. Distribution chart: comparable claims settlement range with the current claim marked.

**Section 4 — Locked Sections.** Physics and fraud analysis panels shown as locked upgrade prompts with specific value messaging.

### 3.3 Tier 1 — Process Report Content

Tier 1 adds to the Starter content:

**Physics Summary Panel.** Consensus impact speed (km/h), confidence band, stated speed, deviation percentage, methods converged count. Damage consistency verdict. Max crush depth, total deformation energy, airbag deployment status, structural displacement.

**FCDI Score — Number Only.** The composite Fraud, Consistency, and Deviation Index score (0–100) with a colour-coded gauge and a plain-English interpretation. The individual signal breakdown is locked behind Tier 2.

**Enhanced Quote Optimisation.** Per-line-item comparison table with benchmark amounts and deviation percentages. Unverified line items flagged in red. Negotiation recommendation with target settlement amount.

### 3.4 Tier 2 — Protect Report Content

Tier 2 adds to Tier 1:

**Full FCDI Signal Breakdown.** Each fraud signal displayed as a named card with: signal category, weight in the composite score, severity indicator (Critical / High / Medium / Low), detailed evidence description, and the specific data point that triggered it. Signals are ordered by contribution to the composite score.

**Signal categories include:**
- Physics Contradiction (speed deviation, crush depth inconsistency, airbag anomaly)
- Photo Metadata Anomaly (EXIF timestamp mismatch, GPS inconsistency, duplicate image detection)
- Quote Inflation (unverified line items, above-benchmark pricing, parts not visible in photography)
- Behavioural Pattern (repeat claimant, repeat repairer, short policy tenure)
- Document Inconsistency (police report date mismatch, witness statement contradiction)

**Negotiation Intelligence Block.** Submitted amount, negotiation floor (minimum defensible), target settlement (recommended), ceiling (maximum justifiable), and potential saving. Supported by a comparable claims distribution chart.

**FCDI Signal Contribution Chart.** Horizontal bar chart showing each signal's point contribution to the composite score.

**Quote Breakdown Pie Chart.** Verified components vs disputed/unverified items vs labour.

### 3.5 Tier 3 — Prove Report Content

Tier 3 adds to Tier 2:

**Speed Inference Ensemble — Full Method Breakdown.** A table showing all five methods with their basis, speed result, confidence level, and inclusion/exclusion status. The consensus speed, confidence band, and deviation from stated speed are displayed prominently. A bar chart shows all method results alongside the stated speed for visual comparison.

**Per-Component Physics Measurements Table.** For each damaged component: crush depth (cm), deformation energy (J), structural displacement (mm), vision confidence (%), and consistency verdict. Totals row. Two charts: deformation energy by component and crush depth by component.

**M5 Vision Dual-Path Panel.** Path A (Campbell crush depth method) and Path B (energy balance method) displayed side by side with their inputs and speed estimates. Cross-validation result showing agreement percentage and confidence upgrade status.

**Validated Determination Workflow.** A structured reviewer acknowledgement section with fields for reviewer name, designation, date, and signature. Radio buttons for the validated determination (Approve at $X / Negotiate to $X / Reject). This section transfers legal ownership of the decision to the insurer's designated reviewer. KINGA's output is explicitly described as decision-support intelligence.

---

## Part 4 — Operational Dashboard (Tier 1+)

### 4.1 Purpose and Audience

The Operational Dashboard is the default landing view for the Claims Manager role. It answers the question: *what needs my attention right now?* It is a live, real-time view of the claims queue and processing metrics.

### 4.2 Dashboard Structure

**Top KPI Row (5 cards):**
- Claims in Queue (with count of urgent/overdue)
- Processed Today
- Average AI Confidence (%)
- Potential Savings Identified ($)
- FCDI Alerts (claims above 40-point threshold)

**Claims Queue Table.** Each row: claim reference, vehicle, submitted date, claimed amount, AI verdict, FCDI score (colour-coded), AI confidence, and action buttons (Review / Approve / Reject). Sortable by any column. Filterable by verdict, FCDI range, and date.

**Processing Velocity Chart.** Line chart: claims processed per day over the last 30 days. Shows processing rate trend and identifies backlogs.

**Verdict Distribution Chart.** Doughnut chart: Approve / Negotiate / Reject split for the current month.

**Top Fraud Signals This Month.** Horizontal bar chart showing the most frequently triggered fraud signal categories and their claim counts.

**Recent Activity Feed.** Timestamped list of the last 10 claim decisions with claim reference, verdict, and handler name.

---

## Part 5 — Executive Intelligence Dashboard (Tier 2+)

### 5.1 Purpose and Audience

The Executive Intelligence Dashboard is the default landing view for the Executive and Risk Manager roles. It answers the question: *how is our claims portfolio performing?* It is a strategic, portfolio-level view designed for the CFO, CEO, and Head of Claims.

### 5.2 Dashboard Structure

**Top KPI Row (6 cards):**
- Total Claims This Month
- Total Savings Identified ($)
- Fraud Detection Rate (%)
- Average Settlement ($) vs Benchmark
- Loss Ratio Impact (basis points)
- Portfolio Risk Score

**Portfolio Performance Chart.** Dual-axis line chart: submitted amounts vs settled amounts over 12 months. The gap between the two lines represents KINGA-identified savings.

**Fraud Detection Funnel.** Funnel chart: total claims → FCDI flagged → investigated → confirmed fraud → rejected. Shows the detection and conversion rate at each stage.

**Savings Tracker.** Cumulative savings chart from KINGA deployment date to present. Annotated with key milestones (e.g., "Tier 2 upgrade — fraud signal breakdown enabled").

**Risk Distribution Map.** Heatmap of claims by vehicle type and damage zone, showing which combinations carry the highest fraud risk and cost inflation.

**Top 10 Repairers by Deviation.** Table showing repairers ranked by average quote deviation from KINGA benchmark. Identifies systematic over-quoting patterns.

**Monthly Intelligence Summary.** Auto-generated paragraph summarising the month's key findings: top fraud signal, highest-saving claim, most active repairer, and portfolio risk trend.

---

## Part 6 — Forensic Intelligence Package (Tier 3 / On-Demand)

### 6.1 Purpose and Audience

The Forensic Intelligence Package is a standalone document generated for a specific claim when the insurer requires physics-backed evidence for a dispute, IPEC submission, or legal proceeding. It is not a standard report — it is a structured intelligence dataset that the insurer's designated reviewer validates and signs.

KINGA provides the computation. The insurer provides the human judgment and owns the validated conclusion.

### 6.2 Package Structure

**Cover Page.** Claim reference, vehicle details, incident date, package generation timestamp, KINGA version, and a prominent disclaimer: *"This package constitutes decision-support intelligence produced by KINGA AutoVerify AI. It does not constitute a legal determination. The validated determination on Page 6 represents the insurer's independent conclusion."*

**Section 1 — Incident & Data Integrity.** Input fidelity scores for all submitted documents (photos, police report, repair quote, witness statements). Data completeness percentage. Any missing inputs and their impact on confidence.

**Section 2 — Speed Inference Ensemble.** Full five-method breakdown as described in Section 3.5 above. Includes the mathematical basis for each method, the input values used, and the confidence weighting applied.

**Section 3 — Per-Component Physics Measurements.** Full table as described in Section 3.5 above. Includes the vision confidence score for each measurement and the cross-engine consistency check result.

**Section 4 — M5 Vision Dual-Path Cross-Validation.** Detailed dual-path panel showing Path A (Campbell) and Path B (energy balance) with all inputs, intermediate calculations, and the cross-validation agreement percentage.

**Section 5 — Fraud Signal Evidence Dossier.** Each triggered fraud signal presented as a standalone evidence card with: signal name, category, weight, severity, the specific data point that triggered it, and the supporting evidence (photo reference, document reference, or calculation reference).

**Section 6 — Validated Determination.** Reviewer acknowledgement, signature fields, and determination selection as described in Section 3.5 above.

---

## Part 7 — Assessor Tier Reports

### 7.1 Assessor Tier Architecture

KINGA offers three tiers for external assessors and loss adjusters. Each tier is designed around a different stage of the assessor's professional workflow.

| Tier | Monthly Fee | Per-Assessment Fee | Primary Value |
|---|---|---|---|
| Free | $0 | $0 | Basic damage detection and parts identification |
| Professional | $150/month | $8/assessment | Accurate repair cost benchmarking and quote validation |
| Forensic Partner | $400/month | $20/assessment | Physics-backed reconstruction and insurer referral network |

### 7.2 Free Tier — Damage Detection Report

**Audience:** Independent assessors, motor dealers, fleet managers doing basic condition checks.

**Content:**
- Vehicle identification (make, model, year, registration)
- Detected damage components with zone mapping
- Damage description per component (visual only)
- Repair type recommendation (repair vs replace)
- No cost benchmarking, no physics, no fraud scoring

**Design:** Simple, clean, single-page format. Black and white. No charts. Suitable for printing and attaching to a vehicle inspection record.

### 7.3 Professional Tier — Repair Cost Intelligence Report

**Audience:** Registered assessors and loss adjusters doing formal assessments for insurers.

**Content:**
- Everything in the Free tier
- Per-component repair cost benchmarks (based on KINGA's Zimbabwe parts and labour database)
- Quote deviation analysis: assessor's quote vs KINGA benchmark
- Labour rate validation (hours × rate vs benchmark)
- Parts sourcing intelligence: local availability, import lead time, USD vs ZiG pricing
- Repair vs replace cost-benefit analysis per component
- Final recommended settlement range

**Charts included:**
- Quote vs benchmark by component (bar chart)
- Comparable assessments distribution (histogram)
- Parts cost breakdown: local vs imported (doughnut chart)

### 7.4 Forensic Partner Tier — Physics-Backed Assessment Report

**Audience:** Senior assessors, expert witnesses, loss adjusters handling high-value or disputed claims.

**Content:**
- Everything in the Professional tier
- Full speed inference ensemble (all five methods)
- Per-component crush depth, deformation energy, and structural displacement measurements
- M5 Vision dual-path cross-validation
- Damage consistency verdict (physics-backed)
- Occupant injury risk assessment
- Insurer referral workflow: assessor submits the report to KINGA's insurer network for direct engagement

**Charts included:**
- Speed method comparison (bar chart)
- Deformation energy by component (bar chart)
- Crush depth by component (bar chart)
- FCDI contribution chart (if fraud signals present)

---

## Part 8 — Claim Intake Channels

### 8.1 Two Claim Sources

KINGA accepts claims through two distinct channels. Both channels feed the same pipeline. The source channel is recorded on every claim and is visible in the claims queue.

**Channel 1 — Claimant Portal.** The claimant submits their own claim directly through the KINGA claimant portal. They upload photos, enter incident details, and receive an immediate acknowledgement with a claim reference number. The insurer reviews the submitted claim in their operational dashboard.

**Channel 2 — Insurer Direct Intake.** The insurer's claims handler enters the claim directly into the KINGA platform, typically from a phone call, walk-in, or paper form. The handler uploads photos and enters incident details on behalf of the claimant.

### 8.2 Claimant Portal Design

The claimant portal is designed for non-technical users. It uses plain language throughout, with no insurance jargon. The submission flow has five steps:

1. **Vehicle details** — registration number, make, model, year
2. **Incident details** — date, time, location, description, third-party details
3. **Photo upload** — guided photo capture with prompts for required angles (front, rear, left side, right side, damage close-ups)
4. **Supporting documents** — police report, repair quote (optional at submission)
5. **Review and submit** — summary of all entered information with edit capability before final submission

**Design:** White background, large touch-friendly inputs, progress indicator, clear error messages. The KINGA brand is present but the insurer's branding is the primary visual element (white-label capable).

### 8.3 Insurer Direct Intake Design

The insurer intake form is designed for speed. A trained claims handler should be able to complete a full intake in under three minutes. It uses the same five-step flow as the claimant portal but with additional fields for handler notes, priority flags, and direct assignment to a processing queue.

---

## Part 9 — Implementation Sequence

The following sequence converts this design specification into a live commercial product without touching the KINGA pipeline engine.

| Week | Work | Risk |
|---|---|---|
| 1 | Add `tier` field to tenants schema · Build `TierGate` component · Apply to 14 panels in comparison view | Low |
| 2 | Build upgrade prompt flow with contextual value messaging · Wire to monetisation dashboard | Low |
| 3 | Implement role-aware claim detail landing view (processor vs manager vs executive) | Medium |
| 4 | Build on-demand Forensic Intelligence Package purchase flow ($100/claim) | Medium |
| 5–6 | Build assessor portal with three-tier access control and report generation | Medium |
| 7–8 | Build Executive Intelligence Dashboard as named Tier 2 feature | Low |
| 9–10 | Build savings tracker and portfolio analytics | Low |
| 11–12 | Build validated determination workflow and IPEC-ready package export | High |

---

## Part 10 — Appendix: Mock HTML Files

The following interactive HTML mock files accompany this document. Each file is self-contained and renders in any modern browser without external dependencies.

| File | Contents |
|---|---|
| `mock-layer-a-claims-report.html` | Insurer Claims Assessment Report — all four tier variants (Starter, Tier 1, Tier 2, Tier 3) with interactive tab switching |
| `mock-layer-b-dashboards.html` | Operational Dashboard (Tier 1 Claims Manager) and Executive Intelligence Dashboard (Tier 2+) with interactive tab switching |
| `mock-layer-c-forensic-assessor.html` | Forensic Intelligence Package (Tier 3) and all three Assessor tier reports (Free, Professional, Forensic Partner) |
| `mock-claim-intake.html` | Claimant Portal submission flow and Insurer Direct Intake form |

---

*KINGA AutoVerify AI · Platform Report & Dashboard Design Specification · April 2026*
*Confidential — For authorised recipients only*
