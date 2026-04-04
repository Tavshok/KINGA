import { createClient } from "@libsql/client";

const db = createClient({ url: process.env.DATABASE_URL });

const quotes = await db.execute("SELECT id, claim_id, quoted_amount FROM quotes LIMIT 10");
console.log("QUOTES:", JSON.stringify(quotes.rows, null, 2));

const assessments = await db.execute("SELECT id, claim_id, estimated_cost, estimated_parts_cost, estimated_labor_cost FROM ai_assessments LIMIT 5");
console.log("ASSESSMENTS:", JSON.stringify(assessments.rows, null, 2));

db.close();
