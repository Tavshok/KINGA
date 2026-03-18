/**
 * Excel Export Utility for Claims Manager Dashboard
 * 
 * Exports filtered claim lists to Excel format (.xlsx)
 */

import * as XLSX from 'xlsx';

export interface ClaimExportData {
  claimNumber: string;
  vehicleRegistration: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  policyNumber: string | null;
  status: string;
  workflowState: string;
  fraudRiskScore: number | null;
  estimatedCost: number | null;
  approvedAmount: number | null;
  createdAt: Date | null;
  incidentDate: Date | null;
  incidentType: string | null;
  technicalApprovalStatus: string | null;
}

export function exportClaimsToExcel(
  claims: ClaimExportData[],
  filename: string = 'claims-export',
  currencySymbol: string = 'US$'
) {
  // Transform data for Excel
  const excelData = claims.map(claim => ({
    'Claim Number': claim.claimNumber,
    'Vehicle Registration': claim.vehicleRegistration || 'N/A',
    'Make/Model': [claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(' ') || 'N/A',
    'Policy Number': claim.policyNumber || 'N/A',
    'Status': (claim.status || 'pending').replace(/_/g, ' '),
    'Workflow State': (claim.workflowState || 'created').replace(/_/g, ' '),
    'Fraud Risk Score': claim.fraudRiskScore !== null && claim.fraudRiskScore !== undefined 
      ? claim.fraudRiskScore 
      : 'Not Assessed',
    'Risk Level': claim.fraudRiskScore !== null && claim.fraudRiskScore !== undefined
      ? claim.fraudRiskScore >= 70 ? 'HIGH' : claim.fraudRiskScore >= 40 ? 'MEDIUM' : 'LOW'
      : 'N/A',
    [`Estimated Cost (${currencySymbol})`]: claim.estimatedCost 
      ? `${currencySymbol}${claim.estimatedCost.toFixed(2)}` 
      : 'Pending',
    [`Approved Amount (${currencySymbol})`]: claim.approvedAmount 
      ? `${currencySymbol}${claim.approvedAmount.toFixed(2)}` 
      : 'Pending',
    'Incident Type': claim.incidentType || 'N/A',
    'Incident Date': claim.incidentDate 
      ? new Date(claim.incidentDate).toLocaleDateString() 
      : 'N/A',
    'Submitted Date': claim.createdAt 
      ? new Date(claim.createdAt).toLocaleDateString() 
      : 'N/A',
    'Technical Approval': claim.technicalApprovalStatus || 'Pending',
  }));

  // Create workbook and worksheet
  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Claims');

  // Set column widths for better readability
  const columnWidths = [
    { wch: 15 }, // Claim Number
    { wch: 18 }, // Vehicle Registration
    { wch: 20 }, // Make/Model
    { wch: 15 }, // Policy Number
    { wch: 15 }, // Status
    { wch: 18 }, // Workflow State
    { wch: 18 }, // Fraud Risk Score
    { wch: 12 }, // Risk Level
    { wch: 20 }, // Estimated Cost
    { wch: 22 }, // Approved Amount
    { wch: 15 }, // Incident Type
    { wch: 15 }, // Incident Date
    { wch: 15 }, // Submitted Date
    { wch: 18 }, // Technical Approval
  ];
  worksheet['!cols'] = columnWidths;

  // Generate file and trigger download
  const timestamp = new Date().toISOString().split('T')[0];
  const fullFilename = `${filename}_${timestamp}.xlsx`;
  XLSX.writeFile(workbook, fullFilename);
}
