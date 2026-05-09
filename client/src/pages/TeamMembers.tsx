/**
 * TeamMembers.tsx
 *
 * Insurer Admin — Team Member Management
 *
 * Allows the insurer_admin to:
 *  1. View all active users in their tenant
 *  2. Invite new users by email (assigns an insurer sub-role)
 *  3. Change an existing user's insurer sub-role
 *  4. Deactivate a user (removes tenant access)
 *  5. View and cancel pending invitations
 *
 * Design: matches the original insurer portal light design (white cards, teal accent).
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Users,
  UserPlus,
  Mail,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  Trash2,
  Pencil,
  Send,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Role helpers ─────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: "claims_processor",  label: "Claims Processor" },
  { value: "assessor_internal", label: "Internal Assessor" },
  { value: "risk_manager",      label: "Risk Manager" },
  { value: "claims_manager",    label: "Claims Manager" },
  { value: "executive",         label: "Executive" },
  { value: "insurer_admin",     label: "Insurer Admin" },
  { value: "recovery_officer",  label: "Recovery Officer" },
] as const;

type InsurerRole = (typeof ROLE_OPTIONS)[number]["value"];

const ROLE_COLORS: Record<InsurerRole, string> = {
  claims_processor:  "bg-emerald-100 text-emerald-700 border-emerald-200",
  assessor_internal: "bg-orange-100 text-orange-700 border-orange-200",
  risk_manager:      "bg-amber-100 text-amber-700 border-amber-200",
  claims_manager:    "bg-blue-100 text-blue-700 border-blue-200",
  executive:         "bg-violet-100 text-violet-700 border-violet-200",
  insurer_admin:     "bg-rose-100 text-rose-700 border-rose-200",
  recovery_officer:  "bg-lime-100 text-lime-700 border-lime-200",
};

function RoleBadge({ role }: { role: string | null | undefined }) {
  if (!role) return <span className="text-xs text-muted-foreground">—</span>;
  const label = ROLE_OPTIONS.find(r => r.value === role)?.label ?? role;
  const color = ROLE_COLORS[role as InsurerRole] ?? "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${color}`}>
      {label}
    </span>
  );
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TeamMembers() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // ── Data ──
  const { data: members = [], isLoading: membersLoading, refetch: refetchMembers } =
    trpc.teamMembers.list.useQuery();
  const { data: invitations = [], isLoading: invitationsLoading, refetch: refetchInvitations } =
    trpc.teamMembers.listInvitations.useQuery();

  // ── Invite dialog ──
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InsurerRole | "">("");
  const [inviteExpiry, setInviteExpiry] = useState(7);
  const [inviteResult, setInviteResult] = useState<{ inviteUrl: string; email: string } | null>(null);

  const inviteMutation = trpc.teamMembers.invite.useMutation({
    onSuccess: (data) => {
      setInviteResult({ inviteUrl: data.inviteUrl, email: data.email });
      utils.teamMembers.listInvitations.invalidate();
      toast.success(`Invitation created for ${data.email}`);
    },
    onError: (err) => toast.error(err.message),
  });

  function handleInvite() {
    if (!inviteEmail || !inviteRole) {
      toast.error("Please enter an email address and select a role.");
      return;
    }
    inviteMutation.mutate({
      email: inviteEmail,
      insurerRole: inviteRole as InsurerRole,
      expirationDays: inviteExpiry,
      origin: window.location.origin,
    });
  }

  function closeInviteDialog() {
    setInviteOpen(false);
    setInviteEmail("");
    setInviteRole("");
    setInviteExpiry(7);
    setInviteResult(null);
  }

  // ── Edit role dialog ──
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: number; name: string | null; email: string | null; insurerRole: string | null } | null>(null);
  const [editRole, setEditRole] = useState<InsurerRole | "">("");

  const updateRoleMutation = trpc.teamMembers.updateRole.useMutation({
    onSuccess: () => {
      utils.teamMembers.list.invalidate();
      toast.success("Role updated successfully.");
      setEditOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  function openEditDialog(member: any) {
    setEditTarget(member);
    setEditRole((member.insurerRole as InsurerRole) ?? "");
    setEditOpen(true);
  }

  // ── Deactivate ──
  const deactivateMutation = trpc.teamMembers.deactivate.useMutation({
    onSuccess: () => {
      utils.teamMembers.list.invalidate();
      toast.success("User deactivated and removed from this tenant.");
    },
    onError: (err) => toast.error(err.message),
  });

  function handleDeactivate(member: any) {
    if (!confirm(`Remove ${member.name ?? member.email} from your team? They will lose access immediately.`)) return;
    deactivateMutation.mutate({ userId: member.id });
  }

  // ── Cancel invitation ──
  const cancelInviteMutation = trpc.teamMembers.cancelInvitation.useMutation({
    onSuccess: () => {
      utils.teamMembers.listInvitations.invalidate();
      toast.success("Invitation cancelled.");
    },
    onError: (err) => toast.error(err.message),
  });
  // ── Resend invitation ──
  const resendInviteMutation = trpc.teamMembers.resendInvitation.useMutation({
    onSuccess: (data) => {
      utils.teamMembers.listInvitations.invalidate();
      toast.success(`New invitation sent to ${data.email}. Link copied to clipboard.`);
      const acceptUrl = `${window.location.origin}/invite/accept/${data.token}`;
      navigator.clipboard.writeText(acceptUrl).catch(() => {});
    },
    onError: (err) => toast.error(err.message),
  });

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your organisation's portal users — invite colleagues, assign roles, and revoke access.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetchMembers(); refetchInvitations(); }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => setInviteOpen(true)}
          >
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            Invite User
          </Button>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Members", value: membersLoading ? "…" : members.length, icon: Users, color: "text-teal-600" },
          { label: "Pending Invitations", value: invitationsLoading ? "…" : invitations.length, icon: Mail, color: "text-amber-600" },
          { label: "Admins", value: membersLoading ? "…" : members.filter((m: any) => m.insurerRole === "insurer_admin").length, icon: ShieldCheck, color: "text-rose-600" },
          { label: "Your Role", value: "Insurer Admin", icon: CheckCircle2, color: "text-blue-600" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="border-0 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className={stat.color}><Icon className="h-4 w-4" /></span>
                </div>
                <p className="text-xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members" className="relative">
            Active Members
            {!membersLoading && members.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-500 text-white text-[10px] font-bold">
                {members.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="invitations" className="relative">
            Pending Invitations
            {!invitationsLoading && invitations.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {invitations.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Active Members tab ── */}
        <TabsContent value="members" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Active Team Members</CardTitle>
              <CardDescription className="text-xs">
                All users currently active in your organisation's portal.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {membersLoading ? (
                <div className="space-y-2 px-4 pb-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-10 rounded bg-muted animate-pulse" />
                  ))}
                </div>
              ) : members.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <Users className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">No team members yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Invite your first colleague using the button above.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Last Sign-in</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member: any) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-teal-700">
                                {(member.name ?? member.email ?? "?").charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="text-sm truncate max-w-[140px]">
                              {member.name ?? <span className="text-muted-foreground italic">No name</span>}
                            </span>
                            {member.id === (user as any)?.id && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">You</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{member.email ?? "—"}</TableCell>
                        <TableCell><RoleBadge role={member.insurerRole} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(member.lastSignedIn)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(member.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => openEditDialog(member)}
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              Edit Role
                            </Button>
                            {member.id !== (user as any)?.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                onClick={() => handleDeactivate(member)}
                                disabled={deactivateMutation.isPending}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Remove
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Pending Invitations tab ── */}
        <TabsContent value="invitations" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Pending Invitations</CardTitle>
              <CardDescription className="text-xs">
                Invitations that have been sent but not yet accepted.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {invitationsLoading ? (
                <div className="space-y-2 px-4 pb-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-10 rounded bg-muted animate-pulse" />
                  ))}
                </div>
              ) : invitations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <Mail className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">No pending invitations</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All sent invitations have been accepted or expired.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Assigned Role</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((inv: any) => {
                      const isExpiringSoon = new Date(inv.expiresAt) < new Date(Date.now() + 24 * 60 * 60 * 1000);
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium text-sm">{inv.email}</TableCell>
                          <TableCell><RoleBadge role={inv.insurerRole} /></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {isExpiringSoon && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                              <span className={`text-xs ${isExpiringSoon ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                                {fmtDate(inv.expiresAt)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(inv.createdAt)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-teal-600 hover:text-teal-700"
                                onClick={() =>
                                  resendInviteMutation.mutate({
                                    invitationId: inv.id,
                                    origin: window.location.origin,
                                  })
                                }
                                disabled={resendInviteMutation.isPending}
                                title="Cancel this invitation and send a fresh one"
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Resend
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                onClick={() => cancelInviteMutation.mutate({ invitationId: inv.id })}
                                disabled={cancelInviteMutation.isPending}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Cancel
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Invite User Dialog ── */}
      <Dialog open={inviteOpen} onOpenChange={(open) => { if (!open) closeInviteDialog(); else setInviteOpen(true); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite a Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation to a colleague. They will receive a link to create their account and join your organisation.
            </DialogDescription>
          </DialogHeader>

          {inviteResult ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-teal-50 border border-teal-200">
                <CheckCircle2 className="h-5 w-5 text-teal-600 flex-shrink-0" />
                <p className="text-sm text-teal-800 font-medium">
                  Invitation created for {inviteResult.email}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Share this invitation link</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={inviteResult.inviteUrl}
                    className="text-xs font-mono"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(inviteResult.inviteUrl);
                      toast.success("Link copied to clipboard");
                    }}
                  >
                    Copy
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  This link expires in {inviteExpiry} day(s). Share it securely with the invitee.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeInviteDialog}>Close</Button>
                <Button
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={() => {
                    setInviteResult(null);
                    setInviteEmail("");
                    setInviteRole("");
                  }}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                  Invite Another
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email">Email Address <span className="text-destructive">*</span></Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-role">Portal Role <span className="text-destructive">*</span></Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as InsurerRole)}>
                    <SelectTrigger id="invite-role">
                      <SelectValue placeholder="Select a role…" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-expiry">Invitation Expires In</Label>
                  <Select value={String(inviteExpiry)} onValueChange={(v) => setInviteExpiry(Number(v))}>
                    <SelectTrigger id="invite-expiry">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 days</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeInviteDialog}>Cancel</Button>
                <Button
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={handleInvite}
                  disabled={inviteMutation.isPending}
                >
                  {inviteMutation.isPending ? (
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Send Invitation
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Role Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update the portal role for{" "}
              <span className="font-medium">{editTarget?.name ?? editTarget?.email ?? "this user"}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Current Role</Label>
              <div><RoleBadge role={editTarget?.insurerRole} /></div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-role">New Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as InsurerRole)}>
                <SelectTrigger id="edit-role">
                  <SelectValue placeholder="Select a role…" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => {
                if (!editTarget || !editRole) return;
                updateRoleMutation.mutate({ userId: editTarget.id, newInsurerRole: editRole as InsurerRole });
              }}
              disabled={updateRoleMutation.isPending || !editRole || editRole === editTarget?.insurerRole}
            >
              {updateRoleMutation.isPending ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
