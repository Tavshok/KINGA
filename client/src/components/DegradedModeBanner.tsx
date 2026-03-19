/**
 * DegradedModeBanner.tsx
 *
 * Stage 28: Shared banner displayed on visual components when rendering in degraded mode.
 * Shown when required data is missing and fallback/estimated values are being used.
 *
 * Rule: NEVER hide a component due to missing data.
 *       Use degraded mode: partial visuals allowed, clearly labelled.
 */

import { Info } from "lucide-react";

interface DegradedModeBannerProps {
  /** Primary label — typically "Estimated from available data" */
  label?: string;
  /** Optional detail line shown below the label */
  detail?: string;
  /** Visual size: "sm" for inline use, "md" for card headers */
  size?: "sm" | "md";
}

export function DegradedModeBanner({
  label = "Estimated from available data",
  detail,
  size = "sm",
}: DegradedModeBannerProps) {
  if (size === "md") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 px-3 py-2 mb-3">
        <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{label}</p>
          {detail && (
            <p className="text-xs text-amber-600/80 dark:text-amber-500/70 mt-0.5">{detail}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 px-2 py-1">
      <Info className="h-3 w-3 text-amber-500 shrink-0" />
      <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">{label}</span>
      {detail && (
        <span className="text-xs text-amber-600/70 dark:text-amber-500/60 ml-1">— {detail}</span>
      )}
    </div>
  );
}
