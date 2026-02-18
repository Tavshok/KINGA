/**
 * Load Test Script
 * 
 * Simulates production workload:
 * - 1000 claim submissions
 * - Parallel AI scoring calls
 * - Quote submissions
 * - Workflow state transitions
 * 
 * Usage:
 *   tsx load-test/run-load-test.ts --claims=1000 --concurrency=10
 */

import { performance } from "perf_hooks";
import { generateClaimBatch, generateQuoteBatch } from "./data-generator";
import { PerformanceMetrics } from "./metrics-collector";

// Configuration
interface LoadTestConfig {
  totalClaims: number;
  concurrency: number;
  tenantId: number;
  baseUrl: string;
  apiKey: string;
}

// Default configuration
const DEFAULT_CONFIG: LoadTestConfig = {
  totalClaims: 1000,
  concurrency: 10,
  tenantId: 1,
  baseUrl: "http://localhost:3000",
  apiKey: process.env.LOAD_TEST_API_KEY || "",
};

/**
 * Simulate claim submission
 */
async function submitClaim(claimData: any, metrics: PerformanceMetrics): Promise<number | null> {
  const startTime = performance.now();
  
  try {
    const response = await fetch(`${DEFAULT_CONFIG.baseUrl}/api/trpc/claims.submitClaim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEFAULT_CONFIG.apiKey}`,
      },
      body: JSON.stringify({ json: claimData }),
    });
    
    const endTime = performance.now();
    const latency = endTime - startTime;
    
    if (!response.ok) {
      metrics.recordError("submitClaim", `HTTP ${response.status}`);
      return null;
    }
    
    const result = await response.json();
    metrics.recordSuccess("submitClaim", latency);
    
    return result.result.data.json.claimId;
  } catch (error) {
    const endTime = performance.now();
    metrics.recordError("submitClaim", error instanceof Error ? error.message : "Unknown error");
    return null;
  }
}

/**
 * Simulate AI scoring (damage detection, cost estimation, fraud scoring)
 */
async function runAiScoring(claimId: number, metrics: PerformanceMetrics): Promise<void> {
  const scoringTasks = [
    { endpoint: "aiScoring.detectDamage", method: "detectDamage" },
    { endpoint: "aiScoring.estimateCost", method: "estimateCost" },
    { endpoint: "aiScoring.scoreFraud", method: "scoreFraud" },
  ];
  
  await Promise.all(
    scoringTasks.map(async (task) => {
      const startTime = performance.now();
      
      try {
        const response = await fetch(`${DEFAULT_CONFIG.baseUrl}/api/trpc/${task.endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${DEFAULT_CONFIG.apiKey}`,
          },
          body: JSON.stringify({ json: { claimId } }),
        });
        
        const endTime = performance.now();
        const latency = endTime - startTime;
        
        if (!response.ok) {
          metrics.recordError(task.method, `HTTP ${response.status}`);
          return;
        }
        
        await response.json();
        metrics.recordSuccess(task.method, latency);
      } catch (error) {
        metrics.recordError(task.method, error instanceof Error ? error.message : "Unknown error");
      }
    })
  );
}

/**
 * Simulate quote submission
 */
async function submitQuote(quoteData: any, metrics: PerformanceMetrics): Promise<void> {
  const startTime = performance.now();
  
  try {
    const response = await fetch(`${DEFAULT_CONFIG.baseUrl}/api/trpc/quotes.submitQuote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEFAULT_CONFIG.apiKey}`,
      },
      body: JSON.stringify({ json: quoteData }),
    });
    
    const endTime = performance.now();
    const latency = endTime - startTime;
    
    if (!response.ok) {
      metrics.recordError("submitQuote", `HTTP ${response.status}`);
      return;
    }
    
    await response.json();
    metrics.recordSuccess("submitQuote", latency);
  } catch (error) {
    metrics.recordError("submitQuote", error instanceof Error ? error.message : "Unknown error");
  }
}

/**
 * Simulate workflow state transition
 */
async function transitionWorkflow(claimId: number, toState: string, metrics: PerformanceMetrics): Promise<void> {
  const startTime = performance.now();
  
  try {
    const response = await fetch(`${DEFAULT_CONFIG.baseUrl}/api/trpc/workflow.transition`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEFAULT_CONFIG.apiKey}`,
      },
      body: JSON.stringify({ json: { claimId, toState } }),
    });
    
    const endTime = performance.now();
    const latency = endTime - startTime;
    
    if (!response.ok) {
      metrics.recordError("workflowTransition", `HTTP ${response.status}`);
      return;
    }
    
    await response.json();
    metrics.recordSuccess("workflowTransition", latency);
  } catch (error) {
    metrics.recordError("workflowTransition", error instanceof Error ? error.message : "Unknown error");
  }
}

/**
 * Process single claim through complete workflow
 */
async function processClaimWorkflow(claimData: any, metrics: PerformanceMetrics): Promise<void> {
  // 1. Submit claim
  const claimId = await submitClaim(claimData, metrics);
  if (!claimId) return;
  
  // 2. Run AI scoring (parallel)
  await runAiScoring(claimId, metrics);
  
  // 3. Submit quotes (3 quotes per claim)
  const quotes = generateQuoteBatch([claimId], 3);
  await Promise.all(quotes.map(quote => submitQuote(quote, metrics)));
  
  // 4. Workflow transitions
  const transitions = ["pending_assessment", "under_review", "approved"];
  for (const state of transitions) {
    await transitionWorkflow(claimId, state, metrics);
  }
}

/**
 * Run load test with parallel execution
 */
async function runLoadTest(config: LoadTestConfig): Promise<PerformanceMetrics> {
  console.log(`\n🚀 Starting load test:`);
  console.log(`   Total claims: ${config.totalClaims}`);
  console.log(`   Concurrency: ${config.concurrency}`);
  console.log(`   Base URL: ${config.baseUrl}\n`);
  
  const metrics = new PerformanceMetrics();
  const testStartTime = performance.now();
  
  // Generate all claims upfront
  const claims = generateClaimBatch(config.tenantId, config.totalClaims);
  
  // Process claims in batches (concurrency control)
  for (let i = 0; i < claims.length; i += config.concurrency) {
    const batch = claims.slice(i, i + config.concurrency);
    const batchNumber = Math.floor(i / config.concurrency) + 1;
    const totalBatches = Math.ceil(claims.length / config.concurrency);
    
    console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} claims)...`);
    
    await Promise.all(
      batch.map(claim => processClaimWorkflow(claim, metrics))
    );
    
    // Progress update
    const processed = Math.min(i + config.concurrency, claims.length);
    const progress = ((processed / claims.length) * 100).toFixed(1);
    console.log(`   ✓ Progress: ${processed}/${claims.length} (${progress}%)`);
  }
  
  const testEndTime = performance.now();
  const totalDuration = (testEndTime - testStartTime) / 1000; // seconds
  
  metrics.setTotalDuration(totalDuration);
  
  console.log(`\n✅ Load test complete in ${totalDuration.toFixed(2)}s\n`);
  
  return metrics;
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };
  
  // Parse command line arguments
  for (const arg of args) {
    const [key, value] = arg.split("=");
    if (key === "--claims") config.totalClaims = parseInt(value);
    if (key === "--concurrency") config.concurrency = parseInt(value);
    if (key === "--tenant") config.tenantId = parseInt(value);
    if (key === "--url") config.baseUrl = value;
  }
  
  // Run load test
  const metrics = await runLoadTest(config);
  
  // Generate report
  const report = metrics.generateReport();
  console.log(report);
  
  // Save report to file
  const fs = await import("fs/promises");
  const reportPath = `./load-test/reports/load-test-${Date.now()}.md`;
  await fs.mkdir("./load-test/reports", { recursive: true });
  await fs.writeFile(reportPath, report);
  console.log(`\n📄 Report saved to: ${reportPath}\n`);
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { runLoadTest, processClaimWorkflow };
