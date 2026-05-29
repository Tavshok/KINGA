const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Delete all pipeline_extracted quotes for claim 6930001
  const [result] = await conn.query(`
    DELETE pbq FROM panel_beater_quotes pbq
    WHERE pbq.claim_id = 6930001
    AND pbq.notes LIKE '%pipeline_extracted%'
  `);
  console.log(`Deleted ${result.affectedRows} stale pipeline-extracted quotes for claim 6930001`);
  
  // Verify what's left
  const [rows] = await conn.query(`
    SELECT pbq.id, pbq.quoted_amount, pbq.notes, pb.business_name
    FROM panel_beater_quotes pbq
    LEFT JOIN panel_beaters pb ON pbq.panel_beater_id = pb.id
    WHERE pbq.claim_id = 6930001
    ORDER BY pbq.id
  `);
  console.log(`Remaining quotes: ${rows.length}`);
  rows.forEach(r => console.log(`  ID=${r.id} | ${r.business_name} | $${(r.quoted_amount/100).toFixed(2)} | notes: ${r.notes}`));
  
  await conn.end();
}
main().catch(console.error);
