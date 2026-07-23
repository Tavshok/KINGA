/**
 * KINGA Report Design System — Voltron Redesign
 *
 * CSS matches the approved reference: KINGA_Forensic_Report_Voltron_Redesign.html
 * Serif body, green section tabs, SVG charts, 4-page A4 layout.
 *
 * Legacy aliases at the bottom preserve compatibility with claimsIntelligenceReport.ts
 */
export const KINGA_REPORT_CSS = `
  :root{
    --ink:#171717;
    --ink-soft:#4a4a4a;
    --ink-faint:#8a8a8a;
    --hairline:#d9d9d9;
    --hairline-strong:#bdbdbd;
    --paper:#ffffff;
    --grey-50:#fafafa;
    --grey-100:#f2f2f2;
    --green:#3C7844;
    --green-dark:#2c5a33;
    --teal:#437D87;
    --amber:#b8720b;
    --amber-bg:#fbf1de;
    --red:#a83232;
    --red-bg:#fbe9e7;
    --green-bg:#e9f3ea;
    --blue:#3a6ea5;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{
    font-family:'Georgia', 'Times New Roman', serif;
    color:var(--ink);
    background:var(--grey-100);
    font-size:12.5px;
    line-height:1.45;
  }
  .sans{font-family:'Helvetica Neue', Arial, sans-serif;}
  .mono{font-family:'Courier New', monospace; font-variant-numeric: tabular-nums;}
  .tab{font-variant-numeric: tabular-nums;}

  .page{
    width:210mm;
    min-height:297mm;
    margin:6mm auto;
    background:var(--paper);
    padding:14mm 16mm;
    position:relative;
  }
  @media print{
    body{background:var(--paper);}
    .page{margin:0; box-shadow:none; width:auto; min-height:auto;}
    .no-print{display:none;}
    .page-break{page-break-before:always;}
  }
  @page{ size:A4; margin:12mm; }

  /* ---- Masthead ---- */
  .masthead{
    display:flex; justify-content:space-between; align-items:flex-start;
    border-bottom:2.5px solid var(--ink); padding-bottom:8px; margin-bottom:14px;
  }
  .masthead .brand{font-family:'Helvetica Neue',Arial,sans-serif; font-weight:800; letter-spacing:2px; font-size:13px;}
  .masthead .brand span{color:var(--green);}
  .masthead .doc-title{font-size:20px; font-weight:700; margin-top:2px;}
  .masthead .doc-sub{font-family:'Helvetica Neue',Arial,sans-serif; font-size:10px; color:var(--ink-soft); margin-top:2px;}
  .masthead .meta{text-align:right; font-family:'Helvetica Neue',Arial,sans-serif; font-size:10px; color:var(--ink-soft);}
  .masthead .meta .claimno{font-size:12px; color:var(--ink); font-weight:700; margin-bottom:2px;}
  .decision-chip{
    display:inline-block; font-family:'Helvetica Neue',Arial,sans-serif; font-weight:800; font-size:11px;
    letter-spacing:0.5px; padding:4px 10px; border-radius:2px; margin-top:6px;
  }
  .decision-chip.review{background:var(--amber-bg); color:var(--amber); border:1px solid var(--amber);}
  .decision-chip.approve{background:var(--green-bg); color:var(--green-dark); border:1px solid var(--green);}
  .decision-chip.reject{background:var(--red-bg); color:var(--red); border:1px solid var(--red);}

  /* ---- Scorecard strip ---- */
  .scorecard{
    display:grid; grid-template-columns:repeat(5,1fr); gap:0;
    border:1px solid var(--ink); margin-bottom:16px;
  }
  .score-cell{
    padding:9px 10px; border-right:1px solid var(--hairline-strong);
    text-align:center;
  }
  .score-cell:last-child{border-right:none;}
  .score-cell .label{font-family:'Helvetica Neue',Arial,sans-serif; font-size:8.5px; text-transform:uppercase; letter-spacing:0.6px; color:var(--ink-soft);}
  .score-cell .value{font-size:22px; font-weight:700; margin:2px 0; font-family:'Helvetica Neue',Arial,sans-serif;}
  .score-cell .sub{font-size:9px; color:var(--ink-soft); font-family:'Helvetica Neue',Arial,sans-serif;}
  .score-cell.good .value{color:var(--green);}
  .score-cell.warn .value{color:var(--amber);}
  .score-cell.bad .value{color:var(--red);}

  /* ---- Cost & verdict strip ---- */
  .verdict-strip{
    display:grid; grid-template-columns:repeat(6,1fr); gap:0;
    border:1px solid var(--hairline-strong); background:var(--grey-50); margin-bottom:16px;
  }
  .verdict-cell{
    padding:8px 9px; border-right:1px solid var(--hairline);
    text-align:center;
  }
  .verdict-cell:last-child{border-right:none;}
  .verdict-cell.accent{background:var(--green-bg);}
  .verdict-cell .label{font-family:'Helvetica Neue',Arial,sans-serif; font-size:8px; text-transform:uppercase; letter-spacing:0.4px; color:var(--ink-soft);}
  .verdict-cell .value{font-size:17px; font-weight:700; margin:2px 0; font-family:'Helvetica Neue',Arial,sans-serif; color:var(--ink);}
  .verdict-cell .sub{font-size:8px; color:var(--ink-soft); font-family:'Helvetica Neue',Arial,sans-serif;}

  /* ---- Section header (green tab) ---- */
  .section{margin-bottom:16px;}
  .section-tab{
    display:flex; align-items:center; gap:8px;
    background:var(--green); color:#fff;
    font-family:'Helvetica Neue',Arial,sans-serif; font-weight:700; font-size:11px;
    letter-spacing:0.6px; text-transform:uppercase;
    padding:5px 10px; margin-bottom:8px;
  }
  .section-tab .num{
    background:rgba(255,255,255,0.25); border-radius:2px; padding:1px 6px; font-size:10px;
  }
  .section-tab .flag-right{
    margin-left:auto; font-size:9.5px; font-weight:700; text-transform:none;
    padding:1px 7px; border-radius:2px; letter-spacing:0.2px;
  }
  .section-tab .flag-right.high{background:#fff; color:var(--red);}
  .section-tab .flag-right.mid{background:rgba(255,255,255,0.9); color:var(--amber);}
  .section-tab .flag-right.ok{background:rgba(255,255,255,0.9); color:var(--green-dark);}

  /* ---- Generic layout helpers ---- */
  .cols-2{display:grid; grid-template-columns:1fr 1fr; gap:14px;}
  .cols-3{display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;}
  .box{border:1px solid var(--hairline-strong); padding:10px 12px;}
  .box h4{
    font-family:'Helvetica Neue',Arial,sans-serif; font-size:9.5px; text-transform:uppercase;
    letter-spacing:0.5px; color:var(--ink-soft); margin:0 0 7px 0; border-bottom:1px solid var(--hairline); padding-bottom:5px;
  }

  table{border-collapse:collapse; width:100%; font-size:11.5px;}
  table.kv td{padding:3px 0; vertical-align:top;}
  table.kv td.k{color:var(--ink-soft); font-family:'Helvetica Neue',Arial,sans-serif; font-size:10px; width:44%;}
  table.kv td.v{font-weight:600; text-align:right;}
  table.kv tr + tr td{border-top:1px dotted var(--hairline);}

  table.grid-t{border:1px solid var(--hairline-strong);}
  table.grid-t th{
    background:var(--ink); color:#fff; font-family:'Helvetica Neue',Arial,sans-serif;
    font-size:9px; text-transform:uppercase; letter-spacing:0.4px; text-align:left; padding:6px 8px;
  }
  table.grid-t td{padding:6px 8px; border-top:1px solid var(--hairline);}
  table.grid-t tr:nth-child(even) td{background:var(--grey-50);}
  table.grid-t td.num{text-align:right; font-family:'Helvetica Neue',Arial,sans-serif;}

  .pill{display:inline-block; font-family:'Helvetica Neue',Arial,sans-serif; font-size:8.5px; font-weight:700;
    padding:1px 6px; border-radius:2px; letter-spacing:0.3px;}
  .pill.green{background:var(--green-bg); color:var(--green-dark);}
  .pill.amber{background:var(--amber-bg); color:var(--amber);}
  .pill.red{background:var(--red-bg); color:var(--red);}
  .pill.grey{background:var(--grey-100); color:var(--ink-soft); border:1px solid var(--hairline-strong);}

  .callout{border-left:3px solid var(--ink); padding:7px 10px; font-size:11px; margin-top:8px; background:var(--grey-50);}
  .callout.amber{border-color:var(--amber); background:var(--amber-bg);}
  .callout.red{border-color:var(--red); background:var(--red-bg);}
  .callout.green{border-color:var(--green); background:var(--green-bg);}
  .callout b{font-family:'Helvetica Neue',Arial,sans-serif;}

  .small{font-size:10px; color:var(--ink-soft);}
  .caption{font-family:'Helvetica Neue',Arial,sans-serif; font-size:9px; color:var(--ink-faint); margin-top:4px;}

  .footer-strip{
    position:absolute; bottom:8mm; left:16mm; right:16mm;
    display:flex; justify-content:space-between; font-family:'Helvetica Neue',Arial,sans-serif;
    font-size:8px; color:var(--ink-faint); border-top:1px solid var(--hairline); padding-top:4px;
  }

  /* bar chart */
  .barchart{display:flex; align-items:flex-end; gap:10px; height:110px; padding:6px 4px 0;}
  .bar-col{flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%;}
  .bar-col .bar{width:60%; background:var(--teal); position:relative;}
  .bar-col .lbl{font-family:'Helvetica Neue',Arial,sans-serif; font-size:8px; color:var(--ink-soft); margin-top:4px; text-align:center;}
  .bar-col .val{font-family:'Helvetica Neue',Arial,sans-serif; font-size:9.5px; font-weight:700; margin-bottom:3px;}
  .thresh-marker{position:absolute; left:-6px; right:-6px; border-top:2px dashed var(--ink-faint);}

  /* damage severity stacked bar */
  .stackbar{display:flex; height:22px; width:100%; border:1px solid var(--hairline-strong); overflow:hidden;}
  .stackbar div{display:flex; align-items:center; justify-content:center; font-family:'Helvetica Neue',Arial,sans-serif; color:#fff; font-size:9px; font-weight:700;}

  ul.tight{margin:4px 0 0 0; padding-left:16px;}
  ul.tight li{margin-bottom:3px;}

  .qbar-row{display:flex; align-items:center; gap:8px; margin-bottom:5px;}
  .qbar-row .name{width:150px; font-family:'Helvetica Neue',Arial,sans-serif; font-size:9.5px;}
  .qbar-row .track{flex:1; background:var(--grey-100); height:12px; position:relative;}
  .qbar-row .fill{background:var(--blue); height:100%;}
  .qbar-row .amt{width:70px; text-align:right; font-family:'Helvetica Neue',Arial,sans-serif; font-size:9.5px; font-weight:700;}

  /* photo evidence grid */
  .photo-zone{display:grid; grid-template-columns:1.35fr 1fr; gap:14px; margin-top:8px;}
  .photo-grid{display:grid; grid-template-columns:1fr 1fr; gap:8px;}
  .photo-tile{border:1px solid var(--hairline-strong);}
  .photo-ph{position:relative; width:100%; height:95px; background:#ececec; overflow:hidden;}
  .photo-ph svg{width:100%; height:100%; display:block;}
  .photo-ph .tag{
    position:absolute; top:4px; left:4px; background:var(--ink); color:#fff;
    font-family:'Helvetica Neue',Arial,sans-serif; font-size:8px; font-weight:700;
    padding:1px 5px; border-radius:2px;
  }
  .photo-cap{font-family:'Helvetica Neue',Arial,sans-serif; font-size:8px; color:var(--ink-soft); padding:4px 6px; border-top:1px solid var(--hairline);}
  .photo-ph.dark{background:#2a2a2a;}
  .photo-meta{display:flex; flex-direction:column; justify-content:flex-start;}
  .zone-row{display:flex; align-items:center; gap:10px; padding:6px 2px; border-top:1px dotted var(--hairline);}
  .zone-row:first-child{border-top:none;}
  .zone-name{font-family:'Helvetica Neue',Arial,sans-serif; font-size:10px; font-weight:700; width:110px;}
  .zone-note{font-size:9.5px; color:var(--ink-soft); flex:1;}

  /* ── LEGACY ALIASES for claimsIntelligenceReport.ts compatibility ── */
  /* These keep the CIR report working while FDR uses the new design above */
  :root {
    --text: var(--ink);
    --text-muted: var(--ink-soft);
    --text-sm: var(--ink-faint);
    --border: var(--hairline);
    --bg-body: var(--paper);
    --bg-section: var(--grey-50);
    --kinga-green: var(--green);
    --bg-kinga-opt: var(--green-bg);
  }
  .report { max-width: 900px; margin: 0 auto; }
  .rh { display:flex; align-items:center; justify-content:space-between; padding:6px 18px; background:var(--grey-50); border-bottom:1px solid var(--hairline); font-family:'Helvetica Neue',Arial,sans-serif; font-size:9px; color:var(--ink-faint); }
  .rh .brand { font-weight:700; color:var(--green); letter-spacing:1px; }
  .sh { display:flex; align-items:center; justify-content:space-between; padding:10px 18px; border-bottom:2px solid var(--ink); }
  .sh-left { display:flex; align-items:center; gap:10px; }
  .sn { font-family:'Helvetica Neue',Arial,sans-serif; font-size:11px; font-weight:700; color:var(--green); border:1.5px solid var(--green); padding:2px 7px; }
  .sh h2 { font-size:14px; font-weight:700; margin:0; }
  .badge { font-family:'Helvetica Neue',Arial,sans-serif; font-size:9px; font-weight:700; padding:3px 8px; border-radius:2px; }
  .badge.ok { background:var(--green-bg); color:var(--green-dark); }
  .badge.warn { background:var(--amber-bg); color:var(--amber); }
  .badge.fail { background:var(--red-bg); color:var(--red); }
  .chip { font-family:'Helvetica Neue',Arial,sans-serif; font-size:8.5px; font-weight:700; padding:1px 6px; border-radius:2px; }
  .chip.pass { background:var(--green-bg); color:var(--green-dark); }
  .chip.warn { background:var(--amber-bg); color:var(--amber); }
  .chip.fail { background:var(--red-bg); color:var(--red); }
  .chip.info { background:#eff6ff; color:#1d4ed8; }
  .chip.neutral { background:var(--grey-100); color:var(--ink-soft); }
  .chip.excl { background:var(--red-bg); color:var(--red); }
  .chip.struct { background:#fdf4ff; color:#7e22ce; }
  .lead { padding:10px 18px; font-size:12px; color:var(--ink-soft); border-bottom:1px solid var(--hairline); }
  .two-col { display:grid; grid-template-columns:1fr 1fr; gap:0; }
  .two-col > div { padding:12px 18px; border-right:1px solid var(--hairline); }
  .two-col > div:last-child { border-right:none; }
  .sub { display:flex; align-items:baseline; gap:8px; padding:8px 18px 4px; border-bottom:1px solid var(--hairline); }
  .sub h3 { font-size:11px; font-weight:700; margin:0; }
  .sm { font-size:9px; color:var(--ink-faint); font-family:'Helvetica Neue',Arial,sans-serif; }
  .kpi { display:grid; }
  .kpi.c2 { grid-template-columns:repeat(2,1fr); }
  .kpi.c3 { grid-template-columns:repeat(3,1fr); }
  .kpi.c4 { grid-template-columns:repeat(4,1fr); }
  .kpi-c { padding:14px 16px; border-right:1px solid var(--hairline); text-align:center; }
  .kpi-c:last-child { border-right:none; }
  .kpi-v { font-size:18px; font-weight:700; font-family:'Helvetica Neue',Arial,sans-serif; }
  .kpi-v.g { color:var(--green); }
  .kpi-v.a { color:var(--amber); }
  .kpi-v.r { color:var(--red); }
  .kpi-l { font-size:9px; color:var(--ink-soft); font-family:'Helvetica Neue',Arial,sans-serif; text-transform:uppercase; letter-spacing:0.05em; }
  .kpi-s { font-size:8.5px; color:var(--ink-faint); font-family:'Helvetica Neue',Arial,sans-serif; }
  .fc { padding:10px 14px; margin:8px 18px; border-left:3px solid var(--hairline-strong); background:var(--grey-50); }
  .fc.green { border-color:var(--green); background:var(--green-bg); }
  .fc.amber { border-color:var(--amber); background:var(--amber-bg); }
  .fc.red { border-color:var(--red); background:var(--red-bg); }
  .fc.blue { border-color:var(--blue); background:#eff6ff; }
  .fc-head { display:flex; align-items:center; gap:8px; margin-bottom:5px; }
  .fc-title { font-size:11px; font-weight:700; }
  .fc-action { font-size:10px; font-weight:700; color:var(--amber); margin-top:6px; font-family:'Helvetica Neue',Arial,sans-serif; }
  .fc p, .fc ul { font-size:11px; margin:0; }
  .fc ul { padding-left:14px; }
  .bridge { padding:8px 18px; font-size:10px; color:var(--ink-faint); font-family:'Helvetica Neue',Arial,sans-serif; border-top:1px solid var(--hairline); text-align:right; }
  .iflag { margin:8px 18px; border:2px solid var(--red); }
  .iflag-head { display:flex; align-items:center; gap:8px; padding:6px 12px; background:var(--red-bg); border-bottom:1px solid var(--red); }
  .iflag-id { font-family:'Helvetica Neue',Arial,sans-serif; font-size:10px; font-weight:700; color:var(--red); border:1.5px solid var(--red); padding:1px 6px; }
  .iflag-class { font-size:10px; color:var(--red); font-family:'Helvetica Neue',Arial,sans-serif; }
  .iflag-title { padding:8px 12px 4px; font-size:12px; font-weight:700; }
  .iflag-body { padding:4px 12px 8px; font-size:11px; }
  .iflag-refs { padding:4px 12px 8px; font-size:10px; color:var(--ink-faint); font-family:'Helvetica Neue',Arial,sans-serif; border-top:1px solid var(--hairline); }
  .at-high td { background:#fff8f8 !important; }
  .at-medium td { background:#fffdf0 !important; }
  .bold { font-weight:700; }
  .tm { font-family:'Courier New',monospace; font-variant-numeric:tabular-nums; }
  .tr { text-align:right; }
  .mono-val { font-family:'Courier New',monospace; }
  .rf { padding:8px 18px; font-size:8.5px; color:var(--ink-faint); font-family:'Helvetica Neue',Arial,sans-serif; border-top:1px solid var(--hairline); display:flex; justify-content:space-between; margin-top:16px; }
  .score-strip { display:grid; border:1px solid var(--hairline); border-top:none; }
  .score-strip.c6 { grid-template-columns:repeat(6,1fr); }
  .ss-c { text-align:center; padding:10px 4px; border-right:1px solid var(--hairline); }
  .ss-c:last-child { border-right:none; }
  .ss-n { font-size:18px; font-weight:700; line-height:1; margin-bottom:1px; font-family:'Helvetica Neue',Arial,sans-serif; }
  .ss-n.g { color:var(--green); }
  .ss-n.a { color:var(--amber); }
  .ss-n.r { color:var(--red); }
  .ss-l { font-size:8.5px; color:var(--ink-faint); text-transform:uppercase; letter-spacing:0.05em; font-family:'Helvetica Neue',Arial,sans-serif; }
  .meta-grid { display:grid; grid-template-columns:repeat(3,1fr); border-bottom:1px solid var(--hairline); }
  .mg-cell { padding:10px 18px; border-right:1px solid var(--hairline); }
  .mg-cell:last-child { border-right:none; }
  .mg-lbl { font-size:8.5px; text-transform:uppercase; letter-spacing:0.1em; color:var(--ink-soft); font-weight:600; margin-bottom:2px; font-family:'Helvetica Neue',Arial,sans-serif; }
  .mg-val { font-size:11.5px; font-weight:600; color:var(--ink); font-family:'Courier New',monospace; }
  .cs-cell { padding:11px 18px; border-right:1px solid var(--hairline); }
  .cs-cell:last-child { border-right:none; }
  .cs-cell.hl { background:var(--green-bg); }
  .cs-lbl { font-size:8.5px; text-transform:uppercase; letter-spacing:0.1em; color:var(--ink-soft); font-weight:600; margin-bottom:2px; font-family:'Helvetica Neue',Arial,sans-serif; }
  .cs-cell.hl .cs-lbl { color:var(--green); }
  .cs-val { font-size:18px; font-weight:700; color:var(--ink); font-family:'Helvetica Neue',Arial,sans-serif; line-height:1.1; }
  .cs-cell.hl .cs-val { color:var(--green); }
  .cs-val.g { color:var(--green); }
  .cs-sub { font-size:9px; color:var(--ink-soft); margin-top:2px; font-family:'Helvetica Neue',Arial,sans-serif; }
  .vbadge { display:inline-flex; align-items:center; gap:5px; padding:6px 12px; font-size:10.5px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; border:1.5px solid; white-space:nowrap; flex-shrink:0; font-family:'Helvetica Neue',Arial,sans-serif; }
  .vbadge.review { border-color:var(--amber); color:var(--amber); background:#ffffff; }
  .vbadge.approve { border-color:var(--green); color:var(--green); background:#ffffff; }
  .vbadge.reject { border-color:var(--red); color:var(--red); background:#ffffff; }
  .vbody { flex:1; }
  .vbody h3 { font-size:11.5px; font-weight:600; margin-bottom:3px; }
  .vbody ul { font-size:10.5px; color:var(--ink-soft); padding-left:14px; }
  .vbody ul li { margin-bottom:1px; }
  .contents { padding:12px 18px; border-bottom:1px solid var(--hairline); }
  .ct-title { font-size:8.5px; text-transform:uppercase; letter-spacing:0.12em; color:var(--ink-soft); font-weight:700; margin-bottom:7px; font-family:'Helvetica Neue',Arial,sans-serif; }
  .ct-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:3px 10px; }
  .ci { display:flex; align-items:center; gap:5px; font-size:10px; }
  .ci-n { font-family:'Courier New',monospace; font-size:9px; color:var(--ink-soft); width:20px; flex-shrink:0; }
  .ci-t { color:var(--ink-soft); font-weight:500; flex:1; }
  .cover-head-legacy { padding:24px 28px 16px; border-bottom:3px solid var(--green); display:flex; align-items:flex-end; justify-content:space-between; }
  .workflow { display:flex; gap:0; border:1px solid var(--hairline); }
  .wf-step { flex:1; padding:10px 8px; border-right:1px solid var(--hairline); text-align:center; }
  .wf-step:last-child { border-right:none; }
  .wf-step.active { background:var(--green-bg); }
  .wf-num { font-family:'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:700; color:var(--ink-soft); }
  .wf-step.active .wf-num { color:var(--green); }
  .wf-name { font-size:10px; font-weight:700; margin:2px 0; }
  .wf-sub { font-size:9px; color:var(--ink-faint); font-family:'Helvetica Neue',Arial,sans-serif; }
  .speed-scale-wrap { padding:8px 18px; }
  .zone-map-wrap { display:flex; gap:16px; padding:8px 18px; }
  .zone-map-svg { flex-shrink:0; }
  .zone-legend { flex:1; display:flex; flex-direction:column; gap:8px; justify-content:center; }
  .zone-legend-item { display:flex; align-items:flex-start; gap:8px; font-size:10.5px; }
  .zone-dot { width:12px; height:12px; border-radius:50%; flex-shrink:0; margin-top:2px; }
  .zone-dot.sev-critical { background:var(--red); }
  .zone-dot.sev-severe { background:var(--amber); }
  .zone-dot.sev-moderate { background:#6b7280; }
  .zone-dot.sev-minor { background:var(--grey-100); border:1px solid var(--hairline-strong); }
  .photo-grid-legacy { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; padding:8px 18px; }
  .zl-row { display:flex; align-items:center; gap:10px; padding:6px 18px; border-top:1px dotted var(--hairline); }
  .zl-zone { font-family:'Helvetica Neue',Arial,sans-serif; font-size:10px; font-weight:700; width:120px; flex-shrink:0; }
  .stages { display:flex; gap:0; border:1px solid var(--hairline); margin:8px 18px; }
  .stage { flex:1; padding:10px 8px; border-right:1px solid var(--hairline); text-align:center; }
  .stage:last-child { border-right:none; }
  .stage.active { background:var(--green-bg); }
  .defs-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:8px 18px; }
  .def-item { border-left:2px solid var(--hairline-strong); padding-left:8px; }
  .def-term { font-size:10px; font-weight:700; font-family:'Helvetica Neue',Arial,sans-serif; margin-bottom:2px; }
  .def-body { font-size:10px; color:var(--ink-soft); }
  .quote-cards { display:flex; gap:8px; padding:8px 18px; flex-wrap:wrap; }
  .quote-card { flex:1; min-width:120px; border:1px solid var(--hairline); padding:10px 12px; }
  .quote-card.kinga { border-color:var(--green); background:var(--green-bg); }
  .qc-label { font-size:9px; font-family:'Helvetica Neue',Arial,sans-serif; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; }
  .qc-amount { font-size:16px; font-weight:700; font-family:'Helvetica Neue',Arial,sans-serif; }
  .qc-amount.green { color:var(--green); }
  .qc-sub { font-size:9px; color:var(--ink-faint); margin-top:2px; font-family:'Helvetica Neue',Arial,sans-serif; }
  .verdict-bar { display:flex; align-items:center; gap:14px; padding:10px 18px; border-top:1px solid var(--hairline); border-bottom:1px solid var(--hairline); background:var(--grey-50); }
  .verdict-label { font-size:9px; text-transform:uppercase; letter-spacing:0.1em; color:var(--ink-soft); font-family:'Helvetica Neue',Arial,sans-serif; font-weight:700; }
  .verdict-value { font-size:18px; font-weight:700; font-family:'Helvetica Neue',Arial,sans-serif; }
  .verdict-value.green { color:var(--green); }
  .verdict-value.amber { color:var(--amber); }
  .verdict-value.red { color:var(--red); }
  .cover { background:#0f0e0c; color:#f5f5f0; }
  .cover-head { padding:28px 28px 16px; border-bottom:1px solid #2a2a28; display:flex; align-items:flex-start; justify-content:space-between; }
  .cover-brand { font-family:'Helvetica Neue',Arial,sans-serif; font-weight:800; letter-spacing:3px; font-size:11px; color:#8a8a80; text-transform:uppercase; margin-bottom:6px; }
  .cover-title { font-size:22px; font-weight:700; color:#f5f5f0; line-height:1.2; }
  .cover-sub { font-size:10px; color:#6a6a60; font-family:'Helvetica Neue',Arial,sans-serif; margin-top:4px; }
  .cover-doc { text-align:right; font-family:'Helvetica Neue',Arial,sans-serif; font-size:10px; color:#6a6a60; }
  .cover-meta { display:grid; grid-template-columns:repeat(4,1fr); border-top:1px solid #2a2a28; }
  .cover-meta-cell { padding:12px 18px; border-right:1px solid #2a2a28; }
  .cover-meta-cell:last-child { border-right:none; }
  .cover-meta-label { font-size:8.5px; text-transform:uppercase; letter-spacing:0.1em; color:#6a6a60; font-family:'Helvetica Neue',Arial,sans-serif; margin-bottom:3px; }
  .cover-meta-value { font-size:12px; font-weight:600; color:#f5f5f0; }
  .cost-snap { display:grid; grid-template-columns:repeat(3,1fr); border-top:1px solid #2a2a28; }
  .cost-snap-cell { padding:14px 18px; border-right:1px solid #2a2a28; }
  .cost-snap-cell:last-child { border-right:none; }
  .cost-snap-label { font-size:8.5px; text-transform:uppercase; letter-spacing:0.1em; color:#6a6a60; font-family:'Helvetica Neue',Arial,sans-serif; margin-bottom:4px; }
  .cost-snap-value { font-size:20px; font-weight:700; color:#f5f5f0; font-family:'Helvetica Neue',Arial,sans-serif; }
  .cost-snap-value.green { color:#4ade80; }
  .cost-snap-sub { font-size:9px; color:#6a6a60; font-family:'Helvetica Neue',Arial,sans-serif; margin-top:2px; }
  .contents-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:#2a2a28; border-top:1px solid #2a2a28; }
  .contents-item { background:#0f0e0c; padding:8px 12px; display:flex; align-items:center; gap:6px; }
  .contents-ref { font-family:'Helvetica Neue',Arial,sans-serif; font-size:9px; color:#6a6a60; width:22px; flex-shrink:0; }
  .contents-name { font-size:10px; color:#c0c0b8; flex:1; }
  .contents-status { font-size:8.5px; font-family:'Helvetica Neue',Arial,sans-serif; color:#4ade80; }
  .tier-ribbon { font-family:'Helvetica Neue',Arial,sans-serif; font-size:9px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#4ade80; border:1px solid #4ade80; padding:2px 8px; display:inline-block; }
  .page { border:1px solid var(--hairline); }
  @media print {
    body { background: var(--paper); }
    .page { border:none; }
  }
`;

/**
 * FDR-only CSS: strips CIR-only classes that are dead weight in every FDR export.
 * Removed: .score-strip, .ss-c/n/l, .meta-grid, .mg-*, .vbadge, .vbody, .contents, .ct-*, .ci, .ci-n, .ci-t, .cover-head
 */
export const KINGA_FDR_CSS = KINGA_REPORT_CSS
  .replace(/\.score-strip[^{]*\{[^}]*\}/g, '')
  .replace(/\.ss-c[^{]*\{[^}]*\}/g, '')
  .replace(/\.ss-n[^{]*\{[^}]*\}/g, '')
  .replace(/\.ss-l[^{]*\{[^}]*\}/g, '')
  .replace(/\.meta-grid[^{]*\{[^}]*\}/g, '')
  .replace(/\.mg-cell[^{]*\{[^}]*\}/g, '')
  .replace(/\.mg-lbl[^{]*\{[^}]*\}/g, '')
  .replace(/\.mg-val[^{]*\{[^}]*\}/g, '')
  .replace(/\.vbadge[^{]*\{[^}]*\}/g, '')
  .replace(/\.vbody[^{]*\{[^}]*\}/g, '')
  .replace(/\.contents[^{]*\{[^}]*\}/g, '')
  .replace(/\.ct-title[^{]*\{[^}]*\}/g, '')
  .replace(/\.ct-grid[^{]*\{[^}]*\}/g, '')
  .replace(/\.ci-n[^{]*\{[^}]*\}/g, '')
  .replace(/\.ci-t[^{]*\{[^}]*\}/g, '')
  .replace(/\.ci\s*\{[^}]*\}/g, '')
  .replace(/\.cover-head\s*\{[^}]*\}/g, '');

/** Build FDR HTML using the stripped FDR-only CSS (no dead CIR classes) */
export function buildKingaFdrHtml(
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
<style>${KINGA_FDR_CSS}</style>
</head>
<body>
<div class="report">
${body}
</div>
${extraScripts}
</body>
</html>`;
}

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

/** Format currency with dynamic currency code (defaults to USD) */
export function fmtCurrency(val: unknown, currencyCode?: string | null): string {
  const n = Number(val ?? 0);
  if (isNaN(n)) return "—";
  const code = (currencyCode && /^[A-Z]{3}$/.test(String(currencyCode).trim().toUpperCase()))
    ? String(currencyCode).trim().toUpperCase()
    : "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: code,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(n);
  } catch {
    // Fallback for unsupported currency codes
    return `${code} ${n.toFixed(2)}`;
  }
}

/** Format currency (USD default) — kept for backwards compatibility */
export function fmtUSD(val: unknown): string {
  return fmtCurrency(val, "USD");
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

/** Status chip HTML (legacy CIR compatibility) */
export function chip(label: string, cls: "pass" | "warn" | "fail" | "info" | "neutral" | "excl" | "struct"): string {
  return `<span class="chip ${cls}">${esc(label)}</span>`;
}

/** Badge HTML (legacy CIR compatibility) */
export function badge(label: string, cls: "ok" | "warn" | "fail" | "info"): string {
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

/** Pill HTML (new Voltron design) */
export function pill(label: string, cls: "green" | "amber" | "red" | "grey"): string {
  return `<span class="pill ${cls}">${esc(label)}</span>`;
}

/** Callout HTML (new Voltron design) */
export function callout(content: string, variant: "default" | "amber" | "red" | "green" = "default"): string {
  const cls = variant === "default" ? "" : ` ${variant}`;
  return `<div class="callout${cls}">${content}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW SHARED HELPERS — added July 2026
// All table/SVG-safe (no CSS flex/grid widths that break PDF renderers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BarTable — renders a multi-column bar comparison as a pure HTML table.
 * Each row is one component; each column is one repairer or KINGA.
 * Bars are rendered as a nested table with a fixed-width filled cell (no CSS width%).
 *
 * @param rows   Array of { label, values: [{name, amount, isKinga?}] }
 * @param maxVal The maximum amount across all rows (for bar scaling)
 * @param barMaxPx The pixel width of a full bar (default 120)
 */
export function barTable(
  rows: Array<{ label: string; values: Array<{ name: string; amount: number; isKinga?: boolean }> }>,
  maxVal: number,
  barMaxPx = 120
): string {
  if (!rows.length) return "";
  const allNames = rows[0].values.map(v => v.name);
  const headerCells = allNames.map(n => `<th style="text-align:right;padding:4px 8px;font-size:10px;color:#4a4a4a">${esc(n)}</th>`).join("");
  const bodyRows = rows.map(row => {
    const cells = row.values.map(v => {
      const barW = maxVal > 0 ? Math.round((v.amount / maxVal) * barMaxPx) : 0;
      const colour = v.isKinga ? "#3C7844" : "#437D87";
      const barHtml = `<table cellspacing="0" cellpadding="0" style="display:inline-table;vertical-align:middle"><tr>
        <td style="width:${barW}px;height:8px;background:${colour};border-radius:2px"></td>
        <td style="padding-left:4px;font-size:10px;white-space:nowrap;color:${v.isKinga ? "#3C7844" : "#171717"};font-weight:${v.isKinga ? "700" : "400"}">${fmtUSD(v.amount)}</td>
      </tr></table>`;
      return `<td style="padding:4px 8px;text-align:right">${barHtml}</td>`;
    }).join("");
    return `<tr style="border-bottom:1px solid #e8e8e8">
      <td style="padding:4px 8px;font-size:11px;color:#171717">${esc(row.label)}</td>
      ${cells}
    </tr>`;
  }).join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead><tr style="border-bottom:2px solid #d9d9d9">
      <th style="text-align:left;padding:4px 8px;font-size:10px;color:#4a4a4a">Component</th>
      ${headerCells}
    </tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>`;
}

/**
 * ScoreCell — renders a score number with colour coding in a table cell.
 * @param score 0–100
 * @param label Label below the score
 * @param invert If true, high score = green (e.g. data completeness)
 */
export function scoreCell(score: number, label: string, invert = false): string {
  const colour = invert
    ? (score >= 70 ? "#3C7844" : score >= 40 ? "#b8720b" : "#a83232")
    : (score >= 70 ? "#a83232" : score >= 40 ? "#b8720b" : "#3C7844");
  return `<td style="text-align:center;padding:8px 12px;border-right:1px solid #e8e8e8">
    <div style="font-size:22px;font-weight:700;color:${colour};font-family:monospace">${score}</div>
    <div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px">${esc(label)}</div>
  </td>`;
}

/**
 * PhotoZonePanel — renders photo thumbnails in a table-based grid.
 * @param photos Array of { url, zone, caption, usable }
 * @param cols   Number of columns (default 4)
 */
export function photoZonePanel(
  photos: Array<{ url: string; zone?: string; caption?: string; usable?: boolean }>,
  cols = 4
): string {
  if (!photos.length) return `<p style="color:#8a8a8a;font-size:11px;font-style:italic">No photographs available for this claim.</p>`;
  const cells = photos.map(p => {
    const border = p.usable === false ? "2px solid #a83232" : "1px solid #d9d9d9";
    const zoneLabel = p.zone ? `<div style="font-size:9px;color:#437D87;text-transform:uppercase;letter-spacing:0.4px;margin-top:3px">${esc(p.zone)}</div>` : "";
    const caption = p.caption ? `<div style="font-size:9px;color:#4a4a4a;margin-top:2px">${esc(p.caption)}</div>` : "";
    const unusable = p.usable === false ? `<div style="font-size:9px;color:#a83232;font-weight:600;margin-top:2px">Low quality</div>` : "";
    return `<td style="padding:4px;vertical-align:top">
      <img src="${esc(p.url)}" style="width:100%;height:70px;object-fit:cover;border:${border};border-radius:2px;display:block" />
      ${zoneLabel}${caption}${unusable}
    </td>`;
  });
  // Pad to fill last row
  const remainder = photos.length % cols;
  if (remainder > 0) {
    for (let i = 0; i < cols - remainder; i++) cells.push(`<td></td>`);
  }
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += cols) {
    rows.push(`<tr>${cells.slice(i, i + cols).join("")}</tr>`);
  }
  return `<table style="width:100%;border-collapse:collapse"><tbody>${rows.join("")}</tbody></table>`;
}

/**
 * physicsIndicator — light pass/fail pill for Process tier.
 * Shows only a status signal; no ΔV, no methodology.
 * Anomaly state includes an active CTA to the Forensic Report.
 */
export function physicsIndicator(
  anomalyScore: number,
  claimRef: string
): string {
  const isAnomaly = anomalyScore > 30;
  if (isAnomaly) {
    return `<div style="border:1px solid #b8720b;background:#fbf1de;border-radius:3px;padding:10px 14px;margin:8px 0">
      <table style="width:100%;border-collapse:collapse"><tr>
        <td style="vertical-align:middle;width:1%">
          <span style="display:inline-block;background:#b8720b;color:#fff;font-size:9px;font-weight:700;padding:2px 7px;border-radius:2px;white-space:nowrap;text-transform:uppercase">Physics Check: Anomaly Detected</span>
        </td>
        <td style="padding-left:12px;font-size:11px;color:#4a4a4a">
          Automated physics screening identified an anomaly requiring further investigation.
          <strong>Anomaly detected — see full physics validation in the Forensic Report.</strong>
        </td>
        <td style="text-align:right;white-space:nowrap;padding-left:12px">
          <span style="font-size:10px;color:#b8720b;font-weight:600;border:1px solid #b8720b;padding:3px 8px;border-radius:2px;white-space:nowrap">View Forensic Report &rarr;</span>
        </td>
      </tr></table>
    </div>`;
  }
  return `<div style="border:1px solid #c8dfc9;background:#e9f3ea;border-radius:3px;padding:8px 14px;margin:8px 0;display:inline-block">
    <span style="display:inline-block;background:#3C7844;color:#fff;font-size:9px;font-weight:700;padding:2px 7px;border-radius:2px;text-transform:uppercase">Physics Check: Consistent</span>
    <span style="font-size:11px;color:#4a4a4a;margin-left:10px">No physics anomalies detected at this assessment tier.</span>
  </div>`;
}
