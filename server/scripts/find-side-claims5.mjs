import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check accident_type distribution in ai_assessments
const [dirs] = await conn.execute(
  `SELECT accident_type, COUNT(*) as cnt FROM ai_assessments GROUP BY accident_type ORDER BY cnt DESC LIMIT 20`
);
console.log('\n=== accident_type distribution in ai_assessments ===');
console.log(JSON.stringify(dirs, null, 2));

// Find side-impact claims
const [sideRows] = await conn.execute(
  `SELECT c.id, c.claim_reference, c.vehicle_make, c.vehicle_model, c.vehicle_year, 
   aa.id as assessment_id, aa.accident_type
   FROM claims c 
   JOIN ai_assessments aa ON c.id = aa.claim_id 
   WHERE aa.accident_type LIKE '%side%' OR aa.accident_type LIKE '%lateral%' OR aa.accident_type LIKE '%t-bone%' OR aa.accident_type LIKE '%sideswipe%'
   LIMIT 10`
);
console.log('\n=== Side-impact claims ===');
console.log(JSON.stringify(sideRows, null, 2));

// Find claims with collision_direction in physics_analysis JSON
const [physRows] = await conn.execute(
  `SELECT c.id, c.claim_reference, c.vehicle_make, c.vehicle_model, 
   aa.id as assessment_id,
   JSON_EXTRACT(aa.physics_analysis, '$.collisionDirection') as collision_direction
   FROM claims c 
   JOIN ai_assessments aa ON c.id = aa.claim_id 
   WHERE JSON_EXTRACT(aa.physics_analysis, '$.collisionDirection') LIKE '%side%'
   LIMIT 10`
);
console.log('\n=== Claims with side collision_direction in physics_analysis ===');
console.log(JSON.stringify(physRows, null, 2));

// All collision directions in physics_analysis
const [allDirs] = await conn.execute(
  `SELECT JSON_EXTRACT(physics_analysis, '$.collisionDirection') as dir, COUNT(*) as cnt 
   FROM ai_assessments 
   WHERE physics_analysis IS NOT NULL
   GROUP BY dir ORDER BY cnt DESC LIMIT 20`
);
console.log('\n=== All collision directions in physics_analysis ===');
console.log(JSON.stringify(allDirs, null, 2));

await conn.end();
