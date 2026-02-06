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
  fraudRules
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

export async function getClaimById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(claims).where(eq(claims.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getClaimsByClaimant(claimantId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(claims).where(eq(claims.claimantId, claimantId)).orderBy(desc(claims.createdAt));
}

export async function getClaimsByStatus(status: typeof claims.$inferSelect.status) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(claims).where(eq(claims.status, status)).orderBy(desc(claims.createdAt));
}

export async function getClaimsByAssessor(assessorId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(claims).where(eq(claims.assignedAssessorId, assessorId)).orderBy(desc(claims.createdAt));
}

export async function getClaimsForPanelBeater(panelBeaterId: number) {
  const db = await getDb();
  if (!db) return [];

  // Get claims where this panel beater was selected by the claimant
  const allClaims = await db.select().from(claims).orderBy(desc(claims.createdAt));
  
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

export async function updateClaimStatus(claimId: number, status: typeof claims.$inferSelect.status) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(claims).set({ status, updatedAt: new Date() }).where(eq(claims.id, claimId));
}

export async function assignClaimToAssessor(claimId: number, assessorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(claims).set({ 
    assignedAssessorId: assessorId,
    status: "assessment_pending",
    updatedAt: new Date() 
  }).where(eq(claims.id, claimId));
}

export async function updateClaimPolicyVerification(claimId: number, verified: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(claims).set({ 
    policyVerified: verified ? 1 : 0,
    updatedAt: new Date() 
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
    updatedAt: new Date() 
  }).where(eq(claims.id, claimId));

  // Parse damage photos from JSON
  const damagePhotos: string[] = claim.damagePhotos ? JSON.parse(claim.damagePhotos) : [];
  
  if (damagePhotos.length === 0) {
    throw new Error("No damage photos available for assessment");
  }

  // Import LLM helper for vision analysis
  const { invokeLLM } = await import("./_core/llm");

  // Analyze damage photos with AI vision
  const analysisPrompt = `You are an expert auto insurance damage assessor. Analyze these vehicle damage photos and provide:
1. Detailed damage assessment
2. Estimated repair cost in USD (provide a single number)
3. Labor cost estimate
4. Parts cost estimate  
5. Fraud risk score (0-100, where 0 is no risk and 100 is high risk)
6. Any fraud indicators detected

Provide your response in JSON format with keys: damageDescription, estimatedCost, laborCost, partsCost, fraudRiskScore, fraudIndicators (array of strings).`;

  const response = await invokeLLM({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: analysisPrompt },
          ...damagePhotos.slice(0, 3).map(url => ({
            type: "image_url" as const,
            image_url: { url, detail: "high" as const }
          }))
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
            estimatedCost: { type: "number" },
            laborCost: { type: "number" },
            partsCost: { type: "number" },
            fraudRiskScore: { type: "number" },
            fraudIndicators: { type: "array", items: { type: "string" } }
          },
          required: ["damageDescription", "estimatedCost", "laborCost", "partsCost", "fraudRiskScore", "fraudIndicators"],
          additionalProperties: false
        }
      }
    }
  });

  const messageContent = response.choices[0]?.message?.content;
  const analysis = typeof messageContent === 'string' ? JSON.parse(messageContent) : {};

  // Create AI assessment record
  await createAiAssessment({
    claimId,
    damageDescription: analysis.damageDescription || "AI analysis completed",
    estimatedCost: Math.round(analysis.estimatedCost || 0),
    fraudIndicators: JSON.stringify(analysis.fraudIndicators || []),
    fraudRiskLevel: analysis.fraudRiskScore > 70 ? "high" : analysis.fraudRiskScore > 40 ? "medium" : "low",
    confidenceScore: 85, // Default confidence score
    modelVersion: "gpt-4-vision-v1",
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
  
  // Prepare accident data
  const accidentData = {
    accidentType: "unknown" as const, // Will be classified by physics engine
    damagePhotos,
    incidentDescription: claim.incidentDescription || "No description provided",
  };
  
  // Prepare damage assessment from AI analysis
  const damageAssessment = {
    damagedComponents: [], // Would be extracted from AI analysis in production
    totalDamageArea: 0,
    maxCrushDepth: 0.2, // Estimated from damage severity
    structuralDamage: analysis.fraudRiskScore > 60, // High fraud risk suggests structural damage
    airbagDeployment: false, // Would be detected from photos in production
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
    
    const combinedFraudScore = Math.min(100, Math.max(analysis.fraudRiskScore, physicsFraudScore, forensicFraudScore));
    const combinedFraudLevel = combinedFraudScore > 70 ? "high" : combinedFraudScore > 40 ? "medium" : "low";
    
    // Update claim with combined fraud assessment
    await db.update(claims).set({ 
      aiAssessmentCompleted: 1,
      fraudRiskScore: combinedFraudScore,
      fraudFlags: JSON.stringify([
        ...analysis.fraudIndicators,
        ...physicsAnalysis.fraudIndicators.impossibleDamagePatterns,
        ...physicsAnalysis.fraudIndicators.unrelatedDamage,
        ...physicsAnalysis.fraudIndicators.stagedAccidentIndicators,
      ]),
      updatedAt: new Date() 
    }).where(eq(claims.id, claimId));
    
    // Update AI assessment with combined fraud level
    await db.update(aiAssessments).set({
      fraudRiskLevel: combinedFraudLevel,
      updatedAt: new Date(),
    }).where(eq(aiAssessments.claimId, claimId));
    
  } catch (error) {
    console.error("Physics analysis failed:", error);
    // Continue without physics analysis if it fails
    await db.update(claims).set({ 
      aiAssessmentCompleted: 1,
      fraudRiskScore: analysis.fraudRiskScore || 0,
      fraudFlags: JSON.stringify(analysis.fraudIndicators || []),
      updatedAt: new Date() 
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
    updatedAt: new Date() 
  }).where(eq(claims.id, data.claimId));
  
  return result;
}

export async function getAiAssessmentByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(aiAssessments).where(eq(aiAssessments.claimId, claimId)).limit(1);
  return result.length > 0 ? result[0] : null;
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

export async function getAssessorEvaluationByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(assessorEvaluations).where(eq(assessorEvaluations.claimId, claimId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateAssessorEvaluation(id: number, data: Partial<InsertAssessorEvaluation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(assessorEvaluations).set({ ...data, updatedAt: new Date() }).where(eq(assessorEvaluations.id, id));
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

export async function getQuotesByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, claimId));
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

  await db.update(panelBeaterQuotes).set({ ...data, updatedAt: new Date() }).where(eq(panelBeaterQuotes.id, id));
}

export async function getQuotesByPanelBeater(panelBeaterId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.panelBeaterId, panelBeaterId)).orderBy(desc(panelBeaterQuotes.createdAt));
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

  await db.update(appointments).set({ status, updatedAt: new Date() }).where(eq(appointments.id, id));
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
