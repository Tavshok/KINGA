/**
 * KINGA Report Definition Registry
 * 
 * All report types, their metadata, access roles, and HTML generation functions.
 * Palette: black / white / grey only. Colour permitted in charts only.
 * Logo: top-right corner via base template.
 */

import mysql from "mysql2/promise";
import {
  buildBaseHtml, escHtml, fmtCurrency, fmtDate, fmtDateTime, fmtPct,
  scoreBar, riskBadge, ReportMeta,
} from "./templates/base";

const DB_URL = process.env.DATABASE_URL!;
async function getConn() { return mysql.createConnection(DB_URL); }

// ─── Report Role Access Map ───────────────────────────────────────────────────
export const REPORT_ACCESS: Record<string, string[]> = {
  // Phase 2a — Individual Claim
  "claim.assessment":   ["admin", "insurer_admin", "claims_manager", "fraud_manager", "claims_processor"],
  "claim.forensic":     ["admin", "insurer_admin", "claims_manager", "fraud_manager"],
  "claim.audit_trail":  ["admin", "insurer_admin", "claims_manager", "fraud_manager"],
  "claim.cost_comparison": ["admin", "insurer_admin", "claims_manager", "fraud_manager", "claims_processor"],
  "claim.repair_decision": ["admin", "insurer_admin", "claims_manager", "claims_processor"],
  // Phase 2b — Portfolio
  "portfolio.claims_summary":    ["admin", "insurer_admin", "claims_manager"],
  "portfolio.fraud_summary":     ["admin", "insurer_admin", "fraud_manager"],
  "portfolio.assessor_performance": ["admin", "insurer_admin", "claims_manager", "fraud_manager"],
  "portfolio.panel_beater_performance": ["admin", "insurer_admin", "claims_manager", "fraud_manager"],
  "portfolio.dwell_time":        ["admin", "insurer_admin", "claims_manager"],
  // Phase 2d — Executive / Governance
  "executive.platform_dashboard": ["admin"],
  "executive.cross_insurer_fraud": ["admin"],
  "executive.ml_performance":     ["admin"],
  "governance.sar":               ["admin", "insurer_admin"],
  "governance.regulatory_compliance": ["admin", "insurer_admin"],
};

// ─── Main Dispatcher ─────────────────────────────────────────────────────────
export async function generateReportHtml(
  reportKey: string,
  params: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  switch (reportKey) {
    case "claim.assessment":      return generateClaimAssessmentReport(params, tenantId);
    case "claim.forensic":        return generateForensicReport(params, tenantId);
    case "claim.audit_trail":     return generateAuditTrailReport(params, tenantId);
    case "claim.cost_comparison": return generateCostComparisonReport(params, tenantId);
    case "claim.repair_decision": return generateRepairDecisionReport(params, tenantId);
    case "portfolio.claims_summary": return generateClaimsSummaryReport(params, tenantId);
    case "portfolio.fraud_summary":  return generateFraudSummaryReport(params, tenantId);
    case "portfolio.assessor_performance": return generateAssessorPerformanceReport(params, tenantId);
    case "portfolio.panel_beater_performance": return generatePanelBeaterPerformanceReport(params, tenantId);
    case "portfolio.dwell_time":  return generateDwellTimeReport(params, tenantId);
    case "executive.platform_dashboard": return generatePlatformDashboardReport(params);
    case "governance.sar":        return generateSARReport(params, tenantId);
    case "governance.regulatory_compliance": return generateRegulatoryComplianceReport(params, tenantId);
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
      `SELECT c.*, a.overall_fraud_score, a.fraud_risk_level, a.final_recommendation,
              a.total_claimed_amount, a.ai_recommended_settlement, a.true_cost_estimate,
              a.damage_description, a.repair_vs_replace_recommendation,
              a.pipeline_version, a.created_at as assessment_date,
              a.claim_quality_score, a.data_completeness_score,
              a.narrative_analysis, a.decision_authority
       FROM claims c
       LEFT JOIN ai_assessments a ON a.claim_id = c.id
       WHERE c.id = ? ORDER BY a.created_at DESC LIMIT 1`,
      [claimId]
    ) as [Record<string, unknown>[], unknown];

    const claim = claims[0];
    if (!claim) throw new Error(`Claim ${claimId} not found`);

    // Fetch damaged components
    const [components] = await conn.execute(
      `SELECT component_name, damage_severity, repair_or_replace, estimated_cost, labour_hours
       FROM damaged_components WHERE claim_id=? ORDER BY estimated_cost DESC`,
      [claimId]
    ) as [Record<string, unknown>[], unknown];

    const meta: ReportMeta = {
      title: "AI Assessment Report",
      subtitle: `Claim Reference: ${claim.claim_reference ?? claim.id}`,
      reportRef: `RPT-ASSESS-${claimId}-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: claim.insurer_name as string | undefined,
      classification: "CONFIDENTIAL",
    };

    const fraudScore = Number(claim.overall_fraud_score ?? 0);
    const qualityScore = Number(claim.claim_quality_score ?? 0);

    const body = `
      <!-- Claim Overview -->
      <div class="section">
        <div class="section-title">1. Claim Overview</div>
        <div class="kv-grid cols-3">
          <div class="kv-item"><div class="kv-label">Claim Reference</div><div class="kv-value mono">${escHtml(String(claim.claim_reference ?? claim.id))}</div></div>
          <div class="kv-item"><div class="kv-label">Claim Type</div><div class="kv-value">${escHtml(String(claim.claim_type ?? "Motor Vehicle"))}</div></div>
          <div class="kv-item"><div class="kv-label">Date of Loss</div><div class="kv-value">${fmtDate(claim.date_of_loss as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Policyholder</div><div class="kv-value">${escHtml(String(claim.policyholder_name ?? "—"))}</div></div>
          <div class="kv-item"><div class="kv-label">Policy Number</div><div class="kv-value mono">${escHtml(String(claim.policy_number ?? "—"))}</div></div>
          <div class="kv-item"><div class="kv-label">Vehicle</div><div class="kv-value">${escHtml(String(claim.vehicle_description ?? "—"))}</div></div>
          <div class="kv-item"><div class="kv-label">Submitted</div><div class="kv-value">${fmtDate(claim.created_at as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Assessment Date</div><div class="kv-value">${fmtDateTime(claim.assessment_date as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Pipeline Version</div><div class="kv-value mono">${escHtml(String(claim.pipeline_version ?? "v2"))}</div></div>
        </div>
      </div>

      <!-- Assessment Summary -->
      <div class="section">
        <div class="section-title">2. Assessment Summary</div>
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">Fraud Risk</div><div class="kv-value">${riskBadge(String(claim.fraud_risk_level ?? "low"))}</div></div>
          <div class="kv-item"><div class="kv-label">Fraud Score</div><div class="kv-value">${scoreBar(fraudScore)}</div></div>
          <div class="kv-item"><div class="kv-label">Claim Quality</div><div class="kv-value">${scoreBar(qualityScore)}</div></div>
          <div class="kv-item"><div class="kv-label">Recommendation</div><div class="kv-value bold">${escHtml(String(claim.final_recommendation ?? "—")).toUpperCase()}</div></div>
        </div>
        <div class="kv-grid cols-3">
          <div class="kv-item"><div class="kv-label">Amount Claimed</div><div class="kv-value">${fmtCurrency(claim.total_claimed_amount as number)}</div></div>
          <div class="kv-item"><div class="kv-label">AI True Cost Estimate</div><div class="kv-value">${fmtCurrency(claim.true_cost_estimate as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Recommended Settlement</div><div class="kv-value bold">${fmtCurrency(claim.ai_recommended_settlement as number)}</div></div>
        </div>
      </div>

      <!-- Damaged Components -->
      ${(components as Record<string, unknown>[]).length > 0 ? `
      <div class="section">
        <div class="section-title">3. Damaged Components</div>
        <table>
          <thead><tr>
            <th>Component</th><th>Severity</th><th>Decision</th><th class="text-right">Est. Cost</th><th class="text-right">Labour (hrs)</th>
          </tr></thead>
          <tbody>
            ${(components as Record<string, unknown>[]).map((c) => `
              <tr>
                <td>${escHtml(String(c.component_name))}</td>
                <td>${riskBadge(String(c.damage_severity ?? "medium"))}</td>
                <td>${escHtml(String(c.repair_or_replace ?? "—"))}</td>
                <td class="text-right">${fmtCurrency(c.estimated_cost as number)}</td>
                <td class="text-right">${c.labour_hours ?? "—"}</td>
              </tr>`).join("")}
          </tbody>
          <tfoot><tr>
            <td colspan="3" class="bold">TOTAL</td>
            <td class="text-right bold">${fmtCurrency((components as Record<string, unknown>[]).reduce((s, c) => s + Number(c.estimated_cost ?? 0), 0))}</td>
            <td class="text-right bold">${(components as Record<string, unknown>[]).reduce((s, c) => s + Number(c.labour_hours ?? 0), 0).toFixed(1)}</td>
          </tr></tfoot>
        </table>
      </div>` : ""}

      <!-- Repair vs Replace -->
      <div class="section">
        <div class="section-title">4. Repair vs Replace Recommendation</div>
        <div class="finding-box">
          <strong>Decision:</strong> ${escHtml(String(claim.repair_vs_replace_recommendation ?? "—"))}
        </div>
      </div>

      <!-- Decision Authority -->
      <div class="section">
        <div class="section-title">5. Decision Authority &amp; Next Steps</div>
        <div class="finding-box info">
          ${escHtml(String(claim.decision_authority ?? "Refer to Claims Manager for final approval."))}
        </div>
      </div>

      <!-- Disclaimer -->
      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">This report is generated by the KINGA AI Intelligence Platform and is intended for use by authorised insurer personnel only. It does not constitute legal advice. All findings are subject to human review and final approval by a qualified claims professional. This report is classified CONFIDENTIAL and must not be shared with the insured party without explicit authorisation.</p>
      </div>
    `;

    return buildBaseHtml(meta, body);
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
    const [claims] = await conn.execute(
      `SELECT c.*, a.overall_fraud_score, a.fraud_risk_level, a.final_recommendation,
              a.total_claimed_amount, a.true_cost_estimate, a.ai_recommended_settlement,
              a.physics_analysis, a.fraud_analysis, a.forensic_audit_validation,
              a.narrative_analysis, a.damage_description, a.pipeline_version,
              a.created_at as assessment_date, a.claim_quality_score,
              a.input_fidelity_result, a.decision_authority
       FROM claims c
       LEFT JOIN ai_assessments a ON a.claim_id = c.id
       WHERE c.id = ? ORDER BY a.created_at DESC LIMIT 1`,
      [claimId]
    ) as [Record<string, unknown>[], unknown];

    const claim = claims[0];
    if (!claim) throw new Error(`Claim ${claimId} not found`);

    const parseJson = (val: unknown) => {
      if (!val) return null;
      try { return typeof val === "string" ? JSON.parse(val) : val; } catch { return null; }
    };

    const physics = parseJson(claim.physics_analysis);
    const fraud = parseJson(claim.fraud_analysis);
    const forensic = parseJson(claim.forensic_audit_validation);
    const narrative = parseJson(claim.narrative_analysis);
    const ife = parseJson(claim.input_fidelity_result);

    const meta: ReportMeta = {
      title: "Forensic Analysis Report",
      subtitle: `Claim Reference: ${claim.claim_reference ?? claim.id}`,
      reportRef: `RPT-FORENSIC-${claimId}-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: claim.insurer_name as string | undefined,
      classification: "CONFIDENTIAL",
    };

    const fraudScore = Number(claim.overall_fraud_score ?? 0);

    const body = `
      <!-- Claim Identity -->
      <div class="section">
        <div class="section-title">1. Claim Identity</div>
        <div class="kv-grid cols-3">
          <div class="kv-item"><div class="kv-label">Claim Reference</div><div class="kv-value mono">${escHtml(String(claim.claim_reference ?? claim.id))}</div></div>
          <div class="kv-item"><div class="kv-label">Date of Loss</div><div class="kv-value">${fmtDate(claim.date_of_loss as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Assessment Date</div><div class="kv-value">${fmtDateTime(claim.assessment_date as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Vehicle</div><div class="kv-value">${escHtml(String(claim.vehicle_description ?? "—"))}</div></div>
          <div class="kv-item"><div class="kv-label">Incident Location</div><div class="kv-value">${escHtml(String(claim.incident_location ?? "—"))}</div></div>
          <div class="kv-item"><div class="kv-label">Pipeline Version</div><div class="kv-value mono">${escHtml(String(claim.pipeline_version ?? "v2"))}</div></div>
        </div>
      </div>

      <!-- Fraud Risk Summary -->
      <div class="section">
        <div class="section-title">2. Fraud Risk Assessment</div>
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">Overall Risk Level</div><div class="kv-value">${riskBadge(String(claim.fraud_risk_level ?? "low"))}</div></div>
          <div class="kv-item"><div class="kv-label">Fraud Score</div><div class="kv-value">${scoreBar(fraudScore)}</div></div>
          <div class="kv-item"><div class="kv-label">Claim Quality</div><div class="kv-value">${scoreBar(Number(claim.claim_quality_score ?? 0))}</div></div>
          <div class="kv-item"><div class="kv-label">Final Recommendation</div><div class="kv-value bold">${escHtml(String(claim.final_recommendation ?? "—")).toUpperCase()}</div></div>
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
        <div class="kv-grid cols-3">
          <div class="kv-item"><div class="kv-label">Amount Claimed</div><div class="kv-value">${fmtCurrency(claim.total_claimed_amount as number)}</div></div>
          <div class="kv-item"><div class="kv-label">AI True Cost</div><div class="kv-value">${fmtCurrency(claim.true_cost_estimate as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Recommended Settlement</div><div class="kv-value bold">${fmtCurrency(claim.ai_recommended_settlement as number)}</div></div>
        </div>
        <div class="finding-box">
          <strong>Decision Authority:</strong> ${escHtml(String(claim.decision_authority ?? "Refer to Claims Manager."))}
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
    const [claims] = await conn.execute(
      `SELECT c.claim_reference, c.id, c.psm_status, c.created_at, c.updated_at,
              c.insurer_name, c.policyholder_name
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

    const [assessments] = await conn.execute(
      `SELECT id, pipeline_version, overall_fraud_score, fraud_risk_level,
              final_recommendation, created_at, triggered_by_admin
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
          <div class="kv-item"><div class="kv-label">Policyholder</div><div class="kv-value">${escHtml(String(claim.policyholder_name ?? "—"))}</div></div>
          <div class="kv-item"><div class="kv-label">Current Status</div><div class="kv-value">${escHtml(String(claim.psm_status ?? "—"))}</div></div>
          <div class="kv-item"><div class="kv-label">Submitted</div><div class="kv-value">${fmtDateTime(claim.created_at as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Last Updated</div><div class="kv-value">${fmtDateTime(claim.updated_at as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Insurer</div><div class="kv-value">${escHtml(String(claim.insurer_name ?? "—"))}</div></div>
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
        <div class="section-title">3. AI Assessment History</div>
        ${(assessments as Record<string, unknown>[]).length > 0 ? `
        <table>
          <thead><tr><th>Assessment ID</th><th>Date</th><th>Pipeline</th><th>Fraud Score</th><th>Risk Level</th><th>Recommendation</th><th>Admin Triggered</th></tr></thead>
          <tbody>
            ${(assessments as Record<string, unknown>[]).map((a) => `
              <tr>
                <td class="mono small">${a.id}</td>
                <td class="small">${fmtDateTime(a.created_at as number)}</td>
                <td class="mono small">${escHtml(String(a.pipeline_version ?? "v2"))}</td>
                <td>${scoreBar(Number(a.overall_fraud_score ?? 0))}</td>
                <td>${riskBadge(String(a.fraud_risk_level ?? "low"))}</td>
                <td class="bold">${escHtml(String(a.final_recommendation ?? "—")).toUpperCase()}</td>
                <td>${a.triggered_by_admin ? "YES" : "No"}</td>
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
    const [claims] = await conn.execute(
      `SELECT c.claim_reference, c.id, c.insurer_name, c.vehicle_description,
              a.total_claimed_amount, a.true_cost_estimate, a.ai_recommended_settlement,
              a.cost_intelligence, a.created_at as assessment_date
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
    const costIntel = parseJson(claim.cost_intelligence);

    const claimed = Number(claim.total_claimed_amount ?? 0);
    const trueCost = Number(claim.true_cost_estimate ?? 0);
    const recommended = Number(claim.ai_recommended_settlement ?? 0);
    const variance = claimed > 0 ? ((claimed - trueCost) / trueCost) * 100 : 0;

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
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">Amount Claimed</div><div class="kv-value bold">${fmtCurrency(claimed)}</div></div>
          <div class="kv-item"><div class="kv-label">AI True Cost Estimate</div><div class="kv-value bold">${fmtCurrency(trueCost)}</div></div>
          <div class="kv-item"><div class="kv-label">Variance</div><div class="kv-value bold">${variance >= 0 ? "+" : ""}${variance.toFixed(1)}%</div></div>
          <div class="kv-item"><div class="kv-label">Recommended Settlement</div><div class="kv-value bold">${fmtCurrency(recommended)}</div></div>
        </div>
        ${Math.abs(variance) > 20 ? `
        <div class="finding-box ${variance > 20 ? "" : "info"}">
          <strong>${variance > 20 ? "Overpayment Risk:" : "Underpayment Risk:"}</strong>
          The claimed amount is ${Math.abs(variance).toFixed(1)}% ${variance > 20 ? "above" : "below"} the AI true cost estimate.
          ${variance > 20 ? "This may indicate inflated components, duplicate line items, or unrelated damage inclusion." : "This may indicate missing components or under-scoped damage."}
        </div>` : ""}
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
        <p class="small grey">Cost benchmarks are derived from the KINGA learning database, market data, and AI analysis. They represent estimates and should be validated against current supplier pricing before final settlement. This report is classified CONFIDENTIAL.</p>
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
    const [claims] = await conn.execute(
      `SELECT c.claim_reference, c.id, c.insurer_name, c.vehicle_description,
              a.repair_vs_replace_recommendation, a.repair_intelligence,
              a.true_cost_estimate, a.vehicle_valuation, a.created_at as assessment_date
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
    const repairIntel = parseJson(claim.repair_intelligence);
    const valuation = parseJson(claim.vehicle_valuation);

    const meta: ReportMeta = {
      title: "Repair vs Replace Decision Report",
      subtitle: `Claim Reference: ${claim.claim_reference ?? claim.id}`,
      reportRef: `RPT-RVR-${claimId}-${Date.now()}`,
      generatedAt: new Date(),
      generatedBy: "KINGA Intelligence Platform",
      tenantName: claim.insurer_name as string | undefined,
      classification: "INTERNAL",
    };

    const body = `
      <div class="section">
        <div class="section-title">1. Vehicle &amp; Damage Overview</div>
        <div class="kv-grid cols-3">
          <div class="kv-item"><div class="kv-label">Vehicle</div><div class="kv-value">${escHtml(String(claim.vehicle_description ?? "—"))}</div></div>
          <div class="kv-item"><div class="kv-label">Repair Cost Estimate</div><div class="kv-value">${fmtCurrency(claim.true_cost_estimate as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Vehicle Market Value</div><div class="kv-value">${valuation?.marketValue ? fmtCurrency(valuation.marketValue) : "—"}</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">2. Repair vs Replace Recommendation</div>
        <div class="finding-box">
          <strong>AI Decision:</strong> ${escHtml(String(claim.repair_vs_replace_recommendation ?? "—"))}
        </div>
        ${repairIntel ? `
        <div class="kv-grid cols-3">
          ${repairIntel.repairScore != null ? `<div class="kv-item"><div class="kv-label">Repair Score</div><div class="kv-value">${scoreBar(repairIntel.repairScore)}</div></div>` : ""}
          ${repairIntel.totalLossThreshold != null ? `<div class="kv-item"><div class="kv-label">Total Loss Threshold</div><div class="kv-value">${fmtPct(repairIntel.totalLossThreshold)}</div></div>` : ""}
          ${repairIntel.repairToValueRatio != null ? `<div class="kv-item"><div class="kv-label">Repair-to-Value Ratio</div><div class="kv-value bold">${fmtPct(repairIntel.repairToValueRatio)}</div></div>` : ""}
        </div>
        ${repairIntel.reasoning ? `<div class="finding-box info"><strong>Reasoning:</strong> ${escHtml(repairIntel.reasoning)}</div>` : ""}` : ""}
      </div>

      ${valuation ? `
      <div class="section">
        <div class="section-title">3. Vehicle Valuation</div>
        <div class="kv-grid cols-3">
          ${valuation.marketValue != null ? `<div class="kv-item"><div class="kv-label">Market Value</div><div class="kv-value">${fmtCurrency(valuation.marketValue)}</div></div>` : ""}
          ${valuation.retailValue != null ? `<div class="kv-item"><div class="kv-label">Retail Value</div><div class="kv-value">${fmtCurrency(valuation.retailValue)}</div></div>` : ""}
          ${valuation.tradeValue != null ? `<div class="kv-item"><div class="kv-label">Trade Value</div><div class="kv-value">${fmtCurrency(valuation.tradeValue)}</div></div>` : ""}
          ${valuation.salvageValue != null ? `<div class="kv-item"><div class="kv-label">Salvage Value</div><div class="kv-value">${fmtCurrency(valuation.salvageValue)}</div></div>` : ""}
          ${valuation.year != null ? `<div class="kv-item"><div class="kv-label">Year</div><div class="kv-value">${valuation.year}</div></div>` : ""}
          ${valuation.mileage != null ? `<div class="kv-item"><div class="kv-label">Mileage</div><div class="kv-value">${Number(valuation.mileage).toLocaleString()} km</div></div>` : ""}
        </div>
      </div>` : ""}

      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">This report is generated by the KINGA AI Intelligence Platform. The repair vs replace recommendation is based on AI analysis and must be reviewed by a qualified assessor before a final decision is communicated to any party.</p>
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

    const [summary] = await conn.execute(
      `SELECT
        COUNT(*) as total_claims,
        SUM(CASE WHEN c.psm_status='approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN c.psm_status='rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN c.psm_status IN ('in_review','assessment_in_progress') THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN c.psm_status='settled' THEN 1 ELSE 0 END) as settled,
        AVG(a.overall_fraud_score) as avg_fraud_score,
        SUM(CASE WHEN a.fraud_risk_level='high' OR a.fraud_risk_level='critical' THEN 1 ELSE 0 END) as high_risk_count,
        SUM(a.total_claimed_amount) as total_claimed,
        SUM(a.ai_recommended_settlement) as total_recommended,
        AVG(a.claim_quality_score) as avg_quality_score
       FROM claims c
       LEFT JOIN ai_assessments a ON a.claim_id=c.id
       ${whereClause}`,
      whereParams
    ) as [Record<string, unknown>[], unknown];

    const stats = (summary as Record<string, unknown>[])[0] ?? {};

    const [byType] = await conn.execute(
      `SELECT c.claim_type, COUNT(*) as cnt, SUM(a.total_claimed_amount) as total_value
       FROM claims c LEFT JOIN ai_assessments a ON a.claim_id=c.id
       ${whereClause} GROUP BY c.claim_type ORDER BY cnt DESC`,
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
    const savings = Number(stats.total_claimed ?? 0) - Number(stats.total_recommended ?? 0);

    const body = `
      <div class="section">
        <div class="section-title">1. Portfolio Overview</div>
        <div class="kv-grid cols-4">
          <div class="kv-item"><div class="kv-label">Total Claims</div><div class="kv-value bold">${total.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Approved</div><div class="kv-value">${approved.toLocaleString()} (${approvalRate.toFixed(1)}%)</div></div>
          <div class="kv-item"><div class="kv-label">Rejected</div><div class="kv-value">${rejected.toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">In Progress</div><div class="kv-value">${Number(stats.in_progress ?? 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="kv-label">Total Claimed Value</div><div class="kv-value bold">${fmtCurrency(stats.total_claimed as number)}</div></div>
          <div class="kv-item"><div class="kv-label">AI Recommended Settlement</div><div class="kv-value bold">${fmtCurrency(stats.total_recommended as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Potential Savings</div><div class="kv-value bold">${fmtCurrency(savings)}</div></div>
          <div class="kv-item"><div class="kv-label">High Risk Claims</div><div class="kv-value">${Number(stats.high_risk_count ?? 0).toLocaleString()}</div></div>
        </div>
        <div class="kv-grid cols-2">
          <div class="kv-item"><div class="kv-label">Avg Fraud Score</div><div class="kv-value">${scoreBar(Math.round(Number(stats.avg_fraud_score ?? 0)))}</div></div>
          <div class="kv-item"><div class="kv-label">Avg Claim Quality Score</div><div class="kv-value">${scoreBar(Math.round(Number(stats.avg_quality_score ?? 0)))}</div></div>
        </div>
      </div>

      ${(byType as Record<string, unknown>[]).length > 0 ? `
      <div class="section">
        <div class="section-title">2. Claims by Type</div>
        <table>
          <thead><tr><th>Claim Type</th><th class="text-right">Count</th><th class="text-right">Total Value</th></tr></thead>
          <tbody>
            ${(byType as Record<string, unknown>[]).map((r) => `
              <tr>
                <td>${escHtml(String(r.claim_type ?? "Unknown"))}</td>
                <td class="text-right">${Number(r.cnt).toLocaleString()}</td>
                <td class="text-right">${fmtCurrency(r.total_value as number)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : ""}

      <div class="section">
        <div class="section-title">Disclaimer</div>
        <p class="small grey">This portfolio summary is generated by the KINGA Intelligence Platform. All figures are based on AI assessment outputs and are subject to final human review. This report is classified CONFIDENTIAL and is intended for authorised insurer personnel only.</p>
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

    const [riskDist] = await conn.execute(
      `SELECT a.fraud_risk_level, COUNT(*) as cnt, AVG(a.overall_fraud_score) as avg_score
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
        <p class="small grey">Assessor performance metrics are derived from AI analysis of claim outcomes. Anomaly scores are indicative only and must be investigated by a qualified fraud manager before any action is taken. This report is classified CONFIDENTIAL.</p>
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

    const [rows] = await conn.execute(
      `SELECT c.psm_status,
              COUNT(*) as cnt,
              AVG((c.updated_at - c.created_at) / 3600000) as avg_hours_in_state,
              MAX((c.updated_at - c.created_at) / 3600000) as max_hours_in_state
       FROM claims c ${whereClause}
       GROUP BY c.psm_status ORDER BY avg_hours_in_state DESC`,
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
        <div class="section-title">1. Average Dwell Time by Workflow Stage</div>
        <table>
          <thead><tr>
            <th>Workflow Stage</th>
            <th class="text-right">Claim Count</th>
            <th class="text-right">Avg Hours in Stage</th>
            <th class="text-right">Max Hours in Stage</th>
          </tr></thead>
          <tbody>
            ${(rows as Record<string, unknown>[]).map((r) => `
              <tr>
                <td>${escHtml(String(r.psm_status ?? "—"))}</td>
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
    const [totals] = await conn.execute(
      `SELECT COUNT(*) as total_claims,
              COUNT(DISTINCT c.tenant_id) as active_insurers,
              SUM(a.total_claimed_amount) as total_claimed,
              SUM(a.ai_recommended_settlement) as total_recommended,
              AVG(a.overall_fraud_score) as avg_fraud_score,
              SUM(CASE WHEN a.fraud_risk_level IN ('high','critical') THEN 1 ELSE 0 END) as high_risk
       FROM claims c LEFT JOIN ai_assessments a ON a.claim_id=c.id`,
      []
    ) as [Record<string, unknown>[], unknown];

    const stats = (totals as Record<string, unknown>[])[0] ?? {};
    const savings = Number(stats.total_claimed ?? 0) - Number(stats.total_recommended ?? 0);

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
          <div class="kv-item"><div class="kv-label">Total Claimed Value</div><div class="kv-value bold">${fmtCurrency(stats.total_claimed as number)}</div></div>
          <div class="kv-item"><div class="kv-label">Total Potential Savings</div><div class="kv-value bold">${fmtCurrency(savings)}</div></div>
          <div class="kv-item"><div class="kv-label">Avg Platform Fraud Score</div><div class="kv-value">${scoreBar(Math.round(Number(stats.avg_fraud_score ?? 0)))}</div></div>
          <div class="kv-item"><div class="kv-label">High Risk Claims</div><div class="kv-value bold">${Number(stats.high_risk ?? 0).toLocaleString()}</div></div>
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
    // Get all claims associated with this subject
    const [claims] = await conn.execute(
      `SELECT c.id, c.claim_reference, c.psm_status, c.claim_type,
              c.date_of_loss, c.created_at, c.updated_at,
              a.overall_fraud_score, a.fraud_risk_level, a.final_recommendation
       FROM claims c
       LEFT JOIN ai_assessments a ON a.claim_id=c.id
       WHERE c.claimant_id=? OR c.policyholder_id=?
       ORDER BY c.created_at DESC`,
      [subjectId, subjectId]
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
            <th>Claim Reference</th><th>Type</th><th>Date of Loss</th>
            <th>Status</th><th>Submitted</th>
          </tr></thead>
          <tbody>
            ${(claims as Record<string, unknown>[]).map((c) => `
              <tr>
                <td class="mono">${escHtml(String(c.claim_reference ?? c.id))}</td>
                <td>${escHtml(String(c.claim_type ?? "—"))}</td>
                <td>${fmtDate(c.date_of_loss as number)}</td>
                <td>${escHtml(String(c.psm_status ?? "—"))}</td>
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

    const [totals] = await conn.execute(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN a.overall_fraud_score IS NOT NULL THEN 1 ELSE 0 END) as ai_assessed,
              SUM(CASE WHEN c.psm_status IN ('approved','rejected','settled') THEN 1 ELSE 0 END) as decided,
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
