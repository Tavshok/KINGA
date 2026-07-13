import mysql from 'mysql2/promise';
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute('DESCRIBE ai_assessments');
  for (const r of rows as any[]) console.log(r.Field, r.Type.slice(0, 20));
  await conn.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
