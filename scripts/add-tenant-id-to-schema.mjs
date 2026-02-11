import { readFileSync, writeFileSync } from 'fs';

// Tables that need tenant_id for multi-tenant isolation
const tablesToUpdate = [
  'aiAssessments',
  'assessorEvaluations',
  'panelBeaterQuotes',
  'appointments',
  'auditTrail',
  'claimDocuments',
  'notifications',
  'fraudIndicators',
  'organizations',
  'claimComments',
  'quoteLineItems',
  'approvalWorkflow'
];

const schemaPath = '/home/ubuntu/kinga-replit/drizzle/schema.ts';
let schema = readFileSync(schemaPath, 'utf-8');

// Add tenant_id field before createdAt timestamp for each table
tablesToUpdate.forEach(tableName => {
  const tenantIdLine = `  tenantId: varchar("tenant_id", { length: 255 }), // Multi-tenant isolation\n`;
  
  // Find the table definition and add tenant_id before createdAt
  const tableRegex = new RegExp(`export const ${tableName} = mysqlTable\\([^}]+createdAt:`, 's');
  
  if (tableRegex.test(schema)) {
    schema = schema.replace(
      new RegExp(`(export const ${tableName} = mysqlTable\\([^}]+)(createdAt:)`, 's'),
      `$1${tenantIdLine}  $2`
    );
    console.log(`✓ Added tenant_id to ${tableName}`);
  } else {
    console.log(`✗ Could not find ${tableName} or it already has tenant_id`);
  }
});

writeFileSync(schemaPath, schema);
console.log('\n✅ Schema updated successfully!');
console.log('Run `pnpm db:push` to apply changes to the database.');
