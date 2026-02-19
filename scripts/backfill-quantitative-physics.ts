/**
 * Backfill Quantitative Physics Script
 * 
 * Reprocesses existing claims to add quantitative physics validation fields
 * (impactAngleDegrees, calculatedImpactForceKN, impactLocationNormalized)
 * without re-running AI vision analysis.
 * 
 * Usage: pnpm tsx scripts/backfill-quantitative-physics.ts
 * 
 * DRY_RUN mode (default: true):
 * - Set DRY_RUN = false to execute actual database updates
 * - When DRY_RUN = true, script only simulates updates without modifying database
 */

// ============================================================
// CONFIGURATION
// ============================================================
const DRY_RUN = false; // Set to false to execute actual updates
const BATCH_SIZE = 50; // Records per transaction

import { getDb } from '../server/db';
import { aiAssessments } from '../drizzle/schema';
import { eq, isNotNull, sql } from 'drizzle-orm';
import { extendPhysicsValidationOutput } from '../server/physics-quantitative-output';

// ============================================================
// HELPER FUNCTIONS (copied from assessment-processor.ts)
// ============================================================

/**
 * Calculate impact angle in degrees (0-360) from primary impact zone.
 * 0° = front, 90° = right, 180° = rear, 270° = left
 */
function calculateImpactAngleDegrees(primaryImpactZone?: string): number {
  if (!primaryImpactZone) return 0;
  
  const zone = primaryImpactZone.toLowerCase();
  
  // Front zones (0° ± 45°)
  if (zone.includes('front')) {
    if (zone.includes('left')) return 315; // Front-left
    if (zone.includes('right')) return 45; // Front-right
    return 0; // Front center
  }
  
  // Rear zones (180° ± 45°)
  if (zone.includes('rear')) {
    if (zone.includes('left')) return 225; // Rear-left
    if (zone.includes('right')) return 135; // Rear-right
    return 180; // Rear center
  }
  
  // Side zones
  if (zone.includes('left')) return 270; // Left side
  if (zone.includes('right')) return 90; // Right side
  
  // Default to front
  return 0;
}

/**
 * Calculate normalized impact location (0-1 range) from primary impact zone.
 * relativeX: 0 = left, 0.5 = center, 1 = right
 * relativeY: 0 = top, 0.5 = middle, 1 = bottom
 */
function calculateImpactLocationNormalized(primaryImpactZone?: string): { relativeX: number; relativeY: number } {
  if (!primaryImpactZone) return { relativeX: 0.5, relativeY: 0.5 };
  
  const zone = primaryImpactZone.toLowerCase();
  
  // Front zones
  if (zone.includes('front')) {
    if (zone.includes('left')) return { relativeX: 0.25, relativeY: 0.5 };
    if (zone.includes('right')) return { relativeX: 0.75, relativeY: 0.5 };
    return { relativeX: 0.5, relativeY: 0.5 }; // Front center
  }
  
  // Rear zones
  if (zone.includes('rear')) {
    if (zone.includes('left')) return { relativeX: 0.25, relativeY: 0.5 };
    if (zone.includes('right')) return { relativeX: 0.75, relativeY: 0.5 };
    return { relativeX: 0.5, relativeY: 0.5 }; // Rear center
  }
  
  // Side zones
  if (zone.includes('left')) return { relativeX: 0.0, relativeY: 0.5 };
  if (zone.includes('right')) return { relativeX: 1.0, relativeY: 0.5 };
  
  // Default to center
  return { relativeX: 0.5, relativeY: 0.5 };
}

// ============================================================
// BACKFILL LOGIC
// ============================================================

interface BackfillStats {
  totalProcessed: number;
  totalUpdated: number;
  totalSkipped: number;
  errors: Array<{ assessmentId: string; error: string }>;
}

/**
 * Check if physics analysis already has quantitative fields
 * Priority: Check quantitativeMode flag first, then validate required fields
 */
function hasQuantitativeFields(physicsAnalysis: any): boolean {
  if (!physicsAnalysis) return false;
  
  // If quantitativeMode is explicitly set to true, trust it
  if (physicsAnalysis.quantitativeMode === true) {
    return true;
  }
  
  // Otherwise, check if all required quantitative fields exist
  return !!(
    physicsAnalysis.impactAngleDegrees !== undefined &&
    physicsAnalysis.calculatedImpactForceKN !== undefined &&
    physicsAnalysis.impactLocationNormalized !== undefined
  );
}

/**
 * Recompute quantitative physics from legacy physics data
 */
function recomputeQuantitativePhysics(physicsAnalysis: any): any {
  if (!physicsAnalysis) {
    throw new Error('No physics analysis data found');
  }

  // Extract legacy fields
  const primaryImpactZone = physicsAnalysis.primaryImpactZone || 
                           physicsAnalysis.primary_impact_zone ||
                           'front_center';
  
  const impactForceN = physicsAnalysis.impactForce?.magnitude || 
                       physicsAnalysis.impact_force_n ||
                       0;
  
  const impactSpeed = physicsAnalysis.impactSpeed || 
                      physicsAnalysis.estimatedSpeed?.value ||
                      0;
  
  const vehicleMass = physicsAnalysis.vehicleMass || 1500; // Default 1500 kg
  
  // Calculate quantitative fields
  const impactAngleDegrees = calculateImpactAngleDegrees(primaryImpactZone);
  const impactLocationNormalized = calculateImpactLocationNormalized(primaryImpactZone);
  
  // Use extendPhysicsValidationOutput to get full quantitative data
  try {
    const quantitativePhysics = extendPhysicsValidationOutput({
      impactForce: impactForceN > 0 ? { magnitude: impactForceN, duration: 0.05 } : undefined,
      impactAngle: impactAngleDegrees,
      primaryImpactZone,
      damagedComponents: [], // Not needed for backfill
      accidentType: physicsAnalysis.accidentType || 'frontal',
      estimatedSpeed: { value: impactSpeed },
      damageConsistency: { score: physicsAnalysis.physicsScore || 50 },
      mass: vehicleMass,
      crushDepth: 0.3,
    });
    
    // Merge with legacy data and set quantitativeMode flag
    return {
      ...physicsAnalysis,
      ...quantitativePhysics,
      // Ensure impactLocationNormalized is set
      impactLocationNormalized: quantitativePhysics.impactLocationNormalized || impactLocationNormalized,
      quantitativeMode: true, // Mark as quantitative mode
    };
  } catch (error) {
    console.warn('⚠️ extendPhysicsValidationOutput failed, using fallback calculation:', error);
    
    // Fallback: manual calculation
    return {
      ...physicsAnalysis,
      impactAngleDegrees,
      calculatedImpactForceKN: impactForceN / 1000,
      impactLocationNormalized,
      severityLevel: 'unknown',
      confidenceScore: 0.5,
      quantitativeMode: true, // Mark as quantitative mode (fallback)
    };
  }
}

/**
 * Process a batch of assessments
 */
async function processBatch(
  db: Awaited<ReturnType<typeof getDb>>,
  assessments: Array<{ id: string; physicsAnalysis: string | null }>,
  stats: BackfillStats
): Promise<void> {
  for (const assessment of assessments) {
    try {
      stats.totalProcessed++;
      
      // Parse physics analysis
      let physicsAnalysis: any = null;
      try {
        physicsAnalysis = assessment.physicsAnalysis ? JSON.parse(assessment.physicsAnalysis) : null;
      } catch (parseError) {
        console.warn(`⚠️ Failed to parse physics analysis for assessment ${assessment.id}`);
        stats.totalSkipped++;
        continue;
      }
      
      // Skip if no physics analysis
      if (!physicsAnalysis) {
        stats.totalSkipped++;
        continue;
      }
      
      // Skip if already has quantitative fields
      if (hasQuantitativeFields(physicsAnalysis)) {
        console.log(`✓ Assessment ${assessment.id} already has quantitative fields, skipping`);
        stats.totalSkipped++;
        continue;
      }
      
      // Recompute quantitative physics
      const updatedPhysicsAnalysis = recomputeQuantitativePhysics(physicsAnalysis);
      
      // Update database (only if not in dry-run mode)
      if (!DRY_RUN) {
        await db!
          .update(aiAssessments)
          .set({
            physicsAnalysis: JSON.stringify(updatedPhysicsAnalysis),
          })
          .where(eq(aiAssessments.id, assessment.id));
        
        console.log(`✓ Updated assessment ${assessment.id} with quantitative physics`);
      } else {
        console.log(`📝 [DRY-RUN] Would update assessment ${assessment.id} with quantitative physics`);
      }
      
      stats.totalUpdated++;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error processing assessment ${assessment.id}:`, errorMessage);
      stats.errors.push({ assessmentId: assessment.id, error: errorMessage });
    }
  }
}

/**
 * Main backfill function
 */
async function backfillQuantitativePhysics() {
  console.log('🚀 Starting quantitative physics backfill...\n');
  
  // Dry-run warning
  if (DRY_RUN) {
    console.log('⚠️  DRY-RUN MODE ENABLED');
    console.log('   No database updates will be performed.');
    console.log('   Set DRY_RUN = false to execute actual updates.\n');
  } else {
    console.log('❗ LIVE MODE - Database updates will be executed\n');
  }
  
  const db = await getDb();
  if (!db) {
    throw new Error('Failed to connect to database');
  }
  
  // SAFEGUARD: Count total records to update BEFORE execution
  console.log('🔍 Counting total records to update...');
  const totalRecordsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiAssessments)
    .where(isNotNull(aiAssessments.physicsAnalysis));
  
  const totalRecordsToUpdate = totalRecordsResult[0]?.count || 0;
  console.log(`📊 Total records with physics_analysis: ${totalRecordsToUpdate}`);
  
  if (totalRecordsToUpdate === 0) {
    console.error('❌ No records found to update. Aborting migration.');
    process.exit(1);
  }
  
  console.log(`✅ Confirmed ${totalRecordsToUpdate} records will be processed\n`);
  
  const stats: BackfillStats = {
    totalProcessed: 0,
    totalUpdated: 0,
    totalSkipped: 0,
    errors: [],
  };
  
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    // Fetch batch of assessments with physics analysis
    const batch = await db
      .select({
        id: aiAssessments.id,
        physicsAnalysis: aiAssessments.physicsAnalysis,
      })
      .from(aiAssessments)
      .where(isNotNull(aiAssessments.physicsAnalysis))
      .limit(BATCH_SIZE)
      .offset(offset);
    
    if (batch.length === 0) {
      hasMore = false;
      break;
    }
    
    console.log(`\n📦 Processing batch ${Math.floor(offset / BATCH_SIZE) + 1} (${batch.length} assessments)...`);
    
    await processBatch(db, batch, stats);
    
    offset += BATCH_SIZE;
    
    // Progress report
    console.log(`\n📊 Progress: ${stats.totalProcessed} processed, ${stats.totalUpdated} updated, ${stats.totalSkipped} skipped, ${stats.errors.length} errors`);
  }
  
  // Calculate quantitative activation rate
  const totalRecords = stats.totalProcessed;
  const quantitativeRecords = stats.totalUpdated + stats.totalSkipped; // Updated + already had quantitative
  const activationRate = totalRecords > 0 ? (quantitativeRecords / totalRecords) * 100 : 0;
  
  // Final report
  console.log('\n' + '='.repeat(60));
  console.log('✅ Backfill Complete!');
  console.log('='.repeat(60));
  console.log(`Total Processed:  ${stats.totalProcessed}`);
  console.log(`Total Updated:    ${stats.totalUpdated}${DRY_RUN ? ' (simulated)' : ''}`);
  console.log(`Total Skipped:    ${stats.totalSkipped} (already quantitative)`);
  console.log(`Total Errors:     ${stats.errors.length}`);
  console.log('\n' + '-'.repeat(60));
  console.log(`Quantitative Activation Rate: ${activationRate.toFixed(2)}%`);
  console.log(`  - Quantitative Records: ${quantitativeRecords}`);
  console.log(`  - Legacy Records:       ${totalRecords - quantitativeRecords}`);
  console.log('-'.repeat(60));
  
  if (stats.errors.length > 0) {
    console.log('\n❌ Errors:');
    stats.errors.forEach(({ assessmentId, error }) => {
      console.log(`  - Assessment ${assessmentId}: ${error}`);
    });
  }
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY-RUN MODE: No database changes were made.');
    console.log('   Set DRY_RUN = false to execute actual updates.');
  }
  
  console.log('\n' + '='.repeat(60));
}

// Run backfill
backfillQuantitativePhysics()
  .then(() => {
    console.log('\n✅ Backfill script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Backfill script failed:', error);
    process.exit(1);
  });
