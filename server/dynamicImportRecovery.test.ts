import { describe, expect, it } from "vitest";
import {
  isDynamicImportFailure,
  withAssetRefreshMarker,
} from "../client/src/lib/dynamicImportRecovery";

describe("dynamic import deployment recovery", () => {
  it("recognises the browser errors produced by stale lazy-loaded bundles", () => {
    expect(
      isDynamicImportFailure(
        new TypeError(
          "Failed to fetch dynamically imported module: https://kinga.example/assets/Home-old.js",
        ),
      ),
    ).toBe(true);
    expect(isDynamicImportFailure(new Error("Importing a module script failed."))).toBe(true);
  });

  it("does not treat unrelated application errors as deployment asset failures", () => {
    expect(isDynamicImportFailure(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("preserves the route and existing query values while replacing only the refresh marker", () => {
    expect(
      withAssetRefreshMarker(
        "https://kinga.example/claims/42?tab=reports",
        "20260909",
      ),
    ).toBe(
      "https://kinga.example/claims/42?tab=reports&__kinga_asset_refresh=20260909",
    );
  });
});
