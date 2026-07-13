import mysql from 'mysql2/promise';
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    `SELECT
       id,
       physics_analysis IS NOT NULL as has_physics,
       JSON_EXTRACT(physics_analysis, '$.speedInferenceEnsemble.consensusSpeedKmh') as consensus_speed,
       JSON_EXTRACT(physics_analysis, '$.speedInferenceEnsemble.visionSourceReliability') as vision_reliability,
       JSON_EXTRACT(physics_analysis, '$.speedInferenceEnsemble.methods') IS NOT NULL as has_methods,
       JSON_EXTRACT(physics_analysis, '$.speedInferenceEnsemble.methods.M1_campbell.speedKmh') as campbell_speed,
       JSON_EXTRACT(physics_analysis, '$.speedInferenceEnsemble.methods.M5_vision_deformation.speedKmh') as vision_speed,
       JSON_EXTRACT(physics_analysis, '$.speedInferenceEnsemble.methods.M4_deployment_threshold.speedKmh') as deployment_speed,
       JSON_EXTRACT(physics_analysis, '$.speedInferenceEnsemble.crushDepthPlausibilityCheck') IS NOT NULL as has_plausibility_check
     FROM ai_assessments WHERE id IN (12930001, 13290001) ORDER BY id`
  );
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
