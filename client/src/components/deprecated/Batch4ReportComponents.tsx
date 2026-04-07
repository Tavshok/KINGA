/**
 * Batch 4 Report Components — KINGA AutoVerify v4.2
 *
 * Surfaces Phase 1 / Phase 2 engine internals that were previously invisible:
 *
 * 1. Phase1CorrectionsPanel   — collapsible list of every auto-correction the
 *                               Phase 1 data-integrity engine applied before
 *                               assessment (e.g. date normalisation, cost
 *                               reconciliation, incident-type inference).
 *                               Shows a badge count on the Executive Cover.
 *
 * 2. KeyDriversAdvisoriesPanel — two-column panel: left = Phase 2 key_drivers
 *                               (why the decision was reached), right = Phase 2
 *                               advisories (soft warnings that did not block
 *                               the decision).  Positioned between the Decision
 *                               Flowchart and the Final Risk Statement.
 *
 * 3. DataCompletenessRing     — SVG progress ring derived from the Phase 2
 *                               dataCompleteness score (0-100).  Shown as a
 *                               fourth metric on the Executive Authority Cover
 *                               alongside Physics %, Cost, and Evidence count.
 *                               Also rendered standalone between the Document
 *                               Extraction Table and the Technical Data section.
 */

import React, { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Shared colour helpers
// ─────────────────────────────────────────────────────────────────────────────

function scoreColour(score: number): { fg: string; bg: string; border: string } {
  if (score >= 80) return { fg: "#10b981", bg: "#052e16", border: "#065f46" };
  if (score >= 55) return { fg: "#f59e0b", bg: "#1c1400", border: "#92400e" };
  return { fg: "#f87171", bg: "#1c0606", border: "#991b1b" };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Phase1CorrectionsPanel
// ─────────────────────────────────────────────────────────────────────────────

interface Phase1CorrectionsPanelProps {
  aiAssessment: any;
}

export function Phase1CorrectionsPanel({ aiAssessment }: Phase1CorrectionsPanelProps) {
  const [open, setOpen] = useState(false);

  const corrections: string[] =
    aiAssessment?._phase1?.allCorrections ??
    aiAssessment?.phase1Corrections ??
    [];

  const gateStatus: string =
    aiAssessment?._phase1?.overallStatus ?? "PASS";

  const gates: Array<{ gate: string; status: string; corrections: string[] }> =
    aiAssessment?._phase1?.gates ?? [];

  if (corrections.length === 0 && gates.length === 0) return null;

  const statusColour =
    gateStatus === "BLOCK"
      ? { fg: "#f87171", bg: "#1c0606", border: "#991b1b" }
      : gateStatus === "WARN"
      ? { fg: "#f59e0b", bg: "#1c1400", border: "#92400e" }
      : { fg: "#10b981", bg: "#052e16", border: "#065f46" };

  return (
    <div
      style={{
        marginBottom: "12px",
        borderRadius: "8px",
        border: `1px solid ${statusColour.border}`,
        background: statusColour.bg,
        overflow: "hidden",
      }}
    >
      {/* Header row — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Icon */}
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "5px",
              background: `${statusColour.fg}20`,
              border: `1px solid ${statusColour.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "13px",
              flexShrink: 0,
            }}
          >
            ⚙
          </div>
          <div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: statusColour.fg,
                letterSpacing: "0.04em",
              }}
            >
              PHASE 1 DATA INTEGRITY
            </div>
            <div style={{ fontSize: "10px", color: "var(--rpt-muted-text)", marginTop: "1px" }}>
              {corrections.length} auto-correction{corrections.length !== 1 ? "s" : ""} applied before assessment
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Gate status badge */}
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: "3px",
              background: `${statusColour.fg}20`,
              color: statusColour.fg,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {gateStatus}
          </span>
          {/* Corrections count badge */}
          {corrections.length > 0 && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                minWidth: "20px",
                height: "20px",
                borderRadius: "10px",
                background: `${statusColour.fg}30`,
                color: statusColour.fg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 5px",
              }}
            >
              {corrections.length}
            </span>
          )}
          <span style={{ fontSize: "12px", color: "var(--rpt-muted-text)" }}>{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Expanded corrections list */}
      {open && (
        <div
          style={{
            padding: "0 14px 12px",
            borderTop: `1px solid ${statusColour.border}`,
          }}
        >
          {corrections.length > 0 ? (
            <div style={{ marginTop: "10px" }}>
              <div
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--rpt-muted-text)",
                  marginBottom: "6px",
                }}
              >
                Corrections Applied
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {corrections.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "8px",
                      padding: "5px 8px",
                      borderRadius: "4px",
                      background: "var(--rpt-card-bg)",
                      border: "1px solid var(--rpt-card-border)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: 700,
                        color: statusColour.fg,
                        flexShrink: 0,
                        marginTop: "1px",
                        fontFamily: "monospace",
                      }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--rpt-muted-text)", lineHeight: "1.5" }}>
                      {c}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{
                marginTop: "10px",
                fontSize: "10px",
                color: "var(--rpt-muted-text)",
                fontStyle: "italic",
              }}
            >
              No corrections were required — all input fields passed validation.
            </div>
          )}

          {/* Gate summary table */}
          {gates.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <div
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--rpt-muted-text)",
                  marginBottom: "6px",
                }}
              >
                Gate Results
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Gate", "Status", "Corrections"].map((h) => (
                      <th
                        key={h}
                        style={{
                          fontSize: "9px",
                          fontWeight: 700,
                          color: "var(--rpt-muted-text)",
                          textAlign: "left",
                          padding: "4px 6px",
                          borderBottom: "1px solid var(--rpt-card-border)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gates.map((g, i) => {
                    const gc =
                      g.status === "BLOCK"
                        ? "#f87171"
                        : g.status === "WARN"
                        ? "#f59e0b"
                        : "#10b981";
                    return (
                      <tr key={i}>
                        <td
                          style={{
                            fontSize: "10px",
                            color: "var(--rpt-muted-text)",
                            padding: "4px 6px",
                            borderBottom: "1px solid #0F172A",
                            fontFamily: "monospace",
                          }}
                        >
                          {g.gate}
                        </td>
                        <td
                          style={{
                            fontSize: "9px",
                            fontWeight: 700,
                            color: gc,
                            padding: "4px 6px",
                            borderBottom: "1px solid #0F172A",
                            textTransform: "uppercase",
                          }}
                        >
                          {g.status}
                        </td>
                        <td
                          style={{
                            fontSize: "10px",
                            color: "var(--rpt-muted-text)",
                            padding: "4px 6px",
                            borderBottom: "1px solid #0F172A",
                          }}
                        >
                          {g.corrections?.length ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. KeyDriversAdvisoriesPanel
// ─────────────────────────────────────────────────────────────────────────────

interface KeyDriversAdvisoriesPanelProps {
  enforcement: any;
  aiAssessment: any;
}

export function KeyDriversAdvisoriesPanel({
  enforcement,
  aiAssessment,
}: KeyDriversAdvisoriesPanelProps) {
  // Phase 2 returns keyDrivers and advisories directly on the _phase2 object
  const keyDrivers: string[] =
    enforcement?._phase2?.keyDrivers ??
    enforcement?.keyDrivers ??
    aiAssessment?._normalised?.keyDrivers ??
    [];

  const advisories: string[] =
    enforcement?._phase2?.advisories ??
    enforcement?.advisories ??
    aiAssessment?._normalised?.advisories ??
    [];

  const nextSteps: string[] =
    enforcement?._phase2?.nextSteps ??
    enforcement?.nextSteps ??
    [];

  if (keyDrivers.length === 0 && advisories.length === 0 && nextSteps.length === 0) return null;

  return (
    <div
      style={{
        marginBottom: "12px",
        borderRadius: "8px",
        border: "1px solid var(--rpt-card-border)",
        background: "var(--rpt-card-bg)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--rpt-card-border)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "5px",
            background: "#1E3A5F",
            border: "1px solid #2563EB",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            flexShrink: 0,
          }}
        >
          🔑
        </div>
        <div>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#93C5FD",
              letterSpacing: "0.04em",
            }}
          >
            PHASE 2 DECISION DRIVERS & ADVISORIES
          </div>
          <div style={{ fontSize: "10px", color: "var(--rpt-muted-text)", marginTop: "1px" }}>
            Factors that shaped the final decision recommendation
          </div>
        </div>
      </div>

      {/* Body — two columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0",
        }}
      >
        {/* Key Drivers */}
        <div
          style={{
            padding: "12px 14px",
            borderRight: "1px solid var(--rpt-card-border)",
          }}
        >
          <div
            style={{
              fontSize: "9px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--rpt-muted-text)",
              marginBottom: "8px",
            }}
          >
            Key Drivers ({keyDrivers.length})
          </div>
          {keyDrivers.length === 0 ? (
            <div style={{ fontSize: "10px", color: "var(--rpt-muted-text)", fontStyle: "italic" }}>
              No key drivers recorded
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {keyDrivers.map((d, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "7px",
                  }}
                >
                  <span
                    style={{
                      width: "5px",
                      height: "5px",
                      borderRadius: "50%",
                      background: "#2563EB",
                      flexShrink: 0,
                      marginTop: "5px",
                    }}
                  />
                  <span style={{ fontSize: "10px", color: "var(--rpt-muted-text)", lineHeight: "1.5" }}>
                    {d}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Advisories */}
        <div style={{ padding: "12px 14px" }}>
          <div
            style={{
              fontSize: "9px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--rpt-muted-text)",
              marginBottom: "8px",
            }}
          >
            Advisories ({advisories.length})
          </div>
          {advisories.length === 0 ? (
            <div style={{ fontSize: "10px", color: "var(--rpt-muted-text)", fontStyle: "italic" }}>
              No advisories raised
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {advisories.map((a, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "7px",
                  }}
                >
                  <span
                    style={{
                      width: "5px",
                      height: "5px",
                      borderRadius: "50%",
                      background: "#f59e0b",
                      flexShrink: 0,
                      marginTop: "5px",
                    }}
                  />
                  <span style={{ fontSize: "10px", color: "var(--rpt-muted-text)", lineHeight: "1.5" }}>
                    {a}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Next Steps — full width, only if present */}
      {nextSteps.length > 0 && (
        <div
          style={{
            padding: "10px 14px",
            borderTop: "1px solid var(--rpt-card-border)",
            background: "var(--rpt-subtle-bg)",
          }}
        >
          <div
            style={{
              fontSize: "9px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--rpt-muted-text)",
              marginBottom: "6px",
            }}
          >
            Required Next Steps
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "5px",
            }}
          >
            {nextSteps.map((s, i) => (
              <span
                key={i}
                style={{
                  fontSize: "10px",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: "var(--rpt-subtle-bg)",
                  color: "var(--rpt-muted-text)",
                  border: "1px solid #334155",
                }}
              >
                {i + 1}. {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. DataCompletenessRing
// ─────────────────────────────────────────────────────────────────────────────

interface DataCompletenessRingProps {
  enforcement: any;
  aiAssessment: any;
  /** When true renders a compact inline version for embedding in a cover card */
  compact?: boolean;
}

export function DataCompletenessRing({
  enforcement,
  aiAssessment,
  compact = false,
}: DataCompletenessRingProps) {
  // Phase 2 dataCompleteness is 0-100
  const score: number =
    enforcement?._phase2?.dataCompleteness ??
    enforcement?.dataCompleteness ??
    aiAssessment?._normalised?.dataCompleteness ??
    null;

  if (score === null) return null;

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const { fg, bg, border } = scoreColour(clamped);

  // SVG ring parameters
  const size = compact ? 52 : 80;
  const strokeWidth = compact ? 5 : 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  const label =
    clamped >= 80 ? "Complete" : clamped >= 55 ? "Partial" : "Incomplete";

  if (compact) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "3px",
        }}
      >
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--rpt-card-border)"
            strokeWidth={strokeWidth}
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={fg}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </svg>
        {/* Centre text — overlaid */}
        <div
          style={{
            marginTop: `-${size + 4}px`,
            height: `${size}px`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              fontWeight: 800,
              color: fg,
              lineHeight: 1,
            }}
          >
            {clamped}%
          </span>
        </div>
        <div
          style={{
            fontSize: "9px",
            fontWeight: 700,
            color: "var(--rpt-muted-text)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginTop: "2px",
          }}
        >
          Data
        </div>
      </div>
    );
  }

  // Full-size standalone card
  return (
    <div
      style={{
        marginBottom: "12px",
        borderRadius: "8px",
        border: `1px solid ${border}`,
        background: bg,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}
    >
      {/* Ring */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--rpt-card-border)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={fg}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </svg>
        {/* Centre label */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: "16px",
              fontWeight: 900,
              color: fg,
              lineHeight: 1,
            }}
          >
            {clamped}%
          </span>
        </div>
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 700,
            color: fg,
            letterSpacing: "0.02em",
          }}
        >
          Data Completeness — {label}
        </div>
        <div
          style={{
            fontSize: "10px",
            color: "var(--rpt-muted-text)",
            marginTop: "3px",
            lineHeight: "1.5",
          }}
        >
          {clamped >= 80
            ? "All required data fields were present and validated. Assessment confidence is not impacted by missing inputs."
            : clamped >= 55
            ? "Some data fields were absent or required correction. Assessment confidence may be moderately reduced."
            : "Significant data fields were missing or invalid. Assessment confidence is materially reduced — additional documentation is recommended."}
        </div>
        {/* Progress bar */}
        <div
          style={{
            marginTop: "8px",
            height: "4px",
            borderRadius: "2px",
            background: "var(--rpt-subtle-bg)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${clamped}%`,
              background: fg,
              borderRadius: "2px",
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <div
          style={{
            marginTop: "3px",
            fontSize: "9px",
            color: "var(--rpt-muted-text)",
          }}
        >
          Phase 2 data completeness score: {clamped}/100
        </div>
      </div>
    </div>
  );
}
