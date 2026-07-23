import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find claim by kinga_ref, claim_reference, or claim_number
const [rows] = await conn.execute(
  `SELECT id, claim_number, kinga_ref, claim_reference FROM claims 
   WHERE kinga_ref LIKE ? OR claim_reference LIKE ? OR claim_number LIKE ?
   LIMIT 5`,
  ['%8880001%', '%8880001%', '%8880001%']
);
console.log('Matching claims:', JSON.stringify(rows, null, 2));

// Also show the quote_line_items count per claim
const [qliCounts] = await conn.execute(
  `SELECT q.claim_id, COUNT(qli.id) as line_item_count, COUNT(DISTINCT q.id) as quote_count
   FROM panel_beater_quotes q
   LEFT JOIN quote_line_items qli ON qli.quote_id = q.id
   GROUP BY q.claim_id
   ORDER BY line_item_count DESC
   LIMIT 5`
);
console.log('\nTop claims by line item count:', JSON.stringify(qliCounts, null, 2));

await conn.end();
