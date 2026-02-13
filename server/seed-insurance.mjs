import mysql from 'mysql2/promise';

/**
 * Seed Insurance Carriers and Products
 * 
 * Creates sample insurance carrier and products for testing the insurance quote system.
 */

async function seedInsurance() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  try {
    console.log('Starting insurance data seeding...');
    
    // Check if carrier already exists
    const [existingCarriers] = await connection.execute(
      'SELECT id FROM insurance_carriers WHERE name = ?',
      ['Zimbabwe Insurance Corporation']
    );
    
    let carrierId;
    
    if (existingCarriers.length > 0) {
      carrierId = existingCarriers[0].id;
      console.log(`✓ Carrier already exists: Zimbabwe Insurance Corporation (ID: ${carrierId})`);
    } else {
      // Insert insurance carrier
      const [carrierResult] = await connection.execute(
        `INSERT INTO insurance_carriers (
          name, 
          short_code, 
          contact_email, 
          contact_phone, 
          default_commission_rate, 
          is_active, 
          tenant_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          'Zimbabwe Insurance Corporation',
          'ZIC',
          'info@zic.co.zw',
          '+263 4 123456',
          15.00, // 15% commission
          1, // Active
          'default'
        ]
      );
      
      carrierId = carrierResult.insertId;
      console.log(`✓ Created carrier: Zimbabwe Insurance Corporation (ID: ${carrierId})`);
    }
    

    
    // Check if products exist
    const [existingProducts] = await connection.execute(
      'SELECT id FROM insurance_products WHERE carrier_id = ?',
      [carrierId]
    );
    
    if (existingProducts.length > 0) {
      console.log(`✓ Products already exist for carrier (${existingProducts.length} products)`);
      console.log('\n✅ Insurance data already seeded!');
      return;
    }
    
    // Insert comprehensive motor insurance product
    const [comprehensiveResult] = await connection.execute(
      `INSERT INTO insurance_products (
        carrier_id,
        product_name,
        product_code,
        coverage_type,
        base_premium_monthly,
        is_active,
        tenant_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        carrierId,
        'Comprehensive Motor Insurance',
        'ZIC-COMP-001',
        'comprehensive',
        5000, // $50 base monthly premium
        1, // Active
        'default'
      ]
    );
    
    console.log(`✓ Created product: Comprehensive Motor Insurance (ID: ${comprehensiveResult.insertId})`);
    
    // Insert third-party motor insurance product
    const [thirdPartyResult] = await connection.execute(
      `INSERT INTO insurance_products (
        carrier_id,
        product_name,
        product_code,
        coverage_type,
        base_premium_monthly,
        is_active,
        tenant_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        carrierId,
        'Third Party Motor Insurance',
        'ZIC-TP-001',
        'third_party',
        2000, // $20 base monthly premium
        1, // Active
        'default'
      ]
    );
    
    console.log(`✓ Created product: Third Party Motor Insurance (ID: ${thirdPartyResult.insertId})`);
    
    console.log('\n✅ Insurance data seeding completed successfully!');
    console.log(`   - 1 carrier created`);
    console.log(`   - 2 products created`);
    
  } catch (error) {
    console.error('❌ Error seeding insurance data:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

seedInsurance().catch(console.error);
