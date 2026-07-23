import { createConnection } from "mysql2/promise";
const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.query(`
  SELECT qli.id, qli.quote_id, qli.description, qli.category, qli.quantity, qli.unit_price, qli.line_total, qli.currency
  FROM quote_line_items qli
  INNER JOIN panel_beater_quotes pbq ON pbq.id = qli.quote_id
  WHERE pbq.claim_id = 8880001
  ORDER BY qli.quote_id, qli.item_number
  LIMIT 30
`);
console.log("quote_line_items for claim 8880001:");
console.log(JSON.stringify(rows, null, 2));
const [counts] = await conn.query(`
  SELECT pbq.id as quote_id, pbq.quoted_amount, pbq.currency_code, COUNT(qli.id) as line_item_count
  FROM panel_beater_quotes pbq
  LEFT JOIN quote_line_items qli ON qli.quote_id = pbq.id
  WHERE pbq.claim_id = 8880001
  GROUP BY pbq.id, pbq.quoted_amount, pbq.currency_code
`);
console.log("\nQuote summary with line item counts:");
console.log(JSON.stringify(counts, null, 2));
await conn.end();
