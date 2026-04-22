/**
 * KINGA Report Base HTML Template
 * 
 * Palette: black / white / grey ONLY.
 * Colour permitted only in charts and risk badges.
 * Logo: KINGA brand mark, top-right, never overlapping text.
 */

export interface ReportMeta {
  title: string;
  subtitle?: string;
  reportRef: string;
  generatedAt: Date;
  generatedBy: string;
  tenantName?: string;
  classification?: string;
}

const LOGO_URL = "https://cdn.manus.space/kinga-logo.png";

// ─── Utility Formatters ───────────────────────────────────────────────────────

export function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fmtCurrency(val: unknown, currency = "USD"): string {
  const n = Number(val ?? 0);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

export function fmtDate(val: unknown): string {
  if (!val) return "—";
  try {
    const d = new Date(Number(val));
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

export function fmtDateTime(val: unknown): string {
  if (!val) return "—";
  try {
    const d = new Date(Number(val));
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return "—"; }
}

export function fmtPct(val: unknown): string {
  const n = Number(val ?? 0);
  if (isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/**
 * A simple inline score bar using only grey shades.
 * The fill uses dark grey; the track is light grey.
 */
export function scoreBar(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  return `<span style="display:inline-flex;align-items:center;gap:6px;">
    <span style="display:inline-block;width:80px;height:8px;background:#e0e0e0;border-radius:2px;overflow:hidden;">
      <span style="display:block;width:${clamped}%;height:100%;background:#333;border-radius:2px;"></span>
    </span>
    <span style="font-size:11px;color:#333;font-weight:600;">${clamped}</span>
  </span>`;
}

/**
 * Risk / status badge — colour only for risk levels, grey for everything else.
 */
export function riskBadge(level: string): string {
  const l = level.toLowerCase();
  const styles: Record<string, string> = {
    critical: "background:#1a1a1a;color:#fff;",
    high:     "background:#444;color:#fff;",
    medium:   "background:#888;color:#fff;",
    low:      "background:#ccc;color:#111;",
    pass:     "background:#ccc;color:#111;",
    warn:     "background:#888;color:#fff;",
    fail:     "background:#444;color:#fff;",
    repair:   "background:#555;color:#fff;",
    replace:  "background:#222;color:#fff;",
    consistent: "background:#ccc;color:#111;",
    inconsistent: "background:#444;color:#fff;",
    unknown:  "background:#e0e0e0;color:#555;",
  };
  const style = styles[l] ?? styles.unknown;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;${style}">${escHtml(level)}</span>`;
}

// ─── Base HTML Builder ────────────────────────────────────────────────────────

export function buildBaseHtml(meta: ReportMeta, body: string): string {
  const genDate = fmtDateTime(meta.generatedAt.getTime());

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(meta.title)}</title>
  <style>
    /* ── Reset & Base ─────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 13px; }
    body {
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #111;
      background: #fff;
      line-height: 1.55;
    }

    /* ── Page Layout ──────────────────────────────── */
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 0;
    }

    /* ── Report Header ────────────────────────────── */
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 18mm 18mm 10mm 18mm;
      border-bottom: 2px solid #111;
    }
    .report-header-left { flex: 1; padding-right: 20px; }
    .report-title {
      font-size: 20px;
      font-weight: 700;
      color: #111;
      letter-spacing: -0.3px;
      line-height: 1.2;
    }
    .report-subtitle {
      font-size: 12px;
      color: #555;
      margin-top: 4px;
    }
    .report-meta {
      font-size: 10px;
      color: #777;
      margin-top: 8px;
      line-height: 1.7;
    }
    .report-meta strong { color: #333; }
    .report-logo {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
    }
    .report-logo img {
      height: 44px;
      width: auto;
      object-fit: contain;
    }
    .classification-badge {
      display: inline-block;
      padding: 2px 8px;
      background: #111;
      color: #fff;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      border-radius: 2px;
    }

    /* ── Report Body ──────────────────────────────── */
    .report-body {
      padding: 10mm 18mm 18mm 18mm;
    }

    /* ── Sections ─────────────────────────────────── */
    .section {
      margin-bottom: 18px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #111;
      border-bottom: 1px solid #ccc;
      padding-bottom: 4px;
      margin-bottom: 10px;
    }
    .subsection-title {
      font-size: 11px;
      font-weight: 600;
      color: #333;
      margin: 10px 0 6px 0;
    }

    /* ── Key-Value Grid ───────────────────────────── */
    .kv-grid {
      display: grid;
      gap: 8px 16px;
      margin-bottom: 10px;
    }
    .kv-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
    .kv-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
    .kv-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
    .kv-item {
      border-left: 2px solid #e0e0e0;
      padding-left: 8px;
    }
    .kv-label {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #888;
      margin-bottom: 2px;
    }
    .kv-value {
      font-size: 12px;
      color: #111;
      font-weight: 400;
    }
    .kv-value.bold { font-weight: 700; }
    .kv-value.mono { font-family: "Courier New", monospace; font-size: 11px; }

    /* ── Tables ───────────────────────────────────── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-bottom: 10px;
    }
    thead tr {
      background: #111;
      color: #fff;
    }
    thead th {
      padding: 6px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    tbody tr:nth-child(even) { background: #f7f7f7; }
    tbody tr:nth-child(odd)  { background: #fff; }
    tbody td {
      padding: 5px 8px;
      border-bottom: 1px solid #e8e8e8;
      vertical-align: middle;
    }
    tfoot tr { background: #f0f0f0; }
    tfoot td {
      padding: 6px 8px;
      border-top: 2px solid #ccc;
      font-size: 11px;
    }
    .text-right { text-align: right !important; }

    /* ── Finding Boxes ────────────────────────────── */
    .finding-box {
      background: #f5f5f5;
      border-left: 3px solid #333;
      padding: 8px 12px;
      font-size: 11px;
      margin-bottom: 8px;
      line-height: 1.6;
    }
    .finding-box.info {
      border-left-color: #999;
      background: #fafafa;
    }

    /* ── Typography Utilities ─────────────────────── */
    .bold  { font-weight: 700; }
    .small { font-size: 10px; }
    .grey  { color: #777; }
    .mono  { font-family: "Courier New", monospace; }
    ul { padding-left: 18px; margin: 4px 0; }
    li { font-size: 11px; margin-bottom: 3px; }
    p  { font-size: 11px; margin-bottom: 8px; }

    /* ── Page Footer ──────────────────────────────── */
    .report-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 6px 18mm;
      border-top: 1px solid #ccc;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #aaa;
      background: #fff;
    }

    /* ── Print ────────────────────────────────────── */
    @media print {
      .page { width: 100%; }
      .report-footer { position: fixed; bottom: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="report-header">
      <div class="report-header-left">
        <div class="report-title">${escHtml(meta.title)}</div>
        ${meta.subtitle ? `<div class="report-subtitle">${escHtml(meta.subtitle)}</div>` : ""}
        <div class="report-meta">
          <strong>Report Reference:</strong> ${escHtml(meta.reportRef)}<br/>
          <strong>Generated:</strong> ${genDate}<br/>
          <strong>Generated By:</strong> ${escHtml(meta.generatedBy)}<br/>
          ${meta.tenantName ? `<strong>Insurer:</strong> ${escHtml(meta.tenantName)}<br/>` : ""}
        </div>
      </div>
      <div class="report-logo">
        <img src="${LOGO_URL}" alt="KINGA" onerror="this.style.display='none'" />
        ${meta.classification ? `<span class="classification-badge">${escHtml(meta.classification)}</span>` : ""}
      </div>
    </div>

    <!-- Body -->
    <div class="report-body">
      ${body}
    </div>

    <!-- Footer -->
    <div class="report-footer">
      <span>KINGA Intelligence Platform &mdash; ${escHtml(meta.reportRef)}</span>
      <span>${genDate}</span>
    </div>
  </div>
</body>
</html>`;
}
