/**
 * PendingTeamRequestQueue
 *
 * Surfaces all pending (sent but not yet accepted) team invitations for the
 * current insurer tenant. Allows the Insurer Admin to resend or cancel each
 * invitation inline.
 *
 * Data source: trpc.teamMembers.listInvitations (already filters to
 * acceptedAt IS NULL AND expiresAt > NOW() for the current tenant).
 * Actions: trpc.teamMembers.resendInvitation, trpc.teamMembers.cancelInvitation
 */
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Mail, RefreshCw, XCircle, Clock, Users } from "lucide-react";

const INSURER_ROLE_LABELS: Record<string, string> = {
  claims_processor: "Claims Processor",
  assessor_internal: "Assessor (Internal)",
  assessor_external: "Assessor (External)",
  risk_manager: "Risk Manager",
  claims_manager: "Claims Manager",
  executive: "Executive",
  insurer_admin: "Insurer Admin",
  recovery_officer: "Recovery Officer",
};

function expiresInLabel(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h remaining`;
  const days = Math.floor(hours / 24);
  return `${days}d remaining`;
}

export function PendingTeamRequestQueue() {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: invitations = [], isLoading } = trpc.teamMembers.listInvitations.useQuery();

  const resendMutation = trpc.teamMembers.resendInvitation.useMutation({
    onSuccess: (_, vars) => {
      toast({ title: "Invitation resent", description: `A new invitation email has been sent.` });
      utils.teamMembers.listInvitations.invalidate();
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const cancelMutation = trpc.teamMembers.cancelInvitation.useMutation({
    onSuccess: () => {
      toast({ title: "Invitation cancelled", description: "The invitation has been revoked." });
      utils.teamMembers.listInvitations.invalidate();
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4" style={{ color: "#3C7844" }} />
          <h3 className="text-sm font-semibold text-gray-900">Pending Team Invitations</h3>
        </div>
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 rounded bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" style={{ color: "#3C7844" }} />
          <h3 className="text-sm font-semibold text-gray-900">Pending Team Invitations</h3>
        </div>
        <Badge
          variant="secondary"
          className="text-xs"
          style={{ background: invitations.length > 0 ? "#FEF3C7" : "#F3F4F6", color: invitations.length > 0 ? "#92400E" : "#6B7280" }}
        >
          {invitations.length} pending
        </Badge>
      </div>

      {/* Body */}
      {invitations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Mail className="h-8 w-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No pending invitations</p>
          <p className="text-xs text-gray-400 mt-1">All sent invitations have been accepted or expired.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {invitations.map((inv: any) => {
            const roleLabel = INSURER_ROLE_LABELS[inv.insurerRole ?? ""] ?? inv.insurerRole ?? "Unknown Role";
            const expiry = expiresInLabel(inv.expiresAt);
            const isExpiring = new Date(inv.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;

            return (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                {/* Left: email + role + expiry */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 truncate">{inv.email}</span>
                    <Badge
                      variant="outline"
                      className="text-xs shrink-0"
                      style={{ borderColor: "#68A890", color: "#3C7844" }}
                    >
                      {roleLabel}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className={`h-3 w-3 ${isExpiring ? "text-amber-500" : "text-gray-400"}`} />
                    <span className={`text-xs ${isExpiring ? "text-amber-600 font-medium" : "text-gray-400"}`}>
                      {expiry}
                    </span>
                    <span className="text-xs text-gray-300 mx-1">·</span>
                    <span className="text-xs text-gray-400">
                      Sent {new Date(inv.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-1.5 ml-3 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-gray-600 hover:text-gray-900"
                    disabled={resendMutation.isPending}
                    onClick={() =>
                      resendMutation.mutate({
                        invitationId: inv.id,
                        origin: window.location.origin,
                      })
                    }
                    title="Resend invitation email"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Resend
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate({ invitationId: inv.id })}
                    title="Cancel this invitation"
                  >
                    <XCircle className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
