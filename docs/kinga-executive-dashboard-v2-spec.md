# KINGA Executive Intelligence Centre — Dashboard v2 Formal Specification
**Version:** 2.0  
**Date:** June 2026  
**Classification:** CONFIDENTIAL — Internal Use Only  
**Status:** Approved for Implementation  
**Supersedes:** Executive Dashboard v1 (current production)

---

## Table of Contents

1. [Design Philosophy and Visual Redesign Direction](#1-design-philosophy-and-visual-redesign-direction)
2. [Global Layout Architecture](#2-global-layout-architecture)
3. [Dashboard Header Redesign](#3-dashboard-header-redesign)
4. [Tab 1: Executive Summary](#4-tab-1-executive-summary)
5. [Tab 2: Claims Operations Intelligence](#5-tab-2-claims-operations-intelligence)
6. [Tab 3: Fraud Intelligence](#6-tab-3-fraud-intelligence)
7. [Tab 4: Financial and Recovery Intelligence](#7-tab-4-financial-and-recovery-intelligence)
8. [Tab 5: Governance and Compliance](#8-tab-5-governance-and-compliance)
9. [Tab 6: Executive Reports](#9-tab-6-executive-reports)
10. [Global State and Period Selector](#10-global-state-and-period-selector)
11. [Executive Report Document Specification](#11-executive-report-document-specification)
12. [Backend Procedures Required](#12-backend-procedures-required)
13. [Implementation Sequence](#13-implementation-sequence)
14. [Design Token Reference](#14-design-token-reference)

---

## 1. Design Philosophy and Visual Redesign Direction

### 1.1 The Problem with the Current Design

The current Executive Dashboard is built as a **collection of widgets** — a grid of cards that each display a metric in isolation. This is the standard approach for operational dashboards, but it is the wrong approach for an executive intelligence centre. The fundamental problem is that it requires the executive to do the analytical work: scan 9 charts, read 4 KPI tiles, navigate 4 tabs, and synthesise a picture of the portfolio. An executive intelligence centre should invert this — it should tell the executive what matters, surface the most important signals first, and then provide the data to support those signals.

The visual design reinforces this problem. The current dashboard uses a flat white background with uniform card styling, giving every piece of information equal visual weight. There is no hierarchy. The fraud rate trend chart has the same visual prominence as the average cycle days KPI. A board-level executive looking at this dashboard cannot immediately identify whether the portfolio is healthy or under stress.

### 1.2 The v2 Design Principle

**"KINGA tells you what matters. The data proves it."**

The v2 design is structured around three layers of information density:

**Layer 1 — Signal (immediately visible, no scrolling):** The Executive Alerts Centre and the four Portfolio Health KPIs. This is what the executive reads in the first 10 seconds. It answers: "Is anything wrong right now?"

**Layer 2 — Context (one scroll, same tab):** The Month Comparison strip, the Claims Ageing panel, and the five core analytics charts. This answers: "How did we get here and where are we trending?"

**Layer 3 — Detail (tab navigation):** The five specialist tabs (Claims Operations, Fraud, Financial, Governance, Reports). This answers: "What specifically is driving the signals I saw in Layer 1?"

### 1.3 Visual Redesign Direction

**Colour and tone:** The current design is pure white with slate cards. The v2 design introduces a **dark header band** — a deep slate-900 (`#0F172A`) header that spans the full width of the dashboard, containing the title, period selector, and action buttons. This creates an immediate visual anchor and separates the command layer (the header) from the information layer (the tabs). The tab content area remains white/slate-50, preserving readability for dense data tables and charts.

**Typography:** The current design uses Helvetica/Arial (system font). The v2 design introduces **Inter** (Google Fonts) as the primary typeface. Inter is purpose-built for screen readability at small sizes and is the standard choice for financial intelligence interfaces. Headlines use Inter 700 (bold), body text uses Inter 400 (regular), and data values use Inter 600 (semibold) with tabular number spacing (`font-variant-numeric: tabular-nums`) to ensure columns of numbers align correctly.

**KPI card redesign:** The current KPI cards use a coloured background with a blur effect. The v2 cards use a **clean white background with a coloured left border accent** (4px, full height) and a subtle shadow. This is more legible, more professional, and consistent with the design language used in Bloomberg Terminal, Refinitiv Eikon, and enterprise BI tools. The coloured border communicates the metric's category (teal for volume, green for savings, amber for risk, blue for operations) without overwhelming the number.

**Alert design:** The Executive Alerts Centre uses a **horizontal scrolling alert rail** — a single row of alert chips, each with a coloured dot (red/amber/green), a short description, and a delta value. This is inspired by the Bloomberg alert bar and the Palantir Gotham alert strip. It occupies a single row of vertical space and can be dismissed or expanded.

**Chart redesign:** All charts use the KINGA colour palette (teal primary, emerald success, amber warning, red critical) with a consistent axis style: light grey gridlines, no border box, left-aligned axis labels, and a 12px Inter label font. Chart titles are left-aligned, 14px Inter 600. Chart subtitles (data source, period) are 11px Inter 400, muted foreground.

**Tab design:** The current tabs use the shadcn/ui default tab style (underline indicator). The v2 tabs use a **pill tab style** — each tab is a rounded pill with a subtle background on hover and a filled teal background on active. This is more visually distinctive and easier to scan at a glance.

### 1.4 Colour Palette (v2)

| Token | Hex | Usage |
|---|---|---|
| `--exec-header-bg` | `#0F172A` | Dashboard header background |
| `--exec-header-text` | `#F8FAFC` | Header text and labels |
| `--exec-header-muted` | `#94A3B8` | Header secondary text |
| `--exec-accent-teal` | `#0D9488` | Primary accent, active tabs, teal KPI borders |
| `--exec-accent-emerald` | `#059669` | Savings, positive deltas, green alerts |
| `--exec-accent-amber` | `#D97706` | Warning alerts, amber KPI borders |
| `--exec-accent-red` | `#DC2626` | Critical alerts, fraud indicators |
| `--exec-accent-blue` | `#2563EB` | Operations, cycle time, SLA |
| `--exec-accent-violet` | `#7C3AED` | Governance, compliance |
| `--exec-card-bg` | `#FFFFFF` | Card backgrounds |
| `--exec-card-border` | `#E2E8F0` | Card borders |
| `--exec-page-bg` | `#F8FAFC` | Page background (tab content area) |
| `--exec-text-primary` | `#0F172A` | Primary text |
| `--exec-text-secondary` | `#475569` | Secondary text, labels |
| `--exec-text-muted` | `#94A3B8` | Muted text, timestamps |

---

## 2. Global Layout Architecture

### 2.1 Page Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  SIDEBAR (existing InsurerPortalLayout — unchanged)                 │
│  Dark slate #0F172A, 240px wide, persistent                         │
├─────────────────────────────────────────────────────────────────────┤
│  MAIN CONTENT AREA (flex-1, overflow-y-auto)                        │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  DASHBOARD HEADER BAND (dark slate, full width, sticky top)  │  │
│  │  Height: 80px                                                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  TAB NAVIGATION RAIL (white bg, sticky below header)         │  │
│  │  Height: 52px                                                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  TAB CONTENT AREA (slate-50 bg, max-w-[1600px], px-8)        │  │
│  │  Scrollable, variable height                                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Content Width and Spacing

- Maximum content width: `1600px`, centred with `mx-auto`
- Horizontal padding: `px-8` (32px each side)
- Vertical section spacing: `gap-6` (24px) between rows
- Card internal padding: `p-6` (24px) for standard cards, `p-4` (16px) for compact cards
- Grid system: 12-column CSS grid, with responsive breakpoints at 768px (2 col), 1024px (3 col), 1280px (4 col)

---

## 3. Dashboard Header Redesign

### 3.1 Visual Specification

```
┌─────────────────────────────────────────────────────────────────────────┐
│  bg: #0F172A  height: 80px  sticky top-0 z-50                          │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  [KINGA logo 32px]  KINGA Executive Intelligence Centre         │   │
│  │                     Insurer: {tenantName}  ·  {roleLabel}       │   │
│  │                                                                 │   │
│  │  [Period Selector ▼]  [Generate Report]  [Export Dashboard]    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Left section:**
- KINGA logo (32×32px, white version)
- Title: "KINGA Executive Intelligence Centre" — Inter 700, 20px, `#F8FAFC`
- Subtitle: "{tenantName} · {roleLabel}" — Inter 400, 13px, `#94A3B8`

**Right section (flex row, gap-3):**
- **Period Selector** — dropdown button, dark outline style (`border: 1px solid #334155`, `bg: #1E293B`, text `#F8FAFC`). Options: Last 7 Days, Last 30 Days (default), Last 90 Days, Last 6 Months, Last 12 Months, Custom Range. This is a **global state variable** (`periodRange`) that all queries on all tabs consume.
- **Generate Report** button — teal filled (`bg: #0D9488`, text white). Clicking opens the Executive Reports tab (Tab 6) with the report generation modal pre-opened.
- **Export Dashboard** button — dark outline style. Exports the current tab view as a PDF snapshot.

### 3.2 Demo Mode Banner

When `isDemo === true` (no real claims data), a banner appears immediately below the header band:

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⚠  Demo Mode — Illustrative data shown. Connect live claims to    │
│     see real figures.                                               │
└─────────────────────────────────────────────────────────────────────┘
```

Style: `bg: #FEF3C7`, `border: 1px solid #D97706`, `text: #92400E`, 12px Inter 500, full width, 40px height.

### 3.3 Tab Navigation Rail

```
┌─────────────────────────────────────────────────────────────────────┐
│  bg: white  border-bottom: 1px solid #E2E8F0  height: 52px         │
│                                                                     │
│  [Executive Summary] [Claims Operations] [Fraud Intelligence]      │
│  [Financial & Recovery] [Governance] [Executive Reports]           │
└─────────────────────────────────────────────────────────────────────┘
```

Tab style: pill tabs, `rounded-full`, `px-4 py-1.5`, `text-sm font-medium`.
- Inactive: `bg: transparent`, `text: #475569`, hover `bg: #F1F5F9`
- Active: `bg: #0D9488`, `text: white`

---

## 4. Tab 1: Executive Summary

**Purpose:** The CEO's landing page. Answers "what is the state of the portfolio right now and what requires my attention?"

### 4.1 Layout

```
ROW 1 — Portfolio Health KPIs (4 cards, equal width)
ROW 2 — Executive Alerts Centre (full width, horizontal scroll)
ROW 3 — Month Comparison Strip (full width)
ROW 4 — Claims Ageing Panel (left, 4 cols) + Fraud Snapshot (right, 8 cols)
ROW 5 — Analytics Charts (5 charts, responsive grid)
```

### 4.2 Row 1: Portfolio Health KPIs

Four cards in a `grid grid-cols-4 gap-5` layout. Each card uses the **v2 KPI card design**: white background, 4px coloured left border, subtle shadow (`shadow-sm`), no background colour.

| Card | Label | Value Source | Border Colour | Delta Source |
|---|---|---|---|---|
| 1 | Total Claims | `execSummary.totalClaims` | `--exec-accent-teal` (#0D9488) | vs prior period |
| 2 | KINGA Savings | `execSummary.totalSavings` | `--exec-accent-emerald` (#059669) | vs prior period |
| 3 | Resolution Rate | `execSummary.resolutionRate` | `--exec-accent-blue` (#2563EB) | vs prior period |
| 4 | Avg Cycle Days | `execSummary.avgCycleDays` | `--exec-accent-amber` (#D97706) | vs prior period |

**Card anatomy:**
```
┌─[4px teal border]──────────────────────────────────┐
│  [Icon 20px]                    ▲ 12%  vs last mo  │
│                                                     │
│  TOTAL CLAIMS                                       │
│  1,254                                              │
│  Submitted in period                                │
└─────────────────────────────────────────────────────┘
```

- Label: Inter 500, 11px, uppercase, letter-spacing 0.05em, `--exec-text-secondary`
- Value: Inter 700, 32px, `--exec-text-primary`, `font-variant-numeric: tabular-nums`
- Subtitle: Inter 400, 12px, `--exec-text-muted`
- Delta badge: Inter 600, 11px, `rounded-full px-2 py-0.5`. Positive delta: `bg: #D1FAE5 text: #065F46`. Negative delta (bad): `bg: #FEE2E2 text: #991B1B`. Negative delta (good, e.g. cycle days down): `bg: #D1FAE5 text: #065F46`.

**Delta direction logic:** For cycle days and fraud rate, a decrease is positive (green). For all other metrics, an increase is positive (green). This must be explicitly coded per card.

### 4.3 Row 2: Executive Alerts Centre

**This is the most important new component in v2.** A full-width panel with a dark slate-800 background (`#1E293B`), containing a horizontal scrollable list of alert chips.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  bg: #1E293B  border-radius: 12px  padding: 16px 20px                      │
│                                                                             │
│  ⚡ EXECUTIVE ALERTS                          [Dismiss All]  [View All]    │
│                                                                             │
│  🔴 Claims >30d +18%   🔴 Repairer XYZ override >threshold                │
│  🟠 Fraud exposure +$45k   🟠 Recovery rate ▼ 62%→54%                     │
│  🟢 Cycle times improved 2.1d                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Alert chip anatomy:**
```
[●] {description}  [{delta}]
```
- Dot: 8px circle, red/amber/green
- Description: Inter 500, 13px, `#E2E8F0`
- Delta: Inter 600, 12px, coloured (red/amber/green)
- Chip background: `rgba(255,255,255,0.06)`, `rounded-lg`, `px-3 py-2`
- Chips wrap to two rows; maximum 6 alerts shown; "View All" expands to full list

**Alert generation logic (backend procedure: `analytics.getExecutiveAlerts`):**

The procedure evaluates the following conditions against configurable thresholds and generates alert objects with `{ level: 'critical'|'warning'|'ok', message: string, delta: string, link: string }`:

| Alert Condition | Level | Threshold | Data Source |
|---|---|---|---|
| Claims aged >30 days count increased | critical if >15%, warning if >5% | Configurable | `claims` table, `created_at` |
| Repairer override rate exceeds threshold | critical if >20%, warning if >15% | Configurable per tenant | `workflow_audit_trail` |
| Fraud exposure increased vs prior period | critical if >20%, warning if >10% | — | `ai_assessments`, `claims` |
| Recovery rate dropped vs prior period | warning if >5pp drop | — | `recovery_cases` |
| Cycle time improved vs prior period | ok (positive) | — | `workflow_audit_trail` |
| Fraud rate decreased vs prior period | ok (positive) | — | `ai_assessments`, `claims` |
| Segregation violations above threshold | critical if >5, warning if >2 | Configurable | `claim_involvement_tracking` |
| SLA compliance dropped below threshold | warning if <85% | Configurable | `workflow_audit_trail` |

The procedure returns a sorted array: critical alerts first, then warnings, then positive signals. Maximum 8 alerts returned.

### 4.4 Row 3: Month Comparison Strip

A full-width card showing the current month vs the prior month for 6 KPIs. This **replaces the hardcoded `DEMO_MONTH_COMPARISON` fixture entirely**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  JUNE 2026 vs MAY 2026                                                      │
│                                                                             │
│  Claims         1,254  ▲ 12%  │  Resolution Rate  92.4%  ▲ 4%             │
│  Fraud Rate      7.2%  ▼ 8%   │  KINGA Savings   $324k   ▲ 22%            │
│  Cycle Time    6.2 days ▼ 15% │  Avg Claim Cost   $8,400  ▲ 3%            │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Backend procedure required: `analytics.getMonthComparison`**

```sql
-- Current month
SELECT 
  COUNT(*) as claims,
  AVG(DATEDIFF(updated_at, created_at)) as avg_cycle_days,
  SUM(CASE WHEN status IN ('completed','approved') THEN 1 ELSE 0 END) / COUNT(*) * 100 as resolution_rate,
  SUM(CASE WHEN a.fraud_risk_level = 'high' THEN 1 ELSE 0 END) / COUNT(*) * 100 as fraud_rate,
  SUM(a.estimated_cost - c.approved_amount) as savings,
  AVG(c.approved_amount) as avg_claim_cost
FROM claims c LEFT JOIN ai_assessments a ON a.claim_id = c.id
WHERE c.tenant_id = ? 
AND c.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
AND c.created_at < DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-01')
-- Repeat for prior month with DATE_SUB
```

Month labels are dynamically generated from the current date: `new Date().toLocaleString('default', { month: 'long', year: 'numeric' })`.

### 4.5 Row 4: Claims Ageing + Fraud Snapshot

**Left: Claims Ageing Panel (4 of 12 columns)**

```
┌─────────────────────────────────┐
│  CLAIMS INVENTORY               │
│  Current portfolio age          │
│                                 │
│  0–7 days    [████████] 341     │
│  8–14 days   [█████   ] 123     │
│  15–30 days  [██      ]  67     │
│  30+ days    [█       ]  18     │
│                                 │
│  ⚠ 18 claims require attention  │
└─────────────────────────────────┘
```

Horizontal bar chart using Chart.js. Bars coloured: 0–7 days `#0D9488`, 8–14 days `#2563EB`, 15–30 days `#D97706`, 30+ days `#DC2626`. The 30+ days bar is always red regardless of count.

**Backend procedure required: `analytics.getClaimsAgeing`**

```sql
SELECT
  SUM(CASE WHEN DATEDIFF(NOW(), created_at) BETWEEN 0 AND 7 THEN 1 ELSE 0 END) as d0_7,
  SUM(CASE WHEN DATEDIFF(NOW(), created_at) BETWEEN 8 AND 14 THEN 1 ELSE 0 END) as d8_14,
  SUM(CASE WHEN DATEDIFF(NOW(), created_at) BETWEEN 15 AND 30 THEN 1 ELSE 0 END) as d15_30,
  SUM(CASE WHEN DATEDIFF(NOW(), created_at) > 30 THEN 1 ELSE 0 END) as d30_plus
FROM claims
WHERE tenant_id = ? AND status NOT IN ('completed','rejected','closed','archived')
```

**Right: Fraud Snapshot (8 of 12 columns)**

A 2×2 grid of compact fraud KPI tiles, plus the existing Fraud Detection Trends chart below.

```
┌─────────────────────────────────────────────────────────────────┐
│  FRAUD INTELLIGENCE SNAPSHOT                                    │
│                                                                 │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐ │
│  │ Fraud Rate   │ High-Risk    │ Fraud Exp.   │ Prevented    │ │
│  │ 7.2%         │ 58 claims    │ $121,000     │ $47,000      │ │
│  └──────────────┴──────────────┴──────────────┴──────────────┘ │
│                                                                 │
│  [Fraud Detection Trends chart — existing]                      │
└─────────────────────────────────────────────────────────────────┘
```

### 4.6 Row 5: Analytics Charts

Five charts in a responsive grid (`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5`), with the fifth chart spanning 2 columns on xl screens:

1. **Claims Volume Trend** — existing `executive.getClaimsVolumeOverTime`
2. **Cost Breakdown by Status** — existing `executive.getCostBreakdownByStatus`
3. **Processing Time by Stage** — existing `executive.getAverageProcessingTime`
4. **Fraud Risk Distribution** — existing `executive.getFraudRiskDistribution`
5. **AI Savings Trend** — existing `executive.getTotalAISavings` (spans 2 cols on xl)

All charts use the v2 chart style: no border box, light grey gridlines (`#F1F5F9`), Inter 12px axis labels, left-aligned title.

---

## 5. Tab 2: Claims Operations Intelligence

**Purpose:** "Where are claims getting stuck and who is responsible?" Answers operational questions for the Head of Claims.

### 5.1 Layout

```
ROW 1 — SLA Compliance Overview (full width)
ROW 2 — Workflow Bottleneck Chart (left, 8 cols) + Escalations Dashboard (right, 4 cols)
ROW 3 — Assessor Intelligence (left, 6 cols) + Repairer Intelligence Summary (right, 6 cols)
```

### 5.2 Row 1: SLA Compliance Overview

A horizontal bar chart showing SLA compliance % per workflow stage, with a 90% reference line. Bars coloured green if ≥90%, amber if 75–89%, red if <75%.

```
Assessment Stage    [████████████████████] 96%  ✓
Repair Stage        [████████████████    ] 81%  ⚠
Approval Stage      [███████████████████ ] 92%  ✓
Settlement Stage    [█████████████████   ] 88%  ⚠
```

Data source: `workflowAnalytics.getSLACompliance` (existing procedure).

### 5.3 Row 2: Workflow Bottleneck + Escalations

**Left: Workflow Bottleneck Chart** — existing chart, unchanged. Average hours per stage as a horizontal bar chart.

**Right: Escalations Dashboard** — new compact panel.

```
┌─────────────────────────────────┐
│  ESCALATIONS                    │
│  Claims requiring action        │
│                                 │
│  Awaiting Assessor     23  →    │
│  Awaiting Repairer     11  →    │
│  Awaiting Approval     17  →    │
│  Over SLA              14  🔴   │
│                                 │
│  Total: 65 claims               │
└─────────────────────────────────┘
```

Each row is a clickable link that navigates to the Claims Manager Portal filtered by that status. The "Over SLA" row is always highlighted in red if count > 0.

**Backend procedure required: `analytics.getEscalationCounts`**

```sql
SELECT
  SUM(CASE WHEN status = 'assessor_assigned' AND DATEDIFF(NOW(), created_at) > 2 THEN 1 ELSE 0 END) as awaiting_assessor,
  SUM(CASE WHEN status = 'repair_in_progress' AND DATEDIFF(NOW(), created_at) > 7 THEN 1 ELSE 0 END) as awaiting_repairer,
  SUM(CASE WHEN status IN ('technical_approval','financial_decision') AND DATEDIFF(NOW(), created_at) > 3 THEN 1 ELSE 0 END) as awaiting_approval,
  SUM(CASE WHEN DATEDIFF(NOW(), created_at) > 30 AND status NOT IN ('completed','rejected','closed') THEN 1 ELSE 0 END) as over_sla
FROM claims WHERE tenant_id = ? AND status NOT IN ('completed','rejected','closed','archived')
```

### 5.4 Row 3: Assessor and Repairer Intelligence

**Left: Assessor Intelligence**

A ranked table of assessors with: Name, Assessments Completed, Accuracy Score (%), Avg Turnaround (hours), Status (top/average/bottom performer badge).

Top performer highlighted with a green left border. Bottom performer highlighted with a red left border.

Data source: `analytics.getAssessorPerformance` (existing procedure).

**Right: Repairer Intelligence Summary**

Two highlight cards:

```
┌──────────────────────────────────────┐
│  HIGHEST OVERRIDE RATE               │
│  ABC Repairs                         │
│  Override Rate: 23%  🔴 Above avg    │
│  [View Repairer Profile →]           │
├──────────────────────────────────────┤
│  HIGHEST COST VARIANCE               │
│  XYZ Auto                            │
│  Cost Variance: +18% above estimate  │
│  [View Repairer Profile →]           │
└──────────────────────────────────────┘
```

Below the two highlight cards: a compact table of the top 10 repairers by override rate. Data source: `executive.getMostOverriddenRepairers` (existing procedure) + `analytics.getPanelBeaterAnalytics` (existing procedure).

---

## 6. Tab 3: Fraud Intelligence

**Purpose:** "What is the fraud exposure and are our controls working?" This is where KINGA's core differentiation is visible.

### 6.1 Layout

```
ROW 1 — Fraud Overview KPIs (4 tiles)
ROW 2 — Investigation Funnel (left, 5 cols) + Cross-Claim Intelligence (right, 7 cols)
ROW 3 — Fraud Rate Trend (left, 8 cols) + Top Suspicious Entities (right, 4 cols)
```

### 6.2 Row 1: Fraud Overview KPIs

Four compact KPI tiles in the v2 card style:

| Tile | Value | Border | Source |
|---|---|---|---|
| Fraud Rate | 7.2% | Red | `analytics.getKPIs.fraudRate` |
| High-Risk Claims | 58 | Red | `analytics.getKPIs.fraudCount` |
| Fraud Exposure | $121,000 | Amber | `analytics.getKPIs.fraudExposure` |
| Fraud Prevented | $47,000 | Green | `analytics.getFinancialOverview.fraudPrevented` |

### 6.3 Row 2: Investigation Funnel + Cross-Claim Intelligence

**Left: Investigation Funnel** — new component.

A vertical funnel chart showing the fraud investigation pipeline:

```
┌─────────────────────────────────┐
│  FRAUD INVESTIGATION FUNNEL     │
│                                 │
│  ████████████████  Flagged  154 │
│  ████████████      Investigated  72 │
│  ████            Confirmed    21 │
│  ███             Rejected     18 │
│  ──────────────────────────     │
│  Prevented Loss:  $47,000       │
└─────────────────────────────────┘
```

The funnel is built as a series of horizontal bars with decreasing width (CSS, not Chart.js). Each bar is labelled with stage name and count. The conversion rate between stages is shown as a small percentage: "47% investigated" (72/154).

**Backend procedure required: `analytics.getFraudInvestigationFunnel`**

```sql
SELECT
  COUNT(*) as flagged,
  SUM(CASE WHEN a.investigation_status = 'under_investigation' THEN 1 ELSE 0 END) as investigated,
  SUM(CASE WHEN a.investigation_status = 'confirmed_fraud' THEN 1 ELSE 0 END) as confirmed,
  SUM(CASE WHEN a.investigation_status = 'cleared' THEN 1 ELSE 0 END) as rejected,
  SUM(CASE WHEN c.status = 'rejected' AND a.fraud_risk_level = 'high' THEN a.estimated_cost ELSE 0 END) as prevented_loss
FROM claims c JOIN ai_assessments a ON a.claim_id = c.id
WHERE c.tenant_id = ? AND a.fraud_risk_level IN ('high','critical','elevated')
AND c.created_at BETWEEN ? AND ?
```

**Right: Cross-Claim Intelligence** — surfaces existing `crossClaim.*` data in the executive view for the first time.

```
┌─────────────────────────────────────────────────────┐
│  CROSS-CLAIM INTELLIGENCE                           │
│  Portfolio-level fraud signal analysis              │
│                                                     │
│  Total Active Signals: 63                           │
│                                                     │
│  Shared Repairers      24  [████████████]           │
│  Shared Drivers        19  [█████████  ]            │
│  Shared Phones         13  [██████     ]            │
│  Shared Bank Accounts   7  [███        ]            │
│                                                     │
│  TOP 3 SUSPICIOUS ENTITIES                          │
│  ┌────────────────────────────────────────────────┐ │
│  │ ABC Repairs  · Repairer · 8 signals · $34,000  │ │
│  │ John Doe     · Driver   · 5 signals · $21,000  │ │
│  │ 082-555-0123 · Phone    · 4 signals · $18,000  │ │
│  └────────────────────────────────────────────────┘ │
│                                [View Full Analysis →] │
└─────────────────────────────────────────────────────┘
```

Data source: `crossClaim.getStats` (existing) + `crossClaim.getTopEntities` (new procedure needed).

**Backend procedure required: `crossClaim.getTopEntities`**

```sql
SELECT entity_type, entity_value, COUNT(*) as signal_count, 
  SUM(c.total_claim_amount) as total_claim_value
FROM cross_claim_signals ccs
JOIN claims c ON c.id = ccs.claim_id
WHERE ccs.tenant_id = ?
GROUP BY entity_type, entity_value
ORDER BY signal_count DESC
LIMIT 5
```

### 6.4 Row 3: Fraud Rate Trend + Top Suspicious Entities

**Left: Fraud Rate Trend** — existing `executive.getFraudDetectionTrends` chart, moved here from Overview tab.

**Right: Top Suspicious Entities** — a compact table of the top 5 entities by signal count (repairer, driver, or phone number), with signal count and total claim value. Link to Cross-Claim Intelligence page.

---

## 7. Tab 4: Financial and Recovery Intelligence

**Purpose:** "What is the financial position and what money can we recover?" Answers CFO and financial controller questions.

### 7.1 Layout

```
ROW 1 — Financial Overview (5 tiles: Paid, Reserves, Fraud Prevented, Net Exposure, Leakage)
ROW 2 — Recovery Dashboard (full width, 4 KPI tiles + top 5 cases table)
ROW 3 — Savings Trend (left, 7 cols) + Settlement Trend (right, 5 cols)
```

### 7.2 Row 1: Financial Overview (5 Tiles)

Five tiles in a `grid grid-cols-5 gap-4` layout. The fifth tile (Leakage) is **new**.

| Tile | Label | Value | Border | Source |
|---|---|---|---|---|
| 1 | Total Paid | $2.1M | Teal | `analytics.getFinancialOverview.totalPayouts` |
| 2 | Total Reserves | $890K | Blue | `analytics.getFinancialOverview.totalReserves` |
| 3 | Fraud Prevented | $47K | Green | `analytics.getFinancialOverview.fraudPrevented` |
| 4 | Net Exposure | $843K | Amber | `totalReserves - totalRecovered` (FIXED formula) |
| 5 | Leakage | $21K | Red | NEW: `SUM(approved - estimated WHERE approved > estimated)` |

**Net Exposure formula fix:** The current formula `totalPayouts + totalReserves` is incorrect. The correct formula is `totalReserves - totalRecovered` where `totalRecovered` is `SUM(recovery_cases.recovered_amount)` for the tenant. This must be fixed in `analytics.getFinancialOverview`.

**Leakage definition:** Claims where `approved_amount > ai_assessments.estimated_cost`. This represents money paid above the AI's recommendation — a direct measure of settlement discipline.

### 7.3 Row 2: Recovery Dashboard

A full-width panel combining KPI tiles and a case table.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  RECOVERY INTELLIGENCE                                    [Go to Recovery →] │
│                                                                             │
│  Open Cases: 42  │  Recovery Potential: $93,000  │  Recovered: $18,000     │
│  Recovery Rate: 56%  ▼ 6pp vs prior period  🟠                             │
│                                                                             │
│  TOP 5 CASES BY RECOVERY POTENTIAL                                          │
│  ┌──────────┬──────────────┬──────────┬──────────────┬────────────────────┐ │
│  │ Case ID  │ Third Party  │ Potential│ Status       │ Deadline           │ │
│  │ RC-0042  │ Mutual Ins.  │ $18,400  │ Demand Sent  │ 45 days            │ │
│  │ RC-0038  │ ABC Insurer  │ $14,200  │ Open         │ 62 days            │ │
│  │ RC-0051  │ XYZ Insurer  │ $12,800  │ Investigating│ 28 days 🔴         │ │
│  └──────────┴──────────────┴──────────┴──────────────┴────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

Data source: `recovery.getKPIs` (existing, all fields available) + `recovery.getCases` (existing, sorted by `recovery_potential_score` DESC, limit 5).

Deadline column: days remaining until `recovery_deadline`. Red if <30 days, amber if 30–60 days, green if >60 days.

### 7.4 Row 3: Savings Trend + Settlement Trend

**Left: Savings Trend** — existing chart, unchanged. Monthly `SUM(estimated_cost - approved_amount)` bar chart.

**Right: Settlement Trend** — new chart.

A line chart showing the monthly ratio of `AVG(approved_amount / estimated_cost)` over time. A horizontal reference line at 1.0 (approved = estimated). Above the line = leakage. Below the line = KINGA savings.

```
1.2 ─────────────────────────────── Leakage zone
1.0 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ Reference (1.0)
0.8 ─────────────────────────────── Savings zone
    Jan   Feb   Mar   Apr   May   Jun
```

**Backend procedure required: `analytics.getSettlementTrend`**

```sql
SELECT DATE_FORMAT(c.created_at, '%Y-%m') as month,
  AVG(c.approved_amount / NULLIF(a.estimated_cost, 0)) as settlement_ratio,
  COUNT(*) as claim_count
FROM claims c JOIN ai_assessments a ON a.claim_id = c.id
WHERE c.tenant_id = ? AND c.approved_amount IS NOT NULL
AND c.created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
GROUP BY DATE_FORMAT(c.created_at, '%Y-%m')
ORDER BY month ASC
```

---

## 8. Tab 5: Governance and Compliance

**Purpose:** "Are our governance controls working and are we compliant?" Answers Compliance Officer and Board questions.

### 8.1 Layout

```
ROW 1 — Governance KPIs with RAG status (4 tiles)
ROW 2 — Override Rate Trend (left, 7 cols) + Governance Exceptions Register (right, 5 cols)
```

### 8.2 Row 1: Governance KPIs with RAG Status

Four tiles, each showing the metric value, a RAG (red/amber/green) status indicator, and the threshold that triggered the status.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Override Rate    Segregation Violations    Role Changes    Fast-Track   │
│  12%              4                         1               3            │
│  🔴 Above 10%    🟠 Warning (>2)           🟢 Normal       🟢 Normal    │
└──────────────────────────────────────────────────────────────────────────┘
```

Thresholds are stored in the `tenants` table (new fields: `override_rate_threshold`, `segregation_violation_threshold`, `fast_track_anomaly_threshold`). Default thresholds: override rate 10%, segregation violations 2, fast-track anomalies 5.

Data source: `governance.getGovernanceSummary` (existing procedure, all fields available).

### 8.3 Row 2: Override Rate Trend + Exceptions Register

**Left: Override Rate Trend** — existing chart, unchanged.

**Right: Governance Exceptions Register** — new component.

A tabbed mini-register with three tabs: "Executive Overrides", "Multiple Reassignments", "Governance Violations". Each tab shows a compact table of the relevant claims.

```
┌─────────────────────────────────────────────────────┐
│  EXCEPTIONS REGISTER                                │
│  [Overrides] [Reassignments] [Violations]           │
│                                                     │
│  Claim ID  │ Date     │ User      │ Action          │
│  CLM-0142  │ Jun 18   │ J. Smith  │ Override → Appr │
│  CLM-0138  │ Jun 15   │ M. Jones  │ Override → Appr │
│  CLM-0129  │ Jun 12   │ J. Smith  │ Override → Appr │
│                                                     │
│  [Export Register →]                                │
└─────────────────────────────────────────────────────┘
```

Data source: `governance.getExceptionsRegister` (new procedure needed).

**Backend procedure required: `governance.getExceptionsRegister`**

```sql
-- Executive overrides
SELECT c.claim_number, wat.created_at, u.name as user_name, 
  wat.from_state, wat.to_state, wat.notes
FROM workflow_audit_trail wat
JOIN claims c ON c.id = wat.claim_id
JOIN users u ON u.id = wat.performed_by
WHERE c.tenant_id = ? AND wat.executive_override = 1
AND wat.created_at BETWEEN ? AND ?
ORDER BY wat.created_at DESC LIMIT 20

-- Multiple reassignments (claims with >2 assessor changes)
SELECT c.claim_number, COUNT(*) as reassignment_count, MAX(wat.created_at) as last_change
FROM workflow_audit_trail wat JOIN claims c ON c.id = wat.claim_id
WHERE c.tenant_id = ? AND wat.action LIKE '%reassign%'
GROUP BY c.id, c.claim_number HAVING reassignment_count > 2
ORDER BY reassignment_count DESC LIMIT 20
```

---

## 9. Tab 6: Executive Reports

**Purpose:** The board-report centre. Replaces the generic Reports Centre navigation for the executive role.

### 9.1 Layout

```
ROW 1 — Report Generation Card (full width, prominent CTA)
ROW 2 — Recent Reports Table (full width)
ROW 3 — Other Available Reports (grid of report type cards)
```

### 9.2 Row 1: Report Generation Card

A prominent full-width card with a dark slate background, containing the report generation form.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  bg: #0F172A  border-radius: 12px  padding: 32px                           │
│                                                                             │
│  GENERATE EXECUTIVE INTELLIGENCE REPORT                                     │
│  Board-ready document with AI-generated narrative and strategic actions     │
│                                                                             │
│  Period: [Last 30 Days ▼]    Sections: [All ▼]    Format: [PDF ▼]          │
│                                                                             │
│  [Generate Report — Est. 20 seconds]                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

When the "Generate Report" button is clicked, a progress indicator shows the generation stages:
1. Collecting portfolio data... ✓
2. Analysing fraud intelligence... ✓
3. Calculating financial metrics... ✓
4. Generating AI narrative... ⟳
5. Compiling PDF... —

### 9.3 Row 2: Recent Reports Table

A table of the last 10 generated executive reports with: Report Name, Period, Generated By, Generated At, Status, Download link.

### 9.4 Row 3: Other Available Reports

A grid of report type cards for other report types accessible to the executive role: Claims Management Report, Risk Portfolio Report, Recoveries Report, Governance SAR, Regulatory Compliance Report.

Each card shows: report name, description, last generated date, "Generate" button.

---

## 10. Global State and Period Selector

### 10.1 Period State Architecture

The period selector in the dashboard header is a **global React context variable** that all queries on all tabs consume. This is the most critical architectural requirement for v2.

```typescript
// client/src/contexts/ExecutivePeriodContext.tsx
interface PeriodRange {
  from: Date;
  to: Date;
  label: string; // "Last 30 Days", "Last 90 Days", etc.
}

const ExecutivePeriodContext = createContext<{
  period: PeriodRange;
  setPeriod: (p: PeriodRange) => void;
}>({...});
```

Every tRPC query in the Executive Dashboard must consume `period.from` and `period.to` as input parameters. When the period changes, all queries automatically refetch because their input parameters change.

### 10.2 Preset Options

| Label | From | To |
|---|---|---|
| Last 7 Days | `now - 7d` | `now` |
| Last 30 Days (default) | `now - 30d` | `now` |
| Last 90 Days | `now - 90d` | `now` |
| Last 6 Months | `now - 180d` | `now` |
| Last 12 Months | `now - 365d` | `now` |
| Custom Range | User-selected | User-selected |

### 10.3 Query Pattern

All queries must follow this pattern to prevent infinite re-render loops (per the template's Common Pitfalls guidance):

```typescript
// ✅ Correct: stabilise period reference with useMemo
const periodInput = useMemo(() => ({
  from: period.from.toISOString().slice(0, 10),
  to: period.to.toISOString().slice(0, 10),
}), [period.from, period.to]);

const { data } = trpc.analytics.getKPIs.useQuery(periodInput);
```

---

## 11. Executive Report Document Specification

The Executive Intelligence Report is a **7-section, 11–12 page PDF** generated on demand. It is the primary deliverable of the KINGA Executive Intelligence Centre.

### 11.1 Document Structure

| Section | Pages | Content | AI Summary |
|---|---|---|---|
| Cover Page | 1 | Insurer name, period, classification, generated date | None |
| 1. Executive Summary | 1 | Portfolio status, key risks, key positives | Yes — 3 paragraphs |
| 2. Claims Operations Intelligence | 2 | Volumes, ageing, cycle times, SLA, assessors, repairers | Yes — 2 paragraphs |
| 3. Fraud Intelligence | 2 | Fraud trends, investigation funnel, cross-claim signals, entities | Yes — 2 paragraphs |
| 4. Financial and Recovery Intelligence | 2 | Paid, reserves, leakage, savings, recovery pipeline | Yes — 2 paragraphs |
| 5. Governance and Compliance | 1 | Override trends, violations, exceptions register | Yes — 1 paragraph |
| 6. Executive Action Register | 1 | Prioritised action table (AI-generated) | Yes — full section |
| 7. Strategic Outlook | 1 | Immediate, medium, long-term recommendations (AI-generated) | Yes — full section |

### 11.2 Section 6: Executive Action Register

This is the most important section of the report. It is fully AI-generated using the following prompt structure:

```
System: You are a senior insurance strategy consultant with 20 years of experience 
in motor claims fraud detection and operational efficiency. You write for CFO and 
board audiences. Be specific, use the numbers provided, and be direct.

User: Based on the following portfolio data for {tenantName} for the period 
{fromDate} to {toDate}:

PORTFOLIO METRICS:
{paste all KPIs from sections 1-5}

Generate a prioritised Executive Action Register with 4-6 items. For each item provide:
- Priority: Critical / High / Medium
- Issue: Specific problem identified (cite the metric)
- Financial or Operational Impact: Quantified where possible
- Recommended Action: Specific, actionable, with a named owner
- Timeline: Immediate (0-30 days) / Short-term (30-90 days)

Format as a structured table. Do not use vague language. Every recommendation 
must be traceable to a specific metric in the data provided.
```

### 11.3 Report Generation Procedure

The report is generated by a new tRPC procedure `reportingEngine.generateExecutiveFullReport` which:

1. Calls all 8 data procedures in parallel (Promise.all)
2. Constructs the HTML template with the data
3. Calls `invokeLLM` 5 times (once per AI-summarised section) in parallel
4. Assembles the final HTML
5. Calls `renderAndUpload` to produce the PDF
6. Stores the report metadata in the `report_queue` table
7. Returns the PDF URL

Estimated generation time: 15–25 seconds. A progress indicator must be shown during generation.

---

## 12. Backend Procedures Required

The following new backend procedures must be implemented to support the v2 dashboard. All are additions to existing routers — no existing procedures are removed or modified (except the Net Exposure formula fix).

| Procedure | Router | Priority | Estimated Effort |
|---|---|---|---|
| `analytics.getExecutiveAlerts` | `analytics.ts` | **Critical** | 1 day |
| `analytics.getMonthComparison` | `analytics.ts` | **Critical** | 1 day |
| `analytics.getClaimsAgeing` | `analytics.ts` | **High** | 0.5 days |
| `analytics.getEscalationCounts` | `analytics.ts` | **High** | 0.5 days |
| `analytics.getFraudInvestigationFunnel` | `analytics.ts` | **High** | 0.5 days |
| `analytics.getSettlementTrend` | `analytics.ts` | **High** | 0.5 days |
| `crossClaim.getTopEntities` | `routers.ts` (crossClaim sub-router) | **High** | 0.5 days |
| `governance.getExceptionsRegister` | `routers.ts` (governance sub-router) | **Medium** | 1 day |
| `reportingEngine.generateExecutiveFullReport` | `reporting/reportDefinitions.ts` | **High** | 3 days |
| Fix: `analytics.getFinancialOverview` Net Exposure | `analytics.ts` | **Critical** | 0.5 days |
| Fix: `analytics.getMonthComparison` (replaces hardcoded strip) | `analytics.ts` | **Critical** | 1 day |
| Fix: Recovery report case handlers (3 reports) | `reporting/reportDefinitions.ts` | **Critical** | 1 day |

**Total estimated backend effort:** 10.5 days

---

## 13. Implementation Sequence

The implementation is structured in four phases to minimise risk and deliver visible value at each stage.

### Phase 1: Critical Fixes (Days 1–3)
Fix the three critical defects identified in the audit before adding any new features:
1. Replace hardcoded Month Comparison Strip with `analytics.getMonthComparison` procedure
2. Add recovery report case handlers to `generateReportHtml`
3. Fix Net Exposure formula in `analytics.getFinancialOverview`

### Phase 2: Visual Redesign (Days 4–7)
Implement the v2 visual design without changing any data:
1. Implement `ExecutivePeriodContext` and wire period selector to all existing queries
2. Redesign dashboard header (dark band, period selector, action buttons)
3. Redesign tab navigation (pill style)
4. Redesign KPI cards (coloured left border, Inter font, tabular numbers)
5. Restructure tab layout to match v2 specification
6. Add Demo Mode banner

### Phase 3: New Components (Days 8–14)
Implement new data components:
1. Executive Alerts Centre (`analytics.getExecutiveAlerts`)
2. Claims Ageing Panel (`analytics.getClaimsAgeing`)
3. Escalations Dashboard (`analytics.getEscalationCounts`)
4. Investigation Funnel (`analytics.getFraudInvestigationFunnel`)
5. Cross-Claim Intelligence panel (`crossClaim.getTopEntities`)
6. Recovery Dashboard (wire existing `recovery.getKPIs` + `recovery.getCases`)
7. Settlement Trend chart (`analytics.getSettlementTrend`)
8. Governance Exceptions Register (`governance.getExceptionsRegister`)
9. Leakage tile (add to `analytics.getFinancialOverview`)

### Phase 4: Executive Report (Days 15–18)
Implement the Executive Intelligence Report:
1. `reportingEngine.generateExecutiveFullReport` procedure
2. Tab 6 (Executive Reports) UI with generation form and progress indicator
3. Report document HTML template (7 sections)
4. AI summary integration (5 LLM calls)
5. PDF generation and storage

**Total estimated implementation effort:** 18 development days

---

## 14. Design Token Reference

The following CSS variables must be added to `client/src/index.css` under the `:root` block to support the v2 design:

```css
/* Executive Dashboard v2 Design Tokens */
--exec-header-bg: #0F172A;
--exec-header-text: #F8FAFC;
--exec-header-muted: #94A3B8;
--exec-accent-teal: #0D9488;
--exec-accent-emerald: #059669;
--exec-accent-amber: #D97706;
--exec-accent-red: #DC2626;
--exec-accent-blue: #2563EB;
--exec-accent-violet: #7C3AED;
--exec-card-bg: #FFFFFF;
--exec-card-border: #E2E8F0;
--exec-page-bg: #F8FAFC;
--exec-text-primary: #0F172A;
--exec-text-secondary: #475569;
--exec-text-muted: #94A3B8;
```

The Inter font must be added to `client/index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

And applied globally in `client/src/index.css`:

```css
:root {
  --font-sans: 'Inter', Helvetica, Arial, system-ui, sans-serif;
}
```

---

*End of KINGA Executive Intelligence Centre — Dashboard v2 Formal Specification*  
*Document prepared by KINGA Product Team · June 2026*
