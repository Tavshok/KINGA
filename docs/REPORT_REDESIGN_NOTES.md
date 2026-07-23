# KINGA Report Redesign Compliance Notes

## Source Design Files
- `/home/ubuntu/upload/KINGA_Claims_Report_Redesign.html` — Process tier reference
- `/home/ubuntu/upload/KINGA_Claims_Intelligence_Report_Redesign.html` — Protect tier reference

## Approved Design System (from both files)
- **No dark backgrounds anywhere** — all `background:#171717` / `.cover` / `.cover-head` must be removed
- **White paper** `#ffffff`, grey page bg `#f2f2f2`
- **Masthead pattern**: `display:flex; justify-content:space-between; border-bottom:2.5px solid var(--ink)`
  - Left: `KINGA·AI` brand (bold, letter-spacing:2px) + tier badge (inline, dark bg) + doc-title (20px bold) + doc-sub
  - Right `.meta`: KINGA logo (height:28px, margin-left:auto) + claimno (mono bold) + date+insurer line + decision-chip
- **Decision chip**: `.decision-chip.review/.approve/.reject` — amber/green/red pill
- **Scorecard**: 4-col grid, `border:1px solid var(--ink)`, `.score-cell.good/.warn/.bad`
- **Verdict strip**: 3-col grid, `border:1px solid var(--hairline-strong)`, light bg
- **Section tabs**: `background:var(--green)` (#3C7844), white text, `.section-tab .num` (semi-transparent white bg)
- **TOC**: `.toc` flex, `.toc-cell`, `.toc-cell .n/.t/.s` — used in Protect tier cover page
- **Boxes**: `.box` with `border:1px solid var(--hairline-strong); padding:10px 12px`
- **KV tables**: `table.kv` — `.k` (40% width, ink-soft) + `.v` (right-align, bold)
- **Grid tables**: `table.grid-t` — dark header (`background:var(--ink); color:#fff`), alternating rows
- **Bar chart**: `table.bartable` + `table.btrack` (nested table for PDF-safe bars)
- **Footer strip**: `.footer-strip` — absolute bottom, flex space-between, 8px font, hairline top border
- **Logo URL**: `https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png`

## Process Tier (reportDefinitions.ts) — STATUS: DONE
- Dark header replaced with `.masthead` pattern ✓
- Section tabs replaced with `.section-tab` green divs ✓
- Footer-strip added ✓
- Page wrapped in `<div class="page">` ✓

## Protect Tier (claimsIntelligenceReport.ts) — STATUS: IN PROGRESS
Old patterns to replace:
- `<div class="cover-head">` → `<div class="page"><div class="masthead">`
- `.meta-grid` / `.mg-cell` → remove (data moves into masthead meta + verdict-strip)
- `.cost-snap` → replace with `.verdict-strip` (3 cells: highest quote, KINGA estimate, recommended settlement)
- `.score-strip.c4` → replace with `.scorecard` (4 cells: fraud, data complete, quotes, R:V)
- `.contents` / `.ct-grid` → replace with `.toc` flex pattern
- `<div class="rh">` running headers → remove (they're page-break markers, not needed)
- `<div class="page">` already exists on each section — keep
- `.sh` / `.sh-left` / `.sn` / `<h2>` → replace with `.section-tab` green div
- `.lead` → replace with `<p class="small">` intro text
- `.two-col` → replace with `.cols-2`
- `.sub` / `<h3>` → replace with `.box h4`
- `.fc` callouts → replace with `.callout.amber/.red/.green`
- `.kpi.c4` → replace with `.scorecard` or `.cols-3` boxes
- `.quote-cards` → replace with `table.bartable` bar chart
- `.settlement-pos` → replace with `.cols-3` boxes or `.kv` table
- `.stages` → replace with `table.grid-t` approval chain table
- `.bridge` divs → remove
- Footer: replace centered disclaimer with `.footer-strip` per page

## Forensic Tier (forensicDecisionReport.ts) — STATUS: MOSTLY DONE
- Already uses `.masthead`, `.section-tab`, `.scorecard`, `.footer-strip`
- Logo added to masthead meta ✓
- Logo added to all 4 footer-strips ✓
- Brand copy: `KINGA·AI` in masthead (line 463) — keep
- Minor: `KINGA AI v4.2` in old footer text → already replaced with `KINGA` ✓
