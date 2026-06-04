import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool(process.env.DATABASE_URL);

const [rows] = await pool.execute(`
  SELECT pbq.id, pbq.panel_beater_id, pbq.quoted_amount, pbq.status, pbq.modified, 
         pbq.quote_type, pb.business_name
  FROM panel_beater_quotes pbq
  LEFT JOIN panel_beaters pb ON pbq.panel_beater_id = pb.id
  WHERE pbq.claim_id = 7260001
  ORDER BY pbq.id
`);

console.log('Claim 7260001 quotes:');
rows.forEach(r => console.log(JSON.stringify(r)));

await pool.end();
