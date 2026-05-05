const mysql = require('../node_modules/mysql2/promise');

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Get existing FK constraints referencing claims
  const [fks] = await conn.execute(`
    SELECT 
      kcu.TABLE_NAME,
      kcu.CONSTRAINT_NAME,
      kcu.COLUMN_NAME,
      rc.DELETE_RULE
    FROM information_schema.KEY_COLUMN_USAGE kcu
    JOIN information_schema.REFERENTIAL_CONSTRAINTS rc 
      ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME 
      AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
    WHERE kcu.TABLE_SCHEMA = DATABASE()
      AND kcu.REFERENCED_TABLE_NAME = 'claims'
    ORDER BY kcu.TABLE_NAME
  `);

  console.log('=== FK constraints referencing claims ===');
  fks.forEach(fk => {
    const status = fk.DELETE_RULE === 'CASCADE' ? '✓ CASCADE' : '✗ ' + fk.DELETE_RULE;
    console.log(`  ${fk.TABLE_NAME}.${fk.COLUMN_NAME} [${status}]  constraint: ${fk.CONSTRAINT_NAME}`);
  });

  // Tables with claim_id column (may or may not have FK)
  const [tables] = await conn.execute(`
    SELECT TABLE_NAME FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND COLUMN_NAME = 'claim_id'
      AND TABLE_NAME != 'claims'
    ORDER BY TABLE_NAME
  `);

  const fkTables = new Set(fks.map(f => f.TABLE_NAME));
  console.log('\n=== Tables with claim_id column ===');
  tables.forEach(t => {
    const hasFk = fkTables.has(t.TABLE_NAME);
    const isOk = hasFk && fks.find(f => f.TABLE_NAME === t.TABLE_NAME)?.DELETE_RULE === 'CASCADE';
    console.log(`  ${t.TABLE_NAME}: ${isOk ? '✓ CASCADE' : hasFk ? '✗ FK exists but no CASCADE' : '✗ NO FK at all'}`);
  });

  await conn.end();
})().catch(e => console.error('ERROR:', e.message));
