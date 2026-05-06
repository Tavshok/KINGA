/**
 * ClaimCurrencyHistory
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays a compact audit trail of all currency changes made to a claim.
 *
 * Shows: timestamp · actor name · actor role · description (e.g. "Claim
 * currency updated to ZWG by claims_manager").
 *
 * Renders nothing when there are no currency change events, so it can be
 * placed anywhere without adding visual noise to clean claims.
 */

import { trpc } from "@/lib/trpc";
import { History, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface Props {
  claimId: number;
}

/** Format a role string for display, e.g. "claims_manager" → "Claims Manager" */
function fmtRole(role: string): string {
  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format an ISO timestamp for display in local time */
function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ClaimCurrencyHistory({ claimId }: Props) {
  const [expanded, setExpanded] = useState(false);

  const { data: history = [], isLoading } = trpc.claims.getCurrencyHistory.useQuery(
    { claimId },
    { enabled: !!claimId }
  );

  // Don't render anything if there are no currency change events
  if (!isLoading && history.length === 0) return null;

  return (
    <div className="mt-2">
      {/* Collapsible toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={expanded}
      >
        <History className="h-3 w-3" />
        {isLoading
          ? "Loading currency history…"
          : `${history.length} currency change${history.length !== 1 ? "s" : ""}`}
        {!isLoading && (expanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        ))}
      </button>

      {/* History list */}
      {expanded && !isLoading && (
        <ol className="mt-2 space-y-1.5 border-l-2 border-muted pl-3">
          {history.map((entry) => (
            <li key={entry.id} className="text-xs">
              <span className="font-mono text-muted-foreground">
                {fmtDate(entry.createdAt)}
              </span>
              <span className="mx-1 text-muted-foreground/50">·</span>
              <span className="font-medium">{entry.actorName}</span>
              {entry.actorRole && (
                <span className="ml-1 text-muted-foreground">
                  ({fmtRole(entry.actorRole)})
                </span>
              )}
              {entry.description && (
                <>
                  <span className="mx-1 text-muted-foreground/50">—</span>
                  <span className="text-foreground/80">{entry.description}</span>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
