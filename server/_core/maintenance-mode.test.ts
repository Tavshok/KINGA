import { describe, expect, it, vi } from "vitest";
import {
  createMaintenanceModeMiddleware,
  isMaintenanceModeEnabled,
  shouldStartMaintenanceWriteJobs,
} from "./maintenance-mode";

type ResponseRecorder = {
  statusCode?: number;
  payload?: unknown;
  status: (code: number) => ResponseRecorder;
  json: (payload: unknown) => ResponseRecorder;
};

function createResponse(): ResponseRecorder {
  return {
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
}

describe("maintenance mode", () => {
  it("is opt-in only for the literal true value", () => {
    expect(isMaintenanceModeEnabled("true")).toBe(true);
    expect(isMaintenanceModeEnabled("TRUE")).toBe(false);
    expect(isMaintenanceModeEnabled("false")).toBe(false);
    expect(isMaintenanceModeEnabled(undefined)).toBe(false);
  });

  it("fails closed before API handlers while allowing the liveness probe", () => {
    const middleware = createMaintenanceModeMiddleware(
      true,
      () => "2026-09-17T19:30:00.000Z"
    );
    const blockedResponse = createResponse();
    const blockedNext = vi.fn();

    middleware(
      { path: "/api/trpc/claims.create" } as any,
      blockedResponse as any,
      blockedNext
    );

    expect(blockedNext).not.toHaveBeenCalled();
    expect(blockedResponse.statusCode).toBe(503);
    expect(blockedResponse.payload).toEqual({
      error: "MAINTENANCE_IN_PROGRESS",
      message:
        "KINGA is temporarily unavailable for scheduled maintenance. Please try again shortly.",
      retryable: true,
      timestamp: "2026-09-17T19:30:00.000Z",
    });

    const healthResponse = createResponse();
    const healthNext = vi.fn();
    middleware({ path: "/healthz" } as any, healthResponse as any, healthNext);
    expect(healthNext).toHaveBeenCalledOnce();
    expect(healthResponse.statusCode).toBeUndefined();
  });

  it("does not interfere while disabled and suppresses startup write jobs while enabled", () => {
    const middleware = createMaintenanceModeMiddleware(false);
    const response = createResponse();
    const next = vi.fn();

    middleware(
      { path: "/api/trpc/claims.create" } as any,
      response as any,
      next
    );

    expect(next).toHaveBeenCalledOnce();
    expect(response.statusCode).toBeUndefined();
    expect(shouldStartMaintenanceWriteJobs(true)).toBe(false);
    expect(shouldStartMaintenanceWriteJobs(false)).toBe(true);
  });
});
