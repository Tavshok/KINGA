import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true });

const conn = await createConnection(process.env.DATABASE_URL);

// Fetch VOLTRON-001 data with correct column names
const [rows] = await conn.execute(`
  SELECT 
    a.id,
    a.physics_analysis,
    a.fraud_indicators,
    a.fraud_score_breakdown_json,
    a.cost_intelligence_json,
    a.enriched_photos_json,
    c.incident_description,
    c.incident_location,
    c.incident_date,
    c.incident_time,
    c.damage_photos,
    c.metadata,
    c.third_party_name,
    c.third_party_vehicle,
    c.police_report_number,
    c.police_station
  FROM ai_assessments a
  JOIN claims c ON c.id = a.claim_id
  WHERE a.claim_id = 8880001
  ORDER BY a.id DESC LIMIT 1
`);
await conn.end();

const r = rows[0];
if (!r) { console.log('No data'); process.exit(1); }

const pa = JSON.parse(r.physics_analysis || '{}');
const cost = JSON.parse(r.cost_intelligence_json || '{}');
const fraud = JSON.parse(r.fraud_score_breakdown_json || '{}');
const enrichedPhotos = JSON.parse(r.enriched_photos_json || '[]');
const metadata = JSON.parse(r.metadata || '{}');

// ─── SIGNAL 1: REPAIR QUOTES AS DAMAGE ESTIMATOR ──────────────────────────
console.log('\n=== SIGNAL 1: REPAIR QUOTES AS DAMAGE ESTIMATOR ===');
const docQuote = cost.documented_quote;
if (docQuote) {
  const lineItems = docQuote.line_items || [];
  console.log('Documented quote total:', docQuote.total_usd, 'USD');
  console.log('Line items count:', lineItems.length);
  console.log('First 8 components:', lineItems.slice(0,8).map(li => li.component || li.description || li.item_name || '?').join(', '));
} else {
  // Check for multiple quotes
  const quotes = cost.quotes || [];
  console.log('Quotes count:', quotes.length);
  if (quotes[0]) {
    const li = quotes[0].line_items || [];
    console.log('Quote[0] line items:', li.length);
    console.log('First 5 components:', li.slice(0,5).map(i => i.component || i.description || '?').join(', '));
  }
}
// Check if quote-photo reconciliation exists anywhere
const reconc = cost.reconciliation || cost.quote_photo_agreement || cost.component_reconciliation;
console.log('Quote-photo reconciliation in cost JSON:', reconc ? 'EXISTS' : 'NOT PRESENT');
// Check Stage 9 reconciliation result
const s9recon = cost.stage9_reconciliation || cost.damage_reconciliation;
console.log('Stage 9 damage reconciliation:', s9recon ? JSON.stringify(s9recon).slice(0, 200) : 'NOT PRESENT');
console.log('STATUS: Quote components extracted ✓ | Cross-check against photos: NOT IMPLEMENTED');

// ─── SIGNAL 2: NARRATIVE GEOMETRY ─────────────────────────────────────────
console.log('\n=== SIGNAL 2: NARRATIVE-IMPLIED GEOMETRY ===');
console.log('Incident description:', (r.incident_description || '').slice(0, 300));
const na = pa.narrativeAnalysis;
if (na) {
  console.log('narrativeAnalysis EXISTS:');
  console.log('  implied_direction:', na.implied_direction);
  console.log('  impact_sequence:', na.impact_sequence);
  console.log('  pre_impact_state:', na.pre_impact_state);
  console.log('  other_parties:', na.other_parties);
  console.log('  cross_validation.physics_verdict:', na.cross_validation?.physics_verdict);
  console.log('  cross_validation.damage_verdict:', na.cross_validation?.damage_verdict);
  console.log('  cross_validation.crush_depth_verdict:', na.cross_validation?.crush_depth_verdict);
  console.log('  forward_model_against_narrative:', na.forward_model_against_narrative || 'NOT RUN');
  console.log('  direction_vs_photo_flag:', na.direction_vs_photo_flag || 'NOT PRESENT');
} else {
  console.log('narrativeAnalysis: NULL — incidentNarrativeEngine not run or result not persisted');
}
console.log('STATUS: Narrative extracted ✓ | Forward model against narrative: NOT IMPLEMENTED | Direction contradiction flag: NOT IMPLEMENTED');

// ─── SIGNAL 3: PHOTO EXIF METADATA ────────────────────────────────────────
console.log('\n=== SIGNAL 3: PHOTO EXIF METADATA ===');
console.log('Enriched photos count:', enrichedPhotos.length);
if (enrichedPhotos.length > 0) {
  const sample = enrichedPhotos[0];
  console.log('Sample photo keys:', Object.keys(sample).join(', '));
  console.log('Has exif_data:', 'exif_data' in sample);
  if (sample.exif_data) {
    console.log('EXIF keys in sample:', Object.keys(sample.exif_data).join(', '));
    console.log('EXIF timestamp:', sample.exif_data.DateTimeOriginal || sample.exif_data._timestamp || 'not present');
    console.log('EXIF GPS:', sample.exif_data.GPSLatitude || sample.exif_data._gps_lat || 'not present');
  }
}
// Check photoForensics in fraud breakdown
const pf = fraud.photoForensics;
if (pf) {
  console.log('photoForensics in fraud breakdown:');
  console.log('  photos_analysed:', pf.photos_analysed);
  console.log('  exif_available:', pf.exif_available);
  console.log('  timestamp_consistent:', pf.timestamp_consistent);
  console.log('  gps_consistent:', pf.gps_consistent);
  console.log('  duplicate_hash_match:', pf.duplicate_hash_match);
  console.log('  metadata_stripped_count:', pf.metadata_stripped_count);
} else {
  console.log('photoForensics in fraud breakdown: NOT PRESENT');
}
// Check for EXIF-related fraud indicators
const fraudIndicators = JSON.parse(r.fraud_indicators || '[]');
const exifIndicators = fraudIndicators.filter(i => (typeof i === 'string' ? i : (i.description || '')).toLowerCase().includes('exif') || (typeof i === 'string' ? i : (i.description || '')).toLowerCase().includes('photo') || (typeof i === 'string' ? i : (i.description || '')).toLowerCase().includes('metadata'));
console.log('EXIF/photo fraud indicators:', exifIndicators.length > 0 ? JSON.stringify(exifIndicators).slice(0, 200) : 'none');
console.log('STATUS: photoForensicsEngine exists ✓ | EXIF extracted if available ✓ | Timestamp cross-check: EXISTS | GPS cross-check: EXISTS | Duplicate hash: EXISTS | Confidence weighting from EXIF: NOT WIRED TO PHYSICS');

// ─── SIGNAL 4: WEATHER CROSS-CHECK ────────────────────────────────────────
console.log('\n=== SIGNAL 4: WEATHER CROSS-CHECK ===');
console.log('Incident date:', r.incident_date);
console.log('Incident time:', r.incident_time);
console.log('Incident location:', r.incident_location);
// Check if weather data exists anywhere
const weatherCheck = pa.weatherCrossCheck || pa.weatherValidation || pa.weatherData;
console.log('weatherCrossCheck in physics_analysis:', weatherCheck ? JSON.stringify(weatherCheck).slice(0, 200) : 'NOT PRESENT');
// Check if friction coefficient is set from weather
const physNumerical = pa.physicsNumerical;
console.log('physicsNumerical.frictionCoefficient:', physNumerical?.frictionCoefficient || physNumerical?.mu || 'not present');
console.log('physicsNumerical.roadCondition:', physNumerical?.roadCondition || 'not present');
// Check claimRecord for weather conditions
const claimRecord = metadata.claimRecord || {};
const accDetails = claimRecord.accidentDetails || {};
console.log('claimRecord.accidentDetails.weatherConditions:', accDetails.weatherConditions || 'not present');
console.log('claimRecord.accidentDetails.roadConditions:', accDetails.roadConditions || 'not present');
console.log('STATUS: Weather API: NOT IMPLEMENTED (new dependency — requires sign-off) | Friction from weather: NOT IMPLEMENTED | Claimant weather vs actual: NOT IMPLEMENTED');

// ─── SIGNAL 5: THIRD-PARTY EVIDENCE ───────────────────────────────────────
console.log('\n=== SIGNAL 5: THIRD-PARTY EVIDENCE ===');
console.log('police_report_number:', r.police_report_number || 'null');
console.log('police_station:', r.police_station || 'null');
console.log('third_party_name:', r.third_party_name || 'null');
console.log('third_party_vehicle:', r.third_party_vehicle || 'null');
// Check accidentDateCrossCheck
const adcc = pa.accidentDateCrossCheck;
if (adcc) {
  console.log('accidentDateCrossCheck:');
  console.log('  verdict:', adcc.verdict);
  console.log('  claimFormDate:', adcc.claimFormDate);
  console.log('  policeReportDate:', adcc.policeReportDate);
  console.log('  dayDiff:', adcc.claimPoliceDayDiff);
} else {
  console.log('accidentDateCrossCheck: NOT PRESENT in physics_analysis');
}
// Check if police report is treated as independent evidence tier
console.log('Police report confidence tier separation: NOT IMPLEMENTED (treated same as claimant evidence)');
console.log('STATUS: Police report number/station extracted ✓ | Date cross-check engine exists ✓ | Independent confidence tier: NOT IMPLEMENTED | Third-party statement ingestion: NOT IMPLEMENTED');

// ─── CROSS-VALIDATION LAYER STATUS ────────────────────────────────────────
console.log('\n=== CROSS-VALIDATION LAYER STATUS ===');
const xv = pa.crossValidation || pa.cross_validation || pa.multiSignalCrossValidation;
console.log('crossValidation in physics_analysis:', xv ? JSON.stringify(xv).slice(0, 300) : 'NOT PRESENT');
console.log('\nPer-fact agreement structure: NOT IMPLEMENTED');
console.log('Signal-level fraud indicator category: NOT IMPLEMENTED (signals feed into single fraud score)');
