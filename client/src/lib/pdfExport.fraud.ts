import { applyKingaBranding, loadKingaLogoBase64, loadPdfLibs } from "./pdfExport.shared";

export async function generateFraudAnalyticsPDF(data: {
  totalClaims: number;
  fraudDetected: number;
  fraudRate: number;
  avgClaimValue: number;
  totalSavings: number;
  topFraudIndicators: Array<{ name: string; count: number; percentage: number }>;
  monthlyTrends: Array<{ month: string; claims: number; frauds: number }>;
}): Promise<void> {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const logoBase64 = await loadKingaLogoBase64();
  const doc = new jsPDF();
  let yPos = 22;

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 83, 45);
  doc.text('Fraud Detection Analytics', 20, yPos);
  doc.setTextColor(0, 0, 0);
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
  doc.text(`Average Claim Value: $${data.avgClaimValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 20, yPos);
  yPos += 5;
  doc.text(`Total Savings from Fraud Prevention: $${data.totalSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 20, yPos);
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

  // Apply KINGA branding (header + watermark + footer) to every page
  applyKingaBranding(doc, logoBase64, 'Fraud Analytics Report');

  // Save the PDF
  doc.save(`KINGA_Fraud_Analytics_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Generate PDF report for damage component breakdown
 */
