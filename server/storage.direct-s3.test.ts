import { describe, expect, it } from "vitest";

import { DIRECT_STORAGE_INTERNALS } from "./storage";

describe("direct S3 storage configuration", () => {
  it("requires a complete explicit S3-compatible credential contract", () => {
    expect(() =>
      DIRECT_STORAGE_INTERNALS.parseDirectStorageConfig({
        bucket: "",
        region: "auto",
        accessKeyId: "key",
        secretAccessKey: "secret",
        endpoint: "",
        forcePathStyle: true,
      })
    ).toThrow("S3_BUCKET");
  });

  it("accepts a credential-free HTTPS endpoint and retains no Forge fields", () => {
    const config = DIRECT_STORAGE_INTERNALS.parseDirectStorageConfig({
      bucket: "kinga-evidence",
      region: "auto",
      accessKeyId: "key",
      secretAccessKey: "secret",
      endpoint: "https://account.r2.cloudflarestorage.com",
      forcePathStyle: true,
    });

    expect(config).toEqual({
      bucket: "kinga-evidence",
      region: "auto",
      accessKeyId: "key",
      secretAccessKey: "secret",
      endpoint: "https://account.r2.cloudflarestorage.com",
      forcePathStyle: true,
    });
    expect(JSON.stringify(config)).not.toContain("FORGE");
  });

  it("rejects traversal-like keys and unsafe expiry windows", () => {
    expect(() => DIRECT_STORAGE_INTERNALS.normalizeKey("../claim.pdf")).toThrow(
      "invalid"
    );
    expect(() => DIRECT_STORAGE_INTERNALS.normalizeSignedUrlTtl(0)).toThrow(
      "between 1"
    );
    expect(DIRECT_STORAGE_INTERNALS.normalizeSignedUrlTtl(60)).toBe(60);
  });
});
