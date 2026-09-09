/**
 * Identifies a browser failure caused by a page retaining a lazy-loaded chunk
 * name from an earlier deployment after the asset set has been replaced.
 */
export function isDynamicImportFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(
    message,
  );
}

/**
 * Builds a same-page URL with a short-lived cache-busting marker. This causes
 * the document to be requested again without changing its business route.
 */
export function withAssetRefreshMarker(url: string, marker: string): string {
  const refreshed = new URL(url);
  refreshed.searchParams.set("__kinga_asset_refresh", marker);
  return refreshed.toString();
}
