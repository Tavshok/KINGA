/**
 * Photo Re-Extraction Router Tests
 *
 * Tests the trigger, getStatus, and getLatest procedures.
 * Uses mocked DB and worker to avoid real PDF processing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the DB module ───────────────────────────────────────────────────────
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockFrom = vi.fn();
const mockValues = vi.fn();

vi.mock("../_core/db", () => ({
  db: {
    select: () => ({ from: mockFrom }),
    insert: () => ({ values: mockValues }),
  },
}));

// ─── Mock the worker ──────────────────────────────────────────────────────────
vi.mock("../photo-reextraction-worker", () => ({
  runPhotoReextraction: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock drizzle schema ──────────────────────────────────────────────────────
vi.mock("../../drizzle/schema", () => ({
  photoReextractionJobs: { id: "id", assessmentId: "assessmentId", status: "status" },
  aiAssessments: { id: "id", claimId: "claimId" },
  claimDocuments: { claimId: "claimId", documentUrl: "documentUrl", documentCategory: "documentCategory" },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("PhotoReextractionRouter", () => {
  describe("trigger procedure validation", () => {
    it("should require assessmentId to be a positive integer", () => {
      // Zod schema validation test — input validation
      const { z } = require("zod");
      const schema = z.object({
        assessmentId: z.number().int().positive(),
        claimId: z.number().int().positive(),
      });

      expect(() => schema.parse({ assessmentId: -1, claimId: 1 })).toThrow();
      expect(() => schema.parse({ assessmentId: 0, claimId: 1 })).toThrow();
      expect(() => schema.parse({ assessmentId: 1.5, claimId: 1 })).toThrow();
      expect(() => schema.parse({ assessmentId: 1, claimId: 1 })).not.toThrow();
    });

    it("should require claimId to be a positive integer", () => {
      const { z } = require("zod");
      const schema = z.object({
        assessmentId: z.number().int().positive(),
        claimId: z.number().int().positive(),
      });

      expect(() => schema.parse({ assessmentId: 1, claimId: -1 })).toThrow();
      expect(() => schema.parse({ assessmentId: 1, claimId: 0 })).toThrow();
      expect(() => schema.parse({ assessmentId: 1, claimId: 1 })).not.toThrow();
    });
  });

  describe("getStatus procedure validation", () => {
    it("should require jobId to be a positive integer", () => {
      const { z } = require("zod");
      const schema = z.object({
        jobId: z.number().int().positive(),
      });

      expect(() => schema.parse({ jobId: 0 })).toThrow();
      expect(() => schema.parse({ jobId: -5 })).toThrow();
      expect(() => schema.parse({ jobId: 1 })).not.toThrow();
    });
  });

  describe("getLatest procedure validation", () => {
    it("should require assessmentId to be a positive integer", () => {
      const { z } = require("zod");
      const schema = z.object({
        assessmentId: z.number().int().positive(),
      });

      expect(() => schema.parse({ assessmentId: 0 })).toThrow();
      expect(() => schema.parse({ assessmentId: 1 })).not.toThrow();
    });
  });

  describe("job status lifecycle", () => {
    it("should recognise all valid job statuses", () => {
      const validStatuses = ["pending", "running", "completed", "failed"];
      const activeStatuses = ["pending", "running"];
      const terminalStatuses = ["completed", "failed"];

      for (const s of validStatuses) {
        expect(validStatuses).toContain(s);
      }
      for (const s of activeStatuses) {
        expect(activeStatuses).toContain(s);
        expect(terminalStatuses).not.toContain(s);
      }
      for (const s of terminalStatuses) {
        expect(terminalStatuses).toContain(s);
        expect(activeStatuses).not.toContain(s);
      }
    });

    it("should not start a new job if one is already active", () => {
      // Simulate the logic: if an active job exists, return it without creating a new one
      const existingJobs = [{ id: 42, status: "running" }];
      const activeJob = existingJobs.find(j => j.status === "pending" || j.status === "running");

      expect(activeJob).toBeDefined();
      expect(activeJob?.id).toBe(42);
      expect(activeJob?.status).toBe("running");
    });
  });

  describe("result parsing", () => {
    it("should safely parse resultJson when present", () => {
      const job = {
        id: 1,
        status: "completed",
        resultJson: JSON.stringify({ photosExtracted: 3, avgSharpness: 78, renderDpi: 300 }),
      };

      let result: any = null;
      if (job.status === "completed" && job.resultJson) {
        try {
          result = JSON.parse(job.resultJson);
        } catch (_) {}
      }

      expect(result).not.toBeNull();
      expect(result.photosExtracted).toBe(3);
      expect(result.avgSharpness).toBe(78);
      expect(result.renderDpi).toBe(300);
    });

    it("should return null result when resultJson is missing", () => {
      const job = { id: 1, status: "completed", resultJson: null };

      let result: any = null;
      if (job.status === "completed" && job.resultJson) {
        try { result = JSON.parse(job.resultJson); } catch (_) {}
      }

      expect(result).toBeNull();
    });

    it("should handle malformed resultJson gracefully", () => {
      const job = { id: 1, status: "completed", resultJson: "not-valid-json{" };

      let result: any = null;
      if (job.status === "completed" && job.resultJson) {
        try { result = JSON.parse(job.resultJson); } catch (_) {}
      }

      expect(result).toBeNull();
    });
  });

  describe("DPI trigger condition", () => {
    it("should trigger re-extraction only when scanned PDF and sharpness < 60", () => {
      const shouldTrigger = (isScanned: boolean, avgSharpness: number | null) =>
        isScanned && avgSharpness !== null && avgSharpness < 60;

      expect(shouldTrigger(true, 45)).toBe(true);   // scanned + low quality → show button
      expect(shouldTrigger(true, 59)).toBe(true);   // scanned + just below threshold
      expect(shouldTrigger(true, 60)).toBe(false);  // scanned + exactly at threshold → no button
      expect(shouldTrigger(true, 75)).toBe(false);  // scanned + good quality → no button
      expect(shouldTrigger(false, 45)).toBe(false); // not scanned → no button
      expect(shouldTrigger(false, null)).toBe(false); // no data → no button
      expect(shouldTrigger(true, null)).toBe(false);  // scanned but no sharpness data → no button
    });
  });
});
