import { getDb } from "./server/db";
import { aiAssessments, claims } from "./drizzle/schema";
import { eq, like } from "drizzle-orm";

async function main() {
  const db = await getDb();
  const claimRows = await db.select({ id: claims.id, claimNumber: claims.claimNumber })
    .from(claims)
    .where(like(claims.claimNumber, '%2F012A19%'));
  
  console.log("Claims found:", claimRows);
  
  for (const c of claimRows) {
    const [a] = await db.select({
      id: aiAssessments.id,
      costIntelligenceJson: aiAssessments.costIntelligenceJson,
      recommendation: aiAssessments.recommendation,
      fraudScore: aiAssessments.fraudScore,
      estimatedCost: aiAssessments.estimatedCost,
    }).from(aiAssessments).where(eq(aiAssessments.claimId, c.id));
    
    if (a) {
      const ci = a.costIntelligenceJson ? 
        (typeof a.costIntelligenceJson === 'string' ? JSON.parse(a.costIntelligenceJson) : a.costIntelligenceJson)
        : null;
      console.log(`\nClaim ${c.claimNumber} (ID: ${c.id}):`);
      console.log("  fraudScore:", a.fraudScore);
      console.log("  estimatedCost:", a.estimatedCost);
      console.log("  recommendation:", a.recommendation);
      console.log("  costIntelligenceJson present:", !!ci);
      if (ci) {
        console.log("  costDecision:", JSON.stringify(ci.costDecision, null, 2));
        console.log("  costNarrative:", ci.costNarrative?.slice(0, 100));
        console.log("  reconciliationSummary:", JSON.stringify(ci.reconciliationSummary)?.slice(0, 100));
        console.log("  quoteDeviationMatrix:", JSON.stringify(ci.quoteDeviationMatrix)?.slice(0, 200));
        console.log("  l2CompositeOptimisedCostUsd:", ci.compositeOptimisation?.l2CompositeOptimisedCostUsd);
        console.log("  lowestSubmittedQuoteUsd:", ci.lowestSubmittedQuoteUsd);
      }
    }
  }
  
  process.exit(0);
}

main().catch(console.error);
