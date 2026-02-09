/**
 * Enhanced Assessment Processing with AI Analysis
 * Extracts images, runs physics validation, and fraud detection
 * All analysis now uses LLM instead of Python scripts for reliability
 */

import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
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
  itemizedCosts?: Array<{
    description: string;
    amount: number;
    category?: string;
  }>;
  costBreakdown?: {
    labor?: number;
    parts?: number;
    materials?: number;
    other?: number;
  };
  damagePhotos: string[];
  accidentType?: string;
  damagedComponents: string[];
  physicsAnalysis: any;
  fraudAnalysis: any;
  missingData: string[];
  dataQuality: Record<string, boolean>;
  dataCompleteness: number;
}

/**
 * Clean "null" strings from LLM output - the JSON schema forces string types,
 * so the LLM returns literal "null" instead of actual null values
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
  fileData: string | Buffer // base64 string or Buffer
): Promise<AssessmentResult> {
  // Convert to buffer if needed
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

  // Save PDF temporarily for Python processing
  const tempPdfPath = join('/tmp', `assessment-${nanoid()}.pdf`);
  writeFileSync(tempPdfPath, fileBuffer);

  // Step 1: Extract images from PDF using Python
  console.log('\n🖼️ Step 1: Extracting images from PDF...');
  let pdfData: any = { images: [] };
  
  const processAssessmentScript = join(PYTHON_DIR, 'process_assessment.py');
  
  try {
    pdfData = await runPythonScript(processAssessmentScript, [tempPdfPath]);
    console.log(`✅ Image extraction complete: ${pdfData.images?.length || 0} images found`);
  } catch (error: any) {
    console.warn(`⚠️ Image extraction failed: ${error.message}`);
  }

  let extractedImages: string[] = [];

  // Upload extracted images to S3
  if (pdfData.images && pdfData.images.length > 0) {
    console.log(`📸 Uploading ${pdfData.images.length} images to S3...`);
    
    for (const img of pdfData.images) {
      if (img.full_data) {
        try {
          const imgBuffer = Buffer.from(img.full_data, 'base64');
          const { url: imgUrl } = await storagePut(
            `damage-photos/${nanoid()}.${img.format}`,
            imgBuffer,
            `image/${img.format}`
          );
          extractedImages.push(imgUrl);
        } catch (e: any) {
          console.warn(`⚠️ Failed to upload image: ${e.message}`);
        }
      }
    }
    console.log(`✅ Uploaded ${extractedImages.length} images`);
  }

  // Step 2: Extract text from PDF using Node.js pdf-parse (primary) with Python OCR fallback
  console.log('\n📝 Step 2: Extracting text from PDF...');
  let pdfHasText = false;
  let extractedText = '';
  let extractionMethod = 'unknown';
  
  // Primary: Use Node.js pdf-parse (no Python dependency)
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
    const textResult = await parser.getText();
    extractedText = textResult.text || '';
    await parser.destroy();
    extractionMethod = 'node-pdf-parse';
    pdfHasText = extractedText.length > 100;
    
    console.log(`✅ Node.js text extraction: ${pdfHasText ? 'SUCCESS' : 'INSUFFICIENT TEXT'}`);
    console.log(`📊 Text length: ${extractedText.length} characters`);
  } catch (error: any) {
    console.error(`❌ Node.js text extraction failed: ${error.message}`);
  }
  
  // Fallback: Use Python OCR if Node.js extraction failed
  if (!pdfHasText) {
    console.log('🔄 Trying Python OCR fallback...');
    const ocrScript = join(PYTHON_DIR, 'extract_pdf_text_ocr.py');
    try {
      const textExtractionResult = await runPythonScript(ocrScript, [tempPdfPath], 180000);
      extractedText = textExtractionResult.text || '';
      extractionMethod = 'python-ocr';
      pdfHasText = extractedText.length > 100;
      console.log(`✅ Python OCR: ${pdfHasText ? 'SUCCESS' : 'INSUFFICIENT TEXT'} (${extractedText.length} chars)`);
    } catch (error: any) {
      console.error(`❌ Python OCR also failed: ${error.message}`);
    }
  }
  
  if (!pdfHasText) {
    console.warn('⚠️ WARNING: Could not extract sufficient text from PDF!');
  }

  // Step 3: Extract structured data from PDF using LLM
  console.log('\n🤖 Step 3: Extracting structured data with LLM...');
  console.log(`📝 Text to LLM: ${extractedText.length} characters`);
  
  const extractionResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert at extracting structured data from vehicle damage assessment reports. 
Your task is to carefully read the entire document and extract ALL available information. 
IMPORTANT: For any field where data IS found in the document, return the actual value.
For any field where data is NOT found, return an empty string "" (not "null", not "N/A", not "none").
Be thorough and accurate. Extract exact values as they appear in the document.`
      },
      {
        role: "user",
        content: `Extract ALL information from this vehicle damage assessment report.

CRITICAL INSTRUCTIONS:
- Return actual values found in the document
- For missing fields, use empty string ""
- Do NOT return "null" or "N/A" as values
- Extract numbers as actual numbers, not strings

VEHICLE INFORMATION:
- Make, model, year, registration number
- Vehicle mass/weight if mentioned

CLAIMANT & ACCIDENT DETAILS:
- Claimant name (insured party name)
- Accident date and time
- Accident location
- Accident description (how it happened)
- Estimated impact speed in km/h
- Accident type: rear_end, side_impact, head_on, parking_lot, highway, rollover, or other
- Police report reference if mentioned

DAMAGE ASSESSMENT:
- Detailed description of ALL visible damage
- List EVERY damaged component/part mentioned
- Damage location on vehicle (front, rear, left side, right side, roof, etc.)

COST INFORMATION:
- Total estimated repair cost (as a number)
- If itemized costs are provided, extract each line item with description and amount
- Labor costs total
- Parts costs total  
- Materials costs total
- Other costs

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
            vehicleMake: { type: "string", description: "Vehicle manufacturer/make" },
            vehicleModel: { type: "string", description: "Vehicle model name" },
            vehicleYear: { type: "integer", description: "Vehicle year of manufacture" },
            vehicleRegistration: { type: "string", description: "Vehicle registration/plate number" },
            vehicleMass: { type: "string", description: "Vehicle mass/weight if mentioned" },
            claimantName: { type: "string", description: "Name of insured/claimant" },
            accidentDate: { type: "string", description: "Date of accident" },
            accidentLocation: { type: "string", description: "Where accident occurred" },
            accidentDescription: { type: "string", description: "How the accident happened" },
            policeReportReference: { type: "string", description: "Police report number if mentioned" },
            damageDescription: { type: "string", description: "Detailed description of all visible damage" },
            damageLocation: { type: "string", description: "Where on vehicle damage is located" },
            estimatedCost: { type: "number", description: "Total repair cost as a number" },
            estimatedSpeed: { type: "number", description: "Estimated impact speed in km/h" },
            accidentType: { type: "string", description: "Type: rear_end, side_impact, head_on, parking_lot, highway, rollover, other" },
            damagedComponents: { 
              type: "array",
              items: { type: "string" },
              description: "List of all damaged parts/components"
            },
            itemizedCosts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  amount: { type: "number" },
                  category: { type: "string", description: "labor, parts, materials, or other" }
                },
                required: ["description", "amount"],
                additionalProperties: false
              },
              description: "Individual line items from cost breakdown if available"
            },
            costBreakdown: {
              type: "object",
              properties: {
                labor: { type: "number" },
                parts: { type: "number" },
                materials: { type: "number" },
                other: { type: "number" }
              },
              required: [],
              additionalProperties: false,
              description: "Summary totals by category"
            }
          },
          required: ["vehicleMake", "vehicleModel", "vehicleYear", "vehicleRegistration"],
          additionalProperties: false
        }
      }
    }
  });

  console.log('🤖 LLM response received');
  const llmRawContent = (extractionResponse.choices[0].message.content as string) || "{}";
  console.log(`📄 LLM response length: ${llmRawContent.length} chars`);
  
  const rawExtractedData = JSON.parse(llmRawContent);
  
  // Clean "null" strings from LLM output
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
  
  console.log('\n📋 EXTRACTED DATA (cleaned):');
  console.log(`  Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} ${extractedData.vehicleYear}`);
  console.log(`  Registration: ${extractedData.vehicleRegistration}`);
  console.log(`  Claimant: ${extractedData.claimantName || 'NOT FOUND'}`);
  console.log(`  Cost: $${extractedData.estimatedCost || 'NOT FOUND'}`);
  console.log(`  Accident Type: ${extractedData.accidentType || 'NOT FOUND'}`);
  console.log(`  Damaged Components: ${extractedData.damagedComponents?.length || 0} items`);

  // Track missing data for transparency
  const missingData: string[] = [];
  const dataQuality: Record<string, boolean> = {
    hasClaimant: !!extractedData.claimantName,
    hasAccidentDetails: !!(extractedData.accidentDescription || extractedData.accidentDate),
    hasSpeed: !!extractedData.estimatedSpeed,
    hasCost: !!extractedData.estimatedCost,
    hasItemizedCosts: !!(extractedData.itemizedCosts && extractedData.itemizedCosts.length > 0),
    hasDamageLocation: !!extractedData.damageLocation,
    hasPoliceReport: !!extractedData.policeReportReference,
    hasDamagedComponents: !!(extractedData.damagedComponents && extractedData.damagedComponents.length > 0)
  };
  
  if (!dataQuality.hasClaimant) missingData.push('Claimant name');
  if (!dataQuality.hasAccidentDetails) missingData.push('Accident details');
  if (!dataQuality.hasSpeed) missingData.push('Impact speed');
  if (!dataQuality.hasCost) missingData.push('Total repair cost');
  if (!dataQuality.hasItemizedCosts) missingData.push('Itemized cost breakdown');
  if (!dataQuality.hasDamageLocation) missingData.push('Damage location');
  if (!dataQuality.hasPoliceReport) missingData.push('Police report reference');
  if (!dataQuality.hasDamagedComponents) missingData.push('Damaged components list');

  const completeness = Math.round((Object.values(dataQuality).filter(v => v).length / Object.keys(dataQuality).length) * 100);
  console.log(`📊 Data Completeness: ${completeness}%`);
  console.log(`⚠️ Missing: ${missingData.length > 0 ? missingData.join(', ') : 'None'}`);

  // Step 4: Run physics validation using LLM
  console.log('\n⚛️ Step 4: Running physics validation with LLM...');
  let physicsAnalysis: any = {};
  
  try {
    let estimatedSpeed = extractedData.estimatedSpeed || 0;
    if (!extractedData.estimatedSpeed) {
      const speedByType: Record<string, number> = {
        'parking_lot': 15, 'rear_end': 40, 'side_impact': 55, 'head_on': 70, 'highway': 100
      };
      estimatedSpeed = speedByType[extractedData.accidentType || ''] || 50;
    }
    
    const vehicleType = extractedData.vehicleModel?.toLowerCase().includes('suv') ? 'suv' : 
                   extractedData.vehicleModel?.toLowerCase().includes('truck') || 
                   extractedData.vehicleModel?.toLowerCase().includes('ranger') ? 'truck' : 'sedan';
    const damageSeverity = extractedData.estimatedCost > 5000 ? 'severe' : extractedData.estimatedCost > 2000 ? 'moderate' : 'minor';

    const physicsResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a vehicle accident physics expert. Analyze the accident data and provide physics validation results. Use realistic physics calculations based on the vehicle type, accident type, and estimated speed. Return numerical values that are physically plausible.`
        },
        {
          role: "user",
          content: `Analyze this accident for physics consistency:

Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} (${vehicleType}, ~${vehicleType === 'truck' ? '2200' : vehicleType === 'suv' ? '1800' : '1400'}kg)
Accident Type: ${extractedData.accidentType || 'unknown'}
Estimated Speed: ${estimatedSpeed} km/h
Damage Severity: ${damageSeverity}
Damage Description: ${extractedData.damageDescription || 'No description'}
Damage Location: ${extractedData.damageLocation || 'Unknown'}
Damaged Components: ${(extractedData.damagedComponents || []).join(', ') || 'Not specified'}
Repair Cost: $${extractedData.estimatedCost || 0}

Calculate realistic physics values and determine if the reported damage is consistent with the accident description.`
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
              impactSpeed: { type: "number", description: "Estimated impact speed in km/h" },
              impactForce: { type: "number", description: "Estimated impact force in kN" },
              energyDissipated: { type: "number", description: "Percentage of energy absorbed by crumple zones (0-100)" },
              deceleration: { type: "number", description: "Peak deceleration in g-forces" },
              damageConsistency: { type: "string", description: "One of: consistent, questionable, inconsistent" },
              physicsScore: { type: "integer", description: "Physics validation score 0-100" },
              confidence: { type: "number", description: "Confidence level 0-1" },
              is_valid: { type: "boolean", description: "Whether damage is consistent with reported accident" },
              analysis_notes: { type: "string", description: "Brief explanation of the physics analysis findings" }
            },
            required: ["impactSpeed", "impactForce", "energyDissipated", "deceleration", "damageConsistency", "physicsScore", "confidence", "is_valid", "analysis_notes"],
            additionalProperties: false
          }
        }
      }
    });
    
    const physicsContent = physicsResponse.choices[0].message.content as string;
    physicsAnalysis = JSON.parse(physicsContent);
    console.log(`✅ Physics validation complete: score=${physicsAnalysis.physicsScore}, consistency=${physicsAnalysis.damageConsistency}`);
  } catch (error: any) {
    console.warn(`⚠️ Physics validation failed: ${error.message}`);
    physicsAnalysis = { 
      impactSpeed: 50, impactForce: 80, energyDissipated: 65, deceleration: 4.5,
      damageConsistency: 'unknown', confidence: 0.5, physicsScore: 50, is_valid: true,
      analysis_notes: 'Physics analysis could not be completed - using default values'
    };
  }

  // Step 5: Run fraud detection using LLM
  console.log('\n🔍 Step 5: Running fraud detection with LLM...');
  let fraudAnalysis: any = {};
  
  try {
    const fraudResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an insurance fraud detection expert. Analyze the claim data and provide a fraud risk assessment. Be fair and objective - most claims are legitimate. Only flag high risk if there are clear red flags. Consider: claim amount relative to vehicle value, damage consistency, documentation quality, and accident circumstances.`
        },
        {
          role: "user",
          content: `Analyze this insurance claim for fraud risk:

Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} ${extractedData.vehicleYear}
Claim Amount: $${extractedData.estimatedCost || 0}
Vehicle Age: ${new Date().getFullYear() - (extractedData.vehicleYear || 2020)} years
Accident Type: ${extractedData.accidentType || 'unknown'}
Accident Description: ${extractedData.accidentDescription || 'Not provided'}
Damage Description: ${extractedData.damageDescription || 'Not provided'}
Damage Location: ${extractedData.damageLocation || 'Not specified'}
Has Police Report: ${!!extractedData.policeReportReference}
Has Photos: ${extractedImages.length > 0}
Number of Photos: ${extractedImages.length}
Physics Validation Score: ${physicsAnalysis.physicsScore || 50}/100
Physics Consistency: ${physicsAnalysis.damageConsistency || 'unknown'}
Claimant: ${extractedData.claimantName || 'Unknown'}

Provide a fraud risk assessment with scores for each risk dimension (1-5 scale where 1=low risk, 5=high risk).`
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
              fraud_probability: { type: "number", description: "Fraud probability 0-1" },
              risk_level: { type: "string", description: "One of: low, medium, high" },
              risk_score: { type: "integer", description: "Overall risk score 0-100" },
              indicators: {
                type: "object",
                properties: {
                  claimHistory: { type: "integer", description: "Claim history risk 1-5" },
                  damageConsistency: { type: "integer", description: "Damage consistency risk 1-5" },
                  documentAuthenticity: { type: "integer", description: "Document authenticity risk 1-5" },
                  behavioralPatterns: { type: "integer", description: "Behavioral patterns risk 1-5" },
                  ownershipVerification: { type: "integer", description: "Ownership verification risk 1-5" },
                  geographicRisk: { type: "integer", description: "Geographic risk factor 1-5" }
                },
                required: ["claimHistory", "damageConsistency", "documentAuthenticity", "behavioralPatterns", "ownershipVerification", "geographicRisk"],
                additionalProperties: false
              },
              top_risk_factors: {
                type: "array",
                items: { type: "string" },
                description: "List of identified risk factors"
              },
              analysis_notes: { type: "string", description: "Brief explanation of fraud risk assessment" }
            },
            required: ["fraud_probability", "risk_level", "risk_score", "indicators", "top_risk_factors", "analysis_notes"],
            additionalProperties: false
          }
        }
      }
    });
    
    const fraudContent = fraudResponse.choices[0].message.content as string;
    fraudAnalysis = JSON.parse(fraudContent);
    console.log(`✅ Fraud detection complete: risk=${fraudAnalysis.risk_level}, score=${fraudAnalysis.risk_score}`);
  } catch (error: any) {
    console.warn(`⚠️ Fraud detection failed: ${error.message}`);
    fraudAnalysis = { 
      fraud_probability: 0.15, risk_level: 'low', risk_score: 15,
      indicators: { claimHistory: 2, damageConsistency: 2, documentAuthenticity: 2, behavioralPatterns: 2, ownershipVerification: 2, geographicRisk: 2 },
      top_risk_factors: [],
      analysis_notes: 'Fraud analysis could not be completed - using default low-risk values'
    };
  }

  // Clean up temp file
  try { unlinkSync(tempPdfPath); } catch (e) { /* ignore */ }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ ASSESSMENT PROCESSING COMPLETE`);
  console.log(`📊 Vehicle: ${extractedData.vehicleMake} ${extractedData.vehicleModel} ${extractedData.vehicleYear}`);
  console.log(`📊 Registration: ${extractedData.vehicleRegistration}`);
  console.log(`📊 Cost: $${extractedData.estimatedCost}`);
  console.log(`📊 Physics Score: ${physicsAnalysis.physicsScore}/100`);
  console.log(`📊 Fraud Risk: ${fraudAnalysis.risk_level} (${fraudAnalysis.risk_score}/100)`);
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
    estimatedCost: extractedData.estimatedCost || 0,
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

// Helper function to run Python script with arguments (still used for image extraction)
function runPythonScript(scriptPath: string, args: string[] = [], timeoutMs: number = 120000): Promise<any> {
  return new Promise((resolve, reject) => {
    console.log(`🐍 Running: python3 ${scriptPath} ${args.join(' ')}`);
    
    const pythonProcess = spawn('python3', [scriptPath, ...args], {
      cwd: PROJECT_ROOT
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
        console.error(`❌ Python script failed (code ${code}): ${error}`);
        reject(new Error(`Python script failed with code ${code}: ${error}`));
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
