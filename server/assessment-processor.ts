/**
 * KINGA Assessment Processor — LLM-First Architecture with ML-Ready Plugin System
 * 
 * Architecture:
 *   Primary Intelligence: LLM (vision + structured output)
 *   Fallback: Inline TypeScript calculations (deterministic)
 *   Future: Pluggable ML models (scikit-learn, TensorFlow) via IModelPlugin interface
 * 
 * Pipeline:
 * 1. Upload PDF to S3
 * 2. Extract text from PDF (Node.js pdf-parse — no Python)
 * 3. Extract structured data with LLM (text + PDF vision)
 * 4. Classify and extract images from PDF via LLM vision
 * 5. Generate component repair/replace recommendations (LLM)
 * 6. Run physics validation (LLM-first, TypeScript fallback)
 * 7. Run fraud detection (LLM-first, TypeScript fallback)
 * 8. Return comprehensive assessment result with multi-quote comparison
 * 
 * ML-Ready: When trained models become available, implement IModelPlugin
 * and register them via registerPlugin(). They will take priority over
 * LLM analysis for their respective domains.
 */

import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { nanoid } from 'nanoid';
import { storagePut } from './storage';
import { invokeLLM } from './_core/llm';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

interface ItemizedCost {
  description: string;
  amount: number;
  category?: string;
}

interface CostBreakdown {
  labor?: number;
  parts?: number;
  materials?: number;
  paint?: number;
  sublet?: number;
  other?: number;
}

interface ComponentRecommendation {
  component: string;
  action: 'repair' | 'replace';
  severity: 'minor' | 'moderate' | 'severe';
  estimatedCost: number;
  laborHours: number;
  reasoning: string;
}

interface QuoteFigure {
  label: string;
  amount: number;
  source: string;
  type: 'original' | 'agreed' | 'ai' | 'reference';
  description?: string;
}

interface PhotoWithClassification {
  url: string;
  classification: 'damage_photo' | 'document';
  page?: number;
}

interface PhysicsAnalysis {
  is_valid: boolean;
  confidence: number;
  damageConsistency: string;
  flags: string[];
  physics_analysis: {
    kinetic_energy_joules: number;
    vehicle_mass_kg: number;
    impact_speed_ms: number;
    deceleration_ms2: number;
    g_force: number;
  };
  recommendations: string[];
  impactSpeed: number;
  impactForce: number;
  energyDissipated: number;
  deceleration: number;
  physicsScore: number;
}

interface FraudAnalysis {
  fraud_probability: number;
  risk_level: string;
  risk_score: number;
  confidence: number;
  top_risk_factors: string[];
  recommendations: string[];
  indicators: {
    claimHistory: number;
    damageConsistency: number;
    documentAuthenticity: number;
    behavioralPatterns: number;
    ownershipVerification: number;
    geographicRisk: number;
  };
  physics_cross_reference: {
    physics_flags_count: number;
    physics_score: number;
    physics_contributes_to_fraud: boolean;
    physics_notes: string;
  };
  analysis_notes: string;
}

interface AssessmentResult {
  pdfUrl: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleRegistration: string;
  vehicleMass?: string;
  claimantName?: string;
  accidentDate?: string;
  accidentLocation?: string;
  accidentDescription?: string;
  policeReportReference?: string;
  damageDescription?: string;
  damageLocation?: string;
  estimatedCost?: number;
  originalQuote?: number;
  agreedCost?: number;
  marketValue?: number;
  savings?: number;
  excessAmount?: number;
  betterment?: number;
  assessorName?: string;
  repairerName?: string;
  itemizedCosts?: ItemizedCost[];
  costBreakdown?: CostBreakdown;
  componentRecommendations?: ComponentRecommendation[];
  quotes?: QuoteFigure[];
  damagePhotos: string[];
  allPhotos?: PhotoWithClassification[];
  accidentType?: string;
  damagedComponents: string[];
  physicsAnalysis: PhysicsAnalysis;
  fraudAnalysis: FraudAnalysis;
  missingData: string[];
  dataQuality: Record<string, boolean>;
  dataCompleteness: number;
}

// ============================================================
// ML-READY PLUGIN INTERFACE
// ============================================================
// When trained models are available (from KINGA-CLP-2026-021
// Continuous Learning Pipeline), implement this interface and
// register via registerPlugin(). Plugins take priority over LLM.

export interface IModelPlugin {
  /** Unique identifier for this plugin */
  id: string;
  /** Domain: 'physics', 'fraud', 'cost', 'classification' */
  domain: 'physics' | 'fraud' | 'cost' | 'classification';
  /** Semantic version of the trained model */
  version: string;
  /** Whether the model is trained and ready */
  isReady(): boolean;
  /** Run prediction. Returns null if model can't handle this input. */
  predict(input: Record<string, any>): Promise<Record<string, any> | null>;
  /** Model metadata for audit trail */
  metadata(): { trainedOn: string; accuracy: number; datasetSize: number };
}

/** Registry of ML model plugins */
const modelPlugins: Map<string, IModelPlugin> = new Map();

/** Register a trained ML model plugin */
export function registerPlugin(plugin: IModelPlugin): void {
  console.log(`🔌 Registered ML plugin: ${plugin.id} (${plugin.domain} v${plugin.version})`);
  modelPlugins.set(plugin.domain, plugin);
}

/** Get a registered plugin for a domain, if available and ready */
function getPlugin(domain: string): IModelPlugin | null {
  const plugin = modelPlugins.get(domain);
  if (plugin && plugin.isReady()) {
    return plugin;
  }
  return null;
}

// ============================================================
// VEHICLE PHYSICS CONSTANTS (TypeScript — no numpy needed)
// ============================================================

const VEHICLE_MASSES: Record<string, number> = {
  sedan: 1500, suv: 2000, truck: 2500, van: 1800, hatchback: 1200, coupe: 1400,
};

const TYPICAL_SPEEDS: Record<string, [number, number]> = {
  rear_end: [20, 60], side_impact: [30, 80], head_on: [40, 100],
  parking_lot: [5, 20], highway: [80, 120], rollover: [40, 100],
};

const SEVERITY_ENERGY_RANGES: Record<string, [number, number]> = {
  minor: [0, 50000], moderate: [50000, 150000], severe: [150000, 400000],
  total_loss: [400000, Infinity],
};

const EXPECTED_DAMAGE_LOCATIONS: Record<string, string[]> = {
  rear_end: ['rear'], side_impact: ['left_side', 'right_side'],
  head_on: ['front'], parking_lot: ['rear', 'front', 'left_side', 'right_side'],
  highway: ['front', 'rear'],
};

const GRAVITY = 9.81;
const CRUMPLE_DISTANCE = 0.5; // meters

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/** Clean "null" strings from LLM output */
function cleanNullStrings(value: any): any {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'null' || trimmed === 'n/a' || trimmed === 'none' || trimmed === 'unknown' || trimmed === '') {
      return null;
    }
    return value;
  }
  return value;
}

/** Normalize damage location to general area */
function normalizeDamageLocation(loc: string): string {
  const lower = loc.toLowerCase();
  // Check rear BEFORE front because 'rear bumper' contains 'bumper' which would match front
  if (['rear', 'trunk', 'taillight', 'back'].some(x => lower.includes(x))) return 'rear';
  if (['front', 'bumper', 'hood', 'radiator', 'grille', 'headlight'].some(x => lower.includes(x))) return 'front';
  if (['left', 'driver'].some(x => lower.includes(x))) return 'left_side';
  if (['right', 'passenger'].some(x => lower.includes(x))) return 'right_side';
  if (['roof', 'top'].some(x => lower.includes(x))) return 'roof';
  return lower;
}

/** Determine vehicle type from model name */
function inferVehicleType(model: string): string {
  const lower = (model || '').toLowerCase();
  if (['ranger', 'hilux', 'truck', 'pickup', 'navara', 'triton', 'bt-50'].some(x => lower.includes(x))) return 'truck';
  if (['suv', 'fortuner', 'pajero', 'rav4', 'tucson', 'sportage', 'x-trail'].some(x => lower.includes(x))) return 'suv';
  if (['van', 'quantum', 'hiace', 'transporter'].some(x => lower.includes(x))) return 'van';
  if (['polo', 'jazz', 'swift', 'i20', 'fiesta'].some(x => lower.includes(x))) return 'hatchback';
  return 'sedan';
}

// ============================================================
// PHYSICS VALIDATION ENGINE (TypeScript — replaces Python)
// ============================================================

/**
 * Inline physics validation using collision dynamics.
 * Same formulas as physics_validator.py but runs natively in Node.js.
 * Uses: KE = 0.5mv², F = mΔv/Δt, a = v²/2d, G = a/9.81
 */
function validatePhysicsInline(
  vehicleType: string,
  accidentType: string,
  estimatedSpeed: number,
  damageSeverity: string,
  damageLocations: string[],
): PhysicsAnalysis {
  const flags: string[] = [];
  
  // 1. Calculate kinetic energy
  const vehicleMass = VEHICLE_MASSES[vehicleType.toLowerCase()] || 1500;
  const speedMs = estimatedSpeed / 3.6;
  const kineticEnergy = 0.5 * vehicleMass * (speedMs * speedMs);
  
  // 2. Validate speed vs damage severity
  const expectedRange = SEVERITY_ENERGY_RANGES[damageSeverity] || [0, Infinity];
  if (kineticEnergy < expectedRange[0] || kineticEnergy > expectedRange[1]) {
    flags.push(
      `MISMATCH: Reported ${damageSeverity} damage inconsistent with impact energy (${(kineticEnergy / 1000).toFixed(1)} kJ). Expected range: ${(expectedRange[0] / 1000).toFixed(1)}-${expectedRange[1] === Infinity ? '∞' : (expectedRange[1] / 1000).toFixed(1)} kJ`
    );
  }
  
  // 3. Validate damage location vs accident type
  const normalizedLocs = damageLocations.map(normalizeDamageLocation);
  const expectedLocs = EXPECTED_DAMAGE_LOCATIONS[accidentType] || [];
  if (expectedLocs.length > 0 && !normalizedLocs.some(loc => expectedLocs.includes(loc))) {
    flags.push(
      `IMPOSSIBLE DAMAGE PATTERN: ${accidentType} accident reported, but damage at ${damageLocations.join(', ')}. Expected damage at ${expectedLocs.join(', ')}`
    );
  }
  
  // 4. Calculate deceleration and G-force
  const deceleration = speedMs > 0 ? (speedMs * speedMs) / (2 * CRUMPLE_DISTANCE) : 0;
  const gForce = deceleration / GRAVITY;
  
  if (gForce > 50) {
    flags.push(`FATAL COLLISION: Calculated g-force (${gForce.toFixed(1)}g) suggests fatal or near-fatal impact. Verify occupant injuries reported.`);
  } else if (gForce > 20) {
    flags.push(`SEVERE IMPACT: Calculated g-force (${gForce.toFixed(1)}g) suggests serious injuries likely. Verify injury claims.`);
  }
  
  // 5. Validate speed vs accident type
  const typicalRange = TYPICAL_SPEEDS[accidentType] || [0, 200];
  if (estimatedSpeed < typicalRange[0] || estimatedSpeed > typicalRange[1]) {
    flags.push(`UNUSUAL SPEED: Reported speed (${estimatedSpeed} km/h) is atypical for ${accidentType} accidents. Typical range: ${typicalRange[0]}-${typicalRange[1]} km/h`);
  }
  
  // 6. Check impossible damage combinations
  if (normalizedLocs.includes('roof') && !['rollover', 'falling_object'].includes(accidentType)) {
    flags.push(`IMPOSSIBLE: Roof damage reported in ${accidentType} accident. Roof damage typically only occurs in rollovers or falling objects.`);
  }
  
  // 7. Calculate impact force (F = mv/t, contact time ~0.1s)
  const impactForce = vehicleMass * speedMs / 0.1;
  
  // 8. Calculate energy dissipation percentage (crumple zone absorbs ~60%)
  const energyDissipated = kineticEnergy > 0 ? 60 : 0;
  
  // 9. Confidence and consistency
  const confidence = Math.max(0, Math.min(1, 1.0 - (flags.length * 0.2)));
  const physicsScore = Math.round(confidence * 100);
  
  let damageConsistency = 'consistent';
  if (flags.some(f => f.includes('IMPOSSIBLE'))) damageConsistency = 'impossible';
  else if (flags.some(f => f.includes('MISMATCH') || f.includes('UNUSUAL'))) damageConsistency = 'inconsistent';
  else if (flags.length > 0) damageConsistency = 'questionable';
  
  const recommendations: string[] = [];
  if (flags.length > 0) {
    recommendations.push('Request additional photos of damage');
    recommendations.push('Interview driver for detailed accident description');
    recommendations.push('Request police report for independent verification');
    if (gForce > 20) recommendations.push('Verify medical records for occupant injuries');
  }
  
  return {
    is_valid: flags.length === 0,
    confidence,
    damageConsistency,
    flags,
    physics_analysis: {
      kinetic_energy_joules: kineticEnergy,
      vehicle_mass_kg: vehicleMass,
      impact_speed_ms: speedMs,
      deceleration_ms2: deceleration,
      g_force: gForce,
    },
    recommendations,
    impactSpeed: Math.round(estimatedSpeed),
    impactForce: Math.round(impactForce / 1000), // kN
    energyDissipated,
    deceleration: Math.round(gForce * 10) / 10,
    physicsScore,
  };
}

// ============================================================
// FRAUD DETECTION ENGINE (TypeScript — replaces Python)
// ============================================================

/**
 * Rule-based fraud scoring engine.
 * Same logic as fraud_ml_model.py's _rule_based_fraud_detection().
 * When a trained RandomForest model is available, register it as a
 * plugin and it will automatically take priority.
 */
function detectFraudInline(
  claimAmount: number,
  vehicleAge: number,
  previousClaimsCount: number,
  damageSeverityScore: number,
  physicsValidationScore: number,
  hasWitnesses: boolean,
  hasPoliceReport: boolean,
  hasPhotos: boolean,
  isHighValue: boolean,
  accidentType: string,
): { fraudProbability: number; riskLevel: string; topRiskFactors: string[]; recommendations: string[] } {
  let fraudScore = 0;
  const riskFactors: string[] = [];
  
  // High claim amount
  if (claimAmount > 10000) {
    fraudScore += 0.2;
    riskFactors.push('high_claim_amount');
  }
  
  // Multiple previous claims
  if (previousClaimsCount > 2) {
    fraudScore += 0.3;
    riskFactors.push('multiple_previous_claims');
  }
  
  // Low physics validation score
  if (physicsValidationScore < 0.5) {
    fraudScore += 0.4;
    riskFactors.push('failed_physics_validation');
  }
  
  // No witnesses or police report
  if (!hasWitnesses && !hasPoliceReport) {
    fraudScore += 0.2;
    riskFactors.push('no_independent_verification');
  }
  
  // No photos
  if (!hasPhotos) {
    fraudScore += 0.15;
    riskFactors.push('no_photographic_evidence');
  }
  
  // High value claim on old vehicle
  if (isHighValue && vehicleAge > 10) {
    fraudScore += 0.25;
    riskFactors.push('high_value_old_vehicle');
  }
  
  // Severe damage with low-speed accident type
  if (damageSeverityScore > 0.7 && accidentType === 'parking_lot') {
    fraudScore += 0.2;
    riskFactors.push('severe_damage_low_speed_scenario');
  }
  
  fraudScore = Math.min(1.0, fraudScore);
  
  const riskLevel = fraudScore < 0.3 ? 'low' : fraudScore < 0.6 ? 'medium' : fraudScore < 0.8 ? 'high' : 'critical';
  
  const recommendations: string[] = [];
  if (fraudScore > 0.5) {
    recommendations.push('Conduct in-person vehicle inspection');
    recommendations.push('Interview claimant and witnesses');
    recommendations.push('Request additional documentation');
  }
  if (fraudScore > 0.7) {
    recommendations.push('Escalate to fraud investigation team');
    recommendations.push('Consider claim denial pending investigation');
  }
  
  return { fraudProbability: fraudScore, riskLevel, topRiskFactors: riskFactors, recommendations };
}

// ============================================================
// MAIN ASSESSMENT PROCESSOR
// ============================================================

export async function processExternalAssessment(
  fileName: string,
  fileData: string | Buffer
): Promise<AssessmentResult> {
  const fileBuffer = typeof fileData === 'string' 
    ? Buffer.from(fileData, "base64")
    : fileData;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📄 PROCESSING ASSESSMENT: ${fileName}`);
  console.log(`📦 File size: ${fileBuffer.length} bytes`);
  console.log(`🏗️ Architecture: LLM-First + TypeScript Fallback + ML-Ready Plugins`);
  console.log(`${'='.repeat(60)}`);

  // Upload PDF to S3
  const { url: pdfUrl } = await storagePut(
    `external-assessments/${nanoid()}-${fileName}`,
    fileBuffer,
    "application/pdf"
  );
  console.log(`✅ PDF uploaded to S3: ${pdfUrl}`);

  // Save PDF temporarily for local processing
  const tempPdfPath = join('/tmp', `assessment-${nanoid()}.pdf`);
  writeFileSync(tempPdfPath, fileBuffer);

  // ============================================================
  // STEP 1: Extract text from PDF (Node.js — no Python)
  // ============================================================
  console.log('\n📝 Step 1: Extracting text from PDF (Node.js pdf-parse)...');
  let extractedText = '';
  
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
    const textResult = await parser.getText();
    extractedText = textResult.text || '';
    await parser.destroy();
    console.log(`✅ Text extraction: ${extractedText.length} chars`);
  } catch (error: any) {
    console.error(`❌ Text extraction failed: ${error.message}`);
  }
  
  // If text extraction yielded very little, try LLM vision on the PDF directly
  if (extractedText.length < 100) {
    console.log('🔄 Low text yield — will rely on LLM vision for PDF content...');
  }

  // ============================================================
  // STEP 2: Extract structured data with LLM (text + PDF vision)
  // ============================================================
  console.log('\n🤖 Step 2: Extracting structured data with LLM...');
  
  // Build message content — use text if available, plus PDF vision
  const userContent: any[] = [];
  
  if (extractedText.length > 50) {
    userContent.push({
      type: "text",
      text: `Extract ALL information from this vehicle damage assessment report.

CRITICAL: Extract every cost figure mentioned. Look for original quotes, agreed costs, market values, savings, excess amounts, betterment, assessor names, repairer names.

=== DOCUMENT TEXT ===
${extractedText}
=== END DOCUMENT ===`
    });
  }
  
  // Always include the PDF file for vision analysis
  userContent.push({
    type: "file_url",
    file_url: {
      url: pdfUrl,
      mime_type: "application/pdf" as const,
    }
  });
  
  if (extractedText.length <= 50) {
    userContent.push({
      type: "text",
      text: "Extract ALL information from this vehicle damage assessment report PDF. The text extraction yielded minimal results, so please read the PDF visually. Extract every cost figure, vehicle details, claimant info, damage descriptions, and assessor/repairer names."
    });
  }

  const extractionResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert at extracting structured data from vehicle damage assessment reports. 
Extract ALL available information with precision. For missing fields, return empty string "" (not "null").

CRITICAL COST EXTRACTION RULES:
- Extract EVERY cost figure mentioned anywhere in the document
- "Original Repairer Quote" or "Repairer's Estimate" = originalQuote
- "Agreed Cost" or "Final Cost" or "Negotiated Amount" = agreedCost  
- "Market Value" or "Retail Value" = marketValue
- "Savings" or "Reduction" = savings (difference between original and agreed)
- "Excess" or "Deductible" = excessAmount
- "Betterment" or "Depreciation" = betterment
- For estimatedCost, use the AGREED cost if available, otherwise the original quote
- Extract assessor name and repairer/panel beater name

For itemized costs, extract EVERY line item you can find - labor items, parts, materials, paint, sublet work.
If no individual line items exist but a total cost is given, estimate a reasonable breakdown:
- For side impacts: ~35% labor, ~40% parts, ~15% paint, ~10% materials
- For rear-end: ~30% labor, ~50% parts, ~10% paint, ~10% materials  
- For head-on: ~35% labor, ~45% parts, ~10% paint, ~10% materials
Always populate costBreakdown with estimated category totals that sum to the total cost.
For damagedComponents, infer from damage description (e.g., 'left handside' = left fender, left door, left mirror, left quarter panel).`
      },
      {
        role: "user",
        content: userContent
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "assessment_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            vehicleMake: { type: "string" },
            vehicleModel: { type: "string" },
            vehicleYear: { type: "integer" },
            vehicleRegistration: { type: "string" },
            vehicleMass: { type: "string" },
            claimantName: { type: "string" },
            accidentDate: { type: "string" },
            accidentLocation: { type: "string" },
            accidentDescription: { type: "string" },
            policeReportReference: { type: "string" },
            damageDescription: { type: "string" },
            damageLocation: { type: "string" },
            estimatedCost: { type: "number", description: "Use agreed cost if available, otherwise original quote" },
            originalQuote: { type: "number", description: "Original repairer quote/estimate before negotiation" },
            agreedCost: { type: "number", description: "Final agreed cost after assessment/negotiation" },
            marketValue: { type: "number", description: "Vehicle market/retail value" },
            savings: { type: "number", description: "Savings amount (original - agreed)" },
            excessAmount: { type: "number", description: "Insurance excess/deductible amount" },
            betterment: { type: "number", description: "Betterment/depreciation amount" },
            assessorName: { type: "string", description: "Name of the assessor or assessment company" },
            repairerName: { type: "string", description: "Name of the repair shop or panel beater" },
            estimatedSpeed: { type: "number", description: "Estimated impact speed km/h, infer from accident type if not stated" },
            accidentType: { type: "string", description: "rear_end, side_impact, head_on, parking_lot, highway, rollover, or other" },
            damagedComponents: { 
              type: "array",
              items: { type: "string" },
              description: "List of ALL damaged parts/components mentioned or inferred"
            },
            itemizedCosts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string", description: "Component or work description" },
                  amount: { type: "number", description: "Cost amount" },
                  category: { type: "string", description: "One of: labor, parts, materials, paint, sublet, other" }
                },
                required: ["description", "amount", "category"],
                additionalProperties: false
              },
              description: "Every individual cost line item from the assessment"
            },
            costBreakdown: {
              type: "object",
              properties: {
                labor: { type: "number" },
                parts: { type: "number" },
                materials: { type: "number" },
                paint: { type: "number" },
                sublet: { type: "number" },
                other: { type: "number" }
              },
              required: ["labor", "parts", "materials", "paint", "sublet", "other"],
              additionalProperties: false,
              description: "Summary totals by category - MUST sum to the total cost"
            }
          },
          required: ["vehicleMake", "vehicleModel", "vehicleYear", "vehicleRegistration"],
          additionalProperties: false
        }
      }
    }
  });

  const llmRawContent = (extractionResponse.choices[0].message.content as string) || "{}";
  const rawExtractedData = JSON.parse(llmRawContent);
  
  // Clean null strings
  const extractedData: any = {};
  for (const [key, value] of Object.entries(rawExtractedData)) {
    if (typeof value === 'string') {
      extractedData[key] = cleanNullStrings(value) || '';
    } else if (Array.isArray(value)) {
      extractedData[key] = value;
    } else if (typeof value === 'object' && value !== null) {
      extractedData[key] = value;
    } else {
      extractedData[key] = value;
    }
  }
  
  console.log('\n📋 EXTRACTED DATA:');
  console.log(`  Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} ${extractedData.vehicleYear}`);
  console.log(`  Registration: ${extractedData.vehicleRegistration}`);
  console.log(`  Claimant: ${extractedData.claimantName || 'NOT FOUND'}`);
  console.log(`  Original Quote: $${extractedData.originalQuote || 'NOT FOUND'}`);
  console.log(`  Agreed Cost: $${extractedData.agreedCost || 'NOT FOUND'}`);
  console.log(`  Market Value: $${extractedData.marketValue || 'NOT FOUND'}`);
  console.log(`  Savings: $${extractedData.savings || 'NOT FOUND'}`);
  console.log(`  Assessor: ${extractedData.assessorName || 'NOT FOUND'}`);
  console.log(`  Repairer: ${extractedData.repairerName || 'NOT FOUND'}`);
  console.log(`  Itemized Costs: ${extractedData.itemizedCosts?.length || 0} items`);
  console.log(`  Damaged Components: ${extractedData.damagedComponents?.length || 0} items`);

  // Track data quality
  const missingData: string[] = [];
  const dataQuality: Record<string, boolean> = {
    hasClaimant: !!extractedData.claimantName,
    hasAccidentDetails: !!(extractedData.accidentDescription || extractedData.accidentDate),
    hasSpeed: !!extractedData.estimatedSpeed,
    hasCost: !!extractedData.estimatedCost,
    hasItemizedCosts: !!(extractedData.itemizedCosts && extractedData.itemizedCosts.length > 0),
    hasDamageLocation: !!extractedData.damageLocation,
    hasPoliceReport: !!extractedData.policeReportReference,
    hasDamagedComponents: !!(extractedData.damagedComponents && extractedData.damagedComponents.length > 0),
    hasMarketValue: !!extractedData.marketValue,
    hasPhotos: false, // Will be updated after image classification
  };
  
  for (const [key, has] of Object.entries(dataQuality)) {
    if (!has) {
      const label = key.replace('has', '').replace(/([A-Z])/g, ' $1').trim();
      missingData.push(label);
    }
  }

  const completeness = Math.round((Object.values(dataQuality).filter(v => v).length / Object.keys(dataQuality).length) * 100);
  console.log(`📊 Data Completeness: ${completeness}%`);

  // ============================================================
  // STEP 3: Classify images in PDF via LLM vision
  // ============================================================
  console.log('\n🖼️ Step 3: Classifying images in PDF via LLM vision...');
  let damagePhotoUrls: string[] = [];
  let allPhotos: PhotoWithClassification[] = [];
  
  try {
    const imageClassResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are analyzing a vehicle damage assessment PDF. Identify all images in the document and classify each as either:
- "damage_photo": Actual photographs of vehicle damage (dents, scratches, broken parts, accident scene)
- "document": Logos, stamps, signatures, diagrams, letterheads, or other non-damage images

For each damage photo, describe what damage is visible. Report the page number where each image appears.`
        },
        {
          role: "user",
          content: [
            {
              type: "file_url",
              file_url: { url: pdfUrl, mime_type: "application/pdf" as const }
            },
            {
              type: "text",
              text: "Analyze this PDF and identify all images. For each image, classify it as 'damage_photo' or 'document' and describe what you see."
            }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "image_classification",
          strict: true,
          schema: {
            type: "object",
            properties: {
              totalImages: { type: "integer", description: "Total number of images found" },
              damagePhotoCount: { type: "integer" },
              documentImageCount: { type: "integer" },
              images: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    page: { type: "integer" },
                    classification: { type: "string", description: "damage_photo or document" },
                    description: { type: "string" },
                    damageVisible: { type: "string", description: "Description of visible damage, empty if not a damage photo" }
                  },
                  required: ["page", "classification", "description", "damageVisible"],
                  additionalProperties: false
                }
              },
              overallDamageAssessment: { type: "string", description: "Summary of all visible damage from photos" }
            },
            required: ["totalImages", "damagePhotoCount", "documentImageCount", "images", "overallDamageAssessment"],
            additionalProperties: false
          }
        }
      }
    });
    
    const imageData = JSON.parse(imageClassResponse.choices[0].message.content as string);
    console.log(`📸 LLM identified ${imageData.totalImages} images (${imageData.damagePhotoCount} damage, ${imageData.documentImageCount} document)`);
    
    // For damage photos identified by LLM, we store the PDF URL as the photo reference
    // since we can't extract individual images without native libraries
    if (imageData.damagePhotoCount > 0) {
      // Store the PDF URL as the damage photo source
      for (const img of imageData.images) {
        if (img.classification === 'damage_photo') {
          allPhotos.push({
            url: pdfUrl,
            classification: 'damage_photo',
            page: img.page,
          });
          damagePhotoUrls.push(pdfUrl);
        } else {
          allPhotos.push({
            url: pdfUrl,
            classification: 'document',
            page: img.page,
          });
        }
      }
      
      // Update data quality
      dataQuality.hasPhotos = true;
      // Remove 'Photos' from missing data if it was there
      const photosIdx = missingData.indexOf(' Photos');
      if (photosIdx >= 0) missingData.splice(photosIdx, 1);
    }
    
    if (imageData.overallDamageAssessment) {
      console.log(`🔍 Damage summary: ${imageData.overallDamageAssessment.substring(0, 200)}`);
    }
    
  } catch (error: any) {
    console.warn(`⚠️ Image classification failed: ${error.message}`);
  }

  // Deduplicate damage photo URLs
  damagePhotoUrls = Array.from(new Set(damagePhotoUrls));

  // ============================================================
  // STEP 4: Generate component repair/replace recommendations
  // ============================================================
  console.log('\n🔧 Step 4: Generating component repair/replace recommendations...');
  let componentRecommendations: ComponentRecommendation[] = [];
  
  const components = extractedData.damagedComponents || [];
  const totalCost = extractedData.agreedCost || extractedData.estimatedCost || 0;
  
  if (components.length > 0 && totalCost > 0) {
    try {
      const recResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an expert vehicle damage assessor. For each damaged component, recommend whether to REPAIR or REPLACE based on damage severity and cost-effectiveness. Be realistic with costs and labor hours.`
          },
          {
            role: "user",
            content: `Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} ${extractedData.vehicleYear}
Accident type: ${extractedData.accidentType || 'unknown'}
Total agreed cost: $${totalCost}
Damage description: ${extractedData.damageDescription || extractedData.damageLocation || 'unknown'}

Damaged components: ${components.join(', ')}

For EACH component, provide repair vs replace recommendation. The sum of all component costs should approximately equal the total cost of $${totalCost}.`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "component_recommendations",
            strict: true,
            schema: {
              type: "object",
              properties: {
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      component: { type: "string", description: "Component name" },
                      action: { type: "string", description: "Either 'repair' or 'replace'" },
                      severity: { type: "string", description: "Either 'minor', 'moderate', or 'severe'" },
                      estimatedCost: { type: "number", description: "Estimated cost for this component" },
                      laborHours: { type: "number", description: "Estimated labor hours" },
                      reasoning: { type: "string", description: "Brief explanation for the recommendation" }
                    },
                    required: ["component", "action", "severity", "estimatedCost", "laborHours", "reasoning"],
                    additionalProperties: false
                  }
                }
              },
              required: ["recommendations"],
              additionalProperties: false
            }
          }
        }
      });
      
      const recData = JSON.parse(recResponse.choices[0].message.content as string);
      componentRecommendations = (recData.recommendations || []).map((r: any) => ({
        ...r,
        action: r.action === 'replace' ? 'replace' : 'repair',
        severity: ['minor', 'moderate', 'severe'].includes(r.severity) ? r.severity : 'moderate'
      }));
      
      console.log(`✅ Generated ${componentRecommendations.length} component recommendations`);
      for (const rec of componentRecommendations) {
        console.log(`   ${rec.component}: ${rec.action.toUpperCase()} ($${rec.estimatedCost}, ${rec.laborHours}h, ${rec.severity})`);
      }
    } catch (error: any) {
      console.warn(`⚠️ Component recommendations failed: ${error.message}`);
    }
  }

  // ============================================================
  // STEP 5: Physics Validation (Plugin → LLM → TypeScript)
  // ============================================================
  console.log('\n⚛️ Step 5: Running physics validation...');
  let physicsAnalysis: PhysicsAnalysis;
  
  const vehicleType = inferVehicleType(extractedData.vehicleModel || '');
  let estimatedSpeed = extractedData.estimatedSpeed || 0;
  if (!estimatedSpeed) {
    const speedByType: Record<string, number> = {
      parking_lot: 15, rear_end: 40, side_impact: 55, head_on: 70, highway: 100
    };
    estimatedSpeed = speedByType[extractedData.accidentType || ''] || 50;
  }
  
  const damageSeverity = totalCost > 8000 ? 'severe' : totalCost > 3000 ? 'moderate' : 'minor';
  const damageLocations = components.length > 0 ? components : [extractedData.damageLocation || 'unknown'];
  
  // Try ML plugin first (future trained models)
  const physicsPlugin = getPlugin('physics');
  if (physicsPlugin) {
    console.log(`🔌 Using ML plugin: ${physicsPlugin.id} v${physicsPlugin.version}`);
    try {
      const pluginResult = await physicsPlugin.predict({
        vehicle_type: vehicleType,
        accident_type: extractedData.accidentType || 'other',
        estimated_speed: estimatedSpeed,
        damage_severity: damageSeverity,
        damage_locations: damageLocations,
      });
      if (pluginResult) {
        physicsAnalysis = pluginResult as unknown as PhysicsAnalysis;
        console.log(`✅ ML plugin physics: Valid=${physicsAnalysis.is_valid}, Score=${physicsAnalysis.physicsScore}/100`);
      } else {
        throw new Error('Plugin returned null');
      }
    } catch (error: any) {
      console.warn(`⚠️ ML plugin failed: ${error.message}, falling back to LLM...`);
      physicsPlugin === null; // Clear so we fall through
    }
  }
  
  // If no plugin result, try LLM-first approach
  if (!physicsPlugin || !physicsAnalysis!) {
    try {
      const physicsResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a vehicle accident physics expert and forensic engineer. Analyze the collision scenario using physics principles:
- Kinetic energy: KE = 0.5 × mass × velocity²
- Impact force: F = mass × Δv / contact_time
- G-force: deceleration / 9.81
- Validate damage patterns against accident type
- Check if reported damage is physically consistent with the scenario
Be precise with calculations. Flag any physical impossibilities or inconsistencies.`
          },
          {
            role: "user",
            content: `Analyze this collision scenario:
Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} (${vehicleType}, ~${VEHICLE_MASSES[vehicleType] || 1500}kg)
Accident type: ${extractedData.accidentType || 'unknown'}
Estimated speed: ~${estimatedSpeed} km/h
Damage severity: ${damageSeverity}
Damage locations: ${damageLocations.join(', ')}
Damage description: ${extractedData.damageDescription || extractedData.accidentDescription || 'unknown'}
Total repair cost: $${totalCost}`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "physics_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                impactSpeed: { type: "number", description: "Impact speed in km/h" },
                impactForce: { type: "number", description: "Impact force in kN" },
                energyDissipated: { type: "number", description: "Energy dissipation percentage 0-100" },
                deceleration: { type: "number", description: "G-force experienced" },
                damageConsistency: { type: "string", description: "consistent, inconsistent, questionable, or impossible" },
                physicsScore: { type: "integer", description: "Physics plausibility score 0-100" },
                confidence: { type: "number", description: "Confidence in analysis 0-1" },
                is_valid: { type: "boolean", description: "Whether the scenario is physically plausible" },
                flags: { type: "array", items: { type: "string" }, description: "Any physics flags or warnings" },
                analysis_notes: { type: "string", description: "Detailed analysis explanation" }
              },
              required: ["impactSpeed", "impactForce", "energyDissipated", "deceleration", "damageConsistency", "physicsScore", "confidence", "is_valid", "flags", "analysis_notes"],
              additionalProperties: false
            }
          }
        }
      });
      
      const llmPhysics = JSON.parse(physicsResponse.choices[0].message.content as string);
      
      // Also run inline TypeScript validation for cross-reference
      const inlinePhysics = validatePhysicsInline(vehicleType, extractedData.accidentType || 'other', estimatedSpeed, damageSeverity, damageLocations);
      
      // Merge: use LLM's qualitative analysis with inline's precise calculations
      physicsAnalysis = {
        is_valid: llmPhysics.is_valid,
        confidence: llmPhysics.confidence,
        damageConsistency: llmPhysics.damageConsistency,
        flags: [...(llmPhysics.flags || []), ...inlinePhysics.flags.filter(f => !llmPhysics.flags?.some((lf: string) => lf.includes(f.substring(0, 20))))],
        physics_analysis: inlinePhysics.physics_analysis, // Use precise calculations
        recommendations: inlinePhysics.recommendations,
        impactSpeed: llmPhysics.impactSpeed || inlinePhysics.impactSpeed,
        impactForce: llmPhysics.impactForce || inlinePhysics.impactForce,
        energyDissipated: llmPhysics.energyDissipated || inlinePhysics.energyDissipated,
        deceleration: llmPhysics.deceleration || inlinePhysics.deceleration,
        physicsScore: llmPhysics.physicsScore,
      };
      
      console.log(`✅ Physics validation (LLM + TypeScript): Valid=${physicsAnalysis.is_valid}, Score=${physicsAnalysis.physicsScore}/100`);
      
    } catch (error: any) {
      console.warn(`⚠️ LLM physics failed: ${error.message}, using TypeScript fallback...`);
      
      // Pure TypeScript fallback (deterministic, always works)
      physicsAnalysis = validatePhysicsInline(vehicleType, extractedData.accidentType || 'other', estimatedSpeed, damageSeverity, damageLocations);
      console.log(`✅ Physics validation (TypeScript): Valid=${physicsAnalysis.is_valid}, Score=${physicsAnalysis.physicsScore}/100`);
    }
  }

  // ============================================================
  // STEP 6: Fraud Detection (Plugin → LLM → TypeScript)
  // ============================================================
  console.log('\n🔍 Step 6: Running fraud detection...');
  let fraudAnalysis: FraudAnalysis;
  
  const fraudPlugin = getPlugin('fraud');
  
  if (fraudPlugin) {
    console.log(`🔌 Using ML plugin: ${fraudPlugin.id} v${fraudPlugin.version}`);
    try {
      const pluginResult = await fraudPlugin.predict({
        claim_amount: totalCost,
        vehicle_age: new Date().getFullYear() - (extractedData.vehicleYear || 2020),
        previous_claims_count: 0,
        damage_severity_score: damageSeverity === 'severe' ? 0.9 : damageSeverity === 'moderate' ? 0.6 : 0.3,
        physics_validation_score: physicsAnalysis.confidence || 0.5,
        has_photos: damagePhotoUrls.length > 0,
        has_police_report: !!extractedData.policeReportReference,
        accident_type: extractedData.accidentType || 'other',
      });
      if (pluginResult) {
        fraudAnalysis = pluginResult as unknown as FraudAnalysis;
        console.log(`✅ ML plugin fraud: ${fraudAnalysis.risk_level} (${fraudAnalysis.risk_score}/100)`);
      } else {
        throw new Error('Plugin returned null');
      }
    } catch (error: any) {
      console.warn(`⚠️ ML plugin failed: ${error.message}, falling back to LLM...`);
    }
  }
  
  if (!fraudPlugin || !fraudAnalysis!) {
    // Run inline TypeScript fraud scoring first (deterministic baseline)
    const inlineFraud = detectFraudInline(
      totalCost,
      new Date().getFullYear() - (extractedData.vehicleYear || 2020),
      0,
      damageSeverity === 'severe' ? 0.9 : damageSeverity === 'moderate' ? 0.6 : 0.3,
      physicsAnalysis.confidence || 0.5,
      false,
      !!extractedData.policeReportReference,
      damagePhotoUrls.length > 0,
      totalCost > 10000,
      extractedData.accidentType || 'other',
    );
    
    try {
      // LLM fraud analysis for richer context
      const fraudResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an insurance fraud detection expert with deep knowledge of common fraud patterns in African insurance markets. Analyze the claim for fraud indicators. Be fair and objective — most claims are legitimate. Consider:
- Damage consistency with reported accident
- Cost reasonableness for the vehicle and damage
- Documentation completeness
- Physics validation results
- Common fraud patterns (staged accidents, inflated costs, phantom damage)`
          },
          {
            role: "user",
            content: `Analyze fraud risk for this claim:
Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} ${extractedData.vehicleYear}
Claim amount: $${totalCost}
Accident type: ${extractedData.accidentType || 'unknown'}
Physics validation: ${physicsAnalysis.is_valid ? 'PASSED' : 'FAILED'} (score: ${physicsAnalysis.physicsScore}/100, ${physicsAnalysis.damageConsistency})
Physics flags: ${physicsAnalysis.flags.length > 0 ? physicsAnalysis.flags.join('; ') : 'None'}
Photos available: ${damagePhotoUrls.length > 0 ? 'Yes' : 'No'}
Police report: ${extractedData.policeReportReference ? 'Yes' : 'No'}
Damage description: ${extractedData.damageDescription || 'unknown'}
Inline risk score: ${Math.round(inlineFraud.fraudProbability * 100)}/100 (${inlineFraud.riskLevel})`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "fraud_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                fraud_probability: { type: "number", description: "0-1 probability" },
                risk_level: { type: "string", description: "low, medium, high, or critical" },
                risk_score: { type: "integer", description: "0-100" },
                indicators: {
                  type: "object",
                  properties: {
                    claimHistory: { type: "integer", description: "1-5 risk level" },
                    damageConsistency: { type: "integer", description: "1-5 risk level" },
                    documentAuthenticity: { type: "integer", description: "1-5 risk level" },
                    behavioralPatterns: { type: "integer", description: "1-5 risk level" },
                    ownershipVerification: { type: "integer", description: "1-5 risk level" },
                    geographicRisk: { type: "integer", description: "1-5 risk level" }
                  },
                  required: ["claimHistory", "damageConsistency", "documentAuthenticity", "behavioralPatterns", "ownershipVerification", "geographicRisk"],
                  additionalProperties: false
                },
                top_risk_factors: { type: "array", items: { type: "string" } },
                analysis_notes: { type: "string" }
              },
              required: ["fraud_probability", "risk_level", "risk_score", "indicators", "top_risk_factors", "analysis_notes"],
              additionalProperties: false
            }
          }
        }
      });
      
      const llmFraud = JSON.parse(fraudResponse.choices[0].message.content as string);
      
      // Cross-reference physics results
      const physicsFlagsCount = physicsAnalysis.flags?.length || 0;
      const physicsContributes = physicsFlagsCount > 0 || !physicsAnalysis.is_valid;
      
      // Blend LLM analysis with inline scoring
      let adjustedFraudProb = (llmFraud.fraud_probability + inlineFraud.fraudProbability) / 2;
      if (physicsContributes) {
        adjustedFraudProb = Math.min(1.0, adjustedFraudProb + (physicsFlagsCount * 0.1));
      }
      
      const riskScore = Math.round(adjustedFraudProb * 100);
      const riskLevel = riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : riskScore < 80 ? 'high' : 'critical';
      
      const topRiskFactors = [...(llmFraud.top_risk_factors || [])];
      if (physicsContributes) {
        for (const flag of physicsAnalysis.flags) {
          topRiskFactors.push(`Physics: ${flag}`);
        }
      }
      
      fraudAnalysis = {
        fraud_probability: adjustedFraudProb,
        risk_level: riskLevel,
        risk_score: riskScore,
        confidence: 0.8,
        top_risk_factors: topRiskFactors,
        recommendations: inlineFraud.recommendations,
        indicators: llmFraud.indicators,
        physics_cross_reference: {
          physics_flags_count: physicsFlagsCount,
          physics_score: physicsAnalysis.physicsScore,
          physics_contributes_to_fraud: physicsContributes,
          physics_notes: physicsContributes 
            ? `Physics validation raised ${physicsFlagsCount} flag(s). Damage consistency: ${physicsAnalysis.damageConsistency}. This increased the fraud risk score.`
            : `Physics validation passed with no flags. Damage is ${physicsAnalysis.damageConsistency} with the reported accident.`
        },
        analysis_notes: llmFraud.analysis_notes || `Fraud probability: ${(adjustedFraudProb * 100).toFixed(1)}%. ${physicsContributes ? 'Physics inconsistencies detected.' : 'Physics validation supports the claim.'}`
      };
      
      console.log(`✅ Fraud detection (LLM + TypeScript): ${fraudAnalysis.risk_level} (${fraudAnalysis.risk_score}/100)`);
      
    } catch (error: any) {
      console.warn(`⚠️ LLM fraud failed: ${error.message}, using TypeScript fallback...`);
      
      // Pure TypeScript fallback
      const physicsFlagsCount = physicsAnalysis.flags?.length || 0;
      const physicsContributes = physicsFlagsCount > 0 || !physicsAnalysis.is_valid;
      
      let adjustedProb = inlineFraud.fraudProbability;
      if (physicsContributes) {
        adjustedProb = Math.min(1.0, adjustedProb + (physicsFlagsCount * 0.1));
      }
      
      const riskScore = Math.round(adjustedProb * 100);
      const riskLevel = riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : riskScore < 80 ? 'high' : 'critical';
      
      fraudAnalysis = {
        fraud_probability: adjustedProb,
        risk_level: riskLevel,
        risk_score: riskScore,
        confidence: 0.7,
        top_risk_factors: inlineFraud.topRiskFactors,
        recommendations: inlineFraud.recommendations,
        indicators: {
          claimHistory: 2,
          damageConsistency: physicsAnalysis.is_valid ? 2 : 4,
          documentAuthenticity: damagePhotoUrls.length > 0 ? 2 : 4,
          behavioralPatterns: 2,
          ownershipVerification: extractedData.claimantName ? 2 : 4,
          geographicRisk: 2,
        },
        physics_cross_reference: {
          physics_flags_count: physicsFlagsCount,
          physics_score: physicsAnalysis.physicsScore,
          physics_contributes_to_fraud: physicsContributes,
          physics_notes: physicsContributes 
            ? `Physics validation raised ${physicsFlagsCount} flag(s). Damage consistency: ${physicsAnalysis.damageConsistency}.`
            : `Physics validation passed. Damage is ${physicsAnalysis.damageConsistency}.`
        },
        analysis_notes: `TypeScript fallback analysis. Fraud probability: ${(adjustedProb * 100).toFixed(1)}%.`
      };
      
      console.log(`✅ Fraud detection (TypeScript): ${fraudAnalysis.risk_level} (${fraudAnalysis.risk_score}/100)`);
    }
  }

  // ============================================================
  // STEP 7: Build multi-quote comparison
  // ============================================================
  console.log('\n💰 Step 7: Building quote comparison...');
  
  const quotes: QuoteFigure[] = [];
  const originalQuote = extractedData.originalQuote || 0;
  const agreedCost = extractedData.agreedCost || 0;
  const aiEstimate = componentRecommendations.reduce((sum, r) => sum + r.estimatedCost, 0);
  const mktValue = extractedData.marketValue || 0;
  
  if (originalQuote > 0) {
    quotes.push({
      label: 'Original Repairer Quote',
      amount: originalQuote,
      source: extractedData.repairerName || 'Repairer',
      type: 'original',
      description: `Initial repair estimate from ${extractedData.repairerName || 'the repairer'}`
    });
  }
  
  if (agreedCost > 0) {
    quotes.push({
      label: 'Agreed Cost (Negotiated)',
      amount: agreedCost,
      source: extractedData.assessorName || 'Assessor',
      type: 'agreed',
      description: `Cost agreed after assessment by ${extractedData.assessorName || 'the assessor'}`
    });
  }
  
  if (aiEstimate > 0) {
    quotes.push({
      label: 'AI Component Estimate',
      amount: aiEstimate,
      source: 'KINGA AutoVerify',
      type: 'ai',
      description: 'Sum of individual component repair/replace estimates by AI'
    });
  }
  
  if (mktValue > 0) {
    quotes.push({
      label: 'Vehicle Market Value',
      amount: mktValue,
      source: 'Market Reference',
      type: 'reference',
      description: 'Current market value of the vehicle for reference'
    });
  }
  
  console.log(`📊 Quotes: ${quotes.length} figures compiled`);
  for (const q of quotes) {
    console.log(`   ${q.label}: $${q.amount.toLocaleString()} (${q.type})`);
  }

  // Clean up temp file
  try { unlinkSync(tempPdfPath); } catch (e) { /* ignore */ }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ ASSESSMENT PROCESSING COMPLETE`);
  console.log(`🏗️ Architecture: LLM-First + TypeScript Fallback`);
  console.log(`📊 Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} ${extractedData.vehicleYear}`);
  console.log(`📊 Photos: ${damagePhotoUrls.length} damage identified via LLM vision`);
  console.log(`📊 Components: ${componentRecommendations.length} recommendations`);
  console.log(`📊 Quotes: ${quotes.length} figures`);
  console.log(`📊 Physics: ${physicsAnalysis.damageConsistency} (score ${physicsAnalysis.physicsScore}/100)`);
  console.log(`📊 Fraud: ${fraudAnalysis.risk_level} (score ${fraudAnalysis.risk_score}/100)`);
  console.log(`📊 Completeness: ${completeness}%`);
  console.log(`🔌 ML Plugins: ${modelPlugins.size} registered (${Array.from(modelPlugins.keys()).join(', ') || 'none'})`);
  console.log(`${'='.repeat(60)}\n`);
  
  return {
    pdfUrl,
    vehicleMake: extractedData.vehicleMake || '',
    vehicleModel: extractedData.vehicleModel || '',
    vehicleYear: extractedData.vehicleYear || 0,
    vehicleRegistration: extractedData.vehicleRegistration || '',
    vehicleMass: extractedData.vehicleMass || undefined,
    claimantName: extractedData.claimantName || undefined,
    accidentDate: extractedData.accidentDate || undefined,
    accidentLocation: extractedData.accidentLocation || undefined,
    accidentDescription: extractedData.accidentDescription || undefined,
    policeReportReference: extractedData.policeReportReference || undefined,
    damageDescription: extractedData.damageDescription || undefined,
    damageLocation: extractedData.damageLocation || undefined,
    estimatedCost: agreedCost || extractedData.estimatedCost || 0,
    originalQuote: originalQuote || undefined,
    agreedCost: agreedCost || undefined,
    marketValue: mktValue || undefined,
    savings: extractedData.savings || (originalQuote && agreedCost ? originalQuote - agreedCost : undefined),
    excessAmount: extractedData.excessAmount || undefined,
    betterment: extractedData.betterment || undefined,
    assessorName: extractedData.assessorName || undefined,
    repairerName: extractedData.repairerName || undefined,
    itemizedCosts: extractedData.itemizedCosts || [],
    costBreakdown: extractedData.costBreakdown,
    componentRecommendations,
    quotes,
    damagePhotos: damagePhotoUrls,
    allPhotos,
    accidentType: extractedData.accidentType || undefined,
    damagedComponents: extractedData.damagedComponents || [],
    physicsAnalysis,
    fraudAnalysis,
    missingData,
    dataQuality,
    dataCompleteness: completeness
  };
}
