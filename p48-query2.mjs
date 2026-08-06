import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. AI Assessment confidence distribution
const [conf] = await conn.execute(`SELECT 
  COUNT(*) as total,
  AVG(confidence_score) as avg_confidence,
  MIN(confidence_score) as min_confidence,
  MAX(confidence_score) as max_confidence,
  SUM(CASE WHEN confidence_score >= 80 THEN 1 ELSE 0 END) as high_conf,
  SUM(CASE WHEN confidence_score >= 60 AND confidence_score < 80 THEN 1 ELSE 0 END) as med_conf,
  SUM(CASE WHEN confidence_score < 60 THEN 1 ELSE 0 END) as low_conf
  FROM ai_assessments WHERE confidence_score IS NOT NULL`);
console.log('=CONFIDENCE=', JSON.stringify(conf[0]));

// 2. Fraud risk distribution
const [fraud] = await conn.execute(`SELECT 
  fraud_risk_level, COUNT(*) as cnt, AVG(fraud_score) as avg_score,
  MIN(fraud_score) as min_score, MAX(fraud_score) as max_score
  FROM ai_assessments WHERE fraud_risk_level IS NOT NULL
  GROUP BY fraud_risk_level ORDER BY cnt DESC`);
console.log('=FRAUD=', JSON.stringify(fraud));

// 3. Physics validation results
const [phys] = await conn.execute(`SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN physics_analysis IS NOT NULL THEN 1 ELSE 0 END) as has_physics,
  SUM(CASE WHEN physics_analysis LIKE '%PASS%' THEN 1 ELSE 0 END) as physics_pass,
  SUM(CASE WHEN physics_analysis LIKE '%FAIL%' THEN 1 ELSE 0 END) as physics_fail,
  SUM(CASE WHEN physics_analysis LIKE '%INCONCLUSIVE%' THEN 1 ELSE 0 END) as physics_inconclusive
  FROM ai_assessments`);
console.log('=PHYSICS=', JSON.stringify(phys[0]));

// 4. Recommendation distribution
const [recs] = await conn.execute(`SELECT 
  recommendation, COUNT(*) as cnt, AVG(confidence_score) as avg_conf
  FROM ai_assessments WHERE recommendation IS NOT NULL
  GROUP BY recommendation ORDER BY cnt DESC`);
console.log('=RECOMMENDATIONS=', JSON.stringify(recs));

// 5. Repair quality scores
const [quality] = await conn.execute(`SELECT 
  COUNT(*) as total,
  AVG(repair_quality_score) as avg_quality,
  AVG(component_match_score) as avg_component_match,
  AVG(repair_cost_ratio) as avg_cost_ratio,
  AVG(repair_duration_days) as avg_duration_days,
  SUM(CASE WHEN repair_quality_score >= 80 THEN 1 ELSE 0 END) as high_quality,
  SUM(CASE WHEN is_fraud_flagged = 1 THEN 1 ELSE 0 END) as fraud_flagged
  FROM repair_history WHERE repair_quality_score > 0`);
console.log('=REPAIR_QUALITY=', JSON.stringify(quality[0]));

// 6. Photo forensics
const [photos] = await conn.execute(`SELECT 
  COUNT(*) as total_assessments,
  SUM(CASE WHEN image_analysis_total_count > 0 THEN 1 ELSE 0 END) as has_photos,
  AVG(image_analysis_total_count) as avg_photos_total,
  AVG(image_analysis_success_count) as avg_photos_success,
  AVG(image_analysis_success_rate) as avg_success_rate,
  SUM(CASE WHEN image_analysis_success_rate >= 0.8 THEN 1 ELSE 0 END) as high_success,
  SUM(CASE WHEN image_analysis_success_rate > 0 AND image_analysis_success_rate < 0.8 THEN 1 ELSE 0 END) as partial_success
  FROM ai_assessments`);
console.log('=PHOTO_FORENSICS=', JSON.stringify(photos[0]));

// 7. Panel beater performance tiers
const [tiers] = await conn.execute(`SELECT 
  performance_tier, COUNT(*) as cnt,
  AVG(avg_quality_score) as avg_quality,
  AVG(avg_cost_ratio) as avg_cost_ratio,
  AVG(avg_repair_duration_days) as avg_duration
  FROM panel_beaters WHERE performance_tier IS NOT NULL
  GROUP BY performance_tier ORDER BY performance_tier`);
console.log('=PB_TIERS=', JSON.stringify(tiers));

// 8. Total loss indicators
const [tl] = await conn.execute(`SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN total_loss_indicated = 1 THEN 1 ELSE 0 END) as total_loss_count,
  AVG(repair_to_value_ratio) as avg_rtv,
  SUM(CASE WHEN repair_to_value_ratio > 0.75 THEN 1 ELSE 0 END) as rtv_above_75pct
  FROM ai_assessments WHERE repair_to_value_ratio IS NOT NULL`);
console.log('=TOTAL_LOSS=', JSON.stringify(tl[0]));

// 9. CGI result distribution
const [cgi] = await conn.execute(`SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN cgi_result_json IS NOT NULL THEN 1 ELSE 0 END) as has_cgi,
  SUM(CASE WHEN cgi_result_json LIKE '%CONSISTENT%' THEN 1 ELSE 0 END) as cgi_consistent,
  SUM(CASE WHEN cgi_result_json LIKE '%INCONSISTENT%' THEN 1 ELSE 0 END) as cgi_inconsistent,
  SUM(CASE WHEN cgi_result_json LIKE '%INCONCLUSIVE%' THEN 1 ELSE 0 END) as cgi_inconclusive
  FROM ai_assessments`);
console.log('=CGI=', JSON.stringify(cgi[0]));

// 10. Interpretation results
const [interp] = await conn.execute(`SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN interpretation_result_json IS NOT NULL THEN 1 ELSE 0 END) as has_interpretation,
  SUM(CASE WHEN claim_truth_object_json IS NOT NULL THEN 1 ELSE 0 END) as has_cto,
  SUM(CASE WHEN validated_outcome_json IS NOT NULL THEN 1 ELSE 0 END) as has_validated_outcome
  FROM ai_assessments`);
console.log('=INTERPRETATION=', JSON.stringify(interp[0]));

// 11. Structural damage severity
const [struct] = await conn.execute(`SELECT 
  structural_damage_severity, COUNT(*) as cnt
  FROM ai_assessments WHERE structural_damage_severity IS NOT NULL
  GROUP BY structural_damage_severity ORDER BY cnt DESC`);
console.log('=STRUCTURAL=', JSON.stringify(struct));

// 12. Accident type distribution
const [acctype] = await conn.execute(`SELECT 
  accident_type, COUNT(*) as cnt
  FROM ai_assessments WHERE accident_type IS NOT NULL
  GROUP BY accident_type ORDER BY cnt DESC LIMIT 10`);
console.log('=ACCIDENT_TYPES=', JSON.stringify(acctype));

// 13. Vehicle registry valuations
const [vals] = await conn.execute(`SELECT 
  COUNT(*) as total,
  AVG(market_value_usd) as avg_market_value,
  MIN(market_value_usd) as min_value,
  MAX(market_value_usd) as max_value,
  SUM(CASE WHEN market_value_usd > 0 THEN 1 ELSE 0 END) as has_valuation
  FROM vehicle_registry`);
console.log('=VALUATIONS=', JSON.stringify(vals[0]));

// 14. Fraud indicators
const [fi] = await conn.execute(`SELECT 
  COUNT(*) as total,
  AVG(risk_score) as avg_risk_score,
  SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
  SUM(CASE WHEN status = 'suspected' THEN 1 ELSE 0 END) as suspected,
  SUM(CASE WHEN status = 'cleared' THEN 1 ELSE 0 END) as cleared
  FROM fraud_indicators`);
console.log('=FRAUD_INDICATORS=', JSON.stringify(fi[0]));

// 15. Cost intelligence
const [costint] = await conn.execute(`SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN cost_intelligence_json IS NOT NULL THEN 1 ELSE 0 END) as has_cost_intel,
  SUM(CASE WHEN cost_realism_json IS NOT NULL THEN 1 ELSE 0 END) as has_cost_realism,
  AVG(estimated_cost) as avg_estimated_cost,
  AVG(parts_cost) as avg_parts_cost,
  AVG(labor_cost) as avg_labor_cost
  FROM ai_assessments`);
console.log('=COST_INTEL=', JSON.stringify(costint[0]));

await conn.end();
console.log('=DONE=');
