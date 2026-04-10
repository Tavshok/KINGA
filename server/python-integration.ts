// @ts-nocheck
/**
 * Python Integration Module for KINGA
 * Wraps Python scripts for use in Node.js/tRPC backend
 */

import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const execAsync = promisify(exec);

const __filename_esm = fileURLToPath(import.meta.url);
const __dirname_esm = dirname(__filename_esm);
const PYTHON_DIR = path.join(__dirname_esm, "../python");

export interface PhysicsValidationResult {
  is_valid: boolean;
  confidence: number;
  flags: string[];
  physics_analysis: {
    kinetic_energy_joules: number;
    vehicle_mass_kg: number;
    impact_speed_ms: number;
    deceleration_ms2: number;
    g_force: number;
  };
  recommendations: string[];
}

export interface ImageForensicsResult {
  is_suspicious: boolean;
  confidence: number;
  flags: string[];
  exif_data: Record<string, string>;
  manipulation_indicators: Record<string, any>;
  image_hash: string;
  recommendations: string[];
}

export interface PDFProcessingResult {
  text_content: string;
  tables: Array<{
    page: number;
    table_number: number;
    data: string[][];
    headers: string[];
    rows: string[][];
  }>;
  images: Array<{
    page: number;
    image_number: number;
    format: string;
    size_bytes: number;
  }>;
  handwritten_notes: string[];
  metadata: Record<string, any>;
  structured_data: {
    vehicle: Record<string, string>;
    claimant: Record<string, string>;
    damage: Record<string, string>;
    costs: Record<string, string>;
    assessor: Record<string, string>;
  };
  success: boolean;
}

export interface FraudPredictionResult {
  fraud_probability: number;
  risk_level: "low" | "medium" | "high" | "elevated";
  confidence: number;
  top_risk_factors: string[];
  recommendations: string[];
}

/**
 * Validate collision physics
 */
export async function validatePhysics(params: {
  vehicle_type: string;
  accident_type: string;
  estimated_speed: number;
  damage_severity: string;
  damage_locations: string[];
  reported_description: string;
}): Promise<PhysicsValidationResult> {
  try {
    const inputJson = JSON.stringify(params);
    const scriptPath = path.join(PYTHON_DIR, "physics_validator.py");
    
    const { stdout } = await execAsync(
      `python3 "${scriptPath}" '${inputJson.replace(/'/g, "'\\''")}'`
    );
    
    return JSON.parse(stdout);
  } catch (error: any) {
    console.error("Physics validation error:", error);
    throw new Error(`Physics validation failed: ${error.message}`);
  }
}

/**
 * Analyze image for fraud indicators
 */
export async function analyzeImage(imagePath: string): Promise<ImageForensicsResult> {
  try {
    const scriptPath = path.join(PYTHON_DIR, "image_forensics.py");
    
    const { stdout } = await execAsync(
      `python3 "${scriptPath}" "${imagePath}"`
    );
    
    return JSON.parse(stdout);
  } catch (error: any) {
    console.error("Image forensics error:", error);
    throw new Error(`Image analysis failed: ${error.message}`);
  }
}

/**
 * Process PDF assessment document
 */
export async function processPDF(pdfPath: string): Promise<PDFProcessingResult> {
  try {
    const scriptPath = path.join(PYTHON_DIR, "pdf_processor.py");
    
    const { stdout } = await execAsync(
      `python3 "${scriptPath}" "${pdfPath}"`,
      { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large PDFs
    );
    
    return JSON.parse(stdout);
  } catch (error: any) {
    console.error("PDF processing error:", error);
    throw new Error(`PDF processing failed: ${error.message}`);
  }
}

/**
 * Predict fraud probability
 */
export async function predictFraud(claimData: {
  claim_amount: number;
  vehicle_age: number;
  days_since_policy_start: number;
  previous_claims_count: number;
  damage_severity_score: number;
  physics_validation_score: number;
  image_forensics_score: number;
  assessor_approval_rate?: number;
  claim_time?: string;
  has_witnesses?: boolean;
  has_police_report?: boolean;
  has_photos?: boolean;
  is_high_value?: boolean;
  accident_type?: string;
}): Promise<FraudPredictionResult> {
  try {
    const inputJson = JSON.stringify(claimData);
    const scriptPath = path.join(PYTHON_DIR, "fraud_ml_model.py");
    
    const { stdout } = await execAsync(
      `python3 "${scriptPath}" predict '${inputJson.replace(/'/g, "'\\''")}'`
    );
    
    return JSON.parse(stdout);
  } catch (error: any) {
    console.error("Fraud prediction error:", error);
    throw new Error(`Fraud prediction failed: ${error.message}`);
  }
}

/**
 * Predict repair cost
 */
export async function predictRepairCost(claimData: {
  damage_severity: string;
  vehicle_type: string;
  damage_locations: string[];
}): Promise<{
  estimated_cost: number;
  min_cost: number;
  max_cost: number;
  confidence: number;
}> {
  try {
    const inputJson = JSON.stringify(claimData);
    const scriptPath = path.join(PYTHON_DIR, "fraud_ml_model.py");
    
    const { stdout } = await execAsync(
      `python3 "${scriptPath}" cost '${inputJson.replace(/'/g, "'\\''")}'`
    );
    
    return JSON.parse(stdout);
  } catch (error: any) {
    console.error("Cost prediction error:", error);
    throw new Error(`Cost prediction failed: ${error.message}`);
  }
}

/**
 * Comprehensive claim analysis using all Python modules
 */
export async function analyzeClaimComprehensive(params: {
  // Physics validation
  vehicle_type: string;
  accident_type: string;
  estimated_speed: number;
  damage_severity: string;
  damage_locations: string[];
  reported_description: string;
  
  // Fraud prediction
  claim_amount: number;
  vehicle_age: number;
  days_since_policy_start: number;
  previous_claims_count: number;
  has_witnesses: boolean;
  has_police_report: boolean;
  has_photos: boolean;
  
  // Optional: image paths for forensics
  image_paths?: string[];
  
  // Optional: PDF path for processing
  pdf_path?: string;
}): Promise<{
  physics_validation: PhysicsValidationResult;
  fraud_prediction: FraudPredictionResult;
  image_forensics?: ImageForensicsResult[];
  pdf_analysis?: PDFProcessingResult;
  overall_risk_score: number;
  overall_confidence: number;
  critical_flags: string[];
  recommendations: string[];
}> {
  // Run physics validation
  const physics_validation = await validatePhysics({
    vehicle_type: params.vehicle_type,
    accident_type: params.accident_type,
    estimated_speed: params.estimated_speed,
    damage_severity: params.damage_severity,
    damage_locations: params.damage_locations,
    reported_description: params.reported_description,
  });
  
  // Calculate scores for fraud prediction
  const damage_severity_scores: Record<string, number> = {
    minor: 0.25,
    moderate: 0.5,
    severe: 0.75,
    total_loss: 1.0,
  };
  
  // Run fraud prediction
  const fraud_prediction = await predictFraud({
    claim_amount: params.claim_amount,
    vehicle_age: params.vehicle_age,
    days_since_policy_start: params.days_since_policy_start,
    previous_claims_count: params.previous_claims_count,
    damage_severity_score: damage_severity_scores[params.damage_severity] || 0.5,
    physics_validation_score: physics_validation.confidence,
    image_forensics_score: 1.0, // Will be updated if images analyzed
    has_witnesses: params.has_witnesses,
    has_police_report: params.has_police_report,
    has_photos: params.has_photos,
    is_high_value: params.claim_amount > 10000,
    accident_type: params.accident_type,
  });
  
  // Analyze images if provided
  let image_forensics: ImageForensicsResult[] | undefined;
  if (params.image_paths && params.image_paths.length > 0) {
    image_forensics = await Promise.all(
      params.image_paths.map(path => analyzeImage(path))
    );
    
    // Update fraud prediction with image forensics score
    const avg_image_confidence = image_forensics.reduce((sum, result) => sum + result.confidence, 0) / image_forensics.length;
    fraud_prediction.confidence = (fraud_prediction.confidence + avg_image_confidence) / 2;
  }
  
  // Process PDF if provided
  let pdf_analysis: PDFProcessingResult | undefined;
  if (params.pdf_path) {
    pdf_analysis = await processPDF(params.pdf_path);
  }
  
  // Calculate overall risk score
  const risk_scores = {
    low: 0.2,
    medium: 0.5,
    high: 0.75,
    critical: 1.0,
  };
  
  const physics_risk = physics_validation.is_valid ? 0.0 : 0.5;
  const fraud_risk = risk_scores[fraud_prediction.risk_level];
  const image_risk = image_forensics 
    ? image_forensics.some(r => r.is_suspicious) ? 0.5 : 0.0
    : 0.0;
  
  const overall_risk_score = (physics_risk + fraud_risk + image_risk) / 3;
  const overall_confidence = (
    physics_validation.confidence + 
    fraud_prediction.confidence +
    (image_forensics ? image_forensics.reduce((sum, r) => sum + r.confidence, 0) / image_forensics.length : 1.0)
  ) / 3;
  
  // Collect critical flags
  const critical_flags = [
    ...physics_validation.flags,
    ...fraud_prediction.top_risk_factors,
    ...(image_forensics?.flatMap(r => r.flags) || []),
  ];
  
  // Collect recommendations
  const recommendations = [
    ...physics_validation.recommendations,
    ...fraud_prediction.recommendations,
    ...(image_forensics?.flatMap(r => r.recommendations) || []),
  ];
  
  return {
    physics_validation,
    fraud_prediction,
    image_forensics,
    pdf_analysis,
    overall_risk_score,
    overall_confidence,
    critical_flags,
    recommendations: Array.from(new Set(recommendations)), // Remove duplicates
  };
}
