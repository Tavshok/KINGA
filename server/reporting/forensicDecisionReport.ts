/**
 * KINGA Forensic Claim Decision Report — Voltron Redesign
 *
 * Generates the full HTML for the Forensic Claim Decision Report from live DB data.
 * Layout exactly matches the approved reference: KINGA_Forensic_Report_Voltron_Redesign.html
 *
 * 4-page A4 structure:
 *   Page 1 — Masthead · Scorecard (5 KPIs) · Verdict strip (6 cells) · §01 Exec Summary · §02 Claim & Vehicle · §03 Incident Narrative
 *   Page 2 — §04 Technical Forensics (SVG speed chart + impact map + damage bar) · §05 Vehicle Structural Intelligence
 *   Page 3 — §06 Financial Validation (quote bars + cost table) · §07 Quote & Scope Reconciliation · §08 Photo & Document Evidence
 *   Page 4 — §09 Risk & Fraud Assessment · §10 Validation, Decision & Next Steps · §11 Approval Chain · Glossary · Footer
 */

import {
  buildKingaFdrHtml, esc, fmtUSD, fmtCurrency, fmtD, safeJson, photoZonePanel,
} from "./templates/kingaDesignSystem";
import { renderCostDecisionSummaryHtml } from "./costDecisionPresentation";
import { resolveReportQuoteEvidencePresentation } from "./costIntegrity";
import { renderEvidenceGovernancePanel, type EvidenceGovernanceReportData } from "./evidenceGovernancePresentation";
import { renderClaimReportReadinessBanner } from "./claimReportReadiness";
import { renderCostEvidenceStateHtml } from "./costEvidenceStatePresentation";
import type { CGIAvailabilitySummary } from "../pipeline-v2/stage-9-5-cgi";
import { isKingaWriteOffRecommendation } from "../../shared/writeOffRecommendation";
import { resolveForensicReportModel, type ForensicApprovalStage, type ForensicReportModel } from "./forensicReportModel";
import { toReportDefinitionRow } from "./resolvedReportRecord";
import { renderSharedQuoteEvidencePresentation } from "./sharedQuoteEvidencePresentation";
import { renderVehiclePassportEvidencePanel } from "./vehiclePassportEvidencePresentation";
import {
  projectP0A2DescriptivePhotoEvidence,
  renderP0A2CollisionPhysicsAbstentionMarker,
} from "./p0PhysicsPresentation";
import { renderP0B1FraudAbstentionMarker } from "./p0FraudPresentation";

type LegacyRendererInputs = Readonly<{
  c: Record<string, unknown>;
  quotes: readonly Record<string, unknown>[];
  docs: readonly Record<string, unknown>[];
  preLossCondition: Record<string, unknown> | null;
  disputes: readonly Record<string, unknown>[];
  evidenceGovernanceData: EvidenceGovernanceReportData;
  approvalStages: readonly ForensicApprovalStage[];
  completedStages: number;
  requiredStages: number;
}>;

/**
 * Compatibility boundary for the existing forensic HTML template. It maps only
 * immutable canonical values; it must never query, parse a database row, or
 * create an alternative cost, decision, audit, or dispute interpretation.
 */
function toForensicLegacyRendererInputs(model: ForensicReportModel): LegacyRendererInputs {
  const claimQualityValue = model.executive.claimQuality.value;
  const canonicalRow = toReportDefinitionRow(model.reportRecord);
  return {
    c: {
      ...canonicalRow,
      claim_quality_json: claimQualityValue == null ? null : {
        overallScore: claimQualityValue,
        grade: model.executive.claimQuality.band,
      },
      kinga_reference: model.identity.kingaReference,
      driver_name: model.claimAndVehicle.driverName,
      driver_licence: model.claimAndVehicle.driverLicence,
      licence_number: model.claimAndVehicle.driverLicence,
      assessor_name: model.claimAndVehicle.assessorName,
      vehicle_odometer: model.claimAndVehicle.vehicleOdometer,
      odometer: model.claimAndVehicle.vehicleOdometer,
      police_case_number: model.claimAndVehicle.policeCaseNumber,
      police_reference: model.claimAndVehicle.policeCaseNumber,
      police_status: model.claimAndVehicle.policeStatus,
    },
    quotes: model.financial.quotes,
    docs: model.evidence.documents,
    preLossCondition: model.claimAndVehicle.preLossCondition.value as Record<string, unknown> | null,
    disputes: model.disputes,
    evidenceGovernanceData: model.evidence.evidenceGovernance as EvidenceGovernanceReportData,
    approvalStages: model.approval.stages,
    completedStages: model.approval.completedStages,
    requiredStages: model.approval.requiredStages,
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function generateForensicDecisionReport(
  claimId: number,
  tenantId?: string
): Promise<string> {
  if (!tenantId?.trim()) throw new Error("Tenant scope is required for Forensic reporting");
  const forensicModel = await resolveForensicReportModel({ claimId, tenantId, audience: "forensic" });
  const {
    c,
    quotes,
    docs,
    preLossCondition,
    disputes,
    evidenceGovernanceData,
    approvalStages: resolvedApprovalStages,
    completedStages: resolvedCompletedStages,
    requiredStages: resolvedRequiredStages,
  } = toForensicLegacyRendererInputs(forensicModel);

  const collisionPhysicsHoldHtml = renderP0A2CollisionPhysicsAbstentionMarker();

    // ── 4. Parse JSON fields ─────────────────────────────────────────────────
    const costIntel    = safeJson(c.cost_intelligence_json);
    const repairIntel  = safeJson(c.repair_intelligence_json);
    const fraudBreak   = safeJson(c.fraud_score_breakdown_json);
    const ife          = safeJson(c.ife_result_json);
    // Wave 1: Physics Truth Layer — canonical source. Falls back to legacy physics_analysis
    // for historical claims that pre-date the PTL implementation.
    const physicsTruth = safeJson(c.physics_truth_json);
    const physics      = safeJson(c.physics_analysis);
    // Convenience accessors — prefer PTL, fall back to legacy physics fields
    const pt = physicsTruth as any;
    const ptlCrushDepth   = pt?.geometry?.crushDepth?.canonical ?? null;
    const ptlSpeed        = pt?.speed?.canonical ?? null;
    const ptlDeltaV       = pt?.speed?.deltaVKmh ?? null;
    const ptlKE           = pt?.energy?.kineticEnergyJ ?? null;
    const ptlDQS          = pt?.evidenceCompleteness?.dataQualityScore ?? null;
    const ptlIntegrity    = pt?.integrityCheck ?? null;
    const ptlSpeedMethods: any[] = pt?.speed?.methods ?? [];
    const ptlGeometry     = pt?.geometry ?? null;
    const ptlEnergy       = pt?.energy ?? null;
    const ptlEvidence     = pt?.evidenceCompleteness ?? null;
    // Wave 3 — Integrity, Uncertainty, Explainability engines
    const w3             = pt?.wave3 ?? null;
    const w3Integrity    = w3?.integrity ?? null;
    const w3Uncertainty  = w3?.uncertainty ?? null;
    const w3Explain      = w3?.explainability ?? null;
    const w3Grade: string        = w3Uncertainty?.overallGrade ?? '';
    const w3UncertSummary: string = w3Uncertainty?.summary ?? '';
    const w3KeyFindings: string[] = w3Explain?.keyFindings ?? [];
    const w3VerdictPara: string   = w3Explain?.verdictParagraph ?? '';
    const w3AdjusterSummary: string = w3Explain?.adjusterSummary ?? '';
    const w3IntegrityScore: number  = w3Integrity?.integrityScore ?? 0;
    const w3IntegrityFlags: any[]   = w3Integrity?.flags ?? [];
    const w3CriticalCount: number   = w3Integrity?.criticalCount ?? 0;
    const w3WarningCount: number    = w3Integrity?.warningCount ?? 0;
    // FIX-#11: Include INFO-level flags in the total flag count for the executive summary.
    // w3WarningCount only counts WARNING severity; INFO flags are real findings and should be visible.
    const w3InfoCount: number       = w3IntegrityFlags.filter((f: any) => String(f.severity ?? '').toUpperCase() === 'INFO').length;
    const w3TotalFlagCount: number  = w3CriticalCount + w3WarningCount + w3InfoCount;
    const w3IntegrityClean: boolean = w3Integrity?.clean ?? false;
    const w3CampbellSpeed: any      = w3Uncertainty?.campbellSpeed ?? null;
    const w3KineticEnergy: any      = w3Uncertainty?.kineticEnergy ?? null;
    const w3DeltaV: any             = w3Uncertainty?.deltaV ?? null;
    const w3DeformEff: any          = w3Uncertainty?.deformationEfficiency ?? null;
    const w3SpeedChain: any         = w3Explain?.speedChain ?? null;
    const w3CrushChain: any         = w3Explain?.crushDepthChain ?? null;
    const w3StructChain: any        = w3Explain?.structuralChain ?? null;
    const w3Methods: any[]          = w3Explain?.methodologyCitations ?? [];
    // Impact causation & braking distance (new forensic fields)
    const ptlImpactCausation: string | null = pt?.impactCausation ?? null;
    const ptlCausationCeiling: number | null = pt?.causationSpeedCeilingKmh ?? null;
    const ptlCausationBreached: boolean = pt?.causationSpeedExceedsCeiling === true;
    const ptlReversingContradiction: boolean = pt?.reversingNarrativeContradiction === true;
    const ptlBrakingDistanceM: number | null = pt?.brakingDistanceM ?? null;
    const ptlBrakingMu: number | null = pt?.brakingFrictionCoefficient ?? null;

    // SLPE — Structural Load Path Engine results (Wave 2)
    const ptlSLPE         = pt?.structuralLoadPath ?? null;
    const slpePenetrated: any[]  = ptlSLPE?.penetratedComponents ?? [];
    const slpeLatent: any        = ptlSLPE?.latentDamageProbability ?? null;
    const slpeIntegrityRisk: string = ptlSLPE?.structuralIntegrityRisk ?? '';
    const slpeConfidence: number = ptlSLPE?.confidence ?? 0;
    const slpeWarnings: string[] = ptlSLPE?.warnings ?? [];
    const narrative    = safeJson(c.narrative_analysis_json);
    // Cross-validation JSON — three-way speed comparison, XV risk, impact direction
    const xv = safeJson(c.cross_validation_json) as any;
    const cgiData     = safeJson(c.cgi_result_json) as any;
    const interpData  = safeJson(c.interpretation_result_json) as any;
    const xvThreeWay     = xv?.threeWaySpeedComparison ?? null;
    const xvClaimedSpeed: number | null  = xvThreeWay?.claimedSpeedKmh ?? null;
    const xvConsensusSpeed: number | null = xvThreeWay?.consensusSpeedKmh ?? null;
    const xvSeverityImplied: string | null = xvThreeWay?.severityImpliedSpeed ?? null;
    const xvSpeedVerdict: string | null = xvThreeWay?.verdict ?? null;
    const xvRisk         = xv?.xvRisk ?? null;
    const xvRiskScore: number = xvRisk?.score ?? 0;
    const xvRiskLevel: string = xvRisk?.level ?? '';
    const xvRiskFactors: string[] = xvRisk?.factors ?? [];
    const xvImpactDir: string | null = xv?.impactDirection ?? pt?.geometry?.impactDirection ?? null;
    const claimQuality  = safeJson(c.claim_quality_json);
    // Claim Truth may provide a canonical cost verdict. Its free-text review
    // triggers are deliberately not a P0 publication authority.
    const claimTruth    = safeJson(c.claim_truth_json) as any;
    // Bug #1/#12: enriched_photos_json is the canonical photo source (14 photos for VOLTRON)
    // claim_documents may be empty for pipeline-only claims; enriched_photos_json is always populated
    const photoEvidence = {
      photos: forensicModel.evidence.photos,
      totalPhotos: forensicModel.evidence.totalPhotos,
      usablePhotos: forensicModel.evidence.usablePhotos,
    };
    const enrichedPhotos = photoEvidence.photos;

    // ── 5. Derived values ────────────────────────────────────────────────────
    // repair_to_value_ratio is stored as a percentage integer (e.g. 5 = 5%)
    const rtvRatio = forensicModel.executive.repairToValueRatioPercent ?? 0;
    // vehicle_market_value is stored in cents — divide by 100 for display
    const marketValue = forensicModel.executive.marketValue ?? 0;
    // ai_assessments.estimated_cost is stored in CENTS — divide by 100.
    // Documented agreed cost is a calibration reference only, never a replacement
    // for L2 or a derived settlement recommendation.
    const estimatedCost = forensicModel.reportRecord.decision.normalised.costs.aiEstimateUsd ?? 0;

    const costIntegrity = forensicModel.executive.costIntegrity;
    const reportDecision = forensicModel.executive.decision;
    const quoteArr = costIntegrity.submittedQuotes;
    const comparisonQuoteArr = costIntegrity.activeQuotes;
    const activeQuoteIds = new Set(
      comparisonQuoteArr.map((quote) => quote.sourceReference).filter((id): id is string => Boolean(id))
    );
    const sharedQuoteEvidenceHtml = renderSharedQuoteEvidencePresentation({
      costIntegrity,
      quoteEvidence: forensicModel.reportRecord.evidence.quoteEvidence,
      quotePresentation: resolveReportQuoteEvidencePresentation(costIntegrity),
      escapeHtml: esc,
    });

    // Bug #8: derive currency from cost intel or quotes (not hardcoded USD)
    const claimCurrency: string = String(
      costIntel?.currency ??
      quoteArr[0]?.currency ??
      (c.currency_code as string | null | undefined) ??
      "USD"
    ).toUpperCase();
    const costDecisionSummary = renderCostDecisionSummaryHtml({
      costIntegrity,
      formatAmount: (amount) => fmtCurrency(amount, claimCurrency),
      escapeHtml: esc,
      repairability: {
        totalLossIndicated: Boolean(c.total_loss_indicated),
        repairToValueRatio: c.repair_to_value_ratio == null ? null : rtvRatio,
        kingaRecommendation: isKingaWriteOffRecommendation(costIntel?.repairabilityDecision)
          ? costIntel.repairabilityDecision
          : null,
      },
    });
    const submittedQuoteLedgerDetail = quoteArr.length > 0
      ? `${quoteArr.map((quote) => `${quote.repairer}: ${quote.amountUsd === null ? "amount unavailable" : fmtCurrency(quote.amountUsd, claimCurrency)}`).join(" · ")}${costIntegrity.legacyHistoryQualified ? " · Legacy quotation history; not active comparison evidence." : ""}`
      : "No submitted repair quotations";
    const quoteAmounts = comparisonQuoteArr.map(q => q.amountUsd ?? 0).filter(amount => amount > 0);
    const lowestQuote  = quoteAmounts.length ? Math.min(...quoteAmounts) : 0;
    const highestQuote = quoteAmounts.length ? Math.max(...quoteAmounts) : 0;

    const kingaOptimised = costIntegrity.l2OptimisedCostUsd;
    const evidenceQualifiedL2 = costIntegrity.l2EvidenceQualifiedComparisonUsd;
    const l2Display = kingaOptimised !== null
      ? fmtCurrency(kingaOptimised, claimCurrency)
      : evidenceQualifiedL2 !== null
        ? `${fmtCurrency(evidenceQualifiedL2, claimCurrency)} (evidence-qualified comparison)`
        : (costIntegrity.l2Status === "reconciliation_required" ? "All-in reconciliation required" : "L2 comparison pending evidence");
    const l2LedgerLabel = kingaOptimised !== null
      ? "L2 — KINGA Optimised Quote"
      : evidenceQualifiedL2 !== null
        ? "L2 — KINGA Optimised Quote (evidence-qualified comparison)"
        : "L2 — KINGA Optimised Quote";
    const l1Display = costIntegrity.l1SubmittedCostUsd === null ? "Not available" : fmtCurrency(costIntegrity.l1SubmittedCostUsd, claimCurrency);
    const l3Display = costIntegrity.l3BenchmarkReferenceCostUsd === null ? "Not available" : fmtCurrency(costIntegrity.l3BenchmarkReferenceCostUsd, claimCurrency);
	const residualReconciliationDetail = costIntegrity.quoteReconciliations
		.filter((quote) => quote.status !== "reconciled" && quote.unexplainedResidualUsd !== null)
		.map((quote) => `${quote.repairer}: ${fmtCurrency(quote.unexplainedResidualUsd!, claimCurrency)} requires document-to-ledger reconciliation`)
		.join(" · ");
    const l2IntegrityNote = kingaOptimised === null
      ? evidenceQualifiedL2 !== null
        ? `Evidence-qualified submitted-price comparison: ${fmtCurrency(evidenceQualifiedL2, claimCurrency)}${costIntegrity.l2EvidenceCoveragePercent === null ? "" : ` (${costIntegrity.l2EvidenceCoveragePercent}% source-evidence coverage)`}. L2 intelligence remains visible while source exceptions are reconciled. This is not an all-in payable repair total; KINGA does not publish final savings or a settlement recommendation until the complete evidence basis is equivalent and reconciled.`
        : costIntegrity.l2Status === "reconciliation_required"
		? `Itemised submitted-price comparison is available, but ${costIntegrity.unreconciledQuoteCount || "one or more"} quote header(s) do not reconcile to explicit submitted line totals. ${residualReconciliationDetail ? `Reconciliation findings: ${residualReconciliationDetail}. ` : ""}KINGA has not allocated the difference to labour, VAT, fee, paint, or another component. No savings or settlement recommendation is available until the original quote, scope, tax basis, and revision are reconciled.`
        : `L2 incomplete — ${costIntegrity.missingRequiredComponents.length || "one or more"} required repair-scope item(s) lack a traceable price. ` +
          `${costIntegrity.partialPricedScopeUsd !== null ? `Partial priced scope: ${fmtCurrency(costIntegrity.partialPricedScopeUsd, claimCurrency)}. ` : ""}` +
          `No savings or settlement recommendation is available until the scope is reconciled.`
      : `All-in payable repair-cost basis${costIntegrity.costBasis ? ` (${costIntegrity.costBasis.replaceAll("_", " ")})` : ""}.`;

    const lowestRef = lowestQuote > 0 ? lowestQuote : highestQuote;
    const savings = kingaOptimised !== null && lowestRef > 0 ? lowestRef - kingaOptimised : 0;
    // Bug #5: Only show savings when kingaOptimised > 0 (prevents 100% savings label when estimate is $0.00)
    const savingsPct = (lowestRef > 0 && kingaOptimised !== null && kingaOptimised > 0) ? Math.max(0, savings / lowestRef * 100) : 0;
    const hasSavings = savings > 0 && kingaOptimised !== null && kingaOptimised > 0;

    // Bug #10: DB column is excess_amount_cents (integer cents), not policy_excess
    const excess = c.excess_amount_cents != null
      ? Number(c.excess_amount_cents) / 100
      : Number(c.policy_excess ?? c.deductible ?? 0);
    const exclusions: Array<{item: string; amount: number; clause: string}> =
      (repairIntel?.policyExclusions as Array<{item: string; amount: number; clause: string}>) ?? [];
    const totalExclusions = exclusions.reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const recommendedSettlement = kingaOptimised === null
      ? null
      : Math.max(0, kingaOptimised - totalExclusions - excess);
    const recommendedSettlementDisplay = recommendedSettlement === null
      ? "Not available"
      : fmtCurrency(recommendedSettlement, claimCurrency);

    // Physics values — PTL-first with legacy fallback
    // PTL canonical delta-V (with uncertainty bounds) supersedes legacy scalar
    const deltaV = ptlDeltaV?.value != null ? Number(ptlDeltaV.value)
      : (physics?.deltaVKmh ? Number(physics.deltaVKmh) : (physics?.deltaV ? Number(physics.deltaV) : 15.0));
    const deltaVMin = ptlDeltaV?.min ?? null;
    const deltaVMax = ptlDeltaV?.max ?? null;
    // PTL canonical kinetic energy (J → kJ)
    const kineticEnergy = ptlKE?.value != null ? Number(ptlKE.value) / 1000
      : ((physics?.energyDistribution as any)?.kineticEnergyJ
        ? Number((physics?.energyDistribution as any).kineticEnergyJ) / 1000
        : (physics?.kineticEnergy ? Number(physics.kineticEnergy) : 18.0));
    const impactForce  = physics?.impactForceKn ? Number(physics.impactForceKn) : (physics?.impactForce ? Number(physics.impactForce) : 0);
    const vehicleMass  = physics?.vehicleMass ? Number(physics.vehicleMass) : 0;
    // Bug #9: deceleration must be rounded to 2 d.p. before display
    const decelerationRaw = physics?.decelerationG ? Number(physics.decelerationG) : (physics?.deceleration ? Number(physics.deceleration) : 0);
    const deceleration = decelerationRaw;
    // PTL canonical pre-impact speed (with uncertainty bounds)
    const preImpactSpeed = ptlSpeed?.value != null ? Number(ptlSpeed.value)
      : (physics?.estimatedSpeedKmh ? Number(physics.estimatedSpeedKmh) : (physics?.preImpactSpeed ? Number(physics.preImpactSpeed) : 0));
    const preImpactSpeedMin = ptlSpeed?.min ?? null;
    const preImpactSpeedMax = ptlSpeed?.max ?? null;
    const preImpactSpeedConf = ptlSpeed?.confidence ?? null;
    const preImpactSpeedSource = ptlSpeed?.source ?? null;
    const preImpactSpeedNote = ptlSpeed?.provenanceNote ?? null;
    // PTL crush depth canonical
    const crushDepthMm = ptlCrushDepth?.value != null ? Number(ptlCrushDepth.value) * 1000 : null;
    const crushDepthMinMm = ptlCrushDepth?.min != null ? Number(ptlCrushDepth.min) * 1000 : null;
    const crushDepthMaxMm = ptlCrushDepth?.max != null ? Number(ptlCrushDepth.max) * 1000 : null;
    const crushDepthConf = ptlCrushDepth?.confidence ?? null;
    const crushDepthSource = ptlCrushDepth?.source ?? null;
    const crushDepthNote = ptlCrushDepth?.provenanceNote ?? null;
    // PTL data quality score
    const dataQualityScore = ptlDQS ?? null;
    // PTL integrity flags
    const integrityFlags: any[] = ptlIntegrity?.flags ?? [];
    // Legacy physics score remains non-governing and is never rendered under P0-A-2.
    const physicsScore = physics?.damageConsistencyScore ? Number(physics.damageConsistencyScore)
      : (physics?.physicsScore ? Number(physics.physicsScore) : (physics?.anomalyScore ? Number(physics.anomalyScore) : 50));
    const ebsSeverity  = String(physics?.accidentSeverity ?? physics?.ebsSeverity ?? "Moderate");
    const _narrativeImpliedDir = String((narrative as any)?.extracted_facts?.implied_direction ?? "");
    const impactDirection = String((physics?.impactVector as any)?.direction ?? physics?.impactDirection ?? (_narrativeImpliedDir || null) ?? "unknown").toLowerCase();

    // Bug #2: Speed methods must come from speedInferenceEnsemble.methods[].speedKmh (6-method ensemble)
    // The old physics.speedMethods field does not exist in the v2 pipeline output.
    const speedEnsemble = physics?.speedInferenceEnsemble as {
      consensusSpeedKmh?: number;
      overallConfidence?: string;
      methods?: Array<{method: string; label?: string; speedKmh: number | null; confidence: string; ran: boolean}>;
    } | null | undefined;
    // Bug #2: Show ALL 6 methods including non-ran ones (greyed stub bars)
    type SpeedMethod = {label: string; speed: number; highlight?: boolean; danger?: boolean; notRan?: boolean};
    const speedMethods: SpeedMethod[] = (() => {
      // Priority 1: 6-method ensemble (v2 pipeline) — include all methods, grey out non-ran
      const ensembleMethods = speedEnsemble?.methods ?? [];
      if (ensembleMethods.length > 0) {
        const consensusKmh = speedEnsemble?.consensusSpeedKmh ?? 0;
        return ensembleMethods.map(m => {
          const ran = m.ran && m.speedKmh != null && Number(m.speedKmh) > 0;
          return {
            label: String(m.label ?? m.method).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            speed: ran ? Number(m.speedKmh) : 0,
            highlight: ran && Math.abs(Number(m.speedKmh) - consensusKmh) < 3,
            danger: ran && m.method === 'SEVERITY_ANCHORED' && Number(m.speedKmh) > (consensusKmh * 1.5),
            notRan: !ran,
          };
        });
      }
      // Priority 2: flat fields (legacy / partial runs)
      const arr: Array<{label: string; speed: number; highlight?: boolean; danger?: boolean}> = [];
      if (physics?.crushDepthSpeed) arr.push({ label: "Crush-Depth", speed: Number(physics.crushDepthSpeed) });
      if (physics?.safetySystemSpeed) arr.push({ label: "Safety System", speed: Number(physics.safetySystemSpeed), highlight: true });
      if (physics?.visionDeformSpeed) arr.push({ label: "Vision Deform.", speed: Number(physics.visionDeformSpeed) });
      if (preImpactSpeed > 0) arr.push({ label: "Driver Stated", speed: preImpactSpeed, danger: true });
      return arr.length > 0 ? arr : [
        { label: "Physics Est.", speed: deltaV, highlight: true },
        { label: "Driver Stated", speed: preImpactSpeed > 0 ? preImpactSpeed : deltaV * 2, danger: true },
      ];
    })();
    const maxSpeed = Math.max(...speedMethods.map(m => m.speed), 1);
    const rannedMethodCount = speedMethods.filter(m => !m.notRan).length;
    const totalMethodCount = speedMethods.length;
    // Use speedInferenceEnsemble.consensusSpeedKmh if available (more accurate than bar highlight)
    const consensusSpeed = speedEnsemble?.consensusSpeedKmh
      ? Number(speedEnsemble.consensusSpeedKmh)
      : (speedMethods.find(m => m.highlight)?.speed ?? deltaV);
    // FIX-#16: Round consensusSpeed to 1 decimal place to prevent floating-point artifacts
    // like 60.99999... rendering in the executive summary and speed discrepancy text.
    const consensusSpeedRounded = Math.round(consensusSpeed * 10) / 10;

    // ── Geometry Evidence Block (VGE Stage 6.5A + VGR Stage 6.5B) ───────────
    // Both are persisted in physics_analysis JSON since the Jul 2026 wiring fix.
    const geb = (physics as any)?.geometryEvidenceBlock as {
      vehicle?: string;
      calibrationStatus?: string;
      calibrationStatusCode?: 'CALIBRATED' | 'NOT_APPLICABLE' | 'FAILED';
      referenceObjectsSummary?: string[];
      overallCalibrationConfidencePct?: number;
      perspectiveCorrectionApplied?: boolean;
      estimatedDeformationRange?: string | null;
      measurementBasis?: string;
      limitations?: string[];
      referenceDisagreementWarning?: string;
      sourceQualityAssessment?: { geometryUsability?: string; reason?: string };
      evidenceAcquisitionRecommendation?: string;
    } | null | undefined;
    const vgr = (physics as any)?.vgrReconciliation as {
      reconciliationAvailable?: boolean;
      consensusCrushDepthM?: number | null;
      consensusCrushDepthMinM?: number | null;
      consensusCrushDepthMaxM?: number | null;
      overallConfidence?: number;
      confidenceLevel?: string;
      frontalImages?: number;
      angle45Images?: number;
      sideImages?: number;
      agreementAssessment?: {
        contributingImages?: number;
        spreadMm?: number;
        spreadPct?: number;
        agreementLevel?: 'STRONG' | 'MODERATE' | 'WEAK' | 'CONFLICTING';
        conflictDescription?: string;
      };
      failureReason?: string;
    } | null | undefined;
    const hasGeb = !!(geb?.calibrationStatusCode);

    // Damage component counts
    // CONSIST-06 fix: removed hardcoded fallback of 62 — use actual pipeline values only.
    // If the pipeline did not produce component counts, show 0 rather than a fabricated number.
    // FIX-#DamageSeverity: When repairIntel and costIntel have no component counts, derive from
    // enriched photos' componentCount sum. This prevents "0 COMPONENTS" in the damage severity bar.
    const enrichedComponentsTotal = enrichedPhotos.reduce((sum, p) => sum + Number(p.componentCount ?? 0), 0);
    const totalComponents = Number(repairIntel?.totalComponents ?? costIntel?.totalComponents ?? (enrichedComponentsTotal > 0 ? enrichedComponentsTotal : 0));
    const severeCount   = Number(repairIntel?.severeCount ?? 0);
    const moderateCount = Number(repairIntel?.moderateCount ?? 0);
    const minorCount    = Number(repairIntel?.minorCount ?? Math.max(0, totalComponents - severeCount - moderateCount));
    const sevPct   = totalComponents > 0 ? Math.round(severeCount / totalComponents * 100) : 0;
    const modPct   = totalComponents > 0 ? Math.round(moderateCount / totalComponents * 100) : 0;
    const minPct   = Math.max(0, 100 - sevPct - modPct);

    // Quote reconciliation
    const matchedComponents = Number(costIntel?.matchedComponents ?? repairIntel?.matchedComponents ?? 0);
    const missingFromQuote  = Number(costIntel?.missingFromQuote ?? repairIntel?.missingFromQuote ?? 0);
    const extraInQuote      = Number(costIntel?.extraInQuote ?? repairIntel?.extraInQuote ?? 0);
    // Tenant-scoped same-registration history is documentary claim evidence.
    // It never inherits a flag or score adjustment from forensic-audit JSON.
    const linkedClaims = forensicModel.reportRecord.history.vehicleClaimHistory;
    const hasDuplicateRegistrationFlag = linkedClaims.length > 0;
    // Stored fraud JSON is retained as historical evidence but is never used as
    // a score, indicator, classification, threshold, or report conclusion.
    void fraudBreak;

    // Approval stage mapping belongs to the canonical model, where audit events
    // are tenant-scoped and pipeline-provided approval workflow takes precedence.
    const approvalStages = resolvedApprovalStages;
    const completedStages = resolvedCompletedStages;
    const requiredStages = resolvedRequiredStages;

    // Bug #1: Photo evidence — use enriched_photos_json as primary source (pipeline-populated, always present)
    // claim_documents is only populated for adjuster-uploaded files; pipeline photos live in enriched_photos_json
    const photoDocuments = (docs as Record<string, unknown>[]).filter(d => d.document_category === "damage_photo");
    // Use enrichedPhotos (from ai_assessments.enriched_photos_json) as the authoritative photo count
    const totalPhotos = photoEvidence.totalPhotos;
    // High-confidence photos: those with confidenceScore >= 70
    const highConfPhotos = photoEvidence.usablePhotos;
    const uniqueComponents = Number(ife?.uniqueComponents ?? 0);
    // Zones covered: count distinct impactZones in enriched photos
    const coveredZoneSet = enrichedPhotos.length > 0
      ? new Set(enrichedPhotos.map(p => String(p.impactZone ?? "").toLowerCase()).filter(Boolean))
      : new Set<string>();
    const zonesCovered = coveredZoneSet.size > 0 ? coveredZoneSet.size : Number(ife?.zonesCovered ?? (totalPhotos > 0 ? 1 : 0));
    const totalZones = 4;

    // Bug #4: Data Completeness — use ife.completenessScore (0–100), NOT ife.overallScore
    // ife.overallScore is a composite IFE score; completenessScore is the actual data completeness %
    const ifeCompletenessScore = Number(ife?.completenessScore ?? ife?.overallScore ?? 75);

    // Document completeness
    const docCompleteness: Record<string, number> = (ife?.documentCompleteness as Record<string, number>) ?? {};

    // Narrative
    const narrativeText = String(narrative?.reasoning_summary ?? narrative?.summary ?? narrative?.narrativeText ?? c.incident_description ?? "No narrative available.");
    const narrativeFlag = String(narrative?.consistency_verdict ?? narrative?.flag ?? narrative?.consistencyNote ?? "");
    // DIRECTION-FIX: Default to "Not assessed" rather than "Consistent" so missing data is visible.
    // "Consistent" should only appear when the narrative engine explicitly sets it.
    const physicsVsNarrative = String((narrative as any)?.cross_validation?.physics_verdict ?? narrative?.physicsConsistency ?? "Not assessed");
    // DIRECTION-FIX: Programmatic direction cross-check.
    // If the narrative engine did not assess damage consistency, derive it from enriched photo zones vs impactDirection.
    const damageVsNarrativeRaw = (narrative as any)?.cross_validation?.damage_verdict ?? narrative?.damageConsistency;
    const damageVsNarrative: string = (() => {
      if (damageVsNarrativeRaw) return String(damageVsNarrativeRaw);
      // Derive from enriched photos: compare the majority severe-damage zone against impactDirection
      if (enrichedPhotos.length > 0) {
        const zoneCounts: Record<string, number> = {};
        for (const ph of enrichedPhotos) {
          if (ph.severity === "severe" || ph.severity === "high") {
            const z = String(ph.impactZone ?? "").toLowerCase();
            if (z) zoneCounts[z] = (zoneCounts[z] ?? 0) + 1;
          }
        }
        const majorityZone = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        if (majorityZone) {
          const dir = impactDirection; // e.g. "front", "rear", "left", "right"
          if (dir === "unknown") return "Not assessed — impact direction not determined";
          const zoneMatchesDir = majorityZone.includes(dir) || dir.includes(majorityZone.split(" ")[0]);
          // Cross-check: rear-impact narrative with front-zone damage = Inconsistent
          const rearNarrative = dir.includes("rear") || dir.includes("back");
          const frontDamage = majorityZone.includes("front") || majorityZone.includes("hood") || majorityZone.includes("bumper front");
          const frontNarrative = dir.includes("front") || dir.includes("head");
          const rearDamage = majorityZone.includes("rear") || majorityZone.includes("boot") || majorityZone.includes("bumper rear");
          if ((rearNarrative && frontDamage) || (frontNarrative && rearDamage)) {
            return "Inconsistent — damage zone contradicts stated impact direction";
          }
          return zoneMatchesDir ? "Consistent (photo-derived)" : "Partial — damage zone partially matches stated direction";
        }
      }
      return "Not assessed";
    })();
    // policeAlignment: NarrativeAnalysis has no policeAlignment field — derive from stakeholder_analysis
    const _saStakeholder = (narrative as any)?.stakeholder_analysis;
    const policeAlignment = _saStakeholder
      ? (_saStakeholder.claimant_charged ? "Charged at scene" : _saStakeholder.under_investigation ? "Under investigation" : "Not charged")
      : "Not assessed";

    // Vehicle structural intel
    const ancapRating = String(physics?.ancapRating ?? repairIntel?.ancapRating ?? "—");
    const vehicleClass = String(physics?.vehicleClass ?? repairIntel?.vehicleClass ?? "—");
    const adultOccupant = String(physics?.adultOccupantScore ?? "—");
    const childOccupant = String(physics?.childOccupantScore ?? "—");
    const crash3A = String(physics?.crash3StiffnessA ?? "—");
    const crash3B = String(physics?.crash3StiffnessB ?? "—");
    const massRange = String(physics?.typicalMassRange ?? "—");
    const safetyRisk = String(physics?.safetyRisk ?? "Low");
    const vehicleNotes = String(physics?.vehicleNotes ?? repairIntel?.vehicleNotes ?? "No additional structural notes available.");

    // Physics constraints
    const physicsConstraints: Array<{name: string; result: string}> =
      (physics?.constraints as Array<{name: string; result: string}>) ??
      (physics?.physicsConstraints as Array<{name: string; result: string}>) ?? [];

    // Policy flags
    const policyExclusion = String(repairIntel?.policyExclusionNote ?? exclusions.map(e => e.item).join("; ") ?? "None");

    // Convenience strings
    const claimRef     = esc(c.claim_reference ?? c.id);
    const claimantName = esc(c.lodger_name ?? c.claimant_name ?? "—");
    const vehicleDesc  = esc(c.vehicle_description ?? "—");
    const vehicleReg   = esc(c.vehicle_registration ?? c.registration_number ?? "—");
    const vehicleVin   = esc(c.vin ?? c.vehicle_vin ?? "");
    const vehicleOdo   = esc(c.odometer ?? c.vehicle_odometer ?? "—");
    const insurer      = esc(c.insurer_name ?? c.tenant_name ?? "—");
    const policyNum    = esc(c.policy_number ?? "—");
    const driverName   = esc(c.driver_name ?? c.lodger_name ?? "—");
    const driverLicence = esc(c.driver_licence ?? c.licence_number ?? "—");
    const assessorName = esc(c.assessor_name ?? "—");
    const repairerName = esc(quoteArr[0]?.repairer ?? "—");
    const policeCaseNo = esc(c.police_case_number ?? c.police_reference ?? "—");
    const policeStatus = esc(c.police_status ?? "—");
    const incidentType = esc(c.incident_type ?? "Single vehicle");

    // Bug #6: Date anomaly flag — incident date predates vehicle model year
    const vehicleYear = Number(c.vehicle_year ?? 0);
    const incidentDateObj = c.incident_date ? new Date(String(c.incident_date)) : null;
    const incidentYear = incidentDateObj && !isNaN(incidentDateObj.getTime()) ? incidentDateObj.getFullYear() : 0;
    const dateAnomalyFlag = vehicleYear > 0 && incidentYear > 0 && incidentYear < vehicleYear;
    const genDate      = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    // CONSIST-05 fix: use claim_reference directly if it already carries a DOC- prefix;
    // otherwise derive from claim submission date (not today's date) to avoid date mismatch.
    const docRef = (String(c.claim_reference ?? "").startsWith("DOC-"))
      ? esc(String(c.claim_reference))
      : (() => {
          const submittedAt = c.created_at ? new Date(String(c.created_at)) : new Date();
          const datePart = isNaN(submittedAt.getTime())
            ? new Date().toISOString().slice(0,10).replace(/-/g,"")
            : submittedAt.toISOString().slice(0,10).replace(/-/g,"");
          return `DOC-${datePart}-${String(claimRef).replace(/[^A-Z0-9]/gi,"").slice(0,8).toUpperCase()}`;
        })();
    const kingaRef     = esc(c.kinga_reference ?? `KNG-KINGA-${new Date().getFullYear()}-${String(claimId).padStart(6,"0")}-FR`);

    // Decision chip
    const recommendation = reportDecision.status.toLowerCase();
    const decisionChipCls = reportDecision.chipClass;
    const decisionChipLabel = `${reportDecision.icon} ${reportDecision.status.replaceAll("_", " ")}`;

    // Score cell classes
    function scoreCellCls(score: number, invert = false): string {
      if (invert) return score >= 70 ? "good" : score >= 40 ? "warn" : "bad";
      return score >= 70 ? "bad" : score >= 40 ? "warn" : "good";
    }

    // Pill helper (inline)
    function p(label: string, cls: "green" | "amber" | "red" | "grey"): string {
      return `<span class="pill ${cls}">${esc(label)}</span>`;
    }

    // Callout helper (inline)
    function co(content: string, variant: "" | "amber" | "red" | "green" = ""): string {
      return `<div class="callout${variant ? " " + variant : ""}">${content}</div>`;
    }

    // Section tab helper
    function sectionTab(num: string, title: string, flagLabel = "", flagCls: "high" | "mid" | "ok" | "muted" | "" = ""): string {
      const flag = flagLabel ? `<span class="flag-right ${flagCls}">${esc(flagLabel)}</span>` : "";
      return `<div class="section-tab"><span class="num">${num}</span> ${esc(title)}${flag}</div>`;
    }

    // KV table row helper
    function kvRow(label: string, value: string): string {
      return `<tr><td class="k">${esc(label)}</td><td class="v">${value}</td></tr>`;
    }

    // ── SVG: Speed bar chart ─────────────────────────────────────────────────
    const chartWidth = 320;
    const chartHeight = 130;
    const barWidth = Math.floor((chartWidth - 40) / speedMethods.length) - 10;
    const maxBarHeight = 90;
    const baselineY = 105;
    const speedBars = speedMethods.map((m, i) => {
      const x = 35 + i * (barWidth + 10);
      if ((m as SpeedMethod).notRan) {
        const stubH = 8;
        const stubY = baselineY - stubH;
        return `<rect x="${x}" y="${stubY}" width="${barWidth}" height="${stubH}" fill="#e0e0e0" stroke="#c0c0c0" stroke-width="0.5" stroke-dasharray="3,2"/>
<text x="${x + barWidth/2}" y="${stubY - 3}" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="8" fill="#9e9e9e">N/A</text>
<text transform="translate(${x + barWidth/2},118) rotate(-35)" text-anchor="end" font-family="Helvetica Neue,Arial,sans-serif" font-size="6.5" fill="#9e9e9e">${esc(m.label.length > 14 ? m.label.slice(0,13) + '…' : m.label)}</text>`;
      }
      const h = Math.max(4, Math.round((m.speed / maxSpeed) * maxBarHeight));
      const y = baselineY - h;
      const fill = m.danger ? "#a83232" : m.highlight ? "#437D87" : "#bdbdbd";
      const textFill = m.danger ? "#a83232" : "#171717";
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${fill}"/>
<text x="${x + barWidth/2}" y="${y - 4}" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="10" font-weight="700" fill="${textFill}">${m.speed}</text>
<text transform="translate(${x + barWidth/2},118) rotate(-35)" text-anchor="end" font-family="Helvetica Neue,Arial,sans-serif" font-size="7" fill="#4a4a4a">${esc(m.label.length > 14 ? m.label.slice(0,13) + '…' : m.label)}</text>`;
    }).join("\n");

    const speedDiscrepancy = preImpactSpeed > 0 && consensusSpeed > 0 && preImpactSpeed > consensusSpeed
      ? Math.round(((preImpactSpeed - consensusSpeedRounded) / consensusSpeedRounded) * 100) : 0;

    const forensicNextSteps = [
      ...(missingFromQuote > 0
        ? ["Request an itemised quote with unit pricing to enable parts-level cost reconciliation."]
        : []),
      ...(hasDuplicateRegistrationFlag
        ? [`Cross-check the ${linkedClaims.length} prior tenant-scoped claim${linkedClaims.length !== 1 ? "s" : ""} recorded for this registration.`]
        : []),
      ...(zonesCovered < totalZones
        ? ["Obtain additional photographs of the affected vehicle areas."]
        : []),
      "Obtain a qualified governing collision measurement or documented human engineering review before publishing collision physics.",
    ];

    // ── PAGE 1 ───────────────────────────────────────────────────────────────
    const page1 = `
<div class="page">
  <!-- MASTHEAD -->
  <div class="masthead">
    <div>
      <div class="brand sans">KINGA<span>·</span>AI</div>
      <div class="doc-title">Forensic Claim Decision Report</div>
      <div class="doc-sub">KINGA Engine v4.2 · Automated analysis — not legal advice · Requires human adjuster review before any claim decision is finalised</div>
    </div>
    <div class="meta sans">
      <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style="height:28px;display:block;margin-bottom:8px;margin-left:auto">
      <div class="claimno mono">${kingaRef}</div>
      <div>Claim <span class="mono">${docRef}</span></div>
      <div>Generated ${genDate}</div>
      <div class="decision-chip ${decisionChipCls}">${decisionChipLabel}</div>
    </div>
  </div>

  <!-- SCORECARD (5 KPIs) -->
  <div class="scorecard sans">
    <div class="score-cell warn" data-p0-fraud-decision="withheld">
      <div class="label">Fraud Decision</div>
      <div class="value" style="font-size:12px;">WITHHELD</div>
      <div class="sub">Manual review required</div>
    </div>
    <div class="score-cell warn" data-p0-collision-physics="withheld">
      <div class="label">Collision Physics</div>
      <div class="value" style="font-size:17px;">Withheld</div>
      <div class="sub">Manual review required</div>
    </div>
    <div class="score-cell warn" data-p0-collision-physics="withheld">
      <div class="label">Forensic Physics</div>
      <div class="value" style="font-size:17px;">Withheld</div>
      <div class="sub">Manual review required</div>
    </div>
    <div class="score-cell ${ifeCompletenessScore >= 90 ? 'good' : ifeCompletenessScore >= 70 ? 'warn' : 'bad'}">
      <div class="label">Data Completeness</div>
      <div class="value">${ifeCompletenessScore}<span style="font-size:12px;">%</span></div>
      <div class="sub">${ifeCompletenessScore >= 90 ? "Above threshold" : "Below 90% threshold"}</div>
    </div>
    <div class="score-cell ${(() => { const qs = Number(claimQuality?.overallScore); return qs >= 80 ? 'good' : qs >= 60 ? 'warn' : 'bad'; })()}">
      <div class="label">Quality Score</div>
      <div class="value">${claimQuality?.overallScore != null ? Number(claimQuality.overallScore) : "—"}${claimQuality?.overallScore != null ? `<span style="font-size:12px;">/100</span>` : ""}</div>
      <div class="sub">${claimQuality?.grade ? `Grade ${String(claimQuality.grade)}` : "Not published"}</div>
    </div>
  </div>

  ${costDecisionSummary}
  <!-- VERDICT STRIP (non-cost decision context) -->
  <div class="verdict-strip sans">
    <div class="verdict-cell">
      <div class="label">Market Value</div>
      <div class="value">${fmtCurrency(marketValue, claimCurrency)}</div>
    </div>
    <div class="verdict-cell">
      <div class="label">Repair Ratio</div>
      <div class="value">${rtvRatio > 0 ? rtvRatio.toFixed(1) + "%" : "—"}</div>
      <div class="sub">${rtvRatio > 0 ? `<span class="pill ${rtvRatio >= 75 ? "red" : "green"}">${rtvRatio >= 75 ? "Write-off threshold" : "Repair — below write-off"}</span>` : "—"}</div>
    </div>
    <div class="verdict-cell">
      <div class="label">Cost Verdict</div>
      <div class="value" style="font-size:14px; color:var(--${decisionChipCls === "approve" ? "green" : decisionChipCls === "reject" ? "red" : "amber"});">${decisionChipCls === "approve" ? "Approved" : decisionChipCls === "reject" ? "Rejected" : "Review"}</div>
      <div class="sub">Evidence-qualified cost review</div>
    </div>
  </div>
  ${costIntegrity.assessorCalibrationCostUsd !== null ? `<div class="callout amber" style="margin-top:8px"><b>Assessor documented cost — calibration reference only:</b> ${fmtCurrency(costIntegrity.assessorCalibrationCostUsd, claimCurrency)}. This prior assessor figure is retained for comparison with KINGA costing; it is not a submitted quote, L2 value, settlement agreement, or payment authority.</div>` : ""}
  <div class="callout" style="margin-top:8px;border-left-color:#2d5f8b;background:#f3f7fb;color:#294a66;"><b>Cost evidence boundary:</b> KINGA compares only traceable submitted evidence with equivalent repair scope, tax basis, and revision status. A pricing variance is a review signal, not a fraud conclusion, automatic adjustment, or settlement authority.</div>
  ${renderEvidenceGovernancePanel(evidenceGovernanceData, activeQuoteIds)}
  ${renderCostEvidenceStateHtml({ costIntegrity, formatAmount: (amount) => fmtCurrency(amount, claimCurrency), escapeHtml: esc })}
  ${renderP0B1FraudAbstentionMarker()}

  <!-- §01 EXECUTIVE SUMMARY -->
  <div class="section">
    ${sectionTab("01", "Executive Summary")}
    <div class="cols-2">
      <div class="box">
        <h4>Decision Rationale</h4>
        <p style="margin:0 0 6px 0;">Cost, quotation, vehicle, and documentary evidence remain available below. Collision-physics conclusions are withheld pending a qualified governing measurement or documented human engineering review.</p>
        ${(() => {
          const costVerdictDB = String(c.cost_verdict ?? (claimTruth as any)?.costBasis?.costVerdict ?? "").toUpperCase();
          const isReview = recommendation.includes("review");
          const costIsFair = costVerdictDB === "FAIR" || costVerdictDB === "UNDERPRICED";
          if (isReview && costIsFair) {
            const fallbackTriggers: string[] = [];
            if (Number(ife?.completenessScore ?? ife?.overallScore ?? 100) < 90) fallbackTriggers.push(`data completeness ${Number(ife?.completenessScore ?? ife?.overallScore ?? 0)}% (below 90% threshold)`);
            const triggers = fallbackTriggers;
            const triggerText = triggers.length > 0 ? triggers.join("; ") : "one or more non-cost forensic indicators";
            const sourceNote = " (published non-physics factors)";
            return `<div style="margin-bottom:8px;padding:6px 10px;background:#fff8e1;border-left:3px solid #f59e0b;font-size:10px;color:#4a4a4a;"><b>Review trigger note${sourceNote}:</b> The cost assessment is <b>${costVerdictDB}</b> — the submitted quote is within the acceptable benchmark range. The REVIEW recommendation was triggered by <b>${triggerText}</b>, not by the cost assessment. Adjuster review of the non-cost factors is required before settlement can proceed.</div>`;
          }
          return '';
        })()}
        <ul class="tight">
          <li>Collision-physics findings are withheld pending the required measurement or engineering review.</li>
          <li>Cost and documentary review indicators are shown in their respective evidence-qualified sections.</li>
        </ul>
      </div>
      <div class="box" data-p0-collision-physics="withheld">
        <h4>Collision Physics</h4>
        ${collisionPhysicsHoldHtml}
      </div>
    </div>
  </div>

  <!-- §02 CLAIM & VEHICLE OVERVIEW -->
  <div class="section">
    ${sectionTab("02", "Claim & Vehicle Overview")}
    <div class="cols-3">
      <div class="box">
        <h4>Vehicle</h4>
        <table class="kv">
          ${kvRow("Make / Model", vehicleDesc)}
          ${kvRow("Registration", `<span class="mono">${vehicleReg}</span>`)}
          ${vehicleVin ? kvRow("VIN", `<span class="mono">${vehicleVin}</span>`) : kvRow("VIN", `<span style="color:var(--red);">Not provided</span>`)}
          ${vehicleOdo !== "—" ? kvRow("Odometer", `${vehicleOdo} km`) : ""}
          ${marketValue > 0 ? kvRow("Market value", fmtUSD(marketValue)) : ""}
        </table>
      </div>
      <div class="box">
        <h4>Claim &amp; Policy</h4>
        <table class="kv">
          ${kvRow("Insurer", insurer)}
          ${kvRow("Claim ref.", `<span class="mono">${claimRef}</span>`)}
          ${kvRow("Claimant", claimantName)}
          ${policyNum !== "—" ? kvRow("Policy no.", `<span class="mono">${policyNum}</span>`) : ""}
          ${excess > 0 ? kvRow("Policy excess", fmtCurrency(excess, claimCurrency)) : ""}
          ${kvRow("Incident date", fmtD(c.incident_date))}
          ${dateAnomalyFlag ? `<tr><td class="k" style="color:var(--amber);">⚠ Date anomaly</td><td class="v" style="color:var(--amber);">Incident date (${incidentYear}) predates vehicle model year (${vehicleYear}) — verify before settlement</td></tr>` : ""}
          ${kvRow("Type", incidentType)}
        </table>
      </div>
      <div class="box">
        <h4>Parties &amp; Police</h4>
        <table class="kv">
          ${kvRow("Driver", driverName)}
          ${driverLicence !== "—" ? kvRow("Licence no.", `<span class="mono">${driverLicence}</span>`) : ""}
          ${assessorName !== "—" ? kvRow("Assessor", assessorName) : ""}
          ${repairerName !== "—" ? kvRow("Repairer", repairerName) : ""}
          ${policeCaseNo !== "—" ? kvRow("Police case", `<span class="mono">${policeCaseNo}</span>`) : ""}
          ${policeStatus !== "—" ? kvRow("Status", policeStatus) : ""}
        </table>
      </div>
    </div>
    ${renderVehiclePassportEvidencePanel({ snapshot: preLossCondition, formatDate: fmtD, escapeHtml: esc })}
  </div>

  <!-- §03 INCIDENT NARRATIVE & CROSS-VALIDATION -->
  <div class="section" data-p0-collision-physics="withheld">
    ${sectionTab("03", "Incident Narrative & Cross-Validation")}
    ${collisionPhysicsHoldHtml}
  </div>

  <div class="footer-strip sans">
    <div><img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style="height:14px;vertical-align:middle;margin-right:5px;display:inline-block">KINGA · Confidential Forensic Audit Report</div>
    <div>${docRef}</div>
  </div>
</div>`;

    // ── PAGE 2 ───────────────────────────────────────────────────────────────
    const page2 = `
<div class="page page-break">
  <!-- §04–05 COLLISION PHYSICS & STRUCTURAL ANALYSIS -->
  <div class="section" data-p0-collision-physics="withheld">
    ${sectionTab("04", "Collision Physics, Causation & Structural Analysis")}
    ${collisionPhysicsHoldHtml}
      </div>

  <div class="footer-strip sans">
    <div><img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style="height:14px;vertical-align:middle;margin-right:5px;display:inline-block">KINGA · Confidential Forensic Audit Report</div>
    <div>${docRef}</div>
  </div>
</div>`;

    // ── PAGE 3 ───────────────────────────────────────────────────────────────
    const maxQuoteAmount = quoteArr.length > 0 ? Math.max(...quoteAmounts) : 1;
    const quoteBars = quoteArr.map(q => {
      const amt = q.amountUsd ?? 0;
      const pct = maxQuoteAmount > 0 ? Math.round((amt / maxQuoteAmount) * 100) : 0;
      return `<div class="qbar-row sans"><div class="name">${esc(q.repairer || "Quote")}</div><div class="track"><div class="fill" style="width:${pct}%;"></div></div><div class="amt">${fmtCurrency(amt, claimCurrency)}</div></div>`;
    }).join("");
    const kingaPct = kingaOptimised !== null && maxQuoteAmount > 0 ? Math.round((kingaOptimised / maxQuoteAmount) * 100) : 0;

    const page3 = `
<div class="page page-break">
  <!-- §06 FINANCIAL VALIDATION -->
  <div class="section">
    ${sectionTab("06", "Financial Validation", hasSavings ? "Savings opportunity" : "Review", hasSavings ? "ok" : "high")}
    <div class="cols-2">
      <div class="box">
        <h4>Quotation Evidence</h4>
        ${sharedQuoteEvidenceHtml}
      </div>
      <div class="box">
        <h4>Cost Intelligence &amp; Settlement</h4>
        <table class="kv">
          ${lowestRef > 0 ? kvRow("Lowest submitted (L1)", fmtUSD(lowestRef)) : ""}
          ${kingaOptimised !== null ? kvRow("KINGA optimised (L2)", l2Display) : kvRow("KINGA optimised (L2)", "Incomplete — not published")}
          ${kvRow("Settlement Recommendation", recommendedSettlementDisplay)}
          ${hasSavings ? kvRow("Adjustment", `<span style="color:var(--red);">−${fmtUSD(savings)} (${savingsPct.toFixed(1)}%)</span>`) : ""}
        </table>
      </div>
    </div>
  </div>

  <!-- §07 QUOTE & SCOPE RECONCILIATION -->
  <div class="section">
    ${sectionTab("07", "Quote & Scope Reconciliation", missingFromQuote > 0 ? `${missingFromQuote} gaps` : "Clean", missingFromQuote > 0 ? "mid" : "ok")}
    <div class="cols-2">
      <div class="box">
        <h4>Coverage Summary</h4>
        <table class="kv">
          ${matchedComponents > 0 ? kvRow("Components matched", `${matchedComponents} of ${totalComponents} (${Math.round(matchedComponents/totalComponents*100)}%)`) : ""}
          ${missingFromQuote > 0 ? kvRow("Missing from quote", `<span style="color:var(--red);">${missingFromQuote}</span>`) : ""}
          ${extraInQuote > 0 ? kvRow("Extra in quote, not in damage list", String(extraInQuote)) : ""}
        </table>
      </div>
      <div class="box">
        <h4>Documentary Reconciliation</h4>
        <p class="small" style="margin-top:8px;">Review submitted quote line items, source documents, scope, tax basis, and revision history before finalising any cost decision.</p>
      </div>
    </div>
  </div>

  <!-- §08 PHOTO & DOCUMENT EVIDENCE -->
  <div class="section">
    ${sectionTab("08", "Photo & Document Evidence", `${zonesCovered} of ${totalZones} zones`, zonesCovered >= totalZones ? "ok" : "mid")}
    <div class="cols-3">
      <div class="box">
        <h4>Documents Received</h4>
        <table class="kv">
          ${Object.entries(docCompleteness).length > 0
            ? Object.entries(docCompleteness).map(([k, v]) => kvRow(esc(k.replace(/_/g, " ")), `${v}%`)).join("")
            : (docs as Record<string, unknown>[]).reduce((acc, d) => {
                const cat = String(d.document_category ?? "other");
                if (!acc.includes(cat)) acc.push(cat);
                return acc;
              }, [] as string[]).map(cat => kvRow(esc(cat.replace(/_/g, " ")), `<span class="pill green">Received</span>`)).join("")
          }
        </table>
      </div>
      <div class="box">
        <h4>Photo Coverage</h4>
        <table class="kv">
          ${kvRow("Photos analysed", String(totalPhotos))}
          ${kvRow("High confidence (≥70%)", `${highConfPhotos} / ${totalPhotos}`)}
          ${uniqueComponents > 0 ? kvRow("Unique components", String(uniqueComponents)) : ""}
          ${kvRow("Zones covered", `<span style="color:${zonesCovered < totalZones ? "var(--amber)" : "var(--green)"};">${zonesCovered} of ${totalZones}</span>`)}
        </table>
      </div>
      <div class="box">
        <h4>Coverage Gap</h4>
        <p class="small" style="margin:0;">${esc(String(ife?.coverageGapNote ?? "No photographic coverage of all damage zones claimed in narrative."))}</p>
        ${zonesCovered < totalZones ? `<span class="pill amber" style="margin-top:6px; display:inline-block;">Additional viewpoints recommended</span>` : ""}
      </div>
    </div>

    ${totalPhotos > 0 ? `
    <div class="box" style="margin-top:10px;">
      <h4>${enrichedPhotos.length > 0 ? `Photo Evidence — ${enrichedPhotos.length} images · ${highConfPhotos} usable (≥70% confidence)` : "Photo Evidence"}</h4>
      ${enrichedPhotos.length > 0
        ? photoZonePanel(
            enrichedPhotos.slice(0, 8).map((p: any) => projectP0A2DescriptivePhotoEvidence({
              url: p.url ?? '',
              zone: p.impactZone ?? undefined,
              caption: p.caption ?? undefined,
              usable: Number(p.confidenceScore ?? 0) >= 70,
              // Stored visual-physics and direction conclusions are stripped at this P0 boundary.
              directionContradiction: p.directionContradiction === true,
              semanticType: p.semanticType ?? p.imageClassification ?? undefined,
              detectedComponents: p.detectedComponents ?? undefined,
              classificationConfidence: p.classificationConfidence ?? p.semanticConfidence ?? undefined,
              classifier: p.classifier ?? undefined,
              selectionReason: p.selectionReason ?? undefined,
              fallbackWarning: p.fallbackWarning ?? undefined,
              suitableForCrushDepth: p.suitableForCrushDepth ?? undefined,
              physicsExclusionReason: p.physicsExclusionReason ?? undefined,
              sourcePage: p.sourcePage ?? undefined,
            })),
            4
          )
        : `<div class="photo-zone"><div class="photo-grid">${photoDocuments.slice(0, 4).map((d: any, i: number) => {
            const imgUrl = d.url ?? d.file_url ?? null;
            const caption = d.caption ?? d.file_name ?? `Photo ${i + 1}`;
            return `<div class="photo-tile"><div class="photo-ph">${imgUrl ? `<img src="${esc(imgUrl)}" alt="${esc(caption)}" style="width:100%;height:75px;object-fit:cover;"/>` : `<svg viewBox="0 0 100 75" preserveAspectRatio="none"><rect width="100" height="75" fill="#e4e4e4"/></svg>`}<span class="tag">${i + 1}</span></div><div class="photo-cap">${esc(caption)}</div></div>`;
          }).join('')}</div></div>`
      }
      <div style="margin-top:6px;">
        <table class="kv">
          ${uniqueComponents > 0 ? kvRow('Components identified', String(uniqueComponents)) : ''}
          ${kvRow('Safety system activation', esc(String(ife?.safetySystemActivation ?? '—')))}
        </table>
        ${zonesCovered < totalZones ? co('Single photograph per finding in this zone. Additional angles recommended for full assessment confidence.', 'amber') : ''}
      </div>
      <p class="caption" style="margin-top:4px;">${enrichedPhotos.length > 0 ? `${enrichedPhotos.length} photos from pipeline analysis · showing up to 8 · zone labels = pipeline-detected impact zone · red border = confidence <70%` : 'Thumbnails illustrate layout only — replace with source images from the claim asset store at export time.'}</p>
    </div>` : ""}

    <div class="box" style="margin-top:8px;" data-p0-collision-physics="withheld">
      <h4 style="margin:0 0 6px">Collision Geometry and Zone Coherence</h4>
      ${collisionPhysicsHoldHtml}
    </div>
  </div>

  <div class="footer-strip sans">
    <div><img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style="height:14px;vertical-align:middle;margin-right:5px;display:inline-block">KINGA · Confidential Forensic Audit Report</div>
    <div>${docRef}</div>
  </div>
</div>`;

    // ── PAGE 4 ───────────────────────────────────────────────────────────────
    const page4 = `
<div class="page page-break">
  <!-- §09 FRAUD DECISION BOUNDARY -->
  <div class="section">
    ${sectionTab("09", "Fraud Decision Boundary")}
    <div class="cols-2">
      <div class="box">
        ${renderP0B1FraudAbstentionMarker()}
      </div>
      <div class="box" style="${hasDuplicateRegistrationFlag ? "border-color:var(--red);" : ""}">
        ${hasDuplicateRegistrationFlag ? `
        <h4 style="color:var(--red);">⚠ Registration History — Manual Review</h4>
        <p style="margin:0 0 6px 0;">Registration ${vehicleReg} appears in <b>${linkedClaims.length} prior tenant-scoped claim${linkedClaims.length !== 1 ? "s" : ""}</b>.</p>
        <p class="small" style="margin:0;">This is documentary history only, not a collision-physics or fraud conclusion. Verify the related source records before acting on it.</p>
        ${co(`Recommend cross-referencing all ${linkedClaims.length} related claim IDs against this vehicle's claim history before approval.`, "red")}
        ` : `
        <h4>Collision-Physics Review Status</h4>
        ${collisionPhysicsHoldHtml}
        `}
      </div>
    </div>
    <div class="cols-2" style="margin-top:12px;">
      <div class="box">
        <h4>Policy Flags</h4>
        <table class="kv">
          ${excess > 0 ? kvRow("Excess applicable", fmtUSD(excess)) : ""}
          ${exclusions.length > 0 ? kvRow("Exclusion", `<span style="color:var(--red);">${esc(exclusions.map(e => e.item).join("; "))}</span>`) : kvRow("Exclusions", p("None identified", "green"))}
        </table>
      </div>
      <div class="box">
        <h4>Documentary Accident-Date Reconciliation</h4>
        <table class="kv">
          ${kvRow("Claim form vs. police report", "Source documents require manual date reconciliation before a documentary consistency conclusion is published.")}
        </table>
      </div>
    </div>
  </div>


  <!-- §09b–09c COLLISION GEOMETRY & INTERPRETATION -->
  <div class="section" data-p0-collision-physics="withheld">
    ${sectionTab("09b", "Collision Geometry & Interpretation")}
    ${collisionPhysicsHoldHtml}
      </div>

  <!-- §10 VALIDATION, DECISION & NEXT STEPS -->
  <div class="section">
    ${sectionTab("10", "Validation, Decision & Next Steps")}
    <div class="cols-2">
      <div class="box" data-p0-collision-physics="withheld">
        <h4>Forensic Physics Validation</h4>
        ${collisionPhysicsHoldHtml}
      </div>
      <div class="box">
        <h4>Required Next Steps</h4>
        <ul class="tight">
          ${forensicNextSteps.map(s => `<li>${esc(s)}</li>`).join("")}
        </ul>
      </div>
    </div>
  </div>

  <!-- §10b DISPUTE FLAG -->
  ${disputes.length > 0 ? `<div class="section">
    ${sectionTab("10b", "Dispute Record", "Dispute Filed", "high")}
    <table class="grid-t">
      <tr><th>Dispute ID</th><th>Reason</th><th>Status</th><th>Filed</th><th>Resolved</th><th>Resolution Notes</th></tr>
      ${disputes.map((d: Record<string, unknown>) => {
        const status = String(d.dispute_status ?? 'Open');
        const statusPill = p(status, status.toLowerCase() === 'resolved' ? 'green' : status.toLowerCase() === 'open' ? 'red' : 'amber');
        return `<tr><td>#${d.id}</td><td>${esc(String(d.dispute_reason ?? '—'))}</td><td>${statusPill}</td><td>${d.created_at ? new Date(String(d.created_at)).toLocaleDateString('en-GB') : '—'}</td><td>${d.resolved_at ? new Date(String(d.resolved_at)).toLocaleDateString('en-GB') : '—'}</td><td class="small">${esc(String(d.resolution_notes ?? '—'))}</td></tr>`;
      }).join('')}
    </table>
    <p class="caption">This claim has an active or historical dispute on record. Settlement must not be finalised until all disputes are resolved and documented.</p>
  </div>` : ''}
  <!-- §11 APPROVAL CHAIN -->
  <div class="section">
    ${sectionTab("11", "Approval Chain")}
    <div class="box">
      <table class="grid-t">
        <tr><th>Stage</th><th>Role</th><th>Status</th><th>Officer</th><th>Date</th></tr>
        ${approvalStages.map(s => {
          const status = String(s.status ?? "Pending");
          const statusPill = p(status, status.toLowerCase() === "complete" ? "green" : status.toLowerCase() === "awaiting" ? "amber" : "grey");
          return `<tr><td>${s.stage}</td><td>${esc(s.role)}${s.stage === 5 ? ` <span class="small">(optional)</span>` : ""}</td><td>${statusPill}</td><td>${esc(String(s.officer ?? "—"))}</td><td>${esc(String(s.date ?? "—"))}</td></tr>`;
        }).join("")}
      </table>
      <p class="caption">${completedStages} of ${requiredStages} required stages complete. Structured reviewer notes (findings, verdict, action required) are mandatory at every stage — generic sign-offs are not accepted.</p>
    </div>
  </div>

  <div class="caption" style="margin-top:6px; line-height:1.5;">
    <b>Glossary —</b> FCDI: Forensic Confidence &amp; Data Integrity, a composite 0–100 reliability score; scores below 60 require mandatory adjuster review. NFS: negotiation-feasibility score for cost benchmarking.
  </div>

  <div class="footer-strip sans" style="position:static; margin-top:10px;">
    <div><img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style="height:14px;vertical-align:middle;margin-right:5px;display:inline-block">CONFIDENTIAL — For authorised insurer use only · KINGA · Not legal advice · Requires qualified human adjuster review before any claim decision is finalised</div>
    <div>${docRef}</div>
  </div>
</div>`;

    const body = renderClaimReportReadinessBanner(c) + page1 + page2 + page3 + page4;
    return buildKingaFdrHtml(`KINGA Forensic Claim Decision Report — ${claimRef}`, body);
}
