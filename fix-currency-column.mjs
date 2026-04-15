import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [cols] = await conn.execute('SHOW COLUMNS FROM quote_line_items');
const names = cols.map(c => c.Field);
console.log('Existing columns:', names.join(', '));

if (!names.includes('currency')) {
  await conn.execute("ALTER TABLE quote_line_items ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'USD' AFTER line_total");
  console.log('✅ Added currency column to quote_line_items');
} else {
  console.log('✅ currency column already exists');
}

// Also check panel_beater_quotes for currency
const [qcols] = await conn.execute('SHOW COLUMNS FROM panel_beater_quotes');
const qnames = qcols.map(c => c.Field);
if (!qnames.includes('currency')) {
  await conn.execute("ALTER TABLE panel_beater_quotes ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'USD'");
  console.log('✅ Added currency column to panel_beater_quotes');
} else {
  console.log('✅ panel_beater_quotes.currency already exists');
}

// Also check claims for currency
const [clcols] = await conn.execute('SHOW COLUMNS FROM claims');
const clnames = clcols.map(c => c.Field);
if (!clnames.includes('currency')) {
  await conn.execute("ALTER TABLE claims ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'USD'");
  console.log('✅ Added currency column to claims');
} else {
  console.log('✅ claims.currency already exists');
}

await conn.end();
console.log('Migration complete.');
