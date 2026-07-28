/**
 * Check the M7 fix result for claim 8400001
 */
import { getDb } from "../db";
import { aiAssessments } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.error("No DB"); process.exit(1); }
  
  const rows = await db.select({
    id: aiAssessments.id,
    createdAt: aiAssessments.createdAt,
    fraudScore: aiAssessments.fraudScore,
    fraudRiskLevel: aiAssessments.fraudRiskLevel,
    crossValidationJson: aiAssessments.crossValidationJson,
    physicsTruthJson: aiAssessments.physicsTruthJson,
  }).from(aiAssessments)
    .where(eq(aiAssessments.claimId, 8400001))
    .orderBy(desc(aiAssessments.id))
    .limit(1);
  
  if (!rows.length) { console.log("No assessment found"); process.exit(0); }
  
  const row = rows[0];
  console.log("Assessment ID:", row.id);
  console.log("Created:", row.createdAt);
  console.log("Fraud Score:", row.fraudScore);
  console.log("Fraud Risk Level:", row.fraudRiskLevel);
  
  // Check XV speed comparison
  const xv = typeof row.crossValidationJson === 'string' 
    ? JSON.parse(row.crossValidationJson) 
    : row.crossValidationJson;
  if (xv?.speedComparison) {
    console.log("\n=== XV Speed Comparison ===");
    console.log(JSON.stringify(xv.speedComparison, null, 2));
  }
  
  // Check physics truth speed
  const pt = typeof row.physicsTruthJson === 'string'
    ? JSON.parse(row.physicsTruthJson)
    : row.physicsTruthJson;
  if (pt?.speed) {
    console.log("\n=== Physics Truth Speed ===");
    console.log("canonical:", pt.speed.canonical);
    console.log("claimedSpeedKmh:", pt.speed.claimedSpeedKmh);
    console.log("consensusSpeedKmh:", pt.speed.consensusSpeedKmh);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
