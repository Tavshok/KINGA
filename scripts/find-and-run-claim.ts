/**
 * Pipeline end-to-end test: find a claim with documents and run the full pipeline.
 * Usage: npx tsx scripts/find-and-run-claim.ts [claimId]
 */
import {
  triggerAiAssessment,
  getAiAssessmentByClaimId,
  getClaimById,
  getDb,
} from "../server/db";

async function rawQuery(db: any, sql: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.$client.pool.query(sql, (err: any, rows: any) => {
      if (err) reject(err);
      else resolve(rows ?? []);
    });
  });
}

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("❌ Could not connect to database");
    process.exit(1);
  }

  let claimId = process.argv[2] ? parseInt(process.argv[2]) : null;

  if (!claimId) {
    console.log("🔍 Finding claims in DB...");

    const rows = await rawQuery(db, "SELECT id, claim_number, status FROM claims ORDER BY created_at DESC LIMIT 20");

    if (!rows || rows.length === 0) {
      console.error("❌ No claims found.");
      process.exit(1);
    }

    console.log(`Found ${rows.length} claims:`);
    rows.slice(0, 5).forEach((r: any) => {
      console.log(`  ID: ${r.id}  REF: ${r.claim_number}  STATUS: ${r.status}`);
    });

    // Find first claim with documents
    let selectedRow = rows[0];
    for (const r of rows) {
      const docs = await rawQuery(db, `SELECT id FROM claim_documents WHERE claim_id = ${r.id} LIMIT 1`);
      if (docs.length > 0) {
        selectedRow = r;
        console.log(`\n✅ Selected claim ID: ${r.id} (${r.claim_number}) — has documents`);
        break;
      }
    }
    claimId = selectedRow.id;
    if (!selectedRow.claim_number) {
      console.log(`\n✅ Using most recent claim ID: ${claimId} (no documents found on any claim)`);
    }
  } else {
    console.log(`\n✅ Using provided claim ID: ${claimId}`);
  }

  // Show documents for this claim
  const docRows = await rawQuery(db, `SELECT id, document_category, file_name, mime_type FROM claim_documents WHERE claim_id = ${claimId}`);

  console.log(`\n📄 Documents on claim ${claimId} (${docRows.length} total):`);
  if (docRows.length > 0) {
    docRows.forEach((d: any) => {
      console.log(`  [${d.document_category}] ${d.file_name} (${d.mime_type})`);
    });
  } else {
    console.log("  ⚠️  No documents — pipeline will use fallback extraction");
  }

  // Show claim details
  const claim = await getClaimById(claimId!);
  if (claim) {
    console.log(`\n📋 Claim details:`);
    console.log(`  Reference: ${claim.referenceNumber}`);
    console.log(`  Status:    ${claim.status}`);
    console.log(`  Vehicle:   ${(claim as any).vehicleMake ?? 'N/A'} ${(claim as any).vehicleModel ?? ''}`);
  }

  console.log("\n🚀 Triggering full pipeline...\n");
  const startTime = Date.now();
  
  try {
    await triggerAiAssessment(claimId!);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Pipeline completed in ${elapsed}s`);
  } catch (err: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n❌ Pipeline failed after ${elapsed}s: ${err.message}`);
    if (err.stack) console.error(err.stack.split('\n').slice(0, 8).join('\n'));
    process.exit(1);
  }

  // Check the assessment result
  const assessment = await getAiAssessmentByClaimId(claimId!);
  if (assessment) {
    const a = assessment as any;
    console.log("\n📊 Assessment result:");
    console.log(`  Status:     ${a.status}`);
    console.log(`  Decision:   ${a.decision}`);
    console.log(`  Confidence: ${a.confidenceScore ?? a.confidence_score}`);
    
    const partsRecon = a.partsReconciliationJson ?? a.parts_reconciliation_json;
    if (partsRecon) {
      const parsed = typeof partsRecon === 'string' ? JSON.parse(partsRecon) : partsRecon;
      console.log(`\n🔧 Parts Reconciliation (${Array.isArray(parsed) ? parsed.length : '?'} components):`);
      if (Array.isArray(parsed)) {
        parsed.slice(0, 8).forEach((p: any) => {
          const amount = p.quotedAmount != null ? `$${p.quotedAmount}` : 'null';
          console.log(`  ${String(p.component ?? '').padEnd(30)} status=${String(p.reconciliation_status ?? '').padEnd(25)} quoted=${amount}`);
        });
        const withAmounts = parsed.filter((p: any) => p.quotedAmount != null);
        console.log(`  → ${withAmounts.length}/${parsed.length} components have quoted amounts`);
      }
    } else {
      console.log("  ⚠️  partsReconciliationJson: null");
    }

    const costIntel = a.costIntelligenceJson ?? a.cost_intelligence_json;
    if (costIntel) {
      const ci = typeof costIntel === 'string' ? JSON.parse(costIntel) : costIntel;
      console.log(`\n💰 Cost Intelligence:`);
      console.log(`  Total estimated: ${ci.totalEstimatedCost}`);
      console.log(`  Market value:    ${ci.marketValueUsd}`);
      console.log(`  Currency:        ${ci.currency}`);
      const recSummary = ci.reconciliationSummary;
      const recStr = typeof recSummary === 'object' ? JSON.stringify(recSummary).slice(0, 120) : recSummary;
      console.log(`  Reconciliation:  ${recStr}`);
    }

    // Check police report
    const claimRecord = a.claimRecordJson ?? a.claim_record_json;
    if (claimRecord) {
      const cr = typeof claimRecord === 'string' ? JSON.parse(claimRecord) : claimRecord;
      const police = cr.policeReport;
      if (police) {
        console.log(`\n🚔 Police Report:`);
        console.log(`  Case number:           ${police.caseNumber ?? 'N/A'}`);
        console.log(`  Investigation status:  ${police.investigationStatus ?? 'N/A'}`);
        console.log(`  Charged party:         ${police.chargedParty ?? 'N/A'}`);
        console.log(`  Third-party account:   ${police.thirdPartyAccountSummary ?? 'N/A'}`);
      } else {
        console.log("\n🚔 Police Report: not found in claimRecord");
      }
    }
  } else {
    console.log("  ⚠️  No assessment record found after pipeline run");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  console.error(e.stack?.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
});
