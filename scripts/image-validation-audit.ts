/**
 * Image Validation Audit Script
 * 
 * Audits recent claims with images to verify:
 * - damagePhotos field contains valid JSON array
 * - S3 URLs return HTTP 200
 * - CORS headers configured for frontend domain
 * - AI assessments contain damagedComponents, physicsAnalysis, confidenceScore
 * - Frontend can parse damagePhotos JSON correctly
 * - Image thumbnails render in claim view
 * 
 * Usage: pnpm tsx scripts/image-validation-audit.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getDb } from '../server/db.js';
import { claims, aiAssessments } from '../drizzle/schema.js';
import { desc, isNotNull, sql } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ImageValidationResult {
  claimId: string;
  claimNumber: string;
  imagesStored: boolean;
  imageCount: number;
  damagePhotosValid: boolean;
  s3Reachable: boolean;
  s3ReachableDetails: string[];
  corsConfigured: boolean;
  corsDetails: string;
  aiProcessed: boolean;
  aiProcessingDetails: {
    hasDamagedComponents: boolean;
    hasPhysicsAnalysis: boolean;
    hasConfidenceScore: boolean;
  };
  rendered: boolean;
  errors: string[];
}

/**
 * Validate damagePhotos JSON structure
 */
function validateDamagePhotosJSON(damagePhotos: string | null): { valid: boolean; urls: string[]; error?: string } {
  if (!damagePhotos) {
    return { valid: false, urls: [], error: 'damagePhotos field is null' };
  }

  try {
    const parsed = JSON.parse(damagePhotos);
    
    if (!Array.isArray(parsed)) {
      return { valid: false, urls: [], error: 'damagePhotos is not an array' };
    }

    const urls: string[] = [];
    for (const item of parsed) {
      if (typeof item === 'string') {
        urls.push(item);
      } else if (typeof item === 'object' && item !== null && 'url' in item) {
        urls.push(item.url);
      }
    }

    if (urls.length === 0) {
      return { valid: false, urls: [], error: 'No URLs found in damagePhotos array' };
    }

    return { valid: true, urls };
  } catch (error) {
    return { valid: false, urls: [], error: `JSON parse error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

/**
 * Test S3 URL accessibility and CORS headers
 */
async function testS3URL(url: string, frontendDomain: string): Promise<{ reachable: boolean; cors: boolean; error?: string }> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'Origin': frontendDomain,
      },
    });

    if (!response.ok) {
      return { reachable: false, cors: false, error: `HTTP ${response.status} ${response.statusText}` };
    }

    const corsHeader = response.headers.get('access-control-allow-origin');
    const corsConfigured = corsHeader === '*' || corsHeader === frontendDomain;

    return { reachable: true, cors: corsConfigured, error: corsConfigured ? undefined : `CORS header: ${corsHeader || 'missing'}` };
  } catch (error) {
    return { reachable: false, cors: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

/**
 * Validate AI assessment completeness
 */
function validateAIAssessment(physicsAnalysis: string | null): {
  hasDamagedComponents: boolean;
  hasPhysicsAnalysis: boolean;
  hasConfidenceScore: boolean;
} {
  if (!physicsAnalysis) {
    return {
      hasDamagedComponents: false,
      hasPhysicsAnalysis: false,
      hasConfidenceScore: false,
    };
  }

  try {
    const parsed = JSON.parse(physicsAnalysis);
    
    return {
      hasDamagedComponents: Array.isArray(parsed.damagedComponents) && parsed.damagedComponents.length > 0,
      hasPhysicsAnalysis: typeof parsed.physicsValidation === 'object' && parsed.physicsValidation !== null,
      hasConfidenceScore: typeof parsed.confidenceScore === 'number' && parsed.confidenceScore >= 0 && parsed.confidenceScore <= 100,
    };
  } catch (error) {
    return {
      hasDamagedComponents: false,
      hasPhysicsAnalysis: false,
      hasConfidenceScore: false,
    };
  }
}

/**
 * Main audit function
 */
async function runImageValidationAudit() {
  console.log('🔍 Image Validation Audit');
  console.log('=========================\n');

  const db = await getDb();
  if (!db) {
    console.error('❌ Database connection failed');
    return;
  }

  // Fetch 20 recent claims with images
  console.log('📊 Fetching 20 recent claims with images...\n');
  
  const recentClaims = await db
    .select({
      claim: claims,
      assessment: aiAssessments,
    })
    .from(claims)
    .leftJoin(aiAssessments, sql`${claims.id} = ${aiAssessments.claimId}`)
    .where(isNotNull(claims.damagePhotos))
    .orderBy(desc(claims.createdAt))
    .limit(20);

  // If no claims with images found, check total claims count
  if (recentClaims.length === 0) {
    const totalClaimsResult = await db.select({ count: sql<number>`COUNT(*)` }).from(claims);
    const totalClaims = totalClaimsResult[0]?.count || 0;
    
    console.log(`⚠️  No claims with damage_photos found`);
    console.log(`   Total claims in database: ${totalClaims}`);
    console.log(`   This suggests either:`);
    console.log(`   1. No claims have been created with image uploads`);
    console.log(`   2. The damage_photos field is NULL for all claims`);
    console.log(`   3. Test data needs to be populated\n`);
  }

  console.log(`✅ Found ${recentClaims.length} claims with images\n`);

  // Frontend domain for CORS testing
  const frontendDomain = process.env.VITE_APP_URL || 'https://kingaai-ybs42lwg.manus.space';

  const results: ImageValidationResult[] = [];

  for (const { claim, assessment } of recentClaims) {
    console.log(`🔍 Auditing Claim: ${claim.claimNumber} (ID: ${claim.id})`);
    
    const result: ImageValidationResult = {
      claimId: claim.id,
      claimNumber: claim.claimNumber,
      imagesStored: false,
      imageCount: 0,
      damagePhotosValid: false,
      s3Reachable: false,
      s3ReachableDetails: [],
      corsConfigured: false,
      corsDetails: '',
      aiProcessed: false,
      aiProcessingDetails: {
        hasDamagedComponents: false,
        hasPhysicsAnalysis: false,
        hasConfidenceScore: false,
      },
      rendered: false,
      errors: [],
    };

    // 1. Validate damagePhotos JSON
    const jsonValidation = validateDamagePhotosJSON(claim.damagePhotos);
    result.imagesStored = jsonValidation.valid;
    result.damagePhotosValid = jsonValidation.valid;
    result.imageCount = jsonValidation.urls.length;

    if (!jsonValidation.valid) {
      result.errors.push(jsonValidation.error || 'Invalid JSON');
      console.log(`   ❌ damagePhotos JSON: ${jsonValidation.error}`);
    } else {
      console.log(`   ✅ damagePhotos JSON: Valid (${jsonValidation.urls.length} images)`);
    }

    // 2. Test S3 URL accessibility and CORS
    if (jsonValidation.valid && jsonValidation.urls.length > 0) {
      let allReachable = true;
      let allCorsConfigured = true;

      for (const url of jsonValidation.urls) {
        const s3Test = await testS3URL(url, frontendDomain);
        
        if (!s3Test.reachable) {
          allReachable = false;
          result.s3ReachableDetails.push(`❌ ${url.substring(0, 50)}...: ${s3Test.error}`);
          result.errors.push(`S3 unreachable: ${s3Test.error}`);
        } else {
          result.s3ReachableDetails.push(`✅ ${url.substring(0, 50)}...`);
        }

        if (!s3Test.cors) {
          allCorsConfigured = false;
          result.corsDetails = s3Test.error || 'CORS not configured';
        }
      }

      result.s3Reachable = allReachable;
      result.corsConfigured = allCorsConfigured;

      console.log(`   ${allReachable ? '✅' : '❌'} S3 Reachable: ${allReachable ? 'All URLs accessible' : 'Some URLs failed'}`);
      console.log(`   ${allCorsConfigured ? '✅' : '⚠️'} CORS Configured: ${allCorsConfigured ? 'Yes' : result.corsDetails}`);
    }

    // 3. Validate AI assessment
    if (assessment) {
      const aiValidation = validateAIAssessment(assessment.physicsAnalysis);
      result.aiProcessingDetails = aiValidation;
      result.aiProcessed = aiValidation.hasDamagedComponents && aiValidation.hasPhysicsAnalysis && aiValidation.hasConfidenceScore;

      console.log(`   ${aiValidation.hasDamagedComponents ? '✅' : '❌'} damagedComponents: ${aiValidation.hasDamagedComponents ? 'Present' : 'Missing'}`);
      console.log(`   ${aiValidation.hasPhysicsAnalysis ? '✅' : '❌'} physicsAnalysis: ${aiValidation.hasPhysicsAnalysis ? 'Present' : 'Missing'}`);
      console.log(`   ${aiValidation.hasConfidenceScore ? '✅' : '❌'} confidenceScore: ${aiValidation.hasConfidenceScore ? 'Present' : 'Missing'}`);

      if (!result.aiProcessed) {
        result.errors.push('AI processing incomplete');
      }
    } else {
      result.errors.push('No AI assessment found');
      console.log(`   ❌ AI Assessment: Not found`);
    }

    // 4. Frontend rendering check (heuristic)
    // Assume rendered if: JSON valid + S3 reachable + AI processed
    result.rendered = result.damagePhotosValid && result.s3Reachable && result.aiProcessed;
    console.log(`   ${result.rendered ? '✅' : '❌'} Frontend Rendering: ${result.rendered ? 'Expected to work' : 'May fail'}`);

    if (result.errors.length > 0) {
      console.log(`   ⚠️  Errors: ${result.errors.join(', ')}`);
    }

    console.log('');
    results.push(result);
  }

  // Generate reports
  generateMarkdownReport(results);
  generateJSONReport(results);

  // Summary
  console.log('📈 Summary:');
  console.log(`   Total Claims Audited: ${results.length}`);
  console.log(`   Images Stored: ${results.filter(r => r.imagesStored).length}`);
  console.log(`   S3 Reachable: ${results.filter(r => r.s3Reachable).length}`);
  console.log(`   CORS Configured: ${results.filter(r => r.corsConfigured).length}`);
  console.log(`   AI Processed: ${results.filter(r => r.aiProcessed).length}`);
  console.log(`   Rendered: ${results.filter(r => r.rendered).length}`);
  console.log(`   Errors: ${results.filter(r => r.errors.length > 0).length}`);
  
  console.log('\n✅ Image validation audit complete!');
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(results: ImageValidationResult[]) {
  const projectRoot = path.join(__dirname, '..');
  const reportPath = path.join(projectRoot, 'IMAGE_VALIDATION_REPORT.md');

  let md = `# Image Validation Audit Report\n\n`;
  md += `**Generated:** ${new Date().toLocaleString()}\n\n`;
  
  md += `## Executive Summary\n\n`;
  md += `- **Total Claims Audited:** ${results.length}\n`;
  md += `- **Images Stored:** ${results.filter(r => r.imagesStored).length}/${results.length}\n`;
  md += `- **S3 Reachable:** ${results.filter(r => r.s3Reachable).length}/${results.length}\n`;
  md += `- **CORS Configured:** ${results.filter(r => r.corsConfigured).length}/${results.length}\n`;
  md += `- **AI Processed:** ${results.filter(r => r.aiProcessed).length}/${results.length}\n`;
  md += `- **Frontend Rendering:** ${results.filter(r => r.rendered).length}/${results.length} expected to work\n`;
  md += `- **Claims with Errors:** ${results.filter(r => r.errors.length > 0).length}/${results.length}\n\n`;
  
  md += `---\n\n`;
  
  md += `## Detailed Results\n\n`;
  md += `| Claim ID | Claim Number | Images Stored | S3 Reachable | AI Processed | Rendered | Errors |\n`;
  md += `|----------|--------------|---------------|--------------|--------------|----------|--------|\n`;
  
  for (const result of results) {
    const imagesStored = result.imagesStored ? `✅ ${result.imageCount}` : '❌';
    const s3Reachable = result.s3Reachable ? '✅' : '❌';
    const aiProcessed = result.aiProcessed ? '✅' : '❌';
    const rendered = result.rendered ? '✅' : '❌';
    const errors = result.errors.length > 0 ? result.errors.join('; ') : 'None';
    
    md += `| ${result.claimId.substring(0, 8)}... | ${result.claimNumber} | ${imagesStored} | ${s3Reachable} | ${aiProcessed} | ${rendered} | ${errors} |\n`;
  }
  
  md += `\n---\n\n`;
  
  md += `## AI Processing Details\n\n`;
  md += `| Claim Number | damagedComponents | physicsAnalysis | confidenceScore |\n`;
  md += `|--------------|-------------------|-----------------|------------------|\n`;
  
  for (const result of results) {
    const dc = result.aiProcessingDetails.hasDamagedComponents ? '✅' : '❌';
    const pa = result.aiProcessingDetails.hasPhysicsAnalysis ? '✅' : '❌';
    const cs = result.aiProcessingDetails.hasConfidenceScore ? '✅' : '❌';
    
    md += `| ${result.claimNumber} | ${dc} | ${pa} | ${cs} |\n`;
  }
  
  md += `\n---\n\n`;
  
  md += `## Recommendations\n\n`;
  
  const failedS3 = results.filter(r => r.imagesStored && !r.s3Reachable);
  if (failedS3.length > 0) {
    md += `### 🔴 Critical: S3 URL Accessibility Issues\n\n`;
    md += `${failedS3.length} claim(s) have images stored but S3 URLs are unreachable. Check S3 bucket permissions and URL validity.\n\n`;
  }
  
  const failedCors = results.filter(r => r.s3Reachable && !r.corsConfigured);
  if (failedCors.length > 0) {
    md += `### ⚠️  High Priority: CORS Configuration\n\n`;
    md += `${failedCors.length} claim(s) have reachable S3 URLs but CORS headers are not configured for frontend domain. Update S3 bucket CORS policy.\n\n`;
  }
  
  const incompleteAI = results.filter(r => r.imagesStored && !r.aiProcessed);
  if (incompleteAI.length > 0) {
    md += `### ⚠️  Medium Priority: Incomplete AI Processing\n\n`;
    md += `${incompleteAI.length} claim(s) have images but incomplete AI assessments. Verify AI processing pipeline.\n\n`;
  }
  
  fs.writeFileSync(reportPath, md);
  console.log(`✅ Markdown report saved: ${reportPath}`);
}

/**
 * Generate JSON report
 */
function generateJSONReport(results: ImageValidationResult[]) {
  const projectRoot = path.join(__dirname, '..');
  const reportPath = path.join(projectRoot, 'IMAGE_VALIDATION_REPORT.json');
  
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`✅ JSON report saved: ${reportPath}`);
}

// Run audit
runImageValidationAudit().catch(console.error);
