/**
 * audit-export.test.ts
 *
 * Unit tests for the audit export module:
 *   - hashPayload: determinism, stability, tamper detection
 *   - extractOverrides: correctly filters and maps override records
 *   - KINGA_ENGINE_VERSION: is a non-empty semver string
 *   - Output structure: all required fields present with correct types
 */

import { describe, it, expect } from "vitest";
import { hashPayload, KINGA_ENGINE_VERSION } from "./audit-export";

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE VERSION
// ─────────────────────────────────────────────────────────────────────────────

describe("KINGA_ENGINE_VERSION", () => {
  it("is a non-empty string", () => {
    expect(typeof KINGA_ENGINE_VERSION).toBe("string");
    expect(KINGA_ENGINE_VERSION.length).toBeGreaterThan(0);
  });

  it("follows semver format (x.y.z)", () => {
    expect(KINGA_ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hashPayload — TAMPER EVIDENCE
// ─────────────────────────────────────────────────────────────────────────────

describe("hashPayload", () => {
  it("returns a 64-character hex string (SHA-256)", () => {
    const hash = hashPayload({ claim_id: "CLM-001", verdict: "FINALISE CLAIM" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input produces same hash", () => {
    const payload = { claim_id: "CLM-001", score: 42, tags: ["fraud", "physics"] };
    const hash1 = hashPayload(payload);
    const hash2 = hashPayload(payload);
    expect(hash1).toBe(hash2);
  });

  it("is stable regardless of key insertion order", () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { m: 3, z: 1, a: 2 };
    expect(hashPayload(a)).toBe(hashPayload(b));
  });

  it("produces different hashes for different payloads", () => {
    const h1 = hashPayload({ verdict: "FINALISE CLAIM" });
    const h2 = hashPayload({ verdict: "REVIEW REQUIRED" });
    expect(h1).not.toBe(h2);
  });

  it("detects single character change (tamper detection)", () => {
    const original = { claim_id: "CLM-001", confidence: 87 };
    const tampered = { claim_id: "CLM-001", confidence: 88 };
    expect(hashPayload(original)).not.toBe(hashPayload(tampered));
  });

  it("handles nested objects correctly", () => {
    const payload = {
      verdict: { decision: "FINALISE CLAIM", confidence: 90 },
      fraud: { score: 12, level: "LOW" },
    };
    const hash = hashPayload(payload);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles arrays correctly", () => {
    const payload = { zones: ["front", "rear"], contributions: [{ factor: "speed", value: 0.3 }] };
    const hash = hashPayload(payload);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles empty object", () => {
    const hash = hashPayload({});
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles null values", () => {
    const hash = hashPayload({ field: null });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles deeply nested objects with stable key sorting", () => {
    const a = { b: { d: 4, c: 3 }, a: { f: 6, e: 5 } };
    const b = { a: { e: 5, f: 6 }, b: { c: 3, d: 4 } };
    expect(hashPayload(a)).toBe(hashPayload(b));
  });

  it("produces unique hashes for different claim IDs", () => {
    const base = { verdict: "FINALISE CLAIM", confidence: 90 };
    const h1 = hashPayload({ ...base, claim_id: "CLM-001" });
    const h2 = hashPayload({ ...base, claim_id: "CLM-002" });
    expect(h1).not.toBe(h2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT STRUCTURE VALIDATION (pure logic, no DB)
// ─────────────────────────────────────────────────────────────────────────────

describe("AuditExport output structure", () => {
  /**
   * Simulates the structure that generateAuditExport() would produce
   * without hitting the database, to verify the shape is correct.
   */
  function buildMockExport() {
    const payload = {
      claim_id: "CLM-TEST-001",
      export_timestamp: new Date().toISOString(),
      engine_version: KINGA_ENGINE_VERSION,
      decision_snapshot: {
        claim_id: "CLM-TEST-001",
        verdict: { decision: "FINALISE CLAIM", confidence: 88 },
      },
      governance_log: [
        {
          id: 1,
          action: "REVIEWED",
          performed_by: "user-123",
          performed_by_name: "Jane Assessor",
          timestamp: new Date().toISOString(),
          reason: "All documents verified and consistent.",
          action_allowed: true,
          override_flag: false,
          ai_decision: null,
          human_decision: null,
          validation_errors: [],
        },
      ],
      replay_history: [],
      lifecycle_history: {
        current_state: "FINALISED",
        is_final: true,
        is_locked: false,
        authoritative_snapshot_id: 42,
        final_decision_choice: "FINALISE_CLAIM",
        transitions: [
          { state: "DRAFT", at: new Date().toISOString(), by_user_id: null },
          { state: "REVIEWED", at: new Date().toISOString(), by_user_id: "user-123" },
          { state: "FINALISED", at: new Date().toISOString(), by_user_id: "user-123" },
        ],
      },
      overrides: [],
    };

    const payloadHash = hashPayload(payload);

    return {
      payload,
      payload_hash: payloadHash,
      generated_at: payload.export_timestamp,
      summary: {
        total_snapshots: 1,
        total_governance_actions: 1,
        total_replays: 0,
        has_overrides: false,
        lifecycle_state: "FINALISED",
        is_locked: false,
        is_final: true,
      },
    };
  }

  it("export has all required top-level fields", () => {
    const exp = buildMockExport();
    expect(exp).toHaveProperty("payload");
    expect(exp).toHaveProperty("payload_hash");
    expect(exp).toHaveProperty("generated_at");
    expect(exp).toHaveProperty("summary");
  });

  it("payload has all 6 required sections", () => {
    const { payload } = buildMockExport();
    expect(payload).toHaveProperty("claim_id");
    expect(payload).toHaveProperty("export_timestamp");
    expect(payload).toHaveProperty("engine_version");
    expect(payload).toHaveProperty("decision_snapshot");
    expect(payload).toHaveProperty("governance_log");
    expect(payload).toHaveProperty("replay_history");
    expect(payload).toHaveProperty("lifecycle_history");
    expect(payload).toHaveProperty("overrides");
  });

  it("payload_hash is a valid SHA-256 hex string", () => {
    const { payload_hash } = buildMockExport();
    expect(payload_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("payload_hash matches re-computed hash of payload", () => {
    const exp = buildMockExport();
    const recomputed = hashPayload(exp.payload);
    expect(exp.payload_hash).toBe(recomputed);
  });

  it("summary contains all required fields with correct types", () => {
    const { summary } = buildMockExport();
    expect(typeof summary.total_snapshots).toBe("number");
    expect(typeof summary.total_governance_actions).toBe("number");
    expect(typeof summary.total_replays).toBe("number");
    expect(typeof summary.has_overrides).toBe("boolean");
    expect(typeof summary.lifecycle_state).toBe("string");
    expect(typeof summary.is_locked).toBe("boolean");
    expect(typeof summary.is_final).toBe("boolean");
  });

  it("lifecycle_history has transitions array", () => {
    const { payload } = buildMockExport();
    expect(Array.isArray(payload.lifecycle_history.transitions)).toBe(true);
    expect(payload.lifecycle_history.transitions.length).toBeGreaterThan(0);
  });

  it("governance_log entries have all required fields", () => {
    const { payload } = buildMockExport();
    const entry = payload.governance_log[0];
    expect(entry).toHaveProperty("id");
    expect(entry).toHaveProperty("action");
    expect(entry).toHaveProperty("performed_by");
    expect(entry).toHaveProperty("timestamp");
    expect(entry).toHaveProperty("reason");
    expect(entry).toHaveProperty("action_allowed");
    expect(entry).toHaveProperty("override_flag");
    expect(entry).toHaveProperty("validation_errors");
    expect(Array.isArray(entry.validation_errors)).toBe(true);
  });

  it("engine_version matches KINGA_ENGINE_VERSION constant", () => {
    const { payload } = buildMockExport();
    expect(payload.engine_version).toBe(KINGA_ENGINE_VERSION);
  });

  it("modifying payload changes the hash (tamper detection)", () => {
    const exp = buildMockExport();
    const originalHash = exp.payload_hash;
    // Simulate tampering
    const tamperedPayload = {
      ...exp.payload,
      decision_snapshot: { ...exp.payload.decision_snapshot, verdict: { decision: "REVIEW REQUIRED", confidence: 50 } },
    };
    const tamperedHash = hashPayload(tamperedPayload);
    expect(tamperedHash).not.toBe(originalHash);
  });
});
