// @ts-nocheck
/**
 * KINGA Pipeline Stage Audit
 * Checks what data each stage produced for claim 6150002 (Voltron Mining)
 * and flags any stage that produced null/empty output.
 */
import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';

const CLAIM_ID = 6150002;

function check(label: string, value: any, required = true) {
  const empty = value === null || value === undefined || value === '' || value === '{}' || value === '[]';
  const status = empty ? (required ? '❌ MISSING' : '⚠️  EMPTY') : '✅ OK';
  const preview = typeof value === 'string' && value.length > 80 ? value.substring(0, 80) + '...' : String(value ?? 'null');
  console.log(`  ${status}  ${label}: ${preview}`);
  return !empty;
}

async function run() {
  const db = await getDb();
  
  // ── CLAIM CORE ──────────────────────────────────────────────────────────────
  const [claim] = (await db.execute(sql`SELECT * FROM claims WHERE id = ${CLAIM_ID}`))[0] as any[];
  console.log('\n══ CLAIM CORE ══════════════════════════════════════════');
  check('claim_number', claim?.claim_number);
  check('vehicle_make', claim?.vehicle_make);
  check('vehicle_model', claim?.vehicle_model);
  check('incident_date', claim?.incident_date);
  check('status', claim?.status);
  check('workflow_state', claim?.workflow_state);
  check('damage_photos', claim?.damage_photos);
  
  // ── AI ASSESSMENT ────────────────────────────────────────────────────────────
  const [ai] = (await db.execute(sql`SELECT * FROM ai_assessments WHERE claim_id = ${CLAIM_ID} ORDER BY id DESC LIMIT 1`))[0] as any[];
  console.log('\n══ AI ASSESSMENT ═══════════════════════════════════════');
  if (!ai) { console.log('  ❌ NO ASSESSMENT RECORD'); }
  else {
    check('confidence_score', ai.confidence_score);
    check('fraud_score', ai.fraud_score);
    check('recommendation', ai.recommendation);
    check('damage_description', ai.damage_description);
    check('damaged_components_json', ai.damaged_components_json);
    check('parts_cost', ai.parts_cost);
    check('labor_cost', ai.labor_cost);
    check('estimated_parts_cost', ai.estimated_parts_cost);
    check('estimated_labor_cost', ai.estimated_labor_cost);
    check('currency_code', ai.currency_code);
    
    // ── COST EXTRACTION ────────────────────────────────────────────────────────
    console.log('\n══ COST EXTRACTION ═════════════════════════════════════');
    check('cost_intelligence_json', ai.cost_intelligence_json);
    check('parts_reconciliation_json', ai.parts_reconciliation_json);
    check('repair_intelligence_json', ai.repair_intelligence_json);
    check('cost_realism_json', ai.cost_realism_json);
    check('benchmark_bundle_json', ai.benchmark_bundle_json);
    check('economic_context_json', ai.economic_context_json);
    check('unresolved_parts_json', ai.unresolved_parts_json, false);
    
    // ── COST OPTIMISATION ─────────────────────────────────────────────────────
    console.log('\n══ COST OPTIMISATION ═══════════════════════════════════');
    check('validated_outcome_json', ai.validated_outcome_json);
    check('consensus_result_json', ai.consensus_result_json);
    check('decision_authority_json', ai.decision_authority_json);
    check('constraint_overrides_json', ai.constraint_overrides_json, false);
    
    // ── PHYSICS VALIDATION ────────────────────────────────────────────────────
    console.log('\n══ PHYSICS VALIDATION ══════════════════════════════════');
    check('physics_analysis', ai.physics_analysis);
    check('physics_deviation_score', ai.physics_deviation_score);
    check('causal_chain_json', ai.causal_chain_json);
    check('causal_verdict_json', ai.causal_verdict_json);
    check('consistency_check_json', ai.consistency_check_json);
    check('coherence_result_json', ai.coherence_result_json);
    
    // ── FRAUD SCORING ─────────────────────────────────────────────────────────
    console.log('\n══ FRAUD SCORING ═══════════════════════════════════════');
    check('fraud_score', ai.fraud_score);
    check('fraud_indicators', ai.fraud_indicators);
    check('fraud_risk_level', ai.fraud_risk_level);
    check('fraud_score_breakdown_json', ai.fraud_score_breakdown_json);
    check('forensic_analysis', ai.forensic_analysis);
    check('forensic_audit_validation_json', ai.forensic_audit_validation_json);
    check('photo_inconsistencies_json', ai.photo_inconsistencies_json, false);
    check('contradiction_gate_json', ai.contradiction_gate_json);
    
    // ── IMAGE ANALYSIS ────────────────────────────────────────────────────────
    console.log('\n══ IMAGE ANALYSIS ══════════════════════════════════════');
    check('image_analysis_total_count', ai.image_analysis_total_count);
    check('image_analysis_success_count', ai.image_analysis_success_count);
    check('image_analysis_success_rate', ai.image_analysis_success_rate);
    check('damage_photos_json', ai.damage_photos_json);
    check('photo_classification_json', ai.photo_classification_json, false);
    check('enriched_photos_json', ai.enriched_photos_json, false);
    
    // ── PIPELINE META ─────────────────────────────────────────────────────────
    console.log('\n══ PIPELINE META ═══════════════════════════════════════');
    check('pipeline_run_summary', ai.pipeline_run_summary);
    check('report_readiness_json', ai.report_readiness_json);
    check('decision_trace_json', ai.decision_trace_json, false);
    check('escalation_route_json', ai.escalation_route_json, false);
    
    // Parse and show key values
    console.log('\n══ KEY PARSED VALUES ═══════════════════════════════════');
    try {
      const ci = ai.cost_intelligence_json ? JSON.parse(ai.cost_intelligence_json) : null;
      if (ci) {
        console.log(`  cost_intelligence: nfs=${ci.nfs ?? ci.netFairSettlement ?? 'N/A'} total=${ci.totalOptimised ?? ci.optimisedTotal ?? 'N/A'}`);
      }
    } catch(e) { console.log('  cost_intelligence: parse error'); }
    
    try {
      const vo = ai.validated_outcome_json ? JSON.parse(ai.validated_outcome_json) : null;
      if (vo) {
        console.log(`  validated_outcome: recommendation=${vo.recommendation ?? 'N/A'} nfs=${vo.nfs ?? vo.netFairSettlement ?? 'N/A'}`);
      }
    } catch(e) { console.log('  validated_outcome: parse error'); }
    
    try {
      const pa = ai.physics_analysis ? JSON.parse(ai.physics_analysis) : null;
      if (pa) {
        console.log(`  physics: valid=${pa.is_valid ?? pa.isValid ?? 'N/A'} confidence=${pa.confidence ?? pa.physicsScore ?? 'N/A'}`);
      }
    } catch(e) { console.log('  physics_analysis: parse error'); }
    
    try {
      const rr = ai.report_readiness_json ? JSON.parse(ai.report_readiness_json) : null;
      if (rr) {
        console.log(`  report_readiness: ready=${rr.ready} issues=${JSON.stringify(rr.issues ?? [])}`);
      }
    } catch(e) { console.log('  report_readiness: parse error'); }
  }
  
  // ── PANEL BEATER QUOTES ───────────────────────────────────────────────────
  const quotes = (await db.execute(sql`SELECT pb.business_name, pq.total_cost, pq.parts_cost, pq.labor_cost, pq.line_items_json FROM panel_beater_quotes pq LEFT JOIN panel_beaters pb ON pb.id = pq.panel_beater_id WHERE pq.claim_id = ${CLAIM_ID}`))[0] as any[];
  console.log('\n══ PANEL BEATER QUOTES ═════════════════════════════════');
  if (quotes.length === 0) console.log('  ⚠️  No quotes found');
  else quotes.forEach((q: any) => {
    const hasItems = q.line_items_json && q.line_items_json !== '[]' && q.line_items_json !== 'null';
    console.log(`  ${q.business_name}: total=${q.total_cost} parts=${q.parts_cost} labor=${q.labor_cost} line_items=${hasItems ? '✅' : '❌'}`);
  });
  
  // ── COST OPTIMISATION RECORDS ─────────────────────────────────────────────
  try {
    const costOpt = (await db.execute(sql`SELECT * FROM cost_optimisation_results WHERE claim_id = ${CLAIM_ID} LIMIT 3`))[0] as any[];
    console.log('\n══ COST OPTIMISATION RECORDS ═══════════════════════════');
    if (costOpt.length === 0) console.log('  ⚠️  No cost_optimisation_results rows');
    else costOpt.forEach((r: any) => console.log(`  id:${r.id} nfs=${r.net_fair_settlement} savings=${r.savings_amount}`));
  } catch(e: any) {
    console.log('\n══ COST OPTIMISATION RECORDS ═══════════════════════════');
    console.log('  ⚠️  Table not found:', e.message.substring(0, 60));
  }
  
  process.exit(0);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
