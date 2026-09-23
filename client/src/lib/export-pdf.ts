/**
 * PDF Export Utility for Claim Review Reports
 * 
 * Generates comprehensive PDF reports for individual claims
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { P0_B1_FRAUD_DECISION_HOLD } from '@shared/p0FraudDecisionHoldPresentation';

export interface ClaimReportData {
  claim: {
    claimNumber: string;
    vehicleRegistration: string | null;
    vehicleMake: string | null;
    vehicleModel: string | null;
    policyNumber: string | null;
    createdAt: Date | null;
    incidentDate: Date | null;
    incidentType: string | null;
  };
  aiAssessment?: {
    estimatedCost: number | null;
    damageDescription: string | null;
    detectedDamageTypes: string | null;
  };
  assessorEval?: {
    damageAssessment: string;
    estimatedRepairCost: number;
    laborCost: number | null;
    partsCost: number | null;
    estimatedDuration: number;
    recommendations: string | null;
    disagreesWithAi: boolean | null;
    aiDisagreementReason: string | null;
  };
  quotes?: Array<{
    id: number;
    panelBeaterName: string | null;
    amount: number;
    breakdown: any;
    notes: string | null;
    status: string;
    createdAt: Date;
  }>;
}

export function buildP0B1FraudPdfHoldRows(): Array<[string, string]> {
  return [
    ['Status:', 'Withheld — Manual Review Required'],
    ['What is missing:', P0_B1_FRAUD_DECISION_HOLD.requiredEvidence.join('; ')],
    ['What resolves this:', P0_B1_FRAUD_DECISION_HOLD.resolver.action],
  ];
}

export function exportClaimReportToPDF(data: ClaimReportData, currencySymbol: string = 'US$') {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 20;

  // Helper function to add text with word wrap
  const addText = (text: string, x: number, y: number, maxWidth: number, fontSize: number = 10) => {
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return y + (lines.length * fontSize * 0.4);
  };

  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('KINGA Claim Review Report', pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  // Claim Information Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Claim Information', 14, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const claimInfo = [
    ['Claim Number:', data.claim.claimNumber],
    ['Vehicle:', `${data.claim.vehicleRegistration || 'N/A'} - ${data.claim.vehicleMake} ${data.claim.vehicleModel}`],
    ['Policy Number:', data.claim.policyNumber || 'N/A'],
    ['Incident Type:', data.claim.incidentType || 'N/A'],
    ['Incident Date:', data.claim.incidentDate ? new Date(data.claim.incidentDate).toLocaleDateString() : 'N/A'],
    ['Submitted Date:', data.claim.createdAt ? new Date(data.claim.createdAt).toLocaleDateString() : 'N/A'],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: claimInfo,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40 },
      1: { cellWidth: 'auto' }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Fraud values are not display authority in P0-B1. This browser-generated
  // report shows the same actionable manual-review boundary as server reports.
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Fraud Decision', 14, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: buildP0B1FraudPdfHoldRows(),
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40 },
      1: { cellWidth: 'auto' }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // KINGA Assessment Section
  if (data.aiAssessment) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('KINGA Assessment', 14, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const aiInfo = [
      ['Damage Types:', data.aiAssessment.detectedDamageTypes ?? 'N/A'],
      ['KINGA Estimated Cost:', data.aiAssessment.estimatedCost ? `${currencySymbol}${data.aiAssessment.estimatedCost.toFixed(2)}` : 'N/A'],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [],
      body: aiInfo,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 40 },
        1: { cellWidth: 'auto' }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 5;

    if (data.aiAssessment.damageDescription) {
      doc.setFont('helvetica', 'bold');
      doc.text('Damage Description:', 14, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      yPos = addText(data.aiAssessment.damageDescription, 14, yPos, pageWidth - 28, 9);
      yPos += 5;
    }
  }

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Assessor Evaluation Section
  if (data.assessorEval) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Assessor Evaluation', 14, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const assessorInfo = [
      ['Estimated Repair Cost:', `${currencySymbol}${data.assessorEval.estimatedRepairCost.toFixed(2)}`],
      ['Labor Cost:', data.assessorEval.laborCost ? `${currencySymbol}${data.assessorEval.laborCost.toFixed(2)}` : 'N/A'],
      ['Parts Cost:', data.assessorEval.partsCost ? `${currencySymbol}${data.assessorEval.partsCost.toFixed(2)}` : 'N/A'],
      ['Estimated Duration:', `${data.assessorEval.estimatedDuration} days`],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [],
      body: assessorInfo,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 45 },
        1: { cellWidth: 'auto' }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 5;

    if (data.assessorEval.disagreesWithAi) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 100, 0);
      doc.text('⚠ Assessor Disagrees with KINGA Assessment', 14, yPos);
      yPos += 5;
      doc.setTextColor(0, 0, 0);
      if (data.assessorEval.aiDisagreementReason) {
        doc.setFont('helvetica', 'normal');
        yPos = addText(data.assessorEval.aiDisagreementReason, 14, yPos, pageWidth - 28, 9);
        yPos += 5;
      }
    }

    if (data.assessorEval.damageAssessment) {
      doc.setFont('helvetica', 'bold');
      doc.text('Damage Assessment:', 14, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      yPos = addText(data.assessorEval.damageAssessment, 14, yPos, pageWidth - 28, 9);
      yPos += 5;
    }

    if (data.assessorEval.recommendations) {
      doc.setFont('helvetica', 'bold');
      doc.text('Recommendations:', 14, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      yPos = addText(data.assessorEval.recommendations, 14, yPos, pageWidth - 28, 9);
      yPos += 5;
    }
  }

  // Check if we need a new page
  if (yPos > 230) {
    doc.addPage();
    yPos = 20;
  }

  // Panel Beater Quotes Section
  if (data.quotes && data.quotes.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Panel Beater Quotes', 14, yPos);
    yPos += 8;

    const quoteTableData = data.quotes.map(quote => [
      quote.panelBeaterName || 'N/A',
      `${currencySymbol}${quote.amount.toFixed(2)}`,
      quote.status,
      new Date(quote.createdAt).toLocaleDateString(),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Panel Beater', 'Amount', 'Status', 'Date']],
      body: quoteTableData,
      theme: 'striped',
      headStyles: { fillColor: [13, 124, 143], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 3 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 5;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} of ${pageCount} | Generated: ${new Date().toLocaleString()} | KINGA`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  // Save the PDF
  const filename = `KINGA_Claim_Report_${data.claim.claimNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
