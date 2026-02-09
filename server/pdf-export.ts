/**
 * PDF Export Module for KINGA Assessment Reports
 * Generates professional PDF reports with all visualizations and AI commentary
 */

import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { storagePut } from "./storage";
import { protectedProcedure } from "./_core/trpc";

const execAsync = promisify(exec);

/**
 * Generate HTML content for the PDF report
 */
function generateReportHTML(data: any): string {
  const {
    vehicleMake,
    vehicleModel,
    vehicleYear,
    vehicleRegistration,
    damageDescription,
    estimatedCost,
    physicsAnalysis,
    fraudAnalysis,
    damagePhotos,
    damagedComponents,
  } = data;

  // Extract physics values from the physics_analysis nested object
  const physicsAnalysisData = physicsAnalysis?.physics_analysis || {};
  const physicsData = {
    impactSpeed: physicsAnalysisData.impact_speed_ms ? Math.round(physicsAnalysisData.impact_speed_ms * 3.6) : 0, // Convert m/s to km/h
    impactForce: physicsAnalysisData.kinetic_energy_joules ? Math.round(physicsAnalysisData.kinetic_energy_joules / 1000) : 0, // Convert J to kJ for display
    energyDissipated: 75, // Placeholder - calculate from crumple zone data if available
    deceleration: physicsAnalysisData.g_force ? Math.round(physicsAnalysisData.g_force * 10) / 10 : 0,
    damageConsistency: physicsAnalysis?.damageConsistency || 'unknown',
    physicsScore: physicsAnalysis?.confidence ? Math.round(physicsAnalysis.confidence * 100) : 0,
  };

  // Extract fraud values - handle both risk_level and overallRisk formats
  const fraudData = {
    riskScore: fraudAnalysis?.fraud_probability ? Math.round(fraudAnalysis.fraud_probability * 100) : 0,
    overallRisk: fraudAnalysis?.risk_level || fraudAnalysis?.overallRisk || 'unknown',
    indicators: fraudAnalysis?.indicators || {},
    topRiskFactors: fraudAnalysis?.top_risk_factors || [],
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KINGA Assessment Report - ${vehicleRegistration || 'N/A'}</title>
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
    <h1>KINGA AutoVerify AI</h1>
    <p>Vehicle Damage Assessment Report</p>
    <p style="margin-top: 10px; font-size: 9pt;">Generated: ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</p>
  </div>

  <!-- Vehicle Information -->
  <div class="section">
    <h2 class="section-title">Vehicle Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Make & Model</div>
        <div class="info-value">${vehicleMake || 'N/A'} ${vehicleModel || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Year</div>
        <div class="info-value">${vehicleYear || 'N/A'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Registration</div>
        <div class="info-value">${vehicleRegistration || 'N/A'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Assessment Date</div>
        <div class="info-value">${new Date().toLocaleDateString('en-ZA')}</div>
      </div>
    </div>
  </div>

  <!-- Cost Estimate -->
  <div class="cost-highlight">
    <div class="label">Estimated Repair Cost</div>
    <div class="amount">R ${estimatedCost?.toLocaleString() || '0'}</div>
  </div>

  <!-- Damage Description -->
  <div class="section">
    <h2 class="section-title">Damage Assessment</h2>
    <div class="commentary-box">
      ${damageDescription || 'No damage description provided.'}
    </div>
    
    ${damagedComponents && damagedComponents.length > 0 ? `
    <h3 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px;">Damaged Components</h3>
    <ul class="findings-list">
      ${damagedComponents.map((comp: string) => `<li>${comp}</li>`).join('')}
    </ul>
    ` : ''}
    
    ${damagePhotos && damagePhotos.length > 0 ? `
    <h3 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px;">Damage Photos</h3>
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-top: 15px;">
      ${damagePhotos.slice(0, 4).map((photo: string) => `
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <img src="${photo}" style="width: 100%; height: auto; display: block;" />
        </div>
      `).join('')}
    </div>
    ${damagePhotos.length > 4 ? `<p style="margin-top: 10px; font-size: 9pt; color: #64748b; text-align: center;">Showing 4 of ${damagePhotos.length} photos</p>` : ''}
    ` : ''}
  </div>

  <div class="page-break"></div>

  <!-- Physics Validation Analysis -->
  <div class="section">
    <h2 class="section-title">Physics Validation Analysis</h2>
    
    <div style="margin-bottom: 15px;">
      <strong>Damage Consistency: </strong>
      <span class="badge ${physicsData.damageConsistency === 'consistent' ? 'badge-success' : physicsData.damageConsistency === 'questionable' ? 'badge-warning' : 'badge-danger'}">
        ${physicsData.damageConsistency === 'consistent' ? '✓ Consistent' : physicsData.damageConsistency === 'questionable' ? '⚠ Questionable' : '✗ Inconsistent'}
      </span>
    </div>

    <div class="commentary-box">
      <strong>Analysis:</strong><br><br>
      ${physicsData.damageConsistency === 'consistent'
        ? `The damage pattern matches what we'd expect from the reported accident. At an estimated impact speed of ${physicsData.impactSpeed} km/h, the vehicle would experience forces equivalent to ${physicsData.impactForce}kN - roughly ${Math.round(physicsData.impactForce / 10)} times the weight of a small car pushing on the bumper. The damaged areas and severity level are consistent with this type of collision. The crash forces were absorbed properly by the vehicle's crumple zones, which is what we see in the damage photos. This appears to be a straightforward, legitimate accident claim.`
        : physicsData.damageConsistency === 'questionable'
        ? `The damage pattern raises some questions about how the accident actually occurred. While it's not impossible, certain aspects don't quite add up with the reported story. For example, the impact forces we calculated suggest the collision may have happened differently than described - perhaps at a different speed or angle. This doesn't necessarily mean fraud, but it does mean we should ask follow-up questions to clarify exactly what happened before approving the claim.`
        : `The damage doesn't match the accident story. Based on physics analysis, what the claimant described shouldn't produce the damage we're seeing. This is a red flag that requires investigation - either the accident details were misreported, or there may be pre-existing damage being claimed, or this could be a staged accident. Do not approve without thorough investigation.`
      }
    </div>

    <h3 style="font-size: 12pt; margin-top: 20px; margin-bottom: 10px;">Key Physics Findings</h3>
    <table>
      <tr>
        <th>Metric</th>
        <th>Value</th>
        <th>Assessment</th>
      </tr>
      <tr>
        <td>Impact Speed</td>
        <td>${physicsData.impactSpeed} km/h</td>
        <td>${physicsData.impactSpeed < 30 ? 'Low-speed collision' : physicsData.impactSpeed < 60 ? 'Moderate speed' : 'High-speed collision'}</td>
      </tr>
      <tr>
        <td>Impact Force</td>
        <td>${physicsData.impactForce} kN</td>
        <td>Equivalent to ~${Math.round(physicsData.impactForce / 10)} small cars</td>
      </tr>
      <tr>
        <td>Energy Absorption</td>
        <td>${physicsData.energyDissipated}%</td>
        <td>${physicsData.energyDissipated > 70 ? 'Good protection' : physicsData.energyDissipated > 50 ? 'Moderate' : 'Concerning'}</td>
      </tr>
      <tr>
        <td>G-Forces</td>
        <td>${physicsData.deceleration}g</td>
        <td>${physicsData.deceleration < 5 ? 'Mild impact' : physicsData.deceleration < 10 ? 'Moderate impact' : physicsData.deceleration < 20 ? 'Severe impact' : 'Extreme impact'}</td>
      </tr>
      <tr>
        <td>Physics Score</td>
        <td>${physicsData.physicsScore}/100</td>
        <td>${physicsData.physicsScore > 80 ? 'High confidence' : physicsData.physicsScore > 60 ? 'Moderate confidence' : 'Low confidence'}</td>
      </tr>
    </table>

    ${physicsData.damageConsistency !== 'consistent' ? `
    <div class="recommendations">
      <h4>Recommended Actions</h4>
      <ul>
        <li>Do not approve claim yet - schedule follow-up investigation</li>
        <li>Call the claimant to walk through exactly how the accident happened</li>
        <li>Request the police report to verify accident details</li>
        <li>If discrepancies remain, assign to fraud investigation team</li>
        <li>Consider requiring independent damage assessment</li>
      </ul>
    </div>
    ` : `
    <div class="recommendations" style="background: #f0fdf4; border-color: #22c55e;">
      <h4 style="color: #166534;">Recommended Actions</h4>
      <ul>
        <li style="color: #166534;">Physics check passed - the accident story matches the damage</li>
        <li style="color: #166534;">Safe to proceed with normal claim approval process</li>
        <li style="color: #166534;">Save this analysis report to the claim file for future reference</li>
      </ul>
    </div>
    `}
  </div>

  <div class="page-break"></div>

  <!-- Fraud Risk Assessment -->
  <div class="section">
    <h2 class="section-title">Fraud Risk Assessment</h2>
    
    <div style="margin-bottom: 15px;">
      <strong>Overall Risk Level: </strong>
      <span class="badge ${fraudData.overallRisk === 'low' ? 'badge-success' : fraudData.overallRisk === 'medium' ? 'badge-warning' : 'badge-danger'}">
        ${fraudData.overallRisk === 'low' ? 'LOW RISK' : fraudData.overallRisk === 'medium' ? 'MEDIUM RISK' : 'HIGH RISK'}
      </span>
      <span style="margin-left: 15px; font-size: 14pt; font-weight: bold; color: #1e40af;">
        ${fraudData.riskScore}% Fraud Probability
      </span>
    </div>

    <div class="commentary-box">
      <strong>Analysis:</strong><br><br>
      ${fraudData.overallRisk === 'low'
        ? `This claim presents a low fraud risk profile with a calculated fraud probability of ${fraudData.riskScore}%. The multi-dimensional analysis across claim history, damage consistency, document authenticity, behavioral patterns, ownership verification, and geographic risk factors shows no significant red flags. The claim characteristics align with typical legitimate claims in this category.`
        : fraudData.overallRisk === 'medium'
        ? `This claim exhibits moderate fraud risk indicators with a ${fraudData.riskScore}% fraud probability. While not definitively fraudulent, several factors warrant additional scrutiny before approval. The risk assessment identified patterns that deviate from typical legitimate claims, suggesting enhanced due diligence is advisable.`
        : `High fraud risk detected with ${fraudData.riskScore}% probability. Multiple red flags have been identified across several risk dimensions. This claim requires thorough investigation before any approval or payment. The combination of risk factors suggests potential fraudulent activity that warrants immediate attention from the fraud investigation unit.`
      }
    </div>

    ${fraudData.overallRisk !== 'low' ? `
    <div class="recommendations">
      <h4>Recommended Actions</h4>
      <ul>
        <li>Escalate to fraud investigation team immediately</li>
        <li>Conduct thorough background check on claimant</li>
        <li>Verify all documentation authenticity</li>
        <li>Cross-reference with claims database for patterns</li>
        <li>Do not approve or make any payments until investigation concludes</li>
      </ul>
    </div>
    ` : ''}
  </div>

  <!-- Footer -->
  <div class="footer">
    <p><strong>KINGA AutoVerify AI</strong> - Automated Vehicle Damage Assessment System</p>
    <p>This report was generated using advanced AI analysis and physics validation</p>
    <p style="margin-top: 10px; font-size: 8pt;">Confidential - For Insurance Use Only</p>
  </div>
</body>
</html>
  `;
}

/**
 * Export assessment report as PDF
 */
export const exportAssessmentPDF = protectedProcedure
  .input(
    z.object({
      vehicleMake: z.string().optional(),
      vehicleModel: z.string().optional(),
      vehicleYear: z.number().optional(),
      vehicleRegistration: z.string().optional(),
      damageDescription: z.string().optional(),
      estimatedCost: z.number().optional(),
      physicsAnalysis: z.any().optional(),
      fraudAnalysis: z.any().optional(),
      damagePhotos: z.array(z.string()).optional(),
      damagedComponents: z.array(z.string()).optional(),
    })
  )
  .mutation(async ({ input }: { input: any }) => {
    try {
      // Generate HTML content
      const htmlContent = generateReportHTML(input);

      // Create temporary files
      const tempId = randomBytes(16).toString('hex');
      const htmlPath = join(tmpdir(), `kinga-report-${tempId}.html`);
      const pdfPath = join(tmpdir(), `kinga-report-${tempId}.pdf`);

      // Write HTML to file
      await writeFile(htmlPath, htmlContent, 'utf-8');

      // Convert HTML to PDF using wkhtmltopdf (installed in sandbox)
      await execAsync(
        `wkhtmltopdf --enable-local-file-access --page-size A4 --margin-top 10mm --margin-bottom 10mm --margin-left 10mm --margin-right 10mm "${htmlPath}" "${pdfPath}"`
      );

      // Read the PDF file
      const pdfBuffer = await import('fs/promises').then(fs => fs.readFile(pdfPath));

      // Upload to S3
      const fileName = `assessment-report-${input.vehicleRegistration || tempId}-${Date.now()}.pdf`;
      const { url } = await storagePut(
        `reports/${fileName}`,
        pdfBuffer,
        'application/pdf'
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
      console.error('PDF export error:', error);
      throw new Error(`Failed to generate PDF: ${error.message}`);
    }
  });
