import mysql from 'mysql2/promise';
import fs from 'fs';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await mysql.createConnection(dbUrl);
try {
  const [rows] = await conn.execute(
    `SELECT DISTINCT measurement_type, COUNT(*) as cnt FROM vehicle_geometry_measurements GROUP BY measurement_type ORDER BY cnt DESC`
  );
  console.log(JSON.stringify(rows, null, 2));
  fs.writeFileSync('/tmp/measurement-types.json', JSON.stringify(rows, null, 2));
} finally {
  await conn.end();
}
