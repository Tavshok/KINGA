# KINGA AutoVerify AI — Claims Manager Portal Reconciliation Audit v2.0

**Document Type:** Second-Pass Reconciliation Audit  
**Portal:** Claims Manager Portal  
**Audit Framework:** KINGA Claims Manager Reconciliation Audit Prompt v2.0 (10-Phase, 10 Deliverables)  
**Date:** June 2026  
**Preceding Document:** KINGA Claims Manager Portal Audit v1.0  
**Status:** Claims Operations Command Centre Assessment  

---

## Executive Summary

This document is a second-pass reconciliation audit of the KINGA Claims Manager Portal. It does not repeat the original audit. Its purpose is to validate the original findings against the current codebase, challenge assumptions that were made without full operational context, reassess priorities from a claims operations perspective, and produce a revised roadmap for evolving the portal into a Claims Operations Command Centre.

The reconciliation confirms that the most consequential finding of the original audit — the `sendBackClaim` defect — has been resolved. A dedicated `sendBackClaim` procedure now exists in `server/routers.ts` at line 3206, using the WorkflowEngine to perform the correct state transitions (`technical_approval → internal_review` and `financial_decision → technical_approval`) with mandatory comments and full audit trail recording. The frontend has been updated to call `trpc.claims.sendBackClaim` directly.

The reconciliation also identifies a significant intelligence gap that was underweighted in the original audit: the Claims Manager Dashboard makes **zero calls** to the analytics router. The Executive Dashboard calls eight analytics procedures (`getKPIs`, `getAssessorPerformance`, `getPanelBeaterAnalytics`, `getCostSavingsTrends`, `getWorkflowBottlenecks`, `getFinancialOverview`, `getMonthComparison`, `getExecutiveAlerts`), all of which are directly relevant to claims operations management. The Claims Manager — who is operationally responsible for throughput, SLA compliance, workforce management, and financial leakage — has no access to any of this intelligence within their portal.

**Revised Top 5 Recommendations:**

1. **[High]** Add a Claims Operations Intelligence Bar above the tab structure, consuming `getClaimsAgeing`, `getWorkflowBottlenecks`, `getCriticalAlerts`, and `getFraudInvestigationFunnel` — all of which already exist in the analytics router and are accessible to `claims_manager` role.
2. **[High]** Add a Workforce Intelligence panel to the Intake Queue tab, consuming `getAssessorPerformance` and `workflowAnalytics.getUserProductivity` — both procedures exist and return the data needed for assessor and processor workload management.
3. **[High]** Fix `closeForProcessing` — it currently calls `trpc.claims.approveClaim` with `selectedQuoteId: 0`, which creates an ambiguous audit record. A dedicated `closeForProcessing` procedure should record the closure intent explicitly.
4. **[High]** Add per-claim report buttons for `claim.cost_comparison`, `claim.repair_decision`, `claim.audit_trail`, and `claim.forensic` to the Review Queue tab — all four are authorised for `claims_manager` but have no UI entry point within the portal.
5. **[Medium]** Add Fleet Approvals to the sidebar navigation — the tab is fully functional but is not discoverable without prior knowledge.

**Revised Production Readiness Verdict:** **Conditional — Operationally Viable with Intelligence Gaps.** The critical `sendBackClaim` defect has been resolved. The portal can support supervised claims operations, but the absence of portfolio intelligence (ageing, bottlenecks, workforce, fraud funnel) means the Claims Manager is operating without the command centre visibility their role requires. This is not a blocker for go-live, but it is a significant operational deficiency that should be addressed in the first post-launch sprint.

---

## Deliverable 1 — Validated Findings Register

### Phase 1: Audit Validation

The following table reviews every material finding from the original audit and determines its current validity.

| Finding | Original Severity | Valid | Partially Valid | Invalid | Revised Priority | Reason |
|---|---|---|---|---|---|---|
| `sendBackClaim` calls `approveClaim` (broken) | Critical | — | — | **Invalid (Resolved)** | Closed | `trpc.claims.sendBackClaim` procedure now exists at routers.ts:3206. Frontend wired correctly at ClaimsManagerDashboard.tsx:269. WorkflowEngine transitions are correct. |
| `closeForProcessing` calls `approveClaim` with `selectedQuoteId: 0` | Critical | **Valid** | — | — | **High** | ClaimsManagerDashboard.tsx:252 still defines `closeForProcessing = trpc.claims.approveClaim.useMutation(...)`. The audit trail records this as an approval action, not a closure. |
| Fleet Approvals tab not in sidebar | High | **Valid** | — | — | **High** | The Fleet Approvals tab is functional but absent from sidebar navigation. Discoverability remains an issue. |
| Claims Ageing visibility absent | High | **Valid** | — | — | **High** | `analytics.getClaimsAgeing` exists and returns 4-bucket data (0–7, 8–14, 15–30, 30+ days) with count and value per bucket. Not consumed by ClaimsManagerDashboard. |
| Fraud Funnel visibility absent | High | **Valid** | — | — | **High** | `analytics.getFraudInvestigationFunnel` exists and returns a 5-stage funnel (All Claims → Flagged → High Risk → Under Investigation → Repudiated) with prevented loss value. Not consumed by ClaimsManagerDashboard. |
| Report discoverability gap (8 of 10 reports not surfaced) | High | **Valid** | — | — | **High** | Confirmed: only `portfolio.claims_summary` (dashboard header) and `claim.assessment` (Review Queue) have UI buttons. 8 authorised reports have no entry point within the portal. |
| Workflow bottleneck identification absent | Medium | **Valid** | — | — | **High** | `analytics.getWorkflowBottlenecks` exists and returns per-state count, average days in state, and maximum days in state from the `workflow_audit_trail` table. Not consumed by ClaimsManagerDashboard. |
| Recovery visibility absent | Medium | **Partially Valid** | — | — | **Medium** | `trpc.recovery.getKPIs` IS consumed by ClaimsManagerDashboard (line 167) and renders a recovery summary bar (Open Cases, Demand Sent, Settled, Recovery Rate, Deadline Alerts). Original finding overstated the gap. The remaining gap is the absence of ageing and recovery-eligible claim identification. |
| Notification gaps | Medium | **Valid** | — | — | **Medium** | No notification triggers exist for: recovery case creation, risk manager escalation, assessor assignment confirmation, SLA breach, or financial threshold proximity. |
| Portfolio AI intelligence absent | Medium | **Valid** | — | — | **High** | ClaimsManagerDashboard makes zero calls to the analytics router. The Executive Dashboard calls eight analytics procedures. The Claims Manager — who is operationally responsible for portfolio performance — has no access to portfolio-level AI intelligence within their portal. |
| Assessor performance not surfaced | Medium | **Valid** | — | — | **High** | `analytics.getAssessorPerformance` exists and returns performance score, accuracy score, total assessments, and average completion time per assessor. Not consumed by ClaimsManagerDashboard. |
| SLA compliance data absent | Medium | **Valid** | — | — | **High** | `workflowAnalytics.getSLACompliance` exists with configurable SLA targets per workflow state. Not consumed by ClaimsManagerDashboard. |
| Processor workload data absent | Medium | **Valid** | — | — | **High** | `workflowAnalytics.getUserProductivity` exists and returns transition count and claims handled per user per role. Not consumed by ClaimsManagerDashboard. |

### Summary of Validation

Of the 13 findings reviewed, 1 has been resolved (`sendBackClaim`), 1 was partially overstated (recovery visibility), and 11 remain valid. Three findings that were rated Medium in the original audit have been upgraded to High in this reconciliation, based on the operational significance of the missing intelligence for a claims operations command centre.

---

## Deliverable 2 — Operational Intelligence Gap Register

### Phase 2: Operational Intelligence Assessment

The following matrix assesses whether the portal provides sufficient intelligence for a Claims Manager to answer the core operational questions of their role.

#### Throughput Intelligence

| Capability | Available | Partial | Missing | Recommendation |
|---|---|---|---|---|
| How many claims are entering the system? | Yes — `getManagerOverview.kpis.totalClaims` | — | — | Already displayed in dashboard KPI cards |
| How many are being completed? | Yes — `getManagerOverview.kpis.completedClaims` | — | — | Already displayed in dashboard KPI cards |
| What is the backlog? | — | Partial — Intake Queue tab shows count | — | Add a backlog KPI card showing intake + active counts with trend vs. prior period |
| Intake trend (week-on-week) | — | — | Missing | `analytics.getMonthComparison` returns month-on-month data; a week-on-week intake trend is not available |
| Completion rate trend | — | Partial — single percentage shown | — | Add trend arrow (up/down vs. prior period) to completion rate KPI card |

#### Workflow Intelligence

| Capability | Available | Partial | Missing | Recommendation |
|---|---|---|---|---|
| Which workflow stages are slowing down? | — | — | Missing | `analytics.getWorkflowBottlenecks` returns per-state count and avg/max days. Not consumed by ClaimsManagerDashboard. Add a Workflow Bottleneck panel. |
| Which claims are ageing? | — | — | Missing | `analytics.getClaimsAgeing` returns 4-bucket ageing data. Not consumed by ClaimsManagerDashboard. Add a Claims Ageing panel. |
| Where are bottlenecks occurring? | — | — | Missing | `workflowAnalytics.getBottlenecks` returns bottleneck state with avg hours. Not consumed by ClaimsManagerDashboard. |
| Claims stuck in workflow (7+ days) | — | — | Missing | `analytics.getCriticalAlerts` returns `stuckClaims` (claims not updated in 7+ days). Not consumed by ClaimsManagerDashboard. |
| Claims awaiting approval | Partial — Review Queue tab shows list | — | — | Add count badge to Review Queue tab label |
| SLA compliance per stage | — | — | Missing | `workflowAnalytics.getSLACompliance` returns compliance % per workflow state. Not consumed. |

#### Workforce Intelligence

| Capability | Available | Partial | Missing | Recommendation |
|---|---|---|---|---|
| Which processors are overloaded? | — | — | Missing | `workflowAnalytics.getUserProductivity` returns claims handled per user. Not consumed by ClaimsManagerDashboard. |
| Which assessors are overloaded? | — | — | Missing | `analytics.getAssessorPerformance` returns total assessments and avg completion time per assessor. Not consumed by ClaimsManagerDashboard. |
| Which staff members require intervention? | — | — | Missing | No combined workload view exists. Requires surfacing `getUserProductivity` + `getAssessorPerformance` in a single Workforce panel. |
| Assessor accuracy scores | — | — | Missing | `analytics.getAssessorPerformance` returns `accuracyScore` per assessor. Not consumed by ClaimsManagerDashboard. |
| Assessor tier distribution | — | — | Missing | `analytics.getAssessorPerformance` returns `tier` per assessor. Not consumed. |

#### Fraud Intelligence

| Capability | Available | Partial | Missing | Recommendation |
|---|---|---|---|---|
| Which claims require investigation? | Partial — Fraud Alerts tab shows list | — | — | Already available. Add count badge to Fraud Alerts tab label. |
| Is fraud increasing or decreasing? | — | — | Missing | `analytics.getFraudInvestigationFunnel` returns funnel counts but no trend. Add trend indicator. |
| Are fraud investigations effective? | — | — | Missing | `analytics.getFraudInvestigationFunnel` returns `conversionRate` (flagged → repudiated %). Not consumed by ClaimsManagerDashboard. |
| Prevented loss value | — | — | Missing | `analytics.getFraudInvestigationFunnel` returns `preventedLoss`. Not consumed. |
| High fraud risk claims in approval queue | — | — | Missing | `analytics.getCriticalAlerts` returns `highFraudRisk` claims in active states. Not consumed. |

#### Financial Intelligence

| Capability | Available | Partial | Missing | Recommendation |
|---|---|---|---|---|
| Are approvals aligned with KINGA estimates? | Partial — per-claim comparison view | — | — | No portfolio-level variance metric. `analytics.getCostSavingsTrends` returns total savings but not variance distribution. |
| Is leakage increasing? | — | — | Missing | `analytics.getMonthComparison` returns month-on-month approved vs. estimated. Not consumed by ClaimsManagerDashboard. |
| Are recoveries being pursued? | Partial — recovery KPI bar exists | — | — | Recovery rate and case counts are shown. Ageing recoveries and recovery-eligible claims are not shown. |
| High-value claims pending approval | — | — | Missing | `analytics.getCriticalAlerts` returns `highValuePending` (>R10,000 in technical_approval or financial_decision). Not consumed. |
| Total savings identified (portfolio) | Yes — KPI card | — | — | Already displayed. |

#### Repair Network Intelligence

| Capability | Available | Partial | Missing | Recommendation |
|---|---|---|---|---|
| Which panel beaters perform best? | — | — | Missing | `analytics.getPanelBeaterAnalytics` returns performance ranking. Not consumed by ClaimsManagerDashboard. |
| Which panel beaters generate excessive variance? | — | — | Missing | `analytics.getPanelBeaterAnalytics` returns avg quote amount vs. KINGA estimate. Not consumed. |
| Which panel beaters create delays? | — | — | Missing | `analytics.getPanelBeaterAnalytics` returns avg repair time days. Not consumed. |
| Panel beater report | Authorised | — | — | `portfolio.panel_beater_performance` report is authorised for `claims_manager` but has no UI button in the portal. |

---

## Deliverable 3 — Dashboard Enhancement Blueprint

### Phase 3: Claims Manager Dashboard Enhancement Review

The existing six-tab structure (Intake Queue, Review Queue, Active Claims, Fraud Alerts, Processed Claims, Fleet Approvals) is well-designed and should be preserved in full. The following intelligence panels should be added **above** the tab structure, forming a Claims Operations Intelligence Bar that gives the Claims Manager an immediate portfolio-level view before they drill into individual tabs.

| Panel | Data Exists? | Backend Exists? | Effort | Operational Value |
|---|---|---|---|---|
| **Claims Ageing** — 4-bucket bar chart (0–7, 8–14, 15–30, 30+ days) with count and value | Yes — `analytics.getClaimsAgeing` returns 4 buckets with count and value | Yes — `analyticsRoleProcedure` accessible to `claims_manager` | Low (0.5 day) | **Very High** — immediate SLA breach visibility |
| **Workflow Bottlenecks** — per-stage count and avg days, sorted by avg days descending | Yes — `analytics.getWorkflowBottlenecks` returns per-state count, avg days, max days | Yes — `analyticsRoleProcedure` accessible to `claims_manager` | Low (0.5 day) | **Very High** — identifies where claims are accumulating |
| **SLA Breaches** — count of claims exceeding SLA target per stage | Yes — `workflowAnalytics.getSLACompliance` returns compliance % per stage | Yes — `protectedProcedure` accessible to all authenticated users | Medium (1 day) | **High** — direct SLA management tool |
| **Team Workload** — assessor performance ranking (performance score, accuracy, total assessments) + processor productivity (claims handled per user) | Yes — `analytics.getAssessorPerformance` + `workflowAnalytics.getUserProductivity` | Yes — both procedures exist | Medium (1 day) | **High** — workforce management visibility |
| **Fraud Funnel** — 5-stage funnel (All → Flagged → High Risk → Investigated → Repudiated) with conversion rate and prevented loss | Yes — `analytics.getFraudInvestigationFunnel` returns all 5 stages | Yes — `analyticsRoleProcedure` accessible to `claims_manager` | Low (0.5 day) | **High** — fraud oversight without leaving portal |
| **Recovery Overview** — already partially implemented (recovery KPI bar at line 455) | Yes — `trpc.recovery.getKPIs` already consumed | Yes — already wired | Enhancement only (0.5 day) | **Medium** — add recovery-eligible claim count and ageing |
| **Leakage Metrics** — month-on-month approved vs. KINGA estimate, leakage rate | Yes — `analytics.getMonthComparison` returns month-on-month data | Yes — `analyticsRoleProcedure` accessible to `claims_manager` | Low (0.5 day) | **High** — financial leakage control |
| **Escalation Alerts** — high-value pending, high fraud risk in active states, disputed, stuck | Yes — `analytics.getCriticalAlerts` returns all 4 alert types | Yes — `analyticsRoleProcedure` accessible to `claims_manager` | Low (0.5 day) | **Very High** — immediate escalation visibility |

### Panel Implementation Notes

The Claims Operations Intelligence Bar should be rendered as a collapsible section above the tab structure, defaulting to expanded. It should not replace the tab structure — it should provide the portfolio view that allows the Claims Manager to decide which tab to navigate to. Each panel should include a direct action link to the relevant tab (e.g., the Claims Ageing panel should link to the Active Claims tab filtered by ageing bucket).

---

## Deliverable 4 — Workflow Command Centre Assessment

### Phase 4: Workflow Command Centre Assessment

A true workflow command centre requires the Claims Manager to be able to identify, at a glance, every category of claim that requires their attention. The following table assesses the current state.

| Workflow Requirement | Currently Identifiable? | Data Source | Gap | Recommendation |
|---|---|---|---|---|
| Claims over SLA | No | `workflowAnalytics.getSLACompliance` | Not consumed by ClaimsManagerDashboard | Add SLA Breaches panel above tab structure |
| Claims requiring escalation | Partial — Fraud Alerts tab shows fraud-flagged claims | `analytics.getCriticalAlerts` returns high-value, high-fraud, disputed, stuck | `getCriticalAlerts` not consumed | Add Escalation Alerts panel above tab structure |
| Claims awaiting approval | Partial — Review Queue tab shows list | `workflowQueries.getClaimsByStatus` | No count badge on tab label; no summary count in overview | Add count badge to Review Queue tab label |
| Claims awaiting assessment | Partial — Active Claims tab shows list | `claims.getActiveClaims` | No filter for `under_assessment` state specifically | Add `under_assessment` count to Active Claims tab label |
| Claims awaiting repair | Partial — Active Claims tab shows list | `claims.getActiveClaims` | No filter for `repair_assigned` state | Add `repair_assigned` count to Active Claims tab label |
| Claims awaiting customer response | No | No dedicated procedure | No `awaiting_customer` workflow state exists | Not applicable — KINGA does not have a customer response workflow state |
| Claims stuck in workflow | No | `analytics.getCriticalAlerts` returns `stuckClaims` (7+ days without update) | Not consumed | Add stuck claims count to Escalation Alerts panel |

### Minimum Enhancements for Command Centre Functionality

The minimum set of enhancements required to make the Claims Manager Portal function as a true command centre are:

1. Add the Escalation Alerts panel (consuming `getCriticalAlerts`) — this provides immediate visibility of high-value pending, high fraud risk, disputed, and stuck claims in a single view.
2. Add the Claims Ageing panel (consuming `getClaimsAgeing`) — this provides SLA breach visibility at the portfolio level.
3. Add the Workflow Bottlenecks panel (consuming `getWorkflowBottlenecks`) — this identifies which stages are accumulating claims.
4. Add count badges to the Review Queue, Fraud Alerts, and Fleet Approvals tab labels — this provides at-a-glance queue depth without requiring tab navigation.

These four enhancements can be implemented in approximately 2 days of engineering effort and would transform the portal from a queue management tool into a genuine command centre.

---

## Deliverable 5 — Workload Intelligence Assessment

### Phase 5: Workload Intelligence Assessment

#### Processor Workload

| Metric | Available? | Source | Gap |
|---|---|---|---|
| Claims assigned per processor | Partial | `workflowAnalytics.getUserProductivity` returns `claimsHandled` per `userId` where `userRole = 'claims_processor'` | Procedure exists but is not consumed by ClaimsManagerDashboard |
| Claims completed per processor | Partial | `workflowAnalytics.getUserProductivity` returns `transitionCount` (workflow transitions completed) | `transitionCount` is a proxy for productivity, not a direct "claims completed" count |
| Average cycle time per processor | No | No procedure | `workflowAnalytics.getProcessingTimesByStage` returns per-stage averages but not per-user averages | Add per-user cycle time to `getUserProductivity` |

#### Assessor Workload

| Metric | Available? | Source | Gap |
|---|---|---|---|
| Open assessments per assessor | No | `analytics.getAssessorPerformance` returns `totalAssessments` (lifetime total, not open) | No "currently open" count per assessor |
| Assessment turnaround | Yes | `analytics.getAssessorPerformance` returns `avgCompletionTime` (hours) | Available but not consumed by ClaimsManagerDashboard |
| Accuracy scores | Yes | `analytics.getAssessorPerformance` returns `accuracyScore` | Available but not consumed by ClaimsManagerDashboard |
| Performance tier | Yes | `analytics.getAssessorPerformance` returns `tier` (standard/senior/specialist) | Available but not consumed by ClaimsManagerDashboard |

#### Team Capacity

| Metric | Available? | Source | Gap |
|---|---|---|---|
| Open claims (portfolio total) | Yes | `getManagerOverview.kpis.totalClaims` | Already displayed in KPI cards |
| Available staff | No | No procedure | User availability is not tracked in the KINGA schema |
| Average workload per staff member | Partial | `workflowAnalytics.getUserProductivity` returns claims handled per user | Not consumed; no "current open" count per user |

#### Workload Intelligence Recommendation

The most actionable enhancement for workload intelligence is a **Workforce Panel** in the Intake Queue tab (where assignment decisions are made). This panel should display:
- Assessor ranking by current workload (total assessments, accuracy score, avg completion time, tier)
- Processor productivity (claims handled in current period, transition count)

Both data sources exist. The panel would allow the Claims Manager to make informed assignment decisions rather than assigning blindly. The `analytics.getAssessorPerformance` procedure is already called by the Executive Dashboard — the Claims Manager simply needs access to the same data within their own portal.

---

## Deliverable 6 — Recovery Oversight Assessment

### Phase 6: Recovery Oversight Assessment

The original audit overstated the recovery visibility gap. The Claims Manager Dashboard already consumes `trpc.recovery.getKPIs` and renders a recovery summary bar showing: Open Cases, Demand Sent, Settled, Recovery Rate, and Deadline Alerts. This is a meaningful starting point.

The remaining gaps are:

| Question | Currently Answerable? | Gap | Recommendation |
|---|---|---|---|
| How many claims are recovery eligible? | No | The recovery KPI bar shows open recovery cases but not the count of claims that are eligible for recovery but do not yet have a recovery case | Add a "Recovery Eligible" count to the recovery bar — claims that are `closed` with a third-party liability flag but no recovery case yet |
| What is the recovery value? | Partial — `recoveryKPIs.totalRecovered` is available via `getKPIs` but not displayed | The recovery bar shows rate and case counts but not the total quantum | Add total recovered amount and total settlement quantum to the recovery bar |
| What is the recovery success rate? | Yes — `recoveryKPIs.recoveryRate` is displayed | — | Already addressed |
| Which recoveries are ageing? | No | No ageing data in `getKPIs` | Add `approachingDeadlines` count (already returned by `getKPIs`) as a prominent alert in the recovery bar |

The recovery bar should be enhanced rather than replaced. The recommended additions (recovery eligible count, total quantum, approaching deadlines alert) can be implemented without creating a separate Recovery Portal within the Claims Manager Dashboard. The existing `trpc.recovery.getKPIs` already returns `approachingDeadlines` and `totalRecovered` — these simply need to be surfaced in the UI.

---

## Deliverable 7 — Report Accessibility Matrix

### Phase 7: Report Accessibility Review

All 11 reports authorised for `claims_manager` are reviewed below. The recommended access point reflects where the report is most operationally useful, not just where it is technically accessible.

| Report | Current Access | Recommended Access | Reason |
|---|---|---|---|
| `claim.assessment` | Review Queue tab (button exists) | **Review Queue tab** — keep as-is | Per-claim report; correct placement |
| `claim.cost_comparison` | Reports Centre only | **Review Queue tab** — add button alongside `claim.assessment` | Per-claim report; directly supports approval decision |
| `claim.repair_decision` | Reports Centre only | **Review Queue tab** — add button alongside `claim.assessment` | Per-claim report; directly supports repair authorisation decision |
| `claim.audit_trail` | Reports Centre only | **Review Queue tab** — add button alongside `claim.assessment` | Per-claim report; governance and compliance use |
| `claim.forensic` | Reports Centre only | **Review Queue tab** — add button alongside `claim.assessment` | Per-claim report; fraud investigation support |
| `portfolio.claims_summary` | Dashboard header (button exists) | **Dashboard header** — keep as-is | Portfolio report; correct placement |
| `portfolio.dwell_time` | Reports Centre only | **Dashboard Actions** — add to a "Portfolio Reports" dropdown in the dashboard header | Portfolio report; directly supports SLA management |
| `portfolio.panel_beater_performance` | Reports Centre only | **Dashboard Actions** — add to "Portfolio Reports" dropdown | Portfolio report; directly supports repair network management |
| `portfolio.fraud_summary` | Reports Centre only | **Dashboard Actions** — add to "Portfolio Reports" dropdown | Portfolio report; directly supports fraud oversight |
| `portfolio.assessor_performance` | Reports Centre only | **Dashboard Actions** — add to "Portfolio Reports" dropdown | Portfolio report; directly supports assessor management |
| `risk_manager_portfolio` | Reports Centre only | **Reports Centre** — keep | This report is a risk manager portfolio report; its presence in the `claims_manager` authorisation list is a naming ambiguity. It is not a claims manager operational report. |
| `recovery.case_summary` | Reports Centre only | **Reports Centre** — keep | Per-recovery-case report; better accessed from Recovery Portal |
| `executive.claims_trend` | Reports Centre only | **Reports Centre** — keep | Executive-level trend report; appropriate for Reports Centre |
| `executive.financial_exposure` | Reports Centre only | **Reports Centre** — keep | Executive-level financial report; appropriate for Reports Centre |

### Implementation Approach

The Review Queue tab should have a report dropdown button (similar to the existing `claim.assessment` button) that expands to show `claim.cost_comparison`, `claim.repair_decision`, `claim.audit_trail`, and `claim.forensic`. The dashboard header should have a "Portfolio Reports" dropdown alongside the existing `portfolio.claims_summary` button, containing `portfolio.dwell_time`, `portfolio.panel_beater_performance`, `portfolio.fraud_summary`, and `portfolio.assessor_performance`.

---

## Deliverable 8 — Actionable Intelligence Assessment

### Phase 8: Actionable Intelligence Assessment

The following table assesses each existing dashboard widget for its decision support and action-enabling capability.

| Widget | Decision Supported | Action Available | Responsible Party | Workflow Triggered | Assessment |
|---|---|---|---|---|---|
| Total Savings KPI card | Financial performance awareness | None | Claims Manager | None | **Information only** — add trend arrow and link to `portfolio.claims_summary` report |
| Completed This Month KPI card | Throughput awareness | None | Claims Manager | None | **Information only** — add trend arrow vs. prior month |
| Total Claims KPI card | Portfolio size awareness | None | Claims Manager | None | **Information only** — add breakdown by status |
| Completion % KPI card | Throughput efficiency | None | Claims Manager | None | **Information only** — add trend arrow |
| Intake Queue tab | Assignment decisions | Assign to processor, assign to assessor, trigger AI, reset stuck | Claims Manager | Workflow transition to `under_assessment` | **Actionable** — well-designed |
| Review Queue tab | Approval/send-back decisions | Approve (close for processing), send back, add comment, generate report | Claims Manager | Workflow transition to `payment_authorized` or `internal_review` | **Actionable** — `closeForProcessing` bug remains |
| Active Claims tab | Portfolio monitoring | Send back (from active), add comment | Claims Manager | Limited | **Partially actionable** — no escalation action from this tab |
| Fraud Alerts tab | Fraud investigation oversight | View claim, add comment | Claims Manager | None | **Partially actionable** — no direct escalation to Fraud Manager |
| Processed Claims tab | Historical review | View claim | Claims Manager | None | **Information only** — appropriate for this tab |
| Fleet Approvals tab | Fleet account governance | Approve/reject fleet manager request | Claims Manager | Fleet account activation | **Actionable** — well-designed but not discoverable |
| Recovery KPI bar | Recovery oversight | Link to Recovery Portal | Claims Manager | None | **Partially actionable** — add direct link to recovery cases by status |

### Widgets That Provide Information Without Supporting Action

The four KPI cards (Total Savings, Completed This Month, Total Claims, Completion %) provide awareness but do not support any specific management action. They should be enhanced with trend indicators and drill-down links to the relevant tab or report. The Fraud Alerts tab allows viewing but does not provide a direct escalation path to the Fraud Manager — a "Refer to Fraud Manager" action should be added.

---

## Deliverable 9 — Revised Claims Manager Report Specification

### Phase 9: Claims Manager Monthly Report Redesign

The original audit proposed an 8-section report. This reconciliation retains all 8 sections and adds 4 additional sections that are directly relevant to claims operations management.

**Report Title:** KINGA Claims Operations Monthly Report  
**Audience:** Head of Claims / Claims Manager  
**Frequency:** Monthly (with on-demand generation)  
**Format:** PDF, generated via `portfolio.claims_summary` report key  

---

**Section 1 — Executive Summary**

A one-page overview of the month's key operational metrics, written as an AI-generated narrative using `invokeLLM`. Includes: total claims processed, total approved value, total savings identified, average processing time, fraud prevention rate, recovery rate, and a brief narrative on the month's key trends and anomalies. Data sources: `claims`, `ai_assessments`, `quotes`, `recovery_cases`.

**Section 2 — Claims Throughput**

Monthly intake vs. completion trend (bar chart), backlog trend (line chart), and completion rate vs. prior month. This section directly answers the throughput questions: how many claims entered, how many were completed, and what is the current backlog. Data sources: `analytics.getKPIs`, `analytics.getMonthComparison`.

**Section 3 — Claims Ageing Analysis** *(New — not in original audit)*

Count and value by ageing bucket (0–7, 8–14, 15–30, 30+ days) for all active claims. Horizontal bar chart with colour coding (green, amber, red, purple). Identifies SLA breach risk at the portfolio level. Data sources: `analytics.getClaimsAgeing`.

**Section 4 — Workflow Bottleneck Analysis** *(New — not in original audit)*

Per-stage claim count and average days in state, sorted by average days descending. Identifies which workflow stages are accumulating claims and where management intervention is required. Data sources: `analytics.getWorkflowBottlenecks`, `workflowAnalytics.getProcessingTimesByStage`.

**Section 5 — SLA Performance** *(New — not in original audit)*

SLA compliance percentage per workflow stage, with configurable SLA targets. Identifies which stages are consistently breaching SLA. Data sources: `workflowAnalytics.getSLACompliance`.

**Section 6 — Financial Performance**

Total reserves, total approved, total recovered, net exposure, leakage rate, and month-on-month comparison. Data sources: `analytics.getMonthComparison`, `analytics.getFinancialOverview`.

**Section 7 — Fraud Intelligence**

Flagged count, investigated count, confirmed fraud count, prevented loss value, and fraud investigation funnel (5-stage). Conversion rate (flagged → repudiated). Data sources: `analytics.getFraudInvestigationFunnel`, `claims.fraudRiskScore`.

**Section 8 — Workforce Performance** *(New — not in original audit)*

Assessor performance ranking (performance score, accuracy score, total assessments, avg completion time, tier). Processor productivity (claims handled, transition count). Identifies staff members requiring intervention. Data sources: `analytics.getAssessorPerformance`, `workflowAnalytics.getUserProductivity`.

**Section 9 — Panel Beater Performance**

Top panel beaters by volume, average quote variance vs. KINGA estimate, quality score, and average repair time. Identifies panel beaters generating excessive variance or delays. Data sources: `analytics.getPanelBeaterAnalytics`, `generatePanelBeaterPerformanceReport`.

**Section 10 — Assessor Performance**

Assessor ranking by performance score, average assessment accuracy vs. KINGA estimate, and tier distribution. Data sources: `analytics.getAssessorPerformance`, `generateAssessorPerformanceReport`.

**Section 11 — Recovery Oversight**

Recovery case count by status, total quantum, total recovered, recovery rate, approaching deadlines, and month-on-month recovery trend. Data sources: `trpc.recovery.getKPIs`.

**Section 12 — AI Accuracy Audit**

KINGA estimate vs. approved amount variance distribution, confidence score distribution, and fraud score accuracy. Data sources: `ai_assessments`, `claims.approvedAmount`.

---

## Deliverable 10 — Reconciled Implementation Plan

### Phase 10: Reconciled Implementation Plan

The following plan is structured by operational priority, not technical complexity. All items are grounded in existing backend capabilities — no new procedures need to be created for the High priority items.

#### Critical — Production Blockers

| Item | Priority | Effort | Business Value | Justification |
|---|---|---|---|---|
| Fix `closeForProcessing` — replace `trpc.claims.approveClaim` with a dedicated `closeForProcessing` procedure that records the correct intent in the audit trail | Critical | 1 day | Audit trail integrity; regulatory compliance | ClaimsManagerDashboard.tsx:252 still calls `approveClaim` with `selectedQuoteId: 0`. This creates an ambiguous audit record that cannot be distinguished from a genuine approval. In a regulated environment, this is a compliance risk. |

#### High — Operational Control Improvements

| Item | Priority | Effort | Business Value | Justification |
|---|---|---|---|---|
| Add Claims Ageing panel above tab structure (consuming `analytics.getClaimsAgeing`) | High | 0.5 day | SLA breach prevention; immediate ageing visibility | Procedure exists, returns 4-bucket data. Zero engineering risk. Claims Manager cannot currently answer "which claims are ageing?" without navigating to Active Claims and manually reviewing dates. |
| Add Escalation Alerts panel above tab structure (consuming `analytics.getCriticalAlerts`) | High | 0.5 day | Immediate escalation visibility; high-value and high-fraud claim identification | Procedure exists, returns 4 alert categories. Claims Manager cannot currently identify high-value pending, high-fraud-risk, disputed, or stuck claims without navigating through multiple tabs. |
| Add Workflow Bottlenecks panel above tab structure (consuming `analytics.getWorkflowBottlenecks`) | High | 0.5 day | Process improvement; bottleneck identification | Procedure exists, returns per-state count and avg/max days. Claims Manager cannot currently identify which workflow stages are accumulating claims. |
| Add Fraud Funnel panel to Fraud Alerts tab (consuming `analytics.getFraudInvestigationFunnel`) | High | 0.5 day | Fraud oversight; conversion rate visibility | Procedure exists, returns 5-stage funnel with prevented loss. Claims Manager can see individual fraud-flagged claims but cannot see the portfolio-level fraud funnel. |
| Add per-claim report dropdown to Review Queue tab (`claim.cost_comparison`, `claim.repair_decision`, `claim.audit_trail`, `claim.forensic`) | High | 1 day | Full report access within workflow | 4 reports are authorised for `claims_manager` but have no UI entry point. Claims Manager must navigate to Reports Centre to access them. |
| Add Fleet Approvals to sidebar navigation | High | 0.5 day | Feature discoverability | Fleet Approvals tab is fully functional but invisible from sidebar. New users will not discover it. |
| Add Portfolio Reports dropdown to dashboard header (`portfolio.dwell_time`, `portfolio.panel_beater_performance`, `portfolio.fraud_summary`, `portfolio.assessor_performance`) | High | 1 day | Report discoverability | 4 portfolio reports are authorised but have no entry point within the portal. |

#### Medium — Management Intelligence Improvements

| Item | Priority | Effort | Business Value | Justification |
|---|---|---|---|---|
| Add Workforce Intelligence panel to Intake Queue tab (consuming `analytics.getAssessorPerformance` + `workflowAnalytics.getUserProductivity`) | Medium | 1 day | Informed assignment decisions; assessor management | Both procedures exist. Claims Manager currently assigns assessors without visibility of their current workload or performance. |
| Add SLA Breaches panel above tab structure (consuming `workflowAnalytics.getSLACompliance`) | Medium | 1 day | SLA compliance management | Procedure exists with configurable SLA targets per stage. More granular than the Ageing panel. |
| Enhance recovery KPI bar — add total quantum, total recovered amount, and recovery-eligible claim count | Medium | 0.5 day | Recovery financial visibility | `getKPIs` already returns `totalRecovered` and `totalSettlementAmount`. These are not currently displayed in the recovery bar. |
| Add Leakage Metrics panel (consuming `analytics.getMonthComparison`) | Medium | 0.5 day | Financial leakage control | Procedure exists. Claims Manager cannot currently answer "is leakage increasing?" |
| Add count badges to Review Queue, Fraud Alerts, and Fleet Approvals tab labels | Medium | 0.5 day | At-a-glance queue depth | Eliminates the need to click each tab to determine queue depth. |
| Add trend arrows to KPI cards (vs. prior month) | Medium | 0.5 day | Throughput trend awareness | `analytics.getMonthComparison` returns prior-month data. Trend arrows would make the KPI cards actionable. |

#### Low — UX and Convenience Enhancements

| Item | Priority | Effort | Business Value | Justification |
|---|---|---|---|---|
| Add "Refer to Fraud Manager" action to Fraud Alerts tab | Low | 1 day | Fraud escalation path | Currently no direct escalation path from Claims Manager to Fraud Manager. |
| Add structured `sendBackReason` field to send-back dialog (dropdown of predefined reasons) | Low | 0.5 day | Audit quality; structured reason tracking | Currently free-text only. Structured reasons would enable reporting on send-back patterns. |
| Add Fleet Approvals count badge to sidebar | Low | 0.5 day | Pending approval visibility | Eliminates the need to navigate to the Fleet Approvals tab to check for pending requests. |
| Add claim count badges to sidebar navigation items | Low | 0.5 day | Queue depth visibility | At-a-glance queue depth from sidebar. |
| Add "Export to Excel" for Fraud Alerts tab | Low | 0.5 day | Reporting convenience | Enables offline analysis of fraud-flagged claims. |

### Implementation Sequence Recommendation

The recommended implementation sequence is:

1. **Sprint 1 (Pre-Go-Live, 2 days):** Fix `closeForProcessing` + add Claims Ageing panel + add Escalation Alerts panel + add Fleet Approvals to sidebar. These four items address the only remaining production blocker and provide the minimum command centre visibility.

2. **Sprint 2 (Post-Launch Week 1, 3 days):** Add Workflow Bottlenecks panel + Fraud Funnel panel + per-claim report dropdown in Review Queue + Portfolio Reports dropdown in dashboard header. These items complete the intelligence layer and report accessibility.

3. **Sprint 3 (Post-Launch Week 2, 3 days):** Add Workforce Intelligence panel + SLA Breaches panel + enhance recovery KPI bar + add Leakage Metrics panel + count badges on tab labels. These items complete the management intelligence layer.

4. **Sprint 4 (Post-Launch Month 1, 2 days):** Low priority UX enhancements — structured send-back reasons, fraud escalation path, sidebar badges, Excel export.

---

## Final Go-Live Readiness Assessment

### Revised Readiness Scorecard

| Dimension | v1.0 Score | v2.0 Score | Change | Notes |
|---|---|---|---|---|
| Navigation completeness | 7/10 | 7/10 | — | Fleet Approvals still not in sidebar |
| Data accuracy | 8/10 | 8/10 | — | Demo fallbacks remain correct pattern |
| Workflow completeness | 5/10 | 7/10 | **+2** | `sendBackClaim` resolved; `closeForProcessing` remains |
| AI intelligence utilisation | 6/10 | 6/10 | — | Portfolio AI still absent from Claims Manager Dashboard |
| Report coverage | 4/10 | 4/10 | — | 8 of 10 authorised reports still have no direct UI entry point |
| Cross-portal integration | 6/10 | 7/10 | **+1** | Recovery KPI bar confirmed working; notification gaps remain |
| Audit trail quality | 5/10 | 7/10 | **+2** | `sendBackClaim` now records correct audit trail; `closeForProcessing` ambiguity remains |
| Command centre capability | 3/10 | 3/10 | — | No portfolio intelligence panels; no workforce visibility; no bottleneck identification |
| **Overall** | **5.9/10** | **6.4/10** | **+0.5** | **Conditional — Operationally Viable with Intelligence Gaps** |

### Revised Verdict

The portal is operationally viable for supervised claims operations. The `sendBackClaim` defect has been resolved, which removes the production blocker. However, the portal does not yet function as a Claims Operations Command Centre. A Claims Manager using this portal today can manage individual claims effectively but cannot answer the core portfolio management questions their role requires: which claims are ageing, where are the bottlenecks, which assessors are overloaded, and is fraud increasing or decreasing.

All the data needed to answer these questions exists in the backend. The gap is entirely in the frontend — the Claims Manager Dashboard makes zero calls to the analytics router, while the Executive Dashboard makes eight. Closing this gap is the highest-value engineering investment available for this portal.

### Pre-Go-Live Checklist (Revised)

- [ ] Fix `closeForProcessing` — replace `approveClaim` with dedicated procedure (Critical — 1 day)
- [ ] Add Claims Ageing panel above tab structure (High — 0.5 day)
- [ ] Add Escalation Alerts panel above tab structure (High — 0.5 day)
- [ ] Add Fleet Approvals to sidebar navigation (High — 0.5 day)
- [ ] Verify all 6 DEMO_ fallbacks are not shown to live users (Medium — 0.5 day)

**Total pre-go-live effort: 3 days**

---

*KINGA AutoVerify AI — Claims Manager Portal Reconciliation Audit v2.0*  
*Produced using KINGA Claims Manager Reconciliation Audit Prompt v2.0*  
*Audit scope: ClaimsManagerDashboard.tsx, server/routers.ts (claims.sendBackClaim, claims.approveClaim), server/routers/analytics.ts (getClaimsAgeing, getFraudInvestigationFunnel, getWorkflowBottlenecks, getCriticalAlerts, getAssessorPerformance, getPanelBeaterAnalytics, getMonthComparison), server/routers/workflow-analytics.ts (getSLACompliance, getUserProductivity), server/reporting/reportDefinitions.ts*
