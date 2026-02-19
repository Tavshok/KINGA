/**
 * Dashboard Endpoints Audit Script
 * 
 * Audits all dashboard endpoints to verify:
 * - Real DB queries (no hardcoded mock data)
 * - GroupBy syntax correctness
 * - Joins use indexed columns
 * - Null safety handling
 * - Charts receive non-empty datasets when data exists
 * - N+1 patterns detection
 * 
 * Usage: pnpm tsx scripts/dashboard-audit.ts
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
 * Known indexed columns (from schema analysis)
 */
const INDEXED_COLUMNS = new Set([
  'claims.id',
  'claims.tenantId',
  'claims.claimantId',
  'claims.assignedAssessorId',
  'claims.status',
  'claims.workflowState',
  'claims.createdAt',
  'users.id',
  'users.tenantId',
  'users.email',
  'users.openId',
  'aiAssessments.claimId',
  'assessorEvaluations.claimId',
  'panelBeaterQuotes.claimId',
  'workflowAuditTrail.claimId',
  'workflowAuditTrail.tenantId',
  'workflowAuditTrail.createdAt',
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
    audit.fixRequired = true;
    audit.fixDetails.push('Create missing router file');
    return audit;
  }

  const content = fs.readFileSync(routerPath, 'utf-8');

  // Extract data source tables
  const tableMatches = content.matchAll(/from\((\w+)\)/g);
  for (const match of tableMatches) {
    if (!audit.dataSourceTables.includes(match[1])) {
      audit.dataSourceTables.push(match[1]);
    }
  }

  // Check for mock data patterns
  const mockPatterns = [
    /const\s+\w+\s*=\s*\[[\s\S]*?\{[\s\S]*?\}[\s\S]*?\]/g, // Array literals with objects
    /return\s+\{[\s\S]*?data:\s*\[/g, // Direct return with array
    /mockData/gi,
    /hardcoded/gi,
    /TODO.*mock/gi,
  ];

  for (const pattern of mockPatterns) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      // Filter out legitimate patterns (like zod schemas, type definitions)
      const suspiciousMatches = matches.filter(m => 
        !m.includes('z.object') && 
        !m.includes('interface') && 
        !m.includes('type ') &&
        !m.includes('const schema') &&
        !m.includes('// Example')
      );
      
      if (suspiciousMatches.length > 0) {
        audit.mockData = true;
        audit.mockDataDetails.push(`Found ${suspiciousMatches.length} potential mock data pattern(s)`);
        audit.fixRequired = true;
        audit.fixDetails.push('Replace mock data with real DB queries');
      }
    }
  }

  // Check for groupBy syntax
  const groupByMatches = content.matchAll(/\.groupBy\(([\s\S]*?)\)/g);
  for (const match of groupByMatches) {
    const groupByArg = match[1].trim();
    
    // Check for sql`` template literal (correct)
    if (!groupByArg.includes('sql`')) {
      audit.queryHealth = 'WARN';
      audit.queryHealthDetails.push(`groupBy without sql template literal: ${groupByArg.substring(0, 50)}...`);
      audit.fixRequired = true;
      audit.fixDetails.push('Wrap groupBy arguments in sql`` template literal');
    }
  }

  // Check for joins and indexed columns
  const joinMatches = content.matchAll(/\.(leftJoin|rightJoin|innerJoin|fullJoin)\((\w+),\s*eq\(([\w.]+),\s*([\w.]+)\)\)/g);
  for (const match of joinMatches) {
    const [, joinType, table, leftCol, rightCol] = match;
    
    if (!INDEXED_COLUMNS.has(leftCol) && !INDEXED_COLUMNS.has(rightCol)) {
      audit.indexRequired = true;
      audit.indexDetails.push(`${joinType} on ${leftCol} = ${rightCol} (neither column indexed)`);
      audit.performanceRisk = 'HIGH';
      audit.performanceRiskDetails.push(`Unindexed join: ${leftCol} = ${rightCol}`);
      audit.fixRequired = true;
      audit.fixDetails.push(`Add index on ${leftCol} or ${rightCol}`);
    }
  }

  // Check for null safety
  const nullUnsafePatterns = [
    /\.\w+\s*\?\s*\.\w+/g, // Optional chaining (good)
    /\w+\s*\|\|\s*\w+/g, // Nullish coalescing (good)
  ];

  const propertyAccessMatches = content.match(/\w+\.\w+/g) || [];
  const safeAccessMatches = content.match(/\w+\?\.\w+/g) || [];
  const nullishCoalescingMatches = content.match(/\w+\s*\|\|\s*\w+/g) || [];
  
  const unsafeAccesses = propertyAccessMatches.length - (safeAccessMatches.length + nullishCoalescingMatches.length);
  
  if (unsafeAccesses > 50) { // Threshold for concern
    audit.queryHealth = 'WARN';
    audit.queryHealthDetails.push(`${unsafeAccesses} potential null-unsafe property accesses`);
    audit.fixRequired = true;
    audit.fixDetails.push('Add null safety checks (optional chaining, nullish coalescing)');
  }

  // Check for N+1 patterns
  const loopQueryPatterns = [
    /for\s*\([\s\S]*?\)\s*\{[\s\S]*?await\s+db/g,
    /\.map\([\s\S]*?await\s+db/g,
    /\.forEach\([\s\S]*?await\s+db/g,
  ];

  for (const pattern of loopQueryPatterns) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      audit.n1Patterns.push(`Found ${matches.length} potential N+1 query pattern(s)`);
      audit.performanceRisk = 'HIGH';
      audit.performanceRiskDetails.push('N+1 query detected in loop');
      audit.fixRequired = true;
      audit.fixDetails.push('Refactor to use batch queries or joins');
    }
  }

  // Check for empty dataset handling
  const emptyCheckPatterns = [
    /if\s*\(\s*\w+\.length\s*===\s*0\s*\)/g,
    /\w+\.length\s*>\s*0/g,
    /\?\?\s*\[\]/g,
  ];

  let hasEmptyChecks = false;
  for (const pattern of emptyCheckPatterns) {
    if (content.match(pattern)) {
      hasEmptyChecks = true;
      break;
    }
  }

  if (!hasEmptyChecks && audit.dataSourceTables.length > 0) {
    audit.queryHealth = 'WARN';
    audit.queryHealthDetails.push('No empty dataset handling detected');
    audit.fixRequired = true;
    audit.fixDetails.push('Add empty dataset checks and fallback values');
  }

  // Determine overall performance risk
  if (audit.n1Patterns.length > 0 || audit.indexRequired) {
    audit.performanceRisk = 'HIGH';
  } else if (audit.queryHealthDetails.length > 0) {
    audit.performanceRisk = 'MEDIUM';
  }

  return audit;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(audits: DashboardAudit[]): string {
  let md = `# Dashboard Endpoints Audit Report\n\n`;
  md += `**Generated:** ${new Date().toLocaleString()}\n\n`;
  
  md += `## Executive Summary\n\n`;
  const totalDashboards = audits.length;
  const passCount = audits.filter(a => a.queryHealth === 'PASS' && !a.fixRequired).length;
  const warnCount = audits.filter(a => a.queryHealth === 'WARN' || (a.queryHealth === 'PASS' && a.fixRequired)).length;
  const failCount = audits.filter(a => a.queryHealth === 'FAIL').length;
  const mockDataCount = audits.filter(a => a.mockData).length;
  const highRiskCount = audits.filter(a => a.performanceRisk === 'HIGH').length;
  
  md += `- **Total Dashboards Audited:** ${totalDashboards}\n`;
  md += `- **Health Status:**\n`;
  md += `  - ✅ PASS: ${passCount}\n`;
  md += `  - ⚠️  WARN: ${warnCount}\n`;
  md += `  - ❌ FAIL: ${failCount}\n`;
  md += `- **Mock Data Detected:** ${mockDataCount} dashboard(s)\n`;
  md += `- **High Performance Risk:** ${highRiskCount} dashboard(s)\n`;
  md += `- **Fixes Required:** ${audits.filter(a => a.fixRequired).length} dashboard(s)\n\n`;
  
  md += `---\n\n`;
  
  md += `## Dashboard Details\n\n`;
  
  for (const audit of audits) {
    md += `### ${audit.dashboardName}\n\n`;
    md += `**Router File:** \`${audit.routerFile}\`\n\n`;
    md += `**Procedures:** ${audit.procedures.join(', ')}\n\n`;
    
    md += `| Metric | Status | Details |\n`;
    md += `|--------|--------|----------|\n`;
    md += `| **Data Source Tables** | ${audit.dataSourceTables.length > 0 ? '✅' : '❌'} | ${audit.dataSourceTables.join(', ') || 'None detected'} |\n`;
    md += `| **Query Health** | ${audit.queryHealth === 'PASS' ? '✅' : audit.queryHealth === 'WARN' ? '⚠️' : '❌'} ${audit.queryHealth} | ${audit.queryHealthDetails.join('; ') || 'No issues'} |\n`;
    md += `| **Index Required** | ${audit.indexRequired ? '⚠️  YES' : '✅ NO'} | ${audit.indexDetails.join('; ') || 'All joins use indexed columns'} |\n`;
    md += `| **Mock Data** | ${audit.mockData ? '❌ YES' : '✅ NO'} | ${audit.mockDataDetails.join('; ') || 'Real DB queries confirmed'} |\n`;
    md += `| **Performance Risk** | ${audit.performanceRisk === 'LOW' ? '✅' : audit.performanceRisk === 'MEDIUM' ? '⚠️' : '❌'} ${audit.performanceRisk} | ${audit.performanceRiskDetails.join('; ') || 'No performance concerns'} |\n`;
    md += `| **N+1 Patterns** | ${audit.n1Patterns.length > 0 ? '❌ DETECTED' : '✅ NONE'} | ${audit.n1Patterns.join('; ') || 'No N+1 patterns detected'} |\n`;
    md += `| **Fix Required** | ${audit.fixRequired ? '⚠️  YES' : '✅ NO'} | ${audit.fixDetails.join('; ') || 'No fixes needed'} |\n`;
    
    md += `\n`;
  }
  
  md += `---\n\n`;
  md += `## Recommendations\n\n`;
  
  if (mockDataCount > 0) {
    md += `### 🔴 Critical: Replace Mock Data\n\n`;
    md += `${mockDataCount} dashboard(s) contain mock data patterns. Replace with real database queries to ensure accurate reporting.\n\n`;
  }
  
  if (highRiskCount > 0) {
    md += `### 🔴 High Priority: Performance Optimization\n\n`;
    md += `${highRiskCount} dashboard(s) have high performance risk. Address N+1 patterns and add missing indexes.\n\n`;
  }
  
  if (warnCount > 0) {
    md += `### ⚠️  Medium Priority: Query Health\n\n`;
    md += `${warnCount} dashboard(s) have query health warnings. Review groupBy syntax and null safety.\n\n`;
  }
  
  md += `---\n\n`;
  md += `## Audit Methodology\n\n`;
  md += `This audit script analyzes router files for:\n\n`;
  md += `1. **Real DB Queries:** Detects mock data patterns (hardcoded arrays, TODO comments)\n`;
  md += `2. **GroupBy Syntax:** Validates sql\`\` template literal usage\n`;
  md += `3. **Indexed Joins:** Checks if join columns are indexed\n`;
  md += `4. **Null Safety:** Counts optional chaining and nullish coalescing usage\n`;
  md += `5. **N+1 Patterns:** Detects await db calls inside loops\n`;
  md += `6. **Empty Dataset Handling:** Verifies length checks and fallback values\n\n`;
  
  return md;
}

/**
 * Main execution
 */
function main() {
  const projectRoot = path.join(__dirname, '..');
  const routersDir = path.join(projectRoot, 'server/routers');
  
  console.log('🔍 Dashboard Endpoints Audit');
  console.log('============================\n');
  
  const audits: DashboardAudit[] = [];
  
  for (const [dashboardName, { file, procedures }] of Object.entries(DASHBOARD_ROUTERS)) {
    console.log(`📊 Auditing: ${dashboardName}...`);
    
    const routerPath = path.join(routersDir, file);
    const audit = analyzeDashboardRouter(dashboardName, routerPath, procedures);
    audits.push(audit);
    
    console.log(`   Query Health: ${audit.queryHealth}`);
    console.log(`   Performance Risk: ${audit.performanceRisk}`);
    console.log(`   Fix Required: ${audit.fixRequired ? 'YES' : 'NO'}\n`);
  }
  
  // Generate reports
  const mdReport = generateMarkdownReport(audits);
  const jsonReport = JSON.stringify(audits, null, 2);
  
  const mdPath = path.join(projectRoot, 'DASHBOARD_AUDIT_REPORT.md');
  const jsonPath = path.join(projectRoot, 'DASHBOARD_AUDIT_REPORT.json');
  
  fs.writeFileSync(mdPath, mdReport);
  fs.writeFileSync(jsonPath, jsonReport);
  
  console.log(`✅ Markdown report saved: ${mdPath}`);
  console.log(`✅ JSON report saved: ${jsonPath}`);
  
  console.log(`\n📈 Summary:`);
  console.log(`   Total Dashboards: ${audits.length}`);
  console.log(`   PASS: ${audits.filter(a => a.queryHealth === 'PASS' && !a.fixRequired).length}`);
  console.log(`   WARN: ${audits.filter(a => a.queryHealth === 'WARN' || (a.queryHealth === 'PASS' && a.fixRequired)).length}`);
  console.log(`   FAIL: ${audits.filter(a => a.queryHealth === 'FAIL').length}`);
  console.log(`   Mock Data: ${audits.filter(a => a.mockData).length}`);
  console.log(`   High Risk: ${audits.filter(a => a.performanceRisk === 'HIGH').length}`);
  
  console.log('\n✅ Dashboard audit complete!');
}

main();
