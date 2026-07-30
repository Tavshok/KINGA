/**
 * T7: Vehicle Verification Report
 *
 * Produced for agency users. Summarises KINGA's cross-referenced intelligence
 * on a specific vehicle registration: ownership history, claims history,
 * pre-existing damage flags, stolen status, and risk score.
 *
 * Access: agency role only (enforced in REPORT_ACCESS in reportDefinitions.ts).
 * Design: black / white / grey palette, KINGA design system.
 */

import mysql from "mysql2/promise";
import {
  buildKingaHtml, esc, fmtD, chip, callout, safeJson,
} from "./templates/kingaDesignSystem";

const DB_URL = process.env.DATABASE_URL!;
async function getConn() { return mysql.createConnection(DB_URL); }

export async function generateVehicleVerificationReport(
  params: Record<string, unknown>
): Promise<string> {
  const registration = String(params.registration ?? "").trim().toUpperCase();
  if (!registration) throw new Error("Vehicle registration is required");

  const conn = await getConn();
  try {
    // ── 1. Vehicle history record ─────────────────────────────────────────────
    const [vhRows] = await conn.execute(
      `SELECT vh.vehicle_registration, vh.vehicle_make, vh.vehicle_model, vh.vehicle_year,
              vh.vin, vh.total_claims, vh.total_claim_amount, vh.last_claim_date,
              vh.has_pre_existing_damage, vh.is_salvage_title, vh.has_odometer_fraud,
              vh.is_stolen, vh.ownership_change_count, vh.unique_drivers_count,
              vh.non_owner_accident_count, vh.risk_score,
              vh.ownership_history, vh.driver_history
       FROM vehicle_history vh
       WHERE vh.vehicle_registration = ?
       LIMIT 1`,
      [registration]
    ) as [Record<string, unknown>[], unknown];

    const vh = vhRows[0] ?? null;

    // ── 2. Claims linked to this registration ─────────────────────────────────
    const [claimRows] = await conn.execute(
      `SELECT c.id, c.claim_number, c.kinga_ref, c.incident_date, c.incident_type,
              c.status, c.lodger_name, c.insurer_name,
              a.fraud_score, a.recommendation, a.estimated_cost, a.fraud_risk_level
       FROM claims c
       LEFT JOIN ai_assessments a ON a.claim_id = c.id
       WHERE c.vehicle_registration = ?
       ORDER BY c.created_at DESC
       LIMIT 20`,
      [registration]
    ) as [Record<string, unknown>[], unknown];

    const claimList = claimRows as Record<string, unknown>[];

    // ── 3. Build HTML ─────────────────────────────────────────────────────────
    const reportDate = new Date().toLocaleDateString("en-ZA", {
      day: "2-digit", month: "long", year: "numeric",
    });

    const riskScore = Number(vh?.risk_score ?? 0);
    const riskChip = riskScore >= 70
      ? chip("HIGH RISK", "fail")
      : riskScore >= 40
        ? chip("MEDIUM RISK", "warn")
        : chip("LOW RISK", "pass");

    const flagsHtml = [
      vh?.is_stolen       ? chip("STOLEN",           "fail") : "",
      vh?.is_salvage_title? chip("SALVAGE TITLE",     "fail") : "",
      vh?.has_odometer_fraud ? chip("ODOMETER FRAUD", "fail") : "",
      vh?.has_pre_existing_damage ? chip("PRE-EXISTING DAMAGE", "warn") : "",
    ].filter(Boolean).join(" ") || chip("NO FLAGS", "pass");

    const vehicleDesc = vh
      ? `${esc(vh.vehicle_year)} ${esc(vh.vehicle_make)} ${esc(vh.vehicle_model)}`
      : `Registration: ${esc(registration)}`;

    const claimsTableRows = claimList.map(c => `
      <tr>
        <td>${esc(c.kinga_ref ?? c.claim_number)}</td>
        <td>${fmtD(c.incident_date)}</td>
        <td>${esc(c.incident_type)}</td>
        <td>${esc(c.insurer_name)}</td>
        <td>${esc(c.status)}</td>
        <td>${c.fraud_score != null ? `${Number(c.fraud_score).toFixed(0)}%` : "—"}</td>
        <td>${esc(c.recommendation ?? "—")}</td>
      </tr>`).join("");

    const body = `
      <div class="kinga-section">
        <div class="kinga-section-header">Vehicle Identity</div>
        <table class="kinga-table">
          <tbody>
            <tr><th>Registration</th><td><strong>${esc(registration)}</strong></td>
                <th>Risk Score</th><td>${riskScore}/100 &nbsp;${riskChip}</td></tr>
            <tr><th>Vehicle</th><td>${vehicleDesc}</td>
                <th>VIN</th><td>${esc(vh?.vin ?? "—")}</td></tr>
            <tr><th>Flags</th><td colspan="3">${flagsHtml}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="kinga-section">
        <div class="kinga-section-header">Claims Intelligence</div>
        <table class="kinga-table">
          <tbody>
            <tr><th>Total Claims on Record</th><td>${Number(vh?.total_claims ?? claimList.length)}</td>
                <th>Total Claimed Amount</th><td>${vh?.total_claim_amount ? `ZAR ${(Number(vh.total_claim_amount) / 100).toLocaleString("en-ZA")}` : "—"}</td></tr>
            <tr><th>Last Claim Date</th><td>${fmtD(vh?.last_claim_date)}</td>
                <th>Unique Drivers</th><td>${Number(vh?.unique_drivers_count ?? 0)}</td></tr>
            <tr><th>Ownership Changes</th><td>${Number(vh?.ownership_change_count ?? 0)}</td>
                <th>Non-Owner Accidents</th><td>${Number(vh?.non_owner_accident_count ?? 0)}</td></tr>
          </tbody>
        </table>
      </div>

      ${claimList.length > 0 ? `
      <div class="kinga-section">
        <div class="kinga-section-header">Claim History (${claimList.length} record${claimList.length !== 1 ? "s" : ""})</div>
        <table class="kinga-table">
          <thead>
            <tr>
              <th>KINGA Ref</th><th>Incident Date</th><th>Type</th>
              <th>Insurer</th><th>Status</th><th>Fraud Score</th><th>Recommendation</th>
            </tr>
          </thead>
          <tbody>${claimsTableRows}</tbody>
        </table>
      </div>` : callout("No claims on record for this vehicle registration.", "green")}

      ${riskScore >= 70 ? callout(
        `<strong>High-Risk Vehicle:</strong> This vehicle has a risk score of ${riskScore}/100. ` +
        `Review all flags and claim history carefully before proceeding.`,
        "red"
      ) : ""}
    `;

    const reportTitle = `Vehicle Verification Report — ${registration}`;
    const headerHtml = `
      <div class="kinga-header">
        <div class="kinga-header-title">${esc(reportTitle)}</div>
        <div class="kinga-header-meta">Report Date: ${esc(reportDate)} &nbsp;|&nbsp; Generated by KINGA AutoVerify AI</div>
      </div>
    `;

    return buildKingaHtml(reportTitle, headerHtml + body);
  } finally {
    await conn.end();
  }
}
