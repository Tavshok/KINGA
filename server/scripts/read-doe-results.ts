/**
 * Read DOE + L2 results from DB for the Voltron claim
 */
import { getDb } from "../db";
import { aiAssessments } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("No DB"); return; }

  const [assessment] = await db.select({
    doeResultJson: aiAssessments.doeResultJson,
    costIntelligenceJson: aiAssessments.costIntelligenceJson,
  })
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, 7410001))
    .orderBy(desc(aiAssessments.createdAt))
    .limit(1);

  if (!assessment) { console.log("No assessment found"); return; }

  const doe = assessment.doeResultJson ? JSON.parse(assessment.doeResultJson as string) : null;
  const ci = assessment.costIntelligenceJson ? JSON.parse(assessment.costIntelligenceJson as string) : null;
  const comp = ci?.compositeOptimisation;

  console.log("=== L2 BENCHMARK ===");
  console.log(`L1 lowest submitted: ${ci?.currency} ${comp?.l1LowestSubmittedCostUsd?.toLocaleString() ?? "N/A"}`);
  console.log(`L2 composite optimised: ${ci?.currency} ${comp?.l2CompositeOptimisedCostUsd?.toLocaleString() ?? "N/A"}`);
  console.log(`L3 benchmark reference: ${ci?.currency} ${comp?.l3BenchmarkReferenceCostUsd?.toLocaleString() ?? "N/A"}`);
  console.log(`Composite items: ${comp?.compositeLineItems?.length ?? "N/A"}`);
  if (comp?.compositeLineItems) {
    const sorted = [...comp.compositeLineItems].sort((a: any, b: any) => (b.lowestCredibleCents ?? 0) - (a.lowestCredibleCents ?? 0));
    console.log("Top 10 items by cost:");
    sorted.slice(0, 10).forEach((i: any) =>
      console.log(`  ${i.component}: ${ci.currency} ${((i.lowestCredibleCents ?? 0) / 100).toLocaleString()} (source: ${i.sourceQuote ?? "?"})`));
  }

  console.log("\n=== DOE RESULT ===");
  console.log(`Status: ${doe?.status}`);
  console.log(`Selected: ${doe?.selectedPanelBeater}`);
  console.log(`Selected cost: ${doe?.currency} ${doe?.selectedCost?.toLocaleString() ?? "N/A"}`);
  console.log(`Benchmark deviation: ${doe?.benchmarkDeviationPct ?? "N/A"}%`);
  console.log(`Confidence: ${doe?.decisionConfidence}`);

  console.log("\n=== PER-QUOTE BREAKDOWN ===");
  if (doe?.scoreBreakdown) {
    for (const s of doe.scoreBreakdown) {
      const dev = s.benchmarkDeviationPct != null
        ? `${s.benchmarkDeviationPct > 0 ? "+" : ""}${s.benchmarkDeviationPct}% vs L2`
        : "no L2";
      const med = s.medianDeviationPct != null
        ? `${s.medianDeviationPct > 0 ? "+" : ""}${s.medianDeviationPct}% vs median`
        : "";
      const status = s.disqualified ? `DISQUALIFIED: ${s.disqualificationReason}` : "eligible";
      console.log(`  ${s.panelBeater}: ${doe.currency} ${s.totalCost?.toLocaleString()} | ${dev} | ${med} | ${status}`);
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
