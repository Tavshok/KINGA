/**
 * Cross-tenant contamination audit
 * Checks claim 6450001 and its tenant, then looks for SA-pattern references on non-SA tenants.
 * Run: npx tsx server/audit-cross-tenant.ts
 */
import { createConnection } from 'mysql2/promise';

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL as string);

  // 1. Full details of claim 6450001
  console.log('\n=== CLAIM 6450001 FULL DETAILS ===');
  const [claim] = await conn.query(
    `SELECT id, tenant_id, status, claim_reference, psm_claim_reference, 
            insurer_name, vehicle_make, vehicle_model, vehicle_year,
            claimant_name, incident_date, created_at, updated_at,
            document_processing_status, ai_assessment_triggered
     FROM claims WHERE id = 6450001`
  ) as any[];
  console.log(JSON.stringify(claim[0], null, 2));

  // 2. What tenant does this claim belong to?
  const tenantId = claim[0]?.tenant_id;
  console.log(`\n=== TENANT: ${tenantId} ===`);
  const [tenant] = await conn.query(
    `SELECT id, name, country, currency, created_at FROM tenants WHERE id = ?`,
    [tenantId]
  ) as any[];
  console.log(JSON.stringify(tenant[0], null, 2));

  // 3. Check if "COR" prefix is a known SA pattern on this tenant
  console.log('\n=== ALL "COR" REFERENCES ON THIS TENANT ===');
  const [corRefs] = await conn.query(
    `SELECT id, tenant_id, claim_reference, psm_claim_reference, insurer_name, created_at 
     FROM claims 
     WHERE tenant_id = ? AND (claim_reference LIKE 'COR%' OR psm_claim_reference LIKE 'COR%')
     ORDER BY created_at DESC LIMIT 20`,
    [tenantId]
  ) as any[];
  console.log(`Found ${(corRefs as any[]).length} COR-prefixed claims on tenant ${tenantId}`);
  console.log(JSON.stringify(corRefs, null, 2));

  // 4. Check if the claim_reference "COR 6002812" exists on ANY other tenant
  console.log('\n=== "COR 6002812" ACROSS ALL TENANTS ===');
  const [allCor] = await conn.query(
    `SELECT id, tenant_id, claim_reference, psm_claim_reference, insurer_name, created_at 
     FROM claims 
     WHERE claim_reference = 'COR 6002812' OR psm_claim_reference = 'COR 6002812'
     ORDER BY tenant_id, created_at DESC`
  ) as any[];
  console.log(`Found ${(allCor as any[]).length} claims with reference "COR 6002812"`);
  console.log(JSON.stringify(allCor, null, 2));

  // 5. Check where claim_reference was set — look at the assessment for claim 6450001
  console.log('\n=== AI ASSESSMENT FOR CLAIM 6450001 ===');
  const [assess] = await conn.query(
    `SELECT id, claim_id, created_at, 
            CHAR_LENGTH(claim_truth_json) as ctl_len,
            CHAR_LENGTH(forensic_analysis_json) as forensic_len,
            decision_authority_json IS NOT NULL as has_decision
     FROM ai_assessments WHERE claim_id = 6450001 ORDER BY created_at DESC LIMIT 3`
  ) as any[];
  console.log(JSON.stringify(assess, null, 2));

  // 6. Check what the pipeline wrote to claim_reference — look at the raw claim_reference column
  console.log('\n=== CLAIM REFERENCE SOURCE TRACE ===');
  const [refTrace] = await conn.query(
    `SELECT id, tenant_id, claim_reference, psm_claim_reference, 
            insurer_claim_reference, kinga_reference,
            insurer_name, source
     FROM claims WHERE id = 6450001`
  ) as any[];
  console.log(JSON.stringify(refTrace[0], null, 2));

  // 7. Check if there are SA tenants in the system
  console.log('\n=== ALL TENANTS (country/currency) ===');
  const [tenants] = await conn.query(
    `SELECT id, name, country, currency FROM tenants ORDER BY id`
  ) as any[];
  console.log(JSON.stringify(tenants, null, 2));

  await conn.end();
}

main().catch(console.error);
