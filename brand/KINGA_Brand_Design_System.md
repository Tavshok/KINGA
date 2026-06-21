# KINGA Brand & Design System
### Version 1.0 — Authoritative Reference for All UI, Dashboard, and Report Work

---

## Purpose

This document is the single source of truth for every visual decision made in the KINGA platform. It exists to prevent the introduction of foreign colours, inconsistent typography, and ad-hoc design choices that erode the product's visual identity over time. Any developer, designer, or AI agent working on KINGA must consult this document before making a visual change. When in doubt, this document takes precedence.

---

## 1. Brand Foundation

### 1.1 The Logo

The KINGA logo consists of two elements: an African shield motif filled with a gradient of Hebrew script characters, crossed by a spear and sceptre, and the wordmark **"KINGA"** in bold letterforms to the right.

The shield represents protection, authority, and intelligence. The gradient within it moves from deep forest green at the base through sage teal at the centre to slate blue at the crown — symbolising growth, clarity, and trust. The wordmark is rendered in a single, confident forest green.

**Logo usage rules:**
- The logo must never be recoloured, stretched, or placed on a background that reduces contrast below 4.5:1.
- Minimum display size: 120px wide in digital interfaces, 30mm wide in print.
- Clear space: a minimum of the height of the letter "K" on all four sides.
- The logo must not be placed on a busy photographic background without a white or dark overlay.

### 1.2 Brand Personality

KINGA is an enterprise-grade AI claims intelligence platform. Its visual language must communicate:

- **Authority** — decisions made by KINGA carry weight; the design must reflect that seriousness.
- **Clarity** — insurance claims are complex; the UI must reduce cognitive load, not add to it.
- **Trust** — insurers and claimants rely on KINGA's outputs; the design must feel reliable and precise.
- **African identity** — the brand is rooted in African heritage; the palette and motifs reflect that origin without being decorative or superficial.

---

## 2. Colour System

All colours in the KINGA platform are derived directly from the logo. No colour may be introduced from outside this palette without explicit approval and documentation in this file.

### 2.1 Primary Palette — Extracted from Logo

The following values were extracted by pixel-level analysis of the master logo file.

| Token | Hex | RGB | Role | Source |
|---|---|---|---|---|
| `--kinga-forest` | `#3C7844` | rgb(60, 120, 68) | **Primary brand colour** | KINGA wordmark |
| `--kinga-teal` | `#68A890` | rgb(104, 168, 144) | **Secondary accent** | Shield centre gradient |
| `--kinga-slate` | `#4878A8` | rgb(72, 120, 168) | **Informational accent** | Shield upper gradient |
| `--kinga-charcoal` | `#484840` | rgb(72, 72, 64) | **Neutral dark** | Spear / sceptre |

These four colours are the complete KINGA brand palette. Every colour used in the platform must be one of these four, or a tint/shade derived from them, or a neutral grey.

### 2.2 Semantic Colour Mapping

Each brand colour is assigned a semantic role. These roles must not be swapped.

| Semantic Role | Colour | Hex | When to Use |
|---|---|---|---|
| **Primary action** | Forest Green | `#3C7844` | Primary buttons, active nav item, active tab underline, LIVE indicator, primary CTA |
| **Positive / Growth** | Sage Teal | `#68A890` | Savings metrics, resolution rate, positive trend pills, success states, chart series 1 |
| **Informational / Data** | Slate Blue | `#4878A8` | Total counts, neutral data points, informational badges, chart series 2 |
| **Structural / Neutral** | Charcoal | `#484840` | Icons on dark backgrounds, secondary structural elements |

### 2.3 Tints and Shades

Each brand colour may be used at reduced opacity to create backgrounds, hover states, and tinted icon containers. The approved opacity levels are:

| Usage | Opacity | Example |
|---|---|---|
| Icon container background | 8% | KPI card icon square fill |
| Hover state background | 10% | Nav item hover |
| Active nav item background | 6% | Sidebar active item tint |
| Badge / pill background | 12% | Trend pill, status chip |
| Border on tinted surface | 25% | Badge border |
| Chart fill (area charts) | 20% | Area chart fill under line |

No other opacity levels are permitted for brand colours used as backgrounds.

### 2.4 Neutral Palette

The neutral palette is fixed and must not be substituted with brand colours.

| Token | Hex | Usage |
|---|---|---|
| `--neutral-900` | `#111827` | Primary body text, KPI numbers |
| `--neutral-700` | `#374151` | Secondary body text, card titles |
| `--neutral-500` | `#6B7280` | Labels, descriptions, placeholder text |
| `--neutral-400` | `#9CA3AF` | Section headers, divider labels, disabled text |
| `--neutral-200` | `#E5E7EB` | Borders, dividers, card borders |
| `--neutral-100` | `#F3F4F6` | Subtle backgrounds, table row hover |
| `--neutral-50` | `#F9FAFB` | Page background, sidebar background |
| `--white` | `#FFFFFF` | Card background, modal background |

### 2.5 Semantic Status Colours

Status colours communicate claim outcomes and alerts. They are the only colours in the system that may deviate from the brand palette, because they carry universal meaning (red = danger, amber = caution, green = pass).

| Status | Background | Text / Border | Usage |
|---|---|---|---|
| **Pass / Approve** | `#E6F4E6` | `#2A7A2A` | Claim approved, KINGA pass decision |
| **Review / Warn** | `#FEF3E2` | `#8A5C00` | Manual review required, caution flag |
| **Reject / Fail** | `#FCE8E8` | `#A32D2D` | Claim rejected, KINGA fail decision |
| **Fraud** | `#FFF4E0` | `#7A4E00` | Fraud escalation, high-risk flag |
| **Info** | `#F0F4FF` | `#3B5998` | Informational notice, neutral system message |

Status colours must only be used in their designated contexts. They must never be used as general accent colours, button colours, or decorative elements.

### 2.6 Dark Mode Palette

The dark mode palette inverts the neutral scale while keeping brand colours at increased luminosity for visibility.

| Token | Dark Mode Value | Notes |
|---|---|---|
| Page background | `#1C1C1E` | Near-black, not pure black |
| Card background | `#2A2A2A` | Slightly elevated |
| Border | `#3F3F3F` | Subtle separation |
| Primary text | `#E5E7EB` | Off-white, not pure white |
| Muted text | `#9CA3AF` | Same as light mode neutral-400 |
| Forest Green (primary) | `#5A9E66` | Lightened for dark bg contrast |
| Sage Teal (secondary) | `#7DBFA8` | Lightened for dark bg contrast |
| Slate Blue (info) | `#6B96C8` | Lightened for dark bg contrast |

---

## 3. Typography

### 3.1 Font Family

**Inter** is the sole typeface for all KINGA digital interfaces. It is loaded from Google Fonts CDN. No other typeface may be introduced.

Inter is chosen because it is designed specifically for screen readability at small sizes, has excellent tabular numeral support (critical for financial data), and has a neutral, professional character that does not compete with the brand palette.

```html
<!-- Required in index.html <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

For printed reports and PDF exports, **Inter** remains the primary typeface. If Inter is unavailable in the PDF rendering engine, the fallback is **Helvetica Neue**, then **Arial**.

### 3.2 Type Scale

| Role | Size | Weight | Line Height | Letter Spacing | Colour |
|---|---|---|---|---|---|
| Page title | 20px | 600 (Semibold) | 1.3 | −0.02em | `--neutral-900` |
| Section title | 16px | 600 (Semibold) | 1.4 | −0.01em | `--neutral-900` |
| Card title | 14px | 600 (Semibold) | 1.4 | 0 | `--neutral-700` |
| Body / description | 13px | 400 (Regular) | 1.5 | 0 | `--neutral-500` |
| KPI number | 32px | 700 (Bold) | 1.0 | −0.03em | `--neutral-900` |
| KPI secondary number | 22px | 700 (Bold) | 1.1 | −0.02em | `--neutral-900` |
| KPI label | 11px | 600 (Semibold) | 1.2 | +0.06em | `--neutral-400` |
| Table header | 11px | 600 (Semibold) | 1.2 | +0.06em | `--neutral-400` |
| Table body | 13px | 400 (Regular) | 1.4 | 0 | `--neutral-700` |
| Badge / pill | 11px | 600 (Semibold) | 1.0 | +0.02em | (semantic) |
| Section divider label | 11px | 600 (Semibold) | 1.0 | +0.08em | `--neutral-400` |
| Button (primary) | 13px | 500 (Medium) | 1.0 | 0 | `--white` |
| Button (secondary) | 13px | 500 (Medium) | 1.0 | 0 | `--neutral-700` |

KPI labels must always be **uppercase**. Section divider labels must always be **uppercase**. All other text must be in sentence case.

### 3.3 Numeric Display

All financial values, counts, and percentages in dashboards must use **tabular numerals** (`font-variant-numeric: tabular-nums`). This prevents numbers from shifting width as they update, which is visually disruptive in live dashboards.

---

## 4. Spacing & Layout

### 4.1 Spacing Scale

The platform uses an 8px base grid. All spacing values must be multiples of 4px.

| Token | Value | Common Use |
|---|---|---|
| `space-1` | 4px | Icon-to-label gap, badge padding |
| `space-2` | 8px | Inline element gap |
| `space-3` | 12px | Compact card padding |
| `space-4` | 16px | Standard element gap |
| `space-5` | 20px | Card padding (standard) |
| `space-6` | 24px | Card header padding |
| `space-8` | 32px | Section gap |
| `space-10` | 40px | Page section gap |
| `space-12` | 48px | Major section separation |

### 4.2 Border Radius

| Context | Radius | Token |
|---|---|---|
| Cards | 8px | `--radius-card` |
| Buttons | 6px | `--radius-button` |
| Badges / pills | 9999px | `--radius-pill` |
| Icon containers | 8px | `--radius-icon` |
| Input fields | 6px | `--radius-input` |
| Modals | 12px | `--radius-modal` |

The current `0.75rem` (12px) radius on cards is too large for a data-dense enterprise dashboard. It makes cards look like consumer app components. The correct value is `8px`.

### 4.3 Page Layout

| Context | Max Width | Horizontal Padding |
|---|---|---|
| Dashboard content | 1600px | 32px (desktop), 16px (mobile) |
| Report content | 1200px | 40px |
| Modal / dialog | 640px | 24px |

The sidebar width is 260px when expanded, 64px when collapsed. The main content area must never overlap the sidebar.

### 4.4 Card Elevation System

Cards use a three-level elevation system based on box shadow, not border weight.

| Level | Usage | Shadow |
|---|---|---|
| **Flat** | Table rows, list items, inline elements | `none` — border only: `1px solid #E5E7EB` |
| **Raised** | Standard content cards, KPI cards | `0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)` |
| **Floating** | Modals, dropdowns, tooltips | `0 10px 25px rgba(0,0,0,0.12), 0 4px 10px rgba(0,0,0,0.08)` |

Cards must never use `shadow-sm` from Tailwind directly — always use the tokens above. Cards must never use coloured borders as decoration (e.g., `border-left: 4px solid #3B82F6`). The only permitted coloured border on a card is a `3px solid var(--kinga-forest)` left border on the **active sidebar navigation item**.

---

## 5. Component Patterns

### 5.1 KPI Cards

KPI cards are the most prominent element in the dashboard. They must follow this exact pattern:

**Structure (top to bottom):**
1. Icon container — `36×36px`, `border-radius: 8px`, brand colour at 8% opacity background, full brand colour icon inside
2. Label — `11px uppercase Inter Semibold`, `--neutral-400`, `letter-spacing: 0.06em`
3. Value — `32px Inter Bold`, `--neutral-900`, `font-variant-numeric: tabular-nums`
4. Subtitle — `12px Inter Regular`, `--neutral-500`
5. Trend pill (optional) — `11px Inter Semibold`, rounded pill, green or red semantic colour at 12% opacity

**Card container:** white background, `1px solid #E5E7EB` border, `box-shadow: 0 1px 3px rgba(0,0,0,0.08)`, `border-radius: 8px`, `padding: 20px`.

**What is forbidden on KPI cards:**
- Left-border colour stripes (`border-left: 4px solid ...`)
- Gradient backgrounds
- Multiple competing accent colours in the same card
- Coloured card backgrounds (cards are always white in light mode)

### 5.2 Stat Bar (Secondary Metrics)

When four or more secondary metrics need to be displayed compactly, they must be grouped into a single **stat bar** card — one card containing multiple columns separated by `1px solid #E5E7EB` vertical dividers. Each column contains: a small icon, a label, and a value. This prevents the page from being overwhelmed by individual cards for every metric.

### 5.3 Section Dividers

When a tab or page contains multiple logical groups of content, they must be separated by a section divider. The pattern is:

```
[SECTION LABEL ——————————————————————————————————]
```

Implementation: a flex row containing an uppercase `11px` label in `--neutral-400`, followed by a `1px solid #E5E7EB` horizontal rule that fills the remaining width. No decorative icons, no coloured accents on the divider itself.

### 5.4 Tab Bar

All tab bars in the platform use the **underline tab** pattern:

- Tab list: no background, no border-radius, `border-bottom: 1px solid #E5E7EB`
- Inactive tab: `13px Inter Medium`, `--neutral-500`, no background
- Active tab: `13px Inter Semibold`, `--kinga-forest` (`#3C7844`), `border-bottom: 2px solid #3C7844`
- Hover: `--neutral-700` text, no background change

No pill-style, no rounded-corner, no background-fill tab bars. The underline pattern is the only permitted tab style.

### 5.5 Navigation Sidebar

- Background: `#FAFAFA` (not pure white, not grey — the off-white creates subtle separation from the content area)
- Right border: `1px solid #E5E7EB`
- Nav item height: `40px`
- Inactive item: `13px Inter Regular`, `--neutral-500`, no background
- Hover item: `--neutral-700` text, `#F3F4F6` background
- Active item: `13px Inter Semibold`, `--kinga-forest` text, `#3C7844` at 6% opacity background, `3px solid #3C7844` left border
- Section group labels (if used): `11px uppercase Inter Semibold`, `--neutral-400`, `padding: 8px 12px`

### 5.6 Page Header

Every dashboard page uses the same header structure:

- Background: `#FFFFFF`
- Bottom border: `1px solid #E5E7EB`
- Height: `64px`
- Left: page title (`20px Inter Semibold`, `--neutral-900`) + subtitle (`13px Inter Regular`, `--neutral-500`)
- Right: action buttons (outline style, `#E5E7EB` border, `--neutral-700` text)
- Live indicator (where applicable): `8px` pulsing circle in `#3C7844` + "Live" text in `12px Inter Medium #3C7844`

No gradient backgrounds on page headers. No coloured icon squares in the header. No heavy shadows on the header.

### 5.7 Buttons

| Variant | Background | Text | Border | Hover |
|---|---|---|---|---|
| Primary | `#3C7844` | `#FFFFFF` | none | `#2D6035` (10% darker) |
| Secondary / Outline | `transparent` | `--neutral-700` | `1px solid #E5E7EB` | `#F3F4F6` background |
| Destructive | `#A32D2D` | `#FFFFFF` | none | `#8B2424` |
| Ghost | `transparent` | `--neutral-500` | none | `#F3F4F6` background |

Button height: `32px` (small), `36px` (default), `40px` (large). Border radius: `6px`.

### 5.8 Badges and Status Pills

Status badges follow the semantic status colour system defined in Section 2.5. They must never use brand colours (forest green, teal, slate blue) as badge colours — those are reserved for navigation and KPI contexts.

Badge dimensions: `padding: 2px 8px`, `border-radius: 9999px`, `font-size: 11px`, `font-weight: 600`.

---

## 6. Chart and Data Visualisation Standards

### 6.1 Chart Colour Sequence

Charts must use brand colours in this fixed sequence. The sequence must not be reordered.

| Series | Colour | Hex | Semantic |
|---|---|---|---|
| Series 1 | Sage Teal | `#68A890` | Primary data series, positive metric |
| Series 2 | Slate Blue | `#4878A8` | Comparison series, neutral metric |
| Series 3 | Forest Green | `#3C7844` | Target / benchmark line |
| Series 4 | Amber (status) | `#D97706` | Warning threshold |
| Series 5 | Red (status) | `#A32D2D` | Critical threshold |

Series 4 and 5 are the only contexts where status colours may appear in charts. They must only be used when the data itself represents a warning or critical condition — not for visual variety.

### 6.2 Chart Typography

- Axis labels: `11px Inter Regular`, `--neutral-400`
- Axis values: `11px Inter Regular`, `--neutral-500`, tabular numerals
- Tooltip: white background, `1px solid #E5E7EB`, `box-shadow: 0 4px 12px rgba(0,0,0,0.1)`, `12px Inter Regular`
- Legend: `12px Inter Regular`, `--neutral-500`
- Chart title: use `CardTitle` component — do not add a separate title inside the chart canvas

### 6.3 Grid Lines

Chart grid lines must use `#F3F4F6` (neutral-100) — barely visible, providing structure without competing with the data. Never use coloured grid lines.

### 6.4 Chart Types and Their Permitted Uses

| Chart Type | Permitted Use | Forbidden Use |
|---|---|---|
| **Line chart** | Trends over time, month-on-month comparison | Comparing categories at a single point in time |
| **Bar chart** | Comparing categories, ranking | Showing trends over more than 6 time periods |
| **Stacked bar** | Showing composition within a category | More than 4 stacked segments |
| **Donut chart** | Showing a single proportion (e.g., resolution rate) | More than 5 segments |
| **Area chart** | Volume trends with emphasis on magnitude | Comparing two series with similar values |
| **Scatter plot** | Correlation analysis | General dashboards — only in analytical deep-dive views |
| **Radar chart** | **Forbidden in all contexts** | Poor readability, always replace with bar chart |
| **Heatmap** | Geographic or time-density data | Category comparisons |

### 6.5 Data Integrity Rule

Charts must only display real data from the database. Hardcoded, mocked, or illustrative data is permitted only when the system is in explicitly declared **Demo Mode** (indicated by the demo banner). When in Demo Mode, every chart must display the demo banner. Charts must never silently show fabricated data.

---

## 7. Dashboard Layout Rules

### 7.1 Information Hierarchy

Every dashboard must follow a strict three-tier information hierarchy:

**Tier 1 — Command metrics (always visible, above the fold):**
Four primary KPI cards. These answer the question: "Is the business performing well today?" They must be the first content the user sees after the page header.

**Tier 2 — Secondary metrics (compact, below Tier 1):**
A single stat bar containing four to six secondary metrics. These provide context for the Tier 1 numbers without creating visual competition.

**Tier 3 — Analytical content (tabbed, below Tier 2):**
Charts, tables, and detailed breakdowns organised into logical tabs. Each tab must contain no more than three logical sections, separated by section dividers.

### 7.2 Tab Organisation Rules

Tabs must be grouped by user intent, not by data source. The permitted tab groupings for each role are:

**Claims Manager Dashboard:**
- Tab group "Workflow": Intake Queue · Review Queue · Active Claims
- Tab group "Oversight": Fraud Alerts · Fleet Approvals
- Tab group "Admin": Processed · Notifications

**Executive Dashboard:**
- Tab: Overview (Tier 1 + 2 KPIs, period comparison, performance trends)
- Tab: Operational Health (governance, workflow bottlenecks, team performance)
- Tab: ROI & Financials (financial overview, cost savings, fraud prevented)
- Tab: Notifications

No dashboard may have more than five tabs. If content does not fit in five tabs, it must be moved to a dedicated sub-page.

### 7.3 Density Rules

- A single dashboard view must not contain more than **eight cards** visible without scrolling on a 1440px wide screen.
- KPI strips must not contain more than **four primary KPI cards** in a single row.
- No card may contain more than **one chart**.
- Cards containing tables must show a maximum of **five rows** before a "View all" link is shown.

### 7.4 Forbidden Dashboard Patterns

The following patterns are explicitly forbidden and must be removed whenever encountered:

| Pattern | Reason |
|---|---|
| `border-left: 4px solid [hardcoded hex]` on KPI cards | Creates rainbow noise, not brand-aligned |
| Gradient hero headers with grid overlays | Decorative, adds no information value |
| Workflow explainer banners above the KPI strip | Wastes prime screen real estate for daily users |
| More than two KPI strips stacked vertically | Creates visual monotony and buries content |
| Hardcoded colour values (`#3B82F6`, `#F59E0B`, etc.) in component files | Bypasses the design system |
| `text-[10px]` or `text-xs` for primary content | Below minimum readable size for data |
| `truncate` on metric labels or descriptions | Hides information the user needs |
| Radar charts | Poor readability in all contexts |
| `grid-cols-7` for tab navigation | Tabs must use underline pattern, not grid |

---

## 8. Report Design Standards

### 8.1 Report Layout

KINGA AI-generated reports follow the same colour system and typography as the dashboard. Reports are not a separate design context — they are an extension of the same brand.

Report sections use the same section divider pattern as the dashboard. Section numbers use a `--kinga-forest` tinted square badge (forest green at 15% opacity background, full forest green text).

### 8.2 Report Colour Usage

In reports, the brand colours are used as follows:

- **Forest Green** — section number badges, key finding highlights, positive outcome indicators
- **Sage Teal** — secondary data points, supporting metrics, chart series 1
- **Slate Blue** — informational callouts, reference data, chart series 2
- **Status colours** — claim outcome indicators (pass/review/reject/fraud) only

Reports must not introduce any colour not present in this document.

### 8.3 Report Typography

Report body text: `13px Inter Regular`, `--neutral-700`, line height `1.6`.
Report headings follow the same type scale as the dashboard (Section 3.2).
Financial values in reports must use tabular numerals and the currency symbol defined by the tenant's configuration.

---

## 9. Governance

### 9.1 How to Use This Document

Before making any visual change to the KINGA platform:

1. Check this document for the relevant rule.
2. If the rule exists, follow it exactly.
3. If the rule does not exist, propose an addition to this document before implementing the change.
4. Never introduce a colour, typeface, spacing value, or component pattern that is not defined here.

### 9.2 How to Propose Changes

Changes to this document must be proposed as a written amendment describing: the proposed change, the reason it is needed, and which existing rule (if any) it supersedes. Changes must not be implemented in code before they are documented here.

### 9.3 Version History

| Version | Date | Summary of Changes |
|---|---|---|
| 1.0 | June 2026 | Initial release — colours extracted from master logo, full component system defined |

---

*This document was produced by pixel-level analysis of the KINGA master logo file and review of the existing codebase. All colour values are measured, not assumed.*
