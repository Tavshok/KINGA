const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Get all panel_beater_quotes for this claim (join panel_beaters for name)
  const [quotes] = await conn.query(
    `SELECT pbq.id, pb.name as pb_name, pbq.quoted_amount, pbq.currency, pbq.notes
     FROM panel_beater_quotes pbq
     LEFT JOIN panel_beaters pb ON pb.id = pbq.panel_beater_id
     WHERE pbq.claim_id = 6930001
     ORDER BY pbq.id ASC`
  );
  console.log('=== PANEL BEATER QUOTES IN DB ===');
  console.log(`Found ${quotes.length} quotes\n`);

  for (const q of quotes) {
    // Get line items for this quote
    const [items] = await conn.query(
      `SELECT description, line_total, unit_price, quantity, repairer_name
       FROM quote_line_items
       WHERE quote_id = ?
       ORDER BY item_number ASC`,
      [q.id]
    );

    const sumItems = items.reduce((s, i) => s + parseFloat(i.line_total || 0), 0);
    const storedTotal = parseFloat(q.quoted_amount || 0);
    const diff = storedTotal - sumItems;
    const mismatch = Math.abs(diff) > 0.02;

    console.log(`Quote ID: ${q.id} | ${q.pb_name || '(no name)'}`);
    console.log(`  Stored total:  $${storedTotal.toFixed(2)}`);
    console.log(`  Sum of items:  $${sumItems.toFixed(2)}`);
    console.log(`  Difference:    $${diff.toFixed(2)} ${mismatch ? '<<< MISMATCH' : '✓ OK'}`);
    console.log(`  Line items (${items.length}):`);
    items.forEach(i => {
      const desc = (i.description || '').substring(0, 45).padEnd(45);
      console.log(`    ${desc} $${parseFloat(i.line_total||0).toFixed(2)}`);
    });
    console.log('');
  }

  // Also check composite from latest assessment with data
  const [assessments] = await conn.query(
    `SELECT id, cost_intelligence_json FROM ai_assessments
     WHERE claim_id = 6930001
     AND cost_intelligence_json IS NOT NULL
     ORDER BY id DESC LIMIT 10`
  );

  let ciFound = null;
  for (const a of assessments) {
    try {
      const ci = JSON.parse(a.cost_intelligence_json);
      const sq = ci?.quoteOptimisation?.selected_quotes || [];
      if (sq.length > 0) { ciFound = { id: a.id, ci }; break; }
    } catch(e) {}
  }

  if (ciFound) {
    const { id, ci } = ciFound;
    const comp = ci.compositeOptimisation;
    const sq = ci.quoteOptimisation.selected_quotes;
    console.log(`\n=== CI JSON (Assessment ${id}) ===`);
    console.log(`selected_quotes: ${sq.length}`);
    sq.forEach(q => {
      const items = q.line_items || [];
      const sum = items.reduce((s, i) => s + (i.cost_usd || 0), 0);
      const stored = q.total_cost_usd || q.total_cost || 0;
      const diff = stored - sum;
      console.log(`  ${(q.panel_beater||'').substring(0,40)}: stored=$${stored.toFixed(2)} sum=$${sum.toFixed(2)} diff=$${diff.toFixed(2)} items=${items.length}`);
    });
    if (comp) {
      const compItems = comp.compositeLineItems || [];
      const compSum = compItems.reduce((s, i) => s + (i.selectedCostUsd || 0), 0);
      console.log(`\n  L1 (lowest panel beater): $${comp.l1LowestSubmittedCostUsd}`);
      console.log(`  L2 (KINGA optimised):     $${comp.l2CompositeOptimisedCostUsd}`);
      console.log(`  Sum of composite items:   $${compSum.toFixed(2)}`);
      console.log(`  Savings:                  $${comp.savingsL1vsL2Usd}`);
      console.log(`  Composite items (${compItems.length}):`);
      compItems.forEach(i => {
        const name = (i.componentName||'').substring(0,40).padEnd(40);
        console.log(`    ${name} $${(i.selectedCostUsd||0).toFixed(2)}  from: ${i.selectedFromQuote||'?'}`);
      });
    }
  } else {
    console.log('\nNo CI JSON with selected_quotes found in DB — API quota exhausted, last run failed');
    console.log('Checking panel_beater_quotes for stored totals vs line item sums only');
  }

  await conn.end();
}
main().catch(console.error);
