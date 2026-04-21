import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const sql = `
CREATE TABLE IF NOT EXISTS \`component_repair_outcomes\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`claim_id\` int NOT NULL,
  \`assessment_id\` int NOT NULL,
  \`component_name\` varchar(120) NOT NULL,
  \`component_category\` varchar(60),
  \`severity_at_decision\` varchar(30),
  \`vehicle_make\` varchar(80),
  \`vehicle_model\` varchar(80),
  \`vehicle_year\` int,
  \`vehicle_age_years\` int,
  \`outcome\` enum('repair','replace','write_off') NOT NULL,
  \`ai_suggestion\` enum('repair','replace','uncertain'),
  \`was_override\` tinyint NOT NULL DEFAULT 0,
  \`adjuster_user_id\` int,
  \`repair_cost_usd\` decimal(10,2),
  \`replace_cost_usd\` decimal(10,2),
  \`decided_at\` varchar(50) NOT NULL,
  \`created_at\` varchar(50) NOT NULL,
  PRIMARY KEY (\`id\`),
  INDEX \`idx_cro_claim_id\` (\`claim_id\`),
  INDEX \`idx_cro_component_severity\` (\`component_name\`, \`severity_at_decision\`),
  INDEX \`idx_cro_make_model\` (\`vehicle_make\`, \`vehicle_model\`),
  INDEX \`idx_cro_outcome\` (\`outcome\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

try {
  await conn.execute(sql);
  console.log("Table component_repair_outcomes created (or already exists)");
} catch (err) {
  console.error("Error:", err.message);
} finally {
  await conn.end();
}
