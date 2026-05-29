const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.query(`
    SELECT pbq.id, pbq.quoted_amount, pbq.created_at, pb.business_name, pb.name as pb_name
    FROM panel_beater_quotes pbq
    LEFT JOIN panel_beaters pb ON pbq.panel_beater_id = pb.id
    WHERE pbq.claim_id = 6930001
    ORDER BY pbq.id
  `);
  console.log('Quotes in DB for claim 6930001:');
  rows.forEach(r => console.log(`  ID=${r.id} | ${r.business_name || r.pb_name} | $${(r.quoted_amount/100).toFixed(2)} | ${r.created_at}`));
  console.log(`Total: ${rows.length} quotes`);
  await conn.end();
}
main().catch(console.error);
