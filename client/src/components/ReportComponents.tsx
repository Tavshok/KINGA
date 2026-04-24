/**
 * ReportComponents.tsx
 *
 * Six visual components for the KINGA Forensic Audit Report:
 *
 *   1. CostBenchmarkDeviation  — Chart.js horizontal bar (4 bars, fair-range band, alert)
 *   2. FraudRadarChart         — Chart.js radar (6 axes, colour by fraud level)
 *   3. PhotoExifForensicsPanel — HTML/CSS EXIF summary KPIs + per-photo 3-col grid
 *   4. DamagePatternTable      — HTML table expected vs observed vs match
 *   5. GapAttributionTable     — HTML gap table with party badges + summary line
 *   6. DecisionLifecycleTracker— HTML 4-state lifecycle tracker with audit log
 *
 * All components:
 *   - Accept a typed JSON data prop
 *   - Work in both light and dark mode via CSS variables
 *   - Use no hardcoded hex values except inside Chart.js canvas callbacks
 */

import { useRef, useEffect, useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Radar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

// ─── Theme helper ────────────────────────────────────────────────────────────
function getThemeColors() {
  const isDark = document.documentElement.classList.contains("dark");
  // KINGA Design Prompt v2 exact hex values
  // Light mode: exact prompt hex | Dark mode: KINGA engine palette
  return {
    text: isDark ? "#e5e7eb" : "#1a1a1a",
    muted: isDark ? "#9ca3af" : "#888888",
    grid: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
    // Pass green: #2a7a2a (light) / #3fb950 engine pass (dark)
    green: isDark ? "#3fb950" : "#2a7a2a",
    // Warn amber: #8a5c00 (light) / #e3b341 engine warn (dark)
    amber: isDark ? "#e3b341" : "#8a5c00",
    // Fail red: #a32d2d (light) / #f85149 engine fail (dark)
    red: isDark ? "#f85149" : "#a32d2d",
    // Fill colours: bg tints from prompt
    greenFill: isDark ? "rgba(63,185,80,0.12)" : "rgba(42,122,42,0.10)",
    amberFill: isDark ? "rgba(227,179,65,0.12)" : "rgba(138,92,0,0.10)",
    redFill: isDark ? "rgba(248,81,73,0.12)" : "rgba(163,45,45,0.10)",
  };
}

function useThemeColors() {
  return useMemo(() => getThemeColors(), []);
}

// ─── 1. COST BENCHMARK DEVIATION ─────────────────────────────────────────────

export interface CostBenchmarkData {
  /** Learning benchmark (AI estimate) */
  benchmarkUsd: number;
  /** Reconciled total (agreed / quoted cost) */
  reconciledUsd: number;
  /** Fair range minimum */
  fairRangeMinUsd: number;
  /** Fair range maximum */
  fairRangeMaxUsd: number;
  currencySymbol?: string;
}

export function CostBenchmarkDeviation({ data }: { data: CostBenchmarkData }) {
  const colors = useThemeColors();
  const { benchmarkUsd, reconciledUsd, fairRangeMinUsd, fairRangeMaxUsd, currencySymbol = "$" } = data;

  const benchmarkOutside = benchmarkUsd < fairRangeMinUsd || benchmarkUsd > fairRangeMaxUsd;
  const reconciledOutside = reconciledUsd < fairRangeMinUsd || reconciledUsd > fairRangeMaxUsd;

  const fmt = (n: number) =>
    `${currencySymbol}${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const labels = [
    "Learning Benchmark",
    "Reconciled Total",
    "Fair Range Min",
    "Fair Range Max",
  ];
  const values = [benchmarkUsd, reconciledUsd, fairRangeMinUsd, fairRangeMaxUsd];
  const bgColors = [
    benchmarkOutside ? colors.red : colors.green,
    colors.amber,
    colors.green,
    colors.green,
  ];
  const borderColors = bgColors;

  const chartData = {
    labels,
    datasets: [
      {
        label: "Amount",
        data: values,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 4,
      },
    ],
  };

  const options: any = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` ${fmt(ctx.raw)}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: colors.muted,
          font: { size: 10 },
          callback: (v: any) => `${currencySymbol}${Number(v).toLocaleString()}`,
        },
        grid: { color: colors.grid },
      },
      y: {
        ticks: { color: colors.text, font: { size: 11 } },
        grid: { display: false },
      },
    },
  };

  return (
    <div className="space-y-3">
      <div style={{ height: 200 }}>
        <Bar data={chartData} options={options} />
      </div>
      {(benchmarkOutside || reconciledOutside) && (
        <div
          className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
          style={{
            background: "var(--fp-critical-bg)",
            border: "1px solid var(--fp-critical-border)",
            color: "var(--fp-critical-text)",
          }}
        >
          <span className="font-bold shrink-0">⚠ BENCHMARK ALERT</span>
          <span>
            {benchmarkOutside
              ? `Learning benchmark (${fmt(benchmarkUsd)}) falls outside the fair range band (${fmt(fairRangeMinUsd)}–${fmt(fairRangeMaxUsd)}). `
              : ""}
            {reconciledOutside
              ? `Reconciled total (${fmt(reconciledUsd)}) falls outside the fair range band. `
              : ""}
            Manual review recommended before approving payment.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── 2. FRAUD RADAR CHART ─────────────────────────────────────────────────────

export interface FraudRadarData {
  /** 0–20 score for each of the 6 axes */
  damageInconsistency: number;
  costDeviation: number;
  directionMismatch: number;
  repeatClaim: number;
  missingData: number;
  severityVsPhysics: number;
  /** 0–100 overall fraud score — determines colour */
  overallFraudScore: number;
  /** Optional label for multi-claim comparison */
  label?: string;
}

function FraudRadarSingle({ data, size = 220 }: { data: FraudRadarData; size?: number }) {
  const colors = useThemeColors();
  const fraudScore = data.overallFraudScore;
  const color =
    fraudScore >= 70 ? colors.red : fraudScore >= 40 ? colors.amber : colors.green;
  const fillColor =
    fraudScore >= 70 ? colors.redFill : fraudScore >= 40 ? colors.amberFill : colors.greenFill;

  const chartData = {
    labels: [
      "Damage\nInconsistency",
      "Cost\nDeviation",
      "Direction\nMismatch",
      "Repeat\nClaim",
      "Missing\nData",
      "Severity vs\nPhysics",
    ],
    datasets: [
      {
        label: data.label ?? "Fraud Risk",
        data: [
          Math.max(1, data.damageInconsistency),
          Math.max(1, data.costDeviation),
          Math.max(1, data.directionMismatch),
          Math.max(1, data.repeatClaim),
          Math.max(1, data.missingData),
          Math.max(1, data.severityVsPhysics),
        ],
        borderColor: color,
        backgroundColor: fillColor,
        borderWidth: 1.5,
        pointRadius: 3,
        pointBackgroundColor: color,
      },
    ],
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` ${ctx.label?.replace("\n", " ")}: ${ctx.raw === 1 && [
            data.damageInconsistency,
            data.costDeviation,
            data.directionMismatch,
            data.repeatClaim,
            data.missingData,
            data.severityVsPhysics,
          ][ctx.dataIndex] === 0 ? "0 (not triggered)" : ctx.raw}`,
        },
      },
    },
    scales: {
      r: {
        min: 0,
        max: 20,
        ticks: {
          stepSize: 5,
          color: colors.muted,
          font: { size: 9 },
          backdropColor: "transparent",
        },
        grid: { color: colors.grid },
        angleLines: { color: colors.grid },
        pointLabels: {
          color: colors.text,
          font: { size: 9 },
        },
      },
    },
  };

  return (
    <div className="flex flex-col items-center gap-1">
      {data.label && (
        <p className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
          {data.label}
        </p>
      )}
      <div style={{ height: size, width: size }}>
        <Radar data={chartData} options={options} />
      </div>
      <div
        className="text-xs font-bold px-2 py-0.5 rounded"
        style={{
          background:
            fraudScore >= 70
              ? "var(--fp-critical-bg)"
              : fraudScore >= 40
              ? "var(--fp-warning-bg)"
              : "var(--fp-success-bg)",
          color:
            fraudScore >= 70
              ? "var(--fp-critical-text)"
              : fraudScore >= 40
              ? "var(--fp-warning-text)"
              : "var(--fp-success-text)",
          border: `1px solid ${
            fraudScore >= 70
              ? "var(--fp-critical-border)"
              : fraudScore >= 40
              ? "var(--fp-warning-border)"
              : "var(--fp-success-border)"
          }`,
        }}
      >
        {fraudScore >= 70 ? "HIGH RISK" : fraudScore >= 40 ? "MODERATE RISK" : "LOW RISK"} —{" "}
        {Math.round(fraudScore)}/100
      </div>
    </div>
  );
}

export function FraudRadarChart({ data }: { data: FraudRadarData | FraudRadarData[] }) {
  const items = Array.isArray(data) ? data : [data];
  if (items.length === 0) return null;

  return (
    <div className={`flex gap-6 justify-center ${items.length > 1 ? "flex-row flex-wrap" : ""}`}>
      {items.map((d, i) => (
        <FraudRadarSingle key={i} data={d} size={items.length > 1 ? 200 : 220} />
      ))}
    </div>
  );
}

// ─── 3. PHOTO EXIF FORENSICS PANEL ───────────────────────────────────────────

export interface PhotoExifResult {
  photoIndex: number;
  /** URL or label */
  label?: string;
  isSuspicious: boolean;
  exifPresent: boolean;
  gpsPresent: boolean;
  /** 0–100 */
  manipulationScore: number;
  flags: string[];
  isNonVehicle?: boolean;
  captureDate?: string | null;
  aiVisionDescription?: string | null;
}

export interface PhotoExifForensicsData {
  results: PhotoExifResult[];
}

export function PhotoExifForensicsPanel({ data }: { data: PhotoExifForensicsData }) {
  const { results } = data;
  if (!results || results.length === 0) return null;

  // Filter out non-vehicle images entirely — they are background/document images
  // that contribute nothing to damage analysis and should not appear in the report.
  const vehicleResults = results.filter((r) => {
    const rawText = r.aiVisionDescription ?? '';
    const isRefusal = /^\s*(i\s+am\s+sorry|i\s+cannot|i\s+can't|i\s+apologize|i\s+apologise|unable\s+to|this\s+image\s+does\s+not|the\s+image\s+does\s+not\s+(?:show|contain|depict))/i.test(rawText);
    return !r.isNonVehicle && !isRefusal;
  });

  const analysed = vehicleResults.length;
  const totalSubmitted = results.length;
  const excluded = totalSubmitted - analysed;
  const suspicious = vehicleResults.filter((r) => r.isSuspicious).length;
  const gpsPresent = vehicleResults.filter((r) => r.gpsPresent).length;
  const allExifStripped = vehicleResults.length > 0 && vehicleResults.every((r) => !r.exifPresent);

  return (
    <div className="space-y-2">
      {/* Summary line */}
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        {analysed} vehicle photo{analysed !== 1 ? 's' : ''} analysed
        {excluded > 0 ? ` · ${excluded} non-vehicle image${excluded !== 1 ? 's' : ''} excluded` : ''}
        {suspicious > 0 ? ` · ${suspicious} flagged as suspicious` : ' · no suspicious images detected'}
        {gpsPresent > 0 ? ` · ${gpsPresent} with GPS data` : ' · no GPS data present'}
        {allExifStripped ? ' · Note: all images have EXIF metadata stripped — origin unverifiable' : ''}
      </p>

      {/* Per-image entries — 4 bullet points each (vehicle images only) */}
      {vehicleResults.map((r, i) => {
        const manipPct = Math.round(r.manipulationScore);

        // Bullet 1: Observation — first 2 clean sentences from AI vision description
        // Check for non-vehicle image or LLM refusal before processing
        const rawVisionText = r.aiVisionDescription ?? '';
        const isRefusal = false; // non-vehicle images already filtered out above
        const isNonVehicleImage = false;

        let observation: string;
        if (isNonVehicleImage) {
          observation = 'Image does not depict vehicle damage — excluded from damage analysis.';
        } else {
          const rawDesc = rawVisionText
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            // Strip LLM preamble like "Here's an analysis...", "Here is...", "The following..."
            .replace(/^[\s\S]*?(?:analysis[^:]*:|description[^:]*:|following[^:]*:)\s*/i, '')
            // Strip numbered list markers like "1. ", "2. "
            .replace(/^\d+\.\s*/gm, '')
            // Strip section headers like "DAMAGE DESCRIPTION:", "PHOTO AUTHENTICITY:"
            .replace(/^[A-Z][A-Z\s]+:\s*/gm, '')
            .trim();
          // Extract first 2 sentences (split on sentence-ending punctuation followed by space or end)
          const sentences = rawDesc.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [];
          const twoSentences = sentences.slice(0, 2).join(' ').trim();
          observation = twoSentences
            ? twoSentences
            : rawDesc
            ? rawDesc.slice(0, 220) + (rawDesc.length > 220 ? '\u2026' : '')
            : r.label
            ? `Documents ${r.label.toLowerCase()} area`
            : 'Damage area documented';
        }

        // Bullet 2: EXIF metadata status
        const exifNote = r.exifPresent
          ? `EXIF metadata present${r.captureDate ? ` — capture date ${r.captureDate.slice(0, 10)}` : ''}`
          : 'EXIF metadata absent — image origin cannot be independently verified';

        // Bullet 3: GPS / location data
        const gpsNote = r.gpsPresent
          ? `GPS coordinates present${r.captureDate ? ` (recorded ${r.captureDate.slice(0, 10)})` : ''} — location verifiable`
          : 'No GPS data embedded — capture location unverifiable';

        // Bullet 4: Manipulation score + integrity verdict
        const integrityVerdict = r.isSuspicious
          ? `Manipulation score ${manipPct}% — image flagged as suspicious; manual review required`
          : !r.exifPresent
          ? `Manipulation score ${manipPct}% — no anomalies detected; EXIF absence noted`
          : `Manipulation score ${manipPct}% — no integrity anomalies detected`;

        // Extra flags (excluding EXIF/GPS already covered above)
        const extraFlags = (r.flags ?? []).filter(
          f => !f.toLowerCase().includes('exif') && !f.toLowerCase().includes('gps') && f.trim().length > 10
        );

        return (
          <div key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)', paddingTop: i === 0 ? 0 : 8 }}>
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
              Photo {r.photoIndex}{r.label ? ` — ${r.label}` : ''}
            </p>
            <ul className="text-xs space-y-0.5" style={{ listStyleType: 'disc', paddingLeft: 16 }}>
              <li style={{ color: 'var(--foreground)' }}>{observation}</li>
              <li style={{ color: 'var(--muted-foreground)' }}>{exifNote}</li>
              <li style={{ color: 'var(--muted-foreground)' }}>{gpsNote}</li>
              <li style={{ color: r.isSuspicious ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{integrityVerdict}</li>
              {extraFlags.map((f, fi) => (
                <li key={fi} style={{ color: 'var(--muted-foreground)' }}>{f.replace(/\*\*/g, '').replace(/\*/g, '')}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ─── 4. DAMAGE PATTERN MATCHING TABLE ────────────────────────────────────────

export interface DamagePatternRow {
  expected: string;
  observed: string;
  /** "match" | "unknown" | "mismatch" */
  matchStatus: "match" | "unknown" | "mismatch";
  isFraudAlert?: boolean;
  fraudNote?: string;
}

export interface DamagePatternData {
  incidentType: string;
  rows: DamagePatternRow[];
}

export function DamagePatternTable({ data }: { data: DamagePatternData }) {
  const { incidentType, rows } = data;
  if (!rows || rows.length === 0) return null;

  const fraudAlerts = rows.filter((r) => r.isFraudAlert);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
              {[`Expected for ${incidentType}`, "Observed", "Match"].map((h) => (
                <th
                  key={h}
                  className="text-left px-3 py-2 font-semibold"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const matchColor =
                row.matchStatus === "match"
                  ? "var(--fp-success-text)"
                  : row.matchStatus === "unknown"
                  ? "var(--fp-warning-text)"
                  : "var(--fp-critical-text)";
              const matchLabel =
                row.matchStatus === "match"
                  ? "Match"
                  : row.matchStatus === "unknown"
                  ? "Unknown"
                  : "Mismatch";
              const rowBg = row.isFraudAlert ? "var(--fp-critical-bg)" : i % 2 === 0 ? "var(--background)" : "var(--muted)";

              return (
                <tr
                  key={i}
                  style={{ borderTop: "1px solid var(--border)", background: rowBg }}
                >
                  <td className="px-3 py-2" style={{ color: "var(--foreground)" }}>
                    {row.isFraudAlert && (
                      <span className="mr-1" style={{ color: "var(--fp-critical-text)" }}>⛔</span>
                    )}
                    {row.expected}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--foreground)" }}>
                    {row.observed}
                  </td>
                  <td className="px-3 py-2 font-bold" style={{ color: matchColor }}>
                    {matchLabel}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Fraud indicator notes for alert rows */}
      {fraudAlerts.map((r, i) => (
        <div
          key={i}
          className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
          style={{
            background: "var(--fp-critical-bg)",
            border: "1px solid var(--fp-critical-border)",
            color: "var(--fp-critical-text)",
          }}
        >
          <span className="font-bold shrink-0">⛔ FRAUD INDICATOR</span>
          <span>
            {r.fraudNote ??
              `${r.observed} is inconsistent with a ${incidentType} incident. This damage pattern is a known indicator of a staged or misrepresented claim.`}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── 5. GAP ATTRIBUTION TABLE ─────────────────────────────────────────────────

export interface GapEntry {
  field: string;
  explanation: string;
  /** "INSURER_DATA_GAP" | "CLAIMANT_DEFICIENCY" | "SYSTEM_EXTRACTION_FAILURE" | "DOCUMENT_LIMITATION" */
  attribution: "INSURER_DATA_GAP" | "CLAIMANT_DEFICIENCY" | "SYSTEM_EXTRACTION_FAILURE" | "DOCUMENT_LIMITATION";
}

export interface GapAttributionData {
  entries: GapEntry[];
}

const ATTRIBUTION_LABELS: Record<GapEntry["attribution"], string> = {
  INSURER_DATA_GAP: "Insurer",
  CLAIMANT_DEFICIENCY: "Claimant",
  SYSTEM_EXTRACTION_FAILURE: "System",
  DOCUMENT_LIMITATION: "Document",
};

const ATTRIBUTION_COLORS: Record<GapEntry["attribution"], { bg: string; text: string; border: string }> = {
  INSURER_DATA_GAP: {
    bg: "var(--fp-warning-bg)",
    text: "var(--fp-warning-text)",
    border: "var(--fp-warning-border)",
  },
  CLAIMANT_DEFICIENCY: {
    bg: "var(--fp-critical-bg)",
    text: "var(--fp-critical-text)",
    border: "var(--fp-critical-border)",
  },
  SYSTEM_EXTRACTION_FAILURE: {
    bg: "var(--muted)",
    text: "var(--muted-foreground)",
    border: "var(--border)",
  },
  DOCUMENT_LIMITATION: {
    bg: "var(--muted)",
    text: "var(--muted-foreground)",
    border: "var(--border)",
  },
};

export function GapAttributionTable({ data }: { data: GapAttributionData }) {
  const { entries } = data;
  if (!entries || entries.length === 0) return null;

  const claimantCount = entries.filter((e) => e.attribution === "CLAIMANT_DEFICIENCY").length;
  const insurerCount = entries.filter((e) => e.attribution === "INSURER_DATA_GAP").length;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {entries.map((entry, i) => {
          const c = ATTRIBUTION_COLORS[entry.attribution];
          const label = ATTRIBUTION_LABELS[entry.attribution];
          // Only show Claimant badge if genuinely claimant-attributed
          const showBadge =
            entry.attribution === "CLAIMANT_DEFICIENCY" ||
            entry.attribution === "INSURER_DATA_GAP";

          return (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg px-3 py-2.5"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              {showBadge && (
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded shrink-0 mt-0.5"
                  style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                >
                  {label}
                </span>
              )}
              {!showBadge && (
                <span
                  className="text-xs px-2 py-0.5 rounded shrink-0 mt-0.5"
                  style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                >
                  {label}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold" style={{ color: "var(--foreground)" }}>
                  {entry.field.replace(/_/g, " ")}
                </p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                  {entry.explanation}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary line */}
      <div className="text-xs space-y-0.5 pt-1" style={{ borderTop: "1px solid var(--border)" }}>
        {claimantCount > 0 && (
          <p style={{ color: "var(--fp-critical-text)" }}>
            <strong>{claimantCount}</strong> gap{claimantCount !== 1 ? "s" : ""} attributed to{" "}
            <strong>Claimant</strong>
          </p>
        )}
        {insurerCount > 0 && (
          <p style={{ color: "var(--fp-warning-text)" }}>
            <strong>{insurerCount}</strong> gap{insurerCount !== 1 ? "s" : ""} attributed to{" "}
            <strong>Insurer</strong>
          </p>
        )}
        {entries.length - claimantCount - insurerCount > 0 && (
          <p style={{ color: "var(--muted-foreground)" }}>
            <strong>{entries.length - claimantCount - insurerCount}</strong> gap
            {entries.length - claimantCount - insurerCount !== 1 ? "s" : ""} attributed to system
            or document limitations
          </p>
        )}
      </div>
    </div>
  );
}

// ─── 6. DECISION LIFECYCLE TRACKER ───────────────────────────────────────────

export interface LifecycleState {
  /** "draft" | "reviewed" | "finalised" | "locked" */
  state: "draft" | "reviewed" | "finalised" | "locked";
  /** Whether this state has been completed */
  completed: boolean;
  /** Whether this is the current active state */
  isCurrent: boolean;
  adjusterName?: string | null;
  timestamp?: string | null;
}

export interface DecisionLifecycleData {
  states: LifecycleState[];
  /** Whether transitions are written to the audit log */
  auditLogEnabled?: boolean;
}

const STATE_LABELS: Record<LifecycleState["state"], string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  finalised: "Finalised",
  locked: "Locked",
};

const STATE_ICONS: Record<LifecycleState["state"], string> = {
  draft: "✎",
  reviewed: "◎",
  finalised: "✓",
  locked: "🔒",
};

export function DecisionLifecycleTracker({ data }: { data: DecisionLifecycleData }) {
  const { states, auditLogEnabled = true } = data;
  if (!states || states.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* State track */}
      <div className="flex items-stretch gap-0">
        {states.map((s, i) => {
          const isLast = i === states.length - 1;
          const bg = s.completed
            ? "var(--fp-success-bg)"
            : s.isCurrent
            ? "var(--fp-warning-bg)"
            : "var(--muted)";
          const borderColor = s.completed
            ? "var(--fp-success-border)"
            : s.isCurrent
            ? "var(--fp-warning-border)"
            : "var(--border)";
          const textColor = s.completed
            ? "var(--fp-success-text)"
            : s.isCurrent
            ? "var(--fp-warning-text)"
            : "var(--muted-foreground)";

          return (
            <div key={s.state} className="flex items-center flex-1 min-w-0">
              <div
                className="flex-1 px-3 py-2.5 rounded-lg"
                style={{ background: bg, border: `1px solid ${borderColor}` }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm" style={{ color: textColor }}>
                    {STATE_ICONS[s.state]}
                  </span>
                  <span className="text-xs font-bold" style={{ color: textColor }}>
                    {STATE_LABELS[s.state]}
                  </span>
                  {s.isCurrent && (
                    <span
                      className="text-xs px-1 rounded font-semibold ml-auto"
                      style={{ background: "var(--fp-warning-border)", color: "var(--fp-warning-text)" }}
                    >
                      CURRENT
                    </span>
                  )}
                </div>
                {s.completed && s.adjusterName && (
                  <p className="text-xs" style={{ color: textColor }}>
                    {s.adjusterName}
                  </p>
                )}
                {s.completed && s.timestamp && (
                  <p className="text-xs" style={{ color: textColor, opacity: 0.8 }}>
                    {new Date(s.timestamp).toLocaleString()}
                  </p>
                )}
                {!s.completed && !s.isCurrent && (
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    Pending
                  </p>
                )}
              </div>
              {!isLast && (
                <div
                  className="w-4 h-0.5 shrink-0"
                  style={{ background: s.completed ? "var(--fp-success-border)" : "var(--border)" }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Audit log caption */}
      {auditLogEnabled && (
        <p
          className="text-xs"
          style={{ color: "var(--muted-foreground)", fontSize: 11 }}
        >
          Each state transition is written to the immutable audit log with adjuster identity,
          timestamp, and action context. Audit entries cannot be modified or deleted.
        </p>
      )}
    </div>
  );
}

// ─── 7. COST WATERFALL CHART ──────────────────────────────────────────────────
// Matches CostBenchmarkDeviation in style: Chart.js horizontal bars, height 200,
// borderRadius 4, semantic colours from getThemeColors(), no legend, muted grid.
// Adds a 70% soft write-off threshold annotation line (recommendation only).

export interface CostWaterfallData {
  /** AI learning benchmark estimate */
  benchmarkUsd: number;
  /** Primary repair quote total */
  quotedTotalUsd: number;
  /** Vehicle market value — used to compute 70% threshold line */
  marketValueUsd?: number | null;
  /** Fair range min/max from cost extraction */
  fairRangeMinUsd?: number;
  fairRangeMaxUsd?: number;
  currencySymbol?: string;
}

export function CostWaterfallChart({ data }: { data: CostWaterfallData }) {
  const colors = useThemeColors();
  const {
    benchmarkUsd,
    quotedTotalUsd,
    marketValueUsd,
    fairRangeMinUsd = 0,
    fairRangeMaxUsd = 0,
    currencySymbol = "$",
  } = data;

  const fmt = (n: number) =>
    `${currencySymbol}${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  // Determine bar colours: benchmark = info blue, quote = amber unless overpriced → red
  const benchmarkOutside = fairRangeMinUsd > 0 && fairRangeMaxUsd > 0
    ? benchmarkUsd < fairRangeMinUsd || benchmarkUsd > fairRangeMaxUsd
    : false;
  const quoteOverpriced = benchmarkUsd > 0 && quotedTotalUsd > benchmarkUsd * 1.15;
  const quoteUnderpriced = benchmarkUsd > 0 && quotedTotalUsd < benchmarkUsd * 0.85;

  const labels: string[] = [];
  const values: number[] = [];
  const bgColors: string[] = [];

  if (benchmarkUsd > 0) {
    labels.push("Learning Benchmark");
    values.push(benchmarkUsd);
    bgColors.push(benchmarkOutside ? colors.red : colors.green);
  }
  if (quotedTotalUsd > 0) {
    labels.push("Repair Quote");
    values.push(quotedTotalUsd);
    bgColors.push(quoteOverpriced ? colors.red : quoteUnderpriced ? colors.green : colors.amber);
  }
  if (fairRangeMinUsd > 0) {
    labels.push("Fair Range Min");
    values.push(fairRangeMinUsd);
    bgColors.push(colors.green);
  }
  if (fairRangeMaxUsd > 0) {
    labels.push("Fair Range Max");
    values.push(fairRangeMaxUsd);
    bgColors.push(colors.green);
  }

  if (labels.length === 0) return null;

  // 70% write-off threshold line — only shown when marketValueUsd is available
  const writeOffThreshold = marketValueUsd && marketValueUsd > 0 ? marketValueUsd * 0.70 : null;
  const maxVal = Math.max(...values, writeOffThreshold ?? 0, 1);

  const chartData = {
    labels,
    datasets: [
      {
        label: "Amount",
        data: values,
        backgroundColor: bgColors,
        borderColor: bgColors,
        borderWidth: 1.5,
        borderRadius: 4,
      },
    ],
  };

  // Chart.js annotation plugin is not registered here — we use a custom afterDraw plugin
  // to draw the 70% threshold vertical line directly on the canvas.
  const writeOffPlugin = writeOffThreshold
    ? {
        id: "writeOffLine",
        afterDraw(chart: any) {
          const { ctx, scales } = chart;
          const xScale = scales.x;
          if (!xScale) return;
          const xPx = xScale.getPixelForValue(writeOffThreshold);
          const { top, bottom } = chart.chartArea;
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = colors.red;
          ctx.lineWidth = 1.5;
          ctx.moveTo(xPx, top);
          ctx.lineTo(xPx, bottom);
          ctx.stroke();
          // Label
          ctx.font = "bold 9px Inter, sans-serif";
          ctx.fillStyle = colors.red;
          ctx.textAlign = "center";
          ctx.fillText("70% write-off", xPx, top - 4);
          ctx.restore();
        },
      }
    : null;

  const options: any = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` ${fmt(ctx.raw)}`,
        },
      },
    },
    scales: {
      x: {
        min: 0,
        max: maxVal * 1.05,
        ticks: {
          color: colors.muted,
          font: { size: 10 },
          callback: (v: any) => `${currencySymbol}${Number(v).toLocaleString()}`,
        },
        grid: { color: colors.grid },
      },
      y: {
        ticks: { color: colors.text, font: { size: 11 } },
        grid: { display: false },
      },
    },
  };

  const chartHeight = Math.max(160, labels.length * 44);

  return (
    <div className="space-y-3">
      <div style={{ height: chartHeight }}>
        <Bar
          data={chartData}
          options={options}
          plugins={writeOffPlugin ? [writeOffPlugin] : []}
        />
      </div>
      {writeOffThreshold && (
        <p className="text-xs" style={{ color: colors.muted }}>
          <span style={{ color: colors.red, fontWeight: 700 }}>— — —</span>
          {" "}70% write-off indicator ({fmt(writeOffThreshold)}) is a guideline only, not a binding threshold.
          Final write-off determination requires insurer authorisation.
        </p>
      )}
      {quoteOverpriced && (
        <div
          className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
          style={{
            background: "var(--fp-critical-bg)",
            border: "1px solid var(--fp-critical-border)",
            color: "var(--fp-critical-text)",
          }}
        >
          <span className="font-bold shrink-0">⚠ COST ALERT</span>
          <span>
            Repair quote ({fmt(quotedTotalUsd)}) exceeds the learning benchmark by more than 15%.
            Manual review recommended before approving payment.
          </span>
        </div>
      )}
    </div>
  );
}
