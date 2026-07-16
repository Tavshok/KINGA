import 'dotenv/config';
import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL as string);

  // Check what vehicle the Voltron claim has
  const [claimRows] = await conn.execute<any[]>(
    'SELECT id, claim_reference, vehicle_make, vehicle_model, vehicle_year FROM claims WHERE id = 8880001'
  );
  console.log('=== Voltron Claim Vehicle ===');
  console.log(JSON.stringify(claimRows[0], null, 2));

  // Check if Isuzu MUX profile matches
  const [muxRows] = await conn.execute<any[]>(
    `SELECT id, manufacturer, model, variant, year_from, year_to, completeness_score
     FROM vehicle_models
     WHERE LOWER(manufacturer) LIKE LOWER('%isuzu%') AND LOWER(model) LIKE LOWER('%mu%')
     ORDER BY completeness_score DESC LIMIT 5`
  );
  console.log('\n=== Isuzu MU-X Profile Matches ===');
  console.log(JSON.stringify(muxRows, null, 2));

  // Simulate the exact query used by getVehicleProfile
  const make = claimRows[0]?.vehicle_make;
  const model = claimRows[0]?.vehicle_model;
  const year = claimRows[0]?.vehicle_year ?? new Date().getFullYear();
  console.log(`\n=== Simulating getVehicleProfile("${make}", "${model}", ${year}) ===`);
  const [matchRows] = await conn.execute<any[]>(
    `SELECT id, manufacturer, model, variant, year_from, year_to
     FROM vehicle_models
     WHERE LOWER(manufacturer) LIKE LOWER(?) AND LOWER(model) LIKE LOWER(?)
       AND year_from <= ? AND (year_to IS NULL OR year_to >= ?)
     ORDER BY completeness_score DESC
     LIMIT 1`,
    [`%${make}%`, `%${model}%`, year, year]
  );
  console.log('Match result:', JSON.stringify(matchRows, null, 2));

  // Get measurements for matched profile
  if (matchRows.length > 0) {
    const [measRows] = await conn.execute<any[]>(
      `SELECT measurement_type, value_mm FROM vehicle_geometry_measurements WHERE vehicle_model_id = ?`,
      [matchRows[0].id]
    );
    console.log('\n=== Measurements for matched profile ===');
    const key_measurements = ['wheel_diameter_mm', 'wheel_diameter_alt_mm', 'licence_plate_width_mm', 'headlamp_spacing_mm', 'grille_width_mm', 'bumper_width_mm', 'overall_width_mm'];
    measRows.filter(r => key_measurements.includes(r.measurement_type)).forEach(r => {
      console.log(`  ${r.measurement_type}: ${r.value_mm} mm`);
    });
  }

  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
