// Plain ESM script — no TypeScript compilation, minimal memory footprint
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

// Load env manually to avoid dotenv overhead
const envPath = '/home/ubuntu/kinga-replit/.env';
let dbUrl;
try {
  const envContent = readFileSync(envPath, 'utf8');
  const match = envContent.match(/DATABASE_URL=(.+)/);
  dbUrl = match ? match[1].trim() : process.env.DATABASE_URL;
} catch {
  dbUrl = process.env.DATABASE_URL;
}

const conn = await mysql.createConnection(dbUrl);

// Get the latest VOLTRON assessment
const [rows] = await conn.execute(
  'SELECT id, enriched_photos_json, physics_analysis FROM ai_assessments WHERE claim_id = 8880001 ORDER BY id DESC LIMIT 1'
);

if (!rows[0]) { console.log('No assessment found'); await conn.end(); process.exit(0); }

const photos = JSON.parse(rows[0].enriched_photos_json || '[]');
const physics = JSON.parse(rows[0].physics_analysis || '{}');
const dir = (physics.impactVector?.direction || physics.collisionDirection || 'frontal').toLowerCase();

console.log('Assessment ID:', rows[0].id, '| Collision direction:', dir);
console.log('Total enriched photos:', photos.length);
console.log('---');

// Zone-matching logic (mirrors Fix A)
const FRONTAL_ZONES = ['front', 'bonnet', 'hood', 'engine', 'grille', 'bumper', 'radiator', 'headlight', 'front-center', 'front-left', 'front-right', 'front left', 'front right'];
const REAR_ZONES = ['rear', 'boot', 'trunk', 'tailgate', 'back', 'rear-left', 'rear-right'];
const SIDE_DRIVER_ZONES = ['side_driver', 'driver', 'left side', 'driver side'];
const SIDE_PASSENGER_ZONES = ['side_passenger', 'passenger', 'right side', 'passenger side'];

function isZoneMatch(zone, direction) {
  const z = (zone || '').toLowerCase();
  if (direction === 'frontal') return FRONTAL_ZONES.some(f => z.includes(f));
  if (direction === 'rear') return REAR_ZONES.some(f => z.includes(f));
  if (direction === 'side_driver') return SIDE_DRIVER_ZONES.some(f => z.includes(f));
  if (direction === 'side_passenger') return SIDE_PASSENGER_ZONES.some(f => z.includes(f));
  return false;
}

const wrongZone = [];
const suitable = [];

photos.forEach((p, i) => {
  if (!p || !p.url) return;
  const zone = (p.impactZone || '').toLowerCase();
  const quality = (p.imageQuality || '').toLowerCase();
  const matched = isZoneMatch(zone, dir);
  const isGoodQuality = quality === 'good' || quality === 'fair';
  
  if (!matched && zone && zone !== 'unknown') {
    wrongZone.push({ idx: i, zone: p.impactZone, quality, components: p.componentCount, url: p.url });
  } else if (matched && isGoodQuality) {
    suitable.push({ idx: i, zone: p.impactZone, quality, components: p.componentCount, url: p.url });
  }
});

console.log('WRONG_ZONE images:', wrongZone.length);
wrongZone.forEach(p => {
  console.log(`  [${p.idx}] zone="${p.zone}" quality="${p.quality}" components=${p.components}`);
  console.log(`       URL: ${p.url}`);
});

console.log('\nSUITABLE images:', suitable.length);
suitable.forEach(p => {
  console.log(`  [${p.idx}] zone="${p.zone}" quality="${p.quality}" components=${p.components}`);
  console.log(`       URL: ${p.url}`);
});

await conn.end();
