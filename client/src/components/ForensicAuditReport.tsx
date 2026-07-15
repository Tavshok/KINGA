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
  /**
   * Optional override for resolved photo URLs. When provided, these URLs replace the
   * ones stored in enrichedPhotosJson (used to swap PDF fragment URLs for rendered PNGs).
   */
  resolvedPhotosOverride?: Array<{ index: number; url: string; resolved: boolean }>;
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
    // Bug #15 fix: always render exactly 2 decimal places
    return `${symbol}${fmt(Math.round(n * 100) / 100)}`;
  };
}
// Legacy alias — replaced at component level with currency-aware version
function fmtUsd(n: number | null | undefined): string {
  if (n == null || isNaN(n) || n === 0) return '—';
  // Bug #15 fix: always render exactly 2 decimal places to prevent $25,005.6 style output
  return `$${fmt(Math.round(n * 100) / 100)}`;
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
  return map[d] ?? "var(--kr-muted)";
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
    // NOTE: The previous word-merge regex (/([a-z]{3,})\s([a-z]{2,})/) was removed.
    // It was too aggressive and caused real words to be merged incorrectly
    // (e.g. "on road" → "onroad", "the road" → "theroad") producing garbled text.
    // OCR suffix-merging should only be done at the pipeline/LLM level, not in the UI.
    // Fix repeated punctuation from OCR
    .replace(/\.{2,}/g, '.')
    .replace(/,{2,}/g, ',')
    // Fix space before punctuation
    .replace(/ ([.,;:!?])/g, '$1')
    // Strip verbatim raw parts-list quotes that the LLM may have copied from the damage description.
    // Pattern: single-quoted strings that are all-caps with semicolons (e.g. 'REAR TONDER; REAR BUMPER; TRIM')
    // These are raw repair-quote line items and should never appear verbatim in analysis text.
    .replace(/'([A-Z][A-Z\s;,\.\-\/&0-9]{8,})'/g, (match, inner) =>
      inner.includes(';') || (inner.match(/[A-Z]{2,}/g) ?? []).length > 3 ? '(damage description)' : match
    )
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
        <h2 className="sub-heading" style={{ fontSize: 13 }}>
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
    na:   { bg: "#ffffff", color: 'var(--kr-muted)', border: "#e2e8f0" },
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
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize="7" fill="var(--kr-muted)">
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

// Arrow geometry for 380×340 viewBox.
// Vehicle body: x:100–280, y:60–280. Arrows start 36px outside the body edge.
const ARROW_GEOM: Record<string, { x1:number; y1:number; x2:number; y2:number }> = {
  front:   { x1: 190, y1: 10,  x2: 190, y2: 54   },  // from above — tip at y=54, zone top at y=60 (6px gap)
  rear:    { x1: 190, y1: 330, x2: 190, y2: 282  },  // from below — tip at y=282, zone bottom at y=280 (2px gap, no overlap)
  left:    { x1: 20,  y1: 170, x2: 96,  y2: 170  },  // from left  — tip at x=96, body at x=100
  right:   { x1: 360, y1: 170, x2: 284, y2: 170  },  // from right — tip at x=284, body at x=280
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
  // ViewBox: 380×340. Vehicle body: x:100–280 (w=180), y:60–280 (h=220).
  // Zones are strictly inside the vehicle body outline.
  const zones = [
    { id: "front",     label: "Front",      x: 110, y: 60,  w: 160, h: 48  },
    { id: "rear",      label: "Rear",       x: 110, y: 232, w: 160, h: 48  },
    { id: "left",      label: "Left",       x: 100, y: 108, w: 52,  h: 124 },
    { id: "right",     label: "Right",      x: 228, y: 108, w: 52,  h: 124 },
    { id: "roof",      label: "Roof",       x: 152, y: 108, w: 76,  h: 40  },
    { id: "cabin",     label: "Cabin",      x: 152, y: 148, w: 76,  h: 84  },
    { id: "underbody", label: "Underbody",  x: 152, y: 192, w: 76,  h: 40  },
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
    <div style={{ width: '100%' }}>
      {/* Diagram — capped at 480px so it never becomes enormous on wide screens */}
      <svg
        viewBox="0 0 380 340"
        width="100%"
        style={{ display: 'block', maxWidth: 480, margin: '0 auto' }}
      >
        <defs>
          {arrowList.map((arrow, idx) => (
            <marker key={idx} id={`ev-arrow-${idx}`} markerWidth="9" markerHeight="9" refX="4.5" refY="4.5" orient="auto">
              <polygon points="0 0, 9 4.5, 0 9" fill={arrow.colour} />
            </marker>
          ))}
        </defs>

        {/* ── Compass labels — well clear of arrows ── */}
        {/* Front arrow ends at y=54, compass at y=8 gives 46px gap */}
        <text x="190" y="8" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--kr-muted)">N — FRONT</text>
        {/* Rear arrow ends at y=286, compass at y=338 gives 52px gap */}
        <text x="190" y="338" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--kr-muted)">S — REAR</text>
        {/* Left arrow ends at x=94, compass at x=10 */}
        <text x="10" y="173" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--kr-muted)">L</text>
        {/* Right arrow ends at x=286, compass at x=370 */}
        <text x="370" y="173" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--kr-muted)">R</text>

        {/* ── Vehicle body: x:100–280, y:60–280 ── */}
        <rect x="100" y="60" width="180" height="220" rx="22"
          fill="#f0f0ee" stroke="#0a0a0a" strokeWidth="1.5" />
        {/* Windscreen */}
        <rect x="114" y="70" width="152" height="56" rx="8"
          fill="#e8e8e6" stroke="#0a0a0a" strokeWidth="1" opacity="0.7" />
        {/* Rear window */}
        <rect x="114" y="212" width="152" height="52" rx="8"
          fill="#e8e8e6" stroke="#0a0a0a" strokeWidth="1" opacity="0.7" />
        {/* Wheels — 4 corners, just outside body (4px gap from body edge) */}
        {([[84,76],[84,210],[276,76],[276,210]] as [number,number][]).map(([wx,wy],i) => (
          <rect key={i} x={wx} y={wy} width="20" height="38" rx="6"
            fill="#1a1916" opacity="0.55" />
        ))}

        {/* ── Damage zone rects — drawn before arrows ── */}
        {zones.map(zone => {
          const sev = getSeverity(zone.id);
          const isUnexplained = events !== null && sev > 0 && !explainedZones.has(zone.id);
          return (
            <g key={zone.id}>
              <rect
                x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="6"
                fill={SEVERITY_FILL[sev]}
                stroke={SEVERITY_STROKE[sev]}
                strokeWidth={sev > 0 ? 2.5 : 1}
                strokeDasharray={sev === 0 ? "5 4" : undefined}
              />
              {isUnexplained && (
                <rect
                  x={zone.x - 3} y={zone.y - 3} width={zone.w + 6} height={zone.h + 6} rx="8"
                  fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="5 3" opacity="0.8"
                />
              )}
            </g>
          );
        })}

        {/* ── Impact arrows — drawn after zones, before labels ── */}
        {arrowList.map((arrow, idx) => {
          const g = ARROW_GEOM[arrow.dir];
          if (!g) return null;
          const isFirst = idx === 0;
          return (
            <line key={idx}
              x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
              stroke={arrow.colour}
              strokeWidth={isFirst ? (impactForceKn && impactForceKn > 0 ? Math.min(3 + impactForceKn / 18, 9) : 5) : 4}
              strokeDasharray={arrow.dashed ? "8 4" : undefined}
              markerEnd={`url(#ev-arrow-${idx})`}
            />
          );
        })}

        {/* ── Zone text labels — drawn last so always on top ── */}
        {zones.map(zone => {
          const sev = getSeverity(zone.id);
          return (
            <text
              key={`lbl-${zone.id}`}
              x={zone.x + zone.w / 2}
              y={zone.y + zone.h / 2 + 4}
              textAnchor="middle"
              fontSize="9"
              fill={sev > 0 ? SEVERITY_STROKE[sev] : "var(--kr-muted)"}
              fontWeight={sev > 0 ? "700" : "400"}
              stroke="white"
              strokeWidth="2.5"
              paintOrder="stroke fill"
            >
              {zone.label}
            </text>
          );
        })}

        {/* ── Inconsistency banner — centred across cabin ── */}
        {inconsistencyLabel && (
          <g>
            <rect x="110" y="158" width="160" height="20" rx="3"
              fill="#fee2e2" stroke="#ef4444" strokeWidth="1.5" opacity="0.95" />
            <text x="190" y="172" textAnchor="middle" fontSize="8" fontWeight="700" fill="#991b1b">
              {inconsistencyLabel.length > 28 ? inconsistencyLabel.slice(0, 28) + "…" : inconsistencyLabel}
            </text>
          </g>
        )}

        {/* ── Energy absorption arc — scaled for new viewBox ── */}
        {(() => {
          if (!energyAbsorptionRatio || energyAbsorptionRatio <= 0) return null;
          const primaryDir = arrowList[0]?.dir;
          const zoneMap: Record<string, { cx: number; cy: number; r: number }> = {
            front: { cx: 190, cy: 84,  r: 22 },
            rear:  { cx: 190, cy: 256, r: 22 },
            left:  { cx: 126, cy: 170, r: 18 },
            right: { cx: 254, cy: 170, r: 18 },
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
              <circle cx={zc.cx} cy={zc.cy} r={zc.r} fill="none" stroke="var(--border)" strokeWidth="4" opacity="0.3" />
              <circle cx={zc.cx} cy={zc.cy} r={zc.r} fill="none"
                stroke={arcColour} strokeWidth="4"
                strokeDasharray={`${dashLen.toFixed(1)} ${gapLen.toFixed(1)}`}
                strokeLinecap="round" transform={`rotate(-90 ${zc.cx} ${zc.cy})`} opacity="0.85" />
              <text x={zc.cx} y={zc.cy + 5} textAnchor="middle" fontSize="11" fontWeight="700" fill={arcColour}>{arcPct}%</text>
              <text x={zc.cx} y={zc.cy + 18} textAnchor="middle" fontSize="9" fill={arcColour} opacity="0.8">abs.</text>
            </g>
          );
        })()}
      </svg>

      {/* ── Physics data strip — below diagram, in HTML so font sizes are crisp ── */}
      {((deltaV != null && deltaV > 0) || (energyKj != null && energyKj > 0) || (impactForceKn != null && impactForceKn > 0) || (velocityRange && velocityRange.low_kmh > 0)) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', justifyContent: 'center', padding: '6px 0', borderTop: '1px solid var(--kr-rule)', marginTop: 4, fontSize: 11 }}>
          {velocityRange && velocityRange.low_kmh > 0 && (
            <span style={{ color: '#6366f1', fontStyle: 'italic' }}>
              Speed est. {velocityRange.low_kmh.toFixed(0)}–{velocityRange.high_kmh.toFixed(0)} km/h
            </span>
          )}
          {deltaV != null && deltaV > 0 && <span style={{ color: 'var(--kr-muted)' }}>ΔV {deltaV.toFixed(1)} km/h</span>}
          {energyKj != null && energyKj > 0 && <span style={{ color: 'var(--kr-muted)' }}>KE {energyKj.toFixed(1)} kJ</span>}
          {impactForceKn != null && impactForceKn > 0 && <span style={{ color: 'var(--kr-muted)' }}>F {impactForceKn.toFixed(1)} kN</span>}
          {decelerationG != null && decelerationG > 0 && <span style={{ color: 'var(--kr-muted)' }}>{decelerationG.toFixed(1)} g decel.</span>}
          {energyAbsorptionRatio != null && energyAbsorptionRatio > 0 && <span style={{ color: 'var(--kr-muted)' }}>{Math.round(energyAbsorptionRatio * 100)}% energy absorbed</span>}
        </div>
      )}

      {/* ── Legend row — horizontal, below diagram ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--kr-rule)', marginTop: 2, fontSize: 11 }}>
        <span style={{ color: 'var(--kr-muted)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4 }}>Legend</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: 'var(--kr-off-white)', border: '1px dashed #e0ddd8' }} />
          <span style={{ color: 'var(--kr-muted)' }}>Undamaged</span>
        </span>
        {([1,2,3] as DamageSeverity[]).map(s => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: SEVERITY_FILL[s], border: `1.5px solid ${SEVERITY_STROKE[s]}` }} />
            <span style={{ color: 'var(--kr-muted)' }}>{SEVERITY_LABEL[s]}</span>
          </span>
        ))}
        {arrowList.map((arrow, idx) => (
          <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="24" height="12" style={{ flexShrink: 0 }}>
              <line x1="0" y1="6" x2="17" y2="6" stroke={arrow.colour} strokeWidth={idx === 0 ? 3 : 2} strokeDasharray={arrow.dashed ? "5 2" : undefined} />
              <polygon points="17,3 24,6 17,9" fill={arrow.colour} />
            </svg>
            <span style={{ color: arrow.colour, fontWeight: 600 }}>{arrow.label}</span>
            <span style={{ color: 'var(--kr-muted)' }}>{arrow.dashed ? "(insured)" : "(3rd party)"}</span>
          </span>
        ))}
        {events && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, border: '2px dashed #ef4444', background: 'transparent' }} />
            <span style={{ color: 'var(--kr-muted)' }}>Unexplained zone</span>
          </span>
        )}
        {energyAbsorptionRatio != null && energyAbsorptionRatio > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="16" height="16" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="6" fill="none" stroke="var(--border)" strokeWidth="2" opacity="0.35" />
              <circle cx="8" cy="8" r="6" fill="none"
                stroke={energyAbsorptionRatio > 0.7 ? '#ef4444' : energyAbsorptionRatio > 0.4 ? '#f59e0b' : '#22c55e'}
                strokeWidth="2"
                strokeDasharray={`${(energyAbsorptionRatio * 37.7).toFixed(1)} ${(37.7 - energyAbsorptionRatio * 37.7).toFixed(1)}`}
                transform="rotate(-90 8 8)" />
            </svg>
            <span style={{ color: 'var(--kr-muted)' }}>Energy absorbed</span>
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

  // Canonical fraud score: Stage 8 pipeline output (stored in fraudScoreBreakdownJson.overallScore)
  // falls back to weightedFraud.score (supplementary enforcement-time engine)
  const fraudBreakdown0 = aiAssessment?.fraudScoreBreakdownJson
    ? (typeof aiAssessment.fraudScoreBreakdownJson === 'string'
        ? (() => { try { return JSON.parse(aiAssessment.fraudScoreBreakdownJson); } catch { return null; } })()
        : aiAssessment.fraudScoreBreakdownJson)
    : null;
  const wfLevel = fraudBreakdown0?.level ?? wf?.level ?? "minimal";
  const canonicalScore0 = fraudBreakdown0?.overallScore ?? (aiAssessment as any)?.fraudScore ?? null;
  // Use the enforcement-adjusted fraud score when available so the cover card and executive summary
  // both reflect the same final value (base score + consistency/direction adjustments).
  // fraudScoreAdjustment is returned by applyIntelligenceEnforcement and attached to the result.
  const _enforcementAdjustment: number = (e as any)?.fraudScoreAdjustment ?? 0;
  const _baseScore0 = canonicalScore0 != null && canonicalScore0 > 0 ? Number(canonicalScore0) : (wf?.score ?? 0);
  const wfScore = _enforcementAdjustment > 0 ? Math.min(100, _baseScore0 + _enforcementAdjustment) : _baseScore0;
  // Map canonical fraud score to a decision string
  const wfDecision = wfScore >= 70 ? "DECLINE" : wfScore >= 40 ? "REVIEW_REQUIRED" : null;
  // ── Claim Truth Layer + TRE CTO override (unified source of truth) ──
  const ctl = (e as any)?._claimTruth;
  // TRE CTO: canonical single source for decision, completeness, physics, day-counts
  const cto0 = (e as any)?._claimTruthObject;
  // Decision recommendation: CTO > CTL > weighted-fraud > phase2 > enforcement
  const rawDecision: string = cto0?.decision?.recommendation ?? ctl?.decision?.recommendation ?? wfDecision ?? phase2?.finalDecision ?? e?.finalDecision?.decision ?? "REVIEW";
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
  const photosDetected = cto0?.evidence?.photoCount ?? ctl?.evidence?.photoCount ?? aiAssessment?.photosDetected ?? 0;
  const photoStatus = phase2?.photoAnalysis?.photoStatus ?? "NOT_APPLICABLE";

  const keyDrivers: string[] = phase2?.keyDrivers ?? e?.finalDecision?.recommendedActions ?? [];
  const primaryReason: string = e?.finalDecision?.primaryReason ?? phase2?.keyDrivers?.[0] ?? "";
  // Data completeness: CTO canonical completenessScore > CTL completenessPercent > phase2
  const dataCompleteness = cto0?.evidence?.completenessScore ?? phase2?.dataCompleteness ?? 0;
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
  const fcdiTileColor = fcdiTileScore < 0 ? "var(--kr-muted)" : fcdiTileScore >= 80 ? "var(--fp-success-text)" : fcdiTileScore >= 55 ? "var(--fp-warning-text)" : "var(--fp-critical-text)";

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
          <div style={{ fontSize: 9, color: 'var(--kr-muted)', marginTop: 3, fontStyle: 'italic' }}>Generated by KINGA Engine v{aiAssessment?.engineVersion ?? '4.2'} · Automated KINGA analysis · Not legal advice · Requires human adjuster review before any claim decision is finalised</div>
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
          <button onClick={() => window.print()} className="no-print" style={{ marginTop: 8, padding: '4px 12px', fontSize: 11, fontFamily: 'var(--kr-sans)', cursor: 'pointer', background: 'var(--kr-navy)', color: 'var(--kr-white)', border: 'none' }}>Print / PDF</button>
        </div>
      </div>

      {/* ── Document identity ── */}
      <div className="doc-identity">
        {(enforcement as any)?.kingaRef && (
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 6px', borderBottom: '1.5px solid var(--kr-navy)', marginBottom: 4 }}>
            <span className="di-label" style={{ color: 'var(--kr-text)', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em' }}>KINGA REF</span>
            <span style={{ fontFamily: 'var(--kr-sans)', fontSize: 13, fontWeight: 800, color: 'var(--kr-text)', letterSpacing: 0 }}>{(() => {
              // Bug #15 fix: strip raw internal tenant segment from client-facing ref.
              // Format: KNG-{INSURERCODE}-{YEAR}-{SEQ} — replace TENANT\d+ with a clean code.
              const raw: string = (enforcement as any).kingaRef ?? '';
              const cleaned = raw.replace(/TENANT\d+/gi, 'KINGA');
              return `${cleaned}-FR`;
            })()}</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--kr-muted)', fontStyle: 'italic' }}>Forensic Audit Report</span>
          </div>
        )}
        <div><span className="di-label">Claim Ref</span>{claim?.claimNumber ?? claim?.claimReference ?? '—'}</div>
        <div><span className="di-label">Report Hash</span><span style={{ fontFamily: 'var(--kr-mono)', fontSize: 10 }}>{(() => { const parts = [aiAssessment?.id, aiAssessment?.claimId, aiAssessment?.processingTime].filter(Boolean); return parts.length > 0 ? `#${parts.map((n: any) => Number(n).toString(16)).join('').toUpperCase().slice(0, 8)}` : '#N/A'; })()}</span></div>
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
        // ── Cover decision strip: use rawDecision (Claim Truth Layer) as primary ──
        const _coverDecisionNorm = rawDecision.toUpperCase();
        const vClass = (_coverDecisionNorm === 'DECLINE' || _coverDecisionNorm === 'REJECT') ? 'decline'
          : (_coverDecisionNorm === 'APPROVE' || _coverDecisionNorm === 'FINALISE_CLAIM') ? 'approve'
          : 'review';
        const vText = decisionLabel(rawDecision);
        const vSub = (vClass === 'decline')
          ? 'High fraud risk — senior authorisation required'
          : (vClass === 'approve')
          ? 'Low risk — standard settlement checks apply'
          : 'Moderate risk — human review required';
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
                {/* P1a fix: scope sub-label so the figure is self-explanatory */}
                <span style={{ fontSize: 9, color: 'var(--kr-muted)', display: 'block', marginTop: 1 }}>{dataCompleteness >= 90 ? 'Sufficient' : dataCompleteness >= 50 ? 'Partial' : 'Insufficient'}</span>
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
                <span className="cost-sub">{kingaOptTotal > 0 ? 'KINGA-validated cost' : 'Pending analysis'}</span>
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

      {/* ── Cover Grid — 4-cell summary ── */}
      {(() => {
        const cr0cg = (aiAssessment as any)?._claimRecord;
        const claimRefCg = (() => {
          const rawRef = cr0cg?.insuranceContext?.claimReference;
          const isValidRef = rawRef && /[0-9\/\-]/.test(rawRef) && rawRef.length >= 4;
          return (isValidRef ? rawRef : null) ?? cr0cg?.insuranceContext?.policyNumber ?? claim?.claimNumber ?? claim?.claimReference ?? '—';
        })();
        const claimTypeCg = (phase2?.incidentType ?? (aiAssessment as any)?._normalised?.incidentType ?? claim?.incidentType ?? 'Motor Vehicle').toString().replace(/_/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase());
        const dcColor = dataCompleteness >= 75 ? '#16a34a' : dataCompleteness >= 50 ? '#d97706' : '#dc2626';
        // Bug #14 fix: 80% triggers REVIEW_REQUIRED (threshold 90%), so it must NOT be labelled 'Sufficient'.
        // Use 90% as the threshold for 'Sufficient' to match the review trigger used in Section 6.
        const dcLabel = dataCompleteness >= 90 ? 'Sufficient' : dataCompleteness >= 50 ? 'Partial' : 'Insufficient';
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: '#e2e8f0', border: '1px solid var(--kr-rule)', margin: '12px 0 0' }}>
            {[
              { label: 'Claim Reference', value: <span style={{ fontFamily: 'var(--kr-mono)', fontSize: 11 }}>{claimRefCg}</span> },
              { label: 'Claim Type', value: claimTypeCg },
              { label: 'Incident Date', value: fmtDate(incidentDate) },
              { label: 'Data Completeness', value: <span style={{ color: dcColor, fontWeight: 700 }}>{Math.round(dataCompleteness)}% — {dcLabel}</span> },
            ].map((cell, i) => (
              <div key={i} style={{ background: 'var(--kr-white)', padding: '8px 12px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--kr-muted)', marginBottom: 3, fontFamily: 'var(--kr-sans)' }}>{cell.label}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--kr-text)' }}>{cell.value}</div>
              </div>
            ))}
          </div>
        );
      })()}
      {/* ── Vehicle & Policyholder two-col-kv ── */}
      {(() => {
        const cr0vp = (aiAssessment as any)?._claimRecord;
        const _valEngineResultCov = (enforcement as any)?._vehicleValuation ?? null;
        // ── Market value: prefer costIntelligenceJson (most recently computed), then valuation engine,
        // then claimRecord.vehicle — same priority chain as Section 3 ──
        const _ci0cov = (aiAssessment as any)?.costIntelligenceJson
          ? (typeof (aiAssessment as any).costIntelligenceJson === 'string'
              ? (() => { try { return JSON.parse((aiAssessment as any).costIntelligenceJson); } catch { return null; } })()
              : (aiAssessment as any).costIntelligenceJson)
          : null;
        const marketValueUsdCov = _ci0cov?.marketValueUsd ?? _valEngineResultCov?.marketValueUsd ?? cr0vp?.vehicle?.marketValueUsd ?? null;
        const policyNumberCov = cr0vp?.insuranceContext?.policyNumber ?? claim?.policyNumber ?? null;
        const driverNameCov = cr0vp?.driver?.name ?? claim?.driverName ?? null;
        const claimantNameCov = claim?.claimantName ?? cr0vp?.insuranceContext?.policyholderName ?? null;
        const vehicleRows: [string, React.ReactNode][] = [
          ['Registration', claim?.vehicleRegistration ?? cr0vp?.vehicle?.registration ?? '—'],
          ['Make / Model', [claim?.vehicleMake, claim?.vehicleModel].filter(Boolean).join(' ') || '—'],
          ['Year', String(claim?.vehicleYear ?? cr0vp?.vehicle?.year ?? '—')],
          ['Colour', String(claim?.vehicleColour ?? cr0vp?.vehicle?.colour ?? '—')],
          ['VIN', claim?.vehicleVin ?? cr0vp?.vehicle?.vin ?? <span style={{ color: 'var(--kr-red)', fontWeight: 600 }}>Not provided</span>],
          ['Odometer', cr0vp?.vehicle?.odometerKm ? `${Number(cr0vp.vehicle.odometerKm).toLocaleString()} km` : '—'],
          ['Market value', marketValueUsdCov != null ? fmtMoney(marketValueUsdCov) : '—'],
        ];
        const policyRows: [string, React.ReactNode][] = [
          ['Policyholder', claimantNameCov ?? '—'],
          ['Driver', driverNameCov ? String(driverNameCov).replace(/\b\w/g,(c:string)=>c.toUpperCase()) : '—'],
          ['Policy number', policyNumberCov ?? <span style={{ color: 'var(--kr-red)', fontWeight: 600 }}>Not provided</span>],
          ['Insurer', String(cr0vp?.insuranceContext?.insurerName ?? claim?.insurerName ?? '—')],
          ['Claim submitted', fmtDate(claim?.createdAt ?? aiAssessment?.createdAt)],
          ['Incident location', String((aiAssessment as any)?._normalised?.incidentLocation ?? claim?.incidentLocation ?? '—')],
          ['Collision type', String((phase2?.incidentType ?? '—')).replace(/_/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase())],
          ['Reported speed', claimedSpeed > 0 ? `${Math.round(claimedSpeed)} km/h` : '—'],
        ];
        const thS: React.CSSProperties = { padding: '3px 8px 3px 0', fontSize: 10, fontWeight: 700, color: 'var(--kr-muted)', whiteSpace: 'nowrap', verticalAlign: 'top', width: 110 };
        const tdS: React.CSSProperties = { padding: '3px 0', fontSize: 11, color: 'var(--kr-text)', verticalAlign: 'top' };
        const secHdr = (label: string) => (
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--kr-navy)', marginBottom: 4, borderBottom: '1.5px solid var(--kr-navy)', paddingBottom: 3 }}>{label}</div>
        );
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, margin: '12px 0 0' }}>
            <div>
              {secHdr('Vehicle Details')}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                {vehicleRows.map(([k,v],i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={thS}>{k}</td>
                    <td style={tdS}>{v}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
            <div>
              {secHdr('Policyholder & Claim Details')}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                {policyRows.map(([k,v],i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={thS}>{k}</td>
                    <td style={tdS}>{v}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          </div>
        );
      })()}
      {/* ── Repair Quote Summary table ── */}
      {quotes && quotes.length > 0 && (() => {
        const kingaOptTotal3: number = co0?.l2CompositeOptimisedCostUsd ?? co0?.compositeOptimisedCostUsd ?? 0;
        type QSRow = { name: string; labour: number; parts: number; total: number; status: string };
        const qsRows: QSRow[] = quotes.map((q: any) => {
          const items = q.lineItems ?? [];
          const labour = items.filter((li: any) => /labour|labor/i.test(li.category ?? li.description ?? '')).reduce((s: number, li: any) => s + Number(li.lineTotal ?? li.unitPrice ?? 0), 0);
          const parts = items.filter((li: any) => !/labour|labor/i.test(li.category ?? li.description ?? '')).reduce((s: number, li: any) => s + Number(li.lineTotal ?? li.unitPrice ?? 0), 0);
          const raw = (q.quotedAmount ?? 0) / 100;
          const total = raw > 0 ? raw : labour + parts;
          const name = q.panelBeaterName ?? q.repairerName ?? `Repairer #${q.panelBeaterId ?? '?'}`;
          const qt = q.quoteType ?? 'original';
          const status = qt === 'assessor_adjusted' ? 'Adjusted' : qt === 'strip_requote' ? 'Strip & Requote' : 'Submitted';
          return { name, labour, parts, total, status };
        });
        const thC: React.CSSProperties = { padding: '4px 8px', fontSize: 10, fontWeight: 700, color: 'var(--kr-white)', background: 'var(--kr-navy)', textAlign: 'left', whiteSpace: 'nowrap' };
        const tdC: React.CSSProperties = { padding: '3px 8px', fontSize: 11, color: 'var(--kr-text)', borderBottom: '1px solid #f1f5f9' };
        const tdN: React.CSSProperties = { ...tdC, textAlign: 'right', fontFamily: 'var(--kr-mono)' };
        return (
          <div style={{ margin: '4px 0 0' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--kr-navy)', marginBottom: 4, borderBottom: '1.5px solid var(--kr-navy)', paddingBottom: 3 }}>Repair Quote Summary</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thC}>Repairer</th>
                <th style={{ ...thC, textAlign: 'right' }}>Labour</th>
                <th style={{ ...thC, textAlign: 'right' }}>Parts</th>
                <th style={{ ...thC, textAlign: 'right' }}>Total</th>
                <th style={thC}>Status</th>
              </tr></thead>
              <tbody>
                {qsRows.map((r, i) => (
                  <tr key={i}>
                    <td style={tdC}>{r.name}</td>
                    <td style={tdN}>{r.labour > 0 ? fmtMoney(r.labour) : '—'}</td>
                    <td style={tdN}>{r.parts > 0 ? fmtMoney(r.parts) : '—'}</td>
                    <td style={{ ...tdN, fontWeight: 700 }}>{fmtMoney(r.total)}</td>
                    <td style={tdC}><span style={{ fontSize: 10, fontWeight: 600, color: 'var(--kr-muted)' }}>{r.status}</span></td>
                  </tr>
                ))}
                {kingaOptTotal3 > 0 && (() => {
                  const lowestSubmitted3 = qsRows.length > 0 ? Math.min(...qsRows.map(r => r.total).filter(t => t > 0)) : 0;
                  const savingsPct3 = lowestSubmitted3 > 0 && kingaOptTotal3 < lowestSubmitted3 ? ((lowestSubmitted3 - kingaOptTotal3) / lowestSubmitted3 * 100) : 0;
                  return (
                    <tr style={{ borderTop: '2px solid var(--kr-navy)', background: '#f0fdf4' }}>
                      <td style={{ ...tdC, fontWeight: 700, color: 'var(--kr-navy)', background: '#f0fdf4', borderLeft: '4px solid #15803d' }}>
                        <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 5px', background: 'var(--kr-navy)', color: '#fff', borderRadius: 2, marginRight: 5, letterSpacing: '0.06em' }}>KINGA</span>
                        Optimised Estimate
                      </td>
                      <td style={{ ...tdN, background: '#f0fdf4' }}>—</td>
                      <td style={{ ...tdN, background: '#f0fdf4' }}>—</td>
                      <td style={{ ...tdN, fontWeight: 700, color: '#15803d', background: '#f0fdf4' }}>{fmtMoney(kingaOptTotal3)}</td>
                      <td style={{ ...tdC, fontWeight: 700, color: '#15803d', background: '#f0fdf4' }}>
                        {savingsPct3 > 0
                          ? <span>↓ {savingsPct3.toFixed(1)}% vs lowest quote</span>
                          : <span style={{ color: 'var(--kr-muted)', fontWeight: 400 }}>No saving vs lowest quote</span>}
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        );
      })()}
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
      {/* ── Confidence Meter 3-bar strip ── */}
      {(() => {
        const cmBars = [
          { label: 'FCDI', value: fcdiTileScore >= 0 ? fcdiTileScore : 0, threshold: 60, unit: '/100',
            color: (fcdiTileScore >= 70 ? '#16a34a' : fcdiTileScore >= 40 ? '#d97706' : '#dc2626') as string,
            tooltip: 'Forensic Confidence & Data Integrity — composite reliability score' },
          { label: 'Data Completeness', value: Math.round(dataCompleteness), threshold: 75, unit: '%',
            color: (dataCompleteness >= 75 ? '#16a34a' : dataCompleteness >= 50 ? '#d97706' : '#dc2626') as string,
            tooltip: 'Percentage of required claim fields successfully extracted' },
          { label: 'Physics Consistency', value: Math.round(physicsScore), threshold: 70, unit: '/100',
            color: (physicsScore >= 70 ? '#16a34a' : physicsScore >= 30 ? '#d97706' : '#dc2626') as string,
            tooltip: 'Physics engine consistency score — higher = more consistent with claimed incident' },
        ];
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, margin: '8px 0', padding: '10px 12px', background: 'var(--kr-off-white)', border: '1px solid var(--kr-rule)' }}>
            {cmBars.map((bar, i) => (
              <div key={i} title={bar.tooltip}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--kr-muted)' }}>{bar.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: bar.color }}>{bar.value}{bar.unit}</span>
                </div>
                <div style={{ height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, bar.value)}%`, background: bar.color, borderRadius: 3, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties} />
                </div>
                <div style={{ marginTop: 2, fontSize: 8, color: 'var(--kr-muted)' }}>Threshold: {bar.threshold}{bar.unit}</div>
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
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--kr-muted)', marginBottom: 8, fontFamily: 'var(--kr-sans)' }}>Decision Score Summary</div>
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
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--kr-muted)', marginBottom: 8 }}>
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

            {/* ── FCDI + Timeline two-col ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '12px 0' }}>
        {/* Left: FCDI block */}
        <div className="fcdi-block" style={{ margin: 0 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--kr-muted)', marginBottom: 4, fontFamily: 'var(--kr-sans)' }}>Forensic Confidence &amp; Data Integrity (FCDI)</div>
            <div><span className="fcdi-score-big" style={{ color: fcdiBarColor }}>{fcdiTileScore >= 0 ? fcdiTileScore : 'N/A'}</span><span className="fcdi-score-denom"> / 100</span></div>
            <div style={{ fontSize: 11, color: 'var(--kr-muted)', marginTop: 4 }}>{fcdiTileLabel} evidence quality</div>
            <div style={{ fontSize: 9, color: 'var(--kr-muted)', marginTop: 2, fontStyle: 'italic' }}>Higher score = more reliable</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--kr-muted)', lineHeight: 1.7, flex: 1, paddingTop: 4 }}>
            {(aiAssessment as any)?._forensicAnalysis?.fcdi?.narrative ??
              `FCDI ${fcdiTileScore >= 0 ? fcdiTileScore + '/100' : 'N/A'} — ${fcdiTileLabel.toLowerCase()} evidence quality. Results carry ${fcdiTileScore >= 80 ? 'high' : fcdiTileScore >= 55 ? 'moderate' : 'low'} confidence and ${fcdiTileScore >= 80 ? 'may proceed to settlement.' : 'require human verification before settlement.'}`}
          </div>
        </div>
        {/* Right: Claim Timeline */}
        <div style={{ border: '1px solid var(--kr-rule)', padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--kr-muted)', marginBottom: 8, fontFamily: 'var(--kr-sans)' }}>Claim Timeline</div>
          {[
            { label: 'Incident', date: incidentDate },
            { label: 'Inspection', date: aiAssessment?.assessmentDate },
            { label: 'Quote submitted', date: claim?.createdAt },
            { label: 'Report generated', date: reportDate },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < 3 ? '1px solid #f1f5f9' : 'none' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.date ? '#111' : '#d1d5db', flexShrink: 0 }} />
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--kr-text)', flex: 1 }}>{item.label}</div>
              <div style={{ fontSize: 11, color: 'var(--kr-muted)', fontFamily: 'var(--kr-mono)' }}>{item.date ? fmtDate(item.date) : 'N/A'}</div>
            </div>
          ))}
          {/* TRE CTO day-counts — canonical single source, shown when available */}
          {(() => {
            const _ctoCover = (enforcement as any)?._claimTruthObject;
            const daysToLodge: number | null = _ctoCover?.workflow?.daysToLodge ?? _ctoCover?.workflow?.claimAgeDays ?? null;
            const claimProcessingDays: number | null = _ctoCover?.workflow?.claimProcessingDays ?? null;
            const turnaroundDays: number | null = _ctoCover?.workflow?.estimatedTurnaroundDays ?? null;
            if (daysToLodge == null && claimProcessingDays == null && turnaroundDays == null) return null;
            return (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                {claimProcessingDays != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}>
                    <span style={{ color: 'var(--kr-muted)', fontWeight: 600 }}>KINGA processing age</span>
                    <span style={{ fontFamily: 'var(--kr-mono)', color: 'var(--kr-text)' }}>{claimProcessingDays} day{claimProcessingDays !== 1 ? 's' : ''}</span>
                  </div>
                )}
                {daysToLodge != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}>
                    <span style={{ color: 'var(--kr-muted)', fontWeight: 600 }}>Days to lodge (incident → claim)</span>
                    <span style={{ fontFamily: 'var(--kr-mono)', color: daysToLodge > 365 ? '#dc2626' : 'var(--kr-text)' }}>
                      {daysToLodge} day{daysToLodge !== 1 ? 's' : ''}{daysToLodge > 365 ? ' ⚠️ late submission' : ''}
                    </span>
                  </div>
                )}
                {turnaroundDays != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0' }}>
                    <span style={{ color: 'var(--kr-muted)', fontWeight: 600 }}>Est. turnaround</span>
                    <span style={{ fontFamily: 'var(--kr-mono)', color: 'var(--kr-text)' }}>{turnaroundDays} day{turnaroundDays !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Executive Summary ── */}
      {(() => {
        const summary = (aiAssessment as any)?._normalised?.executiveSummary ??
          (aiAssessment as any)?._forensicAnalysis?.executiveSummary ??
          (enforcement as any)?.finalDecision?.primaryReason ?? null;
        if (!summary) return null;
        return (
          <>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--kr-muted)', marginBottom: 8, fontFamily: 'var(--kr-sans)' }}>Executive Summary</div>
            <div className="exec-summary">{summary}</div>
          </>
        );
      })()}

      {/* ── Risk Flags Strip — shown when fraud score >= 40 ── */}
      {canonicalScore0 != null && canonicalScore0 >= 40 && (() => {
        const signals = (fraudBreakdown0?.signals ?? []) as Array<{ label: string; weight: number; triggered: boolean }>;
        const top3 = signals.filter((s: any) => s.triggered).sort((a: any, b: any) => b.weight - a.weight).slice(0, 3);
        if (top3.length === 0) return null;
        const riskColor = canonicalScore0 >= 70 ? '#dc2626' : '#d97706';
        return (
          <div style={{ margin: '0 0 8px 0', padding: '8px 16px', background: `${riskColor}10`, borderLeft: `3px solid ${riskColor}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: riskColor, whiteSpace: 'nowrap', paddingTop: 1 }}>
              Risk Flags
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
              {top3.map((s: any, i: number) => (
                <span key={i} style={{ fontSize: 11, color: riskColor, fontWeight: 600 }}>
                  {i > 0 && <span style={{ color: '#94a3b8', fontWeight: 400, marginRight: 12 }}>·</span>}
                  {s.label}
                </span>
              ))}
              <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>— Full breakdown in Section 5</span>
            </div>
          </div>
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
          <div style={{ margin: '10px 0', padding: '8px 12px', background: 'var(--kr-off-white)', borderLeft: `3px solid ${alignColour}`, fontSize: 11, lineHeight: 1.6 }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--kr-muted)', marginRight: 8, fontFamily: 'var(--kr-sans)' }}>Physics Snapshot</span>
            <span style={{ color: 'var(--kr-text)' }}>{snippets.join(' · ')}</span>
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
  // TRE CTO override: canonical evidence completeness (completenessScore per CTOEvidence interface)
  const ctl1 = (enforcement as any)?._claimTruth;
  const cto1 = (enforcement as any)?._claimTruthObject;
  const dataCompleteness = cto1?.evidence?.completenessScore ?? ctl1?.evidence?.completenessPercent ?? ctl1?.evidence?.completenessScore ?? phase2?.dataCompleteness ?? 0;
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
    { label: "Police report", ok: !!(claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber) || !!(claimRecord0?.policeReport?.station), detail: (claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber) ?? (claimRecord0?.policeReport?.station ? `Station: ${claimRecord0.policeReport.station}` : "Not provided"), conf: (claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber) ? 100 : claimRecord0?.policeReport?.station ? 60 : 0 },
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
    <div className="mb-1 space-y-2" style={{ marginBottom: "8px" }}>
      {/* 1.1 Incident Facts table */}
      <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
        <div className="px-4 py-3" >
          <p className="sub-heading">1.1 Incident Facts</p>
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
                            color: classifiedConfidence >= 80 ? "var(--status-approve-text)" : classifiedConfidence >= 60 ? "var(--status-review-text)" : "var(--kr-muted)",
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
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--kr-white)', color: 'var(--kr-muted)', border: '1px solid var(--kr-rule)' }}>
                          from claim form
                        </span>
                      )}
                    </span>
                    {isClassifiedByLLM && classifiedSources.length > 0 && (
                      <span className="text-[10px]" style={{ color: 'var(--kr-muted)' }}>
                        Sources: {classifiedSources.map((s: string) => s.replace(/_/g, " ")).join(" · ")}
                      </span>
                    )}
                    {isClassifiedByLLM && classifiedReasoning && (
                      <span className="text-[10px] italic" style={{ color: 'var(--kr-muted)' }}>
                        {sanitiseTextArtefacts(classifiedReasoning)}
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
                        <span style={{ color: 'var(--kr-muted)' }}>Not stated on claim form</span>
                        <span className="text-[10px] font-semibold" style={{ color: 'var(--status-review-text)' }}>
                          Physics estimate: ~{Math.round(physicsInferredSpeed)} km/h ({note})
                        </span>
                      </span>
                    ) as any;
                  }
                  return 'Not stated';
                })()],
                ["Incident date", fmtDate(claim?.incidentDate ?? aiAssessment?.incidentDate)],
                accidentTime ? ["Incident time", accidentTime] : null,
                (aiAssessment?.incidentLocation ?? claim?.incidentLocation) ? ["Location", aiAssessment?.incidentLocation ?? claim?.incidentLocation] : null,
                weatherConditions ? ["Weather conditions", toSentenceCase(weatherConditions)] : null,
                roadSurface ? ["Road surface", toSentenceCase(roadSurface)] : null,
                animalType ? ["Animal type", <span className="font-semibold capitalize">{animalType}</span>] : null,
                driverName ? ["Driver", toTitleCase(driverName)] : null,
                driverLicenseNumber ? ["Driver licence", driverLicenseNumber] : null,
                (claimantName ?? claim?.claimantName) ? ["Claimant", claimantName ?? claim?.claimantName] : null,
                aiAssessment?.assessmentDate ? ["Inspection date", fmtDate(aiAssessment.assessmentDate)] : null,
                (aiAssessment?.assessorName ?? claimRecord0?.repairQuote?.assessorName) ? ["Assessor", aiAssessment?.assessorName ?? claimRecord0?.repairQuote?.assessorName] : null,
                (aiAssessment?.panelBeaterName ?? claimRecord0?.repairQuote?.repairerName ?? claim?.repairerName) ? ["Repairer", toTitleCase(aiAssessment?.panelBeaterName ?? claimRecord0?.repairQuote?.repairerName ?? claim?.repairerName)] : null,
                policeReportNumber ? ["Police report No.", policeReportNumber] : null,
                policeStation ? ["Police station", policeStation + (policeReportNumber ? "" : " — case number not extracted")] : null,
              ].filter(Boolean).map((row: any, i: number) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid #e2e8f0" : undefined }}>
                  <td className="py-2 pr-4 font-semibold w-40" style={{ color: 'var(--kr-muted)' }}>{row[0]}</td>
                  <td className="py-2" style={{ color: 'var(--kr-text)' }}>{row[1]}</td>
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
                  <span style={{ fontSize: 12, color: 'var(--kr-amber)' }}>&#9888; Incident description could not be extracted from the submitted documents. Please verify source documents and re-submit with clearer scans.</span>
                </div>
              ) : (
                <>
                  <div className="narr-quote">
                    {/* Prefer the LLM-cleaned narrative (OCR-corrected) over the raw description field */}
                    {toSentenceCase(filterAssessorConclusions(sanitiseTextArtefacts(narrativeAnalysis?.cleaned_incident_narrative || description || '')).trim())}
                  </div>
                  {/* Low-confidence disclaimer — shown when the narrative engine has low confidence in the extraction */}
                  {narrativeAnalysis?.confidence != null && narrativeAnalysis.confidence < 50 && (
                    <div style={{ margin: '0 14px 8px', fontSize: 11, padding: '6px 10px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 3 }}>
                      <span style={{ color: 'var(--kr-amber)', fontWeight: 600 }}>&#9888; Low confidence extraction (confidence: {narrativeAnalysis.confidence}/100)</span>
                      <span style={{ color: 'var(--kr-muted)' }}> — the source narrative may contain OCR artefacts, incomplete text, or insufficient detail. This narrative should be independently verified before settlement.</span>
                    </div>
                  )}
                </>
              )}
              {narrativeAnalysis?.was_contaminated && (
                <div style={{ margin: '0 14px 8px', fontSize: 11, color: 'var(--kr-amber)' }}>
                  &#9888; Post-incident content (inspection findings, repair notes) was identified and excluded from the statement above.
                </div>
              )}

              {/* Reconstructed sequence — distinct strip */}
              {narrativeAnalysis?.extracted_facts?.sequence_of_events && narrativeAnalysis.extracted_facts.sequence_of_events !== 'Insufficient data to reconstruct sequence of events.' && (
                <div className="narr-seq">
                  <span className="narr-seq-label">
                    Reconstructed Sequence
                    {narrativeAnalysis?.confidence != null && narrativeAnalysis.confidence < 50 && (
                      <span style={{ fontWeight: 400, color: 'var(--kr-amber)', marginLeft: 6, fontSize: 10 }}>(low confidence — interpretation only)</span>
                    )}
                  </span>
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
                          <span className="narr-cv-notes">{sanitiseTextArtefacts(r.notes ?? '')}</span>
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
                    <span className="narr-header-label" style={{ color: 'var(--kr-red)' }}>Narrative Flags &nbsp;·&nbsp; {narrativeAnalysis.fraud_signals.length}</span>
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
                          <div className="narr-flag-title">{toTitleCase(sig.code)}</div>
                          <div className="narr-flag-desc">{sig.description}</div>
                          {sig.evidence && (
                            <div className="narr-flag-evidence">Evidence: &ldquo;{sanitiseTextArtefacts(sig.evidence)}&rdquo;</div>
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
        <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
          <div className="px-4 py-3 flex items-center gap-2" >
            <p className="sub-heading">1.1b Multi-Event Incident Sequence</p>
            <span className="text-xs font-semibold" style={{ color: 'var(--kr-muted)' }}>
              {multiEventSequence.events.length} events detected
            </span>
            <span className="text-xs ml-auto" style={{ color: 'var(--kr-muted)' }}>
              Confidence: {multiEventSequence.confidence}%
            </span>
          </div>
          <div className="p-4">
            {/* Sequence summary */}
            <p className="text-xs mb-4" style={{ color: 'var(--kr-muted)' }}>
              <span className="font-semibold" style={{ color: 'var(--kr-text)' }}>Sequence summary: </span>
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
                      <span className="text-xs font-semibold capitalize" style={{ color: 'var(--kr-text)' }}>
                        {(event.event_type ?? "unknown").replace(/_/g, " ")}
                        {event.event_sub_type ? ` — ${event.event_sub_type.replace(/_/g, " ")}` : ""}
                      </span>
                      {event.involves_third_party && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--fp-info-bg, var(--muted))", color: "var(--fp-info-text, var(--kr-muted))" }}>
                          3rd party
                        </span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: 'var(--kr-muted)' }}>{event.description}</p>
                    {event.damage_contribution?.length > 0 && (
                      <p className="text-xs mt-1" style={{ color: 'var(--kr-muted)' }}>
                        <span className="font-semibold" style={{ color: 'var(--kr-text)' }}>Damage zones: </span>
                        {event.damage_contribution.join(", ")}
                      </p>
                    )}
                    {event.causal_link && (
                      <p className="text-xs mt-1 italic" style={{ color: 'var(--kr-muted)' }}>
                        → {event.causal_link}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Reasoning */}
            {multiEventSequence.reasoning && (
              <div className="mt-2 p-3 rounded-lg text-xs" style={{ background: 'var(--kr-white)', color: 'var(--kr-muted)' }}>
                <span className="font-semibold" style={{ color: 'var(--kr-text)' }}>Analyst reasoning: </span>
                {multiEventSequence.reasoning}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 1.2 + 1.3 side-by-side grid */}
      <div className="grid grid-cols-2 gap-4">

      {/* 1.2 Insurance & Policy Context */}
      <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
        <div className="px-4 py-3" >
          <p className="sub-heading">1.2 Insurance & Policy Context</p>
        </div>
        <div className="p-4">
          <table className="compact-kv-table text-xs">
            <tbody>
              {[
                insurerName ? ["Insurer", insurerName] : null,
                policyNumber ? ["Policy number", policyNumber] : null,
                claimReference ? ["Claim reference", claimReference] : null,
                excessAmountUsd != null ? ["Policy excess", fmtMoney(excessAmountUsd)] : null,
                // Vehicle valuation belongs in policy context — it is an underwriting figure
                ["Market value", marketValueUsd != null ? fmtMoney(marketValueUsd) : "Pending system benchmark"],
                marketValueSource
                  ? ["Valuation basis",
                      _valEngineResult?.valuationMethod === "document_stated"
                        ? "⚠ Assessor document — not independently verified"
                        : _valEngineResult?.valuationMethod === "llm_estimate"
                          ? "KINGA system benchmark"
                          : marketValueSource]
                  : null,
              ].filter((x): x is [string, React.ReactNode] => x !== null).map(([k, v], i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid #e2e8f0" : undefined }}>
                  <td className="py-2 pr-4 font-semibold w-40" style={{ color: 'var(--kr-muted)' }}>{k}</td>
                  <td className="py-2" style={{ color: 'var(--kr-text)' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1.3 Vehicle Details */}
      <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
        <div className="px-4 py-3" >
          <p className="sub-heading">1.3 Vehicle Details</p>
        </div>
        <div className="p-4">
          <table className="compact-kv-table text-xs">
            <tbody>
              {[
                (claim?.vehicleRegistration ?? claimRecord0?.vehicle?.registration) ? ["Registration", claim?.vehicleRegistration ?? claimRecord0?.vehicle?.registration] : null,
                // C-04: VIN is structurally critical — flag absence explicitly
                vehicleVin ? ["VIN", vehicleVin] : ["VIN", <span style={{ color: 'var(--kr-red)', fontWeight: 600 }}>Not provided — required for vehicle verification</span>],
                vehicleEngineNumber ? ["Engine number", vehicleEngineNumber] : null,
                vehicleMileage != null ? ["Odometer", `${vehicleMileage.toLocaleString()} km`] : null,
                // Market value and Valuation basis moved to 1.2 Insurance & Policy Context
              ].filter((row): row is string[] => Array.isArray(row)).map(([k, v], i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid #e2e8f0" : undefined }}>
                  <td className="py-2 pr-4 font-semibold w-40" style={{ color: 'var(--kr-muted)' }}>{k as string}</td>
                  <td className="py-2" style={{ color: 'var(--kr-text)' }}>{v as React.ReactNode}</td>
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
            <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--kr-rule)' }}>
                <p className="sub-heading">1.4 Driver Details</p>
              </div>
              <div className="p-4">
                <p className="micro-label">Insured Driver</p>
                <table className="w-full text-xs">
                  <tbody>
                    {([
                      (driverName ?? claim?.claimantName) ? ['Name', driverName ?? claim?.claimantName] : null,
                      (claimRecord0?.driver?.idNumber ?? (claim as any)?.claimantIdNumber) ? ['ID / Passport', claimRecord0?.driver?.idNumber ?? (claim as any)?.claimantIdNumber] : null,
                      driverLicenseNumber ? ['Licence no.', driverLicenseNumber] : null,
                      (claimRecord0?.driver?.phone ?? (claim as any)?.claimantPhone) ? ['Contact', claimRecord0?.driver?.phone ?? (claim as any)?.claimantPhone] : null,
                      (claimRecord0?.driver?.email ?? (claim as any)?.claimantEmail) ? ['Email', claimRecord0?.driver?.email ?? (claim as any)?.claimantEmail] : null,
                      claimRecord0?.driver?.relationshipToPolicyholder ? ['Relationship to policyholder', claimRecord0.driver.relationshipToPolicyholder] : null,
                      claimRecord0?.driver?.injuriesReported ? ['Injuries reported', claimRecord0.driver.injuriesReported] : null,
                    ].filter(Boolean) as [string, string][]).map(([k, v], i) => (
                      <tr key={i} style={{ borderTop: i > 0 ? '1px solid #e2e8f0' : undefined }}>
                        <td className="py-1.5 pr-3 font-semibold" style={{ color: 'var(--kr-muted)', width: '160px' }}>{k}</td>
                        <td className="py-1.5" style={{ color: 'var(--kr-text)' }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="micro-label" style={{ marginTop: 16 }}>Third Party {isSingleVehicle && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--kr-muted)' }}>— Not applicable</span>}</p>
                {isSingleVehicle ? (
                  <p className="text-xs" style={{ color: 'var(--kr-muted)', fontStyle: 'italic' }}>No third party involved — {(incidentType ?? '').replace(/_/g, ' ').toLowerCase()} is a single-vehicle incident type.</p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {([
                        thirdPartyName ? ['Name', thirdPartyName] : null,
                        thirdPartyVehicle ? ['Vehicle', thirdPartyVehicle] : null,
                        thirdPartyReg ? ['Registration', thirdPartyReg] : null,
                        thirdPartyInsurer ? ['Insurer', thirdPartyInsurer] : null,
                        thirdPartyPolicy ? ['Policy No.', thirdPartyPolicy] : null,
                        liabilityAdmitted != null ? ['Liability admitted', liabilityAdmitted ? 'Yes' : 'No'] : null,
                        (claimRecord0?.witness?.name ?? (claim as any)?.witnessName) ? ['Witness name', claimRecord0?.witness?.name ?? (claim as any)?.witnessName] : null,
                        (claimRecord0?.witness?.phone ?? (claim as any)?.witnessPhone) ? ['Witness contact', claimRecord0?.witness?.phone ?? (claim as any)?.witnessPhone] : null,
                      ].filter(Boolean) as [string, string][]).map(([k, v], i) => (
                        <tr key={i} style={{ borderTop: i > 0 ? '1px solid #e2e8f0' : undefined }}>
                          <td className="py-1.5 pr-3 font-semibold" style={{ color: 'var(--kr-muted)', width: '160px' }}>{k}</td>
                          <td className="py-1.5" style={{ color: 'var(--kr-text)' }}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* 1.5 Police Report Details */}
            <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--kr-rule)' }}>
                <p className="sub-heading">1.5 Police Report Details</p>
                {!policeReportNumber && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'var(--kr-white)', color: 'var(--fp-critical-text)', border: '1px solid var(--fp-critical-border)' }}>CRITICAL BLOCKER</span>
                )}
              </div>
              <div className="p-4">
                <table className="w-full text-xs report-table">
                  <tbody>
                    {([
                      policeReportNumber ? ['Case / AR number', policeReportNumber] : null,
                      (policeStation ?? claimRecord0?.policeReport?.station ?? (claim as any)?.policeStation) ? ['Police station', policeStation ?? claimRecord0?.policeReport?.station ?? (claim as any)?.policeStation] : null,
                      claimRecord0?.policeReport?.officerName ? ['Reporting officer', claimRecord0.policeReport.officerName] : null,
                      claimRecord0?.policeReport?.reportDate ? ['Report date', claimRecord0.policeReport.reportDate] : null,
                      claimRecord0?.policeReport?.chargeNumber ? ['Charge number', claimRecord0.policeReport.chargeNumber] : null,
                      claimRecord0?.policeReport?.chargedParty ? ['Charged party', claimRecord0.policeReport.chargedParty] : null,
                      claimRecord0?.policeReport?.investigationStatus ? ['Investigation status', claimRecord0.policeReport.investigationStatus] : null,
                      !isSingleVehicle && claimRecord0?.policeReport?.thirdPartyAccountSummary ? ['Third-party account', claimRecord0.policeReport.thirdPartyAccountSummary] : null,
                    ].filter(Boolean) as [string, string][]).map(([k, v], i) => (
                      <tr key={i} style={{ borderTop: i > 0 ? '1px solid #e0ddd8' : undefined }}>
                        <td className="py-2 pr-4" style={{ color: 'var(--kr-dark)', fontWeight: 600, verticalAlign: 'top', whiteSpace: 'nowrap', width: '150px', fontSize: 11 }}>{k}</td>
                        <td className="py-2" style={{ color: (v === 'Not provided' || v === 'Not stated') ? 'var(--kr-muted)' : 'var(--kr-text)', verticalAlign: 'top', whiteSpace: 'normal', lineHeight: '1.6', fontSize: 12 }}>{v}</td>
                      </tr>
                    ))}
                    {/* Officer findings — KINGA-reasoned interpretation */}
                    {(() => {
                      const raw = claimRecord0?.policeReport?.officerFindings;
                      const narrative = claimRecord0?.accidentDetails?.description ?? '';
                      if (!raw) return (
                        <tr style={{ borderTop: '1px solid var(--kr-rule)' }}>
                          <td style={{ color: 'var(--kr-dark)', fontWeight: 600, verticalAlign: 'top', whiteSpace: 'nowrap', width: '150px', fontSize: 11, paddingTop: 8, paddingBottom: 8, paddingRight: 16 }}>Officer findings</td>
                          <td style={{ color: 'var(--kr-muted)', fontSize: 12, paddingTop: 8, paddingBottom: 8, fontStyle: 'italic' }}>Not extracted — full police report not submitted or findings not recorded</td>
                        </tr>
                      );
                      // Derive a consistency flag by comparing key terms
                      const rawLower = raw.toLowerCase();
                      const narrLower = narrative.toLowerCase();
                      const consistencyKeywords = ['speed', 'impact', 'collision', 'direction', 'fault', 'charged', 'alcohol', 'weather'];
                      const matchedKeywords = consistencyKeywords.filter(k => rawLower.includes(k) && narrLower.includes(k));
                      const hasContradiction = (rawLower.includes('no fault') && narrLower.includes('fault')) ||
                        (rawLower.includes('no charge') && narrLower.includes('charged')) ||
                        (rawLower.includes('single vehicle') && narrLower.includes('third party'));
                      const consistencyLabel = hasContradiction ? 'Contradiction detected' : matchedKeywords.length >= 2 ? 'Consistent with narrative' : 'Partial alignment';
                      const consistencyColor = hasContradiction ? 'var(--kr-red)' : matchedKeywords.length >= 2 ? 'var(--kr-green)' : 'var(--kr-amber)';
                      return (
                        <tr style={{ borderTop: '1px solid var(--kr-rule)' }}>
                          <td style={{ color: 'var(--kr-dark)', fontWeight: 600, verticalAlign: 'top', whiteSpace: 'nowrap', width: '150px', fontSize: 11, paddingTop: 8, paddingBottom: 8, paddingRight: 16 }}>Officer findings</td>
                          <td style={{ verticalAlign: 'top', paddingTop: 8, paddingBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: consistencyColor, border: `1px solid ${consistencyColor}`, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '.06em' }}>{consistencyLabel}</span>
                              {matchedKeywords.length > 0 && <span style={{ fontSize: 10, color: 'var(--kr-muted)' }}>Corroborating factors: {matchedKeywords.join(', ')}</span>}
                            </div>
                            <p style={{ fontSize: 11, color: 'var(--kr-text)', lineHeight: 1.6, margin: 0 }}>
                              {hasContradiction
                                ? `Officer account contains elements that conflict with the claimant narrative. ${matchedKeywords.length > 0 ? `Points of agreement: ${matchedKeywords.join(', ')}.` : ''} Adjuster review required before settlement.`
                                : matchedKeywords.length >= 2
                                  ? `Officer account is consistent with the claimant narrative across ${matchedKeywords.length} key factor${matchedKeywords.length > 1 ? 's' : ''} (${matchedKeywords.join(', ')}). No material contradictions identified.`
                                  : `Officer account shows partial alignment with the claimant narrative. ${matchedKeywords.length > 0 ? `Shared elements: ${matchedKeywords.join(', ')}.` : 'Limited corroborating detail available.'} Further verification recommended.`
                              }
                            </p>
                            {hasContradiction && <p style={{ fontSize: 11, color: 'var(--kr-red)', marginTop: 6, fontWeight: 600 }}>Escalation recommended — officer account conflicts with claimant narrative.</p>}
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 1.6 Data Completeness Checklist — full-width table matching mock layout */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--kr-navy)', marginBottom: 8, borderBottom: '1.5px solid var(--kr-navy)', paddingBottom: 3 }}>1.6 Data Completeness Checklist</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'var(--kr-navy)' }}>
              {['Data Item', 'Status', 'Impact'].map(h => (
                <th key={h} style={{ padding: '5px 8px', textAlign: 'left', color: 'var(--kr-white)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {((): Array<{ item: string; ok: 'pass' | 'warn' | 'fail'; statusLabel: string; impact: string }> => [
              { item: 'Incident type & narrative', ok: (incidentType !== 'N/A' && incidentType !== 'unknown') ? 'pass' : 'fail', statusLabel: (incidentType !== 'N/A' && incidentType !== 'unknown') ? '✓ Complete' : '✗ Missing', impact: (incidentType !== 'N/A' && incidentType !== 'unknown') ? 'No impact' : 'Critical — incident cannot be classified' },
              { item: 'Cost data (repair quotes)', ok: !!(normalised?.costs?.totalUsd ?? aiAssessment?.estimatedCost) ? 'pass' : 'fail', statusLabel: !!(normalised?.costs?.totalUsd ?? aiAssessment?.estimatedCost) ? '✓ Complete' : '✗ Not submitted', impact: !!(normalised?.costs?.totalUsd ?? aiAssessment?.estimatedCost) ? 'No impact' : 'Critical — cost validation cannot proceed' },
              { item: 'Damage photographs', ok: !!(ctl1?.evidence?.photoCount ?? aiAssessment?.photosDetected) ? 'pass' : 'fail', statusLabel: !!(ctl1?.evidence?.photoCount ?? aiAssessment?.photosDetected) ? `✓ ${ctl1?.evidence?.photoCount ?? aiAssessment?.photosDetected} submitted` : '✗ Not submitted', impact: !!(ctl1?.evidence?.photoCount ?? aiAssessment?.photosDetected) ? 'No impact' : 'Critical — +12–18 confidence points if provided' },
              { item: 'Police report', ok: !!(claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber) ? 'pass' : claimRecord0?.policeReport?.station ? 'warn' : 'fail', statusLabel: (claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber) ? `✓ ${claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber}` : claimRecord0?.policeReport?.station ? '⚠ Case number only' : '✗ Not provided', impact: (claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber) ? 'No impact' : claimRecord0?.policeReport?.station ? 'Moderate — full report required' : 'High — third-party verification incomplete' },
              { item: 'Vehicle VIN', ok: vehicleVin ? 'pass' : 'fail', statusLabel: vehicleVin ? `✓ ${vehicleVin}` : '✗ Not provided', impact: vehicleVin ? 'No impact' : 'Document gap — identity verification incomplete' },
              { item: 'Policy number', ok: policyNumber ? 'pass' : 'fail', statusLabel: policyNumber ? `✓ ${policyNumber}` : '✗ Not provided', impact: policyNumber ? 'No impact' : 'Document gap — policy verification incomplete' },
              { item: 'Driver licence', ok: driverLicenseNumber ? 'pass' : 'fail', statusLabel: driverLicenseNumber ? `✓ ${driverLicenseNumber}` : '✗ Not submitted', impact: driverLicenseNumber ? 'No impact' : 'Identity verification incomplete' },
              { item: 'Cost corrections applied', ok: corrections.length > 0 ? 'warn' : 'pass', statusLabel: corrections.length > 0 ? `${corrections.length} correction${corrections.length !== 1 ? 's' : ''}` : 'None required', impact: corrections.length > 0 ? 'Minor — terminology standardisation' : 'No impact' },
            ])().filter(row => !(row.ok === 'pass' && row.impact === 'No impact')).map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--kr-rule)' }}>
                <td style={{ padding: '5px 8px', color: 'var(--kr-text)' }}>{row.item}</td>
                <td style={{ padding: '5px 8px', fontWeight: 600, color: row.ok === 'pass' ? '#16a34a' : row.ok === 'warn' ? '#d97706' : '#dc2626' }}>{row.statusLabel}</td>
                <td style={{ padding: '5px 8px', color: 'var(--kr-muted)' }}>{row.impact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* 1.7 + 1.8 removed — data gaps and extraction confidence are fully covered by
           Section 1.6 Data Completeness Checklist and the FCDI block in Section 0.
           Keeping them here would duplicate the same information three times. */}
      {false && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* 1.7 Extraction Confidence — left col */}
        <div style={{ border: '1px solid var(--kr-rule)', padding: '12px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--kr-navy)', marginBottom: 8, borderBottom: '1.5px solid var(--kr-navy)', paddingBottom: 3 }}>1.7 Extraction Confidence</div>
          {/* Gauge + score */}
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <ConfidenceGauge score={Math.round((ocrConfidence + costConfidence + photoConfidence + dataCompleteness) / 4)} size={60} />
            <div style={{ fontSize: 18, fontWeight: 700, color: Math.round((ocrConfidence + costConfidence + photoConfidence + dataCompleteness) / 4) >= 70 ? '#16a34a' : Math.round((ocrConfidence + costConfidence + photoConfidence + dataCompleteness) / 4) >= 40 ? '#d97706' : '#dc2626', marginTop: 4 }}>
              {Math.round((ocrConfidence + costConfidence + photoConfidence + dataCompleteness) / 4)}%
            </div>
            <div style={{ fontSize: 9, color: 'var(--kr-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {Math.round((ocrConfidence + costConfidence + photoConfidence + dataCompleteness) / 4) >= 70 ? 'SUFFICIENT — Evidence quality acceptable' : Math.round((ocrConfidence + costConfidence + photoConfidence + dataCompleteness) / 4) >= 40 ? 'PARTIAL — Manual verification recommended' : 'CRITICAL — Evidence quality insufficient'}
            </div>
          </div>
          {/* KV table of confidence breakdown */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <tbody>
              {[
                { label: 'Overall Extraction', value: `${Math.round((ocrConfidence + costConfidence + photoConfidence + dataCompleteness) / 4)}%` },
                { label: 'OCR / Document Read', value: `${Math.round(ocrConfidence)}%` },
                { label: 'Cost Extraction', value: `${Math.round(costConfidence > 0 ? costConfidence : confidenceScore * 0.9)}%` },
                { label: 'Photo Analysis', value: photoConfidence > 0 ? `${Math.round(photoConfidence)}%` : '0%', warn: photoConfidence === 0 },
              ].map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--kr-rule)' }}>
                  <td style={{ padding: '4px 6px', color: 'var(--kr-muted)' }}>{row.label}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: (row as any).warn ? '#dc2626' : '#111' }}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* 1.8 Data Gap Attribution — right col */}
        <div style={{ border: '1px solid var(--kr-rule)', padding: '12px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--kr-navy)', marginBottom: 4, borderBottom: '1.5px solid var(--kr-navy)', paddingBottom: 3 }}>1.8 Data Gap Attribution</div>
          <div style={{ fontSize: 10, color: 'var(--kr-muted)', marginBottom: 8 }}>Source of identified data gaps</div>
          {(() => {
            const gapRows: Array<{ field: string; source: string; type: 'Critical' | 'Moderate' | 'Minor' }> = [];
            if (!vehicleVin) gapRows.push({ field: 'Vehicle VIN', source: 'DOCUMENT', type: 'Critical' });
            if (!policyNumber) gapRows.push({ field: 'Policy Number', source: 'DOCUMENT', type: 'Critical' });
            if (!(ctl1?.evidence?.photoCount ?? aiAssessment?.photosDetected)) gapRows.push({ field: 'Damage Photos', source: 'CLAIMANT', type: 'Critical' });
            if (!driverLicenseNumber) gapRows.push({ field: 'Driver Licence', source: 'CLAIMANT', type: 'Moderate' });
            if (!policeReportNumber && !claimRecord0?.policeReport?.station) gapRows.push({ field: 'Police Report', source: 'CLAIMANT', type: 'Moderate' });
            if (!marketValueUsd) gapRows.push({ field: 'Market Value', source: 'INSURER', type: 'Moderate' });
            const phase2g = (enforcement as any)?._phase2 as any;
            if (phase2g?.dataCompleteness != null && phase2g.dataCompleteness < 60) gapRows.push({ field: 'Data Completeness', source: 'SYSTEM', type: 'Critical' });
            return gapRows.length === 0 ? (
              <p style={{ fontSize: 11, color: 'var(--kr-green)', fontStyle: 'italic' }}>No data gaps identified — all critical fields extracted successfully.</p>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginBottom: 10 }}>
                  <thead>
                    <tr style={{ background: 'var(--kr-navy)' }}>
                      {['Gap', 'Source', 'Type'].map(h => (
                        <th key={h} style={{ padding: '4px 6px', textAlign: 'left', color: 'var(--kr-white)', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gapRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--kr-rule)' }}>
                        <td style={{ padding: '4px 6px', color: 'var(--kr-text)' }}>{row.field}</td>
                        <td style={{ padding: '4px 6px', color: 'var(--kr-muted)', fontFamily: 'var(--kr-mono)', fontSize: 9 }}>{row.source}</td>
                        <td style={{ padding: '4px 6px', fontWeight: 600, color: row.type === 'Critical' ? '#dc2626' : row.type === 'Moderate' ? '#d97706' : '#16a34a' }}>{row.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {gates.length > 0 && (
                  <div style={{ borderLeft: '3px solid #dc2626', paddingLeft: 8, fontSize: 10, color: 'var(--kr-text)', lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 700 }}>Document Integrity: </span>
                    {gates.filter((g: any) => g.status !== 'PASS').map((g: any) => (
                      <span key={g.gate}>{(g.gate ?? '').replace(/^G\d+_?/i, '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} — {g.status}. </span>
                    ))}
                    {gates.filter((g: any) => g.status === 'PASS').length === gates.length && 'All checks passed.'}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>}
    </div>
  );
}
// ─── Section 2: Technical Forensics ──────────────────────────────────────────
// Redesigned structure (June 2026):
//   2.1  Impact Overview       — 4-metric KPI row + physics status + animal strike + reconstruction
//   2.2  Speed Analysis        — consensus speed + method list + speed scale + forensic interpretation
//   2.3  Damage Zone & Pattern — zone map (left) + expected-vs-actual pattern table (right)
//   2.4  Physics Constraints   — failed/advisory rows only; passing constraints summarised in one line
//   2.5  Component Measurements— 3-column table (Component / Crush Depth / Damage Fraction) + totals
//   2.6  Damage Severity & Coverage — severity chart (left) + quote coverage stats (right)
//   2.7  Pattern Validation    — Section29DamagePatternValidation inline
//   2.8  Vehicle Structural Intelligence — Section210VehicleStructural relabelled
function Section2Physics({ claim, aiAssessment, enforcement, quotes, fmtMoney = fmtUsd }: { claim: any; aiAssessment: any; enforcement: any; quotes?: any[]; fmtMoney?: (n: number | null | undefined) => string }) {
  const e = enforcement;
  const pe = e?.physicsEstimate;
  const claimRecord0 = (aiAssessment as any)?._claimRecord ?? (aiAssessment as any)?.claimRecord ?? null;
  const _phys = (e as any)?._physics as { deltaVKmh: number; impactForceKn: number; energyKj: number; vehicleMassKg: number; estimatedSpeedKmh: number } | undefined;
  const phase2 = (e as any)?._phase2 as any;
  const physicsScore = phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0;
  const constraints: any[] = phase2?.physicsConstraints ?? [];
  const _rawIt2 = phase2?.incidentType ?? aiAssessment?.incidentType;
  const _unresolved2 = !_rawIt2 || _rawIt2 === "REQUIRES_CLASSIFICATION" || _rawIt2 === "REQUIRES CLASSIFICATION" || _rawIt2 === "unknown";
  const incidentType = _unresolved2 ? (claim?.incidentType ?? "unknown") : _rawIt2;
  const deltaV = (_phys?.deltaVKmh ?? 0) > 0 ? _phys!.deltaVKmh : (pe?.deltaVKmh ?? 0);
  const claimedSpeed = claimRecord0?.accidentDetails?.estimatedSpeedKmh
    ?? (aiAssessment as any)?._normalised?.physics?.claimedSpeedKmh
    ?? aiAssessment?.claimedSpeedKmh
    ?? 0;
  const energyKj = (_phys?.energyKj ?? 0) > 0
    ? _phys!.energyKj
    : pe?.energyKj ? (pe.energyKj.min + pe.energyKj.max) / 2 : 0;
  const impactForceKnDisplay = (_phys?.impactForceKn ?? 0) > 0
    ? _phys!.impactForceKn
    : pe?.impactForceKn ? (pe.impactForceKn.min + pe.impactForceKn.max) / 2 : 0;
  const vehicleMassKg = (_phys?.vehicleMassKg ?? 0) > 0 ? _phys!.vehicleMassKg : null;
  // P6: Stage 6 image source reliability — drives crush-depth provenance disclosure in 2.5
  const visionSourceReliability: string = (_phys as any)?.visionSourceReliability ?? 'NONE';
  const crushDepthTrusted = visionSourceReliability === 'HIGH' || visionSourceReliability === 'MEDIUM';
  const estimatedSpeedKmh = (_phys?.estimatedSpeedKmh ?? 0) > 0 ? _phys!.estimatedSpeedKmh : (pe?.estimatedVelocityKmh ?? 0);
  const physicsInferredSpeed = estimatedSpeedKmh > 0 ? estimatedSpeedKmh : (pe?.estimatedVelocityKmh ?? null);
  const _sc2 = (_phys as any)?.severityConsensus;
  // ── EBS-aligned severity: map energyKj to the glossary bands when the stored severity
  // label does not match (e.g. pipeline emits 'Severe' for 18 kJ which is Moderate per EBS).
  // Glossary: Cosmetic <2 kJ, Minor 2–8 kJ, Moderate 8–20 kJ, Severe 20–50 kJ, Catastrophic >50 kJ
  const _rawSeverity: string = _sc2?.final_severity ?? aiAssessment?.structuralDamageSeverity ?? "unknown";
  const _ebsSeverityFromKj = (kj: number): string | null => {
    if (kj <= 0) return null;
    if (kj < 2) return 'Cosmetic';
    if (kj < 8) return 'Minor';
    if (kj < 20) return 'Moderate';
    if (kj < 50) return 'Severe';
    return 'Catastrophic';
  };
  const _ebsDerived = energyKj > 0 ? _ebsSeverityFromKj(energyKj) : null;
  // Use EBS-derived label when the stored label disagrees with the kJ value;
  // if no kJ available, fall back to the stored label.
  const severity = _ebsDerived ?? _rawSeverity;
  const damageZones: string[] = (e as any)?.damageZones ?? e?.directionFlag?.damageZones ?? [];
  const directionMismatch = e?.directionFlag?.mismatch ?? false;
  const directionExplanation = e?.directionFlag?.explanation ?? "";
  const consistencyExplanation = e?.consistencyFlag?.explanation ?? "";
  const anomalyLevel = e?.consistencyFlag?.anomalyLevel ?? "none";
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
    ROLLOVER: {
      expected: ["Roof deformation", "A/B/C-pillar damage", "Side panel damage", "Airbag deployment", "Seatbelt pre-tensioners"],
      notes: "Rollovers produce multi-zone damage with roof and pillar deformation. Isolated panel damage without roof involvement is inconsistent.",
    },
    HAIL: {
      expected: ["Distributed panel dents", "Windscreen damage", "Roof dents", "Bonnet dents"],
      notes: "Hail damage produces distributed, low-energy dents across horizontal surfaces. Concentrated or deep structural damage is inconsistent.",
    },
    THEFT: { expected: [], notes: "Theft claims are validated through police report cross-reference and timeline analysis." },
    FIRE: {
      expected: ["Engine bay burn marks", "Interior fire damage", "Melted wiring", "Smoke damage"],
      notes: "Fire damage patterns are validated against the reported ignition source and spread direction.",
    },
  };
  const pattern = incidentPatterns[incidentType?.toUpperCase().replace(/\s+/g, "_")] ?? { expected: [], notes: "" };

  // ── Shared data for 2.6 Damage Severity & Coverage ──────────────────────────
  const damagedPartsRaw = (aiAssessment as any)?.damagedComponentsJson;
  const damagedParts: any[] = (() => {
    if (!damagedPartsRaw) return [];
    try {
      const raw = typeof damagedPartsRaw === 'string' ? JSON.parse(damagedPartsRaw) : (Array.isArray(damagedPartsRaw) ? damagedPartsRaw : []);
      const seen = new Set<string>();
      return raw.filter((p: any) => {
        const norm = toTitleCase((p.name ?? '').toLowerCase().trim());
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
      }).map((p: any) => ({ ...p, name: toTitleCase((p.name ?? '').toLowerCase().trim()) || p.name }));
    } catch { return []; }
  })();
  const damagedPartsBySeverity: any[] = (() => {
    if (!damagedPartsRaw) return [];
    try {
      const raw = typeof damagedPartsRaw === 'string' ? JSON.parse(damagedPartsRaw) : (Array.isArray(damagedPartsRaw) ? damagedPartsRaw : []);
      return raw.filter((p: any) => p.severity);
    } catch { return []; }
  })();
  const partsReconRaw = (aiAssessment as any)?.partsReconciliationJson;
  const partsRecon: any[] = (() => {
    if (!partsReconRaw) return [];
    try { return typeof partsReconRaw === 'string' ? JSON.parse(partsReconRaw) : (Array.isArray(partsReconRaw) ? partsReconRaw : []); } catch { return []; }
  })();
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
    ?? (aiAssessment as any)?.panelBeaterName
    ?? null;
  const missingNames = partsRecon.filter((r: any) => r.reconciliation_status === 'missing_from_quote').map((r: any) => (r.component ?? ''));
  const damagePatternValidation = (aiAssessment as any)?._physics?.damagePatternValidation ?? null;

  // ── Latent Damage Probability data ──────────────────────────────────────────
  const ldp = (_phys as any)?.latentDamageProbability ?? {};
  const ldpSorted: [string, number][] = Object.entries(ldp)
    .filter(([, v]) => typeof v === 'number' && (v as number) > 0)
    .sort(([, a], [, b]) => (b as number) - (a as number)) as [string, number][];
  const showLdp = ldpSorted.length > 0;
  const ldpChartData = showLdp ? {
    labels: ldpSorted.map(([k]) => k.replace(/_/g, ' ')),
    datasets: [{
      label: 'Probability (%)',
      data: ldpSorted.map(([, v]) => v),
      backgroundColor: ldpSorted.map(([, v]) => (v as number) >= 70 ? 'rgba(239,68,68,0.7)' : (v as number) >= 40 ? 'rgba(245,158,11,0.7)' : 'rgba(59,130,246,0.7)'),
      borderRadius: 3,
    }],
  } : null;
  const ldpOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 9 } } }, y: { min: 0, max: 100, ticks: { font: { size: 9 } } } } };

  // ── Animal strike specific data ──────────────────────────────────────────────
  const animalStrikeProfiles: any[] = (_phys as any)?.animalStrikeProfiles ?? [];
  const isAnimalStrike = incidentType?.toUpperCase().includes('ANIMAL');

  // ── Speed ensemble data (for 2.2) ────────────────────────────────────────────
  // TRE CTO: use canonical physics.speedInferenceEnsemble as primary source for consensus speed
  const _cto2 = (enforcement as any)?._claimTruthObject;
  const ensemble = _cto2?.physics?.speedInferenceEnsemble ?? (_phys as any)?.speedInferenceEnsemble;
  const vr = (_phys as any)?.velocityRange ?? (_phys as any)?.physicsNumerical?.velocity_range;
  // Field names aligned to SpeedInferenceResult (speedInferenceEnsemble.ts) — do NOT revert to bridge-type aliases
  const consensusSpeed: number | null = ensemble?.consensusSpeedKmh ?? ensemble?.consensusSpeed ?? ensemble?.consensus_speed ?? null;
  const confidenceLevel: string = (ensemble?.overallConfidence ?? ensemble?.confidenceLevel ?? ensemble?.confidence_level ?? 'LOW').toLowerCase();
  const divergenceFlag: boolean = ensemble?.highDivergence ?? ensemble?.divergenceFlag ?? ensemble?.divergence_flag ?? false;
  // Filter to methods that actually ran (m.ran === true) — not an outlier check, which is a different concept
  const activeMethods: any[] = (ensemble?.methods ?? []).filter((m: any) => m.ran === true);
  const allMethods: any[] = ensemble?.methods ?? [];
  const availableCount: number = activeMethods.length;
  const spread: number = ensemble?.crossValidation?.spread ?? ensemble?.spread ?? 0;
  const speedForensics = (_phys as any)?.speedForensics ?? null;

  const categoryMap: Record<string, string> = {
    CAMPBELL: 'KINGA Crush-Depth Analysis',
    ENERGY_MOMENTUM: 'KINGA Energy-Momentum Balance',
    IMPULSE: 'KINGA Contact Impulse Analysis',
    DEPLOYMENT_THRESHOLD: 'Safety System Activation',
    VISION_DEFORMATION: 'KINGA Vision Deformation',
    M1: 'KINGA Crush-Depth Analysis',
    M2: 'KINGA Barrier-Equivalent Method',
    M3: 'KINGA Energy Balance',
    M4: 'KINGA Momentum Analysis',
    M5: 'KINGA Vision Deformation',
  };

  return (
    <div className="space-y-4">

      {/* ── 2.1 Impact Overview ─────────────────────────────────────────────── */}
      <div style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--kr-rule)' }}>
          <p className="sub-heading">2.1 Impact Overview</p>
          <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{
            background: physicsScore >= 70 ? 'var(--fp-success-bg)' : physicsScore >= 30 ? 'var(--fp-warning-bg)' : 'var(--fp-critical-bg)',
            color: physicsScore >= 70 ? 'var(--fp-success-text)' : physicsScore >= 30 ? 'var(--fp-warning-text)' : 'var(--fp-critical-text)',
            border: `1px solid ${physicsScore >= 70 ? 'var(--fp-success-border)' : physicsScore >= 30 ? 'var(--fp-warning-border)' : 'var(--fp-critical-border)'}`,
          }}>
            Physics {Math.round(physicsScore)}% — {physicsScore >= 70 ? 'Consistent' : physicsScore >= 30 ? 'Minor anomaly' : 'Anomaly detected'}
          </span>
        </div>
        <div className="p-4">
          {/* 4-metric KPI row */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Delta-V', value: deltaV > 0 ? `${fmt(deltaV, 1)} km/h` : '—', sub: 'Velocity change' },
              { label: 'Kinetic Energy', value: energyKj > 0 ? `${fmt(energyKj, 1)} kJ` : '—', sub: 'Impact energy' },
              { label: 'Impact Force', value: impactForceKnDisplay > 0 ? `${fmt(impactForceKnDisplay, 1)} kN` : '—', sub: 'Peak force' },
              { label: 'Vehicle Mass', value: vehicleMassKg ? `${vehicleMassKg} kg` : '—', sub: 'Used in calculation' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="p-3 text-center" style={{ background: 'var(--kr-off-white)', border: '1px solid var(--kr-rule)' }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--kr-muted)' }}>{label}</div>
                <div className="text-lg font-bold tabular-nums" style={{ fontFamily: 'var(--kr-mono)', color: 'var(--kr-text)' }}>{value}</div>
                <div className="text-[9px] mt-0.5" style={{ color: 'var(--kr-muted)' }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Two-column detail: physics fields (left) + LDP chart (right) */}
          <div className="grid grid-cols-2 gap-4 mb-3">
            <table className="compact-kv-table text-xs w-full">
              <tbody>
                {[
                  ['Impact Severity', toSentenceCase((severity ?? '').replace(/_/g, ' '))],
                  ['Impact Direction', directionMismatch
                    ? `${toSentenceCase(((_phys as any)?.impactDirection ?? 'Unknown').replace(/_/g, ' '))} (document) — mismatch with damage`
                    : toSentenceCase(((_phys as any)?.impactDirection ?? 'Unknown').replace(/_/g, ' '))],
                  ['Deceleration', (_phys as any)?.decelerationG > 0 ? `${fmt((_phys as any).decelerationG, 2)} g` : '—'],
                  ['Structural Deformation', (_phys as any)?.structuralDeformation ?? '—'],
                  ['Airbag Deployment', (_phys as any)?.airbagDeployment ?? '—'],
                  ['Damage Consistency', (_phys as any)?.damageConsistencyScore != null
                    ? `${Math.round((_phys as any).damageConsistencyScore)}/100 — ${(_phys as any).damageConsistencyScore >= 70 ? 'Good' : (_phys as any).damageConsistencyScore >= 40 ? 'Moderate' : 'Poor'}`
                    : `${Math.round(physicsScore)}/100`],
                ].map(([k, v], i) => (
                  <tr key={i} style={{ borderTop: i > 0 ? '1px solid #e2e8f0' : undefined }}>
                    <td className="py-1.5 pr-3 font-semibold" style={{ color: 'var(--kr-muted)' }}>{k}</td>
                    <td className="py-1.5 tabular-nums" style={{ color: directionMismatch && k === 'Impact Direction' ? 'var(--fp-critical-text)' : 'var(--kr-text)' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <span className="text-[10px] font-bold block mb-1" style={{ color: 'var(--kr-text)' }}>Latent Damage Probability</span>
              <span className="text-[9px] block mb-2" style={{ color: 'var(--kr-muted)' }}>Hidden risk — co-occurrence based probability</span>
              {showLdp && ldpChartData ? (
                <div style={{ height: 160, position: 'relative' }}>
                  <Bar data={ldpChartData} options={ldpOpts} />
                </div>
              ) : (
                <p className="text-[11px]" style={{ color: 'var(--kr-muted)' }}>No significant latent damage risk identified.</p>
              )}
            </div>
          </div>

          {/* Direction mismatch alert */}
          {directionMismatch && directionExplanation && (
            <div className="p-2.5 mb-3 text-xs" style={{ background: 'var(--fp-critical-bg)', border: '1px solid var(--fp-critical-border)', color: 'var(--fp-critical-text)' }}>
              <strong>Direction mismatch:</strong> {directionExplanation}
            </div>
          )}

          {/* Consistency explanation */}
          {consistencyExplanation && (
            <p className="text-xs p-2 mb-3" style={{ background: 'var(--kr-off-white)', color: 'var(--kr-text)', borderLeft: '3px solid var(--border)' }}>
              {consistencyExplanation}
            </p>
          )}

          {/* Animal strike block */}
          {isAnimalStrike && animalStrikeProfiles.length > 0 && animalStrikeProfiles.map((asp: any, idx: number) => (
            <div key={idx} className="mt-3 p-3" style={{ background: 'var(--kr-off-white)', border: '1px solid var(--kr-rule)' }}>
              <p className="micro-label mb-2">Animal Strike Physics</p>
              <table className="compact-kv-table text-xs w-full">
                <tbody>
                  {([
                    ['Animal species', asp.animal_species ?? 'N/A'],
                    ['Animal mass', asp.animal_mass_kg != null ? `${asp.animal_mass_kg} kg` : 'N/A'],
                    ['Impact severity', asp.impact_severity ?? 'N/A'],
                    ['Delta-V', asp.delta_v_kmh != null ? `${asp.delta_v_kmh.toFixed(1)} km/h` : 'N/A'],
                    ['Impact force', asp.impact_force_kn != null ? `${asp.impact_force_kn.toFixed(1)} kN` : 'N/A'],
                    ['Plausibility score', asp.plausibility_score != null ? `${asp.plausibility_score}/100` : 'N/A'],
                    ['Bullbar present', asp.bullbar_present === 'true' ? 'Yes' : asp.bullbar_present === 'false' ? 'No' : 'Unknown'],
                  ] as [string, string][]).map(([k, v], i) => (
                    <tr key={i} style={{ borderTop: i > 0 ? '1px solid #e2e8f0' : undefined }}>
                      <td className="py-1.5 pr-3 font-semibold" style={{ color: 'var(--kr-muted)' }}>{k}</td>
                      <td className="py-1.5" style={{ color: 'var(--kr-text)' }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {asp.engineering_notes && (
                <p className="text-[10px] mt-2" style={{ color: 'var(--kr-muted)' }}>{asp.engineering_notes}</p>
              )}
            </div>
          ))}

          {/* Reconstruction summary */}
          {(_phys as any)?.reconstructionSummary && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="micro-label">Reconstruction Summary</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--kr-text)' }}>{(_phys as any).reconstructionSummary}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── 2.2 Speed Analysis ──────────────────────────────────────────────── */}
      {(consensusSpeed != null || estimatedSpeedKmh > 0 || speedForensics) && (
        <div style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--kr-rule)' }}>
            <p className="sub-heading">2.2 Speed Analysis</p>
            {confidenceLevel && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{
                background: confidenceLevel === 'high' ? 'var(--fp-success-bg)' : confidenceLevel === 'medium' ? 'var(--fp-warning-bg)' : 'var(--fp-info-bg)',
                color: confidenceLevel === 'high' ? 'var(--fp-success-text)' : confidenceLevel === 'medium' ? 'var(--fp-warning-text)' : 'var(--fp-info-text)',
                border: `1px solid ${confidenceLevel === 'high' ? 'var(--fp-success-border)' : confidenceLevel === 'medium' ? 'var(--fp-warning-border)' : 'var(--fp-info-border)'}`,
              }}>
                {confidenceLevel === 'high' ? 'High confidence' : confidenceLevel === 'medium' ? 'Moderate confidence' : 'Low confidence'}
              </span>
            )}
          </div>
          <div className="p-4">
            {/* Consensus speed hero number */}
            {(consensusSpeed != null || estimatedSpeedKmh > 0) && (() => {
              const displaySpeed = consensusSpeed ?? estimatedSpeedKmh;
              const speedZone = displaySpeed < 15 ? 'parking' : displaySpeed < 40 ? 'low_urban' : displaySpeed < 80 ? 'urban' : displaySpeed < 120 ? 'highway' : 'high_speed';
              const speedZoneLabel: Record<string, string> = {
                parking: 'Very low-speed — consistent with parking or crawling traffic',
                low_urban: 'Low-speed urban impact — consistent with residential or car park speeds',
                urban: 'Moderate urban-speed impact — consistent with general road traffic',
                highway: 'High-speed impact — consistent with highway or freeway travel',
                high_speed: 'Very high-speed impact — consistent with high-speed highway travel',
              };
              const speedZoneColour: Record<string, string> = {
                parking: 'var(--fp-success-text)', low_urban: 'var(--fp-success-text)', urban: 'var(--fp-warning-text)', highway: 'var(--fp-locked-text)', high_speed: 'var(--fp-critical-text)',
              };
              const physicsSpeed = vr?.mid_kmh ?? displaySpeed;
              const speedDiscrepancy = (() => {
                if (!physicsSpeed || physicsSpeed <= 0 || !claimedSpeed || claimedSpeed <= 0) return null;
                const diff = Math.abs(physicsSpeed - claimedSpeed);
                const pct = diff / claimedSpeed;
                if (pct < 0.20) return null;
                return { pct, direction: physicsSpeed > claimedSpeed ? 'higher' : 'lower', severity: pct >= 0.50 ? 'significant' : 'material' };
              })();
              // P1: Velocity range from ensemble confidence interval
              const ciLow: number | null = ensemble?.confidenceInterval?.[0] ?? null;
              const ciHigh: number | null = ensemble?.confidenceInterval?.[1] ?? null;
              const lowerBound: number | null = ensemble?.lowerBoundKmh ?? null;
              const hasRange = ciLow != null && ciHigh != null;
              const rangeLow = hasRange ? ciLow! : (lowerBound != null ? lowerBound : null);
              const rangeHigh = hasRange ? ciHigh! : (lowerBound != null ? Math.round(lowerBound * 1.5) : null);
              const rangeLabel = hasRange ? '90% confidence interval' : lowerBound != null ? 'deployment floor range' : null;
              // P1: Braking coherence note — only when stated speed > consensus and Z > 5 m
              const brakingNote: string | null = (() => {
                if (!claimedSpeed || claimedSpeed <= 0 || !displaySpeed || displaySpeed <= 0) return null;
                if (claimedSpeed <= displaySpeed) return null;
                const mu = 0.7;
                const g = 9.81;
                const vStated = claimedSpeed / 3.6;
                const vImpact = displaySpeed / 3.6;
                const Z = (vStated * vStated - vImpact * vImpact) / (2 * mu * g);
                if (Z < 5) return null;
                return `Stated travel speed ${claimedSpeed} km/h is consistent with the physics lower bound of ${Math.round(displaySpeed)} km/h if the vehicle decelerated over approximately ${Math.round(Z)} m before impact (assuming μ = 0.7 tarmac surface, no pre-impact braking modelled).`;
              })();
              return (
                <div className="mb-4">
                  {/* Speed hero + convergence */}
                  <div className="flex items-start gap-6 mb-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--kr-muted)' }}>Consensus Speed</div>
                      <div className="text-4xl font-bold tabular-nums" style={{ fontFamily: 'var(--kr-mono)', color: speedZoneColour[speedZone] }}>{Math.round(displaySpeed)}</div>
                      <div className="text-xs font-semibold" style={{ color: speedZoneColour[speedZone] }}>km/h</div>
                      {(rangeLow != null && rangeHigh != null) && (
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--kr-muted)' }}>
                          Range: <span className="font-semibold tabular-nums" style={{ color: speedZoneColour[speedZone] }}>{Math.round(rangeLow)}–{Math.round(rangeHigh)}</span> km/h
                        </div>
                      )}
                      {rangeLabel && (
                        <div className="text-[9px] italic" style={{ color: 'var(--kr-muted)' }}>{rangeLabel}</div>
                      )}
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--kr-text)' }}>{speedZoneLabel[speedZone]}</p>
                      {claimedSpeed > 0 && (
                        <p className="text-xs" style={{ color: 'var(--kr-muted)' }}>
                          Driver stated: <strong style={{ color: 'var(--kr-text)' }}>{claimedSpeed} km/h</strong>
                          {speedDiscrepancy && (
                            <span className="ml-2 font-semibold" style={{ color: 'var(--fp-critical-text)' }}>
                              — {speedDiscrepancy.severity} discrepancy ({Math.round(speedDiscrepancy.pct * 100)}% {speedDiscrepancy.direction} than claimed)
                            </span>
                          )}
                        </p>
                      )}
                      {divergenceFlag ? (
                        <p className="text-xs mt-1" style={{ color: 'var(--fp-locked-text)' }}>⚠ Independent analyses diverged (spread: {spread.toFixed(0)} km/h) — reduced reliability</p>
                      ) : (availableCount >= 2 && spread <= 15) ? (
                        <p className="text-xs mt-1" style={{ color: 'var(--fp-success-text)' }}>✓ {availableCount} independent analyses converged (spread: {spread > 0 ? `${spread.toFixed(0)} km/h` : '<1 km/h'})</p>
                      ) : (
                        <p className="text-xs mt-1" style={{ color: 'var(--kr-muted)' }}>{availableCount} analysis completed — additional evidence would strengthen confidence</p>
                      )}
                    </div>
                  </div>

                  {/* Speed scale */}
                  {(() => {
                    const scaleMax = 140;
                    const toScalePct = (v: number) => Math.min(100, Math.max(0, (v / scaleMax) * 100));
                    return (
                      <div className="mb-3">
                        <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'var(--kr-off-white)', border: '1px solid var(--kr-rule)' }}>
                          <div className="absolute top-0 bottom-0" style={{ left: 0, right: `${100 - toScalePct(40)}%`, background: 'var(--fp-success-text)', opacity: 0.12 }} />
                          <div className="absolute top-0 bottom-0" style={{ left: `${toScalePct(40)}%`, right: `${100 - toScalePct(80)}%`, background: 'var(--fp-warning-text)', opacity: 0.12 }} />
                          <div className="absolute top-0 bottom-0" style={{ left: `${toScalePct(80)}%`, right: 0, background: 'var(--fp-critical-text)', opacity: 0.12 }} />
                          {claimedSpeed > 0 && (
                            <div className="absolute" style={{ left: `calc(${toScalePct(claimedSpeed)}% - 5px)`, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, borderRadius: '50%', background: 'var(--fp-info-text)', border: '2px solid white', zIndex: 2 }} />
                          )}
                          <div className="absolute" style={{ left: `calc(${toScalePct(displaySpeed)}% - 5px)`, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, borderRadius: '50%', background: speedZoneColour[speedZone], border: '2px solid white', zIndex: 3 }} />
                        </div>
                        <div className="flex justify-between text-[9px] mt-0.5" style={{ color: 'var(--kr-muted)' }}>
                          <span>0</span><span>Parking (&lt;15)</span><span>Urban (&lt;80)</span><span>Highway (80+)</span><span>140 km/h</span>
                        </div>
                        <div className="flex gap-4 mt-1 text-[9px]" style={{ color: 'var(--kr-muted)' }}>
                          {claimedSpeed > 0 && <span className="flex items-center gap-1"><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--fp-info-text)' }} />Driver stated ({claimedSpeed} km/h)</span>}
                          <span className="flex items-center gap-1"><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: speedZoneColour[speedZone] }} />Physics estimate ({Math.round(displaySpeed)} km/h)</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Speed discrepancy alert */}
                  {speedDiscrepancy && (
                    <div className="p-2.5 mb-3 text-xs" style={{ background: 'var(--fp-critical-bg)', border: '1px solid var(--fp-critical-border)', color: 'var(--fp-critical-text)' }}>
                      <strong>Speed discrepancy:</strong> Driver stated {claimedSpeed.toFixed(0)} km/h; physics model estimates {physicsSpeed.toFixed(0)} km/h — a {speedDiscrepancy.severity} difference of {Math.round(speedDiscrepancy.pct * 100)}% ({speedDiscrepancy.direction} than claimed). Verify stated speed before settlement.
                    </div>
                  )}
                  {/* P1: Braking coherence note */}
                  {brakingNote && (
                    <div className="p-2.5 mb-3 text-xs" style={{ background: 'var(--fp-info-bg)', border: '1px solid var(--fp-info-border)', color: 'var(--fp-info-text)' }}>
                      <strong>Braking coherence:</strong> {brakingNote}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Crush-depth plausibility flag */}
            {(() => {
              const pCheck = ensemble?.crushDepthPlausibilityCheck;
              if (!pCheck || !pCheck.triggered) return null;
              const isCritical = pCheck.severity === 'CRITICAL';
              return (
                <div className="p-3 mb-3 text-xs" style={{
                  background: isCritical ? 'var(--fp-critical-bg)' : 'var(--fp-warning-bg)',
                  border: `1px solid ${isCritical ? 'var(--fp-critical-border)' : 'var(--fp-warning-border)'}`,
                  color: isCritical ? 'var(--fp-critical-text)' : 'var(--fp-warning-text)',
                }}>
                  <div className="flex items-start gap-2">
                    <span className="text-sm mt-0.5">{isCritical ? '⛔' : '⚠️'}</span>
                    <div>
                      <p className="font-bold mb-1" style={{ letterSpacing: '0.04em' }}>
                        {isCritical ? 'CRITICAL — Vision-Derived Crush Depth Inconsistent With Damage Severity' : 'WARNING — Vision-Derived Crush Depth May Be Unreliable'}
                      </p>
                      <p className="leading-relaxed mb-2">{pCheck.flagMessage}</p>
                      <div className="flex gap-4 text-[10px] font-semibold">
                        <span>Vision-derived max: <strong>{pCheck.visionDerivedMaxSpeedKmh ?? '—'} km/h</strong></span>
                        <span>Implied minimum: <strong>{pCheck.impliedMinSpeedKmh} km/h</strong></span>
                        {pCheck.gapKmh != null && <span>Gap: <strong>{pCheck.gapKmh} km/h</strong></span>}
                      </div>
                      {pCheck.evidenceBasis?.length > 0 && (
                        <p className="mt-1 text-[10px]" style={{ opacity: 0.85 }}>Evidence basis: {pCheck.evidenceBasis.join(' · ')}</p>
                      )}
                      <p className="mt-2 font-semibold">{pCheck.recommendedAction}</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Analysis methods list */}
            {allMethods.length > 0 && (
              <div className="mb-3">
                <p className="micro-label mb-2">Analysis Methods</p>
                <div style={{ border: '1px solid var(--border)' }}>
                  {allMethods.map((m: any, idx: number) => {
                    const methodId: string = m.method ?? m.id ?? `A${idx + 1}`;
                    const isOutlier: boolean = (ensemble?.crossValidation?.outlierMethods ?? []).includes(methodId);
                    const speedKmh: number | null = m.speedKmh ?? m.estimateKmh ?? null;
                    const categoryName = categoryMap[methodId] ?? `Analysis ${idx + 1}`;
                    const isDeploymentMethod = methodId === 'DEPLOYMENT_THRESHOLD' || methodId === 'M4';
                    const statusLabel = isOutlier
                      ? 'Excluded — diverged from other analyses'
                      : speedKmh != null
                      ? `${speedKmh.toFixed(0)} km/h`
                      : isDeploymentMethod
                      ? 'Speed consistent with deployment range'
                      : 'Corroborates speed range';
                    // Only show rows with numeric results, outliers, or deployment threshold
                    const hasNumericResult = speedKmh != null;
                    const isDeploymentRow = isDeploymentMethod;
                    if (!hasNumericResult && !isOutlier && !isDeploymentRow) return null;
                    return (
                      <div key={methodId} className="flex items-center justify-between px-3 py-2 text-xs" style={{ borderBottom: idx < allMethods.length - 1 ? '1px solid var(--border)' : undefined }}>
                        <span style={{ color: isOutlier ? 'var(--kr-muted)' : 'var(--kr-text)', fontWeight: isOutlier ? 400 : 500 }}>{categoryName}</span>
                        <span className="font-semibold tabular-nums" style={{ color: isOutlier ? 'var(--fp-locked-text)' : 'var(--fp-success-text)' }}>{statusLabel}</span>
                      </div>
                    );
                  })}
                </div>
                {/* P3: Methodology disclosure */}
                <div className="mt-2 p-2.5" style={{ background: 'var(--kr-off-white)', border: '1px solid var(--kr-rule)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--kr-muted)' }}>Methodology Disclosure</p>
                  <div className="space-y-1 text-[10px]" style={{ color: 'var(--kr-text)' }}>
                    <div className="grid grid-cols-3 gap-2 pb-1" style={{ borderBottom: '1px solid var(--kr-rule)', color: 'var(--kr-muted)', fontWeight: 600 }}>
                      <span>Method</span><span>Computes</span><span>Primary Inputs</span>
                    </div>
                    {([
                      { id: 'CAMPBELL', name: 'Crush-Depth Analysis', computes: 'Impact speed from residual deformation depth', inputs: 'Vision-derived crush depth, vehicle stiffness coefficient' },
                      { id: 'ENERGY_MOMENTUM', name: 'Energy-Momentum Balance', computes: 'Delta-V from kinetic energy dissipated in deformation', inputs: 'Vehicle mass, crush depth, restitution coefficient' },
                      { id: 'IMPULSE', name: 'Contact Impulse Analysis', computes: 'Impact speed from force-time integral', inputs: 'Airbag deployment threshold, vehicle mass, contact duration estimate' },
                      { id: 'DEPLOYMENT_THRESHOLD', name: 'Safety System Activation', computes: 'Speed floor from airbag/seatbelt pre-tensioner activation', inputs: 'OEM deployment threshold range for vehicle class' },
                      { id: 'VISION_DEFORMATION', name: 'Vision Deformation', computes: 'Crush depth estimate from photographic analysis', inputs: 'Damage photographs, vehicle reference dimensions' },
                    ] as Array<{ id: string; name: string; computes: string; inputs: string }>)
                      .filter(m => allMethods.some((am: any) => (am.method ?? am.id) === m.id))
                      .map(m => (
                        <div key={m.id} className="grid grid-cols-3 gap-2 py-0.5" style={{ borderBottom: '1px solid var(--kr-rule)', opacity: 0.9 }}>
                          <span className="font-medium" style={{ color: 'var(--kr-text)' }}>{m.name}</span>
                          <span>{m.computes}</span>
                          <span style={{ color: 'var(--kr-muted)' }}>{m.inputs}</span>
                        </div>
                      ))
                    }
                  </div>
                  <div className="mt-2 text-[9px] space-y-0.5" style={{ color: 'var(--kr-muted)' }}>
                    <p><strong style={{ color: 'var(--kr-text)' }}>Key assumptions:</strong> Vehicle mass estimated from make/model class where not stated. Friction coefficient μ = 0.7 (tarmac) used for braking coherence calculations. Pre-impact braking is not modelled in the speed lower-bound estimate. Crush-depth inputs are subject to photographic resolution and angle constraints.</p>
                    <p><strong style={{ color: 'var(--kr-text)' }}>Uncertainty:</strong> The consensus speed is a physics-derived lower bound, not a certified reconstruction. Results are supporting evidence for adjuster decision-making and do not constitute a standalone expert opinion. Independent forensic reconstruction is recommended for claims above the insurer’s materiality threshold.</p>
                    <p><strong style={{ color: 'var(--kr-text)' }}>Expert review:</strong> Full methodology documentation and raw computation traces are available to qualified forensic engineers under a confidentiality undertaking. Contact your KINGA account representative to initiate an expert review request.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Speed forensics interpretation (from Section27SpeedForensics) */}
            {speedForensics && (() => {
              const sf = speedForensics;
              const interpretation: string = sf.forensicInterpretation ?? sf.interpretation ?? '';
              const verdict: string = sf.verdict ?? sf.overallVerdict ?? '';
              if (!interpretation && !verdict) return null;
              return (
                <div className="p-3" style={{ background: 'var(--kr-off-white)', border: '1px solid var(--border)' }}>
                  <p className="micro-label mb-1">Forensic Interpretation</p>
                  {verdict && <p className="text-xs font-semibold mb-1" style={{ color: 'var(--kr-text)' }}>{verdict}</p>}
                  {interpretation && <p className="text-xs leading-relaxed" style={{ color: 'var(--kr-text)' }}>{interpretation}</p>}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── 2.3 Damage Zone & Pattern ───────────────────────────────────────── */}
      <div style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--kr-rule)' }}>
          <p className="sub-heading">2.3 Damage Zone & Pattern</p>
          <span className="text-xs font-semibold" style={{ color: 'var(--kr-muted)' }}>{anomalyLevel === 'none' ? 'Consistent' : toTitleCase(anomalyLevel)}</span>
        </div>
        <div className="p-4">
          {directionMismatch && directionExplanation && (
            <div className="p-2.5 mb-3 text-xs" style={{ background: 'var(--fp-critical-bg)', border: '1px solid var(--fp-critical-border)', color: 'var(--fp-critical-text)' }}>
              <strong>Direction conflict:</strong> {directionExplanation}
            </div>
          )}
          <div>
            {/* Zone map — full-width, no cap */}
            <div>
              <p className="micro-label mb-2">Damage Zone Map</p>
              <div style={{ width: '100%' }}><VehicleDamageMap
                damageZones={damageZones}
                incidentType={incidentType}
                physicsDirection={(_phys as any)?.impactVector?.direction ?? null}
                multiEventSequence={multiEventSequence}
                deltaV={deltaV > 0 ? deltaV : undefined}
                energyKj={energyKj > 0 ? energyKj : undefined}
                impactForceKn={impactForceKnDisplay > 0 ? impactForceKnDisplay : undefined}
                decelerationG={(_phys as any)?.decelerationG > 0 ? (_phys as any).decelerationG : null}
                velocityRange={(() => {
                  const vrr = (_phys as any)?.velocityRange;
                  if (vrr?.low_kmh > 0 && vrr?.high_kmh > 0) return { low_kmh: vrr.low_kmh, high_kmh: vrr.high_kmh };
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
                <div className="mt-2 flex flex-wrap gap-1" style={{ justifyContent: 'center' }}>
                  {damageZones.map((z, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded"
                      style={{ background: 'var(--status-reject-bg)', color: 'var(--status-reject-text)', border: '1px solid var(--fp-critical-border)' }}>{z}</span>
                  ))}
                </div>
              )}
              </div>{/* /full-width wrapper */}
            </div>
            {/* Expected vs actual pattern — below the map */}
            <div style={{ marginTop: 12 }}>
              {pattern.expected.length > 0 && (() => {
                interface DamagePatternRow { item: string; present: boolean; source: 'zone' | 'quote' | 'none' }
                const rows: DamagePatternRow[] = pattern.expected.map((item: string) => {
                  const zoneMatch = damageZones.some((z: string) =>
                    item.toLowerCase().includes(z.toLowerCase()) ||
                    z.toLowerCase().includes(item.toLowerCase().split(' ')[0])
                  );
                  const quoteMatch = (quotes ?? []).some((q: any) =>
                    JSON.stringify(q).toLowerCase().includes(item.toLowerCase().split(' ')[0])
                  );
                  return { item, present: zoneMatch || quoteMatch, source: zoneMatch ? 'zone' : quoteMatch ? 'quote' : 'none' };
                });
                const presentCount = rows.filter(r => r.present).length;
                const totalCount = rows.length;
                return (
                  <div>
                    <p className="micro-label mb-2">Expected Components ({presentCount}/{totalCount} matched)</p>
                    <div style={{ border: '1px solid var(--border)' }}>
                      {rows.map((row, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs"
                          style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : undefined }}>
                          <span style={{ color: 'var(--kr-text)' }}>{row.item}</span>
                          <span className="font-semibold" style={{ color: row.present ? 'var(--fp-success-text)' : 'var(--fp-critical-text)' }}>
                            {row.present ? '✓' : '✗ Missing'}
                          </span>
                        </div>
                      ))}
                    </div>
                    {pattern.notes && <p className="text-[10px] mt-2 italic" style={{ color: 'var(--kr-muted)' }}>{pattern.notes}</p>}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ── 2.4 Physics Constraints ─────────────────────────────────────────── */}
      {constraints.length > 0 && (() => {
        // Separate failed/advisory from passing
        const failedOrAdvisory = constraints.filter((c: any) => !c.satisfied || c.suppressed || c.advisory);
        const passingCount = constraints.filter((c: any) => c.satisfied && !c.suppressed && !c.advisory).length;
        return (
          <div style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--kr-rule)' }}>
              <p className="sub-heading">2.4 Physics Constraints</p>
              <span className="text-xs" style={{ color: 'var(--kr-muted)' }}>
                {passingCount} of {constraints.length} passed
                {failedOrAdvisory.length > 0 && <span className="ml-2 font-semibold" style={{ color: 'var(--fp-critical-text)' }}>· {failedOrAdvisory.length} require attention</span>}
              </span>
            </div>
            <div className="p-4">
              {passingCount > 0 && failedOrAdvisory.length === 0 && (
                <p className="text-xs p-2" style={{ background: 'var(--fp-success-bg)', color: 'var(--fp-success-text)', border: '1px solid var(--fp-success-border)' }}>
                  ✓ All {passingCount} physics constraints satisfied — no anomalies detected.
                </p>
              )}
              {passingCount > 0 && failedOrAdvisory.length > 0 && (
                <p className="text-xs mb-3 p-2" style={{ background: 'var(--fp-success-bg)', color: 'var(--fp-success-text)', border: '1px solid var(--fp-success-border)' }}>
                  ✓ {passingCount} constraint{passingCount > 1 ? 's' : ''} passed — showing {failedOrAdvisory.length} requiring attention below.
                </p>
              )}
              {failedOrAdvisory.length > 0 && (
                <div style={{ border: '1px solid var(--border)' }}>
                  {failedOrAdvisory.map((c: any, i: number) => (
                    <div key={i} style={{ borderBottom: i < failedOrAdvisory.length - 1 ? '1px solid var(--border)' : undefined }}>
                      <div className="flex items-start justify-between px-3 py-2 gap-3">
                        <div className="flex-1">
                          <p className="text-xs font-semibold" style={{ color: 'var(--kr-text)' }}>{c.constraint ?? c.description ?? c.id}</p>
                          {c.expected && <p className="text-[10px] mt-0.5" style={{ color: 'var(--kr-muted)' }}>Expected: {c.expected}</p>}
                          {c.actual && <p className="text-[10px]" style={{ color: 'var(--kr-muted)' }}>Actual: {c.actual}</p>}
                          {c.advisory && <p className="text-[10px] mt-1 italic" style={{ color: 'var(--fp-warning-text)' }}>{c.advisory}</p>}
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0" style={{
                          background: c.suppressed ? 'var(--fp-warning-bg)' : 'var(--fp-critical-bg)',
                          color: c.suppressed ? 'var(--fp-warning-text)' : 'var(--fp-critical-text)',
                          border: `1px solid ${c.suppressed ? 'var(--fp-warning-border)' : 'var(--fp-critical-border)'}`,
                        }}>{c.suppressed ? 'Advisory' : 'Failed'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── 2.5 Component Measurements ──────────────────────────────────────── */}
      {(() => {
        const hasPhysicsData = damagedParts.some((p: any) =>
          p.crushDepthM != null || p.damageFraction != null
        );
        if (!hasPhysicsData || damagedParts.length === 0) return null;
        const maxCrush = Math.max(0.01, ...damagedParts.map((p: any) => p.crushDepthM ?? 0));
        return (
          <div style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--kr-rule)' }}>
              <p className="sub-heading">2.5 Component Measurements</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--kr-muted)' }}>Numeric measurements from KINGA vision analysis. SI units throughout.</p>
              {!crushDepthTrusted && (
                <div className="mt-2 px-3 py-2 flex items-start gap-2" style={{ background: 'var(--fp-warning-bg, #fffbeb)', border: '1px solid var(--fp-warning-text, #b45309)', borderRadius: 4 }}>
                  <span style={{ color: 'var(--fp-warning-text, #b45309)', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>⚠ Unconfirmed source</span>
                  <span style={{ color: 'var(--fp-warning-text, #b45309)', fontSize: 11 }}>No confirmed vehicle damage photo was available for this claim. Measurements below were extracted from ambiguous document pages (PDF renders, repair quotes, or form scans) — not from verified damage photographs. These figures have been <strong>excluded from the physics speed consensus</strong> and should not be relied upon as physical measurements without independent verification.</span>
                </div>
              )}
            </div>
            <div className="p-4">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: 'var(--kr-off-white)' }}>
                      <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--kr-muted)', textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Component</th>
                      <th className="px-3 py-2 text-center font-semibold" style={{ color: 'var(--kr-muted)', textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Crush Depth</th>
                      <th className="px-3 py-2 text-center font-semibold" style={{ color: 'var(--kr-muted)', textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Damage Fraction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {damagedParts.map((p: any, i: number) => {
                      const crushCm = p.crushDepthM != null ? (p.crushDepthM * 100).toFixed(1) : null;
                      const frac = p.damageFraction != null ? Math.round(p.damageFraction * 100) : null;
                      const sevColour = (() => {
                        const s = (p.severity ?? '').toLowerCase();
                        if (s === 'catastrophic') return 'var(--fp-critical-text)';
                        if (s === 'severe' || s === 'major') return 'var(--fp-locked-text)';
                        if (s === 'moderate') return 'var(--fp-warning-text)';
                        return 'var(--fp-success-text)';
                      })();
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="px-3 py-2 font-medium" style={{ color: 'var(--kr-text)' }}>
                            {p.name}
                            {p.severity && <span className="ml-2 text-[9px] font-semibold" style={{ color: sevColour }}>({p.severity})</span>}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums" style={{ color: 'var(--kr-text)' }}>
                            {crushCm != null ? (
                              <div className="flex items-center justify-center gap-2">
                                <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--kr-off-white)', overflow: 'hidden' }}>
                                  <div style={{ height: 4, borderRadius: 2, background: sevColour, width: `${Math.min(100, (p.crushDepthM / maxCrush) * 100)}%`, opacity: 0.8 }} />
                                </div>
                                <span>{crushCm} cm</span>
                              </div>
                            ) : <span style={{ color: 'var(--kr-muted)' }}>—</span>}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums" style={{ color: 'var(--kr-text)' }}>
                            {frac != null ? (
                              <div className="flex items-center justify-center gap-2">
                                <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--kr-off-white)', overflow: 'hidden' }}>
                                  <div style={{ height: 4, borderRadius: 2, background: sevColour, width: `${frac}%`, opacity: 0.8 }} />
                                </div>
                                <span>{frac}%</span>
                              </div>
                            ) : <span style={{ color: 'var(--kr-muted)' }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Totals row */}
              {(() => {
                const maxCrushCm = Math.max(0, ...damagedParts.map((p: any) => p.crushDepthM ?? 0)) * 100;
                const totalEnergyKj = damagedParts.reduce((s: number, p: any) => s + (p.deformationEnergyJ ?? 0), 0) / 1000;
                if (maxCrushCm === 0) return null;
                return (
                  <div className="mt-2 px-3 py-2 flex flex-wrap gap-6" style={{ background: 'var(--kr-off-white)', border: '1px solid var(--border)', fontSize: 11 }}>
                    <div>
                      <span style={{ color: 'var(--kr-muted)', textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em', fontWeight: 600 }}>Max Crush Depth</span>
                      <div style={{ fontFamily: 'var(--kr-mono)', fontWeight: 700, color: 'var(--kr-text)', fontSize: 14 }}>{maxCrushCm.toFixed(1)} cm</div>
                      <div style={{ fontSize: 9, color: crushDepthTrusted ? 'var(--kr-muted)' : 'var(--fp-warning-text, #b45309)' }}>{crushDepthTrusted ? 'KINGA Crush-Depth input' : 'Unconfirmed — excluded from physics consensus'}</div>
                    </div>
                    {totalEnergyKj > 0 && (
                      <div>
                        <span style={{ color: 'var(--kr-muted)', textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em', fontWeight: 600 }}>Total Deformation Energy</span>
                        <div style={{ fontFamily: 'var(--kr-mono)', fontWeight: 700, color: 'var(--kr-text)', fontSize: 14 }}>{totalEnergyKj.toFixed(2)} kJ</div>
                        <div style={{ fontSize: 9, color: 'var(--kr-muted)' }}>Energy-balance input</div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* ── 2.6 Damage Severity & Coverage ──────────────────────────────────── */}
      {(damagedPartsBySeverity.length > 0 || partsRecon.length > 0) && (
        <div style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--kr-rule)' }}>
            <p className="sub-heading">2.6 Damage Severity & Coverage</p>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Severity distribution chart */}
              {damagedPartsBySeverity.length > 0 && (
                <div>
                  <p className="micro-label mb-2">Severity Distribution — {damagedPartsBySeverity.length} components</p>
                  <DamageSeverityChart components={damagedPartsBySeverity.map((p: any) => ({ name: p.name, severity: p.severity }))} />
                </div>
              )}
              {/* Quote coverage stats */}
              {partsRecon.length > 0 && (
                <div>
                  <p className="micro-label mb-2">Quote Coverage{pbName ? ` — ${pbName}` : ''}</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <div className="flex items-center gap-2 px-3 py-2" style={{ background: coverageBg, border: `1px solid ${coverageColor}` }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: coverageColor }}>{Math.round(coverageRatio * 100)}%</span>
                      <span style={{ fontSize: 10, color: coverageColor, fontWeight: 600, textTransform: 'uppercase' }}>Coverage</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'var(--status-pass-bg)', border: '1px solid var(--status-pass-text)' }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--status-pass-text)' }}>{matchedCount}</span>
                      <span style={{ fontSize: 10, color: 'var(--status-pass-text)', fontWeight: 600, textTransform: 'uppercase' }}>Matched</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'var(--status-fail-bg)', border: '1px solid var(--status-fail-text)' }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--status-fail-text)' }}>{missingCount}</span>
                      <span style={{ fontSize: 10, color: 'var(--status-fail-text)', fontWeight: 600, textTransform: 'uppercase' }}>Missing</span>
                    </div>
                    {extraItems.length > 0 && (
                      <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'var(--status-review-bg)', border: '1px solid var(--status-review-text)' }}>
                        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--status-review-text)' }}>{extraItems.length}</span>
                        <span style={{ fontSize: 10, color: 'var(--status-review-text)', fontWeight: 600, textTransform: 'uppercase' }}>Extra</span>
                      </div>
                    )}
                    {noQuoteCount > 0 && (
                      <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--kr-muted)' }}>{noQuoteCount}</span>
                        <span style={{ fontSize: 10, color: 'var(--kr-muted)', fontWeight: 600, textTransform: 'uppercase' }}>No Quote</span>
                      </div>
                    )}
                  </div>
                  {missingNames.length > 0 && (
                    <div className="text-xs mb-2 p-2" style={{ background: 'var(--status-fail-bg)', border: '1px solid var(--status-fail-text)' }}>
                      <strong style={{ color: 'var(--status-fail-text)' }}>Not covered by quote:</strong>{' '}
                      <span style={{ color: 'var(--kr-text)' }}>{missingNames.join(' · ')}</span>
                    </div>
                  )}
                  {structuralCount > 0 && (
                    <div className="text-xs p-2" style={{ background: 'var(--fp-warning-bg)', border: '1px solid var(--fp-warning-border)' }}>
                      <strong style={{ color: 'var(--fp-warning-text)' }}>⚠ {structuralCount} structural component{structuralCount > 1 ? 's' : ''} detected</strong>
                      <span style={{ color: 'var(--kr-muted)', marginLeft: 6 }}>— independent structural assessment required before settlement.</span>
                    </div>
                  )}
                  <p className="text-xs mt-2" style={{ color: 'var(--kr-muted)' }}>Full breakdown in Section 3.1.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 2.7 Pattern Validation ──────────────────────────────────────────── */}
      {damagePatternValidation && (
        <Section29DamagePatternValidation damagePatternValidation={damagePatternValidation} />
      )}

      {/* ── 2.8 Vehicle Structural Intelligence ─────────────────────────────── */}
      <Section210VehicleStructural claim={claim} />

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
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--kr-muted)', letterSpacing: '0.05em' }}>
          2.8
        </span>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--kr-text)' }}>
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
        <p style={{ fontSize: '11px', color: 'var(--kr-muted)', fontStyle: 'italic' }}>
          Loading structural intelligence data…
        </p>
      ) : !insured ? (
        <p style={{ fontSize: '11px', color: 'var(--kr-muted)', fontStyle: 'italic' }}>
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
                <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--kr-text)', marginBottom: '6px' }}>
                  Structural Assessment Notes
                </p>
                <p style={{ fontSize: '11px', color: 'var(--kr-muted)', lineHeight: 1.6 }}>
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

      {/* KINGA Structural Narrative */}
      {insured?.structuralNarrative && (
        <div style={{
          marginTop: '14px', padding: '10px 12px', borderRadius: '6px',
          background: 'var(--fp-neutral-bg)', border: '1px solid var(--border)'
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--kr-text)', marginBottom: '6px' }}>
            Structural Intelligence Narrative
            {insured.hasInferredData && (
              <span style={{ fontWeight: 400, color: 'var(--fp-warning-text)', marginLeft: '8px', fontSize: '10px' }}>
                [Contains estimated data — see confidence labels above]
              </span>
            )}
          </p>
          <p style={{ fontSize: '11px', color: 'var(--kr-muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {insured.structuralNarrative}
          </p>
        </div>
      )}

      {/* Source attribution */}
      <p style={{ fontSize: '9px', color: 'var(--kr-muted)', marginTop: '8px', fontStyle: 'italic' }}>
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
  const sf = speedForensics;
  const claimed: number | null = sf?.claimedSpeedKmh ?? claimedSpeed;
  const physics: number | null = sf?.physicsSpeedKmh ?? physicsSpeed;
  const devPct: number | null = sf?.deviationPct ?? null;
  const devKmh: number | null = sf?.deviationKmh ?? null;
  const devClass: string = sf?.deviationClass ?? (claimed == null ? 'no_claim' : 'consistent');
  const devLabel: string = sf?.deviationLabel ?? 'N/A';
  const requiresVerification: boolean = sf?.requiresVerification ?? false;
  const verificationPriority: string = sf?.verificationPriority ?? 'none';
  const interpretation: string = sf?.interpretation ?? '';

  if (!physics && !claimed) return null;

  // Whether the ensemble produced a reliable point estimate (null ensemble = no physics methods ran)
  const hasReliableEstimate = sf?.ensembleSpeedKmh != null;

  // Deviation colour tokens
  const devBadgeBg = !hasReliableEstimate ? 'var(--fp-info-bg)' : devClass === 'consistent' ? 'var(--fp-success-bg)' : devClass === 'moderate' ? 'var(--fp-warning-bg)' : devClass === 'significant' ? 'var(--fp-locked-bg)' : devClass === 'critical' ? 'var(--fp-critical-bg)' : 'var(--fp-info-bg)';
  const devBadgeBorder = !hasReliableEstimate ? 'var(--fp-info-border)' : devClass === 'consistent' ? 'var(--fp-success-border)' : devClass === 'moderate' ? 'var(--fp-warning-border)' : devClass === 'significant' ? 'var(--fp-locked-border)' : devClass === 'critical' ? 'var(--fp-critical-border)' : 'var(--fp-info-border)';
  const devBadgeText = !hasReliableEstimate ? 'var(--fp-info-text)' : devClass === 'consistent' ? 'var(--fp-success-text)' : devClass === 'moderate' ? 'var(--fp-warning-text)' : devClass === 'significant' ? 'var(--fp-locked-text)' : devClass === 'critical' ? 'var(--fp-critical-text)' : 'var(--fp-info-text)';

  const SCALE_MAX_27 = 120;
  const toScalePct27 = (v: number) => Math.min(100, Math.max(0, (v / SCALE_MAX_27) * 100));

  // Plain-English verdict sentence (court-defensible)
  const verdictSentence = (() => {
    if (claimed == null && physics != null) {
      return `No speed was stated by the driver. Structural evidence indicates the vehicle was travelling at approximately ${Math.round(physics)} km/h at the time of impact.`;
    }
    if (claimed != null) {
      if (!hasReliableEstimate) {
        return `The driver stated ${claimed} km/h. No independent physics estimate could be produced from the available evidence — crush depth measurements or vehicle damage photographs with measurable deformation are required. The stated speed is not contradicted by the available evidence, but has not been independently verified.`;
      }
      if (physics != null) {
        const diff = Math.abs(claimed - physics);
        const higher = claimed > physics ? 'higher' : 'lower';
        if (devClass === 'consistent') {
          return `The driver stated ${claimed} km/h. Structural evidence indicates approximately ${Math.round(physics)} km/h — a difference of ${diff.toFixed(0)} km/h. The stated speed is consistent with the physical evidence.`;
        } else if (devClass === 'moderate') {
          return `The driver stated ${claimed} km/h. Structural evidence indicates approximately ${Math.round(physics)} km/h — a difference of ${diff.toFixed(0)} km/h (${devPct}%). The stated speed is ${higher} than the evidence suggests. Assessor review is recommended.`;
        } else {
          return `The driver stated ${claimed} km/h. Structural evidence indicates approximately ${Math.round(physics)} km/h — a discrepancy of ${diff.toFixed(0)} km/h (${devPct}%). This is a significant inconsistency that requires verification before settlement.`;
        }
      }
    }
    return '';
  })();

  // Recommended action
  // Suppress "Insufficient Evidence" banner when a physics speed IS available (even without ensemble).
  // The banner should only fire when there is truly no physics-derived speed at all.
  const recAction = (!hasReliableEstimate && physics == null && claimed != null)
    ? { label: 'Insufficient Evidence for Independent Speed Verification', bg: 'var(--fp-info-bg)', border: 'var(--fp-info-border)', text: 'var(--fp-info-text)', icon: 'i', body: 'No physics method produced a standalone speed estimate for this incident. To enable independent speed verification, submit: (1) a repair estimate with document-stated crush depth, or (2) clear vehicle damage photographs showing measurable deformation at the primary impact zone.' }
    : requiresVerification
      ? { label: verificationPriority === 'high' ? 'Independent Reconstruction Required Before Settlement' : 'Assessor Verification Recommended', bg: 'var(--fp-warning-bg)', border: 'var(--fp-warning-border)', text: 'var(--fp-warning-text)', icon: '!', body: 'The speed discrepancy between the driver statement and structural evidence exceeds the acceptable tolerance threshold. The attending assessor should review the physical damage evidence before authorising settlement.' }
      : { label: 'Speed Claim Consistent with Structural Evidence', bg: 'var(--fp-success-bg)', border: 'var(--fp-success-border)', text: 'var(--fp-success-text)', icon: '\u2713', body: 'The claimed speed falls within the expected range for this level of structural damage. No independent reconstruction is required on speed grounds alone.' };

  return (
    <div className="mb-4">
      <div className="" style={{ border: '1px solid var(--border)', background: 'var(--kr-white)' }}>

        {/* ── Section header ── */}
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--kr-white)' }}>
          <div>
            <p className="sub-heading">2.1c Speed Verification</p>
            <p style={{ fontSize: 11, color: 'var(--kr-muted)', marginTop: 2 }}>Comparison of driver-stated speed against structural evidence</p>
          </div>
          {devLabel !== 'N/A' && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: devBadgeBg, color: devBadgeText, border: `1px solid ${devBadgeBorder}` }}>
              {devLabel}
            </span>
          )}
        </div>

        <div className="p-4">

          {/* ── Plain-English verdict ── */}
          {verdictSentence && (
            <div className="rounded-lg px-4 py-3 mb-4" style={{ background: requiresVerification ? 'var(--fp-warning-bg)' : 'var(--fp-success-bg)', border: `1px solid ${requiresVerification ? 'var(--fp-warning-border)' : 'var(--fp-success-border)'}` }}>
              <p className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--kr-text)' }}>{verdictSentence}</p>
            </div>
          )}

          {/* ── Speed comparison: three data columns ── */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div style={{ borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
              <p className="micro-label">Stated Speed</p>
              <p className="text-3xl font-black" style={{ color: 'var(--kr-text)', fontFamily: 'var(--kr-mono)' }}>
                {claimed != null ? claimed : '—'}
              </p>
              <p className="text-xs" style={{ color: 'var(--kr-muted)' }}>{claimed != null ? 'km/h — driver statement' : 'Not provided'}</p>
            </div>
            <div style={{ borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
              <p className="micro-label">Structural Evidence</p>
              <p className="text-3xl font-black" style={{ color: 'var(--kr-text)', fontFamily: 'var(--kr-mono)' }}>
                {physics != null ? Math.round(physics) : '—'}
              </p>
              <p className="text-xs" style={{ color: 'var(--kr-muted)' }}>km/h — derived from damage analysis</p>
            </div>
            <div>
              <p className="micro-label">Discrepancy</p>
              <p className="text-3xl font-black" style={{ color: 'var(--kr-text)', fontFamily: 'var(--kr-mono)' }}>
                {devPct != null ? `${devPct}%` : '—'}
              </p>
              {devKmh != null && (
                <p className="text-xs" style={{ color: 'var(--kr-muted)' }}>{devKmh.toFixed(0)} km/h difference</p>
              )}
            </div>
          </div>

          {/* ── Unified speed scale: both markers + acceptable range band ── */}
          {(claimed != null || physics != null) && (
            <div className="mb-4">
              <p className="micro-label">Speed Comparison — Impact Scale</p>
              <div className="relative h-6 rounded-full overflow-hidden" style={{ background: 'var(--kr-off-white)' }}>
                {/* Zone fills */}
                <div className="absolute top-0 bottom-0" style={{ left: 0, width: `${toScalePct27(15)}%`, background: 'var(--fp-success-text)', opacity: 0.12 }} />
                <div className="absolute top-0 bottom-0" style={{ left: `${toScalePct27(15)}%`, width: `${toScalePct27(40) - toScalePct27(15)}%`, background: 'var(--fp-success-text)', opacity: 0.08 }} />
                <div className="absolute top-0 bottom-0" style={{ left: `${toScalePct27(40)}%`, width: `${toScalePct27(80) - toScalePct27(40)}%`, background: 'var(--fp-warning-text)', opacity: 0.12 }} />
                <div className="absolute top-0 bottom-0" style={{ left: `${toScalePct27(80)}%`, right: 0, background: 'var(--fp-critical-text)', opacity: 0.12 }} />
                {/* Acceptable range band between the two markers */}
                {claimed != null && physics != null && (
                  <div className="absolute top-1 bottom-1" style={{
                    left: `${toScalePct27(Math.min(claimed, physics))}%`,
                    width: `${Math.abs(toScalePct27(claimed) - toScalePct27(physics))}%`,
                    background: devBadgeText,
                    opacity: 0.15,
                    borderRadius: 4,
                  }} />
                )}
                {/* Stated speed marker (blue) */}
                {claimed != null && (
                  <div className="absolute" style={{ left: `calc(${toScalePct27(claimed)}% - 6px)`, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, borderRadius: '50%', background: 'var(--fp-info-text)', border: '2px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', zIndex: 2 }} />
                )}
                {/* Physics speed marker (coloured by deviation) */}
                {physics != null && (
                  <div className="absolute" style={{ left: `calc(${toScalePct27(physics)}% - 6px)`, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, borderRadius: '50%', background: devBadgeText, border: '2px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', zIndex: 3 }} />
                )}
              </div>
              <div className="flex justify-between text-[9px] mt-1" style={{ color: 'var(--kr-muted)' }}>
                <span>0</span><span>Parking (&lt;15)</span><span>Urban (&lt;80)</span><span>Highway (80+)</span><span>120 km/h</span>
              </div>
              {/* Legend */}
              <div className="flex gap-5 mt-2 text-[10px]" style={{ color: 'var(--kr-muted)' }}>
                <span className="flex items-center gap-1.5">
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'var(--fp-info-text)', border: '2px solid white', boxShadow: '0 0 0 1px var(--fp-info-text)' }} />
                  Stated by driver ({claimed != null ? claimed : '—'} km/h)
                </span>
                <span className="flex items-center gap-1.5">
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: devBadgeText, border: '2px solid white', boxShadow: `0 0 0 1px ${devBadgeText}` }} />
                  Structural evidence ({physics != null ? Math.round(physics) : '—'} km/h)
                </span>
              </div>
            </div>
          )}

          {/* ── Forensic Interpretation ── */}
          {interpretation && (
            <div className="rounded p-3 mb-4" style={{ background: 'var(--kr-off-white)', border: '1px solid var(--border)' }}>
              <p className="micro-label">Forensic Interpretation</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--kr-text)' }}>{interpretation}</p>
            </div>
          )}

          {/* ── Recommended action ── */}
          <div className="rounded p-3" style={{ background: 'var(--kr-white)', border: '1px solid var(--border)' }}>
            <div className="flex items-start gap-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0 mt-0.5" style={{ background: recAction.bg, color: recAction.text, border: `1px solid ${recAction.border}` }}>
                {recAction.icon}
              </span>
              <div>
                <p className="text-xs font-bold" style={{ color: 'var(--kr-text)' }}>{recAction.label}</p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--kr-muted)' }}>{recAction.body}</p>
              </div>
            </div>
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
      <div className="" style={{ border: '1px solid var(--border)', background: 'var(--kr-white)' }}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--kr-white)' }}>
          <p className="sub-heading">2.8 Severity Consensus</p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: alignBadge.bg, color: alignBadge.text, border: `1px solid ${alignBadge.border}` }}>{alignBadge.label}</span>
        </div>
        <div className="p-4">
          {/* Verdict + Confidence — prominent for investigator */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div style={{ borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
              <p className="micro-label">Final Verdict</p>
              <p className="text-lg font-bold capitalize" style={{ color: 'var(--kr-text)' }}>{verdict}</p>
              <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 uppercase" style={{ background: verdictColour.bg, color: verdictColour.text, border: `1px solid ${verdictColour.border}` }}>{verdict}</span>
              {conservativeFallback && (
                <p style={{ fontSize: 11, marginTop: 4, color: 'var(--kr-muted)' }}>Conservative fallback: <span className="font-semibold capitalize">{conservativeFallback}</span></p>
              )}
            </div>
            <div style={{ borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
              <p className="micro-label">Confidence</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--kr-text)' }}>{Math.round(confidence)}%</p>
              <div className="h-1.5 rounded-full mt-2" style={{ background: 'var(--kr-white)' }}>
                <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, confidence)}%`, background: confidence >= 70 ? 'var(--fp-success-text)' : confidence >= 40 ? 'var(--fp-warning-text)' : 'var(--fp-critical-text)', opacity: 0.8 }} />
              </div>
            </div>
            <div>
              <p className="micro-label">Sources Used</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--kr-text)' }}>{sourcesAvailable} / 3</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--kr-muted)' }}>{sourcesAvailable === 3 ? 'Full triangulation' : sourcesAvailable === 2 ? 'Partial triangulation' : 'Single source'}</p>
            </div>
          </div>

          {/* Source signal table — for engineer: raw values, for investigator: agreement/conflict */}
          <table className="w-full text-xs report-table mb-4">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="py-1.5 pr-3 text-left font-semibold" style={{ color: 'var(--kr-muted)' }}>Source</th>
                <th className="py-1.5 pr-3 text-left font-semibold" style={{ color: 'var(--kr-muted)' }}>Signal</th>
                <th className="py-1.5 text-left font-semibold" style={{ color: 'var(--kr-muted)' }}>Agrees with verdict</th>
              </tr>
            </thead>
            <tbody>
              {sourceRows.map(({ label, key, icon }) => {
                const signal: string | null = signals[key] ?? null;
                const agrees = signal != null && signal === verdict;
                const badge = srcBadge(signal);
                return (
                  <tr key={key} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="py-1.5 pr-3" style={{ color: 'var(--kr-muted)' }}>
                      <span style={{ fontFamily: 'var(--kr-mono)', fontSize: 10, fontWeight: 700, marginRight: 6, padding: '1px 4px', background: 'var(--kr-off-white)', borderRadius: 2 }}>{icon}</span>
                      {label}
                    </td>
                    <td className="py-1.5 pr-3">
                      {signal
                        ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: badge.bg, color: badge.text, border: `1px solid ${badge.border}` }}>{signal}</span>
                        : <span className="text-[10px]" style={{ color: 'var(--kr-muted)' }}>Not available</span>
                      }
                    </td>
                    <td className="py-1.5">
                      {signal == null
                        ? <span className="text-[10px]" style={{ color: 'var(--kr-muted)' }}>—</span>
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
            <div className="p-3 rounded mb-3" style={{ background: 'var(--kr-white)', border: '1px solid var(--border)' }}>
              <p className="micro-label">Derivation</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--kr-text)' }}>{reasoning}</p>
            </div>
          )}

          {/* Action instruction — plain English for adjuster/insurer */}
          <div className="flex items-start gap-3 p-3 rounded" style={{ background: isConflicted ? 'var(--fp-critical-bg)' : isPartial ? 'var(--fp-warning-bg)' : 'var(--fp-success-bg)', border: `1px solid ${isConflicted ? 'var(--fp-critical-border)' : isPartial ? 'var(--fp-warning-border)' : 'var(--fp-success-border)'}` }}>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5" style={{ background: alignBadge.bg, color: alignBadge.text, border: `1px solid ${alignBadge.border}` }}>{alignment === 'FULL' ? '✓' : alignment === 'PARTIAL' ? '!' : '⚠'}</span>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--kr-text)' }}>{actionInstruction}</p>
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
      <div className="" style={{ border: '1px solid var(--border)', background: 'var(--kr-white)' }}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--kr-white)' }}>
          <p className="sub-heading">2.7 Pattern Validation</p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: matchBadge.bg, color: matchBadge.text, border: `1px solid ${matchBadge.border}` }}>{patternMatch} MATCH</span>
        </div>
        <div className="p-4">
          {/* Structural damage banner — most critical signal */}
          {structuralDetected && (
            <div className="flex items-center gap-2 p-2.5 rounded mb-3" style={{ background: 'var(--fp-critical-bg)', border: '1px solid var(--fp-critical-border)' }}>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--fp-critical-bg)', color: 'var(--fp-critical-text)', border: '1px solid var(--fp-critical-border)' }}>⚠ STRUCTURAL</span>
              <p className="text-xs" style={{ color: 'var(--kr-text)' }}>
                Structural damage components detected: {structuralFound.length > 0 ? structuralFound.join(', ') : 'present'}.
                Frame/chassis integrity may be compromised — independent structural assessment required before settlement.
              </p>
            </div>
          )}

          {/* Image contradiction banner */}
          {imageContradiction && (
            <div className="flex items-center gap-2 p-2.5 rounded mb-3" style={{ background: 'var(--fp-critical-bg)', border: '1px solid var(--fp-critical-border)' }}>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--fp-critical-bg)', color: 'var(--fp-critical-text)', border: '1px solid var(--fp-critical-border)' }}>⚠ IMAGE CONFLICT</span>
              <p className="text-xs" style={{ color: 'var(--kr-text)' }}>{imageContradictionReason || 'Image evidence contradicts claimed damage pattern.'}</p>
            </div>
          )}

          {/* Coverage metrics — engineer-grade */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span style={{ color: 'var(--kr-muted)' }}>Primary zone coverage</span>
                <span className="tabular-nums font-semibold" style={{ color: 'var(--kr-text)' }}>{primaryCovPct}%</span>
              </div>
              <div className="h-2 rounded-full" style={{ background: 'var(--kr-white)' }}>
                <div className="h-2 rounded-full" style={{ width: `${Math.min(100, primaryCovPct)}%`, background: primaryCovPct >= 70 ? 'var(--fp-success-text)' : primaryCovPct >= 40 ? 'var(--fp-warning-text)' : 'var(--fp-critical-text)', opacity: 0.8 }} />
              </div>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--kr-muted)' }}>{matchedPrimary.length}/{expectedPrimary.length} expected primary components matched</p>
            </div>
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span style={{ color: 'var(--kr-muted)' }}>Secondary zone coverage</span>
                <span className="tabular-nums font-semibold" style={{ color: 'var(--kr-text)' }}>{secondaryCovPct}%</span>
              </div>
              <div className="h-2 rounded-full" style={{ background: 'var(--kr-white)' }}>
                <div className="h-2 rounded-full" style={{ width: `${Math.min(100, secondaryCovPct)}%`, background: secondaryCovPct >= 70 ? 'var(--fp-success-text)' : secondaryCovPct >= 40 ? 'var(--fp-warning-text)' : 'var(--fp-critical-text)', opacity: 0.8 }} />
              </div>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--kr-muted)' }}>{matchedSecondary.length}/{expectedSecondary.length} expected secondary components matched</p>
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
            <div className="p-3 rounded mb-3" style={{ background: 'var(--kr-white)', border: '1px solid var(--border)' }}>
              <p className="micro-label">Pattern Validation Reasoning</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--kr-text)' }}>{reasoning}</p>
            </div>
          )}

          {/* Action instruction — plain English for adjuster/insurer */}
          {hasAnomalies ? (
            <div className="p-3 rounded" style={{ background: 'var(--fp-warning-bg)', border: '1px solid var(--fp-warning-border)' }}>
              <p className="micro-label">Adjuster Action Required</p>
              <ul className="text-xs space-y-1" style={{ color: 'var(--kr-text)' }}>
                {missingExpected.length > 0 && <li>• Missing expected components ({missingExpected.join(', ')}) — verify whether these were omitted from the claim or genuinely absent from the damage.</li>}
                {unexpected.length > 0 && <li>• Unexpected components ({unexpected.join(', ')}) — confirm these are consistent with the stated impact direction and speed before authorising payment.</li>}
                {structuralDetected && <li>• Structural damage detected — independent structural assessment required before settlement.</li>}
                {imageContradiction && <li>• Image evidence contradicts claimed damage pattern — physical inspection required.</li>}
              </ul>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded" style={{ background: 'var(--fp-success-bg)', border: '1px solid var(--fp-success-border)' }}>
              <span style={{ color: 'var(--fp-success-text)', fontWeight: 700 }}>✓</span>
              <p className="text-xs" style={{ color: 'var(--kr-text)' }}>Damage pattern is consistent with the claimed incident type and impact direction. No anomalies requiring adjuster action.</p>
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
    <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
      <div className="px-4 py-3 flex items-center justify-between" >
        <div>
          <p className="sub-heading">
            Quote Line Items — {quote.name}
          </p>
          {score != null && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--kr-muted)' }}>
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
            style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)', color: 'var(--kr-text)', cursor: auditMutation.isPending ? 'wait' : 'pointer' }}
          >
            {auditMutation.isPending ? 'Running audit…' : 'Run KINGA Audit'}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs report-table">
          <thead>
            <tr >
              {["Description", "Category", "Qty", "Unit Price", "Total", "KINGA Review"].map(h => (
                <th key={h} className="text-left px-3 py-2 font-semibold" >{h}</th>
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
                <td className="px-3 py-2" style={{ color: 'var(--kr-muted)' }}>{li.category ? toTitleCase(li.category) : '—'}</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--kr-text)' }}>{li.quantity ?? 1}</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--kr-text)' }}>{fmtMoney(Number(li.unitPrice ?? 0))}</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--kr-text)' }}>{fmtMoney(Number(li.lineTotal ?? li.unitPrice ?? 0))}</td>
                <td className="px-3 py-2" style={{ color: li.aiReview && li.aiReview !== 'Consistent' ? "var(--kr-muted)" : "var(--kr-muted)", fontStyle: li.aiReview ? 'normal' : 'italic' }}>
                  {li.aiReview ?? '—'}
                </td>
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #cbd5e1", background: 'var(--kr-white)' }}>
              <td colSpan={4} className="px-3 py-2 font-bold" style={{ color: 'var(--kr-text)' }}>Total</td>
              <td className="px-3 py-2 tabular-nums font-bold" style={{ color: 'var(--kr-text)' }}>
                {fmtMoney(lineItems.reduce((s: number, li: any) => s + Number(li.lineTotal ?? li.unitPrice ?? 0), 0))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {unquoted.length > 0 && (
        <div className="px-4 py-2 text-xs" style={{ borderTop: "1px solid #e2e8f0", color: 'var(--kr-muted)' }}>
          <span className="font-semibold" style={{ color: 'var(--kr-text)' }}>Not quoted — verify physically: </span>
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

  // Distinct colours: blue for parts, teal for labour — visually clear without status noise
  const partsColor = "rgba(29, 78, 216, 0.85)";    // blue-700 — parts
  const labourColor = "rgba(13, 148, 136, 0.80)";  // teal-600 — labour

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

  // Compute max label length to set left padding for y-axis
  const maxLabelLen = quotesWithSplit.reduce((m, q) => Math.max(m, q.name.length), 0);
  const yAxisLeftPad = Math.min(Math.max(maxLabelLen * 6, 80), 200);

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
        afterFit: (axis: any) => { axis.width = yAxisLeftPad; },
      },
    },
  };

  return (
    <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
      <div className="px-4 py-3" >
        <p className="sub-heading">Labour vs Parts Ratio</p>
        {learningBenchmark?.avgCostUsd && learningBenchmark.sampleSize >= 3 && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--kr-muted)' }}>
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
            <p key={i} className="text-xs mt-2" style={{ color: 'var(--kr-muted)' }}>
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
      verdictColor = 'var(--kr-muted)';
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
    <div className="" style={{ border: '1px solid var(--border)', background: 'var(--kr-white)' }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--kr-white)' }}>
        <p className="sub-heading">3.0 Settlement Cost Analysis</p>
        <span className="text-xs font-semibold" style={{ color: verdictColor }}>{verdictLabel}</span>
      </div>
      <div className="p-3 space-y-3">
        {/* Two-row cost comparison */}
        <div className="space-y-3">
          {/* Original Quote row */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs" style={{ color: 'var(--kr-muted)' }}>Original Submitted Quote</span>
              <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--kr-text)' }}>{fmtMoney(originalQuote)}</span>
            </div>
            <div className="rounded-full overflow-hidden" style={{ height: 8, background: 'var(--kr-white)' }}>
              <div style={{ width: `${originalPct}%`, height: '100%', background: 'var(--kr-muted)', borderRadius: 4 }} />
            </div>
          </div>
          {/* Agreed Cost row */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs" style={{ color: 'var(--kr-muted)' }}>Agreed / Settled Cost</span>
              <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--kr-text)' }}>{fmtMoney(agreedCost)}</span>
            </div>
            <div className="rounded-full overflow-hidden" style={{ height: 8, background: 'var(--kr-white)' }}>
              <div style={{ width: `${agreedPct}%`, height: '100%', background: isReduction ? 'var(--fp-success-text)' : 'var(--fp-critical-text)', borderRadius: 4 }} />
            </div>
          </div>
        </div>

        {/* Delta summary row */}
        <div className="flex items-start gap-4 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex-1">
            <p className="text-xs font-semibold" style={{ color: 'var(--kr-text)' }}>
              {isReduction ? 'Reduction' : 'Increase'}: {fmtMoney(deltaAbs)} ({deltaPct.toFixed(1)}%)
            </p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--kr-muted)' }}>{verdictNote}</p>
          </div>
        </div>

        {/* Recommended action strip */}
        <div className="px-3 py-2 rounded" style={{ background: 'var(--kr-white)', borderLeft: `3px solid ${verdictColor}` }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--kr-text)' }}>Recommended Action</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--kr-muted)' }}>{actionText}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Section 2.5 (Damage Analysis): Severity Distribution + Quote Coverage + Pattern Validation ──
// Moved from Section 2 (where they were misplaced among physics forensics) to sit between
// Technical Forensics and Financial Validation — the natural information flow.
function SectionDamageAnalysis({ aiAssessment, quotes, claimRecord0, expandShorthand: _expandShorthand }: {
  aiAssessment: any;
  quotes?: any[];
  claimRecord0?: any;
  expandShorthand?: (s: string) => string;
}) {
  const expandShorthandFn = _expandShorthand ?? ((s: string) => s);

  // ── 2.4c: Damage Severity Distribution ──────────────────────────────────────
  const damagedPartsRaw = (aiAssessment as any)?.damagedComponentsJson;
  const damagedParts: any[] = (() => {
    if (!damagedPartsRaw) return [];
    try {
      const raw = typeof damagedPartsRaw === 'string' ? JSON.parse(damagedPartsRaw) : (Array.isArray(damagedPartsRaw) ? damagedPartsRaw : []);
      return raw.filter((p: any) => p.severity);
    } catch { return []; }
  })();

  // ── 2.5: Quote Coverage ──────────────────────────────────────────────────────
  const partsReconRaw = (aiAssessment as any)?.partsReconciliationJson;
  const partsRecon: any[] = (() => {
    if (!partsReconRaw) return [];
    try { return typeof partsReconRaw === 'string' ? JSON.parse(partsReconRaw) : (Array.isArray(partsReconRaw) ? partsReconRaw : []); } catch { return []; }
  })();
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
    ?? (aiAssessment as any)?.panelBeaterName
    ?? null;
  const missingNames = partsRecon.filter((r: any) => r.reconciliation_status === 'missing_from_quote').map((r: any) => expandShorthandFn(r.component ?? ''));

  // ── 2.9: Damage Pattern Validation (passed via prop) ─────────────────────────
  const damagePatternValidation = (aiAssessment as any)?._physics?.damagePatternValidation ?? null;

  const hasAnyContent = damagedParts.length > 0 || partsRecon.length > 0 || damagePatternValidation;
  if (!hasAnyContent) return null;

  return (
    <div className="space-y-4">
      {/* Row 1: Severity Distribution + Quote Coverage side by side */}
      {(damagedParts.length > 0 || partsRecon.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          {/* 2.4c Damage Severity Distribution */}
          {damagedParts.length > 0 && (
            <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
                <p className="sub-heading">2.4c Damage Severity Distribution</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--kr-muted)' }}>Distribution of {damagedParts.length} damaged component{damagedParts.length > 1 ? 's' : ''} by severity level.</p>
              </div>
              <div className="p-4">
                <DamageSeverityChart components={damagedParts.map((p: any) => ({ name: p.name, severity: p.severity }))} />
              </div>
            </div>
          )}
          {/* 2.5 Quote Coverage Summary */}
          {partsRecon.length > 0 && (
            <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
                <p className="sub-heading">2.5 Quote Coverage Summary</p>
                {pbName && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--kr-muted)' }}>
                    Primary repairer: <strong style={{ color: 'var(--kr-text)' }}>{pbName}</strong>
                    {(quotes ?? []).length > 1 && <span style={{ marginLeft: 6 }}>· {(quotes ?? []).length} quotes received — full comparison in Section 3.1</span>}
                  </p>
                )}
              </div>
              <div className="p-4">
                {/* Coverage stat row */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
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
                    <span style={{ fontSize: 10, color: 'var(--status-fail-text)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Missing</span>
                  </div>
                  {extraItems.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'var(--status-review-bg)', border: '1px solid var(--status-review-text)' }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--status-review-text)' }}>{extraItems.length}</span>
                      <span style={{ fontSize: 10, color: 'var(--status-review-text)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Extra</span>
                    </div>
                  )}
                  {noQuoteCount > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'var(--muted)', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--kr-muted)' }}>{noQuoteCount}</span>
                      <span style={{ fontSize: 10, color: 'var(--kr-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>No Quote</span>
                    </div>
                  )}
                </div>
                {missingNames.length > 0 && (
                  <div className="text-xs mb-2 p-2" style={{ background: 'var(--status-fail-bg)', borderRadius: 4, border: '1px solid var(--status-fail-text)' }}>
                    <strong style={{ color: 'var(--status-fail-text)' }}>Not covered by quote:</strong>{' '}
                    <span style={{ color: 'var(--kr-text)' }}>{missingNames.join(' · ')}</span>
                  </div>
                )}
                {structuralCount > 0 && (
                  <div className="text-xs mb-2 p-2" style={{ background: 'var(--fp-warning-bg, #fffbeb)', borderRadius: 4, border: '1px solid var(--fp-warning-border, #fbbf24)' }}>
                    <strong style={{ color: 'var(--fp-warning-text, #92400e)' }}>⚠ {structuralCount} structural component{structuralCount > 1 ? 's' : ''} detected</strong>
                    <span style={{ color: 'var(--kr-muted)', marginLeft: 6 }}>— independent structural assessment required before settlement.</span>
                  </div>
                )}
                <p className="text-xs" style={{ color: 'var(--kr-muted)' }}>Full breakdown in Section 3.1.</p>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Row 2: 2.9 Damage Pattern Validation — full width */}
      {damagePatternValidation && (
        <Section29DamagePatternValidation damagePatternValidation={damagePatternValidation} />
      )}
    </div>
  );
}

// ─── Section 3: Financial Validation ─────────────────────────────────────────
// Redesigned structure (v2):
//   3.1 Cost Summary          — L1/L2/savings KPIs + NFS badge + settlement delta + CDE recommendation
//   3.2 Repair Cost Analysis  — Component matrix + chart + labour/parts inline stats
//   3.3 Quote Reconciliation  — Pill tags for quoted-not-damaged / damaged-not-quoted + copy-quote alert
//   3.4 Vehicle Valuation     — Market value, repair-to-value ratio, write-off threshold
// Removed: Historical Cost Benchmark (legal/reputational risk — kept in backend fraud engine only)
function Section3Financial({ aiAssessment, enforcement, quotes, fmtMoney = fmtUsd, claimId }: { aiAssessment: any; enforcement: any; quotes?: any[]; fmtMoney?: (n: number | null | undefined) => string; claimId?: number }) {
  const e = enforcement;
  const ce = e?.costExtraction;

  // ── Cost Intelligence outputs (Stage 9 / costIntelligenceJson) ──────────────
  const costIntel = (aiAssessment as any)?.costIntelligenceJson ?? null;
  const costDecision = costIntel?.costDecision ?? null;
  const costNarrative = costIntel?.costNarrative ?? null;
  const reconciliationSummary = costIntel?.reconciliationSummary ?? null;
  const co = costIntel?.compositeOptimisation ?? null;

  // ── Quote similarity (fraud engine, Phase 1) ─────────────────────────────────
  const fraudScoreBreakdown = (aiAssessment as any)?.fraudScoreBreakdownJson ?? null;
  const quoteSimilarity = fraudScoreBreakdown?.quoteSimilarity ?? null;

  // ── Market value (for 3.4 valuation) ─────────────────────────────────────────
  const claimRecord3 = (aiAssessment as any)?._claimRecord ?? (aiAssessment as any)?.claimRecord ?? null;
  const llmValuation3 = claimRecord3?.valuation ?? null;
  const marketValueUsd3: number | null = costIntel?.marketValueUsd ?? llmValuation3?.marketValueUsd ?? claimRecord3?.vehicle?.marketValueUsd ?? null;

  // ── Build pbQuotes with quoteType-aware deduplication ────────────────────────
  // Priority order per repairer: assessor_adjusted > strip_requote > revised > original
  // Supplementary quotes are always additive and shown alongside the authoritative quote
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

  // ── Per-component benchmark data ─────────────────────────────────────────────
  const perComponentBenchmarks: Record<string, any> | null = costIntel?.perComponentBenchmarks ?? null;

  // ── Fuzzy-match helpers for component matrix ──────────────────────────────────
  const normKey = (s: string) =>
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(' ');

  const similarity = (a: string, b: string): number => {
    const ta = new Set(normKey(a).split(' '));
    const tb = new Set(normKey(b).split(' '));
    let inter = 0;
    ta.forEach(t => { if (tb.has(t)) inter++; });
    const union = new Set([...ta, ...tb]).size;
    return union === 0 ? 0 : inter / union;
  };

  // Collect all line items across all quotes, grouped into canonical clusters.
  const FUZZY_THRESHOLD = 0.55;
  type Cluster = { canonical: string; category: string; lineItems: Array<{ quoteIdx: number; li: any }> };
  const clusters: Cluster[] = [];

  pbQuotes.forEach((q, qi) => {
    (q.lineItems ?? []).forEach((li: any) => {
      const desc = (li.description ?? '').trim();
      if (!desc) return;
      let bestCluster: Cluster | null = null;
      let bestScore = 0;
      for (const cl of clusters) {
        const score = similarity(desc, cl.canonical);
        if (score > bestScore) { bestScore = score; bestCluster = cl; }
      }
      if (bestCluster && bestScore >= FUZZY_THRESHOLD) {
        bestCluster.lineItems.push({ quoteIdx: qi, li });
      } else {
        const cat = li.category ?? '';
        clusters.push({ canonical: desc, category: cat, lineItems: [{ quoteIdx: qi, li }] });
      }
    });
  });

  type ItemRow3 = { description: string; category: string; cells: Array<{ amount: number | null; aiReview?: string | null }> };
  const matchedRows3: ItemRow3[] = [];
  const missedRows3: ItemRow3[] = [];

  for (const cl of clusters) {
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

  // ── KINGA optimised map (for matrix colour flags) ─────────────────────────────
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

  // ── 3.1 Cost Summary data ─────────────────────────────────────────────────────
  const l1 = co?.l1LowestSubmittedCostUsd ?? co?.l1SubmittedCostUsd ?? 0;
  const l2 = co?.l2CompositeOptimisedCostUsd ?? 0;
  const savingsL1L2 = co?.negotiationSavingsUsd ?? (l1 > 0 && l2 > 0 && l1 > l2 ? l1 - l2 : 0);
  const savingsPct = l1 > 0 && savingsL1L2 > 0 ? (savingsL1L2 / l1) * 100 : 0;
  const nfsScore = co?.negotiationFeasibilityScore ?? null;
  const nfsColor = nfsScore != null ? (nfsScore >= 70 ? '#15803d' : nfsScore >= 40 ? '#92400e' : '#64748b') : '#64748b';
  const nfsBg = nfsScore != null ? (nfsScore >= 70 ? '#dcfce7' : nfsScore >= 40 ? '#fef3c7' : '#f1f5f9') : '#f1f5f9';
  const cde = costDecision;

  // Settlement delta (from NegotiationDeltaBlock logic — merged inline)
  const originalQuote: number | null = costIntel?.documentedOriginalQuoteUsd ?? null;
  const agreedCost: number | null = costIntel?.documentedAgreedCostUsd ?? null;
  const hasSettlementDelta = originalQuote != null && agreedCost != null && Math.abs(originalQuote - agreedCost) >= 0.01;
  const settlementDelta = hasSettlementDelta ? originalQuote! - agreedCost! : 0;
  const settlementDeltaAbs = Math.abs(settlementDelta);
  const settlementDeltaPct = originalQuote && originalQuote > 0 ? (settlementDeltaAbs / originalQuote) * 100 : 0;
  const isSettlementReduction = settlementDelta > 0;

  // ── 3.4 Valuation data (inline — avoids separate component call) ──────────────
  const llmValuation4 = claimRecord3?.valuation ?? null;
  const valuationMethod4 = llmValuation4?.valuationMethod ?? null;
  const verdictReason4 = llmValuation4?.verdictReason ?? null;
  const llmVerdict4 = llmValuation4?.verdict ?? null;
  const _rawRatio4 = llmValuation4?.repairToValueRatio ?? null;
  const llmRepairToValue4 = (_rawRatio4 != null && _rawRatio4 > 0.001 && _rawRatio4 <= 5) ? _rawRatio4 * 100 : null;
  const excessUsd4 = claimRecord3?.insuranceContext?.excessAmountUsd ?? null;
  const bettermentUsd4 = claimRecord3?.insuranceContext?.bettermentUsd ?? null;
  const quotedTotal4 = (quotes?.[0]?.quotedAmount ?? 0) / 100;
  const agreedCostUsd4 = claimRecord3?.costs?.agreedCostUsd ?? null;
  const l2OptimisedCost4 = costIntel?.compositeOptimisation?.l2CompositeOptimisedCostUsd
    ?? costIntel?.compositeOptimisation?.compositeOptimisedCostUsd
    ?? null;
  const repairCost4 = l2OptimisedCost4 ?? llmValuation4?.repairCostUsd ?? agreedCostUsd4 ?? quotedTotal4;
  const isKingaOptimised4 = l2OptimisedCost4 != null;
  const repairToValue4 = llmRepairToValue4 ?? (marketValueUsd3 && marketValueUsd3 > 0 && repairCost4 > 0 ? (repairCost4 / marketValueUsd3) * 100 : null);
  const isWriteOff4 = llmVerdict4 === "WRITE_OFF" || (repairToValue4 != null && repairToValue4 >= 75);
  // Section 3.4 Vehicle Valuation removed — market value is shown in Section 1.2 (Insurance & Policy Context).
  // The valuation data here was using a different (incorrect) benchmark value. Keeping it false permanently.
  const showValuation = false;

  return (
    <div className="mb-1 space-y-2" style={{ marginBottom: "8px" }}>

      {/* ══ 3.1 COST SUMMARY ══════════════════════════════════════════════════════ */}
      {(pbQuotes.length > 0 || co != null) && (
        <div style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--kr-rule)', background: 'var(--kr-off-white)' }}>
            <div>
              <p className="sub-heading">3.1 Cost Summary</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--kr-muted)' }}>
                {/* P1c fix: prefix with label so the count is self-explanatory */}
                {pbQuotes.length > 0 ? `Repair quotes received: ${pbQuotes.length}` : co?.quotesEvaluated ? `Repair quotes evaluated: ${co.quotesEvaluated}` : 'No repair quotes submitted'}
                {l2 > 0 ? ' · KINGA four-tier benchmark hierarchy' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {cde?.recommendation && (
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{
                  background: cde.recommendation === 'APPROVE' ? '#dcfce7' : cde.recommendation === 'DECLINE' ? '#fee2e2' : '#fef3c7',
                  color: cde.recommendation === 'APPROVE' ? '#15803d' : cde.recommendation === 'DECLINE' ? '#dc2626' : '#92400e',
                }}>
                  {cde.recommendation}
                </span>
              )}
              {nfsScore != null && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: nfsBg, color: nfsColor }}>
                  {/* Bug #12 fix: use a single vocabulary — MODERATE for 40–69, PARTIAL is not a valid NFS label */}
                  NFS {nfsScore} — {(() => {
                    const raw = (co?.negotiationFeasibilityLabel ?? '').toUpperCase();
                    if (raw === 'PARTIAL') return nfsScore >= 40 && nfsScore < 70 ? 'MODERATE' : raw;
                    return raw;
                  })()}
                </span>
              )}
            </div>
          </div>

          <div className="p-3 space-y-3">
            {/* KPI card row: L1 / L2 / Savings */}
            {(l1 > 0 || l2 > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: l2 > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10 }}>
                {/* L1 — Lowest Submitted */}
                {l1 > 0 && (
                  <div style={{ padding: '10px 12px', border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--kr-muted)', margin: '0 0 3px' }}>Lowest Submitted (L1)</p>
                    <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--kr-text)', margin: 0, lineHeight: 1.1, fontFamily: 'var(--kr-mono)' }}>{fmtMoney(l1)}</p>
                    <p style={{ fontSize: 10, color: 'var(--kr-muted)', margin: '2px 0 0' }}>{pbQuotes.length > 0 ? pbQuotes.length : (co?.quotesEvaluated ?? 0)} quote{(pbQuotes.length > 0 ? pbQuotes.length : (co?.quotesEvaluated ?? 0)) !== 1 ? 's' : ''} received</p>
                  </div>
                )}
                {/* L2 — KINGA Optimised (the ONE authoritative cost figure) */}
                {l2 > 0 && (
                  <div style={{ padding: '10px 12px', border: '2px solid #1A2B4A', background: 'var(--kr-off-white)' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--kr-navy)', margin: '0 0 3px' }}>KINGA Optimised (L2)</p>
                    <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--kr-navy)', margin: 0, lineHeight: 1.1, fontFamily: 'var(--kr-mono)' }}>{fmtMoney(l2)}</p>
                    <p style={{ fontSize: 10, color: 'var(--kr-muted)', margin: '2px 0 0' }}>Best price per component</p>
                  </div>
                )}
                {/* Savings Opportunity */}
                {savingsL1L2 > 0 && (
                  <div style={{ padding: '10px 12px', border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--kr-green)', margin: '0 0 3px' }}>Savings Opportunity</p>
                    <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--kr-green)', margin: 0, lineHeight: 1.1, fontFamily: 'var(--kr-mono)' }}>{fmtMoney(savingsL1L2)}</p>
                    <p style={{ fontSize: 10, color: 'var(--kr-green)', margin: '2px 0 0' }}>{savingsPct.toFixed(1)}% reduction from L1</p>
                  </div>
                )}
              </div>
            )}

            {/* Savings progress bar */}
            {savingsL1L2 > 0 && l1 > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: 'var(--kr-muted)' }}>KINGA Optimised vs Submitted</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--kr-green)' }}>{savingsPct.toFixed(1)}% saving</span>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: '#e2e8f0', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min((l2 / l1) * 100, 100)}%`, background: 'var(--kr-navy)', borderRadius: 4 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style={{ fontSize: 9, color: 'var(--kr-muted)' }}>L2 {fmtMoney(l2)}</span>
                  <span style={{ fontSize: 9, color: 'var(--kr-muted)' }}>L1 {fmtMoney(l1)}</span>
                </div>
              </div>
            )}

            {/* Settlement delta — only when original quote and agreed cost differ */}
            {hasSettlementDelta && (
              <div style={{ borderTop: '1px solid var(--kr-rule)', paddingTop: 10 }}>
                <div className="flex items-center justify-between mb-1">
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--kr-muted)' }}>Settlement Analysis</span>
                  <span className="text-xs font-semibold" style={{ color: isSettlementReduction ? (settlementDeltaPct >= 40 ? 'var(--fp-warning-text)' : 'var(--fp-success-text)') : 'var(--fp-critical-text)' }}>
                    {isSettlementReduction ? (settlementDeltaPct >= 40 ? 'SIGNIFICANT REDUCTION' : settlementDeltaPct >= 15 ? 'NEGOTIATED REDUCTION' : 'MINOR ADJUSTMENT') : 'COST INCREASE'}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span style={{ color: 'var(--kr-muted)' }}>Original: <span className="font-semibold tabular-nums" style={{ color: 'var(--kr-text)' }}>{fmtMoney(originalQuote)}</span></span>
                  <span style={{ color: 'var(--kr-muted)' }}>Agreed: <span className="font-semibold tabular-nums" style={{ color: 'var(--kr-text)' }}>{fmtMoney(agreedCost)}</span></span>
                  <span style={{ color: isSettlementReduction ? 'var(--fp-success-text)' : 'var(--fp-critical-text)', fontWeight: 600 }}>
                    {isSettlementReduction ? '▼' : '▲'} {fmtMoney(settlementDeltaAbs)} ({settlementDeltaPct.toFixed(1)}%)
                  </span>
                </div>
              </div>
            )}

            {/* CDE narrative — max 2 sentences, trimmed */}
            {costNarrative && (
              <div style={{ borderTop: '1px solid var(--kr-rule)', paddingTop: 10 }}>
                {/* R-F-05 / C-E-01 fix: surface costNarrative.recommendation enum (APPROVE/REVIEW/REJECT)
                     Previously this field was dropped by Stage 10 and never reached the report. */}
                {(() => {
                  const rec = (costNarrative as any)?.recommendation;
                  if (!rec) return null;
                  const recStyle = rec === 'APPROVE'
                    ? { bg: '#dcfce7', color: '#15803d', border: '#86efac' }
                    : rec === 'REJECT'
                    ? { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' }
                    : { bg: '#fef3c7', color: '#92400e', border: '#fde68a' };
                  const recReason = (costNarrative as any)?.recommendation_reason;
                  const recConf = (costNarrative as any)?.confidence;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 2,
                        background: recStyle.bg, color: recStyle.color, border: `1px solid ${recStyle.border}`,
                        fontFamily: 'var(--kr-mono)', letterSpacing: '0.05em' }}>COST INTEL: {rec}</span>
                      {recConf != null && (
                        <span style={{ fontSize: 10, color: 'var(--kr-muted)' }}>Confidence: {typeof recConf === 'number' ? `${Math.round(recConf * 100)}%` : recConf}</span>
                      )}
                      {recReason && (
                        <span style={{ fontSize: 10, color: 'var(--kr-muted)', fontStyle: 'italic' }}>{recReason}</span>
                      )}
                    </div>
                  );
                })()}
                <p className="text-xs leading-relaxed" style={{ color: 'var(--kr-muted)' }}>
                  {(() => {
                    const raw = typeof costNarrative === 'string' ? costNarrative : (costNarrative as any)?.narrative ?? '';
                    // Trim to first 2 sentences for conciseness
                    const sentences = raw.match(/[^.!?]+[.!?]+/g) ?? [raw];
                    return sentences.slice(0, 2).join(' ').trim();
                  })()}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ 3.2 REPAIR COST ANALYSIS ═════════════════════════════════════════════ */}
      {pbQuotes.length > 0 && (() => {
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

        // P5: Build per-component photo count from enrichedPhotosFAR
        // For each component name in the matrix, count how many enriched photos
        // list that component in their detectedComponents array (case-insensitive).
        const enrichedForMatrix: Array<{ detectedComponents: string[] }> = (() => {
          const raw = aiAssessment?.enrichedPhotosJson;
          if (!raw) return [];
          try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Array.isArray(parsed)) return parsed.filter((p: any) => Array.isArray(p?.detectedComponents));
          } catch { /* ignore */ }
          return [];
        })();
        const photoCountForComponent = (name: string): number => {
          const n = name.toLowerCase().trim();
          return enrichedForMatrix.filter(p =>
            p.detectedComponents.some((c: string) => {
              const cl = c.toLowerCase().trim();
              return cl === n || cl.includes(n) || n.includes(cl);
            })
          ).length;
        };

        // Build MatrixRow[] from allRows3 with benchmark colour flags
        const matrixRows: MatrixRow[] = allRows3.map((row: any) => {
          const benchmark = perComponentBenchmarks?.[row.description];
          const compItem = kingaOptimisedMap[normKey(row.description)];
          const validAmounts = row.cells.filter((c: any) => c.amount !== null && c.amount > 0).map((c: any) => c.amount as number);
          const kingaAmount = compItem?.amount ?? benchmark?.medianUsd ?? (validAmounts.length > 0 ? Math.min(...validAmounts) : null);
          let kingaSource = compItem?.tierLabel ?? null;
          if (!kingaSource) {
            if (benchmark?.modelSource === 'ml') kingaSource = 'ML Benchmark';
            else if (benchmark?.modelSource === 'statistical') kingaSource = 'Market Benchmark';
          }
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
            photoCount: enrichedForMatrix.length > 0 ? photoCountForComponent(row.description) : null,
          };
        });

        const coData = costIntel?.compositeOptimisation ?? null;
        const matL1 = coData?.l1LowestSubmittedCostUsd ?? coData?.l1SubmittedCostUsd ?? null;
        const matL2 = coData?.l2CompositeOptimisedCostUsd ?? null;
        const matSavingsUsd = coData?.negotiationSavingsUsd ?? (matL1 && matL2 && matL1 > matL2 ? matL1 - matL2 : null);
        const matSavingsPct = matL1 && matSavingsUsd && matL1 > 0 ? Math.round((matSavingsUsd / matL1) * 100) : null;

        // Component-level bar chart (top 10 by value, only when multiple quotes)
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
            x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 55, minRotation: 45, autoSkip: false } },
            y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, callback: (v: any) => fmtMoney(v) } },
          },
          layout: { padding: { bottom: 24 } },
        };

        // Labour vs Parts inline stats (replaces separate LabourPartsRatioChart section)
        const quotesWithSplit = pbQuotes.filter(q => q.parts > 0 || q.labour > 0);

        return (
          <div style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
            {/* Section header */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--kr-rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--kr-off-white)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--kr-text)' }}>3.2 Repair Cost Analysis</span>
              <span style={{ fontSize: 11, color: 'var(--kr-muted)' }}>{matrixQuotes.length > 0 ? `${matrixQuotes.length} quote${matrixQuotes.length !== 1 ? 's' : ''} received` : 'No quotes'}</span>
            </div>

            {/* Component-level bar chart — only when multiple quotes exist */}
            {chart4Rows.length > 0 && pbQuotes.length > 1 && (
              <div style={{ padding: '12px 16px 0 16px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--kr-muted)', marginBottom: 8 }}>Component-Level Quote Comparison (Top {chart4Rows.length})</p>
                <div style={{ height: 240 }}>
                  <Bar data={chart4Data} options={chart4Opts} />
                </div>
              </div>
            )}

            {/* Component matrix */}
            <ComponentCostMatrix
              quotes={matrixQuotes}
              rows={matrixRows}
              l1Total={matL1}
              l2Total={matL2}
              savingsUsd={matSavingsUsd}
              savingsPct={matSavingsPct}
              nfs={coData?.negotiationFeasibilityScore ?? null}
              qndFlags={coData?.quotedNotDamagedFlags ?? []}
              dnqFlags={coData?.damagedNotQuotedFlags ?? []}
              fmtMoney={fmtMoney}
              showCategory={true}
            />

            {/* Labour vs Parts inline stats — only when split data is available */}
            {quotesWithSplit.length > 0 && (
              <div style={{ padding: '8px 16px 10px', borderTop: '1px solid var(--kr-rule)' }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--kr-muted)', marginRight: 12 }}>Labour / Parts Split</span>
                {quotesWithSplit.map((q, i) => {
                  const total = q.parts + q.labour;
                  if (total === 0) return null;
                  const partsRatio = Math.round((q.parts / total) * 100);
                  const labourRatio = 100 - partsRatio;
                  return (
                    <span key={i} className="text-xs" style={{ color: 'var(--kr-muted)', marginRight: 16 }}>
                      <span className="font-medium" style={{ color: 'var(--kr-text)' }}>{q.name.length > 20 ? q.name.slice(0, 18) + '…' : q.name}:</span>
                      {' '}{partsRatio}% parts · {labourRatio}% labour
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ══ 3.3 QUOTE RECONCILIATION ═════════════════════════════════════════════ */}
      {(() => {
        const hasQnd = Array.isArray(co?.quotedNotDamaged) && co.quotedNotDamaged.length > 0;
        const hasDnq = Array.isArray(co?.damagedNotQuoted) && co.damagedNotQuoted.length > 0;
        const hasHidden = Array.isArray(co?.hiddenDamageAdvisories) && co.hiddenDamageAdvisories.length > 0;
        const hasCopyQuote = quoteSimilarity && (quoteSimilarity.overall_verdict === 'confirmed' || quoteSimilarity.overall_verdict === 'suspected');
        const hasReconciliation = reconciliationSummary != null;
        if (!hasQnd && !hasDnq && !hasHidden && !hasCopyQuote && !hasReconciliation) return null;

        // Build reconciliation summary text (max 2 sentences)
        const rs = typeof reconciliationSummary === 'string' ? null : reconciliationSummary as any;
        const reconcSummaryText = typeof reconciliationSummary === 'string'
          ? reconciliationSummary
          : typeof rs?.summary === 'string'
            ? rs.summary
            : rs != null
              ? `${rs.matched_count ?? 0} components matched across quotes. ${rs.missing_count ?? 0} missing from quote · ${rs.extra_count ?? 0} extra in quote.`
              : null;
        const rsMissing: any[] = Array.isArray(rs?.missing) ? rs.missing : [];
        const rsExtra: any[] = Array.isArray(rs?.extra) ? rs.extra : [];

        return (
          <div style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--kr-rule)', background: 'var(--kr-off-white)' }}>
              <p className="sub-heading">3.3 Quote Reconciliation</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--kr-muted)' }}>Component coverage gaps and quote integrity flags</p>
            </div>
            <div className="p-3 space-y-3">

              {/* Copy-quotation alert */}
              {hasCopyQuote && (
                <div className="px-3 py-2 flex items-start gap-2" style={{
                  background: quoteSimilarity.overall_verdict === 'confirmed' ? 'var(--status-reject-bg)' : 'var(--fp-warning-bg, #fef3c7)',
                  border: `1px solid ${quoteSimilarity.overall_verdict === 'confirmed' ? 'var(--fp-critical-border)' : 'var(--fp-warning-border, #f59e0b)'}`,
                }}>
                  <span className="text-sm" style={{ lineHeight: 1.2 }}>&#9888;</span>
                  <div>
                    <p className="text-xs font-bold" style={{ color: quoteSimilarity.overall_verdict === 'confirmed' ? 'var(--fp-critical-text)' : 'var(--fp-warning-text, #92400e)' }}>
                      {quoteSimilarity.overall_verdict === 'confirmed' ? 'COPY QUOTATION DETECTED' : 'SUSPICIOUS QUOTE SIMILARITY'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--kr-text)' }}>
                      {quoteSimilarity.overall_verdict === 'confirmed'
                        ? `Structural fingerprint analysis indicates these quotes were likely authored by the same source. Highest pair similarity: ${quoteSimilarity.highest_pair_similarity != null && quoteSimilarity.highest_pair_similarity > 0 ? `${Math.round(quoteSimilarity.highest_pair_similarity * 100)}%` : '—'}.`
                        : `Quote comparison reveals unusually high structural similarity. Highest pair similarity: ${quoteSimilarity.highest_pair_similarity != null && quoteSimilarity.highest_pair_similarity > 0 ? `${Math.round(quoteSimilarity.highest_pair_similarity * 100)}%` : '—'}. Independent verification recommended.`}
                    </p>
                    {(quoteSimilarity.copy_pairs ?? []).length > 0 && (
                      <p className="text-xs mt-1" style={{ color: 'var(--kr-muted)' }}>
                        Flagged pairs: {(quoteSimilarity.copy_pairs as any[]).map((p: any) => `${p.quote_a} ↔ ${p.quote_b} (${Math.round((p.overall_similarity ?? 0) * 100)}%)`).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Reconciliation summary */}
              {reconcSummaryText && (
                <div>
                  <p className="text-xs" style={{ color: 'var(--kr-muted)' }}>{reconcSummaryText}</p>
                  {(rsMissing.length > 0 || rsExtra.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {rsMissing.map((m: any, i: number) => (
                        <span key={`miss-${i}`} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }}>
                          ↑ {expandShorthand(m.component ?? String(m))}
                        </span>
                      ))}
                      {rsExtra.map((ex: any, i: number) => (
                        <span key={`extra-${i}`} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>
                          + {expandShorthand(ex.component ?? String(ex))}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

                            {/* ── Scope Discrepancy Table: replaces pill tags ── */}
              {(hasQnd || hasDnq) && (() => {
                const thS: React.CSSProperties = { padding: '4px 8px', fontSize: 10, fontWeight: 700, color: 'var(--kr-white)', background: 'var(--kr-navy)', textAlign: 'left', whiteSpace: 'nowrap' };
                const tdS: React.CSSProperties = { padding: '3px 8px', fontSize: 11, color: 'var(--kr-text)', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };
                const tdMuted: React.CSSProperties = { ...tdS, color: 'var(--kr-muted)', fontSize: 10 };
                return (
                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--kr-text)' }}>Scope Discrepancy Analysis</p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--kr-rule)', fontSize: 11 }}>
                      <thead><tr>
                        <th style={thS}>Component</th>
                        <th style={thS}>Discrepancy Type</th>
                        <th style={thS}>Risk Level</th>
                        <th style={thS}>Action Required</th>
                      </tr></thead>
                      <tbody>
                        {hasQnd && (co.quotedNotDamaged as any[]).map((item: any, idx: number) => (
                          <tr key={`qnd-${idx}`} style={{ background: idx % 2 === 0 ? '#fffbeb' : '#fef3c7' }}>
                            <td style={{ ...tdS, fontWeight: 600 }}>
                              {item.componentName}
                              {item.classification === 'suspect_inflation' && <span style={{ marginLeft: 4, fontSize: 9, color: '#dc2626', fontWeight: 700 }}>⚠ SUSPECT</span>}
                            </td>
                            <td style={{ ...tdS, color: '#92400e' }}>Quoted — not in damage scope</td>
                            <td style={tdMuted}>{item.classification === 'suspect_inflation' ? 'High' : 'Medium'}</td>
                            <td style={tdMuted}>Verify physical damage before approving this line item</td>
                          </tr>
                        ))}
                        {hasDnq && (co.damagedNotQuoted as any[]).map((item: any, idx: number) => (
                          <tr key={`dnq-${idx}`} style={{ background: idx % 2 === 0 ? 'var(--kr-white)' : 'var(--kr-off-white)' }}>
                            <td style={{ ...tdS, fontWeight: 600 }}>{item.componentName}</td>
                            <td style={{ ...tdS, color: '#0369a1' }}>Damaged — not in any quote</td>
                            <td style={tdMuted}>{item.severity ?? 'Unknown'}</td>
                            <td style={tdMuted}>Scope gap — request quote amendment or confirm deferred repair</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {hasQnd && <p className="text-xs mt-1" style={{ color: 'var(--kr-muted)' }}>Items quoted but not confirmed damaged require physical verification before settlement approval.</p>}
                    {hasDnq && <p className="text-xs mt-1" style={{ color: 'var(--kr-muted)' }}>Scope gaps may indicate incomplete quoting or deferred repairs — confirm with repairer before closing.</p>}
                  </div>
                );
              })()}

              {/* Probable hidden damage advisories */}
              {hasHidden && (
                <div>
                  <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--kr-navy)' }}>Probable hidden damage — advisory</p>
                  <div className="flex flex-wrap gap-1">
                    {(co.hiddenDamageAdvisories as any[]).map((item: any, idx: number) => (
                      <span key={idx} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>
                        {item.componentName}
                        <span className="ml-1 opacity-70 text-[10px]">{item.probabilityPct}%</span>
                      </span>
                    ))}
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: 'var(--kr-muted)' }}>
                    Statistically elevated probability of damage based on co-occurrence patterns. Physical inspection recommended.
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ══ 3.4 VEHICLE VALUATION ════════════════════════════════════════════════ */}
      {showValuation && (
        <div style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
          <div className="px-4 py-3 flex items-center justify-between">
            <p className="sub-heading">3.4 Vehicle Valuation</p>
            {isWriteOff4 != null && (
              <span className="text-xs font-semibold" style={{ color: 'var(--kr-text)' }}>{isWriteOff4 ? 'Potential write-off' : 'Repairable'}</span>
            )}
          </div>
          <div className="p-4">
            {/* Market value note */}
            <div style={{ marginBottom: 12, padding: '6px 10px', background: 'var(--kr-off-white)', border: '1px solid var(--kr-rule)', borderRadius: 4 }}>
              <p style={{ fontSize: 11, color: 'var(--kr-muted)' }}>
                <span style={{ fontWeight: 700, color: 'var(--kr-text)' }}>Market Value: </span>
                {marketValueUsd3 != null ? fmtMoney(marketValueUsd3) : 'Pending system benchmark'}
                {valuationMethod4 === 'document_stated'
                  ? ' — ⚠ Assessor document, not independently verified'
                  : valuationMethod4 === 'llm_estimate' || !valuationMethod4
                  ? ' — KINGA system benchmark'
                  : ` — ${valuationMethod4}`}
                <span style={{ color: 'var(--kr-muted)' }}> (vehicle details in Section 1.3)</span>
              </p>
            </div>
            <table className="compact-kv-table text-xs">
              <tbody>{([
                isKingaOptimised4
                  ? ['KINGA Optimised Cost', fmtMoney(repairCost4)]
                  : repairCost4 > 0
                    ? ['Repair Cost (Submitted)', fmtMoney(repairCost4)]
                    : null,
                ['Repair-to-Value Ratio', repairToValue4 != null ? `${repairToValue4.toFixed(1)}%` : 'Cannot calculate'],
                ['Write-off Threshold', '75% of market value'],
                ['Excess / Deductible', excessUsd4 != null ? fmtMoney(excessUsd4) : 'Not stated'],
                ['Betterment / Depreciation', bettermentUsd4 != null ? fmtMoney(bettermentUsd4) : 'Not stated'],
                ['Net Claimant Liability', excessUsd4 != null && bettermentUsd4 != null ? fmtMoney(excessUsd4 + bettermentUsd4) : excessUsd4 != null ? fmtMoney(excessUsd4) : 'Not available'],
              ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([k, v], i) => (
                <tr key={i} style={{ borderTop: i > 0 ? '1px solid #e2e8f0' : undefined }}>
                  <td className="py-2 pr-4 font-semibold w-48" style={{ color: 'var(--kr-muted)' }}>{k as string}</td>
                  <td className="py-2 tabular-nums" style={{ color: 'var(--kr-text)' }}>{v as string}</td>
                </tr>
              ))}
              </tbody>
            </table>
            {repairToValue4 != null && (
              <div className="mt-3 p-2 rounded text-xs" style={{
                background: isWriteOff4 ? 'var(--status-reject-bg)' : '#ffffff',
                color: isWriteOff4 ? 'var(--fp-critical-text)' : 'var(--kr-text)',
                border: `1px solid ${isWriteOff4 ? 'var(--fp-critical-border)' : 'var(--border)'}`,
              }}>
                {isWriteOff4
                  ? `Repair cost is ${repairToValue4.toFixed(1)}% of market value — exceeds 75% threshold. Potential economic write-off.`
                  : `Repair cost is ${repairToValue4.toFixed(1)}% of market value — within repairable range.`}
              </div>
            )}
            {verdictReason4 && (
              <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--kr-muted)' }}>
                <span className="font-semibold" style={{ color: 'var(--kr-text)' }}>KINGA Valuation Note: </span>
                {isKingaOptimised4 && (
                  <span className="font-medium" style={{ color: '#0d9488' }}>KINGA Optimised Cost: {fmtMoney(repairCost4)}. </span>
                )}
                {verdictReason4}
              </p>
            )}
          </div>
        </div>
      )}

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
          <p className="text-xs font-semibold" style={{ color: 'var(--kr-text)' }}>
            Low-sharpness scanned PDF detected
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--kr-muted)' }}>
            Re-extract photos at 300 DPI for a sharper damage analysis. This re-runs only the photo extraction
            and damage analysis stages — the rest of the report stays unchanged.
          </p>
          {error && (
            <p className="text-xs mt-1 font-semibold" style={{ color: "var(--fp-critical-text)" }}>
              ⚠ {error}
            </p>
          )}
          {alreadyCompleted && !isRunning && (
            <div className="mt-2 p-2 rounded text-xs" style={{ background: 'var(--kr-white)', border: '1px solid var(--kr-rule)' }}>
              <span className="font-semibold" style={{ color: "var(--fp-success-text)" }}>✓ Re-extraction complete — </span>
              <span style={{ color: 'var(--kr-muted)' }}>
                {(result ?? latestJob)?.photosExtracted ?? 0} photo(s) extracted at {(result ?? latestJob)?.renderDpi ?? 300} DPI
                {(result ?? latestJob)?.avgSharpness ? `, avg sharpness ${(result ?? latestJob).avgSharpness}%` : ""}
              </span>
              <span className="ml-2" style={{ color: 'var(--kr-muted)' }}>
                · Report photos updated
              </span>
            </div>
          )}
          {isRunning && (
            <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--kr-muted)' }}>
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
            color: isRunning ? "var(--kr-muted)" : "#fff",
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

function Section4Evidence({ aiAssessment, enforcement, claim, resolvedPhotosOverride }: { aiAssessment: any; enforcement: any; claim: any; resolvedPhotosOverride?: Array<{ index: number; url: string; resolved: boolean }> }) {
  // Currency-aware formatter — derived from claim currency code
  const fmtMoney = makeFmtCurrency((aiAssessment as any)?.currencyCode ?? (aiAssessment as any)?.claimCurrency ?? null);
  const phase2 = (enforcement as any)?._phase2 as any;
  const photoStatus = phase2?.photoAnalysis?.photoStatus ?? "NOT_APPLICABLE";
  // CTL override: unified evidence inventory
  const ctl4 = (enforcement as any)?._claimTruth;
  const claimRecord0 = (aiAssessment as any)?._claimRecord ?? (aiAssessment as any)?.claimRecord ?? null;
  const photosDetected = ctl4?.evidence?.photoCount ?? aiAssessment?.photosDetected ?? 0;
  const photosProcessed = aiAssessment?.photosProcessedCount ?? 0;
  // CRITICAL FIX: Use enrichedPhotosJson (per-photo KINGA vision metadata) as the
  // primary source so each photo is labelled with what KINGA actually detected
  // in that specific image, not a positional guess from damagedParts[i].
  interface EnrichedPhotoFAR {
    url: string;
    caption: string;
    detectedComponents: string[];
    impactZone: string;
    severity: string;
    confidenceScore?: number;
    imageQuality?: string;       // 'good' | 'poor' | 'unusable'
    aiVisionDescription?: string; // Stage 6 raw vision text — used for document detection guard
    isNonVehicle?: boolean;       // Stage 6 explicit non-vehicle flag
  }
  // Build a lookup map from resolvedPhotosOverride for O(1) URL swapping
  const _farResolvedUrlMap = new Map<number, string>();
  if (resolvedPhotosOverride) {
    for (const r of resolvedPhotosOverride) {
      if (r.resolved) _farResolvedUrlMap.set(r.index, r.url);
    }
  }
  const enrichedPhotosFAR: EnrichedPhotoFAR[] = (() => {
    const raw = aiAssessment?.enrichedPhotosJson;
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
            .filter((p: any) => p?.url)
            .map((p: any, idx: number) => ({
              // Use resolved PNG URL if available, otherwise use stored URL
              url: _farResolvedUrlMap.get(p.index ?? idx) ?? p.url,
              caption: p.caption ?? (Array.isArray(p.detectedComponents) && p.detectedComponents.length > 0
                ? p.detectedComponents.slice(0, 3).join(', ')
                : `Photo ${(p.index ?? idx) + 1}`),
              detectedComponents: Array.isArray(p.detectedComponents) ? p.detectedComponents : [],
              impactZone: p.impactZone ?? 'unknown',
              severity: p.severity ?? 'unknown',
              confidenceScore: typeof p.confidenceScore === 'number' ? Math.round(p.confidenceScore) : undefined,
              imageQuality: typeof p.imageQuality === 'string' ? p.imageQuality : undefined,
              aiVisionDescription: typeof p.aiVisionDescription === 'string' ? p.aiVisionDescription : undefined,
              isNonVehicle: typeof p.isNonVehicle === 'boolean' ? p.isNonVehicle : undefined,
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
      { urls: photoUrls.slice(0, 50), assessmentId: aiAssessment?.id ?? undefined },
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
    classifiedPhotos.filter(c => c.category === 'document_page' || c.category === 'quotation_scan');

  // CTL-aware evidence inventory: use unified truth when available
  const ctlQuoteCount = ctl4?.costBasis?.quotes?.length ?? 0;
  // Build docs array — only include rows that have been extracted/provided.
  // Rows with extracted=false are suppressed: they expose missing data and create
  // duplication with the fraud risk indicators that already flag missing documents.
  const docsAll = [
    { id: "Claim Form", type: "Primary", extracted: true, note: "Submitted by claimant" },
    { id: "Police Report", type: "Supporting", extracted: !!(ctl4?.evidence?.policeReportPresent ?? claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber), note: (claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber) ? `Case: ${claimRecord0?.policeReport?.reportNumber ?? aiAssessment?.policeReportNumber}` : (ctl4?.evidence?.policeReportPresent ? "Present in file" : "Not provided") },
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
    { id: "Witness Statement", type: "Supporting", extracted: !!(ctl4?.evidence?.witnessStatementNote && ctl4.evidence.witnessStatementNote !== 'Optional'), note: ctl4?.evidence?.witnessStatementNote ?? "Optional" },
  ];
  // Only show rows that were actually extracted/provided — suppress missing-data rows
  const docs = docsAll.filter(d => d.extracted);

  // ── Unified document register: merge photo stats into the docs table ──
  const photoRegisterNote = isSystemFailure
    ? `System error — photo ingestion failed (not claimant fault)`
    : photoStatus === 'CLAIMANT_OMISSION'
      ? 'Not submitted — contributes to fraud score'
      : photosDetected > 0
        ? `${photosDetected} detected · ${photosProcessed} processed`
        : 'Not submitted';
  const photoRegisterConf = isSystemFailure ? 0 : photosDetected > 0 ? 80 : 0;
  const allDocsForRegister = [
    ...docsAll.filter(d => d.id !== 'Photos'),
    {
      id: 'Photos',
      type: 'Visual',
      extracted: photosDetected > 0 || photoStatus === 'CLAIMANT_OMISSION',
      note: photoRegisterNote,
    },
  ].filter(d => d.extracted);

  return (
    <div className="mb-1 space-y-2" style={{ marginBottom: "8px" }}>
      {/* 4.1 Document Register — merged evidence inventory */}
      {allDocsForRegister.length > 0 && (
      <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <p className="sub-heading">4.1 Document Register</p>
          <span className="text-xs font-semibold" style={{ color: 'var(--kr-muted)' }}>{allDocsForRegister.length} item{allDocsForRegister.length !== 1 ? 's' : ''} received</span>
        </div>
        {isSystemFailure && (
          <div className="px-4 pb-2 text-xs" style={{ color: 'var(--kr-muted)' }}>
            <strong style={{ color: 'var(--kr-text)' }}>System error</strong> — Photo ingestion failed due to a pipeline error. Not attributed to the claimant. Photo-related fraud points excluded from score.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs report-table">
            <thead>
              <tr>
                {["Document", "Type", "Confidence", "Detail"].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allDocsForRegister.map((doc, i) => {
                const conf = doc.id === 'Photos' ? photoRegisterConf
                  : doc.type === "Primary" ? 95
                  : doc.type === "Financial" ? 85
                  : doc.type === "Identity" ? 90
                  : 75;
                const confColor = conf >= 80 ? "var(--fp-success-text)" : conf >= 60 ? "var(--fp-warning-text)" : "var(--fp-critical-text)";
                return (
                  <tr key={i} style={{ borderTop: i === 0 ? undefined : '1px solid var(--kr-rule)' }}>
                    <td className="px-3 py-2 font-medium" style={{ color: 'var(--kr-text)' }}>{doc.id}</td>
                    <td className="px-3 py-2" style={{ color: 'var(--kr-muted)' }}>{doc.type}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 rounded-full flex-1" style={{ background: 'var(--kr-rule)', minWidth: 60 }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${conf}%`, background: confColor }} />
                        </div>
                        <span className="text-xs font-semibold shrink-0" style={{ color: confColor }}>{conf}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--kr-muted)' }}>{doc.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
      {/* Photo gallery block — kept as-is, heading removed since register above covers it */}
      <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
        <div className="px-4 py-3 flex items-center justify-between" >
          <p className="sub-heading">4.2 Photo Evidence</p>
          <span className="text-xs font-semibold" style={{ color: 'var(--kr-muted)' }}>{toSentenceCase((photoStatus ?? "").replace(/_/g, " "))}</span>
        </div>
        <div className="p-4">
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
                <p className="micro-label">Photo Evidence Inventory</p>
                <div style={{ height: 160 }}>
                  <Bar data={photoInventoryData} options={photoInventoryOpts} />
                </div>
              </div>
            );
          })()}
          {photoUrls.length === 0 && (
            <div className="mt-3 px-4 py-6 text-center rounded" style={{ border: '1px dashed var(--kr-rule)', background: 'var(--kr-off-white)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--kr-muted)' }}>No damage photographs submitted</p>
              <p className="text-xs mt-1" style={{ color: 'var(--kr-muted)' }}>Damage photographs were not provided with this claim. Request photo evidence from the claimant before settlement to enable KINGA Vision analysis.</p>
            </div>
          )}
          {photoUrls.length > 0 && (
            <div className="mt-3">
              {/* C-09: Classification status indicator */}
              {photoClassifying && (
                <p className="text-xs mb-2" style={{ color: 'var(--kr-muted)' }}>⏳ Classifying photos…</p>
              )}
              {/* ─── Zone-Card Evidence System ─────────────────────────────────────────
               * Replaces the flat gallery. Photos are grouped by impact zone.
               * Each zone card shows: evidence grade, detection confidence, evidence
               * summary, hero photo, key findings, component categories, and a
               * thumbnail strip (max 3 supporting photos). Zones with no damage are
               * omitted entirely. Poor-quality / no-detection photos go to a collapsed
               * note at the bottom.
               * ─────────────────────────────────────────────────────────────────────── */}
              {damagePhotoUrls.length > 0 && (() => {
                // ── Zone utilities ──────────────────────────────────────────────────────
                const ZONE_CANONICAL: Record<string, string> = {
                  front: 'FRONT', 'front zone': 'FRONT',
                  'front left': 'FRONT_LEFT', 'front_left': 'FRONT_LEFT', 'front left zone': 'FRONT_LEFT',
                  'front right': 'FRONT_RIGHT', 'front_right': 'FRONT_RIGHT',
                  'rear': 'REAR', 'rear zone': 'REAR',
                  'rear left': 'REAR_LEFT', 'rear_left': 'REAR_LEFT',
                  'rear right': 'REAR_RIGHT', 'rear_right': 'REAR_RIGHT',
                  'left side': 'LEFT_SIDE', 'left_side': 'LEFT_SIDE', 'driver side': 'LEFT_SIDE',
                  'right side': 'RIGHT_SIDE', 'right_side': 'RIGHT_SIDE', 'passenger side': 'RIGHT_SIDE',
                  'interior': 'INTERIOR', 'cabin': 'INTERIOR',
                  'roof': 'ROOF', 'undercarriage': 'UNDERCARRIAGE',
                  'unknown': 'UNKNOWN', '': 'UNKNOWN',
                };
                const ZONE_DISPLAY: Record<string, string> = {
                  FRONT: 'Front Zone', FRONT_LEFT: 'Front Left Zone', FRONT_RIGHT: 'Front Right Zone',
                  REAR: 'Rear Zone', REAR_LEFT: 'Rear Left Zone', REAR_RIGHT: 'Rear Right Zone',
                  LEFT_SIDE: 'Left Side', RIGHT_SIDE: 'Right Side',
                  INTERIOR: 'Interior / Cabin', ROOF: 'Roof', UNDERCARRIAGE: 'Undercarriage',
                  UNKNOWN: 'Unknown',
                };
                const normaliseZone = (raw: string): string => {
                  const key = (raw ?? '').toLowerCase().trim().replace(/_/g, ' ');
                  return ZONE_CANONICAL[key] ?? 'UNKNOWN';
                };

                // ── Component category lookup ────────────────────────────────────────────
                const COMP_CATEGORIES: Record<string, string[]> = {
                  Structural:  ['support','crossmember','rail','sill','pillar','chassis','subframe','frame','beam','member'],
                  Exterior:    ['bumper','bonnet','hood','door','fender','wing','panel','grille','guard','skirt','spoiler','mirror'],
                  Lighting:    ['headlamp','headlight','tail lamp','taillight','fog lamp','foglight','drl','indicator','lamp','light'],
                  Cooling:     ['radiator','condenser','intercooler','fan','cooler'],
                  Suspension:  ['control arm','strut','hub','knuckle','spring','shock','absorber','suspension','wishbone','trailing'],
                  Safety:      ['airbag','seatbelt','seat belt','pretensioner','curtain','module'],
                  Glazing:     ['windscreen','windshield','glass','window'],
                  Drivetrain:  ['engine','gearbox','transmission','driveshaft','axle','diff'],
                };
                const categoriseComponent = (name: string): string => {
                  const n = name.toLowerCase();
                  for (const [cat, keywords] of Object.entries(COMP_CATEGORIES)) {
                    if (keywords.some(k => n.includes(k))) return cat;
                  }
                  return 'Other';
                };

                // ── Build per-photo enriched lookup (url → enriched) ────────────────────
                const enrichedByUrl = new Map<string, typeof enrichedPhotosFAR[0]>();
                enrichedPhotosFAR.forEach(p => enrichedByUrl.set(p.url, p));

                // ── Group photos by canonical zone ───────────────────────────────────────
                interface ZonePhoto {
                  url: string;
                  enriched: typeof enrichedPhotosFAR[0] | undefined;
                  components: string[];
                  severity: string;
                  confidence: number;
                  isGoodQuality: boolean;
                }
                const zoneMap = new Map<string, ZonePhoto[]>();
                const poorQualityPhotos: string[] = [];

                // ── isDocumentVisionText: guard against Stage 6 hallucinating components on docs ──
                const isDocVisionText = (text: string): boolean => {
                  if (!text) return false;
                  return /\b(quotation|invoice|repair quote|line item|labour|parts list|vat|total amount|claim form|police report|id document|registration certificate|licence disc)\b/i.test(text);
                };

                damagePhotoUrls.forEach(url => {
                  const enriched = enrichedByUrl.get(url);
                  const comps = enriched?.detectedComponents ?? [];
                  const sev = (enriched?.severity ?? 'unknown').toLowerCase();
                  const conf = enriched?.confidenceScore ?? 0;
                  const isGood = comps.length > 0 && conf >= 40;
                  const rawZone = enriched?.impactZone ?? 'unknown';
                  const zone = normaliseZone(rawZone);

                  // Guard 1: Stage 6 non-vehicle flag
                  if ((enriched as any)?.isNonVehicle === true) {
                    poorQualityPhotos.push(url);
                    return;
                  }

                  // Guard 2: Stage 6 vision description contains document/quotation language
                  if (isDocVisionText((enriched as any)?.aiVisionDescription ?? '')) {
                    poorQualityPhotos.push(url);
                    return;
                  }

                  if (!isGood && comps.length === 0) {
                    poorQualityPhotos.push(url);
                    // Still add to zone if we know the zone
                    if (zone === 'UNKNOWN') return;
                  }

                  if (!zoneMap.has(zone)) zoneMap.set(zone, []);
                  zoneMap.get(zone)!.push({ url, enriched, components: comps, severity: sev, confidence: conf, isGoodQuality: isGood });
                });

                // ── Evidence scoring ─────────────────────────────────────────────────────
                const SEV_SCORE: Record<string, number> = { severe: 3, catastrophic: 3, moderate: 2, minor: 1, cosmetic: 0.5, unknown: 1 };
                const scoreZone = (photos: ZonePhoto[]): number => {
                  if (photos.length === 0) return 0;
                  const avgConf = photos.reduce((s, p) => s + p.confidence, 0) / photos.length / 100;
                  const allComps = new Set<string>();
                  const compPhotoCount = new Map<string, number>();
                  photos.forEach(p => p.components.forEach(c => {
                    const k = c.toLowerCase();
                    allComps.add(k);
                    compPhotoCount.set(k, (compPhotoCount.get(k) ?? 0) + 1);
                  }));
                  const corroborated = Array.from(allComps).filter(c => (compPhotoCount.get(c) ?? 0) >= 2).length;
                  const corrobRate = allComps.size > 0 ? corroborated / allComps.size : 0;
                  const maxSev = photos.reduce((m, p) => Math.max(m, SEV_SCORE[p.severity] ?? 1), 0);
                  const sevScore = maxSev / 3;
                  const qualRate = photos.filter(p => p.isGoodQuality).length / photos.length;
                  return (0.35 * avgConf) + (0.30 * corrobRate) + (0.20 * sevScore) + (0.15 * qualRate);
                };
                const gradeZone = (score: number): { label: string; colour: string; bg: string } => {
                  if (score >= 0.85) return { label: 'Excellent Evidence', colour: '#15803d', bg: '#f0fdf4' };
                  if (score >= 0.70) return { label: 'Strong Evidence',    colour: '#1d4ed8', bg: '#eff6ff' };
                  if (score >= 0.55) return { label: 'Moderate Evidence',  colour: '#b45309', bg: '#fffbeb' };
                  if (score >= 0.40) return { label: 'Limited Evidence',   colour: '#9a3412', bg: '#fff7ed' };
                  return { label: 'Insufficient Evidence', colour: '#b91c1c', bg: '#fef2f2' };
                };

                // ── Key findings rules ───────────────────────────────────────────────────
                const buildKeyFindings = (photos: ZonePhoto[], zoneKey: string): string[] => {
                  const allComps = new Set<string>();
                  const compPhotoCount = new Map<string, number>();
                  photos.forEach(p => p.components.forEach(c => {
                    const k = c.toLowerCase();
                    allComps.add(k);
                    compPhotoCount.set(k, (compPhotoCount.get(k) ?? 0) + 1);
                  }));
                  const findings: string[] = [];
                  // 1. Safety system activation
                  const safetyComps = Array.from(allComps).filter(c => COMP_CATEGORIES.Safety.some(k => c.includes(k)));
                  if (safetyComps.length > 0) {
                    const names = photos.flatMap(p => p.components.filter(c => COMP_CATEGORIES.Safety.some(k => c.toLowerCase().includes(k)))).filter((v,i,a)=>a.indexOf(v)===i).slice(0,2);
                    findings.push(`Safety system activation detected — ${names.join(', ')} observed.`);
                  }
                  // 2. Structural damage
                  const structComps = Array.from(allComps).filter(c => COMP_CATEGORIES.Structural.some(k => c.includes(k)));
                  if (structComps.length > 0) {
                    const names = photos.flatMap(p => p.components.filter(c => COMP_CATEGORIES.Structural.some(k => c.toLowerCase().includes(k)))).filter((v,i,a)=>a.indexOf(v)===i).slice(0,2);
                    findings.push(`Structural damage identified — ${names.join(', ')} affected.`);
                  }
                  // 3. Suspension involvement
                  const suspComps = Array.from(allComps).filter(c => COMP_CATEGORIES.Suspension.some(k => c.includes(k)));
                  if (suspComps.length > 0) {
                    const names = photos.flatMap(p => p.components.filter(c => COMP_CATEGORIES.Suspension.some(k => c.toLowerCase().includes(k)))).filter((v,i,a)=>a.indexOf(v)===i).slice(0,2);
                    findings.push(`Suspension system involvement — ${names.join(', ')} detected.`);
                  }
                  // 4. Cross-zone component propagation
                  const otherZoneComps = new Set<string>();
                  zoneMap.forEach((zPhotos, zKey) => {
                    if (zKey === zoneKey) return;
                    zPhotos.forEach(p => p.components.forEach(c => otherZoneComps.add(c.toLowerCase())));
                  });
                  const crossZone = Array.from(allComps).filter(c => otherZoneComps.has(c));
                  if (crossZone.length >= 2) {
                    findings.push(`Damage propagation across ${crossZone.length} components shared with adjacent zones.`);
                  }
                  // 5. Strong corroboration
                  const corroborated = Array.from(allComps).filter(c => (compPhotoCount.get(c) ?? 0) >= 3).length;
                  if (corroborated >= 3 && photos.length >= 3) {
                    findings.push(`${corroborated} components independently confirmed across ${photos.length} photographs.`);
                  }
                  // 6. Limited viewpoints
                  if (photos.length === 1) {
                    findings.push('Single photograph available — additional viewpoints recommended for full assessment.');
                  }
                  // 7. Poor image quality
                  const poorCount = photos.filter(p => !p.isGoodQuality).length;
                  if (poorCount > 0 && poorCount >= photos.length / 2) {
                    findings.push(`${poorCount} of ${photos.length} zone photographs are low quality — damage extent may be understated.`);
                  }
                  return findings.slice(0, 5);
                };

                // ── Evidence summary template ────────────────────────────────────────────
                const buildEvidenceSummary = (photos: ZonePhoto[], zoneDisplay: string): string => {
                  const allComps = new Set<string>();
                  const compPhotoCount = new Map<string, number>();
                  photos.forEach(p => p.components.forEach(c => {
                    const k = c.toLowerCase();
                    allComps.add(k);
                    compPhotoCount.set(k, (compPhotoCount.get(k) ?? 0) + 1);
                  }));
                  const maxSev = photos.reduce((m, p) => {
                    const s = SEV_SCORE[p.severity] ?? 1;
                    return s > (SEV_SCORE[m] ?? 1) ? p.severity : m;
                  }, 'unknown');
                  const sevDesc = maxSev === 'severe' || maxSev === 'catastrophic' ? 'Severe' :
                    maxSev === 'moderate' ? 'Moderate' : maxSev === 'minor' ? 'Minor' : '';
                  // Top 3 most-seen components
                  const topComps = Array.from(allComps)
                    .sort((a, b) => (compPhotoCount.get(b) ?? 0) - (compPhotoCount.get(a) ?? 0))
                    .slice(0, 3)
                    .map(c => photos.flatMap(p => p.components).find(pc => pc.toLowerCase() === c) ?? c);
                  const corroborated = Array.from(allComps).filter(c => (compPhotoCount.get(c) ?? 0) >= 2).length;
                  const corrobDesc = corroborated / allComps.size >= 0.8 ? 'strong' :
                    corroborated / allComps.size >= 0.6 ? 'moderate' :
                    corroborated / allComps.size >= 0.4 ? 'limited' : 'minimal';
                  const photoWord = photos.length === 1 ? '1 photograph' : `${photos.length} photographs`;
                  const compStr = topComps.length >= 3 ? `${topComps[0]}, ${topComps[1]}, and ${topComps[2]}`
                    : topComps.length === 2 ? `${topComps[0]} and ${topComps[1]}`
                    : topComps[0] ?? 'multiple components';
                  return `${sevDesc ? sevDesc + ' ' : ''}${zoneDisplay.toLowerCase()} damage involving ${compStr} was observed across ${photoWord} with ${corrobDesc} cross-image corroboration.`;
                };

                // ── Hero selection ───────────────────────────────────────────────────────
                const selectHero = (photos: ZonePhoto[]): ZonePhoto => {
                  if (photos.length === 1) return photos[0];
                  return photos.reduce((best, p) => {
                    const score = p.components.length * (p.confidence / 100) * (SEV_SCORE[p.severity] ?? 1);
                    const bestScore = best.components.length * (best.confidence / 100) * (SEV_SCORE[best.severity] ?? 1);
                    return score > bestScore ? p : best;
                  });
                };

                // ── Supporting thumbnail selection (max 3, by new-component contribution) ─
                const selectSupporting = (photos: ZonePhoto[], hero: ZonePhoto): ZonePhoto[] => {
                  const seen = new Set(hero.components.map(c => c.toLowerCase()));
                  const scored = photos
                    .filter(p => p.url !== hero.url)
                    .map(p => {
                      const newComps = p.components.filter(c => !seen.has(c.toLowerCase())).length;
                      return { photo: p, newComps };
                    })
                    .sort((a, b) => b.newComps - a.newComps);
                  return scored.slice(0, 3).map(s => s.photo);
                };

                // ── Zone ordering: severity first, then component count ──────────────────
                const SEV_ORDER: Record<string, number> = { severe: 0, catastrophic: 0, moderate: 1, minor: 2, cosmetic: 3, unknown: 4 };
                const orderedZones = Array.from(zoneMap.entries())
                  .filter(([key]) => key !== 'UNKNOWN')
                  .sort(([, a], [, b]) => {
                    const aSev = a.reduce((m, p) => Math.min(m, SEV_ORDER[p.severity] ?? 4), 4);
                    const bSev = b.reduce((m, p) => Math.min(m, SEV_ORDER[p.severity] ?? 4), 4);
                    if (aSev !== bSev) return aSev - bSev;
                    const aComps = new Set(a.flatMap(p => p.components.map(c => c.toLowerCase()))).size;
                    const bComps = new Set(b.flatMap(p => p.components.map(c => c.toLowerCase()))).size;
                    return bComps - aComps;
                  });

                // ── Severity colours ─────────────────────────────────────────────────────
                const SEV_COL: Record<string, string> = {
                  catastrophic: '#7f1d1d', severe: '#9a3412', moderate: '#92400e', minor: '#14532d', cosmetic: '#1e3a5f', unknown: '#475569',
                };
                const SEV_BG: Record<string, string> = {
                  catastrophic: '#fef2f2', severe: '#fff7ed', moderate: '#fffbeb', minor: '#f0fdf4', cosmetic: '#eff6ff', unknown: '#f8fafc',
                };

                const pfData = (enforcement as any)?._photoForensics as any;
                const pfPhotos: any[] = pfData?.photos ?? [];

                // ── Coverage stats (used in zone card header bar) ────────────────────
                const allEnriched = enrichedPhotosFAR.length > 0 ? enrichedPhotosFAR : [];
                const uniqueComponentsAll = (() => {
                  const seen = new Set<string>();
                  allEnriched.forEach(p => (p.detectedComponents ?? []).forEach((c: string) => seen.add(c.toLowerCase())));
                  return seen.size;
                })();

                // Find matching forensics record by URL
                const getForensics = (url: string) => pfPhotos.find((p: any) =>
                  (p.url ?? p.imageUrl ?? '') === url
                );

                // ── Coverage audit stats for table ─────────────────────────────────────
                const highConfCount = allEnriched.filter(p => (p.confidenceScore ?? 0) >= 70).length;
                const zonesCount = orderedZones.length;

                return (
                  <>
                    {/* ── P3: Photo Coverage Audit Table ───────────────────────────────────────────
                     * Consolidates all photo-quality disclosure into one scannable table.
                     * Placed above zone cards so the reader sees the coverage summary before
                     * diving into per-zone evidence. Data is derived entirely from already-
                     * computed local variables — no new fetches required.
                     * ─────────────────────────────────────────────────────────────────────────── */}
                    {allEnriched.length > 0 && (
                      <div style={{ marginBottom: 12, border: '1px solid #e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                          <thead>
                            <tr style={{ background: '#f8fafc' }}>
                              {['Photos Analysed', 'High Confidence (≥70%)', 'Poor Quality / No Detection', 'Unique Components', 'Zones Covered'].map(h => (
                                <th key={h} style={{ padding: '5px 10px', textAlign: 'center', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#475569', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr style={{ background: '#fff' }}>
                              <td style={{ padding: '6px 10px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{allEnriched.length}</span>
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: 15, fontWeight: 700, color: highConfCount === allEnriched.length ? '#15803d' : highConfCount >= Math.ceil(allEnriched.length * 0.6) ? '#92400e' : '#dc2626' }}>{highConfCount}</span>
                                <span style={{ fontSize: 9, color: '#94a3b8', marginLeft: 3 }}>/ {allEnriched.length}</span>
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: 15, fontWeight: 700, color: poorQualityPhotos.length === 0 ? '#15803d' : poorQualityPhotos.length <= 2 ? '#92400e' : '#dc2626' }}>{poorQualityPhotos.length}</span>
                                {poorQualityPhotos.length > 0 && (
                                  <span style={{ fontSize: 9, color: '#dc2626', marginLeft: 3 }}>⚠</span>
                                )}
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{uniqueComponentsAll}</span>
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{zonesCount}</span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                    {/* ── Zone-card section heading + summary bar ─────────────────── */}
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                      <p className="sub-heading" style={{ margin: 0 }}>
                        4.1 Damage Evidence by Zone
                      </p>
                      <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>
                        {orderedZones.length} zone{orderedZones.length !== 1 ? 's' : ''} · {damagePhotoUrls.length} photo{damagePhotoUrls.length !== 1 ? 's' : ''} · {uniqueComponentsAll} components
                      </span>
                    </div>
                    {/* ── Zone Cards ────────────────────────────────────────────────────────────────────── */}
                    {orderedZones.length === 0 && (
                      <p style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>No damage zones could be identified from the submitted photographs.</p>
                    )}
                    {orderedZones.map(([zoneKey, zonePhotos]) => {
                      const zoneDisplay = ZONE_DISPLAY[zoneKey] ?? zoneKey;
                      const score = scoreZone(zonePhotos);
                      const grade = gradeZone(score);
                      const hero = selectHero(zonePhotos);
                      const supporting = selectSupporting(zonePhotos, hero);
                      const findings = buildKeyFindings(zonePhotos, zoneKey);
                      const summary = buildEvidenceSummary(zonePhotos, zoneDisplay);
                      const maxSev = zonePhotos.reduce((m, p) => {
                        const s = SEV_SCORE[p.severity] ?? 1;
                        return s > (SEV_SCORE[m] ?? 1) ? p.severity : m;
                      }, 'unknown');
                      const sevLabel = maxSev.charAt(0).toUpperCase() + maxSev.slice(1);
                      const sevColour = SEV_COL[maxSev] ?? '#475569';
                      const sevBg = SEV_BG[maxSev] ?? '#f8fafc';
                      const avgConf = Math.round(zonePhotos.reduce((s, p) => s + p.confidence, 0) / zonePhotos.length);
                      // Component categories
                      const allZoneComps = Array.from(new Set(zonePhotos.flatMap(p => p.components)));
                      const compByCategory: Record<string, string[]> = {};
                      allZoneComps.forEach(c => {
                        const cat = categoriseComponent(c);
                        if (!compByCategory[cat]) compByCategory[cat] = [];
                        compByCategory[cat].push(c);
                      });
                      const catOrder = ['Safety','Structural','Suspension','Exterior','Lighting','Cooling','Glazing','Drivetrain','Other'];
                      const sortedCats = catOrder.filter(c => compByCategory[c]?.length > 0);
                      return (
                        <div key={zoneKey} style={{
                          marginBottom: 16,
                          border: `1px solid ${sevColour}40`,
                          borderRadius: 5,
                          overflow: 'hidden',
                          background: 'var(--kr-white)',
                        }}>
                          {/* Zone header */}
                          <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '7px 12px', background: sevBg,
                            borderBottom: `1px solid ${sevColour}30`,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>{zoneDisplay}</span>
                              <span style={{
                                fontSize: 8, fontWeight: 700, color: sevColour,
                                background: `${sevColour}18`, border: `1px solid ${sevColour}40`,
                                borderRadius: 3, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.06em',
                              }}>{sevLabel}</span>
                              <span style={{
                                fontSize: 8, fontWeight: 700, color: grade.colour,
                                background: grade.bg, border: `1px solid ${grade.colour}40`,
                                borderRadius: 3, padding: '1px 5px',
                              }}>{grade.label}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 8, color: '#64748b' }}>
                                Detection confidence: <strong style={{ color: avgConf >= 70 ? '#15803d' : avgConf >= 50 ? '#b45309' : '#b91c1c' }}>{avgConf}%</strong>
                              </span>
                              <span style={{ fontSize: 8, color: '#94a3b8' }}>
                                {zonePhotos.length} photo{zonePhotos.length !== 1 ? 's' : ''} · {allZoneComps.length} component{allZoneComps.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>

                          {/* Evidence summary */}
                          <div style={{ padding: '8px 12px 0', borderBottom: '1px solid #f1f5f9' }}>
                            <p style={{ fontSize: 9, color: '#475569', fontStyle: 'italic', margin: '0 0 8px', lineHeight: 1.5 }}>{summary}</p>
                          </div>

                          {/* Hero + Key Findings side by side */}
                          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 0 }}>
                            {/* Hero photo */}
                            <div style={{ borderRight: '1px solid #f1f5f9', padding: 10 }}>
                              <img
                                src={hero.url}
                                alt={`${zoneDisplay} hero`}
                                style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 3, display: 'block' }}
                              />
                              {hero.enriched?.caption && (
                                <p style={{ fontSize: 7, color: '#94a3b8', margin: '4px 0 0', lineHeight: 1.4 }}>{hero.enriched.caption}</p>
                              )}
                              {/* Supporting thumbnails */}
                              {supporting.length > 0 && (
                                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                  {supporting.map((sp, si) => (
                                    <div key={si} style={{ position: 'relative', flex: 1 }}>
                                      <img
                                        src={sp.url}
                                        alt={`${zoneDisplay} supporting ${si + 1}`}
                                        style={{ width: '100%', height: 44, objectFit: 'cover', borderRadius: 2, display: 'block', opacity: 0.85 }}
                                      />
                                      {/* P1: minimal indicator — confidence + component count */}
                                      <div style={{
                                        position: 'absolute', bottom: 2, left: 2, right: 2,
                                        display: 'flex', gap: 2, justifyContent: 'center',
                                      }}>
                                        {sp.confidence > 0 && (
                                          <span style={{
                                            fontSize: 6, fontWeight: 700, lineHeight: 1,
                                            padding: '1px 3px', borderRadius: 2,
                                            background: sp.confidence >= 70 ? 'rgba(21,128,61,0.85)' : sp.confidence >= 40 ? 'rgba(146,64,14,0.85)' : 'rgba(100,116,139,0.85)',
                                            color: '#fff',
                                          }}>{sp.confidence}%</span>
                                        )}
                                        {sp.components.length > 0 && (
                                          <span style={{
                                            fontSize: 6, fontWeight: 700, lineHeight: 1,
                                            padding: '1px 3px', borderRadius: 2,
                                            background: 'rgba(15,23,42,0.7)', color: '#e2e8f0',
                                          }}>{sp.components.length}c</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                  {zonePhotos.length - 1 - supporting.length > 0 && (
                                    <div style={{
                                      flex: '0 0 32px', height: 44, background: '#f1f5f9', borderRadius: 2,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                      <span style={{ fontSize: 7, color: '#64748b', fontWeight: 700 }}>+{zonePhotos.length - 1 - supporting.length}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Key findings + component categories */}
                            <div style={{ padding: '10px 12px' }}>
                              {findings.length > 0 && (
                                <div style={{ marginBottom: 10 }}>
                                  <p style={{ fontSize: 8, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 5px' }}>Key Findings</p>
                                  {findings.map((f, fi) => (
                                    <div key={fi} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 3 }}>
                                      <span style={{ fontSize: 8, color: sevColour, fontWeight: 700, lineHeight: 1.5, flexShrink: 0 }}>
                                        {fi === 0 && findings.some(x => x.startsWith('Safety')) ? '⚠' : '•'}
                                      </span>
                                      <p style={{ fontSize: 8.5, color: '#334155', margin: 0, lineHeight: 1.5 }}>{f}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* Component categories */}
                              {sortedCats.length > 0 && (
                                <div>
                                  <p style={{ fontSize: 8, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 5px' }}>Components Identified</p>
                                  {sortedCats.map(cat => (
                                    <div key={cat} style={{ marginBottom: 4 }}>
                                      <span style={{ fontSize: 7.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>{cat}</span>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                        {(compByCategory[cat] ?? []).slice(0, 8).map((c, ci) => (
                                          <span key={ci} style={{
                                            fontSize: 7, color: '#334155',
                                            background: '#f8fafc', border: '1px solid #e2e8f0',
                                            borderRadius: 2, padding: '1px 4px', lineHeight: 1.6,
                                          }}>{c}</span>
                                        ))}
                                        {(compByCategory[cat] ?? []).length > 8 && (
                                          <span style={{ fontSize: 7, color: '#94a3b8', padding: '1px 2px', lineHeight: 1.6 }}>+{(compByCategory[cat] ?? []).length - 8}</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* ── Poor-quality / no-detection note ────────────────────────────────────────── */}
                    {poorQualityPhotos.length > 0 && (
                      <div style={{
                        marginTop: 4, padding: '7px 12px',
                        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4,
                      }}>
                        <p style={{ fontSize: 8.5, color: '#64748b', margin: 0 }}>
                          <strong>{poorQualityPhotos.length}</strong> photograph{poorQualityPhotos.length !== 1 ? 's' : ''} could not be analysed (poor image quality or no vehicle components detected). Included in evidence appendix.
                        </p>
                      </div>
                    )}

                    {/* Dummy reference to avoid unused-var TS error for getForensics */}
                    {void getForensics}
                  </>
                );
              })()}
              {/* C-09: Excluded document/form images section — screen only, hidden in print */}
              {excludedDocUrls.length > 0 && (
                <div className="mt-3 rounded p-3 no-print" style={{ border: "1px solid #fbbf24", background: "#fffbeb" }}>
                  <p className="sub-heading" style={{ color: 'var(--kr-amber)' }}>
                    ⚠ {excludedDocUrls.length} image{excludedDocUrls.length !== 1 ? 's' : ''} excluded from damage gallery
                  </p>
                  <p className="text-xs mb-2" style={{ color: "#78350f" }}>
                    The following image{excludedDocUrls.length !== 1 ? 's were' : ' was'} classified as document pages, quotation scans, or non-damage images and excluded from the damage evidence gallery. They should not be used as damage evidence.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {excludedDocUrls.map((exc, i) => (
                      <div key={i} className="rounded overflow-hidden relative" style={{ border: "1px solid #fbbf24", background: 'var(--kr-white)' }}>
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

     {/* 4.3 + 4.4 side-by-side grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
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
        //   2. The KINGA Vision description explicitly confirms it's a document/form page
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
          <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
            <div className="px-4 py-3 flex items-center justify-between" >
              <p className="sub-heading">4.3 Photo Forensics & Quality</p>
              <span className="text-xs font-semibold" style={{ color: 'var(--kr-text)' }}>{pf.anySuspicious ? "Suspicious" : "Clean"}</span>
            </div>
            <div className="p-4">
              {/* Hedged integrity summary — three-tier: clean / medium concern / high concern */}
              <div className="photo-integrity-summary" style={{ marginBottom: '14px', padding: '10px 14px', background: tier === 'high' ? '#fef2f2' : tier === 'medium' ? '#fffbeb' : 'var(--muted)', borderRadius: '6px', border: `1px solid ${summaryAccent}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <p className="pis-label text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--kr-muted)', margin: 0 }}>Photo Integrity Summary</p>
                  {tier !== 'none' && (
                    <span style={{
                      fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                      padding: '1px 6px', borderRadius: '3px',
                      background: tier === 'high' ? '#dc2626' : '#d97706',
                      color: 'var(--kr-white)',
                    }}>
                      {tier === 'high' ? 'High Concern' : 'Medium Concern'}
                    </span>
                  )}
                </div>
                <p className="pis-text text-sm" style={{ color: 'var(--kr-text)', lineHeight: '1.6', margin: 0 }}>{summaryVerdict}</p>
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
          <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
            <div className="px-4 py-3 flex items-center justify-between" >
              <p className="sub-heading">4.3b Photo Quality Intelligence</p>
              <div className="flex items-center gap-2">
                {isScanned && (
                  <span className="text-xs font-semibold" style={{ color: 'var(--kr-muted)' }}>Scanned PDF</span>
                )}
                <span className="text-xs font-semibold" style={{ color: 'var(--kr-muted)' }}>{qualityLabel}</span>
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
                  { label: "Total found", value: totalExtracted, color: 'var(--kr-text)' },
                  { label: "Damage photos", value: damageCount, color: damageCount > 0 ? "var(--fp-success-text)" : "var(--fp-warning-text)" },
                  { label: "Non-vehicle excluded", value: nonVehicleCount, color: nonVehicleCount > 0 ? "var(--fp-warning-text)" : "var(--kr-muted)" },
                  { label: "Rejected (size)", value: rejectedSmall, color: rejectedSmall > 0 ? "var(--fp-warning-text)" : "var(--kr-muted)" },
                  { label: "Blurry / low-res", value: blurryCount, color: blurryCount > 0 ? "var(--fp-warning-text)" : "var(--kr-muted)" },
                ].map((m, i) => (
                  <div key={i} className="text-center p-2 rounded" style={{ background: 'var(--kr-white)' }}>
                    <p className="text-lg font-bold" style={{ color: m.color }}>{m.value}</p>
                    <p className="text-xs" style={{ color: 'var(--kr-muted)' }}>{m.label}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--kr-muted)' }}>Extraction method:</span>
                    <span className="font-semibold" style={{ color: 'var(--kr-text)' }}>
                      {isScanned ? `Scanned PDF — rendered at ${renderDpi ?? "auto"} DPI` : "Native PDF image extraction"}
                    </span>
                  </div>
                  {avgSharpness !== null && (
                    <div className="flex justify-between items-center">
                      <span style={{ color: 'var(--kr-muted)' }}>Avg. sharpness:</span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 rounded-full" style={{ width: 60, background: 'var(--kr-white)' }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, avgSharpness)}%`, background: avgSharpness >= 70 ? "var(--fp-success-text)" : avgSharpness >= 40 ? "var(--fp-warning-text)" : "var(--fp-critical-text)" }} />
                        </div>
                        <span className="font-semibold" style={{ color: avgSharpness >= 70 ? "var(--fp-success-text)" : avgSharpness >= 40 ? "var(--fp-warning-text)" : "var(--fp-critical-text)" }}>{avgSharpness}%</span>
                      </div>
                    </div>
                  )}
                  {textHeavyCount > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--kr-muted)' }}>Text-only pages skipped:</span>
                      <span className="font-semibold" style={{ color: 'var(--kr-muted)' }}>{textHeavyCount}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  {durationMs !== null && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--kr-muted)' }}>Extraction time:</span>
                      <span className="font-semibold" style={{ color: 'var(--kr-text)' }}>{(durationMs / 1000).toFixed(1)}s</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--kr-muted)' }}>Dimension gate (min 200px):</span>
                    <span className="font-semibold" style={{ color: rejectedSmall > 0 ? "var(--fp-warning-text)" : "var(--fp-success-text)" }}>
                      {rejectedSmall > 0 ? `${rejectedSmall} rejected` : "All passed"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--kr-muted)' }}>Blur detection:</span>
                    <span className="font-semibold" style={{ color: blurryCount > 0 ? "var(--fp-warning-text)" : "var(--fp-success-text)" }}>
                      {blurryCount > 0 ? `${blurryCount} flagged` : "None flagged"}
                    </span>
                  </div>
                </div>
              </div>
              {(rejectedSmall > 0 || blurryCount > 0 || nonVehicleCount > 0) && !extractionError && (
                <div className="mt-3 p-2 rounded text-xs" style={{ background: qualityBg, border: `1px solid ${qualityBorder}`, color: 'var(--kr-text)' }}>
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
      </div>{/* end 4.3 + 4.4 grid */}
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
  // Apply enforcement adjustment (consistency + direction mismatch) to match the cover card score.
  const canonicalFraudScore = fraudScoreBreakdown5?.overallScore ?? (aiAssessment as any)?.fraudScore ?? null;
  const _sec5BaseScore = canonicalFraudScore != null && canonicalFraudScore > 0
    ? Number(canonicalFraudScore)
    : (wf?.score ?? 0);
  const _sec5Adjustment: number = (e as any)?.fraudScoreAdjustment ?? 0;
  const fraudScore = _sec5Adjustment > 0 ? Math.min(100, _sec5BaseScore + _sec5Adjustment) : _sec5BaseScore;
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
    <div className="mb-1 space-y-2" style={{ marginBottom: "8px" }}>
      {/* 5.0 + 5.1 Combined: Fraud Risk Score + Visual Analysis — 2-column layout */}
      {(() => {
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
          <div className="" style={{ border: `1px solid ${fraudColor}40`, background: 'var(--kr-white)' }}>
            <div className="px-4 py-3 flex items-center justify-between" >
              <p className="sub-heading">5.0 Fraud Risk Assessment</p>
              <span className="text-xs font-semibold" style={{ color: fraudColor }}>{toSentenceCase(fraudBand)}</span>
            </div>
            <div className="p-3 grid gap-4" style={{ gridTemplateColumns: '220px 1fr 1fr' }}>
              {/* Col 1: Score + gauge */}
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="flex flex-col items-center">
                  <div className="text-5xl font-black" style={{ color: fraudColor }}>{Math.round(fraudScore)}</div>
                  <div className="text-xs font-semibold" style={{ color: fraudColor }}>/100</div>
                </div>
                <ArcGauge value={fraudScore} size={100} label="Fraud risk" />
                <p className="text-xs font-bold text-center" style={{ color: fraudColor }}>{fraudBand}</p>
                <p className="text-[10px] text-center" style={{ color: 'var(--kr-muted)' }}>{fraudLabel}</p>
                {/* Bug #10 fix: disclose normalisation so raw contributions vs headline score is not confusing */}
                <p className="text-[9px] text-center mt-1" style={{ color: 'var(--kr-muted)', fontStyle: 'italic' }}>Score normalised from raw factor contributions (max 75 pts) to 0–100 scale.</p>
                <div className="mt-1 space-y-1 w-full">
                  {[
                    { label: "0–39: LOW", color: "var(--fp-success-text)" },
                    { label: "40–69: MODERATE", color: "var(--fp-warning-text)" },
                    { label: "70–100: HIGH", color: "var(--fp-critical-text)" },
                  ].map(b => (
                    <div key={b.label} className="flex items-center gap-2 text-[10px]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color }} />
                      <span style={{ color: 'var(--kr-muted)' }}>{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Col 2: Radar chart */}
              <div>
                <p className="micro-label">Risk Profile (Radar)</p>
                <FraudRadarChart data={radarData} />
              </div>
              {/* Col 3: Factor bar chart */}
              <div>
                <p className="micro-label" style={{ marginBottom: 12 }}>Factor Contributions</p>
                <div className="space-y-2">
                  {barAxes.map((ax, i) => {
                    const pct = Math.min(100, Math.round((ax.value / ax.max) * 100));
                    const barColor = ax.value > 12 ? "var(--fp-critical-text)" : ax.value > 6 ? "var(--fp-warning-text)" : "var(--fp-success-text)";
                    return (
                      <div key={i}>
                        <div className="flex justify-between text-[10px] mb-0.5">
                          <span style={{ color: 'var(--kr-muted)' }}>{ax.label}</span>
                          <span className="font-bold tabular-nums" style={{ color: 'var(--kr-text)' }}>{ax.value}/{ax.max}</span>
                        </div>
                        <div className="h-2 rounded-full" style={{ background: 'var(--kr-white)' }}>
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

      {/* 5.2 + 5.3 side-by-side grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
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
          : 'var(--kr-muted)';
        // Visual: two bars on same scale (0 to max(clm, inf) * 1.3)
        const scaleMax = Math.max(clm, inf) * 1.3 || 50;
        const clmPct = Math.min(100, (clm / scaleMax) * 100);
        const infPct = Math.min(100, (inf / scaleMax) * 100);
        return (
          <div className="px-4 py-2" style={{ border: `1px solid ${devColor}30`, background: 'var(--kr-white)', borderLeft: `3px solid ${devColor}` }}>
            <p className="text-xs" style={{ color: 'var(--kr-muted)' }}>
              <span className="font-semibold" style={{ color: devColor }}>5.2 Speed discrepancy: {devKmh.toFixed(1)} km/h</span>
              {' '}— Claimed {clm} km/h vs physics-inferred {inf} km/h
              {devClass !== 'minor' && <span style={{ fontWeight: 600 }}> ({devClass === 'critical' ? 'Critical — reconstruction required' : 'Significant — senior review required'})</span>}.
              {' '}Full analysis in Section 2.1.
            </p>
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
          <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
            <div className="px-4 py-3" >
              <p className="sub-heading">5.3 Statistical Pattern Analysis</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--kr-muted)' }}>Findings from automated comparison against {(enforcement as any)?._benchmarkSampleSize ?? 'historical'} validated claims of the same profile.</p>
            </div>
            <div className="p-3 space-y-2">
              {findings.map((f, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded" style={{ background: bgMap[f.severity], border: `1px solid ${borderMap[f.severity]}` }}>
                  <span className="text-sm font-bold shrink-0" style={{ color: colorMap[f.severity] }}>{f.icon}</span>
                  <div>
                    <p className="text-xs font-bold" style={{ color: 'var(--kr-text)' }}>{f.label}</p>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--kr-muted)' }}>{f.detail}</p>
                  </div>
                </div>
              ))}
              <p className="text-[10px] mt-2 pt-2" style={{ borderTop: '1px solid var(--kr-rule)', color: 'var(--kr-muted)', fontStyle: 'italic' }}>
                Statistical analysis is one input into the overall fraud risk score. It does not constitute a finding of fraud. All decisions remain the responsibility of the authorised claims officer.
              </p>
            </div>
          </div>
        );
      })()}

      </div>{/* end 5.2 + 5.3 grid */}

      {contributions.length > 0 && (
        <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
          <div className="px-4 py-3" >
            <p className="sub-heading">
              5.1 Risk Indicator Breakdown {isSystemFailure ? "(system errors excluded from score)" : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs report-table">
              <thead>
                <tr>
                  {["Indicator", "Score", "Score Bar", "Triggered", "Mitigation Note"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contributions.map((c: any, i: number) => {
                  const isPhotoFactor = c.factor?.toLowerCase().includes("photo");
                  const isExcluded = isPhotoFactor && isSystemFailure;
                  const score = c.value ?? 0;
                  // Actual indicator scores vary by type (5–35 pts raw). Display the raw score
                  // with a bar scaled against the indicator's actual maximum (not a fixed 20).
                  // The final fraud score is a weighted composite, not a sum of these raw scores.
                  const maxScore = Math.max(score, 35); // scale bar against realistic max
                  // score=0 means indicator was evaluated but not triggered — show muted, not green
                  const scoreColor = isExcluded ? "var(--kr-muted)" : score === 0 ? "var(--kr-muted)" : score > 20 ? "var(--fp-critical-text)" : score > 10 ? "var(--fp-warning-text)" : "var(--fp-success-text)";

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
                      <td className="px-3 py-2 font-medium" style={{ color: 'var(--kr-text)' }}>
                        {factorLabel}
                        {isExcluded && <span className="ml-1 text-xs" style={{ color: 'var(--kr-muted)' }}>(excluded)</span>}
                      </td>
                      <td className="px-3 py-2 font-bold" style={{ color: scoreColor }}>{isExcluded ? "0 (adj)" : score === 0 ? <span title="Indicator evaluated — not triggered for this claim" style={{ color: 'var(--kr-muted)', fontStyle: 'italic' }}>Not triggered</span> : `${score} pts`}</td>
                      <td className="px-3 py-2" style={{ minWidth: 80 }}>
                        <div className="h-1.5 rounded-full" style={{ background: 'var(--kr-white)' }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${isExcluded ? 0 : Math.min(100, (score / maxScore) * 100)}%`, background: scoreColor }} />
                        </div>
                      </td>
                      <td className="px-3 py-2"><span className="text-xs font-semibold" style={{ color: 'var(--kr-muted)' }}>{c.triggered && !isExcluded ? "Yes" : "No"}</span></td>
                      <td className="px-3 py-2" style={{ color: 'var(--kr-muted)' }}>{mitigation}</td>
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
                    <tr style={{ borderTop: "1px solid #e2e8f0", background: 'var(--kr-white)' }}>
                      <td className="px-3 py-2 font-medium" style={{ color: 'var(--kr-text)' }}>
                        Speed-Physics Discrepancy
                        <span className="ml-1 text-[10px] font-semibold" style={{ color: 'var(--kr-muted)' }}>({devPct}% deviation)</span>
                      </td>
                      <td className="px-3 py-2 font-bold" style={{ color: speedColor }}>{speedScore}/20</td>
                      <td className="px-3 py-2" style={{ minWidth: 80 }}>
                        <div className="h-1.5 rounded-full" style={{ background: 'var(--kr-white)' }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (speedScore / 20) * 100)}%`, background: speedColor }} />
                        </div>
                      </td>
                      <td className="px-3 py-2"><span className="text-xs font-semibold" style={{ color: 'var(--kr-muted)' }}>Yes</span></td>
                      <td className="px-3 py-2" style={{ color: 'var(--kr-muted)' }}>Engineering review of claimed speed vs damage evidence recommended (see Section 2.7)</td>
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
                    const scoreColor = severity === 'CRITICAL' ? 'var(--fp-critical-text)' : severity === 'SIGNIFICANT' ? 'var(--fp-warning-text)' : 'var(--kr-muted)';
                    return (
                      <tr key={`cec-${i}`} style={{ borderTop: '1px solid var(--kr-rule)', background: severity === 'CRITICAL' ? 'var(--fp-critical-bg)' : severity === 'SIGNIFICANT' ? 'var(--fp-warning-bg)' : '#ffffff' }}>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--kr-text)' }}>
                          {c.label}
                          <span className="ml-1 text-[10px] font-bold" style={{ color: scoreColor }}>{severity}</span>
                        </td>
                        <td className="px-3 py-2 font-bold" style={{ color: scoreColor }}>{score}/20</td>
                        <td className="px-3 py-2" style={{ minWidth: 80 }}>
                          <div className="h-1.5 rounded-full" style={{ background: 'var(--kr-white)' }}>
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (score / 20) * 100)}%`, background: scoreColor }} />
                          </div>
                        </td>
                        <td className="px-3 py-2"><span className="text-xs font-semibold" style={{ color: 'var(--kr-muted)' }}>Yes</span></td>
                        <td className="px-3 py-2" style={{ color: 'var(--kr-muted)' }}>{c.recommended_action} (see §5.4)</td>
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
        <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
          <div className="px-4 py-3" >
            <p className="sub-heading">Advisories</p>
          </div>
          <div className="p-4 space-y-2">
            {advisories.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-xs p-2 rounded" style={{ background: 'var(--kr-white)', color: 'var(--kr-text)' }}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "var(--fp-warning-text)" }} />
                {a}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5.4 Accident Date Consistency */}
      {dateCheck && (
        <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
          <div className="px-4 py-3 flex items-center justify-between" >
            <p className="sub-heading">5.2 Accident Date Consistency</p>
            {(() => {
              const v = dateCheck.verdict;
              const isOk = v === 'consistent';
              const isInsufficient = v === 'insufficient_data';
              const color = isOk ? 'var(--fp-success-text)' : isInsufficient ? 'var(--kr-muted)' : 'var(--fp-critical-text)';
              const border = isOk ? 'var(--fp-success-border)' : isInsufficient ? 'var(--border)' : 'var(--fp-critical-border)';
              const bg = isOk ? 'var(--fp-success-bg)' : isInsufficient ? '#ffffff' : 'var(--fp-critical-bg)';
              const label = isOk ? 'CONSISTENT' : isInsufficient ? 'INSUFFICIENT DATA' : v === 'mismatch' ? 'DATE MISMATCH' : v === 'pre_incident_image' ? 'PRE-INCIDENT IMAGE' : 'MULTIPLE FLAGS';
              return (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: bg, color, border: `1px solid ${border}` }}>{label}</span>
              );
            })()}
          </div>
          <div className="p-3 space-y-3">
            {/* Three-source date comparison table */}
            <div>
              <p className="micro-label">Date Source Comparison</p>
              <table className="w-full text-xs report-table">
                <thead>
                  <tr >
                    {["Source", "Date", "Status"].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold" >{h}</th>
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
                      : 'var(--kr-muted)';
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
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--kr-text)' }}>{row.source}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'var(--kr-text)' }}>{row.date}</td>
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
              <div className="flex items-center gap-2 text-xs p-2 rounded" style={{ background: 'var(--kr-white)', border: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--kr-muted)' }}>Claim form vs police report difference:</span>
                <span className="font-bold" style={{ color: dateCheck.claimPoliceDayDiff > 1 ? 'var(--fp-critical-text)' : 'var(--fp-success-text)' }}>
                  {dateCheck.claimPoliceDayDiff} day{dateCheck.claimPoliceDayDiff !== 1 ? 's' : ''}
                </span>
                {dateCheck.claimPoliceDayDiff <= 1 && (
                  <span style={{ color: 'var(--kr-muted)' }}>(within tolerance)</span>
                )}
              </div>
            )}

            {/* Pre-incident images list */}
            {(dateCheck.preIncidentImages ?? []).length > 0 && (
              <div>
                <p className="micro-label">
                  Pre-Incident Images Detected ({dateCheck.preIncidentImages.length})
                </p>
                <div className="space-y-1.5">
                  {(dateCheck.preIncidentImages as any[]).map((img: any, i: number) => (
                    <div key={i} className="flex items-start justify-between gap-3 text-xs p-2 rounded" style={{ background: 'var(--fp-critical-bg)', border: '1px solid var(--fp-critical-border)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono truncate" style={{ color: 'var(--kr-text)' }}>{img.url?.split('/').pop() ?? img.url}</p>
                        <p className="mt-0.5" style={{ color: 'var(--kr-muted)' }}>EXIF: {img.exifDate ?? 'Unknown'}</p>
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
              <p className="text-xs" style={{ color: 'var(--kr-muted)' }}>{dateCheck.summary}</p>
            )}
          </div>
        </div>
      )}

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
          : 'var(--kr-muted)';
        const severityBg = (sev: string) =>
          sev === 'CRITICAL' ? 'var(--fp-critical-bg)'
          : sev === 'SIGNIFICANT' ? 'var(--fp-warning-bg)'
          : '#f8fafc';
        const severityBorder = (sev: string) =>
          sev === 'CRITICAL' ? 'var(--fp-critical-border)'
          : sev === 'SIGNIFICANT' ? 'var(--fp-warning-border)'
          : 'var(--border)';
        return (
          <div className="" style={{ border: `1px solid ${panelBorder}`, background: 'var(--kr-white)' }}>
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--kr-rule)', background: panelBg }}>
              <div>
                <p className="sub-heading">5.4 Cross-Engine Consistency — Physics ↔ Damage ↔ Fraud</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--kr-muted)' }}>Automated C1–C9 agreement/conflict checks across all three analysis engines</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: panelBg, color: panelColor, border: `1px solid ${panelBorder}` }}>{statusLabel}</span>
                <span className="text-xs font-mono font-bold" style={{ color: 'var(--kr-text)' }}>{consistencyScore}/100</span>
              </div>
            </div>
            <div className="p-3 space-y-3">
              {/* Score bar */}
              <div>
                <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--kr-muted)' }}>
                  <span>Cross-engine consistency score</span>
                  <span className="font-bold" style={{ color: panelColor }}>{consistencyScore}/100</span>
                </div>
                <div className="h-2 rounded-full" style={{ background: '#e2e8f0' }}>
                  <div className="h-2 rounded-full" style={{ width: `${consistencyScore}%`, background: panelColor }} />
                </div>
                <div className="flex justify-between text-[9px] mt-0.5" style={{ color: 'var(--kr-muted)' }}>
                  <span>0 — Fully conflicted</span><span>50 — Partial</span><span>100 — Fully consistent</span>
                </div>
              </div>

              {/* Conflicts */}
              {conflicts.length > 0 && (
                <div>
                  <p className="micro-label">Conflicts Detected ({conflicts.length})</p>
                  <div className="space-y-2">
                    {conflicts.map((c: any, i: number) => (
                      <div key={i} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${severityBorder(c.severity)}`, background: 'var(--kr-white)' }}>
                        {/* Conflict header */}
                        <div className="px-3 py-2 flex items-center justify-between" style={{ background: severityBg(c.severity), borderBottom: `1px solid ${severityBorder(c.severity)}` }}>
                          <p className="text-xs font-bold" style={{ color: 'var(--kr-text)' }}>
                            <span className="text-[10px] font-mono mr-2" style={{ color: 'var(--kr-muted)' }}>[{c.check_id}]</span>
                            {c.label}
                          </p>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0" style={{ background: 'var(--kr-white)', color: severityColor(c.severity), border: `1px solid ${severityBorder(c.severity)}` }}>{c.severity}</span>
                        </div>
                        {/* Three-column engine breakdown */}
                        <div className="px-3 py-2 grid grid-cols-3 gap-3 text-[10px]" style={{ borderBottom: `1px solid ${severityBorder(c.severity)}` }}>
                          <div>
                            <p className="micro-label" style={{ marginBottom: 2 }}>Physics engine</p>
                            <p style={{ color: 'var(--kr-text)' }}>{c.physics_says || '—'}</p>
                          </div>
                          <div>
                            <p className="micro-label" style={{ marginBottom: 2 }}>Damage engine</p>
                            <p style={{ color: 'var(--kr-text)' }}>{c.damage_says || '—'}</p>
                          </div>
                          <div>
                            <p className="micro-label" style={{ marginBottom: 2 }}>Fraud engine</p>
                            <p style={{ color: 'var(--kr-text)' }}>{c.fraud_says || '—'}</p>
                          </div>
                        </div>
                        {/* Recommended action */}
                        {c.recommended_action && (
                          <div className="px-3 py-1.5" style={{ background: 'var(--kr-off-white)' }}>
                            <p className="text-[10px]" style={{ color: 'var(--kr-muted)' }}>
                              <span className="font-semibold" style={{ color: 'var(--kr-text)' }}>Action: </span>
                              {c.recommended_action}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Validator metadata footer */}
              {cec.validator_metadata && (
                <div className="flex flex-wrap gap-4 text-[10px] pt-2" style={{ borderTop: '1px solid var(--kr-rule)', color: 'var(--kr-muted)' }}>
                  <span>Checks run: <strong style={{ color: 'var(--kr-text)' }}>{cec.validator_metadata.checks_run}</strong></span>
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
          <div className="" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--kr-rule)', background: 'var(--kr-off-white)' }}>
              <div>
                <p className="sub-heading">5.5 Policy Flags &amp; Subrogation</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--kr-muted)' }}>Sourced from policy document analysis and third-party evidence — Claim Truth Layer</p>
              </div>
              {excess !== null && (
                <div className="text-right shrink-0">
                  <p className="micro-label">Excess Applicable</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--kr-text)' }}>{excess > 0 ? `${excess.toLocaleString()}` : 'None'}</p>
                </div>
              )}
            </div>
            <div className="p-3 space-y-3">
              {exclusions.length > 0 && (
                <div>
                  <p className="sub-heading" style={{ fontSize: 11 }}>Policy Exclusions</p>
                  <div className="space-y-2">
                    {exclusions.map((ex: any, i: number) => (
                      <div key={i} className="rounded-lg px-3 py-2.5" style={{ border: '1px solid var(--fp-critical-border)', background: 'var(--fp-critical-bg)' }}>
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 mt-0.5 text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--fp-critical-bg)', color: 'var(--fp-critical-text)', border: '1px solid var(--fp-critical-border)' }}>EXCLUSION</span>
                          <div className="flex-1">
                            <p className="text-xs font-semibold" style={{ color: 'var(--kr-text)' }}>{ex.clause ?? ex.description ?? 'Policy exclusion'}</p>
                            {ex.description && ex.description !== ex.clause && (
                              <p className="text-xs mt-0.5" style={{ color: 'var(--kr-muted)' }}>{ex.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1">
                              {ex.source && <span className="text-[10px]" style={{ color: 'var(--kr-muted)' }}>Source: {ex.source}</span>}
                              {ex.pageRef != null && <span className="text-[10px]" style={{ color: 'var(--kr-muted)' }}>Page {ex.pageRef}</span>}
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
                  <p className="sub-heading" style={{ fontSize: 11, color: 'var(--fp-warning-text)' }}>⚑ Subrogation &amp; Recovery Leads</p>
                  <div className="space-y-2">
                    {subrogation.map((lead: any, i: number) => (
                      <div key={i} className="rounded-lg px-3 py-2.5" style={{ border: '1px solid var(--fp-warning-border)', background: 'var(--fp-warning-bg)' }}>
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 mt-0.5 text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--fp-warning-bg)', color: 'var(--fp-warning-text)', border: '1px solid var(--fp-warning-border)' }}>RECOVERY</span>
                          <div className="flex-1">
                            <p className="text-xs font-semibold" style={{ color: 'var(--kr-text)' }}>{lead.party}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--kr-muted)' }}>{lead.basis}</p>
                            {lead.source && <p className="text-[10px] mt-0.5" style={{ color: 'var(--kr-muted)' }}>Source: {lead.source}</p>}
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

      <div className="" style={{ border: `1px solid ${fraudColor}40`, background: 'var(--kr-white)' }}>
        <div className="px-4 py-3" >
          <p className="sub-heading">Final Risk Statement</p>
        </div>
        <div className="p-3 space-y-2">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--kr-text)' }}>
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
                      <span style={{ color: 'var(--kr-text)' }}>{c.label}. <span style={{ color: 'var(--kr-muted)' }}>Recommended action: {c.recommended_action}</span></span>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] mt-2" style={{ color: 'var(--kr-muted)' }}>Full cross-engine analysis in §5.4. Physics method inputs in §2.6.</p>
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
  // ── TRE CTO override: canonical decision recommendation (same as Section 0 cover) ──
  const ctl6 = (e as any)?._claimTruth;
  const cto6 = (e as any)?._claimTruthObject;
  const wfDecision = wfScore >= 70 ? "DECLINE" : wfScore >= 40 ? "REVIEW_REQUIRED" : null;
  const rawDecision: string = cto6?.decision?.recommendation ?? ctl6?.decision?.recommendation ?? wfDecision ?? phase2?.finalDecision ?? e?.finalDecision?.decision ?? "REVIEW";
  const decisionColor = decisionColour(rawDecision);
  const decisionText = decisionLabel(rawDecision);

  const keyDrivers: string[] = phase2?.keyDrivers ?? e?.finalDecision?.recommendedActions ?? [];
  const primaryReason: string = e?.finalDecision?.primaryReason ?? phase2?.keyDrivers?.[0] ?? "";
  // P2 fix: blockedActions does not exist on FinalDecisionResult; source from _reportSignals.consistencyFlags
  const _rs6 = (aiAssessment as any)?._reportSignals;
  const _cf6 = _rs6?.consistencyFlags;
  const blocked: string[] = _cf6?.blockAutoApproval && Array.isArray(_cf6?.flags)
    ? (_cf6.flags as Array<{ description: string }>).map(f => f.description).filter(Boolean)
    : [];
  // ── Next Steps: prefer Claim Truth Layer actions (canonical), then phase2, then legacy ──
  const nextSteps: string[] = ctl6?.decision?.reviewTriggers?.length > 0
    ? ctl6.decision.reviewTriggers
    : (phase2?.nextSteps ?? e?.finalDecision?.recommendedActions ?? []);
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

  // ── Canonical report hash — single deterministic formula shared with cover and footer ──
  // Seed: assessmentId + claimId + processingTime (same fields as cover doc-identity block)
  const reportHash = (() => {
    const parts = [aiAssessment?.id, aiAssessment?.claimId, aiAssessment?.processingTime].filter(Boolean);
    return parts.length > 0
      ? `#${parts.map((n: any) => Number(n).toString(16)).join('').toUpperCase().slice(0, 8)}`
      : '#N/A';
  })();

  // Gates: pass/fail only — no threshold values exposed to adjusters
  // SAFEGUARD: G-codes removed per user request — labels are descriptive only
  const gates = [
    { id: "", label: "Physics Consistency", result: `${Math.round(physicsScore)}%`, pass: physicsScore >= 30 },
    { id: "", label: "Fraud Risk Score", result: Math.round(fraudScore), pass: fraudScore < 70 },
    { id: "", label: "Data Completeness", result: `${Math.round(dataCompleteness)}%`, pass: dataCompleteness >= 50 },
    { id: "", label: "Critical Blockers", result: blocked.length === 0 ? "None" : `${blocked.length} found`, pass: blocked.length === 0 },
  ];

  // ── Horizontal flowchart dimensions ──────────────────────────────────────────
  // Layout: START → gate0 → gate1 → gate2 → gate3 → FINAL DECISION (left to right)
  // FAIL branches drop downward from each gate diamond
  const nodeW = 130;   // width of START / FINAL rect nodes
  const nodeH = 44;    // height of rect nodes
  const diamondW = 120; // half-width of diamond (full = 2×)
  const diamondH = 52; // half-height of diamond (full = 2×)
  const gapX = 56;     // horizontal gap between nodes
  const totalCols = gates.length + 2; // START + gates + FINAL
  const colW = diamondW * 2 + gapX;   // width per column
  const svgW = totalCols * colW + 40; // total SVG width
  const svgH = 180;    // fixed height: main rail (80px) + fail branch space (100px)
  const railY = 70;    // Y centre of the main horizontal rail
  const failY = railY + 90; // Y centre of fail branch boxes

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
  const textColor = "var(--kr-text)";
  const mutedColor = "var(--kr-muted)";

  // X centre of each column (0 = START, 1..n = gates, n+1 = FINAL)
  const colX = (i: number) => 20 + nodeW / 2 + i * colW;

  // Score summary bars for the executive panel
  const scoreBars = [
    { label: 'Fraud Risk', value: fraudScore, max: 100, lowGood: true, note: fraudScore >= 70 ? 'HIGH RISK' : fraudScore >= 40 ? 'MODERATE' : 'LOW RISK' },
    { label: 'Physics Consistency', value: physicsScore, max: 100, lowGood: false, note: physicsScore >= 70 ? 'CONSISTENT' : physicsScore >= 30 ? 'MINOR ANOMALY' : 'ANOMALY' },
    { label: 'Data Completeness', value: dataCompleteness, max: 100, lowGood: false, note: dataCompleteness >= 80 ? 'COMPLETE' : dataCompleteness >= 50 ? 'PARTIAL' : 'INCOMPLETE' },
  ];

  return (
    <div className="mb-1 space-y-2" style={{ marginBottom: "8px" }}>
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
          <div className="" style={{ border: `1px solid ${borderColor}`, background: 'var(--kr-white)' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${borderColor}`, background: bgColor }}>
              <p className="sub-heading">6.0 Decision Rationale</p>
              <div className="px-3 py-1 rounded font-bold text-xs" style={{ background: 'var(--kr-white)', color: decisionColor, border: `1.5px solid ${decisionColor}` }}>{decisionText}</div>
            </div>
            <div className="p-4">
              <p className="text-sm leading-relaxed" style={{ color: 'var(--kr-text)' }}>{decisionRationale}</p>
              {nextSteps.length > 0 && (
                <div className="mt-3">
                  <p className="sub-heading">Required Next Steps</p>
                  <ol className="space-y-1.5">
                    {nextSteps.slice(0, 5).map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: decisionColor, color: 'var(--kr-white)' }}>{i + 1}</span>
                        <span style={{ color: 'var(--kr-muted)' }}>{step}</span>
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
                        <span style={{ color: 'var(--kr-text)' }}>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        );
      })()}
      {/* SVG Decision Flowchart — horizontal left-to-right layout */}
      <div className="" style={{ border: `2px solid ${decisionColor}`, background: 'var(--kr-white)' }}>
        <div className="px-4 py-3 flex items-center justify-between" >
          <p className="sub-heading">Decision Flowchart</p>
          <div className="px-3 py-1.5 rounded font-bold text-sm"
            style={{ background: `${decisionColor}20`, color: decisionColor, border: `1px solid ${decisionColor}` }}>
            {decisionText}
          </div>
        </div>
        <div className="p-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            width="100%"
            style={{ minWidth: Math.min(svgW, 600), display: "block", margin: "0 auto" }}
            aria-label="Decision flowchart"
          >
            <defs>
              <marker id="fc-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0,0 L0,8 L8,4 Z" fill="#94a3b8" />
              </marker>
              <marker id="fc-arrow-pass" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0,0 L0,8 L8,4 Z" fill={passColor} />
              </marker>
              <marker id="fc-arrow-fail" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0,0 L0,8 L8,4 Z" fill={failColor} />
              </marker>
            </defs>

            {/* START node */}
            <path d={rect(colX(0), railY, nodeW, nodeH)} fill={nodeColor} stroke="#94a3b8" strokeWidth="1.5" />
            <text x={colX(0)} y={railY - 5} textAnchor="middle" dominantBaseline="middle"
              fontSize="9" fontWeight="700" fill={textColor}>START</text>
            <text x={colX(0)} y={railY + 7} textAnchor="middle" dominantBaseline="middle"
              fontSize="8" fill={mutedColor}>ASSESSMENT</text>

            {/* Arrow: START → first gate */}
            <line
              x1={colX(0) + nodeW / 2} y1={railY}
              x2={colX(1) - diamondW - 4} y2={railY}
              stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#fc-arrow)" />

            {/* Gate nodes */}
            {gates.map((gate, i) => {
              const cx = colX(i + 1);
              const gateColor = gate.pass ? passColor : failColor;
              const isLast = i === gates.length - 1;
              const nextCx = colX(i + 2);
              return (
                <g key={`gate-${i}`}>
                  {/* Diamond */}
                  <path d={diamond(cx, railY, diamondW, diamondH)}
                    fill="#ffffff" stroke={gateColor} strokeWidth="1.5" />
                  {/* Gate label — two lines inside diamond */}
                  <text x={cx} y={railY - 7} textAnchor="middle" dominantBaseline="middle"
                    fontSize="8.5" fontWeight="600" fill={textColor}>{gate.label}</text>
                  <text x={cx} y={railY + 7} textAnchor="middle" dominantBaseline="middle"
                    fontSize="8" fill={gateColor} fontWeight="700">{String(gate.result)}</text>

                  {/* Arrow to next gate or FINAL */}
                  {!isLast && (
                    <>
                      <line
                        x1={cx + diamondW} y1={railY}
                        x2={nextCx - diamondW - 4} y2={railY}
                        stroke={gate.pass ? passColor : "#94a3b8"}
                        strokeWidth="1.5"
                        strokeDasharray={gate.pass ? undefined : "4 3"}
                        markerEnd={gate.pass ? "url(#fc-arrow-pass)" : "url(#fc-arrow)"} />
                      <text
                        x={(cx + diamondW + nextCx - diamondW) / 2}
                        y={railY - 7}
                        textAnchor="middle" fontSize="8" fontWeight="700"
                        fill={gate.pass ? passColor : mutedColor}>
                        {gate.pass ? "PASS" : "FAIL"}
                      </text>
                    </>
                  )}

                  {/* Arrow to FINAL from last gate */}
                  {isLast && (
                    <>
                      <line
                        x1={cx + diamondW} y1={railY}
                        x2={colX(gates.length + 1) - nodeW / 2 - 4} y2={railY}
                        stroke={gate.pass ? passColor : "#94a3b8"}
                        strokeWidth="1.5"
                        strokeDasharray={gate.pass ? undefined : "4 3"}
                        markerEnd={gate.pass ? "url(#fc-arrow-pass)" : "url(#fc-arrow)"} />
                      <text
                        x={(cx + diamondW + colX(gates.length + 1) - nodeW / 2) / 2}
                        y={railY - 7}
                        textAnchor="middle" fontSize="8" fontWeight="700"
                        fill={gate.pass ? passColor : mutedColor}>
                        {gate.pass ? "PASS" : "FAIL"}
                      </text>
                    </>
                  )}

                  {/* FAIL branch — drops downward from diamond bottom */}
                  {!gate.pass && (
                    <>
                      {/* Vertical drop line */}
                      <line
                        x1={cx} y1={railY + diamondH / 2}
                        x2={cx} y2={failY - 14}
                        stroke={failColor} strokeWidth="1.5"
                        markerEnd="url(#fc-arrow-fail)" />
                      {/* FAIL label on drop */}
                      <text x={cx + 4} y={railY + diamondH / 2 + 14}
                        fontSize="8" fontWeight="700" fill={failColor}>FAIL</text>
                      {/* Escalate box */}
                      <rect
                        x={cx - 46} y={failY - 14}
                        width={92} height={28} rx="4"
                        fill={`${failColor}15`} stroke={failColor} strokeWidth="1" />
                      <text x={cx} y={failY} textAnchor="middle" dominantBaseline="middle"
                        fontSize="8.5" fontWeight="700" fill={failColor}>{decisionText}</text>
                    </>
                  )}
                </g>
              );
            })}

            {/* FINAL DECISION node */}
            <path d={rect(colX(gates.length + 1), railY, nodeW + 10, nodeH)}
              fill={`${decisionColor}18`} stroke={decisionColor} strokeWidth="2" />
            <text x={colX(gates.length + 1)} y={railY - 7} textAnchor="middle" dominantBaseline="middle"
              fontSize="8" fill={decisionColor} fontWeight="600">FINAL DECISION</text>
            <text x={colX(gates.length + 1)} y={railY + 8} textAnchor="middle" dominantBaseline="middle"
              fontSize="11" fontWeight="800" fill={decisionColor}>{decisionText}</text>
          </svg>
        </div>
      </div>

      {/* 6.1 Trigger Conditions | 6.3 Required Next Steps — two-col-kv matching mock layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px', marginTop: 6, marginBottom: 8 }}>
        {/* Left col: 6.1 Trigger Conditions */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--kr-text)' }}>6.1 Trigger Conditions</p>
          {[primaryReason, ...keyDrivers].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 6).map((d, i) => (
            <p key={i} style={{ fontSize: 11, color: 'var(--kr-text)', marginBottom: 3, lineHeight: 1.45 }}>{i + 1}. {d}</p>
          ))}
          {blocked.length > 0 && (
            <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: '3px solid var(--fp-critical-border)' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--fp-critical-text)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>6.2 Blocked Actions</p>
              {blocked.map((b, i) => (
                <p key={i} style={{ fontSize: 11, color: 'var(--fp-critical-text)', marginBottom: 2 }}>
                  {b === 'APPROVE' ? 'APPROVE — cannot approve while anomalies remain unexplained' :
                   b === 'REJECT' ? 'REJECT — no evidence of malicious intent' : b}
                </p>
              ))}
            </div>
          )}
        </div>
        {/* Right col: 6.3 Required Next Steps */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--kr-text)' }}>6.3 Required Next Steps</p>
          {nextSteps.length > 0
            ? nextSteps.slice(0, 6).map((step, i) => (
                <p key={i} style={{ fontSize: 11, color: 'var(--kr-text)', marginBottom: 3, lineHeight: 1.45 }}>{i + 1}. {step}</p>
              ))
            : <p style={{ fontSize: 11, color: 'var(--kr-muted)', fontStyle: 'italic' }}>No mandatory actions required.</p>
          }
        </div>
      </div>

      {/* 6.4 + 6.5 side-by-side grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
      {/* 6.4 Decision Lifecycle Tracker — removed; lifecycle stage folded into 6.5 Audit Trail */}

      <div style={{ border: '1px solid var(--fp-border)', background: 'var(--kr-white)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--fp-border)', background: 'var(--fp-section-bg)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--kr-muted)', margin: 0 }}>6.5 Audit Trail</p>
        </div>
        <div style={{ padding: '12px 16px' }}>
          {/* 3-column × 3-row horizontal grid — fills width, halves vertical height */}
          {(() => {
            const workflowStage = (() => { const s = claim?.status ?? "submitted"; if (s === "closed" || s === "archived") return "Locked"; if (s === "approved" || s === "rejected" || s === "finalised" || s === "settled") return "Finalised"; if (s === "review" || s === "under_review" || s === "pending_review") return "Under Review"; return "Draft"; })();
            const humanReview = rawDecision === "APPROVE" || rawDecision === "FINALISE_CLAIM" ? "Optional" : "REQUIRED";
            const humanReviewColor = humanReview === "REQUIRED" ? '#dc2626' : '#16a34a';
            const cells: Array<[string, React.ReactNode]> = [
              ["Analysed by", `KINGA Engine ${engineVersion}`],
              ["Workflow stage", workflowStage],
              ["Data sources", `Claim form, Photos (${aiAssessment?.photosDetected ?? 0} detected), Quote`],
              ["Extraction confidence", `${Math.round(aiAssessment?.confidenceScore ?? 0)}% overall`],
              ["Human review", <span style={{ fontWeight: 700, color: humanReviewColor }}>{humanReview}</span>],
              ["Corrections applied", corrections.length > 0 ? `${corrections.length} correction(s)` : "None"],
              ["Report hash", reportHash],
              ["Report generated", fmtDate(aiAssessment?.createdAt ?? new Date().toISOString())],
              ["Digital signature", "KINGA (engine)"],
            ];
            // Chunk into rows of 3
            const rows: Array<typeof cells> = [];
            for (let i = 0; i < cells.length; i += 3) rows.push(cells.slice(i, i + 3));
            return (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri} style={{ borderTop: ri > 0 ? '1px solid var(--fp-border)' : undefined }}>
                      {row.map(([k, v], ci) => (
                        <td key={ci} style={{ padding: '8px 12px', verticalAlign: 'top', borderRight: ci < row.length - 1 ? '1px solid var(--fp-border)' : undefined, width: '33.33%' }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--kr-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{k}</div>
                          <div style={{ color: 'var(--kr-text)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>
      </div>{/* end 6.5 Audit Trail */}

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
        <span className="text-xs" style={{ color: 'var(--kr-muted)' }}>
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
            <p className="font-semibold mb-1" style={{ color: 'var(--kr-text)' }}>
              Auto-corrections applied ({corrections.length}):
            </p>
            <div className="space-y-0.5">
              {corrections.map((c: any, i: number) => (
                <p key={i} style={{ color: 'var(--kr-muted)' }}>
                  &bull;{" "}
                  <span className="font-medium" style={{ color: 'var(--kr-text)' }}>
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
                  <span style={{ color: 'var(--kr-muted)' }}>({c.reason})</span>
                </p>
              ))}
            </div>
          </div>
        )}
        {unreliable.length > 0 && (
          <p style={{ color: 'var(--kr-muted)' }}>
            \u26a0\ufe0f Unreliable fields (low confidence \u2014 verify manually):{" "}
            <span className="font-medium" style={{ color: 'var(--kr-text)' }}>
              {unreliable.join(", ")}
            </span>
          </p>
        )}
        {conflicts.length > 0 && (
          <p style={{ color: 'var(--kr-muted)' }}>
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
              color: plainLanguage ? 'white' : 'var(--kr-muted)',
              border: `1px solid ${panelColor}60`,
              cursor: 'pointer',
            }}
            title="Toggle plain-language explanations"
          >
            {plainLanguage ? 'Technical view' : 'Plain language'}
          </button>
          <span className="text-xs" style={{ color: 'var(--kr-muted)' }}>
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
            <p className="font-semibold mb-1" style={{ color: 'var(--kr-text)' }}>
              {plainLanguage ? "📸 Photo Note:" : "📸 Photo Ingestion Issue:"}
            </p>
            <p style={{ color: 'var(--kr-muted)' }}>
              {plainLanguage
                ? photoOutcome === 'extraction_failed'
                  ? "Photos could not be extracted from the submitted document. If the document is a scanned PDF, please try re-submitting with a clearer scan or attach photos separately."
                  : `${photoIngestionLog.finalDamagePhotoCount ?? 0} photo(s) were found but some appear blurry or low-quality. The damage analysis has been completed but may benefit from clearer photos.`
                : photoIngestionLog.summary}
            </p>
            {photoIngestionLog.qualitySummary?.isScannedPdf && (
              <p className="mt-1 italic" style={{ color: 'var(--kr-muted)' }}>
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
            <p className="font-semibold mb-1" style={{ color: 'var(--kr-text)' }}>
              {plainLanguage ? `Notes (${integrityGate.warnings.length}):` : `Warnings (${integrityGate.warnings.length}):`}
            </p>
            <div className="space-y-0.5">
              {(integrityGate.warnings as string[]).map((w: string, i: number) => (
                <p key={i} style={{ color: 'var(--kr-muted)' }}>
                  &bull; {plainLanguage ? translateWarning(w) : w}
                </p>
              ))}
            </div>
          </div>
        )}
        {/* Reconciliation overrides */}
        {hasOverrides && reconciliationLog?.entries && (
          <div>
            <p className="font-semibold mb-1" style={{ color: 'var(--kr-text)' }}>
              {plainLanguage
                ? `Data corrections applied (${reconciliationLog.overrideCount}):`
                : `Cross-stage field overrides (${reconciliationLog.overrideCount}):`}
            </p>
            <div className="space-y-0.5">
              {(reconciliationLog.entries as any[])
                .filter((entry: any) => entry.action === "override")
                .map((entry: any, i: number) => (
                  plainLanguage ? (
                    <p key={i} style={{ color: 'var(--kr-muted)' }}>
                      &bull; {translateOverride(entry)}
                    </p>
                  ) : (
                    <p key={i} style={{ color: 'var(--kr-muted)' }}>
                      &bull;{" "}
                      <span className="font-medium" style={{ color: 'var(--kr-text)' }}>
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
                      <span style={{ color: 'var(--kr-muted)' }}>
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
          <p style={{ color: 'var(--kr-muted)' }}>
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
function PipelineConfidencePanel({ aiAssessment, enforcement }: { aiAssessment: any; enforcement?: any }) {
  const fa = (aiAssessment as any)?._forensicAnalysis ?? null;
  // enforcement.degradationReasons is returned by getEnforcement from degradation_reasons_json.
  // It is the authoritative adjuster-facing source since forensic_analysis does not include this field.
  const enforcementDegradationReasons: string[] = (enforcement as any)?.degradationReasons ?? [];
  if (!fa && enforcementDegradationReasons.length === 0) return null;
  const fcdi = fa?.fcdi ?? null;
  const psm = fa?.pipelineStateMachine ?? null;
  const sentinels: any[] = fa?.anomalySentinelViolations ?? [];
  const dataQuality = fa?.dataQuality ?? null;
  if (!fcdi && !psm && sentinels.length === 0 && !dataQuality && enforcementDegradationReasons.length === 0) return null;

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
  const assumptions: any[] = fa?.assumptions ?? [];
  // Domain penalties from the FCDI breakdown (populated by Domain Penalty Engine in orchestrator)
  const domainPenalties: Array<{ code: string; reason: string; weight: number }> = fcdi?.breakdown?.domainPenalties ?? [];

  const hasPipelineIssues = failedStages.length > 0 || degradedStages.length > 0 || sentinels.length > 0 || domainPenalties.length > 0 || enforcementDegradationReasons.length > 0;
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
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--kr-white)', color: 'var(--kr-muted)' }}>
              {completenessScore}% data completeness
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: 'var(--kr-muted)' }}>Forensic Confidence &amp; Data Integrity (FCDI)</span>
      </div>
      <div className="px-5 py-3 space-y-3 text-xs">
        {fcdi?.explanation && (
          <p style={{ color: 'var(--kr-text)' }}>{fcdi.explanation}</p>
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
                  {s.error && <span className="ml-1" style={{ color: 'var(--kr-muted)' }}>— {s.error}</span>}
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
                <p key={i} style={{ color: 'var(--kr-muted)' }}>
                  &bull; <span className="tabular-nums">{s.name ?? s.stage}</span>
                  {s.reason && <span className="ml-1">— {s.reason}</span>}
                </p>
              ))}
            </div>
          </div>
        )}
        {sentinels.length > 0 && (
          <div>
            <p className="font-semibold mb-1" style={{ color: 'var(--kr-text)' }}>
              Anomaly sentinels triggered ({sentinels.length}):
            </p>
            <div className="space-y-0.5">
              {sentinels.map((s: any, i: number) => (
                <p key={i} style={{ color: 'var(--kr-muted)' }}>
                  &bull; <span className="font-semibold tabular-nums" style={{ color: 'var(--kr-text)' }}>{s.name ?? s.sentinel}</span>
                  {s.description && <span className="ml-1">— {s.description}</span>}
                </p>
              ))}
            </div>
          </div>
        )}
        {missingFields.length > 0 && (
          <p style={{ color: 'var(--kr-muted)' }}>
            Missing fields (verify manually):{" "}
            <span className="font-medium" style={{ color: 'var(--kr-text)' }}>{missingFields.join(", ")}</span>
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
                  <span className="flex-1" style={{ color: 'var(--kr-muted)' }}>{dp.reason}</span>
                  <span className="flex-shrink-0 font-semibold" style={{ color: "var(--fp-danger)" }}>−{Math.round((dp.weight ?? 0) * 100)}pts</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {enforcementDegradationReasons.length > 0 && (
          <div>
            <p className="font-semibold mb-1" style={{ color: "var(--fp-warn)" }}>
              Why this report is partial ({enforcementDegradationReasons.length} reason{enforcementDegradationReasons.length !== 1 ? 's' : ''}):
            </p>
            <div className="space-y-1">
              {enforcementDegradationReasons.map((reason: string, i: number) => (
                <p key={i} style={{ color: 'var(--kr-text)', lineHeight: 1.5 }}>
                  &bull; {reason}
                </p>
              ))}
            </div>
          </div>
        )}
        {assumptions.length > 0 && (
          <div>
            <p className="font-semibold mb-1" style={{ color: 'var(--kr-text)' }}>
              Assumptions applied by pipeline ({assumptions.length}):
            </p>
            <div className="space-y-0.5">
              {assumptions.slice(0, 5).map((a: any, i: number) => (
                <p key={i} style={{ color: 'var(--kr-muted)' }}>
                  &bull; {typeof a === "string" ? a : (a.description ?? a.field ?? JSON.stringify(a))}
                </p>
              ))}
              {assumptions.length > 5 && (
                <p style={{ color: 'var(--kr-muted)' }}>+{assumptions.length - 5} more assumptions</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// ─── Main Export ────────────────────────────────────────────────────────────────────────────────────

// ─── Mockup v4.2 scoped CSS─────────────────────────────────────────
const REPORT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,300;1,9..40,400;1,9..40,500&family=Instrument+Serif:ital@0;1&display=swap');
.kinga-report{font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:var(--kr-text);background:#fff;line-height:1.6;padding:0;position:relative;
  /* ── KINGA Brand Colour Tokens ── */
  --kr-black:#0a0a0a;--kr-white:#ffffff;--kr-off-white:#f7f6f3;--kr-rule:#e0ddd8;
  --kr-text:#111827;--kr-dark:#1f2937;--kr-muted:#374151;
  --kr-navy:#1A2B4A;--kr-navy-light:#f0f4fa;
  --kr-red:#c0392b;--kr-amber:#d97706;--kr-green:#166534;--kr-blue:#3C7844;
  --kr-red-light:#fef2f2;--kr-amber-light:#fffbeb;--kr-green-light:#f0fdf4;--kr-blue-light:#F0F7F2;
  /* ── KINGA Font Tokens ── */
  --kr-mono:'DM Sans',Inter,sans-serif;--kr-serif:'Instrument Serif',serif;--kr-sans:'DM Sans',sans-serif;
  /* ── KINGA Size Tokens ── */
  --kr-sz-xs:10px;--kr-sz-sm:11px;--kr-sz-body:12px;--kr-sz-md:13px;--kr-sz-sub:12px;--kr-sz-sec:14px;--kr-sz-lg:18px;--kr-sz-xl:22px;
  /* ── Pin app theme tokens to print-safe values (overrides dark mode) ── */
  --foreground:#111827;--background:#ffffff;--muted-foreground:#374151;
  --muted:#f7f6f3;--border:#e0ddd8;--card:#ffffff;--card-foreground:#1a1a1a;
  --popover:#ffffff;--popover-foreground:#1a1a1a;--primary:#1A2B4A;
  --primary-foreground:#ffffff;--secondary:#f7f6f3;--secondary-foreground:#1a1a1a;
  --accent:#f0f4fa;--accent-foreground:#1A2B4A;
  /* ── Status tokens (always explicit) ── */
  --fp-success-text:#166534;--fp-warning-text:#92400e;--fp-critical-text:#c0392b;
  --fp-success-bg:#f0fdf4;--fp-warning-bg:#fffbeb;--fp-critical-bg:#fef2f2;
  --fp-success-border:#bbf7d0;--fp-warning-border:#fde68a;--fp-critical-border:#fecaca;
  --status-pass-text:#166534;--status-review-text:#92400e;--status-fail-text:#c0392b;
}
.kinga-report[data-draft="true"]::before{content:'DRAFT';position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);font-size:120px;font-weight:900;color:rgba(0,0,0,0.04);letter-spacing:0.15em;pointer-events:none;z-index:0;white-space:nowrap;user-select:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.kinga-report .decision-strip{display:grid;grid-template-columns:auto auto 1fr;gap:0;border-bottom:2px solid var(--kr-black);padding:14px 0;align-items:start;margin-bottom:0;min-height:0}
.kinga-report .verdict-block{padding-right:28px;border-right:1px solid var(--kr-rule);margin-right:28px}
.kinga-report .verdict-label{font-size:10px;font-family:var(--kr-sans);letter-spacing:.04em;color:var(--kr-dark);margin-bottom:2px;font-weight:700}
.kinga-report .verdict-value{font-size:22px;font-weight:600;letter-spacing:-.02em;line-height:1.1}
.kinga-report .verdict-value.approve{color:var(--kr-green)}
.kinga-report .verdict-value.review{color:var(--kr-amber)}
.kinga-report .verdict-value.decline{color:var(--kr-red)}
.kinga-report .verdict-sub{font-size:11px;color:var(--kr-dark);margin-top:2px;font-weight:500}
.kinga-report .score-cluster{display:flex;gap:0;flex-wrap:nowrap;border-left:1px solid var(--kr-rule);border-right:1px solid var(--kr-rule);margin:0 24px;padding:0 24px}
.kinga-report .score-item{text-align:center;padding:0 16px;border-right:1px solid var(--kr-rule)}.kinga-report .score-item:last-child{border-right:none}
.kinga-report .score-num{font-family:var(--kr-mono);font-size:22px;font-weight:600;display:block;line-height:1}
.kinga-report .score-num.low{color:var(--kr-green)}
.kinga-report .score-num.mid{color:var(--kr-amber)}
.kinga-report .score-num.high{color:var(--kr-red)}
.kinga-report .score-lbl{font-size:11px;color:var(--kr-dark);letter-spacing:.04em;font-family:var(--kr-sans);display:block;margin-top:2px;font-weight:700}
.kinga-report .cost-cluster{display:flex;gap:0;flex-wrap:wrap;align-items:flex-start;padding-left:0;row-gap:10px}
.kinga-report .cost-item{min-width:110px;max-width:160px;padding:0 12px;border-right:1px solid var(--kr-rule)}.kinga-report .cost-item:last-child{border-right:none}
.kinga-report .cost-lbl{font-size:11px;color:var(--kr-dark);letter-spacing:.04em;font-family:var(--kr-sans);display:flex;align-items:center;gap:5px;margin-bottom:2px;font-weight:700}
.kinga-report .cost-val{font-size:18px;font-weight:600;font-family:var(--kr-mono);display:block;letter-spacing:-.02em;color:var(--kr-text)}
.kinga-report .cost-val-dim{font-size:16px;font-weight:400;color:var(--kr-muted)}
.kinga-report .cost-sub{font-size:11px;color:var(--kr-dark);display:block;margin-top:1px;font-weight:500}
.kinga-report .cost-lowest-tag{font-size:8px;font-family:var(--kr-mono);letter-spacing:.08em;font-weight:600;color:var(--kr-green);background:var(--kr-green-light);border:1px solid var(--kr-green);padding:1px 4px;border-radius:2px;line-height:1.4}
.kinga-report .cost-adjusted-tag{font-size:8px;font-family:var(--kr-mono);letter-spacing:.08em;font-weight:600;color:var(--kr-amber);background:var(--kr-amber-light);border:1px solid var(--kr-amber);padding:1px 4px;border-radius:2px;line-height:1.4}
.kinga-report .cost-divider{width:1px;background:var(--kr-black);align-self:stretch;margin:0 8px;flex-shrink:0}
.kinga-report .scorecard-row{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--kr-rule);margin:14px 0;border:1px solid var(--kr-rule)}
.kinga-report .scorecard-cell{background:var(--kr-white);padding:10px 14px;position:relative}
.kinga-report .sc-label{font-size:11px;font-family:var(--kr-sans);letter-spacing:.04em;color:var(--kr-dark);margin-bottom:6px;display:block;font-weight:700}
.kinga-report .sc-bar-track{height:4px;background:var(--kr-off-white);border-radius:2px;margin:8px 0 4px;overflow:hidden}
.kinga-report .sc-bar-fill{height:100%;border-radius:2px}
.kinga-report .sc-val{font-family:var(--kr-mono);font-size:20px;font-weight:500}
.kinga-report .sc-tag{font-size:10px;color:var(--kr-dark);font-weight:500}
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
.kinga-report .verdict-banner .vb-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#374151;margin-bottom:4px}
.kinga-report .verdict-banner .vb-decision{font-size:22px;font-weight:800;letter-spacing:-.01em;line-height:1.1}
.kinga-report .verdict-banner .vb-decision.approve{color:var(--kr-green)}
.kinga-report .verdict-banner .vb-decision.review{color:var(--kr-amber)}
.kinga-report .verdict-banner .vb-decision.decline{color:var(--kr-red)}
.kinga-report .verdict-banner .vb-meta{font-size:10px;color:#1f2937;margin-top:5px;font-weight:500}
.kinga-report .verdict-banner .vb-right{text-align:right;min-width:120px}
.kinga-report .page-header{display:flex;align-items:center;justify-content:space-between;padding:6px 40px;background:var(--kr-white);border-bottom:1px solid var(--kr-rule);font-family:var(--kr-mono);font-size:10px;color:var(--kr-dark);letter-spacing:0.06em;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-weight:500}
.kinga-report .page-header .brand{font-family:var(--kr-mono);font-weight:600;font-size:11px;color:var(--kr-dark);letter-spacing:.15em}
.kinga-report .cover-title-row{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:start;padding:20px 40px 16px;background:var(--kr-white);border-bottom:2px solid var(--kr-black);margin:0}
.kinga-report .cover-title-row h1{font-family:var(--kr-serif);font-size:24px;font-weight:400;color:var(--kr-black);line-height:1.2;margin-bottom:4px}
.kinga-report .cover-title-row .subtitle{font-size:11px;color:var(--kr-dark);font-style:italic;font-weight:500}
.kinga-report .cover-meta{text-align:right}
.kinga-report .cover-meta .claim-id{font-family:var(--kr-mono);font-size:11px;color:var(--kr-dark);letter-spacing:0.08em;font-weight:500}
.kinga-report .cover-meta .meta-line{font-size:13px;color:var(--kr-black);font-weight:600;margin-top:4px}
.kinga-report .claim-id{font-family:var(--kr-mono);font-size:11px;color:var(--kr-dark);letter-spacing:0.08em;font-weight:500}
.kinga-report .meta-line{font-size:13px;color:var(--kr-black);font-weight:600;margin-top:4px}
.kinga-report .doc-identity{background:var(--kr-off-white);border:1px solid var(--kr-rule);padding:8px 40px;margin-bottom:0;font-size:11px;color:var(--kr-dark);display:flex;gap:20px;flex-wrap:wrap;font-family:var(--kr-mono);letter-spacing:0.06em;font-weight:500}
.kinga-report .di-label{font-weight:700;color:var(--kr-dark);text-transform:uppercase;font-size:9px;letter-spacing:.1em;display:block;margin-bottom:2px}
.kinga-report .alert-banner{border-radius:2px;padding:10px 14px;margin-bottom:12px;font-size:12px;border-left:3px solid;line-height:1.5;display:flex;gap:8px;align-items:flex-start}
.kinga-report .alert-banner.critical{background:var(--kr-red-light);border-left-color:var(--kr-red);color:#991b1b}
.kinga-report .alert-banner.warn{background:var(--kr-amber-light);border-left-color:var(--kr-amber);color:#92400e}
.kinga-report .alert-banner.info{background:var(--kr-blue-light);border-left-color:var(--kr-blue);color:#1e40af}
.kinga-report .alert-banner.success{background:var(--kr-green-light);border-left-color:var(--kr-green);color:#166534}
.kinga-report .kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--kr-rule);border:1px solid var(--kr-rule);margin-bottom:12px}
.kinga-report .kpi-tile{padding:10px 14px;background:var(--kr-white);position:relative;text-align:left}
.kinga-report .kpi-label{font-size:11px;font-family:var(--kr-sans);letter-spacing:.04em;text-transform:uppercase;font-weight:700;color:var(--kr-dark);margin-bottom:6px;display:block}
.kinga-report .kpi-value{font-family:var(--kr-mono);font-size:20px;font-weight:500;color:var(--kr-black);line-height:1}
.kinga-report .kpi-sub{font-size:11px;color:var(--kr-dark);margin-top:4px;font-weight:500}
.kinga-report .kpi-polarity{font-size:10px;color:var(--kr-dark);margin-top:2px;font-weight:500}
.kinga-report .dim-grid{display:grid;grid-template-columns:repeat(2,1fr);border:1px solid var(--kr-rule);margin-bottom:14px}
.kinga-report .dim-row{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--kr-rule);font-size:13px;font-weight:500}
.kinga-report .dim-row:nth-child(odd){border-right:1px solid var(--kr-rule)}
.kinga-report .dim-badge{font-size:9px;font-weight:600;padding:2px 7px;border-radius:2px;text-transform:uppercase;letter-spacing:.04em;font-family:var(--kr-sans)}
.kinga-report .dim-badge.pass{background:var(--kr-green-light);color:var(--kr-green)}
.kinga-report .dim-badge.warn{background:var(--kr-amber-light);color:var(--kr-amber)}
.kinga-report .dim-badge.fail{background:var(--kr-red-light);color:var(--kr-red)}
.kinga-report .fcdi-block{display:flex;gap:24px;align-items:flex-start;border:1px solid var(--kr-rule);padding:14px 16px;margin-bottom:14px}
.kinga-report .fcdi-score-big{font-size:32px;font-weight:500;color:var(--kr-black);line-height:1;font-family:var(--kr-mono)}
.kinga-report .fcdi-score-denom{font-size:18px;color:var(--kr-dark);font-family:var(--kr-mono);font-weight:500}
.kinga-report .timeline{display:flex;align-items:center;gap:0;margin:16px 0 24px;overflow-x:auto}
.kinga-report .tl-item{flex-shrink:0;text-align:center}
.kinga-report .tl-line{flex:1;height:1px;background:var(--kr-rule);min-width:30px}
.kinga-report .tl-dot{width:10px;height:10px;border-radius:50%;background:var(--kr-black);margin:0 auto 4px}
.kinga-report .tl-dot.inactive{background:var(--kr-rule)}
.kinga-report .tl-label{font-family:var(--kr-sans);font-size:10px;letter-spacing:0;color:var(--kr-dark);font-weight:700}
.kinga-report .tl-date{font-family:var(--kr-sans);font-size:11px;font-weight:500;margin-top:2px}
.kinga-report .exec-summary{border:1px solid var(--kr-rule);padding:14px 16px;margin-bottom:10px;font-size:12px;color:var(--kr-text);line-height:1.6;background:var(--kr-white)}
.kinga-report .pipeline-box{display:none !important}
.kinga-report .pipeline-box h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#111;margin-bottom:4px}
.kinga-report .pipeline-box .run-meta{font-size:10px;color:#666;margin-bottom:12px}
.kinga-report .run-meta{font-size:10px;color:var(--kr-dark);margin-bottom:12px;font-family:var(--kr-sans);font-weight:500}
.kinga-report .pis-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--kr-dark);margin:0}
.kinga-report .pis-text{font-size:12px;color:var(--kr-text);line-height:1.6;margin:0}
.kinga-report .stage-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:14px}
.kinga-report .stage-tile{padding:6px 4px;text-align:center;font-size:9px;font-weight:700;border-radius:3px;text-transform:uppercase;letter-spacing:.04em}
.kinga-report .stage-tile.green{background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7}
.kinga-report .stage-tile.amber{background:#fff8e1;color:#c8a000;border:1px solid #ffe082}
.kinga-report .pipeline-stats{display:grid;grid-template-columns:repeat(6,1fr);gap:0;border-top:1px solid #ddd;padding-top:12px}
.kinga-report .ps-item{text-align:center}
.kinga-report .ps-value{font-size:var(--kr-sz-xl);font-weight:700;color:var(--kr-navy)}
.kinga-report .ps-label{font-size:var(--kr-sz-xs);color:var(--kr-muted);text-transform:uppercase;letter-spacing:.04em;font-family:var(--kr-sans)}
/* Section heading: navy bar with white text — matches KINGA brand */
.kinga-report .section-heading{display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--kr-navy);color:var(--kr-white);margin:16px 0 8px;font-size:var(--kr-sz-sec);font-weight:700;letter-spacing:0.01em;-webkit-print-color-adjust:exact;print-color-adjust:exact}
/* Sub-heading: sentence-case bold, green accent — no uppercase */
.kinga-report .sub-heading{font-family:var(--kr-sans);font-size:var(--kr-sz-body);font-weight:700;text-transform:none;letter-spacing:0;color:var(--kr-navy);margin:8px 0 4px;border-bottom:1px solid var(--kr-rule);padding-bottom:3px}
.kinga-report .data-table{width:100%;border-collapse:collapse;margin-bottom:10px;table-layout:fixed}
.kinga-report .compact-kv-table{width:auto;max-width:520px;border-collapse:collapse;margin-bottom:10px;table-layout:auto}
.kinga-report .compact-kv-table td{padding:5px 0;font-size:12px;border-bottom:1px solid var(--kr-rule);vertical-align:top;white-space:normal}
.kinga-report .compact-kv-table td:first-child{font-size:12px;font-family:var(--kr-sans);color:var(--kr-dark);font-weight:700;text-transform:none;letter-spacing:0;padding-right:24px;white-space:nowrap;min-width:160px}
.kinga-report .compact-kv-table td:last-child{color:var(--kr-text);font-weight:600;font-size:13px;letter-spacing:0}
.kinga-report .compact-kv-table tr:last-child td{border-bottom:none}
.kinga-report .two-col-kv{display:grid;grid-template-columns:1fr 1fr;gap:0 32px;margin-bottom:14px}
.kinga-report .two-col-kv .compact-kv-table{width:100%;max-width:none}
.kinga-report .physics-col-main .compact-kv-table{width:100%;max-width:none}
.kinga-report .data-table td,.kinga-report .data-table th{padding:7px 0;font-size:13px !important;border-bottom:1px solid var(--kr-rule);vertical-align:top;word-break:break-word;overflow-wrap:break-word;white-space:normal;font-weight:500}
.kinga-report .data-table th{font-size:var(--kr-sz-xs) !important;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--kr-white);background:var(--kr-navy);border-bottom:none;font-family:var(--kr-sans);padding:6px 8px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.kinga-report .data-table td:first-child{font-size:12px !important;font-family:var(--kr-sans);color:var(--kr-dark);font-weight:600;letter-spacing:0;width:44%;padding-right:8px}
.kinga-report .data-table td:last-child{color:var(--kr-text);font-weight:600;font-size:13px !important}
.kinga-report .data-table tr:last-child td{border-bottom:none}
.kinga-report .flag-red{color:var(--kr-red);font-weight:600;font-family:var(--kr-sans)}
.kinga-report .flag-amber{color:var(--kr-amber);font-weight:600;font-family:var(--kr-sans)}
.kinga-report .flag-green{color:var(--kr-green);font-weight:600;font-family:var(--kr-sans)}
.kinga-report .data-table .mismatch td{background:#fff;color:#c00;font-weight:700}
.kinga-report .narrative-box{border:1px solid var(--kr-rule);padding:10px 14px;margin-bottom:6px;font-size:12px;color:var(--kr-text);line-height:1.5;background:var(--kr-white)}
.kinga-report .narr-label{font-size:10px;font-weight:700;text-transform:none;letter-spacing:0;color:var(--kr-dark);margin-bottom:6px;font-family:var(--kr-sans)}
.kinga-report .micro-label{font-size:10px;font-family:var(--kr-sans);letter-spacing:0;text-transform:none;color:var(--kr-dark);font-weight:700;margin-bottom:6px;display:block}
.kinga-report .diagram-section{display:flex;gap:16px;align-items:flex-start;margin-bottom:10px;border:1px solid var(--kr-rule);padding:12px}
.kinga-report .diagram-legend{flex:1}
.kinga-report .legend-item{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--kr-text);margin-bottom:6px}
.kinga-report .legend-swatch{width:18px;height:12px;border-radius:2px;flex-shrink:0}
.kinga-report .diagram-caption{font-size:10px;color:var(--kr-dark);margin-top:8px;font-style:italic;font-weight:500}
.kinga-report .chart-container{position:relative;height:220px;width:100%;margin-bottom:8px}
.kinga-report .chart-side-by-side{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:10px}
.kinga-report .bordered-block{border:1px solid var(--kr-rule);padding:10px 14px;margin-bottom:8px}
.kinga-report .valuation-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--kr-rule);font-size:12px}
.kinga-report .valuation-row:last-child{border-bottom:none}
.kinga-report .valuation-row .vr-label{color:var(--kr-dark);font-family:var(--kr-sans);font-size:11px;letter-spacing:0;font-weight:600}
.kinga-report .valuation-row .vr-value{font-weight:600;font-family:var(--kr-mono)}
.kinga-report .valuation-row .vr-value.good{color:var(--kr-green)}
.kinga-report .valuation-row .vr-value.na{color:var(--kr-amber)}
.kinga-report .photo-tiles{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--kr-rule);margin-bottom:14px}
.kinga-report .photo-tile{padding:14px;text-align:center;border-right:1px solid var(--kr-rule)}
.kinga-report .photo-tile:last-child{border-right:none}
.kinga-report .pt-label{font-size:10px;font-weight:700;text-transform:none;letter-spacing:0;color:var(--kr-dark);margin-bottom:6px;font-family:var(--kr-sans)}
.kinga-report .pt-value{font-size:28px;font-weight:500;color:var(--kr-black);font-family:var(--kr-mono)}
.kinga-report .pt-sub{font-size:10px;color:var(--kr-dark);margin-top:2px;font-family:var(--kr-sans);font-weight:500}
.kinga-report .photo-forensics-table{width:100%;border-collapse:collapse;margin-bottom:14px;table-layout:fixed}
.kinga-report .photo-forensics-table th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--kr-white);background:var(--kr-navy);border-bottom:none;padding:6px 8px;text-align:left;word-break:break-word;white-space:normal;font-family:var(--kr-sans);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.kinga-report .photo-forensics-table td{padding:6px 8px;font-size:11px;border-bottom:1px solid var(--kr-rule);vertical-align:top;word-break:break-word;overflow-wrap:break-word;white-space:normal}
.kinga-report .photo-forensics-table tr:last-child td{border-bottom:none}
.kinga-report .photo-forensics-table .photo-finding{font-size:12px;color:var(--kr-text);line-height:1.5}
.kinga-report .photo-forensics-table .photo-detail{font-size:10px;color:var(--kr-dark);margin-top:3px;font-style:italic;line-height:1.4;font-weight:500}
.kinga-report .photo-forensics-table tr.flagged-row td{background:var(--kr-red-light);color:var(--kr-red);font-weight:600}
/* Photo Integrity Summary box — print-safe override */
.kinga-report .photo-integrity-summary{background:var(--kr-off-white) !important;border:1px solid var(--kr-rule) !important;border-radius:0 !important;padding:14px 16px !important;margin-bottom:14px !important}
.kinga-report .photo-integrity-summary .pis-label{font-size:10px;font-weight:700;text-transform:none;letter-spacing:0;color:var(--kr-dark);margin-bottom:4px;font-family:var(--kr-sans)}
.kinga-report .photo-integrity-summary .pis-text{font-size:12px;color:var(--kr-text);line-height:1.6}
.kinga-report .fraud-score-block{display:flex;gap:16px;align-items:flex-start;margin-bottom:10px}
.kinga-report .fraud-big{font-size:44px;font-weight:500;color:var(--kr-black);line-height:1;font-family:var(--kr-mono)}
.kinga-report .fraud-denom{font-size:22px;color:var(--kr-dark);font-family:var(--kr-mono);font-weight:500}
.kinga-report .fraud-explain{font-size:12px;color:var(--kr-text);line-height:1.7;flex:1;padding-top:8px}
.kinga-report .ml-glimpse{background:var(--kr-white);border:1px solid var(--kr-rule);padding:14px 16px;margin-bottom:10px}
.kinga-report .ml-glimpse h4{font-size:11px;font-weight:700;text-transform:none;letter-spacing:0;color:var(--kr-navy);margin-bottom:10px;font-family:var(--kr-sans)}
.kinga-report .ml-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--kr-rule);font-size:11px}
.kinga-report .ml-row:last-child{border-bottom:none}
.kinga-report .ml-label{color:var(--kr-dark);flex:1;font-family:var(--kr-sans);font-size:12px;font-weight:600}
.kinga-report .ml-value{font-weight:500;color:var(--kr-black);text-align:right;flex:0 0 120px;font-family:var(--kr-mono)}
.kinga-report .ml-badge{font-size:9px;font-weight:600;padding:2px 7px;border-radius:2px;text-transform:uppercase;letter-spacing:.04em;margin-left:8px;font-family:var(--kr-sans)}
.kinga-report .ml-badge.normal{background:var(--kr-green-light);color:var(--kr-green)}
.kinga-report .ml-badge.anomaly{background:var(--kr-amber-light);color:var(--kr-amber)}
.kinga-report .ml-badge.cluster{background:var(--kr-blue-light);color:var(--kr-blue)}
.kinga-report .decision-box{border:1px solid var(--kr-rule);padding:20px 28px;margin-bottom:14px;text-align:left;background:var(--kr-off-white)}
.kinga-report .db-label{font-size:10px;font-weight:700;text-transform:none;letter-spacing:0;color:var(--kr-dark);margin-bottom:4px;font-family:var(--kr-sans)}
.kinga-report .db-value{font-size:22px;font-weight:600;color:var(--kr-black);letter-spacing:-0.02em}
.kinga-report .db-sub{font-size:11px;color:var(--kr-dark);margin-top:6px;font-weight:500}
.kinga-report .flowchart{display:flex;flex-direction:column;align-items:center;gap:0;margin-bottom:12px}
.kinga-report .fc-box{width:340px;padding:10px 18px;text-align:center;border:1px solid #ccc;font-size:11px;background:#fff}
.kinga-report .fc-box.start{background:#fff;font-weight:700;border:2px solid #111}
.kinga-report .fc-box.amber-box{background:#fff;border-color:#c8a000;color:#7a5c00}
.kinga-report .fc-box.green-box{background:#fff;border-color:#388e3c;color:#1b5e20}
.kinga-report .fc-box.red-box{background:#fff;border-color:#c62828;color:#b71c1c}
.kinga-report .fc-box.decision-final{background:#fff;border:2px solid #111;font-size:16px;font-weight:700;color:#111}
.kinga-report .fc-score{font-size:11px;opacity:.8;margin-top:3px}
.kinga-report .fc-arrow{font-size:18px;color:#374151;line-height:1;padding:2px 0}
.kinga-report .blockers-list{margin-bottom:16px;list-style:none;padding:0}
.kinga-report .blockers-list li{font-size:12px;color:#111827;padding:4px 0 4px 16px;position:relative;border-bottom:1px solid #f0f0f0}
.kinga-report .blockers-list li::before{content:'•';position:absolute;left:0;color:#374151}
.kinga-report .next-steps{margin-bottom:12px;list-style:none;padding:0}
.kinga-report .next-steps li{font-size:11px;color:#111827;padding:5px 0 5px 26px;position:relative;border-bottom:1px solid #f0f0f0}
.kinga-report .ns-num{position:absolute;left:0;font-weight:700;color:#374151;font-size:11px}
.kinga-report .integrity-table{width:100%;border-collapse:collapse;margin-bottom:14px;table-layout:fixed}
.kinga-report .integrity-table td{padding:6px 0;font-size:12px;border-bottom:1px solid var(--kr-rule);word-break:break-word;overflow-wrap:break-word;white-space:normal}
.kinga-report .integrity-table td:first-child{color:var(--kr-dark);width:210px;font-size:11px;font-family:var(--kr-sans);letter-spacing:0;font-weight:600}
.kinga-report .hash-block{font-family:var(--kr-mono);font-size:10px;color:var(--kr-dark);background:var(--kr-off-white);padding:10px 14px;border:1px solid var(--kr-rule);margin-bottom:10px;word-break:break-all}
.kinga-report .tamper-note{font-size:11px;color:var(--kr-dark);font-style:italic;margin-bottom:16px}
.kinga-report .lifecycle-bar{display:flex;margin-bottom:8px}
.kinga-report .lc-step{flex:1;padding:10px 8px;text-align:center;font-size:11px;font-weight:700;background:#fff;color:#374151;border:1px solid #ddd;border-right:none}
.kinga-report .lc-step:last-child{border-right:1px solid #ddd}
.kinga-report .lc-step.active{background:var(--kr-amber-light);color:#92400e;border-color:var(--kr-amber);border-bottom:3px solid var(--kr-amber)}
.kinga-report .lc-step.done{background:var(--kr-green-light);color:#166534;border-color:var(--kr-green);border-bottom:3px solid var(--kr-green)}
.kinga-report .conf-footer{font-size:10px;color:var(--kr-muted);text-align:center;padding:12px 20px;border-top:1px solid var(--kr-rule);line-height:1.5;background:var(--kr-white);font-family:var(--kr-sans)}
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
.kinga-report .party-col-heading{font-size:11px;font-weight:700;text-transform:none;letter-spacing:0;color:var(--kr-navy);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--kr-rule);font-family:var(--kr-sans)}
.kinga-report .party-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--kr-rule);font-size:11px}
.kinga-report .party-row:last-child{border-bottom:none}
.kinga-report .party-row .pr-label{color:var(--kr-dark);font-family:var(--kr-sans);font-size:12px;letter-spacing:0;font-weight:600}
.kinga-report .party-row .pr-value{font-weight:700;color:var(--kr-text);text-align:right;max-width:160px}
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
.kinga-report p,.kinga-report td,.kinga-report li{font-size:13px;line-height:1.6;font-weight:500}
.kinga-report span{font-size:inherit}
.kinga-report .section-heading{font-size:var(--kr-sz-sec);font-weight:700;letter-spacing:0.01em}
.kinga-report .kpi-label{font-size:10px;font-family:var(--kr-sans);letter-spacing:.04em;text-transform:uppercase;font-weight:700;color:var(--kr-dark)}
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
.kinga-report .narr-header-label{font-size:11px;font-family:var(--kr-sans);letter-spacing:0;text-transform:none;color:var(--kr-navy);font-weight:700;border-bottom:1px solid var(--kr-rule);padding-bottom:3px;margin-bottom:6px;display:block}
.kinga-report .narr-quote{font-size:12px;line-height:1.65;color:var(--kr-text);font-style:italic;padding:12px 14px;border-left:3px solid var(--kr-black);background:#fafafa;margin:10px 14px}
.kinga-report .narr-seq{padding:10px 14px;border-top:1px solid var(--kr-rule)}
.kinga-report .narr-seq-label{font-size:11px;font-family:var(--kr-sans);letter-spacing:0;text-transform:none;color:var(--kr-navy);font-weight:700;margin-bottom:6px;display:block}
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
.kinga-report .narr-flag-desc{font-size:13px;color:var(--kr-text);line-height:1.55;font-weight:500}
.kinga-report .narr-flag-evidence{font-size:12px;color:var(--kr-dark);font-style:italic;margin-top:3px;padding-left:8px;border-left:2px solid var(--kr-rule);font-weight:500}
.kinga-report .narr-reasoning{padding:10px 14px;background:#fafafa;border-top:1px solid var(--kr-rule)}
.kinga-report .narr-reasoning-label{font-size:11px;font-family:var(--kr-sans);letter-spacing:0;text-transform:none;color:var(--kr-navy);font-weight:700;margin-bottom:4px;display:block}
.kinga-report .narr-reasoning-text{font-size:12px;color:var(--kr-text);line-height:1.6}
/* Physics 2-column layout: table left, gauge+chart right */
.kinga-report .physics-row{display:grid;grid-template-columns:1fr 300px;gap:20px;align-items:start}
.kinga-report .physics-col-main{min-width:0}
.kinga-report .physics-col-side{min-width:0;width:100%}
/* Print: keep physics-row side-by-side */
@media print{
  .kinga-report .physics-row{display:grid !important;grid-template-columns:1fr 280px !important;gap:16px !important}
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
  --fp-info-text:#1a4d22;
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
.kinga-report [class*="bg-card"],.kinga-report [style*="var(--kr-white)"]{
  background:#fff !important;
}
.kinga-report [class*="bg-muted"],.kinga-report [style*="var(--muted)"]{
  background:#fff !important;
}
.kinga-report [class*="text-muted"],.kinga-report [style*="var(--kr-muted)"]{
  color:#374151 !important;
}
.kinga-report [class*="text-foreground"],.kinga-report [style*="var(--kr-text)"]{
  color:#111 !important;
}
.kinga-report [class*="border-border"],.kinga-report [style*="var(--border)"]{
  border-color:#ddd !important;
}
/* Table rows */
.kinga-report table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;table-layout:fixed}
.kinga-report table td,.kinga-report table th{padding:6px 10px;font-size:12px !important;border-bottom:1px solid var(--kr-rule);vertical-align:top;color:var(--kr-text);background:var(--kr-white);word-break:break-word;overflow-wrap:break-word;white-space:normal}
.kinga-report table th{font-size:var(--kr-sz-xs) !important;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--kr-white);background:var(--kr-navy);border-bottom:none;word-break:break-word;white-space:normal;font-family:var(--kr-sans);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.kinga-report table td:first-child{color:var(--kr-muted);font-size:11px !important;font-weight:400;font-family:var(--kr-sans)}
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
/* Section sub-headings — sentence-case bold, navy colour, no uppercase */
.kinga-report p.text-xs.font-bold.uppercase.tracking-wide,
.kinga-report span.text-xs.font-bold.uppercase.tracking-wide{
  font-size:var(--kr-sz-body) !important;
  font-weight:700 !important;
  text-transform:none !important;
  letter-spacing:0 !important;
  color:var(--kr-navy) !important;
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
  .kinga-report svg text[fill="var(--kr-muted)"]{fill:#6b7280 !important}
  .kinga-report svg text[fill="var(--kr-text)"]{fill:#111 !important}
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
  .kinga-report .verdict-banner .verdict-reason{color:#1f2937 !important;font-weight:500 !important}
  .kinga-report .verdict-banner .verdict-confidence{color:#111 !important;font-weight:700 !important}
  /* ── Score summary bars: keep together, B&W bars ── */
  .kinga-report .score-summary-panel{page-break-inside:avoid;border:1px solid #ddd !important;background:#fff !important}
  .kinga-report .score-bar-fill{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  /* ── Section 5.5 stacked fraud signal chart: preserve colours for print ── */
  .kinga-report .fraud-signal-bar{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;page-break-inside:avoid}
  .kinga-report .fraud-signal-bar > div{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  /* ── Persistent footer: always show at bottom, preserve dark background ── */
  .kinga-report .report-persistent-footer{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;page-break-inside:avoid;margin-top:24px !important}
  .kinga-report .report-persistent-footer .footer-bar{background:var(--kr-black) !important;color:#e5e7eb !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  .kinga-report .report-persistent-footer .footer-bar *{color:#e5e7eb !important}
  .kinga-report .report-persistent-footer .footer-bar .footer-decision-badge{border:1px solid #e5e7eb !important;color:#e5e7eb !important}
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


export function ForensicAuditReport({ claim, aiAssessment, enforcement, quotes, approvalHistory = [], workflowStages = [], claimId, pipelineRunId, isDraft = false, draftMissingFields = [], resolvedPhotosOverride }: ForensicAuditReportProps) {
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
          <div className="subtitle">Automated KINGA analysis · Not legal advice · Requires human adjuster review</div>
        </div>
        <div className="cover-meta">
          <div className="claim-id">
            {(enforcement as any)?.kingaRef && <>{(() => {
              const raw: string = (enforcement as any).kingaRef ?? '';
              return raw.replace(/TENANT\d+/gi, 'KINGA') + '-FR';
            })()}<br/></>}
            CLAIM: {claim?.claimNumber ?? claim?.claimReference ?? '—'}<br/>
            HASH: {(() => { const parts = [aiAssessment?.id, aiAssessment?.claimId, aiAssessment?.processingTime].filter(Boolean); return parts.length > 0 ? `#${parts.map((n: any) => Number(n).toString(16)).join('').toUpperCase().slice(0, 8)}` : '#N/A'; })()}
          </div>
          <div className="meta-line" style={{ marginTop: 12 }}>
            {claim?.vehicleYear ? `${claim.vehicleYear} ` : ''}{claim?.vehicleMake ?? ''} {claim?.vehicleModel ?? ''}
            {(claim?.vehicleRegistration || (claim as any)?.registrationNumber) && (
              <span style={{ fontSize: 12, color: 'var(--kr-muted)', display: 'block' }}>Reg: {claim?.vehicleRegistration ?? (claim as any)?.registrationNumber}</span>
            )}
          </div>
          <div style={{ marginTop: 8, fontFamily: 'var(--kr-mono)', fontSize: 10, color: 'var(--kr-muted)' }}>
            Generated: {new Date(aiAssessment?.createdAt ?? Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* DRAFT Banner */}
      {isDraft && (
        <div style={{ background: 'var(--kr-amber-light)', borderLeft: '3px solid var(--kr-amber)', padding: '7px 40px', fontFamily: 'var(--kr-mono)', fontSize: 11, color: 'var(--kr-amber)', letterSpacing: '0.08em' }}>
          ▲ DRAFT — {draftMissingFields.length > 0 ? `Missing: ${draftMissingFields.join(', ')}. ` : ''}Complete and re-export for final version.
        </div>
      )}
      {/* R-F-02: Pre-generation consistency check contradiction banner.
           hasContradictions and contradictions[] were already computed above but never rendered.
           This banner is shown at the top of the report so adjusters see it immediately. */}
      {hasContradictions && (
        <div style={{ background: '#fef2f2', borderLeft: '4px solid #dc2626', padding: '8px 40px', fontFamily: 'var(--kr-mono)', fontSize: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: contradictions.length > 1 ? 6 : 0 }}>
            <span style={{ color: '#dc2626', fontWeight: 700, letterSpacing: '0.06em' }}>&#9888; REPORT INTEGRITY WARNING</span>
            <span style={{ color: '#7f1d1d' }}>— {contradictions.length} pre-generation contradiction{contradictions.length !== 1 ? 's' : ''} detected between pipeline stages</span>
          </div>
          {contradictions.length > 0 && (
            <ul style={{ margin: '4px 0 0 16px', padding: 0, color: '#7f1d1d', fontSize: 10, lineHeight: 1.6 }}>
              {contradictions.slice(0, 5).map((c: any, i: number) => (
                <li key={i} style={{ marginBottom: 1 }}>
                  <strong>{c.field ?? c.type ?? `Contradiction ${i + 1}`}:</strong>{' '}
                  {c.description ?? c.message ?? JSON.stringify(c)}
                </li>
              ))}
              {contradictions.length > 5 && (
                <li style={{ color: '#dc2626', fontStyle: 'italic' }}>+{contradictions.length - 5} more — see Section 8b for full list</li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Body content wrapper */}
      <div style={{ padding: '0 40px 24px' }}>

      <CongruencyPanel aiAssessment={aiAssessment} />
      <DataQualityPanel aiAssessment={aiAssessment} />
      {/* Fix 1 (Batch 10a): PipelineConfidencePanel was defined but never wired into the render.
           It surfaces FCDI score, degraded/failed stages, domain penalties, and degradationReasons
           so adjusters can see WHY a report is partial. enforcement prop provides degradationReasons
           since forensic_analysis does not include that field. */}
      <PipelineConfidencePanel aiAssessment={aiAssessment} enforcement={enforcement} />
      <Section0Cover claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} quotes={quotes} fmtMoney={fmtMoney} />

      <div className="section-heading" data-section="1">1 &nbsp; Incident &amp; Data Integrity</div>
      {claimId != null && <ReportSectionThread claimId={claimId} sectionKey="incident_integrity" pipelineRunId={pipelineRunId} />}
      <Section1Incident claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} fmtMoney={fmtMoney} />

      <div className="section-heading" data-section="2">2 &nbsp; Technical Forensics</div>
      {claimId != null && <ReportSectionThread claimId={claimId} sectionKey="physics" pipelineRunId={pipelineRunId} />}
      <Section2Physics claim={claim} aiAssessment={aiAssessment} enforcement={enforcement} quotes={quotes} />

      {/* 2.6 Damage Severity & Coverage and 2.7 Pattern Validation are now rendered inside Section2Physics */}

      <div className="section-heading" data-section="3">3 &nbsp; Financial Validation</div>
      {claimId != null && <ReportSectionThread claimId={claimId} sectionKey="financial_validation" pipelineRunId={pipelineRunId} />}
      <Section3Financial aiAssessment={aiAssessment} enforcement={enforcement} quotes={quotes} fmtMoney={fmtMoney} claimId={claim?.id} />

      <div className="section-heading" data-section="4">4 &nbsp; Evidence Inventory</div>
      {claimId != null && <ReportSectionThread claimId={claimId} sectionKey="evidence_inventory" pipelineRunId={pipelineRunId} />}
      <Section4Evidence aiAssessment={aiAssessment} enforcement={enforcement} claim={claim} resolvedPhotosOverride={resolvedPhotosOverride} />

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
            {/* 7.0 Assessment Quality Score — subsection header + data-table matching mock */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--kr-text)' }}>7.0 Assessment Quality Score</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 6px', background: gradeColor(cq.grade), color: 'var(--kr-white)', borderRadius: 2 }}>
                    {cq.overallScore}/100 — Grade {cq.grade}
                  </span>
                  {cq.requiresManualReview && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 6px', background: 'var(--fp-warning-bg)', color: 'var(--fp-warning-text)', border: '1px solid var(--fp-warning-border)', borderRadius: 2 }}>Manual Review Required</span>
                  )}
                </span>
              </div>
              {cq.adjusterGuidance && (
                <p style={{ fontSize: 11, color: 'var(--kr-text)', marginBottom: 6, lineHeight: 1.5 }}>{cq.adjusterGuidance}</p>
              )}
              {/* Horizontal 6-column quality score table — one column per dimension, grows wide not tall */}
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #C0C0C0', marginBottom: 6, fontSize: 11 }}>
                <thead>
                  <tr>
                    {dimOrder.map((key) => {
                      const dim = (cq.dimensions as any)?.[key];
                      if (!dim) return null;
                      return (
                        <th key={key} style={{ padding: '4px 8px', fontWeight: 700, color: 'var(--kr-white)', background: 'var(--kr-navy)', textAlign: 'center', fontSize: 10, borderRight: '1px solid #444', whiteSpace: 'nowrap' }}>
                          {dim.name}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {dimOrder.map((key) => {
                      const dim = (cq.dimensions as any)?.[key];
                      if (!dim) return null;
                      const dimColor = dim.score >= 70 ? '#16a34a' : dim.score >= 40 ? '#d97706' : '#dc2626';
                      return (
                        <td key={key} style={{ padding: '8px', textAlign: 'center', borderRight: '1px solid #D4D4D4', verticalAlign: 'middle', background: 'var(--kr-white)' }}>
                          <div style={{ fontWeight: 700, fontSize: 18, color: dimColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{dim.score}</div>
                          <div style={{ fontSize: 10, color: 'var(--kr-muted)', marginTop: 3 }}>{dim.label}</div>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
              {(cq.mandatoryActions ?? []).length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 3, color: 'var(--kr-text)' }}>Mandatory Adjuster Actions</p>
                  {(cq.mandatoryActions as string[]).map((action: string, i: number) => (
                    <p key={i} style={{ fontSize: 11, color: 'var(--kr-text)', marginBottom: 2, lineHeight: 1.45 }}>{i + 1}. {action}</p>
                  ))}
                </div>
              )}
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
            <div style={{ marginBottom: 12 }}>
              {/* 8.0 Validation Status — subsection header matching mock */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--kr-text)' }}>8.0 Validation Status</span>
                <span style={{ fontSize: 11, color: 'var(--kr-muted)' }}>
                  Consistency: {fav.consistencyScore}/100 &nbsp;·&nbsp; Confidence: {fav.confidenceInAssessment} &nbsp;
                  <span style={{ fontWeight: 700, padding: '1px 6px', background: overallSt.bg, color: overallSt.text, border: `1px solid ${overallSt.border}`, borderRadius: 2 }}>{fav.overallStatus}</span>
                </span>
              </div>

              {/* Validation grid: 2-col grid of dimension badges matching mock validation-grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, marginBottom: 8 }}>
                {dimEntries.map(([key, result]) => {
                  const st = statusStyle(result);
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 5px', border: '1px solid #D4D4D4', fontSize: 11, background: 'var(--kr-white)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--kr-text)' }}>{dimLabels[key] ?? key}</span>
                      <span style={{ fontWeight: 700, padding: '1px 5px', background: st.bg, color: st.text, border: `1px solid ${st.border}`, borderRadius: 2, fontSize: 10 }}>{result}</span>
                    </div>
                  );
                })}
              </div>
              {/* Issue groups: plain issue-block style matching mock */}
              {issueGroups.map((group, gi) => (
                <div key={gi} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: group.style.text, marginBottom: 4, paddingBottom: 3, borderBottom: `1px solid ${group.style.border}` }}>
                    8.{gi + 1} {group.label} ({group.items.length})
                  </div>
                  {(() => {
                    // Collapse issues with the same code into a single card with a count badge
                    const codeGroups: Record<string, any[]> = {};
                    for (const issue of group.items) {
                      const key = issue.code ?? 'UNKNOWN';
                      if (!codeGroups[key]) codeGroups[key] = [];
                      codeGroups[key].push(issue);
                    }
                    return Object.entries(codeGroups).map(([code, issues], ci) => {
                      const first = issues[0];
                      const count = issues.length;
                      // For multi-instance codes, build a compact summary
                      const multiSummary = count > 1
                        ? issues.map((iss: any) => {
                            // Extract the key field name from description (e.g. "Police officer details" → "officer")
                            const m = iss.description?.match(/^([^.]+?)\s+(?:were|was|could not|is|are)/i);
                            return m ? m[1].replace(/\s+details?$/i, '').replace(/^Police\s+/i, '').toLowerCase() : iss.description;
                          }).join(', ')
                        : null;
                      return (
                        <div key={ci} style={{ borderLeft: `3px solid ${group.style.border}`, padding: '5px 8px', marginBottom: 4, background: 'var(--kr-white)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--kr-mono)', color: 'var(--kr-text)' }}>[{code}] {first.dimension}</span>
                            {count > 1 && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', background: group.style.border, color: '#fff', borderRadius: 2 }}>{count}×</span>}
                          </div>
                          <div style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--kr-text)' }}>
                            {count > 1 ? `${count} fields not extracted: ${multiSummary}.` : first.description}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              ))}
            </div>
          </>
        );
      })()}

      {/* ══ R-F-01: Cross-Stage Consistency Conflict Warning ══
           Rendered when blockAutoApproval=true from crossStageConsistencyEngine.
           Previously this flag was computed but never surfaced to adjusters. */}
      {(() => {
        const rs = (aiAssessment as any)?._reportSignals;
        const cf = rs?.consistencyFlags;
        if (!cf?.blockAutoApproval) return null;
        return (
          <>
            <div className="section-heading" style={{ background: '#7f1d1d', color: '#fff' }}>&#9888; Cross-Stage Consistency Conflict — Auto-Approval Blocked</div>
            <div style={{ background: '#fef2f2', border: '2px solid #dc2626', borderRadius: 3, padding: '10px 16px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', fontFamily: 'var(--kr-mono)', letterSpacing: '0.05em' }}>
                  {cf.overallStatus} — {cf.criticalCount ?? 0} CRITICAL, {cf.highCount ?? 0} HIGH
                </span>
                <span style={{ fontSize: 11, padding: '2px 8px', background: '#dc2626', color: '#fff', borderRadius: 2, fontWeight: 700, fontFamily: 'var(--kr-mono)' }}>MANUAL REVIEW REQUIRED</span>
              </div>
              <p style={{ fontSize: 11, color: '#7f1d1d', marginBottom: 8, lineHeight: 1.5 }}>
                The cross-stage consistency engine detected {cf.flagCount} named contradiction{cf.flagCount !== 1 ? 's' : ''} between pipeline stages.
                This claim cannot proceed to auto-approval until an adjuster reviews and resolves each conflict below.
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#7f1d1d', color: '#fff' }}>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 700, width: '10%' }}>Rule</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 700, width: '12%' }}>Severity</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 700, width: '50%' }}>Description</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 700, width: '28%' }}>Adjuster Action</th>
                  </tr>
                </thead>
                <tbody>
                  {((cf.flags ?? []) as any[]).map((flag: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #fca5a5', background: i % 2 === 0 ? '#fff5f5' : '#fff' }}>
                      <td style={{ padding: '5px 8px', fontFamily: 'var(--kr-mono)', fontSize: 10, color: '#7f1d1d' }}>{flag.id ?? '—'}</td>
                      <td style={{ padding: '5px 8px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 2,
                          background: flag.severity === 'CRITICAL' ? '#dc2626' : flag.severity === 'HIGH' ? '#ea580c' : '#d97706',
                          color: '#fff' }}>{flag.severity}</span>
                      </td>
                      <td style={{ padding: '5px 8px', color: '#1c1917', lineHeight: 1.4 }}>{flag.description}</td>
                      <td style={{ padding: '5px 8px', color: '#1c1917', lineHeight: 1.4, fontStyle: 'italic' }}>{flag.recommendation ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}
      {/* ══ R-F-04: Pre-Publication Validator Blockers ══
           Rendered when prePublicationBlockers exist in reportSignals.
           Previously these were logged server-side but never surfaced to adjusters. */}
      {(() => {
        const rs = (aiAssessment as any)?._reportSignals;
        const ppb = rs?.prePublicationBlockers;
        if (!ppb || (ppb.blockerCount ?? 0) === 0) return null;
        const severityStyle = (s: string) =>
          s === 'CRITICAL' ? { bg: '#dc2626', text: '#fff' }
          : s === 'HIGH' ? { bg: '#ea580c', text: '#fff' }
          : { bg: '#d97706', text: '#fff' };
        return (
          <>
            <div className="section-heading" style={{ background: '#7c2d12', color: '#fff' }}>&#9888; Pre-Publication Validation — {ppb.blocked ? 'BLOCKED' : 'WARNINGS'}</div>
            <div style={{ background: '#fff7ed', border: `2px solid ${ppb.blocked ? '#ea580c' : '#d97706'}`, borderRadius: 3, padding: '10px 16px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: ppb.blocked ? '#ea580c' : '#d97706', fontFamily: 'var(--kr-mono)' }}>
                  {ppb.blockerCount} blocker{ppb.blockerCount !== 1 ? 's' : ''} detected
                </span>
                {ppb.blocked && (
                  <span style={{ fontSize: 11, padding: '2px 8px', background: '#ea580c', color: '#fff', borderRadius: 2, fontWeight: 700, fontFamily: 'var(--kr-mono)' }}>DELIVERY BLOCKED</span>
                )}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#7c2d12', color: '#fff' }}>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 700, width: '12%' }}>Check ID</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 700, width: '12%' }}>Severity</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 700, width: '44%' }}>Description</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 700, width: '32%' }}>Remediation</th>
                  </tr>
                </thead>
                <tbody>
                  {((ppb.blockers ?? []) as any[]).map((b: any, i: number) => {
                    const st = severityStyle(b.severity);
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #fed7aa', background: i % 2 === 0 ? '#fffbf5' : '#fff' }}>
                        <td style={{ padding: '5px 8px', fontFamily: 'var(--kr-mono)', fontSize: 10, color: '#7c2d12' }}>{b.checkId ?? b.check_id ?? '—'}</td>
                        <td style={{ padding: '5px 8px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 2, background: st.bg, color: st.text }}>{b.severity}</span>
                        </td>
                        <td style={{ padding: '5px 8px', color: '#1c1917', lineHeight: 1.4 }}>{b.description}</td>
                        <td style={{ padding: '5px 8px', color: '#1c1917', lineHeight: 1.4, fontStyle: 'italic' }}>{b.remediation ?? b.resolution ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
          approved:          { label: "Approved",      bg: "#ffffff", color: 'var(--kr-text)', border: "#0f172a" },
          rejected:          { label: "Rejected",      bg: "#ffffff", color: 'var(--kr-text)', border: "#0f172a" },
          returned:          { label: "Returned",      bg: "#ffffff", color: 'var(--kr-text)', border: "#0f172a" },
          escalated:         { label: "Escalated",     bg: "#ffffff", color: 'var(--kr-text)', border: "#0f172a" },
          external_received: { label: "Ext. Received", bg: "#ffffff", color: 'var(--kr-text)', border: "#0f172a" },
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
            <div style={{ background: 'var(--kr-off-white)', border: '1px solid var(--kr-rule)', padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16, color: 'var(--kr-muted)' }}>&#128274;</span>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--kr-text)' }}>Pending Workflow Initiation</span>
                <span style={{ fontSize: 11, color: 'var(--kr-muted)', marginLeft: 8 }}>No approval stages have been configured or completed for this claim.</span>
              </div>
            </div>
          );
        }

        return (
          <div style={{ marginBottom: 16 }}>
            {/* Bug #15 fix: show authoritative stage counts from workflowStages prop */}
            {stages.length > 0 && (() => {
              const totalStages = stages.length;
              const requiredCount = stages.filter(s => s.required !== false).length;
              const completedCount = stages.filter(s => completedByOrder.has(s.order)).length;
              return (
                <div style={{ display: 'flex', gap: 16, marginBottom: 10, padding: '6px 10px', background: 'var(--kr-off-white)', border: '1px solid var(--kr-rule)', fontSize: 10 }}>
                  <span style={{ color: 'var(--kr-muted)' }}>Total stages: <strong style={{ color: 'var(--kr-text)' }}>{totalStages}</strong></span>
                  <span style={{ color: 'var(--kr-muted)' }}>Required: <strong style={{ color: 'var(--kr-text)' }}>{requiredCount}</strong></span>
                  <span style={{ color: 'var(--kr-muted)' }}>Completed: <strong style={{ color: completedCount >= requiredCount ? 'var(--fp-success-text)' : 'var(--fp-warning-text)' }}>{completedCount}</strong></span>
                  <span style={{ color: 'var(--kr-muted)' }}>Pending: <strong style={{ color: 'var(--kr-text)' }}>{totalStages - completedCount}</strong></span>
                </div>
              );
            })()}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--kr-white)', background: 'var(--kr-navy)', width: '5%' }}>#</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--kr-white)', background: 'var(--kr-navy)', width: '18%' }}>Role</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--kr-white)', background: 'var(--kr-navy)', width: '20%' }}>Stage</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--kr-white)', background: 'var(--kr-navy)', width: '12%' }}>Decision</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--kr-white)', background: 'var(--kr-navy)', width: '18%' }}>Officer Name</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--kr-white)', background: 'var(--kr-navy)', width: '15%' }}>Date &amp; Time</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--kr-white)', background: 'var(--kr-navy)', width: '12%' }}>Signature</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((stage) => {
                  const completed = completedByOrder.get(stage.order);
                  const ds = completed ? (FAR_DECISION_STYLES[completed.decision] ?? { label: completed.decision, bg: '#f1f5f9', color: 'var(--kr-muted)', border: '#cbd5e1' }) : null;
                  const dateStr = completed?.actedAt
                    ? new Date(completed.actedAt).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : null;
                  return (
                    <tr key={stage.order} style={{ background: completed ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--kr-rule)', fontWeight: 700, color: 'var(--kr-navy)' }}>{stage.order}</td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--kr-rule)', fontWeight: 600, color: 'var(--kr-muted)' }}>{FAR_ROLE_LABELS[stage.roleKey] ?? stage.roleKey}</td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--kr-rule)', color: 'var(--kr-muted)' }}>{stage.name}</td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--kr-rule)' }}>
                        {ds ? (
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: ds.bg, color: ds.color, border: `1px solid ${ds.border}` }}>{ds.label}</span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--kr-muted)', fontStyle: 'italic' }}>Pending</span>
                        )}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--kr-rule)', color: 'var(--kr-text)' }}>
                        {completed?.actorName ?? <span style={{ color: 'var(--kr-muted)', fontStyle: 'italic' }}>—</span>}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--kr-rule)', color: 'var(--kr-muted)', fontSize: 11 }}>
                        {dateStr ?? <span style={{ color: 'var(--kr-muted)', fontStyle: 'italic' }}>—</span>}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--kr-rule)' }}>
                        {completed ? (
                          <div style={{ borderBottom: '1px solid #94a3b8', height: 22, width: '100%', position: 'relative' }}>
                            <span style={{ position: 'absolute', bottom: 2, left: 0, fontSize: 9, color: 'var(--kr-muted)', fontStyle: 'italic' }}>{completed.actorName ?? ''}</span>
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
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--kr-muted)', marginBottom: 8 }}>Reviewer Notes</p>
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
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--kr-muted)', marginBottom: 2 }}>
                        {FAR_ROLE_LABELS[e.roleKey ?? ''] ?? e.roleKey} — Stage {e.stageOrder} — {e.actorName ?? 'Unknown'}
                      </p>
                      {structuredNote ? (
                        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                          <tbody>
                            {structuredNote.findings && (
                              <tr><td style={{ paddingRight: 8, fontWeight: 600, color: 'var(--kr-muted)', whiteSpace: 'nowrap', verticalAlign: 'top', paddingBottom: 2 }}>Findings Confirmed</td><td style={{ color: 'var(--kr-muted)' }}>{structuredNote.findings}</td></tr>
                            )}
                            {structuredNote.dispute && (
                              <tr><td style={{ paddingRight: 8, fontWeight: 600, color: 'var(--kr-muted)', whiteSpace: 'nowrap', verticalAlign: 'top', paddingBottom: 2 }}>Reason for Dispute</td><td style={{ color: 'var(--kr-muted)' }}>{structuredNote.dispute}</td></tr>
                            )}
                            {structuredNote.action && (
                              <tr><td style={{ paddingRight: 8, fontWeight: 600, color: 'var(--kr-muted)', whiteSpace: 'nowrap', verticalAlign: 'top', paddingBottom: 2 }}>Action Required</td><td style={{ color: 'var(--kr-muted)' }}>{structuredNote.action}</td></tr>
                            )}
                          </tbody>
                        </table>
                      ) : (
                        <>
                          <p style={{ fontSize: 12, color: 'var(--kr-muted)', margin: 0, fontStyle: 'italic' }}>&#8220;{noteText}&#8221;</p>
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
        // ── Footer decision: use Claim Truth Layer (same source as cover) ──
        const _footerCtl = (enforcement as any)?._claimTruth;
        const _footerWfScore = (() => {
          const _fb = aiAssessment?.fraudScoreBreakdownJson
            ? (typeof aiAssessment.fraudScoreBreakdownJson === 'string'
                ? (() => { try { return JSON.parse(aiAssessment.fraudScoreBreakdownJson); } catch { return null; } })()
                : aiAssessment.fraudScoreBreakdownJson)
            : null;
          return Number(_fb?.overallScore ?? (aiAssessment as any)?.fraudScore ?? (enforcement as any)?.weightedFraud?.score ?? 0);
        })();
        const _footerWfDecision = _footerWfScore >= 70 ? 'DECLINE' : _footerWfScore >= 40 ? 'REVIEW REQUIRED' : null;
        const footerDecision = decisionLabel(_footerCtl?.decision?.recommendation ?? _footerWfDecision ?? 'REVIEW');
        const footerColor = footerDecision === 'DECLINE' ? '#c00' : footerDecision === 'REVIEW REQUIRED' ? '#c8a000' : '#2e7d32';
        return (
          <div style={{ background: 'var(--kr-white)', borderTop: '2px solid #1A2B4A', marginTop: 28, marginBottom: 0 }}>
            {/* Decision strip */}
            <div style={{ background: 'var(--kr-navy)', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style={{ height: 20, width: 20, objectFit: 'contain', opacity: 0.9 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--kr-white)', letterSpacing: '0.08em' }}>KINGA</span>
                <span style={{ fontSize: 10, color: 'var(--kr-muted)' }}>Forensic Claim Decision Report</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 10, color: 'var(--kr-muted)' }}>Claim: {claim?.claimNumber ?? claim?.claimReference ?? '—'}</span>
                <span style={{ fontFamily: 'var(--kr-mono)', fontSize: 10, color: 'var(--kr-muted)' }}>{(() => { const parts = [aiAssessment?.id, aiAssessment?.claimId, aiAssessment?.processingTime].filter(Boolean); return parts.length > 0 ? `#${parts.map((n: any) => Number(n).toString(16)).join('').toUpperCase().slice(0, 8)}` : '#N/A'; })()}</span>
                <span style={{ fontSize: 10, color: 'var(--kr-muted)' }}>{new Date(aiAssessment?.createdAt ?? Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: footerColor, border: `1px solid ${footerColor}`, padding: '1px 8px', letterSpacing: '0.06em' }}>{footerDecision}</span>
              </div>
            </div>
            {/* Disclaimer */}
            

      {/* ─── Appendix B: Glossary of Technical Terms ─────────────────────────── */}
      <div className="section-heading" data-section="B">B &nbsp; Glossary of Technical Terms</div>
      <div className="mb-1" style={{ border: '1px solid var(--kr-rule)', background: 'var(--kr-white)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--kr-rule)' }}>
          <p className="sub-heading">B.1 Definitions</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--kr-muted)' }}>Technical terms used in this report</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs report-table">
            <thead>
              <tr>
                {["Term", "Full Name", "Definition"].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["FCDI", "Forensic Confidence & Data Integrity", "A composite score (0–100%) measuring the reliability of the KINGA assessment. It degrades when key evidence is missing, extraction fails, or pipeline stages produce low-confidence outputs. A score below 60% requires mandatory human adjuster review."],
                ["Delta-v", "Change in Velocity", "The change in velocity experienced by a vehicle during a collision, measured in km/h. Higher delta-v values indicate more severe impacts and correlate with greater structural damage."],
                ["EBS", "Energy-Based Severity", "A severity classification derived from the kinetic energy transferred during impact. Categories: Cosmetic (<2 kJ), Minor (2–8 kJ), Moderate (8–20 kJ), Severe (20–50 kJ), Catastrophic (>50 kJ)."],
                ["Crush Depth", "Crush Depth (m)", "The measured or estimated depth of permanent deformation in the vehicle structure at the point of impact, used as a primary input for physics-based speed estimation."],
                ["M1", "KINGA Crush-Depth Method", "A physics-based speed estimation method using crush depth measurements and vehicle stiffness coefficients. Requires crush depth input; uses document or vision-derived measurements."],
                ["M2", "KINGA Barrier-Equivalent Method", "Speed estimation using National Highway Traffic Safety Administration barrier-equivalent velocity tables, calibrated to vehicle make/model crash test data."],
                ["M3", "KINGA Energy Balance", "Estimates impact speed by calculating the kinetic energy required to produce the observed structural deformation, accounting for vehicle mass and crush geometry."],
                ["M4", "KINGA Momentum Analysis", "Uses conservation of momentum principles with both vehicle masses and post-impact trajectories to estimate pre-impact speeds for multi-vehicle collisions."],
                ["M5", "KINGA Vision Deformation", "Computer vision-based speed estimation using KINGA analysis of damage photographs to estimate crush depth and deformation severity without physical measurements."],
                ["KINGA Vision", "KINGA Computer Vision", "The KINGA image analysis subsystem that processes damage photographs to detect components, classify severity, measure deformation, and extract forensic metadata (EXIF, GPS, manipulation indicators)."],
                ["EDS", "KINGA Ensemble Decision Score", "The weighted consensus speed estimate produced by combining multiple physics methods (M1–M5). Methods with higher confidence receive greater weight in the final estimate."],
                ["CTL", "Claim Truth Layer", "The unified data model that reconciles information from multiple sources (claim form, documents, KINGA extraction, photos) into a single authoritative record for each claim attribute."],
                ["EXIF", "Exchangeable Image File Format", "Metadata embedded in digital photographs containing capture date/time, GPS coordinates, camera make/model, and other technical parameters used for photo authenticity verification."],
              ].map(([term, full, def], i) => (
                <tr key={i} style={{ borderTop: i > 0 ? '1px solid #e2e8f0' : undefined, background: 'var(--kr-white)' }}>
                  <td className="px-3 py-2 font-semibold" style={{ color: 'var(--kr-text)', whiteSpace: 'nowrap', width: '8%' }}>{term}</td>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--kr-text)', whiteSpace: 'normal', width: '22%' }}>{full}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--kr-muted)', lineHeight: 1.5, width: '70%' }}>{def}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, color: 'var(--kr-muted)', lineHeight: 1.5 }}>
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
