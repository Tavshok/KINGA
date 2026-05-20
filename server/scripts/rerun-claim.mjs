/**
 * Script to re-run the AI assessment on a specific claim.
 * Usage: node server/scripts/rerun-claim.mjs [claimId]
 * 
 * If no claimId provided, finds the most recent claim with panel_beater_quotes.
 */
import { createConnection } from "mysql2/promise";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

// Load env from .env file
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "../../.env");
let envVars = {};
try {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

const dbUrl = envVars.DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("No DATABASE_URL found");
  process.exit(1);
}

// Parse DATABASE_URL: mysql://user:pass@host:port/dbname
const urlMatch = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:\/]+)(?::(\d+))?\/(.+)/);
if (!urlMatch) {
  console.error("Could not parse DATABASE_URL:", dbUrl);
  process.exit(1);
}

const [, user, password, host, port, database] = urlMatch;

const conn = await createConnection({
  host,
  port: parseInt(port || "3306"),
  user,
  password,
  database,
  ssl: { rejectUnauthorized: false },
});

// Find recent claims and their quote counts
const [rows] = await conn.query(`
  SELECT c.id, c.claim_number, c.status, c.document_processing_status,
         COUNT(pbq.id) as quote_count,
         c.created_at
  FROM claims c
  LEFT JOIN panel_beater_quotes pbq ON pbq.claim_id = c.id
  GROUP BY c.id
  ORDER BY c.created_at DESC
  LIMIT 10
`);

console.log("\n=== Recent Claims ===");
console.table(rows);

await conn.end();
