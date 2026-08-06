import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Building2, Plus, Edit, Trash2, Settings, DollarSign, Users, Workflow,
  RefreshCw, Shield, Clock, Zap, AlertTriangle,
} from "lucide-react";

type Tenant = { id: string; name: string; displayName: string; logoUrl?: string | null; primaryColor?: string | null; pricingTier?: string | null; primaryCurrency?: string | null; createdAt?: string | null; };

function TenantsListTab() {
  const utils = trpc.useUtils();
  const { data: tenants = [], isLoading, refetch } = trpc.tenant.list.useQuery();
  const [showCreate, setShowCreate] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Tenant | null>(null);
  const [createForm, setCreateForm] = useState({ name: "", logoUrl: "", primaryColor: "#10b981", secondaryColor: "#64748b", contactEmail: "", contactPhone: "" });
  const [editForm, setEditForm] = useState({ name: "", primaryColor: "" });

  const createMutation = trpc.tenant.create.useMutation({
    onSuccess: () => { toast.success("Tenant created successfully"); setShowCreate(false); setCreateForm({ name: "", logoUrl: "", primaryColor: "#10b981", secondaryColor: "#64748b", contactEmail: "", contactPhone: "" }); utils.tenant.list.invalidate(); },
    onError: (err) => toast.error(`Failed to create tenant: ${err.message}`),
  });
  const updateMutation = trpc.tenant.update.useMutation({
    onSuccess: () => { toast.success("Tenant updated"); setEditTenant(null); utils.tenant.list.invalidate(); },
    onError: (err) => toast.error(`Failed to update tenant: ${err.message}`),
  });
  const deleteMutation = trpc.tenant.delete.useMutation({
    onSuccess: () => { toast.success("Tenant deleted"); setDeleteConfirm(null); utils.tenant.list.invalidate(); },
    onError: (err) => toast.error(`Failed to delete tenant: ${err.message}`),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-100">All Tenants</h2>
          <p className="text-xs text-gray-400 mt-0.5">{(tenants as Tenant[]).length} tenant{(tenants as Tenant[]).length !== 1 ? "s" : ""} registered</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} className="border-white/20 text-gray-300 hover:text-white hover:bg-white/10"><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-amber-500 hover:bg-amber-600 text-black font-medium"><Plus className="h-3.5 w-3.5 mr-1.5" />New Tenant</Button>
        </div>
      </div>
      {isLoading ? <div className="text-center py-12 text-gray-500 text-sm">Loading tenants…</div> : (tenants as Tenant[]).length === 0 ? <div className="text-center py-12 text-gray-500 text-sm">No tenants registered yet.</div> : (
        <div className="rounded-lg border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/10 bg-white/5">
              {["Tenant","ID","Tier","Currency","Created","Actions"].map(h => <th key={h} className={`px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider ${h === "Actions" ? "text-right" : "text-left"}`}>{h}</th>)}
            </tr></thead>
            <tbody>{(tenants as Tenant[]).map((t, i) => (
              <tr key={t.id} className={`border-b border-white/5 ${i % 2 === 0 ? "" : "bg-white/[0.02]"} hover:bg-white/5 transition-colors`}>
                <td className="px-4 py-3"><div className="flex items-center gap-2.5"><div className="h-7 w-7 rounded-md flex items-center justify-center text-xs font-bold text-white" style={{ background: t.primaryColor ?? "#10b981" }}>{(t.displayName ?? t.name).charAt(0).toUpperCase()}</div><div><p className="text-gray-100 font-medium text-sm">{t.displayName ?? t.name}</p><p className="text-gray-500 text-xs">{t.name}</p></div></div></td>
                <td className="px-4 py-3 text-gray-400 text-xs font-mono">{t.id}</td>
                <td className="px-4 py-3"><Badge variant="outline" className="text-xs border-amber-400/30 text-amber-400 capitalize">{t.pricingTier ?? "process"}</Badge></td>
                <td className="px-4 py-3 text-gray-300 text-xs">{t.primaryCurrency ?? "USD"}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditTenant(t); setEditForm({ name: t.name, primaryColor: t.primaryColor ?? "#10b981" }); }} className="h-7 px-2 text-gray-400 hover:text-gray-100 hover:bg-white/10"><Edit className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(t)} className="h-7 px-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-gray-900 border-white/20 text-gray-100 max-w-md">
          <DialogHeader><DialogTitle>Register New Tenant</DialogTitle><DialogDescription className="text-gray-400">Create a new insurer tenant on the KINGA platform.</DialogDescription></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); if (!createForm.name.trim()) { toast.error("Tenant name is required"); return; } createMutation.mutate({ name: createForm.name, logoUrl: createForm.logoUrl || undefined, primaryColor: createForm.primaryColor || undefined, secondaryColor: createForm.secondaryColor || undefined, contactEmail: createForm.contactEmail || undefined, contactPhone: createForm.contactPhone || undefined }); }} className="space-y-3 mt-2">
            <div><Label className="text-xs text-gray-400">Tenant Name *</Label><Input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Zimnat Insurance" className="mt-1 bg-gray-800 border-white/20 text-gray-100" required /></div>
            <div><Label className="text-xs text-gray-400">Contact Email</Label><Input type="email" value={createForm.contactEmail} onChange={e => setCreateForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="admin@insurer.com" className="mt-1 bg-gray-800 border-white/20 text-gray-100" /></div>
            <div><Label className="text-xs text-gray-400">Contact Phone</Label><Input value={createForm.contactPhone} onChange={e => setCreateForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="+263 77 123 4567" className="mt-1 bg-gray-800 border-white/20 text-gray-100" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-gray-400">Primary Colour</Label><Input type="color" value={createForm.primaryColor} onChange={e => setCreateForm(f => ({ ...f, primaryColor: e.target.value }))} className="mt-1 h-9 bg-gray-800 border-white/20 cursor-pointer" /></div>
              <div><Label className="text-xs text-gray-400">Secondary Colour</Label><Input type="color" value={createForm.secondaryColor} onChange={e => setCreateForm(f => ({ ...f, secondaryColor: e.target.value }))} className="mt-1 h-9 bg-gray-800 border-white/20 cursor-pointer" /></div>
            </div>
            <DialogFooter className="mt-4"><Button type="button" variant="ghost" onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-100">Cancel</Button><Button type="submit" disabled={createMutation.isPending} className="bg-amber-500 hover:bg-amber-600 text-black font-medium">{createMutation.isPending ? "Creating…" : "Create Tenant"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editTenant} onOpenChange={() => setEditTenant(null)}>
        <DialogContent className="bg-gray-900 border-white/20 text-gray-100 max-w-md">
          <DialogHeader><DialogTitle>Edit Tenant</DialogTitle><DialogDescription className="text-gray-400">Update details for {editTenant?.displayName ?? editTenant?.name}.</DialogDescription></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); if (!editTenant || !editForm.name.trim()) { toast.error("Tenant name is required"); return; } updateMutation.mutate({ tenantId: editTenant.id, name: editForm.name, primaryColor: editForm.primaryColor }); }} className="space-y-3 mt-2">
            <div><Label className="text-xs text-gray-400">Tenant Name *</Label><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="mt-1 bg-gray-800 border-white/20 text-gray-100" required /></div>
            <div><Label className="text-xs text-gray-400">Primary Colour</Label><Input type="color" value={editForm.primaryColor} onChange={e => setEditForm(f => ({ ...f, primaryColor: e.target.value }))} className="mt-1 h-9 bg-gray-800 border-white/20 cursor-pointer" /></div>
            <DialogFooter className="mt-4"><Button type="button" variant="ghost" onClick={() => setEditTenant(null)} className="text-gray-400 hover:text-gray-100">Cancel</Button><Button type="submit" disabled={updateMutation.isPending} className="bg-amber-500 hover:bg-amber-600 text-black font-medium">{updateMutation.isPending ? "Saving…" : "Save Changes"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-gray-900 border-white/20 text-gray-100 max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-400"><AlertTriangle className="h-4 w-4" />Delete Tenant</DialogTitle><DialogDescription className="text-gray-400">This will permanently delete <strong className="text-gray-200">{deleteConfirm?.displayName ?? deleteConfirm?.name}</strong> and all associated data. This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter className="mt-4"><Button variant="ghost" onClick={() => setDeleteConfirm(null)} className="text-gray-400 hover:text-gray-100">Cancel</Button><Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteConfirm && deleteMutation.mutate({ tenantId: deleteConfirm.id })}>{deleteMutation.isPending ? "Deleting…" : "Delete Permanently"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoleConfigTab() {
  const { data: tenants = [] } = trpc.tenant.list.useQuery();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [enabledRoles, setEnabledRoles] = useState<Record<string, boolean>>({});
  const utils = trpc.useUtils();
  const { data: roleConfig } = trpc.tenant.getRoleConfig.useQuery({ tenantId: selectedTenantId! }, { enabled: !!selectedTenantId });
  const updateRoleConfig = trpc.tenant.updateRoleConfig.useMutation({
    onSuccess: () => { toast.success("Role configuration saved"); if (selectedTenantId) utils.tenant.getRoleConfig.invalidate({ tenantId: selectedTenantId }); },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const ROLES = [
    { key: "claims_processor", label: "Claims Processor", desc: "Daily claim processing and document verification" },
    { key: "assessor_internal", label: "Internal Assessor", desc: "Internal assessment of claims" },
    { key: "assessor_external", label: "External Assessor", desc: "External assessment of claims" },
    { key: "risk_manager", label: "Risk Manager", desc: "Risk analysis, fraud heatmaps, exception intelligence" },
    { key: "claims_manager", label: "Claims Manager", desc: "Team oversight, claim assignment, moderate-value approvals" },
    { key: "executive", label: "Executive", desc: "Strategic insights, KPIs, and high-value approvals" },
    { key: "insurer_admin", label: "Insurer Admin", desc: "Full tenant administration" },
    { key: "recovery_officer", label: "Recovery Officer", desc: "Third-party recovery and subrogation" },
  ];
  return (
    <div className="p-6 space-y-4">
      <div><h2 className="text-base font-semibold text-gray-100">Role Configuration</h2><p className="text-xs text-gray-400 mt-0.5">Enable or disable insurer sub-roles per tenant.</p></div>
      <div><Label className="text-xs text-gray-400">Select Tenant</Label>
        <select value={selectedTenantId ?? ""} onChange={e => { setSelectedTenantId(e.target.value || null); setEnabledRoles({}); }} className="mt-1 w-full max-w-xs rounded-md border border-white/20 bg-gray-800 text-gray-100 text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-400">
          <option value="">— Select a tenant —</option>
          {(tenants as Tenant[]).map(t => <option key={t.id} value={t.id}>{t.displayName ?? t.name}</option>)}
        </select>
      </div>
      {selectedTenantId && (
        <div className="space-y-3">
          <div className="rounded-lg border border-white/10 overflow-hidden">
            {ROLES.map((role, i) => {
              const isEnabled = enabledRoles[role.key] ?? (roleConfig as any)?.[role.key] ?? true;
              return (
                <div key={role.key} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-white/5" : ""} hover:bg-white/5 transition-colors`}>
                  <div><p className="text-sm font-medium text-gray-200">{role.label}</p><p className="text-xs text-gray-500 mt-0.5">{role.desc}</p></div>
                  <button onClick={() => setEnabledRoles(prev => ({ ...prev, [role.key]: !isEnabled }))} className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${isEnabled ? "bg-amber-500" : "bg-gray-600"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${isEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end"><Button onClick={() => updateRoleConfig.mutate({ tenantId: selectedTenantId, roleConfig: enabledRoles })} disabled={updateRoleConfig.isPending} className="bg-amber-500 hover:bg-amber-600 text-black font-medium">{updateRoleConfig.isPending ? "Saving…" : "Save Role Configuration"}</Button></div>
        </div>
      )}
    </div>
  );
}

function WorkflowSlaTab() {
  const { data: tenants = [] } = trpc.tenant.list.useQuery();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [wf, setWf] = useState<Record<string, string>>({});
  const [slaForm, setSlaForm] = useState<Record<string, string>>({});
  const utils = trpc.useUtils();
  const { data: thresholds } = trpc.tenant.getWorkflowThresholds.useQuery({ tenantId: selectedTenantId! }, { enabled: !!selectedTenantId });
  const { data: sla } = trpc.tenant.getSlaConfig.useQuery({ tenantId: selectedTenantId! }, { enabled: !!selectedTenantId });
  const updateThresholds = trpc.tenant.updateWorkflowThresholds.useMutation({ onSuccess: () => { toast.success("Thresholds saved"); utils.tenant.getWorkflowThresholds.invalidate({ tenantId: selectedTenantId! }); }, onError: (err) => toast.error(`Failed: ${err.message}`) });
  const updateSla = trpc.tenant.updateSlaConfig.useMutation({ onSuccess: () => { toast.success("SLA saved"); utils.tenant.getSlaConfig.invalidate({ tenantId: selectedTenantId! }); }, onError: (err) => toast.error(`Failed: ${err.message}`) });
  return (
    <div className="p-6 space-y-6">
      <div><h2 className="text-base font-semibold text-gray-100">Workflow & SLA Configuration</h2><p className="text-xs text-gray-400 mt-0.5">Configure approval thresholds and SLA targets per tenant.</p></div>
      <div><Label className="text-xs text-gray-400">Select Tenant</Label>
        <select value={selectedTenantId ?? ""} onChange={e => setSelectedTenantId(e.target.value || null)} className="mt-1 w-full max-w-xs rounded-md border border-white/20 bg-gray-800 text-gray-100 text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-400">
          <option value="">— Select a tenant —</option>
          {(tenants as Tenant[]).map(t => <option key={t.id} value={t.id}>{t.displayName ?? t.name}</option>)}
        </select>
      </div>
      {selectedTenantId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border border-white/10 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2"><Zap className="h-4 w-4 text-amber-400" /><h3 className="text-sm font-semibold text-gray-200">Approval Thresholds (USD)</h3></div>
            {[{ key: "autoApprovalLimit", label: "Auto-Approval Limit", ph: (thresholds as any)?.autoApprovalLimit ?? "5000" }, { key: "managerApprovalLimit", label: "Manager Approval Limit", ph: (thresholds as any)?.managerApprovalLimit ?? "10000" }, { key: "executiveApprovalLimit", label: "Executive Approval Limit", ph: (thresholds as any)?.executiveApprovalLimit ?? "50000" }].map(f => (
              <div key={f.key}><Label className="text-xs text-gray-400">{f.label}</Label><Input type="number" value={wf[f.key] ?? ""} onChange={e => setWf(p => ({ ...p, [f.key]: e.target.value }))} placeholder={String(f.ph)} className="mt-1 bg-gray-800 border-white/20 text-gray-100" /></div>
            ))}
            <Button onClick={() => updateThresholds.mutate({ tenantId: selectedTenantId, autoApprovalLimit: wf.autoApprovalLimit ? Number(wf.autoApprovalLimit) : undefined, managerApprovalLimit: wf.managerApprovalLimit ? Number(wf.managerApprovalLimit) : undefined, executiveApprovalLimit: wf.executiveApprovalLimit ? Number(wf.executiveApprovalLimit) : undefined })} disabled={updateThresholds.isPending} size="sm" className="w-full bg-amber-500 hover:bg-amber-600 text-black font-medium mt-2">{updateThresholds.isPending ? "Saving…" : "Save Thresholds"}</Button>
          </div>
          <div className="rounded-lg border border-white/10 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2"><Clock className="h-4 w-4 text-amber-400" /><h3 className="text-sm font-semibold text-gray-200">SLA Targets (days)</h3></div>
            {[{ key: "targetDaysSimple", label: "Simple Claims", ph: (sla as any)?.targetDaysSimple ?? "3" }, { key: "targetDaysModerate", label: "Moderate Claims", ph: (sla as any)?.targetDaysModerate ?? "7" }, { key: "targetDaysComplex", label: "Complex Claims", ph: (sla as any)?.targetDaysComplex ?? "14" }, { key: "warningThresholdPercent", label: "Warning Threshold (%)", ph: (sla as any)?.warningThresholdPercent ?? "80" }].map(f => (
              <div key={f.key}><Label className="text-xs text-gray-400">{f.label}</Label><Input type="number" value={slaForm[f.key] ?? ""} onChange={e => setSlaForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={String(f.ph)} className="mt-1 bg-gray-800 border-white/20 text-gray-100" /></div>
            ))}
            <Button onClick={() => updateSla.mutate({ tenantId: selectedTenantId, targetDaysSimple: slaForm.targetDaysSimple ? Number(slaForm.targetDaysSimple) : undefined, targetDaysModerate: slaForm.targetDaysModerate ? Number(slaForm.targetDaysModerate) : undefined, targetDaysComplex: slaForm.targetDaysComplex ? Number(slaForm.targetDaysComplex) : undefined, warningThresholdPercent: slaForm.warningThresholdPercent ? Number(slaForm.warningThresholdPercent) : undefined })} disabled={updateSla.isPending} size="sm" className="w-full bg-amber-500 hover:bg-amber-600 text-black font-medium mt-2">{updateSla.isPending ? "Saving…" : "Save SLA Config"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CurrencyRatesTab() {
  const { data: tenants = [] } = trpc.tenant.list.useQuery();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [currencyForm, setCurrencyForm] = useState({ currencyCode: "", currencySymbol: "", country: "" });
  const [ratesForm, setRatesForm] = useState({ labourRateUsdPerHour: "", paintCostPerPanelUsd: "" });
  const utils = trpc.useUtils();
  const { data: rates } = trpc.tenant.getRates.useQuery({ tenantId: selectedTenantId! }, { enabled: !!selectedTenantId });
  const updateCurrency = trpc.tenant.updateCurrency.useMutation({ onSuccess: () => { toast.success("Currency saved"); utils.tenant.getRates.invalidate({ tenantId: selectedTenantId! }); }, onError: (err) => toast.error(`Failed: ${err.message}`) });
  const updateRates = trpc.tenant.updateRates.useMutation({ onSuccess: () => { toast.success("Rates saved"); utils.tenant.getRates.invalidate({ tenantId: selectedTenantId! }); }, onError: (err) => toast.error(`Failed: ${err.message}`) });
  return (
    <div className="p-6 space-y-6">
      <div><h2 className="text-base font-semibold text-gray-100">Currency & Cost Rates</h2><p className="text-xs text-gray-400 mt-0.5">Configure currency settings and cost rate overrides per tenant.</p></div>
      <div><Label className="text-xs text-gray-400">Select Tenant</Label>
        <select value={selectedTenantId ?? ""} onChange={e => setSelectedTenantId(e.target.value || null)} className="mt-1 w-full max-w-xs rounded-md border border-white/20 bg-gray-800 text-gray-100 text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-400">
          <option value="">— Select a tenant —</option>
          {(tenants as Tenant[]).map(t => <option key={t.id} value={t.id}>{t.displayName ?? t.name}</option>)}
        </select>
      </div>
      {selectedTenantId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border border-white/10 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2"><DollarSign className="h-4 w-4 text-amber-400" /><h3 className="text-sm font-semibold text-gray-200">Currency Settings</h3></div>
            <div><Label className="text-xs text-gray-400">Currency Code (e.g. USD, ZAR)</Label><Input value={currencyForm.currencyCode} onChange={e => setCurrencyForm(f => ({ ...f, currencyCode: e.target.value }))} placeholder="USD" className="mt-1 bg-gray-800 border-white/20 text-gray-100" /></div>
            <div><Label className="text-xs text-gray-400">Currency Symbol (e.g. $, R)</Label><Input value={currencyForm.currencySymbol} onChange={e => setCurrencyForm(f => ({ ...f, currencySymbol: e.target.value }))} placeholder="$" className="mt-1 bg-gray-800 border-white/20 text-gray-100" /></div>
            <div><Label className="text-xs text-gray-400">Country Code (ISO 3166-1 alpha-2)</Label><Input value={currencyForm.country} onChange={e => setCurrencyForm(f => ({ ...f, country: e.target.value.toUpperCase() }))} placeholder="ZW" maxLength={2} className="mt-1 bg-gray-800 border-white/20 text-gray-100" /></div>
            <Button onClick={() => updateCurrency.mutate({ tenantId: selectedTenantId, currencyCode: currencyForm.currencyCode, currencySymbol: currencyForm.currencySymbol, country: currencyForm.country || null })} disabled={updateCurrency.isPending || !currencyForm.currencyCode || !currencyForm.currencySymbol} size="sm" className="w-full bg-amber-500 hover:bg-amber-600 text-black font-medium mt-2">{updateCurrency.isPending ? "Saving…" : "Save Currency"}</Button>
          </div>
          <div className="rounded-lg border border-white/10 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2"><Settings className="h-4 w-4 text-amber-400" /><h3 className="text-sm font-semibold text-gray-200">Cost Rate Overrides</h3></div>
            <p className="text-xs text-gray-500">Current: Labour ${(rates as any)?.labourRateUsdPerHour ?? "regional default"}/hr · Paint ${(rates as any)?.paintCostPerPanelUsd ?? "regional default"}/panel</p>
            <div><Label className="text-xs text-gray-400">Labour Rate (USD/hour)</Label><Input type="number" value={ratesForm.labourRateUsdPerHour} onChange={e => setRatesForm(f => ({ ...f, labourRateUsdPerHour: e.target.value }))} placeholder="Leave blank for regional default" className="mt-1 bg-gray-800 border-white/20 text-gray-100" /></div>
            <div><Label className="text-xs text-gray-400">Paint Cost (USD/panel)</Label><Input type="number" value={ratesForm.paintCostPerPanelUsd} onChange={e => setRatesForm(f => ({ ...f, paintCostPerPanelUsd: e.target.value }))} placeholder="Leave blank for regional default" className="mt-1 bg-gray-800 border-white/20 text-gray-100" /></div>
            <Button onClick={() => updateRates.mutate({ tenantId: selectedTenantId, labourRateUsdPerHour: ratesForm.labourRateUsdPerHour ? Number(ratesForm.labourRateUsdPerHour) : null, paintCostPerPanelUsd: ratesForm.paintCostPerPanelUsd ? Number(ratesForm.paintCostPerPanelUsd) : null })} disabled={updateRates.isPending} size="sm" className="w-full bg-amber-500 hover:bg-amber-600 text-black font-medium mt-2">{updateRates.isPending ? "Saving…" : "Save Cost Rates"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: "list" as const, label: "All Tenants", icon: Building2 },
  { id: "roles" as const, label: "Role Configuration", icon: Shield },
  { id: "workflow" as const, label: "Workflow & SLA", icon: Workflow },
  { id: "currency" as const, label: "Currency & Rates", icon: DollarSign },
];

export default function TenantManagement() {
  const [activeTab, setActiveTab] = useState<"list" | "roles" | "workflow" | "currency">("list");
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-0.5 px-6 pt-4 border-b border-white/10">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === tab.id ? "border-amber-400 text-amber-400" : "border-transparent text-gray-400 hover:text-gray-200 hover:border-white/20"}`}>
              <Icon className="h-3.5 w-3.5" />{tab.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === "list" && <TenantsListTab />}
        {activeTab === "roles" && <RoleConfigTab />}
        {activeTab === "workflow" && <WorkflowSlaTab />}
        {activeTab === "currency" && <CurrencyRatesTab />}
      </div>
    </div>
  );
}
