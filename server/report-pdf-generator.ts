// @ts-nocheck
/**
 * KINGA Report PDF Generation Service
 * 
 * Generates professional PDF reports from claim intelligence and narrative content
 * using HTML templates and WeasyPrint for PDF rendering
 */

import { writeFile, unlink } from "fs/promises";
import path from "path";
import type { ClaimIntelligence } from "./report-intelligence-aggregator";
import type { ReportNarrative } from "./report-narrative-generator";
import type { ReportVisualizations } from "./report-visualization-generator";
import {
  generateGaugeSVG,
  generateHeatScaleSVG,
} from "./report-visualization-generator";
import puppeteer from "puppeteer-core";

export interface ReportPDFOptions {
  role: "insurer" | "assessor" | "regulatory";
  includeVisualizations: boolean;
  includeSupportingEvidence: boolean;
}

/**
 * Generate a PDF report for a claim
 */
export async function generateReportPDF(
  intelligence: ClaimIntelligence,
  narrative: ReportNarrative,
  visualizations: ReportVisualizations,
  options: ReportPDFOptions
): Promise<Buffer> {
  // Generate HTML content
  const htmlContent = generateReportHTML(
    intelligence,
    narrative,
    visualizations,
    options
  );

  // Write HTML to temporary file
  const tempHtmlPath = path.join("/tmp", `report-${Date.now()}.html`);
  const tempPdfPath = path.join("/tmp", `report-${Date.now()}.pdf`);

  try {
    await writeFile(tempHtmlPath, htmlContent, "utf-8");

    // Convert HTML to PDF using puppeteer-core + Chromium
    let browser;
    try {
      browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium-browser',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
      const page = await browser.newPage();
      await page.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });
      const pdfBuffer = Buffer.from(await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
      }));

      // Clean up temporary files
      await unlink(tempHtmlPath).catch(() => {});

      return pdfBuffer;
    } finally {
      if (browser) await browser.close();
    }
  } catch (error) {
    // Clean up on error
    try {
      await unlink(tempHtmlPath).catch(() => {});
    } catch {}
    throw error;
  }
}

/**
 * Generate HTML content for the report
 */
function generateReportHTML(
  intelligence: ClaimIntelligence,
  narrative: ReportNarrative,
  visualizations: ReportVisualizations,
  options: ReportPDFOptions
): string {
  const { role, includeVisualizations, includeSupportingEvidence } = options;

  const roleTitle = {
    insurer: "Insurance Claim Assessment Report",
    assessor: "Professional Assessor Evaluation Report",
    regulatory: "Regulatory Compliance Audit Report",
  }[role];

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${roleTitle} - ${intelligence.claim.claimNumber}</title>
  <style>
    @page {
      size: A4;
      margin: 2cm;
      @top-right {
        content: "Page " counter(page) " of " counter(pages);
        font-size: 10pt;
        color: #6b7280;
      }
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      max-width: 21cm;
      margin: 0 auto;
    }

    h1 {
      color: #1e40af;
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 0.5rem;
      margin-top: 2rem;
      page-break-after: avoid;
    }

    h2 {
      color: #1e40af;
      border-bottom: 2px solid #93c5fd;
      padding-bottom: 0.3rem;
      margin-top: 1.5rem;
      page-break-after: avoid;
    }

    h3 {
      color: #374151;
      margin-top: 1rem;
      page-break-after: avoid;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
      page-break-inside: avoid;
    }

    th, td {
      padding: 0.75rem;
      text-align: left;
      border: 1px solid #d1d5db;
    }

    th {
      background-color: #f3f4f6;
      font-weight: 600;
      color: #374151;
    }

    tr:nth-child(even) {
      background-color: #f9fafb;
    }

    .header {
      text-align: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 3px solid #3b82f6;
    }

    .header h1 {
      border-bottom: none;
      margin: 0;
      padding: 0;
    }

    .claim-info {
      background-color: #eff6ff;
      padding: 1rem;
      border-left: 4px solid #3b82f6;
      margin: 1rem 0;
      page-break-inside: avoid;
    }

    .claim-info p {
      margin: 0.25rem 0;
    }

    .risk-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 0.25rem;
      font-weight: 600;
      font-size: 0.875rem;
    }

    .risk-low {
      background-color: #d1fae5;
      color: #065f46;
    }

    .risk-medium {
      background-color: #fef3c7;
      color: #92400e;
    }

    .risk-high {
      background-color: #fee2e2;
      color: #991b1b;
    }

    .visualization {
      margin: 1.5rem 0;
      text-align: center;
      page-break-inside: avoid;
    }

    .visualization svg {
      max-width: 100%;
      height: auto;
    }

    .footer {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 2px solid #d1d5db;
      font-size: 0.875rem;
      color: #6b7280;
      text-align: center;
    }

    .page-break {
      page-break-before: always;
    }

    .evidence-image {
      max-width: 100%;
      height: auto;
      margin: 1rem 0;
      border: 1px solid #d1d5db;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <h1>${roleTitle}</h1>
    <p style="font-size: 1.125rem; color: #6b7280; margin: 0.5rem 0;">
      Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    </p>
  </div>

  <!-- Claim Information -->
  <div class="claim-info">
    <p><strong>Claim Number:</strong> ${intelligence.claim.claimNumber}</p>
    <p><strong>Vehicle:</strong> ${intelligence.claim.vehicleMake} ${intelligence.claim.vehicleModel} (${intelligence.claim.vehicleYear})</p>
    <p><strong>Registration:</strong> ${intelligence.claim.vehicleRegistration || 'N/A'}</p>
    <p><strong>Incident Date:</strong> ${new Date(intelligence.claim.incidentDate).toLocaleDateString()}</p>
    <p><strong>Incident Location:</strong> ${intelligence.claim.incidentLocation || 'N/A'}</p>
    <p><strong>Claim Status:</strong> ${intelligence.claim.status}</p>
    <p><strong>Fraud Risk:</strong> <span class="risk-badge risk-${getFraudRiskClass(intelligence.claim.fraudRiskScore || 0)}">${getFraudRiskLabel(intelligence.claim.fraudRiskScore || 0)}</span></p>
  </div>

  <!-- Executive Summary -->
  <h2>Executive Summary</h2>
  ${narrative.executiveSummary}

  <!-- Damage Assessment Analysis -->
  <div class="page-break"></div>
  <h2>Damage Assessment Analysis</h2>
  ${narrative.damageAssessmentAnalysis}

  ${includeVisualizations ? `
  <div class="visualization">
    <h3>Damage Severity Legend</h3>
    <table>
      <thead>
        <tr>
          <th>Severity Level</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${visualizations.damageSeverityLegend.items.map(item => `
          <tr>
            <td style="color: ${item.color}; font-weight: 600;">${item.label}</td>
            <td>${item.description}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- AI Intelligence Explanation -->
  <h2>AI Intelligence Explanation</h2>
  ${narrative.aiIntelligenceExplanation}

  ${includeVisualizations ? `
  <div class="visualization">
    <h3>AI Assessment Confidence</h3>
    ${generateGaugeSVG(visualizations.confidenceGauge)}
  </div>
  ` : ''}

  <!-- Cost Comparison Analytics -->
  <div class="page-break"></div>
  <h2>Cost Comparison Analytics</h2>
  ${narrative.costComparisonAnalytics}

  ${includeVisualizations ? `
  <div class="visualization">
    <h3>Cost Comparison</h3>
    <table>
      <thead>
        <tr>
          <th>Source</th>
          <th>Parts Cost</th>
          <th>Labor Cost</th>
          <th>Total Cost</th>
        </tr>
      </thead>
      <tbody>
        ${intelligence.aiAssessment ? `
          <tr>
            <td>AI Estimate</td>
            <td>$${(intelligence.aiAssessment.estimatedRepairCost * 0.6).toFixed(2)}</td>
            <td>$${(intelligence.aiAssessment.estimatedRepairCost * 0.4).toFixed(2)}</td>
            <td><strong>$${intelligence.aiAssessment.estimatedRepairCost.toFixed(2)}</strong></td>
          </tr>
        ` : ''}
        ${intelligence.assessorEvaluation ? `
          <tr>
            <td>Assessor Estimate</td>
            <td>$${(intelligence.assessorEvaluation.estimatedRepairCost * 0.6).toFixed(2)}</td>
            <td>$${(intelligence.assessorEvaluation.estimatedRepairCost * 0.4).toFixed(2)}</td>
            <td><strong>$${intelligence.assessorEvaluation.estimatedRepairCost.toFixed(2)}</strong></td>
          </tr>
        ` : ''}
        ${intelligence.panelBeaterQuotes.map((quote: any, index: number) => `
          <tr>
            <td>Quote ${index + 1}</td>
            <td>$${quote.partsCost?.toFixed(2) || '0.00'}</td>
            <td>$${quote.laborCost?.toFixed(2) || '0.00'}</td>
            <td><strong>$${quote.totalCost?.toFixed(2) || '0.00'}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- Fraud Risk Evaluation -->
  <div class="page-break"></div>
  <h2>Fraud Risk Evaluation</h2>
  ${narrative.fraudRiskEvaluation}

  ${includeVisualizations ? `
  <div class="visualization">
    <h3>Fraud Risk Assessment</h3>
    ${generateHeatScaleSVG(visualizations.fraudRiskHeatScale)}
  </div>
  ` : ''}

  <!-- Physics Validation Summary -->
  <h2>Physics Validation Summary</h2>
  ${narrative.physicsValidationSummary}

  <!-- Workflow Audit Trail -->
  <div class="page-break"></div>
  <h2>Workflow Audit Trail</h2>
  ${narrative.workflowAuditTrail}

  ${includeVisualizations ? `
  <div class="visualization">
    <h3>Claim Processing Timeline</h3>
    <table>
      <thead>
        <tr>
          <th>Date/Time</th>
          <th>Status</th>
          <th>Actor</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${visualizations.workflowTimeline.events.map(event => `
          <tr>
            <td>${new Date(event.timestamp).toLocaleString()}</td>
            <td><strong>${event.status}</strong></td>
            <td>${event.actor}</td>
            <td>${event.notes || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- Recommendations -->
  <h2>Recommendations</h2>
  ${narrative.recommendations}

  ${includeSupportingEvidence && intelligence.supportingEvidence.damagePhotos.length > 0 ? `
  <div class="page-break"></div>
  <h2>Supporting Evidence</h2>
  <h3>Damage Photos</h3>
  ${intelligence.supportingEvidence.damagePhotos.slice(0, 4).map((photo: string, index: number) => `
    <div class="visualization">
      <p><strong>Photo ${index + 1}</strong></p>
      <img src="${photo}" alt="Damage Photo ${index + 1}" class="evidence-image" />
    </div>
  `).join('')}
  ` : ''}

  <!-- Footer -->
  <div class="footer">
    <p>This report was generated by the KINGA AI system.</p>
    <p>Report ID: ${intelligence.claim.claimNumber}-${Date.now()}</p>
    <p>&copy; ${new Date().getFullYear()} KINGA AI. All rights reserved.</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Get fraud risk CSS class based on score
 */
function getFraudRiskClass(score: number): string {
  if (score < 30) return "low";
  if (score < 60) return "medium";
  return "high";
}

/**
 * Get fraud risk label based on score
 */
function getFraudRiskLabel(score: number): string {
  if (score < 30) return "Low Risk";
  if (score < 60) return "Medium Risk";
  return "High Risk";
}
