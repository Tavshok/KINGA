/**
 * Dashboard Endpoints CI Audit Script
 * 
 * CI-ready version of dashboard audit that:
 * - Fails build on integrity violations
 * - Generates JSON artifact for CI consumption
 * - Returns appropriate exit codes
 * 
 * Exit Codes:
 * - 0: All checks passed
 * - 1: Critical failures detected (FAIL status, mock data, N+1 patterns)
 * - 2: Script execution error
 * 
 * Usage: pnpm tsx scripts/dashboard-audit-ci.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DashboardAudit {
  dashboardName: string;
  routerFile: string;
  procedures: string[];
  dataSourceTables: string[];
  queryHealth: 'PASS' | 'WARN' | 'FAIL';
  queryHealthDetails: string[];
  indexRequired: boolean;
  indexDetails: string[];
  mockData: boolean;
  mockDataDetails: string[];
  performanceRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  performanceRiskDetails: string[];
  fixRequired: boolean;
  fixDetails: string[];
  n1Patterns: string[];
}

interface CIAuditResult {
  success: boolean;
  timestamp: string;
  summary: {
    totalDashboards: number;
    passCount: number;
    warnCount: number;
    failCount: number;
    mockDataCount: number;
    n1PatternCount: number;
    highRiskCount: number;
  };
  violations: {
    failedDashboards: string[];
    mockDataDashboards: string[];
    n1PatternDashboards: string[];
  };
  dashboards: DashboardAudit[];
  exitCode: number;
}

/**
 * Dashboard to router mapping
 */
const DASHBOARD_ROUTERS: Record<string, { file: string; procedures: string[] }> = {
  'Overview': { file: 'analytics.ts', procedures: ['getExecutiveKPIs', 'getOverviewMetrics'] },
  'Analytics': { file: 'analytics.ts', procedures: ['getKPIs', 'getClaimsByComplexity', 'getSLACompliance', 'getFraudMetrics', 'getCostSavings'] },
  'Critical Alerts': { file: 'analytics.ts', procedures: ['getCriticalAlerts', 'getHighRiskClaims'] },
  'Assessors': { file: 'analytics.ts', procedures: ['getAssessorPerformance', 'getAssessorLeaderboard'] },
  'Panel Beaters': { file: 'panel-beater-analytics.ts', procedures: ['getAllPerformance', 'getPerformance', 'getTopPanelBeaters', 'getTrends', 'comparePanelBeaters'] },
  'Financials': { file: 'analytics.ts', procedures: ['getFinancialMetrics', 'getCostSavings', 'getRevenueAnalytics'] },
  'Governance': { file: 'governance-dashboard.ts', procedures: ['getOverrideMetrics', 'getSegregationMetrics', 'getRoleChangeMetrics'] },
  'Executive': { file: 'analytics.ts', procedures: ['getExecutiveKPIs', 'getExecutiveDashboard', 'getStrategicInsights'] },
};

/**
 * Known indexed columns (updated with primary keys and new indexes)
 */
const INDEXED_COLUMNS = new Set([
  // Claims table
  'claims.id',
  'claims.tenantId',
  'claims.claimantId',
  'claims.assignedAssessorId',
  'claims.assignedPanelBeaterId',
  'claims.status',
  'claims.workflowState',
  'claims.createdAt',
  
  // Users table
  'users.id',
  'users.tenantId',
  'users.email',
  'users.openId',
  
  // AI Assessments
  'aiAssessments.id',
  'aiAssessments.claimId',
  
  // Assessor Evaluations
  'assessorEvaluations.id',
  'assessorEvaluations.claimId',
  
  // Panel Beaters
  'panelBeaters.id',
  
  // Panel Beater Quotes
  'panelBeaterQuotes.id',
  'panelBeaterQuotes.claimId',
  'panelBeaterQuotes.panelBeaterId',
  
  // Workflow Audit Trail
  'workflowAuditTrail.id',
  'workflowAuditTrail.claimId',
  'workflowAuditTrail.tenantId',
  'workflowAuditTrail.createdAt',
  
  // Claim Involvement Tracking
  'claimInvolvementTracking.id',
  'claimInvolvementTracking.claimId',
  
  // Role Assignment Audit
  'roleAssignmentAudit.id',
]);

/**
 * Analyze router file for dashboard audit
 */
function analyzeDashboardRouter(dashboardName: string, routerPath: string, procedures: string[]): DashboardAudit {
  const audit: DashboardAudit = {
    dashboardName,
    routerFile: path.basename(routerPath),
    procedures,
    dataSourceTables: [],
    queryHealth: 'PASS',
    queryHealthDetails: [],
    indexRequired: false,
    indexDetails: [],
    mockData: false,
    mockDataDetails: [],
    performanceRisk: 'LOW',
    performanceRiskDetails: [],
    fixRequired: false,
    fixDetails: [],
    n1Patterns: [],
  };

  if (!fs.existsSync(routerPath)) {
    audit.queryHealth = 'FAIL';
    audit.queryHealthDetails.push(`Router file not found: ${routerPath}`);
    audit.performanceRisk = 'HIGH';
    audit.fixRequired = true;
    return audit;
  }

  const content = fs.readFileSync(routerPath, 'utf-8');

  // Extract data source tables
  const tableMatches = content.match(/from\s+\(\s*(\w+)\s*\)/g) || [];
  audit.dataSourceTables = Array.from(new Set(
    tableMatches.map(m => m.match(/from\s+\(\s*(\w+)\s*\)/)?.[1] || '')
  )).filter(Boolean);

  // Check for mock data patterns
  const mockPatterns = [
    /return\s+\[[\s\S]*?\{[\s\S]*?name:\s*['"].*?['"]/,  // Hardcoded arrays with objects
    /const\s+\w+\s*=\s*\[[\s\S]*?\{[\s\S]*?id:\s*\d+/,   // Hardcoded data arrays
    /\/\/\s*TODO.*mock/i,                                  // TODO comments mentioning mock
    /\/\/\s*FIXME.*mock/i,                                 // FIXME comments mentioning mock
  ];

  for (const pattern of mockPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      // Exclude null safety helpers
      const isSafetyHelper = matches[0].includes('safeNumber') || 
                             matches[0].includes('safeArray') || 
                             matches[0].includes('safeString');
      if (!isSafetyHelper) {
        audit.mockData = true;
        audit.mockDataDetails.push(`Found potential mock data pattern`);
      }
    }
  }

  // Check for N+1 patterns (excluding consolidated queries)
  const n1Patterns = content.match(/for\s*\(.*?\)\s*\{[\s\S]*?await\s+db\.(query|select|execute)\s*\(/g) || [];
  
  for (const pattern of n1Patterns) {
    // Exclude consolidated queries with UNION, CTE, or multiple aggregations
    const isConsolidated = pattern.includes('UNION ALL') || 
                          pattern.includes('WITH ') ||
                          (pattern.match(/COUNT|SUM|AVG|MIN|MAX/g) || []).length > 1;
    
    if (!isConsolidated) {
      audit.n1Patterns.push('N+1 query detected in loop');
    }
  }

  // Check for unindexed joins
  const joinPattern = /(?:left|inner|right)?Join\s*\(\s*(\w+)\s*,\s*eq\s*\(\s*(\w+\.\w+)\s*,\s*(\w+\.\w+)\s*\)/gi;
  const joins = Array.from(content.matchAll(joinPattern));

  for (const join of joins) {
    const leftColumn = join[2];
    const rightColumn = join[3];
    
    const leftIndexed = INDEXED_COLUMNS.has(leftColumn);
    const rightIndexed = INDEXED_COLUMNS.has(rightColumn);
    
    if (!leftIndexed && !rightIndexed) {
      audit.indexRequired = true;
      audit.indexDetails.push(`leftJoin on ${leftColumn} = ${rightColumn} (neither column indexed)`);
    }
  }

  // Check for groupBy syntax
  const groupByPattern = /groupBy\s*\(\s*([^)]+)\s*\)/g;
  const groupBys = Array.from(content.matchAll(groupByPattern));
  
  for (const groupBy of groupBys) {
    const args = groupBy[1];
    if (!args.includes('sql`') && !args.includes('sql.raw')) {
      audit.queryHealthDetails.push(`groupBy without sql template literal: ${args.substring(0, 50)}...`);
    }
  }

  // Check for null safety
  const optionalChainingCount = (content.match(/\?\./g) || []).length;
  const nullishCoalescingCount = (content.match(/\?\?/g) || []).length;
  
  if (optionalChainingCount + nullishCoalescingCount < 10) {
    audit.queryHealthDetails.push(`Limited null safety: ${optionalChainingCount} optional chaining, ${nullishCoalescingCount} nullish coalescing`);
  }

  // Determine overall health status
  if (audit.mockData || audit.n1Patterns.length > 0) {
    audit.queryHealth = 'FAIL';
    audit.performanceRisk = 'HIGH';
    audit.fixRequired = true;
  } else if (audit.indexRequired || audit.queryHealthDetails.length > 0) {
    audit.queryHealth = 'WARN';
    audit.performanceRisk = 'MEDIUM';
  }

  // Add fix details
  if (audit.mockData) {
    audit.fixDetails.push('Replace mock data with real DB queries');
  }
  if (audit.n1Patterns.length > 0) {
    audit.fixDetails.push('Refactor to use batch queries or joins to eliminate N+1 patterns');
  }
  if (audit.indexRequired) {
    audit.fixDetails.push('Add missing indexes on join columns');
  }

  return audit;
}

/**
 * Run CI audit
 */
async function runCIAudit(): Promise<CIAuditResult> {
  console.log('🔍 Dashboard Endpoints CI Audit');
  console.log('================================\n');

  const dashboards: DashboardAudit[] = [];
  const routersDir = path.join(__dirname, '../server/routers');

  for (const [dashboardName, config] of Object.entries(DASHBOARD_ROUTERS)) {
    console.log(`📊 Auditing: ${dashboardName}...`);
    
    const routerPath = path.join(routersDir, config.file);
    const audit = analyzeDashboardRouter(dashboardName, routerPath, config.procedures);
    dashboards.push(audit);
    
    console.log(`   Status: ${audit.queryHealth}`);
    if (audit.mockData) {
      console.log(`   ❌ Mock data detected`);
    }
    if (audit.n1Patterns.length > 0) {
      console.log(`   ❌ N+1 patterns detected: ${audit.n1Patterns.length}`);
    }
  }

  // Calculate summary
  const summary = {
    totalDashboards: dashboards.length,
    passCount: dashboards.filter(d => d.queryHealth === 'PASS').length,
    warnCount: dashboards.filter(d => d.queryHealth === 'WARN').length,
    failCount: dashboards.filter(d => d.queryHealth === 'FAIL').length,
    mockDataCount: dashboards.filter(d => d.mockData).length,
    n1PatternCount: dashboards.filter(d => d.n1Patterns.length > 0).length,
    highRiskCount: dashboards.filter(d => d.performanceRisk === 'HIGH').length,
  };

  // Identify violations
  const violations = {
    failedDashboards: dashboards.filter(d => d.queryHealth === 'FAIL').map(d => d.dashboardName),
    mockDataDashboards: dashboards.filter(d => d.mockData).map(d => d.dashboardName),
    n1PatternDashboards: dashboards.filter(d => d.n1Patterns.length > 0).map(d => d.dashboardName),
  };

  // Determine success and exit code
  const hasViolations = summary.failCount > 0 || summary.mockDataCount > 0 || summary.n1PatternCount > 0;
  const success = !hasViolations;
  const exitCode = hasViolations ? 1 : 0;

  const result: CIAuditResult = {
    success,
    timestamp: new Date().toISOString(),
    summary,
    violations,
    dashboards,
    exitCode,
  };

  // Print summary
  console.log('\n📈 Summary:');
  console.log(`   Total Dashboards: ${summary.totalDashboards}`);
  console.log(`   PASS: ${summary.passCount}`);
  console.log(`   WARN: ${summary.warnCount}`);
  console.log(`   FAIL: ${summary.failCount}`);
  console.log(`   Mock Data: ${summary.mockDataCount}`);
  console.log(`   N+1 Patterns: ${summary.n1PatternCount}`);
  console.log(`   High Risk: ${summary.highRiskCount}`);

  if (hasViolations) {
    console.log('\n❌ CI AUDIT FAILED - Integrity violations detected:');
    if (violations.failedDashboards.length > 0) {
      console.log(`   Failed dashboards: ${violations.failedDashboards.join(', ')}`);
    }
    if (violations.mockDataDashboards.length > 0) {
      console.log(`   Mock data detected: ${violations.mockDataDashboards.join(', ')}`);
    }
    if (violations.n1PatternDashboards.length > 0) {
      console.log(`   N+1 patterns detected: ${violations.n1PatternDashboards.join(', ')}`);
    }
  } else {
    console.log('\n✅ CI AUDIT PASSED - All dashboards meet integrity requirements');
  }

  return result;
}

/**
 * Main execution
 */
async function main() {
  try {
    const result = await runCIAudit();
    
    // Save JSON artifact
    const artifactPath = path.join(__dirname, '../DASHBOARD_AUDIT_CI_RESULT.json');
    fs.writeFileSync(artifactPath, JSON.stringify(result, null, 2));
    console.log(`\n✅ JSON artifact saved: ${artifactPath}`);
    
    // Exit with appropriate code
    process.exit(result.exitCode);
  } catch (error) {
    console.error('\n❌ CI audit script error:', error);
    process.exit(2);
  }
}

main();
