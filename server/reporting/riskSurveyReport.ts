/**
 * riskSurveyReport.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Epic 3 — E3-T10
 *
 * Risk Survey Report
 *
 * A risk-focused report produced from an engineering inspection. Designed for
 * underwriters and insurers. Covers:
 *   - Asset identification and risk profile
 *   - Critical and major observations (risk items)
 *   - Measurement deviations from standards
 *   - AI-derived risk level and compliance concerns
 *   - Recommended risk mitigation actions
 *   - Overall risk rating and underwriter guidance
 *
 * Access: engineer, admin, insurer_admin, platform_super_admin
 *         (enforced in REPORT_ACCESS in reportDefinitions.ts).
 * Design: KINGA design system — black / white / grey palette.
 */

import mysql from "mysql2/promise";
import {
  buildKingaHtml,
  esc,
  fmtD,
  chip,
  callout,
} from "./templates/kingaDesignSystem";

const DB_URL = process.env.DATABASE_URL!;
async function getConn() {
  return mysql.createConnection(DB_URL);
}

// ── Risk rating helpers ───────────────────────────────────────────────────────
const RISK_COLOURS: Record<string, string> = {
  critical: "#c0392b",
  high:     "#e67e22",
  medium:   "#f1c40f",
  low:      "#27ae60",
  minimal:  "#2980b9",
};

function riskBadge(level: string): string {
  const colour = RISK_COLOURS[level.toLowerCase()] ?? "#888";
  return `<span style="display:inline-block;padding:4px 16px;border-radius:4px;background:${colour};color:#fff;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${esc(level.toUpperCase())}</span>`;
}

// ── Main generator ────────────────────────────────────────────────────────────

export async function generateRiskSurveyReport(
  params: Record<string, unknown>
): Promise<string> {
  const inspectionId = Number(params.inspectionId ?? 0);
  if (!inspectionId) throw new Error("inspectionId is required");

  const conn = await getConn();
  try {
    // ── 1. Inspection + asset header ──────────────────────────────────────────
    const [inspRows] = await conn.execute(
      `SELECT i.*,
              u.name AS engineer_name, u.email AS engineer_email,
              ar.asset_name, ar.asset_type AS ar_asset_type,
              ar.manufacturer, ar.model, ar.serial_number, ar.year_of_manufacture,
              ar.location_address AS ar_location
       FROM inspections i
       LEFT JOIN users u ON u.id = i.assigned_engineer_id
       LEFT JOIN asset_registry ar ON ar.id = i.asset_registry_id
       WHERE i.id = ?
       LIMIT 1`,
      [inspectionId]
    ) as [Record<string, unknown>[], unknown];

    if (!inspRows.length) throw new Error(`Inspection ${inspectionId} not found`);
    const insp = inspRows[0];

    // ── 2. Critical and major observations only ───────────────────────────────
    const [obsRows] = await conn.execute(
      `SELECT eo.*, u.name AS authored_by_name
       FROM engineer_observations eo
       LEFT JOIN users u ON u.id = eo.authored_by
       WHERE eo.inspection_id = ?
         AND eo.severity IN ('critical', 'major', 'moderate')
       ORDER BY FIELD(eo.severity, 'critical','major','moderate'), eo.authored_at ASC`,
      [inspectionId]
    ) as [Record<string, unknown>[], unknown];
    const riskObservations = obsRows as Record<string, unknown>[];

    // ── 3. All observations count by severity ─────────────────────────────────
    const [sevRows] = await conn.execute(
      `SELECT severity, COUNT(*) AS cnt
       FROM engineer_observations
       WHERE inspection_id = ?
       GROUP BY severity`,
      [inspectionId]
    ) as [Record<string, unknown>[], unknown];
    const severityCounts: Record<string, number> = {};
    for (const row of sevRows as Record<string, unknown>[]) {
      severityCounts[String(row.severity)] = Number(row.cnt);
    }

    // ── 4. Measurements with standards references ─────────────────────────────
    const [measRows] = await conn.execute(
      `SELECT * FROM physical_measurements
       WHERE inspection_id = ?
         AND standards_code IS NOT NULL
       ORDER BY captured_at ASC`,
      [inspectionId]
    ) as [Record<string, unknown>[], unknown];
    const standardsMeasurements = measRows as Record<string, unknown>[];

    // ── 5. AI analysis ────────────────────────────────────────────────────────
    let aiAnalysis: Record<string, unknown> | null = null;
    if (insp.ai_analysis_json) {
      try { aiAnalysis = JSON.parse(String(insp.ai_analysis_json)); } catch { /* skip */ }
    }

    const reportDate = new Date().toLocaleDateString("en-ZA", {
      year: "numeric", month: "long", day: "numeric",
    });

    // ── Section: Cover ────────────────────────────────────────────────────────
    const riskLevel = String(aiAnalysis?.riskLevel ?? "unknown");
    const coverSection = `
      <div style="background:#111;color:#fff;padding:32px;margin-bottom:24px;border-radius:4px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#aaa;margin-bottom:8px;">Risk Survey Report</div>
        <div style="font-size:24px;font-weight:700;margin-bottom:4px;">${esc(String(insp.asset_name ?? insp.vehicle_registration ?? `Inspection ${insp.inspection_ref}`))}</div>
        <div style="font-size:14px;color:#ccc;margin-bottom:24px;">${esc(String(insp.ar_asset_type ?? insp.asset_type ?? ""))}</div>
        <div style="display:flex;align-items:center;gap:16px;">
          <div>
            <div style="font-size:11px;color:#aaa;margin-bottom:4px;">Overall Risk Rating</div>
            ${riskBadge(riskLevel)}
          </div>
          <div style="margin-left:32px;">
            <div style="font-size:11px;color:#aaa;margin-bottom:4px;">Inspection Reference</div>
            <div style="font-size:16px;font-weight:600;">${esc(String(insp.inspection_ref ?? ""))}</div>
          </div>
          <div style="margin-left:32px;">
            <div style="font-size:11px;color:#aaa;margin-bottom:4px;">Survey Date</div>
            <div style="font-size:16px;font-weight:600;">${insp.completed_at ? fmtD(new Date(String(insp.completed_at))) : reportDate}</div>
          </div>
        </div>
      </div>
    `;

    // ── Section: Asset Profile ────────────────────────────────────────────────
    const assetSection = `
      <h3 style="font-size:15px;font-weight:700;margin:0 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">Asset Profile</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:4px 0;color:#666;width:160px;">Asset Name</td><td style="font-weight:700;">${esc(String(insp.asset_name ?? insp.vehicle_registration ?? "—"))}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Asset Type</td><td>${esc(String(insp.ar_asset_type ?? insp.asset_type ?? "—"))}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Manufacturer</td><td>${esc(String(insp.manufacturer ?? "—"))}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Model</td><td>${esc(String(insp.model ?? "—"))}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Year of Manufacture</td><td>${esc(String(insp.year_of_manufacture ?? "—"))}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:4px 0;color:#666;width:160px;">Serial / VIN</td><td>${esc(String(insp.serial_number ?? insp.vehicle_registration ?? "—"))}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Location</td><td>${esc(String(insp.ar_location ?? insp.location_address ?? "—"))}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Surveying Engineer</td><td style="font-weight:700;">${esc(String(insp.engineer_name ?? "—"))}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Report Date</td><td>${reportDate}</td></tr>
        </table>
      </div>
    `;

    // ── Section: Risk Summary ─────────────────────────────────────────────────
    const totalObs = Object.values(severityCounts).reduce((a, b) => a + b, 0);
    const riskSummarySection = `
      <h3 style="font-size:15px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">Risk Summary</h3>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px;">
        ${["critical","major","moderate","minor","info"].map((sev) => `
          <div style="background:#f8f8f8;padding:12px;text-align:center;border-top:3px solid ${RISK_COLOURS[sev] ?? "#888"};">
            <div style="font-size:24px;font-weight:700;color:${RISK_COLOURS[sev] ?? "#888"};">${severityCounts[sev] ?? 0}</div>
            <div style="font-size:11px;text-transform:uppercase;color:#666;margin-top:4px;">${sev}</div>
          </div>
        `).join("")}
      </div>
      <p style="font-size:13px;color:#444;margin:0;">Total observations recorded: <strong>${totalObs}</strong></p>
    `;

    // ── Section: Compliance concerns ──────────────────────────────────────────
    const complianceConcerns = (aiAnalysis?.complianceConcerns as string[] ?? []);
    const complianceSection = complianceConcerns.length
      ? `<h3 style="font-size:15px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">Compliance Concerns</h3>
         ${callout(complianceConcerns.map((c, i) => `${i + 1}. ${c}`).join("<br>"), "red")}`
      : "";

    // ── Section: Risk Items (critical + major + moderate observations) ─────────
    let riskItemsSection = "";
    if (riskObservations.length) {
      const cards = riskObservations.map((o) => {
        const sev = String(o.severity ?? "info");
        const colour = RISK_COLOURS[sev] ?? "#888";
        return `
          <div style="border:1px solid #e0e0e0;border-left:4px solid ${colour};padding:12px 16px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="display:inline-block;padding:2px 10px;border-radius:12px;background:${colour};color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;">${esc(sev)}</span>
              <span style="font-size:12px;color:#666;text-transform:uppercase;">${esc(String(o.observation_type ?? ""))}</span>
              ${o.component ? `<span style="font-size:12px;font-weight:700;">${esc(String(o.component))}</span>` : ""}
            </div>
            <p style="margin:0 0 6px;font-size:13px;">${esc(String(o.observation_text ?? o.voice_transcript ?? ""))}</p>
            ${o.recommendation ? `<p style="margin:0;font-size:12px;color:#444;"><strong>Mitigation:</strong> ${esc(String(o.recommendation))}</p>` : ""}
            ${o.standards_code ? `<p style="margin:4px 0 0;font-size:11px;color:#888;">Standards: ${esc(String(o.standards_body ?? ""))} ${esc(String(o.standards_code ?? ""))} §${esc(String(o.standards_clause ?? ""))}</p>` : ""}
          </div>
        `;
      }).join("");

      riskItemsSection = `
        <h3 style="font-size:15px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">Risk Items (${riskObservations.length})</h3>
        ${cards}
      `;
    } else {
      riskItemsSection = `<h3 style="font-size:15px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">Risk Items</h3>${callout("No critical, major, or moderate observations recorded.", "green")}`;
    }

    // ── Section: Standards Measurements ───────────────────────────────────────
    let standardsSection = "";
    if (standardsMeasurements.length) {
      const rows = standardsMeasurements.map((m) => `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px 6px;font-size:12px;">${esc(String(m.measurement_type ?? ""))}</td>
          <td style="padding:8px 6px;font-size:12px;text-align:right;font-weight:700;">${esc(String(m.value ?? ""))} ${esc(String(m.unit ?? ""))}</td>
          <td style="padding:8px 6px;font-size:12px;">${esc(String(m.standards_body ?? ""))} ${esc(String(m.standards_code ?? ""))} §${esc(String(m.standards_clause ?? ""))}</td>
          <td style="padding:8px 6px;font-size:12px;">${m.notes ? esc(String(m.notes)) : "—"}</td>
        </tr>
      `).join("");

      standardsSection = `
        <h3 style="font-size:15px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">Standards-Referenced Measurements</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#111;color:#fff;">
              <th style="padding:8px 6px;text-align:left;">Measurement</th>
              <th style="padding:8px 6px;text-align:right;">Value</th>
              <th style="padding:8px 6px;text-align:left;">Standards Reference</th>
              <th style="padding:8px 6px;text-align:left;">Notes</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }

    // ── Section: Recommended Actions ──────────────────────────────────────────
    const actions = (aiAnalysis?.recommendedActions as string[] ?? []);
    const actionsSection = actions.length
      ? `<h3 style="font-size:15px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">Recommended Risk Mitigation Actions</h3>
         <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.8;">
           ${actions.map((a) => `<li>${esc(a)}</li>`).join("")}
         </ol>`
      : "";

    // ── Section: Underwriter Guidance ─────────────────────────────────────────
    const guidanceMap: Record<string, string> = {
      low:      "Asset presents a low risk profile. Standard underwriting terms apply.",
      minimal:  "Asset presents a minimal risk profile. Standard underwriting terms apply.",
      medium:   "Asset presents a moderate risk profile. Consider risk-adjusted premium or conditional cover pending mitigation of identified items.",
      high:     "Asset presents a high risk profile. Underwriter review required before binding cover. Mitigation plan must be submitted.",
      critical: "Asset presents a critical risk profile. Cover should not be bound until all critical and major risk items are resolved and re-inspected.",
    };
    const guidance = guidanceMap[riskLevel.toLowerCase()] ?? "Underwriter review required.";
    const guidanceSection = `
      <h3 style="font-size:15px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">Underwriter Guidance</h3>
      ${callout(guidance, riskLevel === "low" || riskLevel === "minimal" ? "green" : riskLevel === "medium" ? "amber" : "red")}
    `;

    // ── Section: Sign-off ─────────────────────────────────────────────────────
    const signoffSection = `
      <h3 style="font-size:15px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">Surveyor Declaration</h3>
      <p style="font-size:13px;color:#444;margin:0 0 16px;">
        I confirm that the information contained in this Risk Survey Report is accurate to the best of my knowledge and is based on a physical inspection conducted on the date stated above.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div>
          <p style="font-size:12px;color:#666;margin:0 0 4px;">Surveying Engineer</p>
          <p style="font-size:14px;font-weight:700;margin:0;">${esc(String(insp.engineer_name ?? "—"))}</p>
          <p style="font-size:12px;color:#888;margin:4px 0 0;">${esc(String(insp.engineer_email ?? ""))}</p>
          <div style="margin-top:24px;border-top:1px solid #ccc;padding-top:4px;font-size:11px;color:#aaa;">Signature / Date</div>
        </div>
        <div>
          <p style="font-size:12px;color:#666;margin:0 0 4px;">Report Generated</p>
          <p style="font-size:14px;font-weight:700;margin:0;">${reportDate}</p>
          <p style="font-size:11px;color:#aaa;margin:4px 0 0;">KINGA AutoVerify AI — Engineering Workspace</p>
        </div>
      </div>
    `;

    const body = coverSection + assetSection + riskSummarySection + complianceSection +
                 riskItemsSection + standardsSection + actionsSection + guidanceSection + signoffSection;

    return buildKingaHtml(`Risk Survey Report — ${String(insp.inspection_ref ?? "")}`, body);
  } finally {
    await conn.end();
  }
}
