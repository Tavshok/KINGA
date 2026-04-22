import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Get the most recent completed claims
  const [claims] = await conn.execute(
    `SELECT id, claim_number, status FROM claims WHERE status = 'assessment_complete' ORDER BY id DESC LIMIT 5`
  );
  console.log('=== Recent completed claims ===');
  for (const c of claims) {
    console.log(`  id=${c.id} | ${c.claim_number} | status=${c.status}`);
  }

  if (!claims.length) { await conn.end(); return; }
  const claimId = claims[0].id;

  // Get the ai_assessment record with all cost fields
  const [assessments] = await conn.execute(
    `SELECT id, claim_id, estimated_cost, estimated_parts_cost, estimated_labor_cost,
            currency_code, fraud_risk_level, confidence_score, structural_damage_severity,
            recommendation, cost_intelligence_json
     FROM ai_assessments
     WHERE claim_id = ?
     ORDER BY id DESC LIMIT 3`,
    [claimId]
  );
  console.log(`\n=== AI Assessments for claim ${claimId} ===`);
  for (const a of assessments) {
    console.log(`  id=${a.id}`);
    console.log(`  estimated_cost=${a.estimated_cost}`);
    console.log(`  estimated_parts_cost=${a.estimated_parts_cost}`);
    console.log(`  estimated_labor_cost=${a.estimated_labor_cost}`);
    console.log(`  currency_code=${a.currency_code}`);
    console.log(`  fraud=${a.fraud_risk_level} | confidence=${a.confidence_score} | severity=${a.structural_damage_severity}`);
    console.log(`  recommendation=${a.recommendation}`);
    if (a.cost_intelligence_json) {
      try {
        const ci = JSON.parse(a.cost_intelligence_json);
        console.log(`  cost_intelligence keys: ${Object.keys(ci).join(', ')}`);
        // Show the most important cost fields
        if (ci.totalEstimatedCost !== undefined) console.log(`  ci.totalEstimatedCost=${ci.totalEstimatedCost}`);
        if (ci.estimatedCost !== undefined) console.log(`  ci.estimatedCost=${ci.estimatedCost}`);
        if (ci.totalCost !== undefined) console.log(`  ci.totalCost=${ci.totalCost}`);
        if (ci.costDecision) console.log(`  ci.costDecision=${JSON.stringify(ci.costDecision).substring(0, 200)}`);
      } catch { console.log(`  cost_intelligence_json (raw): ${String(a.cost_intelligence_json).substring(0, 300)}`); }
    } else {
      console.log(`  cost_intelligence_json: NULL`);
    }
  }

  await conn.end();
}
main().catch(console.error);
