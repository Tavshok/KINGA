# KINGA Phase 11 Reference

## Source Set
- `/home/ubuntu/upload/pasted_content_12.txt`
- `/home/ubuntu/upload/pasted_content_13.txt`
- `/home/ubuntu/kinga-phase11-prototype/executive-dashboard.html`
- `/home/ubuntu/kinga-phase11-prototype/claims-manager.html`
- `/home/ubuntu/upload/KINGAexportal.pdf` (pages 1-5 viewed so far)

## Authoritative Phase 11 Prompt Rules

### Canonical visual reference
The attached premium green Claims Manager mock is the canonical platform reference. Every other portal must be visually indistinguishable as part of one system, with only portal-specific content changing.

### Design tokens
- Greens: `#0B2E1C`, `#103A23`, `#154A2E`, `#1C5C39`, `#237049`, `#2E8557`, `#E7F1EA`
- Golds: `#9C7A22`, `#B8923A`, `#E3CD8F`, `#F3E9D2`
- Surfaces: `#FAF7F1`, `#FFFFFF`, body fallback `#F7F8F6`
- Text: `#15201A`, `#6B7568`, `#9AA293`
- Lines: `#E7E2D6`, `#D8D2C2`
- Alerts: `#B1402F`, `#F8E9E4`, `#A6730B`, `#F8EFDD`

### Hero band
Use exactly one top hero band per portal:
- `linear-gradient(155deg, #103A23 0%, #1C5C39 100%)`
- bottom border `2px solid #B8923A`
- logo height `28px`
- breadcrumb + title + subtitle + actions + one KPI strip

### Gold usage rule
Gold may appear only in two roles:
1. The single primary CTA / export action on the page
2. The single headline KPI accent in the hero strip

Gold must not be used repeatedly in charts, badges, or repeated UI elements.

### Typography and structure
- Inter throughout
- tabular numerals everywhere numeric values appear
- JetBrains Mono/SF Mono for ID fragments
- no card shadows; use 1px borders
- standard radius 10px
- KPI strip must be one continuous bordered grid with inner dividers, not detached cards

### Density rule
For dense operational portals, body background should use `#F7F8F6` rather than cream if cream feels too muddy. This decision must be applied consistently across the platform.

## Structural Pattern to Apply Platform-Wide
1. Sticky white identity strip
2. Dark green hero band with one KPI strip
3. Flat white tab bar with green active underline
4. Compact alert strip with red/amber left-accent items
5. Main body grid
   - either `1fr 320px` for operational portals
   - or 3-column executive grid where the prototype explicitly requires it
6. Main work surface first: table / queue / case list / report list
7. Sidebar for attention-required items, mini charts, status grids, and short summaries

## Prototype-specific references

### Executive portal prototype
- 3-column overview grid
- Row 1: Claims Ageing (span-2) + Fraud Funnel beneath it, beside Escalation Queue
- Row 2: Period Comparison, Cost Savings Trend, AI Confidence Distribution
- Row 3: Global Search (span-2) + Fast-Track Analytics
- Reports and analytics are presented as bordered report cards, not floating dashboard widgets

### Claims Manager prototype
- 2-column main + 320px sidebar
- Main area prioritizes the claims table with filters and search
- Sidebar contains Attention Required, Weekly Intake chart, and SLA Performance grid
- This is the canonical operational pattern for the rest of the portals

## Executive PDF findings from pages 1-5
The PDF confirms the intended tone is quieter and more report-like than the current app implementation. The cards are restrained, evenly spaced, border-led, and vertically rhythmic. Charts are compact and embedded inside report cards rather than dominating the page. Headings are small and controlled; the primary reading flow is KPI strip -> section label -> bordered analysis card. The sidebar/nav remains visually dark and minimal while the content area stays light and spacious.

## Immediate implementation implication
Portal rewrites should not stop at swapping the hero band. They must also simplify page structure so each portal feels like a Phase 11 report surface: cleaner body grid, fewer stacked analytics blocks, stronger table/report priority, and restrained mini-chart usage.
