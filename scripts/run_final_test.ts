import { getDb, triggerAiAssessment } from "../server/db";
import { claims, aiAssessments } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

async function main() {
  const db = await getDb();
  // Find the two real production claims
  const targetClaims = await db.select({
    id: claims.id,
    claimNumber: claims.claimNumber,
    documentProcessingStatus: claims.documentProcessingStatus,
  }).from(claims)
    .where(inArray(claims.claimNumber, ['DOC-20260511-F75D99DD', 'DOC-20260514-14A74979']));

  console.log("Target claims:", JSON.stringify(targetClaims, null, 2));

  // Reset both to uploaded so they can be re-triggered
  for (const claim of targetClaims) {
    await db.update(claims)
      .set({ documentProcessingStatus: 'uploaded' })
      .where(eq(claims.id, claim.id));
    console.log(`Reset claim ${claim.claimNumber} (id=${claim.id}) to uploaded`);
  }

  // Trigger pipeline for each (triggerAiAssessment handles its own clean slate)
  for (const claim of targetClaims) {
    console.log(`\nTriggering pipeline for ${claim.claimNumber} (id=${claim.id})...`);
    try {
      await triggerAiAssessment(claim.id);
      console.log(`\u2713 Pipeline completed for ${claim.claimNumber}`);
    } catch (err: any) {
      console.error(`\u2717 Pipeline FAILED for ${claim.claimNumber}:`, err?.message ?? err);
      if (err?.stack) console.error(err.stack);
    }
  }
}

main().then(() => {
  console.log("\nAll done.");
  process.exit(0);
}).catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
