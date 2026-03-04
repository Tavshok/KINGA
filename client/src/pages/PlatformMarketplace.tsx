/**
 * PlatformMarketplace
 *
 * Platform Super Admin — Marketplace Provider Management
 *
 * Provides full visibility over all marketplace providers (assessors and panel
 * beaters) across every insurer tenant, with actions to approve, reject, or
 * suspend providers, and a modal to inspect per-insurer relationships.
 *
 * Access: platform_super_admin only (enforced by ProtectedRoute + superAdminProcedure)
 */

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  Star,
  Users,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalStatus = "pending" | "approved" | "rejected";
type ProviderType   = "assessor" | "panel_beater";
type ActionType     = "approved" | "rejected" | "suspended";

interface Provider {
  id: string;
  type: ProviderType;
  companyName: string;
  countryId: string;
  contactEmail: string | null;
  contactPhone: string | null;
  approvalStatus: ApprovalStatus;
  rejectionReason: string | null;
  createdAt: string;
  stats: {
    totalRelationships: number;
    blacklistedCount: number;
    preferredCount: number;
    suspendedCount: number;
    activeCount: number;
  };
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function ApprovalBadge({ status, rejectionReason }: { status: ApprovalStatus; rejectionReason?: string | null }) {
  const isSuspended = status === "rejected" && rejectionReason?.startsWith("[SUSPENDED]");

  if (isSuspended) {
    return (
      <Badge className="bg-orange-100 text-orange-700 border-orange-200 gap-1">
        <ShieldAlert className="h-3 w-3" />
        Suspended
      </Badge>
    );
  }

  switch (status) {
    case "approved":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Approved
        </Badge>
      );
    case "rejected":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
          <XCircle className="h-3 w-3" />
          Rejected
        </Badge>
      );
    default:
      return (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      );
  }
}

function RelationshipStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "approved":
      return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Active</Badge>;
    case "blacklisted":
      return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Blacklisted</Badge>;
    case "suspended":
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">Suspended</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs">{status}</Badge>;
  }
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────

interface PlatformStats {
  totalProviders: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  assessorCount: number;
  panelBeaterCount: number;
  totalRelationships: number;
  blacklistedCount: number;
  suspendedCount: number;
  preferredCount: number;
}

function StatsCards({ stats }: { stats: PlatformStats | undefined }) {
  if (!stats) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Providers</CardTitle>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalProviders.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.assessorCount} assessors · {stats.panelBeaterCount} panel beaters
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
          <Clock className="h-4 w-4 text-yellow-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-yellow-600">{stats.pendingCount.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.approvedCount} approved · {stats.rejectedCount} rejected
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Relationships</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalRelationships.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.preferredCount} preferred · {stats.suspendedCount} suspended
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Blacklisted</CardTitle>
          <ShieldAlert className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">{stats.blacklistedCount.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground mt-1">Across all insurer tenants</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Relationships Modal ──────────────────────────────────────────────────────

function RelationshipsModal({
  profileId,
  companyName,
  open,
  onClose,
}: {
  profileId: string | null;
  companyName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.platformMarketplace.getProviderRelationships.useQuery(
    { profileId: profileId! },
    { enabled: !!profileId && open }
  );

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-600" />
            Insurer Relationships — {companyName}
          </DialogTitle>
          <DialogDescription>
            All insurer tenants that have linked this provider, and their current relationship status.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-purple-500" />
          </div>
        ) : !data?.relationships.length ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No insurer relationships found for this provider.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.relationships.map(rel => (
              <div
                key={rel.id}
                className="flex items-start justify-between p-3 rounded-lg border bg-muted/30"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {rel.insurerContactName ?? rel.insurerTenantId}
                    </span>
                    {rel.preferred && (
                      <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs gap-1">
                        <Star className="h-2.5 w-2.5" />
                        Preferred
                      </Badge>
                    )}
                    {rel.slaSigned && (
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                        SLA Signed
                      </Badge>
                    )}
                  </div>
                  {rel.insurerContactEmail && (
                    <p className="text-xs text-muted-foreground">{rel.insurerContactEmail}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Tenant: <code className="bg-muted px-1 rounded text-xs">{rel.insurerTenantId}</code>
                  </p>
                  {rel.notes && (
                    <p className="text-xs text-muted-foreground italic">"{rel.notes}"</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Linked: {new Date(rel.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <RelationshipStatusBadge status={rel.relationshipStatus} />
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Action Modal ─────────────────────────────────────────────────────────────

function ActionModal({
  provider,
  action,
  open,
  onClose,
  onSuccess,
}: {
  provider: Provider | null;
  action: ActionType | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const mutation = trpc.platformMarketplace.updateApprovalStatus.useMutation({
    onSuccess: () => {
      toast({
        title: "Provider updated",
        description: `${provider?.companyName} has been ${action}.`,
      });
      utils.platformMarketplace.listProviders.invalidate();
      utils.platformMarketplace.getStats.invalidate();
      setReason("");
      onSuccess();
    },
    onError: err => {
      toast({
        title: "Action failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleConfirm = () => {
    if (!provider || !action) return;
    mutation.mutate({
      profileId: provider.id,
      action,
      rejectionReason: reason || undefined,
    });
  };

  const actionLabels: Record<ActionType, { title: string; description: string; buttonLabel: string; buttonClass: string }> = {
    approved: {
      title: "Approve Provider",
      description: "This provider will be visible to all insurer tenants for panel selection.",
      buttonLabel: "Approve",
      buttonClass: "bg-green-600 hover:bg-green-700 text-white",
    },
    rejected: {
      title: "Reject Provider",
      description: "This provider will be removed from the marketplace. Provide a reason below.",
      buttonLabel: "Reject",
      buttonClass: "bg-red-600 hover:bg-red-700 text-white",
    },
    suspended: {
      title: "Suspend Provider",
      description: "This provider will be temporarily removed from the marketplace. Provide a reason below.",
      buttonLabel: "Suspend",
      buttonClass: "bg-orange-600 hover:bg-orange-700 text-white",
    },
  };

  const labels = action ? actionLabels[action] : null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{labels?.title}</DialogTitle>
          <DialogDescription>
            <strong>{provider?.companyName}</strong> — {labels?.description}
          </DialogDescription>
        </DialogHeader>

        {(action === "rejected" || action === "suspended") && (
          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason {action === "rejected" ? "(required)" : "(optional)"}
            </Label>
            <Textarea
              id="reason"
              placeholder={`Enter reason for ${action}...`}
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            className={labels?.buttonClass}
            onClick={handleConfirm}
            disabled={mutation.isPending || (action === "rejected" && !reason.trim())}
          >
            {mutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {labels?.buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlatformMarketplace() {
  const [page, setPage]                   = useState(1);
  const [search, setSearch]               = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter]       = useState<ProviderType | "all">("all");
  const [statusFilter, setStatusFilter]   = useState<ApprovalStatus | "all">("all");

  // Action modal state
  const [actionProvider, setActionProvider] = useState<Provider | null>(null);
  const [actionType, setActionType]         = useState<ActionType | null>(null);
  const [actionOpen, setActionOpen]         = useState(false);

  // Relationships modal state
  const [relProvider, setRelProvider] = useState<{ id: string; name: string } | null>(null);
  const [relOpen, setRelOpen]         = useState(false);

  const { toast } = useToast();

  // Debounce search
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    const timer = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const { data: stats, isLoading: statsLoading } = trpc.platformMarketplace.getStats.useQuery();

  const { data, isLoading, refetch } = trpc.platformMarketplace.listProviders.useQuery({
    page,
    pageSize: 20,
    type:           typeFilter !== "all"   ? typeFilter   : undefined,
    approvalStatus: statusFilter !== "all" ? statusFilter : undefined,
    search:         debouncedSearch || undefined,
  });

  const openAction = (provider: Provider, action: ActionType) => {
    setActionProvider(provider);
    setActionType(action);
    setActionOpen(true);
  };

  const openRelationships = (provider: Provider) => {
    setRelProvider({ id: provider.id, name: provider.companyName });
    setRelOpen(true);
  };

  const handleFilterChange = (setter: (v: any) => void) => (v: any) => {
    setter(v);
    setPage(1);
  };

  return (
    <div className="container py-8 space-y-8">
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Badge variant="secondary" className="bg-purple-100 text-purple-700">
            Platform Super Admin
          </Badge>
          <Badge variant="outline">Marketplace Management</Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Marketplace Providers</h1>
        <p className="text-muted-foreground mt-2">
          Manage all assessors and panel beaters across every insurer tenant. Approve, reject, or
          suspend providers and inspect their insurer relationships.
        </p>
      </div>

      {/* ── KPI Cards ── */}
      {statsLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-8 w-24 bg-muted animate-pulse rounded mb-2" />
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <StatsCards stats={stats} />
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by company name..."
            className="pl-9"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
          />
        </div>

        <Select value={typeFilter} onValueChange={handleFilterChange(setTypeFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="assessor">Assessors</SelectItem>
            <SelectItem value="panel_beater">Panel Beaters</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected / Suspended</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon" onClick={() => refetch()} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Provider Table ── */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : !data?.providers.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No providers found</p>
          <p className="text-sm mt-1">Try adjusting your filters or search term.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.providers.map(provider => (
            <div
              key={provider.id}
              className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
            >
              {/* Left: Provider info */}
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-purple-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">{provider.companyName}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {provider.type === "panel_beater" ? "Panel Beater" : "Assessor"}
                    </Badge>
                    <ApprovalBadge
                      status={provider.approvalStatus}
                      rejectionReason={provider.rejectionReason}
                    />
                    {provider.stats.blacklistedCount > 0 && (
                      <Badge className="bg-red-100 text-red-700 border-red-200 text-xs gap-1 shrink-0">
                        <ShieldAlert className="h-2.5 w-2.5" />
                        Blacklisted by {provider.stats.blacklistedCount}
                      </Badge>
                    )}
                    {provider.stats.preferredCount > 0 && (
                      <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs gap-1 shrink-0">
                        <Star className="h-2.5 w-2.5" />
                        Preferred by {provider.stats.preferredCount}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{provider.countryId}</span>
                    {provider.contactEmail && <span>{provider.contactEmail}</span>}
                    <span>
                      {provider.stats.totalRelationships} insurer
                      {provider.stats.totalRelationships !== 1 ? "s" : ""}
                    </span>
                    <span>Joined {new Date(provider.createdAt).toLocaleDateString()}</span>
                  </div>
                  {provider.rejectionReason && !provider.rejectionReason.startsWith("[SUSPENDED]") && (
                    <p className="text-xs text-red-600 mt-1 truncate">
                      Reason: {provider.rejectionReason}
                    </p>
                  )}
                  {provider.rejectionReason?.startsWith("[SUSPENDED]") && (
                    <p className="text-xs text-orange-600 mt-1 truncate">
                      {provider.rejectionReason.replace("[SUSPENDED] ", "")}
                    </p>
                  )}
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-2 ml-4 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => openRelationships(provider)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Relationships
                </Button>

                {provider.approvalStatus !== "approved" && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white gap-1"
                    onClick={() => openAction(provider, "approved")}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                )}

                {provider.approvalStatus === "approved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-orange-600 border-orange-200 hover:bg-orange-50 gap-1"
                    onClick={() => openAction(provider, "suspended")}
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Suspend
                  </Button>
                )}

                {provider.approvalStatus !== "rejected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50 gap-1"
                    onClick={() => openAction(provider, "rejected")}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, data.pagination.total)} of{" "}
            {data.pagination.total} providers
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {data.pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.pagination.totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <ActionModal
        provider={actionProvider}
        action={actionType}
        open={actionOpen}
        onClose={() => setActionOpen(false)}
        onSuccess={() => setActionOpen(false)}
      />

      <RelationshipsModal
        profileId={relProvider?.id ?? null}
        companyName={relProvider?.name ?? ""}
        open={relOpen}
        onClose={() => setRelOpen(false)}
      />
    </div>
  );
}
