/**
 * Batch 2 Report Components — KINGA AutoVerify v4.2
 *
 * Components:
 * 1. CostWaterfallChart        — horizontal waterfall: Parts → Labour → Total vs Benchmark
 * 2. FraudIndicatorTable       — per-factor fraud score with mitigation notes
 * 3. FinalRiskStatement        — single-paragraph risk narrative with action line
 * 4. DocumentExtractionTable   — documents extracted, confidence, missing-document warnings
 */

import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt$(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

function pct(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CostWaterfallChart
// ─────────────────────────────────────────────────────────────────────────────

interface CostWaterfallChartProps {
  aiAssessment: any;
  enforcement: any;
  quotes?: any[];
}

export function CostWaterfallChart({
  aiAssessment,
  enforcement,
  quotes = [],
}: CostWaterfallChartProps) {
  // ── Source data ────────────────────────────────────────────────────────────
  const normalised = aiAssessment?._normalised ?? {};
  const costs = normalised.costs ?? {};

  const partsUsd: number =
    costs.partsUsd ??
    enforcement?.costExtraction?.partsTotal ??
    0;

  const labourUsd: number =
    costs.labourUsd ??
    enforcement?.costExtraction?.labourTotal ??
    0;

  const totalUsd: number =
    costs.totalUsd ??
    ((partsUsd + labourUsd) || ((aiAssessment?.estimatedCost ?? 0) / 100));

  const benchmarkMin: number =
    enforcement?.costBenchmark?.estimatedFairMin ?? totalUsd * 0.8;
  const benchmarkMax: number =
    enforcement?.costBenchmark?.estimatedFairMax ?? totalUsd * 1.2;
  const benchmarkMid: number =
    enforcement?.costBenchmark?.estimatedFairMid ??
    (benchmarkMin + benchmarkMax) / 2;

  const quotedTotal: number =
    enforcement?.costExtraction?.repairerQuoteUsd ??
    enforcement?.costExtraction?.quotedTotalUsd ??
    (quotes.length > 0
      ? quotes.reduce((s: number, q: any) => s + (q.totalAmount ?? 0), 0) / 100
      : 0);

  const panelBeater: string =
    enforcement?.costExtraction?.panelBeaterName ??
    aiAssessment?.panelBeaterName ??
    "";

  // ── Cost verdict ───────────────────────────────────────────────────────────
  const compareAmount = quotedTotal > 0 ? quotedTotal : totalUsd;
  const deviationPct =
    benchmarkMid > 0
      ? ((compareAmount - benchmarkMid) / benchmarkMid) * 100
      : null;

  const verdictLabel =
    deviationPct == null
      ? "NO BENCHMARK"
      : compareAmount > benchmarkMax * 1.05
      ? "OVERPRICED"
      : compareAmount < benchmarkMin * 0.95
      ? "UNDERPRICED"
      : "WITHIN RANGE";

  const verdictColour =
    verdictLabel === "OVERPRICED"
      ? { bg: "#FEE2E2", text: "#991B1B", bar: "#DC2626" }
      : verdictLabel === "UNDERPRICED"
      ? { bg: "#FEF3C7", text: "#92400E", bar: "#D97706" }
      : verdictLabel === "WITHIN RANGE"
      ? { bg: "#D1FAE5", text: "#065F46", bar: "#059669" }
      : { bg: "#F1F5F9", text: "#475569", bar: "#94A3B8" };

  // ── Bar chart dimensions ───────────────────────────────────────────────────
  const maxVal = Math.max(totalUsd, quotedTotal, benchmarkMax) * 1.1 || 1;
  const barH = 22;
  const barGap = 8;
  const labelW = 120;
  const chartW = 340;
  const rows = [
    { label: "Parts", value: partsUsd, colour: "#0369A1" },
    { label: "Labour", value: labourUsd, colour: "#0EA5E9" },
    { label: "AI Total", value: totalUsd, colour: "#475569" },
    ...(quotedTotal > 0
      ? [{ label: `Quoted${panelBeater ? ` (${panelBeater.split(" ")[0]})` : ""}`, value: quotedTotal, colour: verdictColour.bar }]
      : []),
    { label: "Benchmark Mid", value: benchmarkMid, colour: "#059669" },
  ];

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "16px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "14px",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#0F172A",
          }}
        >
          Cost Breakdown &amp; Benchmark
        </div>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: "4px",
            background: verdictColour.bg,
            color: verdictColour.text,
          }}
        >
          {verdictLabel}
          {deviationPct != null && ` · ${pct(deviationPct)}`}
        </span>
      </div>

      {/* Horizontal bar chart */}
      <svg
        viewBox={`0 0 ${labelW + chartW + 60} ${rows.length * (barH + barGap) + 30}`}
        width="100%"
        style={{ display: "block", overflow: "visible" }}
        aria-label="Cost breakdown bar chart"
      >
        {/* Benchmark band */}
        {benchmarkMin > 0 && benchmarkMax > 0 && (
          <rect
            x={labelW + (benchmarkMin / maxVal) * chartW}
            y={0}
            width={((benchmarkMax - benchmarkMin) / maxVal) * chartW}
            height={rows.length * (barH + barGap)}
            fill="#D1FAE5"
            opacity="0.5"
          />
        )}

        {rows.map((row, i) => {
          const barW = Math.max((row.value / maxVal) * chartW, 2);
          const y = i * (barH + barGap);
          return (
            <g key={i}>
              {/* Label */}
              <text
                x={labelW - 6}
                y={y + barH / 2 + 4}
                textAnchor="end"
                fontSize="10"
                fill="#475569"
                fontFamily="Inter, sans-serif"
              >
                {row.label}
              </text>
              {/* Bar */}
              <rect
                x={labelW}
                y={y + 2}
                width={barW}
                height={barH - 4}
                rx="3"
                fill={row.colour}
                opacity="0.85"
              />
              {/* Value label */}
              <text
                x={labelW + barW + 5}
                y={y + barH / 2 + 4}
                fontSize="10"
                fill="#0F172A"
                fontFamily="'Courier New', monospace"
                fontWeight="600"
              >
                {fmt$(row.value)}
              </text>
            </g>
          );
        })}

        {/* Benchmark range label */}
        {benchmarkMin > 0 && (
          <text
            x={labelW + (benchmarkMin / maxVal) * chartW}
            y={rows.length * (barH + barGap) + 14}
            fontSize="9"
            fill="#059669"
            fontFamily="Inter, sans-serif"
          >
            Benchmark {fmt$(benchmarkMin)} – {fmt$(benchmarkMax)}
          </text>
        )}
      </svg>

      {/* Summary row */}
      <div
        style={{
          marginTop: "12px",
          paddingTop: "10px",
          borderTop: "1px solid #F1F5F9",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "8px",
          fontSize: "11px",
        }}
      >
        <div>
          <div style={{ color: "#475569", marginBottom: "2px" }}>AI Estimate</div>
          <div style={{ fontWeight: 700, color: "#0F172A", fontFamily: "monospace" }}>
            {fmt$(totalUsd)}
          </div>
        </div>
        {quotedTotal > 0 && (
          <div>
            <div style={{ color: "#475569", marginBottom: "2px" }}>
              Quoted{panelBeater ? ` · ${panelBeater}` : ""}
            </div>
            <div
              style={{
                fontWeight: 700,
                color: verdictColour.text,
                fontFamily: "monospace",
              }}
            >
              {fmt$(quotedTotal)}
            </div>
          </div>
        )}
        <div>
          <div style={{ color: "#475569", marginBottom: "2px" }}>Benchmark Range</div>
          <div style={{ fontWeight: 700, color: "#059669", fontFamily: "monospace" }}>
            {fmt$(benchmarkMin)} – {fmt$(benchmarkMax)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. FraudIndicatorTable
// ─────────────────────────────────────────────────────────────────────────────

interface FraudIndicatorTableProps {
  enforcement: any;
  aiAssessment: any;
}

// Mitigation notes keyed on factor name fragments
const MITIGATION_MAP: Array<{ match: string; note: string }> = [
  { match: "photo", note: "Submit additional photos showing all damage angles." },
  { match: "timeline", note: "Provide a detailed written timeline of events." },
  { match: "police", note: "Submit certified police report or case number." },
  { match: "witness", note: "Provide witness statements or contact details." },
  { match: "history", note: "Provide prior claim documentation for context." },
  { match: "speed", note: "Provide GPS/telematics data or dashcam footage." },
  { match: "direction", note: "Provide scene photos showing impact direction." },
  { match: "airbag", note: "Provide workshop inspection report for airbag system." },
  { match: "quote", note: "Obtain a second independent repair quotation." },
  { match: "cost", note: "Provide itemised parts invoices from supplier." },
  { match: "parts", note: "Provide parts receipts or OEM price list." },
  { match: "labour", note: "Provide workshop labour rate schedule." },
  { match: "document", note: "Provide all missing claim documents." },
  { match: "registration", note: "Provide current vehicle registration certificate." },
  { match: "licence", note: "Provide valid driver's licence copy." },
];

function getMitigation(factor: string): string {
  const lc = factor.toLowerCase();
  for (const m of MITIGATION_MAP) {
    if (lc.includes(m.match)) return m.note;
  }
  return "Contact your claims handler for guidance.";
}

export function FraudIndicatorTable({
  enforcement,
  aiAssessment,
}: FraudIndicatorTableProps) {
  const weightedFraud = enforcement?.weightedFraud ?? {};
  const totalScore: number = weightedFraud.totalScore ?? weightedFraud.score ?? 0;
  const fraudLevel: string =
    aiAssessment?._normalised?.fraud?.level ??
    weightedFraud.level ??
    enforcement?.fraudLevelEnforced ??
    "low";

  // Build indicator rows
  type IndicatorRow = {
    factor: string;
    score: number;
    triggered: boolean;
    detail: string;
    mitigation: string;
  };

  const rows: IndicatorRow[] = [];

  // From full_contributions (preferred)
  const fullContribs: any[] = weightedFraud.full_contributions ?? [];
  if (fullContribs.length > 0) {
    for (const c of fullContribs) {
      if (c.triggered || c.value > 0) {
        rows.push({
          factor: c.factor ?? "Unknown",
          score: c.value ?? 0,
          triggered: c.triggered ?? c.value > 0,
          detail: c.detail ?? "",
          mitigation: getMitigation(c.factor ?? ""),
        });
      }
    }
  } else {
    // Fallback: contributions array
    const contribs: any[] = weightedFraud.contributions ?? [];
    for (const c of contribs) {
      if (c.value > 0) {
        rows.push({
          factor: c.factor ?? "Unknown",
          score: c.value ?? 0,
          triggered: true,
          detail: "",
          mitigation: getMitigation(c.factor ?? ""),
        });
      }
    }
  }

  // Also pull from aiIndicators if present
  const aiIndicators: any[] = enforcement?.aiIndicators ?? [];
  for (const ai of aiIndicators) {
    const label = ai.label ?? ai.indicator ?? "";
    if (!rows.some((r) => r.factor.toLowerCase() === label.toLowerCase())) {
      rows.push({
        factor: label,
        score: ai.points ?? ai.score ?? 0,
        triggered: true,
        detail: "",
        mitigation: getMitigation(label),
      });
    }
  }

  // Sort by score descending
  rows.sort((a, b) => b.score - a.score);

  const levelColour: Record<string, { bg: string; text: string }> = {
    minimal: { bg: "#D1FAE5", text: "#065F46" },
    low: { bg: "#D1FAE5", text: "#065F46" },
    medium: { bg: "#FEF3C7", text: "#92400E" },
    moderate: { bg: "#FEF3C7", text: "#92400E" },
    elevated: { bg: "#FEE2E2", text: "#991B1B" },
    high: { bg: "#FEE2E2", text: "#991B1B" },
    critical: { bg: "#FEE2E2", text: "#991B1B" },
  };
  const lc = levelColour[fraudLevel.toLowerCase()] ?? levelColour.low;

  if (rows.length === 0) {
    return (
      <div
        style={{
          background: "#D1FAE5",
          border: "1px solid #A7F3D0",
          borderRadius: "8px",
          padding: "14px 16px",
          marginBottom: "16px",
          fontSize: "12px",
          color: "#065F46",
        }}
      >
        ✓ No fraud indicators triggered. Fraud score: {totalScore}/100 —{" "}
        <strong>{fraudLevel.toUpperCase()}</strong> risk.
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "16px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#0F172A",
          }}
        >
          Fraud Indicator Analysis
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: "4px",
              background: lc.bg,
              color: lc.text,
            }}
          >
            {fraudLevel.toUpperCase()} · {totalScore}/100
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div
        style={{
          height: "6px",
          background: "#F1F5F9",
          borderRadius: "3px",
          marginBottom: "14px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(totalScore, 100)}%`,
            background:
              totalScore >= 60
                ? "#DC2626"
                : totalScore >= 40
                ? "#D97706"
                : "#059669",
            borderRadius: "3px",
            transition: "width 0.3s",
          }}
        />
      </div>

      {/* Indicator table */}
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}
      >
        <thead>
          <tr style={{ background: "#F8FAFC" }}>
            <th
              style={{
                textAlign: "left",
                padding: "6px 8px",
                color: "#475569",
                fontWeight: 600,
                borderBottom: "1px solid #E2E8F0",
                width: "28%",
              }}
            >
              Indicator
            </th>
            <th
              style={{
                textAlign: "center",
                padding: "6px 8px",
                color: "#475569",
                fontWeight: 600,
                borderBottom: "1px solid #E2E8F0",
                width: "10%",
              }}
            >
              Score
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "6px 8px",
                color: "#475569",
                fontWeight: 600,
                borderBottom: "1px solid #E2E8F0",
                width: "30%",
              }}
            >
              Detail
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "6px 8px",
                color: "#475569",
                fontWeight: 600,
                borderBottom: "1px solid #E2E8F0",
              }}
            >
              Mitigation
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
              <td
                style={{
                  padding: "6px 8px",
                  color: "#0F172A",
                  fontWeight: 500,
                }}
              >
                {row.factor
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (l) => l.toUpperCase())}
              </td>
              <td style={{ padding: "6px 8px", textAlign: "center" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "1px 6px",
                    borderRadius: "3px",
                    fontWeight: 700,
                    fontFamily: "monospace",
                    background:
                      row.score >= 15
                        ? "#FEE2E2"
                        : row.score >= 8
                        ? "#FEF3C7"
                        : "#F1F5F9",
                    color:
                      row.score >= 15
                        ? "#991B1B"
                        : row.score >= 8
                        ? "#92400E"
                        : "#475569",
                  }}
                >
                  {row.score}
                </span>
              </td>
              <td
                style={{
                  padding: "6px 8px",
                  color: "#475569",
                  fontSize: "10px",
                }}
              >
                {row.detail || "—"}
              </td>
              <td
                style={{
                  padding: "6px 8px",
                  color: "#0369A1",
                  fontSize: "10px",
                }}
              >
                {row.mitigation}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div
        style={{
          marginTop: "10px",
          fontSize: "10px",
          color: "#94A3B8",
          fontStyle: "italic",
        }}
      >
        Scores are weighted contributions to the aggregate fraud index. Mitigation actions may reduce individual factor scores upon re-assessment.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FinalRiskStatement
// ─────────────────────────────────────────────────────────────────────────────

interface FinalRiskStatementProps {
  enforcement: any;
  aiAssessment: any;
  claim: any;
}

export function FinalRiskStatement({
  enforcement,
  aiAssessment,
  claim,
}: FinalRiskStatementProps) {
  const phase2 = enforcement?._phase2 ?? {};
  const finalDecision: string =
    phase2.finalDecision ??
    enforcement?.finalDecision?.recommendation ??
    "REVIEW";

  const fraudLevel: string =
    aiAssessment?._normalised?.fraud?.level ??
    enforcement?.fraudLevelEnforced ??
    "low";

  const fraudScore: number =
    enforcement?.weightedFraud?.totalScore ??
    aiAssessment?._normalised?.fraud?.score ??
    0;

  const consistencyScore: number =
    enforcement?.consistencyScore ??
    aiAssessment?._normalised?.fraud?.physicsConsistency ??
    0;

  const totalUsd: number =
    aiAssessment?._normalised?.costs?.totalUsd ??
    (aiAssessment?.estimatedCost ?? 0) / 100;

  const keyDrivers: string[] = phase2.keyDrivers ?? [];
  const nextSteps: string[] = phase2.nextSteps ?? [];
  const advisories: string[] = phase2.advisories ?? [];

  const vehicleTitle = [
    claim?.vehicleMake,
    claim?.vehicleModel,
    claim?.vehicleYear,
  ]
    .filter(Boolean)
    .join(" ") || "the insured vehicle";

  // Build narrative
  const riskSentence =
    fraudScore >= 60
      ? `presents a HIGH fraud risk (score ${fraudScore}/100) and requires immediate escalation`
      : fraudScore >= 40
      ? `presents a MODERATE fraud risk (score ${fraudScore}/100) and warrants careful review`
      : `presents a LOW fraud risk (score ${fraudScore}/100) and is consistent with a legitimate claim`;

  const physicsSentence =
    consistencyScore < 30
      ? `Physics consistency is critically low at ${consistencyScore}%, indicating the reported damage pattern is inconsistent with the described incident mechanics.`
      : consistencyScore < 60
      ? `Physics consistency is marginal at ${consistencyScore}%, suggesting partial alignment between the reported incident and observed damage.`
      : `Physics consistency is satisfactory at ${consistencyScore}%, supporting the plausibility of the reported incident.`;

  const costSentence =
    totalUsd > 0
      ? `The assessed repair cost of ${fmt$(totalUsd)} ${
          enforcement?.costBenchmark?.estimatedFairMax &&
          totalUsd > enforcement.costBenchmark.estimatedFairMax * 1.05
            ? "exceeds the benchmark ceiling and requires cost justification"
            : enforcement?.costBenchmark?.estimatedFairMin &&
              totalUsd < enforcement.costBenchmark.estimatedFairMin * 0.95
            ? "falls below the benchmark floor and may indicate incomplete scope"
            : "falls within the expected benchmark range"
        }.`
      : "";

  const dc =
    finalDecision === "ESCALATE" || finalDecision === "REJECT"
      ? { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", pill: "#DC2626" }
      : finalDecision === "REVIEW"
      ? { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", pill: "#D97706" }
      : { bg: "#F0FDF4", border: "#A7F3D0", text: "#065F46", pill: "#059669" };

  return (
    <div
      style={{
        background: dc.bg,
        border: `1px solid ${dc.border}`,
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "16px",
      }}
    >
      {/* Heading */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#0F172A",
          }}
        >
          Final Risk Statement
        </div>
        <span
          style={{
            fontSize: "12px",
            fontWeight: 800,
            padding: "4px 12px",
            borderRadius: "4px",
            background: dc.pill,
            color: "#FFFFFF",
            letterSpacing: "0.05em",
          }}
        >
          {finalDecision}
        </span>
      </div>

      {/* Narrative paragraph */}
      <p
        style={{
          fontSize: "12px",
          lineHeight: "1.7",
          color: "#0F172A",
          marginBottom: "10px",
        }}
      >
        This claim for <strong>{vehicleTitle}</strong> {riskSentence}.{" "}
        {physicsSentence} {costSentence}
        {advisories.length > 0 &&
          ` The following advisory conditions were identified: ${advisories
            .slice(0, 2)
            .join("; ")}.`}
      </p>

      {/* Key drivers */}
      {keyDrivers.length > 0 && (
        <div
          style={{
            background: "rgba(0,0,0,0.04)",
            borderRadius: "4px",
            padding: "8px 12px",
            marginBottom: "10px",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              color: dc.text,
              marginBottom: "4px",
            }}
          >
            Decision Drivers
          </div>
          {keyDrivers.map((d, i) => (
            <div
              key={i}
              style={{ fontSize: "11px", color: "#0F172A", marginBottom: "2px" }}
            >
              {i + 1}. {d}
            </div>
          ))}
        </div>
      )}

      {/* Action line */}
      {nextSteps.length > 0 && (
        <div
          style={{
            borderTop: `1px solid ${dc.border}`,
            paddingTop: "10px",
            fontSize: "11px",
            color: dc.text,
            fontWeight: 600,
          }}
        >
          Required action:{" "}
          <span style={{ fontWeight: 400, color: "#0F172A" }}>
            {nextSteps[0]}
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DocumentExtractionTable
// ─────────────────────────────────────────────────────────────────────────────

interface DocumentExtractionTableProps {
  aiAssessment: any;
  enforcement: any;
  claim: any;
}

type DocStatus = "present" | "missing" | "partial" | "not_required";

interface DocRow {
  document: string;
  status: DocStatus;
  confidence: number | null;
  note: string;
}

export function DocumentExtractionTable({
  aiAssessment,
  enforcement,
  claim,
}: DocumentExtractionTableProps) {
  const phase1 = enforcement?._phase1 ?? {};

  // Build document inventory from available data
  const docs: DocRow[] = [];

  // Police report
  const policeReport =
    aiAssessment?.policeReportNumber ??
    claim?.policeReportNumber ??
    phase1.policeReportNumber ??
    null;
  docs.push({
    document: "Police Report",
    status: policeReport ? "present" : "missing",
    confidence: policeReport ? 90 : null,
    note: policeReport
      ? `Ref: ${policeReport}`
      : "Required for claims involving third parties or theft.",
  });

  // Repair quotation
  const hasQuote =
    (aiAssessment?._normalised?.costs?.totalUsd ?? 0) > 0 ||
    (enforcement?.costExtraction?.repairerQuoteUsd ?? 0) > 0;
  const panelBeater =
    enforcement?.costExtraction?.panelBeaterName ??
    aiAssessment?.panelBeaterName ??
    null;
  docs.push({
    document: "Repair Quotation",
    status: hasQuote ? "present" : "missing",
    confidence: hasQuote ? 85 : null,
    note: hasQuote
      ? panelBeater
        ? `Submitted by ${panelBeater}`
        : "Quotation on file"
      : "Obtain itemised quotation from registered repairer.",
  });

  // Damage photos
  const photoCount: number = aiAssessment?.damagePhotoUrls?.length ?? 0;
  const photoStatus: string =
    enforcement?._phase2?.photoStatus ?? "NOT_APPLICABLE";
  docs.push({
    document: "Damage Photographs",
    status:
      photoCount >= 3
        ? "present"
        : photoCount > 0
        ? "partial"
        : photoStatus === "SYSTEM_FAILURE"
        ? "partial"
        : "missing",
    confidence: photoCount > 0 ? Math.min(70 + photoCount * 5, 95) : null,
    note:
      photoCount >= 3
        ? `${photoCount} photos extracted and processed`
        : photoCount > 0
        ? `Only ${photoCount} photo(s) — minimum 3 recommended`
        : photoStatus === "SYSTEM_FAILURE"
        ? "Photo processing encountered a system error — not penalised"
        : "Submit minimum 3 photos: front, rear, and damage close-up.",
  });

  // Driver's licence
  const hasLicence =
    claim?.driverLicenceNumber ??
    aiAssessment?.driverLicenceNumber ??
    null;
  docs.push({
    document: "Driver's Licence",
    status: hasLicence ? "present" : "missing",
    confidence: hasLicence ? 95 : null,
    note: hasLicence
      ? `Licence: ${hasLicence}`
      : "Submit copy of valid driver's licence.",
  });

  // Vehicle registration
  const hasReg =
    claim?.vehicleRegistration ??
    aiAssessment?.vehicleRegistration ??
    null;
  docs.push({
    document: "Vehicle Registration",
    status: hasReg ? "present" : "missing",
    confidence: hasReg ? 95 : null,
    note: hasReg
      ? `Reg: ${hasReg}`
      : "Submit current vehicle registration certificate.",
  });

  // Witness statement
  const hasWitness =
    aiAssessment?.witnessStatement ??
    claim?.witnessStatement ??
    null;
  docs.push({
    document: "Witness Statement",
    status: hasWitness ? "present" : "not_required",
    confidence: hasWitness ? 70 : null,
    note: hasWitness
      ? "Witness statement on file"
      : "Optional — submit if available to strengthen claim.",
  });

  // OCR raw text (Stage 2)
  const hasOcr =
    aiAssessment?.stage2RawOcrText ??
    aiAssessment?.rawOcrText ??
    null;
  if (hasOcr) {
    docs.push({
      document: "OCR Extraction (Stage 2)",
      status: "present",
      confidence: 80,
      note: "Raw text extracted from uploaded documents.",
    });
  }

  const statusConfig: Record<
    DocStatus,
    { label: string; bg: string; text: string; icon: string }
  > = {
    present: { label: "Present", bg: "#D1FAE5", text: "#065F46", icon: "✓" },
    partial: { label: "Partial", bg: "#FEF3C7", text: "#92400E", icon: "◑" },
    missing: { label: "Missing", bg: "#FEE2E2", text: "#991B1B", icon: "✗" },
    not_required: {
      label: "Optional",
      bg: "#F1F5F9",
      text: "#475569",
      icon: "○",
    },
  };

  const missingCount = docs.filter((d) => d.status === "missing").length;
  const partialCount = docs.filter((d) => d.status === "partial").length;

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "16px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#0F172A",
          }}
        >
          Document Extraction Status
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {missingCount > 0 && (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: "4px",
                background: "#FEE2E2",
                color: "#991B1B",
              }}
            >
              {missingCount} missing
            </span>
          )}
          {partialCount > 0 && (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: "4px",
                background: "#FEF3C7",
                color: "#92400E",
              }}
            >
              {partialCount} partial
            </span>
          )}
          {missingCount === 0 && partialCount === 0 && (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: "4px",
                background: "#D1FAE5",
                color: "#065F46",
              }}
            >
              All documents present
            </span>
          )}
        </div>
      </div>

      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}
      >
        <thead>
          <tr style={{ background: "#F8FAFC" }}>
            <th
              style={{
                textAlign: "left",
                padding: "6px 8px",
                color: "#475569",
                fontWeight: 600,
                borderBottom: "1px solid #E2E8F0",
                width: "28%",
              }}
            >
              Document
            </th>
            <th
              style={{
                textAlign: "center",
                padding: "6px 8px",
                color: "#475569",
                fontWeight: 600,
                borderBottom: "1px solid #E2E8F0",
                width: "14%",
              }}
            >
              Status
            </th>
            <th
              style={{
                textAlign: "center",
                padding: "6px 8px",
                color: "#475569",
                fontWeight: 600,
                borderBottom: "1px solid #E2E8F0",
                width: "14%",
              }}
            >
              Confidence
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "6px 8px",
                color: "#475569",
                fontWeight: 600,
                borderBottom: "1px solid #E2E8F0",
              }}
            >
              Note
            </th>
          </tr>
        </thead>
        <tbody>
          {docs.map((doc, i) => {
            const sc = statusConfig[doc.status];
            return (
              <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                <td
                  style={{
                    padding: "6px 8px",
                    color: "#0F172A",
                    fontWeight: 500,
                  }}
                >
                  {doc.document}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "center" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 7px",
                      borderRadius: "4px",
                      fontWeight: 700,
                      fontSize: "10px",
                      background: sc.bg,
                      color: sc.text,
                    }}
                  >
                    {sc.icon} {sc.label}
                  </span>
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    textAlign: "center",
                    fontFamily: "monospace",
                    color: "#475569",
                  }}
                >
                  {doc.confidence != null ? `${doc.confidence}%` : "—"}
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    color: doc.status === "missing" ? "#991B1B" : "#475569",
                    fontSize: "10px",
                  }}
                >
                  {doc.note}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {missingCount > 0 && (
        <div
          style={{
            marginTop: "10px",
            padding: "8px 12px",
            background: "#FEF2F2",
            borderRadius: "4px",
            fontSize: "11px",
            color: "#991B1B",
            fontWeight: 600,
          }}
        >
          ⚠ {missingCount} required document{missingCount > 1 ? "s are" : " is"}{" "}
          missing. This may delay claim processing or trigger a REVIEW decision.
        </div>
      )}
    </div>
  );
}
