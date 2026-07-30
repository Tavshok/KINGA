/**
 * Supplier classification audit for claim 8400001
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check panel_beaters schema
const [cols] = await conn.execute('DESCRIBE panel_beaters');
console.log('panel_beaters cols:', cols.map(c => c.Field).join(', '));

// Get panel beaters for claim 8400001
const [pbs] = await conn.execute(
  'SELECT pb.* FROM panel_beaters pb JOIN panel_beater_quotes q ON q.panel_beater_id = pb.id WHERE q.claim_id = 8400001'
);
console.log('\nPanel beaters:');
pbs.forEach(pb => {
  const keys = Object.keys(pb);
  const relevant = {};
  for (const k of keys) {
    if (['id','business_name','name','type','category','is_supplier','supplier_type','repairer_type','classification'].includes(k)) {
      relevant[k] = pb[k];
    }
  }
  console.log(JSON.stringify(relevant));
  // Also print all fields
  console.log('  All fields:', JSON.stringify(pb).substring(0, 300));
});

// Check quote_type and document_category
const [quotes] = await conn.execute(
  'SELECT id, quote_type, document_category, quoted_amount, currency FROM panel_beater_quotes WHERE claim_id = 8400001'
);
console.log('\nQuote types:');
quotes.forEach(q => console.log(JSON.stringify(q)));

// Check how stage-9 identifies supplier quotes (R-A-22 rule)
// The code: if (q.document_category) return q.document_category === 'repair_quote';
//           return (q.quote_type ?? 'repair') !== 'parts_supplier';
console.log('\nL1 inclusion (R-A-22 rule):');
quotes.forEach(q => {
  let included;
  if (q.document_category) {
    included = q.document_category === 'repair_quote';
  } else {
    included = (q.quote_type ?? 'repair') !== 'parts_supplier';
  }
  console.log(`  Quote ${q.id} (${q.quote_type}, doc_cat=${q.document_category}): included_in_L1=${included}`);
});

await conn.end();
