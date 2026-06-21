# KINGA AutoVerify AI — Claims Manager Portal Audit v1.0

**Document Type:** Portal Audit Report  
**Portal:** Claims Manager  
**Audit Framework:** KINGA Portal Audit Master Prompt v1.1 (10-Phase, 13 Deliverables)  
**Date:** June 2026  
**Status:** Production Readiness Assessment  

---

## Executive Summary

The Claims Manager Portal is the operational hub for the head of claims, responsible for overseeing the entire claims lifecycle from intake through to financial closure. The portal is substantially built and functional, with a well-structured six-tab dashboard, real-time queue management, AI-assisted decision support, and a growing suite of management reports.

**Critical Finding:** The `sendBackClaim` workflow action — one of the most operationally important controls a claims manager possesses — calls the wrong backend procedure (`trpc.claims.approveClaim` as a placeholder). When a claims manager sends a claim back to a processor or risk manager, the system silently executes an approval action instead. This is a production-blocking defect that must be resolved before go-live.

**Top 5 Recommendations:**

1. **[Critical]** Replace the `sendBackClaim` placeholder with a dedicated `sendBackClaim` procedure that uses the WorkflowEngine to transition the claim to `internal_review` or `technical_approval` as appropriate.
2. **[High]** Add per-claim report buttons for `claim.cost_comparison`, `claim.repair_decision`, and `claim.audit_trail` to the Review Queue tab — these are authorised for `claims_manager` but are not surfaced in the UI.
3. **[High]** Surface the Claims Ageing panel (already built for the Executive Dashboard) within the Claims Manager Dashboard to give the manager real-time dwell-time visibility.
4. **[High]** Implement a dedicated `sendBackClaim` procedure that records the target role (processor vs. risk manager) and the reason in the audit trail.
5. **[Medium]** Add a `closeForProcessing` procedure that is distinct from `approveClaim` — the current dual-use of `approveClaim` for both approval and closure creates ambiguous audit records.

**Production Readiness Verdict:** **Conditional — Not Ready for Go-Live.** The portal is operationally viable for supervised use but must not be deployed to a live insurer until the `sendBackClaim` bug is resolved.

---

## Deliverable 1 — Navigation Map

### Portal Identity

| Field | Value |
|---|---|
| **Portal Name** | Claims Manager Portal |
| **Primary Role** | `claims_manager` |
| **Route Prefix** | `/insurer-portal/claims-manager` |
| **Entry Component** | `ClaimsManagerDashboard.tsx` |
| **Lines of Code** | ~1,250 (ClaimsManagerDashboard.tsx) |
| **Layout** | `InsurerPortalLayout` with role-scoped sidebar |

### Sidebar Navigation (5 Items)

| Label | Description | Route | Status |
|---|---|---|---|
| My Dashboard | Queue, stats & finances | `/insurer-portal/claims-manager` | Working |
| Intake Queue | New claims awaiting assignment | `/insurer-portal/claims-manager?tab=intake` | Working |
| Active Claims | Claims in progress | `/insurer-portal/claims-manager?tab=active` | Working |
| Review Queue | Ready for final review | `/insurer-portal/claims-manager?tab=review` | Working |
| Processed Claims | Closed and settled history | `/insurer-portal/claims-manager?tab=processed` | Working |

**Note:** The Fleet Approvals tab is accessible within the dashboard but is not listed in the sidebar navigation. It is only reachable by navigating to the dashboard and selecting the tab.

### Dashboard Tab Structure (6 Tabs)

| Tab | Value | Primary Purpose | Data Source |
|---|---|---|---|
| Intake Queue | `intake` | New claims awaiting processor assignment | `trpc.claims.getIntakeQueue` |
| Review Queue | `review` | Claims ready for manager final review | `trpc.workflowQueries.getClaimsByStatus` |
| Active Claims | `active` | All in-progress claims portfolio view | `trpc.claims.getActiveClaims` |
| Fraud Alerts | `fraud` | High-risk flagged claims | `trpc.claims.getFraudAlerts` |
| Processed Claims | `processed` | Closed and settled claims history | `trpc.workflowQueries.getClaimsByStatus` |
| Fleet Approvals | `fleet` | Fleet manager account requests | `trpc.fleetAccounts.*` |

### Claim Detail View

`InsurerClaimDetails.tsx` is a redirect-only component. It immediately redirects to `/insurer/claims/:id/comparison?report=standard`, which renders `ClaimsManagerComparisonView.tsx`. The comparison view is the actual claim detail page.

### Comparison View Panels (Role-Conditional)

| Panel | Shown To | Component |
|---|---|---|
| QMS Compliance Panel | `claims_manager`, `risk_manager` | `QMSCompliancePanel` |
| Vehicle Structural Intelligence | `claims_manager`, `risk_manager` | `VehicleStructuralIntelligencePanel` |
| Technical Validation Panel (Risk flags) | `risk_manager` only | Inline in `ClaimsManagerComparisonView` |
| Three-Column Comparison | All roles | KINGA Assessment / Assessor Report / Panel Beater Quotes |

---

## Deliverable 2 — Orphaned Feature Register

| Feature | Location | Status | Issue |
|---|---|---|---|
| `sendBackClaim` action | `ClaimsManagerDashboard.tsx:269` | **Broken** | Calls `trpc.claims.approveClaim` — no dedicated `sendBackClaim` procedure exists |
| `closeForProcessing` action | `ClaimsManagerDashboard.tsx:252` | **Broken** | Also calls `trpc.claims.approveClaim` with `selectedQuoteId: 0` — ambiguous audit record |
| Fleet Approvals tab | Dashboard tab 6 | **Orphaned from sidebar** | Tab exists and works but is not linked from sidebar navigation |
| `claim.cost_comparison` report | `reportDefinitions.ts:66` | **Authorised but not surfaced** | `claims_manager` is authorised but no button exists in ClaimsManagerDashboard |
| `claim.repair_decision` report | `reportDefinitions.ts:67` | **Authorised but not surfaced** | Same — authorised but no UI entry point |
| `claim.audit_trail` report | `reportDefinitions.ts:71` | **Authorised but not surfaced** | Same — authorised but no UI entry point |
| `claim.forensic` report | `reportDefinitions.ts:69` | **Authorised but not surfaced** | `claims_manager` is authorised but no button in ClaimsManagerDashboard |
| `portfolio.dwell_time` report | `reportDefinitions.ts:76` | **Authorised but not surfaced** | No button in Claims Manager UI |
| `portfolio.panel_beater_performance` report | `reportDefinitions.ts:77` | **Authorised but not surfaced** | No button in Claims Manager UI |
| `portfolio.fraud_summary` report | `reportDefinitions.ts:80` | **Authorised but not surfaced** | No button in Claims Manager UI |

---

## Deliverable 3 — Data Lineage Matrix

### KPI Cards (Manager Overview Header)

| KPI | UI Location | tRPC Procedure | DB Table | Fallback |
|---|---|---|---|---|
| Total Savings Identified | Dashboard header | `trpc.claims.getManagerOverview` → `kpis.totalSavings.value` | `claims.approvedAmount` vs `aiAssessment.estimatedCost` | `DEMO_DASHBOARD_STATS.totalSavingsIdentified` |
| Completed This Month | Dashboard header | `trpc.claims.getManagerOverview` → `kpis.completedClaims.value` | `claims` WHERE `status = 'closed'` | `DEMO_DASHBOARD_STATS.completedThisMonth` |
| Total Claims | Dashboard header | `trpc.claims.getManagerOverview` → `kpis.totalClaims.value` | `claims` COUNT | `DEMO_DASHBOARD_STATS.totalClaims` |
| Completion % | Dashboard header | Derived from above | Derived | Derived from demo |

### Queue Data

| Queue | tRPC Procedure | DB Query | Fallback |
|---|---|---|---|
| Intake Queue | `trpc.claims.getIntakeQueue` | `claims` WHERE `workflowState = 'intake_queue'` | `DEMO_INTAKE_CLAIMS` |
| Review Queue | `trpc.workflowQueries.getClaimsByStatus` | `claims` WHERE `workflowState IN ('technical_approval', 'financial_decision')` | `DEMO_REVIEW_CLAIMS` |
| Active Claims | `trpc.claims.getActiveClaims` | `claims` WHERE active states | `DEMO_ACTIVE_CLAIMS` |
| Fraud Alerts | `trpc.claims.getFraudAlerts` | `claims` WHERE `fraudRiskScore >= threshold` | `DEMO_FRAUD_ALERTS` |
| Processed Claims | `trpc.workflowQueries.getClaimsByStatus` | `claims` WHERE `workflowState = 'closed'` | `DEMO_PROCESSED_CLAIMS` |
| Dashboard Stats | `trpc.claims.getDashboardStats` | Aggregate query | `DEMO_DASHBOARD_STATS` |

### Demo Data Fallback Pattern

The portal uses six `DEMO_` constants imported from `@/lib/demoData`. These are applied only when the real query returns an empty array or null result. This is a correct and intentional pattern for a platform with sparse production data. The fallback is not hardcoded — it is conditional on real data being absent.

### Claim Detail Data

| Data Point | tRPC Procedure | DB Table |
|---|---|---|
| Claim record | `trpc.claims.getById` | `claims` |
| AI assessment | `trpc.aiAssessments.byClaim` | `ai_assessments` |
| Assessor evaluation | `trpc.assessorEvaluations.byClaim` | `assessor_evaluations` |
| Panel beater quotes | `trpc.quotes.byClaim` | `quotes` |
| Vehicle structural profile | `trpc.vehicleStructural.getClaimProfile` | ANCAP/CRASH3 lookup |

---

## Deliverable 4 — Workflow Intelligence Assessment

### Claims Manager Workflow Position

The claims manager sits at the top of the claims processing hierarchy. Their workflow position is:

```
Intake Queue → [Processor Assignment] → Under Assessment → Internal Review
    → Technical Approval ← [Claims Manager Review Queue]
    → Financial Decision ← [Claims Manager Financial Closure]
    → Payment Authorized → Closed
```

The claims manager interacts primarily at the **Technical Approval** and **Financial Decision** stages, with oversight of the entire pipeline.

### Workflow Actions Available

| Action | UI Location | Backend Procedure | Status |
|---|---|---|---|
| Assign to Processor | Intake Queue tab | `trpc.claims.getAvailableProcessors` + assignment | Working |
| Trigger AI Assessment | Intake Queue | `trpc.claims.triggerAiAssessment` | Working |
| Reset Stuck Claim | Intake Queue | `trpc.claims.resetStuckClaim` | Working |
| Assign to Assessor | Intake Queue | `trpc.claims.assignToAssessor` | Working |
| Approve for Closure | Review Queue | `trpc.claims.approveClaim` (via `closeForProcessing`) | **Ambiguous** |
| Send Back to Processor | Review Queue | `trpc.claims.approveClaim` (WRONG — placeholder) | **BROKEN** |
| Send Back to Risk Manager | Review Queue | `trpc.claims.approveClaim` (WRONG — placeholder) | **BROKEN** |
| Add Comment | Review Queue | `trpc.comments.addComment` | Working |
| Upload Document | Intake Queue | `trpc.documents.upload` | Working |
| Approve Fleet Manager | Fleet Approvals | `trpc.fleetAccounts.approveFleetManagerRequest` | Working |
| Reject Fleet Manager | Fleet Approvals | `trpc.fleetAccounts.rejectFleetManagerRequest` | Working |

### Send Back Workflow — Critical Bug Detail

The `handleSubmitSendBack` function in `ClaimsManagerDashboard.tsx` (line 321) calls:

```typescript
sendBackClaim.mutate({ claimId: selectedClaim.id, selectedQuoteId: 0 });
```

Where `sendBackClaim` is defined at line 269 as:

```typescript
const sendBackClaim = trpc.claims.approveClaim.useMutation({ ... });
```

The `approveClaim` procedure (routers.ts:3000) executes a **fraud check**, selects a quote, and transitions the claim to `repair_assigned` state via the WorkflowEngine. Calling it with `selectedQuoteId: 0` will either throw a "Quote not found" error (if no quote with ID 0 exists) or, if a quote exists, will incorrectly approve the claim. The workflow engine's `ROLE_TRANSITION_PERMISSIONS` map defines the correct send-back transitions:

- `technical_approval → internal_review` — allowed for `claims_manager`
- `financial_decision → technical_approval` — allowed for `claims_manager`

A dedicated `sendBackClaim` procedure must use these transitions.

### Workflow State Coverage

| Workflow State | Claims Manager Can See? | Claims Manager Can Act? |
|---|---|---|
| `intake_queue` | Yes (Intake tab) | Yes (assign, trigger AI) |
| `under_assessment` | Yes (Active tab) | Limited (view only) |
| `internal_review` | Yes (Active tab) | No direct action |
| `technical_approval` | Yes (Review Queue) | Yes (approve, send back) |
| `financial_decision` | Yes (Review Queue) | Yes (close, send back) |
| `payment_authorized` | Yes (Processed) | View only |
| `closed` | Yes (Processed) | View only |
| `disputed` | Yes (Active tab) | View only |

---

## Deliverable 5 — AI Utilisation Matrix

### AI Outputs Consumed by Claims Manager

| AI Output | Source | Consumed In | How Used |
|---|---|---|---|
| KINGA Estimated Cost | `ai_assessments.estimatedCost` | Comparison View (Column 1) | Compared against assessor and panel beater quotes |
| Fraud Risk Score | `ai_assessments.fraudRiskScore` | Fraud Alerts tab, Active Claims badges | Drives fraud alert queue population |
| Confidence Score | `ai_assessments.confidenceScore` | Comparison View | Displayed as percentage confidence |
| Damage Analysis | `ai_assessments` JSON | Comparison View Column 1 | Part breakdown and severity |
| Vehicle Structural Intelligence | `trpc.vehicleStructural.getClaimProfile` | VehicleStructuralIntelligencePanel | ANCAP/CRASH3 safety rating |
| QMS Compliance | `QMSCompliancePanel` | Comparison View | Quality management compliance flags |
| Causal Reasoning | Pipeline Stage 5 | Comparison View | Incident type and liability narrative |
| Photo Forensics | `photoForensicsEngine` | Comparison View (photo section) | EXIF integrity, manipulation score |

### AI Outputs NOT Consumed by Claims Manager

| AI Output | Available In | Missing From |
|---|---|---|
| Claims Ageing Analysis | `analytics.getClaimsAgeing` (Executive Dashboard) | Claims Manager Dashboard |
| Fraud Investigation Funnel | `analytics.getFraudInvestigationFunnel` (Executive Dashboard) | Claims Manager Dashboard |
| Executive Alerts | `analytics.getExecutiveAlerts` (Executive Dashboard) | Claims Manager Dashboard |
| Portfolio Leakage Metric | `analytics.getMonthComparison` (Executive Dashboard) | Claims Manager Dashboard |
| Panel Beater Performance Trend | `reportDefinitions.generatePanelBeaterPerformanceReport` | Not surfaced in Claims Manager UI |
| Assessor Performance Ranking | `trpc.assessors.list` with performance scores | Not surfaced in Claims Manager UI |

### AI Intelligence Gap Assessment

The Claims Manager has access to per-claim AI intelligence but lacks portfolio-level AI intelligence. The Executive Dashboard has three AI-driven components (Alerts Centre, Claims Ageing, Fraud Funnel) that would be directly actionable for a claims manager but are not visible in their portal. This is the most significant intelligence gap.

---

## Deliverable 6 — Report Catalogue Audit

### Per-Claim Reports (Claims Manager Authorised)

| Report Key | Report Name | Generator Function | UI Button Exists? | Status |
|---|---|---|---|---|
| `claim.assessment` | KINGA Claims Assessment | `generateClaimAssessmentReport` | Yes (Review Queue tab, line 767) | Working |
| `claim.forensic` | KINGA Forensic Audit | `generateForensicReport` | No | **Authorised but not surfaced** |
| `claim.cost_comparison` | Cost Comparison | `generateCostComparisonReport` | No | **Authorised but not surfaced** |
| `claim.repair_decision` | Repair Decision | `generateRepairDecisionReport` | No | **Authorised but not surfaced** |
| `claim.audit_trail` | Audit Trail | `generateAuditTrailReport` | No | **Authorised but not surfaced** |

### Portfolio Reports (Claims Manager Authorised)

| Report Key | Report Name | Generator Function | UI Button Exists? | Status |
|---|---|---|---|---|
| `portfolio.claims_summary` | Claims Summary | `generateClaimsSummaryReport` | Yes (Dashboard header, line 380) | Working |
| `portfolio.dwell_time` | Dwell Time Analysis | `generateDwellTimeReport` | No | **Authorised but not surfaced** |
| `portfolio.panel_beater_performance` | Panel Beater Performance | `generatePanelBeaterPerformanceReport` | No | **Authorised but not surfaced** |
| `portfolio.fraud_summary` | Fraud Summary | `generateFraudSummaryReport` | No | **Authorised but not surfaced** |
| `portfolio.assessor_performance` | Assessor Performance | `generateAssessorPerformanceReport` | No | **Authorised but not surfaced** |

### Cross-Portal Reports (Claims Manager Authorised)

| Report Key | Report Name | UI Entry Point | Status |
|---|---|---|---|
| `recovery.case_summary` | Recovery Case Summary | Reports Centre | Working (via Reports Centre) |
| `executive.claims_trend` | Claims Trend | Reports Centre | Working (via Reports Centre) |
| `executive.financial_exposure` | Financial Exposure | Reports Centre | Working (via Reports Centre) |

### Report Catalogue Summary

Of 10 reports authorised for `claims_manager`, only 2 have direct UI entry points within the Claims Manager Portal itself. The remaining 8 are accessible only through the Reports Centre (`/insurer-portal/reports-centre`), which requires the user to know the report exists and navigate away from their primary workflow. This represents a significant discoverability gap.

---

## Deliverable 7 — Missing Intelligence Register

| Opportunity | Data Exists | Visible? | Effort | Impact |
|---|---|---|---|---|
| Claims ageing buckets (0–14, 15–29, 30–59, 60+ days) | Yes — `analytics.getClaimsAgeing` | No (Executive only) | Low | High — SLA breach prevention |
| Portfolio leakage metric (reserves vs. approved) | Yes — `analytics.getMonthComparison` | No (Executive only) | Low | High — financial control |
| Panel beater performance ranking | Yes — `generatePanelBeaterPerformanceReport` | No — report not surfaced | Low | High — repairer quality control |
| Assessor performance ranking | Yes — `trpc.assessors.list` with scores | No | Low | Medium — assessor management |
| Fraud investigation funnel | Yes — `analytics.getFraudInvestigationFunnel` | No (Executive only) | Low | High — fraud oversight |
| Send-back reason tracking | No — comments only, no structured field | No | Medium | High — workflow audit quality |
| Claims manager SLA breach alerts | No dedicated procedure | No | Medium | High — operational control |
| Cost variance trend (KINGA vs. approved) | Partial — per-claim only | No portfolio view | Medium | High — leakage detection |
| Repeat claimant detection | Partial — fraud score includes it | No dedicated view | Medium | High — fraud prevention |
| Assessor-to-outcome correlation | No | No | High | High — assessor quality management |
| Panel beater quote variance trend | Partial — per-claim comparison view | No portfolio trend | Medium | Medium — cost benchmarking |
| Workflow bottleneck identification | No | No | Medium | Medium — process improvement |

---

## Deliverable 8 — Missing Integration Register

| Integration | Should Exist | Currently Exists | Gap |
|---|---|---|---|
| Recovery case creation notification | Claims Manager should be notified when a recovery case is created for a claim they managed | No | No notification trigger from recovery module to claims manager |
| Risk Manager escalation notification | Claims Manager should receive notification when risk manager escalates a claim | No | No notification trigger |
| Assessor assignment confirmation | Claims Manager should receive confirmation when assessor accepts assignment | No | No notification trigger |
| Financial approval threshold alert | Claims Manager should be alerted when a claim approaches the financial approval threshold | No | No threshold proximity alert |
| Fraud escalation to Fraud Manager | Claims Manager should be able to escalate directly to Fraud Manager from the Fraud Alerts tab | No dedicated route | Only available via comment/manual process |
| SLA breach notification | Claims Manager should receive automated alert when a claim exceeds dwell time threshold | No | No SLA monitoring trigger |

---

## Deliverable 9 — Improvement Plan

### Critical Priority

| Item | Effort | Impact | Owner |
|---|---|---|---|
| Fix `sendBackClaim` — replace `approveClaim` placeholder with dedicated procedure using WorkflowEngine transitions `technical_approval → internal_review` and `financial_decision → technical_approval` | 1 day | Prevents incorrect approvals being recorded as send-backs | Engineering |
| Fix `closeForProcessing` — replace `approveClaim` with a distinct closure procedure that records the correct intent in the audit trail | 1 day | Audit trail integrity | Engineering |

### High Priority

| Item | Effort | Impact | Owner |
|---|---|---|---|
| Add per-claim report dropdown to Review Queue (cost_comparison, repair_decision, audit_trail, forensic) | 1 day | Claims manager gains full report access within workflow | Engineering |
| Add Claims Ageing panel to Claims Manager Dashboard | 0.5 day | Real-time SLA visibility | Engineering |
| Add Fraud Investigation Funnel to Claims Manager Fraud Alerts tab | 0.5 day | Portfolio fraud oversight | Engineering |
| Add Fleet Approvals to sidebar navigation | 0.5 day | Feature discoverability | Engineering |
| Add portfolio report buttons (dwell_time, panel_beater_performance, fraud_summary) to dashboard | 1 day | Report discoverability | Engineering |

### Medium Priority

| Item | Effort | Impact | Owner |
|---|---|---|---|
| Add structured `sendBackReason` field to send-back dialog and audit trail | 1 day | Audit quality | Engineering |
| Add SLA breach alert component to dashboard | 2 days | Operational control | Engineering |
| Add portfolio leakage metric to dashboard KPI cards | 0.5 day | Financial control | Engineering |
| Add assessor performance panel to Intake Queue tab | 1 day | Assessor management | Engineering |

### Low Priority

| Item | Effort | Impact | Owner |
|---|---|---|---|
| Add Fleet Approvals count badge to sidebar | 0.5 day | Discoverability | Engineering |
| Add export to Excel for Fraud Alerts tab | 0.5 day | Reporting convenience | Engineering |
| Add claim count badges to sidebar navigation items | 0.5 day | UX improvement | Engineering |

---

## Deliverable 10 — Portal Report Specification

### Claims Management Report — Ideal Design

**Purpose:** Provide the head of claims with a comprehensive monthly portfolio intelligence report covering operational performance, financial outcomes, AI accuracy, and workflow efficiency.

**Section 1 — Executive Summary**
- KPIs: Total claims processed, total approved value, total savings identified, average processing time, fraud prevention rate
- AI Narrative: LLM-generated summary of the month's key trends and anomalies
- Data Sources: `claims`, `ai_assessments`, `quotes`

**Section 2 — Claims Ageing Analysis**
- KPIs: Count and value by ageing bucket (0–14, 15–29, 30–59, 60+ days)
- Chart: Horizontal bar chart by ageing bucket
- Data Sources: `analytics.getClaimsAgeing`

**Section 3 — Financial Performance**
- KPIs: Total reserves, total approved, total recovered, net exposure, leakage rate
- Chart: Month-on-month comparison bar chart
- Data Sources: `analytics.getMonthComparison`

**Section 4 — Fraud Intelligence**
- KPIs: Flagged count, investigated count, confirmed fraud count, prevented loss value
- Chart: Fraud investigation funnel
- Data Sources: `analytics.getFraudInvestigationFunnel`, `claims.fraudRiskScore`

**Section 5 — Panel Beater Performance**
- KPIs: Top 10 panel beaters by volume, average quote variance vs. KINGA estimate, quality score
- Chart: Scatter plot of quote variance vs. volume
- Data Sources: `generatePanelBeaterPerformanceReport`

**Section 6 — Assessor Performance**
- KPIs: Assessor ranking by performance score, average assessment accuracy vs. KINGA
- Chart: Performance ranking table
- Data Sources: `trpc.assessors.list` with performance scores

**Section 7 — Workflow Bottleneck Analysis**
- KPIs: Average dwell time per workflow stage, send-back rate by stage, escalation rate
- Chart: Funnel chart of claims through workflow stages
- Data Sources: `generateDwellTimeReport`, workflow audit trail

**Section 8 — AI Accuracy Audit**
- KPIs: KINGA estimate vs. approved amount variance, confidence score distribution, fraud score accuracy
- Chart: Scatter plot of KINGA estimate vs. approved amount
- Data Sources: `ai_assessments`, `claims.approvedAmount`

---

## Deliverable 11 — Implementation Priority Matrix

| Item | Priority | Effort (days) | Impact | Effort vs. Impact |
|---|---|---|---|---|
| Fix sendBackClaim bug | Critical | 1 | Prevents incorrect audit records | High ROI |
| Fix closeForProcessing | Critical | 1 | Audit trail integrity | High ROI |
| Per-claim report dropdown in Review Queue | High | 1 | Full report access in workflow | High ROI |
| Claims Ageing panel | High | 0.5 | SLA visibility | Very High ROI |
| Fraud Funnel in Fraud Alerts tab | High | 0.5 | Portfolio fraud oversight | Very High ROI |
| Fleet Approvals in sidebar | High | 0.5 | Feature discoverability | Very High ROI |
| Portfolio report buttons | High | 1 | Report discoverability | High ROI |
| Structured send-back reason field | Medium | 1 | Audit quality | Medium ROI |
| SLA breach alert component | Medium | 2 | Operational control | Medium ROI |
| Portfolio leakage KPI card | Medium | 0.5 | Financial control | High ROI |
| Assessor performance panel | Medium | 1 | Assessor management | Medium ROI |
| Fleet Approvals badge in sidebar | Low | 0.5 | UX improvement | Low ROI |
| Excel export for Fraud Alerts | Low | 0.5 | Reporting convenience | Low ROI |
| Claim count badges in sidebar | Low | 0.5 | UX improvement | Low ROI |

---

## Deliverable 12 — Cross-Portal Integration Map

| This Portal | Other Portal | Direction | Data Passed | Status | Gap |
|---|---|---|---|---|---|
| Claims Manager | Claims Processor | Receives | Processed claims, AI assessments, assessor evaluations | Working — shared `claims` table | No notification when processor completes |
| Claims Manager | Risk Manager | Bidirectional | Technical approval decisions, send-back requests | Partially working — send-back is broken | `sendBackClaim` calls wrong procedure |
| Claims Manager | Recovery Portal | Feeds | Settled claims trigger recovery case creation | Working — automatic trigger on close | No notification back to claims manager when recovery case is created |
| Claims Manager | Executive Dashboard | Feeds | Portfolio metrics consumed by Executive KPIs | Working — shared analytics procedures | Claims Manager cannot see the same KPIs the Executive sees |
| Claims Manager | Fraud Analytics | Feeds | Fraud-flagged claims visible in Fraud Analytics | Working — shared `claims.fraudRiskScore` | No direct escalation path from Claims Manager to Fraud Manager |
| Claims Manager | Reports Centre | Bidirectional | Report generation and scheduling | Working — Reports Centre is role-aware | 8 of 10 authorised reports are only accessible via Reports Centre, not from within the Claims Manager Portal |
| Claims Manager | Assessor Portal | Feeds | Assessor assignments | Working — `trpc.claims.assignToAssessor` | No feedback loop from assessor back to claims manager |
| Claims Manager | Fleet Manager | Receives | Fleet account approval requests | Working — `FleetManagerApprovalsTab` | Fleet Approvals tab is not linked from sidebar |

---

## Deliverable 13 — Production Readiness Verdict

### Verdict: **Conditional — Not Ready for Go-Live**

The Claims Manager Portal is operationally functional for supervised use in a controlled environment. However, the `sendBackClaim` bug is a production-blocking defect. In a live insurer environment, a claims manager sending a claim back for review would instead trigger an approval action, creating incorrect audit records and potentially advancing claims through the workflow without proper review.

### Readiness Scorecard

| Dimension | Score | Notes |
|---|---|---|
| Navigation completeness | 7/10 | Fleet Approvals not in sidebar |
| Data accuracy | 8/10 | Demo fallbacks are correct pattern; real data queries are sound |
| Workflow completeness | 5/10 | sendBackClaim is broken; closeForProcessing is ambiguous |
| AI intelligence utilisation | 6/10 | Per-claim AI is good; portfolio AI is absent |
| Report coverage | 4/10 | 2 of 10 authorised reports have direct UI entry points |
| Cross-portal integration | 6/10 | Core integrations work; notification triggers are missing |
| Audit trail quality | 5/10 | sendBackClaim creates wrong audit records |
| **Overall** | **5.9/10** | **Conditional — fix critical bugs before go-live** |

### Pre-Go-Live Checklist

- [ ] Fix `sendBackClaim` procedure (Critical — 1 day)
- [ ] Fix `closeForProcessing` procedure (Critical — 1 day)
- [ ] Add per-claim report dropdown to Review Queue (High — 1 day)
- [ ] Add Fleet Approvals to sidebar (High — 0.5 day)
- [ ] Add Claims Ageing panel to dashboard (High — 0.5 day)
- [ ] Verify all 6 DEMO_ fallbacks are not shown to live users (Medium — 0.5 day)

---

*KINGA AutoVerify AI — Claims Manager Portal Audit v1.0*  
*Produced using KINGA Portal Audit Master Prompt v1.1*  
*Audit scope: ClaimsManagerDashboard.tsx, ClaimsManagerComparisonView.tsx, InsurerClaimDetails.tsx, InsurerClaimsTriage.tsx, FleetManagerApprovalsTab.tsx, QMSCompliancePanel.tsx, VehicleStructuralIntelligencePanel.tsx, routers.ts (claims namespace), reportDefinitions.ts, workflow-engine.ts, rbac.ts*
