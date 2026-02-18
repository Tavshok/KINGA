/**
 * Performance Metrics Collector
 * 
 * Tracks and analyzes load test metrics:
 * - Response times (average, P50, P95, P99)
 * - Error rates by endpoint
 * - Throughput (requests per minute)
 * - Database performance (placeholder for future integration)
 */

interface EndpointMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  latencies: number[];
  errors: Map<string, number>;
}

export class PerformanceMetrics {
  private endpoints: Map<string, EndpointMetrics> = new Map();
  private totalDuration: number = 0;
  private startTime: number = Date.now();
  
  constructor() {}
  
  /**
   * Record successful request
   */
  recordSuccess(endpoint: string, latency: number): void {
    const metrics = this.getOrCreateEndpoint(endpoint);
    metrics.totalRequests++;
    metrics.successfulRequests++;
    metrics.latencies.push(latency);
  }
  
  /**
   * Record failed request
   */
  recordError(endpoint: string, errorMessage: string): void {
    const metrics = this.getOrCreateEndpoint(endpoint);
    metrics.totalRequests++;
    metrics.failedRequests++;
    
    const errorCount = metrics.errors.get(errorMessage) || 0;
    metrics.errors.set(errorMessage, errorCount + 1);
  }
  
  /**
   * Set total test duration
   */
  setTotalDuration(durationSeconds: number): void {
    this.totalDuration = durationSeconds;
  }
  
  /**
   * Get or create endpoint metrics
   */
  private getOrCreateEndpoint(endpoint: string): EndpointMetrics {
    if (!this.endpoints.has(endpoint)) {
      this.endpoints.set(endpoint, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        latencies: [],
        errors: new Map(),
      });
    }
    return this.endpoints.get(endpoint)!;
  }
  
  /**
   * Calculate percentile
   */
  private calculatePercentile(sortedLatencies: number[], percentile: number): number {
    if (sortedLatencies.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedLatencies.length) - 1;
    return sortedLatencies[Math.max(0, index)];
  }
  
  /**
   * Calculate statistics for endpoint
   */
  private calculateEndpointStats(metrics: EndpointMetrics) {
    const sortedLatencies = [...metrics.latencies].sort((a, b) => a - b);
    const avgLatency = sortedLatencies.length > 0
      ? sortedLatencies.reduce((sum, lat) => sum + lat, 0) / sortedLatencies.length
      : 0;
    
    return {
      totalRequests: metrics.totalRequests,
      successfulRequests: metrics.successfulRequests,
      failedRequests: metrics.failedRequests,
      errorRate: metrics.totalRequests > 0
        ? (metrics.failedRequests / metrics.totalRequests) * 100
        : 0,
      avgLatency,
      p50Latency: this.calculatePercentile(sortedLatencies, 50),
      p95Latency: this.calculatePercentile(sortedLatencies, 95),
      p99Latency: this.calculatePercentile(sortedLatencies, 99),
      minLatency: sortedLatencies.length > 0 ? sortedLatencies[0] : 0,
      maxLatency: sortedLatencies.length > 0 ? sortedLatencies[sortedLatencies.length - 1] : 0,
      errors: Array.from(metrics.errors.entries()).map(([message, count]) => ({ message, count })),
    };
  }
  
  /**
   * Calculate overall statistics
   */
  private calculateOverallStats() {
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    const allLatencies: number[] = [];
    
    for (const metrics of this.endpoints.values()) {
      totalRequests += metrics.totalRequests;
      successfulRequests += metrics.successfulRequests;
      failedRequests += metrics.failedRequests;
      allLatencies.push(...metrics.latencies);
    }
    
    const sortedLatencies = allLatencies.sort((a, b) => a - b);
    const avgLatency = sortedLatencies.length > 0
      ? sortedLatencies.reduce((sum, lat) => sum + lat, 0) / sortedLatencies.length
      : 0;
    
    const throughput = this.totalDuration > 0
      ? (totalRequests / this.totalDuration) * 60 // requests per minute
      : 0;
    
    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      errorRate: totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0,
      avgLatency,
      p50Latency: this.calculatePercentile(sortedLatencies, 50),
      p95Latency: this.calculatePercentile(sortedLatencies, 95),
      p99Latency: this.calculatePercentile(sortedLatencies, 99),
      throughput,
      duration: this.totalDuration,
    };
  }
  
  /**
   * Generate Markdown report
   */
  generateReport(): string {
    const overall = this.calculateOverallStats();
    const endpointStats = Array.from(this.endpoints.entries()).map(([endpoint, metrics]) => ({
      endpoint,
      stats: this.calculateEndpointStats(metrics),
    }));
    
    let report = `# Load Test Report\n\n`;
    report += `**Generated:** ${new Date().toISOString()}\n\n`;
    report += `---\n\n`;
    
    // Overall Summary
    report += `## Overall Summary\n\n`;
    report += `| Metric | Value |\n`;
    report += `|--------|-------|\n`;
    report += `| Total Requests | ${overall.totalRequests} |\n`;
    report += `| Successful Requests | ${overall.successfulRequests} |\n`;
    report += `| Failed Requests | ${overall.failedRequests} |\n`;
    report += `| Error Rate | ${overall.errorRate.toFixed(2)}% |\n`;
    report += `| Test Duration | ${overall.duration.toFixed(2)}s |\n`;
    report += `| Throughput | ${overall.throughput.toFixed(2)} req/min |\n\n`;
    
    // Latency Statistics
    report += `## Latency Statistics\n\n`;
    report += `| Metric | Value (ms) |\n`;
    report += `|--------|------------|\n`;
    report += `| Average Latency | ${overall.avgLatency.toFixed(2)} |\n`;
    report += `| P50 Latency | ${overall.p50Latency.toFixed(2)} |\n`;
    report += `| P95 Latency | ${overall.p95Latency.toFixed(2)} |\n`;
    report += `| P99 Latency | ${overall.p99Latency.toFixed(2)} |\n\n`;
    
    // Endpoint Breakdown
    report += `## Endpoint Performance\n\n`;
    for (const { endpoint, stats } of endpointStats) {
      report += `### ${endpoint}\n\n`;
      report += `| Metric | Value |\n`;
      report += `|--------|-------|\n`;
      report += `| Total Requests | ${stats.totalRequests} |\n`;
      report += `| Successful | ${stats.successfulRequests} |\n`;
      report += `| Failed | ${stats.failedRequests} |\n`;
      report += `| Error Rate | ${stats.errorRate.toFixed(2)}% |\n`;
      report += `| Avg Latency | ${stats.avgLatency.toFixed(2)}ms |\n`;
      report += `| P95 Latency | ${stats.p95Latency.toFixed(2)}ms |\n`;
      report += `| P99 Latency | ${stats.p99Latency.toFixed(2)}ms |\n`;
      report += `| Min Latency | ${stats.minLatency.toFixed(2)}ms |\n`;
      report += `| Max Latency | ${stats.maxLatency.toFixed(2)}ms |\n\n`;
      
      if (stats.errors.length > 0) {
        report += `**Errors:**\n\n`;
        for (const error of stats.errors) {
          report += `- ${error.message}: ${error.count} occurrences\n`;
        }
        report += `\n`;
      }
    }
    
    // Recommendations
    report += `## Recommendations\n\n`;
    if (overall.errorRate > 5) {
      report += `- ⚠️ **High error rate (${overall.errorRate.toFixed(2)}%)**: Investigate failed requests and fix underlying issues.\n`;
    }
    if (overall.p95Latency > 1000) {
      report += `- ⚠️ **High P95 latency (${overall.p95Latency.toFixed(2)}ms)**: Consider optimizing slow endpoints or adding caching.\n`;
    }
    if (overall.throughput < 60) {
      report += `- ⚠️ **Low throughput (${overall.throughput.toFixed(2)} req/min)**: System may not handle production load. Consider scaling.\n`;
    }
    if (overall.errorRate < 1 && overall.p95Latency < 500 && overall.throughput > 100) {
      report += `- ✅ **System performing well**: Error rate low, latency acceptable, throughput healthy.\n`;
    }
    
    return report;
  }
  
  /**
   * Export metrics as JSON
   */
  exportJSON(): string {
    const overall = this.calculateOverallStats();
    const endpointStats = Array.from(this.endpoints.entries()).map(([endpoint, metrics]) => ({
      endpoint,
      stats: this.calculateEndpointStats(metrics),
    }));
    
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      overall,
      endpoints: endpointStats,
    }, null, 2);
  }
}
