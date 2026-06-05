import { getDb } from "../db";
import { aiAssessments } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) return;
  const [a] = await db.select({ ci: aiAssessments.costIntelligenceJson })
    .from(aiAssessments).where(eq(aiAssessments.claimId, 7410001))
    .orderBy(desc(aiAssessments.createdAt)).limit(1);

  const ci = JSON.parse(a.ci as string);
  const comp = ci.compositeOptimisation;
  console.log("L1:", comp.l1LowestSubmittedCostUsd);
  console.log("L2:", comp.l2CompositeOptimisedCostUsd);
  console.log("Composite items count:", comp.compositeLineItems?.length);
  if (comp.compositeLineItems?.length > 0) {
    console.log("First item keys:", Object.keys(comp.compositeLineItems[0]));
    const sorted = [...comp.compositeLineItems].sort((a: any, b: any) =>
      (b.selectedCostUsd ?? 0) - (a.selectedCostUsd ?? 0)
    );
    console.log("Top 15 items:");
    sorted.slice(0, 15).forEach((i: any) => {
      const name = i.componentName ?? i.component ?? i.name ?? "?";
      const cost = (i.selectedCostUsd ?? (i.lowestCredibleCents ?? i.lowestCents ?? 0) / 100);
      const source = i.selectedFromQuote ?? i.sourceQuote ?? "?";
      console.log(`  ${name}: ${cost?.toLocaleString()} (from: ${source})`);
    });
    // Check if "spares" is in the list
    const sparesItem = comp.compositeLineItems.find((i: any) =>
      (i.componentName ?? i.component ?? i.name ?? "").toLowerCase().includes("spare")
    );
    console.log("\nSpares item found:", sparesItem ? JSON.stringify(sparesItem) : "NONE (correctly excluded)");
  }
}

main().catch(console.error).finally(() => process.exit(0));
