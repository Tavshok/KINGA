import mysql from 'mysql2/promise';
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    `SELECT claim_truth_object_json FROM ai_assessments WHERE id = 13290001`
  );
  const row = (rows as any[])[0];
  if (row?.claim_truth_object_json) {
    const cto = typeof row.claim_truth_object_json === 'string'
      ? JSON.parse(row.claim_truth_object_json)
      : row.claim_truth_object_json;
    const parts = cto?.damage?._provenance?.rawValue?.damagedParts;
    if (Array.isArray(parts)) {
      console.log(`damagedParts total: ${parts.length}`);
      // Show only parts with crushDepthM
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (p.crushDepthM != null) {
          console.log(`  [${i}] ${p.name}: crushDepthM=${p.crushDepthM} inputSource=${p.inputSource} location=${p.location}`);
        }
      }
    }
    // Also check what visionSourceReliability is in the CTO
    console.log('\nvisionSourceReliability in CTO physics:', cto?.physics?.speedInferenceEnsemble?.visionSourceReliability);
    console.log('visionSourceReliability in CTO damage:', cto?.damage?.visionSourceReliability);
  }
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
