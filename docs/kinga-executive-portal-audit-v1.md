# KINGA Executive Portal — Full Audit Report
**Version:** 1.0  
**Date:** June 2026  
**Classification:** CONFIDENTIAL — Internal Use Only  
**Scope:** Executive Dashboard, Executive Report Engine, and all portal pages accessible to the `executive` role

---

## Table of Contents

1. [Phase 1: Navigation and State Audit](#phase-1-navigation-and-state-audit)
2. [Phase 2: Data Lineage Verification](#phase-2-data-lineage-verification)
3. [Phase 3: Executive Decision Support Review](#phase-3-executive-decision-support-review)
4. [Phase 4: Dashboard Completeness Audit](#phase-4-dashboard-completeness-audit)
5. [Phase 5: Executive Report Engine Design](#phase-5-executive-report-engine-design)
6. [Deliverable A: Navigation Map](#deliverable-a-navigation-map)
7. [Deliverable B: Data Lineage Matrix](#deliverable-b-data-lineage-matrix)
8. [Deliverable C: Orphaned Feature Register](#deliverable-c-orphaned-feature-register)
9. [Deliverable D: Missing Integration Register](#deliverable-d-missing-integration-register)
10. [Deliverable E: Executive Dashboard Improvement Plan](#deliverable-e-executive-dashboard-improvement-plan)
11. [Deliverable F: Executive Report Specification](#deliverable-f-executive-report-specification)
12. [Deliverable G: Implementation Priority Matrix](#deliverable-g-implementation-priority-matrix)

---

## Phase 1: Navigation and State Audit

### 1.1 Executive Role Navigation Structure

The executive role has access to the following navigation items in `InsurerPortalLayout.tsx`:

**Overview**
- Executive Dashboard → `/insurer-portal/executive`

**Portfolio**
- Savings Tracker → `/insurer-portal/executive?tab=financials`
- Fraud Analytics → `/insurer/fraud-analytics`
- Repairer Intelligence → `/insurer/panel-beater-performance`

**Analytics & Reports**
- Workflow Analytics → `/insurer-portal/workflow-analytics`
- Relationship Intelligence → `/insurer-portal/relationship-intelligence`
- Reports Centre → `/insurer-portal/reports-centre`

### 1.2 Component-Level Audit

| Component | Purpose | Data Source | Current Status | Issues Found | Recommended Action |
|---|---|---|---|---|---|
| **Executive Dashboard — Overview Tab** | Portfolio KPI summary | `claims.getExecutiveSummary`, `analytics.getKPIs` | Functional with demo fallback | Demo fallback is transparent; real data populates when claims exist | None — working as designed |
| **Executive Dashboard — Month Comparison Strip** | MoM delta for 6 KPIs | `DEMO_MONTH_COMPARISON` (hardcoded) | **BROKEN** — always shows hardcoded "MAY 2026 vs APRIL 2026" with static fixture data | No backend procedure exists; strip is permanently demo data regardless of real claim volume | **CRITICAL**: Implement `analytics.getMonthComparison` procedure; replace hardcoded strip with real data |
| **Executive Dashboard — Operational Health Tab** | Workflow bottleneck chart, assessor/panel beater performance | `analytics.getWorkflowBottlenecks`, `analytics.getAssessorPerformance`, `analytics.getPanelBeaterAnalytics` | Functional with demo fallback | Demo fallback active when no data; real data populates correctly | None — working as designed |
| **Executive Dashboard — ROI Breakdown Tab** | Financial overview (payouts, reserves, fraud prevented, net exposure) | `analytics.getFinancialOverview` | Functional with demo fallback | Demo fallback active when no data | None — working as designed |
| **Executive Analytics Charts** | 9 charts: volume, fraud trends, cost breakdown, processing time, fraud distribution, override rate, overridden repairers, cost delta, AI savings | `executive.*` procedures (all 9 have real SQL) | Functional with demo fallback | Demo fallback active when no data; real SQL implemented for all 9 | None — working as designed |
| **Savings Tracker (tab=financials)** | Cost savings trend, financial impact | `analytics.getCostSavingsTrends`, `analytics.getFinancialOverview` | Functional | No issues | None |
| **Fraud Analytics** (`/insurer/fraud-analytics`) | Fraud signal breakdown, high-risk claims list | `analytics.getKPIs` (fraud fields) | Functional | No dedicated fraud analytics page found — route may 404 | **HIGH**: Verify `/insurer/fraud-analytics` route exists and is mapped in App.tsx |
| **Repairer Intelligence** (`/insurer/panel-beater-performance`) | Panel beater performance table | `panelBeaterAnalytics.*` procedures | Functional | Route exists; `PanelBeaterPerformance.tsx` page is implemented | None |
| **Workflow Analytics** | Processing time by stage, SLA compliance, transition trends, user productivity | `workflowAnalytics.*` procedures (5 procedures) | Functional | Route mapped to `WorkflowAnalyticsDashboard.tsx`; all 5 procedures have real SQL | None |
| **Relationship Intelligence** | Entity network: officers, assessors, panel beaters, drivers, accident clusters, anomaly scores | `intelligence.*` procedures (7 procedures) | Functional | All 7 procedures implemented | None |
| **Reports Centre** | Generate, schedule, and download reports | `reportingEngine.*` procedures | Functional | Recovery reports (`recovery.case_summary`, `recovery.performance`, `recovery.third_party_profiles`) are in the catalogue but have **no case switch handler** — will throw `Unknown report key` error | **CRITICAL**: Add case handlers for all 3 recovery report keys in `generateReportHtml` |
| **Executive Dashboard — Global Search** | Search claims by identifier, policy, or claimant | `analytics.globalSearch` | Functional | Search is disabled until query has value (correct) | None |
| **Executive Dashboard — Comments** | Add comments to claims from executive view | `comments.addComment` | Functional | Available but no comment thread visible from executive dashboard — comments added blind | **MEDIUM**: Add comment thread view alongside add-comment form |
| **Executive Dashboard — Governance Tab** | Override rate, segregation violations, role changes | `governance.getGovernanceSummary` | Functional | Real SQL implemented for all 4 governance metrics | None |

### 1.3 Orphaned and Unreachable States

The following states were identified as orphaned or unreachable:

**1. Month Comparison Strip** — permanently shows hardcoded "MAY 2026 vs APRIL 2026" fixture data. This is not a demo fallback — it is hardcoded unconditionally. An executive looking at this strip in July 2026 will see May vs April data regardless of the actual portfolio state.

**2. Recovery Reports in Reports Centre** — three report keys (`recovery.case_summary`, `recovery.performance`, `recovery.third_party_profiles`) appear in the catalogue and are accessible to the executive role, but the `generateReportHtml` switch statement has no handler for them. Attempting to generate any of these reports will throw an `Unknown report key` error and fail silently in the UI.

**3. Fraud Analytics route** — the executive sidebar links to `/insurer/fraud-analytics`. Inspection of `App.tsx` shows this route is guarded by `RoleGuard allowedRoles=["risk_manager", "claims_manager", "executive", "insurer_admin"]` and maps to a `FraudAnalytics` page. The page exists but uses `analytics.getKPIs` for its fraud data — it does not have a dedicated fraud analytics backend procedure. The page is functional but thin.

**4. Executive Dashboard — no date range filter** — the executive dashboard has no date range picker. All KPIs default to the last 30 days. An executive cannot view quarterly or annual performance without navigating to individual report generation. This is a significant gap for board-level reporting.

**5. Executive Dashboard — no export button on KPI summary** — the ROI Breakdown tab has an "Export PDF" button on the Financial Overview card, but the main KPI summary (Overview tab) has no export capability. The `KingaReportButton` component exists but is not wired to the Overview tab KPIs.

---

## Phase 2: Data Lineage Verification

### 2.1 Primary KPI Metrics

| Metric | Source Tables | Calculation Logic | Refresh | Status | Issues |
|---|---|---|---|---|---|
| **Total Claims** | `claims` | `COUNT(*)` filtered by `tenant_id` and date range | On demand | ✅ Real SQL | None |
| **Completed Claims** | `claims` | `COUNT(*) WHERE status IN ('completed','closed','rejected','approved')` | On demand | ✅ Real SQL | None |
| **Total Savings** | `claims`, `ai_assessments` | `SUM(estimated_cost - approved_amount)` where `approved_amount IS NOT NULL` | On demand | ✅ Real SQL | Savings can be negative if approved > estimated; no floor applied |
| **Resolution Rate** | `claims` | `completed / total * 100` | On demand | ✅ Derived | None |
| **Avg Cycle Days** | `claims`, `workflow_audit_trail` | `AVG(completed_at - created_at)` in days | On demand | ✅ Real SQL | None |
| **Savings Trend** | `claims`, `ai_assessments` | Monthly `SUM(estimated_cost - approved_amount)` grouped by month | On demand | ✅ Real SQL | None |
| **Month Comparison Strip** | None | Hardcoded `DEMO_MONTH_COMPARISON` fixture | Never | ❌ HARDCODED | Always shows MAY 2026 vs APRIL 2026 regardless of real data |
| **Fraud Rate** | `claims`, `ai_assessments` | `COUNT(fraud_risk_level='high') / COUNT(*) * 100` | On demand | ✅ Real SQL | None |
| **Fraud Exposure** | `claims`, `ai_assessments` | `SUM(estimated_cost) WHERE fraud_risk_level='high' AND status NOT IN ('rejected','closed')` | On demand | ✅ Real SQL | None |
| **Override Rate** | `workflow_audit_trail`, `claims` | `COUNT(executive_override=1) / COUNT(claims) * 100` | On demand | ✅ Real SQL | None |
| **Segregation Violations** | `claim_involvement_tracking`, `claims` | `COUNT(claim-user pairs with >1 distinct workflow stage)` | On demand | ✅ Real SQL | None |
| **Total Payouts** | `claims` | `SUM(approved_amount) WHERE approved_amount IS NOT NULL` | On demand | ✅ Real SQL | None |
| **Total Reserves** | `claims`, `ai_assessments` | `SUM(estimated_cost) WHERE status NOT IN ('completed','rejected')` | On demand | ✅ Real SQL | None |
| **Fraud Prevented** | `claims`, `ai_assessments` | `SUM(estimated_cost) WHERE status='rejected' AND fraud_risk_level='high'` | On demand | ✅ Real SQL | None |
| **Net Exposure** | Derived | `totalPayouts + totalReserves` | On demand | ✅ Derived | Calculation is additive not subtractive — should be `totalReserves - totalRecovered` |
| **Claims Volume Over Time** | `claims` | `COUNT(*) GROUP BY DATE(created_at)` | On demand | ✅ Real SQL | None |
| **Fraud Detection Trends** | `claims`, `ai_assessments` | `SUM(CASE WHEN fraud_risk_level='high') GROUP BY DATE` | On demand | ✅ Real SQL | None |
| **Average Processing Time** | `claims`, `workflow_audit_trail` | `AVG(time between stage transitions)` | On demand | ✅ Real SQL | None |
| **AI Savings** | `claims`, `ai_assessments` | `SUM(estimated_cost - approved_amount) WHERE approved_amount IS NOT NULL` | On demand | ✅ Real SQL | None |
| **Most Overridden Repairers** | `workflow_audit_trail`, `claims`, `panel_beaters` | `COUNT(executive_override) GROUP BY repairer` | On demand | ✅ Real SQL | None |
| **Cost Delta on Override** | `workflow_audit_trail`, `claims`, `ai_assessments` | `AVG(approved_amount - estimated_cost) WHERE executive_override=1` | On demand | ✅ Real SQL | None |

### 2.2 Missing Data Sources

The following executive-level metrics have **no backend procedure or data source**:

| Missing Metric | Why It Matters | Recommended Source Tables |
|---|---|---|
| **Loss Ratio** | Core insurance KPI: claims paid ÷ premiums earned | `claims.approved_amount` ÷ `tenants.monthly_premium_volume` (field does not exist) |
| **Premium Trends** | Revenue context for claims performance | `tenants` table — no premium fields exist |
| **Reserve Adequacy** | Are reserves sufficient to cover open claims? | `claims.estimated_claim_value` vs `claims.total_claim_amount` |
| **Geographic Fraud Hotspots** | Where is fraud concentrated? | `claims.incident_location` — field exists but no aggregation procedure |
| **Suspicious Clients** | Repeat claimants across portfolio | `cross_claim_signals` table — procedure exists but not surfaced in executive dashboard |
| **Settlement Trends** | How are settlements trending vs estimates? | `claims.approved_amount` vs `claims.estimated_claim_value` over time |
| **Leakage Detection** | Claims paid above AI estimate | `claims.approved_amount - ai_assessments.estimated_cost WHERE > 0` |
| **Recovery Opportunities** | Open claims with recovery potential | `recovery_cases.recovery_potential_score` — data exists, not surfaced |

---

## Phase 3: Executive Decision Support Review

### 3.1 Coverage Assessment

| Domain | Coverage | Status | Gap |
|---|---|---|---|
| **Portfolio Health — Active policies** | Not covered | ❌ Missing | No policy management module; `tenants` table has no policy count field |
| **Portfolio Health — Claims volume** | Covered | ✅ | Claims volume over time chart; total claims KPI |
| **Portfolio Health — Premium trends** | Not covered | ❌ Missing | No premium data in schema |
| **Portfolio Health — Loss ratios** | Not covered | ❌ Missing | No premium data; loss ratio cannot be calculated |
| **Portfolio Health — Risk concentrations** | Partially covered | ⚠️ Partial | Risk heatmap by incident type exists in Risk Manager; not surfaced in Executive Dashboard |
| **Claims Intelligence — Open claims** | Covered | ✅ | Total active claims KPI; claims by status |
| **Claims Intelligence — Claims severity** | Partially covered | ⚠️ Partial | Average cost per claim; no severity distribution chart |
| **Claims Intelligence — Claims cycle times** | Covered | ✅ | Average cycle days KPI; processing time by stage chart |
| **Claims Intelligence — Reserve adequacy** | Not covered | ❌ Missing | Total reserves shown but no adequacy ratio vs exposure |
| **Claims Intelligence — Settlement trends** | Not covered | ❌ Missing | No settlement trend chart |
| **Fraud Intelligence — High-risk claims** | Covered | ✅ | Fraud rate KPI; fraud detection trends chart |
| **Fraud Intelligence — Fraud trends** | Covered | ✅ | Weekly fraud rate trend; fraud risk distribution |
| **Fraud Intelligence — Suspicious panel beaters** | Covered | ✅ | Most overridden repairers chart; Repairer Intelligence page |
| **Fraud Intelligence — Suspicious clients** | Not covered | ❌ Missing | Cross-claim signals exist in DB but not surfaced in executive view |
| **Fraud Intelligence — Geographic hotspots** | Not covered | ❌ Missing | `incident_location` field exists but no aggregation or map view |
| **Operational Performance — SLA compliance** | Covered | ✅ | Workflow Analytics page; SLA compliance chart |
| **Operational Performance — Assessor performance** | Covered | ✅ | Assessor performance chart in Operational Health tab |
| **Operational Performance — Panel beater performance** | Covered | ✅ | Panel beater analytics chart; dedicated Repairer Intelligence page |
| **Operational Performance — Workflow bottlenecks** | Covered | ✅ | Workflow bottleneck chart in Operational Health tab |
| **Operational Performance — Escalations** | Partially covered | ⚠️ Partial | Escalation count in Risk Manager; not surfaced in Executive Dashboard |
| **Financial Performance — Claims paid** | Covered | ✅ | Total payouts in ROI Breakdown tab |
| **Financial Performance — Claims reserved** | Covered | ✅ | Total reserves in ROI Breakdown tab |
| **Financial Performance — Leakage detection** | Not covered | ❌ Missing | No leakage metric (approved > estimated) |
| **Financial Performance — Cost savings** | Covered | ✅ | AI savings chart; savings trend; total savings KPI |
| **Financial Performance — Recovery opportunities** | Partially covered | ⚠️ Partial | Recovery KPIs accessible to executive role but not surfaced in Executive Dashboard |

### 3.2 Summary Score

- **Fully covered:** 13 of 25 domains (52%)
- **Partially covered:** 5 of 25 domains (20%)
- **Not covered:** 7 of 25 domains (28%)

The most significant gaps for executive decision-making are: loss ratio, premium trends, geographic fraud hotspots, suspicious client patterns, settlement trends, leakage detection, and recovery opportunity surfacing.

---

## Phase 4: Dashboard Completeness Audit

### 4.1 Widget-by-Widget Assessment

| Widget | Why It Exists | Who Uses It | Decision Supported | Action Available | Data Available | Calculation Implemented | Drill-Down | Historical Trend | Flag |
|---|---|---|---|---|---|---|---|---|---|
| **Total Claims KPI** | Portfolio volume indicator | CEO, CFO | Is claims volume growing or shrinking? | Navigate to claims list | ✅ | ✅ | ✅ (claims list) | ✅ (volume chart) | None |
| **Total Savings KPI** | KINGA ROI indicator | CEO, CFO | Is KINGA generating financial value? | Navigate to ROI tab | ✅ | ✅ | ❌ | ✅ (savings trend) | None |
| **Resolution Rate KPI** | Operational efficiency | CEO, Head of Claims | Are claims being resolved? | None | ✅ | ✅ | ❌ | ❌ | **Add drill-down to completed claims** |
| **Avg Cycle Days KPI** | Speed of claims processing | CEO, Head of Claims | Are claims being processed fast enough? | None | ✅ | ✅ | ❌ | ❌ | **Add historical trend** |
| **Month Comparison Strip** | MoM performance delta | CEO, CFO | Did performance improve this month? | None | ❌ HARDCODED | ❌ HARDCODED | ❌ | ❌ | **CRITICAL: Replace with real data** |
| **Claims Volume Chart** | Volume trend over time | CEO, Head of Claims | Is claims volume trending up or down? | None | ✅ | ✅ | ❌ | ✅ | None |
| **Fraud Detection Trends** | Fraud rate over time | CEO, Risk Director | Is fraud increasing or decreasing? | None | ✅ | ✅ | ❌ | ✅ | None |
| **Cost Breakdown by Status** | Where is money going? | CFO | Are approved claims costing more than expected? | None | ✅ | ✅ | ❌ | ❌ | **Add trend** |
| **Processing Time Chart** | Stage-level processing speed | Head of Claims | Which stage is slowest? | None | ✅ | ✅ | ❌ | ❌ | **Add drill-down to stage** |
| **Fraud Risk Distribution** | Portfolio risk profile | Risk Director | What is the risk profile of the portfolio? | None | ✅ | ✅ | ❌ | ❌ | **Add trend** |
| **Override Rate Chart** | Executive override frequency | CEO, Compliance | Are executives overriding AI too often? | None | ✅ | ✅ | ❌ | ✅ | None |
| **Most Overridden Repairers** | Repairer-level override pattern | Risk Director | Which repairers are being favoured over AI? | Navigate to repairer profile | ✅ | ✅ | ⚠️ (no profile page) | ❌ | **Add drill-down to repairer** |
| **Cost Delta on Override** | Financial cost of overrides | CFO | How much is executive override costing? | None | ✅ | ✅ | ❌ | ✅ | None |
| **AI Savings Chart** | KINGA financial impact | CFO | Is KINGA saving money month on month? | None | ✅ | ✅ | ❌ | ✅ | None |
| **Workflow Bottleneck Chart** | Stage-level delay analysis | Head of Claims | Where are claims getting stuck? | None | ✅ | ✅ | ❌ | ❌ | **Add drill-down to stage** |
| **Assessor Performance Chart** | Assessor quality ranking | Head of Claims | Which assessors are underperforming? | Navigate to assessor profile | ✅ | ✅ | ⚠️ (limited) | ❌ | None |
| **Panel Beater Analytics** | Repairer quality ranking | Risk Director | Which panel beaters are overcharging? | Navigate to repairer page | ✅ | ✅ | ✅ | ❌ | None |
| **Financial Overview (4 tiles)** | Portfolio financial position | CFO | What is the total financial exposure? | None | ✅ | ✅ | ❌ | ❌ | **Add export to all 4 tiles** |
| **Savings Trend Chart** | Monthly savings trajectory | CFO | Is KINGA's financial impact growing? | None | ✅ | ✅ | ❌ | ✅ | None |
| **Governance KPIs** | Compliance and oversight | Compliance Officer, CEO | Are governance controls working? | Navigate to governance detail | ✅ | ✅ | ❌ | ❌ | **Add trend** |
| **Global Search** | Cross-portfolio claim lookup | Executive, Risk Director | Find a specific claim quickly | Navigate to claim | ✅ | ✅ | N/A | N/A | None |

### 4.2 Widgets That Do Not Support Meaningful Executive Decisions

The following widgets exist but do not currently support a meaningful executive decision:

1. **Month Comparison Strip** — hardcoded data makes it actively misleading, not just unhelpful.
2. **Comments widget** — executives can add comments to claims but cannot see the comment thread. This is a one-way action with no feedback loop.
3. **Governance KPIs** — the four governance metrics (overrides, override rate, segregation violations, role changes) are shown as static numbers with no context (what is the acceptable threshold? what triggered the change?). Without thresholds and alerts, these numbers do not support a decision.

---

## Phase 5: Executive Report Engine Design

### 5.1 Report Architecture

The Executive Report is a **period-based portfolio document** generated from the Executive Dashboard. It is distinct from the KINGA Claims Report (vehicle-specific) and the Forensic Report (vehicle-specific, dispute-grade). It is generated on demand from the Executive Dashboard and delivered as a PDF.

The report has five sections, each with its own data source, query logic, AI summary, charts, and KPIs.

---

### Section 1: Executive Summary

**Purpose:** One-page board-level snapshot. The first thing an executive reads.

**Data Source:** `claims.getExecutiveSummary`, `analytics.getKPIs`, `analytics.getFinancialOverview`, `governance.getGovernanceSummary`

**Query Logic:**
```sql
-- Portfolio status
SELECT COUNT(*) as total, 
  SUM(CASE WHEN status IN ('completed','approved') THEN 1 ELSE 0 END) as resolved,
  AVG(DATEDIFF(updated_at, created_at)) as avg_cycle_days
FROM claims WHERE tenant_id = ? AND created_at BETWEEN ? AND ?

-- Financial position
SELECT SUM(approved_amount) as paid, 
  SUM(CASE WHEN status NOT IN ('completed','rejected') THEN estimated_cost ELSE 0 END) as reserved,
  SUM(CASE WHEN status='rejected' AND fraud_risk_level='high' THEN estimated_cost ELSE 0 END) as fraud_prevented
FROM claims c LEFT JOIN ai_assessments a ON a.claim_id = c.id
WHERE c.tenant_id = ? AND c.created_at BETWEEN ? AND ?

-- Key risks
SELECT COUNT(*) as high_risk_open FROM claims c 
LEFT JOIN ai_assessments a ON a.claim_id = c.id
WHERE c.tenant_id = ? AND a.fraud_risk_level = 'high' 
AND c.status NOT IN ('completed','rejected','closed')
```

**AI Summary Logic:** LLM prompt: "You are a senior insurance analyst. Given the following portfolio metrics for [insurer] for the period [from] to [to], write a 3-paragraph executive summary covering: (1) overall portfolio health, (2) the most significant risk or concern, (3) the most significant positive development. Be specific, use the numbers provided, and write for a CFO audience."

**Charts Required:**
- Claims volume bar chart (daily, period)
- Fraud rate trend line chart (weekly, period)
- Financial position donut (paid / reserved / fraud prevented)

**KPIs Required:**
- Total claims, resolved claims, resolution rate
- Total savings, fraud prevented
- Average cycle days
- Open high-risk claims count

**Drill-Down:** None (summary page)

---

### Section 2: Claims Performance Report

**Purpose:** Detailed claims volume, severity, cycle time, and settlement analysis.

**Data Source:** `executive.getClaimsVolumeOverTime`, `executive.getAverageProcessingTime`, `executive.getCostBreakdownByStatus`, `analytics.getCostSavingsTrends`

**Query Logic:**
```sql
-- Volume by incident type
SELECT incident_type, COUNT(*) as count, AVG(total_claim_amount) as avg_amount
FROM claims WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
GROUP BY incident_type ORDER BY count DESC

-- Cycle time by stage
SELECT workflow_state, AVG(TIMESTAMPDIFF(HOUR, entered_at, exited_at)) as avg_hours
FROM workflow_audit_trail wat 
JOIN claims c ON c.id = wat.claim_id
WHERE c.tenant_id = ? AND wat.created_at BETWEEN ? AND ?
GROUP BY workflow_state ORDER BY avg_hours DESC

-- Settlement analysis: approved vs estimated
SELECT 
  AVG(c.approved_amount) as avg_approved,
  AVG(a.estimated_cost) as avg_estimated,
  AVG(c.approved_amount - a.estimated_cost) as avg_delta,
  SUM(CASE WHEN c.approved_amount > a.estimated_cost THEN c.approved_amount - a.estimated_cost ELSE 0 END) as total_leakage
FROM claims c JOIN ai_assessments a ON a.claim_id = c.id
WHERE c.tenant_id = ? AND c.status IN ('completed','approved') AND c.created_at BETWEEN ? AND ?
```

**AI Summary Logic:** "Summarise the claims performance for [insurer] for [period]. Highlight: (1) which incident type has the highest volume and cost, (2) which workflow stage has the longest average cycle time and what this means operationally, (3) the leakage figure and what it implies about settlement discipline."

**Charts Required:**
- Claims volume by incident type (horizontal bar)
- Cycle time by workflow stage (bar, sorted descending)
- Approved vs estimated cost scatter (one point per incident type)
- Leakage trend (monthly bar chart)

**KPIs Required:**
- Total claims in period
- Average claim amount (approved)
- Average cycle days
- Total leakage (approved > estimated, cumulative)
- Settlement rate (approved ÷ total closed)

**Drill-Down:** Click incident type → filtered claims list

---

### Section 3: Fraud Intelligence Report

**Purpose:** Fraud detection performance, high-risk claim analysis, anomaly patterns.

**Data Source:** `executive.getFraudDetectionTrends`, `executive.getFraudRiskDistribution`, `analytics.getRiskPortfolioAnalytics`, `crossClaim.getStats`

**Query Logic:**
```sql
-- Fraud rate trend
SELECT DATE(c.created_at) as date,
  COUNT(*) as total,
  SUM(CASE WHEN a.fraud_risk_level = 'high' THEN 1 ELSE 0 END) as high_risk,
  ROUND(SUM(CASE WHEN a.fraud_risk_level = 'high' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as fraud_rate
FROM claims c LEFT JOIN ai_assessments a ON a.claim_id = c.id
WHERE c.tenant_id = ? AND c.created_at BETWEEN ? AND ?
GROUP BY DATE(c.created_at)

-- Cross-claim signal summary
SELECT signal_type, COUNT(*) as count, SUM(score_contribution) as total_score
FROM cross_claim_signals WHERE tenant_id = ?
GROUP BY signal_type ORDER BY count DESC

-- Top fraud patterns by incident type
SELECT c.incident_type, COUNT(*) as fraud_count, AVG(a.fraud_score) as avg_score
FROM claims c JOIN ai_assessments a ON a.claim_id = c.id
WHERE c.tenant_id = ? AND a.fraud_risk_level = 'high' AND c.created_at BETWEEN ? AND ?
GROUP BY c.incident_type ORDER BY fraud_count DESC
```

**AI Summary Logic:** "You are a fraud intelligence analyst. For [insurer] in [period]: (1) describe the fraud rate trend — is it improving or deteriorating and at what rate? (2) identify the most significant fraud pattern from the cross-claim signals and what it implies about organised fraud exposure. (3) recommend one immediate action and one medium-term action."

**Charts Required:**
- Fraud rate trend line chart (weekly)
- Fraud risk distribution donut (low / medium / high / critical)
- Cross-claim signal breakdown (horizontal bar by signal type)
- Fraud by incident type (bar chart)

**KPIs Required:**
- Overall fraud rate (%)
- High-risk claims count and value
- Fraud prevented (value of rejected high-risk claims)
- Active cross-claim signals count
- Most common fraud signal type

**Drill-Down:** Click signal type → cross-claim intelligence page filtered by signal type

---

### Section 4: Operational Performance Report

**Purpose:** Workflow efficiency, SLA adherence, assessor and panel beater performance.

**Data Source:** `workflowAnalytics.*` (5 procedures), `analytics.getAssessorPerformance`, `analytics.getPanelBeaterAnalytics`, `executive.getMostOverriddenRepairers`

**Query Logic:**
```sql
-- SLA compliance by stage
SELECT workflow_state,
  COUNT(*) as total_transitions,
  SUM(CASE WHEN TIMESTAMPDIFF(HOUR, entered_at, exited_at) <= sla_hours THEN 1 ELSE 0 END) as within_sla,
  ROUND(SUM(CASE WHEN TIMESTAMPDIFF(HOUR, entered_at, exited_at) <= sla_hours THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as sla_rate
FROM workflow_audit_trail wat JOIN claims c ON c.id = wat.claim_id
WHERE c.tenant_id = ? AND wat.created_at BETWEEN ? AND ?
GROUP BY workflow_state

-- Assessor performance
SELECT u.name, 
  COUNT(ae.id) as assessments_completed,
  AVG(ae.accuracy_score) as avg_accuracy,
  AVG(ae.turnaround_hours) as avg_turnaround
FROM assessor_evaluations ae JOIN users u ON u.id = ae.assessor_id
JOIN claims c ON c.id = ae.claim_id
WHERE c.tenant_id = ? AND ae.created_at BETWEEN ? AND ?
GROUP BY u.id, u.name ORDER BY assessments_completed DESC

-- Panel beater override rate
SELECT pb.name,
  COUNT(CASE WHEN wat.executive_override = 1 THEN 1 END) as overrides,
  COUNT(*) as total_claims,
  ROUND(COUNT(CASE WHEN wat.executive_override = 1 THEN 1 END) / COUNT(*) * 100, 1) as override_rate
FROM claims c 
JOIN panel_beaters pb ON pb.id = c.panel_beater_id
JOIN workflow_audit_trail wat ON wat.claim_id = c.id
WHERE c.tenant_id = ? AND c.created_at BETWEEN ? AND ?
GROUP BY pb.id, pb.name ORDER BY override_rate DESC LIMIT 10
```

**AI Summary Logic:** "For [insurer] in [period]: (1) identify the workflow stage with the worst SLA compliance and the operational impact. (2) identify the top-performing and bottom-performing assessors and what the gap implies. (3) identify the panel beater with the highest override rate and whether this represents a risk."

**Charts Required:**
- SLA compliance by stage (horizontal bar, green/amber/red by threshold)
- Assessor performance scatter (accuracy vs turnaround)
- Panel beater override rate (bar chart, top 10)
- Workflow bottleneck (bar chart, avg hours per stage)

**KPIs Required:**
- Overall SLA compliance rate (%)
- Average assessor accuracy score
- Average assessor turnaround (hours)
- Top panel beater override rate (%)
- Total executive overrides in period

**Drill-Down:** Click assessor → assessor profile; click panel beater → repairer intelligence page

---

### Section 5: Financial Impact Report

**Purpose:** Financial performance, KINGA ROI, leakage, recovery pipeline.

**Data Source:** `analytics.getFinancialOverview`, `analytics.getCostSavingsTrends`, `executive.getTotalAISavings`, `executive.getAverageCostDeltaOnOverride`, `recovery.getKPIs`

**Query Logic:**
```sql
-- Financial overview
SELECT 
  SUM(c.approved_amount) as total_paid,
  SUM(CASE WHEN c.status NOT IN ('completed','rejected') THEN a.estimated_cost ELSE 0 END) as total_reserved,
  SUM(CASE WHEN c.status='rejected' AND a.fraud_risk_level='high' THEN a.estimated_cost ELSE 0 END) as fraud_prevented,
  SUM(CASE WHEN c.approved_amount IS NOT NULL THEN a.estimated_cost - c.approved_amount ELSE 0 END) as ai_savings,
  SUM(CASE WHEN c.approved_amount > a.estimated_cost THEN c.approved_amount - a.estimated_cost ELSE 0 END) as leakage
FROM claims c LEFT JOIN ai_assessments a ON a.claim_id = c.id
WHERE c.tenant_id = ? AND c.created_at BETWEEN ? AND ?

-- Recovery pipeline
SELECT 
  COUNT(*) as total_cases,
  SUM(recovery_potential_score) as total_potential,
  SUM(recovered_amount) as total_recovered,
  ROUND(SUM(recovered_amount) / NULLIF(SUM(approved_settlement_amount), 0) * 100, 1) as recovery_rate
FROM recovery_cases WHERE tenant_id = ?
```

**AI Summary Logic:** "For [insurer] in [period]: (1) calculate and interpret the KINGA ROI — what is the ratio of AI savings to fraud prevented vs total claims paid? (2) identify the leakage figure and what it implies about override discipline. (3) assess the recovery pipeline — is the recovery rate improving and what is the unrealised recovery opportunity?"

**Charts Required:**
- Monthly savings trend (bar chart)
- Financial position waterfall (paid → reserved → fraud prevented → leakage → net)
- Recovery pipeline funnel (open → demand sent → settled)
- Cost delta on override trend (line chart)

**KPIs Required:**
- Total claims paid
- Total reserves outstanding
- Fraud prevented (value)
- AI savings (value)
- Leakage (value)
- Recovery rate (%)
- Total unrealised recovery potential

**Drill-Down:** Click recovery KPI → Recovery Portal

---

### Section 6: Strategic Recommendations

**Purpose:** AI-generated action list based on the data in sections 1–5.

**Data Source:** All sections above (aggregated)

**AI Summary Logic:** 
```
System: You are a senior insurance strategy consultant with expertise in motor claims fraud and operational efficiency.

User: Based on the following portfolio data for [insurer] for [period]:
[Paste all KPIs from sections 1-5]

Generate a structured strategic recommendations section with:
1. IMMEDIATE ACTIONS (within 30 days): 3 specific, actionable recommendations with the data point that justifies each
2. MEDIUM-TERM ACTIONS (30-90 days): 3 recommendations that require process or system changes
3. LONG-TERM ACTIONS (90+ days): 2 recommendations that require strategic investment

For each recommendation include: the specific metric that triggered it, the recommended action, the expected outcome, and the owner (claims manager / risk manager / executive / operations).
```

**Charts Required:** None (text section)

**KPIs Required:** None (narrative section)

---

## Deliverable A: Navigation Map

```
Executive Role — Navigation Structure
├── Overview
│   └── Executive Dashboard (/insurer-portal/executive)
│       ├── Tab: Overview
│       │   ├── KPI Cards (4): Total Claims, Total Savings, Resolution Rate, Avg Cycle Days
│       │   ├── Month Comparison Strip [❌ HARDCODED — always shows MAY 2026 vs APRIL 2026]
│       │   ├── Fraud Rate KPI
│       │   ├── Fraud Exposure KPI
│       │   └── Executive Analytics Charts (9 charts)
│       ├── Tab: Operational Health
│       │   ├── Assessor Performance Chart
│       │   ├── Panel Beater Analytics Chart
│       │   └── Workflow Bottleneck Chart
│       ├── Tab: ROI Breakdown
│       │   ├── Financial Overview (4 tiles: Payouts, Reserves, Fraud Prevented, Net Exposure)
│       │   └── Savings Trend Chart
│       └── Tab: Governance
│           ├── Override Rate KPI
│           ├── Segregation Violations KPI
│           ├── Role Changes KPI
│           └── Override Rate Trend
│
├── Portfolio
│   ├── Savings Tracker (/insurer-portal/executive?tab=financials)
│   │   └── [Same as ROI Breakdown tab — DUPLICATE NAVIGATION]
│   ├── Fraud Analytics (/insurer/fraud-analytics)
│   │   └── [⚠️ Route exists; thin page — uses getKPIs fraud fields only]
│   └── Repairer Intelligence (/insurer/panel-beater-performance)
│       └── PanelBeaterPerformance page — full table with real data
│
└── Analytics & Reports
    ├── Workflow Analytics (/insurer-portal/workflow-analytics)
    │   └── WorkflowAnalyticsDashboard — 5 charts with real SQL
    ├── Relationship Intelligence (/insurer-portal/relationship-intelligence)
    │   └── RelationshipIntelligence — 7 procedures with real SQL
    └── Reports Centre (/insurer-portal/reports-centre)
        ├── Claim Reports: assessment, forensic, audit_trail, cost_comparison, repair_decision
        ├── Portfolio Reports: claims_summary, fraud_summary, assessor_performance, panel_beater_performance, dwell_time
        ├── Executive Reports: insurer_summary, claims_trend, financial_exposure [✅ implemented]
        ├── Governance Reports: sar, regulatory_compliance, data_retention
        └── Recovery Reports: case_summary, performance, third_party_profiles [❌ NO HANDLER — will throw error]
```

---

## Deliverable B: Data Lineage Matrix

| Metric | DB Table(s) | Procedure | Calculation | Refresh | Status |
|---|---|---|---|---|---|
| Total Claims | `claims` | `claims.getExecutiveSummary` | `COUNT(*)` | On demand | ✅ |
| Total Savings | `claims`, `ai_assessments` | `claims.getExecutiveSummary` | `SUM(estimated_cost - approved_amount)` | On demand | ✅ |
| Resolution Rate | `claims` | `claims.getExecutiveSummary` | `completed / total * 100` | On demand | ✅ |
| Avg Cycle Days | `claims`, `workflow_audit_trail` | `claims.getExecutiveSummary` | `AVG(completed_at - created_at)` | On demand | ✅ |
| Month Comparison | None | None | Hardcoded fixture | Never | ❌ HARDCODED |
| Fraud Rate | `claims`, `ai_assessments` | `analytics.getKPIs` | `high_risk / total * 100` | On demand | ✅ |
| Fraud Exposure | `claims`, `ai_assessments` | `analytics.getKPIs` | `SUM(estimated_cost) WHERE high_risk AND open` | On demand | ✅ |
| Total Payouts | `claims` | `analytics.getFinancialOverview` | `SUM(approved_amount)` | On demand | ✅ |
| Total Reserves | `claims`, `ai_assessments` | `analytics.getFinancialOverview` | `SUM(estimated_cost) WHERE open` | On demand | ✅ |
| Fraud Prevented | `claims`, `ai_assessments` | `analytics.getFinancialOverview` | `SUM(estimated_cost) WHERE rejected AND high_risk` | On demand | ✅ |
| Net Exposure | Derived | `analytics.getFinancialOverview` | `payouts + reserves` | On demand | ⚠️ Wrong formula |
| Override Rate | `workflow_audit_trail`, `claims` | `executive.getOverrideRate` | `overrides / claims * 100` | On demand | ✅ |
| Segregation Violations | `claim_involvement_tracking`, `claims` | `governance.getGovernanceSummary` | `claim-user pairs with >1 stage` | On demand | ✅ |
| AI Savings | `claims`, `ai_assessments` | `executive.getTotalAISavings` | `SUM(estimated_cost - approved_amount)` | On demand | ✅ |
| Cost Delta on Override | `workflow_audit_trail`, `claims`, `ai_assessments` | `executive.getAverageCostDeltaOnOverride` | `AVG(approved - estimated) WHERE override=1` | On demand | ✅ |
| Claims Volume Over Time | `claims` | `executive.getClaimsVolumeOverTime` | `COUNT(*) GROUP BY DATE` | On demand | ✅ |
| Fraud Detection Trends | `claims`, `ai_assessments` | `executive.getFraudDetectionTrends` | `SUM(high/medium/low) GROUP BY DATE` | On demand | ✅ |
| Loss Ratio | None | None | Not implemented | Never | ❌ MISSING |
| Leakage | None | None | Not implemented | Never | ❌ MISSING |
| Geographic Hotspots | `claims.incident_location` | None | Not implemented | Never | ❌ MISSING |
| Suspicious Clients | `cross_claim_signals` | `crossClaim.*` (exists) | Not surfaced in executive view | On demand | ⚠️ Exists, not surfaced |
| Recovery Pipeline | `recovery_cases` | `recovery.getKPIs` (exists) | Not surfaced in executive view | On demand | ⚠️ Exists, not surfaced |

---

## Deliverable C: Orphaned Feature Register

| Feature | Location | Issue | Impact | Priority |
|---|---|---|---|---|
| **Month Comparison Strip** | `ExecutiveDashboard.tsx` line 556 | Hardcoded `DEMO_MONTH_COMPARISON` — always shows MAY 2026 vs APRIL 2026 regardless of real data | Actively misleads executives with stale fixture data | **CRITICAL** |
| **Recovery Reports in Reports Centre** | `reportDefinitions.ts` switch statement | `recovery.case_summary`, `recovery.performance`, `recovery.third_party_profiles` have no case handler | Generates `Unknown report key` error when executive attempts to generate recovery reports | **CRITICAL** |
| **Savings Tracker nav item** | `InsurerPortalLayout.tsx` line 162 | Links to `/insurer-portal/executive?tab=financials` — same as the ROI Breakdown tab in the Executive Dashboard | Duplicate navigation; confusing UX | **MEDIUM** |
| **Comments widget (executive view)** | `ExecutiveDashboard.tsx` | Executive can add comments but cannot see comment thread | One-way action with no feedback | **LOW** |
| **Net Exposure calculation** | `analytics.getFinancialOverview` | `netExposure = totalPayouts + totalReserves` — additive, not subtractive | Overstates exposure; should be `totalReserves - totalRecovered` | **HIGH** |
| **Governance KPIs — no thresholds** | `ExecutiveDashboard.tsx` Governance tab | Override rate, segregation violations shown as raw numbers with no acceptable threshold or alert | Numbers without context do not support decisions | **MEDIUM** |

---

## Deliverable D: Missing Integration Register

| Missing Feature | Business Value | Source Tables Available | Implementation Effort | Priority |
|---|---|---|---|---|
| **Month Comparison — real backend procedure** | Enables MoM performance tracking with real data | `claims`, `ai_assessments` | Low (2 days) — SQL aggregation by month | **CRITICAL** |
| **Recovery reports case handlers** | Enables executive to generate recovery performance reports | `recovery_cases` | Low (1 day) — implement 3 generator functions | **CRITICAL** |
| **Leakage metric** | Identifies claims paid above AI estimate — key financial discipline indicator | `claims.approved_amount`, `ai_assessments.estimated_cost` | Low (1 day) — add to `getFinancialOverview` | **HIGH** |
| **Cross-claim signals in executive view** | Surfaces organised fraud exposure at portfolio level | `cross_claim_signals` — procedure exists | Low (1 day) — add widget to executive dashboard | **HIGH** |
| **Recovery pipeline in executive view** | Surfaces unrealised recovery opportunity | `recovery_cases` — procedure exists | Low (1 day) — add KPI tile to executive dashboard | **HIGH** |
| **Date range filter on executive dashboard** | Enables quarterly and annual performance review | All existing procedures support `from`/`to` params | Medium (3 days) — add date picker, wire to all queries | **HIGH** |
| **Geographic fraud hotspot map** | Identifies geographic concentration of fraud | `claims.incident_location` field exists | Medium (3 days) — aggregation + map widget | **MEDIUM** |
| **Settlement trend chart** | Shows whether settlements are trending above or below estimates | `claims.approved_amount`, `claims.estimated_claim_value` | Low (1 day) — add to Claims Performance section | **MEDIUM** |
| **Reserve adequacy ratio** | Shows whether reserves are sufficient vs open claim exposure | `claims`, `ai_assessments` | Low (1 day) — add to Financial Overview | **MEDIUM** |
| **Governance thresholds and alerts** | Makes governance KPIs actionable | Existing governance data | Low (1 day) — add configurable thresholds | **MEDIUM** |
| **Executive Report — AI-generated sections** | Transforms data into narrative for board consumption | All existing procedures | High (5 days) — LLM integration per section | **HIGH** |
| **Loss ratio** | Core insurance KPI — cannot be calculated without premium data | `tenants` table — no premium fields | High (requires schema change + data input) | **LOW** (schema gap) |

---

## Deliverable E: Executive Dashboard Improvement Plan

### Immediate Fixes (Week 1)

**1. Replace hardcoded Month Comparison Strip with real data**
- Implement `analytics.getMonthComparison` procedure: query current month vs prior month for 6 KPIs (total claims, resolution rate, avg cycle days, fraud rate, total savings, avg claim cost)
- Replace `DEMO_MONTH_COMPARISON` with real data, with demo fallback when no data
- Make month labels dynamic based on current date

**2. Fix Recovery Reports in Reports Centre**
- Add `case "recovery.case_summary"`, `case "recovery.performance"`, `case "recovery.third_party_profiles"` to the `generateReportHtml` switch
- Implement `generateRecoveryCaseSummaryReport`, `generateRecoveryPerformanceReport`, `generateRecoveryThirdPartyProfilesReport` functions

**3. Fix Net Exposure calculation**
- Change `netExposure = totalPayouts + totalReserves` to `netExposure = totalReserves - totalRecovered` where `totalRecovered` is from `recovery_cases`

### Short-Term Improvements (Weeks 2–3)

**4. Add date range filter to Executive Dashboard**
- Add a date range picker (preset options: Last 30 days, Last 90 days, Last 6 months, Last 12 months, Custom)
- Wire to all `getExecutiveSummary`, `getKPIs`, `getFinancialOverview`, and all `executive.*` procedures

**5. Add Leakage metric to Financial Overview**
- Add `leakage: SUM(approved_amount - estimated_cost) WHERE approved_amount > estimated_cost` to `getFinancialOverview`
- Add leakage tile to the Financial Overview card (5th tile)
- Add leakage trend to the Savings Trend chart

**6. Surface Cross-Claim Signals in Executive Dashboard**
- Add a "Portfolio Fraud Signals" widget to the Overview tab
- Show: total active signals, breakdown by signal type (top 3), total score contribution
- Link to Cross-Claim Intelligence page

**7. Surface Recovery Pipeline in Executive Dashboard**
- Add a "Recovery Pipeline" KPI tile to the ROI Breakdown tab
- Show: total open cases, total potential recovery, current recovery rate
- Link to Recovery Portal

**8. Add Governance Thresholds**
- Add configurable threshold fields to the `tenants` table (override_rate_threshold, segregation_violation_threshold)
- Show RAG (red/amber/green) status on governance KPIs based on thresholds

### Medium-Term Improvements (Month 2)

**9. Geographic Fraud Hotspot Map**
- Aggregate `claims.incident_location` by geographic area
- Add a choropleth map widget to the Fraud Intelligence section
- Colour intensity by fraud rate per area

**10. Executive Report with AI Summaries**
- Implement the 5-section Executive Report as specified in Phase 5
- Wire to the Reports Centre as `executive.full_report`
- Add "Generate Executive Report" button to the Executive Dashboard header

**11. Settlement Trend Chart**
- Add monthly `AVG(approved_amount / estimated_cost)` trend to the ROI Breakdown tab
- Show as a line chart with a 1.0 reference line (approved = estimated)

---

## Deliverable F: Executive Report Specification

See Phase 5 above for the full specification of all 5 report sections.

**Report Metadata:**
- Report key: `executive.full_report`
- Access: `executive`, `insurer_admin`
- Parameters: `fromTs`, `toTs`, `tenantId`
- Output: PDF (rendered via `renderAndUpload`)
- Estimated generation time: 15–25 seconds (5 SQL queries + 5 LLM calls)
- Classification: CONFIDENTIAL

**Report Structure:**
1. Cover page (insurer name, period, generated by, classification)
2. Executive Summary (1 page)
3. Claims Performance Report (2 pages)
4. Fraud Intelligence Report (2 pages)
5. Operational Performance Report (2 pages)
6. Financial Impact Report (2 pages)
7. Strategic Recommendations (1 page)
8. Data appendix (raw KPI table)

**Total pages:** 11–12 pages

---

## Deliverable G: Implementation Priority Matrix

| Item | Priority | Effort | Impact | Owner |
|---|---|---|---|---|
| Fix Month Comparison Strip (real data) | **CRITICAL** | Low (2 days) | High — removes actively misleading data | Backend dev |
| Fix Recovery Reports (add case handlers) | **CRITICAL** | Low (1 day) | High — unblocks report generation | Backend dev |
| Fix Net Exposure calculation | **HIGH** | Low (0.5 days) | High — corrects financial reporting | Backend dev |
| Add Leakage metric | **HIGH** | Low (1 day) | High — key financial discipline KPI | Backend dev |
| Surface Cross-Claim Signals in exec view | **HIGH** | Low (1 day) | High — surfaces organised fraud risk | Frontend dev |
| Surface Recovery Pipeline in exec view | **HIGH** | Low (1 day) | High — surfaces unrealised financial opportunity | Frontend dev |
| Add date range filter to exec dashboard | **HIGH** | Medium (3 days) | High — enables quarterly/annual review | Full-stack dev |
| Executive Report with AI summaries | **HIGH** | High (5 days) | Very High — flagship deliverable | Full-stack + AI |
| Add Governance Thresholds | **MEDIUM** | Low (1 day) | Medium — makes governance KPIs actionable | Full-stack dev |
| Settlement Trend Chart | **MEDIUM** | Low (1 day) | Medium — settlement discipline visibility | Frontend dev |
| Geographic Fraud Hotspot Map | **MEDIUM** | Medium (3 days) | Medium — geographic risk concentration | Full-stack dev |
| Remove Savings Tracker duplicate nav | **MEDIUM** | Low (0.5 days) | Low — UX cleanup | Frontend dev |
| Loss Ratio (requires premium schema) | **LOW** | High (5+ days) | High when implemented — requires schema change | Architect + dev |
| Comments thread in executive view | **LOW** | Low (1 day) | Low — UX improvement | Frontend dev |

**Total estimated effort for Critical + High items:** ~15 development days  
**Total estimated effort for all items:** ~26 development days

---

*End of KINGA Executive Portal Audit Report v1.0*
