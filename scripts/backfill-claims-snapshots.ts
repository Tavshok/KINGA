/**
 * Backfill Claims Snapshot Fields
 * 
 * Purpose: Populate estimatedClaimValue, confidenceScore, and fraudRiskScore
 * in claims table from latest ai_assessments records.
 * 
 * Usage: tsx scripts/backfill-claims-snapshots.ts [--dry-run] [--batch-size=100]
 * 
 * Safety: Runs in dry-run mode by default. Use --execute to apply changes.
 */

import { db } from "../server/db";
import { claims, aiAssessments } from "../drizzle/schema";
import { eq, isNull, and, sql } from "drizzle-orm";

interface BackfillStats {
  totalClaims: number;
  claimsWithAssessments: number;
  claimsUpdated: number;
  claimsSkipped: number;
  errors: number;
}

async function backfillClaimsSnapshots(options: {
  dryRun: boolean;
  batchSize: number;
}) {
  const stats: BackfillStats = {
    totalClaims: 0,
    claimsWithAssessments: 0,
    claimsUpdated: 0,
    claimsSkipped: 0,
    errors: 0,
  };

  console.log(`\n🔄 Starting claims snapshot backfill...`);
  console.log(`Mode: ${options.dryRun ? "DRY RUN (no changes)" : "EXECUTE (will update database)"}`);
  console.log(`Batch size: ${options.batchSize}\n`);

  try {
    // Get all claims that need backfilling (missing snapshot fields)
    const claimsToBackfill = await db
      .select({
        id: claims.id,
        claimNumber: claims.claimNumber,
        estimatedClaimValue: claims.estimatedClaimValue,
        confidenceScore: claims.confidenceScore,
        fraudRiskScore: claims.fraudRiskScore,
      })
      .from(claims)
      .where(
        and(
          isNull(claims.estimatedClaimValue),
          isNull(claims.confidenceScore)
        )
      )
      .limit(10000); // Safety limit

    stats.totalClaims = claimsToBackfill.length;
    console.log(`📊 Found ${stats.totalClaims} claims needing backfill\n`);

    if (stats.totalClaims === 0) {
      console.log("✅ No claims need backfilling. All snapshot fields are populated.\n");
      return stats;
    }

    // Process in batches
    for (let i = 0; i < claimsToBackfill.length; i += options.batchSize) {
      const batch = claimsToBackfill.slice(i, i + options.batchSize);
      console.log(`Processing batch ${Math.floor(i / options.batchSize) + 1}/${Math.ceil(claimsToBackfill.length / options.batchSize)} (${batch.length} claims)...`);

      for (const claim of batch) {
        try {
          // Get latest AI assessment for this claim
          const latestAssessment = await db
            .select({
              estimatedCost: aiAssessments.estimatedCost,
              confidenceScore: aiAssessments.confidenceScore,
              fraudRiskLevel: aiAssessments.fraudRiskLevel,
            })
            .from(aiAssessments)
            .where(eq(aiAssessments.claimId, claim.id))
            .orderBy(sql`${aiAssessments.id} DESC`)
            .limit(1);

          if (latestAssessment.length === 0) {
            stats.claimsSkipped++;
            console.log(`  ⏭️  Claim ${claim.claimNumber}: No AI assessment found, skipping`);
            continue;
          }

          const assessment = latestAssessment[0];
          stats.claimsWithAssessments++;

          // Convert fraud risk level to score (low=25, medium=50, high=75)
          const fraudRiskScore = assessment.fraudRiskLevel === "high" ? 75
            : assessment.fraudRiskLevel === "medium" ? 50
            : assessment.fraudRiskLevel === "low" ? 25
            : null;

          // Convert estimatedCost from cents to decimal
          const estimatedClaimValue = assessment.estimatedCost
            ? (Number(assessment.estimatedCost) / 100).toFixed(2)
            : null;

          if (options.dryRun) {
            console.log(`  🔍 Claim ${claim.claimNumber}: Would update with:`);
            console.log(`     - estimatedClaimValue: ${estimatedClaimValue || "NULL"}`);
            console.log(`     - confidenceScore: ${assessment.confidenceScore || "NULL"}`);
            console.log(`     - fraudRiskScore: ${fraudRiskScore || "NULL"}`);
            stats.claimsUpdated++;
          } else {
            // Execute update
            await db
              .update(claims)
              .set({
                estimatedClaimValue: estimatedClaimValue,
                confidenceScore: assessment.confidenceScore,
                fraudRiskScore: fraudRiskScore,
              })
              .where(eq(claims.id, claim.id));

            stats.claimsUpdated++;
            console.log(`  ✅ Claim ${claim.claimNumber}: Updated successfully`);
          }
        } catch (error) {
          stats.errors++;
          console.error(`  ❌ Claim ${claim.claimNumber}: Error - ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Small delay between batches to avoid overwhelming database
      if (i + options.batchSize < claimsToBackfill.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`\n📈 Backfill Summary:`);
    console.log(`   Total claims processed: ${stats.totalClaims}`);
    console.log(`   Claims with assessments: ${stats.claimsWithAssessments}`);
    console.log(`   Claims updated: ${stats.claimsUpdated}`);
    console.log(`   Claims skipped (no assessment): ${stats.claimsSkipped}`);
    console.log(`   Errors: ${stats.errors}`);

    if (options.dryRun) {
      console.log(`\n⚠️  DRY RUN MODE: No changes were made to the database.`);
      console.log(`   Run with --execute flag to apply changes.\n`);
    } else {
      console.log(`\n✅ Backfill completed successfully!\n`);
    }

  } catch (error) {
    console.error(`\n❌ Fatal error during backfill:`, error);
    throw error;
  }

  return stats;
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = !args.includes("--execute");
const batchSizeArg = args.find(arg => arg.startsWith("--batch-size="));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split("=")[1]) : 100;

// Run backfill
backfillClaimsSnapshots({ dryRun, batchSize })
  .then((stats) => {
    process.exit(stats.errors > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
