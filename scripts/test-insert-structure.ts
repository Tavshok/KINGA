import { getDb } from "../server/db";
import { claims } from "../drizzle/schema";

async function testInsertReturn() {
  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    return;
  }

  const result = await db.insert(claims).values({
    claimNumber: `TEST-INSERT-${Date.now()}`,
    claimantId: 1,
    tenantId: "test-tenant",
    status: "submitted",
    workflowState: "created",
    createdAt: new Date(),
  });

  console.log("=== INSERT RESULT ===");
  console.log("Type:", typeof result);
  console.log("Is Array:", Array.isArray(result));
  console.log("Constructor:", result.constructor.name);
  console.log("Keys:", Object.keys(result));
  console.log("Full result:", JSON.stringify(result, (key, value) => 
    typeof value === 'bigint' ? value.toString() + 'n' : value
  , 2));
  
  if (Array.isArray(result)) {
    console.log("\n=== ARRAY ELEMENTS ===");
    result.forEach((item, index) => {
      console.log(`Element ${index}:`, typeof item);
      console.log(`  Keys:`, Object.keys(item));
      console.log(`  insertId:`, item.insertId, `(type: ${typeof item.insertId})`);
    });
  }
  
  // Try different access patterns
  console.log("\n=== ACCESS PATTERNS ===");
  console.log("result.insertId:", (result as any).insertId);
  console.log("result[0]:", (result as any)[0]);
  console.log("result[0].insertId:", (result as any)[0]?.insertId);
  
  process.exit(0);
}

testInsertReturn().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
