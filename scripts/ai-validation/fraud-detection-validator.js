#!/usr/bin/env node
/**
 * Fraud Detection Validator
 * Validates fraud detection model accuracy, precision, and recall against a validation dataset
 */

const { getDb } = require('../../server/db');
const { invokeLLM } = require('../../server/_core/llm');

async function validateFraudDetection() {
  const db = getDb();
  
  console.log('[Fraud Detection Validator] Starting validation...');
  
  // Get validation dataset (500 claims with known fraud labels)
  const validationClaims = await db.execute(`
    SELECT 
      c.id,
      c.description,
      c.incident_date,
      c.location,
      c.estimated_cost,
      fi.is_fraudulent as actual_fraud,
      fi.fraud_score as actual_fraud_score
    FROM claims c
    LEFT JOIN fraud_indicators fi ON c.id = fi.claim_id
    WHERE fi.is_fraudulent IS NOT NULL
    ORDER BY c.created_at DESC
    LIMIT 500
  `);
  
  if (validationClaims.length === 0) {
    console.error('[Fraud Detection Validator] No validation data found');
    return {
      accuracy: 0,
      precision: 0,
      recall: 0,
      error: 'No validation data available'
    };
  }
  
  console.log(`[Fraud Detection Validator] Validating ${validationClaims.length} claims...`);
  
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;
  
  // Run fraud detection on each claim
  for (const claim of validationClaims) {
    try {
      const fraudAssessment = await invokeLLM({
        messages: [
          {
            role: 'system',
            content: 'You are a fraud detection expert. Analyze the claim and return a JSON object with {is_fraudulent: boolean, fraud_score: number (0-100), reasoning: string}.'
          },
          {
            role: 'user',
            content: `Analyze this insurance claim for fraud indicators:
Description: ${claim.description}
Incident Date: ${claim.incident_date}
Location: ${claim.location}
Estimated Cost: R${claim.estimated_cost}`
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'fraud_assessment',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                is_fraudulent: { type: 'boolean' },
                fraud_score: { type: 'number' },
                reasoning: { type: 'string' }
              },
              required: ['is_fraudulent', 'fraud_score', 'reasoning'],
              additionalProperties: false
            }
          }
        }
      });
      
      const prediction = JSON.parse(fraudAssessment.choices[0].message.content);
      const actualFraud = claim.actual_fraud === 1;
      const predictedFraud = prediction.is_fraudulent;
      
      if (predictedFraud && actualFraud) {
        truePositives++;
      } else if (predictedFraud && !actualFraud) {
        falsePositives++;
      } else if (!predictedFraud && !actualFraud) {
        trueNegatives++;
      } else if (!predictedFraud && actualFraud) {
        falseNegatives++;
      }
    } catch (error) {
      console.error(`[Fraud Detection Validator] Error processing claim ${claim.id}:`, error.message);
    }
  }
  
  // Calculate metrics
  const accuracy = (truePositives + trueNegatives) / validationClaims.length;
  const precision = truePositives / (truePositives + falsePositives) || 0;
  const recall = truePositives / (truePositives + falseNegatives) || 0;
  
  const results = {
    accuracy,
    precision,
    recall,
    true_positives: truePositives,
    false_positives: falsePositives,
    true_negatives: trueNegatives,
    false_negatives: falseNegatives,
    total_claims: validationClaims.length
  };
  
  console.log('[Fraud Detection Validator] Results:', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
  
  return results;
}

// Run if called directly
if (require.main === module) {
  validateFraudDetection()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[Fraud Detection Validator] Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { validateFraudDetection };
