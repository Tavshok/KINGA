import { describe, expect, it } from "vitest";

import {
  getConfiguredAiProvider,
  getConfiguredObjectStorageProvider,
  getConfiguredRuntimeMode,
} from "./env";

describe("direct runtime adapter selection", () => {
  it("canonicalizes values and denies Forge AI in external mode", () => {
    expect(getConfiguredRuntimeMode(" EXTERNAL ")).toBe("external");
    expect(getConfiguredAiProvider("external", "Gemini")).toBe("gemini");
    expect(() => getConfiguredAiProvider("external", undefined)).toThrow(
      "External runtime requires AI_PROVIDER"
    );
    expect(() => getConfiguredAiProvider("external", "forge")).toThrow(
      "External runtime requires AI_PROVIDER"
    );
  });

  it("denies direct adapters in managed mode and requires S3 in external mode", () => {
    expect(getConfiguredAiProvider("managed", "forge")).toBe("forge");
    expect(() => getConfiguredAiProvider("managed", "anthropic")).toThrow(
      "Managed runtime requires AI_PROVIDER=forge"
    );
    expect(getConfiguredObjectStorageProvider("external", "S3")).toBe("s3");
    expect(() =>
      getConfiguredObjectStorageProvider("external", "forge")
    ).toThrow("External runtime requires OBJECT_STORAGE_PROVIDER=s3");
    expect(() => getConfiguredObjectStorageProvider("managed", "s3")).toThrow(
      "Managed runtime requires OBJECT_STORAGE_PROVIDER=forge"
    );
  });
});
