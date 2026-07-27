import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. All measurement types in the DB
const [allTypes] = await conn.execute(
  `SELECT DISTINCT measurement_type, COUNT(*) as cnt FROM vehicle_geometry_measurements GROUP BY measurement_type ORDER BY cnt DESC`
);
console.log('\n=== All measurement_type values in vehicle_geometry_measurements ===');
console.log(JSON.stringify(allTypes, null, 2));

// 2. Isuzu MU-X profile
const [isuzuModels] = await conn.execute(
  `SELECT id, manufacturer, model, variant, year_from, year_to FROM vehicle_models WHERE manufacturer LIKE '%ISUZU%' OR model LIKE '%MUX%' OR model LIKE '%MU%'`
);
console.log('\n=== Isuzu vehicle models ===');
console.log(JSON.stringify(isuzuModels, null, 2));

if (isuzuModels.length > 0) {
  const ids = isuzuModels.map(r => r.id);
  const [measRows] = await conn.execute(
    `SELECT vm.manufacturer, vm.model, vm.variant, vgm.measurement_type, vgm.value_mm FROM vehicle_models vm JOIN vehicle_geometry_measurements vgm ON vm.id = vgm.vehicle_model_id WHERE vm.id IN (${ids.join(',')}) ORDER BY vm.id, vgm.measurement_type`
  );
  console.log('\n=== Isuzu measurements ===');
  console.log(JSON.stringify(measRows, null, 2));
}

// 3. Sample of all vehicles with measurement counts
const [sampleVehicles] = await conn.execute(
  `SELECT vm.manufacturer, vm.model, vm.variant, COUNT(vgm.id) as measurement_count FROM vehicle_models vm LEFT JOIN vehicle_geometry_measurements vgm ON vm.id = vgm.vehicle_model_id GROUP BY vm.id ORDER BY measurement_count DESC LIMIT 20`
);
console.log('\n=== Top 20 vehicles by measurement count ===');
console.log(JSON.stringify(sampleVehicles, null, 2));

await conn.end();
