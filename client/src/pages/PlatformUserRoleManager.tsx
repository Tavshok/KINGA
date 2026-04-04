/**
 * /platform/user-role-manager
 *
 * Platform-level role assignment tool for platform_super_admin.
 * Allows searching all users, assigning roles with confirmation, and
 * immediately impersonating the user to test the new workflow.
 */
import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Shield,
  Search,
  UserCog,
  LogIn,
  ChevronLeft,
  ChevronRight,
  History,
  Zap,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_ROLES = [
  "claimant",
  "panel_beater",
  "assessor",
  "insurer",
  "broker",
  "platform_super_admin",
  "admin",
  "user",
] as const;

const INSURER_ROLES = [
  "claims_processor",
  "internal_assessor",
  "risk_manager",
  "claims_manager",
  "executive",
] as const;

type PlatformRole = (typeof PLATFORM_ROLES)[number];
type InsurerRole = (typeof INSURER_ROLES)[number];

// Quick-assign presets
const QUICK_PRESETS: {
  label: string;
  role: PlatformRole;
  insurerRole?: InsurerRole;
  colour: string;
}[] = [
  { label: "Claimant", role: "claimant", colour: "bg-purple-600 hover:bg-purple-700" },
  {
    label: "Insurer Claims Processor",
    role: "insurer",
    insurerRole: "claims_processor",
    colour: "bg-blue-600 hover:bg-blue-700",
  },
  { label: "Panel Beater", role: "panel_beater", colour: "bg-amber-600 hover:bg-amber-700" },
  { label: "Assessor", role: "assessor", colour: "bg-emerald-600 hover:bg-emerald-700" },
];

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_COLOURS: Record<string, string> = {
  insurer: "bg-blue-900 text-blue-200",
  assessor: "bg-emerald-900 text-emerald-200",
  claimant: "bg-purple-900 text-purple-200",
  panel_beater: "bg-amber-900 text-amber-200",
  platform_super_admin: "bg-red-900 text-red-200",
  admin: "bg-red-800 text-red-100",
  broker: "bg-cyan-900 text-cyan-200",
  user: "bg-gray-700 text-gray-600 dark:text-gray-300",
};

function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_COLOURS[role] ?? "bg-gray-700 text-gray-600 dark:text-gray-300";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {role.replace(/_/g, " ")}
    </span>
  );
}

// ─── Audit history drawer ─────────────────────────────────────────────────────

function AuditHistoryDialog({
  userId,
  userName,
  open,
  onClose,
}: {
  userId: number;
  userName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.platformUserRoles.getUserAuditHistory.useQuery(
    { userId },
    { enabled: open }
  );
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-gray-900 border-gray-700 text-gray-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-400" />
            Role History — {userName}
          </DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70">
            Last 20 role-assignment events for this user.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70 py-4 text-center">Loading…</p>
        ) : !data || data.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70 py-4 text-center">No history found.</p>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-700">
                  <TableHead className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70">Timestamp</TableHead>
                  <TableHead className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70">Previous Role</TableHead>
                  <TableHead className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70">New Role</TableHead>
                  <TableHead className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70">Changed By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.id} className="border-gray-800">
                    <TableCell className="text-gray-600 dark:text-gray-300 text-xs">
                      {new Date(row.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {row.previousRole ? <RoleBadge role={row.previousRole} /> : "—"}
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={row.newRole} />
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70 text-xs">
                      uid:{row.changedByUserId}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-gray-600 text-gray-600 dark:text-gray-300">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type UserRow = {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  insurerRole: string | null;
  tenantId: string | null;
  organizationId: number | null;
};

type AssignState = {
  user: UserRow;
  newRole: PlatformRole;
  newInsurerRole?: InsurerRole;
  justification: string;
  preset?: string;
};

export default function PlatformUserRoleManager() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // ── Filters ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  // ── Assignment dialog state ───────────────────────────────────────────────
  const [assignState, setAssignState] = useState<AssignState | null>(null);

  // ── Audit history dialog state ────────────────────────────────────────────
  const [auditTarget, setAuditTarget] = useState<{ id: number; name: string } | null>(null);

  // ── Impersonation ─────────────────────────────────────────────────────────
  const startImpersonation = trpc.platformMarketplace.startImpersonation.useMutation({
    onSuccess: (data) => {
      toast({
        title: "Impersonation started",
        description: `Now acting as ${data.targetUser.name ?? data.targetUser.email}`,
      });
      utils.auth.me.invalidate();
    },
    onError: (err) => {
      toast({ title: "Impersonation failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Data fetch ────────────────────────────────────────────────────────────
  const { data, isLoading, isFetching } = trpc.platformUserRoles.listUsers.useQuery({
    search: search || undefined,
    roleFilter: roleFilter === "all" ? undefined : roleFilter,
    page,
    pageSize: 20,
  });

  // ── Assign role mutation ──────────────────────────────────────────────────
  const assignRole = trpc.platformUserRoles.assignRole.useMutation({
    onSuccess: (result) => {
      toast({
        title: "Role assigned",
        description: `${result.user.name ?? result.user.email} is now ${result.user.newRole}${
          result.user.newInsurerRole ? ` / ${result.user.newInsurerRole}` : ""
        }.`,
      });
      utils.platformUserRoles.listUsers.invalidate();
      setAssignState(null);
    },
    onError: (err) => {
      toast({ title: "Assignment failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const openAssignDialog = useCallback(
    (user: UserRow, preset?: (typeof QUICK_PRESETS)[number]) => {
      setAssignState({
        user,
        newRole: preset?.role ?? (user.role as PlatformRole),
        newInsurerRole: preset?.insurerRole,
        justification: "",
        preset: preset?.label,
      });
    },
    []
  );

  const handleConfirmAssign = () => {
    if (!assignState) return;
    assignRole.mutate({
      targetUserId: assignState.user.id,
      newRole: assignState.newRole,
      newInsurerRole: assignState.newInsurerRole,
      justification: assignState.justification || undefined,
    });
  };

  const handleImpersonate = (user: UserRow) => {
    startImpersonation.mutate({
      targetUserId: user.id,
      reason: `Role-manager impersonation to verify role: ${user.role}`,
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Shield className="h-6 w-6 text-red-400" />
          <h1 className="text-2xl font-bold text-white">User Role Manager</h1>
          <Badge className="bg-red-900 text-red-200 text-xs">platform_super_admin only</Badge>
        </div>
        <p className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70 text-sm">
          Assign roles to users without running SQL. Every change is logged to the audit trail.
        </p>
      </div>

      {/* Quick-assign presets */}
      <Card className="mb-6 bg-gray-900 border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" />
            Quick Assign — select a user in the table first, then click a preset
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {QUICK_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              size="sm"
              className={`${preset.colour} text-white`}
              disabled={!assignState?.user}
              onClick={() => {
                if (assignState?.user) openAssignDialog(assignState.user, preset);
              }}
            >
              {preset.label}
            </Button>
          ))}
          {!assignState?.user && (
            <span className="text-gray-700 dark:text-gray-400 dark:text-muted-foreground text-xs self-center ml-2">
              Select a user row first to enable quick-assign
            </span>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-700 dark:text-gray-400 dark:text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-500"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(v) => { setRoleFilter(v); setPage(1); }}
        >
          <SelectTrigger className="w-48 bg-gray-800 border-gray-700 text-gray-100">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700">
            <SelectItem value="all" className="text-gray-100">All roles</SelectItem>
            {PLATFORM_ROLES.map((r) => (
              <SelectItem key={r} value={r} className="text-gray-100">
                {r.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* User table */}
      <Card className="bg-gray-900 border-gray-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-700 hover:bg-transparent">
                  <TableHead className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70">Name</TableHead>
                  <TableHead className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70">Email</TableHead>
                  <TableHead className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70">Current Role</TableHead>
                  <TableHead className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70">Insurer Role</TableHead>
                  <TableHead className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70">Tenant / Org</TableHead>
                  <TableHead className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading || isFetching ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-700 dark:text-gray-400 dark:text-muted-foreground py-8">
                      Loading users…
                    </TableCell>
                  </TableRow>
                ) : !data?.users.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-700 dark:text-gray-400 dark:text-muted-foreground py-8">
                      No users found.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.users.map((u) => {
                    const isSelected = assignState?.user.id === u.id;
                    return (
                      <TableRow
                        key={u.id}
                        className={`border-gray-800 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-blue-950 border-l-2 border-l-blue-500"
                            : "hover:bg-gray-800"
                        }`}
                        onClick={() => openAssignDialog(u)}
                      >
                        <TableCell className="text-gray-200 font-medium">
                          {u.name ?? <span className="text-gray-700 dark:text-gray-400 dark:text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-300 text-sm">{u.email ?? "—"}</TableCell>
                        <TableCell>
                          <RoleBadge role={u.role} />
                        </TableCell>
                        <TableCell>
                          {u.insurerRole ? (
                            <span className="text-xs text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70">
                              {u.insurerRole.replace(/_/g, " ")}
                            </span>
                          ) : (
                            <span className="text-gray-600 dark:text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-gray-700 dark:text-gray-400 dark:text-muted-foreground text-xs">
                          {u.tenantId ?? u.organizationId ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70 hover:text-white hover:bg-gray-700"
                              title="View audit history"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAuditTarget({ id: u.id, name: u.name ?? u.email ?? `uid:${u.id}` });
                              }}
                            >
                              <History className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-blue-400 hover:text-blue-200 hover:bg-blue-950"
                              title="Assign role"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAssignDialog(u);
                              }}
                            >
                              <UserCog className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950"
                              title="Impersonate user"
                              disabled={startImpersonation.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleImpersonate(u);
                              }}
                            >
                              <LogIn className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
              <span className="text-xs text-gray-700 dark:text-gray-400 dark:text-muted-foreground">
                {data.total} users · page {data.page} of {data.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-gray-600 text-gray-600 dark:text-gray-300"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-gray-600 text-gray-600 dark:text-gray-300"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Role Assignment Confirmation Dialog ─────────────────────────────── */}
      <Dialog open={!!assignState} onOpenChange={(o) => { if (!o) setAssignState(null); }}>
        <DialogContent className="max-w-md bg-gray-900 border-gray-700 text-gray-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-blue-400" />
              Assign Role
            </DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70">
              {assignState?.preset
                ? `Quick-assign preset: "${assignState.preset}"`
                : "Manually configure the role for this user."}
            </DialogDescription>
          </DialogHeader>

          {assignState && (
            <div className="space-y-4 py-2">
              {/* User summary */}
              <div className="bg-gray-800 rounded-lg p-3 text-sm">
                <p className="font-medium text-white">{assignState.user.name ?? "—"}</p>
                <p className="text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70">{assignState.user.email ?? "—"}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-gray-700 dark:text-gray-400 dark:text-muted-foreground text-xs">Current:</span>
                  <RoleBadge role={assignState.user.role} />
                  {assignState.user.insurerRole && (
                    <span className="text-xs text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70">
                      / {assignState.user.insurerRole.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              </div>

              {/* New role selector */}
              <div className="space-y-1">
                <Label className="text-gray-600 dark:text-gray-300">New Role</Label>
                <Select
                  value={assignState.newRole}
                  onValueChange={(v) =>
                    setAssignState((s) =>
                      s
                        ? { ...s, newRole: v as PlatformRole, newInsurerRole: undefined }
                        : s
                    )
                  }
                >
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-gray-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    {PLATFORM_ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="text-gray-100">
                        {r.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Insurer sub-role (only when insurer selected) */}
              {assignState.newRole === "insurer" && (
                <div className="space-y-1">
                  <Label className="text-gray-600 dark:text-gray-300">Insurer Role</Label>
                  <Select
                    value={assignState.newInsurerRole ?? ""}
                    onValueChange={(v) =>
                      setAssignState((s) =>
                        s ? { ...s, newInsurerRole: v as InsurerRole } : s
                      )
                    }
                  >
                    <SelectTrigger className="bg-gray-800 border-gray-600 text-gray-100">
                      <SelectValue placeholder="Select insurer role…" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {INSURER_ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="text-gray-100">
                          {r.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Justification */}
              <div className="space-y-1">
                <Label className="text-gray-600 dark:text-gray-300">
                  Justification{" "}
                  <span className="text-gray-700 dark:text-gray-400 dark:text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                  placeholder="Reason for this role change…"
                  value={assignState.justification}
                  onChange={(e) =>
                    setAssignState((s) =>
                      s ? { ...s, justification: e.target.value } : s
                    )
                  }
                  className="bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500 resize-none h-20"
                />
              </div>

              {/* Confirmation warning */}
              <div className="bg-amber-950 border border-amber-800 rounded-lg p-3 text-xs text-amber-200">
                <strong>Assign this role to user?</strong> This action is logged to the audit
                trail and cannot be undone without another assignment.
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setAssignState(null)}
              className="border-gray-600 text-gray-600 dark:text-gray-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAssign}
              disabled={
                assignRole.isPending ||
                (assignState?.newRole === "insurer" && !assignState.newInsurerRole)
              }
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {assignRole.isPending ? "Assigning…" : "Confirm Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Audit History Dialog ─────────────────────────────────────────────── */}
      {auditTarget && (
        <AuditHistoryDialog
          userId={auditTarget.id}
          userName={auditTarget.name}
          open={!!auditTarget}
          onClose={() => setAuditTarget(null)}
        />
      )}
    </div>
  );
}
