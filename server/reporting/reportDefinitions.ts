/**
 * KINGA Report Definition Registry
 *
 * All report types, their metadata, access roles, and HTML generation functions.
 * Palette: black / white / grey only. Colour permitted in charts only.
 * Logo: top-right corner via base template.
 *
 * COLUMN MAPPING (verified against live DB 2026-05-04):
 *   c.psm_status            → c.status
 *   a.overall_fraud_score   → a.fraud_score
 *   a.final_recommendation  → a.recommendation
 *   a.total_claimed_amount  → a.estimated_cost  (AI estimate, not a claimed field)
 *   a.ai_recommended_settlement → a.estimated_cost
 *   a.true_cost_estimate    → a.estimated_cost
 *   a.claim_quality_score   → c.confidence_score
 *   a.narrative_analysis    → a.narrative_analysis_json
 *   a.decision_authority    → a.decision_authority_json
 *   a.pipeline_version      → a.model_version
 *   a.fraud_analysis        → a.fraud_score_breakdown_json
 *   a.forensic_audit_validation → a.forensic_audit_validation_json
 *   a.input_fidelity_result → a.ife_result_json
 *   a.cost_intelligence     → a.cost_intelligence_json
 *   a.repair_intelligence   → a.repair_intelligence_json
 *   a.vehicle_valuation     → c.vehicle_market_value
 *   a.repair_vs_replace_recommendation → derived from a.total_loss_indicated + a.repair_to_value_ratio
 *   c.vehicle_description   → CONCAT(c.vehicle_make,' ',c.vehicle_model,' ',c.vehicle_year)
 *   c.date_of_loss          → c.incident_date
 *   c.policyholder_name     → c.lodger_name
 *   c.policyholder_id       → c.claimant_id
 *   c.claim_type            → c.incident_type
 *   a.triggered_by_admin    → a.triggered_role
 */

import mysql from "mysql2/promise";
import {
  buildBaseHtml, escHtml, fmtCurrency, fmtDate, fmtDateTime, fmtPct,
  scoreBar, riskBadge, ReportMeta,
} from "./templates/base";
import { generateClaimsIntelligenceReport } from "./claimsIntelligenceReport";
import { generateForensicDecisionReport } from "./forensicDecisionReport";
import {
  buildKingaHtml, esc, fmtUSD, fmtD, fmtPct as kFmtPct,
  chip, pill, callout, scoreCell, physicsIndicator, safeJson,
} from "./templates/kingaDesignSystem";

const DB_URL = process.env.DATABASE_URL!;
async function getConn() { return mysql.createConnection(DB_URL); }

// ─── Report Role Access Map ───────────────────────────────────────────────────
// Each report key maps to the EXACT set of roles that may access it.
// insurerRole values (stored in users.insurer_role DB column):
//   claims_processor   — front-line claim handler
//   assessor_internal  — in-house damage assessor
//   assessor_external  — third-party assessor
//   risk_manager       — fraud & risk oversight
//   claims_manager     — head of claims dept (same depth as risk_manager)
//   executive          — C-suite / board KPI consumer
//   insurer_admin      — insurer-level administrator (broadest insurer access)
// Top-level role values (users.role):
//   admin              — platform super-admin (cross-insurer only)
//   assessor           — external assessor account
//   panel_beater       — repair shop account
// NOTE: "admin" (platform) is NOT in insurer report lists — handled separately
//       in canAccessReport() in reporting.ts.
export const REPORT_ACCESS: Record<string, string[]> = {

  // ── Individual Claim Reports ──────────────────────────────────────────────
  // Claims Processor: core working documents for every claim they handle
  // Assessors: need the assessment report to see their own work
  // Claims Manager: full individual-claim visibility
  "claim.assessment":           ["insurer_admin", "claims_processor", "assessor_internal", "assessor_external", "claims_manager"],
  "claim.cost_comparison":      ["insurer_admin", "claims_processor", "claims_manager"],
  "claim.repair_decision":      ["insurer_admin", "claims_processor", "claims_manager"],
  // Forensic: processor needs it for investigation; manager & risk for oversight
  "claim.forensic":             ["insurer_admin", "claims_processor", "claims_manager", "risk_manager"],
  // Claims Intelligence Report (Process tier) — standard automated assessment
  "claim.intelligence":         ["insurer_admin", "claims_processor", "assessor_internal", "assessor_external", "claims_manager", "risk_manager"],
  // Audit trail: processor accountability + manager/risk oversight
  "claim.audit_trail":          ["insurer_admin", "claims_processor", "claims_manager", "risk_manager"],

  // ── Portfolio / Statistical Reports ──────────────────────────────────────
  // Claims Manager & Risk Manager share portfolio-level depth
  "portfolio.claims_summary":          ["insurer_admin", "claims_manager", "risk_manager", "executive"],
  "portfolio.dwell_time":              ["insurer_admin", "claims_manager", "risk_manager"],
  "portfolio.panel_beater_performance":["insurer_admin", "claims_manager", "risk_manager"],

  // ── Risk & Fraud Reports ──────────────────────────────────────────────────
  "portfolio.fraud_summary":           ["insurer_admin", "claims_manager", "risk_manager", "fraud_manager"],
  // Assessor performance: processor can export/view; managers own it
  "portfolio.assessor_performance":    ["insurer_admin", "claims_processor", "claims_manager", "risk_manager"],
  "risk_manager_portfolio":            ["insurer_admin", "claims_manager", "risk_manager"],

  // ── Executive Reports ─────────────────────────────────────────────────────
  // Executives see high-level KPI summaries; managers also get trend data
  "executive.insurer_summary":         ["insurer_admin", "executive"],
  "executive.full_report":              ["insurer_admin", "executive"],
  "executive.claims_trend":            ["insurer_admin", "claims_manager", "risk_manager", "executive"],
  "executive.financial_exposure":      ["insurer_admin", "claims_manager", "risk_manager", "executive"],

  // Platform super-admin only — cross-insurer intelligence (no insurer role)
  "executive.platform_dashboard":      ["admin"],
  "executive.cross_insurer_fraud":     ["admin"],
  "executive.ml_performance":          ["admin"],

  // ── Governance / Compliance Reports ──────────────────────────────────────
  // Claims manager owns compliance/governance reporting within the insurer
  // SAR and data retention are compliance/admin functions — not claims management
  "governance.sar":                    ["insurer_admin", "claims_manager"],
  "governance.regulatory_compliance":  ["insurer_admin", "executive", "claims_manager"],
  "governance.data_retention":         ["insurer_admin", "claims_manager"],

  // ── Assessor Reports ──────────────────────────────────────────────────────
  // Assessors see only their own assignment list and personal performance
  "assessor.my_assignments":           ["insurer_admin", "assessor_internal", "assessor_external", "assessor"],
  "assessor.performance_summary":      ["insurer_admin", "assessor_internal", "assessor"],

  // ── Recovery Officer Reports ─────────────────────────────────────────────
  // Recovery officers see their own case portfolio and recovery performance
  "recovery.case_summary":             ["insurer_admin", "recovery_officer", "claims_manager"],
  "recovery.performance":              ["insurer_admin", "recovery_officer", "risk_manager", "executive"],
  "recovery.third_party_profiles":     ["insurer_admin", "recovery_officer", "risk_manager"],

  // ── Panel Beater Reports ──────────────────────────────────────────────────
  "panel_beater.quote_history":        ["insurer_admin", "panel_beater"],
  "panel_beater.job_completion":       ["insurer_admin", "panel_beater"],
};

// ─── Main Dispatcher ─────────────────────────────────────────────────────────
export async function generateReportHtml(
  reportKey: string,
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  switch (reportKey) {
    case "claim.assessment":      return generateClaimAssessmentReport(params, tenantId);
    case "claim.forensic":        return generateForensicDecisionReport(Number(params.claimId), tenantId);
    case "claim.intelligence":    return generateClaimsIntelligenceReport(Number(params.claimId), tenantId);
    case "claim.audit_trail":     return generateAuditTrailReport(params, tenantId);
    case "claim.cost_comparison": return generateCostComparisonReport(params, tenantId);
    case "claim.repair_decision": return generateRepairDecisionReport(params, tenantId);
    case "portfolio.claims_summary": return generateClaimsSummaryReport(params, tenantId);
    case "portfolio.fraud_summary":  return generateFraudSummaryReport(params, tenantId);
    case "portfolio.assessor_performance": return generateAssessorPerformanceReport(params, tenantId);
    case "portfolio.panel_beater_performance": return generatePanelBeaterPerformanceReport(params, tenantId);
    case "portfolio.dwell_time":  return generateDwellTimeReport(params, tenantId);
    case "risk_manager_portfolio": return generateFraudSummaryReport(params, tenantId); // alias → fraud/risk portfolio
    case "executive.platform_dashboard": return generatePlatformDashboardReport(params);
    case "governance.sar":        return generateSARReport(params, tenantId);
    case "governance.regulatory_compliance": return generateRegulatoryComplianceReport(params, tenantId);
    case "governance.data_retention":         return generateDataRetentionReport(params, tenantId);
    case "executive.insurer_summary":         return generateExecutiveInsurerSummary(params, tenantId);
    case "executive.full_report":              return generateExecutiveFullReport(params, tenantId);
    case "executive.claims_trend":            return generateClaimsTrendReport(params, tenantId);
    case "executive.financial_exposure":      return generateFinancialExposureReport(params, tenantId);
    case "executive.cross_insurer_fraud":     return generateCrossInsurerFraudReport(params);
    case "executive.ml_performance":          return generateMLPerformanceReport(params);
    case "assessor.my_assignments":           return generateAssessorAssignmentsReport(params, tenantId);
    case "assessor.performance_summary":      return generateAssessorPerformanceSummary(params, tenantId);
    case "panel_beater.quote_history":        return generatePanelBeaterQuoteHistoryReport(params, tenantId);
    case "panel_beater.job_completion":       return generatePanelBeaterJobCompletionReport(params, tenantId);
    case "recovery.case_summary":             return generateRecoveryCaseSummaryReport(params, tenantId);
    case "recovery.performance":              return generateRecoveryPerformanceReport(params, tenantId);
    case "recovery.third_party_profiles":     return generateRecoveryThirdPartyProfilesReport(params, tenantId);
    default: throw new Error(`Unknown report key: ${reportKey}`);
  }
}

// ─── Phase 2a: Individual Claim Reports ──────────────────────────────────────

async function generateClaimAssessmentReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const claimId = params.claimId as number;
  const conn = await getConn();
  try {
    const [claims] = await conn.execute(
      `SELECT c.id, c.claim_reference, c.incident_type, c.incident_date, c.incident_location,
              c.lodger_name, c.policy_number, c.vehicle_make, c.vehicle_model, c.vehicle_year,
              c.vehicle_registration, c.vehicle_market_value, c.insurer_name, c.status,
              c.created_at, c.confidence_score,
              CONCAT(c.vehicle_make,' ',c.vehicle_model,' ',c.vehicle_year) AS vehicle_description,
              a.fraud_score, a.fraud_risk_level, a.recommendation,
              a.estimated_cost, a.parts_cost, a.labor_cost,
              a.damage_description, a.total_loss_indicated, a.repair_to_value_ratio,
              a.model_version, a.created_at AS assessment_date,
              a.decision_authority_json, a.physics_analysis,
              a.fraud_score_breakdown_json, a.cost_intelligence_json
       FROM claims c
       LEFT JOIN ai_assessments a ON a.claim_id = c.id
       WHERE c.id = ? ${tenantId ? "AND c.tenant_id = ?" : ""} ORDER BY a.created_at DESC LIMIT 1`,
      tenantId ? [claimId, tenantId] : [claimId]
    ) as [Record<string, unknown>[], unknown];

    const claim = claims[0];
    if (!claim) throw new Error(`Claim ${claimId} not found`);

    const physics = safeJson(claim.physics_analysis);
    const fraud = safeJson(claim.fraud_score_breakdown_json);
    const costIntel = safeJson(claim.cost_intelligence_json);
    const decisionAuth = safeJson(claim.decision_authority_json);

    // Damaged components are stored in damaged_components_json on ai_assessments
    // (JSON array of DamagedComponent objects from Stage 6 / Stage 8)
    const [damageRows] = await conn.execute(
      `SELECT a.damaged_components_json FROM ai_assessments a WHERE a.claim_id=? ORDER BY a.created_at DESC LIMIT 1`,
      [claimId]
    ) as [Record<string, unknown>[], unknown];
    const rawCompsData = safeJson((damageRows[0] as Record<string,unknown>)?.damaged_components_json);
    const rawComps: Record<string, unknown>[] = Array.isArray(rawCompsData)
      ? (rawCompsData as Record<string,unknown>[])
      : Array.isArray((rawCompsData as Record<string,unknown> | null)?.components)
        ? ((rawCompsData as Record<string,unknown>).components as Record<string,unknown>[])
        : [];
    // Normalise field names — damage_analysis uses various shapes
    const comps = rawComps.map(c => ({
      component_name: String(c.name ?? c.component ?? c.componentName ?? c.partName ?? ""),
      damage_severity: String(c.severity ?? c.damageSeverity ?? c.damage_severity ?? "unknown"),
      repair_or_replace: String(c.repairOrReplace ?? c.action ?? c.repair_or_replace ?? "repair"),
      estimated_cost: Number(c.estimatedCost ?? c.estimated_cost ?? c.cost ?? 0),
      labour_hours: Number(c.labourHours ?? c.labour_hours ?? 0),
    })).sort((a, b) => b.estimated_cost - a.estimated_cost);

    const fraudScore = Number(claim.fraud_score ?? 0);
    const confidenceScore = Number(claim.confidence_score ?? 0);
    const estimatedCost = Number(claim.estimated_cost ?? 0);
    const kingaOptimised = Number((costIntel as Record<string,unknown> | null)?.compositeOptimisation
      ? ((costIntel as Record<string,unknown>).compositeOptimisation as Record<string,unknown>)?.l2CompositeOptimisedCostUsd ?? 0
      : 0);
    const repairToValue = Number(claim.repair_to_value_ratio ?? 0);
    const isTotalLoss = Boolean(claim.total_loss_indicated);

    // Physics anomaly signal for the light indicator
    const physicsConsistency = Number(physics?.damageConsistencyScore ?? 100);
    const hasCriticalInconsistency = Boolean(physics?.hasCriticalInconsistency);
    const physicsAnomalyScore = hasCriticalInconsistency ? 80 : (physicsConsistency < 70 ? 40 : 0);

    // Fraud risk colour
    const riskLevel = String(claim.fraud_risk_level ?? "low").toLowerCase();
    const riskColour = riskLevel === "high" ? "#a83232" : riskLevel === "medium" ? "#b8720b" : "#3C7844";
    const riskBg = riskLevel === "high" ? "#fbe9e7" : riskLevel === "medium" ? "#fbf1de" : "#e9f3ea";

    const compTotal = comps.reduce((s, c) => s + c.estimated_cost, 0);
    const labourTotal = comps.reduce((s, c) => s + c.labour_hours, 0);

    // Decision authority text
    const daText = typeof decisionAuth === "object" && decisionAuth !== null
      ? String((decisionAuth as Record<string,unknown>).summary ?? JSON.stringify(decisionAuth))
      : String(decisionAuth ?? "Refer to Claims Manager for final approval.");

    // Fraud indicators (top 5)
    const fraudIndicators = Array.isArray((fraud as Record<string,unknown> | null)?.indicators)
      ? ((fraud as Record<string,unknown>).indicators as Record<string,unknown>[]).slice(0, 5)
      : [];

    const claimRef2 = esc(String(claim.claim_reference ?? claim.id));
    const genDate2 = new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
    const insurer2 = esc(String(claim.insurer_name ?? "—"));
    const decisionLabel = String(claim.recommendation ?? "REVIEW").toUpperCase();
    const decisionChipCls2 = decisionLabel.includes("APPROVE") || decisionLabel.includes("ACCEPT") ? "approve" : decisionLabel.includes("REJECT") ? "reject" : "review";
    const decisionIcon2 = decisionChipCls2 === "approve" ? "✓" : decisionChipCls2 === "reject" ? "✗" : "⚠";

    const body = `
<div class="page">
<!-- ── MASTHEAD ── -->
<div class="masthead">
  <div>
    <div class="brand sans">KINGA<span>·</span>AI <span class="tier sans" style="display:inline-block;font-size:8.5px;font-weight:700;letter-spacing:0.6px;color:#fff;background:var(--ink-soft);padding:2px 7px;border-radius:2px;margin-left:8px;vertical-align:middle">PROCESS TIER</span></div>
    <div class="doc-title">Claims Report</div>
    <div class="doc-sub">KINGA Engine · Standard assessment summary · Not legal advice · Requires human adjuster review</div>
  </div>
  <div class="meta sans">
    <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style="height:28px;display:block;margin-bottom:6px;margin-left:auto">
    <div class="claimno mono">${claimRef2}</div>
    <div>Generated ${genDate2} &middot; Insurer: ${insurer2}</div>
    <div class="decision-chip ${decisionChipCls2}">${decisionIcon2} ${decisionLabel}</div>
  </div>
</div>

<!-- ── §1 CLAIM OVERVIEW ── -->
<div class="section">
  <div class="section-tab sans"><span class="num">01</span> Claim, Vehicle &amp; Policy</div>
  <table style="width:100%;border-collapse:collapse;font-size:11px">
    <tr>
      <td style="width:16.6%;padding:4px 8px 4px 0;vertical-align:top"><div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px">Claim Ref</div><div style="font-weight:600;font-family:monospace">${esc(String(claim.claim_reference ?? claim.id))}</div></td>
      <td style="width:16.6%;padding:4px 8px;vertical-align:top"><div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px">Incident Type</div><div style="font-weight:600">${esc(String(claim.incident_type ?? "Motor Vehicle"))}</div></td>
      <td style="width:16.6%;padding:4px 8px;vertical-align:top"><div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px">Date of Incident</div><div style="font-weight:600">${fmtD(claim.incident_date)}</div></td>
      <td style="width:16.6%;padding:4px 8px;vertical-align:top"><div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px">Lodged By</div><div style="font-weight:600">${esc(String(claim.lodger_name ?? "—"))}</div></td>
      <td style="width:16.6%;padding:4px 8px;vertical-align:top"><div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px">Policy Number</div><div style="font-weight:600;font-family:monospace">${esc(String(claim.policy_number ?? "—"))}</div></td>
      <td style="width:16.6%;padding:4px 8px;vertical-align:top"><div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px">Vehicle</div><div style="font-weight:600">${esc(String(claim.vehicle_description ?? "—"))}</div></td>
    </tr>
    <tr>
      <td style="padding:4px 8px 4px 0;vertical-align:top"><div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px">Registration</div><div style="font-weight:600;font-family:monospace">${esc(String(claim.vehicle_registration ?? "—"))}</div></td>
      <td style="padding:4px 8px;vertical-align:top"><div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px">Market Value</div><div style="font-weight:600">${fmtUSD(claim.vehicle_market_value)}</div></td>
      <td style="padding:4px 8px;vertical-align:top"><div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px">Submitted</div><div style="font-weight:600">${fmtD(claim.created_at)}</div></td>
      <td style="padding:4px 8px;vertical-align:top"><div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px">Assessment Date</div><div style="font-weight:600">${fmtD(claim.assessment_date)}</div></td>
      <td style="padding:4px 8px;vertical-align:top"><div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px">Location</div><div style="font-weight:600">${esc(String(claim.incident_location ?? "—"))}</div></td>
      <td style="padding:4px 8px;vertical-align:top"><div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px">Pipeline</div><div style="font-weight:600;font-family:monospace">${esc(String(claim.model_version ?? "v2"))}</div></td>
    </tr>
  </table>
</div>

<!-- ── §2 ASSESSMENT SUMMARY ── -->
<div class="section">
  <div class="section-tab sans"><span class="num">02</span> Assessment Summary</div>
  <table style="width:100%;border-collapse:collapse">
    <tr>
      ${scoreCell(fraudScore, "Fraud Score")}
      ${scoreCell(confidenceScore, "Confidence", true)}
      <td style="padding:8px 12px;border-right:1px solid #e8e8e8;vertical-align:top">
        <div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Risk Level</div>
        <span style="background:${riskBg};color:${riskColour};font-size:10px;font-weight:700;padding:3px 9px;border-radius:2px;text-transform:uppercase">${esc(riskLevel)}</span>
      </td>
      <td style="padding:8px 12px;border-right:1px solid #e8e8e8;vertical-align:top">
        <div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Recommendation</div>
        <div style="font-size:13px;font-weight:700;color:#171717">${esc(String(claim.recommendation ?? "—").toUpperCase())}</div>
      </td>
      <td style="padding:8px 12px;border-right:1px solid #e8e8e8;vertical-align:top">
        <div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">KINGA Estimate</div>
        <div style="font-size:13px;font-weight:700;color:#3C7844">${fmtUSD(kingaOptimised > 0 ? kingaOptimised : estimatedCost)}</div>
      </td>
      <td style="padding:8px 12px;vertical-align:top">
        <div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Repair Decision</div>
        <div style="font-size:11px;font-weight:600;color:#171717">${isTotalLoss ? "TOTAL LOSS" : `REPAIR (${kFmtPct(repairToValue)} R:V)` }</div>
      </td>
    </tr>
  </table>
  ${fraudIndicators.length > 0 ? `
  <div style="margin-top:12px">
    <div style="font-size:9px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Triggered Fraud Indicators</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="border-bottom:2px solid #d9d9d9">
        <th style="text-align:left;padding:3px 8px;font-size:10px;color:#4a4a4a">Indicator</th>
        <th style="text-align:left;padding:3px 8px;font-size:10px;color:#4a4a4a">Category</th>
        <th style="text-align:right;padding:3px 8px;font-size:10px;color:#4a4a4a">Score</th>
      </tr></thead>
      <tbody>
        ${fraudIndicators.map((ind: Record<string,unknown>) => `<tr style="border-bottom:1px solid #e8e8e8">
          <td style="padding:3px 8px">${esc(String(ind.name ?? ind.indicator ?? ""))}</td>
          <td style="padding:3px 8px;color:#4a4a4a">${esc(String(ind.category ?? ""))}</td>
          <td style="padding:3px 8px;text-align:right;font-weight:600">${ind.points ?? ind.score ?? 0}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>` : ""}
</div>

<!-- ── §3 DAMAGED COMPONENTS ── -->
${comps.length > 0 ? `
<div class="section">
  <div class="section-tab sans"><span class="num">03</span> Damage Assessment</div>
  <table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead><tr style="border-bottom:2px solid #d9d9d9">
      <th style="text-align:left;padding:4px 8px;font-size:10px;color:#4a4a4a">Component</th>
      <th style="text-align:left;padding:4px 8px;font-size:10px;color:#4a4a4a">Severity</th>
      <th style="text-align:left;padding:4px 8px;font-size:10px;color:#4a4a4a">Decision</th>
      <th style="text-align:right;padding:4px 8px;font-size:10px;color:#4a4a4a">Est. Cost</th>
      <th style="text-align:right;padding:4px 8px;font-size:10px;color:#4a4a4a">Labour (hrs)</th>
    </tr></thead>
    <tbody>
      ${comps.map(c => {
        const sev = String(c.damage_severity ?? "medium").toLowerCase();
        const sevColour = sev === "severe" ? "#a83232" : sev === "moderate" ? "#b8720b" : "#3C7844";
        const sevBg = sev === "severe" ? "#fbe9e7" : sev === "moderate" ? "#fbf1de" : "#e9f3ea";
        return `<tr style="border-bottom:1px solid #e8e8e8">
          <td style="padding:4px 8px;font-weight:600">${esc(String(c.component_name))}</td>
          <td style="padding:4px 8px"><span style="background:${sevBg};color:${sevColour};font-size:9px;font-weight:700;padding:2px 6px;border-radius:2px;text-transform:uppercase">${esc(sev)}</span></td>
          <td style="padding:4px 8px;color:#4a4a4a">${esc(String(c.repair_or_replace ?? "—"))}</td>
          <td style="padding:4px 8px;text-align:right;font-family:monospace">${fmtUSD(c.estimated_cost)}</td>
          <td style="padding:4px 8px;text-align:right;font-family:monospace">${c.labour_hours ?? "—"}</td>
        </tr>`;
      }).join("")}
    </tbody>
    <tfoot><tr style="border-top:2px solid #d9d9d9;background:#fafafa">
      <td colspan="3" style="padding:4px 8px;font-weight:700;font-size:11px">TOTAL</td>
      <td style="padding:4px 8px;text-align:right;font-weight:700;font-family:monospace">${fmtUSD(compTotal)}</td>
      <td style="padding:4px 8px;text-align:right;font-weight:700;font-family:monospace">${labourTotal.toFixed(1)}</td>
    </tr></tfoot>
  </table>
</div>` : ""}

<!-- ── §4 REPAIR vs REPLACE ── -->
<div class="section">
  <div class="section-tab sans"><span class="num">04</span> Quotation &amp; Cost Optimisation</div>
  <table style="width:100%;border-collapse:collapse"><tr>
    <td style="padding:10px 14px;border:1px solid ${isTotalLoss ? "#a83232" : "#c8dfc9"};background:${isTotalLoss ? "#fbe9e7" : "#e9f3ea"};border-radius:3px;vertical-align:middle">
      <span style="font-size:13px;font-weight:700;color:${isTotalLoss ? "#a83232" : "#3C7844"}">${isTotalLoss ? "TOTAL LOSS — Replace Vehicle" : "REPAIR RECOMMENDED"}</span>
      ${!isTotalLoss && repairToValue > 0 ? `<span style="font-size:11px;color:#4a4a4a;margin-left:12px">Repair-to-Value Ratio: <strong>${kFmtPct(repairToValue)}</strong></span>` : ""}
      ${isTotalLoss ? `<span style="font-size:11px;color:#a83232;margin-left:12px">Repair cost exceeds vehicle market value threshold.</span>` : ""}
    </td>
  </tr></table>
</div>

<!-- ── §5 PHYSICS / FRAUD ── -->
<div class="section">
  <div class="section-tab sans"><span class="num">05</span> Fraud &amp; Physics</div>
  ${physicsIndicator(physicsAnomalyScore, String(claim.claim_reference ?? claim.id))}
  <div style="font-size:10px;color:#8a8a8a;margin-top:8px">Full physics methodology, impact force analysis, and ΔV calculations are available in the Forensic Report (Prove Tier).</div>
</div>

<!-- ── §6 DECISION AUTHORITY ── -->
<div class="section">
  <div class="section-tab sans"><span class="num">06</span> Final Recommendation</div>
  <div style="border:1px solid #d9d9d9;background:#fafafa;border-radius:3px;padding:12px 16px;font-size:11px;color:#171717;line-height:1.6">${esc(daText)}</div>
</div>

  <div class="footer-strip sans" style="position:static;margin-top:10px;">
    <div>CONFIDENTIAL — For authorised insurer use only · KINGA Intelligence must be reviewed by a qualified human adjuster before any claim decision is finalised. Not legal advice.</div>
    <div>${claimRef2} · Generated ${genDate2}</div>
  </div>
</div>`;

    return buildKingaHtml(`KINGA Claims Report — ${claim.claim_reference ?? claim.id}`, body);
  } finally {
    await conn.end();
  }
}

async function generateForensicReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const claimId = params.claimId as number;
  const conn = await getConn();
  try {
    // All column names verified against live DB 2026-05-04
    const [claims] = await conn.execute(
      `SELECT c.*,
              CONCAT(c.vehicle_make, ' ', c.vehicle_model, ' ', c.vehicle_year) AS vehicle_description,
              a.fraud_score, a.fraud_risk_level, a.recommendation,
              a.estimated_cost, a.total_loss_indicated, a.repair_to_value_ratio,
              a.physics_analysis, a.fraud_score_breakdown_json,
              a.forensic_audit_validation_json, a.narrative_analysis_json,
              a.damage_description, a.model_version,
              a.created_at AS assessment_date, a.ife_result_json,
              a.decision_authority_json
       FROM claims c
       LEFT JOIN ai_assessments a ON a.claim_id = c.id
       WHERE c.id = ? ${tenantId ? "AND c.tenant_id = ?" : ""} ORDER BY a.created_at DESC LIMIT 1`,
      tenantId ? [claimId, tenantId] : [claimId]
    ) as [Record<string, unknown>[], unknown];

    const claim = claims[0];
    if (!claim) throw new Error(`Claim ${claimId} not found`);

    const parseJson = (val: unknown) => {
      if (!val) return null;
      try { return typeof val === "string" ? JSON.parse(val) : val; } catch { return null; }
    };

    const physics = parseJson(claim.physics_analysis);
    const fraud = parseJson(claim.fraud_score_breakdown_json);
    const forensic = parseJson(claim.forensic_audit_validation_json);
    const narrative = parseJson(claim.narrative_analysis_json);
    const ife = parseJson(claim.ife_result_json);

    const meta: ReportMeta = {
      title: "Forensic Analysis Report",
      subtitle: `Claim Reference: ${claim.claim_reference ?? claim.id}`,
      reportRef: `RPT-FORENSIC-${claimId}-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: claim.insurer_name as string | undefined,
      classification: "CONFIDENTIAL",
    };

    const fraudScore = Number(claim.fraud_score ?? 0);

    const body = `
      <!-- Claim Identity -->
      <div class="section">
        <div class="section-title">1. Claim Identity</div>
        <div class="kv-grid cols-3">
          <div class="kv-item"><div class="kv-label">Claim Reference</div><div class="kv-value mono">${escHtml(String(claim.claim_reference ?? claim.id))}</div></div>
          <div class="kv-item"><div class="kv-label">Date of Incident</div><div class="kv-value">${fmtDate(claim.incident_date as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Assessment Date</div><div class="kv-value">${fmtDateTime(claim.assessment_date as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Vehicle</div><div class="kv-value">${escHtml(String(claim.vehicle_description ?? "—"))}</div></div>
          <div class="kv-item"><div class="kv-label">Incident Location</div><div class="kv-value">${escHtml(String(claim.incident_location ?? "—"))}</div></div>
          <div class="kv-item"><div class="kv-label">Pipeline Version</div><div class="kv-value mono">${escHtml(String(claim.model_version ?? "v2"))}</div></div>
        </div>
      </div>

      <!-- Fraud Risk Summary -->
      <div class="section">
        <div class="section-title">2. Fraud Risk Assessment</div>
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">Overall Risk Level</div><div class="kv-value">${riskBadge(String(claim.fraud_risk_level ?? "low"))}</div></div>
          <div class="kv-item"><div class="kv-label">Fraud Score</div><div class="kv-value">${scoreBar(fraudScore)}</div></div>
          <div class="kv-item"><div class="kv-label">Confidence Score</div><div class="kv-value">${scoreBar(Number(claim.confidence_score ?? 0))}</div></div>
          <div class="kv-item"><div class="kv-label">Recommendation</div><div class="kv-value bold">${escHtml(String(claim.recommendation ?? "—")).toUpperCase()}</div></div>
        </div>
        ${fraud?.indicators?.length ? `
        <div class="subsection-title">Triggered Fraud Indicators</div>
        <table>
          <thead><tr><th>Indicator</th><th>Category</th><th class="text-right">Points</th><th>Detail</th></tr></thead>
          <tbody>
            ${fraud.indicators.map((ind: Record<string, unknown>) => `
              <tr>
                <td>${escHtml(String(ind.name ?? ind.indicator ?? ""))}</td>
                <td>${escHtml(String(ind.category ?? ""))}</td>
                <td class="text-right bold">${ind.points ?? ind.score ?? 0}</td>
                <td class="small">${escHtml(String(ind.detail ?? ind.description ?? ""))}</td>
              </tr>`).join("")}
          </tbody>
        </table>` : `<div class="finding-box info">No fraud indicators triggered.</div>`}
      </div>

      <!-- Physics Analysis -->
      ${physics ? `
      <div class="section">
        <div class="section-title">3. Physics &amp; Biomechanical Analysis</div>
        <div class="kv-grid cols-3">
          ${physics.deltaV != null ? `<div class="kv-item"><div class="kv-label">Delta-V (km/h)</div><div class="kv-value">${physics.deltaV}</div></div>` : ""}
          ${physics.impactForceN != null ? `<div class="kv-item"><div class="kv-label">Impact Force (N)</div><div class="kv-value">${Number(physics.impactForceN).toLocaleString()}</div></div>` : ""}
          ${physics.airbagDeploymentExpected != null ? `<div class="kv-item"><div class="kv-label">Airbag Deployment</div><div class="kv-value">${physics.airbagDeploymentExpected ? "Expected" : "Not Expected"}</div></div>` : ""}
          ${physics.impactAngle != null ? `<div class="kv-item"><div class="kv-label">Impact Angle</div><div class="kv-value">${physics.impactAngle}°</div></div>` : ""}
          ${physics.vehicleSpeedEstimate != null ? `<div class="kv-item"><div class="kv-label">Speed Estimate</div><div class="kv-value">${physics.vehicleSpeedEstimate} km/h</div></div>` : ""}
          ${physics.physicsConsistency != null ? `<div class="kv-item"><div class="kv-label">Physics Consistency</div><div class="kv-value">${riskBadge(physics.physicsConsistency)}</div></div>` : ""}
        </div>
        ${physics.summary ? `<div class="finding-box"><strong>Summary:</strong> ${escHtml(physics.summary)}</div>` : ""}
        ${physics.anomalies?.length ? `
          <div class="subsection-title">Physics Anomalies</div>
          <ul>${physics.anomalies.map((a: string) => `<li>${escHtml(a)}</li>`).join("")}</ul>` : ""}
      </div>` : ""}

      <!-- Narrative Analysis -->
      ${narrative ? `
      <div class="section">
        <div class="section-title">4. Narrative Consistency Analysis</div>
        <div class="kv-grid cols-3">
          ${narrative.consistencyScore != null ? `<div class="kv-item"><div class="kv-label">Consistency Score</div><div class="kv-value">${scoreBar(narrative.consistencyScore)}</div></div>` : ""}
          ${narrative.directionConsistency != null ? `<div class="kv-item"><div class="kv-label">Direction Consistency</div><div class="kv-value">${riskBadge(narrative.directionConsistency)}</div></div>` : ""}
          ${narrative.timelineConsistency != null ? `<div class="kv-item"><div class="kv-label">Timeline Consistency</div><div class="kv-value">${riskBadge(narrative.timelineConsistency)}</div></div>` : ""}
        </div>
        ${narrative.inconsistencies?.length ? `
          <div class="subsection-title">Identified Inconsistencies</div>
          <ul>${narrative.inconsistencies.map((i: string) => `<li class="small">${escHtml(i)}</li>`).join("")}</ul>` : ""}
      </div>` : ""}

      <!-- Forensic Audit Validation -->
      ${forensic ? `
      <div class="section">
        <div class="section-title">5. Forensic Audit Validation</div>
        ${forensic.validationPoints?.length ? `
        <table>
          <thead><tr><th>Validation Point</th><th>Status</th><th>Finding</th></tr></thead>
          <tbody>
            ${forensic.validationPoints.map((v: Record<string, unknown>) => `
              <tr>
                <td>${escHtml(String(v.point ?? v.name ?? ""))}</td>
                <td>${riskBadge(String(v.status ?? "pass"))}</td>
                <td class="small">${escHtml(String(v.finding ?? v.detail ?? ""))}</td>
              </tr>`).join("")}
          </tbody>
        </table>` : `<div class="finding-box info">${escHtml(String(forensic.summary ?? "No forensic validation data available."))}</div>`}
      </div>` : ""}

      <!-- Input Fidelity -->
      ${ife ? `
      <div class="section">
        <div class="section-title">6. Data Integrity &amp; Input Fidelity</div>
        <div class="kv-grid cols-3">
          ${ife.overallScore != null ? `<div class="kv-item"><div class="kv-label">Overall IFE Score</div><div class="kv-value">${scoreBar(ife.overallScore)}</div></div>` : ""}
          ${ife.documentCompleteness != null ? `<div class="kv-item"><div class="kv-label">Document Completeness</div><div class="kv-value">${fmtPct(ife.documentCompleteness)}</div></div>` : ""}
          ${ife.dataQuality != null ? `<div class="kv-item"><div class="kv-label">Data Quality</div><div class="kv-value">${riskBadge(ife.dataQuality)}</div></div>` : ""}
        </div>
        ${ife.missingFields?.length ? `
          <div class="subsection-title">Missing / Incomplete Fields</div>
          <ul>${ife.missingFields.map((f: string) => `<li class="small">${escHtml(f)}</li>`).join("")}</ul>` : ""}
      </div>` : ""}

      <!-- Decision Authority -->
      <div class="section">
        <div class="section-title">7. Decision Authority &amp; Recommended Action</div>
        <div class="kv-grid cols-2">
          <div class="kv-item"><div class="kv-label">AI Estimated Cost</div><div class="kv-value">${fmtCurrency(claim.estimated_cost as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Total Loss Indicated</div><div class="kv-value bold">${claim.total_loss_indicated ? "YES" : "No"}</div></div>
        </div>
      </div>

      <!-- Disclaimer -->
      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">This forensic report is generated by the KINGA AI Intelligence Platform. It is classified CONFIDENTIAL and is intended solely for use by authorised insurer personnel. The findings herein are AI-generated and must be reviewed and validated by a qualified claims professional before any decision is made. This report must not be disclosed to the insured party, third parties, or legal representatives without explicit written authorisation from the insurer's compliance officer.</p>
      </div>
    `;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

async function generateAuditTrailReport(
  params: Record<string, unknown>,
  _tenantId?: string
): Promise<string> {
  const claimId = params.claimId as number;
  const conn = await getConn();
  try {
    // c.psm_status → c.status (verified 2026-05-04)
    const [claims] = await conn.execute(
      `SELECT c.claim_reference, c.id, c.status, c.workflow_state, c.created_at, c.updated_at,
              c.insurer_name, c.lodger_name
       FROM claims c WHERE c.id=? LIMIT 1`,
      [claimId]
    ) as [Record<string, unknown>[], unknown];
    const claim = claims[0];
    if (!claim) throw new Error(`Claim ${claimId} not found`);

    const [events] = await conn.execute(
      `SELECT event_type, from_status, to_status, performed_by_name, performed_by_role,
              notes, created_at
       FROM claim_workflow_events WHERE claim_id=? ORDER BY created_at ASC`,
      [claimId]
    ) as [Record<string, unknown>[], unknown];

    // a.triggered_by_admin → a.triggered_role (verified 2026-05-04)
    const [assessments] = await conn.execute(
      `SELECT id, model_version, fraud_score, fraud_risk_level,
              recommendation, created_at, triggered_role
       FROM ai_assessments WHERE claim_id=? ORDER BY created_at ASC`,
      [claimId]
    ) as [Record<string, unknown>[], unknown];

    const meta: ReportMeta = {
      title: "Claim Decision Audit Trail",
      subtitle: `Claim Reference: ${claim.claim_reference ?? claim.id}`,
      reportRef: `RPT-AUDIT-${claimId}-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: claim.insurer_name as string | undefined,
      classification: "CONFIDENTIAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">1. Claim Identity</div>
        <div class="kv-grid cols-3">
          <div class="kv-item"><div class="kv-label">Claim Reference</div><div class="kv-value mono">${escHtml(String(claim.claim_reference ?? claim.id))}</div></div>
          <div class="kv-item"><div class="kv-label">Lodged By</div><div class="kv-value">${escHtml(String(claim.lodger_name ?? "—"))}</div></div>
          <div class="kv-item"><div class="kv-label">Current Status</div><div class="kv-value">${escHtml(String(claim.status ?? "—"))}</div></div>
          <div class="kv-item"><div class="kv-label">Workflow State</div><div class="kv-value">${escHtml(String(claim.workflow_state ?? "—"))}</div></div>
          <div class="kv-item"><div class="kv-label">Submitted</div><div class="kv-value">${fmtDateTime(claim.created_at as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Last Updated</div><div class="kv-value">${fmtDateTime(claim.updated_at as number)}</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">2. Workflow Event Log</div>
        ${(events as Record<string, unknown>[]).length > 0 ? `
        <table>
          <thead><tr><th>Timestamp</th><th>Event</th><th>From</th><th>To</th><th>Performed By</th><th>Role</th><th>Notes</th></tr></thead>
          <tbody>
            ${(events as Record<string, unknown>[]).map((e) => `
              <tr>
                <td class="mono small">${fmtDateTime(e.created_at as number)}</td>
                <td>${escHtml(String(e.event_type ?? ""))}</td>
                <td class="small">${escHtml(String(e.from_status ?? "—"))}</td>
                <td class="small">${escHtml(String(e.to_status ?? "—"))}</td>
                <td>${escHtml(String(e.performed_by_name ?? "System"))}</td>
                <td class="small">${escHtml(String(e.performed_by_role ?? "—"))}</td>
                <td class="small grey">${escHtml(String(e.notes ?? ""))}</td>
              </tr>`).join("")}
          </tbody>
        </table>` : `<div class="finding-box info">No workflow events recorded.</div>`}
      </div>

      <div class="section">
        <div class="section-title">3. KINGA Assessment History</div>
        ${(assessments as Record<string, unknown>[]).length > 0 ? `
        <table>
          <thead><tr><th>Assessment ID</th><th>Date</th><th>Pipeline</th><th>Fraud Score</th><th>Risk Level</th><th>Recommendation</th><th>Triggered By</th></tr></thead>
          <tbody>
            ${(assessments as Record<string, unknown>[]).map((a) => `
              <tr>
                <td class="mono small">${a.id}</td>
                <td class="small">${fmtDateTime(a.created_at as number)}</td>
                <td class="mono small">${escHtml(String(a.model_version ?? "v2"))}</td>
                <td>${scoreBar(Number(a.fraud_score ?? 0))}</td>
                <td>${riskBadge(String(a.fraud_risk_level ?? "low"))}</td>
                <td class="bold">${escHtml(String(a.recommendation ?? "—")).toUpperCase()}</td>
                <td>${escHtml(String(a.triggered_role ?? "system"))}</td>
              </tr>`).join("")}
          </tbody>
        </table>` : `<div class="finding-box info">No AI assessments recorded.</div>`}
      </div>

      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">This audit trail is an immutable record generated by the KINGA Intelligence Platform. It is classified CONFIDENTIAL. The events recorded herein reflect all system and human actions taken on this claim. This document may be used as evidence in legal proceedings, regulatory investigations, or internal compliance reviews.</p>
      </div>
    `;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

async function generateCostComparisonReport(
  params: Record<string, unknown>,
  _tenantId?: string
): Promise<string> {
  const claimId = params.claimId as number;
  const conn = await getConn();
  try {
    // All column names verified 2026-05-04
    const [claims] = await conn.execute(
      `SELECT c.claim_reference, c.id, c.insurer_name,
              CONCAT(c.vehicle_make, ' ', c.vehicle_model, ' ', c.vehicle_year) AS vehicle_description,
              a.estimated_cost, a.parts_cost, a.labor_cost,
              a.cost_intelligence_json, a.created_at AS assessment_date
       FROM claims c
       LEFT JOIN ai_assessments a ON a.claim_id=c.id
       WHERE c.id=? ORDER BY a.created_at DESC LIMIT 1`,
      [claimId]
    ) as [Record<string, unknown>[], unknown];
    const claim = claims[0];
    if (!claim) throw new Error(`Claim ${claimId} not found`);

    const [components] = await conn.execute(
      `SELECT component_name, damage_severity, repair_or_replace,
              estimated_cost, quote_price, benchmark_price, labour_hours
       FROM damaged_components WHERE claim_id=? ORDER BY estimated_cost DESC`,
      [claimId]
    ) as [Record<string, unknown>[], unknown];

    const parseJson = (val: unknown) => {
      if (!val) return null;
      try { return typeof val === "string" ? JSON.parse(val) : val; } catch { return null; }
    };
    const costIntel = parseJson(claim.cost_intelligence_json);

    const estimatedCost = Number(claim.estimated_cost ?? 0);
    const partsCost = Number(claim.parts_cost ?? 0);
    const laborCost = Number(claim.labor_cost ?? 0);

    const meta: ReportMeta = {
      title: "Cost Comparison Report",
      subtitle: `Claim Reference: ${claim.claim_reference ?? claim.id}`,
      reportRef: `RPT-COST-${claimId}-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: claim.insurer_name as string | undefined,
      classification: "CONFIDENTIAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">1. Cost Summary</div>
        <div class="kv-grid cols-3">
          <div class="kv-item"><div class="kv-label">AI Estimated Total Cost</div><div class="kv-value bold">${fmtCurrency(estimatedCost)}</div></div>
          <div class="kv-item"><div class="kv-label">Parts Cost</div><div class="kv-value">${fmtCurrency(partsCost)}</div></div>
          <div class="kv-item"><div class="kv-label">Labour Cost</div><div class="kv-value">${fmtCurrency(laborCost)}</div></div>
        </div>
      </div>

      ${(components as Record<string, unknown>[]).length > 0 ? `
      <div class="section">
        <div class="section-title">2. Component-Level Cost Analysis</div>
        <table>
          <thead><tr>
            <th>Component</th><th>Severity</th><th>Decision</th>
            <th class="text-right">Quote Price</th>
            <th class="text-right">AI Benchmark</th>
            <th class="text-right">Variance</th>
          </tr></thead>
          <tbody>
            ${(components as Record<string, unknown>[]).map((c) => {
              const quote = Number(c.quote_price ?? c.estimated_cost ?? 0);
              const bench = Number(c.benchmark_price ?? 0);
              const vari = bench > 0 ? ((quote - bench) / bench) * 100 : null;
              return `<tr>
                <td>${escHtml(String(c.component_name))}</td>
                <td>${riskBadge(String(c.damage_severity ?? "medium"))}</td>
                <td>${escHtml(String(c.repair_or_replace ?? "—"))}</td>
                <td class="text-right">${fmtCurrency(quote)}</td>
                <td class="text-right">${bench > 0 ? fmtCurrency(bench) : "—"}</td>
                <td class="text-right ${vari != null && Math.abs(vari) > 20 ? "bold" : ""}">${vari != null ? `${vari >= 0 ? "+" : ""}${vari.toFixed(1)}%` : "—"}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>` : ""}

      ${costIntel ? `
      <div class="section">
        <div class="section-title">3. Cost Intelligence Notes</div>
        <div class="finding-box info">
          ${escHtml(String(costIntel.summary ?? costIntel.notes ?? JSON.stringify(costIntel)))}
        </div>
      </div>` : ""}

      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">Cost benchmarks are derived from the KINGA learning database, market data, and KINGA analysis. They represent estimates and should be validated against current supplier pricing before final settlement. This report is classified CONFIDENTIAL.</p>
      </div>
    `;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

async function generateRepairDecisionReport(
  params: Record<string, unknown>,
  _tenantId?: string
): Promise<string> {
  const claimId = params.claimId as number;
  const conn = await getConn();
  try {
    // All column names verified 2026-05-04
    const [claims] = await conn.execute(
      `SELECT c.claim_reference, c.id, c.insurer_name,
              CONCAT(c.vehicle_make, ' ', c.vehicle_model, ' ', c.vehicle_year) AS vehicle_description,
              c.vehicle_market_value,
              a.total_loss_indicated, a.repair_to_value_ratio,
              a.repair_intelligence_json, a.estimated_cost,
              a.created_at AS assessment_date
       FROM claims c
       LEFT JOIN ai_assessments a ON a.claim_id=c.id
       WHERE c.id=? ORDER BY a.created_at DESC LIMIT 1`,
      [claimId]
    ) as [Record<string, unknown>[], unknown];
    const claim = claims[0];
    if (!claim) throw new Error(`Claim ${claimId} not found`);

    const parseJson = (val: unknown) => {
      if (!val) return null;
      try { return typeof val === "string" ? JSON.parse(val) : val; } catch { return null; }
    };
    const repairIntel = parseJson(claim.repair_intelligence_json);

    const meta: ReportMeta = {
      title: "Repair vs Replace Decision Report",
      subtitle: `Claim Reference: ${claim.claim_reference ?? claim.id}`,
      reportRef: `RPT-RVR-${claimId}-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: claim.insurer_name as string | undefined,
      classification: "INTERNAL",
    };

    const repairDecision = claim.total_loss_indicated
      ? "TOTAL LOSS — Replace Vehicle"
      : `REPAIR — Repair-to-Value Ratio: ${fmtPct(claim.repair_to_value_ratio as number)}`;

    const body = `
      <div class="section">
        <div class="section-title">1. Vehicle &amp; Damage Overview</div>
        <div class="kv-grid cols-3">
          <div class="kv-item"><div class="kv-label">Vehicle</div><div class="kv-value">${escHtml(String(claim.vehicle_description ?? "—"))}</div></div>
          <div class="kv-item"><div class="kv-label">Repair Cost Estimate</div><div class="kv-value">${fmtCurrency(claim.estimated_cost as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Vehicle Market Value</div><div class="kv-value">${claim.vehicle_market_value ? fmtCurrency(claim.vehicle_market_value as number) : "—"}</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">2. Repair vs Replace Recommendation</div>
        <div class="finding-box">
          <strong>AI Decision:</strong> ${escHtml(repairDecision)}
        </div>
        ${repairIntel ? `
        <div class="kv-grid cols-3">
          ${repairIntel.repairScore != null ? `<div class="kv-item"><div class="kv-label">Repair Score</div><div class="kv-value">${scoreBar(repairIntel.repairScore)}</div></div>` : ""}
          ${repairIntel.totalLossThreshold != null ? `<div class="kv-item"><div class="kv-label">Total Loss Threshold</div><div class="kv-value">${fmtPct(repairIntel.totalLossThreshold)}</div></div>` : ""}
          ${claim.repair_to_value_ratio != null ? `<div class="kv-item"><div class="kv-label">Repair-to-Value Ratio</div><div class="kv-value bold">${fmtPct(claim.repair_to_value_ratio as number)}</div></div>` : ""}
        </div>
        ${repairIntel.reasoning ? `<div class="finding-box info"><strong>Reasoning:</strong> ${escHtml(repairIntel.reasoning)}</div>` : ""}` : ""}
      </div>

      ${claim.vehicle_market_value ? `
      <div class="section">
        <div class="section-title">3. Vehicle Market Value</div>
        <div class="kv-grid cols-2">
          <div class="kv-item"><div class="kv-label">Market Value</div><div class="kv-value">${fmtCurrency(claim.vehicle_market_value as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Vehicle</div><div class="kv-value">${escHtml(String(claim.vehicle_description ?? "—"))}</div></div>
        </div>
      </div>` : ""}

      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">This report is generated by the KINGA AI Intelligence Platform. The repair vs replace recommendation is based on KINGA analysis and must be reviewed by a qualified assessor before a final decision is communicated to any party.</p>
      </div>
    `;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

// ─── Phase 2b: Portfolio Reports ─────────────────────────────────────────────

async function generateClaimsSummaryReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const fromTs = params.fromTs as number ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
    const toTs = params.toTs as number ?? Date.now();
    const tid = tenantId ?? params.tenantId as string;

    const whereClause = tid
      ? `WHERE c.tenant_id=? AND c.created_at BETWEEN ? AND ?`
      : `WHERE c.created_at BETWEEN ? AND ?`;
    const whereParams = tid ? [tid, fromTs, toTs] : [fromTs, toTs];

    // c.psm_status → c.status; a.overall_fraud_score → a.fraud_score; a.total_claimed_amount → a.estimated_cost
    const [summary] = await conn.execute(
      `SELECT
        COUNT(*) as total_claims,
        SUM(CASE WHEN c.status='approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN c.status='rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN c.status IN ('in_review','assessment_in_progress','submitted') THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN c.status='settled' THEN 1 ELSE 0 END) as settled,
        AVG(a.fraud_score) as avg_fraud_score,
        SUM(CASE WHEN a.fraud_risk_level='high' OR a.fraud_risk_level='critical' THEN 1 ELSE 0 END) as high_risk_count,
        SUM(a.estimated_cost) as total_estimated,
        AVG(c.confidence_score) as avg_quality_score
       FROM claims c
       LEFT JOIN ai_assessments a ON a.claim_id=c.id
       ${whereClause}`,
      whereParams
    ) as [Record<string, unknown>[], unknown];

    const stats = (summary as Record<string, unknown>[])[0] ?? {};

    // c.claim_type → c.incident_type
    const [byType] = await conn.execute(
      `SELECT c.incident_type, COUNT(*) as cnt, SUM(a.estimated_cost) as total_value
       FROM claims c LEFT JOIN ai_assessments a ON a.claim_id=c.id
       ${whereClause} GROUP BY c.incident_type ORDER BY cnt DESC`,
      whereParams
    ) as [Record<string, unknown>[], unknown];

    const meta: ReportMeta = {
      title: "Claims Portfolio Summary",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-PORTFOLIO-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "CONFIDENTIAL",
    };

    const total = Number(stats.total_claims ?? 0);
    const approved = Number(stats.approved ?? 0);
    const rejected = Number(stats.rejected ?? 0);
    const approvalRate = total > 0 ? (approved / total) * 100 : 0;

    const body = `
      <div class="section">
        <div class="section-title">1. Portfolio Overview</div>
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">Total Claims</div><div class="kv-value bold">${total.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Approved</div><div class="kv-value">${approved.toLocaleString()} (${approvalRate.toFixed(1)}%)</div></div>
          <div class="kv-item"><div class="kv-label">Rejected</div><div class="kv-value">${rejected.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">In Progress</div><div class="kv-value">${Number(stats.in_progress ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Total AI Estimated Value</div><div class="kv-value bold">${fmtCurrency(stats.total_estimated as number)}</div></div>
          <div class="kv-item"><div class="kv-label">High Risk Claims</div><div class="kv-value">${Number(stats.high_risk_count ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Avg Fraud Score</div><div class="kv-value">${scoreBar(Math.round(Number(stats.avg_fraud_score ?? 0)))}</div></div>
          <div class="kv-item"><div class="kv-label">Avg Confidence Score</div><div class="kv-value">${scoreBar(Math.round(Number(stats.avg_quality_score ?? 0)))}</div></div>
        </div>
      </div>

      ${(byType as Record<string, unknown>[]).length > 0 ? `
      <div class="section">
        <div class="section-title">2. Claims by Incident Type</div>
        <table>
          <thead><tr><th>Incident Type</th><th class="text-right">Count</th><th class="text-right">Total AI Estimated Value</th></tr></thead>
          <tbody>
            ${(byType as Record<string, unknown>[]).map((r) => `
              <tr>
                <td>${escHtml(String(r.incident_type ?? "Unknown"))}</td>
                <td class="text-right">${Number(r.cnt).toLocaleString()}</td>
                <td class="text-right">${fmtCurrency(r.total_value as number)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : ""}

      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">This portfolio summary is generated by the KINGA Intelligence Platform. All figures are based on KINGA assessment outputs and are subject to final human review. This report is classified CONFIDENTIAL and is intended for authorised insurer personnel only.</p>
      </div>
    `;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

async function generateFraudSummaryReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const fromTs = params.fromTs as number ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
    const toTs = params.toTs as number ?? Date.now();
    const tid = tenantId ?? params.tenantId as string;

    const whereClause = tid ? `WHERE c.tenant_id=? AND c.created_at BETWEEN ? AND ?` : `WHERE c.created_at BETWEEN ? AND ?`;
    const whereParams = tid ? [tid, fromTs, toTs] : [fromTs, toTs];

    // a.overall_fraud_score → a.fraud_score (verified 2026-05-04)
    const [riskDist] = await conn.execute(
      `SELECT a.fraud_risk_level, COUNT(*) as cnt, AVG(a.fraud_score) as avg_score
       FROM claims c LEFT JOIN ai_assessments a ON a.claim_id=c.id
       ${whereClause} GROUP BY a.fraud_risk_level ORDER BY avg_score DESC`,
      whereParams
    ) as [Record<string, unknown>[], unknown];

    const meta: ReportMeta = {
      title: "Fraud Detection Summary Report",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-FRAUD-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "CONFIDENTIAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">1. Fraud Risk Distribution</div>
        <table>
          <thead><tr><th>Risk Level</th><th class="text-right">Claim Count</th><th>Avg Fraud Score</th></tr></thead>
          <tbody>
            ${(riskDist as Record<string, unknown>[]).map((r) => `
              <tr>
                <td>${riskBadge(String(r.fraud_risk_level ?? "unknown"))}</td>
                <td class="text-right">${Number(r.cnt).toLocaleString()}</td>
                <td>${scoreBar(Math.round(Number(r.avg_score ?? 0)))}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">This fraud summary is generated by the KINGA AI Intelligence Platform. All fraud risk assessments are AI-generated and must be reviewed by a qualified fraud investigator before any action is taken. This report is classified CONFIDENTIAL.</p>
      </div>
    `;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

async function generateAssessorPerformanceReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const fromTs = params.fromTs as number ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
    const toTs = params.toTs as number ?? Date.now();

    const [rows] = await conn.execute(
      `SELECT ar.assessor_name, ar.company_name, ar.region,
              ar.total_claims_assessed, ar.avg_cost_reduction_pct,
              ar.routing_concentration_score, ar.anomaly_score,
              ar.last_claim_date
       FROM assessor_registry ar
       WHERE ar.last_claim_date BETWEEN ? AND ?
       ORDER BY ar.total_claims_assessed DESC LIMIT 50`,
      [fromTs, toTs]
    ) as [Record<string, unknown>[], unknown];

    const meta: ReportMeta = {
      title: "Assessor Performance Report",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-ASSESSOR-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tenantId,
      classification: "CONFIDENTIAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">1. Assessor Performance Summary</div>
        ${(rows as Record<string, unknown>[]).length > 0 ? `
        <table>
          <thead><tr>
            <th>Assessor</th><th>Company</th><th>Region</th>
            <th class="text-right">Claims</th>
            <th class="text-right">Avg Cost Reduction</th>
            <th>Routing Concentration</th>
            <th>Anomaly Score</th>
          </tr></thead>
          <tbody>
            ${(rows as Record<string, unknown>[]).map((r) => `
              <tr>
                <td>${escHtml(String(r.assessor_name ?? "—"))}</td>
                <td class="small">${escHtml(String(r.company_name ?? "—"))}</td>
                <td class="small">${escHtml(String(r.region ?? "—"))}</td>
                <td class="text-right">${Number(r.total_claims_assessed ?? 0).toLocaleString()}</td>
                <td class="text-right ${Number(r.avg_cost_reduction_pct ?? 0) > 25 ? "bold" : ""}">${fmtPct(r.avg_cost_reduction_pct as number)}</td>
                <td>${scoreBar(Math.round(Number(r.routing_concentration_score ?? 0) * 100))}</td>
                <td>${scoreBar(Math.round(Number(r.anomaly_score ?? 0) * 100))}</td>
              </tr>`).join("")}
          </tbody>
        </table>` : `<div class="finding-box info">No assessor data available for the selected period.</div>`}
      </div>
      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">Assessor performance metrics are derived from KINGA analysis of claim outcomes. Anomaly scores are indicative only and must be investigated by a qualified fraud manager before any action is taken. This report is classified CONFIDENTIAL.</p>
      </div>
    `;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

async function generatePanelBeaterPerformanceReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const fromTs = params.fromTs as number ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
    const toTs = params.toTs as number ?? Date.now();

    const [rows] = await conn.execute(
      `SELECT pb.company_name, pb.address, pb.region,
              pb.total_claims_repaired, pb.avg_quote_vs_true_cost_pct,
              pb.structural_gap_count, pb.anomaly_score, pb.last_claim_date
       FROM panel_beater_registry pb
       WHERE pb.last_claim_date BETWEEN ? AND ?
       ORDER BY pb.total_claims_repaired DESC LIMIT 50`,
      [fromTs, toTs]
    ) as [Record<string, unknown>[], unknown];

    const meta: ReportMeta = {
      title: "Panel Beater Performance Report",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-PB-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tenantId,
      classification: "CONFIDENTIAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">1. Panel Beater Performance Summary</div>
        ${(rows as Record<string, unknown>[]).length > 0 ? `
        <table>
          <thead><tr>
            <th>Company</th><th>Region</th>
            <th class="text-right">Claims</th>
            <th class="text-right">Quote vs True Cost</th>
            <th class="text-right">Structural Gaps</th>
            <th>Anomaly Score</th>
          </tr></thead>
          <tbody>
            ${(rows as Record<string, unknown>[]).map((r) => `
              <tr>
                <td>${escHtml(String(r.company_name ?? "—"))}</td>
                <td class="small">${escHtml(String(r.region ?? "—"))}</td>
                <td class="text-right">${Number(r.total_claims_repaired ?? 0).toLocaleString()}</td>
                <td class="text-right ${Math.abs(Number(r.avg_quote_vs_true_cost_pct ?? 0)) > 20 ? "bold" : ""}">${fmtPct(r.avg_quote_vs_true_cost_pct as number)}</td>
                <td class="text-right">${Number(r.structural_gap_count ?? 0)}</td>
                <td>${scoreBar(Math.round(Number(r.anomaly_score ?? 0) * 100))}</td>
              </tr>`).join("")}
          </tbody>
        </table>` : `<div class="finding-box info">No panel beater data available for the selected period.</div>`}
      </div>
      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">Panel beater performance metrics are derived from AI cost analysis. This report is classified CONFIDENTIAL and is intended for authorised insurer personnel only.</p>
      </div>
    `;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

async function generateDwellTimeReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const fromTs = params.fromTs as number ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
    const toTs = params.toTs as number ?? Date.now();
    const tid = tenantId ?? params.tenantId as string;

    const whereClause = tid ? `WHERE c.tenant_id=? AND c.created_at BETWEEN ? AND ?` : `WHERE c.created_at BETWEEN ? AND ?`;
    const whereParams = tid ? [tid, fromTs, toTs] : [fromTs, toTs];

    // c.psm_status → c.status (verified 2026-05-04)
    const [rows] = await conn.execute(
      `SELECT c.status,
              COUNT(*) as cnt,
              AVG((c.updated_at - c.created_at) / 3600000) as avg_hours_in_state,
              MAX((c.updated_at - c.created_at) / 3600000) as max_hours_in_state
       FROM claims c ${whereClause}
       GROUP BY c.status ORDER BY avg_hours_in_state DESC`,
      whereParams
    ) as [Record<string, unknown>[], unknown];

    const meta: ReportMeta = {
      title: "Claims Processing Dwell Time Report",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-DWELL-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "INTERNAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">1. Average Dwell Time by Workflow Status</div>
        <table>
          <thead><tr>
            <th>Status</th>
            <th class="text-right">Claim Count</th>
            <th class="text-right">Avg Hours in State</th>
            <th class="text-right">Max Hours in State</th>
          </tr></thead>
          <tbody>
            ${(rows as Record<string, unknown>[]).map((r) => `
              <tr>
                <td>${escHtml(String(r.status ?? "—"))}</td>
                <td class="text-right">${Number(r.cnt).toLocaleString()}</td>
                <td class="text-right ${Number(r.avg_hours_in_state ?? 0) > 48 ? "bold" : ""}">${Number(r.avg_hours_in_state ?? 0).toFixed(1)}h</td>
                <td class="text-right">${Number(r.max_hours_in_state ?? 0).toFixed(1)}h</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

// ─── Phase 2d: Executive & Governance Reports ─────────────────────────────────

async function generatePlatformDashboardReport(
  params: Record<string, unknown>
): Promise<string> {
  const conn = await getConn();
  try {
    // a.total_claimed_amount → a.estimated_cost; a.overall_fraud_score → a.fraud_score (verified 2026-05-04)
    const [totals] = await conn.execute(
      `SELECT COUNT(*) as total_claims,
              COUNT(DISTINCT c.tenant_id) as active_insurers,
              SUM(a.estimated_cost) as total_estimated,
              AVG(a.fraud_score) as avg_fraud_score,
              SUM(CASE WHEN a.fraud_risk_level IN ('high','critical') THEN 1 ELSE 0 END) as high_risk
       FROM claims c LEFT JOIN ai_assessments a ON a.claim_id=c.id`,
      []
    ) as [Record<string, unknown>[], unknown];

    const stats = (totals as Record<string, unknown>[])[0] ?? {};

    const meta: ReportMeta = {
      title: "Platform Executive Dashboard",
      subtitle: `All Insurers · All Time`,
      reportRef: `RPT-EXEC-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      classification: "CONFIDENTIAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">1. Platform-Wide Summary</div>
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">Total Claims Processed</div><div class="kv-value bold">${Number(stats.total_claims ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Active Insurers</div><div class="kv-value bold">${Number(stats.active_insurers ?? 0)}</div></div>
          <div class="kv-item"><div class="kv-label">Total AI Estimated Value</div><div class="kv-value bold">${fmtCurrency(stats.total_estimated as number)}</div></div>
          <div class="kv-item"><div class="kv-label">High Risk Claims</div><div class="kv-value bold">${Number(stats.high_risk ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Avg Platform Fraud Score</div><div class="kv-value">${scoreBar(Math.round(Number(stats.avg_fraud_score ?? 0)))}</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">This executive dashboard is classified CONFIDENTIAL and is restricted to Platform Super-Admin personnel only. All figures are AI-generated and subject to final human review.</p>
      </div>
    `;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

async function generateSARReport(
  params: Record<string, unknown>,
  _tenantId?: string
): Promise<string> {
  const subjectId = params.subjectId as number;
  const subjectType = params.subjectType as string ?? "claimant";
  const conn = await getConn();
  try {
    // c.psm_status → c.status; c.claim_type → c.incident_type; c.policyholder_id → c.claimant_id (verified 2026-05-04)
    const [claims] = await conn.execute(
      `SELECT c.id, c.claim_reference, c.status, c.workflow_state, c.incident_type,
              c.incident_date, c.created_at, c.updated_at,
              a.fraud_score, a.fraud_risk_level, a.recommendation
       FROM claims c
       LEFT JOIN ai_assessments a ON a.claim_id=c.id
       WHERE c.claimant_id=?
       ORDER BY c.created_at DESC`,
      [subjectId]
    ) as [Record<string, unknown>[], unknown];

    const meta: ReportMeta = {
      title: "Subject Access Request — Data Report",
      subtitle: `Subject ID: ${subjectId} · Type: ${subjectType}`,
      reportRef: `RPT-SAR-${subjectId}-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      classification: "CONFIDENTIAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">1. SAR Notice</div>
        <div class="finding-box">
          This report has been generated in response to a Subject Access Request under applicable data protection legislation (Zimbabwe Cyber and Data Protection Act 2021, Zambia Data Protection Act 2021, or South Africa POPIA 2021). It contains all personal information held by the KINGA Intelligence Platform relating to the identified data subject.
        </div>
      </div>

      <div class="section">
        <div class="section-title">2. Claims Data</div>
        ${(claims as Record<string, unknown>[]).length > 0 ? `
        <table>
          <thead><tr>
            <th>Claim Reference</th><th>Incident Type</th><th>Date of Incident</th>
            <th>Status</th><th>Submitted</th>
          </tr></thead>
          <tbody>
            ${(claims as Record<string, unknown>[]).map((c) => `
              <tr>
                <td class="mono">${escHtml(String(c.claim_reference ?? c.id))}</td>
                <td>${escHtml(String(c.incident_type ?? "—"))}</td>
                <td>${fmtDate(c.incident_date as number)}</td>
                <td>${escHtml(String(c.status ?? "—"))}</td>
                <td>${fmtDate(c.created_at as number)}</td>
              </tr>`).join("")}
          </tbody>
        </table>` : `<div class="finding-box info">No claims data found for this subject.</div>`}
      </div>

      <div class="section">
        <div class="section-title">3. Data Retention Notice</div>
        <p class="small grey">Personal data held by the KINGA Intelligence Platform is retained in accordance with the applicable data protection legislation and the insurer's data retention policy. Data subjects have the right to request correction or deletion of their personal information, subject to applicable legal and regulatory retention requirements.</p>
      </div>
    `;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

async function generateRegulatoryComplianceReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const fromTs = params.fromTs as number ?? Date.now() - 90 * 24 * 60 * 60 * 1000;
    const toTs = params.toTs as number ?? Date.now();
    const tid = tenantId ?? params.tenantId as string;

    const whereClause = tid ? `WHERE c.tenant_id=? AND c.created_at BETWEEN ? AND ?` : `WHERE c.created_at BETWEEN ? AND ?`;
    const whereParams = tid ? [tid, fromTs, toTs] : [fromTs, toTs];

    // c.psm_status → c.status; a.overall_fraud_score → a.fraud_score (verified 2026-05-04)
    const [totals] = await conn.execute(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN a.fraud_score IS NOT NULL THEN 1 ELSE 0 END) as ai_assessed,
              SUM(CASE WHEN c.status IN ('approved','rejected','settled') THEN 1 ELSE 0 END) as decided,
              AVG((c.updated_at - c.created_at) / 86400000) as avg_processing_days
       FROM claims c LEFT JOIN ai_assessments a ON a.claim_id=c.id ${whereClause}`,
      whereParams
    ) as [Record<string, unknown>[], unknown];

    const stats = (totals as Record<string, unknown>[])[0] ?? {};
    const total = Number(stats.total ?? 0);
    const assessed = Number(stats.ai_assessed ?? 0);
    const assessmentRate = total > 0 ? (assessed / total) * 100 : 0;

    const meta: ReportMeta = {
      title: "Regulatory Compliance Report",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-COMPLIANCE-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "CONFIDENTIAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">1. Processing Compliance Summary</div>
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">Total Claims</div><div class="kv-value bold">${total.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">AI Assessed</div><div class="kv-value">${assessed.toLocaleString()} (${assessmentRate.toFixed(1)}%)</div></div>
          <div class="kv-item"><div class="kv-label">Decided</div><div class="kv-value">${Number(stats.decided ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Avg Processing Days</div><div class="kv-value">${Number(stats.avg_processing_days ?? 0).toFixed(1)} days</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">2. Data Protection Compliance</div>
        <table>
          <thead><tr><th>Obligation</th><th>Jurisdiction</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>
            <tr><td>Lawful basis for AI processing documented</td><td>All</td><td>${riskBadge("pass")}</td><td>Legitimate interest (fraud prevention)</td></tr>
            <tr><td>Data minimisation in reports</td><td>All</td><td>${riskBadge("pass")}</td><td>PII excluded from portfolio reports</td></tr>
            <tr><td>Subject Access Request capability</td><td>All</td><td>${riskBadge("pass")}</td><td>SAR report available on demand</td></tr>
            <tr><td>Audit trail immutability</td><td>All</td><td>${riskBadge("pass")}</td><td>Append-only audit log enforced</td></tr>
            <tr><td>Report access control enforcement</td><td>All</td><td>${riskBadge("pass")}</td><td>Role-based at API layer</td></tr>
            <tr><td>Data retention schedule defined</td><td>All</td><td>${riskBadge("warn")}</td><td>Retention policy requires formal sign-off</td></tr>
            <tr><td>Information Officer appointed</td><td>ZA (POPIA)</td><td>${riskBadge("warn")}</td><td>Required before public launch</td></tr>
          </tbody>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">This compliance report is generated by the KINGA Intelligence Platform and does not constitute legal advice. The platform operator should obtain formal legal opinion on data protection compliance obligations in each jurisdiction before processing live personal data at scale.</p>
      </div>
    `;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

// ─── Missing Report Generators ────────────────────────────────────────────────
// Added 2026-05-04: executive summaries, trend, financial exposure, cross-insurer
// fraud, ML performance, data retention, assessor assignments/performance,
// panel beater reports.

export async function generateExecutiveInsurerSummary(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const fromTs = (params.fromTs as number) ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
    const toTs   = (params.toTs   as number) ?? Date.now();
    const tid    = tenantId ?? (params.tenantId as string);
    const wp     = tid ? [tid, fromTs, toTs] : [fromTs, toTs];
    const wc     = tid ? "WHERE c.tenant_id=? AND c.created_at BETWEEN ? AND ?" : "WHERE c.created_at BETWEEN ? AND ?";

    const [rows] = await conn.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN c.status='approved' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN c.status='rejected' THEN 1 ELSE 0 END) AS rejected,
         SUM(CASE WHEN a.fraud_score >= 70 THEN 1 ELSE 0 END) AS high_fraud,
         AVG(a.estimated_cost) AS avg_cost,
         SUM(a.estimated_cost) AS total_exposure
       FROM claims c LEFT JOIN ai_assessments a ON a.claim_id=c.id ${wc}`,
      wp
    ) as [Record<string, unknown>[], unknown];

    const s = (rows as Record<string, unknown>[])[0] ?? {};
    const total    = Number(s.total    ?? 0);
    const approved = Number(s.approved ?? 0);
    const rejected = Number(s.rejected ?? 0);
    const highFraud= Number(s.high_fraud ?? 0);
    const approvalRate = total > 0 ? (approved / total * 100).toFixed(1) : "0.0";
    const fraudRate    = total > 0 ? (highFraud / total * 100).toFixed(1) : "0.0";

    const meta: ReportMeta = {
      title: "Insurer Executive Summary",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-EXEC-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "CONFIDENTIAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">Portfolio KPIs</div>
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">Total Claims</div><div class="kv-value bold">${total.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Approval Rate</div><div class="kv-value">${approvalRate}%</div></div>
          <div class="kv-item"><div class="kv-label">Rejection Rate</div><div class="kv-value">${total > 0 ? (rejected / total * 100).toFixed(1) : "0.0"}%</div></div>
          <div class="kv-item"><div class="kv-label">High-Fraud Rate</div><div class="kv-value">${fraudRate}%</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Financial Snapshot</div>
        <div class="kv-grid cols-2">
          <div class="kv-item"><div class="kv-label">Avg Claim Cost (AI Estimate)</div><div class="kv-value">${fmtCurrency(Number(s.avg_cost ?? 0))}</div></div>
          <div class="kv-item"><div class="kv-label">Total Portfolio Exposure</div><div class="kv-value bold">${fmtCurrency(Number(s.total_exposure ?? 0))}</div></div>
        </div>
      </div>`;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

export async function generateClaimsTrendReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const fromTs = (params.fromTs as number) ?? Date.now() - 180 * 24 * 60 * 60 * 1000;
    const toTs   = (params.toTs   as number) ?? Date.now();
    const tid    = tenantId ?? (params.tenantId as string);
    const wp     = tid ? [tid, fromTs, toTs] : [fromTs, toTs];
    const wc     = tid ? "WHERE c.tenant_id=? AND c.created_at BETWEEN ? AND ?" : "WHERE c.created_at BETWEEN ? AND ?";

    const [rows] = await conn.execute(
      `SELECT DATE_FORMAT(FROM_UNIXTIME(c.created_at/1000),'%Y-%m') AS month,
              COUNT(*) AS total,
              SUM(CASE WHEN c.status='approved' THEN 1 ELSE 0 END) AS approved,
              AVG(a.estimated_cost) AS avg_cost
       FROM claims c LEFT JOIN ai_assessments a ON a.claim_id=c.id ${wc}
       GROUP BY month ORDER BY month`,
      wp
    ) as [Record<string, unknown>[], unknown];

    const months = rows as Record<string, unknown>[];

    const tableRows = months.map(m =>
      `<tr><td>${escHtml(String(m.month ?? ""))}</td>
           <td>${Number(m.total ?? 0).toLocaleString()}</td>
           <td>${Number(m.approved ?? 0).toLocaleString()}</td>
           <td>${fmtCurrency(Number(m.avg_cost ?? 0))}</td></tr>`
    ).join("");

    const meta: ReportMeta = {
      title: "Claims Trend Report",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-TREND-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "CONFIDENTIAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">Monthly Claims Volume &amp; Value</div>
        <table>
          <thead><tr><th>Month</th><th>Total Claims</th><th>Approved</th><th>Avg AI Cost</th></tr></thead>
          <tbody>${tableRows || "<tr><td colspan='4'>No data for selected period</td></tr>"}</tbody>
        </table>
      </div>`;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

export async function generateFinancialExposureReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const fromTs = (params.fromTs as number) ?? Date.now() - 90 * 24 * 60 * 60 * 1000;
    const toTs   = (params.toTs   as number) ?? Date.now();
    const tid    = tenantId ?? (params.tenantId as string);
    const wp     = tid ? [tid, fromTs, toTs] : [fromTs, toTs];
    const wc     = tid ? "WHERE c.tenant_id=? AND c.created_at BETWEEN ? AND ?" : "WHERE c.created_at BETWEEN ? AND ?";

    const [rows] = await conn.execute(
      `SELECT
         SUM(CASE WHEN c.status NOT IN ('approved','rejected','settled') THEN a.estimated_cost ELSE 0 END) AS open_exposure,
         SUM(CASE WHEN c.status='approved' THEN a.estimated_cost ELSE 0 END) AS approved_value,
         SUM(CASE WHEN c.status='settled'  THEN a.estimated_cost ELSE 0 END) AS settled_value,
         COUNT(CASE WHEN c.status NOT IN ('approved','rejected','settled') THEN 1 END) AS open_count,
         AVG(a.estimated_cost) AS avg_cost,
         MAX(a.estimated_cost) AS max_cost
       FROM claims c LEFT JOIN ai_assessments a ON a.claim_id=c.id ${wc}`,
      wp
    ) as [Record<string, unknown>[], unknown];

    const s = (rows as Record<string, unknown>[])[0] ?? {};

    const meta: ReportMeta = {
      title: "Financial Exposure Report",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-FINEXP-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "STRICTLY CONFIDENTIAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">Outstanding Exposure</div>
        <div class="kv-grid cols-3">
          <div class="kv-item"><div class="kv-label">Open Claims</div><div class="kv-value bold">${Number(s.open_count ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Open Exposure (AI Estimate)</div><div class="kv-value bold">${fmtCurrency(Number(s.open_exposure ?? 0))}</div></div>
          <div class="kv-item"><div class="kv-label">Avg Claim Cost</div><div class="kv-value">${fmtCurrency(Number(s.avg_cost ?? 0))}</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Settlement Summary</div>
        <div class="kv-grid cols-2">
          <div class="kv-item"><div class="kv-label">Approved Value</div><div class="kv-value">${fmtCurrency(Number(s.approved_value ?? 0))}</div></div>
          <div class="kv-item"><div class="kv-label">Settled Value</div><div class="kv-value">${fmtCurrency(Number(s.settled_value ?? 0))}</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">Exposure values are based on AI estimated costs and should be treated as indicative only. Actual settlement amounts may differ. This report is for internal management use only.</p>
      </div>`;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

export async function generateCrossInsurerFraudReport(
  params: Record<string, unknown>
): Promise<string> {
  const conn = await getConn();
  try {
    const fromTs = (params.fromTs as number) ?? Date.now() - 90 * 24 * 60 * 60 * 1000;
    const toTs   = (params.toTs   as number) ?? Date.now();

    const [rows] = await conn.execute(
      `SELECT c.tenant_id,
              COUNT(*) AS total,
              SUM(CASE WHEN a.fraud_score >= 70 THEN 1 ELSE 0 END) AS high_fraud,
              AVG(a.fraud_score) AS avg_fraud_score
       FROM claims c LEFT JOIN ai_assessments a ON a.claim_id=c.id
       WHERE c.created_at BETWEEN ? AND ?
       GROUP BY c.tenant_id ORDER BY high_fraud DESC LIMIT 20`,
      [fromTs, toTs]
    ) as [Record<string, unknown>[], unknown];

    const tenants = rows as Record<string, unknown>[];
    const tableRows = tenants.map(t =>
      `<tr><td>${escHtml(String(t.tenant_id ?? ""))}</td>
           <td>${Number(t.total ?? 0).toLocaleString()}</td>
           <td>${Number(t.high_fraud ?? 0).toLocaleString()}</td>
           <td>${Number(t.avg_fraud_score ?? 0).toFixed(1)}</td></tr>`
    ).join("");

    const meta: ReportMeta = {
      title: "Cross-Insurer Fraud Intelligence",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)} | Platform Admin Only`,
      reportRef: `RPT-XFRAUD-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      classification: "STRICTLY CONFIDENTIAL — PLATFORM ADMIN ONLY",
    };

    const body = `
      <div class="section">
        <div class="section-title">Fraud Exposure by Insurer Tenant</div>
        <table>
          <thead><tr><th>Tenant ID</th><th>Total Claims</th><th>High-Fraud Claims</th><th>Avg Fraud Score</th></tr></thead>
          <tbody>${tableRows || "<tr><td colspan='4'>No data for selected period</td></tr>"}</tbody>
        </table>
      </div>
      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">This report contains cross-tenant data and is restricted to platform administrators only. Sharing with individual insurer tenants is prohibited.</p>
      </div>`;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

export async function generateMLPerformanceReport(
  params: Record<string, unknown>
): Promise<string> {
  const conn = await getConn();
  try {
    const fromTs = (params.fromTs as number) ?? Date.now() - 90 * 24 * 60 * 60 * 1000;
    const toTs   = (params.toTs   as number) ?? Date.now();

    const [rows] = await conn.execute(
      `SELECT a.model_version,
              COUNT(*) AS total,
              AVG(a.fraud_score) AS avg_fraud_score,
              AVG(a.estimated_cost) AS avg_cost,
              SUM(CASE WHEN a.recommendation='approve' THEN 1 ELSE 0 END) AS approvals,
              SUM(CASE WHEN a.recommendation='reject'  THEN 1 ELSE 0 END) AS rejections
       FROM ai_assessments a
       WHERE a.created_at BETWEEN ? AND ?
       GROUP BY a.model_version ORDER BY a.model_version DESC`,
      [fromTs, toTs]
    ) as [Record<string, unknown>[], unknown];

    const versions = rows as Record<string, unknown>[];
    const tableRows = versions.map(v =>
      `<tr><td>${escHtml(String(v.model_version ?? "unknown"))}</td>
           <td>${Number(v.total ?? 0).toLocaleString()}</td>
           <td>${Number(v.avg_fraud_score ?? 0).toFixed(1)}</td>
           <td>${fmtCurrency(Number(v.avg_cost ?? 0))}</td>
           <td>${Number(v.approvals ?? 0).toLocaleString()}</td>
           <td>${Number(v.rejections ?? 0).toLocaleString()}</td></tr>`
    ).join("");

    const meta: ReportMeta = {
      title: "ML Model Performance Report",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)} | Platform Admin Only`,
      reportRef: `RPT-ML-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      classification: "STRICTLY CONFIDENTIAL — PLATFORM ADMIN ONLY",
    };

    const body = `
      <div class="section">
        <div class="section-title">Model Version Performance</div>
        <table>
          <thead><tr><th>Model Version</th><th>Assessments</th><th>Avg Fraud Score</th><th>Avg Cost Estimate</th><th>Approvals</th><th>Rejections</th></tr></thead>
          <tbody>${tableRows || "<tr><td colspan='6'>No assessment data for selected period</td></tr>"}</tbody>
        </table>
      </div>`;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

export async function generateDataRetentionReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const tid = tenantId ?? (params.tenantId as string);
    const retentionDays = 2 * 365; // 2-year default retention
    const cutoffTs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const wp = tid ? [tid, cutoffTs] : [cutoffTs];
    const wc = tid ? "WHERE c.tenant_id=? AND c.created_at < ?" : "WHERE c.created_at < ?";

    const [rows] = await conn.execute(
      `SELECT COUNT(*) AS due_for_review,
              MIN(c.created_at) AS oldest_record,
              MAX(c.created_at) AS newest_due
       FROM claims c ${wc}`,
      wp
    ) as [Record<string, unknown>[], unknown];

    const s = (rows as Record<string, unknown>[])[0] ?? {};

    const meta: ReportMeta = {
      title: "Data Retention Audit Report",
      subtitle: `Retention threshold: ${retentionDays / 365} years | Generated: ${fmtDate(Date.now())}`,
      reportRef: `RPT-RETENTION-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "CONFIDENTIAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">Retention Summary</div>
        <div class="kv-grid cols-3">
          <div class="kv-item"><div class="kv-label">Records Due for Review</div><div class="kv-value bold">${Number(s.due_for_review ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Oldest Record</div><div class="kv-value">${s.oldest_record ? fmtDate(Number(s.oldest_record)) : "—"}</div></div>
          <div class="kv-item"><div class="kv-label">Newest Due</div><div class="kv-value">${s.newest_due ? fmtDate(Number(s.newest_due)) : "—"}</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Retention Policy</div>
        <table>
          <thead><tr><th>Data Category</th><th>Retention Period</th><th>Legal Basis</th><th>Action Required</th></tr></thead>
          <tbody>
            <tr><td>Claim records</td><td>2 years post-settlement</td><td>POPIA s.14 / CDPA</td><td>Archive or delete after threshold</td></tr>
            <tr><td>KINGA assessment outputs</td><td>2 years</td><td>Legitimate interest</td><td>Archive with claim record</td></tr>
            <tr><td>Audit trail entries</td><td>5 years</td><td>Regulatory compliance</td><td>Retain in read-only archive</td></tr>
            <tr><td>Personal data (PII)</td><td>Minimum necessary</td><td>POPIA s.10</td><td>Anonymise after claim closure</td></tr>
          </tbody>
        </table>
      </div>
      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">This report is indicative only. Formal retention schedules must be approved by the Information Officer and legal counsel before any deletion actions are taken.</p>
      </div>`;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

export async function generateAssessorAssignmentsReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const userId = params.userId as number | undefined;
    const fromTs = (params.fromTs as number) ?? Date.now() - 90 * 24 * 60 * 60 * 1000;
    const toTs   = (params.toTs   as number) ?? Date.now();
    const tid    = tenantId ?? (params.tenantId as string);

    const conditions: string[] = ["ae.created_at BETWEEN ? AND ?"];
    const wp: unknown[] = [fromTs, toTs];
    if (userId) { conditions.push("ae.assessor_id=?"); wp.push(userId); }
    if (tid)    { conditions.push("c.tenant_id=?");    wp.push(tid); }

    const [rows] = await conn.execute(
      `SELECT c.id AS claim_id, c.status, ae.status AS eval_status,
              ae.created_at AS assigned_at, ae.updated_at AS completed_at,
              ae.cost_estimate, ae.recommendation
       FROM assessor_evaluations ae
       JOIN claims c ON c.id=ae.claim_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY ae.created_at DESC LIMIT 100`,
      wp
    ) as [Record<string, unknown>[], unknown];

    const evals = rows as Record<string, unknown>[];
    const tableRows = evals.map(e =>
      `<tr><td>${escHtml(String(e.claim_id ?? ""))}</td>
           <td>${escHtml(String(e.status ?? ""))}</td>
           <td>${escHtml(String(e.eval_status ?? ""))}</td>
           <td>${e.assigned_at ? fmtDate(Number(e.assigned_at)) : "—"}</td>
           <td>${e.completed_at ? fmtDate(Number(e.completed_at)) : "—"}</td>
           <td>${fmtCurrency(Number(e.cost_estimate ?? 0))}</td>
           <td>${escHtml(String(e.recommendation ?? "—"))}</td></tr>`
    ).join("");

    const meta: ReportMeta = {
      title: "My Assessment Assignments",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-ASSESS-ASSIGN-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "INTERNAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">Assignment History (last 100)</div>
        <table>
          <thead><tr><th>Claim ID</th><th>Claim Status</th><th>Eval Status</th><th>Assigned</th><th>Completed</th><th>Cost Estimate</th><th>Recommendation</th></tr></thead>
          <tbody>${tableRows || "<tr><td colspan='7'>No assignments found for selected period</td></tr>"}</tbody>
        </table>
      </div>`;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

export async function generateAssessorPerformanceSummary(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const userId = params.userId as number | undefined;
    const fromTs = (params.fromTs as number) ?? Date.now() - 90 * 24 * 60 * 60 * 1000;
    const toTs   = (params.toTs   as number) ?? Date.now();
    const tid    = tenantId ?? (params.tenantId as string);

    const conditions: string[] = ["ae.created_at BETWEEN ? AND ?"];
    const wp: unknown[] = [fromTs, toTs];
    if (userId) { conditions.push("ae.assessor_id=?"); wp.push(userId); }
    if (tid)    { conditions.push("c.tenant_id=?");    wp.push(tid); }

    const [rows] = await conn.execute(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN ae.status='completed' THEN 1 ELSE 0 END) AS completed,
              AVG(ae.cost_estimate) AS avg_estimate,
              AVG(ae.updated_at - ae.created_at) AS avg_turnaround_ms
       FROM assessor_evaluations ae
       JOIN claims c ON c.id=ae.claim_id
       WHERE ${conditions.join(" AND ")}`,
      wp
    ) as [Record<string, unknown>[], unknown];

    const s = (rows as Record<string, unknown>[])[0] ?? {};
    const total     = Number(s.total     ?? 0);
    const completed = Number(s.completed ?? 0);
    const avgTurnMs = Number(s.avg_turnaround_ms ?? 0);
    const avgTurnDays = (avgTurnMs / 86400000).toFixed(1);

    const meta: ReportMeta = {
      title: "Assessor Performance Summary",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-ASSESS-PERF-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "INTERNAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">Performance Metrics</div>
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">Total Assigned</div><div class="kv-value bold">${total.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Completed</div><div class="kv-value">${completed.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Completion Rate</div><div class="kv-value">${total > 0 ? (completed / total * 100).toFixed(1) : "0.0"}%</div></div>
          <div class="kv-item"><div class="kv-label">Avg Turnaround</div><div class="kv-value">${avgTurnDays} days</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Cost Estimation</div>
        <div class="kv-grid cols-1">
          <div class="kv-item"><div class="kv-label">Avg Cost Estimate</div><div class="kv-value">${fmtCurrency(Number(s.avg_estimate ?? 0))}</div></div>
        </div>
      </div>`;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

export async function generatePanelBeaterQuoteHistoryReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const panelBeaterId = params.panelBeaterId as number | undefined;
    const fromTs = (params.fromTs as number) ?? Date.now() - 90 * 24 * 60 * 60 * 1000;
    const toTs   = (params.toTs   as number) ?? Date.now();
    const tid    = tenantId ?? (params.tenantId as string);

    const conditions: string[] = ["q.created_at BETWEEN ? AND ?"];
    const wp: unknown[] = [fromTs, toTs];
    if (panelBeaterId) { conditions.push("q.panel_beater_id=?"); wp.push(panelBeaterId); }
    if (tid)           { conditions.push("c.tenant_id=?");        wp.push(tid); }

    const [rows] = await conn.execute(
      `SELECT q.id, c.id AS claim_id, q.total_amount, q.status,
              q.created_at, q.ai_benchmark_amount, q.structural_gap_pct
       FROM panel_beater_quotes q
       JOIN claims c ON c.id=q.claim_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY q.created_at DESC LIMIT 100`,
      wp
    ) as [Record<string, unknown>[], unknown];

    const quotes = rows as Record<string, unknown>[];
    const tableRows = quotes.map(q =>
      `<tr><td>${escHtml(String(q.id ?? ""))}</td>
           <td>${escHtml(String(q.claim_id ?? ""))}</td>
           <td>${fmtCurrency(Number(q.total_amount ?? 0))}</td>
           <td>${fmtCurrency(Number(q.ai_benchmark_amount ?? 0))}</td>
           <td>${q.structural_gap_pct != null ? Number(q.structural_gap_pct).toFixed(1) + "%" : "—"}</td>
           <td>${escHtml(String(q.status ?? ""))}</td>
           <td>${q.created_at ? fmtDate(Number(q.created_at)) : "—"}</td></tr>`
    ).join("");

    const meta: ReportMeta = {
      title: "Quote History Report",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-PB-QUOTES-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "INTERNAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">Quote History (last 100)</div>
        <table>
          <thead><tr><th>Quote ID</th><th>Claim ID</th><th>Quoted Amount</th><th>AI Benchmark</th><th>Structural Gap</th><th>Status</th><th>Submitted</th></tr></thead>
          <tbody>${tableRows || "<tr><td colspan='7'>No quotes found for selected period</td></tr>"}</tbody>
        </table>
      </div>`;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

export async function generatePanelBeaterJobCompletionReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const panelBeaterId = params.panelBeaterId as number | undefined;
    const fromTs = (params.fromTs as number) ?? Date.now() - 90 * 24 * 60 * 60 * 1000;
    const toTs   = (params.toTs   as number) ?? Date.now();
    const tid    = tenantId ?? (params.tenantId as string);

    const conditions: string[] = ["q.created_at BETWEEN ? AND ?", "q.status='accepted'"];
    const wp: unknown[] = [fromTs, toTs];
    if (panelBeaterId) { conditions.push("q.panel_beater_id=?"); wp.push(panelBeaterId); }
    if (tid)           { conditions.push("c.tenant_id=?");        wp.push(tid); }

    const [rows] = await conn.execute(
      `SELECT COUNT(*) AS total_jobs,
              AVG(q.total_amount) AS avg_job_value,
              SUM(q.total_amount) AS total_value,
              AVG(q.structural_gap_pct) AS avg_gap
       FROM panel_beater_quotes q
       JOIN claims c ON c.id=q.claim_id
       WHERE ${conditions.join(" AND ")}`,
      wp
    ) as [Record<string, unknown>[], unknown];

    const s = (rows as Record<string, unknown>[])[0] ?? {};

    const meta: ReportMeta = {
      title: "Job Completion Report",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-PB-JOBS-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "INTERNAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">Completed Jobs Summary</div>
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">Total Jobs</div><div class="kv-value bold">${Number(s.total_jobs ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Total Value</div><div class="kv-value">${fmtCurrency(Number(s.total_value ?? 0))}</div></div>
          <div class="kv-item"><div class="kv-label">Avg Job Value</div><div class="kv-value">${fmtCurrency(Number(s.avg_job_value ?? 0))}</div></div>
          <div class="kv-item"><div class="kv-label">Avg Structural Gap</div><div class="kv-value">${Number(s.avg_gap ?? 0).toFixed(1)}%</div></div>
        </div>
      </div>`;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

// ─── Recovery Reports ─────────────────────────────────────────────────────────

async function generateRecoveryCaseSummaryReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const tid = tenantId ?? (params.tenantId as string) ?? "Unknown";
    const fromTs = params.from ? new Date(params.from as string).toISOString() : new Date(Date.now() - 90 * 86400000).toISOString();
    const toTs = params.to ? new Date(params.to as string).toISOString() : new Date().toISOString();

    const [rows] = await conn.execute(
      `SELECT
         COUNT(*) AS total_cases,
         SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_cases,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status = 'recovered' THEN 1 ELSE 0 END) AS recovered,
         SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed,
         SUM(potential_recovery_amount) / 100 AS total_potential,
         SUM(CASE WHEN status = 'recovered' THEN recovered_amount ELSE 0 END) / 100 AS total_recovered
       FROM recovery_cases
       WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`,
      [tid, fromTs, toTs]
    ) as [Record<string, unknown>[], unknown];
    const s = (rows as Record<string, unknown>[])[0] ?? {};

    const [caseRows] = await conn.execute(
      `SELECT rc.id, rc.case_reference, rc.status, rc.recovery_type,
              rc.potential_recovery_amount / 100 AS potential, rc.created_at,
              c.claim_reference, c.vehicle_registration
       FROM recovery_cases rc
       LEFT JOIN claims c ON rc.claim_id = c.id
       WHERE rc.tenant_id = ? AND rc.created_at BETWEEN ? AND ?
       ORDER BY rc.created_at DESC LIMIT 50`,
      [tid, fromTs, toTs]
    ) as [Record<string, unknown>[], unknown];
    const cases = caseRows as Record<string, unknown>[];

    const meta: ReportMeta = {
      title: "Recovery Case Summary",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-REC-CASES-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "CONFIDENTIAL",
    };

    const recoveryRate = Number(s.total_potential ?? 0) > 0
      ? ((Number(s.total_recovered ?? 0) / Number(s.total_potential ?? 0)) * 100).toFixed(1)
      : "0.0";

    const caseTableRows = cases.map((c: any) => `
      <tr>
        <td>${escHtml(String(c.case_reference ?? "—"))}</td>
        <td>${escHtml(String(c.claim_reference ?? "—"))}</td>
        <td>${escHtml(String(c.vehicle_registration ?? "—"))}</td>
        <td>${escHtml(String(c.recovery_type ?? "—").replace(/_/g, " ").toUpperCase())}</td>
        <td>${fmtCurrency(Number(c.potential ?? 0))}</td>
        <td>${riskBadge(c.status === "recovered" ? "low" : c.status === "open" ? "medium" : "low")}</td>
        <td>${fmtDate(c.created_at as number)}</td>
      </tr>`).join("");

    const body = `
      <div class="section">
        <div class="section-title">Portfolio Overview</div>
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">Total Cases</div><div class="kv-value bold">${Number(s.total_cases ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Open</div><div class="kv-value">${Number(s.open_cases ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">In Progress</div><div class="kv-value">${Number(s.in_progress ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Recovered</div><div class="kv-value">${Number(s.recovered ?? 0).toLocaleString()}</div></div>
        </div>
        <div class="kv-grid cols-3" style="margin-top:12px">
          <div class="kv-item"><div class="kv-label">Total Potential</div><div class="kv-value bold">${fmtCurrency(Number(s.total_potential ?? 0))}</div></div>
          <div class="kv-item"><div class="kv-label">Total Recovered</div><div class="kv-value bold">${fmtCurrency(Number(s.total_recovered ?? 0))}</div></div>
          <div class="kv-item"><div class="kv-label">Recovery Rate</div><div class="kv-value bold">${recoveryRate}%</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Case Register (Last 50)</div>
        <table class="data-table">
          <thead><tr>
            <th>Case Ref</th><th>Claim Ref</th><th>Vehicle</th><th>Type</th><th>Potential</th><th>Status</th><th>Opened</th>
          </tr></thead>
          <tbody>${caseTableRows || '<tr><td colspan="7" style="text-align:center;color:#888">No cases in period</td></tr>'}</tbody>
        </table>
      </div>`;
    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

async function generateRecoveryPerformanceReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const tid = tenantId ?? (params.tenantId as string) ?? "Unknown";
    const fromTs = params.from ? new Date(params.from as string).toISOString() : new Date(Date.now() - 90 * 86400000).toISOString();
    const toTs = params.to ? new Date(params.to as string).toISOString() : new Date().toISOString();

    const [rows] = await conn.execute(
      `SELECT
         COUNT(*) AS total_cases,
         SUM(CASE WHEN status = 'recovered' THEN 1 ELSE 0 END) AS recovered_count,
         SUM(potential_recovery_amount) / 100 AS total_potential,
         SUM(CASE WHEN status = 'recovered' THEN recovered_amount ELSE 0 END) / 100 AS total_recovered,
         AVG(CASE WHEN status = 'recovered' AND closed_at IS NOT NULL
           THEN TIMESTAMPDIFF(DAY, created_at, closed_at) ELSE NULL END) AS avg_days_to_recover,
         SUM(CASE WHEN recovery_type = 'subrogation' THEN 1 ELSE 0 END) AS subrogation_count,
         SUM(CASE WHEN recovery_type = 'third_party' THEN 1 ELSE 0 END) AS third_party_count,
         SUM(CASE WHEN recovery_type = 'excess' THEN 1 ELSE 0 END) AS excess_count
       FROM recovery_cases
       WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`,
      [tid, fromTs, toTs]
    ) as [Record<string, unknown>[], unknown];
    const s = (rows as Record<string, unknown>[])[0] ?? {};

    const meta: ReportMeta = {
      title: "Recovery Performance Report",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-REC-PERF-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "CONFIDENTIAL",
    };

    const recoveryRate = Number(s.total_potential ?? 0) > 0
      ? ((Number(s.total_recovered ?? 0) / Number(s.total_potential ?? 0)) * 100).toFixed(1)
      : "0.0";
    const successRate = Number(s.total_cases ?? 0) > 0
      ? ((Number(s.recovered_count ?? 0) / Number(s.total_cases ?? 0)) * 100).toFixed(1)
      : "0.0";

    const body = `
      <div class="section">
        <div class="section-title">Performance Summary</div>
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">Total Cases</div><div class="kv-value bold">${Number(s.total_cases ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Recovered</div><div class="kv-value bold">${Number(s.recovered_count ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Success Rate</div><div class="kv-value bold">${successRate}%</div></div>
          <div class="kv-item"><div class="kv-label">Avg Days to Recover</div><div class="kv-value bold">${Number(s.avg_days_to_recover ?? 0).toFixed(1)}d</div></div>
        </div>
        <div class="kv-grid cols-3" style="margin-top:12px">
          <div class="kv-item"><div class="kv-label">Total Potential</div><div class="kv-value bold">${fmtCurrency(Number(s.total_potential ?? 0))}</div></div>
          <div class="kv-item"><div class="kv-label">Total Recovered</div><div class="kv-value bold">${fmtCurrency(Number(s.total_recovered ?? 0))}</div></div>
          <div class="kv-item"><div class="kv-label">Recovery Rate</div><div class="kv-value bold">${recoveryRate}%</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Recovery Type Breakdown</div>
        <div class="kv-grid cols-3">
          <div class="kv-item"><div class="kv-label">Subrogation Cases</div><div class="kv-value">${Number(s.subrogation_count ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Third-Party Cases</div><div class="kv-value">${Number(s.third_party_count ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Excess Recovery Cases</div><div class="kv-value">${Number(s.excess_count ?? 0).toLocaleString()}</div></div>
        </div>
      </div>`;
    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

async function generateRecoveryThirdPartyProfilesReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const conn = await getConn();
  try {
    const tid = tenantId ?? (params.tenantId as string) ?? "Unknown";
    const fromTs = params.from ? new Date(params.from as string).toISOString() : new Date(Date.now() - 90 * 86400000).toISOString();
    const toTs = params.to ? new Date(params.to as string).toISOString() : new Date().toISOString();

    const [rows] = await conn.execute(
      `SELECT
         tp.insurer_name,
         COUNT(rc.id) AS case_count,
         SUM(rc.potential_recovery_amount) / 100 AS total_potential,
         SUM(CASE WHEN rc.status = 'recovered' THEN rc.recovered_amount ELSE 0 END) / 100 AS total_recovered,
         AVG(tp.cooperation_score) AS avg_cooperation,
         MAX(rc.created_at) AS last_case_date
       FROM recovery_cases rc
       LEFT JOIN third_party_insurers tp ON rc.third_party_insurer_id = tp.id
       WHERE rc.tenant_id = ? AND rc.created_at BETWEEN ? AND ?
         AND tp.insurer_name IS NOT NULL
       GROUP BY tp.insurer_name
       ORDER BY total_potential DESC LIMIT 20`,
      [tid, fromTs, toTs]
    ) as [Record<string, unknown>[], unknown];
    const profiles = rows as Record<string, unknown>[];

    const meta: ReportMeta = {
      title: "Third-Party Insurer Profiles",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-REC-TP-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "CONFIDENTIAL",
    };

    const tableRows = profiles.map((p: any) => `
      <tr>
        <td>${escHtml(String(p.insurer_name ?? "Unknown"))}</td>
        <td>${Number(p.case_count ?? 0).toLocaleString()}</td>
        <td>${fmtCurrency(Number(p.total_potential ?? 0))}</td>
        <td>${fmtCurrency(Number(p.total_recovered ?? 0))}</td>
        <td>${Number(p.avg_cooperation ?? 0).toFixed(1)}/10</td>
        <td>${p.last_case_date ? fmtDate(p.last_case_date as number) : "—"}</td>
      </tr>`).join("");

    const body = `
      <div class="section">
        <div class="section-title">Third-Party Insurer Intelligence (Top 20 by Potential)</div>
        <table class="data-table">
          <thead><tr>
            <th>Insurer</th><th>Cases</th><th>Total Potential</th><th>Recovered</th><th>Cooperation Score</th><th>Last Case</th>
          </tr></thead>
          <tbody>${tableRows || '<tr><td colspan="6" style="text-align:center;color:#888">No third-party data in period</td></tr>'}</tbody>
        </table>
      </div>`;
    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Executive Full Report  (v2 — 7-section AI-narrated document)
// ─────────────────────────────────────────────────────────────────────────────
export async function generateExecutiveFullReport(
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const { invokeLLM } = await import("../_core/llm");
  const conn = await getConn();
  try {
    const fromTs = (params.fromTs as number) ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
    const toTs   = (params.toTs   as number) ?? Date.now();
    const tid    = tenantId ?? (params.tenantId as string);
    const wc     = tid ? "AND c.tenant_id=?" : "";
    const wp     = (base: unknown[]) => (tid ? [tid, ...base] : base) as unknown[];

    // ── Section 1: Portfolio KPIs ──────────────────────────────────────────
    const [kpiRows] = await conn.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN c.status='approved'   THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN c.status='rejected'   THEN 1 ELSE 0 END) AS rejected,
         SUM(CASE WHEN c.status='escalated'  THEN 1 ELSE 0 END) AS escalated,
         SUM(CASE WHEN c.status IN ('submitted','under_review','pending') THEN 1 ELSE 0 END) AS open,
         SUM(CASE WHEN a.fraud_score >= 70   THEN 1 ELSE 0 END) AS high_fraud,
         SUM(CASE WHEN a.fraud_score BETWEEN 40 AND 69 THEN 1 ELSE 0 END) AS med_fraud,
         AVG(a.estimated_cost)  AS avg_est_cost,
         SUM(a.estimated_cost)  AS total_est_cost,
         SUM(c.approved_amount) AS total_approved,
         AVG(CASE WHEN c.status='approved' THEN (c.updated_at - c.created_at)/86400000.0 END) AS avg_cycle_days
       FROM claims c LEFT JOIN ai_assessments a ON a.claim_id = c.id
       WHERE c.created_at BETWEEN ? AND ? ${wc}`,
      wp([fromTs, toTs])
    ) as [Record<string, unknown>[], unknown];
    const k = (kpiRows as Record<string, unknown>[])[0] ?? {};
    const total         = Number(k.total        ?? 0);
    const approved      = Number(k.approved     ?? 0);
    const rejected      = Number(k.rejected     ?? 0);
    const escalated     = Number(k.escalated    ?? 0);
    const open          = Number(k.open         ?? 0);
    const highFraud     = Number(k.high_fraud   ?? 0);
    const medFraud      = Number(k.med_fraud    ?? 0);
    const avgEstCost    = Number(k.avg_est_cost  ?? 0);
    const totalApproved = Number(k.total_approved ?? 0);
    const avgCycleDays  = Number(k.avg_cycle_days ?? 0);
    const approvalRate  = total > 0 ? (approved / total * 100).toFixed(1) : "0.0";
    const fraudRate     = total > 0 ? (highFraud / total * 100).toFixed(1) : "0.0";

    // ── Section 2: Savings & Financial Impact ─────────────────────────────
    const [savRows] = await conn.execute(
      `SELECT
         SUM(CASE WHEN c.status='approved' AND a.estimated_cost > 0
               THEN a.estimated_cost - c.approved_amount ELSE 0 END) AS savings,
         SUM(CASE WHEN c.status='rejected' AND a.fraud_score >= 70
               THEN a.estimated_cost ELSE 0 END) AS fraud_prevented,
         SUM(c.reserve_amount)  AS total_reserves,
         SUM(CASE WHEN c.status='approved' THEN c.approved_amount ELSE 0 END) AS total_payouts
       FROM claims c LEFT JOIN ai_assessments a ON a.claim_id = c.id
       WHERE c.created_at BETWEEN ? AND ? ${wc}`,
      wp([fromTs, toTs])
    ) as [Record<string, unknown>[], unknown];
    const sv = (savRows as Record<string, unknown>[])[0] ?? {};
    const savings        = Math.max(0, Number(sv.savings         ?? 0));
    const fraudPrevented = Number(sv.fraud_prevented ?? 0);
    const totalReserves  = Number(sv.total_reserves  ?? 0);
    const totalPayouts   = Number(sv.total_payouts   ?? 0);
    const netExposure    = Math.max(0, totalReserves - totalPayouts);
    const leakage        = totalApproved > 0 && totalApproved > (totalPayouts * 0.95) ? totalApproved - totalPayouts : 0;

    // ── Section 3: Fraud Intelligence ────────────────────────────────────
    const [fraudRows] = await conn.execute(
      `SELECT AVG(a.fraud_score) AS avg_fraud_score,
              SUM(CASE WHEN a.fraud_score >= 70 THEN a.estimated_cost ELSE 0 END) AS fraud_exposure
       FROM claims c LEFT JOIN ai_assessments a ON a.claim_id = c.id
       WHERE c.created_at BETWEEN ? AND ? ${wc}`,
      wp([fromTs, toTs])
    ) as [Record<string, unknown>[], unknown];
    const fr = (fraudRows as Record<string, unknown>[])[0] ?? {};
    const avgFraudScore = Number(fr.avg_fraud_score ?? 0).toFixed(1);
    const fraudExposure = Number(fr.fraud_exposure  ?? 0);

    // ── Section 4: Operational Performance ───────────────────────────────
    const [opRows] = await conn.execute(
      `SELECT
         SUM(CASE WHEN c.status IN ('submitted','under_review') AND c.created_at < ? THEN 1 ELSE 0 END) AS aged_30,
         SUM(CASE WHEN c.status IN ('submitted','under_review') AND c.created_at < ? THEN 1 ELSE 0 END) AS aged_60,
         COUNT(DISTINCT c.assigned_to) AS active_handlers
       FROM claims c WHERE c.created_at BETWEEN ? AND ? ${wc}`,
      wp([Date.now() - 30*24*60*60*1000, Date.now() - 60*24*60*60*1000, fromTs, toTs])
    ) as [Record<string, unknown>[], unknown];
    const op = (opRows as Record<string, unknown>[])[0] ?? {};
    const aged30         = Number(op.aged_30         ?? 0);
    const aged60         = Number(op.aged_60         ?? 0);
    const activeHandlers = Number(op.active_handlers ?? 0);

    // ── Section 5: Recovery Pipeline ─────────────────────────────────────
    const [recRows] = await conn.execute(
      `SELECT COUNT(*) AS total_cases,
              SUM(CASE WHEN status='recovered' THEN 1 ELSE 0 END) AS recovered,
              SUM(CASE WHEN status='recovered' THEN recovered_amount ELSE 0 END) AS total_recovered,
              SUM(potential_recovery_amount) AS total_potential
       FROM recovery_cases WHERE created_at BETWEEN ? AND ?${tid ? " AND tenant_id=?" : ""}`,
      tid ? [fromTs, toTs, tid] : [fromTs, toTs]
    ) as [Record<string, unknown>[], unknown];
    const rc = (recRows as Record<string, unknown>[])[0] ?? {};
    const recTotal     = Number(rc.total_cases    ?? 0);
    const recRecovered = Number(rc.recovered      ?? 0);
    const recAmount    = Number(rc.total_recovered ?? 0);
    const recPotential = Number(rc.total_potential ?? 0);
    const recRate      = recTotal > 0 ? (recRecovered / recTotal * 100).toFixed(1) : "0.0";

    // ── Section 6: Top Assessors ──────────────────────────────────────────
    const [assessorRows] = await conn.execute(
      `SELECT u.name, COUNT(c.id) AS claim_count, AVG(a.fraud_score) AS avg_fraud
       FROM claims c JOIN users u ON u.id = c.assigned_to
       LEFT JOIN ai_assessments a ON a.claim_id = c.id
       WHERE c.created_at BETWEEN ? AND ? ${wc}
       GROUP BY u.id, u.name ORDER BY claim_count DESC LIMIT 5`,
      wp([fromTs, toTs])
    ) as [Record<string, unknown>[], unknown];
    const assessors = assessorRows as Record<string, unknown>[];

    // ── AI Narrative (parallel) ───────────────────────────────────────────
    const kpiCtx = `Portfolio: ${total} claims, ${approvalRate}% approval, ${fraudRate}% high-fraud rate, avg cycle ${avgCycleDays.toFixed(1)} days, ${open} open claims.`;
    const finCtx = `Savings: ${fmtCurrency(savings)}, fraud prevented: ${fmtCurrency(fraudPrevented)}, leakage: ${fmtCurrency(leakage)}, net exposure: ${fmtCurrency(netExposure)}.`;
    const frdCtx = `Avg fraud score: ${avgFraudScore}/100, ${highFraud} high-risk claims, fraud exposure: ${fmtCurrency(fraudExposure)}.`;
    const opCtx  = `${aged30} claims aged 30+ days, ${aged60} aged 60+ days, ${activeHandlers} active handlers, avg cycle: ${avgCycleDays.toFixed(1)} days.`;
    const recCtx = `${recTotal} recovery cases, ${recRate}% recovery rate, ${fmtCurrency(recAmount)} recovered of ${fmtCurrency(recPotential)} potential.`;
    const sysPrompt = "You are a senior insurance analytics expert writing a concise, professional executive report narrative. Write 2-3 sentences only. Be specific and data-driven. Do not use bullet points.";

    const [kpiNarr, finNarr, frdNarr, opNarr, recNarr, actionNarr] = await Promise.all([
      invokeLLM({ messages: [{ role: "system", content: sysPrompt }, { role: "user", content: `Write a portfolio performance narrative. Data: ${kpiCtx}` }] }).then(r => String(r.choices[0]?.message?.content ?? "")),
      invokeLLM({ messages: [{ role: "system", content: sysPrompt }, { role: "user", content: `Write a financial impact narrative. Data: ${finCtx}` }] }).then(r => String(r.choices[0]?.message?.content ?? "")),
      invokeLLM({ messages: [{ role: "system", content: sysPrompt }, { role: "user", content: `Write a fraud intelligence narrative. Data: ${frdCtx}` }] }).then(r => String(r.choices[0]?.message?.content ?? "")),
      invokeLLM({ messages: [{ role: "system", content: sysPrompt }, { role: "user", content: `Write an operational performance narrative. Data: ${opCtx}` }] }).then(r => String(r.choices[0]?.message?.content ?? "")),
      invokeLLM({ messages: [{ role: "system", content: sysPrompt }, { role: "user", content: `Write a recoveries pipeline narrative. Data: ${recCtx}` }] }).then(r => String(r.choices[0]?.message?.content ?? "")),
      invokeLLM({ messages: [
        { role: "system", content: "You are a senior insurance operations advisor. Based on the portfolio data, identify 3-5 specific, actionable recommendations. Format each as: ACTION: [title] | OWNER: [role] | IMPACT: [financial or operational impact] | TIMELINE: [immediate/30 days/60 days]." },
        { role: "user", content: `Portfolio data: ${kpiCtx} ${finCtx} ${frdCtx} ${opCtx} ${recCtx}` }
      ]}).then(r => String(r.choices[0]?.message?.content ?? "")),
    ]);

    // ── Build HTML ────────────────────────────────────────────────────────
    const meta: ReportMeta = {
      title: "Executive Intelligence Report",
      subtitle: `Period: ${fmtDate(fromTs)} — ${fmtDate(toTs)}`,
      reportRef: `RPT-EXEC-FULL-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: tid,
      classification: "CONFIDENTIAL — EXECUTIVE DISTRIBUTION ONLY",
    };

    const assessorTableRows = assessors.length > 0
      ? assessors.map(a => `<tr><td>${escHtml(String(a.name ?? "—"))}</td><td class="text-right">${Number(a.claim_count ?? 0)}</td><td class="text-right">${Number(a.avg_fraud ?? 0).toFixed(0)}</td></tr>`).join("")
      : `<tr><td colspan="3" style="text-align:center;color:#888">No assessor data for period</td></tr>`;

    const actionHtml = escHtml(actionNarr)
      .replace(/ACTION:/g, "<strong>ACTION:</strong>")
      .replace(/OWNER:/g, "<strong>OWNER:</strong>")
      .replace(/IMPACT:/g, "<strong>IMPACT:</strong>")
      .replace(/TIMELINE:/g, "<strong>TIMELINE:</strong>")
      .replace(/\n/g, "<br/>");

    const body = `
      <div class="section">
        <div class="section-title">1. Portfolio Performance</div>
        <p class="narrative">${escHtml(kpiNarr)}</p>
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">Total Claims</div><div class="kv-value bold">${total.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Approval Rate</div><div class="kv-value">${approvalRate}%</div></div>
          <div class="kv-item"><div class="kv-label">Open Claims</div><div class="kv-value">${open.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Avg Cycle Time</div><div class="kv-value">${avgCycleDays.toFixed(1)} days</div></div>
        </div>
        <div class="kv-grid cols-3">
          <div class="kv-item"><div class="kv-label">Approved</div><div class="kv-value">${approved.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Rejected</div><div class="kv-value">${rejected.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Escalated</div><div class="kv-value">${escalated.toLocaleString()}</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">2. Financial Impact</div>
        <p class="narrative">${escHtml(finNarr)}</p>
        <div class="kv-grid cols-3">
          <div class="kv-item highlight-green"><div class="kv-label">KINGA Savings</div><div class="kv-value bold">${fmtCurrency(savings)}</div></div>
          <div class="kv-item highlight-green"><div class="kv-label">Fraud Prevented</div><div class="kv-value bold">${fmtCurrency(fraudPrevented)}</div></div>
          <div class="kv-item highlight-amber"><div class="kv-label">Leakage</div><div class="kv-value bold">${fmtCurrency(leakage)}</div></div>
        </div>
        <div class="kv-grid cols-3">
          <div class="kv-item"><div class="kv-label">Total Payouts</div><div class="kv-value">${fmtCurrency(totalPayouts)}</div></div>
          <div class="kv-item"><div class="kv-label">Total Reserves</div><div class="kv-value">${fmtCurrency(totalReserves)}</div></div>
          <div class="kv-item"><div class="kv-label">Net Exposure</div><div class="kv-value">${fmtCurrency(netExposure)}</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">3. Fraud Intelligence</div>
        <p class="narrative">${escHtml(frdNarr)}</p>
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">High-Risk Claims</div><div class="kv-value bold">${highFraud.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Fraud Rate</div><div class="kv-value">${fraudRate}%</div></div>
          <div class="kv-item"><div class="kv-label">Avg Fraud Score</div><div class="kv-value">${avgFraudScore}/100</div></div>
          <div class="kv-item highlight-red"><div class="kv-label">Fraud Exposure</div><div class="kv-value bold">${fmtCurrency(fraudExposure)}</div></div>
        </div>
        <div class="kv-grid cols-2">
          <div class="kv-item"><div class="kv-label">Medium-Risk Claims</div><div class="kv-value">${medFraud.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Avg Estimated Cost</div><div class="kv-value">${fmtCurrency(avgEstCost)}</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">4. Operational Performance</div>
        <p class="narrative">${escHtml(opNarr)}</p>
        <div class="kv-grid cols-3">
          <div class="kv-item ${aged30 > 10 ? "highlight-amber" : ""}"><div class="kv-label">Claims Aged 30+ Days</div><div class="kv-value bold">${aged30.toLocaleString()}</div></div>
          <div class="kv-item ${aged60 > 5 ? "highlight-red" : ""}"><div class="kv-label">Claims Aged 60+ Days</div><div class="kv-value bold">${aged60.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Active Handlers</div><div class="kv-value">${activeHandlers.toLocaleString()}</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">5. Recovery Pipeline</div>
        <p class="narrative">${escHtml(recNarr)}</p>
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">Total Cases</div><div class="kv-value bold">${recTotal.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Recovery Rate</div><div class="kv-value">${recRate}%</div></div>
          <div class="kv-item highlight-green"><div class="kv-label">Amount Recovered</div><div class="kv-value bold">${fmtCurrency(recAmount)}</div></div>
          <div class="kv-item"><div class="kv-label">Potential Pipeline</div><div class="kv-value">${fmtCurrency(recPotential)}</div></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">6. Top Assessors by Volume</div>
        <table class="data-table">
          <thead><tr><th>Assessor</th><th class="text-right">Claims</th><th class="text-right">Avg Fraud Score</th></tr></thead>
          <tbody>${assessorTableRows}</tbody>
        </table>
      </div>
      <div class="section">
        <div class="section-title">7. Executive Action Register</div>
        <div class="narrative" style="line-height:1.8;">${actionHtml}</div>
      </div>`;

    return buildBaseHtml(meta, body);
  } finally {
    await conn.end();
  }
}
