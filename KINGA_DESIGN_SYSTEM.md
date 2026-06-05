# KINGA ForensicAuditReport — Design System Strategy

## 1. Audit Findings

### 1.1 Font Chaos (6 different font families in use)
| Found | Occurrences | Problem |
|---|---|---|
| `'DM Sans', sans-serif` | 1 (CSS root) | Correct brand font — keep |
| `var(--kr-sans)` | 2 inline | Correct — keep |
| `var(--kr-mono)` | 58 CSS + 3 inline | Correct — keep |
| `'IBM Plex Mono','Courier New',monospace` | 12 inline | **Remove** — replace with `var(--kr-mono)` |
| `'monospace'` | 15 inline | **Remove** — replace with `var(--kr-mono)` |
| `'sans-serif'` | 1 inline | **Remove** — replace with `var(--kr-sans)` |
| `var(--kr-serif)` / `'Instrument Serif'` | 1 | Cover title only — acceptable |

### 1.2 Font Size Chaos (9 different sizes in inline styles)
Current: 9, 10, 11, 12, 13, 14, 18, 20 px — all hardcoded.

Target scale (mapped from font prompt):
| Token | Size | Use |
|---|---|---|
| `--kr-sz-xs` | 10px | Mono labels, field names, badges |
| `--kr-sz-sm` | 11px | Table cells (first col), captions |
| `--kr-sz-body` | 12px | Standard body, table values |
| `--kr-sz-md` | 13px | Section narrative paragraphs |
| `--kr-sz-sub` | 14px | Section headings |
| `--kr-sz-lg` | 18px | Cost figures, large values |
| `--kr-sz-xl` | 22px | Score card numbers |

### 1.3 Colour Chaos (35 different hardcoded hex values)
Current hardcoded colours that must be replaced with CSS variables:
- `#0f172a`, `#111`, `#111827`, `#222`, `#444` → `var(--kr-text)` or `var(--kr-black)`
- `#64748b`, `#94a3b8`, `#888`, `#555`, `#6b6862`, `#334155`, `#374151`, `#475569` → `var(--kr-muted)`
- `#16a34a`, `#15803d` → `var(--kr-green)`
- `#d97706`, `#92400e` → `var(--kr-amber)`
- `#dc2626`, `#c00`, `#c2410c` → `var(--kr-red)`
- `#1A2B4A`, `#1e3a5f`, `#0c4a6e` → `var(--kr-navy)` (NEW variable needed)
- `#f1f5f9`, `#f8fafc`, `#fafafa`, `#f8f8f8` → `var(--kr-off-white)`
- `#fff`, `#ffffff` → `var(--kr-white)`

### 1.4 Capitalisation Chaos
52 instances of `textTransform: 'uppercase'` — many applied to:
- Section sub-headings (1.1, 1.2, etc.) — **WRONG**: should be sentence case bold
- Table column headers — **CORRECT**: uppercase is standard for table headers
- Badge labels — **CORRECT**: uppercase is standard for status badges
- KPI labels — **CORRECT**: uppercase mono labels are intentional

### 1.5 Officer Findings Issue
`policeOfficerFindings` is extracted verbatim from documents. The user wants it to show **AI-reasoned interpretation**, not raw text. Fix: render it as an alert-box with structured analysis (consistency flag, implication, action required).

---

## 2. KINGA Design System (Navy + Green brand)

### 2.1 Colour Palette (mapping font prompt → our brand)
| Font Prompt Token | Value | Our CSS Variable | Role |
|---|---|---|---|
| NAVY `#1C2B4A` | `#1A2B4A` | `--kr-navy` | Section header bars, page header |
| ACCENT `#166534` | `#166534` | `--kr-green` | Subsection labels, pass status |
| NEAR_BLACK `#1A1A1A` | `#0f172a` | `--kr-text` | Body text |
| BLACK `#000000` | `#0a0a0a` | `--kr-black` | Titles, borders |
| DARK_GREY `#3D3D3D` | `#334155` | `--kr-dark` | Field labels, secondary bold |
| MID_GREY `#6B6B6B` | `#6b6862` | `--kr-muted` | Muted text, captions |
| LIGHT_GREY `#D4D4D4` | `#e0ddd8` | `--kr-rule` | Table borders, dividers |
| OFF_WHITE `#F7F7F7` | `#f7f6f3` | `--kr-off-white` | Alternating row background |
| S_GREEN `#166534` | `#166534` | `--kr-green` | Pass/OK status text |
| S_AMBER `#92400E` | `#92400e` | `--kr-amber` | Warning status text |
| S_RED `#991B1B` | `#c0392b` | `--kr-red` | Critical/fail status text |

### 2.2 Typography Scale
| Style | Font | Size | Weight | Transform | Use |
|---|---|---|---|---|---|
| Section header | DM Sans | 14px | 700 | none | `1 · Incident & Data Integrity` |
| Subsection label | DM Sans | 12px | 700 | none | `1.1 Incident Facts` |
| Body text | DM Sans | 12px | 400 | none | Narrative paragraphs |
| Table header | DM Sans | 10px | 700 | uppercase | `th` cells |
| Table body | DM Sans | 12px | 400 | none | `td` cells |
| Field label (kv) | DM Sans | 11px | 600 | none | Left col of kv-tables |
| Field value (kv) | DM Sans | 12px | 400 | none | Right col of kv-tables |
| Mono label | DM Mono | 10px | 400 | uppercase | KPI labels, run IDs |
| Mono value | DM Mono | 12px | 500 | none | Scores, hashes, refs |
| Status badge | DM Sans | 10px | 700 | uppercase | PASS / FAIL / REVIEW |
| Cost figure | DM Mono | 18px | 600 | none | Repair cost totals |
| Score number | DM Mono | 22px | 600 | none | FCDI, fraud score |

### 2.3 Rules
1. **No raw `#hex` colours in JSX** — all colours via CSS variables only
2. **No raw font-family strings in JSX** — all fonts via `var(--kr-mono)` / `var(--kr-sans)` only
3. **No uppercase on section sub-headings** (1.1, 1.2 etc.) — sentence case bold only
4. **Table headers**: uppercase + 10px + DM Sans bold — via CSS class, not inline
5. **Officer findings**: rendered as structured alert-box with AI interpretation flag, not raw text dump
6. **Section heading**: navy background bar with white text (matching mock structure) — not plain border-bottom

---

## 3. Implementation Plan

### Phase 3: CSS Variables + Base Styles
- Add `--kr-navy: #1A2B4A` to CSS variables
- Add `--kr-dark: #334155` to CSS variables  
- Add `--kr-sz-*` size tokens
- Update `.section-heading` to navy bar style
- Update `.sub-heading` to sentence-case bold (remove uppercase)
- Update `.data-table th` to navy background
- Update `.kv-table` first-col to `--kr-dark` colour

### Phase 4: Officer Findings Fix
- Render `officerFindings` as structured alert-box:
  - If null/not stated: show "Not extracted — full police report not submitted"
  - If present: show as italic quote + consistency flag (does it match incident narrative?)

### Phase 5: Inline Style Sweep
- Replace all `fontFamily: "'IBM Plex Mono'..."` → `fontFamily: 'var(--kr-mono)'`
- Replace all `fontFamily: 'monospace'` → `fontFamily: 'var(--kr-mono)'`
- Replace all hardcoded `#0f172a`, `#111`, `#222` → `var(--kr-text)`
- Replace all `#64748b`, `#888`, `#555`, `#94a3b8` → `var(--kr-muted)`
- Replace all `#1A2B4A`, `#1e3a5f` → `var(--kr-navy)`
- Replace all `#16a34a`, `#15803d` → `var(--kr-green)`
- Replace all `#dc2626`, `#c00` → `var(--kr-red)`
- Replace all `#d97706`, `#92400e` → `var(--kr-amber)`
- Remove `textTransform: 'uppercase'` from sub-heading labels (1.1, 1.2 etc.)
