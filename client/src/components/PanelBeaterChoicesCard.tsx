import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Star, FileCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

const RANK_EMOJIS = ["1️⃣", "2️⃣", "3️⃣"] as const;

interface PanelBeaterChoicesCardProps {
  claimId: number;
  /** Optional: the marketplace_profile_id of the insurer-assigned repairer.
   *  When provided and it differs from all three choices, a mismatch warning is shown. */
  assignedProfileId?: string | null;
}

export default function PanelBeaterChoicesCard({
  claimId,
  assignedProfileId: externalAssignedProfileId,
}: PanelBeaterChoicesCardProps) {
  const { data, isLoading } = trpc.claims.getPanelBeaterChoices.useQuery(
    { claimId },
    { enabled: !!claimId }
  );

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Panel Beater Choices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-9 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || (data.choices ?? []).length === 0) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Panel Beater Choices</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No panel beater preferences recorded for this claim.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Use the assignedProfileId from the query response (resolved from assignedPanelBeaterId)
  // or fall back to the one passed in as a prop
  const resolvedAssignedId = data.assignedProfileId ?? externalAssignedProfileId ?? null;

  const choiceProfileIds = new Set((data.choices ?? []).map((c) => c.profileId));
  const mismatch =
    resolvedAssignedId !== null && !choiceProfileIds.has(resolvedAssignedId);

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          Panel Beater Choices
          <span className="text-xs font-normal text-muted-foreground">
            (claimant preference — ranked)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {(data.choices ?? []).map((choice) => (
          <div
            key={choice.profileId}
            className="flex items-center justify-between rounded-md border px-3 py-2 bg-background"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none select-none" aria-label={`Choice ${choice.rank}`}>
                {RANK_EMOJIS[choice.rank - 1]}
              </span>
              <span className="text-sm font-medium">
                Choice {choice.rank} – {choice.companyName}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {choice.preferred && (
                <Badge
                  variant="secondary"
                  className="gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800 text-xs"
                >
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  Preferred
                </Badge>
              )}
              {choice.slaSigned && (
                <Badge
                  variant="secondary"
                  className="gap-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800 text-xs"
                >
                  <FileCheck className="h-3 w-3 text-emerald-600" />
                  SLA Signed
                </Badge>
              )}
            </div>
          </div>
        ))}

        {mismatch && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
            <p className="text-sm text-orange-800 dark:text-orange-200 font-medium">
              Final assigned repairer differs from claimant preference
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
