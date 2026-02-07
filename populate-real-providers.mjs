#!/usr/bin/env node
/**
 * Populate KINGA system with real Zimbabwean insurance providers
 * - 8 short-term insurers
 * - 50+ approved panel beaters from Cell Insurance
 * - 20+ approved assessors from Cell Insurance
 */

import mysql from 'mysql2/promise';
import fs from 'fs/promises';

const insurers = [
  'Allied Insurance Company',
  'Alliance Insurance Company',
  'CBZ Insurance Company Ltd',
  'Cell Insurance Company',
  'Champions Insurance Company (Private) Limited',
  'NicozDiamond',
  'Sanctuary Insurance Company',
  'Zimnat Lion Insurance Company Ltd'
];

async function main() {
  console.log('🏢 Populating KINGA with real Zimbabwean providers...\n');

  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  // 1. Create insurer companies
  console.log('Creating 8 Zimbabwean short-term insurers...');
  const insurerIds = {};
  
  for (const insurer of insurers) {
    const [existing] = await connection.query(
      'SELECT id FROM users WHERE name = ? AND role = ?',
      [insurer, 'insurer']
    );
    
    if (existing.length > 0) {
      insurerIds[insurer] = existing[0].id;
      console.log(`  ✓ Found existing: ${insurer}`);
    } else {
      const [result] = await connection.query(
        'INSERT INTO users (openId, name, email, role, createdAt) VALUES (?, ?, ?, ?, ?)',
        [
          `insurer_${Date.now()}_${Math.random()}`,
          insurer,
          `${insurer.toLowerCase().replace(/[^a-z0-9]+/g, '_')}@example.com`,
          'insurer',
          new Date()
        ]
      );
      insurerIds[insurer] = result.insertId;
      console.log(`  ✓ Created: ${insurer}`);
    }
  }

  // 2. Create panel beater companies
  console.log('\nCreating approved panel beaters...');
  const panelBeatersData = JSON.parse(await fs.readFile('/home/ubuntu/cell-approved-panel-beaters.json', 'utf-8'));
  let panelBeaterCount = 0;
  const panelBeaterIds = {};

  for (const [region, beaters] of Object.entries(panelBeatersData)) {
    if (region === 'source') continue;
    
    for (const beater of beaters) {
      const [existing] = await connection.query(
        'SELECT id FROM users WHERE name = ? AND role = ?',
        [beater.name, 'panel_beater']
      );
      
      if (existing.length > 0) {
        panelBeaterIds[beater.name] = existing[0].id;
        console.log(`  ✓ Found existing: ${beater.name}`);
      } else {
        const [result] = await connection.query(
          'INSERT INTO users (openId, name, email, role, createdAt) VALUES (?, ?, ?, ?, ?)',
          [
            `pb_${Date.now()}_${Math.random()}`,
            beater.name,
            beater.email || `${beater.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}@example.com`,
            'panel_beater',
            new Date()
          ]
        );
        panelBeaterIds[beater.name] = result.insertId;
        panelBeaterCount++;
      }
    }
  }
  console.log(`  ✓ Created ${panelBeaterCount} panel beaters`);

  // 3. Create assessor companies
  console.log('\nCreating approved assessors...');
  const assessorsData = JSON.parse(await fs.readFile('/home/ubuntu/cell-approved-assessors.json', 'utf-8'));
  let assessorCount = 0;
  const assessorIds = {};

  for (const [region, assessors] of Object.entries(assessorsData)) {
    if (region === 'source') continue;
    
    for (const assessor of assessors) {
      const [existing] = await connection.query(
        'SELECT id FROM users WHERE name = ? AND role = ?',
        [assessor.name, 'assessor']
      );
      
      if (existing.length > 0) {
        assessorIds[assessor.name] = existing[0].id;
        console.log(`  ✓ Found existing: ${assessor.name}`);
      } else {
        const [result] = await connection.query(
          'INSERT INTO users (openId, name, email, role, createdAt) VALUES (?, ?, ?, ?, ?)',
          [
            `assessor_${Date.now()}_${Math.random()}`,
            assessor.name,
            assessor.email || `${assessor.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}@example.com`,
            'assessor',
            new Date()
          ]
        );
        assessorIds[assessor.name] = result.insertId;
        assessorCount++;
      }
    }
  }
  console.log(`  ✓ Created ${assessorCount} assessors`);

  await connection.end();

  console.log(`\n=== Provider Population Complete ===`);
  console.log(`✓ 8 Zimbabwean insurers`);
  console.log(`✓ ${Object.keys(panelBeaterIds).length} approved panel beaters`);
  console.log(`✓ ${Object.keys(assessorIds).length} approved assessors`);
  console.log(`\n🎉 KINGA now has authentic Zimbabwean insurance ecosystem!`);
}

main().catch(console.error);
