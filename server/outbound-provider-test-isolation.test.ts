import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  oauthPost: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({ post: mocks.oauthPost })),
  },
}));

import { invokeLLM } from "./_core/llm";
import { sdk } from "./_core/sdk";

describe("outbound provider test isolation", () => {
  it("rejects direct LLM access before credentials or fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      invokeLLM({ messages: [{ role: "user", content: "test-only request" }] })
    ).rejects.toThrow("Direct LLM access is disabled during tests");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects each OAuth transport before Axios can make a request", async () => {
    await expect(
      sdk.exchangeCodeForToken("test-code", "dGVzdC1zdGF0ZQ==")
    ).rejects.toThrow("Direct OAuth access is disabled during tests");
    await expect(sdk.getUserInfo("test-access-token")).rejects.toThrow(
      "Direct OAuth access is disabled during tests"
    );
    await expect(sdk.getUserInfoWithJwt("test-session-token")).rejects.toThrow(
      "Direct OAuth access is disabled during tests"
    );

    expect(mocks.oauthPost).not.toHaveBeenCalled();
  });
});
