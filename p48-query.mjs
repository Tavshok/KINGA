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

// 4. Cost estimation accuracy (repair_history vs ai estimates)
const [cost] = await conn.execute(`SELECT 
  COUNT(*) as total,
  AVG(repair_cost_cents) as avg_actual_cost,
  AVG(ai_estimated_cost_cents) as avg_ai_estimate,
  AVG(cost_deviation_pct) as avg_deviation_pct,
  AVG(repair_cost_ratio) as avg_cost_ratio,
  SUM(CASE WHEN ABS(cost_deviation_pct) <= 15 THEN 1 ELSE 0 END) as within_15pct,
  SUM(CASE WHEN ABS(cost_deviation_pct) <= 25 THEN 1 ELSE 0 END) as within_25pct,
  SUM(CASE WHEN ABS(cost_deviation_pct) > 25 THEN 1 ELSE 0 END) as outside_25pct
  FROM repair_history WHERE ai_estimated_cost_cents > 0 AND repair_cost_cents > 0`);
console.log('=COST_ACCURACY=', JSON.stringify(cost[0]));

// 5. Repair quality scores
const [quality] = await conn.execute(`SELECT 
  COUNT(*) as total,
  AVG(repair_quality_score) as avg_quality,
  MIN(repair_quality_score) as min_quality,
  MAX(repair_quality_score) as max_quality,
  SUM(CASE WHEN repair_quality_score >= 80 THEN 1 ELSE 0 END) as high_quality,
  SUM(CASE WHEN repair_quality_score >= 60 AND repair_quality_score < 80 THEN 1 ELSE 0 END) as med_quality,
  SUM(CASE WHEN repair_quality_score < 60 THEN 1 ELSE 0 END) as low_quality
  FROM repair_history WHERE repair_quality_score > 0`);
console.log('=REPAIR_QUALITY=', JSON.stringify(quality[0]));

// 6. Decision recommendation distribution
const [decisions] = await conn.execute(`SELECT 
  JSON_UNQUOTE(JSON_EXTRACT(interpretation_json, '$.decision.recommendation')) as recommendation,
  COUNT(*) as cnt
  FROM ai_assessments WHERE interpretation_json IS NOT NULL
  GROUP BY recommendation ORDER BY cnt DESC LIMIT 10`);
console.log('=DECISIONS=', JSON.stringify(decisions));

// 7. Fraud alerts
const [falerts] = await conn.execute(`SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_alerts,
  SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
  SUM(CASE WHEN status = 'false_positive' THEN 1 ELSE 0 END) as false_positives
  FROM fraud_alerts`);
console.log('=FRAUD_ALERTS=', JSON.stringify(falerts[0]));

// 8. AI assessment recommendation distribution
const [recs] = await conn.execute(`SELECT 
  recommendation, COUNT(*) as cnt, AVG(confidence_score) as avg_conf
  FROM ai_assessments WHERE recommendation IS NOT NULL
  GROUP BY recommendation ORDER BY cnt DESC`);
console.log('=RECOMMENDATIONS=', JSON.stringify(recs));

// 9. Vehicle valuations
const [vals] = await conn.execute(`SELECT 
  COUNT(*) as total,
  AVG(market_value_usd) as avg_market_value,
  AVG(repair_to_value_ratio) as avg_rtv_ratio,
  SUM(CASE WHEN repair_to_value_ratio > 0.75 THEN 1 ELSE 0 END) as total_loss_indicated
  FROM vehicle_registry WHERE market_value_usd > 0`);
console.log('=VALUATIONS=', JSON.stringify(vals[0]));

// 10. Photo forensics
const [photos] = await conn.execute(`SELECT 
  COUNT(*) as total_assessments,
  SUM(CASE WHEN photos_detected_count > 0 THEN 1 ELSE 0 END) as has_photos,
  AVG(photos_detected_count) as avg_photos_detected,
  AVG(photos_processed_count) as avg_photos_processed,
  SUM(CASE WHEN image_analysis_success_count > 0 THEN 1 ELSE 0 END) as successful_analysis
  FROM ai_assessments`);
console.log('=PHOTO_FORENSICS=', JSON.stringify(photos[0]));

// 11. Panel beater performance tiers
const [tiers] = await conn.execute(`SELECT 
  performance_tier, COUNT(*) as cnt,
  AVG(avg_quality_score) as avg_quality,
  AVG(avg_cost_ratio) as avg_cost_ratio,
  AVG(avg_repair_duration_days) as avg_duration
  FROM panel_beaters WHERE performance_tier IS NOT NULL
  GROUP BY performance_tier ORDER BY performance_tier`);
console.log('=PB_TIERS=', JSON.stringify(tiers));

// 12. Claim complexity distribution
const [complexity] = await conn.execute(`SELECT 
  JSON_UNQUOTE(JSON_EXTRACT(interpretation_json, '$.claimComplexity')) as complexity,
  COUNT(*) as cnt
  FROM ai_assessments WHERE interpretation_json IS NOT NULL
  GROUP BY complexity ORDER BY cnt DESC LIMIT 8`);
console.log('=COMPLEXITY=', JSON.stringify(complexity));

await conn.end();
console.log('Query complete.');
