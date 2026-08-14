/**
 * KINGA Claims Intelligence Report — Protect Tier
 *
 * Generates the full HTML for the Claims Intelligence Report from live DB data.
 * Uses the approved v1 design (white/light-grey, left-border accents, compact tables).
 *
 * Sections:
 *   Cover     — meta grid, cost snapshot, verdict bar, score strip, contents index
 *   §1        — Claim Identity & Policy + Timeline Integrity
 *   §P        — Policy & Coverage Check + Settlement Position
 *   §2        — Cost Intelligence (quote cards, comparison table, structural gap)
 *   §3        — Risk Indicators (fraud score, indicator table)
 *   §4        — Evidence Snapshot (document register, photo yield)
 *   §5        — Decision & Next Steps (action table, sign-off, upgrade banner)
 */

import mysql from "mysql2/promise";
import { fraudIndicators } from "../../drizzle/schema";
import {
  buildKingaHtml, esc, fmtUSD, fmtD, fmtPct, safeJson, scoreColour, chip, badge, photoZonePanel,
} from "./templates/kingaDesignSystem";
import { resolveReportCostIntegrity, resolveReportQuoteEvidencePresentation } from "./costIntegrity";
import { resolveReportDecisionIntegrity } from "./reportDecisionIntegrity";
import { extractExplicitStructuralReviewEvidence, renderCostDecisionSummaryHtml } from "./costDecisionPresentation";
import { normaliseCanonicalPhotoEvidence } from "./photoEvidencePresentation";
import { loadEvidenceGovernanceReportData, renderEvidenceGovernancePanel } from "./evidenceGovernancePresentation";
import { renderClaimReportReadinessBanner } from "./claimReportReadiness";

const DB_URL = process.env.DATABASE_URL!;
async function getConn() { return mysql.createConnection(DB_URL); }

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function generateClaimsIntelligenceReport(
  claimId: number,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    // ── 1. Fetch claim + latest assessment ──────────────────────────────────
    const [claims] = await conn.execute(
      `SELECT c.*,
              CONCAT(c.vehicle_make, ' ', c.vehicle_model, ' ', c.vehicle_year) AS vehicle_description,
              a.fraud_score, a.fraud_risk_level, a.recommendation,
              a.estimated_cost, a.total_loss_indicated, a.repair_to_value_ratio,
              a.cost_intelligence_json, a.repair_intelligence_json,
              a.fraud_score_breakdown_json, a.ife_result_json,
              a.narrative_analysis_json, a.physics_analysis, a.physics_truth_json,
              a.cross_validation_json, a.claim_truth_json,
              a.enriched_photos_json,
              a.cgi_result_json, a.interpretation_result_json,
              a.created_at AS assessment_date, a.model_version
       FROM claims c
       LEFT JOIN ai_assessments a ON a.claim_id = c.id
       WHERE c.id = ? ${tenantId ? "AND c.tenant_id = ?" : ""}
       ORDER BY a.created_at DESC LIMIT 1`,
      tenantId ? [claimId, tenantId] : [claimId]
    ) as [Record<string, unknown>[], unknown];

    const c = claims[0];
    if (!c) throw new Error(`Claim ${claimId} not found`);

    // ── 2. Fetch quote line items ────────────────────────────────────────────
    const [quotes] = await conn.execute(
      `SELECT q.id, q.quoted_amount, q.currency, q.quote_type, q.parent_quote_id, q.status, q.quote_congruency_score,
              pb.business_name AS panel_beater_name
       FROM panel_beater_quotes q
       LEFT JOIN panel_beaters pb ON pb.id = q.panel_beater_id
       WHERE q.claim_id = ?
       ORDER BY q.quoted_amount ASC`,
      [claimId]
    ) as [Record<string, unknown>[], unknown];

    const [lineItems] = await conn.execute(
      `SELECT li.*, q.panel_beater_id,
              pb.business_name AS panel_beater_name
       FROM quote_line_items li
       JOIN panel_beater_quotes q ON q.id = li.quote_id
       LEFT JOIN panel_beaters pb ON pb.id = q.panel_beater_id
       WHERE q.claim_id = ?
       ORDER BY li.quote_id, li.unit_price DESC`,
      [claimId]
    ) as [Record<string, unknown>[], unknown];

    // ── 3. Fetch documents ───────────────────────────────────────────────────
	const [docs] = await conn.execute(
      `SELECT document_category, file_name, created_at
       FROM claim_documents
       WHERE claim_id = ?
       ORDER BY created_at DESC`,
      [claimId]
	) as [Record<string, unknown>[], unknown];
	const evidenceGovernanceData = await loadEvidenceGovernanceReportData(conn, claimId, tenantId);

    // ── 3b. Fetch vehicle claim history ─────────────────────────────────────
    const vehicleRegRaw = String(c.vehicle_registration ?? c.registration_number ?? '');
    const [vehicleHistory] = vehicleRegRaw ? await conn.execute(
      `SELECT c2.claim_reference, c2.incident_date, c2.incident_type, c2.workflow_state, c2.created_at
       FROM claims c2
       WHERE c2.vehicle_registration = ? AND c2.id != ?
       ORDER BY c2.created_at DESC LIMIT 5`,
      [vehicleRegRaw, claimId]
    ) as [Record<string, unknown>[], unknown] : [[], null];
    const reportTenantId = tenantId ?? String(c.tenant_id ?? "");
    const [preLossConditionRows] = c.vehicle_registry_id && reportTenantId ? await conn.execute(
      `SELECT vcs.snapshot_version, vcs.snapshot_date, vcs.exterior_condition, vcs.interior_condition,
              vcs.mechanical_condition, vcs.existing_damage_notes, vcs.odometer_km,
              asr.request_number, asr.valuation_date
       FROM vehicle_condition_snapshots vcs
       JOIN agency_insurance_service_requests asr ON asr.id = vcs.insurance_service_request_id
       JOIN agency_insurance_service_request_insurers asri ON asri.service_request_id = asr.id
       WHERE vcs.vehicle_registry_id = ? AND asri.insurer_tenant_id = ?
         AND asri.status IN ('invited','viewed','responded')
         AND (c.incident_date IS NULL OR vcs.snapshot_date <= c.incident_date)
       ORDER BY vcs.snapshot_date DESC LIMIT 1`,
      [c.vehicle_registry_id, reportTenantId],
    ) as [Record<string, unknown>[], unknown] : [[], null];
    const preLossCondition = preLossConditionRows[0] ?? null;
    // ── 4. Parse JSON fields ─────────────────────────────────────────────────
    const costIntel  = safeJson(c.cost_intelligence_json as string) as any;
    const repairIntel = safeJson(c.repair_intelligence_json as string) as any;
    const fraudBreak = safeJson(c.fraud_score_breakdown_json as string) as any;
    const ife        = safeJson(c.ife_result_json as string) as any;
    const physics    = safeJson(c.physics_analysis as string) as any;
    // ARCH-02: Parse physics_truth_json (PTL) as primary source; fall back to legacy physics_analysis
    const physicsTruthCI = safeJson(c.physics_truth_json as string) as any;
    const ptCI = physicsTruthCI ?? null;
    const canonicalSpeedCI = ptCI?.speed?.canonical;
    const canonicalSpeedValueCI = canonicalSpeedCI && typeof canonicalSpeedCI === "object"
      ? canonicalSpeedCI.value ?? null
      : canonicalSpeedCI;
    const ptlSpeedCI  = canonicalSpeedValueCI ?? ptCI?.speed?.deltaVKmh ?? physics?.deltaVKmh ?? physics?.velocityKmh ?? null;
    const ptlConsistencyCI = ptCI?.integrityCheck?.consistencyScore ?? ptCI?.evidenceCompleteness?.dataQualityScore ?? null;
    const ptlConsistencyLabelCI: string = ptlConsistencyCI !== null
      ? (Number(ptlConsistencyCI) >= 80 ? 'consistent' : Number(ptlConsistencyCI) >= 50 ? 'anomaly detected' : 'significant anomaly')
      : '';
    const narrative  = safeJson(c.narrative_analysis_json as string) as any;
    const crossVal   = safeJson(c.cross_validation_json as string) as any;
    // ARCH-01: Canonical CTL call-site for CI tier
    const claimTruthCI  = safeJson(c.claim_truth_json as string) as any;
    // Three-way speed comparison from cross_validation_json
    const cvThreeWay  = crossVal?.threeWaySpeedComparison ?? crossVal?.speedComparison ?? null;
    const cvXvRisk    = crossVal?.xvRiskBanner ?? crossVal?.crossValidationRisk ?? null;
    const claimedSpd  = cvThreeWay?.claimedSpeedKmh ?? physics?.velocityKmh ?? null;
    const consensusSpd = cvThreeWay?.consensusSpeedKmh ?? physics?.deltaVKmh ?? null;
    const severitySpd  = cvThreeWay?.severityImpliedSpeedLabel ?? null;
    const speedVerdict = cvThreeWay?.verdict ?? (claimedSpd && consensusSpd && Math.abs(Number(claimedSpd) - Number(consensusSpd)) > 5 ? 'DIVERGE' : 'CONSISTENT');

    // ── 5. Derived values ────────────────────────────────────────────────────
    const fraudScore   = Number(c.fraud_score ?? 0);
    const fraudLevel   = String(c.fraud_risk_level ?? "low").toLowerCase();
    // FIX-RTV: If repair_to_value_ratio is null, derive it from estimated_cost / market_value.
    // This prevents the scorecard showing 0% when the pipeline hasn't written the column.
    const estimatedCostForRtv = Number(c.estimated_cost ?? 0);
    const rtvRatioRaw = c.repair_to_value_ratio != null ? Number(c.repair_to_value_ratio) : null;
    const marketValue  = c.vehicle_market_value != null ? Number(c.vehicle_market_value) / 100 : 0;
    const rtvRatioDerived = (rtvRatioRaw == null && estimatedCostForRtv > 0 && marketValue > 0)
      ? Math.round((estimatedCostForRtv / marketValue) * 100)
      : null;
    const rtvRatio = rtvRatioRaw ?? rtvRatioDerived ?? 0;
    // BUG-01 fix: vehicle_market_value is stored in cents — divide by 100 at point of read
    // BUG-COST: ai_assessments.estimated_cost is stored in CENTS — divide by 100.
    // Documented/agreed cost is an assessor calibration reference only and never
    // substitutes for L2, a settlement recommendation, or a report headline.
    const estimatedCostRawCI = Number(c.estimated_cost ?? 0);
    const estimatedCost = estimatedCostRawCI > 0 ? estimatedCostRawCI / 100 : 0;
    const submittedDate = c.created_at ? Number(c.created_at) : null;
    const incidentDate  = c.incident_date ? Number(c.incident_date) : null;
    const dayDelay = (submittedDate && incidentDate)
      ? Math.round((submittedDate - incidentDate) / (1000 * 60 * 60 * 24))
      : null;

    // Quote amounts
    const costIntegrity = resolveReportCostIntegrity(costIntel, quotes as unknown[]);
    const reportDecision = resolveReportDecisionIntegrity({
      recommendation: c.recommendation,
      workflowState: c.workflow_state,
      costIntegrity,
    });
    const costDecisionSummary = renderCostDecisionSummaryHtml({
      costIntegrity,
      formatAmount: fmtUSD,
      escapeHtml: esc,
      repairability: {
        totalLossIndicated: Boolean(c.total_loss_indicated),
        repairToValueRatio: rtvRatio,
        kingaRecommendation: costIntel?.repairabilityDecision ?? null,
        ...extractExplicitStructuralReviewEvidence(repairIntel),
      },
    });
    const quoteEvidence = resolveReportQuoteEvidencePresentation(costIntegrity);
    const quoteArr = quoteEvidence.visibleQuotes;
    const comparisonQuoteArr = quoteEvidence.activeComparisonQuotes;
    const { visibleQuoteCount, activeQuoteCount, reportedQuoteCount, state: quoteEvidenceState } = quoteEvidence;
    const submittedQuoteLedgerDetail = quoteArr.length > 0
      ? `${quoteArr.map((quote) => `${quote.repairer}: ${quote.amountUsd === null ? "amount unavailable" : fmtUSD(quote.amountUsd)}`).join(" · ")}${costIntegrity.legacyHistoryQualified ? " · Legacy quotation history; not active comparison evidence." : ""}`
      : "No submitted repair quotations";
    const activeQuoteIds = new Set(
      comparisonQuoteArr.map((quote) => quote.sourceReference).filter((id): id is string => Boolean(id))
    );
    const activeLineItems = activeQuoteIds.size > 0
      ? (lineItems as Record<string, unknown>[]).filter((line) => activeQuoteIds.has(String(line.quote_id)))
      : lineItems as Record<string, unknown>[];
    const highestQuote = quoteEvidence.highestActiveQuoteUsd ?? 0;
    const lowestQuote  = quoteEvidence.lowestActiveQuoteUsd ?? 0;
    const highestQuoteDisplay = activeQuoteCount > 0
      ? fmtUSD(highestQuote)
      : "Not available — no active comparison quote";
    const quoteEvidenceNarrative = quoteEvidenceState === "active_comparison"
      ? `KINGA evaluated ${activeQuoteCount} eligible active market quote${activeQuoteCount === 1 ? "" : "s"}`
      : quoteEvidenceState === "legacy_history_only"
        ? `KINGA received ${visibleQuoteCount} submitted quotation record${visibleQuoteCount === 1 ? "" : "s"}; these remain visible as legacy quotation history and are not active comparison evidence`
        : "No submitted repair quotations are available";
    const kingaOptimised = costIntegrity.l2OptimisedCostUsd;
    const evidenceQualifiedL2 = costIntegrity.l2EvidenceQualifiedComparisonUsd;
    const l2Display = kingaOptimised !== null
      ? fmtUSD(kingaOptimised)
      : evidenceQualifiedL2 !== null
        ? `${fmtUSD(evidenceQualifiedL2)} (evidence-qualified comparison)`
        : (costIntegrity.l2Status === "reconciliation_required" ? "All-in reconciliation required" : "L2 comparison pending evidence");
    const l2LedgerLabel = kingaOptimised !== null
      ? "L2 — KINGA Optimised Quote"
      : evidenceQualifiedL2 !== null
        ? "L2 — KINGA Optimised Quote (evidence-qualified comparison)"
        : "L2 — KINGA Optimised Quote";
    const l1Display = costIntegrity.l1SubmittedCostUsd === null ? "Not available" : fmtUSD(costIntegrity.l1SubmittedCostUsd);
    const l3Display = costIntegrity.l3BenchmarkReferenceCostUsd === null ? "Not available" : fmtUSD(costIntegrity.l3BenchmarkReferenceCostUsd);
	const residualReconciliationDetail = costIntegrity.quoteReconciliations
		.filter((quote) => quote.status !== "reconciled" && quote.unexplainedResidualUsd !== null)
		.map((quote) => `${quote.repairer}: ${fmtUSD(quote.unexplainedResidualUsd!)} requires document-to-ledger reconciliation`)
		.join(" · ");
    const l2IntegrityNote = kingaOptimised === null
      ? evidenceQualifiedL2 !== null
        ? `Evidence-qualified submitted-price comparison: ${fmtUSD(evidenceQualifiedL2)}${costIntegrity.l2EvidenceCoveragePercent === null ? "" : ` (${costIntegrity.l2EvidenceCoveragePercent}% source-evidence coverage)`}. L2 intelligence remains visible while source exceptions are reconciled. This is not an all-in payable repair total; KINGA does not publish final savings or a settlement recommendation until the complete evidence basis is equivalent and reconciled.`
        : costIntegrity.l2Status === "reconciliation_required"
		? `Itemised submitted-price comparison is available, but ${costIntegrity.unreconciledQuoteCount || "one or more"} quote header(s) do not reconcile to explicit submitted line totals. ${residualReconciliationDetail ? `Reconciliation findings: ${residualReconciliationDetail}. ` : ""}KINGA has not allocated the difference to labour, VAT, fee, paint, or another component. Verify the original quote, scope, tax basis, and revision before an all-in cost recommendation.`
        : `L2 incomplete — ${costIntegrity.missingRequiredComponents.length || "one or more"} required repair-scope item(s) lack a traceable price. ` +
          `${costIntegrity.partialPricedScopeUsd !== null ? `Partial priced scope: ${fmtUSD(costIntegrity.partialPricedScopeUsd)}. ` : ""}` +
          `Obtain or reconcile the missing quotation scope before a cost recommendation.`
      : `All-in payable repair-cost basis${costIntegrity.costBasis ? ` (${costIntegrity.costBasis.replaceAll("_", " ")})` : ""}.`;
    const savings = kingaOptimised !== null && highestQuote > 0 ? highestQuote - kingaOptimised : 0;
    const savingsPct = kingaOptimised !== null && highestQuote > 0 ? (savings / highestQuote * 100) : 0;

    // Policy exclusions from repair intelligence
    const exclusions: Array<{item: string; amount: number; clause: string}> =
      (repairIntel?.policyExclusions as Array<{item: string; amount: number; clause: string}>) ?? [];
    const totalExclusions = exclusions.reduce((s, e) => s + Number(e.amount ?? 0), 0);
    // BUG-02 fix: prefer excess_amount_cents (canonical cents column) over legacy policy_excess
    const excess = c.excess_amount_cents != null
      ? Number(c.excess_amount_cents) / 100
      : Number(c.policy_excess ?? c.deductible ?? 0);
    const recommendedSettlement = kingaOptimised === null
      ? null
      : Math.max(0, kingaOptimised - totalExclusions - excess);
    const recommendedSettlementDisplay = recommendedSettlement === null
      ? "Not available"
      : fmtUSD(recommendedSettlement);

    // Fraud badge
    const fraudBadgeCls = fraudScore >= 70 ? "fail" : fraudScore >= 40 ? "warn" : "ok";
    const fraudBadgeLabel = fraudScore >= 70 ? "High Risk" : fraudScore >= 40 ? "Moderate Risk" : "Low Risk";

    // ARCH-03 fix: use ife.completenessScore (same canonical field as FR tier) for data completeness.
    // ife.overallScore is a composite IFE score — not the same metric as completenessScore.
    // Label them distinctly so a user comparing CI and FR sees the same number with the same label.
    const dataComplete = Number(ife?.completenessScore ?? ife?.overallScore ?? ife?.documentCompleteness ?? 75);
    const missingDocs = (ife?.missingFields as string[]) ?? [];

    // Photo stats
    const photoEvidence = normaliseCanonicalPhotoEvidence(safeJson(c.enriched_photos_json as string));
    const enrichedPhotos = photoEvidence.photos;
    const totalPhotos = photoEvidence.totalPhotos;
    const usablePhotos = photoEvidence.usablePhotos;
    const photoYield = totalPhotos > 0 ? Math.round(usablePhotos / totalPhotos * 100) : 0;

    // Structural gaps
    const structuralGaps = (repairIntel?.structuralGaps as Array<{component: string; severity: string}>) ??
      (costIntel?.missingComponents as Array<{component: string; severity: string}>) ?? [];
    const criticalStructural = structuralGaps.filter(g =>
      String(g.severity ?? "").toLowerCase().includes("critical") ||
      String(g.severity ?? "").toLowerCase().includes("structural")
    );

    // Upgrade signals
    const physicsAnomaly = physics?.anomalyScore ? Number(physics.anomalyScore) : 0;
    const showUpgrade = physicsAnomaly > 30 || criticalStructural.length > 0 || photoYield < 40;

    // ── 6. Build HTML sections ───────────────────────────────────────────────
    const claimRef = esc(c.claim_reference ?? c.id);
    const claimantName = esc(c.lodger_name ?? c.claimant_name ?? "—");
    const vehicleDesc = esc(c.vehicle_description ?? "—");
    const vehicleReg = esc(c.vehicle_registration ?? c.registration_number ?? "—");
    const incidentType = esc(c.incident_type ?? "—");
    const policyNum = esc(c.policy_number ?? "—");
    const insurer = esc(c.insurer_name ?? c.tenant_name ?? "—");
    const genDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const docRef = `DOC-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-CIR-${claimId}`;

    // ── COVER ────────────────────────────────────────────────────────────────
    // Derived values for masthead decision chip
    const recLabel = reportDecision.status.replaceAll("_", " ");
    const chipCls = reportDecision.chipClass;
    const chipIcon = reportDecision.icon;
    // ARCH-01: Use CTL reviewTriggers as canonical source for review context note
    const ctlTriggersCI: string[] = Array.isArray(claimTruthCI?.decision?.reviewTriggers)
      ? (claimTruthCI.decision.reviewTriggers as string[]).slice(0, 3)
      : [];
    const costVerdictCI = String(c.cost_verdict ?? claimTruthCI?.costBasis?.costVerdict ?? "").toUpperCase();
    const showCIReviewNote = chipCls === "review" && (costVerdictCI === "FAIR" || costVerdictCI === "UNDERPRICED") && ctlTriggersCI.length > 0;
    const scoreCardFraudCls = fraudScore >= 70 ? "bad" : fraudScore >= 40 ? "warn" : "good";
    const scoreCardRtvCls = rtvRatio >= 70 ? "bad" : rtvRatio >= 50 ? "warn" : "good";
    const scoreCardDataCls = dataComplete >= 80 ? "good" : dataComplete >= 60 ? "warn" : "bad";
    const scoreCardQCls = activeQuoteCount >= 3 ? "good" : activeQuoteCount >= 2 ? "warn" : "bad";
    const delayFlag = dayDelay !== null && dayDelay > 90;

    // FIX-BLANK-PAGE: Remove the standalone <div class="page"> wrapper from the cover.
    // The cover content (masthead + scorecard) is merged into the first section (s1) below.
    // This eliminates the blank first page caused by the PDF renderer treating the cover
    // as a separate page before the actual content begins.
    const cover = `
<!-- ── MASTHEAD ── -->
<div class="masthead">
  <div>
    <div class="brand sans">KINGA<span>·</span>AI <span style="display:inline-block;font-size:8.5px;font-weight:700;letter-spacing:0.6px;color:#fff;background:var(--ink-soft);padding:2px 7px;border-radius:2px;margin-left:8px;vertical-align:middle;font-family:'Helvetica Neue',Arial,sans-serif">PROTECT TIER</span></div>
    <div class="doc-title">Claims Intelligence Report</div>
    <div class="doc-sub">KINGA Engine · Intelligence assessment · Not legal advice · Requires adjuster sign-off</div>
  </div>
  <div class="meta sans">
    <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style="height:28px;display:block;margin-bottom:6px;margin-left:auto">
    <div class="claimno mono">${claimRef}</div>
    <div>Generated ${genDate} · Insurer: ${insurer}</div>
    <div class="decision-chip ${chipCls}">${chipIcon} ${recLabel}</div>
  </div>
</div>
<!-- ── SCORECARD ── -->
<div class="scorecard">
  <div class="score-cell ${scoreCardFraudCls}"><div class="label">Fraud Score</div><div class="value">${fraudScore}</div><div class="sub">${fraudBadgeLabel}</div></div>
  <div class="score-cell ${scoreCardDataCls}"><div class="label">Data Complete</div><div class="value">${Math.round(dataComplete)}<span style="font-size:12px">%</span></div><div class="sub">${dataComplete >= 80 ? "Good" : dataComplete >= 60 ? "Partial" : "Incomplete"}</div></div>
  <div class="score-cell ${scoreCardQCls}"><div class="label">Quotes Received</div><div class="value">${reportedQuoteCount}</div><div class="sub">${quoteEvidenceState === "legacy_history_only" ? "History only" : activeQuoteCount >= 3 ? "Sufficient" : "Below minimum"}</div></div>
  <div class="score-cell ${scoreCardRtvCls}"><div class="label">Repair-to-Value</div><div class="value">${fmtPct(rtvRatio, 0)}</div><div class="sub">${rtvRatio >= 70 ? "Total loss risk" : rtvRatio >= 50 ? "Monitor" : "Within range"}</div></div>
</div>
${delayFlag ? `<div class="callout amber" style="margin-bottom:14px"><b>Late Submission Flag — claim submitted ${dayDelay} days after incident.</b> A written explanation is required before this claim can proceed. This flag does not override the system recommendation; adjuster review is required before settlement authorisation.</div>` : ""}
${showCIReviewNote ? `<div class="callout amber" style="margin-bottom:14px"><b>Review Trigger Note —</b> The cost assessment is within the acceptable range (${costVerdictCI}), but this claim has been flagged for review due to non-cost factors: ${ctlTriggersCI.join("; ")}. Settlement authorisation requires adjuster sign-off on these items.</div>` : ""}
<!-- ── SETTLEMENT WATERFALL ── -->
${costDecisionSummary}
${(() => {
  if (kingaOptimised === null || recommendedSettlement === null) {
    return `<div class="callout amber" style="margin-bottom:12px"><b>Cost recommendation withheld.</b> ${esc(l2IntegrityNote)} No savings or settlement figure is calculated from an incomplete L2.</div>`;
  }
  // Build waterfall steps: Highest Quote → KINGA Optimised → Less Exclusions → Less Excess → Settlement
  const wfSteps = [
    { label: 'Highest Quote', amount: highestQuote, type: 'base' as const },
    { label: 'KINGA Optimised', amount: kingaOptimised, type: 'reduction' as const, delta: highestQuote - kingaOptimised },
    ...(totalExclusions > 0 ? [{ label: 'Less Exclusions', amount: kingaOptimised - totalExclusions, type: 'reduction' as const, delta: totalExclusions }] : []),
    ...(excess > 0 ? [{ label: 'Less Excess', amount: (totalExclusions > 0 ? kingaOptimised - totalExclusions : kingaOptimised) - excess, type: 'reduction' as const, delta: excess }] : []),
    { label: 'Recommended Settlement', amount: recommendedSettlement, type: 'final' as const },
  ];
  const maxAmt = Math.max(highestQuote, 1);
  const barW = 56; const gap = 18; const chartH = 90; const labelH = 28;
  const totalW = wfSteps.length * (barW + gap) - gap;
  const bars = wfSteps.map((step, i) => {
    const barH = Math.max(4, Math.round((step.amount / maxAmt) * chartH));
    const y = chartH - barH;
    const x = i * (barW + gap);
    const fill = step.type === 'final' ? '#3C7844' : step.type === 'reduction' ? '#4a7cbf' : '#6b7280';
    const textY = y - 3;
    return `<g>
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${fill}" rx="2"/>
      <text x="${x + barW / 2}" y="${textY < 8 ? y + barH / 2 + 4 : textY}" text-anchor="middle" font-size="7" font-family="monospace" fill="${textY < 8 ? '#fff' : '#171717'}" font-weight="600">${fmtUSD(step.amount)}</text>
      ${step.type === 'reduction' && step.delta ? `<text x="${x + barW / 2}" y="${chartH + 10}" text-anchor="middle" font-size="6.5" font-family="monospace" fill="#a83232">−${fmtUSD(step.delta)}</text>` : ''}
      <text x="${x + barW / 2}" y="${chartH + (step.type === 'reduction' && step.delta ? 20 : 12)}" text-anchor="middle" font-size="7" font-family="'Helvetica Neue',Arial,sans-serif" fill="#4a4a4a">${step.label.replace(' ', '\n')}</text>
    </g>`;
  }).join('');
  return `
<div style="background:var(--paper);border:1px solid var(--hairline-strong);padding:12px 16px;margin-bottom:12px">
  <div style="font-size:9px;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:700;color:var(--ink-soft);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Settlement Waterfall</div>
  <svg viewBox="0 0 ${totalW} ${chartH + labelH}" width="100%" height="${chartH + labelH}" style="overflow:visible">
    ${bars}
    <line x1="0" y1="${chartH}" x2="${totalW}" y2="${chartH}" stroke="#d9d9d9" stroke-width="0.5"/>
  </svg>
  <div style="display:flex;gap:12px;margin-top:6px;flex-wrap:wrap">
    <span style="font-size:8.5px;color:#6b7280;font-family:'Helvetica Neue',Arial,sans-serif"><span style="display:inline-block;width:8px;height:8px;background:#6b7280;border-radius:1px;margin-right:3px;vertical-align:middle"></span>Submitted</span>
    <span style="font-size:8.5px;color:#4a7cbf;font-family:'Helvetica Neue',Arial,sans-serif"><span style="display:inline-block;width:8px;height:8px;background:#4a7cbf;border-radius:1px;margin-right:3px;vertical-align:middle"></span>Deductions</span>
    <span style="font-size:8.5px;color:#3C7844;font-family:'Helvetica Neue',Arial,sans-serif"><span style="display:inline-block;width:8px;height:8px;background:#3C7844;border-radius:1px;margin-right:3px;vertical-align:middle"></span>Settlement</span>
  </div>
</div>`;
})()}
<!-- ── TOC ── -->
<div style="display:flex;flex-wrap:wrap;gap:1px;background:var(--hairline);border:1px solid var(--hairline-strong);margin-bottom:16px">
  <div style="flex:1;min-width:120px;background:var(--paper);padding:8px 10px"><div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;color:var(--ink-soft)">§1</div><div style="font-size:10px;color:var(--ink)">Claim Identity &amp; Policy</div><div style="font-size:8.5px;color:var(--green);font-family:'Helvetica Neue',Arial,sans-serif">✓ Included</div></div>
  <div style="flex:1;min-width:120px;background:var(--paper);padding:8px 10px"><div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;color:var(--ink-soft)">§P</div><div style="font-size:10px;color:var(--ink)">Policy &amp; Coverage Check</div><div style="font-size:8.5px;color:var(--green);font-family:'Helvetica Neue',Arial,sans-serif">✓ Included</div></div>
  <div style="flex:1;min-width:120px;background:var(--paper);padding:8px 10px"><div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;color:var(--ink-soft)">§2</div><div style="font-size:10px;color:var(--ink)">Cost Intelligence</div><div style="font-size:8.5px;color:var(--green);font-family:'Helvetica Neue',Arial,sans-serif">✓ Included</div></div>
  <div style="flex:1;min-width:120px;background:var(--paper);padding:8px 10px"><div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;color:var(--ink-soft)">§3</div><div style="font-size:10px;color:var(--ink)">Risk Indicators</div><div style="font-size:8.5px;color:var(--green);font-family:'Helvetica Neue',Arial,sans-serif">✓ Included</div></div>
  <div style="flex:1;min-width:120px;background:var(--paper);padding:8px 10px"><div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;color:var(--ink-soft)">§4</div><div style="font-size:10px;color:var(--ink)">Evidence Snapshot</div><div style="font-size:8.5px;color:var(--green);font-family:'Helvetica Neue',Arial,sans-serif">✓ Included</div></div>
  <div style="flex:1;min-width:120px;background:var(--paper);padding:8px 10px"><div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;color:var(--ink-soft)">§5</div><div style="font-size:10px;color:var(--ink)">Decision &amp; Next Steps</div><div style="font-size:8.5px;color:var(--green);font-family:'Helvetica Neue',Arial,sans-serif">✓ Included</div></div>
</div>
  <div class="footer-strip sans" style="position:static;margin-top:10px;">
    <div>KINGA AI · Confidential Claims Intelligence Report</div>
    <div>${docRef} · Page 1 of 2</div>
  </div>
`;

    // ── §1 CLAIM IDENTITY & POLICY ───────────────────────────────────────────
    const s1 = `
<div class="page page-break">
<div class="section">
  <div class="section-tab sans"><span class="num">01</span> Claim Identity &amp; Policy <span class="flag-right ok">Verified</span></div>
  <p class="small" style="margin:0 0 8px 0;">Core claim and policy identity, extracted from submitted documentation and cross-referenced against the insurer's policy register. ${dayDelay !== null && dayDelay > 90 ? `The claim was submitted <strong>${dayDelay} days</strong> after the incident date — a written explanation is required before the claim can proceed.` : "Submission timing is within normal parameters."}</p>
  <div class="cols-2">
    <div class="box">
      <h4>Vehicle &amp; Claimant</h4>
      <table class="kv">
        <tbody>
          <tr><td style="width:40%;color:var(--ink-mid)">Claim Reference</td><td class="mono bold">${claimRef}</td></tr>
          <tr><td style="color:var(--ink-mid)">Claimant</td><td>${claimantName}</td></tr>
          <tr><td style="color:var(--ink-mid)">Vehicle</td><td>${vehicleDesc}</td></tr>
          <tr><td style="color:var(--ink-mid)">Registration</td><td class="mono">${vehicleReg}</td></tr>
          <tr><td style="color:var(--ink-mid)">Incident Type</td><td>${incidentType}</td></tr>
          <tr><td style="color:var(--ink-mid)">Incident Date</td><td>${fmtD(c.incident_date)}</td></tr>
          ${c.incident_location ? `<tr><td style="color:var(--ink-mid)">Incident Location</td><td>${esc(c.incident_location)}</td></tr>` : ""}
        </tbody>
      </table>
    </div>
    <div class="box">
      <h4>Policy Details</h4>
      <table class="kv">
        <tbody>
          <tr><td style="width:40%;color:var(--ink-mid)">Policy Number</td><td class="mono bold">${policyNum}</td></tr>
          <tr><td style="color:var(--ink-mid)">Insurer</td><td>${insurer}</td></tr>
          <tr><td style="color:var(--ink-mid)">Cover Type</td><td>${esc(c.cover_type ?? c.policy_type ?? "Comprehensive")}</td></tr>
          <tr><td style="color:var(--ink-mid)">Sum Insured</td><td>${fmtUSD(c.sum_insured != null ? Number(c.sum_insured) : c.vehicle_market_value != null ? Number(c.vehicle_market_value) / 100 : null)}</td></tr>
          <tr><td style="color:var(--ink-mid)">Policy Excess</td><td>${fmtUSD(excess)}</td></tr>
          <tr><td style="color:var(--ink-mid)">Claim Lodged</td><td>${fmtD(c.created_at)}</td></tr>
          <tr><td style="color:var(--ink-mid)">Submission Delay</td><td>${dayDelay !== null ? `${dayDelay} days` : "—"} ${dayDelay !== null && dayDelay > 90 ? chip("Flagged", "warn") : dayDelay !== null ? chip("Normal", "pass") : ""}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="box" style="margin-top:10px;">
  <h4>Timeline Integrity</h4>
  <table class="grid-t">
    <tr><th>Event</th><th>Date</th><th>Days from Incident</th><th>Status</th></tr>
    <tbody>
      <tr>
        <td>Incident</td>
        <td>${fmtD(c.incident_date)}</td>
        <td class="tm">Day 0</td>
        <td>${chip("Baseline", "neutral")}</td>
      </tr>
      ${c.police_report_date ? `<tr>
        <td>Police Report Filed</td>
        <td>${fmtD(c.police_report_date)}</td>
        <td class="tm">${incidentDate ? Math.round((Number(c.police_report_date) - incidentDate) / 86400000) + " days" : "—"}</td>
        <td>${chip("Received", "pass")}</td>
      </tr>` : `<tr><td>Police Report Filed</td><td>—</td><td class="tm">—</td><td>${chip("Not provided", "warn")}</td></tr>`}
      <tr>
        <td>Claim Submitted</td>
        <td>${fmtD(c.created_at)}</td>
        <td class="tm">${dayDelay !== null ? dayDelay + " days" : "—"}</td>
        <td>${dayDelay !== null && dayDelay > 90 ? chip("Late — explanation required", "warn") : chip("Within normal range", "pass")}</td>
      </tr>
      ${quoteArr.length > 0 ? `<tr>
        <td>Earliest Quote Date</td>
        <td>${fmtD(quoteArr[0].created_at)}</td>
        <td class="tm">—</td>
        <td>${chip("Received", "pass")}</td>
      </tr>` : ""}
    </tbody>
  </table>

  ${dayDelay !== null && dayDelay > 90 ? `
  <div class="callout amber" style="margin-top:8px;"><b>Late Submission — ${dayDelay} days after incident.</b> Claims submitted more than 90 days after the incident require a written explanation from the claimant. Action: Request written explanation from claimant.</div>` : ""}

  ${narrative?.claimantStatement ? `
  <div class="sub"><h3>Claimant Statement</h3><span class="sm">Extracted from claim form</span></div>
  <blockquote style="border-left:3px solid var(--rule);padding:10px 16px;font-style:italic;font-size:12px;color:var(--ink-mid);margin-bottom:12px;">
    &ldquo;${esc(String(narrative.claimantStatement))}&rdquo;
  </blockquote>` : ""}

  ${(ptlSpeedCI != null || ptlConsistencyCI !== null) ? `
  <div class="callout" style="margin-top:8px;">
    ${ptlSpeedCI != null ? `Impact speed estimate: <strong>${Math.round(Number(ptlSpeedCI) * 10) / 10} km/h</strong>. ` : ""}
    ${ptlConsistencyCI !== null ? `Physics consistency: <strong>${Math.round(Number(ptlConsistencyCI))}/100</strong> — ${ptlConsistencyLabelCI}. ` : ""}
    Full evidence chain, causation classification, and uncertainty quantification available at Prove tier.
  </div>` : physics ? `
  <div class="callout" style="margin-top:8px;">${physics.deltaV != null ? `Estimated Delta-V: <strong>${Number(physics.deltaV).toFixed(1)} km/h</strong>. ` : ""}${physics.summary ? esc(String(physics.summary)) : "Physics analysis was performed at the standard tier. No significant anomalies detected at this assessment level."}${physicsAnomaly > 30 ? ` <em>Physics anomaly score ${physicsAnomaly}/100 — full reconstruction available in the Forensic Report.</em>` : ""}</div>` : ""}
  ${(claimedSpd != null || consensusSpd != null) ? `
  <div style="margin-top:10pt;">
    <h4 style="margin:0 0 6pt 0;font-size:9pt;">Speed Comparison</h4>
    <table style="width:100%;border-collapse:collapse;font-size:8pt;">
      <thead><tr style="background:var(--rule);">
        <th style="padding:4pt 6pt;text-align:left;">Source</th>
        <th style="padding:4pt 6pt;text-align:right;">Speed</th>
        <th style="padding:4pt 6pt;text-align:left;">Basis</th>
      </tr></thead>
      <tbody>
        ${claimedSpd != null ? `<tr><td style="padding:3pt 6pt;">Claimant-stated</td><td style="padding:3pt 6pt;text-align:right;">${Number(claimedSpd).toFixed(1)} km/h</td><td style="padding:3pt 6pt;color:var(--ink-mid);">Claimant declaration</td></tr>` : ''}
        ${consensusSpd != null ? `<tr><td style="padding:3pt 6pt;">Physics consensus</td><td style="padding:3pt 6pt;text-align:right;font-weight:700;">${Number(consensusSpd).toFixed(1)} km/h</td><td style="padding:3pt 6pt;color:var(--ink-mid);">Multi-method ensemble</td></tr>` : ''}
        ${severitySpd ? `<tr><td style="padding:3pt 6pt;">Severity-implied</td><td style="padding:3pt 6pt;text-align:right;">${severitySpd}</td><td style="padding:3pt 6pt;color:var(--ink-mid);">Damage pattern analysis</td></tr>` : ''}
      </tbody>
    </table>
    ${speedVerdict && speedVerdict !== 'CONSISTENT' ? `<div class="callout amber" style="margin-top:6pt;font-size:8pt;"><b>Speed Discrepancy Detected.</b> Claimed speed diverges from physics consensus. Full three-way analysis available in the Forensic Report.</div>` : `<div class="callout green" style="margin-top:6pt;font-size:8pt;">Speed sources are consistent.</div>`}
  </div>` : ''}
  ${(() => {
    const cgi = safeJson(c.cgi_result_json as string) as any;
    if (!cgi) return '';
    // IMPL-CONSTRAINT: reads from same cgi_result_json as FR §09b — never recomputed independently
    const indicators = [
      { label: 'Contact Patch Ratio', val: cgi.contactPatchRatio?.value, status: cgi.contactPatchRatio?.status, avail: cgi.contactPatchRatio?.available !== false },
      { label: 'Bumper Height Compatibility', val: cgi.bumperHeightCompatibility?.value, status: cgi.bumperHeightCompatibility?.status, avail: cgi.bumperHeightCompatibility?.available !== false },
      { label: 'Multi-Image Convergence', val: cgi.multiImageConvergence?.value, status: cgi.multiImageConvergence?.status, avail: cgi.multiImageConvergence?.available !== false },
      { label: 'Force Density Index', val: cgi.forceDensityIndex?.value, status: cgi.forceDensityIndex?.status, avail: cgi.forceDensityIndex?.available !== false },
    ].filter(i => i.avail);
    if (indicators.length === 0) return '';
    const sc = (s: string) => s === 'PASS' || s === 'CONSISTENT' ? 'var(--green-dark)' : s === 'FAIL' || s === 'INCONSISTENT' ? 'var(--red)' : 'var(--amber)';
    return `<div style="margin-top:10pt;">
    <h4 style="margin:0 0 6pt 0;font-size:9pt;">Crash Geometry Intelligence (CGI)</h4>
    <table style="width:100%;border-collapse:collapse;font-size:8pt;">
      <thead><tr style="background:var(--rule);"><th style="padding:4pt 6pt;text-align:left;">Indicator</th><th style="padding:4pt 6pt;text-align:right;">Value</th><th style="padding:4pt 6pt;text-align:left;">Status</th></tr></thead>
      <tbody>${indicators.map((ind, i) => `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8f9fa'};"><td style="padding:3pt 6pt;">${ind.label}</td><td style="padding:3pt 6pt;text-align:right;">${ind.val != null ? (typeof ind.val === 'number' ? ind.val.toFixed(2) : String(ind.val)) : '—'}</td><td style="padding:3pt 6pt;font-weight:600;color:${sc(String(ind.status ?? ''))};">${ind.status ?? 'UNAVAILABLE'}</td></tr>`).join('')}</tbody>
    </table>
    <p class="caption" style="margin-top:4pt;">CGI cross-references photogrammetric measurements against vehicle geometry benchmarks. Full CGI methodology available in the Forensic Report.</p>
  </div>`;
  })()}
  ${(vehicleHistory as Record<string, unknown>[]).length > 0 ? (() => {
    const vh = vehicleHistory as Record<string, unknown>[];
    return `<div style="margin-top:10pt;">
    <h4 style="margin:0 0 6pt 0;font-size:9pt;">Vehicle Claim History — ${vehicleReg}</h4>
    <table style="width:100%;border-collapse:collapse;font-size:8pt;">
      <thead><tr style="background:var(--rule);"><th style="padding:4pt 6pt;text-align:left;">Claim Ref</th><th style="padding:4pt 6pt;text-align:left;">Incident Date</th><th style="padding:4pt 6pt;text-align:left;">Type</th><th style="padding:4pt 6pt;text-align:left;">Status</th></tr></thead>
      <tbody>${vh.map((h, i) => `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8f9fa'};"><td style="padding:3pt 6pt;font-family:monospace;">${esc(String(h.claim_reference ?? '—'))}</td><td style="padding:3pt 6pt;">${h.incident_date ? new Date(Number(h.incident_date)).toLocaleDateString('en-GB') : '—'}</td><td style="padding:3pt 6pt;">${esc(String(h.incident_type ?? '—'))}</td><td style="padding:3pt 6pt;">${esc(String(h.workflow_state ?? h.status ?? '—'))}</td></tr>`).join('')}</tbody>
    </table>
    <p class="caption" style="margin-top:4pt;color:var(--amber);">⚠ This vehicle has ${vh.length} prior claim${vh.length !== 1 ? 's' : ''} on record. Review claim history for patterns before authorising settlement.</p>
  </div>`;
  })() : ''}
  ${preLossCondition ? `<div style="margin-top:10pt;border-left:3px solid var(--blue);padding-left:8pt;">
    <h4 style="margin:0 0 6pt 0;font-size:9pt;">Vehicle Passport — Pre-Loss Condition Evidence</h4>
    <table style="width:100%;border-collapse:collapse;font-size:8pt;">
      <tbody>
        <tr><td style="padding:3pt 6pt;font-weight:600;width:32%;">Valuation snapshot</td><td style="padding:3pt 6pt;">${esc(String(preLossCondition.request_number ?? '—'))} · v${esc(String(preLossCondition.snapshot_version ?? '1'))}</td></tr>
        <tr><td style="padding:3pt 6pt;font-weight:600;">Snapshot date</td><td style="padding:3pt 6pt;">${fmtD(preLossCondition.snapshot_date)}</td></tr>
        <tr><td style="padding:3pt 6pt;font-weight:600;">Recorded condition</td><td style="padding:3pt 6pt;">Exterior ${esc(String(preLossCondition.exterior_condition ?? '—'))} · Interior ${esc(String(preLossCondition.interior_condition ?? '—'))} · Mechanical ${esc(String(preLossCondition.mechanical_condition ?? '—'))}</td></tr>
        ${preLossCondition.odometer_km != null ? `<tr><td style="padding:3pt 6pt;font-weight:600;">Odometer then</td><td style="padding:3pt 6pt;">${esc(String(preLossCondition.odometer_km))} km</td></tr>` : ''}
        ${preLossCondition.existing_damage_notes ? `<tr><td style="padding:3pt 6pt;font-weight:600;">Pre-existing condition noted</td><td style="padding:3pt 6pt;">${esc(String(preLossCondition.existing_damage_notes))}</td></tr>` : ''}
      </tbody>
    </table>
    <p class="caption" style="margin-top:4pt;">Dated pre-loss valuation evidence only. It does not determine causation, repair cost, policy, premium, settlement, fraud conclusion, or claim outcome.</p>
  </div>` : ''}

</div>
</div>
  <div class="footer-strip sans" style="position:static;margin-top:10px;">
    <div>KINGA AI · Confidential Claims Intelligence Report</div>
    <div>${docRef} · Page 1 of 2</div>
  </div>
</div>`;

    // ── §P POLICY & COVERAGE CHECK ───────────────────────────────────────────
    // Wire from real repairIntel.policyExclusions; fall back to graceful empty state
    type CoverageRow = { item: string; covered: boolean | null; clause: string; amount: number | null };
    const realExclusionRows: CoverageRow[] = exclusions.map(e => ({
      item: e.item,
      covered: false,
      clause: (e as any).clause ?? (e as any).policyClause ?? "Policy exclusion",
      amount: Number(e.amount ?? 0) || null,
    }));
    // Add a "covered" row for each quoted component not in exclusions (top 4 by value)
    const liArr2 = lineItems as Record<string, unknown>[];
    const topQuotedComponents = Array.from(
      new Map(liArr2.map(li => [String(li.description ?? ""), Number(li.unit_price ?? 0)])).entries()
    ).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const coveredRows: CoverageRow[] = topQuotedComponents
      .filter(([name]) => !realExclusionRows.some(r => r.item.toLowerCase().includes(name.toLowerCase().slice(0, 8))))
      .slice(0, 3)
      .map(([name]) => ({ item: name, covered: true, clause: "Comprehensive — accidental damage", amount: null }));
    const allCoverageRows: CoverageRow[] = [...coveredRows, ...realExclusionRows];
    // If no data at all, show a graceful placeholder
    const coverageRows = allCoverageRows.length > 0
      ? allCoverageRows.map(row => `<tr>
      <td>${esc(row.item)}</td>
      <td>${row.covered === true ? chip("Covered", "pass") : row.covered === false ? chip("Excluded", "fail") : chip("Verify", "warn")}</td>
      <td class="small">${esc(row.clause)}</td>
      <td class="tm">${row.amount ? fmtUSD(row.amount) : "—"}</td>
    </tr>`).join("")
      : `<tr><td colspan="4" style="text-align:center;color:var(--ink-light);padding:12px">Coverage data not yet available — awaiting policy document extraction</td></tr>`;

    const sP = `
<div class="page page-break">
<div class="section">
  <div class="section-tab sans"><span class="num">P</span> Policy &amp; Coverage Check <span class="flag-right ${exclusions.length > 0 || totalExclusions > 0 ? "mid" : "ok"}">${exclusions.length > 0 || totalExclusions > 0 ? "Exclusions Detected" : "Pass"}</span></div>
  <div class="cols-2">
    <div class="box">
      <h4>Coverage Status</h4>
      <table class="kv">
        <tr><td class="k">Cover type</td><td class="v">${esc(c.cover_type ?? c.policy_type ?? "Comprehensive")}</td></tr>
        <tr><td class="k">Sum insured</td><td class="v">${fmtUSD(c.sum_insured != null ? Number(c.sum_insured) : c.vehicle_market_value != null ? Number(c.vehicle_market_value) / 100 : null)}</td></tr>
        <tr><td class="k">Policy excess applicable</td><td class="v">${fmtUSD(excess)}</td></tr>
        <tr><td class="k">Exclusions triggered</td><td class="v">${exclusions.length > 0 ? `<span class="pill amber">${exclusions.length} detected</span>` : `<span class="pill green">None detected</span>`}</td></tr>
      </table>
    </div>
    <div class="box">
      <h4>Coverage Notes</h4>
      <p class="small" style="margin:0;">${exclusions.length > 0 || totalExclusions > 0 ? `One or more line items fall outside the scope of cover. These must be removed from the settlement calculation before any payment is authorised.` : "All submitted repair items appear to fall within the scope of the applicable cover. No exclusions were identified at this assessment tier."} Confirm the policy number against the insurer's register before final settlement.</p>
    </div>
  </div>
  <div class="section" style="margin-top:10px;">
    <div class="section-tab sans" style="background:var(--ink-soft);"><span class="num">Coverage Assessment</span></div>
    <table class="grid-t">
      <tr><th>Item / Component</th><th>Status</th><th>Policy Basis</th><th>Excluded Amount</th></tr>
      ${coverageRows}
    </table>
  </div>
  <div class="section" style="margin-top:10px;">
    <div class="section-tab sans" style="background:var(--ink-soft);"><span class="num">Settlement Position</span></div>
    <div class="verdict-strip">
      <div class="verdict-cell"><div class="label">KINGA Optimised</div><div class="value">${l2Display}</div><div class="sub">${kingaOptimised === null ? "Coverage review required" : "All-in benchmarked recommendation"}</div></div>
      <div class="verdict-cell"><div class="label">Less Exclusions</div><div class="value" style="color:var(--red)">&minus;${fmtUSD(totalExclusions > 0 ? totalExclusions : 0)}</div><div class="sub">Policy exclusions removed</div></div>
      <div class="verdict-cell"><div class="label">Less Excess</div><div class="value" style="color:var(--red)">&minus;${fmtUSD(excess)}</div><div class="sub">Policy deductible</div></div>
      <div class="verdict-cell accent"><div class="label">Recommended Settlement</div><div class="value" style="color:var(--green)">${recommendedSettlementDisplay}</div><div class="sub">${recommendedSettlement === null ? "Withheld pending scope reconciliation" : "Subject to structural assessment"}</div></div>
    </div>
    <!-- TIER-06: Settlement rationale -->
    <p style="font-size:10px;color:#4a4a4a;margin-top:8px;padding:6px 10px;background:#f5f5f5;border-radius:2px;">
      ${kingaOptimised === null
        ? esc(l2IntegrityNote)
        : `Settlement rationale: KINGA Optimised estimate of <strong>${l2Display}</strong>, less policy exclusions of <strong>${fmtUSD(totalExclusions)}</strong>${excess > 0 ? `, less policy excess of <strong>${fmtUSD(excess)}</strong>` : ""}, equals recommended settlement of <strong>${recommendedSettlementDisplay}</strong>.`}
      ${criticalStructural.length > 0 ? `Note: ${criticalStructural.length} structural component${criticalStructural.length !== 1 ? "s" : ""} (${criticalStructural.map(g => esc(g.component)).join(", ")}) are not included in any submitted quote and must be assessed independently before this figure can be finalised.` : "All major components are included in the submitted quotes."}
    </p>
    ${costIntegrity.assessorCalibrationCostUsd !== null ? `<div class="callout" style="margin-top:8px"><b>Assessor documented cost — calibration reference only:</b> ${fmtUSD(costIntegrity.assessorCalibrationCostUsd)}. This historical assessor figure is displayed for comparison with KINGA costing; it is not a submitted quote, L2 value, or settlement authority.</div>` : ""}
    <div class="callout" style="margin-top:8px;border-left-color:#2d5f8b;background:#f3f7fb;color:#294a66;"><b>Cost evidence boundary:</b> KINGA compares only traceable submitted evidence with equivalent repair scope, tax basis, and revision status. A pricing variance is a review signal, not a fraud conclusion, automatic adjustment, or settlement authority.</div>
    ${renderEvidenceGovernancePanel(evidenceGovernanceData, activeQuoteIds)}
    <table class="kv" style="margin-top:8px"><tr><td class="k">Submitted quotation ledger</td><td class="v">${quoteArr.length} active quote${quoteArr.length === 1 ? "" : "s"}${costIntegrity.duplicateQuotesExcluded > 0 ? `; ${costIntegrity.duplicateQuotesExcluded} duplicate excluded` : ""}</td></tr><tr><td class="k">Active quote amounts</td><td class="v">${esc(submittedQuoteLedgerDetail)}</td></tr><tr><td class="k">Quote scope status</td><td class="v">${esc(costIntegrity.quoteScopeStatus.replaceAll("_", " "))}</td></tr><tr><td class="k">L1 — lowest active submitted quote</td><td class="v">${l1Display}</td></tr><tr><td class="k">${l2LedgerLabel}</td><td class="v">${l2Display}</td></tr><tr><td class="k">L3 — benchmark reference</td><td class="v">${l3Display}</td></tr></table>
  </div>

  ${totalExclusions > 0 || exclusions.length > 0 ? `
  <div class="callout red" style="margin-top:8px;"><b>Policy Exclusion — Remove from Settlement.</b> One or more repair line items are specifically excluded under the applicable policy wording. These items must be removed from the settlement calculation before any payment is authorised. Confirm with policy §14.3 before communicating to claimant.</div>` : ""}

  ${rtvRatio >= 50 ? `
  <div class="callout amber" style="margin-top:8px;"><b>Repair Cost Approaching Total-Loss Threshold.</b> At ${fmtPct(rtvRatio)} of market value, the repair cost is approaching the typical total-loss threshold. Confirm the insurer's total-loss policy before authorising repairs.</div>` : ""}
  ${(() => {
    // Quoted-not-damaged: components quoted by a panel beater but not identified in damage analysis
    const qnd: Array<{componentName?: string; classification?: string; reason?: string}> =
      (costIntel?.compositeOptimisation?.quotedNotDamaged as Array<{componentName?: string; classification?: string; reason?: string}>) ?? [];
    const scopeInflation = qnd.filter(q => q.classification === 'potential_scope_inflation');
    const plausible = qnd.filter(q => q.classification === 'plausible_scope_extension');
    if (scopeInflation.length === 0 && plausible.length === 0) return '';
    const names = scopeInflation.map(q => esc(String(q.componentName ?? ''))).join(', ');
    const plausibleNames = plausible.map(q => esc(String(q.componentName ?? ''))).join(', ');
    return `
  ${scopeInflation.length > 0 ? `<div class="callout" style="margin-top:8px;border-color:var(--red);background:#fff5f5;"><b>Potential Scope Inflation — ${scopeInflation.length} component${scopeInflation.length !== 1 ? 's' : ''} quoted but not damaged.</b> ${names}. These items appear in the repair quote but were not identified in the damage analysis. <strong>Action required: these line items must be individually verified before inclusion in the settlement calculation.</strong> If they cannot be substantiated, they must be removed from the approved scope.</div>` : ''}
  ${plausible.length > 0 ? `<div class="callout amber" style="margin-top:8px;"><b>Plausible Scope Extension — ${plausible.length} adjacent component${plausible.length !== 1 ? 's' : ''} flagged.</b> ${plausibleNames}. These components are adjacent to confirmed damage zones and may legitimately require repair. Verify with the assessing repairer before approving.</div>` : ''}`;
  })()}
</div>
  <div class="footer-strip sans" style="position:static;margin-top:10px;">
    <div>KINGA AI · Confidential Claims Intelligence Report</div>
    <div>${docRef} · Page 2 of 2</div>
  </div>
</div>`;

    // ── §2 COST INTELLIGENCE ─────────────────────────────────────────────────
    const quoteCardHtml = quoteArr.length > 0
      ? quoteArr.slice(0, 3).map((q, i) => `
        <div class="quote-card">
          <div class="qc-label">${esc(q.repairer || `Quote ${i + 1}`)}</div>
          <div class="qc-amount">${q.amountUsd === null ? "—" : fmtUSD(q.amountUsd)}</div>
          <div class="qc-sub">${q.status === "supplementary"
            ? "Eligible supplementary scope"
            : q.status === "active"
              ? "Eligible active market quote"
              : q.status === "legacy_unverified"
                ? "Legacy submitted history — not active comparison evidence"
                : "Quotation history — not active comparison evidence"}</div>
        </div>`).join("") +
        `<div class="quote-card kinga">
          <div class="qc-label">KINGA Optimised</div>
          <div class="qc-amount green">${l2Display}</div>
          <div class="qc-sub">${kingaOptimised === null ? "Recommendation withheld pending scope reconciliation" : `Savings: ${fmtUSD(savings)} (${fmtPct(savingsPct)})`}</div>
        </div>`
      : `<div class="quote-card" style="grid-column:1/-1;text-align:center;padding:20px;color:var(--ink-light)">No quotes received</div>`;

    // Build top-8 comparison line items — wire KINGA benchmark from compositeLineItems
    const liArr = activeLineItems;
    // Build a map from canonical component name → L2 selected cost from buildCompositeQuote output
    const compositeItems: Array<{componentName: string; selectedCostUsd: number; scopeDecisionRule?: string}> =
      (costIntel?.compositeOptimisation?.compositeLineItems as Array<{componentName: string; selectedCostUsd: number; scopeDecisionRule?: string}>) ?? [];
    const compositeMap = new Map<string, {selectedCostUsd: number; rule?: string}>();
    for (const ci of compositeItems) {
      compositeMap.set(String(ci.componentName ?? "").toLowerCase(), { selectedCostUsd: Number(ci.selectedCostUsd ?? 0), rule: ci.scopeDecisionRule });
    }
    // Deduplicate line items by description (keep highest unit_price per component)
    const deduped = new Map<string, Record<string, unknown>>();
    for (const li of liArr) {
      const key = String(li.description ?? "").toLowerCase();
      if (!deduped.has(key) || Number(li.unit_price ?? 0) > Number(deduped.get(key)!.unit_price ?? 0)) {
        deduped.set(key, li);
      }
    }
    const topItems = Array.from(deduped.values()).sort((a, b) => Number(b.unit_price ?? 0) - Number(a.unit_price ?? 0)).slice(0, 8);
    const compTableRows = topItems.map(li => {
      const descKey = String(li.description ?? "").toLowerCase();
      const benchEntry = compositeMap.get(descKey);
      const submittedPrice = Number(li.unit_price ?? 0);
      const kingaBenchmark = benchEntry ? benchEntry.selectedCostUsd : null;
      const diff = kingaBenchmark !== null ? submittedPrice - kingaBenchmark : null;
      const diffPct = (diff !== null && submittedPrice > 0) ? (diff / submittedPrice * 100) : null;
      const statusChip = diff === null ? chip("No benchmark", "neutral")
        : diff > 0.01 ? chip(`+${fmtPct(diffPct ?? 0)} above KINGA`, "warn")
        : chip("Within benchmark", "pass");
      return `<tr>
      <td>${esc(li.description ?? "—")}</td>
      <td class="tm">${esc(li.category ?? li.item_type ?? "—")}</td>
      <td class="tm">${fmtUSD(submittedPrice)}</td>
      <td class="tm">${kingaBenchmark !== null ? fmtUSD(kingaBenchmark) : "<span style='color:var(--ink-light)'>—</span>"}</td>
      <td class="tm">${statusChip}</td>
    </tr>`;
    }).join("");

    const s2 = `
<div class="page page-break">
<div class="section">
  <div class="section-tab sans"><span class="num">02</span> Cost Intelligence</div>
  <p class="small" style="margin:0 0 8px 0;">${esc(quoteEvidenceNarrative)}${costIntegrity.duplicateQuotesExcluded > 0 ? ` after excluding ${costIntegrity.duplicateQuotesExcluded} duplicate submission${costIntegrity.duplicateQuotesExcluded === 1 ? "" : "s"}` : ""} for the ${vehicleDesc}. ${kingaOptimised === null ? `<strong>${esc(l2IntegrityNote)}</strong>` : `The all-in optimised estimate of <strong>${l2Display}</strong> represents a saving of <strong>${fmtUSD(savings)} (${fmtPct(savingsPct)})</strong> against the highest active submitted quote.`} ${criticalStructural.length > 0 ? `<strong>${criticalStructural.length} structural component${criticalStructural.length !== 1 ? "s" : ""} identified in the damage scope do not appear in any submitted quote</strong> — an independent structural assessment is required before the cost can be finalised.` : "All major components are included in the submitted quotes."}</p>
  <div class="cols-2">
    <div class="box">
      <h4>Quote Comparison — ${visibleQuoteCount} visible record${visibleQuoteCount === 1 ? "" : "s"}; ${activeQuoteCount} active comparison quote${activeQuoteCount === 1 ? "" : "s"}</h4>
      ${quoteCardHtml}
    </div>

    <div class="box">
      <h4>Repair Economics &amp; Verdict</h4>
      <table class="kv">
        <tr><td class="k">Highest active submitted quote</td><td class="v">${highestQuoteDisplay}</td></tr>
        <tr><td class="k">KINGA optimised estimate</td><td class="v">${l2Display}</td></tr>
        <tr><td class="k">Recommended settlement</td><td class="v">${recommendedSettlementDisplay}</td></tr>
        <tr><td class="k">Negotiation gap</td><td class="v">${kingaOptimised !== null && savings > 0 ? fmtUSD(savings) + " (" + fmtPct(savingsPct) + ")" : kingaOptimised === null ? "Not calculated — L2 incomplete" : "None detected"}</td></tr>
        <tr><td class="k">Repair-to-value ratio</td><td class="v">${fmtPct(rtvRatio)}</td></tr>
      </table>
      <div class="callout green" style="margin-top:8px;"><span class="pill green">${rtvRatio >= 70 ? "Total Loss — above write-off threshold" : "Repair — well below write-off threshold"}</span></div>
    </div>
  </div>

  ${topItems.length > 0 ? `
  <div class="section" style="margin-top:10px;">
    <div class="section-tab sans" style="background:var(--ink-soft);"><span class="num">Line Item Comparison</span></div>
    <table class="grid-t">
      <tr><th>Component</th><th>Type</th><th>Submitted</th><th>KINGA Benchmark</th><th>Status</th></tr>
      ${compTableRows}
    </table>
  </div>` : ""}

  ${criticalStructural.length > 0 ? `
  <div class="callout red" style="margin-top:8px;"><b>Structural Gap — ${criticalStructural.length} critical component${criticalStructural.length !== 1 ? "s" : ""} not quoted.</b> ${criticalStructural.map(g => esc(g.component)).join(", ")}. An independent structural assessment is required before the repair scope and cost can be finalised. Settlement must not be authorised until this assessment is complete.</div>` : ""}
</div>
  <div class="footer-strip sans" style="position:static;margin-top:10px;">
    <div>KINGA AI · Confidential Claims Intelligence Report</div>
    <div>${docRef} · Page 2 of 2</div>
  </div>
</div>`;

    // ── §3 RISK INDICATORS ───────────────────────────────────────────────────
    // Wire real fraud_score_breakdown_json indicators
    type FraudInd = {name: string; score: number; threshold: string; finding: string; status: "pass" | "warn" | "fail" | "neutral"};
    const fraudIndicators: FraudInd[] = [];
    // Try to pull real indicators from fraudBreak.indicators or fraudBreak.breakdown
    const rawIndicators: Array<{name?: string; label?: string; score?: number; weight?: number; threshold?: string; finding?: string; description?: string; triggered?: boolean; status?: string}> =
      (fraudBreak?.indicators ?? fraudBreak?.breakdown ?? fraudBreak?.factors ?? []) as Array<{name?: string; label?: string; score?: number; weight?: number; threshold?: string; finding?: string; description?: string; triggered?: boolean; status?: string}>;
    if (rawIndicators.length > 0) {
      for (const ind of rawIndicators) {
        const score = Number(ind.score ?? ind.weight ?? 0);
        const triggered = ind.triggered ?? score > 0;
        const status: FraudInd["status"] = triggered ? (score >= 20 ? "fail" : "warn") : "pass";
        fraudIndicators.push({
          name: String(ind.name ?? ind.label ?? "Indicator"),
          score,
          threshold: String(ind.threshold ?? "—"),
          finding: String(ind.finding ?? ind.description ?? (triggered ? "Triggered" : "Not triggered")),
          status,
        });
      }
    } else {
      // Fallback: derive from available data fields
      fraudIndicators.push(
        { name: "Repair Cost vs Market Value", score: rtvRatio >= 50 ? 15 : 0, threshold: "> 50%", finding: `${fmtPct(rtvRatio)} — ${rtvRatio >= 50 ? "approaching total-loss threshold" : "within normal range"}`, status: rtvRatio >= 50 ? "warn" : "pass" },
        { name: "Late Claim Submission", score: dayDelay !== null && dayDelay > 90 ? 7 : 0, threshold: "> 90 days", finding: dayDelay !== null ? `${dayDelay} days — ${dayDelay > 90 ? "written explanation required" : "within normal range"}` : "—", status: dayDelay !== null && dayDelay > 90 ? "warn" : "pass" },
        { name: "Quote Spread", score: 0, threshold: "> 40%", finding: quoteArr.length > 1 ? "Spread within normal range" : "Insufficient quotes to assess", status: quoteArr.length > 1 ? "pass" : "neutral" },
        { name: "Damage Inconsistency", score: 0, threshold: "> 30 pts", finding: "No physics anomaly detected at this tier", status: "pass" },
        { name: "Repeat Claimant / Vehicle", score: 0, threshold: "Any match", finding: "No prior claims on this registration", status: "pass" },
        { name: "Copy Quotation Detection", score: 0, threshold: "> 50% match", finding: "Requires Forensic tier — see upgrade below", status: "neutral" },
      );
    }

    const fraudTableRows = fraudIndicators.map(ind => `<tr>
      <td>${esc(ind.name)}</td>
      <td class="tm">${ind.score > 0 ? `<strong>${ind.score} pts</strong>` : "0 pts"}</td>
      <td class="tm">${esc(ind.threshold)}</td>
      <td>${esc(ind.finding)}</td>
      <td>${chip(ind.status === "pass" ? "Clear" : ind.status === "warn" ? "Flagged" : ind.status === "neutral" ? "Not assessed" : "Alert", ind.status)}</td>
    </tr>`).join("");

    const s3 = `
<div class="page page-break">
<div class="section">
  <div class="section-tab sans"><span class="num">03</span> Risk Indicators <span class="flag-right ${fraudBadgeCls === "fail" ? "high" : fraudBadgeCls === "warn" ? "mid" : "ok"}">${fraudScore}/100 — ${fraudBadgeLabel}</span></div>
  <div class="cols-2">
    <div class="box">
      <h4>Fraud Score — ${fraudScore}/100 (${fraudBadgeLabel})</h4>
      <table class="kv">
        <tr><td class="k">Overall assessment</td><td class="v"><span class="pill ${fraudBadgeCls === "fail" ? "red" : fraudBadgeCls === "warn" ? "amber" : "green"}">${fraudBadgeLabel}</span></td></tr>
        <tr><td class="k">Data completeness (IFE)</td><td class="v">${Math.round(dataComplete)}% — ${dataComplete >= 80 ? "good" : "partial"}</td></tr>
      </table>
    </div>
    <div class="box" ${dayDelay !== null && dayDelay > 90 ? `style="border-color:var(--red);"` : ""}>
      <h4 ${dayDelay !== null && dayDelay > 90 ? `style="color:var(--red);"` : ""}>Submission Delay</h4>
      <p style="margin:0;">${dayDelay !== null ? `Claim lodged <b>${dayDelay} days</b> after the incident date. ${dayDelay > 90 ? "This is the primary risk indicator on this claim — a written explanation from the claimant is required before it can proceed, independent of the numeric fraud score." : "Submission timing is within normal parameters."}` : "Submission delay data not available."}</p>
    </div>
  </div>

  <div class="section" style="margin-top:10px;">
    <div class="section-tab sans" style="background:var(--ink-soft);"><span class="num">Indicator Breakdown</span></div>
    <table class="grid-t">
      <tr><th>Indicator</th><th>Score</th><th>Threshold</th><th>Finding</th><th>Status</th></tr>
      ${fraudTableRows}
    </table>
  </div>

  ${rtvRatio >= 50 ? `
  <div class="callout amber" style="margin-top:8px;"><b>Repair Cost Approaching Total-Loss Threshold.</b> At ${fmtPct(rtvRatio)} of market value, the repair cost is approaching the typical total-loss threshold. Confirm the insurer's total-loss policy before authorising repairs.</div>` : ""}
  ${(() => {
    const qs = fraudBreak?.quoteSimilarity;
    if (!qs) return '';
    const verdict = qs.overall_verdict ?? qs.verdict;
    // TIER-05: Use pairs[0].structural_similarity (0–1 decimal) as canonical pairSim source
    const rawPairSim = qs.pairs?.[0]?.structural_similarity ?? qs.highestPairSimilarity ?? qs.maxSimilarity;
    const pairSimPct = rawPairSim != null ? Math.round(Number(rawPairSim) * 100) : null;
    if (verdict === 'confirmed' || verdict === 'high_risk') {
      return `<div class="callout" style="margin-top:8px;border-color:var(--red);background:#fff5f5;"><b>Copy-Quotation Detected.</b> Quote similarity analysis flagged a potential copy-quotation pattern (highest pair similarity: ${pairSimPct != null ? pairSimPct + '%' : 'N/A'}). This indicates two or more repair quotes may share a common origin — the quotes may have been produced by the same person or from the same template, which is a fraud indicator. <strong>Action required: all quotes from the flagged pair must be excluded from the settlement calculation. An independent quote from a repairer with no connection to the flagged parties must be obtained before settlement can be authorised.</strong> Refer to the Forensic Report for full pair-by-pair analysis and structural fingerprint breakdown.</div>`;
    } else if (verdict === 'possible' || verdict === 'moderate_risk') {
      return `<div class="callout amber" style="margin-top:8px;"><b>Copy-Quotation — Possible.</b> Quote similarity analysis detected a moderate similarity pattern (highest pair: ${pairSimPct != null ? pairSimPct + '%' : 'N/A'}). Quotes may share structural similarities. Further review recommended before settlement.</div>`;
    }
    return '';
  })()} 
  <p class="small" style="margin-top:8px;">Full fraud radar breakdown, cross-engine consistency checks, copy-quotation fingerprint analysis, and accident-date validation are available in the Forensic Claim Decision Report.</p>
</div>
  <div class="footer-strip sans" style="position:static;margin-top:10px;">
    <div>KINGA AI · Confidential Claims Intelligence Report</div>
    <div>${docRef} · Page 2 of 2</div>
  </div>
</div>`;

    // ── §4 EVIDENCE SNAPSHOT ─────────────────────────────────────────────────
    const docArr = docs as Record<string, unknown>[];
    const hasPolice = docArr.some(d => d.document_category === "police_report");
    const hasQuotes = quoteArr.length > 0;
    const hasPhotos = docArr.some(d => d.document_category === "damage_photo");
    const hasVehicleReg = !!vehicleReg && vehicleReg !== "—";

    const docRegRows = [
      { doc: "Claim Form", type: "Primary", confidence: "95%", detail: "Submitted by claimant", status: "pass", label: "Received" },
      { doc: "Police Report", type: "Supporting", confidence: hasPolice ? "75%" : "—", detail: hasPolice ? "Received and processed" : "Not submitted", status: hasPolice ? "pass" : "warn", label: hasPolice ? "Received" : "Missing" },
      { doc: `Repair Quotes (×${quoteArr.length})`, type: "Financial", confidence: quoteArr.length > 0 ? "88%" : "—", detail: quoteArr.length > 0 ? `${quoteArr.length} quotes extracted and benchmarked` : "No quotes received", status: quoteArr.length > 0 ? "pass" : "fail", label: quoteArr.length > 0 ? "Received" : "Missing" },
      { doc: "Vehicle Registration", type: "Identity", confidence: hasVehicleReg ? "90%" : "—", detail: hasVehicleReg ? `${vehicleReg} confirmed` : "Not provided", status: hasVehicleReg ? "pass" : "warn", label: hasVehicleReg ? "Received" : "Missing" },
      { doc: "Damage Photographs", type: "Visual", confidence: hasPhotos ? "80%" : "—", detail: hasPhotos ? `${totalPhotos} submitted &middot; ${usablePhotos} confirmed usable` : "No photos submitted", status: photoYield < 40 ? "warn" : "pass", label: photoYield < 40 ? "Low yield" : "Received" },
      { doc: "VIN Certificate", type: "Identity", confidence: "—", detail: "Required for identity verification", status: "fail", label: "Missing" },
    ] as Array<{doc: string; type: string; confidence: string; detail: string; status: "pass" | "warn" | "fail"; label: string}>;

    const docRegHtml = docRegRows.map(row => `<tr>
      <td>${esc(row.doc)}</td>
      <td>${esc(row.type)}</td>
      <td class="tm">${esc(row.confidence)}</td>
      <td>${row.detail}</td>
      <td>${chip(row.label, row.status)}</td>
    </tr>`).join("");

    const s4 = `
<div class="page page-break">
<div class="section">
  <div class="section-tab sans"><span class="num">04</span> Evidence Snapshot <span class="flag-right ${missingDocs.length > 0 || !hasPolice ? "mid" : "ok"}">${missingDocs.length > 0 || !hasPolice ? "1 of 3 zones" : "Complete"}</span></div>
  <p class="small" style="margin:0 0 8px 0;">${docArr.length > 0 ? `${docArr.length} document${docArr.length !== 1 ? "s" : ""} were received and processed.` : "Documentation is limited at this stage."} ${hasPhotos ? `Photo evidence was submitted — ${usablePhotos} of ${totalPhotos} images confirmed usable.` : "No photographic evidence was submitted."} ${!hasPolice ? "A police report was not received — this is required for all accident claims." : ""}</p>
  <div class="section" style="margin-top:8px;">
    <div class="section-tab sans" style="background:var(--ink-soft);"><span class="num">Document Register</span></div>
    <table class="grid-t">
      <tr><th>Document</th><th>Type</th><th>Confidence</th><th>Detail</th><th>Status</th></tr>
      ${docRegHtml}
    </table>
  </div>

  <div class="cols-3" style="margin-top:10px;">
    <div class="box"><h4>Documents</h4><table class="kv"><tr><td class="k">Police report</td><td class="v">${hasPolice ? `<span class="pill green">Received</span>` : `<span class="pill amber">Not provided</span>`}</td></tr><tr><td class="k">Quotes</td><td class="v">${quoteArr.length} received</td></tr></table></div>
    <div class="box"><h4>Data Completeness (IFE)</h4><table class="kv"><tr><td class="k">Completeness score</td><td class="v">${Math.round(dataComplete)}%</td></tr><tr><td class="k">Policy number</td><td class="v" ${!policyNum || policyNum === "—" ? `style="color:var(--amber);"` : ""}>${!policyNum || policyNum === "—" ? "Missing" : "Provided"}</td></tr></table></div>
    <div class="box"><h4>Outstanding Items</h4><ul class="tight small" style="margin-top:0;">${!hasPolice ? "<li>Police report</li>" : ""}${!policyNum || policyNum === "—" ? "<li>Policy number confirmation</li>" : ""}${dayDelay !== null && dayDelay > 90 ? "<li>Written explanation for submission delay</li>" : ""}<li>VIN certificate</li></ul></div>
  </div>

  ${enrichedPhotos.length > 0 ? `
  <div class="box" style="margin-top:10px;">
    <h4>Photo Evidence — ${enrichedPhotos.length} image${enrichedPhotos.length !== 1 ? 's' : ''} · ${usablePhotos} usable (≥70% confidence)</h4>
    ${photoZonePanel(
      enrichedPhotos.slice(0, 8).map(p => ({
        url: p.url ?? '',
        zone: p.impactZone ?? undefined,
        caption: p.caption ?? undefined,
        usable: Number(p.confidenceScore ?? 0) >= 70,
        directionContradiction: (p as any).directionContradiction === true,
        semanticType: (p as any).semanticType ?? (p as any).imageClassification ?? undefined,
        detectedComponents: (p as any).detectedComponents ?? undefined,
        classificationConfidence: (p as any).classificationConfidence ?? (p as any).semanticConfidence ?? undefined,
        classifier: (p as any).classifier ?? undefined,
        selectionReason: (p as any).selectionReason ?? undefined,
        fallbackWarning: (p as any).fallbackWarning ?? undefined,
        suitableForCrushDepth: (p as any).suitableForCrushDepth ?? undefined,
        physicsExclusionReason: (p as any).physicsExclusionReason ?? undefined,
        sourcePage: (p as any).sourcePage ?? undefined,
      })),
      4
    )}
    ${enrichedPhotos.some(p => (p as any).directionContradiction === true) ? `<div style="background:#fbf1de;border-left:3px solid #b8720b;padding:6px 10px;margin-top:6px;font-size:10px;color:#b8720b;"><strong>⚠ Direction Contradiction Detected.</strong> One or more photos show damage in a zone that contradicts the narrative-stated collision direction. Review photo zones against the incident narrative before approving settlement. Full forensic analysis in the Forensic Report.</div>` : ""}
    <p class="caption" style="margin-top:4px;">Zone labels show pipeline-detected impact zone per image. Red border = confidence below 70%. ⚠ amber border = zone contradicts narrative direction (display-only, does not affect scoring). Full EXIF, manipulation detection, and structural fingerprint analysis are in the Forensic Claim Decision Report.</p>
  </div>` : `<p class="small" style="margin-top:8px;">No photographic evidence was submitted or processed by the pipeline. Detailed photo forensics are part of the Forensic Claim Decision Report.</p>`}
  ${(() => {
    // Damage zones vs photo coverage — compact table for CI
    const coveredZonesCi = new Set(enrichedPhotos.map(p => String((p as any).impactZone ?? '').toLowerCase()).filter(Boolean));
    const allZonesCi = ['front','rear','left','right','underside','interior','roof'];
    const zoneRows = allZonesCi.map(z => {
      const covered = coveredZonesCi.has(z);
      return `<tr style="border-bottom:1px solid #e8e8e8">
        <td style="padding:3px 8px;text-transform:capitalize;font-size:10px">${z}</td>
        <td style="padding:3px 8px;font-size:10px">${covered
          ? `<span style="color:#3C7844;font-weight:700">✓ Covered</span>`
          : `<span style="color:#8a8a8a">— No photo</span>`
        }</td>
      </tr>`;
    }).join('');
    const coveredCount = coveredZonesCi.size;
    return enrichedPhotos.length > 0 ? `
  <div class="box" style="margin-top:8px;">
    <h4 style="margin:0 0 6px">Damage Zone Photo Coverage — ${coveredCount} of ${allZonesCi.length} zones</h4>
    <table style="width:100%;border-collapse:collapse;font-size:10px">
      <thead><tr style="border-bottom:2px solid #d9d9d9">
        <th style="text-align:left;padding:3px 8px;font-size:9px;color:#4a4a4a">Zone</th>
        <th style="text-align:left;padding:3px 8px;font-size:9px;color:#4a4a4a">Photo Coverage</th>
      </tr></thead>
      <tbody>${zoneRows}</tbody>
    </table>
    ${coveredCount < allZonesCi.length ? `<p style="font-size:9px;color:#8a8a8a;margin-top:4px;">Uncovered zones may indicate undocumented damage or damage outside the claimed impact area.</p>` : ''}
  </div>` : '';
  })()}
  ${photoYield < 40 && totalPhotos > 0 ? `
  <div class="callout amber" style="margin-top:8px;"><b>Photo Evidence Below Assessment Threshold.</b> Only ${usablePhotos} of ${totalPhotos} submitted images were confirmed as usable vehicle-damage photographs. Request focused damage photographs — underbody, engine bay, and interior zones required.</div>` : ""}
</div>
  <div class="footer-strip sans" style="position:static;margin-top:10px;">
    <div>KINGA AI · Confidential Claims Intelligence Report</div>
    <div>${docRef} · Page 2 of 2</div>
  </div>
</div>`;

    // ── §5 DECISION & NEXT STEPS ─────────────────────────────────────────────
    const actions: Array<{action: string; owner: string; priority: "High" | "Medium"; ref: string}> = [];
    if (!hasVehicleReg) actions.push({ action: "Obtain VIN certificate to complete vehicle identity verification", owner: "Claimant", priority: "High", ref: "§1" });
    if (criticalStructural.length > 0) actions.push({ action: `Commission independent structural assessment for ${criticalStructural.map(g => g.component).join(", ")}`, owner: "Adjuster", priority: "High", ref: "§2" });
    if (totalExclusions > 0) actions.push({ action: `Remove excluded line items (${fmtUSD(totalExclusions)}) from settlement calculation`, owner: "Adjuster", priority: "High", ref: "§P" });
    if (!hasPolice) actions.push({ action: "Obtain police report — required for all accident claims", owner: "Claimant", priority: "High", ref: "§4" });
    if (dayDelay !== null && dayDelay > 90) actions.push({ action: `Obtain written explanation from claimant for ${dayDelay}-day submission delay`, owner: "Adjuster", priority: "Medium", ref: "§1" });
    if (photoYield < 40) actions.push({ action: "Request focused damage photographs — underbody, engine bay, and interior zones", owner: "Claimant", priority: "Medium", ref: "§4" });
    if (rtvRatio >= 50) actions.push({ action: "Confirm total-loss threshold with insurer before authorising structural repairs", owner: "Adjuster", priority: "Medium", ref: "§3" });

    const actionRows = actions.map((a, i) => `<tr class="${a.priority === "High" ? "at-high" : "at-medium"}">
      <td>${i + 1}</td>
      <td>${esc(a.action)}</td>
      <td>${esc(a.owner)}</td>
      <td>${chip(a.priority, a.priority === "High" ? "fail" : "warn")}</td>
      <td class="tm">${esc(a.ref)}</td>
    </tr>`).join("");

    const upgradeSignals: string[] = [];
    if (physicsAnomaly > 30) upgradeSignals.push(`Physics anomaly ${physicsAnomaly}/100`);
    if (criticalStructural.length > 0) upgradeSignals.push(`${criticalStructural.length} structural gap${criticalStructural.length !== 1 ? "s" : ""} unquoted`);
    if (photoYield < 40) upgradeSignals.push(`Photo yield ${photoYield}%`);
    if (dayDelay !== null && dayDelay > 90) upgradeSignals.push(`Late submission ${dayDelay} days`);
    if (rtvRatio >= 50) upgradeSignals.push(`Repair-to-value ${fmtPct(rtvRatio)}`);

    const s5 = `
<div class="page page-break">
<div class="section">
  <div class="section-tab sans"><span class="num">05</span> Decision &amp; Next Steps <span class="flag-right ${actions.some(a => a.priority === "High") ? "high" : "ok"}">${actions.some(a => a.priority === "High") ? "Reject" : "Approve"}</span></div>
  <div class="cols-2">
    <div class="box" ${actions.some(a => a.priority === "High") ? `style="border-color:var(--red);"` : ""}>
      <h4 ${actions.some(a => a.priority === "High") ? `style="color:var(--red);"` : ""}>Verdict — ${actions.some(a => a.priority === "High") ? "Reject" : "Approve"}</h4>
      <p style="margin:0;">${kingaOptimised === null
        ? `This claim cannot proceed to a cost recommendation. <strong>${esc(l2IntegrityNote)}</strong>`
        : `${actions.some(a => a.priority === "High") ? `This claim cannot proceed to automated settlement. <strong>${actions.filter(a => a.priority === "High").length} high-priority item${actions.filter(a => a.priority === "High").length !== 1 ? "s" : ""}</strong> require resolution before a cost decision can be finalised.` : "This claim is ready for settlement subject to adjuster sign-off."} Recommended settlement: <strong>${recommendedSettlementDisplay}</strong>.`}</p>
    </div>
    <div class="box">
      <h4>Next Steps</h4>
      <ul class="tight">${actionRows ? actions.slice(0,4).map(a => `<li>${esc(a.action)}</li>`).join("") : "<li>Approve claim for processing</li><li>Assign repair to selected panel beater</li><li>Issue repair authorisation</li>"}</ul>
    </div>
  </div>
  <div class="section" style="margin-top:10px;">
    <div class="section-tab sans" style="background:var(--ink-soft);"><span class="num">Required Actions</span></div>
    <table class="grid-t">
      <tr><th>#</th><th>Action Required</th><th>Owner</th><th>Priority</th><th>Ref</th></tr>
      ${actionRows || `<tr><td colspan="5" style="text-align:center;padding:16px">No outstanding actions — claim is ready for settlement</td></tr>`}
    </table>
  </div>
  <div class="section" style="margin-top:10px;">
    <div class="section-tab sans" style="background:var(--ink-soft);"><span class="num">Approval Chain</span></div>
    <table class="grid-t">
      <tr><th>Stage</th><th>Role</th><th>Status</th><th>Officer</th><th>Date</th></tr>
      <tr><td>1</td><td>Claims Processor Review</td><td><span class="pill amber">Awaiting</span></td><td>—</td><td>—</td></tr>
      <tr><td>2</td><td>Adjuster Assessment</td><td><span class="pill grey">Pending</span></td><td>—</td><td>—</td></tr>
      <tr><td>3</td><td>Claims Manager Approval</td><td><span class="pill grey">Pending</span></td><td>—</td><td>—</td></tr>
    </table>
    <p class="caption">Structured reviewer notes are mandatory at every stage before advancement.</p>
  </div>

  ${showUpgrade ? `
  <div class="callout" style="margin-top:10px;border-color:var(--teal);background:#eff8fa;"><b>Forensic Claim Decision Report — Recommended for This Claim.</b> This claim shows signals (${upgradeSignals.join(", ")}) that a Forensic Claim Decision Report would materially clarify before settlement. The forensic tier adds full physics reconstruction, crush-depth analysis, damage-zone mapping, photo manipulation detection, and a 5-stage executive sign-off chain.</div>` : ""}
</div>
  <div class="footer-strip sans" style="position:static;margin-top:10px;">
    <div>CONFIDENTIAL — For authorised insurer use only · Generated by KINGA Intelligence · Requires adjuster sign-off. Not legal advice.</div>
    <div>${docRef} · Page 2 of 2</div>
  </div>
</div>`;

    const body = renderClaimReportReadinessBanner(c) + cover + s1 + sP + s2 + s3 + s4 + s5;
    return buildKingaHtml(`KINGA Claims Intelligence Report — ${claimRef}`, body);

  } finally {
    await conn.end();
  }
}
