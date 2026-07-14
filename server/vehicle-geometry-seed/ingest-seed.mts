/**
 * VGE Seed Ingestion Script
 * Imports vehicle geometry profiles from JSON seed files into the database.
 * Run with: node --loader ts-node/esm server/vehicle-geometry-seed/ingest-seed.mts
 * Or:       npx tsx server/vehicle-geometry-seed/ingest-seed.mts
 *
 * Safe to re-run — uses INSERT IGNORE / upsert semantics.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Seed file schema types ────────────────────────────────────────────────────
interface SeedMeasurement {
  type: string;
  valueMm: number;
  unit?: string;
  sourceType: string;
  sourceReference: string;
  confidence: number;
}

interface SeedLandmark {
  type: string;
  xMm?: number;
  yMm?: number;
  zMm?: number;
  sourceType: string;
  confidence: number;
}

interface SeedFile {
  model: {
    manufacturer: string;
    model: string;
    variant?: string;
    generation?: string;
    yearFrom: number;
    yearTo?: number;
    bodyType?: string;
    marketRegion?: string;
  };
  measurements: SeedMeasurement[];
  landmarks: SeedLandmark[];
}

// ── Measurement type registry (tier + base reliability) ──────────────────────
const MEASUREMENT_TYPE_REGISTRY: Record<string, { displayName: string; tier: number; baseReliability: number; unit?: string }> = {
  overall_width_mm:        { displayName: 'Overall Width',              tier: 1, baseReliability: 0.90 },
  overall_height_mm:       { displayName: 'Overall Height',             tier: 2, baseReliability: 0.85 },
  wheelbase_mm:            { displayName: 'Wheelbase',                  tier: 1, baseReliability: 0.95 },
  front_track_mm:          { displayName: 'Front Track Width',          tier: 1, baseReliability: 0.90 },
  rear_track_mm:           { displayName: 'Rear Track Width',           tier: 2, baseReliability: 0.88 },
  front_bumper_height_mm:  { displayName: 'Front Bumper Height',        tier: 1, baseReliability: 0.85 },
  bumper_width_mm:         { displayName: 'Front Bumper Width',         tier: 1, baseReliability: 0.88 },
  headlamp_spacing_mm:     { displayName: 'Headlamp Centre Spacing',    tier: 2, baseReliability: 0.75 },
  grille_width_mm:         { displayName: 'Grille Width',               tier: 2, baseReliability: 0.72 },
  bonnet_width_mm:         { displayName: 'Bonnet Width',               tier: 2, baseReliability: 0.80 },
  windscreen_width_mm:     { displayName: 'Windscreen Width',           tier: 2, baseReliability: 0.78 },
  wheel_diameter_mm:       { displayName: 'Wheel/Tyre Diameter (OEM)',  tier: 1, baseReliability: 0.95 },
  wheel_diameter_alt_mm:   { displayName: 'Wheel/Tyre Diameter (Alt)',  tier: 1, baseReliability: 0.93 },
  licence_plate_width_mm:  { displayName: 'Licence Plate Width',        tier: 1, baseReliability: 0.85 },
  licence_plate_height_mm: { displayName: 'Licence Plate Height',       tier: 1, baseReliability: 0.85 },
  vehicle_mass_kg:         { displayName: 'Vehicle Kerb Mass',          tier: 2, baseReliability: 0.90, unit: 'kg' },
};

// ── Main ingestion ────────────────────────────────────────────────────────────
async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  const connection = await mysql.createConnection(dbUrl);
  const db = drizzle(connection);

  // 1. Upsert measurement_types registry
  console.log('Upserting measurement_types registry...');
  for (const [code, meta] of Object.entries(MEASUREMENT_TYPE_REGISTRY)) {
    await connection.execute(
      `INSERT INTO measurement_types (code, display_name, unit, tier, base_reliability)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), tier=VALUES(tier), base_reliability=VALUES(base_reliability)`,
      [code, meta.displayName, meta.unit ?? 'mm', meta.tier, meta.baseReliability]
    );
  }
  console.log(`  ✓ ${Object.keys(MEASUREMENT_TYPE_REGISTRY).length} measurement types registered`);

  // 2. Walk seed directories
  const seedRoot = __dirname;
  const seedFiles: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.json')) seedFiles.push(full);
    }
  }
  walk(seedRoot);
  console.log(`\nFound ${seedFiles.length} seed file(s)`);

  for (const filePath of seedFiles) {
    const seed: SeedFile = JSON.parse(readFileSync(filePath, 'utf-8'));
    const m = seed.model;
    console.log(`\nIngesting: ${m.manufacturer} ${m.model} ${m.variant ?? ''} (${m.yearFrom}–${m.yearTo ?? 'present'})`);

    // 3. Upsert vehicle_models
    const [existing] = await connection.execute<any[]>(
      `SELECT id FROM vehicle_models WHERE manufacturer=? AND model=? AND year_from=? AND market_region=?`,
      [m.manufacturer, m.model, m.yearFrom, m.marketRegion ?? null]
    );
    let vehicleModelId: number;
    if (existing.length > 0) {
      vehicleModelId = existing[0].id;
      console.log(`  ↻ Vehicle model already exists (id=${vehicleModelId}), updating...`);
      await connection.execute(
        `UPDATE vehicle_models SET variant=?, generation=?, year_to=?, body_type=?, market_region=? WHERE id=?`,
        [m.variant ?? null, m.generation ?? null, m.yearTo ?? null, m.bodyType ?? null, m.marketRegion ?? null, vehicleModelId]
      );
    } else {
      const [result] = await connection.execute<any>(
        `INSERT INTO vehicle_models (manufacturer, model, variant, generation, year_from, year_to, body_type, market_region)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [m.manufacturer, m.model, m.variant ?? null, m.generation ?? null, m.yearFrom, m.yearTo ?? null, m.bodyType ?? null, m.marketRegion ?? null]
      );
      vehicleModelId = result.insertId;
      console.log(`  ✓ Vehicle model inserted (id=${vehicleModelId})`);
    }

    // 4. Upsert measurements
    let measCount = 0;
    for (const meas of seed.measurements) {
      const [existingMeas] = await connection.execute<any[]>(
        `SELECT id FROM vehicle_geometry_measurements WHERE vehicle_model_id=? AND measurement_type=?`,
        [vehicleModelId, meas.type]
      );
      if (existingMeas.length > 0) {
        await connection.execute(
          `UPDATE vehicle_geometry_measurements SET value_mm=?, unit=?, confidence=?, source_type=?, source_reference=? WHERE id=?`,
          [meas.valueMm, meas.unit ?? 'mm', meas.confidence, meas.sourceType, meas.sourceReference, existingMeas[0].id]
        );
      } else {
        await connection.execute(
          `INSERT INTO vehicle_geometry_measurements (vehicle_model_id, measurement_type, value_mm, unit, confidence, source_type, source_reference)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [vehicleModelId, meas.type, meas.valueMm, meas.unit ?? 'mm', meas.confidence, meas.sourceType, meas.sourceReference]
        );
      }
      measCount++;
    }
    console.log(`  ✓ ${measCount} measurements upserted`);

    // 5. Upsert landmarks
    let lmCount = 0;
    for (const lm of seed.landmarks) {
      const [existingLm] = await connection.execute<any[]>(
        `SELECT id FROM vehicle_landmarks WHERE vehicle_model_id=? AND landmark_type=?`,
        [vehicleModelId, lm.type]
      );
      if (existingLm.length > 0) {
        await connection.execute(
          `UPDATE vehicle_landmarks SET x_mm=?, y_mm=?, z_mm=?, confidence=?, source_type=? WHERE id=?`,
          [lm.xMm ?? null, lm.yMm ?? null, lm.zMm ?? null, lm.confidence, lm.sourceType, existingLm[0].id]
        );
      } else {
        await connection.execute(
          `INSERT INTO vehicle_landmarks (vehicle_model_id, landmark_type, x_mm, y_mm, z_mm, confidence, source_type)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [vehicleModelId, lm.type, lm.xMm ?? null, lm.yMm ?? null, lm.zMm ?? null, lm.confidence, lm.sourceType]
        );
      }
      lmCount++;
    }
    console.log(`  ✓ ${lmCount} landmarks upserted`);

    // 6. Update completeness score
    const totalExpected = 16; // measurements + landmarks expected for a complete profile
    const completeness = Math.min(1.0, (measCount + lmCount) / totalExpected);
    await connection.execute(
      `UPDATE vehicle_models SET completeness_score=? WHERE id=?`,
      [completeness.toFixed(3), vehicleModelId]
    );
    console.log(`  ✓ Completeness score: ${(completeness * 100).toFixed(1)}%`);
  }

  await connection.end();
  console.log('\n✓ VGE seed ingestion complete');
}

main().catch(err => { console.error('Seed ingestion failed:', err); process.exit(1); });
