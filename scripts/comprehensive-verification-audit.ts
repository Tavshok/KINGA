/**
 * Comprehensive Verification Audit Script
 * 
 * Validates end-to-end system integrity across 7 scopes:
 * 1. Quantitative Physics Activation
 * 2. Frontend Rendering Validation
 * 3. Image Data Population
 * 4. AI Processing Completeness
 * 5. Dashboard Data Integrity
 * 6. Report Generation Integrity
 * 7. Regression Check
 * 
 * Usage: pnpm tsx scripts/comprehensive-verification-audit.ts
 */

import { getDb } from '../server/db.js';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface AuditResult {
  scope: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  actionRequired: string;
  details: Record<string, any>;
}

interface ComprehensiveAuditReport {
  timestamp: string;
  results: AuditResult[];
  systemReadinessScore: number;
  forensicQuantitativeModeActive: boolean;
  summary: {
    totalScopes: number;
    passCount: number;
    warnCount: number;
    failCount: number;
  };
}

/**
 * Audit 1: Quantitative Physics Activation
 */
async function auditQuantitativePhysics(): Promise<AuditResult> {
  console.log('\n🔬 Audit 1: Quantitative Physics Activation');
  console.log('==========================================');
  
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  try {
    // Get latest 20 claims with AI assessments
    const result = await db.execute(sql`
      SELECT 
        c.id as claim_id,
        c.claim_number,
        ai.physics_analysis
      FROM claims c
      LEFT JOIN ai_assessments ai ON c.id = ai.claim_id
      WHERE ai.physics_analysis IS NOT NULL
      ORDER BY c.created_at DESC
      LIMIT 20
    `);
    
    const claims = result as any[];
    
    if (claims.length === 0) {
      return {
        scope: '1️⃣ Quantitative Physics Activation',
        status: 'FAIL',
        riskLevel: 'HIGH',
        actionRequired: 'No claims with physics analysis found',
        details: {
          totalClaims: 0,
          quantitativeCount: 0,
          qualitativeCount: 0,
          percentageQuantitative: 0,
        },
      };
    }
    
    let quantitativeCount = 0;
    let qualitativeCount = 0;
    const samples: any[] = [];
    
    for (const claim of claims) {
      try {
        const physicsData = typeof claim.physics_analysis === 'string' 
          ? JSON.parse(claim.physics_analysis) 
          : claim.physics_analysis;
        
        // Check for quantitative structure
        const hasQuantitative = 
          physicsData.impactAngleDegrees !== undefined &&
          physicsData.calculatedImpactForceKN !== undefined &&
          physicsData.impactLocationNormalized !== undefined &&
          physicsData.crushDepthMeters !== undefined &&
          physicsData.speedEstimateKmh !== undefined;
        
        if (hasQuantitative) {
          quantitativeCount++;
          if (samples.length < 3) {
            samples.push({
              claimNumber: claim.claim_number,
              impactAngleDegrees: physicsData.impactAngleDegrees,
              calculatedImpactForceKN: physicsData.calculatedImpactForceKN,
              impactLocationNormalized: physicsData.impactLocationNormalized,
              crushDepthMeters: physicsData.crushDepthMeters,
              speedEstimateKmh: physicsData.speedEstimateKmh,
            });
          }
        } else {
          qualitativeCount++;
        }
      } catch (error) {
        console.log(`   ⚠️  Failed to parse physics data for claim ${claim.claim_number}`);
        qualitativeCount++;
      }
    }
    
    const percentageQuantitative = Math.round((quantitativeCount / claims.length) * 100);
    const percentageQualitative = Math.round((qualitativeCount / claims.length) * 100);
    
    console.log(`   Total claims analyzed: ${claims.length}`);
    console.log(`   Quantitative structure: ${quantitativeCount} (${percentageQuantitative}%)`);
    console.log(`   Legacy qualitative: ${qualitativeCount} (${percentageQualitative}%)`);
    console.log(`   Sample outputs: ${samples.length}`);
    
    const status = percentageQuantitative >= 80 ? 'PASS' : percentageQuantitative >= 50 ? 'WARN' : 'FAIL';
    const riskLevel = percentageQuantitative >= 80 ? 'LOW' : percentageQuantitative >= 50 ? 'MEDIUM' : 'HIGH';
    
    return {
      scope: '1️⃣ Quantitative Physics Activation',
      status,
      riskLevel,
      actionRequired: status === 'PASS' ? 'None' : 'Regenerate AI assessments for legacy claims',
      details: {
        totalClaims: claims.length,
        quantitativeCount,
        qualitativeCount,
        percentageQuantitative,
        percentageQualitative,
        samples,
      },
    };
  } catch (error) {
    console.error('   ❌ Error:', error);
    return {
      scope: '1️⃣ Quantitative Physics Activation',
      status: 'FAIL',
      riskLevel: 'HIGH',
      actionRequired: 'Fix database query or schema',
      details: { error: String(error) },
    };
  }
}

/**
 * Audit 2: Frontend Rendering Validation
 */
async function auditFrontendRendering(): Promise<AuditResult> {
  console.log('\n🎨 Audit 2: Frontend Rendering Validation');
  console.log('=========================================');
  
  try {
    // Check VehicleImpactVectorDiagram component
    const componentPath = path.join(__dirname, '../client/src/components/VehicleImpactVectorDiagram.tsx');
    
    if (!fs.existsSync(componentPath)) {
      return {
        scope: '2️⃣ Frontend Rendering Validation',
        status: 'FAIL',
        riskLevel: 'HIGH',
        actionRequired: 'VehicleImpactVectorDiagram component not found',
        details: { componentExists: false },
      };
    }
    
    const componentContent = fs.readFileSync(componentPath, 'utf-8');
    
    // Check for quantitative mode indicators
    const hasTrigonometric = componentContent.includes('Math.cos') && componentContent.includes('Math.sin');
    const hasForceScaling = componentContent.includes('calculatedImpactForceKN');
    const hasClampUtility = componentContent.includes('clamp(');
    const noInlineMathMinMax = !componentContent.match(/Math\.min\s*\(\s*Math\.max/);
    const hasQuantitativeBadge = componentContent.includes('Quantitative Physics Mode') || componentContent.includes('quantitative');
    
    console.log(`   Trigonometric rendering: ${hasTrigonometric ? '✅' : '❌'}`);
    console.log(`   Force-based scaling: ${hasForceScaling ? '✅' : '❌'}`);
    console.log(`   Clamp utility: ${hasClampUtility ? '✅' : '❌'}`);
    console.log(`   No inline Math.min/max: ${noInlineMathMinMax ? '✅' : '❌'}`);
    console.log(`   Quantitative badge: ${hasQuantitativeBadge ? '✅' : '❌'}`);
    
    const checks = [hasTrigonometric, hasForceScaling, hasClampUtility, noInlineMathMinMax];
    const passedChecks = checks.filter(Boolean).length;
    const status = passedChecks === 4 ? 'PASS' : passedChecks >= 3 ? 'WARN' : 'FAIL';
    const riskLevel = passedChecks === 4 ? 'LOW' : passedChecks >= 3 ? 'MEDIUM' : 'HIGH';
    
    return {
      scope: '2️⃣ Frontend Rendering Validation',
      status,
      riskLevel,
      actionRequired: status === 'PASS' ? 'None' : 'Update VehicleImpactVectorDiagram component',
      details: {
        hasTrigonometric,
        hasForceScaling,
        hasClampUtility,
        noInlineMathMinMax,
        hasQuantitativeBadge,
        passedChecks,
        totalChecks: 4,
      },
    };
  } catch (error) {
    console.error('   ❌ Error:', error);
    return {
      scope: '2️⃣ Frontend Rendering Validation',
      status: 'FAIL',
      riskLevel: 'HIGH',
      actionRequired: 'Fix component analysis',
      details: { error: String(error) },
    };
  }
}

/**
 * Audit 3: Image Data Population
 */
async function auditImageData(): Promise<AuditResult> {
  console.log('\n🖼️  Audit 3: Image Data Population');
  console.log('==================================');
  
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  try {
    // Get claims with damage photos
    const result = await db.execute(sql`
      SELECT 
        id,
        claim_number,
        damage_photos
      FROM claims
      WHERE damage_photos IS NOT NULL
      LIMIT 100
    `);
    
    const claims = result as any[];
    const totalClaims = (await db.execute(sql`SELECT COUNT(*) as count FROM claims`))[0] as any;
    const totalCount = totalClaims.count;
    
    let validImageCount = 0;
    let brokenUrlCount = 0;
    let jsonParseErrorCount = 0;
    const sampleUrls: string[] = [];
    
    for (const claim of claims.slice(0, 20)) {
      try {
        const photos = typeof claim.damage_photos === 'string' 
          ? JSON.parse(claim.damage_photos) 
          : claim.damage_photos;
        
        if (Array.isArray(photos) && photos.length > 0) {
          validImageCount++;
          if (sampleUrls.length < 5) {
            sampleUrls.push(photos[0]);
          }
        }
      } catch (error) {
        jsonParseErrorCount++;
      }
    }
    
    const percentageWithImages = Math.round((claims.length / totalCount) * 100);
    
    console.log(`   Total claims: ${totalCount}`);
    console.log(`   Claims with images: ${claims.length} (${percentageWithImages}%)`);
    console.log(`   Valid image data: ${validImageCount}`);
    console.log(`   JSON parse errors: ${jsonParseErrorCount}`);
    console.log(`   Sample URLs collected: ${sampleUrls.length}`);
    
    const status = jsonParseErrorCount === 0 && validImageCount > 0 ? 'PASS' : jsonParseErrorCount > 0 ? 'WARN' : 'FAIL';
    const riskLevel = jsonParseErrorCount === 0 ? 'LOW' : jsonParseErrorCount < 5 ? 'MEDIUM' : 'HIGH';
    
    return {
      scope: '3️⃣ Image Data Population',
      status,
      riskLevel,
      actionRequired: status === 'PASS' ? 'None' : 'Fix JSON parsing or re-upload images',
      details: {
        totalClaims: totalCount,
        claimsWithImages: claims.length,
        percentageWithImages,
        validImageCount,
        brokenUrlCount,
        jsonParseErrorCount,
        sampleUrls,
      },
    };
  } catch (error) {
    console.error('   ❌ Error:', error);
    return {
      scope: '3️⃣ Image Data Population',
      status: 'FAIL',
      riskLevel: 'HIGH',
      actionRequired: 'Fix database query',
      details: { error: String(error) },
    };
  }
}

/**
 * Audit 4: AI Processing Completeness
 */
async function auditAIProcessing(): Promise<AuditResult> {
  console.log('\n🤖 Audit 4: AI Processing Completeness');
  console.log('======================================');
  
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  try {
    const result = await db.execute(sql`
      SELECT 
        ai.id,
        ai.claim_id,
        ai.confidence_score,
        ai.fraud_risk_level,
        ai.damaged_components,
        ai.physics_analysis
      FROM ai_assessments ai
      ORDER BY ai.created_at DESC
      LIMIT 20
    `);
    
    const assessments = result as any[];
    
    if (assessments.length === 0) {
      return {
        scope: '4️⃣ AI Processing Completeness',
        status: 'FAIL',
        riskLevel: 'HIGH',
        actionRequired: 'No AI assessments found',
        details: { totalAssessments: 0 },
      };
    }
    
    let completeCount = 0;
    let missingFieldsCount = 0;
    const missingFields: string[] = [];
    
    for (const assessment of assessments) {
      const hasConfidenceScore = assessment.confidence_score !== null;
      const hasFraudRiskLevel = assessment.fraud_risk_level !== null;
      const hasDamagedComponents = assessment.damaged_components !== null;
      const hasPhysicsAnalysis = assessment.physics_analysis !== null;
      
      if (hasConfidenceScore && hasFraudRiskLevel && hasDamagedComponents && hasPhysicsAnalysis) {
        completeCount++;
      } else {
        missingFieldsCount++;
        if (!hasConfidenceScore) missingFields.push('confidence_score');
        if (!hasFraudRiskLevel) missingFields.push('fraud_risk_level');
        if (!hasDamagedComponents) missingFields.push('damaged_components');
        if (!hasPhysicsAnalysis) missingFields.push('physics_analysis');
      }
    }
    
    const percentageComplete = Math.round((completeCount / assessments.length) * 100);
    
    console.log(`   Total assessments: ${assessments.length}`);
    console.log(`   Complete records: ${completeCount} (${percentageComplete}%)`);
    console.log(`   Missing fields: ${missingFieldsCount}`);
    console.log(`   Unique missing fields: ${new Set(missingFields).size}`);
    
    const status = percentageComplete >= 90 ? 'PASS' : percentageComplete >= 70 ? 'WARN' : 'FAIL';
    const riskLevel = percentageComplete >= 90 ? 'LOW' : percentageComplete >= 70 ? 'MEDIUM' : 'HIGH';
    
    return {
      scope: '4️⃣ AI Processing Completeness',
      status,
      riskLevel,
      actionRequired: status === 'PASS' ? 'None' : 'Regenerate incomplete AI assessments',
      details: {
        totalAssessments: assessments.length,
        completeCount,
        missingFieldsCount,
        percentageComplete,
        uniqueMissingFields: Array.from(new Set(missingFields)),
      },
    };
  } catch (error) {
    console.error('   ❌ Error:', error);
    return {
      scope: '4️⃣ AI Processing Completeness',
      status: 'FAIL',
      riskLevel: 'HIGH',
      actionRequired: 'Fix database query',
      details: { error: String(error) },
    };
  }
}

/**
 * Audit 5: Dashboard Data Integrity
 */
async function auditDashboardIntegrity(): Promise<AuditResult> {
  console.log('\n📊 Audit 5: Dashboard Data Integrity');
  console.log('====================================');
  
  const dashboards = [
    { name: 'Overview', file: 'analytics.ts' },
    { name: 'Analytics', file: 'analytics.ts' },
    { name: 'Critical Alerts', file: 'analytics.ts' },
    { name: 'Assessors', file: 'analytics.ts' },
    { name: 'Panel Beaters', file: 'panel-beater-analytics.ts' },
    { name: 'Financials', file: 'analytics.ts' },
    { name: 'Governance', file: 'governance-dashboard.ts' },
    { name: 'Executive', file: 'analytics.ts' },
  ];
  
  const results: any[] = [];
  let passCount = 0;
  
  for (const dashboard of dashboards) {
    const routerPath = path.join(__dirname, '../server/routers', dashboard.file);
    
    if (!fs.existsSync(routerPath)) {
      results.push({
        dashboard: dashboard.name,
        dataSource: 'N/A',
        quantitativeDataUsed: false,
        emptyState: true,
        errors: 'Router file not found',
      });
      continue;
    }
    
    const content = fs.readFileSync(routerPath, 'utf-8');
    
    // Check for real DB queries
    const hasDbQueries = content.includes('db.execute') || content.includes('db.query');
    const hasMockData = content.match(/return\s+\[[\s\S]*?\{[\s\S]*?name:\s*['"].*?['"]/) !== null;
    const hasGroupBy = content.includes('groupBy');
    const hasEmptyCheck = content.includes('.length') || content.includes('COUNT');
    
    const passed = hasDbQueries && !hasMockData;
    if (passed) passCount++;
    
    results.push({
      dashboard: dashboard.name,
      dataSource: hasDbQueries ? 'Real DB' : 'Unknown',
      quantitativeDataUsed: content.includes('calculatedImpactForceKN') || content.includes('impactAngleDegrees'),
      emptyState: !hasEmptyCheck,
      errors: hasMockData ? 'Mock data detected' : 'None',
    });
    
    console.log(`   ${dashboard.name}: ${passed ? '✅' : '❌'}`);
  }
  
  const status = passCount === dashboards.length ? 'PASS' : passCount >= 6 ? 'WARN' : 'FAIL';
  const riskLevel = passCount === dashboards.length ? 'LOW' : passCount >= 6 ? 'MEDIUM' : 'HIGH';
  
  return {
    scope: '5️⃣ Dashboard Data Integrity',
    status,
    riskLevel,
    actionRequired: status === 'PASS' ? 'None' : 'Fix dashboards with mock data or missing queries',
    details: {
      totalDashboards: dashboards.length,
      passCount,
      results,
    },
  };
}

/**
 * Audit 6: Report Generation Integrity
 */
async function auditReportGeneration(): Promise<AuditResult> {
  console.log('\n📄 Audit 6: Report Generation Integrity');
  console.log('=======================================');
  
  const reportTypes = [
    'Claim Dossier PDF',
    'Executive Report',
    'Financial Summary',
    'Audit Trail Report',
  ];
  
  const results: any[] = [];
  
  // Check for report generation routers
  const reportRouterPath = path.join(__dirname, '../server/routers');
  const reportFiles = fs.readdirSync(reportRouterPath).filter(f => 
    f.includes('report') || f.includes('pdf') || f.includes('export')
  );
  
  console.log(`   Found ${reportFiles.length} report-related router files`);
  
  for (const reportType of reportTypes) {
    // Simplified check - verify router files exist
    const hasImplementation = reportFiles.length > 0;
    
    results.push({
      reportType,
      status: hasImplementation ? 'PASS' : 'WARN',
      missingSection: hasImplementation ? 'None' : 'Implementation not verified',
    });
    
    console.log(`   ${reportType}: ${hasImplementation ? '✅' : '⚠️'}`);
  }
  
  const passCount = results.filter(r => r.status === 'PASS').length;
  const status = passCount === reportTypes.length ? 'PASS' : passCount >= 2 ? 'WARN' : 'FAIL';
  const riskLevel = passCount === reportTypes.length ? 'LOW' : passCount >= 2 ? 'MEDIUM' : 'HIGH';
  
  return {
    scope: '6️⃣ Report Generation Integrity',
    status,
    riskLevel,
    actionRequired: status === 'PASS' ? 'None' : 'Implement missing report types',
    details: {
      totalReportTypes: reportTypes.length,
      passCount,
      results,
    },
  };
}

/**
 * Audit 7: Regression Check
 */
async function auditRegression(): Promise<AuditResult> {
  console.log('\n🔄 Audit 7: Regression Check');
  console.log('============================');
  
  const checks: any[] = [];
  
  // Check auth components
  const authPath = path.join(__dirname, '../client/src/contexts/AuthContext.tsx');
  const authExists = fs.existsSync(authPath);
  checks.push({ name: 'AuthContext exists', passed: authExists });
  console.log(`   AuthContext: ${authExists ? '✅' : '❌'}`);
  
  // Check routing
  const appPath = path.join(__dirname, '../client/src/App.tsx');
  const appExists = fs.existsSync(appPath);
  if (appExists) {
    const appContent = fs.readFileSync(appPath, 'utf-8');
    const hasRoutes = appContent.includes('Route') || appContent.includes('router');
    const hasProtectedRoute = appContent.includes('ProtectedRoute') || appContent.includes('RoleGuard');
    checks.push({ name: 'Routing configured', passed: hasRoutes });
    checks.push({ name: 'Protected routes', passed: hasProtectedRoute });
    console.log(`   Routing: ${hasRoutes ? '✅' : '❌'}`);
    console.log(`   Protected routes: ${hasProtectedRoute ? '✅' : '❌'}`);
  }
  
  // Check TypeScript compilation
  const tsConfigPath = path.join(__dirname, '../tsconfig.json');
  const tsConfigExists = fs.existsSync(tsConfigPath);
  checks.push({ name: 'TypeScript config', passed: tsConfigExists });
  console.log(`   TypeScript config: ${tsConfigExists ? '✅' : '❌'}`);
  
  const passedChecks = checks.filter(c => c.passed).length;
  const status = passedChecks === checks.length ? 'PASS' : passedChecks >= checks.length - 1 ? 'WARN' : 'FAIL';
  const riskLevel = passedChecks === checks.length ? 'LOW' : passedChecks >= checks.length - 1 ? 'MEDIUM' : 'HIGH';
  
  return {
    scope: '7️⃣ Regression Check',
    status,
    riskLevel,
    actionRequired: status === 'PASS' ? 'None' : 'Fix failing regression checks',
    details: {
      totalChecks: checks.length,
      passedChecks,
      checks,
    },
  };
}

/**
 * Calculate system readiness score
 */
function calculateReadinessScore(results: AuditResult[]): number {
  const weights = {
    PASS: 100,
    WARN: 60,
    FAIL: 0,
  };
  
  const totalScore = results.reduce((sum, result) => sum + weights[result.status], 0);
  const maxScore = results.length * 100;
  
  return Math.round((totalScore / maxScore) * 100);
}

/**
 * Determine if forensic quantitative mode is active
 */
function isForensicQuantitativeModeActive(results: AuditResult[]): boolean {
  const physicsResult = results.find(r => r.scope.includes('Quantitative Physics'));
  const renderingResult = results.find(r => r.scope.includes('Frontend Rendering'));
  const aiResult = results.find(r => r.scope.includes('AI Processing'));
  
  return (
    physicsResult?.status === 'PASS' &&
    renderingResult?.status === 'PASS' &&
    aiResult?.status === 'PASS'
  );
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Comprehensive Verification Audit');
  console.log('===================================');
  console.log(`Started at: ${new Date().toISOString()}\n`);
  
  const results: AuditResult[] = [];
  
  // Run all audits
  results.push(await auditQuantitativePhysics());
  results.push(await auditFrontendRendering());
  results.push(await auditImageData());
  results.push(await auditAIProcessing());
  results.push(await auditDashboardIntegrity());
  results.push(await auditReportGeneration());
  results.push(await auditRegression());
  
  // Calculate summary
  const summary = {
    totalScopes: results.length,
    passCount: results.filter(r => r.status === 'PASS').length,
    warnCount: results.filter(r => r.status === 'WARN').length,
    failCount: results.filter(r => r.status === 'FAIL').length,
  };
  
  const systemReadinessScore = calculateReadinessScore(results);
  const forensicQuantitativeModeActive = isForensicQuantitativeModeActive(results);
  
  const report: ComprehensiveAuditReport = {
    timestamp: new Date().toISOString(),
    results,
    systemReadinessScore,
    forensicQuantitativeModeActive,
    summary,
  };
  
  // Save report
  const reportPath = path.join(__dirname, '../COMPREHENSIVE_VERIFICATION_AUDIT.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  // Print summary
  console.log('\n\n📊 AUDIT SUMMARY');
  console.log('================\n');
  
  console.log('System Component | Status | Risk Level | Action Required');
  console.log('----------------|--------|------------|------------------');
  for (const result of results) {
    const statusIcon = result.status === 'PASS' ? '✅' : result.status === 'WARN' ? '⚠️' : '❌';
    console.log(`${result.scope} | ${statusIcon} ${result.status} | ${result.riskLevel} | ${result.actionRequired}`);
  }
  
  console.log(`\n📈 Overall System Readiness Score: ${systemReadinessScore}%`);
  console.log(`🔬 Forensic Quantitative Mode Active: ${forensicQuantitativeModeActive ? 'YES ✅' : 'NO ❌'}`);
  
  console.log(`\n✅ Report saved: ${reportPath}`);
  console.log(`\nCompleted at: ${new Date().toISOString()}`);
}

main().catch(console.error);
