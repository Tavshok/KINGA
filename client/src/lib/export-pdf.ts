/**
 * PDF Export Utility for Claim Review Reports
 * 
 * Generates comprehensive PDF reports for individual claims
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
    fraudRiskLevel: string | null;
    fraudIndicators: string | null;
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
    fraudRiskLevel: string | null;
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

  // AI Assessment Section
  if (data.aiAssessment) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('AI Assessment', 14, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const aiInfo = [
      ['Fraud Risk Level:', data.aiAssessment.fraudRiskLevel ?? 'Not Assessed'],
      ['Fraud Indicators:', data.aiAssessment.fraudIndicators ?? 'None'],
      ['Damage Types:', data.aiAssessment.detectedDamageTypes ?? 'N/A'],
      ['AI Estimated Cost:', data.aiAssessment.estimatedCost ? `${currencySymbol}${(data.aiAssessment.estimatedCost / 100).toFixed(2)}` : 'N/A'],
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
      ['Estimated Repair Cost:', `${currencySymbol}${(data.assessorEval.estimatedRepairCost / 100).toFixed(2)}`],
      ['Labor Cost:', data.assessorEval.laborCost ? `${currencySymbol}${(data.assessorEval.laborCost / 100).toFixed(2)}` : 'N/A'],
      ['Parts Cost:', data.assessorEval.partsCost ? `${currencySymbol}${(data.assessorEval.partsCost / 100).toFixed(2)}` : 'N/A'],
      ['Estimated Duration:', `${data.assessorEval.estimatedDuration} days`],
      ['Fraud Risk Level:', (data.assessorEval.fraudRiskLevel || 'N/A').toUpperCase()],
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
      doc.text('⚠ Assessor Disagrees with AI Assessment', 14, yPos);
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
      `${currencySymbol}${(quote.amount / 100).toFixed(2)}`,
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
      `Page ${i} of ${pageCount} | Generated: ${new Date().toLocaleString()} | KINGA AutoVerify AI`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  // Save the PDF
  const filename = `KINGA_Claim_Report_${data.claim.claimNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
