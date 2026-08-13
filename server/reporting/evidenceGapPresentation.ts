import { buildHumanVerificationRequest, buildUncertaintyEnvelope } from "../evidence-governance/evidenceGapIntelligence";
import type { EvidenceGap, EvidenceGapCandidate, UncertaintyEnvelope } from "../evidence-governance/types";

export type EvidenceGapReportRow = {
  quote_id: number | null;
  quote_line_item_id: number | null;
  source_document_id: number;
  source_page: number | null;
  source_location: string | null;
  source_crop_ref: string | null;
  source_text: string | null;
  observable_characters: string | null;
  ambiguity_description: string;
  component_confidence: number | string | null;
  quantity_confidence: number | string | null;
  unit_price_confidence: number | string | null;
  extended_amount_confidence: number | string | null;
  transcription_method: EvidenceGap["transcriptionMethod"];
  candidate_readings_json: unknown;
  arithmetic_residual_cents: number | string | null;
  currency: string | null;
  impact_json: unknown;
  resolution_status: EvidenceGap["resolutionStatus"];
  review_fields_json: unknown;
};

type ProgressiveTotal = { currency: string; amountCents: number };

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[character] ?? character));
}

function money(amountCents: number, currency: string): string {
  return `${currency} ${(Number(amountCents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function arrayOrEmpty<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function impactOrBoundary(value: unknown): EvidenceGap["impact"] {
  if (value && typeof value === "object") {
    const candidate = value as Partial<EvidenceGap["impact"]>;
    if (typeof candidate.explanation === "string") {
      return {
        affectsVerifiedArithmetic: Boolean(candidate.affectsVerifiedArithmetic),
        affectsFinalAllInTotal: Boolean(candidate.affectsFinalAllInTotal),
        affectsSavings: Boolean(candidate.affectsSavings),
        affectsSettlement: Boolean(candidate.affectsSettlement),
        explanation: candidate.explanation,
      };
    }
  }
  return {
    affectsVerifiedArithmetic: false,
    affectsFinalAllInTotal: true,
    affectsSavings: true,
    affectsSettlement: true,
    explanation: "The unresolved row is excluded from verified arithmetic until the named source fields are confirmed.",
  };
}

function asGap(row: EvidenceGapReportRow): EvidenceGap {
  return {
    tenantId: "report",
    claimId: 0,
    quoteId: row.quote_id,
    quoteLineItemId: row.quote_line_item_id,
    sourceDocumentId: row.source_document_id,
    sourcePage: row.source_page,
    sourceLocation: row.source_location,
    sourceCropRef: row.source_crop_ref,
    sourceText: row.source_text,
    observableCharacters: row.observable_characters,
    ambiguityDescription: row.ambiguity_description,
    componentConfidence: numberOrNull(row.component_confidence),
    quantityConfidence: numberOrNull(row.quantity_confidence),
    unitPriceConfidence: numberOrNull(row.unit_price_confidence),
    extendedAmountConfidence: numberOrNull(row.extended_amount_confidence),
    transcriptionMethod: row.transcription_method,
    candidates: arrayOrEmpty<EvidenceGapCandidate>(row.candidate_readings_json),
    arithmeticResidualCents: numberOrNull(row.arithmetic_residual_cents),
    currency: row.currency,
    impact: impactOrBoundary(row.impact_json),
    resolutionStatus: row.resolution_status,
    requiredReviewFields: arrayOrEmpty<EvidenceGap["requiredReviewFields"][number]>(row.review_fields_json),
  };
}

function formatEnvelope(envelope: UncertaintyEnvelope): string {
  return `${money(envelope.verifiedSubtotalCents, envelope.currency)} verified subtotal + ${money(envelope.minimumCandidateExposureCents, envelope.currency)}–${money(envelope.maximumCandidateExposureCents, envelope.currency)} directly supported candidate exposure = ${money(envelope.minimumPossibleSubtotalCents, envelope.currency)}–${money(envelope.maximumPossibleSubtotalCents, envelope.currency)}`;
}

/** Renders source ambiguity as a controlled intelligence state, never as a selected cost. */
export function renderEvidenceGapIntelligence(rows: EvidenceGapReportRow[], progressiveTotals: ProgressiveTotal[]): string {
  const gaps = rows.map(asGap).filter((gap) => gap.resolutionStatus !== "human_verified" && gap.resolutionStatus !== "superseded");
  if (gaps.length === 0) return "";
  const envelopes = progressiveTotals.map((total) => buildUncertaintyEnvelope(
    total.amountCents,
    total.currency,
    gaps.filter((gap) => gap.currency === total.currency),
  )).filter((envelope): envelope is UncertaintyEnvelope => envelope !== null);
  const rowsHtml = gaps.map((gap) => {
    const request = buildHumanVerificationRequest(gap);
    const candidates = gap.candidates.length > 0
      ? gap.candidates.map((candidate) => `${candidate.field.replaceAll("_", " ")}: ${candidate.displayValue} (${Math.round(candidate.confidence * 100)}%)`).join("; ")
      : "No directly supported amount candidate is available.";
    const confidence = [
      gap.componentConfidence === null ? null : `component ${Math.round((gap.componentConfidence ?? 0) * 100)}%`,
      gap.quantityConfidence === null ? null : `quantity ${Math.round((gap.quantityConfidence ?? 0) * 100)}%`,
      gap.unitPriceConfidence === null ? null : `unit price ${Math.round((gap.unitPriceConfidence ?? 0) * 100)}%`,
      gap.extendedAmountConfidence === null ? null : `amount ${Math.round((gap.extendedAmountConfidence ?? 0) * 100)}%`,
    ].filter(Boolean).join(" · ");
    return `<div style="margin-top:3px;padding:5px 6px;background:#fff8e8;border-left:2px solid #c28a20;"><b>Source ambiguity — verification required.</b> ${esc(gap.ambiguityDescription)}<br><span style="color:#667788;">Evidence: document ${esc(gap.sourceDocumentId)}${gap.sourcePage ? ` · p${esc(gap.sourcePage)}` : ""}${gap.sourceLocation ? ` · ${esc(gap.sourceLocation)}` : ""}${gap.sourceCropRef ? ` · crop ${esc(gap.sourceCropRef)}` : ""}.</span>${gap.observableCharacters ? `<br><span style="color:#667788;">Observed: ${esc(gap.observableCharacters)}</span>` : ""}${confidence ? `<br><span style="color:#667788;">Confidence: ${esc(confidence)}</span>` : ""}<br><span style="color:#667788;">Candidate readings: ${esc(candidates)}</span>${gap.arithmeticResidualCents !== null && gap.arithmeticResidualCents !== undefined ? `<br><span style="color:#667788;">Arithmetic residual: ${esc(money(gap.arithmeticResidualCents, gap.currency ?? "USD"))}; this is not attributed to the source row.</span>` : ""}<br><span style="color:#294a66;"><b>Minimum verification:</b> confirm ${esc(request.fields.join(", ") || "the source row")}. ${esc(request.consequence)}</span></div>`;
  }).join("");
  const envelopeHtml = envelopes.length > 0
    ? `<div style="margin-top:6px;padding:5px 7px;background:#f3f7fb;border-left:3px solid #2d5f8b;color:#294a66;"><b>Evidence-qualified uncertainty envelope.</b> ${esc(envelopes.map(formatEnvelope).join(" · "))}. This is informational only and is not a selected repair cost, payable total, saving, or settlement recommendation.</div>`
    : "";
  return `<div style="margin-top:7px;font-size:9px;"><b>Evidence Gap Intelligence</b>${rowsHtml}${envelopeHtml}</div>`;
}
