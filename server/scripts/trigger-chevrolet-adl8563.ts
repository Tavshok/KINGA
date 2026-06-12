/**
 * Trigger Chevrolet Trailblazer ADL8563 re-assessment
 * Monitors Stage 1 page image count, Stage 3 quote extraction, and damage photos.
 * Run: npx tsx server/scripts/trigger-chevrolet-adl8563.ts
 */
import { getClaimByNumber, triggerAiAssessment, getDb } from "../db";
import { aiAssessments, claims } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

const CLAIM_NUMBER = "DOC-20260612-5B0D73F3";

async function main() {
  console.log(`\n=== Chevrolet Trailblazer ADL8563 — Pipeline Trigger ===`);
  console.log(`Looking up claim: ${CLAIM_NUMBER}\n`);

  const claim = await getClaimByNumber(CLAIM_NUMBER);
  if (!claim) {
    console.error(`❌ Claim not found: ${CLAIM_NUMBER}`);
    console.log("Listing recent claims to find the correct claim number...");
    const db = await getDb();
    if (db) {
      const recent = await db.select({ id: claims.id, claimNumber: claims.claimNumber, createdAt: claims.createdAt })
        .from(claims)
        .orderBy(desc(claims.createdAt))
        .limit(10);
      console.log("Recent claims:", recent.map(c => `${c.id}: ${c.claimNumber}`).join("\n"));
    }
    process.exit(1);
  }

  console.log(`✅ Found claim ${claim.id} (${claim.claimNumber})`);
  console.log(`   Status: ${claim.workflowState} | documentProcessingStatus: ${claim.documentProcessingStatus}`);
  console.log(`   Source Doc ID: ${(claim as any).sourceDocumentId ?? 'NONE'}`);
  console.log(`   Damage photos: ${claim.damagePhotos ? JSON.parse(claim.damagePhotos as string).length : 0}`);
  console.log(`\n=== Starting pipeline... (this takes 2-4 minutes) ===\n`);

  const startTime = Date.now();
  try {
    await triggerAiAssessment(claim.id);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Pipeline completed in ${elapsed}s`);
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n❌ Pipeline failed after ${elapsed}s: ${String(err)}`);
  }

  // Read results
  const db = await getDb();
  if (!db) { console.error("DB unavailable"); process.exit(1); }

  const [updatedClaim] = await db.select().from(claims).where(eq(claims.id, claim.id)).limit(1);
  const [assessment] = await db.select().from(aiAssessments)
    .where(eq(aiAssessments.claimId, claim.id))
    .orderBy(desc(aiAssessments.createdAt))
    .limit(1);

  console.log(`\n=== Post-pipeline claim state ===`);
  console.log(`   documentProcessingStatus: ${updatedClaim?.documentProcessingStatus}`);
  console.log(`   aiAssessmentCompleted: ${updatedClaim?.aiAssessmentCompleted}`);

  if (assessment) {
    console.log(`\n=== Assessment result ===`);
    console.log(`   Assessment ID: ${assessment.id}`);
    console.log(`   Confidence score: ${assessment.confidenceScore}`);

    // Parse quotes from costIntelligenceJson
    if (assessment.costIntelligenceJson) {
      try {
        const costIntel = JSON.parse(assessment.costIntelligenceJson as string);
        const quotes = costIntel.quotes ?? costIntel.repairQuotes ?? costIntel.extractedQuotes ?? [];
        console.log(`\n=== Repair Quotes Extracted: ${quotes.length} ===`);
        if (quotes.length > 0) {
          quotes.forEach((q: any, i: number) => {
            console.log(`   Quote ${i + 1}: ${q.panel_beater || q.panelBeater || "Unknown"} — ${q.currency || "USD"} ${q.total_cost ?? q.totalCost ?? "?"}`);
          });
        } else {
          console.log("   ⚠️  No quotes found in costIntelligenceJson");
          console.log("   Raw keys:", Object.keys(costIntel).join(", "));
        }
      } catch (e) {
        console.log("   ⚠️  Failed to parse costIntelligenceJson:", String(e));
      }
    } else {
      console.log("   ⚠️  costIntelligenceJson is null");
    }

    // Parse damage photos from enrichedPhotosJson
    if (assessment.enrichedPhotosJson) {
      try {
        const photos = JSON.parse(assessment.enrichedPhotosJson as string);
        const photoList = Array.isArray(photos) ? photos : (photos.photos ?? photos.damagePhotos ?? []);
        console.log(`\n=== Damage Photos: ${photoList.length} ===`);
        if (photoList.length > 0) {
          photoList.slice(0, 3).forEach((p: any, i: number) => {
            const url = p.url ?? p.imageUrl ?? p;
            console.log(`   Photo ${i + 1}: ${typeof url === "string" ? url.slice(0, 80) : JSON.stringify(url).slice(0, 80)}`);
          });
          if (photoList.length > 3) console.log(`   ... and ${photoList.length - 3} more`);
        } else {
          console.log("   ⚠️  No damage photos found");
        }
      } catch (e) {
        console.log("   ⚠️  Failed to parse enrichedPhotosJson:", String(e));
      }
    } else {
      console.log("   ⚠️  enrichedPhotosJson is null");
    }
  } else {
    console.log("   ⚠️  No assessment record found after pipeline run");
  }

  console.log(`\n=== Done ===\n`);
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
