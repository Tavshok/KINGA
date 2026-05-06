/**
 * KingaClaimsReport — Standard Claims Report
 *
 * The report every tier receives. Designed for claims decision-making, not forensic
 * investigation. Black / white / grey format; colour is reserved exclusively for
 * status indicators and visual aids (fraud score bar, verdict badge, photo grid).
 *
 * Sections:
 *  1. Executive Decision Summary
 *  2. Workflow & Actions
 *  3. Vehicle & Policy Information
 *  4. Damage Assessment + Photo Grid (max 4 damage photos)
 *  5. Quote Comparison Table (side-by-side + KINGA Estimate column)
 *  6. Fraud & Risk Assessment (score + level + 1-line reason)
 *  7. Physics Consistency
 *  8. Final Recommendation
 */

import React from "react";
import { currencySymbol } from "@/lib/currency";

// ─── Types ────────────────────────────────────────────────────────────────────

interface KingaClaimsReportProps {
  claim: any;
  aiAssessment: any;
  enforcement: any;
  quotes?: any[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(Number(n))) return "N/A";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function makeFmtCurrency(code: string | null | undefined) {
  const sym = currencySymbol(code ?? "USD");
  return (n: number | null | undefined): string => {
    if (n == null || isNaN(Number(n)) || Number(n) === 0) return "—";
    return `${sym}${fmt(n)}`;
  };
}

function toTitleCase(s: string): string {
  return s.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseJson(raw: any): any {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

// ─── Shared style tokens ─────────────────────────────────────────────────────

const S = {
  card: {
    border: "1px solid var(--border)",
    background: "var(--card)",
    borderRadius: "8px",
    overflow: "hidden",
  } as React.CSSProperties,
  cardHeader: {
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    background: "var(--muted)",
  } as React.CSSProperties,
  cardBody: { padding: "16px" } as React.CSSProperties,
  sectionNum: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "var(--foreground)",
    color: "var(--background)",
    fontSize: 11,
    fontWeight: 700,
    marginRight: 8,
    flexShrink: 0,
  } as React.CSSProperties,
  label: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "var(--muted-foreground)",
  },
  value: { fontSize: 13, fontWeight: 600, color: "var(--foreground)" },
  muted: { fontSize: 12, color: "var(--muted-foreground)" },
  divider: { borderTop: "1px solid var(--border)", margin: "12px 0" } as React.CSSProperties,
  th: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "var(--muted-foreground)",
    padding: "6px 10px",
    background: "var(--muted)",
    borderBottom: "1px solid var(--border)",
    textAlign: "left" as const,
    whiteSpace: "nowrap" as const,
  },
  td: {
    fontSize: 12,
    color: "var(--foreground)",
    padding: "6px 10px",
    borderBottom: "1px solid var(--border)",
    verticalAlign: "top" as const,
  },
};

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ num, title, subtitle }: { num: number; title: string; subtitle?: string }) {
  return (
    <div style={S.cardHeader}>
      <div className="flex items-center">
        <span style={S.sectionNum}>{num}</span>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>{title}</p>
          {subtitle && <p style={{ ...S.muted, marginTop: 1 }}>{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── KV row ───────────────────────────────────────────────────────────────────

function KVRow({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: wide ? "160px 1fr" : "140px 1fr", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={S.label}>{label}</span>
      <span style={S.value}>{value ?? "—"}</span>
    </div>
  );
}

// ─── Verdict badge ────────────────────────────────────────────────────────────

function VerdictBadge({ decision }: { decision: string }) {
  const d = (decision ?? "").toUpperCase();
  let bg = "var(--muted)";
  let color = "var(--foreground)";
  if (d === "FINALISE_CLAIM" || d === "APPROVE") { bg = "#166534"; color = "#fff"; }
  else if (d === "REVIEW_REQUIRED" || d === "REVIEW") { bg = "#92400e"; color = "#fff"; }
  else if (d === "ESCALATE_INVESTIGATION" || d === "ESCALATE") { bg = "#7f1d1d"; color = "#fff"; }
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: bg, color, letterSpacing: "0.05em" }}>
      {toTitleCase(d.replace(/_/g, " "))}
    </span>
  );
}

// ─── Fraud level badge ────────────────────────────────────────────────────────

function FraudBadge({ level }: { level: string }) {
  const l = (level ?? "").toUpperCase();
  let bg = "var(--muted)";
  let color = "var(--foreground)";
  if (l === "MINIMAL" || l === "LOW") { bg = "#14532d"; color = "#fff"; }
  else if (l === "MODERATE") { bg = "#713f12"; color = "#fff"; }
  else if (l === "HIGH") { bg = "#7c2d12"; color = "#fff"; }
  else if (l === "CRITICAL") { bg = "#450a0a"; color = "#fff"; }
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: bg, color }}>
      {toTitleCase(l)}
    </span>
  );
}

// ─── Cost verdict badge ───────────────────────────────────────────────────────

function CostVerdictBadge({ verdict }: { verdict: string }) {
  const v = (verdict ?? "").toUpperCase();
  let bg = "var(--muted)";
  let color = "var(--foreground)";
  if (v === "FAIR") { bg = "#14532d"; color = "#fff"; }
  else if (v === "OVERPRICED") { bg = "#7c2d12"; color = "#fff"; }
  else if (v === "UNDERPRICED") { bg = "#1e3a5f"; color = "#fff"; }
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: bg, color }}>
      {toTitleCase(v)}
    </span>
  );
}

// ─── Fraud score bar ──────────────────────────────────────────────────────────

function FraudScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  let barColor = "#166534";
  if (pct >= 40) barColor = "#92400e";
  if (pct >= 65) barColor = "#7f1d1d";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 8, background: "var(--muted)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 4, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", minWidth: 36 }}>{pct}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function KingaClaimsReport({ claim, aiAssessment, enforcement, quotes = [] }: KingaClaimsReportProps) {
  const e = enforcement as any;
  const phase2 = e?._phase2 as any;
  const ci = parseJson(aiAssessment?.costIntelligenceJson);
  const fraudBd = parseJson(aiAssessment?.fraudScoreBreakdownJson);
  const damagedPartsRaw = parseJson(aiAssessment?.damagedComponentsJson);
  const damagedParts: any[] = Array.isArray(damagedPartsRaw) ? damagedPartsRaw : [];

  const currCode = claim?.currencyCode ?? "USD";
  const fmtC = makeFmtCurrency(currCode);

  // Market value: prefer valuation engine output (Stage 5c) over claim-form stated value
  // aiAssessment._claimRecord is the parsed ClaimRecord exposed by the byClaim tRPC procedure
  const _claimRecord0 = aiAssessment?._claimRecord ?? null;
  const _valResult = _claimRecord0?.valuation ?? null;
  const marketValueUsd: number | null = _valResult?.marketValueUsd ?? _claimRecord0?.vehicle?.marketValueUsd ?? null;
  const marketValueSource: string | null = _valResult?.dataSource
    ? _valResult.dataSource
    : _valResult?.valuationMethod === 'document_stated'
      ? 'Stated on claim form'
      : _valResult?.valuationMethod === 'llm_estimate'
        ? 'KINGA AI estimate'
        : marketValueUsd
          ? 'Stated on claim form'
          : null;

  // Decision
  const decision: string = e?.finalDecision?.decision ?? phase2?.finalDecision ?? "REVIEW_REQUIRED";
  const primaryReason: string = e?.finalDecision?.primaryReason ?? phase2?.keyDrivers?.[0] ?? "";
  const recommendedActions: string[] = e?.finalDecision?.recommendedActions ?? [];

  // Fraud
  const fraudScore: number = e?.fraudScoreBreakdown?.totalScore ?? aiAssessment?.fraudScore ?? 0;
  const fraudLevel: string = e?.fraudLevelLabel ?? e?.fraudLevelEnforced ?? "Unknown";
  const fraudReason: string = (() => {
    const comps: any[] = e?.fraudScoreBreakdown?.components ?? [];
    const top = comps.sort((a: any, b: any) => (b.contribution ?? 0) - (a.contribution ?? 0))[0];
    return top ? `${toTitleCase(top.factor ?? "")} (${top.contribution ?? 0} pts)` : primaryReason;
  })();

  // Cost
  const aiEstimate: number = (ci?.aiEstimateCents ?? 0) / 100;
  const costVerdict: string = e?.costVerdict?.verdict ?? ci?.costVerdict ?? "NO_QUOTE";
  const deviationPct: number | null = e?.costVerdict?.deviationPercent ?? null;
  const fairMin: number = (e?.costBenchmark?.estimatedFairMin ?? 0);
  const fairMax: number = (e?.costBenchmark?.estimatedFairMax ?? 0);

  // Physics
  const physicsScore: number = phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0;
  const physicsConsistent: boolean = physicsScore >= 60;
  const physicsInsight: string = e?.physicsInsight ?? "";

  // Damage
  const damageZones: string[] = (() => {
    const raw = phase2?.damageZones ?? aiAssessment?.damageZones;
    if (Array.isArray(raw)) return raw;
    return [];
  })();
  const overallSeverity: string = aiAssessment?.structuralDamageSeverity ?? aiAssessment?.overallSeverity ?? "unknown";
  const structuralDamage: boolean = !!(aiAssessment?.structuralDamageSeverity && aiAssessment.structuralDamageSeverity !== "none");

  // Photos — already filtered to damage/vehicle images by Stage 2.6 classifier
  const photoUrls: string[] = (aiAssessment?.photoUrls ?? aiAssessment?.processedPhotoUrls ?? []).slice(0, 4);

  // Quote comparison
  const quoteSimilarity = fraudBd?.quoteSimilarity ?? null;
  const isCopyQuote: boolean = quoteSimilarity?.overall_verdict === "confirmed" || quoteSimilarity?.overall_verdict === "suspected";
  const perComponentBenchmarks: Record<string, any> = ci?.perComponentBenchmarks ?? {};

  // Build unified quote rows
  const allDescriptions: string[] = (() => {
    const set = new Set<string>();
    quotes.forEach((q: any) => (q.lineItems ?? []).forEach((li: any) => set.add((li.description ?? "").trim())));
    return Array.from(set).filter(Boolean);
  })();

  // Confidence
  const confidenceScore: number = e?.confidenceBreakdown?.score ?? aiAssessment?.confidenceScore ?? 0;

  // Date
  const reportDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div
      style={{
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        background: "var(--background)",
        color: "var(--foreground)",
        maxWidth: 900,
        margin: "0 auto",
        padding: "24px 16px",
      }}
    >
      {/* ── Report Header ── */}
      <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: "2px solid var(--foreground)" }}>
        <div className="flex items-start justify-between">
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted-foreground)" }}>
              KINGA AutoVerify AI
            </p>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--foreground)", margin: "4px 0 2px" }}>
              Claims Assessment Report
            </h1>
            <p style={{ ...S.muted }}>
              Claim {claim?.claimNumber ?? claim?.claimReference ?? `#${claim?.id}`} &nbsp;·&nbsp; {reportDate}
            </p>
            {e?.kingaRef && (
              <p style={{ fontSize: 11, fontWeight: 800, fontFamily: 'monospace', color: '#6366f1', letterSpacing: '0.05em', marginTop: 2 }}>
                {e.kingaRef}-CL
                <span style={{ fontFamily: 'sans-serif', fontWeight: 400, color: 'var(--muted-foreground)', fontSize: 10, marginLeft: 6 }}>Claims Assessment Report</span>
              </p>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <VerdictBadge decision={decision} />
            <p style={{ ...S.muted, marginTop: 6 }}>Confidence: {confidenceScore}%</p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ══ SECTION 1 — Executive Decision Summary ══ */}
        <div style={S.card}>
          <SectionHeader num={1} title="Executive Decision Summary" />
          <div style={S.cardBody}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              {[
                { label: "Decision", value: <VerdictBadge decision={decision} /> },
                { label: "Fraud Risk", value: <FraudBadge level={fraudLevel} /> },
                { label: "Cost Verdict", value: <CostVerdictBadge verdict={costVerdict} /> },
              ].map((item, i) => (
                <div key={i} style={{ padding: "10px 12px", background: "var(--muted)", borderRadius: 6 }}>
                  <p style={S.label}>{item.label}</p>
                  <div style={{ marginTop: 5 }}>{item.value}</div>
                </div>
              ))}
            </div>

            {primaryReason && (
              <div style={{ padding: "10px 12px", background: "var(--muted)", borderRadius: 6, marginBottom: 10 }}>
                <p style={S.label}>Primary Reason</p>
                <p style={{ ...S.value, marginTop: 4, fontWeight: 500 }}>{primaryReason}</p>
              </div>
            )}

            {recommendedActions.length > 0 && (
              <div>
                <p style={{ ...S.label, marginBottom: 6 }}>Recommended Actions</p>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {recommendedActions.slice(0, 4).map((a: string, i: number) => (
                    <li key={i} style={{ fontSize: 12, color: "var(--foreground)", marginBottom: 3 }}>{a}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>

        {/* ══ SECTION 2 — Workflow & Actions ══ */}
        <div style={S.card}>
          <SectionHeader num={2} title="Claim Status & Workflow" />
          <div style={S.cardBody}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              <KVRow label="Claim Status" value={toTitleCase(claim?.status ?? "")} />
              <KVRow label="Review Status" value={toTitleCase(claim?.reviewStatus ?? "")} />
              <KVRow label="Claim Reference" value={claim?.claimNumber ?? claim?.claimReference ?? "—"} />
              {e?.kingaRef && <KVRow label="KINGA Reference" value={`${e.kingaRef}-CL`} />}
              <KVRow label="Policy Number" value={aiAssessment?.policyNumber ?? claim?.policyNumber ?? "—"} />
              <KVRow label="Insurer" value={aiAssessment?.insurerName ?? claim?.insurerName ?? "—"} />
              <KVRow label="Product Type" value={aiAssessment?.productType ?? claim?.productType ?? "—"} />
            </div>
          </div>
        </div>

        {/* ══ SECTION 3 — Vehicle & Policy Information ══ */}
        <div style={S.card}>
          <SectionHeader num={3} title="Vehicle & Policy Information" />
          <div style={S.cardBody}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              <KVRow label="Make / Model" value={`${claim?.vehicleMake ?? ""} ${claim?.vehicleModel ?? ""}`.trim() || "—"} />
              <KVRow label="Year" value={claim?.vehicleYear ?? "—"} />
              <KVRow label="Registration" value={claim?.vehicleRegistration ?? aiAssessment?.vehicleRegistration ?? "—"} />
              <KVRow label="VIN" value={aiAssessment?.vinNumber ?? claim?.vinNumber ?? "—"} />
              <KVRow label="Colour" value={aiAssessment?.vehicleColour ?? claim?.vehicleColour ?? "—"} />
              <KVRow label="Body Type" value={toTitleCase(aiAssessment?.vehicleBodyType ?? claim?.vehicleBodyType ?? "—")} />
              <KVRow label="Incident Date" value={claim?.incidentDate ? new Date(claim.incidentDate).toLocaleDateString("en-GB") : "—"} />
              <KVRow label="Incident Type" value={toTitleCase(aiAssessment?.accidentType ?? claim?.incidentType ?? "—")} />
              <KVRow label="Police Report #" value={aiAssessment?.policeReportNumber ?? claim?.policeReportNumber ?? "—"} />
              <KVRow label="Driver Licence" value={aiAssessment?.driverLicenseNumber ?? claim?.driverLicenseNumber ?? "—"} />
              {marketValueUsd != null && (
                <KVRow label="Market Value" value={fmtC(marketValueUsd)} wide />
              )}
              {marketValueSource && (
                <KVRow label="Valuation Basis" value={marketValueSource} wide />
              )}
            </div>
          </div>
        </div>

        {/* ══ SECTION 4 — Damage Assessment ══ */}
        <div style={S.card}>
          <SectionHeader num={4} title="Damage Assessment" subtitle="AI vision analysis of submitted damage photographs" />
          <div style={S.cardBody}>
            {/* Damage summary row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[
                { label: "Overall Severity", value: toTitleCase(overallSeverity) },
                { label: "Structural Damage", value: structuralDamage ? "Detected" : "Not Detected" },
                { label: "Damage Zones", value: damageZones.length > 0 ? damageZones.map(toTitleCase).join(", ") : "—" },
              ].map((item, i) => (
                <div key={i} style={{ padding: "8px 12px", background: "var(--muted)", borderRadius: 6 }}>
                  <p style={S.label}>{item.label}</p>
                  <p style={{ ...S.value, marginTop: 3, fontSize: 12 }}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Damaged components table */}
            {damagedParts.length > 0 && (
              <div style={{ marginBottom: 16, overflowX: "auto" }}>
                <p style={{ ...S.label, marginBottom: 6 }}>Damaged Components</p>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["Component", "Location", "Damage Type", "Severity", "Action"].map((h) => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {damagedParts.map((p: any, i: number) => {
                      const sev = (p.severity ?? "").toLowerCase();
                      const action = sev === "severe" || sev === "catastrophic" ? "Replace" : sev === "moderate" ? "Repair / Replace" : "Repair";
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--muted)" }}>
                          <td style={S.td}>{p.name ?? "—"}</td>
                          <td style={S.td}>{toTitleCase(p.location ?? "—")}</td>
                          <td style={S.td}>{toTitleCase(p.damageType ?? "—")}</td>
                          <td style={S.td}>{toTitleCase(sev)}</td>
                          <td style={S.td}>{action}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Photo grid — max 4 damage photos */}
            {photoUrls.length > 0 && (
              <div>
                <div style={S.divider} />
                <p style={{ ...S.label, marginBottom: 8 }}>Damage Photographs ({photoUrls.length} of {(aiAssessment?.photoUrls ?? []).length} shown)</p>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(photoUrls.length, 4)}, 1fr)`, gap: 10 }}>
                  {photoUrls.map((url: string, i: number) => {
                    // Match photo to a damaged component for caption
                    const part = damagedParts[i];
                    const caption = part
                      ? `${part.name ?? ""} — ${toTitleCase(part.severity ?? "")} ${toTitleCase(part.damageType ?? "")}`
                      : damageZones[i]
                        ? toTitleCase(damageZones[i])
                        : `Photo ${i + 1}`;
                    return (
                      <div key={i} style={{ borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}>
                        <div style={{ aspectRatio: "4/3", overflow: "hidden", background: "var(--muted)" }}>
                          <img
                            src={url}
                            alt={caption}
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }}
                          />
                        </div>
                        <div style={{ padding: "5px 8px", background: "var(--muted)", borderTop: "1px solid var(--border)" }}>
                          <p style={{ fontSize: 10, color: "var(--foreground)", fontWeight: 600, margin: 0, lineHeight: 1.3 }}>{caption}</p>
                          <p style={{ fontSize: 10, color: "var(--muted-foreground)", margin: 0 }}>Photo {i + 1}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ══ SECTION 5 — Quote Comparison ══ */}
        <div style={S.card}>
          <SectionHeader
            num={5}
            title="Quotation & Cost Analysis"
            subtitle={quotes.length > 1 ? `${quotes.length} quotes received — side-by-side comparison with KINGA estimate` : "Quote analysis"}
          />
          <div style={S.cardBody}>

            {/* Copy-quote alert */}
            {isCopyQuote && (
              <div style={{ padding: "8px 12px", marginBottom: 12, borderRadius: 6, background: "var(--muted)", border: "1px solid var(--border)" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
                  ⚠ Copy-Quotation Detected
                </p>
                <p style={{ ...S.muted, marginTop: 2 }}>
                  Structural similarity analysis indicates {quoteSimilarity?.overall_verdict === "confirmed" ? "confirmed" : "suspected"} copy-quotation.
                  {quoteSimilarity?.pairs?.[0] && ` Highest pair similarity: ${Math.round((quoteSimilarity.pairs[0].overall_similarity ?? 0) * 100)}%.`}
                  {" "}Independent quotes are required for a valid comparison.
                </p>
              </div>
            )}

            {/* Cost summary row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[
                { label: "KINGA Estimate", value: fmtC(aiEstimate) },
                { label: "Highest Quote", value: fmtC(e?.costVerdict?.quotedCost ?? 0) },
                { label: "Variance", value: deviationPct != null ? `${deviationPct > 0 ? "+" : ""}${fmt(deviationPct, 1)}%` : "—" },
                { label: "Fair Range", value: fairMin && fairMax ? `${fmtC(fairMin)} – ${fmtC(fairMax)}` : "—" },
              ].map((item, i) => (
                <div key={i} style={{ padding: "8px 12px", background: "var(--muted)", borderRadius: 6 }}>
                  <p style={S.label}>{item.label}</p>
                  <p style={{ ...S.value, marginTop: 3 }}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Side-by-side quote table */}
            {quotes.length > 0 && allDescriptions.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ ...S.th, minWidth: 180 }}>Item</th>
                      {quotes.map((q: any, qi: number) => (
                        <th key={qi} style={{ ...S.th, textAlign: "right" as const }}>
                          <div>{q.panelBeaterName ?? `Quote ${qi + 1}`}</div>
                          {isCopyQuote && quoteSimilarity?.pairs?.some((p: any) =>
                            p.quoteA_index === qi || p.quoteB_index === qi
                          ) && (
                            <div style={{ fontSize: 9, fontWeight: 600, color: "#92400e", marginTop: 1 }}>⚠ Similarity flagged</div>
                          )}
                        </th>
                      ))}
                      <th style={{ ...S.th, textAlign: "right" as const, background: "var(--foreground)", color: "var(--background)" }}>
                        KINGA Estimate
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {allDescriptions.map((desc: string, ri: number) => {
                      // Per-item flags from similarity engine
                      const itemFlags: Record<number, string> = {};
                      (quoteSimilarity?.pairs ?? []).forEach((pair: any) => {
                        (pair.per_item_flags ?? []).forEach((f: any) => {
                          if ((f.description ?? "").toLowerCase() === desc.toLowerCase()) {
                            if (f.flag === "missing_in_a") itemFlags[pair.quoteA_index] = "missing";
                            if (f.flag === "missing_in_b") itemFlags[pair.quoteB_index] = "missing";
                            if (f.flag === "high_variance") {
                              itemFlags[pair.quoteA_index] = "variance";
                              itemFlags[pair.quoteB_index] = "variance";
                            }
                          }
                        });
                      });

                      // KINGA benchmark for this item
                      const benchKey = Object.keys(perComponentBenchmarks).find(
                        (k) => k.toLowerCase() === desc.toLowerCase() || desc.toLowerCase().includes(k.toLowerCase())
                      );
                      const bench = benchKey ? perComponentBenchmarks[benchKey] : null;
                      const kingaVal = bench?.median_usd ?? null;

                      return (
                        <tr key={ri} style={{ background: ri % 2 === 0 ? "transparent" : "var(--muted)" }}>
                          <td style={S.td}>{desc}</td>
                          {quotes.map((q: any, qi: number) => {
                            const li = (q.lineItems ?? []).find(
                              (l: any) => (l.description ?? "").trim().toLowerCase() === desc.toLowerCase()
                            );
                            const flag = itemFlags[qi];
                            let cellStyle: React.CSSProperties = { ...S.td, textAlign: "right" };
                            if (flag === "missing") cellStyle = { ...cellStyle, color: "var(--muted-foreground)", fontStyle: "italic" };
                            else if (flag === "variance") cellStyle = { ...cellStyle, fontWeight: 700 };
                            return (
                              <td key={qi} style={cellStyle}>
                                {li ? fmtC(Number(li.lineTotal)) : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                              </td>
                            );
                          })}
                          <td style={{ ...S.td, textAlign: "right", background: "var(--muted)", fontWeight: 600 }}>
                            {kingaVal != null ? fmtC(kingaVal) : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Totals row */}
                    <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                      <td style={{ ...S.td, fontWeight: 700 }}>TOTAL</td>
                      {quotes.map((q: any, qi: number) => (
                        <td key={qi} style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>
                          {fmtC(Number(q.quotedAmount ?? 0) / 100)}
                        </td>
                      ))}
                      <td style={{ ...S.td, textAlign: "right", background: "var(--muted)", fontWeight: 700 }}>
                        {fmtC(aiEstimate)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {quotes.length === 0 && (
              <p style={S.muted}>No quotes submitted for this claim.</p>
            )}
          </div>
        </div>

        {/* ══ SECTION 6 — Fraud & Risk Assessment ══ */}
        <div style={S.card}>
          <SectionHeader num={6} title="Fraud & Risk Assessment" />
          <div style={S.cardBody}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div style={{ padding: "10px 12px", background: "var(--muted)", borderRadius: 6 }}>
                <p style={S.label}>Fraud Score</p>
                <div style={{ marginTop: 8 }}>
                  <FraudScoreBar score={fraudScore} />
                </div>
              </div>
              <div style={{ padding: "10px 12px", background: "var(--muted)", borderRadius: 6 }}>
                <p style={S.label}>Risk Level</p>
                <div style={{ marginTop: 5 }}>
                  <FraudBadge level={fraudLevel} />
                </div>
              </div>
            </div>

            <div style={{ padding: "8px 12px", background: "var(--muted)", borderRadius: 6 }}>
              <p style={S.label}>Primary Risk Driver</p>
              <p style={{ ...S.value, marginTop: 4, fontWeight: 500, fontSize: 12 }}>{fraudReason || "—"}</p>
            </div>

            {/* Date consistency result if available */}
            {(() => {
              const dateCheck = fraudBd?.accidentDateCrossCheck ?? null;
              if (!dateCheck || dateCheck.verdict === "consistent") return null;
              return (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--muted)", borderRadius: 6, border: "1px solid var(--border)" }}>
                  <p style={{ ...S.label, marginBottom: 4 }}>Date Consistency</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: dateCheck.verdict === "consistent" ? "var(--foreground)" : "#7c2d12" }}>
                    {toTitleCase(dateCheck.verdict.replace(/_/g, " "))}
                  </p>
                  {dateCheck.verdict === "mismatch" && (
                    <p style={S.muted}>Claim form date and police report date do not match.</p>
                  )}
                  {(dateCheck.preIncidentImages ?? []).length > 0 && (
                    <p style={S.muted}>
                      {dateCheck.preIncidentImages.length} image(s) have timestamps before the reported incident date.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* ══ SECTION 7 — Physics Consistency ══ */}
        <div style={S.card}>
          <SectionHeader num={7} title="Physics Consistency" subtitle="Mechanical plausibility of reported damage relative to impact forces" />
          <div style={S.cardBody}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              {[
                {
                  label: "Consistency",
                  value: (
                    <span style={{ fontWeight: 700, fontSize: 13, color: physicsConsistent ? "#166534" : "#7c2d12" }}>
                      {physicsConsistent ? "Consistent" : "Inconsistent"}
                    </span>
                  ),
                },
                { label: "Consistency Score", value: `${physicsScore} / 100` },
                {
                  label: "ΔV (Impact Speed)",
                  value: e?._physics?.deltaVKmh ? `${fmt(e._physics.deltaVKmh, 0)} km/h` : "—",
                },
              ].map((item, i) => (
                <div key={i} style={{ padding: "8px 12px", background: "var(--muted)", borderRadius: 6 }}>
                  <p style={S.label}>{item.label}</p>
                  <div style={{ marginTop: 4 }}>
                    {typeof item.value === "string" ? (
                      <p style={{ ...S.value, fontSize: 13 }}>{item.value}</p>
                    ) : (
                      item.value
                    )}
                  </div>
                </div>
              ))}
            </div>

            {physicsInsight && (
              <p style={{ fontSize: 12, color: "var(--muted-foreground)", fontStyle: "italic" }}>{physicsInsight}</p>
            )}
          </div>
        </div>

        {/* ══ SECTION 8 — Final Recommendation ══ */}
        <div style={S.card}>
          <SectionHeader num={8} title="Final Recommendation" />
          <div style={S.cardBody}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{ flexShrink: 0 }}>
                <VerdictBadge decision={decision} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: "var(--foreground)", lineHeight: 1.6, margin: 0 }}>
                  {primaryReason
                    ? `${primaryReason}. ${
                        deviationPct != null && Math.abs(deviationPct) > 5
                          ? `The highest submitted quote deviates ${deviationPct > 0 ? "above" : "below"} the KINGA estimate by ${Math.abs(deviationPct).toFixed(1)}%. `
                          : ""
                      }${
                        fraudScore >= 40
                          ? `Fraud risk is ${fraudLevel.toLowerCase()} (score: ${fraudScore}). `
                          : ""
                      }${
                        !physicsConsistent
                          ? "Physics analysis indicates the reported damage is not fully consistent with the described impact. "
                          : ""
                      }${recommendedActions[0] ? recommendedActions[0] + "." : ""}`
                    : "Assessment complete. Review all sections above before making a final decision."}
                </p>
              </div>
            </div>

            {recommendedActions.length > 1 && (
              <>
                <div style={S.divider} />
                <p style={{ ...S.label, marginBottom: 6 }}>Next Steps</p>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {recommendedActions.map((a: string, i: number) => (
                    <li key={i} style={{ fontSize: 12, color: "var(--foreground)", marginBottom: 4 }}>{a}</li>
                  ))}
                </ol>
              </>
            )}

            {/* Report footer */}
            <div style={{ ...S.divider, marginTop: 20 }} />
            <p style={{ ...S.muted, fontSize: 10 }}>
              This report was generated by KINGA AutoVerify AI. It is intended to assist claims professionals in making informed decisions and does not constitute a final determination of liability. All findings are subject to review by a qualified assessor.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

export default KingaClaimsReport;
