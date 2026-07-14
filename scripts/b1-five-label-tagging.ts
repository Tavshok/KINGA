/**
 * Phase B-1: Crush-depth input quality tagging
 * Uses enriched_photos_json which stores per-photo forensics output:
 *   { url, impactZone, imageQuality, severity, componentCount, detectedComponents, confidenceScore }
 *
 * Five-label taxonomy:
 * 1. SUITABLE          — impactZone matches collision direction, imageQuality=good/fair, componentCount>0
 * 2. MARGINAL          — impactZone matches but imageQuality=poor, or componentCount=0
 * 3. WRONG_ZONE        — impactZone present but does NOT match collision direction
 * 4. QUOTE_WITH_EMBEDDED_PHOTO — photo_classification_json says quotation_scan but enriched_photos has components
 * 5. NOT_A_DAMAGE_PHOTO — componentCount=0 AND imageQuality=poor, or no impactZone
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env') });

type ImageLabel = 'SUITABLE' | 'MARGINAL' | 'WRONG_ZONE' | 'QUOTE_WITH_EMBEDDED_PHOTO' | 'NOT_A_DAMAGE_PHOTO';

function zoneMatchesDirection(impactZone: string, collisionDirection: string): boolean {
  const z = (impactZone ?? '').toLowerCase();
  const d = (collisionDirection ?? '').toLowerCase();
  if (!z || !d || d === 'unknown' || d === 'other') return true;
  if (d.includes('front')) return z.includes('front') || z.includes('bonnet') || z.includes('hood') || z.includes('engine');
  if (d.includes('rear')) return z.includes('rear') || z.includes('back') || z.includes('boot') || z.includes('trunk');
  if (d.includes('side') || d.includes('lateral') || d.includes('left') || d.includes('right')) {
    return z.includes('side') || z.includes('door') || z.includes('left') || z.includes('right') || z.includes('pillar');
  }
  if (d.includes('roll')) return z.includes('roof') || z.includes('roll') || z.includes('top');
  return true;
}

function labelPhoto(
  photo: any,
  collisionDirection: string,
  photoClassMap: Map<string, string>  // url -> classification from photo_classification_json
): { label: ImageLabel; reason: string; fedCrushDepth: boolean } {
  const impactZone = photo.impactZone ?? '';
  const quality = (photo.imageQuality ?? 'unknown').toLowerCase();
  const componentCount = photo.componentCount ?? 0;
  const confidence = photo.confidenceScore ?? 0;
  const url = photo.url ?? '';
  
  // Check photo_classification_json for this URL
  const classLabel = photoClassMap.get(url) ?? '';
  
  // QUOTE_WITH_EMBEDDED_PHOTO: classified as quotation but has components detected
  if (classLabel && (classLabel.includes('quotation') || classLabel.includes('quote') || classLabel.includes('document')) && componentCount > 0) {
    return { label: 'QUOTE_WITH_EMBEDDED_PHOTO', reason: `Classified as '${classLabel}' but has ${componentCount} component(s) detected — incidental vehicle image in document`, fedCrushDepth: false };
  }
  
  // NOT_A_DAMAGE_PHOTO: no components, poor quality, no impact zone
  if (componentCount === 0 && !impactZone) {
    return { label: 'NOT_A_DAMAGE_PHOTO', reason: `No components detected, no impact zone — not a usable damage photo`, fedCrushDepth: false };
  }
  
  // WRONG_ZONE: has impact zone but doesn't match collision direction
  if (impactZone && !zoneMatchesDirection(impactZone, collisionDirection)) {
    return { label: 'WRONG_ZONE', reason: `Impact zone '${impactZone}' does not match collision direction '${collisionDirection}'`, fedCrushDepth: false };
  }
  
  // SUITABLE: good quality, zone matches, components detected
  if ((quality === 'good' || quality === 'fair') && componentCount > 0 && confidence >= 60) {
    return { label: 'SUITABLE', reason: `imageQuality=${quality}, ${componentCount} component(s), confidence=${confidence}%, zone matches`, fedCrushDepth: true };
  }
  
  // MARGINAL: zone matches but poor quality or low confidence
  if (impactZone || componentCount > 0) {
    return { label: 'MARGINAL', reason: `imageQuality=${quality}, componentCount=${componentCount}, confidence=${confidence}% — measurement reliability uncertain`, fedCrushDepth: quality !== 'poor' };
  }
  
  return { label: 'NOT_A_DAMAGE_PHOTO', reason: `No usable damage data (quality=${quality}, components=${componentCount})`, fedCrushDepth: false };
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  const [rows] = await conn.execute(`
    SELECT 
      a.id as assessment_id,
      a.claim_id,
      a.physics_analysis,
      a.enriched_photos_json,
      a.photo_classification_json,
      c.claim_number,
      c.incident_type
    FROM ai_assessments a
    JOIN claims c ON c.id = a.claim_id
    WHERE a.physics_analysis IS NOT NULL
      AND a.physics_analysis != 'null'
      AND a.enriched_photos_json IS NOT NULL
    ORDER BY a.id DESC
    LIMIT 25
  `) as any[];

  console.log(`Processing ${rows.length} assessments for B-1 tagging...`);

  const results: any[] = [];

  for (const row of rows) {
    try {
      const physics = JSON.parse(row.physics_analysis);
      const enrichedPhotos: any[] = JSON.parse(row.enriched_photos_json);
      
      if (!Array.isArray(enrichedPhotos) || !enrichedPhotos.length) continue;
      
      // Build photo classification map from photo_classification_json
      const photoClassMap = new Map<string, string>();
      if (row.photo_classification_json) {
        try {
          const pcRaw = JSON.parse(row.photo_classification_json);
          const allPc = Array.isArray(pcRaw) ? pcRaw :
            [...(pcRaw.damagePhotos ?? []), ...(pcRaw.quotationImages ?? []), ...(pcRaw.vehicleOverviews ?? []), ...(pcRaw.allClassified ?? [])];
          for (const p of allPc) {
            if (p?.url && p?.category) photoClassMap.set(p.url, p.category);
          }
        } catch {}
      }
      
      const collisionDirection = physics.impactVector?.direction ?? physics.collisionDirection ?? physics.impactDirection ?? 'unknown';
      
      const taggedImages = enrichedPhotos.map(photo => {
        const { label, reason, fedCrushDepth } = labelPhoto(photo, collisionDirection, photoClassMap);
        return {
          url: photo.url,
          impactZone: photo.impactZone,
          imageQuality: photo.imageQuality,
          componentCount: photo.componentCount,
          severity: photo.severity,
          confidenceScore: photo.confidenceScore,
          label,
          reason,
          fedCrushDepth,
          collisionDirection,
        };
      });
      
      const summary = {
        suitable: taggedImages.filter(t => t.label === 'SUITABLE').length,
        marginal: taggedImages.filter(t => t.label === 'MARGINAL').length,
        wrongZone: taggedImages.filter(t => t.label === 'WRONG_ZONE').length,
        quoteWithEmbeddedPhoto: taggedImages.filter(t => t.label === 'QUOTE_WITH_EMBEDDED_PHOTO').length,
        notADamagePhoto: taggedImages.filter(t => t.label === 'NOT_A_DAMAGE_PHOTO').length,
        fedCrushDepth: taggedImages.filter(t => t.fedCrushDepth).length,
        suitableRate: 0, wrongZoneRate: 0, quoteEmbeddedRate: 0,
      };
      const total = taggedImages.length || 1;
      summary.suitableRate = Math.round(summary.suitable / total * 100);
      summary.wrongZoneRate = Math.round(summary.wrongZone / total * 100);
      summary.quoteEmbeddedRate = Math.round(summary.quoteWithEmbeddedPhoto / total * 100);
      
      results.push({
        claimId: row.claim_id,
        claimNumber: row.claim_number,
        collisionDirection,
        assessmentId: row.assessment_id,
        totalImages: taggedImages.length,
        taggedImages,
        summary,
      });
      
    } catch (err: any) {
      console.error(`Error processing assessment ${row.assessment_id}:`, err.message);
    }
  }

  await conn.end();

  const totalClaims = results.length;
  const totalImages = results.reduce((s, r) => s + r.totalImages, 0);
  const totalSuitable = results.reduce((s, r) => s + r.summary.suitable, 0);
  const totalMarginal = results.reduce((s, r) => s + r.summary.marginal, 0);
  const totalWrongZone = results.reduce((s, r) => s + r.summary.wrongZone, 0);
  const totalQuoteEmbedded = results.reduce((s, r) => s + r.summary.quoteWithEmbeddedPhoto, 0);
  const totalNotDamage = results.reduce((s, r) => s + r.summary.notADamagePhoto, 0);
  const totalFed = results.reduce((s, r) => s + r.summary.fedCrushDepth, 0);
  const suitableAmongFed = results.reduce((s, r) => s + r.taggedImages.filter((t: any) => t.fedCrushDepth && t.label === 'SUITABLE').length, 0);
  const marginalAmongFed = results.reduce((s, r) => s + r.taggedImages.filter((t: any) => t.fedCrushDepth && t.label === 'MARGINAL').length, 0);

  const aggregate = {
    totalClaims, totalImages,
    labelDistribution: {
      SUITABLE: { count: totalSuitable, pct: totalImages ? Math.round(totalSuitable / totalImages * 100) : 0 },
      MARGINAL: { count: totalMarginal, pct: totalImages ? Math.round(totalMarginal / totalImages * 100) : 0 },
      WRONG_ZONE: { count: totalWrongZone, pct: totalImages ? Math.round(totalWrongZone / totalImages * 100) : 0 },
      QUOTE_WITH_EMBEDDED_PHOTO: { count: totalQuoteEmbedded, pct: totalImages ? Math.round(totalQuoteEmbedded / totalImages * 100) : 0 },
      NOT_A_DAMAGE_PHOTO: { count: totalNotDamage, pct: totalImages ? Math.round(totalNotDamage / totalImages * 100) : 0 },
    },
    crushDepthInputQuality: {
      imagesFedCrushDepth: totalFed,
      suitableAmongFed,
      marginalAmongFed,
      pctSuitableAmongFed: totalFed ? Math.round(suitableAmongFed / totalFed * 100) : 0,
    },
    claimsWithZeroSuitable: results.filter(r => r.summary.suitable === 0).length,
    claimsWithWrongZone: results.filter(r => r.summary.wrongZone > 0).length,
    claimsWithQuoteEmbedded: results.filter(r => r.summary.quoteWithEmbeddedPhoto > 0).length,
  };

  console.log('\n========== PHASE B-1 TAGGING RESULTS ==========\n');
  console.log(`Claims tagged: ${totalClaims}`);
  console.log(`Total images tagged: ${totalImages}`);
  console.log('\nLabel distribution:');
  for (const [label, stats] of Object.entries(aggregate.labelDistribution)) {
    console.log(`  ${label.padEnd(32)} ${String(stats.count).padStart(4)} images  (${stats.pct}%)`);
  }
  console.log('\nCrush depth input quality:');
  console.log(`  Images eligible to feed crush depth:  ${aggregate.crushDepthInputQuality.imagesFedCrushDepth}`);
  console.log(`  SUITABLE among those:                 ${aggregate.crushDepthInputQuality.suitableAmongFed} (${aggregate.crushDepthInputQuality.pctSuitableAmongFed}%)`);
  console.log(`  MARGINAL among those:                 ${aggregate.crushDepthInputQuality.marginalAmongFed}`);
  console.log('\nClaim-level failure rates:');
  console.log(`  Claims with 0 SUITABLE images:  ${aggregate.claimsWithZeroSuitable}/${totalClaims} (${totalClaims ? Math.round(aggregate.claimsWithZeroSuitable/totalClaims*100) : 0}%)`);
  console.log(`  Claims with WRONG_ZONE images:  ${aggregate.claimsWithWrongZone}/${totalClaims} (${totalClaims ? Math.round(aggregate.claimsWithWrongZone/totalClaims*100) : 0}%)`);
  console.log(`  Claims with QUOTE_EMBEDDED:     ${aggregate.claimsWithQuoteEmbedded}/${totalClaims} (${totalClaims ? Math.round(aggregate.claimsWithQuoteEmbedded/totalClaims*100) : 0}%)`);

  fs.writeFileSync('/tmp/b1-five-label-results.json', JSON.stringify({ aggregate, perClaim: results }, null, 2));
  console.log('\nFull results saved to /tmp/b1-five-label-results.json');

  console.log('\nPer-claim summary:');
  console.log('ClaimNumber                    | Dir     | Imgs | SUIT | MARG | ZONE | QUOT | NODMG');
  console.log('-------------------------------|---------|------|------|------|------|------|------');
  for (const r of results) {
    const dir = (r.collisionDirection ?? 'unk').substring(0, 7).padEnd(7);
    console.log(
      `${r.claimNumber.substring(0, 30).padEnd(30)} | ${dir} | ${String(r.totalImages).padStart(4)} | ` +
      `${String(r.summary.suitable).padStart(4)} | ${String(r.summary.marginal).padStart(4)} | ` +
      `${String(r.summary.wrongZone).padStart(4)} | ${String(r.summary.quoteWithEmbeddedPhoto).padStart(4)} | ` +
      `${String(r.summary.notADamagePhoto).padStart(5)}`
    );
  }
}

main().catch(console.error);
