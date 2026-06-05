/**
 * Trigger Voltron claim re-assessment and verify DOE + L2 fixes
 * Uses triggerAiAssessment (the correct entry point) then reads results from DB
 */
import { getClaimByNumber, triggerAiAssessment, getDb } from "../db";
import { aiAssessments } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

async function main() {
  const claim = await getClaimByNumber("DOC-20260605-1578F2B9");
  if (!claim) {
    console.log("Claim not found: DOC-20260605-1578F2B9");
    return;
  }
  console.log(`\n=== Triggering re-assessment for claim ${claim.id} (${claim.claimNumber}) ===\n`);

  // Run the full pipeline
  await triggerAiAssessment(claim.id);

  // Read results from DB
  const db = await getDb();
  if (!db) { console.log("No DB"); return; }

  const [assessment] = await db.select()
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claim.id))
    .orderBy(desc(aiAssessments.createdAt))
    .limit(1);

  if (!assessment) {
    console.log("No assessment found after pipeline run");
    return;
  }

  const ci = assessment.costIntelligenceJson ? JSON.parse(assessment.costIntelligenceJson as string) : null;
  const doe = ci?.doeResult;

  console.log("\n=== L2 BENCHMARK ===");
  console.log(`L2 optimised cost: ${ci?.currency} ${ci?.optimisedCost?.toLocaleString() ?? "N/A"}`);
  console.log(`Composite items: ${ci?.compositeLineItems?.length ?? "N/A"}`);
  if (ci?.compositeLineItems) {
    // Show top 5 most expensive composite items
    const sorted = [...ci.compositeLineItems].sort((a: any, b: any) => (b.lowestCredibleCents ?? 0) - (a.lowestCredibleCents ?? 0));
    console.log("Top 5 composite items by cost:");
    for (const item of sorted.slice(0, 5)) {
      console.log(`  ${item.component}: ${ci.currency} ${((item.lowestCredibleCents ?? 0) / 100).toLocaleString()}`);
    }
  }

  console.log("\n=== DOE RESULT ===");
  console.log(`Status: ${doe?.status}`);
  console.log(`Selected: ${doe?.selectedPanelBeater}`);
  console.log(`Selected cost: ${doe?.currency} ${doe?.selectedCost?.toLocaleString() ?? "N/A"}`);
  console.log(`Benchmark deviation: ${doe?.benchmarkDeviationPct ?? "N/A"}%`);
  console.log(`Decision confidence: ${doe?.decisionConfidence}`);

  console.log("\n=== PER-QUOTE BREAKDOWN ===");
  if (doe?.scoreBreakdown) {
    for (const s of doe.scoreBreakdown) {
      const devStr = s.benchmarkDeviationPct != null
        ? `${s.benchmarkDeviationPct > 0 ? "+" : ""}${s.benchmarkDeviationPct}% vs L2`
        : "no benchmark";
      const medStr = s.medianDeviationPct != null
        ? ` | ${s.medianDeviationPct > 0 ? "+" : ""}${s.medianDeviationPct}% vs median`
        : "";
      const status = s.disqualified ? `❌ DISQUALIFIED (${s.disqualificationReason})` : "✅ eligible";
      console.log(`  ${s.panelBeater}: ${doe?.currency} ${s.totalCost?.toLocaleString()} | ${devStr}${medStr} | ${status}`);
    }
  }

  if (doe?.disqualifications?.length) {
    console.log("\n=== DISQUALIFICATIONS ===");
    for (const d of doe.disqualifications) {
      console.log(`  ${d.panelBeater}: ${d.triggeringSignal}`);
    }
  }

  console.log("\n=== RATIONALE ===");
  console.log(doe?.rationale);
}

main().catch(console.error).finally(() => process.exit(0));
