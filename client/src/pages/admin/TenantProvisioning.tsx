/**
 * TenantProvisioning.tsx — Phase 1C
 * Step-by-step wizard for provisioning a new KINGA tenant.
 * Steps: Identity → Currency → SLA → Roles → Review & Create
 */
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle, ChevronRight, Building2, DollarSign, Clock, Shield, Rocket } from "lucide-react";

const STEPS = [
  { id: 1, label: "Identity", icon: Building2 },
  { id: 2, label: "Currency", icon: DollarSign },
  { id: 3, label: "SLA", icon: Clock },
  { id: 4, label: "Roles", icon: Shield },
  { id: 5, label: "Review", icon: Rocket },
];

const ALL_ROLES = ["claims_processor","assessor_internal","assessor_external","risk_manager","claims_manager","executive","insurer_admin","recovery_officer"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 28 }}>
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done = step.id < current;
        const active = step.id === current;
        return (
          <div key={step.id} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: done ? "#16a34a" : active ? "#111" : "#e5e7eb", color: done || active ? "#fff" : "#9ca3af", fontSize: 14 }}>
                {done ? <CheckCircle style={{ width: 18, height: 18 }} /> : <Icon style={{ width: 16, height: 16 }} />}
              </div>
              <span style={{ fontSize: 10, color: active ? "#111" : "#9ca3af", fontWeight: active ? 600 : 400 }}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ width: 60, height: 2, background: done ? "#16a34a" : "#e5e7eb", margin: "0 4px", marginBottom: 16 }} />}
          </div>
        );
      })}
    </div>
  );
}

export default function TenantProvisioning() {
  const [step, setStep] = useState(1);
  const [created, setCreated] = useState<any>(null);

  // Step 1: Identity
  const [identity, setIdentity] = useState({ name: "", contactEmail: "", contactPhone: "", primaryColor: "#10b981" });
  // Step 2: Currency
  const [currency, setCurrency] = useState({ currencyCode: "USD", currencySymbol: "$", country: "US", labourRateUsdPerHour: "45", paintCostPerPanelUsd: "120" });
  // Step 3: SLA
  const [sla, setSla] = useState({ targetDaysSimple: "3", targetDaysModerate: "7", targetDaysComplex: "14", targetDaysExceptional: "21", warningThresholdPercent: "80" });
  // Step 4: Roles
  const [roles, setRoles] = useState<string[]>(["claims_processor", "claims_manager", "insurer_admin"]);

  const createTenant = trpc.tenant.create.useMutation();
  const updateCurrency = trpc.tenant.updateCurrency.useMutation();
  const updateRates = trpc.tenant.updateRates.useMutation();
  const updateSla = trpc.tenant.updateSlaConfig.useMutation();
  const updateRoleConfig = trpc.tenant.updateRoleConfig.useMutation();

  async function handleCreate() {
    try {
      const tenant = await createTenant.mutateAsync({ name: identity.name, contactEmail: identity.contactEmail || undefined, contactPhone: identity.contactPhone || undefined, primaryColor: identity.primaryColor });
      const tenantId = tenant.id;
      await Promise.all([
        updateCurrency.mutateAsync({ tenantId, currencyCode: currency.currencyCode, currencySymbol: currency.currencySymbol, country: currency.country }),
        updateRates.mutateAsync({ tenantId, labourRateUsdPerHour: Number(currency.labourRateUsdPerHour), paintCostPerPanelUsd: Number(currency.paintCostPerPanelUsd) }),
        updateSla.mutateAsync({ tenantId, targetDaysSimple: Number(sla.targetDaysSimple), targetDaysModerate: Number(sla.targetDaysModerate), targetDaysComplex: Number(sla.targetDaysComplex), targetDaysExceptional: Number(sla.targetDaysExceptional), warningThresholdPercent: Number(sla.warningThresholdPercent) }),
        updateRoleConfig.mutateAsync({ tenantId, roleConfig: roles }),
      ]);
      setCreated(tenant);
      toast.success(`Tenant "${identity.name}" provisioned successfully`);
    } catch (e: any) {
      toast.error(e.message ?? "Provisioning failed");
    }
  }

  const field = (label: string, value: string, onChange: (v: string) => void, type = "text", placeholder = "") => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, boxSizing: "border-box" }} />
    </div>
  );

  if (created) {
    return (
      <div style={{ fontFamily: "Inter, sans-serif", background: "#F7F8F6", minHeight: "100vh", padding: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 40, maxWidth: 480, width: "100%", textAlign: "center" }}>
          <CheckCircle style={{ width: 48, height: 48, color: "#16a34a", margin: "0 auto 16px" }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111", marginBottom: 8 }}>Tenant Provisioned</h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
            <strong>{created.name}</strong> has been created with ID <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{created.id}</code>
          </p>
          <div style={{ background: "#f9fafb", borderRadius: 8, padding: 16, textAlign: "left", marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8, fontWeight: 600 }}>NEXT STEPS</div>
            {["Create the initial admin user and assign insurer_admin role", "Configure automation policies and approval thresholds", "Submit a test claim to validate the pipeline", "Invite operational users and assign roles"].map((step, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, background: "#111", color: "#fff", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                <span style={{ fontSize: 12, color: "#374151" }}>{step}</span>
              </div>
            ))}
          </div>
          <button onClick={() => { setCreated(null); setStep(1); setIdentity({ name: "", contactEmail: "", contactPhone: "", primaryColor: "#10b981" }); }} style={{ padding: "10px 24px", background: "#111", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Provision Another Tenant
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#F7F8F6", minHeight: "100vh", padding: "24px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", margin: 0 }}>Provision New Tenant</h1>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Create a new KINGA tenant with full configuration</p>
      </div>

      <div style={{ maxWidth: 600, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "28px 32px" }}>
        <StepIndicator current={step} />

        {/* Step 1: Identity */}
        {step === 1 && (
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 16 }}>Tenant Identity</h3>
            {field("Tenant Name *", identity.name, v => setIdentity(s => ({ ...s, name: v })), "text", "e.g. Zimnat Insurance")}
            {field("Contact Email", identity.contactEmail, v => setIdentity(s => ({ ...s, contactEmail: v })), "email", "admin@insurer.com")}
            {field("Contact Phone", identity.contactPhone, v => setIdentity(s => ({ ...s, contactPhone: v })), "text", "+263 77 000 0000")}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Brand Colour</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="color" value={identity.primaryColor} onChange={e => setIdentity(s => ({ ...s, primaryColor: e.target.value }))} style={{ width: 40, height: 36, border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer" }} />
                <span style={{ fontSize: 12, color: "#6b7280" }}>{identity.primaryColor}</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Currency */}
        {step === 2 && (
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 16 }}>Currency & Cost Rates</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {field("Currency Code *", currency.currencyCode, v => setCurrency(s => ({ ...s, currencyCode: v })), "text", "USD")}
              {field("Currency Symbol *", currency.currencySymbol, v => setCurrency(s => ({ ...s, currencySymbol: v })), "text", "$")}
              {field("Country Code (2-letter)", currency.country, v => setCurrency(s => ({ ...s, country: v.toUpperCase().slice(0, 2) })), "text", "US")}
              {field("Labour Rate (USD/hr)", currency.labourRateUsdPerHour, v => setCurrency(s => ({ ...s, labourRateUsdPerHour: v })), "number", "45")}
              {field("Paint Cost per Panel (USD)", currency.paintCostPerPanelUsd, v => setCurrency(s => ({ ...s, paintCostPerPanelUsd: v })), "number", "120")}
            </div>
          </div>
        )}

        {/* Step 3: SLA */}
        {step === 3 && (
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 4 }}>SLA Configuration</h3>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>Target resolution days by claim complexity</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {field("Simple Claims (days)", sla.targetDaysSimple, v => setSla(s => ({ ...s, targetDaysSimple: v })), "number", "3")}
              {field("Moderate Claims (days)", sla.targetDaysModerate, v => setSla(s => ({ ...s, targetDaysModerate: v })), "number", "7")}
              {field("Complex Claims (days)", sla.targetDaysComplex, v => setSla(s => ({ ...s, targetDaysComplex: v })), "number", "14")}
              {field("Exceptional Claims (days)", sla.targetDaysExceptional, v => setSla(s => ({ ...s, targetDaysExceptional: v })), "number", "21")}
              {field("Warning Threshold (%)", sla.warningThresholdPercent, v => setSla(s => ({ ...s, warningThresholdPercent: v })), "number", "80")}
            </div>
          </div>
        )}

        {/* Step 4: Roles */}
        {step === 4 && (
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 4 }}>Role Configuration</h3>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>Select which roles are enabled for this tenant</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {ALL_ROLES.map(role => (
                <label key={role} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: `1px solid ${roles.includes(role) ? "#111" : "#e5e7eb"}`, borderRadius: 7, cursor: "pointer", background: roles.includes(role) ? "#f9fafb" : "#fff" }}>
                  <input type="checkbox" checked={roles.includes(role)} onChange={e => setRoles(prev => e.target.checked ? [...prev, role] : prev.filter(r => r !== role))} style={{ accentColor: "#111" }} />
                  <span style={{ fontSize: 12, color: "#374151" }}>{role.replace(/_/g, " ")}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 16 }}>Review & Create</h3>
            {[
              { label: "Tenant Name", value: identity.name },
              { label: "Contact Email", value: identity.contactEmail || "—" },
              { label: "Currency", value: `${currency.currencyCode} (${currency.currencySymbol}) — ${currency.country}` },
              { label: "Labour Rate", value: `$${currency.labourRateUsdPerHour}/hr` },
              { label: "SLA (Simple / Moderate / Complex)", value: `${sla.targetDaysSimple} / ${sla.targetDaysModerate} / ${sla.targetDaysComplex} days` },
              { label: "Enabled Roles", value: roles.join(", ") || "None" },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                <span style={{ fontSize: 12, color: "#6b7280" }}>{row.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#111", maxWidth: 280, textAlign: "right" }}>{row.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
          <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} style={{ padding: "9px 20px", border: "1px solid #e5e7eb", borderRadius: 7, background: "#fff", fontSize: 13, cursor: step === 1 ? "not-allowed" : "pointer", color: step === 1 ? "#d1d5db" : "#374151" }}>
            ← Back
          </button>
          {step < 5 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !identity.name.trim()} style={{ padding: "9px 20px", border: "none", borderRadius: 7, background: step === 1 && !identity.name.trim() ? "#d1d5db" : "#111", color: "#fff", fontSize: 13, fontWeight: 600, cursor: step === 1 && !identity.name.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              Next <ChevronRight style={{ width: 14, height: 14 }} />
            </button>
          ) : (
            <button onClick={handleCreate} disabled={createTenant.isPending} style={{ padding: "9px 24px", border: "none", borderRadius: 7, background: "#16a34a", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Rocket style={{ width: 14, height: 14 }} />
              {createTenant.isPending ? "Provisioning…" : "Create Tenant"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
