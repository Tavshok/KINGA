/**
 * KINGA — Component Benchmark Seeder
 * Reads component_benchmarks.json and inserts all entries into the database.
 * Run: node seed_benchmarks.mjs
 */

import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATA_PATH = '/home/ubuntu/component_benchmarks.json';
const MODEL_VERSION = 'v1.0';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const conn = await createConnection(url);
  console.log('Connected to database');

  // Load benchmark data
  const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  const benchmarks = raw.benchmarks;
  console.log(`Loaded ${benchmarks.length} benchmark entries from JSON`);

  // Clear existing benchmarks for this model version
  const [delResult] = await conn.execute(
    'DELETE FROM component_benchmarks WHERE model_version = ?',
    [MODEL_VERSION]
  );
  console.log(`Cleared ${delResult.affectedRows} existing entries for model version ${MODEL_VERSION}`);

  // Insert all benchmarks
  let inserted = 0;
  let errors = 0;

  for (const b of benchmarks) {
    try {
      await conn.execute(
        `INSERT INTO component_benchmarks
          (component_id, vehicle_make, category, n, p25, median, p75, p95, min_cost, max_cost, confidence, model_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          b.component_id,
          b.make ?? null,
          null,  // category — will be populated in future model version
          b.n,
          b.p25,
          b.median,
          b.p75,
          b.p95 ?? null,
          b.min,
          b.max,
          b.confidence,
          MODEL_VERSION,
        ]
      );
      inserted++;
    } catch (err) {
      console.error(`  Error inserting ${b.component_id} / ${b.make}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nSeeding complete:`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Errors:   ${errors}`);

  // Verify
  const [rows] = await conn.execute(
    'SELECT confidence, COUNT(*) as cnt FROM component_benchmarks WHERE model_version = ? GROUP BY confidence',
    [MODEL_VERSION]
  );
  console.log('\nDatabase verification:');
  for (const row of rows) {
    console.log(`  ${row.confidence}: ${row.cnt} entries`);
  }

  const [total] = await conn.execute(
    'SELECT COUNT(*) as total FROM component_benchmarks WHERE model_version = ?',
    [MODEL_VERSION]
  );
  console.log(`  Total: ${total[0].total} entries`);

  await conn.end();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
