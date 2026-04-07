/**
 * Batch 3 Report Components — KINGA AutoVerify v4.2
 *
 * Components:
 * 1. ReportPageHeader      — sticky top bar: claim ref, vehicle, date, report hash, PDF export
 * 2. ReportSectionDivider  — visual divider between major report sections
 * 3. ReportIntegritySeal   — bottom-of-report hash + generation timestamp seal
 */

import React, { useMemo } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight deterministic hash (djb2) — no crypto dependency needed
// ─────────────────────────────────────────────────────────────────────────────

export function djb2Hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h.toString(16).toUpperCase().padStart(8, "0");
}

/** Build a stable report fingerprint from the key decision fields */
export function buildReportHash(
  claimId: string | number,
  decision: string,
  fraudScore: number,
  totalCost: number,
  consistencyScore: number
): string {
  const raw = `${claimId}|${decision}|${fraudScore}|${totalCost.toFixed(2)}|${consistencyScore}`;
  return djb2Hash(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ReportPageHeader
// ─────────────────────────────────────────────────────────────────────────────

interface ReportPageHeaderProps {
  claim: any;
  aiAssessment: any;
  enforcement: any;
  onBack?: () => void;
  onReRun?: () => void;
  reRunPending?: boolean;
}

export function ReportPageHeader({
  claim,
  aiAssessment,
  enforcement,
  onBack,
  onReRun,
  reRunPending = false,
}: ReportPageHeaderProps) {
  const vehicleTitle = [claim?.vehicleMake, claim?.vehicleModel, claim?.vehicleYear]
    .filter(Boolean)
    .join(" ") || `Claim #${claim?.claimNumber ?? "—"}`;

  const claimRef: string = claim?.claimNumber ?? claim?.id ?? "—";

  const finalDecision: string =
    enforcement?._phase2?.finalDecision ??
    enforcement?.finalDecision?.recommendation ??
    "REVIEW";

  const fraudScore: number =
    enforcement?.weightedFraud?.score ??
    aiAssessment?._normalised?.fraud?.score ??
    0;

  const totalCost: number =
    aiAssessment?._normalised?.costs?.totalUsd ??
    ((aiAssessment?.estimatedCost ?? 0) / 100);

  const consistencyScore: number =
    enforcement?.consistencyFlag?.score ??
    enforcement?._phase2?.physicsConsistency ??
    0;

  const reportHash = useMemo(
    () => buildReportHash(claimRef, finalDecision, fraudScore, totalCost, consistencyScore),
    [claimRef, finalDecision, fraudScore, totalCost, consistencyScore]
  );

  const generatedAt = useMemo(() => {
    const raw =
      enforcement?.generatedAt ??
      aiAssessment?.updatedAt ??
      aiAssessment?.createdAt;
    if (!raw) return "—";
    try {
      return new Date(raw).toLocaleString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }, [enforcement, aiAssessment]);

  const decisionColour: Record<string, { bg: string; text: string }> = {
    APPROVE: { bg: "#059669", text: "#FFFFFF" },
    FINALISE: { bg: "#059669", text: "#FFFFFF" },
    FINALISE_CLAIM: { bg: "#059669", text: "#FFFFFF" },
    REVIEW: { bg: "#D97706", text: "#FFFFFF" },
    REVIEW_REQUIRED: { bg: "#D97706", text: "#FFFFFF" },
    ESCALATE: { bg: "#DC2626", text: "#FFFFFF" },
    REJECT: { bg: "#DC2626", text: "#FFFFFF" },
  };
  const dc = decisionColour[finalDecision] ?? { bg: "#475569", text: "#FFFFFF" };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="report-page-header"
      style={{
        background: "var(--rpt-card-bg)",
        borderBottom: "2px solid #1E293B",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
        // Print: hide the header chrome, keep the content readable
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      {/* Left: back + claim identity */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: "transparent",
              border: "1px solid #334155",
              borderRadius: "6px",
              padding: "4px 10px",
              color: "var(--rpt-muted-text)",
              fontSize: "11px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              whiteSpace: "nowrap",
            }}
          >
            ← Back
          </button>
        )}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "var(--rpt-card-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {vehicleTitle}
          </div>
          <div
            style={{
              fontSize: "10px",
              color: "var(--rpt-muted-text)",
              display: "flex",
              gap: "8px",
              alignItems: "center",
              marginTop: "1px",
            }}
          >
            <span>{claimRef}</span>
            <span style={{ color: "var(--rpt-muted-text)" }}>·</span>
            <span>{generatedAt}</span>
            <span style={{ color: "var(--rpt-muted-text)" }}>·</span>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "9px",
                background: "var(--rpt-subtle-bg)",
                padding: "1px 5px",
                borderRadius: "3px",
                color: "var(--rpt-muted-text)",
                letterSpacing: "0.05em",
              }}
              title="Report integrity hash — changes if any decision field is modified"
            >
              #{reportHash}
            </span>
          </div>
        </div>
      </div>

      {/* Centre: decision pill */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            fontSize: "12px",
            fontWeight: 800,
            padding: "4px 14px",
            borderRadius: "5px",
            background: dc.bg,
            color: dc.text,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {finalDecision.replace(/_/g, " ")}
        </span>
      </div>

      {/* Right: actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {onReRun && (
          <button
            onClick={onReRun}
            disabled={reRunPending}
            style={{
              background: "transparent",
              border: "1px solid #334155",
              borderRadius: "6px",
              padding: "4px 10px",
              color: "var(--rpt-muted-text)",
              fontSize: "11px",
              cursor: reRunPending ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              opacity: reRunPending ? 0.5 : 1,
            }}
          >
            {reRunPending ? "⟳ Running…" : "⟳ Re-run AI"}
          </button>
        )}
        <button
          onClick={handlePrint}
          style={{
            background: "#1E3A5F",
            border: "1px solid #2563EB",
            borderRadius: "6px",
            padding: "4px 12px",
            color: "#93C5FD",
            fontSize: "11px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontWeight: 600,
          }}
        >
          ⬇ Export PDF
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ReportSectionDivider
// ─────────────────────────────────────────────────────────────────────────────

interface ReportSectionDividerProps {
  label: string;
  icon?: string;
}

export function ReportSectionDivider({ label, icon }: ReportSectionDividerProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        margin: "24px 0 14px",
      }}
    >
      <div
        style={{
          flex: "0 0 auto",
          height: "1px",
          width: "24px",
          background: "#334155",
        }}
      />
      <div
        style={{
          flex: "0 0 auto",
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--rpt-muted-text)",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: "5px",
        }}
      >
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <div
        style={{
          flex: 1,
          height: "1px",
          background: "linear-gradient(to right, #334155, transparent)",
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ReportIntegritySeal
// ─────────────────────────────────────────────────────────────────────────────

interface ReportIntegritySealProps {
  claim: any;
  aiAssessment: any;
  enforcement: any;
}

export function ReportIntegritySeal({
  claim,
  aiAssessment,
  enforcement,
}: ReportIntegritySealProps) {
  const claimRef: string = claim?.claimNumber ?? claim?.id ?? "—";

  const finalDecision: string =
    enforcement?._phase2?.finalDecision ??
    enforcement?.finalDecision?.recommendation ??
    "REVIEW";

  const fraudScore: number =
    enforcement?.weightedFraud?.score ??
    aiAssessment?._normalised?.fraud?.score ??
    0;

  const totalCost: number =
    aiAssessment?._normalised?.costs?.totalUsd ??
    ((aiAssessment?.estimatedCost ?? 0) / 100);

  const consistencyScore: number =
    enforcement?.consistencyFlag?.score ??
    enforcement?._phase2?.physicsConsistency ??
    0;

  const reportHash = useMemo(
    () => buildReportHash(claimRef, finalDecision, fraudScore, totalCost, consistencyScore),
    [claimRef, finalDecision, fraudScore, totalCost, consistencyScore]
  );

  const generatedAt = useMemo(() => {
    const raw =
      enforcement?.generatedAt ??
      aiAssessment?.updatedAt ??
      aiAssessment?.createdAt;
    if (!raw) return new Date().toISOString();
    return raw;
  }, [enforcement, aiAssessment]);

  const formattedDate = useMemo(() => {
    try {
      return new Date(generatedAt).toLocaleString("en-US", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });
    } catch {
      return generatedAt;
    }
  }, [generatedAt]);

  const engineVersion =
    enforcement?._phase2?.engineVersion ??
    enforcement?.engineVersion ??
    "v4.2";

  return (
    <div
      style={{
        margin: "32px 0 16px",
        padding: "14px 16px",
        background: "var(--rpt-card-bg)",
        borderRadius: "8px",
        border: "1px solid var(--rpt-card-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        {/* Left: KINGA branding */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "6px",
              background: "#1E3A5F",
              border: "1px solid #2563EB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              fontWeight: 900,
              color: "#93C5FD",
              fontFamily: "monospace",
            }}
          >
            K
          </div>
          <div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--rpt-card-text)",
                letterSpacing: "0.04em",
              }}
            >
              KINGA AutoVerify {engineVersion}
            </div>
            <div style={{ fontSize: "9px", color: "var(--rpt-muted-text)", marginTop: "1px" }}>
              AI-assisted claim assessment — not a substitute for human adjudication
            </div>
          </div>
        </div>

        {/* Right: hash + timestamp */}
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--rpt-muted-text)",
              letterSpacing: "0.08em",
            }}
          >
            REPORT HASH #{reportHash}
          </div>
          <div style={{ fontSize: "9px", color: "var(--rpt-muted-text)", marginTop: "2px" }}>
            Generated {formattedDate}
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div
        style={{
          marginTop: "10px",
          paddingTop: "10px",
          borderTop: "1px solid var(--rpt-card-border)",
          fontSize: "9px",
          color: "var(--rpt-muted-text)",
          lineHeight: "1.5",
        }}
      >
        This report was generated by the KINGA AI Decision Engine. All findings are based on data
        submitted at the time of assessment. The report hash above is a deterministic fingerprint of
        the key decision fields; any modification to the underlying assessment will produce a
        different hash. This document is intended for use by licensed insurance professionals only.
        KINGA does not make final coverage determinations — all decisions require human review and
        authorisation in accordance with applicable regulatory requirements.
      </div>
    </div>
  );
}
