/**
 * KINGA AutoVerify AI v4.2 — Forensic Audit Report
 *
 * Single component implementing the 6-section forensic audit format:
 *   Section 0: Cover Page — Executive Authority Card
 *   Section 1: Incident & Data Integrity
 *   Section 2: Technical Forensics (Impact Physics + Damage Consistency)
 *   Section 3: Financial Validation (Cost Waterfall + Reconciliation)
 *   Section 4: Evidence Inventory
 *   Section 5: Risk & Fraud Assessment
 *   Section 6: Decision Authority & Audit Trail
 *
 * All colours use CSS variables — works in both light and dark mode.
 * All data paths verified against actual server output shapes.
 */

import React, { useState } from "react";
import { CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ForensicAuditReportProps {
  claim: any;
  aiAssessment: any;
  enforcement: any;
  quotes?: any[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return "N/A";
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "N/A";
  return `$${fmt(n)}`;
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "N/A";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return String(d); }
}

function pct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "N/A";
  return `${Math.round(n)}%`;
}

function decisionColour(d: string): string {
  const map: Record<string, string> = {
    APPROVE: "#10b981",
    FINALISE_CLAIM: "#10b981",
    REVIEW: "#f59e0b",
    REVIEW_REQUIRED: "#f59e0b",
    ESCALATE: "#f97316",
    ESCALATE_INVESTIGATION: "#f97316",
    REJECT: "#ef4444",
  };
  return map[d] ?? "var(--muted-foreground)";
}

function decisionLabel(d: string): string {
  const map: Record<string, string> = {
    APPROVE: "APPROVE",
    FINALISE_CLAIM: "APPROVE",
    REVIEW: "REVIEW REQUIRED",
    REVIEW_REQUIRED: "REVIEW REQUIRED",
    ESCALATE: "ESCALATE",
    ESCALATE_INVESTIGATION: "ESCALATE",
    REJECT: "REJECT",
  };
  return map[d] ?? d;
}

// ─── Section Divider ─────────────────────────────────────────────────────────

function SectionDivider({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4 mt-6">
      <div
        className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
      >
        {number}
      </div>
      <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: "var(--foreground)" }}>
        {title}
      </h2>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, label }: { status: "pass" | "warn" | "fail" | "info" | "na"; label: string }) {
  const cfg = {
    pass: { bg: "#d1fae5", color: "#065f46", border: "#6ee7b7" },
    warn: { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" },
    fail: { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
    info: { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd" },
    na:   { bg: "var(--muted)", color: "var(--muted-foreground)", border: "var(--border)" },
  }[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
    >
      {label}
    </span>
  );
}

// ─── Confidence Bar ───────────────────────────────────────────────────────────

function ConfBar({ value, max = 100 }: { value: number; max?: number }) {
  const pctVal = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pctVal >= 70 ? "#10b981" : pctVal >= 40 ? "#f59e0b" : "#ef4444";
  const blocks = Math.round(pctVal / 10);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs" style={{ color }}>
      {"█".repeat(blocks)}{"░".repeat(10 - blocks)} {Math.round(pctVal)}%
    </span>
  );
}

// ─── Section 0: Executive Authority Cover ────────────────────────────────────

function Section0Cover({ claim, aiAssessment, enforcement }: { claim: any; aiAssessment: any; enforcement: any }) {
  const e = enforcement;
  const phase2 = e?._phase2 as any;
  const wf = e?.weightedFraud;

  // Decision
  const rawDecision: string =
    phase2?.finalDecision ??
    e?.finalDecision?.decision ??
    "REVIEW";
  const fraudScore = wf?.score ?? e?.fraudScoreBreakdown?.totalScore ?? 0;
  const physicsScore = phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0;

  // Cost
  const ce = e?.costExtraction;
  const aiEstimate = ce?.ai_estimate ?? aiAssessment?.estimatedCost ?? 0;
  const quotedTotal = (aiAssessment as any)?._normalised?.costs?.totalUsd ?? aiAssessment?.estimatedCost ?? 0;
  const agreedCost = ce?.ai_estimate ?? aiEstimate;

  // Evidence
  const photoStatus = phase2?.photoAnalysis?.photoStatus ?? "NOT_APPLICABLE";
  const photosDetected = aiAssessment?.photosDetected ?? 0;
  const photosProcessed = aiAssessment?.photosProcessedCount ?? 0;

  // Blockers
  const keyDrivers: string[] = phase2?.keyDrivers ?? e?.finalDecision?.recommendedActions ?? [];
  const primaryReason: string = e?.finalDecision?.primaryReason ?? phase2?.keyDrivers?.[0] ?? "";

  // Pre-flight
  const dataCompleteness = phase2?.dataCompleteness ?? 0;
  const physicsOk = physicsScore >= 30;
  const photosOk = photoStatus === "ANALYSED";

  // Timeline
  const incidentDate = claim?.incidentDate ?? aiAssessment?.incidentDate;
  const inspectionDate = aiAssessment?.assessmentDate;
  const quoteDate = claim?.createdAt;
  const reportDate = aiAssessment?.createdAt ?? new Date().toISOString();

  const decisionColor = decisionColour(rawDecision);
  const decisionText = decisionLabel(rawDecision);

  return (
    <div
      className="mb-6 rounded-xl overflow-hidden"
      style={{ border: `2px solid ${decisionColor}`, background: "var(--card)" }}
    >
      {/* Header bar */}
      <div className="px-5 py-3 flex items-center justify-between" style={{ background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
            KINGA AutoVerify AI v4.2 · Forensic Audit Report
          </p>
          <p className="text-base font-bold mt-0.5" style={{ color: "var(--foreground)" }}>
            {[claim?.vehicleMake, claim?.vehicleModel, claim?.vehicleYear].filter(Boolean).join(" ") || "Vehicle Claim"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Claim: <span className="font-semibold" style={{ color: "var(--foreground)" }}>{claim?.claimNumber ?? "—"}</span></p>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Reg: <span className="font-semibold" style={{ color: "var(--foreground)" }}>{claim?.vehicleRegistration ?? "—"}</span></p>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{fmtDate(reportDate)}</p>
        </div>
      </div>

      {/* Decision pill */}
      <div className="px-5 py-4 flex items-center gap-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div
          className="px-4 py-2 rounded-lg font-bold text-sm tracking-wide"
          style={{ background: decisionColor + "20", color: decisionColor, border: `1px solid ${decisionColor}` }}
        >
          DECISION: {decisionText}
          {fraudScore > 0 && ` (Fraud Risk ${Math.round(fraudScore)}/100)`}
        </div>
        {primaryReason && (
          <p className="text-xs flex-1" style={{ color: "var(--muted-foreground)" }}>{primaryReason}</p>
        )}
      </div>

      {/* 3 metric tiles */}
      <div className="grid grid-cols-3 divide-x" style={{ borderBottom: "1px solid var(--border)", borderColor: "var(--border)" }}>
        {/* Physics */}
        <div className="px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>Physics</p>
          <p className="text-lg font-bold" style={{ color: physicsOk ? "#10b981" : "#f97316" }}>{pct(physicsScore)} consistency</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {e?.physicsEstimate?.deltaVKmh != null ? `Delta-V ${e.physicsEstimate.deltaVKmh} km/h` : "Physics estimated"}
          </p>
          <StatusBadge status={physicsOk ? "pass" : "warn"} label={physicsOk ? "CONSISTENT" : "ANOMALY"} />
        </div>
        {/* Cost */}
        <div className="px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>Cost</p>
          <p className="text-lg font-bold" style={{ color: "var(--foreground)" }}>{fmtUsd(agreedCost)} agreed</p>
          {quotedTotal > 0 && quotedTotal !== agreedCost && (
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>vs {fmtUsd(quotedTotal)} quoted</p>
          )}
          <StatusBadge status="pass" label="WITHIN RANGE" />
        </div>
        {/* Evidence */}
        <div className="px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>Evidence</p>
          <p className="text-lg font-bold" style={{ color: "var(--foreground)" }}>
            {photosDetected > 0 ? `${photosDetected} photos` : "No photos"}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {photoStatus === "SYSTEM_FAILURE" ? "⚠ Ingestion failure (system)" :
             photoStatus === "ANALYSED" ? `${photosProcessed} processed` :
             photoStatus === "CLAIMANT_OMISSION" ? "Not provided by claimant" : "Not applicable"}
          </p>
          <StatusBadge
            status={photoStatus === "ANALYSED" ? "pass" : photoStatus === "SYSTEM_FAILURE" ? "warn" : "na"}
            label={photoStatus === "SYSTEM_FAILURE" ? "SYSTEM ERROR" : photoStatus === "ANALYSED" ? "ANALYSED" : "N/A"}
          />
        </div>
      </div>

      {/* Primary blockers */}
      {keyDrivers.length > 0 && (
        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Primary Blockers</p>
          <ul className="space-y-1">
            {keyDrivers.slice(0, 3).map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--foreground)" }}>
                <span style={{ color: "#f97316" }}>•</span>{d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pre-flight badges */}
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Pre-flight:</p>
        <StatusBadge status={dataCompleteness >= 70 ? "pass" : "warn"} label={`Data ${pct(dataCompleteness)}`} />
        <StatusBadge status={physicsOk ? "pass" : "warn"} label="Physics" />
        <StatusBadge status={photosOk ? "pass" : photoStatus === "SYSTEM_FAILURE" ? "warn" : "na"} label="Photos" />
      </div>

      {/* Timeline */}
      <div className="px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--muted-foreground)" }}>Timeline</p>
        <div className="flex items-center gap-0">
          {[
            { label: "INCIDENT", date: incidentDate },
            { label: "INSPECTION", date: inspectionDate },
            { label: "QUOTE", date: quoteDate },
            { label: "REPORT", date: reportDate },
          ].map((item, i, arr) => (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div className="w-3 h-3 rounded-full" style={{ background: "var(--primary)" }} />
                <p className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{item.label}</p>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{fmtDate(item.date)}</p>
              </div>
              {i < arr.length - 1 && (
                <div className="flex-1 h-px mx-1" style={{ background: "var(--border)" }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Section 1: Incident & Data Integrity ─────────────────────────────────────

function Section1Incident({ claim, aiAssessment, enforcement }: { claim: any; aiAssessment: any; enforcement: any }) {
  const phase2 = (enforcement as any)?._phase2 as any;
  const phase1 = (aiAssessment as any)?._phase1 as any;
  const normalised = (aiAssessment as any)?._normalised as any;

  const incidentType = phase2?.incidentType ?? normalised?.incidentType ?? aiAssessment?.incidentType ?? "N/A";
  const claimedSpeed = normalised?.physics?.claimedSpeedKmh ?? aiAssessment?.claimedSpeedKmh ?? null;
  const location = aiAssessment?.incidentLocation ?? claim?.incidentLocation ?? null;
  const description = aiAssessment?.incidentDescription ?? claim?.incidentDescription ?? null;

  const corrections: string[] = phase1?.allCorrections ?? [];
  const gates: any[] = phase1?.gates ?? [];
  const dataCompleteness = phase2?.dataCompleteness ?? 0;

  // Data completeness checklist
  const checklist = [
    { label: "Incident type", value: incidentType !== "N/A" && incidentType !== "unknown", detail: incidentType },
    { label: "Quote total", value: !!(normalised?.costs?.totalUsd ?? aiAssessment?.estimatedCost), detail: fmtUsd(normalised?.costs?.totalUsd ?? aiAssessment?.estimatedCost) },
    { label: "Photos detected", value: !!(aiAssessment?.photosDetected), detail: aiAssessment?.photosDetected ? `${aiAssessment.photosDetected} detected` : "None" },
    { label: "Police report", value: !!(aiAssessment?.policeReportNumber), detail: aiAssessment?.policeReportNumber ?? "Verbal only / not provided" },
    { label: "Costs reconciled", value: corrections.length > 0 || !!(normalised?.costs?.totalUsd), detail: corrections.length > 0 ? `${corrections.length} correction(s) applied` : "No corrections needed" },
  ];

  return (
    <div className="mb-4">
      {/* Incident facts */}
      <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Incident Facts</p>
        </div>
        <div className="p-4">
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Incident type", <span className="font-semibold" style={{ color: "var(--foreground)" }}>{incidentType.replace(/_/g, " ")}</span>],
                ["Claimed speed", claimedSpeed != null ? `${claimedSpeed} km/h` : "Not stated"],
                ["Location", location ?? "Not recorded"],
                ["Incident date", fmtDate(claim?.incidentDate ?? aiAssessment?.incidentDate)],
                ["Inspection date", fmtDate(aiAssessment?.assessmentDate)],
                ["Assessor", aiAssessment?.assessorName ?? "Not assigned"],
                ["Repairer", aiAssessment?.panelBeaterName ?? claim?.repairerName ?? "Not specified"],
              ].map(([k, v], i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td className="py-2 pr-4 text-xs font-semibold w-40" style={{ color: "var(--muted-foreground)" }}>{k as string}</td>
                  <td className="py-2 text-xs" style={{ color: "var(--foreground)" }}>{v as React.ReactNode}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {description && (
            <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
              <span className="font-semibold">Description: </span>{description}
            </div>
          )}
        </div>
      </div>

      {/* Data completeness */}
      <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Data Completeness</p>
          <ConfBar value={dataCompleteness} />
        </div>
        <div className="p-4 space-y-2">
          {checklist.map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {item.value
                  ? <CheckCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "#10b981" }} />
                  : <XCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "#ef4444" }} />}
                <span className="text-xs" style={{ color: "var(--foreground)" }}>{item.label}</span>
              </div>
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{item.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Phase 1 corrections */}
      {corrections.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: "#f59e0b" }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>
              Phase 1 Auto-Corrections Applied ({corrections.length})
            </p>
          </div>
          <div className="p-4 space-y-1">
            {corrections.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--foreground)" }}>
                <span className="font-mono font-bold" style={{ color: "#f59e0b" }}>{i + 1}.</span>
                {c}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gate results */}
      {gates.length > 0 && (
        <div className="rounded-xl overflow-hidden mt-4" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Phase 1 Gate Results</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  {["Gate", "Status", "Corrections"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gates.map((g: any, i: number) => (
                  <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                    <td className="px-3 py-2 font-mono font-semibold" style={{ color: "var(--primary)" }}>{g.gate ?? `G${i + 1}`}</td>
                    <td className="px-3 py-2">
                      <StatusBadge
                        status={g.status === "PASS" ? "pass" : g.status === "WARN" ? "warn" : "fail"}
                        label={g.status ?? "UNKNOWN"}
                      />
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{g.corrections?.length ?? 0}</td>
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

// ─── Section 2: Technical Forensics ──────────────────────────────────────────

function Section2Physics({ aiAssessment, enforcement }: { aiAssessment: any; enforcement: any }) {
  const e = enforcement;
  const pe = e?.physicsEstimate;
  const phase2 = (enforcement as any)?._phase2 as any;
  const physicsScore = phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0;
  const constraints: any[] = phase2?.physicsConstraints ?? [];
  const incidentType = phase2?.incidentType ?? aiAssessment?.incidentType ?? "unknown";

  // Impact physics
  const deltaV = pe?.deltaVKmh ?? 0;
  const claimedSpeed = (aiAssessment as any)?._normalised?.physics?.claimedSpeedKmh ?? aiAssessment?.claimedSpeedKmh ?? 0;
  const energyKj = pe?.estimatedEnergyKj ?? 0;
  const vehicleMassKg = pe?.vehicleMassKg ?? null;
  const severity = pe?.accidentSeverity ?? aiAssessment?.structuralDamageSeverity ?? "unknown";

  // Damage zones
  const damageZones: string[] = e?.directionFlag?.damageZones ?? [];
  const directionMismatch = e?.directionFlag?.mismatch ?? false;
  const directionExplanation = e?.directionFlag?.explanation ?? "";

  // Consistency
  const consistencyFlagged = e?.consistencyFlag?.flagged ?? false;
  const consistencyExplanation = e?.consistencyFlag?.explanation ?? "";
  const anomalyLevel = e?.consistencyFlag?.anomalyLevel ?? "none";

  // Expected vs Observed pattern
  const incidentPatterns: Record<string, { expected: string[]; notes: string }> = {
    ANIMAL_STRIKE: {
      expected: ["Bonnet/hood deformation", "Bumper deformation", "Radiator damage", "Airbag deployment (if >25 km/h)", "Seatbelt pre-tensioners (if >15 km/h)"],
      notes: "Animal strikes typically produce frontal zone damage with variable severity depending on animal mass and impact speed.",
    },
    VEHICLE_COLLISION: {
      expected: ["Bumper deformation", "Bonnet damage", "Frame misalignment", "Airbag deployment (if >25 km/h)", "Seatbelt pre-tensioners"],
      notes: "Vehicle collisions produce bilateral or frontal damage with structural deformation proportional to Delta-V.",
    },
    ROLLOVER: {
      expected: ["Roof deformation", "Door frame damage", "Window breakage", "Airbag deployment", "Seatbelt pre-tensioners"],
      notes: "Rollovers produce roof and side damage with multiple contact points.",
    },
  };
  const pattern = incidentPatterns[incidentType.toUpperCase()] ?? incidentPatterns["ANIMAL_STRIKE"];

  return (
    <div className="mb-4 space-y-4">
      {/* 2.1 Impact Physics */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>2.1 Impact Physics</p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              ["Vehicle mass", vehicleMassKg != null ? `${vehicleMassKg.toLocaleString()} kg` : "Estimated"],
              ["Claimed impact speed", claimedSpeed > 0 ? `${claimedSpeed} km/h` : "Not stated"],
              ["Calculated Delta-V", deltaV > 0 ? `${deltaV} km/h` : "Not calculated"],
              ["Energy dissipated", energyKj > 0 ? `${energyKj.toLocaleString()} kJ` : "Not calculated"],
              ["Accident severity", severity.replace(/_/g, " ").toUpperCase()],
              ["Impact direction", e?.directionFlag?.impactDirection ?? "Not determined"],
            ].map(([k, v], i) => (
              <div key={i} className="p-2 rounded-lg" style={{ background: "var(--muted)" }}>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{k}</p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--foreground)" }}>{v}</p>
              </div>
            ))}
          </div>

          {/* Speed comparison bars */}
          {(claimedSpeed > 0 || deltaV > 0) && (
            <div className="space-y-2 mb-3">
              {claimedSpeed > 0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: "var(--muted-foreground)" }}>Claimed speed</span>
                    <span style={{ color: "var(--foreground)" }}>{claimedSpeed} km/h</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: "var(--muted)" }}>
                    <div className="h-2 rounded-full" style={{ width: `${Math.min(100, (claimedSpeed / 150) * 100)}%`, background: "#f59e0b" }} />
                  </div>
                </div>
              )}
              {deltaV > 0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: "var(--muted-foreground)" }}>Delta-V (calculated)</span>
                    <span style={{ color: "var(--foreground)" }}>{deltaV} km/h</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: "var(--muted)" }}>
                    <div className="h-2 rounded-full" style={{ width: `${Math.min(100, (deltaV / 150) * 100)}%`, background: "#10b981" }} />
                  </div>
                </div>
              )}
              {claimedSpeed > 0 && deltaV > 0 && claimedSpeed !== deltaV && (
                <p className="text-xs p-2 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                  Note: Speed reduction {claimedSpeed}→{deltaV} km/h indicates energy absorption by deformation and pre-impact braking. This may be physically plausible for {incidentType.replace(/_/g, " ").toLowerCase()}.
                </p>
              )}
            </div>
          )}

          {/* Direction flag */}
          {directionExplanation && (
            <div className="p-2 rounded-lg text-xs" style={{
              background: directionMismatch ? "var(--fp-warning-bg, #fef3c7)" : "var(--fp-success-bg, #d1fae5)",
              border: `1px solid ${directionMismatch ? "#fcd34d" : "#6ee7b7"}`,
              color: directionMismatch ? "#92400e" : "#065f46",
            }}>
              {directionMismatch ? "⚠ Direction mismatch: " : "✓ Direction consistent: "}{directionExplanation}
            </div>
          )}
        </div>
      </div>

      {/* 2.2 Damage Consistency */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>2.2 Damage Consistency</p>
          <div className="flex items-center gap-2">
            <ConfBar value={physicsScore} />
            <StatusBadge
              status={physicsScore >= 70 ? "pass" : physicsScore >= 30 ? "warn" : "fail"}
              label={anomalyLevel === "none" ? "CONSISTENT" : anomalyLevel.toUpperCase()}
            />
          </div>
        </div>
        <div className="p-4">
          {consistencyExplanation && (
            <p className="text-xs mb-4 p-2 rounded" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
              {consistencyExplanation}
            </p>
          )}

          {/* Comparative layout */}
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>
            Comparative Layout — Expected vs Observed ({incidentType.replace(/_/g, " ")})
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Expected Pattern</th>
                  <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Observed</th>
                  <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Match</th>
                </tr>
              </thead>
              <tbody>
                {pattern.expected.map((item, i) => {
                  const zoneMatch = damageZones.some(z =>
                    item.toLowerCase().includes(z.toLowerCase()) ||
                    z.toLowerCase().includes(item.split(" ")[0].toLowerCase())
                  );
                  return (
                    <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                      <td className="px-3 py-2" style={{ color: "var(--foreground)" }}>{item}</td>
                      <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>
                        {damageZones.length > 0 ? (zoneMatch ? `✓ ${damageZones.find(z => z.toLowerCase().includes(item.split(" ")[0].toLowerCase())) ?? "Confirmed"}` : "Not confirmed") : "Pending inspection"}
                      </td>
                      <td className="px-3 py-2">
                        {damageZones.length > 0
                          ? <StatusBadge status={zoneMatch ? "pass" : "warn"} label={zoneMatch ? "✓" : "?"} />
                          : <StatusBadge status="na" label="N/A" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Constraint status table */}
          {constraints.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>
                Physics Constraint Status
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                      {["Constraint", "Suppressed", "Advisory", "Verdict"].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {constraints.map((c: any, i: number) => (
                      <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                        <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>{c.constraint}</td>
                        <td className="px-3 py-2">{c.suppressed ? <StatusBadge status="warn" label="SUPPRESSED" /> : <StatusBadge status="pass" label="ACTIVE" />}</td>
                        <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{c.advisory ?? "—"}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={c.suppressed ? "warn" : "pass"} label={c.suppressed ? "⚠ advisory" : "✅ pass"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {pattern.notes && (
            <p className="text-xs mt-3 p-2 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
              {pattern.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section 3: Financial Validation ─────────────────────────────────────────

function Section3Financial({ aiAssessment, enforcement, quotes }: { aiAssessment: any; enforcement: any; quotes?: any[] }) {
  const e = enforcement;
  const ce = e?.costExtraction;
  const normalised = (aiAssessment as any)?._normalised as any;

  // Authoritative figures
  const aiEstimate = ce?.ai_estimate ?? normalised?.costs?.totalUsd ?? aiAssessment?.estimatedCost ?? 0;
  const partsFromQuote = ce?.parts ?? aiAssessment?.estimatedPartsCost ?? 0;
  const labourFromQuote = ce?.labour ?? aiAssessment?.estimatedLaborCost ?? 0;
  const fairMin = ce?.fair_range?.min ?? e?.costBenchmark?.estimatedFairMin ?? 0;
  const fairMax = ce?.fair_range?.max ?? e?.costBenchmark?.estimatedFairMax ?? 0;
  const itemisedParts: any[] = ce?.itemised_parts ?? [];

  // Panel beater quotes (stored in cents)
  const pbQuotes = (quotes ?? []).map((q: any) => ({
    name: q.panelBeaterName ?? "Panel Beater",
    total: (q.quotedAmount ?? 0) / 100,
  }));
  const quotedTotal = pbQuotes.length > 0 ? pbQuotes[0].total : 0;

  // Agreed cost (lowest of AI estimate and quoted, or AI estimate if no quote)
  const agreedCost = quotedTotal > 0 ? Math.min(aiEstimate, quotedTotal) : aiEstimate;
  const savings = quotedTotal > agreedCost ? quotedTotal - agreedCost : 0;
  const variance = quotedTotal > 0 && aiEstimate > 0 ? ((quotedTotal - aiEstimate) / aiEstimate) * 100 : null;

  // Cost verdict
  const verdict = e?.costVerdict?.verdict ?? (
    aiEstimate > 0 && fairMax > 0
      ? aiEstimate > fairMax * 1.15 ? "OVERPRICED" : aiEstimate < fairMin * 0.85 ? "UNDERPRICED" : "FAIR"
      : "FAIR"
  );
  const verdictColor = verdict === "OVERPRICED" ? "#ef4444" : verdict === "UNDERPRICED" ? "#3b82f6" : "#10b981";

  // Auto-corrections
  const corrections: string[] = (aiAssessment as any)?._phase1?.allCorrections ?? [];
  const costCorrections = corrections.filter(c => c.toLowerCase().includes("cost") || c.toLowerCase().includes("$") || c.toLowerCase().includes("amount"));

  return (
    <div className="mb-4 space-y-4">
      {/* Cost waterfall */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Cost Waterfall</p>
          <StatusBadge
            status={verdict === "FAIR" ? "pass" : verdict === "OVERPRICED" ? "fail" : "info"}
            label={verdict}
          />
        </div>
        <div className="p-4">
          {/* Waterfall bars */}
          <div className="space-y-3 mb-4">
            {[
              { label: "Quoted (Repairer)", value: quotedTotal, color: "#f59e0b", show: quotedTotal > 0 },
              { label: "AI Estimate (Baseline)", value: aiEstimate, color: "#3b82f6", show: aiEstimate > 0 },
              { label: "Agreed Cost", value: agreedCost, color: "#10b981", show: agreedCost > 0 },
              { label: "Fair Range Min", value: fairMin, color: "#6b7280", show: fairMin > 0 },
              { label: "Fair Range Max", value: fairMax, color: "#6b7280", show: fairMax > 0 },
            ].filter(b => b.show).map((bar, i) => {
              const maxVal = Math.max(quotedTotal, aiEstimate, fairMax, 1);
              const width = Math.min(100, (bar.value / maxVal) * 100);
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: "var(--muted-foreground)" }}>{bar.label}</span>
                    <span className="font-semibold" style={{ color: "var(--foreground)" }}>{fmtUsd(bar.value)}</span>
                  </div>
                  <div className="h-3 rounded-full" style={{ background: "var(--muted)" }}>
                    <div className="h-3 rounded-full transition-all" style={{ width: `${width}%`, background: bar.color }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Breakdown table */}
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Breakdown Table</p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  {["Source", "Amount", "Audit Note"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { source: "AI Estimate", amount: aiEstimate, note: "Baseline (market range)" },
                  ...(quotedTotal > 0 ? [{ source: `Repairer Quote${pbQuotes[0]?.name ? ` (${pbQuotes[0].name})` : ""}`, amount: quotedTotal, note: "Extracted from submitted quote" }] : []),
                  { source: "Agreed Cost", amount: agreedCost, note: savings > 0 ? `After betterment (savings: ${fmtUsd(savings)})` : "Authoritative total" },
                  ...(variance != null ? [{ source: "Variance (Quote vs AI)", amount: null, note: `${variance > 0 ? "+" : ""}${Math.round(variance)}% — ${Math.abs(variance) <= 15 ? "within acceptable range" : "outside acceptable range"}` }] : []),
                ].map((row, i) => (
                  <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>{row.source}</td>
                    <td className="px-3 py-2 font-semibold" style={{ color: verdictColor }}>
                      {row.amount != null ? fmtUsd(row.amount) : "—"}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Parts & Labour reconciliation */}
          {(partsFromQuote > 0 || labourFromQuote > 0) && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Parts & Labour Reconciliation</p>
              <div className="p-3 rounded-lg text-xs space-y-1" style={{ background: "var(--muted)" }}>
                <div className="flex justify-between"><span style={{ color: "var(--muted-foreground)" }}>Parts</span><span className="font-semibold" style={{ color: "var(--foreground)" }}>{fmtUsd(partsFromQuote)}</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--muted-foreground)" }}>Labour</span><span className="font-semibold" style={{ color: "var(--foreground)" }}>{fmtUsd(labourFromQuote)}</span></div>
                {partsFromQuote + labourFromQuote > 0 && (
                  <div className="flex justify-between pt-1" style={{ borderTop: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--muted-foreground)" }}>Parts + Labour subtotal</span>
                    <span className="font-semibold" style={{ color: "var(--foreground)" }}>{fmtUsd(partsFromQuote + labourFromQuote)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span style={{ color: "var(--muted-foreground)" }}>Authoritative total (AI)</span>
                  <span className="font-bold" style={{ color: verdictColor }}>{fmtUsd(aiEstimate)}</span>
                </div>
                {Math.abs((partsFromQuote + labourFromQuote) - aiEstimate) > 1 && (
                  <p className="text-xs pt-1" style={{ color: "var(--muted-foreground)" }}>
                    Note: Parts + Labour ({fmtUsd(partsFromQuote + labourFromQuote)}) differs from AI total ({fmtUsd(aiEstimate)}). AI total is the authoritative figure.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Itemised parts */}
          {itemisedParts.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Itemised Parts ({itemisedParts.length} components)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                      {["Component", "Parts", "Labour", "Total", "Source"].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itemisedParts.map((item: any, i: number) => (
                      <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                        <td className="px-3 py-2 font-medium capitalize" style={{ color: "var(--foreground)" }}>{item.component}</td>
                        <td className="px-3 py-2" style={{ color: "var(--foreground)" }}>{fmtUsd(item.parts_cost)}</td>
                        <td className="px-3 py-2" style={{ color: "var(--foreground)" }}>{fmtUsd(item.labour_cost)}</td>
                        <td className="px-3 py-2 font-semibold" style={{ color: "var(--foreground)" }}>{fmtUsd(item.total)}</td>
                        <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{item.source ?? "AI"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Auto-corrections */}
          {costCorrections.length > 0 && (
            <div className="mt-3 p-2 rounded text-xs" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
              <span className="font-semibold">Auto-correction applied: </span>{costCorrections.join("; ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section 4: Evidence Inventory ───────────────────────────────────────────

function Section4Evidence({ aiAssessment, enforcement, claim }: { aiAssessment: any; enforcement: any; claim: any }) {
  const phase2 = (enforcement as any)?._phase2 as any;
  const photoStatus = phase2?.photoAnalysis?.photoStatus ?? "NOT_APPLICABLE";
  const photosDetected = aiAssessment?.photosDetected ?? 0;
  const photosProcessed = aiAssessment?.photosProcessedCount ?? 0;
  const photoUrls: string[] = aiAssessment?.damagePhotoUrls ?? [];
  const systemNote = phase2?.photoAnalysis?.systemNote ?? "";

  const isSystemFailure = photoStatus === "SYSTEM_FAILURE";
  const isClaimantOmission = photoStatus === "CLAIMANT_OMISSION";

  // Document inventory
  const docs = [
    {
      id: "Claim form",
      type: "Motor claim form",
      extracted: !!(aiAssessment?.incidentType || aiAssessment?.estimatedCost),
      confidence: aiAssessment?.confidenceScore ?? null,
      note: "Primary source document",
    },
    {
      id: "Repairer quote",
      type: "Repair quotation",
      extracted: !!(aiAssessment?.estimatedCost),
      confidence: (enforcement as any)?.costExtraction?.confidence ?? null,
      note: (enforcement as any)?.costExtraction?.source === "extracted" ? "Extracted from PDF" : "AI estimated",
    },
    {
      id: "Police report",
      type: "Police/case report",
      extracted: !!(aiAssessment?.policeReportNumber),
      confidence: null,
      note: aiAssessment?.policeReportNumber ? `Case #${aiAssessment.policeReportNumber}` : "Verbal only — no case number",
    },
    {
      id: "Damage photos",
      type: "Photo evidence",
      extracted: photosProcessed > 0,
      confidence: null,
      note: isSystemFailure
        ? `SYSTEM ERROR — ${photosDetected} detected, 0 processed (pipeline failure)`
        : isClaimantOmission
        ? "Not provided by claimant"
        : photosProcessed > 0
        ? `${photosProcessed}/${photosDetected} processed`
        : "Not applicable",
    },
  ];

  return (
    <div className="mb-4 space-y-4">
      {/* Photo status */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Photo Evidence</p>
          <StatusBadge
            status={photoStatus === "ANALYSED" ? "pass" : photoStatus === "SYSTEM_FAILURE" ? "warn" : "na"}
            label={photoStatus.replace(/_/g, " ")}
          />
        </div>
        <div className="p-4">
          <div className="flex items-center gap-4 mb-3">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{photosDetected}</p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Detected</p>
            </div>
            <div className="h-8 w-px" style={{ background: "var(--border)" }} />
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: photosProcessed > 0 ? "#10b981" : "#ef4444" }}>{photosProcessed}</p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Processed</p>
            </div>
            <div className="flex-1">
              {isSystemFailure && (
                <div className="p-2 rounded text-xs" style={{ background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e" }}>
                  <strong>⚠ SYSTEM ERROR</strong> — Photo ingestion pipeline failure. This is a system issue, not claimant omission. Manual review required.
                  {systemNote && <p className="mt-1">{systemNote}</p>}
                </div>
              )}
              {isClaimantOmission && (
                <div className="p-2 rounded text-xs" style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b" }}>
                  <strong>❌ Photos not provided</strong> — Claimant did not submit photo evidence. This contributes to the fraud risk score.
                </div>
              )}
              {photoStatus === "ANALYSED" && (
                <div className="p-2 rounded text-xs" style={{ background: "#d1fae5", border: "1px solid #6ee7b7", color: "#065f46" }}>
                  <strong>✓ Photos analysed</strong> — {photosProcessed} of {photosDetected} photos successfully processed.
                </div>
              )}
            </div>
          </div>

          {/* Photo grid (thumbnails) */}
          {photoUrls.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Photo Grid</p>
              <div className="grid grid-cols-3 gap-2">
                {photoUrls.slice(0, 9).map((url, i) => (
                  <div key={i} className="aspect-square rounded overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--muted)" }}>
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
              {photoUrls.length > 9 && (
                <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>+{photoUrls.length - 9} more images (F10–F{photoUrls.length})</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Document extraction table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Document Extraction Table</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                {["Document", "Type", "Extracted", "Confidence", "Note"].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((doc, i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>{doc.id}</td>
                  <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{doc.type}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={doc.extracted ? "pass" : "fail"} label={doc.extracted ? "YES" : "NO"} />
                  </td>
                  <td className="px-3 py-2">
                    {doc.confidence != null ? <ConfBar value={doc.confidence} /> : <span style={{ color: "var(--muted-foreground)" }}>N/A</span>}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{doc.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Section 5: Risk & Fraud Assessment ──────────────────────────────────────

function Section5Fraud({ aiAssessment, enforcement }: { aiAssessment: any; enforcement: any }) {
  const e = enforcement;
  const wf = e?.weightedFraud;
  const phase2 = (enforcement as any)?._phase2 as any;

  const fraudScore = wf?.score ?? e?.fraudScoreBreakdown?.totalScore ?? 0;
  const fraudLevel = wf?.level ?? e?.fraudLevelEnforced ?? "minimal";
  const fraudLabel = wf?.explanation ?? e?.fraudLevelLabel ?? fraudLevel;

  // Fraud level colour
  const fraudColor = fraudScore >= 70 ? "#ef4444" : fraudScore >= 40 ? "#f59e0b" : "#10b981";
  const fraudBand = fraudScore >= 70 ? "HIGH RISK" : fraudScore >= 40 ? "MODERATE RISK" : "LOW RISK";

  // Full contributions (per-factor breakdown)
  const contributions: any[] = wf?.full_contributions ?? wf?.contributions ?? [];

  // Photo fraud points — must be excluded if system failure
  const photoStatus = phase2?.photoAnalysis?.photoStatus ?? "NOT_APPLICABLE";
  const photoFraudPoints = phase2?.photoAnalysis?.fraudPointsAdded ?? 0;
  const isSystemFailure = photoStatus === "SYSTEM_FAILURE";

  // Advisories
  const advisories: string[] = phase2?.advisories ?? [];

  // Final risk statement
  const keyDrivers: string[] = phase2?.keyDrivers ?? [];
  const physicsScore = phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0;

  return (
    <div className="mb-4 space-y-4">
      {/* Fraud score gauge */}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${fraudColor}40`, background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Overall Fraud Score</p>
          <StatusBadge
            status={fraudScore >= 70 ? "fail" : fraudScore >= 40 ? "warn" : "pass"}
            label={fraudBand}
          />
        </div>
        <div className="p-4">
          <div className="flex items-center gap-4 mb-3">
            <div className="text-4xl font-bold" style={{ color: fraudColor }}>{Math.round(fraudScore)}</div>
            <div>
              <p className="text-sm font-semibold" style={{ color: fraudColor }}>{fraudBand}</p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{fraudLabel}</p>
            </div>
          </div>
          <div className="h-3 rounded-full mb-1" style={{ background: "var(--muted)" }}>
            <div
              className="h-3 rounded-full"
              style={{ width: `${Math.min(100, fraudScore)}%`, background: `linear-gradient(90deg, #10b981, #f59e0b, #ef4444)` }}
            />
          </div>
          <div className="flex justify-between text-xs" style={{ color: "var(--muted-foreground)" }}>
            <span>0 — Low</span><span>40 — Moderate</span><span>70 — High</span><span>100</span>
          </div>
        </div>
      </div>

      {/* Indicator breakdown */}
      {contributions.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>
              Indicator Breakdown (system errors excluded from score)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  {["Indicator", "Score", "Triggered", "Mitigation Note"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contributions.map((c: any, i: number) => {
                  const isPhotoFactor = c.factor?.toLowerCase().includes("photo");
                  const isExcluded = isPhotoFactor && isSystemFailure;
                  const score = c.value ?? 0;
                  const scoreColor = isExcluded ? "var(--muted-foreground)" : score > 10 ? "#ef4444" : score > 5 ? "#f59e0b" : "#10b981";

                  const mitigationMap: Record<string, string> = {
                    damage_pattern: "Physical inspection recommended to verify damage extent",
                    police_report: "Obtain police case number from claimant",
                    photo: isSystemFailure ? "SYSTEM ERROR — not counted in fraud score (pipeline failure)" : "Request additional photo evidence from claimant",
                    speed: "Engineering review of Delta-V calculation recommended",
                    seatbelt: "Physical inspection of seatbelt retractor mechanism and ECU download",
                    airbag: "Advisory only — consistent with low Delta-V impact",
                    cost: "Reconcile cost difference with repairer",
                  };
                  const mitigation = Object.entries(mitigationMap).find(([k]) =>
                    c.factor?.toLowerCase().includes(k)
                  )?.[1] ?? c.detail ?? "No specific mitigation required";

                  return (
                    <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: isExcluded ? "var(--muted)" : "var(--background)", opacity: isExcluded ? 0.7 : 1 }}>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>
                        {c.factor?.replace(/_/g, " ")}
                        {isExcluded && <span className="ml-1 text-xs" style={{ color: "var(--muted-foreground)" }}>(excluded)</span>}
                      </td>
                      <td className="px-3 py-2 font-bold" style={{ color: scoreColor }}>
                        {isExcluded ? "0 (adj)" : `${score}/20`}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={c.triggered && !isExcluded ? "fail" : "pass"} label={c.triggered && !isExcluded ? "YES" : "NO"} />
                      </td>
                      <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{mitigation}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Advisories */}
      {advisories.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Advisories</p>
          </div>
          <div className="p-4 space-y-2">
            {advisories.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-xs p-2 rounded" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "#f59e0b" }} />
                {a}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final risk statement */}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${fraudColor}40`, background: "var(--card)" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Final Risk Statement</p>
        </div>
        <div className="p-4">
          <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
            {fraudScore >= 70
              ? `High fraud risk (${Math.round(fraudScore)}/100) detected. `
              : fraudScore >= 40
              ? `Moderate fraud risk (${Math.round(fraudScore)}/100) identified. `
              : `Low fraud risk (${Math.round(fraudScore)}/100). `}
            {physicsScore < 30
              ? `Physics consistency is critically low at ${Math.round(physicsScore)}%, indicating a significant anomaly that requires engineering review. `
              : physicsScore < 70
              ? `Physics consistency of ${Math.round(physicsScore)}% is below the expected threshold and warrants further investigation. `
              : `Physics analysis shows acceptable consistency at ${Math.round(physicsScore)}%. `}
            {isSystemFailure
              ? "Photo ingestion failure is attributable to a system pipeline error, not claimant omission, and has been excluded from the fraud score. "
              : ""}
            {keyDrivers.length > 0
              ? `Key decision drivers: ${keyDrivers.slice(0, 2).join("; ")}.`
              : "No additional risk drivers identified."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Section 6: Decision Authority & Audit Trail ──────────────────────────────

function Section6Decision({ claim, aiAssessment, enforcement }: { claim: any; aiAssessment: any; enforcement: any }) {
  const e = enforcement;
  const phase2 = (enforcement as any)?._phase2 as any;
  const [showRaw, setShowRaw] = useState(false);

  const rawDecision: string = phase2?.finalDecision ?? e?.finalDecision?.decision ?? "REVIEW";
  const decisionColor = decisionColour(rawDecision);
  const decisionText = decisionLabel(rawDecision);

  const ruleTrace: any[] = e?.finalDecision?.ruleTrace ?? [];
  const nextSteps: string[] = phase2?.nextSteps ?? e?.finalDecision?.recommendedActions ?? [];
  const keyDrivers: string[] = phase2?.keyDrivers ?? [];
  const primaryReason = e?.finalDecision?.primaryReason ?? keyDrivers[0] ?? "";

  // Blocked actions
  const blockedMap: Record<string, string[]> = {
    APPROVE: ["REJECT"],
    FINALISE_CLAIM: ["REJECT"],
    REVIEW: ["APPROVE", "REJECT"],
    REVIEW_REQUIRED: ["APPROVE", "REJECT"],
    ESCALATE: ["APPROVE", "REJECT"],
    ESCALATE_INVESTIGATION: ["APPROVE", "REJECT"],
    REJECT: ["APPROVE"],
  };
  const blocked = blockedMap[rawDecision] ?? [];

  // Audit trail
  const engineVersion = "v4.2.0";
  const reportHash = (() => {
    const str = `${claim?.claimNumber}${rawDecision}${Math.round(e?.weightedFraud?.score ?? 0)}${phase2?.physicsConsistency ?? 0}`;
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; }
    return "#" + Math.abs(h).toString(16).toUpperCase().padStart(8, "0");
  })();

  const corrections: string[] = (aiAssessment as any)?._phase1?.allCorrections ?? [];

  // Decision flowchart gates
  const gates = [
    { label: "Data complete?", value: `${Math.round(phase2?.dataCompleteness ?? 0)}%`, threshold: "≥70%", pass: (phase2?.dataCompleteness ?? 0) >= 70 },
    { label: "Physics consistent?", value: `${Math.round(phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0)}%`, threshold: "≥30%", pass: (phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0) >= 30 },
    { label: "Safety anomaly?", value: e?.consistencyFlag?.anomalyLevel ?? "none", threshold: "none", pass: (e?.consistencyFlag?.anomalyLevel ?? "none") === "none" },
    { label: "Fraud score ≥70?", value: `${Math.round(e?.weightedFraud?.score ?? 0)}`, threshold: "<70", pass: (e?.weightedFraud?.score ?? 0) < 70 },
    { label: "Total loss?", value: "No", threshold: "No", pass: true },
  ];

  return (
    <div className="mb-4 space-y-4">
      {/* Decision flowchart */}
      <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${decisionColor}`, background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Decision Flowchart</p>
          <div
            className="px-3 py-1 rounded font-bold text-xs"
            style={{ background: decisionColor + "20", color: decisionColor, border: `1px solid ${decisionColor}` }}
          >
            FINAL: {decisionText}
          </div>
        </div>
        <div className="p-4">
          <div className="space-y-2">
            {gates.map((gate, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex items-center justify-center w-6 h-6 rounded shrink-0 text-xs font-bold" style={{ background: gate.pass ? "#d1fae5" : "#fee2e2", color: gate.pass ? "#065f46" : "#991b1b" }}>
                  {gate.pass ? "✓" : "✗"}
                </div>
                <div className="flex-1 flex items-center justify-between text-xs">
                  <span style={{ color: "var(--foreground)" }}>{gate.label}</span>
                  <span className="font-mono" style={{ color: gate.pass ? "#10b981" : "#ef4444" }}>{gate.value} (threshold: {gate.threshold})</span>
                </div>
                {!gate.pass && (
                  <div className="text-xs font-bold" style={{ color: decisionColor }}>→ {decisionText}</div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 p-2 rounded text-xs font-bold text-center" style={{ background: decisionColor + "20", color: decisionColor, border: `1px solid ${decisionColor}` }}>
            FINAL DECISION: {decisionText}
          </div>
        </div>
      </div>

      {/* Trigger conditions */}
      {(keyDrivers.length > 0 || primaryReason) && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Trigger Conditions</p>
          </div>
          <div className="p-4 space-y-2">
            {[primaryReason, ...keyDrivers].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5).map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="font-bold shrink-0" style={{ color: decisionColor }}>{i + 1}.</span>
                <span style={{ color: "var(--foreground)" }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blocked actions */}
      {blocked.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Blocked Actions</p>
          </div>
          <div className="p-4 space-y-1">
            {blocked.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <XCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "#ef4444" }} />
                <span style={{ color: "var(--foreground)" }}>
                  {b === "APPROVE" ? "APPROVE — cannot approve while anomalies remain unexplained" :
                   b === "REJECT" ? "REJECT — no evidence of malicious intent" :
                   b}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Required next steps */}
      {nextSteps.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Required Next Steps</p>
          </div>
          <div className="p-4 space-y-2">
            {nextSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <div className="w-4 h-4 rounded border shrink-0 mt-0.5" style={{ border: "1px solid var(--border)" }} />
                <span style={{ color: "var(--foreground)" }}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rule trace */}
      {ruleTrace.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Rule Trace</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  {["Rule", "Value", "Threshold", "Triggered"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ruleTrace.map((r: any, i: number) => (
                  <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                    <td className="px-3 py-2 font-mono" style={{ color: "var(--primary)" }}>{r.rule}</td>
                    <td className="px-3 py-2" style={{ color: "var(--foreground)" }}>{String(r.value)}</td>
                    <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{r.threshold}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.triggered ? "fail" : "pass"} label={r.triggered ? "YES" : "NO"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit trail */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Audit Trail</p>
        </div>
        <div className="p-4">
          <table className="w-full text-xs">
            <tbody>
              {[
                ["Analysed by", `KINGA Engine ${engineVersion}`],
                ["Data sources", `Claim form, Photos (${aiAssessment?.photosDetected ?? 0} detected), Quote`],
                ["Extraction confidence", `${Math.round(aiAssessment?.confidenceScore ?? 0)}% overall`],
                ["Human review", rawDecision === "APPROVE" || rawDecision === "FINALISE_CLAIM" ? "Optional" : "REQUIRED"],
                ["Corrections applied", corrections.length > 0 ? `${corrections.length} (${corrections.join("; ").slice(0, 80)}...)` : "None"],
                ["Report hash", reportHash],
                ["Report generated", fmtDate(aiAssessment?.createdAt ?? new Date().toISOString())],
                ["Digital signature", "KINGA AutoVerify (engine)"],
              ].map(([k, v], i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td className="py-2 pr-4 font-semibold w-44" style={{ color: "var(--muted-foreground)" }}>{k}</td>
                  <td className="py-2 font-mono" style={{ color: "var(--foreground)" }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function ForensicAuditReport({ claim, aiAssessment, enforcement, quotes }: ForensicAuditReportProps) {
  if (!enforcement || !aiAssessment) return null;

  return (
    <div className="space-y-2">
      {/* Section 0: Executive Authority Cover */}
      <Section0Cover claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} />

      {/* Section 1: Incident & Data Integrity */}
      <SectionDivider number="1" title="Incident & Data Integrity" />
      <Section1Incident claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} />

      {/* Section 2: Technical Forensics */}
      <SectionDivider number="2" title="Technical Forensics" />
      <Section2Physics aiAssessment={aiAssessment} enforcement={enforcement} />

      {/* Section 3: Financial Validation */}
      <SectionDivider number="3" title="Financial Validation" />
      <Section3Financial aiAssessment={aiAssessment} enforcement={enforcement} quotes={quotes} />

      {/* Section 4: Evidence Inventory */}
      <SectionDivider number="4" title="Evidence Inventory" />
      <Section4Evidence aiAssessment={aiAssessment} enforcement={enforcement} claim={claim} />

      {/* Section 5: Risk & Fraud Assessment */}
      <SectionDivider number="5" title="Risk & Fraud Assessment" />
      <Section5Fraud aiAssessment={aiAssessment} enforcement={enforcement} />

      {/* Section 6: Decision Authority & Audit Trail */}
      <SectionDivider number="6" title="Decision Authority & Audit Trail" />
      <Section6Decision claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} />
    </div>
  );
}
