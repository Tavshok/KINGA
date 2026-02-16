/**
 * Migration Script: Migrate Existing Routed Claims to Immutable Routing History
 * 
 * This script migrates any existing routing decisions from the claims table
 * to the new immutable routingHistory table.
 * 
 * Run with: pnpm tsx server/scripts/migrate-routing-history.ts
 */

import { getDb } from "../db";
import { claims, routingHistory } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

const db = await getDb();

/**
 * Generate immutable routing event ID
 */
function generateRoutingId(timestamp: Date): string {
  const ts = timestamp.getTime();
  const random = randomBytes(8).toString("hex");
  return `routing_${ts}_${random}`;
}

/**
 * Infer routing category from claim status
 * 
 * This is a best-effort migration based on current claim status.
 * In production, you may have more sophisticated logic.
 */
function inferRoutingCategory(claim: any): "HIGH" | "MEDIUM" | "LOW" {
  // If claim has AI assessment completed, assume HIGH confidence
  if (claim.aiAssessmentCompleted === 1) {
    return "HIGH";
  }
  
  // If claim has assigned assessor, assume MEDIUM confidence
  if (claim.assignedAssessorId) {
    return "MEDIUM";
  }
  
  // Default to MEDIUM for existing claims
  return "MEDIUM";
}

/**
 * Infer routing decision from routing category
 */
function inferRoutingDecision(category: "HIGH" | "MEDIUM" | "LOW"): string {
  switch (category) {
    case "HIGH":
      return "AI_FAST_TRACK";
    case "MEDIUM":
      return "INTERNAL_REVIEW";
    case "LOW":
      return "EXTERNAL_REQUIRED";
  }
}

/**
 * Infer confidence score from routing category
 */
function inferConfidenceScore(category: "HIGH" | "MEDIUM" | "LOW"): number {
  switch (category) {
    case "HIGH":
      return 85; // Midpoint of HIGH range (80-100)
    case "MEDIUM":
      return 65; // Midpoint of MEDIUM range (50-79)
    case "LOW":
      return 40; // Midpoint of LOW range (0-49)
  }
}

/**
 * Generate confidence components from inferred score
 */
function generateConfidenceComponents(score: number): string {
  return JSON.stringify({
    fraudRisk: score,
    aiCertainty: score,
    quoteVariance: score,
    claimCompleteness: score,
    historicalRisk: score,
  });
}

/**
 * Main migration function
 */
async function migrateRoutingHistory() {
  if (!db) {
    throw new Error("Database connection not available");
  }

  console.log("Starting routing history migration...");
  
  // Get all claims that don't have routing history yet
  const allClaims = await db.select().from(claims);
  
  console.log(`Found ${allClaims.length} total claims`);
  
  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (const claim of allClaims) {
    try {
      // Check if routing history already exists for this claim
      const existingHistory = await db.select()
        .from(routingHistory)
        .where(eq(routingHistory.claimId, claim.id))
        .limit(1);
      
      if (existingHistory.length > 0) {
        console.log(`Claim ${claim.id} already has routing history, skipping`);
        skippedCount++;
        continue;
      }
      
      // Infer routing data from claim
      const category = inferRoutingCategory(claim);
      const decision = inferRoutingDecision(category);
      const confidenceScore = inferConfidenceScore(category);
      const confidenceComponents = generateConfidenceComponents(confidenceScore);
      
      // Use claim creation timestamp as routing timestamp
      const timestamp = claim.createdAt;
      
      // Generate routing ID
      const routingId = generateRoutingId(timestamp);
      
      // Insert routing history event
      await db.insert(routingHistory).values({
        id: routingId,
        claimId: claim.id,
        tenantId: claim.tenantId || "default",
        confidenceScore: confidenceScore.toFixed(2),
        confidenceComponents,
        routingCategory: category,
        routingDecision: decision as any,
        thresholdConfigVersion: "v1.0-migrated",
        modelVersion: "legacy-migration",
        decidedBy: "AI",
        decidedByUserId: null,
        justification: "Migrated from existing claim data",
        timestamp,
      });
      
      console.log(`Migrated claim ${claim.id} (${claim.claimNumber}) - Category: ${category}, Decision: ${decision}`);
      migratedCount++;
      
    } catch (error) {
      console.error(`Error migrating claim ${claim.id}:`, error);
      errorCount++;
    }
  }
  
  console.log("\nMigration complete!");
  console.log(`Migrated: ${migratedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total: ${allClaims.length}`);
}

// Run migration
migrateRoutingHistory()
  .then(() => {
    console.log("Migration script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration script failed:", error);
    process.exit(1);
  });
