/**
 * auth.resync.test.ts
 *
 * KINGA-AUTH-01: Fail-closed re-sync guard.
 *
 * Verifies that authenticateRequest rejects non-owner users who are not found
 * in the database, preventing hard-deleted users from being re-created via the
 * OAuth server sync path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist all mocks to the top ────────────────────────────────────────────────
const {
  mockGetUserByOpenId,
  mockUpsertUser,
  mockUpdateUserLastSignedIn,
  mockJwtVerify,
  mockAxiosPost,
} = vi.hoisted(() => {
  const mockGetUserByOpenId = vi.fn();
  const mockUpsertUser = vi.fn().mockResolvedValue(undefined);
  const mockUpdateUserLastSignedIn = vi.fn().mockResolvedValue(undefined);
  const mockJwtVerify = vi.fn().mockResolvedValue({
    payload: {
      openId: "non-owner-open-id-456",
      appId: "test-app-id",
      name: "Test User",
    },
  });
  const mockAxiosPost = vi.fn();
  return { mockGetUserByOpenId, mockUpsertUser, mockUpdateUserLastSignedIn, mockJwtVerify, mockAxiosPost };
});

vi.mock("./db", () => ({
  getUserByOpenId: mockGetUserByOpenId,
  upsertUser: mockUpsertUser,
  updateUserLastSignedIn: mockUpdateUserLastSignedIn,
}));

vi.mock("../shared/const", () => ({
  COOKIE_NAME: "kinga_session",
  AXIOS_TIMEOUT_MS: 5000,
  ONE_YEAR_MS: 31536000000,
}));

vi.mock("./_core/env", () => ({
  ENV: {
    appId: "test-app-id",
    oAuthServerUrl: "https://oauth.test",
    cookieSecret: "test-secret-32-bytes-long-enough!",
    ownerOpenId: "owner-open-id-123",
  },
}));

vi.mock("jose", () => ({
  SignJWT: vi.fn().mockReturnValue({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue("mock-jwt-token"),
  }),
  jwtVerify: mockJwtVerify,
}));

vi.mock("axios", () => ({
  default: {
    create: vi.fn().mockReturnValue({
      post: mockAxiosPost,
    }),
  },
}));

vi.mock("cookie", () => ({
  parse: vi.fn((header: string | undefined) => {
    if (!header) return {};
    return { kinga_session: "mock-session-cookie" };
  }),
}));

import { sdk } from "./_core/sdk";

const mockReq = {
  headers: { cookie: "kinga_session=mock-session-cookie" },
} as any;

describe("KINGA-AUTH-01: Fail-closed re-sync guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsertUser.mockResolvedValue(undefined);
    mockUpdateUserLastSignedIn.mockResolvedValue(undefined);
    // Re-setup jwtVerify after clearAllMocks
    mockJwtVerify.mockResolvedValue({
      payload: {
        openId: "non-owner-open-id-456",
        appId: "test-app-id",
        name: "Test User",
      },
    });
  });

  it("rejects a non-owner user who is not found in the DB (hard-deleted user)", async () => {
    // User not in DB
    mockGetUserByOpenId.mockResolvedValue(null);

    await expect(sdk.authenticateRequest(mockReq)).rejects.toThrow("User not found");

    // Must NOT call upsertUser (no re-sync for non-owner)
    expect(mockUpsertUser).not.toHaveBeenCalled();
  });

  it("does NOT call the OAuth server for non-owner missing users", async () => {
    mockGetUserByOpenId.mockResolvedValue(null);

    await expect(sdk.authenticateRequest(mockReq)).rejects.toThrow();

    // The OAuth server must NOT be called for non-owner missing users
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it("allows a user who IS found in the DB (normal active user)", async () => {
    const activeUser = {
      id: 42,
      openId: "non-owner-open-id-456",
      name: "Active User",
      email: "active@test.com",
      role: "insurer" as const,
      tenantId: "tenant-abc",
      isActive: 1,
      insurerRole: null,
      organizationId: null,
      passwordHash: null,
      loginMethod: null,
      emailVerified: 1,
      createdAt: "2026-01-01 00:00:00",
      updatedAt: "2026-01-01 00:00:00",
      lastSignedIn: "2026-01-01 00:00:00",
      assessorTier: null,
      tierActivatedAt: null,
      tierExpiresAt: null,
      performanceScore: 70,
      totalAssessmentsCompleted: 0,
      averageVarianceFromFinal: null,
      accuracyScore: "0.00",
      avgCompletionTime: "0.00",
      marketplaceProfileId: null,
      deactivatedAt: null,
    };
    // Lookup returns the user; activity update uses the update-only writer.
    mockGetUserByOpenId.mockResolvedValue(activeUser);

    const result = await sdk.authenticateRequest(mockReq);
    expect(result.id).toBe(42);
    expect(result.openId).toBe("non-owner-open-id-456");
    expect(mockUpdateUserLastSignedIn).toHaveBeenCalledWith(
      "non-owner-open-id-456",
      expect.any(String),
    );
  });

  it("rejects a deactivated user (isActive=0) even if found in DB", async () => {
    const deactivatedUser = {
      id: 99,
      openId: "non-owner-open-id-456",
      name: "Deactivated User",
      email: "deactivated@test.com",
      role: "insurer" as const,
      tenantId: "tenant-abc",
      isActive: 0,
      insurerRole: null,
      organizationId: null,
      passwordHash: null,
      loginMethod: null,
      emailVerified: 1,
      createdAt: "2026-01-01 00:00:00",
      updatedAt: "2026-01-01 00:00:00",
      lastSignedIn: "2026-01-01 00:00:00",
      assessorTier: null,
      tierActivatedAt: null,
      tierExpiresAt: null,
      performanceScore: 70,
      totalAssessmentsCompleted: 0,
      averageVarianceFromFinal: null,
      accuracyScore: "0.00",
      avgCompletionTime: "0.00",
      marketplaceProfileId: null,
      deactivatedAt: "2026-07-01 00:00:00",
    };
    mockGetUserByOpenId.mockResolvedValue(deactivatedUser);

    await expect(sdk.authenticateRequest(mockReq)).rejects.toThrow("Account has been deactivated");
  });
});
