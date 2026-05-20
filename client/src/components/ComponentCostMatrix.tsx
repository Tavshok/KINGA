/**
 * ComponentCostMatrix — shared component used by both KingaClaimsReport and ForensicAuditReport.
 * Renders the side-by-side repairer quote table with a KINGA Optimised column.
 * Both reports MUST import this component so the matrix is always identical.
 */
import React from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatrixQuote {
  name: string;          // Repairer / panel beater name
  total: number;         // Pre-VAT total in USD (sum of line items)
  lineItems: Array<{
    description: string;
    lineTotal: number;
    is_non_part_cost?: boolean;
  }>;
  isFlagged?: boolean;   // Copy-quote similarity flag
}

export interface MatrixRow {
  description: string;
  zone?: string;
  category?: string;
  cells: Array<{ amount: number | null }>;
  // KINGA Optimised data for this row
  kingaAmount?: number | null;
  kingaTier?: string;
  kingaTierLabel?: string;
}

export interface ComponentCostMatrixProps {
  quotes: MatrixQuote[];
  rows: MatrixRow[];
  l2Total?: number | null;         // KINGA Optimised total (L2)
  l1Total?: number | null;         // Lowest submitted total (L1)
  savingsUsd?: number | null;
  savingsPct?: number | null;
  fmtMoney: (v: number) => string;
  sectionLabel?: string;           // e.g. "3.1 Repair Cost Analysis" or "5. Quotation & Cost Optimisation"
  showCategory?: boolean;          // Show Category column (FAR only)
}

// ── Tier badge ────────────────────────────────────────────────────────────────

function TierBadge({ tier, label }: { tier: string; label: string }) {
  const styles: Record<string, React.CSSProperties> = {
    T1: { color: "#1d4ed8", background: "#dbeafe", border: "1px solid #93c5fd" },
    T2: { color: "#065f46", background: "#d1fae5", border: "1px solid #6ee7b7" },
    T3: { color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a" },
    T4: { color: "#475569", background: "#f1f5f9", border: "1px solid #e2e8f0" },
  };
  const s = styles[tier] ?? styles.T4;
  return (
    <span style={{ ...s, fontSize: 9, fontWeight: 700, borderRadius: 3, padding: "1px 4px", display: "inline-block", marginLeft: 4, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ComponentCostMatrix({
  quotes,
  rows,
  l2Total,
  l1Total,
  savingsUsd,
  savingsPct,
  fmtMoney,
  sectionLabel,
  showCategory = false,
}: ComponentCostMatrixProps) {
  const S = {
    th: {
      padding: "8px 12px",
      fontWeight: 600,
      fontSize: 11,
      color: "#64748b",
      textAlign: "left" as const,
      whiteSpace: "nowrap" as const,
      borderBottom: "1px solid #e2e8f0",
      background: "#ffffff",
    },
    td: {
      padding: "7px 12px",
      fontSize: 12,
      borderTop: "1px solid #f1f5f9",
      color: "#0f172a",
      verticalAlign: "top" as const,
    },
  };

  const kingaColStyle: React.CSSProperties = {
    borderLeft: "2px solid #1A2B4A",
    background: "#f8fafc",
  };

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#ffffff", marginBottom: 16 }}>
      {/* Header */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#0f172a", margin: 0 }}>
          {sectionLabel ?? "Repair Cost Analysis — Component Matrix"}
        </p>
        <span style={{ fontSize: 11, color: "#64748b" }}>
          {quotes.length > 0 ? `${quotes.length} quote${quotes.length !== 1 ? "s" : ""} received` : "No quotes"}
        </span>
      </div>

      {/* Table */}
      {quotes.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...S.th, minWidth: 180 }}>Repair Item</th>
                <th style={{ ...S.th, minWidth: 70 }}>Zone</th>
                {showCategory && <th style={{ ...S.th, minWidth: 90 }}>Category</th>}
                {quotes.map((q, qi) => (
                  <th key={qi} style={{ ...S.th, textAlign: "right", minWidth: 110 }}>
                    <div>{q.name}</div>
                    {q.isFlagged && (
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#92400e", marginTop: 1 }}>⚠ Similarity flagged</div>
                    )}
                  </th>
                ))}
                <th style={{ ...S.th, ...kingaColStyle, textAlign: "right", minWidth: 130, color: "#1A2B4A" }}>
                  KINGA Optimised
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ background: "transparent" }}>
                  <td style={S.td}>{row.description}</td>
                  <td style={{ ...S.td, color: "#64748b", fontSize: 11 }}>{row.zone ?? "—"}</td>
                  {showCategory && <td style={{ ...S.td, color: "#64748b" }}>{row.category ?? "—"}</td>}
                  {row.cells.map((cell, ci) => (
                    <td key={ci} style={{ ...S.td, textAlign: "right" }}>
                      {cell.amount !== null ? fmtMoney(cell.amount) : <span style={{ color: "#94a3b8" }}>—</span>}
                    </td>
                  ))}
                  {/* KINGA Optimised cell — cost + source label only */}
                  <td style={{ ...S.td, ...kingaColStyle, textAlign: "right", fontWeight: 600 }}>
                    {row.kingaAmount != null ? (
                      <>
                        <span>{fmtMoney(row.kingaAmount)}</span>
                        {row.kingaTierLabel && (
                          <TierBadge tier={row.kingaTier ?? "T4"} label={row.kingaTierLabel} />
                        )}
                      </>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid #cbd5e1", background: "#ffffff" }}>
                <td colSpan={showCategory ? 3 : 2} style={{ ...S.td, fontWeight: 700, color: "#0f172a" }}>TOTAL</td>
                {quotes.map((q, qi) => (
                  <td key={qi} style={{ ...S.td, textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                    {fmtMoney(q.total)}
                  </td>
                ))}
                <td style={{ ...S.td, ...kingaColStyle, textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                  {l2Total != null ? fmtMoney(l2Total) : "—"}
                  {savingsUsd != null && savingsUsd > 0 && (
                    <span style={{ display: "block", fontSize: 10, fontWeight: 600, color: "#15803d", marginTop: 2 }}>
                      ↓ {fmtMoney(savingsUsd)} saved ({savingsPct != null ? `${savingsPct.toFixed(1)}%` : ""})
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div style={{ padding: "24px 16px", textAlign: "center", color: "#94a3b8", fontSize: 12 }}>
          No quotes available for this claim.
        </div>
      )}

      {/* Cost summary strip below table */}
      {(l1Total != null || l2Total != null) && (
        <div style={{ borderTop: "1px solid #e2e8f0", padding: "12px 16px", display: "flex", gap: 24, flexWrap: "wrap", background: "#fafafa" }}>
          {l1Total != null && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", margin: "0 0 2px" }}>Lowest Submitted</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: 0, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(l1Total)}</p>
              <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>L1 — best of {quotes.length} quote{quotes.length !== 1 ? "s" : ""}</p>
            </div>
          )}
          {l2Total != null && (
            <div style={{ borderLeft: l1Total != null ? "1px solid #e2e8f0" : undefined, paddingLeft: l1Total != null ? 24 : 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1A2B4A", margin: "0 0 2px" }}>KINGA Optimised</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: "#1A2B4A", margin: 0, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(l2Total)}</p>
              <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>L2 — best price per component</p>
            </div>
          )}
          {savingsUsd != null && savingsUsd > 0 && (
            <div style={{ borderLeft: "1px solid #e2e8f0", paddingLeft: 24 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", margin: "0 0 2px" }}>Savings Opportunity</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: "#15803d", margin: 0, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(savingsUsd)}</p>
              <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>
                {savingsPct != null ? `${savingsPct.toFixed(1)}% reduction from L1` : "vs lowest submitted"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Data adapter helpers ──────────────────────────────────────────────────────

/**
 * Build MatrixRows from compositeLineItems (Stage 9 output).
 * Used when compositeLineItems is available (preferred path).
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
    return {
      description: desc,
      zone: item.zone ?? item.impactZone ?? "—",
      category: item.category ?? "",
      cells,
      kingaAmount: item.selectedCostUsd ?? item.kingaOptimisedUsd ?? null,
      kingaTier: item.kingaOptimisedTier ?? "T4",
      kingaTierLabel: item.kingaOptimisedTierLabel ?? (item.selectedFromQuote ? `Best Quote · ${item.selectedFromQuote}` : "Quoted"),
    };
  });
}

/**
 * Build MatrixRows from raw quote line items when compositeLineItems is unavailable.
 * Falls back to union of all unique descriptions across all quotes.
 */
export function buildRowsFromLineItems(quotes: MatrixQuote[]): MatrixRow[] {
  // Collect all unique descriptions
  const descSet = new Set<string>();
  quotes.forEach((q) => (q.lineItems ?? []).forEach((li) => {
    if (!li.is_non_part_cost) descSet.add(li.description.trim());
  }));
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
    return {
      description: desc,
      cells,
      kingaAmount: minAmount,
      kingaTier: "T4",
      kingaTierLabel: minAmount != null ? "Best Quote" : undefined,
    };
  });
}
