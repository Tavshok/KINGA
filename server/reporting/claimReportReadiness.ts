export type ClaimReportReadinessState =
  | "ready_for_report_inputs"
  | "assessment_start_recoverable_failure"
  | "assessment_pending"
  | "assessment_unavailable";

export type ClaimReportReadiness = {
  state: ClaimReportReadinessState;
  permitsCompletedAssessmentIntelligence: boolean;
  message: string | null;
};

type ClaimLifecycleRecord = {
  status?: unknown;
  assessment_date?: unknown;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

/**
 * A report remains available for claim and evidence transparency, but must never
 * present incomplete pipeline state as completed KINGA assessment intelligence.
 */
export function resolveClaimReportReadiness(record: ClaimLifecycleRecord): ClaimReportReadiness {
  const status = String(record.status ?? "").toLowerCase();
  const hasAssessment = record.assessment_date !== null && record.assessment_date !== undefined;

  if (status === "assessment_start_failed") {
    return {
      state: "assessment_start_recoverable_failure",
      permitsCompletedAssessmentIntelligence: false,
      message: "Claim evidence is retained, but KINGA assessment start needs attention. This report must not be treated as completed assessment intelligence.",
    };
  }

  if (!hasAssessment && ["intake_pending", "assessment_in_progress", "submitted"].includes(status)) {
    return {
      state: "assessment_pending",
      permitsCompletedAssessmentIntelligence: false,
      message: "Claim evidence is retained and assessment is pending. This report must not be treated as completed assessment intelligence.",
    };
  }

  if (!hasAssessment && ["assessment_failed", "document_processing_failed"].includes(status)) {
    return {
      state: "assessment_unavailable",
      permitsCompletedAssessmentIntelligence: false,
      message: "Claim evidence is retained, but completed KINGA assessment intelligence is unavailable for this report.",
    };
  }

  return { state: "ready_for_report_inputs", permitsCompletedAssessmentIntelligence: true, message: null };
}

export function renderClaimReportReadinessBanner(record: ClaimLifecycleRecord): string {
  const readiness = resolveClaimReportReadiness(record);
  if (readiness.permitsCompletedAssessmentIntelligence || !readiness.message) return "";

  return `<div data-kinga-report-readiness="${readiness.state}" style="margin:10px 0;padding:9px 12px;border-left:4px solid #b7791f;background:#fff8e8;color:#5c4316;font-size:11px;line-height:1.45;"><strong>Assessment status: ${escapeHtml(readiness.state.replaceAll("_", " "))}.</strong> ${escapeHtml(readiness.message)}</div>`;
}
