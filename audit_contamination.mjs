/**
 * Two-part audit:
 * 1. Contamination check: which stored damagedComponentsJson records contain UK-term
 *    components that came from vision model contamination (not from real documents)?
 * 2. Full US/UK terminology scan: check all known pairs across enriched photos corpus.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Known UK terms the vision model uses (from Wing/Fender finding)
const UK_TERMS = ['wing', 'bonnet', 'boot', 'windscreen', 'sill', 'saloon', 'estate', 'tyre'];
const US_TERMS = ['fender', 'hood', 'trunk', 'windshield', 'rocker panel', 'sedan', 'station wagon', 'tire'];

// ─── PART 1: Contamination in damagedComponentsJson ───────────────────────────
console.log('\n=== PART 1: damagedComponentsJson contamination audit ===');
console.log('Looking for UK-term components (Wing, Bonnet, Boot, Windscreen, Sill) in stored assessments...\n');

const [assessments] = await conn.query(`
  SELECT c.claim_number, c.vehicle_make, c.vehicle_model, c.vehicle_year,
         a.id as assessment_id,
         a.damaged_components_json,
         a.created_at
  FROM ai_assessments a
  JOIN claims c ON a.claim_id = c.id
  WHERE a.damaged_components_json IS NOT NULL
    AND a.damaged_components_json != '[]'
    AND a.damaged_components_json != 'null'
  ORDER BY c.claim_number
`);

const contaminated = [];
const ukTermPattern = /\b(wing|bonnet|boot lid|windscreen|sill|nearside|offside)\b/i;

for (const row of assessments) {
  try {
    const comps = JSON.parse(row.damaged_components_json);
    if (!Array.isArray(comps)) continue;
    const ukHits = comps.filter(c => ukTermPattern.test(c?.name ?? ''));
    const usHits = comps.filter(c => /\b(fender|hood|trunk|windshield|rocker)\b/i.test(c?.name ?? ''));
    if (ukHits.length > 0) {
      contaminated.push({
        claim_number: row.claim_number,
        vehicle: `${row.vehicle_make} ${row.vehicle_model} ${row.vehicle_year}`,
        assessment_id: row.assessment_id,
        created_at: row.created_at,
        uk_components: ukHits.map(c => c.name),
        us_components: usHits.map(c => c.name),
        total_components: comps.length,
      });
    }
  } catch {}
}

console.log(`Total assessments checked: ${assessments.length}`);
console.log(`Contaminated (contain UK-term components): ${contaminated.length}`);
console.log('');

for (const c of contaminated) {
  console.log(`  [${c.claim_number}] ${c.vehicle} | assessment: ${c.assessment_id} | created: ${c.created_at}`);
  console.log(`    UK terms: ${c.uk_components.join(', ')}`);
  if (c.us_components.length > 0) console.log(`    US terms (same assessment): ${c.us_components.join(', ')}`);
  console.log(`    Total components in this assessment: ${c.total_components}`);
}

// ─── PART 2: Full US/UK scan across enriched photos ───────────────────────────
console.log('\n\n=== PART 2: Full US/UK terminology scan across enriched photos corpus ===');

const termPairs = [
  { uk: 'wing',        us: 'fender',       label: 'Wing / Fender' },
  { uk: 'bonnet',      us: 'hood',         label: 'Bonnet / Hood' },
  { uk: 'boot',        us: 'trunk',        label: 'Boot / Trunk' },
  { uk: 'windscreen',  us: 'windshield',   label: 'Windscreen / Windshield' },
  { uk: 'sill',        us: 'rocker',       label: 'Sill / Rocker Panel' },
  { uk: 'nearside',    us: 'driver',       label: 'Nearside / Driver Side' },
  { uk: 'offside',     us: 'passenger',    label: 'Offside / Passenger Side' },
  { uk: 'tyre',        us: 'tire',         label: 'Tyre / Tire' },
  { uk: 'indicator',   us: 'turn signal',  label: 'Indicator / Turn Signal' },
  { uk: 'bumper',      us: 'bumper',       label: 'Bumper (same both)' },
];

const [enrichedAll] = await conn.query(`
  SELECT c.claim_number, c.vehicle_make, c.vehicle_model, c.vehicle_year,
         a.enriched_photos_json
  FROM ai_assessments a
  JOIN claims c ON a.claim_id = c.id
  WHERE a.enriched_photos_json IS NOT NULL
    AND a.enriched_photos_json != '[]'
    AND a.enriched_photos_json != 'null'
  ORDER BY c.claim_number
`);

// Collect all unique vision component names across entire corpus
const allVisionComponents = new Map(); // name -> count of claims
const claimVisionTerms = []; // per-claim breakdown

for (const row of enrichedAll) {
  try {
    const photos = JSON.parse(row.enriched_photos_json);
    if (!Array.isArray(photos)) continue;
    const claimTerms = new Set();
    for (const p of photos) {
      for (const c of (p?.detectedComponents ?? [])) {
        const name = (typeof c === 'string' ? c : (c?.name ?? '')).trim();
        if (name) {
          claimTerms.add(name);
          allVisionComponents.set(name, (allVisionComponents.get(name) ?? 0) + 1);
        }
      }
    }
    claimVisionTerms.push({ claim: row.claim_number, vehicle: `${row.vehicle_make} ${row.vehicle_model} ${row.vehicle_year}`, terms: [...claimTerms] });
  } catch {}
}

console.log(`\nTotal claims with enriched photos: ${enrichedAll.length}`);
console.log(`Total unique vision component names across corpus: ${allVisionComponents.size}`);

console.log('\n--- All unique vision component names (sorted, with claim count) ---');
const sorted = [...allVisionComponents.entries()].sort((a, b) => b[1] - a[1]);
for (const [name, count] of sorted) {
  console.log(`  "${name}" — ${count} claim(s)`);
}

console.log('\n--- UK/US pair analysis ---');
for (const pair of termPairs) {
  const ukMatches = [...allVisionComponents.entries()].filter(([n]) => new RegExp(`\\b${pair.uk}\\b`, 'i').test(n));
  const usMatches = [...allVisionComponents.entries()].filter(([n]) => new RegExp(`\\b${pair.us}\\b`, 'i').test(n));
  if (ukMatches.length > 0 || usMatches.length > 0) {
    console.log(`\n  ${pair.label}:`);
    if (ukMatches.length > 0) console.log(`    UK terms in vision output: ${ukMatches.map(([n,c]) => `"${n}"(${c})`).join(', ')}`);
    if (usMatches.length > 0) console.log(`    US terms in vision output: ${usMatches.map(([n,c]) => `"${n}"(${c})`).join(', ')}`);
    if (ukMatches.length > 0 && usMatches.length === 0) console.log(`    *** SYSTEMATIC UK-ONLY: vision always uses UK term, never US term ***`);
    if (usMatches.length > 0 && ukMatches.length === 0) console.log(`    *** SYSTEMATIC US-ONLY: vision always uses US term, never UK term ***`);
    if (usMatches.length > 0 && ukMatches.length > 0) console.log(`    *** MIXED: vision uses both terms — inconsistent ***`);
  }
}

// Also check what the real documents use for these pairs
console.log('\n\n--- Real document terminology (damagedComponentsJson, from submitted documents) ---');
const docTermCounts = new Map();
for (const row of assessments) {
  try {
    const comps = JSON.parse(row.damaged_components_json);
    if (!Array.isArray(comps)) continue;
    for (const c of comps) {
      const name = (c?.name ?? '').trim().toLowerCase();
      if (name) docTermCounts.set(name, (docTermCounts.get(name) ?? 0) + 1);
    }
  } catch {}
}

for (const pair of termPairs) {
  const ukDocMatches = [...docTermCounts.entries()].filter(([n]) => new RegExp(`\\b${pair.uk}\\b`, 'i').test(n));
  const usDocMatches = [...docTermCounts.entries()].filter(([n]) => new RegExp(`\\b${pair.us}\\b`, 'i').test(n));
  if (ukDocMatches.length > 0 || usDocMatches.length > 0) {
    console.log(`\n  ${pair.label}:`);
    if (ukDocMatches.length > 0) console.log(`    UK in real docs: ${ukDocMatches.slice(0,5).map(([n,c]) => `"${n}"(${c})`).join(', ')}`);
    if (usDocMatches.length > 0) console.log(`    US in real docs: ${usDocMatches.slice(0,5).map(([n,c]) => `"${n}"(${c})`).join(', ')}`);
  }
}

await conn.end();
console.log('\n=== AUDIT COMPLETE ===');
