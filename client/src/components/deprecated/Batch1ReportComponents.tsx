/**
 * Batch 1 Report Components — KINGA AI v4.2
 *
 * Components:
 * 1. ExecutiveAuthorityCover   — full-width cover card
 * 2. VehicleDamageMap          — SVG top-down vehicle with damage zones
 * 3. ComparativePatternTable   — Expected vs Observed for incident type
 * 4. ConstraintStatusMatrix    — results-only constraint table (no formulas)
 * 5. DecisionFlowchart         — vertical SVG flowchart
 */

import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function formatCurrency(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(v);
}

function decisionColour(d: string): { bg: string; text: string; border: string } {
  const u = (d ?? "").toUpperCase();
  if (u === "ESCALATE" || u === "REJECT")
    return { bg: "#991B1B", text: "#FFFFFF", border: "#7F1D1D" };
  if (u === "REVIEW")
    return { bg: "#D97706", text: "#FFFFFF", border: "#B45309" };
  if (u === "APPROVE")
    return { bg: "#059669", text: "#FFFFFF", border: "#047857" };
  return { bg: "#475569", text: "#FFFFFF", border: "#334155" };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ExecutiveAuthorityCover
// ─────────────────────────────────────────────────────────────────────────────

interface ExecutiveAuthorityCoverProps {
  claim: any;
  aiAssessment: any;
  enforcement: any;
}

export function ExecutiveAuthorityCover({
  claim,
  aiAssessment,
  enforcement,
}: ExecutiveAuthorityCoverProps) {
  const phase2 = enforcement?._phase2 ?? {};
  const phase1 = enforcement?._phase1 ?? {};

  const finalDecision: string =
    phase2.finalDecision ??
    enforcement?.finalDecision?.recommendation ??
    "REVIEW";

  const fraudScore: number =
    enforcement?.weightedFraud?.score ??
    aiAssessment?._normalised?.fraud?.score ??
    0;

  const consistencyScore: number =
    enforcement?.consistencyFlag?.score ??
    enforcement?._phase2?.physicsConsistency ??
    0;

  const agreedTotal: number =
    aiAssessment?._normalised?.costs?.totalUsd ??
    (aiAssessment?.estimatedCost ?? 0) / 100;

  const quotedTotal: number =
    enforcement?.costVerdict?.quotedCost ??
    0;

  const photosDetected: number =
    aiAssessment?.damagePhotoUrls?.length ?? 0;
  const photoStatus: string = phase2.photoAnalysis?.photoStatus ?? "NOT_APPLICABLE";
  const photosProcessed: number =
    photoStatus === "ANALYSED" ? photosDetected : 0;

  const dataCompleteness: number = phase2.dataCompleteness ?? 0;
  const keyDrivers: string[] = phase2.keyDrivers ?? [];
  const advisories: string[] = phase2.advisories ?? [];
  const corrections: number = phase1.allCorrections?.length ?? 0;

  // Dates
  const incidentDate = formatDate(
    claim?.incidentDate ?? aiAssessment?.incidentDate
  );
  const inspectionDate = formatDate(
    claim?.inspectionDate ?? aiAssessment?.inspectionDate
  );
  const quoteDate = formatDate(aiAssessment?.quoteDate ?? null);
  const reportDate = formatDate(new Date().toISOString());

  // Anomaly flag
  const hasAnomaly = consistencyScore < 30 || advisories.length > 0;

  // Cost status
  const costVariance =
    quotedTotal > 0 ? Math.abs(agreedTotal - quotedTotal) / quotedTotal : 0;
  const costOk = costVariance < 0.15;

  // Evidence status
  const evidenceStatus =
    photoStatus === "SYSTEM_FAILURE"
      ? "System error"
      : photoStatus === "ANALYSED"
      ? `${photosProcessed} processed`
      : photoStatus === "CLAIMANT_OMISSION"
      ? "Not submitted"
      : "N/A";

  const dc = decisionColour(finalDecision);

  // Pre-flight badges
  const badges: Array<{ label: string; ok: boolean | "warn" }> = [
    {
      label: `Data ${dataCompleteness > 0 ? dataCompleteness + "%" : "—"}`,
      ok: dataCompleteness >= 90 ? true : dataCompleteness >= 70 ? "warn" : false,
    },
    {
      label: `Physics ${hasAnomaly ? "⚠" : "✓"}`,
      ok: hasAnomaly ? "warn" : true,
    },
    {
      label:
        photoStatus === "SYSTEM_FAILURE"
          ? "Photos ✗"
          : photoStatus === "ANALYSED"
          ? "Photos ✓"
          : "Photos —",
      ok:
        photoStatus === "SYSTEM_FAILURE"
          ? false
          : photoStatus === "ANALYSED"
          ? true
          : "warn",
    },
  ];

  return (
    <div
      className="report-cover-card"
      style={{
        border: "2px solid #E2E8F0",
        borderRadius: "8px",
        overflow: "hidden",
        marginBottom: "24px",
        fontFamily: "'Inter', sans-serif",
        background: "var(--rpt-card-bg)",
        pageBreakAfter: "always",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          background: "var(--rpt-header-bg)",
          color: "var(--rpt-header-text)",
          padding: "12px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: "11px", opacity: 0.6, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            KINGA AI v4.2 — Forensic Audit Report
          </div>
          <div style={{ fontSize: "14px", fontWeight: 700, marginTop: "2px" }}>
            Claim: {claim?.claimNumber ?? claim?.id ?? "—"} &nbsp;|&nbsp; Reg:{" "}
            {claim?.vehicleRegistration ?? aiAssessment?.vehicleRegistration ?? "—"}
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: "11px", opacity: 0.7 }}>
          <div>{new Date().toUTCString()}</div>
          <div style={{ marginTop: "2px" }}>
            {claim?.vehicleMake ?? ""} {claim?.vehicleModel ?? ""}
          </div>
        </div>
      </div>

      {/* Decision pill */}
      <div
        style={{
          background: dc.bg,
          color: dc.text,
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <div style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "0.05em" }}>
          {finalDecision}
        </div>
        <div style={{ fontSize: "13px", opacity: 0.9 }}>
          Fraud Risk {fraudScore}/100 &nbsp;|&nbsp; Physics Consistency{" "}
          {consistencyScore}%
        </div>
      </div>

      {/* 3-metric dashboard */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          borderBottom: "1px solid var(--rpt-card-border)",
        }}
      >
        {/* Physics */}
        <div style={{ padding: "16px 20px", borderRight: "1px solid var(--rpt-card-border)" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--rpt-muted-text)", marginBottom: "6px" }}>
            Physics
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: hasAnomaly ? "#D97706" : "#059669" }}>
            {consistencyScore}%
          </div>
          <div style={{ fontSize: "11px", color: "var(--rpt-muted-text)", marginTop: "4px" }}>
            {hasAnomaly ? "⚠ Anomaly detected" : "✓ Consistent"}
          </div>
          {advisories.length > 0 && (
            <div style={{ fontSize: "10px", color: "#D97706", marginTop: "4px" }}>
              {advisories[0]}
            </div>
          )}
        </div>

        {/* Cost */}
        <div style={{ padding: "16px 20px", borderRight: "1px solid var(--rpt-card-border)" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--rpt-muted-text)", marginBottom: "6px" }}>
            Cost
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--rpt-card-text)" }}>
            {formatCurrency(agreedTotal)}
          </div>
          <div style={{ fontSize: "11px", color: "var(--rpt-muted-text)", marginTop: "4px" }}>
            {quotedTotal > 0 ? `vs ${formatCurrency(quotedTotal)} quoted` : "No quote on file"}
          </div>
          <div style={{ fontSize: "10px", marginTop: "4px", color: costOk ? "#059669" : "#D97706" }}>
            {costOk ? "✓ Within range" : `⚠ ${(costVariance * 100).toFixed(1)}% variance`}
          </div>
        </div>

        {/* Evidence */}
        <div style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--rpt-muted-text)", marginBottom: "6px" }}>
            Evidence
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--rpt-card-text)" }}>
            {photosDetected}
          </div>
          <div style={{ fontSize: "11px", color: "var(--rpt-muted-text)", marginTop: "4px" }}>
            photos detected
          </div>
          <div
            style={{
              fontSize: "10px",
              marginTop: "4px",
              color:
                photoStatus === "SYSTEM_FAILURE"
                  ? "#DC2626"
                  : photoStatus === "ANALYSED"
                  ? "#059669"
                  : "#475569",
            }}
          >
            {evidenceStatus}
          </div>
        </div>
      </div>

      {/* Primary blockers */}
      {keyDrivers.length > 0 && (
        <div style={{ padding: "12px 20px", background: "#FEF3C7", borderBottom: "1px solid #FDE68A" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "#92400E", marginBottom: "6px" }}>
            Primary Blockers
          </div>
          {keyDrivers.slice(0, 2).map((d, i) => (
            <div key={i} style={{ fontSize: "12px", color: "#78350F", marginBottom: "2px" }}>
              • {d}
            </div>
          ))}
        </div>
      )}

      {/* Pre-flight status bar */}
      <div
        style={{
          padding: "10px 20px",
          background: "var(--rpt-subtle-bg)",
          borderBottom: "1px solid var(--rpt-card-border)",
          display: "flex",
          gap: "12px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "var(--rpt-muted-text)", marginRight: "4px" }}>
          Pre-flight
        </span>
        {badges.map((b, i) => (
          <span
            key={i}
            style={{
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "4px",
              fontWeight: 600,
              background:
                b.ok === true
                  ? "#D1FAE5"
                  : b.ok === "warn"
                  ? "#FEF3C7"
                  : "#FEE2E2",
              color:
                b.ok === true
                  ? "#065F46"
                  : b.ok === "warn"
                  ? "#92400E"
                  : "#991B1B",
            }}
          >
            {b.label}
          </span>
        ))}
        {corrections > 0 && (
          <span
            style={{
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "4px",
              fontWeight: 600,
              background: "#FEF3C7",
              color: "#92400E",
            }}
          >
            {corrections} correction{corrections > 1 ? "s" : ""} applied
          </span>
        )}
      </div>

      {/* Timeline */}
      <div style={{ padding: "16px 20px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "var(--rpt-muted-text)", marginBottom: "10px" }}>
          Claim Timeline
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
          {[
            { label: "Incident", date: incidentDate },
            { label: "Inspection", date: inspectionDate },
            { label: "Quote", date: quoteDate },
            { label: "Report", date: reportDate },
          ].map((item, i, arr) => (
            <React.Fragment key={i}>
              <div style={{ textAlign: "center", minWidth: "80px" }}>
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    background: item.date === "—" ? "#CBD5E1" : "#0369A1",
                    margin: "0 auto 4px",
                    border: "2px solid #FFFFFF",
                    boxShadow: "0 0 0 2px #0369A1",
                  }}
                />
                <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--rpt-card-text)" }}>
                  {item.label}
                </div>
                <div style={{ fontSize: "9px", color: "var(--rpt-muted-text)", marginTop: "2px" }}>
                  {item.date}
                </div>
              </div>
              {i < arr.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: "2px",
                    background: "var(--rpt-card-border)",
                    marginBottom: "20px",
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. VehicleDamageMap — SVG top-down vehicle diagram
// ─────────────────────────────────────────────────────────────────────────────

interface VehicleDamageMapProps {
  aiAssessment: any;
  enforcement: any;
}

const ZONE_KEYWORDS: Record<string, string[]> = {
  front: ["front", "bonnet", "hood", "bumper", "grille", "headlight", "radiator", "fender_front", "wing_front"],
  rear: ["rear", "boot", "trunk", "tail", "back bumper", "tailgate", "tow"],
  left: ["left", "driver", "offside", "door_left", "mirror_left", "wing_left", "fender_left"],
  right: ["right", "passenger", "nearside", "door_right", "mirror_right", "wing_right", "fender_right"],
  roof: ["roof", "sunroof", "windscreen", "windshield", "a-pillar", "b-pillar"],
  underbody: ["underbody", "chassis", "axle", "suspension", "exhaust", "sump"],
};

type Severity = "severe" | "moderate" | "minor" | "none";

const SEVERITY_COLOUR: Record<Severity, string> = {
  severe: "#DC2626",
  moderate: "#D97706",
  minor: "#FBBF24",
  none: "#E2E8F0",
};

function classifyZone(component: string): string {
  const lc = component.toLowerCase();
  for (const [zone, keywords] of Object.entries(ZONE_KEYWORDS)) {
    if (keywords.some((k) => lc.includes(k))) return zone;
  }
  return "front"; // default to front for unknown components
}

function severityFromLabel(label: string): Severity {
  const lc = (label ?? "").toLowerCase();
  if (lc.includes("severe") || lc.includes("major") || lc.includes("critical")) return "severe";
  if (lc.includes("moderate") || lc.includes("medium")) return "moderate";
  if (lc.includes("minor") || lc.includes("light") || lc.includes("low")) return "minor";
  return "moderate";
}

export function VehicleDamageMap({ aiAssessment, enforcement }: VehicleDamageMapProps) {
  // Build zone severity map from damagedComponents
  const components: Array<{ name: string; severity: string }> =
    enforcement?.costExtraction?.itemised_parts?.map((ip: any) => ({
      name: ip.component ?? "",
      severity: "moderate",
    })) ??
    aiAssessment?.damagedComponents?.map((c: string) => ({ name: c, severity: "moderate" })) ??
    [];

  const zoneMap: Record<string, Severity> = {
    front: "none",
    rear: "none",
    left: "none",
    right: "none",
    roof: "none",
    underbody: "none",
  };

  const severityRank: Record<Severity, number> = { none: 0, minor: 1, moderate: 2, severe: 3 };

  for (const comp of components) {
    const zone = classifyZone(comp.name);
    const sev = severityFromLabel(comp.severity ?? "moderate");
    if (severityRank[sev] > severityRank[zoneMap[zone] as Severity]) {
      zoneMap[zone] = sev;
    }
  }

  const impactDirection: string =
    enforcement?.directionFlag?.reportedDirection ??
    aiAssessment?.impactDirection ??
    "front";

  // If no components but we have impact direction, mark that zone as moderate
  if (components.length === 0 && impactDirection) {
    const zone = classifyZone(impactDirection);
    if (zoneMap[zone] === "none") zoneMap[zone] = "moderate";
  }

  const legendItems: Array<{ sev: Severity; label: string }> = [
    { sev: "severe", label: "Severe" },
    { sev: "moderate", label: "Moderate" },
    { sev: "minor", label: "Minor" },
    { sev: "none", label: "Undamaged" },
  ];

  return (
    <div
      style={{
        background: "var(--rpt-card-bg)",
        border: "1px solid var(--rpt-card-border)",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "16px",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--rpt-card-text)",
          marginBottom: "12px",
        }}
      >
        Vehicle Damage Map
      </div>

      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
        {/* SVG vehicle top-down */}
        <svg
          viewBox="0 0 200 360"
          width="140"
          height="252"
          style={{ flexShrink: 0 }}
          aria-label="Vehicle damage zone diagram"
        >
          {/* Vehicle body outline */}
          <rect x="30" y="20" width="140" height="320" rx="30" fill="#F8FAFC" stroke="var(--rpt-card-border)" strokeWidth="2" />

          {/* Front zone */}
          <rect
            x="30" y="20" width="140" height="80"
            rx="30"
            fill={SEVERITY_COLOUR[zoneMap.front]}
            opacity="0.7"
          />
          <text x="100" y="65" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="600">FRONT</text>

          {/* Rear zone */}
          <rect
            x="30" y="260" width="140" height="80"
            rx="30"
            fill={SEVERITY_COLOUR[zoneMap.rear]}
            opacity="0.7"
          />
          <text x="100" y="305" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="600">REAR</text>

          {/* Left zone */}
          <rect
            x="30" y="100" width="40" height="160"
            fill={SEVERITY_COLOUR[zoneMap.left]}
            opacity="0.7"
          />
          <text x="50" y="185" textAnchor="middle" fontSize="9" fill="currentColor" fontWeight="600" transform="rotate(-90 50 185)">LEFT</text>

          {/* Right zone */}
          <rect
            x="130" y="100" width="40" height="160"
            fill={SEVERITY_COLOUR[zoneMap.right]}
            opacity="0.7"
          />
          <text x="150" y="185" textAnchor="middle" fontSize="9" fill="currentColor" fontWeight="600" transform="rotate(90 150 185)">RIGHT</text>

          {/* Roof/centre zone */}
          <rect
            x="70" y="100" width="60" height="160"
            fill={SEVERITY_COLOUR[zoneMap.roof]}
            opacity="0.5"
          />
          <text x="100" y="185" textAnchor="middle" fontSize="9" fill="currentColor">CABIN</text>

          {/* Windscreen line */}
          <line x1="40" y1="100" x2="160" y2="100" stroke="var(--rpt-card-border)" strokeWidth="1.5" strokeDasharray="4,3" />
          {/* Rear window line */}
          <line x1="40" y1="260" x2="160" y2="260" stroke="var(--rpt-card-border)" strokeWidth="1.5" strokeDasharray="4,3" />

          {/* Impact direction arrow */}
          {impactDirection && (
            <g>
              {impactDirection.toLowerCase().includes("front") && (
                <polygon points="100,8 92,22 108,22" fill="#0369A1" />
              )}
              {impactDirection.toLowerCase().includes("rear") && (
                <polygon points="100,352 92,338 108,338" fill="#0369A1" />
              )}
              {impactDirection.toLowerCase().includes("left") && (
                <polygon points="18,180 32,172 32,188" fill="#0369A1" />
              )}
              {impactDirection.toLowerCase().includes("right") && (
                <polygon points="182,180 168,172 168,188" fill="#0369A1" />
              )}
            </g>
          )}
        </svg>

        {/* Legend + component list */}
        <div style={{ flex: 1 }}>
          {/* Legend */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
            {legendItems.map((li) => (
              <div key={li.sev} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "2px",
                    background: SEVERITY_COLOUR[li.sev],
                    border: "1px solid #CBD5E1",
                  }}
                />
                <span style={{ fontSize: "10px", color: "var(--rpt-muted-text)" }}>{li.label}</span>
              </div>
            ))}
          </div>

          {/* Damaged components list */}
          {components.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr style={{ background: "var(--rpt-subtle-bg)" }}>
                  <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--rpt-muted-text)", fontWeight: 600, borderBottom: "1px solid var(--rpt-card-border)" }}>Component</th>
                  <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--rpt-muted-text)", fontWeight: 600, borderBottom: "1px solid var(--rpt-card-border)" }}>Zone</th>
                  <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--rpt-muted-text)", fontWeight: 600, borderBottom: "1px solid var(--rpt-card-border)" }}>Severity</th>
                </tr>
              </thead>
              <tbody>
                {components.slice(0, 10).map((c, i) => {
                  const sev = severityFromLabel(c.severity);
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid var(--rpt-table-row-border)" }}>
                      <td style={{ padding: "4px 8px", color: "var(--rpt-card-text)" }}>{c.name}</td>
                      <td style={{ padding: "4px 8px", color: "var(--rpt-muted-text)", textTransform: "capitalize" }}>{classifyZone(c.name)}</td>
                      <td style={{ padding: "4px 8px" }}>
                        <span
                          style={{
                            padding: "1px 6px",
                            borderRadius: "3px",
                            fontSize: "10px",
                            fontWeight: 600,
                            background:
                              sev === "severe" ? "#FEE2E2" :
                              sev === "moderate" ? "#FEF3C7" :
                              sev === "minor" ? "#FEF9C3" : "#F1F5F9",
                            color:
                              sev === "severe" ? "#991B1B" :
                              sev === "moderate" ? "#92400E" :
                              sev === "minor" ? "#713F12" : "#475569",
                          }}
                        >
                          {sev.charAt(0).toUpperCase() + sev.slice(1)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: "11px", color: "var(--rpt-muted-text)", fontStyle: "italic" }}>
              No component data available — see Section 2 for analysis.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ComparativePatternTable — Expected vs Observed
// ─────────────────────────────────────────────────────────────────────────────

interface ComparativePatternTableProps {
  aiAssessment: any;
  enforcement: any;
}

const INCIDENT_PATTERNS: Record<string, Array<{ component: string; expected: string }>> = {
  ANIMAL_STRIKE: [
    { component: "Bonnet / Hood", expected: "Deformation (common)" },
    { component: "Front Bumper", expected: "Impact damage (common)" },
    { component: "Radiator / Grille", expected: "Puncture or crush (common)" },
    { component: "Airbag deployment", expected: "Unlikely below 25 km/h Delta-V" },
    { component: "Seatbelt pre-tensioner", expected: "Unlikely below 15 km/h Delta-V" },
    { component: "Windscreen", expected: "Possible if large animal" },
  ],
  COLLISION_VEHICLE: [
    { component: "Front Bumper", expected: "Crush damage (common)" },
    { component: "Bonnet / Hood", expected: "Deformation (common)" },
    { component: "Airbag deployment", expected: "Expected above 25 km/h Delta-V" },
    { component: "Seatbelt pre-tensioner", expected: "Expected above 15 km/h Delta-V" },
    { component: "Radiator", expected: "Possible if high-speed" },
    { component: "Frame / Chassis", expected: "Possible if severe" },
  ],
  ROLLOVER: [
    { component: "Roof", expected: "Crush damage (common)" },
    { component: "A/B Pillars", expected: "Deformation (common)" },
    { component: "All glass", expected: "Breakage (common)" },
    { component: "Airbag deployment", expected: "Expected" },
    { component: "Seatbelt pre-tensioner", expected: "Expected" },
  ],
};

function getObservedStatus(
  component: string,
  components: Array<{ name: string; severity: string }>
): { found: boolean; severity: string } {
  const lc = component.toLowerCase();
  const match = components.find((c) =>
    c.name.toLowerCase().includes(lc.split("/")[0].trim()) ||
    lc.includes(c.name.toLowerCase().split(" ")[0])
  );
  return match
    ? { found: true, severity: match.severity ?? "moderate" }
    : { found: false, severity: "" };
}

export function ComparativePatternTable({
  aiAssessment,
  enforcement,
}: ComparativePatternTableProps) {
  const incidentType: string = (
    aiAssessment?.incidentType ??
    enforcement?.incidentType ??
    "UNKNOWN"
  ).toUpperCase();

  const pattern =
    INCIDENT_PATTERNS[incidentType] ??
    INCIDENT_PATTERNS[
      Object.keys(INCIDENT_PATTERNS).find((k) => incidentType.includes(k)) ?? ""
    ] ??
    null;

  const components: Array<{ name: string; severity: string }> =
    enforcement?.costExtraction?.itemised_parts?.map((ip: any) => ({
      name: ip.component ?? "",
      severity: "moderate",
    })) ??
    aiAssessment?.damagedComponents?.map((c: string) => ({ name: c, severity: "moderate" })) ??
    [];

  if (!pattern) {
    return (
      <div
        style={{
        background: "#FEF3C7",
        border: "1px solid #FDE68A",
        borderRadius: "6px",
        padding: "12px 16px",
        fontSize: "12px",
        color: "#92400E",
        marginBottom: "16px",
        }}
      >
        ⚠ Comparative pattern analysis not available for incident type:{" "}
        <strong>{incidentType || "Unknown"}</strong>. Manual classification required.
      </div>
    );
  }

  const matchedCount = pattern.filter(
    (p) => getObservedStatus(p.component, components).found
  ).length;
  const matchRate = Math.round((matchedCount / pattern.length) * 100);

  return (
    <div
      style={{
        background: "var(--rpt-card-bg)",
        border: "1px solid var(--rpt-card-border)",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--rpt-card-text)" }}>
          Damage Pattern — Expected vs Observed
        </div>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: "4px",
            background: matchRate >= 60 ? "#D1FAE5" : matchRate >= 40 ? "#FEF3C7" : "#FEE2E2",
            color: matchRate >= 60 ? "#065F46" : matchRate >= 40 ? "#92400E" : "#991B1B",
          }}
        >
          Match rate: {matchRate}% ({matchedCount}/{pattern.length})
        </div>
      </div>

      <div style={{ fontSize: "10px", color: "var(--rpt-muted-text)", marginBottom: "10px" }}>
        Incident type: <strong>{incidentType.replace(/_/g, " ")}</strong>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
        <thead>
          <tr style={{ background: "var(--rpt-subtle-bg)" }}>
            <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--rpt-muted-text)", fontWeight: 600, borderBottom: "1px solid var(--rpt-card-border)", width: "35%" }}>
              Component
            </th>
            <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--rpt-muted-text)", fontWeight: 600, borderBottom: "1px solid var(--rpt-card-border)", width: "35%" }}>
              Expected Pattern
            </th>
            <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--rpt-muted-text)", fontWeight: 600, borderBottom: "1px solid var(--rpt-card-border)", width: "30%" }}>
              Observed
            </th>
          </tr>
        </thead>
        <tbody>
          {pattern.map((row, i) => {
            const obs = getObservedStatus(row.component, components);
            return (
              <tr key={i} style={{ borderBottom: "1px solid var(--rpt-table-row-border)" }}>
                <td style={{ padding: "6px 10px", color: "var(--rpt-card-text)" }}>{row.component}</td>
                <td style={{ padding: "6px 10px", color: "var(--rpt-muted-text)" }}>{row.expected}</td>
                <td style={{ padding: "6px 10px" }}>
                  {obs.found ? (
                    <span style={{ color: "#059669", fontWeight: 600 }}>
                      ✓ {obs.severity.charAt(0).toUpperCase() + obs.severity.slice(1)}
                    </span>
                  ) : (
                    <span style={{ color: "var(--rpt-muted-text)" }}>— Not observed</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ConstraintStatusMatrix — results only, no formulas
// ─────────────────────────────────────────────────────────────────────────────

interface ConstraintStatusMatrixProps {
  enforcement: any;
}

export function ConstraintStatusMatrix({ enforcement }: ConstraintStatusMatrixProps) {
  const phase2 = enforcement?._phase2 ?? {};
  const constraints: Array<{
    constraint: string;
    suppressed: boolean;
    advisory: string | null;
  }> = phase2.physicsConstraints ?? [];

  const advisories: string[] = phase2.advisories ?? [];

  // Build from weighted fraud contributions if phase2 constraints not available
  const fraudContribs: Array<{ factor: string; value: number }> =
    enforcement?.weightedFraud?.contributions ?? [];

  if (constraints.length === 0 && fraudContribs.length === 0 && advisories.length === 0) {
    return null;
  }

  // Merge phase2 physicsConstraints with advisories
  const rows: Array<{
    constraint: string;
    status: "pass" | "fail" | "advisory" | "suppressed";
    verdict: string;
  }> = [
    ...constraints.map((c) => ({
      constraint: c.constraint.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      status: (c.suppressed ? "suppressed" : c.advisory ? "advisory" : "pass") as "pass" | "fail" | "advisory" | "suppressed",
      verdict: c.advisory ?? (c.suppressed ? "Not applicable at observed Delta-V" : "Passed"),
    })),
    ...advisories
      .filter((a) => !constraints.some((c) => a.toLowerCase().includes(c.constraint.toLowerCase())))
      .map((a) => ({
        constraint: a.split(" ").slice(0, 4).join(" ") + "…",
        status: "advisory" as const,
        verdict: a,
      })),
  ];

  if (rows.length === 0) return null;

  const statusIcon: Record<string, string> = {
    pass: "✓",
    fail: "✗",
    advisory: "⚠",
    suppressed: "○",
  };

  const statusColour: Record<string, { bg: string; text: string }> = {
    pass: { bg: "#D1FAE5", text: "#065F46" },
    fail: { bg: "#FEE2E2", text: "#991B1B" },
    advisory: { bg: "#FEF3C7", text: "#92400E" },
    suppressed: { bg: "#F1F5F9", text: "#475569" },
  };

  return (
    <div
      style={{
        background: "var(--rpt-card-bg)",
        border: "1px solid var(--rpt-card-border)",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "16px",
      }}
    >
      <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--rpt-card-text)", marginBottom: "12px" }}>
        Constraint Status Matrix
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
        <thead>
          <tr style={{ background: "var(--rpt-subtle-bg)" }}>
            <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--rpt-muted-text)", fontWeight: 600, borderBottom: "1px solid var(--rpt-card-border)", width: "35%" }}>
              Constraint
            </th>
            <th style={{ textAlign: "center", padding: "6px 10px", color: "var(--rpt-muted-text)", fontWeight: 600, borderBottom: "1px solid var(--rpt-card-border)", width: "15%" }}>
              Status
            </th>
            <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--rpt-muted-text)", fontWeight: 600, borderBottom: "1px solid var(--rpt-card-border)" }}>
              Assessment
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const sc = statusColour[row.status] ?? statusColour.advisory;
            return (
              <tr key={i} style={{ borderBottom: "1px solid var(--rpt-table-row-border)" }}>
                <td style={{ padding: "6px 10px", color: "var(--rpt-card-text)", fontWeight: 500 }}>
                  {row.constraint}
                </td>
                <td style={{ padding: "6px 10px", textAlign: "center" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontWeight: 700,
                      fontSize: "11px",
                      background: sc.bg,
                      color: sc.text,
                    }}
                  >
                    {statusIcon[row.status]} {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                  </span>
                </td>
                <td style={{ padding: "6px 10px", color: "var(--rpt-muted-text)" }}>{row.verdict}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: "10px", fontSize: "10px", color: "var(--rpt-muted-text)" }}>
        ○ Suppressed = constraint not applicable at observed Delta-V. Advisory = requires manual verification. No threshold values are displayed in this view.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. DecisionFlowchart — vertical SVG flowchart
// ─────────────────────────────────────────────────────────────────────────────

interface DecisionFlowchartProps {
  enforcement: any;
  aiAssessment: any;
}

export function DecisionFlowchart({ enforcement, aiAssessment }: DecisionFlowchartProps) {
  const phase2 = enforcement?._phase2 ?? {};
  const finalDecision: string = phase2.finalDecision ?? enforcement?.finalDecision?.recommendation ?? "REVIEW";
  const keyDrivers: string[] = phase2.keyDrivers ?? [];
  const nextSteps: string[] = phase2.nextSteps ?? [];
  const dataCompleteness: number = phase2.dataCompleteness ?? 0;
  const consistencyScore: number = enforcement?.consistencyFlag?.score ?? enforcement?._phase2?.physicsConsistency ?? 0;
  const fraudScore: number = enforcement?.weightedFraud?.score ?? 0;
  const advisories: string[] = phase2.advisories ?? [];

  const dc = decisionColour(finalDecision);

  // Decision steps
  const steps: Array<{
    question: string;
    result: string;
    pass: boolean;
    action?: string;
  }> = [
    {
      question: "Data complete?",
      result: dataCompleteness >= 90 ? `Yes (${dataCompleteness}%)` : `No (${dataCompleteness}%)`,
      pass: dataCompleteness >= 90,
      action: dataCompleteness < 90 ? "→ REVIEW (missing fields)" : undefined,
    },
    {
      question: "Physics consistent?",
      result: consistencyScore >= 30 ? `Yes (${consistencyScore}%)` : `No (${consistencyScore}%)`,
      pass: consistencyScore >= 30,
      action: consistencyScore < 30 ? "→ ESCALATE (physics anomaly)" : undefined,
    },
    {
      question: "Safety anomaly?",
      result: advisories.length > 0 ? `Yes (${advisories.length} advisory)` : "No",
      pass: advisories.length === 0,
      action: advisories.length > 0 ? "→ ESCALATE (manual review)" : undefined,
    },
    {
      question: "Fraud score ≥ 60?",
      result: fraudScore >= 60 ? `Yes (${fraudScore}/100)` : `No (${fraudScore}/100)`,
      pass: fraudScore < 60,
      action: fraudScore >= 60 ? "→ ESCALATE (fraud risk)" : undefined,
    },
  ];

  // Blocked actions
  const blockedApprove =
    finalDecision !== "APPROVE"
      ? `APPROVE blocked — ${keyDrivers[0] ?? "conditions not met"}`
      : null;
  const blockedReject =
    finalDecision !== "REJECT"
      ? "REJECT blocked — no evidence of malicious intent"
      : null;

  return (
    <div
      style={{
        background: "var(--rpt-card-bg)",
        border: "1px solid var(--rpt-card-border)",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "16px",
      }}
    >
      <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--rpt-card-text)", marginBottom: "16px" }}>
        Decision Authority Flowchart
      </div>

      <div style={{ display: "flex", gap: "24px" }}>
        {/* Flowchart */}
        <div style={{ flex: 1 }}>
          {/* START */}
          <div style={{ textAlign: "center", marginBottom: "8px" }}>
            <div
              style={{
                display: "inline-block",
                padding: "4px 16px",
                background: "var(--rpt-header-bg)",
                color: "var(--rpt-header-text)",
                borderRadius: "4px",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              START
            </div>
          </div>

          {steps.map((step, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              {/* Arrow down */}
              <div style={{ width: "2px", height: "12px", background: "var(--rpt-card-border)" }} />

              {/* Diamond decision node */}
              <div style={{ position: "relative", width: "180px" }}>
                <svg viewBox="0 0 180 50" width="180" height="50">
                  <polygon
                    points="90,2 178,25 90,48 2,25"
                    fill={step.pass ? "#F0FDF4" : "#FEF2F2"}
                    stroke={step.pass ? "#059669" : "#DC2626"}
                    strokeWidth="1.5"
                  />
                  <text x="90" y="20" textAnchor="middle" fontSize="9" fontWeight="600" fill="currentColor">
                    {step.question}
                  </text>
                  <text x="90" y="34" textAnchor="middle" fontSize="8" fill="#475569">
                    {step.result}
                  </text>
                </svg>

                {/* Branch off to the right if failed */}
                {step.action && (
                  <div
                    style={{
                      position: "absolute",
                      right: "-120px",
                      top: "14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <div style={{ width: "20px", height: "2px", background: "#DC2626" }} />
                    <div
                      style={{
                        fontSize: "9px",
                        color: "#991B1B",
                        fontWeight: 600,
                        background: "#FEE2E2",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {step.action}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Arrow to final decision */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: "2px", height: "12px", background: "var(--rpt-card-border)" }} />
            <div
              style={{
                padding: "8px 24px",
                background: dc.bg,
                color: dc.text,
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 800,
                letterSpacing: "0.05em",
              }}
            >
              FINAL DECISION: {finalDecision}
            </div>
          </div>
        </div>

        {/* Right panel: trigger conditions + blocked + next steps */}
        <div style={{ width: "220px", flexShrink: 0 }}>
          {/* Trigger conditions */}
          {keyDrivers.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "var(--rpt-muted-text)", marginBottom: "6px" }}>
                Trigger Conditions
              </div>
              {keyDrivers.map((d, i) => (
                <div key={i} style={{ fontSize: "10px", color: "var(--rpt-card-text)", marginBottom: "4px" }}>
                  {i + 1}. {d}
                </div>
              ))}
            </div>
          )}

          {/* Blocked actions */}
          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "var(--rpt-muted-text)", marginBottom: "6px" }}>
              Blocked Actions
            </div>
            {[blockedApprove, blockedReject].filter(Boolean).map((b, i) => (
              <div key={i} style={{ fontSize: "10px", color: "#DC2626", marginBottom: "4px" }}>
                • {b}
              </div>
            ))}
          </div>

          {/* Required next steps */}
          {nextSteps.length > 0 && (
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "var(--rpt-muted-text)", marginBottom: "6px" }}>
                Required Next Steps
              </div>
              {nextSteps.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: "6px", marginBottom: "5px", alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: "12px",
                      height: "12px",
                      border: "1.5px solid #475569",
                      borderRadius: "2px",
                      flexShrink: 0,
                      marginTop: "1px",
                    }}
                  />
                  <span style={{ fontSize: "10px", color: "var(--rpt-card-text)" }}>{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
