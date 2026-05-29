const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.query(`
    SELECT cost_intelligence_json FROM ai_assessments 
    WHERE claim_id = 6930001 ORDER BY id DESC LIMIT 1
  `);
  if (!rows.length) { console.log('No assessment'); await conn.end(); return; }
  const ci = JSON.parse(rows[0].cost_intelligence_json);
  const items = ci?.compositeOptimisation?.compositeLineItems ?? [];
  console.log(`Total composite line items: ${items.length}`);
  if (items.length > 0) {
    console.log('First item keys:', Object.keys(items[0]));
    console.log('First 3 items:');
    items.slice(0, 3).forEach((item, i) => {
      console.log(`  [${i}]:`, JSON.stringify(item, null, 2));
    });
  }
  await conn.end();
}
main().catch(console.error);
