/**
 * PanelBeaterQuoteSubmission.tsx
 * Professional quote builder for panel beaters — p11 design system
 * Features: categorized line items (labour/parts/consumables/sublet), VAT toggle, clear totals
 */
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Wrench, Plus, Trash2, ArrowLeft, CheckCircle, AlertCircle, Loader2, FileText, Upload } from "lucide-react";
import { PdfQuoteUpload } from "@/components/PdfQuoteUpload";
import QuoteOCRUpload from "@/components/QuoteOCRUpload";

type LineItemCategory = "labour" | "parts" | "consumables" | "sublet" | "other";

interface LineItem {
  id: string;
  category: LineItemCategory;
  description: string;
  qty: string;
  unitPrice: string;
}

const CATEGORY_LABELS: Record<LineItemCategory, string> = {
  labour: "Labour",
  parts: "Parts",
  consumables: "Consumables",
  sublet: "Sublet / Specialist",
  other: "Other",
};

const CATEGORY_COLORS: Record<LineItemCategory, string> = {
  labour: "#2563EB",
  parts: "#059669",
  consumables: "#D97706",
  sublet: "#7C3AED",
  other: "#6B7280",
};

function newItem(category: LineItemCategory = "labour"): LineItem {
  return { id: Date.now().toString() + Math.random(), category, description: "", qty: "1", unitPrice: "" };
}

export default function PanelBeaterQuoteSubmission() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/panel-beater/claims/:id/quote");
  const claimId = params?.id ? parseInt(params.id) : 0;

  const [lineItems, setLineItems] = useState<LineItem[]>([
    newItem("labour"),
    newItem("parts"),
  ]);
  const [vatRate, setVatRate] = useState("15");
  const [includeVat, setIncludeVat] = useState(true);
  const [estimatedDays, setEstimatedDays] = useState("7");
  const [notes, setNotes] = useState("");
  const [uploadMethod, setUploadMethod] = useState<"manual" | "pdf">("manual");

  const { data: claim, isLoading } = trpc.claims.getById.useQuery({ id: claimId });

  const submitQuote = trpc.quotes.submit.useMutation({
    onSuccess: () => {
      toast.success("Quote submitted successfully");
      setLocation("/panel-beater/dashboard");
    },
    onError: (e) => toast.error(`Failed to submit: ${e.message}`),
  });

  // ── Calculations ──────────────────────────────────────────────────────────
  const lineTotal = (item: LineItem) => (parseFloat(item.qty) || 0) * (parseFloat(item.unitPrice) || 0);
  const subtotal = lineItems.reduce((sum, item) => sum + lineTotal(item), 0);
  const vatAmount = includeVat ? subtotal * (parseFloat(vatRate) / 100) : 0;
  const total = subtotal + vatAmount;

  const labourTotal = lineItems.filter(i => i.category === "labour").reduce((s, i) => s + lineTotal(i), 0);
  const partsTotal = lineItems.filter(i => i.category === "parts").reduce((s, i) => s + lineTotal(i), 0);
  const otherTotal = lineItems.filter(i => !["labour", "parts"].includes(i.category)).reduce((s, i) => s + lineTotal(i), 0);

  // ── Line item helpers ─────────────────────────────────────────────────────
  const addItem = (cat: LineItemCategory) => setLineItems(prev => [...prev, newItem(cat)]);
  const removeItem = (id: string) => setLineItems(prev => prev.filter(i => i.id !== id));
  const updateItem = (id: string, field: keyof LineItem, value: string) =>
    setLineItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  // ── PDF extraction handler ────────────────────────────────────────────────
  const handlePdfExtracted = (data: any) => {
    const extracted: LineItem[] = [];
    if (data.laborCost > 0) extracted.push({ id: "l1", category: "labour", description: "Labour (extracted)", qty: "1", unitPrice: data.laborCost.toFixed(2) });
    if (data.partsCost > 0) extracted.push({ id: "p1", category: "parts", description: "Parts (extracted)", qty: "1", unitPrice: data.partsCost.toFixed(2) });
    if (data.components?.length) {
      data.components.forEach((c: any, idx: number) => {
        extracted.push({ id: `c${idx}`, category: "parts", description: c.name, qty: "1", unitPrice: (c.partCost + c.laborCost).toFixed(2) });
      });
    }
    if (extracted.length) setLineItems(extracted);
    if (data.estimatedDuration) setEstimatedDays(data.estimatedDuration.toString());
    if (data.notes) setNotes(data.notes);
    toast.success("Quote data extracted — review and submit");
    setUploadMethod("manual");
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (total <= 0) { toast.error("Total must be greater than zero"); return; }
    const itemizedBreakdown = lineItems
      .filter(i => i.description && parseFloat(i.unitPrice) > 0)
      .map(i => ({ item: `[${CATEGORY_LABELS[i.category]}] ${i.description}`, cost: Math.round(lineTotal(i) * 100) }));
    submitQuote.mutate({
      claimId,
      panelBeaterId: Number(user!.id),
      quotedAmount: Math.round(total * 100),
      laborCost: Math.round(labourTotal * 100),
      partsCost: Math.round(partsTotal * 100),
      estimatedDuration: parseInt(estimatedDays) || 7,
      itemizedBreakdown,
      notes: notes || undefined,
    });
  };

  if (isLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--body-bg)" }}>
      <Loader2 style={{ width: 32, height: 32, color: "var(--g-600)" }} className="animate-spin" />
    </div>
  );

  if (!claim) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--body-bg)" }}>
      <div className="p11-card" style={{ maxWidth: 400, textAlign: "center", padding: 32 }}>
        <AlertCircle style={{ width: 40, height: 40, color: "#DC2626", margin: "0 auto 16px" }} />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Claim Not Found</div>
        <button className="p11-btn-gold" onClick={() => setLocation("/panel-beater/dashboard")}>Back to Dashboard</button>
      </div>
    </div>
  );

  return (
    <div style={{ background: "var(--body-bg)", fontFamily: "Inter, sans-serif", minHeight: "100vh" }}>
      {/* ── Identity Strip ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", background: "#FFFFFF", borderBottom: "1px solid #E7E2D6", position: "sticky", top: 0, zIndex: 100, height: "52px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style={{ height: 28, objectFit: "contain" }} />
          <div style={{ width: 1, height: 22, background: "#C8C4BA" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#15201A" }}>Panel Beater Portal</span>
        </div>
        <button className="p11-btn-ghost" onClick={() => setLocation("/panel-beater/dashboard")} style={{ fontSize: 12 }}>
          <ArrowLeft style={{ width: 13, height: 13 }} />
          Back to Dashboard
        </button>
      </div>

      {/* ── Hero ── */}
      <div className="p11-hero">
        <div className="p11-hero-top">
          <div>
            <div className="p11-breadcrumb">KINGA · Panel Beater · Quote Submission</div>
            <div className="p11-hero-title">Submit Repair Quote</div>
            <div className="p11-hero-subtitle">
              Claim <strong>{claim.claimNumber}</strong> · {claim.vehicleRegistration ?? "Vehicle"} · {claim.make ?? ""} {claim.model ?? ""}
            </div>
          </div>
          <div className="p11-hero-actions">
            <button
              type="button"
              className={`p11-btn-ghost${uploadMethod === "pdf" ? " active" : ""}`}
              onClick={() => setUploadMethod(uploadMethod === "pdf" ? "manual" : "pdf")}
            >
              <Upload style={{ width: 13, height: 13 }} />
              {uploadMethod === "pdf" ? "Manual Entry" : "Upload PDF Quote"}
            </button>
          </div>
        </div>
        {/* KPI strip */}
        <div className="p11-kpi-grid">
          <div className="p11-kpi-tile headline">
            <div className="p11-kpi-label">Quote Total (incl. VAT)</div>
            <div className="p11-kpi-value num">${total.toFixed(2)}</div>
            <div className="p11-kpi-delta">{includeVat ? `VAT ${vatRate}% = $${vatAmount.toFixed(2)}` : "VAT not included"}</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Labour</div>
            <div className="p11-kpi-value num">${labourTotal.toFixed(2)}</div>
            <div className="p11-kpi-delta">{lineItems.filter(i => i.category === "labour").length} line items</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Parts</div>
            <div className="p11-kpi-value num">${partsTotal.toFixed(2)}</div>
            <div className="p11-kpi-delta">{lineItems.filter(i => i.category === "parts").length} line items</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Other</div>
            <div className="p11-kpi-value num">${otherTotal.toFixed(2)}</div>
            <div className="p11-kpi-delta">Consumables, sublet</div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p11-body">
        <div className="p11-body-2col">
          {/* ── Main Column ── */}
          <div>
            {/* PDF Upload Mode */}
            {uploadMethod === "pdf" && (
              <div className="p11-card" style={{ marginBottom: 16 }}>
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <FileText style={{ width: 14, height: 14, color: "var(--g-600)" }} />
                    Upload Existing Quote (PDF / Image)
                  </div>
                </div>
                <div className="p11-card-body">
                  <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.6 }}>
                    Upload your existing quote document. KINGA will extract line items, labour, parts, and totals automatically.
                  </p>
                  <QuoteOCRUpload claimId={claimId} onExtracted={handlePdfExtracted} />
                </div>
              </div>
            )}

            {/* Line Items */}
            <form onSubmit={handleSubmit}>
              <div className="p11-card" style={{ marginBottom: 16 }}>
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <Wrench style={{ width: 14, height: 14, color: "var(--g-600)" }} />
                    Quote Line Items
                    <span className="p11-badge green" style={{ marginLeft: 6 }}>{lineItems.length} items</span>
                  </div>
                </div>
                <div className="p11-card-body" style={{ padding: 0 }}>
                  {/* Column headers */}
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 70px 100px 90px 32px", gap: 8, padding: "8px 16px", background: "var(--surface)", borderBottom: "1px solid var(--line)", fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <span>Category</span>
                    <span>Description</span>
                    <span>Qty</span>
                    <span>Unit Price ($)</span>
                    <span style={{ textAlign: "right" }}>Line Total</span>
                    <span />
                  </div>
                  {/* Line items */}
                  {lineItems.map((item) => (
                    <div key={item.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr 70px 100px 90px 32px", gap: 8, padding: "8px 16px", borderBottom: "1px solid var(--line)", alignItems: "center" }}>
                      <select
                        value={item.category}
                        onChange={e => updateItem(item.id, "category", e.target.value)}
                        style={{ fontSize: 11, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--line)", background: "var(--surface)", color: CATEGORY_COLORS[item.category], fontWeight: 600, cursor: "pointer" }}
                      >
                        {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="e.g. Front bumper replacement, Panel beating — left door"
                        value={item.description}
                        onChange={e => updateItem(item.id, "description", e.target.value)}
                        style={{ fontSize: 12, padding: "5px 8px", borderRadius: 4, border: "1px solid var(--line)", background: "var(--surface)", width: "100%" }}
                        required
                      />
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="1"
                        value={item.qty}
                        onChange={e => updateItem(item.id, "qty", e.target.value)}
                        style={{ fontSize: 12, padding: "5px 8px", borderRadius: 4, border: "1px solid var(--line)", background: "var(--surface)", textAlign: "center" }}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={item.unitPrice}
                        onChange={e => updateItem(item.id, "unitPrice", e.target.value)}
                        style={{ fontSize: 12, padding: "5px 8px", borderRadius: 4, border: "1px solid var(--line)", background: "var(--surface)", textAlign: "right" }}
                        required
                      />
                      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: lineTotal(item) > 0 ? "var(--text)" : "var(--muted)" }}>
                        ${lineTotal(item).toFixed(2)}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={lineItems.length === 1}
                        style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, border: "none", background: "none", cursor: lineItems.length === 1 ? "not-allowed" : "pointer", color: lineItems.length === 1 ? "var(--muted)" : "#DC2626", opacity: lineItems.length === 1 ? 0.4 : 1 }}
                      >
                        <Trash2 style={{ width: 13, height: 13 }} />
                      </button>
                    </div>
                  ))}
                  {/* Add item buttons */}
                  <div style={{ padding: "10px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(Object.keys(CATEGORY_LABELS) as LineItemCategory[]).map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => addItem(cat)}
                        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "4px 10px", borderRadius: 4, border: `1px solid ${CATEGORY_COLORS[cat]}`, background: "none", color: CATEGORY_COLORS[cat], cursor: "pointer", fontWeight: 600 }}
                      >
                        <Plus style={{ width: 11, height: 11 }} />
                        Add {CATEGORY_LABELS[cat]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Notes and Duration */}
              <div className="p11-card" style={{ marginBottom: 16 }}>
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <FileText style={{ width: 14, height: 14, color: "var(--g-600)" }} />
                    Additional Details
                  </div>
                </div>
                <div className="p11-card-body">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Estimated Repair Duration (days)</label>
                      <input
                        type="number"
                        min="1"
                        value={estimatedDays}
                        onChange={e => setEstimatedDays(e.target.value)}
                        style={{ fontSize: 13, padding: "7px 10px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", width: "100%" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>VAT Rate (%)</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={vatRate}
                          onChange={e => setVatRate(e.target.value)}
                          disabled={!includeVat}
                          style={{ fontSize: 13, padding: "7px 10px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", width: 80, opacity: includeVat ? 1 : 0.5 }}
                        />
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={includeVat}
                            onChange={e => setIncludeVat(e.target.checked)}
                            style={{ width: 14, height: 14, cursor: "pointer" }}
                          />
                          Include VAT
                        </label>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes / Conditions</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Any conditions, exclusions, or notes for the assessor or insurer..."
                      rows={3}
                      style={{ fontSize: 12, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface)", width: "100%", resize: "vertical", lineHeight: 1.5 }}
                    />
                  </div>
                </div>
              </div>

              {/* Submit button (mobile-friendly) */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginBottom: 24 }}>
                <button type="button" className="p11-btn-ghost" onClick={() => setLocation("/panel-beater/dashboard")}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="p11-btn-gold"
                  disabled={submitQuote.isPending || total <= 0}
                  style={{ minWidth: 160, justifyContent: "center" }}
                >
                  {submitQuote.isPending ? (
                    <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> Submitting...</>
                  ) : (
                    <><CheckCircle style={{ width: 13, height: 13 }} /> Submit Quote — ${total.toFixed(2)}</>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* ── Sidebar ── */}
          <div className="p11-sidebar">
            {/* Quote Summary */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <Wrench style={{ width: 14, height: 14, color: "var(--g-600)" }} />
                  Quote Summary
                </div>
              </div>
              <div className="p11-card-body">
                {/* Category breakdown */}
                {(Object.keys(CATEGORY_LABELS) as LineItemCategory[]).map(cat => {
                  const catTotal = lineItems.filter(i => i.category === cat).reduce((s, i) => s + lineTotal(i), 0);
                  if (catTotal === 0) return null;
                  return (
                    <div key={cat} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 12 }}>
                      <span style={{ color: CATEGORY_COLORS[cat], fontWeight: 600 }}>{CATEGORY_LABELS[cat]}</span>
                      <span style={{ fontWeight: 700 }}>${catTotal.toFixed(2)}</span>
                    </div>
                  );
                })}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 12 }}>
                  <span style={{ color: "var(--muted)" }}>Subtotal</span>
                  <span style={{ fontWeight: 700 }}>${subtotal.toFixed(2)}</span>
                </div>
                {includeVat && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 12 }}>
                    <span style={{ color: "var(--muted)" }}>VAT ({vatRate}%)</span>
                    <span style={{ fontWeight: 700, color: "#D97706" }}>${vatAmount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 15, fontWeight: 800 }}>
                  <span>TOTAL</span>
                  <span style={{ color: "var(--g-600)" }}>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Claim Details */}
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <FileText style={{ width: 14, height: 14, color: "var(--g-600)" }} />
                  Claim Details
                </div>
              </div>
              <div className="p11-card-body">
                {[
                  { label: "Claim #", value: claim.claimNumber },
                  { label: "Vehicle", value: `${claim.vehicleRegistration ?? "—"}` },
                  { label: "Make/Model", value: `${claim.make ?? ""} ${claim.model ?? ""}`.trim() || "—" },
                  { label: "Year", value: claim.vehicleYear ? String(claim.vehicleYear) : "—" },
                  { label: "Status", value: claim.status ?? "—" },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 12 }}>
                    <span style={{ color: "var(--muted)" }}>{row.label}</span>
                    <span style={{ fontWeight: 600 }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div className="p11-card" style={{ background: "linear-gradient(135deg, #0A2218 0%, #0D3B2A 100%)" }}>
              <div className="p11-card-header" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <div className="p11-card-title" style={{ color: "#F9FAFB" }}>
                  <CheckCircle style={{ width: 14, height: 14, color: "#34D399" }} />
                  Quote Tips
                </div>
              </div>
              <div className="p11-card-body">
                {[
                  "Break down labour and parts separately for faster approval",
                  "Include VAT if your business is VAT-registered",
                  "Add notes for any conditions or exclusions",
                  "KINGA will compare your quote against benchmarks",
                ].map((tip, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 11, color: "#D1FAE5", lineHeight: 1.5 }}>
                    <span style={{ color: "#34D399", flexShrink: 0 }}>✓</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
