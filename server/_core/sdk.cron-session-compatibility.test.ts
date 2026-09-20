import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserByOpenId: vi.fn(),
  updateUserLastSignedIn: vi.fn(),
  jwtVerify: vi.fn(),
  axiosPost: vi.fn(),
}));

vi.mock("../db", () => ({
  getUserByOpenId: mocks.getUserByOpenId,
  updateUserLastSignedIn: mocks.updateUserLastSignedIn,
}));

vi.mock("../shared/const", () => ({
  COOKIE_NAME: "app_session_id",
  AXIOS_TIMEOUT_MS: 5_000,
  ONE_YEAR_MS: 31_536_000_000,
}));

vi.mock("./env", () => ({
  ENV: {
    appId: "cron-session-test-app",
    oAuthServerUrl: "https://oauth.example.test",
    cookieSecret: "cron-session-test-secret-at-least-32-chars",
  },
}));

vi.mock("jose", () => ({
  SignJWT: vi.fn(),
  jwtVerify: mocks.jwtVerify,
}));

vi.mock("axios", () => ({
  default: { create: vi.fn(() => ({ post: mocks.axiosPost })) },
}));

vi.mock("cookie", () => ({
  parse: vi.fn(() => ({ app_session_id: "cron-session-token" })),
}));

import { sdk } from "./sdk";

describe("Package F cron session compatibility", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        openId: "cron_intake-escalation",
        appId: "cron-session-test-app",
        name: "Heartbeat",
      },
    });
  });

  it("keeps the existing cron bridge outside ordinary local-user entitlement", async () => {
    const getUserInfoWithJwt = vi
      .spyOn(sdk, "getUserInfoWithJwt")
      .mockResolvedValue({
        openId: "cron_intake-escalation",
        name: "Heartbeat",
        taskUid: "intake-escalation",
      } as any);

    const user = await sdk.authenticateRequest({
      headers: { cookie: "app_session_id=cron-session-token" },
    } as any);

    expect(user).toMatchObject({
      openId: "cron_intake-escalation",
      isCron: true,
      taskUid: "intake-escalation",
    });
    expect(getUserInfoWithJwt).toHaveBeenCalledWith("cron-session-token");
    expect(mocks.getUserByOpenId).not.toHaveBeenCalled();
    expect(mocks.updateUserLastSignedIn).not.toHaveBeenCalled();
  });
});
