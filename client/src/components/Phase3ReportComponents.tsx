/**
 * Phase3ReportComponents.tsx
 *
 * KINGA Phase 3 — Visual Report Generation (R3.1–R3.6, R4, R5, R7)
 * WCAG 2.1 AA compliant. Uses --rpt-* CSS variables from index.css.
 */

import { sanitiseField } from "@/lib/sanitise";

// ─── R3.1 Phase 3 Decision Box ────────────────────────────────────────────────

interface Phase3DecisionBoxProps {
  enforcement: any;
  aiAssessment: any;
}

export function Phase3DecisionBox({ enforcement, aiAssessment }: Phase3DecisionBoxProps) {
  const phase2 = enforcement?._phase2;
  const norm = aiAssessment?._normalised;

  // Single authoritative decision — Phase 2 is Priority 0
  const decision: string =
    phase2?.finalDecision ??
    norm?.verdict?.recommendation ??
    enforcement?.finalDecision?.decision ??
    "REVIEW";

  const confidence: number =
    phase2?.confidence ??
    enforcement?.confidenceBreakdown?.score ??
    aiAssessment?.confidenceScore ??
    0;

  const keyDrivers: string[] = phase2?.keyDrivers ?? [
    enforcement?.finalDecision?.primaryReason ?? "Assessment complete.",
  ];

  const nextSteps: string[] = phase2?.nextSteps ?? enforcement?.finalDecision?.recommendedActions ?? [];
  const advisories: string[] = phase2?.advisories ?? [];

  const decisionMap: Record<string, { label: string; color: string; bg: string; border: string }> = {
    APPROVE:                { label: "APPROVE",         color: "#059669", bg: "#F0FDF4", border: "#86EFAC" },
    FINALISE_CLAIM:         { label: "APPROVE",         color: "#059669", bg: "#F0FDF4", border: "#86EFAC" },
    REVIEW:                 { label: "REVIEW",          color: "#D97706", bg: "#FFFBEB", border: "#FCD34D" },
    REVIEW_REQUIRED:        { label: "REVIEW REQUIRED", color: "#D97706", bg: "#FFFBEB", border: "#FCD34D" },
    ESCALATE:               { label: "ESCALATE",        color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5" },
    ESCALATE_INVESTIGATION: { label: "ESCALATE",        color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5" },
    REJECT:                 { label: "REJECT",          color: "#0F172A", bg: "#F8FAFC", border: "#CBD5E1" },
  };
  const cfg = decisionMap[decision] ?? decisionMap.REVIEW;

  return (
    <div
      className="rpt-page-break-avoid mb-4"
      style={{
        border: `2px solid ${cfg.border}`,
        borderRadius: "8px",
        padding: "16px",
        background: cfg.bg,
      }}
    >
      {/* Decision word + confidence */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#475569" }}>
            Final Decision
          </p>
          <p className="text-2xl font-black" style={{ color: cfg.color, fontSize: "24pt" }}>
            {cfg.label}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#475569" }}>
            Confidence
          </p>
          <p className="text-2xl font-black" style={{ color: cfg.color }}>
            {confidence}%
          </p>
        </div>
      </div>

      {/* Key drivers */}
      {keyDrivers.length > 0 && (
        <ul className="space-y-1 mb-3">
          {keyDrivers.slice(0, 3).map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "#0F172A" }}>
              <span className="shrink-0 mt-0.5" style={{ color: cfg.color }}>•</span>
              <span>{sanitiseField(d)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Next steps */}
      {nextSteps.length > 0 && (
        <div
          className="rounded p-3 mb-2"
          style={{ background: "rgba(0,0,0,0.04)", borderLeft: `3px solid ${cfg.border}` }}
        >
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#475569" }}>
            Next Steps
          </p>
          <ul className="space-y-0.5">
            {nextSteps.map((s, i) => (
              <li key={i} className="text-xs italic" style={{ color: "#475569" }}>
                {i + 1}. {sanitiseField(s)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Advisories */}
      {advisories.length > 0 && (
        <div className="mt-2 space-y-1">
          {advisories.map((a, i) => (
            <p key={i} className="text-xs" style={{ color: "#0369A1" }}>
              ℹ {sanitiseField(a)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── R3.2 Data Completeness Dashboard ─────────────────────────────────────────

interface DataCompletenessDashboardProps {
  aiAssessment: any;
  claim: any;
  enforcement: any;
}

export function DataCompletenessDashboard({ aiAssessment, claim, enforcement }: DataCompletenessDashboardProps) {
  const phase1 = aiAssessment?._phase1;
  const phase2 = enforcement?._phase2;
  const norm = aiAssessment?._normalised;

  // Derive photo status
  const photosDetected = aiAssessment?.photosDetected ?? false;
  const photosProcessed = aiAssessment?.photosProcessed ?? false;
  let photoIcon = "❌";
  let photoLabel = "No photos submitted";
  if (photosDetected && !photosProcessed) {
    photoIcon = "⚠️";
    photoLabel = "System failure — manual review required";
  } else if (photosDetected && photosProcessed) {
    photoIcon = "✅";
    photoLabel = "Photos processed";
  }

  // Incident type
  const incidentType = aiAssessment?.incidentType ?? claim?.incidentType ?? null;
  const incidentIcon = incidentType && incidentType !== "N/A" && incidentType !== "REQUIRES_CLASSIFICATION" ? "✅" : "❌";
  const incidentLabel = incidentType && incidentType !== "N/A" ? incidentType.replace(/_/g, " ") : "Requires classification";

  // Cost
  const authTotal = phase1?.authoritative_total ?? norm?.costs?.totalUsd ?? aiAssessment?.estimatedCost;
  const costReconciliationError = phase1?.cost_reconciliation_error ?? false;
  const costIcon = costReconciliationError ? "⚠️" : authTotal ? "✅" : "❌";
  const costLabel = authTotal
    ? `${costReconciliationError ? "Reconciliation error — " : ""}Harmonised ($${Number(authTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
    : "Not available";

  // Quotes
  const quoteTotal = claim?.repairerQuoteTotal ?? null;
  const quoteIcon = quoteTotal ? "⚠️" : "❌";
  const quoteLabel = quoteTotal
    ? `Extracted ($${Number(quoteTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
    : "Not provided";

  // Police report
  const policeReport = claim?.policeReportNumber ?? aiAssessment?.policeReportNumber ?? null;
  const policeIcon = policeReport ? "✅" : "❌";
  const policeLabel = policeReport ? policeReport : "Not recorded";

  // Contradictions
  const contradictions = phase2?.contradictions ?? 0;
  const contradictionIcon = contradictions === 0 ? "✅" : "❌";
  const contradictionLabel = contradictions === 0 ? "No contradictions" : `${contradictions} contradiction${contradictions !== 1 ? "s" : ""} detected`;

  const rows = [
    { icon: incidentIcon, field: "Incident type", value: incidentLabel },
    { icon: quoteIcon, field: "Repairer quote", value: quoteLabel },
    { icon: photoIcon, field: "Photos", value: photoLabel },
    { icon: costIcon, field: "Costs", value: costLabel },
    { icon: contradictionIcon, field: "Contradictions", value: contradictionLabel },
    { icon: policeIcon, field: "Police report", value: policeLabel },
  ];

  const completenessScore = phase2?.dataCompletenessScore ?? null;

  return (
    <div
      className="rpt-page-break-avoid mb-4"
      style={{
        border: "1px solid #E2E8F0",
        borderRadius: "8px",
        padding: "12px",
        background: "#F8FAFC",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#475569" }}>
          Data Completeness
        </p>
        {completenessScore !== null && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{
              background: completenessScore >= 90 ? "#DCFCE7" : completenessScore >= 70 ? "#FEF3C7" : "#FEE2E2",
              color: completenessScore >= 90 ? "#14532D" : completenessScore >= 70 ? "#78350F" : "#7F1D1D",
            }}
          >
            {completenessScore}%
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {rows.map(({ icon, field, value }) => (
          <div key={field} className="flex items-start gap-1.5">
            <span className="text-sm shrink-0 mt-0.5">{icon}</span>
            <div className="min-w-0">
              <p className="text-xs font-semibold" style={{ color: "#0F172A" }}>{field}:</p>
              <p className="text-xs truncate" style={{ color: "#475569" }}>{value}</p>
            </div>
          </div>
        ))}
      </div>
      {(phase1?.allCorrections ?? []).length > 0 && (
        <div className="mt-2 pt-2" style={{ borderTop: "1px solid #E2E8F0" }}>
          <p className="text-xs" style={{ color: "#0369A1" }}>
            ℹ {phase1.allCorrections.length} data correction{phase1.allCorrections.length !== 1 ? "s" : ""} applied automatically.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── R3.3 Component Heatmap ────────────────────────────────────────────────────

interface ComponentHeatmapProps {
  aiAssessment: any;
  enforcement: any;
}

const ZONE_COORDS: Record<string, { x: number; y: number; w: number; h: number; view: "front" | "rear" | "side" | "top" }> = {
  "front bumper":     { x: 20,  y: 140, w: 60, h: 20, view: "front" },
  "bonnet":           { x: 20,  y: 80,  w: 60, h: 55, view: "front" },
  "windscreen":       { x: 25,  y: 45,  w: 50, h: 30, view: "front" },
  "grille":           { x: 30,  y: 145, w: 40, h: 12, view: "front" },
  "left headlight":   { x: 15,  y: 130, w: 20, h: 18, view: "front" },
  "right headlight":  { x: 65,  y: 130, w: 20, h: 18, view: "front" },
  "left wing":        { x: 5,   y: 80,  w: 18, h: 55, view: "front" },
  "right wing":       { x: 77,  y: 80,  w: 18, h: 55, view: "front" },
  "rear bumper":      { x: 20,  y: 140, w: 60, h: 20, view: "rear" },
  "boot":             { x: 20,  y: 80,  w: 60, h: 55, view: "rear" },
  "left tail light":  { x: 15,  y: 130, w: 20, h: 18, view: "rear" },
  "right tail light": { x: 65,  y: 130, w: 20, h: 18, view: "rear" },
  "left door":        { x: 20,  y: 60,  w: 30, h: 60, view: "side" },
  "right door":       { x: 55,  y: 60,  w: 30, h: 60, view: "side" },
  "left sill":        { x: 20,  y: 120, w: 60, h: 10, view: "side" },
  "roof":             { x: 20,  y: 20,  w: 60, h: 40, view: "top" },
};

function severityColor(sev: string): string {
  const s = (sev ?? "").toLowerCase();
  if (s === "severe" || s === "catastrophic") return "rgba(220,38,38,0.40)";
  if (s === "moderate") return "rgba(217,119,6,0.40)";
  return "rgba(5,150,105,0.40)";
}

function VehicleView({ view, components }: { view: "front" | "rear" | "side" | "top"; components: Array<{ name: string; severity: string }> }) {
  const relevant = components.filter(c => {
    const key = c.name.toLowerCase();
    const coord = ZONE_COORDS[key];
    return coord?.view === view;
  });

  const viewLabels: Record<string, string> = { front: "Front", rear: "Rear", side: "Side", top: "Top" };

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-semibold mb-1" style={{ color: "#475569" }}>{viewLabels[view]}</p>
      <svg viewBox="0 0 100 170" width="90" height="153" style={{ border: "1px solid #E2E8F0", borderRadius: "4px", background: "#F8FAFC" }}>
        {/* Vehicle outline — simplified rectangle silhouette */}
        <rect x="10" y="30" width="80" height="130" rx="8" fill="none" stroke="#94A3B8" strokeWidth="1.5" />
        <rect x="20" y="15" width="60" height="25" rx="4" fill="none" stroke="#94A3B8" strokeWidth="1" />
        {/* Wheels */}
        <circle cx="22" cy="155" r="8" fill="none" stroke="#94A3B8" strokeWidth="1.5" />
        <circle cx="78" cy="155" r="8" fill="none" stroke="#94A3B8" strokeWidth="1.5" />
        {/* Damage overlays */}
        {relevant.map((c, i) => {
          const coord = ZONE_COORDS[c.name.toLowerCase()];
          if (!coord) return null;
          return (
            <g key={i}>
              <rect
                x={coord.x} y={coord.y} width={coord.w} height={coord.h}
                rx="3" fill={severityColor(c.severity)}
                stroke={severityColor(c.severity).replace("0.40", "0.80")}
                strokeWidth="1"
              />
              <text
                x={coord.x + coord.w / 2} y={coord.y + coord.h / 2 + 3}
                textAnchor="middle" fontSize="6"
                fill="white"
                style={{ textShadow: "0 0 2px #000", paintOrder: "stroke", stroke: "#000", strokeWidth: "0.5" }}
              >
                {c.name.length > 8 ? c.name.slice(0, 8) + "…" : c.name}
              </text>
            </g>
          );
        })}
        {relevant.length === 0 && (
          <text x="50" y="90" textAnchor="middle" fontSize="7" fill="#94A3B8">No data</text>
        )}
      </svg>
    </div>
  );
}

export function ComponentHeatmap({ aiAssessment, enforcement }: ComponentHeatmapProps) {
  // Source 1: photo-extracted components (Phase 2 photo analysis)
  const phase2PhotoComponents: Array<{ name: string; severity: string }> = (() => {
    try {
      const p2 = enforcement?._phase2;
      if (p2?.photoComponents && Array.isArray(p2.photoComponents)) return p2.photoComponents;
      return [];
    } catch { return []; }
  })();

  // Source 2: damagedComponentsJson from assessment
  const assessmentComponents: Array<{ name: string; severity: string }> = (() => {
    try {
      const raw = aiAssessment?.damagedComponentsJson
        ? JSON.parse(aiAssessment.damagedComponentsJson)
        : [];
      return Array.isArray(raw)
        ? raw.map((c: any) => typeof c === "string" ? { name: c, severity: "moderate" } : { name: c?.name ?? "", severity: c?.severity ?? "moderate" })
        : [];
    } catch { return []; }
  })();

  // Merge: photo-extracted takes precedence
  const allComponents = phase2PhotoComponents.length > 0 ? phase2PhotoComponents : assessmentComponents;
  const hasData = allComponents.length > 0;

  return (
    <div className="rpt-page-break-avoid mb-4" style={{ border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px", background: "#FFFFFF" }}>
      <p className="text-sm font-bold mb-3" style={{ color: "#0F172A" }}>Component Damage Heatmap</p>
      {!hasData ? (
        <p className="text-xs italic" style={{ color: "#475569" }}>
          Component data not available — manual mapping required.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 mb-3">
            {(["front", "rear", "side", "top"] as const).map(view => (
              <VehicleView key={view} view={view} components={allComponents} />
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 flex-wrap">
            {[
              { color: "rgba(220,38,38,0.40)", border: "rgba(220,38,38,0.80)", label: "Severe" },
              { color: "rgba(217,119,6,0.40)",  border: "rgba(217,119,6,0.80)",  label: "Moderate" },
              { color: "rgba(5,150,105,0.40)",  border: "rgba(5,150,105,0.80)",  label: "Minor" },
            ].map(({ color, border, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div style={{ width: 14, height: 14, background: color, border: `1px solid ${border}`, borderRadius: 2 }} />
                <span className="text-xs" style={{ color: "#475569" }}>{label}</span>
              </div>
            ))}
          </div>
          {phase2PhotoComponents.length > 0 && (
            <p className="text-xs mt-2" style={{ color: "#0369A1" }}>
              ℹ Heatmap sourced from photo analysis ({phase2PhotoComponents.length} components extracted).
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ─── R3.4 Cost Comparison Chart ────────────────────────────────────────────────

interface CostComparisonChartProps {
  aiAssessment: any;
  enforcement: any;
  quotes: any[];
}

export function CostComparisonChart({ aiAssessment, enforcement, quotes }: CostComparisonChartProps) {
  const phase1 = aiAssessment?._phase1;
  const norm = aiAssessment?._normalised;

  const aiEstimate: number | null = phase1?.authoritative_total ?? norm?.costs?.totalUsd ?? aiAssessment?.estimatedCost ?? null;
  const repairerQuote: number | null = quotes.length > 0
    ? quotes.reduce((sum: number, q: any) => sum + (q.quotedAmount ?? 0) / 100, 0)
    : null;
  const agreedCost: number | null = norm?.costs?.totalUsd ?? aiEstimate;

  const maxVal = Math.max(aiEstimate ?? 0, repairerQuote ?? 0, agreedCost ?? 0) * 1.2 || 1000;

  const bars: Array<{ label: string; value: number | null; colorClass: string; color: string }> = [
    { label: "AI Estimate",    value: aiEstimate,    colorClass: "rpt-cost-bar-ai",     color: "#0369A1" },
    { label: "Repairer Quote", value: repairerQuote, colorClass: "rpt-cost-bar-quote",  color: "#D97706" },
    {
      label: "Agreed Cost",
      value: agreedCost,
      colorClass: aiEstimate && agreedCost && Math.abs(agreedCost - aiEstimate) / aiEstimate <= 0.10
        ? "rpt-cost-bar-agreed"
        : "rpt-cost-bar-danger",
      color: aiEstimate && agreedCost && Math.abs(agreedCost - aiEstimate) / aiEstimate <= 0.10
        ? "#059669"
        : "#DC2626",
    },
  ];

  function variance(a: number | null, b: number | null): string | null {
    if (a === null || b === null || b === 0) return null;
    const pct = ((a - b) / b) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
  }

  return (
    <div className="rpt-page-break-avoid mb-4" style={{ border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px", background: "#FFFFFF" }}>
      <p className="text-sm font-bold mb-3" style={{ color: "#0F172A" }}>Cost Comparison</p>
      <div className="space-y-3">
        {bars.map(({ label, value, colorClass, color }) => {
          const widthPct = value !== null ? Math.min((value / maxVal) * 100, 100) : 0;
          const varStr = label === "Repairer Quote" ? variance(value, aiEstimate) : label === "Agreed Cost" ? variance(value, aiEstimate) : null;
          return (
            <div key={label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold" style={{ color: "#0F172A" }}>{label}</span>
                <div className="flex items-center gap-2">
                  {varStr && (
                    <span className="text-xs font-bold" style={{ color: varStr.startsWith("+") ? "#DC2626" : "#059669" }}>
                      {varStr}
                    </span>
                  )}
                  <span className="text-xs font-mono" style={{ color: "#475569" }}>
                    {value !== null
                      ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "Not available"}
                  </span>
                </div>
              </div>
              <div className="relative h-5 rounded" style={{ background: "#F1F5F9" }}>
                {value !== null ? (
                  <div
                    className={`absolute h-5 rounded ${colorClass}`}
                    style={{ width: `${widthPct}%`, background: color }}
                  />
                ) : (
                  <div
                    className="absolute h-5 rounded"
                    style={{
                      width: "100%",
                      background: "repeating-linear-gradient(45deg, #E2E8F0, #E2E8F0 4px, #F8FAFC 4px, #F8FAFC 8px)",
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs mt-2" style={{ color: "#475569" }}>
        X-axis max: ${maxVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}. Variance % relative to AI Estimate.
      </p>
    </div>
  );
}

// ─── R3.5 Physics Consistency Gauge ───────────────────────────────────────────

interface PhysicsConsistencyGaugeProps {
  enforcement: any;
}

export function PhysicsConsistencyGauge({ enforcement }: PhysicsConsistencyGaugeProps) {
  const score: number = enforcement?.consistencyFlag?.score ?? 0;
  const deltaV: number = enforcement?.physicsEstimate?.deltaVKmh ?? enforcement?.physicsEstimate?.estimatedVelocityKmh ?? 0;
  const advisories: string[] = enforcement?._phase2?.advisories ?? [];

  // Gauge segments: 0-30 red, 30-70 amber, 70-100 green
  const markerLeft = `${Math.min(score, 99)}%`;

  return (
    <div className="rpt-page-break-avoid mb-4" style={{ border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px", background: "#FFFFFF" }}>
      <p className="text-sm font-bold mb-3" style={{ color: "#0F172A" }}>
        Physics Consistency{" "}
        <span className="text-xs font-normal" style={{ color: "#475569" }}>
          (automated measure of how well the reported damage pattern matches the claimed impact direction and speed)
        </span>
      </p>

      {/* Bullet chart */}
      <div className="relative h-6 rounded overflow-hidden mb-2" style={{ background: "#F1F5F9" }}>
        {/* Segments */}
        <div className="absolute h-6" style={{ left: "0%",   width: "30%", background: "#DC2626", opacity: 0.7 }} />
        <div className="absolute h-6" style={{ left: "30%",  width: "40%", background: "#D97706", opacity: 0.7 }} />
        <div className="absolute h-6" style={{ left: "70%",  width: "30%", background: "#059669", opacity: 0.7 }} />
        {/* Marker */}
        <div
          className="absolute top-0 h-6 flex items-center justify-center"
          style={{ left: markerLeft, transform: "translateX(-50%)" }}
        >
          <div style={{
            width: 0, height: 0,
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: "10px solid #0F172A",
          }} />
        </div>
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs mb-2" style={{ color: "#475569" }}>
        <span>0%</span>
        <span>30%</span>
        <span>70%</span>
        <span>100%</span>
      </div>

      <p className="text-xs font-semibold" style={{ color: "#0F172A" }}>
        Delta-V: {deltaV > 0 ? `${deltaV} km/h` : "N/A"}{" "}
        <span style={{ color: "#475569" }}>|</span>{" "}
        Consistency: {score}%
      </p>

      {/* Phase 2.1 advisories */}
      {advisories.length > 0 && (
        <div className="mt-2 space-y-1">
          {advisories.map((a, i) => (
            <p key={i} className="text-xs" style={{ color: "#0369A1" }}>
              ℹ {sanitiseField(a)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── R3.6 Photo Gallery ────────────────────────────────────────────────────────

interface PhotoGalleryProps {
  aiAssessment: any;
  enforcement: any;
}

export function PhotoGallery({ aiAssessment, enforcement }: PhotoGalleryProps) {
  const photosDetected = aiAssessment?.photosDetected ?? false;
  const photosProcessed = aiAssessment?.photosProcessed ?? false;

  // Photo URLs from assessment
  const photoUrls: string[] = (() => {
    try {
      const raw = aiAssessment?.damagePhotosJson
        ? JSON.parse(aiAssessment.damagePhotosJson)
        : [];
      return Array.isArray(raw) ? raw.filter((u: any) => typeof u === "string") : [];
    } catch { return []; }
  })();

  // Photo-extracted component captions from Phase 2
  const photoComponents: Array<{ name: string; severity: string; confidence?: number }> =
    enforcement?._phase2?.photoComponents ?? [];

  if (!photosDetected) {
    return (
      <div className="rpt-page-break-avoid mb-4" style={{ border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px", background: "#F8FAFC" }}>
        <p className="text-sm font-bold mb-1" style={{ color: "#0F172A" }}>Photo Gallery</p>
        <p className="text-xs" style={{ color: "#475569" }}>No photos submitted with this claim.</p>
      </div>
    );
  }

  if (photosDetected && !photosProcessed) {
    return (
      <div className="rpt-page-break-avoid mb-4" style={{ border: "1px solid #FCD34D", borderRadius: "8px", padding: "16px", background: "#FFFBEB" }}>
        <p className="text-sm font-bold mb-1" style={{ color: "#0F172A" }}>Photo Gallery</p>
        <p className="text-xs" style={{ color: "#D97706" }}>
          📷 {photoUrls.length > 0 ? photoUrls.length : "Multiple"} photos detected but not processed. Manual review required.
        </p>
      </div>
    );
  }

  // Photos processed — show grid
  const displayPhotos = photoUrls.slice(0, 6);

  return (
    <div className="rpt-page-break-avoid mb-4" style={{ border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px", background: "#FFFFFF" }}>
      <p className="text-sm font-bold mb-3" style={{ color: "#0F172A" }}>Photo Gallery</p>
      {displayPhotos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {displayPhotos.map((url, i) => {
            const comp = photoComponents[i];
            const caption = comp
              ? `Fig ${i + 1}: ${comp.name} – ${comp.severity}`
              : `Fig ${i + 1}`;
            return (
              <div key={i} className="relative overflow-hidden rounded" style={{ height: 120 }}>
                <img
                  src={url}
                  alt={caption}
                  style={{ width: "100%", height: 120, objectFit: "cover" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div
                  className="absolute bottom-0 left-0 right-0 rpt-photo-caption"
                  style={{ fontSize: "10pt" }}
                >
                  {caption}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs" style={{ color: "#475569" }}>
          Photos were processed but no URLs are available for display.
        </p>
      )}
      {photoComponents.length > 0 && (
        <p className="text-xs mt-2" style={{ color: "#0369A1" }}>
          ℹ {photoComponents.length} component{photoComponents.length !== 1 ? "s" : ""} extracted from photo analysis.
        </p>
      )}
    </div>
  );
}

// ─── R5 KINGA Audit Trail ──────────────────────────────────────────────────────

interface KINGAAuditTrailProps {
  claim: any;
  aiAssessment: any;
  enforcement: any;
  quotes: any[];
}

export function KINGAAuditTrail({ claim, aiAssessment, enforcement, quotes }: KINGAAuditTrailProps) {
  const phase1 = aiAssessment?._phase1;
  const phase2 = enforcement?._phase2;
  const norm = aiAssessment?._normalised;

  const claimNumber = claim?.claimNumber ?? "N/A";
  const timestamp = new Date().toISOString();
  const documentId = `KINGA-${claimNumber}-${Date.now()}`;

  const phase1Status = phase1?.status ?? "N/A";
  const phase1Corrections = (phase1?.allCorrections ?? []) as string[];

  const finalDecision = phase2?.finalDecision ?? norm?.verdict?.recommendation ?? enforcement?.finalDecision?.decision ?? "REVIEW";
  const confidence = phase2?.confidence ?? enforcement?.confidenceBreakdown?.score ?? aiAssessment?.confidenceScore ?? 0;

  const photosDetected = aiAssessment?.photosDetected ?? false;
  const photosProcessed = aiAssessment?.photosProcessed ?? false;
  const photoStatus = !photosDetected ? "NOT_SUBMITTED" : !photosProcessed ? "SYSTEM_FAILURE" : "PROCESSED";

  const extractionConfidence = aiAssessment?.confidenceScore ?? 0;
  const humanReviewRequired = finalDecision !== "APPROVE" && finalDecision !== "FINALISE_CLAIM";
  const humanReviewReason = phase2?.keyDrivers?.[0] ?? enforcement?.finalDecision?.primaryReason ?? "See decision drivers";

  // Decision trace from Phase 2
  const dataCompleteness = phase2?.dataCompletenessScore ?? 0;
  const fraudScore = phase2?.fraudScore ?? enforcement?.weightedFraud?.score ?? 0;
  const physicsConsistency = phase2?.physicsConsistency ?? enforcement?.consistencyFlag?.score ?? 0;

  const traceLines = [
    `Data completeness: ${dataCompleteness}% → ${dataCompleteness < 90 ? "< 90% → REVIEW" : "≥ 90% → pass"}`,
    `Fraud score: ${fraudScore} (≥60? ${fraudScore >= 60 ? "Yes → ESCALATE" : "No"}) | Physics consistency: ${physicsConsistency}% (< 30%? ${physicsConsistency < 30 ? "Yes → ESCALATE" : "No"})`,
    `Final: ${finalDecision}`,
  ];

  const rows = [
    ["Document ID",           documentId],
    ["Generation Timestamp",  timestamp],
    ["Version",               "3.2.0"],
    ["Phase 1 Status",        phase1Status],
    ["Phase 1 Corrections",   phase1Corrections.length > 0 ? phase1Corrections.join("; ") : "None"],
    ["Phase 2 Decision",      `${finalDecision} (${confidence}% confidence)`],
    ["Claim Form",            `${claimNumber}`],
    ["Photos",                `${photosDetected ? "Detected" : "Not submitted"}, ${photosProcessed ? "Processed" : "Not processed"} (${photoStatus})`],
    ["Quotes",                quotes.length > 0 ? `${quotes.length} extracted` : "None"],
    ["Extraction Confidence", `${extractionConfidence}%`],
    ["Human Review Required", `${humanReviewRequired ? "Yes" : "No"} (${humanReviewReason})`],
  ];

  return (
    <div className="rpt-page-break-avoid mb-4" style={{ border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px", background: "#F8FAFC" }}>
      <p className="text-sm font-bold mb-3" style={{ color: "#0F172A" }}>Audit Trail</p>
      <div className="font-mono text-xs space-y-1" style={{ color: "#0F172A" }}>
        {rows.map(([key, val]) => (
          <div key={key} className="flex gap-2">
            <span className="shrink-0 font-semibold" style={{ color: "#475569", minWidth: "180px" }}>{key}:</span>
            <span style={{ wordBreak: "break-all" }}>{val}</span>
          </div>
        ))}
        <div className="pt-1">
          <span className="font-semibold" style={{ color: "#475569" }}>Decision Trace:</span>
          {traceLines.map((line, i) => (
            <div key={i} className="pl-4">
              {i + 1}. {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── R7 Sanity Check ──────────────────────────────────────────────────────────

export interface SanityCheckResult {
  check: string;
  passed: boolean;
  detail: string;
}

export function runR7SanityChecks(
  enforcement: any,
  aiAssessment: any,
  renderedDecision: string,
): SanityCheckResult[] {
  const phase2Decision = enforcement?._phase2?.finalDecision ?? null;
  const norm = aiAssessment?._normalised;
  const authTotal = aiAssessment?._phase1?.authoritative_total ?? norm?.costs?.totalUsd ?? aiAssessment?.estimatedCost ?? null;

  return [
    {
      check: "No CONFLICT Dimension strings",
      passed: !JSON.stringify(aiAssessment ?? {}).includes("CONFLICT Dimension"),
      detail: "Raw AI pipeline markers must not appear in rendered output.",
    },
    {
      check: "No 'Run Now' or interactive button strings",
      passed: !JSON.stringify(aiAssessment ?? {}).match(/Run Now|Hover or click|Click to expand/i),
      detail: "Interactive UI strings must be sanitised before rendering.",
    },
    {
      check: "No suspiciously small cost value (< $10)",
      passed: authTotal === null || authTotal >= 10,
      detail: `Authoritative total: $${authTotal ?? "N/A"}. Values < $10 suggest cents/dollars unit error.`,
    },
    {
      check: "Single decision word matches Phase 2",
      passed: !phase2Decision || renderedDecision.includes(phase2Decision.replace("_", " ").split("_")[0]),
      detail: `Rendered: "${renderedDecision}" | Phase 2: "${phase2Decision ?? "N/A"}"`,
    },
    {
      check: "Photo status is canonical (not raw flag string)",
      passed: !JSON.stringify(aiAssessment ?? {}).includes("photos_not_ingested"),
      detail: "photo_status must be PROCESSED, SYSTEM_FAILURE, or NOT_SUBMITTED.",
    },
  ];
}
