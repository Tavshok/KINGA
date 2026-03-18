// Real claim data from database
const claims = [
  { id: "CLM-2220011", aiRisk: "high",   costUsd: 2017, severity: "minor",       confidence: 91, consistency: 50, impactDir: "unknown", deltaV: 40, speed: 2,  force: 0.733, zones: ["Right side","Left side","Roof"] },
  { id: "CLM-2220007", aiRisk: "high",   costUsd: 669,  severity: "minor",       confidence: 91, consistency: 50, impactDir: "unknown", deltaV: 24, speed: 1,  force: 0.293, zones: ["front","engine compartment","engine compartment"] },
  { id: "CLM-1740455", aiRisk: "high",   costUsd: 534,  severity: "severe",      confidence: 42, consistency: null, impactDir: "unknown", deltaV: 0, speed: 0, force: 0,     zones: ["front","front","front"] },
  { id: "CLM-2220018", aiRisk: "medium", costUsd: 510,  severity: "minor",       confidence: 91, consistency: 50, impactDir: "unknown", deltaV: 15, speed: 0,  force: 0,     zones: ["front","front","front left"] },
  { id: "CLM-2220024", aiRisk: "medium", costUsd: 368,  severity: "moderate",    confidence: 82, consistency: 50, impactDir: "unknown", deltaV: 24, speed: 25, force: 188,   zones: ["front","unknown","left front"] },
  { id: "CLM-2220004", aiRisk: "medium", costUsd: 258,  severity: "minor",       confidence: 82, consistency: 50, impactDir: "unknown", deltaV: 14, speed: 0,  force: 0,     zones: ["Rear","Rear","RHS"] },
  { id: "CLM-2220012", aiRisk: "medium", costUsd: 226,  severity: "minor",       confidence: 91, consistency: 50, impactDir: "unknown", deltaV: 14, speed: 0,  force: 0,     zones: ["left front","left","front"] },
  { id: "CLM-1591546", aiRisk: "high",   costUsd: 3097, severity: "severe",      confidence: 45, consistency: null, impactDir: "unknown", deltaV: 0, speed: 0, force: 0,     zones: ["Front Left","Front Left","Front"] },
  { id: "CLM-TEST-01", aiRisk: "high",   costUsd: 150,  severity: "catastrophic",confidence: 85, consistency: null, impactDir: "unknown", deltaV: 0, speed: 0, force: 0,     zones: ["front","front","front_left"] },
  { id: "CLM-2220025", aiRisk: "medium", costUsd: 117,  severity: "minor",       confidence: 82, consistency: 50, impactDir: "unknown", deltaV: 14, speed: 0,  force: 0,     zones: ["REAR","REAR","RHS"] },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────
function scoreToLevel(score) {
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
  const equivalences = {
    front: ["front","frontal","hood","bumper","grill","nudge","engine"],
    rear:  ["rear","back","boot","trunk","tailgate"],
    side:  ["side","door","pillar","quarter","left","right"],
    left:  ["left","side","driver"],
    right: ["right","side","passenger"],
  };
  if (zoneArr.includes(dir)) return true;
  const aliases = equivalences[dir] ?? [dir];
  return aliases.some(a => zoneArr.some(z => z.includes(a) || a.includes(z)));
}

// ─── 5-Factor Model ───────────────────────────────────────────────────────────
function model5(c) {
  let score = 0;
  const factors = [];
  const consistency = c.consistency ?? 75;
  const missingCount = (!c.speed ? 1:0) + (!c.force ? 1:0) + (c.deltaV === 0 ? 1:0);

  if (consistency < 50)                               { score += 20; factors.push("Damage Inconsistency +20"); }
  // No quote submitted in this dataset, so cost deviation = 0
  if (!directionMatchesDamage(c.impactDir, c.zones)) { score += 15; factors.push("Direction Mismatch +15"); }
  // hasPreviousClaims = false for all (no data)
  if (missingCount > 0)                               { score += 10; factors.push(`Missing Data (${missingCount} fields) +10`); }

  score = Math.min(100, score);
  return { score, level: scoreToLevel(score), factors };
}

// ─── 10-Factor Model ──────────────────────────────────────────────────────────
function model10(c) {
  let score = 0;
  const factors = [];
  const consistency = c.consistency ?? 75;
  const missingCount = (!c.speed ? 1:0) + (!c.force ? 1:0) + (c.deltaV === 0 ? 1:0);

  // F1: Damage inconsistency (graduated)
  if (consistency < 50)       { score += 15; factors.push("Damage Inconsistency (<50%) +15"); }
  else if (consistency < 75)  { score += 5;  factors.push("Moderate Inconsistency (50-75%) +5"); }

  // F2: Cost deviation (no quote = skip)

  // F3: Direction mismatch
  if (!directionMatchesDamage(c.impactDir, c.zones)) { score += 12; factors.push("Direction Mismatch +12"); }

  // F4: Repeat claim (no data = skip)

  // F5: Missing data (graduated)
  if (missingCount >= 3)      { score += 10; factors.push(`High Missing Data (${missingCount} fields) +10`); }
  else if (missingCount > 0)  { score += 5;  factors.push(`Partial Missing Data (${missingCount} fields) +5`); }

  // F6: Severity vs cost anomaly
  if (c.severity === "minor" && c.costUsd > 1500)    { score += 10; factors.push(`High Cost vs Minor Damage ($${c.costUsd}) +10`); }
  else if (c.severity === "minor" && c.costUsd > 800) { score += 5; factors.push(`Elevated Cost vs Minor Damage ($${c.costUsd}) +5`); }

  // F7: Low delta-V vs high damage
  if (c.deltaV > 0 && c.deltaV < 15 && (c.severity === "severe" || c.severity === "catastrophic")) {
    score += 12; factors.push(`Low Delta-V (${c.deltaV}km/h) vs ${c.severity} damage +12`);
  }

  // F8: Low AI confidence
  if (c.confidence < 50)      { score += 10; factors.push(`Very Low AI Confidence (${c.confidence}%) +10`); }
  else if (c.confidence < 70) { score += 5;  factors.push(`Low AI Confidence (${c.confidence}%) +5`); }

  // F9: Catastrophic/total loss flag
  if (c.severity === "catastrophic" || c.severity === "total_loss") { score += 8; factors.push(`${c.severity} severity flag +8`); }

  // F10: Zero physics data with non-trivial damage
  if (c.speed === 0 && c.force === 0 && c.deltaV === 0 && c.severity !== "minor" && c.severity !== "none") {
    score += 8; factors.push("Zero physics data with non-trivial damage +8");
  }

  score = Math.min(100, score);
  return { score, level: scoreToLevel(score), factors };
}

// ─── Output ───────────────────────────────────────────────────────────────────
console.log("\n╔══════════════════════════════════════════════════════════════════════════╗");
console.log("║         KINGA FRAUD MODEL COMPARISON — 5-Factor vs 10-Factor           ║");
console.log("╚══════════════════════════════════════════════════════════════════════════╝\n");

let agreements = 0, disagreements = 0, m10_higher = 0, m10_lower = 0;

claims.forEach(c => {
  const m5 = model5(c);
  const m10 = model10(c);
  const agree = m5.level === m10.level;
  if (agree) agreements++; else disagreements++;
  if (m10.score > m5.score) m10_higher++; else if (m10.score < m5.score) m10_lower++;

  const levelMatch = agree ? "✓ AGREE" : "✗ DIFFER";
  console.log(`┌─ ${c.id.padEnd(14)} │ AI: ${c.aiRisk.padEnd(6)} │ Cost: $${String(c.costUsd).padEnd(5)} │ Severity: ${c.severity.padEnd(12)} │ Confidence: ${c.confidence}%`);
  console.log(`│  5-Factor:  Score ${String(m5.score).padStart(3)}/100 → ${m5.level.padEnd(8)}  │  Triggers: ${m5.factors.length > 0 ? m5.factors.join(", ") : "none"}`);
  console.log(`│  10-Factor: Score ${String(m10.score).padStart(3)}/100 → ${m10.level.padEnd(8)}  │  Triggers: ${m10.factors.length > 0 ? m10.factors.join(", ") : "none"}`);
  console.log(`└─ ${levelMatch}${agree ? "" : ` (5F: ${m5.level} → 10F: ${m10.level})"}`}\n`);
});

console.log("═".repeat(76));
console.log(`SUMMARY: ${claims.length} claims evaluated`);
console.log(`  Level agreement:    ${agreements}/${claims.length} (${Math.round(agreements/claims.length*100)}%)`);
console.log(`  Level disagreement: ${disagreements}/${claims.length} (${Math.round(disagreements/claims.length*100)}%)`);
console.log(`  10-Factor scored higher: ${m10_higher} claims`);
console.log(`  10-Factor scored lower:  ${m10_lower} claims`);
console.log("\nRECOMMENDATION:");
if (agreements >= 7) {
  console.log("  → 5-Factor model is sufficient for this dataset.");
  console.log("    Both models agree on risk level in most cases.");
  console.log("    10-Factor adds granularity but may introduce noise.");
} else {
  console.log("  → 10-Factor model provides meaningfully different results.");
  console.log("    Consider adopting it for more nuanced risk stratification.");
}
