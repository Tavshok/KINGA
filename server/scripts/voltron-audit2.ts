import "dotenv/config";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

async function findDeep(obj: any, key: string): any {
  if (!obj || typeof obj !== "object") return null;
  if (key in obj) return obj[key];
  for (const k of Object.keys(obj)) {
    const found = findDeep(obj[k], key);
    if (found !== null) return found;
  }
  return null;
}

async function main() {
  const db = await getDb();
  const rows = await db.execute(sql`SELECT claim_truth_object_json FROM ai_assessments WHERE id = 15720001`);
  const row = (rows as any)[0][0];
  const cto = typeof row.claim_truth_object_json === "string" ? JSON.parse(row.claim_truth_object_json) : row.claim_truth_object_json;
  
  const dmgClass = findDeep(cto, "damageClassification");
  if (!dmgClass) { console.log("NOT FOUND"); return; }
  
  console.log("overallClassification:", dmgClass.overallClassification);
  console.log("counts:", JSON.stringify(dmgClass.counts));
  console.log("restraintSystemCheck:", JSON.stringify(dmgClass.restraintSystemCheck));
  console.log("crushDepthCheck:", JSON.stringify(dmgClass.crushDepthCheck));
  console.log("expectedProfile.airbagExpected:", dmgClass.expectedProfile?.airbagExpected);
  console.log("expectedProfile.pretensionerExpected:", dmgClass.expectedProfile?.pretensionerExpected);
  console.log("expectedProfile.minCrushDepthM:", dmgClass.expectedProfile?.minCrushDepthM);
  console.log("expectedProfile.maxCrushDepthM:", dmgClass.expectedProfile?.maxCrushDepthM);
  console.log("components count:", dmgClass.components?.length ?? 0);
  
  if (dmgClass.components?.length > 0) {
    console.log("\nAll components:");
    dmgClass.components.forEach((c: any) => {
      console.log(`  [${c.classification}] ${c.partName} — ${c.reason}`);
    });
  } else {
    // The components may be at a different key
    console.log("components array is empty — checking for other keys:", Object.keys(dmgClass));
    // Print the raw damageClassification
    console.log(JSON.stringify(dmgClass, null, 2).substring(0, 5000));
  }
}

main().catch(console.error).finally(() => process.exit(0));
