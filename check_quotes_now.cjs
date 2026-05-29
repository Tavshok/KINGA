const mysql = require('./node_modules/.pnpm/mysql2@3.15.1/node_modules/mysql2/promise.js');
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  // Check all quotes in DB
  const [quotes] = await conn.execute(`
    SELECT pbq.id, pbq.claim_id, pbq.quoted_amount, pbq.notes, pbq.created_at,
           pb.business_name, pb.name as pb_name
    FROM panel_beater_quotes pbq 
    LEFT JOIN panel_beaters pb ON pb.id = pbq.panel_beater_id 
    ORDER BY pbq.claim_id, pbq.id 
    LIMIT 30
  `);
  console.log('=== ALL QUOTES IN DB ===');
  console.log(JSON.stringify(quotes, null, 2));
  
  // Check line items count per quote
  const [lineItems] = await conn.execute(`
    SELECT quote_id, COUNT(*) as item_count, SUM(unit_cost * quantity) as sum_items
    FROM quote_line_items
    GROUP BY quote_id
    ORDER BY quote_id
    LIMIT 20
  `);
  console.log('\n=== LINE ITEMS PER QUOTE ===');
  console.log(JSON.stringify(lineItems, null, 2));
  
  await conn.end();
}
main().catch(e => console.error('ERROR:', e.message));
