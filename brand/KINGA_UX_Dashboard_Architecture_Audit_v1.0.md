# KINGA UX, Dashboard Architecture & Command Centre Audit v1.0

**Prepared by:** KINGA Product & Design Team  
**Date:** June 2026  
**Scope:** All 11 KINGA platform portals  
**Purpose:** Comprehensive assessment of visual hierarchy, information architecture, command-centre effectiveness, decision support, enterprise design standards, accessibility, and operational readiness

---

## Executive Summary

The KINGA platform is operationally capable. Its data pipelines are sophisticated, its procedures are well-structured, and its role separation is clearly defined. However, the user experience layer has not kept pace with the depth of the underlying system. Across all 11 portals, the platform presents as a collection of individual dashboards rather than a unified enterprise insurance operating system. The dashboards contain the right information but do not yet direct users to the right decisions at the right moment.

The most significant finding is structural rather than cosmetic: the platform lacks a consistent information hierarchy. Critical alerts, approval queues, and SLA breaches compete visually with analytics charts, report links, and secondary statistics. A claims manager scanning their dashboard cannot immediately identify what requires action today. An executive cannot determine in under ten seconds whether the portfolio is healthy. A claims processor cannot see at a glance whether their queue is growing or shrinking.

The platform's **Design Maturity Score is 5.8/10** — operationally functional but not yet enterprise-grade. The path to a world-class command-centre experience is achievable within two to three development sprints and does not require rebuilding the underlying data layer. It requires a disciplined reorganisation of information hierarchy, a unified portal shell, and the elevation of decision-enabling components to primary visual positions.

This audit provides the evidence, scores, and roadmap to achieve that transformation.

---

## Portal Inventory

| Portal | File Size | Tabs | Cards | KPI Tiles | Charts | Buttons | Alert Elements |
|---|---|---|---|---|---|---|---|
| Claims Manager | 1,644 lines | 7 | 55 | 17 | 8 | 24 | 21 |
| Executive | 1,131 lines | 5 | 43 | 28 | 27 | 14 | 7 |
| Claims Processor | 1,433 lines | 5 | 21 | 5 | 3 | 23 | 9 |
| Risk Manager | 760 lines | 5 | 18 | 17 | 12 | 13 | 5 |
| Admin | 994 lines | 4 | 80 | 0 | 3 | 18 | 3 |
| Panel Beater | 773 lines | 4 | 60 | 5 | 10 | 8 | 2 |
| Assessor | 314 lines | 0 | 27 | 4 | 2 | 1 | 8 |
| Claimant | 625 lines | 0 | 25 | 1 | 0 | 8 | 3 |
| Fleet Manager | 594 lines | 3 | 12 | 0 | 1 | 4 | 2 |
| Recovery | 362 lines | 0 | 0 | 23 | 0 | 5 | 4 |
| Insurer Admin | 491 lines | 0 | 18 | 19 | 4 | 3 | 4 |

---

## Part I — Portal-by-Portal Audit

---

### Portal 1: Claims Manager Dashboard

**Role:** Operational command centre for the senior claims manager responsible for queue health, fraud oversight, approvals, and team performance.

#### Phase 1 — First Impression Audit

The Claims Manager Dashboard makes a credible first impression. The KINGA forest-green header with the LIVE badge communicates operational status immediately. The workflow information banner below the header provides role context, which is a thoughtful onboarding element. However, the first screen is dense. A user arriving at the dashboard sees the header, the workflow banner, a KPI strip, three charts in a row, and the beginning of the tab content — all before scrolling. The eye is pulled in multiple directions simultaneously.

The tab bar is the most important navigation element on the page, yet it sits below the KPI strip and charts, meaning a user must scroll past analytics before reaching the operational workspace. This is an information architecture inversion: the workspace should precede the analytics.

The three-section tab grouping (Workflow / Oversight / Admin) is a significant improvement over the previous flat seven-tab grid. The section labels are readable and the grouping is logical. However, the section labels render at `text-[10px]` — they are barely visible on standard displays and invisible on smaller screens where `hidden sm:block` hides them entirely.

**Score: 6.5/10**

#### Phase 2 — Information Architecture Audit

The dashboard's information order is: Header → Workflow Banner → KPI Strip → Three Charts → Tab Bar → Tab Content. The correct order for a command centre is: Header → Critical Alerts → Approval Queue → Operational Workspace → Analytics → Reports.

The three charts (Status Donut, Processing Trend, Savings Trend) appear before the user reaches the operational workspace. These are analytical elements — they answer the question "how are we performing over time?" — but they appear before the user has answered the question "what do I need to do right now?" This creates cognitive friction: the user must process trend data before they can access their work queue.

The Attention Required panel is buried inside the Intake Queue tab, which is the correct tab to open by default but requires the user to know this. There is no persistent alert zone above the tab bar that surfaces critical items regardless of which tab is active.

The Reports Centre is positioned at the bottom of the Processed tab, which is the correct placement — reports are a tertiary concern for an operational user. This is a genuine strength of the current architecture.

**What needs to be promoted:** The Attention Required panel should surface as a persistent banner above the tab bar, showing only the count and severity of items requiring attention. The full panel remains in the Intake Queue tab.

**What needs to be demoted:** The three charts should move below the tab content or into a dedicated Analytics tab. They are monitoring elements, not decision elements.

**Score: 5.5/10**

#### Phase 3 — Command Centre Assessment

The Claims Manager Dashboard contains the components of a command centre but does not yet function as one. The following questions are evaluated:

| Question | Answered? | Location |
|---|---|---|
| What needs attention? | Partially | Attention Required panel — inside Intake Queue tab |
| What is overdue? | No | No persistent overdue indicator |
| What is blocked? | No | No blocked queue indicator |
| What requires approval? | Partially | Fleet Approvals tab — not surfaced on landing |
| What requires escalation? | Partially | Fraud Alerts tab — not surfaced on landing |
| What requires investigation? | Partially | Fraud Alerts tab — not surfaced on landing |

**Classification: Operational Dashboard** — contains the right data but does not yet direct the user to the right action. One step below a true Command Centre.

**Score: 6.0/10**

#### Phase 4 — Decision Architecture Audit

| Widget | Purpose | Decision Supported | Action Available | Classification |
|---|---|---|---|---|
| KPI Strip (6 tiles) | Portfolio snapshot | Monitor — not decide | None | Decision-Neutral |
| Status Donut Chart | Claim distribution | Portfolio health check | None | Decision-Neutral |
| Processing Trend Chart | Throughput over time | Trend monitoring | None | Decision-Neutral |
| Savings Trend Chart | Financial performance | Trend monitoring | None | Decision-Neutral |
| Attention Required Panel | Urgent items | What to action first | View claim | Decision-Enabling |
| Intake Queue | New claims | Assign, review, escalate | Multiple actions | Decision-Enabling |
| Review Queue | Claims under review | Approve, send back | Multiple actions | Decision-Enabling |
| Fraud Alerts Tab | Fraud-flagged claims | Investigate, escalate | Escalate button | Decision-Enabling |
| Fleet Approvals Tab | Fleet claim approvals | Approve or reject | Approve/Reject | Decision-Enabling |
| Reports Centre | Report generation | None — informational | Export | Decision-Neutral |
| Workflow Info Banner | Role description | None | None | Decorative |

The workflow information banner is a decorative element that occupies significant vertical space. It describes the role to the user who already knows their role. This should be removed or collapsed to a tooltip.

**Score: 6.5/10**

#### Phase 5 — Visual Hierarchy Audit

| Layer | Current Elements |
|---|---|
| Primary | Header (forest green, LIVE badge) |
| Secondary | KPI Strip, Charts |
| Tertiary | Tab Bar |
| Quaternary | Tab Content (Queues, Alerts, Approvals) |

The visual hierarchy is inverted at layers 2 and 4. The operational workspace (queues, alerts, approvals) should be at layer 2, and analytics should be at layer 3. The current arrangement means the most important operational content is the least visually prominent.

The tab bar section labels (`text-[10px]`) are too small to register as visual anchors. The active tab underline at `#3C7844` is correct but the inactive tab text at `var(--muted-foreground)` is too light on some displays.

**Score: 5.5/10**

---

### Portal 2: Executive Dashboard

**Role:** Strategic command centre for the insurer executive responsible for portfolio performance, financial oversight, fraud intelligence, and operational health.

#### Phase 1 — First Impression Audit

The Executive Dashboard has the strongest first impression of all 11 portals. The header is clean, the LIVE badge is present, and the KPI cards use icon containers with brand colours. The tab bar is underline-style with clear labels: Overview, Operational Health, ROI Breakdown, Notifications, Reports.

However, the Overview tab is extremely long. A user scrolling through it encounters: a 4-card primary KPI grid, a 4-tile secondary stat bar, a month-on-month comparison strip, two charts side by side, a global search bar, and a "Fast-Track Analytics" section with multiple sub-components. This is a significant cognitive load for a single tab.

The primary KPI cards are well-designed — icon containers, bold numbers, descriptive labels. The secondary stat bar (a single card with 4 columns) is a clean pattern that reduces visual weight compared to four separate cards.

**Score: 7.0/10**

#### Phase 2 — Information Architecture Audit

The Overview tab presents information in the following order: KPI Grid → Stat Bar → Month Comparison → Charts → Search → Analytics. This is broadly correct — KPIs first, then trend context, then deep analytics. However, the month comparison strip and the charts appear before any alert or exception information. An executive should see portfolio health alerts before trend charts.

The Operational Health tab is well-structured with two named sections (Governance and Workflow & Team Performance). This is the strongest tab in the entire platform from an information architecture perspective.

The ROI Breakdown tab is genuinely valuable — it quantifies the financial return of the KINGA system. However, it is positioned as the third tab, which means most users will never reach it. This content should be promoted to the Overview tab as a summary tile.

**Score: 6.5/10**

#### Phase 3 — Command Centre Assessment

| Question | Answered? | Location |
|---|---|---|
| What needs attention? | Partially | Executive Alerts Centre — inside Overview tab, below fold |
| What is overdue? | No | No persistent overdue indicator |
| What is blocked? | No | No blocked pipeline indicator |
| What requires approval? | No | No approval queue for executive |
| What requires escalation? | Partially | Escalation data in Operational Health tab |
| What requires investigation? | Partially | Fraud data in Overview tab charts |

**Classification: Management Dashboard** — provides excellent trend and performance data but does not yet function as an executive command centre. The executive cannot determine in under 10 seconds whether anything requires their personal intervention.

**Score: 6.0/10**

#### Phase 4 — Decision Architecture Audit

| Widget | Purpose | Decision Supported | Action Available | Classification |
|---|---|---|---|---|
| Primary KPI Cards (4) | Portfolio snapshot | Monitor | None | Decision-Neutral |
| Secondary Stat Bar (4 tiles) | Secondary metrics | Monitor | None | Decision-Neutral |
| Month Comparison Strip | Period-over-period | Trend assessment | None | Decision-Neutral |
| Charts (2 in Overview) | Performance trends | Trend monitoring | None | Decision-Neutral |
| Executive Alerts Centre | Critical exceptions | Intervention decisions | View alert | Decision-Enabling |
| Global Search | Claim lookup | Investigation | Navigate to claim | Decision-Enabling |
| Fast-Track Analytics | AI-generated insights | Strategic decisions | None | Decision-Neutral |
| ROI Breakdown (Tab 3) | Financial return | Investment decisions | None | Decision-Neutral |
| Operational Health charts | Team performance | Management decisions | None | Decision-Neutral |
| Reports Tab | Report generation | None | Generate | Decision-Neutral |

The ratio of Decision-Neutral to Decision-Enabling widgets is approximately 8:2. For an executive command centre, this ratio should be closer to 5:5. The executive is currently presented with a monitoring dashboard rather than a decision-support system.

**Score: 5.5/10**

#### Phase 5 — Visual Hierarchy Audit

The primary KPI cards are the correct visual anchor — they are the largest elements on the page and carry the most important numbers. The section dividers (ruled lines with uppercase labels) are a strong design pattern that creates clear visual breaks. The chart titles use `text-base font-semibold` which is appropriately sized.

The secondary stat bar, while compact and clean, uses the same visual weight as the primary KPI cards. A user cannot immediately distinguish primary from secondary metrics.

**Score: 6.5/10**

---

### Portal 3: Claims Processor Dashboard

**Role:** Operational workspace for the claims processor responsible for intake, document review, KINGA analysis, and claim progression.

#### Phase 1 — First Impression Audit

The Claims Processor Dashboard has a clean header with the KINGA brand colour and LIVE badge. The tab bar (Pending, Review, KINGA Complete, Completed, Notifications) is clear and operationally logical. The dashboard feels focused — it is narrower in scope than the Claims Manager portal, which is appropriate for the role.

However, the KPI stat cards above the tab bar use `text-emerald-500` and `text-emerald-600` — these are foreign colours that survived the brand alignment sprint. The cards themselves are the standard shadcn Card pattern with a small icon and a large bold number, which is functional but not visually distinctive.

**Score: 6.5/10**

#### Phase 2 — Information Architecture Audit

The tab structure (Pending → Review → KINGA Complete → Completed → Notifications) follows the natural claim lifecycle, which is an excellent information architecture decision. A processor can follow a claim's journey left to right across the tabs.

The KPI strip above the tabs shows: Total Claims, Pending, In Review, KINGA Complete, Completed. These mirror the tab labels exactly, which creates redundancy. The KPI strip should show metrics that are not visible in the tabs — such as average processing time, SLA breach count, or claims awaiting action.

**Score: 6.0/10**

#### Phase 3 — Command Centre Assessment

| Question | Answered? | Location |
|---|---|---|
| What needs attention? | Yes | Pending tab — default landing |
| What is overdue? | No | No SLA breach indicator |
| What is blocked? | No | No blocked claim indicator |
| What requires approval? | No | Processor does not approve |
| What requires escalation? | No | No escalation queue visible |
| What requires investigation? | No | No fraud flag visible in processor view |

**Classification: Operational Dashboard** — the processor has a clear work queue but lacks SLA visibility and exception surfacing.

**Score: 6.0/10**

#### Phase 4 — Decision Architecture Audit

The Claims Processor portal is the most decision-focused portal in the platform. Every tab contains actionable content. The Pending tab shows claims awaiting processing with action buttons. The Review tab shows claims under review. The KINGA Complete tab shows claims ready for processor decision. This lifecycle flow is the strongest decision architecture in the platform.

The weakness is the absence of SLA indicators on individual claim rows. A processor cannot tell from the queue view which claims are approaching their SLA deadline.

**Score: 7.0/10**

#### Phase 5 — Visual Hierarchy Audit

The tab bar is the correct primary visual anchor for this portal. The claim rows within each tab are well-structured with claim number, date, status badge, and action buttons. The visual hierarchy within each row is clear.

The KPI strip above the tabs competes with the tab bar for visual attention. Since the KPI strip mirrors the tab labels, it creates visual noise rather than adding information.

**Score: 6.5/10**

---

### Portal 4: Risk Manager Dashboard

**Role:** Oversight portal for the risk manager responsible for financial approvals, escalation management, portfolio oversight, and governance.

#### Phase 1 — First Impression Audit

The Risk Manager Dashboard has a solid header and a well-structured tab bar (Approval, Financial, Escalations, Portfolio Oversight, Notifications). The tab labels are clear and role-appropriate. The dashboard feels appropriately serious for a risk management function.

The StatCard components use brand-aligned colours. The KPI count (17 tiles) is high — the risk manager sees a large number of metrics before reaching the operational workspace.

**Score: 6.5/10**

#### Phase 2 — Information Architecture Audit

The tab order (Approval → Financial → Escalations → Portfolio Oversight → Notifications) is broadly correct. Approvals are the most time-sensitive action for a risk manager, so placing them first is the right decision. Financial data follows, then escalations, then portfolio oversight.

However, the Approval tab is the default landing tab, which means the risk manager immediately sees the approval queue. This is correct. The issue is that the approval queue does not show SLA deadlines or urgency indicators on individual approval items.

**Score: 7.0/10**

#### Phase 3 — Command Centre Assessment

| Question | Answered? | Location |
|---|---|---|
| What needs attention? | Yes | Approval tab — default landing |
| What is overdue? | No | No overdue approval indicator |
| What is blocked? | No | No blocked escalation indicator |
| What requires approval? | Yes | Approval tab |
| What requires escalation? | Yes | Escalations tab |
| What requires investigation? | Partially | Financial tab — anomaly detection |

**Classification: Operational Dashboard** — the risk manager has a clear approval queue and escalation view. One step below a true command centre due to the absence of SLA and overdue indicators.

**Score: 7.0/10**

#### Phase 4 — Decision Architecture Audit

The Risk Manager portal has the best decision-to-monitoring ratio of the operational portals. The Approval tab is entirely decision-enabling. The Escalations tab is decision-enabling. The Financial tab is primarily monitoring but contains anomaly detection which is decision-enabling.

**Score: 7.5/10**

#### Phase 5 — Visual Hierarchy Audit

The tab bar is the correct primary visual anchor. The approval queue within the Approval tab is well-structured. The 17 KPI tiles in the header area create visual density before the user reaches the operational content.

**Score: 6.5/10**

---

### Portal 5: Admin Dashboard

**Role:** System administration portal for the platform administrator responsible for user management, panel beater management, analytics, and intelligence oversight.

#### Phase 1 — First Impression Audit

The Admin Dashboard has the weakest first impression of the operational portals. The header is clean but the tab navigation uses `<Button>` components with `variant="default"` and `variant="outline"` rather than a proper tab bar. This creates an inconsistent navigation pattern — the admin portal looks like a form page rather than a dashboard.

The 80 Card elements represent the highest card density in the platform. Many of these are data rows rendered as cards (panel beater list items, user list items), which is a pattern that should use a table instead.

**Score: 5.0/10**

#### Phase 2 — Information Architecture Audit

The tab structure (Panel Beaters, Analytics, Intelligence, Users) is logical for an admin function. However, the landing view shows a 4-card KPI strip followed immediately by the tab navigation — there is no persistent alert zone for the admin. An admin should see system health indicators (failed pipelines, unresolved errors, pending user requests) before reaching the management tabs.

**Score: 5.5/10**

#### Phase 3 — Command Centre Assessment

The Admin Dashboard is an information screen rather than a command centre. It provides management tools but does not surface critical system events or require urgent decisions.

**Classification: Information Screen** — management tools without operational urgency surfacing.

**Score: 4.5/10**

#### Phase 4 — Decision Architecture Audit

The panel beater management tab contains decision-enabling content (approve/reject panel beater registrations, update tier ratings). The intelligence tab contains decision-enabling content (fraud ring investigation). However, these are buried inside tabs rather than surfaced as primary actions.

**Score: 5.5/10**

#### Phase 5 — Visual Hierarchy Audit

The button-based tab navigation creates visual inconsistency with every other portal. The card-per-row pattern for list items creates excessive visual weight. A table with row actions would be more appropriate and significantly reduce visual noise.

**Score: 4.5/10**

---

### Portal 6: Panel Beater Dashboard

**Role:** Operational workspace for the panel beater (repairer) responsible for receiving job assignments, submitting quotes, uploading photos, and tracking job status.

#### Phase 1 — First Impression Audit

The Panel Beater Dashboard has a clean structure with a logical tab bar (Queue, History, Analytics, Notifications). The queue-first approach is correct for this role. The header is appropriately simple.

The KPI strip shows 5 tiles: Active Jobs, Pending Quotes, Completed, Approval Rate, Avg Quote Value. These are relevant metrics for a panel beater. The visual treatment is consistent with the brand.

**Score: 6.5/10**

#### Phase 2 — Information Architecture Audit

The Queue tab as the default landing is correct — a panel beater's primary concern is their active job queue. The History tab for completed jobs is correctly positioned as secondary. The Analytics tab for performance metrics is correctly positioned as tertiary.

The weakness is the absence of urgency indicators in the queue. A panel beater cannot see which jobs have approaching deadlines or which quotes are overdue for submission.

**Score: 6.5/10**

#### Phase 3 — Command Centre Assessment

| Question | Answered? | Location |
|---|---|---|
| What needs attention? | Partially | Queue tab — but no urgency sorting |
| What is overdue? | No | No overdue quote indicator |
| What is blocked? | No | No blocked job indicator |
| What requires approval? | No | Panel beater does not approve |
| What requires escalation? | No | No escalation path visible |
| What requires investigation? | No | Not applicable to this role |

**Classification: Operational Dashboard** — functional work queue without urgency surfacing.

**Score: 6.0/10**

#### Phase 4 — Decision Architecture Audit

The Queue tab is decision-enabling — the panel beater can view job details, submit quotes, and upload photos. The History tab is decision-neutral. The Analytics tab is decision-neutral.

**Score: 6.5/10**

#### Phase 5 — Visual Hierarchy Audit

The tab bar is the correct primary visual anchor. The job cards within the Queue tab are well-structured. The 60 Card elements suggest that job rows are rendered as individual cards, which creates visual density. A list view with expandable rows would reduce cognitive load.

**Score: 6.0/10**

---

### Portal 7: Assessor Dashboard

**Role:** Operational workspace for the assessor responsible for damage evaluation, quote assessment, report generation, and appointment management.

#### Phase 1 — First Impression Audit

The Assessor Dashboard was recently rebuilt from a 155-line stub into a 314-line operational workspace. The rebuild introduced three tabs (My Queue, Appointments, Performance) and a KPI strip. The structure is now functional.

However, the dashboard still lacks the header pattern used by the Claims Manager and Executive portals. There is no LIVE badge, no role description, and no brand-aligned header card. The portal opens directly into the tab content without a visual anchor.

**Score: 5.5/10**

#### Phase 2 — Information Architecture Audit

The tab order (My Queue → Appointments → Performance) is correct. An assessor's primary concern is their active assessment queue, followed by their appointment schedule, followed by their performance metrics.

The My Queue tab shows claims assigned to the assessor with priority badges. This is the correct default landing view.

**Score: 6.5/10**

#### Phase 3 — Command Centre Assessment

| Question | Answered? | Location |
|---|---|---|
| What needs attention? | Yes | My Queue tab — priority badges |
| What is overdue? | Partially | Priority badges indicate urgency |
| What is blocked? | No | No blocked assessment indicator |
| What requires approval? | No | Assessor does not approve |
| What requires escalation? | No | No escalation path visible |
| What requires investigation? | No | Not applicable to this role |

**Classification: Operational Dashboard** — functional queue with basic urgency indicators.

**Score: 6.0/10**

#### Phase 4 — Decision Architecture Audit

The My Queue tab is decision-enabling. The Appointments tab is decision-enabling (schedule management). The Performance tab is decision-neutral (monitoring). The ratio is 2:1 decision-enabling to neutral, which is appropriate for this role.

**Score: 6.5/10**

#### Phase 5 — Visual Hierarchy Audit

The absence of a header card means the portal has no primary visual anchor. The tab bar serves as the de facto primary element, which is acceptable but not ideal. The KPI strip provides secondary context.

**Score: 5.5/10**

---

### Portal 8: Claimant Dashboard

**Role:** Self-service portal for the claimant (vehicle owner) to submit claims, track status, and access documents.

#### Phase 1 — First Impression Audit

The Claimant Dashboard is the most consumer-facing portal in the platform. It has a clean layout with a progress stepper showing claim status, a claims list, and action buttons. The design is appropriate for a non-technical user.

However, the portal uses `text-emerald-500` and `text-emerald-600` for the Completed KPI card — a foreign colour that survived the brand alignment sprint. The stepper uses inline styles with brand hex values, which is correct.

**Score: 6.0/10**

#### Phase 2 — Information Architecture Audit

The Claimant Dashboard presents: KPI strip (4 tiles) → Claims List → Action Buttons. This is the correct order for a claimant — they want to see their claim status immediately, then access their claims list, then take action.

The absence of a notification or alert zone means a claimant cannot see at a glance whether any of their claims require their attention (e.g., additional documents requested, settlement offer pending).

**Score: 6.0/10**

#### Phase 3 — Command Centre Assessment

The Claimant Dashboard is not a command centre — it is a self-service portal. The correct classification is an Information Screen with action capabilities. The claimant's primary need is status visibility, not operational decision-making.

**Classification: Information Screen** — appropriate for the role.

**Score: 7.0/10** (scored against role expectations, not command-centre criteria)

#### Phase 4 — Decision Architecture Audit

The "New Claim" button is the primary decision-enabling element. The claims list with status badges is decision-neutral (monitoring). The absence of a "Documents Required" alert means claimants may not know when action is needed from them.

**Score: 5.5/10**

#### Phase 5 — Visual Hierarchy Audit

The progress stepper is the strongest visual element — it communicates claim status immediately and is the correct primary visual anchor for this portal. The KPI strip above it competes for attention unnecessarily.

**Score: 6.0/10**

---

### Portal 9: Fleet Manager Dashboard

**Role:** Fleet oversight portal for the fleet manager responsible for monitoring vehicle claims, tracking fleet risk, and managing the company's claims portfolio.

#### Phase 1 — First Impression Audit

The Fleet Manager Dashboard is the simplest portal in the platform at 594 lines. The header is minimal — no LIVE badge, no brand-aligned header card. The tab bar (Claims, Vehicle Tracking, Risk Analytics) is clean and logical.

The absence of KPI tiles (0 detected) means the fleet manager has no at-a-glance portfolio summary. This is a significant gap for a role that needs to monitor fleet health.

**Score: 5.0/10**

#### Phase 2 — Information Architecture Audit

The tab order (Claims → Vehicle Tracking → Risk Analytics) is correct. Claims are the primary concern, followed by vehicle-level tracking, followed by risk analytics.

The Claims tab contains a filter bar and a claims table. This is functional but lacks the urgency surfacing that would make it a command centre. A fleet manager cannot see at a glance how many claims are active, how many are overdue, or which vehicles are generating the most claims.

**Score: 5.5/10**

#### Phase 3 — Command Centre Assessment

**Classification: Information Screen** — provides claim visibility without urgency surfacing or decision support.

**Score: 4.5/10**

#### Phase 4 — Decision Architecture Audit

The Claims tab is primarily decision-neutral — it shows claim status but does not surface claims that require fleet manager action. The Vehicle Tracking tab is informational. The Risk Analytics tab is monitoring.

**Score: 4.5/10**

#### Phase 5 — Visual Hierarchy Audit

The absence of a header card and KPI strip means the portal has no visual anchor. The tab bar is the only structural element above the content. The portal feels unfinished compared to the other portals.

**Score: 4.5/10**

---

### Portal 10: Recovery Portal

**Role:** Operational workspace for the recovery officer responsible for subrogation, third-party demand management, and recovery case tracking.

#### Phase 1 — First Impression Audit

The Recovery Portal uses a status-card navigation pattern rather than a tab bar — seven coloured status cards (Pending Review, Under Investigation, Open Cases, Demand Sent, Disputed/Legal, Settled, Archived) serve as both KPI tiles and navigation triggers. This is a creative and functional pattern that communicates portfolio distribution immediately.

However, two of the seven status cards still use foreign colours: "Demand Sent" uses `text-violet-400 bg-violet-500/10` and "Disputed/Legal" uses `text-rose-400 bg-rose-500/10`. These are not from the KINGA brand palette.

**Score: 6.5/10**

#### Phase 2 — Information Architecture Audit

The status-card navigation is the strongest information architecture pattern in the platform for a case-management role. The recovery officer can see the distribution of their portfolio across all seven stages at a glance and navigate directly to any stage by clicking the card. This is a genuinely excellent design decision.

The weakness is the absence of a KPI summary above the status cards — the recovery officer cannot see total recovery value, recovery rate, or average case age without navigating into individual case lists.

**Score: 7.0/10**

#### Phase 3 — Command Centre Assessment

| Question | Answered? | Location |
|---|---|---|
| What needs attention? | Yes | Status cards show case counts |
| What is overdue? | Yes | Deadline chips on case rows |
| What is blocked? | Partially | Disputed/Legal card |
| What requires approval? | No | Recovery officer does not approve |
| What requires escalation? | No | No escalation path visible |
| What requires investigation? | Yes | Under Investigation card |

**Classification: Operational Dashboard** — the status-card navigation pattern brings this portal close to command-centre territory.

**Score: 7.0/10**

#### Phase 4 — Decision Architecture Audit

The status-card navigation is decision-enabling — clicking a card takes the user directly to the relevant case list. The deadline chips on case rows are decision-enabling — they surface urgency at the row level. The case list with action buttons is decision-enabling.

**Score: 7.5/10**

#### Phase 5 — Visual Hierarchy Audit

The status cards are the correct primary visual anchor. The deadline chips provide secondary urgency context. The case list provides tertiary operational content. This is the most coherent visual hierarchy in the platform.

**Score: 7.5/10**

---

### Portal 11: Insurer Admin Dashboard

**Role:** Insurer-level administration portal for the insurer administrator responsible for user management, claim oversight, and performance monitoring.

#### Phase 1 — First Impression Audit

The Insurer Admin Dashboard has a clean header and a KPI strip with 19 tiles — the highest KPI density in the platform. Nineteen metrics on a single page before any operational content creates significant cognitive load. Many of these tiles are redundant with the claims list below them.

**Score: 5.5/10**

#### Phase 2 — Information Architecture Audit

The dashboard presents: KPI Strip (19 tiles) → Claims List → Charts. The 19-tile KPI strip is the most significant information architecture problem in the platform. The insurer admin does not need 19 metrics before reaching their work. Six to eight carefully selected KPIs would be more effective.

**Score: 5.0/10**

#### Phase 3 — Command Centre Assessment

**Classification: Monitoring Dashboard** — provides extensive metrics but does not surface actionable exceptions.

**Score: 5.0/10**

#### Phase 4 — Decision Architecture Audit

The claims list is decision-enabling. The charts are decision-neutral. The 19 KPI tiles are primarily decision-neutral — they provide context but do not direct the user to a specific action.

**Score: 5.5/10**

#### Phase 5 — Visual Hierarchy Audit

The 19 KPI tiles create a visual wall before the user reaches the operational content. The eye has no clear primary anchor — all 19 tiles compete equally for attention. The claims list below is the most valuable operational element but is visually subordinate to the KPI wall.

**Score: 4.5/10**

---

## Part II — Phases 6–10 for All Portals

---

### Phase 6 — Dashboard Density & Cognitive Load Audit

| Portal | Widgets | KPIs | Charts | Cognitive Load | Verdict |
|---|---|---|---|---|---|
| Claims Manager | High (55 cards) | 17 | 8 | High | Reduce charts; move to Analytics tab |
| Executive | Medium (43 cards) | 28 | 27 | High | Consolidate KPIs; reduce chart count |
| Claims Processor | Low (21 cards) | 5 | 3 | Low | Well-calibrated for role |
| Risk Manager | Medium (18 cards) | 17 | 12 | Medium | Reduce KPI count to 8 |
| Admin | Very High (80 cards) | 0 | 3 | Very High | Replace card-per-row with tables |
| Panel Beater | High (60 cards) | 5 | 10 | High | Replace card-per-row with list view |
| Assessor | Low (27 cards) | 4 | 2 | Low | Appropriate for rebuilt portal |
| Claimant | Medium (25 cards) | 1 | 0 | Low | Appropriate for self-service role |
| Fleet Manager | Low (12 cards) | 0 | 1 | Low | Needs more content, not less |
| Recovery | Low (0 cards, 23 KPI) | 23 | 0 | Medium | Reduce KPI tiles to 8 |
| Insurer Admin | Medium (18 cards) | 19 | 4 | Very High | Reduce to 8 KPIs maximum |

**Platform-wide finding:** The Admin Dashboard (80 cards) and Panel Beater Dashboard (60 cards) use a card-per-row pattern for list data. This is the single largest contributor to visual density across the platform. Converting these to tables would reduce perceived complexity by approximately 60% in these portals.

---

### Phase 7 — Enterprise Design & Aesthetics Audit

Evaluated against: Microsoft Power BI, Salesforce, ServiceNow, Guidewire, Jira Enterprise, Palantir, Datadog, and modern insurance platforms.

**Enterprise-grade patterns present:**
- Underline tab navigation (Claims Manager, Executive, Claims Processor, Risk Manager, Panel Beater)
- Section dividers with uppercase labels (Executive Dashboard Overview and Operational Health tabs)
- Status-card navigation (Recovery Portal)
- Deadline chips with colour-coded urgency (Recovery Portal)
- LIVE badge in header (Claims Manager, Executive, Claims Processor)
- Brand-aligned icon containers in KPI cards (Executive Dashboard)

**Amateur patterns identified:**
- Button-based tab navigation (Admin Dashboard) — resembles a form page, not an enterprise dashboard
- Card-per-row list rendering (Admin, Panel Beater) — creates visual noise; tables are the enterprise standard for list data
- 19-tile KPI wall (Insurer Admin) — no enterprise dashboard presents 19 equal-weight metrics simultaneously
- Workflow information banner (Claims Manager) — decorative text block that occupies prime vertical space
- Missing header card (Assessor, Fleet Manager) — portals without a visual anchor feel unfinished
- `text-[10px]` section labels in Claims Manager tab bar — below minimum readable size for enterprise software

**Legacy patterns identified:**
- `text-emerald-500`/`text-emerald-600` remaining in Claims Processor and Claimant portals — foreign colours not from the brand palette
- `text-violet-400`/`text-rose-400` in Recovery Portal status cards — two of seven cards use non-brand colours

**Alignment with enterprise benchmarks:**

| Benchmark | KINGA Alignment |
|---|---|
| Microsoft Power BI | Partial — KPI cards are similar; lacks the filter bar and drill-down patterns |
| Salesforce | Partial — tab navigation is similar; lacks the activity feed and related lists |
| ServiceNow | Low — ServiceNow's queue management is more structured with SLA indicators |
| Guidewire | Medium — claims lifecycle tabs mirror Guidewire's ClaimCenter; lacks the SLA clock |
| Jira Enterprise | Low — Jira's board view with swimlanes is more effective for queue management |
| Palantir | Low — Palantir's graph-based intelligence view is not present |
| Datadog | Low — Datadog's alert-first layout is the model KINGA should follow |

---

### Phase 8 — Accessibility & Usability Audit

| Portal | Keyboard Nav | Colour Dependency | Contrast | Mobile | Time to Find Urgent Issue |
|---|---|---|---|---|---|
| Claims Manager | Partial — custom tab bar has ARIA | Medium — colour badges | Good | Responsive | ~15 seconds |
| Executive | Good — shadcn Tabs | Medium — chart colours | Good | Responsive | ~20 seconds |
| Claims Processor | Good — shadcn Tabs | Low | Good | Responsive | ~5 seconds |
| Risk Manager | Good — shadcn Tabs | Low | Good | Responsive | ~5 seconds |
| Admin | Poor — button tabs, no ARIA tablist | Low | Good | Responsive | ~30 seconds |
| Panel Beater | Good — shadcn Tabs | Low | Good | Responsive | ~10 seconds |
| Assessor | N/A — no tab bar | Low | Good | Responsive | ~5 seconds |
| Claimant | Good | Low | Good | Responsive | ~5 seconds |
| Fleet Manager | Good — shadcn Tabs | Low | Good | Responsive | ~20 seconds |
| Recovery | Partial — custom status cards | Medium — colour-coded stages | Good | Responsive | ~5 seconds |
| Insurer Admin | Poor — no tab bar | Medium — role badges | Good | Responsive | ~30 seconds |

**Critical accessibility findings:**
- The Admin Dashboard uses `<Button>` components for tab navigation without `role="tablist"` or `role="tab"` ARIA attributes. Keyboard users cannot navigate between tabs using arrow keys.
- The Claims Manager custom tab bar has `role="tab"` and `aria-selected` attributes added in the recent sprint — this is a genuine improvement.
- The Recovery Portal status cards do not have `role="tab"` or keyboard navigation support.
- Two Recovery Portal status cards (`violet` and `rose`) rely on colour alone to communicate status — a colour-blind user cannot distinguish these from the brand-coloured cards.

---

### Phase 9 — Dashboard Rationalisation Audit

**Remove:**
- Workflow Information Banner (Claims Manager) — decorative text block; move role description to a help tooltip
- Redundant KPI strip in Claims Processor — the 5 KPI tiles mirror the 5 tab labels exactly; replace with non-redundant metrics (SLA breach count, avg processing time, claims awaiting action)
- 11 of 19 KPI tiles in Insurer Admin — reduce to 8 highest-value metrics

**Consolidate:**
- Executive Dashboard Overview tab — merge the 4-card primary KPI grid and the 4-tile secondary stat bar into a single 6-tile stat bar; the visual distinction between "primary" and "secondary" is not clear enough to justify two separate components
- Admin Dashboard card-per-row lists — convert panel beater list, user list, and intelligence list to tables with row actions
- Panel Beater job cards — convert to a list view with expandable rows; 60 cards is excessive

**Promote:**
- Attention Required Panel (Claims Manager) — surface a persistent count badge above the tab bar; the full panel remains in the Intake Queue tab
- Executive Alerts Centre — move from below the fold in the Overview tab to the top of the Overview tab, above the KPI grid
- ROI Breakdown (Executive, Tab 3) — add a summary tile to the Overview tab; the full breakdown remains in Tab 3
- SLA indicators — add deadline chips to claim rows in Claims Manager, Claims Processor, and Risk Manager portals

**Demote:**
- Three analytics charts in Claims Manager Overview — move to a dedicated Analytics sub-tab; they should not appear before the operational workspace
- Fast-Track Analytics section (Executive) — move to the Operational Health tab; it is an operational metric, not an executive overview

**Replace:**
- Admin Dashboard button-based tab navigation — replace with shadcn `<Tabs>` component with proper ARIA attributes
- Recovery Portal `violet`/`rose` status cards — replace with brand-aligned colours (`#4878A8` slate blue for Demand Sent, `#A32D2D` danger red for Disputed/Legal)
- Fleet Manager Dashboard — replace the minimal header with the KingaPortalShell `PortalHeader` component; add a 6-tile KPI strip

---

### Phase 10 — Target State Dashboard Architecture

The following wireframe-style layouts represent the recommended target state for each portal type.

#### Claims Manager — Target State

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER: KINGA Claims Manager | LIVE | Date | Period Selector       │
├─────────────────────────────────────────────────────────────────────┤
│  CRITICAL ATTENTION ZONE (persistent, always visible)               │
│  [🔴 3 Urgent] [🟡 7 Attention] [⏰ 2 SLA Breach] [🚨 1 Fraud]    │
├─────────────────────────────────────────────────────────────────────┤
│  TAB BAR: Workflow [Intake | Review | Active] | Oversight [Fraud |  │
│           Fleet] | Admin [Processed | Notifications]                │
├─────────────────────────────────────────────────────────────────────┤
│  OPERATIONAL WORKSPACE (tab content — full width)                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Claim Queue with SLA chips, priority badges, action buttons │   │
│  └──────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│  KPI STRIP (6 tiles — compact, below workspace)                     │
│  Total | Active | Completed | Fraud | Fast-Track | Avg Days         │
├─────────────────────────────────────────────────────────────────────┤
│  ANALYTICS ZONE (collapsed by default, expandable)                  │
│  [Status Distribution] [Processing Trend] [Savings Trend]          │
├─────────────────────────────────────────────────────────────────────┤
│  REPORTS ZONE (in Processed tab only)                               │
└─────────────────────────────────────────────────────────────────────┘
```

**Key changes from current state:**
1. Critical Attention Zone becomes a persistent banner above the tab bar — always visible regardless of active tab
2. Tab bar moves above the KPI strip and charts
3. Analytics charts move below the workspace, collapsed by default
4. SLA deadline chips added to every claim row

#### Executive Dashboard — Target State

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER: KINGA Executive | LIVE | Period Selector | Export          │
├─────────────────────────────────────────────────────────────────────┤
│  EXECUTIVE ALERTS ZONE (persistent)                                 │
│  [Critical exceptions requiring executive attention]                │
├─────────────────────────────────────────────────────────────────────┤
│  PRIMARY KPI STRIP (6 tiles with icon containers)                   │
│  Claims | Exposure | Recovered | Fraud Rate | SLA | Savings         │
├─────────────────────────────────────────────────────────────────────┤
│  TAB BAR: Overview | Operational Health | ROI | Reports             │
├─────────────────────────────────────────────────────────────────────┤
│  OVERVIEW TAB:                                                       │
│  ┌─────────────────────────┬───────────────────────────────────┐   │
│  │ Month Comparison Strip  │ ROI Summary Tile                  │   │
│  ├─────────────────────────┴───────────────────────────────────┤   │
│  │ Performance Charts (2 columns)                              │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ KINGA Intelligence Zone                                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

#### Fleet Manager — Target State

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER: Fleet Manager | LIVE | Fleet Name | Date                   │
├─────────────────────────────────────────────────────────────────────┤
│  KPI STRIP (6 tiles)                                                │
│  Active Claims | Total Vehicles | High-Risk Vehicles | Avg Cost |   │
│  Open Claims | Completed This Month                                 │
├─────────────────────────────────────────────────────────────────────┤
│  TAB BAR: Claims | Vehicle Tracking | Risk Analytics                │
├─────────────────────────────────────────────────────────────────────┤
│  CLAIMS TAB: Filterable claims table with status badges             │
│  VEHICLE TAB: Vehicle list with claim count and risk score          │
│  RISK TAB: Risk distribution chart, high-risk vehicle list          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Part III — Platform-Wide Deliverables

---

### Top 20 Design Problems

1. Button-based tab navigation in Admin Dashboard — no ARIA attributes, inconsistent with all other portals
2. 19-tile KPI wall in Insurer Admin Dashboard — no enterprise dashboard presents 19 equal-weight metrics
3. Analytics charts appearing before the operational workspace in Claims Manager
4. Workflow Information Banner in Claims Manager — decorative text occupying prime vertical space
5. `text-[10px]` section labels in Claims Manager tab bar — below minimum readable size
6. Card-per-row list rendering in Admin Dashboard (80 cards) — tables are the enterprise standard
7. Card-per-row list rendering in Panel Beater Dashboard (60 cards)
8. Missing header card in Fleet Manager Dashboard — no visual anchor
9. Missing header card in Assessor Dashboard — no visual anchor
10. `text-emerald-500`/`text-emerald-600` remaining in Claims Processor and Claimant portals
11. `text-violet-400`/`text-rose-400` in Recovery Portal status cards — non-brand colours
12. No persistent Critical Attention Zone in Claims Manager — urgent items buried in a tab
13. Executive Alerts Centre below the fold in Executive Dashboard Overview tab
14. No SLA deadline chips on claim rows in Claims Manager, Claims Processor, or Risk Manager
15. Redundant KPI strip in Claims Processor — mirrors tab labels exactly
16. Secondary stat bar in Executive Dashboard not visually distinct from primary KPI grid
17. Fast-Track Analytics section in Executive Dashboard — operational metric in executive overview
18. ROI Breakdown buried in Tab 3 of Executive Dashboard — no summary visible on landing
19. Recovery Portal status cards lack keyboard navigation support
20. Admin Dashboard lacks system health indicators (failed pipelines, pending user requests)

---

### Top 20 UX Problems

1. A claims manager cannot determine in under 10 seconds what requires their attention today
2. An executive cannot determine in under 10 seconds whether the portfolio requires their personal intervention
3. No SLA visibility on any claim row across any portal — users cannot see which claims are approaching deadlines
4. The Claims Manager must navigate to a specific tab to see fraud alerts — they are not surfaced on landing
5. The Fleet Manager has no KPI strip — they have no at-a-glance portfolio summary
6. The Insurer Admin is presented with 19 metrics before reaching any operational content
7. The Admin Dashboard keyboard user cannot navigate between tabs using arrow keys
8. The Recovery Portal keyboard user cannot navigate between status cards using arrow keys
9. Two Recovery Portal status cards rely on colour alone to communicate status — inaccessible to colour-blind users
10. The Assessor Dashboard has no header — the portal has no visual identity or role confirmation
11. The Claims Processor KPI strip mirrors the tab labels — provides no additional information
12. The Executive Dashboard ROI Breakdown is buried in Tab 3 — most users will never see it
13. The Claims Manager analytics charts appear before the work queue — forces the user to scroll past monitoring data to reach their workspace
14. The Workflow Information Banner in Claims Manager occupies prime vertical space with role description text the user already knows
15. The Admin Dashboard presents panel beater data as 80 cards rather than a table — excessive scrolling required
16. The Panel Beater Dashboard presents job data as 60 cards rather than a list — excessive scrolling required
17. No notification of items requiring claimant action (documents requested, settlement offer) in Claimant Dashboard
18. The Executive Dashboard has no persistent alert zone — critical exceptions are below the fold
19. The Claims Manager section labels are `hidden sm:block` — invisible on mobile and small screens
20. No cross-portal navigation — a claims manager cannot navigate directly to the executive view or recovery portal

---

### Top 20 Architecture Problems

1. No unified portal shell — 5 portals do not use the KingaPortalShell header pattern
2. No persistent Critical Attention Zone pattern — each portal handles urgency differently
3. No SLA clock component — deadline visibility is absent across all portals
4. Analytics and monitoring content appears before operational workspace in 4 portals
5. No cross-portal alert routing — a fraud alert in the Claims Manager portal is not visible in the Executive portal
6. No system health dashboard — the Admin portal does not show pipeline health, error rates, or processing backlogs
7. Tab navigation pattern is inconsistent — shadcn Tabs (5 portals), custom button tabs (Admin), custom button tabs with ARIA (Claims Manager), no tabs (4 portals)
8. KPI count is inconsistent — ranges from 0 (Fleet Manager) to 19 (Insurer Admin) with no design rationale
9. Card-per-row list pattern used where tables are appropriate (Admin, Panel Beater)
10. No drill-down pattern — clicking a KPI tile does not navigate to the relevant filtered view
11. No period selector consistency — Executive Dashboard has a period selector; no other portal does
12. No role-based alert routing — fraud alerts are visible to the claims manager but not surfaced to the executive or risk manager
13. No escalation visibility chain — an escalated claim is not visible across the escalation path (Processor → Manager → Risk Manager → Executive)
14. No audit trail component — no portal shows a claim's history of actions and decisions
15. Reports are positioned inconsistently — in a tab (Executive, Claims Manager, Claims Processor) or not present (Fleet Manager, Claimant)
16. No empty state design standard — each portal handles empty queues differently
17. No loading state design standard — some portals use spinners, some use skeleton screens, some show nothing
18. No error state design standard — API errors are handled inconsistently across portals
19. The KingaPortalShell component exists but is not yet used by any portal — it was built but not integrated
20. No portal-to-portal navigation — users must return to the Portal Hub to switch portals

---

### Top 20 Dashboard Wins

1. Recovery Portal status-card navigation — the best information architecture pattern in the platform; communicates portfolio distribution and enables navigation simultaneously
2. Claims Manager three-section tab grouping (Workflow / Oversight / Admin) — logical and clear
3. Executive Dashboard section dividers with uppercase labels — creates clear visual breaks
4. Risk Manager Approval tab as default landing — correct prioritisation for the role
5. Claims Processor lifecycle tab order (Pending → Review → KINGA Complete → Completed) — mirrors the claim journey
6. Executive Dashboard Operational Health tab two-section structure — the best-structured tab in the platform
7. LIVE badge in portal headers — communicates real-time data status immediately
8. Deadline chips in Recovery Portal case rows — the best urgency indicator in the platform
9. Executive Dashboard primary KPI cards with icon containers — the strongest KPI design in the platform
10. Claims Manager Attention Required panel — surfaces urgent items with severity classification
11. Brand-aligned chart colours across all portals — consistent visual language in data visualisation
12. Claims Manager ARIA-accessible custom tab bar — keyboard navigation implemented correctly
13. Executive Dashboard Fast-Track Analytics section — quantifies KINGA's operational value
14. Risk Manager financial anomaly detection — proactive exception surfacing
15. Recovery Portal deadline chip colour system (red/amber/green) — clear urgency communication
16. Claims Manager Escalation Centre with severity-coloured left borders — visual priority communication
17. Executive Dashboard month-on-month comparison strip — period context without chart overhead
18. Panel Beater approval rate KPI — relevant performance metric for the role
19. Claimant Dashboard progress stepper — the clearest status communication in the platform
20. KingaPortalShell component architecture — the foundation for platform-wide consistency

---

### Top 20 Quick Wins

These changes can be implemented in under one day each and will produce immediate visible improvement.

1. Remove the Workflow Information Banner from Claims Manager — frees prime vertical space
2. Add `role="tablist"` and `role="tab"` ARIA attributes to Admin Dashboard button navigation
3. Replace `text-violet-400 bg-violet-500/10` in Recovery Portal "Demand Sent" card with `#4878A8` slate blue
4. Replace `text-rose-400 bg-rose-500/10` in Recovery Portal "Disputed/Legal" card with `#A32D2D` danger red
5. Fix `text-emerald-500`/`text-emerald-600` remaining in Claims Processor portal
6. Fix `text-emerald-500`/`text-emerald-600` remaining in Claimant portal
7. Increase Claims Manager tab section labels from `text-[10px]` to `text-xs` and remove `hidden sm:block`
8. Add the KingaPortalShell `PortalHeader` to Fleet Manager Dashboard
9. Add the KingaPortalShell `PortalHeader` to Assessor Dashboard
10. Reduce Insurer Admin KPI tiles from 19 to 8 (remove the 11 lowest-value tiles)
11. Move Executive Alerts Centre above the KPI grid in the Executive Dashboard Overview tab
12. Add a persistent alert count badge above the Claims Manager tab bar (count only, not full panel)
13. Convert Admin Dashboard panel beater list from card-per-row to a table
14. Convert Admin Dashboard user list from card-per-row to a table
15. Add a 6-tile KPI strip to Fleet Manager Dashboard
16. Replace Claims Processor KPI strip with non-redundant metrics (SLA breach count, avg processing time)
17. Add `role="tab"` and keyboard navigation to Recovery Portal status cards
18. Move the three analytics charts in Claims Manager below the tab bar (into a collapsed Analytics section)
19. Add a ROI summary tile to Executive Dashboard Overview tab (linking to full ROI Breakdown tab)
20. Add `tabIndex` and `onKeyDown` arrow-key navigation to Admin Dashboard button tabs

---

### Top 20 Strategic Improvements

These changes require 1–5 days of development each and will transform the platform's command-centre capability.

1. **Build a universal SLA Clock component** — a deadline chip that shows days remaining with colour-coded urgency (red < 2 days, amber < 7 days, green > 7 days). Wire it to every claim row across all portals.
2. **Build a persistent Critical Attention Zone** — a fixed banner below the header in Claims Manager, Claims Processor, and Risk Manager that shows urgent item counts regardless of active tab. Clicking a count navigates to the relevant tab.
3. **Integrate KingaPortalShell into all 11 portals** — the component exists but is not used. Applying it will unify the header pattern across the platform.
4. **Build a cross-portal alert routing system** — fraud alerts flagged in the Claims Manager portal should appear in the Executive Dashboard alerts centre and the Risk Manager escalations tab.
5. **Build a drill-down pattern for KPI tiles** — clicking a KPI tile should navigate to a filtered view of the underlying data. For example, clicking "Fraud Alerts: 7" should navigate to the Fraud Alerts tab with the filter pre-applied.
6. **Build a system health dashboard in Admin** — show pipeline health (last run time, success rate, error count), processing backlog, and pending user requests.
7. **Rebuild Fleet Manager Dashboard** — add KPI strip, vehicle risk scoring, and fleet-level analytics. The current portal is the weakest in the platform.
8. **Add an escalation visibility chain** — show the escalation path of a claim (Processor → Manager → Risk Manager → Executive) as a visual timeline on the claim detail page.
9. **Build a unified notification centre** — replace the per-portal Notifications tab with a platform-wide notification centre accessible from the sidebar. Show all notifications regardless of portal.
10. **Add period selector consistency** — apply the Executive Dashboard period selector pattern to Claims Manager, Claims Processor, and Risk Manager.
11. **Build an audit trail component** — show a claim's history of actions, decisions, and state changes as a timeline. Wire it to the claim detail page.
12. **Add empty state design standards** — define and implement consistent empty state components (icon + heading + description + action button) for all queue views.
13. **Add loading skeleton standards** — replace spinner-based loading with skeleton screens across all portals for a more professional loading experience.
14. **Build a portal-to-portal navigation shortcut** — add a role-switcher or quick-nav element to the sidebar that allows authorised users to navigate directly between portals without returning to the Portal Hub.
15. **Implement the KingaPortalShell PortalAlerts component** — the component is built but not wired to live data. Connect it to the `claims.getAttentionRequired` procedure for Claims Manager and the `analytics.getExecutiveAlerts` procedure for Executive.
16. **Add SLA breach escalation automation** — when a claim breaches its SLA, automatically surface it in the Claims Manager Critical Attention Zone and send a notification to the Risk Manager.
17. **Build a Governance Exceptions Register** — a dedicated view in the Executive Dashboard showing all claims that have breached governance thresholds (SLA, fraud score, financial limit).
18. **Add role-based KPI personalisation** — allow users to select which 6–8 KPIs appear in their header strip. Store preferences per user.
19. **Build a cross-claim intelligence panel** — a visual network showing connected claims, shared entities, and fraud ring indicators. Wire it to the existing `crossClaim` procedures.
20. **Implement a Decision Inbox pattern** — a unified view showing all items across all portals that require a specific user's decision today (approvals, escalations, fraud flags, SLA breaches). This is the highest-value single feature the platform could add.

---

## Part IV — Cross-Portal Analysis

### Consistency Assessment

| Element | Consistent? | Portals with Issues |
|---|---|---|
| Header pattern | No | Fleet Manager, Assessor — no header card |
| KPI strip | No | Fleet Manager (none), Insurer Admin (19 tiles), Claims Processor (redundant) |
| Tab navigation | No | Admin (button tabs), 4 portals (no tabs) |
| Active tab colour | Yes | All tabbed portals use `#3C7844` |
| Chart colours | Yes | All charts use KINGA brand palette |
| Card shadow/border | Yes | All cards use `shadow-sm` or `border` |
| Alert placement | No | Each portal handles alerts differently |
| Empty states | No | Inconsistent across portals |
| Loading states | No | Mix of spinners and skeleton screens |
| Error states | No | Inconsistent across portals |

### Navigation Assessment

The platform uses a sidebar navigation (DashboardLayout) that is consistent across all portals. The sidebar active state uses the KINGA forest green left-border indicator. The sidebar labels are readable and the icon-label pairing is clear.

The weakness is the absence of cross-portal navigation. A user in the Claims Manager portal cannot navigate directly to the Recovery Portal or the Executive Dashboard without returning to the Portal Hub. This creates unnecessary navigation friction for users who hold multiple roles.

### Header Design Assessment

Five portals (Claims Manager, Executive, Claims Processor, Risk Manager, Panel Beater) use the brand-aligned header card with the KINGA forest green icon container and LIVE badge. Six portals (Assessor, Fleet Manager, Admin, Claimant, Recovery, Insurer Admin) use minimal or no header. This inconsistency is the most visible cross-portal design problem.

### KPI Design Assessment

The Executive Dashboard primary KPI cards (icon container, bold number, descriptive label, trend indicator) are the strongest KPI design in the platform. The Claims Manager KPI strip (inline flex row with icon, bold number, label, pipe divider) is a compact and effective secondary pattern. The Insurer Admin 19-tile wall is the weakest pattern. The Fleet Manager has no KPIs at all.

### Action Placement Assessment

Action buttons are consistently placed within claim rows (right-aligned) across Claims Manager, Claims Processor, and Risk Manager. This is correct. The Admin Dashboard places actions inside card footers, which is less discoverable. The Panel Beater Dashboard places actions inside job cards, which is acceptable but creates visual density.

---

## Part V — Maturity Scores

### KINGA Dashboard Design Maturity Score

| Dimension | Score | Evidence |
|---|---|---|
| Visual Consistency | 6.0/10 | Brand colours consistent; header pattern inconsistent across 6 portals |
| Information Architecture | 5.5/10 | Analytics before workspace in 4 portals; no persistent alert zone |
| Component Quality | 6.5/10 | KPI cards, status cards, and tab bars are well-designed; card-per-row lists are not |
| Typography | 7.0/10 | Inter font applied globally; hierarchy is clear in most portals |
| Spacing & Alignment | 6.0/10 | Consistent card padding; KPI density issues in Insurer Admin |
| Colour Discipline | 7.5/10 | Brand palette applied across 9 of 11 portals; 2 portals have remaining foreign colours |
| **Overall Design Maturity** | **6.4/10** | Operationally functional; not yet enterprise-grade |

### KINGA UX Maturity Score

| Dimension | Score | Evidence |
|---|---|---|
| Decision Support | 5.5/10 | Decision-enabling widgets are present but not prioritised |
| Operational Visibility | 6.0/10 | Queues are visible; SLA and urgency indicators are absent |
| Cognitive Load | 5.5/10 | Card density and KPI walls create unnecessary cognitive friction |
| Accessibility | 5.5/10 | ARIA attributes partial; keyboard navigation incomplete in Admin and Recovery |
| Navigation Efficiency | 6.0/10 | Tab navigation is clear; cross-portal navigation is absent |
| Error & Empty States | 4.5/10 | Inconsistent across portals |
| **Overall UX Maturity** | **5.5/10** | Functional but not yet user-centred |

### KINGA Command Centre Maturity Score

| Dimension | Score | Evidence |
|---|---|---|
| Alert Surfacing | 5.0/10 | Alerts exist but are buried in tabs; no persistent alert zone |
| SLA Visibility | 3.0/10 | Deadline chips only in Recovery Portal; absent in all other portals |
| Approval Visibility | 6.5/10 | Approval queues are present and accessible |
| Escalation Visibility | 5.5/10 | Escalation tabs exist; no cross-portal escalation chain |
| Queue Intelligence | 6.0/10 | Queue Health Matrix and Attention Required panel are strong |
| Decision Routing | 4.5/10 | No drill-down from KPI to filtered view; no Decision Inbox |
| **Overall Command Centre Maturity** | **5.1/10** | Monitoring Dashboard; not yet a Command Centre |

### KINGA Enterprise Readiness Score

| Dimension | Score | Evidence |
|---|---|---|
| Design System Consistency | 6.5/10 | Brand palette applied; header pattern inconsistent |
| Accessibility Compliance | 5.5/10 | ARIA partial; keyboard navigation incomplete |
| Performance Patterns | 7.0/10 | tRPC with optimistic updates; real-time refresh intervals |
| Data Integrity | 8.0/10 | Procedures are well-structured; data flows are reliable |
| Role Separation | 8.5/10 | 11 distinct portals with appropriate role boundaries |
| Scalability | 7.0/10 | Component architecture supports extension |
| **Overall Enterprise Readiness** | **7.1/10** | Operationally ready; UX layer needs elevation |

---

## Part VI — Transformation Roadmap

### Vision

Transform KINGA from a collection of 11 individual dashboards into a unified enterprise insurance operating system with world-class command-centre user experience, operational visibility, and decision support — comparable to Guidewire ClaimCenter in workflow structure, Datadog in alert-first design, and Salesforce in visual consistency.

### Sprint 1 — Foundation (Days 1–5)

**Goal:** Eliminate the most visible inconsistencies and implement the Quick Wins.

Priority actions:
- Remove Workflow Information Banner from Claims Manager
- Fix remaining foreign colours (Claims Processor, Claimant, Recovery Portal)
- Increase Claims Manager section label size; remove `hidden sm:block`
- Add ARIA attributes to Admin Dashboard button navigation
- Add KingaPortalShell header to Fleet Manager and Assessor
- Reduce Insurer Admin KPI tiles from 19 to 8
- Convert Admin Dashboard lists from card-per-row to tables
- Add 6-tile KPI strip to Fleet Manager

**Expected outcome:** All portals visually consistent; no foreign colours; no accessibility violations in navigation.

### Sprint 2 — Command Centre Layer (Days 6–15)

**Goal:** Add the decision-support infrastructure that elevates the platform from a monitoring dashboard to a command centre.

Priority actions:
- Build universal SLA Clock component and wire to all claim rows
- Build persistent Critical Attention Zone for Claims Manager, Claims Processor, Risk Manager
- Move Executive Alerts Centre above KPI grid in Executive Dashboard
- Add drill-down navigation from KPI tiles to filtered views
- Add ROI summary tile to Executive Dashboard Overview tab
- Integrate KingaPortalShell into all 11 portals
- Build cross-portal alert routing (fraud alerts → Executive + Risk Manager)

**Expected outcome:** Command Centre Maturity Score rises from 5.1 to 7.0.

### Sprint 3 — Intelligence Layer (Days 16–30)

**Goal:** Add the intelligence and analytics infrastructure that makes KINGA a strategic decision-support system.

Priority actions:
- Build system health dashboard in Admin portal
- Rebuild Fleet Manager Dashboard with full KPI strip and vehicle risk scoring
- Build escalation visibility chain (claim detail page)
- Build unified notification centre (platform-wide, sidebar-accessible)
- Add period selector consistency across operational portals
- Build audit trail component for claim detail page
- Implement Decision Inbox pattern (unified view of all items requiring decision today)

**Expected outcome:** UX Maturity Score rises from 5.5 to 7.5; Enterprise Readiness Score rises from 7.1 to 8.5.

### Sprint 4 — Excellence Layer (Days 31–60)

**Goal:** Achieve world-class enterprise software standards.

Priority actions:
- Build cross-claim intelligence panel with visual network
- Implement role-based KPI personalisation
- Add SLA breach escalation automation
- Build Governance Exceptions Register
- Implement consistent empty, loading, and error state standards
- Add portal-to-portal navigation shortcuts
- Conduct full accessibility audit against WCAG 2.1 AA

**Expected outcome:** All maturity scores reach 8.0+; platform achieves enterprise-grade classification.

---

## Summary Scorecard

| Portal | Experience | Architecture | Command Centre | Decision Support | Visual Hierarchy | Cognitive Load | Enterprise Design | Accessibility | **Overall** |
|---|---|---|---|---|---|---|---|---|---|
| Claims Manager | 6.5 | 5.5 | 6.0 | 6.5 | 5.5 | 6.0 | 6.5 | 7.0 | **6.2** |
| Executive | 7.0 | 6.5 | 6.0 | 5.5 | 6.5 | 6.0 | 7.0 | 7.0 | **6.4** |
| Claims Processor | 6.5 | 6.0 | 6.0 | 7.0 | 6.5 | 7.5 | 6.5 | 7.0 | **6.6** |
| Risk Manager | 6.5 | 7.0 | 7.0 | 7.5 | 6.5 | 6.5 | 6.5 | 7.0 | **6.8** |
| Admin | 5.0 | 5.5 | 4.5 | 5.5 | 4.5 | 4.0 | 4.5 | 4.0 | **4.7** |
| Panel Beater | 6.5 | 6.5 | 6.0 | 6.5 | 6.0 | 5.5 | 6.0 | 6.5 | **6.2** |
| Assessor | 5.5 | 6.5 | 6.0 | 6.5 | 5.5 | 7.0 | 5.5 | 6.5 | **6.1** |
| Claimant | 6.0 | 6.0 | 7.0 | 5.5 | 6.0 | 7.0 | 6.0 | 7.0 | **6.3** |
| Fleet Manager | 5.0 | 5.5 | 4.5 | 4.5 | 4.5 | 6.5 | 5.0 | 6.5 | **5.3** |
| Recovery | 6.5 | 7.0 | 7.0 | 7.5 | 7.5 | 6.5 | 6.5 | 6.0 | **6.8** |
| Insurer Admin | 5.5 | 5.0 | 5.0 | 5.5 | 4.5 | 4.0 | 5.5 | 5.0 | **5.0** |
| **Platform Average** | **6.0** | **6.1** | **5.9** | **6.2** | **5.8** | **6.0** | **5.9** | **6.4** | **6.0** |

---

*KINGA UX, Dashboard Architecture & Command Centre Audit v1.0 — June 2026*  
*This document supersedes all previous dashboard assessment notes and serves as the authoritative reference for all UX and dashboard architecture decisions on the KINGA platform.*
