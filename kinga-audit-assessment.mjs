import mysql from 'mysql2/promise';

const conn = mysql.createPool(process.env.DATABASE_URL);

async function run() {
  // Show all columns
  const [cols] = await conn.execute(`SHOW COLUMNS FROM ai_assessments`);
  console.log('\n=== ai_assessments columns ===');
  console.log(cols.map(c => c.Field).join(', '));

  // AI assessment for claim 1710001
  const [rows] = await conn.execute(
    `SELECT * FROM ai_assessments WHERE claim_id = 1710001 LIMIT 1`
  );
  if (!rows.length) { console.log('No assessment for claim 1710001'); process.exit(0); }
  const r = rows[0];
  console.log('\n=== AI Assessment Fields ===');
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'string' && v.length > 300) {
      console.log(`${k}: ${v.substring(0, 300)}...`);
    } else {
      console.log(`${k}:`, v);
    }
  }

  // Parse damaged_components_json
  console.log('\n=== Parsed damaged_components_json ===');
  try {
    const comps = JSON.parse(r.damaged_components_json || '[]');
    console.log(JSON.stringify(comps, null, 2));
  } catch(e) { console.log('Parse error:', e.message); }

  // Parse physics_analysis
  console.log('\n=== Parsed physics_analysis (top-level keys) ===');
  try {
    const phys = JSON.parse(r.physics_analysis || '{}');
    console.log('Keys:', Object.keys(phys));
    if (phys.damageConsistency) console.log('damageConsistency:', JSON.stringify(phys.damageConsistency).substring(0, 200));
    if (phys.impactDirection) console.log('impactDirection:', phys.impactDirection);
    if (phys.fraudIndicators) console.log('fraudIndicators:', JSON.stringify(phys.fraudIndicators).substring(0, 200));
    if (phys.score !== undefined) console.log('score:', phys.score);
  } catch(e) { console.log('Parse error:', e.message); }

  // Quotes for this claim
  console.log('\n=== Panel Beater Quotes ===');
  const [quotes] = await conn.execute(
    `SELECT id, panel_beater_id, total_amount, status, currency_code FROM panel_beater_quotes WHERE claim_id = 1710001`
  );
  console.log(JSON.stringify(quotes, null, 2));

  // Police report
  console.log('\n=== Police Reports table ===');
  try {
    const [pcols] = await conn.execute(`SHOW COLUMNS FROM police_reports`);
    console.log(pcols.map(c => c.Field).join(', '));
    const [police] = await conn.execute(`SELECT * FROM police_reports WHERE claim_id = 1710001 LIMIT 1`);
    console.log(police.length ? JSON.stringify(police[0], null, 2) : 'No police report for this claim');
  } catch(e) { console.log('Error:', e.message); }

  // Panel beater quotes columns
  console.log('\n=== panel_beater_quotes columns ===');
  const [qcols] = await conn.execute(`SHOW COLUMNS FROM panel_beater_quotes`);
  console.log(qcols.map(c => c.Field).join(', '));

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
