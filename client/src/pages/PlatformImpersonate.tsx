/**
 * /platform/impersonate
 *
 * Super-admin role impersonation tool.
 * Allows platform_super_admin to switch into any user's session for debugging,
 * with a persistent banner and full audit trail.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, LogIn, LogOut, Search, Shield, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Role badge colours ───────────────────────────────────────────────────────

const roleColour: Record<string, string> = {
  insurer: "bg-blue-900 text-blue-200",
  assessor: "bg-emerald-900 text-emerald-200",
  claimant: "bg-purple-900 text-purple-200",
  panel_beater: "bg-amber-900 text-amber-200",
  fleet_admin: "bg-cyan-900 text-cyan-200",
  fleet_manager: "bg-teal-900 text-teal-200",
  admin: "bg-red-900 text-red-200",
  user: "bg-gray-700 text-gray-300",
};

function RoleBadge({ role }: { role: string }) {
  const cls = roleColour[role] ?? "bg-gray-700 text-gray-300";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {role}
    </span>
  );
}

// ─── Impersonation banner (shown when actively impersonating) ─────────────────

export function ImpersonationBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const endImpersonation = trpc.platformMarketplace.endImpersonation.useMutation({
    onSuccess: () => {
      toast({ title: "Session restored", description: "You are back to your super-admin account." });
      utils.auth.me.invalidate();
      window.location.href = "/platform";
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Only show banner if user is NOT a super-admin (i.e., impersonating)
  if (!user || user.role === "platform_super_admin") return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between text-sm font-medium shadow-lg">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4" />
        <span>
          IMPERSONATION ACTIVE — viewing as{" "}
          <strong>{user.name ?? user.email ?? `User #${user.id}`}</strong>{" "}
          ({user.role})
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="bg-amber-950 text-amber-100 border-amber-800 hover:bg-amber-900 h-7 text-xs"
        onClick={() => endImpersonation.mutate()}
        disabled={endImpersonation.isPending}
      >
        <LogOut className="w-3 h-3 mr-1" />
        End Session
      </Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlatformImpersonate() {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [selected, setSelected] = useState<{
    id: number;
    name: string | null;
    email: string | null;
    role: string;
    tenantId: string | null;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: userList, isLoading } = trpc.platformMarketplace.listUsersForImpersonation.useQuery(
    { search: search || undefined, role: roleFilter || undefined },
    { placeholderData: (prev: any) => prev }
  );

  const startImpersonation = trpc.platformMarketplace.startImpersonation.useMutation({
    onSuccess: (data) => {
      toast({
        title: "Impersonation started",
        description: `Now viewing as ${data.targetUser.name ?? data.targetUser.email ?? `User #${data.targetUser.id}`}`,
      });
      utils.auth.me.invalidate();
      setConfirmOpen(false);
      // Redirect to the appropriate portal for this role
      const roleRoutes: Record<string, string> = {
        insurer: "/insurer-portal",
        assessor: "/assessor",
        claimant: "/my-claims",
        panel_beater: "/marketplace",
        fleet_admin: "/fleet",
        fleet_manager: "/fleet",
        admin: "/admin",
      };
      window.location.href = roleRoutes[data.targetUser.role] ?? "/";
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function handleImpersonate(u: typeof selected) {
    setSelected(u);
    setReason("");
    setConfirmOpen(true);
  }

  function confirmImpersonate() {
    if (!selected || !reason.trim()) return;
    startImpersonation.mutate({ targetUserId: selected.id, reason });
  }

  const roles = [
    "insurer", "assessor", "claimant", "panel_beater",
    "fleet_admin", "fleet_manager", "admin", "user",
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Role Impersonation</h1>
            <p className="text-sm text-gray-400">
              Platform super-admin · All sessions are audited
            </p>
          </div>
        </div>

        {/* Warning banner */}
        <div className="rounded-lg border border-amber-800 bg-amber-950 p-3 mb-6 flex items-start gap-2 text-amber-300 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Impersonation grants full access to the target user's session. All actions taken
            during impersonation are attributed to the target user in the application but are
            recorded in the super-admin audit log. Use only for debugging and support.
          </span>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search by name, email, or tenant…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* User table */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm font-medium">
              {isLoading ? "Loading…" : `${userList?.length ?? 0} users`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading users…</div>
            ) : !userList?.length ? (
              <div className="text-center py-8 text-gray-500">No users found.</div>
            ) : (
              <div className="divide-y divide-gray-800">
                {userList.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-gray-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">
                          {u.name ?? <span className="text-gray-500 italic">No name</span>}
                          <span className="ml-2 text-xs text-gray-500">#{u.id}</span>
                        </div>
                        <div className="text-xs text-gray-400">
                          {u.email ?? "—"}
                          {u.tenantId && (
                            <span className="ml-2 font-mono text-gray-500">{u.tenantId}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <RoleBadge role={u.role} />
                      {u.insurerRole && (
                        <span className="text-xs text-gray-500">{u.insurerRole}</span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-700 text-amber-400 hover:bg-amber-900/30 h-7 text-xs"
                        onClick={() => handleImpersonate(u)}
                      >
                        <LogIn className="w-3 h-3 mr-1" />
                        Impersonate
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Confirm Impersonation
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              You are about to start an impersonation session as{" "}
              <strong className="text-white">
                {selected?.name ?? selected?.email ?? `User #${selected?.id}`}
              </strong>{" "}
              ({selected?.role}). This action is audited.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-300 mb-1 block">
                Reason for impersonation <span className="text-red-400">*</span>
              </label>
              <Textarea
                placeholder="e.g. Investigating claim submission bug reported by user…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500 resize-none"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              className="border-gray-600 text-gray-300"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmImpersonate}
              disabled={!reason.trim() || startImpersonation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {startImpersonation.isPending ? "Starting…" : "Start Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
