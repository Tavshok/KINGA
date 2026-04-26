# KINGA AutoVerify AI — Platform Architecture & Monetisation Strategy

**Version:** 2.0  
**Classification:** Internal Strategic Document  
**Date:** April 2026  
**Supersedes:** Version 1.0 (April 2026)

---

## Executive Summary

KINGA AutoVerify AI is a multi-sided claims intelligence platform built on a single forensic physics engine. The engine runs a complete nine-stage pipeline on every claim regardless of which product tier the customer occupies. What changes between tiers is not the quality or depth of analysis, but the **decision authority** the tier confers and the **financial impact** it enables.

This document defines the commercial architecture of the platform in its refined form, incorporating three critical structural improvements over the initial version. First, the Tier 3 legal exposure has been resolved through a risk transfer model that positions KINGA as a decision-support intelligence provider rather than an expert system, transferring full legal ownership of any determination to the insurer. Second, executive analytics has been elevated to a named, prominent feature tier rather than an unnamed component, reflecting its genuine commercial value as the output that justifies the platform fee at board level. Third, the pricing architecture has been extended with a Starter tier for smaller insurers, a refined fleet pricing model with incident caps, and a model governance framework that addresses the accuracy and drift concerns inherent in any AI-based forensic system.

The central commercial principle remains unchanged: KINGA does not sell computation. It sells **progressive certainty** — the right to act with increasing confidence and decreasing legal exposure at each successive tier. The refinement is in how that certainty is transferred to the customer, and in ensuring that KINGA never owns the legal consequence of a decision it supported.

---

## 1. The Engine Architecture: One Pipeline, Multiple Products

### 1.1 The Core Principle

Every claim processed through KINGA runs the identical nine-stage pipeline. Stage 0 ingests and validates documents. Stage 1 classifies the incident. Stage 2 extracts vehicle and policy data. Stage 3 analyses damage images using computer vision. Stage 4 performs cost estimation and quote reconciliation. Stage 5 runs behavioural and document fraud analysis. Stage 6 performs per-component damage analysis with absolute numeric physics measurements — crush depth in metres, deformation energy in Joules, structural displacement in metres, and vision confidence as a percentage. Stage 7 runs the forensic physics engine, including the five-method speed inference ensemble with M5 dual-path cross-validation. Stage 8 synthesises all signals into a fraud composite score, decision recommendation, and confidence level. Stage 9 assembles the output into the Forensic Intelligence Package.

The pipeline is engineered to never halt. Every stage has a defined fallback path. If Stage 7 produces a low-confidence result, Stage 8 weights the physics signal accordingly and flags the claim for human review rather than producing a corrupted fraud score. Stage-level circuit breakers ensure that a physics engine anomaly on a Tier 1 claim — where the customer never sees the physics output — does not propagate into a misleading decision recommendation.

### 1.2 The Risk Transfer Principle

Version 1.0 of this document described Tier 3 as an "expert system determination" that insurers could cite in IPEC disputes and court proceedings. This framing has been revised in its entirety.

KINGA does not produce legal determinations. It produces **Forensic Intelligence Packages** — structured datasets containing physics reconstructions, ensemble results, signal breakdowns, and confidence levels — which the insurer's designated reviewer validates, signs, and incorporates into their own determination. The insurer owns the conclusion. KINGA provides the computation. This distinction is not merely semantic: it is the structural protection that prevents KINGA from being called as an expert witness, cross-examined on its methodology, or held liable for a claim rejection that is subsequently overturned.

Every tier's terms of service make this explicit. At onboarding, and at the point of generating any Tier 3 output, the insurer acknowledges that KINGA's output constitutes decision-support intelligence, not a legal determination, and that the insurer retains full responsibility for any decision made on the basis of that intelligence. The action rights model in Section 7 is a description of what the platform enables, not a warranty of legal authority.

### 1.3 The Progressive Certainty Model

| Tier | What the insurer knows | What they can do | Risk ownership |
|---|---|---|---|
| **Starter** | "I have a consistent, fast first-pass on this claim" | Process and approve standard claims | Human-owned |
| **Process** (Tier 1) | "Something may be wrong with this claim" | Review manually, escalate | Human-owned |
| **Protect** (Tier 2) | "This is wrong, and here is why" | Challenge payout, trigger investigation, reduce settlement | Shared — insurer validates KINGA evidence |
| **Prove** (Tier 3) | "This is provably wrong, with documented evidence" | Reject claim, submit validated reconstruction to regulator | Insurer-owned — KINGA provides the intelligence, insurer signs the determination |

The key refinement in v2.0 is the explicit articulation of risk ownership at each tier. At Tier 3, the insurer does not cite KINGA as the authority. They cite their own validated determination, which was produced using KINGA's Forensic Intelligence Package. This is the same relationship that exists between a laboratory and a pathologist: the lab produces the analysis, the pathologist signs the report. KINGA is the laboratory.

---

## 2. Insurer Tier Architecture

### 2.1 Starter Tier — KINGA Entry

**Commercial positioning:** Accessible AI-assisted claims processing for smaller insurers. Full decision support on standard claims at a cost that scales with volume.

**Target customer:** Insurers processing fewer than 50 claims per month who cannot justify a fixed platform fee proportionate to their volume.

**Pricing:** $200/month platform access + $18/claim processed. No minimum claim volume.

**Decision authority:** Assistive. KINGA provides a recommendation. The human claims processor retains full decision ownership.

**What the insurer sees on every claim:** The decision card (recommended payout, three-state recommendation, one-sentence summary), the fraud score as a single number with colour band, the total quote delta, and damage photographs. The approval workflow is fully functional.

**What is gated:** All portfolio analytics, the savings tracker, the fraud signal breakdown, the exception intelligence hub, and all physics outputs. The locked panel for the fraud signal breakdown reads: "Upgrade to Process to see what is driving this score."

**Strategic purpose:** This tier exists to capture the long tail of the Zimbabwean insurance market and to seed the assessor channel. A small insurer on the Starter tier who sees consistent value will upgrade to Process within three to six months. More importantly, the assessors working for small insurers will encounter KINGA through the insurer's portal and become candidates for the assessor channel.

---

### 2.2 Tier 1 — KINGA Process

**Commercial positioning:** Operational efficiency for mid-size insurers. Faster decisions, consistent assessments, reduced assessor dependency on standard claims.

**Pricing:** $500/month platform access + $12/claim processed.

**Decision authority:** Assistive. KINGA's recommendation cannot be cited as the sole basis for a rejection or reduction.

**What the insurer sees:** The decision card, fraud score (number only, no breakdown), total quote delta, damage photographs, and the approval workflow. The fraud signal breakdown, physics outputs, per-component cost intelligence, forensic audit report, exception intelligence hub, relationship intelligence, and all portfolio analytics are gated.

**The deliberate friction:** A claims processor who sees a fraud score of 74 and a locked panel reading "3 independent signals indicate inconsistency — upgrade to Protect to see which ones, required for rejection justification" is experiencing genuine decision anxiety on a real claim. The upgrade motivation is immediate and financially anchored.

---

### 2.3 Tier 2 — KINGA Protect

**Commercial positioning:** Cost control and fraud defensibility. The ability to challenge and reduce payouts with documented evidence, and to trigger investigations with specific, articulable reasons.

**Pricing:** $900/month platform access + $12/claim processed.

**Decision authority:** Defensible. KINGA's fraud signal breakdown and cost intelligence can be cited as the basis for a payout reduction or investigation referral. The insurer acts on KINGA's evidence, validated by their own review.

**What the insurer sees, in addition to Tier 1:**

The fraud signal breakdown expands to show three signal categories — image signals, physics signals, and cost signals — each with a sub-score and specific flags. A fraud narrative is generated in plain English suitable for dispute letters. The quote comparison expands to show line-item analysis with fair-value estimates and flagged items. The repair versus write-off recommendation includes reasoning. The damage consistency panel and vehicle damage visualisation are visible. The per-component damage table shows severity, location, and structural risk classification.

**KINGA Executive Intelligence** becomes available at this tier. The executive dashboard — already built in the platform — is elevated to a named, prominent feature: a real-time portfolio view showing claims volume and processing velocity, fraud detection rate and estimated leakage prevented, cost savings identified versus settled amounts, portfolio risk distribution by vehicle type and geographic region, and operational efficiency metrics including average processing time and escalation rate. This is the output that justifies the platform fee in a board meeting. The executive user role lands on this dashboard by default.

Portfolio-level intelligence is also available: the exception intelligence hub, panel beater performance analytics, and the cost savings tracker accumulating the delta between submitted quotes and KINGA fair-value estimates across all claims.

**What remains gated:** The full Forensic Intelligence Package, physics engine raw outputs, speed reconstruction, impact vector diagram, relationship intelligence network, and replay dashboard.

**The deliberate friction:** The insurer can see that the physics contradicts the claimed scenario — the fraud narrative states "impact pattern is inconsistent with a low-speed parking incident" — but they cannot see the specific speed estimate, crush depth measurement, or ensemble confidence. To use that reconstruction in a formal dispute, they require Tier 3.

---

### 2.4 Tier 3 — KINGA Prove

**Commercial positioning:** Forensic intelligence for dispute resolution and regulatory engagement. The ability to produce a validated reconstruction that the insurer can stand behind in any forum.

**Pricing:** $1,500/month platform access + $12/claim processed. Individual Forensic Intelligence Packages are available on demand at $100–$150 per claim to insurers on any tier.

**Decision authority:** Insurer-validated authoritative. KINGA provides the full Forensic Intelligence Package. The insurer's designated reviewer — their internal assessor, legal team, or contracted forensic engineer — validates the reconstruction, signs the determination, and owns the conclusion. KINGA is the analytical instrument. The insurer is the expert.

**What the insurer sees, in addition to Tiers 1 and 2:**

The full Forensic Intelligence Package: all nine report sections including per-component physics measurements (crush depth in cm, deformation energy in kJ, structural displacement in mm, vision confidence percentage), the speed inference ensemble with all five methods and their individual estimates, the M5 dual-path display showing Path A (Campbell crush depth method) and Path B (energy balance method) with their measured inputs and cross-validation result, and the impact vector diagram. The relationship intelligence network showing connections between claimants, assessors, and panel beaters across the portfolio. The governance dashboard for compliance reporting. The replay dashboard for reprocessing historical claims through updated pipeline versions. Full API access for integration with core insurance management systems.

**The validation workflow:** When a Tier 3 insurer generates a Forensic Intelligence Package for a disputed claim, the platform presents a structured validation checklist. The insurer's designated reviewer confirms that they have reviewed the reconstruction methodology, that the inputs are consistent with the physical evidence available to them, and that they accept responsibility for the determination. The signed validation is timestamped and appended to the package. The document the insurer submits to IPEC or a court is their validated determination, not a KINGA report. KINGA's name appears as the analytical platform used, not as the author of the conclusion.

**The on-demand variant:** An insurer on any tier can purchase individual Forensic Intelligence Packages at $100–$150 per claim. An insurer who purchases five on-demand packages in a month has spent $500–$750. The upgrade to Tier 3 at $1,500/month is presented as a straightforward financial decision: "You have purchased 5 forensic packages this month at a total cost of $500. Upgrading to KINGA Prove gives you unlimited packages plus full portfolio intelligence for $1,500/month."

---

## 3. KINGA Executive Intelligence

Executive analytics is not a component of the claims detail view. It is a distinct, named product layer that sits above the claim-level interface and addresses a different audience with a different set of questions.

The claims processor asks: "What do I do with this claim?" The executive asks: "How is our claims portfolio performing, where is our money going, and what is our fraud exposure?" These are different questions that require different outputs, and they justify different levels of engagement with the platform.

**KINGA Executive Intelligence** is available from Tier 2 upwards and is the default landing view for users with the executive or risk manager role. It presents six panels:

The **Portfolio Performance Panel** shows claims volume processed in the current period, average processing time, escalation rate, and approval versus investigation versus rejection breakdown. This is the operational efficiency metric that replaces the manual claims register.

The **Financial Impact Panel** shows total submitted claim value, KINGA fair-value estimate, savings identified, and savings realised (the delta between submitted and settled amounts on closed claims). This is the number that justifies the platform fee. An insurer who can see that KINGA identified $34,200 in savings in the current month on a $900 subscription is not a renewal risk.

The **Fraud Intelligence Panel** shows fraud score distribution across the portfolio, high-risk claim count, estimated leakage prevented (based on fraud scores above the investigation threshold), and fraud signal category breakdown (image, physics, cost). This panel is the most important for the risk manager role.

The **Portfolio Risk Panel** shows risk distribution by vehicle make and model, geographic region, claim type, and time of year. This is the actuarial intelligence that feeds underwriting decisions. An insurer who can see that third-party claims in a specific region have a 40% higher fraud score than the portfolio average has actionable underwriting intelligence.

The **Relationship Intelligence Panel** (Tier 3 only) shows the network graph of claimants, assessors, and panel beaters, with connection strength indicating frequency of co-occurrence. Clusters in this graph are the most reliable indicator of organised fraud rings.

The **Operational Health Panel** shows pipeline performance metrics: average stage processing time, stage failure rate, confidence score distribution, and escalation triggers. This is the platform governance view that gives the insurer's IT team confidence in the system's reliability.

---

## 4. Assessor Tier Architecture

External assessors are a separate customer type with a separate value proposition and a separate interface. The assessor channel is strategically important because it bypasses the insurer procurement cycle: an assessor using KINGA to produce their reports does not require the insurer to be a KINGA customer. The insurer receives a standard assessor report produced faster and more consistently than a manual assessment.

Assessor outputs are technically and contractually isolated from insurer-tier intelligence. Assessor-tier reports carry a digital watermark that identifies them as assessor-produced documents. Assessors are contractually prohibited from sharing raw KINGA outputs with insurers; they may only incorporate conclusions into their own narrative reports. This prevents leakage of premium intelligence and preserves the value differential between assessor and insurer tiers.

### 4.1 Assessor Tier 1 — KINGA Draft

**Pricing:** $5/claim processed.

**What the assessor sees:** A pre-populated draft report containing vehicle identification, damage summary in plain English, component condition list, recommended repair versus write-off determination, and estimated cost range. The assessor reviews the draft, adds professional judgment and site observations, and submits under their own name and professional indemnity cover.

**What is gated:** Fraud score, physics outputs, cost intelligence line-item analysis, portfolio analytics.

---

### 4.2 Assessor Tier 2 — KINGA Assess Pro

**Pricing:** $12/claim processed.

**What the assessor sees, in addition to Tier 1:** The per-component damage table with severity, structural risk classification, and damage fraction estimates. The cost intelligence line-item analysis showing KINGA fair-value estimates per repair item. The damage consistency panel. The vehicle damage visualisation. A Specialist Assessment report template with a cost reconciliation section and a damage consistency statement.

**What is gated:** Fraud score, physics engine outputs, speed reconstruction, forensic audit report.

---

### 4.3 Assessor Tier 3 — KINGA Forensic Partner

**Pricing:** $25/claim processed, or $200/month for up to 20 forensic claims.

**What the assessor sees, in addition to Tiers 1 and 2:** The full physics engine outputs — speed inference ensemble results, M5 dual-path display, per-component physics measurements, impact vector diagram. A Forensic Assessment report template structured for use in dispute proceedings, incorporating the physics reconstruction narrative.

**The positioning:** A KINGA Forensic Partner assessor produces a document that is their expert opinion, supported by KINGA's physics analysis. They are the expert. KINGA is their analytical instrument. This is the same relationship that exists between a forensic engineer and the laboratory equipment they use. The assessor commands a higher fee per report ($150–$300 rather than the standard $25–$40) because they are delivering a document with expert witness quality.

**The referral model:** If a KINGA Forensic Partner assessor's report leads to an insurer adopting KINGA, the assessor receives a referral fee equivalent to one month's platform fee. This converts the assessor channel from a potential leakage risk into an active sales channel.

---

## 5. Fleet Risk Intelligence Product

### 5.1 Strategic Positioning

The fleet product is an independent revenue stream that operates outside the insurance procurement cycle. Fleet operators — transport companies, mining houses, government vehicle pools, logistics firms — have a fundamentally different set of problems from insurers. KINGA's physics engine addresses those problems directly: whether drivers are telling the truth about incidents, whether panel beaters are charging fair prices, and whether vehicles are being repaired to standard.

The fleet product is positioned as **KINGA Risk Intelligence** — a pre-claim and post-incident intelligence platform for fleet operators. The word "fraud" does not appear in the fleet interface. Outputs are framed as "incident consistency scoring," "driver behaviour analysis," and "authorised repair cost validation."

### 5.2 Fleet Tier 1 — KINGA Fleet Verify

**Pricing:** $2/vehicle/month (minimum 20 vehicles).

**Output:** Incident consistency score (Consistent / Review Required / Inconsistent) with a one-sentence summary and recommended action.

### 5.3 Fleet Tier 2 — KINGA Fleet Intelligence

**Pricing:** $4/vehicle/month (minimum 20 vehicles).

**Output, in addition to Tier 1:** Incident consistency breakdown in plain English. Authorised repair cost validation with line-item analysis. Driver risk scoring — a cumulative consistency score per driver across all incidents. Fleet-level analytics by driver, vehicle, route, and time period. Panel beater performance analytics.

### 5.4 Fleet Tier 3 — KINGA Fleet Forensic

**Pricing:** $8/vehicle/month (minimum 20 vehicles), or $50/incident on demand. An incident cap applies: the monthly fee covers up to 2 incidents per vehicle per month; additional incidents are charged at $40 each.

**Rationale for revised pricing:** Fleet operators, particularly in mining and logistics, have operational budgets rather than regulated procurement cycles. Their willingness to pay for forensic reconstruction capability is higher than the original $6/vehicle/month reflected. The incident cap model aligns cost with actual usage while preserving the subscription relationship.

**Output, in addition to Tiers 1 and 2:** Full physics reconstruction per incident — speed at impact, direction of force, crush depth, deformation energy. The fleet manager's validated determination, signed by their designated reviewer, is suitable for use in disciplinary proceedings, insurance disputes, or legal action. The same risk transfer principle applies: the fleet operator owns the conclusion, KINGA provides the computation.

---

## 6. Pricing Architecture Summary

### 6.1 Insurer Pricing

| Tier | Name | Platform Fee | Per-Claim Fee | Decision Authority |
|---|---|---|---|---|
| Starter | KINGA Entry | $200/month | $18/claim | Assistive |
| Tier 1 | KINGA Process | $500/month | $12/claim | Assistive |
| Tier 2 | KINGA Protect | $900/month | $12/claim | Defensible — insurer validates |
| Tier 3 | KINGA Prove | $1,500/month | $12/claim | Insurer-validated authoritative |
| On-demand | Forensic Package | — | $100–$150/package | Available to any tier |

### 6.2 Assessor Pricing

| Tier | Name | Per-Claim Fee | Monthly Cap | Output Type |
|---|---|---|---|---|
| Tier 1 | KINGA Draft | $5/claim | — | AI-assisted draft assessment |
| Tier 2 | KINGA Assess Pro | $12/claim | — | Enhanced assessment with cost reconciliation |
| Tier 3 | KINGA Forensic Partner | $25/claim | $200/month (20 claims) | Forensic reconstruction report |

### 6.3 Fleet Pricing

| Tier | Name | Per-Vehicle Fee | Minimum Fleet | Incident Cap |
|---|---|---|---|---|
| Tier 1 | KINGA Fleet Verify | $2/vehicle/month | 20 vehicles | None |
| Tier 2 | KINGA Fleet Intelligence | $4/vehicle/month | 20 vehicles | None |
| Tier 3 | KINGA Fleet Forensic | $8/vehicle/month | 20 vehicles | 2 incidents/vehicle/month; $40/additional |

### 6.4 Revenue Model Illustration

A mid-size Zimbabwean insurer processing 200 claims per month on Tier 2:

- Platform fee: $900/month
- Per-claim fees: 200 × $12 = $2,400/month
- **Total monthly revenue: $3,300 | Annual contract value: $39,600**

The same insurer upgrading to Tier 3 and purchasing 10 on-demand forensic packages per month:

- Platform fee: $1,500/month
- Per-claim fees: 200 × $12 = $2,400/month
- On-demand packages: 10 × $125 = $1,250/month
- **Total monthly revenue: $5,150 | Annual contract value: $61,800**

A fleet operator with 150 vehicles on Tier 2:

- Monthly fee: 150 × $4 = $600/month
- **Annual contract value: $7,200**

An assessor firm processing 60 claims per month on Tier 2:

- Monthly fee: 60 × $12 = $720/month
- **Annual contract value: $8,640**

---

## 7. Action Rights Model

The action rights model describes what each tier enables the insurer to do using KINGA's intelligence. It is a commercial positioning framework, not a legal warranty. The terms of service at every tier make explicit that action rights describe feature availability and do not constitute legal advice or authorisation. Every insurer acknowledges at onboarding that KINGA's output supports but does not replace their own legal judgment, and that the insurer retains full responsibility for any decision made on the basis of KINGA intelligence.

| Decision | Starter | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|
| Approve a claim on KINGA recommendation | Yes | Yes | Yes | Yes |
| Reduce a payout citing KINGA cost intelligence | No | No | Yes | Yes |
| Trigger a fraud investigation citing KINGA signals | No | No | Yes | Yes |
| Reject a claim citing validated KINGA reconstruction | No | No | No | Yes — insurer-validated |
| Submit validated determination to IPEC | No | No | No | Yes — insurer owns determination |
| Use validated reconstruction in proceedings | No | No | No | Yes — insurer is the expert |
| Auto-approve low-risk claims via API | No | No | No | Yes |

---

## 8. Confidence as a Pricing Lever

KINGA computes a confidence level for every output: the fraud score confidence, the speed estimate confidence, the cost estimate confidence, and the overall decision confidence. These are surfaced differently at each tier.

At the Starter and Tier 1 levels, confidence is hidden. The insurer sees a recommendation but not the confidence level behind it. At Tier 2, confidence is summarised as High, Medium, or Review Recommended. At Tier 3, the full statistical backing is visible: the ensemble confidence score, individual method confidence levels, the M5 cross-validation agreement percentage, and the overall decision confidence.

This creates a genuine pricing lever because uncertainty is a product. A Tier 1 insurer who sees a recommendation but not the confidence level has a concrete reason to upgrade — not because the recommendation is wrong, but because they cannot know how much weight to place on it. A Tier 3 insurer who can see that the speed reconstruction carries 94% confidence and that all five ensemble methods agree within 8% has a qualitatively different basis for their validated determination.

---

## 9. Model Governance Framework

The Forensic Intelligence Package is only as valuable as the accuracy of the models that produce it. KINGA's model governance framework addresses three requirements: accuracy validation, drift detection, and transparency.

**Accuracy validation** is conducted on a rolling basis using closed claims as ground truth. For speed reconstruction, the ensemble estimate is compared against police reconstruction reports and court-accepted speed evidence on closed disputed claims. For cost estimation, the KINGA fair-value estimate is compared against the final settled amount on closed claims. For fraud scoring, the precision and recall of the fraud score against confirmed fraud outcomes are tracked. These metrics are published internally on a monthly basis and made available to Tier 3 customers on request.

**Drift detection** monitors the distribution of pipeline outputs over time. If the mean fraud score for a given claim type shifts by more than one standard deviation over a 90-day period without a corresponding shift in confirmed fraud outcomes, the pipeline is flagged for review. New vehicle models — particularly electric vehicles with different crash energy profiles — are added to the vehicle database as they enter the Zimbabwean market, with physics parameters validated against manufacturer crash test data where available.

**Transparency** at Tier 3 means that the insurer's designated reviewer can see not just the output of each pipeline stage but the inputs that drove it: the specific image regions that triggered a damage signal, the exact crush depth measurements that fed the Campbell formula, the document fields that contributed to the behavioural fraud score. This transparency is what makes the insurer's validated determination defensible — they can explain every number in the reconstruction because KINGA shows them every number.

---

## 10. Upgrade Mechanics and Conversion Design

### 10.1 The Locked Panel Strategy

Every gated panel is visible as a locked panel, not an absent feature. The locked panel shows the panel title, a brief description of what it contains, and a specific, claim-relevant upgrade prompt. Prompts are contextual and financially anchored.

For a Tier 1 insurer viewing a claim with a fraud score of 74:

> **Fraud Signal Intelligence** — *Locked*  
> 3 independent signals indicate inconsistency on this claim. Upgrade to KINGA Protect to see which signals drove this score — required to document a rejection or investigation referral.  
> **[Upgrade to Protect — $900/month]**

For a Tier 2 insurer viewing a claim where the physics narrative states "impact pattern inconsistent with claimed scenario":

> **Forensic Physics Reconstruction** — *Locked*  
> The speed inference ensemble has produced a reconstruction of this incident. Upgrade to KINGA Prove to access the full package, including speed estimates from 5 independent methods, suitable for your validated determination.  
> **[Upgrade to Prove — $1,500/month]** &nbsp; **[Purchase this package — $125]**

### 10.2 The Savings Tracker as a Retention Mechanism

The cost savings tracker, visible from Tier 2 upwards, accumulates the delta between submitted quotes and KINGA fair-value estimates across all claims in the current period. It is displayed prominently on the Executive Intelligence dashboard and on the individual claim detail view. An insurer who can see that KINGA has identified $34,200 in savings in the current month on a $900 subscription is not a renewal risk. They are a Tier 3 upgrade prospect.

### 10.3 The Pilot Protocol

The standard sales entry point is a 30-day pilot: 50 claims, flat fee of $500. At the end of the pilot, the savings tracker shows concrete, attributable value. The pilot is structured to run on Tier 2 so that the insurer experiences the fraud signal breakdown and cost intelligence — the features that drive the most immediate financial impact — rather than the basic decision card. A pilot that runs on Tier 1 shows operational efficiency but not financial impact; a pilot that runs on Tier 2 shows both.

---

## 11. Portfolio Intelligence as a Strategic Moat

Portfolio intelligence — the ability to see patterns across a book of claims rather than within individual claims — is gated at Tier 2 and above. An insurer who has been using KINGA for six months has accumulated a portfolio of claims data that is unique to their book. The exception intelligence hub, relationship intelligence network, and panel beater performance analytics are all built on that accumulated data. The longer the insurer uses the platform, the more valuable their portfolio intelligence becomes — and the more difficult it becomes to switch to a competitor, because the competitor would start with no historical data.

This is the compounding switching cost that most SaaS platforms attempt to build through integrations or data migration friction. KINGA builds it through the accumulation of claim intelligence specific to each insurer's book. A Tier 2 insurer who has been using KINGA for a year has a relationship intelligence network calibrated to their specific portfolio. That intelligence is not portable.

---

## 12. Jurisdiction Portability

The platform is designed to be jurisdiction-agnostic at the engine level. The physics methods (Campbell, impulse-momentum, energy balance) are internationally established forensic engineering methods used in courts across multiple jurisdictions. The fraud signal framework is configurable by market: the specific signals, their weights, and the score thresholds can be calibrated to a new market's claims patterns without changing the underlying engine.

The regulatory engagement strategy recognises that Zimbabwe is the launch market but not the only market. South Africa represents the most immediate expansion opportunity: its legal framework for electronic evidence is more developed, its insurance market is significantly larger, and its FSCA regulatory environment has established precedents for technology-assisted claims processing. Kenya and Nigeria represent medium-term opportunities as their insurance regulatory frameworks modernise.

For each new jurisdiction, the platform requires three adaptations: calibration of the cost intelligence database to local parts and labour pricing, calibration of the fraud score thresholds to local claims patterns, and engagement with the local regulator to establish the status of KINGA's Forensic Intelligence Package as admissible supporting evidence. None of these adaptations require changes to the core engine.

---

## 13. Competitive Positioning

Against **manual assessors**, KINGA Entry and Process compete on speed and cost. A $12–$18/claim fee versus a $25–$40 assessor fee, with a four-minute turnaround versus a 24–48 hour turnaround, is a straightforward operational argument.

Against **basic AI damage tools** (Tractable, Bdeo, Curacel), KINGA Protect competes on depth. These tools provide damage detection and cost estimation. They do not provide fraud signal breakdowns, physics-based cost challenge evidence, or portfolio intelligence. The Tier 2 savings tracker makes this difference financially visible.

Against **forensic engineering firms**, KINGA Prove competes on accessibility and cost — but with a precisely defined scope. KINGA's Forensic Intelligence Package is not a replacement for a forensic engineer in catastrophic injury cases, complex multi-vehicle dynamics, or cases requiring physical scene examination. It is a replacement for the forensic engineer in standard disputed claims where the dispute centres on damage consistency and impact speed — which represents the substantial majority of disputed motor claims. Narrowing this claim makes it more defensible and more believable to the insurers who need to act on it.

---

## 14. Risk Considerations and Mitigations

**Regulatory acceptance of AI-assisted evidence.** The hybrid validation model at Tier 3 — where the insurer's designated reviewer signs the determination — is the primary mitigation. KINGA engages with IPEC proactively to establish that a validated determination supported by a Forensic Intelligence Package is admissible, not that an AI output is admissible. This is a materially easier regulatory argument. A test case with a willing insurer partner, on a claim where the physics reconstruction is unambiguous, should be the first regulatory engagement priority.

**Legal exposure on action rights.** The terms of service at every tier explicitly state that action rights describe feature availability and do not constitute legal advice or authorisation. Every insurer acknowledges at onboarding that KINGA's output supports but does not replace their own legal judgment. This language is reviewed by legal counsel before any commercial launch.

**Assessor channel leakage.** Technical watermarking of assessor-tier outputs, contractual restrictions on sharing raw KINGA outputs, and the referral model that converts assessors into sales advocates collectively address this risk. The watermarking is implemented at the document generation layer: every assessor-tier report carries a machine-readable identifier that distinguishes it from an insurer-tier Forensic Intelligence Package.

**Pipeline reliability and model drift.** Stage-level circuit breakers prevent physics engine anomalies from propagating into fraud scores on claims where the customer never sees the physics output. The model governance framework in Section 9 addresses drift through rolling accuracy validation and distribution monitoring.

**Market concentration.** The jurisdiction portability architecture in Section 12 addresses this structurally. South Africa regulatory engagement begins within 12 months of Zimbabwe commercial launch.

---

## 15. Implementation Roadmap

### Phase 1 — Tier Gating Infrastructure (Weeks 1–6)

Add the `tier` field to the tenant configuration (Starter / Process / Protect / Prove). Build the `TierGate` component wrapping all gated panels in the comparison view. Deploy locked panel upgrade prompts with contextual messaging. Implement the on-demand Forensic Intelligence Package purchase flow. Connect the monetisation dashboard to track tier gate interactions — these are the warmest upgrade signals.

### Phase 2 — Executive Intelligence and Savings Tracker (Weeks 4–8)

Elevate the executive analytics dashboard to a named, prominent feature with its own navigation entry point. Implement the cost savings tracker as a persistent, portfolio-level accumulator. Build the six executive intelligence panels as described in Section 3. Wire the executive user role to land on the Executive Intelligence dashboard by default.

### Phase 3 — Tier 3 Validation Workflow (Weeks 6–10)

Build the structured validation checklist for Tier 3 Forensic Intelligence Package generation. Implement the digital signature and timestamp workflow. Update the report generation layer to produce an insurer-validated determination document rather than a KINGA report. Draft and finalise the terms of service language for all tiers with legal counsel review.

### Phase 4 — Assessor Partner Portal (Weeks 8–12)

Build the assessor partner portal as a separate entry point with its own simplified workflow. Implement the three assessor tiers with appropriate panel visibility. Build the watermarking layer for assessor-tier outputs. Implement the referral tracking mechanism.

### Phase 5 — Fleet Risk Intelligence (Weeks 12–18)

Connect the fleet manager review dashboard to the KINGA physics reconstruction output. Build the incident consistency scoring display. Implement the driver risk scoring accumulator. Build the fleet-specific report template. Launch the fleet product as a separate entry point. This phase is deliberately deferred until insurer Tier 2–3 has demonstrated product-market fit, avoiding premature resource diversion to a separate ICP.

---

*This document is confidential and intended for internal strategic alignment and investor communication. It does not constitute a binding commercial offer. Version 2.0 supersedes Version 1.0 in its entirety.*
