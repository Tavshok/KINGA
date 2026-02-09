/**
 * Enhanced Assessment Processing with AI + Python Analysis
 * 
 * Pipeline:
 * 1. Upload PDF to S3
 * 2. Extract images from PDF (Python PyMuPDF)
 * 3. Extract text from PDF (Node.js pdf-parse, Python OCR fallback)
 * 4. Extract structured data with LLM (including itemized costs)
 * 5. Run physics validation (Python physics_validator.py with numpy/scipy)
 * 6. Run fraud detection (Python fraud_ml_model.py) - cross-references physics results
 * 7. Return comprehensive assessment result
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
  itemizedCosts?: ItemizedCost[];
  costBreakdown?: CostBreakdown;
  damagePhotos: string[];
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
  // STEP 1: Extract images from PDF using Python PyMuPDF
  // ============================================================
  console.log('\n🖼️ Step 1: Extracting images from PDF (Python PyMuPDF)...');
  let extractedImages: string[] = [];
  
  try {
    // Use dedicated extract_images.py that writes to a temp file (avoids stdout buffer issues)
    const imgOutputPath = join('/tmp', `kinga-images-${nanoid()}.json`);
    const imgResult = await runPythonScript(
      join(PYTHON_DIR, 'extract_images.py'), 
      [tempPdfPath, imgOutputPath],
      120000 // 2 minutes for large PDFs
    );
    
    console.log(`📸 Image extraction result: ${JSON.stringify(imgResult)}`);
    
    if (imgResult.success && imgResult.total_images > 0) {
      // Read the full image data from the temp file
      const imgFileData = readFileSync(imgOutputPath, 'utf-8');
      const imgData = JSON.parse(imgFileData);
      
      console.log(`📸 Found ${imgData.total_images} images in temp file, uploading to S3...`);
      
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
            extractedImages.push(imgUrl);
          } catch (e: any) {
            console.warn(`⚠️ Failed to upload image: ${e.message}`);
          }
        }
      }
      console.log(`✅ Uploaded ${extractedImages.length} damage photos`);
      
      // Clean up temp file
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
  
  // Primary: Node.js pdf-parse
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
  
  // Fallback: Python OCR
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
  // STEP 3: Extract structured data with LLM
  // ============================================================
  console.log('\n🤖 Step 3: Extracting structured data with LLM...');
  
  const extractionResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert at extracting structured data from vehicle damage assessment reports. 
Extract ALL available information with precision. For missing fields, return empty string "" (not "null").
For itemized costs, extract EVERY line item you can find - labor items, parts, materials, paint, sublet work.
If no individual line items exist but a total cost is given, estimate a reasonable breakdown:
- For side impacts: ~40% parts, ~35% labor, ~15% paint, ~10% materials
- For rear-end: ~50% parts, ~30% labor, ~10% paint, ~10% materials  
- For head-on: ~45% parts, ~35% labor, ~10% paint, ~10% materials
Always populate costBreakdown with estimated category totals that sum to the total cost.
For damagedComponents, infer from damage description (e.g., 'left handside' = left fender, left door, left mirror, left quarter panel).
Be thorough: extract exact dollar amounts, component names, and descriptions as they appear.`
      },
      {
        role: "user",
        content: `Extract ALL information from this vehicle damage assessment report.

CRITICAL RULES:
1. Return actual values found. For missing fields, use empty string "".
2. For estimatedCost, use the AGREED cost (after negotiation) if available, otherwise the original quote.
3. For costBreakdown, ALWAYS provide estimated category totals that sum to the total cost.
4. For damagedComponents, INFER from damage location if not explicitly listed.
5. For itemizedCosts, if no line items exist, create estimated items based on damage type and total cost.

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
            estimatedCost: { type: "number" },
            marketValue: { type: "number", description: "Vehicle market value if mentioned" },
            estimatedSpeed: { type: "number", description: "Estimated impact speed km/h, infer from accident type if not stated" },
            accidentType: { type: "string", description: "rear_end, side_impact, head_on, parking_lot, highway, rollover, or other" },
            damagedComponents: { 
              type: "array",
              items: { type: "string" },
              description: "List of ALL damaged parts/components mentioned"
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
              description: "Summary totals by category"
            },
            repairCostAgreed: { type: "number", description: "Final agreed repair cost (after negotiation)" },
            savings: { type: "number", description: "Savings amount if mentioned" },
            assessorName: { type: "string", description: "Name of the assessor" },
            repairerName: { type: "string", description: "Name of the repair shop" },
            excessAmount: { type: "number", description: "Insurance excess amount if mentioned" }
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
  console.log(`  Total Cost: $${extractedData.estimatedCost || 'NOT FOUND'}`);
  console.log(`  Agreed Cost: $${extractedData.repairCostAgreed || 'NOT FOUND'}`);
  console.log(`  Market Value: $${extractedData.marketValue || 'NOT FOUND'}`);
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
    hasPhotos: extractedImages.length > 0
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
  // STEP 4: Physics Validation (Python physics_validator.py)
  // ============================================================
  console.log('\n⚛️ Step 4: Running physics validation (Python)...');
  let physicsAnalysis: PhysicsAnalysis;
  
  // Determine vehicle type and parameters for physics
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
  
  const damageSeverity = (extractedData.estimatedCost || 0) > 8000 ? 'severe' : 
    (extractedData.estimatedCost || 0) > 3000 ? 'moderate' : 'minor';
  
  // Map damaged components to damage locations
  const damageLocations = (extractedData.damagedComponents || []).length > 0 
    ? extractedData.damagedComponents 
    : [extractedData.damageLocation || 'unknown'];
  
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
    
    // Enrich with derived values for the frontend
    const pa = physicsResult.physics_analysis || {};
    const impactSpeedKmh = (pa.impact_speed_ms || 0) * 3.6;
    const impactForceKN = pa.vehicle_mass_kg && pa.impact_speed_ms 
      ? (pa.vehicle_mass_kg * pa.impact_speed_ms / 0.1) / 1000 // F = mv/t in kN
      : 0;
    
    physicsAnalysis = {
      ...physicsResult,
      impactSpeed: Math.round(impactSpeedKmh) || estimatedSpeed,
      impactForce: Math.round(impactForceKN),
      energyDissipated: Math.round((pa.kinetic_energy_joules || 0) * 0.6 / (pa.kinetic_energy_joules || 1) * 100), // ~60% absorbed
      deceleration: Math.round((pa.g_force || 0) * 10) / 10,
      physicsScore: Math.round((physicsResult.confidence || 0.5) * 100)
    };
    
    console.log(`✅ Physics validation complete:`);
    console.log(`   Valid: ${physicsAnalysis.is_valid}`);
    console.log(`   Consistency: ${physicsAnalysis.damageConsistency}`);
    console.log(`   Confidence: ${physicsAnalysis.confidence}`);
    console.log(`   Flags: ${physicsAnalysis.flags?.length || 0}`);
    console.log(`   Impact: ${physicsAnalysis.impactSpeed} km/h, ${physicsAnalysis.impactForce} kN, ${physicsAnalysis.deceleration}g`);
    
  } catch (error: any) {
    console.warn(`⚠️ Python physics validation failed: ${error.message}`);
    console.warn('⚠️ Falling back to LLM physics analysis...');
    
    // Fallback to LLM-based physics
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
                impactSpeed: { type: "number", description: "Impact speed in km/h" },
                impactForce: { type: "number", description: "Impact force in kN" },
                energyDissipated: { type: "number", description: "Percentage of energy absorbed by crumple zones, 0-100" },
                deceleration: { type: "number", description: "G-forces experienced during impact" },
                damageConsistency: { type: "string", description: "One of: consistent, inconsistent, impossible" },
                physicsScore: { type: "integer", description: "Physics validation score from 0-100 where 100 is fully consistent" },
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
  // STEP 5: Fraud Detection (Python fraud_ml_model.py) 
  //         Cross-references physics results
  // ============================================================
  console.log('\n🔍 Step 5: Running fraud detection (Python)...');
  let fraudAnalysis: FraudAnalysis;
  
  try {
    const fraudInput = JSON.stringify({
      claim_amount: extractedData.estimatedCost || 0,
      vehicle_age: new Date().getFullYear() - (extractedData.vehicleYear || 2020),
      previous_claims_count: 0, // Unknown for external assessments
      damage_severity_score: damageSeverity === 'severe' ? 0.9 : damageSeverity === 'moderate' ? 0.6 : 0.3,
      physics_validation_score: physicsAnalysis.confidence || 0.5,
      has_witnesses: false,
      has_police_report: !!extractedData.policeReportReference,
      has_photos: extractedImages.length > 0,
      is_high_value: (extractedData.estimatedCost || 0) > 10000,
      accident_type: extractedData.accidentType || 'other'
    });
    
    const fraudResult = await runPythonScript(
      join(PYTHON_DIR, 'fraud_ml_model.py'),
      ['predict', fraudInput],
      30000
    );
    
    // Build cross-reference between physics and fraud
    const physicsFlagsCount = physicsAnalysis.flags?.length || 0;
    const physicsContributes = physicsFlagsCount > 0 || !physicsAnalysis.is_valid;
    
    // Adjust fraud score based on physics findings
    let adjustedFraudProb = fraudResult.fraud_probability || 0;
    if (physicsContributes) {
      adjustedFraudProb = Math.min(1.0, adjustedFraudProb + (physicsFlagsCount * 0.1));
    }
    
    // Build risk indicators (1-5 scale)
    const indicators = {
      claimHistory: 2, // Unknown for external assessments
      damageConsistency: physicsAnalysis.is_valid ? 2 : physicsAnalysis.damageConsistency === 'inconsistent' ? 4 : 3,
      documentAuthenticity: extractedImages.length > 3 ? 1 : extractedImages.length > 0 ? 2 : 4,
      behavioralPatterns: 2,
      ownershipVerification: extractedData.claimantName ? 2 : 4,
      geographicRisk: 2
    };
    
    // Determine risk level
    const riskScore = Math.round(adjustedFraudProb * 100);
    const riskLevel = riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : 'high';
    
    // Combine risk factors from Python + physics cross-reference
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
      analysis_notes: `Fraud probability: ${(adjustedFraudProb * 100).toFixed(1)}%. ${physicsContributes ? 'Physics inconsistencies detected - fraud risk elevated.' : 'Physics validation supports the claim.'} ${topRiskFactors.length > 0 ? 'Risk factors: ' + topRiskFactors.join('; ') : 'No significant risk factors identified.'}`
    };
    
    console.log(`✅ Fraud detection complete:`);
    console.log(`   Risk: ${fraudAnalysis.risk_level} (${fraudAnalysis.risk_score}/100)`);
    console.log(`   Physics cross-ref: ${physicsContributes ? 'CONTRIBUTES to fraud risk' : 'Supports claim'}`);
    console.log(`   Risk factors: ${topRiskFactors.length}`);
    
  } catch (error: any) {
    console.warn(`⚠️ Python fraud detection failed: ${error.message}`);
    console.warn('⚠️ Falling back to LLM fraud analysis...');
    
    // Fallback to LLM
    try {
      const fraudResponse = await invokeLLM({
        messages: [
          { role: "system", content: "You are an insurance fraud detection expert. Be fair and objective." },
          { role: "user", content: `Analyze fraud risk: ${extractedData.vehicleMake} ${extractedData.vehicleModel}, $${extractedData.estimatedCost}, ${extractedData.accidentType}, physics score: ${physicsAnalysis.physicsScore}/100, ${extractedImages.length} photos` }
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
                    claimHistory: { type: "integer", description: "Risk score 1-5 where 1=low risk, 5=high risk" }, damageConsistency: { type: "integer", description: "Risk score 1-5" },
                    documentAuthenticity: { type: "integer", description: "Risk score 1-5" }, behavioralPatterns: { type: "integer", description: "Risk score 1-5" },
                    ownershipVerification: { type: "integer", description: "Risk score 1-5" }, geographicRisk: { type: "integer", description: "Risk score 1-5" }
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

  // Clean up temp file
  try { unlinkSync(tempPdfPath); } catch (e) { /* ignore */ }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ ASSESSMENT PROCESSING COMPLETE`);
  console.log(`📊 Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} ${extractedData.vehicleYear}`);
  console.log(`📊 Registration: ${extractedData.vehicleRegistration}`);
  console.log(`📊 Cost: $${extractedData.estimatedCost} (Agreed: $${extractedData.repairCostAgreed || 'N/A'})`);
  console.log(`📊 Photos: ${extractedImages.length}`);
  console.log(`📊 Physics: ${physicsAnalysis.damageConsistency} (score ${physicsAnalysis.physicsScore}/100)`);
  console.log(`📊 Fraud: ${fraudAnalysis.risk_level} (score ${fraudAnalysis.risk_score}/100)`);
  console.log(`📊 Cross-ref: Physics ${fraudAnalysis.physics_cross_reference?.physics_contributes_to_fraud ? 'ELEVATES' : 'supports'} fraud risk`);
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
    estimatedCost: extractedData.repairCostAgreed || extractedData.estimatedCost || 0,
    itemizedCosts: extractedData.itemizedCosts || [],
    costBreakdown: extractedData.costBreakdown,
    damagePhotos: extractedImages,
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
    // The server process inherits PYTHONPATH/PYTHONHOME pointing to Python 3.13,
    // which causes SRE module mismatch errors when Python 3.11 tries to use them.
    const cleanEnv = { ...process.env };
    delete cleanEnv.PYTHONPATH;
    delete cleanEnv.PYTHONHOME;
    
    const pythonProcess = spawn('python3', [scriptPath, ...args], {
      cwd: PYTHON_DIR, // Run from python directory so relative imports work
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
