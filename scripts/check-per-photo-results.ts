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
    const perPhotoResults = cto?.damage?._provenance?.rawValue?.perPhotoResults;
    if (Array.isArray(perPhotoResults)) {
      console.log(`perPhotoResults total: ${perPhotoResults.length}`);
      // Show all results with their page numbers and classifications
      for (let i = 0; i < perPhotoResults.length; i++) {
        const r = perPhotoResults[i];
        const hasCrush = r.components?.some((c: any) => c.crushDepthM != null);
        const maxCrush = r.components?.reduce((max: number, c: any) => Math.max(max, c.crushDepthM ?? 0), 0);
        console.log(`  [${i}] page=${r.pageNumber ?? r.pageIndex ?? '?'} classification=${r.classification ?? r.imageType ?? '?'} inputSource=${r.inputSource ?? '?'} hasCrush=${hasCrush} maxCrush=${maxCrush?.toFixed(2)}m`);
        if (hasCrush) {
          for (const c of r.components ?? []) {
            if (c.crushDepthM != null) {
              console.log(`       component: ${c.name} crushDepthM=${c.crushDepthM} zone=${c.location}`);
            }
          }
        }
      }
    }
  }
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
