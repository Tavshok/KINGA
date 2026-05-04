import mysql2 from './node_modules/mysql2/promise.js';
const { createConnection } = mysql2;

const conn = await createConnection(process.env.DATABASE_URL);

// Run each ALTER as a separate statement to isolate errors
const statements = [
  // Routing columns (TEXT cannot have DEFAULT in MySQL — omit default)
  `ALTER TABLE claim_comments ADD COLUMN \`to_roles\` TEXT NOT NULL AFTER \`author_role\``,
  `ALTER TABLE claim_comments ADD COLUMN \`to_user_ids\` TEXT NOT NULL AFTER \`to_roles\``,
  `ALTER TABLE claim_comments ADD COLUMN \`to_emails\` TEXT NOT NULL AFTER \`to_user_ids\``,

  // Threading + resolution
  `ALTER TABLE claim_comments ADD COLUMN \`parent_comment_id\` INT NULL AFTER \`body\``,
  `ALTER TABLE claim_comments ADD COLUMN \`is_resolved\` TINYINT NOT NULL DEFAULT 0 AFTER \`parent_comment_id\``,
  `ALTER TABLE claim_comments ADD COLUMN \`resolved_by_user_id\` INT NULL AFTER \`is_resolved\``,
  `ALTER TABLE claim_comments ADD COLUMN \`resolved_at\` VARCHAR(50) NULL AFTER \`resolved_by_user_id\``,

  // Response deadline + email flag
  `ALTER TABLE claim_comments ADD COLUMN \`requires_response\` TINYINT NOT NULL DEFAULT 0 AFTER \`comment_type\``,
  `ALTER TABLE claim_comments ADD COLUMN \`response_deadline_at\` VARCHAR(50) NULL AFTER \`requires_response\``,
  `ALTER TABLE claim_comments ADD COLUMN \`email_sent\` TINYINT NOT NULL DEFAULT 0 AFTER \`resolved_at\``,

  // Backfill TEXT columns with empty JSON arrays
  `UPDATE claim_comments SET to_roles = '[]', to_user_ids = '[]', to_emails = '[]' WHERE to_roles IS NULL OR to_roles = ''`,

  // Index on parent_comment_id
  `ALTER TABLE claim_comments ADD INDEX idx_cc_parent_comment_id (parent_comment_id)`,
];

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.slice(0, 90).replace(/\n/g, ' ').trim());
  } catch(e) {
    const msg = e.message;
    if (msg.includes('Duplicate column') || msg.includes('Duplicate key') || msg.includes('already exists') || msg.includes('Multiple primary key')) {
      console.log('SKIP (exists):', stmt.slice(0, 60).replace(/\n/g, ' ').trim());
    } else {
      console.log('ERR:', msg.slice(0, 160));
    }
  }
}

// Verify final columns
const [cols] = await conn.execute('SHOW COLUMNS FROM claim_comments');
console.log('\nFinal columns:', cols.map(c => c.Field).join(', '));

await conn.end();
console.log('Migration complete');
