import { getDb } from './server/db';
import { claims, panelBeaterQuotes, aiAssessments, quoteLineItems } from './drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  const claimRows = await db.select({
    id: claims.id,
    claimNumber: claims.claimNumber,
    kingaRef: claims.kingaRef,
    status: claims.status,
    incidentType: claims.incidentType,
    fraudRiskScore: claims.fraudRiskScore,
    dataCompletenessScore: claims.dataCompletenessScore,
    vehicleMarketValue: claims.vehicleMarketValue,
  }).from(claims).where(eq(claims.claimNumber, 'DOC-20260519-2F012A19')).limit(1);
  if (!claimRows.length) { console.log('NOT FOUND'); return; }
  const claim = claimRows[0];
  console.log('=== CLAIM ===');
  console.log(JSON.stringify(claim, null, 2));

  // Get quotes
  const quotes = await db.select({
    id: panelBeaterQuotes.id,
    quotedAmount: panelBeaterQuotes.quotedAmount,
    laborCost: panelBeaterQuotes.laborCost,
    partsCost: panelBeaterQuotes.partsCost,
    status: panelBeaterQuotes.status,
    componentsJson: panelBeaterQuotes.componentsJson,
    quoteAuditJson: panelBeaterQuotes.quoteAuditJson,
  }).from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, claim.id));
  console.log('\n=== QUOTES (' + quotes.length + ') ===');
  for (const q of quotes) {
    console.log('  quote id:', q.id, '| quotedAmount:', q.quotedAmount, '(cents?)', '| status:', q.status);
  }

  // Get quote line items
  const lineItems = await db.select({
    id: quoteLineItems.id,
    description: quoteLineItems.description,
    quantity: quoteLineItems.quantity,
    unitPrice: quoteLineItems.unitPrice,
    lineTotal: quoteLineItems.lineTotal,
    repairerName: quoteLineItems.repairerName,
    category: quoteLineItems.category,
  }).from(quoteLineItems).where(eq(quoteLineItems.quoteId, quotes[0]?.id ?? 0));
  console.log('\n=== QUOTE LINE ITEMS (' + lineItems.length + ') ===');
  let total = 0;
  for (const item of lineItems) {
    const lt = parseFloat(item.lineTotal as string) || 0;
    total += lt;
    console.log('  [' + item.repairerName + '] ' + item.description + ' x' + item.quantity + ' @ ' + item.unitPrice + ' = ' + item.lineTotal);
  }
  console.log('  LINE ITEMS SUM:', total);

  // Get AI assessments
  const stages = await db.select({
    id: aiAssessments.id,
    fraudScore: aiAssessments.fraudScore,
    recommendation: aiAssessments.recommendation,
    costIntelligenceJson: aiAssessments.costIntelligenceJson,
    partsReconciliationJson: aiAssessments.partsReconciliationJson,
    estimatedCost: aiAssessments.estimatedCost,
  }).from(aiAssessments).where(eq(aiAssessments.claimId, claim.id));
  
  console.log('\n=== AI ASSESSMENT ===');
  for (const s of stages) {
    console.log('  id:', s.id, '| fraudScore:', s.fraudScore, '| recommendation:', s.recommendation, '| estimatedCost:', s.estimatedCost);
    if (s.costIntelligenceJson) {
      try {
        const ci = JSON.parse(s.costIntelligenceJson) as Record<string, unknown>;
        console.log('  costIntelligenceJson keys:', Object.keys(ci).join(', '));
        const ciKeys = ['lowestSubmittedUsd','l2CompositeOptimisedCostUsd','savingsL1vsL2Usd',
                        'totalQuotedUsd','quoteDeviationMatrix','costDecision','kingaSavings',
                        'compositeOptimisation','fraudScore','physicsConsistencyScore'];
        for (const k of ciKeys) {
          if (ci[k] !== undefined) console.log('    ci.'+k+':', JSON.stringify(ci[k]).substring(0,400));
        }
        if (ci['costDecision']) {
          const cd = ci['costDecision'] as Record<string,unknown>;
          console.log('    costDecision.true_cost_usd:', cd['true_cost_usd']);
          console.log('    costDecision.basis:', cd['basis']);
          console.log('    costDecision.recommendation:', cd['recommendation']);
          console.log('    costDecision.savingsUsd:', cd['savingsUsd']);
        }
      } catch(e) { console.log('  ci parse error:', e); }
    }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
