/**
 * Returns a stable iframe viewport height for a same-origin server-rendered report.
 *
 * The report iframe must be large enough to expose the complete document in the
 * portal; printing is still invoked on the iframe window itself, never the parent.
 */
export function reportIframeHeight(
  dimensions: Readonly<{
    bodyScrollHeight?: number | null;
    documentScrollHeight?: number | null;
  }>,
  minimumHeight = 1200,
): number {
  return Math.max(
    minimumHeight,
    Number(dimensions.bodyScrollHeight) || 0,
    Number(dimensions.documentScrollHeight) || 0,
  );
}
