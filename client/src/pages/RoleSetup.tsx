/**
 * RoleSetup page  (/role-setup)
 *
 * Three views depending on the authenticated user's role:
 *
 *  1. role === "user"  →  Informational dead-end prevention page.
 *     Shows the user their current role, explains available roles,
 *     and tells them to contact their administrator.
 *
 *  2. role === "admin" | "platform_super_admin"  →  Lightweight user role
 *     manager table. Lists all users and lets the admin assign
 *     claimant / insurer / admin roles with a confirmation dialog.
 *
 *  3. Any other role (insurer, claimant, etc.)  →  Shows current role info
 *     and a link back to the portal hub.
 *
 * Non-goals: does NOT modify the auth system, schema, or portal routing.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  UserCog,
  ArrowLeft,
  ShieldCheck,
  Users,
  Loader2,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type AssignableRole = "claimant" | "insurer" | "admin";
type InsurerRole =
  | "claims_processor"
  | "internal_assessor"
  | "risk_manager"
  | "claims_manager"
  | "executive";

interface PendingAssignment {
  userId: number;
  userEmail: string | null;
  role: AssignableRole;
  insurerRole?: InsurerRole;
}

// ─── Role descriptions (for the informational view) ──────────────────────────
const ROLE_DESCRIPTIONS: Record<string, { label: string; description: string }> = {
  claimant: {
    label: "Claimant",
    description: "Submit and track your own insurance claims.",
  },
  insurer: {
    label: "Insurer / Claims Processor",
    description:
      "Review, assess, and manage claims on behalf of an insurance organisation.",
  },
  admin: {
    label: "Administrator",
    description:
      "Manage users, assign roles, and oversee platform configuration.",
  },
};

// ─── Helper: role badge colour ────────────────────────────────────────────────
function roleBadgeVariant(
  role: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (role) {
    case "admin":
    case "platform_super_admin":
      return "destructive";
    case "insurer":
    case "claims_processor":
      return "default";
    case "claimant":
      return "secondary";
    default:
      return "outline";
  }
}

// ─── Informational view (role === "user") ─────────────────────────────────────
function UnassignedUserView({ currentRole }: { currentRole: string }) {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-amber-600" />
          </div>
          <CardTitle className="text-2xl text-slate-800 dark:text-foreground">
            Account Not Yet Activated
          </CardTitle>
          <CardDescription className="text-base mt-1">
            Your account has not yet been assigned a platform role.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Current role */}
          <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
            <UserCog className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Your current role</p>
              <Badge variant="outline" className="mt-1 font-mono text-xs">
                {currentRole}
              </Badge>
            </div>
          </div>

          {/* Available roles */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-foreground/80 mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Available platform roles
            </h3>
            <div className="grid gap-3">
              {Object.entries(ROLE_DESCRIPTIONS).map(([key, { label, description }]) => (
                <div
                  key={key}
                  className="flex items-start gap-3 p-3 border border-slate-200 dark:border-border rounded-lg bg-white dark:bg-card"
                >
                  <Badge variant={roleBadgeVariant(key)} className="mt-0.5 shrink-0">
                    {label}
                  </Badge>
                  <p className="text-sm text-slate-600 dark:text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Contact message */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-center">
            <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
              Please contact your platform administrator to activate your account.
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Once your role is assigned you will be redirected to your portal automatically.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-center gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setLocation("/portal-hub")}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Return to Portal Hub
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Already-assigned view (role is set but not admin) ────────────────────────
function AssignedUserView({ currentRole, insurerRole }: { currentRole: string; insurerRole?: string | null }) {
  const [, setLocation] = useLocation();
  const info = ROLE_DESCRIPTIONS[currentRole];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl text-slate-800 dark:text-foreground">Role Assigned</CardTitle>
          <CardDescription className="text-base mt-1">
            Your account is active and ready to use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
            <ShieldCheck className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-900 dark:text-green-200">Your role</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={roleBadgeVariant(currentRole)}>{currentRole}</Badge>
                {insurerRole && (
                  <Badge variant="outline" className="text-xs">{insurerRole}</Badge>
                )}
              </div>
              {info && (
                <p className="text-xs text-green-700 dark:text-green-300 mt-1">{info.description}</p>
              )}
            </div>
          </div>
          <div className="flex justify-center pt-2">
            <Button onClick={() => setLocation("/portal-hub")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Go to Portal Hub
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Admin view ───────────────────────────────────────────────────────────────
function AdminRoleManagerView() {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: userList, isLoading, error } = trpc.platform.listAllUsers.useQuery();

  const assignRole = trpc.platform.assignUserRole.useMutation({
    onSuccess: (result) => {
      toast({
        title: "Role assigned",
        description: `User updated to ${result.newRole}${result.newInsurerRole ? ` / ${result.newInsurerRole}` : ""}.`,
      });
      void utils.platform.listAllUsers.invalidate();
      setPending(null);
    },
    onError: (err) => {
      toast({
        title: "Assignment failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const [pending, setPending] = useState<PendingAssignment | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<
    Record<number, { role: AssignableRole; insurerRole?: InsurerRole }>
  >({});

  function getSelected(userId: number) {
    return selectedRoles[userId] ?? { role: "claimant" as AssignableRole };
  }

  function handleQuickAssign(
    userId: number,
    userEmail: string | null,
    role: AssignableRole,
    insurerRole?: InsurerRole
  ) {
    setPending({ userId, userEmail, role, insurerRole });
  }

  function confirmAssign() {
    if (!pending) return;
    assignRole.mutate({
      userId: pending.userId,
      role: pending.role,
      insurerRole: pending.insurerRole,
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-muted-foreground/70" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        Failed to load users: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <Users className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-foreground">User Role Manager</h2>
          <p className="text-sm text-slate-500 dark:text-muted-foreground">
            Assign roles to users. Changes take effect immediately.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Current Role</TableHead>
                <TableHead>Insurer Role</TableHead>
                <TableHead>Assign Role</TableHead>
                <TableHead>Quick Assign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(userList ?? []).map((u) => {
                const sel = getSelected(u.id);
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs text-slate-600 dark:text-muted-foreground">
                      {u.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{u.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariant(u.role)}>{u.role}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 dark:text-muted-foreground">
                      {u.insurerRole ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={sel.role}
                          onValueChange={(v) =>
                            setSelectedRoles((prev) => ({
                              ...prev,
                              [u.id]: { ...prev[u.id], role: v as AssignableRole },
                            }))
                          }
                        >
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="claimant">Claimant</SelectItem>
                            <SelectItem value="insurer">Insurer</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>

                        {sel.role === "insurer" && (
                          <Select
                            value={sel.insurerRole ?? "claims_processor"}
                            onValueChange={(v) =>
                              setSelectedRoles((prev) => ({
                                ...prev,
                                [u.id]: {
                                  ...prev[u.id],
                                  insurerRole: v as InsurerRole,
                                },
                              }))
                            }
                          >
                            <SelectTrigger className="w-40 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="claims_processor">Claims Processor</SelectItem>
                              <SelectItem value="internal_assessor">Assessor</SelectItem>
                              <SelectItem value="risk_manager">Risk Manager</SelectItem>
                              <SelectItem value="claims_manager">Claims Manager</SelectItem>
                              <SelectItem value="executive">Executive</SelectItem>
                            </SelectContent>
                          </Select>
                        )}

                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() =>
                            handleQuickAssign(
                              u.id,
                              u.email,
                              sel.role,
                              sel.role === "insurer"
                                ? (sel.insurerRole ?? "claims_processor")
                                : undefined
                            )
                          }
                        >
                          Assign
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2"
                          onClick={() => handleQuickAssign(u.id, u.email, "claimant")}
                        >
                          Claimant
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2"
                          onClick={() =>
                            handleQuickAssign(u.id, u.email, "insurer", "claims_processor")
                          }
                        >
                          CP
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2"
                          onClick={() => handleQuickAssign(u.id, u.email, "admin")}
                        >
                          Admin
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <Dialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Role Assignment</DialogTitle>
            <DialogDescription>
              Assign role{" "}
              <strong>{pending?.role}</strong>
              {pending?.insurerRole && (
                <>
                  {" "}/ <strong>{pending.insurerRole}</strong>
                </>
              )}{" "}
              to{" "}
              <strong>{pending?.userEmail ?? `user #${pending?.userId}`}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              onClick={confirmAssign}
              disabled={assignRole.isPending}
              className="gap-2"
            >
              {assignRole.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────
export default function RoleSetup() {
  const { user, loading } = useAuth();

  const [, setLocation] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-muted-foreground/70" />
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  // Admin / super-admin → role manager table
  if (user.role === "admin" || user.role === "platform_super_admin") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/portal-hub")}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Portal Hub
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-slate-800 dark:text-foreground">Role Setup</h1>
                <p className="text-sm text-slate-500 dark:text-muted-foreground">
                  Manage user role assignments across the platform.
                </p>
              </div>
            </div>
            <Badge variant="destructive" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              {user.role}
            </Badge>
          </div>

          <AdminRoleManagerView />
        </div>
      </div>
    );
  }

  // Unassigned (role === "user") → informational dead-end prevention
  if (user.role === "user") {
    return <UnassignedUserView currentRole={user.role} />;
  }

  // Any other assigned role → confirmation view with portal link
  return (
    <AssignedUserView
      currentRole={user.role ?? "unknown"}
      insurerRole={(user as { insurerRole?: string | null }).insurerRole}
    />
  );
}
