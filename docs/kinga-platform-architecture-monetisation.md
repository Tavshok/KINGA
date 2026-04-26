# KINGA AutoVerify AI — Platform Architecture & Monetisation Strategy

**Classification:** Internal Strategic Document  
**Version:** 1.0  
**Date:** April 2026  

---

## Executive Summary

KINGA AutoVerify AI is a multi-sided claims intelligence platform built on a single forensic physics engine. The engine runs a complete nine-stage pipeline on every claim — damage perception, document extraction, cost estimation, physics reconstruction, fraud scoring, and decision synthesis — regardless of which product tier the customer occupies. What changes between tiers is not the quality or depth of analysis, but the **decision authority** and **financial impact** that each tier confers on its user.

This document defines the commercial architecture of the platform: the three insurer tiers, the two assessor tiers, the fleet risk intelligence product, the pricing model, the upgrade mechanics, and the implementation roadmap. It is written for internal alignment and investor communication.

The central principle is this: KINGA does not sell computation. It sells **progressive certainty** — the right to act with increasing confidence and decreasing legal exposure at each successive tier. Tier 1 tells an insurer that something is wrong. Tier 2 tells them what is wrong and why, with evidence sufficient to reduce or challenge a payout. Tier 3 tells them that something is provably wrong, with documentation sufficient to reject a claim, win a dispute, or stand before a regulator.

---

## 1. The Engine Architecture: One Pipeline, Multiple Products

### 1.1 The Core Principle

Every claim processed through KINGA — regardless of the customer's tier, role, or product — runs the identical nine-stage pipeline. Stage 0 ingests and validates documents. Stage 1 classifies the incident. Stage 2 extracts vehicle and policy data. Stage 3 analyses damage images using computer vision. Stage 4 performs cost estimation and quote reconciliation. Stage 5 runs behavioural and document fraud analysis. Stage 6 performs per-component damage analysis with absolute numeric physics measurements. Stage 7 runs the forensic physics engine, including the five-method speed inference ensemble. Stage 8 synthesises all signals into a fraud score, decision recommendation, and confidence level. Stage 9 assembles the output into the Forensic Audit Report.

This architecture means that every customer, at every tier, is receiving the same quality of underlying analysis. The differentiation is entirely in what they are permitted to see, act on, and cite as authority for their decisions.

### 1.2 Why This Matters Commercially

The conventional SaaS approach to tiering removes features from lower tiers — a cheaper product genuinely does less. KINGA's architecture inverts this. Every tier gets the full analysis. What lower tiers are missing is not intelligence but **authority** — the right to act on that intelligence in specific ways, with specific legal and financial consequences.

This creates three commercially powerful dynamics. First, every customer at every tier is receiving maximum value from the engine, which means the cost of serving a Tier 1 customer is nearly identical to the cost of serving a Tier 3 customer. Margin improves with tier, not cost. Second, when a Tier 1 customer sees a locked panel that says "3 independent signals indicate inconsistency — upgrade to see which ones, required for rejection justification," they are experiencing genuine decision anxiety about a real claim, not a hypothetical feature. The upgrade motivation is immediate and concrete. Third, when an insurer upgrades, no historical data needs to be reprocessed. Every claim they have ever run through KINGA already contains the full analysis. The upgrade simply unlocks access to what was always there.

### 1.3 The Progressive Certainty Model

The three insurer tiers map directly to three levels of certainty and three corresponding levels of decision authority:

| Tier | What the insurer knows | What they can do | Risk ownership |
|---|---|---|---|
| **Process** (Tier 1) | "Something may be wrong with this claim" | Review manually, escalate to assessor | Human-owned |
| **Protect** (Tier 2) | "This is wrong, and here is why" | Challenge payout, trigger investigation, reduce settlement | Shared with KINGA logic |
| **Prove** (Tier 3) | "This is provably wrong, with documented evidence" | Reject claim, submit to regulator, defend in court | Transferred to KINGA as expert system |

This framing is the commercial heart of the platform. Insurers do not primarily pay for data. They pay for the authority to act — and for the protection that comes from acting on documented, defensible evidence rather than human judgment alone.

---

## 2. Insurer Tier Architecture

### 2.1 Tier 1 — KINGA Process

**Commercial positioning:** Operational efficiency. Faster decisions, consistent first-pass assessments, reduced dependency on external assessors for standard claims.

**Pricing:** $500/month platform access + $12/claim processed.

**Decision authority:** Assistive. KINGA provides a recommendation. The human claims processor retains full decision ownership. KINGA's output cannot be cited as the sole basis for a rejection or reduction.

**What the insurer sees on every claim:**

The claim detail view presents a single decision card at the top: recommended payout amount, a three-state recommendation (Approve / Review / Reject), and a one-sentence plain-English summary of the damage assessment. Below that, the fraud score is displayed as a single number on a colour band (green 0–39, amber 40–69, red 70–100) without any breakdown of the signals that drove it. The quote comparison shows the total submitted amount versus the KINGA estimated fair value, with a single delta figure. Damage photographs are visible. The approval workflow and history are fully functional.

The following are not visible at this tier: the fraud signal breakdown, the physics engine outputs, the per-component cost intelligence, the speed reconstruction, the impact vector diagram, the forensic audit report, the exception intelligence hub, the relationship intelligence network, and all portfolio-level analytics.

**The deliberate friction:** The fraud score is visible but opaque. A claims processor who sees a score of 74 and a locked panel reading "3 independent signals indicate inconsistency — upgrade to Protect to see which ones, required for rejection justification" is experiencing a real operational problem on a real claim. They cannot act on the score defensibly without the breakdown. This is not artificial friction — it is the genuine limit of what Tier 1 authorises them to do.

**What this tier replaces:** The human assessor on standard, low-complexity claims. A Tier 1 insurer can process the majority of their claim volume faster and more consistently than with a manual assessment process, at a cost well below the $25–$40 per-claim assessor fee.

---

### 2.2 Tier 2 — KINGA Protect

**Commercial positioning:** Cost control and fraud defensibility. The ability to challenge and reduce payouts with documented evidence, and to trigger investigations with specific, articulable reasons.

**Pricing:** $900/month platform access + $12/claim processed.

**Decision authority:** Defensible. KINGA's fraud signal breakdown and cost intelligence can be cited as the basis for a payout reduction or an investigation referral. The insurer can act on KINGA's evidence without commissioning a separate assessor report.

**What the insurer sees, in addition to Tier 1:**

The fraud score panel expands to show the three signal categories — image signals, physics signals, and cost signals — each with a sub-score and the specific flags that contributed to it. A fraud narrative is generated in plain English, suitable for use in a dispute letter or investigation referral: for example, "The submitted repair quote includes replacement of the front bumper assembly at $340. KINGA's cost intelligence estimates fair value at $180 based on current market rates for this vehicle make and model. The claimed damage pattern is consistent with a surface-level impact that would not require full assembly replacement." The quote comparison expands to show line-item analysis with fair-value estimates and flagged items with specific reasons. The repair versus write-off recommendation includes a brief reasoning statement. The damage consistency panel is visible, showing whether the damage pattern across multiple photographs is internally consistent. The vehicle damage visualisation is visible. The per-component damage table shows severity, location, and structural risk classification for each identified component.

Portfolio-level intelligence becomes available at this tier: the exception intelligence hub shows portfolio-level anomaly alerts (panel beaters with consistently elevated quotes, claimants with repeat submissions, geographic clusters of similar incidents). The panel beater performance analytics dashboard is accessible. The cost savings tracker accumulates the delta between submitted quotes and KINGA fair-value estimates across all claims processed.

The following remain gated: the full forensic audit report, the physics engine raw outputs (speed estimates, crush depth measurements, ensemble method results), the impact vector diagram, the relationship intelligence network, and the replay dashboard.

**The deliberate friction:** The insurer can see that the physics contradicts the claimed scenario — the fraud narrative will state "impact pattern is inconsistent with a low-speed parking incident" — but they cannot see the specific speed estimate, the crush depth measurement, or the ensemble confidence level. To cite the physics reconstruction as evidence in a formal dispute or litigation, they require Tier 3.

**What this tier replaces:** The quote validation function of the assessor, and the manual fraud investigation process. A Tier 2 insurer can negotiate with panel beaters using KINGA's line-item analysis, document fraud rejections with specific signal evidence, and identify systemic patterns across their book — all without commissioning individual assessor reports.

**Why this is the profit engine tier:** The value delivered at Tier 2 is directly measurable in dollar terms on every claim. If KINGA identifies $650 in quote overpricing on a $2,400 submission, the insurer can see that saving immediately. If KINGA flags a claim as high-risk and the investigation confirms fraud, the avoided payout is attributable. The cost savings tracker makes this cumulative value visible at the portfolio level. An insurer who can see that KINGA has saved them $34,200 in the current month on a $900 subscription is not a renewal risk.

---

### 2.3 Tier 3 — KINGA Prove

**Commercial positioning:** Litigation defensibility and dispute resolution. The ability to reject claims, win disputes, and stand before a regulator using KINGA's physics reconstruction as documented expert evidence.

**Pricing:** $1,500/month platform access + $12/claim processed. Alternatively, individual Forensic Reconstruction Reports are available on demand at $75–$150 per report to insurers on any tier.

**Decision authority:** Authoritative. KINGA's forensic reconstruction output is presented as an expert system determination. The insurer can reject a claim on the basis of KINGA evidence, submit a KINGA Forensic Audit Report to IPEC or a court, and cite the physics reconstruction as the documented basis for their decision.

**What the insurer sees, in addition to Tiers 1 and 2:**

The full Forensic Audit Report is accessible, containing all nine sections: incident classification, vehicle identification, damage analysis with per-component physics measurements, cost intelligence, fraud composite score with full signal breakdown, speed inference ensemble with all five methods and their individual estimates, physics reconstruction narrative, decision synthesis, and audit trail. The physics engine outputs are fully visible: the speed estimate from each of the five ensemble methods, the M5 dual-path display showing Path A (Campbell crush depth method) and Path B (energy balance method) side by side with their measured inputs and cross-validation result, and the per-component physics measurements including crush depth in centimetres, deformation energy in kilojoules, structural displacement in millimetres, and vision confidence score. The impact vector diagram is visible, showing the reconstructed direction and magnitude of the primary impact force. The relationship intelligence network is accessible, showing connections between claimants, assessors, and panel beaters across the portfolio. The governance dashboard is available for compliance reporting. The replay dashboard allows historical claims to be reprocessed through an updated pipeline version. Full API access is available for integration with core insurance management systems.

**The on-demand variant:** An insurer on Tier 1 or Tier 2 can purchase individual Forensic Reconstruction Reports at $75–$150 per claim without upgrading their subscription. This is the foot-in-the-door for the full Tier 3 upgrade. An insurer who purchases five on-demand reports in a month has already spent $375–$750 — the upgrade conversation to $1,500/month is straightforward.

**What this tier replaces:** External forensic engineers and accident reconstruction specialists. A Tier 3 insurer can produce a KINGA-signed reconstruction report that is defensible in a dispute without commissioning a separate expert. In the Zimbabwe context, where IPEC disputes and High Court proceedings involving motor claims are a recurring cost, the avoided expert witness fees alone justify the tier premium.

---

## 3. Assessor Tier Architecture

External assessors are not on the insurer pricing track. They are a separate customer type with a separate value proposition and a separate interface. The assessor channel is strategically important because it bypasses the insurer procurement cycle entirely: an assessor using KINGA to produce their reports does not require the insurer to be a KINGA customer. The insurer receives a standard assessor report — same format, same professional indemnity cover, same IPEC compliance — produced faster and more consistently than a manual assessment.

Assessors also have their own value ladder, and their tiers are defined by the depth of KINGA intelligence they can access and the type of output they can produce.

### 3.1 Assessor Tier 1 — KINGA Draft

**Commercial positioning:** AI-powered report preparation. The assessor uses KINGA to produce a pre-populated draft assessment in a fraction of the time required for a manual assessment.

**Pricing:** $5/claim processed.

**What the assessor sees:**

The assessor portal presents a focused workflow: upload damage photographs and claim documents, trigger the KINGA pipeline, and receive a structured draft report pre-populated with vehicle identification, damage summary in plain English, component condition list, recommended repair versus write-off determination, and estimated cost range. The assessor reviews the draft, adds their professional judgment and any site observations, and submits it to the insurer under their own name and professional indemnity cover.

The following are not visible at this tier: the fraud score, the physics engine outputs, the cost intelligence line-item analysis, and the portfolio analytics. The assessor is producing a damage assessment, not a fraud investigation. Their output is intentionally limited to prevent leakage of the premium intelligence that insurers pay for at Tier 2 and above.

**What this tier replaces:** Four to six hours of manual report preparation per claim. An assessor processing 20 claims per month at $5/claim spends $100 on KINGA and saves approximately 80–120 hours of preparation time. Their throughput increases from 20 to 60 claims per month without additional staff. The economics are self-evident.

---

### 3.2 Assessor Tier 2 — KINGA Assess Pro

**Commercial positioning:** Advanced assessment intelligence. The assessor can produce specialist reports on complex, high-value, or disputed claims, with access to cost intelligence and damage consistency analysis.

**Pricing:** $12/claim processed.

**What the assessor sees, in addition to Tier 1:**

The per-component damage table with severity, structural risk classification, and damage fraction estimates. The cost intelligence line-item analysis showing KINGA fair-value estimates per repair item — the assessor can use this to validate or challenge the panel beater's quote in their report. The damage consistency panel showing whether the damage pattern across multiple photographs is internally consistent. The vehicle damage visualisation. A "Specialist Assessment" report template that includes a cost reconciliation section and a damage consistency statement.

The following remain gated at this tier: the fraud score, the physics engine outputs, the speed reconstruction, and the forensic audit report. Assessors at this tier are producing enhanced damage assessments, not forensic reconstructions.

---

### 3.3 Assessor Tier 3 — KINGA Forensic Partner

**Commercial positioning:** Forensic reconstruction capability. The assessor can produce expert forensic reports on disputed claims, using KINGA's physics reconstruction as the technical basis.

**Pricing:** $25/claim processed, or a monthly subscription of $200/month for up to 20 forensic claims.

**What the assessor sees, in addition to Tiers 1 and 2:**

The full physics engine outputs: speed inference ensemble results, M5 dual-path display, per-component physics measurements. The impact vector diagram. The full forensic audit report as a reference document. A "Forensic Assessment" report template that incorporates the physics reconstruction narrative and is structured for use in dispute proceedings or litigation.

This tier positions the assessor as a forensic expert rather than a damage assessor. A KINGA Forensic Partner assessor can command a significantly higher fee per report — $150–$300 rather than the standard $25–$40 — because they are delivering a document with expert witness quality rather than a standard assessment.

---

## 4. Fleet Risk Intelligence Product

### 4.1 Strategic Positioning

The fleet product is not a sub-product of the insurer platform. It is an independent revenue stream that operates entirely outside the insurance procurement cycle. Fleet operators — transport companies, mining houses, government vehicle pools, logistics firms — have a fundamentally different set of problems from insurers, and KINGA's physics engine addresses those problems directly.

Fleet operators care about three things: whether their drivers are telling the truth about incidents, whether their panel beaters are charging fair prices, and whether their vehicles are being repaired to standard. KINGA's physics reconstruction answers the first question definitively. The cost intelligence engine answers the second. The damage assessment pipeline answers the third.

The fleet product is reframed as **KINGA Risk Intelligence** — a pre-claim and post-incident intelligence platform for fleet operators. The word "fraud" does not appear in the fleet interface. The output is framed as "incident consistency scoring," "driver behaviour analysis," and "authorised repair cost validation."

### 4.2 Fleet Tier 1 — KINGA Fleet Verify

**Pricing:** $2/vehicle/month (minimum 20 vehicles).

**What the fleet manager sees:**

When a driver submits an incident report, KINGA processes the photographs and documents and returns an incident consistency score: a percentage indicating how well the driver's narrative matches the physical evidence. A score above 85% is presented as "Consistent." A score between 60% and 85% is "Review Required." Below 60% is "Inconsistent — investigation recommended." The fleet manager sees the score, a one-sentence summary, and the recommended action. No physics details, no cost analysis.

### 4.3 Fleet Tier 2 — KINGA Fleet Intelligence

**Pricing:** $4/vehicle/month (minimum 20 vehicles).

**What the fleet manager sees, in addition to Tier 1:**

The incident consistency breakdown: which specific aspects of the driver's narrative are inconsistent with the physical evidence, in plain English. The authorised repair cost validation: the submitted repair quote compared to KINGA's fair-value estimate, with flagged items. Driver risk scoring: a cumulative consistency score per driver across all incidents, updated with each new claim. Fleet-level analytics: incident frequency by driver, vehicle, route, and time period. Panel beater performance: which repair shops consistently produce accurate quotes and which consistently inflate.

### 4.4 Fleet Tier 3 — KINGA Fleet Forensic

**Pricing:** $6/vehicle/month (minimum 20 vehicles), or on-demand forensic reports at $50/incident.

**What the fleet manager sees, in addition to Tiers 1 and 2:**

The full physics reconstruction for any incident: speed at impact, direction of force, crush depth, deformation energy. This is the output that matters when a driver claims a vehicle was stationary and the physics says it was travelling at 47 km/h. The forensic report at this tier is suitable for use in disciplinary proceedings, insurance disputes, or legal action against a driver.

---

## 5. Pricing Architecture Summary

### 5.1 Insurer Pricing

| Tier | Name | Platform Fee | Per-Claim Fee | Decision Authority |
|---|---|---|---|---|
| Tier 1 | KINGA Process | $500/month | $12/claim | Assistive — recommendation only |
| Tier 2 | KINGA Protect | $900/month | $12/claim | Defensible — evidence-backed action |
| Tier 3 | KINGA Prove | $1,500/month | $12/claim | Authoritative — expert system determination |
| On-demand | Forensic Report | — | $75–$150/report | Authoritative — available to any tier |

### 5.2 Assessor Pricing

| Tier | Name | Per-Claim Fee | Monthly Cap Option | Output Type |
|---|---|---|---|---|
| Tier 1 | KINGA Draft | $5/claim | — | AI-assisted damage assessment draft |
| Tier 2 | KINGA Assess Pro | $12/claim | — | Enhanced assessment with cost reconciliation |
| Tier 3 | KINGA Forensic Partner | $25/claim | $200/month (20 claims) | Forensic reconstruction report |

### 5.3 Fleet Pricing

| Tier | Name | Per-Vehicle Fee | Minimum Fleet | Output Type |
|---|---|---|---|---|
| Tier 1 | KINGA Fleet Verify | $2/vehicle/month | 20 vehicles | Incident consistency score |
| Tier 2 | KINGA Fleet Intelligence | $4/vehicle/month | 20 vehicles | Full driver risk and cost intelligence |
| Tier 3 | KINGA Fleet Forensic | $6/vehicle/month | 20 vehicles | Physics reconstruction per incident |

### 5.4 Revenue Model Illustration

Consider a mid-size Zimbabwean insurer processing 200 claims per month on Tier 2:

- Platform fee: $900/month
- Per-claim fees: 200 × $12 = $2,400/month
- Total monthly revenue from this customer: $3,300/month
- Annual contract value: $39,600

If that insurer upgrades to Tier 3 and adds 10 on-demand forensic reports per month:
- Platform fee: $1,500/month
- Per-claim fees: 200 × $12 = $2,400/month
- On-demand reports: 10 × $100 = $1,000/month
- Total monthly revenue: $4,900/month
- Annual contract value: $58,800

A fleet operator with 150 vehicles on Tier 2:
- Monthly fee: 150 × $4 = $600/month
- Annual contract value: $7,200

An assessor firm processing 60 claims per month on Tier 2:
- Monthly fee: 60 × $12 = $720/month
- Annual contract value: $8,640

---

## 6. Upgrade Mechanics and Conversion Design

### 6.1 The Locked Panel Strategy

Every panel that is gated at a lower tier is visible to the user as a locked panel, not an absent feature. The locked panel shows the panel title, a brief description of what it contains, and a specific, claim-relevant upgrade prompt. The prompt is not generic ("Upgrade to access this feature") — it is contextual and financially anchored.

For a Tier 1 insurer viewing a claim with a fraud score of 74:

> **Fraud Signal Intelligence** — *Locked*  
> 3 independent signals indicate inconsistency on this claim. Upgrade to KINGA Protect to see which signals drove this score. This breakdown is required to document a rejection or investigation referral under IPEC claims handling guidelines.  
> **[Upgrade to Protect — $900/month]**

For a Tier 2 insurer viewing a claim where the physics narrative says "impact pattern inconsistent with claimed scenario":

> **Forensic Physics Reconstruction** — *Locked*  
> The speed inference ensemble has produced a reconstruction of this incident. Upgrade to KINGA Prove to access the full reconstruction, including speed estimates from 5 independent methods, suitable for use in dispute proceedings.  
> **[Upgrade to Prove — $1,500/month]** or **[Purchase this report — $100]**

The on-demand purchase option on the Tier 2 locked panel is critical. It converts the upgrade friction into an immediate revenue event, and it creates the usage pattern that makes the subscription upgrade conversation easy.

### 6.2 The Savings Tracker as a Retention Mechanism

The cost savings tracker, visible from Tier 2 upwards, accumulates the delta between submitted quotes and KINGA fair-value estimates across all claims processed in the current period. It is displayed prominently on the portfolio dashboard and on the individual claim detail view. The tracker shows:

- Total submitted: $X
- KINGA fair value: $Y
- Savings identified: $Z
- Fraud risk avoided (estimated): $W

This is the single most important retention mechanism in the platform. An insurer who can see that KINGA has identified $34,200 in savings in the current month on a $900 subscription is not a renewal risk. They are a Tier 3 upgrade prospect.

### 6.3 The On-Demand Report as a Tier 3 Gateway

The on-demand Forensic Reconstruction Report at $75–$150 is available to insurers on any tier. It is not a downgrade of the Tier 3 product — it is the identical output, purchased for a single claim. An insurer who purchases five on-demand reports in a month has already spent $375–$750. The upgrade to Tier 3 at $1,500/month is presented as a straightforward financial decision: "You have purchased 5 forensic reports this month at a total cost of $500. Upgrading to KINGA Prove would give you unlimited forensic reports plus full portfolio intelligence for $1,500/month."

---

## 7. Action Rights Model

The action rights model ties each tier explicitly to the decisions the insurer is authorised to make using KINGA evidence. This is not a technical constraint — it is a commercial and legal positioning decision that protects both KINGA and the insurer.

| Decision | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Approve a claim on KINGA recommendation | Yes | Yes | Yes |
| Reduce a payout citing KINGA cost intelligence | No | Yes | Yes |
| Trigger a fraud investigation citing KINGA signals | No | Yes | Yes |
| Reject a claim citing KINGA fraud score | No | No | Yes |
| Submit KINGA evidence to IPEC | No | No | Yes |
| Use KINGA reconstruction in court proceedings | No | No | Yes |
| Auto-approve low-risk claims via API | No | No | Yes |

The action rights model creates a natural escalation path. A Tier 1 insurer who wants to reject a high-fraud-score claim cannot do so on KINGA evidence alone — they must escalate to a human assessor or upgrade their tier. A Tier 2 insurer who wants to use KINGA's physics reconstruction in a formal dispute must either purchase an on-demand report or upgrade to Tier 3. The action rights are not arbitrary restrictions — they reflect the genuine difference in the quality of evidence and the level of accountability that each tier confers.

---

## 8. Confidence as a Pricing Lever

KINGA computes a confidence level for every output: the fraud score confidence, the speed estimate confidence, the cost estimate confidence, and the overall decision confidence. These confidence levels are currently used internally by the pipeline. They are also a pricing lever.

At Tier 1, confidence is hidden. The insurer sees a recommendation but not how confident KINGA is in that recommendation. At Tier 2, confidence is summarised: "High confidence," "Medium confidence," or "Review recommended." At Tier 3, the full statistical backing is visible: the ensemble confidence score, the individual method confidence levels, the cross-validation agreement between M5 Path A and Path B, and the overall decision confidence percentage.

This is commercially important because it means that uncertainty is a product, not a limitation. A Tier 1 insurer who sees a recommendation but not the confidence level has a reason to upgrade — not because the recommendation is wrong, but because they cannot know how much to trust it. A Tier 3 insurer who can see that the speed reconstruction has a 94% confidence level and that all five ensemble methods agree within 8% has a qualitatively different basis for their decision than one who simply sees "47 km/h."

---

## 9. Portfolio Intelligence as a Strategic Moat

Portfolio intelligence — the ability to see patterns across a book of claims rather than within individual claims — is gated at Tier 2 and above. This is a deliberate strategic decision, not just a pricing decision.

An insurer who has been using KINGA for six months on Tier 2 has accumulated a portfolio of claims data that is unique to their book. KINGA's exception intelligence hub, relationship intelligence network, and panel beater performance analytics are all built on that accumulated data. The longer the insurer uses the platform, the more valuable their portfolio intelligence becomes — and the more difficult it becomes to switch to a competitor, because the competitor would start with no historical data.

This is the lock-in mechanism that most SaaS platforms attempt to build through integrations or data migration friction. KINGA builds it through the accumulation of claim intelligence that is specific to each insurer's book. A Tier 2 insurer who has been using KINGA for a year has a relationship intelligence network that shows them which panel beaters consistently inflate quotes, which claimants have submitted multiple claims, and which geographic areas have elevated fraud rates — all calibrated to their specific portfolio. That intelligence is not portable.

---

## 10. Implementation Roadmap

### Phase 1 — Tier Gating Infrastructure (Weeks 1–2)

Add a `tier` field to the tenant configuration table (values: `process`, `protect`, `prove`). Build a `TierGate` component that wraps any panel in the claim detail view and renders either the panel content or a locked upgrade prompt based on the tenant's tier. Apply the tier gate to all fourteen panels in the comparison view according to the tier map defined in Section 2. Deploy the locked panel upgrade prompts with contextual, claim-relevant messaging.

### Phase 2 — Upgrade Flow and On-Demand Reports (Weeks 3–4)

Build the upgrade prompt modal that shows the specific value the insurer is missing on the current claim, with a direct upgrade CTA and an on-demand purchase option. Implement the on-demand Forensic Reconstruction Report purchase flow for Tier 1 and Tier 2 insurers. Connect the monetisation dashboard to track which tenants are hitting tier gates most frequently — these are the warmest upgrade prospects.

### Phase 3 — Assessor Partner Portal (Weeks 5–6)

Build the assessor partner portal as a separate entry point with its own simplified workflow: upload → pipeline → draft report → review → submit. Implement the three assessor tiers with appropriate panel visibility. Build the "Generate Assessor Report" output that produces a document the assessor can review, annotate, and submit under their own name.

### Phase 4 — Fleet Risk Intelligence (Weeks 7–10)

Connect the fleet manager review dashboard to the KINGA physics reconstruction output. Build the incident consistency scoring display for fleet managers. Implement the driver risk scoring accumulator. Build the fleet-specific report template. Launch the fleet product as a separate entry point from the insurer portal.

### Phase 5 — Portfolio Intelligence and Savings Tracker (Weeks 11–14)

Build the cost savings tracker as a persistent, portfolio-level accumulator. Enhance the exception intelligence hub with the panel beater inflation alerts and claimant repeat-submission detection. Build the relationship intelligence network visualisation. Launch the Tier 2 portfolio intelligence features as a distinct value proposition in the upgrade flow.

---

## 11. Competitive Positioning

The tier architecture positions KINGA against three types of competitors in three different ways.

Against **manual assessors**, KINGA Process (Tier 1) competes on speed and cost. A $12/claim fee versus a $25–$40 assessor fee, with a four-minute turnaround versus a 24–48 hour turnaround, is a straightforward operational argument.

Against **basic AI damage tools** (Tractable, Bdeo), KINGA Protect (Tier 2) competes on depth. These tools provide damage detection and cost estimation. They do not provide fraud signal breakdowns, physics-based cost challenge evidence, or portfolio intelligence. The Tier 2 cost savings tracker makes this difference financially visible.

Against **forensic engineering firms**, KINGA Prove (Tier 3) competes on accessibility and cost. A forensic reconstruction report from a qualified engineer costs $500–$2,000 and takes weeks. A KINGA Forensic Audit Report costs $75–$150 and is available within minutes of claim submission. The quality of the physics reconstruction is comparable — KINGA uses the same Campbell crush energy method and impulse-momentum analysis that forensic engineers use — but the cost and turnaround are orders of magnitude better.

---

## 12. Risk Considerations

**Regulatory acceptance:** The action rights model at Tier 3 — specifically the right to reject a claim using KINGA evidence — requires that IPEC and the courts accept KINGA's Forensic Audit Report as admissible expert evidence. This is a regulatory engagement task, not a technical one. The physics methods used (Campbell, impulse-momentum, energy balance) are established forensic engineering methods. The case for admissibility is strong, but it requires proactive engagement with IPEC and, ideally, a test case that establishes the precedent.

**Assessor channel leakage:** If assessors at Tier 3 can access the full physics reconstruction, there is a risk that they produce forensic reports that effectively replicate the Tier 3 insurer product at a lower cost to the insurer. This is managed by ensuring that the assessor's forensic report is produced under their own professional indemnity and cannot be cited as KINGA evidence — it is the assessor's expert opinion, supported by KINGA's analysis, not a KINGA determination. The distinction matters legally and commercially.

**Pricing sensitivity in the Zimbabwe market:** The pricing model is calibrated for a market where insurers are processing significant claim volumes and have measurable fraud leakage. For smaller insurers processing fewer than 50 claims per month, the platform fee may represent a disproportionate cost. A volume-based pricing variant — lower platform fee, higher per-claim fee — should be available for smaller insurers entering the market.

---

*This document is confidential and intended for internal strategic alignment and investor communication. It does not constitute a binding commercial offer.*
