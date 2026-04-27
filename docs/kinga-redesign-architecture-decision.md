# KINGA AutoVerify AI — Platform Redesign: Architecture Decision Document

**Version:** 1.0 | **Date:** April 2026 | **Classification:** Internal Planning Document  
**Status:** Pre-implementation — for review and approval before any code changes

---

## 1. Purpose of This Document

This document defines the proposed architectural changes to the KINGA platform, establishes the three-layer output model, maps every existing page to the new structure, and specifies precisely what changes versus what remains untouched. No production code is modified until this document is reviewed and approved.

The core problem this redesign solves is stated plainly: the current platform exposes the same intelligence to every user regardless of their tier, which collapses the commercial boundary between tiers and creates a perception problem at the Starter level where users feel they are inside a powerful system but locked out of it. The redesign separates the platform into three distinct layers — operational, intelligence, and forensic — each of which feels complete and purposeful on its own terms.

---

## 2. The Three-Layer Output Model

Every claim processed through KINGA generates data across all three layers simultaneously. The pipeline always runs in full. What changes between tiers is not what is computed — it is what each user type is permitted to see and act on.

### Layer A — Operational Claims Report

**Purpose:** Replace the traditional assessor report. Process claims efficiently.  
**Available to:** All insurer tiers (Starter through Tier 3). All assessor tiers.  
**Produced:** Automatically when the pipeline completes.  
**Travels outside the platform:** Yes — to claimants, panel beaters, regulators.  
**Language:** Plain English. No fraud scores, no physics outputs, no signal breakdowns.

The Operational Claims Report answers one question: *what should I do with this claim?* It is printable, court-neutral, and readable by a non-technical claims officer in under 60 seconds. Its complexity increases with tier — a Starter report is simpler than a Tier 2 report — but the format and language remain consistent across all tiers.

### Layer B — Intelligence Dashboard

**Purpose:** Show the insurer where money is being lost, where fraud is concentrated, and how efficiently the operation is running.  
**Available to:** Tier 2 (Protect) and Tier 3 (Prove) insurers only.  
**Produced:** Continuously, from aggregated claim data.  
**Travels outside the platform:** No — internal management tool only.  
**Language:** Financial and operational metrics. No physics outputs.

The Intelligence Dashboard answers three board-level questions: Are we losing money? Where is fraud happening? Are we operating efficiently? It is the primary justification for the platform fee at Tier 2 and above.

### Layer C — Forensic Intelligence Package

**Purpose:** Provide physics-based reconstruction evidence for disputed claims, litigation support, and IPEC submissions.  
**Available to:** Tier 3 (Prove) insurers (subscription). Tier 2 insurers (on-demand, $100/claim). Assessor Forensic Partner tier.  
**Produced:** On demand only — never automatically.  
**Travels outside the platform:** Only after insurer validation and sign-off. The insurer owns the conclusion.  
**Language:** Technical — physics measurements, ensemble results, signal breakdowns, confidence scores.

The Forensic Intelligence Package answers one question: *why is this decision defensible?* It is the working that sits behind the Operational Claims Report's conclusions. KINGA provides the computation. The insurer provides the human judgment and owns the determination.

---

## 3. Insurer Tier Architecture

### Tier Structure

| | **Starter** | **Tier 1 — Process** | **Tier 2 — Protect** | **Tier 3 — Prove** |
|---|---|---|---|---|
| Platform fee | $200/month | $500/month | $900/month | $1,500/month |
| Per-claim fee | $18/claim | $12/claim | $12/claim | $12/claim |
| Target volume | <50 claims/month | 50–200 claims/month | 100–500 claims/month | 200+ claims/month |
| Decision power | Process efficiency | Operational control | Financial control | Legal defensibility |
| Layer A | ✓ Simple | ✓ Standard | ✓ Enhanced | ✓ Full |
| Layer B | — | — | ✓ Full | ✓ Full + Portfolio |
| Layer C | — | — | On-demand $100 | Subscription included |

### What Each Tier Feels Like to the User

**Starter** must feel like: *"We replaced Excel and paper claims forms."* The user sees a clean claims workflow — intake, processing, decision, report. There are no locked panels, no hints of intelligence they cannot access, no fraud score teasing. The Starter portal is a digitised claims workflow system. It does not feel like a gated version of something more powerful. It feels complete for what it is.

**Tier 1 — Process** adds the fraud risk colour band (Green / Amber / Red), the repair vs write-off recommendation, and the full quote comparison. The user feels they have a capable AI-assisted claims tool. The portal is still operational — it does not show financial analytics or portfolio intelligence.

**Tier 2 — Protect** is where KINGA becomes commercially transformative. The Executive Intelligence Dashboard appears. The insurer can now see portfolio-level financial leakage, fraud hotspots, and operational efficiency metrics. The Operational Claims Report gains line-item cost intelligence and the full fraud signal breakdown. This is the tier where the insurer's CFO and CEO see the value story.

**Tier 3 — Prove** adds the Forensic Intelligence Package on every claim, the physics reconstruction, the speed ensemble, and the insurer validation workflow. This is the tier for insurers who need to defend decisions to IPEC, in dispute proceedings, or in litigation.

### Insurer Sub-Roles (unchanged from current implementation)

The five insurer sub-roles — Executive, Claims Manager, Claims Processor, Internal Assessor, Risk Manager — remain exactly as currently implemented. The tier gate is applied at the tenant level, not the sub-role level. All five sub-roles within a Tier 1 tenant see Tier 1 content. All five within a Tier 2 tenant see Tier 2 content.

---

## 4. Assessor Tier Architecture

Assessors are a separate customer type with a separate portal, separate pricing, and a separate value proposition. The assessor portal is positioned as *"AI-powered assessment intelligence"* — a tool that makes assessors faster, more accurate, and more defensible, not a tool that replaces them.

### Tier Structure

| | **Free** | **Professional** | **Forensic Partner** |
|---|---|---|---|
| Per-claim fee | $0 (up to 5 claims/month) | $12/claim | $25/claim or $200/month cap (20 claims) |
| Target user | Individual assessors exploring the platform | Active assessors processing regular volume | Specialist forensic assessors |
| Report output | AI-generated draft assessment | Enhanced assessment with cost intelligence | Full forensic assessment with physics |
| Value proposition | *"See what AI assessment looks like"* | *"Faster, more accurate, more defensible"* | *"Physics-backed reconstruction in every report"* |

### What Each Assessor Tier Produces

**Free tier** gives the assessor a draft assessment report — vehicle identification, damage summary, component condition list, recommended repair vs write-off, and an estimated cost range. The report is watermarked as a draft and carries a disclaimer that it has not been validated by a professional assessor. The free tier is the acquisition channel. It creates familiarity with the platform and demonstrates value before any payment is required.

**Professional tier** adds per-component damage analysis (severity, structural risk, damage fraction), line-item cost analysis with KINGA fair-value estimates, a damage consistency panel, and a vehicle damage visualisation. The report is a complete professional assessment document, watermarked as assessor-produced, suitable for submission to insurers.

**Forensic Partner tier** adds the full physics engine outputs — per-component crush depth, deformation energy, structural displacement, speed inference ensemble, M5 dual-path display, and impact vector diagram. The report includes a forensic assessment section structured for dispute proceedings. The assessor signs the report under their own name and professional indemnity. KINGA is cited as the analytical instrument. The assessor is the expert.

### Assessor Referral Model

Forensic Partner assessors who introduce an insurer customer to KINGA receive a referral fee equivalent to one month's insurer platform fee. This creates a natural sales channel through the assessor network.

---

## 5. The Two Report Types — Precise Definitions

### Report Type 1: Operational Claims Report (Layer A)

This is the document that replaces the traditional assessor report. It is produced automatically when the pipeline completes and is included in the per-claim fee at every tier. It may be sent to claimants, panel beaters, and regulators. It is sanitised — no fraud score numbers, no physics outputs, no signal breakdowns.

**Content by tier:**

| Section | Starter | Tier 1 | Tier 2 | Tier 3 |
|---|:---:|:---:|:---:|:---:|
| Claim identity (ID, date, vehicle, policy) | ✓ | ✓ | ✓ | ✓ |
| Damage summary (plain English, no physics) | ✓ | ✓ | ✓ | ✓ |
| Recommended payout | ✓ | ✓ | ✓ | ✓ |
| Decision recommendation (Approve / Review / Reject) | ✓ | ✓ | ✓ | ✓ |
| Primary reason — one sentence | ✓ | ✓ | ✓ | ✓ |
| Evidence snapshot (key photos) | ✓ | ✓ | ✓ | ✓ |
| Fraud risk colour band (Green / Amber / Red) | — | ✓ | ✓ | ✓ |
| Repair vs write-off recommendation with reasoning | — | ✓ | ✓ | ✓ |
| Quote verdict (Overpriced / Fair / Underpriced, % delta) | — | ✓ | ✓ | ✓ |
| Line-item cost analysis (per component) | — | — | ✓ | ✓ |
| Flagged overpriced line items | — | — | ✓ | ✓ |
| Fraud signal summary (plain English, no score) | — | — | ✓ | ✓ |
| Data quality indicator | ✓ | ✓ | ✓ | ✓ |

### Report Type 2: Forensic Intelligence Package (Layer C)

This is the evidence document. It is produced on demand only, never automatically. It never travels to claimants or panel beaters. At Tier 3, the insurer's designated reviewer validates and signs before export.

**Section access by tier:**

| Section | Content | Tier 2 (on-demand) | Tier 3 (subscription) | Assessor Forensic |
|---|---|:---:|:---:|:---:|
| Section 0 | Executive Authority Cover | ✓ | ✓ | — |
| Section 1 | Incident & Data Integrity | ✓ | ✓ | ✓ |
| Section 3 | Financial Validation (line-item) | ✓ | ✓ | ✓ |
| Section 4 | Evidence Inventory | ✓ | ✓ | ✓ |
| Section 5 | Full Fraud Assessment (FCDI, all signals) | ✓ | ✓ | — |
| Section 6 | Decision Authority & Audit Trail | ✓ | ✓ | — |
| Section 2 | Technical Forensics (physics, ensemble, M5) | — | ✓ | ✓ |
| Section 7 | ML Insights & Data Lineage | — | ✓ | — |

---

## 6. Claim Sources — Two Intake Channels

The platform currently supports two distinct claim intake channels. These must be visually and functionally distinct in the insurer portal so the claims processor can immediately see which channel a claim came from and what data is available.

### Channel 1: Insurer-Initiated Claims

The insurer's claims processor submits the claim directly into the platform. They upload the claim form, damage photographs, and the panel beater quote. The pipeline runs automatically. This is the primary channel for established insurers with existing claims workflows.

**Current implementation:** `ClaimsProcessorDashboard` → `SubmitClaim` → pipeline trigger.  
**Proposed change:** Add a visible "Insurer Submitted" badge on all claims from this channel in the triage queue.

### Channel 2: Claimant Portal Claims

The claimant submits the claim directly through the claimant portal at `/claimant/submit-claim`. They upload their own photographs and documents. The pipeline runs automatically. The insurer's claims processor reviews the submission in their triage queue.

**Current implementation:** `ClaimantDashboard` → `SubmitClaim` (portal domain) → pipeline trigger.  
**Proposed change:** Add a visible "Claimant Submitted" badge on all claims from this channel in the triage queue, with a flag indicating whether the claimant's submitted documents have been verified against the insurer's policy records.

### Proposed Triage Queue Enhancement

The claims processor triage view should show, for each claim in the queue:

| Column | Starter | Tier 1 | Tier 2 | Tier 3 |
|---|:---:|:---:|:---:|:---:|
| Claim ID + vehicle | ✓ | ✓ | ✓ | ✓ |
| Intake channel badge (Insurer / Claimant) | ✓ | ✓ | ✓ | ✓ |
| Incident date | ✓ | ✓ | ✓ | ✓ |
| Pipeline status | ✓ | ✓ | ✓ | ✓ |
| Decision recommendation | ✓ | ✓ | ✓ | ✓ |
| Fraud risk colour band | — | ✓ | ✓ | ✓ |
| Quote delta % | — | ✓ | ✓ | ✓ |
| FCDI score | — | — | ✓ | ✓ |
| Re-run AI button | ✓ | ✓ | ✓ | ✓ |
| Upload additional documents | ✓ | ✓ | ✓ | ✓ |

---

## 7. Document Upload and AI Re-Assessment

The ability to upload additional documents and re-run the AI assessment is a core operational requirement that must be available at every tier. The current implementation has this capability in the `ClaimsProcessorDashboard` but it is not prominently surfaced.

**Proposed enhancement:** On every claim detail view, regardless of tier, a persistent "Documents & Re-Assessment" panel is visible. It shows all currently uploaded documents, allows additional uploads (photos, updated quotes, police reports, additional evidence), and provides a single "Re-run AI Assessment" button that triggers a fresh pipeline run with the new documents included. The re-run is charged at the same per-claim fee as the original run.

This is not a tier-gated feature. Every insurer at every tier needs to be able to add evidence and re-assess. Gating this would create operational friction that damages trust in the platform.

---

## 8. Page-by-Page Mapping: Existing vs Proposed

### Pages That Remain Unchanged

The following pages require no structural changes. They may receive minor visual polish but their architecture, data model, and functionality are correct as implemented.

| Page | Route | Reason unchanged |
|---|---|---|
| `InsurerRoleSelection` | `/insurer-portal` | Role selection model is correct |
| `ClaimsManagerDashboard` | `/insurer-portal/claims-manager` | Operational view is appropriate |
| `ClaimsManagerComparisonView` | `/insurer-portal/claims-manager/claims/:id` | Claim detail view is correct |
| `RiskManagerDashboard` | `/insurer-portal/risk-manager` | Risk view is appropriate |
| `GovernanceDashboard` | `/insurer-portal/governance` | Governance model is correct |
| `RelationshipIntelligence` | `/insurer-portal/relationship-intelligence` | Tier 3 feature, correct |
| `ReplayDashboard` | `/insurer/replay-dashboard` | Tier 3 feature, correct |
| `ExceptionIntelligenceHub` | `/insurer-portal/exception-intelligence` | Tier 2+ feature, correct |
| `ClaimantDashboard` | `/claimant/dashboard` | Claimant portal is correct |
| `SubmitClaim` (claimant) | `/claimant/submit-claim` | Claimant intake is correct |
| `AssessorDashboard` | `/assessor/dashboard` | Assessor portal is correct |
| `PanelBeaterDashboard` | `/panel-beater/dashboard` | Panel beater portal is correct |
| All platform admin pages | `/platform/*` | Internal tooling, unchanged |
| All admin pages | `/admin/*` | Internal tooling, unchanged |

### Pages That Require Tier Gating

The following pages currently show full intelligence to all users. The `TierGate` component must be applied to specific panels within these pages.

| Page | Route | What gets gated |
|---|---|---|
| `InsurerComparisonView` / `ClaimDecisionReport` | `/insurer/claims/:id/comparison` | Section 2 (physics) → Tier 3. Section 5 expanded (fraud breakdown) → Tier 2. Section 3 expanded (line-item) → Tier 2. Section 7 (ML) → Tier 3. |
| `ExecutiveDashboard` | `/insurer-portal/executive` | Entire page → Tier 2+. Tier 1 users redirected to Operational Dashboard. |
| `FraudAnalyticsDashboard` | `/insurer/fraud-analytics` | Entire page → Tier 2+. |
| `WorkflowAnalyticsDashboard` | `/insurer-portal/workflow-analytics` | Entire page → Tier 1+. |
| `ReportsCentre` | `/insurer-portal/reports-centre` | Forensic Intelligence Package generation → Tier 2+ (on-demand) or Tier 3 (subscription). |

### Pages That Require Structural Changes

| Page | Route | Required change |
|---|---|---|
| `ClaimsProcessorDashboard` | `/insurer-portal/claims-processor` | Add intake channel badge (Insurer / Claimant). Add FCDI column (Tier 2+). Add upload + re-run panel. |
| `ExecutiveDashboard` | `/insurer-portal/executive` | Split into two views: Operational Dashboard (Tier 1) and Executive Intelligence Dashboard (Tier 2+). |
| `ClaimDecisionReport` | `/insurer/claims/:id/comparison` | Apply `TierGate` to sections. Add "Documents & Re-Assessment" panel. |
| `SubmitClaim` (insurer) | `/insurer-portal/claims-processor` → submit | Add intake channel selector (Insurer-Initiated vs Claimant Portal). |

### New Pages Required

| Page | Route | Purpose |
|---|---|---|
| `OperationalDashboard` | `/insurer-portal/operational` | Tier 1 landing view — claim throughput, queues, approvals, turnaround time. No financial analytics. |
| `AssessorTierSelection` | `/assessor/portal` | Free / Professional / Forensic Partner tier selection and upgrade flow. |
| `TierUpgradeModal` | (component, not a page) | Contextual upgrade prompt shown when a user hits a tier gate. Shows specific value they are missing. |

---

## 9. The `TierGate` Component — Design Specification

The `TierGate` component is the single most important implementation task. It wraps any panel or section and renders either the content (if the user's tenant tier meets the requirement) or a locked upgrade prompt.

**Props:**
- `requiredTier`: `"starter" | "process" | "protect" | "prove"`
- `featureName`: string — the name of the feature shown in the upgrade prompt
- `valueStatement`: string — one sentence explaining what the insurer gains by upgrading
- `children`: the panel content to render if tier is met

**Upgrade prompt design:**
The locked panel shows a subtle lock icon, the feature name, the value statement, and a single "Upgrade to [Tier Name]" button. It does not show a greyed-out version of the content. It does not hint at what the data would show. It simply states what the feature does and invites the upgrade.

**Critical rule:** The upgrade prompt must never show partial data, blurred data, or placeholder numbers. A Tier 1 insurer who sees a locked Tier 2 panel sees only the value statement — never a hint of the intelligence behind it.

---

## 10. What Does Not Change

The following are explicitly out of scope for this redesign:

- The pipeline engine (Stages 0–10) — no changes
- The database schema — no changes
- The physics engine and speed inference ensemble — no changes
- The fraud scoring engine (FCDI) — no changes
- The report-narrative-generator and report-pdf-generator — minor additions only (tier-aware content filtering)
- The panel beater portal — no changes
- The claimant portal — no changes (intake channel badge is additive only)
- The platform admin and super-admin portals — no changes
- The fleet portal — explicitly excluded from this redesign phase

---

## 11. Implementation Sequence

This sequence is designed to deliver visible value at each step while minimising risk to the production system.

**Step 1 (Week 1):** Add `tier` field to the tenant configuration. Build the `TierGate` component. Apply it to the four pages that require tier gating. No new pages, no structural changes — purely additive.

**Step 2 (Week 2):** Add the intake channel badge to the claims processor triage queue. Add the "Documents & Re-Assessment" panel to the claim detail view. Both are additive changes.

**Step 3 (Week 3):** Build the `OperationalDashboard` for Tier 1 users. Redirect Tier 1 users from the Executive Dashboard to the Operational Dashboard. The Executive Dashboard remains unchanged for Tier 2+ users.

**Step 4 (Week 4):** Build the Assessor tier selection and upgrade flow. Apply tier gating to the assessor report output.

**Step 5 (Week 5):** Build the `TierUpgradeModal` with contextual value statements tied to specific locked panels. Wire the upgrade flow to the monetisation dashboard.

---

## 12. Mock HTML Visualisations

The following mock HTML files accompany this document. They are static visualisations only — no backend, no live data. They are intended for review and feedback before any implementation begins.

| File | What it shows |
|---|---|
| `mock-layer-a-starter.html` | Operational Claims Report — Starter tier |
| `mock-layer-a-tier1.html` | Operational Claims Report — Tier 1 (Process) |
| `mock-layer-a-tier2.html` | Operational Claims Report — Tier 2 (Protect) |
| `mock-layer-a-tier3.html` | Operational Claims Report — Tier 3 (Prove) |
| `mock-layer-b-operational-dashboard.html` | Operational Dashboard — Tier 1 claims manager view |
| `mock-layer-b-executive-dashboard.html` | Executive Intelligence Dashboard — Tier 2+ view |
| `mock-layer-c-forensic-package.html` | Forensic Intelligence Package — Tier 3 full view |
| `mock-assessor-professional.html` | Assessor Professional tier report |
| `mock-assessor-forensic.html` | Assessor Forensic Partner tier report |
| `mock-claim-intake-dual-channel.html` | Claims processor triage queue showing both intake channels |

---

*KINGA AutoVerify AI — Internal Planning Document v1.0 | April 2026 | Pre-implementation review only*
