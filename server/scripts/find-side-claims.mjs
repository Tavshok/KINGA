import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find all distinct collision directions in the DB
const [dirs] = await conn.execute(
  `SELECT collision_direction, COUNT(*) as cnt FROM claim_assessments GROUP BY collision_direction ORDER BY cnt DESC`
);
console.log('\n=== Collision directions in claim_assessments ===');
console.log(JSON.stringify(dirs, null, 2));

// Find side-impact claims
const [sideRows] = await conn.execute(
  `SELECT c.id, c.claim_reference, c.vehicle_make, c.vehicle_model, c.vehicle_year, 
   ca.id as assessment_id, ca.collision_direction, ca.damage_severity
   FROM claims c 
   JOIN claim_assessments ca ON c.id = ca.claim_id 
   WHERE ca.collision_direction LIKE '%side%' OR ca.collision_direction LIKE '%lateral%' OR ca.collision_direction LIKE '%t-bone%' OR ca.collision_direction LIKE '%sideswipe%'
   LIMIT 10`
);
console.log('\n=== Side-impact claims ===');
console.log(JSON.stringify(sideRows, null, 2));

await conn.end();
