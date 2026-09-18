import { describe, expect, it, vi } from "vitest";
import { storageGet, storagePut } from "./storage";

describe("storage test isolation", () => {
  it("rejects direct upload and download access before reading credentials or calling fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      storagePut("tests/blocked.txt", "blocked", "text/plain")
    ).rejects.toThrow("Direct storage access is disabled during tests");
    await expect(storageGet("tests/blocked.txt")).rejects.toThrow(
      "Direct storage access is disabled during tests"
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
