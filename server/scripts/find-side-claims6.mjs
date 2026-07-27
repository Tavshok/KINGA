import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find claims with collision_direction in claim_record_json
const [allDirs] = await conn.execute(
  `SELECT JSON_EXTRACT(claim_record_json, '$.accidentDetails.collisionDirection') as dir, COUNT(*) as cnt 
   FROM ai_assessments 
   WHERE claim_record_json IS NOT NULL
   GROUP BY dir ORDER BY cnt DESC LIMIT 20`
);
console.log('\n=== All collision directions in claim_record_json ===');
console.log(JSON.stringify(allDirs, null, 2));

// Find side-impact claims
const [sideRows] = await conn.execute(
  `SELECT c.id, c.claim_reference, c.vehicle_make, c.vehicle_model, c.vehicle_year, 
   aa.id as assessment_id,
   JSON_EXTRACT(aa.claim_record_json, '$.accidentDetails.collisionDirection') as collision_direction
   FROM claims c 
   JOIN ai_assessments aa ON c.id = aa.claim_id 
   WHERE JSON_EXTRACT(aa.claim_record_json, '$.accidentDetails.collisionDirection') LIKE '%side%'
   OR JSON_EXTRACT(aa.claim_record_json, '$.accidentDetails.collisionDirection') LIKE '%lateral%'
   OR JSON_EXTRACT(aa.claim_record_json, '$.accidentDetails.collisionDirection') LIKE '%t-bone%'
   OR JSON_EXTRACT(aa.claim_record_json, '$.accidentDetails.collisionDirection') LIKE '%sideswipe%'
   LIMIT 10`
);
console.log('\n=== Side-impact claims ===');
console.log(JSON.stringify(sideRows, null, 2));

await conn.end();
