import { describe, expect, it, vi } from "vitest";

import {
  DIRECT_PROVIDER_MEDIA_INTERNALS,
  loadDirectProviderMedia,
  parseAllowedMediaHosts,
} from "./direct-provider-media";

describe("direct-provider media boundary", () => {
  it("accepts bounded base64 image data without a network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const media = await loadDirectProviderMedia(
      "data:image/png;base64,aGVsbG8=",
      undefined,
      { allowedHosts: [] }
    );

    expect(media).toEqual({ data: "aGVsbG8=", mimeType: "image/png" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects insecure, unallowlisted, and malformed controlled URLs before retrieval", async () => {
    await expect(
      loadDirectProviderMedia("http://objects.example.test/a.png", undefined, {
        allowedHosts: ["objects.example.test"],
      })
    ).rejects.toThrow("HTTPS");
    await expect(
      loadDirectProviderMedia("https://169.254.169.254/latest", undefined, {
        allowedHosts: ["objects.example.test"],
      })
    ).rejects.toThrow("not allowlisted");
    await expect(
      loadDirectProviderMedia(
        "https://objects.example.test:444/a.png",
        undefined,
        {
          allowedHosts: ["objects.example.test"],
        }
      )
    ).rejects.toThrow("credentials or a port");
  });

  it("allows only exact public DNS hostnames and rejects private/reserved addresses", () => {
    expect(
      parseAllowedMediaHosts(" a.example.test, B.example.test ,, ")
    ).toEqual(["a.example.test", "b.example.test"]);
    expect(
      DIRECT_PROVIDER_MEDIA_INTERNALS.isValidDirectMediaHost(
        "objects.example.test"
      )
    ).toBe(true);
    expect(
      DIRECT_PROVIDER_MEDIA_INTERNALS.isValidDirectMediaHost("127.0.0.1")
    ).toBe(false);
    expect(
      DIRECT_PROVIDER_MEDIA_INTERNALS.isValidDirectMediaHost("*.example.test")
    ).toBe(false);
    expect(DIRECT_PROVIDER_MEDIA_INTERNALS.isPublicAddress("10.0.0.8", 4)).toBe(
      false
    );
    expect(
      DIRECT_PROVIDER_MEDIA_INTERNALS.isPublicAddress("169.254.169.254", 4)
    ).toBe(false);
    expect(DIRECT_PROVIDER_MEDIA_INTERNALS.isPublicAddress("8.8.8.8", 4)).toBe(
      true
    );
    expect(DIRECT_PROVIDER_MEDIA_INTERNALS.isPublicAddress("::1", 6)).toBe(
      false
    );
    expect(
      DIRECT_PROVIDER_MEDIA_INTERNALS.isPublicAddress("::192.168.1.1", 6)
    ).toBe(false);
    expect(DIRECT_PROVIDER_MEDIA_INTERNALS.isPublicAddress("ff02::1", 6)).toBe(
      false
    );
    expect(
      DIRECT_PROVIDER_MEDIA_INTERNALS.isPublicAddress("64:ff9b:1::a00:1", 6)
    ).toBe(false);
    expect(DIRECT_PROVIDER_MEDIA_INTERNALS.isPublicAddress("100::1", 6)).toBe(
      false
    );
    expect(
      DIRECT_PROVIDER_MEDIA_INTERNALS.isPublicAddress("2001:2::1", 6)
    ).toBe(false);
  });
});
