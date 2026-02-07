#!/usr/bin/env node
/**
 * Generate realistic panel beater quotes for imported Zimbabwean claims
 */

import mysql from 'mysql2/promise';

// Realistic Zimbabwean panel beater pricing (USD)
const partsPricing = {
  'Bumper': { min: 150, max: 300 },
  'Fender': { min: 120, max: 250 },
  'Bonnet': { min: 200, max: 400 },
  'Door': { min: 180, max: 350 },
  'Headlamp': { min: 80, max: 200 },
  'Tail lamp': { min: 60, max: 150 },
  'Grille': { min: 50, max: 120 },
  'Radiator': { min: 150, max: 350 },
  'Windscreen': { min: 200, max: 450 },
  'Side mirror': { min: 40, max: 100 },
  'Wheel': { min: 100, max: 300 },
  'Chassis': { min: 500, max: 1500 },
  'Suspension': { min: 200, max: 600 }
};

const laborRates = {
  'minor': 50,
  'moderate': 100,
  'major': 200
};

// Three panel beaters with different pricing strategies
const panelBeaters = [
  { name: 'AutoFix Zimbabwe', markup: 1.0, laborMultiplier: 1.0 },  // Fair pricing
  { name: 'Quick Repairs Harare', markup: 1.15, laborMultiplier: 1.1 },  // Slightly higher
  { name: 'Premium Auto Body', markup: 0.95, laborMultiplier: 0.9 }  // Competitive
];

function generateQuoteLineItems(damagedComponents, panelBeater) {
  const lineItems = [];
  let totalParts = 0;
  let totalLabor = 0;

  for (const component of damagedComponents) {
    const pricing = partsPricing[component] || { min: 50, max: 200 };
    const basePrice = (pricing.min + pricing.max) / 2;
    const partCost = Math.round(basePrice * panelBeater.markup);
    
    // Determine labor based on component complexity
    const laborType = ['Chassis', 'Suspension', 'Radiator'].includes(component) ? 'major' :
                      ['Bonnet', 'Door', 'Fender'].includes(component) ? 'moderate' : 'minor';
    const laborCost = Math.round(laborRates[laborType] * panelBeater.laborMultiplier);

    lineItems.push({
      description: `${component} - Replace`,
      quantity: 1,
      unit_price: partCost,
      labor_cost: laborCost,
      total: partCost + laborCost
    });

    totalParts += partCost;
    totalLabor += laborCost;
  }

  return { lineItems, totalParts, totalLabor, total: totalParts + totalLabor };
}

async function main() {
  console.log('💰 Generating panel beater quotes...\n');

  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  // Create panel beater users if they don't exist
  console.log('Creating panel beater users...\n');
  const panelBeaterIds = {};
  
  for (const beater of panelBeaters) {
    const [existing] = await connection.query(
      'SELECT id FROM users WHERE name = ? AND role = ?',
      [beater.name, 'panel_beater']
    );
    
    if (existing.length > 0) {
      panelBeaterIds[beater.name] = existing[0].id;
      console.log(`  ✓ Found existing panel beater: ${beater.name} (ID: ${existing[0].id})`);
    } else {
      const [result] = await connection.query(
        'INSERT INTO users (openId, name, email, role, createdAt) VALUES (?, ?, ?, ?, ?)',
        [`pb_${Date.now()}_${Math.random()}`, beater.name, `${beater.name.toLowerCase().replace(/\s+/g, '_')}@example.com`, 'panel_beater', new Date()]
      );
      panelBeaterIds[beater.name] = result.insertId;
      console.log(`  ✓ Created panel beater: ${beater.name} (ID: ${result.insertId})`);
    }
  }
  console.log('');

  // Get all claims with AI assessments
  const [claims] = await connection.query(`
    SELECT c.id, c.vehicle_registration, c.vehicle_make, c.vehicle_model,
           a.detected_damage_types
    FROM claims c
    JOIN ai_assessments a ON c.id = a.claim_id
    WHERE c.id >= 60012
    ORDER BY c.id
  `);

  console.log(`Found ${claims.length} claims to generate quotes for\n`);

  let quotesGenerated = 0;

  for (const claim of claims) {
    try {
      const damagedComponents = JSON.parse(claim.detected_damage_types || '[]');
      
      if (damagedComponents.length === 0) {
        console.log(`⚠️  Skipping claim ${claim.id} (${claim.vehicle_registration}) - no damaged components`);
        continue;
      }

      console.log(`\n📋 Generating quotes for claim ${claim.id} (${claim.vehicle_make} ${claim.vehicle_model} - ${claim.vehicle_registration})`);
      console.log(`   Damaged components: ${damagedComponents.join(', ')}`);

      // Generate 2-3 quotes from different panel beaters
      const numQuotes = Math.random() > 0.3 ? 3 : 2;
      const selectedBeaters = panelBeaters.slice(0, numQuotes);

      for (const beater of selectedBeaters) {
        const quote = generateQuoteLineItems(damagedComponents, beater);
        const beaterId = panelBeaterIds[beater.name];
        
        // Insert panel beater quote
        const [result] = await connection.query(
          `INSERT INTO panel_beater_quotes (claim_id, panel_beater_id, quoted_amount, parts_cost, labor_cost, 
           itemized_breakdown, status, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            claim.id,
            beaterId,
            quote.total,
            quote.totalParts,
            quote.totalLabor,
            JSON.stringify(quote.lineItems),
            'submitted',
            new Date()
          ]
        );

        console.log(`   ✓ ${beater.name}: USD ${quote.total} (Parts: ${quote.totalParts}, Labor: ${quote.totalLabor})`);
        quotesGenerated++;
      }
    } catch (error) {
      console.error(`❌ Error generating quotes for claim ${claim.id}:`, error.message);
    }
  }

  await connection.end();

  console.log(`\n=== Quote Generation Complete ===`);
  console.log(`✓ Successfully generated ${quotesGenerated} panel beater quotes`);
  console.log(`\n🎉 Panel beater quotes are now in the system!`);
  console.log(`\nNext steps:`);
  console.log(`1. Log in as insurer to view claims with photos and quotes`);
  console.log(`2. Test complete workflow: triage → comparison → physics validation`);
  console.log(`3. Validate fraud detection with real data`);
}

main().catch(console.error);
