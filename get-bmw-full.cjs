const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [full] = await conn.execute('SELECT * FROM ai_assessments WHERE id = 3930001');
  const a = full[0];
  
  // Basic fields
  console.log('=== BASIC FIELDS ===');
  const basicFields = ['id','recommendation','fraud_score','estimated_cost','currency_code','accident_type',
    'structural_damage_severity','total_loss_indicated','repair_to_value_ratio','estimated_vehicle_value',
    'parts_cost','labor_cost','estimated_parts_cost','estimated_labor_cost','confidence_score'];
  basicFields.forEach(k => {
    if (a[k] !== null && a[k] !== undefined) console.log(k + ':', a[k]);
  });
  
  // Damage components
  if (a.damaged_components_json) {
    const dc = JSON.parse(a.damaged_components_json);
    console.log('\n=== DAMAGED COMPONENTS (' + (Array.isArray(dc) ? dc.length : 'N/A') + ') ===');
    if (Array.isArray(dc)) {
      dc.slice(0, 20).forEach(c => {
        console.log(' -', c.component_name || c.name, '| zone:', c.damage_zone || c.zone, '| severity:', c.severity, '| cost:', c.estimated_cost_usd || c.cost_usd || c.cost);
      });
    } else {
      console.log(JSON.stringify(dc, null, 2).substring(0, 800));
    }
  }
  
  // Cost intelligence
  if (a.cost_intelligence_json) {
    const ci = JSON.parse(a.cost_intelligence_json);
    console.log('\n=== COST INTELLIGENCE ===');
    console.log(JSON.stringify(ci, null, 2).substring(0, 1000));
  }
  
  // Fraud indicators
  if (a.fraud_indicators) {
    console.log('\n=== FRAUD INDICATORS ===');
    console.log(a.fraud_indicators.substring(0, 500));
  }
  
  // Narrative analysis
  if (a.narrative_analysis_json) {
    const na = JSON.parse(a.narrative_analysis_json);
    console.log('\n=== NARRATIVE ANALYSIS ===');
    console.log(JSON.stringify(na, null, 2).substring(0, 1200));
  }
  
  // Physics analysis
  if (a.physics_analysis) {
    const pa = JSON.parse(a.physics_analysis);
    console.log('\n=== PHYSICS ANALYSIS ===');
    console.log('Speed:', pa.estimatedSpeedKmh, 'km/h');
    console.log('Scenario:', pa.collisionScenario || pa.reconstructionSummary);
    console.log('Severity:', pa.accidentSeverity);
    console.log('Impact force:', pa.impactForceKn, 'kN');
  }
  
  // Forensic audit validation
  if (a.forensic_audit_validation_json) {
    const fav = JSON.parse(a.forensic_audit_validation_json);
    console.log('\n=== FORENSIC VALIDATION ===');
    console.log('Consistency score:', fav.consistencyScore);
    console.log('Confidence:', fav.confidenceInAssessment);
    console.log('Summary:', fav.summary ? fav.summary.substring(0, 400) : 'N/A');
    if (fav.flags) {
      console.log('Flags:', fav.flags.length);
      fav.flags.slice(0, 5).forEach(f => console.log(' -', f.severity, f.code, ':', f.description ? f.description.substring(0, 100) : ''));
    }
  }
  
  // Claim record
  if (a.claim_record_json) {
    const cr = JSON.parse(a.claim_record_json);
    console.log('\n=== CLAIM RECORD (key fields) ===');
    const crFields = ['vehicleMake','vehicleModel','vehicleYear','vehicleColour','registrationNumber',
      'policyholderName','incidentType','incidentDate','incidentLocation','currency'];
    crFields.forEach(k => {
      if (cr[k] !== undefined && cr[k] !== null) console.log(k + ':', cr[k]);
    });
  }
  
  await conn.end();
}

main().catch(e => console.error('ERROR:', e.message));
