# Load Test Harness

Comprehensive load testing infrastructure for KINGA AutoVerify AI system.

## Overview

This load test harness simulates production workload to measure system performance under stress:

- **1000 claim submissions** with realistic vehicle and damage data
- **Parallel AI scoring calls** (damage detection, cost estimation, fraud scoring)
- **Quote submissions** from panel beaters (3 quotes per claim)
- **Workflow state transitions** (intake → assessment → review → approval)

## Performance Metrics

The harness tracks and reports:

- **Response times**: Average, P50, P95, P99, min, max latency
- **Error rates**: By endpoint and error type
- **Throughput**: Requests per minute, claims per hour
- **Database performance**: Rows scanned, query duration (requires integration)
- **Memory usage**: Heap snapshots (requires integration)

## Installation

```bash
# Install dependencies (if not already installed)
pnpm install

# Set up environment variables
export LOAD_TEST_API_KEY="your-api-key-here"
```

## Usage

### Basic Load Test

Run with default settings (1000 claims, concurrency 10):

```bash
tsx load-test/run-load-test.ts
```

### Custom Configuration

```bash
# Test with 100 claims, concurrency 5
tsx load-test/run-load-test.ts --claims=100 --concurrency=5

# Test against specific tenant
tsx load-test/run-load-test.ts --tenant=2

# Test against custom URL
tsx load-test/run-load-test.ts --url=https://staging.example.com
```

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--claims` | Total number of claims to submit | 1000 |
| `--concurrency` | Number of parallel requests | 10 |
| `--tenant` | Tenant ID for test data | 1 |
| `--url` | Base URL of the API | http://localhost:3000 |

## Output

The harness generates two types of reports:

### 1. Console Output

Real-time progress updates during test execution:

```
🚀 Starting load test:
   Total claims: 1000
   Concurrency: 10
   Base URL: http://localhost:3000

📦 Processing batch 1/100 (10 claims)...
   ✓ Progress: 10/1000 (1.0%)

📦 Processing batch 2/100 (10 claims)...
   ✓ Progress: 20/1000 (2.0%)

...

✅ Load test complete in 245.32s
```

### 2. Markdown Report

Detailed performance report saved to `load-test/reports/load-test-{timestamp}.md`:

```markdown
# Load Test Report

**Generated:** 2026-02-18T12:30:00.000Z

---

## Overall Summary

| Metric | Value |
|--------|-------|
| Total Requests | 4000 |
| Successful Requests | 3950 |
| Failed Requests | 50 |
| Error Rate | 1.25% |
| Test Duration | 245.32s |
| Throughput | 978.45 req/min |

## Latency Statistics

| Metric | Value (ms) |
|--------|------------|
| Average Latency | 125.34 |
| P50 Latency | 98.12 |
| P95 Latency | 287.45 |
| P99 Latency | 456.78 |

## Endpoint Performance

### submitClaim

| Metric | Value |
|--------|-------|
| Total Requests | 1000 |
| Successful | 990 |
| Failed | 10 |
| Error Rate | 1.00% |
| Avg Latency | 145.23ms |
| P95 Latency | 298.45ms |
| P99 Latency | 478.12ms |

...

## Recommendations

- ✅ **System performing well**: Error rate low, latency acceptable, throughput healthy.
```

## Architecture

### Components

1. **data-generator.ts**: Generates realistic test data
   - `generateClaim()`: Creates claim with vehicle, damage, claimant data
   - `generateQuote()`: Creates panel beater quote with line items
   - `generateClaimBatch()`: Batch claim generation
   - `generateQuoteBatch()`: Batch quote generation

2. **run-load-test.ts**: Main load test orchestrator
   - `submitClaim()`: Simulates claim submission
   - `runAiScoring()`: Simulates parallel AI scoring calls
   - `submitQuote()`: Simulates quote submission
   - `transitionWorkflow()`: Simulates workflow state transitions
   - `processClaimWorkflow()`: Complete workflow simulation
   - `runLoadTest()`: Main test execution with concurrency control

3. **metrics-collector.ts**: Performance metrics tracking
   - `recordSuccess()`: Records successful request with latency
   - `recordError()`: Records failed request with error message
   - `calculateEndpointStats()`: Computes statistics per endpoint
   - `calculateOverallStats()`: Computes overall statistics
   - `generateReport()`: Generates Markdown report
   - `exportJSON()`: Exports metrics as JSON

### Workflow Simulation

Each claim goes through the following workflow:

```
1. Submit Claim
   ↓
2. AI Scoring (parallel)
   - Damage Detection
   - Cost Estimation
   - Fraud Scoring
   ↓
3. Quote Submissions (3 quotes)
   ↓
4. Workflow Transitions
   - pending_intake → pending_assessment
   - pending_assessment → under_review
   - under_review → approved
```

## Interpreting Results

### Error Rate

- **< 1%**: Excellent
- **1-5%**: Good (investigate errors)
- **> 5%**: Poor (requires immediate attention)

### P95 Latency

- **< 200ms**: Excellent
- **200-500ms**: Good
- **500-1000ms**: Acceptable
- **> 1000ms**: Poor (optimization needed)

### Throughput

- **> 100 req/min**: Good for production
- **60-100 req/min**: Acceptable
- **< 60 req/min**: May not handle production load

## Troubleshooting

### High Error Rate

1. Check API endpoint availability
2. Verify authentication (LOAD_TEST_API_KEY)
3. Review error messages in report
4. Check database connection limits

### High Latency

1. Check database query performance
2. Review AI scoring service response times
3. Consider adding caching
4. Optimize slow endpoints

### Low Throughput

1. Increase concurrency (--concurrency=20)
2. Scale database connections
3. Add load balancing
4. Optimize database indexes

## Future Enhancements

- [ ] Database query profiling integration
- [ ] Memory usage tracking with heap snapshots
- [ ] Real-time dashboard with live metrics
- [ ] Automated performance regression detection
- [ ] Integration with CI/CD pipeline
- [ ] Distributed load testing across multiple nodes

## License

Internal use only - KINGA AutoVerify AI
