import { getDb } from './db';
import { claims, aiAssessments } from '../drizzle/schema';
import { like, desc, or } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.error('DB not available'); process.exit(1); }

  // Search for Isuzu MU-X claims
  const results = await db.select({
    id: claims.id,
    claimNumber: claims.claimNumber,
    vehicleMake: claims.vehicleMake,
    vehicleModel: claims.vehicleModel,
    vehicleYear: claims.vehicleYear,
    status: claims.status,
    tenantId: claims.tenantId,
  }).from(claims)
    .where(or(
      like(claims.vehicleMake, '%Isuzu%'),
      like(claims.vehicleModel, '%MU-X%'),
      like(claims.vehicleModel, '%MUX%'),
    ))
    .orderBy(desc(claims.id))
    .limit(10);

  console.log('Isuzu MU-X claims:', JSON.stringify(results, null, 2));

  // Also get the 5 most recent claims
  const recent = await db.select({
    id: claims.id,
    claimNumber: claims.claimNumber,
    vehicleMake: claims.vehicleMake,
    vehicleModel: claims.vehicleModel,
    status: claims.status,
  }).from(claims).orderBy(desc(claims.id)).limit(5);

  console.log('\n5 most recent claims:', JSON.stringify(recent, null, 2));

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
