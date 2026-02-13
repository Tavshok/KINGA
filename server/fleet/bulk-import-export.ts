import * as XLSX from "xlsx";
import { bulkCreateFleetVehicles, getFleetVehiclesByFleetId } from "./fleet-db";

// ============================================================================
// BULK VEHICLE IMPORT FROM EXCEL/CSV
// ============================================================================

export interface VehicleImportRow {
  registrationNumber: string;
  vin?: string;
  make: string;
  model: string;
  year: number;
  engineCapacity?: number;
  vehicleMass?: number;
  color?: string;
  fuelType?: string;
  transmissionType?: string;
  usageType?: string;
  primaryUse?: string;
  averageMonthlyMileage?: number;
  currentInsurer?: string;
  policyNumber?: string;
  policyStartDate?: string;
  policyEndDate?: string;
  coverageType?: string;
  purchasePrice?: number;
  purchaseDate?: string;
  currentValuation?: number;
  replacementValue?: number;
}

export interface ImportResult {
  success: boolean;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: Array<{
    row: number;
    error: string;
    data?: any;
  }>;
}

/**
 * Parse Excel or CSV file and extract vehicle data
 */
export async function parseVehicleFile(fileBuffer: Buffer, mimeType: string): Promise<VehicleImportRow[]> {
  let workbook: XLSX.WorkBook;
  
  if (mimeType.includes("csv") || mimeType.includes("text/plain")) {
    // Parse CSV
    const csvText = fileBuffer.toString("utf-8");
    workbook = XLSX.read(csvText, { type: "string" });
  } else {
    // Parse Excel
    workbook = XLSX.read(fileBuffer, { type: "buffer" });
  }
  
  // Get first sheet
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON
  const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
  
  // Map to VehicleImportRow format
  return jsonData.map((row) => ({
    registrationNumber: row["Registration Number"] || row["registrationNumber"] || "",
    vin: row["VIN"] || row["vin"] || "",
    make: row["Make"] || row["make"] || "",
    model: row["Model"] || row["model"] || "",
    year: parseInt(row["Year"] || row["year"] || "0"),
    engineCapacity: parseFloat(row["Engine Capacity"] || row["engineCapacity"] || "0") || undefined,
    vehicleMass: parseFloat(row["Vehicle Mass"] || row["vehicleMass"] || "0") || undefined,
    color: row["Color"] || row["color"] || "",
    fuelType: row["Fuel Type"] || row["fuelType"] || "",
    transmissionType: row["Transmission"] || row["transmissionType"] || "",
    usageType: row["Usage Type"] || row["usageType"] || "",
    primaryUse: row["Primary Use"] || row["primaryUse"] || "",
    averageMonthlyMileage: parseFloat(row["Avg Monthly Mileage"] || row["averageMonthlyMileage"] || "0") || undefined,
    currentInsurer: row["Current Insurer"] || row["currentInsurer"] || "",
    policyNumber: row["Policy Number"] || row["policyNumber"] || "",
    policyStartDate: row["Policy Start Date"] || row["policyStartDate"] || "",
    policyEndDate: row["Policy End Date"] || row["policyEndDate"] || "",
    coverageType: row["Coverage Type"] || row["coverageType"] || "",
    purchasePrice: parseFloat(row["Purchase Price"] || row["purchasePrice"] || "0") || undefined,
    purchaseDate: row["Purchase Date"] || row["purchaseDate"] || "",
    currentValuation: parseFloat(row["Current Valuation"] || row["currentValuation"] || "0") || undefined,
    replacementValue: parseFloat(row["Replacement Value"] || row["replacementValue"] || "0") || undefined,
  }));
}

/**
 * Validate vehicle import row
 */
function validateVehicleRow(row: VehicleImportRow, rowIndex: number): string | null {
  // Required fields
  if (!row.registrationNumber || row.registrationNumber.trim() === "") {
    return `Row ${rowIndex + 2}: Registration Number is required`;
  }
  
  if (!row.make || row.make.trim() === "") {
    return `Row ${rowIndex + 2}: Make is required`;
  }
  
  if (!row.model || row.model.trim() === "") {
    return `Row ${rowIndex + 2}: Model is required`;
  }
  
  if (!row.year || row.year < 1900 || row.year > new Date().getFullYear() + 1) {
    return `Row ${rowIndex + 2}: Valid Year is required (1900-${new Date().getFullYear() + 1})`;
  }
  
  // Validate enums if provided
  const validFuelTypes = ["petrol", "diesel", "electric", "hybrid"];
  if (row.fuelType && !validFuelTypes.includes(row.fuelType.toLowerCase())) {
    return `Row ${rowIndex + 2}: Invalid Fuel Type. Must be one of: ${validFuelTypes.join(", ")}`;
  }
  
  const validTransmissions = ["manual", "automatic"];
  if (row.transmissionType && !validTransmissions.includes(row.transmissionType.toLowerCase())) {
    return `Row ${rowIndex + 2}: Invalid Transmission. Must be one of: ${validTransmissions.join(", ")}`;
  }
  
  const validUsageTypes = ["private", "commercial", "logistics", "mining", "agriculture", "public_transport"];
  if (row.usageType && !validUsageTypes.includes(row.usageType.toLowerCase())) {
    return `Row ${rowIndex + 2}: Invalid Usage Type. Must be one of: ${validUsageTypes.join(", ")}`;
  }
  
  const validCoverageTypes = ["comprehensive", "third_party", "third_party_fire_theft"];
  if (row.coverageType && !validCoverageTypes.includes(row.coverageType.toLowerCase().replace(/ /g, "_"))) {
    return `Row ${rowIndex + 2}: Invalid Coverage Type. Must be one of: Comprehensive, Third Party, Third Party Fire Theft`;
  }
  
  return null;
}

/**
 * Import vehicles from parsed data
 */
export async function importVehicles(
  vehicles: VehicleImportRow[],
  fleetId: number,
  ownerId: number,
  tenantId: string
): Promise<ImportResult> {
  const errors: Array<{ row: number; error: string; data?: any }> = [];
  const validVehicles: any[] = [];
  
  // Validate all rows
  vehicles.forEach((vehicle, index) => {
    const error = validateVehicleRow(vehicle, index);
    if (error) {
      errors.push({ row: index + 2, error, data: vehicle });
    } else {
      // Convert to database format
      const dbVehicle = {
        fleetId,
        ownerId,
        tenantId,
        registrationNumber: vehicle.registrationNumber.trim(),
        vin: vehicle.vin?.trim() || null,
        make: vehicle.make.trim(),
        model: vehicle.model.trim(),
        year: vehicle.year,
        engineCapacity: vehicle.engineCapacity || null,
        vehicleMass: vehicle.vehicleMass || null,
        color: vehicle.color?.trim() || null,
        fuelType: vehicle.fuelType?.toLowerCase() || null,
        transmissionType: vehicle.transmissionType?.toLowerCase() || null,
        usageType: vehicle.usageType?.toLowerCase() || "private",
        primaryUse: vehicle.primaryUse?.trim() || null,
        averageMonthlyMileage: vehicle.averageMonthlyMileage || null,
        currentInsurer: vehicle.currentInsurer?.trim() || null,
        policyNumber: vehicle.policyNumber?.trim() || null,
        policyStartDate: vehicle.policyStartDate ? new Date(vehicle.policyStartDate) : null,
        policyEndDate: vehicle.policyEndDate ? new Date(vehicle.policyEndDate) : null,
        coverageType: vehicle.coverageType?.toLowerCase().replace(/ /g, "_") || null,
        purchasePrice: vehicle.purchasePrice ? Math.round(vehicle.purchasePrice * 100) : null, // Convert to cents
        purchaseDate: vehicle.purchaseDate ? new Date(vehicle.purchaseDate) : null,
        currentValuation: vehicle.currentValuation ? Math.round(vehicle.currentValuation * 100) : null,
        replacementValue: vehicle.replacementValue ? Math.round(vehicle.replacementValue * 100) : null,
        status: "active",
        riskScore: 50, // Default medium risk
        maintenanceComplianceScore: 70, // Default compliance
      };
      
      validVehicles.push(dbVehicle);
    }
  });
  
  // If there are validation errors, return without importing
  if (errors.length > 0) {
    return {
      success: false,
      totalRows: vehicles.length,
      successCount: 0,
      errorCount: errors.length,
      errors,
    };
  }
  
  // Bulk insert valid vehicles
  try {
    const insertedCount = await bulkCreateFleetVehicles(validVehicles);
    
    return {
      success: true,
      totalRows: vehicles.length,
      successCount: insertedCount,
      errorCount: 0,
      errors: [],
    };
  } catch (error: any) {
    return {
      success: false,
      totalRows: vehicles.length,
      successCount: 0,
      errorCount: vehicles.length,
      errors: [{ row: 0, error: `Database error: ${error.message}` }],
    };
  }
}

// ============================================================================
// EXPORT FLEET DATA TO EXCEL/CSV
// ============================================================================

export interface VehicleExportRow {
  "Registration Number": string;
  VIN: string;
  Make: string;
  Model: string;
  Year: number;
  "Engine Capacity": number | null;
  "Vehicle Mass": number | null;
  Color: string | null;
  "Fuel Type": string | null;
  Transmission: string | null;
  "Usage Type": string | null;
  "Primary Use": string | null;
  "Avg Monthly Mileage": number | null;
  "Current Insurer": string | null;
  "Policy Number": string | null;
  "Policy Start Date": string | null;
  "Policy End Date": string | null;
  "Coverage Type": string | null;
  "Purchase Price": number | null;
  "Purchase Date": string | null;
  "Current Valuation": number | null;
  "Replacement Value": number | null;
  Status: string;
  "Risk Score": number;
  "Maintenance Compliance": number;
}

/**
 * Export fleet vehicles to Excel buffer
 */
export async function exportFleetVehiclesToExcel(fleetId: number): Promise<Buffer> {
  // Get all vehicles for fleet
  const vehicles = await getFleetVehiclesByFleetId(fleetId);
  
  // Convert to export format
  const exportData: VehicleExportRow[] = vehicles.map((vehicle) => ({
    "Registration Number": vehicle.registrationNumber || "",
    VIN: vehicle.vin || "",
    Make: vehicle.make || "",
    Model: vehicle.model || "",
    Year: vehicle.year || 0,
    "Engine Capacity": vehicle.engineCapacity || null,
    "Vehicle Mass": vehicle.vehicleMass || null,
    Color: vehicle.color || null,
    "Fuel Type": vehicle.fuelType || null,
    Transmission: vehicle.transmissionType || null,
    "Usage Type": vehicle.usageType || null,
    "Primary Use": vehicle.primaryUse || null,
    "Avg Monthly Mileage": vehicle.averageMonthlyMileage || null,
    "Current Insurer": vehicle.currentInsurer || null,
    "Policy Number": vehicle.policyNumber || null,
    "Policy Start Date": vehicle.policyStartDate ? new Date(vehicle.policyStartDate).toISOString().split("T")[0] : null,
    "Policy End Date": vehicle.policyEndDate ? new Date(vehicle.policyEndDate).toISOString().split("T")[0] : null,
    "Coverage Type": vehicle.coverageType ? vehicle.coverageType.replace(/_/g, " ") : null,
    "Purchase Price": vehicle.purchasePrice ? vehicle.purchasePrice / 100 : null, // Convert from cents
    "Purchase Date": vehicle.purchaseDate ? new Date(vehicle.purchaseDate).toISOString().split("T")[0] : null,
    "Current Valuation": vehicle.currentValuation ? vehicle.currentValuation / 100 : null,
    "Replacement Value": vehicle.replacementValue ? vehicle.replacementValue / 100 : null,
    Status: vehicle.status || "active",
    "Risk Score": vehicle.riskScore || 0,
    "Maintenance Compliance": vehicle.maintenanceComplianceScore || 0,
  }));
  
  // Create workbook
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Fleet Vehicles");
  
  // Generate buffer
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return buffer;
}

/**
 * Export fleet vehicles to CSV buffer
 */
export async function exportFleetVehiclesToCSV(fleetId: number): Promise<Buffer> {
  // Get all vehicles for fleet
  const vehicles = await getFleetVehiclesByFleetId(fleetId);
  
  // Convert to export format
  const exportData: VehicleExportRow[] = vehicles.map((vehicle) => ({
    "Registration Number": vehicle.registrationNumber || "",
    VIN: vehicle.vin || "",
    Make: vehicle.make || "",
    Model: vehicle.model || "",
    Year: vehicle.year || 0,
    "Engine Capacity": vehicle.engineCapacity || null,
    "Vehicle Mass": vehicle.vehicleMass || null,
    Color: vehicle.color || null,
    "Fuel Type": vehicle.fuelType || null,
    Transmission: vehicle.transmissionType || null,
    "Usage Type": vehicle.usageType || null,
    "Primary Use": vehicle.primaryUse || null,
    "Avg Monthly Mileage": vehicle.averageMonthlyMileage || null,
    "Current Insurer": vehicle.currentInsurer || null,
    "Policy Number": vehicle.policyNumber || null,
    "Policy Start Date": vehicle.policyStartDate ? new Date(vehicle.policyStartDate).toISOString().split("T")[0] : null,
    "Policy End Date": vehicle.policyEndDate ? new Date(vehicle.policyEndDate).toISOString().split("T")[0] : null,
    "Coverage Type": vehicle.coverageType ? vehicle.coverageType.replace(/_/g, " ") : null,
    "Purchase Price": vehicle.purchasePrice ? vehicle.purchasePrice / 100 : null,
    "Purchase Date": vehicle.purchaseDate ? new Date(vehicle.purchaseDate).toISOString().split("T")[0] : null,
    "Current Valuation": vehicle.currentValuation ? vehicle.currentValuation / 100 : null,
    "Replacement Value": vehicle.replacementValue ? vehicle.replacementValue / 100 : null,
    Status: vehicle.status || "active",
    "Risk Score": vehicle.riskScore || 0,
    "Maintenance Compliance": vehicle.maintenanceComplianceScore || 0,
  }));
  
  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  
  // Generate CSV
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  return Buffer.from(csv, "utf-8");
}

/**
 * Generate import template (empty Excel file with headers)
 */
export function generateImportTemplate(): Buffer {
  const template: Partial<VehicleExportRow>[] = [
    {
      "Registration Number": "ABC123GP",
      VIN: "1HGBH41JXMN109186",
      Make: "Toyota",
      Model: "Hilux",
      Year: 2020,
      "Engine Capacity": 2800,
      "Vehicle Mass": 2200,
      Color: "White",
      "Fuel Type": "diesel",
      Transmission: "manual",
      "Usage Type": "commercial",
      "Primary Use": "Logistics and delivery",
      "Avg Monthly Mileage": 2000,
      "Current Insurer": "Old Mutual",
      "Policy Number": "POL123456",
      "Policy Start Date": "2024-01-01",
      "Policy End Date": "2024-12-31",
      "Coverage Type": "comprehensive",
      "Purchase Price": 45000,
      "Purchase Date": "2020-03-15",
      "Current Valuation": 38000,
      "Replacement Value": 42000,
    },
  ];
  
  const worksheet = XLSX.utils.json_to_sheet(template);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Vehicle Import Template");
  
  // Add instructions sheet
  const instructions = [
    { Instruction: "1. Fill in vehicle details in the template" },
    { Instruction: "2. Required fields: Registration Number, Make, Model, Year" },
    { Instruction: "3. Fuel Type: petrol, diesel, electric, hybrid" },
    { Instruction: "4. Transmission: manual, automatic" },
    { Instruction: "5. Usage Type: private, commercial, logistics, mining, agriculture, public_transport" },
    { Instruction: "6. Coverage Type: comprehensive, third_party, third_party_fire_theft" },
    { Instruction: "7. Dates format: YYYY-MM-DD (e.g., 2024-01-15)" },
    { Instruction: "8. Prices in USD (will be converted to cents automatically)" },
    { Instruction: "9. Delete the example row before importing your data" },
  ];
  
  const instructionsSheet = XLSX.utils.json_to_sheet(instructions);
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions");
  
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return buffer;
}
