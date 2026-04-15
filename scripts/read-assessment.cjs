const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.query('SELECT id, confidence_score, fraud_risk_level, fraud_score, recommendation, image_analysis_total_count, image_analysis_success_count, image_analysis_failed_count, image_analysis_success_rate, fcdi_score FROM ai_assessments WHERE claim_id = 4320476 ORDER BY id DESC LIMIT 1');
  console.log('Assessment:', JSON.stringify(rows[0], null, 2));
  
  const [fav] = await conn.query('SELECT forensic_audit_validation_json FROM ai_assessments WHERE id = ?', [rows[0].id]);
  if (fav[0] && fav[0].forensic_audit_validation_json) {
    var fv = JSON.parse(fav[0].forensic_audit_validation_json);
    console.log('\nForensic Audit Validation:');
    console.log('  Status:', fv.overallStatus);
    console.log('  Consistency Score:', fv.consistencyScore);
    console.log('  Critical Failures:', (fv.criticalFailures || []).length);
    console.log('  High Severity:', (fv.highSeverityIssues || []).length);
    console.log('  Medium Issues:', (fv.mediumIssues || []).length);
    console.log('  Low Issues:', (fv.lowIssues || []).length);
    
    if (fv.highSeverityIssues && fv.highSeverityIssues.length > 0) {
      console.log('\n  High Severity Details:');
      fv.highSeverityIssues.forEach(function(i, idx) {
        console.log('    ' + (idx+1) + '. [' + i.dimension + '] ' + i.code + ': ' + i.description);
      });
    }
    if (fv.mediumIssues && fv.mediumIssues.length > 0) {
      console.log('\n  Medium Issues Details:');
      fv.mediumIssues.forEach(function(i, idx) {
        console.log('    ' + (idx+1) + '. [' + i.dimension + '] ' + i.code + ': ' + i.description);
      });
    }
    if (fv.lowIssues && fv.lowIssues.length > 0) {
      console.log('\n  Low Issues Details:');
      fv.lowIssues.forEach(function(i, idx) {
        console.log('    ' + (idx+1) + '. [' + i.dimension + '] ' + i.code + ': ' + i.description);
      });
    }
    console.log('\n  Dimension Results:', JSON.stringify(fv.dimensionResults, null, 4));
    console.log('\n  Summary:', fv.summary);
  }
  await conn.end();
})();
