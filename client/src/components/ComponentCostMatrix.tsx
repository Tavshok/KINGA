/**
 * ComponentCostMatrix
 *
 * Single shared component used by both KingaClaimsReport and ForensicAuditReport.
 * Renders the cross-repairer component cost table with a KINGA Optimised column.
 *
 * Design principles:
 *  - Clean, professional table — no visual noise in cells
 *  - KINGA Optimised column is visually distinct but not garish
 *  - Source attribution is a single subdued line below the amount
 *  - Alternating row shading for readability
 *  - Totals row is clearly separated
 *  - Cost summary strip below the table (L1 / L2 / Savings)
 *  - Advisory flags (QND / DNQ) rendered below the summary strip
 */

import React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MatrixQuote {
  name: string;
  total: number;
  lineItems: Array<{
    description: string;
    lineTotal: number;
    is_non_part_cost?: boolean;
  }>;
  isFlagged?: boolean;
}

export interface MatrixRow {
  description: string;
  zone?: string | null;
  category?: string | null;
  cells: Array<{ amount: number | null; flag?: "missing" | "variance" | "over" | "under" }>;
  kingaAmount?: number | null;
  kingaSource?: string | null;  // clean source label, e.g. "Swiss Motors" or "ML Benchmark"
}

export interface AdvisoryFlag {
  componentName?: string;
  repairerName?: string;
  quotedAmountUsd?: number | null;
  estimatedCostUsd?: number | null;
  estimatedCost?: number | null;
  source?: string;
  probability?: number | null;
  flag?: string;
}

export interface ComponentCostMatrixProps {
  quotes: MatrixQuote[];
  rows: MatrixRow[];
  l1Total?: number | null;
  l2Total?: number | null;
  savingsUsd?: number | null;
  savingsPct?: number | null;
  nfs?: number | null;
  qndFlags?: AdvisoryFlag[];
  dnqFlags?: AdvisoryFlag[];
  fmtMoney: (v: number) => string;
  showCategory?: boolean;
  isCopyQuote?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KINGA_BORDER = "2px solid #1A2B4A";
const KINGA_BG = "#f0f4f8";
const KINGA_COLOR = "#1A2B4A";

// ─── Component ────────────────────────────────────────────────────────────────

export function ComponentCostMatrix({
  quotes,
  rows,
  l1Total,
  l2Total,
  savingsUsd,
  savingsPct,
  nfs,
  qndFlags = [],
  dnqFlags = [],
  fmtMoney,
  showCategory = false,
  isCopyQuote = false,
}: ComponentCostMatrixProps) {

  if (quotes.length === 0) {
    return (
      <div style={{ padding: "20px 0", color: "#94a3b8", fontSize: 12, textAlign: "center" }}>
        No quotes submitted for this claim.
      </div>
    );
  }

  const nfsColor = nfs != null ? (nfs >= 70 ? "#15803d" : nfs >= 40 ? "#b45309" : "#dc2626") : "#64748b";
  const nfsBg   = nfs != null ? (nfs >= 70 ? "#dcfce7" : nfs >= 40 ? "#fef3c7" : "#fee2e2") : "#f1f5f9";
  const isSaving = savingsUsd != null && savingsUsd > 0;

  // ── Table styles ─────────────────────────────────────────────────────────────
  const th: React.CSSProperties = {
    padding: "9px 12px",
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#475569",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
    whiteSpace: "nowrap",
    textAlign: "left",
  };
  const thRight: React.CSSProperties = { ...th, textAlign: "right" };
  const thKinga: React.CSSProperties = {
    ...thRight,
    color: KINGA_COLOR,
    background: KINGA_BG,
    borderLeft: KINGA_BORDER,
    minWidth: 130,
  };
  const td: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: 12,
    color: "#0f172a",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "middle",
  };
  const tdRight: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const tdKinga: React.CSSProperties = {
    ...tdRight,
    fontWeight: 600,
    color: KINGA_COLOR,
    background: KINGA_BG,
    borderLeft: KINGA_BORDER,
  };
  const tfTd: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 700,
    color: "#0f172a",
    borderTop: "2px solid #cbd5e1",
    background: "#ffffff",
  };
  const tfKinga: React.CSSProperties = {
    ...tfTd,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    fontSize: 13,
    color: KINGA_COLOR,
    background: KINGA_BG,
    borderLeft: KINGA_BORDER,
  };

  return (
    <div style={{ fontFamily: "inherit" }}>

      {/* ── Copy-quote alert ── */}
      {isCopyQuote && (
        <div style={{ padding: "8px 14px", marginBottom: 12, background: "#fffbeb", border: "1px solid #fbbf24", borderRadius: 6 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#92400e", margin: 0 }}>⚠ Copy-Quotation Detected</p>
          <p style={{ fontSize: 11, color: "#78350f", marginTop: 2, margin: "2px 0 0" }}>
            Structural similarity analysis indicates suspected copy-quotation. Independent quotes are required for a valid comparison.
          </p>
        </div>
      )}

      {/* ── Matrix table ── */}
      <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...th, minWidth: 180 }}>Repair Item</th>
              <th style={{ ...th, minWidth: 70 }}>Zone</th>
              {showCategory && <th style={{ ...th, minWidth: 90 }}>Category</th>}
              {quotes.map((q, qi) => (
                <th key={qi} style={{ ...thRight, minWidth: 110 }}>
                  <div>{q.name}</div>
                  {q.isFlagged && (
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#92400e", marginTop: 1 }}>
                      ⚠ Similarity flagged
                    </div>
                  )}
                </th>
              ))}
              <th style={thKinga}>KINGA Optimised</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const rowBg = ri % 2 === 0 ? "#ffffff" : "#fafafa";
              return (
                <tr key={ri} style={{ background: rowBg }}>
                  {/* Description */}
                  <td style={{ ...td, background: rowBg, fontWeight: 500 }}>{row.description}</td>
                  {/* Zone */}
                  <td style={{ ...td, background: rowBg, color: "#64748b", fontSize: 11 }}>
                    {row.zone ?? "—"}
                  </td>
                  {/* Category */}
                  {showCategory && (
                    <td style={{ ...td, background: rowBg, color: "#64748b" }}>
                      {row.category ?? "—"}
                    </td>
                  )}
                  {/* Per-quote cells */}
                  {row.cells.map((cell, ci) => {
                    let cellStyle: React.CSSProperties = { ...tdRight, background: rowBg };
                    if (cell.flag === "missing") cellStyle = { ...cellStyle, color: "#94a3b8", fontStyle: "italic" };
                    else if (cell.flag === "variance") cellStyle = { ...cellStyle, fontWeight: 700, color: "#92400e" };
                    else if (cell.flag === "over") cellStyle = { ...cellStyle, fontWeight: 700, color: "#dc2626", background: "#fef2f2" };
                    else if (cell.flag === "under") cellStyle = { ...cellStyle, fontWeight: 700, color: "#92400e", background: "#fef3c7" };
                    return (
                      <td key={ci} style={cellStyle}>
                        {cell.amount !== null
                          ? fmtMoney(cell.amount)
                          : <span style={{ color: "#cbd5e1" }}>—</span>}
                      </td>
                    );
                  })}
                  {/* KINGA Optimised cell */}
                  <td style={tdKinga}>
                    {row.kingaAmount != null ? (
                      <>
                        <span>{fmtMoney(row.kingaAmount)}</span>
                        {row.kingaSource && (
                          <span style={{
                            display: "block",
                            fontSize: 9,
                            fontWeight: 500,
                            color: "#64748b",
                            marginTop: 1,
                            letterSpacing: "0.02em",
                          }}>
                            {row.kingaSource}
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: "#cbd5e1" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={showCategory ? 3 : 2} style={{ ...tfTd, textAlign: "left" }}>TOTAL</td>
              {quotes.map((q, qi) => (
                <td key={qi} style={{ ...tfTd, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {fmtMoney(q.total)}
                </td>
              ))}
              <td style={tfKinga}>
                {l2Total != null ? fmtMoney(l2Total) : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Cost summary strip: L1 / L2 / Savings ── */}
      {(l1Total != null || l2Total != null) && (
        <div style={{ display: "grid", gridTemplateColumns: isSaving ? "1fr 1fr 1fr" : "1fr 1fr", gap: 12, marginBottom: 14 }}>
          {/* L1 */}
          {l1Total != null && (
            <div style={{ padding: "12px 16px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fafafa" }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", margin: "0 0 4px" }}>
                Lowest Submitted
              </p>
              <p style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "0 0 2px", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
                {fmtMoney(l1Total)}
              </p>
              <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>
                L1 — best of {quotes.length} quote{quotes.length !== 1 ? "s" : ""}
              </p>
            </div>
          )}
          {/* L2 */}
          {l2Total != null && (
            <div style={{ padding: "12px 16px", borderRadius: 6, border: KINGA_BORDER, background: KINGA_BG }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: KINGA_COLOR, margin: "0 0 4px" }}>
                KINGA Optimised
              </p>
              <p style={{ fontSize: 22, fontWeight: 800, color: KINGA_COLOR, margin: "0 0 2px", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
                {fmtMoney(l2Total)}
              </p>
              <p style={{ fontSize: 10, color: "#64748b", margin: 0 }}>L2 — best price per component</p>
            </div>
          )}
          {/* Savings */}
          {isSaving && savingsUsd != null && (
            <div style={{ padding: "12px 16px", borderRadius: 6, border: "1px solid #bbf7d0", background: "#f0fdf4" }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#15803d", margin: "0 0 4px" }}>
                Savings Opportunity
              </p>
              <p style={{ fontSize: 22, fontWeight: 800, color: "#15803d", margin: "0 0 2px", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
                {fmtMoney(savingsUsd)}
              </p>
              <p style={{ fontSize: 10, color: "#16a34a", margin: 0 }}>
                {savingsPct != null ? `${savingsPct}% reduction from L1` : "vs lowest submitted"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Savings progress bar */}
      {isSaving && l1Total != null && l2Total != null && savingsPct != null && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: "#64748b" }}>KINGA Optimised vs Submitted</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#15803d" }}>{savingsPct}% saving</span>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: "#e2e8f0", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min((l2Total / l1Total) * 100, 100)}%`, background: KINGA_COLOR, borderRadius: 4 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
            <span style={{ fontSize: 9, color: "#94a3b8" }}>L2 {fmtMoney(l2Total)}</span>
            <span style={{ fontSize: 9, color: "#94a3b8" }}>L1 {fmtMoney(l1Total)}</span>
          </div>
        </div>
      )}

      {/* NFS badge */}
      {nfs != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0", marginBottom: 14 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b" }}>NFS</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: nfsColor, fontVariantNumeric: "tabular-nums" }}>{nfs.toFixed(0)}</span>
          <span style={{ fontSize: 10, color: nfsColor, fontWeight: 600 }}>
            {nfs >= 70 ? "STRONG" : nfs >= 40 ? "MODERATE" : "LIMITED"}
          </span>
          <span style={{ fontSize: 10, color: "#64748b", flex: 1 }}>
            {nfs >= 70
              ? "Strong negotiation potential — benchmark data supports cost reduction."
              : nfs >= 40
              ? "Moderate negotiation potential — partial benchmark support."
              : "Limited negotiation potential — submit at lowest quoted rate."}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: nfsBg, color: nfsColor }}>
            {nfs.toFixed(0)}%
          </span>
        </div>
      )}

      {/* ── Advisory Flags ── */}
      {(qndFlags.length > 0 || dnqFlags.length > 0) && (
        <div style={{ marginTop: 4 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569", margin: "0 0 10px" }}>
            Advisory Observations
          </p>

          {/* Quoted-Not-Damaged */}
          {qndFlags.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#92400e", margin: "0 0 4px" }}>
                ⚠ Quoted-Not-Damaged Components ({qndFlags.length})
              </p>
              <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 8px" }}>
                The following components appear in submitted quotes but are not corroborated by the damage assessment. These items warrant verification before settlement.
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ ...th, textAlign: "left" }}>Component</th>
                    <th style={{ ...th, textAlign: "left" }}>Repairer</th>
                    <th style={{ ...th, textAlign: "right" }}>Quoted Amount</th>
                    <th style={{ ...th, textAlign: "left" }}>Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {qndFlags.map((f, fi) => (
                    <tr key={fi}>
                      <td style={td}>{f.componentName ?? "—"}</td>
                      <td style={td}>{f.repairerName ?? "—"}</td>
                      <td style={{ ...tdRight }}>{f.quotedAmountUsd != null ? fmtMoney(f.quotedAmountUsd) : "—"}</td>
                      <td style={td}>
                        <span style={{ fontSize: 10, fontWeight: 700, background: "#fef3c7", color: "#92400e", borderRadius: 3, padding: "1px 5px" }}>
                          {f.flag ?? "VERIFY"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Damaged-Not-Quoted */}
          {dnqFlags.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#374151", margin: "0 0 4px" }}>
                ℹ Damaged-Not-Quoted Components ({dnqFlags.length})
              </p>
              <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 8px" }}>
                The following components show evidence of damage in the assessment but have not been included in any submitted quote. These may represent supplementary repair requirements or hidden damage.
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ ...th, textAlign: "left" }}>Component</th>
                    <th style={{ ...th, textAlign: "right" }}>Estimated Cost</th>
                    <th style={{ ...th, textAlign: "left" }}>Source</th>
                    <th style={{ ...th, textAlign: "right" }}>Probability</th>
                  </tr>
                </thead>
                <tbody>
                  {dnqFlags.map((f, fi) => (
                    <tr key={fi}>
                      <td style={td}>{f.componentName ?? "—"}</td>
                      <td style={tdRight}>
                        {f.estimatedCostUsd != null ? fmtMoney(f.estimatedCostUsd) : f.estimatedCost != null ? fmtMoney(f.estimatedCost) : "—"}
                      </td>
                      <td style={td}>{f.source ?? "—"}</td>
                      <td style={{ ...tdRight }}>
                        {f.probability != null ? (
                          <span style={{ fontSize: 10, fontWeight: 700, background: "#f3f4f6", color: "#374151", borderRadius: 3, padding: "1px 5px" }}>
                            {Math.round(f.probability * 100)}%
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Data adapter helpers ─────────────────────────────────────────────────────

/**
 * Build MatrixRows from compositeLineItems (Stage 9 output).
 * Preferred path when compositeLineItems is available.
 */
export function buildRowsFromComposite(
  compositeLineItems: any[],
  quotes: MatrixQuote[]
): MatrixRow[] {
  return compositeLineItems.map((item: any) => {
    const desc: string = item.componentName ?? item.component ?? item.description ?? "";
    const cells = quotes.map((q) => {
      const li = (q.lineItems ?? []).find((l: any) => {
        const ld = (l.description ?? "").trim().toLowerCase();
        const dd = desc.toLowerCase();
        return ld === dd || ld.includes(dd) || dd.includes(ld);
      });
      return { amount: li ? Number(li.lineTotal) : null };
    });

    // Derive a clean source label from tier info
    const tier = item.kingaOptimisedTier ?? "T4";
    const rawLabel = item.kingaOptimisedTierLabel ?? "";
    let kingaSource: string | null = null;
    if (tier === "T1") kingaSource = "ML Benchmark";
    else if (tier === "T2") kingaSource = "Market Benchmark";
    else {
      const match = rawLabel.match(/·\s*(.+)$/);
      kingaSource = match ? match[1].trim() : (item.selectedFromQuote ?? null);
    }

    return {
      description: desc,
      zone: item.zone ?? item.impactZone ?? null,
      category: item.category ?? null,
      cells,
      kingaAmount: item.selectedCostUsd ?? item.kingaOptimisedUsd ?? null,
      kingaSource,
    };
  });
}

/**
 * Build MatrixRows from raw quote line items (fallback when compositeLineItems is unavailable).
 */
export function buildRowsFromLineItems(quotes: MatrixQuote[]): MatrixRow[] {
  const descSet = new Set<string>();
  quotes.forEach((q) =>
    (q.lineItems ?? []).forEach((li) => {
      if (!li.is_non_part_cost) descSet.add(li.description.trim());
    })
  );
  const descs = Array.from(descSet);

  return descs.map((desc) => {
    const cells = quotes.map((q) => {
      const li = (q.lineItems ?? []).find(
        (l: any) => l.description.trim().toLowerCase() === desc.toLowerCase()
      );
      return { amount: li ? Number(li.lineTotal) : null };
    });
    const validAmounts = cells.map((c) => c.amount).filter((a): a is number => a !== null);
    const minAmount = validAmounts.length > 0 ? Math.min(...validAmounts) : null;
    const minQuote = minAmount != null
      ? quotes[cells.findIndex((c) => c.amount === minAmount)]?.name ?? null
      : null;
    return {
      description: desc,
      cells,
      kingaAmount: minAmount,
      kingaSource: minQuote,
    };
  });
}
