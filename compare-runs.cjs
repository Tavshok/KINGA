'use strict';
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL });

  // Get both assessments for the BMW claim
  const [rows] = await conn.execute(
    `SELECT id, recommendation, fraud_score, fraud_risk_level, fraud_indicators,
            image_analysis_total_count, image_analysis_success_count, image_analysis_failed_count,
            damage_components_json, enriched_photos_json
     FROM ai_assessments WHERE claim_id = 4380001 ORDER BY id DESC LIMIT 2`
  );

  for (const row of rows) {
    console.log('\n========== Assessment ID:', row.id, '==========');
    console.log('Recommendation:', row.recommendation);
    console.log('Fraud Score:', row.fraud_score, '/', row.fraud_risk_level);
    console.log('Image analysis: total=' + row.image_analysis_total_count +
                ' success=' + row.image_analysis_success_count +
                ' failed=' + row.image_analysis_failed_count);

    const indicators = JSON.parse(row.fraud_indicators || '[]');
    console.log('\nFraud Indicators (' + indicators.length + '):');
    indicators.forEach((ind, i) => {
      const score = typeof ind === 'string' ? '?' : ind.score;
      const code = typeof ind === 'string' ? ind.substring(0, 80) : ind.indicator;
      console.log('  ' + (i+1) + '. [score=' + score + '] ' + code);
    });

    const components = JSON.parse(row.damage_components_json || '[]');
    console.log('\nDamage Components (' + components.length + '):');
    components.slice(0, 8).forEach((c, i) => {
      const name = typeof c === 'string' ? c : (c.name || c.component || JSON.stringify(c).substring(0, 60));
      console.log('  ' + (i+1) + '. ' + name);
    });
    if (components.length > 8) console.log('  ... and ' + (components.length - 8) + ' more');

    const enriched = JSON.parse(row.enriched_photos_json || '[]');
    console.log('\nEnriched Photos (' + enriched.length + '):');
    enriched.slice(0, 3).forEach((p, i) => {
      const url = p.url || p.photoUrl || '?';
      const components = p.components || p.detectedComponents || [];
      console.log('  ' + (i+1) + '. ' + url.substring(url.length - 40) + ' → ' + components.length + ' components');
    });
  }

  await conn.end();
}

main().catch(e => console.error('Error:', e.message));
