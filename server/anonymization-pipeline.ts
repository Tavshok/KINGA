/**
 * KINGA Hybrid Intelligence Governance Layer
 * Anonymization Transformation Pipeline
 * 
 * Implements:
 * - PII removal
 * - Geographic aggregation (city → province)
 * - Temporal aggregation (datetime → month)
 * - Vehicle year generalization (year → 5-year bracket)
 * - K-anonymity validation (k≥5)
 * - Global dataset insertion with audit logging
 * 
 * Compliance: POPIA (South Africa), GDPR (EU)
 */

import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";
import {
  claimIntelligenceDataset,
  globalAnonymizedDataset,
  anonymizationAuditLog,
  type GlobalAnonymizedDataset,
  type InsertGlobalAnonymizedDataset,
  type InsertAnonymizationAuditLog,
} from "../drizzle/schema";
import { eq, and, isNull, lt, sql } from "drizzle-orm";

/**
 * City → Province mapping for South African geographic aggregation
 */
const CITY_TO_PROVINCE: Record<string, string> = {
  // Gauteng
  "Johannesburg": "Gauteng",
  "Pretoria": "Gauteng",
  "Sandton": "Gauteng",
  "Midrand": "Gauteng",
  "Centurion": "Gauteng",
  "Roodepoort": "Gauteng",
  "Soweto": "Gauteng",
  "Benoni": "Gauteng",
  "Germiston": "Gauteng",
  "Boksburg": "Gauteng",
  
  // Western Cape
  "Cape Town": "Western Cape",
  "Stellenbosch": "Western Cape",
  "Paarl": "Western Cape",
  "George": "Western Cape",
  "Worcester": "Western Cape",
  "Hermanus": "Western Cape",
  "Mossel Bay": "Western Cape",
  "Knysna": "Western Cape",
  
  // KwaZulu-Natal
  "Durban": "KwaZulu-Natal",
  "Pietermaritzburg": "KwaZulu-Natal",
  "Richards Bay": "KwaZulu-Natal",
  "Newcastle": "KwaZulu-Natal",
  "Empangeni": "KwaZulu-Natal",
  "Ladysmith": "KwaZulu-Natal",
  
  // Eastern Cape
  "Port Elizabeth": "Eastern Cape",
  "East London": "Eastern Cape",
  "Mthatha": "Eastern Cape",
  "Grahamstown": "Eastern Cape",
  "Queenstown": "Eastern Cape",
  "Uitenhage": "Eastern Cape",
  
  // Free State
  "Bloemfontein": "Free State",
  "Welkom": "Free State",
  "Kroonstad": "Free State",
  "Bethlehem": "Free State",
  "Sasolburg": "Free State",
  
  // Limpopo
  "Polokwane": "Limpopo",
  "Tzaneen": "Limpopo",
  "Thohoyandou": "Limpopo",
  "Mokopane": "Limpopo",
  "Phalaborwa": "Limpopo",
  
  // Mpumalanga
  "Nelspruit": "Mpumalanga",
  "Witbank": "Mpumalanga",
  "Middelburg": "Mpumalanga",
  "Secunda": "Mpumalanga",
  "Ermelo": "Mpumalanga",
  
  // North West
  "Rustenburg": "North West",
  "Mahikeng": "North West",
  "Klerksdorp": "North West",
  "Potchefstroom": "North West",
  "Brits": "North West",
  
  // Northern Cape
  "Kimberley": "Northern Cape",
  "Upington": "Northern Cape",
  "Springbok": "Northern Cape",
  "De Aar": "Northern Cape",
};

/**
 * Generalize city to province
 */
function generalizeLocation(city: string | null): string {
  if (!city) return "Unknown";
  return CITY_TO_PROVINCE[city] || "Unknown";
}

/**
 * Generalize exact timestamp to month (YYYY-MM)
 */
function generalizeTimestamp(date: Date | null): string {
  if (!date) return new Date().toISOString().slice(0, 7);
  return date.toISOString().slice(0, 7); // "2026-02-12T10:30:00Z" → "2026-02"
}

/**
 * Generalize vehicle year to 5-year bracket
 */
function generalizeVehicleYear(year: number | null): string {
  if (!year) return "Unknown";
  
  const bracketStart = Math.floor(year / 5) * 5;
  const bracketEnd = bracketStart + 4;
  
  return `${bracketStart}-${bracketEnd}`;
}

/**
 * Compute SHA256 hash of quasi-identifiers for k-anonymity grouping
 */
function computeQuasiIdentifierHash(
  vehicleMake: string | null,
  vehicleModel: string | null,
  vehicleYearBracket: string,
  accidentType: string | null,
  province: string
): string {
  const quasiId = [
    vehicleMake || "unknown",
    vehicleModel || "unknown",
    vehicleYearBracket,
    accidentType || "unknown",
    province,
  ].join("|");
  
  return createHash("sha256").update(quasiId).digest("hex");
}

/**
 * Anonymized record structure (intermediate format before k-anonymity validation)
 */
interface AnonymizedRecord {
  sourceRecordId: number;
  anonymousRecordId: string;
  captureMonth: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYearBracket: string;
  vehicleMass: number | null;
  accidentType: string | null;
  province: string;
  detectedDamageComponents: any;
  damageSeverityScores: any;
  physicsPlausibilityScore: number | null;
  aiEstimatedCost: number | null;
  assessorAdjustedCost: number | null;
  insurerApprovedCost: number | null;
  costVarianceAiVsAssessor: number | null;
  costVarianceAssessorVsFinal: number | null;
  costVarianceAiVsFinal: number | null;
  aiFraudScore: number | null;
  finalFraudOutcome: string | null;
  assessorTier: string | null;
  assessmentTurnaroundHours: string | null;
  reassignmentCount: number | null;
  approvalTimelineHours: string | null;
  quasiIdentifierHash: string;
}

/**
 * K-anonymity validation result
 */
interface KAnonymityResult {
  valid: AnonymizedRecord[];
  withheld: AnonymizedRecord[];
  groupSizes: Map<string, number>;
}

/**
 * Validate k-anonymity: ensure at least k records share the same quasi-identifier combination
 */
function validateKAnonymity(
  records: AnonymizedRecord[],
  k: number = 5
): KAnonymityResult {
  // Group records by quasi-identifier hash
  const groups = new Map<string, AnonymizedRecord[]>();
  
  for (const record of records) {
    const hash = record.quasiIdentifierHash;
    if (!groups.has(hash)) {
      groups.set(hash, []);
    }
    groups.get(hash)!.push(record);
  }
  
  // Separate valid (k>=5) from withheld (k<5)
  const valid: AnonymizedRecord[] = [];
  const withheld: AnonymizedRecord[] = [];
  const groupSizes = new Map<string, number>();
  
  for (const [hash, groupRecords] of Array.from(groups.entries())) {
    const groupSize = groupRecords.length;
    groupSizes.set(hash, groupSize);
    
    if (groupSize >= k) {
      valid.push(...groupRecords);
    } else {
      withheld.push(...groupRecords);
      console.warn(
        `K-anonymity violation: group ${hash.slice(0, 8)}... has only ${groupSize} records (k=${k} required)`
      );
    }
  }
  
  return { valid, withheld, groupSizes };
}

/**
 * Transform a single claim intelligence record into anonymized format
 */
function transformToAnonymized(record: any): AnonymizedRecord {
  const anonymousRecordId = uuidv4();
  const captureMonth = generalizeTimestamp(record.capturedAt);
  const vehicleYearBracket = generalizeVehicleYear(record.vehicleYear);
  const province = generalizeLocation(record.incidentLocation);
  
  const quasiIdentifierHash = computeQuasiIdentifierHash(
    record.vehicleMake,
    record.vehicleModel,
    vehicleYearBracket,
    record.accidentType,
    province
  );
  
  return {
    sourceRecordId: record.id,
    anonymousRecordId,
    captureMonth,
    vehicleMake: record.vehicleMake,
    vehicleModel: record.vehicleModel,
    vehicleYearBracket,
    vehicleMass: record.vehicleMass,
    accidentType: record.accidentType,
    province,
    detectedDamageComponents: record.detectedDamageComponents,
    damageSeverityScores: record.damageSeverityScores,
    physicsPlausibilityScore: record.physicsPlausibilityScore,
    aiEstimatedCost: record.aiEstimatedCost,
    assessorAdjustedCost: record.assessorAdjustedCost,
    insurerApprovedCost: record.insurerApprovedCost,
    costVarianceAiVsAssessor: record.costVarianceAiVsAssessor,
    costVarianceAssessorVsFinal: record.costVarianceAssessorVsFinal,
    costVarianceAiVsFinal: record.costVarianceAiVsFinal,
    aiFraudScore: record.aiFraudScore,
    finalFraudOutcome: record.finalFraudOutcome,
    assessorTier: record.assessorTier,
    assessmentTurnaroundHours: record.assessmentTurnaroundHours,
    reassignmentCount: record.reassignmentCount,
    approvalTimelineHours: record.approvalTimelineHours,
    quasiIdentifierHash,
  };
}

/**
 * Insert anonymized records into global dataset and log audit events
 */
async function insertAnonymizedRecords(
  db: any,
  validRecords: AnonymizedRecord[],
  withheldRecords: AnonymizedRecord[],
  groupSizes: Map<string, number>
): Promise<{ inserted: number; withheld: number }> {
  let inserted = 0;
  let withheld = 0;
  
  // Insert valid records into global_anonymized_dataset
  for (const record of validRecords) {
    try {
      await db.insert(globalAnonymizedDataset).values({
        anonymousRecordId: record.anonymousRecordId,
        captureMonth: record.captureMonth,
        vehicleMake: record.vehicleMake,
        vehicleModel: record.vehicleModel,
        vehicleYearBracket: record.vehicleYearBracket,
        vehicleMass: record.vehicleMass,
        accidentType: record.accidentType,
        province: record.province,
        detectedDamageComponents: record.detectedDamageComponents,
        damageSeverityScores: record.damageSeverityScores,
        physicsPlausibilityScore: record.physicsPlausibilityScore,
        aiEstimatedCost: record.aiEstimatedCost,
        assessorAdjustedCost: record.assessorAdjustedCost,
        insurerApprovedCost: record.insurerApprovedCost,
        costVarianceAiVsAssessor: record.costVarianceAiVsAssessor,
        costVarianceAssessorVsFinal: record.costVarianceAssessorVsFinal,
        costVarianceAiVsFinal: record.costVarianceAiVsFinal,
        aiFraudScore: record.aiFraudScore,
        finalFraudOutcome: record.finalFraudOutcome,
        assessorTier: record.assessorTier,
        assessmentTurnaroundHours: record.assessmentTurnaroundHours,
        reassignmentCount: record.reassignmentCount,
        approvalTimelineHours: record.approvalTimelineHours,
      });
      
      // Log success in audit log
      await db.insert(anonymizationAuditLog).values({
        sourceRecordId: record.sourceRecordId,
        anonymousRecordId: record.anonymousRecordId,
        status: "success",
        quasiIdentifierHash: record.quasiIdentifierHash,
        groupSize: groupSizes.get(record.quasiIdentifierHash) || 0,
        transformationsApplied: [
          "pii_removal",
          "temporal_generalization",
          "geographic_generalization",
          "vehicle_year_generalization",
        ],
      });
      
      // Update source record to mark as anonymized
      await db
        .update(claimIntelligenceDataset)
        .set({ anonymizedAt: new Date() })
        .where(eq(claimIntelligenceDataset.id, record.sourceRecordId));
      
      inserted++;
    } catch (error) {
      console.error(`Failed to insert anonymized record ${record.anonymousRecordId}:`, error);
    }
  }
  
  // Log withheld records in audit log
  for (const record of withheldRecords) {
    try {
      await db.insert(anonymizationAuditLog).values({
        sourceRecordId: record.sourceRecordId,
        anonymousRecordId: null,
        status: "withheld_k_anonymity",
        quasiIdentifierHash: record.quasiIdentifierHash,
        groupSize: groupSizes.get(record.quasiIdentifierHash) || 0,
        transformationsApplied: [
          "pii_removal",
          "temporal_generalization",
          "geographic_generalization",
          "vehicle_year_generalization",
        ],
      });
      
      withheld++;
    } catch (error) {
      console.error(`Failed to log withheld record ${record.sourceRecordId}:`, error);
    }
  }
  
  return { inserted, withheld };
}

/**
 * Main anonymization pipeline function
 * Runs as a nightly batch job (cron: 0 2 * * * - 02:00 SAST)
 * 
 * Steps:
 * 1. Select eligible records (global_sharing_enabled=1, anonymized_at IS NULL, cooling period)
 * 2. Transform records (PII removal, generalization)
 * 3. Validate k-anonymity (k≥5)
 * 4. Insert valid records into global dataset
 * 5. Log audit events
 */
export async function runAnonymizationPipeline(): Promise<{
  processed: number;
  inserted: number;
  withheld: number;
}> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection failed");
  }
  
  console.log("[Anonymization Pipeline] Starting...");
  
  // Step 1: Select eligible records
  // Cooling period: 7 days (prevents real-time correlation attacks)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const eligibleRecords = await db
    .select()
    .from(claimIntelligenceDataset)
    .where(
      and(
        eq(claimIntelligenceDataset.globalSharingEnabled, 1),
        isNull(claimIntelligenceDataset.anonymizedAt),
        lt(claimIntelligenceDataset.capturedAt, sevenDaysAgo)
      )
    );
  
  console.log(`[Anonymization Pipeline] Found ${eligibleRecords.length} eligible records`);
  
  if (eligibleRecords.length === 0) {
    return { processed: 0, inserted: 0, withheld: 0 };
  }
  
  // Step 2: Transform records to anonymized format
  const anonymizedRecords = eligibleRecords.map(transformToAnonymized);
  
  // Step 3: Validate k-anonymity
  const { valid, withheld, groupSizes } = validateKAnonymity(anonymizedRecords, 5);
  
  console.log(`[Anonymization Pipeline] K-anonymity validation: ${valid.length} valid, ${withheld.length} withheld`);
  
  // Step 4 & 5: Insert valid records and log audit events
  const { inserted, withheld: withheldCount } = await insertAnonymizedRecords(
    db,
    valid,
    withheld,
    groupSizes
  );
  
  console.log(`[Anonymization Pipeline] Complete: ${inserted} inserted, ${withheldCount} withheld`);
  
  return {
    processed: eligibleRecords.length,
    inserted,
    withheld: withheldCount,
  };
}

/**
 * Manual anonymization trigger (for testing or admin use)
 */
export async function triggerAnonymization(): Promise<{
  processed: number;
  inserted: number;
  withheld: number;
}> {
  return await runAnonymizationPipeline();
}
