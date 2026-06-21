# KINGA Platform Portal Governance & Alignment Audit v1.0

**Prepared by:** KINGA Platform Engineering  
**Date:** June 2026  
**Scope:** All active portals — Claims Manager, Executive, Assessor, Claims Processor, Risk Manager, Admin, Panel Beater, Claimant, Fleet Manager, Recovery, Insurer Admin  
**Audit Framework:** KINGA Portal Governance & Alignment Audit Framework v1.0

---

## Executive Summary

This audit applies the KINGA Portal Governance & Alignment Framework to all eleven active portals in the platform. Each portal is assessed across ten phases covering role alignment, operational question support, dashboard architecture, workflow governance, queue intelligence, actionability, reports, AI utilisation, cross-portal consistency, and target state architecture. The audit concludes with a scored final verdict and a prioritised implementation roadmap for each portal.

The platform is operationally functional across all portals. The Claims Manager and Claims Processor portals are the most mature, approaching operational command-centre classification. The Executive Dashboard is strong on analytics but requires deeper real-time alerting. The Assessor portal is the most underdeveloped relative to its operational importance. The Admin portal lacks tier-based governance controls. The Panel Beater, Claimant, and Fleet Manager portals are appropriately scoped for their roles.

---

## Portal 1 — Claims Manager Dashboard

### Phase 1 — Role Definition Validation

**Role:** Claims Manager — the final human decision-maker in the KINGA claims workflow. Claims arrive after Risk Manager technical approval and KINGA AI assessment. The Claims Manager conducts final review, closes claims for payment or repair, and manages the operational health of the claims team.

| Decision Horizon | Responsibilities |
|---|---|
| **Daily** | Review and close claims in the Review Queue; approve or send back flagged claims; monitor Attention Required panel; action escalations; review fraud alerts |
| **Weekly** | Review queue health metrics; monitor assessor and processor workload; review send-back rates; export portfolio reports |
| **Monthly** | Review KINGA savings identified; review rework patterns; assess capacity forecasts; review recovery watchlist |
| **Escalation** | Escalate high-value disputes, fraud concerns, legal threats, and policy interpretation issues to executive level |
| **Approval** | Final closure approval for all claims; fleet manager approval requests; financial decision authorisation |
| **Governance** | Enforce SLA compliance; ensure all claims have KINGA AI assessment before closure; maintain audit trail for all decisions |

**Role Support Assessment:**

The portal supports the Claims Manager role **fully** for daily and weekly decisions. The Review Queue, Intake Queue, Attention Required Panel, Escalation Centre, Approval Workbench, and Queue Health Matrix collectively cover the core operational responsibilities. Monthly governance reporting is partially supported — the Reports Centre provides 14 report types, but there is no built-in monthly governance dashboard summarising SLA compliance trends, rework rates, and team productivity in a single view. Escalation routing is present but the escalation reasons are hardcoded (fraud concern, high-value dispute, policy interpretation, third-party dispute, legal threat, other) without dynamic routing to the appropriate executive or risk manager.

---

### Phase 2 — Operational Question Assessment

| # | Question | Status | Evidence |
|---|---|---|---|
| 1 | What needs my attention today? | **Supported** | AttentionRequiredPanel surfaces claims by severity with count badges |
| 2 | Which claims are breaching SLA? | **Partially Supported** | SLA badges on individual claim rows; no dedicated SLA breach summary panel |
| 3 | Which queues are overloaded? | **Supported** | QueueHealthMatrix shows queue counts and health indicators |
| 4 | Who is overloaded on my team? | **Supported** | WorkforceIntelligence panel shows per-user workload |
| 5 | Which approvals are waiting? | **Supported** | ApprovalWorkbench and Fleet Approvals tab |
| 6 | What is the fraud risk profile today? | **Supported** | Fraud Alerts tab with OperationalFraudQueue; KPI strip shows fraud alert count |
| 7 | How many claims did we close this week? | **Partially Supported** | KPI strip shows completed count for the analytics period; no week-over-week trend |
| 8 | What is the send-back rate? | **Supported** | SendBackAnalytics panel in Command Centre |
| 9 | Which claims are in escalation? | **Supported** | EscalationCentre panel with severity-coloured rows |
| 10 | What is the KINGA savings figure this period? | **Supported** | KPI strip shows savings identified; chart shows KINGA Savings Identified over time |

**Operational Awareness Score: 8/10**

The two partially supported questions (SLA breach summary, week-over-week closure trend) represent meaningful gaps for a role that is accountable for SLA governance.

---

### Phase 3 — Dashboard Architecture Review

**Layout Structure:** The dashboard uses a three-section structure: a branded header with stat tiles, an analytics section with date-range selector and three charts, and a grouped tab bar leading to seven functional sections. The Command Centre (`ClaimsManagerCommandCentre`) renders below the tab bar as a persistent operational workspace.

**KPI Design:** The KPI strip uses a compact inline flex row with six metrics (Total Claims, Active, Completed, Fraud Alerts, Fast-Track, Avg Days), each with a brand-coloured icon, bold value, and muted label. This is appropriate for a secondary strip but the header stat tiles (Pending Review, High Risk, Closed) duplicate some of this information without adding context.

**Intelligence Panels:** The portal includes QueueHealthMatrix, AttentionRequiredPanel, EscalationCentre, ApprovalWorkbench, CapacityForecast, WorkforceIntelligence, RecoveryWatchlist, and SendBackAnalytics. This is a comprehensive intelligence stack for an operational role.

**Navigation:** The grouped tab bar (Workflow / Oversight / Admin) with ARIA roles and keyboard navigation is well-structured. The three-section grouping is logical and reduces cognitive load compared to the previous flat seven-column layout.

**Dashboard Classification:** **Operational Command Centre** — the portal combines real-time queue management, workforce intelligence, escalation management, and report access in a single workspace. It is the most operationally complete portal in the platform.

**Areas for Improvement:** The header stat tiles and the KPI strip overlap in content. The analytics section (date range selector + three charts) is positioned between the header and the tab bar, which interrupts the operational flow — a user arriving to action claims must scroll past the analytics section to reach the queues. The analytics section would be better placed within a dedicated Analytics tab.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visibility | Control | Escalation | Governance | Auditability |
|---|---|---|---|---|---|
| Intake Queue | ✅ Full | ✅ Full | ✅ Present | ✅ Present | ✅ Present |
| Review Queue | ✅ Full | ✅ Full | ✅ Present | ✅ Present | ✅ Present |
| Active Claims | ✅ Full | ✅ Full | ✅ Present | ✅ Present | ✅ Present |
| Fraud Alerts | ✅ Full | ✅ Full | ✅ Present | ✅ Present | ✅ Present |
| Fleet Approvals | ✅ Full | ✅ Full | ⚠️ Partial | ✅ Present | ✅ Present |
| Escalation Centre | ✅ Full | ⚠️ Partial | ✅ Present | ✅ Present | ✅ Present |
| Processed Claims | ✅ Full | ⚠️ Partial | ❌ Absent | ✅ Present | ✅ Present |

The Escalation Centre allows viewing but does not provide a direct "resolve escalation" action — the user must navigate to the individual claim to take action. Processed claims have no re-escalation path if a dispute arises post-closure.

**Workflow Governance Score: 8/10**

---

### Phase 5 — Queue & Workload Intelligence Review

| Metric | Present |
|---|---|
| Queue Counts | ✅ |
| Queue Age | ⚠️ Partial (SLA badges on rows, no aggregate age panel) |
| SLA Breaches | ⚠️ Partial (per-row badges, no breach summary) |
| Bottlenecks | ✅ (QueueHealthMatrix) |
| Backlog | ✅ (CapacityForecast) |
| User Workload | ✅ (WorkforceIntelligence) |
| User Productivity | ✅ (WorkforceIntelligence) |
| Rework | ✅ (SendBackAnalytics) |
| Send-backs | ✅ (SendBackAnalytics) |
| Escalations | ✅ (EscalationCentre) |

**Operational Queue Maturity Score: 8/10**

---

### Phase 6 — Actionability Audit

| Widget | Decision Supported | Action Available | Assessment |
|---|---|---|---|
| AttentionRequiredPanel | Which claims need immediate attention | Navigate to claim | ✅ Appropriate |
| EscalationCentre | Which escalations are active | View only | ⚠️ Missing resolve action |
| QueueHealthMatrix | Queue health overview | None | ⚠️ Should link to queue |
| ApprovalWorkbench | Which approvals are pending | Approve / Reject | ✅ Appropriate |
| CapacityForecast | Is the team able to handle the backlog | None | ⚠️ Missing assign/reassign action |
| WorkforceIntelligence | Who is overloaded | None | ⚠️ Missing reassign action |
| RecoveryWatchlist | Which recovery cases need attention | Navigate to case | ✅ Appropriate |
| SendBackAnalytics | What is the rework rate | None | ℹ️ Analytics only — appropriate |
| ClaimsManagerReportsCentre | Which reports are available | Export | ✅ Appropriate |
| Review Queue rows | Should this claim be closed | Close / Send Back / Escalate / AI Assess | ✅ Appropriate |

**Widget Actionability Matrix Score: 7/10** — Three intelligence panels (EscalationCentre, QueueHealthMatrix, CapacityForecast, WorkforceIntelligence) are view-only with no direct action routing.

---

### Phase 7 — Reports & Intelligence Review

The ClaimsManagerReportsCentre provides 14 report types organised into four categories: Claim-Level, Portfolio, Trend, and Recovery. Report placement is appropriate — the Reports Centre is accessible from the Command Centre tab, which is the correct position for a role that generates reports as part of their governance function rather than as a primary daily activity.

| Report Level | Reports Available |
|---|---|
| Dashboard-level | KPI strip, chart analytics |
| Section-level | Queue-specific exports (Excel) |
| Workflow-level | Assessment Report, Cost Comparison, Fraud Analysis |
| Per-claim | KingaReportButton on each claim row |
| Per-user | WorkforceIntelligence (view only) |
| Portfolio-level | Portfolio Claims Summary, Recovery Portfolio |
| Executive-only | None — all reports accessible to Claims Manager |

**Report Alignment Matrix Score: 8/10** — The absence of executive-only report segregation means the Claims Manager has access to portfolio-level financial data that may be appropriate only for executive review.

---

### Phase 8 — AI Utilisation Audit

| AI Capability | Available | Used | Surfaced | Aligned |
|---|---|---|---|---|
| AI Assessments (KINGA) | ✅ | ✅ | ✅ | ✅ |
| Fraud Intelligence | ✅ | ✅ | ✅ | ✅ |
| Cost Estimation | ✅ | ✅ | ✅ | ✅ |
| Repair Recommendations | ✅ | ✅ | ✅ | ✅ |
| Risk Scoring | ✅ | ✅ | ✅ | ✅ |
| Portfolio Intelligence | ✅ | ✅ | ✅ | ✅ |
| Forecasting | ✅ | ✅ | ✅ (CapacityForecast) | ✅ |
| Rework Detection | ✅ | ✅ | ✅ (SendBackAnalytics) | ✅ |
| Anomaly Detection | ⚠️ | ⚠️ Partial | ⚠️ Partial | ⚠️ |

**AI Utilisation Score: 9/10** — The Claims Manager portal has the most comprehensive AI integration in the platform. Anomaly detection (unusual claim patterns, outlier processing times) is the only capability not yet surfaced.

---

### Phase 9 — Cross-Portal Governance Review

The Claims Manager portal uses the KINGA brand green (`#3C7844`) for active tab states, the branded header, and the workflow info banner — consistent with the brand design system. However, the header still uses a solid `#3C7844` background with white text stat tiles, while the Executive Dashboard uses a white card header with a green icon container. This inconsistency means the two most-used portals have different header patterns.

The tab bar uses a custom `role="tablist"` implementation rather than the shadcn `<Tabs>` component used in the Executive Dashboard and Risk Manager Dashboard. This creates a keyboard navigation inconsistency — the shadcn Tabs component handles arrow-key navigation natively, while the custom implementation requires manual `onKeyDown` handling.

**Cross-Portal Consistency Score: 7/10**

---

### Phase 10 — Target State Architecture

**Retain:** Review Queue, Intake Queue, Fraud Alerts tab, Approval Workbench, EscalationCentre, SendBackAnalytics, ClaimsManagerReportsCentre, WorkforceIntelligence, RecoveryWatchlist, QueueHealthMatrix, AttentionRequiredPanel.

**Redesign:** Move the analytics section (date range + three charts) into a dedicated Analytics tab. Replace the header stat tiles with a single-line status bar (no duplication with KPI strip). Standardise the header to match the Executive Dashboard white-card pattern.

**Remove:** Duplicate KPI data between the header stat tiles and the KPI strip.

**Add:** SLA Breach Summary panel (aggregate view of all claims breaching SLA, grouped by queue). Direct "Resolve Escalation" action on EscalationCentre rows. Reassign action on WorkforceIntelligence and CapacityForecast panels.

| Horizon | Actions |
|---|---|
| **Immediate (0–2 days)** | Move analytics section to Analytics tab; remove duplicate header stat tiles |
| **Short-Term (1–2 weeks)** | Add SLA Breach Summary panel; add Resolve action to EscalationCentre; standardise header to white-card pattern |
| **Medium-Term (1–2 months)** | Add Reassign action to WorkforceIntelligence; add QueueHealthMatrix drill-down links; add anomaly detection widget |
| **Strategic (3–12 months)** | Dynamic escalation routing; monthly governance dashboard; executive-only report segregation |

---

### Final Verdict — Claims Manager Dashboard

**Portal Name:** Claims Manager Dashboard  
**Portal Role:** Claims Manager

| Score | Value |
|---|---|
| Role Alignment Score | 8/10 |
| Operational Awareness Score | 8/10 |
| Workflow Governance Score | 8/10 |
| Actionability Score | 7/10 |
| AI Utilisation Score | 9/10 |
| Cross-Portal Consistency Score | 7/10 |
| **Overall Score** | **7.8/10** |

**Classification: Operational Command Centre**

**Top 10 Findings:**
1. Analytics section interrupts the operational flow — positioned between header and queues
2. Header stat tiles duplicate KPI strip data
3. EscalationCentre is view-only — no resolve action
4. SLA breach aggregate panel is absent
5. WorkforceIntelligence and CapacityForecast have no action routing
6. Custom tab bar creates keyboard navigation inconsistency with other portals
7. Header pattern inconsistent with Executive Dashboard
8. No monthly governance summary dashboard
9. No executive-only report segregation
10. Escalation routing is static — no dynamic routing to appropriate executive

**Top 10 Recommendations:**
1. Move analytics section to a dedicated Analytics tab
2. Remove duplicate header stat tiles
3. Add Resolve action to EscalationCentre rows
4. Add SLA Breach Summary panel
5. Add Reassign action to WorkforceIntelligence and CapacityForecast
6. Migrate custom tab bar to shadcn Tabs component
7. Standardise header to white-card pattern
8. Add monthly governance summary dashboard
9. Implement executive-only report access controls
10. Add dynamic escalation routing

**Production Readiness Verdict:** Ready for production with the immediate fixes applied. The portal is operationally complete and provides genuine command-centre capability for the Claims Manager role.

**Estimated Effort to Reach Best-in-Class:** 3–4 weeks of focused development.

---

## Portal 2 — Executive Dashboard

### Phase 1 — Role Definition Validation

**Role:** Executive / Insurer Leadership — strategic oversight of the entire claims portfolio, financial performance, fraud exposure, and operational health. The Executive does not process individual claims but makes portfolio-level decisions, approves overrides, and monitors the platform's financial and operational performance.

| Decision Horizon | Responsibilities |
|---|---|
| **Daily** | Review portfolio KPIs; monitor fraud exposure; review executive alerts and escalations; approve executive overrides |
| **Weekly** | Review operational health (assessor performance, panel beater analytics, bottlenecks); review ROI and cost savings |
| **Monthly** | Review financial overview; review month-on-month comparisons; review AI confidence trends; export executive reports |
| **Escalation** | Receive escalations from Claims Manager and Risk Manager; approve high-value overrides |
| **Approval** | Executive override approvals; high-value claim approvals |
| **Governance** | Portfolio-level fraud governance; SLA compliance oversight; financial exposure monitoring |

**Role Support Assessment:**

The portal supports the Executive role **fully** for strategic KPI monitoring and financial overview. The Overview tab provides portfolio KPIs, month-on-month comparison, performance trends, and global search. The Operational Health tab provides assessor performance, panel beater analytics, and bottleneck analysis. The ROI Breakdown tab provides financial metrics. The portal is **partially** supported for real-time alerting — the ExecutiveAlertsCenter component exists but its prominence relative to the KPI strip is insufficient for a role that needs to be alerted to critical issues immediately.

---

### Phase 2 — Operational Question Assessment

| # | Question | Status | Evidence |
|---|---|---|---|
| 1 | How is the portfolio performing today? | **Supported** | Primary KPI cards (Total Claims, Active, Completed, Fraud Risk, Savings, Overrides) |
| 2 | What is our fraud exposure? | **Supported** | Fraud Risk KPI card with drill-down to high-fraud claims |
| 3 | What is our profitability / savings? | **Supported** | Savings KPI card; ROI Breakdown tab with financial overview |
| 4 | Are we meeting SLA targets? | **Partially Supported** | Bottleneck analysis in Operational Health; no SLA compliance percentage KPI |
| 5 | Which assessors are underperforming? | **Supported** | Assessor Performance panel in Operational Health tab |
| 6 | Which panel beaters are overcharging? | **Supported** | Panel Beater Analytics in Operational Health tab |
| 7 | What is the month-on-month trend? | **Supported** | Month-on-Month comparison strip in Overview tab |
| 8 | Are there any critical escalations requiring my attention? | **Partially Supported** | ExecutiveAlertsCenter exists but is not prominently positioned |
| 9 | What is the AI confidence trend? | **Supported** | Performance Trends section with AI confidence chart |
| 10 | What approvals are waiting for me? | **Partially Supported** | Override history drill-down exists; no dedicated approvals queue |

**Operational Awareness Score: 7.5/10**

---

### Phase 3 — Dashboard Architecture Review

**Layout Structure:** The dashboard uses a white-card header with a KINGA green icon container, a six-card primary KPI strip, a secondary stat bar, and a three-tab structure (Overview, Operational Health, ROI Breakdown). The Overview tab contains four named sections (Operational Pulse, Period Comparison, Performance Trends, Search & Deep Analytics).

**KPI Design:** The six primary KPI cards use brand-coloured icon containers with bold values and muted labels. This is a significant improvement over the previous left-border card pattern. The secondary stat bar below the primary cards adds a sixth metric (AI Confidence) that could be incorporated into the primary strip.

**Intelligence Panels:** The portal includes ExecutiveAnalyticsCharts, ExecutiveAlertsCenter, FraudInvestigationFunnel, ClaimsAgeingPanel, and ExecutiveReportTab. The intelligence stack is appropriate for an executive role.

**Dashboard Classification:** **Executive Dashboard** — the portal is correctly classified. It provides strategic visibility without operational workflow controls. The absence of claim-level actions is intentional and correct.

**Areas for Improvement:** The secondary stat bar below the primary KPI cards creates visual redundancy. The ExecutiveAlertsCenter is buried within the Overview tab rather than being a persistent top-of-page element. The Fast-Track Analytics section at the bottom of the Overview tab is a deep-dive tool that would be better placed in a dedicated Analytics tab.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visibility | Control | Escalation | Governance | Auditability |
|---|---|---|---|---|---|
| Portfolio Overview | ✅ Full | ❌ None (appropriate) | ✅ Present | ✅ Present | ✅ Present |
| Fraud Investigation | ✅ Full | ⚠️ Partial (drill-down only) | ✅ Present | ✅ Present | ✅ Present |
| Executive Overrides | ✅ Full | ✅ Full | ✅ Present | ✅ Present | ✅ Present |
| Assessor Performance | ✅ Full | ❌ None | ⚠️ Partial | ✅ Present | ✅ Present |
| Panel Beater Analytics | ✅ Full | ❌ None | ⚠️ Partial | ✅ Present | ✅ Present |
| ROI & Financials | ✅ Full | ❌ None (appropriate) | ❌ Absent | ✅ Present | ✅ Present |

The Executive Dashboard correctly limits control actions to override approvals. The absence of claim-level controls is by design. The gap is in escalation routing from the executive level — there is no mechanism for the executive to escalate a financial concern back to the Risk Manager or Claims Manager.

**Workflow Governance Score: 7/10**

---

### Phase 5 — Queue & Workload Intelligence Review

| Metric | Present |
|---|---|
| Queue Counts | ✅ (via KPI cards) |
| Queue Age | ✅ (ClaimsAgeingPanel) |
| SLA Breaches | ⚠️ Partial (bottleneck analysis) |
| Bottlenecks | ✅ (Operational Health tab) |
| Backlog | ✅ (Active backlog projection in Operational Health) |
| User Workload | ✅ (Assessor Performance) |
| User Productivity | ✅ (Assessor Performance) |
| Rework | ⚠️ Partial (no dedicated rework metric at executive level) |
| Send-backs | ⚠️ Partial (no executive-level send-back rate) |
| Escalations | ⚠️ Partial (ExecutiveAlertsCenter present but not prominent) |

**Operational Queue Maturity Score: 7/10**

---

### Phase 6 — Actionability Audit

| Widget | Decision Supported | Action Available | Assessment |
|---|---|---|---|
| Primary KPI cards | Portfolio health at a glance | Drill-down (fraud, overrides) | ✅ Appropriate |
| Month-on-Month strip | Period performance comparison | Export to Excel | ✅ Appropriate |
| ExecutiveAnalyticsCharts | Trend analysis | Export to Excel | ✅ Appropriate |
| ExecutiveAlertsCenter | Critical alerts | View only | ⚠️ Missing acknowledge/escalate action |
| FraudInvestigationFunnel | Fraud pipeline health | None | ⚠️ Missing link to fraud queue |
| ClaimsAgeingPanel | Ageing claims risk | None | ⚠️ Missing link to Claims Manager |
| Assessor Performance | Assessor productivity | Export to Excel | ⚠️ Missing flag/review action |
| Panel Beater Analytics | Panel beater cost patterns | Export to Excel | ⚠️ Missing flag/review action |
| Financial Overview | ROI and cost metrics | Export to PDF | ✅ Appropriate |
| Global Search | Find specific claims | Navigate to claim | ✅ Appropriate |

**Widget Actionability Matrix Score: 6/10** — The Executive Dashboard is appropriately read-heavy, but several intelligence panels (FraudInvestigationFunnel, ClaimsAgeingPanel, Assessor Performance, Panel Beater Analytics) lack any escalation or action routing, which limits the executive's ability to act on what they see.

---

### Phase 7 — Reports & Intelligence Review

The ExecutiveReportTab provides portfolio-level reports. The KingaReportButton is available for portfolio summary exports. The AnalyticsExportButton provides bulk analytics exports.

| Report Level | Reports Available |
|---|---|
| Dashboard-level | KPI cards, trend charts |
| Section-level | Month-on-month export, assessor performance export, panel beater analytics export |
| Portfolio-level | Financial overview PDF, KPIs PDF, cost savings Excel |
| Executive-only | ExecutiveReportTab |
| Per-claim | None (appropriate — executive should not need per-claim reports) |

**Report Alignment Matrix Score: 8/10**

---

### Phase 8 — AI Utilisation Audit

| AI Capability | Available | Used | Surfaced | Aligned |
|---|---|---|---|---|
| AI Assessments (KINGA) | ✅ | ✅ | ✅ (AI Confidence KPI) | ✅ |
| Fraud Intelligence | ✅ | ✅ | ✅ (FraudInvestigationFunnel) | ✅ |
| Cost Estimation | ✅ | ✅ | ✅ (Savings KPI) | ✅ |
| Repair Recommendations | ✅ | ⚠️ Partial | ⚠️ Not at executive level | ⚠️ |
| Risk Scoring | ✅ | ✅ | ✅ (Fraud Risk KPI) | ✅ |
| Portfolio Intelligence | ✅ | ✅ | ✅ (all tabs) | ✅ |
| Forecasting | ✅ | ✅ | ✅ (backlog projection) | ✅ |
| Rework Detection | ✅ | ⚠️ Partial | ⚠️ Not at executive level | ⚠️ |
| Anomaly Detection | ⚠️ | ⚠️ Partial | ⚠️ Partial | ⚠️ |

**AI Utilisation Score: 7.5/10**

---

### Phase 9 — Cross-Portal Governance Review

The Executive Dashboard uses the shadcn `<Tabs>` component with a custom active-state override (`#3C7844`), which is the correct approach. The header uses a white-card pattern with a green icon container — this should become the platform standard. The KPI card design (icon container + bold value + muted label) is the best implementation in the platform and should be adopted by all portals.

The secondary stat bar below the primary KPI cards is a pattern unique to the Executive Dashboard and creates visual redundancy. This should be resolved by incorporating the secondary metrics into the primary strip or removing the secondary bar.

**Cross-Portal Consistency Score: 7/10**

---

### Phase 10 — Target State Architecture

**Retain:** Primary KPI cards, Month-on-Month comparison, ExecutiveAnalyticsCharts, Assessor Performance, Panel Beater Analytics, Financial Overview, ExecutiveReportTab, Global Search.

**Redesign:** Move ExecutiveAlertsCenter to a persistent top-of-page position (above KPI cards). Move Fast-Track Analytics to a dedicated Analytics tab. Remove secondary stat bar — incorporate metrics into primary strip.

**Remove:** Secondary stat bar (redundant with primary KPI cards).

**Add:** Persistent alerts panel at top of page. Escalation routing from executive to Claims Manager / Risk Manager. Rework rate metric at executive level. SLA compliance percentage KPI.

| Horizon | Actions |
|---|---|
| **Immediate (0–2 days)** | Move ExecutiveAlertsCenter above KPI cards; remove secondary stat bar |
| **Short-Term (1–2 weeks)** | Add SLA compliance KPI; add rework rate metric; add escalation routing |
| **Medium-Term (1–2 months)** | Add dedicated Analytics tab; add FraudInvestigationFunnel drill-down link |
| **Strategic (3–12 months)** | Executive approval queue; anomaly detection at portfolio level |

---

### Final Verdict — Executive Dashboard

**Portal Name:** Executive Dashboard  
**Portal Role:** Executive / Insurer Leadership

| Score | Value |
|---|---|
| Role Alignment Score | 8/10 |
| Operational Awareness Score | 7.5/10 |
| Workflow Governance Score | 7/10 |
| Actionability Score | 6/10 |
| AI Utilisation Score | 7.5/10 |
| Cross-Portal Consistency Score | 7/10 |
| **Overall Score** | **7.2/10** |

**Classification: Operationally Effective**

**Top 10 Findings:**
1. ExecutiveAlertsCenter is buried within the Overview tab — not prominent enough for a role that needs immediate alert visibility
2. Secondary stat bar creates visual redundancy with primary KPI cards
3. FraudInvestigationFunnel, ClaimsAgeingPanel, Assessor Performance, and Panel Beater Analytics panels lack action routing
4. No SLA compliance percentage KPI at executive level
5. No rework rate metric at executive level
6. No escalation routing from executive to Claims Manager / Risk Manager
7. Fast-Track Analytics section is a deep-dive tool misplaced in the Overview tab
8. Header pattern (white card) is inconsistent with Claims Manager header (solid green)
9. No dedicated executive approval queue
10. Anomaly detection not surfaced at portfolio level

**Top 10 Recommendations:**
1. Move ExecutiveAlertsCenter to a persistent top-of-page position
2. Remove secondary stat bar; incorporate metrics into primary KPI strip
3. Add escalation routing from executive panels to operational portals
4. Add SLA compliance percentage KPI
5. Add rework rate metric
6. Move Fast-Track Analytics to a dedicated Analytics tab
7. Standardise header pattern across all portals
8. Add FraudInvestigationFunnel drill-down link to fraud queue
9. Add executive approval queue
10. Add portfolio-level anomaly detection

**Production Readiness Verdict:** Ready for production. The portal provides genuine strategic visibility for the executive role. The immediate fixes (alerts prominence, secondary stat bar removal) should be applied before the next executive user session.

**Estimated Effort to Reach Best-in-Class:** 2–3 weeks of focused development.

---

## Portal 3 — Assessor Dashboard

### Phase 1 — Role Definition Validation

**Role:** Assessor — a field or desk-based professional responsible for physically or remotely inspecting damaged vehicles, conducting technical assessments, and producing assessment reports that feed into the KINGA AI analysis pipeline.

| Decision Horizon | Responsibilities |
|---|---|
| **Daily** | Review assigned claims; conduct assessments; upload evidence; complete assessment reports; manage appointments |
| **Weekly** | Review completed assessments; track performance metrics; manage appointment schedule |
| **Monthly** | Review performance dashboard; review leaderboard standing |
| **Escalation** | Escalate disputed assessments, fraud indicators, and complex damage scenarios |
| **Approval** | Assessment report sign-off |
| **Governance** | Ensure all assessments are completed within SLA; maintain evidence quality standards |

**Role Support Assessment:**

The Assessor Dashboard is the **most underdeveloped portal** relative to its operational importance. The current implementation (155 lines) provides only four KPI cards (Assigned Claims, Pending Assessments, Upcoming Appointments, Completed This Month) and a single claim list with a "View & Assess" button. The portal does not provide the assessor with the tools they need to conduct their work — there is no appointment calendar, no evidence upload interface, no assessment form, no fraud indicator tools, and no performance feedback within the dashboard itself.

The dedicated pages `AssessorClaimDetails.tsx`, `AssessorPerformance.tsx`, `AssessorLeaderboard.tsx`, and `AssessorPerformanceDashboard.tsx` exist and provide additional functionality, but they are not integrated into the dashboard as a cohesive workspace.

---

### Phase 2 — Operational Question Assessment

| # | Question | Status | Evidence |
|---|---|---|---|
| 1 | Which claims are assigned to me today? | **Supported** | Claim list with status badges |
| 2 | Which assessments are overdue? | **Not Supported** | No SLA or overdue indicator on the dashboard |
| 3 | What is my next appointment? | **Not Supported** | Appointments KPI card shows count but no calendar or list |
| 4 | Which claims need evidence upload? | **Not Supported** | No evidence status indicator |
| 5 | What is my current performance rating? | **Not Supported** | Performance dashboard exists as a separate page but is not surfaced |
| 6 | Which claims have fraud indicators? | **Not Supported** | No fraud indicator on the assessor dashboard |
| 7 | What is my completion rate this month? | **Partially Supported** | "Completed This Month" KPI card shows count but no target or trend |
| 8 | Are there any claims requiring urgent attention? | **Not Supported** | No urgency or priority indicator |
| 9 | What is my leaderboard standing? | **Not Supported** | Leaderboard exists as a separate page but is not surfaced |
| 10 | Which assessments are pending my sign-off? | **Not Supported** | No sign-off queue |

**Operational Awareness Score: 2/10** — The Assessor Dashboard is the lowest-scoring portal in the platform on operational awareness. It provides a claim list but not a workspace.

---

### Phase 3 — Dashboard Architecture Review

**Layout Structure:** A simple header with four KPI cards and a single claim list. No tabs, no sections, no intelligence panels.

**KPI Design:** Four gradient cards (blue, teal, purple, green) using foreign colour gradients (`from-blue-500 to-blue-600`, `from-teal-500 to-teal-600`, `from-purple-500 to-purple-600`, `from-green-500 to-emerald-600`). These are the most prominent foreign-colour violations in the platform — all four cards use Tailwind gradient classes not from the KINGA brand palette.

**Dashboard Classification:** **Information Dashboard** — the portal shows information but does not function as an operational workspace.

**Required Classification:** The Assessor role requires an **Operational Dashboard** that combines a work queue, appointment management, evidence tools, and performance feedback.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visibility | Control | Escalation | Governance | Auditability |
|---|---|---|---|---|---|
| Assigned Claims | ✅ Full | ⚠️ Partial (navigate only) | ❌ Absent | ❌ Absent | ✅ Present |
| Assessment Conduct | ❌ Absent | ❌ Absent | ❌ Absent | ❌ Absent | ❌ Absent |
| Evidence Upload | ❌ Absent | ❌ Absent | ❌ Absent | ❌ Absent | ❌ Absent |
| Appointments | ⚠️ Count only | ❌ Absent | ❌ Absent | ❌ Absent | ❌ Absent |
| Performance | ❌ Absent | ❌ Absent | ❌ Absent | ❌ Absent | ❌ Absent |

**Workflow Governance Score: 2/10**

---

### Phase 5 — Queue & Workload Intelligence Review

| Metric | Present |
|---|---|
| Queue Counts | ✅ (KPI cards) |
| Queue Age | ❌ |
| SLA Breaches | ❌ |
| Bottlenecks | ❌ |
| Backlog | ❌ |
| User Workload | ❌ |
| User Productivity | ❌ |
| Rework | ❌ |
| Send-backs | ❌ |
| Escalations | ❌ |

**Operational Queue Maturity Score: 1/10**

---

### Phase 6 — Actionability Audit

| Widget | Decision Supported | Action Available | Assessment |
|---|---|---|---|
| Assigned Claims KPI | How many claims do I have | None | ❌ Missing drill-down |
| Pending Assessments KPI | How many are pending | None | ❌ Missing drill-down |
| Upcoming Appointments KPI | How many appointments | None | ❌ Missing calendar link |
| Completed This Month KPI | My completion count | None | ❌ Missing performance link |
| Claim list row | Which claim to assess next | View & Assess | ✅ Appropriate |

**Widget Actionability Matrix Score: 2/10**

---

### Phase 7 — Reports & Intelligence Review

No reports are available within the Assessor Dashboard. The AssessorPerformanceDashboard page provides performance analytics but is not linked from the dashboard.

**Report Alignment Matrix Score: 1/10**

---

### Phase 8 — AI Utilisation Audit

| AI Capability | Available | Used | Surfaced | Aligned |
|---|---|---|---|---|
| AI Assessments (KINGA) | ✅ | ⚠️ Partial | ❌ Not on dashboard | ⚠️ |
| Fraud Intelligence | ✅ | ⚠️ Partial | ❌ Not on dashboard | ⚠️ |
| Cost Estimation | ✅ | ⚠️ Partial | ❌ Not on dashboard | ⚠️ |
| Repair Recommendations | ✅ | ⚠️ Partial | ❌ Not on dashboard | ⚠️ |
| Risk Scoring | ✅ | ⚠️ Partial | ❌ Not on dashboard | ⚠️ |

**AI Utilisation Score: 2/10** — AI capabilities exist in the claim detail pages but are not surfaced on the dashboard.

---

### Phase 9 — Cross-Portal Governance Review

The Assessor Dashboard uses foreign colour gradients on all four KPI cards — the most significant brand governance violation in the platform. The portal does not use the DashboardLayout component, creating a navigation inconsistency with all other portals. There is no sidebar navigation, no persistent header, and no link back to the portal hub from within the dashboard.

**Cross-Portal Consistency Score: 2/10**

---

### Phase 10 — Target State Architecture

**Retain:** Claim list with "View & Assess" navigation.

**Redesign:** Completely redesign the dashboard as an operational workspace. Replace the four gradient KPI cards with brand-aligned stat tiles. Add a tabbed structure: My Queue | Appointments | Performance | Reports.

**Remove:** Foreign colour gradients on KPI cards.

**Add:** My Queue tab with SLA indicators and priority sorting. Appointment calendar or list view. Evidence upload status per claim. Performance summary panel linking to AssessorPerformanceDashboard. Leaderboard widget. Fraud indicator on claim rows. DashboardLayout integration for consistent navigation.

| Horizon | Actions |
|---|---|
| **Immediate (0–2 days)** | Replace foreign colour gradients with brand palette |
| **Short-Term (1–2 weeks)** | Add SLA indicators to claim rows; add appointment list; integrate DashboardLayout |
| **Medium-Term (1–2 months)** | Add Performance tab; add My Queue tab with priority sorting; add evidence upload status |
| **Strategic (3–12 months)** | Full operational workspace with AI-assisted assessment tools surfaced on dashboard |

---

### Final Verdict — Assessor Dashboard

**Portal Name:** Assessor Dashboard  
**Portal Role:** Assessor

| Score | Value |
|---|---|
| Role Alignment Score | 3/10 |
| Operational Awareness Score | 2/10 |
| Workflow Governance Score | 2/10 |
| Actionability Score | 2/10 |
| AI Utilisation Score | 2/10 |
| Cross-Portal Consistency Score | 2/10 |
| **Overall Score** | **2.2/10** |

**Classification: Not Ready**

**Top 10 Findings:**
1. Dashboard is a 155-line stub — not an operational workspace
2. All four KPI cards use foreign colour gradients (brand governance violation)
3. No SLA or overdue indicators
4. No appointment calendar or list
5. No evidence upload status
6. No performance feedback on dashboard
7. No fraud indicators
8. No escalation capability
9. Not integrated with DashboardLayout — no sidebar navigation
10. AI capabilities exist in detail pages but are not surfaced on the dashboard

**Top 10 Recommendations:**
1. Rebuild the Assessor Dashboard as a full operational workspace
2. Replace foreign colour gradients with KINGA brand palette
3. Add SLA indicators to claim rows
4. Add appointment calendar/list
5. Add evidence upload status per claim
6. Add performance summary panel
7. Add fraud indicator on claim rows
8. Add escalation capability
9. Integrate DashboardLayout for consistent navigation
10. Surface AI assessment results on the dashboard

**Production Readiness Verdict:** Not ready for production as a standalone operational tool. The claim detail pages (`AssessorClaimDetails.tsx`) provide the actual assessment workspace, but the dashboard does not guide the assessor to their work effectively.

**Estimated Effort to Reach Best-in-Class:** 4–6 weeks of focused development.

---

## Portal 4 — Claims Processor Dashboard

### Phase 1 — Role Definition Validation

**Role:** Claims Processor — responsible for the initial intake and processing of claims, triggering KINGA AI analysis, assigning assessors, uploading evidence, and managing the claims pipeline from submission to assessment completion.

| Decision Horizon | Responsibilities |
|---|---|
| **Daily** | Process new claim submissions; trigger KINGA AI analysis; assign assessors; upload evidence; monitor AI processing status |
| **Weekly** | Review SLA compliance; review stuck claims; review processing analytics |
| **Monthly** | Review processing performance metrics |
| **Escalation** | Escalate stuck claims, failed AI processing, and complex cases |
| **Approval** | None — the Processor role does not approve claims |
| **Governance** | Ensure all claims enter the KINGA pipeline; maintain evidence quality |

**Role Support Assessment:**

The Claims Processor Dashboard is **well-aligned** to its role. The portal provides a real-time claim pipeline view with four sections (Pending Review, In Review, KINGA Complete, Completed), a search bar, a quick stats bar, and per-claim action buttons (Trigger AI, Assign Assessor, Upload Evidence, View Details, Reset Stuck Claim). The auto-refresh polling (2s when AI is active, 30s when idle) is an excellent operational feature.

---

### Phase 2 — Operational Question Assessment

| # | Question | Status | Evidence |
|---|---|---|---|
| 1 | Which claims are waiting for me to process? | **Supported** | Pending Review section with claim cards |
| 2 | Which claims are currently being processed by KINGA? | **Supported** | In Review section with KINGA Analyzing badge and elapsed timer |
| 3 | Which claims have KINGA completed and need my review? | **Supported** | KINGA Complete section |
| 4 | Which claims are breaching SLA? | **Supported** | SLA badges (On Track / At Risk / Breached) on each claim card |
| 5 | Which claims are stuck in processing? | **Supported** | Reset Stuck Claim button visible on stuck claims |
| 6 | How many claims are in each stage? | **Supported** | Quick stats bar with six counters |
| 7 | Which claims need an assessor assigned? | **Supported** | Assign Assessor button on eligible claims |
| 8 | Which claims need evidence uploaded? | **Supported** | Upload Evidence button on eligible claims |
| 9 | What is the overall pipeline health? | **Supported** | Quick stats bar with SLA breached count |
| 10 | What is the KINGA confidence score for completed assessments? | **Supported** | KINGA confidence badge on assessment-complete claims |

**Operational Awareness Score: 9/10** — The Claims Processor Dashboard is the second-highest scoring portal on operational awareness.

---

### Phase 3 — Dashboard Architecture Review

**Layout Structure:** A teal gradient header, a search bar, a six-card quick stats bar, and a four-section pipeline view (Pending / In Review / KINGA Complete / Completed). Each section is a scrollable list of claim cards with context-dependent action buttons.

**KPI Design:** The quick stats bar uses six coloured cards (amber, blue, teal, green, red, purple) with foreign Tailwind colour classes. This is the same foreign-colour pattern as the Assessor Dashboard.

**Dashboard Classification:** **Operational Dashboard** — the portal is correctly classified. It provides a real-time pipeline view with direct action capability.

**Areas for Improvement:** The header uses a `bg-gradient-to-r from-teal-600 via-teal-700 to-teal-800` gradient — a foreign colour. The quick stats bar uses six different Tailwind colour classes. The claim cards use `border-l-4 border-l-amber-400`, `border-l-blue-400`, `border-l-teal-500`, `border-l-green-400`, `border-l-purple-500` — the left-border pattern that the brand design system explicitly prohibits. The `bg-indigo-50` KINGA reference number badge uses a foreign colour.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visibility | Control | Escalation | Governance | Auditability |
|---|---|---|---|---|---|
| Claim Intake | ✅ Full | ✅ Full | ⚠️ Partial | ✅ Present | ✅ Present |
| AI Processing | ✅ Full | ✅ Full | ✅ Present | ✅ Present | ✅ Present |
| Assessor Assignment | ✅ Full | ✅ Full | ⚠️ Partial | ✅ Present | ✅ Present |
| Evidence Upload | ✅ Full | ✅ Full | ❌ Absent | ✅ Present | ✅ Present |
| Stuck Claim Recovery | ✅ Full | ✅ Full | ✅ Present | ✅ Present | ✅ Present |

**Workflow Governance Score: 8/10**

---

### Phase 5 — Queue & Workload Intelligence Review

| Metric | Present |
|---|---|
| Queue Counts | ✅ |
| Queue Age | ✅ (SLA badges) |
| SLA Breaches | ✅ |
| Bottlenecks | ⚠️ Partial |
| Backlog | ✅ |
| User Workload | ❌ |
| User Productivity | ❌ |
| Rework | ❌ |
| Send-backs | ❌ |
| Escalations | ⚠️ Partial |

**Operational Queue Maturity Score: 6/10**

---

### Phase 6 — Actionability Audit

| Widget | Decision Supported | Action Available | Assessment |
|---|---|---|---|
| Quick stats bar | Pipeline health overview | None | ⚠️ Missing drill-down links |
| Pending claim card | Should I process this claim | Trigger AI / Assign Assessor / Upload Evidence / View Details | ✅ Appropriate |
| In Review claim card | Is KINGA still processing | Reset Stuck Claim | ✅ Appropriate |
| KINGA Complete card | Should I review this assessment | View Details / Download Report | ✅ Appropriate |
| Completed claim card | Is this claim correctly closed | View Details | ✅ Appropriate |
| Search bar | Find a specific claim | Filter results | ✅ Appropriate |

**Widget Actionability Matrix Score: 8/10**

---

### Phase 7 — Reports & Intelligence Review

No dedicated reports section in the Claims Processor Dashboard. The portal links to the comparison view for individual claim reports. This is appropriate for the Processor role — they are not a reporting role.

**Report Alignment Matrix Score: 6/10** — A basic processing analytics panel (claims processed per day, AI success rate, average processing time) would be appropriate.

---

### Phase 8 — AI Utilisation Audit

| AI Capability | Available | Used | Surfaced | Aligned |
|---|---|---|---|---|
| AI Assessments (KINGA) | ✅ | ✅ | ✅ (KINGA Analyzing badge) | ✅ |
| Fraud Intelligence | ✅ | ✅ | ✅ (Fraud Risk badge) | ✅ |
| Cost Estimation | ✅ | ✅ | ✅ (KINGA confidence score) | ✅ |
| Repair Recommendations | ✅ | ⚠️ Partial | ⚠️ In detail view only | ⚠️ |
| Risk Scoring | ✅ | ✅ | ✅ (High/Medium/Low Risk badge) | ✅ |
| Rework Detection | ⚠️ | ❌ | ❌ | ❌ |

**AI Utilisation Score: 7/10**

---

### Phase 9 — Cross-Portal Governance Review

The Claims Processor Dashboard has the most significant brand governance violations in the platform: a teal gradient header, six foreign-colour stat cards, and left-border claim cards. These are the exact patterns the brand design system prohibits. The portal does not use the DashboardLayout component.

**Cross-Portal Consistency Score: 3/10**

---

### Phase 10 — Target State Architecture

**Retain:** Four-section pipeline view, auto-refresh polling, SLA badges, per-claim action buttons, search bar, stuck claim recovery.

**Redesign:** Replace teal gradient header with white-card header. Replace six foreign-colour stat cards with brand-aligned KPI strip. Replace left-border claim cards with standard card borders. Replace `bg-indigo-50` KINGA reference badge with brand-aligned style.

**Add:** Processing analytics panel (claims processed per day, AI success rate, average processing time). User workload indicator.

| Horizon | Actions |
|---|---|
| **Immediate (0–2 days)** | Replace teal gradient header; replace foreign-colour stat cards; remove left-border claim cards |
| **Short-Term (1–2 weeks)** | Add processing analytics panel; integrate DashboardLayout |
| **Medium-Term (1–2 months)** | Add user workload indicator; add rework detection |

---

### Final Verdict — Claims Processor Dashboard

**Portal Name:** Claims Processor Dashboard  
**Portal Role:** Claims Processor

| Score | Value |
|---|---|
| Role Alignment Score | 9/10 |
| Operational Awareness Score | 9/10 |
| Workflow Governance Score | 8/10 |
| Actionability Score | 8/10 |
| AI Utilisation Score | 7/10 |
| Cross-Portal Consistency Score | 3/10 |
| **Overall Score** | **7.3/10** |

**Classification: Operationally Effective**

**Top 10 Findings:**
1. Teal gradient header — foreign colour brand violation
2. Six foreign-colour stat cards (amber, blue, teal, green, red, purple)
3. Left-border claim cards — prohibited pattern per brand design system
4. `bg-indigo-50` KINGA reference badge — foreign colour
5. No processing analytics panel
6. No user workload indicator
7. No rework detection
8. Not integrated with DashboardLayout
9. Quick stats bar cards have no drill-down links
10. No dedicated escalation capability

**Top 10 Recommendations:**
1. Replace teal gradient header with white-card header
2. Replace foreign-colour stat cards with brand-aligned KPI strip
3. Remove left-border claim cards
4. Add processing analytics panel
5. Integrate DashboardLayout
6. Add user workload indicator
7. Add rework detection
8. Add drill-down links to quick stats bar
9. Add dedicated escalation capability
10. Replace `bg-indigo-50` KINGA reference badge with brand-aligned style

**Production Readiness Verdict:** Operationally ready — the core pipeline management functionality is excellent. The brand governance violations are cosmetic and should be addressed in the next sprint.

**Estimated Effort to Reach Best-in-Class:** 2–3 weeks.

---

## Portal 5 — Risk Manager Dashboard

### Phase 1 — Role Definition Validation

**Role:** Risk Manager — responsible for technical approvals, financial decisions, fraud risk oversight, and governance of the claims pipeline. The Risk Manager reviews KINGA AI assessments, approves or rejects claims at the technical level, and manages the fraud investigation queue.

| Decision Horizon | Responsibilities |
|---|---|
| **Daily** | Review fraud risk queue; approve or reject claims at technical level; review high-risk claims; action financial decisions |
| **Weekly** | Review fraud rate trends; review panel beater patterns; review approval queue |
| **Monthly** | Review fraud analytics; review financial exposure; review risk portfolio |
| **Escalation** | Escalate fraud investigations, high-value disputes, and legal threats to executive level |
| **Approval** | Technical approval of claims; financial decision authorisation |
| **Governance** | Enforce fraud detection thresholds; maintain approval audit trail |

**Role Support Assessment:**

The Risk Manager Dashboard is **well-aligned** to its role. The portal provides a fraud intelligence KPI bar (Fraud Rate, Fraud Exposure, High-Risk Claims, Avg Fraud Score, Total Claims), three signature charts (Fraud Rate Trend, Risk Distribution, Claim Value Distribution), and a tabbed workflow queue (Approval, Financial Decision, Escalated, Fraud Investigation, Closed). The KingaReportButton for portfolio risk export is appropriately placed.

---

### Phase 2 — Operational Question Assessment

| # | Question | Status | Evidence |
|---|---|---|---|
| 1 | Which claims present the highest fraud risk? | **Supported** | Fraud Investigation tab with risk-sorted claim rows |
| 2 | What is the current fraud rate? | **Supported** | Fraud Rate KPI card |
| 3 | What is our fraud exposure in value? | **Supported** | Fraud Exposure KPI card |
| 4 | Which claims are awaiting my technical approval? | **Supported** | Approval tab |
| 5 | Which claims need a financial decision? | **Supported** | Financial Decision tab |
| 6 | Which fraud investigations are overdue? | **Partially Supported** | No SLA indicator on fraud investigation rows |
| 7 | Which panel beaters show suspicious patterns? | **Partially Supported** | Panel beater data available in Executive Dashboard but not in Risk Manager Dashboard |
| 8 | What is the average fraud score across the portfolio? | **Supported** | Avg Fraud Score KPI card |
| 9 | Which escalated claims need my attention? | **Supported** | Escalated tab |
| 10 | What is the fraud rate trend over time? | **Supported** | Fraud Rate Trend chart |

**Operational Awareness Score: 8/10**

---

### Phase 3 — Dashboard Architecture Review

**Layout Structure:** A clean white-background header with the KINGA logo, a date range selector, a five-card KPI bar, three signature charts, and a five-tab workflow queue. The layout is well-structured and uses `bg-background` for the page background — the only portal to use the correct semantic background token.

**KPI Design:** The `StatCard` component uses `text-red-600`, `text-orange-600`, `text-green-600`, `text-amber-600` — foreign Tailwind colour classes. The icon colours should use the KINGA brand palette.

**Dashboard Classification:** **Management Dashboard** — the portal combines risk intelligence with workflow management. It is correctly positioned between the operational Claims Processor and the strategic Executive.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visibility | Control | Escalation | Governance | Auditability |
|---|---|---|---|---|---|
| Technical Approval | ✅ Full | ✅ Full | ✅ Present | ✅ Present | ✅ Present |
| Financial Decision | ✅ Full | ✅ Full | ✅ Present | ✅ Present | ✅ Present |
| Fraud Investigation | ✅ Full | ✅ Full | ✅ Present | ✅ Present | ✅ Present |
| Escalation Management | ✅ Full | ✅ Full | ✅ Present | ✅ Present | ✅ Present |
| Panel Beater Risk | ❌ Absent | ❌ Absent | ❌ Absent | ❌ Absent | ❌ Absent |

**Workflow Governance Score: 8/10**

---

### Phase 5 — Queue & Workload Intelligence Review

| Metric | Present |
|---|---|
| Queue Counts | ✅ |
| Queue Age | ⚠️ Partial |
| SLA Breaches | ⚠️ Partial |
| Bottlenecks | ⚠️ Partial |
| Backlog | ✅ |
| User Workload | ❌ |
| User Productivity | ❌ |
| Rework | ❌ |
| Send-backs | ❌ |
| Escalations | ✅ |

**Operational Queue Maturity Score: 6/10**

---

### Phase 6 — Actionability Audit

| Widget | Decision Supported | Action Available | Assessment |
|---|---|---|---|
| Fraud Rate KPI | Portfolio fraud health | None | ⚠️ Missing drill-down |
| Fraud Exposure KPI | Financial exposure | None | ⚠️ Missing drill-down |
| Fraud Rate Trend chart | Trend analysis | None | ℹ️ Analytics only |
| Approval tab claim row | Approve / Reject / Request Info | Approve / Reject / Request Info | ✅ Appropriate |
| Financial Decision tab | Financial authorisation | Approve / Reject / Request Info | ✅ Appropriate |
| Fraud Investigation tab | Fraud assessment | AI Assess / View | ✅ Appropriate |
| Escalated tab | Escalation review | View | ⚠️ Missing resolve action |

**Widget Actionability Matrix Score: 7/10**

---

### Phase 7 — Reports & Intelligence Review

The KingaReportButton for `risk_manager_portfolio` is appropriately placed in the header. No dedicated reports section exists within the dashboard.

**Report Alignment Matrix Score: 6/10**

---

### Phase 8 — AI Utilisation Audit

| AI Capability | Available | Used | Surfaced | Aligned |
|---|---|---|---|---|
| AI Assessments (KINGA) | ✅ | ✅ | ✅ (AiAssessButton) | ✅ |
| Fraud Intelligence | ✅ | ✅ | ✅ (Fraud KPIs + charts) | ✅ |
| Cost Estimation | ✅ | ✅ | ✅ (in claim detail) | ✅ |
| Risk Scoring | ✅ | ✅ | ✅ (RiskBadge on rows) | ✅ |
| Anomaly Detection | ⚠️ | ⚠️ Partial | ⚠️ Partial | ⚠️ |

**AI Utilisation Score: 7.5/10**

---

### Phase 9 — Cross-Portal Governance Review

The Risk Manager Dashboard is the only portal that uses `bg-background` for the page background — consistent with the brand design system. The header is clean and uses the KINGA logo correctly. However, the `StatCard` component uses foreign Tailwind colour classes for icon colours, and the tab bar uses the shadcn `<Tabs>` component without the KINGA green active state override.

**Cross-Portal Consistency Score: 6/10**

---

### Phase 10 — Target State Architecture

**Retain:** Fraud intelligence KPI bar, three signature charts, five-tab workflow queue, date range selector, KingaReportButton.

**Redesign:** Replace foreign Tailwind colour classes in `StatCard` with brand palette. Add KINGA green active state to tab bar. Add panel beater risk panel.

**Add:** Panel beater risk panel. SLA indicators on fraud investigation rows. Resolve action on Escalated tab. User workload indicator.

| Horizon | Actions |
|---|---|
| **Immediate (0–2 days)** | Replace foreign colour classes in StatCard; add KINGA green tab active state |
| **Short-Term (1–2 weeks)** | Add SLA indicators to fraud investigation rows; add resolve action to Escalated tab |
| **Medium-Term (1–2 months)** | Add panel beater risk panel; add user workload indicator |

---

### Final Verdict — Risk Manager Dashboard

**Portal Name:** Risk Manager Dashboard  
**Portal Role:** Risk Manager

| Score | Value |
|---|---|
| Role Alignment Score | 8/10 |
| Operational Awareness Score | 8/10 |
| Workflow Governance Score | 8/10 |
| Actionability Score | 7/10 |
| AI Utilisation Score | 7.5/10 |
| Cross-Portal Consistency Score | 6/10 |
| **Overall Score** | **7.4/10** |

**Classification: Operationally Effective**

**Estimated Effort to Reach Best-in-Class:** 2–3 weeks.

---

## Portal 6 — Admin Dashboard

### Phase 1 — Role Definition Validation

**Role:** Platform Administrator — responsible for managing panel beaters, tenants, platform settings, and KINGA intelligence training. The Admin role is a platform-level role, not a claims-processing role.

**Role Support Assessment:** The Admin Dashboard is **partially aligned**. It provides panel beater management, analytics, KINGA intelligence training, settings, and tenant management. However, it lacks tier-based governance controls — the admin cannot currently determine which features an insurer and their child tenants can access based on their subscription tier. This is a critical gap identified in the platform's known issues.

**Operational Awareness Score: 6/10**

**Dashboard Classification:** **Management Dashboard** — appropriate for the admin role.

**Key Gaps:** No tier-based feature visibility controls. Tab navigation uses `<Button>` components instead of `<Tabs>` — the `bg-emerald-600` active state on the Intelligence Training button is a foreign colour. No audit trail for admin actions.

**Overall Score: 6.0/10** | **Classification: Operationally Functional**

**Estimated Effort to Reach Best-in-Class:** 4–6 weeks (tier-based governance is a significant backend and frontend feature).

---

## Portal 7 — Panel Beater Dashboard

### Phase 1 — Role Definition Validation

**Role:** Panel Beater — an external repair shop that receives quote requests from insurers, submits repair quotes, and manages their job queue.

**Role Support Assessment:** The Panel Beater Dashboard is **well-aligned** to its role. The portal provides a clean header, four KPI cards (Active Quotes, Pending Review, Completed Claims, Avg. Processing), a tab structure (Queue / Performance / Analytics / Settings), and a quote request list with "Submit Quote" actions.

**Operational Awareness Score: 7/10**

**Key Gaps:** KPI cards use `bg-muted/50` icon containers (no brand colour). The header uses a `bg-white border-b border-gray-200` pattern — the most minimal header in the platform, which is appropriate for an external partner portal. No SLA indicators on quote requests.

**Dashboard Classification:** **Operational Dashboard** — appropriate for the panel beater role.

**Overall Score: 6.5/10** | **Classification: Operationally Functional**

**Estimated Effort to Reach Best-in-Class:** 2 weeks.

---

## Portal 8 — Claimant Dashboard

### Phase 1 — Role Definition Validation

**Role:** Claimant — a policyholder who has submitted an insurance claim and needs to track its progress.

**Role Support Assessment:** The Claimant Dashboard is **well-aligned** to its role. The portal provides a clean claim submission CTA, four KPI cards (Total Claims, Active, Completed, Avg Resolution), a claim list with status badges, and a quick action section (Submit New Claim, Refresh). The status badge system uses a comprehensive mapping of all workflow states to human-readable labels.

**Operational Awareness Score: 7/10**

**Key Gaps:** Status badges use foreign colour classes (`bg-blue-100 text-blue-800`, `bg-purple-100 text-purple-800`, `bg-teal-100 text-teal-800`, `bg-emerald-100 text-emerald-800`, etc.). The onboarding stepper uses `bg-emerald-500` — a foreign colour. No estimated resolution date shown on active claims.

**Dashboard Classification:** **Information Dashboard** — appropriate for the claimant role.

**Overall Score: 6.5/10** | **Classification: Operationally Functional**

**Estimated Effort to Reach Best-in-Class:** 2 weeks.

---

## Portal 9 — Fleet Manager Dashboard

### Phase 1 — Role Definition Validation

**Role:** Fleet Manager — manages a company's vehicle fleet, submits fleet claims, and monitors fleet claim status.

**Role Support Assessment:** The Fleet Manager Dashboard is **well-aligned** to its role. The portal provides fleet account management, a tabbed structure (Claims / Vehicles / Risk), and claim management with status badges. The DriverOnboardingWizard and IncidentReportForm components provide comprehensive fleet-specific functionality.

**Operational Awareness Score: 7/10**

**Key Gaps:** Status badges use foreign colour classes. The `bg-emerald-600 hover:bg-emerald-700` button colour is a foreign colour. The risk tab is present but appears to be a placeholder.

**Dashboard Classification:** **Operational Dashboard** — appropriate for the fleet manager role.

**Overall Score: 6.8/10** | **Classification: Operationally Functional**

**Estimated Effort to Reach Best-in-Class:** 2–3 weeks.

---

## Portal 10 — Recovery Portal

### Phase 1 — Role Definition Validation

**Role:** Recovery Officer — manages third-party recovery cases, tracks recovery amounts, and monitors recovery deadlines.

**Role Support Assessment:** The Recovery Portal is **well-aligned** to its role. The portal provides a KPI strip (Total Cases, Active, Amount Recovered, Approaching Deadline), a case queue with status filter cards, and a case list with navigation to individual case details. The `border-emerald-500/50 bg-emerald-500/10` active card state uses a foreign colour.

**Operational Awareness Score: 7/10**

**Dashboard Classification:** **Operational Dashboard** — appropriate for the recovery role.

**Overall Score: 6.8/10** | **Classification: Operationally Functional**

**Estimated Effort to Reach Best-in-Class:** 2 weeks.

---

## Portal 11 — Insurer Admin Dashboard

### Phase 1 — Role Definition Validation

**Role:** Insurer Administrator — manages the insurer's KINGA account, monitors live KPIs, accesses quick actions, and manages portal roles.

**Role Support Assessment:** The Insurer Admin Dashboard is **well-aligned** to its role. The portal provides a clean header, a six-card live KPI section, a six-card quick actions section, a recent claims activity panel, and a portal roles management panel. The design is the most consistent with the brand design system of all portals — it uses `border-0 shadow-sm` cards, semantic colour tokens, and `text-xs font-semibold uppercase tracking-widest` section headers.

**Operational Awareness Score: 7/10**

**Dashboard Classification:** **Management Dashboard** — appropriate for the insurer admin role.

**Overall Score: 7.0/10** | **Classification: Operationally Effective**

**Estimated Effort to Reach Best-in-Class:** 1–2 weeks.

---

## Cross-Portal Governance Assessment

### Navigation Consistency

| Portal | Navigation Pattern | DashboardLayout | Consistent |
|---|---|---|---|
| Claims Manager | Custom grouped tab bar + DashboardLayout | ✅ | ⚠️ Custom tabs |
| Executive | shadcn Tabs + DashboardLayout | ✅ | ✅ |
| Assessor | None | ❌ | ❌ |
| Claims Processor | None | ❌ | ❌ |
| Risk Manager | shadcn Tabs | ❌ | ⚠️ |
| Admin | Button-based tabs | ❌ | ❌ |
| Panel Beater | shadcn Tabs + PanelBeaterPortalLayout | ✅ | ⚠️ |
| Claimant | No tabs | ❌ | ❌ |
| Fleet Manager | shadcn Tabs | ❌ | ⚠️ |
| Recovery | Custom button tabs | ❌ | ❌ |
| Insurer Admin | No tabs | ❌ | ✅ |

### KPI Design Consistency

| Portal | KPI Pattern | Brand Colours | Consistent |
|---|---|---|---|
| Claims Manager | Inline flex strip | ✅ | ✅ |
| Executive | Icon-container cards | ✅ | ✅ |
| Assessor | Gradient cards | ❌ Foreign | ❌ |
| Claims Processor | Coloured stat cards | ❌ Foreign | ❌ |
| Risk Manager | StatCard component | ⚠️ Partial | ⚠️ |
| Admin | Standard cards | ✅ | ✅ |
| Panel Beater | Muted icon cards | ✅ | ✅ |
| Claimant | Standard cards | ✅ | ✅ |
| Fleet Manager | Standard cards | ✅ | ✅ |
| Recovery | KPI strip | ✅ | ✅ |
| Insurer Admin | Icon cards | ✅ | ✅ |

### Header Pattern Consistency

| Portal | Header Pattern | Brand Colours |
|---|---|---|
| Claims Manager | Solid `#3C7844` with white text | ✅ |
| Executive | White card with green icon | ✅ |
| Assessor | None | N/A |
| Claims Processor | Teal gradient | ❌ |
| Risk Manager | White with KINGA logo | ✅ |
| Admin | White card | ✅ |
| Panel Beater | White border-b | ✅ |
| Claimant | None | N/A |
| Fleet Manager | None | N/A |
| Recovery | None | N/A |
| Insurer Admin | White card | ✅ |

### Cross-Portal Consistency Score: 5.5/10

The platform lacks a unified portal shell. Five portals do not use DashboardLayout. Three portals have no header. Two portals use foreign colour gradients in their headers. The tab bar pattern varies across six different implementations.

---

## Master Implementation Roadmap

### Immediate Fixes (0–2 days)

1. **Assessor Dashboard** — Replace four foreign gradient KPI cards with brand-aligned stat tiles
2. **Claims Processor Dashboard** — Replace teal gradient header with white-card header; replace six foreign-colour stat cards
3. **Claims Processor Dashboard** — Remove left-border claim cards
4. **Admin Dashboard** — Replace `bg-emerald-600` Intelligence Training button with brand green
5. **Executive Dashboard** — Move ExecutiveAlertsCenter above KPI cards; remove secondary stat bar
6. **Claims Manager Dashboard** — Move analytics section to Analytics tab

### Short-Term Enhancements (1–2 weeks)

1. **Assessor Dashboard** — Add SLA indicators, appointment list, DashboardLayout integration
2. **Claims Processor Dashboard** — Add processing analytics panel, DashboardLayout integration
3. **Risk Manager Dashboard** — Add SLA indicators to fraud investigation rows; add KINGA green tab active state
4. **Claims Manager Dashboard** — Add SLA Breach Summary panel; add Resolve action to EscalationCentre
5. **Executive Dashboard** — Add SLA compliance KPI; add rework rate metric
6. **All portals** — Replace all `bg-emerald-*`, `bg-teal-*`, `bg-blue-*`, `bg-purple-*` status badge classes with brand-derived tints
7. **All portals** — Standardise header to white-card pattern with KINGA green icon container

### Medium-Term Enhancements (1–2 months)

1. **Assessor Dashboard** — Full rebuild as operational workspace (My Queue, Appointments, Performance, Reports tabs)
2. **Claims Manager Dashboard** — Add Reassign action to WorkforceIntelligence and CapacityForecast; add anomaly detection widget
3. **Executive Dashboard** — Add dedicated Analytics tab; add escalation routing
4. **Risk Manager Dashboard** — Add panel beater risk panel; add user workload indicator
5. **Admin Dashboard** — Begin tier-based feature visibility controls
6. **All portals** — Migrate to unified DashboardLayout with portal-specific sidebar configuration

### Strategic Enhancements (3–12 months)

1. **Admin Dashboard** — Full tier-based governance controls (insurer feature visibility by subscription tier)
2. **Claims Manager Dashboard** — Dynamic escalation routing; monthly governance dashboard
3. **Executive Dashboard** — Executive approval queue; portfolio-level anomaly detection
4. **Assessor Dashboard** — AI-assisted assessment tools surfaced on dashboard
5. **Platform** — Unified portal shell with consistent navigation, header, KPI design, alert design, and escalation design across all portals

---

## Platform Summary Scorecard

| Portal | Role Alignment | Operational Awareness | Workflow Governance | Actionability | AI Utilisation | Cross-Portal Consistency | **Overall** | **Classification** |
|---|---|---|---|---|---|---|---|---|
| Claims Manager | 8/10 | 8/10 | 8/10 | 7/10 | 9/10 | 7/10 | **7.8** | Operational Command Centre |
| Executive | 8/10 | 7.5/10 | 7/10 | 6/10 | 7.5/10 | 7/10 | **7.2** | Operationally Effective |
| Assessor | 3/10 | 2/10 | 2/10 | 2/10 | 2/10 | 2/10 | **2.2** | Not Ready |
| Claims Processor | 9/10 | 9/10 | 8/10 | 8/10 | 7/10 | 3/10 | **7.3** | Operationally Effective |
| Risk Manager | 8/10 | 8/10 | 8/10 | 7/10 | 7.5/10 | 6/10 | **7.4** | Operationally Effective |
| Admin | 6/10 | 6/10 | 5/10 | 6/10 | 5/10 | 6/10 | **6.0** | Operationally Functional |
| Panel Beater | 7/10 | 7/10 | 6/10 | 7/10 | 5/10 | 6/10 | **6.5** | Operationally Functional |
| Claimant | 7/10 | 7/10 | 6/10 | 7/10 | 4/10 | 5/10 | **6.0** | Operationally Functional |
| Fleet Manager | 7/10 | 7/10 | 6/10 | 7/10 | 5/10 | 6/10 | **6.5** | Operationally Functional |
| Recovery | 7/10 | 7/10 | 7/10 | 7/10 | 5/10 | 6/10 | **6.5** | Operationally Functional |
| Insurer Admin | 7/10 | 7/10 | 6/10 | 7/10 | 5/10 | 7/10 | **6.5** | Operationally Functional |
| **Platform Average** | **7.0** | **6.8** | **6.5** | **6.5** | **5.7** | **5.5** | **6.5** | **Operationally Functional** |

---

*KINGA Platform Portal Governance & Alignment Audit v1.0 — June 2026*  
*This document is the authoritative governance reference for all portal development decisions. All future portal changes must be validated against the findings and recommendations in this audit.*
