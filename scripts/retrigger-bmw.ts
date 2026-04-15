/**
 * Re-run the pipeline on claim 4320696 (BMW 318i ADP6423)
 * Run with: npx tsx scripts/retrigger-bmw.ts
 */
import { triggerAiAssessment, getDb } from "../server/db";
import { aiAssessments } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

const CLAIM_ID = 4320696;

async function main() {
  console.log(`\n=== BMW 318i ADP6423 — Pipeline Re-run ===`);
  console.log(`Claim ID: ${CLAIM_ID}`);
  console.log(`Start: ${new Date().toISOString()}\n`);

  try {
    await triggerAiAssessment(CLAIM_ID);
    console.log(`\nDone: ${new Date().toISOString()}`);

    // Read back the stored result
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const [assessment] = await db
      .select()
      .from(aiAssessments)
      .where(eq(aiAssessments.claimId, CLAIM_ID))
      .orderBy(desc(aiAssessments.id))
      .limit(1);

    if (!assessment) {
      console.log("No assessment record found in DB.");
      process.exit(0);
    }

    console.log("\n=== STORED ASSESSMENT RESULT ===");
    console.log(`Assessment ID:       ${assessment.id}`);
    console.log(`Confidence:          ${assessment.confidenceScore}`);
    console.log(`Fraud risk level:    ${assessment.fraudRiskLevel}`);
    console.log(`Fraud score:         ${assessment.fraudScore}`);
    console.log(`Recommendation:      ${assessment.recommendation}`);

    if (assessment.pipelineRunSummary) {
      const summary = JSON.parse(assessment.pipelineRunSummary as string);
      console.log("\n=== STAGE SUMMARY ===");
      const stages = summary.stages ?? {};
      for (const [k, v] of Object.entries(stages) as [string, any][]) {
        const icon = v.status === "success" ? "[OK]" : v.status === "degraded" ? "[WARN]" : "[FAIL]";
        console.log(`  ${icon} ${k.padEnd(30)} ${v.status.padEnd(12)} ${v.durationMs}ms`);
      }

      // System interventions
      const si = summary.systemInterventionCount ?? 0;
      const interventions = summary.interventionSummary ?? [];
      console.log(`\nSystem Interventions: ${si}`);
      if (interventions.length === 0) {
        console.log("  Clean extraction — no corrections applied");
      } else {
        interventions.forEach((iv: string) => console.log(`  * ${iv}`));
      }

      // Decision readiness
      const dr = summary.decisionReadiness;
      if (dr) {
        console.log(`\nDecision Readiness Gate: ${dr.decision_ready ? "PROCEED" : "BLOCKED"}`);
        console.log(`  Confidence: ${dr.confidence}%`);
        if (!dr.decision_ready) {
          dr.blocking_issues?.forEach((i: any) => {
            console.log(`  BLOCKED: [${i.check_id}] ${i.detail?.slice(0, 100)}`);
          });
        }
      }
    }

    if (assessment.assumptionRegistryJson) {
      const registry = JSON.parse(assessment.assumptionRegistryJson as string);
      console.log(`\nAssumptions: ${registry.totalCount ?? 0} total`);
      const domainCorrs = (registry.assumptions ?? []).filter((a: any) => a.strategy === "domain_correction");
      if (domainCorrs.length > 0) {
        console.log(`Domain corrections (${domainCorrs.length}):`);
        domainCorrs.forEach((a: any) => {
          console.log(`  - ${a.field}: "${a.assumedValue}" | ${a.reason?.slice(0, 80)}`);
        });
      }
    }

  } catch (err: any) {
    console.error("Error:", err.message);
    console.error(err.stack);
  }

  process.exit(0);
}

main();
