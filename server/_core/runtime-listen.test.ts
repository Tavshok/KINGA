import { describe, expect, it } from "vitest";
import { configuredPort, resolveListenPort } from "./runtime-listen";

describe("KINGA runtime listen-port contract", () => {
  it("retains nearby-port fallback for the managed development runtime", async () => {
    const port = await resolveListenPort(
      "managed",
      { PORT: "3000" },
      async (candidate) => candidate === 3002,
    );

    expect(port).toBe(3002);
  });

  it("binds the assigned port exactly in an external runtime", async () => {
    const port = await resolveListenPort(
      "external",
      { PORT: "8080" },
      async () => false,
    );

    expect(port).toBe(8080);
  });

  it("rejects invalid port declarations before attempting to start the service", () => {
    expect(() => configuredPort({ PORT: "not-a-port" })).toThrow(/PORT must be an integer/);
    expect(() => configuredPort({ PORT: "0" })).toThrow(/PORT must be an integer/);
  });
});
