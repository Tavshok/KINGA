#!/usr/bin/env node
/**
 * Model Drift Detector
 * Detects statistical drift in AI model predictions using Kolmogorov-Smirnov test
 */

const { getDb } = require('../../server/db');
const fs = require('fs');
const path = require('path');

// Kolmogorov-Smirnov test implementation
function ksTest(sample1, sample2) {
  // Sort both samples
  const sorted1 = [...sample1].sort((a, b) => a - b);
  const sorted2 = [...sample2].sort((a, b) => a - b);
  
  // Combine and sort all values
  const allValues = [...new Set([...sorted1, ...sorted2])].sort((a, b) => a - b);
  
  let maxDiff = 0;
  
  // Calculate empirical CDFs and find maximum difference
  for (const value of allValues) {
    const cdf1 = sorted1.filter(v => v <= value).length / sorted1.length;
    const cdf2 = sorted2.filter(v => v <= value).length / sorted2.length;
    const diff = Math.abs(cdf1 - cdf2);
    
    if (diff > maxDiff) {
      maxDiff = diff;
    }
  }
  
  // Calculate p-value (approximate)
  const n1 = sorted1.length;
  const n2 = sorted2.length;
  const n = (n1 * n2) / (n1 + n2);
  const lambda = maxDiff * Math.sqrt(n);
  
  // Approximate p-value using Kolmogorov distribution
  const pValue = 2 * Math.exp(-2 * lambda * lambda);
  
  return {
    statistic: maxDiff,
    pValue: Math.min(1, pValue)
  };
}

async function detectModelDrift() {
  const db = getDb();
  
  console.log('[Drift Detector] Starting model drift detection...');
  
  // Load baseline fraud scores (from last stable release)
  const baselinePath = path.join(__dirname, '../../tests/fixtures/stability-baselines/fraud-scores-baseline.json');
  let baselineScores = [];
  
  if (fs.existsSync(baselinePath)) {
    baselineScores = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    console.log(`[Drift Detector] Loaded ${baselineScores.length} baseline scores`);
  } else {
    console.warn('[Drift Detector] No baseline file found. Creating baseline from current data...');
    
    // Get current fraud scores to create baseline
    const currentScores = await db.execute(`
      SELECT fraud_score
      FROM fraud_indicators
      WHERE fraud_score IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 500
    `);
    
    baselineScores = currentScores.map(row => row.fraud_score);
    
    // Save baseline for future comparisons
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(baselineScores, null, 2));
    
    console.log(`[Drift Detector] Created baseline with ${baselineScores.length} scores`);
  }
  
  // Get current fraud scores
  const currentScoresResult = await db.execute(`
    SELECT fraud_score
    FROM fraud_indicators
    WHERE fraud_score IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 500
  `);
  
  const currentScores = currentScoresResult.map(row => row.fraud_score);
  
  if (currentScores.length === 0) {
    console.error('[Drift Detector] No current scores found');
    return {
      ks_test_statistic: 0,
      ks_test_pvalue: 1,
      drift_detected: false,
      error: 'No current data available'
    };
  }
  
  console.log(`[Drift Detector] Comparing ${baselineScores.length} baseline scores with ${currentScores.length} current scores`);
  
  // Perform Kolmogorov-Smirnov test
  const ksResult = ksTest(baselineScores, currentScores);
  
  // Drift is detected if p-value < 0.05
  const driftDetected = ksResult.pValue < 0.05;
  
  // Calculate distribution statistics
  const baselineMean = baselineScores.reduce((a, b) => a + b, 0) / baselineScores.length;
  const currentMean = currentScores.reduce((a, b) => a + b, 0) / currentScores.length;
  const meanShift = Math.abs(currentMean - baselineMean);
  
  const output = {
    ks_test_statistic: ksResult.statistic,
    ks_test_pvalue: ksResult.pValue,
    drift_detected: driftDetected,
    baseline_mean: baselineMean,
    current_mean: currentMean,
    mean_shift: meanShift,
    baseline_count: baselineScores.length,
    current_count: currentScores.length
  };
  
  console.log('[Drift Detector] Results:', JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output));
  
  return output;
}

// Run if called directly
if (require.main === module) {
  detectModelDrift()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[Drift Detector] Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { detectModelDrift };
