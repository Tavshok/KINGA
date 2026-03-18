import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(`
  SELECT c.claim_number, c.vehicle_make, c.vehicle_model, c.vehicle_year,
    a.fraud_risk_level, a.fraud_score_breakdown_json, a.estimated_cost,
    a.structural_damage_severity, a.confidence_score,
    a.physics_analysis, a.damaged_components_json
  FROM claims c JOIN ai_assessments a ON a.claim_id = c.id
  WHERE a.fraud_risk_level IS NOT NULL LIMIT 10
`);

// 5-factor model scoring function (current implementation)
function scoreToLevel5(score) {
  if (score <= 20) return "Minimal";
  if (score <= 40) return "Low";
  if (score <= 60) return "Moderate";
  if (score <= 80) return "High";
  return "Elevated";
}

function directionMatchesDamage(direction, zones) {
  if (!direction || direction === "unknown" || zones.length === 0) return true;
  const dir = direction.toLowerCase();
  const zoneArr = zones.map(z => z.toLowerCase());
  if (zoneArr.includes(dir)) return true;
  const equivalences = {
    front: ["front", "frontal", "hood", "bumper", "grill", "nudge"],
    rear: ["rear", "back", "boot", "trunk", "tailgate"],
    side: ["side", "door", "pillar", "quarter", "left", "right"],
  };
  const aliases = equivalences[dir] ?? [dir];
  return aliases.some(alias => zoneArr.some(zone => zone.includes(alias) || alias.includes(zone)));
}

function compute5Factor(consistency, costUsd, quotedUsd, impactDir, zones, hasPrior, missingCount) {
  let score = 0;
  const factors = [];

  if (consistency < 50) { score += 20; factors.push("Damage Inconsistency (+20)"); }
  
  if (costUsd > 0 && quotedUsd > 0) {
    const dev = ((quotedUsd - costUsd) / costUsd) * 100;
    if (Math.abs(dev) > 15) { score += 15; factors.push(`Cost Deviation ${dev.toFixed(0)}% (+15)`); }
  }
  
  if (!directionMatchesDamage(impactDir, zones)) { score += 15; factors.push("Direction Mismatch (+15)"); }
  if (hasPrior) { score += 20; factors.push("Repeat Claim (+20)"); }
  if (missingCount > 0) { score += 10; factors.push(`Missing Data x${missingCount} (+10)`); }

  score = Math.min(100, score);
  return { score, level: scoreToLevel5(score), factors };
}

// 10-factor model (proposed)
function scoreToLevel10(score) {
  if (score <= 20) return "Minimal";
  if (score <= 40) return "Low";
  if (score <= 60) return "Moderate";
  if (score <= 80) return "High";
  return "Elevated";
}

function compute10Factor(consistency, costUsd, quotedUsd, impactDir, zones, hasPrior, missingCount, severity, deltaV, confidence) {
  let score = 0;
  const factors = [];

  // 5 original factors
  if (consistency < 50) { score += 15; factors.push("Damage Inconsistency (+15)"); }
  else if (consistency < 75) { score += 5; factors.push("Moderate Inconsistency (+5)"); }

  if (costUsd > 0 && quotedUsd > 0) {
    const dev = ((quotedUsd - costUsd) / costUsd) * 100;
    if (dev > 30) { score += 15; factors.push(`Cost Overpriced ${dev.toFixed(0)}% (+15)`); }
    else if (Math.abs(dev) > 15) { score += 10; factors.push(`Cost Deviation ${dev.toFixed(0)}% (+10)`); }
  }

  if (!directionMatchesDamage(impactDir, zones)) { score += 12; factors.push("Direction Mismatch (+12)"); }
  if (hasPrior) { score += 15; factors.push("Repeat Claim (+15)"); }
  if (missingCount >= 3) { score += 10; factors.push(`High Missing Data x${missingCount} (+10)`); }
  else if (missingCount > 0) { score += 5; factors.push(`Some Missing Data x${missingCount} (+5)`); }

  // 5 additional factors
  if (severity === "severe" || severity === "total_loss") { score += 8; factors.push("Severe/Total Loss (+8)"); }
  if (deltaV > 0 && deltaV < 10 && (severity === "severe" || severity === "moderate")) { score += 10; factors.push("Low Delta-V vs High Damage (+10)"); }
  if (confidence < 60) { score += 8; factors.push("Low AI Confidence (+8)"); }
  else if (confidence < 75) { score += 4; factors.push("Moderate AI Confidence (+4)"); }
  if (zones.length === 0) { score += 5; factors.push("No Damage Zones Detected (+5)"); }
  if (costUsd > 0 && costUsd > 5000 && severity === "minor") { score += 7; factors.push("High Cost vs Minor Damage (+7)"); }

  score = Math.min(100, score);
  return { score, level: scoreToLevel10(score), factors };
}

console.log("\n=== FRAUD MODEL COMPARISON: 5-Factor vs 10-Factor ===\n");
console.log("Claim         | Vehicle                    | AI Risk | 5-Factor Score/Level       | 10-Factor Score/Level      | Consistency | DeltaV | Severity");
console.log("─".repeat(160));

for (const r of rows) {
  let fb = null; try { fb = JSON.parse(r.fraud_score_breakdown_json); } catch {}
  let pa = null; try { pa = JSON.parse(r.physics_analysis); } catch {}
  let dc = null; try { dc = JSON.parse(r.damaged_components_json); } catch {}

  const consistency = pa?.damageConsistencyScore ?? 75;
  const impactDir = pa?.impactDirection ?? "unknown";
  const deltaV = pa?.deltaVKmh ?? 0;
  const zones = dc?.map(d => d.location) ?? [];
  const costUsd = Math.round(r.estimated_cost / 100);
  const severity = r.structural_damage_severity ?? "unknown";
  const confidence = r.confidence_score ?? 75;
  const missingCount = (!pa?.estimatedSpeedKmh ? 1 : 0) + (!pa?.impactForceKn ? 1 : 0) + (!pa?.energyKj ? 1 : 0);

  const m5 = compute5Factor(consistency, costUsd, 0, impactDir, zones, false, missingCount);
  const m10 = compute10Factor(consistency, costUsd, 0, impactDir, zones, false, missingCount, severity, deltaV, confidence);

  const vehicle = (r.vehicle_make + " " + r.vehicle_model + " " + r.vehicle_year).substring(0, 26).padEnd(26);
  const claim = r.claim_number.padEnd(13);
  const aiRisk = (r.fraud_risk_level ?? "?").padEnd(7);
  const m5str = `${m5.score}/100 ${m5.level}`.padEnd(26);
  const m10str = `${m10.score}/100 ${m10.level}`.padEnd(26);

  console.log(`${claim} | ${vehicle} | ${aiRisk} | ${m5str} | ${m10str} | ${String(consistency).padEnd(11)} | ${String(deltaV).padEnd(6)} | ${severity}`);
  if (m5.factors.length > 0 || m10.factors.length > 0) {
    console.log(`  5-Factor triggers: ${m5.factors.join(", ") || "none"}`);
    console.log(`  10-Factor triggers: ${m10.factors.join(", ") || "none"}`);
  }
  console.log();
}

await conn.end();
