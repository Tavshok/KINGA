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
    console.log('CTO TOP KEYS:', Object.keys(cto));
    // Look for enrichedPhotos or damagedParts with crushDepthM
    const findCrush = (obj: any, path = ''): void => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach((item, i) => findCrush(item, `${path}[${i}]`));
        return;
      }
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'crushDepthM' && v != null) {
          console.log(`CRUSH DEPTH at ${path}.${k} = ${v}`);
        }
        if (typeof v === 'object') findCrush(v, `${path}.${k}`);
      }
    };
    findCrush(cto);
  } else {
    console.log('NO claim_truth_object_json for 13290001');
  }
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
