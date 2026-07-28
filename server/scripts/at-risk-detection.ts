import { getDb } from '../db';
import { sql } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.error('No DB'); process.exit(1); }

  // Detection query: claims with NULL claimant_stated_speed_kmh that have at least one prior pipeline run
  const atRiskResult = await db.execute(sql`
    SELECT 
      COUNT(*) AS at_risk_count,
      SUM(CASE WHEN c.estimated_speed_kmh IS NOT NULL THEN 1 ELSE 0 END) AS has_estimated_speed,
      SUM(CASE WHEN c.estimated_speed_kmh IS NULL THEN 1 ELSE 0 END) AS no_estimated_speed
    FROM claims c
    WHERE c.claimant_stated_speed_kmh IS NULL
      AND EXISTS (
        SELECT 1 FROM ai_assessments a WHERE a.claim_id = c.id
      )
  `) as any;
  const atRisk = (atRiskResult[0] as any[])[0];

  // Total claims breakdown
  const totalResult = await db.execute(sql`
    SELECT 
      COUNT(*) AS total_claims,
      SUM(CASE WHEN claimant_stated_speed_kmh IS NOT NULL THEN 1 ELSE 0 END) AS locked,
      SUM(CASE WHEN claimant_stated_speed_kmh IS NULL THEN 1 ELSE 0 END) AS not_locked,
      SUM(CASE WHEN claimant_stated_speed_kmh IS NULL AND NOT EXISTS (
        SELECT 1 FROM ai_assessments a WHERE a.claim_id = claims.id
      ) THEN 1 ELSE 0 END) AS safe_no_prior_run
    FROM claims
  `) as any;
  const total = (totalResult[0] as any[])[0];

  // Sample of at-risk claims (top 5 by assessment count)
  const sampleResult = await db.execute(sql`
    SELECT 
      c.id,
      c.claim_number,
      c.estimated_speed_kmh,
      c.claimant_stated_speed_kmh,
      COUNT(a.id) AS assessment_count
    FROM claims c
    LEFT JOIN ai_assessments a ON a.claim_id = c.id
    WHERE c.claimant_stated_speed_kmh IS NULL
      AND EXISTS (
        SELECT 1 FROM ai_assessments a2 WHERE a2.claim_id = c.id
      )
    GROUP BY c.id, c.claim_number, c.estimated_speed_kmh, c.claimant_stated_speed_kmh
    ORDER BY assessment_count DESC
    LIMIT 5
  `) as any;
  const sample = sampleResult[0] as any[];

  console.log('\n=== AT-RISK CLAIMS DETECTION QUERY ===');
  console.log('Claims with NULL claimant_stated_speed_kmh AND at least one prior pipeline run:');
  console.log(`  at_risk_count:       ${atRisk.at_risk_count}`);
  console.log(`  has_estimated_speed: ${atRisk.has_estimated_speed}  (estimated_speed_kmh was overwritten with consensus)`);
  console.log(`  no_estimated_speed:  ${atRisk.no_estimated_speed}  (no speed data at all)`);

  console.log('\n=== TOTAL CLAIMS TABLE BREAKDOWN ===');
  console.log(`  total_claims:        ${total.total_claims}`);
  console.log(`  locked (immutable):  ${total.locked}`);
  console.log(`  not_locked:          ${total.not_locked}`);
  console.log(`  safe (no prior run): ${total.safe_no_prior_run}`);
  console.log(`  AT RISK (not_locked - safe): ${Number(total.not_locked) - Number(total.safe_no_prior_run)}`);

  console.log('\n=== SAMPLE AT-RISK CLAIMS (top 5 by assessment count) ===');
  for (const row of sample) {
    console.log(`  claim_id=${row.id} | claim_number=${row.claim_number} | estimated_speed_kmh=${row.estimated_speed_kmh} | assessments=${row.assessment_count}`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
