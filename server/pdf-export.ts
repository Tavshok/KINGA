// @ts-nocheck
/**
 * PDF Export Module for KINGA Assessment Reports
 * Generates professional PDF reports with all visualizations and AI commentary
 */

import { z } from "zod";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { storagePut } from "./storage";
import { insurerDomainProcedure } from "./_core/trpc";
import {
  resolveReportRecord,
  type ResolvedReportRecord,
} from "./reporting/resolvedReportRecord";
import {
  buildP0A2CollisionPhysicsAbstentionText,
} from "./reporting/p0PhysicsPresentation";
import { renderP0B1FraudAbstentionMarker } from "./reporting/p0FraudPresentation";
import puppeteer from "puppeteer-core";

const canonicalAssessmentPdfInput = Symbol("canonicalAssessmentPdfInput");

/**
 * Maps only the authoritative canonical report record into the legacy template.
 * No caller-supplied visual, monetary, fraud, or decision value can influence
 * the exported assessment PDF.
 */
export function toAssessmentPdfCanonicalInput(record: ResolvedReportRecord) {
  return {
    [canonicalAssessmentPdfInput]: true,
    vehicleMake: record.vehicle.make,
    vehicleModel: record.vehicle.model,
    vehicleYear: record.vehicle.year,
    vehicleRegistration: record.vehicle.registration,
    // A legacy assessment description may contain an ungoverned collision
    // conclusion. Descriptive source media remains available in the governed
    // record, but its free text is not a PDF publication authority.
    damageDescription: null,
    estimatedCost: record.assessment.estimatedCost,
    // P0-A-2/B1: never pass collision-physics or fraud payloads into the
    // legacy template. Each presentation marker is rendered independently.
    damagedComponents: [],
    crossValidation: null,
    accidentType: record.incident.type,
    accidentDate: record.incident.date,
    accidentDescription: null,
    claimantName: record.claim.lodgerName,
    claimNumber: record.scope.claimNumber,
  };
}

/**
 * The legacy HTML renderer historically accepted arbitrary objects. That route
 * cannot establish evidence provenance, so it now fails closed to a minimal
 * non-physics projection. Only the canonical adapter above carries the private
 * marker that permits persisted identifiers and cost fields into the template.
 */
function projectP0A2AssessmentPdfInput(data: unknown): Record<string, any> {
  if (
    typeof data === "object" &&
    data !== null &&
    (data as Record<PropertyKey, unknown>)[canonicalAssessmentPdfInput] === true
  ) {
    return data as Record<string, any>;
  }

  return {
    vehicleMake: null,
    vehicleModel: null,
    vehicleYear: null,
    vehicleRegistration: null,
    damageDescription: null,
    estimatedCost: null,
    physicsAnalysis: null,
    fraudAnalysis: null,
    damagePhotos: [],
    damagedComponents: [],
    crossValidation: null,
    normalizedComponents: [],
    componentRecommendations: [],
    itemizedCosts: [],
    accidentType: null,
    accidentDate: null,
    accidentDescription: null,
    assessorName: null,
    repairerName: null,
    claimantName: null,
    claimNumber: null,
    collisionPhysics: null,
  };
}

/**
 * Generate HTML content for the PDF report
 */
export function generateAssessmentReportHTML(data: any): string {
  const safeData = projectP0A2AssessmentPdfInput(data);
  const {
    vehicleMake,
    vehicleModel,
    vehicleYear,
    vehicleRegistration,
    damageDescription,
    estimatedCost,
    originalQuote,
    agreedCost,
    savings,
    physicsAnalysis,
    fraudAnalysis,
    damagePhotos,
    damagedComponents,
    crossValidation,
    normalizedComponents,
    componentRecommendations,
    itemizedCosts,
    accidentType,
    accidentDate,
    accidentDescription,
    assessorName,
    repairerName,
    claimantName,
    claimNumber,
  } = safeData;

  // P0-A-2: legacy raw collision fields are deliberately not read, interpreted,
  // or rendered by this exporter. Keep the value textual so it cannot become an
  // apparent numeric zero or confidence score in the output.
  const collisionPhysicsHold = buildP0A2CollisionPhysicsAbstentionText();

  void fraudAnalysis;
  const fraudDecisionHold = renderP0B1FraudAbstentionMarker();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KINGA Assessment Report - ${vehicleRegistration || "N/A"}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #333;
    }
    
    .header {
      text-align: center;
      padding: 20px 0;
      border-bottom: 3px solid #2563eb;
      margin-bottom: 30px;
    }
    
    .header h1 {
      font-size: 24pt;
      color: #1e40af;
      margin-bottom: 5px;
    }
    
    .header p {
      font-size: 10pt;
      color: #64748b;
    }
    
    .section {
      margin-bottom: 25px;
      page-break-inside: avoid;
    }
    
    .section-title {
      font-size: 16pt;
      font-weight: bold;
      color: #1e40af;
      margin-bottom: 12px;
      padding-bottom: 5px;
      border-bottom: 2px solid #e2e8f0;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 15px;
    }
    
    .info-item {
      padding: 8px;
      background: #f8fafc;
      border-left: 3px solid #2563eb;
    }
    
    .info-label {
      font-weight: bold;
      color: #475569;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .info-value {
      font-size: 11pt;
      color: #1e293b;
      margin-top: 2px;
    }
    
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 9pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .badge-success {
      background: #dcfce7;
      color: #166534;
    }
    
    .badge-warning {
      background: #fef3c7;
      color: #92400e;
    }
    
    .badge-danger {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .commentary-box {
      background: #f1f5f9;
      border-left: 4px solid #2563eb;
      padding: 15px;
      margin: 15px 0;
      font-size: 10pt;
      line-height: 1.8;
    }
    
    .findings-list {
      list-style: none;
      padding: 0;
    }
    
    .findings-list li {
      padding: 8px 0;
      border-bottom: 1px solid #e2e8f0;
      font-size: 10pt;
    }
    
    .findings-list li:before {
      content: "▸ ";
      color: #2563eb;
      font-weight: bold;
      margin-right: 8px;
    }
    
    .recommendations {
      background: #fffbeb;
      border: 1px solid #fbbf24;
      border-radius: 8px;
      padding: 15px;
      margin: 15px 0;
    }
    
    .recommendations h4 {
      color: #92400e;
      margin-bottom: 10px;
      font-size: 11pt;
    }
    
    .recommendations ul {
      margin-left: 20px;
      font-size: 10pt;
    }
    
    .recommendations li {
      margin-bottom: 6px;
      color: #78350f;
    }
    
    .cost-highlight {
      background: #dbeafe;
      border: 2px solid #2563eb;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 20px 0;
    }
    
    .cost-highlight .label {
      font-size: 10pt;
      color: #1e40af;
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .cost-highlight .amount {
      font-size: 28pt;
      color: #1e3a8a;
      font-weight: bold;
      margin: 5px 0;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e2e8f0;
      text-align: center;
      font-size: 9pt;
      color: #64748b;
    }
    
    .page-break {
      page-break-after: always;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      font-size: 10pt;
    }
    
    th {
      background: #f1f5f9;
      padding: 10px;
      text-align: left;
      font-weight: bold;
      color: #1e40af;
      border-bottom: 2px solid #2563eb;
    }
    
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #e2e8f0;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <h1>KINGA AI</h1>
    <p>Vehicle Damage Assessment Report</p>
    <p style="margin-top: 10px; font-size: 9pt;">Generated: ${new Date().toLocaleString("en-US", { timeZone: "Africa/Harare" })}</p>
  </div>

  <!-- Vehicle Information -->
  <div class="section">
    <h2 class="section-title">Vehicle Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Make & Model</div>
        <div class="info-value">${vehicleMake || "N/A"} ${vehicleModel || ""}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Year</div>
        <div class="info-value">${vehicleYear || "N/A"}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Registration</div>
        <div class="info-value">${vehicleRegistration || "N/A"}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Assessment Date</div>
        <div class="info-value">${new Date().toLocaleDateString("en-US")}</div>
      </div>
    </div>
  </div>

  <!-- Cost Estimate -->
  <div class="cost-highlight">
    <div class="label">Estimated Repair Cost</div>
    <div class="amount">$ ${estimatedCost?.toLocaleString() || "0"}</div>
  </div>

  <!-- Damage Description -->
  <div class="section">
    <h2 class="section-title">Damage Assessment</h2>
    <div class="commentary-box">
      ${damageDescription || "No damage description provided."}
    </div>
    
    ${
      damagedComponents && damagedComponents.length > 0
        ? `
    <h3 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px;">Damaged Components</h3>
    <ul class="findings-list">
      ${damagedComponents.map((comp: string) => `<li>${comp}</li>`).join("")}
    </ul>
    `
        : ""
    }
    
    ${
      damagePhotos && damagePhotos.length > 0
        ? `
    <h3 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px;">Damage Photos</h3>
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-top: 15px;">
      ${damagePhotos
        .slice(0, 4)
        .map(
          (photo: string) => `
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <img src="${photo}" style="width: 100%; height: auto; display: block;" />
        </div>
      `
        )
        .join("")}
    </div>
    ${damagePhotos.length > 4 ? `<p style="margin-top: 10px; font-size: 9pt; color: #64748b; text-align: center;">Showing 4 of ${damagePhotos.length} photos</p>` : ""}
    `
        : ""
    }
  </div>

  <div class="page-break"></div>

  <!-- Collision Physics -->
  <div class="section">
    <h2 class="section-title">Collision Physics Withheld — Manual Review Required</h2>
    <div class="commentary-box" data-p0-collision-physics="withheld">
      ${collisionPhysicsHold}
    </div>
  </div>

  <div class="page-break"></div>

  <!-- Fraud decision boundary -->
  <div class="section">
    ${fraudDecisionHold}
  </div>

  <div class="page-break"></div>

  <!-- Cross-Validation Analysis -->
  ${
    crossValidation
      ? `
  <div class="section">
    <h2 class="section-title">Quote vs Photo Cross-Validation</h2>
    
    <div style="margin-bottom: 15px;">
      <strong>Validation Risk: </strong>
      <span class="badge ${crossValidation.summary?.overallRiskLevel === "low" ? "badge-success" : crossValidation.summary?.overallRiskLevel === "medium" ? "badge-warning" : "badge-danger"}">
        ${crossValidation.summary?.overallRiskScore || 0}/100
      </span>
    </div>

    <div class="commentary-box">
      <strong>Summary:</strong> ${crossValidation.summary?.confirmedCount || 0} quoted parts confirmed visible in photos.
      ${crossValidation.summary?.suspiciousCount > 0 ? `<strong style="color:#dc2626;">${crossValidation.summary.suspiciousCount} externally-visible part(s) were quoted but not detected in photos.</strong>` : "All externally-visible quoted parts were verified."}
      ${crossValidation.summary?.visibleNotQuotedCount > 0 ? ` ${crossValidation.summary.visibleNotQuotedCount} area(s) of visible damage were not included in the repair quote.` : ""}
      ${crossValidation.summary?.legitimateHiddenCount > 0 ? ` ${crossValidation.summary.legitimateHiddenCount} internal/hidden component(s) quoted but cannot be verified from photos alone.` : ""}
    </div>

    <table>
      <tr>
        <th>Category</th>
        <th>Count</th>
        <th>Status</th>
      </tr>
      <tr>
        <td>Confirmed (Quoted + Visible)</td>
        <td>${crossValidation.summary?.confirmedCount || 0}</td>
        <td><span class="badge badge-success">VERIFIED</span></td>
      </tr>
      <tr>
        <td>Quoted Not Visible (Suspicious)</td>
        <td>${crossValidation.summary?.suspiciousCount || 0}</td>
        <td><span class="badge badge-danger">INVESTIGATE</span></td>
      </tr>
      <tr>
        <td>Quoted Not Visible (Hidden/Internal)</td>
        <td>${crossValidation.summary?.legitimateHiddenCount || 0}</td>
        <td><span class="badge badge-warning">ACCEPTABLE</span></td>
      </tr>
      <tr>
        <td>Visible Not Quoted</td>
        <td>${crossValidation.summary?.visibleNotQuotedCount || 0}</td>
        <td><span class="badge badge-warning">REVIEW</span></td>
      </tr>
    </table>

    ${
      crossValidation.items && crossValidation.items.length > 0
        ? `
    <h3 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px;">Detailed Part Validation</h3>
    <table>
      <tr>
        <th>Part Name</th>
        <th>Zone</th>
        <th>Category</th>
        <th>Cost</th>
        <th>Confidence</th>
      </tr>
      ${crossValidation.items
        .map(
          (item: any) => `
      <tr>
        <td>${item.partName || item.rawName}</td>
        <td>${item.zone || "—"}</td>
        <td><span class="badge ${item.category === "confirmed" ? "badge-success" : item.category === "quoted_not_visible" ? (item.isExternallyVisible ? "badge-danger" : "badge-warning") : "badge-warning"}">
          ${item.category === "confirmed" ? "Confirmed" : item.category === "quoted_not_visible" ? (item.isExternallyVisible ? "Suspicious" : "Hidden") : "Unquoted"}
        </span></td>
        <td>${item.quotedCost ? "R" + item.quotedCost.toLocaleString() : "—"}</td>
        <td>${item.confidence ? Math.round(item.confidence * 100) + "%" : "—"}</td>
      </tr>
      `
        )
        .join("")}
    </table>
    `
        : ""
    }

    ${
      crossValidation.fraudIndicators &&
      crossValidation.fraudIndicators.length > 0
        ? `
    <div class="recommendations">
      <h4>Cross-Validation Fraud Indicators</h4>
      <ul>
        ${crossValidation.fraudIndicators.map((ind: string) => `<li>${ind}</li>`).join("")}
      </ul>
    </div>
    `
        : ""
    }

    ${
      crossValidation.recommendations &&
      crossValidation.recommendations.length > 0
        ? `
    <div class="recommendations" style="background: #f0fdf4; border-color: #22c55e;">
      <h4 style="color: #166534;">Recommendations</h4>
      <ul>
        ${crossValidation.recommendations.map((rec: string) => `<li style="color: #166534;">${rec}</li>`).join("")}
      </ul>
    </div>
    `
        : ""
    }
  </div>
  `
      : ""
  }

  <!-- Component Recommendations -->
  ${
    componentRecommendations && componentRecommendations.length > 0
      ? `
  <div class="page-break"></div>
  <div class="section">
    <h2 class="section-title">AI Component Recommendations</h2>
    <table>
      <tr>
        <th>Component</th>
        <th>Action</th>
        <th>Severity</th>
        <th>Est. Cost</th>
        <th>Labour (hrs)</th>
      </tr>
      ${componentRecommendations
        .map(
          (rec: any) => `
      <tr>
        <td>${rec.component}</td>
        <td><span class="badge ${rec.action === "replace" ? "badge-danger" : "badge-warning"}">${rec.action.toUpperCase()}</span></td>
        <td><span class="badge ${rec.severity === "severe" ? "badge-danger" : rec.severity === "moderate" ? "badge-warning" : "badge-success"}">${rec.severity}</span></td>
        <td>$${rec.estimatedCost?.toLocaleString() || "0"}</td>
        <td>${rec.laborHours || "—"}</td>
      </tr>
      `
        )
        .join("")}
      <tr style="font-weight: bold; border-top: 2px solid #2563eb;">
        <td colspan="3">Total</td>
        <td>$${componentRecommendations.reduce((s: number, r: any) => s + (r.estimatedCost || 0), 0).toLocaleString()}</td>
        <td>${componentRecommendations.reduce((s: number, r: any) => s + (r.laborHours || 0), 0)}</td>
      </tr>
    </table>

    ${
      componentRecommendations.some((r: any) => r.reasoning)
        ? `
    <h3 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px;">Reasoning</h3>
    ${componentRecommendations
      .filter((r: any) => r.reasoning)
      .map(
        (rec: any) => `
    <div style="margin-bottom: 8px; padding: 8px; background: #f8fafc; border-left: 3px solid #2563eb;">
      <strong>${rec.component}:</strong> ${rec.reasoning}
    </div>
    `
      )
      .join("")}
    `
        : ""
    }
  </div>
  `
      : ""
  }

  <!-- Itemized Costs -->
  ${
    itemizedCosts && itemizedCosts.length > 0
      ? `
  <div class="section">
    <h2 class="section-title">Itemized Cost Breakdown</h2>
    <table>
      <tr>
        <th>Description</th>
        <th>Category</th>
        <th style="text-align: right;">Amount</th>
      </tr>
      ${itemizedCosts
        .map(
          (item: any) => `
      <tr>
        <td>${item.description}</td>
        <td>${item.category || "other"}</td>
        <td style="text-align: right;">$${item.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "0.00"}</td>
      </tr>
      `
        )
        .join("")}
      <tr style="font-weight: bold; border-top: 2px solid #2563eb;">
        <td colspan="2">Total</td>
        <td style="text-align: right;">$${itemizedCosts.reduce((s: number, i: any) => s + (i.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
      </tr>
    </table>
  </div>
  `
      : ""
  }

  <!-- Normalized Component Mapping -->
  ${
    normalizedComponents && normalizedComponents.length > 0
      ? `
  <div class="section">
    <h2 class="section-title">Component Name Resolution</h2>
    <p style="font-size: 10pt; color: #64748b; margin-bottom: 10px;">Raw component names from the assessment mapped to standardized vehicle part taxonomy</p>
    <table>
      <tr>
        <th>Raw Name (from PDF)</th>
        <th>Normalized Name</th>
        <th>Vehicle Zone</th>
      </tr>
      ${normalizedComponents
        .map(
          (nc: any) => `
      <tr>
        <td>${nc.raw}</td>
        <td>${nc.normalized}</td>
        <td>${nc.zone ? nc.zone.replace(/_/g, " ") : "—"}</td>
      </tr>
      `
        )
        .join("")}
    </table>
  </div>
  `
      : ""
  }

  <!-- Footer -->
  <div class="footer">
    <p><strong>KINGA AI</strong> - Automated Vehicle Damage Assessment System</p>
    <p>This report was generated using advanced KINGA analysis, physics validation, and cross-validation</p>
    ${claimNumber ? `<p style="margin-top: 5px;">Claim Reference: ${claimNumber}</p>` : ""}
    ${assessorName ? `<p>Assessor: ${assessorName}</p>` : ""}
    <p style="margin-top: 10px; font-size: 8pt;">Confidential - For Insurance Use Only</p>
  </div>
</body>
</html>
  `;
}

/**
 * Export assessment report as PDF
 */
export const assessmentPdfExportInputSchema = z.object({
  claimId: z.number().int().positive(),
});

export const exportAssessmentPDF = insurerDomainProcedure
  .input(assessmentPdfExportInputSchema)
  .mutation(
    async ({ ctx, input }: { ctx: any; input: { claimId: number } }) => {
    try {
      const tenantId = ctx.insurerTenantId;
        if (!tenantId)
          throw new Error("A tenant-scoped insurer session is required");
      let record: ResolvedReportRecord;
      try {
          record = await resolveReportRecord({
            claimId: input.claimId,
            tenantId,
            audience: "claim_assessment",
          });
      } catch (error) {
          if (
            error instanceof Error &&
            /not found in the current tenant scope/i.test(error.message)
          ) {
          throw new Error("Claim not found or access denied");
        }
        throw error;
      }
      const data = toAssessmentPdfCanonicalInput(record);
      // Generate HTML content
      const htmlContent = generateAssessmentReportHTML(data);

      // Create temporary files
        const tempId = randomBytes(16).toString("hex");
      const htmlPath = join(tmpdir(), `kinga-report-${tempId}.html`);
      const pdfPath = join(tmpdir(), `kinga-report-${tempId}.pdf`);

      // Write HTML to file
        await writeFile(htmlPath, htmlContent, "utf-8");

      // Convert HTML to PDF using puppeteer-core + Chromium
      let pdfBuffer: Buffer;
      let browser;
      try {
        browser = await puppeteer.launch({
            executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
          headless: true,
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
              "--disable-gpu",
            ],
        });
        const page = await browser.newPage();
          await page.goto(`file://${htmlPath}`, {
            waitUntil: "networkidle0",
            timeout: 30000,
          });
          pdfBuffer = Buffer.from(
            await page.pdf({
              format: "A4",
          printBackground: true,
              margin: {
                top: "10mm",
                bottom: "10mm",
                left: "10mm",
                right: "10mm",
              },
            })
          );
      } finally {
        if (browser) await browser.close();
      }

      // Upload to S3
      const fileName = `assessment-report-${data.vehicleRegistration || tempId}-${Date.now()}.pdf`;
      const { url } = await storagePut(
        `reports/${fileName}`,
        pdfBuffer,
          "application/pdf"
      );

      // Clean up temporary files
      await Promise.all([
        unlink(htmlPath).catch(() => {}),
        unlink(pdfPath).catch(() => {}),
      ]);

      return {
        success: true,
        pdfUrl: url,
        fileName,
      };
    } catch (error: any) {
        console.error("PDF export error:", error);
      throw new Error(`Failed to generate PDF: ${error.message}`);
    }
    }
  );
