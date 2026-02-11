/**
 * Enhanced Assessment Processing with AI + Python Analysis
 * 
 * Pipeline:
 * 1. Upload PDF to S3
 * 2. Extract & classify images from PDF (Python PyMuPDF)
 * 3. Extract text from PDF (Node.js pdf-parse, Python OCR fallback)
 * 4. Extract structured data with LLM (including all cost figures & quotes)
 * 5. Generate component repair/replace recommendations (LLM)
 * 6. Run physics validation (Python physics_validator.py with numpy/scipy)
 * 7. Run fraud detection (Python fraud_ml_model.py) - cross-references physics results
 * 8. Return comprehensive assessment result with multi-quote comparison
 */

import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import { storagePut } from './storage';
import { invokeLLM } from './_core/llm';

// Use absolute path for Python scripts (ESM compatible)
const __filename_esm = fileURLToPath(import.meta.url);
const __dirname_esm = dirname(__filename_esm);
const PROJECT_ROOT = resolve(__dirname_esm, '..');
const PYTHON_DIR = join(PROJECT_ROOT, 'python');

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

/**
 * Clean "null" strings from LLM output
 */
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
  console.log(`${'='.repeat(60)}`);

  // Upload PDF to S3
  const { url: pdfUrl } = await storagePut(
    `external-assessments/${nanoid()}-${fileName}`,
    fileBuffer,
    "application/pdf"
  );
  console.log(`✅ PDF uploaded to S3: ${pdfUrl}`);

  // Save PDF temporarily for processing
  const tempPdfPath = join('/tmp', `assessment-${nanoid()}.pdf`);
  writeFileSync(tempPdfPath, fileBuffer);

  // ============================================================
  // STEP 1: Extract & classify images from PDF
  // ============================================================
  console.log('\n🖼️ Step 1: Extracting and classifying images from PDF...');
  let damagePhotoUrls: string[] = [];
  let allPhotos: PhotoWithClassification[] = [];
  
  try {
    const imgOutputPath = join('/tmp', `kinga-images-${nanoid()}.json`);
    const imgResult = await runPythonScript(
      join(PYTHON_DIR, 'extract_images.py'), 
      [tempPdfPath, imgOutputPath],
      120000
    );
    
    console.log(`📸 Image extraction: ${imgResult.total_images} total (${imgResult.damage_photos} damage, ${imgResult.document_images} document)`);
    
    if (imgResult.success && imgResult.total_images > 0) {
      const imgFileData = readFileSync(imgOutputPath, 'utf-8');
      const imgData = JSON.parse(imgFileData);
      
      for (const img of imgData.images) {
        if (img.full_data) {
          try {
            const imgBuffer = Buffer.from(img.full_data, 'base64');
            const ext = img.format || 'jpeg';
            const { url: imgUrl } = await storagePut(
              `damage-photos/${nanoid()}.${ext}`,
              imgBuffer,
              `image/${ext}`
            );
            
            const classification = img.classification || 'damage_photo';
            allPhotos.push({ url: imgUrl, classification, page: img.page });
            
            if (classification === 'damage_photo') {
              damagePhotoUrls.push(imgUrl);
            }
          } catch (e: any) {
            console.warn(`⚠️ Failed to upload image: ${e.message}`);
          }
        }
      }
      console.log(`✅ Uploaded ${damagePhotoUrls.length} damage photos, ${allPhotos.length - damagePhotoUrls.length} document images`);
      
      try { unlinkSync(imgOutputPath); } catch (e) {}
    }
  } catch (error: any) {
    console.warn(`⚠️ Image extraction failed: ${error.message}`);
  }

  // ============================================================
  // STEP 2: Extract text from PDF
  // ============================================================
  console.log('\n📝 Step 2: Extracting text from PDF...');
  let extractedText = '';
  
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
    const textResult = await parser.getText();
    extractedText = textResult.text || '';
    await parser.destroy();
    console.log(`✅ Node.js text extraction: ${extractedText.length} chars`);
  } catch (error: any) {
    console.error(`❌ Node.js text extraction failed: ${error.message}`);
  }
  
  if (extractedText.length < 100) {
    console.log('🔄 Trying Python OCR fallback...');
    try {
      const ocrResult = await runPythonScript(
        join(PYTHON_DIR, 'extract_pdf_text_ocr.py'), 
        [tempPdfPath], 
        180000
      );
      extractedText = ocrResult.text || '';
      console.log(`✅ Python OCR: ${extractedText.length} chars`);
    } catch (error: any) {
      console.error(`❌ Python OCR also failed: ${error.message}`);
    }
  }

  // ============================================================
  // STEP 3: Extract structured data with LLM (all cost figures)
  // ============================================================
  console.log('\n🤖 Step 3: Extracting structured data with LLM...');
  
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
        content: `Extract ALL information from this vehicle damage assessment report.

CRITICAL: Extract every cost figure mentioned. Look for original quotes, agreed costs, market values, savings, excess amounts, betterment, assessor names, repairer names.

=== DOCUMENT TEXT ===
${extractedText}
=== END DOCUMENT ===`
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
    hasPhotos: damagePhotoUrls.length > 0
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
  // STEP 5: Physics Validation (Python physics_validator.py)
  // ============================================================
  console.log('\n⚛️ Step 5: Running physics validation (Python)...');
  let physicsAnalysis: PhysicsAnalysis;
  
  const modelLower = (extractedData.vehicleModel || '').toLowerCase();
  const vehicleType = modelLower.includes('ranger') || modelLower.includes('hilux') || modelLower.includes('truck') || modelLower.includes('pickup') ? 'truck' :
    modelLower.includes('suv') || modelLower.includes('fortuner') || modelLower.includes('pajero') ? 'suv' : 'sedan';
  
  let estimatedSpeed = extractedData.estimatedSpeed || 0;
  if (!estimatedSpeed) {
    const speedByType: Record<string, number> = {
      'parking_lot': 15, 'rear_end': 40, 'side_impact': 55, 'head_on': 70, 'highway': 100
    };
    estimatedSpeed = speedByType[extractedData.accidentType || ''] || 50;
  }
  
  const damageSeverity = totalCost > 8000 ? 'severe' : totalCost > 3000 ? 'moderate' : 'minor';
  
  const damageLocations = components.length > 0 ? components : [extractedData.damageLocation || 'unknown'];
  
  try {
    const physicsInput = JSON.stringify({
      vehicle_type: vehicleType,
      accident_type: extractedData.accidentType || 'other',
      estimated_speed: estimatedSpeed,
      damage_severity: damageSeverity,
      damage_locations: damageLocations,
      reported_description: extractedData.accidentDescription || extractedData.damageDescription || ''
    });
    
    const physicsResult = await runPythonScript(
      join(PYTHON_DIR, 'physics_validator.py'),
      [physicsInput],
      30000
    );
    
    const pa = physicsResult.physics_analysis || {};
    const impactSpeedKmh = (pa.impact_speed_ms || 0) * 3.6;
    const impactForceKN = pa.vehicle_mass_kg && pa.impact_speed_ms 
      ? (pa.vehicle_mass_kg * pa.impact_speed_ms / 0.1) / 1000
      : 0;
    
    physicsAnalysis = {
      ...physicsResult,
      impactSpeed: Math.round(impactSpeedKmh) || estimatedSpeed,
      impactForce: Math.round(impactForceKN),
      energyDissipated: Math.round((pa.kinetic_energy_joules || 0) * 0.6 / (pa.kinetic_energy_joules || 1) * 100),
      deceleration: Math.round((pa.g_force || 0) * 10) / 10,
      physicsScore: Math.round((physicsResult.confidence || 0.5) * 100)
    };
    
    console.log(`✅ Physics validation complete: Valid=${physicsAnalysis.is_valid}, Score=${physicsAnalysis.physicsScore}/100`);
    
  } catch (error: any) {
    console.warn(`⚠️ Python physics failed: ${error.message}, falling back to LLM...`);
    
    try {
      const physicsResponse = await invokeLLM({
        messages: [
          { role: "system", content: "You are a vehicle accident physics expert. Provide realistic physics analysis." },
          { role: "user", content: `Analyze: ${extractedData.vehicleMake} ${extractedData.vehicleModel} (${vehicleType}), ${extractedData.accidentType} at ~${estimatedSpeed} km/h, ${damageSeverity} damage. Damage: ${extractedData.damageDescription || 'unknown'}` }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "physics_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                impactSpeed: { type: "number" },
                impactForce: { type: "number" },
                energyDissipated: { type: "number", description: "Percentage 0-100" },
                deceleration: { type: "number" },
                damageConsistency: { type: "string", description: "consistent, inconsistent, or impossible" },
                physicsScore: { type: "integer", description: "0-100" },
                confidence: { type: "number" },
                is_valid: { type: "boolean" },
                analysis_notes: { type: "string" }
              },
              required: ["impactSpeed", "impactForce", "energyDissipated", "deceleration", "damageConsistency", "physicsScore", "confidence", "is_valid", "analysis_notes"],
              additionalProperties: false
            }
          }
        }
      });
      const pc = JSON.parse(physicsResponse.choices[0].message.content as string);
      physicsAnalysis = { ...pc, flags: [], recommendations: [], physics_analysis: {} } as PhysicsAnalysis;
    } catch {
      physicsAnalysis = {
        is_valid: true, confidence: 0.5, damageConsistency: 'unknown',
        flags: [], physics_analysis: { kinetic_energy_joules: 0, vehicle_mass_kg: 0, impact_speed_ms: 0, deceleration_ms2: 0, g_force: 0 },
        recommendations: ['Physics analysis unavailable'], impactSpeed: estimatedSpeed,
        impactForce: 0, energyDissipated: 0, deceleration: 0, physicsScore: 50
      };
    }
  }

  // ============================================================
  // STEP 6: Fraud Detection (Python fraud_ml_model.py) 
  //         Cross-references physics results
  // ============================================================
  console.log('\n🔍 Step 6: Running fraud detection (Python)...');
  let fraudAnalysis: FraudAnalysis;
  
  try {
    const fraudInput = JSON.stringify({
      claim_amount: totalCost,
      vehicle_age: new Date().getFullYear() - (extractedData.vehicleYear || 2020),
      previous_claims_count: 0,
      damage_severity_score: damageSeverity === 'severe' ? 0.9 : damageSeverity === 'moderate' ? 0.6 : 0.3,
      physics_validation_score: physicsAnalysis.confidence || 0.5,
      has_witnesses: false,
      has_police_report: !!extractedData.policeReportReference,
      has_photos: damagePhotoUrls.length > 0,
      is_high_value: totalCost > 10000,
      accident_type: extractedData.accidentType || 'other'
    });
    
    const fraudResult = await runPythonScript(
      join(PYTHON_DIR, 'fraud_ml_model.py'),
      ['predict', fraudInput],
      30000
    );
    
    const physicsFlagsCount = physicsAnalysis.flags?.length || 0;
    const physicsContributes = physicsFlagsCount > 0 || !physicsAnalysis.is_valid;
    
    let adjustedFraudProb = fraudResult.fraud_probability || 0;
    if (physicsContributes) {
      adjustedFraudProb = Math.min(1.0, adjustedFraudProb + (physicsFlagsCount * 0.1));
    }
    
    const indicators = {
      claimHistory: 2,
      damageConsistency: physicsAnalysis.is_valid ? 2 : physicsAnalysis.damageConsistency === 'inconsistent' ? 4 : 3,
      documentAuthenticity: damagePhotoUrls.length > 3 ? 1 : damagePhotoUrls.length > 0 ? 2 : 4,
      behavioralPatterns: 2,
      ownershipVerification: extractedData.claimantName ? 2 : 4,
      geographicRisk: 2
    };
    
    const riskScore = Math.round(adjustedFraudProb * 100);
    const riskLevel = riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : 'high';
    
    const topRiskFactors = [...(fraudResult.top_risk_factors || [])];
    if (physicsContributes) {
      for (const flag of (physicsAnalysis.flags || [])) {
        topRiskFactors.push(`Physics: ${flag}`);
      }
    }
    
    fraudAnalysis = {
      fraud_probability: adjustedFraudProb,
      risk_level: riskLevel,
      risk_score: riskScore,
      confidence: fraudResult.confidence || 0.7,
      top_risk_factors: topRiskFactors,
      recommendations: fraudResult.recommendations || [],
      indicators,
      physics_cross_reference: {
        physics_flags_count: physicsFlagsCount,
        physics_score: physicsAnalysis.physicsScore,
        physics_contributes_to_fraud: physicsContributes,
        physics_notes: physicsContributes 
          ? `Physics validation raised ${physicsFlagsCount} flag(s). Damage consistency: ${physicsAnalysis.damageConsistency}. This increased the fraud risk score.`
          : `Physics validation passed with no flags. Damage is ${physicsAnalysis.damageConsistency} with the reported accident.`
      },
      analysis_notes: `Fraud probability: ${(adjustedFraudProb * 100).toFixed(1)}%. ${physicsContributes ? 'Physics inconsistencies detected.' : 'Physics validation supports the claim.'} ${topRiskFactors.length > 0 ? 'Risk factors: ' + topRiskFactors.join('; ') : 'No significant risk factors identified.'}`
    };
    
    console.log(`✅ Fraud detection: ${fraudAnalysis.risk_level} (${fraudAnalysis.risk_score}/100)`);
    
  } catch (error: any) {
    console.warn(`⚠️ Python fraud failed: ${error.message}, falling back to LLM...`);
    
    try {
      const fraudResponse = await invokeLLM({
        messages: [
          { role: "system", content: "You are an insurance fraud detection expert. Be fair and objective." },
          { role: "user", content: `Analyze fraud risk: ${extractedData.vehicleMake} ${extractedData.vehicleModel}, $${totalCost}, ${extractedData.accidentType}, physics score: ${physicsAnalysis.physicsScore}/100, ${damagePhotoUrls.length} photos` }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "fraud_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                fraud_probability: { type: "number" },
                risk_level: { type: "string" },
                risk_score: { type: "integer" },
                indicators: {
                  type: "object",
                  properties: {
                    claimHistory: { type: "integer" }, damageConsistency: { type: "integer" },
                    documentAuthenticity: { type: "integer" }, behavioralPatterns: { type: "integer" },
                    ownershipVerification: { type: "integer" }, geographicRisk: { type: "integer" }
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
      const fc = JSON.parse(fraudResponse.choices[0].message.content as string);
      fraudAnalysis = {
        ...fc, confidence: 0.7, recommendations: [],
        physics_cross_reference: {
          physics_flags_count: physicsAnalysis.flags?.length || 0,
          physics_score: physicsAnalysis.physicsScore,
          physics_contributes_to_fraud: !physicsAnalysis.is_valid,
          physics_notes: 'LLM fallback analysis'
        }
      } as FraudAnalysis;
    } catch {
      fraudAnalysis = {
        fraud_probability: 0.15, risk_level: 'low', risk_score: 15, confidence: 0.5,
        top_risk_factors: [], recommendations: [],
        indicators: { claimHistory: 2, damageConsistency: 2, documentAuthenticity: 2, behavioralPatterns: 2, ownershipVerification: 2, geographicRisk: 2 },
        physics_cross_reference: { physics_flags_count: 0, physics_score: 50, physics_contributes_to_fraud: false, physics_notes: 'Analysis unavailable' },
        analysis_notes: 'Fraud analysis could not be completed'
      };
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
  console.log(`📊 Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} ${extractedData.vehicleYear}`);
  console.log(`📊 Photos: ${damagePhotoUrls.length} damage + ${allPhotos.length - damagePhotoUrls.length} document`);
  console.log(`📊 Components: ${componentRecommendations.length} recommendations`);
  console.log(`📊 Quotes: ${quotes.length} figures`);
  console.log(`📊 Physics: ${physicsAnalysis.damageConsistency} (score ${physicsAnalysis.physicsScore}/100)`);
  console.log(`📊 Fraud: ${fraudAnalysis.risk_level} (score ${fraudAnalysis.risk_score}/100)`);
  console.log(`📊 Completeness: ${completeness}%`);
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

/**
 * Run a Python script with CLI arguments and return parsed JSON output
 */
function runPythonScript(scriptPath: string, args: string[] = [], timeoutMs: number = 120000): Promise<any> {
  return new Promise((resolve, reject) => {
    console.log(`🐍 Running: python3 ${scriptPath} ${args.map(a => a.substring(0, 80)).join(' ')}`);
    
    // CRITICAL: Clear PYTHONPATH and PYTHONHOME to prevent Python 3.13 libs from being loaded by Python 3.11
    const cleanEnv = { ...process.env };
    delete cleanEnv.PYTHONPATH;
    delete cleanEnv.PYTHONHOME;
    
    const pythonProcess = spawn('python3', [scriptPath, ...args], {
      cwd: PYTHON_DIR,
      env: cleanEnv
    });
    
    const timeout = setTimeout(() => {
      pythonProcess.kill();
      reject(new Error(`Python script timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    let output = '';
    let error = '';

    pythonProcess.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data: Buffer) => {
      error += data.toString();
    });

    pythonProcess.on('close', (code) => {
      clearTimeout(timeout);
      
      if (code !== 0) {
        console.error(`❌ Python script failed (code ${code}): ${error.substring(0, 300)}`);
        reject(new Error(`Python script failed with code ${code}: ${error.substring(0, 300)}`));
        return;
      }

      if (error) {
        console.warn(`⚠️ Python stderr (non-fatal): ${error.substring(0, 200)}`);
      }

      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        console.error(`❌ Failed to parse Python output (${output.length} chars): ${output.substring(0, 200)}`);
        reject(new Error(`Failed to parse Python output: ${e}`));
      }
    });
  });
}
