/**
 * AssetPassportPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Epic 4 — Asset Passport
 *
 * Lists all registered assets with risk rating and inspection history.
 * Used in: Platform Admin Dashboard (Asset Passport section in Intelligence tab).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Package, AlertTriangle, CheckCircle, Clock, RefreshCw, Search } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RISK_COLOUR: Record<string, string> = {
  critical: "#e74c3c",
  high:     "#e67e22",
  medium:   "#f39c12",
  low:      "#27ae60",
};

function RiskBadge({ rating }: { rating: string | null | undefined }) {
  const r = (rating ?? "low").toLowerCase();
  const colour = RISK_COLOUR[r] ?? "#888";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "10px",
        background: colour + "22",
        color: colour,
        fontSize: "10px",
        fontWeight: 700,
        textTransform: "uppercase",
        border: `1px solid ${colour}44`,
      }}
    >
      {r}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AssetPassportPanel() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<"low" | "medium" | "high" | "critical" | undefined>(undefined);

  const { data, isLoading, refetch } = trpc.assetPassport.listAssets.useQuery({
    limit: 50,
    riskRating: riskFilter,
  });

  const assets = data?.assets ?? [];

  const filtered = search
    ? assets.filter((a: any) =>
        (a.assetRef ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (a.assetName ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (a.vehicleRegistration ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : assets;

  return (
    <div style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Package size={15} style={{ color: "#2980b9" }} />
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#111" }}>Asset Passport Registry</span>
          <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "8px", background: "#2980b918", color: "#2980b9", textTransform: "uppercase" }}>
            Epic 4
          </span>
          <span style={{ fontSize: "11px", color: "#888", background: "#f5f5f5", padding: "2px 8px", borderRadius: "10px" }}>
            {filtered.length} assets
          </span>
        </div>
        <button
          onClick={() => refetch()}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#888", display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={12} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#aaa" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by ref, name, or registration…"
            style={{
              width: "100%",
              padding: "7px 10px 7px 28px",
              border: "1px solid #e0e0e0",
              borderRadius: "6px",
              fontSize: "12px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <select
          value={riskFilter ?? ""}
          onChange={e => setRiskFilter((e.target.value as any) || undefined)}
          style={{ padding: "7px 10px", border: "1px solid #e0e0e0", borderRadius: "6px", fontSize: "12px", outline: "none" }}
        >
          <option value="">All Risk Levels</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: "32px", textAlign: "center", color: "#888", fontSize: "13px" }}>
          Loading assets…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "32px", textAlign: "center", color: "#888", fontSize: "13px" }}>
          <Package size={28} style={{ color: "#ddd", marginBottom: "8px" }} />
          <div>No assets found.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                {["Asset Ref", "Name", "Type", "Manufacturer / Model", "Registration", "Risk", "Inspections", "Last Inspected"].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "#888",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      borderBottom: "1px solid #f0f0f0",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset: any, idx: number) => (
                <tr
                  key={asset.id}
                  style={{ borderBottom: idx < filtered.length - 1 ? "1px solid #f5f5f5" : "none" }}
                >
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111", fontFamily: "monospace", fontSize: "11px" }}>
                    {asset.assetRef ?? "—"}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#444" }}>
                    {asset.assetName ?? "—"}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#666" }}>
                    {(asset.assetType ?? "—").replace(/_/g, " ")}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#666" }}>
                    {[asset.manufacturer, asset.model].filter(Boolean).join(" ") || "—"}
                    {asset.yearManufactured ? ` (${asset.yearManufactured})` : ""}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#666", fontFamily: "monospace", fontSize: "11px" }}>
                    {asset.vehicleRegistration ?? "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <RiskBadge rating={asset.riskRating} />
                  </td>
                  <td style={{ padding: "10px 12px", color: "#666", textAlign: "center" }}>
                    {asset.inspectionCount ?? 0}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: "11px", whiteSpace: "nowrap" }}>
                    {asset.lastInspectedAt
                      ? new Date(asset.lastInspectedAt).toLocaleDateString()
                      : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
