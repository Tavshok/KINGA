import { triggerAiAssessment } from "../server/db";

async function main() {
  const claimId = 4320476;
  const tenantId = "kinga-default";
  
  console.log(`[BMW Re-run] Triggering pipeline for claim ${claimId}...`);
  console.log(`[BMW Re-run] Start time: ${new Date().toISOString()}`);
  
  try {
    const result = await triggerAiAssessment(claimId, tenantId);
    console.log(`[BMW Re-run] Pipeline completed!`);
    console.log(`[BMW Re-run] End time: ${new Date().toISOString()}`);
    console.log(`[BMW Re-run] Result:`, JSON.stringify({
      confidence: result?.confidence,
      fraudRiskLevel: result?.fraudRiskLevel,
      recommendation: result?.recommendation,
      consistencyScore: result?.consistencyScore,
      criticalFailures: result?.criticalFailures,
      assumptionCount: result?.assumptionCount,
    }, null, 2));
  } catch (err: any) {
    console.error(`[BMW Re-run] Pipeline failed:`, err.message);
    console.error(err.stack);
  }
  
  process.exit(0);
}

main();
