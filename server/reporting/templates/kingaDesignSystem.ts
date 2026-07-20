/**
 * KINGA Design System — Approved v9 (Voltron Redesign)
 *
 * CSS and HTML helpers for the KINGA Forensic Claim Decision Report.
 * Uses the exact approved CSS from KINGA_Forensic_Report_Voltron_Redesign.html.
 *
 * Class names:
 *   .masthead, .brand, .doc-title, .doc-sub, .meta, .claimno, .decision-chip
 *   .scorecard, .score-cell, .label, .value, .sub, .good, .warn, .bad
 *   .verdict-strip, .verdict-cell, .accent
 *   .section-tab, .num, .flag-right, .high, .mid, .ok
 *   .cols-2, .cols-3, .box, .box h4
 *   table.kv, table.grid-t, .kinga-row, .total
 *   .pill, .pill.green, .pill.amber, .pill.red, .pill.grey
 *   .callout, .callout.amber, .callout.red, .callout.green
 *   .qbar-row, .name, .track, .fill, .amt
 *   .stackbar
 *   .photo-zone, .photo-grid, .photo-tile, .photo-ph, .tag, .photo-cap
 *   .zone-row, .zone-name, .zone-note
 *   .footer-strip
 */

// ─── CSS ──────────────────────────────────────────────────────────────────────
export const REPORT_CSS = `
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
    font-family:'Georgia','Times New Roman',serif;
    color:var(--ink);
    background:var(--grey-100);
    font-size:12.5px;
    line-height:1.45;
  }
  .sans{font-family:'Helvetica Neue',Arial,sans-serif;}
  .mono{font-family:'Courier New',monospace;font-variant-numeric:tabular-nums;}
  .tab{font-variant-numeric:tabular-nums;}

  .page{
    width:210mm;
    min-height:297mm;
    margin:6mm auto;
    background:var(--paper);
    padding:14mm 16mm 18mm;
    position:relative;
  }
  @media print{
    body{background:var(--paper);}
    .page{margin:0;box-shadow:none;width:auto;min-height:auto;}
    .no-print{display:none;}
    .page-break{page-break-before:always;}
  }
  @page{size:A4;margin:12mm;}

  /* ---- Masthead ---- */
  .masthead{
    display:flex;justify-content:space-between;align-items:flex-start;
    border-bottom:2.5px solid var(--ink);padding-bottom:8px;margin-bottom:14px;
  }
  .masthead .brand{font-family:'Helvetica Neue',Arial,sans-serif;font-weight:800;letter-spacing:2px;font-size:13px;}
  .masthead .brand span{color:var(--green);}
  .masthead .doc-title{font-size:20px;font-weight:700;margin-top:2px;}
  .masthead .doc-sub{font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;color:var(--ink-soft);margin-top:2px;}
  .masthead .meta{text-align:right;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;color:var(--ink-soft);}
  .masthead .meta .claimno{font-size:12px;color:var(--ink);font-weight:700;margin-bottom:2px;}
  .decision-chip{
    display:inline-block;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:800;font-size:11px;
    letter-spacing:0.5px;padding:4px 10px;border-radius:2px;margin-top:6px;
    background:var(--amber-bg);color:var(--amber);border:1px solid var(--amber);
  }
  .decision-chip.approve{background:var(--green-bg);color:var(--green-dark);border-color:var(--green);}
  .decision-chip.reject{background:var(--red-bg);color:var(--red);border-color:var(--red);}

  /* ---- Scorecard strip ---- */
  .scorecard{
    display:grid;grid-template-columns:repeat(5,1fr);gap:0;
    border:1px solid var(--ink);margin-bottom:16px;
  }
  .score-cell{
    padding:9px 10px;border-right:1px solid var(--hairline-strong);
    text-align:center;
  }
  .score-cell:last-child{border-right:none;}
  .score-cell .label{font-family:'Helvetica Neue',Arial,sans-serif;font-size:8.5px;text-transform:uppercase;letter-spacing:0.6px;color:var(--ink-soft);}
  .score-cell .value{font-size:22px;font-weight:700;margin:2px 0;font-family:'Helvetica Neue',Arial,sans-serif;}
  .score-cell .sub{font-size:9px;color:var(--ink-soft);font-family:'Helvetica Neue',Arial,sans-serif;}
  .score-cell.good .value{color:var(--green);}
  .score-cell.warn .value{color:var(--amber);}
  .score-cell.bad .value{color:var(--red);}

  /* ---- Cost & verdict strip ---- */
  .verdict-strip{
    display:grid;grid-template-columns:repeat(6,1fr);gap:0;
    border:1px solid var(--hairline-strong);background:var(--grey-50);margin-bottom:16px;
  }
  .verdict-cell{
    padding:8px 9px;border-right:1px solid var(--hairline);
    text-align:center;
  }
  .verdict-cell:last-child{border-right:none;}
  .verdict-cell.accent{background:var(--green-bg);}
  .verdict-cell .label{font-family:'Helvetica Neue',Arial,sans-serif;font-size:8px;text-transform:uppercase;letter-spacing:0.4px;color:var(--ink-soft);}
  .verdict-cell .value{font-size:17px;font-weight:700;margin:2px 0;font-family:'Helvetica Neue',Arial,sans-serif;color:var(--ink);}
  .verdict-cell .sub{font-size:8px;color:var(--ink-soft);font-family:'Helvetica Neue',Arial,sans-serif;}

  /* ---- Section header (green tab) ---- */
  .section{margin-bottom:16px;}
  .section-tab{
    display:flex;align-items:center;gap:8px;
    background:var(--green);color:#fff;
    font-family:'Helvetica Neue',Arial,sans-serif;font-weight:700;font-size:11px;
    letter-spacing:0.6px;text-transform:uppercase;
    padding:5px 10px;margin-bottom:8px;
  }
  .section-tab .num{
    background:rgba(255,255,255,0.25);border-radius:2px;padding:1px 6px;font-size:10px;
  }
  .section-tab .flag-right{
    margin-left:auto;font-size:9.5px;font-weight:700;text-transform:none;
    padding:1px 7px;border-radius:2px;letter-spacing:0.2px;
  }
  .section-tab .flag-right.high{background:#fff;color:var(--red);}
  .section-tab .flag-right.mid{background:rgba(255,255,255,0.9);color:var(--amber);}
  .section-tab .flag-right.ok{background:rgba(255,255,255,0.9);color:var(--green-dark);}

  /* ---- Generic layout helpers ---- */
  .cols-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .cols-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
  .box{border:1px solid var(--hairline-strong);padding:10px 12px;}
  .box h4{
    font-family:'Helvetica Neue',Arial,sans-serif;font-size:9.5px;text-transform:uppercase;
    letter-spacing:0.5px;color:var(--ink-soft);margin:0 0 7px 0;border-bottom:1px solid var(--hairline);padding-bottom:5px;
  }

  table{border-collapse:collapse;width:100%;font-size:11.5px;}
  table.kv td{padding:3px 0;vertical-align:top;}
  table.kv td.k{color:var(--ink-soft);font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;width:44%;}
  table.kv td.v{font-weight:600;text-align:right;}
  table.kv tr+tr td{border-top:1px dotted var(--hairline);}

  table.grid-t{border:1px solid var(--hairline-strong);}
  table.grid-t th{
    background:var(--ink);color:#fff;font-family:'Helvetica Neue',Arial,sans-serif;
    font-size:9px;text-transform:uppercase;letter-spacing:0.4px;text-align:left;padding:6px 8px;
  }
  table.grid-t td{padding:6px 8px;border-top:1px solid var(--hairline);}
  table.grid-t tr:nth-child(even) td{background:var(--grey-50);}
  table.grid-t td.num{text-align:right;font-family:'Helvetica Neue',Arial,sans-serif;}
  table.grid-t tr.kinga-row td{background:var(--green-bg);font-weight:700;}
  table.grid-t tr.total td{background:var(--grey-100);font-weight:700;border-top:2px solid var(--hairline-strong);}

  .pill{display:inline-block;font-family:'Helvetica Neue',Arial,sans-serif;font-size:8.5px;font-weight:700;
    padding:1px 6px;border-radius:2px;letter-spacing:0.3px;}
  .pill.green{background:var(--green-bg);color:var(--green-dark);}
  .pill.amber{background:var(--amber-bg);color:var(--amber);}
  .pill.red{background:var(--red-bg);color:var(--red);}
  .pill.grey{background:var(--grey-100);color:var(--ink-soft);border:1px solid var(--hairline-strong);}

  .callout{border-left:3px solid var(--ink);padding:7px 10px;font-size:11px;margin-top:8px;background:var(--grey-50);}
  .callout.amber{border-color:var(--amber);background:var(--amber-bg);}
  .callout.red{border-color:var(--red);background:var(--red-bg);}
  .callout.green{border-color:var(--green);background:var(--green-bg);}
  .callout b{font-family:'Helvetica Neue',Arial,sans-serif;}

  .small{font-size:10px;color:var(--ink-soft);}
  .caption{font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;color:var(--ink-faint);margin-top:4px;}
  .mt8{margin-top:8px;} .mt12{margin-top:12px;} .mb8{margin-bottom:8px;} .mb12{margin-bottom:12px;}
  .bold{font-weight:700;} .faint{color:var(--ink-faint);}
  .green-text{color:var(--green);} .amber-text{color:var(--amber);} .red-text{color:var(--red);}

  .footer-strip{
    position:absolute;bottom:8mm;left:16mm;right:16mm;
    display:flex;justify-content:space-between;font-family:'Helvetica Neue',Arial,sans-serif;
    font-size:8px;color:var(--ink-faint);border-top:1px solid var(--hairline);padding-top:4px;
  }

  /* bar chart */
  .barchart{display:flex;align-items:flex-end;gap:10px;height:110px;padding:6px 4px 0;}
  .bar-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;}
  .bar-col .bar{width:60%;background:var(--teal);position:relative;}
  .bar-col .lbl{font-family:'Helvetica Neue',Arial,sans-serif;font-size:8px;color:var(--ink-soft);margin-top:4px;text-align:center;}
  .bar-col .val{font-family:'Helvetica Neue',Arial,sans-serif;font-size:9.5px;font-weight:700;margin-bottom:3px;}

  /* damage severity stacked bar */
  .stackbar{display:flex;height:22px;width:100%;border:1px solid var(--hairline-strong);overflow:hidden;}
  .stackbar div{display:flex;align-items:center;justify-content:center;font-family:'Helvetica Neue',Arial,sans-serif;color:#fff;font-size:9px;font-weight:700;}

  ul.tight{margin:4px 0 0 0;padding-left:16px;}
  ul.tight li{margin-bottom:3px;}

  .qbar-row{display:flex;align-items:center;gap:8px;margin-bottom:5px;}
  .qbar-row .name{width:150px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:9.5px;}
  .qbar-row .track{flex:1;background:var(--grey-100);height:12px;position:relative;}
  .qbar-row .fill{background:var(--blue);height:100%;}
  .qbar-row .amt{width:70px;text-align:right;font-family:'Helvetica Neue',Arial,sans-serif;font-size:9.5px;font-weight:700;}

  /* photo evidence grid */
  .photo-zone{display:grid;grid-template-columns:1.35fr 1fr;gap:14px;margin-top:8px;}
  .photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .photo-tile{border:1px solid var(--hairline-strong);}
  .photo-ph{position:relative;width:100%;height:95px;background:#ececec;overflow:hidden;}
  .photo-ph svg{width:100%;height:100%;display:block;}
  .photo-ph .tag{
    position:absolute;top:4px;left:4px;background:var(--ink);color:#fff;
    font-family:'Helvetica Neue',Arial,sans-serif;font-size:8px;font-weight:700;
    padding:1px 5px;border-radius:2px;
  }
  .photo-cap{font-family:'Helvetica Neue',Arial,sans-serif;font-size:8px;color:var(--ink-soft);padding:4px 6px;border-top:1px solid var(--hairline);}
  .photo-meta{display:flex;flex-direction:column;justify-content:flex-start;}
  .zone-row{display:flex;align-items:center;gap:10px;padding:6px 2px;border-top:1px dotted var(--hairline);}
  .zone-row:first-child{border-top:none;}
  .zone-name{font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;width:110px;}
  .zone-note{font-size:9.5px;color:var(--ink-soft);flex:1;}

  /* approval chain */
  .approval-table{width:100%;border-collapse:collapse;margin-top:8px;}
  .approval-table th{font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:0.4px;padding:5px 8px;background:var(--grey-100);border:1px solid var(--hairline-strong);}
  .approval-table td{padding:6px 8px;border:1px solid var(--hairline);font-size:11px;}
  .approval-table .step-num{font-family:'Helvetica Neue',Arial,sans-serif;font-weight:700;font-size:10px;color:var(--green);}
`;

// ─── HTML wrapper ─────────────────────────────────────────────────────────────
export function buildKingaHtml(body: string, title = "KINGA Forensic Claim Decision Report"): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

/** HTML-escape a string */
export function esc(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Format a USD dollar amount */
export function fmtUSD(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

/** Format a dollar amount — alias for fmtUSD */
export function fmtD(amount: unknown): string {
  return fmtUSD(amount as number);
}

/** Format a number with commas */
export function fmtNum(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Format a percentage */
export function fmtPct(value: number | null | undefined, decimals = 1): string {
  if (value == null || isNaN(Number(value))) return "—";
  return Number(value).toFixed(decimals) + "%";
}

/** Safely parse a JSON string, returning null on failure */
export function safeJson<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/** Return a CSS colour class based on a score (higher = better) */
export function scoreColour(value: number, goodThreshold = 70, warnThreshold = 40): string {
  if (value >= goodThreshold) return "var(--green)";
  if (value >= warnThreshold) return "var(--amber)";
  return "var(--red)";
}

/** Return good/warn/bad CSS class for score-cell */
export function scoreClass(value: number, goodThreshold = 70, warnThreshold = 40): string {
  if (value >= goodThreshold) return "good";
  if (value >= warnThreshold) return "warn";
  return "bad";
}

/** Pill HTML — inline status badge */
export function pill(
  text: string,
  variant: "green" | "amber" | "red" | "grey" = "grey"
): string {
  return `<span class="pill ${variant}">${esc(text)}</span>`;
}

/** Chip HTML — alias for pill with variant mapping */
export function chip(
  text: string,
  variant: "pass" | "warn" | "fail" | "info" | "neutral" | "excl" | "struct" = "neutral"
): string {
  const map: Record<string, "green" | "amber" | "red" | "grey"> = {
    pass: "green", warn: "amber", fail: "red", info: "grey",
    neutral: "grey", excl: "amber", struct: "grey",
  };
  return pill(text, map[variant] ?? "grey");
}

/** Badge HTML — section-level status indicator */
export function badge(
  text: string,
  variant: "ok" | "warn" | "fail" | "info" | "pass" | "neutral" | "excl" | "struct" = "neutral"
): string {
  const map: Record<string, "green" | "amber" | "red" | "grey"> = {
    ok: "green", pass: "green", warn: "amber", fail: "red",
    info: "grey", neutral: "grey", excl: "amber", struct: "grey",
  };
  return pill(text, map[variant] ?? "grey");
}

/** Callout box HTML */
export function callout(text: string, variant: "amber" | "red" | "green" | "" = ""): string {
  return `<div class="callout ${variant}">${text}</div>`;
}

/** Section tab HTML */
export function sectionTab(num: string, title: string, flagText?: string, flagLevel?: "high" | "mid" | "ok"): string {
  const flag = flagText && flagLevel
    ? `<span class="flag-right ${flagLevel}">${esc(flagText)}</span>`
    : "";
  return `<div class="section-tab"><span class="num">${esc(num)}</span>${esc(title)}${flag}</div>`;
}
