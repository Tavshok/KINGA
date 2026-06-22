import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserCheck, UserX, Shield, RefreshCw, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const roleLabel = (role: string) =>
  role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const insurerRoleLabel = (r: string | null) =>
  r ? r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";

function daysAgo(createdAt: string) {
  const diff = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PendingRegistrationQueue() {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.admin.getPendingRegistrations.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const deactivate = trpc.admin.deactivateUser.useMutation({
    onSuccess: () => {
      toast({ title: "User deactivated", description: "The user account has been disabled." });
      utils.admin.getPendingRegistrations.invalidate();
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast({ title: "Role updated", description: "User role has been changed." });
      utils.admin.getPendingRegistrations.invalidate();
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Role-change dialog state
  const [roleDialog, setRoleDialog] = useState<{
    userId: number;
    name: string;
    currentRole: string;
    newRole: string;
    newInsurerRole: string;
  } | null>(null);

  const pending = data?.pending ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            <div>
              <CardTitle>Pending Registration Queue</CardTitle>
              <CardDescription className="mt-0.5">
                Users registered but not yet email-verified — last 90 days
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm px-2 py-0.5">
              {data?.total ?? 0} pending
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            Loading pending registrations…
          </div>
        ) : pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground gap-2">
            <UserCheck className="h-10 w-10 opacity-30" />
            <p>No pending registrations in the last 90 days.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="pl-4">Name / Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Insurer Role</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="pl-4">
                    <p className="font-medium text-sm">{u.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{u.email ?? "—"}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {roleLabel(u.role)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {insurerRoleLabel(u.insurerRole ?? null)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.tenantId ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {daysAgo(u.createdAt)}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() =>
                          setRoleDialog({
                            userId: u.id,
                            name: u.name ?? "User",
                            currentRole: u.role,
                            newRole: u.role,
                            newInsurerRole: u.insurerRole ?? "",
                          })
                        }
                      >
                        <Shield className="h-3 w-3" />
                        Role
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        disabled={deactivate.isPending}
                        onClick={() => deactivate.mutate({ userId: u.id })}
                      >
                        <UserX className="h-3 w-3" />
                        Deactivate
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Role-change dialog */}
      {roleDialog && (
        <Dialog open onOpenChange={() => setRoleDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Change Role — {roleDialog.name}</DialogTitle>
              <DialogDescription>
                Update the platform role and/or insurer sub-role for this user.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Platform Role</label>
                <Select
                  value={roleDialog.newRole}
                  onValueChange={(v) => setRoleDialog((d) => d && { ...d, newRole: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["user","admin","insurer","assessor","panel_beater","claimant","fleet_admin","fleet_manager","fleet_driver"].map((r) => (
                      <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {roleDialog.newRole === "insurer" && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Insurer Sub-Role</label>
                  <Select
                    value={roleDialog.newInsurerRole || "none"}
                    onValueChange={(v) => setRoleDialog((d) => d && { ...d, newInsurerRole: v === "none" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {["claims_processor","assessor_internal","assessor_external","risk_manager","claims_manager","executive","insurer_admin","recovery_officer"].map((r) => (
                        <SelectItem key={r} value={r}>{insurerRoleLabel(r)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRoleDialog(null)}>Cancel</Button>
              <Button
                disabled={updateRole.isPending}
                onClick={() => {
                  updateRole.mutate({
                    userId: roleDialog.userId,
                    role: roleDialog.newRole as any,
                    insurerRole: roleDialog.newRole === "insurer" && roleDialog.newInsurerRole
                      ? (roleDialog.newInsurerRole as any)
                      : null,
                  });
                  setRoleDialog(null);
                }}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
