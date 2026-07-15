import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Check VOLTRON incident date and vehicle year
const [rows] = await conn.execute(
  `SELECT id, claim_number, vehicle_make, vehicle_model, vehicle_year, incident_date 
   FROM claims WHERE id = 8880001`
);
console.log('VOLTRON claim data:');
console.log(JSON.stringify(rows[0], null, 2));

// 2. Check if there are other claims with impossible dates
const [bad] = await conn.execute(
  `SELECT c.id, c.claim_number, c.vehicle_make, c.vehicle_model, c.vehicle_year, c.incident_date
   FROM claims c
   WHERE c.vehicle_year IS NOT NULL 
     AND c.incident_date IS NOT NULL
     AND YEAR(c.incident_date) < c.vehicle_year
   LIMIT 20`
);
console.log('\nClaims with incident_date before vehicle_year:');
console.log(JSON.stringify(bad, null, 2));
console.log(`Total impossible-date claims found: ${bad.length}`);

await conn.end();
