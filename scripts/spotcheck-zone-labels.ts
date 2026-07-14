/**
 * Pull 10 claims with diverse zone labels for human spot-check.
 * Selects: 3 WRONG_ZONE claims, 3 SUITABLE claims, 2 MARGINAL claims, 2 FALLBACK_ONLY claims.
 * Returns the image URLs and LLM zone labels for each photo.
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env') });

function zoneMatchesDirection(impactZone: string, collisionDirection: string): boolean {
  const z = (impactZone ?? '').toLowerCase();
  const d = (collisionDirection ?? '').toLowerCase();
  if (!z || !d || d === 'unknown' || d === '') return true;
  if (d.includes('front')) return z.includes('front') || z.includes('bonnet') || z.includes('hood') || z.includes('engine') || z.includes('grille') || z.includes('radiator') || z.includes('chassis');
  if (d.includes('rear')) return z.includes('rear') || z.includes('back') || z.includes('boot') || z.includes('trunk') || z.includes('tailgate');
  if (d.includes('side') || d.includes('lateral') || d.includes('left') || d.includes('right') || d.includes('passenger') || d.includes('driver')) {
    return z.includes('side') || z.includes('door') || z.includes('left') || z.includes('right') || z.includes('pillar') || z.includes('sill');
  }
  if (d.includes('roll') || d.includes('roof')) return z.includes('roof') || z.includes('roll') || z.includes('top') || z.includes('pillar');
  return true;
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  const [rows] = await conn.execute(`
    SELECT 
      a.id as assessment_id,
      a.claim_id,
      a.physics_analysis,
      a.enriched_photos_json,
      c.claim_number,
      c.incident_type
    FROM ai_assessments a
    JOIN claims c ON c.id = a.claim_id
    WHERE a.physics_analysis IS NOT NULL
      AND a.enriched_photos_json IS NOT NULL
    ORDER BY a.id DESC
    LIMIT 100
  `) as any[];

  const wrongZoneClaims: any[] = [];
  const suitableClaims: any[] = [];
  const marginalClaims: any[] = [];
  const fallbackClaims: any[] = [];

  for (const row of rows) {
    try {
      const physics = JSON.parse(row.physics_analysis);
      const enrichedPhotos: any[] = JSON.parse(row.enriched_photos_json);
      if (!Array.isArray(enrichedPhotos) || !enrichedPhotos.length) continue;

      const collisionDirection = (physics.impactVector?.direction ?? physics.collisionDirection ?? 'unknown').toLowerCase();

      let suitable = 0, marginal = 0, wrongZone = 0;
      const wrongZonePhotos: any[] = [];
      const suitablePhotos: any[] = [];

      for (const photo of enrichedPhotos) {
        if (!photo || !photo.url) continue;
        const zone = photo.impactZone ?? '';
        const quality = (photo.imageQuality ?? '').toLowerCase();
        const componentCount = photo.componentCount ?? 0;
        const confidence = photo.confidenceScore ?? 0;

        if (zone && collisionDirection !== 'unknown' && !zoneMatchesDirection(zone, collisionDirection)) {
          wrongZone++;
          wrongZonePhotos.push({ url: photo.url, impactZone: zone, imageQuality: quality, componentCount, confidence, severity: photo.severity });
        } else if ((quality === 'good' || quality === 'fair') && componentCount > 0 && confidence >= 60) {
          suitable++;
          suitablePhotos.push({ url: photo.url, impactZone: zone, imageQuality: quality, componentCount, confidence, severity: photo.severity });
        } else if (componentCount > 0 || zone) {
          marginal++;
        }
      }

      const claimData = {
        claimNumber: row.claim_number,
        assessmentId: row.assessment_id,
        collisionDirection,
        incidentType: row.incident_type,
        totalPhotos: enrichedPhotos.length,
        suitable, marginal, wrongZone,
        wrongZonePhotos: wrongZonePhotos.slice(0, 3), // max 3 per claim
        suitablePhotos: suitablePhotos.slice(0, 2),

      };

      if (wrongZone > 0 && wrongZoneClaims.length < 4) wrongZoneClaims.push(claimData);
      else if (suitable > 0 && suitableClaims.length < 3) suitableClaims.push(claimData);
      else if (marginal > 0 && suitable === 0 && marginalClaims.length < 2) marginalClaims.push(claimData);
      else if (suitable === 0 && marginal === 0 && wrongZone === 0 && fallbackClaims.length < 2) fallbackClaims.push(claimData);

    } catch {}
  }

  await conn.end();

  const selected = [
    ...wrongZoneClaims.slice(0, 4),
    ...suitableClaims.slice(0, 3),
    ...marginalClaims.slice(0, 2),
    ...fallbackClaims.slice(0, 1),
  ].slice(0, 10);

  console.log(`Selected ${selected.length} claims for spot-check\n`);
  
  const output: any = { claims: [] };
  
  for (const c of selected) {
    console.log(`\n=== ${c.claimNumber} | Dir: ${c.collisionDirection} | ${c.incidentType} ===`);
    console.log(`  Photos: ${c.totalPhotos} | SUITABLE: ${c.suitable} | MARGINAL: ${c.marginal} | WRONG_ZONE: ${c.wrongZone}`);
    
    if (c.wrongZonePhotos.length > 0) {
      console.log(`  WRONG_ZONE photos (LLM said these are in wrong zone):`);
      for (const p of c.wrongZonePhotos) {
        console.log(`    URL: ${p.url}`);
        console.log(`    LLM zone: ${p.impactZone} | quality: ${p.imageQuality} | components: ${p.componentCount} | confidence: ${p.confidence}% | severity: ${p.severity}`);
      }
    }
    if (c.suitablePhotos.length > 0) {
      console.log(`  SUITABLE photos (LLM said these are in correct zone):`);
      for (const p of c.suitablePhotos) {
        console.log(`    URL: ${p.url}`);
        console.log(`    LLM zone: ${p.impactZone} | quality: ${p.imageQuality} | components: ${p.componentCount} | confidence: ${p.confidence}%`);
      }
    }
    
    output.claims.push(c);
  }

  fs.writeFileSync('/tmp/spotcheck-data.json', JSON.stringify(output, null, 2));
  console.log('\nFull data saved to /tmp/spotcheck-data.json');
}

main().catch(console.error);
