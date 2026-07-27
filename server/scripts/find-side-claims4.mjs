import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check claims table columns
const [claimCols] = await conn.execute('DESCRIBE claims');
console.log('\n=== claims columns ===');
for (const row of claimCols) {
  console.log(row.Field, row.Type);
}

// Check ai_assessments columns
const [aaCols] = await conn.execute('DESCRIBE ai_assessments');
console.log('\n=== ai_assessments columns ===');
for (const row of aaCols) {
  console.log(row.Field, row.Type);
}

await conn.end();
