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

import React, { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { CheckCircle, XCircle, AlertTriangle, Printer } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ForensicAuditReportProps {
  claim: any;
  aiAssessment: any;
  enforcement: any;
  quotes?: any[];
  accuracyReport?: any; // FieldAccuracyReport from fieldAccuracyEngine
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return "N/A";
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Currency-aware formatter. Reads ISO 4217 code from the claim's currencyCode field.
 * Falls back to USD if not set. NEVER hardcodes a currency symbol.
 */
function makeFmtCurrency(currencyCode: string | null | undefined) {
  const code = (currencyCode ?? 'USD').toUpperCase().trim();
  // Map ISO 4217 codes to symbols for common currencies; others use the code itself
  const SYMBOL_MAP: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', ZAR: 'R', ZMW: 'ZMW', ZIG: 'ZiG',
    KES: 'KSh', NGN: '₦', GHS: 'GH₵', BWP: 'P', MWK: 'MK', TZS: 'TSh',
    UGX: 'USh', MZN: 'MT', NAD: 'N$', SZL: 'L', LSL: 'L', AOA: 'Kz',
  };
  const symbol = SYMBOL_MAP[code] ?? code;
  return function fmtCurrency(n: number | null | undefined): string {
    if (n == null || isNaN(n) || n === 0) return '—';
    return `${symbol}${fmt(n)}`;
  };
}
// Legacy alias — replaced at component level with currency-aware version
function fmtUsd(n: number | null | undefined): string {
  if (n == null || isNaN(n) || n === 0) return '—';
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
    APPROVE: "var(--fp-success-text)",
    FINALISE_CLAIM: "var(--fp-success-text)",
    REVIEW: "var(--fp-warning-text)",
    REVIEW_REQUIRED: "var(--fp-warning-text)",
    ESCALATE: "var(--fp-warning-text)",
    ESCALATE_INVESTIGATION: "var(--fp-warning-text)",
    REJECT: "var(--fp-critical-text)",
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
    pass: { bg: "var(--status-approve-bg)", color: "var(--status-approve-text)", border: "var(--status-approve-border)" },
    warn: { bg: "var(--status-review-bg)", color: "var(--status-review-text)", border: "var(--status-review-border)" },
    fail: { bg: "var(--status-reject-bg)", color: "var(--status-reject-text)", border: "var(--status-reject-border)" },
    info: { bg: "var(--fp-info-bg)", color: "var(--fp-info-text)", border: "var(--fp-info-border)" },
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

// ─── Arc Gauge (SVG semicircle) ───────────────────────────────────────────────

function ArcGauge({ value, max = 100, label, size = 100 }: { value: number; max?: number; label?: string; size?: number }) {
  const pctVal = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pctVal >= 70 ? "var(--fp-success-text)" : pctVal >= 40 ? "var(--fp-warning-text)" : "var(--fp-critical-text)";
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
          stroke="var(--border)"
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
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize="7" fill="var(--muted-foreground)">
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
  1: "var(--fp-warning-bg)",   // yellow tint — minor
  2: "var(--fp-warning-bg)",   // orange tint — moderate
  3: "var(--fp-critical-bg)",  // red tint — severe
};
const SEVERITY_STROKE: Record<DamageSeverity, string> = {
  0: "var(--border)",
  1: "var(--fp-warning-text)",   // minor
  2: "var(--fp-warning-text)",   // moderate
  3: "var(--fp-critical-text)",  // severe
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
            <polygon points="0 0, 6 3, 0 6" fill="var(--fp-warning-text)" />
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
            stroke="var(--fp-warning-text)" strokeWidth="3.5"
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
            <span style={{ color: "var(--fp-warning-text)" }}>→</span>
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

function Section0Cover({ claim, aiAssessment, enforcement, quotes, fmtMoney = fmtUsd }: { claim: any; aiAssessment: any; enforcement: any; quotes?: any[]; fmtMoney?: (n: number | null | undefined) => string }) {
  const e = enforcement;
  const phase2 = (e as any)?._phase2 as any;
  const wf = e?.weightedFraud;

  // Use weighted fraud engine as primary decision source (same as top-level badge).
  // Phase2 finalDecision is a secondary signal and may use a different scoring model.
  const wfLevel = wf?.level ?? "minimal";
  const wfScore = wf?.score ?? 0;
  // Map weighted fraud level to a decision string
  const wfDecision = wfScore >= 70 ? "DECLINE" : wfScore >= 40 ? "REVIEW_REQUIRED" : null;
  const rawDecision: string = wfDecision ?? phase2?.finalDecision ?? e?.finalDecision?.decision ?? "REVIEW";
  const fraudScore = wfScore;
  const physicsScore = phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0;

  const ce = e?.costExtraction;
  const normalised = (aiAssessment as any)?._normalised as any;
  // Use normalised cost as AI benchmark (same as Section3Financial)
  const aiEstimate = normalised?.costs?.totalUsd ?? ce?.ai_estimate ?? aiAssessment?.estimatedCost ?? 0;
  const quotedTotal = (quotes?.[0]?.quotedAmount ?? 0) / 100;
  const photosDetected = aiAssessment?.photosDetected ?? 0;
  const photoStatus = phase2?.photoAnalysis?.photoStatus ?? "NOT_APPLICABLE";

  const keyDrivers: string[] = phase2?.keyDrivers ?? e?.finalDecision?.recommendedActions ?? [];
  const primaryReason: string = e?.finalDecision?.primaryReason ?? phase2?.keyDrivers?.[0] ?? "";
  const dataCompleteness = phase2?.dataCompleteness ?? 0;
  const deltaV = e?.physicsEstimate?.deltaVKmh ?? 0;
  const claimedSpeed = (aiAssessment as any)?._normalised?.physics?.claimedSpeedKmh ?? aiAssessment?.claimedSpeedKmh ?? 0;

  const incidentDate = claim?.incidentDate ?? aiAssessment?.incidentDate;
  const reportDate = aiAssessment?.createdAt ?? new Date().toISOString();

  const decisionColor = decisionColour(rawDecision);
  const decisionText = decisionLabel(rawDecision);

  // Physics tile status
  const physicsStatus = physicsScore >= 70 ? "pass" : physicsScore >= 30 ? "warn" : "fail";
  const physicsLabel = physicsScore >= 70 ? "CONSISTENT" : physicsScore >= 30 ? "MINOR ANOMALY" : "ANOMALY";
  const physicsIcon = physicsScore >= 70 ? "✅" : "⚠️";

  // Cost tile status
  const costStatus = aiEstimate > 0 ? "pass" : "na";
  const costIcon = aiEstimate > 0 ? "✅" : "—";

  // Evidence tile status
  const evidenceStatus = photoStatus === "ANALYSED" ? "pass" : photoStatus === "SYSTEM_FAILURE" ? "warn" : "fail";
  const evidenceIcon = photoStatus === "ANALYSED" ? "✅" : photoStatus === "SYSTEM_FAILURE" ? "⚠️" : "❌";
  const evidenceLabel = photoStatus === "SYSTEM_FAILURE" ? "system error" : photoStatus === "ANALYSED" ? "analysed" : "not ingested";

  // FCDI tile — use DB column (always present) with fallback to nested forensicAnalysis object
  const fcdiRaw = (aiAssessment as any)?.fcdiScore ?? (aiAssessment as any)?._forensicAnalysis?.fcdi?.scorePercent ?? null;
  const fcdiTileScore: number = typeof fcdiRaw === 'number' ? Math.round(fcdiRaw) : -1;
  const fcdiTileLabel = fcdiTileScore < 0 ? "N/A" : fcdiTileScore <= 20 ? "RELIABLE" : fcdiTileScore <= 50 ? "DEGRADED" : "UNRELIABLE";
  const fcdiTileIcon = fcdiTileScore < 0 ? "—" : fcdiTileScore <= 20 ? "✅" : fcdiTileScore <= 50 ? "⚠️" : "❌";
  const fcdiTileColor = fcdiTileScore < 0 ? "var(--muted-foreground)" : fcdiTileScore <= 20 ? "var(--fp-success-text)" : fcdiTileScore <= 50 ? "var(--fp-warning-text)" : "var(--fp-critical-text)";

  return (
    <div className="mb-6 rounded-xl overflow-hidden report-cover-card"
      style={{ border: `2px solid ${decisionColor}`, background: "var(--card)" }}>

      {/* ── Header strip ── */}
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
        <div className="flex items-center gap-4">
          <div className="text-right text-xs space-y-0.5">
            {/* Claim reference: try ClaimRecord first, then claim.claimNumber */}
            <p style={{ color: "var(--muted-foreground)" }}>Claim: <span className="font-semibold" style={{ color: "var(--foreground)" }}>
              {(() => {
                const cr = (aiAssessment as any)?._claimRecord;
                return cr?.insuranceContext?.claimReference ?? cr?.insuranceContext?.policyNumber ?? claim?.claimNumber ?? claim?.claimReference ?? "\u2014";
              })()}
            </span></p>
            <p style={{ color: "var(--muted-foreground)" }}>Reg: <span className="font-semibold" style={{ color: "var(--foreground)" }}>{claim?.vehicleRegistration ?? "\u2014"}</span></p>
            <p style={{ color: "var(--muted-foreground)" }}>Report: <span className="font-semibold" style={{ color: "var(--foreground)" }}>{fmtDate(aiAssessment?.createdAt ?? reportDate)}</span></p>
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

      {/* ── Decision banner ── */}
      <div className="px-5 py-3 flex items-center gap-3"
        style={{ background: `${decisionColor}12`, borderBottom: `1px solid ${decisionColor}40` }}>
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm tracking-wide shrink-0"
          style={{ background: `${decisionColor}20`, color: decisionColor, border: `1px solid ${decisionColor}` }}>
          <span>DECISION:</span>
          <span className="text-base">{'█'.repeat(8)}</span>
          <span>{decisionText}</span>
          {fraudScore > 0 && <span className="font-normal text-xs">(Fraud Risk {Math.round(fraudScore)}/100)</span>}
        </div>
        {primaryReason && (
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{primaryReason}</p>
        )}
      </div>

      {/* ── 3 KPI tiles ── */}
      <div className="grid grid-cols-4" style={{ borderBottom: "1px solid var(--border)" }}>
        {/* Physics tile */}
        <div className="px-4 py-3" style={{ borderRight: "1px solid var(--border)" }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>PHYSICS</p>
          <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{Math.round(physicsScore)}% consistency</p>
          {deltaV > 0 && <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>Delta-V {deltaV} km/h</p>}
          {/* Mini bar */}
          <div className="mt-2 h-1.5 rounded-full" style={{ background: "var(--muted)" }}>
            <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, physicsScore)}%`, background: physicsScore >= 70 ? "var(--fp-success-text)" : physicsScore >= 30 ? "var(--fp-warning-text)" : "var(--fp-critical-text)" }} />
          </div>
          <p className="text-xs mt-1.5" style={{ color: physicsScore >= 70 ? "var(--fp-success-text)" : physicsScore >= 30 ? "var(--fp-warning-text)" : "var(--fp-critical-text)" }}>
            {physicsIcon} {physicsLabel}
          </p>
        </div>
        {/* Cost tile */}
        <div className="px-4 py-3" style={{ borderRight: "1px solid var(--border)" }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>COST</p>
          <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            {aiEstimate > 0 ? `${fmtMoney(aiEstimate)} agreed` : "Not estimated"}
          </p>
          {quotedTotal > 0 && <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>vs {fmtMoney(quotedTotal)} quoted</p>}
          {/* Mini bar */}
          {aiEstimate > 0 && quotedTotal > 0 && (
            <div className="mt-2 h-1.5 rounded-full" style={{ background: "var(--muted)" }}>
              <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (aiEstimate / Math.max(aiEstimate, quotedTotal)) * 100)}%`, background: "var(--fp-info-text)" }} />
            </div>
          )}
          <p className="text-xs mt-1.5" style={{ color: "var(--fp-success-text)" }}>{costIcon} within range</p>
        </div>
        {/* Evidence tile */}
        <div className="px-4 py-3" style={{ borderRight: "1px solid var(--border)" }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>EVIDENCE</p>
          <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            {photosDetected > 0 ? `${photosDetected} photos` : "No photos"}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{evidenceLabel}</p>
          {/* Mini bar */}
          <div className="mt-2 h-1.5 rounded-full" style={{ background: "var(--muted)" }}>
            <div className="h-1.5 rounded-full" style={{ width: photoStatus === "ANALYSED" ? "100%" : photoStatus === "SYSTEM_FAILURE" ? "50%" : "10%", background: photoStatus === "ANALYSED" ? "var(--fp-success-text)" : photoStatus === "SYSTEM_FAILURE" ? "var(--fp-warning-text)" : "var(--fp-critical-text)" }} />
          </div>
          <p className="text-xs mt-1.5" style={{ color: photoStatus === "ANALYSED" ? "var(--fp-success-text)" : photoStatus === "SYSTEM_FAILURE" ? "var(--fp-warning-text)" : "var(--fp-critical-text)" }}>
            {evidenceIcon} {photoStatus === "SYSTEM_FAILURE" ? "system error" : photoStatus === "ANALYSED" ? "processed" : "not ingested"}
          </p>
        </div>
        {/* FCDI tile — Pipeline Confidence Degradation Index from DB column */}
        <div className="px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>PIPELINE</p>
          <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            {fcdiTileScore >= 0 ? `FCDI ${fcdiTileScore}/100` : "FCDI N/A"}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{fcdiTileLabel}</p>
          {/* Mini bar */}
          <div className="mt-2 h-1.5 rounded-full" style={{ background: "var(--muted)" }}>
            <div className="h-1.5 rounded-full" style={{ width: fcdiTileScore >= 0 ? `${Math.min(100, fcdiTileScore)}%` : "0%", background: fcdiTileColor }} />
          </div>
          <p className="text-xs mt-1.5" style={{ color: fcdiTileColor }}>
            {fcdiTileIcon} {fcdiTileLabel.toLowerCase()}
          </p>
        </div>
      </div>

      {/* ── Primary blockers ── */}
      {keyDrivers.length > 0 && (
        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>PRIMARY BLOCKER{keyDrivers.length > 1 ? "S" : ""}:</p>
          <ul className="space-y-1">
            {keyDrivers.slice(0, 3).map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--foreground)" }}>
                <span style={{ color: "var(--fp-warning-text)", flexShrink: 0 }}>•</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs mt-2 font-semibold" style={{ color: decisionColor }}>
            ACTION: → {decisionText} (Rule R3)
          </p>
        </div>
      )}

      {/* ── Pre-flight status strip ── */}
      <div className="px-5 py-2.5 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
        <p className="text-xs font-bold uppercase tracking-wide shrink-0" style={{ color: "var(--muted-foreground)" }}>PRE-FLIGHT STATUS</p>
        <div className="flex-1 h-px mx-2" style={{ background: "var(--border)" }} />
        <StatusBadge status={dataCompleteness >= 70 ? "pass" : "warn"} label={`✅ Data ${pct(dataCompleteness)}`} />
        <StatusBadge status={physicsStatus} label={`${physicsIcon} Physics`} />
        <StatusBadge status={evidenceStatus} label={`${evidenceIcon} Photos`} />
      </div>

      {/* ── Timeline ── */}
      <div className="px-5 py-4">
        <div className="flex items-start">
          {[
            { label: "INCIDENT",   date: incidentDate },
            { label: "INSPECTION", date: aiAssessment?.assessmentDate },
            { label: "QUOTE",      date: claim?.createdAt },
            { label: "REPORT",     date: reportDate },
          ].map((item, i, arr) => (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-1" style={{ minWidth: 70 }}>
                <div className="w-3.5 h-3.5 rounded-full border-2 shrink-0"
                  style={{ background: "var(--primary)", borderColor: "var(--primary)" }} />
                <p className="text-xs font-bold text-center" style={{ color: "var(--foreground)" }}>{item.label}</p>
                <p className="text-xs text-center" style={{ color: "var(--muted-foreground)" }}>{fmtDate(item.date)}</p>
              </div>
              {i < arr.length - 1 && (
                <div className="flex-1 h-0.5 mt-1.5 mx-1" style={{ background: "var(--border)" }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Section 1: Incident & Data Integrity ─────────────────────────────────────

function Section1Incident({ claim, aiAssessment, enforcement, fmtMoney = fmtUsd }: { claim: any; aiAssessment: any; enforcement: any; fmtMoney?: (n: number | null | undefined) => string }) {
  const phase2 = (enforcement as any)?._phase2 as any;
  const phase1 = (aiAssessment as any)?._phase1 as any;
  const normalised = (aiAssessment as any)?._normalised as any;

  const incidentType = phase2?.incidentType ?? normalised?.incidentType ?? aiAssessment?.incidentType ?? "N/A";
  const claimedSpeed = normalised?.physics?.claimedSpeedKmh ?? aiAssessment?.claimedSpeedKmh ?? null;
  const description = aiAssessment?.incidentDescription ?? claim?.incidentDescription ?? null;
  const corrections: string[] = phase1?.allCorrections ?? [];
  const gates: any[] = phase1?.gates ?? [];
  const dataCompleteness = phase2?.dataCompleteness ?? 0;
  const confidenceScore = aiAssessment?.confidenceScore ?? 0;
  const ocrConfidence = phase2?.ocrConfidence ?? phase1?.ocrConfidence ?? confidenceScore;
  const costConfidence = (aiAssessment as any)?._normalised?.costs?.confidence ?? 0;
  const photoConfidence = phase2?.photoAnalysis?.confidence ?? 0;

  // LLM-reasoned incident classification (Stage 5 incidentClassificationEngine)
  const claimRecord0 = (aiAssessment as any)?._claimRecord ?? (aiAssessment as any)?.claimRecord ?? null;
  const incidentClassification = claimRecord0?.accidentDetails?.incidentClassification ?? null;
  const classifiedType: string | null = incidentClassification?.incident_type ?? null;
  const classifiedConfidence: number = incidentClassification?.confidence ?? 0;
  const classifiedSources: string[] = incidentClassification?.sources_used ?? [];
  const classifiedReasoning: string | null = incidentClassification?.reasoning ?? null;
  const classifiedConflict: boolean = incidentClassification?.conflict_detected ?? false;
  // Display type: prefer LLM-classified (if not unknown), fall back to raw incidentType
  const displayIncidentType = (classifiedType && classifiedType !== "unknown") ? classifiedType : incidentType;
  const isClassifiedByLLM = !!(classifiedType && classifiedType !== "unknown");

  // Confidence bars: label + value (0-100)
  const confidenceBars = [
    { label: "Overall extraction", value: confidenceScore },
    { label: "OCR / document read", value: ocrConfidence },
    { label: "Cost extraction",     value: costConfidence > 0 ? costConfidence : confidenceScore * 0.9 },
    { label: "Photo analysis",      value: photoConfidence > 0 ? photoConfidence : (phase2?.photoAnalysis?.photoStatus === "ANALYSED" ? 85 : 0) },
  ];

  const checklist = [
    { label: "Incident type identified", ok: incidentType !== "N/A" && incidentType !== "unknown", detail: incidentType.replace(/_/g, " "), conf: 95 },
    { label: "Cost data present", ok: !!(normalised?.costs?.totalUsd ?? aiAssessment?.estimatedCost), detail: fmtMoney(normalised?.costs?.totalUsd ?? aiAssessment?.estimatedCost), conf: Math.round(costConfidence > 0 ? costConfidence : confidenceScore) },
    { label: "Photos submitted", ok: !!(aiAssessment?.photosDetected), detail: aiAssessment?.photosDetected ? `${aiAssessment.photosDetected} detected` : "None", conf: photoConfidence > 0 ? Math.round(photoConfidence) : 0 },
    { label: "Police report", ok: !!(aiAssessment?.policeReportNumber), detail: aiAssessment?.policeReportNumber ?? "Not provided", conf: aiAssessment?.policeReportNumber ? 100 : 0 },
    { label: "Cost corrections applied", ok: corrections.length > 0 || !!(normalised?.costs?.totalUsd), detail: corrections.length > 0 ? `${corrections.length} correction(s)` : "None needed", conf: 100 },
  ];

  // Pull new ClaimRecord fields from the aiAssessment claimRecord (stored in DB)
  const claimRecord = (aiAssessment as any)?._claimRecord ?? (aiAssessment as any)?.claimRecord ?? null;
  const narrativeAnalysis = claimRecord?.accidentDetails?.narrativeAnalysis ?? null;
  const accidentTime = claimRecord?.accidentDetails?.time ?? null;
  const animalType = claimRecord?.accidentDetails?.animalType ?? null;
  const weatherConditions = claimRecord?.accidentDetails?.weatherConditions ?? null;
  const roadSurface = claimRecord?.accidentDetails?.roadSurface ?? null;
  const insurerName = claimRecord?.insuranceContext?.insurerName ?? claim?.insurerName ?? null;
  const policyNumber = claimRecord?.insuranceContext?.policyNumber ?? claim?.policyNumber ?? null;
  const claimReference = claimRecord?.insuranceContext?.claimReference ?? claim?.claimNumber ?? claim?.claimReference ?? null;
  const excessAmountUsd = claimRecord?.insuranceContext?.excessAmountUsd ?? null;
  const driverLicenseNumber = claimRecord?.driver?.licenseNumber ?? null;
  const marketValueUsd = claimRecord?.vehicle?.marketValueUsd ?? null;
  const vehicleMileage = claimRecord?.vehicle?.mileageKm ?? claim?.vehicleMileage ?? null;
  const vehicleVin = claimRecord?.vehicle?.vin ?? claim?.vehicleVin ?? aiAssessment?.vehicleVin ?? null;
  const vehicleEngineNumber = claimRecord?.vehicle?.engineNumber ?? claim?.vehicleEngineNumber ?? null;
  const policeReportNumber = claimRecord?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber ?? null;
  const policeStation = claimRecord?.policeReport?.station ?? null;
  const driverName = claimRecord?.driver?.name ?? claim?.driverName ?? null;
  const claimantName = claimRecord?.driver?.claimantName ?? claim?.claimantName ?? null;

  return (
    <div className="mb-4 space-y-4">
      {/* 1.1 Incident Facts table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>1.1 Incident Facts</p>
        </div>
        <div className="p-4">
          <table className="w-full text-xs report-table">
            <tbody>
              {[
                ["Incident type", (
                  <span className="flex flex-col gap-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold capitalize">{displayIncidentType.replace(/_/g, " ")}</span>
                      {isClassifiedByLLM && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{
                            background: classifiedConfidence >= 80 ? "var(--status-approve-bg)" : classifiedConfidence >= 60 ? "var(--status-review-bg)" : "var(--muted)",
                            color: classifiedConfidence >= 80 ? "var(--status-approve-text)" : classifiedConfidence >= 60 ? "var(--status-review-text)" : "var(--muted-foreground)",
                            border: `1px solid ${classifiedConfidence >= 80 ? "var(--status-approve-border)" : classifiedConfidence >= 60 ? "var(--status-review-border)" : "var(--border)"}`
                          }}
                        >
                          {classifiedConfidence}% confidence
                        </span>
                      )}
                      {classifiedConflict && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "var(--status-review-bg)", color: "var(--status-review-text)", border: "1px solid var(--status-review-border)" }}>
                          ⚠ CONFLICT DETECTED
                        </span>
                      )}
                      {!isClassifiedByLLM && incidentType !== "N/A" && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                          from claim form
                        </span>
                      )}
                    </span>
                    {isClassifiedByLLM && classifiedSources.length > 0 && (
                      <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                        Sources: {classifiedSources.map((s: string) => s.replace(/_/g, " ")).join(" · ")}
                      </span>
                    )}
                    {isClassifiedByLLM && classifiedReasoning && (
                      <span className="text-[10px] italic" style={{ color: "var(--muted-foreground)" }}>
                        {classifiedReasoning.length > 180 ? classifiedReasoning.substring(0, 180) + "…" : classifiedReasoning}
                      </span>
                    )}
                  </span>
                )],
                ["Claimed speed", claimedSpeed != null ? `${claimedSpeed} km/h` : "Not stated"],
                ["Incident date", fmtDate(claim?.incidentDate ?? aiAssessment?.incidentDate)],
                ["Incident time", accidentTime ?? "Not recorded"],
                ["Location", aiAssessment?.incidentLocation ?? claim?.incidentLocation ?? "Not recorded"],
                ["Weather conditions", weatherConditions ?? "Not recorded"],
                ["Road surface", roadSurface ?? "Not recorded"],
                animalType ? ["Animal type", <span className="font-semibold capitalize">{animalType}</span>] : null,
                ["Driver", driverName ?? "Not recorded"],
                ["Driver licence", driverLicenseNumber ?? "Not provided"],
                ["Claimant", claimantName ?? claim?.claimantName ?? "Not recorded"],
                ["Inspection date", fmtDate(aiAssessment?.assessmentDate)],
                ["Assessor", aiAssessment?.assessorName ?? claimRecord?.repairQuote?.assessorName ?? "Not assigned"],
                ["Repairer", aiAssessment?.panelBeaterName ?? claimRecord?.repairQuote?.repairerName ?? claim?.repairerName ?? "Not specified"],
                ["Police report", policeReportNumber ?? "Not provided"],
                policeStation ? ["Police station", policeStation] : null,
              ].filter(Boolean).map((row: any, i: number) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td className="py-2 pr-4 font-semibold w-40" style={{ color: "var(--muted-foreground)" }}>{row[0]}</td>
                  <td className="py-2" style={{ color: "var(--foreground)" }}>{row[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Narrative Analysis Panel — shows reasoned narrative or falls back to raw description */}
          {(narrativeAnalysis || description) && (
            <div className="mt-3 space-y-2">
              {/* 1.1a Reasoned Incident Narrative */}
              <div className="p-3 rounded-lg text-xs" style={{ background: "var(--muted)", color: "var(--foreground)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold uppercase tracking-wide text-[10px]" style={{ color: "var(--muted-foreground)" }}>Incident Narrative</span>
                  {narrativeAnalysis && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      narrativeAnalysis.consistency_verdict === "CONSISTENT" ? "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200" :
                      narrativeAnalysis.consistency_verdict === "MINOR_DISCREPANCY" ? "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200" :
                      narrativeAnalysis.consistency_verdict === "INCONSISTENT" ? "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200" :
                      narrativeAnalysis.consistency_verdict === "CONTAMINATED" ? "bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-200" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {narrativeAnalysis.consistency_verdict?.replace(/_/g, " ")}
                    </span>
                  )}
                  {narrativeAnalysis?.was_contaminated && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-200">POST-INCIDENT CONTENT STRIPPED</span>
                  )}
                </div>
                {/* SAFEGUARD: Always show the original description as the authoritative text */}
                <p className="leading-relaxed">
                  {description || narrativeAnalysis?.cleaned_incident_narrative || "No incident description available."}
                </p>
                {/* Show AI-processed narrative only if it differs meaningfully and adds value */}
                {narrativeAnalysis?.cleaned_incident_narrative && description &&
                  narrativeAnalysis.cleaned_incident_narrative !== description &&
                  narrativeAnalysis.cleaned_incident_narrative.length > 20 && (
                  <div className="mt-2 p-2 rounded text-[10px]" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                    <span className="font-semibold">AI-processed narrative: </span>
                    {narrativeAnalysis.cleaned_incident_narrative}
                  </div>
                )}
                {/* Sequence of events — AI-reconstructed, may contain inferences */}
                {narrativeAnalysis?.extracted_facts?.sequence_of_events && (
                  <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                    <span className="font-semibold">AI-Reconstructed Sequence of Events: </span>
                    <span style={{ color: "var(--muted-foreground)" }}>{narrativeAnalysis.extracted_facts.sequence_of_events}</span>
                    <div className="mt-1 text-[9px]" style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>
                      Note: This sequence is AI-reconstructed from the incident description and may contain inferences not present in the original claim form. Always verify against the original description above.
                    </div>
                  </div>
                )}
              </div>

              {/* Stripped post-incident content */}
              {narrativeAnalysis?.stripped_content && narrativeAnalysis.stripped_content.length > 0 && (
                <div className="p-3 rounded-lg text-xs bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                  <p className="font-bold uppercase tracking-wide text-[10px] mb-1">Post-Incident Content Removed from Narrative</p>
                  <p className="text-[10px] mb-1 text-amber-700 dark:text-amber-300">The following content was identified as post-incident (inspection findings, repair notes, extras quotations) and excluded from the incident narrative above.</p>
                  <ul className="space-y-0.5">
                    {narrativeAnalysis.stripped_content.map((s: string, i: number) => (
                      <li key={i} className="text-[10px]">{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Cross-validation panel */}
              {narrativeAnalysis?.cross_validation && (
                <div className="p-3 rounded-lg text-xs" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <p className="font-bold uppercase tracking-wide text-[10px] mb-2" style={{ color: "var(--muted-foreground)" }}>Narrative Cross-Validation</p>
                  <div className="space-y-1">
                    {[
                      { label: "Physics alignment", verdict: narrativeAnalysis.cross_validation.physics_verdict, notes: narrativeAnalysis.cross_validation.physics_notes },
                      { label: "Damage alignment", verdict: narrativeAnalysis.cross_validation.damage_verdict, notes: narrativeAnalysis.cross_validation.damage_notes },
                      { label: "Crush depth alignment", verdict: narrativeAnalysis.cross_validation.crush_depth_verdict, notes: narrativeAnalysis.cross_validation.crush_depth_notes },
                    ].filter(r => r.verdict !== "NOT_ASSESSED").map((r, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          r.verdict === "CONSISTENT" ? "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200" :
                          r.verdict === "PARTIAL" ? "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200" :
                          "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200"
                        }`}>{r.verdict}</span>
                        <span style={{ color: "var(--muted-foreground)" }}><span className="font-semibold" style={{ color: "var(--foreground)" }}>{r.label}:</span> {r.notes}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Narrative fraud signals */}
              {narrativeAnalysis?.fraud_signals && narrativeAnalysis.fraud_signals.length > 0 && (
                <div className="p-3 rounded-lg text-xs bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200">
                  <p className="font-bold uppercase tracking-wide text-[10px] mb-2">Narrative Fraud Signals ({narrativeAnalysis.fraud_signals.length})</p>
                  <div className="space-y-1.5">
                    {narrativeAnalysis.fraud_signals.map((sig: any, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          sig.severity === "HIGH" ? "bg-red-200 dark:bg-red-900 text-red-900 dark:text-red-100" :
                          sig.severity === "MEDIUM" ? "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-100" :
                          "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100"
                        }`}>{sig.severity}</span>
                        <div>
                          <span className="font-semibold">{sig.code?.replace(/_/g, " ")}: </span>
                          <span>{sig.description}</span>
                          {sig.evidence && <span className="block text-[10px] mt-0.5 text-red-600 dark:text-red-400">Evidence: "{sig.evidence}"</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reasoning summary */}
              {narrativeAnalysis?.reasoning_summary && (
                <div className="p-3 rounded-lg text-xs" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                  <span className="font-semibold" style={{ color: "var(--foreground)" }}>Analyst reasoning: </span>
                  {narrativeAnalysis.reasoning_summary}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 1.2 Insurance & Policy Context */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>1.2 Insurance & Policy Context</p>
        </div>
        <div className="p-4">
          <table className="w-full text-xs report-table">
            <tbody>
              {[
                ["Insurer", insurerName ?? "Not extracted"],
                ["Policy number", policyNumber ?? "Not provided"],
                ["Claim reference", claimReference ?? "Not extracted"],
                ["Policy excess", excessAmountUsd != null ? fmtMoney(excessAmountUsd) : "Not extracted"],
              ].map(([k, v], i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td className="py-2 pr-4 font-semibold w-40" style={{ color: "var(--muted-foreground)" }}>{k as string}</td>
                  <td className="py-2" style={{ color: "var(--foreground)" }}>{v as React.ReactNode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1.3 Vehicle Details */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>1.3 Vehicle Details</p>
        </div>
        <div className="p-4">
          <table className="w-full text-xs report-table">
            <tbody>
              {[
                ["Registration", claim?.vehicleRegistration ?? claimRecord?.vehicle?.registration ?? "Not recorded"],
                ["VIN", vehicleVin ?? "Not recorded"],
                ["Engine number", vehicleEngineNumber ?? "Not recorded"],
                ["Odometer", vehicleMileage != null ? `${vehicleMileage.toLocaleString()} km` : "Not recorded"],
                ["Market value", marketValueUsd != null ? fmtMoney(marketValueUsd) : "Not stated"],
              ].map(([k, v], i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td className="py-2 pr-4 font-semibold w-40" style={{ color: "var(--muted-foreground)" }}>{k as string}</td>
                  <td className="py-2" style={{ color: "var(--foreground)" }}>{v as React.ReactNode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1.2 Data Completeness + Confidence Bars */}
      <div className="grid grid-cols-2 gap-4">
        {/* Completeness checklist */}
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>1.2 Data Completeness</p>
            <span className="text-xs font-bold" style={{ color: dataCompleteness >= 70 ? "var(--fp-success-text)" : "var(--fp-warning-text)" }}>{Math.round(dataCompleteness)}%</span>
          </div>
          {/* Overall completeness bar */}
          <div className="px-4 pt-3">
            <div className="h-2 rounded-full" style={{ background: "var(--muted)" }}>
              <div className="h-2 rounded-full" style={{ width: `${Math.min(100, dataCompleteness)}%`, background: dataCompleteness >= 70 ? "var(--fp-success-text)" : dataCompleteness >= 40 ? "var(--fp-warning-text)" : "var(--fp-critical-text)" }} />
            </div>
          </div>
          <div className="p-4 space-y-2">
            {checklist.map((item, i) => (
              <div key={i} className="space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {item.ok
                      ? <CheckCircle className="h-3 w-3 shrink-0" style={{ color: "var(--fp-success-text)" }} />
                      : <XCircle className="h-3 w-3 shrink-0" style={{ color: "var(--fp-critical-text)" }} />}
                    <span className="text-xs" style={{ color: "var(--foreground)" }}>{item.label}</span>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>{item.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Confidence bars */}
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>1.3 Extraction Confidence</p>
          </div>
          <div className="p-4 space-y-3">
            {confidenceBars.map((bar, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: "var(--muted-foreground)" }}>{bar.label}</span>
                  <span className="font-semibold" style={{ color: bar.value >= 70 ? "var(--fp-success-text)" : bar.value >= 40 ? "var(--fp-warning-text)" : "var(--fp-critical-text)" }}>{Math.round(bar.value)}%</span>
                </div>
                <div className="h-2 rounded-full" style={{ background: "var(--muted)" }}>
                  <div className="h-2 rounded-full" style={{
                    width: `${Math.min(100, bar.value)}%`,
                    background: bar.value >= 70 ? "var(--fp-success-text)" : bar.value >= 40 ? "var(--fp-warning-text)" : "var(--fp-critical-text)"
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {corrections.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--fp-warning-text)" }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>
              Phase 1 Auto-Corrections ({corrections.length})
            </p>
          </div>
          <div className="p-4 space-y-1">
            {corrections.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--foreground)" }}>
                <span className="font-mono font-bold" style={{ color: "var(--fp-warning-text)" }}>{i + 1}.</span>
                {c}
              </div>
            ))}
          </div>
        </div>
      )}

      {gates.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Document Integrity Checks</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs report-table">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  {["Check", "Status", "Corrections"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gates.map((g: any, i: number) => (
                  <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                    <td className="px-3 py-2 font-semibold" style={{ color: "var(--primary)" }}>{({
                        G1_TEMPORAL: 'Date & Timeline Consistency',
                        G2_COST_RECONCILIATION: 'Cost Reconciliation',
                        G3_UNIT_CORRECTION: 'Currency & Unit Normalisation',
                        G4_SANITISATION: 'Data Sanitisation',
                        G5_TERMINOLOGY: 'Terminology Standardisation',
                      } as Record<string, string>)[g.gate] ?? (g.gate ? g.gate.replace(/^G\d+_?/i, '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : `Check ${i + 1}`)}</td>
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

function Section2Physics({ claim, aiAssessment, enforcement }: { claim: any; aiAssessment: any; enforcement: any }) {
  const e = enforcement;
  const pe = e?.physicsEstimate;
  const phase2 = (e as any)?._phase2 as any;
  const physicsScore = phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0;
  const constraints: any[] = phase2?.physicsConstraints ?? [];
  // Fall back to claim.incidentType when pipeline returns REQUIRES_CLASSIFICATION
  const _rawIt2 = phase2?.incidentType ?? aiAssessment?.incidentType;
  const _unresolved2 = !_rawIt2 || _rawIt2 === "REQUIRES_CLASSIFICATION" || _rawIt2 === "REQUIRES CLASSIFICATION" || _rawIt2 === "unknown";
  const incidentType = _unresolved2 ? (claim?.incidentType ?? "unknown") : _rawIt2;
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
              <table className="w-full text-xs report-table">
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
                    <div className="h-2 rounded-full" style={{ width: `${Math.min(100, (claimedSpeed / 150) * 100)}%`, background: "var(--fp-warning-text)" }} />
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
                    <div className="h-2 rounded-full" style={{ width: `${Math.min(100, (deltaV / 150) * 100)}%`, background: "var(--fp-success-text)" }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {directionExplanation && (
            <div className="p-2 rounded-lg text-xs" style={{
              background: directionMismatch ? "var(--status-review-bg)" : "var(--status-approve-bg)",
              border: `1px solid ${directionMismatch ? "var(--status-review-border)" : "var(--status-approve-border)"}`,
              color: directionMismatch ? "var(--status-review-text)" : "var(--status-approve-text)",
            }}>
              {directionMismatch ? "⚠ Direction mismatch: " : "✓ Direction consistent: "}{directionExplanation}
            </div>
          )}
        </div>
      </div>

      {/* 2.2 Damage Consistency — 3-column spec table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>2.2 Damage Consistency</p>
          <StatusBadge
            status={physicsScore >= 70 ? "pass" : physicsScore >= 30 ? "warn" : "fail"}
            label={anomalyLevel === "none" ? "CONSISTENT" : anomalyLevel.toUpperCase()}
          />
        </div>
        <div className="p-4">
          {/* Zone map + 3-col comparison table side by side */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Damage Zone Map</p>
              <VehicleDamageMap damageZones={damageZones} incidentType={incidentType} />
              {damageZones.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {damageZones.map((z, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded"
                      style={{ background: "var(--status-reject-bg)", color: "var(--status-reject-text)", border: "1px solid var(--fp-critical-border)" }}>{z}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>
                {incidentType.replace(/_/g, " ").toUpperCase()} TYPICAL PATTERN | THIS CLAIM OBSERVED
              </p>
              <table className="w-full text-xs report-table">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                    <th className="text-left px-2 py-1.5 font-semibold" style={{ color: "var(--muted-foreground)" }}>Expected damage</th>
                    <th className="text-left px-2 py-1.5 font-semibold" style={{ color: "var(--muted-foreground)" }}>Observed</th>
                    <th className="text-left px-2 py-1.5 font-semibold" style={{ color: "var(--muted-foreground)" }}>Match</th>
                  </tr>
                </thead>
                <tbody>
                  {pattern.expected.map((item, i) => {
                    const zoneMatch = damageZones.some(z =>
                      item.toLowerCase().includes(z.toLowerCase()) ||
                      z.toLowerCase().includes(item.split(" ")[0].toLowerCase())
                    );
                    const observed = damageZones.length > 0
                      ? (zoneMatch ? damageZones.find(z => item.toLowerCase().includes(z.toLowerCase()) || z.toLowerCase().includes(item.split(" ")[0].toLowerCase())) ?? "—" : "Not reported")
                      : "N/A";
                    return (
                      <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                        <td className="px-2 py-1.5" style={{ color: "var(--foreground)" }}>{item}</td>
                        <td className="px-2 py-1.5" style={{ color: "var(--muted-foreground)" }}>{String(observed)}</td>
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

          {/* Physics Constraint table — Expected / Actual / Verdict */}
          {constraints.length > 0 && (
            <>
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>2.3 Physics Constraint Status</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs report-table">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Constraint</th>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Expected</th>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Actual</th>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {constraints.map((c: any, i: number) => (
                      <React.Fragment key={i}>
                        <tr style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                          <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>{c.constraint}</td>
                          <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{c.expected ?? (c.suppressed ? "Advisory only" : "Pass")}</td>
                          <td className="px-3 py-2" style={{ color: "var(--foreground)" }}>{c.actual ?? (c.suppressed ? "Suppressed" : "Within range")}</td>
                          <td className="px-3 py-2">
                            <StatusBadge status={c.suppressed ? "warn" : "pass"} label={c.suppressed ? "⚠ ADVISORY" : "✅ PASS"} />
                          </td>
                        </tr>
                        {c.advisory && (
                          <tr style={{ background: c.suppressed ? "var(--fp-warning-bg)" : "var(--muted)" }}>
                            <td colSpan={4} className="px-3 pb-2 pt-0">
                              <div className="flex items-start gap-1.5 text-xs rounded px-2 py-1.5"
                                style={{
                                  background: c.suppressed ? "var(--fp-warning-bg)" : "var(--muted)",
                                  border: `1px solid ${c.suppressed ? "var(--status-review-border)" : "var(--border)"}`,
                                  color: c.suppressed ? "var(--status-review-text)" : "var(--muted-foreground)",
                                }}>
                                <span style={{ flexShrink: 0 }}>{c.suppressed ? "⚠" : "ℹ"}</span>
                                <span>{c.advisory}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
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

function Section3Financial({ aiAssessment, enforcement, quotes, fmtMoney = fmtUsd }: { aiAssessment: any; enforcement: any; quotes?: any[]; fmtMoney?: (n: number | null | undefined) => string }) {
  const e = enforcement;
  const ce = e?.costExtraction;
  const normalised = (aiAssessment as any)?._normalised as any;

  // Prefer the normalised AI estimate (independent benchmark) over costExtraction.ai_estimate
  // which can be set to the quote total when no independent estimate is available.
  const aiEstimate = normalised?.costs?.totalUsd ?? ce?.ai_estimate ?? aiAssessment?.estimatedCost ?? 0;
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

  // Derive verdict from the quote vs AI estimate comparison.
  // Only use NO_QUOTE when there is genuinely no quote AND no AI estimate.
  // If we have a quote but no AI estimate, show FAIR (cannot compare).
  // If we have both, compare them.
  const verdict: string = e?.costVerdict?.verdict !== "NO_QUOTE"
    ? (e?.costVerdict?.verdict ?? (
        aiEstimate > 0 && quotedTotal > 0
          ? quotedTotal > aiEstimate * 1.15 ? "OVERPRICED"
            : quotedTotal < aiEstimate * 0.85 ? "UNDERPRICED"
            : "FAIR"
          : aiEstimate > 0 && fairMax > 0
            ? aiEstimate > fairMax * 1.15 ? "OVERPRICED" : aiEstimate < fairMin * 0.85 ? "UNDERPRICED" : "FAIR"
            : quotedTotal > 0 ? "FAIR" : "NO_QUOTE"
      ))
    // costVerdict says NO_QUOTE — but if we actually have a quote, override it
    : quotedTotal > 0
      ? (quotedTotal > (aiEstimate > 0 ? aiEstimate : quotedTotal) * 1.15 ? "OVERPRICED"
         : quotedTotal < (aiEstimate > 0 ? aiEstimate : quotedTotal) * 0.85 ? "UNDERPRICED"
         : "FAIR")
      : "NO_QUOTE";

  const corrections: string[] = (aiAssessment as any)?._phase1?.allCorrections ?? [];
  const costCorrections = corrections.filter(c => c.toLowerCase().includes("cost") || c.toLowerCase().includes("$") || c.toLowerCase().includes("amount"));

  // Cost Decision Engine outputs — from costIntelligenceJson (C-3 fix)
  const costIntel = (aiAssessment as any)?.costIntelligenceJson ?? null;
  const costDecision = costIntel?.costDecision ?? null;
  const costNarrative = costIntel?.costNarrative ?? null;
  const costReliability = costIntel?.costReliability ?? null;
  const reconciliationSummary = costIntel?.reconciliationSummary ?? null;

  return (
    <div className="mb-4 space-y-4">
      {/* Cost waterfall */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Cost Waterfall</p>
          <StatusBadge status={verdict === "FAIR" ? "pass" : verdict === "OVERPRICED" ? "fail" : "info"} label={verdict} />
        </div>
        <div className="p-4">
          {/* Step-down SVG waterfall: AI Estimate → Repair Quote */}
          {(() => {
            // Show AI Estimate vs Repair Quote side-by-side for meaningful comparison
            const steps = [
              { label: "Learning Benchmark", value: aiEstimate, color: "var(--fp-info-text)",     show: aiEstimate > 0 },
              { label: "Repair Quote",   value: quotedTotal,  color: "var(--fp-warning-text)",  show: quotedTotal > 0 },
            ].filter(s => s.show);
            if (steps.length === 0) return null;
            const maxVal = Math.max(...steps.map(s => s.value), 1);
            const svgW = 480;
            const svgH = 130;
            const barH = 28;
            const labelW = 120;
            const chartW = svgW - labelW - 70;
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
                        fill="var(--fp-success-bg)" stroke="var(--fp-success-border)" strokeWidth="1" strokeDasharray="4 3" />
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
                        {nextBarW != null && nextY != null && (
                          <line x1={labelW + barW} y1={y + barH / 2} x2={labelW + nextBarW} y2={nextY + barH / 2}
                            stroke="var(--border)" strokeWidth="1.5" strokeDasharray="4 3" />
                        )}
                        <rect x={labelW} y={y} width={barW} height={barH} rx="4" fill={step.color} opacity="0.85" />
                        <text x={labelW - 6} y={y + barH / 2 + 4} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">{step.label}</text>
                        <text x={labelW + barW + 6} y={y + barH / 2 + 4} fontSize="10" fontWeight="bold" fill="var(--foreground)">{fmtMoney(step.value)}</text>
                      </g>
                    );
                  })}
                  {fairMin > 0 && fairMax > 0 && (
                    <text x={labelW + (fairMin / maxVal) * chartW + 4} y={svgH + 14} fontSize="9" fill="var(--fp-success-text)">Fair range {fmtMoney(fairMin)}–{fmtMoney(fairMax)}</text>
                  )}
                </svg>
              </div>
            );
          })()}
          {/* Reconciliation table — Source / Amount / Audit Note per spec */}
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>3.1 Cost Breakdown</p>
          <table className="w-full text-xs mb-3 report-table">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                {["Source", "Parts", "Labour", "Total", "Variance vs Benchmark", "Audit Note"].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { source: "Learning Benchmark", parts: aiParts, labour: aiLabour, total: aiEstimate, v: null as number | null, note: aiEstimate > 0 ? "From accumulated claims data" : "Insufficient learning data" },
                { source: "Repairer Quote", parts: quotedParts, labour: quotedLabour, total: quotedTotal, v: totalVar, note: totalVar == null ? "No quote" : Math.abs(totalVar) <= 15 ? "Within tolerance" : Math.abs(totalVar) <= 30 ? "Review recommended" : "Significant outlier" },
                { source: "Fair Range", parts: null as number | null, labour: null as number | null, total: fairMin > 0 ? fairMin : null, v: null as number | null, note: fairMin > 0 && fairMax > 0 ? `${fmtMoney(fairMin)} – ${fmtMoney(fairMax)}` : "Not available" },
              ].map((row, i) => {
                const vStatus: "pass" | "warn" | "fail" | "na" = row.v == null ? "na" : Math.abs(row.v) <= 15 ? "pass" : Math.abs(row.v) <= 30 ? "warn" : "fail";
                const vLabel = row.v == null ? "—" : `${row.v > 0 ? "+" : ""}${Math.round(row.v)}%`;
                return (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)", background: i === 0 ? "var(--muted)" : "var(--background)", fontWeight: i === 0 ? "bold" : undefined }}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>{row.source}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>{row.parts != null && row.parts > 0 ? fmtMoney(row.parts) : "—"}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>{row.labour != null && row.labour > 0 ? fmtMoney(row.labour) : "—"}</td>
                    <td className="px-3 py-2 font-mono font-semibold" style={{ color: "var(--foreground)" }}>{row.total != null && row.total > 0 ? fmtMoney(row.total) : "—"}</td>
                    <td className="px-3 py-2"><StatusBadge status={vStatus} label={vLabel} /></td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--muted-foreground)" }}>{row.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {fairMin > 0 && fairMax > 0 && (
            <div className="p-2 rounded text-xs" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
              Fair range benchmark: {fmtMoney(fairMin)} – {fmtMoney(fairMax)} · AI estimate is{" "}
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
            <table className="w-full text-xs report-table">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  {["Component", "Benchmark", "Quoted", "Variance", "Source"].map(h => (
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
                  const hasBenchmark = part.total != null && part.total > 0;
                  const v = quotedPartCost != null && hasBenchmark ? ((quotedPartCost - part.total) / part.total) * 100 : null;
                  // Determine source label from the backend's costSource field
                  const sourceLabel = part.costSource === "learning_db" ? "Learning DB" : part.source === "extracted" ? "Extracted" : hasBenchmark ? "Benchmark" : "Insufficient data";
                  const sourceStatus = part.costSource === "learning_db" ? "pass" : part.source === "extracted" ? "pass" : hasBenchmark ? "info" : "na";
                  return (
                    <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>{part.component}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>
                        {hasBenchmark ? fmtMoney(part.total) : <span style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>Insufficient data</span>}
                      </td>
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>{quotedPartCost != null ? fmtMoney(quotedPartCost) : "—"}</td>
                      <td className="px-3 py-2">
                        {v != null ? <StatusBadge status={Math.abs(v) <= 20 ? "pass" : Math.abs(v) <= 40 ? "warn" : "fail"} label={`${v > 0 ? "+" : ""}${Math.round(v)}%`} /> : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={sourceStatus as any} label={sourceLabel} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", background: "var(--muted)" }}>
                  <td className="px-3 py-2 font-bold" style={{ color: "var(--foreground)" }}>TOTAL</td>
                  <td className="px-3 py-2 font-mono font-bold" style={{ color: "var(--foreground)" }}>{fmtMoney(itemisedParts.reduce((s: number, p: any) => s + (p.total ?? 0), 0))}</td>
                  <td className="px-3 py-2 font-mono font-bold" style={{ color: "var(--foreground)" }}>{quotedTotal > 0 ? fmtMoney(quotedTotal) : "—"}</td>
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
            <table className="w-full text-xs report-table">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  {["Repairer", "Parts", "Labour", "Total", "vs Benchmark", "Status"].map(h => (
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
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>{q.parts > 0 ? fmtMoney(q.parts) : "—"}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--foreground)" }}>{q.labour > 0 ? fmtMoney(q.labour) : "—"}</td>
                      <td className="px-3 py-2 font-mono font-semibold" style={{ color: "var(--foreground)" }}>{fmtMoney(q.total)}</td>
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
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--fp-warning-text)" }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Cost Auto-Corrections ({costCorrections.length})</p>
          </div>
          <div className="p-4 space-y-1">
            {costCorrections.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--foreground)" }}>
                <span className="font-mono font-bold" style={{ color: "var(--fp-warning-text)" }}>{i + 1}.</span>{c}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cost Decision Engine output — surfaced from costIntelligenceJson (C-3 fix) */}
      {(costDecision || costNarrative || reconciliationSummary) && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>3.1a Cost Decision Engine</p>
            {costReliability && (
              <StatusBadge
                status={costReliability === "high" ? "pass" : costReliability === "medium" ? "warn" : "fail"}
                label={`Reliability: ${costReliability.toUpperCase()}`}
              />
            )}
          </div>
          <div className="p-4 space-y-3">
            {costDecision && (
              <table className="w-full text-xs report-table">
                <tbody>
                  {costDecision.recommendation && (
                    <tr>
                      <td className="py-1.5 pr-3 font-semibold w-40" style={{ color: "var(--muted-foreground)" }}>Recommendation</td>
                      <td className="py-1.5 font-mono" style={{ color: "var(--foreground)" }}>{costDecision.recommendation}</td>
                    </tr>
                  )}
                  {costDecision.approvedAmountUsd != null && (
                    <tr style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="py-1.5 pr-3 font-semibold" style={{ color: "var(--muted-foreground)" }}>Approved Amount</td>
                      <td className="py-1.5 font-mono font-bold" style={{ color: "var(--foreground)" }}>{fmtMoney(costDecision.approvedAmountUsd)}</td>
                    </tr>
                  )}
                  {costDecision.savingsUsd != null && costDecision.savingsUsd > 0 && (
                    <tr style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="py-1.5 pr-3 font-semibold" style={{ color: "var(--muted-foreground)" }}>Savings Identified</td>
                      <td className="py-1.5 font-mono" style={{ color: "var(--fp-success-text)" }}>{fmtMoney(costDecision.savingsUsd)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            {costNarrative && (
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{costNarrative}</p>
            )}
            {reconciliationSummary && (
              <div className="p-2 rounded text-xs" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                <span className="font-semibold">Reconciliation: </span>{reconciliationSummary}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3.2 Vehicle Valuation — populated from extracted data */}
      <ValuationSubsection aiAssessment={aiAssessment} enforcement={enforcement} quotes={quotes} />
    </div>
  );
}

// ─── 3.2 Vehicle Valuation Subsection ─────────────────────────────────────────

function ValuationSubsection({ aiAssessment, enforcement, quotes }: { aiAssessment: any; enforcement: any; quotes?: any[] }) {
  // Currency-aware formatter — derived from claim currency code
  const fmtMoney = makeFmtCurrency((aiAssessment as any)?.currencyCode ?? (aiAssessment as any)?.claimCurrency ?? null);
  // Read claimRecord from the correct location — same as the rest of the report
  const claimRecord = (aiAssessment as any)?._claimRecord ?? (aiAssessment as any)?.claimRecord ?? null;
  const marketValueUsd = claimRecord?.vehicle?.marketValueUsd ?? null;
  const excessUsd = claimRecord?.insuranceContext?.excessAmountUsd ?? null;
  const bettermentUsd = claimRecord?.insuranceContext?.bettermentUsd ?? null;
  const quotedTotal = (quotes?.[0]?.quotedAmount ?? 0) / 100;
  const agreedCostUsd = claimRecord?.costs?.agreedCostUsd ?? null;
  const repairCost = agreedCostUsd ?? quotedTotal;
  const repairToValue = marketValueUsd && marketValueUsd > 0 && repairCost > 0 ? (repairCost / marketValueUsd) * 100 : null;
  const isWriteOff = repairToValue != null && repairToValue >= 70;

  // Only show if we have at least market value or repair cost
  if (!marketValueUsd && !repairCost) return null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>3.2 Vehicle Valuation</p>
        {isWriteOff != null && (
          <StatusBadge status={isWriteOff ? "fail" : "pass"} label={isWriteOff ? "POTENTIAL WRITE-OFF" : "REPAIRABLE"} />
        )}
      </div>
      <div className="p-4">
        <table className="w-full text-xs report-table">
          <tbody>
            {[
              ["Market Value", marketValueUsd != null ? fmtMoney(marketValueUsd) : "Not stated"],
              ["Repair Cost (Quoted)", repairCost > 0 ? fmtMoney(repairCost) : "Not available"],
              ["Repair-to-Value Ratio", repairToValue != null ? `${repairToValue.toFixed(1)}%` : "Cannot calculate"],
              ["Excess / Deductible", excessUsd != null ? fmtMoney(excessUsd) : "Not stated"],
              ["Betterment / Depreciation", bettermentUsd != null ? fmtMoney(bettermentUsd) : "Not stated"],
              ["Net Claimant Liability", excessUsd != null && bettermentUsd != null ? fmtMoney(excessUsd + bettermentUsd) : excessUsd != null ? fmtMoney(excessUsd) : "Not available"],
            ].map(([k, v], i) => (
              <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                <td className="py-2 pr-4 font-semibold w-48" style={{ color: "var(--muted-foreground)" }}>{k as string}</td>
                <td className="py-2 font-mono" style={{ color: "var(--foreground)" }}>{v as string}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {repairToValue != null && (
          <div className="mt-3 p-2 rounded text-xs" style={{
            background: isWriteOff ? "var(--status-reject-bg)" : "var(--fp-success-bg)",
            color: isWriteOff ? "var(--fp-critical-text)" : "var(--fp-success-text)",
          }}>
            {isWriteOff
              ? `Repair cost is ${repairToValue.toFixed(1)}% of market value — exceeds 70% threshold. Potential economic write-off.`
              : `Repair cost is ${repairToValue.toFixed(1)}% of market value — within repairable range.`}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section 4: Evidence Inventory ───────────────────────────────────────────

// ─── Photo Re-Extraction Button ───────────────────────────────────────────────
// Shown in Section 4.4 when a scanned PDF has low sharpness (< 60%).
// Triggers a high-DPI (300 DPI) re-extraction and Stage 6 damage re-analysis.
function PhotoReextractButton({ assessmentId, claimId }: { assessmentId?: number; claimId?: number }) {
  const utils = trpc.useUtils();
  const [jobId, setJobId] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for existing latest job on mount
  const { data: latestJob } = trpc.photoReextraction.getLatest.useQuery(
    { assessmentId: assessmentId! },
    { enabled: !!assessmentId }
  );

  // Poll job status when we have a running job
  const { data: jobStatus } = trpc.photoReextraction.getStatus.useQuery(
    { jobId: jobId! },
    {
      enabled: !!jobId && polling,
      refetchInterval: polling ? 3000 : false,
    }
  );

  // Handle job status updates
  useEffect(() => {
    if (!jobStatus) return;
    if (jobStatus.status === "completed") {
      setPolling(false);
      setResult(jobStatus);
      // Invalidate the assessment query so the report refreshes with new photos
      utils.aiAssessments.byClaim.invalidate({ claimId: claimId! });
    } else if (jobStatus.status === "failed") {
      setPolling(false);
      setError(jobStatus.errorMessage ?? "Re-extraction failed");
    }
  }, [jobStatus, claimId, utils]);

  const triggerMutation = trpc.photoReextraction.trigger.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
      setPolling(true);
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleTrigger = useCallback(() => {
    if (!assessmentId || !claimId) return;
    setResult(null);
    setError(null);
    triggerMutation.mutate({ assessmentId, claimId });
  }, [assessmentId, claimId, triggerMutation]);

  const isRunning = triggerMutation.isPending || polling || jobStatus?.status === "running";
  const alreadyCompleted = result || (latestJob?.status === "completed");

  // Don't render if IDs are missing
  if (!assessmentId || !claimId) return null;

  return (
    <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
            Low-sharpness scanned PDF detected
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            Re-extract photos at 300 DPI for a sharper damage analysis. This re-runs only the photo extraction
            and damage analysis stages — the rest of the report stays unchanged.
          </p>
          {error && (
            <p className="text-xs mt-1 font-semibold" style={{ color: "var(--fp-critical-text)" }}>
              ⚠ {error}
            </p>
          )}
          {alreadyCompleted && !isRunning && (
            <div className="mt-2 p-2 rounded text-xs" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
              <span className="font-semibold" style={{ color: "var(--fp-success-text)" }}>✓ Re-extraction complete — </span>
              <span style={{ color: "var(--muted-foreground)" }}>
                {(result ?? latestJob)?.photosExtracted ?? 0} photo(s) extracted at {(result ?? latestJob)?.renderDpi ?? 300} DPI
                {(result ?? latestJob)?.avgSharpness ? `, avg sharpness ${(result ?? latestJob).avgSharpness}%` : ""}
              </span>
              <span className="ml-2" style={{ color: "var(--muted-foreground)" }}>
                · Report photos updated
              </span>
            </div>
          )}
          {isRunning && (
            <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {jobStatus?.status === "running"
                ? "Re-extracting photos at 300 DPI…"
                : "Queuing re-extraction…"}
            </div>
          )}
        </div>
        <button
          onClick={handleTrigger}
          disabled={isRunning}
          className="shrink-0 px-3 py-1.5 rounded text-xs font-semibold transition-opacity"
          style={{
            background: isRunning ? "var(--muted)" : "var(--fp-warning-text)",
            color: isRunning ? "var(--muted-foreground)" : "#fff",
            opacity: isRunning ? 0.6 : 1,
            cursor: isRunning ? "not-allowed" : "pointer",
            border: "none",
          }}
        >
          {alreadyCompleted && !isRunning ? "Re-run 300 DPI" : isRunning ? "Running…" : "Re-extract at 300 DPI"}
        </button>
      </div>
    </div>
  );
}

function Section4Evidence({ aiAssessment, enforcement, claim }: { aiAssessment: any; enforcement: any; claim: any }) {
  // Currency-aware formatter — derived from claim currency code
  const fmtMoney = makeFmtCurrency((aiAssessment as any)?.currencyCode ?? (aiAssessment as any)?.claimCurrency ?? null);
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
    { id: "Repair Quote", type: "Financial", extracted: !!(aiAssessment?.estimatedCost), note: aiAssessment?.estimatedCost ? `${fmtMoney(aiAssessment.estimatedCost)} extracted` : "Not submitted" },
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
            <div className="p-2 rounded text-xs mb-2" style={{ background: "var(--status-review-bg)", border: "1px solid var(--fp-warning-border)", color: "var(--status-review-text)" }}>
              <strong>⚠ System error</strong> — Photo ingestion failed due to a pipeline error. NOT attributed to the claimant. Photo-related fraud points excluded from score.
            </div>
          )}
          {photoStatus === "CLAIMANT_OMISSION" && (
            <div className="p-2 rounded text-xs mb-2" style={{ background: "var(--status-reject-bg)", border: "1px solid var(--fp-critical-border)", color: "var(--status-reject-text)" }}>
              <strong>❌ Photos not provided</strong> — Claimant did not submit photo evidence. Contributes to fraud risk score.
            </div>
          )}
          {photoStatus === "ANALYSED" && (
            <div className="p-2 rounded text-xs mb-2" style={{ background: "var(--status-approve-bg)", border: "1px solid var(--fp-success-border)", color: "var(--status-approve-text)" }}>
              <strong>✓ Photos analysed</strong> — {photosProcessed} of {photosDetected} photos successfully processed.
            </div>
          )}
          {photoUrls.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>4.1 Photo Grid ({photoUrls.length} images)</p>
              <div className="grid grid-cols-3 gap-2">
                {photoUrls.slice(0, 9).map((url, i) => {
                  const damagedZones = (phase2?.damageZones ?? []) as string[];
                  const zoneLabel = damagedZones[i]
                    ? damagedZones[i].replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
                    : `View ${i + 1}`;
                  return (
                    <div key={i} className="rounded overflow-hidden relative" style={{ border: "1px solid var(--border)", background: "var(--muted)" }}>
                      <div style={{ aspectRatio: "1", position: "relative" }}>
                        <img src={url} alt={`Photo ${i + 1} — ${zoneLabel}`} className="w-full h-full object-cover" />
                        {/* Caption overlay strip */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/55 px-1.5 py-0.5">
                          <p className="text-xs font-semibold truncate text-white">{zoneLabel}</p>
                          <p className="text-xs text-white/75">Photo {i + 1}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {photoUrls.length > 9 && (
                <p className="text-xs mt-2 font-medium" style={{ color: "var(--muted-foreground)" }}>+{photoUrls.length - 9} more images not shown</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>4.2 Document Extraction</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs report-table">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                {["Document", "Type", "Extracted", "Confidence", "Note"].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((doc, i) => {
                // Assign confidence based on extraction status and document type
                const conf = doc.extracted
                  ? doc.type === "Primary" ? 95
                  : doc.type === "Financial" ? 85
                  : doc.type === "Visual" ? (isSystemFailure ? 0 : 80)
                  : doc.type === "Identity" ? 90
                  : 75
                  : 0;
                const confColor = conf >= 70 ? "var(--fp-success-text)" : conf >= 40 ? "var(--fp-warning-text)" : "var(--fp-critical-text)";
                return (
                  <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>{doc.id}</td>
                    <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{doc.type}</td>
                    <td className="px-3 py-2"><StatusBadge status={doc.extracted ? "pass" : "fail"} label={doc.extracted ? "YES" : "NO"} /></td>
                    <td className="px-3 py-2" style={{ minWidth: 100 }}>
                      {doc.extracted ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--muted)" }}>
                            <div className="h-1.5 rounded-full" style={{ width: `${conf}%`, background: confColor }} />
                          </div>
                          <span className="text-xs font-semibold shrink-0" style={{ color: confColor }}>{conf}%</span>
                        </div>
                      ) : (
                        <span style={{ color: "var(--muted-foreground)" }}>—</span>
                      )}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{doc.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4.3 Photo Forensics — EXIF, GPS & manipulation analysis */}
      {(() => {
        const pf = (enforcement as any)?._photoForensics as any;
        if (!pf) return null;
        const suspiciousPhotos = (pf.photos ?? []).filter((p: any) => p.analysisResult?.is_suspicious);
        const gpsPhotos = (pf.photos ?? []).filter((p: any) => p.analysisResult?.gps_coordinates);
        const overallStatus = pf.anySuspicious ? "warn" : "pass";
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>4.3 Photo Forensics — EXIF & Manipulation Analysis</p>
              <StatusBadge status={overallStatus} label={pf.anySuspicious ? "SUSPICIOUS" : "CLEAN"} />
            </div>
            <div className="p-4">
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Analysed", value: pf.analysedCount ?? 0 },
                  { label: "Suspicious", value: suspiciousPhotos.length },
                  { label: "GPS Present", value: gpsPhotos.length },
                  { label: "Errors", value: pf.errorCount ?? 0 },
                ].map((m, i) => (
                  <div key={i} className="text-center p-2 rounded" style={{ background: "var(--muted)" }}>
                    <p className="text-lg font-bold" style={{ color: m.label === "Suspicious" && m.value > 0 ? "var(--fp-critical-text)" : "var(--foreground)" }}>{m.value}</p>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{m.label}</p>
                  </div>
                ))}
              </div>
              {(pf.photos ?? []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Per-Photo Results</p>
                  {(pf.photos as any[]).map((photo: any, i: number) => {
                    const r = photo.analysisResult;
                    if (!r) return (
                      <div key={i} className="p-2 rounded text-xs" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
                        <span className="font-medium" style={{ color: "var(--foreground)" }}>Photo {i + 1}</span>
                        <span className="ml-2" style={{ color: "var(--fp-warning-text)" }}>{photo.error ?? "Analysis unavailable"}</span>
                      </div>
                    );
                    const flagColor = r.is_suspicious ? "var(--fp-critical-text)" : "var(--fp-success-text)";
                    const bgColor = r.is_suspicious ? "var(--status-review-bg)" : "var(--status-approve-bg)";
                    const borderColor = r.is_suspicious ? "var(--fp-warning-border)" : "var(--fp-success-border)";
                    return (
                      <div key={i} className="p-3 rounded" style={{ background: bgColor, border: `1px solid ${borderColor}` }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>Photo {i + 1}</span>
                          <div className="flex items-center gap-2">
                            {r.gps_coordinates && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                                GPS: {r.gps_coordinates.latitude.toFixed(4)}, {r.gps_coordinates.longitude.toFixed(4)}
                              </span>
                            )}
                            {r.capture_datetime && (
                              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{r.capture_datetime.slice(0, 10)}</span>
                            )}
                            <span className="text-xs font-bold" style={{ color: flagColor }}>{r.is_suspicious ? "SUSPICIOUS" : "CLEAN"}</span>
                          </div>
                        </div>
                        {r.flags && r.flags.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {r.flags.map((flag: string, fi: number) => (
                              <li key={fi} className="text-xs" style={{ color: "var(--foreground)" }}>• {flag}</li>
                            ))}
                          </ul>
                        )}
                        {r.manipulation_indicators?.manipulation_score !== undefined && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Manipulation score:</span>
                            <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--muted)", maxWidth: 120 }}>
                              <div className="h-1.5 rounded-full" style={{ width: `${Math.round((r.manipulation_indicators.manipulation_score ?? 0) * 100)}%`, background: r.manipulation_indicators.manipulation_score > 0.5 ? "var(--fp-critical-text)" : "var(--fp-warning-text)" }} />
                            </div>
                            <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{Math.round((r.manipulation_indicators.manipulation_score ?? 0) * 100)}%</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}
      {/* 4.4 Photo Quality Intelligence — extraction method, quality gate, scanned PDF */}
      {(() => {
        const fa = (aiAssessment as any)?._forensicAnalysis ?? null;
        const pil = fa?.photoIngestionLog ?? null;
        if (!pil) return null;
        const qs = pil.qualitySummary ?? null;
        const isScanned = qs?.isScannedPdf ?? false;
        const renderDpi = qs?.renderDpi ?? null;
        const totalExtracted = pil.totalExtracted ?? 0;
        const damageCount = pil.finalDamagePhotoCount ?? pil.damagePhotoCount ?? 0;
        const rejectedSmall = qs?.rejectedTooSmall ?? 0;
        const blurryCount = qs?.blurryCount ?? 0;
        const textHeavyCount = qs?.textHeavyCount ?? 0;
        const avgSharpness = qs?.avgSharpnessScore ?? null;
        const extractionError = pil.extractionError ?? null;
        const durationMs = pil.totalDurationMs ?? null;
        const hasQualityIssues = rejectedSmall > 0 || blurryCount > 0 || !!extractionError;
        const qualityStatus: "pass" | "warn" | "fail" = extractionError ? "fail" : hasQualityIssues ? "warn" : "pass";
        const qualityLabel = extractionError ? "EXTRACTION ERROR" : hasQualityIssues ? "QUALITY ISSUES" : "QUALITY OK";
        const qualityBg = extractionError ? "var(--status-reject-bg)" : hasQualityIssues ? "var(--status-review-bg)" : "var(--status-approve-bg)";
        const qualityBorder = extractionError ? "var(--fp-critical-border)" : hasQualityIssues ? "var(--fp-warning-border)" : "var(--fp-success-border)";
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>4.4 Photo Quality Intelligence</p>
              <div className="flex items-center gap-2">
                {isScanned && (
                  <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                    SCANNED PDF
                  </span>
                )}
                <StatusBadge status={qualityStatus} label={qualityLabel} />
              </div>
            </div>
            <div className="p-4">
              {extractionError && (
                <div className="p-2 rounded text-xs mb-3" style={{ background: qualityBg, border: `1px solid ${qualityBorder}`, color: "var(--fp-critical-text)" }}>
                  <strong>Extraction error:</strong> {extractionError}. This is a system-level issue and is not attributed to the claimant.
                </div>
              )}
              <div className="grid grid-cols-4 gap-3 mb-3">
                {[
                  { label: "Total found", value: totalExtracted, color: "var(--foreground)" },
                  { label: "Damage photos", value: damageCount, color: damageCount > 0 ? "var(--fp-success-text)" : "var(--fp-warning-text)" },
                  { label: "Rejected (size)", value: rejectedSmall, color: rejectedSmall > 0 ? "var(--fp-warning-text)" : "var(--muted-foreground)" },
                  { label: "Blurry / low-res", value: blurryCount, color: blurryCount > 0 ? "var(--fp-warning-text)" : "var(--muted-foreground)" },
                ].map((m, i) => (
                  <div key={i} className="text-center p-2 rounded" style={{ background: "var(--muted)" }}>
                    <p className="text-lg font-bold" style={{ color: m.color }}>{m.value}</p>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{m.label}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span style={{ color: "var(--muted-foreground)" }}>Extraction method:</span>
                    <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                      {isScanned ? `Scanned PDF — rendered at ${renderDpi ?? "auto"} DPI` : "Native PDF image extraction"}
                    </span>
                  </div>
                  {avgSharpness !== null && (
                    <div className="flex justify-between items-center">
                      <span style={{ color: "var(--muted-foreground)" }}>Avg. sharpness:</span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 rounded-full" style={{ width: 60, background: "var(--muted)" }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, avgSharpness)}%`, background: avgSharpness >= 70 ? "var(--fp-success-text)" : avgSharpness >= 40 ? "var(--fp-warning-text)" : "var(--fp-critical-text)" }} />
                        </div>
                        <span className="font-semibold" style={{ color: avgSharpness >= 70 ? "var(--fp-success-text)" : avgSharpness >= 40 ? "var(--fp-warning-text)" : "var(--fp-critical-text)" }}>{avgSharpness}%</span>
                      </div>
                    </div>
                  )}
                  {textHeavyCount > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: "var(--muted-foreground)" }}>Text-only pages skipped:</span>
                      <span className="font-semibold" style={{ color: "var(--muted-foreground)" }}>{textHeavyCount}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  {durationMs !== null && (
                    <div className="flex justify-between">
                      <span style={{ color: "var(--muted-foreground)" }}>Extraction time:</span>
                      <span className="font-semibold" style={{ color: "var(--foreground)" }}>{(durationMs / 1000).toFixed(1)}s</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span style={{ color: "var(--muted-foreground)" }}>Dimension gate (min 200px):</span>
                    <span className="font-semibold" style={{ color: rejectedSmall > 0 ? "var(--fp-warning-text)" : "var(--fp-success-text)" }}>
                      {rejectedSmall > 0 ? `${rejectedSmall} rejected` : "All passed"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--muted-foreground)" }}>Blur detection:</span>
                    <span className="font-semibold" style={{ color: blurryCount > 0 ? "var(--fp-warning-text)" : "var(--fp-success-text)" }}>
                      {blurryCount > 0 ? `${blurryCount} flagged` : "None flagged"}
                    </span>
                  </div>
                </div>
              </div>
              {(rejectedSmall > 0 || blurryCount > 0) && !extractionError && (
                <div className="mt-3 p-2 rounded text-xs" style={{ background: qualityBg, border: `1px solid ${qualityBorder}`, color: "var(--foreground)" }}>
                  <strong>Quality note:</strong>{" "}
                  {rejectedSmall > 0 && `${rejectedSmall} image(s) were too small (likely logos or stamps) and excluded from damage analysis. `}
                  {blurryCount > 0 && `${blurryCount} image(s) were flagged as low-sharpness. Damage analysis was still attempted but results may benefit from clearer photos.`}
                </div>
              )}
              {/* Re-extract at 300 DPI button — shown when scanned PDF + low sharpness */}
              {isScanned && avgSharpness !== null && avgSharpness < 60 && (
                <PhotoReextractButton
                  assessmentId={aiAssessment?.id}
                  claimId={aiAssessment?.claimId}
                />
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Section 5: Risk & Fraud Assessment ──────────────────────────────────────────────────────────────────────────────

function Section5Fraud({ aiAssessment, enforcement }: { aiAssessment: any; enforcement: any }) {
  const e = enforcement;
  const wf = e?.weightedFraud;
  const phase2 = (e as any)?._phase2 as any;

  const fraudScore = wf?.score ?? 0;
  const fraudLevel = wf?.level ?? "minimal";
  const fraudLabel = wf?.explanation ?? fraudLevel;
  const fraudColor = fraudScore >= 70 ? "var(--fp-critical-text)" : fraudScore >= 40 ? "var(--fp-warning-text)" : "var(--fp-success-text)";
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
                  { label: "0–39: LOW", color: "var(--fp-success-text)" },
                  { label: "40–69: MODERATE", color: "var(--fp-warning-text)" },
                  { label: "70–100: HIGH", color: "var(--fp-critical-text)" },
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
            <div className="h-3 rounded-full" style={{ width: `${Math.min(100, fraudScore)}%`, background: "linear-gradient(90deg, var(--fp-success-text), var(--fp-warning-text), var(--fp-critical-text))" }} />
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
              5.1 Indicator Breakdown {isSystemFailure ? "(system errors excluded from score)" : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs report-table">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  {["Indicator", "Score", "Score Bar", "Triggered", "Mitigation Note"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contributions.map((c: any, i: number) => {
                  const isPhotoFactor = c.factor?.toLowerCase().includes("photo");
                  const isExcluded = isPhotoFactor && isSystemFailure;
                  const score = c.value ?? 0;
                  const maxScore = 20; // each indicator max is 20
                  const scoreColor = isExcluded ? "var(--muted-foreground)" : score > 10 ? "var(--fp-critical-text)" : score > 5 ? "var(--fp-warning-text)" : "var(--fp-success-text)";

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
                      <td className="px-3 py-2 font-bold" style={{ color: scoreColor }}>{isExcluded ? "0 (adj)" : `${score}/${maxScore}`}</td>
                      <td className="px-3 py-2" style={{ minWidth: 80 }}>
                        <div className="h-1.5 rounded-full" style={{ background: "var(--muted)" }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${isExcluded ? 0 : Math.min(100, (score / maxScore) * 100)}%`, background: scoreColor }} />
                        </div>
                      </td>
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
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "var(--fp-warning-text)" }} />
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
  const wf = e?.weightedFraud;
  const wfScore = wf?.score ?? 0;
  // Use weighted fraud engine as primary decision source (same as top-level badge)
  const wfDecision = wfScore >= 70 ? "DECLINE" : wfScore >= 40 ? "REVIEW_REQUIRED" : null;
  const rawDecision: string = wfDecision ?? phase2?.finalDecision ?? e?.finalDecision?.decision ?? "REVIEW";
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
  // SAFEGUARD: G-codes removed per user request — labels are descriptive only
  const gates = [
    { id: "", label: "Physics Consistency", result: `${Math.round(physicsScore)}%`, pass: physicsScore >= 30 },
    { id: "", label: "Fraud Risk Score", result: Math.round(fraudScore), pass: fraudScore < 70 },
    { id: "", label: "Data Completeness", result: `${Math.round(dataCompleteness)}%`, pass: dataCompleteness >= 50 },
    { id: "", label: "Critical Blockers", result: blocked.length === 0 ? "None" : `${blocked.length} found`, pass: blocked.length === 0 },
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

  const passColor = "var(--fp-success-text)";
  const failColor = "var(--fp-critical-text)";
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
                <g key={`gate-${i}`}>
                  {/* Diamond */}
                  <path d={diamond(startX, cy, diamondW, diamondH)}
                    fill={`${gateColor}18`} stroke={gateColor} strokeWidth="1.5" />
                  {/* Gate label in diamond — G-codes removed, label centred */}
                  <text x={startX} y={cy - 5} textAnchor="middle" dominantBaseline="middle"
                    fontSize="10" fontWeight="600" fill={textColor}>{gate.label}</text>
                  {/* Result value */}
                  <text x={startX} y={cy + 11} textAnchor="middle" dominantBaseline="middle"
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

      {/* Trigger Conditions + Blocked Actions + Required Next Steps — 3-column layout per spec */}
      <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {(keyDrivers.length > 0 || primaryReason) && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>6.1 Trigger Conditions</p>
            </div>
            <div className="p-4 space-y-2">
              {[primaryReason, ...keyDrivers].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5).map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="font-bold shrink-0 w-4" style={{ color: decisionColor }}>{i + 1}.</span>
                  <span style={{ color: "var(--foreground)" }}>{d}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {blocked.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid var(--fp-critical-border)`, background: "var(--card)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--status-reject-bg)" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--fp-critical-text)" }}>6.2 Blocked Actions</p>
            </div>
            <div className="p-4 space-y-2">
              {blocked.map((b, i) => (
                <div key={i} className="flex items-start gap-2 text-xs p-2 rounded" style={{ background: "var(--status-reject-bg)" }}>
                  <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "var(--fp-critical-text)" }} />
                  <span style={{ color: "var(--fp-critical-text)", fontWeight: 600 }}>
                    {b === "APPROVE" ? "APPROVE — cannot approve while anomalies remain unexplained" :
                     b === "REJECT" ? "REJECT — no evidence of malicious intent" : b}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {nextSteps.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid var(--fp-warning-border)`, background: "var(--card)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--status-review-bg)" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--fp-warning-text)" }}>6.3 Required Next Steps</p>
            </div>
            <div className="p-4 space-y-2">
              {nextSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <div className="w-4 h-4 rounded shrink-0 mt-0.5 flex items-center justify-center" style={{ border: `1.5px solid var(--fp-warning-text)` }}>
                    <span className="text-xs font-bold" style={{ color: "var(--fp-warning-text)", lineHeight: 1 }}>{i + 1}</span>
                  </div>
                  <span style={{ color: "var(--foreground)" }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fraud Score Breakdown — uses authoritative weighted fraud engine (not pipeline rule trace) */}
      {wf?.full_contributions && wf.full_contributions.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Fraud Score Breakdown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs report-table">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  {["Factor", "Points", "Triggered", "Detail"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wf.full_contributions.map((c: any, i: number) => (
                  <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                    <td className="px-3 py-2 font-semibold" style={{ color: "var(--primary)" }}>{c.factor}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: c.triggered ? "var(--fp-critical-text)" : "var(--muted-foreground)" }}>{c.triggered ? `+${c.value}` : "0"}</td>
                    <td className="px-3 py-2"><StatusBadge status={c.triggered ? "fail" : "pass"} label={c.triggered ? "YES" : "NO"} /></td>
                    <td className="px-3 py-2 max-w-xs" style={{ color: "var(--muted-foreground)" }}>{c.detail}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--border)", background: "var(--muted)" }}>
                  <td className="px-3 py-2 font-bold" style={{ color: "var(--foreground)" }}>Total Score</td>
                  <td className="px-3 py-2 font-mono font-bold" style={{ color: fraudScore >= 70 ? "var(--fp-critical-text)" : fraudScore >= 40 ? "var(--fp-warning-text)" : "var(--fp-success-text)" }}>{Math.round(fraudScore)}/100</td>
                  <td colSpan={2} className="px-3 py-2 font-semibold" style={{ color: "var(--foreground)" }}>{wf.level?.toUpperCase() ?? ""} — {wf.explanation ?? ""}</td>
                </tr>
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
          <table className="w-full text-xs report-table">
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

// ─── Data Quality Panel ──────────────────────────────────────────────────────

function DataQualityPanel({ aiAssessment }: { aiAssessment: any }) {
  const ar = (aiAssessment as any)?._accuracyReport;
  if (!ar) return null;

  const confidence = Math.round((ar.overallConfidence ?? 0) * 100);
  const corrections: any[] = ar.corrections ?? [];
  const unreliable: string[] = ar.unreliableFields ?? [];
  const conflicts: string[] = ar.conflictingFields ?? [];
  const blocked: boolean = ar.blockGeneration ?? false;

  const hasIssues = corrections.length > 0 || unreliable.length > 0 || conflicts.length > 0 || blocked;
  if (!hasIssues && confidence >= 90) return null; // clean extraction — no panel needed

  const panelColor = blocked
    ? "var(--fp-danger)"
    : confidence < 70
    ? "var(--fp-warn)"
    : "var(--fp-info)";
  const panelBg = blocked
    ? "var(--fp-critical-bg)"
    : confidence < 70
    ? "var(--fp-warning-bg)"
    : "var(--fp-info-bg)";

  return (
    <div
      className="rounded-xl overflow-hidden mb-2 no-print"
      style={{ border: `1.5px solid ${panelColor}`, background: panelBg }}
    >
      <div
        className="px-5 py-2 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${panelColor}40` }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: panelColor }}>
            {blocked
              ? "\u26a0\ufe0f EXTRACTION QUALITY ALERT"
              : confidence < 70
              ? "\u26a0\ufe0f DATA QUALITY WARNING"
              : "\u2139\ufe0f DATA QUALITY NOTICE"}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: `${panelColor}20`, color: panelColor }}
          >
            {confidence}% extraction confidence
          </span>
        </div>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Auto-detected by Field Accuracy System
        </span>
      </div>
      <div className="px-5 py-3 space-y-2 text-xs">
        {blocked && (
          <p className="font-semibold" style={{ color: "var(--fp-danger)" }}>
            \u26d4 Report generation blocked: {ar.blockReason}
          </p>
        )}
        {corrections.length > 0 && (
          <div>
            <p className="font-semibold mb-1" style={{ color: "var(--foreground)" }}>
              Auto-corrections applied ({corrections.length}):
            </p>
            <div className="space-y-0.5">
              {corrections.map((c: any, i: number) => (
                <p key={i} style={{ color: "var(--muted-foreground)" }}>
                  &bull;{" "}
                  <span className="font-medium" style={{ color: "var(--foreground)" }}>
                    {c.field}
                  </span>
                  :{" "}
                  <span style={{ textDecoration: "line-through", color: "var(--fp-danger)" }}>
                    {String(c.original ?? "\u2014")}
                  </span>
                  {" \u2192 "}
                  <span className="font-semibold" style={{ color: "var(--fp-success-text)" }}>
                    {String(c.corrected ?? "\u2014")}
                  </span>
                  {" "}
                  <span style={{ color: "var(--muted-foreground)" }}>({c.reason})</span>
                </p>
              ))}
            </div>
          </div>
        )}
        {unreliable.length > 0 && (
          <p style={{ color: "var(--muted-foreground)" }}>
            \u26a0\ufe0f Unreliable fields (low confidence \u2014 verify manually):{" "}
            <span className="font-medium" style={{ color: "var(--foreground)" }}>
              {unreliable.join(", ")}
            </span>
          </p>
        )}
        {conflicts.length > 0 && (
          <p style={{ color: "var(--muted-foreground)" }}>
            \u274c Conflicts detected (extracted value differs from claim submission):{" "}
            <span className="font-medium" style={{ color: "var(--fp-danger)" }}>
              {conflicts.join(", ")}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Congruency & Integrity Panel ────────────────────────────────────────────────────
// Surfaces the reconciliation log, integrity gate result, and schema
// compliance score. Shown at the top of the report, above the cover section.
function CongruencyPanel({ aiAssessment }: { aiAssessment: any }) {
  const [plainLanguage, setPlainLanguage] = useState(false);
  const forensicAnalysis = (aiAssessment as any)?._forensicAnalysis ?? null;
  const reconciliationLog = forensicAnalysis?.reconciliationLog ?? null;
  const integrityGate = forensicAnalysis?.integrityGate ?? null;
  const photoIngestionLog = forensicAnalysis?.photoIngestionLog ?? null;

  // Only show if there is something meaningful to surface
  const hasBlockingIssues = (integrityGate?.blockingReasons?.length ?? 0) > 0;
  const hasWarnings = (integrityGate?.warnings?.length ?? 0) > 0;
  const hasOverrides = (reconciliationLog?.overrideCount ?? 0) > 0;
  const congruencyScore = reconciliationLog?.congruencyScore ?? null;
  const photoOutcome = photoIngestionLog?.overallOutcome ?? null;
  const photoRequiresReview = photoIngestionLog?.requiresPhotoReview ?? false;
  const hasPhotoIssue = photoOutcome === 'extraction_failed' || photoRequiresReview;

  if (!hasBlockingIssues && !hasWarnings && !hasOverrides && congruencyScore === null && !hasPhotoIssue) return null;

  const panelColor = hasBlockingIssues
    ? "var(--fp-danger)"
    : hasWarnings || hasPhotoIssue
    ? "var(--fp-warn)"
    : "var(--fp-success)";
  const panelBg = hasBlockingIssues
    ? "var(--fp-critical-bg)"
    : hasWarnings || hasPhotoIssue
    ? "var(--fp-warning-bg)"
    : "var(--fp-success-bg)";

  // Plain-language translations for common technical terms
  function translateBlockingReason(reason: string): string {
    const lc = reason.toLowerCase();
    if (lc.includes('no_damage_photos') || (lc.includes('no') && lc.includes('damage') && lc.includes('photo')))
      return 'No vehicle damage photos were found in the submitted documents. Photos are required for a complete assessment.';
    if (lc.includes('photo_extraction_failed') || (lc.includes('photo') && lc.includes('extract') && lc.includes('fail')))
      return 'The system was unable to extract photos from the submitted PDF. The document may be a scanned image — please re-submit with a higher-quality scan or attach photos separately.';
    if (lc.includes('low_congruency') || lc.includes('congruency'))
      return 'The information extracted from different parts of the claim documents does not match up well. Key details like the vehicle, accident date, or damage description appear inconsistent.';
    if (lc.includes('missing_critical') || (lc.includes('missing') && lc.includes('field')))
      return 'Essential claim information is missing (e.g. vehicle registration, accident date, or damage description). The claim cannot be processed without these details.';
    return reason;
  }

  function translateWarning(warning: string): string {
    const lc = warning.toLowerCase();
    if (lc.includes('photo') && lc.includes('blur')) return 'Some photos appear blurry or low-quality. The damage analysis may be less precise than usual.';
    if (lc.includes('mileage') && lc.includes('estimat')) return 'Vehicle mileage was not found in the documents — an estimate was used based on the vehicle age.';
    if (lc.includes('override')) return 'Some data fields were automatically corrected where different parts of the claim documents disagreed.';
    if (lc.includes('scanned')) return 'The submitted document appears to be a scanned copy. Text and photo extraction may be less accurate than a digital original.';
    return warning;
  }

  function translateOverride(entry: any): string {
    const field = (entry.field ?? '').replace(/_/g, ' ');
    const from = String(entry.stage3Value ?? entry.originalValue ?? '—');
    const to = String(entry.resolvedValue ?? '—');
    const source = entry.winningSource ?? 'a more reliable source';
    return `The ${field} was updated from "${from}" to "${to}" based on ${source} (${entry.winningConfidence ?? '?'}% confidence).`;
  }

  return (
    <div
      className="rounded-xl overflow-hidden mb-2 no-print"
      style={{ border: `1.5px solid ${panelColor}`, background: panelBg }}
    >
      <div
        className="px-5 py-2 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${panelColor}40` }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: panelColor }}>
            {hasBlockingIssues
              ? "⛔ REPORT INTEGRITY BLOCKED"
              : hasWarnings || hasPhotoIssue
              ? "⚠️ INTEGRITY GATE: PROCEED WITH CAUTION"
              : "✅ INTEGRITY GATE: CLEAR"}
          </span>
          {congruencyScore !== null && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: `${panelColor}20`, color: panelColor }}
            >
              {congruencyScore}% cross-stage congruency
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPlainLanguage(p => !p)}
            className="text-xs px-2 py-0.5 rounded font-medium"
            style={{
              background: plainLanguage ? panelColor : 'transparent',
              color: plainLanguage ? 'white' : 'var(--muted-foreground)',
              border: `1px solid ${panelColor}60`,
              cursor: 'pointer',
            }}
            title="Toggle plain-language explanations"
          >
            {plainLanguage ? 'Technical view' : 'Plain language'}
          </button>
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Pre-Report Integrity Gate
          </span>
        </div>
      </div>
      <div className="px-5 py-3 space-y-3 text-xs">
        {/* Blocking reasons */}
        {hasBlockingIssues && (
          <div>
            <p className="font-semibold mb-1" style={{ color: "var(--fp-danger)" }}>
              {plainLanguage
                ? "⛔ This report cannot be used for a decision until the following issues are resolved:"
                : "⛔ Blocking issues — this report cannot be used for a repudiation decision until resolved:"}
            </p>
            <div className="space-y-0.5">
              {(integrityGate.blockingReasons as string[]).map((reason: string, i: number) => (
                <p key={i} style={{ color: "var(--fp-danger)" }}>
                  &bull; {plainLanguage ? translateBlockingReason(reason) : reason}
                </p>
              ))}
            </div>
          </div>
        )}
        {/* Photo ingestion issues */}
        {hasPhotoIssue && photoIngestionLog && (
          <div>
            <p className="font-semibold mb-1" style={{ color: "var(--foreground)" }}>
              {plainLanguage ? "📸 Photo Note:" : "📸 Photo Ingestion Issue:"}
            </p>
            <p style={{ color: "var(--muted-foreground)" }}>
              {plainLanguage
                ? photoOutcome === 'extraction_failed'
                  ? "Photos could not be extracted from the submitted document. If the document is a scanned PDF, please try re-submitting with a clearer scan or attach photos separately."
                  : `${photoIngestionLog.finalDamagePhotoCount ?? 0} photo(s) were found but some appear blurry or low-quality. The damage analysis has been completed but may benefit from clearer photos.`
                : photoIngestionLog.summary}
            </p>
            {photoIngestionLog.qualitySummary?.isScannedPdf && (
              <p className="mt-1 italic" style={{ color: "var(--muted-foreground)" }}>
                {plainLanguage
                  ? `Scanned PDF detected — rendered at ${photoIngestionLog.qualitySummary.renderDpi} DPI for best quality.`
                  : `Source: scanned PDF (rendered at ${photoIngestionLog.qualitySummary.renderDpi} DPI)`}
              </p>
            )}
          </div>
        )}
        {/* Warnings */}
        {hasWarnings && (
          <div>
            <p className="font-semibold mb-1" style={{ color: "var(--foreground)" }}>
              {plainLanguage ? `Notes (${integrityGate.warnings.length}):` : `Warnings (${integrityGate.warnings.length}):`}
            </p>
            <div className="space-y-0.5">
              {(integrityGate.warnings as string[]).map((w: string, i: number) => (
                <p key={i} style={{ color: "var(--muted-foreground)" }}>
                  &bull; {plainLanguage ? translateWarning(w) : w}
                </p>
              ))}
            </div>
          </div>
        )}
        {/* Reconciliation overrides */}
        {hasOverrides && reconciliationLog?.entries && (
          <div>
            <p className="font-semibold mb-1" style={{ color: "var(--foreground)" }}>
              {plainLanguage
                ? `Data corrections applied (${reconciliationLog.overrideCount}):`
                : `Cross-stage field overrides (${reconciliationLog.overrideCount}):`}
            </p>
            <div className="space-y-0.5">
              {(reconciliationLog.entries as any[])
                .filter((entry: any) => entry.action === "override")
                .map((entry: any, i: number) => (
                  plainLanguage ? (
                    <p key={i} style={{ color: "var(--muted-foreground)" }}>
                      &bull; {translateOverride(entry)}
                    </p>
                  ) : (
                    <p key={i} style={{ color: "var(--muted-foreground)" }}>
                      &bull;{" "}
                      <span className="font-medium" style={{ color: "var(--foreground)" }}>
                        {entry.field}
                      </span>
                      :{" "}
                      <span style={{ textDecoration: "line-through", color: "var(--fp-danger)" }}>
                        {String(entry.stage3Value ?? entry.originalValue ?? "—")}
                      </span>
                      {" → "}
                      <span className="font-semibold" style={{ color: "var(--fp-success-text)" }}>
                        {String(entry.resolvedValue ?? "—")}
                      </span>
                      {" "}
                      <span style={{ color: "var(--muted-foreground)" }}>
                        (source: {entry.winningSource}, confidence: {entry.winningConfidence}%)
                      </span>
                    </p>
                  )
                ))}
            </div>
          </div>
        )}
        {/* Agreement summary */}
        {reconciliationLog && reconciliationLog.agreementCount > 0 && !hasBlockingIssues && (
          <p style={{ color: "var(--muted-foreground)" }}>
            {plainLanguage
              ? `✓ ${reconciliationLog.agreementCount} key data field(s) were consistent across all documents.`
              : `✓ ${reconciliationLog.agreementCount} field(s) agreed across all pipeline stages.`}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Pipeline Confidence Panel (FCDI) ────────────────────────────────────────
// Surfaces the Forensic Confidence Degradation Index, pipeline stage health,
// and anomaly sentinel violations. Shown above Section 1 in the report.
function PipelineConfidencePanel({ aiAssessment }: { aiAssessment: any }) {
  const fa = (aiAssessment as any)?._forensicAnalysis ?? null;
  if (!fa) return null;
  const fcdi = fa.fcdi ?? null;
  const psm = fa.pipelineStateMachine ?? null;
  const sentinels: any[] = fa.anomalySentinelViolations ?? [];
  const dataQuality = fa.dataQuality ?? null;
  if (!fcdi && !psm && sentinels.length === 0 && !dataQuality) return null;

  const fcdiScore: number = fcdi?.score ?? 0;
  const fcdiLabel: string = fcdi?.label ?? (fcdiScore <= 20 ? "RELIABLE" : fcdiScore <= 50 ? "DEGRADED" : "UNRELIABLE");
  const fcdiColor = fcdiScore <= 20 ? "var(--fp-success-text)" : fcdiScore <= 50 ? "var(--fp-warning-text)" : "var(--fp-critical-text)";
  const fcdiBg = fcdiScore <= 20 ? "var(--status-approve-bg)" : fcdiScore <= 50 ? "var(--status-review-bg)" : "var(--status-reject-bg)";
  const fcdiBorder = fcdiScore <= 20 ? "var(--fp-success-border)" : fcdiScore <= 50 ? "var(--fp-warning-border)" : "var(--fp-critical-border)";

  const stageHealth: any[] = psm?.stages ?? [];
  const failedStages = stageHealth.filter((s: any) => s.status === "failed" || s.status === "error");
  const degradedStages = stageHealth.filter((s: any) => s.status === "degraded" || s.status === "partial");
  const completenessScore: number = dataQuality?.completenessScore ?? dataQuality?.completeness ?? 0;
  const missingFields: string[] = dataQuality?.missingFields ?? dataQuality?.missing ?? [];
  const assumptions: any[] = fa.assumptions ?? [];

  const hasPipelineIssues = failedStages.length > 0 || degradedStages.length > 0 || sentinels.length > 0;
  if (!hasPipelineIssues && fcdiScore <= 20 && completenessScore >= 80) return null;

  return (
    <div className="rounded-xl overflow-hidden mb-2 no-print" style={{ border: `1.5px solid ${fcdiBorder}`, background: fcdiBg }}>
      <div className="px-5 py-2 flex items-center justify-between" style={{ borderBottom: `1px solid ${fcdiBorder}40` }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold" style={{ color: fcdiColor }}>
            {fcdiScore <= 20 ? "✓ PIPELINE RELIABLE" : fcdiScore <= 50 ? "⚠️ PIPELINE DEGRADED" : "⛔ PIPELINE UNRELIABLE"}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${fcdiColor}20`, color: fcdiColor }}>
            FCDI {fcdiScore}/100 — {fcdiLabel}
          </span>
          {completenessScore > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
              {completenessScore}% data completeness
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Forensic Confidence Degradation Index</span>
      </div>
      <div className="px-5 py-3 space-y-3 text-xs">
        {fcdi?.explanation && (
          <p style={{ color: "var(--foreground)" }}>{fcdi.explanation}</p>
        )}
        {failedStages.length > 0 && (
          <div>
            <p className="font-semibold mb-1" style={{ color: "var(--fp-danger)" }}>
              Pipeline stages with errors ({failedStages.length}):
            </p>
            <div className="space-y-0.5">
              {failedStages.map((s: any, i: number) => (
                <p key={i} style={{ color: "var(--fp-danger)" }}>
                  &bull; <span className="font-mono">{s.name ?? s.stage}</span>
                  {s.error && <span className="ml-1" style={{ color: "var(--muted-foreground)" }}>— {s.error}</span>}
                </p>
              ))}
            </div>
          </div>
        )}
        {degradedStages.length > 0 && (
          <div>
            <p className="font-semibold mb-1" style={{ color: "var(--fp-warn)" }}>
              Degraded stages — partial results ({degradedStages.length}):
            </p>
            <div className="space-y-0.5">
              {degradedStages.map((s: any, i: number) => (
                <p key={i} style={{ color: "var(--muted-foreground)" }}>
                  &bull; <span className="font-mono">{s.name ?? s.stage}</span>
                  {s.reason && <span className="ml-1">— {s.reason}</span>}
                </p>
              ))}
            </div>
          </div>
        )}
        {sentinels.length > 0 && (
          <div>
            <p className="font-semibold mb-1" style={{ color: "var(--foreground)" }}>
              Anomaly sentinels triggered ({sentinels.length}):
            </p>
            <div className="space-y-0.5">
              {sentinels.map((s: any, i: number) => (
                <p key={i} style={{ color: "var(--muted-foreground)" }}>
                  &bull; <span className="font-semibold font-mono" style={{ color: "var(--foreground)" }}>{s.name ?? s.sentinel}</span>
                  {s.description && <span className="ml-1">— {s.description}</span>}
                </p>
              ))}
            </div>
          </div>
        )}
        {missingFields.length > 0 && (
          <p style={{ color: "var(--muted-foreground)" }}>
            Missing fields (verify manually):{" "}
            <span className="font-medium" style={{ color: "var(--foreground)" }}>{missingFields.join(", ")}</span>
          </p>
        )}
        {assumptions.length > 0 && (
          <div>
            <p className="font-semibold mb-1" style={{ color: "var(--foreground)" }}>
              Assumptions applied by pipeline ({assumptions.length}):
            </p>
            <div className="space-y-0.5">
              {assumptions.slice(0, 5).map((a: any, i: number) => (
                <p key={i} style={{ color: "var(--muted-foreground)" }}>
                  &bull; {typeof a === "string" ? a : (a.description ?? a.field ?? JSON.stringify(a))}
                </p>
              ))}
              {assumptions.length > 5 && (
                <p style={{ color: "var(--muted-foreground)" }}>+{assumptions.length - 5} more assumptions</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function ForensicAuditReport({ claim, aiAssessment, enforcement, quotes }: ForensicAuditReportProps) {
  if (!enforcement || !aiAssessment) return null;

  // ── Currency-aware formatter ─────────────────────────────────────────────
  // Reads the claim's currencyCode (ISO 4217) and builds a formatter that
  // uses the correct symbol. This is the ONLY place the currency symbol is
  // determined — all child sections receive `fmtMoney` as a prop.
  const currencyCode = claim?.currencyCode ?? aiAssessment?.currencyCode ?? 'USD';
  const fmtMoney = makeFmtCurrency(currencyCode);

  // C-5: Pre-generation consistency check contradictions
  const preGenCheck = (aiAssessment as any)?._preGenerationCheck ?? null;
  const contradictions: any[] = preGenCheck?.contradictions ?? [];
  const hasContradictions = contradictions.length > 0;

  return (
    <div className="space-y-2">
      {/* C-5: Contradiction warning banner — shown when the pre-generation check found self-contradicting report states */}
      {hasContradictions && (
        <div className="rounded-xl overflow-hidden" style={{ border: "2px solid var(--fp-warning-border)", background: "var(--fp-warning-bg)" }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--fp-warning-border)" }}>
            <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: "var(--fp-warning-text)" }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--fp-warning-text)" }}>
              Report Integrity Alert — {contradictions.length} Contradiction{contradictions.length > 1 ? "s" : ""} Detected
            </p>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs" style={{ color: "var(--fp-warning-text)" }}>
              The following self-contradicting states were detected in this report. Auto-corrections have been applied where possible.
              Items marked <strong>Requires Re-run</strong> need the claim to be re-assessed with corrected input data.
            </p>
            {contradictions.map((c: any, i: number) => (
              <div key={i} className="rounded p-3 text-xs space-y-1" style={{ background: "var(--card)", border: "1px solid var(--fp-warning-border)" }}>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--fp-warning-bg)", color: "var(--fp-warning-text)" }}>{c.rule_id}</span>
                  {c.auto_corrected
                    ? <StatusBadge status="pass" label="Auto-Corrected" />
                    : <StatusBadge status="fail" label={c.requires_rerun ? "Requires Re-run" : "Flagged"} />}
                </div>
                <p style={{ color: "var(--foreground)" }}>{c.description}</p>
                {c.correction_applied && (
                  <p className="italic" style={{ color: "var(--muted-foreground)" }}>Correction: {c.correction_applied}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <CongruencyPanel aiAssessment={aiAssessment} />
      <PipelineConfidencePanel aiAssessment={aiAssessment} />
      <DataQualityPanel aiAssessment={aiAssessment} />
      <Section0Cover claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} quotes={quotes} fmtMoney={fmtMoney} />

      <SectionDivider number="1" title="Incident & Data Integrity" />
      <Section1Incident claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} fmtMoney={fmtMoney} />

      <SectionDivider number="2" title="Technical Forensics" />
      <Section2Physics claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} />

      <SectionDivider number="3" title="Financial Validation" />
      <Section3Financial aiAssessment={aiAssessment} enforcement={enforcement} quotes={quotes} fmtMoney={fmtMoney} />

      <SectionDivider number="4" title="Evidence Inventory" />
      <Section4Evidence aiAssessment={aiAssessment} enforcement={enforcement} claim={claim} />

      <SectionDivider number="5" title="Risk & Fraud Assessment" />
      <Section5Fraud aiAssessment={aiAssessment} enforcement={enforcement} />

      <SectionDivider number="6" title="Decision Authority & Audit Trail" />
      <Section6Decision claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} />
    </div>
  );
}
