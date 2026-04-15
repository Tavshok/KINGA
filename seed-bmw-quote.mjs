/**
 * seed-bmw-quote.mjs
 * Seeds the BMW 318i repair quote and line items for claim ID 4320104.
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ quiet: true });

const CLAIM_ID = 4320104;

const lineItems = [
  { description: 'Bootlid', amount: 100 },
  { description: 'Number Plate Light', amount: 15 },
  { description: 'Bootlights x2', amount: 100 },
  { description: 'Taillamps x2', amount: 160 },
  { description: 'Rear Bumper Frame', amount: 70 },
  { description: 'Rear Bumper', amount: 120 },
  { description: 'LHS Rear Fender (cut & join)', amount: 150 },
  { description: 'Bootshocks x2', amount: 70 },
  { description: 'Rear Windscreen', amount: 125 },
  { description: 'Rear Bumper Slides x2', amount: 60 },
  { description: 'PAS Rear Fender', amount: 50 },
  { description: 'Bootlid Rear Section (cut and join)', amount: 150 },
  { description: 'Strip and Assemble', amount: 140 },
  { description: 'Paint Damages', amount: 400 },
  { description: 'Sundries', amount: 50 },
];

const subtotal = lineItems.reduce((s, i) => s + i.amount, 0); // 1660 (before VAT)
const vat = 272;
const total = 2087;
const agreedCost = 1922.80;

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Insert quote
  const [qResult] = await conn.execute(
    `INSERT INTO panel_beater_quotes 
     (claim_id, panel_beater_id, quoted_amount, labor_cost, parts_cost, status, currency_code, notes, itemized_breakdown)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      CLAIM_ID,
      0, // placeholder — no registered panel beater for seeded claim
      Math.round(agreedCost * 100), // agreed cost in cents
      Math.round(540 * 100), // strip/assemble + paint + sundries
      Math.round(1120 * 100), // parts
      'submitted',
      'USD',
      'Royalty Autobody House Estimate No. 008 dated 2024-10-21. Agreed cost $1922.80 (savings $164.20 from quoted $2087). Cost verified and agreed with repairer.',
      JSON.stringify(lineItems.map(i => ({ description: i.description, amount: i.amount, currency: 'USD' }))),
    ]
  );
  const quoteId = qResult.insertId;
  console.log(`✅ Quote inserted with ID: ${quoteId}`);

  // Insert line items
  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    await conn.execute(
      `INSERT INTO quote_line_items 
       (quote_id, item_number, description, quantity, unit_price, line_total, vat_rate, vat_amount, total_with_vat, net_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quoteId,
        i + 1,
        item.description,
        1,
        Math.round(item.amount * 100),
        Math.round(item.amount * 100),
        15, // 15% VAT
        Math.round(item.amount * 0.15 * 100),
        Math.round(item.amount * 1.15 * 100),
        Math.round(item.amount * 100),
      ]
    );
  }
  console.log(`✅ ${lineItems.length} line items inserted`);

  // Update claim with estimated value and source document
  await conn.execute(
    `UPDATE claims SET 
     estimated_claim_value = ?,
     vehicle_market_value = ?,
     policy_number = ?,
     claimant_phone = ?,
     claimant_address = ?,
     vehicle_registration = ?,
     vehicle_vin = ?,
     vehicle_color = ?,
     vehicle_mileage = ?,
     incident_date = ?,
     incident_location = ?,
     incident_description = ?,
     incident_type = ?,
     police_station = ?,
     currency_code = ?
     WHERE id = ?`,
    [
      Math.round(1922.80 * 100),
      Math.round(3500 * 100),
      'IC 2IM 24 R 6 21 061',
      '0772676296',
      '12 GEORGE STREET, ARDBENNIE, HARARE',
      'ADP6423',
      'WBAAN92040NJ05535',
      'Silver',
      251388,
      '2024-10-18',
      '25KM PEG, HARARE-MUKUMBURA ROAD, MAZOWE',
      'Driver was driving downhill at Ghidamba area. Braking to avoid potholes, the insured vehicle rammed into the back of the BMW. Rear section including boot, bumper and rear screen sustained damage. The matter was reported to Mazowe Police and the driver (Sydney Dube) was charged with driving without due care and attention.',
      'collision',
      'MAZOWE',
      'USD',
      CLAIM_ID,
    ]
  );
  console.log(`✅ Claim ${CLAIM_ID} updated with full details`);

  await conn.end();
  console.log(`\n🚀 BMW claim ${CLAIM_ID} is fully seeded. Ready for pipeline trigger.`);
  console.log(`   Navigate to: /claims/${CLAIM_ID}/report to view after assessment`);
}

run().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
