/**
 * FleetMaintenanceTab.tsx — Phase 2B
 * Maintenance records, alerts, and add maintenance record form.
 */
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Wrench, AlertTriangle, Plus, CheckCircle } from "lucide-react";

function AddRecordForm({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ vehicleId: "", serviceDate: new Date().toISOString().slice(0, 10), serviceType: "oil_change", serviceProvider: "", serviceLocation: "", laborCost: "", partsCost: "" });
  const add = trpc.fleetAccounts.addMaintenanceRecord.useMutation({
    onSuccess: () => { toast.success("Maintenance record added"); utils.fleetAccounts.listMaintenanceRecords.invalidate(); utils.fleetAccounts.getMaintenanceSummary.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const SERVICE_TYPES = ["oil_change","tire_rotation","brake_inspection","engine_service","transmission_service","annual_inspection","safety_inspection","filter_replacement","battery_check","coolant_flush","custom"];
  const f = (label: string, key: keyof typeof form, type = "text", opts?: string[]) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>{label}</label>
      {opts ? (
        <select value={form[key]} onChange={e => setForm(s => ({ ...s, [key]: e.target.value }))} style={{ width: "100%", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }}>
          {opts.map(o => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
        </select>
      ) : (
        <input type={type} value={form[key]} onChange={e => setForm(s => ({ ...s, [key]: e.target.value }))} style={{ width: "100%", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />
      )}
    </div>
  );
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 16 }}>
      <h4 style={{ fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 14 }}>Add Maintenance Record</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {f("Vehicle ID *", "vehicleId", "number")}
        {f("Service Date *", "serviceDate", "date")}
        {f("Service Type *", "serviceType", "text", SERVICE_TYPES)}
        {f("Service Provider", "serviceProvider")}
        {f("Labour Cost (USD cents)", "laborCost", "number")}
        {f("Parts Cost (USD cents)", "partsCost", "number")}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
        <button onClick={onClose} style={{ padding: "7px 16px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", fontSize: 12, cursor: "pointer" }}>Cancel</button>
        <button
          onClick={() => add.mutate({ vehicleId: Number(form.vehicleId), serviceDate: form.serviceDate, serviceType: form.serviceType, serviceProvider: form.serviceProvider || undefined, laborCost: form.laborCost ? Number(form.laborCost) : undefined, partsCost: form.partsCost ? Number(form.partsCost) : undefined })}
          disabled={add.isPending || !form.vehicleId || !form.serviceDate}
          style={{ padding: "7px 16px", border: "none", borderRadius: 6, background: "#111", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          {add.isPending ? "Saving…" : "Save Record"}
        </button>
      </div>
    </div>
  );
}

export function FleetMaintenanceTab() {
  const [showForm, setShowForm] = useState(false);
  const { data: records, isLoading: loadingRecords } = trpc.fleetAccounts.listMaintenanceRecords.useQuery({ limit: 50 });
  const { data: alerts, isLoading: loadingAlerts } = trpc.fleetAccounts.getMaintenanceAlerts.useQuery({ status: "pending" });
  const { data: summary } = trpc.fleetAccounts.getMaintenanceSummary.useQuery();

  const SEVERITY_COLOR: Record<string, string> = { low: "#6b7280", medium: "#d97706", high: "#ea580c", critical: "#dc2626" };

  return (
    <div style={{ padding: "16px 0" }}>
      {/* KPI Strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "Total Records", value: summary?.totalRecords ?? 0 },
          { label: "Total Cost", value: `$${((summary?.totalCost ?? 0) / 100).toFixed(0)}` },
          { label: "Pending Alerts", value: summary?.pendingAlerts ?? 0, warn: (summary?.pendingAlerts ?? 0) > 0 },
          { label: "Critical Alerts", value: summary?.criticalAlerts ?? 0, warn: (summary?.criticalAlerts ?? 0) > 0 },
        ].map(k => (
          <div key={k.label} style={{ background: "#fff", border: `1px solid ${k.warn ? "#fca5a5" : "#e5e7eb"}`, borderRadius: 8, padding: "12px 16px" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.warn ? "#dc2626" : "#111" }}>{k.value}</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(alerts?.length ?? 0) > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle style={{ width: 14, height: 14, color: "#d97706" }} /> Pending Maintenance Alerts
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(alerts ?? []).slice(0, 5).map((a: any) => (
              <div key={a.id} style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{a.title}</span>
                  <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>{a.message}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: SEVERITY_COLOR[a.severity] ?? "#6b7280", background: "#fef9c3", padding: "2px 8px", borderRadius: 20 }}>{a.severity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Record Button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h4 style={{ fontSize: 13, fontWeight: 700, color: "#111", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <Wrench style={{ width: 14, height: 14 }} /> Maintenance Records
        </h4>
        <button onClick={() => setShowForm(s => !s)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", border: "none", borderRadius: 6, background: "#111", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <Plus style={{ width: 12, height: 12 }} /> Add Record
        </button>
      </div>

      {showForm && <AddRecordForm onClose={() => setShowForm(false)} />}

      {/* Records Table */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        {loadingRecords ? (
          <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>Loading…</div>
        ) : (records?.length ?? 0) === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            <CheckCircle style={{ width: 24, height: 24, margin: "0 auto 8px", color: "#d1d5db" }} />
            No maintenance records yet
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Vehicle", "Service Type", "Date", "Provider", "Labour", "Parts", "Total"].map(h => (
                  <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #f3f4f6" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(records ?? []).map((r: any) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #f9fafb" }}>
                  <td style={{ padding: "9px 12px", fontSize: 12 }}>#{r.vehicleId}</td>
                  <td style={{ padding: "9px 12px", fontSize: 12 }}>{r.serviceType?.replace(/_/g, " ")}</td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: "#6b7280" }}>{r.serviceDate ? new Date(r.serviceDate).toLocaleDateString() : "—"}</td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: "#6b7280" }}>{r.serviceProvider ?? "—"}</td>
                  <td style={{ padding: "9px 12px", fontSize: 12 }}>{r.laborCost ? `$${(r.laborCost / 100).toFixed(0)}` : "—"}</td>
                  <td style={{ padding: "9px 12px", fontSize: 12 }}>{r.partsCost ? `$${(r.partsCost / 100).toFixed(0)}` : "—"}</td>
                  <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 600 }}>{r.totalCost ? `$${(r.totalCost / 100).toFixed(0)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
