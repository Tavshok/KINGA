/**
 * EngineerInspectionDetail.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Epic 3 — E3-T14 to E3-T18 (combined into one tabbed detail page)
 *
 * Engineering Workspace — Inspection Detail
 * Tabs: Overview | Evidence | Measurements | Observations | KINGA Analysis | Physics | Sign-off
 */
import { useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  ArrowLeft, Camera, Ruler, Eye, Brain, GitMerge, CheckSquare,
  LayoutDashboard, Upload, Plus, RefreshCw, CheckCircle, AlertTriangle,
  Loader2, FileText, Mic, MicOff, Download,
} from "lucide-react";
import { toast } from "sonner";
import { InspectionLinkPanel } from "@/components/InspectionLinkPanel";

const TABS = [
  { id: "overview",      label: "Overview",     icon: LayoutDashboard },
  { id: "evidence",      label: "Evidence",      icon: Camera },
  { id: "measurements",  label: "Measurements",  icon: Ruler },
  { id: "observations",  label: "Observations",  icon: Eye },
  { id: "ai",            label: "KINGA Analysis",   icon: Brain },
  { id: "physics",       label: "Physics",       icon: GitMerge },
  { id: "signoff",       label: "Sign-off",      icon: CheckSquare },
] as const;

type TabId = typeof TABS[number]["id"];

const MEASUREMENT_CATEGORIES = ["vehicle_crush","structural","mechanical","electrical","fire_protection","industrial"] as const;
const MEASUREMENT_METHODS = ["manual","laser","ai_assisted","imported","photogrammetric"] as const;
const OBSERVATION_TYPES = ["defect","hazard","compliance","maintenance","recommendation","general_note"] as const;
const SEVERITY_LEVELS = ["info","minor","moderate","major","critical"] as const;

const STATUS_COLOURS: Record<string, string> = {
  assigned:"#2980b9", in_progress:"#f39c12", measurements_complete:"#8e44ad",
  observations_complete:"#16a085", ai_analysis:"#27ae60", physics_reconciliation:"#1abc9c",
  engineer_review:"#e67e22", complete:"#27ae60", cancelled:"#95a5a6",
};

export default function EngineerInspectionDetail() {
  const [, params] = useRoute("/engineer/inspections/:id");
  const [, setLocation] = useLocation();
  const inspectionId = Number(params?.id);
  const utils = trpc.useUtils();

  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: insp, isLoading } = trpc.inspections.get.useQuery(
    { inspectionId },
    { enabled: !!inspectionId }
  );
  const inspection = insp as Record<string, unknown> | undefined;

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateStatus = trpc.inspections.updateStatus.useMutation({
    onSuccess: () => { utils.inspections.get.invalidate({ inspectionId }); toast.success("Status updated."); },
    onError: (e) => toast.error(e.message),
  });

  const addMeasurement = trpc.inspections.addMeasurement.useMutation({
    onSuccess: () => { utils.inspections.get.invalidate({ inspectionId }); toast.success("Measurement recorded."); setMeasForm(defaultMeasForm()); },
    onError: (e) => toast.error(e.message),
  });

  const addObservation = trpc.inspections.addObservation.useMutation({
    onSuccess: () => { utils.inspections.get.invalidate({ inspectionId }); toast.success("Observation recorded."); setObsForm(defaultObsForm()); },
    onError: (e) => toast.error(e.message),
  });

  const runAi = trpc.inspections.runAiAnalysis.useMutation({
    onSuccess: () => { utils.inspections.get.invalidate({ inspectionId }); toast.success("KINGA analysis complete."); },
    onError: (e) => toast.error(e.message),
  });

  const approveAi = trpc.inspections.approveAiAnalysis.useMutation({
    onSuccess: () => { utils.inspections.get.invalidate({ inspectionId }); toast.success("KINGA analysis approved."); },
    onError: (e) => toast.error(e.message),
  });

  const runPhysics = trpc.inspections.runPhysicsReconciliation.useMutation({
    onSuccess: () => { utils.inspections.get.invalidate({ inspectionId }); toast.success("Physics reconciliation complete."); },
    onError: (e) => toast.error(e.message),
  });

  const draftObs = trpc.inspections.draftObservationWithAi.useMutation({
    onSuccess: (result) => {
      const r = result as Record<string, unknown>;
      setObsForm((f) => ({ ...f, observationText: String(r.draft ?? f.observationText) }));
      toast.success("KINGA draft ready — review and edit before saving.");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Measurement form ───────────────────────────────────────────────────────
  function defaultMeasForm() {
    return {
      measurementCategory: "structural" as typeof MEASUREMENT_CATEGORIES[number],
      measurementType: "",
      measuredValue: "",
      unit: "mm",
      measurementMethod: "manual" as typeof MEASUREMENT_METHODS[number],
      locationDescription: "",
      notes: "",
    };
  }
  const [measForm, setMeasForm] = useState(defaultMeasForm());

  // ── Observation form ───────────────────────────────────────────────────────
  function defaultObsForm() {
    return {
      observationType: "general_note" as typeof OBSERVATION_TYPES[number],
      severity: "info" as typeof SEVERITY_LEVELS[number],
      observationText: "",
      recommendation: "",
      standardsCode: "",
    };
  }
  const [obsForm, setObsForm] = useState(defaultObsForm());

  // ── Sign-off notes ─────────────────────────────────────────────────────────
  const [signoffNotes, setSignoffNotes] = useState("");

  if (isLoading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#888", fontFamily: "Inter, sans-serif" }}>
        <Loader2 size={24} style={{ marginBottom: "8px" }} />
        <p>Loading inspection…</p>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#888", fontFamily: "Inter, sans-serif" }}>
        <AlertTriangle size={24} style={{ marginBottom: "8px" }} />
        <p>Inspection not found.</p>
        <Button variant="outline" onClick={() => setLocation("/engineer/inspections")} style={{ marginTop: "12px" }}>
          Back to list
        </Button>
      </div>
    );
  }

  const status = String(inspection.status ?? "");
  const statusColour = STATUS_COLOURS[status] ?? "#888";
  const measurements = (inspection.measurements ?? []) as Record<string, unknown>[];
  const observations = (inspection.observations ?? []) as Record<string, unknown>[];
  const evidence = (inspection.evidence ?? []) as Record<string, unknown>[];
  const aiAnalysis = inspection.aiAnalysis as Record<string, unknown> | undefined;
  const physicsResult = inspection.physicsResult as Record<string, unknown> | undefined;

  return (
    <div style={{ fontFamily: "Inter, sans-serif", minHeight: "100vh", background: "#F9F8F5" }}>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e8e8e8", padding: "12px 24px", display: "flex", alignItems: "center", gap: "16px" }}>
        <button
          onClick={() => setLocation("/engineer/inspections")}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", color: "#888", fontSize: "13px" }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <div style={{ width: "1px", height: "20px", background: "#e8e8e8" }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: "15px", fontWeight: 700, color: "#111" }}>
            {String(inspection.inspection_ref ?? "—")}
          </span>
          <span style={{ marginLeft: "12px", fontSize: "12px", color: "#888" }}>
            {String(inspection.vehicle_registration ?? inspection.asset_ref ?? "")}
          </span>
        </div>
        <span style={{ display: "inline-block", padding: "3px 12px", borderRadius: "12px", background: statusColour + "22", color: statusColour, fontSize: "11px", fontWeight: 700, border: `1px solid ${statusColour}44` }}>
          {status.replace(/_/g, " ").toUpperCase()}
        </span>
        {/* SR-H01: Export engineering inspection report as CSV/text */}
        <button
          onClick={() => {
            const rows: string[] = [
              `KINGA Engineering Inspection Report`,
              `Reference: ${String(inspection.inspection_ref ?? "")}`,
              `Vehicle: ${String(inspection.vehicle_registration ?? inspection.asset_ref ?? "")}`,
              `Status: ${status.replace(/_/g, " ").toUpperCase()}`,
              `Date: ${new Date().toLocaleDateString()}`,
              ``,
              `MEASUREMENTS (${measurements.length})`,
              ...measurements.map((m: any) => `  ${m.category ?? ""} | ${m.method ?? ""} | ${m.value ?? ""} ${m.unit ?? ""} | ${m.notes ?? ""}`),
              ``,
              `OBSERVATIONS (${observations.length})`,
              ...observations.map((o: any) => `  [${(o.severity ?? "").toUpperCase()}] ${o.type ?? ""}: ${o.description ?? ""}`),
              ``,
              `AI ANALYSIS`,
              aiAnalysis ? JSON.stringify(aiAnalysis, null, 2) : "Not available",
              ``,
              `PHYSICS RESULT`,
              physicsResult ? JSON.stringify(physicsResult, null, 2) : "Not available",
            ];
            const blob = new Blob([rows.join("\n")], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `KINGA-Inspection-${String(inspection.inspection_ref ?? inspectionId)}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("Inspection report exported");
          }}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "#0F1A14", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          <Download size={13} /> Export Report
        </button>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e8e8e8", padding: "0 24px", display: "flex", gap: "0" }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: "none",
                border: "none",
                borderBottom: isActive ? "2px solid #0F1A14" : "2px solid transparent",
                padding: "12px 16px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "#111" : "#888",
                marginBottom: "-1px",
              }}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────────── */}
      <div style={{ padding: "28px 24px" }}>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <>
          <div style={{ marginBottom: "20px" }}>
            <InspectionLinkPanel
              inspectionId={inspectionId}
              currentClaimId={insp?.inspection?.claim_id ?? null}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "20px" }}>
              <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 16px" }}>Inspection Details</h3>
              {[
                ["Reference",   String(inspection.inspection_ref ?? "—")],
                ["Type",        String(inspection.inspection_type ?? "—").replace(/_/g, " ").toUpperCase()],
                ["Asset",       String(inspection.vehicle_registration ?? inspection.asset_ref ?? "—")],
                ["Asset Type",  String(inspection.asset_type ?? "—")],
                ["Location",    String(inspection.location_address ?? "—")],
                ["Scheduled",   inspection.scheduled_date ? new Date(String(inspection.scheduled_date)).toLocaleDateString() : "—"],
                ["Created",     inspection.created_at ? new Date(String(inspection.created_at)).toLocaleDateString() : "—"],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <span style={{ fontSize: "12px", color: "#888" }}>{label}</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#111" }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "20px" }}>
              <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 16px" }}>Progress Summary</h3>
              {[
                ["Evidence items",   evidence.length],
                ["Measurements",     measurements.length],
                ["Observations",     observations.length],
                ["KINGA Analysis",      aiAnalysis ? "Complete" : "Pending"],
                ["Physics Check",    physicsResult ? "Complete" : "Pending"],
              ].map(([label, value]) => (
                <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  <span style={{ fontSize: "12px", color: "#888" }}>{label}</span>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#111" }}>{String(value ?? "")}</span>
                </div>
              ))}
              <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                {status === "assigned" && (
                  <Button size="sm" style={{ background: "#0F1A14", color: "#D4A800", border: "none" }} onClick={() => updateStatus.mutate({ inspectionId, status: "in_progress" })}>
                    Start Inspection
                  </Button>
                )}
                {status === "in_progress" && measurements.length > 0 && (
                  <Button size="sm" style={{ background: "#0F1A14", color: "#D4A800", border: "none" }} onClick={() => updateStatus.mutate({ inspectionId, status: "measurements_complete" })}>
                    Mark Measurements Complete
                  </Button>
                )}
                {status === "measurements_complete" && observations.length > 0 && (
                  <Button size="sm" style={{ background: "#0F1A14", color: "#D4A800", border: "none" }} onClick={() => updateStatus.mutate({ inspectionId, status: "observations_complete" })}>
                    Mark Observations Complete
                  </Button>
                )}
              </div>
            </div>
          </div>
          </>
        )}

        {/* EVIDENCE */}
        {activeTab === "evidence" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#111", margin: 0 }}>Evidence ({evidence.length})</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => toast.info("File upload: attach evidence via the claim document uploader on the claim detail page.")}
              >
                <Upload size={13} style={{ marginRight: 6 }} />
                Upload Evidence
              </Button>
            </div>
            {evidence.length === 0 ? (
              <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "48px", textAlign: "center" }}>
                <Camera size={32} style={{ color: "#ccc", marginBottom: "12px" }} />
                <p style={{ fontSize: "14px", color: "#888", margin: 0 }}>No evidence uploaded yet.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
                {evidence.map((ev) => (
                  <div key={String(ev.id)} style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", overflow: "hidden" }}>
                    {ev.file_url && String(ev.mime_type ?? "").startsWith("image/") ? (
                      <img src={String(ev.file_url)} alt={String(ev.file_name ?? "")} style={{ width: "100%", height: "140px", objectFit: "cover" }} />
                    ) : (
                      <div style={{ height: "140px", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <FileText size={32} style={{ color: "#ccc" }} />
                      </div>
                    )}
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {String(ev.file_name ?? "Document")}
                      </div>
                      <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
                        {String(ev.evidence_type ?? "").replace(/_/g, " ").toUpperCase()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MEASUREMENTS */}
        {activeTab === "measurements" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#111", margin: 0 }}>Measurements ({measurements.length})</h2>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" style={{ background: "#0F1A14", color: "#D4A800", border: "none" }}>
                    <Plus size={13} style={{ marginRight: 6 }} />
                    Add Measurement
                  </Button>
                </DialogTrigger>
                <DialogContent style={{ maxWidth: "480px" }}>
                  <DialogHeader><DialogTitle>Record Measurement</DialogTitle></DialogHeader>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
                    <div>
                      <Label style={{ fontSize: "12px" }}>Category</Label>
                      <Select value={measForm.measurementCategory} onValueChange={(v) => setMeasForm((f) => ({ ...f, measurementCategory: v as typeof MEASUREMENT_CATEGORIES[number] }))}>
                        <SelectTrigger style={{ marginTop: "4px" }}><SelectValue /></SelectTrigger>
                        <SelectContent>{MEASUREMENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ").toUpperCase()}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label style={{ fontSize: "12px" }}>Measurement Type</Label>
                      <Input value={measForm.measurementType} onChange={(e) => setMeasForm((f) => ({ ...f, measurementType: e.target.value }))} placeholder="e.g. front_crush_depth" style={{ marginTop: "4px" }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "8px" }}>
                      <div>
                        <Label style={{ fontSize: "12px" }}>Measured Value</Label>
                        <Input type="number" value={measForm.measuredValue} onChange={(e) => setMeasForm((f) => ({ ...f, measuredValue: e.target.value }))} placeholder="0.00" style={{ marginTop: "4px" }} />
                      </div>
                      <div>
                        <Label style={{ fontSize: "12px" }}>Unit</Label>
                        <Input value={measForm.unit} onChange={(e) => setMeasForm((f) => ({ ...f, unit: e.target.value }))} placeholder="mm" style={{ marginTop: "4px" }} />
                      </div>
                    </div>
                    <div>
                      <Label style={{ fontSize: "12px" }}>Method</Label>
                      <Select value={measForm.measurementMethod} onValueChange={(v) => setMeasForm((f) => ({ ...f, measurementMethod: v as typeof MEASUREMENT_METHODS[number] }))}>
                        <SelectTrigger style={{ marginTop: "4px" }}><SelectValue /></SelectTrigger>
                        <SelectContent>{MEASUREMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, " ").toUpperCase()}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label style={{ fontSize: "12px" }}>Location Description</Label>
                      <Input value={measForm.locationDescription} onChange={(e) => setMeasForm((f) => ({ ...f, locationDescription: e.target.value }))} placeholder="e.g. Front left panel" style={{ marginTop: "4px" }} />
                    </div>
                    <div>
                      <Label style={{ fontSize: "12px" }}>Notes</Label>
                      <Textarea value={measForm.notes} onChange={(e) => setMeasForm((f) => ({ ...f, notes: e.target.value }))} rows={2} style={{ marginTop: "4px" }} />
                    </div>
                    <Button
                      disabled={addMeasurement.isPending || !measForm.measurementType || !measForm.measuredValue}
                      style={{ background: "#0F1A14", color: "#D4A800", border: "none" }}
                      onClick={() => addMeasurement.mutate({
                        inspectionId,
                        measurementCategory: measForm.measurementCategory,
                        measurementType: measForm.measurementType,
                        value: Number(measForm.measuredValue),
                        unit: measForm.unit,
                        measurementMethod: measForm.measurementMethod,
                        locationReference: measForm.locationDescription || undefined,
                        notes: measForm.notes || undefined,
                      })}
                    >
                      {addMeasurement.isPending ? "Saving…" : "Save Measurement"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {measurements.length === 0 ? (
              <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "48px", textAlign: "center" }}>
                <Ruler size={32} style={{ color: "#ccc", marginBottom: "12px" }} />
                <p style={{ fontSize: "14px", color: "#888", margin: 0 }}>No measurements recorded yet.</p>
              </div>
            ) : (
              <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#fafafa" }}>
                      {["Type", "Category", "Value", "Method", "Location", "Confidence"].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #f0f0f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {measurements.map((m, idx) => (
                      <tr key={String(m.id)} style={{ borderBottom: idx < measurements.length - 1 ? "1px solid #f5f5f5" : "none" }}>
                        <td style={{ padding: "10px 14px", fontSize: "12px", fontWeight: 600, color: "#111" }}>{String(m.measurement_type ?? "—")}</td>
                        <td style={{ padding: "10px 14px", fontSize: "12px", color: "#666" }}>{String(m.measurement_category ?? "—").replace(/_/g, " ")}</td>
                        <td style={{ padding: "10px 14px", fontSize: "12px", fontWeight: 700, color: "#111" }}>{String(m.measured_value ?? "—")} {String(m.unit ?? "")}</td>
                        <td style={{ padding: "10px 14px", fontSize: "12px", color: "#666" }}>{String(m.measurement_method ?? "—").replace(/_/g, " ")}</td>
                        <td style={{ padding: "10px 14px", fontSize: "12px", color: "#666" }}>{String(m.location_description ?? "—")}</td>
                        <td style={{ padding: "10px 14px", fontSize: "12px", color: "#666" }}>{m.confidence_score ? `${Number(m.confidence_score) * 100}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* OBSERVATIONS */}
        {activeTab === "observations" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#111", margin: 0 }}>Observations ({observations.length})</h2>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" style={{ background: "#0F1A14", color: "#D4A800", border: "none" }}>
                    <Plus size={13} style={{ marginRight: 6 }} />
                    Add Observation
                  </Button>
                </DialogTrigger>
                <DialogContent style={{ maxWidth: "520px" }}>
                  <DialogHeader><DialogTitle>Record Observation</DialogTitle></DialogHeader>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      <div>
                        <Label style={{ fontSize: "12px" }}>Type</Label>
                        <Select value={obsForm.observationType} onValueChange={(v) => setObsForm((f) => ({ ...f, observationType: v as typeof OBSERVATION_TYPES[number] }))}>
                          <SelectTrigger style={{ marginTop: "4px" }}><SelectValue /></SelectTrigger>
                          <SelectContent>{OBSERVATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ").toUpperCase()}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label style={{ fontSize: "12px" }}>Severity</Label>
                        <Select value={obsForm.severity} onValueChange={(v) => setObsForm((f) => ({ ...f, severity: v as typeof SEVERITY_LEVELS[number] }))}>
                          <SelectTrigger style={{ marginTop: "4px" }}><SelectValue /></SelectTrigger>
                          <SelectContent>{SEVERITY_LEVELS.map((s) => <SelectItem key={s} value={s}>{s.toUpperCase()}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <Label style={{ fontSize: "12px" }}>Description</Label>
                        <button
                          onClick={() => toast.info("Save the observation first, then use KINGA Draft to refine it.")}
          disabled={draftObs.isPending}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#888", display: "flex", alignItems: "center", gap: "4px" }}
        >
          <Brain size={11} />
          {draftObs.isPending ? "Drafting…" : "KINGA Draft"}
        </button>
                        <button
                          onClick={async () => {
                            try {
                              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                              const recorder = new MediaRecorder(stream);
                              const chunks: BlobPart[] = [];
                              recorder.ondataavailable = (e) => chunks.push(e.data);
                              recorder.onstop = async () => {
                                stream.getTracks().forEach((t) => t.stop());
                                const blob = new Blob(chunks, { type: "audio/webm" });
                                if (blob.size > 16 * 1024 * 1024) { toast.error("Recording too large (max 16MB)"); return; }
                                const formData = new FormData();
                                formData.append("file", blob, "voice.webm");
                                toast.info("Transcribing voice…");
                                const res = await fetch("/api/trpc/inspections.transcribeVoice", { method: "POST", body: formData });
                                if (!res.ok) { toast.error("Transcription failed"); return; }
                                const json = await res.json();
                                const text = json?.result?.data?.text ?? json?.text ?? "";
                                if (text) {
                                  setObsForm((f) => ({ ...f, observationText: f.observationText ? f.observationText + " " + text : text }));
                                  toast.success("Voice transcribed — review and edit");
                                }
                              };
                              recorder.start();
                              toast.info("Recording… (30s max, will auto-stop)");
                              setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 30000);
                            } catch { toast.error("Microphone access denied"); }
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#888", display: "flex", alignItems: "center", gap: "4px" }}
                        >
                          <Mic size={11} /> Voice
                        </button>
      </div>
                      <Textarea value={obsForm.observationText} onChange={(e) => setObsForm((f) => ({ ...f, observationText: e.target.value }))} rows={4} placeholder="Describe the finding…" style={{ marginTop: "4px" }} />
                    </div>
                    <div>
                      <Label style={{ fontSize: "12px" }}>Recommendation</Label>
                      <Textarea value={obsForm.recommendation} onChange={(e) => setObsForm((f) => ({ ...f, recommendation: e.target.value }))} rows={2} placeholder="Recommended action…" style={{ marginTop: "4px" }} />
                    </div>
                    <div>
                      <Label style={{ fontSize: "12px" }}>Standards Reference</Label>
                      <Input value={obsForm.standardsCode} onChange={(e) => setObsForm((f) => ({ ...f, standardsCode: e.target.value }))} placeholder="e.g. SANS 10087, ISO 9001" style={{ marginTop: "4px" }} />
                    </div>
                    <Button
                      disabled={addObservation.isPending || !obsForm.observationText}
                      style={{ background: "#0F1A14", color: "#D4A800", border: "none" }}
                      onClick={() => addObservation.mutate({
                        inspectionId,
                        observationType: obsForm.observationType,
                        severity: obsForm.severity,
                        observationText: obsForm.observationText,
                        recommendation: obsForm.recommendation || undefined,
                        standardsCode: obsForm.standardsCode || undefined,
                      })}
                    >
                      {addObservation.isPending ? "Saving…" : "Save Observation"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {observations.length === 0 ? (
              <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "48px", textAlign: "center" }}>
                <Eye size={32} style={{ color: "#ccc", marginBottom: "12px" }} />
                <p style={{ fontSize: "14px", color: "#888", margin: 0 }}>No observations recorded yet.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {observations.map((obs) => {
                  const sev = String(obs.severity ?? "medium");
                  const sevColour = sev === "critical" ? "#e74c3c" : sev === "high" ? "#f39c12" : sev === "medium" ? "#3498db" : "#27ae60";
                  return (
                    <div key={String(obs.id)} style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "16px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#888", textTransform: "uppercase" }}>{String(obs.observation_type ?? "").replace(/_/g, " ")}</span>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: sevColour, background: sevColour + "18", padding: "2px 8px", borderRadius: "10px" }}>{sev.toUpperCase()}</span>
                      </div>
                      <p style={{ fontSize: "13px", color: "#333", margin: "0 0 8px", lineHeight: 1.5 }}>{String((obs as Record<string,unknown>).observation_text ?? "")}</p>
                      {Boolean((obs as Record<string,unknown>).recommendation) && (
                        <p style={{ fontSize: "12px", color: "#666", margin: "0 0 6px" }}>
                          <strong>Recommendation:</strong> {String((obs as Record<string,unknown>).recommendation ?? "")}
                        </p>
                      )}
                      {Boolean((obs as Record<string,unknown>).standards_reference) && (
                        <p style={{ fontSize: "11px", color: "#888", margin: 0 }}>
                          <strong>Standard:</strong> {String((obs as Record<string,unknown>).standards_reference ?? "")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* AI ANALYSIS */}
        {activeTab === "ai" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#111", margin: 0 }}>KINGA Analysis</h2>
              <div style={{ display: "flex", gap: "8px" }}>
                {aiAnalysis && !aiAnalysis.approved_by && (
                  <Button size="sm" variant="outline" onClick={() => approveAi.mutate({ inspectionId, approved: true })} disabled={approveAi.isPending}>
                    <CheckCircle size={13} style={{ marginRight: 6 }} />
                    {approveAi.isPending ? "Approving…" : "Approve Analysis"}
                  </Button>
                )}
                <Button size="sm" style={{ background: "#0F1A14", color: "#D4A800", border: "none" }} onClick={() => runAi.mutate({ inspectionId })} disabled={runAi.isPending}>
                  {runAi.isPending ? <><Loader2 size={13} style={{ marginRight: 6, animation: "spin 1s linear infinite" }} />Analysing…</> : <><RefreshCw size={13} style={{ marginRight: 6 }} />Run KINGA Analysis</>}
                </Button>
              </div>
            </div>
            {!aiAnalysis ? (
              <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "48px", textAlign: "center" }}>
                <Brain size={32} style={{ color: "#ccc", marginBottom: "12px" }} />
                <p style={{ fontSize: "14px", color: "#888", margin: "0 0 16px" }}>No KINGA analysis yet. Run analysis to generate risk assessment.</p>
                <Button style={{ background: "#0F1A14", color: "#D4A800", border: "none" }} onClick={() => runAi.mutate({ inspectionId })} disabled={runAi.isPending}>
                  {runAi.isPending ? "Analysing…" : "Run KINGA Analysis"}
                </Button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <h3 style={{ fontSize: "13px", fontWeight: 700, margin: 0 }}>Risk Summary</h3>
                    {Boolean((aiAnalysis as Record<string,unknown>).approved_by) && (
                      <span style={{ fontSize: "11px", color: "#27ae60", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                        <CheckCircle size={11} /> Approved
                      </span>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                    {([
                      ["Risk Score",    String((aiAnalysis as Record<string,unknown>).risk_score ?? "—")],
                      ["Risk Level",    String((aiAnalysis as Record<string,unknown>).risk_level ?? "—").toUpperCase()],
                      ["Confidence",    (aiAnalysis as Record<string,unknown>).confidence_score ? `${Number((aiAnalysis as Record<string,unknown>).confidence_score) * 100}%` : "—"],
                    ] as [string, string][]).map(([label, value]) => (
                      <div key={label} style={{ background: "#f9f9f9", borderRadius: "6px", padding: "12px", textAlign: "center" }}>
                        <div style={{ fontSize: "20px", fontWeight: 700, color: "#111" }}>{value}</div>
                        <div style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {Boolean((aiAnalysis as Record<string,unknown>).summary) && (
                  <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "20px" }}>
                    <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 10px" }}>Summary</h3>
                    <p style={{ fontSize: "13px", color: "#444", margin: 0, lineHeight: 1.6 }}>{String((aiAnalysis as Record<string,unknown>).summary ?? "")}</p>
                  </div>
                )}
                {Boolean((aiAnalysis as Record<string,unknown>).recommendations) && (
                  <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "20px" }}>
                    <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 10px" }}>Recommendations</h3>
                    <p style={{ fontSize: "13px", color: "#444", margin: 0, lineHeight: 1.6 }}>{String((aiAnalysis as Record<string,unknown>).recommendations ?? "")}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PHYSICS */}
        {activeTab === "physics" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#111", margin: 0 }}>Physics Reconciliation</h2>
              <Button size="sm" style={{ background: "#0F1A14", color: "#D4A800", border: "none" }} onClick={() => runPhysics.mutate({ inspectionId })} disabled={runPhysics.isPending}>
                {runPhysics.isPending ? <><Loader2 size={13} style={{ marginRight: 6 }} />Reconciling…</> : <><GitMerge size={13} style={{ marginRight: 6 }} />Run Physics Check</>}
              </Button>
            </div>
            {!physicsResult ? (
              <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "48px", textAlign: "center" }}>
                <GitMerge size={32} style={{ color: "#ccc", marginBottom: "12px" }} />
                <p style={{ fontSize: "14px", color: "#888", margin: "0 0 16px" }}>No physics reconciliation yet. Requires at least one measurement.</p>
                <Button style={{ background: "#0F1A14", color: "#D4A800", border: "none" }} onClick={() => runPhysics.mutate({ inspectionId })} disabled={runPhysics.isPending || measurements.length === 0}>
                  {measurements.length === 0 ? "Add measurements first" : "Run Physics Check"}
                </Button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "20px" }}>
                  <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 12px" }}>Reconciliation Result</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                    {[
                      ["Consistency Score", physicsResult.consistency_score ?? "—"],
                      ["Flags Raised",      Array.isArray(physicsResult.consistency_flags) ? (physicsResult.consistency_flags as unknown[]).length : "—"],
                      ["Status",           String(physicsResult.reconciliation_status ?? "—").toUpperCase()],
                    ].map(([label, value]) => (
                      <div key={String(label)} style={{ background: "#f9f9f9", borderRadius: "6px", padding: "12px", textAlign: "center" }}>
                        <div style={{ fontSize: "20px", fontWeight: 700, color: "#111" }}>{String(value ?? "—")}</div>
                        <div style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>{String(label)}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {Array.isArray(physicsResult.consistency_flags) && (physicsResult.consistency_flags as unknown[]).length > 0 && (
                  <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "20px" }}>
                    <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 12px" }}>Consistency Flags</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {(physicsResult.consistency_flags as Record<string, unknown>[]).map((flag, i) => (
                        <div key={i} style={{ padding: "10px 14px", background: "#fff8f0", border: "1px solid #f39c1244", borderRadius: "6px" }}>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#e67e22" }}>{String((flag as Record<string,unknown>).type ?? "FLAG")}</div>
                          <div style={{ fontSize: "12px", color: "#444", marginTop: "4px" }}>{String((flag as Record<string,unknown>).description ?? "")}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* SIGN-OFF */}
        {activeTab === "signoff" && (
          <div style={{ maxWidth: "600px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#111", margin: "0 0 20px" }}>Review & Sign-off</h2>
            <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "24px", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 16px" }}>Completion Checklist</h3>
              {[
                ["Evidence uploaded",         evidence.length > 0],
                ["Measurements recorded",     measurements.length > 0],
                ["Observations recorded",     observations.length > 0],
                ["KINGA analysis complete",      !!aiAnalysis],
                ["KINGA analysis approved",      !!(aiAnalysis?.approved_by)],
                ["Physics reconciliation",    !!physicsResult],
              ].map(([label, done]) => (
                <div key={String(label)} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
                  {done ? <CheckCircle size={14} style={{ color: "#27ae60" }} /> : <AlertTriangle size={14} style={{ color: "#f39c12" }} />}
                  <span style={{ fontSize: "13px", color: done ? "#111" : "#888" }}>{String(label)}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", padding: "24px" }}>
              <Label style={{ fontSize: "12px" }}>Sign-off Notes</Label>
              <Textarea
                value={signoffNotes}
                onChange={(e) => setSignoffNotes(e.target.value)}
                rows={4}
                placeholder="Final engineer notes and certification statement…"
                style={{ marginTop: "6px", marginBottom: "16px" }}
              />
              <Button
                style={{ background: "#0F1A14", color: "#D4A800", border: "none", fontWeight: 600 }}
                disabled={updateStatus.isPending || status === "complete"}
                onClick={() => updateStatus.mutate({ inspectionId, status: "complete", notes: signoffNotes || undefined })}
              >
                {status === "complete" ? "Inspection Complete" : updateStatus.isPending ? "Submitting…" : "Submit & Complete Inspection"}
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
