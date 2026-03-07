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
11. Driver identity: full name, driver's licence number, licence issue date, licence expiry date (if the licence does not expire, output 'does not expire'), date of birth, phone, email, national ID number, and the country that issued the licence
12. Third-party driver: name and licence number if mentioned
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
            // Driver / claimant identity fields — extracted via OCR from licence scans, police reports, or claim forms
            extractedDriverName: { type: "string" },
            extractedDriverLicenseNumber: { type: "string" },
            // ISO date string or descriptive text (e.g. 'does not expire', 'lifetime', 'permanent')
            extractedDriverLicenseIssueDate: { type: "string" },
            // NULL-equivalent values: 'does not expire', 'lifetime', 'permanent', 'no expiry'
            extractedDriverLicenseExpiryDate: { type: "string" },
            extractedDriverDateOfBirth: { type: "string" },
            extractedDriverPhone: { type: "string" },
            extractedDriverEmail: { type: "string" },
            extractedDriverNationalId: { type: "string" },
            extractedDriverLicenseCountry: { type: "string" },
            extractedThirdPartyDriverName: { type: "string" },
            extractedThirdPartyDriverLicense: { type: "string" },
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
          required: ["damageDescription", "damagedComponents", "maxCrushDepth", "crushDepthConfidence", "totalDamageArea", "structuralDamage", "airbagDeployment", "impactPoint", "accidentType", "referenceObjectsDetected", "photoAnglesAvailable", "imageQualityScore", "scaleCalibrationConfidence", "recommendResubmission", "multiVehicleData", "skidMarkData", "postCollisionMovement", "rolloverEvidence", "missingDataFlags", "estimatedCost", "laborCost", "partsCost", "fraudRiskScore", "fraudIndicators", "extractedVehicleMake", "extractedVehicleModel", "extractedVehicleYear", "extractedVehicleRegistration", "extractedVehicleVin", "extractedVehicleColour", "extractedVehicleEngineNumber", "extractedOwnerName", "extractedIncidentDate", "extractedIncidentDescription", "extractedIncidentLocation", "extractedIncidentType", "extractedRepairerName", "extractedRepairerCompany", "extractedThirdPartyVehicle", "extractedThirdPartyRegistration", "extractedDriverName", "extractedDriverLicenseNumber", "extractedDriverLicenseIssueDate", "extractedDriverLicenseExpiryDate", "extractedDriverDateOfBirth", "extractedDriverPhone", "extractedDriverEmail", "extractedDriverNationalId", "extractedDriverLicenseCountry", "extractedThirdPartyDriverName", "extractedThirdPartyDriverLicense", "extractedQuoteLineItems"],
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
  // STAGE 1b — DAMAGE PHOTO EXTRACTION
  // Extract images from PDF (if PDF mode) or build DamagePhoto objects from
  // uploaded photos (if photo mode). Persisted as damagePhotosJson.
  // ═══════════════════════════════════════════════════════════════════════════
  let extractedDamagePhotos: import('../shared/damage-photo-types').DamagePhoto[] = [];
  try {
    const { DamagePhoto: _DPType } = await import('../shared/damage-photo-types').catch(() => ({ DamagePhoto: null }));
    if (isPdfMode && pdfUrl) {
      // PDF mode: extract embedded images from the PDF
      console.log(`[Pipeline Stage 1b] Extracting images from PDF for claim ${claimId}`);
      try {
        const { extractImagesFromPDFUrl } = await import('./pdf-image-extractor');
        const extractedImages = await extractImagesFromPDFUrl(pdfUrl);
        console.log(`[Pipeline Stage 1b] Extracted ${extractedImages.length} images from PDF`);
        if (extractedImages.length > 0) {
          // Classify images via LLM vision
          const { invokeLLM: _llm } = await import('./_core/llm');
          const imageContents: any[] = extractedImages.slice(0, 15).map((img: any) => ({
            type: 'image_url' as const,
            image_url: { url: img.url, detail: 'low' as const },
          }));
          imageContents.push({
            type: 'text' as const,
            text: `I've shown you ${imageContents.length} images extracted from a vehicle damage assessment PDF.\n\nFor each image (numbered 1 to ${imageContents.length}), classify it and provide:\n- classification: 'damage_photo' or 'document'\n- description: brief description of what the image shows\n- detectedDamageArea: primary damage area visible (e.g. 'Front bumper deformation')\n- impactZone: front, rear, left, right, roof, undercarriage, or unknown\n- detectedComponents: array of {name, severity (minor/moderate/severe/total_loss), zone} objects\n\nAlso provide an overallDamageAssessment summary.`,
          });
          try {
            const classifyResp = await _llm({
              messages: [
                { role: 'system', content: 'You are an expert vehicle damage image classifier. Respond with JSON only.' },
                { role: 'user', content: imageContents },
              ],
              response_format: {
                type: 'json_schema',
                json_schema: {
                  name: 'image_classification',
                  strict: true,
                  schema: {
                    type: 'object',
                    properties: {
                      classifications: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            imageIndex: { type: 'integer' },
                            classification: { type: 'string' },
                            description: { type: 'string' },
                            detectedDamageArea: { type: 'string' },
                            impactZone: { type: 'string' },
                            detectedComponents: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  name: { type: 'string' },
                                  severity: { type: 'string' },
                                  zone: { type: 'string' },
                                },
                                required: ['name', 'severity', 'zone'],
                                additionalProperties: false,
                              },
                            },
                          },
                          required: ['imageIndex', 'classification', 'description', 'detectedDamageArea', 'impactZone', 'detectedComponents'],
                          additionalProperties: false,
                        },
                      },
                      overallDamageAssessment: { type: 'string' },
                    },
                    required: ['classifications', 'overallDamageAssessment'],
                    additionalProperties: false,
                  },
                },
              },
            });
            const classData = JSON.parse(classifyResp.choices[0].message.content as string);
            for (const cls of classData.classifications) {
              const imgIdx = cls.imageIndex - 1;
              if (imgIdx >= 0 && imgIdx < extractedImages.length) {
                const img = extractedImages[imgIdx] as any;
                extractedDamagePhotos.push({
                  imageUrl: img.url,
                  caption: cls.description || '',
                  detectedDamageArea: cls.detectedDamageArea || '',
                  detectedComponents: (cls.detectedComponents || []).map((c: any) => ({
                    name: c.name,
                    severity: c.severity as any,
                    zone: c.zone as any,
                  })),
                  impactZone: cls.impactZone ? {
                    zone: cls.impactZone,
                    colorClass: ['front','rear'].includes(cls.impactZone) ? 'red' : ['left','right'].includes(cls.impactZone) ? 'orange' : 'gray',
                    confidence: 70,
                  } : undefined,
                  source: img.source === 'embedded_image' ? 'pdf_embedded' : 'pdf_page_render',
                  pageNumber: img.pageNumber,
                  classification: cls.classification === 'damage_photo' ? 'damage_photo' : 'document',
                  overallAssessment: classData.overallDamageAssessment || '',
                });
              }
            }
            console.log(`[Pipeline Stage 1b] Classified ${extractedDamagePhotos.filter(p => p.classification === 'damage_photo').length} damage photos, ${extractedDamagePhotos.filter(p => p.classification === 'document').length} document images`);
          } catch (classErr: any) {
            // Fallback: treat all extracted images as damage photos
            console.warn(`[Pipeline Stage 1b] LLM classification failed, using fallback: ${classErr.message}`);
            extractedDamagePhotos = extractedImages.map((img: any) => ({
              imageUrl: img.url,
              caption: `Page ${img.pageNumber} — vehicle damage photo`,
              detectedDamageArea: 'Vehicle damage',
              detectedComponents: [],
              source: img.source === 'embedded_image' ? 'pdf_embedded' : 'pdf_page_render',
              pageNumber: img.pageNumber,
              classification: 'damage_photo' as const,
            }));
          }
        }
      } catch (extractErr: any) {
        console.warn(`[Pipeline Stage 1b] PDF image extraction failed: ${extractErr.message}`);
        // Retry with a simpler extraction approach
        try {
          const { extractImagesFromPDFUrl } = await import('./pdf-image-extractor');
          const retryImages = await extractImagesFromPDFUrl(pdfUrl, { strategy: 'page_render_only' });
          extractedDamagePhotos = retryImages.map((img: any) => ({
            imageUrl: img.url,
            caption: `Page ${img.pageNumber} — vehicle damage photo`,
            detectedDamageArea: 'Vehicle damage',
            detectedComponents: [],
            source: 'pdf_page_render' as const,
            pageNumber: img.pageNumber,
            classification: 'damage_photo' as const,
          }));
          console.log(`[Pipeline Stage 1b] Retry extracted ${retryImages.length} images`);
        } catch (retryErr: any) {
          console.warn(`[Pipeline Stage 1b] Retry also failed: ${retryErr.message}`);
        }
      }
    } else if (damagePhotos.length > 0) {
      // Photo mode: build DamagePhoto objects from uploaded photo URLs
      console.log(`[Pipeline Stage 1b] Building DamagePhoto objects from ${damagePhotos.length} uploaded photos`);
      extractedDamagePhotos = damagePhotos.map((url: string) => ({
        imageUrl: url,
        caption: 'Uploaded damage photo',
        detectedDamageArea: 'Vehicle damage',
        detectedComponents: [],
        source: 'uploaded' as const,
        classification: 'damage_photo' as const,
      }));
    }
    console.log(`[Pipeline Stage 1b] Total damage photos: ${extractedDamagePhotos.filter(p => p.classification === 'damage_photo').length}`);
  } catch (stage1bErr: any) {
    console.warn(`[Pipeline Stage 1b] Failed: ${stage1bErr.message}`);
  }

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
  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 5 — DAMAGE PROPAGATION  (physics-based, force-gated)
  // Derives hidden damage from: impact location, force propagation chains,
  // and vehicle structural layout. Probability is scored 0–100 and decays
  // along each propagation path. Nodes beyond the 20 kN threshold are only
  // emitted when the computed impact force exceeds that value.
  // NOTE: This stage is defined here but EXECUTED after Stage 6 so that the
  //       actual impactForce from the physics engine can be used.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[Pipeline Stage 5] Damage propagation inference (deferred to post-physics)`);

  interface InferredHiddenDamage {
    component: string;           // Vehicle-specific part name
    reason: string;              // Physics-derived explanation with actual quantities
    probability: number;         // 0–100, derived from physics latentDamageProbability + force thresholds
    confidenceLabel: 'High' | 'Medium' | 'Low';  // derived from probability
    propagationStep: number;     // 1 = first node in chain, 2 = second, etc.
    chain: 'front' | 'rear' | 'side_driver' | 'side_passenger' | 'rollover' | 'general';
    estimatedCostUsd: number;    // Scaled with energyDissipated kJ × component repair index
    // Physics traceability — all values from physics engine
    physicsForceKn: number;      // Impact force at this propagation step (kN)
    physicsEnergyKj: number;     // Energy dissipated at this step (kJ)
    physicsSpeedKmh: number;     // Estimated impact speed (km/h)
    physicsDeltaV: number;       // Velocity change (km/h)
  }

  /**
   * Fully quantitative, physics-driven hidden damage inference.
   *
   * All probabilities are derived from the physics engine's latentDamageProbability
   * values (engine/transmission/suspension/frame/electrical) plus quantitative
   * force thresholds. Component names are vehicle-specific from the component resolver.
   * Costs scale with energyDissipated (kJ) × component repair index.
   *
   * @param components      - AI-detected damaged components
   * @param impactPoint     - raw impact point string from LLM
   * @param incidentType    - canonical incident type
   * @param physics         - full PhysicsAnalysisResult from physics engine
   * @param vehicleInfo     - make/model/year/powertrain/vehicleType for component resolver
   */
  const inferHiddenDamages = (
    components: any[],
    impactPoint: string,
    incidentType: CanonicalIncidentType,
    physics: any,  // PhysicsAnalysisResult | null
    vehicleInfo: { make: string; model: string; year: number | null; powertrain: 'ice'|'bev'|'phev'|'hev'; vehicleType: 'sedan'|'suv'|'pickup'|'van'|'truck'|'sports'|'compact' }
  ): InferredHiddenDamage[] => {
    if (incidentType !== 'collision') return [];

    // ── Extract all physics quantities ─────────────────────────────────────
    const impactForceN: number = (() => {
      const f = physics?.impactForce;
      if (!f) return 0;
      if (typeof f === 'number') return f;
      if (typeof f === 'object' && 'magnitude' in f) return f.magnitude || 0;
      return 0;
    })();
    const impactForceKn = impactForceN / 1000;
    const energyDissipatedJ: number  = physics?.energyDissipated || 0;
    const energyDissipatedKj: number = energyDissipatedJ / 1000;
    const speedKmh: number           = physics?.estimatedSpeed?.value || 0;
    const deltaV: number             = physics?.deltaV || 0;
    const accidentSev: string        = physics?.accidentSeverity || 'unknown';
    const collisionType: string      = physics?.collisionType || 'unknown';
    const primaryZone: string        = physics?.primaryImpactZone || '';
    // latentDamageProbability from physics engine (0–100 per zone)
    const latent = physics?.latentDamageProbability || { engine: 0, transmission: 0, suspension: 0, frame: 0, electrical: 0 };

    // ── Resolve vehicle-specific component names ───────────────────────────
    const { resolveVehicleComponents, addEvHybridComponents } = require('./vehicle-components');
    let vc = resolveVehicleComponents(
      vehicleInfo.make, vehicleInfo.model, vehicleInfo.year,
      vehicleInfo.powertrain, vehicleInfo.vehicleType
    );
    if (vehicleInfo.powertrain !== 'ice') {
      vc = addEvHybridComponents(vc, vehicleInfo.make, vehicleInfo.model, vehicleInfo.powertrain);
    }

    // ── Cost scaling: base costs × energy severity index ──────────────────
    // Energy severity index: 1.0 at 10 kJ, scales up to 3.0 at 100+ kJ
    // Based on: repair cost ∝ √(energyDissipated) (empirical from IIHS data)
    const energySeverityIndex = energyDissipatedKj > 0
      ? Math.min(3.0, Math.max(1.0, Math.sqrt(energyDissipatedKj / 10)))
      : 1.0;
    const scaleCost = (baseCostUsd: number): number =>
      Math.round(baseCostUsd * energySeverityIndex);

    // ── Severity gate: suppress structural chain inferences for cosmetic/minor damage ──
    // Thresholds based on IIHS/NHTSA crash test data:
    //   < 5 kN  = parking bump / scratch — no structural propagation
    //   5–15 kN = low-speed urban — cosmetic + first absorber only
    //   15–25 kN = moderate — full front chain up to radiator support
    //   25–40 kN = severe — engine mounts, steering rack
    //   > 40 kN = catastrophic — transmission, frame rails, axle geometry
    const isCosmeticOnly = (
      accidentSev === 'none' ||
      accidentSev === 'cosmetic' ||
      accidentSev === 'scratch' ||
      accidentSev === 'reversal' ||
      (impactForceKn > 0 && impactForceKn < 5) // < 5 kN = parking bump / scratch
    );
    // Also suppress if only 1 component detected and it's purely cosmetic
    const cosmeticOnlyComponents = ['scratch', 'scuff', 'dent', 'paint', 'bumper cover', 'trim'];
    const allCosmetic = components.length <= 1 &&
      components.every((c: any) => cosmeticOnlyComponents.some(kw => (c.name || '').toLowerCase().includes(kw)));
    if (isCosmeticOnly || allCosmetic) return []; // No hidden damage for cosmetic incidents

    const hidden: InferredHiddenDamage[] = [];
    const detected = components.map((c: any) => (c.name || '').toLowerCase());
    const impact   = (impactPoint || '').toLowerCase();

    // ── Impact direction detection ──────────────────────────────────────────
    // Use physics engine's primaryImpactZone first, then fall back to component/description analysis
    const physicsZone = (primaryZone || collisionType || '').toLowerCase();
    const hasFront = physicsZone.includes('front') || physicsZone.includes('frontal') ||
      impact.includes('front') ||
      detected.some(n => n.includes('bumper') || n.includes('bonnet') || n.includes('hood') ||
                         n.includes('grille') || n.includes('headlight') || n.includes('headlamp') ||
                         n.includes('fender') || n.includes('front wing') || n.includes('front panel'));
    const hasRear  = physicsZone.includes('rear') ||
      impact.includes('rear') ||
      detected.some(n => n.includes('boot') || n.includes('trunk') || n.includes('rear bumper') ||
                         n.includes('tailgate') || n.includes('tail light') || n.includes('tail lamp'));
    const hasSideDriver    = physicsZone.includes('driver') || physicsZone.includes('side_driver') ||
      (impact.includes('side') && (impact.includes('driver') || impact.includes('left') || impact.includes('r/h') || impact.includes('rh'))) ||
      detected.some(n => (n.includes('driver') || n.includes('left') || n.includes('r/h') || n.includes('rh')) && (n.includes('door') || n.includes('sill') || n.includes('fender')));
    const hasSidePassenger = physicsZone.includes('passenger') || physicsZone.includes('side_passenger') ||
      (impact.includes('side') && (impact.includes('passenger') || impact.includes('right') || impact.includes('l/h') || impact.includes('lh'))) ||
      detected.some(n => (n.includes('passenger') || n.includes('right') || n.includes('l/h') || n.includes('lh')) && (n.includes('door') || n.includes('sill') || n.includes('fender')));
    const hasSide = hasSideDriver || hasSidePassenger ||
      physicsZone.includes('side') ||
      (impact.includes('side') && !hasFront && !hasRear) ||
      detected.some(n => n.includes('door') || n.includes('sill') || n.includes('quarter panel'));
    const hasRollover = physicsZone.includes('rollover') || impact.includes('rollover') || accidentSev === 'rollover';

    // ── Quantitative force thresholds (IIHS/NHTSA engineering data) ──────────
    // These thresholds correspond to structural deformation onset forces:
    //   8 kN  = bumper beam deformation onset (low-speed)
    //  15 kN  = radiator support deformation onset (urban collision)
    //  25 kN  = engine mount stress threshold (moderate collision)
    //  35 kN  = steering rack displacement threshold
    //  45 kN  = frame rail deformation onset
    //  60 kN  = transmission mount failure threshold
    //  75 kN  = catastrophic structural collapse
    const threshold = {
      bumperBeam:      8,   // kN — first absorber deforms
      radiatorSupport: 15,  // kN — radiator support deforms
      engineMounts:    25,  // kN — engine mount stress
      steeringRack:    35,  // kN — steering geometry displacement
      frameRail:       45,  // kN — frame rail deformation
      transmission:    60,  // kN — transmission mount failure
      catastrophic:    75,  // kN — structural collapse
    };
    const highForce      = impactForceKn >= threshold.radiatorSupport;
    const severeForce    = impactForceKn >= threshold.steeringRack;
    const catastrophic   = impactForceKn >= threshold.catastrophic || accidentSev === 'catastrophic';

    // ── Helper: only add if not already detected ────────────────────────────
    const alreadyDetected = (...keywords: string[]): boolean =>
      keywords.some(kw => detected.some(n => n.includes(kw)));

    const add = (
      chain: InferredHiddenDamage['chain'],
      step: number,
      component: string,
      reason: string,
      probability: number,
      baseCostUsd: number
    ) => {
      if (probability < 5) return; // prune negligible inferences
      const confidenceLabel: InferredHiddenDamage['confidenceLabel'] =
        probability >= 70 ? 'High' : probability >= 40 ? 'Medium' : 'Low';
      // Cost scales with energy severity index (√(E_kJ/10), capped at 3×)
      const estimatedCostUsd = scaleCost(baseCostUsd);
      hidden.push({
        component, reason, probability, confidenceLabel,
        propagationStep: step, chain, estimatedCostUsd,
        physicsForceKn: impactForceKn,
        physicsEnergyKj: energyDissipatedKj,
        physicsSpeedKmh: speedKmh,
        physicsDeltaV: deltaV,
      });
    };

    // ════════════════════════════════════════════════════════════════════════
    // FRONT IMPACT PROPAGATION CHAIN
    // Thresholds: IIHS/NHTSA structural deformation onset forces
    // Probabilities: derived from physics latentDamageProbability + force thresholds
    // Costs: base × energySeverityIndex (√(E_kJ/10))
    // ════════════════════════════════════════════════════════════════════════
    if (hasFront) {
      // Step 1 — Front bumper reinforcement beam (deforms at >8 kN)
      // Always inferred for front impact; probability from frame latent + force gate
      if (!alreadyDetected('crash bar', 'bumper beam', 'front beam', 'reinforcement bar')) {
        const prob = Math.min(95, Math.max(65,
          (latent.frame || 50) * 0.6 +
          (impactForceKn >= threshold.bumperBeam ? 35 : 15)
        ));
        add('front', 1, vc.frontBumperBeam,
          `Front bumper reinforcement beam is the first structural energy absorber. ` +
          `At ${impactForceKn.toFixed(1)} kN (${energyDissipatedKj.toFixed(1)} kJ dissipated), ` +
          `deformation onset threshold of ${threshold.bumperBeam} kN is ${impactForceKn >= threshold.bumperBeam ? 'exceeded' : 'approached'}. ` +
          `Physics frame damage probability: ${(latent.frame || 0).toFixed(0)}%.`,
          Math.round(prob), 280);
      }

      // Step 2 — Radiator support / front subframe (deforms at >15 kN)
      if (!alreadyDetected('radiator support', 'subframe', 'front subframe', 'core support')) {
        const prob = Math.min(90, Math.max(30,
          (latent.frame || 40) * 0.7 +
          (impactForceKn >= threshold.radiatorSupport ? 30 : 5)
        ));
        add('front', 2, vc.radiatorSupport,
          `Force propagates from bumper beam to radiator core support. ` +
          `Deformation threshold: ${threshold.radiatorSupport} kN. ` +
          `Actual force: ${impactForceKn.toFixed(1)} kN (${impactForceKn >= threshold.radiatorSupport ? 'threshold exceeded' : 'below threshold — inspect for micro-deformation'}). ` +
          `Energy dissipated: ${energyDissipatedKj.toFixed(1)} kJ. Frame latent probability: ${(latent.frame || 0).toFixed(0)}%.`,
          Math.round(prob), 420);
      }

      // Step 3 — Radiator (behind radiator support)
      if (!alreadyDetected('radiator')) {
        const prob = Math.min(88, Math.max(25,
          (latent.engine || 35) * 0.5 +
          (impactForceKn >= threshold.radiatorSupport ? 35 : 10)
        ));
        add('front', 3, vc.radiator,
          `Cooling radiator is mounted directly behind the core support. ` +
          `At ${impactForceKn.toFixed(1)} kN / ${energyDissipatedKj.toFixed(1)} kJ, ` +
          `core support deformation (threshold: ${threshold.radiatorSupport} kN) ` +
          `${impactForceKn >= threshold.radiatorSupport ? 'is confirmed — radiator contact likely' : 'may cause radiator displacement'}. ` +
          `Engine zone latent probability: ${(latent.engine || 0).toFixed(0)}%.`,
          Math.round(prob), 350);
      }

      // Step 3b — AC condenser (alongside radiator)
      if (!alreadyDetected('condenser', 'ac condenser')) {
        const prob = Math.min(85, Math.max(20,
          (latent.engine || 30) * 0.45 +
          (impactForceKn >= threshold.radiatorSupport ? 30 : 8)
        ));
        add('front', 3, vc.acCondenser,
          `AC condenser is mounted in front of or alongside the radiator in the same impact zone. ` +
          `Impact force ${impactForceKn.toFixed(1)} kN / ${energyDissipatedKj.toFixed(1)} kJ. ` +
          `Shares identical exposure to radiator support deformation. ` +
          `Engine zone latent probability: ${(latent.engine || 0).toFixed(0)}%.`,
          Math.round(prob), 290);
      }

      // Step 4 — Engine mounts (force-gated at 25 kN)
      if (impactForceKn >= threshold.engineMounts && !alreadyDetected('engine mount', 'motor mount')) {
        const prob = Math.min(88, Math.max(40,
          (latent.engine || 50) * 0.7 +
          (impactForceKn >= threshold.steeringRack ? 20 : 5)
        ));
        add('front', 4, vc.engineMounts,
          `Impact force ${impactForceKn.toFixed(1)} kN exceeds engine mount stress threshold of ${threshold.engineMounts} kN. ` +
          `Energy dissipated: ${energyDissipatedKj.toFixed(1)} kJ. ` +
          `Engine mounts absorb residual structural loads; micro-fractures and misalignment likely at this force level. ` +
          `Engine zone latent probability: ${(latent.engine || 0).toFixed(0)}%.`,
          Math.round(prob), 320);
      }

      // Step 4b — Front subframe (force-gated at 25 kN)
      if (impactForceKn >= threshold.engineMounts && !alreadyDetected('subframe', 'front subframe', 'crossmember')) {
        const prob = Math.min(82, Math.max(35,
          (latent.frame || 45) * 0.65 +
          (impactForceKn >= threshold.frameRail ? 20 : 5)
        ));
        add('front', 4, vc.frontSubframe,
          `Front suspension subframe/crossmember is force-coupled to the radiator support. ` +
          `At ${impactForceKn.toFixed(1)} kN (threshold: ${threshold.engineMounts} kN), ` +
          `subframe bolt holes may elongate and mounting points may deform. ` +
          `Frame zone latent probability: ${(latent.frame || 0).toFixed(0)}%.`,
          Math.round(prob), 380);
      }

      // Step 5 — Steering rack (force-gated at 35 kN)
      if (impactForceKn >= threshold.steeringRack && !alreadyDetected('steering rack', 'steering column', 'rack', 'steering')) {
        const prob = Math.min(80, Math.max(35,
          (latent.suspension || 45) * 0.6 +
          (impactForceKn >= threshold.frameRail ? 20 : 5)
        ));
        add('front', 5, vc.steeringRack,
          `Steering rack displacement threshold of ${threshold.steeringRack} kN exceeded (actual: ${impactForceKn.toFixed(1)} kN). ` +
          `At ${energyDissipatedKj.toFixed(1)} kJ dissipated energy, steering geometry can be displaced without visible external damage. ` +
          `Suspension zone latent probability: ${(latent.suspension || 0).toFixed(0)}%.`,
          Math.round(prob), 480);
      }

      // Step 5b — Transmission / gearbox (catastrophic only, >60 kN)
      if (impactForceKn >= threshold.transmission && !alreadyDetected('transmission', 'gearbox', 'transaxle')) {
        const prob = Math.min(78, Math.max(30,
          (latent.transmission || 40) * 0.7 +
          (impactForceKn >= threshold.catastrophic ? 20 : 5)
        ));
        add('front', 5, vc.transmissionMount,
          `Catastrophic impact force ${impactForceKn.toFixed(1)} kN (threshold: ${threshold.transmission} kN) may displace powertrain. ` +
          `Energy: ${energyDissipatedKj.toFixed(1)} kJ. ` +
          `Transmission mount integrity compromised; gearbox alignment affected. ` +
          `Transmission zone latent probability: ${(latent.transmission || 0).toFixed(0)}%.`,
          Math.round(prob), 600);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // REAR IMPACT PROPAGATION CHAIN
    // ════════════════════════════════════════════════════════════════════════
    if (hasRear) {
      // Step 1 — Rear bumper reinforcement
      if (!alreadyDetected('rear bumper beam', 'rear beam', 'rear reinforcement')) {
        const prob = Math.min(92, Math.max(60,
          (latent.frame || 50) * 0.55 +
          (impactForceKn >= threshold.bumperBeam ? 35 : 15)
        ));
        add('rear', 1, vc.rearBumperBeam,
          `Rear bumper reinforcement is the first structural absorber in rear impacts. ` +
          `Force: ${impactForceKn.toFixed(1)} kN, energy: ${energyDissipatedKj.toFixed(1)} kJ. ` +
          `Frame zone latent probability: ${(latent.frame || 0).toFixed(0)}%.`,
          Math.round(prob), 220);
      }

      // Step 2 — Boot floor / trunk floor
      if (!alreadyDetected('boot floor', 'trunk floor', 'boot panel', 'load bed')) {
        const prob = Math.min(88, Math.max(25,
          (latent.frame || 40) * 0.65 +
          (impactForceKn >= threshold.radiatorSupport ? 28 : 5)
        ));
        add('rear', 2, vc.bootFloor,
          `Force propagates from rear bumper beam into boot floor structure. ` +
          `At ${impactForceKn.toFixed(1)} kN / ${energyDissipatedKj.toFixed(1)} kJ, ` +
          `deformation threshold of ${threshold.radiatorSupport} kN is ${impactForceKn >= threshold.radiatorSupport ? 'exceeded' : 'approached'}. ` +
          `Frame zone latent probability: ${(latent.frame || 0).toFixed(0)}%.`,
          Math.round(prob), 380);
      }

      // Step 3 — Rear chassis rails
      if (!alreadyDetected('chassis rail', 'rear rail', 'rear frame', 'ladder frame')) {
        const prob = Math.min(82, Math.max(20,
          (latent.frame || 35) * 0.6 +
          (impactForceKn >= threshold.engineMounts ? 25 : 5)
        ));
        add('rear', 3, vc.rearChassisRails,
          `Longitudinal chassis rails absorb residual impact energy after boot floor deformation. ` +
          `Force: ${impactForceKn.toFixed(1)} kN (deformation threshold: ${threshold.engineMounts} kN). ` +
          `Energy: ${energyDissipatedKj.toFixed(1)} kJ. Frame zone latent probability: ${(latent.frame || 0).toFixed(0)}%.`,
          Math.round(prob), 550);
      }

      // Step 4 — Fuel tank (force-gated at 15 kN)
      if (impactForceKn >= threshold.radiatorSupport && !alreadyDetected('fuel tank', 'fuel', 'tank')) {
        const prob = Math.min(78, Math.max(30,
          (latent.frame || 40) * 0.5 + 20
        ));
        add('rear', 4, vc.fuelTank,
          `Impact force ${impactForceKn.toFixed(1)} kN (threshold: ${threshold.radiatorSupport} kN) can deform fuel tank mounting brackets and filler neck. ` +
          `Energy: ${energyDissipatedKj.toFixed(1)} kJ. Frame zone latent probability: ${(latent.frame || 0).toFixed(0)}%.`,
          Math.round(prob), 420);
      }

      // Step 5 — Rear axle / differential (severe force, >35 kN)
      if (impactForceKn >= threshold.steeringRack && !alreadyDetected('differential', 'rear axle', 'axle', 'torsion beam')) {
        const prob = Math.min(75, Math.max(25,
          (latent.suspension || 35) * 0.6 + 15
        ));
        add('rear', 5, vc.rearAxle,
          `High-energy rear impact ${impactForceKn.toFixed(1)} kN (threshold: ${threshold.steeringRack} kN) can misalign rear axle geometry. ` +
          `ΔV: ${deltaV.toFixed(1)} km/h. Energy: ${energyDissipatedKj.toFixed(1)} kJ. ` +
          `Suspension zone latent probability: ${(latent.suspension || 0).toFixed(0)}%.`,
          Math.round(prob), 520);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIDE IMPACT PROPAGATION CHAIN
    // ════════════════════════════════════════════════════════════════════════
    if (hasSide) {
      const side: 'driver' | 'passenger' = hasSideDriver ? 'driver' : 'passenger';
      const chain = hasSideDriver ? 'side_driver' as const : 'side_passenger' as const;

      // Step 1 — Door intrusion beam
      if (!alreadyDetected('intrusion beam', 'side impact beam', 'door beam')) {
        const prob = Math.min(90, Math.max(55,
          (latent.frame || 50) * 0.5 +
          (impactForceKn >= threshold.bumperBeam ? 35 : 15)
        ));
        add(chain, 1, vc.doorIntrusionBeam(side),
          `Door intrusion beam is the first structural absorber in lateral collisions; deformation is rarely visible externally. ` +
          `Force: ${impactForceKn.toFixed(1)} kN, energy: ${energyDissipatedKj.toFixed(1)} kJ. ` +
          `Frame zone latent probability: ${(latent.frame || 0).toFixed(0)}%.`,
          Math.round(prob), 200);
      }

      // Step 2 — B-pillar (deforms at >15 kN lateral)
      if (!alreadyDetected('b-pillar', 'b pillar', 'b pillar')) {
        const prob = Math.min(85, Math.max(30,
          (latent.frame || 40) * 0.65 +
          (impactForceKn >= threshold.radiatorSupport ? 28 : 5)
        ));
        add(chain, 2, vc.bPillar(side),
          `Force propagates from door intrusion beam into B-pillar. ` +
          `Lateral deformation threshold: ${threshold.radiatorSupport} kN. ` +
          `Actual force: ${impactForceKn.toFixed(1)} kN. Energy: ${energyDissipatedKj.toFixed(1)} kJ. ` +
          `Frame zone latent probability: ${(latent.frame || 0).toFixed(0)}%.`,
          Math.round(prob), 650);
      }

      // Step 3 — Rocker sill (force-gated at 15 kN)
      if (impactForceKn >= threshold.radiatorSupport && !alreadyDetected('floor structure', 'rocker', 'sill beam', 'sill')) {
        const prob = Math.min(80, Math.max(25,
          (latent.frame || 35) * 0.6 +
          (impactForceKn >= threshold.engineMounts ? 20 : 5)
        ));
        add(chain, 3, vc.rockerSill(side),
          `Lateral impact loads transfer to rocker sill at ${impactForceKn.toFixed(1)} kN. ` +
          `Energy: ${energyDissipatedKj.toFixed(1)} kJ. ΔV: ${deltaV.toFixed(1)} km/h. ` +
          `Frame zone latent probability: ${(latent.frame || 0).toFixed(0)}%.`,
          Math.round(prob), 480);
      }

      // Step 4 — A-pillar (severe force, >35 kN)
      if (impactForceKn >= threshold.steeringRack && !alreadyDetected('a-pillar', 'a pillar', 'windscreen pillar')) {
        const prob = Math.min(75, Math.max(25,
          (latent.frame || 40) * 0.55 + 15
        ));
        add(chain, 4, vc.aPillar(side),
          `Severe lateral force ${impactForceKn.toFixed(1)} kN (threshold: ${threshold.steeringRack} kN) may propagate to A-pillar and roof rail. ` +
          `Energy: ${energyDissipatedKj.toFixed(1)} kJ. Frame zone latent probability: ${(latent.frame || 0).toFixed(0)}%.`,
          Math.round(prob), 720);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // ROLLOVER PROPAGATION
    // ════════════════════════════════════════════════════════════════════════
    if (hasRollover) {
      if (!alreadyDetected('roof structure', 'roof panel')) {
        add('general', 1, 'Roof structure / pillars',
          'Rollover accidents cause compressive loading on all roof pillars and roof structure',
          85, 900);
      }
      if (!alreadyDetected('windshield', 'windscreen')) {
        add('general', 2, 'Windshield / rear glass',
          'Glass panels are typically shattered or cracked during rollover events',
          75, 350);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // GENERAL HIGH-ENERGY PROPAGATION (any direction, force-gated at 15 kN)
    // ════════════════════════════════════════════════════════════════════════
    if (impactForceKn >= threshold.radiatorSupport) {
      // Suspension geometry — always affected by structural deformation
      if (!alreadyDetected('wheel alignment', 'suspension geometry', 'alignment', 'camber', 'caster', 'toe')) {
        const prob = Math.min(95, Math.max(55,
          (latent.suspension || 60) * 0.7 +
          (impactForceKn >= threshold.engineMounts ? 20 : 5)
        ));
        add('general', 1, vc.suspensionGeometry,
          `Structural deformation at ${impactForceKn.toFixed(1)} kN / ${energyDissipatedKj.toFixed(1)} kJ almost always affects suspension geometry. ` +
          `ΔV: ${deltaV.toFixed(1)} km/h. Alignment check mandatory. ` +
          `Suspension zone latent probability: ${(latent.suspension || 0).toFixed(0)}%.`,
          Math.round(prob), 130);
      }

      // Wiring harness routed through impact zone
      if (!alreadyDetected('wiring harness', 'wiring', 'harness', 'loom')) {
        const prob = Math.min(80, Math.max(35,
          (latent.electrical || 40) * 0.65 +
          (impactForceKn >= threshold.engineMounts ? 15 : 5)
        ));
        add('general', 2, vc.wiringHarness,
          `Impact force ${impactForceKn.toFixed(1)} kN can pinch or sever wiring harnesses routed through damaged panels. ` +
          `Energy: ${energyDissipatedKj.toFixed(1)} kJ. Electrical zone latent probability: ${(latent.electrical || 0).toFixed(0)}%.`,
          Math.round(prob), 220);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // EV/HYBRID HIGH-VOLTAGE SYSTEM (BEV/PHEV/HEV only)
    // ════════════════════════════════════════════════════════════════════════
    if (vehicleInfo.powertrain !== 'ice' && vc.hvBattery && impactForceKn >= threshold.radiatorSupport) {
      if (!alreadyDetected('battery', 'hv battery', 'high voltage', 'inverter')) {
        const prob = Math.min(88, Math.max(40,
          (latent.electrical || 50) * 0.7 +
          (hasFront || hasRear ? 20 : 10)  // underfloor battery exposed in front/rear impacts
        ));
        add('general', 3, vc.hvBattery!,
          `High-voltage battery pack is underfloor-mounted and exposed to structural deformation. ` +
          `Force: ${impactForceKn.toFixed(1)} kN / ${energyDissipatedKj.toFixed(1)} kJ. ` +
          `HV system inspection mandatory before any repair work. ` +
          `Electrical zone latent probability: ${(latent.electrical || 0).toFixed(0)}%.`,
          Math.round(prob), 800);
      }
      if (vc.hvCabling && !alreadyDetected('hv cable', 'orange cable', 'high voltage cable')) {
        add('general', 4, vc.hvCabling!,
          `HV orange cabling routes through impact zone. ` +
          `Force: ${impactForceKn.toFixed(1)} kN. Insulation damage risk at this energy level (${energyDissipatedKj.toFixed(1)} kJ). ` +
          `Electrical zone latent probability: ${(latent.electrical || 0).toFixed(0)}%.`,
          Math.min(75, Math.max(30, (latent.electrical || 40) * 0.6 + 15)), 350);
      }
    }

    // Sort by probability descending, then by propagation step ascending
    hidden.sort((a, b) => b.probability - a.probability || a.propagationStep - b.propagationStep);
    return hidden;
  };

  // NOTE: inferredHiddenDamages is populated AFTER Stage 6 (physics) so that
  // impactForce is available. Declared here with a placeholder; overwritten below.
  let inferredHiddenDamages: InferredHiddenDamage[] = [];
  console.log(`[Pipeline Stage 5] Damage propagation engine ready (will execute post-physics)`);


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

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 10b — INDEPENDENT AI BENCHMARK COST
  // Computes an AI-independent repair cost estimate from component-level market rates.
  // This is SEPARATE from the document-extracted cost (estimatedRepairCost above).
  // Used to validate whether the submitted quote is within a fair market range.
  // Market rates: Zimbabwe USD market (2024 benchmarks)
  // ═══════════════════════════════════════════════════════════════════════════
  const PART_BENCHMARK_USD: Record<string, { repair: number; replace: number }> = {
    // Exterior panels
    'bumper': { repair: 80, replace: 180 },
    'fender': { repair: 120, replace: 250 },
    'bonnet': { repair: 150, replace: 350 },
    'hood': { repair: 150, replace: 350 },
    'door': { repair: 200, replace: 450 },
    'quarter panel': { repair: 200, replace: 500 },
    'rocker panel': { repair: 100, replace: 220 },
    'trunk': { repair: 150, replace: 350 },
    'boot': { repair: 150, replace: 350 },
    // Lighting
    'headlamp': { repair: 30, replace: 120 },
    'headlight': { repair: 30, replace: 120 },
    'taillight': { repair: 30, replace: 80 },
    'fog light': { repair: 20, replace: 60 },
    // Glass
    'windshield': { repair: 50, replace: 200 },
    'windscreen': { repair: 50, replace: 200 },
    'window': { repair: 40, replace: 120 },
    'mirror': { repair: 30, replace: 90 },
    // Structural
    'frame': { repair: 500, replace: 1500 },
    'subframe': { repair: 300, replace: 800 },
    'pillar': { repair: 400, replace: 1200 },
    'crossmember': { repair: 200, replace: 600 },
    // Mechanical
    'radiator': { repair: 80, replace: 250 },
    'condenser': { repair: 60, replace: 180 },
    'suspension': { repair: 150, replace: 400 },
    'wheel': { repair: 50, replace: 150 },
    'tire': { repair: 20, replace: 80 },
    'axle': { repair: 200, replace: 600 },
    'engine mount': { repair: 60, replace: 150 },
    // Interior
    'dashboard': { repair: 100, replace: 400 },
    'airbag': { repair: 0, replace: 600 },
    'seat': { repair: 80, replace: 300 },
    // Default
    'default': { repair: 100, replace: 250 },
  };

  // Severity multiplier for replacement cost
  const SEVERITY_MULTIPLIER: Record<string, number> = {
    'minor': 0.5,    // repair only
    'moderate': 0.8, // repair or partial replace
    'severe': 1.0,   // full replace
    'total_loss': 1.2, // replace + associated
    'catastrophic': 1.5,
  };

  // Compute independent benchmark cost from detected components
  let aiBenchmarkPartsCentsTotal = 0;
  for (const comp of damagedComponents) {
    const compNameLower = (comp.name || '').toLowerCase();
    const severity = (comp.severity || 'moderate').toLowerCase();
    const action = repairIntelligence.find(r => r.component.toLowerCase() === compNameLower)?.action || 'replace';
    // Find best matching benchmark key
    const benchmarkKey = Object.keys(PART_BENCHMARK_USD).find(k => compNameLower.includes(k)) || 'default';
    const benchmark = PART_BENCHMARK_USD[benchmarkKey];
    const baseUsd = action === 'repair' ? benchmark.repair : benchmark.replace;
    const multiplier = SEVERITY_MULTIPLIER[severity] || 1.0;
    aiBenchmarkPartsCentsTotal += Math.round(baseUsd * multiplier * 100);
  }

  const aiBenchmarkLaborCents = laborCostFromIntelligence > 0 ? laborCostFromIntelligence : Math.round(totalEstimatedLaborHours * laborRateUsdPerHour * 100);
  const aiBenchmarkHiddenCents = hiddenDamageCostCents; // Include hidden damage probability-weighted cost
  const aiBenchmarkTotalCents = aiBenchmarkPartsCentsTotal + aiBenchmarkLaborCents + aiBenchmarkHiddenCents;

  // Fair range: ±20% around the benchmark
  const aiBenchmarkLowCents = Math.round(aiBenchmarkTotalCents * 0.80);
  const aiBenchmarkHighCents = Math.round(aiBenchmarkTotalCents * 1.20);

  // Document-extracted cost (from PDF quote/assessment)
  const documentExtractedCostCents = estimatedRepairCost;

  // Variance between document cost and AI benchmark
  const costVariancePct = aiBenchmarkTotalCents > 0
    ? Math.round(((documentExtractedCostCents - aiBenchmarkTotalCents) / aiBenchmarkTotalCents) * 100)
    : 0;

  console.log(`[Pipeline Stage 10b] AI benchmark: parts=$${(aiBenchmarkPartsCentsTotal/100).toFixed(2)}, labour=$${(aiBenchmarkLaborCents/100).toFixed(2)}, hidden=$${(aiBenchmarkHiddenCents/100).toFixed(2)}, total=$${(aiBenchmarkTotalCents/100).toFixed(2)} (range: $${(aiBenchmarkLowCents/100).toFixed(2)}-$${(aiBenchmarkHighCents/100).toFixed(2)})`);
  console.log(`[Pipeline Stage 10b] Document cost: $${(documentExtractedCostCents/100).toFixed(2)}, variance: ${costVariancePct}%`);

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
  const { computeFraudScoreBreakdown, buildFraudScoringInput } = await import("./fraud-scoring");
  
  // Prepare vehicle data — use PDF-extracted fields if available, fall back to claim fields
  const physicsMake = (analysis.extractedVehicleMake || claim.vehicleMake || 'Unknown').toLowerCase();
  const physicsModel = (analysis.extractedVehicleModel || claim.vehicleModel || 'Unknown').toLowerCase();
  const physicsYear = analysis.extractedVehicleYear || claim.vehicleYear || 2020;

  // ─── Vehicle mass lookup table (kg) ───────────────────────────────────────
  // Keyed as "<make> <model>" (both lower-cased). Covers 150+ models common in
  // sub-Saharan Africa and globally. When an exact match is not found the system
  // falls back through: make-only → model-keyword → vehicle-class heuristic.
  const vehicleMassTable: Record<string, number> = {
    // ── Honda ──
    'honda fit': 1050, 'honda jazz': 1050, 'honda city': 1150, 'honda civic': 1250,
    'honda accord': 1500, 'honda cr-v': 1550, 'honda hr-v': 1300, 'honda pilot': 2000,
    'honda passport': 1900, 'honda ridgeline': 2000, 'honda odyssey': 1900,
    'honda element': 1550, 'honda insight': 1250, 'honda freed': 1200,
    // ── Toyota ──
    'toyota vitz': 980, 'toyota yaris': 1050, 'toyota corolla': 1300,
    'toyota corolla cross': 1450, 'toyota camry': 1600, 'toyota avalon': 1700,
    'toyota rav4': 1700, 'toyota c-hr': 1400, 'toyota rush': 1500,
    'toyota hilux': 1900, 'toyota fortuner': 2100, 'toyota land cruiser': 2500,
    'toyota land cruiser prado': 2200, 'toyota prado': 2200, 'toyota 4runner': 2100,
    'toyota tundra': 2300, 'toyota tacoma': 1800, 'toyota sienna': 2100,
    'toyota hiace': 1900, 'toyota quantum': 1900, 'toyota probox': 1100,
    'toyota starlet': 900, 'toyota etios': 1050, 'toyota agya': 900,
    // ── Nissan ──
    'nissan np200': 900, 'nissan np300': 1700, 'nissan navara': 1900,
    'nissan x-trail': 1600, 'nissan qashqai': 1450, 'nissan juke': 1250,
    'nissan micra': 950, 'nissan note': 1100, 'nissan tiida': 1200,
    'nissan almera': 1200, 'nissan sentra': 1300, 'nissan altima': 1600,
    'nissan patrol': 2600, 'nissan murano': 1900, 'nissan pathfinder': 2100,
    'nissan leaf': 1600, 'nissan ariya': 2100, 'nissan kicks': 1350,
    'nissan hardbody': 1400, 'nissan frontier': 1900,
    // ── Isuzu ──
    'isuzu d-max': 1900, 'isuzu d-teq': 1900, 'isuzu kb': 1900,
    'isuzu mu-x': 2100, 'isuzu trooper': 2000, 'isuzu rodeo': 1800,
    // ── Mazda ──
    'mazda 2': 1050, 'mazda 3': 1300, 'mazda 6': 1500, 'mazda cx-3': 1250,
    'mazda cx-5': 1600, 'mazda cx-7': 1700, 'mazda cx-9': 2000,
    'mazda bt-50': 1900, 'mazda mx-5': 1100,
    // ── Ford ──
    'ford ka': 1000, 'ford fiesta': 1050, 'ford focus': 1300, 'ford fusion': 1600,
    'ford mustang': 1800, 'ford mondeo': 1600, 'ford edge': 1900,
    'ford escape': 1600, 'ford explorer': 2100, 'ford expedition': 2600,
    'ford ranger': 1950, 'ford f-150': 2300, 'ford f-250': 2900,
    'ford everest': 2200, 'ford transit': 2000, 'ford tourneo': 1900,
    'ford ecosport': 1300,
    // ── Volkswagen ──
    'volkswagen polo': 1100, 'volkswagen polo vivo': 1050, 'volkswagen up': 950,
    'volkswagen golf': 1300, 'volkswagen jetta': 1400, 'volkswagen passat': 1600,
    'volkswagen tiguan': 1600, 'volkswagen touareg': 2100, 'volkswagen t-cross': 1250,
    'volkswagen t-roc': 1400, 'volkswagen amarok': 2100, 'volkswagen caddy': 1400,
    'volkswagen transporter': 1900, 'volkswagen touran': 1600,
    // ── Mitsubishi ──
    'mitsubishi mirage': 950, 'mitsubishi lancer': 1200, 'mitsubishi galant': 1500,
    'mitsubishi colt': 1100, 'mitsubishi triton': 1900, 'mitsubishi l200': 1900,
    'mitsubishi outlander': 1700, 'mitsubishi eclipse cross': 1600,
    'mitsubishi pajero': 2200, 'mitsubishi pajero sport': 2000,
    'mitsubishi asx': 1400, 'mitsubishi rvr': 1400,
    // ── Suzuki ──
    'suzuki alto': 750, 'suzuki celerio': 850, 'suzuki swift': 900,
    'suzuki baleno': 1000, 'suzuki ciaz': 1100, 'suzuki vitara': 1100,
    'suzuki grand vitara': 1500, 'suzuki jimny': 1100, 'suzuki s-cross': 1300,
    'suzuki ertiga': 1200, 'suzuki xl7': 1400,
    // ── Hyundai ──
    'hyundai i10': 900, 'hyundai grand i10': 950, 'hyundai i20': 1050,
    'hyundai i30': 1300, 'hyundai elantra': 1350, 'hyundai sonata': 1600,
    'hyundai accent': 1100, 'hyundai verna': 1100, 'hyundai atos': 850,
    'hyundai tucson': 1600, 'hyundai santa fe': 1900, 'hyundai creta': 1350,
    'hyundai venue': 1200, 'hyundai kona': 1350, 'hyundai ioniq': 1500,
    'hyundai ioniq 5': 2100, 'hyundai h100': 1500, 'hyundai h1': 2000,
    'hyundai staria': 2100,
    // ── Kia ──
    'kia picanto': 900, 'kia morning': 900, 'kia rio': 1050,
    'kia cerato': 1350, 'kia optima': 1600, 'kia stinger': 1800,
    'kia sportage': 1600, 'kia sorento': 1900, 'kia telluride': 2100,
    'kia seltos': 1400, 'kia stonic': 1250, 'kia carnival': 2100,
    'kia soul': 1350, 'kia niro': 1500, 'kia ev6': 2000,
    // ── BMW ──
    'bmw 1 series': 1400, 'bmw 2 series': 1500, 'bmw 3 series': 1500,
    'bmw 4 series': 1600, 'bmw 5 series': 1700, 'bmw 6 series': 1800,
    'bmw 7 series': 2000, 'bmw 8 series': 1900, 'bmw x1': 1500,
    'bmw x2': 1550, 'bmw x3': 1700, 'bmw x4': 1800, 'bmw x5': 2100,
    'bmw x6': 2100, 'bmw x7': 2400, 'bmw z4': 1400, 'bmw m3': 1600,
    'bmw m5': 1900, 'bmw i3': 1200, 'bmw i4': 2100, 'bmw ix': 2500,
    // ── Mercedes-Benz ──
    'mercedes a-class': 1400, 'mercedes b-class': 1500, 'mercedes c-class': 1500,
    'mercedes e-class': 1700, 'mercedes s-class': 2100, 'mercedes cla': 1500,
    'mercedes cls': 1800, 'mercedes gla': 1500, 'mercedes glb': 1700,
    'mercedes glc': 1800, 'mercedes gle': 2100, 'mercedes gls': 2500,
    'mercedes g-class': 2500, 'mercedes vito': 1900, 'mercedes sprinter': 2200,
    'mercedes amg gt': 1700,
    // ── Audi ──
    'audi a1': 1200, 'audi a3': 1400, 'audi a4': 1600, 'audi a5': 1700,
    'audi a6': 1800, 'audi a7': 1900, 'audi a8': 2100, 'audi q2': 1300,
    'audi q3': 1500, 'audi q5': 1800, 'audi q7': 2200, 'audi q8': 2300,
    'audi tt': 1400, 'audi r8': 1600, 'audi e-tron': 2500,
    // ── Chevrolet / Opel ──
    'chevrolet spark': 900, 'chevrolet aveo': 1100, 'chevrolet cruze': 1400,
    'chevrolet malibu': 1600, 'chevrolet impala': 1800, 'chevrolet equinox': 1700,
    'chevrolet trailblazer': 2000, 'chevrolet silverado': 2300, 'chevrolet tahoe': 2600,
    'chevrolet suburban': 2800, 'chevrolet traverse': 2100, 'chevrolet colorado': 1900,
    'opel corsa': 1100, 'opel astra': 1300, 'opel insignia': 1600,
    'opel mokka': 1400, 'opel crossland': 1300, 'opel grandland': 1600,
    // ── Renault ──
    'renault kwid': 800, 'renault sandero': 1050, 'renault logan': 1100,
    'renault clio': 1100, 'renault megane': 1300, 'renault fluence': 1400,
    'renault duster': 1300, 'renault captur': 1300, 'renault koleos': 1700,
    'renault scenic': 1500, 'renault trafic': 1900,
    // ── Peugeot ──
    'peugeot 107': 850, 'peugeot 208': 1100, 'peugeot 308': 1300,
    'peugeot 408': 1500, 'peugeot 508': 1600, 'peugeot 2008': 1300,
    'peugeot 3008': 1500, 'peugeot 5008': 1700, 'peugeot boxer': 2000,
    // ── Citroën ──
    'citroen c1': 850, 'citroen c3': 1100, 'citroen c4': 1300,
    'citroen c5': 1600, 'citroen berlingo': 1400,
    // ── Fiat ──
    'fiat 500': 900, 'fiat punto': 1100, 'fiat tipo': 1300,
    'fiat bravo': 1300, 'fiat doblo': 1500, 'fiat ducato': 2100,
    // ── Volvo ──
    'volvo s60': 1700, 'volvo s90': 2000, 'volvo v40': 1500,
    'volvo v60': 1700, 'volvo v90': 2000, 'volvo xc40': 1700,
    'volvo xc60': 1900, 'volvo xc90': 2300,
    // ── Land Rover / Range Rover ──
    'land rover defender': 2200, 'land rover discovery': 2300,
    'land rover discovery sport': 1900, 'land rover freelander': 1700,
    'range rover': 2500, 'range rover sport': 2300, 'range rover evoque': 1800,
    'range rover velar': 2000,
    // ── Jeep ──
    'jeep renegade': 1400, 'jeep compass': 1600, 'jeep cherokee': 1900,
    'jeep grand cherokee': 2200, 'jeep wrangler': 2000, 'jeep gladiator': 2200,
    // ── Tesla ──
    'tesla model 3': 1850, 'tesla model s': 2250, 'tesla model x': 2500,
    'tesla model y': 2000, 'tesla cybertruck': 3000,
    // ── Chinese brands (growing ZW/SSA market) ──
    'chery tiggo': 1500, 'chery arrizo': 1300, 'chery qq': 900,
    'haval h1': 1100, 'haval h2': 1300, 'haval h6': 1600, 'haval jolion': 1450,
    'great wall wingle': 1800, 'great wall steed': 1800,
    'byd atto 3': 1750, 'byd seal': 2000, 'byd han': 2200,
    'mg zs': 1350, 'mg hs': 1600, 'mg 5': 1300, 'mg 6': 1500,
    'geely emgrand': 1300, 'geely coolray': 1400,
    'dfsk glory': 1300, 'dfsk 580': 1600,
    // ── Commercial / Minibus ──
    'nissan urvan': 1900, 'ford transit connect': 1500, 'volkswagen crafter': 2100,
    'iveco daily': 2200, 'man tge': 2100,
  };

  // ─── Multi-tier mass inference ─────────────────────────────────────────────
  // Tier 1: exact "make model" key
  // Tier 2: make-only or model-only key
  // Tier 3: partial model keyword scan across all table keys
  // Tier 4: vehicle class heuristic derived from make/model keywords
  // Tier 5: year-based adjustment (+50 kg for post-2019 safety features)
  const vehicleMassKey = `${physicsMake} ${physicsModel}`;
  const vehicleMassKeyModelOnly = physicsModel;

  // Tier 3: scan all table keys for a partial match on the model string.
  // Tries the full keyword first, then each individual word (min 4 chars) so
  // that "Land Cruiser 200" still matches "toyota land cruiser".
  function findMassByKeyword(keyword: string): number | undefined {
    if (!keyword || keyword === 'unknown') return undefined;
    // Full string match
    const direct = Object.entries(vehicleMassTable).find(([k]) => k.includes(keyword));
    if (direct) return direct[1];
    // Word-by-word match (skip short tokens like numbers, "np", "d-")
    const words = keyword.split(/\s+/).filter(w => w.length >= 4);
    for (const word of words) {
      const entry = Object.entries(vehicleMassTable).find(([k]) => k.includes(word));
      if (entry) return entry[1];
    }
    return undefined;
  }

  // Tier 4: vehicle-class heuristic from make/model keywords
  function inferMassByClass(make: string, model: string): number {
    const combined = `${make} ${model}`;
    if (/hilux|ranger|navara|d-max|d-teq|triton|l200|bt-50|np300|amarok|frontier|tacoma|tundra|f-150|f-250|wingle|steed|np200|hardbody/.test(combined)) return 1900;
    if (/land cruiser|prado|fortuner|patrol|pajero|defender|discovery|grand cherokee|wrangler|expedition|suburban|tahoe|4runner|trooper/.test(combined)) return 2300;
    if (/cr-v|rav4|tucson|santa fe|sorento|cx-5|tiguan|x-trail|qashqai|outlander|mu-x|everest|explorer|edge|koleos|duster|haval h6|jolion|mg hs/.test(combined)) return 1700;
    if (/hr-v|vitara|jimny|juke|kona|venue|seltos|stonic|creta|ecosport|captur|2008|t-cross|t-roc|gla|glb|q3|x1|x2|asx|rvr|mg zs|haval h2/.test(combined)) return 1400;
    if (/hiace|quantum|h1|staria|urvan|sprinter|transit|transporter|trafic|berlingo|caddy|vito|crafter|daily/.test(combined)) return 2000;
    if (/polo|vivo|swift|celerio|alto|kwid|sandero|picanto|morning|i10|i20|atos|vitz|yaris|starlet|etios|agya|fiesta|ka|up|clio|208|punto|500|micra|note|spark|aveo|baleno|city/.test(combined)) return 1050;
    return 1300; // sensible default for unknown sedans
  }

  // Tier 5: year-based mass adjustment
  function yearMassAdjustment(baseKg: number, year: number): number {
    if (year < 1990) return Math.max(baseKg - 100, 700);
    if (year >= 2020) return baseKg + 50;
    return baseKg;
  }

  const vehicleMassRaw =
    vehicleMassTable[vehicleMassKey] ||                        // Tier 1: exact make+model
    vehicleMassTable[vehicleMassKeyModelOnly] ||               // Tier 2a: model-only key
    vehicleMassTable[physicsMake] ||                           // Tier 2b: make-only key
    findMassByKeyword(physicsModel) ||                         // Tier 3: partial model match
    findMassByKeyword(physicsMake) ||                          // Tier 3: partial make match
    inferMassByClass(physicsMake, physicsModel);               // Tier 4: class heuristic

   const vehicleMass = yearMassAdjustment(vehicleMassRaw, physicsYear);
  // Track mass source tier for confidence scoring
  const vehicleMassSource: "explicit" | "inferred_model" | "inferred_class" | "not_available" =
    ((claim as any).vehicleMassKg && (claim as any).vehicleMassKg > 0) ? "explicit" :
    (vehicleMassTable[vehicleMassKey] || vehicleMassTable[vehicleMassKeyModelOnly] || vehicleMassTable[physicsMake] || findMassByKeyword(physicsModel) || findMassByKeyword(physicsMake)) ? "inferred_model" :
    inferMassByClass(physicsMake, physicsModel) ? "inferred_class" :
    "not_available";
  // ─── Vehicle type classification ───────────────────────────────────────────
  const combinedForType = `${physicsMake} ${physicsModel}`;
  const inferredVehicleType: 'sedan' | 'suv' | 'pickup' | 'van' | 'truck' | 'sports' | 'compact' =
    /hilux|ranger|navara|d-max|d-teq|triton|l200|bt-50|np300|np200|amarok|frontier|tacoma|tundra|f-150|f-250|wingle|steed|hardbody/.test(combinedForType) ? 'pickup' :
    /land cruiser|prado|fortuner|patrol|pajero|defender|discovery|grand cherokee|wrangler|expedition|suburban|tahoe|4runner|trooper|mu-x|everest|explorer|edge|sorento|santa fe|cx-9|cx-7|cx-5|rav4|cr-v|tucson|x-trail|qashqai|outlander|tiguan|touareg|x5|x7|q7|q8|glc|gle|gls|g-class|xc90|xc60|haval h6|jolion|mg hs/.test(combinedForType) ? 'suv' :
    /hiace|quantum|h1|staria|urvan|sprinter|transit|transporter|trafic|berlingo|caddy|vito|crafter|daily|odyssey|sienna|carnival|tourneo/.test(combinedForType) ? 'van' :
    /mx-5|z4|tt|r8|mustang|stinger|amg gt|boxster|cayman|911|corvette/.test(combinedForType) ? 'sports' :
    /polo|vivo|swift|celerio|alto|kwid|sandero|picanto|morning|i10|i20|atos|vitz|yaris|starlet|etios|agya|fiesta|ka|up|clio|208|punto|500|micra|note|spark|aveo|baleno/.test(combinedForType) ? 'compact' :
    'sedan';

  // ─── Powertrain classification ─────────────────────────────────────────────
  const inferredPowertrain: 'ice' | 'bev' | 'phev' | 'hev' =
    /tesla|leaf|ariya|ioniq 5|ioniq5|ev6|atto 3|byd seal|byd han|e-tron|i3|i4|ix|model 3|model s|model x|model y|cybertruck/.test(combinedForType) ? 'bev' :
    /prius|insight|niro|ioniq(?! 5)|kona electric|outlander phev|rav4 hybrid|tucson hybrid/.test(combinedForType) ? 'hev' :
    'ice';

  const vehicleData = {
    mass: vehicleMass,
    make: analysis.extractedVehicleMake || claim.vehicleMake || 'Unknown',
    model: analysis.extractedVehicleModel || claim.vehicleModel || 'Unknown',
    year: physicsYear,
    vehicleType: inferredVehicleType as 'sedan' | 'suv' | 'pickup' | 'van' | 'truck',
    powertrainType: inferredPowertrain,
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
    maxCrushDepth: (() => {
      // Use AI-extracted crush depth if meaningful (>0.05m)
      if (analysis.maxCrushDepth && analysis.maxCrushDepth >= 0.05) return analysis.maxCrushDepth;
      // Infer crush depth from maximum component severity when PDF doesn't provide 3D data
      const components: any[] = analysis.damagedComponents || [];
      const severities = components.map((c: any) => c.severity?.toLowerCase() || 'minor');
      const hasCatastrophic = severities.some((s: string) => s === 'catastrophic');
      const hasSevere = severities.some((s: string) => s === 'severe');
      const hasModerate = severities.some((s: string) => s === 'moderate');
      if (hasCatastrophic) return 0.40; // 40cm — catastrophic structural collapse
      if (hasSevere) return 0.25;       // 25cm — severe deformation
      if (hasModerate) return 0.15;     // 15cm — moderate crumple
      return 0.08;                       // 8cm — minor/cosmetic damage
    })(), // Infer from severity when PDF can't provide 3D crush data
    structuralDamage: analysis.structuralDamage || false,
    airbagDeployment: analysis.airbagDeployment || false,
  };
  

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGES 2–4: CLASSIFICATION → PHYSICS → HIDDEN DAMAGE
  // Executed via the new fault-isolated pipeline runner.
  // Each stage saves its own output to DB immediately.
  // A failure in any stage is logged but never blocks subsequent stages.
  // ═══════════════════════════════════════════════════════════════════════════
  const { runPipeline } = await import("./pipeline/pipeline-runner");
  const { resolveVehicleComponents } = await import("./vehicle-components");

  // Build the immutable PipelineContext from data already computed in Stage 1
  const pipelineCtx = {
    claimId,
    db: await getDb(),
    log: (stage: string, msg: string) => console.log(`[${stage}] ${msg}`),
    claim: {
      vehicleMake: claim.vehicleMake || "",
      vehicleModel: claim.vehicleModel || "",
      vehicleYear: claim.vehicleYear || new Date().getFullYear(),
      vehicleBodyType: (claim.vehicleBodyType || "sedan") as any,
      powertrain: "ice" as const,
      mileageKm: claim.vehicleMileage || 80000,
      vehicleValueUsd: claim.vehicleValue ? claim.vehicleValue / 100 : null,
      incidentType: claim.incidentType || "unknown",
      incidentDescription: claim.incidentDescription || "",
      marketRegion: (claim as any).country || "ZW",
    },
    vehicleComponents: resolveVehicleComponents(
      claim.vehicleMake || "",
      claim.vehicleModel || "",
      claim.vehicleYear || undefined
    ),
  };

  // Build the ExtractedDocumentData from Stage 1 LLM output
  const pipelineExtraction = {
    incidentType: rawIncidentType || "",
    accidentType: (analysis as any).accidentType || "",
    vehicleMake: (analysis as any).vehicleMake || claim.vehicleMake || "",
    vehicleModel: (analysis as any).vehicleModel || claim.vehicleModel || "",
    vehicleYear: (analysis as any).vehicleYear || claim.vehicleYear || null,
    damagedComponents: damagedComponents.map((d: any) => ({
      name: d.name || d.component || "",
      severity: d.severity || "moderate",
      location: d.location || "",
      repairAction: d.repairAction || "",
    })),
    structuralDamage: analysis.structuralDamage || false,
    airbagDeployment: analysis.airbagDeployment || false,
    estimatedSpeedKmh: (analysis as any).estimatedSpeedKmh || null,
    crushDepthM: (analysis as any).crushDepthM || null,
    documentQuotedCostCents: analysis.estimatedCost ? Math.round(analysis.estimatedCost * 100) : null,
    impactPoint: (analysis as any).impactPoint || "",
    sourceMode: documentUrl ? "pdf" : "photo",
  };

  // Run the new pipeline (stages 2–4)
  const pipelineSummary = await runPipeline(pipelineCtx as any, pipelineExtraction as any);
  console.log(`[Pipeline Runner] Stages 2-4 complete. Summary: ${JSON.stringify(pipelineSummary.stages)}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGES 5–10: FORENSICS, FRAUD, REPAIR INTELLIGENCE, COST INTELLIGENCE
  // Each stage runs in its own try/catch — failure never blocks others.
  // ═══════════════════════════════════════════════════════════════════════════
  // ── Re-read the saved physics result from DB (written by Stage 3) ─────────
  let physicsAnalysis: any = null;
  let physicsImpactForceKn = 0;
  let physicsEnergyKj = 0;
  let physicsSpeedKmh = 0;
  let physicsDeltaV = 0;
  let physicsValidation: any = null;
  let physicsConsistencyScore = 50;
  let physicsOverallConsistency = 50;
  let physicsAccidentSeverity = "unknown";

  try {
    const savedAssessment = await db.query.aiAssessments.findFirst({
      where: (t: any, { eq: eqFn }: any) => eqFn(t.claimId, claimId),
    });
    if (savedAssessment?.physicsAnalysis) {
      physicsAnalysis = JSON.parse(savedAssessment.physicsAnalysis as string);
      physicsImpactForceKn = physicsAnalysis?.impactForce?.magnitude
        ? physicsAnalysis.impactForce.magnitude / 1000
        : 0;
      physicsEnergyKj = physicsAnalysis?.energyDissipated
        ? physicsAnalysis.energyDissipated / 1000
        : 0;
      physicsSpeedKmh = physicsAnalysis?.estimatedSpeed?.value || 0;
      physicsDeltaV = physicsAnalysis?.deltaV || 0;
      physicsConsistencyScore = physicsAnalysis?.damageConsistency?.score || 50;
      physicsOverallConsistency = physicsAnalysis?.overallConsistency || 50;
      physicsAccidentSeverity = physicsAnalysis?.accidentSeverity || "unknown";
    }
  } catch (readErr) {
    console.warn(`[Pipeline] Could not read saved physics from DB: ${String(readErr)}`);
  }

  // ── Stage 5: Forensic Analysis ────────────────────────────────────────────
  let forensicAnalysis: any = null;
  try {
    const vehicleAgeYears = claim.vehicleYear ? new Date().getFullYear() - claim.vehicleYear : 5;
    const forensicInput = {
      claimId,
      vehicleAge: vehicleAgeYears,
      mileage: claim.vehicleMileage || 80000,
      damageComponents: damagedComponents,
      physicsConsistencyScore: physicsConsistencyScore,
      accidentSeverity: physicsAccidentSeverity,
      repairerName: (claim as any).repairerName || "",
      claimHistory: [],
      documentType: documentUrl ? "pdf" : "photo",
    };
    forensicAnalysis = await performForensicAnalysis(forensicInput);
    console.log(`[Pipeline Stage 5] Forensic analysis complete. Fraud risk: ${forensicAnalysis?.fraudRiskLevel || 'unknown'}`);
  } catch (forensicErr) {
    console.error(`[Pipeline Stage 5] Forensic analysis failed: ${String(forensicErr)}`);
    forensicAnalysis = {
      fraudRiskScore: 0,
      fraudRiskLevel: "minimal",
      fraudIndicators: [],
      damageConsistencyScore: 50,
      damageConsistencyNotes: "Forensic analysis unavailable",
    };
  }

  // ── Stage 6: Fraud Scoring ────────────────────────────────────────────────
  let fraudScoreBreakdown: any = null;
  try {
    const fraudInput = buildFraudScoringInput({
      claim,
      analysis,
      physicsAnalysis,
      forensicAnalysis,
      damagedComponents,
      physicsConsistencyScore,
      physicsOverallConsistency,
    });
    fraudScoreBreakdown = computeFraudScoreBreakdown(fraudInput);
    console.log(`[Pipeline Stage 6] Fraud scoring complete. Score: ${fraudScoreBreakdown?.totalScore || 0}`);
  } catch (fraudErr) {
    console.error(`[Pipeline Stage 6] Fraud scoring failed: ${String(fraudErr)}`);
    fraudScoreBreakdown = { totalScore: 0, riskLevel: "minimal", breakdown: [] };
  }

  // ── Stage 7: Repair Intelligence + Parts Reconciliation ──────────────────
  let repairIntelligenceV2: any = null;
  let partsReconciliationV2: any[] = [];
  try {
    const { computeRepairIntelligence } = await import("./repairIntelligence");
    repairIntelligenceV2 = await computeRepairIntelligence({
      claimId,
      damagedComponents,
      vehicleMake: claim.vehicleMake || "",
      vehicleModel: claim.vehicleModel || "",
      vehicleYear: claim.vehicleYear || new Date().getFullYear(),
      physicsImpactForceKn,
      physicsEnergyKj,
      marketRegion: (claim as any).country || "ZW",
    });
    partsReconciliationV2 = repairIntelligenceV2?.partsReconciliation || [];
    console.log(`[Pipeline Stage 7] Repair intelligence complete. Labour: ${repairIntelligenceV2?.laborHoursEstimate || 0}h`);
  } catch (repairErr) {
    console.error(`[Pipeline Stage 7] Repair intelligence failed: ${String(repairErr)}`);
    repairIntelligenceV2 = null;
  }

  // ── Stage 8: Cost Intelligence ────────────────────────────────────────────
  let costIntelligenceV2: any = null;
  try {
    const { computeCostIntelligence } = await import("./costIntelligence");
    costIntelligenceV2 = await computeCostIntelligence({
      claimId,
      damagedComponents,
      repairIntelligence: repairIntelligenceV2,
      physicsImpactForceKn,
      physicsEnergyKj,
      documentQuotedCostCents: analysis.estimatedCost ? Math.round(analysis.estimatedCost * 100) : null,
      vehicleMake: claim.vehicleMake || "",
      vehicleModel: claim.vehicleModel || "",
      vehicleYear: claim.vehicleYear || new Date().getFullYear(),
      marketRegion: (claim as any).country || "ZW",
    });
    console.log(`[Pipeline Stage 8] Cost intelligence complete. AI benchmark: $${((costIntelligenceV2?.aiBenchmarkTotalCents || 0) / 100).toFixed(2)}`);
  } catch (costErr) {
    console.error(`[Pipeline Stage 8] Cost intelligence failed: ${String(costErr)}`);
    costIntelligenceV2 = null;
  }

  // ── Stage 9: Quote Validation (physics-based) ─────────────────────────────
  let quoteValidation: any = null;
  if (physicsAnalysis) {
    try {
      const quotedCostUsd = analysis.estimatedCost || 0;
      quoteValidation = validateQuoteAgainstPhysics(physicsAnalysis, quotedCostUsd);
      console.log(`[Pipeline Stage 9] Quote validation complete. Consistency: ${quoteValidation?.overallConsistency || 'N/A'}`);
    } catch (quoteErr) {
      console.error(`[Pipeline Stage 9] Quote validation failed: ${String(quoteErr)}`);
    }
  }

  // ── Stage 10: Final DB Update ─────────────────────────────────────────────
  // Consolidate all stage outputs into the final aiAssessments record.
  // This is the ONLY place that writes the final consolidated state.
  // Individual stages have already written their own outputs incrementally.
  try {
    const normalisePhysicsAnalysis = (pa: any) => {
      if (!pa) return null;
      return {
        impactForce: {
          magnitude: pa.impactForce?.magnitude || 0,
          direction: pa.impactForce?.direction || 0,
        },
        estimatedSpeed: {
          value: pa.speedEstimate?.estimatedSpeedKmh || pa.estimatedSpeed?.value || 0,
          confidence: pa.speedEstimate?.confidence || pa.estimatedSpeed?.confidence || 0,
          unit: "km/h",
        },
        energyDissipated: pa.energyDissipated || 0,
        deltaV: pa.deltaV || 0,
        accidentSeverity: pa.accidentSeverity || "unknown",
        latentDamageProbability: pa.latentDamageProbability || {
          engine: 0, transmission: 0, suspension: 0, frame: 0, electrical: 0,
        },
        damageConsistency: {
          score: pa.damageConsistency?.score || pa.consistencyScore || 50,
          notes: pa.damageConsistency?.notes || "",
          inconsistencies: pa.damageConsistency?.inconsistencies || [],
        },
        overallConsistency: pa.overallConsistency || 50,
        primaryImpactZone: pa.primaryImpactZone || "unknown",
        collisionType: pa.collisionType || "unknown",
        structuralDamageRisk: pa.structuralDamageRisk || false,
      };
    };

    const normalisedPhysicsAnalysis = normalisePhysicsAnalysis(physicsAnalysis);

    // Compute fraud score from breakdown or forensic analysis
    const finalFraudScore = fraudScoreBreakdown?.totalScore
      ?? forensicAnalysis?.fraudRiskScore
      ?? analysis.fraudRiskScore
      ?? 0;
    const finalFraudLevel = fraudScoreBreakdown?.riskLevel
      ?? forensicAnalysis?.fraudRiskLevel
      ?? "minimal";
    const finalFraudIndicators = [
      ...(forensicAnalysis?.fraudIndicators || []),
      ...(analysis.fraudIndicators || []),
    ];

    // Build cost intelligence JSON — prefer new module output, fall back to existing
    const costIntelligenceJson = costIntelligenceV2 ? JSON.stringify(costIntelligenceV2) : null;

    // Build repair intelligence JSON — prefer new module output, fall back to existing
    const repairIntelligenceJson = repairIntelligenceV2 ? JSON.stringify(repairIntelligenceV2) : JSON.stringify(repairIntelligence);

    // Build parts reconciliation JSON — prefer new module output, fall back to existing
    const partsReconciliationJson = partsReconciliationV2.length > 0
      ? JSON.stringify(partsReconciliationV2)
      : (partsReconciliation.length > 0 ? JSON.stringify(partsReconciliation) : null);

    // Build quote validation JSON
    const quoteValidationJson = quoteValidation ? JSON.stringify(quoteValidation) : null;

    // Build forensic analysis JSON
    const forensicAnalysisJson = forensicAnalysis ? JSON.stringify({
      fraudRiskScore: forensicAnalysis.fraudRiskScore || 0,
      fraudRiskLevel: forensicAnalysis.fraudRiskLevel || "minimal",
      fraudIndicators: forensicAnalysis.fraudIndicators || [],
      damageConsistencyScore: forensicAnalysis.damageConsistencyScore || 50,
      damageConsistencyNotes: forensicAnalysis.damageConsistencyNotes || "",
    }) : null;

    await db.update(aiAssessments).set({
      // Physics
      physicsAnalysis: normalisedPhysicsAnalysis ? JSON.stringify(normalisedPhysicsAnalysis) : null,
      // Forensics / fraud
      forensicAnalysisJson,
      fraudRiskScore: finalFraudScore,
      fraudRiskLevel: finalFraudLevel,
      fraudIndicators: JSON.stringify(finalFraudIndicators),
      fraudScoreBreakdownJson: fraudScoreBreakdown ? JSON.stringify(fraudScoreBreakdown) : null,
      damageConsistencyScore: forensicAnalysis?.damageConsistencyScore ?? physicsConsistencyScore,
      damageConsistencyNotes: forensicAnalysis?.damageConsistencyNotes ?? "",
      // Repair & cost
      repairIntelligenceJson,
      partsReconciliationJson,
      costIntelligenceJson,
      quoteValidationJson,
      // Final status
      updatedAt: new Date().toISOString(),
    }).where(eq(aiAssessments.claimId, claimId));

    // Update claim status
    await db.update(claims).set({
      aiAssessmentCompleted: 1,
      status: "assessment_complete",
      documentProcessingStatus: "extracted",
      fraudRiskScore: finalFraudScore,
      fraudFlags: JSON.stringify(finalFraudIndicators),
      updatedAt: new Date().toISOString(),
    }).where(eq(claims.id, claimId));

    console.log(`[Pipeline Stage 10] Final DB update complete for claim ${claimId}. Pipeline summary: ${JSON.stringify(pipelineSummary.stages)}`);
  } catch (finalUpdateErr) {
    console.error(`[Pipeline Stage 10] Final DB update failed: ${String(finalUpdateErr)}`);
    // Still try to mark claim as complete even if the full update failed
    try {
      await db.update(claims).set({
        aiAssessmentCompleted: 1,
        status: "assessment_complete",
        documentProcessingStatus: "extracted",
        updatedAt: new Date().toISOString(),
      }).where(eq(claims.id, claimId));
    } catch (statusErr) {
      console.error(`[Pipeline Stage 10] Could not update claim status: ${String(statusErr)}`);
    }
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
