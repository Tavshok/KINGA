/**
 * run_voltron_v3.ts
 * Re-triggers the ISUZU MUX claim (id=6240003) through the full pipeline.
 * Tests Stage 1 (pdftoppm), Stage 2 (chunked image OCR), and Stage 2.7 (embedded quote extraction).
 *
 * Run: npx tsx scripts/run_voltron_v3.ts 2>&1 | tee /tmp/voltron-v4.log
 */
import { triggerAiAssessment, getDb } from "../server/db";
import { claims, aiAssessments, panelBeaterQuotes, quoteLineItems } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

const CLAIM_ID = 6240003;

async function main() {
  console.log(`[Voltron V3 Test] Starting pipeline re-run for claim ${CLAIM_ID}...`);
  console.log(`[Voltron V3 Test] Watch for [chunked-images] in Stage 2 logs`);
  console.log(`[Voltron V3 Test] Watch for pdftoppm in Stage 1 logs`);
  console.log(`[Voltron V3 Test] ─────────────────────────────────────────────`);

  const startTime = Date.now();

  try {
    await triggerAiAssessment(CLAIM_ID);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[Voltron V3 Test] ✅ Pipeline completed in ${elapsed}s`);
  } catch (err: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n[Voltron V3 Test] ❌ Pipeline failed after ${elapsed}s: ${err?.message ?? err}`);
  }

  // Check results
  const db = await getDb();
  if (!db) { console.log("[Voltron V3 Test] No DB — cannot check results"); process.exit(0); }

  const [claim] = await db.select().from(claims).where(eq(claims.id, CLAIM_ID)).limit(1);
  console.log(`[Voltron V3 Test] Claim status: ${claim?.documentProcessingStatus ?? "unknown"}`);
  console.log(`[Voltron V3 Test] AI completed: ${claim?.aiAssessmentCompleted ?? "?"}`);

  // Check the latest AI assessment for this claim
  const assessmentRows = await db.select({
    id: aiAssessments.id,
    fraudRiskLevel: aiAssessments.fraudRiskLevel,
    recommendation: aiAssessments.recommendation,
    costIntelligenceJson: aiAssessments.costIntelligenceJson,
    pipelineRunSummary: aiAssessments.pipelineRunSummary,
  }).from(aiAssessments)
    .where(eq(aiAssessments.claimId, CLAIM_ID))
    .orderBy(desc(aiAssessments.id))
    .limit(1);
  if (assessmentRows.length > 0) {
    const assessment = assessmentRows[0];
    console.log(`[Voltron V3 Test] Assessment ID: ${assessment.id}`);
    console.log(`[Voltron V3 Test] Fraud risk: ${assessment.fraudRiskLevel ?? 'unknown'}`);
    console.log(`[Voltron V3 Test] Recommendation: ${assessment.recommendation ?? 'unknown'}`);
    // Parse cost intelligence to check total cost
    try {
      const costJson = typeof assessment.costIntelligenceJson === 'string'
        ? JSON.parse(assessment.costIntelligenceJson)
        : assessment.costIntelligenceJson;
      if (costJson) {
        console.log(`[Voltron V3 Test] Total repair cost: ${costJson.totalRepairCostFormatted ?? costJson.totalRepairCost ?? 'unknown'}`);
        console.log(`[Voltron V3 Test] Cost decision: ${costJson.costDecision?.recommendation ?? 'unknown'}`);
        console.log(`[Voltron V3 Test] bestSelectedQuote: ${costJson.bestSelectedQuote ? JSON.stringify(costJson.bestSelectedQuote).slice(0, 120) : 'NULL ❌'}`);
        console.log(`[Voltron V3 Test] quotesEvaluated: ${costJson.quotesEvaluated ?? 'unknown'}`);
        console.log(`[Voltron V3 Test] l2CompositeOptimisedCostUsd: ${costJson.l2CompositeOptimisedCostUsd ?? 'unknown'}`);
        console.log(`[Voltron V3 Test] l3BenchmarkReferenceCostUsd: ${costJson.l3BenchmarkReferenceCostUsd ?? 'unknown'}`);
      }
    } catch (parseErr) {
      console.log(`[Voltron V3 Test] Could not parse costIntelligenceJson: ${parseErr}`);
    }
    // Parse pipeline run summary to check stage statuses
    try {
      const summaryJson = typeof assessment.pipelineRunSummary === 'string'
        ? JSON.parse(assessment.pipelineRunSummary)
        : assessment.pipelineRunSummary;
      if (summaryJson) {
        const stages = Object.entries(summaryJson) as [string, any][];
        const holdStages = stages.filter(([, s]) => s?.status === 'HOLD');
        const failedStages = stages.filter(([, s]) => s?.status === 'FAILED');
        console.log(`[Voltron V3 Test] Pipeline stages: ${stages.length} total, ${holdStages.length} HOLD, ${failedStages.length} FAILED`);
        if (holdStages.length > 0) {
          console.log(`[Voltron V3 Test] HOLD stages: ${holdStages.map(([k]) => k).join(', ')}`);
        }
        if (failedStages.length > 0) {
          console.log(`[Voltron V3 Test] FAILED stages: ${failedStages.map(([k]) => k).join(', ')}`);
        }
      }
    } catch (parseErr) {
      console.log(`[Voltron V3 Test] Could not parse pipelineRunSummary: ${parseErr}`);
    }
  } else {
    console.log(`[Voltron V3 Test] No assessment found for claim ${CLAIM_ID}`);
  }

  // Check panel beater quotes and line items
  const pbQuotes = await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, CLAIM_ID));
  console.log(`[Voltron V3 Test] Panel beater quotes: ${pbQuotes.length}`);
  if (pbQuotes.length > 0) {
    let totalLineItems = 0;
    let pricedLineItems = 0;
    for (const q of pbQuotes) {
      const qLineItems = await db.select().from(quoteLineItems).where(eq(quoteLineItems.quoteId, q.id));
      totalLineItems += qLineItems.length;
      pricedLineItems += qLineItems.filter(li => Number(li.lineTotal ?? 0) > 0).length;
    }
    console.log(`[Voltron V3 Test] Quote line items: ${totalLineItems} total, ${pricedLineItems} priced`);
    const totalCost = pbQuotes.reduce((sum, q) => sum + Number(q.quotedAmount ?? 0), 0);
    console.log(`[Voltron V3 Test] Total quoted amount: USD ${(totalCost / 100).toFixed(2)}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error("[Voltron V3 Test] Fatal:", err);
  process.exit(1);
});
