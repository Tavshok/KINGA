/**
 * Batch 3 Report Components — KINGA AutoVerify v4.2
 *
 * Components:
 * 1. ReportPageHeader      — minimal sticky nav: claim ref, vehicle, date, hash, print only (NO decision pill — avoids duplication with ForensicAuditReport cover)
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
// 1. ReportPageHeader — minimal sticky nav only
//    Deliberately does NOT show the decision pill — that lives on the
//    ForensicAuditReport Section 0 cover to avoid duplication.
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

  // Used only for hash computation — not displayed in the nav bar
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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="report-page-header no-print"
      style={{
        background: "var(--card)",
        borderBottom: "1px solid var(--border)",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Left: back + claim identity */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "4px 10px",
              color: "var(--muted-foreground)",
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
              fontSize: "12px",
              fontWeight: 700,
              color: "var(--foreground)",
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
              color: "var(--muted-foreground)",
              display: "flex",
              gap: "8px",
              alignItems: "center",
              marginTop: "1px",
            }}
          >
            <span>{claimRef}</span>
            <span>·</span>
            <span>{generatedAt}</span>
            <span>·</span>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "9px",
                background: "var(--muted)",
                padding: "1px 5px",
                borderRadius: "3px",
                color: "var(--muted-foreground)",
                letterSpacing: "0.05em",
              }}
              title="Report integrity hash — changes if any decision field is modified"
            >
              #{reportHash}
            </span>
          </div>
        </div>
      </div>

      {/* Centre: KINGA branding only */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            color: "var(--muted-foreground)",
            letterSpacing: "0.05em",
          }}
        >
          KINGA AutoVerify
        </span>
        <span style={{ fontSize: "10px", color: "var(--muted-foreground)", opacity: 0.6 }}>
          v4.2
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
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "4px 10px",
              color: "var(--muted-foreground)",
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
            background: "var(--primary)",
            border: "none",
            borderRadius: "6px",
            padding: "4px 12px",
            color: "var(--primary-foreground)",
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
          background: "var(--border)",
        }}
      />
      <div
        style={{
          flex: "0 0 auto",
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--muted-foreground)",
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
          background: "var(--border)",
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
    return typeof raw === "number" ? new Date(raw).toISOString() : String(raw);
  }, [enforcement, aiAssessment]);

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "16px 20px",
        marginTop: "32px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px" }}>🔒</span>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "var(--foreground)",
              letterSpacing: "0.04em",
            }}
          >
            KINGA AutoVerify — Report Integrity Seal
          </span>
        </div>
        <span
          style={{
            fontSize: "10px",
            color: "var(--muted-foreground)",
            fontFamily: "monospace",
          }}
        >
          Engine v4.2
        </span>
      </div>

      {/* Hash row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
          Report Hash:
        </span>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: "11px",
            fontWeight: 700,
            color: "var(--foreground)",
            background: "var(--muted)",
            padding: "2px 8px",
            borderRadius: "4px",
            letterSpacing: "0.08em",
          }}
        >
          #{reportHash}
        </span>
        <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
          Generated: {generatedAt}
        </span>
      </div>

      {/* Disclaimer */}
      <p
        style={{
          fontSize: "9px",
          color: "var(--muted-foreground)",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        This report was generated by the KINGA AutoVerify AI engine (v4.2) and is intended
        for use by authorised insurance professionals only. The hash above is a deterministic
        fingerprint of the key decision fields — any modification to the assessment outcome,
        fraud score, cost estimate, or physics consistency score will produce a different hash.
        This document does not constitute a final claims decision and must be reviewed by a
        qualified assessor before any settlement action is taken.
      </p>
    </div>
  );
}
