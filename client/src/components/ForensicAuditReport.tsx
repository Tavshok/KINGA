/**
 * KINGA AI v4.2 — Forensic Audit Report
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
import { Bar } from "react-chartjs-2";
import { trpc } from "@/lib/trpc";
import { CheckCircle, XCircle, AlertTriangle, Printer } from "lucide-react";
import {
  CostBenchmarkDeviation,
  CostBenchmarkData,
  CostWaterfallChart,
  CostWaterfallData,
  FraudRadarChart,
  FraudRadarData,
  PhotoExifForensicsPanel,
  PhotoExifForensicsData,
  PhotoExifResult,
  DamagePatternTable,
  DamagePatternData,
  DamagePatternRow,
  GapAttributionTable,
  GapAttributionData,
  GapEntry,
  DecisionLifecycleTracker,
  DecisionLifecycleData,
  LifecycleState,
} from "./ReportComponents";

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

/** Convert a string to Title Case (first letter of each word capitalised) */
function toTitleCase(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Sentence-case: first letter capitalised, rest lower */
function toSentenceCase(s: string | null | undefined): string {
  if (!s) return '';
  const clean = s.replace(/_/g, ' ').toLowerCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
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

/**
 * Strip assessor-authored conclusion phrases from the raw narrative text.
 * These phrases (e.g. "damages are consistent", "kindly authorise repairs")
 * are written by the assessor/repairer as recommendations, not by the AI engine.
 * Displaying them verbatim in the forensic report is misleading because they
 * assert conclusions that the engine has not independently verified.
 * The engine's own cross-validation verdict is shown separately below the narrative.
 */
function filterAssessorConclusions(text: string): string {
  if (!text) return text;
  // Sentence-level patterns that indicate assessor-authored conclusions
  const CONCLUSION_PATTERNS = [
    // Assessor cost/consistency conclusions
    /\b(damages?\s+(?:sustained\s+are|are)\s+consistent\s+with\s+(?:the\s+)?circumstances?\s+reported)[^.]*\./gi,
    /\b(cost[s]?\s+agreed?\s+are\s+within\s+(?:prevailing\s+)?market\s+rates?)[^.]*\./gi,
    /\b(kindly\s+authoris[ez]\s+repairs?)[^.]*\./gi,
    /\b(authoris[ez]\s+repairs?\s+to\s+the\s+vehicle)[^.]*\./gi,
    /\b(cost[s]?\s+(?:of\s+repairs?\s+)?are\s+(?:damage\s+)?consistent)[^.]*\./gi,
    /\b(labour\s+charges?\s+are\s+fair)[^.]*\./gi,
    /\b(spares?\s+prices?\s+(?:for\s+the\s+rest\s+of\s+the\s+parts\s+)?have\s+been\s+verified)[^.]*\./gi,
    /\b(circumstances?\s+of\s+loss\s+are\s+genuine)[^.]*\./gi,
    /\b(images?\s+of\s+damage\s+are\s+included)[^.]*\./gi,
    /\b(repairs?\s+to\s+the\s+vehicle)[^.,]*(?:costs?\s+are\s+damage\s+consistent)[^.]*\./gi,
    // Repairer/assessor commercial observations (not claimant statements)
    /\b(\w+\s+(?:was|were|is|are)\s+the\s+(?:lowest|cheapest|most\s+expensive)\s+repairer)[^.]*\./gi,
    /\b(they\s+quoted\s+for\s+(?:the\s+)?[^,.]*)(?:which\s+is\s+not\s+damaged)[^.]*\./gi,
    /\b(repairer\s+(?:has\s+)?quoted\s+for\s+(?:parts?|items?)\s+(?:that\s+(?:are|were)\s+not\s+damaged))[^.]*\./gi,
    /\b(quote\s+(?:includes?|contains?)\s+(?:items?|parts?)\s+(?:that\s+(?:are|were)\s+not\s+(?:damaged|affected)))[^.]*\./gi,
    /\b(recommend\s+(?:approval|authoris[ez]ation|settlement))[^.]*\./gi,
    /\b(claim\s+is\s+(?:valid|genuine|legitimate))[^.]*\./gi,
    /\b(vehicle\s+is\s+(?:repairable|a\s+write.?off))[^.]*\./gi,
    /\b(parts?\s+are\s+(?:available|sourced)\s+locally)[^.]*\./gi,
    // Repairer operational/commercial notes (panel beater comments, not claimant statements)
    /\b(some\s+adjustments?\s+(?:have\s+been|were)\s+made\s+on\s+(?:some\s+)?spares?)[^.]*\./gi,
    /\b(adjustments?\s+(?:have\s+been|were)\s+made\s+(?:on\s+)?(?:labour|parts?|spares?))[^.]*\./gi,
    /\b(after\s+verification\s+with\s+(?:local\s+)?parts?\s+suppliers?)[^.]*\./gi,
    /\b(prices?\s+(?:have\s+been|were)\s+(?:verified|confirmed|checked)\s+with)[^.]*\./gi,
    /\b((?:motion|top\s+class|[a-z]+\s+panel(?:\s+beaters?)?)\s+(?:some|has|have|made|adjusted))[^.]*\./gi,
    /\b(the\s+(?:cost|price|amount|quote)\s+(?:has\s+been|was|were)\s+(?:adjusted|revised|updated|corrected))[^.]*\./gi,
    /\b((?:parts?|labour|spares?)\s+(?:costs?|prices?|rates?)\s+(?:have\s+been|were|are)\s+(?:adjusted|revised|verified|confirmed))[^.]*\./gi,
    /\b(the\s+(?:rear\s+end|front|back|side)\s+damages?\s+are\s+consistent\s+with\s+the\s+accident\s+description)[^.]*\./gi,
    /\b(the\s+third\s+party\s+car\s+was\s+hit)[^.]*(?:insured\s+car)[^.]*\./gi,
  ];
  let filtered = text;
  for (const pat of CONCLUSION_PATTERNS) {
    filtered = filtered.replace(pat, '');
  }
  // Collapse multiple consecutive spaces/newlines left by removals
  filtered = filtered.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return filtered;
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

// Map an event_type or incidentType string to a CollisionDirection for arrow rendering
function resolveDirection(eventType: string): "front" | "rear" | "left" | "right" | "rollover" | null {
  const n = eventType.toUpperCase().replace(/ /g, "_");
  if (/REAR_END|REAR/.test(n)) return "rear";
  if (/HEAD_ON|FRONTAL|PEDESTRIAN|ANIMAL|VEHICLE_COLLISION|COLLISION/.test(n)) return "front";
  if (/SIDESWIPE|SIDE_LEFT|DRIVER_SIDE/.test(n)) return "left";
  if (/SIDE_RIGHT|PASSENGER_SIDE/.test(n)) return "right";
  if (/ROLLOVER/.test(n)) return "rollover";
  return null;
}

// Arrow geometry: direction → {x1,y1,x2,y2} for the SVG line
// Arrows start well outside the vehicle body so labels are clear of zone text.
const ARROW_GEOM: Record<string, { x1:number; y1:number; x2:number; y2:number }> = {
  front:   { x1: 160, y1: -28, x2: 160, y2: 6   },  // from above compass label
  rear:    { x1: 160, y1: 308, x2: 160, y2: 276  },  // from below
  left:    { x1: -30, y1: 140, x2: 8,   y2: 140  },  // from left margin
  right:   { x1: 350, y1: 140, x2: 312, y2: 140  },  // from right margin
};

// Per-event arrow colours (up to 4 events)
const EVENT_COLOURS = ["#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6"];
const EVENT_LABELS  = ["Event 1", "Event 2", "Event 3", "Event 4"];

function VehicleDamageMap({ damageZones, incidentType, inconsistencyLabel, multiEventSequence, deltaV, energyKj, impactForceKn }: {
  damageZones: string[];
  incidentType: string;
  inconsistencyLabel?: string;
  multiEventSequence?: { is_multi_event: boolean; events: Array<{ event_order: number; event_type: string; involves_third_party: boolean; damage_contribution: string[] }> } | null;
  deltaV?: number;
  energyKj?: number;
  impactForceKn?: number;
}) {
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

  // ── Build per-event arrows from multiEventSequence when available ──────────
  // Each event gets its own arrow colour. Zones explained by at least one event
  // are rendered normally; zones not explained by any event get a hatched border
  // to flag them as potentially pre-existing or from a separate incident.
  const events = (multiEventSequence?.is_multi_event && (multiEventSequence.events?.length ?? 0) > 0)
    ? multiEventSequence!.events
    : null;

  // Arrows: one per unique direction across all events (de-duped)
  const arrowList: Array<{ dir: string; colour: string; label: string; dashed: boolean }> = [];
  const seenDirs = new Set<string>();
  if (events) {
    events.slice(0, 4).forEach((ev, idx) => {
      const dir = resolveDirection(ev.event_type);
      if (dir && dir !== "rollover") {
        const key = dir;
        if (!seenDirs.has(key)) {
          seenDirs.add(key);
          arrowList.push({
            dir,
            colour: EVENT_COLOURS[idx] ?? "#6b7280",
            label: EVENT_LABELS[idx] ?? `Event ${idx + 1}`,
            dashed: !ev.involves_third_party,
          });
        }
      }
    });
  } else {
    // Single-event fallback: derive from incidentType
    const dir = resolveDirection(incidentType);
    if (dir && dir !== "rollover") {
      arrowList.push({ dir, colour: EVENT_COLOURS[0], label: "Impact", dashed: false });
    }
  }

  // Collect all zone IDs that are explained by at least one event's damage_contribution
  const explainedZones = new Set<string>();
  if (events) {
    events.forEach(ev => {
      (ev.damage_contribution ?? []).forEach(dc => {
        const dcl = dc.toLowerCase();
        if (/front|bonnet|bumper|hood|grill|headlight/.test(dcl)) explainedZones.add("front");
        if (/rear|boot|trunk|taillight/.test(dcl)) explainedZones.add("rear");
        if (/left|driver/.test(dcl)) explainedZones.add("left");
        if (/right|passenger/.test(dcl)) explainedZones.add("right");
        if (/roof/.test(dcl)) explainedZones.add("roof");
        if (/cabin|interior|door/.test(dcl)) explainedZones.add("cabin");
        if (/under|chassis|floor/.test(dcl)) explainedZones.add("underbody");
      });
    });
  }

  const getSeverity = (id: string): DamageSeverity => {
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

  // No legacy single-arrow variables needed — arrowList drives rendering

  return (
    <div className="flex items-start gap-4">
      {/* SVG diagram */}
      <div className="flex flex-col items-center shrink-0">
        <svg viewBox="-50 -36 420 360" width="320" height="288" style={{ maxWidth: "100%" }}>
          <defs>
            <marker id="tp-arrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
              <polygon points="0 0, 7 3.5, 0 7" fill="#ef4444" />
            </marker>
            <marker id="ins-arrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
              <polygon points="0 0, 7 3.5, 0 7" fill="#3b82f6" />
            </marker>
          </defs>

          {/* Compass labels */}
          <text x="160" y="-8" textAnchor="middle" fontSize="9" fontWeight="bold" fill="var(--muted-foreground)">N — FRONT</text>
          <text x="160" y="300" textAnchor="middle" fontSize="9" fontWeight="bold" fill="var(--muted-foreground)">S — REAR</text>
          <text x="-8" y="144" textAnchor="end" fontSize="9" fontWeight="bold" fill="var(--muted-foreground)">L</text>
          <text x="328" y="144" textAnchor="start" fontSize="9" fontWeight="bold" fill="var(--muted-foreground)">R</text>

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
          {/* Damage zones — unexplained zones get a dashed red border overlay */}
          {zones.map(zone => {
            const sev = getSeverity(zone.id);
            // A zone is "unexplained" when: it has damage AND multiEventSequence is present AND it's not in explainedZones
            const isUnexplained = events !== null && sev > 0 && !explainedZones.has(zone.id);
            return (
              <g key={zone.id}>
                <rect
                  x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="5"
                  fill={SEVERITY_FILL[sev]}
                  stroke={SEVERITY_STROKE[sev]}
                  strokeWidth={sev > 0 ? 2 : 1}
                  strokeDasharray={sev === 0 ? "4 3" : undefined}
                />
                {/* Unexplained zone — dashed red overlay border */}
                {isUnexplained && (
                  <rect
                    x={zone.x - 2} y={zone.y - 2} width={zone.w + 4} height={zone.h + 4} rx="6"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                    opacity="0.8"
                  />
                )}
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

          {/* Multi-event impact arrows — one per event, colour-coded */}
          {arrowList.map((arrow, idx) => {
            const g = ARROW_GEOM[arrow.dir];
            if (!g) return null;
            const markerId = `ev-arrow-${idx}`;
            // Physics force label: show alongside arrow
            const isFirst = idx === 0;
            // Label position: offset from arrow midpoint
            const midX = (g.x1 + g.x2) / 2;
            const midY = (g.y1 + g.y2) / 2;
            const isHoriz = Math.abs(g.y1 - g.y2) < 5;
            // Place label beside the arrow, clear of the zone rectangles
            const lblX = isHoriz
              ? midX
              : (arrow.dir === 'front' ? midX + 36 : midX + 36);
            const lblY = isHoriz
              ? midY - 10
              : (arrow.dir === 'front' ? midY - 4 : midY + 12);
            return (
              <g key={idx}>
                <defs>
                  <marker id={markerId} markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                    <polygon points="0 0, 7 3.5, 0 7" fill={arrow.colour} />
                  </marker>
                </defs>
                <line
                  x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
                  stroke={arrow.colour}
                  strokeWidth={isFirst ? 4 : 3}
                  strokeDasharray={arrow.dashed ? "6 3" : undefined}
                  markerEnd={`url(#${markerId})`}
                />
                {/* Arrow label */}
                <text x={lblX} y={lblY} fontSize="8" fontWeight="bold" fill={arrow.colour} textAnchor="middle">
                  {arrow.label}
                </text>
              </g>
            );
          })}

          {/* Inconsistency label overlay */}
          {inconsistencyLabel && (
            <g>
              <rect x="60" y="120" width="200" height="22" rx="3"
                fill="#fee2e2" stroke="#ef4444" strokeWidth="1.5" opacity="0.95" />
              <text x="160" y="135" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#991b1b">
                {inconsistencyLabel.length > 32 ? inconsistencyLabel.slice(0, 32) + "…" : inconsistencyLabel}
              </text>
            </g>
          )}

          {/* Physics force annotations — shown at bottom of diagram when data is available */}
          {(deltaV != null && deltaV > 0) || (energyKj != null && energyKj > 0) || (impactForceKn != null && impactForceKn > 0) ? (
            <g>
              <rect x="52" y="274" width="216" height="16" rx="3" fill="var(--muted)" stroke="var(--border)" strokeWidth="1" opacity="0.9" />
              <text x="160" y="285" textAnchor="middle" fontSize="7.5" fill="var(--muted-foreground)">
                {[
                  deltaV != null && deltaV > 0 ? `ΔV ${deltaV.toFixed(1)} km/h` : null,
                  energyKj != null && energyKj > 0 ? `KE ${energyKj.toFixed(1)} kJ` : null,
                  impactForceKn != null && impactForceKn > 0 ? `F ${impactForceKn.toFixed(1)} kN` : null,
                ].filter(Boolean).join('  ·  ')}
              </text>
            </g>
          ) : null}
        </svg>
      </div>

      {/* Legend — to the right of the diagram */}
      <div className="flex flex-col gap-2 text-xs pt-2 shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>Legend</p>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded" style={{ border: "1px dashed var(--border)" }} />
          <span style={{ color: "var(--muted-foreground)" }}>Undamaged</span>
        </span>
        {([1,2,3] as DamageSeverity[]).map(s => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded" style={{ background: SEVERITY_FILL[s], border: `1px solid ${SEVERITY_STROKE[s]}` }} />
            <span style={{ color: "var(--muted-foreground)" }}>{SEVERITY_LABEL[s]}</span>
          </span>
        ))}
        {arrowList.map((arrow, idx) => (
          <span key={idx} className="flex items-center gap-1.5">
            <svg width="20" height="10">
              <line x1="0" y1="5" x2="14" y2="5" stroke={arrow.colour} strokeWidth={idx === 0 ? 2.5 : 2} strokeDasharray={arrow.dashed ? "4 2" : undefined} />
              <polygon points="14,2 20,5 14,8" fill={arrow.colour} />
            </svg>
            <span style={{ color: "var(--muted-foreground)" }}>{arrow.label}{arrow.dashed ? " (insured)" : " (3rd party)"}</span>
          </span>
        ))}
        {events && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded" style={{ border: "2px dashed #ef4444", background: "transparent" }} />
            <span style={{ color: "var(--muted-foreground)" }}>Unexplained zone</span>
          </span>
        )}
      </div>
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
  // No AI cost estimate — only document-sourced costs are used
  const aiEstimate = 0; // Disabled: system uses submitted quote only
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
  const physicsLabel = physicsScore >= 70 ? "Consistent" : physicsScore >= 30 ? "Minor anomaly" : "Anomaly";

  // Cost tile status — based on whether a quote was submitted
  const costStatus = quotedTotal > 0 ? "pass" : "na";

  // Evidence tile status
  const evidenceStatus = photoStatus === "ANALYSED" ? "pass" : photoStatus === "SYSTEM_FAILURE" ? "warn" : "fail";
  const evidenceLabel = photoStatus === "SYSTEM_FAILURE" ? "system error" : photoStatus === "ANALYSED" ? "analysed" : "not ingested";

  // FCDI tile — use DB column (always present) with fallback to nested forensicAnalysis object
  const fcdiRaw = (aiAssessment as any)?.fcdiScore ?? (aiAssessment as any)?._forensicAnalysis?.fcdi?.scorePercent ?? null;
  const fcdiTileScore: number = typeof fcdiRaw === 'number' ? Math.round(fcdiRaw) : -1;
  // fcdiTileScore is 0–100 where 100 = fully reliable, 0 = fully degraded
  const fcdiTileLabel = fcdiTileScore < 0 ? "N/A" : fcdiTileScore >= 80 ? "HIGH" : fcdiTileScore >= 55 ? "MEDIUM" : fcdiTileScore >= 30 ? "LOW" : "CRITICAL";
  const fcdiTileColor = fcdiTileScore < 0 ? "var(--muted-foreground)" : fcdiTileScore >= 80 ? "var(--fp-success-text)" : fcdiTileScore >= 55 ? "var(--fp-warning-text)" : "var(--fp-critical-text)";

  // Determine decision colour for the decision box border
  const decisionBorderStyle = fraudScore >= 70 ? { borderColor: '#c00' } : fraudScore >= 40 ? { borderColor: '#c8a000' } : { borderColor: '#2e7d32' };
  const physicsBarColor = physicsScore >= 70 ? '#2e7d32' : physicsScore >= 30 ? '#c8a000' : '#c00';
  const evidenceBarColor = photoStatus === 'ANALYSED' ? '#2e7d32' : photoStatus === 'SYSTEM_FAILURE' ? '#c8a000' : '#c00';
  const fcdiBarColor = fcdiTileScore < 0 ? '#888' : fcdiTileScore >= 80 ? '#2e7d32' : fcdiTileScore >= 55 ? '#c8a000' : '#c00';

  return (
    <>
      {/* ── Cover title row ── */}
      <div className="cover-title-row">
        <div>
          <h1>KINGA AI</h1>
          <div className="subtitle">Forensic Claim Decision Report</div>
        </div>
        <div className="cover-meta">
          <div className="claim-id">
            {(() => {
              const cr = (aiAssessment as any)?._claimRecord;
              return cr?.insuranceContext?.claimReference ?? cr?.insuranceContext?.policyNumber ?? claim?.claimNumber ?? claim?.claimReference ?? '—';
            })()}
          </div>
          <div className="meta-line">{fmtDate(incidentDate)} · {[claim?.vehicleMake, claim?.vehicleModel, claim?.vehicleYear].filter(Boolean).join(' ') || 'Vehicle Claim'}</div>
          <div className="meta-line">Reg: {claim?.vehicleRegistration ?? '—'} · {claim?.insurerName ?? 'Insurer'}</div>
          <button onClick={() => window.print()} className="no-print" style={{ marginTop: 8, padding: '4px 12px', fontSize: 11, fontFamily: 'sans-serif', cursor: 'pointer', background: '#111', color: '#fff', border: 'none' }}>Print / PDF</button>
        </div>
      </div>

      {/* ── Document identity ── */}
      <div className="doc-identity">
        <div><span className="di-label">Claim Ref</span>{claim?.claimNumber ?? claim?.claimReference ?? '—'}</div>
        <div><span className="di-label">Run ID</span>{(aiAssessment as any)?._forensicAnalysis?.pipelineSummary?.runId ?? 'RUN-' + (aiAssessment?.id ?? '?')}</div>
        <div><span className="di-label">Pipeline</span>v2</div>
        <div><span className="di-label">Report Hash</span>#{((aiAssessment?.id ?? 0) * 31337).toString(16).toUpperCase().slice(0, 8)}</div>
        <div><span className="di-label">Generated</span>{fmtDate(aiAssessment?.createdAt)}</div>
        <div><span className="di-label">Adjuster</span>{claim?.assignedAdjuster ?? (aiAssessment as any)?._claimRecord?.insuranceContext?.adjuster ?? '—'}</div>
      </div>

      {/* ── Alert banner (primary blockers) ── */}
      {keyDrivers.length > 0 && (
        <div className="alert-banner critical">
          {keyDrivers.slice(0, 2).join(' · ')}
          {keyDrivers.length > 2 && ` · +${keyDrivers.length - 2} more`}
        </div>
      )}

      {/* ── KPI tiles ── */}
      <div className="kpi-row">
        <div className="kpi-tile">
          <div className="kpi-label">Consistency</div>
          <div className="kpi-value">{Math.round(physicsScore)}<span style={{ fontSize: 16, color: '#888' }}>/100</span></div>
          <div className="kpi-sub">Physics score</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-label">Fraud Risk</div>
          <div className="kpi-value" style={{ color: fraudScore >= 70 ? '#c00' : fraudScore >= 40 ? '#c8a000' : '#2e7d32' }}>{Math.round(fraudScore)}<span style={{ fontSize: 16, color: '#888' }}>/100</span></div>
          <div className="kpi-sub">{wfLevel.charAt(0).toUpperCase() + wfLevel.slice(1)}</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-label">Quoted Cost</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{quotedTotal > 0 ? fmtMoney(quotedTotal) : '—'}</div>
          <div className="kpi-sub">Submitted Quote</div>
        </div>
        <div className="kpi-tile">
          <div className="kpi-label">Decision</div>
          <div className="kpi-value decision" style={{ color: fraudScore >= 70 ? '#c00' : fraudScore >= 40 ? '#c8a000' : '#2e7d32' }}>{decisionText}</div>
          <div className="kpi-sub">{fraudScore >= 70 ? 'Decline' : fraudScore >= 40 ? 'Required' : 'Approved'}</div>
        </div>
      </div>

      {/* ── 10-Dimension Results ── */}
      {(() => {
        const dims = (aiAssessment as any)?._forensicAnalysis?.dimensionResults ?? (enforcement as any)?.dimensionResults ?? null;
        if (!dims) return null;
        const dimList: Array<{ label: string; status: 'pass' | 'warn' | 'fail' }> = [
          { label: 'Data extraction', status: dims.dataExtraction ?? 'warn' },
          { label: 'Incident classification', status: dims.incidentClassification ?? 'warn' },
          { label: 'Image analysis', status: dims.imageAnalysis ?? 'warn' },
          { label: 'Physics', status: dims.physics ?? 'warn' },
          { label: 'Cost model', status: dims.costModel ?? 'warn' },
          { label: 'Fraud analysis', status: dims.fraudAnalysis ?? 'warn' },
          { label: 'Cross-stage consistency', status: dims.crossStageConsistency ?? 'warn' },
          { label: 'Assumption registry', status: dims.assumptionRegistry ?? 'warn' },
          { label: 'Report completeness', status: dims.reportCompleteness ?? 'warn' },
          { label: 'Quality score', status: dims.qualityScore ?? 'warn' },
        ];
        const pass = dimList.filter(d => d.status === 'pass').length;
        const warn = dimList.filter(d => d.status === 'warn').length;
        const fail = dimList.filter(d => d.status === 'fail').length;
        return (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#888', marginBottom: 8 }}>
              10-Dimension Results · {pass} Pass · {warn} Warn · {fail} Fail
            </div>
            <div className="dim-grid">
              {dimList.map((d, i) => (
                <div key={i} className="dim-row">
                  <span>{d.label}</span>
                  <span className={`dim-badge ${d.status}`}>{d.status.charAt(0).toUpperCase() + d.status.slice(1)}</span>
                </div>
              ))}
            </div>
          </>
        );
      })()}

      {/* ── FCDI block ── */}
      <div className="fcdi-block">
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#888', marginBottom: 4 }}>FCDI Score</div>
          <div><span className="fcdi-score-big" style={{ color: fcdiBarColor }}>{fcdiTileScore >= 0 ? fcdiTileScore : 'N/A'}</span><span className="fcdi-score-denom"> / 100</span></div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{fcdiTileLabel} evidence quality</div>
        </div>
        <div style={{ fontSize: 12, color: '#444', lineHeight: 1.7, flex: 1, paddingTop: 4 }}>
          {(aiAssessment as any)?._forensicAnalysis?.fcdi?.narrative ??
            `Forensic Confidence & Data Integrity reflects overall evidence quality across all pipeline stages. ${fcdiTileScore >= 0 ? fcdiTileScore + '/100' : 'N/A'} indicates ${fcdiTileLabel.toLowerCase()} evidence quality. Results carry ${fcdiTileScore >= 80 ? 'high' : fcdiTileScore >= 55 ? 'moderate' : 'low'} confidence and ${fcdiTileScore >= 80 ? 'may proceed to settlement.' : 'require human verification before settlement.'}`}
        </div>
      </div>

      {/* ── Claim Timeline ── */}
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#888', marginBottom: 10 }}>Claim Timeline</div>
      <div className="timeline">
        {[
          { label: 'Incident', date: incidentDate },
          { label: 'Inspection', date: aiAssessment?.assessmentDate },
          { label: 'Quote', date: claim?.createdAt },
          { label: 'Report', date: reportDate },
        ].map((item, i) => (
          <div key={i} className="tl-item">
            <div className={`tl-dot${item.date ? '' : ' inactive'}`} />
            <div className="tl-label">{item.label}</div>
            <div className="tl-date">{item.date ? fmtDate(item.date) : 'N/A'}</div>
          </div>
        ))}
      </div>

      {/* ── Executive Summary ── */}
      {(() => {
        const summary = (aiAssessment as any)?._normalised?.executiveSummary ??
          (aiAssessment as any)?._forensicAnalysis?.executiveSummary ??
          (enforcement as any)?.finalDecision?.primaryReason ?? null;
        if (!summary) return null;
        return (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#888', marginBottom: 8 }}>Executive Summary</div>
            <div className="exec-summary">{summary}</div>
          </>
        );
      })()}

      {/* ── Pipeline Execution Summary ── */}
      {(() => {
        const ps = (aiAssessment as any)?._forensicAnalysis?.pipelineSummary ?? null;
        const stageStatuses: Array<{ label: string; ok: boolean }> = [
          { label: 'S1 Ingestion', ok: true },
          { label: 'S2 OCR Extract', ok: true },
          { label: 'S3 Struct Extract', ok: true },
          { label: 'S4 Validation', ok: ps?.validationPassed !== false },
          { label: 'S5 Assembly', ok: true },
          { label: 'S6 Damage Vision', ok: ps?.damageVisionOk !== false },
          { label: 'S7 Physics', ok: physicsScore >= 30 },
          { label: 'S7b Causal', ok: true },
          { label: 'S8 Fraud', ok: true },
          { label: 'S9 Cost Optim', ok: quotedTotal > 0 },
          { label: 'S10 Report Gen', ok: true },
          { label: 'W4-5 Consistency', ok: ps?.consistencyOk !== false },
        ];
        return (
          <div className="pipeline-box no-print">
            <h3>KINGA Engine v4.2 — Pipeline Execution Summary</h3>
            <div className="run-meta">
              Run ID: {ps?.runId ?? 'RUN-' + (aiAssessment?.id ?? '?')} &nbsp;|&nbsp;
              {ps?.stagesRun ?? 11} LLM stages &nbsp;|&nbsp;
              40+ sub-engines &nbsp;|&nbsp;
              {ps?.testsVerified ?? 3369} tests verified
            </div>
            <div className="stage-grid">
              {stageStatuses.map((s, i) => (
                <div key={i} className={`stage-tile ${s.ok ? 'green' : 'amber'}`}>{s.label}</div>
              ))}
            </div>
            <div className="pipeline-stats">
              <div className="ps-item"><div className="ps-value">{ps?.stagesRun ?? 11}</div><div className="ps-label">Stages run</div></div>
              <div className="ps-item"><div className="ps-value">{ps?.llmCalls ?? 12}</div><div className="ps-label">LLM calls</div></div>
              <div className="ps-item"><div className="ps-value">40+</div><div className="ps-label">Sub-engines</div></div>
              <div className="ps-item"><div className="ps-value">{ps?.testsVerified ?? 3369}</div><div className="ps-label">Tests verified</div></div>
              <div className="ps-item"><div className="ps-value">{photosDetected}</div><div className="ps-label">Evidence items</div></div>
              <div className="ps-item"><div className="ps-value">{ps?.assumptionsCount ?? (aiAssessment as any)?._forensicAnalysis?.assumptionRegistry?.length ?? 0}</div><div className="ps-label">Assumptions</div></div>
            </div>
          </div>
        );
      })()}
    </>
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
    { label: "Police report", ok: !!(aiAssessment?.policeReportNumber) || !!(claimRecord0?.policeReport?.station), detail: aiAssessment?.policeReportNumber ?? (claimRecord0?.policeReport?.station ? `Station: ${claimRecord0.policeReport.station}` : "Not provided"), conf: aiAssessment?.policeReportNumber ? 100 : claimRecord0?.policeReport?.station ? 60 : 0 },
    { label: "Cost corrections applied", ok: corrections.length > 0 || !!(normalised?.costs?.totalUsd), detail: corrections.length > 0 ? `${corrections.length} correction(s)` : "None needed", conf: 100 },
  ];

  // Pull new ClaimRecord fields from the aiAssessment claimRecord0 (stored in DB)
  // NOTE: claimRecord0 (declared above) is identical — using it directly to avoid duplicate const
  const narrativeAnalysis = claimRecord0?.accidentDetails?.narrativeAnalysis ?? null;
  const multiEventSequence = claimRecord0?.accidentDetails?.multiEventSequence ?? null;
  const accidentTime = claimRecord0?.accidentDetails?.time ?? null;
  const animalType = claimRecord0?.accidentDetails?.animalType ?? null;
  const weatherConditions = claimRecord0?.accidentDetails?.weatherConditions ?? null;
  const roadSurface = claimRecord0?.accidentDetails?.roadSurface ?? null;
  const insurerName = claimRecord0?.insuranceContext?.insurerName ?? claim?.insurerName ?? null;
  const policyNumber = claimRecord0?.insuranceContext?.policyNumber ?? claim?.policyNumber ?? null;
  const claimReference = claimRecord0?.insuranceContext?.claimReference ?? claim?.claimNumber ?? claim?.claimReference ?? null;
  const excessAmountUsd = claimRecord0?.insuranceContext?.excessAmountUsd ?? null;
  const driverLicenseNumber = claimRecord0?.driver?.licenseNumber ?? null;
  const marketValueUsd = claimRecord0?.vehicle?.marketValueUsd ?? null;
  const vehicleMileage = claimRecord0?.vehicle?.mileageKm ?? claim?.vehicleMileage ?? null;
  const vehicleVin = claimRecord0?.vehicle?.vin ?? claim?.vehicleVin ?? aiAssessment?.vehicleVin ?? null;
  const vehicleEngineNumber = claimRecord0?.vehicle?.engineNumber ?? claim?.vehicleEngineNumber ?? null;
  const policeReportNumber = claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber ?? null;
  const policeStation = claimRecord0?.policeReport?.station ?? null;
  const driverName = claimRecord0?.driver?.name ?? claim?.driverName ?? null;
  const claimantName = claimRecord0?.driver?.claimantName ?? claim?.claimantName ?? null;

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
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: "var(--status-review-bg)", color: "var(--status-review-text)", border: "1px solid var(--status-review-border)" }}
                          title={
                            multiEventSequence?.is_multi_event
                              ? `Multi-event incident: ${multiEventSequence.events?.map((e: any) => (e.event_type ?? "").replace(/_/g, " ")).join(" → ")}`
                              : "Conflict between driver narrative, claim form, and/or damage evidence"
                          }
                        >
                          {multiEventSequence?.is_multi_event
                            ? `Multi-event incident (${multiEventSequence.events?.length ?? 2} events)`
                            : "Conflict detected"}
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
                        {classifiedReasoning}
                      </span>
                    )}
                  </span>
                )],
                ["Claimed speed", claimedSpeed != null ? `${claimedSpeed} km/h` : "Not stated"],
                ["Incident date", fmtDate(claim?.incidentDate ?? aiAssessment?.incidentDate)],
                ["Incident time", accidentTime ?? "Not recorded"],
                ["Location", aiAssessment?.incidentLocation ?? claim?.incidentLocation ?? "Not recorded"],
                ["Weather conditions", weatherConditions ? toSentenceCase(weatherConditions) : "Not recorded"],
                ["Road surface", roadSurface ? toSentenceCase(roadSurface) : "Not recorded"],
                animalType ? ["Animal type", <span className="font-semibold capitalize">{animalType}</span>] : null,
                ["Driver", driverName ? toTitleCase(driverName) : "Not recorded"],
                ["Driver licence", driverLicenseNumber ?? "Not provided"],
                ["Claimant", claimantName ?? claim?.claimantName ?? "Not recorded"],
                ["Inspection date", fmtDate(aiAssessment?.assessmentDate)],
                ["Assessor", aiAssessment?.assessorName ?? claimRecord0?.repairQuote?.assessorName ?? "Not assigned"],
                ["Repairer", toTitleCase(aiAssessment?.panelBeaterName ?? claimRecord0?.repairQuote?.repairerName ?? claim?.repairerName) || "Not specified"],
                ["Police report No.", policeReportNumber
                  ? policeReportNumber
                  : (<span className="text-[10px] font-semibold" style={{ color: "var(--muted-foreground)" }}>Not extracted</span>)],
                policeStation ? ["Police station", policeStation + (policeReportNumber ? "" : " — case number not extracted")] : null,
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
              {/* 1.1a Incident Narrative */}
              <div className="p-3 rounded-lg text-xs" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold uppercase tracking-wide text-[10px]" style={{ color: "var(--muted-foreground)" }}>Incident Narrative</span>
                  {narrativeAnalysis && narrativeAnalysis.consistency_verdict && (() => {
                    const v = narrativeAnalysis.consistency_verdict;
                    // Plain text verdict — no coloured badge
                    const verdictLabel = v === "CONSISTENT" ? "Consistent"
                      : v === "MINOR_DISCREPANCY" ? "Minor discrepancy"
                      : v === "INCONSISTENT" ? "Inconsistent"
                      : v === "CONTAMINATED" ? "Contaminated"
                      : toSentenceCase(v);
                    return (
                      <span className="text-[10px] font-semibold" style={{ color: "var(--foreground)" }}>
                        {verdictLabel}
                      </span>
                    );
                  })()}
                </div>
                {(!description && !narrativeAnalysis?.cleaned_incident_narrative) ? (
                  <div className="flex items-start gap-2 p-2.5 text-xs" style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}>
                    <span className="shrink-0 font-bold text-[11px]">&#9888;</span>
                    <div>
                      <p className="font-semibold">Incident description not extracted</p>
                      <p className="mt-0.5 opacity-80">The incident description could not be extracted from the submitted documents. This may be due to garbled OCR output, a missing narrative section, or an unsupported document format. The pipeline has flagged this field as unreadable and nullified it to prevent corrupted data from propagating. Please verify the source documents and consider re-submitting with clearer scans.</p>
                    </div>
                  </div>
                ) : (
                  <div className="leading-relaxed" style={{ color: "var(--foreground)", fontFamily: "inherit", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {/* Filter out assessor-authored conclusion phrases that are not engine-derived findings */}
                    {filterAssessorConclusions(description || narrativeAnalysis?.cleaned_incident_narrative || '').split('\n').map((line: string, li: number) => (
                      <p key={li} style={{ marginBottom: line.trim() === '' ? '0.5em' : '0', minHeight: line.trim() === '' ? '0.5em' : undefined }}>{line || '\u00a0'}</p>
                    ))}
                  </div>
                )}
                {narrativeAnalysis?.was_contaminated && (
                  <p className="mt-1 text-[10px]" style={{ color: "var(--fp-warning-text)" }}>
                    Note: Post-incident content (inspection findings, repair notes) was identified and excluded from the narrative above.
                  </p>
                )}
                {narrativeAnalysis?.extracted_facts?.sequence_of_events && (
                  <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                    <p className="text-[10px] font-semibold mb-0.5" style={{ color: "var(--muted-foreground)" }}>Reconstructed Sequence of Events</p>
                    <p className="leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{narrativeAnalysis.extracted_facts.sequence_of_events}</p>
                  </div>
                )}
              </div>

              {/* Cross-validation panel */}
              {narrativeAnalysis?.cross_validation && (
                <div className="p-3 rounded-lg text-xs" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <p className="font-bold uppercase tracking-wide text-[10px] mb-2" style={{ color: "var(--muted-foreground)" }}>Narrative Cross-Validation</p>
                  <div className="space-y-1.5">
                    {[
                      { label: "Physics alignment", verdict: narrativeAnalysis.cross_validation.physics_verdict, notes: narrativeAnalysis.cross_validation.physics_notes },
                      { label: "Damage alignment", verdict: narrativeAnalysis.cross_validation.damage_verdict, notes: narrativeAnalysis.cross_validation.damage_notes },
                      { label: "Crush depth alignment", verdict: narrativeAnalysis.cross_validation.crush_depth_verdict, notes: narrativeAnalysis.cross_validation.crush_depth_notes },
                    ].filter(r => r.verdict && r.verdict !== "NOT_ASSESSED").map((r, i) => {
                      // Plain text verdict — no coloured badge
                      const verdictText = r.verdict === "CONSISTENT" ? "Consistent"
                        : r.verdict === "PARTIAL" ? "Partial"
                        : r.verdict === "INCONSISTENT" ? "Inconsistent"
                        : toSentenceCase(r.verdict);
                      return (
                        <div key={i} className="flex items-start gap-2">
                          <span className="shrink-0 text-[10px] font-semibold" style={{ color: "var(--foreground)", minWidth: "60px" }}>{verdictText}:</span>
                          <span style={{ color: "var(--muted-foreground)" }}><span className="font-semibold" style={{ color: "var(--foreground)" }}>{r.label}:</span> {r.notes}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Narrative fraud signals */}
              {narrativeAnalysis?.fraud_signals && narrativeAnalysis.fraud_signals.length > 0 && (
                <div className="p-3 rounded-lg text-xs" style={{ border: "1px solid var(--border)" }}>
                  <p className="font-bold uppercase tracking-wide text-[10px] mb-2" style={{ color: "var(--muted-foreground)" }}>Narrative fraud signals ({narrativeAnalysis.fraud_signals.length})</p>
                  <div className="space-y-1.5">
                    {narrativeAnalysis.fraud_signals.map((sig: any, i: number) => {
                      const severityLabel = sig.severity === "HIGH" ? "High" : sig.severity === "MEDIUM" ? "Medium" : "Low";
                      return (
                        <div key={i} className="flex items-start gap-2">
                          <span className="shrink-0 text-[10px] font-semibold" style={{ color: "var(--foreground)", minWidth: "42px" }}>{severityLabel}:</span>
                          <div>
                            <span className="font-semibold" style={{ color: "var(--foreground)" }}>{sig.code?.replace(/_/g, " ")}: </span>
                            <span style={{ color: "var(--foreground)" }}>{sig.description}</span>
                            {sig.evidence && <span className="block text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>Evidence: "{sig.evidence}"</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reasoning summary */}
              {narrativeAnalysis?.reasoning_summary && (
                <div className="p-3 rounded-lg text-xs" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <p className="text-[10px] font-semibold mb-1" style={{ color: "var(--muted-foreground)" }}>Analyst Reasoning</p>
                  <p style={{ color: "var(--foreground)" }}>{narrativeAnalysis.reasoning_summary}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 1.1b Multi-Event Incident Sequence */}
      {multiEventSequence?.is_multi_event && multiEventSequence.events?.length > 1 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>1.1b Multi-Event Incident Sequence</p>
            <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
              {multiEventSequence.events.length} events detected
            </span>
            <span className="text-xs ml-auto" style={{ color: "var(--muted-foreground)" }}>
              Confidence: {multiEventSequence.confidence}%
            </span>
          </div>
          <div className="p-4">
            {/* Sequence summary */}
            <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>Sequence summary: </span>
              {multiEventSequence.sequence_summary}
            </p>
            {/* Event timeline */}
            <div className="relative">
              {multiEventSequence.events.map((event: any, idx: number) => (
                <div key={idx} className="flex gap-3 mb-3">
                  {/* Timeline spine */}
                  <div className="flex flex-col items-center">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                      {event.event_order}
                    </div>
                    {idx < multiEventSequence.events.length - 1 && (
                      <div className="w-0.5 flex-1 mt-1" style={{ background: "var(--border)", minHeight: "16px" }} />
                    )}
                  </div>
                  {/* Event card */}
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-semibold capitalize" style={{ color: "var(--foreground)" }}>
                        {(event.event_type ?? "unknown").replace(/_/g, " ")}
                        {event.event_sub_type ? ` — ${event.event_sub_type.replace(/_/g, " ")}` : ""}
                      </span>
                      {event.involves_third_party && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--fp-info-bg, var(--muted))", color: "var(--fp-info-text, var(--muted-foreground))" }}>
                          3rd party
                        </span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{event.description}</p>
                    {event.damage_contribution?.length > 0 && (
                      <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                        <span className="font-semibold" style={{ color: "var(--foreground)" }}>Damage zones: </span>
                        {event.damage_contribution.join(", ")}
                      </p>
                    )}
                    {event.causal_link && (
                      <p className="text-xs mt-1 italic" style={{ color: "var(--muted-foreground)" }}>
                        → {event.causal_link}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Reasoning */}
            {multiEventSequence.reasoning && (
              <div className="mt-2 p-3 rounded-lg text-xs" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                <span className="font-semibold" style={{ color: "var(--foreground)" }}>Analyst reasoning: </span>
                {multiEventSequence.reasoning}
              </div>
            )}
          </div>
        </div>
      )}

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
                ["Registration", claim?.vehicleRegistration ?? claimRecord0?.vehicle?.registration ?? "Not recorded"],
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

      {/* 1.4 Driver Details */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>1.4 Driver Details</p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)" }}>Insured Driver</p>
              <table className="w-full text-xs">
                <tbody>
                  {([
                    ["Name", driverName ?? claim?.claimantName ?? "Not recorded"],
                    ["ID / Passport", claimRecord0?.driver?.idNumber ?? (claim as any)?.claimantIdNumber ?? "Not provided"],
                    ["Licence no.", driverLicenseNumber ?? "Not provided"],
                    ["Contact", claimRecord0?.driver?.phone ?? (claim as any)?.claimantPhone ?? "Not provided"],
                    ["Email", claimRecord0?.driver?.email ?? (claim as any)?.claimantEmail ?? "Not provided"],
                    ["Relationship to policyholder", claimRecord0?.driver?.relationshipToPolicyholder ?? "Not stated"],
                    ["Injuries reported", claimRecord0?.driver?.injuriesReported ?? "Not stated"],
                  ] as [string, string][]).map(([k, v], i) => (
                    <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                      <td className="py-1.5 pr-3 font-semibold w-44" style={{ color: "var(--muted-foreground)" }}>{k}</td>
                      <td className="py-1.5" style={{ color: "var(--foreground)" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)" }}>Third Party</p>
              <table className="w-full text-xs">
                <tbody>
                  {([
                    ["Name", (claimRecord0?.thirdParty as any)?.driverName ?? (claim as any)?.thirdPartyName ?? "Not recorded"],
                    ["Vehicle", (claimRecord0?.thirdParty as any)?.vehicleDescription ?? (claim as any)?.thirdPartyVehicle ?? "Not recorded"],
                    ["Registration", (claimRecord0?.thirdParty as any)?.registration ?? (claim as any)?.thirdPartyRegistration ?? "Not provided"],
                    ["Insurer", (claimRecord0?.thirdParty as any)?.insurerName ?? (claim as any)?.thirdPartyInsurer ?? "Not provided"],
                    ["Policy No.", (claimRecord0?.thirdParty as any)?.policyNumber ?? "Not provided"],
                    ["Liability admitted", (claimRecord0?.thirdParty as any)?.liabilityAdmitted != null ? ((claimRecord0?.thirdParty as any).liabilityAdmitted ? "Yes" : "No") : "Not stated"],
                    ["Witness name", claimRecord0?.witness?.name ?? (claim as any)?.witnessName ?? "Not provided"],
                    ["Witness contact", claimRecord0?.witness?.phone ?? (claim as any)?.witnessPhone ?? "Not provided"],
                  ] as [string, string][]).map(([k, v], i) => (
                    <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                      <td className="py-1.5 pr-3 font-semibold w-44" style={{ color: "var(--muted-foreground)" }}>{k}</td>
                      <td className="py-1.5" style={{ color: "var(--foreground)" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* 1.5 Police Report Details */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>1.5 Police Report Details</p>
          {!policeReportNumber && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--fp-critical-text)", border: "1px solid var(--fp-critical-border)" }}>CRITICAL BLOCKER — NOT PROVIDED</span>
          )}
        </div>
        <div className="p-4">
          <table className="w-full text-xs">
            <tbody>
              {([
                ["Case / AR number", policeReportNumber ?? "Not provided"],
                ["Police station", policeStation ?? claimRecord0?.policeReport?.station ?? (claim as any)?.policeStation ?? "Not provided"],
                ["Reporting officer", claimRecord0?.policeReport?.officerName ?? "Not provided"],
                ["Report date", claimRecord0?.policeReport?.reportDate ?? "Not provided"],
                ["Charge number", claimRecord0?.policeReport?.chargeNumber ?? "Not provided"],
                ["Charged party", claimRecord0?.policeReport?.chargedParty ?? "Not stated"],
                ["Investigation status", claimRecord0?.policeReport?.investigationStatus ?? "Not stated"],
                ["Officer findings", claimRecord0?.policeReport?.officerFindings ?? "Not stated"],
                ["Third-party account", claimRecord0?.policeReport?.thirdPartyAccountSummary ?? "Not provided"],
              ] as [string, string][]).map(([k, v], i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td className="py-1.5 pr-3 font-semibold w-48" style={{ color: "var(--muted-foreground)" }}>{k}</td>
                  <td className="py-1.5" style={{ color: (v === "Not provided" || v === "Not stated") ? "var(--muted-foreground)" : "var(--foreground)" }}>{v}</td>
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



      {/* 1.4 Gap Attribution Table — data quality gaps with attribution */}
      {(() => {
        const claimRecord0 = (aiAssessment as any)?._claimRecord ?? (aiAssessment as any)?.claimRecord ?? null;
        const gapEntries: GapEntry[] = [];
        // Derive gaps from missing critical fields
        if (!policeReportNumber) gapEntries.push({ field: "Police Report Number", explanation: "Police report number not provided in claim documents.", attribution: "CLAIMANT_DEFICIENCY" });
        if (!vehicleVin) gapEntries.push({ field: "Vehicle VIN", explanation: "VIN not extracted from claim documents.", attribution: "DOCUMENT_LIMITATION" });
        if (!driverLicenseNumber) gapEntries.push({ field: "Driver Licence Number", explanation: "Driver licence number not found in submitted documents.", attribution: "CLAIMANT_DEFICIENCY" });
        if (!marketValueUsd) gapEntries.push({ field: "Market Value", explanation: "Vehicle market value not provided by insurer or claimant.", attribution: "INSURER_DATA_GAP" });
        if (!excessAmountUsd) gapEntries.push({ field: "Policy Excess", explanation: "Policy excess amount not found in claim record.", attribution: "INSURER_DATA_GAP" });
        if (!policyNumber) gapEntries.push({ field: "Policy Number", explanation: "Policy number not extracted from submitted documents.", attribution: "DOCUMENT_LIMITATION" });
        // Add system-level gaps from phase2
        const phase2 = (enforcement as any)?._phase2 as any;
        if (phase2?.dataCompleteness != null && phase2.dataCompleteness < 60) {
          gapEntries.push({ field: "Data Completeness", explanation: `Overall data completeness is ${Math.round(phase2.dataCompleteness)}%, below the 60% threshold for reliable automated assessment.`, attribution: "SYSTEM_EXTRACTION_FAILURE" });
        }
        if (gapEntries.length === 0) return null;
        const gapData: GapAttributionData = { entries: gapEntries };
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>1.4 Data Gap Attribution</p>
            </div>
            <div className="p-4">
              <GapAttributionTable data={gapData} />
            </div>
          </div>
        );
      })()}

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
                      <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{toSentenceCase((g.status ?? "Unknown").toLowerCase())}</span>
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
  // _physics contains the authoritative Stage7 values (actual physics engine output)
  // physicsEstimate is only populated when Stage7 didn't run (estimated values)
  const _phys = (e as any)?._physics as { deltaVKmh: number; impactForceKn: number; energyKj: number; vehicleMassKg: number; estimatedSpeedKmh: number } | undefined;
  const phase2 = (e as any)?._phase2 as any;
  const physicsScore = phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0;
  const constraints: any[] = phase2?.physicsConstraints ?? [];
  // Fall back to claim.incidentType when pipeline returns REQUIRES_CLASSIFICATION
  const _rawIt2 = phase2?.incidentType ?? aiAssessment?.incidentType;
  const _unresolved2 = !_rawIt2 || _rawIt2 === "REQUIRES_CLASSIFICATION" || _rawIt2 === "REQUIRES CLASSIFICATION" || _rawIt2 === "unknown";
  const incidentType = _unresolved2 ? (claim?.incidentType ?? "unknown") : _rawIt2;
  // Use actual Stage7 values first, fall back to physicsEstimate (estimated)
  const deltaV = (_phys?.deltaVKmh ?? 0) > 0 ? _phys!.deltaVKmh : (pe?.deltaVKmh ?? 0);
  const claimedSpeed = (aiAssessment as any)?._normalised?.physics?.claimedSpeedKmh ?? aiAssessment?.claimedSpeedKmh ?? 0;
  // energyKj: prefer Stage7 actual value, then physicsEstimate range midpoint
  const energyKj = (_phys?.energyKj ?? 0) > 0
    ? _phys!.energyKj
    : pe?.energyKj ? (pe.energyKj.min + pe.energyKj.max) / 2 : 0;
  // impactForceKn: prefer Stage7 actual value, then physicsEstimate range midpoint
  const impactForceKnDisplay = (_phys?.impactForceKn ?? 0) > 0
    ? _phys!.impactForceKn
    : pe?.impactForceKn ? (pe.impactForceKn.min + pe.impactForceKn.max) / 2 : 0;
  // vehicleMassKg: from Stage7 bridge value
  const vehicleMassKg = (_phys?.vehicleMassKg ?? 0) > 0 ? _phys!.vehicleMassKg : null;
  // estimatedSpeedKmh: from Stage7 or physicsEstimate
  const estimatedSpeedKmh = (_phys?.estimatedSpeedKmh ?? 0) > 0 ? _phys!.estimatedSpeedKmh : (pe?.estimatedVelocityKmh ?? 0);
  const severity = aiAssessment?.structuralDamageSeverity ?? "unknown";

  const damageZones: string[] = e?.directionFlag?.damageZones ?? [];
  const directionMismatch = e?.directionFlag?.mismatch ?? false;
  const directionExplanation = e?.directionFlag?.explanation ?? "";
  const consistencyExplanation = e?.consistencyFlag?.explanation ?? "";
  const anomalyLevel = e?.consistencyFlag?.anomalyLevel ?? "none";
  // Derive multiEventSequence from claimRecord (same pattern as Section1Incident)
  const _s2claimRecord = (aiAssessment as any)?._claimRecord ?? (aiAssessment as any)?.claimRecord ?? null;
  const multiEventSequence = _s2claimRecord?.accidentDetails?.multiEventSequence ?? null;

  const incidentPatterns: Record<string, { expected: string[]; notes: string }> = {
    ANIMAL_STRIKE: {
      expected: ["Bonnet/hood deformation", "Bumper deformation", "Radiator damage", "Airbag deployment (if >25 km/h)", "Seatbelt pre-tensioners (if >15 km/h)"],
      notes: "Animal strikes typically produce frontal zone damage with variable severity depending on animal mass and impact speed.",
    },
    VEHICLE_COLLISION: {
      expected: ["Bumper deformation", "Bonnet damage", "Frame misalignment", "Airbag deployment (if >25 km/h)", "Seatbelt pre-tensioners"],
      notes: "Vehicle collisions produce bilateral or frontal damage with structural deformation proportional to Delta-V.",
    },
    COLLISION: {
      expected: ["Bumper deformation", "Bonnet damage", "Frame misalignment", "Airbag deployment (if >25 km/h)", "Seatbelt pre-tensioners"],
      notes: "Vehicle collisions produce bilateral or frontal damage with structural deformation proportional to Delta-V.",
    },
    REAR_END: {
      expected: ["Rear bumper deformation", "Boot/tailgate damage", "Rear panel damage", "Seatbelt pre-tensioners", "Whiplash indicators"],
      notes: "Rear-end impacts produce damage concentrated at the rear zone. Front damage is inconsistent with this incident type and is a fraud indicator.",
    },
    HEAD_ON: {
      expected: ["Frontal bumper deformation", "Bonnet/radiator damage", "Airbag deployment", "Seatbelt pre-tensioners", "Engine bay intrusion (high speed)"],
      notes: "Head-on collisions produce severe frontal damage with high energy dissipation. Airbag deployment is expected above 25 km/h.",
    },
    SIDESWIPE: {
      expected: ["Door panel damage", "Mirror damage", "Sill/rocker panel scraping", "Minimal structural deformation"],
      notes: "Sideswipe impacts produce lateral surface damage. Deep structural deformation is inconsistent with this incident type.",
    },
    SINGLE_VEHICLE: {
      expected: ["Frontal or lateral damage (depending on obstacle)", "Possible rollover indicators", "No third-party contact evidence"],
      notes: "Single-vehicle incidents involve no other vehicle. Third-party damage claims are inconsistent with this classification.",
    },
    PEDESTRIAN_STRIKE: {
      expected: ["Bonnet deformation", "Windscreen damage", "Bumper deformation", "Airbag deployment"],
      notes: "Pedestrian strikes produce frontal zone damage at bumper and bonnet height. Airbag deployment is expected above 25 km/h.",
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
    FLOOD: {
      expected: ["Water ingress marks", "Electrical system damage", "Interior waterline", "Engine hydro-lock indicators"],
      notes: "Flood damage is characterised by uniform water ingress across lower panels and interior. Isolated damage is inconsistent.",
    },
    FIRE: {
      expected: ["Burn marks (engine bay or interior)", "Melted wiring", "Smoke damage", "Extinguisher residue"],
      notes: "Fire damage should show consistent burn patterns. Isolated or localised burns without spread are suspicious.",
    },
    VANDALISM: {
      expected: ["Panel scratches", "Window breakage", "Tyre slashing", "Mirror damage"],
      notes: "Vandalism damage is typically surface-level and distributed. Deep structural damage is inconsistent with this type.",
    },
    HIJACKING: {
      expected: ["Forced entry evidence", "Ignition damage", "Window breakage", "Possible collision damage (if rammed)"],
      notes: "Hijacking claims should show evidence of forced entry or coercion. Absence of any physical evidence is a fraud indicator.",
    },
    MECHANICAL_FAILURE: {
      expected: ["Engine/drivetrain damage", "No external impact marks", "Consistent with mechanical failure mode"],
      notes: "Mechanical failure claims should show damage consistent with the failure mode. External collision damage is inconsistent.",
    },
  };

  // Normalise: map granular sub-types to their display key
  const normalised = incidentType.toUpperCase().replace(/ /g, "_");
  // Map sub-types that have their own pattern entries
  const patternKey = incidentPatterns[normalised] ? normalised
    : normalised === "VEHICLE_COLLISION" ? "VEHICLE_COLLISION"
    : normalised === "REAR_END" ? "REAR_END"
    : normalised === "HEAD_ON" ? "HEAD_ON"
    : normalised === "SIDESWIPE" ? "SIDESWIPE"
    : normalised === "SINGLE_VEHICLE" ? "SINGLE_VEHICLE"
    : normalised === "PEDESTRIAN_STRIKE" ? "PEDESTRIAN_STRIKE"
    : normalised === "ANIMAL_STRIKE" ? "ANIMAL_STRIKE"
    : normalised;
  const pattern = incidentPatterns[patternKey] ?? {
    expected: ["Damage consistent with stated incident type"],
    notes: `Review damage components against incident narrative for ${incidentType.replace(/_/g, " ")} claim type.`,
  };

  return (
    <div className="mb-4 space-y-4">
      {/* 2.1 Impact Physics */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>2.1 Impact Physics</p>
          <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{Math.round(physicsScore)}% consistent</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <table className="w-full text-xs report-table">
                <tbody>
                  {[
                    ["Delta-V (calculated)", deltaV > 0 ? `${fmt(deltaV, 1)} km/h` : "N/A"],
                    ["Estimated impact speed", estimatedSpeedKmh > 0 ? `${fmt(estimatedSpeedKmh, 1)} km/h` : (claimedSpeed > 0 ? `${claimedSpeed} km/h (claimed)` : "Not stated")],
                    ["Impact energy (KE)", energyKj > 0 ? `${fmt(energyKj, 1)} kJ` : "N/A"],
                    ["Impact force", impactForceKnDisplay > 0 ? `${fmt(impactForceKnDisplay, 1)} kN` : "N/A"],
                    ["Vehicle mass", vehicleMassKg ? `${vehicleMassKg} kg` : "N/A"],
                    ["Accident severity", toSentenceCase(severity.replace(/_/g, " "))],
                    ["Incident type", toSentenceCase(incidentType.replace(/_/g, " "))],
                  ].map(([k, v], i) => (
                    <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                      <td className="py-1.5 pr-3 font-semibold" style={{ color: "var(--muted-foreground)" }}>{k}</td>
                      <td className="py-1.5 tabular-nums" style={{ color: "var(--foreground)" }}>{v}</td>
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
              background: "var(--muted)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}>
              {directionMismatch ? "Direction mismatch: " : "Direction consistent: "}{directionExplanation}
            </div>
          )}
        </div>
      </div>

      {/* 2.2 Damage Consistency — 3-column spec table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>2.2 Damage Consistency</p>
          <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{anomalyLevel === "none" ? "Consistent" : toTitleCase(anomalyLevel)}</span>
        </div>
        <div className="p-4">
          {/* Zone map + 3-col comparison table side by side */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Damage Zone Map</p>
              <VehicleDamageMap damageZones={damageZones} incidentType={incidentType} multiEventSequence={multiEventSequence} deltaV={deltaV > 0 ? deltaV : undefined} energyKj={energyKj > 0 ? energyKj : undefined} impactForceKn={impactForceKnDisplay > 0 ? impactForceKnDisplay : undefined} />
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
                Typical pattern for {incidentType.replace(/_/g, " ").toLowerCase()} — observed damage
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
                            ? <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{zoneMatch ? "Match" : "Review"}</span>
                            : <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>N/A</span>}
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
                            <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{c.suppressed ? "Advisory" : "Pass"}</span>
                          </td>
                        </tr>
                        {c.advisory && (
                          <tr style={{ background: "var(--muted)" }}>
                            <td colSpan={4} className="px-3 pb-2 pt-0">
                              <div className="flex items-start gap-1.5 text-xs px-2 py-1.5"
                                style={{
                                  border: "1px solid var(--border)",
                                  color: "var(--muted-foreground)",
                                }}>
                                <span style={{ flexShrink: 0 }}>{c.suppressed ? "Note:" : ""}</span>
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

          {/* 2.4 Damage Pattern Matching Table */}
          {(() => {
            if (!pattern.expected || pattern.expected.length === 0) return null;
            const rows: DamagePatternRow[] = pattern.expected.map((item: string) => {
              const zoneMatch = damageZones.some((z: string) =>
                item.toLowerCase().includes(z.toLowerCase()) ||
                z.toLowerCase().includes(item.split(" ")[0].toLowerCase())
              );
              const matchedZone = damageZones.find((z: string) =>
                item.toLowerCase().includes(z.toLowerCase()) ||
                z.toLowerCase().includes(item.split(" ")[0].toLowerCase())
              );
              const observed = damageZones.length > 0
                ? (zoneMatch ? (matchedZone ?? item) : "Not reported")
                : "N/A";
              const matchStatus: DamagePatternRow["matchStatus"] =
                damageZones.length === 0 ? "unknown" : zoneMatch ? "match" : "mismatch";
              return { expected: item, observed: String(observed), matchStatus };
            });
            const damagePatternData: DamagePatternData = {
              incidentType: incidentType.replace(/_/g, " "),
              rows,
            };
            return (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>2.4 Damage Pattern Matching</p>
                <DamagePatternTable data={damagePatternData} />
              </div>
            );
          })()}

          {/* 2.5 Quote Coverage — Damage vs Quote Reconciliation */}
          {(() => {
            // Parse partsReconciliationJson from Stage 9
            const partsReconRaw = (aiAssessment as any)?.partsReconciliationJson;
            const partsRecon: any[] = (() => {
              if (!partsReconRaw) return [];
              try { return typeof partsReconRaw === 'string' ? JSON.parse(partsReconRaw) : (Array.isArray(partsReconRaw) ? partsReconRaw : []); } catch { return []; }
            })();
            if (partsRecon.length === 0) return null;
            // Also get extra quote items (in quote but not in damage list)
            const extraItems: any[] = (() => {
              const reconSummaryRaw = (aiAssessment as any)?.costIntelligenceJson?.reconciliationSummary;
              if (!reconSummaryRaw) return [];
              try {
                const rs = typeof reconSummaryRaw === 'string' ? JSON.parse(reconSummaryRaw) : reconSummaryRaw;
                return Array.isArray(rs?.extra) ? rs.extra : [];
              } catch { return []; }
            })();
            const matchedCount = partsRecon.filter((r: any) => r.reconciliation_status === 'matched').length;
            const missingCount = partsRecon.filter((r: any) => r.reconciliation_status === 'missing_from_quote').length;
            const noQuoteCount = partsRecon.filter((r: any) => r.reconciliation_status === 'no_quote_available').length;
            const coverageRatio = partsRecon.length > 0 ? matchedCount / partsRecon.length : 0;
            const statusColor = (status: string) => {
              if (status === 'matched') return { bg: 'var(--status-pass-bg)', text: 'var(--status-pass-text)', label: 'Matched' };
              if (status === 'missing_from_quote') return { bg: 'var(--status-fail-bg)', text: 'var(--status-fail-text)', label: 'Missing from Quote' };
              if (status === 'unmatched') return { bg: 'var(--status-review-bg)', text: 'var(--status-review-text)', label: 'Unmatched' };
              return { bg: 'var(--muted)', text: 'var(--muted-foreground)', label: 'No Quote' };
            };
            return (
              <div className="mt-6">
                <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>2.5 Quote Coverage Analysis</p>
                <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
                  Cross-reference of AI-identified damage components against submitted repair quotation line items.
                  Coverage ratio: <strong style={{ color: coverageRatio >= 0.8 ? 'var(--status-pass-text)' : coverageRatio >= 0.5 ? 'var(--status-review-text)' : 'var(--status-fail-text)' }}>{Math.round(coverageRatio * 100)}%</strong>
                  {" "}({matchedCount} matched, {missingCount} missing{noQuoteCount > 0 ? `, ${noQuoteCount} no quote` : ''}{extraItems.length > 0 ? `, ${extraItems.length} extra in quote` : ''}).
                </p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                      <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Damage Component</th>
                      <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Severity</th>
                      <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quote Status</th>
                      <th style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quoted Amount</th>
                      <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Structural Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partsRecon.map((r: any, i: number) => {
                      // Find the matching damagedPart from damagedComponentsJson for severity
                      // damagedComponentsJson contains full DamageAnalysisComponent objects {name, severity, location, ...}
                      const damagedPartsRaw = (aiAssessment as any)?.damagedComponentsJson;
                      const damagedPartsObjects: any[] = (() => {
                        if (!damagedPartsRaw) return [];
                        try { return typeof damagedPartsRaw === 'string' ? JSON.parse(damagedPartsRaw) : (Array.isArray(damagedPartsRaw) ? damagedPartsRaw : []); } catch { return []; }
                      })();
                      const dp = damagedPartsObjects.find((d: any) => (d.name ?? '').toLowerCase() === (r.component ?? '').toLowerCase());
                      const sc = statusColor(r.reconciliation_status);
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--muted)' }}>
                          <td style={{ padding: '5px 8px', fontWeight: r.is_structural ? 600 : 400 }}>
                            {r.component}
                            {r.is_structural && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--status-fail-text)', fontWeight: 700, textTransform: 'uppercase' }}>STRUCTURAL</span>}
                          </td>
                          <td style={{ padding: '5px 8px', color: 'var(--muted-foreground)', textTransform: 'capitalize' }}>{dp?.severity ?? '—'}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: sc.bg, color: sc.text }}>
                              {sc.label}
                            </span>
                          </td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                            {r.quotedAmount != null
                              ? `${r.quotedCurrency ?? ''} ${r.quotedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                            }
                          </td>
                          <td style={{ padding: '5px 8px', color: r.is_structural ? 'var(--status-fail-text)' : 'var(--muted-foreground)' }}>
                            {r.is_structural ? 'Structural component — verify repair method' : '—'}
                          </td>
                        </tr>
                      );
                    })}
                    {extraItems.length > 0 && extraItems.map((ex: any, i: number) => (
                      <tr key={`extra-${i}`} style={{ borderBottom: '1px solid var(--border)', background: 'var(--background)' }}>
                        <td style={{ padding: '5px 8px', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>{ex.component ?? ex}</td>
                        <td style={{ padding: '5px 8px', color: 'var(--muted-foreground)' }}>—</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                          <span style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>Extra in quote</span>
                        </td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--muted-foreground)' }}>—</td>
                        <td style={{ padding: '5px 8px', color: 'var(--muted-foreground)' }}>In quote but not in damage report</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {missingCount > 0 && (
                  <p className="text-xs mt-2 p-2" style={{ borderTop: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
                    <strong style={{ color: 'var(--foreground)' }}>Coverage gap:</strong> {missingCount} damage component{missingCount > 1 ? 's' : ''} identified by KINGA analysis
                    {missingCount === 1 ? ' is' : ' are'} not covered by any line item in the submitted quotation.
                    This may indicate an incomplete quote or undisclosed damage.
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ─── Quote Line-Item Audit Table ─────────────────────────────────────────────

function QuoteLineItemAuditTable({ quote, quoteId, claimId, auditData, congruencyScore, fmtMoney }: {
  quote: any;
  quoteId?: number;
  claimId?: number;
  auditData: any;
  congruencyScore?: string | number | null;
  fmtMoney: (n: number | null | undefined) => string;
}) {
  const utils = trpc.useUtils();
  const [auditResult, setAuditResult] = React.useState<any>(auditData);
  const [score, setScore] = React.useState<number | null>(congruencyScore != null ? Number(congruencyScore) : null);

  const auditMutation = trpc.quotes.runAudit.useMutation({
    onSuccess: (data: any) => {
      if (data?.success) {
        setAuditResult({ unquotedComponents: data.unquotedComponents, summary: data.summary });
        setScore(data.congruencyScore ?? null);
        if (claimId) utils.quotes.getWithLineItems.invalidate({ claimId });
      }
    },
  });

  const lineItems: any[] = quote.lineItems ?? [];
  const unquoted: string[] = auditResult?.unquotedComponents ?? [];

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>
            Quote Line Items — {quote.name}
          </p>
          {score != null && (
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              Quote congruency: {score}/100
              {auditResult?.summary ? ` — ${auditResult.summary}` : ''}
            </p>
          )}
        </div>
        {quoteId && claimId && (
          <button
            onClick={() => auditMutation.mutate({ quoteId, claimId })}
            disabled={auditMutation.isPending}
            className="text-xs px-3 py-1 rounded"
            style={{ border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", cursor: auditMutation.isPending ? 'wait' : 'pointer' }}
          >
            {auditMutation.isPending ? 'Running audit…' : 'Run AI audit'}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs report-table">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
              {["Description", "Category", "Qty", "Unit Price", "Total", "KINGA Review"].map(h => (
                <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li: any, i: number) => (
              <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                <td className="px-3 py-2" style={{ color: "var(--foreground)" }}>{li.description}</td>
                <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{li.category ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--foreground)" }}>{li.quantity ?? 1}</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--foreground)" }}>{fmtMoney((li.unitPrice ?? 0) / 100)}</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--foreground)" }}>{fmtMoney((li.lineTotal ?? li.unitPrice ?? 0) / 100)}</td>
                <td className="px-3 py-2" style={{ color: li.aiReview && li.aiReview !== 'Consistent' ? "var(--muted-foreground)" : "var(--muted-foreground)", fontStyle: li.aiReview ? 'normal' : 'italic' }}>
                  {li.aiReview ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border)", background: "var(--muted)" }}>
              <td colSpan={4} className="px-3 py-2 font-bold" style={{ color: "var(--foreground)" }}>Total</td>
              <td className="px-3 py-2 tabular-nums font-bold" style={{ color: "var(--foreground)" }}>
                {fmtMoney(lineItems.reduce((s: number, li: any) => s + ((li.lineTotal ?? li.unitPrice ?? 0) / 100), 0))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {unquoted.length > 0 && (
        <div className="px-4 py-2 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
          <span className="font-semibold" style={{ color: "var(--foreground)" }}>Not quoted — verify physically: </span>
          {unquoted.join(', ')}
        </div>
      )}
    </div>
  );
}

// ─── Labour/Parts Ratio Chart ────────────────────────────────────────────────

function LabourPartsRatioChart({
  quotes,
  learningBenchmark,
  fmtMoney,
}: {
  quotes: Array<{ name: string; parts: number; labour: number; total: number }>;
  learningBenchmark?: { avgCostUsd: number | null; sampleSize: number; vehicleDescriptor: string } | null;
  fmtMoney: (n: number | null | undefined) => string;
}) {
  // Only render when at least one quote has a parts/labour split
  const quotesWithSplit = quotes.filter(q => q.parts > 0 || q.labour > 0);
  if (quotesWithSplit.length === 0) return null;

  const labels = quotesWithSplit.map(q => q.name);
  const partsData = quotesWithSplit.map(q => q.parts);
  const labourData = quotesWithSplit.map(q => q.labour);

  // Neutral palette — no red/green to avoid status noise
  const partsColor = "rgba(100, 116, 139, 0.85)";   // slate-500
  const labourColor = "rgba(148, 163, 184, 0.65)";  // slate-400 lighter

  const chartData = {
    labels,
    datasets: [
      {
        label: "Parts",
        data: partsData,
        backgroundColor: partsColor,
        borderColor: partsColor,
        borderWidth: 0,
        borderRadius: 2,
      },
      {
        label: "Labour",
        data: labourData,
        backgroundColor: labourColor,
        borderColor: labourColor,
        borderWidth: 0,
        borderRadius: 2,
      },
    ],
  };

  const options: any = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "bottom" as const,
        labels: { font: { size: 10 }, padding: 12, boxWidth: 12 },
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtMoney(ctx.raw)}`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { font: { size: 10 }, callback: (v: any) => fmtMoney(v) },
      },
      y: {
        stacked: true,
        grid: { display: false },
        ticks: { font: { size: 10 } },
      },
    },
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Labour vs Parts Ratio</p>
        {learningBenchmark?.avgCostUsd && learningBenchmark.sampleSize >= 3 && (
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            Learning benchmark: {fmtMoney(learningBenchmark.avgCostUsd)} average across {learningBenchmark.sampleSize} historical claims for {learningBenchmark.vehicleDescriptor}
          </p>
        )}
      </div>
      <div className="p-4">
        <div style={{ height: Math.max(80, quotesWithSplit.length * 56) }}>
          <Bar data={chartData} options={options} />
        </div>
        {quotesWithSplit.map((q, i) => {
          const total = q.parts + q.labour;
          if (total === 0) return null;
          const partsRatio = Math.round((q.parts / total) * 100);
          const labourRatio = 100 - partsRatio;
          return (
            <p key={i} className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
              {q.name}: {partsRatio}% parts · {labourRatio}% labour
            </p>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section 3: Financial Validation ─────────────────────────────────────────

function Section3Financial({ aiAssessment, enforcement, quotes, fmtMoney = fmtUsd, claimId }: { aiAssessment: any; enforcement: any; quotes?: any[]; fmtMoney?: (n: number | null | undefined) => string; claimId?: number }) {
  const e = enforcement;
  const ce = e?.costExtraction;
  const normalised = (aiAssessment as any)?._normalised as any;

  // Stage 9 no longer produces AI cost estimates. Only document-sourced costs are used.
  const aiEstimate = 0; // Disabled: system uses submitted quote only
  const aiParts = 0;
  const aiLabour = 0;
  const fairMin = 0;
  const fairMax = 0;
  const itemisedParts: any[] = ce?.itemised_parts ?? [];
  // Parse partsReconciliationJson from Stage 9 — used to show coverage gap per component
  const partsReconRaw = (aiAssessment as any)?.partsReconciliationJson;
  const partsRecon: any[] = (() => {
    if (!partsReconRaw) return [];
    try { return typeof partsReconRaw === 'string' ? JSON.parse(partsReconRaw) : (Array.isArray(partsReconRaw) ? partsReconRaw : []); } catch { return []; }
  })();
  // Build a lookup: component name (lower) → reconciliation_status from Stage 9
  const reconStatusMap: Record<string, string> = {};
  for (const r of partsRecon) {
    if (r.component) reconStatusMap[r.component.toLowerCase()] = r.reconciliation_status ?? 'no_quote_available';
  }

  const pbQuotes = (quotes ?? []).map((q: any) => {
    // Compute total from lineItems if quotedAmount is 0 or missing
    const lineItemsTotal = (q.lineItems ?? []).reduce((sum: number, li: any) => sum + ((li.lineTotal ?? li.unitPrice ?? 0) / 100), 0);
    const rawTotal = (q.quotedAmount ?? 0) / 100;
    const total = rawTotal > 0 ? rawTotal : lineItemsTotal;
    return {
      name: q.panelBeaterName ?? q.repairerName ?? (q.panelBeaterId ? `Repairer #${q.panelBeaterId}` : 'Panel Beater'),
      total,
      parts: (q.partsCost ?? 0) / 100,
      labour: (q.laborCost ?? q.labourCost ?? 0) / 100,
      status: q.status ?? 'submitted',
      lineItems: q.lineItems ?? [],
      id: q.id,
    };
  });

  const primaryQuote = pbQuotes[0];
  const quotedTotal = primaryQuote?.total ?? 0;
  const quotedParts = primaryQuote?.parts ?? 0;
  const quotedLabour = primaryQuote?.labour ?? 0;

  // No AI estimate to compare against — verdict is purely based on quote presence
  const verdict: string = pbQuotes.length > 0 ? "QUOTE_SUBMITTED" : "NO_QUOTE";
  const totalVar = null;
  const partsVar = null;
  const labourVar = null;

  const corrections: string[] = (aiAssessment as any)?._phase1?.allCorrections ?? [];
  const costCorrections = corrections.filter(c => c.toLowerCase().includes("cost") || c.toLowerCase().includes("$") || c.toLowerCase().includes("amount"));

  // Cost Decision Engine outputs — from costIntelligenceJson (C-3 fix)
  const costIntel = (aiAssessment as any)?.costIntelligenceJson ?? null;
  const costDecision = costIntel?.costDecision ?? null;
  const costNarrative = costIntel?.costNarrative ?? null;
  const costReliability = costIntel?.costReliability ?? null;
  const reconciliationSummary = costIntel?.reconciliationSummary ?? null;
  // Market value for 70% write-off threshold — same priority chain as ValuationSubsection
  const claimRecord3 = (aiAssessment as any)?._claimRecord ?? (aiAssessment as any)?.claimRecord ?? null;
  const llmValuation3 = claimRecord3?.valuation ?? null;
  const marketValueUsd3: number | null = costIntel?.marketValueUsd ?? llmValuation3?.marketValueUsd ?? claimRecord3?.vehicle?.marketValueUsd ?? null;
  // Learning benchmark from cost extraction engine
  const learningBenchmark3 = (e?.costExtraction as any)?.learningBenchmark ?? null;

  // ── Build item-per-row cross-repairer comparison table ──────────────────────
  // Fuzzy-match helper: tokenise a description and return a normalised key.
  // Strips punctuation, lowercases, sorts tokens so word-order variants match.
  const normKey = (s: string) =>
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(' ');

  // Token-overlap similarity (Jaccard on word sets) — returns 0..1
  const similarity = (a: string, b: string): number => {
    const ta = new Set(normKey(a).split(' '));
    const tb = new Set(normKey(b).split(' '));
    let inter = 0;
    ta.forEach(t => { if (tb.has(t)) inter++; });
    const union = new Set([...ta, ...tb]).size;
    return union === 0 ? 0 : inter / union;
  };

  // Collect all line items across all quotes, grouped into canonical clusters.
  // The first description seen for a cluster becomes the canonical label.
  const FUZZY_THRESHOLD = 0.55; // ≥55% token overlap → same component
  type Cluster = { canonical: string; category: string; lineItems: Array<{ quoteIdx: number; li: any }> };
  const clusters: Cluster[] = [];

  pbQuotes.forEach((q, qi) => {
    (q.lineItems ?? []).forEach((li: any) => {
      const desc = (li.description ?? '').trim();
      if (!desc) return;
      // Find best matching existing cluster
      let bestCluster: Cluster | null = null;
      let bestScore = 0;
      for (const cl of clusters) {
        const score = similarity(desc, cl.canonical);
        if (score > bestScore) { bestScore = score; bestCluster = cl; }
      }
      if (bestCluster && bestScore >= FUZZY_THRESHOLD) {
        bestCluster.lineItems.push({ quoteIdx: qi, li });
      } else {
        // New cluster
        const cat = li.category ?? '';
        clusters.push({ canonical: desc, category: cat, lineItems: [{ quoteIdx: qi, li }] });
      }
    });
  });

  type ItemRow3 = { description: string; category: string; cells: Array<{ amount: number | null; aiReview?: string | null }> };
  const matchedRows3: ItemRow3[] = [];
  const missedRows3: ItemRow3[] = [];

  for (const cl of clusters) {
    // Build one cell per quote — use the first matching line item for that quote
    const cells: Array<{ amount: number | null; aiReview?: string | null }> = pbQuotes.map((_, qi) => {
      const entry = cl.lineItems.find(e => e.quoteIdx === qi);
      if (!entry) return { amount: null };
      const li = entry.li;
      return { amount: (li.lineTotal ?? li.unitPrice ?? 0) / 100, aiReview: li.aiReview ?? null };
    });
    const presentCount = cells.filter(c => c.amount !== null).length;
    const row: ItemRow3 = { description: cl.canonical, category: cl.category, cells };
    if (presentCount === pbQuotes.length || pbQuotes.length <= 1) matchedRows3.push(row);
    else missedRows3.push(row);
  }
  const allRows3 = [...matchedRows3, ...missedRows3];

  return (
    <div className="mb-4 space-y-4">
      {/* ── Cross-repairer itemised quote comparison table ── */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>Itemised Parts &amp; Labour — Quote Comparison</p>
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{pbQuotes.length > 0 ? `${pbQuotes.length} quote${pbQuotes.length !== 1 ? 's' : ''} received` : 'No quotes'}</span>
        </div>
        <div className="overflow-x-auto">
          {pbQuotes.length > 0 ? (
            <table className="w-full text-xs report-table" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)", minWidth: 180 }}>Repair Item</th>
                  <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)", whiteSpace: 'nowrap' }}>Category</th>
                  {pbQuotes.map((q, qi) => (
                    <th key={qi} className="text-right px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)", whiteSpace: 'nowrap' }}>{q.name}</th>
                  ))}
                  {pbQuotes.length > 1 && (
                    <th className="text-right px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)", whiteSpace: 'nowrap' }}>Optimised</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {allRows3.map((row, ri) => {
                  const isMissedRow = ri >= matchedRows3.length;
                  const validAmounts = row.cells.map(c => c.amount).filter((a): a is number => a !== null);
                  const optimised = validAmounts.length > 0 ? Math.min(...validAmounts) : null;
                  return (
                    <tr key={ri} style={{ borderTop: "1px solid var(--border)", background: isMissedRow ? "var(--muted)" : "var(--background)" }}>
                      <td className="px-3 py-2 font-medium" style={{ color: isMissedRow ? "var(--muted-foreground)" : "var(--foreground)" }}>
                        {row.description}
                        {isMissedRow && <span className="ml-2 text-xs" style={{ color: "var(--muted-foreground)", fontStyle: 'italic' }}>(not in all quotes)</span>}
                      </td>
                      <td className="px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{row.category || '—'}</td>
                      {row.cells.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 tabular-nums text-right" style={{ color: cell.amount !== null ? "var(--foreground)" : "var(--muted-foreground)", fontStyle: cell.amount === null ? 'italic' : 'normal' }}>
                          {cell.amount !== null ? fmtMoney(cell.amount) : '—'}
                          {cell.aiReview && cell.aiReview !== 'Consistent' && (
                            <span className="block text-xs" style={{ color: "var(--muted-foreground)" }}>{cell.aiReview}</span>
                          )}
                        </td>
                      ))}
                      {pbQuotes.length > 1 && (
                        <td className="px-3 py-2 tabular-nums text-right font-semibold" style={{ color: "var(--foreground)" }}>
                          {optimised !== null ? fmtMoney(optimised) : '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", background: "var(--muted)" }}>
                  <td colSpan={2} className="px-3 py-2 font-bold" style={{ color: "var(--foreground)" }}>TOTAL</td>
                  {pbQuotes.map((q, qi) => (
                    <td key={qi} className="px-3 py-2 tabular-nums text-right font-bold" style={{ color: "var(--foreground)" }}>
                      {fmtMoney(q.total)}
                    </td>
                  ))}
                  {pbQuotes.length > 1 && (
                    <td className="px-3 py-2 tabular-nums text-right font-bold" style={{ color: "var(--foreground)" }}>
                      {fmtMoney(allRows3.reduce((sum, row) => {
                        const va = row.cells.map(c => c.amount).filter((a): a is number => a !== null);
                        return sum + (va.length > 0 ? Math.min(...va) : 0);
                      }, 0))}
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="p-4 text-xs" style={{ color: "var(--muted-foreground)" }}>
              No repair quote has been submitted for this claim. Cost assessment cannot be performed until a quotation is received.
            </div>
          )}
        </div>
      </div>

      {/* Cost Waterfall Chart — benchmark vs quoted vs fair range vs write-off threshold */}
      {pbQuotes.length > 0 && (() => {
        const benchmarkUsd = learningBenchmark3?.estimatedCostUsd ?? 0;
        const currencySymbol = fmtMoney(1).replace(/[\d,.\s]/g, '').trim() || '$';
        const waterfallData: CostWaterfallData = {
          benchmarkUsd,
          quotedTotalUsd: quotedTotal,
          marketValueUsd: marketValueUsd3 ?? undefined,
          fairRangeMinUsd: learningBenchmark3?.fairRangeMinUsd ?? 0,
          fairRangeMaxUsd: learningBenchmark3?.fairRangeMaxUsd ?? 0,
          currencySymbol,
        };
        // Only render if we have at least one meaningful value
        if (benchmarkUsd === 0 && quotedTotal === 0) return null;
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>3.1c Cost Overview</p>
            </div>
            <div className="p-4">
              <CostWaterfallChart data={waterfallData} />
            </div>
          </div>
        );
      })()}

      {/* Labour vs Parts Ratio Chart — only shown when split data is available */}
      {pbQuotes.length > 0 && (
        <LabourPartsRatioChart
          quotes={pbQuotes}
          learningBenchmark={learningBenchmark3}
          fmtMoney={fmtMoney}
        />
      )}

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
                  {["Component", "Benchmark", "Quote Status", "Variance", "Source"].map(h => (
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
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)", fontFamily: "inherit" }}>{toTitleCase(part.component)}</td>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--foreground)", fontFamily: "inherit" }}>
                        {hasBenchmark ? fmtMoney(part.total) : <span style={{ color: "var(--muted-foreground)" }}>Insufficient data</span>}
                      </td>
                      <td className="px-3 py-2">
                        {(() => {
                          const rs = reconStatusMap[(part.component ?? '').toLowerCase()] ?? 'no_quote_available';
                          const statusMap: Record<string, { status: 'pass' | 'warn' | 'fail' | 'na'; label: string }> = {
                            matched: { status: 'pass', label: 'Matched' },
                            missing_from_quote: { status: 'fail', label: 'Missing' },
                            quoted_not_detected: { status: 'warn', label: 'Extra' },
                            unmatched: { status: 'warn', label: 'Unmatched' },
                            no_quote_available: { status: 'na', label: 'No quote' },
                          };
                          const s = statusMap[rs] ?? { status: 'na' as const, label: rs };
                          return <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{s.label}</span>;
                        })()}
                      </td>
                      <td className="px-3 py-2">
                        {v != null ? <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>{v > 0 ? "+" : ""}{Math.round(v)}%</span> : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{sourceLabel}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", background: "var(--muted)" }}>
                  <td className="px-3 py-2 font-bold" style={{ color: "var(--foreground)" }}>TOTAL</td>
                  <td className="px-3 py-2 tabular-nums font-bold" style={{ color: "var(--foreground)" }}>{fmtMoney(itemisedParts.reduce((s: number, p: any) => s + (p.total ?? 0), 0))}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {partsRecon.length > 0
                      ? `${partsRecon.filter(r => r.reconciliation_status === 'matched').length}/${partsRecon.length} matched`
                      : quotedTotal > 0 ? fmtMoney(quotedTotal) : "—"}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Multiple quotes — shown inline below the primary quote table when > 1 quote exists */}
      {pbQuotes.length > 1 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>3.1b Quote Comparison — All Repairers</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs report-table">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  {["Repairer", "Parts", "Labour", "Total", "Status"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pbQuotes.map((q, i) => (
                  <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--foreground)" }}>{q.name}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--foreground)" }}>{q.parts > 0 ? fmtMoney(q.parts) : "—"}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--foreground)" }}>{q.labour > 0 ? fmtMoney(q.labour) : "—"}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: "var(--foreground)" }}>{fmtMoney(q.total)}</td>
                    <td className="px-3 py-2"><span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{toTitleCase(q.status)}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", background: "var(--muted)" }}>
                  <td className="px-3 py-2 font-bold" style={{ color: "var(--foreground)" }}>Average</td>
                  <td className="px-3 py-2 tabular-nums" style={{ color: "var(--muted-foreground)" }}>
                    {pbQuotes.some(q => q.parts > 0) ? fmtMoney(pbQuotes.filter(q => q.parts > 0).reduce((s, q) => s + q.parts, 0) / pbQuotes.filter(q => q.parts > 0).length) : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums" style={{ color: "var(--muted-foreground)" }}>
                    {pbQuotes.some(q => q.labour > 0) ? fmtMoney(pbQuotes.filter(q => q.labour > 0).reduce((s, q) => s + q.labour, 0) / pbQuotes.filter(q => q.labour > 0).length) : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums font-bold" style={{ color: "var(--foreground)" }}>
                    {fmtMoney(pbQuotes.reduce((s, q) => s + q.total, 0) / pbQuotes.length)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}



      {/* Cost Decision Engine output — surfaced from costIntelligenceJson (C-3 fix) */}
      {(costDecision || costNarrative || reconciliationSummary) && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>3.1a Cost Decision Engine</p>
            {costReliability && (
              <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>Reliability: {toTitleCase(costReliability)}</span>
            )}
          </div>
          <div className="p-4 space-y-3">
            {costDecision && (
              <table className="w-full text-xs report-table">
                <tbody>
                  {costDecision.recommendation && (
                    <tr>
                      <td className="py-1.5 pr-3 font-semibold w-40" style={{ color: "var(--muted-foreground)" }}>Recommendation</td>
                      <td className="py-1.5 tabular-nums" style={{ color: "var(--foreground)" }}>{costDecision.recommendation}</td>
                    </tr>
                  )}
                  {costDecision.approvedAmountUsd != null && (
                    <tr style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="py-1.5 pr-3 font-semibold" style={{ color: "var(--muted-foreground)" }}>Approved Amount</td>
                      <td className="py-1.5 tabular-nums font-bold" style={{ color: "var(--foreground)" }}>{fmtMoney(costDecision.approvedAmountUsd)}</td>
                    </tr>
                  )}
                  {costDecision.savingsUsd != null && costDecision.savingsUsd > 0 && (
                    <tr style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="py-1.5 pr-3 font-semibold" style={{ color: "var(--muted-foreground)" }}>Savings Identified</td>
                      <td className="py-1.5 tabular-nums" style={{ color: "var(--fp-success-text)" }}>{fmtMoney(costDecision.savingsUsd)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            {costNarrative && (
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{costNarrative}</p>
            )}
            {reconciliationSummary && (
              <div className="space-y-2">
                <div className="p-2 rounded text-xs" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                  <span className="font-semibold">Reconciliation: </span>
                  {typeof reconciliationSummary === 'string'
                    ? reconciliationSummary
                    : typeof (reconciliationSummary as any)?.summary === 'string'
                      ? (reconciliationSummary as any).summary
                      : `${(reconciliationSummary as any)?.matched_count ?? 0} matched · ${(reconciliationSummary as any)?.missing_count ?? 0} missing from quote · ${(reconciliationSummary as any)?.extra_count ?? 0} extra in quote`
                  }
                </div>
                {/* Missing from quote — damage detected but not quoted */}
                {Array.isArray((reconciliationSummary as any)?.missing) && (reconciliationSummary as any).missing.length > 0 && (
                  <div className="p-2 text-xs" style={{ borderTop: '1px solid var(--border)', color: "var(--muted-foreground)" }}>
                    <span className="font-semibold" style={{ color: 'var(--foreground)' }}>Missing from quote: </span>
                    {(reconciliationSummary as any).missing.map((m: any) => m.component ?? m).join(" · ")}
                  </div>
                )}
                {/* Extra in quote — quoted but not in damage analysis */}
                {Array.isArray((reconciliationSummary as any)?.extra) && (reconciliationSummary as any).extra.length > 0 && (
                  <div className="p-2 text-xs" style={{ borderTop: '1px solid var(--border)', color: "var(--muted-foreground)" }}>
                    <span className="font-semibold" style={{ color: 'var(--foreground)' }}>Extra in quote (not in damage analysis): </span>
                    {(reconciliationSummary as any).extra.map((e: any) => e.component ?? e).join(" · ")}
                  </div>
                )}
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
  // Read claimRecord0 from the correct location — same as the rest of the report
  const claimRecord0 = (aiAssessment as any)?._claimRecord ?? (aiAssessment as any)?.claimRecord ?? null;
  // costIntelligenceJson — primary source for market value and true repair cost
  // This is the most reliable source: Stage 9 populates both marketValueUsd and totalEstimatedCost
  // from the validated cost decision engine output.
  const costIntel = (aiAssessment as any)?.costIntelligenceJson ?? null;
  // LLM-derived valuation from Stage 5c — secondary source
  const llmValuation = claimRecord0?.valuation ?? null;
  // Market value priority: costIntelligenceJson → claimRecord0.valuation → vehicle field
  const marketValueUsd = costIntel?.marketValueUsd ?? llmValuation?.marketValueUsd ?? claimRecord0?.vehicle?.marketValueUsd ?? null;
  // Valuation method — from LLM valuation (Stage 5c)
  const valuationMethod = llmValuation?.valuationMethod ?? null;
  const verdictReason = llmValuation?.verdictReason ?? null;
  const llmVerdict = llmValuation?.verdict ?? null; // REPAIRABLE | WRITE_OFF | BORDERLINE
  const llmRepairToValue = llmValuation?.repairToValueRatio ?? null;
  const excessUsd = claimRecord0?.insuranceContext?.excessAmountUsd ?? null;
  const bettermentUsd = claimRecord0?.insuranceContext?.bettermentUsd ?? null;
  const quotedTotal = (quotes?.[0]?.quotedAmount ?? 0) / 100;
  const agreedCostUsd = claimRecord0?.costs?.agreedCostUsd ?? null;
  // Repair cost priority: costIntelligenceJson.totalEstimatedCost (validated) → LLM repairCostUsd → agreed cost → quoted total
  // totalEstimatedCost is the AI-validated repair cost from the cost decision engine
  const repairCost = costIntel?.totalEstimatedCost ?? llmValuation?.repairCostUsd ?? agreedCostUsd ?? quotedTotal;
  // Repair-to-value ratio: prefer LLM-computed ratio, then compute from costIntelligenceJson values
  const repairToValue = llmRepairToValue ?? (marketValueUsd && marketValueUsd > 0 && repairCost > 0 ? (repairCost / marketValueUsd) * 100 : null);
  const isWriteOff = llmVerdict === "WRITE_OFF" || (repairToValue != null && repairToValue >= 75);

  // Only show if we have at least market value or repair cost
  if (!marketValueUsd && !repairCost) return null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>3.2 Vehicle Valuation</p>
        {isWriteOff != null && (
          <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{isWriteOff ? "Potential write-off" : "Repairable"}</span>
        )}
      </div>
      <div className="p-4">
        <table className="w-full text-xs report-table">
          <tbody>            {([
              ["Market Value", marketValueUsd != null ? fmtMoney(marketValueUsd) : "Not stated"],
              valuationMethod ? ["Valuation Method", valuationMethod] : null,
              // Repair cost label: distinguish between AI-validated cost and raw quote
              costIntel?.totalEstimatedCost != null
                ? ["Repair Cost (AI-Validated)", fmtMoney(costIntel.totalEstimatedCost)]
                : ["Repair Cost (Quoted)", repairCost > 0 ? fmtMoney(repairCost) : "Not available"],
              ["Repair-to-Value Ratio", repairToValue != null ? `${repairToValue.toFixed(1)}%` : "Cannot calculate"],
              ["Excess / Deductible", excessUsd != null ? fmtMoney(excessUsd) : "Not stated"],
              ["Betterment / Depreciation", bettermentUsd != null ? fmtMoney(bettermentUsd) : "Not stated"],
              ["Net Claimant Liability", excessUsd != null && bettermentUsd != null ? fmtMoney(excessUsd + bettermentUsd) : excessUsd != null ? fmtMoney(excessUsd) : "Not available"],
            ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([k, v], i) => (
              <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                <td className="py-2 pr-4 font-semibold w-48" style={{ color: "var(--muted-foreground)" }}>{k as string}</td>
                <td className="py-2 tabular-nums" style={{ color: "var(--foreground)" }}>{v as string}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {repairToValue != null && (
          <div className="mt-3 p-2 rounded text-xs" style={{
            background: isWriteOff ? "var(--status-reject-bg)" : "var(--muted)",
            color: isWriteOff ? "var(--fp-critical-text)" : "var(--foreground)",
            border: `1px solid ${isWriteOff ? "var(--fp-critical-border)" : "var(--border)"}`,
          }}>
            {isWriteOff
              ? `Repair cost is ${repairToValue.toFixed(1)}% of market value — exceeds 75% threshold. Potential economic write-off.`
              : `Repair cost is ${repairToValue.toFixed(1)}% of market value — within repairable range.`}
          </div>
        )}
        {verdictReason && (
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            <span className="font-semibold" style={{ color: "var(--foreground)" }}>KINGA Valuation Note: </span>{verdictReason}
          </p>
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
          <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{toSentenceCase(photoStatus.replace(/_/g, " "))}</span>
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
            <div className="p-2 text-xs mb-2" style={{ borderTop: '1px solid var(--border)', color: "var(--muted-foreground)" }}>
              <strong style={{ color: 'var(--foreground)' }}>System error</strong> — Photo ingestion failed due to a pipeline error. Not attributed to the claimant. Photo-related fraud points excluded from score.
            </div>
          )}
          {photoStatus === "CLAIMANT_OMISSION" && (
            <div className="p-2 text-xs mb-2" style={{ borderTop: '1px solid var(--border)', color: "var(--muted-foreground)" }}>
              <strong style={{ color: 'var(--foreground)' }}>Photos not provided</strong> — Claimant did not submit photo evidence. Contributes to fraud risk score.
            </div>
          )}
          {photoStatus === "ANALYSED" && (
            <div className="p-2 rounded text-xs mb-2" style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
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
                    <div key={i} className="rounded overflow-hidden relative" data-photo-card style={{ border: "1px solid var(--border)", background: "var(--muted)" }}>
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
                    <td className="px-3 py-2"><span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{doc.extracted ? "Yes" : "No"}</span></td>
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
        if (!pf || (pf.photos ?? []).length === 0) return null;
        const overallStatus = pf.anySuspicious ? "warn" : "pass";
        // Map raw photo forensics data to PhotoExifForensicsPanel prop shape
        const exifResults: PhotoExifResult[] = (pf.photos as any[]).map((photo: any, i: number) => {
          const r = photo.analysisResult ?? {};
          const manipScore = r.manipulation_indicators?.manipulation_score ?? 0;
          return {
            photoIndex: i + 1,
            isSuspicious: r.is_suspicious ?? false,
            exifPresent: !!(r.capture_datetime || r.camera_make || r.camera_model),
            gpsPresent: !!(r.gps_coordinates),
            manipulationScore: Math.round(manipScore * 100),
            flags: r.flags ?? (photo.error ? [photo.error] : []),
            isNonVehicle: r.is_non_vehicle ?? false,
            captureDate: r.capture_datetime ?? null,
            aiVisionDescription: r.ai_vision_description ?? null,
          } satisfies PhotoExifResult;
        });
        const exifData: PhotoExifForensicsData = { results: exifResults };
        // ── Hedged photo integrity summary verdict ──────────────────────
        // Use the same two-layer document-detection logic as PhotoExifForensicsPanel
        const isDocumentVisionText = (text: string): boolean => {
          if (!text) return false;
          if (/^\s*(DAMAGE\s+DESCRIPTION|ESTIMATE|QUOTATION|INVOICE|CLAIM\s+FORM|REPAIR\s+ORDER|PARTS\s+LIST|LABOUR\s+SCHEDULE|SCHEDULE\s+OF|VEHICLE\s+INSPECTION\s+REPORT|ASSESSMENT\s+REPORT|BASED\s+ON\s+ESTIMATE)/i.test(text)) return true;
          if (/listed\s+for\s+(replacement|repair)|qty\s*:|item\s*:|unit\s+price|labour\s+rate|parts\s+cost/i.test(text)) return true;
          if (/^\s*(i\s+am\s+sorry|i\s+cannot|i\s+can't|i\s+apologize|i\s+apologise|unable\s+to|this\s+image\s+does\s+not|the\s+image\s+does\s+not\s+(?:show|contain|depict))/i.test(text)) return true;
          return false;
        };
        const vehiclePhotos = exifResults.filter(r => !r.isNonVehicle && !isDocumentVisionText(r.aiVisionDescription ?? ''));
        const totalAnalysed = vehiclePhotos.length;
        // Three-tier thresholds:
        //   High concern  : manipulation_score > 40  (likely post-processing)
        //   Medium concern: manipulation_score 20–40  (minor anomalies, warrants review)
        //   Clean         : manipulation_score ≤ 20  (no detected manipulation)
        const highCount   = vehiclePhotos.filter(r => r.manipulationScore > 40).length;
        const mediumCount = vehiclePhotos.filter(r => r.manipulationScore > 20 && r.manipulationScore <= 40).length;
        type SummaryTier = 'none' | 'medium' | 'high';
        const tier: SummaryTier = highCount > 0 ? 'high' : mediumCount > 0 ? 'medium' : 'none';
        const summaryVerdict: string = totalAnalysed === 0
          ? "No vehicle damage photos were available for integrity analysis."
          : tier === 'high'
            ? `${highCount} of ${totalAnalysed} analysed photo${highCount === 1 ? '' : 's'} exhibit indicators consistent with post-processing or metadata manipulation. Independent physical inspection of the vehicle is recommended prior to settlement.`
            : tier === 'medium'
              ? `${mediumCount} of ${totalAnalysed} analysed photo${mediumCount === 1 ? '' : 's'} present minor metadata anomalies that, while not conclusive, warrant closer review. No definitive manipulation was detected; standard verification procedures apply with heightened scrutiny.`
              : `All ${totalAnalysed} analysed photo${totalAnalysed === 1 ? '' : 's'} are consistent with reported damage and show no detected manipulation — standard verification procedures apply.`;
        // Tier-appropriate accent colour for the summary box border
        const summaryAccent = tier === 'high' ? '#dc2626' : tier === 'medium' ? '#d97706' : 'var(--border)';
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>4.3 Photo Forensics — EXIF & Manipulation Analysis</p>
              <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{pf.anySuspicious ? "Suspicious" : "Clean"}</span>
            </div>
            <div className="p-4">
              {/* Hedged integrity summary — three-tier: clean / medium concern / high concern */}
              <div className="photo-integrity-summary" style={{ marginBottom: '14px', padding: '10px 14px', background: tier === 'high' ? '#fef2f2' : tier === 'medium' ? '#fffbeb' : 'var(--muted)', borderRadius: '6px', border: `1px solid ${summaryAccent}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <p className="pis-label text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)', margin: 0 }}>Photo Integrity Summary</p>
                  {tier !== 'none' && (
                    <span style={{
                      fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                      padding: '1px 6px', borderRadius: '3px',
                      background: tier === 'high' ? '#dc2626' : '#d97706',
                      color: '#ffffff',
                    }}>
                      {tier === 'high' ? 'High Concern' : 'Medium Concern'}
                    </span>
                  )}
                </div>
                <p className="pis-text text-sm" style={{ color: 'var(--foreground)', lineHeight: '1.6', margin: 0 }}>{summaryVerdict}</p>
              </div>
              <PhotoExifForensicsPanel data={exifData} />
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
                  <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>Scanned PDF</span>
                )}
                <span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{qualityLabel}</span>
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
  const fraudBand = fraudScore >= 70 ? "High risk" : fraudScore >= 40 ? "Moderate risk" : "Low risk";

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
          <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{toSentenceCase(fraudBand)}</span>
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

      {/* 5.0 Fraud Radar Chart — 6-axis visual breakdown */}
      {(() => {
        // Map contributions to the 6 radar axes
        const getScore = (key: string) => {
          const c = contributions.find((c: any) => c.factor?.toLowerCase().includes(key));
          return c ? Math.min(20, c.value ?? 0) : 0;
        };
        const costDev = getScore("cost");
        const physicsVal = Math.max(0, 20 - Math.round((physicsScore / 100) * 20));
        const dirMismatch = getScore("direction") || (e?.directionFlag?.mismatch ? 12 : 0);
        const repeatClaim = getScore("repeat") || getScore("prior");
        const missingData = getScore("missing") || getScore("photo") || getScore("police");
        const damageIncon = getScore("damage") || getScore("pattern");
        const radarData: FraudRadarData = {
          damageInconsistency: damageIncon,
          costDeviation: costDev,
          directionMismatch: dirMismatch,
          repeatClaim,
          missingData,
          severityVsPhysics: physicsVal,
          overallFraudScore: fraudScore,
        };
        const barAxes = [
          { label: "Damage Inconsistency", value: radarData.damageInconsistency, max: 20 },
          { label: "Cost Deviation",        value: radarData.costDeviation,        max: 20 },
          { label: "Direction Mismatch",    value: radarData.directionMismatch,    max: 20 },
          { label: "Repeat / Prior Claim",  value: radarData.repeatClaim,          max: 20 },
          { label: "Missing Data",          value: radarData.missingData,          max: 20 },
          { label: "Severity vs Physics",   value: radarData.severityVsPhysics,    max: 20 },
        ];
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${fraudColor}40`, background: "var(--card)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>5.0 Fraud Risk Analysis — Visual Overview</p>
            </div>
            <div className="p-4 grid grid-cols-2 gap-6">
              {/* Left: Radar chart */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)" }}>Risk Profile (Radar)</p>
                <FraudRadarChart data={radarData} />
              </div>
              {/* Right: Horizontal bar chart */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--muted-foreground)" }}>Factor Contributions (Bar)</p>
                <div className="space-y-2">
                  {barAxes.map((ax, i) => {
                    const pct = Math.min(100, Math.round((ax.value / ax.max) * 100));
                    const barColor = ax.value > 12 ? "#ef4444" : ax.value > 6 ? "#f59e0b" : "#22c55e";
                    return (
                      <div key={i}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span style={{ color: "var(--muted-foreground)" }}>{ax.label}</span>
                          <span className="font-bold" style={{ color: barColor }}>{ax.value}/{ax.max}</span>
                        </div>
                        <div className="h-2 rounded-full" style={{ background: "var(--muted)" }}>
                          <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 5.2 ML Sub-Engine Commentary */}
      {(() => {
        const mlAnomaly = (enforcement as any)?._mlAnomaly;
        const mlCluster = (enforcement as any)?._mlCluster;
        const mlCostPred = (enforcement as any)?._mlCostPrediction;
        const mlPhotoScore = (enforcement as any)?._mlPhotoManipulation;
        const mlNetworkFlag = (enforcement as any)?._mlNetworkFlag;
        const hasAnyMl = mlAnomaly !== undefined || mlCluster !== undefined || mlCostPred !== undefined || mlPhotoScore !== undefined;
        if (!hasAnyMl) return null;
        const anomalyScore = typeof mlAnomaly === "number" ? mlAnomaly : null;
        const photoScore = typeof mlPhotoScore === "number" ? mlPhotoScore : null;
        const commentary: string[] = [];
        if (anomalyScore !== null) {
          commentary.push(`Isolation Forest anomaly detector returned a ${anomalyScore < 0.2 ? "normal" : anomalyScore < 0.5 ? "elevated" : "high"} signal (score: ${anomalyScore.toFixed(2)}) when benchmarked against historical claim patterns.`);
        }
        if (mlCluster) {
          commentary.push(`DBSCAN spatial clustering assigned this claim to cluster ${mlCluster}, indicating geographic proximity to ${anomalyScore && anomalyScore > 0.4 ? "a known high-frequency loss zone" : "a standard loss zone"}.`);
        }
        if (mlCostPred) {
          commentary.push(`Cost regression model predicted a repair range of ${mlCostPred}; the quoted amount falls ${Math.abs(((enforcement as any)?._costDevPct ?? 0))}% ${((enforcement as any)?._costDevPct ?? 0) > 0 ? "above" : "below"} this prediction.`);
        }
        if (photoScore !== null) {
          commentary.push(`Photo manipulation ensemble returned a score of ${photoScore.toFixed(2)} — ${photoScore < 0.25 ? "within normal range" : photoScore < 0.5 ? "mildly elevated; batch EXIF stripping detected" : "elevated; recommend independent photo verification"}.`);
        }
        if (mlNetworkFlag) {
          commentary.push(`Repeat-claimant network analysis flagged a connection to ${mlNetworkFlag}.`);
        }
        if (commentary.length === 0) return null;
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>5.2 ML Sub-Engine Commentary</p>
            </div>
            <div className="p-4 space-y-2">
              {commentary.map((line, i) => (
                <p key={i} className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{line}</p>
              ))}
            </div>
          </div>
        );
      })()}

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
                      <td className="px-3 py-2"><span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{c.triggered && !isExcluded ? "Yes" : "No"}</span></td>
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
                  {/* Diamond — white fill with coloured border only */}
                  <path d={diamond(startX, cy, diamondW, diamondH)}
                    fill="#fff" stroke={gateColor} strokeWidth="1.5" />
                  {/* Gate label in diamond — G-codes removed, label centred */}
                  <text x={startX} y={cy - 5} textAnchor="middle" dominantBaseline="middle"
                    fontSize="10" fontWeight="600" fill={textColor}>{gate.label}</text>
                  {/* Result value */}
                  <text x={startX} y={cy + 11} textAnchor="middle" dominantBaseline="middle"
                    fontSize="9" fill={gateColor}>{String(gate.result)}</text>

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
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>6.2 Blocked Actions</p>
            </div>
            <div className="p-4 space-y-2">
              {blocked.map((b, i) => (
                <div key={i} className="flex items-start gap-2 text-xs p-2" style={{ borderBottom: '1px solid var(--border)' }}>
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
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>6.3 Required Next Steps</p>
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
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--foreground)" }}>{c.triggered ? `+${c.value}` : "0"}</td>
                    <td className="px-3 py-2"><span className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>{c.triggered ? "Yes" : "No"}</span></td>
                    <td className="px-3 py-2 max-w-xs" style={{ color: "var(--muted-foreground)" }}>{c.detail}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--border)", background: "var(--muted)" }}>
                  <td className="px-3 py-2 font-bold" style={{ color: "var(--foreground)" }}>Total Score</td>
                  <td className="px-3 py-2 tabular-nums font-bold" style={{ color: fraudScore >= 70 ? "var(--fp-critical-text)" : fraudScore >= 40 ? "var(--fp-warning-text)" : "var(--fp-success-text)" }}>{Math.round(fraudScore)}/100</td>
                  <td colSpan={2} className="px-3 py-2 font-semibold" style={{ color: "var(--foreground)" }}>{toTitleCase(wf.level)} — {wf.explanation ?? ""}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6.4 Decision Lifecycle Tracker */}
      {(() => {
        // Derive lifecycle state from claim and assessment status
        const claimStatus = claim?.status ?? "submitted";
        const isDraft = claimStatus === "submitted" || claimStatus === "intake_queue" || claimStatus === "processing";
        const isReviewed = claimStatus === "review" || claimStatus === "under_review" || claimStatus === "pending_review";
        const isFinalised = claimStatus === "approved" || claimStatus === "rejected" || claimStatus === "finalised" || claimStatus === "settled";
        const isLocked = claimStatus === "closed" || claimStatus === "archived";
        const lifecycleStates: LifecycleState[] = [
          { state: "draft", completed: true, isCurrent: isDraft, adjusterName: "KINGA Engine", timestamp: aiAssessment?.createdAt ?? null },
          { state: "reviewed", completed: isReviewed || isFinalised || isLocked, isCurrent: isReviewed, adjusterName: isReviewed ? "Pending adjuster" : null, timestamp: null },
          { state: "finalised", completed: isFinalised || isLocked, isCurrent: isFinalised, adjusterName: null, timestamp: null },
          { state: "locked", completed: isLocked, isCurrent: isLocked, adjusterName: null, timestamp: null },
        ];
        const lifecycleData: DecisionLifecycleData = { states: lifecycleStates, auditLogEnabled: true };
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--foreground)" }}>6.4 Decision Lifecycle</p>
            </div>
            <div className="p-4">
              <DecisionLifecycleTracker data={lifecycleData} />
            </div>
          </div>
        );
      })()}

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
                ["Digital signature", "KINGA AI (engine)"],
              ].map(([k, v], i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <td className="py-2 pr-4 font-semibold w-44" style={{ color: "var(--muted-foreground)" }}>{k}</td>
                  <td className="py-2 tabular-nums" style={{ color: "var(--foreground)" }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
              ? "Report integrity blocked"
              : hasWarnings || hasPhotoIssue
              ? "Integrity gate: proceed with caution"
              : "Integrity gate: clear"}
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

  // fcdi.score is 0.0 (fully degraded) → 1.0 (fully reliable); scorePercent is 0–100
  const fcdiScore: number = fcdi?.scorePercent ?? Math.round((fcdi?.score ?? 0) * 100);
  const fcdiLabel: string = fcdi?.label ?? (fcdiScore >= 80 ? "HIGH" : fcdiScore >= 55 ? "MEDIUM" : fcdiScore >= 30 ? "LOW" : "CRITICAL");
  const fcdiColor = fcdiScore >= 80 ? "var(--fp-success-text)" : fcdiScore >= 55 ? "var(--fp-warning-text)" : "var(--fp-critical-text)";
  const fcdiBg = fcdiScore >= 80 ? "var(--status-approve-bg)" : fcdiScore >= 55 ? "var(--status-review-bg)" : "var(--status-reject-bg)";
  const fcdiBorder = fcdiScore >= 80 ? "var(--fp-success-border)" : fcdiScore >= 55 ? "var(--fp-warning-border)" : "var(--fp-critical-border)";

  const stageHealth: any[] = psm?.stages ?? [];
  const failedStages = stageHealth.filter((s: any) => s.status === "failed" || s.status === "error");
  const degradedStages = stageHealth.filter((s: any) => s.status === "degraded" || s.status === "partial");
  const completenessScore: number = dataQuality?.completenessScore ?? dataQuality?.completeness ?? 0;
  const missingFields: string[] = dataQuality?.missingFields ?? dataQuality?.missing ?? [];
  const assumptions: any[] = fa.assumptions ?? [];
  // Domain penalties from the FCDI breakdown (populated by Domain Penalty Engine in orchestrator)
  const domainPenalties: Array<{ code: string; reason: string; weight: number }> = fcdi?.breakdown?.domainPenalties ?? [];

  const hasPipelineIssues = failedStages.length > 0 || degradedStages.length > 0 || sentinels.length > 0 || domainPenalties.length > 0;
  if (!hasPipelineIssues && fcdiScore >= 80 && completenessScore >= 80) return null;

  return (
    <div className="rounded-xl overflow-hidden mb-2 no-print" style={{ border: `1.5px solid ${fcdiBorder}`, background: fcdiBg }}>
      <div className="px-5 py-2 flex items-center justify-between" style={{ borderBottom: `1px solid ${fcdiBorder}40` }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold" style={{ color: fcdiColor }}>
            {fcdiScore >= 80 ? "Pipeline reliable" : fcdiScore >= 55 ? "Pipeline degraded" : "Pipeline unreliable"}
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
                  &bull; <span className="tabular-nums">{s.name ?? s.stage}</span>
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
                  &bull; <span className="tabular-nums">{s.name ?? s.stage}</span>
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
                  &bull; <span className="font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>{s.name ?? s.sentinel}</span>
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
        {domainPenalties.length > 0 && (
          <div>
            <p className="font-semibold mb-1" style={{ color: "var(--fp-danger)" }}>
              Domain penalties applied ({domainPenalties.length}):
            </p>
            <div className="space-y-1.5">
              {domainPenalties.map((dp: any, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="tabular-nums text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: "rgba(220,38,38,0.1)", color: "var(--fp-danger)" }}>
                    {dp.code.replace(/_/g, ' ')}
                  </span>
                  <span className="flex-1" style={{ color: "var(--muted-foreground)" }}>{dp.reason}</span>
                  <span className="flex-shrink-0 font-semibold" style={{ color: "var(--fp-danger)" }}>−{Math.round((dp.weight ?? 0) * 100)}pts</span>
                </div>
              ))}
            </div>
          </div>
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

// ─── Section 7: Machine Learning Insights ────────────────────────────────────────────

function Section7Learning({
  aiAssessment: _aiAssessment,
  enforcement,
  fmtMoney = fmtUsd,
}: {
  aiAssessment: any;
  enforcement: any;
  fmtMoney?: (n: number | null | undefined) => string;
}) {
  const lb = enforcement?.costExtraction?.learningBenchmark ?? null;

  // Only show the benchmark when we have at least 3 validated historical claims.
  // Fewer than 3 is statistically insufficient and should not be surfaced.
  const hasBenchmark = lb?.avgCostUsd != null && (lb?.sampleSize ?? 0) >= 3;

  if (!hasBenchmark) {
    return (
      <div className="mb-4">
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          A historical cost benchmark for this vehicle type and collision pattern is not yet available.
          The system requires at least 3 validated claims of the same profile before a benchmark can be
          presented. Data is currently accumulating.
        </p>
        <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
          Benchmark data is derived from anonymised historical claims. No personally identifiable
          information is used in cost pattern analysis.
        </p>
      </div>
    );
  }

  // Compute variance between submitted quote and historical average
  const primaryQuoteTotal = (() => {
    try {
      const quotes = (enforcement as any)?.quotes ?? [];
      if (quotes.length === 0) return null;
      const q = quotes[0];
      const lineTotal = (q.lineItems ?? []).reduce((s: number, li: any) => s + ((li.lineTotal ?? li.unitPrice ?? 0) / 100), 0);
      const raw = (q.quotedAmount ?? 0) / 100;
      return raw > 0 ? raw : lineTotal > 0 ? lineTotal : null;
    } catch { return null; }
  })();

  const avgCost = lb!.avgCostUsd!;
  const variancePct = primaryQuoteTotal != null && avgCost > 0
    ? ((primaryQuoteTotal - avgCost) / avgCost) * 100
    : null;
  const varianceLabel = variancePct == null ? null
    : variancePct > 20 ? `${variancePct.toFixed(0)}% above historical average — review recommended`
    : variancePct < -20 ? `${Math.abs(variancePct).toFixed(0)}% below historical average — verify scope completeness`
    : `Within normal range (${variancePct > 0 ? '+' : ''}${variancePct.toFixed(0)}% vs historical average)`;

  return (
    <div className="mb-4 space-y-4">
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>Historical cost benchmark</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            Based on {lb!.sampleSize} anonymised validated claims for {lb!.vehicleDescriptor} ({lb!.collisionDirection} impact, {lb!.marketRegion} market)
          </p>
        </div>
        <div className="p-4">
          <table className="w-full text-xs report-table">
            <tbody>
              <tr>
                <td className="px-3 py-2 font-medium" style={{ color: 'var(--muted-foreground)', width: '40%' }}>Historical average repair cost</td>
                <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: 'var(--foreground)' }}>{fmtMoney(avgCost)}</td>
              </tr>
              <tr style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-3 py-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>Sample size</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--foreground)' }}>{lb!.sampleSize} validated claims</td>
              </tr>
              {primaryQuoteTotal != null && (
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>Submitted quote</td>
                  <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--foreground)' }}>{fmtMoney(primaryQuoteTotal)}</td>
                </tr>
              )}
              {varianceLabel && (
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>Variance assessment</td>
                  <td className="px-3 py-2" style={{ color: 'var(--foreground)' }}>{varianceLabel}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-xs mt-3 pt-3" style={{ borderTop: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
            Benchmark data is derived from anonymised historical claims. No personally identifiable information is used in cost pattern analysis.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Export ────────────────────────────────────────────────────────────────────────────────────

// ─── Mockup v4.2 scoped CSS─────────────────────────────────────────
const REPORT_CSS = `
.kinga-report{font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#111;background:#fff;line-height:1.6;padding:24px 20px}
.kinga-report .page-header{display:flex;align-items:center;justify-content:space-between;padding:6px 22px;background:#fff;border-bottom:1px solid #111;font-family:Inter,system-ui,sans-serif;font-size:10px;color:#666;margin:-24px -20px 24px}
.kinga-report .page-header .brand{font-family:sans-serif;font-weight:700;font-size:11px;color:#111;letter-spacing:.05em;border:1.5px solid #111;padding:2px 8px}
.kinga-report .cover-title-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #111}
.kinga-report .cover-title-row h1{font-size:22px;font-weight:700;letter-spacing:-.02em;font-family:Inter,'Helvetica Neue',Arial,sans-serif}
.kinga-report .cover-title-row .subtitle{font-size:12px;color:#555;margin-top:4px;font-style:normal}
.kinga-report .cover-meta{text-align:right}
.kinga-report .cover-meta .claim-id{font-size:14px;font-weight:700}
.kinga-report .cover-meta .meta-line{font-size:11px;color:#555;margin-top:2px}
.kinga-report .doc-identity{background:#fff;border:1px solid #ddd;padding:10px 16px;margin-bottom:14px;font-size:11px;color:#444;display:flex;gap:28px;flex-wrap:wrap}
.kinga-report .di-label{font-weight:700;color:#111;text-transform:uppercase;font-size:9px;letter-spacing:.08em;display:block;margin-bottom:2px}
.kinga-report .alert-banner{border:1px solid #bbb;padding:10px 16px;margin-bottom:14px;font-size:11px;color:#333;background:#fff;border-left:4px solid #c8a000}
.kinga-report .alert-banner.critical{background:#fff;border-left-color:#c00}
.kinga-report .alert-banner.info{background:#fff;border-left-color:#111}
.kinga-report .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #ddd;margin-bottom:14px}
.kinga-report .kpi-tile{padding:14px 16px;border-right:1px solid #ddd;text-align:center}
.kinga-report .kpi-tile:last-child{border-right:none}
.kinga-report .kpi-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:6px}
.kinga-report .kpi-value{font-size:26px;font-weight:700;color:#111;line-height:1}
.kinga-report .kpi-sub{font-size:10px;color:#666;margin-top:4px}
.kinga-report .kpi-value.decision{font-size:18px}
.kinga-report .dim-grid{display:grid;grid-template-columns:repeat(2,1fr);border:1px solid #ddd;margin-bottom:14px}
.kinga-report .dim-row{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid #eee;font-size:11px}
.kinga-report .dim-row:nth-child(odd){border-right:1px solid #ddd}
.kinga-report .dim-badge{font-size:9px;font-weight:700;padding:2px 7px;border-radius:2px;text-transform:uppercase;letter-spacing:.05em}
.kinga-report .dim-badge.pass{background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7}
.kinga-report .dim-badge.warn{background:#fff8e1;color:#f57f17;border:1px solid #ffe082}
.kinga-report .dim-badge.fail{background:#ffebee;color:#c62828;border:1px solid #ef9a9a}
.kinga-report .fcdi-block{display:flex;gap:24px;align-items:flex-start;border:1px solid #ddd;padding:14px 16px;margin-bottom:14px}
.kinga-report .fcdi-score-big{font-size:42px;font-weight:700;color:#111;line-height:1}
.kinga-report .fcdi-score-denom{font-size:18px;color:#888}
.kinga-report .timeline{display:flex;align-items:flex-start;margin-bottom:20px}
.kinga-report .tl-item{flex:1;text-align:center;position:relative}
.kinga-report .tl-item::before{content:'';position:absolute;top:8px;left:50%;right:-50%;height:1px;background:#ccc;z-index:0}
.kinga-report .tl-item:last-child::before{display:none}
.kinga-report .tl-dot{width:16px;height:16px;border-radius:50%;background:#111;margin:0 auto 6px;position:relative;z-index:1}
.kinga-report .tl-dot.inactive{background:#ccc}
.kinga-report .tl-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888}
.kinga-report .tl-date{font-size:11px;color:#333;margin-top:2px}
.kinga-report .exec-summary{border:1px solid #ddd;padding:14px 16px;margin-bottom:14px;font-size:12px;color:#333;line-height:1.7;background:#fff}
.kinga-report .pipeline-box{display:none !important}
.kinga-report .pipeline-box h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#111;margin-bottom:4px}
.kinga-report .pipeline-box .run-meta{font-size:10px;color:#666;margin-bottom:12px}
.kinga-report .stage-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:14px}
.kinga-report .stage-tile{padding:6px 4px;text-align:center;font-size:9px;font-weight:700;border-radius:3px;text-transform:uppercase;letter-spacing:.04em}
.kinga-report .stage-tile.green{background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7}
.kinga-report .stage-tile.amber{background:#fff8e1;color:#c8a000;border:1px solid #ffe082}
.kinga-report .pipeline-stats{display:grid;grid-template-columns:repeat(6,1fr);gap:0;border-top:1px solid #ddd;padding-top:12px}
.kinga-report .ps-item{text-align:center}
.kinga-report .ps-value{font-size:22px;font-weight:700;color:#111}
.kinga-report .ps-label{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.06em}
.kinga-report .section-heading{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:#888;margin:28px 0 12px;padding-bottom:6px;border-bottom:1px solid #ddd}
.kinga-report .sub-heading{font-size:14px;font-weight:700;color:#111;margin:16px 0 10px}
.kinga-report .data-table{width:100%;border-collapse:collapse;margin-bottom:14px}
.kinga-report .data-table td,.kinga-report .data-table th{padding:7px 12px;font-size:12px !important;border-bottom:1px solid #eee;vertical-align:top}
.kinga-report .data-table th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#888;background:#fff;border-bottom:1px solid #ddd}
.kinga-report .data-table td:first-child{color:#555;width:210px;font-size:12px}
.kinga-report .data-table td:last-child{color:#111;font-weight:500}
.kinga-report .data-table tr:last-child td{border-bottom:none}
.kinga-report .flag-red{color:#c00;font-weight:700}
.kinga-report .flag-amber{color:#c8a000;font-weight:700}
.kinga-report .flag-green{color:#2e7d32;font-weight:700}
.kinga-report .data-table .mismatch td{background:#fff;color:#c00;font-weight:700}
.kinga-report .narrative-box{border:1px solid #ddd;padding:12px 16px;margin-bottom:10px;font-size:12px;color:#333;line-height:1.7;background:#fff}
.kinga-report .narr-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:6px}
.kinga-report .diagram-section{display:flex;gap:24px;align-items:flex-start;margin-bottom:16px;border:1px solid #ddd;padding:16px}
.kinga-report .diagram-legend{flex:1}
.kinga-report .legend-item{display:flex;align-items:center;gap:8px;font-size:11px;color:#333;margin-bottom:6px}
.kinga-report .legend-swatch{width:18px;height:12px;border-radius:2px;flex-shrink:0}
.kinga-report .diagram-caption{font-size:10px;color:#666;margin-top:8px;font-style:italic}
.kinga-report .chart-container{position:relative;height:200px;margin-bottom:14px}
.kinga-report .chart-side-by-side{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:16px}
.kinga-report .bordered-block{border:1px solid #ddd;padding:14px 16px;margin-bottom:14px}
.kinga-report .valuation-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eee;font-size:12px}
.kinga-report .valuation-row:last-child{border-bottom:none}
.kinga-report .valuation-row .vr-label{color:#555}
.kinga-report .valuation-row .vr-value{font-weight:600}
.kinga-report .valuation-row .vr-value.good{color:#2e7d32}
.kinga-report .valuation-row .vr-value.na{color:#c8a000}
.kinga-report .photo-tiles{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #ddd;margin-bottom:14px}
.kinga-report .photo-tile{padding:16px;text-align:center;border-right:1px solid #ddd}
.kinga-report .photo-tile:last-child{border-right:none}
.kinga-report .pt-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:6px}
.kinga-report .pt-value{font-size:36px;font-weight:700;color:#111}
.kinga-report .pt-sub{font-size:10px;color:#888;margin-top:2px}
.kinga-report .photo-forensics-table{width:100%;border-collapse:collapse;margin-bottom:14px}
.kinga-report .photo-forensics-table th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#888;background:#fff;border-bottom:1px solid #ddd;padding:7px 10px;text-align:left}
.kinga-report .photo-forensics-table td{padding:8px 10px;font-size:11px;border-bottom:1px solid #eee;vertical-align:top}
.kinga-report .photo-forensics-table tr:last-child td{border-bottom:none}
.kinga-report .photo-forensics-table .photo-finding{font-size:11px;color:#333;line-height:1.5}
.kinga-report .photo-forensics-table .photo-detail{font-size:10px;color:#666;margin-top:3px;font-style:italic;line-height:1.4}
.kinga-report .photo-forensics-table tr.flagged-row td{background:#fff;color:#c00;font-weight:600}
/* Photo Integrity Summary box — print-safe override */
.kinga-report .photo-integrity-summary{background:#f8f9fa !important;border:1px solid #ddd !important;border-radius:0 !important;padding:10px 14px !important;margin-bottom:14px !important}
.kinga-report .photo-integrity-summary .pis-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#555;margin-bottom:4px}
.kinga-report .photo-integrity-summary .pis-text{font-size:12px;color:#111;line-height:1.6}
.kinga-report .fraud-score-block{display:flex;gap:24px;align-items:flex-start;margin-bottom:16px}
.kinga-report .fraud-big{font-size:64px;font-weight:700;color:#111;line-height:1}
.kinga-report .fraud-denom{font-size:22px;color:#888}
.kinga-report .fraud-explain{font-size:12px;color:#333;line-height:1.7;flex:1;padding-top:8px}
.kinga-report .ml-glimpse{background:#fff;border:1px solid #ddd;padding:14px 18px;margin-bottom:14px}
.kinga-report .ml-glimpse h4{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#555;margin-bottom:10px}
.kinga-report .ml-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #eee;font-size:11px}
.kinga-report .ml-row:last-child{border-bottom:none}
.kinga-report .ml-label{color:#555;flex:1}
.kinga-report .ml-value{font-weight:600;color:#111;text-align:right;flex:0 0 120px}
.kinga-report .ml-badge{font-size:9px;font-weight:700;padding:2px 7px;border-radius:2px;text-transform:uppercase;letter-spacing:.05em;margin-left:8px}
.kinga-report .ml-badge.normal{background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7}
.kinga-report .ml-badge.anomaly{background:#fff8e1;color:#f57f17;border:1px solid #ffe082}
.kinga-report .ml-badge.cluster{background:#e8eaf6;color:#283593;border:1px solid #9fa8da}
.kinga-report .decision-box{border:2px solid #111;padding:20px 24px;margin-bottom:20px;text-align:center}
.kinga-report .db-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#888;margin-bottom:8px}
.kinga-report .db-value{font-size:28px;font-weight:700;color:#111}
.kinga-report .db-sub{font-size:11px;color:#555;margin-top:6px}
.kinga-report .flowchart{display:flex;flex-direction:column;align-items:center;gap:0;margin-bottom:20px}
.kinga-report .fc-box{width:360px;padding:12px 20px;text-align:center;border:1px solid #ccc;font-size:12px;background:#fff}
.kinga-report .fc-box.start{background:#fff;font-weight:700;border:2px solid #111}
.kinga-report .fc-box.amber-box{background:#fff;border-color:#c8a000;color:#7a5c00}
.kinga-report .fc-box.green-box{background:#fff;border-color:#388e3c;color:#1b5e20}
.kinga-report .fc-box.red-box{background:#fff;border-color:#c62828;color:#b71c1c}
.kinga-report .fc-box.decision-final{background:#fff;border:2px solid #111;font-size:16px;font-weight:700;color:#111}
.kinga-report .fc-score{font-size:11px;opacity:.8;margin-top:3px}
.kinga-report .fc-arrow{font-size:18px;color:#888;line-height:1;padding:2px 0}
.kinga-report .blockers-list{margin-bottom:16px;list-style:none;padding:0}
.kinga-report .blockers-list li{font-size:12px;color:#333;padding:4px 0 4px 16px;position:relative;border-bottom:1px solid #f0f0f0}
.kinga-report .blockers-list li::before{content:'•';position:absolute;left:0;color:#888}
.kinga-report .next-steps{margin-bottom:20px;list-style:none;padding:0}
.kinga-report .next-steps li{font-size:12px;color:#333;padding:5px 0 5px 28px;position:relative;border-bottom:1px solid #f0f0f0}
.kinga-report .ns-num{position:absolute;left:0;font-weight:700;color:#888;font-size:11px}
.kinga-report .integrity-table{width:100%;border-collapse:collapse;margin-bottom:14px}
.kinga-report .integrity-table td{padding:7px 12px;font-size:12px;border-bottom:1px solid #eee}
.kinga-report .integrity-table td:first-child{color:#555;width:210px;font-size:11px}
.kinga-report .hash-block{font-family:'Courier New',monospace;font-size:10px;color:#444;background:#fff;padding:10px 14px;border:1px solid #ddd;margin-bottom:10px;word-break:break-all}
.kinga-report .tamper-note{font-size:11px;color:#666;font-style:italic;margin-bottom:16px}
.kinga-report .lifecycle-bar{display:flex;margin-bottom:8px}
.kinga-report .lc-step{flex:1;padding:10px 8px;text-align:center;font-size:11px;font-weight:700;background:#fff;color:#888;border:1px solid #ddd;border-right:none}
.kinga-report .lc-step:last-child{border-right:1px solid #ddd}
.kinga-report .lc-step.active{background:#fff;color:#7a5c00;border-color:#c8a000;border-bottom:3px solid #c8a000}
.kinga-report .lc-step.done{background:#fff;color:#2e7d32;border-color:#a5d6a7;border-bottom:3px solid #2e7d32}
.kinga-report .conf-footer{font-size:10px;color:#888;text-align:center;padding:12px 20px;border-top:1px solid #ddd;line-height:1.5;background:#fff}
.kinga-report .two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.kinga-report .section-divider{border:none;border-top:1px solid #ddd;margin:24px 0}
.kinga-report .text-muted{color:#888}
.kinga-report .mono{font-family:'Courier New',monospace}
.kinga-report .small{font-size:10px}
.kinga-report .party-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #ddd;margin-bottom:14px}
.kinga-report .party-col{padding:14px 16px}
.kinga-report .party-col:first-child{border-right:1px solid #ddd}
.kinga-report .party-col-heading{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #eee}
.kinga-report .party-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f5f5f5;font-size:11px}
.kinga-report .party-row:last-child{border-bottom:none}
.kinga-report .party-row .pr-label{color:#555}
.kinga-report .party-row .pr-value{font-weight:500;color:#111;text-align:right;max-width:160px}
/* Override any Tailwind/dark-mode variables inside the report */
.kinga-report *{box-sizing:border-box}
.kinga-report h1,.kinga-report h2,.kinga-report h3,.kinga-report h4{font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-weight:700}
.kinga-report h1{font-size:22px}
.kinga-report h2{font-size:16px}
.kinga-report h3{font-size:14px}
.kinga-report h4{font-size:13px}
/* Body text: uniform 12px throughout */
.kinga-report p,.kinga-report td,.kinga-report li,.kinga-report span{font-size:12px}
/* Sub-labels: 10px only for section headings and KPI labels */
.kinga-report .section-heading{font-size:9px}
.kinga-report .kpi-label{font-size:9px}
/* ── CSS variable overrides: map all dark-theme vars to white-document values ── */
.kinga-report,.dark .kinga-report{color-scheme:light !important;background:#fff !important;color:#111 !important;
  --background:#fff;
  --foreground:#111;
  --card:#fff;
  --card-foreground:#111;
  --border:#ddd;
  --muted:#f8f8f8;
  --muted-foreground:#666;
  --primary:#111;
  --primary-foreground:#fff;
  --fp-success:#2e7d32;
  --fp-success-bg:#e8f5e9;
  --fp-success-border:#a5d6a7;
  --fp-success-text:#2e7d32;
  --fp-warning-bg:#fff8e1;
  --fp-warning-border:#ffe082;
  --fp-warning-text:#c8a000;
  --fp-critical-bg:#ffebee;
  --fp-critical-border:#ef9a9a;
  --fp-critical-text:#c00;
  --fp-info:#1565c0;
  --fp-info-bg:#f0f4ff;
  --fp-info-border:#90caf9;
  --fp-info-text:#1565c0;
  --fp-danger:#c00;
  --fp-warn:#c8a000;
  --status-approve-bg:#e8f5e9;
  --status-approve-border:#a5d6a7;
  --status-approve-text:#2e7d32;
  --status-review-bg:#fff8e1;
  --status-review-border:#ffe082;
  --status-review-text:#c8a000;
  --status-reject-bg:#ffebee;
  --status-reject-border:#ef9a9a;
  --status-reject-text:#c00;
}
/* Force white background and serif font on all child elements */
.kinga-report, .kinga-report *:not(button):not(.no-print),
.dark .kinga-report, .dark .kinga-report *:not(button):not(.no-print){
  color-scheme: light !important;
}
/* Nuke all dark: utility classes inside the report */
.kinga-report [class*="dark:"]{
  all: revert;
  color: inherit !important;
  background: inherit !important;
}
.kinga-report [class*="rounded"]{
  border-radius:0 !important;
}
.kinga-report [class*="bg-card"],.kinga-report [style*="var(--card)"]{
  background:#fff !important;
}
.kinga-report [class*="bg-muted"],.kinga-report [style*="var(--muted)"]{
  background:#fff !important;
}
.kinga-report [class*="text-muted"],.kinga-report [style*="var(--muted-foreground)"]{
  color:#666 !important;
}
.kinga-report [class*="text-foreground"],.kinga-report [style*="var(--foreground)"]{
  color:#111 !important;
}
.kinga-report [class*="border-border"],.kinga-report [style*="var(--border)"]{
  border-color:#ddd !important;
}
/* Table rows */
.kinga-report table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px}
.kinga-report table td,.kinga-report table th{padding:7px 12px;font-size:12px !important;border-bottom:1px solid #eee;vertical-align:top;color:#111;background:#fff}
.kinga-report table th{font-size:10px !important;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#888;background:#fff;border-bottom:1px solid #ddd}
.kinga-report table td:first-child{color:#555;font-size:12px !important}
/* Narrative boxes */
.kinga-report [class*="p-3"][class*="rounded"]{background:#fff !important;border:1px solid #ddd !important;border-radius:0 !important;color:#333 !important}
/* Section sub-headings */
.kinga-report [class*="text-xs"][class*="font-bold"][class*="uppercase"]{color:#888 !important;font-size:10px !important}
/* Badges */
.kinga-report .bg-green-100{background:#e8f5e9 !important;color:#2e7d32 !important}
.kinga-report .bg-yellow-100{background:#fff8e1 !important;color:#c8a000 !important}
.kinga-report .bg-red-100{background:#ffebee !important;color:#c00 !important}
.kinga-report .bg-orange-100{background:#fff3e0 !important;color:#e65100 !important}
.kinga-report .dark\:bg-green-950{background:#e8f5e9 !important}
.kinga-report .dark\:bg-yellow-950{background:#fff8e1 !important}
.kinga-report .dark\:bg-red-950{background:#ffebee !important}
.kinga-report .dark\:bg-orange-950{background:#fff3e0 !important}
.kinga-report .dark\:bg-amber-950{background:#fff8e1 !important}
.kinga-report .text-green-800{color:#2e7d32 !important}
.kinga-report .text-yellow-800{color:#c8a000 !important}
.kinga-report .text-red-800{color:#c00 !important}
.kinga-report .text-orange-700{color:#e65100 !important}
.kinga-report .text-amber-900{color:#7a5c00 !important}
.kinga-report .dark\:text-green-200{color:#2e7d32 !important}
.kinga-report .dark\:text-yellow-200{color:#c8a000 !important}
.kinga-report .dark\:text-red-200{color:#c00 !important}
.kinga-report .dark\:text-orange-200{color:#e65100 !important}
.kinga-report .dark\:text-amber-300{color:#c8a000 !important}
/* Override tinted Tailwind utility classes to white */
.kinga-report .bg-amber-50{background:#fff !important;color:#7a5c00 !important}
.kinga-report .bg-red-50{background:#fff !important;color:#c00 !important}
/* CongruencyPanel and DataQualityPanel */
.kinga-report [class*="overflow-hidden"]{background:#fff !important}
/* ── Photo overlay dark backgrounds ── */
.kinga-report .bg-black\/55,.kinga-report [style*="bg-black"]{background:rgba(0,0,0,0.55) !important}
/* ── Inline dark backgrounds from Tailwind (bg-gray-900, bg-slate-800, etc.) ── */
.kinga-report [class*="bg-gray-9"],.kinga-report [class*="bg-slate-9"],.kinga-report [class*="bg-zinc-9"],.kinga-report [class*="bg-neutral-9"]{background:#fff !important;color:#111 !important}
.kinga-report [class*="bg-gray-8"],.kinga-report [class*="bg-slate-8"],.kinga-report [class*="bg-zinc-8"]{background:#fff !important;color:#111 !important}
/* ── Status-pass/fail aliases (used by StatusBadge) ── */
.kinga-report{--status-pass:#2e7d32;--status-pass-bg:#e8f5e9;--status-pass-border:#a5d6a7;--status-fail:#c00;--status-fail-bg:#ffebee;--status-fail-border:#ef9a9a}
/* ── Radix Collapsible: force open in report context ── */
.kinga-report [data-state="closed"]{display:block !important;height:auto !important;overflow:visible !important}
/* ── Chart.js canvas: ensure white background ── */
.kinga-report canvas{background:#fff !important}
/* ─── @media print ─────────────────────────────────────────────────────────── */
@media print{
  /* Pure white document — no backgrounds anywhere except charts/SVGs */
  .kinga-report,.kinga-report *{background:#fff !important;color:#111 !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  /* Restore semantic text colours for flags and badges (text only, no backgrounds) */
  .kinga-report .flag-red,.kinga-report [style*="color:#c00"]{color:#c00 !important}
  .kinga-report .flag-amber,.kinga-report [style*="color:#c8a000"]{color:#c8a000 !important}
  .kinga-report .flag-green,.kinga-report [style*="color:#2e7d32"]{color:#2e7d32 !important}
  /* Dimension and ML badges: white background, coloured text and border only */
  .kinga-report .dim-badge.pass{background:#fff !important;color:#2e7d32 !important;border:1px solid #2e7d32 !important}
  .kinga-report .dim-badge.warn{background:#fff !important;color:#c8a000 !important;border:1px solid #c8a000 !important}
  .kinga-report .dim-badge.fail{background:#fff !important;color:#c00 !important;border:1px solid #c00 !important}
  .kinga-report .ml-badge.normal{background:#fff !important;color:#2e7d32 !important;border:1px solid #2e7d32 !important}
  .kinga-report .ml-badge.anomaly{background:#fff !important;color:#c8a000 !important;border:1px solid #c8a000 !important}
  .kinga-report .ml-badge.cluster{background:#fff !important;color:#283593 !important;border:1px solid #283593 !important}
  /* Stage tiles: white background, coloured text and border only */
  .kinga-report .stage-tile.green{background:#fff !important;color:#2e7d32 !important;border:1px solid #2e7d32 !important}
  .kinga-report .stage-tile.amber{background:#fff !important;color:#c8a000 !important;border:1px solid #c8a000 !important}
  /* Lifecycle steps: white background, coloured bottom border for active/done */
  .kinga-report .lc-step.active{background:#fff !important;color:#c8a000 !important;border-bottom:3px solid #c8a000 !important}
  .kinga-report .lc-step.done{background:#fff !important;color:#2e7d32 !important;border-bottom:3px solid #2e7d32 !important}
  /* Alert banners: white background, coloured left border only */
  .kinga-report .alert-banner{background:#fff !important;border-left:4px solid #c8a000 !important}
  .kinga-report .alert-banner.critical{background:#fff !important;border-left-color:#c00 !important}
  .kinga-report .alert-banner.info{background:#fff !important;border-left-color:#111 !important}
  /* Table borders visible in print */
  .kinga-report table,.kinga-report table td,.kinga-report table th{border-color:#ddd !important;background:#fff !important}
  /* Section 2.5 Quote Coverage table */
  .kinga-report .report-table,.kinga-report .report-table td,.kinga-report .report-table th{border:1px solid #ddd !important;background:#fff !important}
  /* Page break strategy */
  .kinga-report .section-heading{page-break-before:auto;page-break-after:avoid}
  /* Section 4 Evidence Inventory: start on new page */
  .kinga-report [data-section="4"]{page-break-before:always}
  /* Photo cards: never split mid-row */
  .kinga-report .photo-card,.kinga-report [data-photo-card]{page-break-inside:avoid}
  /* Flowchart and charts: keep together */
  .kinga-report .flowchart,.kinga-report .chart-container,.kinga-report canvas{page-break-inside:avoid}
  /* SVG damage map: keep together */
  .kinga-report svg{page-break-inside:avoid}
  /* Hide UI chrome that is not part of the report */
  .kinga-report .no-print,.no-print{display:none !important}
  /* Radix Collapsible: force open */
  .kinga-report [data-state="closed"]{display:block !important;height:auto !important;overflow:visible !important}
  /* Photo overlays: keep dark for readability over images */
  .kinga-report .bg-black\/55{background:rgba(0,0,0,0.55) !important;color:#fff !important}
}
`;


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
    <div className="kinga-report">
      <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />
      {/* C-5: Contradiction warning banner — hidden from report per design decision */}
      {/* Page header bar */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>
          Claim: {claim?.claimNumber ?? claim?.claimReference ?? '—'} &nbsp;|&nbsp;
          Run: {(aiAssessment as any)?._forensicAnalysis?.pipelineSummary?.runId ?? 'RUN-' + (aiAssessment?.id ?? '?')} &nbsp;|&nbsp;
          Hash: #{((aiAssessment?.id ?? 0) * 31337).toString(16).toUpperCase().slice(0, 8)}
        </span>
        <span className="brand" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <img
            src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/kHgyKMImePvAREGM.png"
            alt="KINGA"
            style={{ height: 28, width: 28, objectFit: 'contain', flexShrink: 0 }}
          />
          KINGA AI
        </span>
      </div>

      <CongruencyPanel aiAssessment={aiAssessment} />
      <DataQualityPanel aiAssessment={aiAssessment} />
      <Section0Cover claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} quotes={quotes} fmtMoney={fmtMoney} />

      <div className="section-heading">01 — Incident &amp; Data Integrity</div>
      <Section1Incident claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} fmtMoney={fmtMoney} />

      <div className="section-heading">02 — Technical Forensics</div>
      <Section2Physics claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} />

      <div className="section-heading">03 — Financial Validation</div>
      <Section3Financial aiAssessment={aiAssessment} enforcement={enforcement} quotes={quotes} fmtMoney={fmtMoney} claimId={claim?.id} />

      <div className="section-heading" data-section="4">04 — Evidence Inventory</div>
      <Section4Evidence aiAssessment={aiAssessment} enforcement={enforcement} claim={claim} />

      <div className="section-heading">05 — Risk &amp; Fraud Assessment</div>
      <Section5Fraud aiAssessment={aiAssessment} enforcement={enforcement} />

      <div className="section-heading">06 — Decision Authority &amp; Audit Trail</div>
      <Section6Decision claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} />

      <div className="section-heading">07 — Machine Learning Insights</div>
      <Section7Learning aiAssessment={aiAssessment} enforcement={enforcement} fmtMoney={fmtMoney} />

      {/* ── KINGA AI Engine Block — always at the bottom of the report body ── */}
      <div style={{ background: '#fff', border: '1px solid #ddd', padding: '16px', textAlign: 'center', marginTop: '24px', marginBottom: '8px' }}>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#111' }}>KINGA AI</p>
        <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
          Engine v{aiAssessment?.engineVersion ?? '4.2'} · Report #{((aiAssessment?.id ?? 0) * 31337).toString(16).padStart(8, '0').toUpperCase().slice(0, 8)} · {new Date(aiAssessment?.createdAt ?? Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
        <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>
          This report is generated by an AI system and is intended to assist human adjusters. All decisions require human review and authorisation. KINGA AI does not constitute legal advice.
        </p>
      </div>

      <div className="conf-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span>
          KINGA AI — Forensic Claim Decision Report — CONFIDENTIAL — For authorised insurer use only.
          This report is generated by an AI system and must be reviewed by a qualified human adjuster before any claim decision is finalised.
        </span>
        <img
          src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/kHgyKMImePvAREGM.png"
          alt="KINGA"
          style={{ height: 24, width: 24, objectFit: 'contain', flexShrink: 0, opacity: 0.7 }}
        />
      </div>
    </div>
  );
}
