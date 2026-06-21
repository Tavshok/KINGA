# KINGA AutoVerify AI — Risk Manager Portal Audit v1.0

**Document Type:** Portal Audit Report  
**Portal:** Risk Manager  
**Audit Framework:** KINGA Portal Audit Master Prompt v1.1 (10-Phase, 13 Deliverables)  
**Date:** June 2026  
**Status:** Production Readiness Assessment  

---

## Executive Summary

The Risk Manager Portal is the financial governance and fraud oversight layer of the KINGA platform. The risk manager sits between the claims processor and financial closure, providing technical approval for claims, authorising high-value payments, managing escalations, and consuming portfolio-level risk intelligence. The portal is well-structured and operationally functional, with a five-tab decision dashboard, five intelligence sub-portals, and a dedicated analytics page with six Chart.js visualisations.

**Critical Finding:** The "Reject" action in the Approval Queue dialog has no backend procedure. When a risk manager clicks "Reject," the system shows a toast notification ("Rejection workflow will move claim to disputed status") but does not call any mutation — the claim's workflow state is never updated. This means rejected claims remain in the approval queue indefinitely.

**Top 5 Recommendations:**

1. **[Critical]** Implement a `rejectClaim` procedure that transitions the claim to `disputed` workflow state via the WorkflowEngine, with a mandatory rejection reason recorded in the audit trail.
2. **[High]** Implement a `requestInfo` procedure that records the information request as a structured comment and optionally notifies the assigned claims processor.
3. **[High]** The `risk_manager_portfolio` report key is an alias for `generateFraudSummaryReport` — this is misleading. A dedicated risk manager portfolio report should be implemented that covers technical approval rates, fraud prevention, financial exposure, and workflow bottlenecks.
4. **[High]** The Risk Analytics page (6 Chart.js visualisations) is gated to `tier-enterprise` only. This is a significant intelligence gap for risk managers on lower tiers. Consider making core KPIs available on all tiers.
5. **[Medium]** Add per-claim report buttons (`claim.forensic`, `claim.audit_trail`) to the Approval Queue tab — these are authorised for `risk_manager` but are not surfaced in the dashboard UI.

**Production Readiness Verdict:** **Conditional — Not Ready for Go-Live.** The rejection workflow is non-functional, which means the risk manager cannot formally reject a claim through the system. This must be resolved before go-live.

---

## Deliverable 1 — Navigation Map

### Portal Identity

| Field | Value |
|---|---|
| **Portal Name** | Risk Manager Portal |
| **Primary Role** | `risk_manager` |
| **Route Prefix** | `/insurer-portal/risk-manager` |
| **Entry Component** | `RiskManagerDashboard.tsx` |
| **Lines of Code** | ~750 (RiskManagerDashboard.tsx) + ~1,078 (RiskManagerAnalytics.tsx) |
| **Layout** | `InsurerPortalLayout` with role-scoped sidebar |

### Sidebar Navigation (9 Items across 3 Groups)

| Group | Label | Description | Route | Status |
|---|---|---|---|---|
| Overview | My Dashboard | Approval queue and risk scoring | `/insurer-portal/risk-manager` | Working |
| Decisions | Approval Queue | Claims awaiting technical approval | `/insurer-portal/risk-manager?tab=approval` | Working |
| Decisions | High-Value Claims | Claims above financial threshold | `/insurer-portal/risk-manager?tab=financial` | Working |
| Decisions | Escalations | Claims escalated from processors | `/insurer-portal/risk-manager?tab=escalations` | Working |
| Intelligence | Fraud Analytics | Risk patterns and FCDI flags | `/insurer/fraud-analytics` | Working |
| Intelligence | Exception Hub | Anomalies requiring review | `/insurer-portal/exception-intelligence` | Working |
| Intelligence | Relationship Intelligence | Entity network analysis | `/insurer-portal/relationship-intelligence` | Working |
| Intelligence | Workflow Analytics | Decision times and outcomes | `/insurer-portal/workflow-analytics` | Working |
| Intelligence | Risk Analytics | Own-book motor intelligence | `/insurer-portal/risk-analytics` | **Enterprise tier only** |
| Reports | Reports Centre | Risk and portfolio reports | `/insurer-portal/reports-centre` | Working |

### Dashboard Tab Structure (5 Tabs)

| Tab | Value | Primary Purpose | Data Source |
|---|---|---|---|
| Approval Queue | `approval` | Claims awaiting technical approval | `trpc.claims.byStatus({ status: "technical_approval" })` |
| High-Value Claims | `financial` | Claims above financial threshold | `trpc.claims.getFinancialDecisionQueue` |
| Escalations | `escalations` | Disputed / high-fraud claims | `trpc.claims.getEscalations` |
| Portfolio Oversight | `oversight` | All active claims portfolio view | `trpc.claims.getActiveClaims` |
| Notifications | `notifications` | In-app notification inbox | `NotificationsInbox` component |

### Intelligence Sub-Portals

| Portal | Component | tRPC Namespace | Status |
|---|---|---|---|
| Fraud Analytics | `FraudAnalyticsDashboard.tsx` | `trpc.claims.allForTenant` | Working |
| Exception Intelligence Hub | `ExceptionIntelligenceHub.tsx` | `trpc.exceptionIntelligence.*` | Working |
| Relationship Intelligence | `RelationshipIntelligence.tsx` | `trpc.intelligence.*` | Working |
| Workflow Analytics | `WorkflowAnalyticsDashboard.tsx` | `trpc.workflowAnalytics.*` | Working |
| Risk Analytics | `RiskManagerAnalytics.tsx` | `trpc.analytics.getRiskManagerKPIs` | **Enterprise tier only** |

---

## Deliverable 2 — Orphaned Feature Register

| Feature | Location | Status | Issue |
|---|---|---|---|
| Reject Claim action | `RiskManagerDashboard.tsx:173` | **Broken** | Shows toast but calls no mutation — claim state never updated |
| Request Info action | `RiskManagerDashboard.tsx:177` | **Broken** | Shows toast but calls no mutation — no structured record created |
| `claim.forensic` report | `reportDefinitions.ts:69` | **Authorised but not surfaced** | `risk_manager` is authorised but no button in RiskManagerDashboard |
| `claim.audit_trail` report | `reportDefinitions.ts:71` | **Authorised but not surfaced** | Same — authorised but no UI entry point |
| `portfolio.dwell_time` report | `reportDefinitions.ts:76` | **Authorised but not surfaced** | No button in Risk Manager UI |
| `portfolio.panel_beater_performance` report | `reportDefinitions.ts:77` | **Authorised but not surfaced** | No button in Risk Manager UI |
| `portfolio.fraud_summary` report | `reportDefinitions.ts:80` | **Authorised but not surfaced** | No dedicated button — only accessible via Reports Centre |
| `portfolio.assessor_performance` report | `reportDefinitions.ts:82` | **Authorised but not surfaced** | No button in Risk Manager UI |
| `risk_manager_portfolio` report | `reportDefinitions.ts:83` | **Misleading alias** | Calls `generateFraudSummaryReport` — not a comprehensive risk portfolio report |
| `recovery.performance` report | `reportDefinitions.ts:112` | **Authorised but not surfaced** | No button in Risk Manager UI |
| `recovery.third_party_profiles` report | `reportDefinitions.ts:113` | **Authorised but not surfaced** | No button in Risk Manager UI |
| Risk Analytics page | `RiskManagerAnalytics.tsx` | **Tier-gated** | Requires `tier-enterprise` — unavailable on lower tiers |

---

## Deliverable 3 — Data Lineage Matrix

### Approval Queue Data

| Data Point | tRPC Procedure | DB Table | Notes |
|---|---|---|---|
| Claims in technical_approval | `trpc.claims.byStatus({ status: "technical_approval" })` | `claims` WHERE `workflowState = 'technical_approval'` | Real-time queue |
| Fraud risk score | `claims.fraudRiskScore` | `claims.fraud_risk_score` | From AI assessment pipeline |
| Estimated cost | `claims.estimatedCost` | `claims.estimated_repair_cost` | KINGA AI estimate |
| Approved amount | `claims.approvedAmount` | `claims.approved_amount` | Set by approveClaim |

### Financial Decision Queue Data

| Data Point | tRPC Procedure | DB Table | Notes |
|---|---|---|---|
| High-value claims | `trpc.claims.getFinancialDecisionQueue` | `claims` WHERE `approvedAmount > threshold` | Threshold from automation policy |
| Financial threshold | `getActiveAutomationPolicy` | `automation_policies.requireManagerApprovalAbove` | Default 25,000 USD |

### Portfolio Analytics Data

| Data Point | tRPC Procedure | DB Table | Notes |
|---|---|---|---|
| Risk portfolio analytics | `trpc.claims.getRiskPortfolioAnalytics` | `claims`, `ai_assessments` | Aggregated portfolio metrics |
| Escalated claims | `trpc.claims.getEscalations` | `claims` WHERE `workflowState IN ('disputed', 'manual_review')` OR `fraudRiskScore >= 70` | Fraud + workflow escalations |

### Risk Analytics KPIs (Enterprise Only)

| KPI | SQL Query | DB Tables |
|---|---|---|
| Claims frequency by incident type | Monthly COUNT by `incident_type` | `claims` |
| Avg repair cost by vehicle age | AVG `approved_amount` by age bucket | `claims` |
| Fraud flag rate by incident type | COUNT by `fraud_risk_level` | `claims` |
| TP recovery exposure by month | SUM `quantum_claimed` and `recovered_amount` | `recovery_cases` |
| Repeat offender rate | COUNT repeat TP registrations | `recovery_cases` |
| Claim cycle time | AVG days from `created_at` to `closed_at` | `claims` |

---

## Deliverable 4 — Workflow Intelligence Assessment

### Risk Manager Workflow Position

The risk manager occupies the technical governance gate in the claims workflow. Their primary workflow position is:

```
Under Assessment → Internal Review → [Risk Manager: Technical Approval]
    → Financial Decision ← [Risk Manager: Financial Authorisation]
    → Payment Authorized → Closed
```

The risk manager also manages the escalation path for disputed claims and high-fraud cases.

### Workflow Actions Available

| Action | UI Location | Backend Procedure | Status |
|---|---|---|---|
| Technical Approval | Approval Queue tab | `trpc.claims.approveClaim` | Working |
| Financial Authorisation | High-Value Claims tab | `trpc.claims.financialApproval` | Working |
| Reject Claim | Approval Queue tab | None — toast only | **BROKEN** |
| Request Info | Approval Queue tab | None — toast only | **BROKEN** |
| Re-trigger AI Assessment | Escalations tab | `AiAssessButton` component | Working |
| View Claim Detail | All tabs | Link to comparison view | Working |

### Reject Claim Bug Detail

The `handleSubmit` function in `RiskManagerDashboard.tsx` (line 171) contains:

```typescript
} else if (dialogMode === "reject") {
  toast.info("Rejection workflow will move claim to disputed status.");
  setShowDialog(false);
}
```

No mutation is called. The claim's `workflowState` remains `technical_approval`. The claim will continue to appear in the Approval Queue on every subsequent page load. The correct implementation should call a `rejectClaim` procedure that uses the WorkflowEngine transition `technical_approval → disputed` (which is defined in `WORKFLOW_TRANSITIONS` in `rbac.ts`).

### Request Info Bug Detail

Similarly, the `request_info` dialog mode (line 177) only shows a toast and closes the dialog. No comment is added to the claim, no notification is sent to the processor, and no structured record is created. This means the risk manager has no reliable way to formally request additional information from the claims processor.

### Workflow State Coverage

| Workflow State | Risk Manager Can See? | Risk Manager Can Act? |
|---|---|---|
| `intake_queue` | No (not in sidebar) | No |
| `under_assessment` | Yes (Portfolio Oversight) | View only |
| `internal_review` | Yes (Portfolio Oversight) | Can send back from `technical_approval` |
| `technical_approval` | Yes (Approval Queue) | Yes (approve, reject [broken], request info [broken]) |
| `financial_decision` | Yes (High-Value Claims) | Yes (authorise payment) |
| `payment_authorized` | Yes (Portfolio Oversight) | View only |
| `closed` | Yes (Portfolio Oversight) | View only |
| `disputed` | Yes (Escalations) | Yes (re-trigger AI) |

---

## Deliverable 5 — AI Utilisation Matrix

### AI Outputs Consumed by Risk Manager

| AI Output | Source | Consumed In | How Used |
|---|---|---|---|
| Fraud Risk Score | `claims.fraudRiskScore` | Approval Queue, Escalations | Risk badge, escalation trigger |
| KINGA Estimated Cost | `claims.estimatedCost` | Approval Queue, Comparison View | Cost validation |
| Physics Deviation Score | `ai_assessments.physicsDeviationScore` | Exception Intelligence Hub | Anomaly detection |
| FCDI Score | `ai_assessments` | Exception Intelligence Hub | Fraud composite index |
| Vehicle Structural Intelligence | `trpc.vehicleStructural.getClaimProfile` | Comparison View | ANCAP/CRASH3 safety rating |
| QMS Compliance | `QMSCompliancePanel` | Comparison View | Quality compliance flags |
| Exception Aggregates | `trpc.exceptionIntelligence.getExceptionAggregates` | Exception Hub | System drift detection |
| Actionable Recommendations | `trpc.exceptionIntelligence.getActionableRecommendations` | Exception Hub | AI-generated recommendations |
| Accident Clusters | `trpc.intelligence.getAccidentClusters` | Relationship Intelligence | Geographic fraud clustering |
| Repeat Offender Rate | `analytics.getRiskManagerKPIs` | Risk Analytics (Enterprise) | Portfolio risk KPI |

### AI Outputs NOT Consumed by Risk Manager

| AI Output | Available In | Missing From |
|---|---|---|
| Claims Ageing Analysis | `analytics.getClaimsAgeing` (Executive Dashboard) | Risk Manager Dashboard |
| Executive Alerts | `analytics.getExecutiveAlerts` (Executive Dashboard) | Risk Manager Dashboard |
| Fraud Investigation Funnel | `analytics.getFraudInvestigationFunnel` (Executive Dashboard) | Risk Manager Dashboard |
| Portfolio Leakage Metric | `analytics.getMonthComparison` (Executive Dashboard) | Risk Manager Dashboard |
| Causal Reasoning Narrative | Pipeline Stage 5 | Not surfaced in Risk Manager Dashboard (only in Comparison View) |
| Photo Forensics Summary | `photoForensicsEngine` | Not surfaced in Risk Manager Dashboard |

### AI Intelligence Gap Assessment

The risk manager has access to deep per-claim AI intelligence through the Comparison View, and to portfolio-level intelligence through the Exception Hub and Relationship Intelligence. However, the Risk Analytics page — which provides the most actionable portfolio intelligence (claims frequency trends, fraud rate by incident type, recovery exposure, repeat offender rate) — is gated to `tier-enterprise`. This creates a significant intelligence gap for risk managers on lower tiers.

---

## Deliverable 6 — Report Catalogue Audit

### Per-Claim Reports (Risk Manager Authorised)

| Report Key | Report Name | Generator Function | UI Button Exists? | Status |
|---|---|---|---|---|
| `claim.forensic` | KINGA Forensic Audit | `generateForensicReport` | No | **Authorised but not surfaced** |
| `claim.audit_trail` | Audit Trail | `generateAuditTrailReport` | No | **Authorised but not surfaced** |

### Portfolio Reports (Risk Manager Authorised)

| Report Key | Report Name | Generator Function | UI Button Exists? | Status |
|---|---|---|---|---|
| `portfolio.claims_summary` | Claims Summary | `generateClaimsSummaryReport` | No direct button | Via Reports Centre only |
| `portfolio.dwell_time` | Dwell Time Analysis | `generateDwellTimeReport` | No | **Authorised but not surfaced** |
| `portfolio.panel_beater_performance` | Panel Beater Performance | `generatePanelBeaterPerformanceReport` | No | **Authorised but not surfaced** |
| `portfolio.fraud_summary` | Fraud Summary | `generateFraudSummaryReport` | No direct button | Via Reports Centre only |
| `portfolio.assessor_performance` | Assessor Performance | `generateAssessorPerformanceReport` | No | **Authorised but not surfaced** |
| `risk_manager_portfolio` | Risk Portfolio | `generateFraudSummaryReport` (alias) | Yes (Dashboard header, line 247) | **Working but misleading** |

### Cross-Portal Reports (Risk Manager Authorised)

| Report Key | Report Name | UI Entry Point | Status |
|---|---|---|---|
| `recovery.performance` | Recovery Performance | Reports Centre | Working (via Reports Centre) |
| `recovery.third_party_profiles` | Third-Party Profiles | Reports Centre | Working (via Reports Centre) |
| `executive.claims_trend` | Claims Trend | Reports Centre | Working (via Reports Centre) |
| `executive.financial_exposure` | Financial Exposure | Reports Centre | Working (via Reports Centre) |

### Report Catalogue Summary

Of 11 reports authorised for `risk_manager`, only 1 has a direct UI entry point within the Risk Manager Portal (`risk_manager_portfolio` in the dashboard header). The remaining 10 are accessible only through the Reports Centre. Additionally, the `risk_manager_portfolio` report is an alias for the fraud summary report rather than a comprehensive risk portfolio report.

---

## Deliverable 7 — Missing Intelligence Register

| Opportunity | Data Exists | Visible? | Effort | Impact |
|---|---|---|---|---|
| Claims ageing buckets (0–14, 15–29, 30–59, 60+ days) | Yes — `analytics.getClaimsAgeing` | No (Executive only) | Low | High — SLA and bottleneck visibility |
| Approval queue dwell time | Partial — `workflowAnalytics.getProcessingTimesByStage` | Via Workflow Analytics only | Low | High — queue management |
| Fraud rate trend (month-on-month) | Yes — `analytics.getRiskManagerKPIs` | Enterprise tier only | Low | High — fraud oversight |
| Recovery exposure trend | Yes — `analytics.getRiskManagerKPIs` | Enterprise tier only | Low | High — financial risk visibility |
| Repeat offender rate | Yes — `analytics.getRiskManagerKPIs` | Enterprise tier only | Low | High — fraud prevention |
| Rejection reason tracking | No — no `rejectClaim` procedure | No | Medium | High — governance audit quality |
| Information request tracking | No — no `requestInfo` procedure | No | Medium | High — workflow audit quality |
| Technical approval rate (KINGA vs. approved) | Partial — per-claim only | No portfolio view | Medium | High — AI accuracy validation |
| Assessor accuracy vs. KINGA | Partial — per-claim comparison view | No portfolio trend | Medium | High — assessor management |
| Fraud hotspot map | Partial — accident clusters in Relationship Intelligence | Not in Risk Manager Dashboard | Low | Medium — proactive fraud prevention |
| Panel beater fraud signal trend | Partial — `repair-history.ts` fraud signals | Not surfaced | Medium | Medium — repairer risk management |

---

## Deliverable 8 — Missing Integration Register

| Integration | Should Exist | Currently Exists | Gap |
|---|---|---|---|
| Claims Processor notification on rejection | Risk Manager should notify processor when claim is rejected | No | No `rejectClaim` procedure exists |
| Claims Processor notification on info request | Risk Manager should notify processor when requesting additional information | No | No `requestInfo` procedure exists |
| Executive Dashboard escalation alert | Executive should be notified when risk manager escalates a claim | No | No notification trigger |
| Recovery Portal feedback | Risk Manager should see recovery outcomes for claims they approved | No | No feedback loop from recovery to risk manager |
| Fraud Manager escalation | Risk Manager should be able to escalate directly to Fraud Manager from Escalations tab | No dedicated route | Only available via comment/manual process |
| Automation Policy integration | Risk Manager should be able to view and propose changes to the automation policy (approval thresholds) | No | Automation policy management is admin-only |

---

## Deliverable 9 — Improvement Plan

### Critical Priority

| Item | Effort | Impact | Owner |
|---|---|---|---|
| Implement `rejectClaim` procedure — transitions claim to `disputed` via WorkflowEngine, records rejection reason in audit trail, notifies claims processor | 1 day | Enables formal claim rejection with audit trail | Engineering |
| Implement `requestInfo` procedure — records structured information request as comment, optionally notifies assigned processor | 1 day | Enables formal information requests with audit trail | Engineering |

### High Priority

| Item | Effort | Impact | Owner |
|---|---|---|---|
| Replace `risk_manager_portfolio` alias with dedicated risk portfolio report covering technical approval rates, fraud prevention, financial exposure, and workflow bottlenecks | 2 days | Comprehensive risk portfolio intelligence | Engineering |
| Add per-claim report buttons (`claim.forensic`, `claim.audit_trail`) to Approval Queue tab | 0.5 day | Report access within workflow | Engineering |
| Add Claims Ageing panel to Risk Manager Dashboard | 0.5 day | SLA and bottleneck visibility | Engineering |
| Make core Risk Analytics KPIs available on all tiers (not just Enterprise) | 1 day | Portfolio intelligence for all risk managers | Engineering/Product |
| Add fraud rate trend chart to Risk Manager Dashboard | 1 day | Fraud oversight without navigating to Risk Analytics | Engineering |

### Medium Priority

| Item | Effort | Impact | Owner |
|---|---|---|---|
| Add portfolio report buttons (dwell_time, fraud_summary, panel_beater_performance) to dashboard | 1 day | Report discoverability | Engineering |
| Add recovery exposure KPI to dashboard header | 0.5 day | Financial risk visibility | Engineering |
| Add Fraud Investigation Funnel to Risk Manager Dashboard | 0.5 day | Portfolio fraud oversight | Engineering |
| Add notification trigger when risk manager rejects or requests info | 1 day | Workflow communication | Engineering |

### Low Priority

| Item | Effort | Impact | Owner |
|---|---|---|---|
| Add claim count badges to sidebar navigation items | 0.5 day | UX improvement | Engineering |
| Add export to Excel for Portfolio Oversight tab | 0.5 day | Reporting convenience | Engineering |
| Add automation policy view (read-only) to Risk Manager sidebar | 1 day | Policy transparency | Engineering |

---

## Deliverable 10 — Portal Report Specification

### Risk Manager Portfolio Report — Ideal Design

**Purpose:** Provide the risk manager with a comprehensive monthly risk intelligence report covering technical approval decisions, fraud prevention performance, financial exposure, workflow efficiency, and portfolio anomalies.

**Section 1 — Executive Summary**
- KPIs: Total claims reviewed, approval rate, rejection rate, fraud prevention rate, average approval time
- AI Narrative: LLM-generated summary of the month's key risk trends and anomalies
- Data Sources: `claims`, `ai_assessments`, workflow audit trail

**Section 2 — Technical Approval Performance**
- KPIs: Approval queue volume, average dwell time, approval rate by claim type, send-back rate
- Chart: Month-on-month approval volume bar chart
- Data Sources: `claims` WHERE `workflowState = 'technical_approval'`, workflow audit trail

**Section 3 — Fraud Intelligence**
- KPIs: Fraud flag rate by incident type, FCDI score distribution, confirmed fraud count, prevented loss value
- Chart: Fraud rate trend line chart, fraud rate by incident type bar chart
- Data Sources: `claims.fraudRiskScore`, `ai_assessments.fraudRiskLevel`

**Section 4 — Financial Exposure**
- KPIs: Total reserves, total approved, high-value claims count, average claim value
- Chart: Financial exposure by month, high-value claims distribution
- Data Sources: `claims.approvedAmount`, `claims.estimatedCost`, `analytics.getRiskManagerKPIs`

**Section 5 — Recovery Exposure**
- KPIs: Total TP quantum claimed, total recovered, recovery rate, repeat offender count
- Chart: Recovery exposure trend, repeat offender rate
- Data Sources: `recovery_cases`, `analytics.getRiskManagerKPIs`

**Section 6 — Workflow Bottleneck Analysis**
- KPIs: Average dwell time per stage, escalation rate, rejection rate, send-back rate
- Chart: Funnel chart of claims through workflow stages
- Data Sources: `workflowAnalytics.getProcessingTimesByStage`, `workflowAnalytics.getBottlenecks`

**Section 7 — Exception Intelligence Summary**
- KPIs: Exception count by type, system drift score, actionable recommendations count
- Chart: Exception trend by type
- Data Sources: `trpc.exceptionIntelligence.*`

---

## Deliverable 11 — Implementation Priority Matrix

| Item | Priority | Effort (days) | Impact | Effort vs. Impact |
|---|---|---|---|---|
| Implement `rejectClaim` procedure | Critical | 1 | Enables formal rejection with audit trail | High ROI |
| Implement `requestInfo` procedure | Critical | 1 | Enables formal info requests | High ROI |
| Dedicated risk portfolio report | High | 2 | Comprehensive risk intelligence | High ROI |
| Per-claim report buttons in Approval Queue | High | 0.5 | Report access in workflow | Very High ROI |
| Claims Ageing panel in dashboard | High | 0.5 | SLA visibility | Very High ROI |
| Core Risk Analytics on all tiers | High | 1 | Portfolio intelligence for all | High ROI |
| Fraud rate trend chart in dashboard | High | 1 | Fraud oversight | High ROI |
| Portfolio report buttons | Medium | 1 | Report discoverability | Medium ROI |
| Recovery exposure KPI | Medium | 0.5 | Financial risk visibility | High ROI |
| Fraud Investigation Funnel | Medium | 0.5 | Portfolio fraud oversight | High ROI |
| Notification triggers | Medium | 1 | Workflow communication | Medium ROI |
| Sidebar claim count badges | Low | 0.5 | UX improvement | Low ROI |
| Excel export for Portfolio Oversight | Low | 0.5 | Reporting convenience | Low ROI |
| Automation policy view | Low | 1 | Policy transparency | Low ROI |

---

## Deliverable 12 — Cross-Portal Integration Map

| This Portal | Other Portal | Direction | Data Passed | Status | Gap |
|---|---|---|---|---|---|
| Risk Manager | Claims Processor | Receives | Claims in `internal_review` → `technical_approval` | Working — shared `claims` table | No notification when processor submits claim for technical approval |
| Risk Manager | Claims Manager | Bidirectional | Technical approval decisions, send-back requests | Working — shared workflow | No notification to claims manager when risk manager approves |
| Risk Manager | Executive Dashboard | Feeds | Portfolio risk metrics consumed by Executive KPIs | Working — shared analytics | Risk Manager cannot see the same KPIs the Executive sees without Enterprise tier |
| Risk Manager | Recovery Portal | Feeds | Approved claims trigger recovery case creation | Working — automatic trigger | No feedback loop from recovery to risk manager |
| Risk Manager | Fraud Analytics | Bidirectional | Fraud-flagged claims visible in Fraud Analytics | Working — shared `claims.fraudRiskScore` | No direct escalation path from Risk Manager to Fraud Manager |
| Risk Manager | Exception Intelligence Hub | Consumes | AI-generated anomalies and recommendations | Working — `trpc.exceptionIntelligence.*` | Exception Hub is not surfaced in Risk Manager Dashboard header |
| Risk Manager | Relationship Intelligence | Consumes | Entity network analysis | Working — `trpc.intelligence.*` | Not surfaced in Risk Manager Dashboard |
| Risk Manager | Workflow Analytics | Consumes | Processing times, bottlenecks, SLA compliance | Working — `trpc.workflowAnalytics.*` | Not surfaced in Risk Manager Dashboard |
| Risk Manager | Reports Centre | Bidirectional | Report generation and scheduling | Working — Reports Centre is role-aware | 10 of 11 authorised reports only accessible via Reports Centre |

---

## Deliverable 13 — Production Readiness Verdict

### Verdict: **Conditional — Not Ready for Go-Live**

The Risk Manager Portal is operationally functional for the approval and financial authorisation workflows. However, the rejection workflow is non-functional — a risk manager cannot formally reject a claim through the system. In a live insurer environment, this means claims that should be rejected will remain in the approval queue indefinitely, creating workflow blockages and incorrect audit records.

### Readiness Scorecard

| Dimension | Score | Notes |
|---|---|---|
| Navigation completeness | 8/10 | Comprehensive sidebar with 9 items |
| Data accuracy | 8/10 | Real-time queue data; analytics are sound |
| Workflow completeness | 5/10 | Reject and Request Info are non-functional |
| AI intelligence utilisation | 7/10 | Strong per-claim and exception intelligence; portfolio AI tier-gated |
| Report coverage | 3/10 | 1 of 11 authorised reports has direct UI entry point |
| Cross-portal integration | 7/10 | Core integrations work; notification triggers are missing |
| Audit trail quality | 5/10 | Rejection creates no audit record |
| **Overall** | **6.1/10** | **Conditional — fix critical bugs before go-live** |

### Pre-Go-Live Checklist

- [ ] Implement `rejectClaim` procedure (Critical — 1 day)
- [ ] Implement `requestInfo` procedure (Critical — 1 day)
- [ ] Add per-claim report buttons to Approval Queue (High — 0.5 day)
- [ ] Add Claims Ageing panel to dashboard (High — 0.5 day)
- [ ] Replace `risk_manager_portfolio` alias with dedicated report (High — 2 days)

---

*KINGA AutoVerify AI — Risk Manager Portal Audit v1.0*  
*Produced using KINGA Portal Audit Master Prompt v1.1*  
*Audit scope: RiskManagerDashboard.tsx, RiskManagerAnalytics.tsx, FraudAnalyticsDashboard.tsx, ExceptionIntelligenceHub.tsx, RelationshipIntelligence.tsx, WorkflowAnalyticsDashboard.tsx, routers.ts (claims namespace, analytics namespace), reportDefinitions.ts, workflow-engine.ts, rbac.ts*
