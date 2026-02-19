// @ts-nocheck
import { eq, and, desc, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { 
  InsertUser, 
  users,
  claims,
  InsertClaim,
  panelBeaters,
  InsertPanelBeater,
  aiAssessments,
  InsertAiAssessment,
  assessorEvaluations,
  InsertAssessorEvaluation,
  panelBeaterQuotes,
  InsertPanelBeaterQuote,
  appointments,
  InsertAppointment,
  auditTrail,
  InsertAuditTrailEntry,
  notifications,
  InsertNotification,
  fraudIndicators,
  claimantHistory,
  vehicleHistory,
  entityRelationships,
  fraudAlerts,
  fraudRules,
  quoteLineItems,
  InsertQuoteLineItem,
  thirdPartyVehicles,
  InsertThirdPartyVehicle,
  vehicleMarketValuations,
  InsertVehicleMarketValuation,
  policeReports,
  InsertPoliceReport,
  preAccidentDamage,
  InsertPreAccidentDamage,
  vehicleConditionAssessment,
  InsertVehicleConditionAssessment,
  approvalWorkflow,
  InsertApprovalWorkflow,
  assessors,
  assessorInsurerRelationships,
  claimEvents,
  InsertClaimEvent
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL, { schema, mode: "default" });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================================================
// USER OPERATIONS
// ============================================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUsersByRole(role: typeof users.$inferSelect.role) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(users).where(eq(users.role, role));
}

// ============================================================================
// PANEL BEATER OPERATIONS
// ============================================================================

export async function getAllApprovedPanelBeaters() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(panelBeaters).where(eq(panelBeaters.approved, 1));
}

export async function getPanelBeaterById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(panelBeaters).where(eq(panelBeaters.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createPanelBeater(data: InsertPanelBeater) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(panelBeaters).values(data);
  return result;
}

// ============================================================================
// CLAIM OPERATIONS
// ============================================================================

export async function createClaim(data: InsertClaim) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(claims).values(data);
  return result;
}

export async function getClaimById(id: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return undefined;

  const conditions = tenantId 
    ? and(eq(claims.id, id), eq(claims.tenantId, tenantId))
    : eq(claims.id, id);
  
  const result = await db.select().from(claims).where(conditions).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getClaimByNumber(claimNumber: string, tenantId?: string) {
  const db = await getDb();
  if (!db) return undefined;

  const conditions = tenantId
    ? and(eq(claims.claimNumber, claimNumber), eq(claims.tenantId, tenantId))
    : eq(claims.claimNumber, claimNumber);
  
  const result = await db.select().from(claims).where(conditions).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getClaimsByClaimant(claimantId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  const conditions = tenantId
    ? and(eq(claims.claimantId, claimantId), eq(claims.tenantId, tenantId))
    : eq(claims.claimantId, claimantId);
  
  return await db.select().from(claims).where(conditions).orderBy(desc(claims.createdAt));
}

export async function getClaimsByAssessor(assessorId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  const conditions = tenantId
    ? and(eq(claims.assignedAssessorId, assessorId), eq(claims.tenantId, tenantId))
    : eq(claims.assignedAssessorId, assessorId);
  
  return await db.select().from(claims).where(conditions).orderBy(desc(claims.createdAt));
}

export async function getClaimsForPanelBeater(panelBeaterId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  // Get claims where this panel beater was selected by the claimant
  const query = tenantId
    ? db.select().from(claims).where(eq(claims.tenantId, tenantId)).orderBy(desc(claims.createdAt))
    : db.select().from(claims).orderBy(desc(claims.createdAt));
  
  const allClaims = await query;
  
  return allClaims.filter(claim => {
    if (!claim.selectedPanelBeaterIds) return false;
    try {
      const selectedIds = JSON.parse(claim.selectedPanelBeaterIds);
      return selectedIds.includes(panelBeaterId);
    } catch {
      return false;
    }
  });
}

/**
 * @deprecated Use WorkflowEngine.transition() instead for governance-compliant state changes
 * This function is kept for backward compatibility but will route through WorkflowEngine
 */
export async function updateClaimStatus(
  claimId: number,
  status: typeof claims.$inferSelect.status,
  userId: number,
  userRole: string,
  tenantId: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current claim for validation
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId));
  if (!claim) throw new Error(`Claim ${claimId} not found`);
  
  // All state transitions MUST go through WorkflowEngine for governance
  const { transition } = await import("./workflow-engine");
  const { statusToWorkflowState } = await import("./workflow-migration");
  
  const fromState = claim.workflowState || statusToWorkflowState(claim.status as any);
  const toState = statusToWorkflowState(status as any);
  
  await transition({
    claimId,
    fromState: fromState as any,
    toState: toState as any,
    userId,
    userRole: userRole as any,
  });
}

export async function assignClaimToAssessor(claimId: number, assessorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current claim status for validation
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId));
  if (!claim) throw new Error(`Claim ${claimId} not found`);
  
  // Validate state transition to assessment_pending
  const { validateStateTransition } = await import("./workflow-validator");
  validateStateTransition(claim.status as any, "assessment_pending");

  await db.update(claims).set({ 
    assignedAssessorId: assessorId,
    status: "assessment_pending",
    updatedAt: new Date().toISOString() 
  }).where(eq(claims.id, claimId));
}

export async function updateClaimPolicyVerification(claimId: number, verified: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(claims).set({ 
    policyVerified: verified ? 1 : 0,
    updatedAt: new Date().toISOString() 
  }).where(eq(claims.id, claimId));
}

/**
 * Trigger AI Assessment with Real Image Analysis
 * 
 * Performs automated damage assessment using AI vision analysis on uploaded photos.
 * Estimates repair costs and detects potential fraud indicators.
 */
export async function triggerAiAssessment(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get claim details including damage photos
  const claim = await getClaimById(claimId);
  if (!claim) throw new Error("Claim not found");

  // Mark assessment as triggered
  await db.update(claims).set({ 
    aiAssessmentTriggered: 1,
    updatedAt: new Date().toISOString() 
  }).where(eq(claims.id, claimId));

  // Parse damage photos from JSON
  const damagePhotos: string[] = claim.damagePhotos ? JSON.parse(claim.damagePhotos) : [];
  
  if (damagePhotos.length === 0) {
    // Create placeholder assessment when no photos available
    await db.insert(aiAssessments).values({
      claimId,
      damageDescription: "Assessment pending - No damage photos uploaded yet. Please upload vehicle damage photos to proceed with AI analysis.",
      damagedComponentsJson: JSON.stringify([]),
      estimatedCost: 0,
      fraudIndicators: JSON.stringify(["No photos available for analysis"]),
      fraudRiskLevel: "low",
      totalLossIndicated: 0,
      structuralDamageSeverity: "none"
    });
    
    await db.update(claims).set({ 
      aiAssessmentCompleted: 1,
      updatedAt: new Date().toISOString() 
    }).where(eq(claims.id, claimId));
    
    return { success: true, message: "Placeholder assessment created. Please upload damage photos for full analysis." };
  }

  // Import LLM helper for vision analysis
  const { invokeLLM } = await import("./_core/llm");

  // Analyze damage photos with AI vision
  const analysisPrompt = `You are an expert auto insurance damage assessor with expertise in accident reconstruction physics. Analyze these vehicle damage photos and provide:

**DAMAGE ASSESSMENT:**
1. Detailed damage description
2. List of damaged components with locations (front/rear/left/right/undercarriage)
3. Damage severity for each component (minor/moderate/severe/total_loss)
4. Damage type for each component (cosmetic/structural/mechanical/electrical)

**PHYSICAL MEASUREMENTS (Critical for physics validation):**
5. Maximum crush depth in meters (estimate from visible deformation - typical ranges: 0.05-0.15m minor, 0.15-0.35m moderate, 0.35-0.6m severe)
   - Use reference objects for scale (wheels typically 40-50cm diameter, license plates 30cm wide)
   - Estimate depth relative to visible undamaged portions
   - Provide confidence score (0-100) for this measurement
6. Total damaged area in square meters
7. Structural damage present (yes/no - frame rails, pillars, crumple zones)
8. Airbag deployment visible (yes/no - look for deployed airbags in photos)
9. Impact point location (front_center/front_left/front_right/rear_center/rear_left/rear_right/side_left/side_right/undercarriage)
10. Accident type classification (frontal/rear/side_driver/side_passenger/rollover/multi_impact)

**IMAGE QUALITY ASSESSMENT:**
11. Reference objects detected (wheels/license_plates/door_handles/headlights - helps with scale calibration)
12. Photo angles available (front/rear/side/overhead/interior)
13. Image quality score (0-100 based on lighting, focus, resolution, angle coverage)
14. Scale calibration confidence (0-100 based on reference objects visible)
15. Recommend re-submission (yes/no - if photos are insufficient for accurate measurement)

**ADVANCED PHYSICS MEASUREMENTS (for multi-vehicle, skid marks, rollover analysis):**
16. Multi-vehicle data (if applicable):
    - Vehicle displacement from impact point (meters) - measure from debris field, final positions
    - Other vehicle visible (yes/no)
    - Relative damage severity (which vehicle has more damage)
17. Skid mark data:
    - Skid marks visible (yes/no)
    - Skid mark length (meters) - measure from photos or police diagram
    - Skid mark pattern (straight/curved/ABS_pattern/none)
    - Road surface type visible (asphalt/concrete/gravel/dirt)
    - Weather conditions visible (dry/wet/puddles/snow/ice)
18. Post-collision movement:
    - Rollout distance from impact point (meters) - measure from debris trail, tire marks
    - Debris trail length (meters)
    - Vehicle final orientation (degrees from impact direction)
19. Rollover evidence:
    - Roof damage present (yes/no)
    - Pillar deformation severity (none/minor/moderate/severe)
    - Side window damage pattern
    - Road embankment visible (yes/no)
    - Terrain type (flat/banked/embankment/ditch)

**MISSING DATA FLAGS (for site visit recommendations):**
20. Critical measurements missing (list what cannot be determined from photos)
21. Site visit recommended (yes/no - if critical data missing and claim value >$5000)
22. Site visit priority (low/medium/high/critical)
23. Measurements needed at site (list specific measurements assessor should take)

**COST ESTIMATES:**
24. Estimated repair cost in USD
25. Labor cost estimate
26. Parts cost estimate

**FRAUD INDICATORS:**
27. Fraud risk score (0-100)
28. Specific fraud indicators detected (array of strings)

Provide your response in JSON format.`;

  console.log(`[AI Assessment] Analyzing ${damagePhotos.length} photos for claim ${claimId}...`);
  
  // Download and base64-encode images with proper MIME types for Bedrock/Claude
  const imageContents = await Promise.all(
    damagePhotos.slice(0, 3).map(async (urlOrText) => {
      try {
        // Extract actual CDN URL from manus-upload-file output if needed
        let url = urlOrText;
        if (urlOrText.includes('CDN URL:')) {
          const match = urlOrText.match(/CDN URL:\s*(.+?)$/m);
          if (match) {
            url = match[1].trim();
          }
        }
        
        console.log(`[AI Assessment] Fetching image: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        
        // Determine MIME type from URL extension
        let mimeType = 'image/jpeg'; // default
        if (url.toLowerCase().endsWith('.png')) mimeType = 'image/png';
        else if (url.toLowerCase().endsWith('.gif')) mimeType = 'image/gif';
        else if (url.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';
        
        return {
          type: "image_url" as const,
          image_url: {
            url: `data:${mimeType};base64,${base64}`,
            detail: "high" as const
          }
        };
      } catch (error) {
        console.error(`Failed to process image ${urlOrText}:`, error);
        throw error;
      }
    })
  );
  
  const response = await invokeLLM({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: analysisPrompt },
          ...imageContents
        ]
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "damage_assessment",
        strict: true,
        schema: {
          type: "object",
          properties: {
            damageDescription: { type: "string" },
            damagedComponents: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  location: { type: "string" },
                  damageType: { type: "string", enum: ["cosmetic", "structural", "mechanical", "electrical"] },
                  severity: { type: "string", enum: ["minor", "moderate", "severe", "total_loss"] }
                },
                required: ["name", "location", "damageType", "severity"],
                additionalProperties: false
              }
            },
            maxCrushDepth: { type: "number" },
            crushDepthConfidence: { type: "number" },
            totalDamageArea: { type: "number" },
            structuralDamage: { type: "boolean" },
            airbagDeployment: { type: "boolean" },
            impactPoint: { type: "string" },
            accidentType: { type: "string", enum: ["frontal", "rear", "side_driver", "side_passenger", "rollover", "multi_impact", "unknown"] },
            referenceObjectsDetected: { type: "array", items: { type: "string" } },
            photoAnglesAvailable: { type: "array", items: { type: "string" } },
            imageQualityScore: { type: "number" },
            scaleCalibrationConfidence: { type: "number" },
            recommendResubmission: { type: "boolean" },
            // Advanced physics measurements
            multiVehicleData: {
              type: "object",
              properties: {
                vehicleDisplacement: { type: "number" },
                otherVehicleVisible: { type: "boolean" },
                relativeDamageSeverity: { type: "string" }
              },
              required: ["vehicleDisplacement", "otherVehicleVisible", "relativeDamageSeverity"],
              additionalProperties: false
            },
            skidMarkData: {
              type: "object",
              properties: {
                skidMarksVisible: { type: "boolean" },
                skidMarkLength: { type: "number" },
                skidMarkPattern: { type: "string", enum: ["straight", "curved", "ABS_pattern", "none"] },
                roadSurfaceType: { type: "string", enum: ["asphalt", "concrete", "gravel", "dirt", "unknown"] },
                weatherConditions: { type: "string", enum: ["dry", "wet", "puddles", "snow", "ice", "unknown"] }
              },
              required: ["skidMarksVisible", "skidMarkLength", "skidMarkPattern", "roadSurfaceType", "weatherConditions"],
              additionalProperties: false
            },
            postCollisionMovement: {
              type: "object",
              properties: {
                rolloutDistance: { type: "number" },
                debrisTrailLength: { type: "number" },
                vehicleFinalOrientation: { type: "number" }
              },
              required: ["rolloutDistance", "debrisTrailLength", "vehicleFinalOrientation"],
              additionalProperties: false
            },
            rolloverEvidence: {
              type: "object",
              properties: {
                roofDamagePresent: { type: "boolean" },
                pillarDeformation: { type: "string", enum: ["none", "minor", "moderate", "severe"] },
                sideWindowDamage: { type: "string" },
                roadEmbankmentVisible: { type: "boolean" },
                terrainType: { type: "string", enum: ["flat", "banked", "embankment", "ditch", "unknown"] }
              },
              required: ["roofDamagePresent", "pillarDeformation", "sideWindowDamage", "roadEmbankmentVisible", "terrainType"],
              additionalProperties: false
            },
            // Site visit recommendations
            missingDataFlags: {
              type: "object",
              properties: {
                criticalMeasurementsMissing: { type: "array", items: { type: "string" } },
                siteVisitRecommended: { type: "boolean" },
                siteVisitPriority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                measurementsNeededAtSite: { type: "array", items: { type: "string" } }
              },
              required: ["criticalMeasurementsMissing", "siteVisitRecommended", "siteVisitPriority", "measurementsNeededAtSite"],
              additionalProperties: false
            },
            estimatedCost: { type: "number" },
            laborCost: { type: "number" },
            partsCost: { type: "number" },
            fraudRiskScore: { type: "number" },
            fraudIndicators: { type: "array", items: { type: "string" } }
          },
          required: ["damageDescription", "damagedComponents", "maxCrushDepth", "crushDepthConfidence", "totalDamageArea", "structuralDamage", "airbagDeployment", "impactPoint", "accidentType", "referenceObjectsDetected", "photoAnglesAvailable", "imageQualityScore", "scaleCalibrationConfidence", "recommendResubmission", "multiVehicleData", "skidMarkData", "postCollisionMovement", "rolloverEvidence", "missingDataFlags", "estimatedCost", "laborCost", "partsCost", "fraudRiskScore", "fraudIndicators"],
          additionalProperties: false
        }
      }
    }
  });

  console.log('[AI Assessment] LLM response received:', JSON.stringify(response, null, 2).substring(0, 500));
  
  if (!response || !response.choices || response.choices.length === 0) {
    throw new Error(`LLM API returned invalid response: ${JSON.stringify(response)}`);
  }

  const messageContent = response.choices[0]?.message?.content;
  if (!messageContent) {
    throw new Error(`LLM API returned empty message content`);
  }
  
  const analysis = typeof messageContent === 'string' ? JSON.parse(messageContent) : {};

  // ========== TOTAL LOSS DETECTION LOGIC ==========
  const damagedComponents = analysis.damagedComponents || [];
  
  // Check for total loss indicators
  const hasComponentMarkedTotalLoss = damagedComponents.some((c: any) => c.severity === 'total_loss');
  const structuralComponents = damagedComponents.filter((c: any) => c.damageType === 'structural');
  const severeStructuralDamage = structuralComponents.some((c: any) => c.severity === 'severe' || c.severity === 'total_loss');
  const catastrophicStructuralDamage = structuralComponents.filter((c: any) => c.severity === 'total_loss').length > 0;
  const extensiveDamage = damagedComponents.length >= 7; // 7+ components damaged
  const multipleCriticalSystems = damagedComponents.filter((c: any) => 
    c.damageType === 'structural' || c.damageType === 'mechanical'
  ).length >= 3;
  
  // Determine structural damage severity
  let structuralDamageSeverity: 'none' | 'minor' | 'moderate' | 'severe' | 'catastrophic' = 'none';
  if (catastrophicStructuralDamage) {
    structuralDamageSeverity = 'catastrophic';
  } else if (severeStructuralDamage) {
    structuralDamageSeverity = 'severe';
  } else if (structuralComponents.length > 0) {
    const maxSeverity = Math.max(...structuralComponents.map((c: any) => 
      c.severity === 'severe' ? 3 : c.severity === 'moderate' ? 2 : 1
    ));
    structuralDamageSeverity = maxSeverity === 3 ? 'severe' : maxSeverity === 2 ? 'moderate' : 'minor';
  }
  
  // Estimate vehicle value based on make/model/year (Zimbabwean market)
  const vehicleAge = claim.vehicleYear ? new Date().getFullYear() - claim.vehicleYear : 10;
  let estimatedVehicleValue = 500000; // Default $5000 in cents
  
  // Zimbabwean market vehicle valuations (rough estimates in cents)
  const vehicleKey = `${claim.vehicleMake?.toLowerCase()} ${claim.vehicleModel?.toLowerCase()}`;
  const vehicleValues: Record<string, number> = {
    'honda fit': 350000, // $3500
    'toyota hilux': 1500000, // $15000
    'nissan np300': 800000, // $8000
    'toyota camry': 600000, // $6000
    'mercedes benz': 1200000, // $12000
  };
  
  for (const [key, value] of Object.entries(vehicleValues)) {
    if (vehicleKey.includes(key)) {
      estimatedVehicleValue = value;
      break;
    }
  }
  
  // Apply depreciation (10% per year, max 80% depreciation)
  const depreciationFactor = Math.max(0.2, 1 - (vehicleAge * 0.1));
  estimatedVehicleValue = Math.round(estimatedVehicleValue * depreciationFactor);
  
  // Calculate repair-to-value ratio
  const estimatedRepairCost = Math.round(analysis.estimatedCost || 0);
  const repairToValueRatio = estimatedVehicleValue > 0 
    ? Math.round((estimatedRepairCost / estimatedVehicleValue) * 100)
    : 0;
  
  // Determine if total loss
  const totalLossThreshold = 60; // 60% of vehicle value
  const totalLossIndicated = 
    hasComponentMarkedTotalLoss ||
    structuralDamageSeverity === 'catastrophic' ||
    structuralDamageSeverity === 'severe' ||
    repairToValueRatio > totalLossThreshold ||
    (extensiveDamage && multipleCriticalSystems && structuralDamageSeverity !== 'none');
  
  // Generate total loss reasoning
  let totalLossReasoning = '';
  if (totalLossIndicated) {
    const reasons = [];
    if (hasComponentMarkedTotalLoss) reasons.push('Component(s) marked as total loss by AI vision analysis');
    if (structuralDamageSeverity === 'catastrophic') reasons.push('Catastrophic structural damage detected');
    if (structuralDamageSeverity === 'severe') reasons.push('Severe structural damage to chassis/frame');
    if (repairToValueRatio > totalLossThreshold) reasons.push(`Repair cost (${repairToValueRatio}%) exceeds ${totalLossThreshold}% of vehicle value`);
    if (extensiveDamage && multipleCriticalSystems) reasons.push(`Extensive damage: ${damagedComponents.length} components affected across multiple critical systems`);
    if (analysis.airbagDeployment) reasons.push('Airbag deployment detected');
    
    totalLossReasoning = reasons.join('; ');
  }

  // ========== IMAGE QUALITY VALIDATION ==========
  // Check if photos are sufficient for accurate measurement
  const imageQuality = {
    score: analysis.imageQualityScore || 0,
    scaleConfidence: analysis.scaleCalibrationConfidence || 0,
    referenceObjects: analysis.referenceObjectsDetected || [],
    photoAngles: analysis.photoAnglesAvailable || [],
    recommendResubmission: analysis.recommendResubmission || false,
    crushDepthConfidence: analysis.crushDepthConfidence || 0,
  };

  // Flag low-quality photos for re-submission
  if (imageQuality.recommendResubmission || imageQuality.score < 60) {
    console.warn(`[AI Assessment] Low-quality photos detected for claim ${claimId}:`, {
      imageQualityScore: imageQuality.score,
      scaleConfidence: imageQuality.scaleConfidence,
      crushDepthConfidence: imageQuality.crushDepthConfidence,
      referenceObjects: imageQuality.referenceObjects.length,
      photoAngles: imageQuality.photoAngles.length,
    });
    // TODO: Send notification to claimant requesting better photos
  }

  // Create AI assessment record with total loss detection
  await createAiAssessment({
    claimId,
    damageDescription: analysis.damageDescription || "AI analysis completed",
    estimatedCost: estimatedRepairCost,
    fraudIndicators: JSON.stringify(analysis.fraudIndicators || []),
    fraudRiskLevel: analysis.fraudRiskScore > 70 ? "high" : analysis.fraudRiskScore > 40 ? "medium" : "low",
    confidenceScore: 85, // Default confidence score
    modelVersion: "gpt-4-vision-v1",
    totalLossIndicated: totalLossIndicated ? 1 : 0,
    structuralDamageSeverity,
    estimatedVehicleValue,
    repairToValueRatio,
    totalLossReasoning: totalLossReasoning || null,
    damagedComponentsJson: JSON.stringify(damagedComponents),
  });

  // ========== PHYSICS-BASED ACCIDENT RECONSTRUCTION ==========
  // Import physics engine and forensic analysis
  const { analyzeAccidentPhysics, validateQuoteAgainstPhysics } = await import("./accidentPhysics");
  const { performForensicAnalysis } = await import("./forensicAnalysis");
  
  // Prepare vehicle data
  const vehicleData = {
    mass: 1500, // Default mass in kg, should be looked up from vehicle database
    make: claim.vehicleMake || "Unknown",
    model: claim.vehicleModel || "Unknown",
    year: claim.vehicleYear || 2020,
    vehicleType: "sedan" as const, // Default, should be determined from make/model
    powertrainType: "ice" as const, // Default ICE, should be determined from make/model/year
  };
  
  // Prepare accident data using AI-extracted information
  const accidentType = analysis.accidentType || "unknown";
  const accidentData = {
    accidentType: accidentType as "frontal" | "rear" | "side_driver" | "side_passenger" | "rollover" | "multi_impact" | "unknown",
    damagePhotos,
    incidentDescription: claim.incidentDescription || "No description provided",
    impactPoint: analysis.impactPoint as any,
  };
  
  // Prepare damage assessment from AI vision analysis
  const damageAssessment = {
    damagedComponents: (analysis.damagedComponents || []).map((comp: any, index: number) => ({
      name: comp.name,
      location: comp.location,
      damageType: comp.damageType,
      severity: comp.severity,
      visible: true,
      distanceFromImpact: index * 0.5, // Approximate distance based on order
    })),
    totalDamageArea: analysis.totalDamageArea || 0,
    maxCrushDepth: analysis.maxCrushDepth || 0.1, // Use AI-extracted crush depth
    structuralDamage: analysis.structuralDamage || false,
    airbagDeployment: analysis.airbagDeployment || false,
  };
  
  // Run physics analysis and forensic analysis
  let physicsAnalysis;
  let forensicAnalysis;
  try {
    physicsAnalysis = await analyzeAccidentPhysics(vehicleData, accidentData, damageAssessment);
    
    // Run forensic analysis
    const currentYear = new Date().getFullYear();
    const vehicleAge = claim.vehicleYear ? currentYear - claim.vehicleYear : 5;
    
    forensicAnalysis = await performForensicAnalysis({
      damagePhotos,
      vehicleAge,
      vehicleMileage: 50000, // Default mileage, should be added to claims table
      vehicleValue: analysis.estimatedCost * 10, // Rough estimate, should be looked up
      claimedDamageDescription: claim.incidentDescription || "",
      accidentDate: claim.incidentDate || new Date(),
      accidentLocation: { lat: 0, lon: 0 }, // Should parse from incidentLocation
    });
    
    // Physics analysis results are used for fraud scoring
    // TODO: Add physicsAnalysis column to aiAssessments table to store full results
    
    // Update fraud risk based on physics inconsistencies and forensic findings
    const physicsFraudScore = physicsAnalysis.fraudIndicators.impossibleDamagePatterns.length * 20 +
                               physicsAnalysis.fraudIndicators.unrelatedDamage.length * 15 +
                               (physicsAnalysis.fraudIndicators.severityMismatch ? 25 : 0) +
                               physicsAnalysis.fraudIndicators.stagedAccidentIndicators.length * 20;
    
    const forensicFraudScore = forensicAnalysis.overallFraudScore;
    
    // ========== ENHANCED ML FRAUD DETECTION ==========
    // Run enhanced ML fraud detection with driver demographics and ownership verification
    let mlFraudResult;
    try {
      const { predictEnhancedFraud, extractFraudInputFromClaim } = await import("./fraud-detection-enhanced");
      
      const fraudInput = extractFraudInputFromClaim(claim, {
        estimatedCost: estimatedRepairCost,
        estimatedVehicleValue,
        physicsAnalysis,
      });
      
      // Add physics and forensic scores to input
      fraudInput.physics_validation_score = physicsFraudScore > 50 ? 0.3 : 0.8;
      fraudInput.image_forensics_score = forensicFraudScore > 50 ? 0.3 : 0.8;
      
      mlFraudResult = await predictEnhancedFraud(fraudInput);
      
      console.log(`[Enhanced ML Fraud Detection] Claim ${claimId}:`, {
        ml_fraud_score: mlFraudResult.ml_fraud_score,
        ownership_risk_score: mlFraudResult.ownership_risk_score,
        staged_accident_confidence: mlFraudResult.staged_accident_indicators.confidence,
        risk_level: mlFraudResult.risk_level,
      });
      
    } catch (error) {
      console.error("Enhanced ML fraud detection failed:", error);
      mlFraudResult = null;
    }
    
    // Combine all fraud scores: AI vision, physics, forensic, and ML
    let combinedFraudScore;
    if (mlFraudResult) {
      // Use ML model as primary score, weighted with other indicators
      combinedFraudScore = Math.round(
        mlFraudResult.fraud_probability * 40 +  // ML model (40%)
        physicsFraudScore * 0.25 +              // Physics (25%)
        forensicFraudScore * 0.25 +             // Forensics (25%)
        analysis.fraudRiskScore * 0.10          // AI vision (10%)
      );
    } else {
      // Fallback to original scoring if ML fails
      combinedFraudScore = Math.min(100, Math.max(analysis.fraudRiskScore, physicsFraudScore, forensicFraudScore));
    }
    
    const combinedFraudLevel = combinedFraudScore > 70 ? "high" : combinedFraudScore > 40 ? "medium" : "low";
    
    // Compile all fraud flags
    const allFraudFlags = [
      ...analysis.fraudIndicators,
      ...physicsAnalysis.fraudIndicators.impossibleDamagePatterns,
      ...physicsAnalysis.fraudIndicators.unrelatedDamage,
      ...physicsAnalysis.fraudIndicators.stagedAccidentIndicators,
    ];
    
    if (mlFraudResult) {
      allFraudFlags.push(...mlFraudResult.ownership_analysis.risk_factors);
      allFraudFlags.push(...mlFraudResult.staged_accident_indicators.indicators);
      if (mlFraudResult.top_risk_factors) {
        allFraudFlags.push(...mlFraudResult.top_risk_factors);
      }
    }
    
    // Update claim with enhanced fraud assessment
    // TODO: Uncomment ML fraud scores after running `pnpm db:push` to update TypeScript types
    await db.update(claims).set({ 
      aiAssessmentCompleted: 1,
      fraudRiskScore: combinedFraudScore,
      fraudFlags: JSON.stringify(allFraudFlags),
      // mlFraudScore: mlFraudResult && mlFraudResult.ml_fraud_score ? String(mlFraudResult.ml_fraud_score) : null,
      // ownershipRiskScore: mlFraudResult ? String(mlFraudResult.ownership_risk_score) : null,
      // stagedAccidentConfidence: mlFraudResult ? String(mlFraudResult.staged_accident_indicators.confidence) : null,
      // fraudAnalysisJson: mlFraudResult ? JSON.stringify(mlFraudResult) : null,
      updatedAt: new Date().toISOString() 
    }).where(eq(claims.id, claimId));
    
    // Calculate physics deviation score for fraud detection
    const { calculatePhysicsDeviationScore, parsePhysicsAnalysis: parsePhysics } = await import("./physics-deviation-calculator");
    
    const claimData = {
      declaredImpactAngle: undefined, // TODO: Add to claims table if claimants provide this
      declaredSeverity: structuralDamageSeverity, // Use AI-detected severity as proxy
      declaredDamageLocation: analysis.impactPoint?.primaryImpactZone,
    };
    
    const physicsDeviationScore = calculatePhysicsDeviationScore(physicsAnalysis, claimData);
    
    console.log(`[Physics Deviation] Claim ${claimId}: Score = ${physicsDeviationScore}, Risk = ${physicsDeviationScore && physicsDeviationScore >= 70 ? 'HIGH' : physicsDeviationScore && physicsDeviationScore >= 40 ? 'MEDIUM' : 'LOW'}`);
    
    // Update AI assessment with combined fraud level, physics analysis, and deviation score
    await db.update(aiAssessments).set({
      fraudRiskLevel: combinedFraudLevel,
      physicsAnalysis: JSON.stringify(physicsAnalysis),
      physicsDeviationScore,
      updatedAt: new Date().toISOString(),
    }).where(eq(aiAssessments.claimId, claimId));
    
    // Generate visualization graphs
    try {
      const { generateClaimGraphs } = await import("./graph-generation");
      
      // Prepare damage components data
      const damageComponents: Record<string, number> = {};
      analysis.damagedComponents.forEach((component: any) => {
        damageComponents[component.name] = component.estimatedCost || 0;
      });
      
      // Generate graphs
      const graphs = await generateClaimGraphs({
        claimId,
        claimNumber: claim.claimNumber,
        vehicleInfo: {
          make: claim.vehicleMake || "Unknown",
          model: claim.vehicleModel || "Unknown",
          registration: claim.vehicleRegistration || "Unknown",
        },
        damageComponents,
        costComparison: {
          aiAssessment: analysis.estimatedCost || 0,
          panelBeaterQuotes: [], // Will be populated when quotes are submitted
        },
        fraudRiskScore: combinedFraudScore,
        physicsData: {
          impactForceKn: (physicsAnalysis.impactForce?.magnitude || physicsAnalysis.impactForce) as number || 45,
          estimatedSpeedKmh: ((physicsAnalysis as any).speedEstimate?.estimatedSpeedKmh || (physicsAnalysis as any).estimatedSpeedKmh) || 35,
          damageSeverity: analysis.structuralDamageSeverity || "moderate",
        },
      });
      
      // Store graph URLs in AI assessment
      await db.update(aiAssessments).set({
        graphUrls: JSON.stringify(graphs),
        updatedAt: new Date().toISOString(),
      }).where(eq(aiAssessments.claimId, claimId));
      
      console.log(`[AI Assessment] Generated visualization graphs for claim ${claim.claimNumber}`);
    } catch (error) {
      console.error("Graph generation failed:", error);
      // Continue without graphs if generation fails
    }
    
  } catch (error) {
    console.error("Physics analysis failed:", error);
    // Continue without physics analysis if it fails
    await db.update(claims).set({ 
      aiAssessmentCompleted: 1,
      fraudRiskScore: analysis.fraudRiskScore || 0,
      fraudFlags: JSON.stringify(analysis.fraudIndicators || []),
      updatedAt: new Date().toISOString() 
    }).where(eq(claims.id, claimId));
  }
}

// ============================================================================
// AI ASSESSMENT OPERATIONS
// ============================================================================

export async function createAiAssessment(data: InsertAiAssessment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(aiAssessments).values(data);
  
  // Mark claim as AI assessment completed
  await db.update(claims).set({ 
    aiAssessmentCompleted: 1,
    updatedAt: new Date().toISOString() 
  }).where(eq(claims.id, data.claimId));
  
  return result;
}

export async function getAiAssessmentByClaimId(claimId: number, tenantId?: string) {
  const { parsePhysicsAnalysis } = await import('../shared/physics-types');
  const db = await getDb();
  if (!db) return null;

  let rawAssessment;
  if (tenantId) {
    // Join with claims to enforce tenant filtering
    const result = await db.select({ assessment: aiAssessments })
      .from(aiAssessments)
      .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
      .where(and(eq(aiAssessments.claimId, claimId), eq(claims.tenantId, tenantId)))
      .limit(1);
    rawAssessment = result.length > 0 ? result[0].assessment : null;
  } else {
    const result = await db.select().from(aiAssessments).where(eq(aiAssessments.claimId, claimId)).limit(1);
    rawAssessment = result.length > 0 ? result[0] : null;
  }
  
  if (!rawAssessment) return null;
  
  // Parse physicsAnalysis JSON with typed helper
  return {
    ...rawAssessment,
    physicsAnalysisParsed: parsePhysicsAnalysis(rawAssessment.physicsAnalysis),
  };
}

// ============================================================================
// ASSESSOR EVALUATION OPERATIONS
// ============================================================================

export async function createAssessorEvaluation(data: InsertAssessorEvaluation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(assessorEvaluations).values(data);
  return result;
}

export async function getAssessorEvaluationByClaimId(claimId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return null;

  if (tenantId) {
    // Join with claims to enforce tenant filtering
    const result = await db.select({ evaluation: assessorEvaluations })
      .from(assessorEvaluations)
      .innerJoin(claims, eq(assessorEvaluations.claimId, claims.id))
      .where(and(eq(assessorEvaluations.claimId, claimId), eq(claims.tenantId, tenantId)))
      .limit(1);
    return result.length > 0 ? result[0].evaluation : null;
  } else {
    const result = await db.select().from(assessorEvaluations).where(eq(assessorEvaluations.claimId, claimId)).limit(1);
    return result.length > 0 ? result[0] : null;
  }
}

export async function updateAssessorEvaluation(id: number, data: Partial<InsertAssessorEvaluation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(assessorEvaluations).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(assessorEvaluations.id, id));
}

// ============================================================================
// PANEL BEATER QUOTE OPERATIONS
// ============================================================================

export async function createPanelBeaterQuote(data: InsertPanelBeaterQuote) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(panelBeaterQuotes).values(data);
  return result;
}

export async function getQuotesByClaimId(claimId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  if (tenantId) {
    // Join with claims to enforce tenant filtering
    const result = await db.select({ quote: panelBeaterQuotes })
      .from(panelBeaterQuotes)
      .innerJoin(claims, eq(panelBeaterQuotes.claimId, claims.id))
      .where(and(eq(panelBeaterQuotes.claimId, claimId), eq(claims.tenantId, tenantId)));
    return result.map(r => r.quote);
  } else {
    return await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, claimId));
  }
}

export async function getQuoteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateQuote(id: number, data: Partial<InsertPanelBeaterQuote>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(panelBeaterQuotes).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(panelBeaterQuotes.id, id));
}

export async function getQuotesByPanelBeater(panelBeaterId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  if (tenantId) {
    // Join with claims to enforce tenant filtering
    const result = await db.select({ quote: panelBeaterQuotes })
      .from(panelBeaterQuotes)
      .innerJoin(claims, eq(panelBeaterQuotes.claimId, claims.id))
      .where(and(eq(panelBeaterQuotes.panelBeaterId, panelBeaterId), eq(claims.tenantId, tenantId)))
      .orderBy(desc(panelBeaterQuotes.createdAt));
    return result.map(r => r.quote);
  } else {
    return await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.panelBeaterId, panelBeaterId)).orderBy(desc(panelBeaterQuotes.createdAt));
  }
}

// ============================================================================
// APPOINTMENT OPERATIONS
// ============================================================================

export async function createAppointment(data: InsertAppointment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(appointments).values(data);
  return result;
}

export async function getAppointmentsByAssessor(assessorId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(appointments).where(eq(appointments.assessorId, assessorId)).orderBy(desc(appointments.scheduledDate));
}

export async function getAppointmentsByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(appointments).where(eq(appointments.claimId, claimId)).orderBy(desc(appointments.scheduledDate));
}

export async function updateAppointmentStatus(id: number, status: typeof appointments.$inferSelect.status) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(appointments).set({ status, updatedAt: new Date().toISOString() }).where(eq(appointments.id, id));
}

// ============================================================================
// AUDIT TRAIL OPERATIONS
// ============================================================================

export async function createAuditEntry(data: InsertAuditTrailEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(auditTrail).values(data);
  return result;
}

export async function getAuditTrailByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(auditTrail).where(eq(auditTrail.claimId, claimId)).orderBy(desc(auditTrail.createdAt));
}

export async function getAuditTrailByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(auditTrail).where(eq(auditTrail.userId, userId)).orderBy(desc(auditTrail.createdAt));
}

// ============================================================================
// NOTIFICATION OPERATIONS
// ============================================================================

/**
 * Create a new notification for a user
 * @param data - Notification data
 * @returns Created notification result
 */
export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(notifications).values(data);
  return result;
}

/**
 * Get all notifications for a specific user
 * @param userId - User ID
 * @param limit - Maximum number of notifications to return (default: 50)
 * @returns Array of notifications ordered by creation date (newest first)
 */
export async function getNotificationsByUser(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/**
 * Get unread notification count for a user
 * @param userId - User ID
 * @returns Count of unread notifications
 */
export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select()
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, 0)
    ));

  return result.length;
}

/**
 * Mark a notification as read
 * @param id - Notification ID
 */
export async function markNotificationAsRead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(notifications)
    .set({ 
      isRead: 1, 
      readAt: new Date() 
    })
    .where(eq(notifications.id, id));
}

/**
 * Mark all notifications as read for a user
 * @param userId - User ID
 */
export async function markAllNotificationsAsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(notifications)
    .set({ 
      isRead: 1, 
      readAt: new Date() 
    })
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, 0)
    ));
}

/**
 * Delete a notification
 * @param id - Notification ID
 */
export async function deleteNotification(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(notifications).where(eq(notifications.id, id));
}

/**
 * Delete old read notifications (older than 30 days)
 * Used for periodic cleanup
 */
export async function deleteOldNotifications() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  await db
    .delete(notifications)
    .where(and(
      eq(notifications.isRead, 1)
      // Note: Would need to add date comparison here if supported
    ));
}


// ============================================================================
// QUOTE LINE ITEMS OPERATIONS
// ============================================================================

/**
 * Create quote line items for a quote
 * @param items - Array of line items to create
 */
export async function createQuoteLineItems(items: InsertQuoteLineItem[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(quoteLineItems).values(items);
}

/**
 * Get all line items for a quote
 * @param quoteId - Quote ID
 */
export async function getQuoteLineItemsByQuoteId(quoteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(quoteLineItems)
    .where(eq(quoteLineItems.quoteId, quoteId))
    .orderBy(quoteLineItems.itemNumber);
}

/**
 * Update a quote line item
 * @param id - Line item ID
 * @param data - Updated data
 */
export async function updateQuoteLineItem(id: number, data: Partial<InsertQuoteLineItem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(quoteLineItems)
    .set(data)
    .where(eq(quoteLineItems.id, id));
}

// ============================================================================
// THIRD PARTY VEHICLES OPERATIONS
// ============================================================================

/**
 * Create a third party vehicle record
 * @param data - Third party vehicle data
 */
export async function createThirdPartyVehicle(data: InsertThirdPartyVehicle) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(thirdPartyVehicles).values(data);
  return result.insertId;
}

/**
 * Get third party vehicle by claim ID
 * @param claimId - Claim ID
 */
export async function getThirdPartyVehicleByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [vehicle] = await db
    .select()
    .from(thirdPartyVehicles)
    .where(eq(thirdPartyVehicles.claimId, claimId))
    .limit(1);

  return vehicle || null;
}

/**
 * Update third party vehicle
 * @param id - Vehicle ID
 * @param data - Updated data
 */
export async function updateThirdPartyVehicle(id: number, data: Partial<InsertThirdPartyVehicle>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(thirdPartyVehicles)
    .set(data)
    .where(eq(thirdPartyVehicles.id, id));
}

// ============================================================================
// VEHICLE MARKET VALUATIONS OPERATIONS
// ============================================================================

/**
 * Create a vehicle market valuation
 * @param data - Valuation data
 */
export async function createVehicleMarketValuation(data: InsertVehicleMarketValuation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(vehicleMarketValuations).values(data);
  return result.insertId;
}

/**
 * Get vehicle market valuation by claim ID
 * @param claimId - Claim ID
 */
export async function getVehicleMarketValuationByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [valuation] = await db
    .select()
    .from(vehicleMarketValuations)
    .where(eq(vehicleMarketValuations.claimId, claimId))
    .orderBy(desc(vehicleMarketValuations.createdAt))
    .limit(1);

  return valuation || null;
}

/**
 * Update vehicle market valuation
 * @param id - Valuation ID
 * @param data - Updated data
 */
export async function updateVehicleMarketValuation(id: number, data: Partial<InsertVehicleMarketValuation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(vehicleMarketValuations)
    .set(data)
    .where(eq(vehicleMarketValuations.id, id));
}

// ============================================================================
// POLICE REPORTS OPERATIONS
// ============================================================================

/**
 * Create a police report
 * @param data - Police report data
 */
export async function createPoliceReport(data: InsertPoliceReport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(policeReports).values(data);
  return result.insertId;
}

/**
 * Get police report by claim ID
 * @param claimId - Claim ID
 */
export async function getPoliceReportByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [report] = await db
    .select()
    .from(policeReports)
    .where(eq(policeReports.claimId, claimId))
    .limit(1);

  return report || null;
}

/**
 * Update police report
 * @param id - Report ID
 * @param data - Updated data
 */
export async function updatePoliceReport(id: number, data: Partial<InsertPoliceReport>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(policeReports)
    .set(data)
    .where(eq(policeReports.id, id));
}

// ============================================================================
// PRE-ACCIDENT DAMAGE OPERATIONS
// ============================================================================

/**
 * Create pre-accident damage records
 * @param data - Damage data (single or array)
 */
export async function createPreAccidentDamage(data: InsertPreAccidentDamage | InsertPreAccidentDamage[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const items = Array.isArray(data) ? data : [data];
  await db.insert(preAccidentDamage).values(items);
}

/**
 * Get all pre-accident damage for a claim
 * @param claimId - Claim ID
 */
export async function getPreAccidentDamageByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(preAccidentDamage)
    .where(eq(preAccidentDamage.claimId, claimId));
}

// ============================================================================
// VEHICLE CONDITION ASSESSMENT OPERATIONS
// ============================================================================

/**
 * Create a vehicle condition assessment
 * @param data - Assessment data
 */
export async function createVehicleConditionAssessment(data: InsertVehicleConditionAssessment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(vehicleConditionAssessment).values(data);
  return result.insertId;
}

/**
 * Get vehicle condition assessment by claim ID
 * @param claimId - Claim ID
 */
export async function getVehicleConditionAssessmentByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [assessment] = await db
    .select()
    .from(vehicleConditionAssessment)
    .where(eq(vehicleConditionAssessment.claimId, claimId))
    .limit(1);

  return assessment || null;
}

/**
 * Update vehicle condition assessment
 * @param id - Assessment ID
 * @param data - Updated data
 */
export async function updateVehicleConditionAssessment(id: number, data: Partial<InsertVehicleConditionAssessment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(vehicleConditionAssessment)
    .set(data)
    .where(eq(vehicleConditionAssessment.id, id));
}

// ============================================================================
// APPROVAL WORKFLOW OPERATIONS
// ============================================================================

/**
 * Create approval workflow entries for a claim
 * @param data - Workflow data (single or array)
 */
export async function createApprovalWorkflow(data: InsertApprovalWorkflow | InsertApprovalWorkflow[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const items = Array.isArray(data) ? data : [data];
  await db.insert(approvalWorkflow).values(items);
}

/**
 * Get all approval workflow entries for a claim
 * @param claimId - Claim ID
 */
export async function getApprovalWorkflowByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(approvalWorkflow)
    .where(eq(approvalWorkflow.claimId, claimId))
    .orderBy(approvalWorkflow.levelOrder);
}

/**
 * Get pending approval for a specific level
 * @param claimId - Claim ID
 * @param level - Approval level
 */
export async function getPendingApprovalByLevel(
  claimId: number,
  level: 'assessor' | 'risk_surveyor' | 'risk_manager'
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [approval] = await db
    .select()
    .from(approvalWorkflow)
    .where(and(
      eq(approvalWorkflow.claimId, claimId),
      eq(approvalWorkflow.level, level),
      eq(approvalWorkflow.status, 'pending')
    ))
    .limit(1);

  return approval || null;
}

/**
 * Update approval workflow entry
 * @param id - Workflow ID
 * @param data - Updated data
 */
export async function updateApprovalWorkflow(id: number, data: Partial<InsertApprovalWorkflow>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(approvalWorkflow)
    .set(data)
    .where(eq(approvalWorkflow.id, id));
}

// ============================================================================
// ASSESSOR OPERATIONS
// ============================================================================

export async function createAssessor(data: typeof assessors.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(assessors).values(data);
  return result;
}

export async function getAssessorByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(assessors).where(eq(assessors.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAssessorById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(assessors).where(eq(assessors.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAssessorByLicenseNumber(licenseNumber: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(assessors).where(eq(assessors.professionalLicenseNumber, licenseNumber)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateAssessor(id: number, data: Partial<typeof assessors.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(assessors).set(data).where(eq(assessors.id, id));
}

export async function createAssessorInsurerRelationship(data: typeof assessorInsurerRelationships.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(assessorInsurerRelationships).values(data);
  return result;
}

export async function getAssessorsByTenant(tenantId: string) {
  const db = await getDb();
  if (!db) return [];

  const relationships = await db.select().from(assessorInsurerRelationships)
    .where(and(
      eq(assessorInsurerRelationships.tenantId, tenantId),
      eq(assessorInsurerRelationships.relationshipStatus, "active")
    ));

  if (relationships.length === 0) return [];

  const assessorIds = relationships.map(r => r.assessorId);
  const assessorList = await db.select().from(assessors).where(inArray(assessors.id, assessorIds));

  const userIds = assessorList.map(a => a.userId);
  const userList = await db.select().from(users).where(inArray(users.id, userIds));

  return assessorList.map(assessor => {
    const user = userList.find(u => u.id === assessor.userId);
    const relationship = relationships.find(r => r.assessorId === assessor.id);

    return {
      ...assessor,
      userName: user?.name,
      userEmail: user?.email,
      relationshipType: relationship?.relationshipType,
      totalAssignmentsCompleted: relationship?.totalAssignmentsCompleted || 0,
      performanceRating: relationship?.performanceRating,
      specializations: assessor.specializations ? JSON.parse(assessor.specializations) : [],
      certifications: assessor.certifications ? JSON.parse(assessor.certifications) : [],
      serviceRegions: assessor.serviceRegions ? JSON.parse(assessor.serviceRegions) : [],
    };
  });
}

export async function getMarketplaceAssessors(filters?: {
  serviceRegion?: string;
  specializations?: string[];
  minPerformanceScore?: number;
  minAverageRating?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(assessors)
    .where(and(
      eq(assessors.marketplaceEnabled, 1),
      eq(assessors.marketplaceStatus, "active"),
      eq(assessors.activeStatus, 1)
    ));

  const results = await query;

  // Apply filters
  let filtered = results;

  if (filters?.serviceRegion) {
    filtered = filtered.filter(a => {
      const regions = a.serviceRegions ? JSON.parse(a.serviceRegions) : [];
      return regions.includes(filters.serviceRegion);
    });
  }

  if (filters?.specializations && filters.specializations.length > 0) {
    filtered = filtered.filter(a => {
      const specs = a.specializations ? JSON.parse(a.specializations) : [];
      return filters.specializations!.some(s => specs.includes(s));
    });
  }

  if (filters?.minPerformanceScore) {
    filtered = filtered.filter(a => {
      const score = a.performanceScore ? parseFloat(a.performanceScore.toString()) : 0;
      return score >= filters.minPerformanceScore!;
    });
  }

  if (filters?.minAverageRating) {
    filtered = filtered.filter(a => {
      const rating = a.averageRating ? parseFloat(a.averageRating.toString()) : 0;
      return rating >= filters.minAverageRating!;
    });
  }

  return filtered.map(assessor => ({
    ...assessor,
    specializations: assessor.specializations ? JSON.parse(assessor.specializations) : [],
    certifications: assessor.certifications ? JSON.parse(assessor.certifications) : [],
    serviceRegions: assessor.serviceRegions ? JSON.parse(assessor.serviceRegions) : [],
  }));
}


// ============================================================================
// EVENT EMISSION
// ============================================================================

/**
 * Emit a claim event for workflow analytics and turnaround time tracking
 */
export async function emitClaimEvent(params: {
  claimId: number;
  eventType: string;
  userId?: number;
  userRole?: string;
  tenantId?: string;
  eventPayload?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Events] Cannot emit event: database not available");
    return;
  }

  try {
    await db.insert(claimEvents).values({
      claimId: params.claimId,
      eventType: params.eventType,
      userId: params.userId,
      userRole: params.userRole,
      tenantId: params.tenantId,
      eventPayload: params.eventPayload || null,
      emittedAt: new Date(),
    });
    
    console.log(`[Events] Emitted ${params.eventType} for claim ${params.claimId}`);
  } catch (error) {
    console.error(`[Events] Failed to emit ${params.eventType}:`, error);
    // Non-blocking: don't throw, just log
  }
}
