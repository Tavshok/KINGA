import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ClaimData {
  claimNumber: string;
  vehicle: string;
  registration: string;
  incidentDate: string;
  policeReport?: {
    reportNumber: string;
    policeStation: string;
    officerName: string;
    reportDate: string;
    reportedSpeed: string;
    weather: string;
    description: string;
    speedDiscrepancy?: number;
  };
  vehicleValuation?: {
    estimatedValue: number;
    finalValue: number;
    minPrice: number;
    medianPrice: number;
    maxPrice: number;
    mileageAdjustment?: number;
    valuationMethod: string;
    confidenceScore: number;
    totalLossRatio?: number;
    aiReasoning?: string;
  };
  assessorEvaluation?: {
    estimatedCost: number;
    laborCost: number;
    partsCost: number;
    estimatedDuration: number;
    fraudRisk: string;
    notes?: string;
  };
  quotes: Array<{
    panelBeaterName: string;
    totalCost: number;
    laborCost: number;
    partsCost: number;
    estimatedDuration: number;
    notes?: string;
    lineItems?: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
  }>;
  quoteComparison?: {
    discrepancyCount: number;
    averageQuote: number;
    missingItems: Array<{
      description: string;
      presentIn: string[];
      missingIn: string[];
    }>;
  };
}

/**
 * Generate PDF report for claim comparison
 */
export function generateComparisonPDF(data: ClaimData): void {
  const doc = new jsPDF();
  let yPos = 20;

  // Header with logo placeholder
  doc.setFontSize(20);
  doc.setTextColor(16, 185, 129); // Emerald green
  doc.text('KINGA', 20, yPos);
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('AutoVerify AI - Insurance Claims Analysis', 20, yPos + 5);
  
  yPos += 15;

  // Title
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('Fraud Detection & Comparison Report', 20, yPos);
  yPos += 10;

  // Claim Summary
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Claim Summary', 20, yPos);
  yPos += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Claim Number: ${data.claimNumber}`, 20, yPos);
  yPos += 5;
  doc.text(`Vehicle: ${data.vehicle}`, 20, yPos);
  yPos += 5;
  doc.text(`Registration: ${data.registration}`, 20, yPos);
  yPos += 5;
  doc.text(`Incident Date: ${data.incidentDate}`, 20, yPos);
  yPos += 10;

  // Police Report Section
  if (data.policeReport) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Police Report', 20, yPos);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Report Number: ${data.policeReport.reportNumber}`, 20, yPos);
    yPos += 5;
    doc.text(`Police Station: ${data.policeReport.policeStation}`, 20, yPos);
    yPos += 5;
    doc.text(`Officer: ${data.policeReport.officerName}`, 20, yPos);
    yPos += 5;
    doc.text(`Reported Speed: ${data.policeReport.reportedSpeed}`, 20, yPos);
    yPos += 5;
    doc.text(`Weather: ${data.policeReport.weather}`, 20, yPos);
    yPos += 5;

    if (data.policeReport.speedDiscrepancy && data.policeReport.speedDiscrepancy > 0) {
      doc.setTextColor(255, 165, 0); // Orange for warnings
      doc.setFont('helvetica', 'bold');
      doc.text(`⚠ Speed Discrepancy: ${data.policeReport.speedDiscrepancy} km/h`, 20, yPos);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      yPos += 5;
    }

    // Wrap accident description
    const descLines = doc.splitTextToSize(data.policeReport.description, 170);
    doc.text('Description:', 20, yPos);
    yPos += 5;
    doc.text(descLines, 20, yPos);
    yPos += descLines.length * 5 + 5;
  }

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Vehicle Valuation Section
  if (data.vehicleValuation) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Vehicle Market Valuation', 20, yPos);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Estimated Market Value: $${data.vehicleValuation.estimatedValue.toLocaleString()}`, 20, yPos);
    yPos += 5;
    doc.text(`Final Adjusted Value: $${data.vehicleValuation.finalValue.toLocaleString()}`, 20, yPos);
    yPos += 5;
    doc.text(`Price Range: $${data.vehicleValuation.minPrice.toLocaleString()} - $${data.vehicleValuation.maxPrice.toLocaleString()}`, 20, yPos);
    yPos += 5;
    doc.text(`Valuation Method: ${data.vehicleValuation.valuationMethod}`, 20, yPos);
    yPos += 5;
    doc.text(`Confidence Score: ${data.vehicleValuation.confidenceScore}%`, 20, yPos);
    yPos += 5;

    if (data.vehicleValuation.totalLossRatio) {
      doc.text(`Total Loss Ratio: ${data.vehicleValuation.totalLossRatio.toFixed(1)}%`, 20, yPos);
      yPos += 5;
    }

    if (data.vehicleValuation.aiReasoning) {
      const reasoningLines = doc.splitTextToSize(data.vehicleValuation.aiReasoning, 170);
      doc.text('AI Reasoning:', 20, yPos);
      yPos += 5;
      doc.setFontSize(9);
      doc.text(reasoningLines, 20, yPos);
      yPos += reasoningLines.length * 4 + 5;
      doc.setFontSize(10);
    }

    yPos += 5;
  }

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Assessor Evaluation Section
  if (data.assessorEvaluation) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Assessor Evaluation', 20, yPos);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Estimated Cost: $${data.assessorEvaluation.estimatedCost.toLocaleString()}`, 20, yPos);
    yPos += 5;
    doc.text(`Duration: ${data.assessorEvaluation.estimatedDuration} days`, 20, yPos);
    yPos += 5;
    doc.text(`Fraud Risk: ${data.assessorEvaluation.fraudRisk.toUpperCase()}`, 20, yPos);
    yPos += 10;
  }

  // Panel Beater Quotes Section
  if (data.quotes && data.quotes.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Panel Beater Quotes', 20, yPos);
    yPos += 7;

    // Create table data
    const tableData = data.quotes.map((quote, index) => [
      `Quote ${index + 1}`,
      quote.panelBeaterName,
      `$${quote.totalCost.toLocaleString()}`,
      `${quote.estimatedDuration} days`,
      quote.notes || 'N/A'
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['#', 'Panel Beater', 'Total Cost', 'Duration', 'Notes']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] }, // Emerald green
      margin: { left: 20 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Quote Comparison Analysis
  if (data.quoteComparison && data.quoteComparison.discrepancyCount > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Quote Comparison Analysis', 20, yPos);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Discrepancies Found: ${data.quoteComparison.discrepancyCount}`, 20, yPos);
    yPos += 5;
    doc.text(`Average Quote: $${data.quoteComparison.averageQuote.toLocaleString()}`, 20, yPos);
    yPos += 10;

    if (data.quoteComparison.missingItems && data.quoteComparison.missingItems.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('Missing Items:', 20, yPos);
      yPos += 5;

      doc.setFont('helvetica', 'normal');
      data.quoteComparison.missingItems.forEach((item) => {
        doc.text(`• ${item.description}`, 25, yPos);
        yPos += 5;
        doc.setFontSize(9);
        doc.text(`  Present in: ${item.presentIn.join(', ')}`, 30, yPos);
        yPos += 4;
        doc.text(`  Missing in: ${item.missingIn.join(', ')}`, 30, yPos);
        yPos += 6;
        doc.setFontSize(10);
      });
    }
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated by KINGA AutoVerify AI - Page ${i} of ${pageCount} - ${new Date().toLocaleDateString()}`,
      20,
      285
    );
  }

  // Save the PDF
  doc.save(`KINGA_Claim_${data.claimNumber}_Report.pdf`);
}

/**
 * Generate PDF report for fraud analytics dashboard
 */
export function generateFraudAnalyticsPDF(data: {
  totalClaims: number;
  fraudDetected: number;
  fraudRate: number;
  avgClaimValue: number;
  totalSavings: number;
  topFraudIndicators: Array<{ name: string; count: number; percentage: number }>;
  monthlyTrends: Array<{ month: string; claims: number; frauds: number }>;
}): void {
  const doc = new jsPDF();
  let yPos = 20;

  // Header
  doc.setFontSize(20);
  doc.setTextColor(16, 185, 129);
  doc.text('KINGA', 20, yPos);
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('AutoVerify AI - Fraud Analytics Report', 20, yPos + 5);
  
  yPos += 15;

  // Title
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('Fraud Detection Analytics', 20, yPos);
  yPos += 10;

  // Summary Metrics
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary Metrics', 20, yPos);
  yPos += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Total Claims Processed: ${data.totalClaims}`, 20, yPos);
  yPos += 5;
  doc.text(`Fraud Cases Detected: ${data.fraudDetected}`, 20, yPos);
  yPos += 5;
  doc.text(`Fraud Detection Rate: ${data.fraudRate.toFixed(1)}%`, 20, yPos);
  yPos += 5;
  doc.text(`Average Claim Value: $${data.avgClaimValue.toLocaleString()}`, 20, yPos);
  yPos += 5;
  doc.text(`Total Savings from Fraud Prevention: $${data.totalSavings.toLocaleString()}`, 20, yPos);
  yPos += 15;

  // Top Fraud Indicators
  if (data.topFraudIndicators && data.topFraudIndicators.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Top Fraud Indicators', 20, yPos);
    yPos += 7;

    const tableData = data.topFraudIndicators.map((indicator) => [
      indicator.name,
      indicator.count.toString(),
      `${indicator.percentage.toFixed(1)}%`
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Indicator', 'Count', 'Percentage']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [239, 68, 68] }, // Red for fraud
      margin: { left: 20 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Monthly Trends
  if (data.monthlyTrends && data.monthlyTrends.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Monthly Fraud Trends', 20, yPos);
    yPos += 7;

    const trendData = data.monthlyTrends.map((trend) => [
      trend.month,
      trend.claims.toString(),
      trend.frauds.toString(),
      `${((trend.frauds / trend.claims) * 100).toFixed(1)}%`
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Month', 'Total Claims', 'Fraud Cases', 'Fraud Rate']],
      body: trendData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] }, // Blue
      margin: { left: 20 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated by KINGA AutoVerify AI - Page ${i} of ${pageCount} - ${new Date().toLocaleDateString()}`,
      20,
      285
    );
  }

  // Save the PDF
  doc.save(`KINGA_Fraud_Analytics_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}
