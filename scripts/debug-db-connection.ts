/**
 * Debug Database Connection
 * 
 * Tests database connection and queries to diagnose validation issues
 */

import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('🔍 Testing database connection...\n');
  
  const db = await getDb();
  if (!db) {
    console.error('❌ Failed to connect to database');
    process.exit(1);
  }
  
  console.log('✅ Database connected\n');
  
  // Test 1: Count total AI assessments
  console.log('Test 1: Count total AI assessments');
  const totalQuery = await db.execute(sql`SELECT COUNT(*) as total FROM ai_assessments`);
  console.log('Result:', totalQuery[0]);
  
  // Test 2: Count AI assessments with physics_analysis
  console.log('\nTest 2: Count AI assessments with physics_analysis');
  const physicsQuery = await db.execute(sql`
    SELECT COUNT(*) as total 
    FROM ai_assessments 
    WHERE physics_analysis IS NOT NULL
  `);
  console.log('Result:', physicsQuery[0]);
  
  // Test 3: Check quantitative mode using JSON_EXTRACT
  console.log('\nTest 3: Check quantitative mode using JSON_EXTRACT');
  const quantitativeQuery = await db.execute(sql`
    SELECT 
      COUNT(*) as total_assessments,
      SUM(CASE 
        WHEN JSON_EXTRACT(physics_analysis, '$.quantitativeMode') = 1 
        THEN 1 
        ELSE 0 
      END) as quantitative_count
    FROM ai_assessments
    WHERE physics_analysis IS NOT NULL
  `);
  console.log('Result:', quantitativeQuery[0]);
  
  // Test 4: Sample physics_analysis data
  console.log('\nTest 4: Sample physics_analysis data');
  const sampleQuery = await db.execute(sql`
    SELECT 
      id,
      JSON_EXTRACT(physics_analysis, '$.quantitativeMode') as quantitative_mode,
      SUBSTRING(physics_analysis, 1, 200) as physics_sample
    FROM ai_assessments 
    WHERE physics_analysis IS NOT NULL
    LIMIT 3
  `);
  console.log('Results:');
  for (const row of sampleQuery) {
    console.log(row);
  }
  
  console.log('\n✅ Debug complete');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
