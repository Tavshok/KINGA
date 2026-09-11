import { describe, expect, it } from "vitest";
import {
  structuralMetadataFingerprint,
  validateScratchTarget,
  validateWaveOnePrerequisiteSql,
  validateWaveTwoSql,
} from "../scripts/gate-c-wave-two-replay.mjs";

const requiredTableStatements = [
  "claim_assignments", "claim_documents", "claims", "drivers", "inspections",
  "insurance_audit_logs", "insurance_carriers", "insurance_policies", "insurance_products", "insurance_quotes",
  "measurement_types", "vehicle_condition_assessment", "vehicle_condition_snapshots", "vehicle_damage_history",
  "vehicle_geometry_measurements", "vehicle_market_valuations", "vehicle_mileage_logs", "vehicle_models",
  "vehicle_passport_snapshots", "vehicle_registry",
].map((tableName) => `CREATE TABLE \`${tableName}\` (\`id\` int PRIMARY KEY);`).join("\n--> statement-breakpoint\n");
const prerequisiteStatements = ["tenant_invitations", "tenants", "users"]
  .map((tableName) => `CREATE TABLE \`${tableName}\` (\`id\` int PRIMARY KEY);`).join("\n--> statement-breakpoint\n");

describe("Gate C Wave 2 scratch replay guard", () => {
  it("permits only a uniquely named loopback scratch target", () => {
    expect(validateScratchTarget("mysql://root@127.0.0.1:3317/kinga_gatec_wave2_20260911"))
      .toMatchObject({ database: "kinga_gatec_wave2_20260911", host: "127.0.0.1", port: "3317" });
  });

  it("rejects staging, production, and non-Gate-C targets before connection", () => {
    expect(() => validateScratchTarget("mysql://verify@tidb.example.com:4000/kinga_staging"))
      .toThrow("non-loopback");
    expect(() => validateScratchTarget("mysql://root@127.0.0.1:3317/kinga_production"))
      .toThrow("kinga_gatec_*");
  });

  it("permits the exact reviewed table set and an in-wave foreign key", () => {
    const sql = `${requiredTableStatements}\n--> statement-breakpoint\nALTER TABLE \`claim_assignments\` ADD CONSTRAINT \`assignment_claim_fk\` FOREIGN KEY (\`claim_id\`) REFERENCES \`claims\`(\`id\`);`;
    expect(validateWaveTwoSql(sql)).toHaveLength(21);
    expect(validateWaveOnePrerequisiteSql(prerequisiteStatements)).toHaveLength(3);
  });

  it("rejects a non-foreign-key ALTER and a foreign key to an unreviewed table", () => {
    expect(() => validateWaveTwoSql(`${requiredTableStatements}\n--> statement-breakpoint\nALTER TABLE \`claims\` ADD COLUMN \`unsafe\` int;`))
      .toThrow("permits only CREATE");
    expect(() => validateWaveTwoSql(`${requiredTableStatements}\n--> statement-breakpoint\nALTER TABLE \`claims\` ADD CONSTRAINT \`bad_fk\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`unreviewed_table\`(\`id\`);`))
      .toThrow("unreviewed table");
    expect(() => validateWaveOnePrerequisiteSql("CREATE TABLE `users` (`id` int);"))
      .toThrow("tenant_invitations");
  });

  it("compares only structure when scratch database names differ", () => {
    const structure = {
      tables: [{ tableName: "claims" }],
      constraints: [{ tableName: "claims", constraintName: "claims_id", constraintType: "PRIMARY KEY" }],
      indexes: [{ tableName: "claims", indexName: "PRIMARY", nonUnique: 0, sequence: 1, columnName: "id" }],
    };
    expect(structuralMetadataFingerprint({ target: { database: "kinga_gatec_a" }, ...structure }))
      .toBe(structuralMetadataFingerprint({ target: { database: "kinga_gatec_b" }, ...structure }));
  });
});
