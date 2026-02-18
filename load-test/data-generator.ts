/**
 * Load Test Data Generator
 * 
 * Generates realistic test data for load testing:
 * - Claims with VIN, make, model, damage descriptions
 * - Quotes from panel beaters
 * - User data (claimants, assessors, processors)
 */

import { randomInt, randomBytes } from "crypto";

// Vehicle makes and models
const VEHICLE_DATA = [
  { make: "Toyota", models: ["Camry", "Corolla", "RAV4", "Hilux", "Prado"] },
  { make: "Honda", models: ["Civic", "Accord", "CR-V", "HR-V", "Pilot"] },
  { make: "Ford", models: ["Ranger", "Everest", "Focus", "Mustang", "F-150"] },
  { make: "Mazda", models: ["CX-5", "CX-9", "Mazda3", "Mazda6", "BT-50"] },
  { make: "Hyundai", models: ["Tucson", "Santa Fe", "i30", "Kona", "Palisade"] },
  { make: "Nissan", models: ["X-Trail", "Navara", "Qashqai", "Patrol", "Juke"] },
  { make: "BMW", models: ["X5", "X3", "3 Series", "5 Series", "7 Series"] },
  { make: "Mercedes-Benz", models: ["C-Class", "E-Class", "GLC", "GLE", "S-Class"] },
];

// Damage types and descriptions
const DAMAGE_TYPES = [
  { type: "Front Impact", description: "Front bumper damage with headlight crack", severity: "moderate" },
  { type: "Rear Impact", description: "Rear bumper dent and taillight damage", severity: "minor" },
  { type: "Side Swipe", description: "Driver side door and mirror damage", severity: "moderate" },
  { type: "Hail Damage", description: "Multiple dents across hood and roof", severity: "moderate" },
  { type: "Parking Lot Collision", description: "Minor scrape on rear quarter panel", severity: "minor" },
  { type: "Total Loss", description: "Severe structural damage from rollover", severity: "severe" },
  { type: "Windshield Crack", description: "Large crack across windshield", severity: "minor" },
  { type: "Paint Scratch", description: "Deep scratch along passenger side", severity: "minor" },
];

// First and last names for user generation
const FIRST_NAMES = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "William", "Elizabeth"];
const LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"];

/**
 * Generate random VIN (17 characters)
 */
export function generateVIN(): string {
  const chars = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789"; // Excludes I, O, Q
  let vin = "";
  for (let i = 0; i < 17; i++) {
    vin += chars[randomInt(chars.length)];
  }
  return vin;
}

/**
 * Generate random vehicle data
 */
export function generateVehicle() {
  const vehicleData = VEHICLE_DATA[randomInt(VEHICLE_DATA.length)];
  const model = vehicleData.models[randomInt(vehicleData.models.length)];
  const year = 2015 + randomInt(10); // 2015-2024
  
  return {
    vin: generateVIN(),
    make: vehicleData.make,
    model,
    year,
    registrationNumber: `${String.fromCharCode(65 + randomInt(26))}${String.fromCharCode(65 + randomInt(26))}${String.fromCharCode(65 + randomInt(26))}${randomInt(1000, 9999)}`,
  };
}

/**
 * Generate random damage data
 */
export function generateDamage() {
  const damage = DAMAGE_TYPES[randomInt(DAMAGE_TYPES.length)];
  const estimatedCost = damage.severity === "severe" ? randomInt(50000, 200000) :
                        damage.severity === "moderate" ? randomInt(10000, 50000) :
                        randomInt(1000, 10000);
  
  return {
    type: damage.type,
    description: damage.description,
    severity: damage.severity,
    estimatedCostCents: estimatedCost,
  };
}

/**
 * Generate random user data
 */
export function generateUser(role: "claimant" | "assessor" | "processor" = "claimant") {
  const firstName = FIRST_NAMES[randomInt(FIRST_NAMES.length)];
  const lastName = LAST_NAMES[randomInt(LAST_NAMES.length)];
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
  const phone = `+1${randomInt(200, 999)}${randomInt(100, 999)}${randomInt(1000, 9999)}`;
  
  return {
    firstName,
    lastName,
    email,
    phone,
    role,
  };
}

/**
 * Generate complete claim data
 */
export function generateClaim(tenantId: number) {
  const vehicle = generateVehicle();
  const damage = generateDamage();
  const claimant = generateUser("claimant");
  const incidentDate = new Date(Date.now() - randomInt(1, 30) * 24 * 60 * 60 * 1000); // Last 30 days
  
  return {
    tenantId,
    claimReference: `CLM-${Date.now()}-${randomInt(1000, 9999)}`,
    
    // Vehicle data
    vehicleVin: vehicle.vin,
    vehicleMake: vehicle.make,
    vehicleModel: vehicle.model,
    vehicleYear: vehicle.year,
    vehicleRegistration: vehicle.registrationNumber,
    
    // Damage data
    damageType: damage.type,
    damageDescription: damage.description,
    damageSeverity: damage.severity,
    estimatedRepairCost: damage.estimatedCostCents,
    
    // Claimant data
    claimantName: `${claimant.firstName} ${claimant.lastName}`,
    claimantEmail: claimant.email,
    claimantPhone: claimant.phone,
    
    // Incident data
    incidentDate: incidentDate.toISOString(),
    incidentLocation: `${randomInt(1, 999)} Main St, City ${randomInt(1, 50)}, State`,
    
    // Status
    status: "pending_intake" as const,
    submittedAt: new Date().toISOString(),
  };
}

/**
 * Generate panel beater quote data
 */
export function generateQuote(claimId: number) {
  const laborHours = randomInt(5, 50);
  const laborRate = 8000; // $80/hour in cents
  const partsCount = randomInt(1, 10);
  const partsCost = randomInt(5000, 50000);
  
  const lineItems = [
    {
      description: "Labor",
      quantity: laborHours,
      unitPrice: laborRate,
      totalPrice: laborHours * laborRate,
    },
    {
      description: "Parts",
      quantity: partsCount,
      unitPrice: Math.floor(partsCost / partsCount),
      totalPrice: partsCost,
    },
  ];
  
  const totalCost = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  
  return {
    claimId,
    panelBeaterId: randomInt(1, 20), // Assume 20 panel beaters
    quoteReference: `QTE-${Date.now()}-${randomInt(1000, 9999)}`,
    totalCostCents: totalCost,
    lineItems: JSON.stringify(lineItems),
    estimatedCompletionDays: randomInt(3, 14),
    submittedAt: new Date().toISOString(),
  };
}

/**
 * Generate batch of claims
 */
export function generateClaimBatch(tenantId: number, count: number) {
  const claims = [];
  for (let i = 0; i < count; i++) {
    claims.push(generateClaim(tenantId));
  }
  return claims;
}

/**
 * Generate batch of quotes
 */
export function generateQuoteBatch(claimIds: number[], quotesPerClaim: number = 3) {
  const quotes = [];
  for (const claimId of claimIds) {
    for (let i = 0; i < quotesPerClaim; i++) {
      quotes.push(generateQuote(claimId));
    }
  }
  return quotes;
}
