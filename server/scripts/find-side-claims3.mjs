import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find collision direction field in ai_assessments or pipeline_runs
const [aiCols] = await conn.execute('DESCRIBE ai_assessments');
console.log('\n=== ai_assessments columns ===');
for (const row of aiCols) {
  if (row.Field.includes('collision') || row.Field.includes('direction') || row.Field.includes('speed') || row.Field.includes('severity')) {
    console.log(row.Field, row.Type);
  }
}

// Check pipeline_runs
const [prCols] = await conn.execute('DESCRIBE pipeline_runs');
console.log('\n=== pipeline_runs columns ===');
for (const row of prCols) {
  console.log(row.Field, row.Type);
}

// Find side-impact claims from ai_assessments
const [sideRows] = await conn.execute(
  `SELECT c.id, c.claim_reference, c.vehicle_make, c.vehicle_model, c.vehicle_year, 
   aa.id as assessment_id, aa.collision_direction, aa.damage_severity
   FROM claims c 
   JOIN ai_assessments aa ON c.id = aa.claim_id 
   WHERE aa.collision_direction LIKE '%side%' OR aa.collision_direction LIKE '%lateral%' OR aa.collision_direction LIKE '%t-bone%' OR aa.collision_direction LIKE '%sideswipe%'
   LIMIT 10`
);
console.log('\n=== Side-impact claims ===');
console.log(JSON.stringify(sideRows, null, 2));

// All directions
const [dirs] = await conn.execute(
  `SELECT collision_direction, COUNT(*) as cnt FROM ai_assessments GROUP BY collision_direction ORDER BY cnt DESC LIMIT 20`
);
console.log('\n=== All collision directions ===');
console.log(JSON.stringify(dirs, null, 2));

await conn.end();
