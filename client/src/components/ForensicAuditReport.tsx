/**
 * KINGA AutoVerify AI v4.2 — Forensic Audit Report
 *
 * 6-section forensic audit format:
 *   Section 0: Cover Page — Executive Authority Card
 *   Section 1: Incident & Data Integrity
 *   Section 2: Technical Forensics (Impact Physics + SVG Damage Map)
 *   Section 3: Financial Validation (Cost Waterfall + Parts Reconciliation)
 *   Section 4: Evidence Inventory (Photos + Documents)
 *   Section 5: Risk & Fraud Assessment (Gauge + Indicator Table)
 *   Section 6: Decision Authority & Audit Trail
 *
 * All colours use CSS variables — works in both light and dark mode.
 * All data paths verified against actual server output shapes.
 */

import React from "react";
import { CheckCircle, XCircle, AlertTriangle, Printer } from "lucide-react";

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
  if (n == null || isNaN(n) || n === 0) return "—";
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
  return map[d] ?? "#6b7280";
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
    <div className="flex items-center gap-3 mb-4 mt-6 print-section-divider">
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
    na:   { bg: "#f3f4f6", color: "#374151", border: "#d1d5db" },
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

// ─── Arc Gauge (SVG semicircle) ───────────────────────────────────────────────

function ArcGauge({ value, max = 100, label, size = 100 }: { value: number; max?: number; label?: string; size?: number }) {
  const pctVal = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pctVal >= 70 ? "#10b981" : pctVal >= 40 ? "#f59e0b" : "#ef4444";
  const r = 38;
  const cx = 50;
  const cy = 50;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - pctVal / 100);
  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 100 60" width={size} height={Math.round(size * 0.6)}>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="16" fontWeight="bold" fill={color}>
          {Math.round(pctVal)}%
        </text>
        {label && (
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize="7" fill="#6b7280">
            {label}
          </text>
        )}
      </svg>
    </div>
  );
}

// ─── SVG Vehicle Damage Map ───────────────────────────────────────────────────

// Severity levels: 0=undamaged, 1=minor, 2=moderate, 3=severe
type DamageSeverity = 0 | 1 | 2 | 3;

const SEVERITY_FILL: Record<DamageSeverity, string> = {
  0: "transparent",
  1: "#fef08a50",   // yellow-200 tint — minor
  2: "#fed7aa60",   // orange-200 tint — moderate
  3: "#fca5a560",   // red-300 tint — severe
};
const SEVERITY_STROKE: Record<DamageSeverity, string> = {
  0: "var(--border)",
  1: "#ca8a04",    // yellow-600
  2: "#ea580c",    // orange-600
  3: "#dc2626",    // red-600
};
const SEVERITY_LABEL: Record<DamageSeverity, string> = { 0: "Undamaged", 1: "Minor", 2: "Moderate", 3: "Severe" };

function inferSeverity(zoneId: string, damageZones: string[]): DamageSeverity {
  const norm = damageZones.map(z => z.toLowerCase());
  const hit = norm.some(z => z.includes(zoneId) || zoneId.includes(z.split(" ")[0]));
  if (!hit) return 0;
  const hasSevere = norm.some(z => z.includes(zoneId) && (z.includes("severe") || z.includes("major") || z.includes("crush") || z.includes("deploy")));
  const hasMinor  = norm.some(z => z.includes(zoneId) && (z.includes("minor") || z.includes("scratch") || z.includes("dent") || z.includes("chip")));
  if (hasSevere) return 3;
  if (hasMinor)  return 1;
  return 2; // default moderate when zone is hit but no qualifier
}

function VehicleDamageMap({ damageZones, incidentType }: { damageZones: string[]; incidentType: string }) {
  const zones = [
    { id: "front",     label: "Front",      x: 110, y: 8,   w: 100, h: 48 },
    { id: "rear",      label: "Rear",       x: 110, y: 224, w: 100, h: 48 },
    { id: "left",      label: "Left",       x: 8,   y: 78,  w: 44,  h: 124 },
    { id: "right",     label: "Right",      x: 268, y: 78,  w: 44,  h: 124 },
    { id: "roof",      label: "Roof",       x: 110, y: 56,  w: 100, h: 32 },
    { id: "cabin",     label: "Cabin",      x: 78,  y: 88,  w: 164, h: 88 },
    { id: "underbody", label: "Underbody",  x: 98,  y: 192, w: 124, h: 32 },
  ];

  const norm = (damageZones ?? []).map(z => z.toLowerCase());
  const frontHit = norm.some(z => /front|bonnet|bumper|hood|grill|headlight/.test(z));
  const rearHit  = norm.some(z => /rear|boot|trunk|taillight/.test(z));
  const leftHit  = norm.some(z => /left|driver/.test(z));
  const rightHit = norm.some(z => /right|passenger/.test(z));

  const zoneIdForSeverity = (id: string): string => {
    if (id === "front") return frontHit ? "front" : "";
    if (id === "rear")  return rearHit  ? "rear"  : "";
    if (id === "left")  return leftHit  ? "left"  : "";
    if (id === "right") return rightHit ? "right" : "";
    return id;
  };

  const getSeverity = (id: string): DamageSeverity => {
    const lookupId = zoneIdForSeverity(id);
    if (!lookupId) return 0;
    // For front/rear/left/right use keyword matching against full zone strings
    const relevant = norm.filter(z => {
      if (id === "front") return /front|bonnet|bumper|hood|grill|headlight/.test(z);
      if (id === "rear")  return /rear|boot|trunk|taillight/.test(z);
      if (id === "left")  return /left|driver/.test(z);
      if (id === "right") return /right|passenger/.test(z);
      return z.includes(id);
    });
    if (relevant.length === 0) return 0;
    if (relevant.some(z => /severe|major|crush|deploy/.test(z))) return 3;
    if (relevant.some(z => /minor|scratch|dent|chip/.test(z))) return 1;
    return 2;
  };

  const arrow = frontHit ? { x1: 160, y1: -5, x2: 160, y2: 20 }
    : rearHit  ? { x1: 160, y1: 285, x2: 160, y2: 260 }
    : leftHit  ? { x1: -5,  y1: 140, x2: 20,  y2: 140 }
    : rightHit ? { x1: 325, y1: 140, x2: 295, y2: 140 }
    : null;

  const usedSeverities = ([1, 2, 3] as DamageSeverity[]).filter(s =>
    zones.some(z => getSeverity(z.id) === s)
  );

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 320 280" width="200" height="175" style={{ maxWidth: "100%" }}>
        <defs>
          <marker id="dmg-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <polygon points="0 0, 6 3, 0 6" fill="#f97316" />
          </marker>
        </defs>
        {/* Vehicle body */}
        <rect x="76" y="52" width="168" height="176" rx="20"
          fill="var(--muted)" stroke="var(--border)" strokeWidth="2" />
        {/* Windscreen */}
        <rect x="92" y="62" width="136" height="52" rx="8"
          fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" opacity="0.8" />
        {/* Rear window */}
        <rect x="92" y="166" width="136" height="48" rx="8"
          fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" opacity="0.8" />
        {/* Wheels */}
        {([[62,72],[62,188],[238,72],[238,188]] as [number,number][]).map(([wx,wy],i) => (
          <rect key={i} x={wx} y={wy} width="20" height="36" rx="6"
            fill="var(--foreground)" opacity="0.25" />
        ))}
        {/* Damage zones */}
        {zones.map(zone => {
          const sev = getSeverity(zone.id);
          return (
            <g key={zone.id}>
              <rect
                x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="5"
                fill={SEVERITY_FILL[sev]}
                stroke={SEVERITY_STROKE[sev]}
                strokeWidth={sev > 0 ? 2 : 1}
                strokeDasharray={sev === 0 ? "4 3" : undefined}
              />
              <text
                x={zone.x + zone.w / 2} y={zone.y + zone.h / 2 + 4}
                textAnchor="middle" fontSize="9"
                fill={sev > 0 ? SEVERITY_STROKE[sev] : "var(--muted-foreground)"}
                fontWeight={sev > 0 ? "bold" : "normal"}
              >
                {zone.label}
              </text>
            </g>
          );
        })}
        {/* Impact arrow */}
        {arrow && (
          <line
            x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2}
            stroke="#f97316" strokeWidth="3.5"
            markerEnd="url(#dmg-arrow)"
          />
        )}
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs mt-1 justify-center">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded" style={{ border: "1px dashed var(--border)" }} />
          <span style={{ color: "var(--muted-foreground)" }}>Undamaged</span>
        </span>
        {([1,2,3] as DamageSeverity[]).map(s => (
          <span key={s} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded" style={{ background: SEVERITY_FILL[s], border: `1px solid ${SEVERITY_STROKE[s]}` }} />
            <span style={{ color: "var(--muted-foreground)" }}>{SEVERITY_LABEL[s]}</span>
          </span>
        ))}
        {arrow && (
          <span className="flex items-center gap-1">
            <span style={{ color: "#f97316" }}>→</span>
            <span style={{ color: "var(--muted-foreground)" }}>Impact</span>
          </span>
        )}
      </div>
      {/* Active severity summary */}
      {usedSeverities.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 justify-center">
          {zones.filter(z => getSeverity(z.id) > 0).map(z => {
            const s = getSeverity(z.id);
            return (
              <span key={z.id} className="text-xs px-2 py-0.5 rounded font-medium"
                style={{ background: SEVERITY_FILL[s], color: SEVERITY_STROKE[s], border: `1px solid ${SEVERITY_STROKE[s]}` }}>
                {z.label}: {SEVERITY_LABEL[s]}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Section 0: Executive Authority Cover ────────────────────────────────────

function Section0Cover({ claim, aiAssessment, enforcement, quotes }: { claim: any; aiAssessment: any; enforcement: any; quotes?: any[] }) {
  const e = enforcement;
  const phase2 = (e as any)?._phase2 as any;
  const wf = e?.weightedFraud;

  const rawDecision: string = phase2?.finalDecision ?? e?.finalDecision?.decision ?? "REVIEW";
  const fraudScore = wf?.score ?? 0;
  const physicsScore = phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0;

  const ce = e?.costExtraction;
  const aiEstimate = ce?.ai_estimate ?? aiAssessment?.estimatedCost ?? 0;
  const photosDetected = aiAssessment?.photosDetected ?? 0;
  const photoStatus = phase2?.photoAnalysis?.photoStatus ?? "NOT_APPLICABLE";

  const keyDrivers: string[] = phase2?.keyDrivers ?? e?.finalDecision?.recommendedActions ?? [];
  const primaryReason: string = e?.finalDecision?.primaryReason ?? phase2?.keyDrivers?.[0] ?? "";
  const dataCompleteness = phase2?.dataCompleteness ?? 0;

  const incidentDate = claim?.incidentDate ?? aiAssessment?.incidentDate;
  const reportDate = aiAssessment?.createdAt ?? new Date().toISOString();

  const decisionColor = decisionColour(rawDecision);
  const decisionText = decisionLabel(rawDecision);

  return (
    <div className="mb-6 rounded-xl overflow-hidden report-cover-card"
      style={{ border: `2px solid ${decisionColor}`, background: "var(--card)" }}>
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between"
        style={{ background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
            KINGA AutoVerify AI v4.2 · Forensic Audit Report
          </p>
          <p className="text-base font-bold mt-0.5" style={{ color: "var(--foreground)" }}>
            {[claim?.vehicleMake, claim?.vehicleModel, claim?.vehicleYear].filter(Boolean).join(" ") || "Vehicle Claim"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Claim: <span className="font-semibold" style={{ color: "var(--foreground)" }}>{claim?.claimNumber ?? "—"}</span>
            </p>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Reg: <span className="font-semibold" style={{ color: "var(--foreground)" }}>{claim?.vehicleRegistration ?? "—"}</span>
            </p>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{fmtDate(reportDate)}</p>
          </div>
          <button
            onClick={() => window.print()}
            className="no-print flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            <Printer className="h-3.5 w-3.5" />
            Print / PDF
          </button>
        </div>
      </div>

      {/* Decision pill */}
      <div className="px-5 py-4 flex items-center gap-4"
        style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="px-4 py-2 rounded-lg font-bold text-sm tracking-wide"
          style={{ background: `${decisionColor}20`, color: decisionColor, border: `1px solid ${decisionColor}` }}>
          DECISION: {decisionText}
          {fraudScore > 0 && ` · Fraud Risk ${Math.round(fraudScore)}/100`}
        </div>
        {primaryReason && (
          <p className="text-xs flex-1" style={{ color: "var(--muted-foreground)" }}>{primaryReason}</p>
        )}
      </div>

      {/* 3 metric tiles */}
      <div className="grid grid-cols-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="px-4 py-3" style={{ borderRight: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>Physics Consistency</p>
          <ArcGauge value={physicsScore} size={90} />
          <StatusBadge status={physicsScore >= 30 ? "pass" : "warn"} label={physicsScore >= 70 ? "CONSISTENT" : physicsScore >= 30 ? "MINOR ANOMALY" : "ANOMALY"} />
        </div>
        <div className="px-4 py-3" style={{ borderRight: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>AI Cost Estimate</p>
          <p className="text-2xl font-bold mt-2" style={{ color: "var(--foreground)" }}>{fmtUsd(aiEstimate)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
            {ce?.source === "extracted" ? "Extracted from documents" : ce?.source === "estimated" ? "AI estimated" : "Severity-based estimate"}
          </p>
          <StatusBadge
            status={(ce?.confidence ?? 0) >= 70 ? "pass" : (ce?.confidence ?? 0) >= 40 ? "warn" : "info"}
            label={`${Math.round(ce?.confidence ?? 0)}% confidence`}
          />
        </div>
        <div className="px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>Evidence</p>
          <p className="text-2xl font-bold mt-2" style={{ color: "var(--foreground)" }}>
            {photosDetected > 0 ? `${photosDetected} photos` : "No photos"}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
            {photoStatus === "SYSTEM_FAILURE" ? "⚠ System error (not claimant fault)" :
             photoStatus === "ANALYSED" ? "Successfully processed" :
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
        <StatusBadge status={physicsScore >= 30 ? "pass" : "warn"} label="Physics" />
        <StatusBadge status={photoStatus === "ANALYSED" ? "pass" : photoStatus === "SYSTEM_FAILURE" ? "warn" : "na"} label="Photos" />
      </div>

      {/* Timeline */}
      <div className="px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--muted-foreground)" }}>Timeline</p>
        <div className="flex items-center">
          {[
            { label: "INCIDENT", date: incidentDate },
            { label: "INSPECTION", date: aiAssessment?.assessmentDate },
            { label: "QUOTE", date: claim?.createdAt },
            { label: "REPORT", date: reportDate },
          ].map((item, i, arr) => (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div className="w-3 h-3 rounded-full" style={{ background: "var(--primary)" }} />
                <p className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{item.label}</p>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{fmtDate(item.date)}</p>
              </div>
              {i < arr.length - 1 && <div className="flex-1 h-px mx-2" style={{ background: "var(--border)" }} />}
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
  const description = aiAssessment?.incidentDescription ?? claim?.incidentDescription ?? null;
  const corrections: string[] = phase1?.allCorrections ?? [];
  const gates: any[] = phase1?.gates ?? [];
  const dataCompleteness = phase2?.dataCompleteness ?? 0;

  const checklist = [
    { label: "Incident type identified", ok: incidentType !== "N/A" && incidentType !== "unknown", detail: incidentType.replace(/_/g, " ") },
    { label: "Cost data present", ok: !!(normalised?.costs?.totalUsd ?? aiAssessment?.estimatedCost), detail: fmtUsd(normalised?.costs?.totalUsd ?? aiAssessment?.estimatedCost) },
    { label: "Photos submitted", ok: !!(aiAssessment?.photosDetected), detail: aiAssessment?.photosDetected ? `${aiAssessment.photosDetected} detected` : "None" },
    { label: "Police report", ok: !!(aiAssessment?.policeReportNumber), detail: aiAssessment?.policeReportNumber ?? "Not provided" },
    { label: "Cost corrections applied", ok: corrections.length > 0 || !!(normalised?.costs?.totalUsd), detail: corrections.length > 0 ? `${corrections.length} correction(s)` : "None needed" },
  ];

  return (
    <div className="mb-4 space-y-4">
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Incident Facts</p>
        </div>
        <div className="p-4">
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Incident type", <span className="font-semibold">{incidentType.replace(/_/g, " ")}</span>],
                ["Claimed speed", claimedSpeed != null ? `${claimedSpeed} km/h` : "Not stated"],
                ["Location", aiAssessment?.incidentLocation ?? claim?.incidentLocation ?? "Not recorded"],
                ["Incident date", fmtDate(claim?.incidentDate ?? aiAssessment?.incidentDate)],
                ["Inspection date", fmtDate(aiAssessment?.assessmentDate)],
                ["Assessor", aiAssessment?.assessorName ?? "Not assigned"],
                ["Repairer", aiAssessment?.panelBeaterName ?? claim?.repairerName ?? "Not specified"],
                ["Policy number", claim?.policyNumber ?? "Not provided"],
                ["Vehicle VIN", claim?.vehicleVin ?? aiAssessment?.vehicleVin ?? "Not recorded"],
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

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Data Completeness</p>
          <ArcGauge value={dataCompleteness} size={60} />
        </div>
        <div className="p-4 space-y-2">
          {checklist.map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {item.ok
                  ? <CheckCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "#10b981" }} />
                  : <XCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "#ef4444" }} />}
                <span className="text-xs" style={{ color: "var(--foreground)" }}>{item.label}</span>
              </div>
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{item.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {corrections.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: "#f59e0b" }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>
              Phase 1 Auto-Corrections ({corrections.length})
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

      {gates.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
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
                      <StatusBadge status={g.status === "PASS" ? "pass" : g.status === "WARN" ? "warn" : "fail"} label={g.status ?? "UNKNOWN"} />
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
  const phase2 = (e as any)?._phase2 as any;
  const physicsScore = phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0;
  const constraints: any[] = phase2?.physicsConstraints ?? [];
  const incidentType = phase2?.incidentType ?? aiAssessment?.incidentType ?? "unknown";

  const deltaV = pe?.deltaVKmh ?? 0;
  const claimedSpeed = (aiAssessment as any)?._normalised?.physics?.claimedSpeedKmh ?? aiAssessment?.claimedSpeedKmh ?? 0;
  const energyKj = pe?.estimatedEnergyKj ?? 0;
  const vehicleMassKg = pe?.vehicleMassKg ?? null;
  const severity = pe?.accidentSeverity ?? aiAssessment?.structuralDamageSeverity ?? "unknown";

  const damageZones: string[] = e?.directionFlag?.damageZones ?? [];
  const directionMismatch = e?.directionFlag?.mismatch ?? false;
  const directionExplanation = e?.directionFlag?.explanation ?? "";
  const consistencyExplanation = e?.consistencyFlag?.explanation ?? "";
  const anomalyLevel = e?.consistencyFlag?.anomalyLevel ?? "none";

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
      notes: "Rollovers produce roof and door frame damage. Airbag deployment is expected above 25 km/h lateral velocity.",
    },
    HAIL: {
      expected: ["Panel dents (bonnet, roof, boot)", "Windscreen chips/cracks", "No structural deformation"],
      notes: "Hail damage is characterised by distributed panel dents without structural deformation.",
    },
    THEFT: {
      expected: ["Ignition damage", "Door lock damage", "Window breakage (forced entry)"],
      notes: "Theft claims require evidence of forced entry. Absence of entry damage is a key fraud indicator.",
    },
  };

  const normalised = incidentType.toUpperCase().replace(/ /g, "_");
  const pattern = incidentPatterns[normalised] ?? {
    expected: ["Damage consistent with stated incident type"],
    notes: `Pattern analysis for ${incidentType.replace(/_/g, " ")} not available.`,
  };

  return (
    <div className="mb-4 space-y-4">
      {/* 2.1 Impact Physics */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>2.1 Impact Physics</p>
          <StatusBadge status={physicsScore >= 70 ? "pass" : physicsScore >= 30 ? "warn" : "fail"} label={`${Math.round(physicsScore)}% consistent`} />
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <table className="w-full text-xs">
                <tbody>
                  {[
                    ["Delta-V (calculated)", deltaV > 0 ? `${deltaV} km/h` : "N/A"],
                    ["Claimed speed", claimedSpeed > 0 ? `${claimedSpeed} km/h` : "Not stated"],
                    ["Impact energy", energyKj > 0 ? `${fmt(energyKj, 1)} kJ` : "N/A"],
                    ["Vehicle mass", vehicleMassKg ? `${vehicleMassKg} kg` : "N/A"],
                    ["Accident severity", severity.replace(/_/g, " ")],
                    ["Incident type", incidentType.replace(/_/g, " ")],
                  ].map(([k, v], i) => (
                    <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                      <td className="py-1.5 pr-3 font-semibold" style={{ color: "var(--muted-foreground)" }}>{k}</td>
                      <td className="py-1.5 font-mono" style={{ color: "var(--foreground)" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col items-center justify-center">
              <ArcGauge value={physicsScore} size={110} label="Physics consistency" />
              <p className="text-xs text-center mt-1" style={{ color: "var(--muted-foreground)" }}>
                {physicsScore >= 70 ? "Damage consistent with stated incident" :
                 physicsScore >= 30 ? "Minor inconsistencies detected" :
                 "Significant anomaly — engineering review required"}
              </p>
            </div>
          </div>

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
            </div>
          )}

          {directionExplanation && (
            <div className="p-2 rounded-lg text-xs" style={{
              background: directionMismatch ? "#fef3c7" : "#d1fae5",
              border: `1px solid ${directionMismatch ? "#fcd34d" : "#6ee7b7"}`,
              color: directionMismatch ? "#92400e" : "#065f46",
            }}>
              {directionMismatch ? "⚠ Direction mismatch: " : "✓ Direction consistent: "}{directionExplanation}
            </div>
          )}
        </div>
      </div>

      {/* 2.2 Damage Consistency + SVG Map */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>2.2 Damage Consistency & Zone Map</p>
          <StatusBadge
            status={physicsScore >= 70 ? "pass" : physicsScore >= 30 ? "warn" : "fail"}
            label={anomalyLevel === "none" ? "CONSISTENT" : anomalyLevel.toUpperCase()}
          />
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Damage Zone Map</p>
              <VehicleDamageMap damageZones={damageZones} incidentType={incidentType} />
              {damageZones.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {damageZones.map((z, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded"
                      style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }}>{z}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>
                Expected vs Observed ({incidentType.replace(/_/g, " ")})
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                    <th className="text-left px-2 py-1.5 font-semibold" style={{ color: "var(--muted-foreground)" }}>Expected</th>
                    <th className="text-left px-2 py-1.5 font-semibold" style={{ color: "var(--muted-foreground)" }}>Match</th>
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
                        <td className="px-2 py-1.5" style={{ color: "var(--foreground)" }}>{item}</td>
                        <td className="px-2 py-1.5">
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
          </div>

          {consistencyExplanation && (
            <p className="text-xs mb-4 p-2 rounded" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
              {consistencyExplanation}
            </p>
          )}

          {constraints.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Physics Constraint Status</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Constraint</th>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Status</th>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {constraints.map((c: any, i: number) => (
                      <>
                        <tr key={`c-${i}`} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                          <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>{c.constraint}</td>
                          <td className="px-3 py-2">
                            <StatusBadge status={c.suppressed ? "warn" : "pass"} label={c.suppressed ? "SUPPRESSED" : "ACTIVE"} />
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={c.suppressed ? "warn" : "pass"} label={c.suppressed ? "⚠ advisory" : "✅ pass"} />
                          </td>
                        </tr>
                        {c.advisory && (
                          <tr key={`a-${i}`} style={{ background: c.suppressed ? "#fffbeb" : "var(--muted)" }}>
                            <td colSpan={3} className="px-3 pb-2 pt-0">
                              <div className="flex items-start gap-1.5 text-xs rounded px-2 py-1.5"
                                style={{
                                  background: c.suppressed ? "#fef3c740" : "var(--muted)",
                                  border: `1px solid ${c.suppressed ? "#fcd34d" : "var(--border)"}`,
                                  color: c.suppressed ? "#92400e" : "var(--muted-foreground)",
                                }}>
                                <span style={{ color: c.suppressed ? "#f59e0b" : "#6b7280", flexShrink: 0 }}>{c.suppressed ? "⚠" : "ℹ"}</span>
                                <span>{c.advisory}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <p className="text-xs mt-3 p-2 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
            {pattern.notes}
          </p>
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

  const aiEstimate = ce?.ai_estimate ?? normalised?.costs?.totalUsd ?? aiAssessment?.estimatedCost ?? 0;
  const aiParts = ce?.parts ?? aiAssessment?.estimatedPartsCost ?? 0;
  const aiLabour = ce?.labour ?? aiAssessment?.estimatedLaborCost ?? 0;
  const fairMin = ce?.fair_range?.min ?? e?.costBenchmark?.estimatedFairMin ?? 0;
  const fairMax = ce?.fair_range?.max ?? e?.costBenchmark?.estimatedFairMax ?? 0;
  const itemisedParts: any[] = ce?.itemised_parts ?? [];

  const pbQuotes = (quotes ?? []).map((q: any) => ({
    name: q.panelBeaterName ?? "Panel Beater",
    total: (q.quotedAmount ?? 0) / 100,
    parts: (q.partsCost ?? 0) / 100,
    labour: (q.laborCost ?? 0) / 100,
    status: q.status ?? "submitted",
    lineItems: q.lineItems ?? [],
  }));

  const primaryQuote = pbQuotes[0];
  const quotedTotal = primaryQuote?.total ?? 0;
  const quotedParts = primaryQuote?.parts ?? 0;
  const quotedLabour = primaryQuote?.labour ?? 0;

  const variance = (a: number, b: number) => a > 0 && b > 0 ? ((a - b) / b) * 100 : null;
  const totalVar = variance(quotedTotal, aiEstimate);
  const partsVar = variance(quotedParts, aiParts);
  const labourVar = variance(quotedLabour, aiLabour);

  const verdict = e?.costVerdict?.verdict ?? (
    aiEstimate > 0 && fairMax > 0
      ? aiEstimate > fairMax * 1.15 ? "OVERPRICED" : aiEstimate < fairMin * 0.85 ? "UNDERPRICED" : "FAIR"
      : "FAIR"
  );

  const corrections: string[] = (aiAssessment as any)?._phase1?.allCorrections ?? [];
  const costCorrections = corrections.filter(c => c.toLowerCase().includes("cost") || c.toLowerCase().includes("$") || c.toLowerCase().includes("amount"));

  return (
    <div className="mb-4 space-y-4">
      {/* Cost waterfall */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Cost Waterfall</p>
          <StatusBadge status={verdict === "FAIR" ? "pass" : verdict === "OVERPRICED" ? "fail" : "info"} label={verdict} />
        </div>
        <div className="p-4">
          {/* Step-down SVG waterfall */}
          {(() => {
            const steps = [
              { label: "Repairer Quote",    value: quotedTotal, color: "#f59e0b", show: quotedTotal > 0 },
              { label: "AI Estimate",       value: aiEstimate,  color: "#3b82f6", show: aiEstimate > 0 },
              { label: "Fair Range Min",    value: fairMin,     color: "#10b981", show: fairMin > 0 },
              { label: "Fair Range Max",    value: fairMax,     color: "#6b7280", show: fairMax > 0 },
            ].filter(s => s.show);
            if (steps.length === 0) return null;
            const maxVal = Math.max(...steps.map(s => s.value), 1);
            const svgW = 480;
            const svgH = 160;
            const barH = 28;
            const labelW = 110;
            const chartW = svgW - labelW - 60;
            const yStep = (svgH - barH) / Math.max(steps.length - 1, 1);
            return (
              <div className="mb-4 overflow-x-auto">
                <svg viewBox={`0 0 ${svgW} ${svgH + 20}`} width="100%" style={{ minWidth: 320 }}>
                  {/* Fair range band */}
                  {fairMin > 0 && fairMax > 0 && (() => {
                    const x1 = labelW + (fairMin / maxVal) * chartW;
                    const x2 = labelW + (fairMax / maxVal) * chartW;
                    return (
                      <rect x={x1} y={0} width={x2 - x1} height={svgH}
                        fill="#10b98118" stroke="#10b98140" strokeWidth="1" strokeDasharray="4 3" />
                    );
                  })()}
                  {steps.map((step, i) => {
                    const barW = Math.max(4, (step.value / maxVal) * chartW);
                    const y = i * yStep;
                    const nextStep = steps[i + 1];
                    const nextBarW = nextStep ? Math.max(4, (nextStep.value / maxVal) * chartW) : null;
                    const nextY = nextStep ? (i + 1) * yStep : null;
                    return (
                      <g key={i}>
                        {/* Connector line to next step */}
                        {nextBarW != null && nextY != null && (
                          <line
                            x1={labelW + barW} y1={y + barH / 2}
                            x2={labelW + nextBarW} y2={nextY + barH / 2}
                            stroke="var(--border)" strokeWidth="1.5" strokeDasharray="4 3"
                          />
                        )}
                        {/* Bar */}
                        <rect x={labelW} y={y} width={barW} height={barH} rx="4"
                          fill={step.color} opacity="0.85" />
                        {/* Label */}
                        <text x={labelW - 6} y={y + barH / 2 + 4}
                          textAnchor="end" fontSize="10" fill="var(--muted-foreground)">{step.label}</text>
                        {/* Value */}
                        <text x={labelW + barW + 6} y={y + barH / 2 + 4}
                          fontSize="10" fontWeight="bold" fill="var(--foreground)">{fmtUsd(step.value)}</text>
                      </g>
                    );
                  })}
                  {/* Fair range label */}
                  {fairMin > 0 && fairMax > 0 && (
                    <text x={labelW + (fairMin / maxVal) * chartW + 4} y={svgH + 14}
                      fontSize="9" fill="#10b981">Fair range</text>
                  )}
                </svg>
              </div>
            );
          })()}
          {/* Reconciliation table */}
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Cost Reconciliation Summary</p>
          <table className="w-full text-xs mb-3">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                {["Category", "AI Estimate", "Quoted (Repairer)", "Variance", "Verdict"].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { cat: "Parts", ai: aiParts, quoted: quotedParts, v: partsVar },
                { cat: "Labour", ai: aiLabour, quoted: quotedLabour, v: labourVar },
                { cat: "Total", ai: aiEstimate, quoted: quotedTotal, v: totalVar },
              ].map((row, i) => {
                const vStatus: "pass" | "warn" | "fail" | "na" = row.v == null ? "na" : Math.abs(row.v) <= 15 ? "pass" : Math.abs(row.v) <= 30 ? "warn" : "fail";
                const vLabel = row.v == null ? "N/A" : `${row.v > 0 ? "+" : ""}${Math.round(row.v)}%`;
                return (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)", background: i === 2 ? "var(--muted)" : "var(--background)", fontWeight: i === 2 ? "bold" : undefined }}>
                    <td className="px-3 py-2" style={{ color: "var(--foreground)" }}>{row.cat}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>{fmtUsd(row.ai)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>{row.quoted > 0 ? fmtUsd(row.quoted) : "—"}</td>
                    <td className="px-3 py-2"><StatusBadge status={vStatus} label={vLabel} /></td>
                    <td className="px-3 py-2">
                      <StatusBadge
                        status={row.v == null ? "na" : Math.abs(row.v) <= 15 ? "pass" : Math.abs(row.v) <= 30 ? "warn" : "fail"}
                        label={row.v == null ? "N/A" : Math.abs(row.v) <= 15 ? "WITHIN RANGE" : Math.abs(row.v) <= 30 ? "REVIEW" : "OUTLIER"}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {fairMin > 0 && fairMax > 0 && (
            <div className="p-2 rounded text-xs" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
              Fair range benchmark: {fmtUsd(fairMin)} – {fmtUsd(fairMax)} · AI estimate is{" "}
              {aiEstimate < fairMin ? "below" : aiEstimate > fairMax ? "above" : "within"} the benchmark range.
            </div>
          )}
        </div>
      </div>

      {/* Itemised parts */}
      {itemisedParts.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Itemised Parts & Labour Breakdown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  {["Component", "AI Parts", "AI Labour", "AI Total", "Quoted", "Variance", "Source"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itemisedParts.map((part: any, i: number) => {
                  const matchingLine = (primaryQuote?.lineItems ?? []).find((li: any) =>
                    li.description?.toLowerCase().includes(part.component?.toLowerCase()?.split(" ")[0])
                  );
                  const quotedPartCost = matchingLine ? (matchingLine.lineTotal ?? 0) / 100 : null;
                  const v = quotedPartCost != null && part.total > 0 ? ((quotedPartCost - part.total) / part.total) * 100 : null;
                  return (
                    <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>{part.component}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>{fmtUsd(part.parts_cost)}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>{fmtUsd(part.labour_cost)}</td>
                      <td className="px-3 py-2 font-mono font-semibold" style={{ color: "var(--foreground)" }}>{fmtUsd(part.total)}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>{quotedPartCost != null ? fmtUsd(quotedPartCost) : "—"}</td>
                      <td className="px-3 py-2">
                        {v != null ? <StatusBadge status={Math.abs(v) <= 20 ? "pass" : Math.abs(v) <= 40 ? "warn" : "fail"} label={`${v > 0 ? "+" : ""}${Math.round(v)}%`} /> : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={part.source === "extracted" ? "pass" : "info"} label={part.source === "extracted" ? "Extracted" : "Estimated"} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", background: "var(--muted)" }}>
                  <td className="px-3 py-2 font-bold" style={{ color: "var(--foreground)" }}>TOTAL</td>
                  <td className="px-3 py-2 font-mono font-bold" style={{ color: "var(--foreground)" }}>{fmtUsd(itemisedParts.reduce((s: number, p: any) => s + (p.parts_cost ?? 0), 0))}</td>
                  <td className="px-3 py-2 font-mono font-bold" style={{ color: "var(--foreground)" }}>{fmtUsd(itemisedParts.reduce((s: number, p: any) => s + (p.labour_cost ?? 0), 0))}</td>
                  <td className="px-3 py-2 font-mono font-bold" style={{ color: "var(--foreground)" }}>{fmtUsd(itemisedParts.reduce((s: number, p: any) => s + (p.total ?? 0), 0))}</td>
                  <td className="px-3 py-2 font-mono font-bold" style={{ color: "var(--foreground)" }}>{quotedTotal > 0 ? fmtUsd(quotedTotal) : "—"}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Multiple quotes */}
      {pbQuotes.length > 1 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>All Repairer Quotes</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  {["Repairer", "Parts", "Labour", "Total", "vs AI Estimate", "Status"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pbQuotes.map((q, i) => {
                  const v = aiEstimate > 0 ? ((q.total - aiEstimate) / aiEstimate) * 100 : null;
                  return (
                    <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>{q.name}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>{q.parts > 0 ? fmtUsd(q.parts) : "—"}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>{q.labour > 0 ? fmtUsd(q.labour) : "—"}</td>
                      <td className="px-3 py-2 font-mono font-semibold" style={{ color: "var(--foreground)" }}>{fmtUsd(q.total)}</td>
                      <td className="px-3 py-2">{v != null ? <StatusBadge status={Math.abs(v) <= 15 ? "pass" : Math.abs(v) <= 30 ? "warn" : "fail"} label={`${v > 0 ? "+" : ""}${Math.round(v)}%`} /> : "—"}</td>
                      <td className="px-3 py-2"><StatusBadge status={q.status === "accepted" ? "pass" : q.status === "rejected" ? "fail" : "info"} label={q.status.toUpperCase()} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {costCorrections.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: "#f59e0b" }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Cost Auto-Corrections ({costCorrections.length})</p>
          </div>
          <div className="p-4 space-y-1">
            {costCorrections.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--foreground)" }}>
                <span className="font-mono font-bold" style={{ color: "#f59e0b" }}>{i + 1}.</span>{c}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section 4: Evidence Inventory ───────────────────────────────────────────

function Section4Evidence({ aiAssessment, enforcement, claim }: { aiAssessment: any; enforcement: any; claim: any }) {
  const phase2 = (enforcement as any)?._phase2 as any;
  const photoStatus = phase2?.photoAnalysis?.photoStatus ?? "NOT_APPLICABLE";
  const photosDetected = aiAssessment?.photosDetected ?? 0;
  const photosProcessed = aiAssessment?.photosProcessedCount ?? 0;
  const photoUrls: string[] = aiAssessment?.photoUrls ?? aiAssessment?.processedPhotoUrls ?? [];
  const photoFraudPoints = phase2?.photoAnalysis?.fraudPointsAdded ?? 0;
  const isSystemFailure = photoStatus === "SYSTEM_FAILURE";

  const docs = [
    { id: "Claim Form", type: "Primary", extracted: true, note: "Submitted by claimant" },
    { id: "Police Report", type: "Supporting", extracted: !!(aiAssessment?.policeReportNumber), note: aiAssessment?.policeReportNumber ? `Case: ${aiAssessment.policeReportNumber}` : "Not provided" },
    { id: "Repair Quote", type: "Financial", extracted: !!(aiAssessment?.estimatedCost), note: aiAssessment?.estimatedCost ? `${fmtUsd(aiAssessment.estimatedCost)} extracted` : "Not submitted" },
    { id: "Photos", type: "Visual", extracted: photosDetected > 0, note: isSystemFailure ? "SYSTEM ERROR — not claimant fault" : photosDetected > 0 ? `${photosDetected} detected, ${photosProcessed} processed` : "Not submitted" },
    { id: "Driver Licence", type: "Identity", extracted: !!(claim?.driverLicenseNumber ?? aiAssessment?.driverLicenseNumber), note: claim?.driverLicenseNumber ?? aiAssessment?.driverLicenseNumber ?? "Not recorded" },
    { id: "Vehicle Registration", type: "Identity", extracted: !!(claim?.vehicleRegistration), note: claim?.vehicleRegistration ?? "Not recorded" },
    { id: "Witness Statement", type: "Supporting", extracted: false, note: "Optional" },
  ];

  return (
    <div className="mb-4 space-y-4">
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Photo Evidence</p>
          <StatusBadge status={photoStatus === "ANALYSED" ? "pass" : photoStatus === "SYSTEM_FAILURE" ? "warn" : "na"} label={photoStatus.replace(/_/g, " ")} />
        </div>
        <div className="p-4">
          <div className="grid grid-cols-3 gap-4 mb-3">
            {[
              { label: "Detected", value: photosDetected },
              { label: "Processed", value: photosProcessed },
              { label: "Fraud points", value: isSystemFailure ? "0 (adj)" : photoFraudPoints },
            ].map((m, i) => (
              <div key={i} className="text-center p-2 rounded" style={{ background: "var(--muted)" }}>
                <p className="text-lg font-bold" style={{ color: "var(--foreground)" }}>{m.value}</p>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{m.label}</p>
              </div>
            ))}
          </div>
          {isSystemFailure && (
            <div className="p-2 rounded text-xs mb-2" style={{ background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e" }}>
              <strong>⚠ System error</strong> — Photo ingestion failed due to a pipeline error. NOT attributed to the claimant. Photo-related fraud points excluded from score.
            </div>
          )}
          {photoStatus === "CLAIMANT_OMISSION" && (
            <div className="p-2 rounded text-xs mb-2" style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b" }}>
              <strong>❌ Photos not provided</strong> — Claimant did not submit photo evidence. Contributes to fraud risk score.
            </div>
          )}
          {photoStatus === "ANALYSED" && (
            <div className="p-2 rounded text-xs mb-2" style={{ background: "#d1fae5", border: "1px solid #6ee7b7", color: "#065f46" }}>
              <strong>✓ Photos analysed</strong> — {photosProcessed} of {photosDetected} photos successfully processed.
            </div>
          )}
          {photoUrls.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Photo Grid</p>
              <div className="grid grid-cols-3 gap-2">
                {photoUrls.slice(0, 9).map((url, i) => (
                  <div key={i} className="aspect-square rounded overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--muted)" }}>
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
              {photoUrls.length > 9 && <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>+{photoUrls.length - 9} more images</p>}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Document Extraction Table</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                {["Document", "Type", "Extracted", "Note"].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((doc, i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>{doc.id}</td>
                  <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{doc.type}</td>
                  <td className="px-3 py-2"><StatusBadge status={doc.extracted ? "pass" : "fail"} label={doc.extracted ? "YES" : "NO"} /></td>
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
  const phase2 = (e as any)?._phase2 as any;

  const fraudScore = wf?.score ?? 0;
  const fraudLevel = wf?.level ?? "minimal";
  const fraudLabel = wf?.explanation ?? fraudLevel;
  const fraudColor = fraudScore >= 70 ? "#ef4444" : fraudScore >= 40 ? "#f59e0b" : "#10b981";
  const fraudBand = fraudScore >= 70 ? "HIGH RISK" : fraudScore >= 40 ? "MODERATE RISK" : "LOW RISK";

  const contributions: any[] = wf?.full_contributions ?? wf?.contributions ?? [];
  const photoStatus = phase2?.photoAnalysis?.photoStatus ?? "NOT_APPLICABLE";
  const isSystemFailure = photoStatus === "SYSTEM_FAILURE";
  const advisories: string[] = phase2?.advisories ?? [];
  const keyDrivers: string[] = phase2?.keyDrivers ?? [];
  const physicsScore = phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0;

  return (
    <div className="mb-4 space-y-4">
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${fraudColor}40`, background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Overall Fraud Risk Score</p>
          <StatusBadge status={fraudScore >= 70 ? "fail" : fraudScore >= 40 ? "warn" : "pass"} label={fraudBand} />
        </div>
        <div className="p-4">
          <div className="flex items-center gap-6 mb-4">
            <div className="flex flex-col items-center">
              <div className="text-5xl font-black" style={{ color: fraudColor }}>{Math.round(fraudScore)}</div>
              <div className="text-xs font-semibold" style={{ color: fraudColor }}>/100</div>
            </div>
            <ArcGauge value={fraudScore} size={110} label="Fraud risk" />
            <div className="flex-1">
              <p className="text-sm font-bold" style={{ color: fraudColor }}>{fraudBand}</p>
              <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{fraudLabel}</p>
              <div className="mt-2 space-y-1">
                {[
                  { label: "0–39: LOW", color: "#10b981" },
                  { label: "40–69: MODERATE", color: "#f59e0b" },
                  { label: "70–100: HIGH", color: "#ef4444" },
                ].map(b => (
                  <div key={b.label} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{ background: b.color }} />
                    <span style={{ color: "var(--muted-foreground)" }}>{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="h-3 rounded-full mb-1" style={{ background: "var(--muted)" }}>
            <div className="h-3 rounded-full" style={{ width: `${Math.min(100, fraudScore)}%`, background: "linear-gradient(90deg, #10b981, #f59e0b, #ef4444)" }} />
          </div>
          <div className="flex justify-between text-xs" style={{ color: "var(--muted-foreground)" }}>
            <span>0 — Low</span><span>40 — Moderate</span><span>70 — High</span><span>100</span>
          </div>
        </div>
      </div>

      {contributions.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>
              Indicator Breakdown {isSystemFailure ? "(system errors excluded from score)" : ""}
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
                    photo: isSystemFailure ? "SYSTEM ERROR — not counted in fraud score" : "Request additional photo evidence from claimant",
                    speed: "Engineering review of Delta-V calculation recommended",
                    seatbelt: "Physical inspection of seatbelt retractor and ECU download",
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
                      <td className="px-3 py-2 font-bold" style={{ color: scoreColor }}>{isExcluded ? "0 (adj)" : `${score}/20`}</td>
                      <td className="px-3 py-2"><StatusBadge status={c.triggered && !isExcluded ? "fail" : "pass"} label={c.triggered && !isExcluded ? "YES" : "NO"} /></td>
                      <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{mitigation}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${fraudColor}40`, background: "var(--card)" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Final Risk Statement</p>
        </div>
        <div className="p-4">
          <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
            {fraudScore >= 70 ? `High fraud risk (${Math.round(fraudScore)}/100) detected. ` :
             fraudScore >= 40 ? `Moderate fraud risk (${Math.round(fraudScore)}/100) identified. ` :
             `Low fraud risk (${Math.round(fraudScore)}/100). `}
            {physicsScore < 30 ? `Physics consistency is critically low at ${Math.round(physicsScore)}%, indicating a significant anomaly requiring engineering review. ` :
             physicsScore < 70 ? `Physics consistency of ${Math.round(physicsScore)}% is below the expected threshold and warrants further investigation. ` :
             `Physics consistency of ${Math.round(physicsScore)}% is within acceptable parameters. `}
            {keyDrivers.length > 0 ? `Key drivers: ${keyDrivers.slice(0, 2).join("; ")}.` : "No specific key drivers identified."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Section 6: Decision Authority & Audit Trail ─────────────────────────────

function Section6Decision({ claim, aiAssessment, enforcement }: { claim: any; aiAssessment: any; enforcement: any }) {
  const e = enforcement;
  const phase2 = (e as any)?._phase2 as any;

  const rawDecision: string = phase2?.finalDecision ?? e?.finalDecision?.decision ?? "REVIEW";
  const decisionColor = decisionColour(rawDecision);
  const decisionText = decisionLabel(rawDecision);

  const keyDrivers: string[] = phase2?.keyDrivers ?? e?.finalDecision?.recommendedActions ?? [];
  const primaryReason: string = e?.finalDecision?.primaryReason ?? phase2?.keyDrivers?.[0] ?? "";
  const blocked: string[] = e?.finalDecision?.blockedActions ?? [];
  const nextSteps: string[] = phase2?.nextSteps ?? e?.finalDecision?.recommendedActions ?? [];
  const ruleTrace: any[] = e?.ruleTrace ?? e?.finalDecision?.ruleTrace ?? [];
  const corrections: string[] = (aiAssessment as any)?._phase1?.allCorrections ?? [];
  const engineVersion = aiAssessment?.engineVersion ?? "4.2";

  const fraudScore = e?.weightedFraud?.score ?? 0;
  const physicsScore = phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0;
  const dataCompleteness = phase2?.dataCompleteness ?? 0;

  const reportHash = (() => {
    const seed = [rawDecision, String(physicsScore), String(fraudScore), String(aiAssessment?.estimatedCost ?? 0), aiAssessment?.id ?? ""].join("|");
    let h = 0;
    for (let i = 0; i < seed.length; i++) { h = ((h << 5) - h) + seed.charCodeAt(i); h |= 0; }
    return `#${Math.abs(h).toString(16).padStart(8, "0").toUpperCase()}`;
  })();

  // Gates: pass/fail only — no threshold values exposed to adjusters
  const gates = [
    { id: "G1", label: "Physics Consistency", result: `${Math.round(physicsScore)}%`, pass: physicsScore >= 30 },
    { id: "G2", label: "Fraud Risk Score", result: Math.round(fraudScore), pass: fraudScore < 70 },
    { id: "G3", label: "Data Completeness", result: `${Math.round(dataCompleteness)}%`, pass: dataCompleteness >= 50 },
    { id: "G4", label: "Critical Blockers", result: blocked.length === 0 ? "None" : `${blocked.length} found`, pass: blocked.length === 0 },
  ];

  // SVG flowchart dimensions
  const nodeW = 160;
  const nodeH = 44;
  const diamondW = 180;
  const diamondH = 52;
  const gapY = 60;
  const startX = 200;
  const totalNodes = gates.length + 2; // start + 4 gates + final
  const svgH = (totalNodes) * (diamondH + gapY) + 60;
  const svgW = 420;

  // Helper: diamond path centred at (cx, cy)
  const diamond = (cx: number, cy: number, w: number, h: number) =>
    `M ${cx} ${cy - h / 2} L ${cx + w / 2} ${cy} L ${cx} ${cy + h / 2} L ${cx - w / 2} ${cy} Z`;

  // Helper: rect path centred at (cx, cy)
  const rect = (cx: number, cy: number, w: number, h: number, r = 6) => {
    const x = cx - w / 2; const y = cy - h / 2;
    return `M ${x + r},${y} H ${x + w - r} Q ${x + w},${y} ${x + w},${y + r} V ${y + h - r} Q ${x + w},${y + h} ${x + w - r},${y + h} H ${x + r} Q ${x},${y + h} ${x},${y + h - r} V ${y + r} Q ${x},${y} ${x + r},${y} Z`;
  };

  const passColor = "#10b981";
  const failColor = "#ef4444";
  const nodeColor = "var(--muted)";
  const textColor = "var(--foreground)";
  const mutedColor = "var(--muted-foreground)";

  // Y positions for each row
  const rowY = (i: number) => 40 + i * (diamondH + gapY);

  return (
    <div className="mb-4 space-y-4">
      {/* SVG Decision Flowchart */}
      <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${decisionColor}`, background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Decision Flowchart</p>
          <div className="px-3 py-1.5 rounded font-bold text-sm"
            style={{ background: `${decisionColor}20`, color: decisionColor, border: `1px solid ${decisionColor}` }}>
            {decisionText}
          </div>
        </div>
        <div className="p-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            width="100%"
            style={{ maxWidth: svgW, display: "block", margin: "0 auto" }}
            aria-label="Decision flowchart"
          >
            {/* START node */}
            <path d={rect(startX, rowY(0), nodeW, nodeH)} fill={nodeColor} stroke="var(--border)" strokeWidth="1.5" />
            <text x={startX} y={rowY(0)} textAnchor="middle" dominantBaseline="middle"
              fontSize="11" fontWeight="700" fill={textColor}>START ASSESSMENT</text>

            {/* Arrow from START to G1 */}
            <line x1={startX} y1={rowY(0) + nodeH / 2} x2={startX} y2={rowY(1) - diamondH / 2 - 4}
              stroke="var(--border)" strokeWidth="1.5" markerEnd="url(#arrow)" />

            {/* Gate nodes */}
            {gates.map((gate, i) => {
              const cy = rowY(i + 1);
              const gateColor = gate.pass ? passColor : failColor;
              const nextY = rowY(i + 2);
              const isLast = i === gates.length - 1;
              return (
                <g key={gate.id}>
                  {/* Diamond */}
                  <path d={diamond(startX, cy, diamondW, diamondH)}
                    fill={`${gateColor}18`} stroke={gateColor} strokeWidth="1.5" />
                  {/* Gate ID */}
                  <text x={startX} y={cy - 9} textAnchor="middle" dominantBaseline="middle"
                    fontSize="9" fontWeight="700" fill={gateColor}>{gate.id}</text>
                  {/* Gate label */}
                  <text x={startX} y={cy + 4} textAnchor="middle" dominantBaseline="middle"
                    fontSize="10" fontWeight="600" fill={textColor}>{gate.label}</text>
                  {/* Result value */}
                  <text x={startX} y={cy + 17} textAnchor="middle" dominantBaseline="middle"
                    fontSize="9" fontFamily="monospace" fill={gateColor}>{String(gate.result)}</text>

                  {/* PASS label on arrow down */}
                  {!isLast && (
                    <>
                      <line x1={startX} y1={cy + diamondH / 2} x2={startX} y2={nextY - diamondH / 2 - 4}
                        stroke={gate.pass ? passColor : "var(--border)"} strokeWidth="1.5"
                        strokeDasharray={gate.pass ? undefined : "4 3"}
                        markerEnd="url(#arrow)" />
                      <text x={startX + 6} y={(cy + diamondH / 2 + nextY - diamondH / 2) / 2}
                        fontSize="9" fill={gate.pass ? passColor : mutedColor} fontWeight="600">
                        {gate.pass ? "PASS" : "FAIL"}
                      </text>
                    </>
                  )}

                  {/* FAIL side branch (right arrow to ESCALATE box) */}
                  {!gate.pass && (
                    <>
                      <line x1={startX + diamondW / 2} y1={cy} x2={startX + diamondW / 2 + 30} y2={cy}
                        stroke={failColor} strokeWidth="1.5" markerEnd="url(#arrowRed)" />
                      <rect x={startX + diamondW / 2 + 31} y={cy - 12} width={80} height={24} rx="4"
                        fill={`${failColor}18`} stroke={failColor} strokeWidth="1" />
                      <text x={startX + diamondW / 2 + 71} y={cy} textAnchor="middle" dominantBaseline="middle"
                        fontSize="9" fontWeight="700" fill={failColor}>{decisionText}</text>
                    </>
                  )}

                  {/* Arrow from last gate to FINAL */}
                  {isLast && (
                    <line x1={startX} y1={cy + diamondH / 2} x2={startX} y2={rowY(gates.length + 1) - nodeH / 2 - 4}
                      stroke={gate.pass ? passColor : "var(--border)"} strokeWidth="1.5"
                      strokeDasharray={gate.pass ? undefined : "4 3"}
                      markerEnd="url(#arrow)" />
                  )}
                </g>
              );
            })}

            {/* FINAL DECISION node */}
            <path d={rect(startX, rowY(gates.length + 1), nodeW + 20, nodeH)}
              fill={`${decisionColor}20`} stroke={decisionColor} strokeWidth="2" />
            <text x={startX} y={rowY(gates.length + 1) - 7} textAnchor="middle" dominantBaseline="middle"
              fontSize="9" fill={decisionColor} fontWeight="600">FINAL DECISION</text>
            <text x={startX} y={rowY(gates.length + 1) + 7} textAnchor="middle" dominantBaseline="middle"
              fontSize="13" fontWeight="800" fill={decisionColor}>{decisionText}</text>

            {/* Arrow markers */}
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
                <path d="M0,0 L0,8 L8,4 Z" fill="var(--border)" />
              </marker>
              <marker id="arrowRed" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
                <path d="M0,0 L0,8 L8,4 Z" fill={failColor} />
              </marker>
            </defs>
          </svg>
        </div>
      </div>

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
                   b === "REJECT" ? "REJECT — no evidence of malicious intent" : b}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {ruleTrace.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Rule Trace</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  {["Rule", "Observed Value", "Triggered"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ruleTrace.map((r: any, i: number) => (
                  <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                    <td className="px-3 py-2 font-mono" style={{ color: "var(--primary)" }}>{r.rule}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>{String(r.value)}</td>
                    <td className="px-3 py-2"><StatusBadge status={r.triggered ? "fail" : "pass"} label={r.triggered ? "YES" : "NO"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                ["Corrections applied", corrections.length > 0 ? `${corrections.length} correction(s)` : "None"],
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

      <div className="rounded-xl p-4 text-center" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--foreground)" }}>KINGA AutoVerify AI</p>
        <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Engine v{engineVersion} · Report {reportHash} · {fmtDate(aiAssessment?.createdAt ?? new Date().toISOString())}</p>
        <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
          This report is generated by an AI system and is intended to assist human adjusters. All decisions require human review and authorisation. KINGA AutoVerify AI does not constitute legal advice.
        </p>
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function ForensicAuditReport({ claim, aiAssessment, enforcement, quotes }: ForensicAuditReportProps) {
  if (!enforcement || !aiAssessment) return null;

  return (
    <div className="space-y-2">
      <Section0Cover claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} quotes={quotes} />

      <SectionDivider number="1" title="Incident & Data Integrity" />
      <Section1Incident claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} />

      <SectionDivider number="2" title="Technical Forensics" />
      <Section2Physics aiAssessment={aiAssessment} enforcement={enforcement} />

      <SectionDivider number="3" title="Financial Validation" />
      <Section3Financial aiAssessment={aiAssessment} enforcement={enforcement} quotes={quotes} />

      <SectionDivider number="4" title="Evidence Inventory" />
      <Section4Evidence aiAssessment={aiAssessment} enforcement={enforcement} claim={claim} />

      <SectionDivider number="5" title="Risk & Fraud Assessment" />
      <Section5Fraud aiAssessment={aiAssessment} enforcement={enforcement} />

      <SectionDivider number="6" title="Decision Authority & Audit Trail" />
      <Section6Decision claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} />
    </div>
  );
}
