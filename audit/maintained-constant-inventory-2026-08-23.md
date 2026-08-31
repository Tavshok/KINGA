# Maintained 92-Candidate Constant Inventory

**Source:** `scripts/magic-numbers-raw.json`  
**Candidate lines:** 92  

| # | File | Line | Value | Source context | Classification |
|---:|---|---:|---:|---|---|
| 1 | `server/pipeline-v2/stage-2-extraction.ts` | 76 | `300` | `textTooShort: boolean;          // rawText < 300 chars (document barely read)` | Pending manual classification |
| 2 | `server/pipeline-v2/stage-2-extraction.ts` | 77 | `40` | `criticalFieldsMissing: number;  // count of fields with confidence < 40` | Pending manual classification |
| 3 | `server/pipeline-v2/stage-2-extraction.ts` | 107 | `32` | `if (cp < 32 && cp !== 9 && cp !== 10 && cp !== 13) { garbledCount++; continue; }` | Pending manual classification |
| 4 | `server/pipeline-v2/stage-2-extraction.ts` | 151 | `16384` | `maxTokens: 16384, // Full PDF extraction can produce 10k+ tokens for dense insurance forms` | Pending manual classification |
| 5 | `server/pipeline-v2/stage-2-extraction.ts` | 395 | `16384` | `maxTokens: 16384, // Dense insurance forms can exceed 8k tokens per 4-page chunk` | Pending manual classification |
| 6 | `server/pipeline-v2/stage-2-extraction.ts` | 613 | `16384` | `maxTokens: 16384,` | Pending manual classification |
| 7 | `server/pipeline-v2/stage-3-structured-extraction.ts` | 67 | `2024` | `policeReportNumber: { type: ["string", "null"], description: "Police report/case number. MUST be an alphanumeric code co` | Pending manual classification |
| 8 | `server/pipeline-v2/stage-3-structured-extraction.ts` | 80 | `59133` | `quoteTotalCents: { type: ["integer", "null"], description: "Total repair quote in cents. SEARCH ALL PAGES — the quotatio` | Pending manual classification |
| 9 | `server/pipeline-v2/stage-3-structured-extraction.ts` | 132 | `3166` | `repairCountry: { type: ["string", "null"], description: "Country where the vehicle is being repaired. Look for the panel` | Pending manual classification |
| 10 | `server/pipeline-v2/stage-3-structured-extraction.ts` | 573 | `20` | `if (!text.includes(' ') && len > 20 && /[^a-zA-Z0-9\-\/\.]/.test(text)) return true;` | Pending manual classification |
| 11 | `server/pdf-image-extractor.ts` | 166 | `220` | `for (let i = 0; i < n; i++) if (pixels[i] > 220) whitePixels++;` | Pending manual classification |
| 12 | `server/pdf-image-extractor.ts` | 210 | `5000` | `await new Promise(r => setTimeout(r, 5000 * attempt));` | Pending manual classification |
| 13 | `server/pdf-image-extractor.ts` | 236 | `10` | `if (aspect > 10 \|\| aspect < 0.1) {` | Pending manual classification |
| 14 | `server/pdf-image-extractor.ts` | 374 | `1.6` | `if (ratio > 1.6 && !isLastPage) {` | Pending manual classification |
| 15 | `server/pdf-image-extractor.ts` | 377 | `1.3` | `} else if (ratio > 1.3 && ratio <= 1.6) {` | Pending manual classification |
| 16 | `server/pdf-image-extractor.ts` | 402 | `85` | `if (fn === 85 \|\| fn === 86) {` | Pending manual classification |
| 17 | `server/pipeline-v2/quoteExtractionEngine.ts` | 518 | `24000` | `const MAX_TOTAL = 24000; // total budget sent to detection LLM` | Pending manual classification |
| 18 | `server/pipeline-v2/quoteExtractionEngine.ts` | 727 | `0.6` | `if (minLen > 0 && overlap / minLen >= 0.6) return true;` | Pending manual classification |
| 19 | `server/pipeline-v2/imageIntelligence.ts` | 114 | `180` | `const isLikelyWhiteBackground = meanBrightness > 180;` | Pending manual classification |
| 20 | `server/pipeline-v2/imageIntelligence.ts` | 115 | `0.25` | `const isLowColour = colourVariance < 0.25;` | Pending manual classification |
| 21 | `server/pipeline-v2/imageIntelligence.ts` | 168 | `220` | `if (f.meanBrightness > 220 && f.colourVariance < 0.15) {` | Pending manual classification |
| 22 | `server/pipeline-v2/imageIntelligence.ts` | 316 | `0.5` | `features: { textDensity: 0.5, colourVariance: 0.3, edgeDensity: 0.3, blurScore: 0.3, aspectRatio: 1, meanBrightness: 128` | Pending manual classification |
| 23 | `server/pipeline-v2/imageIntelligence.ts` | 342 | `80` | `const isDark    = features.meanBrightness < 80;` | Pending manual classification |
| 24 | `server/pipeline-v2/imageIntelligence.ts` | 343 | `0.05` | `const hasColour = features.colourVariance > 0.05;` | Pending manual classification |
| 25 | `server/pipeline-v2/imageIntelligence.ts` | 410 | `8` | `const isDuplicate = seenHashes.some(h => hammingDistance(h, hash) <= 8);` | Pending manual classification |
| 26 | `server/pipeline-v2/imageClassifier.ts` | 165 | `0.5` | `let score = 0.5; // Start neutral` | Pending manual classification |
| 27 | `server/pipeline-v2/imageClassifier.ts` | 170 | `0.35` | `score -= 0.35;` | Pending manual classification |
| 28 | `server/pipeline-v2/imageClassifier.ts` | 182 | `0.10` | `score -= 0.10;` | Pending manual classification |
| 29 | `server/pipeline-v2/imageClassifier.ts` | 212 | `0.15` | `score += 0.15;` | Pending manual classification |
| 30 | `server/pipeline-v2/imageClassifier.ts` | 218 | `0.15` | `score -= 0.15;` | Pending manual classification |
| 31 | `server/pipeline-v2/imageClassifier.ts` | 224 | `0.10` | `score += 0.10;` | Pending manual classification |
| 32 | `server/pipeline-v2/imageClassifier.ts` | 227 | `0.10` | `score -= 0.10;` | Pending manual classification |
| 33 | `server/pipeline-v2/imageClassifier.ts` | 234 | `0.10` | `score += 0.10;` | Pending manual classification |
| 34 | `server/pipeline-v2/imageClassifier.ts` | 237 | `0.15` | `score -= 0.15;` | Pending manual classification |
| 35 | `server/pipeline-v2/imageClassifier.ts` | 243 | `0.15` | `score -= 0.15;` | Pending manual classification |
| 36 | `server/pipeline-v2/imageClassifier.ts` | 249 | `0.25` | `score -= 0.25;` | Pending manual classification |
| 37 | `server/pipeline-v2/imageClassifier.ts` | 699 | `0.4` | `if (img.confidence < 0.4 && img.category !== 'document_page') {` | Pending manual classification |
| 38 | `server/pipeline-v2/stage-6-damage-analysis.ts` | 114 | `400` | `return { accessible: r.status < 400, httpStatus: r.status };` | Pending manual classification |
| 39 | `server/pipeline-v2/stage-6-damage-analysis.ts` | 265 | `30000` | `>30000   = catastrophic structural crush` | Pending manual classification |
| 40 | `server/pipeline-v2/stage-6-damage-analysis.ts` | 279 | `40` | `<40    = poor image quality, high uncertainty` | Pending manual classification |
| 41 | `server/pipeline-v2/stage-6-damage-analysis.ts` | 1551 | `0.85` | `confidence: 0.85,` | Pending manual classification |
| 42 | `server/pipeline-v2/photoForensicsEngine.ts` | 372 | `120` | `if (!isNaN(parsed) && parsed >= 0 && parsed <= 120) crushDepthCm = parsed;` | Pending manual classification |
| 43 | `server/pipeline-v2/speedInferenceEnsemble.ts` | 102 | `40` | `/** True if two or more methods diverge by > 40% — warrants adjuster review */` | Pending manual classification |
| 44 | `server/pipeline-v2/speedInferenceEnsemble.ts` | 372 | `30` | `? ' Note: FMVSS 208 threshold is calibrated for frontal barrier events. For this incident type, actual deployment thresh` | Pending manual classification |
| 45 | `server/pipeline-v2/speedInferenceEnsemble.ts` | 383 | `0.70` | `confidenceWeight: 0.70, // High confidence as a floor for barrier events` | Pending manual classification |
| 46 | `server/pipeline-v2/speedInferenceEnsemble.ts` | 745 | `60` | `recommendedAction: gapPct >= 60` | Pending manual classification |
| 47 | `server/pipeline-v2/severityConsensusEngine.ts` | 91 | `25` | `if (score < 25) return "minor";` | Pending manual classification |
| 48 | `server/pipeline-v2/severityConsensusEngine.ts` | 92 | `55` | `if (score < 55) return "moderate";` | Pending manual classification |
| 49 | `server/pipeline-v2/stage-8-fraud.ts` | 891 | `15` | `severity: accidentDateCrossCheckResult.fraudScore >= 15 ? 'high' : 'medium',` | Pending manual classification |
| 50 | `server/pipeline-v2/scenarioFraudEngine.ts` | 53 | `48` | `\| "minor_gap"        // Small discrepancy (< 48 h) — likely administrative` | Pending manual classification |
| 51 | `server/pipeline-v2/scenarioFraudEngine.ts` | 54 | `48` | `\| "significant_gap"  // Large discrepancy (> 48 h) or unexplained delay` | Pending manual classification |
| 52 | `server/pipeline-v2/scenarioFraudEngine.ts` | 101 | `90` | `/** Whether the vehicle was recently purchased (< 90 days) */` | Pending manual classification |
| 53 | `server/pipeline-v2/scenarioFraudEngine.ts` | 481 | `55` | `if (score >= 55) return "HIGH";` | Pending manual classification |
| 54 | `server/pipeline-v2/scenarioFraudEngine.ts` | 482 | `25` | `if (score >= 25) return "MEDIUM";` | Pending manual classification |
| 55 | `server/pipeline-v2/scenarioFraudEngine.ts` | 536 | `30` | `profile.police_report_score >= 30 ? "HIGH" : "MEDIUM",` | Pending manual classification |
| 56 | `server/pipeline-v2/scenarioFraudEngine.ts` | 604 | `48` | `\`A significant gap exists in the incident timeline (> 48 hours unexplained). \` +` | Pending manual classification |
| 57 | `server/pipeline-v2/scenarioFraudEngine.ts` | 614 | `48` | `"Minor timeline gaps (< 48 hours) are common administrative discrepancies and are not fraud signals."` | Pending manual classification |
| 58 | `server/pipeline-v2/scenarioFraudEngine.ts` | 810 | `90` | `\`Vehicle was recently purchased (< 90 days) and is now subject to a ${scenario_type.replace(/_/g, " ")} claim. \` +` | Pending manual classification |
| 59 | `server/pipeline-v2/fraudPatternLearningEngine.ts` | 356 | `0.3` | `if (fpRate < 0.3) continue; // only surface if FP rate >= 30%` | Pending manual classification |
| 60 | `server/pipeline-v2/pipelineCostConstants.ts` | 34 | `0.65` | `export const ECONOMIC_WRITE_OFF_THRESHOLD = 0.65; // 65% — insurer-agreed threshold` | Pending manual classification |
| 61 | `server/pipeline-v2/costDecisionEngine.ts` | 175 | `20` | `/** Whether the agreed cost represents an overpayment risk (>20% above optimised) */` | Pending manual classification |
| 62 | `server/pipeline-v2/costDecisionEngine.ts` | 177 | `30` | `/** Whether the agreed cost suggests under-repair risk (>30% below optimised) */` | Pending manual classification |
| 63 | `server/pipeline-v2/costDecisionEngine.ts` | 798 | `80` | `severity: highestQuoteDeviationPct > 80 ? "critical" : "high",` | Pending manual classification |
| 64 | `server/pipeline-v2/quoteOptimisationEngine.ts` | 845 | `20` | `if (cv <= 20) return \`Submitted prices are consistent (CV ${cv}%) but failed the credibility gate — benchmark P50 used a` | Pending manual classification |
| 65 | `server/pipeline-v2/quoteOptimisationEngine.ts` | 848 | `20` | `if (cv <= 20) return \`Submitted prices are consistent across repairers (CV ${cv}%) — lowest submitted price selected wit` | Pending manual classification |
| 66 | `server/pipeline-v2/quoteOptimisationEngine.ts` | 849 | `40` | `if (cv <= 40) return \`Moderate price variation across repairers (CV ${cv}%) — lowest credible submitted price selected.\`` | Pending manual classification |
| 67 | `server/pipeline-v2/quoteOptimisationEngine.ts` | 903 | `50` | `if (pct > 50) {` | Pending manual classification |
| 68 | `server/pipeline-v2/stage-5-assembly.ts` | 483 | `2020` | `? \`- Zimbabwe uses USD cash transactions for vehicle sales. Prices are NOT discounted vs SA.\n- Import duties and scarci` | Pending manual classification |
| 69 | `server/pipeline-v2/decisionReadinessEngine.ts` | 314 | `60` | `classification_confidence < 60` | Pending manual classification |
| 70 | `server/pipeline-v2/decisionReadinessEngine.ts` | 380 | `40` | `physics_confidence < 40` | Pending manual classification |
| 71 | `server/pipeline-v2/decisionReadinessEngine.ts` | 437 | `50` | `cost_confidence < 50` | Pending manual classification |
| 72 | `server/pipeline-v2/evidenceStrengthScorer.ts` | 144 | `0.36` | `/** Assumption penalty per estimation/fallback assumption (capped at 3× = 0.36) */` | Pending manual classification |
| 73 | `server/pipeline-v2/evidenceStrengthScorer.ts` | 148 | `0.18` | `/** Assumption penalty per partial-data assumption (capped at 3× = 0.18) */` | Pending manual classification |
| 74 | `server/pipeline-v2/forensicCDI.ts` | 192 | `80` | `scorePercent >= 80 ? "HIGH" :` | Pending manual classification |
| 75 | `server/pipeline-v2/forensicCDI.ts` | 193 | `55` | `scorePercent >= 55 ? "MEDIUM" :` | Pending manual classification |
| 76 | `server/pipeline-v2/forensicCDI.ts` | 194 | `30` | `scorePercent >= 30 ? "LOW" :` | Pending manual classification |
| 77 | `server/pipeline-v2/orchestrator.ts` | 389 | `30` | `const highImpact = result.assumptions.filter((a: Assumption) => (a.confidence ?? 50) < 30);` | Pending manual classification |
| 78 | `server/pipeline-v2/orchestrator.ts` | 896 | `0.6` | `if (minLen > 0 && overlap / minLen >= 0.6) return true;` | Pending manual classification |
| 79 | `server/pipeline-v2/orchestrator.ts` | 1173 | `30` | `const isHeuristicSpeed = currentSpeed === 30 \|\| currentSpeed === 45 \|\| currentSpeed === 60;` | Pending manual classification |
| 80 | `server/pipeline-v2/orchestrator.ts` | 1581 | `70` | `scenario_fraud_flagged: stage8Data.fraudRiskScore > 70,` | Pending manual classification |
| 81 | `server/pipeline-v2/orchestrator.ts` | 1788 | `40` | `if (consensusResult?.consensus_label === "CONFLICTING" && (consensusResult?.consensus_score ?? 100) < 40) {` | Pending manual classification |
| 82 | `server/pipeline-v2/orchestrator.ts` | 1822 | `50` | `if (reconciliationLog && reconciliationLog.congruencyScore < 50) {` | Pending manual classification |
| 83 | `server/pipeline-v2/orchestrator.ts` | 2049 | `50` | `is_plausible: (stage7Data.damageConsistencyScore ?? 0) >= 50,` | Pending manual classification |
| 84 | `server/pipeline-v2/orchestrator.ts` | 2051 | `30` | `has_critical_inconsistency: (stage7Data.damageConsistencyScore ?? 100) < 30,` | Pending manual classification |
| 85 | `server/pipeline-v2/orchestrator.ts` | 2066 | `70` | `scenario_fraud_flagged: (stage8Data.fraudRiskScore ?? 0) >= 70,` | Pending manual classification |
| 86 | `server/pipeline-v2/orchestrator.ts` | 2073 | `60` | `is_within_range: stage9Data.costDecision.confidence >= 60,` | Pending manual classification |
| 87 | `server/pipeline-v2/orchestrator.ts` | 2075 | `50` | `has_anomalies: (stage9Data.costDecision.confidence ?? 100) < 50,` | Pending manual classification |
| 88 | `server/pipeline-v2/orchestrator.ts` | 2401 | `30` | `(claimRecord as any)?.accidentDetails?.incidentClassification?.confidence <= 30;` | Pending manual classification |
| 89 | `server/pipeline-v2/stage-4-validation.ts` | 444 | `300` | `if (!isNaN(speedVal) && speedVal > 0 && speedVal < 300) {` | Pending manual classification |
| 90 | `server/pipeline-v2/incidentClassificationEngine.ts` | 742 | `85` | `const llmHighConfidence = (llmResult!.confidence ?? 0) >= 85;` | Pending manual classification |
| 91 | `server/pipeline-v2/fieldValidationEngine.ts` | 184 | `200` | `if (speed >= 1 && speed <= 200) {` | Pending manual classification |
| 92 | `server/pipeline-v2/extractionQualityScorer.ts` | 148 | `80` | `score >= 80 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW";` | Pending manual classification |
