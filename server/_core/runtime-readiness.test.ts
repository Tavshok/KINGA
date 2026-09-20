import { describe, expect, it } from "vitest";
import { getG1ServiceRouteReadiness, getRuntimeReadiness } from "./runtime-readiness";

describe("KINGA external runtime readiness contract", () => {
  it("keeps the current managed runtime contract explicit without exposing values", () => {
    const readiness = getRuntimeReadiness({
      DATABASE_URL: "mysql://redacted",
      JWT_SECRET: "never-return-this-value",
      KINGA_RELEASE_VERSION: "test-release",
    });

    expect(readiness).toMatchObject({
      status: "ready",
      runtimeMode: "managed",
      releaseVersion: "test-release",
      verificationScope: "configuration-only",
      configurationReady: true,
    });
    expect(readiness.requiredConfiguration).toEqual(["DATABASE_URL", "JWT_SECRET"]);
    expect(JSON.stringify(readiness)).not.toContain("never-return-this-value");
  });

  it("does not declare an external runtime ready until all provider-neutral boundaries are named", () => {
    const readiness = getRuntimeReadiness({
      KINGA_RUNTIME_MODE: "external",
      DATABASE_URL: "mysql://redacted",
      JWT_SECRET: "redacted",
      KINGA_PUBLIC_APP_ORIGIN: "https://staging.example.test",
    });

    expect(readiness.status).toBe("not_ready");
    expect(readiness.missingConfiguration).toEqual([
      "KINGA_API_ORIGIN",
      "KINGA_IDENTITY_MODE",
      "KINGA_OBJECT_STORAGE_MODE",
      "KINGA_SCHEDULER_AUTH_MODE",
      "KINGA_JOB_EXECUTION_MODE",
      "KINGA_WEBSOCKET_MODE",
    ]);
  });

  it("accepts a complete external staging declaration using non-production HTTP origins", () => {
    const readiness = getRuntimeReadiness({
      KINGA_RUNTIME_MODE: "external",
      DATABASE_URL: "mysql://redacted",
      JWT_SECRET: "redacted",
      KINGA_PUBLIC_APP_ORIGIN: "http://localhost:5173",
      KINGA_API_ORIGIN: "http://localhost:3000",
      KINGA_IDENTITY_MODE: "oidc",
      KINGA_OBJECT_STORAGE_MODE: "s3-compatible",
      KINGA_SCHEDULER_AUTH_MODE: "machine-identity",
      KINGA_JOB_EXECUTION_MODE: "queue-worker",
      KINGA_WEBSOCKET_MODE: "edge-or-same-server",
    });

    expect(readiness).toMatchObject({
      status: "ready",
      runtimeMode: "external",
      verificationScope: "configuration-only",
      configurationReady: true,
      missingConfiguration: [],
      invalidConfiguration: [],
    });
  });

  it("requires HTTPS origins when an external runtime is marked production", () => {
    const readiness = getRuntimeReadiness({
      NODE_ENV: "production",
      KINGA_RUNTIME_MODE: "external",
      DATABASE_URL: "mysql://redacted",
      JWT_SECRET: "redacted",
      KINGA_PUBLIC_APP_ORIGIN: "http://app.example.test",
      KINGA_API_ORIGIN: "http://api.example.test",
      KINGA_IDENTITY_MODE: "oidc",
      KINGA_OBJECT_STORAGE_MODE: "s3-compatible",
      KINGA_SCHEDULER_AUTH_MODE: "machine-identity",
      KINGA_JOB_EXECUTION_MODE: "queue-worker",
      KINGA_WEBSOCKET_MODE: "edge-or-same-server",
    });

    expect(readiness.status).toBe("not_ready");
    expect(readiness.invalidConfiguration).toEqual([
      "KINGA_PUBLIC_APP_ORIGIN (must be an origin; HTTPS required in production)",
      "KINGA_API_ORIGIN (must be an origin; HTTPS required in production)",
    ]);
  });

  it("flags an unsupported runtime mode rather than assuming a safe configuration", () => {
    const readiness = getRuntimeReadiness({
      KINGA_RUNTIME_MODE: "unknown-provider",
      DATABASE_URL: "mysql://redacted",
      JWT_SECRET: "redacted",
    });

    expect(readiness.status).toBe("not_ready");
    expect(readiness.runtimeMode).toBe("invalid");
    expect(readiness.invalidConfiguration).toContain(
      "KINGA_RUNTIME_MODE (must be managed or external)",
    );
  });
});

describe("G1 service route readiness declaration", () => {
  it.each([undefined, "", "false", "TRUE", "1", "yes"])(
    "fails closed when G1_SERVICE_ROUTES_ENABLED is %s",
    (value) => {
      const readiness = getG1ServiceRouteReadiness({
        G1_SERVICE_ROUTES_ENABLED: value,
        KINGA_SERVICE_ENVIRONMENT: "ci-test",
        KINGA_SCHEDULER_OF_RECORD: "owner-decision-pending",
      });
      expect(readiness.enabled).toBe(false);
      expect(readiness.configurationReady).toBe(false);
      expect(readiness.routeBoundaryMounted).toBe(false);
    },
  );

  it("reports names and validation only, never values or inferred activation", () => {
    const readiness = getG1ServiceRouteReadiness({
      G1_SERVICE_ROUTES_ENABLED: "true",
      KINGA_SERVICE_ENVIRONMENT: "ci-test",
      KINGA_SCHEDULER_OF_RECORD: "not-selected-provider-neutral",
    });
    expect(readiness).toEqual({
      enabled: true,
      routeBoundaryMounted: false,
      verificationScope: "configuration-only",
      requiredConfiguration: [
        "G1_SERVICE_ROUTES_ENABLED",
        "KINGA_SERVICE_ENVIRONMENT",
        "KINGA_SCHEDULER_OF_RECORD",
      ],
      missingConfiguration: [],
      invalidConfiguration: [],
      configurationReady: true,
    });
    expect(JSON.stringify(readiness)).not.toContain("not-selected-provider-neutral");
  });
});
