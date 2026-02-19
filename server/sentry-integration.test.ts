// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import { captureError, captureMessage } from "./_core/sentry";

describe("Sentry Integration", () => {
  beforeEach(() => {
    // Clear any previous mocks
    vi.clearAllMocks();
  });

  describe("Server-Side Error Capture", () => {
    it("should have captureError function available", () => {
      expect(typeof captureError).toBe("function");
    });

    it("should have captureMessage function available", () => {
      expect(typeof captureMessage).toBe("function");
    });

    it("should accept error with user context", () => {
      const testError = new Error("Test error");
      const context = {
        user: {
          id: 1,
          email: "test@example.com",
          tenantId: "test-tenant",
        },
      };

      // Should not throw
      expect(() => captureError(testError, context)).not.toThrow();
    });

    it("should accept error with request context", () => {
      const testError = new Error("Test request error");
      const context = {
        request: {
          method: "POST",
          url: "/api/trpc/claims.create",
          body: { claimNumber: "TEST-001" },
        },
      };

      // Should not throw
      expect(() => captureError(testError, context)).not.toThrow();
    });

    it("should accept error with extra context", () => {
      const testError = new Error("Test error with extra");
      const context = {
        extra: {
          claimId: 123,
          action: "approval",
          timestamp: new Date().toISOString(),
        },
      };

      // Should not throw
      expect(() => captureError(testError, context)).not.toThrow();
    });

    it("should accept error with combined context", () => {
      const testError = new Error("Test combined context");
      const context = {
        user: {
          id: 1,
          email: "test@example.com",
          tenantId: "test-tenant",
        },
        request: {
          method: "POST",
          url: "/api/trpc/claims.approve",
        },
        extra: {
          claimId: 456,
        },
      };

      // Should not throw
      expect(() => captureError(testError, context)).not.toThrow();
    });
  });

  describe("Message Capture", () => {
    it("should capture info message", () => {
      expect(() => captureMessage("Test info message", "info")).not.toThrow();
    });

    it("should capture warning message", () => {
      expect(() => captureMessage("Test warning message", "warning")).not.toThrow();
    });

    it("should capture error message", () => {
      expect(() => captureMessage("Test error message", "error")).not.toThrow();
    });

    it("should default to info level", () => {
      expect(() => captureMessage("Test default message")).not.toThrow();
    });
  });

  describe("Error Context Validation", () => {
    it("should handle error without context", () => {
      const testError = new Error("Test error without context");
      
      // Should not throw
      expect(() => captureError(testError)).not.toThrow();
    });

    it("should handle error with partial context", () => {
      const testError = new Error("Test partial context");
      const context = {
        tenantId: "test-tenant",
      };

      // Should not throw
      expect(() => captureError(testError, context)).not.toThrow();
    });

    it("should handle error with undefined user", () => {
      const testError = new Error("Test undefined user");
      const context = {
        user: undefined,
        extra: { test: "data" },
      };

      // Should not throw
      expect(() => captureError(testError, context)).not.toThrow();
    });
  });
});
