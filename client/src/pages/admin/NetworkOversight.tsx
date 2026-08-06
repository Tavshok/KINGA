/**
 * NetworkOversight.tsx — Phase 1A
 * Unified admin view of the entire KINGA network:
 * Insurers | Agencies | Panel Beaters | Assessors | Fleet Operators | Engineers
 */
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Building2, Briefcase, Wrench, UserCheck, Truck, HardHat, RefreshCw } from "lucide-react";

type Tab = "insurers" | "agencies" | "panel_beaters" | "assessors" | "fleet" | "engineers";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "insurers", label: "Insurers", icon: Building2 },
  { key: "agencies", label: "Agencies", icon: Briefcase },
  { key: "panel_beaters", label: "Panel Beaters", icon: Wrench },
  { key: "assessors", label: "Assessors", icon: UserCheck },
  { key: "fleet", label: "Fleet Operators", icon: Truck },
  { key: "engineers", label: "Engineers", icon: HardHat },
];

function StatusBadge({ value, trueLabel = "Active", falseLabel = "Inactive" }: { value: any; trueLabel?: string; falseLabel?: string }) {
  const active = value === 1 || value === true || value === "active";
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600, background: active ? "#dcfce7" : "#f3f4f6", color: active ? "#166534" : "#6b7280" }}>
      {active ? trueLabel : falseLabel}
    </span>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ background: "#f9fafb" }}>
          {headers.map(h => (
            <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #f3f4f6" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: "1px solid #f9fafb" }}>
            {row.map((cell, j) => (
              <td key={j} style={{ padding: "10px 14px", fontSize: 12, color: "#374151" }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function KpiStrip({ items }: { items: { label: string; value: string | number; sub?: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 12, marginBottom: 16 }}>
      {items.map(item => (
        <div key={item.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>{item.value}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{item.label}</div>
          {item.sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{item.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function InsurersTab() {
  const { data, isLoading, refetch } = trpc.admin.getInsurerNetwork.useQuery();
  const insurers: any[] = data ?? [];
  const total = insurers.length;
  const totalClaims = insurers.reduce((s: number, i: any) => s + (i.claimsTotal ?? 0), 0);
  const currencies = [...new Set(insurers.map((i: any) => i.primaryCurrency).filter(Boolean))];
  return (
    <>
      <KpiStrip items={[
        { label: "Total Insurers", value: total },
        { label: "Total Claims", value: totalClaims.toLocaleString() },
        { label: "Currencies", value: currencies.join(", ") || "—" },
      ]} />
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        {isLoading ? <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>Loading…</div> : (
          <Table
            headers={["Tenant ID", "Display Name", "Currency", "Claims", "Registered"]}
            rows={insurers.map((ins: any) => [
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>{ins.id}</span>,
              <span style={{ fontWeight: 600 }}>{ins.displayName}</span>,
              ins.primaryCurrency ?? "—",
              <span style={{ fontWeight: 600, color: ins.claimsTotal > 0 ? "#111" : "#9ca3af" }}>{(ins.claimsTotal ?? 0).toLocaleString()}</span>,
              <span style={{ color: "#9ca3af", fontSize: 11 }}>{ins.createdAt ? new Date(ins.createdAt).toLocaleDateString() : "—"}</span>,
            ])}
          />
        )}
      </div>
    </>
  );
}

function AgenciesTab() {
  const { data, isLoading } = trpc.admin.getAgencyNetwork.useQuery();
  const agencies: any[] = data ?? [];
  const active = agencies.filter((a: any) => a.isActive === 1).length;
  return (
    <>
      <KpiStrip items={[
        { label: "Total Carriers", value: agencies.length },
        { label: "Active", value: active },
        { label: "API Enabled", value: agencies.filter((a: any) => a.apiEnabled === 1).length },
      ]} />
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        {isLoading ? <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>Loading…</div> : (
          <Table
            headers={["Name", "Short Code", "Commission Rate", "API", "Status", "Contact"]}
            rows={agencies.map((a: any) => [
              <span style={{ fontWeight: 600 }}>{a.name}</span>,
              <span style={{ fontFamily: "monospace", fontSize: 11, background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>{a.shortCode}</span>,
              `${a.defaultCommissionRate}%`,
              <StatusBadge value={a.apiEnabled} trueLabel="Enabled" falseLabel="Disabled" />,
              <StatusBadge value={a.isActive} />,
              <span style={{ fontSize: 11, color: "#6b7280" }}>{a.contactEmail ?? "—"}</span>,
            ])}
          />
        )}
      </div>
    </>
  );
}

function PanelBeatersTab() {
  const { data, isLoading } = trpc.admin.getPanelBeatersAdmin.useQuery();
  const pbs: any[] = data ?? [];
  const approved = pbs.filter((p: any) => p.approved === 1 || p.panelBeaterStatus === "approved").length;
  const pending = pbs.filter((p: any) => p.panelBeaterStatus === "pending" || (!p.panelBeaterStatus && p.approved !== 1)).length;
  return (
    <>
      <KpiStrip items={[
        { label: "Total", value: pbs.length },
        { label: "Approved", value: approved },
        { label: "Pending", value: pending },
      ]} />
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        {isLoading ? <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>Loading…</div> : (
          <Table
            headers={["Business Name", "Contact", "Tenant", "Status", "Registered"]}
            rows={pbs.map((p: any) => [
              <span style={{ fontWeight: 600 }}>{p.businessName ?? p.name ?? `Panel Beater #${p.id}`}</span>,
              <span style={{ fontSize: 11, color: "#6b7280" }}>{p.email ?? p.phone ?? "—"}</span>,
              <span style={{ fontSize: 11, color: "#6b7280" }}>{p.tenantId ?? "—"}</span>,
              <StatusBadge value={p.panelBeaterStatus === "approved" || p.approved === 1} />,
              <span style={{ color: "#9ca3af", fontSize: 11 }}>{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}</span>,
            ])}
          />
        )}
      </div>
    </>
  );
}

function AssessorsTab() {
  const { data, isLoading } = trpc.admin.getAssessorPool.useQuery();
  const assessors: any[] = (data as any)?.assessors ?? [];
  const stats: any = (data as any)?.stats ?? {};
  return (
    <>
      <KpiStrip items={[
        { label: "Total Assessors", value: stats.total ?? 0 },
        { label: "Marketplace Active", value: stats.active ?? 0 },
        { label: "Marketplace Enabled", value: stats.marketplace ?? 0 },
      ]} />
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        {isLoading ? <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>Loading…</div> : (
          <Table
            headers={["User ID", "Type", "Certification", "Marketplace", "Status", "Licence Expiry"]}
            rows={assessors.map((a: any) => [
              <span style={{ fontFamily: "monospace", fontSize: 11 }}>#{a.userId}</span>,
              <span style={{ fontSize: 11, background: "#eff6ff", color: "#2563eb", padding: "2px 6px", borderRadius: 4 }}>{a.assessorType}</span>,
              <span style={{ fontSize: 11, background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: 4 }}>{a.certificationLevel}</span>,
              <StatusBadge value={a.marketplaceEnabled} trueLabel="Enabled" falseLabel="Disabled" />,
              <StatusBadge value={a.marketplaceStatus === "active"} trueLabel={a.marketplaceStatus} falseLabel={a.marketplaceStatus ?? "—"} />,
              <span style={{ fontSize: 11, color: a.licenseExpiryDate && new Date(a.licenseExpiryDate) < new Date() ? "#dc2626" : "#6b7280" }}>
                {a.licenseExpiryDate ? new Date(a.licenseExpiryDate).toLocaleDateString() : "—"}
              </span>,
            ])}
          />
        )}
      </div>
    </>
  );
}

function FleetTab() {
  const { data, isLoading } = trpc.admin.getFleetOperatorRegistry.useQuery();
  const fleets: any[] = (data as any)?.fleets ?? [];
  const stats: any = (data as any)?.stats ?? {};
  return (
    <>
      <KpiStrip items={[
        { label: "Fleet Accounts", value: stats.total ?? 0 },
        { label: "Active", value: stats.active ?? 0 },
        { label: "Inactive", value: (stats.total ?? 0) - (stats.active ?? 0) },
      ]} />
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        {isLoading ? <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>Loading…</div> : fleets.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No fleet accounts registered</div>
        ) : (
          <Table
            headers={["Company Name", "Status", "Tenant", "Registered"]}
            rows={fleets.map((f: any) => [
              <span style={{ fontWeight: 600 }}>{f.companyName ?? `Fleet #${f.id}`}</span>,
              <StatusBadge value={f.status === "active"} trueLabel={f.status} falseLabel={f.status ?? "—"} />,
              <span style={{ fontSize: 11, color: "#6b7280" }}>{f.tenantId ?? "—"}</span>,
              <span style={{ color: "#9ca3af", fontSize: 11 }}>{f.createdAt ? new Date(f.createdAt).toLocaleDateString() : "—"}</span>,
            ])}
          />
        )}
      </div>
    </>
  );
}

function EngineersTab() {
  const { data, isLoading } = trpc.admin.getEngineeringRegistry.useQuery();
  const engineers: any[] = (data as any)?.engineers ?? [];
  const stats: any = (data as any)?.stats ?? {};
  return (
    <>
      <KpiStrip items={[
        { label: "Engineers", value: stats.total ?? 0 },
        { label: "Available", value: stats.available ?? 0 },
        { label: "Active Inspections", value: stats.activeInspections ?? 0 },
      ]} />
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        {isLoading ? <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>Loading…</div> : engineers.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No engineer profiles registered</div>
        ) : (
          <Table
            headers={["User ID", "Region", "Availability", "Active Inspections", "Tenant", "Registered"]}
            rows={engineers.map((e: any) => [
              <span style={{ fontFamily: "monospace", fontSize: 11 }}>#{e.userId}</span>,
              <span style={{ fontSize: 12 }}>{e.region ?? "—"}</span>,
              <StatusBadge value={e.isAvailable} trueLabel="Available" falseLabel="Unavailable" />,
              <span style={{ fontWeight: e.activeInspections > 0 ? 600 : 400 }}>{e.activeInspections}</span>,
              <span style={{ fontSize: 11, color: "#6b7280" }}>{e.tenantId ?? "—"}</span>,
              <span style={{ color: "#9ca3af", fontSize: 11 }}>{e.createdAt ? new Date(e.createdAt).toLocaleDateString() : "—"}</span>,
            ])}
          />
        )}
      </div>
    </>
  );
}

export default function NetworkOversight() {
  const [activeTab, setActiveTab] = useState<Tab>("insurers");

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#F7F8F6", minHeight: "100vh", padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", margin: 0 }}>Network Oversight</h1>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>
          Complete visibility of every participant in the KINGA ecosystem
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 4, overflowX: "auto" }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "none",
                background: activeTab === tab.key ? "#111" : "transparent",
                color: activeTab === tab.key ? "#fff" : "#6b7280",
                fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              <Icon style={{ width: 13, height: 13 }} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "insurers" && <InsurersTab />}
      {activeTab === "agencies" && <AgenciesTab />}
      {activeTab === "panel_beaters" && <PanelBeatersTab />}
      {activeTab === "assessors" && <AssessorsTab />}
      {activeTab === "fleet" && <FleetTab />}
      {activeTab === "engineers" && <EngineersTab />}
    </div>
  );
}
