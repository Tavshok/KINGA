/**
 * KINGA Report Design System — v8 (Approved Reference)
 *
 * Shared CSS for both the Claims Intelligence Report (Process tier)
 * and the Forensic Claim Decision Report (Forensic tier).
 *
 * Design tokens, cover structure, and all component classes match
 * the approved reference HTML files (kinga_claims_intelligence_report.html
 * and kinga_report_v7.html).
 */

export const KINGA_REPORT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

/* ── DESIGN TOKENS ──────────────────────────────────── */
:root {
  --ink:        #1a1a1a;
  --ink-mid:    #4a4a4a;
  --ink-light:  #888;
  --rule:       #e0e0e0;
  --rule-light: #efefef;
  --bg:         #ffffff;
  --bg-off:     #f9f9f9;
  --kinga:      #2E7D52;
  --kinga-lt:   #EAF4EE;
  --kinga-mid:  #C8E6D4;
  --red:        #B91C1C;
  --red-lt:     #FEF2F2;
  --amber:      #B45309;
  --amber-lt:   #FFFBEB;
  --amber-bdr:  #FDE68A;
  --green:      #166534;
  --green-lt:   #F0FDF4;
  --blue:       #1E40AF;
  --blue-lt:    #EFF6FF;
  --mono: 'IBM Plex Mono', monospace;
}

/* ── RESET ──────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 13px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: 'Inter', sans-serif; background: #f0f0f0; color: var(--ink); line-height: 1.5; }

/* ── REPORT SHELL ───────────────────────────────────── */
.report { max-width: 860px; margin: 24px auto; background: #ffffff; box-shadow: 0 1px 12px rgba(0,0,0,0.08); }

/* ── RUNNING HEADER / FOOTER ────────────────────────── */
.rh { display:flex; align-items:center; justify-content:space-between; padding:7px 28px; border-bottom:2px solid var(--kinga); font-size:9.5px; color:var(--ink-light); font-family:var(--mono); }
.rh .brand { font-weight:700; color:var(--kinga); letter-spacing:0.12em; text-transform:uppercase; font-family:'Inter',sans-serif; font-size:10px; }
.rf { padding:6px 28px; border-top:1px solid var(--rule); font-size:9px; color:var(--ink-light); display:flex; justify-content:space-between; font-family:var(--mono); }

/* ── PAGE ───────────────────────────────────────────── */
.page { padding:20px 28px 16px; border-bottom:1px solid var(--rule-light); }
.page:last-child { border-bottom:none; }

/* ── COVER ──────────────────────────────────────────── */
.cover-head { padding:24px 28px 16px; border-bottom:3px solid var(--kinga); display:flex; align-items:flex-end; justify-content:space-between; }
.cover-brand { font-size:9.5px; letter-spacing:0.18em; text-transform:uppercase; font-weight:700; color:var(--kinga); margin-bottom:4px; }
.cover-title { font-size:21px; font-weight:700; color:var(--ink); line-height:1.2; }
.cover-sub { font-size:10.5px; color:var(--ink-light); margin-top:3px; }
.cover-doc { text-align:right; font-family:var(--mono); font-size:9.5px; color:var(--ink-mid); line-height:1.9; }
.cover-doc strong { color:var(--ink); font-size:10.5px; }

/* Tier ribbon */
.tier-ribbon { font-size:9px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#fff; background:var(--ink-light); padding:3px 10px; display:inline-block; margin-top:5px; }

/* Meta grid */
.meta-grid { display:grid; grid-template-columns:repeat(3,1fr); border-bottom:1px solid var(--rule); }
.mg-cell { padding:10px 18px; border-right:1px solid var(--rule); }
.mg-cell:last-child { border-right:none; }
.mg-lbl { font-size:8.5px; text-transform:uppercase; letter-spacing:0.1em; color:var(--ink-light); font-weight:600; margin-bottom:2px; }
.mg-val { font-size:11.5px; font-weight:600; color:var(--ink); font-family:var(--mono); }

/* Cost snapshot */
.cost-snap { display:grid; grid-template-columns:repeat(3,1fr); border-bottom:1px solid var(--rule); }
.cs-cell { padding:11px 18px; border-right:1px solid var(--rule); }
.cs-cell:last-child { border-right:none; }
.cs-cell.hl { background:#f4faf6; }
.cs-lbl { font-size:8.5px; text-transform:uppercase; letter-spacing:0.1em; color:var(--ink-light); font-weight:600; margin-bottom:2px; }
.cs-cell.hl .cs-lbl { color:var(--kinga); }
.cs-val { font-size:18px; font-weight:700; color:var(--ink); font-family:var(--mono); line-height:1.1; }
.cs-cell.hl .cs-val { color:var(--kinga); }
.cs-val.g { color:var(--green); }
.cs-sub { font-size:9px; color:var(--ink-light); margin-top:2px; }

/* Verdict bar */
.verdict-bar { padding:12px 18px; display:flex; align-items:flex-start; gap:14px; border-bottom:1px solid var(--rule); }
.vbadge { display:inline-flex; align-items:center; gap:5px; padding:6px 12px; font-size:10.5px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; border:1.5px solid; white-space:nowrap; flex-shrink:0; }
.vbadge.review { border-color:var(--amber); color:var(--amber); background:#ffffff; }
.vbadge.approve { border-color:var(--green); color:var(--green); background:#ffffff; }
.vbadge.reject  { border-color:var(--red);   color:var(--red);   background:#ffffff; }
.vbody { flex:1; }
.vbody h3 { font-size:11.5px; font-weight:600; margin-bottom:3px; }
.vbody ul { font-size:10.5px; color:var(--ink-mid); padding-left:14px; }
.vbody ul li { margin-bottom:1px; }

/* Score strip */
.score-strip { display:grid; border-bottom:1px solid var(--rule); }
.score-strip.c4 { grid-template-columns:repeat(4,1fr); }
.score-strip.c6 { grid-template-columns:repeat(6,1fr); }
.ss-c { text-align:center; padding:10px 4px; border-right:1px solid var(--rule); }
.ss-c:last-child { border-right:none; }
.ss-n { font-size:18px; font-weight:700; line-height:1; margin-bottom:1px; }
.ss-n.g { color:var(--green); }
.ss-n.a { color:var(--amber); }
.ss-n.r { color:var(--red); }
.ss-l { font-size:8.5px; color:var(--ink-light); text-transform:uppercase; letter-spacing:0.05em; }

/* Contents index */
.contents { padding:12px 18px; border-bottom:1px solid var(--rule); }
.ct-title { font-size:8.5px; text-transform:uppercase; letter-spacing:0.12em; color:var(--ink-light); font-weight:700; margin-bottom:7px; }
.ct-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:3px 10px; }
.ci { display:flex; align-items:center; gap:5px; font-size:10px; }
.ci-n { font-family:var(--mono); font-size:9px; color:var(--ink-light); width:20px; flex-shrink:0; }
.ci-t { color:var(--ink-mid); font-weight:500; flex:1; }

/* ── SECTION HEADING ────────────────────────────────── */
.sh { background:#f8f8f8; border-left:3px solid var(--kinga); padding:6px 11px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; }
.sh-left { display:flex; align-items:center; gap:6px; }
.sh .sn { font-size:9.5px; color:var(--kinga); font-family:var(--mono); opacity:0.7; }
.sh h2 { font-size:12.5px; font-weight:700; color:var(--kinga); }
.sh .badge { font-size:9px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; padding:2px 7px; border:1px solid; }
.sh .badge.ok   { border-color:var(--green); color:var(--green); }
.sh .badge.warn { border-color:var(--amber); color:var(--amber); }
.sh .badge.fail { border-color:var(--red);   color:var(--red); }
.sh .badge.info { border-color:var(--blue);  color:var(--blue); }

/* Sub-heading */
.sub { display:flex; align-items:baseline; justify-content:space-between; margin:12px 0 6px; }
.sub h3 { font-size:11.5px; font-weight:600; color:var(--ink); }
.sub .sm { font-size:9.5px; color:var(--ink-light); font-family:var(--mono); }
.sm { font-size:9.5px; color:var(--ink-light); }

/* ── CHIPS ──────────────────────────────────────────── */
.chip { display:inline-block; padding:1px 6px; font-size:9px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; border:1px solid; }
.chip.pass    { border-color:#BBF7D0; color:var(--green); background:#ffffff; }
.chip.warn    { border-color:var(--amber-bdr); color:var(--amber); background:#ffffff; }
.chip.fail    { border-color:#FECACA; color:var(--red); background:#ffffff; }
.chip.info    { border-color:#BFDBFE; color:var(--blue); background:#ffffff; }
.chip.neutral { border-color:var(--rule); color:var(--ink-light); background:#f8f8f8; }
.chip.excl    { border-color:#FED7AA; color:#C2410C; background:#FFF7ED; }
.chip.struct  { border-color:#C4B5FD; color:#6D28D9; background:#F5F3FF; }

/* ── FINDING CARD ───────────────────────────────────── */
.fc { border-left:2.5px solid; padding:8px 11px; margin-bottom:8px; }
.fc.red    { border-color:var(--red);   background:#ffffff; }
.fc.amber  { border-color:var(--amber); background:#ffffff; }
.fc.green  { border-color:var(--green); background:#ffffff; }
.fc.neutral{ border-color:var(--rule);  background:#f8f8f8; }
.fc.blue   { border-color:var(--blue);  background:#ffffff; }
.fc-head { display:flex; align-items:center; gap:8px; margin-bottom:3px; }
.fc-code { font-family:var(--mono); font-size:9px; color:var(--ink-light); }
.fc-title { font-size:11px; font-weight:700; color:var(--ink); }
.fc ul { font-size:10.5px; color:var(--ink-mid); padding-left:14px; margin-top:3px; }
.fc ul li { margin-bottom:1px; }
.fc p { font-size:10.5px; color:var(--ink-mid); margin-top:2px; line-height:1.5; }
.fc-action { font-size:9.5px; font-weight:600; color:var(--amber); margin-top:4px; }
.fc-action.red { color:var(--red); }
.fc-action.green { color:var(--green); }

/* ── IMPOSSIBILITY FLAG ─────────────────────────────── */
.iflag { border-left:3px solid var(--amber); padding:11px 13px; margin-bottom:10px; background:#ffffff; }
.iflag-head { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
.iflag-id { font-family:var(--mono); font-size:9px; font-weight:700; color:var(--red); background:var(--red-lt); border:1px solid #FECACA; padding:1px 6px; }
.iflag-class { font-size:9px; text-transform:uppercase; letter-spacing:0.08em; color:var(--ink-light); }
.iflag-title { font-size:11px; font-weight:700; color:var(--ink); }
.iflag-body { font-size:10.5px; color:var(--ink-mid); margin-top:3px; line-height:1.5; }
.iflag-refs { font-family:var(--mono); font-size:9px; color:var(--ink-light); margin-top:4px; }
.iflag-score { font-size:9.5px; color:var(--ink-light); margin-top:3px; }

/* ── TABLES ─────────────────────────────────────────── */
table { width:100%; border-collapse:collapse; font-size:11px; margin-bottom:10px; }
thead tr { background:#f5f5f5; }
thead th { padding:6px 9px; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--ink-mid); border-bottom:1.5px solid var(--rule); text-align:left; white-space:nowrap; }
tbody tr { border-bottom:1px solid var(--rule-light); }
tbody tr:nth-child(even) { background:#fafafa; }
tbody td { padding:5px 9px; vertical-align:top; color:var(--ink-mid); }
tbody td:first-child { color:var(--ink); font-weight:600; }
.tm { font-family:var(--mono); font-size:10px; }
.tt { font-weight:700; background:#f4faf6; border-top:1.5px solid var(--kinga); }
.tr { text-align:right; }
.kinga-opt { background:#f4faf6 !important; font-weight:600; }

/* ── KPI BAND ───────────────────────────────────────── */
.kpi { display:grid; border:1px solid var(--rule); margin-bottom:10px; }
.kpi.c2 { grid-template-columns:repeat(2,1fr); }
.kpi.c3 { grid-template-columns:repeat(3,1fr); }
.kpi.c4 { grid-template-columns:repeat(4,1fr); }
.kpi.c5 { grid-template-columns:repeat(5,1fr); }
.kpi.c6 { grid-template-columns:repeat(6,1fr); }
.kpi-c { padding:10px 8px; border-right:1px solid var(--rule); text-align:center; }
.kpi-c:last-child { border-right:none; }
.kpi-v { font-size:19px; font-weight:700; line-height:1.1; font-family:var(--mono); }
.kpi-v.g { color:var(--green); }
.kpi-v.a { color:var(--amber); }
.kpi-v.r { color:var(--red); }
.kpi-l { font-size:8.5px; text-transform:uppercase; letter-spacing:0.06em; color:var(--ink-light); margin-top:2px; }
.kpi-s { font-size:9px; color:var(--ink-light); margin-top:1px; }

/* ── QUOTE CARDS ────────────────────────────────────── */
.quote-cards { display:grid; border:1px solid var(--rule); margin-bottom:10px; }
.quote-card { padding:11px 14px; border-right:1px solid var(--rule); }
.quote-card:last-child { border-right:none; }
.quote-card.hl { background:#f4faf6; }
.qc-label { font-size:8.5px; text-transform:uppercase; letter-spacing:0.1em; color:var(--ink-light); font-weight:600; margin-bottom:2px; }
.qc-amount { font-size:16px; font-weight:700; color:var(--ink); font-family:var(--mono); line-height:1.1; }
.qc-amount.g { color:var(--green); }
.qc-sub { font-size:9px; color:var(--ink-light); margin-top:2px; }

/* ── APPROVAL STAGES ────────────────────────────────── */
.stages { display:grid; grid-template-columns:repeat(5,1fr); border:1px solid var(--rule); margin-bottom:10px; }
.stage { padding:8px 6px; text-align:center; border-right:1px solid var(--rule); }
.stage:last-child { border-right:none; }
.stage-n { font-size:8.5px; text-transform:uppercase; letter-spacing:0.05em; color:var(--ink-light); font-weight:600; margin-bottom:2px; }
.stage-s { font-size:10px; font-weight:700; }
.stage-s.pending { color:var(--amber); }
.stage-s.done    { color:var(--green); }

/* ── WORKFLOW ───────────────────────────────────────── */
.workflow { display:flex; align-items:stretch; margin-bottom:10px; }
.wf-step { flex:1; text-align:center; padding:8px 6px; border:1px solid var(--rule); border-right:none; position:relative; }
.wf-step:last-child { border-right:1px solid var(--rule); }
.wf-step.active { background:#fffcf5; border-color:var(--amber); }
.wf-step.done   { background:#f6fdf8; border-color:var(--green); }
.wf-n { font-size:8.5px; color:var(--ink-light); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px; }
.wf-t { font-size:10px; font-weight:600; color:var(--ink); }
.wf-step.active .wf-t { color:var(--amber); }
.wf-step.done   .wf-t { color:var(--green); }
.wf-arrow { display:flex; align-items:center; color:var(--ink-light); font-size:10px; padding:0 2px; }

/* ── COMPONENT CHIPS ────────────────────────────────── */
.comp-chips { display:flex; flex-wrap:wrap; gap:3px; margin-bottom:8px; }
.cc { display:inline-flex; align-items:center; gap:2px; padding:1px 6px; font-size:9.5px; border:1px solid var(--rule); background:#f8f8f8; color:var(--ink-mid); font-weight:500; }
.cc.miss  { border-color:var(--amber-bdr); background:#fffcf5; color:var(--amber); }
.cc.extra { border-color:#BFDBFE; background:#f8faff; color:var(--blue); }

/* ── TWO-COL LAYOUT ─────────────────────────────────── */
.cols2   { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:10px; }
.cols2-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:10px; }

/* ── NARRATIVE QUOTE ────────────────────────────────── */
.nquote { border-left:2px solid var(--rule); padding:6px 12px; margin:8px 0; font-style:italic; font-size:11px; color:var(--ink-mid); background:#f8f8f8; }

/* ── LEAD TEXT ──────────────────────────────────────── */
.lead { font-size:11.5px; color:var(--ink-mid); line-height:1.6; margin-bottom:8px; }
.lead strong { color:var(--ink); font-weight:600; }

/* ── SECTION BRIDGE ─────────────────────────────────── */
.bridge { font-size:10px; color:var(--ink-light); font-style:italic; text-align:right; margin-top:6px; margin-bottom:0; padding-top:4px; border-top:1px solid var(--rule-light); }

/* ── DEFINITION ─────────────────────────────────────── */
.def-term { font-weight:700; color:var(--ink); font-size:11px; margin-top:8px; }
.def-desc { font-size:10.5px; color:var(--ink-mid); padding-left:10px; border-left:2px solid var(--kinga-mid); margin-top:2px; margin-bottom:6px; line-height:1.5; }

/* ── PHOTO GRID ─────────────────────────────────────── */
.photo-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:10px; }
.photo-card { border:1px solid var(--rule); }
.photo-thumb { width:100%; height:100px; background:#f5f5f5; display:flex; align-items:center; justify-content:center; font-size:10px; color:var(--ink-light); position:relative; overflow:hidden; }
.photo-thumb img { width:100%; height:100%; object-fit:cover; }
.photo-badge { position:absolute; top:4px; left:4px; font-family:var(--mono); font-size:9px; font-weight:600; background:rgba(0,0,0,0.65); color:#fff; padding:1px 5px; }
.photo-conf { position:absolute; top:4px; right:4px; font-size:9px; font-weight:600; background:rgba(0,0,0,0.65); color:#4ade80; padding:1px 5px; }
.photo-meta { padding:6px 8px; border-top:1px solid var(--rule); }
.photo-component { font-size:10px; font-weight:600; color:var(--ink); margin-bottom:3px; }
.photo-tags { display:flex; flex-wrap:wrap; gap:3px; }

/* ── DAMAGE ZONE MAP ────────────────────────────────── */
.zone-map-wrap { display:flex; gap:20px; align-items:flex-start; margin-bottom:10px; }
.zone-map-svg { flex-shrink:0; }
.zone-legend { flex:1; font-size:10.5px; }
.zl-row { display:flex; align-items:center; gap:6px; padding:4px 0; border-bottom:1px solid var(--rule-light); }
.zl-row:last-child { border-bottom:none; }

/* ── UPGRADE BANNER ─────────────────────────────────── */
.upgrade { display:flex; align-items:center; justify-content:space-between; gap:16px; border:1px solid var(--kinga-mid); background:var(--kinga-lt); padding:11px 16px; margin-top:4px; }
.upgrade-txt { font-size:10.5px; color:var(--ink-mid); line-height:1.5; }
.upgrade-txt strong { color:var(--kinga); font-weight:700; }
.upgrade-cta { font-size:9.5px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:var(--kinga); border:1.5px solid var(--kinga); padding:6px 12px; white-space:nowrap; flex-shrink:0; }

/* ── UTILITIES ──────────────────────────────────────── */
.mt8  { margin-top:8px; }
.mt12 { margin-top:12px; }
.mb8  { margin-bottom:8px; }
.mb0  { margin-bottom:0; }
.small { font-size:9.5px; color:var(--ink-light); }
.mono  { font-family:var(--mono); }
hr.div { border:none; border-top:1px solid var(--rule-light); margin:10px 0; }
.two-col { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
.two-col-3-2 { display:grid; grid-template-columns:3fr 2fr; gap:20px; }

@media print {
  body { background:#fff; }
  .report { box-shadow:none; margin:0; max-width:100%; }
  .page { page-break-inside:avoid; }
  .rh { page-break-after:avoid; }
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

/** Badge HTML (for section headings) */
export function badge(label: string, cls: "ok" | "warn" | "fail" | "info"): string {
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}
