/**
 * FleetFuelLicensingTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * M-02: Fleet fuel tracking
 * M-03: Fleet licensing and compliance records
 * Combined into a single tabbed component for the Fleet Manager Dashboard.
 */

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Fuel, FileCheck, Plus, AlertTriangle, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const LICENSE_TYPE_LABELS: Record<string, string> = {
  vehicle_license: "Vehicle License",
  roadworthy: "Roadworthy",
  operator_permit: "Operator Permit",
  cross_border: "Cross-Border",
  other: "Other",
};

// ─── Add Fuel Record Form ─────────────────────────────────────────────────────

function AddFuelRecordDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    vehicleRegistration: "",
    fuelDate: new Date().toISOString().slice(0, 10),
    litres: "",
    costPerLitre: "",
    totalCostCents: "",
    fuelType: "petrol" as const,
    stationName: "",
    odometer: "",
  });

  const utils = trpc.useUtils();
  const addFuel = trpc.fleetAccounts.addFuelRecord.useMutation({
    onSuccess: () => {
      toast.success("Fuel record added");
      utils.fleetAccounts.listFuelRecords.invalidate();
      utils.fleetAccounts.getFuelSummary.invalidate();
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicleRegistration || !form.litres || !form.totalCostCents) {
      toast.error("Please fill in all required fields");
      return;
    }
    addFuel.mutate({
      vehicleRegistration: form.vehicleRegistration,
      fuelDate: form.fuelDate,
      litres: Number(form.litres),
      costPerLitre: form.costPerLitre ? Number(form.costPerLitre) : undefined,
      totalCostCents: Math.round(Number(form.totalCostCents) * 100),
      fuelType: form.fuelType,
      stationName: form.stationName || undefined,
      odometer: form.odometer ? Number(form.odometer) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Fuel Record
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Fuel Record</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Vehicle Registration *</Label>
              <Input value={form.vehicleRegistration} onChange={e => setForm(f => ({ ...f, vehicleRegistration: e.target.value }))} placeholder="e.g. ABC 123 GP" className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Date *</Label>
              <Input type="date" value={form.fuelDate} onChange={e => setForm(f => ({ ...f, fuelDate: e.target.value }))} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Fuel Type</Label>
              <Select value={form.fuelType} onValueChange={(v: any) => setForm(f => ({ ...f, fuelType: v }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['petrol','diesel','electric','hybrid','lpg'].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Litres *</Label>
              <Input type="number" step="0.01" value={form.litres} onChange={e => setForm(f => ({ ...f, litres: e.target.value }))} placeholder="50.00" className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Total Cost ($) *</Label>
              <Input type="number" step="0.01" value={form.totalCostCents} onChange={e => setForm(f => ({ ...f, totalCostCents: e.target.value }))} placeholder="85.00" className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Cost/Litre ($)</Label>
              <Input type="number" step="0.0001" value={form.costPerLitre} onChange={e => setForm(f => ({ ...f, costPerLitre: e.target.value }))} placeholder="1.70" className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Odometer (km)</Label>
              <Input type="number" value={form.odometer} onChange={e => setForm(f => ({ ...f, odometer: e.target.value }))} placeholder="45000" className="h-8 text-sm mt-1" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Station Name</Label>
              <Input value={form.stationName} onChange={e => setForm(f => ({ ...f, stationName: e.target.value }))} placeholder="e.g. Shell Sandton" className="h-8 text-sm mt-1" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={addFuel.isPending}>
              {addFuel.isPending ? "Saving…" : "Save Record"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Licensing Record Form ────────────────────────────────────────────────

function AddLicensingDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    vehicleRegistration: "",
    licenseType: "vehicle_license" as const,
    licenseNumber: "",
    expiryDate: "",
    issuingAuthority: "",
    costCents: "",
  });

  const utils = trpc.useUtils();
  const addLicense = trpc.fleetAccounts.addLicensingRecord.useMutation({
    onSuccess: () => {
      toast.success("Licensing record added");
      utils.fleetAccounts.listLicensingRecords.invalidate();
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicleRegistration || !form.expiryDate) {
      toast.error("Vehicle registration and expiry date are required");
      return;
    }
    addLicense.mutate({
      vehicleRegistration: form.vehicleRegistration,
      licenseType: form.licenseType,
      licenseNumber: form.licenseNumber || undefined,
      expiryDate: form.expiryDate,
      issuingAuthority: form.issuingAuthority || undefined,
      costCents: form.costCents ? Math.round(Number(form.costCents) * 100) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add License Record
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Licensing Record</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Vehicle Registration *</Label>
              <Input value={form.vehicleRegistration} onChange={e => setForm(f => ({ ...f, vehicleRegistration: e.target.value }))} placeholder="e.g. ABC 123 GP" className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">License Type *</Label>
              <Select value={form.licenseType} onValueChange={(v: any) => setForm(f => ({ ...f, licenseType: v }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LICENSE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">License Number</Label>
              <Input value={form.licenseNumber} onChange={e => setForm(f => ({ ...f, licenseNumber: e.target.value }))} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Expiry Date *</Label>
              <Input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Cost ($)</Label>
              <Input type="number" step="0.01" value={form.costCents} onChange={e => setForm(f => ({ ...f, costCents: e.target.value }))} className="h-8 text-sm mt-1" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Issuing Authority</Label>
              <Input value={form.issuingAuthority} onChange={e => setForm(f => ({ ...f, issuingAuthority: e.target.value }))} className="h-8 text-sm mt-1" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={addLicense.isPending}>
              {addLicense.isPending ? "Saving…" : "Save Record"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function FleetFuelLicensingTab() {
  const [activeTab, setActiveTab] = useState("fuel");

  const { data: fuelData, isLoading: fuelLoading, refetch: refetchFuel } =
    trpc.fleetAccounts.listFuelRecords.useQuery({ limit: 25 });

  const { data: fuelSummary } = trpc.fleetAccounts.getFuelSummary.useQuery();

  const { data: licenseData, isLoading: licLoading, refetch: refetchLic } =
    trpc.fleetAccounts.listLicensingRecords.useQuery({ limit: 25 });

  const { data: expiringLicenses } =
    trpc.fleetAccounts.getExpiringLicenses.useQuery({ daysAhead: 30 });

  const fuelRecords = fuelData?.records ?? [];
  const licRecords = licenseData?.records ?? [];
  const expiring = expiringLicenses ?? [];

  return (
    <div className="p-6 space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList className="h-8">
            <TabsTrigger value="fuel" className="text-xs gap-1.5">
              <Fuel className="h-3.5 w-3.5" /> Fuel Records
            </TabsTrigger>
            <TabsTrigger value="licensing" className="text-xs gap-1.5">
              <FileCheck className="h-3.5 w-3.5" /> Licensing
              {expiring.length > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs px-1 py-0">{expiring.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <div>
            {activeTab === "fuel" && <AddFuelRecordDialog onSuccess={() => refetchFuel()} />}
            {activeTab === "licensing" && <AddLicensingDialog onSuccess={() => refetchLic()} />}
          </div>
        </div>

        {/* ── Fuel Tab ── */}
        <TabsContent value="fuel" className="mt-0 space-y-4">
          {/* Summary strip */}
          {fuelSummary && (
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-card border border-border rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Total Litres</p>
                <p className="text-lg font-bold">{fuelSummary.totalLitres.toFixed(0)}L</p>
              </div>
              <div className="p-3 bg-card border border-border rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Total Fuel Cost</p>
                <p className="text-lg font-bold text-emerald-600">{fmtCents(fuelSummary.totalCostCents)}</p>
              </div>
              <div className="p-3 bg-card border border-border rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Records</p>
                <p className="text-lg font-bold">{fuelSummary.recordCount}</p>
              </div>
            </div>
          )}

          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              {fuelLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : fuelRecords.length === 0 ? (
                <div className="py-12 text-center">
                  <Fuel className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-muted-foreground">No fuel records yet. Add your first fill-up above.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
                      <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Date</th>
                      <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Type</th>
                      <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">Litres</th>
                      <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">Cost</th>
                      <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">Odometer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fuelRecords.map((r: any) => (
                      <tr key={r.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-4 text-sm font-mono font-medium">{r.vehicleRegistration}</td>
                        <td className="py-2.5 px-4 text-sm text-muted-foreground">{new Date(r.fuelDate).toLocaleDateString()}</td>
                        <td className="py-2.5 px-4 text-sm capitalize">{r.fuelType}</td>
                        <td className="py-2.5 px-4 text-sm text-right">{Number(r.litres).toFixed(1)}L</td>
                        <td className="py-2.5 px-4 text-sm font-medium text-right">{fmtCents(r.totalCostCents)}</td>
                        <td className="py-2.5 px-4 text-sm text-muted-foreground text-right">{r.odometer ? `${r.odometer.toLocaleString()} km` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Licensing Tab ── */}
        <TabsContent value="licensing" className="mt-0 space-y-4">
          {/* Expiring soon alert */}
          {expiring.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  {expiring.length} license{expiring.length !== 1 ? "s" : ""} expiring within 30 days
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  {expiring.map((e: any) => `${e.vehicleRegistration} (${LICENSE_TYPE_LABELS[e.licenseType] ?? e.licenseType})`).join(", ")}
                </p>
              </div>
            </div>
          )}

          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              {licLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : licRecords.length === 0 ? (
                <div className="py-12 text-center">
                  <FileCheck className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-muted-foreground">No licensing records yet. Add your first record above.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
                      <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Type</th>
                      <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">License #</th>
                      <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Expiry</th>
                      <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {licRecords.map((r: any) => {
                      const days = daysUntil(r.expiryDate);
                      const isExpired = days < 0;
                      const isExpiringSoon = days >= 0 && days <= 30;
                      return (
                        <tr key={r.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 px-4 text-sm font-mono font-medium">{r.vehicleRegistration}</td>
                          <td className="py-2.5 px-4 text-sm">{LICENSE_TYPE_LABELS[r.licenseType] ?? r.licenseType}</td>
                          <td className="py-2.5 px-4 text-sm text-muted-foreground">{r.licenseNumber || "—"}</td>
                          <td className="py-2.5 px-4 text-sm">
                            <span className={isExpired ? "text-red-600 font-medium" : isExpiringSoon ? "text-amber-600 font-medium" : ""}>
                              {new Date(r.expiryDate).toLocaleDateString()}
                              {isExpiringSoon && !isExpired && ` (${days}d)`}
                            </span>
                          </td>
                          <td className="py-2.5 px-4">
                            {isExpired ? (
                              <span className="inline-flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="h-3 w-3" /> Expired</span>
                            ) : isExpiringSoon ? (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-600"><Clock className="h-3 w-3" /> Expiring Soon</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Active</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
