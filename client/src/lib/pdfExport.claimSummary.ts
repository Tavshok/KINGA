import { applyKingaBranding, loadKingaLogoBase64, loadPdfLibs } from "./pdfExport.shared";

export async function generateClaimSummaryPDF(claim: {
  claimNumber: string;
  vehicleRegistration?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  status: string;
  incidentDate?: string;
  incidentType?: string;
  estimatedCost?: number;
  fraudRiskScore?: number;
  policyNumber?: string;
  policyHolder?: string;
  createdAt?: string | number;
}): Promise<void> {
  const { jsPDF } = await loadPdfLibs();
  const logoBase64 = await loadKingaLogoBase64();
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 22;

  // ── Title ────────────────────────────────────────────────────────────────
  doc.setFillColor(20, 83, 45);
  doc.rect(20, yPos, 170, 14, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('CLAIM SUMMARY REPORT', pageWidth / 2, yPos + 9, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  yPos += 20;

  // ── Claim Identification ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 83, 45);
  doc.text('Claim Identification', 20, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 6;
  doc.setDrawColor(20, 83, 45);
  doc.setLineWidth(0.3);
  doc.line(20, yPos, 190, yPos);
  yPos += 5;

  const rows: [string, string][] = [
    ['Claim Number', claim.claimNumber],
    ['Status', claim.status.replace(/_/g, ' ').toUpperCase()],
    ['Policy Number', claim.policyNumber || 'N/A'],
    ['Policy Holder', claim.policyHolder || 'N/A'],
    ['Incident Date', claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString('en-ZA') : 'N/A'],
    ['Incident Type', claim.incidentType ? claim.incidentType.replace(/_/g, ' ').toUpperCase() : 'N/A'],
    ['Submitted', claim.createdAt ? new Date(Number(claim.createdAt)).toLocaleDateString('en-ZA') : 'N/A'],
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, 22, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 80, yPos);
    yPos += 6;
  });
  yPos += 4;

  // ── Vehicle Details ──────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 83, 45);
  doc.text('Vehicle Details', 20, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 6;
  doc.setDrawColor(20, 83, 45);
  doc.line(20, yPos, 190, yPos);
  yPos += 5;

  const vehicleRows: [string, string][] = [
    ['Registration', claim.vehicleRegistration || 'N/A'],
    ['Make', claim.vehicleMake || 'N/A'],
    ['Model', claim.vehicleModel || 'N/A'],
    ['Year', claim.vehicleYear ? String(claim.vehicleYear) : 'N/A'],
  ];

  doc.setFontSize(10);
  vehicleRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, 22, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 80, yPos);
    yPos += 6;
  });
  yPos += 4;

  // ── KINGA Assessment Summary ────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 83, 45);
  doc.text('KINGA Assessment Summary', 20, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 6;
  doc.setDrawColor(20, 83, 45);
  doc.line(20, yPos, 190, yPos);
  yPos += 5;

  doc.setFontSize(10);
  if (claim.estimatedCost != null) {
    const costDisplay = claim.estimatedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    doc.setFont('helvetica', 'bold');
    doc.text('Estimated Repair Cost:', 22, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`$${costDisplay}`, 80, yPos);
    yPos += 6;
  }
  if (claim.fraudRiskScore != null) {
    const riskLevel = claim.fraudRiskScore >= 70 ? 'HIGH' : claim.fraudRiskScore >= 40 ? 'MEDIUM' : 'LOW';
    doc.setFont('helvetica', 'bold');
    doc.text('Fraud Risk Score:', 22, yPos);
    doc.setFont('helvetica', 'normal');
    if (claim.fraudRiskScore >= 70) doc.setTextColor(185, 28, 28);
    else if (claim.fraudRiskScore >= 40) doc.setTextColor(180, 100, 0);
    else doc.setTextColor(20, 83, 45);
    doc.text(`${claim.fraudRiskScore}/100 (${riskLevel})`, 80, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 6;
  }
  yPos += 4;

  // ── Note ─────────────────────────────────────────────────────────────────
  doc.setFillColor(240, 253, 244);
  doc.rect(20, yPos, 170, 16, 'F');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(20, 83, 45);
  doc.text('For the full KINGA-powered fraud detection report, vehicle valuation, physics reconstruction,', 23, yPos + 5);
  doc.text(`and quote comparison analysis, open Claim ${claim.claimNumber} in the KINGA platform.`, 23, yPos + 10);
  doc.setTextColor(0, 0, 0);
  yPos += 22;

  // ── Signature Block ───────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 83, 45);
  doc.text('Authorisation', 20, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 6;
  doc.setDrawColor(20, 83, 45);
  doc.line(20, yPos, 190, yPos);
  yPos += 8;

  const sumCols = [
    { label: 'Reviewed By', x: 20 },
    { label: 'Authorised By', x: 110 },
  ];
  sumCols.forEach(({ label, x }) => {
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.4);
    doc.line(x, yPos + 12, x + 72, yPos + 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(label, x, yPos + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('Name: _______________________', x, yPos + 21);
    doc.text(`Date: ${new Date().toLocaleDateString('en-ZA')}`, x, yPos + 26);
    doc.setTextColor(0, 0, 0);
  });

  // Apply KINGA branding
  applyKingaBranding(doc, logoBase64, 'Claim Summary Report');

  doc.save(`KINGA_Summary_${claim.claimNumber}_${new Date().toISOString().split('T')[0]}.pdf`);
}
