# KINGA AutoVerify AI — Recovery Portal Audit v1.0

**Document Type:** Portal Audit Report  
**Portal:** Recovery Portal (Subrogation Module)  
**Audit Framework:** KINGA Portal Audit Master Prompt v1.1 (10-Phase, 13 Deliverables)  
**Date:** June 2026  
**Status:** Production Readiness Assessment  

---

## Executive Summary

The Recovery Portal is KINGA's subrogation management module, enabling recovery officers to manage third-party liability cases from initial assessment through demand letter generation, settlement negotiation, and case closure. The portal is the most operationally complete of the three portals reviewed in this audit cycle, featuring a seven-status case queue, a contextual quick-action bar, an AI-powered demand letter generator, a correspondence log with PDF export, a repeat offender detection system, and a third-party insurer intelligence panel.

**Critical Finding:** The Recovery Portal has no per-case report buttons. Three reports are authorised for `recovery_officer` (`recovery.case_summary`, `recovery.performance`, `recovery.third_party_profiles`), but none are surfaced within the Recovery Portal UI. All reports are accessible only through the Reports Centre, which requires the officer to navigate away from the case they are working on.

**Top 5 Recommendations:**

1. **[High]** Add a `recovery.case_summary` report button to the Recovery Case Detail header, enabling officers to generate a formal case summary PDF without leaving the case view.
2. **[High]** Add a `recovery.performance` report button to the Recovery Portal dashboard, enabling officers to generate a performance report directly from the queue view.
3. **[High]** Add a `recovery.third_party_profiles` report button to the Third-Party Profiles page.
4. **[Medium]** Add a "Mark Under Investigation" quick action to the case detail — currently there is no UI path to transition a case to `under_investigation` status.
5. **[Medium]** Add a recovery trend chart to the dashboard (monthly recovery rate, quantum claimed vs. recovered) — the data exists in `getKPIs` but is not visualised.

**Production Readiness Verdict:** **Ready for Go-Live with Enhancements.** The core recovery workflow is fully functional. The missing report buttons and the `under_investigation` transition gap are significant usability issues but do not block core operations. The portal can go live with a commitment to address these items in the first post-launch sprint.

---

## Deliverable 1 — Navigation Map

### Portal Identity

| Field | Value |
|---|---|
| **Portal Name** | Recovery Portal |
| **Primary Role** | `recovery_officer` |
| **Route Prefix** | `/insurer-portal/recovery` |
| **Entry Component** | `RecoveryPortal.tsx` |
| **Case Detail Component** | `RecoveryCaseDetail.tsx` |
| **Lines of Code** | 362 (RecoveryPortal.tsx) + 1,153 (RecoveryCaseDetail.tsx) = 1,515 total |
| **Layout** | `InsurerPortalLayout` with role-scoped sidebar |

### Sidebar Navigation (10 Items across 4 Groups)

| Group | Label | Description | Route | Status |
|---|---|---|---|---|
| Overview | Recovery Dashboard | Queue overview and KPIs | `/insurer-portal/recovery` | Working |
| Active Cases | Pending Review | New cases awaiting assessment | `/insurer-portal/recovery?tab=pending` | Working |
| Active Cases | Under Investigation | Cases with unresolved liability | `/insurer-portal/recovery?tab=investigation` | Working |
| Active Cases | Open Cases | Cases ready for demand action | `/insurer-portal/recovery?tab=open` | Working |
| Active Cases | Demand Sent | Outstanding demand responses | `/insurer-portal/recovery?tab=demand-sent` | Working |
| Active Cases | Disputed / Legal | Cases in dispute or legal referral | `/insurer-portal/recovery?tab=legal` | Working |
| Closed Cases | Settled Cases | Fully and partially recovered | `/insurer-portal/recovery?tab=settled` | Working |
| Closed Cases | Archived | Low-RPS cases not actioned | `/insurer-portal/recovery?tab=archived` | Working |
| Intelligence | Third-Party Profiles | Repeat third-party intelligence | `/insurer-portal/recovery/third-party-profiles` | Working |
| Intelligence | Relationship Intelligence | Entity network analysis | `/insurer-portal/relationship-intelligence` | Working |
| Reports | Recovery Reports | Generate recovery performance reports | `/insurer-portal/reports-centre?tab=recovery` | Working (via Reports Centre) |

### Case Status Lifecycle

| Status | DB Value | Description | Quick Actions Available |
|---|---|---|---|
| Pending Review | `pending_review` | New case awaiting officer assessment | Mark Demand Sent, Escalate to Legal, Close No Recovery |
| Under Investigation | `under_investigation` | Liability not yet determined | Close No Recovery |
| Open | `open` | Ready for demand action | Mark Demand Sent, Record Settlement, Escalate to Legal |
| Demand Sent | `demand_sent` | Awaiting third-party response | Record Settlement, Response Received, Escalate to Legal |
| Disputed / Legal | `disputed_legal` | In dispute or referred to attorneys | Record Settlement |
| Settled Full | `settled_full` | 100% recovery achieved | None (closed) |
| Settled Partial | `settled_partial` | Partial recovery achieved | None (closed) |
| Closed No Recovery | `closed_no_recovery` | Case closed without recovery | None (closed) |
| Archived | `archived` | Low-RPS case not actioned | None (closed) |

---

## Deliverable 2 — Orphaned Feature Register

| Feature | Location | Status | Issue |
|---|---|---|---|
| `recovery.case_summary` report | `reportDefinitions.ts:111` | **Authorised but not surfaced** | No button in RecoveryCaseDetail — only accessible via Reports Centre |
| `recovery.performance` report | `reportDefinitions.ts:112` | **Authorised but not surfaced** | No button in RecoveryPortal dashboard — only accessible via Reports Centre |
| `recovery.third_party_profiles` report | `reportDefinitions.ts:113` | **Authorised but not surfaced** | No button in Third-Party Profiles page — only accessible via Reports Centre |
| Mark Under Investigation action | `RecoveryCaseDetail.tsx` | **Missing** | No UI path to transition case to `under_investigation` status |
| Recovery trend chart | `RecoveryPortal.tsx` | **Missing** | Monthly recovery rate data exists in `getKPIs` but not visualised |
| Case assignment UI | `RecoveryCaseDetail.tsx` | **Partial** | `assignCase` procedure exists but no UI for officers to self-assign or managers to assign |
| Demand letter resend | `RecoveryCaseDetail.tsx` | **Partial** | `generateDemandLetter` can be called again but no explicit "Resend" button for `demand_sent` status |
| Liability denied status | `drizzle/schema.ts:4939` | **Schema only** | `liability_denied` is in the DB enum but not in the `STATUS_CARDS` array or `STATUS_META` — cases in this status are invisible in the UI |
| Archive action | `RecoveryCaseDetail.tsx` | **Missing** | No quick action to archive a case from the case detail view |

---

## Deliverable 3 — Data Lineage Matrix

### Recovery Portal Dashboard Data

| Data Point | tRPC Procedure | DB Table | Notes |
|---|---|---|---|
| Total cases | `trpc.recovery.getKPIs` | `recovery_cases` WHERE `tenantId = ?` | All cases, no date filter |
| Pending review count | `trpc.recovery.getKPIs` | `recovery_cases` WHERE `status = 'pending_review'` | Real-time count |
| Open cases count | `trpc.recovery.getKPIs` | `recovery_cases` WHERE `status = 'open'` | Real-time count |
| Demand sent count | `trpc.recovery.getKPIs` | `recovery_cases` WHERE `status = 'demand_sent'` | Real-time count |
| Total recovered | `trpc.recovery.getKPIs` | SUM `recovery_cases.recovered_amount` | In cents |
| Total settlement amount | `trpc.recovery.getKPIs` | SUM `recovery_cases.approved_settlement_amount` | In cents |
| Recovery rate | `trpc.recovery.getKPIs` | Calculated: `totalRecovered / totalSettlementAmount * 100` | Percentage |
| Avg RPS | `trpc.recovery.getKPIs` | AVG `recovery_cases.recovery_potential_score` | 0–100 score |
| Approaching deadlines | `trpc.recovery.getKPIs` | COUNT cases WHERE `recoveryDeadline <= NOW() + 90 days` | 90-day warning window |
| Case list | `trpc.recovery.getCases` | `recovery_cases` with optional `status` filter | Paginated, sorted by RPS |

### Recovery Case Detail Data

| Data Point | tRPC Procedure | DB Table | Notes |
|---|---|---|---|
| Case details | `trpc.recovery.getCase` | `recovery_cases` JOIN `claims` | Full case with claim context |
| Correspondence log | `trpc.recovery.getCorrespondenceLog` | `recovery_correspondence_log` | Ordered by `created_at` DESC |
| Prior cases | `trpc.recovery.getPriorCases` | `recovery_cases` WHERE `id IN (priorCaseIds)` | Repeat offender panel |
| Third-party profiles | `trpc.recovery.getThirdPartyProfiles` | `recovery_cases` GROUP BY `thirdPartyRegistration` | Repeat offender intelligence |

### Insurer Intelligence Data

| Data Point | tRPC Procedure | Aggregation | Notes |
|---|---|---|---|
| Settlement rate per insurer | `trpc.recovery.getInsurerIntelligence` | `settled / total * 100` | Per third-party insurer |
| Dispute rate per insurer | `trpc.recovery.getInsurerIntelligence` | `disputed / total * 100` | Per third-party insurer |
| Avg days to settle | `trpc.recovery.getInsurerIntelligence` | AVG days from `demandLetterSentAt` to `settlementAgreementDate` | Per third-party insurer |
| Recovery efficiency | `trpc.recovery.getInsurerIntelligence` | `totalRecovered / totalApproved * 100` | Per third-party insurer |

---

## Deliverable 4 — Workflow Intelligence Assessment

### Recovery Workflow Position

The Recovery Portal operates as a downstream module that receives cases automatically when a claim is approved and a third-party liability is identified. The recovery workflow is independent of the main claims workflow and has its own status lifecycle.

```
Claims Workflow: Approved → [Automatic trigger] → Recovery Case Created (pending_review)
Recovery Workflow:
  pending_review → under_investigation → open → demand_sent → settled_full/settled_partial
                                                             → disputed_legal → settled_full/settled_partial
                                                                              → closed_no_recovery
                                       → closed_no_recovery
                                       → archived
```

### Quick Action Availability by Status

| Status | Mark Demand Sent | Record Settlement | Response Received | Escalate to Legal | Close No Recovery |
|---|---|---|---|---|---|
| `pending_review` | Yes | No | No | Yes | Yes |
| `under_investigation` | No | No | No | No | Yes |
| `open` | Yes | Yes | No | Yes | No |
| `demand_sent` | No | Yes | Yes | Yes | No |
| `disputed_legal` | No | Yes | No | No | No |

### Missing Transition: Under Investigation

There is no quick action to transition a case to `under_investigation` status from the case detail view. The `under_investigation` status is defined in the schema and the sidebar navigation, but the only way to reach it is through the `updateCase` procedure with a direct status change — which requires a developer or admin to call the API directly. Recovery officers have no UI path to mark a case as under investigation.

### Demand Letter Generation

The demand letter generator is one of the most sophisticated features in the Recovery Portal. It uses the LLM (`invokeLLM`) to generate a formal demand letter on insurer letterhead, incorporating:
- Insurer branding (name, logo, FSP number, registration number)
- Claim details (claim number, incident date, vehicle, police report)
- Third-party details (name, insurer, policy number, address)
- Legal basis for the demand (subrogation rights)
- Settlement amount and deadline

The letter is rendered to PDF using Puppeteer and uploaded to S3. The download URL is returned to the frontend and logged in the correspondence log automatically.

**Constraint:** Demand letters can only be generated for cases in `open`, `demand_sent`, or `pending_review` status. Attempting to generate a letter for a case in any other status will return a `BAD_REQUEST` error.

### Deadline Alert System

The recovery deadline alert system (`recoveryDeadlineAlerts.ts`) runs on server startup and checks for cases where the recovery deadline is approaching. Alerts are sent at 90, 60, 30, 14, and 7 days before the deadline. Alerts are sent to the assigned recovery officer (or the insurer admin if no officer is assigned) via the Manus notification system. A minimum 6-day gap between alerts for the same case prevents duplicate notifications.

---

## Deliverable 5 — AI Utilisation Matrix

### AI Outputs Consumed by Recovery Portal

| AI Output | Source | Consumed In | How Used |
|---|---|---|---|
| Recovery Potential Score (RPS) | `recovery_cases.recoveryPotentialScore` | Case list, case detail | Case prioritisation — 0–100 score |
| Repeat Offender Flag | `recovery_cases.isRepeatOffender` | Case detail header | Repeat offender alert banner |
| Prior Case Count | `recovery_cases.priorCaseCount` | Case detail header | Number of prior recovery cases |
| AI Demand Letter | `invokeLLM` via `demandLetterGenerator.ts` | Case detail quick action | Full demand letter generation |
| Police Report Extraction | `policeReportExtractedAt` field | Case detail | Police report data pre-populated from KINGA AI pipeline |
| Third-Party Insurer Intelligence | `trpc.recovery.getInsurerIntelligence` | Recovery Portal dashboard | Settlement/dispute patterns per insurer |
| Accident Clusters | `trpc.intelligence.getAccidentClusters` | Relationship Intelligence | Geographic fraud clustering |

### AI Outputs NOT Consumed by Recovery Portal

| AI Output | Available In | Missing From |
|---|---|---|
| KINGA Fraud Risk Score | `claims.fraudRiskScore` | Not displayed in recovery case detail |
| KINGA AI Assessment Narrative | `ai_assessments.aiNarrative` | Not displayed in recovery case detail |
| Physics Deviation Score | `ai_assessments.physicsDeviationScore` | Not displayed in recovery case detail |
| Vehicle Structural Intelligence | `vehicleStructural.getClaimProfile` | Not displayed in recovery case detail |
| Exception Intelligence Recommendations | `trpc.exceptionIntelligence.getActionableRecommendations` | Not surfaced in Recovery Portal |
| FCDI Score | `ai_assessments` | Not displayed in recovery case detail |

### AI Intelligence Gap Assessment

The Recovery Portal makes excellent use of the AI demand letter generator and the RPS scoring system. However, the original KINGA AI assessment data (fraud risk score, physics deviation, AI narrative) from the claims workflow is not surfaced in the recovery case detail. This means a recovery officer working on a case where the original claim had a high fraud risk score has no visibility of that intelligence without navigating to the original claim in the Claims Portal.

The most impactful addition would be a "KINGA Intelligence Summary" panel in the case detail that shows the original claim's fraud risk score, AI assessment narrative, and any FCDI flags — providing the recovery officer with the full context of why the claim was approved and what risks were identified.

---

## Deliverable 6 — Report Catalogue Audit

### Recovery Portal Reports

| Report Key | Report Name | Generator Function | Authorised Roles | UI Button Exists? | Status |
|---|---|---|---|---|---|
| `recovery.case_summary` | Recovery Case Summary | `generateRecoveryCaseSummaryReport` | `insurer_admin`, `recovery_officer`, `claims_manager` | No | **Authorised but not surfaced** |
| `recovery.performance` | Recovery Performance | `generateRecoveryPerformanceReport` | `insurer_admin`, `recovery_officer`, `risk_manager`, `executive` | No | **Authorised but not surfaced** |
| `recovery.third_party_profiles` | Third-Party Profiles | `generateRecoveryThirdPartyProfilesReport` | `insurer_admin`, `recovery_officer`, `risk_manager` | No | **Authorised but not surfaced** |

### Report Catalogue Summary

All three recovery reports are accessible only through the Reports Centre (`/insurer-portal/reports-centre?tab=recovery`). There are no report buttons within the Recovery Portal itself. This means a recovery officer must navigate away from their current case to generate any report, which disrupts the workflow.

The `recovery.case_summary` report is particularly important — it should be accessible directly from the case detail view, as it provides a formal PDF summary of the case that can be attached to correspondence or submitted to management.

### Correspondence Log Export

The `exportCorrespondenceLog` procedure generates a PDF of the full correspondence log for a case and uploads it to S3. This is the only report-like feature within the Recovery Portal UI, and it is accessible via a download button in the correspondence log panel. This is working correctly.

---

## Deliverable 7 — Missing Intelligence Register

| Opportunity | Data Exists | Visible? | Effort | Impact |
|---|---|---|---|---|
| Monthly recovery rate trend chart | Yes — `getKPIs` returns per-status counts | No | Low | High — portfolio performance visibility |
| Quantum claimed vs. recovered trend | Yes — `totalRecovered`, `totalSettlementAmount` | No | Low | High — financial performance visibility |
| Original claim fraud risk score in case detail | Yes — `claims.fraudRiskScore` | No | Low | High — fraud context for recovery decisions |
| KINGA AI assessment narrative in case detail | Yes — `ai_assessments.aiNarrative` | No | Low | High — full claim context |
| Per-insurer recovery rate trend (month-on-month) | Partial — `getInsurerIntelligence` is static | No | Medium | High — negotiation intelligence |
| RPS distribution chart | Yes — `recovery_cases.recoveryPotentialScore` | No | Low | Medium — portfolio prioritisation |
| Deadline countdown calendar | Yes — `recoveryDeadline` field | No | Medium | Medium — deadline management |
| Recovery officer productivity metrics | Partial — `assignedOfficerUserId` + status changes | No | Medium | Medium — team management |
| Case ageing analysis (0–30, 31–60, 60+ days) | Yes — `createdAt` field | No | Low | Medium — SLA management |
| Third-party insurer blacklist / watch list | No | No | High | Medium — risk management |
| Recovery success rate by incident type | Yes — `claims.incidentType` + `recovery_cases.status` | No | Low | Medium — portfolio intelligence |

---

## Deliverable 8 — Missing Integration Register

| Integration | Should Exist | Currently Exists | Gap |
|---|---|---|---|
| KINGA AI assessment data in case detail | Recovery officer should see original claim's fraud risk score and AI narrative | No | `claims.fraudRiskScore` and `ai_assessments` are not joined in `getCase` |
| Claims Portal link from case detail | Recovery officer should be able to navigate to the original claim in the Claims Portal | Partial — `claimNumber` is displayed but not linked | No hyperlink to `/insurer/claims/{claimId}/comparison` |
| Case assignment notification | Recovery officer should be notified when a case is assigned to them | No | `assignCase` procedure exists but no notification trigger |
| Settlement notification to claims manager | Claims manager should be notified when a recovery case is settled | No | No notification trigger on settlement |
| Demand letter delivery confirmation | System should record when the demand letter was physically sent (not just generated) | Partial — `demandLetterSentAt` field exists but is set by "Mark Demand Sent" action, not by the letter generator | Letter generator sets `demandLetterUrl` but not `demandLetterSentAt` |
| Recovery outcome feedback to risk manager | Risk manager should see recovery outcomes for claims they approved | No | No feedback loop from recovery to risk manager |
| Legal referral integration | Cases in `disputed_legal` should have a path to record attorney details and legal file reference | No | No attorney details fields in schema |
| Police report re-extraction | Recovery officer should be able to trigger re-extraction of police report data if the initial extraction was incomplete | No | No re-extraction trigger in UI |

---

## Deliverable 9 — Improvement Plan

### Critical Priority

There are no critical (blocking) issues in the Recovery Portal. The core workflow is fully functional.

### High Priority

| Item | Effort | Impact | Owner |
|---|---|---|---|
| Add `recovery.case_summary` report button to RecoveryCaseDetail header | 0.5 day | Formal case summary PDF from case view | Engineering |
| Add `recovery.performance` report button to RecoveryPortal dashboard | 0.5 day | Performance report from queue view | Engineering |
| Add `recovery.third_party_profiles` report button to Third-Party Profiles page | 0.5 day | Third-party report from intelligence view | Engineering |
| Add "Mark Under Investigation" quick action to case detail | 0.5 day | Enables formal investigation status transition | Engineering |
| Surface `liability_denied` status in STATUS_CARDS and STATUS_META | 0.5 day | Cases in this status are currently invisible in the UI | Engineering |

### Medium Priority

| Item | Effort | Impact | Owner |
|---|---|---|---|
| Add monthly recovery rate trend chart to dashboard | 1 day | Portfolio performance visibility | Engineering |
| Add KINGA AI intelligence summary panel to case detail | 1 day | Full claim context for recovery decisions | Engineering |
| Add hyperlink from case detail to original claim in Claims Portal | 0.5 day | Cross-portal navigation | Engineering |
| Add case assignment notification | 0.5 day | Officer workflow communication | Engineering |
| Add settlement notification to claims manager | 0.5 day | Cross-portal workflow communication | Engineering |
| Add "Archive" quick action to case detail | 0.5 day | Enables archiving from case view | Engineering |
| Add case ageing analysis to dashboard | 0.5 day | SLA management | Engineering |
| Add RPS distribution chart to dashboard | 0.5 day | Portfolio prioritisation | Engineering |

### Low Priority

| Item | Effort | Impact | Owner |
|---|---|---|---|
| Add attorney details fields to recovery case schema | 1 day | Legal referral tracking | Engineering |
| Add per-insurer recovery rate trend (month-on-month) | 1 day | Negotiation intelligence | Engineering |
| Add recovery officer productivity metrics | 1 day | Team management | Engineering |
| Add deadline countdown calendar view | 1.5 days | Deadline management | Engineering |
| Add police report re-extraction trigger | 1 day | Data quality | Engineering |

---

## Deliverable 10 — Portal Report Specification

### Recovery Case Summary Report — Ideal Design

**Purpose:** Provide a formal PDF summary of a single recovery case, suitable for management review, legal submission, or file archiving.

**Section 1 — Case Header**
- Case ID, claim number, insurer name, recovery officer name
- Case status, opened date, recovery deadline
- Recovery Potential Score (RPS) with colour coding
- Data Sources: `recovery_cases`, `users`, `tenants`

**Section 2 — Claim Context**
- Vehicle registration, make, model, year
- Incident date, incident type, incident location
- Police report number, police station
- KINGA fraud risk score and AI assessment summary
- Approved settlement amount
- Data Sources: `claims`, `ai_assessments`

**Section 3 — Third-Party Details**
- Third-party name, registration, ID number
- Third-party insurer, policy number, contact details
- Recovery target (insurer vs. individual)
- Repeat offender flag and prior case count
- Data Sources: `recovery_cases`

**Section 4 — Recovery Actions Timeline**
- Full correspondence log (demand letters, responses, status changes)
- Demand letter sent date, response due date, response received date
- Settlement agreement date and amount
- Data Sources: `recovery_correspondence_log`

**Section 5 — Financial Summary**
- Approved settlement amount, recovered amount, recovery rate
- Currency code, settlement type (full/partial)
- Data Sources: `recovery_cases`

**Section 6 — Officer Notes**
- Full officer notes history
- Data Sources: `recovery_cases.officerNotes`

---

## Deliverable 11 — Implementation Priority Matrix

| Item | Priority | Effort (days) | Impact | Effort vs. Impact |
|---|---|---|---|---|
| `recovery.case_summary` report button in case detail | High | 0.5 | Formal case summary from case view | Very High ROI |
| `recovery.performance` report button in dashboard | High | 0.5 | Performance report from queue view | Very High ROI |
| `recovery.third_party_profiles` report button | High | 0.5 | Third-party report from intelligence view | Very High ROI |
| Mark Under Investigation quick action | High | 0.5 | Investigation status transition | Very High ROI |
| Surface `liability_denied` status in UI | High | 0.5 | Invisible cases made visible | Very High ROI |
| Monthly recovery rate trend chart | Medium | 1 | Portfolio performance visibility | High ROI |
| KINGA AI intelligence summary in case detail | Medium | 1 | Full claim context | High ROI |
| Claims Portal hyperlink from case detail | Medium | 0.5 | Cross-portal navigation | High ROI |
| Case assignment notification | Medium | 0.5 | Officer workflow communication | High ROI |
| Settlement notification to claims manager | Medium | 0.5 | Cross-portal communication | High ROI |
| Archive quick action | Medium | 0.5 | Case management | Medium ROI |
| Case ageing analysis | Medium | 0.5 | SLA management | Medium ROI |
| Attorney details fields | Low | 1 | Legal referral tracking | Low ROI |
| Per-insurer recovery trend | Low | 1 | Negotiation intelligence | Medium ROI |
| Recovery officer productivity metrics | Low | 1 | Team management | Low ROI |

---

## Deliverable 12 — Cross-Portal Integration Map

| This Portal | Other Portal | Direction | Data Passed | Status | Gap |
|---|---|---|---|---|---|
| Recovery Portal | Claims Workflow | Receives | Approved claims automatically create recovery cases | Working — `createRecoveryCase` trigger on claim approval | No notification to recovery officer when new case is created |
| Recovery Portal | Claims Portal | Reads | `claimNumber`, `vehicleRegistration`, `incidentDate` displayed in case detail | Working — `getCase` joins `claims` | No hyperlink to original claim; fraud risk score not joined |
| Recovery Portal | Risk Manager | Feeds | Recovery outcomes (settled, closed) visible in Risk Manager portfolio | Partial — shared `recovery_cases` table | No notification to risk manager on settlement |
| Recovery Portal | Claims Manager | Feeds | Recovery performance metrics visible in Claims Manager analytics | Partial — shared `recovery_cases` table | No notification to claims manager on settlement |
| Recovery Portal | Executive Dashboard | Feeds | Recovery rate, total recovered visible in Executive KPIs | Working — `analytics.getExecutiveAlerts` includes recovery data | No dedicated recovery trend in Executive Dashboard |
| Recovery Portal | Relationship Intelligence | Consumes | Entity network analysis | Working — shared `trpc.intelligence.*` | Not surfaced in Recovery Portal dashboard |
| Recovery Portal | Reports Centre | Bidirectional | Report generation | Working — Reports Centre is role-aware | All 3 recovery reports only accessible via Reports Centre |
| Recovery Portal | Notification System | Sends | Deadline alerts to assigned officer | Working — `recoveryDeadlineAlerts.ts` | Assignment notification missing; settlement notification missing |

---

## Deliverable 13 — Production Readiness Verdict

### Verdict: **Ready for Go-Live with Enhancements**

The Recovery Portal is the most operationally complete portal in the KINGA platform. The core subrogation workflow — from case creation through demand letter generation, settlement recording, and closure — is fully functional and backed by a comprehensive database schema, an AI demand letter generator, a correspondence log, and a deadline alert system.

The missing report buttons and the `under_investigation` transition gap are significant usability issues but do not block core operations. The `liability_denied` status being invisible in the UI is a data integrity concern that should be resolved before go-live.

### Readiness Scorecard

| Dimension | Score | Notes |
|---|---|---|
| Navigation completeness | 9/10 | Comprehensive sidebar with 10 items |
| Data accuracy | 9/10 | Real-time case data; KPIs are accurate |
| Workflow completeness | 8/10 | Core workflow complete; `under_investigation` transition missing; `liability_denied` invisible |
| AI intelligence utilisation | 7/10 | Excellent demand letter AI; original claim AI data not surfaced |
| Report coverage | 2/10 | 0 of 3 authorised reports have direct UI entry points |
| Cross-portal integration | 7/10 | Core integrations work; notification triggers missing; no claims portal link |
| Audit trail quality | 9/10 | Comprehensive correspondence log with PDF export |
| **Overall** | **7.3/10** | **Ready for go-live with enhancements** |

### Pre-Go-Live Checklist

- [ ] Add `recovery.case_summary` report button to case detail (High — 0.5 day)
- [ ] Add `recovery.performance` report button to dashboard (High — 0.5 day)
- [ ] Add `recovery.third_party_profiles` report button to Third-Party Profiles (High — 0.5 day)
- [ ] Add "Mark Under Investigation" quick action (High — 0.5 day)
- [ ] Surface `liability_denied` status in STATUS_CARDS and STATUS_META (High — 0.5 day)

### Post-Launch Sprint Recommendations

- Add KINGA AI intelligence summary panel to case detail (Medium — 1 day)
- Add hyperlink from case detail to original claim (Medium — 0.5 day)
- Add monthly recovery rate trend chart to dashboard (Medium — 1 day)
- Add case assignment and settlement notifications (Medium — 1 day)

---

*KINGA AutoVerify AI — Recovery Portal Audit v1.0*  
*Produced using KINGA Portal Audit Master Prompt v1.1*  
*Audit scope: RecoveryPortal.tsx, RecoveryCaseDetail.tsx, routers.ts (recovery namespace), reportDefinitions.ts, demandLetterGenerator.ts, recoveryDeadlineAlerts.ts, drizzle/schema.ts (recovery_cases, recovery_correspondence_log)*
