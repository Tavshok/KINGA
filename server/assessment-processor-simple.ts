/**
 * Simplified Assessment Processor for Debugging
 * Removes LLM and image extraction to isolate the 500 error
 */

import { nanoid } from 'nanoid';
import { storagePut } from './storage';
import { spawn } from 'child_process';

interface AssessmentResult {
  pdfUrl: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleRegistration: string;
  claimantName?: string;
  damageDescription: string;
  estimatedCost: number;
  damagePhotos: string[];
  accidentType?: string;
  damagedComponents: string[];
  physicsAnalysis: any;
  fraudAnalysis: any;
}

export async function processExternalAssessment(
  fileName: string,
  fileData: string // base64
): Promise<AssessmentResult> {
  console.log('🚀 Starting simplified assessment processing...');
  
  // Convert base64 to buffer
  const fileBuffer = Buffer.from(fileData, "base64");

  // Upload PDF to S3
  console.log('📤 Uploading PDF to S3...');
  const { url: pdfUrl } = await storagePut(
    `external-assessments/${nanoid()}-${fileName}`,
    fileBuffer,
    "application/pdf"
  );
  console.log(`✅ PDF uploaded: ${pdfUrl}`);

  // Use mock data for testing
  const extractedData = {
    vehicleMake: "Toyota",
    vehicleModel: "Fortuner",
    vehicleYear: 2019,
    vehicleRegistration: "AGA3895",
    claimantName: "Test Claimant",
    damageDescription: "Front bumper damage, left headlight broken, hood dented from collision",
    estimatedCost: 2500,
    accidentType: "head_on",
    damagedComponents: ["front_bumper", "left_headlight", "hood"]
  };
  
  console.log('✅ Using test data for debugging');

  // Test physics validation
  console.log('⚛️ Testing physics validation...');
  let physicsAnalysis: any = {};
  
  try {
    const physicsInput = {
      vehicle_type: 'suv',
      accident_type: 'head_on',
      estimated_speed: 50,
      damage_severity: 'moderate',
      damage_locations: ["front_bumper", "left_headlight", "hood"],
      reported_description: extractedData.damageDescription
    };

    physicsAnalysis = await runPythonScriptWithInput('python/validate_physics.py', physicsInput);
    console.log('✅ Physics validation complete:', physicsAnalysis);
  } catch (error: any) {
    console.error('❌ Physics validation failed:', error.message);
    physicsAnalysis = {
      damageConsistency: 'unknown',
      confidence: 0.5,
      physicsScore: 50,
      error: error.message
    };
  }

  // Test fraud detection
  console.log('🔍 Testing fraud detection...');
  let fraudAnalysis: any = {};
  
  try {
    const fraudInput = {
      claim_amount: 2500,
      vehicle_age: 5,
      days_since_policy_start: 365,
      previous_claims_count: 0,
      damage_severity_score: 0.5,
      physics_validation_score: physicsAnalysis.confidence || 0.8,
      image_forensics_score: 0.9,
      assessor_approval_rate: 0.85,
      has_witnesses: false,
      has_police_report: false,
      has_photos: false,
      is_high_value: false,
      accident_type: 'head_on'
    };

    fraudAnalysis = await runPythonScriptWithInput('python/detect_fraud.py', fraudInput);
    console.log('✅ Fraud detection complete:', fraudAnalysis);
  } catch (error: any) {
    console.error('❌ Fraud detection failed:', error.message);
    fraudAnalysis = {
      fraudProbability: 0.3,
      riskLevel: 'low',
      error: error.message
    };
  }

  console.log('✅ Assessment processing complete');

  return {
    pdfUrl,
    vehicleMake: extractedData.vehicleMake,
    vehicleModel: extractedData.vehicleModel,
    vehicleYear: extractedData.vehicleYear,
    vehicleRegistration: extractedData.vehicleRegistration,
    claimantName: extractedData.claimantName,
    damageDescription: extractedData.damageDescription,
    estimatedCost: extractedData.estimatedCost,
    damagePhotos: [],
    accidentType: extractedData.accidentType,
    damagedComponents: extractedData.damagedComponents,
    physicsAnalysis,
    fraudAnalysis,
  };
}

// Helper function to run Python script with stdin input
function runPythonScriptWithInput(scriptPath: string, input: any, timeoutMs: number = 60000): Promise<any> {
  return new Promise((resolve, reject) => {
    console.log(`🐍 Running Python script: ${scriptPath}`);
    
    const pythonProcess = spawn('python3', [scriptPath]);
    
    // Set timeout
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
      console.error(`Python stderr: ${data.toString()}`);
    });

    pythonProcess.stdin.write(JSON.stringify(input));
    pythonProcess.stdin.end();

    pythonProcess.on('close', (code) => {
      clearTimeout(timeout);
      
      if (code !== 0) {
        console.error(`Python script error (code ${code}): ${error}`);
        reject(new Error(`Python script failed with code ${code}: ${error}`));
        return;
      }

      try {
        console.log(`Python output: ${output}`);
        const result = JSON.parse(output);
        resolve(result);
      } catch (e: any) {
        console.error(`Failed to parse Python output: ${output}`);
        reject(new Error(`Failed to parse Python output: ${e.message}`));
      }
    });

    pythonProcess.on('error', (err) => {
      clearTimeout(timeout);
      console.error(`Failed to start Python process: ${err.message}`);
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });
  });
}
