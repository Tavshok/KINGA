# KINGA Phase 11 Parity Audit
## Source: KINGAexportal.pdf (7 pages) + KINGAclaimsmanagerportal.pdf (6 pages)

---

## EXECUTIVE DASHBOARD — Live State (from PDF)

### Shell / Header
- White identity strip visible: KINGA logo + "Executive Command Center" label + LIVE badge ✓
- Left sidebar: dark navy, shows "Executive" role chip + Tavonga Shoko user — this is the OLD sidebar layout, NOT the Phase 11 KingaPortalShell (no gold separator, no dark green hero band visible in PDF)
- KPI strip visible but truncated/clipped: TOTAL CLAIMS 39 | KINGA SAVINGS — | RESOLUTION RATE 0.0% | AVG CYCLE TIME 0.0d | FRAUD EXPOSURE US$1,8xx | SLA COMPLI… (cut off)
- Tab bar: "Operational Pulse" with sub-tabs "Alerts · Ageing · Fraud" — this is NOT the approved prototype tab structure

### Approved Prototype Tab Structure (executive-dashboard.html)
- Tabs: Overview · Operational Health · ROI & Financials · Notifications · Executive Report
- Active tab = Overview

### Live Tab Structure (from PDF)
- "Operational Pulse" tab with sub-tabs: Alerts · Ageing · Fraud
- "Performance Trends" section with sub-tabs: Savings · Risk distribution
- "Search & Deep Analytics" section with sub-tabs: Global search · Fast-track analytics
- These are SECTIONS rendered as tab-like headers, not the approved 5-tab structure

### Overview Tab Content — Approved Prototype Order
1. Claims Ageing bar chart + Fraud Detection Funnel (2-col grid)
2. Escalation Queue (full width)
3. Period Comparison 4-col cards (full width)
4. Cost Savings Trend chart + AI Confidence doughnut (2-col grid)
5. Global Claim Search + Fast-Track Analytics (2-col grid)

### Overview Tab Content — Live State Order (from PDF, pages 1-5)
1. Executive Alerts (full width) — "No active alerts" / "All clear"
2. Claims Ageing (full width, stacked list with colour dots — NOT a bar chart)
3. Fraud Investigation Funnel (full width, below ageing — NOT side-by-side)
4. Escalation Queue (full width) ✓
5. Period Comparison (full width) ✓ but rendered as a card grid inside a panel
6. Cost Savings Trend (full width, "No savings data available yet")
7. KINGA Confidence Distribution (full width, shows 3 coloured boxes + gauge — NOT a doughnut chart)
8. Search & Deep Analytics — Global Search (full width)
9. Fast-Track Analytics — Analytics Dashboard with KINGA QUOTE OPTIMISATION 4-card grid
10. Most Overridden Repairers (bar chart)
11. CLAIMS & FRAUD ANALYTICS section:
    - Claims Volume Trend (line chart)
    - Fraud Detection Trends (stacked bar chart)
    - Cost Breakdown by Status (bar chart)
    - Average Processing Time (bar chart)
    - Fraud Risk Distribution (doughnut chart)

### Key Divergences — Executive Dashboard
1. **Layout**: All sections are stacked full-width; approved prototype uses 2-col grids for key sections
2. **Claims Ageing**: Live = coloured dot list; Prototype = horizontal bar chart
3. **Fraud Detection Funnel**: Live = full-width below ageing; Prototype = side-by-side with ageing in 2-col
4. **Cost Savings + AI Confidence**: Live = stacked full-width; Prototype = 2-col side-by-side
5. **Global Search + Fast-Track**: Live = stacked; Prototype = 2-col side-by-side
6. **Tab structure**: Live has "Operational Pulse / Performance Trends / Search & Deep Analytics" as section headers; Prototype has 5 proper tabs: Overview · Operational Health · ROI & Financials · Notifications · Executive Report
7. **Extra sections in live**: Claims Volume Trend, Fraud Detection Trends, Cost Breakdown by Status, Average Processing Time, Fraud Risk Distribution — these appear to be from other tabs bleeding into Overview
8. **KINGA Confidence**: Live shows 3 coloured number boxes + gauge arc; Prototype shows doughnut chart
9. **Gold discipline**: Multiple gold/amber accents visible; should be exactly 2 (CTA button + headline metric)
10. **Board Report button**: Not visible in PDF — should be gold CTA in identity strip

---

## CLAIMS MANAGER PORTAL — Live State (from PDF)

### Shell / Header
- White identity strip: KINGA logo + "Claims Manager" label + LIVE badge ✓
- Left sidebar: dark navy (old sidebar layout)
- KPI strip: TOTAL CLAIMS 39 | ACTIVE 39 | COMPLETED 0 | FRAUD ALERTS 0 | FAST-TRACK 0 | AVG DAYS 0.0d ✓
- Analytics Period date pickers visible (not in prototype)
- "Claims Manager Workflow" info box (green tinted) visible

### Approved Prototype Tab Structure (claims-manager.html)
- Tabs: Workflow · Oversight · Admin
- Active tab = Workflow

### Live Tab Structure (from PDF)
- Tab bar at bottom: WORKFLOW | OVERSIGHT | ADMIN ✓ (matches prototype)

### Workflow Tab Content — Approved Prototype Order
1. Intake Queue (full width table)
2. 2-col: Queue Health Matrix + Attention Required
3. Escalation Centre (full width)
4. Approval Workbench (full width)
5. Capacity Forecast 7-day (full width)
6. 2-col: Assessor Performance + Processor Workload

### Workflow Tab Content — Live State (from PDF, pages 1-6)
1. "Claims Manager Workflow" info box (NOT in prototype)
2. Analytics Period date pickers (NOT in prototype)
3. KPI strip (correct)
4. Claim Status Distribution — doughnut chart (full width, NOT in prototype Workflow tab)
5. Claims by Incident Type — bar chart (NOT in prototype Workflow tab)
6. KINGA Savings Identified (NOT in prototype Workflow tab)
7. Queue Health Matrix (full width) ✓
8. Attention Required (full width) ✓
9. Escalation Centre ✓
10. Approval Workbench ✓
11. Capacity Forecast (7-day) ✓
12. Assessor Performance ✓
13. Processor Workload ✓
14. Rework Intelligence ✓
15. Reports Centre ✓ (with CLAIM-LEVEL / PORTFOLIO / TREND / RECOVERY categories)
16. Workflow tab content (intake queue) shown at bottom

### Key Divergences — Claims Manager
1. **Extra analytics sections**: Claim Status Distribution doughnut, Claims by Incident Type bar chart, KINGA Savings Identified — these appear at top of Workflow tab but belong in Oversight tab
2. **Analytics Period pickers**: Not in prototype, shown prominently
3. **Claims Manager Workflow info box**: Not in prototype
4. **Section order**: Analytics sections appear before the workflow queue sections
5. **Intake Queue**: In prototype it's the FIRST item in Workflow tab; in live it appears at the very bottom
6. **2-col layouts**: Prototype has Queue Health Matrix + Attention Required side-by-side; live shows them stacked

---

## GENERAL ISSUES ACROSS ALL PORTALS (inferred)
- The body content appears to be rendering ALL tab content simultaneously rather than switching between tabs
- Section ordering within tabs doesn't match the prototype
- 2-col grid layouts from the prototype are being rendered as single-column stacked layouts
- Analytics/chart sections from one tab are bleeding into other tabs
