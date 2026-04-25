import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get the stored physics analysis to see what damageAnalysis fields are present
const [[ai]] = await conn.execute(`
  SELECT physics_analysis FROM ai_assessments WHERE claim_id = 4620001 ORDER BY id DESC LIMIT 1
`);
const pa = JSON.parse(ai.physics_analysis || '{}');

console.log('=== PHYSICS ANALYSIS TOP-LEVEL KEYS ===');
console.log(Object.keys(pa));

console.log('\n=== speedInferenceEnsemble inputs (what was actually passed) ===');
const sie = pa.speedInferenceEnsemble;
if (sie) {
  console.log('methodsRan:', sie.methodsRan);
  console.log('consensusSpeedKmh:', sie.consensusSpeedKmh);
  sie.methods?.forEach(m => {
    console.log(`  ${m.method}: ran=${m.ran}, speed=${m.speedKmh}, basis=${m.basis}`);
  });
}

console.log('\n=== damagedComponents ===');
console.log(JSON.stringify(pa.damagedComponents, null, 2));

console.log('\n=== Key physics fields ===');
console.log('vehicleMassKg:', pa.vehicleMassKg);
console.log('vehicleBodyType:', pa.vehicleBodyType);
console.log('collisionDirection:', pa.collisionDirection);
console.log('maxCrushDepthM:', pa.maxCrushDepthM);
console.log('totalDamageAreaM2:', pa.totalDamageAreaM2);
console.log('structuralDamage:', pa.structuralDamage);
console.log('airbagDeployment:', pa.airbagDeployment);

await conn.end();
