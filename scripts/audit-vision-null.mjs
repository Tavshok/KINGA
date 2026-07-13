import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.query(`
  SELECT
    a.id,
    a.claim_id,
    CASE WHEN a.damage_photos_json IS NOT NULL AND a.damage_photos_json != '[]' AND a.damage_photos_json != 'null' THEN 1 ELSE 0 END as has_a_photos,
    JSON_LENGTH(a.damage_photos_json) as a_photo_count,
    CASE WHEN a.enriched_photos_json IS NOT NULL AND a.enriched_photos_json != '[]' AND a.enriched_photos_json != 'null' THEN 1 ELSE 0 END as has_enriched,
    JSON_UNQUOTE(JSON_EXTRACT(a.physics_analysis, '$.visionSourceReliability')) as vsr,
    JSON_UNQUOTE(JSON_EXTRACT(a.physics_analysis, '$.physicsStatus')) as ps,
    CASE WHEN c.damage_photos IS NOT NULL AND c.damage_photos != '[]' AND c.damage_photos != 'null' THEN 1 ELSE 0 END as has_c_photos,
    JSON_LENGTH(c.damage_photos) as c_photo_count,
    CASE WHEN c.supporting_documents IS NOT NULL AND c.supporting_documents != '[]' AND c.supporting_documents != 'null' THEN 1 ELSE 0 END as has_docs
  FROM ai_assessments a
  LEFT JOIN claims c ON c.id = a.claim_id
  WHERE a.physics_analysis IS NOT NULL
  ORDER BY a.id DESC
`);

console.log(`Total physics-enabled assessments: ${rows.length}`);

const cats = {
  high: 0, medium: 0, low: 0,
  null_has_photos: 0,
  null_no_photos: 0,
};

const gapCases = [];

for (const r of rows) {
  const vsr = r.vsr;
  if (vsr === 'HIGH') { cats.high++; continue; }
  if (vsr === 'MEDIUM') { cats.medium++; continue; }
  if (vsr === 'LOW') { cats.low++; continue; }
  const hasPhotos = r.has_a_photos || r.has_c_photos || r.has_docs;
  if (hasPhotos) {
    cats.null_has_photos++;
    gapCases.push(r);
  } else {
    cats.null_no_photos++;
  }
}

console.log('\n=== BREAKDOWN ===');
console.log(`HIGH:                                ${cats.high}`);
console.log(`MEDIUM:                              ${cats.medium}`);
console.log(`LOW:                                 ${cats.low}`);
console.log(`null VSR, photos AVAILABLE (gap):    ${cats.null_has_photos}`);
console.log(`null VSR, NO photos submitted:       ${cats.null_no_photos}`);

if (gapCases.length > 0) {
  console.log('\n=== PIPELINE GAP CASES (sample, max 10) ===');
  gapCases.slice(0, 10).forEach(r => {
    console.log(`  id=${r.id} claim=${r.claim_id} a_photos=${r.a_photo_count} c_photos=${r.c_photo_count} enriched=${r.has_enriched} docs=${r.has_docs}`);
  });
  if (gapCases.length > 10) console.log(`  ... and ${gapCases.length - 10} more`);
}

const [enrichRows] = await conn.query(`
  SELECT
    CASE WHEN enriched_photos_json IS NOT NULL AND enriched_photos_json != '[]' THEN 'has_enriched' ELSE 'no_enriched' END as enriched,
    COUNT(*) as cnt
  FROM ai_assessments
  WHERE physics_analysis IS NOT NULL
  GROUP BY enriched
`);
console.log('\n=== enriched_photos_json for physics-enabled assessments ===');
enrichRows.forEach(r => console.log(`  ${r.enriched}: ${r.cnt}`));

await conn.end();
