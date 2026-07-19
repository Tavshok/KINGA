/**
 * KINGA Report Design System — v7
 *
 * Shared CSS for both the Claims Intelligence Report (Process tier)
 * and the Forensic Claim Decision Report (Forensic tier).
 *
 * Palette: white / light-grey backgrounds only.
 * Colour used ONLY for left-border accents, chip borders/text, and chart data.
 * Typography: Inter (headings/body) + IBM Plex Mono (codes/numbers).
 */

export const KINGA_REPORT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

/* ── TOKENS ──────────────────────────────────────────────────────── */
:root {
  --kinga-green:   #1a7a4a;
  --kinga-mid:     #2d9e65;
  --kinga-lt:      #EAF4EE;
  --kinga-strip:   #f0f7f3;
  --red:           #c0392b;
  --amber:         #d97706;
  --blue:          #1d6fa4;
  --grey:          #555;
  --border:        #e0e0e0;
  --text:          #1a1a1a;
  --text-muted:    #666;
  --text-sm:       #888;
  --bg-page:       #f0f0f0;
  --bg-body:       #ffffff;
  --bg-section:    #f8f8f8;
  --bg-table-hd:   #f5f5f5;
  --bg-row-alt:    #fafafa;
  --bg-kinga-opt:  #f4faf6;
}

/* ── RESET ───────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 13px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  background: var(--bg-page);
  color: var(--text);
  line-height: 1.55;
}

/* ── REPORT WRAPPER ─────────────────────────────────────────────── */
.report {
  max-width: 960px;
  margin: 0 auto;
  background: var(--bg-body);
  box-shadow: 0 2px 24px rgba(0,0,0,0.08);
}

/* ── COVER ───────────────────────────────────────────────────────── */
.cover {
  background: #0f0e0c;
  color: #fff;
  padding: 48px 56px 40px;
}
.cover-brand {
  font-size: 11px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #e8f542;
  font-weight: 700;
  margin-bottom: 6px;
}
.tier-ribbon {
  display: inline-block;
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #888;
  border: 1px solid #444;
  padding: 2px 10px;
  margin-bottom: 12px;
}
.cover-title {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  color: #fff;
  margin-bottom: 4px;
}
.cover-sub {
  font-size: 11px;
  color: #888;
  letter-spacing: 0.5px;
  margin-bottom: 28px;
}
.cover-doc {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: #666;
  line-height: 1.8;
  text-align: right;
}
.cover-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
}
.cover-meta {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border: 1px solid #333;
  margin-bottom: 24px;
}
.cover-meta-cell {
  padding: 12px 16px;
  border-right: 1px solid #333;
}
.cover-meta-cell:last-child { border-right: none; }
.cover-meta-label {
  font-size: 9px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #666;
  margin-bottom: 4px;
}
.cover-meta-value {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}
.cover-meta-value.mono {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
}
.cost-snap {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  border: 1px solid #333;
  margin-bottom: 24px;
}
.cost-snap-cell {
  padding: 14px 16px;
  border-right: 1px solid #333;
}
.cost-snap-cell:last-child { border-right: none; }
.cost-snap-label {
  font-size: 9px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #666;
  margin-bottom: 6px;
}
.cost-snap-value {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 20px;
  font-weight: 500;
  color: #fff;
}
.cost-snap-value.green { color: #e8f542; }
.cost-snap-sub {
  font-size: 10px;
  color: #666;
  margin-top: 2px;
}
.verdict-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid #333;
  margin-bottom: 24px;
}
.verdict-label {
  font-size: 9px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #666;
  white-space: nowrap;
}
.verdict-value {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  flex: 1;
}
.verdict-value.red   { color: #ef4444; }
.verdict-value.amber { color: #f59e0b; }
.verdict-value.green { color: #e8f542; }
.score-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border: 1px solid #333;
}
.score-strip.c6 { grid-template-columns: repeat(6, 1fr); }
.score-cell {
  padding: 10px 14px;
  border-right: 1px solid #333;
  text-align: center;
}
.score-cell:last-child { border-right: none; }
.score-num {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 22px;
  font-weight: 500;
  color: #fff;
  line-height: 1;
}
.score-num.r { color: #ef4444; }
.score-num.a { color: #f59e0b; }
.score-num.g { color: #4ade80; }
.score-lbl {
  font-size: 9px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #666;
  margin-top: 4px;
}
.contents-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 24px;
}
.contents-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid #2a2a2a;
}
.contents-ref {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: #e8f542;
  white-space: nowrap;
}
.contents-name {
  font-size: 11px;
  color: #ccc;
  flex: 1;
}
.contents-status {
  font-size: 9px;
  padding: 1px 6px;
  border: 1px solid #444;
  color: #888;
  white-space: nowrap;
}

/* ── RUNNING HEADER ─────────────────────────────────────────────── */
.rh {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 32px;
  background: var(--bg-section);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  font-size: 10px;
  color: var(--text-sm);
  letter-spacing: 0.5px;
}
.rh .brand {
  font-weight: 700;
  color: var(--kinga-green);
  letter-spacing: 2px;
  font-size: 10px;
}

/* ── PAGE CONTAINER ─────────────────────────────────────────────── */
.page {
  padding: 32px 40px 40px;
  border-bottom: 1px solid var(--border);
}

/* ── SECTION HEADING ────────────────────────────────────────────── */
.sh {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--bg-section);
  border-left: 3px solid var(--kinga-green);
  margin-bottom: 20px;
}
.sh-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.sn {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: var(--kinga-green);
  font-weight: 500;
}
.sh h2 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

/* ── BADGE ───────────────────────────────────────────────────────── */
.badge {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  padding: 3px 10px;
  border-radius: 2px;
  text-transform: uppercase;
}
.badge.ok   { background: #f0faf4; color: var(--kinga-green); border: 1px solid #b6dfc8; }
.badge.warn { background: #fffbeb; color: var(--amber);       border: 1px solid #fcd34d; }
.badge.fail { background: #fef2f2; color: var(--red);         border: 1px solid #fca5a5; }
.badge.info { background: #eff6ff; color: var(--blue);        border: 1px solid #93c5fd; }

/* ── LEAD TEXT ───────────────────────────────────────────────────── */
.lead {
  font-size: 13px;
  line-height: 1.65;
  color: var(--text);
  margin-bottom: 20px;
}

/* ── SUB-SECTION HEADING ────────────────────────────────────────── */
.sub {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 20px 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.sub h3 {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.sm {
  font-size: 10px;
  color: var(--text-sm);
}

/* ── KPI BANDS ───────────────────────────────────────────────────── */
.kpi {
  display: grid;
  gap: 0;
  border: 1px solid var(--border);
  margin-bottom: 20px;
}
.kpi.c2 { grid-template-columns: repeat(2, 1fr); }
.kpi.c3 { grid-template-columns: repeat(3, 1fr); }
.kpi.c4 { grid-template-columns: repeat(4, 1fr); }
.kpi.c6 { grid-template-columns: repeat(6, 1fr); }
.kpi.c8 { grid-template-columns: repeat(8, 1fr); }
.kpi-c {
  padding: 14px 16px;
  border-right: 1px solid var(--border);
  text-align: center;
}
.kpi-c:last-child { border-right: none; }
.kpi-v {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 22px;
  font-weight: 500;
  color: var(--text);
  line-height: 1;
}
.kpi-v.r { color: var(--red); }
.kpi-v.a { color: var(--amber); }
.kpi-v.g { color: var(--kinga-green); }
.kpi-v.b { color: var(--blue); }
.kpi-l {
  font-size: 10px;
  font-weight: 600;
  color: var(--text);
  margin-top: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.kpi-s {
  font-size: 10px;
  color: var(--text-sm);
  margin-top: 2px;
}

/* ── FINDING CARDS ───────────────────────────────────────────────── */
.fc {
  padding: 12px 16px;
  border-left: 3px solid var(--grey);
  background: #fff;
  margin-bottom: 12px;
}
.fc.red    { border-left-color: var(--red); }
.fc.amber  { border-left-color: var(--amber); }
.fc.green  { border-left-color: var(--kinga-green); }
.fc.blue   { border-left-color: var(--blue); }
.fc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.fc-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.fc p {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text);
  margin-bottom: 6px;
}
.fc ul {
  margin: 6px 0 6px 16px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text);
}
.fc-action {
  font-size: 11px;
  color: var(--kinga-green);
  font-weight: 600;
  font-style: italic;
  margin-top: 4px;
}
.fc-refs {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: var(--text-sm);
  margin-top: 8px;
  line-height: 1.8;
}

/* ── CHIPS ───────────────────────────────────────────────────────── */
.chip {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.3px;
  padding: 2px 8px;
  border-radius: 2px;
  text-transform: uppercase;
  white-space: nowrap;
}
.chip.pass    { background: #f0faf4; color: var(--kinga-green); border: 1px solid #b6dfc8; }
.chip.warn    { background: #fffbeb; color: var(--amber);       border: 1px solid #fcd34d; }
.chip.fail    { background: #fef2f2; color: var(--red);         border: 1px solid #fca5a5; }
.chip.info    { background: #eff6ff; color: var(--blue);        border: 1px solid #93c5fd; }
.chip.neutral { background: #f5f5f5; color: var(--grey);        border: 1px solid #ddd; }
.chip.excl    { background: #fff7ed; color: #c2410c;            border: 1px solid #fdba74; }
.chip.struct  { background: #f5f3ff; color: #6d28d9;            border: 1px solid #c4b5fd; }

/* ── TABLES ──────────────────────────────────────────────────────── */
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  margin-bottom: 16px;
}
thead tr {
  background: var(--bg-table-hd);
}
th {
  padding: 8px 10px;
  text-align: left;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
td {
  padding: 8px 10px;
  border-bottom: 1px solid #f0f0f0;
  vertical-align: top;
  color: var(--text);
}
tr:nth-child(even) td { background: var(--bg-row-alt); }
tr.at-high td  { border-left: 2px solid var(--red); }
tr.at-medium td:first-child { border-left: 2px solid var(--amber); }
.tm { text-align: center; }
.tr { text-align: right; }
.mono { font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
.bold { font-weight: 600; }
.kinga-opt { background: var(--bg-kinga-opt) !important; font-weight: 600; }

/* ── QUOTE CARDS ─────────────────────────────────────────────────── */
.quote-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border: 1px solid var(--border);
  margin-bottom: 20px;
}
.quote-card {
  padding: 14px 16px;
  border-right: 1px solid var(--border);
  text-align: center;
}
.quote-card:last-child { border-right: none; }
.quote-card.kinga { background: var(--bg-kinga-opt); }
.qc-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.qc-amount {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 18px;
  font-weight: 500;
  color: var(--text);
}
.qc-amount.green { color: var(--kinga-green); }
.qc-sub {
  font-size: 10px;
  color: var(--text-sm);
  margin-top: 3px;
}
.qc-badge {
  display: inline-block;
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 2px;
  margin-top: 4px;
}

/* ── SETTLEMENT POSITION ─────────────────────────────────────────── */
.settlement-pos {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border: 1px solid var(--border);
  margin-bottom: 16px;
}
.sp-cell {
  padding: 12px 14px;
  border-right: 1px solid var(--border);
  text-align: center;
}
.sp-cell:last-child { border-right: none; }
.sp-cell.active { background: var(--bg-kinga-opt); }
.sp-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-sm);
  margin-bottom: 4px;
}
.sp-value {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 16px;
  font-weight: 500;
  color: var(--text);
}
.sp-value.green { color: var(--kinga-green); }
.sp-value.red   { color: var(--red); }
.sp-sub {
  font-size: 10px;
  color: var(--text-sm);
  margin-top: 2px;
}

/* ── STAGES ──────────────────────────────────────────────────────── */
.stages {
  display: flex;
  gap: 0;
  border: 1px solid var(--border);
  margin-bottom: 12px;
}
.stage {
  flex: 1;
  padding: 12px 14px;
  border-right: 1px solid var(--border);
  text-align: center;
}
.stage:last-child { border-right: none; }
.stage-n {
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}
.stage-s {
  font-size: 10px;
  color: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.stage-s.active  { color: var(--kinga-green); font-weight: 600; }
.stage-s.pending { color: var(--text-sm); }
.stage-s.done    { color: var(--blue); }

/* ── UPGRADE BANNER ──────────────────────────────────────────────── */
.upgrade {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 20px;
  border: 1px solid #b6dfc8;
  background: var(--kinga-lt);
  margin-top: 24px;
}
.upgrade-icon {
  font-size: 18px;
  color: var(--kinga-green);
  margin-top: 2px;
  flex-shrink: 0;
}
.upgrade-body { flex: 1; }
.upgrade-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--kinga-green);
  margin-bottom: 6px;
}
.upgrade-signals {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.upgrade-signal {
  font-size: 10px;
  padding: 2px 8px;
  background: #fff;
  border: 1px solid #b6dfc8;
  color: var(--kinga-green);
  border-radius: 2px;
}
.upgrade-txt {
  font-size: 12px;
  color: var(--text);
  line-height: 1.6;
}
.upgrade-cta {
  font-size: 11px;
  font-weight: 600;
  color: var(--kinga-green);
  border: 1px solid var(--kinga-green);
  padding: 6px 14px;
  white-space: nowrap;
  align-self: center;
  cursor: pointer;
  flex-shrink: 0;
}

/* ── BRIDGE ──────────────────────────────────────────────────────── */
.bridge {
  font-size: 11px;
  color: var(--text-sm);
  text-align: right;
  margin-top: 20px;
  font-style: italic;
}

/* ── IMPOSSIBILITY FLAG ──────────────────────────────────────────── */
.iflag {
  border: 1px solid var(--border);
  border-left: 3px solid var(--red);
  margin-bottom: 16px;
}
.iflag-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-section);
}
.iflag-id {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  color: var(--red);
  background: #fef2f2;
  border: 1px solid #fca5a5;
  padding: 2px 7px;
}
.iflag-class {
  font-size: 10px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-sm);
}
.iflag-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  padding: 10px 14px 6px;
}
.iflag-body {
  padding: 0 14px 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text);
}
.iflag-refs {
  padding: 8px 14px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: var(--text-sm);
  background: var(--bg-section);
  border-top: 1px solid var(--border);
  line-height: 1.8;
}
.iflag-score {
  padding: 6px 14px;
  font-size: 11px;
  color: var(--text-sm);
  border-top: 1px solid var(--border);
}

/* ── PHOTO GRID ──────────────────────────────────────────────────── */
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
.photo-card {
  border: 1px solid var(--border);
}
.photo-thumb {
  width: 100%;
  height: 120px;
  background: var(--bg-section);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--text-sm);
  position: relative;
  overflow: hidden;
}
.photo-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.photo-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  font-weight: 600;
  background: rgba(0,0,0,0.7);
  color: #fff;
  padding: 2px 6px;
}
.photo-conf {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(0,0,0,0.7);
  color: #4ade80;
  padding: 2px 6px;
}
.photo-meta {
  padding: 8px 10px;
  border-top: 1px solid var(--border);
}
.photo-component {
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}
.photo-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* ── DAMAGE ZONE MAP ─────────────────────────────────────────────── */
.zone-map-wrap {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  margin-bottom: 20px;
}
.zone-map-svg { flex-shrink: 0; }
.zone-legend {
  flex: 1;
  font-size: 11px;
}
.zone-legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid var(--border);
}
.zone-legend-item:last-child { border-bottom: none; }
.zone-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.zone-dot.sev-critical { background: var(--red); }
.zone-dot.sev-severe   { background: var(--amber); }
.zone-dot.sev-moderate { background: var(--blue); }
.zone-dot.sev-minor    { background: #aaa; }

/* ── SPEED SCALE ─────────────────────────────────────────────────── */
.speed-scale-wrap {
  margin-bottom: 20px;
}

/* ── WORKFLOW DIAGRAM ────────────────────────────────────────────── */
.workflow {
  display: flex;
  align-items: stretch;
  gap: 0;
  border: 1px solid var(--border);
  margin-bottom: 16px;
  overflow: hidden;
}
.wf-step {
  flex: 1;
  padding: 14px 12px;
  border-right: 1px solid var(--border);
  text-align: center;
  position: relative;
}
.wf-step:last-child { border-right: none; }
.wf-step.active { background: var(--bg-kinga-opt); }
.wf-num {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 18px;
  font-weight: 500;
  color: var(--text-muted);
  line-height: 1;
  margin-bottom: 6px;
}
.wf-step.active .wf-num { color: var(--kinga-green); }
.wf-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}
.wf-sub {
  font-size: 10px;
  color: var(--text-sm);
}

/* ── DEFINITIONS ─────────────────────────────────────────────────── */
.defs-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0;
  border: 1px solid var(--border);
}
.def-item {
  padding: 10px 14px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.def-item:nth-child(even) { border-right: none; }
.def-term {
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 3px;
}
.def-body {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.55;
}

/* ── UTILITY ─────────────────────────────────────────────────────── */
.small  { font-size: 11px; color: var(--text-sm); line-height: 1.6; }
.grey   { color: var(--text-sm); }
.mt8    { margin-top: 8px; }
.mt12   { margin-top: 12px; }
.mt20   { margin-top: 20px; }
.mb0    { margin-bottom: 0; }
.div    { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
.two-col-3-2 {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 24px;
}

/* ── PRINT ───────────────────────────────────────────────────────── */
@media print {
  body { background: #fff; }
  .report { box-shadow: none; }
  .page { page-break-inside: avoid; }
  .rh { page-break-after: avoid; }
}
`;

/**
 * Wrap a full HTML body string with the KINGA design system.
 */
export function buildKingaHtml(
  title: string,
  body: string,
  extraScripts = ""
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>${KINGA_REPORT_CSS}</style>
</head>
<body>
<div class="report">
${body}
</div>
${extraScripts}
</body>
</html>`;
}

/** Escape HTML special characters */
export function esc(s: unknown): string {
  if (s == null) return "—";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Format currency (USD default) */
export function fmtUSD(val: unknown): string {
  const n = Number(val ?? 0);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

/** Format date from timestamp or string */
export function fmtD(val: unknown): string {
  if (!val) return "—";
  try {
    const d = new Date(typeof val === "number" ? val : String(val));
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

/** Format percentage */
export function fmtPct(val: unknown, decimals = 1): string {
  const n = Number(val ?? 0);
  if (isNaN(n)) return "—";
  return `${n.toFixed(decimals)}%`;
}

/** Safe JSON parse */
export function safeJson(val: unknown): Record<string, unknown> | null {
  if (!val) return null;
  try { return typeof val === "string" ? JSON.parse(val) : (val as Record<string, unknown>); }
  catch { return null; }
}

/** Colour class for a 0–100 score (higher = worse for fraud, better for quality) */
export function scoreColour(score: number, invert = false): string {
  if (invert) {
    if (score >= 70) return "g";
    if (score >= 40) return "a";
    return "r";
  }
  if (score >= 70) return "r";
  if (score >= 40) return "a";
  return "g";
}

/** Status chip HTML */
export function chip(label: string, cls: "pass" | "warn" | "fail" | "info" | "neutral" | "excl" | "struct"): string {
  return `<span class="chip ${cls}">${esc(label)}</span>`;
}

/** Badge HTML */
export function badge(label: string, cls: "ok" | "warn" | "fail" | "info"): string {
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}
