/**
 * EngineerInspectionList.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Epic 3 — E3-T13
 *
 * Engineering Workspace — All Inspections
 * Full register with status and type filters, pagination, and create dialog.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  HardHat, Plus, Search, ArrowRight, ChevronLeft, ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { toast } from "sonner";

const INSPECTION_STATUSES = [
  "assigned","scheduled","in_progress","evidence_capture","measurements_complete",
  "observations_complete","ai_analysis","engineer_review","physics_reconciliation",
  "report_generation","complete","cancelled",
] as const;

const INSPECTION_TYPES = [
  "vehicle","fleet","equipment","industrial",
  "engineering","risk_survey","property",
] as const;

const STATUS_COLOURS: Record<string, string> = {
  assigned:"#2980b9", in_progress:"#f39c12", measurements_complete:"#8e44ad",
  observations_complete:"#16a085", ai_analysis:"#27ae60", physics_reconciliation:"#1abc9c",
  engineer_review:"#e67e22", complete:"#27ae60", cancelled:"#95a5a6",
};

export default function EngineerInspectionList() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [form, setForm] = useState({
    inspectionType: "vehicle" as typeof INSPECTION_TYPES[number],
    vehicleRegistration: "",
    assetRef: "",
    locationAddress: "",
    scheduledDate: "",

  });

  const { data, isLoading } = trpc.inspections.list.useQuery({
    page,
    pageSize: 15,
    status: statusFilter !== "all" ? (statusFilter as typeof INSPECTION_STATUSES[number]) : undefined,
    inspectionType: typeFilter !== "all" ? (typeFilter as typeof INSPECTION_TYPES[number]) : undefined,
  });
  const inspections = (data?.inspections ?? []) as Record<string, unknown>[];
  const totalPages = data?.totalPages ?? 1;

  const createMutation = trpc.inspections.create.useMutation({
    onSuccess: (result) => {
      toast.success(`Inspection ${(result as Record<string, unknown>).inspectionRef ?? ""} created.`);
      utils.inspections.list.invalidate();
      setShowCreate(false);
      setForm({
        inspectionType: "vehicle",
        vehicleRegistration: "",
        assetRef: "",
        locationAddress: "",
        scheduledDate: "",
      });
    },
    onError: (err) => toast.error(err.message),
  });

  function handleCreate() {
    createMutation.mutate({
      inspectionType: form.inspectionType,
      assetType: form.inspectionType,
      vehicleRegistration: form.vehicleRegistration || undefined,
      assetRef: form.assetRef || undefined,
      locationAddress: form.locationAddress || undefined,
      scheduledDate: form.scheduledDate ? new Date(form.scheduledDate).toISOString() : undefined,
    });
  }

  return (
    <div style={{ padding: "32px", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
          Engineering Workspace
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#111", margin: 0 }}>All Inspections</h1>
            <p style={{ fontSize: "14px", color: "#666", margin: "4px 0 0" }}>
              {data?.total ?? "—"} total inspections
            </p>
          </div>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button style={{ background: "#0F1A14", color: "#D4A800", border: "none", fontWeight: 600 }}>
                <Plus size={14} style={{ marginRight: 6 }} />
                New Inspection
              </Button>
            </DialogTrigger>
            <DialogContent style={{ maxWidth: "520px" }}>
              <DialogHeader>
                <DialogTitle>Create New Inspection</DialogTitle>
              </DialogHeader>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "8px" }}>
                <div>
                  <Label style={{ fontSize: "12px" }}>Inspection Type</Label>
                  <Select
                    value={form.inspectionType}
                    onValueChange={(v) => setForm((f) => ({ ...f, inspectionType: v as typeof INSPECTION_TYPES[number] }))}
                  >
                    <SelectTrigger style={{ marginTop: "4px" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INSPECTION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t.replace(/_/g, " ").toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label style={{ fontSize: "12px" }}>Vehicle Registration</Label>
                  <Input
                    value={form.vehicleRegistration}
                    onChange={(e) => setForm((f) => ({ ...f, vehicleRegistration: e.target.value }))}
                    placeholder="e.g. ABC 123 GP"
                    style={{ marginTop: "4px" }}
                  />
                </div>
                <div>
                  <Label style={{ fontSize: "12px" }}>Asset Reference</Label>
                  <Input
                    value={form.assetRef}
                    onChange={(e) => setForm((f) => ({ ...f, assetRef: e.target.value }))}
                    placeholder="Asset ID or serial number"
                    style={{ marginTop: "4px" }}
                  />
                </div>
                <div>
                  <Label style={{ fontSize: "12px" }}>Location</Label>
                  <Input
                    value={form.locationAddress}
                    onChange={(e) => setForm((f) => ({ ...f, locationAddress: e.target.value }))}
                    placeholder="Inspection site address"
                    style={{ marginTop: "4px" }}
                  />
                </div>
                <div>
                  <Label style={{ fontSize: "12px" }}>Scheduled Date</Label>
                  <Input
                    type="date"
                    value={form.scheduledDate}
                    onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))}
                    style={{ marginTop: "4px" }}
                  />
                </div>


                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  style={{ background: "#0F1A14", color: "#D4A800", border: "none", fontWeight: 600 }}
                >
                  {createMutation.isPending ? "Creating…" : "Create Inspection"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger style={{ width: "180px" }}>
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {INSPECTION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, " ").toUpperCase()}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger style={{ width: "180px" }}>
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {INSPECTION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t.replace(/_/g, " ").toUpperCase()}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#888" }}>Loading…</div>
        ) : inspections.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center" }}>
            <HardHat size={32} style={{ color: "#ccc", marginBottom: "12px" }} />
            <p style={{ fontSize: "14px", color: "#888", margin: 0 }}>No inspections found.</p>
          </div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  {["Reference", "Asset / Vehicle", "Type", "Priority", "Scheduled", "Status", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #f0f0f0" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inspections.map((insp, idx) => {
                  const status = String(insp.status ?? "");
                  const colour = STATUS_COLOURS[status] ?? "#888";
                  return (
                    <tr
                      key={String(insp.id)}
                      style={{ borderBottom: idx < inspections.length - 1 ? "1px solid #f5f5f5" : "none", cursor: "pointer" }}
                      onClick={() => setLocation(`/engineer/inspections/${insp.id}`)}
                    >
                      <td style={{ padding: "12px 16px", fontSize: "13px", fontWeight: 700, color: "#111" }}>
                        {String(insp.inspection_ref ?? "—")}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: "13px", color: "#444" }}>
                        {String(insp.vehicle_registration ?? insp.asset_ref ?? "—")}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: "12px", color: "#666" }}>
                        {String(insp.inspection_type ?? "—").replace(/_/g, " ").toUpperCase()}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 600, color: insp.priority === "critical" ? "#e74c3c" : insp.priority === "high" ? "#f39c12" : "#888" }}>
                          {String(insp.priority ?? "normal").toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: "12px", color: "#666" }}>
                        {insp.scheduled_date ? new Date(String(insp.scheduled_date)).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: "12px", background: colour + "22", color: colour, fontSize: "11px", fontWeight: 600, border: `1px solid ${colour}44` }}>
                          {status.replace(/_/g, " ").toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <ArrowRight size={14} style={{ color: "#ccc" }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding: "12px 16px", borderTop: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", color: "#888" }}>
                  Page {page} of {totalPages}
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft size={14} />
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRightIcon size={14} />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
