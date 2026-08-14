/**
 * KingaClaimsReport — Standard Claims Report
 *
 * The report every tier receives. Designed for claims decision-making, not forensic
 * investigation. Black / white / grey format; colour is reserved exclusively for
 * status indicators and visual aids (fraud score bar, verdict badge, photo grid).
 *
 * Sections:
 *  1. Executive Decision Summary
 *  2. Workflow & Actions
 *  3. Vehicle & Policy Information
 *  4. Damage Assessment + Photo Grid (max 4 damage photos)
 *  5. Quote Comparison Table (side-by-side + KINGA Estimate column)
 *  6. Fraud & Risk Assessment (score + level + 1-line reason)
 *  7. Physics Consistency
 *  8. Final Recommendation
 */

import React, { useEffect } from "react";
import { currencySymbol } from "@/lib/currency";
import { ReportSectionThread } from "./ReportSectionThread";
import { ConfidenceImprovementChecklist } from "./ConfidenceImprovementChecklist";
import { expandShorthand } from "../../../shared/expandShorthand";
import { ComponentCostMatrix, buildRowsFromComposite, buildRowsFromLineItems, MatrixQuote } from "./ComponentCostMatrix";
import { buildCostDecisionPresentationContract } from "@shared/costDecisionPresentation";
import { classifyLegacyQuoteEvidenceRows } from "@shared/legacyQuoteEvidence";
import { resolveQuoteComparisonEvidence } from "@/lib/quoteComparisonEvidence";

// ─── Print CSS injected once per mount ───────────────────────────────────────
const CLAIMS_PRINT_CSS = `
@media print {
  /* Force white background everywhere except coloured elements */
  [data-kinga-claims-report] { background: #fff !important; color: #111 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  [data-kinga-claims-report] * { background: #fff !important; color: #111 !important; }
  /* Verdict banner: B&W — heavy border encodes severity */
  [data-kinga-claims-report] .cr-verdict-banner { background: #fff !important; border: 2px solid #111 !important; color: #111 !important; page-break-inside: avoid; }
  [data-kinga-claims-report] .cr-verdict-banner .cr-verdict-label { color: #111 !important; font-weight: 900 !important; }
  [data-kinga-claims-report] .cr-verdict-banner .cr-verdict-reason { color: #555 !important; }
  [data-kinga-claims-report] .cr-verdict-banner .cr-verdict-confidence { color: #111 !important; font-weight: 700 !important; }
  /* Score summary bars: keep together, preserve bar colours */
  [data-kinga-claims-report] .cr-score-summary { page-break-inside: avoid; border: 1px solid #ddd !important; }
  [data-kinga-claims-report] .cr-score-bar-fill { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  /* Persistent footer: dark background preserved for print */
  [data-kinga-claims-report] .cr-footer { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; page-break-inside: avoid; margin-top: 24px !important; }
  [data-kinga-claims-report] .cr-footer-bar { background: #1A2B4A !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  [data-kinga-claims-report] .cr-footer-bar * { color: #fff !important; }
  [data-kinga-claims-report] .cr-footer-bar .cr-footer-decision { border: 1px solid #fff !important; color: #fff !important; }
  /* Tables */
  [data-kinga-claims-report] table, [data-kinga-claims-report] td, [data-kinga-claims-report] th { border-color: #ddd !important; background: #fff !important; }
  /* Page breaks */
  [data-kinga-claims-report] .cr-section { page-break-inside: avoid; }
  /* Hide print button */
  [data-kinga-claims-report] .cr-no-print { display: none !important; }
  /* Photo grid: keep together */
  [data-kinga-claims-report] .cr-photo-grid { page-break-inside: avoid; }
}
`;

function useClaimsPrintCSS() {
  useEffect(() => {
    const id = 'kinga-claims-print-css';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = CLAIMS_PRINT_CSS;
    document.head.appendChild(el);
    return () => { document.getElementById(id)?.remove(); };
  }, []);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApprovalEntry {
  id: number;
  stageOrder: number | null;
  stageName: string | null;
  roleKey: string | null;
  actorName: string | null;
  decision: string;
  notes: string | null;
  actedAt: string | null;
}

interface WorkflowStage {
  stage_order: number;
  name: string;
  stage_name?: string;
  role_key: string;
  required: boolean;
}

interface KingaClaimsReportProps {
  claim: any;
  aiAssessment: any;
  enforcement: any;
  quotes?: any[];
  approvalHistory?: ApprovalEntry[];
  workflowStages?: WorkflowStage[];
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
   * Array of { index: number; url: string } matching enrichedPhotosJson entry indices.
   */
  resolvedPhotosOverride?: Array<{ index: number; url: string; resolved: boolean }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(Number(n))) return "N/A";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function makeFmtCurrency(code: string | null | undefined) {
  const sym = currencySymbol(code ?? "USD");
  return (n: number | null | undefined): string => {
    if (n == null || isNaN(Number(n)) || Number(n) === 0) return "—";
    return `${sym}${fmt(n)}`;
  };
}

function toTitleCase(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseJson(raw: any): any {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

// ─── Shared style tokens ─────────────────────────────────────────────────────

// ── Explicit hex tokens — always black-on-white regardless of theme ──
const C = {
  white:      "#ffffff",
  pageBg:     "#ffffff",
  cardBg:     "#ffffff",
  headerBg:   "#ffffff",
  border:     "#ddd",
  borderDark: "#bbb",
  text:       "#111",
  textMid:    "#333",
  textMuted:  "#666",
  accent:     "#1A2B4A",
  accentLight:"#ffffff",
};

const S = {
  card: {
    background: C.cardBg,
    borderRadius: "0",
    marginBottom: "24px",
    paddingBottom: "8px",
    borderBottom: `1px solid ${C.border}`,
  } as React.CSSProperties,
  cardHeader: {
    padding: "0 0 12px 0",
    background: "transparent",
  } as React.CSSProperties,
  cardBody: { padding: "0" } as React.CSSProperties,
  sectionNum: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: C.accent,
    color: C.white,
    fontSize: 11,
    fontWeight: 700,
    marginRight: 8,
    flexShrink: 0,
  } as React.CSSProperties,
  label: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: C.textMuted,
  },
  value: { fontSize: 13, fontWeight: 600, color: C.text },
  muted: { fontSize: 12, color: C.textMuted },
  divider: { borderTop: `1px solid ${C.border}`, margin: "12px 0" } as React.CSSProperties,
  th: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: C.textMuted,
    fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
    padding: "6px 10px",
    background: "#ffffff",
    borderBottom: `1px solid ${C.border}`,
    textAlign: "left" as const,
    whiteSpace: "nowrap" as const,
  },
  td: {
    fontSize: 12,
    color: C.textMid,
    padding: "6px 10px",
    borderBottom: `1px solid ${C.border}`,
    verticalAlign: "top" as const,
  },
};

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ num, title, subtitle, sectionKey, claimId, pipelineRunId }: { num: number; title: string; subtitle?: string; sectionKey?: string; claimId?: number; pipelineRunId?: number }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: subtitle ? 4 : 0 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 26, height: 26, borderRadius: "50%",
          background: "#1A2B4A", color: "#fff",
          fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}>{num}</span>
        <span style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#0f172a" }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: "#ddd", marginLeft: 4 }} />
        {sectionKey && claimId != null && (
          <ReportSectionThread
            claimId={claimId}
            sectionKey={sectionKey}
            pipelineRunId={pipelineRunId}
          />
        )}
      </div>
      {subtitle && <p style={{ ...S.muted, marginLeft: 36, marginTop: 0 }}>{subtitle}</p>}
    </div>
  );
}

// ─── KV row ───────────────────────────────────────────────────────────────────

function KVRow({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: wide ? "160px 1fr" : "140px 1fr", gap: 8, padding: "5px 0", borderBottom: "1px solid #e2e8f0" }}>
      <span style={S.label}>{label}</span>
      <span style={S.value}>{value ?? "—"}</span>
    </div>
  );
}

// ─── Verdict badge ────────────────────────────────────────────────────────────

/* FAR-02: VerdictBadge — B&W typographic hierarchy (border weight + background shade) */
function VerdictBadge({ decision }: { decision: string }) {
  const d = (decision ?? "").toUpperCase();
  let bg = "#f8f8f8"; let border = "1px solid #aaa"; let weight = 500;
  if (d === "FINALISE_CLAIM" || d === "APPROVE") { bg = "#fff"; border = "1px solid #aaa"; weight = 600; }
  else if (d === "REVIEW_REQUIRED" || d === "REVIEW") { bg = "#f8f8f8"; border = "1px solid #555"; weight = 700; }
  else if (d === "ESCALATE_INVESTIGATION" || d === "ESCALATE") { bg = "#f0f0f0"; border = "2px solid #111"; weight = 800; }
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 0, fontSize: 11, fontWeight: weight, background: bg, color: "#111", letterSpacing: "0.05em", border }}>
      {toTitleCase(d.replace(/_/g, " "))}
    </span>
  );
}

// ─── Fraud level badge ────────────────────────────────────────────────────────

/* FAR-02: FraudBadge — B&W typographic hierarchy */
function FraudBadge({ level }: { level: string }) {
  const l = (level ?? "").toUpperCase();
  let bg = "#fff"; let border = "1px solid #aaa"; let weight = 500;
  if (l === "MINIMAL" || l === "LOW") { bg = "#fff"; border = "1px solid #aaa"; weight = 500; }
  else if (l === "MODERATE") { bg = "#f8f8f8"; border = "1px solid #555"; weight = 600; }
  else if (l === "HIGH") { bg = "#f0f0f0"; border = "2px solid #111"; weight = 700; }
  else if (l === "CRITICAL") { bg = "#e8e8e8"; border = "2px solid #111"; weight = 800; }
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 0, fontSize: 11, fontWeight: weight, background: bg, color: "#111", border }}>
      {toTitleCase(l)}
    </span>
  );
}

// ─── Cost verdict badge ───────────────────────────────────────────────────────

/* FAR-02: CostVerdictBadge — B&W typographic hierarchy */
function CostVerdictBadge({ verdict }: { verdict: string }) {
  const v = (verdict ?? "").toUpperCase();
  let bg = "#fff"; let border = "1px solid #aaa"; let weight = 500;
  if (v === "FAIR") { bg = "#fff"; border = "1px solid #aaa"; weight = 500; }
  else if (v === "OVERPRICED") { bg = "#f0f0f0"; border = "2px solid #111"; weight = 700; }
  else if (v === "UNDERPRICED") { bg = "#f8f8f8"; border = "1px solid #555"; weight = 600; }
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 0, fontSize: 11, fontWeight: weight, background: bg, color: "#111", border }}>
      {toTitleCase(v)}
    </span>
  );
}

function ClientCostDecisionStrip({ costIntelligence, quotes, fmtCurrency, totalLossIndicated, repairToValueRatio, repairIntelligence }: { costIntelligence: any; quotes: any[]; fmtCurrency: (amount: number | null | undefined) => string; totalLossIndicated: boolean; repairToValueRatio: number | null; repairIntelligence?: unknown }) {
  const composite = costIntelligence?.compositeOptimisation ?? {};
  const ledger = Array.isArray(composite.canonicalQuoteLedger) ? composite.canonicalQuoteLedger : [];
  const activeLedger = ledger.filter((quote: any) => quote?.status === "active" || quote?.status === "supplementary");
  const legacyQuoteHistory = ledger.length === 0 ? classifyLegacyQuoteEvidenceRows(quotes) : [];
  const submittedQuotes = activeLedger.length > 0
    ? activeLedger.map((quote: any, index: number) => ({ name: quote.panelBeater ?? `Quote ${index + 1}`, amount: Number(quote.totalCostUsd ?? 0) || null }))
    : legacyQuoteHistory.filter((quote) => quote.status === "legacy_unverified").map((quote) => ({ name: quote.repairer, amount: quote.amountCents === null ? null : quote.amountCents / 100 }));
  const legacyHistoryQualified = ledger.length === 0 && submittedQuotes.length > 0;
  const complete = composite.isComplete === true && Number(composite.l2CompositeOptimisedCostUsd ?? 0) > 0;
  const reconciliationRequired = composite.allInReconciliationRequired === true || composite.l2Status === "reconciliation_required" || composite.quoteScopeStatus === "reconciliation_required";
  const missingComponents = Array.isArray(composite.missingRequiredComponents) ? composite.missingRequiredComponents.map(String) : [];
  const duplicateCount = Number(composite.duplicateQuotesExcluded ?? 0) || 0;
  const hasQuotes = submittedQuotes.length > 0;
  const costDecision = buildCostDecisionPresentationContract({
    quoteReceiptStatus: hasQuotes ? "quotes_received" : "no_quotes",
    activeQuoteCount: submittedQuotes.length,
    allInReconciliationRequired: reconciliationRequired,
    unreconciledQuoteCount: reconciliationRequired ? 1 : 0,
    l2IsComplete: complete,
    l2OptimisedCostUsd: complete ? Number(composite.l2CompositeOptimisedCostUsd) : null,
    l2EvidenceQualifiedComparisonUsd: Number(composite.l2EvidenceQualifiedComparisonUsd ?? composite.partialPricedScopeUsd ?? 0) || null,
    missingRequiredComponents: missingComponents,
    duplicateQuotesExcluded: duplicateCount,
    reconciliationRepairers: [],
  });
  const verification = costDecision.quoteVerification;
  const verificationColour = verification === "PASSED" ? "#14664f" : verification === "QUOTATION REQUIRED" ? "#526560" : "#8a5a00";
  const issue = costDecision.quoteIssue;
  const optimised = costDecision.optimisedQuoteAmount;
  const optimisedDetail = costDecision.optimisedQuoteDetail;
  const optimisedDisplay = optimised === null
    ? "Not published"
    : costDecision.optimisedQuoteState === "evidence_qualified"
      ? `Evidence-qualified comparison · ${fmtCurrency(optimised)}`
      : fmtCurrency(optimised);
  let repairEvidence: any = repairIntelligence;
  if (typeof repairEvidence === "string") {
    try { repairEvidence = JSON.parse(repairEvidence); } catch { repairEvidence = null; }
  }
  const structuralReview = repairEvidence?.structuralReview;
  const structuralReviewRequired = repairEvidence?.structuralReviewRequired === true
    || repairEvidence?.requiresStructuralReview === true
    || structuralReview?.required === true;
  const structuralReviewDetail = [repairEvidence?.structuralReviewDetail, repairEvidence?.structuralReviewRationale, repairEvidence?.structuralReviewNote, structuralReview?.detail, structuralReview?.rationale]
    .find((value) => typeof value === "string" && value.trim());
  const repairability = totalLossIndicated
    ? { label: "Total loss indicated", detail: "Repair-versus-replace assessment indicates total loss." }
    : structuralReviewRequired
      ? { label: "Further structural review required", detail: structuralReviewDetail ?? "Structural condition requires further review before final repairability confirmation." }
    : repairToValueRatio === null
      ? { label: "Repairable with conditions", detail: "Repairability is subject to confirmation of the repair-to-value assessment." }
      : { label: "Repairable", detail: "Repair-versus-replace assessment supports repair." };

  return (
    <div style={{ margin: "0 0 14px", border: "1px solid #d8e2df", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderBottom: "1px solid #d8e2df" }}>
        <p style={{ ...S.label, color: "#15352f", margin: 0 }}>Cost Decision Summary</p>
        <span style={{ fontSize: 9, fontWeight: 700, color: verificationColour }}>KINGA Quote Verification · {verification}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.08fr 1fr .96fr .88fr .92fr" }}>
          <div style={{ padding: 10, borderRight: "1px solid #d8e2df" }}>
          <p style={S.label}>Submitted Quotations</p>
          <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {submittedQuotes.length > 0 ? submittedQuotes.map((quote: { name: string; amount: number | null }, index: number) => <span key={`${quote.name}-${index}`} style={{ fontSize: 10, padding: "3px 5px", color: "#35514a", border: "1px solid #d8e2df" }}>{quote.name} <strong style={{ color: "#15352f" }}>{fmtCurrency(quote.amount)}</strong></span>) : <span style={S.muted}>No submitted quotations</span>}
          </div>
          {legacyHistoryQualified && <p style={{ ...S.muted, fontSize: 10, margin: "5px 0 0", color: "#8a5a00" }}>Legacy quotation history — not active comparison evidence until ledger verification.</p>}
        </div>
        <div style={{ padding: 10, borderRight: "1px solid #d8e2df" }}><p style={S.label}>KINGA Quote Verification</p><p style={{ fontSize: 13, fontWeight: 800, color: verificationColour, margin: "5px 0 3px" }}>{verification}</p><p style={{ ...S.muted, fontSize: 10, margin: 0 }}>{costDecision.quoteVerificationDetail}</p></div>
        <div style={{ padding: 10, borderRight: "1px solid #d8e2df" }}><p style={S.label}>{costDecision.optimisedQuoteLabel}</p><p style={{ fontSize: costDecision.optimisedQuoteState === "evidence_qualified" ? 12 : 18, fontWeight: 800, color: "#0d5849", margin: "4px 0 3px" }}>{optimisedDisplay}</p><p style={{ ...S.muted, fontSize: 10, margin: 0 }}>{optimisedDetail}</p></div>
        <div style={{ padding: 10 }}><p style={S.label}>Quote Issues</p><p style={{ fontSize: 11, fontWeight: 800, color: verification === "PASSED" ? "#14664f" : "#8a5a00", margin: "5px 0 3px" }}>{verification === "PASSED" ? "None" : "Review required"}</p><p style={{ ...S.muted, fontSize: 10, margin: 0 }}>{issue}</p></div>
        <div style={{ padding: 10, borderLeft: "1px solid #d8e2df" }}><p style={S.label}>Repairability</p><p style={{ fontSize: 11, fontWeight: 800, color: "#15352f", margin: "5px 0 3px" }}>{repairability.label}</p><p style={{ ...S.muted, fontSize: 10, margin: 0 }}>{repairability.detail}</p></div>
      </div>
    </div>
  );
}

// ─── Fraud score bar ──────────────────────────────────────────────────────────

/* FAR-02: FraudScoreBar — B&W bar using greyscale fill intensity */
function FraudScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  /* Low risk = light grey fill, high risk = dark grey/black fill */
  let barColor = "#aaaaaa";
  if (pct >= 40) barColor = "#555555";
  if (pct >= 65) barColor = "#111111";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 6, background: "#e5e7eb", borderRadius: 0, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 0, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", minWidth: 36 }}>{pct}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// ─── Role label map ──────────────────────────────────────────────────────────
const ROLE_LABELS_KCR: Record<string, string> = {
  claims_processor: "Claims Processor",
  assessor_internal: "Internal Assessor",
  external_assessor: "External Assessor",
  risk_manager: "Risk Manager",
  claims_manager: "Claims Manager",
  executive: "Executive",
  underwriter: "Underwriter",
};

// Decision badge styles — strict B&W to match the rest of the report format.
// No colour: all badges use white background, black text, grey border.
// The decision label alone conveys the outcome.
const DECISION_STYLES_KCR: Record<string, { label: string; bg: string; color: string; border: string }> = {
  approved:          { label: "Approved",      bg: "#ffffff", color: "#0f172a", border: "#334155" },
  rejected:          { label: "Rejected",      bg: "#ffffff", color: "#0f172a", border: "#334155" },
  returned:          { label: "Returned",      bg: "#ffffff", color: "#0f172a", border: "#334155" },
  escalated:         { label: "Escalated",     bg: "#ffffff", color: "#0f172a", border: "#334155" },
  external_received: { label: "Ext. Received", bg: "#ffffff", color: "#0f172a", border: "#334155" },
};

export function KingaClaimsReport({ claim, aiAssessment, enforcement, quotes = [], approvalHistory = [], workflowStages = [], claimId, pipelineRunId, isDraft = false, draftMissingFields = [], resolvedPhotosOverride }: KingaClaimsReportProps) {
  const e = enforcement as any;
  const phase2 = e?._phase2 as any;
  const ci = parseJson(aiAssessment?.costIntelligenceJson);
  const fraudBd = parseJson(aiAssessment?.fraudScoreBreakdownJson);
  const damagedPartsRaw = parseJson(aiAssessment?.damagedComponentsJson);
  // Normalise component names to title case and deduplicate by normalised name
  const damagedParts: any[] = (() => {
    if (!Array.isArray(damagedPartsRaw)) return [];
    const seen = new Set<string>();
    return damagedPartsRaw.filter((p: any) => {
      const normName = toTitleCase((p.name ?? '').toLowerCase().trim());
      if (seen.has(normName)) return false;
      seen.add(normName);
      return true;
    }).map((p: any) => ({ ...p, name: toTitleCase((p.name ?? '').toLowerCase().trim()) || p.name }));
  })();

  const currCode = claim?.currencyCode ?? "USD";
  const fmtC = makeFmtCurrency(currCode);

  // Market value: prefer valuation engine output (Stage 5c) over claim-form stated value
  // aiAssessment._claimRecord is the parsed ClaimRecord exposed by the byClaim tRPC procedure
  const _claimRecord0 = aiAssessment?._claimRecord ?? null;
  const _valResult = _claimRecord0?.valuation ?? null;
  const marketValueUsd: number | null = _valResult?.marketValueUsd ?? _claimRecord0?.vehicle?.marketValueUsd ?? null;
  const marketValueSource: string | null = _valResult?.dataSource
    ? _valResult.dataSource
    : _valResult?.valuationMethod === 'document_stated'
      ? 'Stated on claim form'
      : _valResult?.valuationMethod === 'llm_estimate'
        ? 'KINGA estimate'
        : marketValueUsd
          ? 'Stated on claim form'
          : null;

  // Decision — CTL unified decision takes priority when available
  const _ctl0 = (e as any)?._claimTruth;
  const decision: string = _ctl0?.decision?.recommendation ?? e?.finalDecision?.decision ?? phase2?.finalDecision ?? "REVIEW_REQUIRED";
  const primaryReason: string = _ctl0?.decision?.reasoning ?? e?.finalDecision?.primaryReason ?? phase2?.keyDrivers?.[0] ?? "";
  const recommendedActions: string[] = _ctl0?.decision?.actions ?? e?.finalDecision?.recommendedActions ?? [];

  // Fraud
  const fraudScore: number = e?.fraudScoreBreakdown?.totalScore ?? aiAssessment?.fraudScore ?? 0;
  const fraudLevel: string = e?.fraudLevelLabel ?? e?.fraudLevelEnforced ?? "Unknown";
  const fraudReason: string = (() => {
    const comps: any[] = e?.fraudScoreBreakdown?.components ?? [];
    const top = comps.sort((a: any, b: any) => (b.contribution ?? 0) - (a.contribution ?? 0))[0];
    return top ? `${toTitleCase(top.factor ?? "")} (${top.contribution ?? 0} pts)` : primaryReason;
  })();

  // Cost — CTL override when available
  const ctl = (e as any)?._claimTruth;
  const aiEstimate: number = ctl?.costBasis?.kingaEstimateUsd ?? (ci?.aiEstimateCents ?? 0) / 100;
  const costVerdict: string = ctl?.costBasis?.verdict ?? e?.costVerdict?.verdict ?? ci?.costVerdict ?? "NO_QUOTE";
  const deviationPct: number | null = ctl?.costBasis?.deviationPercent ?? e?.costVerdict?.deviationPercent ?? null;
  const fairMin: number = (e?.costBenchmark?.estimatedFairMin ?? 0);
  const fairMax: number = (e?.costBenchmark?.estimatedFairMax ?? 0);

  // Physics
  const physicsScore: number = phase2?.physicsConsistency ?? e?.consistencyFlag?.score ?? 0;
  const physicsConsistent: boolean = physicsScore >= 60;
  const physicsInsight: string = e?.physicsInsight ?? "";

  // Damage
  const damageZones: string[] = (() => {
    const raw = phase2?.damageZones ?? aiAssessment?.damageZones;
    if (Array.isArray(raw)) return raw;
    return [];
  })();
  const overallSeverity: string = aiAssessment?.structuralDamageSeverity ?? aiAssessment?.overallSeverity ?? "unknown";
  const structuralDamage: boolean = !!(aiAssessment?.structuralDamageSeverity && aiAssessment.structuralDamageSeverity !== "none");

  // ── Photo parsing ──────────────────────────────────────────────────────────
  // CRITICAL FIX: Use enrichedPhotosJson (per-photo KINGA vision metadata) as the
  // primary source. Each entry has { url, caption, detectedComponents,
  // impactZone, severity } derived from what KINGA actually SAW in that
  // specific image. This prevents the false caption problem where photo[i]
  // was labelled with damagedParts[i] purely by array index.
  //
  // Fallback chain:
  //   1. enrichedPhotosJson  — richest: url + KINGA-verified caption per photo
  //   2. damagePhotosJson    — may contain DamagePhoto objects or plain URLs
  //   3. enforcement damagePhotoUrls — plain URL array
  //   4. legacy photoUrls / processedPhotoUrls
  interface EnrichedPhoto {
    url: string;
    caption: string;
    detectedComponents: string[];
    impactZone: string;
    severity: string;
  }
  // Build a lookup map from resolvedPhotosOverride for O(1) URL swapping
  const _resolvedUrlMap = new Map<number, string>();
  if (resolvedPhotosOverride) {
    for (const r of resolvedPhotosOverride) {
      if (r.resolved) _resolvedUrlMap.set(r.index, r.url);
    }
  }
  const enrichedPhotos: EnrichedPhoto[] = (() => {
    const raw = aiAssessment?.enrichedPhotosJson;
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
            .filter((p: any) => p?.url)
            .map((p: any, idx: number) => ({
              // Use resolved PNG URL if available, otherwise use stored URL
              url: _resolvedUrlMap.get(p.index ?? idx) ?? p.url,
              caption: p.caption ?? (Array.isArray(p.detectedComponents) && p.detectedComponents.length > 0
                ? p.detectedComponents.slice(0, 3).join(', ')
                : `Photo ${(p.index ?? idx) + 1}`),
              detectedComponents: Array.isArray(p.detectedComponents) ? p.detectedComponents : [],
              impactZone: p.impactZone ?? 'unknown',
              severity: p.severity ?? 'unknown',
            }));
        }
      } catch { /* fall through */ }
    }
    return [];
  })();
  // Build allPhotoUrls — needed for the count display
  const allPhotoUrls: string[] = (() => {
    if (enrichedPhotos.length > 0) return enrichedPhotos.map(p => p.url);
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
    if (Array.isArray(aiAssessment?.damagePhotoUrls) && aiAssessment.damagePhotoUrls.length > 0) {
      return aiAssessment.damagePhotoUrls;
    }
    return aiAssessment?.photoUrls ?? aiAssessment?.processedPhotoUrls ?? [];
  })();
  // Filter out non-damage photos when enriched data is available.
  // An enriched photo is considered non-damage when KINGA detected zero components
  // AND the caption explicitly states no damage was found (e.g. dashboard/odometer shots).
  // We keep at least 2 photos even if all are non-damage (better than an empty grid).
  const filteredEnrichedPhotos: typeof enrichedPhotos = (() => {
    if (enrichedPhotos.length === 0) return [];
    const damageOnly = enrichedPhotos.filter(p => {
      const hasComponents = p.detectedComponents.length > 0;
      const captionNoDamage = /no damage/i.test(p.caption);
      return hasComponents || !captionNoDamage;
    });
    return damageOnly.length >= 2 ? damageOnly : enrichedPhotos;
  })();
  // Build filtered URL list — use filtered enriched when available, else all URLs
  const filteredPhotoUrls: string[] = filteredEnrichedPhotos.length > 0
    ? filteredEnrichedPhotos.map(p => p.url)
    : allPhotoUrls;
  // Show all available damage photos up to 6 — grid adapts to however many are present
  const photoUrls: string[] = filteredPhotoUrls.slice(0, 6);
  // Slice enrichedPhotos to match (empty array if no enriched data available)
  const displayPhotos = filteredEnrichedPhotos.length > 0 ? filteredEnrichedPhotos.slice(0, 6) : [];

  // Quote comparison
  const quoteSimilarity = fraudBd?.quoteSimilarity ?? null;
  const isCopyQuote: boolean = quoteSimilarity?.overall_verdict === "confirmed" || quoteSimilarity?.overall_verdict === "suspected";
  const perComponentBenchmarks: Record<string, any> = ci?.perComponentBenchmarks ?? {};

  // Build unified quote rows
  const allDescriptions: string[] = (() => {
    const set = new Set<string>();
    quotes.forEach((q: any) => (q.lineItems ?? []).forEach((li: any) => set.add(expandShorthand((li.description ?? "").trim()))));
    return Array.from(set).filter(Boolean);
  })();

  // Confidence
  const confidenceScore: number = e?.confidenceBreakdown?.score ?? aiAssessment?.confidenceScore ?? 0;

  // Data completeness — derived from confidence breakdown or photo/document counts
  const dataCompleteness: number = (() => {
    const cb = e?.confidenceBreakdown;
    if (cb?.dataCompleteness != null) return Number(cb.dataCompleteness);
    // Approximate: photos submitted + quote submitted + incident description present
    let score = 0;
    if (allPhotoUrls.length >= 4) score += 40;
    else if (allPhotoUrls.length >= 1) score += 20;
    if (quotes.length > 0) score += 30;
    if (claim?.incidentDescription || aiAssessment?.incidentDescription) score += 20;
    if (claim?.vehicleRegistration || claim?.vehicleVin) score += 10;
    return Math.min(100, score);
  })();

  // Decision colour helper
  const decisionColor = (() => {
    const d = (decision ?? '').toUpperCase();
    if (d === 'DECLINE' || d === 'DECLINED' || d === 'REJECT' || d === 'REJECTED') return '#c00';
    if (d.includes('REVIEW') || d === 'REFER' || d === 'PENDING') return '#c8a000';
    return '#2e7d32';
  })();

  // Date
  const reportDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  useClaimsPrintCSS();

  return (
    <div
      data-kinga-claims-report
      data-claim-number={claim?.claimNumber ?? claim?.claimReference ?? `#${claim?.id ?? ''}`}
      data-report-date={reportDate}
      style={{
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        background: "#ffffff",
        color: "#111",
        maxWidth: 900,
        margin: "0 auto",
        padding: "24px 16px",
      }}
    >
      {/* ── DRAFT Banner (only shown when isDraft=true) ── */}
      {isDraft && (
        <div style={{ background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 6, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#92400e', letterSpacing: '0.08em', flexShrink: 0 }}>DRAFT</span>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#92400e', margin: 0 }}>This report is incomplete and has been exported as a draft.</p>
            {draftMissingFields.length > 0 && (
              <p style={{ fontSize: 11, color: '#b45309', margin: '3px 0 0' }}>Missing: {draftMissingFields.join(', ')}. Complete these fields and re-export for the final version.</p>
            )}
          </div>
        </div>
      )}
      {/* ── Report Header ── */}
      <div style={{ marginBottom: 0, paddingBottom: 14, borderBottom: "2px solid #1A2B4A" }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#64748b", margin: 0 }}>
              KINGA Intelligence
            </p>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "4px 0 2px" }}>
              Claims Assessment Report
            </h1>
            <p style={{ ...S.muted }}>
              Claim {claim?.claimNumber ?? claim?.claimReference ?? `#${claim?.id}`} &nbsp;·&nbsp; {reportDate}
            </p>
            {e?.kingaRef && (
              <p style={{ fontSize: 11, fontWeight: 800, fontFamily: 'Inter,sans-serif', color: '#1A2B4A', letterSpacing: '0.05em', marginTop: 2 }}>
                {e.kingaRef}-CL
                <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 400, color: '#666', fontSize: 10, marginLeft: 6 }}>Claims Assessment Report</span>
              </p>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ ...S.muted, marginBottom: 4 }}>Confidence: {confidenceScore}%</p>
          </div>
        </div>
      </div>

      {/* ── Full-width Decision Verdict Banner ── */}
      <div className="cr-verdict-banner" style={{ margin: '0 0 20px', padding: '14px 20px', background: `${decisionColor}12`, border: `2px solid ${decisionColor}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="cr-verdict-label" style={{ fontFamily: "'IBM Plex Mono','Courier New',monospace", fontSize: 22, fontWeight: 900, color: decisionColor, letterSpacing: '0.08em' }}>
            {(decision ?? '').toUpperCase().replace(/_/g, ' ')}
          </span>
          {primaryReason && (
            <span className="cr-verdict-reason" style={{ fontSize: 11, color: '#555', fontStyle: 'italic', maxWidth: 380 }}>{primaryReason}</span>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888', margin: '0 0 2px' }}>KINGA Confidence</p>
          <span className="cr-verdict-confidence" style={{ fontFamily: "'IBM Plex Mono','Courier New',monospace", fontSize: 16, fontWeight: 700, color: decisionColor }}>{confidenceScore}<span style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>/100</span></span>
        </div>
      </div>

      {/* ── Score Summary Bars ── */}
      <div className="cr-score-summary" style={{ margin: '0 0 20px', border: '1px solid #e2e8f0', background: '#ffffff', overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#0f172a', margin: 0 }}>Assessment Score Summary</p>
        </div>
        <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          {[
            { label: 'Fraud Risk', value: fraudScore, lowGood: true, note: fraudScore >= 70 ? 'HIGH RISK' : fraudScore >= 40 ? 'MODERATE' : 'LOW RISK' },
            { label: 'Physics Consistency', value: physicsScore, lowGood: false, note: physicsScore >= 70 ? 'CONSISTENT' : physicsScore >= 30 ? 'MINOR ANOMALY' : 'ANOMALY' },
            { label: 'Data Completeness', value: dataCompleteness, lowGood: false, note: dataCompleteness >= 80 ? 'COMPLETE' : dataCompleteness >= 50 ? 'PARTIAL' : 'INCOMPLETE' },
          ].map(bar => {
            const barColor = bar.lowGood
              ? (bar.value >= 70 ? '#c00' : bar.value >= 40 ? '#c8a000' : '#2e7d32')
              : (bar.value >= 70 ? '#2e7d32' : bar.value >= 30 ? '#c8a000' : '#c00');
            return (
              <div key={bar.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888' }}>{bar.label}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: barColor, letterSpacing: '0.06em' }}>{bar.note}</span>
                </div>
                <div style={{ height: 10, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: 10, width: `${Math.min(100, Math.round(bar.value))}%`, background: barColor, borderRadius: 4 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 9, color: '#aaa' }}>0</span>
                  <span style={{ fontFamily: "'IBM Plex Mono','Courier New',monospace", fontSize: 13, fontWeight: 700, color: barColor }}>{Math.round(bar.value)}<span style={{ fontSize: 10, color: '#888', fontWeight: 400 }}>/100</span></span>
                  <span style={{ fontSize: 9, color: '#aaa' }}>100</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ══ SECTION 1 — Executive Decision Summary ══ */}
        <div style={S.card}>
          <SectionHeader num={1} title="Executive Decision Summary" sectionKey="executive_summary" claimId={claimId} pipelineRunId={pipelineRunId} />
          <div style={S.cardBody}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              {[
                { label: "Decision", value: <VerdictBadge decision={decision} /> },
                { label: "Fraud Risk", value: <FraudBadge level={fraudLevel} /> },
                { label: "Cost Verdict", value: <CostVerdictBadge verdict={costVerdict} /> },
              ].map((item, i) => (
                <div key={i} style={{ padding: "10px 12px", background: "#ffffff", borderRadius: 0 }}>
                  <p style={S.label}>{item.label}</p>
                  <div style={{ marginTop: 5 }}>{item.value}</div>
                </div>
              ))}
            </div>

            <ClientCostDecisionStrip
              costIntelligence={ci}
              quotes={quotes}
              fmtCurrency={fmtC}
              totalLossIndicated={Boolean(aiAssessment?.totalLossIndicated ?? aiAssessment?.total_loss_indicated ?? claim?.totalLossIndicated ?? claim?.total_loss_indicated)}
              repairToValueRatio={(() => {
                const value = aiAssessment?.repairToValueRatio ?? aiAssessment?.repair_to_value_ratio ?? ci?.repairToValuePct ?? ci?.repair_to_value_ratio;
                return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
              })()}
              repairIntelligence={aiAssessment?.repairIntelligence ?? aiAssessment?.repair_intelligence_json ?? aiAssessment?.repairIntelligenceJson ?? ci?.repairIntelligence ?? ci?.repair_intelligence_json}
            />

            {primaryReason && (
              <div style={{ padding: "10px 12px", background: "#ffffff", borderRadius: 0, marginBottom: 10 }}>
                <p style={S.label}>Primary Reason</p>
                <p style={{ ...S.value, marginTop: 4, fontWeight: 500 }}>{primaryReason}</p>
              </div>
            )}

            {recommendedActions.length > 0 && (
              <div>
                <p style={{ ...S.label, marginBottom: 6 }}>Recommended Actions</p>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {recommendedActions.slice(0, 4).map((a: string, i: number) => (
                    <li key={i} style={{ fontSize: 12, color: "#0f172a", marginBottom: 3 }}>{a}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>

        {/* ══ SECTION 2 — Workflow & Actions ══ */}
        <div style={S.card}>
          <SectionHeader num={2} title="Claim Status & Workflow" sectionKey="workflow" claimId={claimId} pipelineRunId={pipelineRunId} />
          <div style={S.cardBody}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              <KVRow label="Claim Status" value={toTitleCase(claim?.status ?? "")} />
              <KVRow label="Review Status" value={toTitleCase(claim?.reviewStatus ?? "")} />
              <KVRow label="Claim Reference" value={claim?.claimNumber ?? claim?.claimReference ?? "—"} />
              {e?.kingaRef && <KVRow label="KINGA Reference" value={`${e.kingaRef}-CL`} />}
              <KVRow label="Policy Number" value={aiAssessment?.policyNumber ?? claim?.policyNumber ?? "—"} />
              <KVRow label="Insurer" value={aiAssessment?.insurerName ?? claim?.insurerName ?? "—"} />
              <KVRow label="Product Type" value={aiAssessment?.productType ?? claim?.productType ?? "—"} />
            </div>
          </div>
        </div>

        {/* ══ SECTION 3 — Vehicle & Policy Information ══ */}
        <div style={S.card}>
          <SectionHeader num={3} title="Vehicle & Policy Information" sectionKey="vehicle_policy" claimId={claimId} pipelineRunId={pipelineRunId} />
          <div style={S.cardBody}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              <KVRow label="Make / Model" value={`${claim?.vehicleMake ?? ""} ${claim?.vehicleModel ?? ""}`.trim() || "—"} />
              <KVRow label="Year" value={claim?.vehicleYear ?? "—"} />
              <KVRow label="Registration" value={claim?.vehicleRegistration ?? aiAssessment?.vehicleRegistration ?? "—"} />
              <KVRow label="VIN" value={aiAssessment?.vinNumber ?? claim?.vinNumber ?? "—"} />
              <KVRow label="Colour" value={aiAssessment?.vehicleColour ?? claim?.vehicleColour ?? "—"} />
              <KVRow label="Body Type" value={toTitleCase(aiAssessment?.vehicleBodyType ?? claim?.vehicleBodyType ?? "—")} />
              <KVRow label="Incident Date" value={claim?.incidentDate ? new Date(claim.incidentDate).toLocaleDateString("en-GB") : "—"} />
              <KVRow label="Incident Type" value={toTitleCase(aiAssessment?.accidentType ?? claim?.incidentType ?? "—")} />
              <KVRow label="Police Report #" value={aiAssessment?.policeReportNumber ?? claim?.policeReportNumber ?? "—"} />
              <KVRow label="Driver Licence" value={aiAssessment?.driverLicenseNumber ?? claim?.driverLicenseNumber ?? "—"} />
              {marketValueUsd != null && (
                <KVRow label="Market Value" value={fmtC(marketValueUsd)} wide />
              )}
              {marketValueSource && (
                <KVRow label="Valuation Basis" value={marketValueSource} wide />
              )}
            </div>
          </div>
        </div>

        {/* ══ SECTION 4 — Damage Assessment ══ */}
        <div style={S.card}>
          <SectionHeader num={4} title="Damage Assessment" subtitle="KINGA vision analysis of submitted damage photographs" sectionKey="damage_assessment" claimId={claimId} pipelineRunId={pipelineRunId} />
          <div style={S.cardBody}>
            {/* Damage summary row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[
                { label: "Overall Severity", value: toTitleCase(overallSeverity) },
                { label: "Structural Damage", value: structuralDamage ? "Detected" : "Not Detected" },
                { label: "Damage Zones", value: damageZones.length > 0 ? damageZones.map(toTitleCase).join(", ") : "—" },
              ].map((item, i) => (
                <div key={i} style={{ padding: "8px 12px", background: "#ffffff", borderRadius: 0 }}>
                  <p style={S.label}>{item.label}</p>
                  <p style={{ ...S.value, marginTop: 3, fontSize: 12 }}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Damaged components detail is in Section 5 Component Matrix — not repeated here */}

            {/* Photo grid — shows all available damage photos (1–6), layout adapts */}
            {photoUrls.length > 0 && (
              <div>
                <div style={S.divider} />
                <p style={{ ...S.label, marginBottom: 8 }}>Damage Photographs ({photoUrls.length}{allPhotoUrls.length > photoUrls.length ? ` of ${allPhotoUrls.length}` : ''} shown)</p>

                {(() => {
                  const featuredUrls = photoUrls.slice(0, 6);
                  const remainingUrls = photoUrls.slice(6);
                  const SEV_COL: Record<string, string> = {
                    catastrophic: '#7f1d1d', severe: '#9a3412', moderate: '#92400e', minor: '#14532d', cosmetic: '#1e3a5f',
                  };
                  const SEV_BG: Record<string, string> = {
                    catastrophic: '#fef2f2', severe: '#fff7ed', moderate: '#fffbeb', minor: '#f0fdf4', cosmetic: '#eff6ff',
                  };
                  return (
                    <>
                      {/* ── TIER 1: Featured — 2-column card grid, contain image, left severity bar ── */}
                      <div style={{ display: 'grid', gridTemplateColumns: featuredUrls.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: 8 }}>
                        {featuredUrls.map((url: string, i: number) => {
                          const enriched = displayPhotos[i];
                          const caption = enriched
                            ? expandShorthand(enriched.caption)
                            : (() => {
                                const part = damagedParts[i];
                                return part
                                  ? `${expandShorthand(part.name ?? "")} — ${toTitleCase(part.severity ?? "")} ${toTitleCase(part.damageType ?? "")}`
                                  : damageZones[i] ? toTitleCase(damageZones[i]) : `Photo ${i + 1}`;
                              })();
                          const sev = (enriched?.severity ?? '').toLowerCase();
                          const zone = enriched?.impactZone && enriched.impactZone !== 'unknown' ? toTitleCase(enriched.impactZone) : null;
                          const parts = enriched?.detectedComponents ?? [];
                          const sevCol = SEV_COL[sev] ?? '#475569';
                          const sevBg = SEV_BG[sev] ?? '#f8fafc';
                          return (
                            <div key={i} style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 5, overflow: 'hidden', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                              {/* Severity left-edge bar */}
                              <div style={{ width: 3, flexShrink: 0, background: sevCol, opacity: 0.8 }} />
                              {/* Image: contain so full page renders cleanly */}
                              <div style={{ width: 130, minWidth: 130, flexShrink: 0, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 110 }}>
                                <img src={url} alt={caption}
                                  style={{ maxWidth: '100%', maxHeight: 130, objectFit: 'contain', display: 'block' }}
                                  onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }}
                                />
                                <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(15,23,42,0.6)', color: '#fff', fontSize: 7.5, fontWeight: 800, padding: '1px 5px', borderRadius: 2, letterSpacing: '0.05em' }}>
                                  {String(i + 1).padStart(2, '0')}
                                </div>
                              </div>
                              {/* Summary panel */}
                              <div style={{ flex: 1, padding: '9px 10px', display: 'flex', flexDirection: 'column', minWidth: 0, gap: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                                  <p style={{ fontSize: 9.5, fontWeight: 700, color: '#0f172a', margin: 0, lineHeight: 1.35, flex: 1 }}>{caption}</p>
                                  {sev && (
                                    <span style={{ fontSize: 7.5, fontWeight: 700, color: sevCol, background: sevBg, border: `1px solid ${sevCol}25`, borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                      {sev}
                                    </span>
                                  )}
                                </div>
                                {(zone || parts.length > 0) && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    {zone && (
                                      <span style={{ fontSize: 7.5, fontWeight: 600, color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 3, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{zone}</span>
                                    )}
                                    {parts.slice(0, 3).map((p: string, pi: number) => (
                                      <span key={pi} style={{ fontSize: 7.5, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 3, padding: '1px 5px' }}>{p}</span>
                                    ))}
                                    {parts.length > 3 && <span style={{ fontSize: 7.5, color: '#94a3b8', padding: '1px 3px' }}>+{parts.length - 3}</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* ── TIER 2: Supporting thumbnails — 4-column grid, contain image, top-border accent ── */}
                      {remainingUrls.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                            <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                            <p style={{ fontSize: 8, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, whiteSpace: 'nowrap' }}>
                              {remainingUrls.length} additional image{remainingUrls.length !== 1 ? 's' : ''} · see Forensic Audit Report for full analysis
                            </p>
                            <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                            {remainingUrls.map((url: string, ri: number) => {
                              const globalIdx = ri + 6;
                              const enriched = displayPhotos[globalIdx];
                              const sev = (enriched?.severity ?? '').toLowerCase();
                              const sevCol = SEV_COL[sev] ?? '#475569';
                              const caption = enriched
                                ? expandShorthand(enriched.caption)
                                : (() => {
                                    const part = damagedParts[globalIdx];
                                    return part ? expandShorthand(part.name ?? '') : `Photo ${globalIdx + 1}`;
                                  })();
                              return (
                                <div key={ri} style={{ border: '1px solid #e2e8f0', borderRadius: 4, overflow: 'hidden', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                                  <div style={{ background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, position: 'relative' }}>
                                    <img src={url} alt={caption}
                                      style={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain', display: 'block' }}
                                      onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                    <div style={{ position: 'absolute', top: 3, left: 3, background: 'rgba(15,23,42,0.6)', color: '#fff', fontSize: 7, fontWeight: 800, padding: '1px 4px', borderRadius: 2 }}>
                                      {String(globalIdx + 1).padStart(2, '0')}
                                    </div>
                                  </div>
                                  <div style={{ padding: '4px 6px', borderTop: `2px solid ${sev ? sevCol : '#e2e8f0'}` }}>
                                    <p style={{ fontSize: 7.5, fontWeight: 600, color: '#0f172a', margin: 0, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{caption}</p>
                                    {sev && <p style={{ fontSize: 7, fontWeight: 700, color: sevCol, margin: '1px 0 0 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{sev}</p>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* ══ SECTION 5 — Quote Comparison & Cost Optimisation ══ */}
        <div style={S.card}>
          <SectionHeader
            num={5}
            title="Quotation & Cost Optimisation"
            subtitle="Quote analysis with KINGA benchmark reference"
            sectionKey="quote_analysis"
            claimId={claimId}
            pipelineRunId={pipelineRunId}
          />
          <div style={S.cardBody}>
            {/* Copy-quote alert */}
            {isCopyQuote && (
              <div style={{ padding: "8px 12px", marginBottom: 14, background: "#fffbeb", border: "1px solid #fbbf24" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#92400e", margin: 0 }}>
                  ⚠ Copy-Quotation Detected
                </p>
                <p style={{ fontSize: 11, color: "#78350f", marginTop: 2 }}>
                  Structural similarity analysis indicates {quoteSimilarity?.overall_verdict === "confirmed" ? "confirmed" : "suspected"} copy-quotation.
                  {quoteSimilarity?.pairs?.[0] && ` Highest pair similarity: ${Math.round((quoteSimilarity.pairs[0].overall_similarity ?? 0) * 100)}%.`}
                  {" "}Independent quotes are required for a valid comparison.
                </p>
              </div>
            )}

            {/* ── Unified Cost Matrix Table (shared ComponentCostMatrix) ── */}
            {(() => {
              const compOpt = (ci as any)?.compositeOptimisation ?? null;
              const quoteComparisonEvidence = resolveQuoteComparisonEvidence(quotes, compOpt);
              const { comparisonQuotes, legacyHistory: matrixLegacyHistory, legacyHistoryQualified } = quoteComparisonEvidence;
              const compositeLineItems: any[] = compOpt?.compositeLineItems ?? [];
              const l1 = legacyHistoryQualified ? null : (compOpt?.l1LowestSubmittedCostUsd ?? compOpt?.l1SubmittedCostUsd ?? null);
              const l2 = !legacyHistoryQualified && compOpt?.isComplete === true
                ? compOpt?.l2CompositeOptimisedCostUsd ?? null
                : null;
              const evidenceQualifiedL2 = !legacyHistoryQualified && l2 === null && compOpt?.l2Status === "evidence_qualified"
                ? compOpt?.l2EvidenceQualifiedComparisonUsd ?? compOpt?.partialPricedScopeUsd ?? null
                : null;
              const nfs = compOpt?.negotiationFeasibilityScore ?? null;
              const qndFlags: any[] = compOpt?.quotedNotDamaged ?? [];
              const dnqFlags: any[] = compOpt?.damagedNotQuoted ?? [];
              const savingsUsd: number | null = legacyHistoryQualified ? null : (compOpt?.savingsL1vsL2Usd ?? (l1 != null && l2 != null ? l1 - l2 : null));
              const savingsPct: number | null = savingsUsd != null && l1 != null && l1 > 0
                ? Math.round((savingsUsd / l1) * 1000) / 10
                : null;

              // Build MatrixQuote array
              const matrixQuotes: MatrixQuote[] = comparisonQuotes.map((q: any, qi: number) => ({
                name: q.panelBeaterName ?? q.repairerName ?? q.repairer_name ?? `Quote ${qi + 1}`,
                total: (q.lineItems ?? []).length > 0
                  ? (q.lineItems as any[]).reduce((sum: number, li: any) => sum + Number(li.lineTotal ?? 0), 0)
                  : Number(q.quotedAmount ?? 0) / 100,
                lineItems: (q.lineItems ?? []).map((li: any) => ({
                  description: expandShorthand((li.description ?? "").trim()),
                  lineTotal: Number(li.lineTotal ?? 0),
                  is_non_part_cost: li.is_non_part_cost ?? false,
                })),
                isFlagged: isCopyQuote && (quoteSimilarity?.pairs ?? []).some(
                  (p: any) => p.quoteA_index === qi || p.quoteB_index === qi
                ),
              }));

              // Build rows
              const matrixRows = compositeLineItems.length > 0
                ? buildRowsFromComposite(compositeLineItems, matrixQuotes)
                : buildRowsFromLineItems(matrixQuotes);

              const quoteScopeState = legacyHistoryQualified
                ? `${matrixLegacyHistory.filter((quote) => quote.status === "legacy_unverified").length} legacy quotation histor${matrixLegacyHistory.filter((quote) => quote.status === "legacy_unverified").length === 1 ? "y is" : "ies are"} visible but not comparison evidence until ledger verification`
                : comparisonQuotes.length === 0
                ? "L2 analysis active — no submitted quotation evidence is available"
                : l2 === null
                  ? evidenceQualifiedL2 !== null
                    ? `${comparisonQuotes.length} submitted quotation${comparisonQuotes.length === 1 ? "" : "s"}; L2 analysis evidence-qualified at ${fmtC(evidenceQualifiedL2)} — itemised repair scope remains incomplete`
                    : `${comparisonQuotes.length} submitted quotation${comparisonQuotes.length === 1 ? "" : "s"}; L2 analysis active — itemised repair scope is incomplete`
                  : `${comparisonQuotes.length} submitted quotation${comparisonQuotes.length === 1 ? "" : "s"}; all-in repair scope complete`;

              return (
                <>
                  <div style={{ marginBottom: 10, padding: "8px 10px", border: "1px solid #e2e8f0", background: l2 === null ? "#fffbeb" : "#f0fdf4", fontSize: 11, color: "#334155" }}>
                    <strong>Submitted quotation ledger:</strong> {quoteScopeState}. {legacyHistoryQualified ? "No L1, L2, savings, settlement, or KINGA Optimised amount is displayed until ledger verification." : l2 === null && "The available L2 intelligence remains visible; no final all-in L2, savings, settlement, or KINGA Optimised amount is displayed until scope is complete."}
                  </div>
                  <ComponentCostMatrix
                    quotes={matrixQuotes}
                    rows={matrixRows}
                    l1Total={l1}
                    l2Total={l2}
                    savingsUsd={savingsUsd}
                    savingsPct={savingsPct}
                    nfs={nfs}
                    qndFlags={qndFlags}
                    dnqFlags={dnqFlags}
                    fmtMoney={fmtC}
                    isCopyQuote={isCopyQuote}
                  />
                </>
              );

            })()}
          </div>
        </div>
                {/* ══ SECTION 6 — Fraud & Risk Assessment ══ */}
        <div style={S.card}>
          <SectionHeader num={6} title="Fraud & Risk Assessment" sectionKey="fraud_risk" claimId={claimId} pipelineRunId={pipelineRunId} />
          <div style={S.cardBody}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div style={{ padding: "10px 12px", background: "#ffffff", borderRadius: 0 }}>
                <p style={S.label}>Fraud Score</p>
                <div style={{ marginTop: 8 }}>
                  <FraudScoreBar score={fraudScore} />
                </div>
              </div>
              <div style={{ padding: "10px 12px", background: "#ffffff", borderRadius: 0 }}>
                <p style={S.label}>Risk Level</p>
                <div style={{ marginTop: 5 }}>
                  <FraudBadge level={fraudLevel} />
                </div>
              </div>
            </div>

            <div style={{ padding: "8px 12px", background: "#ffffff", borderRadius: 0 }}>
              <p style={S.label}>Primary Risk Driver</p>
              <p style={{ ...S.value, marginTop: 4, fontWeight: 500, fontSize: 12 }}>{fraudReason || "—"}</p>
            </div>

            {/* Date consistency result if available */}
            {(() => {
              const dateCheck = fraudBd?.accidentDateCrossCheck ?? null;
              if (!dateCheck || dateCheck.verdict === "consistent") return null;
              return (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "#ffffff", borderRadius: 0, border: "1px solid #e2e8f0" }}>
                  <p style={{ ...S.label, marginBottom: 4 }}>Date Consistency</p>
                  <p style={{ fontSize: 12, fontWeight: dateCheck.verdict === "consistent" ? 600 : 800, color: "#111" }}>
                    {toTitleCase((dateCheck.verdict ?? "").replace(/_/g, " "))}
                  </p>
                  {dateCheck.verdict === "mismatch" && (
                    <p style={S.muted}>Claim form date and police report date do not match.</p>
                  )}
                  {(dateCheck.preIncidentImages ?? []).length > 0 && (
                    <p style={S.muted}>
                      {dateCheck.preIncidentImages.length} image(s) have timestamps before the reported incident date.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* ══ SECTION 7 — Physics Consistency ══ */}
        <div style={S.card}>
          <SectionHeader num={7} title="Physics Consistency" subtitle="Mechanical plausibility of reported damage relative to impact forces" sectionKey="physics" claimId={claimId} pipelineRunId={pipelineRunId} />
          <div style={S.cardBody}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              {[
                {
                  label: "Consistency",
                  value: (
                    <span style={{ fontWeight: physicsConsistent ? 600 : 800, fontSize: 13, color: "#111" }}>
                      {physicsConsistent ? "Consistent" : "Inconsistent"}
                    </span>
                  ),
                },
                { label: "Consistency Score", value: `${physicsScore} / 100` },
                {
                  label: "ΔV (Impact Speed)",
                  value: e?._physics?.deltaVKmh ? `${fmt(e._physics.deltaVKmh, 0)} km/h` : "—",
                },
              ].map((item, i) => (
                <div key={i} style={{ padding: "8px 12px", background: "#ffffff", borderRadius: 0 }}>
                  <p style={S.label}>{item.label}</p>
                  <div style={{ marginTop: 4 }}>
                    {typeof item.value === "string" ? (
                      <p style={{ ...S.value, fontSize: 13 }}>{item.value}</p>
                    ) : (
                      item.value
                    )}
                  </div>
                </div>
              ))}
            </div>

            {physicsInsight && (
              <p style={{ fontSize: 12, color: "#64748b", fontStyle: "italic" }}>{physicsInsight}</p>
            )}
          </div>
        </div>

        {/* ══ SECTION 8 — Final Recommendation ══ */}
        <div style={S.card}>
          <SectionHeader num={8} title="Final Recommendation" sectionKey="recommendation" claimId={claimId} pipelineRunId={pipelineRunId} />
          <div style={S.cardBody}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{ flexShrink: 0 }}>
                <VerdictBadge decision={decision} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.6, margin: 0 }}>
                  {primaryReason
                    ? `${primaryReason}. ${
                        deviationPct != null && Math.abs(deviationPct) > 5
                          ? `The highest submitted quote deviates ${deviationPct > 0 ? "above" : "below"} the KINGA estimate by ${Math.abs(deviationPct).toFixed(1)}%. `
                          : ""
                      }${
                        fraudScore >= 40
                          ? `Fraud risk is ${fraudLevel.toLowerCase()} (score: ${fraudScore}). `
                          : ""
                      }${
                        !physicsConsistent
                          ? "Physics analysis indicates the reported damage is not fully consistent with the described impact. "
                          : ""
                      }${recommendedActions[0] ? recommendedActions[0] + "." : ""}`
                    : "Assessment complete. Review all sections above before making a final decision."}
                </p>
              </div>
            </div>

            {recommendedActions.length > 1 && (
              <>
                <div style={S.divider} />
                <p style={{ ...S.label, marginBottom: 6 }}>Next Steps</p>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {recommendedActions.map((a: string, i: number) => (
                    <li key={i} style={{ fontSize: 12, color: "#0f172a", marginBottom: 4 }}>{a}</li>
                  ))}
                </ol>
              </>
            )}

            {/* Report footer */}
            <div style={{ ...S.divider, marginTop: 20 }} />
            <p style={{ ...S.muted, fontSize: 10 }}>
              This report was generated by KINGA Intelligence. It is intended to assist claims professionals in making informed decisions and does not constitute a final determination of liability. All findings are subject to review by a qualified assessor.
            </p>
          </div>
        </div>

        {/* ══ SECTION 9 — Approval Chain & Audit Signatures ══ */}
        <div style={S.card}>
          <SectionHeader num={9} title="Approval Chain & Audit Signatures" subtitle="Formal sign-off record for each stage of the approval workflow" />
          <div style={S.cardBody}>
            {(() => {
              const stages: { order: number; name: string; roleKey: string; required: boolean }[] =
                workflowStages.length > 0
                  ? workflowStages.map((s) => ({ order: s.stage_order, name: s.stage_name ?? s.name ?? `Stage ${s.stage_order}`, roleKey: s.role_key, required: s.required }))
                  : Array.from(
                      new Map(
                        approvalHistory
                          .filter((e) => e.stageOrder != null)
                          .map((e) => [e.stageOrder!, { order: e.stageOrder!, name: e.stageName ?? `Stage ${e.stageOrder}`, roleKey: e.roleKey ?? "", required: true }])
                      ).values()
                    ).sort((a, b) => a.order - b.order);

              if (stages.length === 0 && approvalHistory.length === 0) {
                return (
                  <p style={{ ...S.muted, fontStyle: "italic", textAlign: "center", padding: "12px 0" }}>
                    No approval workflow has been initiated for this claim.
                  </p>
                );
              }

              const completedByOrder = new Map<number, ApprovalEntry>();
              for (const entry of approvalHistory) {
                if (entry.stageOrder != null) completedByOrder.set(entry.stageOrder, entry);
              }

              return (
                <>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ ...S.th, width: "5%" }}>#</th>
                        <th style={{ ...S.th, width: "18%" }}>Role</th>
                        <th style={{ ...S.th, width: "20%" }}>Stage</th>
                        <th style={{ ...S.th, width: "12%" }}>Decision</th>
                        <th style={{ ...S.th, width: "18%" }}>Officer Name</th>
                        <th style={{ ...S.th, width: "15%" }}>Date & Time</th>
                        <th style={{ ...S.th, width: "12%" }}>Signature</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stages.map((stage) => {
                        const completed = completedByOrder.get(stage.order);
                        const ds = completed ? (DECISION_STYLES_KCR[completed.decision] ?? { label: completed.decision, bg: "#ffffff", color: "#0f172a", border: "#334155" }) : null;
                        const dateStr = completed?.actedAt
                          ? new Date(completed.actedAt).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                          : null;
                        return (
                          <tr key={stage.order} style={{ background: "#ffffff" }}>
                            <td style={{ ...S.td, fontWeight: 700, color: C.accent }}>{stage.order}</td>
                            <td style={{ ...S.td, fontWeight: 600, color: C.textMid }}>{ROLE_LABELS_KCR[stage.roleKey] ?? stage.roleKey}</td>
                            <td style={{ ...S.td, color: C.textMid }}>{stage.name}</td>
                            <td style={S.td}>
                              {ds ? (
                                <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: ds.bg, color: ds.color, border: `1px solid ${ds.border}` }}>
                                  {ds.label}
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: C.textMuted, fontStyle: "italic" }}>Pending</span>
                              )}
                            </td>
                            <td style={{ ...S.td, color: C.text }}>
                              {completed?.actorName ?? <span style={{ color: C.textMuted, fontStyle: "italic" }}>—</span>}
                            </td>
                            <td style={{ ...S.td, color: C.textMuted, fontSize: 11 }}>
                              {dateStr ?? <span style={{ color: C.textMuted, fontStyle: "italic" }}>—</span>}
                            </td>
                            <td style={S.td}>
                              {completed ? (
                                <div style={{ borderBottom: `1px solid ${C.borderDark}`, height: 22, width: "100%", position: "relative" }}>
                                  <span style={{ position: "absolute", bottom: 2, left: 0, fontSize: 9, color: C.textMuted, fontStyle: "italic" }}>{completed.actorName ?? ""}</span>
                                </div>
                              ) : (
                                <div style={{ borderBottom: `1px dashed ${C.borderDark}`, height: 22, width: "100%" }} />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {approvalHistory.some((e) => e.notes) && (
                    <>
                      <div style={{ ...S.divider, marginTop: 16 }} />
                      <p style={{ ...S.label, marginBottom: 8 }}>Reviewer Notes</p>
                      {approvalHistory
                        .filter((e) => e.notes)
                        .map((e) => (
                          <div key={e.id} style={{ marginBottom: 8, paddingLeft: 12, borderLeft: `3px solid ${C.borderDark}` }}>
                            <p style={{ ...S.label, marginBottom: 2 }}>
                              {ROLE_LABELS_KCR[e.roleKey ?? ""] ?? e.roleKey} — Stage {e.stageOrder} — {e.actorName ?? "Unknown"}
                            </p>
                            <p style={{ fontSize: 12, color: C.textMid, margin: 0, fontStyle: "italic" }}>"{e.notes}"</p>
                          </div>
                        ))}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>

      </div>

      {/* ══ APPENDIX A — Confidence Improvement Checklist ══ */}
      <ConfidenceImprovementChecklist
        aiAssessment={aiAssessment}
        claim={claim}
        styleMode="kinga"
      />

      {/* ── KINGA Persistent Footer ── */}
      <div className="cr-footer" style={{ background: '#fff', borderTop: '2px solid #1A2B4A', marginTop: 28 }}>
        <div className="cr-footer-bar" style={{ background: '#1A2B4A', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style={{ height: 20, width: 20, objectFit: 'contain', opacity: 0.9 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: '0.08em' }}>KINGA</span>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>Claims Assessment Report</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>Claim: {claim?.claimNumber ?? claim?.claimReference ?? '—'}</span>
            <span style={{ fontFamily: "'IBM Plex Mono','Courier New',monospace", fontSize: 10, color: '#94a3b8' }}>#{((aiAssessment?.id ?? 0) * 31337).toString(16).padStart(8, '0').toUpperCase().slice(0, 8)}</span>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>{reportDate}</span>
            <span className="cr-footer-decision" style={{ fontSize: 10, fontWeight: 700, color: decisionColor, border: `1px solid ${decisionColor}`, padding: '1px 8px', letterSpacing: '0.06em' }}>{(decision ?? '').toUpperCase().replace(/_/g, ' ')}</span>
          </div>
        </div>
        <div style={{ padding: '8px 20px' }}>
          <span style={{ fontSize: 9, color: '#888', lineHeight: 1.5 }}>
            CONFIDENTIAL — For authorised insurer use only. This report is generated by KINGA Intelligence and must be reviewed by a qualified human adjuster before any claim decision is finalised. KINGA does not constitute legal advice.
          </span>
        </div>
      </div>
    </div>
  );
}

export default KingaClaimsReport;
