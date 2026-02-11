#!/usr/bin/env node
/**
 * AI Assessment Consistency Checker
 * Ensures AI model produces identical outputs for identical inputs
 */

const { invokeLLM } = require('../../server/_core/llm');
const fs = require('fs');
const path = require('path');

// Reference test cases with expected outputs
const testCases = [
  {
    input: {
      description: 'Minor fender bender in parking lot. No injuries. Scratched bumper.',
      estimated_cost: 5000,
      incident_date: '2026-02-01',
      location: 'Sandton City Parking'
    },
    expected_fraud_risk: 'low',
    expected_severity: 'minor'
  },
  {
    input: {
      description: 'Total loss. Vehicle rolled multiple times on highway. Driver hospitalized.',
      estimated_cost: 250000,
      incident_date: '2026-01-15',
      location: 'N1 Highway near Johannesburg'
    },
    expected_fraud_risk: 'low',
    expected_severity: 'severe'
  },
  {
    input: {
      description: 'Claimed vehicle stolen but found at claimant residence. Inconsistent timeline.',
      estimated_cost: 180000,
      incident_date: '2026-01-20',
      location: 'Pretoria East'
    },
    expected_fraud_risk: 'high',
    expected_severity: 'moderate'
  }
];

async function checkAssessmentConsistency() {
  console.log('[Assessment Consistency Checker] Starting consistency validation...');
  
  let consistentResults = 0;
  const results = [];
  
  for (const testCase of testCases) {
    console.log(`[Assessment Consistency Checker] Testing case: ${testCase.input.description.substring(0, 50)}...`);
    
    // Run assessment 3 times with identical input
    const assessments = [];
    for (let i = 0; i < 3; i++) {
      try {
        const assessment = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: 'You are an insurance claim assessor. Analyze the claim and return a JSON object with {fraud_risk: "low"|"medium"|"high", severity: "minor"|"moderate"|"severe", recommended_action: string}.'
            },
            {
              role: 'user',
              content: `Assess this insurance claim:
Description: ${testCase.input.description}
Estimated Cost: R${testCase.input.estimated_cost}
Incident Date: ${testCase.input.incident_date}
Location: ${testCase.input.location}`
            }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'claim_assessment',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  fraud_risk: { type: 'string', enum: ['low', 'medium', 'high'] },
                  severity: { type: 'string', enum: ['minor', 'moderate', 'severe'] },
                  recommended_action: { type: 'string' }
                },
                required: ['fraud_risk', 'severity', 'recommended_action'],
                additionalProperties: false
              }
            }
          }
        });
        
        assessments.push(JSON.parse(assessment.choices[0].message.content));
      } catch (error) {
        console.error(`[Assessment Consistency Checker] Error in assessment ${i + 1}:`, error.message);
      }
    }
    
    // Check if all 3 assessments are identical
    const isConsistent = assessments.length === 3 &&
      assessments.every(a => 
        a.fraud_risk === assessments[0].fraud_risk &&
        a.severity === assessments[0].severity
      );
    
    if (isConsistent) {
      consistentResults++;
    }
    
    results.push({
      test_case: testCase.input.description.substring(0, 50),
      consistent: isConsistent,
      assessments: assessments
    });
  }
  
  const consistencyRate = consistentResults / testCases.length;
  
  const output = {
    consistency_rate: consistencyRate,
    consistent_count: consistentResults,
    total_cases: testCases.length,
    results: results
  };
  
  console.log('[Assessment Consistency Checker] Results:', JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output));
  
  return output;
}

// Run if called directly
if (require.main === module) {
  checkAssessmentConsistency()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[Assessment Consistency Checker] Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { checkAssessmentConsistency };
