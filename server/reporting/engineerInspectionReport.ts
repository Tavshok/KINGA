/**
 * engineerInspectionReport.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Epic 3 — E3-T10
 *
 * Engineer Inspection Report
 *
 * A comprehensive, structured report produced at the conclusion of an
 * engineering inspection. Covers:
 *   - Inspection metadata (reference, type, asset, engineer, dates)
 *   - Physical measurements with standards references
 *   - Engineer observations (by severity)
 *   - AI analysis summary
 *   - Physics reconciliation flags
 *   - Recommendations and sign-off
 *
 * Access: engineer, admin, platform_super_admin (enforced in REPORT_ACCESS).
 * Design: KINGA design system — black / white / grey palette.
 */

import mysql from "mysql2/promise";
import {
  buildKingaHtml,
  esc,
  fmtD,
  chip,
  callout,
  safeJson,
} from "./templates/kingaDesignSystem";

const DB_URL = process.env.DATABASE_URL!;
async function getConn() {
  return mysql.createConnection(DB_URL);
}

// ── Severity colour map ───────────────────────────────────────────────────────
const SEVERITY_COLOURS: Record<string, string> = {
  critical: "#c0392b",
  major:    "#e67e22",
  moderate: "#f1c40f",
  minor:    "#27ae60",
  info:     "#2980b9",
};

function severityChip(severity: string): string {
  const colour = SEVERITY_COLOURS[severity] ?? "#888";
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;background:${colour};color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;">${esc(severity)}</span>`;
}

// ── Main generator ────────────────────────────────────────────────────────────

export async function generateEngineerInspectionReport(
  params: Record<string, unknown>
): Promise<string> {
  const inspectionId = Number(params.inspectionId ?? 0);
  if (!inspectionId) throw new Error("inspectionId is required");

  const conn = await getConn();
  try {
    // ── 1. Inspection header ──────────────────────────────────────────────────
    const [inspRows] = await conn.execute(
      `SELECT i.*,
              u.name AS engineer_name, u.email AS engineer_email
       FROM inspections i
       LEFT JOIN users u ON u.id = i.assigned_engineer_id
       WHERE i.id = ?
       LIMIT 1`,
      [inspectionId]
    ) as [Record<string, unknown>[], unknown];

    if (!inspRows.length) throw new Error(`Inspection ${inspectionId} not found`);
    const insp = inspRows[0];

    // ── 2. Measurements ───────────────────────────────────────────────────────
    const [measRows] = await conn.execute(
      `SELECT * FROM physical_measurements
       WHERE inspection_id = ?
       ORDER BY captured_at ASC`,
      [inspectionId]
    ) as [Record<string, unknown>[], unknown];
    const measurements = measRows as Record<string, unknown>[];

    // ── 3. Observations ───────────────────────────────────────────────────────
    const [obsRows] = await conn.execute(
      `SELECT eo.*,
              u.name AS authored_by_name
       FROM engineer_observations eo
       LEFT JOIN users u ON u.id = eo.authored_by
       WHERE eo.inspection_id = ?
       ORDER BY FIELD(eo.severity, 'critical','major','moderate','minor','info'), eo.authored_at ASC`,
      [inspectionId]
    ) as [Record<string, unknown>[], unknown];
    const observations = obsRows as Record<string, unknown>[];

    // ── 4. AI analysis ────────────────────────────────────────────────────────
    let aiAnalysis: Record<string, unknown> | null = null;
    if (insp.ai_analysis_json) {
      try { aiAnalysis = JSON.parse(String(insp.ai_analysis_json)); } catch { /* skip */ }
    }

    // ── 5. Build HTML ─────────────────────────────────────────────────────────
    const reportDate = new Date().toLocaleDateString("en-ZA", {
      year: "numeric", month: "long", day: "numeric",
    });

    // ── Section: Header ───────────────────────────────────────────────────────
    const headerSection = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;">
        <div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr><td style="padding:4px 0;color:#666;width:160px;">Inspection Reference</td><td style="font-weight:700;">${esc(String(insp.inspection_ref ?? ""))}</td></tr>
            <tr><td style="padding:4px 0;color:#666;">Inspection Type</td><td>${esc(String(insp.inspection_type ?? "").replace(/_/g, " ").toUpperCase())}</td></tr>
            <tr><td style="padding:4px 0;color:#666;">Asset Type</td><td>${esc(String(insp.asset_type ?? ""))}</td></tr>
            <tr><td style="padding:4px 0;color:#666;">Asset Reference</td><td>${esc(String(insp.asset_ref ?? insp.vehicle_registration ?? "—"))}</td></tr>
            <tr><td style="padding:4px 0;color:#666;">Status</td><td>${chip(String(insp.status ?? ""), insp.status === "complete" ? "pass" : "neutral")}</td></tr>
          </table>
        </div>
        <div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr><td style="padding:4px 0;color:#666;width:160px;">Assigned Engineer</td><td style="font-weight:700;">${esc(String(insp.engineer_name ?? "Unassigned"))}</td></tr>
            <tr><td style="padding:4px 0;color:#666;">Engineer Email</td><td>${esc(String(insp.engineer_email ?? "—"))}</td></tr>
            <tr><td style="padding:4px 0;color:#666;">Scheduled Date</td><td>${insp.scheduled_date ? fmtD(new Date(String(insp.scheduled_date))) : "—"}</td></tr>
            <tr><td style="padding:4px 0;color:#666;">Completed Date</td><td>${insp.completed_at ? fmtD(new Date(String(insp.completed_at))) : "—"}</td></tr>
            <tr><td style="padding:4px 0;color:#666;">Location</td><td>${esc(String(insp.location_address ?? "—"))}</td></tr>
          </table>
        </div>
      </div>
    `;

    // ── Section: AI Summary ───────────────────────────────────────────────────
    let aiSection = "";
    if (aiAnalysis) {
      const condColour = {
        good: "#27ae60", fair: "#f39c12", poor: "#e67e22", critical: "#c0392b",
      }[String(aiAnalysis.overallCondition ?? "")] ?? "#888";

      const riskColour = {
        low: "#27ae60", medium: "#f39c12", high: "#e67e22", critical: "#c0392b",
      }[String(aiAnalysis.riskLevel ?? "")] ?? "#888";

      const findings = (aiAnalysis.keyFindings as string[] ?? []).map(
        (f) => `<li style="margin-bottom:4px;">${esc(f)}</li>`
      ).join("");

      const actions = (aiAnalysis.recommendedActions as string[] ?? []).map(
        (a, i) => `<li style="margin-bottom:4px;"><strong>${i + 1}.</strong> ${esc(a)}</li>`
      ).join("");

      const anomalies = (aiAnalysis.measurementAnomalies as string[] ?? []);
      const compliance = (aiAnalysis.complianceConcerns as string[] ?? []);

      aiSection = `
        <h3 style="font-size:15px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">AI Analysis Summary</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
          <div style="background:#f8f8f8;padding:16px;border-radius:4px;">
            <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Overall Condition</div>
            <div style="font-size:22px;font-weight:700;color:${condColour};">${esc(String(aiAnalysis.overallCondition ?? "—").toUpperCase())}</div>
          </div>
          <div style="background:#f8f8f8;padding:16px;border-radius:4px;">
            <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Risk Level</div>
            <div style="font-size:22px;font-weight:700;color:${riskColour};">${esc(String(aiAnalysis.riskLevel ?? "—").toUpperCase())}</div>
          </div>
        </div>
        ${aiAnalysis.summary ? callout(String(aiAnalysis.summary), "default") : ""}
        ${findings ? `<h4 style="font-size:13px;font-weight:700;margin:16px 0 8px;">Key Findings</h4><ul style="margin:0;padding-left:20px;font-size:13px;">${findings}</ul>` : ""}
        ${actions ? `<h4 style="font-size:13px;font-weight:700;margin:16px 0 8px;">Recommended Actions</h4><ol style="margin:0;padding-left:20px;font-size:13px;">${actions}</ol>` : ""}
        ${anomalies.length ? callout(`Measurement anomalies: ${anomalies.join("; ")}`, "amber") : ""}
        ${compliance.length ? callout(`Compliance concerns: ${compliance.join("; ")}`, "red") : ""}
      `;
    }

    // ── Section: Measurements ─────────────────────────────────────────────────
    let measSection = "";
    if (measurements.length) {
      const rows = measurements.map((m) => `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px 6px;font-size:12px;">${esc(String(m.measurement_type ?? ""))}</td>
          <td style="padding:8px 6px;font-size:12px;text-align:right;font-weight:700;">${esc(String(m.value ?? ""))}</td>
          <td style="padding:8px 6px;font-size:12px;">${esc(String(m.unit ?? ""))}</td>
          <td style="padding:8px 6px;font-size:12px;">${esc(String(m.measurement_method ?? ""))}</td>
          <td style="padding:8px 6px;font-size:12px;">${esc(String(m.instrument ?? "—"))}</td>
          <td style="padding:8px 6px;font-size:12px;">${m.standards_code ? `${esc(String(m.standards_body ?? ""))} ${esc(String(m.standards_code ?? ""))} §${esc(String(m.standards_clause ?? ""))}` : "—"}</td>
          <td style="padding:8px 6px;font-size:12px;text-align:right;">${Math.round(Number(m.confidence ?? 0) * 100)}%</td>
        </tr>
      `).join("");

      measSection = `
        <h3 style="font-size:15px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">Physical Measurements (${measurements.length})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#111;color:#fff;">
              <th style="padding:8px 6px;text-align:left;font-weight:600;">Measurement</th>
              <th style="padding:8px 6px;text-align:right;font-weight:600;">Value</th>
              <th style="padding:8px 6px;text-align:left;font-weight:600;">Unit</th>
              <th style="padding:8px 6px;text-align:left;font-weight:600;">Method</th>
              <th style="padding:8px 6px;text-align:left;font-weight:600;">Instrument</th>
              <th style="padding:8px 6px;text-align:left;font-weight:600;">Standards Ref</th>
              <th style="padding:8px 6px;text-align:right;font-weight:600;">Confidence</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    } else {
      measSection = `<h3 style="font-size:15px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">Physical Measurements</h3>${callout("No measurements were recorded for this inspection.", "default")}`;
    }

    // ── Section: Observations ─────────────────────────────────────────────────
    let obsSection = "";
    if (observations.length) {
      const obsCards = observations.map((o) => `
        <div style="border:1px solid #e0e0e0;border-left:4px solid ${SEVERITY_COLOURS[String(o.severity ?? "info")] ?? "#888"};padding:12px 16px;margin-bottom:12px;border-radius:0 4px 4px 0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            ${severityChip(String(o.severity ?? "info"))}
            <span style="font-size:12px;color:#666;text-transform:uppercase;">${esc(String(o.observation_type ?? ""))}</span>
            ${o.component ? `<span style="font-size:12px;font-weight:700;">${esc(String(o.component))}</span>` : ""}
          </div>
          <p style="margin:0 0 8px;font-size:13px;">${esc(String(o.observation_text ?? o.voice_transcript ?? ""))}</p>
          ${o.recommendation ? `<p style="margin:0;font-size:12px;color:#444;"><strong>Recommendation:</strong> ${esc(String(o.recommendation))}</p>` : ""}
          ${o.standards_code ? `<p style="margin:4px 0 0;font-size:11px;color:#888;">Standards: ${esc(String(o.standards_body ?? ""))} ${esc(String(o.standards_code ?? ""))} §${esc(String(o.standards_clause ?? ""))}</p>` : ""}
          <p style="margin:4px 0 0;font-size:11px;color:#aaa;">Recorded by ${esc(String(o.authored_by_name ?? "engineer"))} · ${o.authored_at ? fmtD(new Date(String(o.authored_at))) : ""}</p>
        </div>
      `).join("");

      obsSection = `
        <h3 style="font-size:15px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">Observations (${observations.length})</h3>
        ${obsCards}
      `;
    } else {
      obsSection = `<h3 style="font-size:15px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">Observations</h3>${callout("No observations were recorded for this inspection.", "default")}`;
    }

    // ── Section: Physics Reconciliation ───────────────────────────────────────
    const physicsSection = insp.physics_reconciled
      ? `<h3 style="font-size:15px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">Physics Reconciliation</h3>
         ${callout(String(insp.reconciliation_notes ?? "Physics reconciliation completed."), "green")}`
      : "";

    // ── Section: Sign-off ─────────────────────────────────────────────────────
    const signoffSection = `
      <h3 style="font-size:15px;font-weight:700;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:6px;">Sign-off</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div>
          <p style="font-size:12px;color:#666;margin:0 0 4px;">Engineer</p>
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

    const body = headerSection + aiSection + measSection + obsSection + physicsSection + signoffSection;
    return buildKingaHtml(`Engineering Inspection Report — ${String(insp.inspection_ref ?? "")}`, body);
  } finally {
    await conn.end();
  }
}
