/**
 * voltron_verify.mts  —  Voltron claim end-to-end verification
 * Uses existing DB helpers to avoid cold-start overhead.
 */
import {
  getClaimById,
  getQuotesByClaimId,
  getQuoteLineItemsByQuoteId,
  getAiAssessmentByClaimId,
} from './server/db';
import {
  buildCompositeQuote,
  type InputQuoteWithLineItems,
  type BenchmarkMap,
} from './server/pipeline-v2/quoteOptimisationEngine';

const CLAIM_ID = 8880001;

function hr(title: string) {
  console.log(`\n${'─'.repeat(62)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(62));
}
function trunc(s: string | null | undefined, n = 110) {
  if (!s) return '(null)';
  return s.length > n ? s.slice(0, n) + `…[${s.length}]` : s;
}

async function main() {
  // ─── PHASE 1: Claim + Quotes ──────────────────────────────────────────────
  hr('PHASE 1 — Claim & Quote Data');

  const claim = await getClaimById(CLAIM_ID);
  if (!claim) { console.error(`Claim ${CLAIM_ID} not found`); process.exit(1); }

  console.log(`Claim:    ${claim.claimNumber} (id=${claim.id})`);
  console.log(`Vehicle:  ${claim.vehicleMake} ${claim.vehicleModel} ${claim.vehicleYear}`);
  console.log(`Status:   ${claim.status}`);
  console.log(`Cause:    ${claim.reportedCauseLabel ?? '(not set)'}`);
  console.log(`Incident: ${claim.incidentDate ?? '(not set)'}`);

  const quotes = await getQuotesByClaimId(CLAIM_ID);
  console.log(`\nPanel beater quotes: ${quotes.length}`);

  // Fetch line items for each quote
  const quotesWithItems: Array<{ quote: typeof quotes[0]; lineItems: Awaited<ReturnType<typeof getQuoteLineItemsByQuoteId>> }> = [];
  for (const q of quotes) {
    const lineItems = await getQuoteLineItemsByQuoteId(q.id);
    quotesWithItems.push({ quote: q, lineItems });
    const name = (q as any).repairerName ?? `PB#${q.panelBeaterId}`;
    console.log(`\n  Quote #${q.id} | ${name} | ${q.currencyCode} ${q.quotedAmount} | type=${q.quoteType} status=${q.status}`);
    console.log(`  Line items: ${lineItems.length}`);
    for (const li of lineItems.slice(0, 6)) {
      console.log(`    • [${li.category}] ${li.description}: ${li.currency} ${li.lineTotal} (repair=${li.isRepair} replace=${li.isReplacement})`);
    }
    if (lineItems.length > 6) console.log(`    … and ${lineItems.length - 6} more`);
  }

  // ─── PHASE 2: buildCompositeQuote L2 Verification ─────────────────────────
  hr('PHASE 2 — buildCompositeQuote L2 Verification');

  // Build InputQuoteWithLineItems[] using the same mapping as stage-9-cost.ts DB fallback
  const inputQuotes: InputQuoteWithLineItems[] = quotesWithItems
    .filter(({ quote, lineItems }) => (quote.quotedAmount ?? 0) > 0)
    .map(({ quote, lineItems }) => {
      const name = (quote as any).repairerName ?? `PB#${quote.panelBeaterId}`;
      const mappedItems = lineItems.map((li, idx) => ({
        id: idx,
        componentName: li.description ?? '',
        costUsd: li.lineTotal ? parseFloat(String(li.lineTotal)) : 0,
        isRepair: !!(li.isRepair),
        isReplacement: !!(li.isReplacement),
        isNonPartCost: li.category === 'labor' || li.category === 'paint' || li.category === 'diagnostic',
      })).filter(li => li.componentName && li.costUsd > 0);

      return {
        panel_beater: name,
        total_cost: quote.quotedAmount / 100,  // stored in cents
        currency: quote.currencyCode ?? 'USD',
        components: mappedItems.filter(li => !li.isNonPartCost).map(li => li.componentName),
        labour_defined: mappedItems.some(li => li.isNonPartCost),
        parts_defined: mappedItems.some(li => !li.isNonPartCost),
        confidence: 'medium' as const,
        lineItems: mappedItems,
      };
    });

  console.log(`\nInput quotes with line items: ${inputQuotes.length}`);

  if (inputQuotes.length === 0) {
    console.log('⚠  No quotes with line items found in quote_line_items table.');
    console.log('   The pipeline will use extracted quotes from the AI assessment JSON instead.');
    console.log('   Check costIntelligenceJson for the composite quote result.');
  } else {
    const benchmarks: BenchmarkMap = {};
    const l1 = Math.min(...inputQuotes.map(q => q.total_cost));
    const result = buildCompositeQuote(inputQuotes, benchmarks, l1);

    console.log(`\nL1 (lowest submitted total):  ${l1}`);
    console.log(`L2 (KINGA optimised total):   ${result.compositeOptimisedCostUsd}`);
    console.log(`Negotiation savings (L1-L2):  ${result.negotiationSavingsUsd}`);
    console.log(`Components benchmarked:       ${result.benchmarkCoverageComponents}`);
    console.log(`\nPer-component breakdown (${result.compositeLineItems.length} components):`);

    for (const item of result.compositeLineItems) {
      const rule = item.scopeDecisionRule ?? 'NO_BENCHMARK';
      const bm = item.p50Usd != null ? ` | P50=${item.p50Usd}` : '';
      console.log(`  • ${item.componentName}: L2=${item.selectedCostUsd} from "${item.selectedFromQuote}" | ${rule}${bm}`);
      if (item.allQuotedPrices.length > 1) {
        const all = item.allQuotedPrices.map(p => `${p.quote}=${p.costUsd}`).join(', ');
        console.log(`    All prices: ${all}`);
      }
    }

    // Invariant checks
    const l2LeL1 = result.compositeOptimisedCostUsd <= l1;
    const sumComponents = result.compositeLineItems.reduce((s, i) => s + i.selectedCostUsd, 0);
    const sumMatch = Math.abs(sumComponents - result.compositeOptimisedCostUsd) < 0.01;
    console.log(`\n✓ L2 ≤ L1 invariant:            ${l2LeL1 ? 'PASS' : 'FAIL (cherry-pick > best package)'}`);
    console.log(`✓ L2_total = sum of components:  ${sumMatch ? 'PASS' : `FAIL (sum=${sumComponents} vs total=${result.compositeOptimisedCostUsd})`}`);
  }

  // ─── PHASE 3: Commentary Stage Architecture Check ─────────────────────────
  hr('PHASE 3 — Commentary Stage Architecture Check');

  const assessment = await getAiAssessmentByClaimId(CLAIM_ID);
  if (!assessment) {
    console.log('No AI assessment found for this claim.');
  } else {
    console.log(`Assessment id=${assessment.id} v${assessment.versionNumber} | recommendation=${assessment.recommendation ?? '(none)'}`);

    // Check costIntelligenceJson for compositeQuote
    if (assessment.costIntelligenceJson) {
      try {
        const ci = JSON.parse(assessment.costIntelligenceJson);
        const hasComposite = !!(ci.compositeQuote ?? ci.compositeLineItems ?? ci.kingaOptimisedQuote);
        console.log(`\n  costIntelligenceJson: present (${assessment.costIntelligenceJson.length} chars)`);
        console.log(`  → compositeQuote present: ${hasComposite ? 'YES ✓' : 'NO ✗ — commentary not reading from L2'}`);
        if (ci.compositeQuote) {
          const cq = ci.compositeQuote;
          console.log(`  → compositeOptimisedCostUsd: ${cq.compositeOptimisedCostUsd ?? '(not set)'}`);
          console.log(`  → negotiationSavingsUsd: ${cq.negotiationSavingsUsd ?? '(not set)'}`);
          const items = cq.compositeLineItems ?? [];
          console.log(`  → compositeLineItems count: ${items.length}`);
          for (const item of items.slice(0, 6)) {
            const rule = item.scopeDecisionRule ?? 'n/a';
            console.log(`    • ${item.componentName}: L2=${item.selectedCostUsd} rule=${rule} from="${item.selectedFromQuote}"`);
          }
          if (items.length > 6) console.log(`    … and ${items.length - 6} more`);
        }
        if (ci.costDecision) {
          console.log(`  → costDecision.recommendation: ${ci.costDecision.recommendation ?? '(none)'}`);
          console.log(`  → costDecision.costBasis: ${ci.costDecision.costBasis ?? '(none)'}`);
        }
      } catch { console.log(`  costIntelligenceJson: parse error`); }
    } else {
      console.log(`  costIntelligenceJson: (null) — pipeline may not have reached Stage 10`);
    }

    // Physics coherence commentary
    if (assessment.coherenceResultJson) {
      try {
        const cr = JSON.parse(assessment.coherenceResultJson);
        console.log(`\n  coherenceResultJson: present`);
        console.log(`  → verdict: ${cr.verdict ?? '(none)'}`);
        console.log(`  → summary: ${trunc(cr.summary, 110)}`);
        const flags = cr.flags ?? cr.componentFlags ?? cr.componentIssues ?? [];
        if (flags.length > 0) {
          console.log(`  → component flags (${flags.length}):`);
          for (const f of flags.slice(0, 6)) {
            const comp = f.component ?? f.componentName ?? '?';
            const issue = f.issue ?? f.flag ?? f.description ?? JSON.stringify(f);
            console.log(`    • ${comp}: ${trunc(issue, 80)}`);
          }
        }
      } catch { console.log(`  coherenceResultJson: parse error`); }
    } else {
      console.log(`\n  coherenceResultJson: (null)`);
    }

    // Cost realism commentary
    if (assessment.costRealismJson) {
      try {
        const cr = JSON.parse(assessment.costRealismJson);
        console.log(`\n  costRealismJson: present`);
        console.log(`  → verdict: ${cr.verdict ?? '(none)'}`);
        console.log(`  → summary: ${trunc(cr.summary, 110)}`);
      } catch { console.log(`  costRealismJson: parse error`); }
    } else {
      console.log(`\n  costRealismJson: (null)`);
    }
  }

  // ─── PHASE 4: Full Pipeline Output Inspection ─────────────────────────────
  hr('PHASE 4 — Full Pipeline Output Inspection');

  if (assessment) {
    const stageOutputs: [string, string | null][] = [
      ['Stage 5  (hidden damages)',    assessment.inferredHiddenDamagesJson],
      ['Stage 7  (fraud score)',       assessment.fraudScoreBreakdownJson],
      ['Stage 8  (repair intelligence)', assessment.repairIntelligenceJson],
      ['Stage 9  (parts reconciliation)', assessment.partsReconciliationJson],
      ['Stage 10 (cost intelligence)', assessment.costIntelligenceJson],
      ['Stage 11 (enriched photos)',   assessment.enrichedPhotosJson],
      ['Stage 12 (consistency check)', assessment.consistencyCheckJson],
      ['Stage 35 (coherence)',         assessment.coherenceResultJson],
      ['Stage 36 (cost realism)',      assessment.costRealismJson],
      ['Stage 37 (causal chain)',      assessment.causalChainJson],
      ['Stage 38 (evidence bundle)',   assessment.evidenceBundleJson],
      ['Stage 40 (realism bundle)',    assessment.realismBundleJson],
      ['Stage 41 (benchmark bundle)',  assessment.benchmarkBundleJson],
      ['Stage 42 (consensus)',         assessment.consensusResultJson],
    ];

    console.log('\nStage completion:');
    let done = 0;
    for (const [stage, data] of stageOutputs) {
      const icon = data ? '✓' : '✗';
      const info = data ? `${data.length} chars` : 'null';
      if (data) done++;
      console.log(`  ${icon} ${stage}: ${info}`);
    }
    console.log(`\nCompleted: ${done}/${stageOutputs.length} stages`);

    // Pipeline run summary
    if (assessment.pipelineRunSummary) {
      try {
        const summary = JSON.parse(assessment.pipelineRunSummary);
        if (Array.isArray(summary)) {
          console.log(`\nPipeline run (${summary.length} stages):`);
          for (const s of summary) {
            const icon = s.status === 'success' ? '✓' : s.status === 'skipped' ? '⊘' : '✗';
            const dur = s.durationMs ? ` ${s.durationMs}ms` : '';
            const err = s.error ? ` | ERR: ${trunc(s.error, 60)}` : '';
            console.log(`  ${icon} Stage ${s.stage ?? s.stageId ?? '?'}: ${s.status}${dur}${err}`);
          }
        }
      } catch {}
    }

    console.log(`\nFinal recommendation: ${assessment.recommendation ?? '(not set)'}`);
    console.log(`Fraud risk level:     ${assessment.fraudRiskLevel ?? '(not set)'}`);
    console.log(`Fraud score:          ${assessment.fraudScore ?? '(not set)'}`);
    console.log(`Estimated cost:       ${assessment.currencyCode ?? 'USD'} ${assessment.estimatedCost ?? '(not set)'}`);
    console.log(`Total loss:           ${assessment.totalLossIndicated ? 'YES' : 'no'}`);
    if (assessment.totalLossIndicated) {
      console.log(`Repair-to-value:      ${assessment.repairToValueRatio ?? '?'}%`);
    }
  }

  hr('VERIFICATION COMPLETE');
  process.exit(0);
}

main().catch(e => { console.error(e.message, '\n', e.stack); process.exit(1); });
