import mysql2 from './node_modules/mysql2/promise.js';
const { createConnection } = mysql2;

const conn = await createConnection(process.env.DATABASE_URL);

const statements = [
  `ALTER TABLE claim_comments ADD COLUMN \`notify_claimant\` TINYINT NOT NULL DEFAULT 0 AFTER \`email_sent\``,
  `ALTER TABLE claim_comments ADD COLUMN \`claimant_email_sent\` TINYINT NOT NULL DEFAULT 0 AFTER \`notify_claimant\``,
  `ALTER TABLE claim_comments ADD COLUMN \`status_update_template\` VARCHAR(100) NULL AFTER \`claimant_email_sent\``,
];

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.slice(0, 90).replace(/\n/g, ' ').trim());
  } catch(e) {
    const msg = e.message;
    if (msg.includes('Duplicate column') || msg.includes('already exists')) {
      console.log('SKIP (exists):', stmt.slice(0, 60).replace(/\n/g, ' ').trim());
    } else {
      console.log('ERR:', msg.slice(0, 160));
    }
  }
}

const [cols] = await conn.execute('SHOW COLUMNS FROM claim_comments');
console.log('\nFinal columns:', cols.map(c => c.Field).join(', '));

await conn.end();
console.log('Migration 2 complete');
