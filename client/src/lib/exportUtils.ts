/**
 * Export Utilities for Executive Dashboard
 * 
 * Uses dynamic imports so jspdf (707KB) and xlsx are only loaded when user clicks export.
 */

/**
 * Export data as PDF
 */
export async function exportToPDF(
  title: string,
  data: any[],
  columns: { header: string; dataKey: string }[],
  filename: string
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.text(title, 14, 20);
  
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
  
  autoTable(doc, {
    startY: 35,
    head: [columns.map(col => col.header)],
    body: data.map(row => columns.map(col => row[col.dataKey] ?? "")),
    theme: "grid",
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 9 },
  });
  
  doc.save(filename);
}

/**
 * Export data as Excel
 */
export async function exportToExcel(
  data: any[],
  sheetName: string,
  filename: string
) {
  const XLSX = await import("xlsx");
  
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  const maxWidth = 50;
  const colWidths: number[] = [];
  
  if (data.length > 0) {
    Object.keys(data[0]).forEach((key, i) => {
      const maxLen = Math.max(
        key.length,
        ...data.map(row => String(row[key] ?? "").length)
      );
      colWidths[i] = Math.min(maxLen + 2, maxWidth);
    });
    
    worksheet["!cols"] = colWidths.map(w => ({ wch: w }));
  }
  
  XLSX.writeFile(workbook, filename);
}

/**
 * Export KPIs as PDF
 */
export async function exportKPIsToPDF(kpis: any) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  
  const doc = new jsPDF();
  
  doc.setFontSize(20);
  doc.text("KINGA Executive Dashboard - KPI Report", 14, 20);
  
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
  
  doc.setFontSize(14);
  doc.text("Key Performance Indicators", 14, 45);
  
  const kpiData = [
    ["Total Claims", kpis.totalClaims],
    ["Active Claims", kpis.activeClaims],
    ["Completed Claims", kpis.completedClaims],
    ["Completion Rate", `${kpis.completionRate}%`],
    ["Total Savings", `$${kpis.totalSavings.toLocaleString()}`],
    ["Fraud Detected", kpis.fraudDetected],
    ["High-Value Claims", kpis.highValueClaims],
    ["Avg Processing Time", `${kpis.avgProcessingTime} days`],
  ];
  
  autoTable(doc, {
    startY: 50,
    head: [["Metric", "Value"]],
    body: kpiData,
    theme: "grid",
    headStyles: { fillColor: [59, 130, 246] },
  });
  
  doc.save("KINGA_Executive_KPIs.pdf");
}

/**
 * Export Critical Alerts as PDF
 */
export async function exportAlertsToPDF(alerts: any) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  
  const doc = new jsPDF();
  
  doc.setFontSize(20);
  doc.text("KINGA Executive Dashboard - Critical Alerts", 14, 20);
  
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
  
  let yPosition = 40;
  
  if (alerts.highValuePending && alerts.highValuePending.length > 0) {
    doc.setFontSize(14);
    doc.text("High-Value Claims Pending Approval", 14, yPosition);
    yPosition += 5;
    
    autoTable(doc, {
      startY: yPosition,
      head: [["Claim Number", "Vehicle", "Estimated Cost"]],
      body: alerts.highValuePending.map((claim: any) => [
        claim.claimNumber,
        claim.vehicleRegistration,
        `$${((claim.estimatedCost || 0) / 100).toLocaleString()}`,
      ]),
      theme: "grid",
      headStyles: { fillColor: [234, 179, 8] },
    });
    
    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }
  
  if (alerts.highFraudRisk && alerts.highFraudRisk.length > 0) {
    doc.setFontSize(14);
    doc.text("High Fraud Risk Claims", 14, yPosition);
    yPosition += 5;
    
    autoTable(doc, {
      startY: yPosition,
      head: [["Claim Number", "Vehicle", "Risk Level"]],
      body: alerts.highFraudRisk.map((claim: any) => [
        claim.claimNumber,
        claim.vehicleRegistration,
        claim.fraudRiskLevel || "High",
      ]),
      theme: "grid",
      headStyles: { fillColor: [239, 68, 68] },
    });
    
    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }
  
  doc.save("KINGA_Critical_Alerts.pdf");
}

/**
 * Export Assessor Performance as Excel
 */
export async function exportAssessorPerformanceToExcel(assessors: any[]) {
  const data = assessors.map((a, index) => ({
    Rank: index + 1,
    Name: a.name,
    Email: a.email,
    "Performance Score": a.performanceScore || 0,
    "Total Assessments": a.totalAssessments || 0,
    "Accuracy Score": a.accuracyScore || 0,
    "Avg Completion Time": a.avgCompletionTime || 0,
    Tier: a.tier || "free",
  }));
  
  await exportToExcel(data, "Assessor Performance", "KINGA_Assessor_Performance.xlsx");
}

/**
 * Export Panel Beater Analytics as Excel
 */
export async function exportPanelBeaterAnalyticsToExcel(beaters: any[]) {
  const data = beaters.map(b => ({
    "Business Name": b.name,
    "Total Quotes": b.totalQuotes,
    "Avg Quote Amount": `$${b.avgQuoteAmount.toLocaleString()}`,
    "Accepted Quotes": b.acceptedQuotes,
    "Acceptance Rate": `${b.acceptanceRate}%`,
  }));
  
  await exportToExcel(data, "Panel Beater Analytics", "KINGA_Panel_Beater_Analytics.xlsx");
}

/**
 * Export Cost Savings Trends as Excel
 */
export async function exportCostSavingsTrendsToExcel(trends: any[]) {
  const data = trends.map(t => ({
    Month: t.month,
    "Total Savings": `$${t.savings.toLocaleString()}`,
    "Claim Count": t.claimCount,
    "Avg Savings Per Claim": `$${t.avgSavingsPerClaim.toLocaleString()}`,
  }));
  
  await exportToExcel(data, "Cost Savings Trends", "KINGA_Cost_Savings_Trends.xlsx");
}

/**
 * Export Financial Overview as PDF
 */
export async function exportFinancialOverviewToPDF(financials: any) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  
  const doc = new jsPDF();
  
  doc.setFontSize(20);
  doc.text("KINGA Executive Dashboard - Financial Overview", 14, 20);
  
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
  
  doc.setFontSize(14);
  doc.text("Financial Metrics", 14, 45);
  
  const financialData = [
    ["Total Payouts", `$${financials.totalPayouts.toLocaleString()}`],
    ["Total Reserves", `$${financials.totalReserves.toLocaleString()}`],
    ["Fraud Prevented", `$${financials.fraudPrevented.toLocaleString()}`],
    ["Net Exposure", `$${financials.netExposure.toLocaleString()}`],
  ];
  
  autoTable(doc, {
    startY: 50,
    head: [["Metric", "Amount"]],
    body: financialData,
    theme: "grid",
    headStyles: { fillColor: [59, 130, 246] },
  });
  
  doc.save("KINGA_Financial_Overview.pdf");
}
