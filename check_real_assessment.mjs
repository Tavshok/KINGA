import mysql from "mysql2/promise";
const db = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await db.execute("SELECT damaged_components_json, physics_analysis, fraud_score_breakdown_json, cost_intelligence_json, inferred_hidden_damages_json, repair_intelligence_json, parts_reconciliation_json, parts_cost, labor_cost, estimated_parts_cost, estimated_labor_cost, accident_type, structural_damage_severity, confidence_score, fraud_risk_level FROM ai_assessments WHERE id = 1620015");
const a = rows[0];
const cols = Object.keys(a);
for (const col of cols) {
  const val = a[col];
  if (val === null || val === undefined) {
    console.log(col + ": NULL");
  } else {
    const str = typeof val === "string" ? val : JSON.stringify(val);
    console.log(col + ": " + str.substring(0, 500));
  }
}
await db.end();
