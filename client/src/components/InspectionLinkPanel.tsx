/**
 * InspectionLinkPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * M-04: Link an inspection to an active claim.
 * Renders as a compact panel in the EngineerInspectionDetail page.
 */

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link2, Link2Off, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  inspectionId: number;
  currentClaimId: number | null | undefined;
  onLinked?: (claimId: number | null) => void;
}

export function InspectionLinkPanel({ inspectionId, currentClaimId, onLinked }: Props) {
  const [claimIdInput, setClaimIdInput] = useState(currentClaimId ? String(currentClaimId) : "");
  const [editing, setEditing] = useState(false);

  const utils = trpc.useUtils();
  const linkMutation = trpc.inspections.linkToClaim.useMutation({
    onSuccess: (data) => {
      toast.success(data.claimId ? `Linked to claim #${data.claimId}` : "Claim link removed");
      utils.inspections.get.invalidate({ inspectionId });
      onLinked?.(data.claimId);
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleLink = () => {
    const id = claimIdInput.trim() ? Number(claimIdInput.trim()) : null;
    if (claimIdInput.trim() && (isNaN(Number(claimIdInput)) || Number(claimIdInput) <= 0)) {
      toast.error("Please enter a valid claim ID");
      return;
    }
    linkMutation.mutate({ inspectionId, claimId: id });
  };

  const handleUnlink = () => {
    linkMutation.mutate({ inspectionId, claimId: null });
    setClaimIdInput("");
  };

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Claim Linkage</h3>
      </div>

      {currentClaimId && !editing ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-sm">Linked to Claim <span className="font-mono font-semibold">#{currentClaimId}</span></span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>
              Change
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={handleUnlink} disabled={linkMutation.isPending}>
              <Link2Off className="h-3 w-3 mr-1" /> Unlink
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {!currentClaimId && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5" />
              This inspection is not linked to any claim.
            </div>
          )}
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs sr-only">Claim ID</Label>
              <Input
                type="number"
                placeholder="Enter claim ID to link"
                value={claimIdInput}
                onChange={(e) => setClaimIdInput(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={handleLink} disabled={linkMutation.isPending}>
              {linkMutation.isPending ? "Linking…" : "Link"}
            </Button>
            {editing && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Enter the KINGA claim ID to associate this inspection with an active claim.
          </p>
        </div>
      )}
    </div>
  );
}
