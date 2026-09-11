import { describe, expect, it } from "vitest";
import {
  structuralMetadataFingerprint,
  validateScratchTarget,
  validateWaveOneSql,
} from "../scripts/gate-c-wave-one-replay.mjs";

describe("Gate C Wave 1 scratch replay guard", () => {
  it("permits only a uniquely named loopback scratch target", () => {
    expect(validateScratchTarget("mysql://root@127.0.0.1:3317/kinga_gatec_wave1_20260911"))
      .toMatchObject({ database: "kinga_gatec_wave1_20260911", host: "127.0.0.1", port: "3317" });
  });

  it("rejects staging, production, and non-Gate-C database names before connection", () => {
    expect(() => validateScratchTarget("mysql://verify@tidb.example.com:4000/kinga_staging"))
      .toThrow("non-loopback");
    expect(() => validateScratchTarget("mysql://root@127.0.0.1:3317/kinga_staging"))
      .toThrow("kinga_gatec_*");
  });

  it("rejects non-create SQL and unexpected tables", () => {
    expect(() => validateWaveOneSql("DROP TABLE users;"))
      .toThrow("CREATE TABLE and CREATE INDEX");
    expect(() => validateWaveOneSql("CREATE TABLE `users` (`id` int);"))
      .toThrow("tenant_invitations");
  });

  it("compares replay structure without treating a unique scratch database name as schema drift", () => {
    const structure = {
      tables: [{ tableName: "users" }],
      constraints: [{ tableName: "users", constraintName: "users_id", constraintType: "PRIMARY KEY" }],
      indexes: [{ tableName: "users", indexName: "PRIMARY", nonUnique: 0, sequence: 1, columnName: "id" }],
    };
    expect(structuralMetadataFingerprint({
      target: { database: "kinga_gatec_first" },
      ...structure,
    })).toBe(structuralMetadataFingerprint({
      target: { database: "kinga_gatec_second" },
      ...structure,
    }));
  });
});
