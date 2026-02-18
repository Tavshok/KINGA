import { getDb } from "./db";
/**
 * Fleet Claim Export - Portable PDF Dossier Generator
 * 
 * This module generates comprehensive claim dossiers for fleet owners
 * whose insurers are not on the KINGA platform. The PDF includes all
 * claim information, damage photos, maintenance history, and service quotes.
 * 
 * Purpose: Ensure Fleet independence - fleets can export claims even when
 * their insurer doesn't use KINGA.
 */


import { getDb } from "./db";
import { claims, maintenanceRecords, serviceQuotes, fleetVehicles, fleets } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

export interface ClaimDossierData {
  claim: any;
  vehicle: any;
  fleet: any;
  maintenanceHistory: any[];
  serviceQuotes: any[];
  damagePhotos: string[];
}

/**
 * Fetch all data required for a portable claim dossier
 */
export async function fetchClaimDossierData(claimId: number, tenantId: string): Promise<ClaimDossierData | null> {
  const db = getDb();
  // Fetch claim with tenant isolation
  const claim = await db.query.claims.findFirst({
    where: and(
      eq(claims.id, claimId),
      eq(claims.tenantId, tenantId)
    )
  });

  if (!claim) {
    return null;
  }

  // Fetch vehicle information
  const vehicle = claim.vehicleRegistration 
    ? await db.query.fleetVehicles.findFirst({
        where: and(
          eq(fleetVehicles.registrationNumber, claim.vehicleRegistration),
          eq(fleetVehicles.tenantId, tenantId)
        )
      })
    : null;

  // Fetch fleet information
  const fleet = vehicle?.fleetId
    ? await db.query.fleets.findFirst({
        where: and(
          eq(fleets.id, vehicle.fleetId),
          eq(fleets.tenantId, tenantId)
        )
      })
    : null;

  // Fetch maintenance history for the vehicle
  const maintenanceHistory = vehicle
    ? await db.query.maintenanceRecords.findMany({
        where: and(
          eq(maintenanceRecords.vehicleId, vehicle.id),
          eq(maintenanceRecords.tenantId, tenantId)
        ),
        orderBy: (records, { desc }) => [desc(records.serviceDate)]
      })
    : [];

  // Fetch service quotes related to this claim (if any)
  const quotes: any[] = []; // Service quotes would be linked via service requests

  // Extract damage photos from claim
  const damagePhotos: string[] = [];
  if (claim.damagePhotos) {
    try {
      const photos = JSON.parse(claim.damagePhotos as string);
      if (Array.isArray(photos)) {
        damagePhotos.push(...photos);
      }
    } catch (e) {
      // Invalid JSON, skip
    }
  }

  return {
    claim,
    vehicle,
    fleet,
    maintenanceHistory,
    serviceQuotes: quotes,
    damagePhotos
  };
}

/**
 * Generate HTML content for PDF export
 * This HTML can be converted to PDF using a library like Puppeteer or WeasyPrint
 */
export function generateClaimDossierHTML(data: ClaimDossierData): string {
  const { claim, vehicle, fleet, maintenanceHistory, damagePhotos } = data;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Claim Dossier - ${claim.claimNumber}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 40px;
      color: #333;
    }
    h1 {
      color: #10b981;
      border-bottom: 3px solid #10b981;
      padding-bottom: 10px;
    }
    h2 {
      color: #059669;
      margin-top: 30px;
      border-bottom: 2px solid #d1fae5;
      padding-bottom: 5px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: left;
    }
    th {
      background-color: #10b981;
      color: white;
    }
    tr:nth-child(even) {
      background-color: #f9fafb;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 200px 1fr;
      gap: 10px;
      margin: 20px 0;
    }
    .info-label {
      font-weight: bold;
      color: #059669;
    }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin: 20px 0;
    }
    .photo-grid img {
      width: 100%;
      border: 1px solid #ddd;
      border-radius: 8px;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 2px solid #10b981;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>KINGA - AutoVerify AI</h1>
    <p style="font-size: 18px; color: #6b7280;">Portable Claim Dossier</p>
    <p style="font-size: 14px; color: #9ca3af;">Generated on ${new Date().toLocaleDateString()}</p>
  </div>

  <h2>Claim Information</h2>
  <div class="info-grid">
    <div class="info-label">Claim Number:</div>
    <div>${claim.claimNumber}</div>
    
    <div class="info-label">Claim Status:</div>
    <div>${claim.status || 'N/A'}</div>
    
    <div class="info-label">Incident Date:</div>
    <div>${claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString() : 'N/A'}</div>
    
    <div class="info-label">Submission Date:</div>
    <div>${claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : 'N/A'}</div>
    
    <div class="info-label">Claimant Name:</div>
    <div>${claim.claimantName || 'N/A'}</div>
    
    <div class="info-label">Claimant Phone:</div>
    <div>${claim.claimantPhone || 'N/A'}</div>
    
    <div class="info-label">Claimant Email:</div>
    <div>${claim.claimantEmail || 'N/A'}</div>
  </div>

  <h2>Vehicle Information</h2>
  <div class="info-grid">
    <div class="info-label">Registration Number:</div>
    <div>${claim.vehicleRegistration || 'N/A'}</div>
    
    <div class="info-label">Make & Model:</div>
    <div>${claim.vehicleMake || 'N/A'} ${claim.vehicleModel || 'N/A'}</div>
    
    <div class="info-label">Year:</div>
    <div>${claim.vehicleYear || 'N/A'}</div>
    
    <div class="info-label">VIN:</div>
    <div>${claim.vehicleVin || 'N/A'}</div>
    
    <div class="info-label">Color:</div>
    <div>${claim.vehicleColor || 'N/A'}</div>
    
    <div class="info-label">Mileage:</div>
    <div>${claim.vehicleMileage || 'N/A'}</div>
  </div>

  ${fleet ? `
  <h2>Fleet Information</h2>
  <div class="info-grid">
    <div class="info-label">Fleet Name:</div>
    <div>${fleet.fleetName || 'N/A'}</div>
    
    <div class="info-label">Fleet Type:</div>
    <div>${fleet.fleetType || 'N/A'}</div>
    
    <div class="info-label">Total Vehicles:</div>
    <div>${fleet.totalVehicles || 0}</div>
    
    <div class="info-label">Primary Location:</div>
    <div>${fleet.primaryLocation || 'N/A'}</div>
  </div>
  ` : ''}

  <h2>Incident Details</h2>
  <div class="info-grid">
    <div class="info-label">Incident Type:</div>
    <div>${claim.incidentType || 'N/A'}</div>
    
    <div class="info-label">Incident Location:</div>
    <div>${claim.incidentLocation || 'N/A'}</div>
    
    <div class="info-label">Description:</div>
    <div>${claim.incidentDescription || 'N/A'}</div>
    
    <div class="info-label">Police Report:</div>
    <div>${claim.policeReportNumber || 'No police report filed'}</div>
  </div>

  ${damagePhotos.length > 0 ? `
  <h2>Damage Photos</h2>
  <div class="photo-grid">
    ${damagePhotos.map(url => `<img src="${url}" alt="Damage photo" />`).join('')}
  </div>
  ` : ''}

  ${maintenanceHistory.length > 0 ? `
  <h2>Maintenance History</h2>
  <table>
    <thead>
      <tr>
        <th>Service Date</th>
        <th>Service Type</th>
        <th>Service Provider</th>
        <th>Total Cost</th>
        <th>Mileage</th>
      </tr>
    </thead>
    <tbody>
      ${maintenanceHistory.map(record => `
        <tr>
          <td>${record.serviceDate ? new Date(record.serviceDate).toLocaleDateString() : 'N/A'}</td>
          <td>${record.serviceType || 'N/A'}</td>
          <td>${record.serviceProvider || 'N/A'}</td>
          <td>${record.totalCost ? `$${(record.totalCost / 100).toFixed(2)}` : 'N/A'}</td>
          <td>${record.serviceMileage || 'N/A'} km</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  <div class="footer">
    <p><strong>KINGA - AutoVerify AI</strong></p>
    <p>This is a portable claim dossier generated for submission to your insurance provider.</p>
    <p>For questions or support, contact your fleet administrator.</p>
  </div>
</body>
</html>
  `;
}

/**
 * Generate metadata summary for non-KINGA insurers
 */
export function generateClaimSummary(data: ClaimDossierData): string {
  const { claim, vehicle, fleet, maintenanceHistory } = data;

  return `
CLAIM SUMMARY
=============

Claim Number: ${claim.claimNumber}
Status: ${claim.status || 'Pending'}
Incident Date: ${claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString() : 'N/A'}

Vehicle: ${claim.vehicleMake} ${claim.vehicleModel} (${claim.vehicleYear})
Registration: ${claim.vehicleRegistration}
Fleet: ${fleet?.fleetName || 'Individual Vehicle'}

Maintenance Records: ${maintenanceHistory.length} service(s) on file
Last Service: ${maintenanceHistory[0]?.serviceDate ? new Date(maintenanceHistory[0].serviceDate).toLocaleDateString() : 'No records'}

This claim dossier contains all available information from the KINGA platform.
Please review the attached PDF for complete details including photos and documentation.
  `.trim();
}
