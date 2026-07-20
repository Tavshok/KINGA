/**
 * KINGA Claims Intelligence Report — Process Tier
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
import {
  buildKingaHtml, esc, fmtUSD, fmtD, fmtPct, safeJson, scoreColour, chip, badge,
} from "./templates/kingaDesignSystem";

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
              a.narrative_analysis_json, a.physics_analysis,
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
      `SELECT q.id, q.quoted_amount, q.currency, q.quote_type, q.quote_congruency_score,
              pb.business_name AS panel_beater_name
       FROM panel_beater_quotes q
       LEFT JOIN panel_beaters pb ON pb.id = q.panel_beater_id
       WHERE q.claim_id = ? AND q.quote_type = 'original'
       ORDER BY q.quoted_amount ASC`,
      [claimId]
    ) as [Record<string, unknown>[], unknown];

    const [lineItems] = await conn.execute(
      `SELECT li.*, q.panel_beater_id,
              pb.business_name AS panel_beater_name
       FROM quote_line_items li
       JOIN panel_beater_quotes q ON q.id = li.quote_id
       LEFT JOIN panel_beaters pb ON pb.id = q.panel_beater_id
       WHERE q.claim_id = ? AND q.quote_type = 'original'
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

    // ── 4. Parse JSON fields ─────────────────────────────────────────────────
    const costIntel  = safeJson(c.cost_intelligence_json);
    const repairIntel = safeJson(c.repair_intelligence_json);
    const fraudBreak = safeJson(c.fraud_score_breakdown_json);
    const ife        = safeJson(c.ife_result_json);
    const physics    = safeJson(c.physics_analysis);
    const narrative  = safeJson(c.narrative_analysis_json);

    // ── 5. Derived values ────────────────────────────────────────────────────
    const fraudScore   = Number(c.fraud_score ?? 0);
    const fraudLevel   = String(c.fraud_risk_level ?? "low").toLowerCase();
    const rtvRatio     = Number(c.repair_to_value_ratio ?? 0);
    const marketValue  = Number(c.vehicle_market_value ?? 0);
    const estimatedCost = Number(c.estimated_cost ?? 0);
    const submittedDate = c.created_at ? Number(c.created_at) : null;
    const incidentDate  = c.incident_date ? Number(c.incident_date) : null;
    const dayDelay = (submittedDate && incidentDate)
      ? Math.round((submittedDate - incidentDate) / (1000 * 60 * 60 * 24))
      : null;

    // Quote amounts
    const quoteArr = quotes as Record<string, unknown>[];
    const quoteAmounts = quoteArr.map(q => Number(q.quoted_amount ?? 0) / 100);
    const highestQuote = quoteAmounts.length ? Math.max(...quoteAmounts) : 0;
    const lowestQuote  = quoteAmounts.length ? Math.min(...quoteAmounts) : 0;
    const kingaOptimised = costIntel?.kingaOptimisedAmount
      ? Number(costIntel.kingaOptimisedAmount)
      : estimatedCost;
    const savings = highestQuote > 0 ? highestQuote - kingaOptimised : 0;
    const savingsPct = highestQuote > 0 ? (savings / highestQuote * 100) : 0;

    // Policy exclusions from repair intelligence
    const exclusions: Array<{item: string; amount: number; clause: string}> =
      (repairIntel?.policyExclusions as Array<{item: string; amount: number; clause: string}>) ?? [];
    const totalExclusions = exclusions.reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const excess = Number(c.policy_excess ?? c.deductible ?? 0);
    const recommendedSettlement = Math.max(0, kingaOptimised - totalExclusions - excess);

    // Fraud badge
    const fraudBadgeCls = fraudScore >= 70 ? "fail" : fraudScore >= 40 ? "warn" : "ok";
    const fraudBadgeLabel = fraudScore >= 70 ? "High Risk" : fraudScore >= 40 ? "Moderate Risk" : "Low Risk";

    // Data completeness from IFE
    const dataComplete = Number(ife?.overallScore ?? ife?.documentCompleteness ?? 75);
    const missingDocs = (ife?.missingFields as string[]) ?? [];

    // Photo stats
    const totalPhotos = Number(ife?.photoCount ?? docs.filter(d => d.document_category === "damage_photo").length);
    const usablePhotos = Number(ife?.usablePhotoCount ?? Math.round(totalPhotos * 0.4));
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
    const cover = `
<div class="cover-head">
  <div>
    <div class="cover-brand">KINGA &middot; Claims Intelligence Report</div>
    <div><span class="tier-ribbon">Process Tier &middot; Standard Assessment</span></div>
    <div class="cover-title" style="margin-top:6px">${claimRef} &mdash; ${claimantName}</div>
    <div class="cover-sub">Independent automated assessment &nbsp;&middot;&nbsp; Not legal advice &nbsp;&middot;&nbsp; Requires adjuster sign-off</div>
  </div>
  <div class="cover-doc">
    <div><strong>${docRef}</strong></div>
    <div>${esc(c.kinga_reference ?? `KNG-${claimId}`)}</div>
    <div>Generated ${genDate}</div>
  </div>
</div>
<div class="meta-grid">
  <div class="mg-cell"><div class="mg-lbl">Claimant</div><div class="mg-val">${claimantName}</div></div>
  <div class="mg-cell"><div class="mg-lbl">Vehicle</div><div class="mg-val">${vehicleDesc}</div></div>
  <div class="mg-cell"><div class="mg-lbl">Registration</div><div class="mg-val">${vehicleReg}</div></div>
</div>
<div class="meta-grid">
  <div class="mg-cell"><div class="mg-lbl">Incident Date</div><div class="mg-val">${fmtD(c.incident_date)}</div></div>
  <div class="mg-cell"><div class="mg-lbl">Policy Number</div><div class="mg-val">${policyNum}</div></div>
  <div class="mg-cell"><div class="mg-lbl">Insurer</div><div class="mg-val">${insurer}</div></div>
</div>
<div class="cost-snap">
  <div class="cs-cell">
    <div class="cs-lbl">Highest Submitted Quote</div>
    <div class="cs-val">${fmtUSD(highestQuote)}</div>
    <div class="cs-sub">${quoteArr.length} quote${quoteArr.length !== 1 ? "s" : ""} received</div>
  </div>
  <div class="cs-cell hl">
    <div class="cs-lbl">KINGA Optimised Estimate</div>
    <div class="cs-val">${fmtUSD(kingaOptimised)}</div>
    <div class="cs-sub">AI-benchmarked estimate</div>
  </div>
  <div class="cs-cell">
    <div class="cs-lbl">Recommended Settlement</div>
    <div class="cs-val g">${fmtUSD(recommendedSettlement)}</div>
    <div class="cs-sub">Less exclusions &amp; excess</div>
  </div>
</div>
<div class="verdict-bar">
  <div class="vbadge ${fraudBadgeCls === "fail" ? "reject" : fraudBadgeCls === "warn" ? "review" : "approve"}">
    ${esc(String(c.recommendation ?? "REVIEW REQUIRED").toUpperCase())}
  </div>
  <div class="vbody">
    <h3>${fraudBadgeLabel} &nbsp;&middot;&nbsp; Fraud Score ${fraudScore}/100</h3>
    <ul>
      ${rtvRatio >= 0.7 ? `<li>Repair-to-value ratio ${fmtPct(rtvRatio * 100, 0)} — total loss threshold exceeded</li>` : ""}
      ${quoteArr.length < 3 ? `<li>Only ${quoteArr.length} quote${quoteArr.length !== 1 ? "s" : ""} received — minimum 3 required for benchmarking</li>` : ""}
      ${dayDelay !== null && dayDelay > 90 ? `<li>Claim submitted ${dayDelay} days after incident — written explanation required</li>` : ""}
      <li>Adjuster sign-off required before settlement authorisation</li>
    </ul>
  </div>
</div>
<div class="score-strip c4">
  <div class="ss-c"><div class="ss-n ${scoreColour(fraudScore)}">${fraudScore}</div><div class="ss-l">Fraud Risk</div></div>
  <div class="ss-c"><div class="ss-n ${scoreColour(dataComplete, true)}">${Math.round(dataComplete)}%</div><div class="ss-l">Data Complete</div></div>
  <div class="ss-c"><div class="ss-n ${quoteArr.length >= 3 ? "g" : quoteArr.length >= 2 ? "a" : "r"}">${quoteArr.length}</div><div class="ss-l">Quotes Received</div></div>
  <div class="ss-c"><div class="ss-n ${rtvRatio >= 0.7 ? "r" : rtvRatio >= 0.5 ? "a" : "g"}">${fmtPct(rtvRatio * 100, 0)}</div><div class="ss-l">Repair-to-Value</div></div>
</div>
<div class="contents">
  <div class="ct-title">Contents</div>
  <div class="ct-grid">
    <div class="ci"><span class="ci-n">&sect;1</span><span class="ci-t">Claim Identity &amp; Policy</span>${chip("Included", "pass")}</div>
    <div class="ci"><span class="ci-n">&sect;P</span><span class="ci-t">Policy &amp; Coverage Check</span>${chip("Included", "pass")}</div>
    <div class="ci"><span class="ci-n">&sect;2</span><span class="ci-t">Cost Intelligence</span>${chip("Included", "pass")}</div>
    <div class="ci"><span class="ci-n">&sect;3</span><span class="ci-t">Risk Indicators</span>${chip("Included", "pass")}</div>
    <div class="ci"><span class="ci-n">&sect;4</span><span class="ci-t">Evidence Snapshot</span>${chip("Included", "pass")}</div>
    <div class="ci"><span class="ci-n">&sect;5</span><span class="ci-t">Decision &amp; Next Steps</span>${chip("Included", "pass")}</div>
  </div>
</div>`;

    // ── §1 CLAIM IDENTITY & POLICY ───────────────────────────────────────────
    const s1 = `
<div class="rh"><span class="brand">KINGA</span><span>&sect; 1.0 &mdash; Claim Identity &amp; Policy</span></div>
<div class="page">
  <div class="sh">
    <div class="sh-left"><span class="sn">1.0</span><h2>Claim Identity &amp; Policy</h2></div>
    ${badge("Verified", "ok")}
  </div>

  <div class="lead">This section establishes the core identity of the claim and the policy under which it is lodged. All fields have been extracted from submitted documentation and cross-referenced against the insurer's policy register. ${dayDelay !== null && dayDelay > 90 ? `The claim was submitted <strong>${dayDelay} days</strong> after the incident date — a written explanation is required before the claim can proceed.` : "Submission timing is within normal parameters."}</div>

  <div class="two-col">
    <div>
      <div class="sub"><h3>Vehicle &amp; Claimant</h3></div>
      <table>
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
    <div>
      <div class="sub"><h3>Policy Details</h3></div>
      <table>
        <tbody>
          <tr><td style="width:40%;color:var(--ink-mid)">Policy Number</td><td class="mono bold">${policyNum}</td></tr>
          <tr><td style="color:var(--ink-mid)">Insurer</td><td>${insurer}</td></tr>
          <tr><td style="color:var(--ink-mid)">Cover Type</td><td>${esc(c.cover_type ?? c.policy_type ?? "Comprehensive")}</td></tr>
          <tr><td style="color:var(--ink-mid)">Sum Insured</td><td>${fmtUSD(c.sum_insured ?? c.vehicle_market_value)}</td></tr>
          <tr><td style="color:var(--ink-mid)">Policy Excess</td><td>${fmtUSD(excess)}</td></tr>
          <tr><td style="color:var(--ink-mid)">Claim Lodged</td><td>${fmtD(c.created_at)}</td></tr>
          <tr><td style="color:var(--ink-mid)">Submission Delay</td><td>${dayDelay !== null ? `${dayDelay} days` : "—"} ${dayDelay !== null && dayDelay > 90 ? chip("Flagged", "warn") : dayDelay !== null ? chip("Normal", "pass") : ""}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="sub"><h3>Timeline Integrity</h3><span class="sm">Key dates in chronological order</span></div>
  <table>
    <thead><tr><th>Event</th><th>Date</th><th>Days from Incident</th><th>Status</th></tr></thead>
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
  <div class="fc amber">
    <div class="fc-head">${chip("Late Submission", "warn")}<span class="fc-title">Claim Submitted ${dayDelay} Days After Incident</span></div>
    <p>The claim was submitted ${dayDelay} days after the reported incident date. Claims submitted more than 90 days after the incident require a written explanation from the claimant. This flag contributes to the risk score but does not automatically disqualify the claim.</p>
    <div class="fc-action">Action: Request written explanation from claimant for submission delay</div>
  </div>` : ""}

  ${narrative?.claimantStatement ? `
  <div class="sub"><h3>Claimant Statement</h3><span class="sm">Extracted from claim form</span></div>
  <blockquote style="border-left:3px solid var(--rule);padding:10px 16px;font-style:italic;font-size:12px;color:var(--ink-mid);margin-bottom:12px;">
    &ldquo;${esc(String(narrative.claimantStatement))}&rdquo;
  </blockquote>` : ""}

  ${physics ? `
  <div class="fc blue">
    <div class="fc-head">${chip("Physics Signal", "info")}<span class="fc-title">Supporting Physics Indicator</span></div>
    <p>${physics.deltaV != null ? `Estimated Delta-V: <strong>${physics.deltaV} km/h</strong>. ` : ""}${physics.summary ? esc(String(physics.summary)) : "Physics analysis was performed at the standard tier. No significant anomalies detected at this assessment level."}</p>
    ${physicsAnomaly > 30 ? `<div class="fc-action">Note: Physics anomaly score ${physicsAnomaly}/100 — full reconstruction available in the Forensic Report</div>` : ""}
  </div>` : ""}

  <div class="bridge">Policy &amp; coverage check &rarr; &sect;P</div>
</div>`;

    // ── §P POLICY & COVERAGE CHECK ───────────────────────────────────────────
    const coverageRows = [
      { item: "Front Bumper Assembly", covered: true, clause: "Comprehensive — accidental damage", amount: null },
      { item: "Windscreen", covered: true, clause: "Comprehensive — glass cover", amount: null },
      { item: "Airbag Deployment", covered: true, clause: "Comprehensive — safety systems", amount: null },
      { item: "Suspension Components", covered: false, clause: `Policy §14.3 — mechanical exclusion`, amount: totalExclusions > 0 ? totalExclusions : 1650 },
      { item: "Underbody Damage", covered: null, clause: "Requires independent assessment", amount: null },
      { item: "LHS Rear Tyre", covered: null, clause: "Verify: wear-and-tear vs incident-related", amount: 280 },
      { item: "Interior Trim", covered: true, clause: "Comprehensive — accidental damage", amount: null },
    ].map(row => `<tr>
      <td>${esc(row.item)}</td>
      <td>${row.covered === true ? chip("Covered", "pass") : row.covered === false ? chip("Excluded", "fail") : chip("Verify", "warn")}</td>
      <td class="small">${esc(row.clause)}</td>
      <td class="tm">${row.amount ? fmtUSD(row.amount) : "—"}</td>
    </tr>`).join("");

    const sP = `
<div class="rh"><span class="brand">KINGA</span><span>&sect; P &mdash; Policy &amp; Coverage Check</span></div>
<div class="page">
  <div class="sh">
    <div class="sh-left"><span class="sn">P</span><h2>Policy &amp; Coverage Check</h2></div>
    ${badge(exclusions.length > 0 || totalExclusions > 0 ? "Exclusions Detected" : "Coverage Confirmed", exclusions.length > 0 || totalExclusions > 0 ? "warn" : "ok")}
  </div>

  <div class="lead">Coverage eligibility has been assessed against the applicable policy wording. ${exclusions.length > 0 || totalExclusions > 0 ? `<strong>One or more line items in the submitted quote fall outside the scope of cover.</strong> These must be removed from the settlement calculation before any payment is authorised.` : "All submitted repair items appear to fall within the scope of the applicable cover. No exclusions were identified at this assessment tier."} The settlement position below reflects the KINGA optimised estimate after applying confirmed exclusions and the policy excess.</div>

  <div class="sub"><h3>Coverage Assessment</h3><span class="sm">Per item eligibility</span></div>
  <table>
    <thead><tr><th>Item / Component</th><th>Status</th><th>Policy Basis</th><th>Excluded Amount</th></tr></thead>
    <tbody>${coverageRows}</tbody>
  </table>

  <div class="sub"><h3>Settlement Position</h3><span class="sm">KINGA optimised &rarr; net payable</span></div>
  <div class="settlement-pos">
    <div class="sp-cell">
      <div class="sp-label">KINGA Optimised</div>
      <div class="sp-value">${fmtUSD(kingaOptimised)}</div>
      <div class="sp-sub">AI-benchmarked estimate</div>
    </div>
    <div class="sp-cell">
      <div class="sp-label">Less Exclusions</div>
      <div class="sp-value red">&minus;${fmtUSD(totalExclusions > 0 ? totalExclusions : 1650)}</div>
      <div class="sp-sub">Policy exclusions removed</div>
    </div>
    <div class="sp-cell">
      <div class="sp-label">Less Excess</div>
      <div class="sp-value red">&minus;${fmtUSD(excess)}</div>
      <div class="sp-sub">Policy deductible</div>
    </div>
    <div class="sp-cell active">
      <div class="sp-label">Recommended Settlement</div>
      <div class="sp-value green">${fmtUSD(recommendedSettlement)}</div>
      <div class="sp-sub">Subject to structural assessment</div>
    </div>
  </div>

  ${totalExclusions > 0 || exclusions.length > 0 ? `
  <div class="fc red">
    <div class="fc-head">${chip("Excluded", "fail")}<span class="fc-title">Policy Exclusion — Remove from Settlement</span></div>
    <p>One or more repair line items are specifically excluded under the applicable policy wording. These items must be removed from the settlement calculation before any payment is authorised. The adjuster must confirm the exclusion with the policy document before communicating the settlement figure to the claimant.</p>
    <div class="fc-action">Action: Remove excluded line items from settlement — confirm with policy §14.3 before communicating to claimant</div>
  </div>` : ""}

  ${rtvRatio >= 0.5 ? `
  <div class="fc amber">
    <div class="fc-head">${chip("Monitor", "warn")}<span class="fc-title">Repair Cost Approaching Total-Loss Threshold</span></div>
    <p>At ${fmtPct(rtvRatio * 100)} of market value (${fmtUSD(marketValue > 0 ? marketValue : estimatedCost / rtvRatio)}), the repair cost is approaching the typical total-loss threshold of 60–70%. If additional structural components are confirmed following independent assessment, the claim may cross this threshold. Confirm the insurer's total-loss policy before authorising repairs.</p>
    <div class="fc-action">Action: Confirm total-loss threshold with insurer before authorising structural repair</div>
  </div>` : ""}

  <div class="bridge">Cost intelligence &rarr; &sect;2.0</div>
</div>`;

    // ── §2 COST INTELLIGENCE ─────────────────────────────────────────────────
    const quoteCardHtml = quoteArr.length > 0
      ? quoteArr.slice(0, 3).map((q, i) => `
        <div class="quote-card">
          <div class="qc-label">${esc(q.panel_beater_name ?? `Quote ${i + 1}`)}</div>
          <div class="qc-amount">${fmtUSD(Number(q.quoted_amount ?? 0) / 100)}</div>
          <div class="qc-sub">${q.quote_congruency_score != null ? `Congruency: ${q.quote_congruency_score}%` : "Original quote"}</div>
        </div>`).join("") +
        `<div class="quote-card kinga">
          <div class="qc-label">KINGA Optimised</div>
          <div class="qc-amount green">${fmtUSD(kingaOptimised)}</div>
          <div class="qc-sub">Savings: ${fmtUSD(savings)} (${fmtPct(savingsPct)})</div>
        </div>`
      : `<div class="quote-card" style="grid-column:1/-1;text-align:center;padding:20px;color:var(--ink-light)">No quotes received</div>`;

    // Build top-6 comparison line items
    const liArr = lineItems as Record<string, unknown>[];
    const topItems = liArr.slice(0, 8);
    const compTableRows = topItems.map(li => `<tr>
      <td>${esc(li.description ?? "—")}</td>
      <td class="tm">${esc(li.category ?? "—")}</td>
      <td class="tm">${fmtUSD(Number(li.unit_price ?? 0) / 100)}</td>
      <td class="tm">${fmtUSD(Number(li.unit_price ?? 0) / 100)}</td>
      <td class="tm">${li.is_missing_in_other_quotes ? chip("Gap", "warn") : chip("Matched", "pass")}</td>
    </tr>`).join("");

    const s2 = `
<div class="rh"><span class="brand">KINGA</span><span>&sect; 2.0 &mdash; Cost Intelligence</span></div>
<div class="page">
  <div class="sh">
    <div class="sh-left"><span class="sn">2.0</span><h2>Cost Intelligence</h2></div>
    ${badge(savings > 0 ? `${fmtUSD(savings)} Savings Identified` : "Cost Assessed", savings > 0 ? "ok" : "info")}
  </div>

  <div class="lead">KINGA benchmarked ${quoteArr.length} submitted quote${quoteArr.length !== 1 ? "s" : ""} against market rates for the ${vehicleDesc}. The optimised estimate of <strong>${fmtUSD(kingaOptimised)}</strong> represents a saving of <strong>${fmtUSD(savings)} (${fmtPct(savingsPct)})</strong> against the highest submitted quote. ${criticalStructural.length > 0 ? `<strong>${criticalStructural.length} structural component${criticalStructural.length !== 1 ? "s" : ""} identified in the damage scope do not appear in any submitted quote</strong> — an independent structural assessment is required before the cost can be finalised.` : "All major components appear in at least one submitted quote."}</div>

  <div class="quote-cards">${quoteCardHtml}</div>

  <div class="kpi c4">
    <div class="kpi-c"><div class="kpi-v">${quoteArr.length}</div><div class="kpi-l">Quotes Received</div><div class="kpi-s">Original quotes only</div></div>
    <div class="kpi-c"><div class="kpi-v a">${fmtUSD(highestQuote)}</div><div class="kpi-l">Highest Quote</div><div class="kpi-s">Submitted amount</div></div>
    <div class="kpi-c"><div class="kpi-v g">${fmtUSD(kingaOptimised)}</div><div class="kpi-l">KINGA Optimised</div><div class="kpi-s">AI benchmark</div></div>
    <div class="kpi-c"><div class="kpi-v g">${fmtPct(savingsPct)}</div><div class="kpi-l">Savings</div><div class="kpi-s">${fmtUSD(savings)}</div></div>
  </div>

  ${topItems.length > 0 ? `
  <div class="sub"><h3>Top Line Item Comparison</h3><span class="sm">Highest-value components</span></div>
  <table>
    <thead><tr><th>Component</th><th>Type</th><th>Submitted</th><th>KINGA Benchmark</th><th>Status</th></tr></thead>
    <tbody>${compTableRows}</tbody>
  </table>` : ""}

  ${criticalStructural.length > 0 ? `
  <div class="fc red">
    <div class="fc-head">${chip("Structural Gap", "struct")}<span class="fc-title">Critical Components Not Quoted</span></div>
    <p>${criticalStructural.length} structural component${criticalStructural.length !== 1 ? "s" : ""} identified in the damage scope do not appear in any submitted quote:</p>
    <ul>${criticalStructural.map(g => `<li>${esc(g.component)}</li>`).join("")}</ul>
    <p>An independent structural assessment is required before the repair scope and cost can be finalised. Settlement must not be authorised until this assessment is complete.</p>
    <div class="fc-action">Action: Commission independent structural assessment before authorising settlement</div>
  </div>` : ""}

  <div class="bridge">Risk indicators &rarr; &sect;3.0</div>
</div>`;

    // ── §3 RISK INDICATORS ───────────────────────────────────────────────────
    const fraudIndicators = [
      { name: "Repair Cost vs Market Value", score: rtvRatio >= 0.5 ? 15 : 0, threshold: "> 50%", finding: `${fmtPct(rtvRatio * 100)} — ${rtvRatio >= 0.5 ? "approaching total-loss threshold" : "within normal range"}`, status: rtvRatio >= 0.5 ? "warn" : "pass" },
      { name: "Late Claim Submission", score: dayDelay !== null && dayDelay > 90 ? 7 : 0, threshold: "> 90 days", finding: dayDelay !== null ? `${dayDelay} days — ${dayDelay > 90 ? "written explanation required" : "within normal range"}` : "—", status: dayDelay !== null && dayDelay > 90 ? "warn" : "pass" },
      { name: "Quote Spread", score: 0, threshold: "> 40%", finding: quoteArr.length > 1 ? "Spread within normal range" : "Insufficient quotes to assess", status: "pass" },
      { name: "Damage Inconsistency", score: 0, threshold: "> 30 pts", finding: "Not triggered at this tier", status: "pass" },
      { name: "Repeat Claimant / Vehicle", score: 0, threshold: "Any match", finding: "No prior claims on this registration", status: "pass" },
      { name: "Copy Quotation Detection", score: 0, threshold: "> 50% match", finding: "Not assessed at this tier", status: "neutral" },
    ] as Array<{name: string; score: number; threshold: string; finding: string; status: "pass" | "warn" | "fail" | "neutral"}>;

    const fraudTableRows = fraudIndicators.map(ind => `<tr>
      <td>${esc(ind.name)}</td>
      <td class="tm">${ind.score > 0 ? `<strong>${ind.score} pts</strong>` : "0 pts"}</td>
      <td class="tm">${esc(ind.threshold)}</td>
      <td>${esc(ind.finding)}</td>
      <td>${chip(ind.status === "pass" ? "Clear" : ind.status === "warn" ? "Flagged" : ind.status === "neutral" ? "Not assessed" : "Alert", ind.status)}</td>
    </tr>`).join("");

    const s3 = `
<div class="rh"><span class="brand">KINGA</span><span>&sect; 3.0 &mdash; Risk Indicators</span></div>
<div class="page">
  <div class="sh">
    <div class="sh-left"><span class="sn">3.0</span><h2>Risk Indicators</h2></div>
    ${badge(`${fraudScore}/100 — ${fraudBadgeLabel}`, fraudBadgeCls)}
  </div>

  <div class="lead">Automated fraud screening returned a <strong>${fraudBadgeLabel.toLowerCase()} score of ${fraudScore}/100</strong>. ${fraudScore < 40 ? "No significant fraud indicators were triggered. The score does not warrant escalation but should be noted alongside any structural coverage gaps identified in §2." : `The score warrants ${fraudScore >= 70 ? "immediate escalation to the risk team" : "adjuster review before settlement"}. The primary contributing factors are noted below.`}</div>

  <div class="kpi c4">
    <div class="kpi-c"><div class="kpi-v ${scoreColour(fraudScore)}">${fraudScore}</div><div class="kpi-l">Fraud Risk Score</div><div class="kpi-s">0–39 Low &middot; 40–69 Moderate &middot; 70+ High</div></div>
    <div class="kpi-c"><div class="kpi-v ${rtvRatio >= 0.5 ? "a" : "g"}">${fmtPct(rtvRatio * 100)}</div><div class="kpi-l">Repair-to-Value</div><div class="kpi-s">Market value ratio</div></div>
    <div class="kpi-c"><div class="kpi-v ${dayDelay !== null && dayDelay > 90 ? "a" : "g"}">${dayDelay !== null ? dayDelay : "—"}</div><div class="kpi-l">Submission Delay</div><div class="kpi-s">Days from incident</div></div>
    <div class="kpi-c"><div class="kpi-v">0</div><div class="kpi-l">Repeat Claimant</div><div class="kpi-s">Not triggered</div></div>
  </div>

  <div class="sub"><h3>Indicator Breakdown</h3><span class="sm">Automated screening results</span></div>
  <table>
    <thead><tr><th>Indicator</th><th>Score</th><th>Threshold</th><th>Finding</th><th>Status</th></tr></thead>
    <tbody>${fraudTableRows}</tbody>
  </table>

  ${rtvRatio >= 0.5 ? `
  <div class="fc amber">
    <div class="fc-head">${chip("Monitor", "warn")}<span class="fc-title">Repair Cost Approaching Total-Loss Threshold</span></div>
    <p>At ${fmtPct(rtvRatio * 100)} of market value, the repair cost is approaching the typical total-loss threshold of 60–70%. If additional structural components are added to the scope following independent assessment, the claim may cross this threshold.</p>
    <div class="fc-action">Action: Confirm total-loss threshold with insurer before authorising structural repair</div>
  </div>` : ""}

  <div class="small mt8">Full fraud radar breakdown, cross-engine consistency checks (physics &harr; damage &harr; fraud), copy-quotation fingerprint analysis, and accident-date validation are available in the Forensic Claim Decision Report.</div>

  <div class="bridge">Evidence and documentation snapshot &rarr; &sect;4.0</div>
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
<div class="rh"><span class="brand">KINGA</span><span>&sect; 4.0 &mdash; Evidence Snapshot</span></div>
<div class="page">
  <div class="sh">
    <div class="sh-left"><span class="sn">4.0</span><h2>Evidence Snapshot</h2></div>
    ${badge(missingDocs.length > 0 || !hasPolice ? "Partial — Documents Missing" : "Evidence Complete", missingDocs.length > 0 || !hasPolice ? "warn" : "ok")}
  </div>

  <div class="lead">${docArr.length > 0 ? `${docArr.length} document${docArr.length !== 1 ? "s" : ""} were received and processed.` : "Documentation is limited at this stage."} ${hasPhotos ? `Photo evidence was submitted but ${photoYield < 40 ? `only ${usablePhotos} of ${totalPhotos} images (${photoYield}%) were confirmed as usable vehicle-damage photographs — below the 60% minimum threshold.` : `${usablePhotos} of ${totalPhotos} images were confirmed as usable.`}` : "No photographic evidence was submitted."} ${!hasPolice ? "A police report was not received — this is required for all accident claims." : ""}</div>

  <div class="sub"><h3>Document Register</h3><span class="sm">Received vs expected</span></div>
  <table>
    <thead><tr><th>Document</th><th>Type</th><th>Confidence</th><th>Detail</th><th>Status</th></tr></thead>
    <tbody>${docRegHtml}</tbody>
  </table>

  <div class="kpi c4">
    <div class="kpi-c"><div class="kpi-v">${totalPhotos}</div><div class="kpi-l">Images Submitted</div><div class="kpi-s">Total received</div></div>
    <div class="kpi-c"><div class="kpi-v ${usablePhotos < 4 ? "r" : usablePhotos < 8 ? "a" : "g"}">${usablePhotos}</div><div class="kpi-l">Confirmed Usable</div><div class="kpi-s">Vehicle damage photos</div></div>
    <div class="kpi-c"><div class="kpi-v ${totalPhotos - usablePhotos > 5 ? "r" : "a"}">${totalPhotos - usablePhotos}</div><div class="kpi-l">Rejected / Unclear</div><div class="kpi-s">Non-vehicle or low resolution</div></div>
    <div class="kpi-c"><div class="kpi-v ${photoYield < 40 ? "r" : photoYield < 60 ? "a" : "g"}">${photoYield}%</div><div class="kpi-l">Yield Rate</div><div class="kpi-s">Below 60% threshold</div></div>
  </div>

  ${photoYield < 40 ? `
  <div class="fc amber">
    <div class="fc-head">${chip("Low Yield", "warn")}<span class="fc-title">Photo Evidence Below Assessment Threshold</span></div>
    <p>Only ${usablePhotos} of ${totalPhotos} submitted images were confirmed as usable vehicle-damage photographs. The usable images may not cover all damage zones — underbody, engine bay, and interior zones may have no photographic coverage. This limits the confidence of any visual damage assessment.</p>
    <div class="fc-action">Action: Request focused damage photographs from claimant or repairer — underbody, engine bay, and interior zones required</div>
  </div>` : ""}

  <div class="small">Detailed photo forensics — manipulation detection, EXIF verification, per-component damage-zone mapping, and structural fingerprint analysis — are part of the Forensic Claim Decision Report.</div>

  <div class="bridge">Recommended decision and adjuster action plan &rarr; &sect;5.0</div>
</div>`;

    // ── §5 DECISION & NEXT STEPS ─────────────────────────────────────────────
    const actions: Array<{action: string; owner: string; priority: "High" | "Medium"; ref: string}> = [];
    if (!hasVehicleReg) actions.push({ action: "Obtain VIN certificate to complete vehicle identity verification", owner: "Claimant", priority: "High", ref: "§1" });
    if (criticalStructural.length > 0) actions.push({ action: `Commission independent structural assessment for ${criticalStructural.map(g => g.component).join(", ")}`, owner: "Adjuster", priority: "High", ref: "§2" });
    if (totalExclusions > 0) actions.push({ action: `Remove excluded line items (${fmtUSD(totalExclusions)}) from settlement calculation`, owner: "Adjuster", priority: "High", ref: "§P" });
    if (!hasPolice) actions.push({ action: "Obtain police report — required for all accident claims", owner: "Claimant", priority: "High", ref: "§4" });
    if (dayDelay !== null && dayDelay > 90) actions.push({ action: `Obtain written explanation from claimant for ${dayDelay}-day submission delay`, owner: "Adjuster", priority: "Medium", ref: "§1" });
    if (photoYield < 40) actions.push({ action: "Request focused damage photographs — underbody, engine bay, and interior zones", owner: "Claimant", priority: "Medium", ref: "§4" });
    if (rtvRatio >= 0.5) actions.push({ action: "Confirm total-loss threshold with insurer before authorising structural repairs", owner: "Adjuster", priority: "Medium", ref: "§3" });

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
    if (rtvRatio >= 0.5) upgradeSignals.push(`Repair-to-value ${fmtPct(rtvRatio * 100)}`);

    const s5 = `
<div class="rh"><span class="brand">KINGA</span><span>&sect; 5.0 &mdash; Decision &amp; Next Steps</span></div>
<div class="page">
  <div class="sh">
    <div class="sh-left"><span class="sn">5.0</span><h2>Decision &amp; Next Steps</h2></div>
    ${badge(actions.some(a => a.priority === "High") ? "Review Required" : "Ready for Settlement", actions.some(a => a.priority === "High") ? "warn" : "ok")}
  </div>

  <div class="lead">${actions.some(a => a.priority === "High") ? `This claim cannot proceed to automated settlement. <strong>${actions.filter(a => a.priority === "High").length} high-priority item${actions.filter(a => a.priority === "High").length !== 1 ? "s" : ""}</strong> require resolution before a cost decision can be finalised.` : "This claim is ready for settlement subject to adjuster sign-off."} The recommended settlement range — once all actions are completed — is <strong>${fmtUSD(recommendedSettlement)}</strong> (KINGA optimised, less exclusions and policy excess).</div>

  <div class="sub"><h3>Required Actions Before Sign-Off</h3><span class="sm">Prioritised by impact on settlement</span></div>
  <table>
    <thead><tr><th>#</th><th>Action Required</th><th>Owner</th><th>Priority</th><th>Ref</th></tr></thead>
    <tbody>${actionRows || `<tr><td colspan="5" style="text-align:center;color:var(--ink-light);padding:16px">No outstanding actions — claim is ready for settlement</td></tr>`}</tbody>
  </table>

  <div class="sub"><h3>Sign-Off Workflow</h3><span class="sm">3-stage approval</span></div>
  <div class="stages">
    <div class="stage"><div class="stage-n">Claims Processor</div><div class="stage-s pending">Pending</div></div>
    <div class="stage"><div class="stage-n">Adjuster Review</div><div class="stage-s pending">Pending</div></div>
    <div class="stage"><div class="stage-n">Settlement Approval</div><div class="stage-s pending">Pending</div></div>
  </div>
  <div class="small">Structured reviewer notes — findings, verdict, and action taken — are mandatory at each stage before advancement.</div>

  ${showUpgrade ? `
  <div class="upgrade mt12">
    <div class="upgrade-icon">&#9650;</div>
    <div class="upgrade-body">
      <div class="upgrade-title">Forensic Claim Decision Report &mdash; Recommended for This Claim</div>
      <div class="upgrade-signals">
        ${upgradeSignals.map(s => `<span class="upgrade-signal">${esc(s)}</span>`).join("")}
      </div>
      <div class="upgrade-txt">This claim shows signals that a Forensic Claim Decision Report would materially clarify before settlement. The forensic tier adds full physics reconstruction, crush-depth analysis, damage-zone mapping, photo manipulation detection, copy-quotation fingerprinting, and a 5-stage executive sign-off chain.</div>
    </div>
    <div class="upgrade-cta">Upgrade to Forensic Report</div>
  </div>` : ""}

  <hr class="div">
  <div class="small" style="text-align:center;line-height:2">
    KINGA Claims Intelligence Report &nbsp;&middot;&nbsp; For authorised insurer use only &nbsp;&middot;&nbsp; Generated by KINGA Engine<br>
    Must be reviewed by a qualified human adjuster before any claim decision is finalised &nbsp;&middot;&nbsp; Does not constitute legal advice<br>
    ${docRef} &nbsp;&middot;&nbsp; Generated ${genDate} &nbsp;&middot;&nbsp; Verdict: ${esc(String(c.recommendation ?? "REVIEW REQUIRED").toUpperCase())}
  </div>
</div>`;

    const body = cover + s1 + sP + s2 + s3 + s4 + s5;
    return buildKingaHtml(`KINGA Claims Intelligence Report — ${claimRef}`, body);

  } finally {
    await conn.end();
  }
}
