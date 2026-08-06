/**
 * BulkValuation.tsx — Phase 4A
 * Bulk vehicle valuation via CSV upload or single vehicle form.
 * Route: /agency/valuation
 */
import { trpc } from "@/lib/trpc";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Upload, FileText, Download, Plus, Trash2, AlertCircle, CheckCircle } from "lucide-react";

const CSV_TEMPLATE = "make,model,year,registration_number,condition,mileage\nToyota,Corolla,2020,ABC123,good,45000\nHonda,Civic,2019,XYZ789,fair,62000";

function parseCsv(text: string): { rowIndex: number; make: string; model: string; year: number; registrationNumber?: string; condition?: "excellent" | "good" | "fair" | "poor"; mileage?: number }[] {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");
  const headers = lines[0].toLowerCase().split(",").map(h => h.trim().replace(/['"]/g, ""));
  const getIdx = (name: string) => headers.indexOf(name);
  const makeIdx = getIdx("make"), modelIdx = getIdx("model"), yearIdx = getIdx("year");
  if (makeIdx < 0 || modelIdx < 0 || yearIdx < 0) throw new Error("CSV must have columns: make, model, year");
  const regIdx = getIdx("registration_number"), condIdx = getIdx("condition"), mileIdx = getIdx("mileage");
  return lines.slice(1).map((line, i) => {
    const cols = line.split(",").map(c => c.trim().replace(/['"]/g, ""));
    const year = parseInt(cols[yearIdx] ?? "0", 10);
    if (!cols[makeIdx] || !cols[modelIdx] || isNaN(year)) throw new Error(`Row ${i + 2}: make, model, and year are required`);
    const cond = cols[condIdx] as "excellent" | "good" | "fair" | "poor" | undefined;
    return {
      rowIndex: i,
      make: cols[makeIdx],
      model: cols[modelIdx],
      year,
      registrationNumber: regIdx >= 0 ? cols[regIdx] || undefined : undefined,
      condition: ["excellent","good","fair","poor"].includes(cond ?? "") ? cond : "good",
      mileage: mileIdx >= 0 && cols[mileIdx] ? parseInt(cols[mileIdx], 10) : undefined,
    };
  });
}

function ConfidenceBadge({ score }: { score?: number }) {
  if (!score) return null;
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "#16a34a" : pct >= 60 ? "#d97706" : "#dc2626";
  return <span style={{ fontSize: 11, fontWeight: 600, color, background: color + "18", padding: "2px 8px", borderRadius: 20 }}>{pct}% confidence</span>;
}

function exportToCsv(results: any[]) {
  const headers = ["Row","Make","Model","Year","Registration","Condition","Mileage","Market Value (USD)","Min Value","Max Value","Confidence","Methodology","Valid Until","Error"];
  const rows = results.map(r => [
    r.rowIndex + 1, r.make, r.model, r.year,
    r.registrationNumber ?? "", r.condition ?? "", r.mileage ?? "",
    r.error ? "" : (r.marketValueUsd ?? r.estimatedValueUsd ?? ""),
    r.error ? "" : (r.minValueUsd ?? ""),
    r.error ? "" : (r.maxValueUsd ?? ""),
    r.error ? "" : (r.confidenceScore ? Math.round(r.confidenceScore * 100) + "%" : ""),
    r.error ? "" : (r.methodology ?? ""),
    r.error ? "" : (r.validUntil ?? ""),
    r.error ?? "",
  ]);
  const csv = [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `KINGA-Valuations-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function BulkValuation() {
  const [mode, setMode] = useState<"csv" | "single">("csv");
  const [csvRows, setCsvRows] = useState<ReturnType<typeof parseCsv>>([]);
  const [results, setResults] = useState<any[]>([]);
  const [singleForm, setSingleForm] = useState({ make: "", model: "", year: new Date().getFullYear(), registrationNumber: "", condition: "good" as "excellent"|"good"|"fair"|"poor", mileage: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const bulkValuate = trpc.agency.bulkValuate.useMutation({
    onSuccess: (data) => { setResults(data as any[]); toast.success(`${(data as any[]).length} vehicles valuated`); },
    onError: (e) => toast.error(e.message),
  });

  const { data: singleResult, refetch: runSingle, isFetching: singleLoading } = trpc.agency.getValuation.useQuery(
    { make: singleForm.make, model: singleForm.model, year: singleForm.year, registrationNumber: singleForm.registrationNumber || undefined, condition: singleForm.condition, mileage: singleForm.mileage ? Number(singleForm.mileage) : undefined },
    { enabled: false }
  );

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseCsv(String(e.target?.result ?? ""));
        setCsvRows(parsed);
        setResults([]);
        toast.success(`${parsed.length} vehicles loaded from CSV`);
      } catch (err: any) { toast.error(err.message); }
    };
    reader.readAsText(file);
  }

  const inputStyle = { width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, boxSizing: "border-box" as const };
  const labelStyle = { fontSize: 12, fontWeight: 600 as const, color: "#374151", display: "block" as const, marginBottom: 4 };

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#F7F8F6", minHeight: "100vh", padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", margin: 0 }}>Vehicle Valuation</h1>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Single vehicle or bulk CSV upload — powered by KINGA Intelligence</p>
      </div>

      {/* Mode Toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["csv", "single"] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{ padding: "8px 20px", border: "none", borderRadius: 7, background: mode === m ? "#111" : "#fff", color: mode === m ? "#fff" : "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", border: mode === m ? "none" : "1px solid #e5e7eb" }}>
            {m === "csv" ? "📄 CSV Upload" : "🚗 Single Vehicle"}
          </button>
        ))}
      </div>

      {mode === "csv" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          {/* Upload Area */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            style={{ background: "#fff", border: "2px dashed #e5e7eb", borderRadius: 10, padding: 32, textAlign: "center", cursor: "pointer" }}
            onClick={() => fileRef.current?.click()}
          >
            <Upload style={{ width: 28, height: 28, color: "#9ca3af", margin: "0 auto 10px" }} />
            <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", margin: "0 0 4px" }}>Drop CSV file here or click to browse</p>
            <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>Columns: make, model, year, registration_number, condition, mileage</p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
          {/* Template Download */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 24 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: "#111", margin: "0 0 8px" }}>CSV Template</h4>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>Download the template, fill in your vehicles, and upload.</p>
            <button
              onClick={() => { const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "KINGA-Valuation-Template.csv"; a.click(); URL.revokeObjectURL(url); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", border: "1px solid #e5e7eb", borderRadius: 7, background: "#f9fafb", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              <Download style={{ width: 13, height: 13 }} /> Download Template
            </button>
            {csvRows.length > 0 && (
              <div style={{ marginTop: 12, padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 7 }}>
                <span style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>✓ {csvRows.length} vehicles loaded</span>
              </div>
            )}
          </div>
        </div>
      )}

      {mode === "single" && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 24, marginBottom: 20, maxWidth: 600 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[["Make *", "make"], ["Model *", "model"]].map(([label, key]) => (
              <div key={key}>
                <label style={labelStyle}>{label}</label>
                <input value={(singleForm as any)[key]} onChange={e => setSingleForm(s => ({ ...s, [key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div>
              <label style={labelStyle}>Year *</label>
              <input type="number" value={singleForm.year} onChange={e => setSingleForm(s => ({ ...s, year: Number(e.target.value) }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Registration</label>
              <input value={singleForm.registrationNumber} onChange={e => setSingleForm(s => ({ ...s, registrationNumber: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Condition</label>
              <select value={singleForm.condition} onChange={e => setSingleForm(s => ({ ...s, condition: e.target.value as any }))} style={inputStyle}>
                {["excellent","good","fair","poor"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Mileage (km)</label>
              <input type="number" value={singleForm.mileage} onChange={e => setSingleForm(s => ({ ...s, mileage: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <button
            onClick={() => runSingle()}
            disabled={singleLoading || !singleForm.make || !singleForm.model}
            style={{ marginTop: 16, padding: "9px 24px", border: "none", borderRadius: 7, background: "#111", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            {singleLoading ? "Valuating…" : "Get Valuation"}
          </button>
          {singleResult && (
            <div style={{ marginTop: 16, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>USD {((singleResult as any).marketValueUsd ?? (singleResult as any).estimatedValueUsd ?? 0).toLocaleString()}</span>
                <ConfidenceBadge score={(singleResult as any).confidenceScore} />
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Range: USD {((singleResult as any).minValueUsd ?? 0).toLocaleString()} – {((singleResult as any).maxValueUsd ?? 0).toLocaleString()}
              </div>
              {(singleResult as any).methodology && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>Method: {(singleResult as any).methodology}</div>}
            </div>
          )}
        </div>
      )}

      {/* Run Bulk Button */}
      {mode === "csv" && csvRows.length > 0 && results.length === 0 && (
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => bulkValuate.mutate({ vehicles: csvRows })}
            disabled={bulkValuate.isPending}
            style={{ padding: "10px 28px", border: "none", borderRadius: 8, background: "#111", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            {bulkValuate.isPending ? `Valuating ${csvRows.length} vehicles…` : `Run Valuation for ${csvRows.length} vehicles`}
          </button>
          {bulkValuate.isPending && <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>This may take 30–60 seconds for large batches.</p>}
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>
              Valuation Results — {results.filter((r: any) => !r.error).length}/{results.length} successful
            </h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => exportToCsv(results)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: "1px solid #e5e7eb", borderRadius: 7, background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Download style={{ width: 12, height: 12 }} /> Export CSV
              </button>
              <button onClick={() => { setResults([]); setCsvRows([]); }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: "1px solid #e5e7eb", borderRadius: 7, background: "#fff", fontSize: 12, cursor: "pointer" }}>
                <Trash2 style={{ width: 12, height: 12 }} /> Clear
              </button>
            </div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["#","Make","Model","Year","Reg","Condition","Market Value","Range","Confidence","Status"].map(h => (
                    <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6b7280", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r: any) => (
                  <tr key={r.rowIndex} style={{ borderBottom: "1px solid #f9fafb" }}>
                    <td style={{ padding: "9px 12px", fontSize: 12, color: "#9ca3af" }}>{r.rowIndex + 1}</td>
                    <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 600 }}>{r.make}</td>
                    <td style={{ padding: "9px 12px", fontSize: 12 }}>{r.model}</td>
                    <td style={{ padding: "9px 12px", fontSize: 12 }}>{r.year}</td>
                    <td style={{ padding: "9px 12px", fontSize: 12, color: "#6b7280" }}>{r.registrationNumber ?? "—"}</td>
                    <td style={{ padding: "9px 12px", fontSize: 12 }}>{r.condition ?? "good"}</td>
                    <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 700 }}>
                      {r.error ? "—" : `USD ${(r.marketValueUsd ?? r.estimatedValueUsd ?? 0).toLocaleString()}`}
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: 11, color: "#6b7280" }}>
                      {r.error ? "—" : `${(r.minValueUsd ?? 0).toLocaleString()} – ${(r.maxValueUsd ?? 0).toLocaleString()}`}
                    </td>
                    <td style={{ padding: "9px 12px" }}><ConfidenceBadge score={r.confidenceScore} /></td>
                    <td style={{ padding: "9px 12px" }}>
                      {r.error
                        ? <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#dc2626" }}><AlertCircle style={{ width: 12, height: 12 }} />{r.error}</span>
                        : <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#16a34a" }}><CheckCircle style={{ width: 12, height: 12 }} />Success</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
