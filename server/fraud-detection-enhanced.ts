/**
 * Enhanced Fraud Detection Integration
 * Integrates Python ML model with driver demographics and ownership verification
 */

import { spawn } from "child_process";
import path from "path";

export interface EnhancedFraudInput {
  // Financial
  claim_amount: number;
  vehicle_age: number;
  vehicle_value?: number;
  
  // Driver demographics
  driver_age?: number;
  driver_gender?: "male" | "female" | "other" | "unknown";
  driver_employment_status?: "employed" | "self_employed" | "unemployed" | "student" | "retired" | "unknown";
  driver_license_suspended?: boolean;
  driver_violations_count?: number;
  
  // Ownership verification
  driver_name?: string;
  policy_holder_name?: string;
  driver_relationship_to_owner?: "owner" | "spouse" | "partner" | "child" | "parent" | "sibling" | "relative" | "friend" | "colleague" | "hired" | "employee" | "unknown" | "other";
  policy_type?: "individual" | "company" | "corporate" | "fleet" | "rental";
  days_since_policy_start?: number;
  driver_license_verified?: boolean;
  
  // Geographic
  incident_location?: string;
  geographic_risk_zone?: string;
  
  // Claim history
  previous_claims_count?: number;
  
  // Technical validation
  damage_severity_score?: number;
  physics_validation_score?: number;
  image_forensics_score?: number;
  assessor_approval_rate?: number;
  
  // Staged accident indicators
  estimated_impact_speed_kmh?: number;
  number_of_injury_claims?: number;
  
  // Time-based
  claim_time?: string | Date;
  
  // Documentation
  has_witnesses?: boolean;
  has_police_report?: boolean;
  has_photos?: boolean;
  has_dashcam_footage?: boolean;
  
  // Accident type
  accident_type?: "rear_end" | "side_impact" | "head_on" | "parking_lot" | "highway" | "single_vehicle" | "other";
}

export interface OwnershipAnalysis {
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  is_legitimate: boolean;
  legitimacy_indicators: string[];
  risk_factors: string[];
  recommendations: string[];
}

export interface DriverProfile {
  age: number;
  age_category: "young" | "elderly" | "standard";
  gender: string;
  employment_status: string;
  risk_factors: string[];
  profile_risk_score: number;
}

export interface StagedAccidentIndicators {
  is_likely_staged: boolean;
  confidence: number;
  indicators: string[];
  recommendation: string;
}

export interface EnhancedFraudResult {
  fraud_probability: number;
  ml_fraud_score?: number;
  ownership_risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  confidence: number;
  ownership_analysis: OwnershipAnalysis;
  driver_profile: DriverProfile;
  staged_accident_indicators: StagedAccidentIndicators;
  top_risk_factors?: string[];
  recommendations: string[];
}

/**
 * Call enhanced Python ML fraud detection model
 */
export async function predictEnhancedFraud(input: EnhancedFraudInput): Promise<EnhancedFraudResult> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(process.cwd(), "python", "fraud_ml_model_enhanced.py");
    const pythonProcess = spawn("python3", [pythonScript, "predict", JSON.stringify(input)]);
    
    let stdout = "";
    let stderr = "";
    
    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error("Enhanced fraud detection error:", stderr);
        reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result);
        }
      } catch (error) {
        reject(new Error(`Failed to parse Python output: ${error}`));
      }
    });
    
    pythonProcess.on("error", (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });
  });
}

/**
 * Analyze ownership risk only
 */
export async function analyzeOwnershipRisk(input: Partial<EnhancedFraudInput>): Promise<OwnershipAnalysis> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(process.cwd(), "python", "fraud_ml_model_enhanced.py");
    const pythonProcess = spawn("python3", [pythonScript, "ownership", JSON.stringify(input)]);
    
    let stdout = "";
    let stderr = "";
    
    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error("Ownership analysis error:", stderr);
        reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result);
        }
      } catch (error) {
        reject(new Error(`Failed to parse Python output: ${error}`));
      }
    });
    
    pythonProcess.on("error", (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });
  });
}

/**
 * Detect staged accident patterns only
 */
export async function detectStagedAccident(input: Partial<EnhancedFraudInput>): Promise<StagedAccidentIndicators> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(process.cwd(), "python", "fraud_ml_model_enhanced.py");
    const pythonProcess = spawn("python3", [pythonScript, "staged", JSON.stringify(input)]);
    
    let stdout = "";
    let stderr = "";
    
    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error("Staged accident detection error:", stderr);
        reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result);
        }
      } catch (error) {
        reject(new Error(`Failed to parse Python output: ${error}`));
      }
    });
    
    pythonProcess.on("error", (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });
  });
}

/**
 * Helper to extract fraud input from claim data
 */
export function extractFraudInputFromClaim(claim: any, aiAssessment?: any): EnhancedFraudInput {
  const vehicleAge = claim.vehicleYear ? new Date().getFullYear() - claim.vehicleYear : 5;
  
  return {
    // Financial
    claim_amount: aiAssessment?.estimatedCost || 0,
    vehicle_age: vehicleAge,
    vehicle_value: aiAssessment?.estimatedVehicleValue || vehicleAge > 10 ? 50000 : 100000,
    
    // Driver demographics
    driver_age: claim.driverAge || 35,
    driver_gender: claim.driverGender || "unknown",
    driver_employment_status: claim.driverEmploymentStatus || "unknown",
    driver_license_suspended: claim.driverLicenseSuspended === 1,
    driver_violations_count: claim.driverViolationsCount || 0,
    
    // Ownership verification
    driver_name: claim.driverName,
    policy_holder_name: claim.policyHolderName,
    driver_relationship_to_owner: claim.driverRelationshipToOwner || "unknown",
    policy_type: claim.policyType || "individual",
    days_since_policy_start: claim.daysSincePolicyStart || 180,
    driver_license_verified: claim.driverLicenseVerified === 1,
    
    // Geographic
    incident_location: claim.incidentLocation || "",
    geographic_risk_zone: claim.geographicRiskZone,
    
    // Claim history
    previous_claims_count: 0, // TODO: Query from database
    
    // Technical validation
    damage_severity_score: 0.5,
    physics_validation_score: aiAssessment?.physicsAnalysis ? 0.8 : 1.0,
    image_forensics_score: 1.0,
    assessor_approval_rate: 0.8,
    
    // Staged accident indicators
    estimated_impact_speed_kmh: claim.estimatedImpactSpeedKmh || 50,
    number_of_injury_claims: claim.numberOfInjuryClaims || 0,
    
    // Time-based
    claim_time: claim.createdAt || new Date(),
    
    // Documentation
    has_witnesses: false, // TODO: Check if witnesses exist
    has_police_report: false, // TODO: Check if police report uploaded
    has_photos: claim.damagePhotos ? JSON.parse(claim.damagePhotos).length > 0 : false,
    has_dashcam_footage: false, // TODO: Check if dashcam footage uploaded
    
    // Accident type
    accident_type: "other", // TODO: Determine from description
  };
}
