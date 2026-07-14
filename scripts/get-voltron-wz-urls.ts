import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    'SELECT id, enriched_photos_json, physics_analysis FROM ai_assessments WHERE claim_id = 8880001 ORDER BY id DESC LIMIT 1'
  ) as any[];
  
  if (!rows[0]) { console.log('No assessment found'); await conn.end(); return; }
  
  const photos = JSON.parse(rows[0].enriched_photos_json || '[]');
  const physics = JSON.parse(rows[0].physics_analysis || '{}');
  const dir = (physics.impactVector?.direction || physics.collisionDirection || 'unknown').toLowerCase();
  
  console.log('Assessment:', rows[0].id, '| Direction:', dir);
  console.log('Total photos:', photos.length);
  
  photos.forEach((p: any, i: number) => {
    if (!p || !p.url) return;
    const zone = (p.impactZone || '').toLowerCase();
    const quality = (p.imageQuality || '').toLowerCase();
    const isFrontal = zone.includes('front') || zone.includes('bonnet') || zone.includes('hood') || zone.includes('engine') || zone.includes('grille');
    const isWrongZone = zone && dir !== 'unknown' && !isFrontal;
    const label = isWrongZone ? 'WRONG_ZONE' : (quality === 'good' || quality === 'fair' ? 'SUITABLE' : 'MARGINAL');
    console.log(i, label, p.impactZone, quality, 'comps:', p.componentCount, 'conf:', p.confidenceScore);
    console.log('  URL:', p.url);
  });
  
  await conn.end();
}
main().catch(console.error);
