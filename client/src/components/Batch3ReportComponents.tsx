/**
 * Batch 3 Report Components — KINGA AutoVerify v4.2
 *
 * Components:
 * 1. ReportPageHeader      — minimal sticky nav: claim ref, vehicle, date, SHA-256 hash, print only
 * 2. ReportSectionDivider  — visual divider between major report sections
 * 3. ReportIntegritySeal   — bottom-of-report SHA-256 hash + generation timestamp + verification URL
 * 4. AdjusterSignOffPanel  — adjuster decision override + signature with DB persistence
 */

import React, { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ─────────────────────────────────────────────────────────────────────────────
// SHA-256 via Web Crypto API (async, no external dependency)
// ─────────────────────────────────────────────────────────────────────────────

export async function sha256Hash(input: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  } catch {
    // Fallback to djb2 if Web Crypto unavailable (e.g., non-secure context)
    let h = 5381;
    for (let i = 0; i < input.length; i++) {
      h = ((h << 5) + h) ^ input.charCodeAt(i);
      h = h >>> 0;
    }
    return h.toString(16).toUpperCase().padStart(8, "0");
  }
}

/** Build the canonical string that is hashed — same fields in both header and seal */
export function buildHashInput(
  claimId: string | number,
  decision: string,
  fraudScore: number,
  totalCost: number,
  consistencyScore: number
): string {
  return `KINGA|${claimId}|${decision}|${fraudScore.toFixed(4)}|${totalCost.toFixed(2)}|${consistencyScore.toFixed(4)}`;
}

/** Hook: computes SHA-256 asynchronously and returns the hex string (or null while pending) */
function useReportHash(
  claimRef: string,
  decision: string,
  fraudScore: number,
  totalCost: number,
  consistencyScore: number
): string | null {
  const [hash, setHash] = useState<string | null>(null);
  const input = useMemo(
    () => buildHashInput(claimRef, decision, fraudScore, totalCost, consistencyScore),
    [claimRef, decision, fraudScore, totalCost, consistencyScore]
  );
  useEffect(() => {
    let cancelled = false;
    sha256Hash(input).then(h => {
      if (!cancelled) setHash(h.slice(0, 16)); // show first 16 hex chars in nav (64 chars in seal)
    });
    return () => { cancelled = true; };
  }, [input]);
  return hash;
}

/** Hook: computes full 64-char SHA-256 for the integrity seal */
function useFullReportHash(
  claimRef: string,
  decision: string,
  fraudScore: number,
  totalCost: number,
  consistencyScore: number
): string | null {
  const [hash, setHash] = useState<string | null>(null);
  const input = useMemo(
    () => buildHashInput(claimRef, decision, fraudScore, totalCost, consistencyScore),
    [claimRef, decision, fraudScore, totalCost, consistencyScore]
  );
  useEffect(() => {
    let cancelled = false;
    sha256Hash(input).then(h => {
      if (!cancelled) setHash(h); // full 64-char hash
    });
    return () => { cancelled = true; };
  }, [input]);
  return hash;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ReportPageHeader — minimal sticky nav only
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

  const claimRef: string = claim?.claimNumber ?? String(claim?.id ?? "—");

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

  const shortHash = useReportHash(claimRef, finalDecision, fraudScore, totalCost, consistencyScore);

  const generatedAt = useMemo(() => {
    const raw = enforcement?.generatedAt ?? aiAssessment?.updatedAt ?? aiAssessment?.createdAt;
    if (!raw) return "—";
    try {
      return new Date(typeof raw === "number" ? raw : String(raw)).toLocaleString("en-US", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch { return "—"; }
  }, [enforcement, aiAssessment]);

  const verifyUrl = shortHash
    ? `${window.location.origin}/verify?hash=${shortHash}&claim=${encodeURIComponent(claimRef)}`
    : null;

  const handlePrint = () => window.print();

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
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {vehicleTitle}
          </div>
          <div style={{ fontSize: "10px", color: "var(--muted-foreground)", display: "flex", gap: "8px", alignItems: "center", marginTop: "1px", flexWrap: "wrap" }}>
            <span>{claimRef}</span>
            <span>·</span>
            <span>{generatedAt}</span>
            {shortHash && (
              <>
                <span>·</span>
                <span
                  style={{ fontFamily: "monospace", fontSize: "9px", background: "var(--muted)", padding: "1px 5px", borderRadius: "3px", color: "var(--muted-foreground)", letterSpacing: "0.05em" }}
                  title="SHA-256 report integrity hash — changes if any decision field is modified"
                >
                  #{shortHash}
                </span>
                {verifyUrl && (
                  <a
                    href={verifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "9px", color: "var(--primary)", textDecoration: "underline", whiteSpace: "nowrap" }}
                    title="Verify this report hash"
                  >
                    Verify ↗
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Centre: KINGA branding */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.05em" }}>
          KINGA AutoVerify
        </span>
        <span style={{ fontSize: "10px", color: "var(--muted-foreground)", opacity: 0.6 }}>v4.2</span>
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
    <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "24px 0 14px" }}>
      <div style={{ flex: "0 0 auto", height: "1px", width: "24px", background: "var(--border)" }} />
      <div style={{ flex: "0 0 auto", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted-foreground)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "5px" }}>
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
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

export function ReportIntegritySeal({ claim, aiAssessment, enforcement }: ReportIntegritySealProps) {
  const claimRef: string = claim?.claimNumber ?? String(claim?.id ?? "—");

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

  const fullHash = useFullReportHash(claimRef, finalDecision, fraudScore, totalCost, consistencyScore);

  const generatedAt = useMemo(() => {
    const raw = enforcement?.generatedAt ?? aiAssessment?.updatedAt ?? aiAssessment?.createdAt;
    if (!raw) return new Date().toISOString();
    return typeof raw === "number" ? new Date(raw).toISOString() : String(raw);
  }, [enforcement, aiAssessment]);

  const verifyUrl = fullHash
    ? `${window.location.origin}/verify?hash=${fullHash.slice(0, 16)}&claim=${encodeURIComponent(claimRef)}`
    : null;

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px" }}>🔒</span>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--foreground)", letterSpacing: "0.04em" }}>
            KINGA AutoVerify — Report Integrity Seal
          </span>
        </div>
        <span style={{ fontSize: "10px", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
          Engine v4.2 · SHA-256
        </span>
      </div>

      {/* Hash row */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>SHA-256:</span>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: "10px",
            fontWeight: 700,
            color: "var(--foreground)",
            background: "var(--muted)",
            padding: "2px 8px",
            borderRadius: "4px",
            letterSpacing: "0.06em",
            wordBreak: "break-all",
          }}
        >
          {fullHash ?? "computing…"}
        </span>
        {verifyUrl && (
          <a
            href={verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "10px", color: "var(--primary)", textDecoration: "underline" }}
          >
            Verify ↗
          </a>
        )}
      </div>

      {/* Timestamp row */}
      <div style={{ fontSize: "10px", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
        Generated: {generatedAt}
      </div>

      {/* Disclaimer */}
      <p style={{ fontSize: "9px", color: "var(--muted-foreground)", margin: 0, lineHeight: 1.5 }}>
        This report was generated by the KINGA AutoVerify AI engine (v4.2) and is intended
        for use by authorised insurance professionals only. The SHA-256 hash above is a
        cryptographic fingerprint of the key decision fields — any modification to the assessment
        outcome, fraud score, cost estimate, or physics consistency score will produce a different
        hash. This document does not constitute a final claims decision and must be reviewed by a
        qualified assessor before any settlement action is taken.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. AdjusterSignOffPanel
//    Allows an authorised adjuster to record a decision override and sign off.
//    Persists to the DB via trpc.claims.adjusterSignOff mutation.
// ─────────────────────────────────────────────────────────────────────────────

type DecisionOverride = "APPROVE" | "REJECT" | "ESCALATE" | "DEFER";

interface AdjusterSignOffPanelProps {
  claimId: number;
  aiDecision: string;
  existingSignOff?: {
    adjusterName: string;
    decision: string;
    notes: string;
    signedAt: string | number;
  } | null;
  onSaved?: () => void;
}

export function AdjusterSignOffPanel({
  claimId,
  aiDecision,
  existingSignOff,
  onSaved,
}: AdjusterSignOffPanelProps) {
  const { user } = useAuth();
  const [decision, setDecision] = useState<DecisionOverride | "">(
    (existingSignOff?.decision as DecisionOverride) ?? ""
  );
  const [notes, setNotes] = useState(existingSignOff?.notes ?? "");
  const [adjusterName, setAdjusterName] = useState(
    existingSignOff?.adjusterName ?? user?.name ?? ""
  );
  const [saved, setSaved] = useState(!!existingSignOff);
  const [error, setError] = useState<string | null>(null);

  const signOff = trpc.claims.saveAdjusterSignOff.useMutation({
    onSuccess: () => {
      setSaved(true);
      setError(null);
      onSaved?.();
    },
    onError: (err: any) => {
      setError(err.message);
    },
  });

  const handleSubmit = () => {
    if (!decision) { setError("Please select a decision."); return; }
    if (!adjusterName.trim()) { setError("Please enter your name."); return; }
    setError(null);
    signOff.mutate({ claimId, decision, notes: notes.trim(), adjusterName: adjusterName.trim() });
  };

  const decisionColour: Record<DecisionOverride, { bg: string; text: string; border: string }> = {
    APPROVE:  { bg: "var(--status-approve-bg)",  text: "var(--status-approve-text)",  border: "var(--status-approve-border)" },
    REJECT:   { bg: "var(--status-reject-bg)",   text: "var(--status-reject-text)",   border: "var(--status-reject-border)" },
    ESCALATE: { bg: "var(--status-review-bg)",   text: "var(--status-review-text)",   border: "var(--status-review-border)" },
    DEFER:    { bg: "var(--fp-info-bg)",          text: "var(--fp-info-text)",          border: "var(--fp-info-border)" },
  };

  const col = decision ? decisionColour[decision] : null;

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "16px 20px",
        marginTop: "16px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px" }}>✍️</span>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--foreground)" }}>
            Adjuster Sign-Off
          </span>
        </div>
        <div style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
          AI recommendation: <strong style={{ color: "var(--foreground)" }}>{aiDecision}</strong>
        </div>
      </div>

      {saved && existingSignOff ? (
        /* Read-only view when already signed off */
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                padding: "2px 10px",
                borderRadius: "4px",
                background: col?.bg ?? "var(--muted)",
                color: col?.text ?? "var(--foreground)",
                border: `1px solid ${col?.border ?? "var(--border)"}`,
              }}
            >
              {existingSignOff.decision}
            </span>
            <span style={{ fontSize: "11px", color: "var(--foreground)", fontWeight: 600 }}>
              {existingSignOff.adjusterName}
            </span>
            <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
              {new Date(typeof existingSignOff.signedAt === "number" ? existingSignOff.signedAt : String(existingSignOff.signedAt)).toLocaleString()}
            </span>
          </div>
          {existingSignOff.notes && (
            <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: 0, fontStyle: "italic" }}>
              "{existingSignOff.notes}"
            </p>
          )}
          <button
            onClick={() => setSaved(false)}
            style={{ alignSelf: "flex-start", fontSize: "10px", color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
          >
            Edit sign-off
          </button>
        </div>
      ) : (
        /* Edit form */
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Decision selector */}
          <div>
            <label style={{ fontSize: "10px", fontWeight: 600, color: "var(--muted-foreground)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Decision Override
            </label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {(["APPROVE", "REJECT", "ESCALATE", "DEFER"] as DecisionOverride[]).map(d => {
                const c = decisionColour[d];
                const selected = decision === d;
                return (
                  <button
                    key={d}
                    onClick={() => setDecision(d)}
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "4px 12px",
                      borderRadius: "4px",
                      border: `1px solid ${selected ? c.border : "var(--border)"}`,
                      background: selected ? c.bg : "transparent",
                      color: selected ? c.text : "var(--muted-foreground)",
                      cursor: "pointer",
                      transition: "all 0.1s",
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Adjuster name */}
          <div>
            <label style={{ fontSize: "10px", fontWeight: 600, color: "var(--muted-foreground)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Adjuster Name
            </label>
            <input
              type="text"
              value={adjusterName}
              onChange={e => setAdjusterName(e.target.value)}
              placeholder="Full name"
              style={{
                width: "100%",
                fontSize: "12px",
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: "10px", fontWeight: 600, color: "var(--muted-foreground)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Reason for override, additional observations…"
              rows={3}
              style={{
                width: "100%",
                fontSize: "12px",
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>

          {error && (
            <p style={{ fontSize: "11px", color: "var(--fp-critical-text)", margin: 0 }}>{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={signOff.isPending}
            style={{
              alignSelf: "flex-start",
              background: "var(--primary)",
              color: "var(--primary-foreground)",
              border: "none",
              borderRadius: "6px",
              padding: "6px 16px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: signOff.isPending ? "not-allowed" : "pointer",
              opacity: signOff.isPending ? 0.6 : 1,
            }}
          >
            {signOff.isPending ? "Saving…" : "Sign Off"}
          </button>
        </div>
      )}
    </div>
  );
}
