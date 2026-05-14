/**
 * Smoke test for the composite quote engine
 */
import { buildCompositeQuote, computeProbableHiddenDamage, classifyComponents } from '../server/pipeline-v2/quoteOptimisationEngine.js';

const result = buildCompositeQuote(
  [
    {
      panel_beater: 'ABC Panelbeaters',
      total_cost: 2450,
      components: ['radiator', 'bonnet'],
      confidence: 'high',
      lineItems: [
        { componentName: 'radiator', costUsd: 450 },
        { componentName: 'bonnet', costUsd: 600 },
      ],
      labour_cost: 800,
    },
    {
      panel_beater: 'XYZ Motors',
      total_cost: 2100,
      components: ['radiator', 'bonnet', 'front bumper'],
      confidence: 'medium',
      lineItems: [
        { componentName: 'radiator', costUsd: 380 },
        { componentName: 'bonnet', costUsd: 540 },
        { componentName: 'front bumper', costUsd: 280 },
      ],
      labour_cost: 700,
    },
  ],
  {
    radiator: { p25Usd: 310, p50Usd: 492, p75Usd: 680, sampleSize: 45 },
    bonnet: { p25Usd: 420, p50Usd: 580, p75Usd: 760, sampleSize: 38 },
    'front bumper': { p25Usd: 180, p50Usd: 265, p75Usd: 390, sampleSize: 52 },
  },
  2450
);

console.log('=== THREE-LAYER COST MODEL ===');
console.log('L1 (submitted ABC):  $2,450');
console.log('L2 (composite):     $' + result.compositeOptimisedCostUsd);
console.log('L3 (benchmark P50): $' + result.benchmarkReferenceCostUsd);
console.log('');
console.log('Negotiation savings:       $' + result.negotiationSavingsUsd);
console.log('Market overprice delta:    $' + result.marketOverpriceDeltaUsd);
console.log('Total savings opportunity: $' + result.totalSavingsOpportunityUsd);
console.log('NFS:', result.negotiationFeasibilityScore, result.negotiationFeasibilityLabel);
console.log('');
console.log('=== COMPOSITE LINE ITEMS ===');
for (const item of result.compositeLineItems) {
  console.log(`  ${item.componentName}: $${item.selectedCostUsd} from "${item.selectedFromQuote}" [${item.benchmarkVerdict}]`);
}

console.log('');
console.log('=== PROBABLE HIDDEN DAMAGE ===');
const hidden = computeProbableHiddenDamage(['bonnet', 'front bumper'], [], ['bonnet', 'front bumper']);
for (const h of hidden) {
  console.log(`  ${h.componentName}: ${h.probabilityPct}% (${h.confidenceBand}) — basis: ${h.basisComponents.join(', ')}`);
}

console.log('');
console.log('=== COMPONENT CLASSIFICATION ===');
const { quotedNotDamaged, damagedNotQuoted } = classifyComponents(
  ['bonnet', 'radiator'],
  ['bonnet', 'radiator', 'front bumper', 'grille'],
  {
    'front bumper': { p25Usd: 180, p50Usd: 265, p75Usd: 390, sampleSize: 52 },
    grille: { p25Usd: 80, p50Usd: 140, p75Usd: 220, sampleSize: 30 },
  },
  ['ABC Panelbeaters', 'XYZ Motors']
);
console.log('Quoted not damaged:', quotedNotDamaged.map(f => f.componentName + ' [' + f.classification + ']'));
console.log('Damaged not quoted:', damagedNotQuoted.map(f => f.componentName));

console.log('\nALL OK');
