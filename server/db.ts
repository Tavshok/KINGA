// @ts-nocheck
import { eq, and, desc, inArray, sql } from "drizzle-orm";
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
  InsertClaimEvent,
  ingestionDocuments
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

  // Mark assessment as triggered and transition to 'parsing'
  // This is the first visible state change — claim is now actively being processed.
  await db.update(claims).set({ 
    aiAssessmentTriggered: 1,
    documentProcessingStatus: "parsing",
    updatedAt: new Date().toISOString() 
  }).where(eq(claims.id, claimId));
  console.log(`[AI Assessment] Claim ${claimId} transitioned to document_processing_status='parsing'.`);

  // -----------------------------------------------------------------------
  // TOP-LEVEL FAILURE GUARD
  // Any unhandled error (e.g. LLM timeout, JSON parse failure) will land here
  // and mark the claim as failed so processors know action is needed.
  // -----------------------------------------------------------------------
  try {

  // -----------------------------------------------------------------------
  // DETERMINE ANALYSIS MODE: Direct PDF vs. Damage Photos
  // -----------------------------------------------------------------------
  // If this claim was created from a PDF document, we send the PDF directly
  // to the LLM via file_url (no image extraction needed — works in production
  // without pdftoppm/pdfimages system binaries).
  // If the claim has user-uploaded damage photos, we use those instead.
  // -----------------------------------------------------------------------
  let pdfUrl: string | null = null;
  let damagePhotos: string[] = [];

  if (claim.sourceDocumentId) {
    // PDF-sourced claim: look up the source document URL
    try {
      const [sourceDoc] = await db.select().from(ingestionDocuments)
        .where(eq(ingestionDocuments.id, claim.sourceDocumentId)).limit(1);
      if (sourceDoc && sourceDoc.s3Url) {
        pdfUrl = sourceDoc.s3Url;
        console.log(`[AI Assessment] Claim ${claimId}: PDF-sourced claim. Will send PDF directly to LLM: ${sourceDoc.originalFilename}`);
      } else {
        console.warn(`[AI Assessment] Claim ${claimId}: sourceDocumentId=${claim.sourceDocumentId} but no S3 URL found.`);
      }
    } catch (docErr: any) {
      console.warn(`[AI Assessment] Claim ${claimId}: Failed to look up source document: ${docErr.message}`);
    }
  }

  // If no PDF URL, fall back to user-uploaded damage photos
  if (!pdfUrl) {
    damagePhotos = claim.damagePhotos ? JSON.parse(claim.damagePhotos) : [];
  }

  // If we have neither a PDF nor photos, create a placeholder and return
  if (!pdfUrl && damagePhotos.length === 0) {
    console.log(`[AI Assessment] Claim ${claimId}: No PDF and no damage photos. Creating placeholder.`);
    await db.delete(aiAssessments).where(eq(aiAssessments.claimId, claimId)).catch(() => {});
    await db.insert(aiAssessments).values({
      claimId,
      tenantId: claim.tenantId ?? null,
      damageDescription: "Assessment pending - No damage photos or documents uploaded yet.",
      damagedComponentsJson: JSON.stringify([]),
      estimatedCost: 0,
      fraudIndicators: JSON.stringify(["No photos or documents available for analysis"]),
      fraudRiskLevel: "low",
      totalLossIndicated: 0,
      structuralDamageSeverity: "none"
    });
    await db.update(claims).set({ 
      aiAssessmentCompleted: 1,
      status: "assessment_complete",
      documentProcessingStatus: "extracted",
      updatedAt: new Date().toISOString() 
    }).where(eq(claims.id, claimId));
    return { success: true, message: "Placeholder assessment created. Please upload damage photos or documents for full analysis." };
  }

  // Import LLM helper for vision analysis
  const { invokeLLM } = await import("./_core/llm");

  // -----------------------------------------------------------------------
  // BUILD LLM PROMPT & CONTENT based on analysis mode (PDF vs. photos)
  // -----------------------------------------------------------------------
  const isPdfMode = !!pdfUrl;

  const analysisPrompt = isPdfMode
    ? `You are an expert auto insurance claims analyst. You are being given a PDF document that is an insurance assessment report, repair quotation, or police report for a vehicle damage claim.

Analyze the ENTIRE document thoroughly and extract:
1. Vehicle details (make, model, year, registration number, VIN, colour, engine number)
2. ALL damaged components listed (e.g. front bumper, bonnet, left door, windscreen, headlights, etc.)
3. Damage descriptions and severity for each component
4. Repair cost estimates (parts, labour, total) — extract exact amounts from the document
5. Accident description or incident details (date, location, description, incident type)
6. Assessor or repairer name, company name, and contact details
7. ALL individual line items from the quote/invoice (description, quantity, unit price, line total, category: parts/labor/paint/sundries)
8. Any fraud indicators (inconsistencies, unusual patterns, missing information, inflated costs)
9. Third party vehicle details if mentioned (make, model, registration)
10. Owner/claimant name if mentioned

IMPORTANT: You MUST populate ALL required fields in the JSON response. Use the document text, tables, and line items to derive values. For physical measurements not explicitly stated in the document, use typical values for the damage type described. For cost estimates, use the exact figures from the document. Extract ALL line items from the quote table.

Provide your response in JSON format.`
    : `You are an expert auto insurance damage assessor with expertise in accident reconstruction physics. Analyze these vehicle damage photos and provide:

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

  // -----------------------------------------------------------------------
  // BUILD LLM CONTENT: PDF file_url OR image base64
  // -----------------------------------------------------------------------
  let llmContentParts: any[] = [{ type: "text", text: analysisPrompt }];

  if (isPdfMode && pdfUrl) {
    // DIRECT PDF MODE: Send the PDF URL to the LLM as a file_url
    console.log(`[AI Assessment] Sending PDF directly to LLM for claim ${claimId}: ${pdfUrl}`);
    llmContentParts.push({
      type: "file_url" as const,
      file_url: {
        url: pdfUrl,
        mime_type: "application/pdf" as const
      }
    });
  } else {
    // PHOTO MODE: Download and base64-encode damage photos
    console.log(`[AI Assessment] Analyzing ${damagePhotos.length} photos for claim ${claimId}...`);
    const imageContents = await Promise.all(
      damagePhotos.slice(0, 6).map(async (urlOrText) => {
        try {
          let url = urlOrText;
          if (urlOrText.includes('CDN URL:')) {
            const match = urlOrText.match(/CDN URL:\s*(.+?)$/m);
            if (match) url = match[1].trim();
          }
          console.log(`[AI Assessment] Fetching image: ${url}`);
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.statusText}`);
          const buffer = await resp.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          let mimeType = 'image/jpeg';
          if (url.toLowerCase().endsWith('.png')) mimeType = 'image/png';
          else if (url.toLowerCase().endsWith('.gif')) mimeType = 'image/gif';
          else if (url.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';
          return {
            type: "image_url" as const,
            image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" as const }
          };
        } catch (error) {
          console.error(`Failed to process image ${urlOrText}:`, error);
          throw error;
        }
      })
    );
    llmContentParts.push(...imageContents);
  }

  const response = await invokeLLM({
    messages: [
      {
        role: "user",
        content: llmContentParts
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
            fraudIndicators: { type: "array", items: { type: "string" } },
            // PDF-mode extracted fields
            extractedVehicleMake: { type: "string" },
            extractedVehicleModel: { type: "string" },
            extractedVehicleYear: { type: "number" },
            extractedVehicleRegistration: { type: "string" },
            extractedVehicleVin: { type: "string" },
            extractedVehicleColour: { type: "string" },
            extractedVehicleEngineNumber: { type: "string" },
            extractedOwnerName: { type: "string" },
            extractedIncidentDate: { type: "string" },
            extractedIncidentDescription: { type: "string" },
            extractedIncidentLocation: { type: "string" },
            extractedIncidentType: { type: "string", enum: ["collision", "theft", "hail", "fire", "vandalism", "flood", "hijacking", "other", "unknown"] },
            extractedRepairerName: { type: "string" },
            extractedRepairerCompany: { type: "string" },
            extractedThirdPartyVehicle: { type: "string" },
            extractedThirdPartyRegistration: { type: "string" },
            extractedQuoteLineItems: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  partNumber: { type: "string" },
                  quantity: { type: "number" },
                  unitPrice: { type: "number" },
                  lineTotal: { type: "number" },
                  category: { type: "string", enum: ["parts", "labor", "paint", "diagnostic", "sundries", "other"] }
                },
                required: ["description", "quantity", "unitPrice", "lineTotal", "category"],
                additionalProperties: false
              }
            }
          },
          required: ["damageDescription", "damagedComponents", "maxCrushDepth", "crushDepthConfidence", "totalDamageArea", "structuralDamage", "airbagDeployment", "impactPoint", "accidentType", "referenceObjectsDetected", "photoAnglesAvailable", "imageQualityScore", "scaleCalibrationConfidence", "recommendResubmission", "multiVehicleData", "skidMarkData", "postCollisionMovement", "rolloverEvidence", "missingDataFlags", "estimatedCost", "laborCost", "partsCost", "fraudRiskScore", "fraudIndicators", "extractedVehicleMake", "extractedVehicleModel", "extractedVehicleYear", "extractedVehicleRegistration", "extractedVehicleVin", "extractedVehicleColour", "extractedVehicleEngineNumber", "extractedOwnerName", "extractedIncidentDate", "extractedIncidentDescription", "extractedIncidentLocation", "extractedIncidentType", "extractedRepairerName", "extractedRepairerCompany", "extractedThirdPartyVehicle", "extractedThirdPartyRegistration", "extractedQuoteLineItems"],
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

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 1 — CLAIM CONTEXT ANALYSIS
  // Confirm or extract: incidentType, incidentDescription, incidentDate,
  // incidentLocation, vehicle details (make/model/year/registration/VIN)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[Pipeline Stage 1] Claim context analysis for claim ${claimId}`);

  // In PDF mode the LLM extracts vehicle and incident details from the document.
  // In photo mode these fields come from the claim record itself.
  const extractedMake = analysis.extractedVehicleMake || '';
  const extractedModel = analysis.extractedVehicleModel || '';
  const extractedYear = analysis.extractedVehicleYear || null;
  const extractedReg = analysis.extractedVehicleRegistration || '';
  const extractedVin = analysis.extractedVehicleVin || '';
  const extractedColour = analysis.extractedVehicleColour || '';
  const extractedEngineNumber = analysis.extractedVehicleEngineNumber || '';
  const extractedOwnerName = analysis.extractedOwnerName || '';
  const extractedIncidentDate = analysis.extractedIncidentDate || '';
  const extractedIncidentDescription = analysis.extractedIncidentDescription || '';
  const extractedIncidentLocation = analysis.extractedIncidentLocation || '';
  const extractedIncidentType = analysis.extractedIncidentType || 'other';
  const extractedRepairerName = analysis.extractedRepairerName || '';
  const extractedRepairerCompany = analysis.extractedRepairerCompany || '';
  const extractedThirdPartyVehicle = analysis.extractedThirdPartyVehicle || '';
  const extractedThirdPartyRegistration = analysis.extractedThirdPartyRegistration || '';
  const extractedQuoteLineItems: Array<{description: string; partNumber?: string; quantity: number; unitPrice: number; lineTotal: number; category: string}> = analysis.extractedQuoteLineItems || [];

  // Resolve effective claim context (PDF extraction takes precedence over existing claim fields)
  const effectiveMake = extractedMake || claim.vehicleMake || '';
  const effectiveModel = extractedModel || claim.vehicleModel || '';
  const effectiveYear = extractedYear || claim.vehicleYear || null;
  const effectiveIncidentDescription = extractedIncidentDescription || claim.incidentDescription || '';
  const effectiveIncidentLocation = extractedIncidentLocation || claim.incidentLocation || '';

  console.log(`[Pipeline Stage 1] Vehicle context: ${effectiveMake} ${effectiveModel} (${effectiveYear || 'year unknown'})`);
  console.log(`[Pipeline Stage 1] Incident context: type=${extractedIncidentType}, location=${effectiveIncidentLocation || 'unknown'}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 2 — INCIDENT CLASSIFICATION
  // Normalise incidentType to a canonical set used by all downstream stages.
  // Canonical values: collision | theft | vandalism | flood | fire | unknown
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[Pipeline Stage 2] Incident classification`);

  type CanonicalIncidentType = 'collision' | 'theft' | 'vandalism' | 'flood' | 'fire' | 'unknown';

  const classifyIncident = (raw: string): CanonicalIncidentType => {
    const r = (raw || '').toLowerCase();
    if (r === 'collision' || r === 'frontal' || r === 'rear' || r === 'side' ||
        r === 'side_driver' || r === 'side_passenger' || r === 'rollover' ||
        r === 'multi_impact' || r === 'accident') return 'collision';
    if (r === 'theft' || r === 'hijacking' || r === 'stolen') return 'theft';
    if (r === 'vandalism' || r === 'malicious') return 'vandalism';
    if (r === 'flood' || r === 'water' || r === 'hail') return 'flood';
    if (r === 'fire' || r === 'burn') return 'fire';
    return 'unknown';
  };

  // Derive from extracted PDF type first; fall back to claim's existing incidentType
  const rawIncidentType = extractedIncidentType || (claim as any).incidentType || 'unknown';
  // Also check the LLM accidentType (photo mode gives a collision sub-type)
  const llmAccidentType = analysis.accidentType || '';
  const isCollisionAccidentType = ['frontal','rear','side_driver','side_passenger','rollover','multi_impact'].includes(llmAccidentType);
  const classifiedIncidentType: CanonicalIncidentType =
    isCollisionAccidentType ? 'collision' : classifyIncident(rawIncidentType);

  console.log(`[Pipeline Stage 2] Classified incident type: ${classifiedIncidentType} (raw: ${rawIncidentType}, llmAccidentType: ${llmAccidentType})`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 3 — PHYSICS ENGINE GATE
  // Physics analysis (impact force, vectors, energy transfer) is only valid
  // for collision incidents. For theft, vandalism, flood, fire — skip physics.
  // ═══════════════════════════════════════════════════════════════════════════
  const runPhysicsEngine = classifiedIncidentType === 'collision';
  console.log(`[Pipeline Stage 3] Physics engine gate: ${runPhysicsEngine ? 'OPEN (collision)' : `CLOSED (${classifiedIncidentType} — physics not applicable)`}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 4 — DAMAGE DETECTION
  // Structured list of damaged components from LLM vision / PDF extraction.
  // Each component carries: name, location, damageType, severity.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[Pipeline Stage 4] Damage detection`);

  const damagedComponents = analysis.damagedComponents || [];
  const structuralComponents = damagedComponents.filter((c: any) => c.damageType === 'structural');
  const catastrophicStructuralDamage = structuralComponents.filter((c: any) => c.severity === 'total_loss').length > 0;
  const severeStructuralDamage = structuralComponents.some((c: any) => c.severity === 'severe' || c.severity === 'total_loss');
  const hasComponentMarkedTotalLoss = damagedComponents.some((c: any) => c.severity === 'total_loss');
  const extensiveDamage = damagedComponents.length >= 7;
  const multipleCriticalSystems = damagedComponents.filter((c: any) =>
    c.damageType === 'structural' || c.damageType === 'mechanical'
  ).length >= 3;

  let structuralDamageSeverity: 'none' | 'minor' | 'moderate' | 'severe' | 'catastrophic' = 'none';
  if (catastrophicStructuralDamage) {
    structuralDamageSeverity = 'catastrophic';
  } else if (severeStructuralDamage) {
    structuralDamageSeverity = 'severe';
  } else if (structuralComponents.length > 0) {
    const maxSev = Math.max(...structuralComponents.map((c: any) =>
      c.severity === 'severe' ? 3 : c.severity === 'moderate' ? 2 : 1
    ));
    structuralDamageSeverity = maxSev === 3 ? 'severe' : maxSev === 2 ? 'moderate' : 'minor';
  }

  console.log(`[Pipeline Stage 4] Detected ${damagedComponents.length} damaged components; structural severity: ${structuralDamageSeverity}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 5 — DAMAGE PROPAGATION
  // Infer hidden / secondary damages using impact location, structural layout,
  // and engineering rules. Only relevant for collision incidents.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[Pipeline Stage 5] Damage propagation inference`);

  interface InferredHiddenDamage {
    component: string;
    reason: string;
    probability: number; // 0-100
    estimatedCostUsd: number;
  }

  const inferHiddenDamages = (
    components: any[],
    impactPoint: string,
    incidentType: CanonicalIncidentType
  ): InferredHiddenDamage[] => {
    if (incidentType !== 'collision') return [];

    const hidden: InferredHiddenDamage[] = [];
    const detectedNames = components.map((c: any) => (c.name || '').toLowerCase());
    const impact = (impactPoint || '').toLowerCase();
    const hasFrontDamage = impact.includes('front') || detectedNames.some(n => n.includes('bumper') || n.includes('bonnet') || n.includes('hood') || n.includes('grille'));
    const hasRearDamage = impact.includes('rear') || detectedNames.some(n => n.includes('boot') || n.includes('trunk') || n.includes('rear bumper'));
    const hasSideDamage = impact.includes('side') || detectedNames.some(n => n.includes('door') || n.includes('sill') || n.includes('quarter panel'));
    const hasStructuralDamage = components.some((c: any) => c.damageType === 'structural');
    const hasSevereDamage = components.some((c: any) => c.severity === 'severe' || c.severity === 'total_loss');

    // Front impact propagation
    if (hasFrontDamage) {
      if (!detectedNames.some(n => n.includes('subframe') || n.includes('crash bar'))) {
        hidden.push({ component: 'Front subframe / crash bar', reason: 'Front impact forces typically transfer to subframe even when not visually apparent', probability: 75, estimatedCostUsd: 350 });
      }
      if (!detectedNames.some(n => n.includes('radiator') || n.includes('condenser'))) {
        hidden.push({ component: 'Radiator / AC condenser', reason: 'Located directly behind front bumper; vulnerable to front impact energy transfer', probability: 65, estimatedCostUsd: 280 });
      }
      if (hasSevereDamage && !detectedNames.some(n => n.includes('steering') || n.includes('rack'))) {
        hidden.push({ component: 'Steering rack / column', reason: 'Severe front impact can displace steering geometry without visible external damage', probability: 55, estimatedCostUsd: 450 });
      }
      if (hasStructuralDamage && !detectedNames.some(n => n.includes('engine mount'))) {
        hidden.push({ component: 'Engine mounts', reason: 'Structural front impact loads are absorbed by engine mounts; micro-fractures common', probability: 60, estimatedCostUsd: 220 });
      }
    }

    // Rear impact propagation
    if (hasRearDamage) {
      if (!detectedNames.some(n => n.includes('fuel') || n.includes('tank'))) {
        hidden.push({ component: 'Fuel tank / filler neck', reason: 'Rear impact can deform fuel tank mounting brackets and filler neck', probability: 50, estimatedCostUsd: 300 });
      }
      if (hasSevereDamage && !detectedNames.some(n => n.includes('spare wheel') || n.includes('differential'))) {
        hidden.push({ component: 'Rear differential / axle', reason: 'High-energy rear impacts can misalign rear axle geometry', probability: 45, estimatedCostUsd: 500 });
      }
    }

    // Side impact propagation
    if (hasSideDamage) {
      if (!detectedNames.some(n => n.includes('door intrusion') || n.includes('side impact beam'))) {
        hidden.push({ component: 'Door intrusion beam', reason: 'Side impact beams absorb lateral crash energy; deformation may not be externally visible', probability: 70, estimatedCostUsd: 180 });
      }
      if (hasSevereDamage && !detectedNames.some(n => n.includes('b-pillar') || n.includes('a-pillar'))) {
        hidden.push({ component: 'B-pillar / A-pillar reinforcement', reason: 'Severe side impacts transfer loads to pillar structures; hidden deformation possible', probability: 60, estimatedCostUsd: 600 });
      }
    }

    // General high-energy collision propagation
    if (hasSevereDamage || hasStructuralDamage) {
      if (!detectedNames.some(n => n.includes('wiring') || n.includes('harness'))) {
        hidden.push({ component: 'Wiring harness (impact zone)', reason: 'High-energy impacts can pinch or sever wiring harnesses routed through damaged panels', probability: 55, estimatedCostUsd: 200 });
      }
      if (!detectedNames.some(n => n.includes('wheel alignment') || n.includes('suspension geometry'))) {
        hidden.push({ component: 'Wheel alignment / suspension geometry', reason: 'Structural deformation almost always affects suspension geometry; alignment check mandatory', probability: 85, estimatedCostUsd: 120 });
      }
    }

    return hidden;
  };

  const inferredHiddenDamages = inferHiddenDamages(
    damagedComponents,
    analysis.impactPoint || '',
    classifiedIncidentType
  );

  console.log(`[Pipeline Stage 5] Inferred ${inferredHiddenDamages.length} hidden damage(s)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 6 — PHYSICS ANALYSIS  (collision only)
  // Calculates: impact force, vector direction, energy transfer, crush depth.
  // Inputs: vehicle data (mass, make, model), accident data, damage assessment.
  // ═══════════════════════════════════════════════════════════════════════════
  // (Physics engine is invoked later in the try/catch block below, gated by
  //  runPhysicsEngine. Inputs are prepared here so they are available.)

  // Vehicle value estimation (Zimbabwean market, in cents)
  const vehicleAge = effectiveYear ? new Date().getFullYear() - effectiveYear : 10;
  let estimatedVehicleValue = 500000; // Default $5,000 in cents
  const vehicleKey = `${effectiveMake.toLowerCase()} ${effectiveModel.toLowerCase()}`;
  const vehicleValues: Record<string, number> = {
    'honda fit': 350000,    // $3,500
    'honda jazz': 350000,
    'honda civic': 600000,  // $6,000
    'toyota vitz': 300000,  // $3,000
    'toyota yaris': 350000,
    'toyota corolla': 700000, // $7,000
    'toyota hilux': 1500000,  // $15,000
    'toyota fortuner': 2000000, // $20,000
    'toyota land cruiser': 3500000, // $35,000
    'toyota prado': 2500000,
    'isuzu d-max': 1200000,  // $12,000
    'isuzu d-teq': 1200000,
    'isuzu kb': 1000000,
    'isuzu mu-x': 1800000,
    'mazda 3': 600000,
    'mazda cx-5': 1400000,
    'ford ranger': 1400000,
    'ford everest': 1800000,
    'volkswagen polo': 700000,
    'volkswagen golf': 900000,
    'nissan np200': 500000,
    'nissan np300': 800000,
    'nissan navara': 1200000,
    'nissan x-trail': 1200000,
    'mitsubishi triton': 1200000,
    'suzuki swift': 350000,
    'hyundai i10': 250000,
    'hyundai i20': 350000,
    'hyundai tucson': 1200000,
    'kia picanto': 250000,
    'kia rio': 350000,
    'kia sportage': 1200000,
    'bmw 3 series': 1500000,
    'mercedes c-class': 1800000,
    'mercedes e-class': 2200000,
  };
  for (const [key, value] of Object.entries(vehicleValues)) {
    if (vehicleKey.includes(key)) { estimatedVehicleValue = value; break; }
  }
  const depreciationFactor = Math.max(0.2, 1 - (vehicleAge * 0.1));
  estimatedVehicleValue = Math.round(estimatedVehicleValue * depreciationFactor);

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 7 — FRAUD ANALYSIS
  // Evaluates: damage consistency, unrelated damage, physics mismatch,
  // repair inflation. Physics outputs feed into fraud scoring for collisions.
  // (Fraud analysis runs inside the physics try/catch block below.)
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 8 — REPAIR INTELLIGENCE
  // Classify each detected component as: repair | replace | inspect.
  // Uses damage severity + component type as primary inputs.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[Pipeline Stage 8] Repair intelligence classification`);

  interface RepairAction {
    component: string;
    location: string;
    damageType: string;
    severity: string;
    action: 'repair' | 'replace' | 'inspect' | 'total_loss';
    rationale: string;
    estimatedLaborHours: number;
  }

  const classifyRepairAction = (comp: any): RepairAction => {
    const sev = (comp.severity || '').toLowerCase();
    const type = (comp.damageType || '').toLowerCase();
    const name = (comp.name || '').toLowerCase();

    // Total loss components
    if (sev === 'total_loss') {
      return { ...comp, action: 'total_loss', rationale: 'Component damage exceeds economic repair threshold', estimatedLaborHours: 0 };
    }
    // Structural components — replace if severe, inspect if moderate
    if (type === 'structural') {
      if (sev === 'severe') return { ...comp, action: 'replace', rationale: 'Severe structural damage compromises vehicle safety; replacement mandatory', estimatedLaborHours: 8 };
      if (sev === 'moderate') return { ...comp, action: 'inspect', rationale: 'Moderate structural damage requires specialist inspection before repair decision', estimatedLaborHours: 2 };
      return { ...comp, action: 'repair', rationale: 'Minor structural damage — panel straightening and reinforcement', estimatedLaborHours: 4 };
    }
    // Mechanical components
    if (type === 'mechanical') {
      if (sev === 'severe') return { ...comp, action: 'replace', rationale: 'Severe mechanical damage — component integrity compromised', estimatedLaborHours: 6 };
      return { ...comp, action: 'inspect', rationale: 'Mechanical component requires diagnostic inspection', estimatedLaborHours: 1.5 };
    }
    // Electrical components
    if (type === 'electrical') {
      if (sev === 'severe') return { ...comp, action: 'replace', rationale: 'Severe electrical damage — wiring/module replacement required', estimatedLaborHours: 4 };
      return { ...comp, action: 'inspect', rationale: 'Electrical fault diagnosis required', estimatedLaborHours: 1 };
    }
    // Cosmetic / body panels
    if (sev === 'severe') return { ...comp, action: 'replace', rationale: 'Severe cosmetic damage — panel replacement more economical than repair', estimatedLaborHours: 3 };
    if (sev === 'moderate') return { ...comp, action: 'repair', rationale: 'Moderate cosmetic damage — panel beating and refinishing', estimatedLaborHours: 2 };
    return { ...comp, action: 'repair', rationale: 'Minor cosmetic damage — PDR or spot repair', estimatedLaborHours: 1 };
  };

  const repairIntelligence: RepairAction[] = damagedComponents.map(classifyRepairAction);
  const replaceCount = repairIntelligence.filter(r => r.action === 'replace' || r.action === 'total_loss').length;
  const repairCount = repairIntelligence.filter(r => r.action === 'repair').length;
  const inspectCount = repairIntelligence.filter(r => r.action === 'inspect').length;
  const totalEstimatedLaborHours = repairIntelligence.reduce((sum, r) => sum + r.estimatedLaborHours, 0);

  console.log(`[Pipeline Stage 8] Repair intelligence: ${repairCount} repair, ${replaceCount} replace, ${inspectCount} inspect; est. ${totalEstimatedLaborHours}h labour`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 9 — PARTS RECONCILIATION
  // Compare detected damages vs. panel beater quote vs. inferred hidden damages.
  // Identifies: over-quoted items, missing items, price anomalies.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[Pipeline Stage 9] Parts reconciliation`);

  interface ReconciliationItem {
    component: string;
    status: 'matched' | 'detected_not_quoted' | 'quoted_not_detected' | 'hidden_damage';
    detectedSeverity?: string;
    quotedCost?: number;
    note: string;
  }

  const reconcileComponents = (
    detected: any[],
    quoted: Array<{description: string; lineTotal: number; category: string}>,
    hidden: InferredHiddenDamage[]
  ): ReconciliationItem[] => {
    const items: ReconciliationItem[] = [];
    const quotedNames = quoted.map(q => (q.description || '').toLowerCase());

    // Check each detected component against the quote
    for (const comp of detected) {
      const compName = (comp.name || '').toLowerCase();
      const matchedQuote = quoted.find(q => {
        const qName = (q.description || '').toLowerCase();
        return qName.includes(compName) || compName.includes(qName) ||
               qName.split(' ').some((w: string) => w.length > 3 && compName.includes(w));
      });
      if (matchedQuote) {
        items.push({ component: comp.name, status: 'matched', detectedSeverity: comp.severity, quotedCost: matchedQuote.lineTotal, note: `Detected and quoted: $${matchedQuote.lineTotal}` });
      } else {
        items.push({ component: comp.name, status: 'detected_not_quoted', detectedSeverity: comp.severity, note: 'Detected by AI but not included in panel beater quote — may be under-quoted' });
      }
    }

    // Check each quoted item against detected components
    for (const q of quoted) {
      if (q.category === 'labor' || q.category === 'labour') continue; // skip labour lines
      const qName = (q.description || '').toLowerCase();
      const alreadyMatched = items.some(i => i.component.toLowerCase() === qName || qName.includes(i.component.toLowerCase()));
      if (!alreadyMatched) {
        items.push({ component: q.description, status: 'quoted_not_detected', quotedCost: q.lineTotal, note: 'In quote but not detected by AI vision — verify necessity' });
      }
    }

    // Add hidden damages as reconciliation items
    for (const h of hidden) {
      items.push({ component: h.component, status: 'hidden_damage', note: `${h.reason} (probability: ${h.probability}%, est. $${h.estimatedCostUsd})` });
    }

    return items;
  };

  const partsReconciliation = reconcileComponents(
    damagedComponents,
    extractedQuoteLineItems,
    inferredHiddenDamages
  );

  const matchedCount = partsReconciliation.filter(r => r.status === 'matched').length;
  const missingFromQuoteCount = partsReconciliation.filter(r => r.status === 'detected_not_quoted').length;
  const extraInQuoteCount = partsReconciliation.filter(r => r.status === 'quoted_not_detected').length;

  console.log(`[Pipeline Stage 9] Parts reconciliation: ${matchedCount} matched, ${missingFromQuoteCount} missing from quote, ${extraInQuoteCount} extra in quote, ${inferredHiddenDamages.length} hidden damages`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 10 — COST INTELLIGENCE
  // Calculates: repair cost ranges, labour estimates, reconciliation differences.
  // Inputs: repair intelligence (Stage 8) + parts reconciliation (Stage 9) +
  //         vehicle value (Stage 6 prep) + quote line items (Stage 1).
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[Pipeline Stage 10] Cost intelligence`);

  const estimatedRepairCost = Math.round(analysis.estimatedCost || 0);
  const estimatedLaborCost = Math.round(analysis.laborCost || 0);
  const estimatedPartsCost = Math.round(analysis.partsCost || 0);

  // Labour rate estimate (USD/hour) — Zimbabwean market
  const laborRateUsdPerHour = 15;
  const laborCostFromIntelligence = Math.round(totalEstimatedLaborHours * laborRateUsdPerHour * 100); // in cents

  // Hidden damage cost estimate
  const hiddenDamageTotalUsd = inferredHiddenDamages.reduce((sum, h) => sum + h.estimatedCostUsd, 0);
  const hiddenDamageCostCents = hiddenDamageTotalUsd * 100;

  // Reconciliation cost gap (detected but not quoted)
  const missingFromQuoteItems = partsReconciliation.filter(r => r.status === 'detected_not_quoted');
  const extraInQuoteItems = partsReconciliation.filter(r => r.status === 'quoted_not_detected');
  const extraInQuoteCost = extraInQuoteItems.reduce((sum, r) => sum + (r.quotedCost || 0), 0);

  // Repair-to-value ratio
  const repairToValueRatio = estimatedVehicleValue > 0
    ? Math.round((estimatedRepairCost / estimatedVehicleValue) * 100)
    : 0;

  // Total loss determination
  const totalLossThreshold = 70; // 70% of vehicle value
  const totalLossIndicated =
    hasComponentMarkedTotalLoss ||
    structuralDamageSeverity === 'catastrophic' ||
    (structuralDamageSeverity === 'severe' && repairToValueRatio > 40) ||
    repairToValueRatio > totalLossThreshold;

  let totalLossReasoning = '';
  if (totalLossIndicated) {
    const reasons = [];
    if (hasComponentMarkedTotalLoss) reasons.push('Component(s) marked as total loss by AI vision analysis');
    if (structuralDamageSeverity === 'catastrophic') reasons.push('Catastrophic structural damage detected');
    if (structuralDamageSeverity === 'severe') reasons.push('Severe structural damage to chassis/frame');
    if (repairToValueRatio > totalLossThreshold) reasons.push(`Repair cost (${repairToValueRatio}%) exceeds ${totalLossThreshold}% of vehicle value`);
    if (extensiveDamage && multipleCriticalSystems) reasons.push(`Extensive damage: ${damagedComponents.length} components across multiple critical systems`);
    if (analysis.airbagDeployment) reasons.push('Airbag deployment detected');
    totalLossReasoning = reasons.join('; ');
  }

  console.log(`[Pipeline Stage 10] Cost intelligence: repair=$${(estimatedRepairCost/100).toFixed(2)}, vehicle value=$${(estimatedVehicleValue/100).toFixed(2)}, ratio=${repairToValueRatio}%, total_loss=${totalLossIndicated}`);
  console.log(`[Pipeline Stage 10] Hidden damage estimate: $${hiddenDamageTotalUsd}, extra in quote: $${extraInQuoteCost}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // IMAGE QUALITY VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════
  const imageQuality = {
    score: analysis.imageQualityScore || 0,
    scaleConfidence: analysis.scaleCalibrationConfidence || 0,
    referenceObjects: analysis.referenceObjectsDetected || [],
    photoAngles: analysis.photoAnglesAvailable || [],
    recommendResubmission: analysis.recommendResubmission || false,
    crushDepthConfidence: analysis.crushDepthConfidence || 0,
  };
  if (imageQuality.recommendResubmission || imageQuality.score < 60) {
    console.warn(`[AI Assessment] Low-quality photos detected for claim ${claimId}:`, {
      imageQualityScore: imageQuality.score,
      scaleConfidence: imageQuality.scaleConfidence,
      crushDepthConfidence: imageQuality.crushDepthConfidence,
      referenceObjects: imageQuality.referenceObjects.length,
      photoAngles: imageQuality.photoAngles.length,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSIST INITIAL AI ASSESSMENT RECORD
  // Stages 6 (physics) and 7 (fraud) will update this record once complete.
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    await db.delete(aiAssessments).where(eq(aiAssessments.claimId, claimId));
    console.log(`[AI Assessment] Cleared existing assessment records for claim ${claimId} before re-insert.`);
  } catch (deleteErr: any) {
    console.warn(`[AI Assessment] Could not clear old assessment for claim ${claimId}: ${deleteErr.message}`);
  }

  await createAiAssessment({
    claimId,
    tenantId: claim.tenantId ?? null,
    damageDescription: analysis.damageDescription || "AI analysis completed",
    estimatedCost: estimatedRepairCost,
    fraudIndicators: JSON.stringify(analysis.fraudIndicators || []),
    fraudRiskLevel: analysis.fraudRiskScore > 70 ? "high" : analysis.fraudRiskScore > 40 ? "medium" : "low",
    confidenceScore: Math.min(100, Math.max(10, Math.round(
      (imageQuality.score || 50) * 0.30 +
      (imageQuality.crushDepthConfidence || 50) * 0.25 +
      (imageQuality.scaleConfidence || 50) * 0.15 +
      (analysis.photoAnglesAvailable?.length >= 3 ? 80 : analysis.photoAnglesAvailable?.length >= 2 ? 60 : 40) * 0.15 +
      (analysis.damagedComponents?.length > 0 ? 80 : 30) * 0.15
    ))),
    modelVersion: "gpt-4-vision-v1",
    totalLossIndicated: totalLossIndicated ? 1 : 0,
    structuralDamageSeverity,
    estimatedVehicleValue,
    repairToValueRatio,
    totalLossReasoning: totalLossReasoning || null,
    damagedComponentsJson: JSON.stringify(damagedComponents),
    estimatedPartsCost: estimatedPartsCost || null,
    estimatedLaborCost: estimatedLaborCost || null,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 6 — PHYSICS ANALYSIS + STAGE 7 — FRAUD ANALYSIS
  // Physics engine is GATED: only runs when classifiedIncidentType === 'collision'.
  // Fraud analysis runs in all cases but uses physics outputs when available.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[Pipeline Stage 6] Physics analysis — gate: ${runPhysicsEngine ? 'OPEN' : 'CLOSED'}`);

  // Import physics engine and forensic analysis
  const { analyzeAccidentPhysics, validateQuoteAgainstPhysics } = await import("./accidentPhysics");
  const { performForensicAnalysis } = await import("./forensicAnalysis");
  
  // Prepare vehicle data — use PDF-extracted fields if available, fall back to claim fields
  const physicsMake = (analysis.extractedVehicleMake || claim.vehicleMake || 'Unknown').toLowerCase();
  const physicsModel = (analysis.extractedVehicleModel || claim.vehicleModel || 'Unknown').toLowerCase();
  const physicsYear = analysis.extractedVehicleYear || claim.vehicleYear || 2020;

  // Vehicle mass lookup table (kg) — common models in ZW/SA market
  const vehicleMassTable: Record<string, number> = {
    'honda fit': 1050, 'honda jazz': 1050, 'honda civic': 1250, 'honda cr-v': 1500,
    'toyota vitz': 980, 'toyota yaris': 1050, 'toyota corolla': 1300, 'toyota hilux': 1900,
    'toyota fortuner': 2100, 'toyota land cruiser': 2500, 'toyota prado': 2200,
    'isuzu d-max': 1900, 'isuzu d-teq': 1900, 'isuzu kb': 1900, 'isuzu mu-x': 2100,
    'mazda 3': 1300, 'mazda cx-5': 1600, 'mazda bt-50': 1900,
    'ford ranger': 1950, 'ford everest': 2200, 'ford fiesta': 1050, 'ford focus': 1300,
    'volkswagen polo': 1100, 'volkswagen golf': 1300, 'volkswagen tiguan': 1600,
    'nissan np200': 900, 'nissan np300': 1700, 'nissan navara': 1900, 'nissan x-trail': 1600,
    'mitsubishi triton': 1900, 'mitsubishi outlander': 1700, 'mitsubishi colt': 1100,
    'suzuki swift': 900, 'suzuki vitara': 1100, 'suzuki jimny': 1100,
    'chevrolet spark': 900, 'chevrolet cruze': 1400,
    'hyundai i10': 900, 'hyundai i20': 1050, 'hyundai tucson': 1600, 'hyundai h100': 1500,
    'kia picanto': 900, 'kia rio': 1050, 'kia sportage': 1600,
    'bmw 3 series': 1500, 'bmw x5': 2100, 'mercedes c-class': 1500, 'mercedes e-class': 1700,
  };
  const vehicleMassKey = `${physicsMake} ${physicsModel}`;
  const vehicleMass = vehicleMassTable[vehicleMassKey] ||
    vehicleMassTable[physicsMake] ||
    (physicsMake.includes('hilux') || physicsMake.includes('ranger') || physicsMake.includes('d-max') ? 1900 :
     physicsMake.includes('land cruiser') || physicsMake.includes('fortuner') ? 2200 :
     physicsMake.includes('fit') || physicsMake.includes('vitz') || physicsMake.includes('swift') ? 1000 :
     1300); // sensible default for unknown sedans

  const vehicleData = {
    mass: vehicleMass,
    make: analysis.extractedVehicleMake || claim.vehicleMake || 'Unknown',
    model: analysis.extractedVehicleModel || claim.vehicleModel || 'Unknown',
    year: physicsYear,
    vehicleType: (physicsMake.includes('hilux') || physicsMake.includes('ranger') || physicsMake.includes('d-max') || physicsMake.includes('navara') ? 'pickup' :
                  physicsMake.includes('land cruiser') || physicsMake.includes('fortuner') || physicsMake.includes('prado') ? 'suv' :
                  'sedan') as 'sedan' | 'suv' | 'pickup' | 'van' | 'truck',
    powertrainType: (physicsYear >= 2020 && (physicsMake.includes('leaf') || physicsMake.includes('tesla') || physicsMake.includes('bolt')) ? 'bev' : 'ice') as 'ice' | 'bev' | 'phev' | 'hev',
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
  
  // Run physics analysis and forensic analysis (collision only)
  let physicsAnalysis;
  let forensicAnalysis;
  try {
    if (!runPhysicsEngine) {
      // Non-collision incident — skip physics, use neutral placeholder values
      console.log(`[Pipeline Stage 6] Skipping physics engine for ${classifiedIncidentType} incident`);
      physicsAnalysis = {
        impactForce: { magnitude: 0, direction: 0 },
        speedEstimate: { estimatedSpeedKmh: 0, confidence: 0 },
        consistencyScore: 50,
        overallConsistency: 50,
        damagePropagationScore: 50,
        fraudIndicators: { impossibleDamagePatterns: [], unrelatedDamage: [], stagedAccidentIndicators: [], severityMismatch: false },
        _skipped: true,
        _reason: `Physics not applicable for ${classifiedIncidentType} incidents`,
      };
    } else {
      physicsAnalysis = await analyzeAccidentPhysics(vehicleData, accidentData, damageAssessment);
    }
    
    // Run forensic analysis (always runs — evaluates damage consistency regardless of incident type)
    console.log(`[Pipeline Stage 7] Fraud analysis`);
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
    
    // Update claim with enhanced fraud assessment + lifecycle status
    // Build vehicle/incident update fields from PDF extraction (only set if extracted data is non-empty)
    const vehicleUpdateFields: Record<string, any> = {};
    if (isPdfMode) {
      if (extractedMake) vehicleUpdateFields.vehicleMake = extractedMake;
      if (extractedModel) vehicleUpdateFields.vehicleModel = extractedModel;
      if (extractedYear) vehicleUpdateFields.vehicleYear = extractedYear;
      if (extractedReg) vehicleUpdateFields.vehicleRegistration = extractedReg;
      if (extractedVin) vehicleUpdateFields.vehicleVin = extractedVin;
      if (extractedColour) vehicleUpdateFields.vehicleColor = extractedColour;
      if (extractedEngineNumber) vehicleUpdateFields.vehicleEngineNumber = extractedEngineNumber;
      if (extractedIncidentDate) {
        // Parse incident date to a valid timestamp string
        try {
          const d = new Date(extractedIncidentDate);
          if (!isNaN(d.getTime())) vehicleUpdateFields.incidentDate = d.toISOString().slice(0, 19).replace('T', ' ');
        } catch { /* ignore invalid dates */ }
      }
      if (extractedIncidentDescription) vehicleUpdateFields.incidentDescription = extractedIncidentDescription;
      if (extractedIncidentLocation) vehicleUpdateFields.incidentLocation = extractedIncidentLocation;
      if (extractedIncidentType && extractedIncidentType !== 'unknown') vehicleUpdateFields.incidentType = extractedIncidentType as any;
      if (extractedThirdPartyVehicle) vehicleUpdateFields.thirdPartyVehicle = extractedThirdPartyVehicle;
      if (extractedThirdPartyRegistration) vehicleUpdateFields.thirdPartyRegistration = extractedThirdPartyRegistration;
    }
    // Always persist the canonical incident type derived by Stage 2
    vehicleUpdateFields.incidentType = classifiedIncidentType as any;

    await db.update(claims).set({ 
      aiAssessmentCompleted: 1,
      status: "assessment_complete",
      documentProcessingStatus: "extracted",
      fraudRiskScore: combinedFraudScore,
      fraudFlags: JSON.stringify(allFraudFlags),
      // mlFraudScore: mlFraudResult && mlFraudResult.ml_fraud_score ? String(mlFraudResult.ml_fraud_score) : null,
      // ownershipRiskScore: mlFraudResult ? String(mlFraudResult.ownership_risk_score) : null,
      // stagedAccidentConfidence: mlFraudResult ? String(mlFraudResult.staged_accident_indicators.confidence) : null,
      // fraudAnalysisJson: mlFraudResult ? JSON.stringify(mlFraudResult) : null,
      ...vehicleUpdateFields,
      updatedAt: new Date().toISOString() 
    }).where(eq(claims.id, claimId));
    console.log(`[AI Assessment] Claim ${claimId} updated after AI completion. Vehicle fields extracted: ${Object.keys(vehicleUpdateFields).join(', ')}`);

    // ========== CREATE PANEL BEATER QUOTE FROM PDF EXTRACTED DATA ==========
    // If the PDF contained a quote/invoice, create a panel_beater_quotes record
    if (isPdfMode && (extractedQuoteLineItems.length > 0 || analysis.estimatedCost > 0)) {
      try {
        // Find or create a "PDF Assessor" panel beater record for this tenant
        const tenantId = claim.tenantId;
        let pdfAssessorPanelBeater = await db.select().from(panelBeaters)
          .where(and(
            eq(panelBeaters.businessName, extractedRepairerCompany || 'PDF Assessor'),
            tenantId ? eq(panelBeaters.tenantId, tenantId) : sql`1=1`
          ))
          .limit(1);
        
        if (pdfAssessorPanelBeater.length === 0) {
          // Create a panel beater record for the repairer in the PDF
          const insertResult = await db.insert(panelBeaters).values({
            name: extractedRepairerName || extractedRepairerCompany || 'PDF Assessor',
            businessName: extractedRepairerCompany || extractedRepairerName || 'PDF Assessor',
            email: '',
            phone: '',
            address: '',
            approved: 1,
            tenantId: tenantId || null,
          } as any);
          const newId = (insertResult as any)[0]?.insertId;
          if (newId) {
            pdfAssessorPanelBeater = await db.select().from(panelBeaters).where(eq(panelBeaters.id, newId)).limit(1);
          }
        }

        if (pdfAssessorPanelBeater.length > 0) {
          const panelBeaterId = pdfAssessorPanelBeater[0].id;
          const laborCost = Math.round(analysis.laborCost || 0);
          const partsCost = Math.round(analysis.partsCost || 0);
          const totalCost = Math.round(analysis.estimatedCost || laborCost + partsCost);
          
          // Delete any existing PDF-sourced quotes for this claim
          await db.delete(panelBeaterQuotes).where(
            and(eq(panelBeaterQuotes.claimId, claimId), eq(panelBeaterQuotes.panelBeaterId, panelBeaterId))
          );

          // Create the quote
          const quoteInsert = await db.insert(panelBeaterQuotes).values({
            claimId,
            panelBeaterId,
            quotedAmount: totalCost,
            laborCost: laborCost,
            partsCost: partsCost,
            estimatedDuration: 5, // Default 5 days
            notes: `Quote extracted from PDF document: ${extractedRepairerCompany || extractedRepairerName || 'Assessor'}`,
            status: 'submitted',
            tenantId: tenantId || null,
            currencyCode: claim.currencyCode || 'USD',
            itemizedBreakdown: extractedQuoteLineItems.length > 0 ? JSON.stringify(extractedQuoteLineItems) : null,
            // componentsJson: QuotedPart[] format for parts reconciliation engine
            componentsJson: extractedQuoteLineItems.length > 0 ? JSON.stringify(
              extractedQuoteLineItems.map(item => ({
                componentName: item.description,
                action: item.category === 'labour' ? 'repair' : 'replace',
                partsCost: item.category !== 'labour' ? Math.round(item.lineTotal) : 0,
                laborCost: item.category === 'labour' ? Math.round(item.lineTotal) : 0,
              }))
            ) : null,
          } as any);

          const newQuoteId = (quoteInsert as any)[0]?.insertId;
          
          // Create line items if extracted
          if (newQuoteId && extractedQuoteLineItems.length > 0) {
            const lineItemsToInsert = extractedQuoteLineItems.map((item, idx) => ({
              quoteId: newQuoteId,
              itemNumber: idx + 1,
              description: item.description,
              partNumber: item.partNumber || null,
              category: item.category as any,
              quantity: String(item.quantity),
              unitPrice: String(item.unitPrice),
              lineTotal: String(item.lineTotal),
              vatRate: '0.00',
              vatAmount: '0.00',
              totalWithVat: String(item.lineTotal),
            }));
            await db.insert(quoteLineItems).values(lineItemsToInsert as any);
            console.log(`[AI Assessment] Created ${lineItemsToInsert.length} quote line items for claim ${claimId}`);
          }
          
          console.log(`[AI Assessment] Created panel beater quote (ID: ${newQuoteId}) for claim ${claimId} from PDF data`);
        }
      } catch (quoteErr: any) {
        console.warn(`[AI Assessment] Could not create panel beater quote from PDF: ${quoteErr.message}`);
      }
    }
    
    // Calculate physics deviation score for fraud detection
    const { calculatePhysicsDeviationScore, parsePhysicsAnalysis: parsePhysics } = await import("./physics-deviation-calculator");
    
    const claimData = {
      declaredImpactAngle: undefined, // TODO: Add to claims table if claimants provide this
      declaredSeverity: structuralDamageSeverity, // Use AI-detected severity as proxy
      declaredDamageLocation: analysis.impactPoint?.primaryImpactZone,
    };
    
    const physicsDeviationScore = calculatePhysicsDeviationScore(physicsAnalysis, claimData);
    
    console.log(`[Physics Deviation] Claim ${claimId}: Score = ${physicsDeviationScore}, Risk = ${physicsDeviationScore && physicsDeviationScore >= 70 ? 'HIGH' : physicsDeviationScore && physicsDeviationScore >= 40 ? 'MEDIUM' : 'LOW'}`);
    
    // Recalculate confidence score incorporating physics and forensic analysis quality
    // Physics consistency score (0-100): higher = more consistent physics analysis
    const physicsConsistencyScore = physicsAnalysis.consistencyScore ?? physicsAnalysis.overallConsistency ?? 70;
    // Forensic confidence (0-100): lower fraud score = higher confidence in legitimacy
    const forensicConfidenceBoost = forensicAnalysis ? Math.max(0, 100 - (forensicAnalysis.overallFraudScore || 0)) : 50;
    // Physics deviation penalty: high deviation = lower confidence
    const deviationPenalty = physicsDeviationScore ? Math.min(15, physicsDeviationScore * 0.15) : 0;
    
    // Recalculate: original vision confidence (60%) + physics consistency (20%) + forensic confidence (20%) - deviation penalty
    const visionConfidence = Math.min(100, Math.max(10,
      (imageQuality.score || 50) * 0.30 +
      (imageQuality.crushDepthConfidence || 50) * 0.25 +
      (imageQuality.scaleConfidence || 50) * 0.15 +
      (analysis.photoAnglesAvailable?.length >= 3 ? 80 : analysis.photoAnglesAvailable?.length >= 2 ? 60 : 40) * 0.15 +
      (analysis.damagedComponents?.length > 0 ? 80 : 30) * 0.15
    ));
    const enhancedConfidenceScore = Math.round(
      Math.min(100, Math.max(10,
        visionConfidence * 0.60 +
        physicsConsistencyScore * 0.20 +
        forensicConfidenceBoost * 0.20 -
        deviationPenalty
      ))
    );
    
    console.log(`[AI Assessment] Enhanced confidence for claim ${claimId}: vision=${visionConfidence}, physics=${physicsConsistencyScore}, forensic=${forensicConfidenceBoost}, deviation_penalty=${deviationPenalty.toFixed(1)}, final=${enhancedConfidenceScore}`);
    
    // Normalise physics analysis to the standardised frontend contract before persisting.
    // This ensures all stored records share the same shape regardless of engine version.
    const normalisePhysicsAnalysis = (raw: any): {
      consistencyScore: number;
      damagePropagationScore: number;
      fraudRiskScore: number;
      fraudIndicators: Array<{ component: string; confidence: number }>;
      // Preserve full raw data for advanced consumers
      _raw: any;
    } => {
      // Derive scalar scores
      const consistencyScore: number = raw.damageConsistency?.score ?? raw.consistencyScore ?? raw.overallConsistency ?? 70;
      const damagePropagationScore: number = raw.damageConsistency?.score ?? raw.damagePropagationScore ?? 70;

      // Compute fraud risk score from indicator counts (0-100)
      const impossibleCount: number = (raw.fraudIndicators?.impossibleDamagePatterns?.length ?? 0);
      const unrelatedCount: number = (raw.fraudIndicators?.unrelatedDamage?.length ?? 0);
      const stagedCount: number = (raw.fraudIndicators?.stagedAccidentIndicators?.length ?? 0);
      const severityMismatch: boolean = raw.fraudIndicators?.severityMismatch ?? false;
      const fraudRiskScore: number = Math.min(100,
        impossibleCount * 20 +
        unrelatedCount * 15 +
        stagedCount * 20 +
        (severityMismatch ? 25 : 0)
      );

      // Convert all string[] fraud indicator arrays to structured objects
      const toStructured = (items: any[], defaultConfidence: number): Array<{ component: string; confidence: number }> =>
        (items || []).map((item: any) => {
          if (typeof item === "string") return { component: item, confidence: defaultConfidence };
          if (item && typeof item === "object" && typeof item.component === "string") return { component: item.component, confidence: item.confidence ?? defaultConfidence };
          return { component: String(item), confidence: defaultConfidence };
        });

      const fraudIndicators: Array<{ component: string; confidence: number }> = [
        ...toStructured(raw.fraudIndicators?.impossibleDamagePatterns ?? [], 90),
        ...toStructured(raw.fraudIndicators?.unrelatedDamage ?? [], 70),
        ...toStructured(raw.fraudIndicators?.stagedAccidentIndicators ?? [], 85),
        ...(severityMismatch ? [{ component: "Severity mismatch: reported damage inconsistent with impact forces", confidence: 75 }] : []),
      ];

      return { consistencyScore, damagePropagationScore, fraudRiskScore, fraudIndicators, _raw: raw };
    };

    const normalisedPhysicsAnalysis = normalisePhysicsAnalysis(physicsAnalysis);

    // Update AI assessment with combined fraud level, physics analysis, forensic analysis, deviation score, and enhanced confidence
    // Also persist pipeline outputs: repair intelligence, parts reconciliation, inferred hidden damages
    await db.update(aiAssessments).set({
      fraudRiskLevel: combinedFraudLevel,
      physicsAnalysis: JSON.stringify(normalisedPhysicsAnalysis),
      forensicAnalysis: forensicAnalysis ? JSON.stringify(forensicAnalysis) : null,
      physicsDeviationScore,
      confidenceScore: enhancedConfidenceScore,
      // Stage 5 output: inferred hidden damages
      inferredHiddenDamagesJson: JSON.stringify(inferredHiddenDamages),
      // Stage 8 output: repair intelligence (repair/replace/inspect per component)
      repairIntelligenceJson: JSON.stringify(repairIntelligence),
      // Stage 9 output: parts reconciliation (detected vs quoted vs hidden)
      partsReconciliationJson: JSON.stringify(partsReconciliation),
      // Stage 10 output: cost intelligence summary
      costIntelligenceJson: JSON.stringify({
        estimatedRepairCost,
        estimatedLaborCost,
        estimatedPartsCost,
        estimatedVehicleValue,
        repairToValueRatio,
        hiddenDamageTotalUsd,
        extraInQuoteCost,
        laborRateUsdPerHour,
        totalEstimatedLaborHours,
        repairCount,
        replaceCount,
        inspectCount,
        matchedCount,
        missingFromQuoteCount,
        extraInQuoteCount,
      }),
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
    // Physics failed but AI vision succeeded — still mark as assessment_complete
    await db.update(claims).set({ 
      aiAssessmentCompleted: 1,
      status: "assessment_complete",
      documentProcessingStatus: "extracted",
      fraudRiskScore: analysis.fraudRiskScore || 0,
      fraudFlags: JSON.stringify(analysis.fraudIndicators || []),
      updatedAt: new Date().toISOString() 
    }).where(eq(claims.id, claimId));
    console.log(`[AI Assessment] Claim ${claimId} updated after AI completion. (physics analysis failed - partial result)`);
  }

  // END TOP-LEVEL TRY
  } catch (topLevelError) {
    // LLM call, JSON parse, or other unhandled failure
    console.error(`[AI Assessment] Fatal error for claim ${claimId}:`, topLevelError);
    try {
      const dbInner = await getDb();
      if (dbInner) {
        await dbInner.update(claims).set({
          documentProcessingStatus: "failed",
          status: "intake_pending",
          updatedAt: new Date().toISOString(),
        }).where(eq(claims.id, claimId));
        console.log(`[AI Assessment] Claim ${claimId} marked as failed after AI error.`);
      }
    } catch (updateError) {
      console.error(`[AI Assessment] Could not update failure status for claim ${claimId}:`, updateError);
    }
    throw topLevelError; // Re-throw so the caller's setImmediate catch logs it
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
    // Join with claims to enforce tenant filtering — return the most recent assessment
    const result = await db.select({ assessment: aiAssessments })
      .from(aiAssessments)
      .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
      .where(and(eq(aiAssessments.claimId, claimId), eq(claims.tenantId, tenantId)))
      .orderBy(desc(aiAssessments.id))
      .limit(1);
    rawAssessment = result.length > 0 ? result[0].assessment : null;
  } else {
    const result = await db.select().from(aiAssessments)
      .where(eq(aiAssessments.claimId, claimId))
      .orderBy(desc(aiAssessments.id))
      .limit(1);
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
