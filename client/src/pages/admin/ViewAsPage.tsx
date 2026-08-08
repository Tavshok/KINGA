/**
 * ViewAsPage — Superadmin "View As" interface in the Admin Portal.
 * Lists all users (QA + real) with a "View As" button per user.
 * On click, issues an impersonation token and redirects to the target user's dashboard.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, User, Search, AlertTriangle, CheckCircle } from "lucide-react";
import { useLocation } from "wouter";
import { COOKIE_NAME } from "@shared/const";

const ROLE_OPTIONS = [
  { value: "", label: "All Roles" },
  { value: "claimant", label: "Claimant" },
  { value: "insurer", label: "Insurer" },
  { value: "assessor", label: "Assessor" },
  { value: "panel_beater", label: "Panel Beater" },
  { value: "fleet_manager", label: "Fleet Manager" },
  { value: "fleet_admin", label: "Fleet Admin" },
  { value: "fleet_driver", label: "Fleet Driver" },
  { value: "agency", label: "Agency" },
  { value: "engineer", label: "Engineer" },
  { value: "admin", label: "Admin" },
  { value: "platform_super_admin", label: "Platform Super Admin" },
];

export default function ViewAsPage() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [, setLocation] = useLocation();
  const [startingFor, setStartingFor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: userList = [], isLoading } = trpc.impersonation.listUsers.useQuery({
    search: search || undefined,
    role: roleFilter || undefined,
  });

  const startMutation = trpc.impersonation.start.useMutation({
    onSuccess: (data) => {
      // Set the impersonation cookie and redirect to the target user's dashboard
      // The token is set as a cookie via the server response
      document.cookie = `${COOKIE_NAME}=${data.token}; path=/; max-age=3600; SameSite=Lax; Secure`;
      setLocation(data.destination);
    },
    onError: (err) => {
      setError(err.message);
      setStartingFor(null);
    },
  });

  const handleViewAs = async (userId: number) => {
    setStartingFor(userId);
    setError(null);
    await startMutation.mutateAsync({ targetUserId: userId });
  };

  const getRoleBadgeColor = (role: string, isQa: number | null) => {
    if (isQa) return "bg-purple-100 text-purple-800 border-purple-200";
    switch (role) {
      case "insurer": return "bg-blue-100 text-blue-800";
      case "assessor": return "bg-green-100 text-green-800";
      case "panel_beater": return "bg-orange-100 text-orange-800";
      case "claimant": return "bg-violet-100 text-violet-800";
      case "fleet_manager":
      case "fleet_admin": return "bg-teal-100 text-teal-800";
      case "agency": return "bg-emerald-100 text-emerald-800";
      case "engineer": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-1">View As</h1>
        <p className="text-muted-foreground text-sm">
          Impersonate any user to test their exact portal experience. Sessions expire in 60 minutes.
          All actions are logged with your real identity.
        </p>
      </div>

      {/* Warning banner */}
      <Card className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Impersonation is audited.</strong> Every session start and end is logged with your identity.
              Destructive actions (delete claim, change roles, modify tenant config) are blocked during impersonation.
              QA accounts (purple badge) are synthetic — safe to use for testing.
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4 text-sm text-red-800">{error}</CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map(opt => (
              <SelectItem key={opt.value || "_all"} value={opt.value || "_all"}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* User list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading users...</div>
      ) : userList.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No users found</div>
      ) : (
        <div className="space-y-2">
          {userList.map((user) => (
            <Card key={user.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{user.name || "(no name)"}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {user.isQaAccount ? (
                      <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs">QA</Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                        <CheckCircle className="h-3 w-3 mr-1" />Real
                      </Badge>
                    )}
                    <Badge className={`text-xs ${getRoleBadgeColor(user.role || "", user.isQaAccount)}`}>
                      {user.role}{user.insurerRole ? `/${user.insurerRole}` : ""}
                    </Badge>
                    {user.tenantId && (
                      <span className="text-xs text-muted-foreground hidden md:block">{user.tenantId}</span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewAs(user.id)}
                      disabled={startingFor === user.id || !user.isActive}
                      className="flex items-center gap-1.5"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {startingFor === user.id ? "Starting..." : "View As"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

