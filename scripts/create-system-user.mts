/**
 * AUDIT-01: Create the reserved KINGA System user row.
 * This user is used as the actor for all system-triggered audit trail entries
 * (intake escalation, AI reruns, routing policy changes, etc.)
 * 
 * Run once: pnpm exec tsx scripts/create-system-user.mts
 */
import { getDb } from "../server/db.js";
import { users } from "../drizzle/schema.js";
import { eq } from "drizzle-orm";

const db = await getDb();
if (!db) throw new Error("DB not available");

// Check if system user already exists
const existing = await db.select().from(users).where(eq(users.openId, "SYSTEM")).limit(1);
if (existing.length > 0) {
  console.log(`System user already exists: id=${existing[0].id}, name=${existing[0].name}`);
  process.exit(0);
}

// Insert the system user
const result = await db.insert(users).values({
  openId: "SYSTEM",
  name: "KINGA System",
  role: "admin",
  emailVerified: 1,
});

// Fetch the inserted row to get the auto-assigned ID
const inserted = await db.select().from(users).where(eq(users.openId, "SYSTEM")).limit(1);
console.log(`System user created: id=${inserted[0].id}, name=${inserted[0].name}, role=${inserted[0].role}`);
console.log(`SYSTEM_USER_ID=${inserted[0].id}`);
process.exit(0);
