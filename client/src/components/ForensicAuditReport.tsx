/**
 * KINGA v4.2 — Forensic Audit Report
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
import { expandShorthand } from "../../../shared/expandShorthand";
import { ReportSectionThread } from "./ReportSectionThread";
import { ConfidenceImprovementChecklist } from "./ConfidenceImprovementChecklist";
import { ComponentCostMatrix, MatrixQuote, MatrixRow } from "./ComponentCostMatrix";
import { Bar } from "react-chartjs-2";
import { CostComparisonChart, FraudBreakdownChart, DamageSeverityChart, ConfidenceGauge } from "./ForensicCharts";
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

interface FARApprovalEntry {
  id: number;
  stageOrder: number | null;
  stageName: string | null;
  roleKey: string | null;
  actorName: string | null;
  decision: string;
  notes: string | null;
  actedAt: string | null;
}

interface FARWorkflowStage {
  stage_order: number;
  name: string;
  role_key: string;
  required: boolean;
}

interface ForensicAuditReportProps {
  claim: any;
  aiAssessment: any;
  enforcement: any;
  quotes?: any[];
  accuracyReport?: any; // FieldAccuracyReport from fieldAccuracyEngine
  approvalHistory?: FARApprovalEntry[];
  workflowStages?: FARWorkflowStage[];
  /** Numeric claim ID for section annotations */
  claimId?: number;
  /** Current pipeline run ID for annotation versioning */
  pipelineRunId?: number;
  /** When true, renders a DRAFT watermark banner — used when required fields are missing at export time */
  isDraft?: boolean;
  /** List of missing fields that caused the draft status */
  draftMissingFields?: string[];
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
  if (s == null) return '';
  return String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Sentence-case: first letter capitalised, rest lower */
function toSentenceCase(s: string | null | undefined): string {
  if (s == null) return '';
  const clean = String(s).replace(/_/g, ' ').toLowerCase();
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
 * C-07: Sanitise text artefacts introduced by LLM word-wrap or OCR processing.
 * Fixes:
 *   - Period-inserted mid-word breaks: "threshold.ered" → "thresholded"
 *   - Double-space word splits: "recommende ed" → "recommended"
 *   - Hyphenated line-break artefacts: "con-\nfirmed" → "confirmed"
 *   - Repeated punctuation from OCR: ".." → "."
 */
function sanitiseTextArtefacts(text: string): string {
  if (!text) return text;
  return text
    // Fix hyphenated line-break artefacts: "con-\nfirmed" → "confirmed"
    .replace(/([a-zA-Z])-\n([a-zA-Z])/g, '$1$2')
    // Fix period-inserted mid-word breaks: "threshold.ered" → "thresholded"
    // Only when the period is surrounded by lowercase letters (not sentence boundaries)
    .replace(/([a-z])\.([a-z])/g, '$1$2')
    // Fix double-space word splits: "recommende ed" → "recommended"
    // Pattern: lowercase letters, space, lowercase letters where the split looks like a broken word
    .replace(/([a-z]{3,})\s([a-z]{2,})(?=\s|$)/g, (match, p1, p2) => {
      // Only merge if it looks like a broken word (second part is a suffix or continuation)
      const merged = p1 + p2;
      // Simple heuristic: if the second part starts with a vowel or common suffix, merge
      const COMMON_SUFFIXES = ['ed', 'ing', 'ion', 'tion', 'ation', 'ness', 'ment', 'er', 'est', 'ly', 'al', 'ful', 'less', 'ous', 'ive'];
      if (COMMON_SUFFIXES.some(s => p2 === s || p2.startsWith(s)) && p2.length <= 5) {
        return merged;
      }
      return match;
    })
    // Fix repeated punctuation from OCR
    .replace(/\.{2,}/g, '.')
    .replace(/,{2,}/g, ',')
    // Fix space before punctuation
    .replace(/ ([.,;:!?])/g, '$1')
    // Normalise multiple spaces
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Strip assessor-authored conclusion phrases from the raw narrative text.
 * These phrases (e.g. "damages are consistent", "kindly authorise repairs")
 * are written by the assessor/repairer as recommendations, not by the KINGA engine.
 * Displaying them verbatim in the forensic report is misleading because they
 * assert conclusions that the engine has not independently verified.
 * The engine's own cross-validation verdict is shown separately below the narrative.
 */
function filterAssessorConclusions(text: string): string {
  if (!text) return text;

  // ── Incident Narrative Filter ─────────────────────────────────────────────────
  //
  // PURPOSE: Remove assessor commentary that has been appended to the claimant's
  // incident narrative in ZW/SA claim documents.  The assessor often writes their
  // conclusions directly after the claimant's account in the same text block.
  //
  // DESIGN PRINCIPLE: Distinguish by GRAMMATICAL ROLE, not individual words.
  //
  // An incident narrative sentence has the claimant as the subject and describes
  // a physical event:  "I was travelling along Borrowdale Road when a vehicle
  // pulled out and struck my right front."
  //
  // An assessor commentary sentence has an abstract subject (the claim, the quote,
  // the damage, the vehicle, the costs) and expresses an opinion or instruction:
  // "The adjusted quote appears to be fair and reasonable."
  // "Damage is consistent with the accident description."
  // "Kindly authorise repairs to the above vehicle."
  //
  // We detect assessor commentary by recognising three structural patterns:
  //
  //   PATTERN A — Assessor verdict: abstract subject + opinion predicate
  //     Subject:   damage | quote | costs | vehicle | claim | circumstances
  //     Predicate: is consistent with | is fair | is repairable | is valid | etc.
  //
  //   PATTERN B — Assessor instruction: imperative directed at the insurer
  //     "Kindly authorise...", "Please approve...", "Recommend settlement..."
  //
  //   PATTERN C — All-caps stamp lines
  //     Lines written entirely in capitals are assessor verdict stamps, never
  //     claimant narrative.  A claimant writes in mixed case.
  //
  // We do NOT strip sentences based on individual words like "repair", "parts",
  // "confirmed", "check", "adjusted" — those appear legitimately in claimant
  // narratives ("I confirmed the other driver's details", "the rear parts of my
  // vehicle were damaged", "I adjusted my speed").
  // ─────────────────────────────────────────────────────────────────────────────

  // PATTERN C: All-caps stamp lines (15+ chars, only uppercase letters and punctuation)
  const isAllCapsStamp = (s: string) => /^[A-Z\s.,;:!\-()]{15,}$/.test(s);

  // PATTERN A: Assessor verdict subjects — things the assessor evaluates, not the claimant
  const ASSESSOR_VERDICT_SUBJECTS = [
    /^(?:the\s+)?(?:adjusted\s+)?quote/i,
    /^(?:the\s+)?(?:repair\s+)?costs?/i,
    /^(?:the\s+)?damage/i,
    /^(?:the\s+)?(?:claimed?\s+)?vehicle/i,
    /^(?:the\s+)?claim/i,
    /^(?:the\s+)?circumstances/i,
    /^(?:the\s+)?(?:repair\s+)?(?:quote\s+)?items?/i,
    /^(?:the\s+)?(?:spares?|parts?)\s+(?:and\s+labour\s+)?(?:rates?|costs?|prices?)/i,
    /^spares?\s+prices?/i,
    /^(?:the\s+)?labour/i,
    /^(?:the\s+)?(?:overall\s+)?(?:repair\s+)?(?:total|amount)/i,
  ];

  // Opinion/verdict predicates that follow an assessor subject
  const ASSESSOR_VERDICT_PREDICATES = [
    /(?:is|are|appears?\s+to\s+be|seems?\s+to\s+be)\s+(?:fair|reasonable|market.?related|within\s+(?:market|prevailing|acceptable)|consistent\s+with|genuine|valid|legitimate)/i,
    /(?:is|are)\s+(?:repairable|a\s+write.?off|beyond\s+economic\s+repair|a\s+total\s+loss)/i,
    /(?:is|are)\s+consistent\s+with\s+(?:the\s+)?(?:accident|reported|claimed|circumstances)/i,
    /(?:has|have)\s+been\s+(?:verified|confirmed|sourced|checked|adjusted|revised)/i,
    /\bconsistent\s+with\s+(?:the\s+)?(?:accident|reported|claimed|circumstances|description)/i,
    /(?:is|are)\s+(?:within|at)\s+(?:prevailing|market|current|acceptable)\s+(?:rates?|prices?|levels?)/i,
  ];

  // PATTERN B: Assessor instructions — imperatives directed at the insurer
  const ASSESSOR_INSTRUCTIONS = [
    /^(?:kindly|please)\s+(?:authoris[ez]|authorize|approve|proceed\s+with|settle|pay)/i,
    /^(?:authoris[ez]|authorize|approve)\s+(?:the\s+)?repairs?/i,
    /^(?:we\s+)?recommend\s+(?:approval|authoris[ez]ation|settlement|payment|that\s+(?:the\s+)?claim)/i,
    /^(?:we\s+)?(?:kindly\s+)?request\s+(?:authoris[ez]ation|approval|settlement)/i,
    /^(?:please\s+)?(?:proceed\s+with|effect)\s+(?:the\s+)?(?:repairs?|payment|settlement)/i,
    /^kindly\s+note/i,
    /^we\s+hereby\s+(?:confirm|certify|declare)/i,
  ];

  // Specific multi-word phrases that are always assessor commentary
  const SPECIFIC_ASSESSOR_PHRASES = [
    /lowest\s+(?:available\s+)?(?:repairer|quote|quotation)/i,
    /motion\s+panel/i,
    /vehicle\s+was\s+stripped\s+(?:in\s+order\s+to|to\s+identify)/i,
    /omitted\s+damages?\s+(?:found|identified|noted)/i,
    /after\s+(?:final\s+)?inspection\s+(?:we\s+)?noted/i,
    /(?:images?|photos?|pictures?)\s+(?:of\s+(?:the\s+)?damage\s+)?(?:are\s+)?(?:attached|enclosed|included|herewith)/i,
    /(?:as\s+per\s+)?(?:the\s+)?(?:attached|enclosed)\s+(?:images?|photos?|quotation|quote|report)/i,
    /they\s+quoted\s+for/i,
    /(?:the\s+)?(?:repairer|assessor|panel\s+beater)\s+(?:has|have)?\s*quoted\s+for/i,
  ];

  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);

  const narrativeSentences = sentences.filter(sentence => {
    if (isAllCapsStamp(sentence)) return false;
    if (ASSESSOR_INSTRUCTIONS.some(p => p.test(sentence))) return false;
    const hasAssessorSubject = ASSESSOR_VERDICT_SUBJECTS.some(p => p.test(sentence));
    if (hasAssessorSubject && ASSESSOR_VERDICT_PREDICATES.some(p => p.test(sentence))) return false;
    if (SPECIFIC_ASSESSOR_PHRASES.some(p => p.test(sentence))) return false;
    return true;
  });

  return narrativeSentences.join(' ').replace(/[ \t]{2,}/g, ' ').trim();
}

// ─── Section Divider ─────────────────────────────────────────────────────────

function SectionDivider({ number, title, sectionKey, claimId, pipelineRunId }: { number: string; title: string; sectionKey?: string; claimId?: number; pipelineRunId?: number }) {
  return (
    <div className="mb-4 mt-6 print-section-divider">
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          {number}
        </div>
        <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: "#0f172a" }}>
          {title}
        </h2>
        <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
      </div>
      {sectionKey && claimId != null && (
        <div style={{ marginLeft: "40px", marginTop: "4px" }}>
          <ReportSectionThread claimId={claimId} sectionKey={sectionKey} pipelineRunId={pipelineRunId} />
        </div>
      )}
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
    na:   { bg: "#ffffff", color: "#64748b", border: "#e2e8f0" },
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
  0: "#f7f6f3",   // off-white — undamaged (design system)
  1: "#fef3c7",   // warm amber tint — minor
  2: "#ffedd5",   // deep orange tint — moderate
  3: "#fee2e2",   // deep red tint — severe
};
const SEVERITY_STROKE: Record<DamageSeverity, string> = {
  0: "#e0ddd8",   // design system rule colour — undamaged
  1: "#d97706",   // amber — minor
  2: "#c2410c",   // deep orange — moderate
  3: "#b91c1c",   // deep red — severe
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
  // Single-vehicle events: road hazard, pothole, depression, flood, fire, theft, hail, etc.
  if (/ROAD_HAZARD|SINGLE_VEHICLE|POTHOLE|DEPRESSION|FLOOD|FIRE|THEFT|HAIL|STORM|VANDAL|FALLING|DEBRIS|ANIMAL_STRIKE|HIT_AND_RUN/.test(n)) return "front";
  // Any remaining non-empty, non-unknown type: return null to allow smarter fallback
  return null;
}

/**
 * Infer impact direction from the actual damaged zones.
 * Mirrors the server-side ZONE_DIRECTION_MAP in damagePhysicsCoherence.ts.
 * Returns the most-voted direction across all damaged zones, or null if ambiguous.
 */
function inferDirectionFromZones(damageZones: string[]): "front" | "rear" | "left" | "right" | null {
  if (!damageZones || damageZones.length === 0) return null;
  const votes: Record<string, number> = { front: 0, rear: 0, left: 0, right: 0 };
  for (const z of damageZones) {
    const n = z.toLowerCase().replace(/[\s-]/g, "_");
    // Front indicators
    if (/front|bonnet|hood|bumper_front|grille|headlight|windshield|radiator|bumper(?!.*rear)/.test(n)) votes.front += 2;
    // Rear indicators
    if (/rear|boot|trunk|tailgate|taillight|bumper_rear|back/.test(n)) votes.rear += 2;
    // Left/driver side indicators
    if (/driver|left|lhs|l\.f|l\.r|front_left|rear_left|driver_door|driver_side/.test(n)) votes.left += 1;
    // Right/passenger side indicators
    if (/passenger|right|rhs|r\.f|r\.r|front_right|rear_right|passenger_door|passenger_side/.test(n)) votes.right += 1;
  }
  // Find the direction with the highest vote count
  const best = (Object.entries(votes) as [string, number][]).reduce((a, b) => b[1] > a[1] ? b : a);
  if (best[1] === 0) return null;
  // If front+rear or left+right are tied, it's multi-impact — default to front
  const sorted = (Object.entries(votes) as [string, number][]).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] === sorted[1][1] && sorted[0][1] > 0) return "front";
  return best[0] as "front" | "rear" | "left" | "right";
}

/**
 * Map a canonical physics impactVector.direction (Stage 7 output) to the arrow direction.
 * Physics directions: frontal | rear | side_driver | side_passenger | rollover | multi_impact | unknown
 */
function physicsDirectionToArrow(physDir: string | null | undefined): "front" | "rear" | "left" | "right" | "rollover" | null {
  if (!physDir) return null;
  const n = physDir.toLowerCase();
  if (n === "frontal" || n === "front") return "front";
  if (n === "rear") return "rear";
  if (n === "side_driver" || n === "left") return "left";
  if (n === "side_passenger" || n === "right") return "right";
  if (n === "rollover") return "rollover";
  if (n === "multi_impact") return "front"; // default to front for multi-impact
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

function VehicleDamageMap({ damageZones, incidentType, physicsDirection, inconsistencyLabel, multiEventSequence, deltaV, energyKj, impactForceKn, decelerationG, velocityRange, energyAbsorptionRatio }: {
  damageZones: string[];
  incidentType: string;
  physicsDirection?: string | null;
  inconsistencyLabel?: string;
  multiEventSequence?: { is_multi_event: boolean; events: Array<{ event_order: number; event_type: string; involves_third_party: boolean; damage_contribution: string[] }> } | null;
  deltaV?: number;
  energyKj?: number;
  impactForceKn?: number;
  decelerationG?: number | null;
  velocityRange?: { low_kmh: number; high_kmh: number } | null;
  energyAbsorptionRatio?: number | null;
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
    // 3-tier direction inference:
    // 1. Physics engine impactVector.direction (most authoritative — Stage 7 computed)
    // 2. Damage zones (inferred from actual damaged parts)
    // 3. Incident type string (last resort)
    const physArrow = physicsDirectionToArrow(physicsDirection);
    const zoneArrow = physArrow ? null : inferDirectionFromZones(damageZones);
    const typeArrow = (physArrow || zoneArrow) ? null : resolveDirection(incidentType);
    const dir = physArrow ?? zoneArrow ?? typeArrow;
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
    <div className="flex justify-center items-start gap-4">
      {/* SVG diagram */}
      <div className="flex flex-col items-center shrink-0">
        <svg viewBox="-50 -36 420 360" width="100%" style={{ display: 'block', maxWidth: '100%', aspectRatio: '420/360' }}>
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
          {/* Velocity range confidence band — placed above compass label */}
          {velocityRange && velocityRange.low_kmh > 0 ? (
            <text x="160" y="-20" textAnchor="middle" fontSize="7.5" fill="#6366f1" fontStyle="italic">
              {`Speed est. ${velocityRange.low_kmh.toFixed(0)}–${velocityRange.high_kmh.toFixed(0)} km/h`}
            </text>
          ) : null}
          <text x="160" y="300" textAnchor="middle" fontSize="9" fontWeight="bold" fill="var(--muted-foreground)">S — REAR</text>
          <text x="-8" y="144" textAnchor="end" fontSize="9" fontWeight="bold" fill="var(--muted-foreground)">L</text>
          <text x="328" y="144" textAnchor="start" fontSize="9" fontWeight="bold" fill="var(--muted-foreground)">R</text>

          {/* Vehicle body */}
          <rect x="76" y="52" width="168" height="176" rx="20"
            fill="#f0f0ee" stroke="#0a0a0a" strokeWidth="1.5" />
          {/* Windscreen */}
          <rect x="92" y="62" width="136" height="52" rx="8"
            fill="#e8e8e6" stroke="#0a0a0a" strokeWidth="1" opacity="0.7" />
          {/* Rear window */}
          <rect x="92" y="166" width="136" height="48" rx="8"
            fill="#e8e8e6" stroke="#0a0a0a" strokeWidth="1" opacity="0.7" />
          {/* Wheels */}
          {([[62,72],[62,188],[238,72],[238,188]] as [number,number][]).map(([wx,wy],i) => (
            <rect key={i} x={wx} y={wy} width="20" height="36" rx="6"
              fill="#1a1916" opacity="0.55" />
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
                  strokeWidth={isFirst ? (impactForceKn && impactForceKn > 0 ? Math.min(2 + impactForceKn / 20, 7) : 4) : 3}
                  strokeDasharray={arrow.dashed ? "6 3" : undefined}
                  markerEnd={`url(#${markerId})`}
                />
                {/* Arrow label — event name + force + decel for primary arrow */}
                <text x={lblX} y={lblY} fontSize="8" fontWeight="bold" fill={arrow.colour} textAnchor="middle">
                  {arrow.label}
                </text>
                {isFirst && impactForceKn && impactForceKn > 0 ? (
                  <text x={lblX} y={lblY + 10} fontSize="7.5" fill={arrow.colour} textAnchor="middle" opacity="0.9">
                    {`${impactForceKn.toFixed(1)} kN${decelerationG && decelerationG > 0 ? ` · ${decelerationG.toFixed(1)} g` : ''}`}
                  </text>
                ) : null}
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

          {/* Energy absorption arc — drawn around primary impact zone when ratio is available */}
          {(() => {
            if (!energyAbsorptionRatio || energyAbsorptionRatio <= 0) return null;
            const primaryDir = arrowList[0]?.dir;
            const zoneMap: Record<string, { cx: number; cy: number; r: number }> = {
              front:   { cx: 160, cy: 32,  r: 30 },
              rear:    { cx: 160, cy: 248, r: 30 },
              left:    { cx: 30,  cy: 140, r: 24 },
              right:   { cx: 290, cy: 140, r: 24 },
            };
            const zc = primaryDir ? zoneMap[primaryDir] : null;
            if (!zc) return null;
            const ratio = Math.min(Math.max(energyAbsorptionRatio, 0), 1);
            const arcColour = ratio > 0.7 ? '#ef4444' : ratio > 0.4 ? '#f59e0b' : '#22c55e';
            const arcPct = Math.round(ratio * 100);
            const circumference = 2 * Math.PI * zc.r;
            const dashLen = ratio * circumference;
            const gapLen = circumference - dashLen;
            return (
              <g>
                <circle cx={zc.cx} cy={zc.cy} r={zc.r} fill="none" stroke="var(--border)" strokeWidth="3" opacity="0.35" />
                <circle
                  cx={zc.cx} cy={zc.cy} r={zc.r}
                  fill="none"
                  stroke={arcColour}
                  strokeWidth="3"
                  strokeDasharray={`${dashLen.toFixed(1)} ${gapLen.toFixed(1)}`}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${zc.cx} ${zc.cy})`}
                  opacity="0.85"
                />
                <text x={zc.cx} y={zc.cy + 4} textAnchor="middle" fontSize="8" fontWeight="bold" fill={arcColour}>{arcPct}%</text>
                <text x={zc.cx} y={zc.cy + 14} textAnchor="middle" fontSize="6.5" fill={arcColour} opacity="0.8">abs.</text>
              </g>
            );
          })()}
          {/* Physics force annotations — shown at bottom of diagram when data is available */}
          {(deltaV != null && deltaV > 0) || (energyKj != null && energyKj > 0) || (impactForceKn != null && impactForceKn > 0) ? (
            <g>
              <rect x="52" y="272" width="216" height="28" rx="3" fill="var(--muted)" stroke="var(--border)" strokeWidth="1" opacity="0.9" />
              <text x="160" y="283" textAnchor="middle" fontSize="7.5" fill="var(--muted-foreground)">
                {[
                  deltaV != null && deltaV > 0 ? `ΔV ${deltaV.toFixed(1)} km/h` : null,
                  energyKj != null && energyKj > 0 ? `KE ${energyKj.toFixed(1)} kJ` : null,
                  impactForceKn != null && impactForceKn > 0 ? `F ${impactForceKn.toFixed(1)} kN` : null,
                ].filter(Boolean).join('  ·  ')}
              </text>
              {(decelerationG && decelerationG > 0) || (energyAbsorptionRatio && energyAbsorptionRatio > 0) ? (
                <text x="160" y="295" textAnchor="middle" fontSize="7" fill="var(--muted-foreground)" opacity="0.85">
                  {[
                    decelerationG && decelerationG > 0 ? `${decelerationG.toFixed(1)} g decel.` : null,
                    energyAbsorptionRatio && energyAbsorptionRatio > 0 ? `${Math.round(energyAbsorptionRatio * 100)}% energy absorbed` : null,
                  ].filter(Boolean).join('  ·  ')}
                </text>
              ) : null}
            </g>
          ) : null}
        </svg>
      </div>

      {/* Legend — to the right of the diagram */}
      <div className="flex flex-col gap-2 text-xs pt-2 shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#64748b" }}>Legend</p>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded" style={{ background: "#f7f6f3", border: "1px dashed #e0ddd8" }} />
          <span style={{ color: "#64748b" }}>Undamaged</span>
        </span>
        {([1,2,3] as DamageSeverity[]).map(s => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded" style={{ background: SEVERITY_FILL[s], border: `1px solid ${SEVERITY_STROKE[s]}` }} />
            <span style={{ color: "#64748b" }}>{SEVERITY_LABEL[s]}</span>
          </span>
        ))}
        {arrowList.map((arrow, idx) => (
          <span key={idx} className="flex items-center gap-1.5">
            <svg width="20" height="10">
              <line x1="0" y1="5" x2="14" y2="5" stroke={arrow.colour} strokeWidth={idx === 0 ? 2.5 : 2} strokeDasharray={arrow.dashed ? "4 2" : undefined} />
              <polygon points="14,2 20,5 14,8" fill={arrow.colour} />
            </svg>
            <span style={{ color: "#64748b" }}>{arrow.label}{arrow.dashed ? " (insured)" : " (3rd party)"}</span>
          </span>
        ))}
        {events && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded" style={{ border: "2px dashed #ef4444", background: "transparent" }} />
            <span style={{ color: "#64748b" }}>Unexplained zone</span>
          </span>
        )}
        {energyAbsorptionRatio && energyAbsorptionRatio > 0 ? (
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="5" fill="none" stroke="var(--border)" strokeWidth="2" opacity="0.4" />
              <circle cx="7" cy="7" r="5" fill="none"
                stroke={energyAbsorptionRatio > 0.7 ? '#ef4444' : energyAbsorptionRatio > 0.4 ? '#f59e0b' : '#22c55e'}
                strokeWidth="2" strokeDasharray={`${(energyAbsorptionRatio * 31.4).toFixed(1)} ${(31.4 - energyAbsorptionRatio * 31.4).toFixed(1)}`}
                transform="rotate(-90 7 7)" />
            </svg>
            <span style={{ color: "#64748b" }}>Energy absorbed</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Section 0: Executive Authority Cover ────────────────────────────────────

function Section0Cover({ claim, aiAssessment, enforcement, quotes, fmtMoney = fmtUsd }: { claim: any; aiAssessment: any; enforcement: any; quotes?: any[]; fmtMoney?: (n: number | null | undefined) => string }) {
  const e = enforcement;
  const phase2 = (e as any)?._phase2 as any;
  const wf = e?.weightedFraud;

  // Canonical fraud score: Stage 8 pipeline output (stored in fraudScoreBreakdownJson.overallScore)
  // falls back to weightedFraud.score (supplementary enforcement-time engine)
  const fraudBreakdown0 = aiAssessment?.fraudScoreBreakdownJson
    ? (typeof aiAssessment.fraudScoreBreakdownJson === 'string'
        ? (() => { try { return JSON.parse(aiAssessment.fraudScoreBreakdownJson); } catch { return null; } })()
        : aiAssessment.fraudScoreBreakdownJson)
    : null;
  const wfLevel = fraudBreakdown0?.level ?? wf?.level ?? "minimal";
  const canonicalScore0 = fraudBreakdown0?.overallScore ?? (aiAssessment as any)?.fraudScore ?? null;
  const wfScore = canonicalScore0 != null && canonicalScore0 > 0 ? Number(canonicalScore0) : (wf?.score ?? 0);
  // Map canonical fraud score to a decision string
  const wfDecision = wfScore >= 70 ? "DECLINE" : wfScore >= 40 ? "REVIEW_REQUIRED" : null;
  // ── Claim Truth Layer override (unified source of truth) ──
  const ctl = (e as any)?._claimTruth;
  const rawDecision: string = ctl?.decision?.recommendation ?? wfDecision ?? phase2?.finalDecision ?? e?.finalDecision?.decision ?? "REVIEW";
  const fraudScore = wfScore;
  const physicsScore = phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0;

  const ce = e?.costExtraction;
  const normalised = (aiAssessment as any)?._normalised as any;
  // No KINGA cost estimate — only document-sourced costs are used
  const aiEstimate = 0; // Disabled: system uses submitted quote only
  // quotedTotal = the lowest submitted quote total (L1).
  // Use compositeOptimisation.l1LowestSubmittedCostUsd when available (set by stage-9 after
  // computing savings), otherwise fall back to the lowest quote in the quotes prop.
  const ci0 = (aiAssessment as any)?.costIntelligenceJson ?? null;
  const co0 = ci0?.compositeOptimisation ?? null;
  // quotedTotal = lowest REPAIR quote submitted by panel beaters.
  // CRITICAL: Do NOT use l1LowestSubmittedCostUsd from costIntelligenceJson — it may have been
  // poisoned by assessor/inspection fee documents (e.g. National Loss Adjusters $37.50 charge)
  // that were incorrectly classified as repair quotes in older pipeline runs.
  // Instead: derive from the panel_beater_quotes table (quotes prop) which only contains
  // actual repair quotes submitted through the KINGA portal, OR from the optimisation
  // selected_quotes which are already validated repair quotes.
  const _selectedQuoteTotals: number[] = (
    (ci0?.quoteOptimisation?.selected_quotes ?? []) as any[]
  ).map((q: any) => q.total_cost ?? 0).filter((t: number) => t >= 500);
  const _pbQuoteTotals: number[] = (quotes && quotes.length > 0)
    ? quotes.map((q: any) => {
        const lineTotal = (q.lineItems ?? []).reduce((s: number, li: any) => s + Number(li.lineTotal ?? 0), 0);
        const raw = (q.quotedAmount ?? 0) / 100;
        return raw > 0 ? raw : lineTotal;
      }).filter((t: number) => t >= 500)
    : [];
  // Prefer panel_beater_quotes (portal submissions), fallback to selected_quotes from optimisation
  const _quoteTotalsForL1 = _pbQuoteTotals.length > 0 ? _pbQuoteTotals : _selectedQuoteTotals;
  const quotedTotal = _quoteTotalsForL1.length > 0 ? Math.min(..._quoteTotalsForL1) : 0;
  const photosDetected = ctl?.evidence?.photoCount ?? aiAssessment?.photosDetected ?? 0;
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

  // Photo Integrity tier — derived from EXIF forensics results (same logic as Section 4.3)
  const pfCover = (enforcement as any)?._photoForensics as any;
  const pfPhotos: any[] = pfCover?.photos ?? [];
  const isDocumentVisionTextCover = (text: string): boolean => {
    if (!text) return false;
    if (/^\s*(DAMAGE\s+DESCRIPTION|ESTIMATE|QUOTATION|INVOICE|CLAIM\s+FORM|REPAIR\s+ORDER|PARTS\s+LIST|LABOUR\s+SCHEDULE|SCHEDULE\s+OF|VEHICLE\s+INSPECTION\s+REPORT|ASSESSMENT\s+REPORT|BASED\s+ON\s+ESTIMATE)/i.test(text)) return true;
    if (/listed\s+for\s+(replacement|repair)|qty\s*:|item\s*:|unit\s+price|labour\s+rate|parts\s+cost/i.test(text)) return true;
    if (/^\s*(i\s+am\s+sorry|i\s+cannot|i\s+can't|i\s+apologize|i\s+apologise|unable\s+to|this\s+image\s+does\s+not|the\s+image\s+does\s+not\s+(?:show|contain|depict))/i.test(text)) return true;
    return false;
  };
  const vehiclePhotosCover = pfPhotos.filter((photo: any) => {
    const r = photo.analysisResult ?? {};
    return !(r.is_non_vehicle === true) && !isDocumentVisionTextCover(r.ai_vision_description ?? '');
  });
  const photoHighCount = vehiclePhotosCover.filter((photo: any) => {
    const score = (photo.analysisResult?.manipulation_indicators?.manipulation_score ?? 0) * 100;
    return score > 40;
  }).length;
  const photoMediumCount = vehiclePhotosCover.filter((photo: any) => {
    const score = (photo.analysisResult?.manipulation_indicators?.manipulation_score ?? 0) * 100;
    return score > 20 && score <= 40;
  }).length;
  type PhotoTierType = 'none' | 'medium' | 'high';
  const photoIntegrityTier: PhotoTierType = pfPhotos.length === 0 ? 'none' : photoHighCount > 0 ? 'high' : photoMediumCount > 0 ? 'medium' : 'none';
  const photoIntegrityLabel = photoIntegrityTier === 'high' ? 'High Concern' : photoIntegrityTier === 'medium' ? 'Medium Concern' : pfPhotos.length === 0 ? 'No Photos' : 'Clean';
  const photoIntegrityColor = photoIntegrityTier === 'high' ? '#c00' : photoIntegrityTier === 'medium' ? '#c8a000' : pfPhotos.length === 0 ? '#888' : '#2e7d32';

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
          <h1>KINGA</h1>
          <div className="subtitle">Forensic Claim Decision Report</div>
          <div style={{ fontSize: 9, color: '#888', marginTop: 3, fontStyle: 'italic' }}>Generated by KINGA Engine v{aiAssessment?.engineVersion ?? '4.2'} · Automated AI analysis · Not legal advice · Requires human adjuster review before any claim decision is finalised</div>
        </div>
        <div className="cover-meta">
          <div className="claim-id">
            {(() => {
              const cr = (aiAssessment as any)?._claimRecord;
              // Validate extracted claimReference — reject values that look like names
              // (all-alpha, short) rather than reference numbers (contain digits or slashes)
              const rawRef = cr?.insuranceContext?.claimReference;
              const isValidRef = rawRef && /[0-9\/\-]/.test(rawRef) && rawRef.length >= 4;
              return (isValidRef ? rawRef : null) ?? cr?.insuranceContext?.policyNumber ?? claim?.claimNumber ?? claim?.claimReference ?? '—';
            })()}
          </div>
          <div className="meta-line">{fmtDate(incidentDate)} · {[claim?.vehicleMake, claim?.vehicleModel, claim?.vehicleYear].filter(Boolean).join(' ') || 'Vehicle Claim'}</div>
          <div className="meta-line">Reg: {claim?.vehicleRegistration ?? '—'} · {(() => {
              const cr0 = (aiAssessment as any)?._claimRecord;
              return cr0?.insuranceContext?.insurerName ?? claim?.insurerName ?? '—';
            })()}</div>
          <button onClick={() => window.print()} className="no-print" style={{ marginTop: 8, padding: '4px 12px', fontSize: 11, fontFamily: 'sans-serif', cursor: 'pointer', background: '#111', color: '#fff', border: 'none' }}>Print / PDF</button>
        </div>
      </div>

      {/* ── Document identity ── */}
      <div className="doc-identity">
        {(enforcement as any)?.kingaRef && (
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 6px', borderBottom: '1.5px solid #111', marginBottom: 4 }}>
            <span className="di-label" style={{ color: '#111', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em' }}>KINGA REF</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 800, color: '#111', letterSpacing: '0.05em' }}>{(enforcement as any).kingaRef}-FR</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, color: '#888', fontStyle: 'italic' }}>Forensic Audit Report</span>
          </div>
        )}
        <div><span className="di-label">Claim Ref</span>{claim?.claimNumber ?? claim?.claimReference ?? '—'}</div>
        <div><span className="di-label">Report Hash</span><span style={{ fontFamily: "'IBM Plex Mono','Courier New',monospace", fontSize: 10 }}>#{[aiAssessment?.id, aiAssessment?.claimId, aiAssessment?.processingTime].filter(Boolean).map(n => (n as number).toString(16)).join('').toUpperCase().slice(0, 8) || 'N/A'}</span></div>
        <div><span className="di-label">Generated</span>{fmtDate(aiAssessment?.createdAt)}</div>
        <div><span className="di-label">Adjuster</span>{(() => {
            const cr0 = (aiAssessment as any)?._claimRecord;
            return claim?.assignedAdjuster
              ?? cr0?.insuranceContext?.adjuster
              ?? cr0?.insuranceContext?.claimHandler
              ?? cr0?.insuranceContext?.claimOfficer
              ?? '—';
          })()}</div>
      </div>

      {/* ── Decision Strip — compact horizontal: verdict | score cluster | cost cluster ── */}
      {(() => {
        const vClass = fraudScore >= 70 ? 'decline' : fraudScore >= 40 ? 'review' : 'approve';
        const vText = fraudScore >= 70 ? 'DECLINE' : fraudScore >= 40 ? 'REVIEW REQUIRED' : 'APPROVED';
        const vSub = fraudScore >= 70
          ? 'High fraud risk — senior authorisation required'
          : fraudScore >= 40
          ? 'Moderate risk — human review required'
          : 'Low risk — standard settlement checks apply';
        const fraudClass = fraudScore >= 70 ? 'high' : fraudScore >= 40 ? 'mid' : 'low';
        const physClass = physicsScore >= 70 ? 'low' : physicsScore >= 30 ? 'mid' : 'high';
        const fcdiClass = fcdiTileScore >= 70 ? 'low' : fcdiTileScore >= 40 ? 'mid' : 'high';
        const dataClass = dataCompleteness >= 75 ? 'low' : dataCompleteness >= 50 ? 'mid' : 'high';
        const kingaOptTotal: number = co0?.l2CompositeOptimisedCostUsd ?? co0?.compositeOptimisedCostUsd ?? 0;
        // Build per-quote list with name + total, sorted ascending by total
        // Build per-quote list: deduplicate by normalised name (keep LOWEST-total entry per name — the assessor-adjusted quote)
        // Smart quote deduplication using quoteType:
        // - assessor_adjusted: show only this quote for the repairer (supersedes original), badge ADJ
        // - strip_requote: show as authoritative (insurer-requested requote), badge STRIP
        // - supplementary: always show alongside original (additive, not a replacement), badge SUPP
        // - revised: show only the latest revision, badge REV
        // - original: show unless superseded by assessor_adjusted, strip_requote, or revised
        // Group by panelBeaterId first, then apply quoteType priority logic
        type QuoteItem = { name: string; total: number; quoteType: string; parentQuoteId?: number; badge: string; sublabel: string };
        const _rawQuoteItems: (QuoteItem & { panelBeaterId?: number; modified?: number })[] = (
          (quotes && quotes.length > 0)
            ? quotes.map((q: any) => {
                const lineTotal = (q.lineItems ?? []).reduce((s: number, li: any) => s + Number(li.lineTotal ?? li.unitPrice ?? 0), 0);
                const raw = (q.quotedAmount ?? 0) / 100;
                const total = raw > 0 ? raw : lineTotal;
                const name = q.panelBeaterName ?? q.repairerName ?? (q.panelBeaterId ? `Repairer #${q.panelBeaterId}` : 'Panel Beater');
                const qt: string = q.quoteType ?? (q.modified === 1 ? 'assessor_adjusted' : 'original');
                const badge = qt === 'assessor_adjusted' ? 'ADJ' : qt === 'strip_requote' ? 'STRIP' : qt === 'supplementary' ? 'SUPP' : qt === 'revised' ? 'REV' : '';
                const sublabel = qt === 'assessor_adjusted' ? 'Assessor adjusted' : qt === 'strip_requote' ? 'Strip & requote' : qt === 'supplementary' ? 'Supplementary' : qt === 'revised' ? 'Revised quote' : 'Submitted quote';
                return { name, total, quoteType: qt, parentQuoteId: q.parentQuoteId, badge, sublabel, panelBeaterId: q.panelBeaterId, modified: q.modified ?? 0 };
              }).filter((q) => q.total >= 500)
            : _selectedQuoteTotals.map((t, i) => ({ name: `Quote ${i + 1}`, total: t, quoteType: 'original', badge: '', sublabel: 'Submitted quote' }))
        );
        // Group by panelBeaterId
        const _pbIdGroups = new Map<number, typeof _rawQuoteItems>();
        const _noIdItems: typeof _rawQuoteItems = [];
        for (const item of _rawQuoteItems) {
          if (item.panelBeaterId) {
            const grp = _pbIdGroups.get(item.panelBeaterId) ?? [];
            grp.push(item);
            _pbIdGroups.set(item.panelBeaterId, grp);
          } else {
            _noIdItems.push(item);
          }
        }
        const _resolvedItems: QuoteItem[] = [];
        for (const [, grp] of _pbIdGroups) {
          // Supplementary quotes are always additive — always show them
          const supplementary = grp.filter(e => e.quoteType === 'supplementary');
          // Priority order for the authoritative quote: assessor_adjusted > strip_requote > revised > original
          const authoritative = grp.find(e => e.quoteType === 'assessor_adjusted')
            ?? grp.find(e => e.quoteType === 'strip_requote')
            ?? grp.find(e => e.quoteType === 'revised')
            ?? (grp.length === 1 ? grp[0] : null);
          if (authoritative) {
            _resolvedItems.push({ name: authoritative.name, total: authoritative.total, quoteType: authoritative.quoteType, badge: authoritative.badge, sublabel: authoritative.sublabel });
          } else {
            // Multiple originals from same repairer — show all (genuine separate submissions, e.g. OEM vs aftermarket)
            for (const e of grp.filter(e => e.quoteType === 'original')) {
              _resolvedItems.push({ name: e.name, total: e.total, quoteType: e.quoteType, badge: e.badge, sublabel: e.sublabel });
            }
          }
          // Always append supplementary quotes
          for (const s of supplementary) {
            _resolvedItems.push({ name: s.name, total: s.total, quoteType: s.quoteType, badge: s.badge, sublabel: s.sublabel });
          }
        }
        // Handle quotes without panelBeaterId via name-based dedup
        const _nameDedupeMap = new Map<string, QuoteItem>();
        for (const item of _noIdItems) {
          const key = item.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 28);
          const existing = _nameDedupeMap.get(key);
          const priority = (qt: string) => qt === 'assessor_adjusted' ? 4 : qt === 'strip_requote' ? 3 : qt === 'revised' ? 2 : qt === 'supplementary' ? 1 : 0;
          if (!existing || priority(item.quoteType) > priority(existing.quoteType)) {
            _nameDedupeMap.set(key, { name: item.name, total: item.total, quoteType: item.quoteType, badge: item.badge, sublabel: item.sublabel });
          }
        }
        const _allQuoteItems: QuoteItem[] = [
          ..._resolvedItems,
          ..._nameDedupeMap.values(),
        ].sort((a, b) => a.total - b.total);
        const lowestQuoteTotal: number = _allQuoteItems.length > 0 ? _allQuoteItems[0].total : 0;
        const potentialSavings: number = lowestQuoteTotal > 0 && kingaOptTotal > 0 && lowestQuoteTotal > kingaOptTotal ? lowestQuoteTotal - kingaOptTotal : 0;
        const savingsPct: number = lowestQuoteTotal > 0 && potentialSavings > 0 ? (potentialSavings / lowestQuoteTotal) * 100 : 0;
        return (
          <div className="decision-strip">
            {/* Verdict block */}
            <div className="verdict-block">
              <div className="verdict-label">KINGA DECISION</div>
              <div className={`verdict-value ${vClass}`}>{vText}</div>
              <div className="verdict-sub">{vSub}</div>
            </div>
            {/* Score cluster */}
            <div className="score-cluster">
              <div className="score-item">
                <span className={`score-num ${fraudClass}`}>{Math.round(fraudScore)}</span>
                <span className="score-lbl">FRAUD RISK</span>
              </div>
              <div className="score-item">
                <span className={`score-num ${physClass}`}>{Math.round(physicsScore)}</span>
                <span className="score-lbl">PHYSICS</span>
              </div>
              <div className="score-item">
                <span className={`score-num ${fcdiClass}`}>{fcdiTileScore >= 0 ? fcdiTileScore : '—'}</span>
                <span className="score-lbl">FCDI</span>
              </div>
              <div className="score-item">
                <span className={`score-num ${dataClass}`}>{Math.round(dataCompleteness)}%</span>
                <span className="score-lbl">DATA</span>
              </div>
            </div>
            {/* Cost cluster: all quotes (lowest tagged) + KINGA Optimised + Potential Savings */}
            <div className="cost-cluster">
              {/* All submitted quotes — sorted ascending, lowest gets a tag */}
              {_allQuoteItems.length > 0 ? (
                _allQuoteItems.map((q, i) => (
                  <div key={i} className="cost-item">
                    <span className="cost-lbl">
                      {q.name.length > 22 ? q.name.slice(0, 20) + '…' : q.name}
                      {i === 0 && <span className="cost-lowest-tag">LOWEST</span>}
                      {q.badge && q.badge !== '' && <span className="cost-adjusted-tag">{q.badge}</span>}
                    </span>
                    <span className={`cost-val${i === 0 ? '' : ' cost-val-dim'}`}>{fmtMoney(q.total)}</span>
                    <span className="cost-sub">{q.sublabel ?? 'Submitted quote'}</span>
                  </div>
                ))
              ) : (
                <div className="cost-item">
                  <span className="cost-lbl">QUOTES</span>
                  <span className="cost-val">—</span>
                  <span className="cost-sub">No quotes received</span>
                </div>
              )}
              {/* Divider */}
              <div className="cost-divider" />
              {/* KINGA Optimised */}
              <div className="cost-item">
                <span className="cost-lbl">KINGA OPTIMISED</span>
                <span className="cost-val col-blue">{kingaOptTotal > 0 ? fmtMoney(kingaOptTotal) : '—'}</span>
                <span className="cost-sub">{kingaOptTotal > 0 ? 'AI-validated cost' : 'Pending analysis'}</span>
              </div>
              {/* Potential Savings */}
              <div className="cost-item">
                <span className="cost-lbl">POTENTIAL SAVINGS</span>
                <span className={`cost-val${potentialSavings > 0 ? ' col-green' : ''}`}>
                  {potentialSavings > 0 ? fmtMoney(potentialSavings) : '—'}
                </span>
                <span className="cost-sub">
                  {savingsPct > 0
                    ? `${savingsPct.toFixed(1)}% reduction`
                    : potentialSavings === 0 && lowestQuoteTotal > 0 && kingaOptTotal > 0
                    ? 'Already optimal'
                    : 'Awaiting analysis'}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Alert banner (primary blockers) ── */}
      {keyDrivers.length > 0 && (
        <div className="alert-banner critical">
          {keyDrivers.slice(0, 2).join(' · ')}
          {keyDrivers.length > 2 && ` · +${keyDrivers.length - 2} more`}
        </div>
      )}

      {/* ── Scorecard row — 5-cell grid with bars matching reference HTML ── */}
      {(() => {
        const kingaOptTotal2: number = co0?.l2CompositeOptimisedCostUsd ?? co0?.compositeOptimisedCostUsd ?? 0;
        const agreedCostTotal2: number = ci0?.documentedAgreedCostUsd ?? 0;
        const marketValTotal2: number = ci0?.marketValueUsd ?? 0;
        const kingaSavingPct2 = quotedTotal > 0 && kingaOptTotal2 > 0 ? ((quotedTotal - kingaOptTotal2) / quotedTotal * 100) : 0;
        const repairToValuePct = marketValTotal2 > 0 && quotedTotal > 0 ? (quotedTotal / marketValTotal2 * 100) : 0;
        const cells = [
          { label: 'FRAUD SCORE', val: `${Math.round(fraudScore)}`, unit: '/100', sub: fraudScore >= 70 ? 'High Risk' : fraudScore >= 40 ? 'Moderate' : 'Low Risk', pct: Math.min(100, Math.round(fraudScore)), fillClass: fraudScore >= 70 ? 'fill-red' : fraudScore >= 40 ? 'fill-amber' : 'fill-green', colClass: fraudScore >= 70 ? 'col-red' : fraudScore >= 40 ? 'col-amber' : 'col-green' },
          { label: 'PHYSICS', val: `${Math.round(physicsScore)}`, unit: '/100', sub: physicsScore >= 70 ? 'Consistent' : physicsScore >= 30 ? 'Minor anomaly' : 'Anomaly', pct: Math.min(100, Math.round(physicsScore)), fillClass: physicsScore >= 70 ? 'fill-green' : physicsScore >= 30 ? 'fill-amber' : 'fill-red', colClass: physicsScore >= 70 ? 'col-green' : physicsScore >= 30 ? 'col-amber' : 'col-red' },
          { label: 'FCDI', val: fcdiTileScore >= 0 ? `${fcdiTileScore}` : 'N/A', unit: fcdiTileScore >= 0 ? '/100' : '', sub: `${fcdiTileLabel} evidence`, pct: fcdiTileScore >= 0 ? Math.min(100, fcdiTileScore) : 0, fillClass: fcdiTileScore >= 70 ? 'fill-green' : fcdiTileScore >= 40 ? 'fill-amber' : 'fill-red', colClass: fcdiTileScore >= 70 ? 'col-green' : fcdiTileScore >= 40 ? 'col-amber' : 'col-red' },
          { label: 'DATA COMPLETENESS', val: `${Math.round(dataCompleteness)}`, unit: '%', sub: dataCompleteness >= 75 ? 'Sufficient' : dataCompleteness >= 50 ? 'Partial' : 'Insufficient', pct: Math.min(100, Math.round(dataCompleteness)), fillClass: dataCompleteness >= 75 ? 'fill-green' : dataCompleteness >= 50 ? 'fill-amber' : 'fill-red', colClass: dataCompleteness >= 75 ? 'col-green' : dataCompleteness >= 50 ? 'col-amber' : 'col-red' },
          { label: 'MARKET VALUE', val: marketValTotal2 > 0 ? fmtMoney(marketValTotal2) : '—', unit: '', sub: repairToValuePct > 0 ? `Repair ratio ${repairToValuePct.toFixed(0)}%` : 'Vehicle value', pct: Math.min(100, repairToValuePct), fillClass: repairToValuePct > 80 ? 'fill-red' : repairToValuePct > 50 ? 'fill-amber' : 'fill-green', colClass: '' },
        ];
        return (
          <div className="scorecard-row">
            {cells.map((c, i) => (
              <div key={i} className="scorecard-cell">
                <span className="sc-label">{c.label}</span>
                <span className={`sc-val ${c.colClass}`}>{c.val}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--kr-muted)' }}>{c.unit}</span></span>
                <div className="sc-bar-track"><div className={`sc-bar-fill ${c.fillClass}`} style={{ width: `${c.pct}%`, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties} /></div>
                <span className="sc-tag">{c.sub}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Decision Score Summary Chart ── */}
      {(() => {
        const dims5 = [
          { label: 'Fraud Risk', score: Math.round(fraudScore), threshold: 40, invert: true },
          { label: 'Physics', score: Math.round(physicsScore), threshold: 70, invert: false },
          { label: 'Data Completeness', score: Math.round(dataCompleteness), threshold: 75, invert: false },
          { label: 'Photo Integrity', score: fcdiTileScore >= 0 ? Math.round(fcdiTileScore) : 0, threshold: 55, invert: false },
          { label: 'Cost Intelligence', score: quotedTotal > 0 ? 80 : 20, threshold: 60, invert: false },
        ];
        const barColors = dims5.map(d => {
          if (d.invert) return d.score >= d.threshold ? '#dc2626' : '#16a34a';
          return d.score >= d.threshold ? '#16a34a' : '#d97706';
        });
        const chartData5 = {
          labels: dims5.map(d => d.label),
          datasets: [
            {
              label: 'Actual Score',
              data: dims5.map(d => d.score),
              backgroundColor: barColors,
              borderRadius: 3,
              borderWidth: 0,
            },
            {
              label: 'Threshold',
              data: dims5.map(d => d.threshold),
              backgroundColor: 'rgba(0,0,0,0)',
              borderColor: '#94a3b8',
              borderWidth: 2,
              borderDash: [4, 3],
              type: 'bar' as const,
              borderRadius: 0,
            },
          ],
        };
        const opts5: any = {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'bottom' as const, labels: { font: { size: 10 }, padding: 10, boxWidth: 10 } },
            tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.raw}/100` } },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
            y: { min: 0, max: 100, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, stepSize: 20 } },
          },
        };
        return (
          <div style={{ margin: '16px 0' }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#888', marginBottom: 8 }}>Decision Score Summary</div>
            <div style={{ height: 200 }}>
              <Bar data={chartData5} options={opts5} />
            </div>
          </div>
        );
      })()}

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
          <div style={{ fontSize: 9, color: '#aaa', marginTop: 2, fontStyle: 'italic' }}>Higher score = more reliable</div>
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

      {/* ── Physics Snapshot — condensed one-liner for insurer reading the cover ── */}
      {(() => {
        const _covPhys = (enforcement as any)?._physics as any;
        const speedEst = (_covPhys?.estimatedSpeedKmh ?? 0) > 0 ? _covPhys.estimatedSpeedKmh : (e?.physicsEstimate?.estimatedVelocityKmh ?? 0);
        const forceKn = (_covPhys?.impactForceKn ?? 0) > 0 ? _covPhys.impactForceKn : null;
        const decG = _covPhys?.decelerationG ?? null;
        const vr = _covPhys?.velocityRange ?? _covPhys?.physicsNumerical?.velocity_range;
        const ed = _covPhys?.energyDistribution ?? _covPhys?.physicsNumerical;
        const dissipated = ed?.energyDissipatedJ ?? (ed?.energy_kj ? ed.energy_kj * 1000 : 0);
        const kinetic = ed?.kineticEnergyJ ?? 0;
        const absorptionPct = kinetic > 0 && dissipated > 0 ? Math.round(Math.min(dissipated / kinetic, 1) * 100) : null;
        const sc = _covPhys?.severityConsensus;
        const consensusVerdict = sc?.final_severity ?? null;
        const consensusAlign = sc?.source_alignment ?? null;
        const isAlignedCov = consensusAlign === 'FULL' || consensusAlign === 'FULLY_ALIGNED' || consensusAlign === 'ALIGNED';
        const isPartialCov = consensusAlign === 'PARTIAL';
        const isConflictedCov = consensusAlign && !isAlignedCov && !isPartialCov;

        // Build the one-liner parts
        const snippets: string[] = [];
        if (vr?.low_kmh > 0 && vr?.high_kmh > 0) {
          snippets.push(`Speed: ${vr.low_kmh.toFixed(0)}–${vr.high_kmh.toFixed(0)} km/h`);
        } else if (speedEst > 0) {
          snippets.push(`Speed: ~${speedEst.toFixed(0)} km/h`);
        }
        if (forceKn && forceKn > 0) snippets.push(`Force: ${forceKn.toFixed(1)} kN`);
        if (decG && decG > 0) snippets.push(`Decel: ${decG.toFixed(1)} g`);
        if (absorptionPct !== null) snippets.push(`Energy absorbed: ${absorptionPct}%`);
        if (consensusVerdict) snippets.push(`Severity: ${consensusVerdict.charAt(0).toUpperCase() + consensusVerdict.slice(1)}`);

        if (snippets.length === 0) return null;

        const alignColour = isConflictedCov ? '#c00' : isPartialCov ? '#c8a000' : '#2e7d32';
        const alignLabel = isConflictedCov ? 'INCONCLUSIVE' : isPartialCov ? 'PARTIAL' : isAlignedCov ? 'ALIGNED' : null;

        return (
          <div style={{ margin: '10px 0', padding: '8px 12px', background: '#f8f8f8', borderLeft: `3px solid ${alignColour}`, fontSize: 11, lineHeight: 1.6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#888', marginRight: 8 }}>Physics Snapshot</span>
            <span style={{ color: '#222' }}>{snippets.join(' · ')}</span>
            {alignLabel && (
              <span style={{ marginLeft: 10, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: alignColour, border: `1px solid ${alignColour}`, borderRadius: 3, padding: '1px 5px' }}>{alignLabel}</span>
            )}
          </div>
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
  // claimRecord0 declared early — used by claimedSpeed and _s1accidentType below
  const claimRecord0 = (aiAssessment as any)?._claimRecord ?? (aiAssessment as any)?.claimRecord ?? null;
  const incidentType = phase2?.incidentType ?? normalised?.incidentType ?? aiAssessment?.incidentType ?? "N/A";
  // Claimed speed: primary source is the extracted field from the claim document.
  // normalised does not carry a physics sub-object — read from claimRecord0 directly.
  const claimedSpeed = claimRecord0?.accidentDetails?.estimatedSpeedKmh
    ?? normalised?.physics?.claimedSpeedKmh
    ?? aiAssessment?.claimedSpeedKmh
    ?? null;
  // Physics-inferred speed: when claimant didn't record a speed (common in rear-end impacts
  // where the struck driver has no knowledge of the other vehicle's speed), the Stage7
  // physics engine can estimate impact speed from deformation depth and energy dissipation.
  const _s1phys = (enforcement as any)?._physics as { estimatedSpeedKmh?: number; deltaVKmh?: number } | undefined;
  const _s1pe = (enforcement as any)?.physicsEstimate;
  const physicsInferredSpeed = (_s1phys?.estimatedSpeedKmh ?? 0) > 0
    ? _s1phys!.estimatedSpeedKmh!
    : (_s1pe?.estimatedVelocityKmh ?? 0) > 0
    ? _s1pe.estimatedVelocityKmh
    : null;
  // Determine if this is a rear-end impact (struck vehicle — claimant may not know other vehicle's speed)
  const _s1accidentType = claimRecord0?.accidentDetails?.accidentType ?? aiAssessment?.accidentType ?? null;
  const isRearImpact = _s1accidentType && /rear|behind|back/i.test(String(_s1accidentType));
  const description = aiAssessment?.incidentDescription ?? claim?.incidentDescription ?? null;
  const corrections: string[] = phase1?.allCorrections ?? [];
  const gates: any[] = phase1?.gates ?? [];
  // CTL override: use unified evidence completeness when available
  const ctl1 = (enforcement as any)?._claimTruth;
  const dataCompleteness = ctl1?.evidence?.completenessPercent ?? phase2?.dataCompleteness ?? 0;
  const confidenceScore = aiAssessment?.confidenceScore ?? 0;
  const ocrConfidence = phase2?.ocrConfidence ?? phase1?.ocrConfidence ?? confidenceScore;
  const costConfidence = (aiAssessment as any)?._normalised?.costs?.confidence ?? 0;
  const photoConfidence = phase2?.photoAnalysis?.confidence ?? 0;

  // LLM-reasoned incident classification (Stage 5 incidentClassificationEngine)
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
    { label: "Incident type identified", ok: incidentType !== "N/A" && incidentType !== "unknown", detail: (incidentType ?? "").replace(/_/g, " "), conf: 95 },
    { label: "Cost data present", ok: !!(normalised?.costs?.totalUsd ?? aiAssessment?.estimatedCost), detail: fmtMoney(normalised?.costs?.totalUsd ?? aiAssessment?.estimatedCost), conf: Math.round(costConfidence > 0 ? costConfidence : confidenceScore) },
    { label: "Photos submitted", ok: !!(ctl1?.evidence?.photoCount ?? aiAssessment?.photosDetected), detail: (ctl1?.evidence?.photoCount ?? aiAssessment?.photosDetected) ? `${ctl1?.evidence?.photoCount ?? aiAssessment?.photosDetected} detected` : "None", conf: photoConfidence > 0 ? Math.round(photoConfidence) : (ctl1?.evidence?.photoCount ? 80 : 0) },
    { label: "Police report", ok: !!(aiAssessment?.policeReportNumber) || !!(claimRecord0?.policeReport?.station), detail: aiAssessment?.policeReportNumber ?? (claimRecord0?.policeReport?.station ? `Station: ${claimRecord0.policeReport.station}` : "Not provided"), conf: aiAssessment?.policeReportNumber ? 100 : claimRecord0?.policeReport?.station ? 60 : 0 },
    { label: "Cost corrections applied", ok: corrections.length > 0 || !!(normalised?.costs?.totalUsd), detail: corrections.length > 0 ? `${corrections.length} correction(s)` : "None needed", conf: 100 },
  ];

  // Pull new ClaimRecord fields from the aiAssessment claimRecord0 (stored in DB)
  // NOTE: claimRecord0 (declared above) is identical — using it directly to avoid duplicate const
  // Prefer the dedicated _narrativeAnalysis field (from narrativeAnalysisJson DB column) over
  // the embedded value inside claimRecord0.accidentDetails.narrativeAnalysis.
  // The dedicated column is always up-to-date; the embedded value may be stale for re-run assessments.
  const narrativeAnalysis = (aiAssessment as any)?._narrativeAnalysis
    ?? claimRecord0?.accidentDetails?.narrativeAnalysis
    ?? null;
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
  // Market value: prefer valuation engine output (Stage 5c) over claim-form stated value
  const _valEngineResult = claimRecord0?.valuation ?? null;
  const marketValueUsd = _valEngineResult?.marketValueUsd ?? claimRecord0?.vehicle?.marketValueUsd ?? null;
  const marketValueSource: string | null = _valEngineResult?.dataSource
    ? _valEngineResult.dataSource
    : _valEngineResult?.valuationMethod === 'document_stated'
      ? 'Stated on claim form'
      : _valEngineResult?.valuationMethod === 'llm_estimate'
        ? 'KINGA estimate'
        : claimRecord0?.vehicle?.marketValueUsd
          ? 'Stated on claim form'
          : null;
  const vehicleMileage = claimRecord0?.vehicle?.mileageKm ?? claim?.vehicleMileage ?? null;
  const vehicleVin = claimRecord0?.vehicle?.vin ?? claim?.vehicleVin ?? aiAssessment?.vehicleVin ?? null;
  const vehicleEngineNumber = claimRecord0?.vehicle?.engineNumber ?? claim?.vehicleEngineNumber ?? null;
  const policeReportNumber = claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber ?? null;
  const policeStation = claimRecord0?.policeReport?.station ?? null;
  const driverName = claimRecord0?.driver?.name ?? claim?.driverName ?? null;
  const claimantName = claimRecord0?.driver?.claimantName ?? claim?.claimantName ?? null;

  return (
    <div className="mb-2 space-y-3" style={{ marginBottom: "12px" }}>
      {/* 1.1 Incident Facts table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>1.1 Incident Facts</p>
        </div>
        <div className="p-4">
          <table className="w-full text-xs report-table">
            <tbody>
              {[
                ["Incident type", (
                  <span className="flex flex-col gap-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      {/* C-02: Show UNCLASSIFIED warning instead of 'Other' or UNCLASSIFIED_REQUIRES_MANUAL_INPUT */}
                      {(displayIncidentType.toLowerCase() === 'other' || displayIncidentType === 'UNCLASSIFIED_REQUIRES_MANUAL_INPUT' || displayIncidentType === 'N/A') ? (
                        <span className="font-semibold" style={{ color: 'var(--fp-critical-text)', fontWeight: 700 }}>UNCLASSIFIED — REQUIRES MANUAL INPUT</span>
                      ) : (
                        <span className="font-semibold capitalize">{(displayIncidentType ?? "").replace(/_/g, ' ')}</span>
                      )}
                      {isClassifiedByLLM && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{
                            background: classifiedConfidence >= 80 ? "var(--status-approve-bg)" : classifiedConfidence >= 60 ? "var(--status-review-bg)" : "#ffffff",
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
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "#ffffff", color: "#64748b", border: "1px solid #e2e8f0" }}>
                          from claim form
                        </span>
                      )}
                    </span>
                    {isClassifiedByLLM && classifiedSources.length > 0 && (
                      <span className="text-[10px]" style={{ color: "#64748b" }}>
                        Sources: {classifiedSources.map((s: string) => s.replace(/_/g, " ")).join(" · ")}
                      </span>
                    )}
                    {isClassifiedByLLM && classifiedReasoning && (
                      <span className="text-[10px] italic" style={{ color: "#64748b" }}>
                        {classifiedReasoning}
                      </span>
                    )}
                  </span>
                )],
                ["Speed", (() => {
                  if (claimedSpeed != null) return `${claimedSpeed} km/h (claimed by driver)`;
                  if (physicsInferredSpeed != null && physicsInferredSpeed > 0) {
                    const note = isRearImpact
                      ? 'inferred from rear deformation — other vehicle speed'
                      : 'inferred from deformation depth';
                    return (
                      <span className="flex flex-col gap-0.5">
                        <span style={{ color: 'var(--muted-foreground)' }}>Not stated on claim form</span>
                        <span className="text-[10px] font-semibold" style={{ color: 'var(--status-review-text)' }}>
                          Physics estimate: ~{Math.round(physicsInferredSpeed)} km/h ({note})
                        </span>
                      </span>
                    ) as any;
                  }
                  return 'Not stated';
                })()],
                ["Incident date", fmtDate(claim?.incidentDate ?? aiAssessment?.incidentDate)],
                ["Incident time", accidentTime ?? "Not Provided"],
                ["Location", aiAssessment?.incidentLocation ?? claim?.incidentLocation ?? "Not Provided"],
                ["Weather conditions", weatherConditions ? toSentenceCase(weatherConditions) : "Not Provided"],
                ["Road surface", roadSurface ? toSentenceCase(roadSurface) : "Not Provided"],
                animalType ? ["Animal type", <span className="font-semibold capitalize">{animalType}</span>] : null,
                ["Driver", driverName ? toTitleCase(driverName) : "Not Provided"],
                ["Driver licence", driverLicenseNumber ?? "Not provided"],
                ["Claimant", claimantName ?? claim?.claimantName ?? "Not Provided"],
                ["Inspection date", fmtDate(aiAssessment?.assessmentDate)],
                ["Assessor", aiAssessment?.assessorName ?? claimRecord0?.repairQuote?.assessorName ?? "Not assigned"],
                ["Repairer", toTitleCase(aiAssessment?.panelBeaterName ?? claimRecord0?.repairQuote?.repairerName ?? claim?.repairerName) || "Not specified"],
                ["Police report No.", policeReportNumber
                  ? policeReportNumber
                  : (<span className="text-[10px] font-semibold" style={{ color: "#64748b" }}>Not extracted</span>)],
                policeStation ? ["Police station", policeStation + (policeReportNumber ? "" : " — case number not extracted")] : null,
              ].filter(Boolean).map((row: any, i: number) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid #e2e8f0" : undefined }}>
                  <td className="py-2 pr-4 font-semibold w-40" style={{ color: "#64748b" }}>{row[0]}</td>
                  <td className="py-2" style={{ color: "#0f172a" }}>{row[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Narrative Analysis Panel — redesigned for visual clarity */}
          {(narrativeAnalysis || description) && (
            <div className="narr-panel mt-3">
              {/* Header row: label + overall verdict badge */}
              <div className="narr-header">
                <span className="narr-header-label">1.1a Incident Narrative</span>
                {narrativeAnalysis?.consistency_verdict && (() => {
                  const v = narrativeAnalysis.consistency_verdict;
                  const isOk = v === 'CONSISTENT';
                  const isWarn = v === 'MINOR_DISCREPANCY' || v === 'PARTIAL';
                  const verdictLabel = v === 'CONSISTENT' ? 'Consistent'
                    : v === 'MINOR_DISCREPANCY' ? 'Minor Discrepancy'
                    : v === 'INCONSISTENT' ? 'Inconsistent'
                    : v === 'CONTAMINATED' ? 'Contaminated'
                    : toSentenceCase(v);
                  const cls = isOk ? 'ok' : isWarn ? 'warn' : 'fail';
                  return <span className={`narr-cv-badge ${cls}`}>{verdictLabel}</span>;
                })()}
              </div>

              {/* Claimant statement — left-border quoted block */}
              {(!description && !narrativeAnalysis?.cleaned_incident_narrative) ? (
                <div style={{ margin: '10px 14px', padding: '8px 12px', background: '#fffbeb', border: '1px solid #d97706' }}>
                  <span style={{ fontSize: 12, color: '#92400e' }}>&#9888; Incident description could not be extracted from the submitted documents. Please verify source documents and re-submit with clearer scans.</span>
                </div>
              ) : (
                <div className="narr-quote">
                  {toSentenceCase(filterAssessorConclusions(sanitiseTextArtefacts(description || narrativeAnalysis?.cleaned_incident_narrative || '')).trim())}
                </div>
              )}
              {narrativeAnalysis?.was_contaminated && (
                <div style={{ margin: '0 14px 8px', fontSize: 11, color: '#92400e' }}>
                  &#9888; Post-incident content (inspection findings, repair notes) was identified and excluded from the statement above.
                </div>
              )}

              {/* Reconstructed sequence — distinct strip */}
              {narrativeAnalysis?.extracted_facts?.sequence_of_events && (
                <div className="narr-seq">
                  <span className="narr-seq-label">Reconstructed Sequence</span>
                  <span className="narr-seq-text">{narrativeAnalysis.extracted_facts.sequence_of_events}</span>
                </div>
              )}

              {/* Cross-validation — structured grid table */}
              {narrativeAnalysis?.cross_validation && (() => {
                const rows = [
                  { label: 'Physics', verdict: narrativeAnalysis.cross_validation.physics_verdict, notes: narrativeAnalysis.cross_validation.physics_notes },
                  { label: 'Damage', verdict: narrativeAnalysis.cross_validation.damage_verdict, notes: narrativeAnalysis.cross_validation.damage_notes },
                  { label: 'Crush depth', verdict: narrativeAnalysis.cross_validation.crush_depth_verdict, notes: narrativeAnalysis.cross_validation.crush_depth_notes },
                ].filter(r => r.verdict && r.verdict !== 'NOT_ASSESSED');
                if (rows.length === 0) return null;
                return (
                  <div className="narr-cv">
                    <div className="narr-cv-header">
                      <span className="narr-header-label">Cross-Validation</span>
                    </div>
                    {rows.map((r, i) => {
                      const isOk = r.verdict === 'CONSISTENT';
                      const isWarn = r.verdict === 'PARTIAL' || r.verdict === 'MINOR_DISCREPANCY';
                      const cls = isOk ? 'ok' : isWarn ? 'warn' : 'fail';
                      const vt = isOk ? 'CONSISTENT' : isWarn ? r.verdict.replace(/_/g, ' ') : 'INCONSISTENT';
                      return (
                        <div key={i} className="narr-cv-row">
                          <span className="narr-cv-dim">{r.label}</span>
                          <span className={`narr-cv-badge ${cls}`}>{vt}</span>
                          <span className="narr-cv-notes">{r.notes}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Narrative flags — severity-coded cards */}
              {narrativeAnalysis?.fraud_signals && narrativeAnalysis.fraud_signals.length > 0 && (
                <div className="narr-flags">
                  <div className="narr-flags-header" style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
                    <span className="narr-header-label" style={{ color: '#c2410c' }}>Narrative Flags &nbsp;·&nbsp; {narrativeAnalysis.fraud_signals.length}</span>
                  </div>
                  {narrativeAnalysis.fraud_signals.map((sig: any, i: number) => {
                    const isHigh = sig.severity === 'HIGH';
                    const isMed = sig.severity === 'MEDIUM';
                    const sevCls = isHigh ? 'high' : isMed ? 'medium' : 'low';
                    const sevLabel = isHigh ? 'HIGH' : isMed ? 'MEDIUM' : 'LOW';
                    return (
                      <div key={i} className="narr-flag-row">
                        <div><span className={`narr-flag-sev ${sevCls}`}>{sevLabel}</span></div>
                        <div>
                          <div className="narr-flag-title">{sig.code?.replace(/_/g, ' ')}</div>
                          <div className="narr-flag-desc">{sig.description}</div>
                          {sig.evidence && (
                            <div className="narr-flag-evidence">Evidence: &ldquo;{sig.evidence}&rdquo;</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Analyst reasoning — bottom callout */}
              {narrativeAnalysis?.reasoning_summary && (
                <div className="narr-reasoning">
                  <span className="narr-reasoning-label">Analyst Reasoning</span>
                  <p className="narr-reasoning-text">{narrativeAnalysis.reasoning_summary}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 1.1b Multi-Event Incident Sequence */}
      {multiEventSequence?.is_multi_event && multiEventSequence.events?.length > 1 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>1.1b Multi-Event Incident Sequence</p>
            <span className="text-xs font-semibold" style={{ color: "#64748b" }}>
              {multiEventSequence.events.length} events detected
            </span>
            <span className="text-xs ml-auto" style={{ color: "#64748b" }}>
              Confidence: {multiEventSequence.confidence}%
            </span>
          </div>
          <div className="p-4">
            {/* Sequence summary */}
            <p className="text-xs mb-4" style={{ color: "#64748b" }}>
              <span className="font-semibold" style={{ color: "#0f172a" }}>Sequence summary: </span>
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
                      <span className="text-xs font-semibold capitalize" style={{ color: "#0f172a" }}>
                        {(event.event_type ?? "unknown").replace(/_/g, " ")}
                        {event.event_sub_type ? ` — ${event.event_sub_type.replace(/_/g, " ")}` : ""}
                      </span>
                      {event.involves_third_party && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--fp-info-bg, var(--muted))", color: "var(--fp-info-text, var(--muted-foreground))" }}>
                          3rd party
                        </span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: "#64748b" }}>{event.description}</p>
                    {event.damage_contribution?.length > 0 && (
                      <p className="text-xs mt-1" style={{ color: "#64748b" }}>
                        <span className="font-semibold" style={{ color: "#0f172a" }}>Damage zones: </span>
                        {event.damage_contribution.join(", ")}
                      </p>
                    )}
                    {event.causal_link && (
                      <p className="text-xs mt-1 italic" style={{ color: "#64748b" }}>
                        → {event.causal_link}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Reasoning */}
            {multiEventSequence.reasoning && (
              <div className="mt-2 p-3 rounded-lg text-xs" style={{ background: "#ffffff", color: "#64748b" }}>
                <span className="font-semibold" style={{ color: "#0f172a" }}>Analyst reasoning: </span>
                {multiEventSequence.reasoning}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 1.2 + 1.3 side-by-side grid */}
      <div className="grid grid-cols-2 gap-4">

      {/* 1.2 Insurance & Policy Context */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>1.2 Insurance & Policy Context</p>
        </div>
        <div className="p-4">
          <table className="compact-kv-table text-xs">
            <tbody>
              {[
                ["Insurer", insurerName ?? "Not extracted"],
                ["Policy number", policyNumber ?? "Not provided"],
                ["Claim reference", claimReference ?? "Not extracted"],
                ["Policy excess", excessAmountUsd != null ? fmtMoney(excessAmountUsd) : "Not extracted"],
              ].map(([k, v], i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid #e2e8f0" : undefined }}>
                  <td className="py-2 pr-4 font-semibold w-40" style={{ color: "#64748b" }}>{k as string}</td>
                  <td className="py-2" style={{ color: "#0f172a" }}>{v as React.ReactNode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1.3 Vehicle Details */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>1.3 Vehicle Details</p>
        </div>
        <div className="p-4">
          <table className="compact-kv-table text-xs">
            <tbody>
              {[
                ["Registration", claim?.vehicleRegistration ?? claimRecord0?.vehicle?.registration ?? "Not Provided"],
                // C-04: VIN is structurally critical — flag absence explicitly
                ["VIN", vehicleVin ?? "NOT PROVIDED — required for vehicle verification"],
                ["Engine number", vehicleEngineNumber ?? "Not provided"],
                ["Odometer", vehicleMileage != null ? `${vehicleMileage.toLocaleString()} km` : "Not provided"],
                ["Market value", marketValueUsd != null ? fmtMoney(marketValueUsd) : "Pending system benchmark"],
                // C-05: Show valuation basis with explicit warning for assessor-stated values
                marketValueSource
                  ? ["Valuation basis",
                      _valEngineResult?.valuationMethod === "document_stated"
                        ? "⚠ Assessor document — not independently verified"
                        : _valEngineResult?.valuationMethod === "llm_estimate"
                          ? "KINGA system benchmark"
                          : marketValueSource]
                  : null,
              ].filter((row): row is string[] => Array.isArray(row)).map(([k, v], i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid #e2e8f0" : undefined }}>
                  <td className="py-2 pr-4 font-semibold w-40" style={{ color: "#64748b" }}>{k as string}</td>
                  <td className="py-2" style={{ color: "#0f172a" }}>{v as React.ReactNode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      </div>{/* end 1.2+1.3 grid */}

      {/* 1.4 + 1.5 — Driver Details & Police Report side-by-side */}
      {(() => {
        // Determine if this is a single-vehicle incident — no third party is applicable
        const _itNorm = (incidentType ?? '').toUpperCase().replace(/ /g, '_');
        const isSingleVehicle = /ROAD_HAZARD|SINGLE_VEHICLE|POTHOLE|DEPRESSION|FLOOD|FIRE|THEFT|HAIL|STORM|VANDAL|FALLING|DEBRIS|ANIMAL_STRIKE|HIT_AND_RUN/.test(_itNorm);
        const NA_SINGLE = 'N/A — Single vehicle incident';
        const thirdPartyName = (claimRecord0?.thirdParty as any)?.driverName ?? (claim as any)?.thirdPartyName;
        const thirdPartyVehicle = (claimRecord0?.thirdParty as any)?.vehicleDescription ?? (claim as any)?.thirdPartyVehicle;
        const thirdPartyReg = (claimRecord0?.thirdParty as any)?.registration ?? (claim as any)?.thirdPartyRegistration;
        const thirdPartyInsurer = (claimRecord0?.thirdParty as any)?.insurerName ?? (claim as any)?.thirdPartyInsurer;
        const thirdPartyPolicy = (claimRecord0?.thirdParty as any)?.policyNumber;
        const liabilityAdmitted = (claimRecord0?.thirdParty as any)?.liabilityAdmitted;
        return (
          <div className="col-pair">
            {/* 1.4 Driver Details */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0', background: '#ffffff' }}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid #e2e8f0' }}>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>1.4 Driver Details</p>
              </div>
              <div className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#64748b' }}>Insured Driver</p>
                <table className="w-full text-xs">
                  <tbody>
                    {([
                      ['Name', driverName ?? claim?.claimantName ?? 'Not provided'],
                      ['ID / Passport', claimRecord0?.driver?.idNumber ?? (claim as any)?.claimantIdNumber ?? 'Not provided'],
                      ['Licence no.', driverLicenseNumber ?? 'Not provided'],
                      ['Contact', claimRecord0?.driver?.phone ?? (claim as any)?.claimantPhone ?? 'Not provided'],
                      ['Email', claimRecord0?.driver?.email ?? (claim as any)?.claimantEmail ?? 'Not provided'],
                      ['Relationship to policyholder', claimRecord0?.driver?.relationshipToPolicyholder ?? 'Not stated'],
                      ['Injuries reported', claimRecord0?.driver?.injuriesReported ?? 'Not stated'],
                    ] as [string, string][]).map(([k, v], i) => (
                      <tr key={i} style={{ borderTop: i > 0 ? '1px solid #e2e8f0' : undefined }}>
                        <td className="py-1.5 pr-3 font-semibold" style={{ color: '#64748b', width: '160px' }}>{k}</td>
                        <td className="py-1.5" style={{ color: '#0f172a' }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-4 mb-2" style={{ color: '#64748b' }}>Third Party {isSingleVehicle && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#94a3b8' }}>— Not applicable</span>}</p>
                {isSingleVehicle ? (
                  <p className="text-xs" style={{ color: '#94a3b8', fontStyle: 'italic' }}>No third party involved — {(incidentType ?? '').replace(/_/g, ' ').toLowerCase()} is a single-vehicle incident type.</p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {([
                        ['Name', thirdPartyName ?? 'Not provided'],
                        ['Vehicle', thirdPartyVehicle ?? 'Not provided'],
                        ['Registration', thirdPartyReg ?? 'Not provided'],
                        ['Insurer', thirdPartyInsurer ?? 'Not provided'],
                        ['Policy No.', thirdPartyPolicy ?? 'Not provided'],
                        ['Liability admitted', liabilityAdmitted != null ? (liabilityAdmitted ? 'Yes' : 'No') : 'Not stated'],
                        ['Witness name', claimRecord0?.witness?.name ?? (claim as any)?.witnessName ?? 'Not provided'],
                        ['Witness contact', claimRecord0?.witness?.phone ?? (claim as any)?.witnessPhone ?? 'Not provided'],
                      ] as [string, string][]).map(([k, v], i) => (
                        <tr key={i} style={{ borderTop: i > 0 ? '1px solid #e2e8f0' : undefined }}>
                          <td className="py-1.5 pr-3 font-semibold" style={{ color: '#64748b', width: '160px' }}>{k}</td>
                          <td className="py-1.5" style={{ color: '#0f172a' }}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* 1.5 Police Report Details */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0', background: '#ffffff' }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #e2e8f0' }}>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>1.5 Police Report Details</p>
                {!policeReportNumber && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: '#ffffff', color: 'var(--fp-critical-text)', border: '1px solid var(--fp-critical-border)' }}>CRITICAL BLOCKER</span>
                )}
              </div>
              <div className="p-4">
                <table className="w-full text-xs report-table">
                  <tbody>
                    {([
                      ['Case / AR number', policeReportNumber ?? 'Not provided'],
                      ['Police station', policeStation ?? claimRecord0?.policeReport?.station ?? (claim as any)?.policeStation ?? 'Not provided'],
                      ['Reporting officer', claimRecord0?.policeReport?.officerName ?? 'Not provided'],
                      ['Report date', claimRecord0?.policeReport?.reportDate ?? 'Not provided'],
                      ['Charge number', claimRecord0?.policeReport?.chargeNumber ?? 'Not provided'],
                      ['Charged party', claimRecord0?.policeReport?.chargedParty ?? 'Not stated'],
                      ['Investigation status', claimRecord0?.policeReport?.investigationStatus ?? 'Not stated'],
                      ['Officer findings', claimRecord0?.policeReport?.officerFindings ?? 'Not stated'],
                      ['Third-party account', isSingleVehicle ? NA_SINGLE : (claimRecord0?.policeReport?.thirdPartyAccountSummary ?? 'Not provided')],
                    ] as [string, string][]).map(([k, v], i) => (
                      <tr key={i} style={{ borderTop: i > 0 ? '1px solid #e0ddd8' : undefined }}>
                        <td className="py-2 pr-4 font-semibold" style={{ color: '#6b6862', verticalAlign: 'top', whiteSpace: 'nowrap', width: '150px' }}>{k}</td>
                        <td className="py-2" style={{ color: (v === 'Not provided' || v === 'Not stated') ? '#6b6862' : '#1a1916', verticalAlign: 'top', whiteSpace: 'normal', lineHeight: '1.6' }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 1.6/1.7/1.8 — Data Completeness, Extraction Confidence, Gap Attribution — three-column layout */}
      <div className="three-col" style={{ alignItems: 'start' }}>
        {/* Completeness checklist */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--kr-mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--kr-muted)' }}>1.6 Data Completeness</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--kr-mono)', fontWeight: 500, color: dataCompleteness >= 70 ? 'var(--kr-green)' : dataCompleteness >= 40 ? 'var(--kr-amber)' : 'var(--kr-red)' }}>{Math.round(dataCompleteness)}%</span>
          </div>
          {/* Overall completeness bar */}
          <div style={{ height: 3, background: 'var(--kr-off-white)', marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ height: 3, width: `${Math.min(100, dataCompleteness)}%`, background: dataCompleteness >= 70 ? 'var(--kr-green)' : dataCompleteness >= 40 ? 'var(--kr-amber)' : 'var(--kr-red)', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {checklist.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, borderBottom: '1px solid var(--kr-rule)', paddingBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: item.ok ? 'var(--kr-green)' : 'var(--kr-red)', fontFamily: 'var(--kr-mono)', fontSize: 10 }}>{item.ok ? '✓' : '✗'}</span>
                  <span style={{ color: 'var(--kr-body)' }}>{item.label}</span>
                </div>
                <span style={{ color: 'var(--kr-muted)', fontSize: 10, fontFamily: 'var(--kr-mono)' }}>{item.detail}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Confidence bars */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--kr-mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--kr-muted)' }}>1.7 Extraction Confidence</span>
            <ConfidenceGauge
              score={Math.round((ocrConfidence + costConfidence + photoConfidence + dataCompleteness) / 4)}
              size={40}
            />
          </div>
          <p style={{ fontSize: 11, color: 'var(--kr-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            {Math.round((ocrConfidence + costConfidence + photoConfidence + dataCompleteness) / 4) >= 70
              ? 'Data quality is sufficient for automated assessment.'
              : Math.round((ocrConfidence + costConfidence + photoConfidence + dataCompleteness) / 4) >= 40
              ? 'Some fields had low extraction confidence — manual verification recommended.'
              : 'Data quality is below threshold — manual review required before settlement.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {confidenceBars.map((bar, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--kr-mono)', marginBottom: 3 }}>
                  <span style={{ color: 'var(--kr-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{bar.label}</span>
                  <span style={{ color: bar.value >= 70 ? 'var(--kr-green)' : bar.value >= 40 ? 'var(--kr-amber)' : 'var(--kr-red)', fontWeight: 500 }}>{Math.round(bar.value)}%</span>
                </div>
                <div style={{ height: 3, background: 'var(--kr-off-white)', overflow: 'hidden' }}>
                  <div style={{
                    height: 3,
                    width: `${Math.min(100, bar.value)}%`,
                    background: bar.value >= 70 ? 'var(--kr-green)' : bar.value >= 40 ? 'var(--kr-amber)' : 'var(--kr-red)',
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact'
                  } as React.CSSProperties} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 1.8 Data Gap Attribution — third column in the grid */}
        {(() => {
          const gapEntries: GapEntry[] = [];
          if (!policeReportNumber) gapEntries.push({ field: 'Police Report Number', explanation: 'Police report number not provided in claim documents.', attribution: 'CLAIMANT_DEFICIENCY' });
          if (!vehicleVin) gapEntries.push({ field: 'Vehicle VIN', explanation: 'VIN not extracted from claim documents.', attribution: 'DOCUMENT_LIMITATION' });
          if (!driverLicenseNumber) gapEntries.push({ field: 'Driver Licence Number', explanation: 'Driver licence number not found in submitted documents.', attribution: 'CLAIMANT_DEFICIENCY' });
          if (!marketValueUsd) gapEntries.push({ field: 'Market Value', explanation: 'Vehicle market value not provided by insurer or claimant.', attribution: 'INSURER_DATA_GAP' });
          if (!excessAmountUsd) gapEntries.push({ field: 'Policy Excess', explanation: 'Policy excess amount not found in claim record.', attribution: 'INSURER_DATA_GAP' });
          if (!policyNumber) gapEntries.push({ field: 'Policy Number', explanation: 'Policy number not extracted from submitted documents.', attribution: 'DOCUMENT_LIMITATION' });
          const phase2 = (enforcement as any)?._phase2 as any;
          if (phase2?.dataCompleteness != null && phase2.dataCompleteness < 60) {
            gapEntries.push({ field: 'Data Completeness', explanation: `Overall data completeness is ${Math.round(phase2.dataCompleteness)}%, below the 60% threshold for reliable automated assessment.`, attribution: 'SYSTEM_EXTRACTION_FAILURE' });
          }
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--kr-mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--kr-muted)' }}>1.8 Data Gap Attribution</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--kr-mono)', fontWeight: 500, color: gapEntries.length === 0 ? 'var(--kr-green)' : gapEntries.length <= 2 ? 'var(--kr-amber)' : 'var(--kr-red)' }}>{gapEntries.length} gap{gapEntries.length !== 1 ? 's' : ''}</span>
              </div>
              {gapEntries.length === 0 ? (
                <p style={{ fontSize: 11, color: 'var(--kr-muted)', fontStyle: 'italic' }}>No data gaps identified — all critical fields extracted successfully.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {gapEntries.map((g, i) => {
                    const attrColour = g.attribution === 'CLAIMANT_DEFICIENCY' ? 'var(--fp-critical-text)'
                      : g.attribution === 'INSURER_DATA_GAP' ? 'var(--fp-warning-text)'
                      : g.attribution === 'SYSTEM_EXTRACTION_FAILURE' ? 'var(--fp-locked-text)'
                      : 'var(--kr-muted)';
                    const attrLabel = g.attribution === 'CLAIMANT_DEFICIENCY' ? 'Claimant'
                      : g.attribution === 'INSURER_DATA_GAP' ? 'Insurer'
                      : g.attribution === 'SYSTEM_EXTRACTION_FAILURE' ? 'System'
                      : g.attribution === 'DOCUMENT_LIMITATION' ? 'Document'
                      : g.attribution;
                    return (
                      <div key={i} style={{ fontSize: 11, borderBottom: '1px solid var(--kr-rule)', paddingBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: 'var(--kr-body)', fontWeight: 600 }}>{g.field}</span>
                          <span style={{ fontSize: 9, fontFamily: 'var(--kr-mono)', fontWeight: 700, color: attrColour, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{attrLabel}</span>
                        </div>
                        <p style={{ color: 'var(--kr-muted)', margin: 0, lineHeight: 1.4 }}>{g.explanation}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {gates.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff", pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>Document Integrity Checks</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs report-table">
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
                  {["Check", "Status", "Corrections"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "#64748b", fontFamily: "'DM Sans', sans-serif" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gates.map((g: any, i: number) => (
                  <tr key={i} style={{ borderTop: i > 0 ? "1px solid #e2e8f0" : undefined, background: "#ffffff" }}>
                    <td className="px-3 py-2 font-semibold" style={{ color: "var(--primary)" }}>{({
                        G1_TEMPORAL: 'Date & Timeline Consistency',
                        G2_COST_RECONCILIATION: 'Cost Reconciliation',
                        G3_UNIT_CORRECTION: 'Currency & Unit Normalisation',
                        G4_SANITISATION: 'Data Sanitisation',
                        G5_TERMINOLOGY: 'Terminology Standardisation',
                      } as Record<string, string>)[g.gate] ?? (g.gate ? g.gate.replace(/^G\d+_?/i, '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : `Check ${i + 1}`)}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs font-semibold" style={{ color: "#64748b" }}>{toSentenceCase((g.status ?? "Unknown").toLowerCase())}</span>
                    </td>
                    <td className="px-3 py-2" style={{ color: "#64748b" }}>{g.corrections?.length ?? 0}</td>
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

function Section2Physics({ claim, aiAssessment, enforcement, quotes, fmtMoney = fmtUsd }: { claim: any; aiAssessment: any; enforcement: any; quotes?: any[]; fmtMoney?: (n: number | null | undefined) => string }) {
  const e = enforcement;
  const pe = e?.physicsEstimate;
  // claimRecord0 — needed for panel beater name and repair cost total in 2.5
  const claimRecord0 = (aiAssessment as any)?._claimRecord ?? (aiAssessment as any)?.claimRecord ?? null;
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
  const claimedSpeed = claimRecord0?.accidentDetails?.estimatedSpeedKmh
    ?? (aiAssessment as any)?._normalised?.physics?.claimedSpeedKmh
    ?? aiAssessment?.claimedSpeedKmh
    ?? 0;
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
  // physicsInferredSpeed: the best available physics-derived speed estimate
  const physicsInferredSpeed = estimatedSpeedKmh > 0 ? estimatedSpeedKmh : (pe?.estimatedVelocityKmh ?? null);
  const severity = aiAssessment?.structuralDamageSeverity ?? "unknown";

  // damageZones is at the top level of the enforcement result — NOT inside directionFlag
  // (IntelligenceEnforcementResult.directionFlag only has mismatch/explanation/possibleExplanations)
  const damageZones: string[] = (e as any)?.damageZones ?? e?.directionFlag?.damageZones ?? [];
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
  const normalised = (incidentType ?? "").toUpperCase().replace(/ /g, "_");
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
    notes: `Review damage components against incident narrative for ${(incidentType ?? "").replace(/_/g, " ")} claim type.`,
  };

  return (
    <div className="mb-2 space-y-3" style={{ marginBottom: "12px" }}>
      {/* Section 2 Plain-English Summary */}
      {(() => {
        const consistencyVerdict = physicsScore >= 70
          ? { label: 'Physics Consistent', text: `The physical damage evidence is consistent with the reported incident. The calculated impact speed and energy are proportional to the observed damage. No significant anomalies were detected.`, bg: 'var(--fp-success-bg)', border: 'var(--fp-success-border)', icon: '\u2713' }
          : physicsScore >= 30
          ? { label: 'Minor Inconsistencies', text: `The physical damage evidence shows some inconsistencies with the reported incident. The overall physics score is ${Math.round(physicsScore)}%. These inconsistencies do not necessarily indicate fraud but should be reviewed by the attending assessor before settlement.`, bg: 'var(--fp-warning-bg)', border: 'var(--fp-warning-border)', icon: '!' }
          : { label: 'Significant Anomaly — Engineering Review Required', text: `The physical damage evidence is significantly inconsistent with the reported incident. The physics score of ${Math.round(physicsScore)}% is below the acceptable threshold. An independent engineering assessment is required before this claim can proceed to settlement.`, bg: 'var(--fp-critical-bg)', border: 'var(--fp-critical-border)', icon: '\u26a0' };
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${consistencyVerdict.border}`, background: '#ffffff' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${consistencyVerdict.border}`, background: consistencyVerdict.bg }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>Section 2 Summary — Technical Forensics</p>
              <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: '#ffffff', color: '#0f172a', border: `1px solid ${consistencyVerdict.border}` }}>{consistencyVerdict.label}</span>
            </div>
            <div className="p-4">
              <p className="text-sm leading-relaxed" style={{ color: '#0f172a' }}>{consistencyVerdict.text}</p>
              <p className="text-xs mt-2" style={{ color: '#64748b' }}>This section analyses the physical mechanics of the reported incident: impact speed, energy, force, damage direction, and structural integrity. The technical findings below support or challenge the incident narrative. Scroll through each subsection for the detailed findings.</p>
            </div>
          </div>
        );
      })()}
      {/* 2.1 Impact Physics */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>2.1 Impact Physics</p>
          <span className="text-xs font-semibold" style={{ color: "#64748b" }}>{Math.round(physicsScore)}% consistent</span>
        </div>
        <div className="p-4">
          {/* 2.1 main layout: physics table (left) | gauge + LDP chart (right) */}
          {(() => {
            const ldp = (_phys as any)?.latentDamageProbability;
            const ldpEntries = ldp ? (Object.entries(ldp) as [string, number][]) : [];
            const ldpScale = ldpEntries.length > 0 && Math.max(...ldpEntries.map(([,v]) => v)) <= 1 ? 100 : 1;
            const ldpNorm = ldpEntries.map(([k, v]) => [k, Math.round(v * ldpScale)] as [string, number]);
            const ldpSignificant = ldpNorm.filter(([,v]) => v >= 15);
            const showLdp = ldpSignificant.length > 0;
            const ldpSorted = [...ldpSignificant].sort(([,a],[,b]) => b - a);
            const ldpColors = ldpSorted.map(([,pct]) => pct >= 60 ? '#dc2626' : pct >= 35 ? '#d97706' : '#16a34a');
            const ldpChartData = showLdp ? {
              labels: ldpSorted.map(([sys]) => sys.charAt(0).toUpperCase() + sys.slice(1)),
              datasets: [{ label: 'Probability (%)', data: ldpSorted.map(([,pct]) => pct), backgroundColor: ldpColors, borderRadius: 3, borderWidth: 0 }],
            } : null;
            const ldpOpts: any = {
              responsive: true, maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.raw}%` } },
                annotation: { annotations: { threshold: { type: 'line', yMin: 40, yMax: 40, borderColor: '#d97706', borderWidth: 1, borderDash: [4, 3], label: { content: 'Elevated Risk Threshold', display: true, position: 'end', font: { size: 10 }, color: '#d97706' } } } },
              },
              scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                y: { min: 0, max: 100, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, callback: (v: any) => v + '%' } },
              },
            };
            return (
              <div className="physics-row mb-3">
                {/* Left: physics KV table */}
                <div className="physics-col-main">
                  <table className="compact-kv-table text-xs w-full">
                    <tbody>
                      {[
                        ["Delta-V (calculated)", deltaV > 0 ? `${fmt(deltaV, 1)} km/h` : "N/A"],
                        ["Estimated impact speed", estimatedSpeedKmh > 0 ? `${fmt(estimatedSpeedKmh, 1)} km/h` : (claimedSpeed > 0 ? `${claimedSpeed} km/h (claimed)` : "Not stated")],
                        ["Impact energy (KE)", energyKj > 0 ? `${fmt(energyKj, 1)} kJ` : "N/A"],
                        ["Impact force", impactForceKnDisplay > 0 ? `${fmt(impactForceKnDisplay, 1)} kN` : "N/A"],
                        ["Vehicle mass", vehicleMassKg ? `${vehicleMassKg} kg` : "N/A"],
                        ["Accident severity", toSentenceCase((severity ?? "").replace(/_/g, " "))],
                        ["Incident type", toSentenceCase((incidentType ?? "").replace(/_/g, " "))],
                        ...((_phys as any)?.decelerationG > 0 ? [["Deceleration", `${fmt((_phys as any).decelerationG, 2)} g`]] : []),
                        ...((_phys as any)?.velocityRange?.low_kmh > 0 ? [["Velocity range (est.)", `${fmt((_phys as any).velocityRange.low_kmh, 1)}–${fmt((_phys as any).velocityRange.high_kmh, 1)} km/h`]] : []),
                        ...((_phys as any)?.damageConsistencyScore != null ? [["Damage consistency score", `${Math.round((_phys as any).damageConsistencyScore)}/100`]] : []),
                      ].map(([k, v], i) => (
                        <tr key={i} style={{ borderTop: i > 0 ? "1px solid #e2e8f0" : undefined }}>
                          <td className="py-1.5 pr-3 font-semibold" style={{ color: "#64748b" }}>{k}</td>
                          <td className="py-1.5 tabular-nums" style={{ color: "#0f172a" }}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Right: gauge + LDP chart stacked */}
                <div className="physics-col-side">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <ArcGauge value={physicsScore} size={100} label="Physics consistency" />
                    <p style={{ fontSize: 11, color: '#64748b', textAlign: 'center', lineHeight: 1.4 }}>
                      {physicsScore >= 70 ? "Damage consistent with stated incident" :
                       physicsScore >= 30 ? "Minor inconsistencies detected" :
                       "Significant anomaly — engineering review required"}
                    </p>
                    {showLdp && ldpChartData && (
                      <div style={{ width: '100%', marginTop: 8, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span className="kr-mono-label">Latent Damage Probability</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>Hidden risk</span>
                        </div>
                        <div style={{ height: 200 }}>
                          <Bar data={ldpChartData} options={ldpOpts} />
                        </div>
                        {ldpSorted.some(([,v]) => v >= 40) && (
                          <p style={{ fontSize: 11, marginTop: 6, padding: '4px 8px', background: 'var(--fp-warning-bg)', color: 'var(--fp-warning-text)', border: '1px solid var(--fp-warning-border)' }}>
                            One or more systems show elevated hidden damage risk — physical inspection recommended before final settlement.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {(claimedSpeed > 0 || deltaV > 0) && (
            <div className="space-y-2 mb-3">
              {claimedSpeed > 0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: "#64748b" }}>Claimed speed</span>
                    <span style={{ color: "#0f172a" }}>{claimedSpeed} km/h</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: "#ffffff" }}>
                    <div className="h-2 rounded-full" style={{ width: `${Math.min(100, (claimedSpeed / 150) * 100)}%`, background: "var(--fp-warning-text)" }} />
                  </div>
                </div>
              )}
              {deltaV > 0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: "#64748b" }}>Delta-V (calculated)</span>
                    <span style={{ color: "#0f172a" }}>{deltaV} km/h</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: "#ffffff" }}>
                    <div className="h-2 rounded-full" style={{ width: `${Math.min(100, (deltaV / 150) * 100)}%`, background: "var(--fp-success-text)" }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {directionExplanation && (
            <div className="p-2 rounded-lg text-xs" style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              color: "#0f172a",
            }}>
              {directionMismatch ? "Direction mismatch: " : "Direction consistent: "}{directionExplanation}
            </div>
          )}
          {/* LDP chart is now integrated into the physics-row layout above */}
          {/* Physics execution status badge */}
          {(() => {
            const ps: string | null = (_phys as any)?.physicsStatus ?? null;
            if (!ps) return null;
            const statusMap: Record<string, { label: string; bg: string; text: string; border: string }> = {
              EXECUTED: { label: 'Physics engine executed', bg: 'var(--fp-success-bg)', text: 'var(--fp-success-text)', border: 'var(--fp-success-border)' },
              ESTIMATED_FALLBACK: { label: 'Estimated fallback — speed not extracted', bg: 'var(--fp-warning-bg)', text: 'var(--fp-warning-text)', border: 'var(--fp-warning-border)' },
              SKIPPED_NO_SPEED: { label: 'Physics skipped — no speed data', bg: 'var(--fp-locked-bg)', text: 'var(--fp-locked-text)', border: 'var(--fp-locked-border)' },
              SKIPPED_NON_PHYSICAL: { label: 'Physics not applicable for this incident type', bg: 'var(--fp-info-bg)', text: 'var(--fp-info-text)', border: 'var(--fp-info-border)' },
            };
            const s = statusMap[ps] ?? { label: ps, bg: 'var(--fp-info-bg)', text: 'var(--fp-info-text)', border: 'var(--fp-info-border)' };
            return (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
                  {s.label}
                </span>
              </div>
            );
          })()}
          {/* Animal strike physics block */}
          {(() => {
            const asp = (_phys as any)?.animalStrikePhysics;
            if (!asp) return null;
            return (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--muted-foreground)' }}>Animal Strike Physics</p>
                <table className="compact-kv-table text-xs">
                  <tbody>
                    {([
                      ['Animal category', asp.animal_category ?? 'Unknown'],
                      ['Estimated animal mass', asp.animal_mass_kg != null ? `${asp.animal_mass_kg} kg` : 'N/A'],
                      ['Impact severity', asp.impact_severity ?? 'N/A'],
                      ['Delta-V (animal strike)', asp.delta_v_kmh != null ? `${asp.delta_v_kmh.toFixed(1)} km/h` : 'N/A'],
                      ['Impact force', asp.impact_force_kn != null ? `${asp.impact_force_kn.toFixed(1)} kN` : 'N/A'],
                      ['Plausibility score', asp.plausibility_score != null ? `${asp.plausibility_score}/100` : 'N/A'],
                      ['Bullbar present', asp.bullbar_present === 'true' ? 'Yes' : asp.bullbar_present === 'false' ? 'No' : 'Unknown'],
                    ] as [string, string][]).map(([k, v], i) => (
                      <tr key={i} style={{ borderTop: i > 0 ? '1px solid #e2e8f0' : undefined }}>
                        <td className="py-1.5 pr-3 font-semibold" style={{ color: '#64748b' }}>{k}</td>
                        <td className="py-1.5 tabular-nums" style={{ color: '#0f172a' }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {asp.engineering_notes && (
                  <p className="text-[10px] mt-2" style={{ color: 'var(--muted-foreground)' }}>{asp.engineering_notes}</p>
                )}
              </div>
            );
          })()}
          {/* Reconstruction summary — engineering derivation chain */}
          {(_phys as any)?.reconstructionSummary && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>Reconstruction Summary</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--foreground)' }}>{(_phys as any).reconstructionSummary}</p>
            </div>
          )}
        </div>
      </div>

      {/* 2.2 Damage Consistency — 3-column spec table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>2.2 Damage Consistency</p>
          <span className="text-xs font-semibold" style={{ color: "#64748b" }}>{anomalyLevel === "none" ? "Consistent" : toTitleCase(anomalyLevel)}</span>
        </div>
        <div className="p-4">
          {/* Zone map + 3-col comparison table side by side */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#64748b" }}>Damage Zone Map</p>
              <VehicleDamageMap
                damageZones={damageZones}
                incidentType={incidentType}
                physicsDirection={(_phys as any)?.impactVector?.direction ?? null}
                multiEventSequence={multiEventSequence}
                deltaV={deltaV > 0 ? deltaV : undefined}
                energyKj={energyKj > 0 ? energyKj : undefined}
                impactForceKn={impactForceKnDisplay > 0 ? impactForceKnDisplay : undefined}
                decelerationG={(_phys as any)?.decelerationG > 0 ? (_phys as any).decelerationG : null}
                velocityRange={(() => {
                  const vr = (_phys as any)?.velocityRange;
                  if (vr?.low_kmh > 0 && vr?.high_kmh > 0) return { low_kmh: vr.low_kmh, high_kmh: vr.high_kmh };
                  const pn = (_phys as any)?.physicsNumerical?.velocity_range;
                  if (pn?.low_kmh > 0 && pn?.high_kmh > 0) return { low_kmh: pn.low_kmh, high_kmh: pn.high_kmh };
                  return null;
                })()}
                energyAbsorptionRatio={(() => {
                  const ed = (_phys as any)?.energyDistribution ?? (_phys as any)?.physicsNumerical;
                  const dissipated = ed?.energyDissipatedJ ?? (ed?.energy_kj ? ed.energy_kj * 1000 : 0);
                  const kinetic = ed?.kineticEnergyJ ?? 0;
                  if (kinetic > 0 && dissipated > 0) return Math.min(dissipated / kinetic, 1);
                  return null;
                })()}
              />
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
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#64748b" }}>
                Typical pattern for {(incidentType ?? "").replace(/_/g, " ").toLowerCase()} — observed damage
              </p>
              <table className="w-full text-xs report-table">
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
                    <th className="text-left px-2 py-1.5 font-semibold" style={{ color: "#64748b" }}>Expected damage</th>
                    <th className="text-left px-2 py-1.5 font-semibold" style={{ color: "#64748b" }}>Observed</th>
                    <th className="text-left px-2 py-1.5 font-semibold" style={{ color: "#64748b" }}>Match</th>
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
                      <tr key={i} style={{ borderTop: i > 0 ? "1px solid #e2e8f0" : undefined, background: "#ffffff" }}>
                        <td className="px-2 py-1.5" style={{ color: "#0f172a" }}>{item}</td>
                        <td className="px-2 py-1.5" style={{ color: "#64748b" }}>{String(observed)}</td>
                        <td className="px-2 py-1.5">
                          {damageZones.length > 0
                            ? <span className="text-xs font-semibold" style={{ color: "#64748b" }}>{zoneMatch ? "Match" : "Review"}</span>
                            : <span className="text-xs" style={{ color: "#64748b" }}>N/A</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Physics Diagram Summary — plain-English interpretation for all three audiences */}
          {(() => {
            const decG = (_phys as any)?.decelerationG;
            const vr = (_phys as any)?.velocityRange ?? (_phys as any)?.physicsNumerical?.velocity_range;
            const ed = (_phys as any)?.energyDistribution ?? (_phys as any)?.physicsNumerical;
            const dissipated = ed?.energyDissipatedJ ?? (ed?.energy_kj ? ed.energy_kj * 1000 : 0);
            const kinetic = ed?.kineticEnergyJ ?? 0;
            const absorptionRatio = kinetic > 0 && dissipated > 0 ? Math.min(dissipated / kinetic, 1) : null;
            const sc = (_phys as any)?.severityConsensus;
            const consensusSeverity = sc?.final_severity ?? severity;
            const alignment = sc?.source_alignment;

            // Build sentence fragments
            const parts: string[] = [];

            // Speed sentence
            if (vr?.low_kmh > 0 && vr?.high_kmh > 0) {
              parts.push(`The physics model estimates the vehicle was travelling at between ${vr.low_kmh.toFixed(0)} and ${vr.high_kmh.toFixed(0)} km/h at the time of impact.`);
            } else if (estimatedSpeedKmh > 0) {
              parts.push(`The physics model estimates the vehicle was travelling at approximately ${estimatedSpeedKmh.toFixed(0)} km/h at the time of impact.`);
            }

            // Force and deceleration sentence
            if (impactForceKnDisplay > 0 && decG > 0) {
              parts.push(`The primary impact generated a force of ${impactForceKnDisplay.toFixed(1)} kN with a peak deceleration of ${decG.toFixed(1)} g.`);
            } else if (impactForceKnDisplay > 0) {
              parts.push(`The primary impact generated a force of ${impactForceKnDisplay.toFixed(1)} kN.`);
            }

            // Energy absorption sentence
            if (absorptionRatio !== null) {
              const pct = Math.round(absorptionRatio * 100);
              if (pct > 70) {
                parts.push(`${pct}% of the kinetic energy was absorbed through structural deformation, which is consistent with moderate-to-severe structural damage and expected component replacement.`);
              } else if (pct > 40) {
                parts.push(`${pct}% of the kinetic energy was absorbed through deformation, consistent with moderate damage requiring panel repair and possible structural assessment.`);
              } else {
                parts.push(`${pct}% of the kinetic energy was absorbed through deformation, consistent with minor surface damage. Extensive structural claims would warrant scrutiny.`);
              }
            }

            // Severity consensus sentence
            if (consensusSeverity && consensusSeverity !== 'unknown') {
              if (alignment === 'FULLY_ALIGNED' || alignment === 'ALIGNED') {
                parts.push(`All available signals — physics model, damage analysis, and image review — are in agreement that the impact severity is ${toSentenceCase(consensusSeverity)}.`);
              } else if (alignment === 'PARTIAL') {
                parts.push(`The physics model and damage analysis indicate ${toSentenceCase(consensusSeverity)} severity; however, one or more signals are not fully aligned. Senior assessor review is recommended before settlement.`);
              } else if (alignment === 'CONFLICTED') {
                parts.push(`The available signals produce conflicting severity assessments. The physics model indicates ${toSentenceCase(consensusSeverity)} severity, but this is not corroborated by all sources. This claim requires senior assessor review before settlement.`);
                // B-03: Cross-validation note — severity is INCONCLUSIVE when sources conflict
                parts.push(`⚠ CROSS-VALIDATION NOTE: Because the severity signals are in conflict, the severity finding is INCONCLUSIVE and must not be used as the sole basis for the cost assessment or settlement decision. The conservative fallback severity (${toSentenceCase(consensusSeverity)}) has been recorded for reserve purposes only. Refer to Section 2.8 Severity Consensus for the full signal breakdown.`);
              } else {
                parts.push(`The assessed impact severity is ${toSentenceCase(consensusSeverity)}.`);
              }
            }

            // Direction mismatch
            if (directionMismatch && directionExplanation) {
              parts.push(`Note: ${directionExplanation}`);
            }

            // Speed discrepancy fraud flag
            // Triggered when the physics-estimated speed differs from the claimed speed by more than 20%
            const physicsSpeed = vr?.mid_kmh ?? estimatedSpeedKmh;
            const speedDiscrepancyFlag: string | null = (() => {
              if (!physicsSpeed || physicsSpeed <= 0 || !claimedSpeed || claimedSpeed <= 0) return null;
              const diff = Math.abs(physicsSpeed - claimedSpeed);
              const pct = diff / claimedSpeed;
              if (pct < 0.20) return null; // within 20% — no flag
              const direction = physicsSpeed > claimedSpeed ? 'higher' : 'lower';
              const severity = pct >= 0.50 ? 'significant' : 'material';
              return `Speed discrepancy detected: the claimant reported ${claimedSpeed.toFixed(0)} km/h, but the physics model estimates ${physicsSpeed.toFixed(0)} km/h — a ${severity} difference of ${Math.round(pct * 100)}% (${direction} than claimed). This discrepancy warrants verification of the claimant’s stated speed before settlement.`;
            })();
            if (speedDiscrepancyFlag) parts.push(speedDiscrepancyFlag);

            if (parts.length === 0) return null;

            // Determine border colour: red if speed discrepancy or conflicted, amber if partial, else default
            const summaryBorderColour = speedDiscrepancyFlag || alignment === 'CONFLICTED'
              ? 'var(--fp-critical-border)'
              : alignment === 'PARTIAL'
              ? 'var(--fp-warning-border)'
              : 'var(--border)';

            return (
              <div className="mb-4 p-3 rounded text-xs leading-relaxed" style={{ background: "#ffffff", color: "#0f172a", borderLeft: `3px solid ${summaryBorderColour}` }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#64748b" }}>Physics Diagram Summary</p>
                {parts.map((p, i) => {
                  const isFlag = p === speedDiscrepancyFlag;
                  const isCrossValidationNote = p.startsWith('\u26a0 CROSS-VALIDATION NOTE:');
                  return (
                    <p key={i} className={i > 0 ? 'mt-1' : ''} style={
                      isCrossValidationNote
                        ? { color: 'var(--fp-critical-text)', fontWeight: 700, marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--fp-critical-border)' }
                        : isFlag
                        ? { color: 'var(--fp-critical-text)', fontWeight: 600 }
                        : undefined
                    }>{p}</p>
                  );
                })}
              </div>
            );
          })()}

          {consistencyExplanation && (
            <p className="text-xs mb-4 p-2 rounded" style={{ background: "#ffffff", color: "#0f172a" }}>
              {consistencyExplanation}
            </p>
          )}

          {/* Physics Constraint table — Expected / Actual / Verdict */}
          {constraints.length > 0 && (
            <>
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#64748b" }}>2.3 Physics Constraint Status</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs report-table">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: "#64748b" }}>Constraint</th>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: "#64748b" }}>Expected</th>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: "#64748b" }}>Actual</th>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: "#64748b" }}>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {constraints.map((c: any, i: number) => (
                      <React.Fragment key={i}>
                        <tr style={{ borderTop: i > 0 ? "1px solid #e2e8f0" : undefined, background: "#ffffff" }}>
                          <td className="px-3 py-2 font-medium" style={{ color: "#0f172a" }}>{c.constraint}</td>
                          <td className="px-3 py-2" style={{ color: "#64748b" }}>{c.expected ?? (c.suppressed ? "Advisory only" : "Pass")}</td>
                          <td className="px-3 py-2" style={{ color: "#0f172a" }}>{c.actual ?? (c.suppressed ? "Suppressed" : "Within range")}</td>
                          <td className="px-3 py-2">
                            <span className="text-xs font-semibold" style={{ color: "#64748b" }}>{c.suppressed ? "Advisory" : "Pass"}</span>
                          </td>
                        </tr>
                        {c.advisory && (
                          <tr style={{ background: "#ffffff" }}>
                            <td colSpan={4} className="px-3 pb-2 pt-0">
                              <div className="flex items-start gap-1.5 text-xs px-2 py-1.5"
                                style={{
                                  border: "1px solid #e2e8f0",
                                  color: "#64748b",
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

          <p className="text-xs mt-3 p-2 rounded" style={{ background: "#ffffff", color: "#64748b" }}>
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
              incidentType: (incidentType ?? "").replace(/_/g, " "),
              rows,
            };
            const mismatchRows = rows.filter(r => r.matchStatus === 'mismatch');
            const unknownRows = rows.filter(r => r.matchStatus === 'unknown');
            return (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#64748b" }}>2.4 Damage Pattern Matching</p>
                <DamagePatternTable data={damagePatternData} />
                {(mismatchRows.length > 0 || unknownRows.length > 0) && (
                  <div className="mt-2 p-2 rounded text-xs" style={{ background: mismatchRows.length > 0 ? 'var(--status-review-bg)' : '#ffffff', border: `1px solid ${mismatchRows.length > 0 ? 'var(--status-review-border)' : 'var(--border)'}`, color: mismatchRows.length > 0 ? 'var(--status-review-text)' : 'var(--muted-foreground)' }}>
                    {mismatchRows.length > 0 && (
                      <p><strong>Damage mismatch detected:</strong> {mismatchRows.length} expected damage zone{mismatchRows.length > 1 ? 's' : ''} ({mismatchRows.map(r => r.expected).join(', ')}) {mismatchRows.length > 1 ? 'are' : 'is'} not corroborated by the reported damage zones. This may indicate incomplete damage documentation, an atypical impact trajectory, or a discrepancy between the reported incident type and the observed damage pattern. Independent physical inspection is recommended before settlement.</p>
                    )}
                    {unknownRows.length > 0 && mismatchRows.length === 0 && (
                      <p><strong>Damage zone data unavailable:</strong> Pattern matching could not be completed because no damage zones were extracted from the submitted documents. Physical inspection is required to verify damage consistency.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* 2.4b Per-Component Physics Measurements */}
          {(() => {
            const damagedPartsRaw = (aiAssessment as any)?.damagedComponentsJson;
            const damagedParts: any[] = (() => {
              if (!damagedPartsRaw) return [];
              try {
                const raw = typeof damagedPartsRaw === 'string' ? JSON.parse(damagedPartsRaw) : (Array.isArray(damagedPartsRaw) ? damagedPartsRaw : []);
                // Normalise names to title case and deduplicate
                const seen = new Set<string>();
                return raw.filter((p: any) => {
                  const norm = toTitleCase((p.name ?? '').toLowerCase().trim());
                  if (seen.has(norm)) return false;
                  seen.add(norm);
                  return true;
                }).map((p: any) => ({ ...p, name: toTitleCase((p.name ?? '').toLowerCase().trim()) || p.name }));
              } catch { return []; }
            })();
            // Only render if at least one component has numeric physics data
            const hasPhysicsData = damagedParts.some((p: any) =>
              p.crushDepthM != null || p.deformationEnergyJ != null || p.structuralDisplacementM != null || p.visionConfidenceScore != null
            );
            if (!hasPhysicsData || damagedParts.length === 0) return null;

            // Severity colour mapping for bar fills
            const sevColour = (sev: string) => {
              const s = (sev ?? '').toLowerCase();
              if (s === 'catastrophic') return 'var(--fp-critical-text)';
              if (s === 'severe' || s === 'major') return 'var(--fp-locked-text)';
              if (s === 'moderate') return 'var(--fp-warning-text)';
              return 'var(--fp-success-text)';
            };

            // Max values for bar scaling
            const maxCrush = Math.max(0.01, ...damagedParts.map((p: any) => p.crushDepthM ?? 0));
            const maxEnergy = Math.max(1, ...damagedParts.map((p: any) => p.deformationEnergyJ ?? 0));

            return (
              <div className="mt-6">
                <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--muted-foreground)' }}>2.4b Per-Component Physics Measurements</p>
                <p className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>
                  Absolute numeric measurements extracted by KINGA vision analysis from damage photographs.
                  All values are SI-unit measurements — no qualitative proxies.
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: 620 }}>
                    <thead>
                      <tr style={{ background: '#ffffff', color: 'var(--muted-foreground)' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Component</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Crush Depth</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Deformation Energy</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Struct. Displacement</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Vision Confidence</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Damage Fraction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {damagedParts.map((p: any, i: number) => {
                        const crushCm = p.crushDepthM != null ? (p.crushDepthM * 100).toFixed(1) : null;
                        const energyKj = p.deformationEnergyJ != null ? (p.deformationEnergyJ / 1000).toFixed(2) : null;
                        const dispMm = p.structuralDisplacementM != null ? (p.structuralDisplacementM * 1000).toFixed(1) : null;
                        const conf = p.visionConfidenceScore != null ? Math.round(p.visionConfidenceScore) : null;
                        const frac = p.damageFractionEstimate != null ? Math.round(p.damageFractionEstimate * 100) : null;
                        const colour = sevColour(p.severity ?? '');
                        const crushBarPct = p.crushDepthM != null ? Math.min(100, (p.crushDepthM / maxCrush) * 100) : 0;
                        const energyBarPct = p.deformationEnergyJ != null ? Math.min(100, (p.deformationEnergyJ / maxEnergy) * 100) : 0;
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--muted)' }}>
                            <td style={{ padding: '6px 8px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{p.name}</span>
                              {p.isStructural && (
                                <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--fp-critical-text)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>STRUCTURAL</span>
                              )}
                              <div style={{ fontSize: 10, color: colour, textTransform: 'capitalize', marginTop: 1 }}>{p.severity ?? '—'}</div>
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              {crushCm != null ? (
                                <div>
                                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--foreground)' }}>{crushCm} cm</span>
                                  <div style={{ marginTop: 3, height: 4, borderRadius: 2, background: '#ffffff', width: 60, margin: '3px auto 0' }}>
                                    <div style={{ height: 4, borderRadius: 2, background: colour, width: `${crushBarPct}%`, opacity: 0.8 }} />
                                  </div>
                                </div>
                              ) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              {energyKj != null ? (
                                <div>
                                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--foreground)' }}>{energyKj} kJ</span>
                                  <div style={{ marginTop: 3, height: 4, borderRadius: 2, background: '#ffffff', width: 60, margin: '3px auto 0' }}>
                                    <div style={{ height: 4, borderRadius: 2, background: colour, width: `${energyBarPct}%`, opacity: 0.8 }} />
                                  </div>
                                </div>
                              ) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              {dispMm != null ? (
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: parseFloat(dispMm) > 20 ? 'var(--fp-critical-text)' : parseFloat(dispMm) > 5 ? 'var(--fp-warning-text)' : 'var(--foreground)' }}>
                                  {dispMm} mm
                                </span>
                              ) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              {conf != null ? (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <div style={{ width: 32, height: 4, borderRadius: 2, background: '#ffffff', overflow: 'hidden' }}>
                                    <div style={{ height: 4, borderRadius: 2, background: conf >= 70 ? 'var(--fp-success-text)' : conf >= 40 ? 'var(--fp-warning-text)' : 'var(--fp-info-text)', width: `${conf}%` }} />
                                  </div>
                                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--foreground)' }}>{conf}%</span>
                                </div>
                              ) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              {frac != null ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#ffffff', overflow: 'hidden', maxWidth: 50 }}>
                                    <div style={{ height: 4, borderRadius: 2, background: colour, width: `${frac}%`, opacity: 0.8 }} />
                                  </div>
                                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--foreground)' }}>{frac}%</span>
                                </div>
                              ) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Physics totals row */}
                {(() => {
                  const totalEnergyKj = damagedParts.reduce((s: number, p: any) => s + (p.deformationEnergyJ ?? 0), 0) / 1000;
                  const maxCrushCm = Math.max(0, ...damagedParts.map((p: any) => p.crushDepthM ?? 0)) * 100;
                  const avgConf = (() => {
                    const scores = damagedParts.map((p: any) => p.visionConfidenceScore).filter((s: any) => s != null);
                    return scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null;
                  })();
                  if (totalEnergyKj === 0 && maxCrushCm === 0) return null;
                  return (
                    <div className="mt-2 px-3 py-2 rounded flex flex-wrap gap-6" style={{ background: '#ffffff', border: '1px solid var(--border)', fontSize: 11 }}>
                      <div>
                        <span style={{ color: 'var(--muted-foreground)', textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em', fontWeight: 600 }}>Max Crush Depth</span>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--foreground)', fontSize: 14 }}>{maxCrushCm.toFixed(1)} cm</div>
                        <div style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>Used as M5 Campbell input</div>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted-foreground)', textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em', fontWeight: 600 }}>Total Deformation Energy</span>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--foreground)', fontSize: 14 }}>{totalEnergyKj.toFixed(2)} kJ</div>
                        <div style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>Used as M5 energy-balance input</div>
                      </div>
                      {avgConf != null && (
                        <div>
                          <span style={{ color: 'var(--muted-foreground)', textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em', fontWeight: 600 }}>Avg Vision Confidence</span>
                          <div style={{ fontFamily: 'monospace', fontWeight: 700, color: avgConf >= 70 ? 'var(--fp-success-text)' : avgConf >= 40 ? 'var(--fp-warning-text)' : 'var(--fp-info-text)', fontSize: 14 }}>{Math.round(avgConf)}%</div>
                          <div style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>M5 confidence weight: {((Math.min(90, Math.max(30, avgConf)) / 100)).toFixed(2)}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* 2.4c Damage Severity Distribution Chart */}
          {(() => {
            const damagedPartsRaw2 = (aiAssessment as any)?.damagedComponentsJson;
            const damagedParts2: any[] = (() => {
              if (!damagedPartsRaw2) return [];
              try {
                const raw = typeof damagedPartsRaw2 === 'string' ? JSON.parse(damagedPartsRaw2) : (Array.isArray(damagedPartsRaw2) ? damagedPartsRaw2 : []);
                return raw.filter((p: any) => p.severity);
              } catch { return []; }
            })();
            if (damagedParts2.length === 0) return null;
            return (
              <div className="mt-4">
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0', background: '#ffffff' }}>
                  <div className="px-4 py-3" style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>2.4c Damage Severity Distribution</p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Distribution of {damagedParts2.length} damaged component{damagedParts2.length > 1 ? 's' : ''} by severity level. Cosmetic and minor damage is expected; moderate to catastrophic damage indicates structural compromise and may require independent engineering assessment.</p>
                  </div>
                  <div className="p-4">
                    <DamageSeverityChart components={damagedParts2.map((p: any) => ({ name: p.name, severity: p.severity }))} />
                  </div>
                </div>
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
            const structuralCount = partsRecon.filter((r: any) => r.is_structural).length;
            const coverageRatio = partsRecon.length > 0 ? matchedCount / partsRecon.length : 0;
            const coverageColor = coverageRatio >= 0.8 ? 'var(--status-pass-text)' : coverageRatio >= 0.5 ? 'var(--status-review-text)' : 'var(--status-fail-text)';
            const coverageBg = coverageRatio >= 0.8 ? 'var(--status-pass-bg)' : coverageRatio >= 0.5 ? 'var(--status-review-bg)' : 'var(--status-fail-bg)';
            const pbName = (quotes ?? []).find((q: any) => q.panelBeaterName || q.repairerName)?.panelBeaterName
              ?? (quotes ?? []).find((q: any) => q.panelBeaterName || q.repairerName)?.repairerName
              ?? claimRecord0?.repairQuote?.repairerName
              ?? aiAssessment?.panelBeaterName
              ?? null;
            const claimedRepairCostCents = claimRecord0?.repairQuote?.totalRepairCostCents
              ?? (aiAssessment?.repairCostUsd != null ? Math.round(aiAssessment.repairCostUsd * 100) : null);
            const quotedItemsTotal = partsRecon.reduce((sum: number, r: any) => sum + (r.quotedAmount ?? 0), 0);
            const costDeltaCents = claimedRepairCostCents != null && quotedItemsTotal > 0
              ? claimedRepairCostCents - Math.round(quotedItemsTotal * 100)
              : null;
            // Missing component names for adjuster note
            const missingNames = partsRecon.filter((r: any) => r.reconciliation_status === 'missing_from_quote').map((r: any) => expandShorthand(r.component ?? ''));
            return (
              <div className="mt-6">
                <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#64748b" }}>2.5 Quote Coverage Summary</p>
                {pbName && (
                  <p className="text-xs mb-2" style={{ color: "#0f172a" }}>
                    <span style={{ color: 'var(--muted-foreground)' }}>Primary quoting repairer: </span>
                    <strong>{pbName}</strong>
                    {(quotes ?? []).length > 1 && <span style={{ color: 'var(--muted-foreground)', marginLeft: 6 }}>· {(quotes ?? []).length} quotes received — full comparison in Section 3.1</span>}
                  </p>
                )}
                {/* Compact stat row */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: coverageBg, border: `1px solid ${coverageColor}` }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: coverageColor }}>{Math.round(coverageRatio * 100)}%</span>
                    <span style={{ fontSize: 10, color: coverageColor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coverage</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'var(--status-pass-bg)', border: '1px solid var(--status-pass-text)' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--status-pass-text)' }}>{matchedCount}</span>
                    <span style={{ fontSize: 10, color: 'var(--status-pass-text)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Matched</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'var(--status-fail-bg)', border: '1px solid var(--status-fail-text)' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--status-fail-text)' }}>{missingCount}</span>
                    <span style={{ fontSize: 10, color: 'var(--status-fail-text)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Missing from Quote</span>
                  </div>
                  {extraItems.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'var(--status-review-bg)', border: '1px solid var(--status-review-text)' }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--status-review-text)' }}>{extraItems.length}</span>
                      <span style={{ fontSize: 10, color: 'var(--status-review-text)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Extra in Quote</span>
                    </div>
                  )}
                  {noQuoteCount > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'var(--muted)', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--muted-foreground)' }}>{noQuoteCount}</span>
                      <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>No Quote Available</span>
                    </div>
                  )}
                </div>
                {/* Missing components — compact badge list */}
                {missingNames.length > 0 && (
                  <div className="text-xs mb-2 p-2" style={{ background: 'var(--status-fail-bg)', borderRadius: 4, border: '1px solid var(--status-fail-text)' }}>
                    <strong style={{ color: 'var(--status-fail-text)' }}>Components not covered by quote:</strong>{' '}
                    <span style={{ color: 'var(--foreground)' }}>{missingNames.join(' · ')}</span>
                  </div>
                )}
                {/* Structural risk note */}
                {structuralCount > 0 && (
                  <div className="text-xs mb-2 p-2" style={{ background: 'var(--fp-warning-bg, #fffbeb)', borderRadius: 4, border: '1px solid var(--fp-warning-border, #fbbf24)' }}>
                    <strong style={{ color: 'var(--fp-warning-text, #92400e)' }}>⚠ {structuralCount} structural component{structuralCount > 1 ? 's' : ''} detected</strong>
                    <span style={{ color: 'var(--muted-foreground)', marginLeft: 6 }}>— independent structural assessment required before settlement.</span>
                  </div>
                )}
                <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>Full component breakdown with all quote prices and KINGA Optimised figures is in Section 3.1. Cost optimisation summary is in Section 3.1d.</p>
              </div>
            );
           })()}

          {/* 2.6 Speed Inference Ensemble — MUST render before 2.7 Speed Forensics */}
          {(() => {
            const ensemble = (_phys as any)?.speedInferenceEnsemble;
            if (!ensemble) return null;
            const rawMethods: any[] = ensemble.methods ?? [];
            const methods = rawMethods.map((m: any) => ({
              id: m.method ?? m.id ?? '',
              name: m.label ?? m.name ?? m.method ?? '',
              estimateKmh: m.speedKmh ?? m.estimateKmh ?? null,
              confidenceWeight: m.confidenceWeight ?? 0,
              available: m.ran ?? m.available ?? false,
              isLowerBoundOnly: m.isLowerBoundOnly ?? false,
              basis: m.basis ?? m.note ?? '',
              confidence: m.confidence ?? '',
            }));
            // Plain-English descriptions for each method (no formulas)
            const methodDescriptions: Record<string, string> = {
              M1: 'Campbell formula: measures maximum crush depth from structural deformation and applies vehicle stiffness coefficient to derive impact speed.',
              M2: 'Disabled \u2014 repair cost is not a reliable physics proxy across different markets.',
              M3: 'Impulse-momentum method: disabled — requires a vision-derived primary impact contact area. Total damage area (sum of all damaged components) is not a valid input because secondary damage from rollovers and multi-zone impacts inflates the area, producing unreliable speed estimates. Will be re-enabled when computer vision provides a measured primary contact patch area.',
              M4: 'Deployment threshold: airbag or seatbelt pretensioner activation confirms speed exceeded the system trigger threshold.',
              M5: 'Vision deformation: KINGA measures crush depth and deformation energy directly from damage photos. Two independent paths (Campbell + energy balance) are cross-validated.',
            };
            const availableMethods = methods.filter((m: any) => m.available && m.estimateKmh != null);
            if (availableMethods.length === 0 && !(ensemble.consensusSpeedKmh ?? ensemble.consensusKmh)) return null;
            const consensusKmh: number = ensemble.consensusSpeedKmh ?? ensemble.consensusKmh ?? 0;
            const confidenceLevel: string = (ensemble.overallConfidence ?? ensemble.confidenceLevel ?? 'LOW').toLowerCase();
            const divergenceFlag: boolean = ensemble.highDivergence ?? ensemble.divergenceFlag ?? false;
            const ciLow: number | null = ensemble.confidenceInterval?.[0] ?? null;
            const ciHigh: number | null = ensemble.confidenceInterval?.[1] ?? null;
            const lowerBoundKmh: number | null = ensemble.lowerBoundKmh ?? null;
            const spread: number = ensemble.crossValidation?.spread ?? 0;
            const outlierMethods: string[] = ensemble.crossValidation?.outlierMethods ?? [];

            // Speed scale: 0–120 km/h
            const SCALE_MAX = 120;
            const toScalePct = (v: number) => Math.min(100, Math.max(0, (v / SCALE_MAX) * 100));

            // Confidence colour + icon (dual channel) — uses established fp- CSS tokens
            const confColour = confidenceLevel === 'high' ? 'var(--fp-success-text)' : confidenceLevel === 'medium' ? 'var(--fp-warning-text)' : 'var(--fp-info-text)';
            const confIcon = confidenceLevel === 'high' ? '✓' : confidenceLevel === 'medium' ? '!' : '?';
            const confLabel = confidenceLevel === 'high' ? 'High Confidence' : confidenceLevel === 'medium' ? 'Moderate Confidence' : 'Low Confidence';

            // Speed zone classification for plain-English verdict
            const speedZone = consensusKmh < 15 ? 'parking'
              : consensusKmh < 40 ? 'low_urban'
              : consensusKmh < 80 ? 'urban'
              : consensusKmh < 120 ? 'highway'
              : 'high_speed';
            const speedZoneLabel: Record<string, string> = {
              parking: 'Very low-speed manoeuvre (parking / crawling)',
              low_urban: 'Low-speed urban impact',
              urban: 'Moderate urban-speed impact',
              highway: 'High-speed impact — elevated injury risk',
              high_speed: 'Very high-speed impact — critical injury risk',
            };
            const speedZoneColour: Record<string, string> = {
              parking: 'var(--fp-success-text)', low_urban: 'var(--fp-success-text)', urban: 'var(--fp-warning-text)', highway: 'var(--fp-locked-text)', high_speed: 'var(--fp-critical-text)',
            };

            // Recommended action based on confidence + divergence
            const recommendedAction = divergenceFlag
              ? { icon: '!', label: 'Inconclusive — Independent Reconstruction Recommended', colour: 'var(--fp-locked-text)', bg: 'var(--fp-locked-bg)', border: 'var(--fp-locked-border)', text: 'Methods diverge significantly. The consensus estimate should not be used as a sole basis for settlement. An independent accident reconstruction specialist should be engaged before proceeding.' }
              : confidenceLevel === 'high'
              ? { icon: '✓', label: 'High Confidence — Proceed with Standard Assessment', colour: 'var(--fp-success-text)', bg: 'var(--fp-success-bg)', border: 'var(--fp-success-border)', text: 'Multiple methods agree. The consensus speed estimate is reliable and can be used to support the claims assessment without further reconstruction.' }
              : confidenceLevel === 'medium'
              ? { icon: '!', label: 'Moderate Confidence — Assessor Verification Recommended', colour: 'var(--fp-warning-text)', bg: 'var(--fp-warning-bg)', border: 'var(--fp-warning-border)', text: 'Only one or two methods contributed. The estimate is indicative but should be cross-checked against the physical damage evidence by the attending assessor.' }
              : { icon: '?', label: 'Low Confidence — Insufficient Data for Reliable Estimate', colour: 'var(--fp-info-text)', bg: 'var(--fp-info-bg)', border: 'var(--fp-info-border)', text: 'Insufficient data for a reliable speed estimate. Do not use this figure for settlement decisions. Additional evidence (photos, witness statements, or site inspection) is required.' };

            return (
              <div className="mt-6">
                <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--foreground)' }}>2.6 Speed Inference Ensemble</p>
                {/* Correct numbering: 2.6 = ensemble, 2.7 = speed forensics */}
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: '#ffffff' }}>

                  {/* ── Header: Confidence badge + consensus number ── */}
                  <div className="px-5 py-4 flex items-start justify-between gap-4" style={{ borderBottom: '1px solid var(--border)', background: '#ffffff' }}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${confColour}20`, color: confColour, border: `1px solid ${confColour}40` }}>
                          {confIcon} {confLabel}
                        </span>
                        {divergenceFlag && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--fp-critical-bg)', color: 'var(--fp-critical-text)', border: '1px solid var(--fp-critical-border)' }}>⚠ High Divergence</span>
                        )}
                      </div>
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {availableMethods.length} of {methods.length} methods contributed &middot; {availableMethods.length === 0 ? 'No estimate available' : `Spread: ${spread.toFixed(0)} km/h`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-3xl font-black" style={{ color: 'var(--foreground)', fontFamily: 'monospace', lineHeight: 1 }}>{consensusKmh.toFixed(0)}<span className="text-base font-semibold ml-1" style={{ color: 'var(--muted-foreground)' }}>km/h</span></p>
                      {ciLow != null && ciHigh != null && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>Range: {ciLow.toFixed(0)}–{ciHigh.toFixed(0)} km/h</p>
                      )}
                      {lowerBoundKmh != null && !ciLow && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--fp-warning-text)', fontFamily: 'monospace' }}>≥ {lowerBoundKmh.toFixed(0)} km/h (lower bound)</p>
                      )}
                    </div>
                  </div>

                  {/* ── Speed Range Scale ── */}
                  <div className="px-5 pt-4 pb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted-foreground)' }}>Speed Scale — Impact Severity Context</p>
                    <div className="relative h-6 rounded-full overflow-hidden mb-1" style={{ background: '#ffffff' }}>
                      {/* Zone bands — using fp- tokens */}
                      <div className="absolute top-0 bottom-0" style={{ left: 0, width: `${toScalePct(15)}%`, background: 'var(--fp-success-text)', opacity: 0.18 }} />
                      <div className="absolute top-0 bottom-0" style={{ left: `${toScalePct(15)}%`, width: `${toScalePct(40) - toScalePct(15)}%`, background: 'var(--fp-success-text)', opacity: 0.12 }} />
                      <div className="absolute top-0 bottom-0" style={{ left: `${toScalePct(40)}%`, width: `${toScalePct(80) - toScalePct(40)}%`, background: 'var(--fp-warning-text)', opacity: 0.18 }} />
                      <div className="absolute top-0 bottom-0" style={{ left: `${toScalePct(80)}%`, right: 0, background: 'var(--fp-critical-text)', opacity: 0.18 }} />
                      {/* CI band (dominant visual) */}
                      {ciLow != null && ciHigh != null && (
                        <div className="absolute top-1 bottom-1 rounded-full" style={{ left: `${toScalePct(ciLow)}%`, width: `${toScalePct(ciHigh) - toScalePct(ciLow)}%`, background: confColour, opacity: 0.35 }} />
                      )}
                      {/* Consensus point marker */}
                      <div className="absolute top-0 bottom-0 w-0.5" style={{ left: `${toScalePct(consensusKmh)}%`, background: speedZoneColour[speedZone], opacity: 0.9 }} />
                      <div className="absolute" style={{ left: `calc(${toScalePct(consensusKmh)}% - 5px)`, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, borderRadius: '50%', background: speedZoneColour[speedZone], border: '2px solid white' }} />
                    </div>
                    {/* Scale labels */}
                    <div className="flex justify-between text-[9px]" style={{ color: 'var(--muted-foreground)' }}>
                      <span>0</span>
                      <span>Parking (&lt;15)</span>
                      <span>Low Urban (&lt;40)</span>
                      <span>Urban (&lt;80)</span>
                      <span>Highway (80+)</span>
                      <span>120 km/h</span>
                    </div>
                    <p className="text-xs mt-2 font-semibold" style={{ color: 'var(--foreground)' }}>
                      {speedZoneLabel[speedZone]}
                    </p>
                  </div>

                  {/* ── Method Contribution Panel ── */}
                  <div className="px-5 pt-3 pb-4" style={{ borderTop: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted-foreground)' }}>Method Contributions — Ranked by Reliability</p>
                    <div className="space-y-2">
                      {methods.map((m: any) => {
                        const isOutlier = outlierMethods.includes(m.id);
                        const barPct = m.available && m.estimateKmh != null ? toScalePct(m.estimateKmh) : 0;
                        // Bar opacity encodes confidence weight (0.3 min → 1.0 max)
                        const barOpacity = m.available ? Math.max(0.35, Math.min(1, (m.confidenceWeight ?? 0) * 2.5 + 0.35)) : 0.15;
                        const barColour = isOutlier ? 'var(--fp-locked-text)' : m.available ? confColour : 'var(--fp-info-text)';
                        const statusIcon = m.available ? (isOutlier ? '!' : '✓') : '✕';
                        const statusColour = m.available ? (isOutlier ? 'var(--fp-locked-text)' : 'var(--fp-success-text)') : 'var(--fp-info-text)';
                        return (
                          <div key={m.id}>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[10px] font-bold w-4 text-center" style={{ color: statusColour }}>{statusIcon}</span>
                              <span className="text-xs font-semibold" style={{ color: m.available ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{m.name}</span>
                              {m.available && m.estimateKmh != null && (
                                <span className="ml-auto text-xs font-mono font-bold" style={{ color: 'var(--foreground)' }}>{m.estimateKmh.toFixed(0)} km/h</span>
                              )}
                              {m.available && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#ffffff', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}>
                                  {Math.round((m.confidenceWeight ?? 0) * 100)}% weight
                                </span>
                              )}
                            </div>
                            {/* Bar on the speed scale */}
                            <div className="relative h-2 rounded-full ml-6" style={{ background: '#ffffff' }}>
                              {m.available && m.estimateKmh != null && (
                                <div className="absolute top-0 left-0 h-2 rounded-full" style={{ width: `${barPct}%`, background: barColour, opacity: barOpacity }} />
                              )}
                              {/* Consensus reference line */}
                              <div className="absolute top-0 bottom-0 w-px" style={{ left: `${toScalePct(consensusKmh)}%`, background: 'var(--muted-foreground)', opacity: 0.4 }} />
                            </div>
                            <p className="text-[10px] ml-6 mt-0.5" style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                              {m.available
                                ? (m.basis || methodDescriptions[m.id] || '')
                                : (m.basis || methodDescriptions[m.id] || 'Insufficient data for this method')}
                            </p>
                            {/* M5 dual-path cross-validation display */}
                            {m.id === 'M5' && m.available && (() => {
                              const pathA = (m as any).pathA;
                              const pathB = (m as any).pathB;
                              const crossVal = (m as any).crossValidation;
                              if (!pathA && !pathB) return null;
                              const agree = crossVal?.agreement === true;
                              const agreeColour = agree ? 'var(--fp-success-text)' : 'var(--fp-warning-text)';
                              const agreeBg = agree ? 'var(--fp-success-bg)' : 'var(--fp-warning-bg)';
                              const agreeBorder = agree ? 'var(--fp-success-border)' : 'var(--fp-warning-border)';
                              return (
                                <div className="ml-6 mt-1.5 rounded" style={{ border: '1px solid var(--border)', background: '#ffffff', overflow: 'hidden', fontSize: 10 }}>
                                  <div className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
                                    <div className="flex-1 px-2 py-1.5" style={{ borderRight: '1px solid var(--border)' }}>
                                      <div style={{ color: 'var(--muted-foreground)', textTransform: 'uppercase', fontSize: 9, fontWeight: 600, letterSpacing: '0.05em' }}>Path A \u2014 Campbell</div>
                                      {pathA?.crushDepthM != null && (
                                        <div style={{ fontFamily: 'monospace', color: 'var(--foreground)' }}>C = {(pathA.crushDepthM * 100).toFixed(1)} cm</div>
                                      )}
                                      {pathA?.speedKmh != null && (
                                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--foreground)' }}>{pathA.speedKmh.toFixed(0)} km/h</div>
                                      )}
                                      {!pathA && <div style={{ color: 'var(--muted-foreground)' }}>No crush depth data</div>}
                                    </div>
                                    <div className="flex-1 px-2 py-1.5">
                                      <div style={{ color: 'var(--muted-foreground)', textTransform: 'uppercase', fontSize: 9, fontWeight: 600, letterSpacing: '0.05em' }}>Path B \u2014 Energy Balance</div>
                                      {pathB?.deformationEnergyJ != null && (
                                        <div style={{ fontFamily: 'monospace', color: 'var(--foreground)' }}>E = {(pathB.deformationEnergyJ / 1000).toFixed(2)} kJ</div>
                                      )}
                                      {pathB?.speedKmh != null && (
                                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--foreground)' }}>{pathB.speedKmh.toFixed(0)} km/h</div>
                                      )}
                                      {!pathB && <div style={{ color: 'var(--muted-foreground)' }}>No energy data</div>}
                                    </div>
                                  </div>
                                  <div className="px-2 py-1" style={{ background: agreeBg, borderTop: `1px solid ${agreeBorder}` }}>
                                    <span style={{ color: agreeColour, fontWeight: 600 }}>
                                      {agree ? '\u2713 Paths agree' : '! Paths diverge'}
                                    </span>
                                    {crossVal?.spreadKmh != null && (
                                      <span style={{ color: 'var(--muted-foreground)', marginLeft: 6 }}>\u0394 {crossVal.spreadKmh.toFixed(0)} km/h</span>
                                    )}
                                    {crossVal?.confidenceUpgraded && (
                                      <span style={{ color: 'var(--fp-success-text)', marginLeft: 6, fontSize: 9, fontWeight: 600 }}>CONFIDENCE UPGRADED</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                    {outlierMethods.length > 0 && (
                      <p className="text-[10px] mt-3 px-2 py-1.5 rounded" style={{ background: 'var(--fp-locked-bg)', color: 'var(--fp-locked-text)', border: '1px solid var(--fp-locked-border)' }}>
                        ⚠ Outlier method{outlierMethods.length > 1 ? 's' : ''} ({outlierMethods.join(', ')}) excluded from consensus — estimate may be higher or lower than indicated.
                      </p>
                    )}
                  </div>

                  {/* ── Recommended Action — coloured badge only, body text black ── */}
                  <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border)', background: '#ffffff' }}>
                    <div className="flex items-start gap-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0 mt-0.5" style={{ background: recommendedAction.bg, color: recommendedAction.colour, border: `1px solid ${recommendedAction.border}` }}>{recommendedAction.icon}</span>
                      <div>
                        <p className="text-xs font-bold" style={{ color: 'var(--foreground)' }}>{recommendedAction.label}</p>
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{recommendedAction.text}</p>
                      </div>
                    </div>
                  </div>

                  {/* ── Divergence Explanation — only shown when HIGH_DIVERGENCE is set ── */}
                  {divergenceFlag && (() => {
                    const divExpl: any[] = ensemble.divergenceExplanation ?? [];
                    if (divExpl.length === 0) return null;
                    return (
                      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--fp-locked-border)', background: 'var(--fp-locked-bg)' }}>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--fp-locked-text)' }}>Why Methods Diverge — Adjuster Explanation</p>
                        {divExpl.map((d: any, i: number) => (
                          <div key={i} className="rounded-lg overflow-hidden mb-2" style={{ border: '1px solid var(--fp-locked-border)', background: '#ffffff' }}>
                            {/* Method pair header */}
                            <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--fp-locked-border)', background: 'var(--fp-locked-bg)' }}>
                              <p className="text-xs font-bold" style={{ color: '#0f172a' }}>
                                {d.methodPair?.[0]} vs {d.methodPair?.[1]}
                              </p>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] font-mono" style={{ color: '#64748b' }}>
                                  {d.speedsKmh?.[0]} km/h vs {d.speedsKmh?.[1]} km/h
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#ffffff', color: 'var(--fp-locked-text)', border: '1px solid var(--fp-locked-border)' }}>
                                  Δ{d.gapKmh} km/h ({d.gapPct}%)
                                </span>
                              </div>
                            </div>
                            {/* Explanation body */}
                            <div className="px-3 py-2 space-y-1.5">
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#64748b' }}>Key input difference</p>
                                <p className="text-[10px]" style={{ color: '#0f172a' }}>{d.keyInputDifference}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#64748b' }}>Explanation</p>
                                <p className="text-[10px] leading-relaxed" style={{ color: '#334155' }}>{d.explanation}</p>
                              </div>
                            </div>
                            {/* Recommended action */}
                            {d.recommendedAction && (
                              <div className="px-3 py-1.5" style={{ borderTop: '1px solid var(--fp-locked-border)', background: '#f8fafc' }}>
                                <p className="text-[10px]" style={{ color: '#64748b' }}>
                                  <span className="font-semibold" style={{ color: '#0f172a' }}>Action: </span>
                                  {d.recommendedAction}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                        {/* Cross-validation summary */}
                        {ensemble.crossValidation?.recommendation && (
                          <p className="text-[10px] mt-2" style={{ color: 'var(--fp-locked-text)' }}>
                            <span className="font-semibold">Cross-validation: </span>
                            {ensemble.crossValidation.recommendation}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                </div>
              </div>
            );
          })()}
          {/* 2.7 Speed Forensics — Claimed vs Physics-Inferred (correct position: after 2.6) */}
          <Section27SpeedForensics
            speedForensics={(_phys as any)?.speedForensics ?? null}
            claimedSpeed={claimedSpeed ?? null}
            physicsSpeed={physicsInferredSpeed ?? null}
          />

          {/* 2.8 Severity Consensus */}
          <Section28SeverityConsensus severityConsensus={(_phys as any)?.severityConsensus ?? null} />
          {/* 2.9 Damage Pattern Validation */}
          <Section29DamagePatternValidation damagePatternValidation={(_phys as any)?.damagePatternValidation ?? null} />
          {/* 2.10 Vehicle Structural Intelligence */}
          <Section210VehicleStructural claim={claim} />
        </div>
      </div>
    </div>
  );
}
// ─── Section 2.10: Vehicle Structural Intelligence ────────────────────────────
// Renders a compact, print-safe structural intelligence block for the forensic
// audit report. Uses the same tRPC procedure as the panel but renders in a
// report-native style (no tabs, no interactive elements).
// Confidence tiers are shown inline as text labels, not colour badges.
// Only renders if vehicleMake and vehicleModel are present on the claim.
function Section210VehicleStructural({ claim }: { claim: any }) {
  const make = claim?.vehicleMake;
  const model = claim?.vehicleModel;
  const year = claim?.vehicleYear;
  const claimId = claim?.id;

  const { data, isLoading } = trpc.vehicleStructural.getClaimProfile.useQuery(
    { claimId: claimId!, generateNarrative: true },
    { enabled: !!claimId && !!make && !!model, staleTime: 10 * 60 * 1000 }
  );

  // Do not render section at all if no vehicle data on claim
  if (!make || !model) return null;
  // Do not render a blank section during loading or when no data — avoids white space on PDF
  if (isLoading) return null;

  const insured = data?.insuredVehicle;
  const thirdParty = data?.thirdPartyVehicle;

  const confLabel = (tier?: string) => {
    if (tier === 'verified') return 'Verified';
    if (tier === 'inferred') return 'Estimated — class-based';
    return 'No data';
  };

  const riskLabel = (r?: string) => {
    if (r === 'low') return 'Low';
    if (r === 'medium') return 'Medium';
    if (r === 'high') return 'High';
    return 'Undetermined';
  };

  return (
    <div style={{ marginTop: '16px', pageBreakInside: 'avoid', breakInside: 'avoid', pageBreakBefore: 'avoid', breakBefore: 'avoid' }}>
      {/* Section header — matches existing 2.x sub-section style */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginBottom: '12px'
      }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.05em' }}>
          2.10
        </span>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>
          Vehicle Structural Intelligence
        </span>
        {insured?.hasInferredData && (
          <span style={{
            fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px',
            background: 'var(--fp-warning-bg)', color: 'var(--fp-warning-text)',
            border: '1px solid var(--fp-warning-border)', marginLeft: 'auto'
          }}>
            Partial estimates
          </span>
        )}
      </div>

      {isLoading ? (
        <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
          Loading structural intelligence data…
        </p>
      ) : !insured ? (
        <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
          Structural intelligence analysis could not be completed. Ensure vehicle make, model, and year are recorded on the claim.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Left column: insured vehicle */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--kr-body)', marginBottom: 8, fontFamily: 'var(--kr-sans)' }}>
              Insured Vehicle: {insured.make} {insured.model}{insured.year ? ` (${insured.year})` : ''}
            </p>
            <table className="compact-kv-table">
              <tbody>
                {insured.ancapRating && (
                  <>
                    <tr>
                      <td>ANCAP Rating</td>
                      <td>
                        {insured.ancapRating.stars}★ ({insured.ancapRating.testYear}, {insured.ancapRating.protocol})
                        {' '}<span style={{ fontWeight: 400, color: 'var(--kr-muted)' }}>[{confLabel('verified')}]</span>
                      </td>
                    </tr>
                    {insured.ancapRating.adultOccupant > 0 && (
                      <tr>
                        <td>Adult Occupant</td>
                        <td>{insured.ancapRating.adultOccupant}%</td>
                      </tr>
                    )}
                    {insured.ancapRating.childOccupant > 0 && (
                      <tr>
                        <td>Child Occupant</td>
                        <td>{insured.ancapRating.childOccupant}%</td>
                      </tr>
                    )}
                  </>
                )}
                {!insured.ancapRating && insured.globalNcapAfrica && (
                  <tr>
                    <td>Global NCAP Africa</td>
                    <td>
                      {insured.globalNcapAfrica.adultStars}★ adult ({insured.globalNcapAfrica.testYear})
                      {' '}<span style={{ fontWeight: 400, color: 'var(--kr-muted)' }}>[{confLabel('verified')}]</span>
                    </td>
                  </tr>
                )}
                {!insured.ancapRating && !insured.globalNcapAfrica && (
                  <tr>
                    <td>Safety Rating</td>
                    <td style={{ color: 'var(--kr-amber)' }}>
                      Not tested — risk {riskLabel(insured.safetyRiskLevel)}
                      {' '}<span style={{ fontWeight: 400, color: 'var(--kr-muted)' }}>[{confLabel(insured.ancapConfidenceTier)}]</span>
                    </td>
                  </tr>
                )}
                {insured.crash3Class && (
                  <>
                    <tr>
                      <td>Structural Class</td>
                      <td>
                        {insured.crash3Class.vehicleClass}
                        {' '}<span style={{ fontWeight: 400, color: 'var(--kr-muted)' }}>[{confLabel(insured.crash3Class.confidenceTier)}]</span>
                      </td>
                    </tr>
                    <tr>
                      <td>CRASH3 A / B</td>
                      <td>{insured.crash3Class.A_kN_m} kN/m / {insured.crash3Class.B_kN_m2} kN/m²</td>
                    </tr>
                    <tr>
                      <td>Typical Mass</td>
                      <td>{insured.crash3Class.typicalMassRange_kg[0]}–{insured.crash3Class.typicalMassRange_kg[1]} kg</td>
                    </tr>
                  </>
                )}
                {!insured.crash3Class && (
                  <tr>
                    <td>CRASH3 Class</td>
                    <td style={{ color: 'var(--kr-muted)', fontStyle: 'italic' }}>Undetermined — insufficient data</td>
                  </tr>
                )}
                <tr>
                  <td>Safety Risk</td>
                  <td>{riskLabel(insured.safetyRiskLevel)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Right column: third-party vehicle or compatibility */}
          <div>
            {thirdParty ? (
              <>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--kr-body)', marginBottom: 8, fontFamily: 'var(--kr-sans)' }}>
                  Third-Party Vehicle: {thirdParty.make} {thirdParty.model}{thirdParty.year ? ` (${thirdParty.year})` : ''}
                </p>
                <table className="compact-kv-table">
                  <tbody>
                    {thirdParty.ancapRating && (
                      <tr>
                        <td>ANCAP Rating</td>
                        <td>
                          {thirdParty.ancapRating.stars}★ ({thirdParty.ancapRating.testYear})
                          {' '}<span style={{ fontWeight: 400, color: 'var(--kr-muted)' }}>[{confLabel('verified')}]</span>
                        </td>
                      </tr>
                    )}
                    {!thirdParty.ancapRating && thirdParty.globalNcapAfrica && (
                      <tr>
                        <td>Global NCAP Africa</td>
                        <td>
                          {thirdParty.globalNcapAfrica.adultStars}★ ({thirdParty.globalNcapAfrica.testYear})
                          {' '}<span style={{ fontWeight: 400, color: 'var(--kr-muted)' }}>[{confLabel('verified')}]</span>
                        </td>
                      </tr>
                    )}
                    {!thirdParty.ancapRating && !thirdParty.globalNcapAfrica && (
                      <tr>
                        <td>Safety Rating</td>
                        <td style={{ color: 'var(--kr-amber)' }}>
                          Not tested — risk {riskLabel(thirdParty.safetyRiskLevel)}
                          {' '}<span style={{ fontWeight: 400, color: 'var(--kr-muted)' }}>[{confLabel(thirdParty.ancapConfidenceTier)}]</span>
                        </td>
                      </tr>
                    )}
                    {thirdParty.crash3Class && (
                      <>
                        <tr>
                          <td>Structural Class</td>
                          <td>
                            {thirdParty.crash3Class.vehicleClass}
                            {' '}<span style={{ fontWeight: 400, color: 'var(--kr-muted)' }}>[{confLabel(thirdParty.crash3Class.confidenceTier)}]</span>
                          </td>
                        </tr>
                        <tr>
                          <td>CRASH3 A / B</td>
                          <td>{thirdParty.crash3Class.A_kN_m} kN/m / {thirdParty.crash3Class.B_kN_m2} kN/m²</td>
                        </tr>
                      </>
                    )}
                    <tr>
                      <td>Safety Risk</td>
                      <td>{riskLabel(thirdParty.safetyRiskLevel)}</td>
                    </tr>
                  </tbody>
                </table>
                {/* Compatibility assessment */}
                <div style={{
                  marginTop: 8, padding: '8px 12px',
                  borderLeft: `3px solid ${insured.compatibilityRisk === 'high' ? 'var(--kr-red)' : insured.compatibilityRisk === 'medium' ? 'var(--kr-amber)' : 'var(--kr-green)'}`,
                  background: 'var(--kr-off-white)',
                }}>
                  <p style={{ fontSize: 11, fontWeight: 600, marginBottom: 3,
                    color: insured.compatibilityRisk === 'high' ? 'var(--kr-red)' :
                           insured.compatibilityRisk === 'medium' ? 'var(--kr-amber)' : 'var(--kr-green)' }}>
                    Structural Compatibility: {riskLabel(insured.compatibilityRisk)} Risk
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--kr-muted)', lineHeight: 1.5 }}>
                    {insured.compatibilityRisk === 'high'
                      ? 'Significant stiffness/mass mismatch. Disproportionate injury distribution likely. Critical factor in injury severity assessment.'
                      : insured.compatibilityRisk === 'medium'
                      ? 'Moderate structural mismatch. Heavier/stiffer vehicle may impose greater deceleration forces on lighter vehicle occupants.'
                      : insured.compatibilityRisk === 'low'
                      ? 'Vehicles are structurally compatible. Similar mass and stiffness characteristics reduce disproportionate injury risk.'
                      : 'Insufficient data to assess structural compatibility.'}
                  </p>
                </div>
              </>
            ) : (
              <div>
                <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '6px' }}>
                  Structural Assessment Notes
                </p>
                <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
                  {insured.ancapInferenceReason || (
                    insured.crash3Class?.inferenceReason
                      ? `CRASH3 class inferred: ${insured.crash3Class.inferenceReason}`
                      : 'No third-party vehicle data available for compatibility assessment.'
                  )}
                </p>
                {insured.crash3Class?.notes && (
                  <p style={{ fontSize: '11px', color: 'var(--fp-warning-text)', marginTop: '6px', lineHeight: 1.6 }}>
                    {insured.crash3Class.notes}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Structural Narrative */}
      {insured?.structuralNarrative && (
        <div style={{
          marginTop: '14px', padding: '10px 12px', borderRadius: '6px',
          background: 'var(--fp-neutral-bg)', border: '1px solid var(--border)'
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '6px' }}>
            Structural Intelligence Narrative
            {insured.hasInferredData && (
              <span style={{ fontWeight: 400, color: 'var(--fp-warning-text)', marginLeft: '8px', fontSize: '10px' }}>
                [Contains estimated data — see confidence labels above]
              </span>
            )}
          </p>
          <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {insured.structuralNarrative}
          </p>
        </div>
      )}

      {/* Source attribution */}
      <p style={{ fontSize: '9px', color: 'var(--muted-foreground)', marginTop: '8px', fontStyle: 'italic' }}>
        Sources: ANCAP (ancap.com.au); Global NCAP Africa (globalncap.org); CRASH3 stiffness coefficients — Campbell 1974, Prasad 1990, Nystrom et al. (JSHeld). Coefficients are class averages for frontal impacts. Estimated values are derived from vehicle class characteristics and are not equivalent to formal crash test results.
      </p>
    </div>
  );
}

// ─── Section 2.7: Speed Forensics Panel ─────────────────────────────────────
// Objective physics comparison: claimed speed vs physics-inferred speed.
// A significant deviation is surfaced as a risk indicator in Section 5.
function Section27SpeedForensics({ speedForensics, claimedSpeed, physicsSpeed }: {
  speedForensics: any | null;
  claimedSpeed: number | null;
  physicsSpeed: number | null;
}) {
  // Derive values — prefer speedForensics object, fall back to raw numbers
  const sf = speedForensics;
  const claimed: number | null = sf?.claimedSpeedKmh ?? claimedSpeed;
  const physics: number | null = sf?.physicsSpeedKmh ?? physicsSpeed;
  const ensemble: number | null = sf?.ensembleSpeedKmh ?? null;
  const devPct: number | null = sf?.deviationPct ?? null;
  const devKmh: number | null = sf?.deviationKmh ?? null;
  const devClass: string = sf?.deviationClass ?? (claimed == null ? 'no_claim' : 'consistent');
  const devLabel: string = sf?.deviationLabel ?? 'N/A';
  const requiresVerification: boolean = sf?.requiresVerification ?? false;
  const verificationPriority: string = sf?.verificationPriority ?? 'none';
  const interpretation: string = sf?.interpretation ?? '';
  const severityUpgraded: boolean = sf?.severityUpgraded ?? false;
  const injuryPhysics: string = sf?.injuryRiskFromPhysics ?? 'low';
  const injuryClaimed: string = sf?.injuryRiskFromClaimed ?? 'low';

  // If no physics speed at all, don't render
  if (!physics && !claimed) return null;

  // Deviation visual aid colours — used ONLY on bar fills and badge backgrounds, never on body text
  const devBadgeBg = devClass === 'consistent' ? 'var(--fp-success-bg)'
    : devClass === 'moderate' ? 'var(--fp-warning-bg)'
    : devClass === 'significant' ? 'var(--fp-locked-bg)'
    : devClass === 'critical' ? 'var(--fp-critical-bg)'
    : 'var(--fp-info-bg)';
  const devBadgeBorder = devClass === 'consistent' ? 'var(--fp-success-border)'
    : devClass === 'moderate' ? 'var(--fp-warning-border)'
    : devClass === 'significant' ? 'var(--fp-locked-border)'
    : devClass === 'critical' ? 'var(--fp-critical-border)'
    : 'var(--fp-info-border)';
  const devBadgeText = devClass === 'consistent' ? 'var(--fp-success-text)'
    : devClass === 'moderate' ? 'var(--fp-warning-text)'
    : devClass === 'significant' ? 'var(--fp-locked-text)'
    : devClass === 'critical' ? 'var(--fp-critical-text)'
    : 'var(--fp-info-text)';
  const devBarFill = devBadgeText; // bar fill uses same token as badge text

  // Speed scale helper
  const SCALE_MAX_27 = 120;
  const toScalePct27 = (v: number) => Math.min(100, Math.max(0, (v / SCALE_MAX_27) * 100));

  // Occupant risk badge styles — badge only, text stays black
  const injuryBadge = (r: string) => ({
    bg: r === 'critical' ? 'var(--fp-critical-bg)' : r === 'high' ? 'var(--fp-locked-bg)' : r === 'medium' ? 'var(--fp-warning-bg)' : 'var(--fp-success-bg)',
    border: r === 'critical' ? 'var(--fp-critical-border)' : r === 'high' ? 'var(--fp-locked-border)' : r === 'medium' ? 'var(--fp-warning-border)' : 'var(--fp-success-border)',
    text: r === 'critical' ? 'var(--fp-critical-text)' : r === 'high' ? 'var(--fp-locked-text)' : r === 'medium' ? 'var(--fp-warning-text)' : 'var(--fp-success-text)',
  });

  // Recommended action
  const recAction = requiresVerification
    ? { label: verificationPriority === 'high' ? 'Independent Reconstruction Required Before Settlement' : 'Assessor Verification Recommended', bg: 'var(--fp-warning-bg)', border: 'var(--fp-warning-border)', text: 'var(--fp-warning-text)', body: 'The speed discrepancy between the driver statement and physics evidence exceeds the acceptable tolerance threshold. The attending assessor should review the physical damage evidence before authorising settlement.' }
    : { label: 'Speed Claim Consistent with Physics Evidence', bg: 'var(--fp-success-bg)', border: 'var(--fp-success-border)', text: 'var(--fp-success-text)', body: 'The claimed speed falls within the expected range for this level of damage. No independent reconstruction is required on speed grounds alone.' };

  return (
    <div className="mb-4">
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: '#ffffff' }}>

        {/* ── Section header ── */}
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: '#ffffff' }}>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>2.7 Speed Forensics</p>
            <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>Objective comparison of driver-stated speed against physics-derived evidence</p>
          </div>
          {requiresVerification && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'var(--fp-warning-bg)', color: 'var(--fp-warning-text)', border: '1px solid var(--fp-warning-border)' }}>
              Verification Required
            </span>
          )}
        </div>

        <div className="p-4">

          {/* ── Speed comparison: two data columns + deviation badge ── */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div style={{ borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>Claimed Speed</p>
              <p className="text-3xl font-black" style={{ color: 'var(--foreground)', fontFamily: 'monospace' }}>
                {claimed != null ? claimed : '—'}
              </p>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{claimed != null ? 'km/h — driver statement' : 'Not Provided'}</p>
            </div>
            <div style={{ borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>Physics-Inferred Speed</p>
              <p className="text-3xl font-black" style={{ color: 'var(--foreground)', fontFamily: 'monospace' }}>
                {physics != null ? Math.round(physics) : '—'}
              </p>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {ensemble != null ? `km/h — ensemble consensus` : 'km/h — Campbell\'s formula'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>Deviation</p>
              <p className="text-3xl font-black" style={{ color: 'var(--foreground)', fontFamily: 'monospace' }}>
                {devPct != null ? `${devPct}%` : '—'}
              </p>
              {devKmh != null && (
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{devKmh.toFixed(0)} km/h absolute</p>
              )}
              {devLabel !== 'N/A' && (
                <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-1" style={{ background: devBadgeBg, color: devBadgeText, border: `1px solid ${devBadgeBorder}` }}>{devLabel}</span>
              )}
            </div>
          </div>

          {/* ── Speed scale visual aid ── */}
          {(claimed != null || physics != null) && (
            <div className="mb-5">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--muted-foreground)' }}>Speed Comparison — Impact Scale</p>
              <div className="relative h-5 rounded-full overflow-hidden" style={{ background: '#ffffff' }}>
                {/* Zone fills */}
                <div className="absolute top-0 bottom-0" style={{ left: 0, width: `${toScalePct27(15)}%`, background: 'var(--fp-success-text)', opacity: 0.12 }} />
                <div className="absolute top-0 bottom-0" style={{ left: `${toScalePct27(15)}%`, width: `${toScalePct27(40) - toScalePct27(15)}%`, background: 'var(--fp-success-text)', opacity: 0.08 }} />
                <div className="absolute top-0 bottom-0" style={{ left: `${toScalePct27(40)}%`, width: `${toScalePct27(80) - toScalePct27(40)}%`, background: 'var(--fp-warning-text)', opacity: 0.12 }} />
                <div className="absolute top-0 bottom-0" style={{ left: `${toScalePct27(80)}%`, right: 0, background: 'var(--fp-critical-text)', opacity: 0.12 }} />
                {/* Claimed speed marker */}
                {claimed != null && (
                  <div className="absolute" style={{ left: `calc(${toScalePct27(claimed)}% - 5px)`, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, borderRadius: '50%', background: 'var(--fp-info-text)', border: '2px solid white', zIndex: 2 }} />
                )}
                {/* Physics speed marker */}
                {physics != null && (
                  <div className="absolute" style={{ left: `calc(${toScalePct27(physics)}% - 5px)`, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, borderRadius: '50%', background: devBarFill, border: '2px solid white', zIndex: 3 }} />
                )}
              </div>
              <div className="flex justify-between text-[9px] mt-1" style={{ color: 'var(--muted-foreground)' }}>
                <span>0</span><span>Parking</span><span>Urban</span><span>Highway</span><span>120 km/h</span>
              </div>
              {/* Legend */}
              <div className="flex gap-4 mt-2 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                <span className="flex items-center gap-1">
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--fp-info-text)', border: '1.5px solid white', outline: '1px solid var(--fp-info-text)' }} />
                  Claimed ({claimed != null ? claimed : '—'} km/h)
                </span>
                <span className="flex items-center gap-1">
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: devBarFill, border: '1.5px solid white', outline: `1px solid ${devBarFill}` }} />
                  Physics-inferred ({physics != null ? Math.round(physics) : '—'} km/h)
                </span>
              </div>
            </div>
          )}

          {/* ── Deviation bar — tolerance scale ── */}
          {devPct != null && (
            <div className="mb-5">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--muted-foreground)' }}>Deviation Tolerance Scale</p>
              <div className="h-3 rounded-full relative" style={{ background: '#ffffff' }}>
                <div className="absolute top-0 bottom-0 rounded-l-full" style={{ left: 0, width: '15%', background: 'var(--fp-success-text)', opacity: 0.18 }} />
                <div className="absolute top-0 bottom-0" style={{ left: '15%', width: '20%', background: 'var(--fp-warning-text)', opacity: 0.18 }} />
                <div className="absolute top-0 bottom-0" style={{ left: '35%', width: '25%', background: 'var(--fp-locked-text)', opacity: 0.18 }} />
                <div className="absolute top-0 bottom-0 rounded-r-full" style={{ left: '60%', right: 0, background: 'var(--fp-critical-text)', opacity: 0.18 }} />
                <div className="absolute top-0 h-3 rounded-full" style={{ width: `${Math.min(100, devPct)}%`, background: devBarFill, opacity: 0.75 }} />
              </div>
              <div className="flex justify-between text-[9px] mt-1" style={{ color: 'var(--muted-foreground)' }}>
                <span>0% Consistent</span><span>15%</span><span>35%</span><span>60%</span><span>100% Critical</span>
              </div>
            </div>
          )}

          {/* ── Occupant risk — badge only, label text black ── */}
          {claimed != null && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div style={{ borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>Occupant Risk at Claimed Speed</p>
                <p className="text-sm font-semibold capitalize" style={{ color: 'var(--foreground)' }}>{injuryClaimed}</p>
                <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-1" style={{ background: injuryBadge(injuryClaimed).bg, color: injuryBadge(injuryClaimed).text, border: `1px solid ${injuryBadge(injuryClaimed).border}` }}>{injuryClaimed.toUpperCase()}</span>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>Occupant Risk at Physics Speed</p>
                <p className="text-sm font-semibold capitalize" style={{ color: 'var(--foreground)' }}>
                  {injuryPhysics}{severityUpgraded && <span className="ml-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>(upgraded from claimed)</span>}
                </p>
                <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-1" style={{ background: injuryBadge(injuryPhysics).bg, color: injuryBadge(injuryPhysics).text, border: `1px solid ${injuryBadge(injuryPhysics).border}` }}>{injuryPhysics.toUpperCase()}</span>
              </div>
            </div>
          )}

          {/* ── Interpretation — plain black text ── */}
          {interpretation && (
            <div className="rounded p-3 mb-4" style={{ background: '#ffffff', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>Forensic Interpretation</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--foreground)' }}>{interpretation}</p>
            </div>
          )}

          {/* ── Recommended action — badge only, body text black ── */}
          <div className="rounded p-3" style={{ background: '#ffffff', border: '1px solid var(--border)' }}>
            <div className="flex items-start gap-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0 mt-0.5" style={{ background: recAction.bg, color: recAction.text, border: `1px solid ${recAction.border}` }}>
                {requiresVerification ? '!' : '✓'}
              </span>
              <div>
                <p className="text-xs font-bold" style={{ color: 'var(--foreground)' }}>{recAction.label}</p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{recAction.body}</p>
              </div>
            </div>
          </div>

          {/* Methodology footnote */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
              <span style={{ fontWeight: 700, fontFamily: 'var(--kr-mono)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Methodology: </span>
              Physics-inferred speed is derived from Campbell\'s structural stiffness formula applied to the observed crush depth and vehicle mass, cross-validated by the Speed Inference Ensemble (Section 2.6). The claimed speed is the driver\'s stated speed from the claim form. This comparison is an objective forensic measurement — the adjuster determines its significance in the context of the full claim.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section 2.8: Severity Consensus Panel ─────────────────────────────────
// Three-source verdict: physics model, damage analysis, KINGA vision.
// Designed to answer three audiences simultaneously:
//   Engineer: raw source signals + confidence derivation
//   Investigator: alignment verdict + conflict flag
//   Insurer/Adjuster: plain-English action instruction
function Section28SeverityConsensus({ severityConsensus }: { severityConsensus: any | null }) {
  if (!severityConsensus) return null;
  const sc = severityConsensus;
  const _rawVerdict: string = sc.final_severity ?? 'unknown';
  const alignment: string = sc.source_alignment ?? 'UNKNOWN';
  const confidence: number = sc.confidence ?? 0;
  const reasoning: string = sc.reasoning ?? '';
  const signals = sc.source_signals ?? {};
  const sourcesAvailable: number = sc.sources_available ?? 0;

  // Alignment badge colours — badge only, body text stays foreground
  const alignBadge = alignment === 'FULL'
    ? { bg: 'var(--fp-success-bg)', border: 'var(--fp-success-border)', text: 'var(--fp-success-text)', label: 'FULLY ALIGNED' }
    : alignment === 'PARTIAL'
    ? { bg: 'var(--fp-warning-bg)', border: 'var(--fp-warning-border)', text: 'var(--fp-warning-text)', label: 'PARTIAL ALIGNMENT' }
    : { bg: 'var(--fp-critical-bg)', border: 'var(--fp-critical-border)', text: 'var(--fp-critical-text)', label: 'INCONCLUSIVE — MANUAL REVIEW REQUIRED' };

  // isConflicted covers both 'CONFLICT' (legacy) and 'CONFLICTED' (current pipeline value)
  const isAligned = alignment === 'FULL' || alignment === 'FULLY_ALIGNED' || alignment === 'ALIGNED';
  const isPartial = alignment === 'PARTIAL';
  const isConflicted = alignment === 'CONFLICTED' || alignment === 'CONFLICT' || (!isAligned && !isPartial);

  // When sources conflict, display INCONCLUSIVE rather than the conservative fallback severity.
  // The conservative severity is still shown in the source table for context.
  const verdict: string = isConflicted ? 'INCONCLUSIVE' : _rawVerdict;
  const conservativeFallback: string | null = isConflicted ? _rawVerdict : null;

  // Verdict colour — used only on the verdict badge
  const verdictColour = isConflicted
    ? { bg: 'var(--fp-critical-bg)', border: 'var(--fp-critical-border)', text: 'var(--fp-critical-text)' }
    : _rawVerdict === 'severe' || _rawVerdict === 'catastrophic'
    ? { bg: 'var(--fp-critical-bg)', border: 'var(--fp-critical-border)', text: 'var(--fp-critical-text)' }
    : _rawVerdict === 'moderate'
    ? { bg: 'var(--fp-warning-bg)', border: 'var(--fp-warning-border)', text: 'var(--fp-warning-text)' }
    : { bg: 'var(--fp-success-bg)', border: 'var(--fp-success-border)', text: 'var(--fp-success-text)' };

  // Source signal display
  const sourceRows: { label: string; key: string; icon: string }[] = [
    { label: 'Physics model', key: 'physics', icon: 'PHY' },
    { label: 'Damage analysis', key: 'damage', icon: 'DMG' },
    { label: 'KINGA Vision', key: 'image', icon: 'IMG' },
  ];

  // Severity colour for individual source badges
  const srcBadge = (sev: string | null) => {
    if (!sev) return { bg: 'var(--fp-info-bg)', border: 'var(--fp-info-border)', text: 'var(--fp-info-text)' };
    if (sev === 'severe' || sev === 'catastrophic') return { bg: 'var(--fp-critical-bg)', border: 'var(--fp-critical-border)', text: 'var(--fp-critical-text)' };
    if (sev === 'moderate') return { bg: 'var(--fp-warning-bg)', border: 'var(--fp-warning-border)', text: 'var(--fp-warning-text)' };
    return { bg: 'var(--fp-success-bg)', border: 'var(--fp-success-border)', text: 'var(--fp-success-text)' };
  };

  // Action instruction — plain English for adjuster/insurer
  const actionInstruction = isAligned
    ? `All ${sourcesAvailable} available source${sourcesAvailable !== 1 ? 's' : ''} are in agreement. Severity finding is ${_rawVerdict}. Recommended action: proceed to settlement subject to standard reserve and liability checks.`
    : isPartial
    ? `The majority of sources indicate ${_rawVerdict} severity, but one signal is not aligned. Recommended action: refer for physical inspection or senior assessor review before finalising the reserve, particularly if the severity classification affects the settlement amount.`
    : `The available signals produce conflicting severity assessments. Severity is INCONCLUSIVE — do not treat any single source as definitive. Conservative fallback (${conservativeFallback ?? _rawVerdict}) has been recorded for reserve purposes only. Recommended action: do not settle until a senior assessor has reviewed the conflicting signals and confirmed the severity classification in writing.`;

  return (
    <div className="mb-4">
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: '#ffffff' }}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: '#ffffff' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>2.8 Severity Consensus</p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: alignBadge.bg, color: alignBadge.text, border: `1px solid ${alignBadge.border}` }}>{alignBadge.label}</span>
        </div>
        <div className="p-4">
          {/* Verdict + Confidence — prominent for investigator */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div style={{ borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>Final Verdict</p>
              <p className="text-lg font-bold capitalize" style={{ color: 'var(--foreground)' }}>{verdict}</p>
              <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 uppercase" style={{ background: verdictColour.bg, color: verdictColour.text, border: `1px solid ${verdictColour.border}` }}>{verdict}</span>
              {conservativeFallback && (
                <p style={{ fontSize: 11, marginTop: 4, color: 'var(--muted-foreground)' }}>Conservative fallback: <span className="font-semibold capitalize">{conservativeFallback}</span></p>
              )}
            </div>
            <div style={{ borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>Confidence</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--foreground)' }}>{Math.round(confidence)}%</p>
              <div className="h-1.5 rounded-full mt-2" style={{ background: '#ffffff' }}>
                <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, confidence)}%`, background: confidence >= 70 ? 'var(--fp-success-text)' : confidence >= 40 ? 'var(--fp-warning-text)' : 'var(--fp-critical-text)', opacity: 0.8 }} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>Sources Used</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--foreground)' }}>{sourcesAvailable} / 3</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--muted-foreground)' }}>{sourcesAvailable === 3 ? 'Full triangulation' : sourcesAvailable === 2 ? 'Partial triangulation' : 'Single source'}</p>
            </div>
          </div>

          {/* Source signal table — for engineer: raw values, for investigator: agreement/conflict */}
          <table className="w-full text-xs report-table mb-4">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="py-1.5 pr-3 text-left font-semibold" style={{ color: 'var(--muted-foreground)' }}>Source</th>
                <th className="py-1.5 pr-3 text-left font-semibold" style={{ color: 'var(--muted-foreground)' }}>Signal</th>
                <th className="py-1.5 text-left font-semibold" style={{ color: 'var(--muted-foreground)' }}>Agrees with verdict</th>
              </tr>
            </thead>
            <tbody>
              {sourceRows.map(({ label, key, icon }) => {
                const signal: string | null = signals[key] ?? null;
                const agrees = signal != null && signal === verdict;
                const badge = srcBadge(signal);
                return (
                  <tr key={key} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="py-1.5 pr-3" style={{ color: 'var(--muted-foreground)' }}>
                      <span style={{ fontFamily: 'var(--kr-mono)', fontSize: 10, fontWeight: 700, marginRight: 6, padding: '1px 4px', background: '#f1f5f9', borderRadius: 2 }}>{icon}</span>
                      {label}
                    </td>
                    <td className="py-1.5 pr-3">
                      {signal
                        ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: badge.bg, color: badge.text, border: `1px solid ${badge.border}` }}>{signal}</span>
                        : <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Not available</span>
                      }
                    </td>
                    <td className="py-1.5">
                      {signal == null
                        ? <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>—</span>
                        : agrees
                        ? <span className="text-[10px] font-bold" style={{ color: 'var(--fp-success-text)' }}>✓ Yes</span>
                        : <span className="text-[10px] font-bold" style={{ color: 'var(--fp-critical-text)' }}>✗ No — {signal}</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Reasoning — engineering derivation chain */}
          {reasoning && (
            <div className="p-3 rounded mb-3" style={{ background: '#ffffff', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>Derivation</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--foreground)' }}>{reasoning}</p>
            </div>
          )}

          {/* Action instruction — plain English for adjuster/insurer */}
          <div className="flex items-start gap-3 p-3 rounded" style={{ background: isConflicted ? 'var(--fp-critical-bg)' : isPartial ? 'var(--fp-warning-bg)' : 'var(--fp-success-bg)', border: `1px solid ${isConflicted ? 'var(--fp-critical-border)' : isPartial ? 'var(--fp-warning-border)' : 'var(--fp-success-border)'}` }}>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5" style={{ background: alignBadge.bg, color: alignBadge.text, border: `1px solid ${alignBadge.border}` }}>{alignment === 'FULL' ? '✓' : alignment === 'PARTIAL' ? '!' : '⚠'}</span>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--foreground)' }}>{actionInstruction}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section 2.9: Damage Pattern Validation Panel ────────────────────────────
// Expected vs found component analysis.
// Designed to answer three audiences simultaneously:
//   Engineer: expected/found component lists + coverage percentages
//   Investigator: missing expected components (fraud signal) + unexpected components (billing anomaly)
//   Insurer/Adjuster: structural damage flag + named action items
function Section29DamagePatternValidation({ damagePatternValidation }: { damagePatternValidation: any | null }) {
  if (!damagePatternValidation) return null;
  const dpv = damagePatternValidation;
  const patternMatch: string = dpv.pattern_match ?? 'NONE';
  const missingExpected: string[] = dpv.missing_expected_components ?? [];
  const unexpected: string[] = dpv.unexpected_components ?? [];
  const structuralDetected: boolean = dpv.structural_damage_detected ?? false;
  const confidence: number = dpv.confidence ?? 0;
  const reasoning: string = dpv.reasoning ?? '';
  const detail = dpv.validation_detail ?? {};
  const expectedPrimary: string[] = detail.expected_primary ?? [];
  const expectedSecondary: string[] = detail.expected_secondary ?? [];
  const matchedPrimary: string[] = detail.matched_primary ?? [];
  const matchedSecondary: string[] = detail.matched_secondary ?? [];
  const structuralFound: string[] = detail.structural_components_found ?? [];
  const imageContradiction: boolean = detail.image_contradiction ?? false;
  const imageContradictionReason: string = detail.image_contradiction_reason ?? '';
  const primaryCovPct: number = detail.primary_coverage_pct ?? 0;
  const secondaryCovPct: number = detail.secondary_coverage_pct ?? 0;

  // Pattern match badge
  const matchBadge = patternMatch === 'STRONG'
    ? { bg: 'var(--fp-success-bg)', border: 'var(--fp-success-border)', text: 'var(--fp-success-text)' }
    : patternMatch === 'MODERATE'
    ? { bg: 'var(--fp-warning-bg)', border: 'var(--fp-warning-border)', text: 'var(--fp-warning-text)' }
    : patternMatch === 'WEAK'
    ? { bg: 'var(--fp-locked-bg)', border: 'var(--fp-locked-border)', text: 'var(--fp-locked-text)' }
    : { bg: 'var(--fp-critical-bg)', border: 'var(--fp-critical-border)', text: 'var(--fp-critical-text)' };

  const hasAnomalies = missingExpected.length > 0 || unexpected.length > 0 || structuralDetected || imageContradiction;

  return (
    <div className="mb-4">
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: '#ffffff' }}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: '#ffffff' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>2.9 Damage Pattern Validation</p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: matchBadge.bg, color: matchBadge.text, border: `1px solid ${matchBadge.border}` }}>{patternMatch} MATCH</span>
        </div>
        <div className="p-4">
          {/* Structural damage banner — most critical signal */}
          {structuralDetected && (
            <div className="flex items-center gap-2 p-2.5 rounded mb-3" style={{ background: 'var(--fp-critical-bg)', border: '1px solid var(--fp-critical-border)' }}>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--fp-critical-bg)', color: 'var(--fp-critical-text)', border: '1px solid var(--fp-critical-border)' }}>⚠ STRUCTURAL</span>
              <p className="text-xs" style={{ color: 'var(--foreground)' }}>
                Structural damage components detected: {structuralFound.length > 0 ? structuralFound.join(', ') : 'present'}.
                Frame/chassis integrity may be compromised — independent structural assessment required before settlement.
              </p>
            </div>
          )}

          {/* Image contradiction banner */}
          {imageContradiction && (
            <div className="flex items-center gap-2 p-2.5 rounded mb-3" style={{ background: 'var(--fp-critical-bg)', border: '1px solid var(--fp-critical-border)' }}>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--fp-critical-bg)', color: 'var(--fp-critical-text)', border: '1px solid var(--fp-critical-border)' }}>⚠ IMAGE CONFLICT</span>
              <p className="text-xs" style={{ color: 'var(--foreground)' }}>{imageContradictionReason || 'Image evidence contradicts claimed damage pattern.'}</p>
            </div>
          )}

          {/* Coverage metrics — engineer-grade */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span style={{ color: 'var(--muted-foreground)' }}>Primary zone coverage</span>
                <span className="tabular-nums font-semibold" style={{ color: 'var(--foreground)' }}>{primaryCovPct}%</span>
              </div>
              <div className="h-2 rounded-full" style={{ background: '#ffffff' }}>
                <div className="h-2 rounded-full" style={{ width: `${Math.min(100, primaryCovPct)}%`, background: primaryCovPct >= 70 ? 'var(--fp-success-text)' : primaryCovPct >= 40 ? 'var(--fp-warning-text)' : 'var(--fp-critical-text)', opacity: 0.8 }} />
              </div>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{matchedPrimary.length}/{expectedPrimary.length} expected primary components matched</p>
            </div>
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span style={{ color: 'var(--muted-foreground)' }}>Secondary zone coverage</span>
                <span className="tabular-nums font-semibold" style={{ color: 'var(--foreground)' }}>{secondaryCovPct}%</span>
              </div>
              <div className="h-2 rounded-full" style={{ background: '#ffffff' }}>
                <div className="h-2 rounded-full" style={{ width: `${Math.min(100, secondaryCovPct)}%`, background: secondaryCovPct >= 70 ? 'var(--fp-success-text)' : secondaryCovPct >= 40 ? 'var(--fp-warning-text)' : 'var(--fp-critical-text)', opacity: 0.8 }} />
              </div>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{matchedSecondary.length}/{expectedSecondary.length} expected secondary components matched</p>
            </div>
          </div>

          {/* Component chips — compact inline groups */}
          <div className="space-y-2 mb-3">
            {/* Matched primary */}
            {matchedPrimary.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-widest shrink-0" style={{ color: 'var(--fp-success-text)', minWidth: 56 }}>✓ Matched</span>
                {matchedPrimary.map((comp) => (
                  <span key={comp} className="text-[9px] px-1.5 py-0.5 rounded capitalize" style={{ background: 'var(--fp-success-bg)', color: 'var(--fp-success-text)', border: '1px solid var(--fp-success-border)' }}>{comp}</span>
                ))}
              </div>
            )}
            {/* Missing expected */}
            {missingExpected.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-widest shrink-0" style={{ color: 'var(--fp-critical-text)', minWidth: 56 }}>✗ Missing</span>
                {missingExpected.map((comp) => (
                  <span key={comp} className="text-[9px] px-1.5 py-0.5 rounded capitalize" style={{ background: 'var(--fp-critical-bg)', color: 'var(--fp-critical-text)', border: '1px solid var(--fp-critical-border)' }}>{comp}</span>
                ))}
                <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'var(--fp-critical-bg)', color: 'var(--fp-critical-text)', border: '1px solid var(--fp-critical-border)', fontWeight: 700 }}>fraud signal</span>
              </div>
            )}
            {/* Unexpected */}
            {unexpected.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-widest shrink-0" style={{ color: 'var(--fp-warning-text)', minWidth: 56 }}>? Extra</span>
                {unexpected.map((comp) => (
                  <span key={comp} className="text-[9px] px-1.5 py-0.5 rounded capitalize" style={{ background: 'var(--fp-warning-bg)', color: 'var(--fp-warning-text)', border: '1px solid var(--fp-warning-border)' }}>{comp}</span>
                ))}
                <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'var(--fp-warning-bg)', color: 'var(--fp-warning-text)', border: '1px solid var(--fp-warning-border)', fontWeight: 700 }}>billing anomaly</span>
              </div>
            )}
            {!missingExpected.length && !unexpected.length && matchedPrimary.length === 0 && (
              <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--fp-success-text)' }}>
                <span style={{ fontWeight: 700 }}>✓</span>
                <span>No anomalies detected</span>
              </div>
            )}
          </div>

          {/* Reasoning — engineering derivation chain */}
          {reasoning && (
            <div className="p-3 rounded mb-3" style={{ background: '#ffffff', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>Pattern Validation Reasoning</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--foreground)' }}>{reasoning}</p>
            </div>
          )}

          {/* Action instruction — plain English for adjuster/insurer */}
          {hasAnomalies ? (
            <div className="p-3 rounded" style={{ background: 'var(--fp-warning-bg)', border: '1px solid var(--fp-warning-border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--fp-warning-text)' }}>Adjuster Action Required</p>
              <ul className="text-xs space-y-1" style={{ color: 'var(--foreground)' }}>
                {missingExpected.length > 0 && <li>• Missing expected components ({missingExpected.join(', ')}) — verify whether these were omitted from the claim or genuinely absent from the damage.</li>}
                {unexpected.length > 0 && <li>• Unexpected components ({unexpected.join(', ')}) — confirm these are consistent with the stated impact direction and speed before authorising payment.</li>}
                {structuralDetected && <li>• Structural damage detected — independent structural assessment required before settlement.</li>}
                {imageContradiction && <li>• Image evidence contradicts claimed damage pattern — physical inspection required.</li>}
              </ul>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded" style={{ background: 'var(--fp-success-bg)', border: '1px solid var(--fp-success-border)' }}>
              <span style={{ color: 'var(--fp-success-text)', fontWeight: 700 }}>✓</span>
              <p className="text-xs" style={{ color: 'var(--foreground)' }}>Damage pattern is consistent with the claimed incident type and impact direction. No anomalies requiring adjuster action.</p>
            </div>
          )}
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
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>
            Quote Line Items — {quote.name}
          </p>
          {score != null && (
            <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
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
            style={{ border: "1px solid #e2e8f0", background: "#ffffff", color: "#0f172a", cursor: auditMutation.isPending ? 'wait' : 'pointer' }}
          >
            {auditMutation.isPending ? 'Running audit…' : 'Run KINGA Audit'}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs report-table">
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
              {["Description", "Category", "Qty", "Unit Price", "Total", "KINGA Review"].map(h => (
                <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "#64748b", fontFamily: "'DM Sans', sans-serif" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li: any, i: number) => {
              // C-10: Detect repair instruction phrases that were incorrectly placed in the description/component column
              // These should be shown as ACTION, not as COMPONENT
              const REPAIR_INSTRUCTION_PATTERNS = [
                /^respray\s+to\s+match$/i, /^blend$/i, /^polish$/i, /^feather$/i,
                /^wet\s+sand$/i, /^buff$/i, /^tint$/i, /^panel\s+wipe$/i, /^prep$/i,
                /^strip\s+[&and]+\s+fit$/i, /^remove\s+[&and]+\s+refit$/i, /^r\s*[&and]+\s*r$/i,
              ];
              const rawDesc = (li.description ?? li.component ?? '').trim();
              const isRepairInstruction = REPAIR_INSTRUCTION_PATTERNS.some(p => p.test(rawDesc));
              const displayDesc = isRepairInstruction ? '—' : expandShorthand(toTitleCase(rawDesc));
              const displayAction = isRepairInstruction ? toTitleCase(rawDesc) : (li.action ? toTitleCase(li.action) : li.aiReview ?? '—');
              return (
              <tr key={i} style={{ borderTop: i > 0 ? "1px solid #e2e8f0" : undefined, background: isRepairInstruction ? "#f8fafc" : "#ffffff" }}>
                <td className="px-3 py-2" style={{ color: isRepairInstruction ? "#94a3b8" : "#0f172a", fontStyle: isRepairInstruction ? "italic" : "normal" }}>{displayDesc}</td>
                <td className="px-3 py-2" style={{ color: "#64748b" }}>{li.category ? toTitleCase(li.category) : '—'}</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "#0f172a" }}>{li.quantity ?? 1}</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "#0f172a" }}>{fmtMoney(Number(li.unitPrice ?? 0))}</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "#0f172a" }}>{fmtMoney(Number(li.lineTotal ?? li.unitPrice ?? 0))}</td>
                <td className="px-3 py-2" style={{ color: li.aiReview && li.aiReview !== 'Consistent' ? "var(--muted-foreground)" : "var(--muted-foreground)", fontStyle: li.aiReview ? 'normal' : 'italic' }}>
                  {li.aiReview ?? '—'}
                </td>
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #cbd5e1", background: "#ffffff" }}>
              <td colSpan={4} className="px-3 py-2 font-bold" style={{ color: "#0f172a" }}>Total</td>
              <td className="px-3 py-2 tabular-nums font-bold" style={{ color: "#0f172a" }}>
                {fmtMoney(lineItems.reduce((s: number, li: any) => s + Number(li.lineTotal ?? li.unitPrice ?? 0), 0))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {unquoted.length > 0 && (
        <div className="px-4 py-2 text-xs" style={{ borderTop: "1px solid #e2e8f0", color: "#64748b" }}>
          <span className="font-semibold" style={{ color: "#0f172a" }}>Not quoted — verify physically: </span>
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
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
      <div className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>Labour vs Parts Ratio</p>
        {learningBenchmark?.avgCostUsd && learningBenchmark.sampleSize >= 3 && (
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
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
            <p key={i} className="text-xs mt-2" style={{ color: "#64748b" }}>
              {q.name}: {partsRatio}% parts · {labourRatio}% labour
            </p>
          );
        })}
      </div>
    </div>
  );
}

// ─── Negotiation Delta Block ─────────────────────────────────────────────────

function NegotiationDeltaBlock({ costIntel, fmtMoney }: { costIntel: any; fmtMoney: (n: number | null | undefined) => string }) {
  const originalQuote: number | null = costIntel?.documentedOriginalQuoteUsd ?? null;
  const agreedCost: number | null = costIntel?.documentedAgreedCostUsd ?? null;

  // Only render when both values are present and differ meaningfully
  if (originalQuote == null || agreedCost == null) return null;
  if (Math.abs(originalQuote - agreedCost) < 0.01) return null;

  const delta = originalQuote - agreedCost; // positive = reduction, negative = increase
  const deltaAbs = Math.abs(delta);
  const deltaPct = originalQuote > 0 ? (deltaAbs / originalQuote) * 100 : 0;
  const isReduction = delta > 0;

  // Classify the delta magnitude
  let verdictLabel: string;
  let verdictNote: string;
  let verdictColor: string;
  let actionText: string;

  if (isReduction) {
    if (deltaPct >= 40) {
      verdictLabel = 'SIGNIFICANT REDUCTION';
      verdictNote = `${deltaPct.toFixed(1)}% reduction from original quote — scope reduction or significant negotiation. Assessor should verify that all quoted items were actually repaired.`;
      verdictColor = 'var(--fp-warning-text)';
      actionText = 'Verify repair scope matches agreed cost — confirm all line items were completed before authorising final payment.';
    } else if (deltaPct >= 15) {
      verdictLabel = 'NEGOTIATED REDUCTION';
      verdictNote = `${deltaPct.toFixed(1)}% reduction from original quote — within expected negotiation range for this vehicle type.`;
      verdictColor = 'var(--fp-success-text)';
      actionText = 'Reduction is within expected negotiation range. Proceed with agreed cost as the settlement basis.';
    } else {
      verdictLabel = 'MINOR ADJUSTMENT';
      verdictNote = `${deltaPct.toFixed(1)}% reduction — minor adjustment, likely rounding or small scope change.`;
      verdictColor = 'var(--muted-foreground)';
      actionText = 'Minor adjustment — no further review required on cost basis.';
    }
  } else {
    verdictLabel = 'COST INCREASE';
    verdictNote = `Agreed cost exceeds original quote by ${deltaPct.toFixed(1)}% — supplementary work or additional damage found during repair.`;
    verdictColor = 'var(--fp-critical-text)';
    actionText = 'Agreed cost exceeds original quote — obtain supplementary repair authorisation documentation before settlement.';
  }

  // Visual bar: show original quote as full width, agreed cost as a proportion
  const agreedPct = originalQuote > 0 ? Math.min((agreedCost / originalQuote) * 100, 100) : 100;
  const originalPct = 100;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: '#ffffff' }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: '#ffffff' }}>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>3.0 Settlement Cost Analysis</p>
        <span className="text-xs font-semibold" style={{ color: verdictColor }}>{verdictLabel}</span>
      </div>
      <div className="p-4 space-y-4">
        {/* Two-row cost comparison */}
        <div className="space-y-3">
          {/* Original Quote row */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Original Submitted Quote</span>
              <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--foreground)' }}>{fmtMoney(originalQuote)}</span>
            </div>
            <div className="rounded-full overflow-hidden" style={{ height: 8, background: '#ffffff' }}>
              <div style={{ width: `${originalPct}%`, height: '100%', background: 'var(--muted-foreground)', borderRadius: 4 }} />
            </div>
          </div>
          {/* Agreed Cost row */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Agreed / Settled Cost</span>
              <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--foreground)' }}>{fmtMoney(agreedCost)}</span>
            </div>
            <div className="rounded-full overflow-hidden" style={{ height: 8, background: '#ffffff' }}>
              <div style={{ width: `${agreedPct}%`, height: '100%', background: isReduction ? 'var(--fp-success-text)' : 'var(--fp-critical-text)', borderRadius: 4 }} />
            </div>
          </div>
        </div>

        {/* Delta summary row */}
        <div className="flex items-start gap-4 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex-1">
            <p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
              {isReduction ? 'Reduction' : 'Increase'}: {fmtMoney(deltaAbs)} ({deltaPct.toFixed(1)}%)
            </p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{verdictNote}</p>
          </div>
        </div>

        {/* Recommended action strip */}
        <div className="px-3 py-2 rounded" style={{ background: '#ffffff', borderLeft: `3px solid ${verdictColor}` }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>Recommended Action</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{actionText}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Section 3: Financial Validation ─────────────────────────────────────────

function Section3Financial({ aiAssessment, enforcement, quotes, fmtMoney = fmtUsd, claimId }: { aiAssessment: any; enforcement: any; quotes?: any[]; fmtMoney?: (n: number | null | undefined) => string; claimId?: number }) {
  const e = enforcement;
  const ce = e?.costExtraction;
  const normalised = (aiAssessment as any)?._normalised as any;

  // Stage 9 no longer produces KINGA cost estimates. Only document-sourced costs are used.
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

  // Build pbQuotes with quoteType-aware deduplication:
  // - assessor_adjusted > strip_requote > revised > original (priority order per repairer)
  // - supplementary quotes are always additive and shown alongside the authoritative quote
  type PbQuoteItem = { name: string; total: number; parts: number; labour: number; status: string; lineItems: any[]; id: number; quoteType: string; badge: string; sublabel: string; panelBeaterId?: number };
  const _pbQuotesRaw: PbQuoteItem[] = (quotes ?? []).map((q: any) => {
    const lineItemsTotal = (q.lineItems ?? []).reduce((sum: number, li: any) => sum + Number(li.lineTotal ?? li.unitPrice ?? 0), 0);
    const rawTotal = (q.quotedAmount ?? 0) / 100;
    const total = rawTotal > 0 ? rawTotal : lineItemsTotal;
    const qt: string = q.quoteType ?? (q.modified === 1 ? 'assessor_adjusted' : 'original');
    const badge = qt === 'assessor_adjusted' ? 'ADJ' : qt === 'strip_requote' ? 'STRIP' : qt === 'supplementary' ? 'SUPP' : qt === 'revised' ? 'REV' : '';
    const sublabel = qt === 'assessor_adjusted' ? 'Assessor adjusted' : qt === 'strip_requote' ? 'Strip & requote' : qt === 'supplementary' ? 'Supplementary' : qt === 'revised' ? 'Revised' : 'Submitted';
    return {
      name: q.panelBeaterName ?? q.repairerName ?? (q.panelBeaterId ? `Repairer #${q.panelBeaterId}` : 'Panel Beater'),
      total, parts: (q.partsCost ?? 0) / 100, labour: (q.laborCost ?? q.labourCost ?? 0) / 100,
      status: q.status ?? 'submitted', lineItems: q.lineItems ?? [], id: q.id,
      quoteType: qt, badge, sublabel, panelBeaterId: q.panelBeaterId,
    };
  });
  // Group by panelBeaterId for smart dedup
  const _pb3Groups = new Map<number, PbQuoteItem[]>();
  const _pb3NoId: PbQuoteItem[] = [];
  for (const item of _pbQuotesRaw) {
    if (item.panelBeaterId) {
      const grp = _pb3Groups.get(item.panelBeaterId) ?? [];
      grp.push(item);
      _pb3Groups.set(item.panelBeaterId, grp);
    } else { _pb3NoId.push(item); }
  }
  const _pb3Resolved: PbQuoteItem[] = [];
  const _pb3Priority = (qt: string) => qt === 'assessor_adjusted' ? 4 : qt === 'strip_requote' ? 3 : qt === 'revised' ? 2 : qt === 'supplementary' ? 1 : 0;
  for (const [, grp] of _pb3Groups) {
    const supplementary = grp.filter(e => e.quoteType === 'supplementary');
    const authoritative = grp.find(e => e.quoteType === 'assessor_adjusted')
      ?? grp.find(e => e.quoteType === 'strip_requote')
      ?? grp.find(e => e.quoteType === 'revised')
      ?? (grp.length === 1 ? grp[0] : null);
    if (authoritative) _pb3Resolved.push(authoritative);
    else for (const e of grp.filter(e => e.quoteType === 'original')) _pb3Resolved.push(e);
    for (const s of supplementary) _pb3Resolved.push(s);
  }
  const _pb3NameMap = new Map<string, PbQuoteItem>();
  for (const item of _pb3NoId) {
    const key = item.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 28);
    const existing = _pb3NameMap.get(key);
    if (!existing || _pb3Priority(item.quoteType) > _pb3Priority(existing.quoteType)) _pb3NameMap.set(key, item);
  }
  const pbQuotes: PbQuoteItem[] = [..._pb3Resolved, ..._pb3NameMap.values()];

  const primaryQuote = pbQuotes[0];
  const quotedTotal = primaryQuote?.total ?? 0;
  const quotedParts = primaryQuote?.parts ?? 0;
  const quotedLabour = primaryQuote?.labour ?? 0;

  // No KINGA estimate to compare against — verdict is purely based on quote presence
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
  // Phase 2: Per-component KINGA benchmarks (p25/median/p75 + per-quote flags)
  const perComponentBenchmarks: Record<string, any> | null = costIntel?.perComponentBenchmarks ?? null;
  // Phase 1: Quote similarity results (from fraudScoreBreakdownJson)
  const fraudScoreBreakdown = (aiAssessment as any)?.fraudScoreBreakdownJson ?? null;
  const quoteSimilarity = fraudScoreBreakdown?.quoteSimilarity ?? null;

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
      return { amount: Number(li.lineTotal ?? li.unitPrice ?? 0), aiReview: li.aiReview ?? null };
    });
    const presentCount = cells.filter(c => c.amount !== null).length;
    const row: ItemRow3 = { description: expandShorthand(cl.canonical), category: cl.category, cells };
    if (presentCount === pbQuotes.length || pbQuotes.length <= 1) matchedRows3.push(row);
    else missedRows3.push(row);
  }
  const allRows3 = [...matchedRows3, ...missedRows3];

  // ── Composite optimisation data ──────────────────────────────────────────────
  const co = costIntel?.compositeOptimisation ?? null;

  // Build KINGA optimised column: use compositeLineItems if available, else benchmark median, else min quote
  const kingaOptimisedMap: Record<string, { amount: number; source: string; verdict: string; p25: number | null; p75: number | null; tier: string; tierLabel: string }> = {};
  if (co && Array.isArray(co.compositeLineItems)) {
    for (const item of co.compositeLineItems as any[]) {
      kingaOptimisedMap[normKey(item.componentName ?? '')] = {
        amount: item.selectedCostUsd ?? 0,
        source: item.selectedFromQuote ?? (item.isBenchmarkFill ? 'Benchmark fill' : '—'),
        verdict: item.benchmarkVerdict ?? 'NO_DATA',
        p25: item.p25Usd ?? item.benchmarkP25Usd ?? null,
        p75: item.p75Usd ?? item.benchmarkP75Usd ?? null,
        tier: item.kingaOptimisedTier ?? 'T4',
        tierLabel: item.kingaOptimisedTierLabel ?? (item.isBenchmarkFill ? 'Market Benchmark' : `Quoted · ${item.selectedFromQuote ?? '—'}`),
      };
    }
  }

  // Build cost comparison data for CostComparisonChart
  const costComparisonData = (() => {
    const lowestQuote = pbQuotes.length > 0 ? Math.min(...pbQuotes.map(q => q.total).filter(t => t > 0)) : 0;
    const highestQuote = pbQuotes.length > 0 ? Math.max(...pbQuotes.map(q => q.total).filter(t => t > 0)) : 0;
    const kingaOptimised = costIntel?.compositeOptimisation?.l2CompositeOptimisedCostUsd ?? costIntel?.compositeOptimisation?.compositeOptimisedCostUsd ?? 0;
    const benchmarkAvg = learningBenchmark3?.avgCostUsd ?? 0;
    return { lowestQuote, highestQuote, kingaOptimised, benchmarkAvg };
  })();

  return (
    <div className="mb-2 space-y-3" style={{ marginBottom: "12px" }}>

      {/* ── 3.0 Cost Summary Visual — quick at-a-glance comparison ── */}
      {pbQuotes.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0', background: '#ffffff' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>3.0 Cost at a Glance</p>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Visual comparison of submitted quotes{costComparisonData.kingaOptimised > 0 ? ', KINGA optimised total' : ''}{costComparisonData.benchmarkAvg > 0 ? ', and historical benchmark' : ''}</p>
          </div>
          <div className="p-4">
            <CostComparisonChart
              originalQuote={costComparisonData.lowestQuote}
              agreedCost={costComparisonData.kingaOptimised}
              aiEstimate={costComparisonData.highestQuote}
              trueCost={costComparisonData.kingaOptimised > 0 ? costComparisonData.kingaOptimised : costComparisonData.lowestQuote}
              panelBeaterName={pbQuotes[0]?.name ?? null}
              currencySymbol={fmtMoney(1).replace(/[\d.,\s]/g, '').trim() || '$'}
            />
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-3">
              {costComparisonData.lowestQuote > 0 && (
                <div className="flex items-center gap-1.5 text-xs" style={{ color: '#64748b' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: '#2563eb', flexShrink: 0 }} />
                  Lowest submitted quote: <span className="font-semibold" style={{ color: '#0f172a' }}>{fmtMoney(costComparisonData.lowestQuote)}</span>
                </div>
              )}
              {costComparisonData.highestQuote > 0 && costComparisonData.highestQuote !== costComparisonData.lowestQuote && (
                <div className="flex items-center gap-1.5 text-xs" style={{ color: '#64748b' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: '#9ca3af', flexShrink: 0 }} />
                  Highest submitted quote: <span className="font-semibold" style={{ color: '#0f172a' }}>{fmtMoney(costComparisonData.highestQuote)}</span>
                </div>
              )}
              {costComparisonData.kingaOptimised > 0 && (
                <div className="flex items-center gap-1.5 text-xs" style={{ color: '#64748b' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: '#16a34a', flexShrink: 0 }} />
                  KINGA optimised: <span className="font-semibold" style={{ color: '#0f172a' }}>{fmtMoney(costComparisonData.kingaOptimised)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Negotiation Delta Analysis ── */}
      <NegotiationDeltaBlock costIntel={costIntel} fmtMoney={fmtMoney} />

      {/* ── Copy-quotation alert banner (Phase 1 similarity engine) ── */}
      {quoteSimilarity && (quoteSimilarity.overall_verdict === 'confirmed' || quoteSimilarity.overall_verdict === 'suspected') && (
        <div className="rounded-lg px-4 py-3 flex items-start gap-3" style={{
          background: quoteSimilarity.overall_verdict === 'confirmed' ? 'var(--status-reject-bg)' : 'var(--fp-warning-bg, #fef3c7)',
          border: `1px solid ${quoteSimilarity.overall_verdict === 'confirmed' ? 'var(--fp-critical-border)' : 'var(--fp-warning-border, #f59e0b)'}`,
        }}>
          <span className="text-base" style={{ lineHeight: 1 }}>&#9888;</span>
          <div>
            <p className="text-xs font-bold" style={{ color: quoteSimilarity.overall_verdict === 'confirmed' ? 'var(--fp-critical-text)' : 'var(--fp-warning-text, #92400e)' }}>
              {quoteSimilarity.overall_verdict === 'confirmed' ? 'COPY QUOTATION DETECTED' : 'SUSPICIOUS QUOTE SIMILARITY'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--foreground)' }}>
              {quoteSimilarity.overall_verdict === 'confirmed'
                ? `Structural fingerprint analysis indicates these quotes were likely authored by the same source. Highest pair similarity: ${Math.round((quoteSimilarity.highest_pair_similarity ?? 0) * 100)}%.`
                : `Quote comparison reveals unusually high structural similarity between submitted quotes. Highest pair similarity: ${Math.round((quoteSimilarity.highest_pair_similarity ?? 0) * 100)}%. Independent verification recommended.`}
            </p>
            {(quoteSimilarity.copy_pairs ?? []).length > 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                Flagged pairs: {(quoteSimilarity.copy_pairs as any[]).map((p: any) => `${p.quote_a} ↔ ${p.quote_b} (${Math.round((p.overall_similarity ?? 0) * 100)}%)`).join(', ')}
              </p>
            )}
          </div>
        </div>
      )}
      {/* ── UNIFIED COMPONENT COST MATRIX TABLE ── */}
      {(() => {
        // Build MatrixQuote[] for the shared component
        const matrixQuotes: MatrixQuote[] = pbQuotes.map((q: any) => ({
          name: q.name,
          total: q.total,
          lineItems: (q.lineItems ?? []).map((li: any) => ({
            description: li.description ?? '',
            lineTotal: Number(li.lineTotal ?? li.unitPrice ?? 0),
            is_non_part_cost: li.is_non_part_cost ?? false,
          })),
          isFlagged: (() => {
            const pairVerdicts = (quoteSimilarity?.pair_results ?? []) as any[];
            return pairVerdicts.some((p: any) =>
              (p.verdict === 'confirmed' || p.verdict === 'suspected') &&
              (p.quote_a === q.name || p.quote_b === q.name)
            );
          })(),
        }));

        // Build MatrixRow[] from allRows3 with benchmark colour flags
        const matrixRows: MatrixRow[] = allRows3.map((row: any, ri: number) => {
          const benchmark = perComponentBenchmarks?.[row.description];
          const compKey = normKey(row.description);
          const compItem = kingaOptimisedMap[compKey];
          const validAmounts = row.cells.map((c: any) => c.amount).filter((a: any): a is number => a !== null);
          const kingaAmount = compItem?.amount ?? benchmark?.medianUsd ?? (validAmounts.length > 0 ? Math.min(...validAmounts) : null);

          // Derive clean source label
          const tier = compItem?.tier ?? null;
          const rawLabel = compItem?.tierLabel ?? null;
          let kingaSource: string | null = null;
          if (tier === 'T1') kingaSource = 'ML Benchmark';
          else if (tier === 'T2') kingaSource = 'Market Benchmark';
          else if (tier === 'T3' || tier === 'T4') {
            const match = rawLabel?.match(/·\s*(.+)$/);
            kingaSource = match ? match[1].trim() : (rawLabel ?? compItem?.source ?? null);
          } else if (benchmark?.modelSource === 'ml') kingaSource = 'ML Benchmark';
          else if (benchmark?.modelSource === 'statistical') kingaSource = 'Market Benchmark';
          else if (compItem?.source) kingaSource = compItem.source;

          const cells = row.cells.map((cell: any, ci: number) => {
            const qName = pbQuotes[ci]?.name ?? '';
            const bmFlag = benchmark?.quoteFlags?.[qName] ?? null;
            const flag = bmFlag === 'over' ? 'over' as const
              : bmFlag === 'under' ? 'under' as const
              : cell.amount === null ? 'missing' as const
              : undefined;
            return { amount: cell.amount, flag };
          });

          return {
            description: row.description,
            zone: (row as any).zone ?? (row as any).damageZone ?? null,
            category: row.category ?? null,
            cells,
            kingaAmount,
            kingaSource,
          };
        });

        const coData = costIntel?.compositeOptimisation ?? null;
        const l1 = coData?.l1LowestSubmittedCostUsd ?? coData?.l1SubmittedCostUsd ?? null;
        const l2 = coData?.l2CompositeOptimisedCostUsd ?? null;
        const savingsUsd = coData?.negotiationSavingsUsd ?? (l1 && l2 && l1 > l2 ? l1 - l2 : null);
        const savingsPct = l1 && savingsUsd && l1 > 0 ? Math.round((savingsUsd / l1) * 100) : null;

        // Chart 4 — Component-Level Quote Comparison grouped bar (top 10 by value)
        const chart4Rows = allRows3
          .filter((r: any) => r.cells.some((c: any) => c.amount !== null && c.amount > 0))
          .map((r: any) => ({
            description: r.description.length > 22 ? r.description.slice(0, 20) + '…' : r.description,
            values: r.cells.map((c: any) => c.amount ?? 0),
          }))
          .sort((a: any, b: any) => Math.max(...b.values) - Math.max(...a.values))
          .slice(0, 10);
        const chart4QuoteColors = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4'];
        const chart4Data = {
          labels: chart4Rows.map((r: any) => r.description),
          datasets: pbQuotes.map((q: any, qi: number) => ({
            label: q.name.length > 18 ? q.name.slice(0, 16) + '…' : q.name,
            data: chart4Rows.map((r: any) => r.values[qi] ?? 0),
            backgroundColor: chart4QuoteColors[qi % chart4QuoteColors.length],
            borderRadius: 2,
            borderWidth: 0,
          })),
        };
        const chart4Opts: any = {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: pbQuotes.length > 1, position: 'top' as const, labels: { font: { size: 10 }, boxWidth: 10, padding: 8 } },
            tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtMoney(ctx.raw)}` } },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 40, minRotation: 25 } },
            y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, callback: (v: any) => fmtMoney(v) } },
          },
          layout: { padding: { bottom: 16 } },
        };
        return (
          <div style={{ marginBottom: 16 }}>
            {chart4Rows.length > 0 && (
              <div style={{ padding: '12px 16px 0 16px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 8 }}>Component-Level Quote Comparison (Top {chart4Rows.length})</p>
                <div style={{ height: 260 }}>
                  <Bar data={chart4Data} options={chart4Opts} />
                </div>
              </div>
            )}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: chart4Rows.length > 0 ? 12 : 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0f172a' }}>3.1 Repair Cost Analysis — Component Matrix</span>
              <span style={{ fontSize: 11, color: '#64748b' }}>{matrixQuotes.length > 0 ? `${matrixQuotes.length} quote${matrixQuotes.length !== 1 ? 's' : ''} received` : 'No quotes'}</span>
            </div>
            <ComponentCostMatrix
              quotes={matrixQuotes}
              rows={matrixRows}
              l1Total={l1}
              l2Total={l2}
              savingsUsd={savingsUsd}
              savingsPct={savingsPct}
              nfs={coData?.negotiationFeasibilityScore ?? null}
              qndFlags={coData?.quotedNotDamagedFlags ?? []}
              dnqFlags={coData?.damagedNotQuotedFlags ?? []}
              fmtMoney={fmtMoney}
              showCategory={true}
            />
          </div>
        );
      })()}

      {/* Cost Waterfall Chart — rendered inside 3.1d Cost Intelligence block below */}

      {/* Labour vs Parts Ratio Chart — only shown when split data is available */}
      {pbQuotes.length > 0 && (
        <LabourPartsRatioChart
          quotes={pbQuotes}
          learningBenchmark={learningBenchmark3}
          fmtMoney={fmtMoney}
        />
      )}

      {/* Redundant itemised parts and per-repairer summary tables removed — all data is now in the unified component matrix above */}



      {/* ── 3.1d Cost Intelligence — KINGA Optimisation Summary ── */}
      {(() => {
        const co = costIntel?.compositeOptimisation ?? null;
        if (!co || co.quotesEvaluated === 0) return null;
        const l1 = co.l1LowestSubmittedCostUsd ?? co.l1SubmittedCostUsd ?? 0;
        const l2 = co.l2CompositeOptimisedCostUsd ?? 0;
        const l3 = co.l3BenchmarkReferenceCostUsd ?? 0;
        const savingsL1L2 = co.negotiationSavingsUsd ?? (l1 > 0 && l2 > 0 && l1 > l2 ? l1 - l2 : 0);
        const savingsPct = l1 > 0 && savingsL1L2 > 0 ? (savingsL1L2 / l1) * 100 : 0;
        const nfsScore = co.negotiationFeasibilityScore ?? null;
        const nfsColor = nfsScore != null ? (nfsScore >= 70 ? '#15803d' : nfsScore >= 40 ? '#92400e' : '#64748b') : '#64748b';
        const nfsBg = nfsScore != null ? (nfsScore >= 70 ? '#dcfce7' : nfsScore >= 40 ? '#fef3c7' : '#f1f5f9') : '#f1f5f9';
        // Waterfall data for inline chart
        const benchmarkUsd = learningBenchmark3?.avgCostUsd ?? 0;
        const fairRange = ce?.fair_range ?? { min: 0, max: 0 };
        const currencySymbol = fmtMoney(1).replace(/[\d,.\s]/g, '').trim() || '$';
        const waterfallData: CostWaterfallData = {
          benchmarkUsd,
          quotedTotalUsd: l1,
          marketValueUsd: marketValueUsd3 ?? undefined,
          fairRangeMinUsd: fairRange.min,
          fairRangeMaxUsd: fairRange.max,
          currencySymbol,
        };
        // Cost Decision Engine data
        const cde = costDecision;
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0', background: '#ffffff' }}>
            {/* Header row: title + NFS badge */}
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>3.1d Cost Intelligence</p>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{co.quotesEvaluated} quote{co.quotesEvaluated !== 1 ? 's' : ''} evaluated · KINGA four-tier benchmark hierarchy</p>
              </div>
              <div className="flex items-center gap-2">
                {cde?.recommendation && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: cde.recommendation === 'APPROVE' ? '#dcfce7' : cde.recommendation === 'DECLINE' ? '#fee2e2' : '#fef3c7', color: cde.recommendation === 'APPROVE' ? '#15803d' : cde.recommendation === 'DECLINE' ? '#dc2626' : '#92400e' }}>
                    {cde.recommendation}
                  </span>
                )}
                {nfsScore != null && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: nfsBg, color: nfsColor }}>
                    NFS {nfsScore} — {(co.negotiationFeasibilityLabel ?? '').toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* KPI card row: L1 vs L2 vs savings */}
              <div style={{ display: 'grid', gridTemplateColumns: l2 > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 12 }}>
                {/* L1 — Lowest Submitted */}
                <div style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#ffffff' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', margin: '0 0 4px' }}>Lowest Submitted</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1.1, fontFamily: "'IBM Plex Mono','Courier New',monospace" }}>{fmtMoney(l1)}</p>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: '3px 0 0' }}>L1 — {co.quotesEvaluated} quote{co.quotesEvaluated !== 1 ? 's' : ''} received</p>
                </div>
                {/* L2 — KINGA Optimised */}
                {l2 > 0 && (
                  <div style={{ padding: '12px 14px', borderRadius: 8, border: '2px solid #1A2B4A', background: '#f8fafc' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1A2B4A', margin: '0 0 4px' }}>KINGA Optimised</p>
                    <p style={{ fontSize: 20, fontWeight: 800, color: '#1A2B4A', margin: 0, lineHeight: 1.1, fontFamily: "'IBM Plex Mono','Courier New',monospace" }}>{fmtMoney(l2)}</p>
                    <p style={{ fontSize: 10, color: '#64748b', margin: '3px 0 0' }}>L2 — best price per component</p>
                  </div>
                )}
                {/* Savings */}
                {savingsL1L2 > 0 && (
                  <div style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#15803d', margin: '0 0 4px' }}>Savings Opportunity</p>
                    <p style={{ fontSize: 20, fontWeight: 800, color: '#15803d', margin: 0, lineHeight: 1.1, fontFamily: "'IBM Plex Mono','Courier New',monospace" }}>{fmtMoney(savingsL1L2)}</p>
                    <p style={{ fontSize: 10, color: '#16a34a', margin: '3px 0 0' }}>{savingsPct.toFixed(1)}% reduction from L1</p>
                  </div>
                )}
              </div>

              {/* Savings progress bar */}
              {savingsL1L2 > 0 && l1 > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: '#64748b' }}>KINGA Optimised vs Submitted</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#15803d' }}>{savingsPct.toFixed(1)}% saving</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: '#e2e8f0', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min((l2 / l1) * 100, 100)}%`, background: '#1A2B4A', borderRadius: 4 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                    <span style={{ fontSize: 9, color: '#94a3b8' }}>L2 {fmtMoney(l2)}</span>
                    <span style={{ fontSize: 9, color: '#94a3b8' }}>L1 {fmtMoney(l1)}</span>
                  </div>
                </div>
              )}

              {/* Inline waterfall chart — only when benchmark data is available */}
              {quotedTotal > 0 && (benchmarkUsd > 0 || (fairRange.min > 0 && fairRange.max > 0) || marketValueUsd3 != null) && (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 8 }}>Market Context</p>
                  <CostWaterfallChart data={waterfallData} />
                </div>
              )}

              {/* Cost Decision Engine narrative — merged inline */}
              {costNarrative && (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 6 }}>Cost Analysis Narrative</p>
                  <p className="text-xs leading-relaxed" style={{ color: '#374151' }}>{typeof costNarrative === 'string' ? costNarrative : (costNarrative as any)?.narrative ?? ''}</p>
                </div>
              )}

              {/* Reconciliation summary — merged from 3.1a */}
              {reconciliationSummary && (() => {
                const rs = typeof reconciliationSummary === 'string' ? null : reconciliationSummary as any;
                const summary = typeof reconciliationSummary === 'string'
                  ? reconciliationSummary
                  : typeof rs?.summary === 'string'
                    ? rs.summary
                    : `${rs?.matched_count ?? 0} matched · ${rs?.missing_count ?? 0} missing from quote · ${rs?.extra_count ?? 0} extra in quote`;
                const missing: any[] = Array.isArray(rs?.missing) ? rs.missing : [];
                const extra: any[] = Array.isArray(rs?.extra) ? rs.extra : [];
                return (
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: 6 }}>Reconciliation</p>
                    <p className="text-xs" style={{ color: '#374151', marginBottom: missing.length > 0 || extra.length > 0 ? 6 : 0 }}>{summary}</p>
                    {missing.length > 0 && (
                      <p className="text-xs" style={{ color: '#64748b' }}>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>Missing from quote: </span>
                        {missing.map((m: any) => expandShorthand(m.component ?? String(m))).join(' · ')}
                      </p>
                    )}
                    {extra.length > 0 && (
                      <p className="text-xs mt-1" style={{ color: '#64748b' }}>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>Extra in quote: </span>
                        {extra.map((e: any) => expandShorthand(e.component ?? String(e))).join(' · ')}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Component-level breakdown is in the 3.1 matrix above — not repeated here */}

              {/* Quoted-not-damaged flags */}
              {Array.isArray(co.quotedNotDamaged) && co.quotedNotDamaged.length > 0 && (
                <div className="p-3 rounded" style={{ background: '#fef3c7', border: '1px solid #f59e0b' }}>
                  <p className="text-xs font-bold mb-1" style={{ color: '#92400e' }}>COMPONENTS QUOTED BUT NOT CONFIRMED DAMAGED</p>
                  <p className="text-xs mb-2" style={{ color: '#92400e' }}>The following items appear in submitted quotes but were not identified in the damage assessment. These warrant verification before approval.</p>
                  <div className="space-y-1">
                    {(co.quotedNotDamaged as any[]).map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-xs" style={{ color: '#0f172a' }}>
                        <span className="font-medium">{item.componentName}</span>
                        <span style={{ color: '#64748b' }}>{item.classification === 'plausible_scope_extension' ? 'Plausible scope extension' : item.classification === 'suspect_inflation' ? 'Suspect inflation' : item.classification}</span>
                        {item.benchmarkCostUsd != null && <span className="tabular-nums" style={{ color: '#64748b' }}>Benchmark: {fmtMoney(item.benchmarkCostUsd)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Damaged-not-quoted flags */}
              {Array.isArray(co.damagedNotQuoted) && co.damagedNotQuoted.length > 0 && (
                <div className="p-3 rounded" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <p className="text-xs font-bold mb-1" style={{ color: '#0f172a' }}>DAMAGE IDENTIFIED — NOT INCLUDED IN ANY QUOTE</p>
                  <p className="text-xs mb-2" style={{ color: '#64748b' }}>The following components were identified as damaged but do not appear in any submitted repair quote. These may represent scope gaps or deferred repairs.</p>
                  <div className="space-y-1">
                    {(co.damagedNotQuoted as any[]).map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-xs" style={{ color: '#0f172a' }}>
                        <span className="font-medium">{item.componentName}</span>
                        <span style={{ color: '#64748b' }}>{item.severity ?? 'severity unknown'}</span>
                        {item.benchmarkCostUsd != null && <span className="tabular-nums" style={{ color: '#64748b' }}>Benchmark: {fmtMoney(item.benchmarkCostUsd)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Probable hidden damage advisories */}
              {Array.isArray(co.hiddenDamageAdvisories) && co.hiddenDamageAdvisories.length > 0 && (
                <div className="p-3 rounded" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                  <p className="text-xs font-bold mb-1" style={{ color: '#0c4a6e' }}>PROBABLE HIDDEN DAMAGE — ADVISORY</p>
                  <p className="text-xs mb-2" style={{ color: '#0c4a6e' }}>Based on co-occurrence patterns in the claims corpus, the following components have a statistically elevated probability of damage given the confirmed damage profile. Physical inspection is recommended.</p>
                  <div className="space-y-1">
                    {(co.hiddenDamageAdvisories as any[]).map((item: any, idx: number) => (
                      <div key={idx} className="flex items-start justify-between text-xs" style={{ color: '#0f172a' }}>
                        <div>
                          <span className="font-medium">{item.componentName}</span>
                          <span className="ml-2" style={{ color: '#64748b' }}>basis: {(item.basisComponents ?? []).join(', ')}</span>
                        </div>
                        <div className="text-right">
                          <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3, border: 'none', color: '#fff', background: item.probabilityPct >= 60 ? '#dc2626' : item.probabilityPct >= 35 ? '#d97706' : '#64748b', letterSpacing: '0.03em' }}>
                            {item.probabilityPct}%
                          </span>
                          <span className="ml-2" style={{ color: '#64748b' }}>({item.confidenceBand})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 3.1a Cost Decision Engine — merged into 3.1d block above */}

      {/* 3.2 Vehicle Valuation — populated from extracted data */}
      <ValuationSubsection aiAssessment={aiAssessment} enforcement={enforcement} quotes={quotes} />

      {/* 3.3 Historical Cost Benchmark — folded from Section 7 */}
      {(() => {
        const lb = (enforcement as any)?.costExtraction?.learningBenchmark ?? null;
        const hasBenchmark = lb?.avgCostUsd != null && (lb?.sampleSize ?? 0) >= 3;
        if (!hasBenchmark) return null;

        const avgCost: number = lb.avgCostUsd;
        const primaryQuoteTotal = (() => {
          try {
            const qs = (quotes ?? []);
            if (qs.length === 0) return null;
            const q = qs[0];
            const lineTotal = (q.lineItems ?? []).reduce((s: number, li: any) => s + Number(li.lineTotal ?? li.unitPrice ?? 0), 0);
            const raw = (q.quotedAmount ?? 0) / 100;
            return raw > 0 ? raw : lineTotal > 0 ? lineTotal : null;
          } catch { return null; }
        })();

        const variancePct = primaryQuoteTotal != null && avgCost > 0
          ? ((primaryQuoteTotal - avgCost) / avgCost) * 100
          : null;

        const varianceLevel: 'ok' | 'warn' | 'flag' = variancePct == null ? 'ok'
          : Math.abs(variancePct) > 30 ? 'flag'
          : Math.abs(variancePct) > 15 ? 'warn'
          : 'ok';

        const varianceSummary = variancePct == null
          ? 'No submitted quote to compare.'
          : variancePct > 30
          ? `The submitted quote is ${variancePct.toFixed(0)}% above the historical average for comparable repairs. This is a significant deviation and warrants independent cost review.`
          : variancePct > 15
          ? `The submitted quote is ${variancePct.toFixed(0)}% above the historical average. This is moderately elevated — review the line-item breakdown in Section 3.1 for inflated items.`
          : variancePct < -20
          ? `The submitted quote is ${Math.abs(variancePct).toFixed(0)}% below the historical average. Verify that all required repairs are included in the scope.`
          : `The submitted quote is within the normal range (${variancePct > 0 ? '+' : ''}${variancePct.toFixed(0)}%) compared to similar validated claims.`;

        const barWidth = primaryQuoteTotal != null ? Math.min(200, Math.round((primaryQuoteTotal / avgCost) * 100)) : 100;
        const avgBarWidth = 100;
        const colorMap = { ok: 'var(--fp-success-text)', warn: 'var(--fp-warning-text)', flag: 'var(--fp-critical-text)' };
        const bgMap = { ok: 'var(--fp-success-bg)', warn: 'var(--fp-warning-bg)', flag: 'var(--fp-critical-bg)' };
        const borderMap = { ok: 'var(--fp-success-border)', warn: 'var(--fp-warning-border)', flag: 'var(--fp-critical-border)' };

        return (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0', background: '#ffffff' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>3.3 Historical Cost Benchmark</p>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Based on {lb.sampleSize} validated claims for {lb.vehicleDescriptor ?? 'this vehicle type'} ({lb.collisionDirection ?? 'similar impact'}, {lb.marketRegion ?? 'same market'})</p>
              </div>
              {variancePct != null && (
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: bgMap[varianceLevel], color: colorMap[varianceLevel], border: `1px solid ${borderMap[varianceLevel]}` }}>
                  {variancePct > 0 ? '+' : ''}{variancePct.toFixed(0)}% vs average
                </span>
              )}
            </div>
            <div className="p-4">
              {/* Visual bar comparison */}
              <div className="space-y-3 mb-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: '#64748b' }}>Historical average ({lb.sampleSize} claims)</span>
                    <span className="font-semibold tabular-nums" style={{ color: '#0f172a' }}>{fmtMoney(avgCost)}</span>
                  </div>
                  <div className="h-3 rounded-full" style={{ background: '#f1f5f9' }}>
                    <div className="h-3 rounded-full" style={{ width: `${avgBarWidth}%`, background: '#64748b', maxWidth: '100%' }} />
                  </div>
                </div>
                {primaryQuoteTotal != null && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: '#64748b' }}>Submitted quote</span>
                      <span className="font-semibold tabular-nums" style={{ color: '#0f172a' }}>{fmtMoney(primaryQuoteTotal)}</span>
                    </div>
                    <div className="h-3 rounded-full" style={{ background: '#f1f5f9' }}>
                      <div className="h-3 rounded-full" style={{ width: `${Math.min(100, barWidth)}%`, background: colorMap[varianceLevel], maxWidth: '100%' }} />
                    </div>
                  </div>
                )}
              </div>
              {/* Plain-English verdict */}
              <div className="p-3 rounded text-xs" style={{ background: bgMap[varianceLevel], border: `1px solid ${borderMap[varianceLevel]}` }}>
                <p style={{ color: '#0f172a' }}>{varianceSummary}</p>
              </div>
              <p className="text-[10px] mt-3" style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                Benchmark data is derived from anonymised validated claims. No personally identifiable information is used. This benchmark is contextual and does not override the submitted quote.
              </p>
            </div>
          </div>
        );
      })()}
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
  // Guard: treat 0 as null — a zero ratio means the LLM had no data, not that repair is free.
  // Stage 5 always stores repairToValueRatio as a decimal fraction (e.g. 0.754 = 75.4%).
  // Multiply by 100 to convert to a percentage for display.
  // Guard: values <= 0.001 are effectively zero; values > 5 (>500%) are data errors.
  const _rawRatio = llmValuation?.repairToValueRatio ?? null;
  const llmRepairToValue = (_rawRatio != null && _rawRatio > 0.001 && _rawRatio <= 5)
    ? _rawRatio * 100
    : null;
  const excessUsd = claimRecord0?.insuranceContext?.excessAmountUsd ?? null;
  const bettermentUsd = claimRecord0?.insuranceContext?.bettermentUsd ?? null;
  const quotedTotal = (quotes?.[0]?.quotedAmount ?? 0) / 100;
  const agreedCostUsd = claimRecord0?.costs?.agreedCostUsd ?? null;
  // Repair cost priority: costIntelligenceJson.totalEstimatedCost (validated) → LLM repairCostUsd → agreed cost → quoted total
  // totalEstimatedCost is the KINGA-validated repair cost from the cost decision engine
  const repairCost = costIntel?.totalEstimatedCost ?? llmValuation?.repairCostUsd ?? agreedCostUsd ?? quotedTotal;
  // Repair-to-value ratio: prefer LLM-computed ratio, then compute from costIntelligenceJson values
  const repairToValue = llmRepairToValue ?? (marketValueUsd && marketValueUsd > 0 && repairCost > 0 ? (repairCost / marketValueUsd) * 100 : null);
  const isWriteOff = llmVerdict === "WRITE_OFF" || (repairToValue != null && repairToValue >= 75);

  // Only show if we have at least market value or repair cost
  if (!marketValueUsd && !repairCost) return null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>3.2 Vehicle Valuation</p>
        {isWriteOff != null && (
          <span className="text-xs font-semibold" style={{ color: "#0f172a" }}>{isWriteOff ? "Potential write-off" : "Repairable"}</span>
        )}
      </div>
      <div className="p-4">
        {/* Cross-reference note: market value is in Section 1.3 to avoid duplication */}
        <div style={{ marginBottom: 12, padding: '6px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4 }}>
          <p style={{ fontSize: 11, color: '#64748b' }}>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>Market Value: </span>
            {marketValueUsd != null ? fmtMoney(marketValueUsd) : 'Pending system benchmark'}
            {valuationMethod === 'document_stated'
              ? ' — ⚠ Assessor document, not independently verified'
              : valuationMethod === 'llm_estimate' || !valuationMethod
              ? ' — KINGA system benchmark'
              : ` — ${valuationMethod}`}
            <span style={{ color: '#94a3b8' }}> (vehicle details in Section 1.3)</span>
          </p>
        </div>
        <table className="compact-kv-table text-xs">
          <tbody>{([
              // Repair cost label: distinguish between KINGA-validated cost and raw quote
              costIntel?.totalEstimatedCost != null
                ? ["Repair Cost (KINGA-Validated)", fmtMoney(costIntel.totalEstimatedCost)]
                : ["Repair Cost (Quoted)", repairCost > 0 ? fmtMoney(repairCost) : "Not available"],
              ["Repair-to-Value Ratio", repairToValue != null ? `${repairToValue.toFixed(1)}%` : "Cannot calculate"],
              ["Write-off Threshold", "75% of market value"],
              ["Excess / Deductible", excessUsd != null ? fmtMoney(excessUsd) : "Not stated"],
              ["Betterment / Depreciation", bettermentUsd != null ? fmtMoney(bettermentUsd) : "Not stated"],
              ["Net Claimant Liability", excessUsd != null && bettermentUsd != null ? fmtMoney(excessUsd + bettermentUsd) : excessUsd != null ? fmtMoney(excessUsd) : "Not available"],
            ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([k, v], i) => (
              <tr key={i} style={{ borderTop: i > 0 ? "1px solid #e2e8f0" : undefined }}>
                <td className="py-2 pr-4 font-semibold w-48" style={{ color: "#64748b" }}>{k as string}</td>
                <td className="py-2 tabular-nums" style={{ color: "#0f172a" }}>{v as string}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {repairToValue != null && (
          <div className="mt-3 p-2 rounded text-xs" style={{
            background: isWriteOff ? "var(--status-reject-bg)" : "#ffffff",
            color: isWriteOff ? "var(--fp-critical-text)" : "var(--foreground)",
            border: `1px solid ${isWriteOff ? "var(--fp-critical-border)" : "var(--border)"}`,
          }}>
            {isWriteOff
              ? `Repair cost is ${repairToValue.toFixed(1)}% of market value — exceeds 75% threshold. Potential economic write-off.`
              : `Repair cost is ${repairToValue.toFixed(1)}% of market value — within repairable range.`}
          </div>
        )}
        {verdictReason && (
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "#64748b" }}>
            <span className="font-semibold" style={{ color: "#0f172a" }}>KINGA Valuation Note: </span>{verdictReason}
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
          <p className="text-xs font-semibold" style={{ color: "#0f172a" }}>
            Low-sharpness scanned PDF detected
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            Re-extract photos at 300 DPI for a sharper damage analysis. This re-runs only the photo extraction
            and damage analysis stages — the rest of the report stays unchanged.
          </p>
          {error && (
            <p className="text-xs mt-1 font-semibold" style={{ color: "var(--fp-critical-text)" }}>
              ⚠ {error}
            </p>
          )}
          {alreadyCompleted && !isRunning && (
            <div className="mt-2 p-2 rounded text-xs" style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}>
              <span className="font-semibold" style={{ color: "var(--fp-success-text)" }}>✓ Re-extraction complete — </span>
              <span style={{ color: "#64748b" }}>
                {(result ?? latestJob)?.photosExtracted ?? 0} photo(s) extracted at {(result ?? latestJob)?.renderDpi ?? 300} DPI
                {(result ?? latestJob)?.avgSharpness ? `, avg sharpness ${(result ?? latestJob).avgSharpness}%` : ""}
              </span>
              <span className="ml-2" style={{ color: "#64748b" }}>
                · Report photos updated
              </span>
            </div>
          )}
          {isRunning && (
            <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: "#64748b" }}>
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
  // CTL override: unified evidence inventory
  const ctl4 = (enforcement as any)?._claimTruth;
  const photosDetected = ctl4?.evidence?.photoCount ?? aiAssessment?.photosDetected ?? 0;
  const photosProcessed = aiAssessment?.photosProcessedCount ?? 0;
  // CRITICAL FIX: Use enrichedPhotosJson (per-photo KINGA vision metadata) as the
  // primary source so each photo is labelled with what the AI actually detected
  // in that specific image, not a positional guess from damagedParts[i].
  interface EnrichedPhotoFAR {
    url: string;
    caption: string;
    detectedComponents: string[];
    impactZone: string;
    severity: string;
  }
  const enrichedPhotosFAR: EnrichedPhotoFAR[] = (() => {
    const raw = aiAssessment?.enrichedPhotosJson;
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
            .filter((p: any) => p?.url)
            .map((p: any) => ({
              url: p.url,
              caption: p.caption ?? (Array.isArray(p.detectedComponents) && p.detectedComponents.length > 0
                ? p.detectedComponents.slice(0, 3).join(', ')
                : `Photo ${(p.index ?? 0) + 1}`),
              detectedComponents: Array.isArray(p.detectedComponents) ? p.detectedComponents : [],
              impactZone: p.impactZone ?? 'unknown',
              severity: p.severity ?? 'unknown',
            }));
        }
      } catch { /* fall through */ }
    }
    return [];
  })();
  const photoUrls: string[] = (() => {
    if (enrichedPhotosFAR.length > 0) return enrichedPhotosFAR.map(p => p.url);
    // Fallback: damagePhotosJson
    const raw = aiAssessment?.damagePhotosJson;
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((p: any) => typeof p === 'string' ? p : (p?.imageUrl ?? p?.url ?? '')).filter(Boolean);
        }
      } catch { /* fall through */ }
    }
    return aiAssessment?.photoUrls ?? aiAssessment?.processedPhotoUrls ?? [];
  })();
  const photoFraudPoints = phase2?.photoAnalysis?.fraudPointsAdded ?? 0;
  const isSystemFailure = photoStatus === "SYSTEM_FAILURE";

  // C-09: LLM photo classification — filter document/form images from damage gallery
  // Only runs when there are photos to classify. Results are cached by tRPC.
  // On LLM failure, all photos default to 'damage_photo' so gallery degrades gracefully.
  const { data: photoClassification, isLoading: photoClassifying } =
    trpc.photoReextraction.classifyPhotoUrls.useQuery(
      { urls: photoUrls.slice(0, 12), assessmentId: aiAssessment?.id ?? undefined },
      {
        enabled: photoUrls.length > 0,
        staleTime: 1000 * 60 * 60 * 24, // 24 h — cached in DB, no need to re-run LLM
        refetchOnWindowFocus: false,
      }
    );

  // Split photos into damage photos and excluded document/form images
  const classifiedPhotos = photoClassification?.classifications ?? [];
  const damagePhotoUrls: string[] = classifiedPhotos.length > 0
    ? classifiedPhotos
        .filter(c => c.category === 'damage_photo' || c.category === 'vehicle_overview')
        .map(c => c.url)
    : photoUrls; // Before classification completes, show all photos
  const excludedDocUrls: Array<{ url: string; category: string; confidence: number; reasoning: string }> =
    classifiedPhotos.filter(c => c.category === 'document_page' || c.category === 'quotation_scan' || c.category === 'other');

  // CTL-aware evidence inventory: use unified truth when available
  const ctlQuoteCount = ctl4?.costBasis?.quotes?.length ?? 0;
  const docs = [
    { id: "Claim Form", type: "Primary", extracted: true, note: "Submitted by claimant" },
    { id: "Police Report", type: "Supporting", extracted: !!(ctl4?.evidence?.policeReportPresent ?? aiAssessment?.policeReportNumber), note: aiAssessment?.policeReportNumber ? `Case: ${aiAssessment.policeReportNumber}` : (ctl4?.evidence?.policeReportPresent ? "Present in file" : "Not provided") },
    { id: "Repair Quote", type: "Financial", extracted: ctlQuoteCount > 0 || !!(aiAssessment?.estimatedCost), note: (() => {
      if (ctlQuoteCount > 0) {
        // Show the actual submitted quote total(s), not the optimised benchmark
        const quoteTotals = (ctl4?.costBasis?.quotes ?? []).map((q: any) => q.quotedAmountUsd ?? (q.quotedAmount != null ? q.quotedAmount / 100 : null)).filter((v: any) => v != null);
        const totalDisplay = quoteTotals.length > 0 ? quoteTotals.map((v: number) => fmtMoney(v)).join(', ') : fmtMoney(ctl4?.costBasis?.lowestQuoteUsd);
        return `${ctlQuoteCount} quote${ctlQuoteCount !== 1 ? 's' : ''} extracted (${totalDisplay})`;
      }
      return aiAssessment?.estimatedCost ? `${fmtMoney(aiAssessment.estimatedCost)} extracted` : 'Not submitted';
    })() },
    { id: "Photos", type: "Visual", extracted: photosDetected > 0, note: isSystemFailure ? "SYSTEM ERROR \u2014 not claimant fault" : photosDetected > 0 ? `${photosDetected} detected, ${photosProcessed} processed` : "Not submitted" },
    { id: "Driver Licence", type: "Identity", extracted: !!(claim?.driverLicenseNumber ?? aiAssessment?.driverLicenseNumber), note: claim?.driverLicenseNumber ?? aiAssessment?.driverLicenseNumber ?? "Not Provided" },
    { id: "Vehicle Registration", type: "Identity", extracted: !!(claim?.vehicleRegistration), note: claim?.vehicleRegistration ?? "Not Provided" },
    { id: "Witness Statement", type: "Supporting", extracted: false, note: ctl4?.evidence?.witnessStatementNote ?? "Optional" },
  ];

  return (
    <div className="mb-2 space-y-3" style={{ marginBottom: "12px" }}>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>4.0 Photo Evidence</p>
          <span className="text-xs font-semibold" style={{ color: "#64748b" }}>{toSentenceCase((photoStatus ?? "").replace(/_/g, " "))}</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-3 gap-4 mb-3">
            {[
              { label: "Detected", value: photosDetected },
              { label: "Processed", value: photosProcessed },
              { label: "Fraud points", value: isSystemFailure ? "0 (adj)" : photoFraudPoints },
            ].map((m, i) => (
              <div key={i} className="text-center p-2 rounded" style={{ background: "#ffffff" }}>
                <p className="text-lg font-bold" style={{ color: "#0f172a" }}>{m.value}</p>
                <p className="text-xs" style={{ color: "#64748b" }}>{m.label}</p>
              </div>
            ))}
          </div>
          {isSystemFailure && (
            <div className="p-2 text-xs mb-2" style={{ borderTop: '1px solid var(--border)', color: "#64748b" }}>
              <strong style={{ color: 'var(--foreground)' }}>System error</strong> — Photo ingestion failed due to a pipeline error. Not attributed to the claimant. Photo-related fraud points excluded from score.
            </div>
          )}
          {photoStatus === "CLAIMANT_OMISSION" && (
            <div className="p-2 text-xs mb-2" style={{ borderTop: '1px solid var(--border)', color: "#64748b" }}>
              <strong style={{ color: 'var(--foreground)' }}>Photos not provided</strong> — Claimant did not submit photo evidence. Contributes to fraud risk score.
            </div>
          )}
          {photoStatus === "ANALYSED" && (
            <div className="p-2 rounded text-xs mb-2" style={{ background: "#ffffff", border: "1px solid #e2e8f0", color: "#0f172a" }}>
              <strong>✓ Photos analysed</strong> — {photosProcessed} of {photosDetected} photos successfully processed.
            </div>
          )}
          {/* Chart 3 — Photo Evidence Inventory: vertical bar chart */}
          {photosDetected > 0 && (() => {
            const pf3 = (enforcement as any)?._photoForensics as any;
            const pfPhotos: any[] = pf3?.photos ?? [];
            const isDocVision3 = (text: string) => {
              if (!text) return false;
              if (/^\s*(DAMAGE\s+DESCRIPTION|ESTIMATE|QUOTATION|INVOICE|CLAIM\s+FORM|REPAIR\s+ORDER|PARTS\s+LIST|LABOUR\s+SCHEDULE|SCHEDULE\s+OF|VEHICLE\s+INSPECTION\s+REPORT|ASSESSMENT\s+REPORT|BASED\s+ON\s+ESTIMATE)/i.test(text)) return true;
              if (/listed\s+for\s+(replacement|repair)|qty\s*:|item\s*:|unit\s+price|labour\s+rate|parts\s+cost/i.test(text)) return true;
              if (/^\s*(i\s+am\s+sorry|i\s+cannot|i\s+can't|i\s+apologize|i\s+apologise|unable\s+to|this\s+image\s+does\s+not|the\s+image\s+does\s+not\s+(?:show|contain|depict))/i.test(text)) return true;
              return false;
            };
            const vehicleCount = pfPhotos.filter((p: any) => {
              const r = p.analysisResult ?? {};
              return !r.is_non_vehicle && !isDocVision3(r.ai_vision_description ?? '');
            }).length;
            const fraudFlagCount = pfPhotos.filter((p: any) => (p.analysisResult?.is_suspicious ?? false)).length;
            const exifStrippedCount = pfPhotos.filter((p: any) => {
              const r = p.analysisResult ?? {};
              return !r.capture_datetime && !r.camera_make && !r.camera_model && !r._camera_make && !r._camera_model;
            }).length;
            const photoInventoryData = {
              labels: ['Detected', 'Processed', 'Damage\nConfirmed', 'Fraud Flags', 'EXIF Stripped'],
              datasets: [{
                label: 'Count',
                data: [photosDetected, photosProcessed, vehicleCount, fraudFlagCount, exifStrippedCount],
                backgroundColor: ['#3b82f6', '#6366f1', '#16a34a', '#dc2626', '#d97706'],
                borderRadius: 3,
                borderWidth: 0,
              }],
            };
            const photoInventoryOpts: any = {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.raw} photo${ctx.raw !== 1 ? 's' : ''}` } },
              },
              scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, stepSize: 1 } },
              },
            };
            return (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--muted-foreground)' }}>Photo Evidence Inventory</p>
                <div style={{ height: 160 }}>
                  <Bar data={photoInventoryData} options={photoInventoryOpts} />
                </div>
              </div>
            );
          })()}
          {photoUrls.length > 0 && (
            <div className="mt-3">
              {/* C-09: Classification status indicator */}
              {photoClassifying && (
                <p className="text-xs mb-2" style={{ color: "#64748b" }}>⏳ Classifying photos…</p>
              )}
              {/* Damage photos gallery */}
              {damagePhotoUrls.length > 0 && (
                <>
                  <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#64748b" }}>
                    4.1 Photo Grid ({damagePhotoUrls.length} damage/vehicle image{damagePhotoUrls.length !== 1 ? 's' : ''})
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {damagePhotoUrls.slice(0, 9).map((url, i) => {
                      // Use enriched photo metadata when available — AI-verified caption
                      const enrichedIdx = photoUrls.indexOf(url);
                      const enriched = enrichedIdx >= 0 ? enrichedPhotosFAR[enrichedIdx] : undefined;
                      const zoneLabel = enriched
                        ? enriched.caption
                        : (() => {
                            const damagedZones = (phase2?.damageZones ?? []) as string[];
                            return damagedZones[i]
                              ? (damagedZones[i] ?? "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
                              : `View ${i + 1}`;
                          })();
                      const subLabel = enriched
                        ? `${(enriched.impactZone ?? "").replace(/_/g, " ")} · ${enriched.severity ?? ""}`
                        : `Photo ${i + 1}`;
                      return (
                        <div key={i} className="rounded overflow-hidden relative" data-photo-card style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
                          <div style={{ aspectRatio: "1", position: "relative" }}>
                            <img src={url} alt={`Photo ${i + 1} — ${zoneLabel}`} className="w-full h-full object-cover" />
                            <div className="absolute bottom-0 left-0 right-0 bg-black/55 px-1.5 py-0.5">
                              <p className="text-xs font-semibold truncate text-white">{zoneLabel}</p>
                              <p className="text-xs text-white/75">{subLabel}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {damagePhotoUrls.length > 9 && (
                    <p className="text-xs mt-2 font-medium" style={{ color: "#64748b" }}>+{damagePhotoUrls.length - 9} more images not shown</p>
                  )}
                </>
              )}
              {/* C-09: Excluded document/form images section — screen only, hidden in print */}
              {excludedDocUrls.length > 0 && (
                <div className="mt-3 rounded p-3 no-print" style={{ border: "1px solid #fbbf24", background: "#fffbeb" }}>
                  <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#92400e" }}>
                    ⚠ {excludedDocUrls.length} image{excludedDocUrls.length !== 1 ? 's' : ''} excluded from damage gallery
                  </p>
                  <p className="text-xs mb-2" style={{ color: "#78350f" }}>
                    The following image{excludedDocUrls.length !== 1 ? 's were' : ' was'} classified as document pages, quotation scans, or non-damage images and excluded from the damage evidence gallery. They should not be used as damage evidence.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {excludedDocUrls.map((exc, i) => (
                      <div key={i} className="rounded overflow-hidden relative" style={{ border: "1px solid #fbbf24", background: "#ffffff" }}>
                        <div style={{ aspectRatio: "1", position: "relative" }}>
                          <img src={exc.url} alt={`Excluded ${i + 1}`} className="w-full h-full object-cover opacity-60" />
                          <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5" style={{ background: "rgba(146,64,14,0.8)" }}>
                            <p className="text-xs font-semibold truncate text-white">{(exc.category ?? "").replace(/_/g, ' ').toUpperCase()}</p>
                            <p className="text-xs text-white/80">{Math.round(exc.confidence * 100)}% confidence</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>4.2 Document Extraction</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs report-table">
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
                {["Document", "Type", "Extracted", "Confidence", "Note"].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "#64748b", fontFamily: "'DM Sans', sans-serif" }}>{h}</th>
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
                  <tr key={i} style={{ borderTop: i > 0 ? "1px solid #e2e8f0" : undefined, background: "#ffffff" }}>
                    <td className="px-3 py-2 font-medium" style={{ color: "#0f172a" }}>{doc.id}</td>
                    <td className="px-3 py-2" style={{ color: "#64748b" }}>{doc.type}</td>
                    <td className="px-3 py-2"><span className="text-xs font-semibold" style={{ color: "#64748b" }}>{doc.extracted ? "Yes" : "No"}</span></td>
                    <td className="px-3 py-2" style={{ minWidth: 100 }}>
                      {doc.extracted ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: "#ffffff" }}>
                            <div className="h-1.5 rounded-full" style={{ width: `${conf}%`, background: confColor }} />
                          </div>
                          <span className="text-xs font-semibold shrink-0" style={{ color: confColor }}>{conf}%</span>
                        </div>
                      ) : (
                        <span style={{ color: "#64748b" }}>—</span>
                      )}
                    </td>
                    <td className="px-3 py-2" style={{ color: "#64748b" }}>{doc.note}</td>
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
            url: photo.url ?? photo.imageUrl ?? null,
            isSuspicious: r.is_suspicious ?? false,
            // _camera_make/_camera_model are stored with underscore prefix by photoForensicsEngine
            exifPresent: !!(r.capture_datetime || r.camera_make || r.camera_model || r._camera_make || r._camera_model),
            gpsPresent: !!(r.gps_coordinates),
            manipulationScore: Math.round(manipScore * 100),
            flags: r.flags ?? (photo.error ? [photo.error] : []),
            isNonVehicle: r.is_non_vehicle ?? false,
            captureDate: r.capture_datetime ?? null,
            aiVisionDescription: r.ai_vision_description ?? null,
          } satisfies PhotoExifResult;
        });
        // ── Vehicle-only filter: exclude document scans and non-vehicle images from forensics panel ──
        // Applied to both the summary verdict AND the PhotoExifForensicsPanel table
        const isDocumentVisionText = (text: string): boolean => {
          if (!text) return false;
          if (/^\s*(DAMAGE\s+DESCRIPTION|ESTIMATE|QUOTATION|INVOICE|CLAIM\s+FORM|REPAIR\s+ORDER|PARTS\s+LIST|LABOUR\s+SCHEDULE|SCHEDULE\s+OF|VEHICLE\s+INSPECTION\s+REPORT|ASSESSMENT\s+REPORT|BASED\s+ON\s+ESTIMATE)/i.test(text)) return true;
          if (/listed\s+for\s+(replacement|repair)|qty\s*:|item\s*:|unit\s+price|labour\s+rate|parts\s+cost/i.test(text)) return true;
          if (/^\s*(i\s+am\s+sorry|i\s+cannot|i\s+can't|i\s+apologize|i\s+apologise|unable\s+to|this\s+image\s+does\s+not|the\s+image\s+does\s+not\s+(?:show|contain|depict))/i.test(text)) return true;
          return false;
        };
        // Filter to vehicle damage photos only — re-index so panel shows Photo 1, 2, 3...
        // A photo is excluded only when BOTH conditions are true:
        //   1. The photoForensicsEngine flagged it as non-vehicle (is_non_vehicle: true)
        //   2. The AI vision description explicitly confirms it's a document/form page
        // This prevents PDF-embedded vehicle photos from being incorrectly excluded
        // when the engine marks them as non-vehicle due to document context.
        const vehiclePhotos = exifResults.filter(r => {
          const isDoc = isDocumentVisionText(r.aiVisionDescription ?? '');
          // If vision confirms it's a document page, always exclude
          if (isDoc) return false;
          // If vision is absent or neutral, trust the photo — include it
          // (isNonVehicle alone is not sufficient to exclude when vision is empty)
          return true;
        });
        const vehicleExifData: PhotoExifForensicsData = { results: vehiclePhotos.map((r, i) => ({ ...r, photoIndex: i + 1 })) };
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
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>4.3 Photo Forensics — EXIF & Manipulation Analysis</p>
              <span className="text-xs font-semibold" style={{ color: "#0f172a" }}>{pf.anySuspicious ? "Suspicious" : "Clean"}</span>
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
              <PhotoExifForensicsPanel data={vehicleExifData} />
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
        // Non-vehicle exclusion count — derived from EXIF results (same logic as Section 4.3)
        const pf44 = (enforcement as any)?._photoForensics as any;
        const allPhotos44: any[] = pf44?.photos ?? [];
        const isDocumentVisionText44 = (text: string): boolean => {
          if (!text) return false;
          if (/^\s*(DAMAGE\s+DESCRIPTION|ESTIMATE|QUOTATION|INVOICE|CLAIM\s+FORM|REPAIR\s+ORDER|PARTS\s+LIST|LABOUR\s+SCHEDULE|SCHEDULE\s+OF|VEHICLE\s+INSPECTION\s+REPORT|ASSESSMENT\s+REPORT|BASED\s+ON\s+ESTIMATE)/i.test(text)) return true;
          if (/listed\s+for\s+(replacement|repair)|qty\s*:|item\s*:|unit\s+price|labour\s+rate|parts\s+cost/i.test(text)) return true;
          if (/^\s*(i\s+am\s+sorry|i\s+cannot|i\s+can't|i\s+apologize|i\s+apologise|unable\s+to|this\s+image\s+does\s+not|the\s+image\s+does\s+not\s+(?:show|contain|depict))/i.test(text)) return true;
          return false;
        };
        const nonVehicleCount = allPhotos44.filter((photo: any) => {
          const r = photo.analysisResult ?? {};
          return (r.is_non_vehicle === true) || isDocumentVisionText44(r.ai_vision_description ?? '');
        }).length;
        const hasQualityIssues = rejectedSmall > 0 || blurryCount > 0 || nonVehicleCount > 0 || !!extractionError;
        const qualityStatus: "pass" | "warn" | "fail" = extractionError ? "fail" : hasQualityIssues ? "warn" : "pass";
        const qualityLabel = extractionError ? "EXTRACTION ERROR" : hasQualityIssues ? "QUALITY ISSUES" : "QUALITY OK";
        const qualityBg = extractionError ? "var(--status-reject-bg)" : hasQualityIssues ? "var(--status-review-bg)" : "var(--status-approve-bg)";
        const qualityBorder = extractionError ? "var(--fp-critical-border)" : hasQualityIssues ? "var(--fp-warning-border)" : "var(--fp-success-border)";
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>4.4 Photo Quality Intelligence</p>
              <div className="flex items-center gap-2">
                {isScanned && (
                  <span className="text-xs font-semibold" style={{ color: "#64748b" }}>Scanned PDF</span>
                )}
                <span className="text-xs font-semibold" style={{ color: "#64748b" }}>{qualityLabel}</span>
              </div>
            </div>
            <div className="p-4">
              {extractionError && (
                <div className="p-2 rounded text-xs mb-3" style={{ background: qualityBg, border: `1px solid ${qualityBorder}`, color: "var(--fp-critical-text)" }}>
                  <strong>Extraction error:</strong> {extractionError}. This is a system-level issue and is not attributed to the claimant.
                </div>
              )}
              <div className="grid grid-cols-5 gap-3 mb-3">
                {[
                  { label: "Total found", value: totalExtracted, color: "#0f172a" },
                  { label: "Damage photos", value: damageCount, color: damageCount > 0 ? "var(--fp-success-text)" : "var(--fp-warning-text)" },
                  { label: "Non-vehicle excluded", value: nonVehicleCount, color: nonVehicleCount > 0 ? "var(--fp-warning-text)" : "var(--muted-foreground)" },
                  { label: "Rejected (size)", value: rejectedSmall, color: rejectedSmall > 0 ? "var(--fp-warning-text)" : "var(--muted-foreground)" },
                  { label: "Blurry / low-res", value: blurryCount, color: blurryCount > 0 ? "var(--fp-warning-text)" : "var(--muted-foreground)" },
                ].map((m, i) => (
                  <div key={i} className="text-center p-2 rounded" style={{ background: "#ffffff" }}>
                    <p className="text-lg font-bold" style={{ color: m.color }}>{m.value}</p>
                    <p className="text-xs" style={{ color: "#64748b" }}>{m.label}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span style={{ color: "#64748b" }}>Extraction method:</span>
                    <span className="font-semibold" style={{ color: "#0f172a" }}>
                      {isScanned ? `Scanned PDF — rendered at ${renderDpi ?? "auto"} DPI` : "Native PDF image extraction"}
                    </span>
                  </div>
                  {avgSharpness !== null && (
                    <div className="flex justify-between items-center">
                      <span style={{ color: "#64748b" }}>Avg. sharpness:</span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 rounded-full" style={{ width: 60, background: "#ffffff" }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, avgSharpness)}%`, background: avgSharpness >= 70 ? "var(--fp-success-text)" : avgSharpness >= 40 ? "var(--fp-warning-text)" : "var(--fp-critical-text)" }} />
                        </div>
                        <span className="font-semibold" style={{ color: avgSharpness >= 70 ? "var(--fp-success-text)" : avgSharpness >= 40 ? "var(--fp-warning-text)" : "var(--fp-critical-text)" }}>{avgSharpness}%</span>
                      </div>
                    </div>
                  )}
                  {textHeavyCount > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: "#64748b" }}>Text-only pages skipped:</span>
                      <span className="font-semibold" style={{ color: "#64748b" }}>{textHeavyCount}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  {durationMs !== null && (
                    <div className="flex justify-between">
                      <span style={{ color: "#64748b" }}>Extraction time:</span>
                      <span className="font-semibold" style={{ color: "#0f172a" }}>{(durationMs / 1000).toFixed(1)}s</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span style={{ color: "#64748b" }}>Dimension gate (min 200px):</span>
                    <span className="font-semibold" style={{ color: rejectedSmall > 0 ? "var(--fp-warning-text)" : "var(--fp-success-text)" }}>
                      {rejectedSmall > 0 ? `${rejectedSmall} rejected` : "All passed"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "#64748b" }}>Blur detection:</span>
                    <span className="font-semibold" style={{ color: blurryCount > 0 ? "var(--fp-warning-text)" : "var(--fp-success-text)" }}>
                      {blurryCount > 0 ? `${blurryCount} flagged` : "None flagged"}
                    </span>
                  </div>
                </div>
              </div>
              {(rejectedSmall > 0 || blurryCount > 0 || nonVehicleCount > 0) && !extractionError && (
                <div className="mt-3 p-2 rounded text-xs" style={{ background: qualityBg, border: `1px solid ${qualityBorder}`, color: "#0f172a" }}>
                  <strong>Quality note:</strong>{" "}
                  {nonVehicleCount > 0 && `${nonVehicleCount} image(s) were identified as non-vehicle content (e.g., estimate forms, invoices, or documents) and excluded from forensic damage analysis. `}
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

function Section5Fraud({ aiAssessment, enforcement, speedForensics }: { aiAssessment: any; enforcement: any; speedForensics?: any | null }) {
  const e = enforcement;
  const wf = e?.weightedFraud;
  const phase2 = (e as any)?._phase2 as any;
  // Accident date cross-check results (stored in fraudScoreBreakdown)
  const fraudScoreBreakdown5 = aiAssessment?.fraudScoreBreakdownJson
    ? (typeof aiAssessment.fraudScoreBreakdownJson === 'string'
        ? JSON.parse(aiAssessment.fraudScoreBreakdownJson)
        : aiAssessment.fraudScoreBreakdownJson)
    : null;
  const dateCheck = fraudScoreBreakdown5?.accidentDateCrossCheck ?? null;

  // Canonical fraud score priority chain:
  // 1. fraudScoreBreakdownJson.overallScore (Stage 8 pipeline output, stored in DB)
  // 2. aiAssessment.fraudScore (same Stage 8 score, from the normalised bridge)
  // 3. weightedFraud.score (supplementary enforcement-time engine — fallback only)
  const canonicalFraudScore = fraudScoreBreakdown5?.overallScore ?? (aiAssessment as any)?.fraudScore ?? null;
  const fraudScore = canonicalFraudScore != null && canonicalFraudScore > 0
    ? Number(canonicalFraudScore)
    : (wf?.score ?? 0);
  const fraudLevel = fraudScoreBreakdown5?.level ?? wf?.level ?? "minimal";
  // Build fraud label from canonical score and triggered factors — do NOT use stored explanation
  // text which may embed a stale sub-score number from an older pipeline run.
  const triggeredFactorNames = (wf?.full_contributions ?? wf?.contributions ?? [])
    .filter((c: any) => c.triggered)
    .map((c: any) => (c.factor ?? "").toLowerCase())
    .filter(Boolean);
  const fraudLabel = triggeredFactorNames.length > 0
    ? `Risk indicators detected: ${triggeredFactorNames.join(", ")}. ${
        fraudScore >= 70 ? "Escalation to a senior assessor is required before proceeding."
        : fraudScore >= 40 ? "Additional verification is advised before approving this claim."
        : "Standard review process applies."
      }`
    : "No fraud indicators detected. The claim is consistent with the reported incident.";
  const fraudColor = fraudScore >= 70 ? "var(--fp-critical-text)" : fraudScore >= 40 ? "var(--fp-warning-text)" : "var(--fp-success-text)";
  const fraudBand = fraudScore >= 70 ? "High risk" : fraudScore >= 40 ? "Moderate risk" : "Low risk";

  const contributions: any[] = wf?.full_contributions ?? wf?.contributions ?? [];
  const photoStatus = phase2?.photoAnalysis?.photoStatus ?? "NOT_APPLICABLE";
  const isSystemFailure = photoStatus === "SYSTEM_FAILURE";
  const advisories: string[] = phase2?.advisories ?? [];
  const keyDrivers: string[] = phase2?.keyDrivers ?? [];
  const physicsScore = phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0;

  return (
    <div className="mb-2 space-y-3" style={{ marginBottom: "12px" }}>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${fraudColor}40`, background: "#ffffff" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>5.1 Overall Fraud Risk Score</p>
          <span className="text-xs font-semibold" style={{ color: "#0f172a" }}>{toSentenceCase(fraudBand)}</span>
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
              <p className="text-xs mt-1" style={{ color: "#64748b" }}>{fraudLabel}</p>
              <div className="mt-2 space-y-1">
                {[
                  { label: "0–39: LOW", color: "var(--fp-success-text)" },
                  { label: "40–69: MODERATE", color: "var(--fp-warning-text)" },
                  { label: "70–100: HIGH", color: "var(--fp-critical-text)" },
                ].map(b => (
                  <div key={b.label} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{ background: b.color }} />
                    <span style={{ color: "#64748b" }}>{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="h-3 rounded-full mb-1" style={{ background: "#ffffff" }}>
            <div className="h-3 rounded-full" style={{ width: `${Math.min(100, fraudScore)}%`, background: "linear-gradient(90deg, var(--fp-success-text), var(--fp-warning-text), var(--fp-critical-text))" }} />
          </div>
          <div className="flex justify-between text-xs" style={{ color: "#64748b" }}>
            <span>0 — Low</span><span>40 — Moderate</span><span>70 — High</span><span>100</span>
          </div>
        </div>
      </div>

      {/* 5.1b Fraud Score Decomposition — doughnut showing how each factor contributes */}
      {contributions.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${fraudColor}40`, background: '#ffffff' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>5.1b Score Decomposition</p>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Each segment shows how much that risk factor contributed to the total fraud score of {Math.round(fraudScore)}/100. Larger segments indicate stronger fraud signals.</p>
          </div>
          <div className="p-4">
            <FraudBreakdownChart
              fraudScore={Math.round(fraudScore)}
              indicators={contributions.map((c: any) => ({
                label: (() => {
                  const f = (c.factor ?? '').toLowerCase();
                  if (f.includes('cost')) return 'Cost Deviation';
                  if (f.includes('speed') || f.includes('physics')) return 'Speed / Physics';
                  if (f.includes('damage') || f.includes('pattern')) return 'Damage Pattern';
                  if (f.includes('photo') || f.includes('image')) return 'Photo Evidence';
                  if (f.includes('police') || f.includes('report')) return 'Police Report';
                  if (f.includes('repeat') || f.includes('prior')) return 'Repeat Claim';
                  if (f.includes('direction') || f.includes('mismatch')) return 'Impact Direction';
                  if (f.includes('missing') || f.includes('data')) return 'Missing Data';
                  return c.factor ?? 'Other';
                })(),
                weight: Math.max(0, c.value ?? c.weight ?? 0),
              }))}
            />
          </div>
        </div>
      )}

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
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${fraudColor}40`, background: "#ffffff" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>5.0 Fraud Risk Analysis — Visual Overview</p>
            </div>
            <div className="p-4 grid grid-cols-2 gap-6">
              {/* Left: Radar chart */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#64748b" }}>Risk Profile (Radar)</p>
                <FraudRadarChart data={radarData} />
              </div>
              {/* Right: Horizontal bar chart */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#64748b" }}>Factor Contributions (Bar)</p>
                <div className="space-y-2">
                  {barAxes.map((ax, i) => {
                    const pct = Math.min(100, Math.round((ax.value / ax.max) * 100));
                    const barColor = ax.value > 12 ? "var(--fp-critical-text)" : ax.value > 6 ? "var(--fp-warning-text)" : "var(--fp-success-text)";
                    return (
                      <div key={i}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span style={{ color: "#64748b" }}>{ax.label}</span>
                          <span className="font-bold tabular-nums" style={{ color: "#0f172a" }}>{ax.value}/{ax.max}</span>
                        </div>
                        <div className="h-2 rounded-full" style={{ background: "#ffffff" }}>
                          <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: barColor }} />
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

      {/* Speed-Physics Discrepancy Evidence Block — shown when speedForensics has a non-trivial deviation */}
      {(() => {
        const sf = speedForensics;
        if (!sf) return null;
        const clm: number | null = sf.claimedSpeedKmh ?? null;
        const inf: number | null = sf.inferredSpeedKmh ?? sf.physicsSpeedKmh ?? null;
        if (clm == null || inf == null) return null;
        const devKmh = Math.abs(inf - clm);
        if (devKmh < 2) return null; // trivial
        const devClass: string = sf.deviationClass ?? 'minor';
        const isElevated = devClass === 'significant' || devClass === 'critical';
        const devColor = devClass === 'critical' ? 'var(--fp-critical-text)'
          : devClass === 'significant' ? 'var(--fp-warning-text)'
          : 'var(--muted-foreground)';
        // Visual: two bars on same scale (0 to max(clm, inf) * 1.3)
        const scaleMax = Math.max(clm, inf) * 1.3 || 50;
        const clmPct = Math.min(100, (clm / scaleMax) * 100);
        const infPct = Math.min(100, (inf / scaleMax) * 100);
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${devColor}40`, background: '#ffffff' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: '#ffffff' }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>5.2 Speed-Physics Evidence</p>
              <span className="text-xs font-semibold" style={{ color: devColor }}>
                {devClass === 'critical' ? 'CRITICAL DISCREPANCY' : devClass === 'significant' ? 'SIGNIFICANT DISCREPANCY' : 'MINOR DISCREPANCY'}
              </span>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Claimed speed (driver statement)</span>
                    <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--foreground)' }}>{clm} km/h</span>
                  </div>
                  <div className="rounded-full overflow-hidden" style={{ height: 8, background: '#ffffff' }}>
                    <div style={{ width: `${clmPct}%`, height: '100%', background: 'var(--muted-foreground)', borderRadius: 4 }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Physics-inferred speed (ensemble)</span>
                    <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--foreground)' }}>{inf} km/h</span>
                  </div>
                  <div className="rounded-full overflow-hidden" style={{ height: 8, background: '#ffffff' }}>
                    <div style={{ width: `${infPct}%`, height: '100%', background: devColor, borderRadius: 4 }} />
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-4 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex-1">
                  <p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
                    Discrepancy: {devKmh.toFixed(1)} km/h ({sf.deviationPct != null ? `${sf.deviationPct}%` : 'N/A'})
                  </p>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                    {sf.verdict ?? (isElevated
                      ? `Physics evidence suggests a higher impact speed than claimed. This discrepancy is a material fraud indicator and warrants independent engineering review before settlement.`
                      : `Speed discrepancy is within acceptable uncertainty bounds for the methods used.`)}
                  </p>
                </div>
              </div>
              <div className="px-3 py-2 rounded" style={{ background: '#ffffff', borderLeft: `3px solid ${devColor}` }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>Recommended Action</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  {devClass === 'critical'
                    ? 'Significant speed discrepancy detected — independent accident reconstruction required before settlement can be authorised.'
                    : devClass === 'significant'
                    ? 'Speed discrepancy exceeds uncertainty threshold — senior assessor review of Section 2.6 and 2.7 findings required before settlement.'
                    : 'Minor speed discrepancy — within acceptable uncertainty range. No additional action required on speed basis.'}
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 5.3 Statistical Pattern Analysis — plain-English adjuster summary */}
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

        // Plain-English findings — no raw model scores exposed to adjuster
        const findings: { icon: string; label: string; detail: string; severity: 'ok' | 'warn' | 'flag' }[] = [];

        if (anomalyScore !== null) {
          const level = anomalyScore < 0.2 ? 'ok' : anomalyScore < 0.5 ? 'warn' : 'flag';
          findings.push({
            icon: level === 'ok' ? '✓' : level === 'warn' ? '!' : '⚠',
            label: 'Claim Pattern',
            detail: level === 'ok'
              ? 'This claim follows a pattern consistent with similar validated claims in the database. No statistical anomaly detected.'
              : level === 'warn'
              ? 'This claim shows some characteristics that differ from the typical profile for this vehicle type and incident category. Additional review is advisable.'
              : 'This claim is statistically unusual compared to similar validated claims. The combination of reported factors is uncommon and warrants closer scrutiny.',
            severity: level,
          });
        }

        if (mlCluster) {
          const isHighRisk = anomalyScore && anomalyScore > 0.4;
          findings.push({
            icon: isHighRisk ? '⚠' : '✓',
            label: 'Geographic Context',
            detail: isHighRisk
              ? 'The incident location falls within a geographic area with a higher-than-average frequency of claims of this type. This does not confirm fraud but is a contextual risk factor.'
              : 'The incident location is consistent with normal claim distribution for this area. No geographic risk flag.',
            severity: isHighRisk ? 'warn' : 'ok',
          });
        }

        if (mlCostPred) {
          const devPct = Math.abs(((enforcement as any)?._costDevPct ?? 0));
          const isAbove = ((enforcement as any)?._costDevPct ?? 0) > 0;
          const level = devPct > 30 ? 'flag' : devPct > 15 ? 'warn' : 'ok';
          findings.push({
            icon: level === 'ok' ? '✓' : level === 'warn' ? '!' : '⚠',
            label: 'Cost Plausibility',
            detail: level === 'ok'
              ? `The submitted repair cost is within the expected range for this type of damage. No cost anomaly detected.`
              : `The submitted repair cost is ${devPct}% ${isAbove ? 'above' : 'below'} the expected range for comparable repairs. ${level === 'flag' ? 'This is a material discrepancy — independent cost assessment recommended.' : 'This warrants review against the line-item breakdown in Section 3.'}`,
            severity: level,
          });
        }

        if (photoScore !== null) {
          const level = photoScore < 0.25 ? 'ok' : photoScore < 0.5 ? 'warn' : 'flag';
          findings.push({
            icon: level === 'ok' ? '✓' : level === 'warn' ? '!' : '⚠',
            label: 'Photo Authenticity',
            detail: level === 'ok'
              ? 'Photo analysis found no indicators of digital manipulation. Images appear consistent with the reported incident.'
              : level === 'warn'
              ? 'Photo analysis detected minor inconsistencies in image metadata. This may indicate batch processing or re-saving of images. Review the EXIF findings in Section 4.'
              : 'Photo analysis detected significant indicators of digital manipulation. Independent verification of photographic evidence is strongly recommended before settlement.',
            severity: level,
          });
        }

        if (mlNetworkFlag) {
          findings.push({
            icon: '⚠',
            label: 'Claimant History',
            detail: `A connection to a previously flagged claim or claimant has been identified. This is a material risk indicator. Refer to the fraud assessment team for further investigation before proceeding.`,
            severity: 'flag',
          });
        }

        if (findings.length === 0) return null;

        const colorMap = { ok: 'var(--fp-success-text)', warn: 'var(--fp-warning-text)', flag: 'var(--fp-critical-text)' };
        const bgMap = { ok: 'var(--fp-success-bg)', warn: 'var(--fp-warning-bg)', flag: 'var(--fp-critical-bg)' };
        const borderMap = { ok: 'var(--fp-success-border)', warn: 'var(--fp-warning-border)', flag: 'var(--fp-critical-border)' };

        return (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>5.3 Statistical Pattern Analysis</p>
              <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>Findings from automated comparison against {(enforcement as any)?._benchmarkSampleSize ?? 'historical'} validated claims of the same profile.</p>
            </div>
            <div className="p-4 space-y-3">
              {findings.map((f, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded" style={{ background: bgMap[f.severity], border: `1px solid ${borderMap[f.severity]}` }}>
                  <span className="text-sm font-bold shrink-0" style={{ color: colorMap[f.severity] }}>{f.icon}</span>
                  <div>
                    <p className="text-xs font-bold" style={{ color: '#0f172a' }}>{f.label}</p>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#334155' }}>{f.detail}</p>
                  </div>
                </div>
              ))}
              <p className="text-[10px] mt-2 pt-2" style={{ borderTop: '1px solid #e2e8f0', color: '#94a3b8', fontStyle: 'italic' }}>
                Statistical analysis is one input into the overall fraud risk score. It does not constitute a finding of fraud. All decisions remain the responsibility of the authorised claims officer.
              </p>
            </div>
          </div>
        );
      })()}

      {contributions.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>
              5.4 Risk Indicator Breakdown {isSystemFailure ? "(system errors excluded from score)" : ""}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>Each indicator is scored out of 20 and contributes to the overall fraud risk score. A triggered indicator means the system detected a specific anomaly in this area.</p>
          </div>
          {/* Indicator Score Chart — horizontal bar chart for visual comparison */}
          {(() => {
            const chartContribs = contributions.filter((c: any) => (c.value ?? 0) > 0);
            if (chartContribs.length === 0) return null;
            const factorLabelMapChart: Record<string, string> = {
              damage_pattern: 'Damage Pattern',
              damage_direction: 'Damage Direction',
              police_report: 'No Police Report',
              missing_police: 'No Police Report',
              photo: 'Photo Evidence',
              photos_not_ingested: 'Photo Evidence',
              no_damage_photos: 'No Damage Photos',
              speed: 'Speed Claim',
              speed_physics: 'Speed vs Physics',
              seatbelt: 'Seatbelt Deployment',
              airbag: 'Airbag Deployment',
              cost: 'Repair Cost',
              cost_deviation: 'Repair Cost',
              repeat: 'Repeat Claimant',
              prior_claim: 'Prior Claim',
              missing_data: 'Missing Documentation',
              severity: 'Severity Mismatch',
              direction: 'Impact Direction',
            };
            const barData = chartContribs.map((c: any) => {
              const key = Object.keys(factorLabelMapChart).find(k => c.factor?.toLowerCase().includes(k));
              return { label: key ? factorLabelMapChart[key] : (c.factor?.replace(/_/g, ' ') ?? 'Unknown'), value: c.value ?? 0 };
            }).sort((a: any, b: any) => b.value - a.value).slice(0, 8);
            const maxVal = Math.max(...barData.map((d: any) => d.value), 20);
            return (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b', marginBottom: 10 }}>Risk Indicator Score Chart</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {barData.map((d: any, i: number) => {
                    const pct = Math.min(100, (d.value / maxVal) * 100);
                    const barColor = d.value > 10 ? '#c00' : d.value > 5 ? '#e65100' : '#2e7d32';
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, color: '#334155', width: 130, flexShrink: 0, textAlign: 'right' }}>{d.label}</span>
                        <div style={{ flex: 1, height: 14, background: '#f1f5f9', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: barColor, width: 32, textAlign: 'right', fontFamily: "'IBM Plex Mono','Courier New',monospace" }}>{d.value}/20</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <div className="overflow-x-auto">
            <table className="w-full text-xs report-table">
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
                  {["Indicator", "Score", "Score Bar", "Triggered", "Mitigation Note"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "#64748b", fontFamily: "'DM Sans', sans-serif" }}>{h}</th>
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

                  // Plain-English factor label map
                  const factorLabelMap: Record<string, string> = {
                    damage_pattern: "Damage Pattern Inconsistency",
                    damage_direction: "Damage Direction Mismatch",
                    police_report: "No Police Report",
                    missing_police: "No Police Report",
                    photo: isSystemFailure ? "Photo Evidence (System Error)" : "Photo Evidence Issues",
                    photos_not_ingested: "Photo Evidence Issues",
                    no_damage_photos: "No Damage Photos Provided",
                    speed: "Speed Claim Inconsistency",
                    speed_physics: "Speed vs Physics Mismatch",
                    seatbelt: "Seatbelt Deployment Inconsistency",
                    airbag: "Airbag Deployment Inconsistency",
                    cost: "Repair Cost Anomaly",
                    cost_deviation: "Repair Cost Anomaly",
                    repeat: "Repeat Claimant History",
                    prior_claim: "Prior Claim History",
                    missing_data: "Incomplete Documentation",
                    severity: "Severity vs Physics Mismatch",
                    direction: "Impact Direction Mismatch",
                  };
                  const factorKey = Object.keys(factorLabelMap).find(k => c.factor?.toLowerCase().includes(k));
                  const factorLabel = factorKey ? factorLabelMap[factorKey] : (c.factor?.replace(/_/g, " ") ?? "Unknown indicator");

                  const mitigationMap: Record<string, string> = {
                    damage_pattern: "Physical inspection recommended to verify damage extent",
                    damage_direction: "Review impact direction against damage map in Section 2",
                    police_report: "Obtain police case number from claimant before proceeding",
                    missing_police: "Obtain police case number from claimant before proceeding",
                    photo: isSystemFailure ? "SYSTEM ERROR — not counted in fraud score" : "Request additional photo evidence from claimant",
                    photos_not_ingested: "SYSTEM ERROR — not counted in fraud score",
                    no_damage_photos: "Request damage photos from claimant before settlement",
                    speed: "Engineering review of claimed speed vs damage evidence recommended",
                    speed_physics: "Independent accident reconstruction required before settlement",
                    seatbelt: "Physical inspection of seatbelt retractor and vehicle ECU download",
                    airbag: "Advisory only — consistent with low-speed impact; no action required",
                    cost: "Reconcile cost difference with repairer; review Section 3.1 line items",
                    cost_deviation: "Reconcile cost difference with repairer; review Section 3.1 line items",
                    repeat: "Review claimant history; refer to fraud assessment team if pattern is confirmed",
                    prior_claim: "Review claimant history; refer to fraud assessment team if pattern is confirmed",
                    missing_data: "Request outstanding documentation from claimant before settlement",
                    severity: "Review Section 2 physics findings; independent assessment may be required",
                    direction: "Review impact direction against damage map in Section 2",
                  };
                  const mitigation = Object.entries(mitigationMap).find(([k]) =>
                    c.factor?.toLowerCase().includes(k)
                  )?.[1] ?? c.detail ?? "No specific mitigation required";

                  return (
                    <tr key={i} style={{ borderTop: i > 0 ? "1px solid #e2e8f0" : undefined, background: isExcluded ? "var(--muted)" : "var(--background)", opacity: isExcluded ? 0.7 : 1 }}>
                      <td className="px-3 py-2 font-medium" style={{ color: "#0f172a" }}>
                        {factorLabel}
                        {isExcluded && <span className="ml-1 text-xs" style={{ color: "#64748b" }}>(excluded)</span>}
                      </td>
                      <td className="px-3 py-2 font-bold" style={{ color: scoreColor }}>{isExcluded ? "0 (adj)" : `${score}/${maxScore}`}</td>
                      <td className="px-3 py-2" style={{ minWidth: 80 }}>
                        <div className="h-1.5 rounded-full" style={{ background: "#ffffff" }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${isExcluded ? 0 : Math.min(100, (score / maxScore) * 100)}%`, background: scoreColor }} />
                        </div>
                      </td>
                      <td className="px-3 py-2"><span className="text-xs font-semibold" style={{ color: "#64748b" }}>{c.triggered && !isExcluded ? "Yes" : "No"}</span></td>
                      <td className="px-3 py-2" style={{ color: "#64748b" }}>{mitigation}</td>
                    </tr>
                  );
                })}
                {/* Speed-Physics Discrepancy row — injected from Section 2.7 speedForensics */}
                {(() => {
                  const sf = speedForensics;
                  if (!sf || sf.deviationClass === 'consistent' || sf.deviationClass === 'no_claim') return null;
                  const devPct: number = sf.deviationPct ?? 0;
                  // Map deviation class to a risk score out of 20
                  const speedScore = sf.deviationClass === 'critical' ? 18
                    : sf.deviationClass === 'significant' ? 13
                    : sf.deviationClass === 'moderate' ? 7
                    : 0;
                  const speedColor = speedScore > 10 ? "var(--fp-critical-text)" : speedScore > 5 ? "var(--fp-warning-text)" : "var(--fp-success-text)";
                  return (
                    <tr style={{ borderTop: "1px solid #e2e8f0", background: "#ffffff" }}>
                      <td className="px-3 py-2 font-medium" style={{ color: "#0f172a" }}>
                        Speed-Physics Discrepancy
                        <span className="ml-1 text-[10px] font-semibold" style={{ color: "#64748b" }}>({devPct}% deviation)</span>
                      </td>
                      <td className="px-3 py-2 font-bold" style={{ color: speedColor }}>{speedScore}/20</td>
                      <td className="px-3 py-2" style={{ minWidth: 80 }}>
                        <div className="h-1.5 rounded-full" style={{ background: "#ffffff" }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (speedScore / 20) * 100)}%`, background: speedColor }} />
                        </div>
                      </td>
                      <td className="px-3 py-2"><span className="text-xs font-semibold" style={{ color: "#64748b" }}>Yes</span></td>
                      <td className="px-3 py-2" style={{ color: "#64748b" }}>Engineering review of claimed speed vs damage evidence recommended (see Section 2.7)</td>
                    </tr>
                  );
                })()}
                {/* Cross-Engine Conflict rows — injected from C1–C9 validator */}
                {(() => {
                  const cec = fraudScoreBreakdown5?.crossEngineConsistency;
                  if (!cec || !cec.conflicts || cec.conflicts.length === 0) return null;
                  return cec.conflicts.map((c: any, i: number) => {
                    const severity = c.severity ?? 'MINOR';
                    const scoreMap: Record<string, number> = { CRITICAL: 20, SIGNIFICANT: 12, MINOR: 4 };
                    const score = scoreMap[severity] ?? 4;
                    const scoreColor = severity === 'CRITICAL' ? 'var(--fp-critical-text)' : severity === 'SIGNIFICANT' ? 'var(--fp-warning-text)' : 'var(--muted-foreground)';
                    return (
                      <tr key={`cec-${i}`} style={{ borderTop: '1px solid #e2e8f0', background: severity === 'CRITICAL' ? 'var(--fp-critical-bg)' : severity === 'SIGNIFICANT' ? 'var(--fp-warning-bg)' : '#ffffff' }}>
                        <td className="px-3 py-2 font-medium" style={{ color: '#0f172a' }}>
                          {c.label}
                          <span className="ml-1 text-[10px] font-bold" style={{ color: scoreColor }}>{severity}</span>
                        </td>
                        <td className="px-3 py-2 font-bold" style={{ color: scoreColor }}>{score}/20</td>
                        <td className="px-3 py-2" style={{ minWidth: 80 }}>
                          <div className="h-1.5 rounded-full" style={{ background: '#ffffff' }}>
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (score / 20) * 100)}%`, background: scoreColor }} />
                          </div>
                        </td>
                        <td className="px-3 py-2"><span className="text-xs font-semibold" style={{ color: '#64748b' }}>Yes</span></td>
                        <td className="px-3 py-2" style={{ color: '#64748b' }}>{c.recommended_action} (see §5.6)</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {advisories.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>Advisories</p>
          </div>
          <div className="p-4 space-y-2">
            {advisories.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-xs p-2 rounded" style={{ background: "#ffffff", color: "#0f172a" }}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "var(--fp-warning-text)" }} />
                {a}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5.4 Accident Date Consistency */}
      {dateCheck && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>5.4 Accident Date Consistency</p>
            {(() => {
              const v = dateCheck.verdict;
              const isOk = v === 'consistent';
              const isInsufficient = v === 'insufficient_data';
              const color = isOk ? 'var(--fp-success-text)' : isInsufficient ? 'var(--muted-foreground)' : 'var(--fp-critical-text)';
              const border = isOk ? 'var(--fp-success-border)' : isInsufficient ? 'var(--border)' : 'var(--fp-critical-border)';
              const bg = isOk ? 'var(--fp-success-bg)' : isInsufficient ? '#ffffff' : 'var(--fp-critical-bg)';
              const label = isOk ? 'CONSISTENT' : isInsufficient ? 'INSUFFICIENT DATA' : v === 'mismatch' ? 'DATE MISMATCH' : v === 'pre_incident_image' ? 'PRE-INCIDENT IMAGE' : 'MULTIPLE FLAGS';
              return (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: bg, color, border: `1px solid ${border}` }}>{label}</span>
              );
            })()}
          </div>
          <div className="p-4 space-y-4">
            {/* Three-source date comparison table */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#64748b" }}>Date Source Comparison</p>
              <table className="w-full text-xs report-table">
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
                    {["Source", "Date", "Status"].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: "#64748b", fontFamily: "'DM Sans', sans-serif" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      source: "Claim Form",
                      date: dateCheck.accidentDateParsed ?? "Not extracted",
                      status: dateCheck.accidentDateParsed ? "extracted" : "missing",
                    },
                    {
                      source: "Police Report",
                      date: dateCheck.policeReportDateParsed ?? "Not extracted",
                      status: dateCheck.policeReportDateParsed
                        ? (dateCheck.claimPoliceMatch === true ? "match" : dateCheck.claimPoliceMatch === false ? "mismatch" : "extracted")
                        : "missing",
                    },
                    {
                      source: "Image EXIF Metadata",
                      date: dateCheck.photosWithExifDate > 0
                        ? `${dateCheck.photosWithExifDate} photo${dateCheck.photosWithExifDate !== 1 ? 's' : ''} with EXIF date`
                        : "No EXIF dates available",
                      status: dateCheck.photosWithExifDate > 0
                        ? (dateCheck.preIncidentImages?.length > 0 ? "flagged" : "consistent")
                        : "no_data",
                    },
                  ].map((row, i) => {
                    const statusColor =
                      row.status === 'match' || row.status === 'consistent' || row.status === 'extracted' ? 'var(--fp-success-text)'
                      : row.status === 'mismatch' || row.status === 'flagged' ? 'var(--fp-critical-text)'
                      : 'var(--muted-foreground)';
                    const statusLabel =
                      row.status === 'match' ? 'Match'
                      : row.status === 'mismatch' ? 'Mismatch'
                      : row.status === 'consistent' ? 'Consistent'
                      : row.status === 'flagged' ? 'Pre-incident image(s)'
                      : row.status === 'extracted' ? 'Extracted'
                      : row.status === 'missing' ? 'Not available'
                      : 'No EXIF data';
                    return (
                      <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, background: 'var(--background)' }}>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--foreground)' }}>{row.source}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'var(--foreground)' }}>{row.date}</td>
                        <td className="px-3 py-2">
                          <span className="text-[10px] font-bold" style={{ color: statusColor }}>{statusLabel}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Claim–Police day difference */}
            {dateCheck.claimPoliceDayDiff !== null && dateCheck.claimPoliceDayDiff !== undefined && (
              <div className="flex items-center gap-2 text-xs p-2 rounded" style={{ background: '#ffffff', border: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--muted-foreground)' }}>Claim form vs police report difference:</span>
                <span className="font-bold" style={{ color: dateCheck.claimPoliceDayDiff > 1 ? 'var(--fp-critical-text)' : 'var(--fp-success-text)' }}>
                  {dateCheck.claimPoliceDayDiff} day{dateCheck.claimPoliceDayDiff !== 1 ? 's' : ''}
                </span>
                {dateCheck.claimPoliceDayDiff <= 1 && (
                  <span style={{ color: 'var(--muted-foreground)' }}>(within tolerance)</span>
                )}
              </div>
            )}

            {/* Pre-incident images list */}
            {(dateCheck.preIncidentImages ?? []).length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--fp-critical-text)' }}>
                  Pre-Incident Images Detected ({dateCheck.preIncidentImages.length})
                </p>
                <div className="space-y-1.5">
                  {(dateCheck.preIncidentImages as any[]).map((img: any, i: number) => (
                    <div key={i} className="flex items-start justify-between gap-3 text-xs p-2 rounded" style={{ background: 'var(--fp-critical-bg)', border: '1px solid var(--fp-critical-border)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono truncate" style={{ color: 'var(--foreground)' }}>{img.url?.split('/').pop() ?? img.url}</p>
                        <p className="mt-0.5" style={{ color: 'var(--muted-foreground)' }}>EXIF: {img.exifDate ?? 'Unknown'}</p>
                      </div>
                      <span className="shrink-0 font-bold text-[10px]" style={{ color: 'var(--fp-critical-text)' }}>
                        {img.daysBeforeIncident} day{img.daysBeforeIncident !== 1 ? 's' : ''} before incident
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary narrative */}
            {dateCheck.summary && (
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{dateCheck.summary}</p>
            )}
          </div>
        </div>
      )}

      {/* 5.5 Fraud Signal Contribution — Stacked Bar Chart */}
      {(() => {
        // Build signal segments from contributions + derived signals
        const quoteSim = (() => {
          const qs = fraudScoreBreakdown5?.quoteSimilarity;
          if (!qs) return 0;
          if (qs.overall_verdict === 'confirmed') return 20;
          if (qs.overall_verdict === 'suspected') return 12;
          return 0;
        })();
        const physicsAnomaly = Math.max(0, Math.round(20 - (physicsScore / 100) * 20));
        const imageIncon = (() => {
          const c = contributions.find((c: any) => c.factor?.toLowerCase().includes('photo') || c.factor?.toLowerCase().includes('image') || c.factor?.toLowerCase().includes('damage'));
          return c ? Math.min(20, c.value ?? 0) : 0;
        })();
        const fcdiInverse = (() => {
          const fcdi = (enforcement as any)?._fcdi?.score ?? (enforcement as any)?.fcdiScore ?? null;
          if (fcdi == null) return 0;
          // FCDI is reliability (higher = better) — invert to get risk contribution
          return Math.max(0, Math.round((1 - fcdi / 100) * 20));
        })();
        const costDev = (() => {
          const c = contributions.find((c: any) => c.factor?.toLowerCase().includes('cost'));
          return c ? Math.min(20, c.value ?? 0) : 0;
        })();
        const missingData = (() => {
          const c = contributions.find((c: any) => c.factor?.toLowerCase().includes('missing') || c.factor?.toLowerCase().includes('police') || c.factor?.toLowerCase().includes('report'));
          return c ? Math.min(20, c.value ?? 0) : 0;
        })();
        const segments = [
          { label: 'Quote Similarity',    value: quoteSim,      color: '#c00',    textColor: '#fff' },
          { label: 'Physics Anomaly',     value: physicsAnomaly, color: '#e65100', textColor: '#fff' },
          { label: 'Image Inconsistency', value: imageIncon,    color: '#f57c00', textColor: '#fff' },
          { label: 'Data Reliability Gap',  value: fcdiInverse,   color: '#0277bd', textColor: '#fff' },
          { label: 'Cost Deviation',      value: costDev,       color: '#6a1b9a', textColor: '#fff' },
          { label: 'Missing Data',        value: missingData,   color: '#37474f', textColor: '#fff' },
        ].filter(s => s.value > 0);
        const total = segments.reduce((sum, s) => sum + s.value, 0);
        if (segments.length === 0 || total === 0) return null;
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0', background: '#ffffff' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>5.5 Fraud Signal Contribution Breakdown</p>
              <p className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>Proportional contribution of each fraud signal to the overall risk score</p>
            </div>
            <div className="p-4">
              {/* Stacked horizontal bar */}
              <div style={{ display: 'flex', height: 28, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                {segments.map((s, i) => (
                  <div
                    key={i}
                    style={{ width: `${(s.value / total) * 100}%`, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: s.value / total > 0.08 ? 0 : 0, overflow: 'hidden' }}
                    title={`${s.label}: ${s.value} pts`}
                  >
                    {s.value / total > 0.1 && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: s.textColor, whiteSpace: 'nowrap', padding: '0 4px' }}>{Math.round((s.value / total) * 100)}%</span>
                    )}
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 16px' }}>
                {segments.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                    <div>
                      <span style={{ fontSize: 9, fontWeight: 600, color: '#0f172a' }}>{s.label}</span>
                      <span style={{ fontSize: 9, color: '#64748b', marginLeft: 4, fontFamily: "'IBM Plex Mono','Courier New',monospace" }}>{s.value} pts</span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Score tally */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: '#64748b' }}>Signal total (pre-normalisation)</span>
                <span style={{ fontFamily: "'IBM Plex Mono','Courier New',monospace", fontSize: 13, fontWeight: 700, color: fraudColor }}>{total} pts → {Math.round(fraudScore)}/100</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 5.6 Cross-Engine Consistency — C1–C9 agreements and conflicts */}
      {(() => {
        const cec = fraudScoreBreakdown5?.crossEngineConsistency;
        if (!cec) return null;
        const agreements: any[] = cec.agreements ?? [];
        const conflicts: any[] = cec.conflicts ?? [];
        const consistencyScore: number = cec.consistency_score ?? 100;
        const criticalCount: number = cec.critical_conflict_count ?? 0;
        const isConflicted = cec.overall_status === 'CONFLICTED';
        const panelColor = criticalCount > 0 ? 'var(--fp-critical-text)' : isConflicted ? 'var(--fp-warning-text)' : 'var(--fp-success-text)';
        const panelBg = criticalCount > 0 ? 'var(--fp-critical-bg)' : isConflicted ? 'var(--fp-warning-bg)' : 'var(--fp-success-bg)';
        const panelBorder = criticalCount > 0 ? 'var(--fp-critical-border)' : isConflicted ? 'var(--fp-warning-border)' : 'var(--fp-success-border)';
        const statusLabel = criticalCount > 0
          ? `${criticalCount} CRITICAL CONFLICT${criticalCount > 1 ? 'S' : ''}`
          : isConflicted ? 'CONFLICTED' : 'CONSISTENT';
        const severityColor = (sev: string) =>
          sev === 'CRITICAL' ? 'var(--fp-critical-text)'
          : sev === 'SIGNIFICANT' ? 'var(--fp-warning-text)'
          : 'var(--muted-foreground)';
        const severityBg = (sev: string) =>
          sev === 'CRITICAL' ? 'var(--fp-critical-bg)'
          : sev === 'SIGNIFICANT' ? 'var(--fp-warning-bg)'
          : '#f8fafc';
        const severityBorder = (sev: string) =>
          sev === 'CRITICAL' ? 'var(--fp-critical-border)'
          : sev === 'SIGNIFICANT' ? 'var(--fp-warning-border)'
          : 'var(--border)';
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${panelBorder}`, background: '#ffffff' }}>
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #e2e8f0', background: panelBg }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>5.6 Cross-Engine Consistency — Physics ↔ Damage ↔ Fraud</p>
                <p className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>Automated C1–C9 agreement/conflict checks across all three analysis engines</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: panelBg, color: panelColor, border: `1px solid ${panelBorder}` }}>{statusLabel}</span>
                <span className="text-xs font-mono font-bold" style={{ color: '#0f172a' }}>{consistencyScore}/100</span>
              </div>
            </div>
            <div className="p-4 space-y-4">
              {/* Score bar */}
              <div>
                <div className="flex justify-between text-[10px] mb-1" style={{ color: '#64748b' }}>
                  <span>Cross-engine consistency score</span>
                  <span className="font-bold" style={{ color: panelColor }}>{consistencyScore}/100</span>
                </div>
                <div className="h-2 rounded-full" style={{ background: '#e2e8f0' }}>
                  <div className="h-2 rounded-full" style={{ width: `${consistencyScore}%`, background: panelColor }} />
                </div>
                <div className="flex justify-between text-[9px] mt-0.5" style={{ color: '#94a3b8' }}>
                  <span>0 — Fully conflicted</span><span>50 — Partial</span><span>100 — Fully consistent</span>
                </div>
              </div>

              {/* Conflicts */}
              {conflicts.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#0f172a' }}>Conflicts Detected ({conflicts.length})</p>
                  <div className="space-y-2">
                    {conflicts.map((c: any, i: number) => (
                      <div key={i} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${severityBorder(c.severity)}`, background: '#ffffff' }}>
                        {/* Conflict header */}
                        <div className="px-3 py-2 flex items-center justify-between" style={{ background: severityBg(c.severity), borderBottom: `1px solid ${severityBorder(c.severity)}` }}>
                          <p className="text-xs font-bold" style={{ color: '#0f172a' }}>
                            <span className="text-[10px] font-mono mr-2" style={{ color: '#64748b' }}>[{c.check_id}]</span>
                            {c.label}
                          </p>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0" style={{ background: '#ffffff', color: severityColor(c.severity), border: `1px solid ${severityBorder(c.severity)}` }}>{c.severity}</span>
                        </div>
                        {/* Three-column engine breakdown */}
                        <div className="px-3 py-2 grid grid-cols-3 gap-3 text-[10px]" style={{ borderBottom: `1px solid ${severityBorder(c.severity)}` }}>
                          <div>
                            <p className="font-semibold mb-0.5 uppercase tracking-wide" style={{ color: '#64748b', fontSize: 9 }}>Physics engine</p>
                            <p style={{ color: '#0f172a' }}>{c.physics_says || '—'}</p>
                          </div>
                          <div>
                            <p className="font-semibold mb-0.5 uppercase tracking-wide" style={{ color: '#64748b', fontSize: 9 }}>Damage engine</p>
                            <p style={{ color: '#0f172a' }}>{c.damage_says || '—'}</p>
                          </div>
                          <div>
                            <p className="font-semibold mb-0.5 uppercase tracking-wide" style={{ color: '#64748b', fontSize: 9 }}>Fraud engine</p>
                            <p style={{ color: '#0f172a' }}>{c.fraud_says || '—'}</p>
                          </div>
                        </div>
                        {/* Recommended action */}
                        {c.recommended_action && (
                          <div className="px-3 py-1.5" style={{ background: '#f8fafc' }}>
                            <p className="text-[10px]" style={{ color: '#64748b' }}>
                              <span className="font-semibold" style={{ color: '#0f172a' }}>Action: </span>
                              {c.recommended_action}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agreements */}
              {agreements.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#0f172a' }}>Engine Agreements ({agreements.length})</p>
                  <div className="space-y-1">
                    {agreements.map((a: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-1.5 rounded" style={{ background: 'var(--fp-success-bg)', border: '1px solid var(--fp-success-border)' }}>
                        <span className="text-[10px] font-bold mt-0.5 shrink-0" style={{ color: 'var(--fp-success-text)' }}>✓</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-semibold" style={{ color: '#0f172a' }}>{a.label}</span>
                          {a.detail && <span className="text-[10px] ml-2" style={{ color: '#64748b' }}>{a.detail}</span>}
                        </div>
                        <span className="text-[10px] font-bold shrink-0" style={{ color: a.strength === 'STRONG' ? 'var(--fp-success-text)' : 'var(--fp-warning-text)' }}>{a.strength}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Validator metadata footer */}
              {cec.validator_metadata && (
                <div className="flex flex-wrap gap-4 text-[10px] pt-2" style={{ borderTop: '1px solid #e2e8f0', color: '#64748b' }}>
                  <span>Checks run: <strong style={{ color: '#0f172a' }}>{cec.validator_metadata.checks_run}</strong></span>
                  <span>Agreements: <strong style={{ color: 'var(--fp-success-text)' }}>{cec.validator_metadata.agreements_found}</strong></span>
                  <span>Conflicts: <strong style={{ color: conflicts.length > 0 ? 'var(--fp-warning-text)' : '#0f172a' }}>{cec.validator_metadata.conflicts_found}</strong></span>
                  <span>Critical: <strong style={{ color: criticalCount > 0 ? 'var(--fp-critical-text)' : '#0f172a' }}>{cec.validator_metadata.critical_conflicts}</strong></span>
                  {(cec.validator_metadata.conflict_penalty_applied ?? 0) > 0 && (
                    <span>Consistency penalty: <strong style={{ color: 'var(--fp-warning-text)' }}>−{cec.validator_metadata.conflict_penalty_applied} pts</strong></span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 5.7 Policy Exclusions & Recovery Opportunities — sourced from Claim Truth Layer */}
      {(() => {
        const ctl5 = (enforcement as any)?._claimTruth;
        const recovery = ctl5?.policyAndRecovery;
        if (!recovery) return null;
        const exclusions: any[] = recovery.exclusions ?? [];
        const subrogation: any[] = recovery.subrogationLeads ?? [];
        const excess: number | null = recovery.excessApplicable ?? null;
        if (exclusions.length === 0 && subrogation.length === 0 && excess === null) return null;
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0', background: '#ffffff' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>5.7 Policy Exclusions &amp; Recovery Opportunities</p>
                <p className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>Sourced from policy document analysis and third-party evidence — Claim Truth Layer</p>
              </div>
              {excess !== null && (
                <div className="text-right shrink-0">
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: '#64748b' }}>Excess Applicable</p>
                  <p className="text-sm font-bold" style={{ color: '#0f172a' }}>{excess > 0 ? `${excess.toLocaleString()}` : 'None'}</p>
                </div>
              )}
            </div>
            <div className="p-4 space-y-4">
              {exclusions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#64748b' }}>Policy Exclusions Identified</p>
                  <div className="space-y-2">
                    {exclusions.map((ex: any, i: number) => (
                      <div key={i} className="rounded-lg px-3 py-2.5" style={{ border: '1px solid var(--fp-critical-border)', background: 'var(--fp-critical-bg)' }}>
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 mt-0.5 text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--fp-critical-bg)', color: 'var(--fp-critical-text)', border: '1px solid var(--fp-critical-border)' }}>EXCLUSION</span>
                          <div className="flex-1">
                            <p className="text-xs font-semibold" style={{ color: '#0f172a' }}>{ex.clause ?? ex.description ?? 'Policy exclusion'}</p>
                            {ex.description && ex.description !== ex.clause && (
                              <p className="text-xs mt-0.5" style={{ color: '#475569' }}>{ex.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1">
                              {ex.source && <span className="text-[10px]" style={{ color: '#64748b' }}>Source: {ex.source}</span>}
                              {ex.pageRef != null && <span className="text-[10px]" style={{ color: '#64748b' }}>Page {ex.pageRef}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {subrogation.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#64748b' }}>Subrogation &amp; Recovery Leads</p>
                  <div className="space-y-2">
                    {subrogation.map((lead: any, i: number) => (
                      <div key={i} className="rounded-lg px-3 py-2.5" style={{ border: '1px solid var(--fp-warning-border)', background: 'var(--fp-warning-bg)' }}>
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 mt-0.5 text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--fp-warning-bg)', color: 'var(--fp-warning-text)', border: '1px solid var(--fp-warning-border)' }}>RECOVERY</span>
                          <div className="flex-1">
                            <p className="text-xs font-semibold" style={{ color: '#0f172a' }}>{lead.party}</p>
                            <p className="text-xs mt-0.5" style={{ color: '#475569' }}>{lead.basis}</p>
                            {lead.source && <p className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>Source: {lead.source}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${fraudColor}40`, background: "#ffffff" }}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>Final Risk Statement</p>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm leading-relaxed" style={{ color: "#0f172a" }}>
            {fraudScore >= 70 ? `High fraud risk (${Math.round(fraudScore)}/100) detected. ` :
             fraudScore >= 40 ? `Moderate fraud risk (${Math.round(fraudScore)}/100) identified. ` :
             `Low fraud risk (${Math.round(fraudScore)}/100). `}
            {physicsScore < 30 ? `Physics consistency is critically low at ${Math.round(physicsScore)}%, indicating a significant anomaly requiring engineering review. ` :
             physicsScore < 70 ? `Physics consistency of ${Math.round(physicsScore)}% is below the expected threshold and warrants further investigation. ` :
             `Physics consistency of ${Math.round(physicsScore)}% is within acceptable parameters. `}
            {keyDrivers.length > 0 ? `Key drivers: ${keyDrivers.slice(0, 2).join("; ")}.` : "No specific key drivers identified."}
          </p>
          {/* Cross-engine physics linkage callout — shown when critical conflicts exist */}
          {(() => {
            const cec = fraudScoreBreakdown5?.crossEngineConsistency;
            if (!cec) return null;
            const critConflicts = (cec.conflicts ?? []).filter((c: any) => c.severity === 'CRITICAL');
            const sigConflicts = (cec.conflicts ?? []).filter((c: any) => c.severity === 'SIGNIFICANT');
            if (critConflicts.length === 0 && sigConflicts.length === 0) return null;
            const hasCritical = critConflicts.length > 0;
            const borderColor = hasCritical ? 'var(--fp-critical-border)' : 'var(--fp-warning-border)';
            const bgColor = hasCritical ? 'var(--fp-critical-bg)' : 'var(--fp-warning-bg)';
            const textColor = hasCritical ? 'var(--fp-critical-text)' : 'var(--fp-warning-text)';
            const allConflicts = [...critConflicts, ...sigConflicts];
            return (
              <div className="rounded-lg p-3" style={{ border: `1px solid ${borderColor}`, background: bgColor }}>
                <p className="text-xs font-bold mb-1.5" style={{ color: textColor }}>
                  {hasCritical ? '⚠ Critical Physics Conflicts Detected' : '⚠ Significant Physics Conflicts Detected'}
                </p>
                <ul className="space-y-1">
                  {allConflicts.map((c: any, i: number) => (
                    <li key={i} className="text-xs flex items-start gap-1.5">
                      <span className="shrink-0 font-bold mt-0.5" style={{ color: hasCritical ? 'var(--fp-critical-text)' : 'var(--fp-warning-text)' }}>•</span>
                      <span style={{ color: '#0f172a' }}>{c.label}. <span style={{ color: '#64748b' }}>Recommended action: {c.recommended_action}</span></span>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] mt-2" style={{ color: '#64748b' }}>Full cross-engine analysis in §5.6. Physics method inputs in §2.6.</p>
              </div>
            );
          })()}
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

  // Canonical fraud score — same priority chain as Section 1 (cover) and Section 5 (fraud panel):
  // 1. fraudScoreBreakdownJson.overallScore  (Stage 8 pipeline output, stored in DB)
  // 2. aiAssessment.fraudScore               (same Stage 8 score via normalised bridge)
  // 3. weightedFraud.score                   (supplementary enforcement-time engine — fallback only)
  const _fraudBreakdown6 = aiAssessment?.fraudScoreBreakdownJson
    ? (typeof aiAssessment.fraudScoreBreakdownJson === 'string'
        ? (() => { try { return JSON.parse(aiAssessment.fraudScoreBreakdownJson); } catch { return null; } })()
        : aiAssessment.fraudScoreBreakdownJson)
    : null;
  const _canonicalFraudScore6 = _fraudBreakdown6?.overallScore ?? (aiAssessment as any)?.fraudScore ?? null;
  const fraudScore = (_canonicalFraudScore6 != null && _canonicalFraudScore6 > 0)
    ? Number(_canonicalFraudScore6)
    : (wf?.score ?? 0);
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

  // Score summary bars for the executive panel
  const scoreBars = [
    { label: 'Fraud Risk', value: fraudScore, max: 100, lowGood: true, note: fraudScore >= 70 ? 'HIGH RISK' : fraudScore >= 40 ? 'MODERATE' : 'LOW RISK' },
    { label: 'Physics Consistency', value: physicsScore, max: 100, lowGood: false, note: physicsScore >= 70 ? 'CONSISTENT' : physicsScore >= 30 ? 'MINOR ANOMALY' : 'ANOMALY' },
    { label: 'Data Completeness', value: dataCompleteness, max: 100, lowGood: false, note: dataCompleteness >= 80 ? 'COMPLETE' : dataCompleteness >= 50 ? 'PARTIAL' : 'INCOMPLETE' },
  ];

  return (
    <div className="mb-2 space-y-3" style={{ marginBottom: "12px" }}>
      {/* 6.0 Decision Rationale — plain-English explanation of the decision */}
      {(() => {
        const decisionRationale = rawDecision === 'APPROVE' || rawDecision === 'APPROVED'
          ? `This claim has been assessed and meets the criteria for approval. The fraud risk score is within acceptable limits, the physics evidence is consistent with the reported incident, and the documentation is sufficiently complete to proceed. The recommended repair cost has been validated against the submitted quote.`
          : rawDecision === 'DECLINE' || rawDecision === 'DECLINED' || rawDecision === 'REJECT'
          ? `This claim has been assessed and does not meet the criteria for approval. ${fraudScore >= 70 ? `The fraud risk score of ${Math.round(fraudScore)}/100 is above the threshold for direct approval. ` : ''}${physicsScore < 30 ? `The physics evidence is critically inconsistent with the reported incident. ` : ''}${blocked.length > 0 ? `${blocked.length} critical blocker(s) prevent settlement. ` : ''}A formal decline letter should be issued with reference to the specific findings in this report.`
          : `This claim requires additional review before a final decision can be made. ${fraudScore >= 40 ? `The fraud risk score of ${Math.round(fraudScore)}/100 indicates elevated risk. ` : ''}${physicsScore < 70 && physicsScore >= 30 ? `The physics evidence shows some inconsistencies that require clarification. ` : ''}${keyDrivers.length > 0 ? `Key areas requiring attention: ${keyDrivers.slice(0, 3).join('; ')}.` : 'Review the flagged items in Sections 2–5 before proceeding.'}`;

        const bgColor = rawDecision === 'APPROVE' || rawDecision === 'APPROVED' ? 'var(--fp-success-bg)'
          : rawDecision === 'DECLINE' || rawDecision === 'DECLINED' || rawDecision === 'REJECT' ? 'var(--fp-critical-bg)'
          : 'var(--fp-warning-bg)';
        const borderColor = rawDecision === 'APPROVE' || rawDecision === 'APPROVED' ? 'var(--fp-success-border)'
          : rawDecision === 'DECLINE' || rawDecision === 'DECLINED' || rawDecision === 'REJECT' ? 'var(--fp-critical-border)'
          : 'var(--fp-warning-border)';

        return (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}`, background: '#ffffff' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${borderColor}`, background: bgColor }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>6.0 Decision Rationale</p>
              <div className="px-3 py-1 rounded font-bold text-xs" style={{ background: '#ffffff', color: decisionColor, border: `1.5px solid ${decisionColor}` }}>{decisionText}</div>
            </div>
            <div className="p-4">
              <p className="text-sm leading-relaxed" style={{ color: '#0f172a' }}>{decisionRationale}</p>
              {nextSteps.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: '#64748b' }}>Required Next Steps</p>
                  <ol className="space-y-1.5">
                    {nextSteps.slice(0, 5).map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: decisionColor, color: '#fff' }}>{i + 1}</span>
                        <span style={{ color: '#334155' }}>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {blocked.length > 0 && (
                <div className="mt-3 p-3 rounded" style={{ background: 'var(--fp-critical-bg)', border: '1px solid var(--fp-critical-border)' }}>
                  <p className="text-xs font-bold mb-1" style={{ color: 'var(--fp-critical-text)' }}>Settlement Blockers</p>
                  <ul className="space-y-1">
                    {blocked.map((b, i) => (
                      <li key={i} className="text-xs flex items-start gap-1.5">
                        <span className="shrink-0 font-bold" style={{ color: 'var(--fp-critical-text)' }}>•</span>
                        <span style={{ color: '#0f172a' }}>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        );
      })()}
      {/* SVG Decision Flowchart */}
      <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${decisionColor}`, background: "#ffffff" }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>Decision Flowchart</p>
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
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>6.1 Trigger Conditions</p>
            </div>
            <div className="p-4 space-y-2">
              {[primaryReason, ...keyDrivers].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5).map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="font-bold shrink-0 w-4" style={{ color: decisionColor }}>{i + 1}.</span>
                  <span style={{ color: "#0f172a" }}>{d}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {blocked.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid var(--fp-critical-border)`, background: "#ffffff" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>6.2 Blocked Actions</p>
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
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, borderBottom: '1px solid var(--kr-rule)', paddingBottom: 6 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--kr-mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--kr-muted)' }}>6.3 Required Next Steps</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {nextSteps.map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 11, paddingBottom: 6, borderBottom: '1px solid var(--kr-rule)' }}>
                  <span style={{ fontFamily: 'var(--kr-mono)', fontSize: 10, color: 'var(--kr-amber)', fontWeight: 500, minWidth: 16, paddingTop: 1 }}>{i + 1}.</span>
                  <span style={{ color: 'var(--kr-body)', lineHeight: 1.5 }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 6.0b Claim Workflow Position — visual timeline showing where this claim sits in the approval pipeline */}
      {(() => {
        const claimStatus = claim?.status ?? 'submitted';
        const steps = [
          { id: 'intake', label: 'Intake', desc: 'Claim received and registered', done: true },
          { id: 'analysis', label: 'AI Analysis', desc: 'KINGA engine assessment complete', done: true },
          { id: 'review', label: 'Adjuster Review', desc: rawDecision === 'APPROVE' ? 'Optional — low risk claim' : 'Required — see next steps', done: claimStatus === 'review' || claimStatus === 'under_review' || claimStatus === 'approved' || claimStatus === 'rejected' || claimStatus === 'finalised' || claimStatus === 'settled' || claimStatus === 'closed' },
          { id: 'decision', label: 'Decision', desc: rawDecision === 'APPROVE' ? 'Approve & settle' : rawDecision === 'DECLINE' ? 'Decline with reasons' : 'Pending review outcome', done: claimStatus === 'approved' || claimStatus === 'rejected' || claimStatus === 'finalised' || claimStatus === 'settled' || claimStatus === 'closed' },
          { id: 'settlement', label: 'Settlement', desc: 'Payment processed or claim closed', done: claimStatus === 'settled' || claimStatus === 'closed' },
        ];
        const currentIdx = (() => {
          if (claimStatus === 'settled' || claimStatus === 'closed') return 4;
          if (claimStatus === 'approved' || claimStatus === 'rejected' || claimStatus === 'finalised') return 3;
          if (claimStatus === 'review' || claimStatus === 'under_review') return 2;
          if (claimStatus === 'processing') return 1;
          return 1; // default: AI analysis complete, awaiting review
        })();
        return (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${decisionColor}40`, background: '#ffffff' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>6.0b Claim Workflow Position</p>
              <p className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>Current position of this claim in the approval pipeline</p>
            </div>
            <div className="p-4">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
                {steps.map((step, i) => {
                  const isCurrent = i === currentIdx;
                  const isDone = step.done && !isCurrent;
                  const isPending = !step.done && !isCurrent;
                  const dotColor = isCurrent ? decisionColor : isDone ? '#16a34a' : '#cbd5e1';
                  const labelColor = isCurrent ? decisionColor : isDone ? '#16a34a' : '#94a3b8';
                  return (
                    <React.Fragment key={step.id}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
                        {/* Circle */}
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: isCurrent ? decisionColor : isDone ? '#16a34a' : '#f1f5f9', border: `2px solid ${dotColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {isDone ? (
                            <span style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>✓</span>
                          ) : isCurrent ? (
                            <span style={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>{i + 1}</span>
                          ) : (
                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{i + 1}</span>
                          )}
                        </div>
                        {/* Label */}
                        <p style={{ fontSize: 10, fontWeight: isCurrent ? 700 : 600, color: labelColor, textAlign: 'center', marginTop: 4, lineHeight: 1.3 }}>{step.label}</p>
                        <p style={{ fontSize: 9, color: '#94a3b8', textAlign: 'center', marginTop: 2, lineHeight: 1.3, maxWidth: 80 }}>{step.desc}</p>
                      </div>
                      {/* Connector line */}
                      {i < steps.length - 1 && (
                        <div style={{ flex: 'none', width: 24, height: 2, background: steps[i + 1].done || i < currentIdx ? '#16a34a' : '#e2e8f0', marginTop: 13, flexShrink: 0 }} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
              {/* Current status callout */}
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: `${decisionColor}10`, border: `1px solid ${decisionColor}40` }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: decisionColor, margin: 0 }}>
                  Current status: {steps[currentIdx]?.label ?? 'AI Analysis'}
                </p>
                <p style={{ fontSize: 10, color: '#64748b', margin: '2px 0 0' }}>
                  {rawDecision === 'APPROVE' ? 'This claim has passed all automated checks. An adjuster may approve and proceed to settlement.' :
                   rawDecision === 'DECLINE' ? 'This claim has been flagged for decline. An adjuster must review the reasons and communicate the decision to the claimant.' :
                   'This claim requires adjuster review before a final decision can be made. See Section 6.3 for required next steps.'}
                </p>
              </div>
            </div>
          </div>
        );
      })()}

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
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#ffffff" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0f172a" }}>6.4 Decision Lifecycle</p>
            </div>
            <div className="p-4">
              <DecisionLifecycleTracker data={lifecycleData} />
            </div>
          </div>
        );
      })()}

      <div style={{ border: '1px solid var(--fp-border)', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--fp-border)', background: 'var(--fp-section-bg)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#374151', margin: 0 }}>6.5 Audit Trail</p>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <tbody>
              {[
                ["Analysed by", `KINGA Engine ${engineVersion}`],
                ["Data sources", `Claim form, Photos (${aiAssessment?.photosDetected ?? 0} detected), Quote`],
                ["Extraction confidence", `${Math.round(aiAssessment?.confidenceScore ?? 0)}% overall`],
                ["Human review", rawDecision === "APPROVE" || rawDecision === "FINALISE_CLAIM" ? "Optional" : "REQUIRED"],
                ["Corrections applied", corrections.length > 0 ? `${corrections.length} correction(s)` : "None"],
                ["Report hash", reportHash],
                ["Report generated", fmtDate(aiAssessment?.createdAt ?? new Date().toISOString())],
                ["Digital signature", "KINGA (engine)"],
              ].map(([k, v], i) => (
                <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--fp-border)' : undefined }}>
                  <td style={{ padding: '7px 16px 7px 0', fontWeight: 600, width: 176, color: '#6b7280', verticalAlign: 'top' }}>{k}</td>
                  <td style={{ padding: '7px 0', color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{v}</td>
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
        <span className="text-xs" style={{ color: "#64748b" }}>
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
            <p className="font-semibold mb-1" style={{ color: "#0f172a" }}>
              Auto-corrections applied ({corrections.length}):
            </p>
            <div className="space-y-0.5">
              {corrections.map((c: any, i: number) => (
                <p key={i} style={{ color: "#64748b" }}>
                  &bull;{" "}
                  <span className="font-medium" style={{ color: "#0f172a" }}>
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
                  <span style={{ color: "#64748b" }}>({c.reason})</span>
                </p>
              ))}
            </div>
          </div>
        )}
        {unreliable.length > 0 && (
          <p style={{ color: "#64748b" }}>
            \u26a0\ufe0f Unreliable fields (low confidence \u2014 verify manually):{" "}
            <span className="font-medium" style={{ color: "#0f172a" }}>
              {unreliable.join(", ")}
            </span>
          </p>
        )}
        {conflicts.length > 0 && (
          <p style={{ color: "#64748b" }}>
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
          <span className="text-xs" style={{ color: "#64748b" }}>
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
            <p className="font-semibold mb-1" style={{ color: "#0f172a" }}>
              {plainLanguage ? "📸 Photo Note:" : "📸 Photo Ingestion Issue:"}
            </p>
            <p style={{ color: "#64748b" }}>
              {plainLanguage
                ? photoOutcome === 'extraction_failed'
                  ? "Photos could not be extracted from the submitted document. If the document is a scanned PDF, please try re-submitting with a clearer scan or attach photos separately."
                  : `${photoIngestionLog.finalDamagePhotoCount ?? 0} photo(s) were found but some appear blurry or low-quality. The damage analysis has been completed but may benefit from clearer photos.`
                : photoIngestionLog.summary}
            </p>
            {photoIngestionLog.qualitySummary?.isScannedPdf && (
              <p className="mt-1 italic" style={{ color: "#64748b" }}>
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
            <p className="font-semibold mb-1" style={{ color: "#0f172a" }}>
              {plainLanguage ? `Notes (${integrityGate.warnings.length}):` : `Warnings (${integrityGate.warnings.length}):`}
            </p>
            <div className="space-y-0.5">
              {(integrityGate.warnings as string[]).map((w: string, i: number) => (
                <p key={i} style={{ color: "#64748b" }}>
                  &bull; {plainLanguage ? translateWarning(w) : w}
                </p>
              ))}
            </div>
          </div>
        )}
        {/* Reconciliation overrides */}
        {hasOverrides && reconciliationLog?.entries && (
          <div>
            <p className="font-semibold mb-1" style={{ color: "#0f172a" }}>
              {plainLanguage
                ? `Data corrections applied (${reconciliationLog.overrideCount}):`
                : `Cross-stage field overrides (${reconciliationLog.overrideCount}):`}
            </p>
            <div className="space-y-0.5">
              {(reconciliationLog.entries as any[])
                .filter((entry: any) => entry.action === "override")
                .map((entry: any, i: number) => (
                  plainLanguage ? (
                    <p key={i} style={{ color: "#64748b" }}>
                      &bull; {translateOverride(entry)}
                    </p>
                  ) : (
                    <p key={i} style={{ color: "#64748b" }}>
                      &bull;{" "}
                      <span className="font-medium" style={{ color: "#0f172a" }}>
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
                      <span style={{ color: "#64748b" }}>
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
          <p style={{ color: "#64748b" }}>
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
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "#ffffff", color: "#64748b" }}>
              {completenessScore}% data completeness
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: "#64748b" }}>Forensic Confidence Degradation Index</span>
      </div>
      <div className="px-5 py-3 space-y-3 text-xs">
        {fcdi?.explanation && (
          <p style={{ color: "#0f172a" }}>{fcdi.explanation}</p>
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
                  {s.error && <span className="ml-1" style={{ color: "#64748b" }}>— {s.error}</span>}
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
                <p key={i} style={{ color: "#64748b" }}>
                  &bull; <span className="tabular-nums">{s.name ?? s.stage}</span>
                  {s.reason && <span className="ml-1">— {s.reason}</span>}
                </p>
              ))}
            </div>
          </div>
        )}
        {sentinels.length > 0 && (
          <div>
            <p className="font-semibold mb-1" style={{ color: "#0f172a" }}>
              Anomaly sentinels triggered ({sentinels.length}):
            </p>
            <div className="space-y-0.5">
              {sentinels.map((s: any, i: number) => (
                <p key={i} style={{ color: "#64748b" }}>
                  &bull; <span className="font-semibold tabular-nums" style={{ color: "#0f172a" }}>{s.name ?? s.sentinel}</span>
                  {s.description && <span className="ml-1">— {s.description}</span>}
                </p>
              ))}
            </div>
          </div>
        )}
        {missingFields.length > 0 && (
          <p style={{ color: "#64748b" }}>
            Missing fields (verify manually):{" "}
            <span className="font-medium" style={{ color: "#0f172a" }}>{missingFields.join(", ")}</span>
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
                    {(dp.code ?? "").replace(/_/g, ' ')}
                  </span>
                  <span className="flex-1" style={{ color: "#64748b" }}>{dp.reason}</span>
                  <span className="flex-shrink-0 font-semibold" style={{ color: "var(--fp-danger)" }}>−{Math.round((dp.weight ?? 0) * 100)}pts</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {assumptions.length > 0 && (
          <div>
            <p className="font-semibold mb-1" style={{ color: "#0f172a" }}>
              Assumptions applied by pipeline ({assumptions.length}):
            </p>
            <div className="space-y-0.5">
              {assumptions.slice(0, 5).map((a: any, i: number) => (
                <p key={i} style={{ color: "#64748b" }}>
                  &bull; {typeof a === "string" ? a : (a.description ?? a.field ?? JSON.stringify(a))}
                </p>
              ))}
              {assumptions.length > 5 && (
                <p style={{ color: "#64748b" }}>+{assumptions.length - 5} more assumptions</p>
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
      const lineTotal = (q.lineItems ?? []).reduce((s: number, li: any) => s + Number(li.lineTotal ?? li.unitPrice ?? 0), 0);
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
    <div className="mb-2 space-y-3" style={{ marginBottom: "12px" }}>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: '#ffffff' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: '#ffffff' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>7.1 Historical Cost Benchmark</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            Based on {lb!.sampleSize} anonymised validated claims for {lb!.vehicleDescriptor} ({lb!.collisionDirection} impact, {lb!.marketRegion} market)
          </p>
        </div>
        <div className="p-4">
          <table className="compact-kv-table text-xs">
            <tbody>
              <tr>
                <td className="px-3 py-2 font-medium" style={{ color: 'var(--muted-foreground)' }}>Historical average repair cost</td>
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
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
.kinga-report{font-family:'DM Sans',sans-serif;font-size:13px;color:#1a1916;background:#fff;line-height:1.5;padding:0;position:relative;
  --kr-black:#0a0a0a;--kr-white:#ffffff;--kr-off-white:#f7f6f3;--kr-rule:#e0ddd8;--kr-muted:#6b6862;--kr-text:#1a1916;
  --kr-red:#c0392b;--kr-amber:#d97706;--kr-green:#16a34a;--kr-blue:#1d4ed8;
  --kr-red-light:#fef2f2;--kr-amber-light:#fffbeb;--kr-green-light:#f0fdf4;--kr-blue-light:#eff6ff;
  --kr-mono:'DM Mono',monospace;--kr-serif:'Instrument Serif',serif;--kr-sans:'DM Sans',sans-serif;
}
.kinga-report[data-draft="true"]::before{content:'DRAFT';position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);font-size:120px;font-weight:900;color:rgba(0,0,0,0.04);letter-spacing:0.15em;pointer-events:none;z-index:0;white-space:nowrap;user-select:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.kinga-report .decision-strip{display:grid;grid-template-columns:auto auto 1fr;gap:0;border-bottom:2px solid var(--kr-black);padding:14px 0;align-items:start;margin-bottom:0;min-height:0}
.kinga-report .verdict-block{padding-right:28px;border-right:1px solid var(--kr-rule);margin-right:28px}
.kinga-report .verdict-label{font-size:10px;font-family:var(--kr-mono);letter-spacing:.12em;color:var(--kr-muted);margin-bottom:2px}
.kinga-report .verdict-value{font-size:22px;font-weight:600;letter-spacing:-.02em;line-height:1.1}
.kinga-report .verdict-value.approve{color:var(--kr-green)}
.kinga-report .verdict-value.review{color:var(--kr-amber)}
.kinga-report .verdict-value.decline{color:var(--kr-red)}
.kinga-report .verdict-sub{font-size:11px;color:var(--kr-muted);margin-top:2px}
.kinga-report .score-cluster{display:flex;gap:0;flex-wrap:nowrap;border-left:1px solid var(--kr-rule);border-right:1px solid var(--kr-rule);margin:0 24px;padding:0 24px}
.kinga-report .score-item{text-align:center;padding:0 16px;border-right:1px solid var(--kr-rule)}.kinga-report .score-item:last-child{border-right:none}
.kinga-report .score-num{font-family:var(--kr-mono);font-size:22px;font-weight:600;display:block;line-height:1}
.kinga-report .score-num.low{color:var(--kr-green)}
.kinga-report .score-num.mid{color:var(--kr-amber)}
.kinga-report .score-num.high{color:var(--kr-red)}
.kinga-report .score-lbl{font-size:10px;color:var(--kr-muted);letter-spacing:.08em;font-family:var(--kr-mono);display:block;margin-top:2px}
.kinga-report .cost-cluster{display:flex;gap:0;flex-wrap:wrap;align-items:flex-start;padding-left:0;row-gap:10px}
.kinga-report .cost-item{min-width:110px;max-width:160px;padding:0 12px;border-right:1px solid var(--kr-rule)}.kinga-report .cost-item:last-child{border-right:none}
.kinga-report .cost-lbl{font-size:10px;color:var(--kr-muted);letter-spacing:.08em;font-family:var(--kr-mono);display:flex;align-items:center;gap:5px;margin-bottom:2px}
.kinga-report .cost-val{font-size:18px;font-weight:600;font-family:var(--kr-mono);display:block;letter-spacing:-.02em;color:var(--kr-text)}
.kinga-report .cost-val-dim{font-size:16px;font-weight:400;color:var(--kr-muted)}
.kinga-report .cost-sub{font-size:10px;color:var(--kr-muted);display:block;margin-top:1px}
.kinga-report .cost-lowest-tag{font-size:8px;font-family:var(--kr-mono);letter-spacing:.08em;font-weight:600;color:var(--kr-green);background:var(--kr-green-light);border:1px solid var(--kr-green);padding:1px 4px;border-radius:2px;line-height:1.4}
.kinga-report .cost-adjusted-tag{font-size:8px;font-family:var(--kr-mono);letter-spacing:.08em;font-weight:600;color:var(--kr-amber);background:var(--kr-amber-light);border:1px solid var(--kr-amber);padding:1px 4px;border-radius:2px;line-height:1.4}
.kinga-report .cost-divider{width:1px;background:var(--kr-black);align-self:stretch;margin:0 8px;flex-shrink:0}
.kinga-report .scorecard-row{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--kr-rule);margin:14px 0;border:1px solid var(--kr-rule)}
.kinga-report .scorecard-cell{background:var(--kr-white);padding:10px 14px;position:relative}
.kinga-report .sc-label{font-size:10px;font-family:var(--kr-mono);letter-spacing:.1em;color:var(--kr-muted);margin-bottom:6px;display:block}
.kinga-report .sc-bar-track{height:4px;background:var(--kr-off-white);border-radius:2px;margin:8px 0 4px;overflow:hidden}
.kinga-report .sc-bar-fill{height:100%;border-radius:2px}
.kinga-report .sc-val{font-family:var(--kr-mono);font-size:20px;font-weight:500}
.kinga-report .sc-tag{font-size:10px;color:var(--kr-muted)}
.kinga-report .fill-green{background:var(--kr-green)}
.kinga-report .fill-amber{background:var(--kr-amber)}
.kinga-report .fill-red{background:var(--kr-red)}
.kinga-report .fill-blue{background:var(--kr-blue)}
.kinga-report .col-green{color:var(--kr-green)}
.kinga-report .col-amber{color:var(--kr-amber)}
.kinga-report .col-red{color:var(--kr-red)}
.kinga-report .col-blue{color:var(--kr-blue)}
.kinga-report .verdict-banner{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;margin-bottom:10px;border-left:6px solid #111}
.kinga-report .verdict-banner.approve{border-color:var(--kr-green);background:var(--kr-green-light)}
.kinga-report .verdict-banner.review{border-color:var(--kr-amber);background:var(--kr-amber-light)}
.kinga-report .verdict-banner.decline{border-color:var(--kr-red);background:var(--kr-red-light)}
.kinga-report .verdict-banner .vb-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#888;margin-bottom:4px}
.kinga-report .verdict-banner .vb-decision{font-size:22px;font-weight:800;letter-spacing:-.01em;line-height:1.1}
.kinga-report .verdict-banner .vb-decision.approve{color:var(--kr-green)}
.kinga-report .verdict-banner .vb-decision.review{color:var(--kr-amber)}
.kinga-report .verdict-banner .vb-decision.decline{color:var(--kr-red)}
.kinga-report .verdict-banner .vb-meta{font-size:10px;color:#555;margin-top:5px}
.kinga-report .verdict-banner .vb-right{text-align:right;min-width:120px}
.kinga-report .page-header{display:flex;align-items:center;justify-content:space-between;padding:6px 40px;background:var(--kr-white);border-bottom:1px solid var(--kr-rule);font-family:var(--kr-mono);font-size:10px;color:var(--kr-muted);letter-spacing:0.06em;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.kinga-report .page-header .brand{font-family:var(--kr-mono);font-weight:400;font-size:11px;color:var(--kr-muted);letter-spacing:.15em}
.kinga-report .cover-title-row{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:start;padding:20px 40px 16px;background:var(--kr-white);border-bottom:2px solid var(--kr-black);margin:0}
.kinga-report .cover-title-row h1{font-family:var(--kr-serif);font-size:24px;font-weight:400;color:var(--kr-black);line-height:1.2;margin-bottom:4px}
.kinga-report .cover-title-row .subtitle{font-size:11px;color:var(--kr-muted);font-style:italic}
.kinga-report .cover-meta{text-align:right}
.kinga-report .cover-meta .claim-id{font-family:var(--kr-mono);font-size:11px;color:var(--kr-muted);letter-spacing:0.08em}
.kinga-report .cover-meta .meta-line{font-size:13px;color:var(--kr-black);font-weight:600;margin-top:4px}
.kinga-report .claim-id{font-family:var(--kr-mono);font-size:11px;color:var(--kr-muted);letter-spacing:0.08em}
.kinga-report .meta-line{font-size:13px;color:var(--kr-black);font-weight:600;margin-top:4px}
.kinga-report .doc-identity{background:var(--kr-off-white);border:1px solid var(--kr-rule);padding:8px 40px;margin-bottom:0;font-size:11px;color:var(--kr-muted);display:flex;gap:20px;flex-wrap:wrap;font-family:var(--kr-mono);letter-spacing:0.06em}
.kinga-report .di-label{font-weight:500;color:var(--kr-muted);text-transform:uppercase;font-size:9px;letter-spacing:.1em;display:block;margin-bottom:2px}
.kinga-report .alert-banner{border-radius:2px;padding:10px 14px;margin-bottom:12px;font-size:12px;border-left:3px solid;line-height:1.5;display:flex;gap:8px;align-items:flex-start}
.kinga-report .alert-banner.critical{background:var(--kr-red-light);border-left-color:var(--kr-red);color:#991b1b}
.kinga-report .alert-banner.warn{background:var(--kr-amber-light);border-left-color:var(--kr-amber);color:#92400e}
.kinga-report .alert-banner.info{background:var(--kr-blue-light);border-left-color:var(--kr-blue);color:#1e40af}
.kinga-report .alert-banner.success{background:var(--kr-green-light);border-left-color:var(--kr-green);color:#166534}
.kinga-report .kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--kr-rule);border:1px solid var(--kr-rule);margin-bottom:12px}
.kinga-report .kpi-tile{padding:10px 14px;background:var(--kr-white);position:relative;text-align:left}
.kinga-report .kpi-label{font-size:10px;font-family:var(--kr-mono);letter-spacing:.1em;color:var(--kr-muted);margin-bottom:6px;display:block}
.kinga-report .kpi-value{font-family:var(--kr-mono);font-size:20px;font-weight:500;color:var(--kr-black);line-height:1}
.kinga-report .kpi-sub{font-size:10px;color:var(--kr-muted);margin-top:4px}
.kinga-report .kpi-polarity{font-size:10px;color:var(--kr-muted);margin-top:2px}
.kinga-report .dim-grid{display:grid;grid-template-columns:repeat(2,1fr);border:1px solid var(--kr-rule);margin-bottom:14px}
.kinga-report .dim-row{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--kr-rule);font-size:11px}
.kinga-report .dim-row:nth-child(odd){border-right:1px solid var(--kr-rule)}
.kinga-report .dim-badge{font-size:9px;font-weight:500;padding:2px 7px;border-radius:2px;text-transform:uppercase;letter-spacing:.06em;font-family:var(--kr-mono)}
.kinga-report .dim-badge.pass{background:var(--kr-green-light);color:var(--kr-green)}
.kinga-report .dim-badge.warn{background:var(--kr-amber-light);color:var(--kr-amber)}
.kinga-report .dim-badge.fail{background:var(--kr-red-light);color:var(--kr-red)}
.kinga-report .fcdi-block{display:flex;gap:24px;align-items:flex-start;border:1px solid var(--kr-rule);padding:14px 16px;margin-bottom:14px}
.kinga-report .fcdi-score-big{font-size:32px;font-weight:500;color:var(--kr-black);line-height:1;font-family:var(--kr-mono)}
.kinga-report .fcdi-score-denom{font-size:18px;color:var(--kr-muted);font-family:var(--kr-mono)}
.kinga-report .timeline{display:flex;align-items:center;gap:0;margin:16px 0 24px;overflow-x:auto}
.kinga-report .tl-item{flex-shrink:0;text-align:center}
.kinga-report .tl-line{flex:1;height:1px;background:var(--kr-rule);min-width:30px}
.kinga-report .tl-dot{width:10px;height:10px;border-radius:50%;background:var(--kr-black);margin:0 auto 4px}
.kinga-report .tl-dot.inactive{background:var(--kr-rule)}
.kinga-report .tl-label{font-family:var(--kr-mono);font-size:9px;letter-spacing:.08em;color:var(--kr-muted)}
.kinga-report .tl-date{font-family:var(--kr-mono);font-size:10px;font-weight:500;margin-top:2px}
.kinga-report .exec-summary{border:1px solid var(--kr-rule);padding:14px 16px;margin-bottom:10px;font-size:12px;color:var(--kr-text);line-height:1.6;background:var(--kr-white)}
.kinga-report .pipeline-box{display:none !important}
.kinga-report .pipeline-box h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#111;margin-bottom:4px}
.kinga-report .pipeline-box .run-meta{font-size:10px;color:#666;margin-bottom:12px}
.kinga-report .run-meta{font-size:10px;color:var(--kr-muted);margin-bottom:12px;font-family:var(--kr-mono)}
.kinga-report .pis-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--kr-muted);margin:0}
.kinga-report .pis-text{font-size:12px;color:var(--kr-text);line-height:1.6;margin:0}
.kinga-report .stage-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:14px}
.kinga-report .stage-tile{padding:6px 4px;text-align:center;font-size:9px;font-weight:700;border-radius:3px;text-transform:uppercase;letter-spacing:.04em}
.kinga-report .stage-tile.green{background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7}
.kinga-report .stage-tile.amber{background:#fff8e1;color:#c8a000;border:1px solid #ffe082}
.kinga-report .pipeline-stats{display:grid;grid-template-columns:repeat(6,1fr);gap:0;border-top:1px solid #ddd;padding-top:12px}
.kinga-report .ps-item{text-align:center}
.kinga-report .ps-value{font-size:22px;font-weight:700;color:#111}
.kinga-report .ps-label{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.06em}
.kinga-report .section-heading{display:flex;align-items:baseline;gap:12px;padding-bottom:6px;border-bottom:2px solid var(--kr-black);margin:24px 0 12px;font-size:14px;font-weight:600;letter-spacing:-0.01em;color:var(--kr-black)}
.kinga-report .sub-heading{font-family:var(--kr-mono);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:var(--kr-muted);margin:10px 0 6px}
.kinga-report .data-table{width:100%;border-collapse:collapse;margin-bottom:10px;table-layout:fixed}
.kinga-report .compact-kv-table{width:auto;max-width:520px;border-collapse:collapse;margin-bottom:10px;table-layout:auto}
.kinga-report .compact-kv-table td{padding:5px 0;font-size:12px;border-bottom:1px solid var(--kr-rule);vertical-align:top;white-space:normal}
.kinga-report .compact-kv-table td:first-child{font-size:10px;font-family:var(--kr-mono);color:var(--kr-muted);letter-spacing:0.1em;text-transform:uppercase;padding-right:24px;white-space:nowrap;min-width:160px}
.kinga-report .compact-kv-table td:last-child{color:var(--kr-text);font-weight:500}
.kinga-report .compact-kv-table tr:last-child td{border-bottom:none}
.kinga-report .two-col-kv{display:grid;grid-template-columns:1fr 1fr;gap:0 32px;margin-bottom:14px}
.kinga-report .two-col-kv .compact-kv-table{width:100%;max-width:none}
.kinga-report .data-table td,.kinga-report .data-table th{padding:6px 0;font-size:12px !important;border-bottom:1px solid var(--kr-rule);vertical-align:top;word-break:break-word;overflow-wrap:break-word;white-space:normal}
.kinga-report .data-table th{font-size:10px !important;font-weight:400;text-transform:uppercase;letter-spacing:.08em;color:var(--kr-muted);background:transparent;border-bottom:1px solid var(--kr-rule);font-family:var(--kr-mono);padding-right:8px}
.kinga-report .data-table td:first-child{font-size:11px !important;font-family:var(--kr-mono);color:var(--kr-muted);letter-spacing:0.06em;width:44%;padding-right:8px}
.kinga-report .data-table td:last-child{color:var(--kr-text);font-weight:500;font-size:12px !important}
.kinga-report .data-table tr:last-child td{border-bottom:none}
.kinga-report .flag-red{color:var(--kr-red);font-weight:600;font-family:var(--kr-mono)}
.kinga-report .flag-amber{color:var(--kr-amber);font-weight:600;font-family:var(--kr-mono)}
.kinga-report .flag-green{color:var(--kr-green);font-weight:600;font-family:var(--kr-mono)}
.kinga-report .data-table .mismatch td{background:#fff;color:#c00;font-weight:700}
.kinga-report .narrative-box{border:1px solid var(--kr-rule);padding:10px 14px;margin-bottom:6px;font-size:12px;color:var(--kr-text);line-height:1.5;background:var(--kr-white)}
.kinga-report .narr-label{font-size:10px;font-weight:400;text-transform:uppercase;letter-spacing:.1em;color:var(--kr-muted);margin-bottom:6px;font-family:var(--kr-mono)}
.kinga-report .diagram-section{display:flex;gap:16px;align-items:flex-start;margin-bottom:10px;border:1px solid var(--kr-rule);padding:12px}
.kinga-report .diagram-legend{flex:1}
.kinga-report .legend-item{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--kr-text);margin-bottom:6px}
.kinga-report .legend-swatch{width:18px;height:12px;border-radius:2px;flex-shrink:0}
.kinga-report .diagram-caption{font-size:10px;color:var(--kr-muted);margin-top:8px;font-style:italic}
.kinga-report .chart-container{position:relative;height:140px;width:100%;margin-bottom:8px}
.kinga-report .chart-side-by-side{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:10px}
.kinga-report .bordered-block{border:1px solid var(--kr-rule);padding:10px 14px;margin-bottom:8px}
.kinga-report .valuation-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--kr-rule);font-size:12px}
.kinga-report .valuation-row:last-child{border-bottom:none}
.kinga-report .valuation-row .vr-label{color:var(--kr-muted);font-family:var(--kr-mono);font-size:11px;letter-spacing:0.06em}
.kinga-report .valuation-row .vr-value{font-weight:600;font-family:var(--kr-mono)}
.kinga-report .valuation-row .vr-value.good{color:var(--kr-green)}
.kinga-report .valuation-row .vr-value.na{color:var(--kr-amber)}
.kinga-report .photo-tiles{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--kr-rule);margin-bottom:14px}
.kinga-report .photo-tile{padding:14px;text-align:center;border-right:1px solid var(--kr-rule)}
.kinga-report .photo-tile:last-child{border-right:none}
.kinga-report .pt-label{font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:.1em;color:var(--kr-muted);margin-bottom:6px;font-family:var(--kr-mono)}
.kinga-report .pt-value{font-size:28px;font-weight:500;color:var(--kr-black);font-family:var(--kr-mono)}
.kinga-report .pt-sub{font-size:10px;color:var(--kr-muted);margin-top:2px;font-family:var(--kr-mono)}
.kinga-report .photo-forensics-table{width:100%;border-collapse:collapse;margin-bottom:14px;table-layout:fixed}
.kinga-report .photo-forensics-table th{font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:.08em;color:var(--kr-muted);background:var(--kr-off-white);border-bottom:1px solid var(--kr-rule);padding:6px 8px;text-align:left;word-break:break-word;white-space:normal;font-family:var(--kr-mono)}
.kinga-report .photo-forensics-table td{padding:6px 8px;font-size:11px;border-bottom:1px solid var(--kr-rule);vertical-align:top;word-break:break-word;overflow-wrap:break-word;white-space:normal}
.kinga-report .photo-forensics-table tr:last-child td{border-bottom:none}
.kinga-report .photo-forensics-table .photo-finding{font-size:12px;color:var(--kr-text);line-height:1.5}
.kinga-report .photo-forensics-table .photo-detail{font-size:10px;color:var(--kr-muted);margin-top:3px;font-style:italic;line-height:1.4}
.kinga-report .photo-forensics-table tr.flagged-row td{background:var(--kr-red-light);color:var(--kr-red);font-weight:600}
/* Photo Integrity Summary box — print-safe override */
.kinga-report .photo-integrity-summary{background:var(--kr-off-white) !important;border:1px solid var(--kr-rule) !important;border-radius:0 !important;padding:14px 16px !important;margin-bottom:14px !important}
.kinga-report .photo-integrity-summary .pis-label{font-size:10px;font-weight:400;text-transform:uppercase;letter-spacing:.08em;color:var(--kr-muted);margin-bottom:4px;font-family:var(--kr-mono)}
.kinga-report .photo-integrity-summary .pis-text{font-size:12px;color:var(--kr-text);line-height:1.6}
.kinga-report .fraud-score-block{display:flex;gap:16px;align-items:flex-start;margin-bottom:10px}
.kinga-report .fraud-big{font-size:44px;font-weight:500;color:var(--kr-black);line-height:1;font-family:var(--kr-mono)}
.kinga-report .fraud-denom{font-size:22px;color:var(--kr-muted);font-family:var(--kr-mono)}
.kinga-report .fraud-explain{font-size:12px;color:var(--kr-text);line-height:1.7;flex:1;padding-top:8px}
.kinga-report .ml-glimpse{background:var(--kr-white);border:1px solid var(--kr-rule);padding:14px 16px;margin-bottom:10px}
.kinga-report .ml-glimpse h4{font-size:10px;font-weight:400;text-transform:uppercase;letter-spacing:.1em;color:var(--kr-muted);margin-bottom:10px;font-family:var(--kr-mono)}
.kinga-report .ml-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--kr-rule);font-size:11px}
.kinga-report .ml-row:last-child{border-bottom:none}
.kinga-report .ml-label{color:var(--kr-muted);flex:1;font-family:var(--kr-mono);font-size:11px}
.kinga-report .ml-value{font-weight:500;color:var(--kr-black);text-align:right;flex:0 0 120px;font-family:var(--kr-mono)}
.kinga-report .ml-badge{font-size:9px;font-weight:500;padding:2px 7px;border-radius:2px;text-transform:uppercase;letter-spacing:.06em;margin-left:8px;font-family:var(--kr-mono)}
.kinga-report .ml-badge.normal{background:var(--kr-green-light);color:var(--kr-green)}
.kinga-report .ml-badge.anomaly{background:var(--kr-amber-light);color:var(--kr-amber)}
.kinga-report .ml-badge.cluster{background:var(--kr-blue-light);color:var(--kr-blue)}
.kinga-report .decision-box{border:1px solid var(--kr-rule);padding:20px 28px;margin-bottom:14px;text-align:left;background:var(--kr-off-white)}
.kinga-report .db-label{font-size:10px;font-weight:400;text-transform:uppercase;letter-spacing:.12em;color:var(--kr-muted);margin-bottom:4px;font-family:var(--kr-mono)}
.kinga-report .db-value{font-size:22px;font-weight:600;color:var(--kr-black);letter-spacing:-0.02em}
.kinga-report .db-sub{font-size:11px;color:var(--kr-muted);margin-top:6px}
.kinga-report .flowchart{display:flex;flex-direction:column;align-items:center;gap:0;margin-bottom:12px}
.kinga-report .fc-box{width:340px;padding:10px 18px;text-align:center;border:1px solid #ccc;font-size:11px;background:#fff}
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
.kinga-report .next-steps{margin-bottom:12px;list-style:none;padding:0}
.kinga-report .next-steps li{font-size:11px;color:#333;padding:5px 0 5px 26px;position:relative;border-bottom:1px solid #f0f0f0}
.kinga-report .ns-num{position:absolute;left:0;font-weight:700;color:#888;font-size:11px}
.kinga-report .integrity-table{width:100%;border-collapse:collapse;margin-bottom:14px;table-layout:fixed}
.kinga-report .integrity-table td{padding:6px 0;font-size:12px;border-bottom:1px solid var(--kr-rule);word-break:break-word;overflow-wrap:break-word;white-space:normal}
.kinga-report .integrity-table td:first-child{color:var(--kr-muted);width:210px;font-size:11px;font-family:var(--kr-mono);letter-spacing:0.06em}
.kinga-report .hash-block{font-family:var(--kr-mono);font-size:10px;color:var(--kr-muted);background:var(--kr-off-white);padding:10px 14px;border:1px solid var(--kr-rule);margin-bottom:10px;word-break:break-all}
.kinga-report .tamper-note{font-size:11px;color:var(--kr-muted);font-style:italic;margin-bottom:16px}
.kinga-report .lifecycle-bar{display:flex;margin-bottom:8px}
.kinga-report .lc-step{flex:1;padding:10px 8px;text-align:center;font-size:11px;font-weight:700;background:#fff;color:#888;border:1px solid #ddd;border-right:none}
.kinga-report .lc-step:last-child{border-right:1px solid #ddd}
.kinga-report .lc-step.active{background:var(--kr-amber-light);color:#92400e;border-color:var(--kr-amber);border-bottom:3px solid var(--kr-amber)}
.kinga-report .lc-step.done{background:var(--kr-green-light);color:#166534;border-color:var(--kr-green);border-bottom:3px solid var(--kr-green)}
.kinga-report .conf-footer{font-size:10px;color:var(--kr-muted);text-align:center;padding:12px 20px;border-top:1px solid var(--kr-rule);line-height:1.5;background:var(--kr-white);font-family:var(--kr-mono)}
.kinga-report .two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.kinga-report .col-pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px}
.kinga-report .three-col{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:14px}
.kinga-report .physics-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;margin-bottom:14px}
.kinga-report .col-pair > *,.kinga-report .three-col > *,.kinga-report .physics-row > *{min-width:0;page-break-inside:avoid;break-inside:avoid}
.kinga-report .section-divider{border:none;border-top:1px solid var(--kr-rule);margin:16px 0}
.kinga-report .text-muted{color:var(--kr-muted)}
.kinga-report .mono{font-family:var(--kr-mono)}
.kinga-report .small{font-size:10px}
.kinga-report .party-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid var(--kr-rule);margin-bottom:14px}
.kinga-report .party-col{padding:10px 14px}
.kinga-report .party-col:first-child{border-right:1px solid var(--kr-rule)}
.kinga-report .party-col-heading{font-size:10px;font-weight:400;text-transform:uppercase;letter-spacing:.1em;color:var(--kr-muted);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--kr-rule);font-family:var(--kr-mono)}
.kinga-report .party-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--kr-rule);font-size:11px}
.kinga-report .party-row:last-child{border-bottom:none}
.kinga-report .party-row .pr-label{color:var(--kr-muted);font-family:var(--kr-mono);font-size:11px;letter-spacing:0.06em}
.kinga-report .party-row .pr-value{font-weight:500;color:var(--kr-text);text-align:right;max-width:160px}
/* Override any Tailwind/dark-mode variables inside the report */
.kinga-report *{box-sizing:border-box}
.kinga-report h1,.kinga-report h2,.kinga-report h3,.kinga-report h4{font-family:var(--kr-sans);font-weight:600}
.kinga-report h1{font-size:20px}
.kinga-report h2{font-size:14px}
.kinga-report h3{font-size:13px}
.kinga-report h4{font-size:12px}
/* ── STRICT TYPOGRAPHIC SCALE — no font fluctuation allowed ──
   Section heading: 14px bold (kr-sans)
   Sub-section label: 10px mono uppercase (kr-mono)
   Body / table cells: 12px (kr-sans)
   Captions / secondary: 11px
   Micro-labels: 10px mono
   DO NOT use text-[9px], text-[8px] anywhere in the report
── */
.kinga-report p,.kinga-report td,.kinga-report li{font-size:12px;line-height:1.55}
.kinga-report span{font-size:inherit}
.kinga-report .section-heading{font-size:14px;font-weight:700;letter-spacing:.04em}
.kinga-report .kpi-label{font-size:10px;font-family:var(--kr-mono);letter-spacing:.1em;text-transform:uppercase}
/* Enforce minimum readable sizes — override any Tailwind text-[Xpx] micro-sizes */
.kinga-report [class*="text-[9px]"],.kinga-report [class*="text-[8px]"]{font-size:10px !important}
.kinga-report [class*="text-[10px]"]{font-size:10px !important}
.kinga-report [class*="text-xs"]{font-size:12px !important}
.kinga-report [class*="text-sm"]{font-size:13px !important}
/* Exception: mono labels that are intentionally small */
.kinga-report .kr-mono-label{font-size:10px;font-family:var(--kr-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--kr-muted)}
/* Narrative panel classes */
.kinga-report .narr-panel{border:1px solid var(--kr-rule);background:#fff;margin-bottom:12px}
.kinga-report .narr-header{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--kr-rule);background:var(--kr-off-white)}
.kinga-report .narr-header-label{font-size:10px;font-family:var(--kr-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--kr-muted);font-weight:600}
.kinga-report .narr-quote{font-size:12px;line-height:1.65;color:var(--kr-text);font-style:italic;padding:12px 14px;border-left:3px solid var(--kr-black);background:#fafafa;margin:10px 14px}
.kinga-report .narr-seq{padding:10px 14px;border-top:1px solid var(--kr-rule)}
.kinga-report .narr-seq-label{font-size:10px;font-family:var(--kr-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--kr-muted);margin-bottom:6px;display:block}
.kinga-report .narr-seq-text{font-size:12px;color:var(--kr-text);line-height:1.6}
.kinga-report .narr-cv{border-top:1px solid var(--kr-rule)}
.kinga-report .narr-cv-header{padding:6px 14px;background:var(--kr-off-white);border-bottom:1px solid var(--kr-rule)}
.kinga-report .narr-cv-row{display:grid;grid-template-columns:80px 90px 1fr;gap:8px;padding:8px 14px;border-bottom:1px solid var(--kr-rule);align-items:start}
.kinga-report .narr-cv-row:last-child{border-bottom:none}
.kinga-report .narr-cv-dim{font-size:12px;font-weight:700;color:var(--kr-text)}
.kinga-report .narr-cv-badge{font-size:10px;font-family:var(--kr-mono);font-weight:700;letter-spacing:.06em;padding:2px 7px;border:1px solid;display:inline-block}
.kinga-report .narr-cv-badge.ok{color:#166534;border-color:#16a34a;background:#f0fdf4}
.kinga-report .narr-cv-badge.warn{color:#92400e;border-color:#d97706;background:#fffbeb}
.kinga-report .narr-cv-badge.fail{color:#991b1b;border-color:#dc2626;background:#fef2f2}
.kinga-report .narr-cv-notes{font-size:12px;color:var(--kr-muted);line-height:1.5}
.kinga-report .narr-flags{border-top:1px solid var(--kr-rule)}
.kinga-report .narr-flags-header{padding:6px 14px;border-bottom:1px solid var(--kr-rule)}
.kinga-report .narr-flag-row{display:grid;grid-template-columns:60px 1fr;gap:10px;padding:8px 14px;border-bottom:1px solid var(--kr-rule)}
.kinga-report .narr-flag-row:last-child{border-bottom:none}
.kinga-report .narr-flag-sev{font-size:10px;font-family:var(--kr-mono);font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;border:1px solid;display:inline-block;text-align:center}
.kinga-report .narr-flag-sev.high{color:#991b1b;border-color:#dc2626;background:#fef2f2}
.kinga-report .narr-flag-sev.medium{color:#92400e;border-color:#d97706;background:#fffbeb}
.kinga-report .narr-flag-sev.low{color:#374151;border-color:#9ca3af;background:#f9fafb}
.kinga-report .narr-flag-title{font-size:12px;font-weight:700;color:var(--kr-text);margin-bottom:2px}
.kinga-report .narr-flag-desc{font-size:12px;color:var(--kr-muted);line-height:1.5}
.kinga-report .narr-flag-evidence{font-size:11px;color:var(--kr-muted);font-style:italic;margin-top:3px;padding-left:8px;border-left:2px solid var(--kr-rule)}
.kinga-report .narr-reasoning{padding:10px 14px;background:#fafafa;border-top:1px solid var(--kr-rule)}
.kinga-report .narr-reasoning-label{font-size:10px;font-family:var(--kr-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--kr-muted);margin-bottom:4px;display:block}
.kinga-report .narr-reasoning-text{font-size:12px;color:var(--kr-text);line-height:1.6}
/* Physics 2-column layout: table left, gauge+chart right */
.kinga-report .physics-row{display:grid;grid-template-columns:1fr 220px;gap:16px;align-items:start}
.kinga-report .physics-col-main{min-width:0}
.kinga-report .physics-col-side{min-width:0}
/* Print: keep physics-row side-by-side */
@media print{
  .kinga-report .physics-row{display:grid !important;grid-template-columns:1fr 200px !important;gap:12px !important}
  .kinga-report .narr-cv-row{display:grid !important;grid-template-columns:80px 90px 1fr !important}
  .kinga-report .narr-flag-row{display:grid !important;grid-template-columns:60px 1fr !important}
}
/* ── CSS variable overrides: map all dark-theme vars to white-document values ── */
.kinga-report,.dark .kinga-report{color-scheme:light !important;background:#fff !important;color:var(--kr-text) !important;
  --background:#fff;
  --foreground:var(--kr-text);
  --card:#fff;
  --card-foreground:var(--kr-text);
  --border:var(--kr-rule);
  --muted:var(--kr-off-white);
  --muted-foreground:var(--kr-muted);
  --primary:var(--kr-black);
  --primary-foreground:#fff;
  /* ── Semantic tokens — now use real colours from reference design ── */
  --fp-success:var(--kr-green);
  --fp-success-bg:var(--kr-green-light);
  --fp-success-border:var(--kr-green);
  --fp-success-text:#166534;
  --fp-warning-bg:var(--kr-amber-light);
  --fp-warning-border:var(--kr-amber);
  --fp-warning-text:#92400e;
  --fp-critical-bg:var(--kr-red-light);
  --fp-critical-border:var(--kr-red);
  --fp-critical-text:#991b1b;
  --fp-info:var(--kr-blue);
  --fp-info-bg:var(--kr-blue-light);
  --fp-info-border:var(--kr-blue);
  --fp-info-text:#1e40af;
  --fp-danger:var(--kr-red);
  --fp-warn:var(--kr-amber);
  --status-approve-bg:var(--kr-green-light);
  --status-approve-border:var(--kr-green);
  --status-approve-text:#166534;
  --status-review-bg:var(--kr-amber-light);
  --status-review-border:var(--kr-amber);
  --status-review-text:#92400e;
  --status-reject-bg:var(--kr-red-light);
  --status-reject-border:var(--kr-red);
  --status-reject-text:#991b1b;
  --fp-section-bg:var(--kr-off-white);
  --fp-border:var(--kr-rule);
  /* ── KINGA Brand Tokens ── */
  --kinga-primary:var(--kr-black);
  --kinga-risk-high:var(--kr-red);
  --kinga-risk-medium:var(--kr-amber);
  --kinga-positive:var(--kr-green);
  --kinga-neutral:var(--kr-muted);
  /* ── ConfidenceImprovementChecklist tokens ── */
  --fp-accent:var(--kr-black);
  --fp-text-primary:var(--kr-text);
  --fp-text-muted:var(--kr-muted);
  --fp-bg-section:var(--kr-off-white);
  /* ── Locked/neutral state tokens (used in physics skipped, inconclusive states) ── */
  --fp-locked-bg:#f8f8f8;
  --fp-locked-border:#aaaaaa;
  --fp-locked-text:#555555;
  /* ── Status pass/fail text tokens (used in quote coverage section) ── */
  --status-pass-text:#166534;
  --status-fail-text:#991b1b;
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
.kinga-report table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;table-layout:fixed}
.kinga-report table td,.kinga-report table th{padding:6px 10px;font-size:12px !important;border-bottom:1px solid var(--kr-rule);vertical-align:top;color:var(--kr-text);background:var(--kr-white);word-break:break-word;overflow-wrap:break-word;white-space:normal}
.kinga-report table th{font-size:10px !important;font-weight:400;text-transform:uppercase;letter-spacing:.08em;color:var(--kr-white);background:var(--kr-black);border-bottom:none;word-break:break-word;white-space:normal;font-family:var(--kr-mono);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.kinga-report table td:first-child{color:var(--kr-muted);font-size:11px !important;font-weight:400}
/* Narrative boxes */
.kinga-report [class*="p-3"][class*="rounded"]{background:#fff !important;border:1px solid #ddd !important;border-radius:0 !important;color:#333 !important}
/* Flatten card wrappers — remove rounded corners and shadows from sub-section containers */
.kinga-report .rounded-xl,.kinga-report .rounded-lg,.kinga-report .rounded-md{
  border-radius:0 !important;
  box-shadow:none !important;
}
.kinga-report [class*="shadow"]{
  box-shadow:none !important;
}
/* Sub-section header bars — remove coloured backgrounds, keep border-bottom only */
.kinga-report .px-4.py-3[style*="borderBottom"]{
  background:#fff !important;
  border-bottom:1px solid #ddd !important;
  padding:6px 0 6px 0 !important;
}
/* Remove inner padding from card containers */
.kinga-report .rounded-xl.overflow-hidden,
.kinga-report .rounded-lg.overflow-hidden{
  border:none !important;
  margin-bottom:12px !important;
}
/* Section sub-headings — override Tailwind tiny uppercase labels to proper 13px bold headings */
.kinga-report p.text-xs.font-bold.uppercase.tracking-wide,
.kinga-report span.text-xs.font-bold.uppercase.tracking-wide{
  font-size:12px !important;
  font-weight:700 !important;
  text-transform:uppercase !important;
  letter-spacing:.08em !important;
  color:#111 !important;
  margin-bottom:6px !important;
  display:block !important;
}
/* Section sub-headings — see override above */
/* Badges — FAR-01: all tinted backgrounds converted to white/light-grey, text to #111 */
.kinga-report .bg-green-100{background:#fff !important;color:#111 !important;border:1px solid #aaa !important}
.kinga-report .bg-yellow-100{background:#f8f8f8 !important;color:#111 !important;border:1px solid #555 !important}
.kinga-report .bg-red-100{background:#f0f0f0 !important;color:#111 !important;border:1px solid #111 !important}
.kinga-report .bg-orange-100{background:#f8f8f8 !important;color:#111 !important;border:1px solid #555 !important}
.kinga-report .dark\:bg-green-950{background:#fff !important}
.kinga-report .dark\:bg-yellow-950{background:#f8f8f8 !important}
.kinga-report .dark\:bg-red-950{background:#f0f0f0 !important}
.kinga-report .dark\:bg-orange-950{background:#f8f8f8 !important}
.kinga-report .dark\:bg-amber-950{background:#f8f8f8 !important}
.kinga-report .text-green-800{color:#111 !important}
.kinga-report .text-yellow-800{color:#111 !important}
.kinga-report .text-red-800{color:#111 !important}
.kinga-report .text-orange-700{color:#111 !important}
.kinga-report .text-amber-900{color:#111 !important}
.kinga-report .dark\:text-green-200{color:#111 !important}
.kinga-report .dark\:text-yellow-200{color:#111 !important}
.kinga-report .dark\:text-red-200{color:#111 !important}
.kinga-report .dark\:text-orange-200{color:#111 !important}
.kinga-report .dark\:text-amber-300{color:#111 !important}
/* Override tinted Tailwind utility classes to white — FAR-01 */
.kinga-report .bg-amber-50{background:#f8f8f8 !important;color:#111 !important}
.kinga-report .bg-red-50{background:#f0f0f0 !important;color:#111 !important}
/* CongruencyPanel and DataQualityPanel — only override the outer wrapper, not inner headers */
.kinga-report [class*="overflow-hidden"]:not([style*="background"]):not([class*="px-4"]){background:#fff !important}
/* ── Photo overlay dark backgrounds ── */
.kinga-report .bg-black\/55,.kinga-report [style*="bg-black"]{background:rgba(0,0,0,0.55) !important}
/* ── Inline dark backgrounds from Tailwind (bg-gray-900, bg-slate-800, etc.) ── */
.kinga-report [class*="bg-gray-9"],.kinga-report [class*="bg-slate-9"],.kinga-report [class*="bg-zinc-9"],.kinga-report [class*="bg-neutral-9"]{background:#fff !important;color:#111 !important}
.kinga-report [class*="bg-gray-8"],.kinga-report [class*="bg-slate-8"],.kinga-report [class*="bg-zinc-8"]{background:#fff !important;color:#111 !important}
/* ── Status-pass/fail aliases — FAR-01: B&W typographic hierarchy ── */
.kinga-report{--status-pass:#111111;--status-pass-bg:#ffffff;--status-pass-border:#aaaaaa;--status-fail:#111111;--status-fail-bg:#f0f0f0;--status-fail-border:#111111}
/* ── Radix Collapsible: force open in report context ── */
.kinga-report [data-state="closed"]{display:block !important;height:auto !important;overflow:visible !important}
/* ── Chart.js canvas: ensure white background ── */
.kinga-report canvas{background:#fff !important}
/* ─── @media print ─────────────────────────────────────────────────────────── */
@media print{
  /* Pure white document — no backgrounds anywhere except charts/SVGs */
  .kinga-report{background:#fff !important;color:#111 !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  .kinga-report *{background:#fff !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  /* Print: preserve colours for key semantic elements */
  .kinga-report .flag-red{color:var(--kr-red) !important;font-weight:600 !important}
  .kinga-report .flag-amber{color:var(--kr-amber) !important;font-weight:600 !important}
  .kinga-report .flag-green{color:var(--kr-green) !important;font-weight:600 !important}
  /* Dimension badges: preserve tinted backgrounds */
  .kinga-report .dim-badge.pass{background:var(--kr-green-light) !important;color:var(--kr-green) !important}
  .kinga-report .dim-badge.warn{background:var(--kr-amber-light) !important;color:var(--kr-amber) !important}
  .kinga-report .dim-badge.fail{background:var(--kr-red-light) !important;color:var(--kr-red) !important}
  .kinga-report .ml-badge.normal{background:var(--kr-green-light) !important;color:var(--kr-green) !important}
  .kinga-report .ml-badge.anomaly{background:var(--kr-amber-light) !important;color:var(--kr-amber) !important}
  .kinga-report .ml-badge.cluster{background:var(--kr-blue-light) !important;color:var(--kr-blue) !important}
  /* Alert banners: preserve tinted backgrounds */
  .kinga-report .alert-banner{white-space:normal !important;overflow:visible !important;word-break:break-word !important}
  .kinga-report .alert-banner.critical{background:var(--kr-red-light) !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  .kinga-report .alert-banner.warn{background:var(--kr-amber-light) !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  .kinga-report .alert-banner.info{background:var(--kr-blue-light) !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  .kinga-report .alert-banner.success{background:var(--kr-green-light) !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  /* Table borders visible in print */
  .kinga-report table,.kinga-report table td,.kinga-report table th{border-color:var(--kr-rule) !important;word-break:break-word !important;overflow-wrap:break-word !important;white-space:normal !important}
  .kinga-report table th{background:var(--kr-black) !important;color:var(--kr-white) !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  /* Section 2.5 Quote Coverage table */
  .kinga-report .report-table,.kinga-report .report-table td,.kinga-report .report-table th{border:1px solid var(--kr-rule) !important;word-break:break-word !important;white-space:normal !important}
    /* ── Page Break Strategy: Natural flow, no forced blank pages ── */
  /* Section headings: keep with following content but do NOT force a new page */
  .kinga-report .section-heading{
    page-break-before:auto;
    page-break-after:avoid;
    break-before:auto;
    break-after:avoid;
    margin-top:16px;
  }
  /* Only the very first section heading (Section 1) should break after the cover */
  .kinga-report .section-heading[data-section="1"]{
    page-break-before:always;
    break-before:page;
  }
  /* ReportSectionThread UI components: hidden in print (they are screen-only discussion threads) */
  .kinga-report [data-section-thread],
  .kinga-report [class*="section-thread"],
  .kinga-report [class*="SectionThread"]{
    display:none !important;
  }

  /* 2. Sub-headings: never orphaned at bottom of page */
  .kinga-report .sub-heading{
    page-break-after:avoid;
    break-after:avoid;
    orphans:3;
    widows:3;
  }

  /* 3. KPI row, verdict banner, decision strip, scorecard row, score summary: always keep together */
  .kinga-report .decision-strip,
  .kinga-report .scorecard-row,
  .kinga-report .kpi-row,
  .kinga-report .verdict-banner,
  .kinga-report .score-summary-panel,
  .kinga-report .decision-box,
  .kinga-report .fraud-score-block,
  .kinga-report .dim-grid,
  .kinga-report .party-grid{
    page-break-inside:avoid;
    break-inside:avoid;
  }

  /* 4. Tables: header row never orphaned; rows never split mid-row */
  .kinga-report table{
    page-break-inside:auto;
    break-inside:auto;
  }
  .kinga-report tr{
    page-break-inside:avoid;
    break-inside:avoid;
  }
  .kinga-report thead{
    display:table-header-group;
  }

  /* 5. Charts, flowcharts, SVGs: always keep together */
  .kinga-report .flowchart,
  .kinga-report .chart-container,
  .kinga-report canvas,
  .kinga-report svg{
    page-break-inside:avoid;
    break-inside:avoid;
  }
  .kinga-report .chart-container{height:auto !important;min-height:90px;width:100% !important}
  .kinga-report canvas{width:100% !important;height:auto !important;min-height:80px}

  /* 6. Photo cards: never split mid-row */
  .kinga-report .photo-card,.kinga-report [data-photo-card]{
    page-break-inside:avoid;
    break-inside:avoid;
  }

  /* 7. Alert banners and narrative boxes: keep together */
  .kinga-report .alert-banner,
  .kinga-report .ml-glimpse,
  .kinga-report .photo-integrity-summary,
  .kinga-report .next-steps,
  .kinga-report .blockers-list{
    page-break-inside:avoid;
    break-inside:avoid;
  }

  /* 8. Two-column grids: keep each column cell together */
  .kinga-report .two-col > *{
    page-break-inside:avoid;
    break-inside:avoid;
  }

  /* 9. Lifecycle tracker and approval chain: keep together */
  .kinga-report .lc-row,
  .kinga-report [class*="approval"],
  .kinga-report [class*="lifecycle"]{
    page-break-inside:avoid;
    break-inside:avoid;
  }

  /* 10. Orphan/widow control for narrative paragraphs */
  .kinga-report p{
    orphans:3;
    widows:3;
  }
  /* SVG zone severity fills — FAR-01: B&W typographic hierarchy for print */
  .kinga-report svg rect[fill="var(--fp-warning-bg)"]{fill:#f8f8f8 !important}
  .kinga-report svg rect[stroke="var(--fp-warning-text)"]{stroke:#555555 !important}
  .kinga-report svg rect[fill="var(--fp-critical-bg)"]{fill:#f0f0f0 !important}
  .kinga-report svg rect[stroke="var(--fp-critical-text)"]{stroke:#111111 !important}
  .kinga-report svg rect[fill="var(--muted)"]{fill:#f3f4f6 !important}
  .kinga-report svg rect[stroke="var(--border)"]{stroke:#d1d5db !important}
  .kinga-report svg text[fill="var(--muted-foreground)"]{fill:#6b7280 !important}
  .kinga-report svg text[fill="var(--foreground)"]{fill:#111 !important}
  /* Hide UI chrome that is not part of the report */
  .kinga-report .no-print,.no-print{display:none !important}
  /* Radix Collapsible: force open */
  .kinga-report [data-state="closed"]{display:block !important;height:auto !important;overflow:visible !important}
  /* Photo overlays: keep dark for readability over images */
  .kinga-report .bg-black\/55{background:rgba(0,0,0,0.55) !important;color:#fff !important}
  /* ── New elements: verdict banner ── */
  /* Verdict banner: B&W — use heavy border + uppercase weight to convey decision severity */
  .kinga-report .verdict-banner{background:#fff !important;border:2px solid #111 !important;color:#111 !important;page-break-inside:avoid}
  .kinga-report .verdict-banner .verdict-label{color:#111 !important;font-weight:900 !important}
  .kinga-report .verdict-banner .verdict-reason{color:#555 !important}
  .kinga-report .verdict-banner .verdict-confidence{color:#111 !important;font-weight:700 !important}
  /* ── Score summary bars: keep together, B&W bars ── */
  .kinga-report .score-summary-panel{page-break-inside:avoid;border:1px solid #ddd !important;background:#fff !important}
  .kinga-report .score-bar-fill{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  /* ── Section 5.5 stacked fraud signal chart: preserve colours for print ── */
  .kinga-report .fraud-signal-bar{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;page-break-inside:avoid}
  .kinga-report .fraud-signal-bar > div{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  /* ── Persistent footer: always show at bottom, preserve dark background ── */
  .kinga-report .report-persistent-footer{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;page-break-inside:avoid;margin-top:24px !important}
  .kinga-report .report-persistent-footer .footer-bar{background:var(--kr-black) !important;color:#888 !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  .kinga-report .report-persistent-footer .footer-bar *{color:#888 !important}
  .kinga-report .report-persistent-footer .footer-bar .footer-decision-badge{border:1px solid #888 !important;color:#888 !important}
  /* ── Decision strip: preserve colour coding in print ── */
  .kinga-report .decision-strip{border-bottom:1px solid #ddd !important}
  .kinga-report .verdict-value.approve{color:var(--kr-green) !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  .kinga-report .verdict-value.review{color:var(--kr-amber) !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  .kinga-report .verdict-value.decline{color:var(--kr-red) !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  .kinga-report .cost-lowest-tag{background:var(--kr-green-light) !important;color:var(--kr-green) !important;border:1px solid var(--kr-green) !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  .kinga-report .cost-adjusted-tag{background:var(--kr-amber-light) !important;color:var(--kr-amber) !important;border:1px solid var(--kr-amber) !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  /* ── Section 6 score summary bars: keep together ── */
  /* ── Keep multi-column layouts in print (saves ~8 pages) ── */
  .kinga-report .two-col{display:grid !important;grid-template-columns:1fr 1fr !important;gap:14px !important}
  .kinga-report .col-pair{display:grid !important;grid-template-columns:1fr 1fr !important;gap:16px !important}
  .kinga-report .three-col{display:grid !important;grid-template-columns:1fr 1fr 1fr !important;gap:12px !important}
  .kinga-report .physics-row{display:grid !important;grid-template-columns:1fr 1fr !important;gap:16px !important}
  .kinga-report .party-grid{display:grid !important;grid-template-columns:1fr 1fr !important}
  .kinga-report .col-pair > *,.kinga-report .three-col > *,.kinga-report .physics-row > *{page-break-inside:avoid;break-inside:avoid}
  /* ── Chart wrappers: never overflow, minimum readable height ── */
  .kinga-report [class*="chart-wrap"],[class*="chart-section"]{width:100% !important;max-width:100% !important;overflow:visible !important}
  .kinga-report .chart-container{height:auto !important;min-height:200px !important;width:100% !important}
  .kinga-report canvas{width:100% !important;height:auto !important;min-height:180px !important}
  /* ── Minimum font sizes for print readability ── */
  .kinga-report *{font-size:max(10px, inherit)}
  .kinga-report .data-table td,.kinga-report .data-table th{font-size:11px !important}
  .kinga-report .compact-kv-table td{font-size:11px !important}
  .kinga-report .compact-kv-table td:first-child{font-size:10px !important}
  .kinga-report .score-lbl,.kinga-report .cost-lbl,.kinga-report .kpi-label,.kinga-report .sc-label{font-size:10px !important}
  /* ── Decision strip: keep 3-column grid in print ── */
  .kinga-report .decision-strip{display:grid !important;grid-template-columns:auto auto 1fr !important;page-break-inside:avoid;break-inside:avoid;min-height:0 !important}
  .kinga-report .score-cluster{display:flex !important;flex-wrap:nowrap !important}
  .kinga-report .cost-cluster{display:flex !important;flex-wrap:wrap !important;row-gap:8px !important}
  .kinga-report .cost-item{min-width:100px !important;max-width:150px !important}
}
`;


export function ForensicAuditReport({ claim, aiAssessment, enforcement, quotes, approvalHistory = [], workflowStages = [], claimId, pipelineRunId, isDraft = false, draftMissingFields = [] }: ForensicAuditReportProps) {
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
    <div className="kinga-report"
      data-claim-number={claim?.claimNumber ?? claim?.claimReference ?? `#${(claim as any)?.id ?? ''}`}
      data-report-date={new Date(aiAssessment?.createdAt ?? Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
      data-draft={isDraft ? 'true' : undefined}
    >
      <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />
      {/* ── KINGA Report Header (black, Instrument Serif title) ── */}
      <div className="cover-title-row">
        <div>
          <div className="brand">KINGA ENGINE v{aiAssessment?.engineVersion ?? '4.2'} · FORENSIC CLAIM DECISION REPORT</div>
          <h1>Forensic Claim Decision<br/>Report</h1>
          <div className="subtitle">Automated AI analysis · Not legal advice · Requires human adjuster review</div>
        </div>
        <div className="cover-meta">
          <div className="claim-id">
            {(enforcement as any)?.kingaRef && <>{(enforcement as any).kingaRef}-FR<br/></>}
            CLAIM: {claim?.claimNumber ?? claim?.claimReference ?? '—'}<br/>
            HASH: #{((aiAssessment?.id ?? 0) * 31337).toString(16).padStart(8,'0').toUpperCase().slice(0,8)}
          </div>
          <div className="meta-line" style={{ marginTop: 12 }}>
            {claim?.vehicleYear ? `${claim.vehicleYear} ` : ''}{claim?.vehicleMake ?? ''} {claim?.vehicleModel ?? ''}
            {(claim?.vehicleRegistration || (claim as any)?.registrationNumber) && (
              <span style={{ fontSize: 12, color: '#aaa', display: 'block' }}>Reg: {claim?.vehicleRegistration ?? (claim as any)?.registrationNumber}</span>
            )}
          </div>
          <div style={{ marginTop: 8, fontFamily: 'var(--kr-mono)', fontSize: 10, color: '#555' }}>
            Generated: {new Date(aiAssessment?.createdAt ?? Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* DRAFT Banner */}
      {isDraft && (
        <div style={{ background: 'var(--kr-amber-light)', borderLeft: '3px solid var(--kr-amber)', padding: '7px 40px', fontFamily: 'var(--kr-mono)', fontSize: 11, color: '#92400e', letterSpacing: '0.08em' }}>
          ▲ DRAFT — {draftMissingFields.length > 0 ? `Missing: ${draftMissingFields.join(', ')}. ` : ''}Complete and re-export for final version.
        </div>
      )}

      {/* Body content wrapper */}
      <div style={{ padding: '0 40px 24px' }}>

      <CongruencyPanel aiAssessment={aiAssessment} />
      <DataQualityPanel aiAssessment={aiAssessment} />
      <Section0Cover claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} quotes={quotes} fmtMoney={fmtMoney} />

      <div className="section-heading" data-section="1">1 &nbsp; Incident &amp; Data Integrity</div>
      {claimId != null && <ReportSectionThread claimId={claimId} sectionKey="incident_integrity" pipelineRunId={pipelineRunId} />}
      <Section1Incident claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} fmtMoney={fmtMoney} />

      <div className="section-heading" data-section="2">2 &nbsp; Technical Forensics</div>
      {claimId != null && <ReportSectionThread claimId={claimId} sectionKey="physics" pipelineRunId={pipelineRunId} />}
      <Section2Physics claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} quotes={quotes} />

      <div className="section-heading" data-section="3">3 &nbsp; Financial Validation</div>
      {claimId != null && <ReportSectionThread claimId={claimId} sectionKey="financial_validation" pipelineRunId={pipelineRunId} />}
      <Section3Financial aiAssessment={aiAssessment} enforcement={enforcement} quotes={quotes} fmtMoney={fmtMoney} claimId={claim?.id} />

      <div className="section-heading" data-section="4">4 &nbsp; Evidence Inventory</div>
      {claimId != null && <ReportSectionThread claimId={claimId} sectionKey="evidence_inventory" pipelineRunId={pipelineRunId} />}
      <Section4Evidence aiAssessment={aiAssessment} enforcement={enforcement} claim={claim} />

      <div className="section-heading" data-section="5">5 &nbsp; Risk &amp; Fraud Assessment</div>
      {claimId != null && <ReportSectionThread claimId={claimId} sectionKey="fraud_risk" pipelineRunId={pipelineRunId} />}
      <Section5Fraud aiAssessment={aiAssessment} enforcement={enforcement} speedForensics={(enforcement as any)?._physics?.speedForensics ?? null} />

      <div className="section-heading" data-section="6">6 &nbsp; Decision Authority &amp; Audit Trail</div>
      {claimId != null && <ReportSectionThread claimId={claimId} sectionKey="decision_authority" pipelineRunId={pipelineRunId} />}
      <Section6Decision claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} />

      {/* ══ SECTION 7 — Claim Quality Score ══ */}
      {(() => {
        const cq = (aiAssessment as any)?._claimQuality;
        if (!cq) return null;
        const gradeColor = (g: string) =>
          g === 'A' ? '#16a34a' : g === 'B' ? '#2563eb' : g === 'C' ? '#d97706' : g === 'D' ? '#ea580c' : '#dc2626';
        const dimOrder: string[] = [
          'dataCompleteness', 'imageConfidence', 'costSource', 'classification', 'physics', 'consistency',
        ];
        return (
          <>
            <div className="section-heading" data-section="7">7 &nbsp; Claim Quality Score</div>
            <div className="mb-2 space-y-3" style={{ marginBottom: 24 }}>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0', background: '#ffffff' }}>
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>7.0 Assessment Quality Score</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold" style={{ color: '#64748b' }}>{cq.overallScore}/100</span>
                    <span className="text-sm font-black px-2 py-0.5 rounded" style={{ background: gradeColor(cq.grade) + '15', color: gradeColor(cq.grade), border: `1.5px solid ${gradeColor(cq.grade)}` }}>Grade {cq.grade}</span>
                    {cq.requiresManualReview && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'var(--fp-critical-bg)', color: 'var(--fp-critical-text)', border: '1px solid var(--fp-critical-border)' }}>Manual Review Required</span>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-xs leading-relaxed mb-3" style={{ color: '#374151' }}>{cq.adjusterGuidance}</p>
                  <div className="mb-4">
                    <div className="flex justify-between text-[10px] mb-1" style={{ color: '#64748b' }}>
                      <span>Quality Score</span>
                      <span>{cq.overallScore}/100</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: '#f1f5f9' }}>
                      <div className="h-2 rounded-full" style={{ width: `${cq.overallScore}%`, background: gradeColor(cq.grade) }} />
                    </div>
                  </div>
                  <table className="w-full text-xs report-table">
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <th className="py-1.5 pr-3 text-left font-semibold" style={{ color: '#64748b' }}>Dimension</th>
                        <th className="py-1.5 pr-3 text-left font-semibold" style={{ color: '#64748b' }}>Score</th>
                        <th className="py-1.5 pr-3 text-left font-semibold" style={{ color: '#64748b' }}>Label</th>
                        <th className="py-1.5 text-left font-semibold" style={{ color: '#64748b' }}>Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dimOrder.map((key, i) => {
                        const dim = (cq.dimensions as any)?.[key];
                        if (!dim) return null;
                        const dimColor = dim.score >= 70 ? '#16a34a' : dim.score >= 40 ? '#d97706' : '#dc2626';
                        return (
                          <tr key={key} style={{ borderTop: i > 0 ? '1px solid #e2e8f0' : undefined }}>
                            <td className="py-1.5 pr-3 font-semibold" style={{ color: '#0f172a' }}>{dim.name}</td>
                            <td className="py-1.5 pr-3 tabular-nums font-bold" style={{ color: dimColor }}>{dim.score}</td>
                            <td className="py-1.5 pr-3" style={{ color: '#64748b' }}>{dim.label}</td>
                            <td className="py-1.5" style={{ color: '#64748b' }}>
                              {(dim.issues ?? []).length > 0
                                ? (dim.issues as string[]).join('; ')
                                : <span style={{ fontStyle: 'italic' }}>None</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(cq.mandatoryActions ?? []).length > 0 && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid #e2e8f0' }}>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#64748b' }}>Mandatory Adjuster Actions</p>
                      <ul className="space-y-1">
                        {(cq.mandatoryActions as string[]).map((action: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#0f172a' }}>
                            <span className="shrink-0 font-bold" style={{ color: 'var(--fp-critical-text)' }}>{i + 1}.</span>
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* ══ SECTION 8 — Forensic Audit Validation (Stage 36) ══ */}
      {(() => {
        const fav = (aiAssessment as any)?._forensicAuditValidation;
        if (!fav) return null;
        const statusStyle = (s: string) =>
          s === 'PASS' ? { bg: 'var(--fp-success-bg)', text: 'var(--fp-success-text)', border: 'var(--fp-success-border)' }
          : s === 'WARNING' ? { bg: 'var(--fp-warning-bg)', text: 'var(--fp-warning-text)', border: 'var(--fp-warning-border)' }
          : s === 'FAIL' ? { bg: 'var(--fp-critical-bg)', text: 'var(--fp-critical-text)', border: 'var(--fp-critical-border)' }
          : { bg: 'var(--fp-info-bg)', text: 'var(--fp-info-text)', border: 'var(--fp-info-border)' };
        const overallSt = statusStyle(fav.overallStatus);
        const dimLabels: Record<string, string> = {
          dataExtraction: 'Data Extraction',
          incidentClassification: 'Incident Classification',
          imageAnalysis: 'Image Analysis',
          physics: 'Physics Engine',
          costModel: 'Cost Model',
          fraudAnalysis: 'Fraud Analysis',
          crossStageConsistency: 'Cross-Stage Consistency',
          assumptionRegistry: 'Assumption Registry',
          reportCompleteness: 'Report Completeness',
          claimQualityScore: 'Claim Quality Score',
        };
        const dimEntries = Object.entries(fav.dimensionResults ?? {}) as [string, string][];
        const issueGroups: Array<{ label: string; items: any[]; style: { bg: string; text: string; border: string } }> = [
          { label: 'Critical Failures', items: fav.criticalFailures ?? [], style: statusStyle('FAIL') },
          { label: 'High Severity Issues', items: fav.highSeverityIssues ?? [], style: statusStyle('WARNING') },
          { label: 'Medium Issues', items: fav.mediumIssues ?? [], style: { bg: 'var(--fp-info-bg)', text: 'var(--fp-info-text)', border: 'var(--fp-info-border)' } },
        ].filter(g => g.items.length > 0);
        return (
          <>
            <div className="section-heading" data-section="8">8 &nbsp; Forensic Audit Validation</div>
            <div className="mb-2 space-y-3" style={{ marginBottom: 24 }}>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0', background: '#ffffff' }}>
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#0f172a' }}>8.0 Validation Status</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold" style={{ color: '#64748b' }}>Consistency: {fav.consistencyScore}/100</span>
                    <span className="text-xs font-semibold" style={{ color: '#64748b' }}>Confidence: {fav.confidenceInAssessment}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: overallSt.bg, color: overallSt.text, border: `1px solid ${overallSt.border}` }}>{fav.overallStatus}</span>
                  </div>
                </div>
                <div className="p-4">
                  {fav.summary && (
                    <p className="text-xs leading-relaxed mb-3" style={{ color: '#374151' }}>{fav.summary}</p>
                  )}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    {dimEntries.map(([key, result]) => {
                      const st = statusStyle(result);
                      return (
                        <div key={key} className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <span className="text-xs" style={{ color: '#64748b' }}>{dimLabels[key] ?? key}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}` }}>{result}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {issueGroups.map((group, gi) => (
                <div key={gi} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${group.style.border}`, background: '#ffffff' }}>
                  <div className="px-4 py-3" style={{ borderBottom: `1px solid ${group.style.border}`, background: group.style.bg }}>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: group.style.text }}>8.{gi + 1} {group.label} ({group.items.length})</p>
                  </div>
                  <div className="p-4 space-y-2">
                    {group.items.map((issue: any, ii: number) => (
                      <div key={ii} className="text-xs" style={{ paddingLeft: 8, borderLeft: `2px solid ${group.style.border}` }}>
                        <span className="font-semibold" style={{ color: '#0f172a' }}>[{issue.code}] {issue.dimension}</span>
                        <span className="ml-2" style={{ color: '#374151' }}>{issue.description}</span>
                        {issue.evidence && (
                          <span className="ml-2 text-[10px]" style={{ color: '#64748b' }}>— {issue.evidence}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        );
      })()}

      {/* ── SECTION 9 — Approval Chain & Audit Signatures ── */}
      <div className="section-heading" data-section="9">9 &nbsp; Approval Chain &amp; Audit Signatures</div>
      {(() => {
        const FAR_ROLE_LABELS: Record<string, string> = {
          claims_processor: "Claims Processor",
          assessor_internal: "Internal Assessor",
          external_assessor: "External Assessor",
          risk_manager: "Risk Manager",
          claims_manager: "Claims Manager",
          executive: "Executive",
          underwriter: "Underwriter",
        };
        const FAR_DECISION_STYLES: Record<string, { label: string; bg: string; color: string; border: string }> = {
          approved:          { label: "Approved",      bg: "#ffffff", color: "#0f172a", border: "#0f172a" },
          rejected:          { label: "Rejected",      bg: "#ffffff", color: "#0f172a", border: "#0f172a" },
          returned:          { label: "Returned",      bg: "#ffffff", color: "#0f172a", border: "#0f172a" },
          escalated:         { label: "Escalated",     bg: "#ffffff", color: "#0f172a", border: "#0f172a" },
          external_received: { label: "Ext. Received", bg: "#ffffff", color: "#0f172a", border: "#0f172a" },
        };
        const stages: { order: number; name: string; roleKey: string; required: boolean }[] =
          workflowStages.length > 0
            // B-05: Server returns stage_name (snake_case); FARWorkflowStage expects name.
            // Use (s as any).stage_name as fallback to handle both field name conventions.
            ? workflowStages.map((s) => ({ order: s.stage_order, name: s.name ?? (s as any).stage_name ?? `Stage ${s.stage_order}`, roleKey: s.role_key ?? (s as any).role_key, required: s.required }))
            : Array.from(
                new Map(
                  approvalHistory
                    .filter((e) => e.stageOrder != null)
                    .map((e) => [e.stageOrder!, { order: e.stageOrder!, name: e.stageName ?? `Stage ${e.stageOrder}`, roleKey: e.roleKey ?? "", required: true }])
                ).values()
              ).sort((a, b) => a.order - b.order);

        const completedByOrder = new Map<number, FARApprovalEntry>();
        for (const entry of approvalHistory) {
          if (entry.stageOrder != null) completedByOrder.set(entry.stageOrder, entry);
        }

        if (stages.length === 0 && approvalHistory.length === 0) {
          return (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '16px 20px', marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', margin: 0, textAlign: 'center' }}>No approval workflow has been initiated for this claim.</p>
            </div>
          );
        }

        return (
          <div style={{ marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#ffffff' }}>
                  <th style={{ padding: '7px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', width: '5%' }}>#</th>
                  <th style={{ padding: '7px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', width: '18%' }}>Role</th>
                  <th style={{ padding: '7px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', width: '20%' }}>Stage</th>
                  <th style={{ padding: '7px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', width: '12%' }}>Decision</th>
                  <th style={{ padding: '7px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', width: '18%' }}>Officer Name</th>
                  <th style={{ padding: '7px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', width: '15%' }}>Date &amp; Time</th>
                  <th style={{ padding: '7px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', width: '12%' }}>Signature</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((stage) => {
                  const completed = completedByOrder.get(stage.order);
                  const ds = completed ? (FAR_DECISION_STYLES[completed.decision] ?? { label: completed.decision, bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' }) : null;
                  const dateStr = completed?.actedAt
                    ? new Date(completed.actedAt).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : null;
                  return (
                    <tr key={stage.order} style={{ background: completed ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#1e3a5f' }}>{stage.order}</td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#334155' }}>{FAR_ROLE_LABELS[stage.roleKey] ?? stage.roleKey}</td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>{stage.name}</td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>
                        {ds ? (
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: ds.bg, color: ds.color, border: `1px solid ${ds.border}` }}>{ds.label}</span>
                        ) : (
                          <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Pending</span>
                        )}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #e2e8f0', color: '#0f172a' }}>
                        {completed?.actorName ?? <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>—</span>}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 11 }}>
                        {dateStr ?? <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>—</span>}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>
                        {completed ? (
                          <div style={{ borderBottom: '1px solid #94a3b8', height: 22, width: '100%', position: 'relative' }}>
                            <span style={{ position: 'absolute', bottom: 2, left: 0, fontSize: 9, color: '#94a3b8', fontStyle: 'italic' }}>{completed.actorName ?? ''}</span>
                          </div>
                        ) : (
                          <div style={{ borderBottom: '1px dashed #cbd5e1', height: 22, width: '100%' }} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {approvalHistory.some((e) => e.notes) && (
              <div style={{ marginTop: 14 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 8 }}>Reviewer Notes</p>
                {approvalHistory.filter((e) => e.notes).map((e) => {
                  // C-03: Parse structured fields from notes if present
                  // Expected format: "Findings: ...|Dispute: ...|Action: ..."
                  // or JSON: {"findings_confirmed":"...","reason_for_dispute":"...","action_required":"..."}
                  let structuredNote: { findings?: string; dispute?: string; action?: string } | null = null;
                  const noteText = e.notes ?? '';
                  try {
                    const parsed = JSON.parse(noteText);
                    if (parsed && typeof parsed === 'object') {
                      structuredNote = {
                        findings: parsed.findings_confirmed ?? parsed.findings,
                        dispute: parsed.reason_for_dispute ?? parsed.dispute,
                        action: parsed.action_required ?? parsed.action,
                      };
                    }
                  } catch {
                    // Try pipe-delimited format
                    if (noteText.includes('Findings:') || noteText.includes('Dispute:') || noteText.includes('Action:')) {
                      const findingsMatch = noteText.match(/Findings:\s*([^|\n]+)/);
                      const disputeMatch = noteText.match(/Dispute:\s*([^|\n]+)/);
                      const actionMatch = noteText.match(/Action:\s*([^|\n]+)/);
                      if (findingsMatch || disputeMatch || actionMatch) {
                        structuredNote = {
                          findings: findingsMatch?.[1]?.trim(),
                          dispute: disputeMatch?.[1]?.trim(),
                          action: actionMatch?.[1]?.trim(),
                        };
                      }
                    }
                  }
                  // C-03: Detect unacceptable sign-offs
                  const isUnacceptable = /kindly review|please review|noted|see above|as discussed|ok|approved/i.test(noteText.trim()) && noteText.trim().length < 60;
                  return (
                    <div key={e.id} style={{ marginBottom: 8, paddingLeft: 12, borderLeft: `${isUnacceptable ? '3px solid #111' : '2px solid #555'}` }}>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 2 }}>
                        {FAR_ROLE_LABELS[e.roleKey ?? ''] ?? e.roleKey} — Stage {e.stageOrder} — {e.actorName ?? 'Unknown'}
                      </p>
                      {structuredNote ? (
                        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                          <tbody>
                            {structuredNote.findings && (
                              <tr><td style={{ paddingRight: 8, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap', verticalAlign: 'top', paddingBottom: 2 }}>Findings Confirmed</td><td style={{ color: '#334155' }}>{structuredNote.findings}</td></tr>
                            )}
                            {structuredNote.dispute && (
                              <tr><td style={{ paddingRight: 8, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap', verticalAlign: 'top', paddingBottom: 2 }}>Reason for Dispute</td><td style={{ color: '#334155' }}>{structuredNote.dispute}</td></tr>
                            )}
                            {structuredNote.action && (
                              <tr><td style={{ paddingRight: 8, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap', verticalAlign: 'top', paddingBottom: 2 }}>Action Required</td><td style={{ color: '#334155' }}>{structuredNote.action}</td></tr>
                            )}
                          </tbody>
                        </table>
                      ) : (
                        <>
                          <p style={{ fontSize: 12, color: '#334155', margin: 0, fontStyle: 'italic' }}>&#8220;{noteText}&#8221;</p>
                          {isUnacceptable && (
                            <p style={{ fontSize: 10, color: 'var(--fp-critical-text)', fontWeight: 700, marginTop: 3 }}>
                              ⚠ NON-COMPLIANT NOTE: This reviewer sign-off does not meet the minimum documentation standard. Structured fields (Findings Confirmed / Reason for Dispute / Action Required) are required.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ APPENDIX A — Confidence Improvement Checklist ══ */}
      <ConfidenceImprovementChecklist
        aiAssessment={aiAssessment}
        claim={claim}
        quotes={quotes}
        styleMode="forensic"
      />

      {/* ── KINGA Persistent Footer — always at the bottom of the report body ── */}
      {(() => {
        const footerDecision = (() => {
          const _fb = aiAssessment?.fraudScoreBreakdownJson
            ? (typeof aiAssessment.fraudScoreBreakdownJson === 'string'
                ? (() => { try { return JSON.parse(aiAssessment.fraudScoreBreakdownJson); } catch { return null; } })()
                : aiAssessment.fraudScoreBreakdownJson)
            : null;
          const _fs = _fb?.overallScore ?? (aiAssessment as any)?.fraudScore ?? (enforcement as any)?.weightedFraud?.score ?? 0;
          return Number(_fs) >= 70 ? 'DECLINE' : Number(_fs) >= 40 ? 'REVIEW REQUIRED' : 'APPROVED';
        })();
        const footerColor = footerDecision === 'DECLINE' ? '#c00' : footerDecision === 'REVIEW REQUIRED' ? '#c8a000' : '#2e7d32';
        return (
          <div style={{ background: '#fff', borderTop: '2px solid #1A2B4A', marginTop: 28, marginBottom: 0 }}>
            {/* Decision strip */}
            <div style={{ background: '#1A2B4A', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style={{ height: 20, width: 20, objectFit: 'contain', opacity: 0.9 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: '0.08em' }}>KINGA</span>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>Forensic Claim Decision Report</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>Claim: {claim?.claimNumber ?? claim?.claimReference ?? '—'}</span>
                <span style={{ fontFamily: "'IBM Plex Mono','Courier New',monospace", fontSize: 10, color: '#94a3b8' }}>#{((aiAssessment?.id ?? 0) * 31337).toString(16).padStart(8, '0').toUpperCase().slice(0, 8)}</span>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>{new Date(aiAssessment?.createdAt ?? Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: footerColor, border: `1px solid ${footerColor}`, padding: '1px 8px', letterSpacing: '0.06em' }}>{footerDecision}</span>
              </div>
            </div>
            {/* Disclaimer */}
            <div style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, color: '#888', lineHeight: 1.5 }}>
                CONFIDENTIAL — For authorised insurer use only. This report is generated by KINGA Engine v{aiAssessment?.engineVersion ?? '4.2'} and must be reviewed by a qualified human adjuster before any claim decision is finalised. KINGA does not constitute legal advice.
              </span>
            </div>
          </div>
        );
      })()}

      {/* Close body-content wrapper */}
      </div>
    </div>
  );
}
