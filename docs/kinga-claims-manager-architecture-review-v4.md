# KINGA Claims Manager Portal — Architecture Review v4.0

**Document Classification:** Internal Engineering Architecture Review  
**Portal Under Review:** Claims Manager Portal (`/insurer/claims-manager`)  
**Review Version:** 4.0 — Product Owner Response and Revised Target State  
**Prepared by:** KINGA Platform Engineering  
**Date:** June 2026  
**Status:** Final

---

## Purpose

This document is a structured response to the product owner architectural challenge raised against the v3.0 Alignment and Redesign Audit. It accepts the challenge where the reasoning is sound, pushes back where there is a legitimate counter-argument, and synthesises both perspectives into a revised target state architecture and implementation priority order.

The central challenge is this: **the v3.0 audit still designed the Claims Manager Portal as an analytics dashboard rather than an operational command centre.** That challenge is accepted. This document corrects that orientation.

---

## Section 1 — Accepting the Core Architectural Challenge

The product owner's most important observation is that the v3.0 layout placed KPI cards in Row 1 and the intelligence bar in Row 2. That sequence reflects an analytics mindset: show the executive summary first, then the detail. A Claims Manager does not need an executive summary. A Claims Manager needs to know, within ten seconds of opening the portal, what requires immediate attention.

The correct mental model is not "dashboard" — it is "morning briefing." When a Claims Manager opens the portal at the start of the day, the portal should answer six questions before they have to click anything:

1. What is stuck in my queues right now?
2. What is breaching SLA?
3. What decisions are waiting for me?
4. Which claims create risk if I ignore them today?
5. Who on my team is overloaded?
6. What is my backlog trajectory?

The v3.0 layout answered none of these questions above the fold. The revised layout must answer all six before the user reaches the tab structure.

This architectural reorientation is accepted in full.

---

## Section 2 — Accepting the Specific Recommendations

### 2.1 Queue Health as Row 1

**Accepted.** The product owner is correct that Claims Managers live in queues. Queue health is the primary operational signal. Moving it to Row 1 is the correct architectural decision.

The v3.0 audit identified that `getDashboardStats.workflowStateCounts` is already fetched on every dashboard load and contains the queue count data. The revised Queue Health matrix adds Average Age and Oldest Claim (from `workflowAnalytics.getProcessingTimesByStage`) and SLA Breaches (from `workflowAnalytics.getBottlenecks`). All three data sources exist in the backend.

The revised Queue Health Row 1 specification is:

| Queue Stage | Count | Average Age | Oldest Claim | SLA Breaches |
|---|---|---|---|---|
| Intake | `workflowStateCounts.intake_queue` | `getProcessingTimesByStage` | Derivable from `workflow_audit_trail` | `getBottlenecks` |
| Under Assessment | `workflowStateCounts.under_assessment` | `getProcessingTimesByStage` | Derivable | `getBottlenecks` |
| Internal Review | `workflowStateCounts.internal_review` | `getProcessingTimesByStage` | Derivable | `getBottlenecks` |
| Technical Approval | `workflowStateCounts.technical_approval` | `getProcessingTimesByStage` | Derivable | `getBottlenecks` |
| Financial Decision | `workflowStateCounts.financial_decision` | `getProcessingTimesByStage` | Derivable | `getBottlenecks` |
| Repair Assigned | `workflowStateCounts.repair_assigned` | `getProcessingTimesByStage` | Derivable | `getBottlenecks` |

**Engineering note:** The "Oldest Claim" column requires a new query — a `MAX(TIMESTAMPDIFF(HOUR, entered_state_at, NOW()))` per stage. This is not currently returned by any existing procedure and requires a new `getQueueAgeDetails` procedure or an extension to `getProcessingTimesByStage`. This is a one-day engineering task.

### 2.2 Escalation Centre as Row 2

**Accepted.** The Escalation Centre should be the second thing a Claims Manager sees, not buried in an intelligence bar. The product owner's expanded definition is adopted:

| Escalation Category | Source | Backend Procedure |
|---|---|---|
| High Value Pending | Claims at `financial_decision` above threshold | `byStatus` + amount filter |
| High Fraud Risk | `fraudRiskLevel` high/critical/elevated | `getFraudAlerts` |
| Disputed | `workflowState = disputed` | `getEscalations` |
| Stuck Claims | Claims exceeding dwell threshold | `getBottlenecks` |
| SLA Breaches | Claims exceeding SLA per stage | `getSLACompliance` |
| Executive Overrides | `executiveOverride = 1` in `workflow_audit_trail` | New query required |

The Escalation Centre must be actionable, not informational. Each category should be a clickable count that opens a filtered claim list. The Claims Manager must be able to act on any escalation category without navigating to a separate tab.

### 2.3 Approval Workbench as Row 3

**Accepted.** This is the most significant omission from v3.0. The most important responsibility of a Claims Manager is approvals, yet v3.0 buried approval visibility inside the Review Queue tab. A dedicated Approval Workbench panel above the tabs is the correct design.

The Approval Workbench specification:

| Metric | Source | Action |
|---|---|---|
| Awaiting Technical Approval | `byStatus({ status: "technical_approval" })` count | Click → Review Queue filtered to technical_approval |
| Awaiting Financial Decision | `byStatus({ status: "financial_decision" })` count | Click → Review Queue filtered to financial_decision |
| High Value Pending | Claims above automation threshold at financial_decision | Click → filtered list |
| Oldest Approval | MAX age of claims at technical_approval or financial_decision | Click → sorted Review Queue |
| Average Approval Age | AVG age of claims at approval stages | Informational |

**Engineering note:** The `byStatus` procedure currently fetches up to 200 claims per status. The Approval Workbench needs count and age aggregates, not full claim lists. A lightweight `getApprovalWorkbenchMetrics` procedure should be added to avoid over-fetching.

### 2.4 Capacity Forecasting

**Accepted with scope clarification.** The product owner's framing is precise: this is not AI forecasting, it is simple arithmetic. If intake rate exceeds completion rate, the backlog will grow. That calculation requires only two data points: 7-day intake trend and 7-day completion trend.

The `getManagerOverview` procedure already returns a `cycleTrend` array of daily claim counts. The completion trend requires a similar query on `closedAt` dates. Both are derivable from the existing `claims` table with no schema changes.

The Capacity Forecasting panel should show:

- Current Backlog (active claim count)
- 7-Day Intake (claims created in last 7 days)
- 7-Day Completions (claims closed in last 7 days)
- Backlog Trajectory (intake − completions, with directional indicator: growing / stable / shrinking)

This is a half-day engineering task. The directional indicator alone — a simple arrow showing whether the backlog is growing or shrinking — is a genuinely powerful operational signal that most claims systems do not surface.

### 2.5 Recovery Watchlist

**Accepted.** The product owner is correct that generic recovery counts (Open, Demand Sent, Settled) provide no actionable signal. A Claims Manager does not need to know how many recovery cases are open — they need to know which ones require attention today.

The Recovery Watchlist specification:

| Category | Definition | Source |
|---|---|---|
| Recovery Eligible | Claims closed with third-party liability, no recovery case opened | Derivable from `claims` + `recovery_cases` join |
| Demand Outstanding | Recovery cases with `demandSent = true` and no response after threshold | `recovery_cases` table |
| Deadline Approaching | Recovery cases with `deadlineDate` within 7 days | `recovery_cases` table |
| High Value Recoveries | Recovery cases above value threshold | `recovery_cases.estimatedRecoveryAmount` |

**Engineering note:** "Recovery Eligible" requires a join between `claims` (closed, with third-party involvement) and `recovery_cases` (no matching case). This is a new query. The other three categories are straightforward filters on the existing `recovery_cases` table.

### 2.6 Claims Requiring Attention Today — Management by Exception

**Accepted as the highest-value new recommendation.** The product owner's description of this widget is precise and operationally correct. A single "Attention Required" queue, built from exception rules, provides more operational value than most of the rest of the dashboard combined.

The exception rules proposed are:

| Rule | Threshold | Source |
|---|---|---|
| SLA breach | Stage dwell exceeds threshold | `getBottlenecks` |
| Fraud score | `fraudRiskScore > 80` | `claims.fraudRiskScore` |
| High value pending | Claim above automation threshold at approval stage | `claims.totalClaimAmount` + `workflowState` |
| No update | `updatedAt` > 7 days ago and claim is active | `claims.updatedAt` |
| Multiple send-backs | More than 2 backward transitions in `workflow_audit_trail` | `workflow_audit_trail` count query |
| Executive override | `executiveOverride = 1` in recent `workflow_audit_trail` | `workflow_audit_trail` |
| Disputed | `workflowState = disputed` | `claims.workflowState` |

The "Attention Required" widget should display a total count with a breakdown by rule category. Each category should be a clickable link that opens the filtered claim list. The widget should be positioned at the top of the Escalation Centre row, as it is the synthesis of all escalation signals into a single operational queue.

**Engineering note:** This requires a new `getAttentionRequired` procedure that runs all seven rule queries in parallel and returns a structured count object. The individual queries are all straightforward. The procedure should be designed to run efficiently — using `COUNT` aggregates rather than full row fetches — to avoid performance impact on dashboard load time.

---

## Section 3 — Challenging One Recommendation

### 3.1 Fraud Funnel Removal

**Partially challenged.** The product owner argues that the Fraud Funnel (Flagged → Investigated → Confirmed) is useful for executives but not for operations. The counter-argument is that a Claims Manager does need to know whether fraud cases are progressing through investigation — not as a strategic metric, but as an operational queue health signal.

The product owner's alternative framing — "Fraud Cases Awaiting Action, Awaiting Risk Review, Delaying Approval, Older Than SLA" — is operationally superior to the funnel view for daily operations. This framing is adopted as the primary fraud visibility surface.

However, the Fraud Funnel is not removed entirely. It is relocated to the Reports Centre as a period-based report rather than a live dashboard widget. A Claims Manager reviewing monthly performance needs to understand whether the fraud investigation pipeline is healthy. That is a reporting function, not an operational monitoring function.

**Resolution:** Replace the Fraud Funnel dashboard widget with an **Operational Fraud Queue** showing the four categories the product owner specified. Retain the Fraud Funnel as a reportable metric in the Claims Operations Monthly Report.

The Operational Fraud Queue specification:

| Category | Definition | Source |
|---|---|---|
| Fraud Cases Awaiting Action | High/critical fraud risk, no investigation comment in last 48 hours | `getFraudAlerts` + `workflow_audit_trail` |
| Fraud Cases Awaiting Risk Review | High fraud risk at `internal_review` or `technical_approval` stage | `getFraudAlerts` + `workflowState` filter |
| Fraud Cases Delaying Approval | High fraud risk at `financial_decision` stage | `getFraudAlerts` + `workflowState` filter |
| Fraud Cases Older Than SLA | High fraud risk claims exceeding stage dwell threshold | `getFraudAlerts` + `getBottlenecks` |

---

## Section 4 — Revised Target State Architecture

### 4.1 Design Philosophy

The revised architecture is built on a single principle: **the portal is a morning briefing, not a dashboard.** Every row answers a specific operational question. The Claims Manager should be able to answer all six core questions within ten seconds of opening the portal, before interacting with any tab or filter.

The KPI cards from v3.0 are not removed — they are relocated to a compact summary strip below the Workforce Intelligence row. They remain available for period-based context but are no longer the first thing the Claims Manager sees.

### 4.2 Revised Layout

**Row 1 — Queue Health Matrix**

The primary operational signal. Six queue stages displayed as a compact table with Count, Average Age, Oldest Claim, and SLA Breaches per stage. Each row is clickable and navigates to the Active Claims tab filtered by that workflow state.

*Data sources:* `getDashboardStats.workflowStateCounts`, `workflowAnalytics.getProcessingTimesByStage`, `workflowAnalytics.getBottlenecks`, new `getQueueAgeDetails` procedure.

**Row 2 — Escalation Centre + Attention Required**

Two panels side by side. The left panel is the "Attention Required" widget — a single count with breakdown by exception rule. The right panel is the Escalation Centre with six categories (High Value, High Fraud, Disputed, Stuck, SLA Breach, Executive Override). Both panels are fully actionable.

*Data sources:* New `getAttentionRequired` procedure, `getEscalations`, `getFraudAlerts`, `getBottlenecks`, `getSLACompliance`.

**Row 3 — Approval Workbench + Capacity Forecasting**

Two panels side by side. The left panel is the Approval Workbench (Awaiting Technical Approval, Awaiting Financial Decision, High Value Pending, Oldest Approval, Average Approval Age). The right panel is the Capacity Forecasting strip (Current Backlog, 7-Day Intake, 7-Day Completions, Backlog Trajectory indicator).

*Data sources:* New `getApprovalWorkbenchMetrics` procedure, `getManagerOverview.cycleTrend`, new completion trend query.

**Row 4 — Workforce Intelligence**

Three panels: Processor Performance, Assessor Performance, Workload Distribution. Collapsible to reduce visual weight when not in use.

*Data sources:* `analytics.getUserProductivity`, `analytics.getAssessorPerformance`.

**Row 5 — Existing Tab Structure (preserved)**

Intake Queue, Review Queue, Active Claims, Fraud Alerts (enhanced with Operational Fraud Queue), Processed Claims, Fleet Approvals. Report buttons added to Review Queue and Fraud Alerts tabs. No existing tabs removed.

**Row 6 — Compact KPI Summary Strip**

Total Claims, Completion Rate, Savings Identified, Average Cycle Days — displayed as a compact four-cell strip for period-based context. Not the primary operational surface.

*Data sources:* `getManagerOverview.kpis`.

### 4.3 Recovery Watchlist Placement

The Recovery Watchlist replaces the Recovery KPI row. It is positioned as a collapsible panel between Row 4 (Workforce Intelligence) and Row 5 (Tabs). It shows Recovery Eligible, Demand Outstanding, Deadline Approaching, and High Value Recoveries with counts and drill-down links to the Recovery Portal.

### 4.4 Architecture Comparison

| Row | v3.0 Layout | v4.0 Layout | Change |
|---|---|---|---|
| 1 | KPI Cards | Queue Health Matrix | Replaced |
| 2 | Intelligence Bar (7 panels) | Escalation Centre + Attention Required | Replaced |
| 3 | Tabs | Approval Workbench + Capacity Forecasting | New |
| 4 | Workforce Intelligence (below tabs) | Workforce Intelligence | Moved above tabs |
| 5 | — | Tabs | Moved down |
| 6 | — | Compact KPI Strip | New (relocated) |

---

## Section 5 — Revised Implementation Priority Order

The product owner's revised priority order is adopted with minor additions for engineering dependencies.

### Critical — Production Blockers (1.5 days)

| Item | Rationale | Effort |
|---|---|---|
| Fix `closeForProcessing` procedure | Ambiguous audit trail; incorrect governance for closure decisions | 0.5 days |
| Implement dedicated Escalation procedure | "Escalate" button currently misroutes claims via send-back | 1 day |

### High — Operational Command Centre (5.5 days)

| Item | Rationale | Backend Available | Effort |
|---|---|---|---|
| Queue Health Matrix (Row 1) | Primary operational signal; queue count data already fetched | Partial — needs `getQueueAgeDetails` | 1.5 days |
| Escalation Centre + Attention Required (Row 2) | Morning briefing — exceptions surface immediately | Partial — needs `getAttentionRequired` | 1.5 days |
| Approval Workbench (Row 3) | Most important responsibility; currently buried in tab | Partial — needs `getApprovalWorkbenchMetrics` | 1 day |
| Claims Ageing panel | Answers "which stages are slowing down?" | `getProcessingTimesByStage` exists | 0.5 days |
| Workflow Bottlenecks panel | Proactive bottleneck identification | `getBottlenecks` exists | 0.5 days |
| Fleet Approvals sidebar navigation | Discoverability | Tab exists | 0.25 days |

### Medium — Management Intelligence (5.5 days)

| Item | Rationale | Backend Available | Effort |
|---|---|---|---|
| Workforce Intelligence (Row 4) | Claims Managers manage people, not claims | `getUserProductivity`, `getAssessorPerformance` exist | 1.5 days |
| Send-back Analytics | Rework identification; training and quality signals | `workflow_audit_trail` data available | 1 day |
| Recovery Watchlist | Actionable recovery oversight | Partial — needs eligibility query | 1 day |
| Capacity Forecasting (Row 3) | Backlog trajectory — simple arithmetic | `getManagerOverview.cycleTrend` partial | 0.5 days |
| Operational Fraud Queue (replace Fraud Funnel) | Operational fraud visibility vs strategic funnel | `getFraudAlerts` exists | 0.5 days |
| Report Integration (Review Queue + Fraud Alerts) | 11 authorised reports with no UI entry point | All report generators exist | 1 day |

### Low — Refinements (2.25 days)

| Item | Rationale | Effort |
|---|---|---|
| KPI Trend Analysis (compact strip) | Period-based context; not primary operational surface | 0.5 days |
| Structured send-back reason capture | Enables rework analytics | 0.5 days |
| Reopen capability for disputed claims | `closed → disputed` transition not exposed in UI | 0.5 days |
| Audit metadata improvements | Record automation threshold at approval time | 0.25 days |
| Merge Recently Closed card into Processed tab | Remove redundant UI section | 0.25 days |
| Validate targetRole in send-back dialog | Clearer error messages | 0.25 days |

### Revised Total Engineering Estimate

| Priority | Items | Effort |
|---|---|---|
| Critical | 2 | 1.5 days |
| High | 6 | 5.5 days |
| Medium | 6 | 5.5 days |
| Low | 6 | 2.25 days |
| **Total** | **20** | **14.75 days** |

The Critical + High items represent **7 days** of engineering work. At the end of those 7 days, the portal will function as a genuine Claims Operations Command Centre: queue health visible immediately, exceptions surfaced automatically, approvals in a dedicated workbench, and capacity trajectory visible at a glance.

---

## Section 6 — New Procedures Required

The revised architecture requires five new backend procedures not identified in v3.0. All are derivable from existing data with no schema changes.

| Procedure | Router | Query Description | Effort |
|---|---|---|---|
| `getQueueAgeDetails` | `workflowAnalytics` | MAX and AVG dwell time per workflow stage, plus oldest claim per stage | 0.5 days |
| `getAttentionRequired` | `claims` | Parallel COUNT queries for all seven exception rules; returns structured count object | 0.75 days |
| `getApprovalWorkbenchMetrics` | `claims` | COUNT and AVG age for claims at `technical_approval` and `financial_decision`; oldest claim age | 0.5 days |
| `getCapacityForecast` | `claims` | 7-day intake count, 7-day completion count, current backlog, trajectory direction | 0.5 days |
| `getRecoveryWatchlist` | `recovery` | Recovery Eligible (join query), Demand Outstanding, Deadline Approaching, High Value counts | 0.75 days |

Total new procedure engineering: **3 days** (included in the High and Medium estimates above).

---

## Section 7 — Final Architectural Assessment

### 7.1 The Philosophical Shift

The product owner's challenge identifies a fundamental design error that persisted through v1.0, v2.0, and v3.0: the portal was designed by people thinking about what data to display rather than what decisions to support. An analytics dashboard asks "what data do we have?" An operational command centre asks "what decisions does this person make, and what do they need to make them well?"

A Claims Manager makes six categories of decisions every day: queue routing decisions, escalation decisions, approval decisions, workforce allocation decisions, exception management decisions, and capacity management decisions. Every row of the revised architecture maps to one of these decision categories.

### 7.2 What Makes This Architecture Genuinely Differentiated

Most claims administration systems provide claim lists with status filters. Some provide basic KPI dashboards. Very few provide a morning briefing that surfaces exceptions automatically, shows queue health at a glance, and gives the Claims Manager a single "Attention Required" queue that synthesises all operational risk signals.

The "Attention Required" widget in particular is the kind of feature that Claims Managers in insurers currently build manually — they maintain spreadsheets of claims that need attention, updated each morning. Automating that process and surfacing it as a live widget is a meaningful product differentiator.

### 7.3 Revised Production Readiness Verdict

**Score: 5.8 / 10 — Revised to 4.5 / 10 against the v4.0 standard**

The score is revised downward because the v4.0 standard is more demanding than the v3.0 standard. The portal is being assessed not against "does it have analytics capability" but against "does it function as a Claims Operations Command Centre." Against that standard, the current portal — which has no Queue Health matrix, no Attention Required queue, no Approval Workbench, and no Capacity Forecasting — scores lower.

The path to a command centre is now precisely defined. The Critical + High items (7 days) deliver the core command centre capability. The Medium items (5.5 days) add management intelligence. The Low items (2.25 days) refine the experience.

**Recommended Go-Live Condition (revised):** Complete all Critical and High items before production deployment. The portal must surface Queue Health, Escalation Centre, Approval Workbench, and Attention Required before it is presented to Claims Managers as their primary operational tool. These are not enhancements — they are the minimum viable command centre.

---

## Appendix — v3.0 to v4.0 Recommendation Disposition

| v3.0 Recommendation | v4.0 Disposition | Change |
|---|---|---|
| Fix `closeForProcessing` | Retained — Critical | No change |
| Dedicated Escalation procedure | Retained — Critical | No change |
| Queue Health panel (Row 2) | Promoted to Row 1 with expanded spec | Promoted |
| Escalation Centre panel (Row 2) | Promoted to Row 2 with expanded categories | Promoted + expanded |
| Approval Workbench | New — added to Row 3 | New |
| Claims Ageing panel | Retained — High | No change |
| Workflow Bottlenecks panel | Retained — High | No change |
| Fleet Approvals navigation | Retained — High | No change |
| Workforce Intelligence (Row 4) | Moved above tabs — Row 4 | Moved |
| Send-back Analytics | Retained — Medium | No change |
| Recovery Watchlist | Replaces Recovery KPI row | Upgraded |
| Capacity Forecasting | New — added to Row 3 | New |
| Operational Fraud Queue | Replaces Fraud Funnel widget | Replaced |
| Report Integration | Retained — Medium | No change |
| KPI Cards (Row 1) | Demoted to compact strip (Row 6) | Demoted |
| Fraud Funnel widget | Moved to Reports Centre | Relocated |
| Attention Required queue | New — highest-value new feature | New |

---

*End of Document — KINGA Claims Manager Portal Architecture Review v4.0*
