import "dotenv/config";
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  const rows = await db.execute(sql`
  SELECT 
    a.id,
    a.created_at,
    JSON_EXTRACT(a.claim_record_json, '$.accidentDetails.collisionDirection') AS collision_direction,
    JSON_EXTRACT(a.claim_record_json, '$.accidentDetails.estimatedSpeedKmh') AS claimed_speed_kmh,
    JSON_EXTRACT(a.claim_record_json, '$.accidentDetails.incidentMechanism') AS incident_mechanism,
    JSON_EXTRACT(a.claim_record_json, '$.accidentDetails.description') AS incident_description,
    JSON_EXTRACT(a.physics_truth_json, '$.speed.consensusSpeedKmh') AS consensus_speed,
    JSON_EXTRACT(a.physics_truth_json, '$.speed.m7.claimedSpeedKmh') AS m7_claimed_speed,
    JSON_EXTRACT(a.physics_truth_json, '$.speed.m7.active') AS m7_active,
    JSON_EXTRACT(a.cross_validation_json, '$.directionContradiction') AS direction_contradiction,
    JSON_EXTRACT(a.cross_validation_json, '$.threeWaySpeedComparison') AS three_way_speed,
    JSON_EXTRACT(a.cross_validation_json, '$.riskLevel') AS xv_risk,
    JSON_EXTRACT(a.cross_validation_json, '$.findings') AS xv_findings,
    c.estimated_speed_kmh AS claim_estimated_speed,
    JSON_EXTRACT(a.claim_truth_object_json, '$.damageClassification.crushDepthConsistencyCheck') AS crush_depth_check,
    JSON_EXTRACT(a.claim_truth_object_json, '$.damageClassification.restraintConsistencyCheck') AS restraint_check,
    JSON_EXTRACT(a.claim_truth_object_json, '$.damageClassification.overallClassification') AS damage_classification,
    JSON_EXTRACT(a.claim_truth_object_json, '$.damageClassification.counts') AS damage_counts
  FROM ai_assessments a
  JOIN claims c ON c.id = a.claim_id
  WHERE a.claim_id = 10719902
  ORDER BY a.created_at DESC
  LIMIT 1
`);

  console.log('=== VOLTRON-001 POST-RERUN VERIFICATION ===');
  console.log(JSON.stringify(rows[0], null, 2));
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
