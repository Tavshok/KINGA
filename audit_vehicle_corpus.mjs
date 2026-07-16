import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Find cost-learning related tables
const [tables] = await conn.query(`
  SELECT TABLE_NAME
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
  AND (
    TABLE_NAME LIKE '%cost%learn%' OR
    TABLE_NAME LIKE '%learn%cost%' OR
    TABLE_NAME LIKE '%part%cost%' OR
    TABLE_NAME LIKE '%cost%pattern%' OR
    TABLE_NAME LIKE '%vehicle%cost%' OR
    TABLE_NAME LIKE '%repair%cost%' OR
    TABLE_NAME LIKE '%benchmark%' OR
    TABLE_NAME LIKE '%cost%record%' OR
    TABLE_NAME LIKE '%cost%model%'
  )
  ORDER BY TABLE_NAME
`);
console.log('=== COST LEARNING TABLES ===');
for (const t of tables) console.log(' ', t.TABLE_NAME);

// 2. Also check claims table for make/model/year
console.log('\n=== VEHICLE MAKE/MODEL/YEAR FROM CLAIMS TABLE ===');
try {
  const [rows] = await conn.query(`
    SELECT
      vehicle_make,
      vehicle_model,
      vehicle_year,
      COUNT(*) as claim_count
    FROM claims
    WHERE vehicle_make IS NOT NULL AND vehicle_make != ''
    GROUP BY vehicle_make, vehicle_model, vehicle_year
    ORDER BY claim_count DESC
    LIMIT 40
  `);
  console.log(`Top 40 vehicle make/model/year combinations (${rows.length} rows):`);
  for (const r of rows) {
    console.log(`  ${r.claim_count.toString().padStart(4)}x  ${r.vehicle_make} ${r.vehicle_model || ''} ${r.vehicle_year || '(no year)'}`);
  }
} catch (e) {
  console.log('  Error querying claims:', e.message);
}

// 3. Check vehicle_registry for make/model/year distribution
console.log('\n=== VEHICLE MAKE/MODEL/YEAR FROM VEHICLE REGISTRY ===');
try {
  const [rows] = await conn.query(`
    SELECT
      make,
      model,
      year,
      COUNT(*) as count
    FROM vehicle_registry
    WHERE make IS NOT NULL AND make != ''
    GROUP BY make, model, year
    ORDER BY count DESC
    LIMIT 40
  `);
  console.log(`Top 40 from vehicle_registry:`);
  for (const r of rows) {
    console.log(`  ${r.count.toString().padStart(4)}x  ${r.make} ${r.model || ''} ${r.year || '(no year)'}`);
  }
} catch (e) {
  console.log('  Error:', e.message);
}

// 4. Check each cost learning table for vehicle columns
for (const t of tables) {
  try {
    const [[{cnt}]] = await conn.query(`SELECT COUNT(*) AS cnt FROM \`${t.TABLE_NAME}\``);
    if (cnt === 0) { console.log(`\n${t.TABLE_NAME}: empty`); continue; }
    const [cols] = await conn.query(`DESCRIBE \`${t.TABLE_NAME}\``);
    const colNames = cols.map(c => c.Field);
    const vehicleCols = colNames.filter(c => c.toLowerCase().includes('make') || c.toLowerCase().includes('model') || c.toLowerCase().includes('year') || c.toLowerCase().includes('vehicle'));
    console.log(`\n=== ${t.TABLE_NAME} (${cnt} rows) ===`);
    console.log('  Columns:', colNames.join(', '));
    if (vehicleCols.length > 0) {
      // Get distribution by vehicle
      const groupBy = vehicleCols.slice(0, 3).map(c => `\`${c}\``).join(', ');
      const [dist] = await conn.query(`
        SELECT ${groupBy}, COUNT(*) as cnt
        FROM \`${t.TABLE_NAME}\`
        GROUP BY ${groupBy}
        ORDER BY cnt DESC
        LIMIT 20
      `);
      for (const r of dist) console.log('  ', JSON.stringify(r));
    }
  } catch (e) {
    console.log(`\n${t.TABLE_NAME}: ERROR - ${e.message}`);
  }
}

await conn.end();
