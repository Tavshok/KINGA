import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, CheckCircle, XCircle, Zap, Eye, BarChart3, Search, DollarSign, ClipboardList, ChevronsUpDown, Download, LayoutDashboard, RefreshCw, Activity } from "lucide-react";
import { RiskBadge } from "@/components/ClaimRiskIndicators";
import KingaLogo from "@/components/KingaLogo";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { EmptyState } from "@/components/EmptyState";
import { generateClaimSummaryPDF } from "@/lib/pdfExport";
import ThemeToggle from "@/components/ThemeToggle";

export default function InsurerClaimsTriage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedAssessors, setSelectedAssessors] = useState<Record<number, number>>({});
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const handleDownloadSummary = async (claim: any) => {
    setDownloadingId(claim.id);
    try {
      await generateClaimSummaryPDF({
        claimNumber: claim.claimNumber,
        vehicleRegistration: claim.vehicleRegistration,
        vehicleMake: claim.vehicleMake,
        vehicleModel: claim.vehicleModel,
        vehicleYear: claim.vehicleYear,
        status: claim.status,
        incidentDate: claim.incidentDate,
        incidentType: claim.incidentType,
        estimatedCost: claim.estimatedCost,
        fraudRiskScore: claim.fraudRiskScore,
        policyNumber: claim.policyNumber,
        policyHolder: claim.policyHolder,
        createdAt: claim.createdAt,
      });
      toast.success(`Summary PDF downloaded for claim ${claim.claimNumber}`);
    } catch (e) {
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };
  const [searchQuery, setSearchQuery] = useState("");
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Get pending claims (both submitted and triage status)
  const { data: submittedClaims = [], refetch: refetchSubmitted } = trpc.claims.byStatus.useQuery({
    status: "submitted",
  });
  const { data: triageClaims = [], refetch: refetchTriage } = trpc.claims.byStatus.useQuery({
    status: "triage",
  });
  const { data: assessmentPendingClaims = [], refetch: refetchAssessment } = trpc.claims.byStatus.useQuery({
    status: "assessment_pending",
  });
  
  // Combine all claims that need triage attention
  const allClaims = useMemo(() => [
    ...submittedClaims,
    ...triageClaims,
    ...assessmentPendingClaims,
  ], [submittedClaims, triageClaims, assessmentPendingClaims]);
  
  const refetchClaims = () => {
    refetchSubmitted();
    refetchTriage();
    refetchAssessment();
  };

  // Filter claims by registration number or claim number
  const claims = useMemo(() => {
    if (!searchQuery.trim()) return allClaims;
    const query = searchQuery.toLowerCase().trim();
    return allClaims.filter(claim => 
      claim.claimNumber.toLowerCase().includes(query) ||
      claim.vehicleRegistration?.toLowerCase().includes(query)
    );
  }, [allClaims, searchQuery]);

  // Get list of assessors
  const { data: assessors = [] } = trpc.assessors.list.useQuery();

  // Mutations
  const verifyPolicy = trpc.claims.verifyPolicy.useMutation({
    onSuccess: () => {
      toast.success("Policy verification updated");
      refetchClaims();
    },
    onError: (error) => {
      toast.error(`Failed to verify policy: ${error.message}`);
    },
  });

  const assignToAssessor = trpc.claims.assignToAssessor.useMutation({
    onSuccess: () => {
      toast.success("Claim assigned to assessor");
      refetchClaims();
    },
    onError: (error) => {
      toast.error(`Failed to assign claim: ${error.message}`);
    },
  });

  const triggerAiAssessment = trpc.claims.triggerAiAssessment.useMutation({
    onSuccess: (data, variables) => {
      toast.success("AI assessment completed successfully");
      refetchClaims();
      // Navigate to comparison view to show results
      setLocation(`/insurer/claims/${variables.claimId}/comparison`);
    },
    onError: (error) => {
      toast.error(`Failed to trigger AI assessment: ${error.message}`);
    },
  });

  const handleVerifyPolicy = (claimId: number, verified: boolean) => {
    verifyPolicy.mutate({ claimId, verified });
  };

  const handleAssignAssessor = (claimId: number) => {
    const assessorId = selectedAssessors[claimId];
    if (!assessorId) {
      toast.error("Please select an assessor");
      return;
    }
    assignToAssessor.mutate({ claimId, assessorId });
  };

  const handleTriggerAi = (claimId: number) => {
    triggerAiAssessment.mutate({ claimId });
  };

  // Paginate claims
  const paginatedClaims = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return claims.slice(startIndex, endIndex);
  }, [claims, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(claims.length / itemsPerPage);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { className: string; label: string }> = {
      submitted: { 
        className: "bg-gradient-to-r from-primary to-primary/80 text-white border-none", 
        label: "Pending Triage" 
      },
      triage: { 
        className: "bg-gradient-to-r from-amber-400 to-orange-500 text-white border-none", 
        label: "In Triage" 
      },
      assessment_pending: { 
        className: "bg-gradient-to-r from-purple-400 to-purple-500 text-white border-none", 
        label: "Assessment Pending" 
      },
      assessment_in_progress: { 
        className: "bg-gradient-to-r from-indigo-700 to-indigo-800 text-white border-none", 
        label: "Assessment In Progress" 
      },
      quotes_pending: { 
        className: "bg-gradient-to-r from-pink-400 to-pink-500 text-white border-none", 
        label: "Quotes Pending" 
      },
      comparison: { 
        className: "bg-gradient-to-r from-cyan-700 to-cyan-800 text-white border-none", 
        label: "In Comparison" 
      },
      repair_assigned: { 
        className: "bg-gradient-to-r from-teal-700 to-teal-800 text-white border-none", 
        label: "Repair Assigned" 
      },
      repair_in_progress: { 
        className: "bg-gradient-to-r from-lime-400 to-lime-500 text-white border-none", 
        label: "Repair In Progress" 
      },
      completed: { 
        className: "bg-gradient-to-r from-emerald-700 to-green-800 text-white border-none", 
        label: "Completed" 
      },
      rejected: { 
        className: "bg-gradient-to-r from-rose-700 to-red-800 text-white border-none", 
        label: "Rejected" 
      },
    };
    const config = statusConfig[status] || { 
      className: "bg-gray-100 dark:bg-muted text-gray-800 dark:text-foreground", 
      label: status 
    };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* BI Hero Header */}
      <header style={{ background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--success)' }}>
                <ClipboardList className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>Claims Triage Queue</h1>
                  <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: 'var(--fp-success-bg)', color: 'var(--success)', border: '1px solid var(--fp-success-border)' }}>
                    {claims.length} pending
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Review and process submitted claims · Assign assessors · Trigger AI analysis</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => refetchClaims()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </button>
              <button
                onClick={() => setLocation("/insurer/dashboard")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
              >
                <LayoutDashboard className="h-3 w-3" />
                Dashboard
              </button>
              <button
                onClick={() => setLocation("/admin/pipeline-health")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
              >
                <Activity className="h-3 w-3" />
                Pipeline Health
              </button>
              <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />
              <div className="text-right">
                <p className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>{user?.name}</p>
                <p className="text-xs capitalize" style={{ color: 'var(--muted-foreground)' }}>{user?.role}</p>
              </div>
              <ThemeToggle />
              <button
                onClick={() => logout()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--fp-critical-bg)', border: '1px solid var(--fp-critical-border)', color: 'var(--chart-4)' }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Search + Filter Bar */}
        <div
          className="rounded-xl p-4 mb-4 flex items-center gap-4"
          style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
        >
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
            <input
              type="text"
              placeholder="Search by claim # or registration…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg text-sm"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
                outline: 'none',
              }}
            />
          </div>
          <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Showing <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{claims.length}</span> claim{claims.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Table Card */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
        >
          <div style={{ padding: '0' }}>
            {claims.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No pending claims"
                description="All claims have been processed. New claims submitted by claimants will appear here for triage."
                actionLabel="Back to Dashboard"
                onAction={() => setLocation('/insurer/dashboard')}
              />
            ) : (
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
                    {['Claim #', 'Claimant', 'Vehicle', 'Date', 'Status', 'Policy', 'Risk', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedClaims.map((claim, idx) => (
                    <tr key={claim.id} style={{ background: idx % 2 === 0 ? 'var(--background)' : 'var(--card)', borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: 'var(--success)' }}>
                        {claim.claimNumber}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--foreground)' }}>Claimant #{claim.claimantId}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--foreground)' }}>
                        {claim.vehicleMake} {claim.vehicleModel} ({claim.vehicleYear})
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(claim.status)}</td>
                      <td className="px-4 py-3">
                        {claim.policyVerified === null ? (
                          <div className="flex gap-1">
                            <button
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                              style={{ background: 'var(--fp-success-bg)', border: '1px solid var(--fp-success-border)', color: 'var(--success)' }}
                              onClick={() => handleVerifyPolicy(claim.id, true)}
                              disabled={verifyPolicy.isPending}
                            >
                              <CheckCircle className="h-3 w-3" />
                              Verify
                            </button>
                            <button
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                              style={{ background: 'var(--fp-critical-bg)', border: '1px solid var(--fp-critical-border)', color: 'var(--chart-4)' }}
                              onClick={() => handleVerifyPolicy(claim.id, false)}
                              disabled={verifyPolicy.isPending}
                            >
                              <XCircle className="h-3 w-3" />
                              Reject
                            </button>
                          </div>
                        ) : claim.policyVerified ? (
                          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--success)' }}>
                            <CheckCircle className="h-3 w-3" /> Verified
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--chart-4)' }}>
                            <XCircle className="h-3 w-3" /> Rejected
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RiskBadge fraudRiskScore={claim.fraudRiskScore} fraudFlags={claim.fraudFlags} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2" style={{ minWidth: '220px' }}>
                          <div className="flex gap-1">
                            <AssessorCombobox
                              assessors={assessors}
                              selectedId={selectedAssessors[claim.id]}
                              onSelect={(id) =>
                                setSelectedAssessors((prev) => ({
                                  ...prev,
                                  [claim.id]: id,
                                }))
                              }
                            />
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 px-2"
                              onClick={() => handleAssignAssessor(claim.id)}
                              disabled={!selectedAssessors[claim.id] || assignToAssessor.isPending}
                            >
                              Assign
                            </Button>
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            <button
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                              style={{ background: 'var(--fp-info-bg)', border: '1px solid var(--fp-info-border)', color: 'var(--chart-5)' }}
                              onClick={() => handleTriggerAi(claim.id)}
                              disabled={triggerAiAssessment.isPending}
                            >
                              <Zap className="h-3 w-3" />
                              AI
                            </button>
                            <button
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                              style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
                              onClick={() => setLocation(`/insurer/claims/${claim.id}`)}
                            >
                              <Eye className="h-3 w-3" />
                              View
                            </button>
                            <button
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                              style={{ background: 'var(--fp-success-bg)', border: '1px solid var(--fp-success-border)', color: 'var(--success)' }}
                              onClick={() => setLocation(`/insurer/claims/${claim.id}/comparison`)}
                            >
                              <BarChart3 className="h-3 w-3" />
                              Compare
                            </button>
                            <button
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                              style={{ background: 'var(--fp-info-bg)', border: '1px solid var(--fp-info-border)', color: 'var(--chart-1)' }}
                              onClick={() => setLocation(`/insurer/claims/${claim.id}/quote-comparison`)}
                            >
                              <DollarSign className="h-3 w-3" />
                              Quotes
                            </button>
                            <button
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                              style={{ background: 'var(--fp-warning-bg)', border: '1px solid var(--fp-warning-border)', color: 'var(--chart-3)', opacity: downloadingId === claim.id ? 0.6 : 1 }}
                              onClick={() => handleDownloadSummary(claim)}
                              disabled={downloadingId === claim.id}
                              title="Download claim summary PDF"
                            >
                              <Download className="h-3 w-3" />
                              {downloadingId === claim.id ? '...' : 'PDF'}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            
            {/* Pagination Controls */}
            {claims.length > itemsPerPage && (
              <div
                className="flex items-center justify-between px-6 py-3"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  Showing {((currentPage - 1) * itemsPerPage) + 1}–{Math.min(currentPage * itemsPerPage, claims.length)} of {claims.length} claims
                </div>
                <div className="flex gap-1.5">
                  <button
                    className="px-3 py-1.5 rounded text-xs font-medium disabled:opacity-40"
                    style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    ← Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      className="w-8 h-8 rounded text-xs font-medium"
                      style={{
                        background: page === currentPage ? 'var(--success)' : 'var(--muted)',
                        border: `1px solid ${page === currentPage ? 'var(--success)' : 'var(--border)'}`,
                        color: page === currentPage ? 'white' : 'var(--muted-foreground)',
                      }}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    className="px-3 py-1.5 rounded text-xs font-medium disabled:opacity-40"
                    style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}


// ========== SEARCHABLE ASSESSOR COMBOBOX ==========
function AssessorCombobox({
  assessors,
  selectedId,
  onSelect,
}: {
  assessors: any[];
  selectedId?: number;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!assessors) return [];
    if (!search) return assessors;
    const lower = search.toLowerCase();
    return assessors.filter((a: any) =>
      a.name?.toLowerCase().includes(lower) ||
      a.email?.toLowerCase().includes(lower)
    );
  }, [assessors, search]);

  const selectedName = selectedId
    ? assessors.find((a: any) => a.id === selectedId)?.name || "Selected"
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-7 text-xs justify-between flex-1 min-w-0"
        >
          <span className="truncate">
            {selectedName || "Search assessor..."}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type name or email..."
            value={search}
            onValueChange={setSearch}
            className="text-xs"
          />
          <CommandList>
            <CommandEmpty>No assessors found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((assessor: any) => (
                <CommandItem
                  key={assessor.id}
                  value={assessor.id.toString()}
                  onSelect={() => {
                    onSelect(assessor.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{assessor.name}</span>
                    {assessor.email && (
                      <span className="text-xs text-muted-foreground">{assessor.email}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
