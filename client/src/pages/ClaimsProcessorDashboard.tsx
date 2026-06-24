import { useState, useEffect, useRef, useMemo } from "react";
import React from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);
import { trpc } from "@/lib/trpc";
import { parseUtcTimestamp } from "@/lib/parseUtcTimestamp";
import { SLADeadlineChip } from "@/components/portal/SLADeadlineChip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { NotificationsInbox, NotificationsTabBadge } from "@/components/NotificationsInbox";
import { toast } from "sonner";
import {
  FileText,
  Clock,
  AlertCircle,
  Upload,
  RefreshCw,
  CheckCircle,
  CheckCircle2,
  Brain,
  Shield,
  Eye,
  Download,
  AlertTriangle,
  UserPlus,
  TrendingUp,
  Loader2,
  ArrowRight,
  ExternalLink,
  Search,
  RotateCcw,
  Copy,
  Hash,
  ChevronDown,
  FileSearch,
  Lock
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/_core/hooks/useAuth";
import ReportsBadgeWidget from "@/components/ReportsBadgeWidget";
import { ReportReadinessBadge } from "@/components/ReportReadinessBadge";
import { PortalHeader, PortalKPIStrip, PortalAlerts, type PortalKPI, type PortalAlert, KINGA_GREEN, KINGA_TEAL, KINGA_BLUE, KINGA_AMBER, KINGA_GREEN_BG, KINGA_TEAL_BG, KINGA_BLUE_BG, KINGA_AMBER_BG, KINGA_GREEN_BORDER } from "@/components/KingaPortalShell";
import { PortalHeroBand, ProtoAlertBar } from "@/components/PortalHeroBand";

// Tier gating feature flag — set to true when Process/Protect/Prove tiers are enforced
const TIER_GATE_ENABLED = false;

/**
 * Claims Processor Dashboard
 *
 * Organized into 4 sections:
 * 1. Pending Claims - Newly submitted, awaiting initial review
 * 2. In Review - Currently being processed / KINGA running
 * 3. KINGA Flagged - KINGA assessment complete, ready for review
 * 4. Completed - Processed and closed
 */
export default function ClaimsProcessorDashboard() {
  const { user } = useAuth();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<number | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignClaimId, setAssignClaimId] = useState<number | null>(null);
  const [assessorSearchQuery, setAssessorSearchQuery] = useState("");
  const [selectedAssessorId, setSelectedAssessorId] = useState<number | null>(null);
  const [aiProcessingClaimIds, setAiProcessingClaimIds] = useState<Set<number>>(new Set());
  const [triggeringClaimId, setTriggeringClaimId] = useState<number | null>(null);
  // Debounce map: track how many consecutive polls a claim has been seen in a failure state.
  // Only fire the failure toast after 2 consecutive polls (~10 s) to avoid false positives
  // during transient pipeline state transitions (e.g. intake_pending briefly before pipeline starts).
  const failureDebounceRef = useRef<Map<number, number>>(new Map());
  // Track when each re-run was triggered (claimId → timestamp ms).
  // Completion is only valid if aiAssessmentCompletedAt > rerunStartedAt.
  const rerunStartedAtRef = useRef<Map<number, number>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("pending");

  // Processor queue from dedicated procedure (enriched with priority scoring)
  const { data: processorQueueData } = trpc.claims.getProcessorQueue.useQuery(undefined, { refetchInterval: 60000 }); // eslint-disable-line react-hooks/rules-of-hooks

  // Role validation — allow admin users to bypass for testing
  if (user?.role !== "admin" && user?.insurerRole !== "claims_processor") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F7F8F6' }}>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Shield className="h-5 w-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              This dashboard requires CLAIMS_PROCESSOR role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.href = "/portal-hub"} className="w-full">
              Return to Portal Hub
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fetch all relevant claims in a single query ordered by created_at DESC (newest first)
  const { data: allClaimsData, isLoading: allClaimsLoading, refetch: refetchAll } =
    trpc.workflowQueries.getClaimsByStatus.useQuery(  // eslint-disable-line react-hooks/rules-of-hooks
      {
        statuses: ["intake_pending", "assessment_in_progress", "quotes_pending", "assessment_complete", "closed"],
        limit: 200,
        offset: 0,
      },
      {
        // Poll every 5s when KINGA is actively running (either in this session or detected from DB status)
        // This ensures the page auto-refreshes even after a browser refresh.
        refetchInterval: (data) => {
          const claims = (data as any)?.claims || (data as any)?.items || [];
          const hasInProgress = claims.some((c: any) =>
            c.status === "assessment_in_progress" ||
            c.documentProcessingStatus === "parsing" ||
            c.documentProcessingStatus === "processing"
          );
          // Poll every 2s when KINGA is actively running so stage transitions appear quickly,
          // fall back to 30s when idle to reduce server load.
          return (aiProcessingClaimIds.size > 0 || hasInProgress) ? 2_000 : 30_000;
        },
        refetchIntervalInBackground: false,
      }
    );

  const allClaims = allClaimsData?.claims || allClaimsData?.items || [];

  // Filter by search query
  const filteredClaims = searchQuery.trim()
    ? allClaims.filter((c: any) => {
        const q = searchQuery.toLowerCase();
        return (
          (c.claimNumber || "").toLowerCase().includes(q) ||
          (c.claimantName || c.policyholderName || "").toLowerCase().includes(q) ||
          (c.vehicleRegistration || "").toLowerCase().includes(q) ||
          (c.policyNumber || "").toLowerCase().includes(q)
        );
      })
    : allClaims;

  // Partition into dashboard sections
  const pendingClaims = filteredClaims.filter((c: any) => c.status === "intake_pending");
  const inReviewClaims = filteredClaims.filter((c: any) =>
    c.status === "assessment_in_progress" || c.status === "quotes_pending"
  );
  const aiFlaggedClaims = filteredClaims.filter((c: any) => c.status === "assessment_complete");
  const completedClaims = filteredClaims.filter((c: any) => c.status === "closed");

  // Detect when KINGA processing completes (claim moves from in_review to ai_flagged)
  useEffect(() => { // eslint-disable-line react-hooks/rules-of-hooks
    if (aiProcessingClaimIds.size === 0) return;

    const completedIds = new Set<number>();
    const failedIds = new Set<number>();
    aiProcessingClaimIds.forEach(id => {
      const claim = allClaims.find((c: any) => c.id === id);
      if (!claim) return;
      // Claim finished successfully — but only if the completion timestamp is
      // NEWER than when the re-run was triggered (avoids firing on stale state).
      if (claim.status === "assessment_complete" && claim.documentProcessingStatus !== "parsing" && claim.documentProcessingStatus !== "processing") {
        const rerunStartedAt = rerunStartedAtRef.current.get(id);
        if (rerunStartedAt) {
          // Re-run: only complete if aiAssessmentCompletedAt is after rerunStartedAt
          const completedAt = claim.aiAssessmentCompletedAt ? new Date(claim.aiAssessmentCompletedAt).getTime() : 0;
          if (completedAt > rerunStartedAt) {
            completedIds.add(id);
            rerunStartedAtRef.current.delete(id);
          }
          // else: pipeline still running — keep in processing set
        } else {
          // First-time run: no rerunStartedAt, complete normally
          completedIds.add(id);
        }
      }
      // Claim failed — backend reset it to intake_pending/intake_queue with failed doc status.
      // Use a 2-poll debounce to avoid false positives during transient state transitions.
      const isInFailureState =
        claim.documentProcessingStatus === "failed" ||
        (claim.status === "intake_pending" && claim.workflowState === "intake_queue");
      if (isInFailureState) {
        const prev = failureDebounceRef.current.get(id) ?? 0;
        const next = prev + 1;
        failureDebounceRef.current.set(id, next);
        if (next >= 2) {
          failedIds.add(id);
          failureDebounceRef.current.delete(id);
        }
      } else {
        // Clear debounce counter if claim recovered from the failure state
        failureDebounceRef.current.delete(id);
      }
    });

    const idsToRemove = new Set([...completedIds, ...failedIds]);
    if (idsToRemove.size > 0) {
      setAiProcessingClaimIds(prev => {
        const next = new Set(prev);
        idsToRemove.forEach(id => next.delete(id));
        return next;
      });

      completedIds.forEach(id => {
        const claim = allClaims.find((c: any) => c.id === id);
        const claimLabel = claim?.claimNumber || `Claim #${id}`;
        const reg = claim?.vehicleRegistration ? ` — ${claim.vehicleRegistration}` : '';
        toast.success("KINGA Assessment Complete", {
          description: `${claimLabel}${reg} — 2 reports ready in KINGA Completed`,
          duration: 15000,
          action: {
            label: "View Reports",
            onClick: () => { window.location.href = `/insurer/claims/${id}/comparison?report=standard`; },
          },
        });
      });

      failedIds.forEach(id => {
        const claim = allClaims.find((c: any) => c.id === id);
        toast.error("KINGA Assessment Failed", {
          description: `Processing failed for ${claim?.claimNumber || `Claim #${id}`}. Please check that documents are uploaded and try again.`,
          duration: 8000,
        });
      });
    }
  }, [allClaims, aiProcessingClaimIds]);

  // Trigger KINGA Assessment mutation
  const triggerAiMutation = trpc.claims.triggerAiAssessment.useMutation({ // eslint-disable-line react-hooks/rules-of-hooks
    onSuccess: (_data, variables) => {
      // Record the timestamp so completion detection can ignore the pre-existing
      // assessment_complete state and only fire the toast for the NEW result.
      rerunStartedAtRef.current.set(variables.claimId, Date.now());
      setAiProcessingClaimIds(prev => new Set(prev).add(variables.claimId));
      setTriggeringClaimId(null);
      toast.info("KINGA Re-Analysis Started", {
        description: "KINGA is re-analysing this claim. The report will update automatically when complete (2–4 min).",
        duration: 6000,
      });
      refetchAll();
    },
    onError: (error: any) => {
      setTriggeringClaimId(null);
      toast.error("KINGA Assessment Failed", {
        description: error.message || "Could not trigger KINGA assessment. Please try again.",
      });
      // Refetch so the UI reflects the server's corrected claim state (safety-net resets to intake_pending)
      setTimeout(() => refetchAll(), 1500);
    },
  });

  // Reset stuck claim mutation
  const resetStuckClaimMutation = trpc.claims.resetStuckClaim.useMutation({ // eslint-disable-line react-hooks/rules-of-hooks
    onSuccess: (_data, variables) => {
      // Remove from processing set if it was there
      setAiProcessingClaimIds(prev => {
        const next = new Set(prev);
        next.delete(variables.claimId);
        return next;
      });
      toast.success("Claim Reset", {
        description: "The claim has been reset to Pending. You can now re-run the KINGA assessment.",
      });
      refetchAll();
    },
    onError: (error: any) => {
      toast.error("Reset Failed", {
        description: error.message || "Could not reset the claim. Please try again.",
      });
    },
  });

  const handleResetStuckClaim = (claimId: number) => {
    resetStuckClaimMutation.mutate({ claimId });
  };

  // Upload document mutation
  const uploadDocument = trpc.documents.upload.useMutation({ // eslint-disable-line react-hooks/rules-of-hooks
    onSuccess: () => {
      toast.success("Evidence Uploaded", {
        description: "Additional evidence has been successfully attached to the claim.",
      });
      setUploadDialogOpen(false);
      setSelectedClaimId(null);
      refetchAll();
    },
    onError: (error: any) => {
      toast.error("Upload Error", {
        description: error.message,
      });
      setUploadingFile(false);
    },
  });

  const handleFileUpload = async (file: File) => {
    if (!selectedClaimId) return;

    if (!file.type.includes("pdf") && !file.type.includes("image")) {
      toast.error("Invalid File Type", {
        description: "Only PDF and image files are supported.",
      });
      return;
    }

    if (file.size > 16 * 1024 * 1024) {
      toast.error("File Too Large", {
        description: "File must be smaller than 16MB.",
      });
      return;
    }

    setUploadingFile(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;

        await uploadDocument.mutateAsync({
          claimId: selectedClaimId,
          fileName: file.name,
          fileData: base64,
          fileSize: file.size,
          mimeType: file.type,
          documentTitle: file.name,
          documentDescription: "Additional evidence uploaded by Claims Processor",
          documentCategory: "other",
        });

        setUploadingFile(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("File upload error:", error);
      setUploadingFile(false);
    }
  };

  const handleViewDetails = (claimId: number) => {
    // Navigate to the comparison view which shows full KINGA assessment details
    window.location.href = `/insurer/claims/${claimId}/comparison?report=standard`;
  };

  const handleDownloadReport = async (claimId: number) => {
    // Navigate to comparison view where the PDF download button exists
    window.location.href = `/insurer/claims/${claimId}/comparison?report=standard`;
  };

  const handleUploadEvidence = (claimId: number) => {
    setSelectedClaimId(claimId);
    setUploadDialogOpen(true);
  };

  const handleEscalate = (claimId: number) => {
    toast.info("Escalation", {
      description: "Escalation workflow will be implemented in the next update.",
    });
  };

  const handleTriggerAI = (claimId: number) => {
    setTriggeringClaimId(claimId);
    triggerAiMutation.mutate({
      claimId,
      reason: "Manually triggered from Claims Processor Dashboard"
    });
  };

  // Fetch enriched assessors list (with specializations, ratings) for assignment dialog
  const { data: enrichedAssessors, isLoading: enrichedLoading } = trpc.assessorOnboarding.listInsurerAssessors.useQuery( // eslint-disable-line react-hooks/rules-of-hooks
    undefined,
    { enabled: assignDialogOpen }
  );
  // Fallback to basic assessor list if no onboarded assessors found
  const { data: basicAssessors, isLoading: basicLoading } = trpc.assessors.list.useQuery( // eslint-disable-line react-hooks/rules-of-hooks
    undefined,
    { enabled: assignDialogOpen && !enrichedLoading && (!enrichedAssessors || enrichedAssessors.length === 0) }
  );
  const assessorsList = (enrichedAssessors && enrichedAssessors.length > 0) ? enrichedAssessors : basicAssessors;
  const assessorsLoading = enrichedLoading || basicLoading;

  // Assign to assessor mutation
  const assignToAssessorMutation = trpc.claims.assignToAssessor.useMutation({ // eslint-disable-line react-hooks/rules-of-hooks
    onSuccess: () => {
      toast.success("Assessor Assigned", {
        description: "The claim has been assigned to the selected assessor. They will be notified.",
      });
      setAssignDialogOpen(false);
      setAssignClaimId(null);
      setSelectedAssessorId(null);
      setAssessorSearchQuery("");
      refetchAll();
    },
    onError: (error: any) => {
      toast.error("Assignment Failed", {
        description: error.message || "Could not assign assessor. Please try again.",
      });
    },
  });

  const handleAssignAssessor = (claimId: number) => {
    setAssignClaimId(claimId);
    setSelectedAssessorId(null);
    setAssessorSearchQuery("");
    setAssignDialogOpen(true);
  };

  const handleConfirmAssignment = () => {
    if (!assignClaimId || !selectedAssessorId) return;
    assignToAssessorMutation.mutate({
      claimId: assignClaimId,
      assessorId: selectedAssessorId,
    });
  };

  const filteredAssessors = (assessorsList || []).filter((a: any) => {
    if (!assessorSearchQuery.trim()) return true;
    const q = assessorSearchQuery.toLowerCase();
    return (
      (a.userName || a.name || "").toLowerCase().includes(q) ||
      (a.userEmail || a.email || "").toLowerCase().includes(q) ||
      (a.insurerRole || "").toLowerCase().includes(q) ||
      (a.specializations || []).some((s: string) => s.toLowerCase().includes(q)) ||
      (a.serviceRegions || []).some((r: string) => r.toLowerCase().includes(q))
    );
  });

  // Claim Card component inline for better control
  const ClaimCardInline = ({ claim, section }: { claim: any; section: "pending" | "in_review" | "ai_flagged" | "completed" }) => {
    // A claim is only "processing" if it is NOT yet complete.
    // assessment_complete and closed claims must NEVER show the processing spinner,
    // even if documentProcessingStatus is stale (e.g. still 'parsing' or 'processing').
    // The stuck-recovery job (Case 9) fixes the stale dps in the background, but the
    // UI must not block report access in the meantime.
    const isAlreadyComplete = claim.status === "assessment_complete" || claim.status === "closed";
    const isProcessing = !isAlreadyComplete && (
      aiProcessingClaimIds.has(claim.id) ||
      claim.documentProcessingStatus === "parsing" ||
      claim.documentProcessingStatus === "processing"
    );
    const isTriggering = triggeringClaimId === claim.id;

    const getStatusBadge = () => {
      if (isProcessing) {
        return (
          <Badge className="flex items-center gap-1" style={{ background: KINGA_BLUE_BG, color: KINGA_BLUE, borderColor: '#BDD4EC' }}>
            <Loader2 className="h-3 w-3 animate-spin" />
            KINGA Processing...
          </Badge>
        );
      }

      // Show FAILED badge when document processing failed
      if (claim.documentProcessingStatus === "failed") {
        return (
          <Badge className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            PROCESSING FAILED
          </Badge>
        );
      }

      // For server-driven in-progress state (e.g. after page refresh), show spinner + elapsed time
      if (claim.status === "assessment_in_progress") {
        // Use aiAssessmentStartedAt for accurate elapsed time; fall back to updatedAt only if absent
        // Uses parseUtcTimestamp to correctly handle MySQL UTC timestamps (see lib/parseUtcTimestamp.ts)
        const startedAt = parseUtcTimestamp((claim as any).aiAssessmentStartedAt)
          ?? parseUtcTimestamp(claim.updatedAt as any);
        const elapsedMs = startedAt ? Math.max(0, Date.now() - startedAt.getTime()) : 0;
        const elapsedMin = Math.floor(elapsedMs / 60000);
        const elapsedSec = Math.floor((elapsedMs % 60000) / 1000);
        const elapsedLabel = elapsedMin > 0 ? `${elapsedMin}m ${elapsedSec}s` : `${elapsedSec}s`;
        return (
          <Badge className="flex items-center gap-1" style={{ background: KINGA_BLUE_BG, color: KINGA_BLUE, borderColor: '#BDD4EC' }}>
            <Loader2 className="h-3 w-3 animate-spin" />
            KINGA Analyzing... {elapsedLabel}
          </Badge>
        );
      }

      const statusConfig: Record<string, { label: string; style: React.CSSProperties }> = { // eslint-disable-line
        intake_pending: { label: "PENDING REVIEW", style: { background: KINGA_AMBER_BG, color: KINGA_AMBER, border: 'none' } },
        quotes_pending: { label: "QUOTES PENDING", style: { background: KINGA_BLUE_BG, color: KINGA_BLUE, border: 'none' } },
        assessment_complete: { label: "ASSESSMENT COMPLETE", style: { background: KINGA_TEAL_BG, color: KINGA_TEAL, border: 'none' } },
        closed: { label: "COMPLETED", style: { background: KINGA_GREEN_BG, color: KINGA_GREEN, border: 'none' } },
      };

      const config = statusConfig[claim.status] || { label: claim.status?.replace(/_/g, " ").toUpperCase(), style: {} };

      return (
        <Badge className="border-0" style={config.style}>
          {config.label}
        </Badge>
      );
    };

    return (
      <Card className={`hover:shadow-md transition-shadow ${
        isProcessing ? "border-l-4" : section === "pending" ? "border-l-4" : section === "in_review" ? "border-l-4" : section === "ai_flagged" ? "border-l-4" :
        "border-l-4 border-l-green-400"
      }`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            {/* Left: Claim Information */}
            <div className="flex-1 space-y-3">
              {/* Header Row */}
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="font-bold text-lg text-primary">{claim.claimNumber}</h3>
                {getStatusBadge()}
                {claim.aiConfidenceScore > 0 && (
                  <Badge variant="outline" className="flex items-center gap-1" style={{ color: KINGA_GREEN, borderColor: KINGA_GREEN_BORDER }}>
                    <TrendingUp className="h-3 w-3" />
                    KINGA: {claim.aiConfidenceScore}%
                  </Badge>
                )}
                {claim.fraudRiskScore > 0 && (
                  <Badge variant={claim.fraudRiskScore >= 70 ? "destructive" : "outline"} className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {claim.fraudRiskScore >= 70 ? "High Risk" : claim.fraudRiskScore >= 40 ? "Medium Risk" : "Low Risk"} ({claim.fraudRiskScore}%)
                  </Badge>
                )}
                {/* SLA Chip */}
                <SLADeadlineChip createdAt={claim.createdAt} slaHours={72} />
              </div>

              {/* KINGA Reference Number Badge */}
              {claim.kingaRef && (
                <div className="flex items-center gap-1.5 mt-1">
                  <div
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-semibold cursor-pointer select-all transition-colors"
                    style={{ background: KINGA_BLUE_BG, color: KINGA_BLUE, border: '1px solid #BDD4EC' }}
                    title="Click to copy KINGA reference number"
                    onClick={() => {
                      navigator.clipboard.writeText(claim.kingaRef + '-FR');
                      toast.success('KINGA ref copied', { description: claim.kingaRef + '-FR' });
                    }}
                  >
                    <Hash className="h-3 w-3" />
                    {claim.kingaRef}-FR
                    <Copy className="h-3 w-3 opacity-60" />
                  </div>
                  <div
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                    title="Click to copy Claim Report reference"
                    onClick={() => {
                      navigator.clipboard.writeText(claim.kingaRef + '-CL');
                      toast.success('KINGA ref copied', { description: claim.kingaRef + '-CL' });
                    }}
                  >
                    <Hash className="h-3 w-3" />
                    {claim.kingaRef}-CL
                    <Copy className="h-3 w-3 opacity-60" />
                  </div>
                </div>
              )}

              {/* Data Source Badge */}
              {claim.sourceDocumentId && (
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-xs flex items-center gap-1" style={{ color: KINGA_BLUE, borderColor: '#BDD4EC', background: KINGA_BLUE_BG }}>
                    <FileText className="h-3 w-3" />
                    PDF Document Ingestion
                  </Badge>
                  {claim.documentProcessingStatus === "parsing" && (
                    <Badge variant="outline" className="text-xs flex items-center gap-1" style={{ color: KINGA_BLUE, borderColor: '#BDD4EC', background: KINGA_BLUE_BG }}>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Extracting...
                    </Badge>
                  )}
                  {claim.documentProcessingStatus === "extracted" && (
                    <Badge variant="outline" className="text-xs text-green-700 dark:text-green-300 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Extracted
                    </Badge>
                  )}
                </div>
              )}

              {/* Report Readiness Badge */}
              <div className="flex items-center gap-2">
                <ReportReadinessBadge claimId={claim.id} variant="inline" />
              </div>
              {/* Claim Details Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                <div>
                  <span className="font-medium text-slate-600 dark:text-muted-foreground">Policyholder:</span>
                  <p className="text-slate-900 dark:text-foreground">{claim.claimantName || claim.policyholderName || "N/A"}</p>
                </div>
                <div>
                  <span className="font-medium text-slate-600 dark:text-muted-foreground">Claim Type:</span>
                  <p className="text-slate-900 dark:text-foreground">Motor Vehicle</p>
                </div>
                <div>
                  <span className="font-medium text-slate-600 dark:text-muted-foreground">Vehicle:</span>
                  <p className="text-slate-900 dark:text-foreground">
                    {claim.vehicleRegistration || "N/A"}
                    {claim.vehicleMake && ` (${claim.vehicleMake} ${claim.vehicleModel || ""})`}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-slate-600 dark:text-muted-foreground">Policy Number:</span>
                  <p className="text-slate-900 dark:text-foreground">{claim.policyNumber || "N/A"}</p>
                </div>
                <div>
                  <span className="font-medium text-slate-600 dark:text-muted-foreground">Submitted:</span>
                  <p className="text-slate-900 dark:text-foreground">
                    {claim.createdAt
                      ? new Date(claim.createdAt).toLocaleDateString()
                      : "N/A"}
                  </p>
                </div>
                {(claim as any).aiAssessmentCompletedAt && (
                  <div>
                    <span className="font-medium text-slate-600 dark:text-muted-foreground">KINGA Assessed:</span>
                    <p className="text-slate-900 dark:text-foreground text-xs">
                      {new Date((claim as any).aiAssessmentCompletedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Action Buttons — context-dependent */}
            <div className="flex flex-col gap-2 min-w-[200px]">
              {/* PENDING CLAIMS: Trigger KINGA or Assign Assessor */}
              {section === "pending" && (
                <>
                  {/* Show Reset button if claim is stuck in assessment_in_progress */}
                  {claim.status === "assessment_in_progress" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResetStuckClaim(claim.id)}
                      disabled={resetStuckClaimMutation.isPending}
                      className="w-full justify-start border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:bg-orange-950/30 text-xs"
                      title="This claim appears stuck in KINGA processing. Click to reset it to Pending."
                    >
                      <RotateCcw className="h-3 w-3 mr-2" />
                      Reset Stuck Claim
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleTriggerAI(claim.id)}
                    disabled={isTriggering || isProcessing || triggeringClaimId !== null}
                    className="w-full justify-start"
                    style={{ background: KINGA_BLUE, color: '#fff' }}
                  >
                    {isTriggering ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Brain className="h-4 w-4 mr-2" />
                    )}
                    Run KINGA Analysis
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAssignAssessor(claim.id)}
                    className="w-full justify-start"
                    style={{ color: KINGA_BLUE, borderColor: '#BDD4EC', background: KINGA_BLUE_BG }}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assign Human Assessor
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUploadEvidence(claim.id)}
                    className="w-full justify-start"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Evidence
                  </Button>
                </>
              )}

              {/* IN REVIEW: Show processing status */}
              {section === "in_review" && (
                <>
                  {isProcessing ? (
                    <>
                      <div className="flex items-center gap-2 text-sm rounded-md p-3" style={{ color: KINGA_BLUE, background: KINGA_BLUE_BG }}>
                        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                        <span className="truncate">
                          {(claim as any).pipelineCurrentStage
                            ? (() => {
                                const raw: string = (claim as any).pipelineCurrentStage;
                                return raw.replace(/^Stage (\d+)/, 'Stage $1 of 10');
                              })()
                            : "KINGA is analyzing this claim..."}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResetStuckClaim(claim.id)}
                        disabled={resetStuckClaimMutation.isPending}
                        className="w-full justify-start text-xs"
                        style={{ color: KINGA_AMBER, borderColor: '#E8C97A', background: KINGA_AMBER_BG }}
                        title="Use this if the KINGA has been processing for more than 5 minutes without completing"
                      >
                        <RotateCcw className="h-3 w-3 mr-2" />
                        Reset if Stuck
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleViewDetails(claim.id)}
                      className="w-full justify-start"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUploadEvidence(claim.id)}
                    className="w-full justify-start"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Evidence
                  </Button>
                </>
              )}

              {/* KINGA FLAGGED: View Report, Download, Escalate */}
              {section === "ai_flagged" && (
                <>
                  {isProcessing ? (
                    <>
                      <div className="flex items-center gap-2 text-sm rounded-md p-3" style={{ color: KINGA_BLUE, background: KINGA_BLUE_BG }}>
                        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                        <span className="truncate">
                          {(claim as any).pipelineCurrentStage
                            ? (claim as any).pipelineCurrentStage.replace(/^Stage (\d+)/, 'Stage $1 of 10')
                            : "Re-running KINGA analysis..."}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResetStuckClaim(claim.id)}
                        disabled={resetStuckClaimMutation.isPending}
                        className="w-full justify-start border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:bg-orange-950/30 text-xs"
                      >
                        <RotateCcw className="h-3 w-3 mr-2" />
                        Reset if Stuck
                      </Button>
                    </>
                  ) : (
                    <>
                      {/* View Reports dropdown — vehicle reg + make/model as label */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="default"
                            className="w-full justify-start"
                            style={{ background: KINGA_TEAL, color: '#fff' }}
                          >
                            <Eye className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span className="truncate flex-1 text-left text-sm">
                              View Reports{(claim.vehicleRegistration || claim.vehicleMake) ? (
                                <span className="opacity-80"> — {[claim.vehicleRegistration, claim.vehicleMake ? `${claim.vehicleMake}${claim.vehicleModel ? ' ' + claim.vehicleModel : ''}`.trim() : null].filter(Boolean).join(' ')}</span>
                              ) : null}
                            </span>
                            <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-72">
                          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal pb-1">Select report to view</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => { window.location.href = `/insurer/claims/${claim.id}/comparison?report=standard`; }}
                            className="cursor-pointer py-2.5"
                          >
                            <div className="flex items-start gap-3 w-full">
                              <FileText className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: KINGA_TEAL }} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">KINGA Claims Report</span>
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: KINGA_TEAL_BG, color: KINGA_TEAL }}>PROCESS</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">Assessment summary, damage overview &amp; cost comparison</p>
                              </div>
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              if (TIER_GATE_ENABLED) return;
                              window.location.href = `/insurer/claims/${claim.id}/comparison?report=forensic`;
                            }}
                            className="cursor-pointer py-2.5"
                          >
                            <div className="flex items-start gap-3 w-full">
                              <FileSearch className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: KINGA_BLUE }} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">KINGA Forensic Audit</span>
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: KINGA_BLUE_BG, color: KINGA_BLUE }}>PROVE</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">Full forensic analysis, physics engine &amp; fraud indicators</p>
                              </div>
                            </div>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAssignAssessor(claim.id)}
                        className="w-full justify-start"
                        style={{ color: KINGA_BLUE, borderColor: '#BDD4EC', background: KINGA_BLUE_BG }}
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Assign Human Assessor
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTriggerAI(claim.id)}
                        disabled={triggerAiMutation.isPending}
                        className="w-full justify-start"
                        style={{ color: KINGA_BLUE, borderColor: '#BDD4EC', background: KINGA_BLUE_BG }}
                      >
                        <Brain className="h-4 w-4 mr-2" />
                        Re-run KINGA Assessment
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEscalate(claim.id)}
                        className="w-full justify-start border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:bg-orange-950/30"
                      >
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Escalate
                      </Button>
                    </>
                  )}
                </>
              )}

              {/* COMPLETED: Full report access (or re-run in progress) */}
              {section === "completed" && (
                <>
                  {/* Show live stage progress when re-run is in progress.
                       NOTE: isProcessing already guards against assessment_complete/closed claims,
                       so we do NOT re-check documentProcessingStatus directly here. */}
                  {isProcessing ? (
                    <>
                      <div className="flex items-center gap-2 text-sm rounded-md p-3" style={{ color: KINGA_BLUE, background: KINGA_BLUE_BG }}>
                        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                        <span className="truncate">
                          {(claim as any).pipelineCurrentStage
                            ? (() => {
                                const raw: string = (claim as any).pipelineCurrentStage;
                                return raw.replace(/^Stage (\d+)/, 'Stage $1 of 10');
                              })()
                            : "Re-running KINGA analysis..."}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResetStuckClaim(claim.id)}
                        disabled={resetStuckClaimMutation.isPending}
                        className="w-full justify-start text-xs"
                        style={{ color: KINGA_AMBER, borderColor: '#E8C97A', background: KINGA_AMBER_BG }}
                        title="Use this if the KINGA has been processing for more than 5 minutes without completing"
                      >
                        <RotateCcw className="h-3 w-3 mr-2" />
                        Reset if Stuck
                      </Button>
                    </>
                  ) : (
                    <>
                      {/* View Reports dropdown — vehicle reg + make/model as label */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="default"
                            className="w-full justify-start"
                            style={{ background: KINGA_TEAL, color: '#fff' }}
                          >
                            <Eye className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span className="truncate flex-1 text-left text-sm">
                              View Reports{(claim.vehicleRegistration || claim.vehicleMake) ? (
                                <span className="opacity-80"> — {[claim.vehicleRegistration, claim.vehicleMake ? `${claim.vehicleMake}${claim.vehicleModel ? ' ' + claim.vehicleModel : ''}`.trim() : null].filter(Boolean).join(' ')}</span>
                              ) : null}
                            </span>
                            <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-72">
                          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal pb-1">Select report to view</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => { window.location.href = `/insurer/claims/${claim.id}/comparison?report=standard`; }}
                            className="cursor-pointer py-2.5"
                          >
                            <div className="flex items-start gap-3 w-full">
                              <FileText className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: KINGA_TEAL }} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">KINGA Claims Report</span>
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: KINGA_TEAL_BG, color: KINGA_TEAL }}>PROCESS</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">Assessment summary, damage overview &amp; cost comparison</p>
                              </div>
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              if (TIER_GATE_ENABLED) return; // Future: show upgrade prompt
                              window.location.href = `/insurer/claims/${claim.id}/comparison?report=forensic`;
                            }}
                            className="cursor-pointer py-2.5"
                          >
                            <div className="flex items-start gap-3 w-full">
                              <FileSearch className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: KINGA_BLUE }} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">KINGA Forensic Audit</span>
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: KINGA_BLUE_BG, color: KINGA_BLUE }}>PROVE</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">Full forensic analysis, physics engine &amp; fraud indicators</p>
                              </div>
                            </div>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTriggerAI(claim.id)}
                        disabled={triggerAiMutation.isPending}
                        className="w-full justify-start"
                        style={{ color: KINGA_BLUE, borderColor: '#BDD4EC', background: KINGA_BLUE_BG }}
                      >
                        <Brain className="h-4 w-4 mr-2" />
                        Re-run KINGA Assessment
                      </Button>
                    </>
                  )}
                </>
              )}

              {/* COMPLETED section: show reports-ready pill above the dropdown */}
              {section === "completed" && !isProcessing && (
                <div className="flex items-center gap-1.5 px-1 -mt-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: KINGA_TEAL_BG, color: KINGA_TEAL, border: '1px solid #A8D4C4' }}>
                    <CheckCircle2 className="h-3 w-3" />
                    KINGA Reports Ready
                  </span>
                  <span className="text-[10px] text-muted-foreground">2 available</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderSection = (
    title: string,
    icon: any,
    claims: any[],
    section: "pending" | "in_review" | "ai_flagged" | "completed",
    emptyMessage: string,
    borderColor: string,
    headerBg: string
  ) => {
    const Icon = icon;
    const sectionId = section === "pending" ? "intake-queue" : section === "in_review" ? "in-progress" : section === "ai_flagged" ? "ai-flagged" : "completed";

    return (
      <Card id={sectionId} className="scroll-mt-20 shadow-none" style={{ border: '1px solid #E5E7EB', borderRadius: 10, background: '#FFFFFF' }}>
        <CardHeader className={`${headerBg} rounded-t-lg`}>
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {title}
            <span className="ml-auto text-sm font-normal text-slate-700 dark:text-slate-400 dark:text-muted-foreground bg-white/80 dark:bg-card/80 rounded-full px-3 py-1">
              {claims.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {allClaimsLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-slate-700 dark:text-slate-400 dark:text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading claims...</span>
            </div>
          ) : claims.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 dark:bg-muted/50 rounded-lg border-2 border-dashed border-slate-200 dark:border-border">
              <Icon className="h-12 w-12 text-slate-600 dark:text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 dark:text-muted-foreground font-medium">{emptyMessage}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => refetchAll()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {claims.map((claim: any) => (
                <ClaimCardInline key={claim.id} claim={claim} section={section} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Determine active section's claims
  const activeClaims =
    activeTab === "pending" ? pendingClaims :
    activeTab === "review" ? inReviewClaims :
    activeTab === "ai_complete" ? aiFlaggedClaims :
    activeTab === "completed" ? completedClaims : [];

  return (
    <div style={{ background: 'var(--body-bg)', fontFamily: 'Inter, sans-serif', minHeight: '100vh' }}>
         {/* ── IDENTITY STRIP ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', background:'#FFFFFF', borderBottom:'1px solid #E7E2D6', position:'sticky', top:0, zIndex:100, height:'52px', fontFamily:'Inter, sans-serif' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style={{ height:28, width:'auto', objectFit:'contain', flexShrink:0 }} />
          <div style={{ width:1, height:22, background:'#C8C4BA' }} />
          <span style={{ fontSize:13, fontWeight:600, color:'#15201A', letterSpacing:'-0.01em' }}>Claims Processor</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button title="Notifications" style={{ width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:6, cursor:'pointer', color:'#6B7568', background:'none', border:'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
        </div>
      </div>

      {/* ── HERO BAND ── */}
      <div className="p11-hero">
        <div className="p11-hero-top">
          <div>
            <div className="p11-breadcrumb">KINGA · Claims Processor</div>
            <div className="p11-hero-title">Claims Processing Queue</div>
            <div className="p11-hero-subtitle">
              {allClaimsLoading ? 'Loading...' : `${allClaims.length} total claims · Last refreshed just now`}
            </div>
          </div>
          <div className="p11-hero-actions">
            <button className="p11-btn-ghost" onClick={() => window.location.href = '/processor/upload-documents'}>
              <Upload style={{ width: 13, height: 13 }} />
              Upload Claim
            </button>
            <button className="p11-btn-gold" onClick={() => window.location.href = '/processor/upload-documents'}>
              <FileText style={{ width: 13, height: 13 }} />
              New Claim
            </button>
          </div>
        </div>
        {/* KPI Strip */}
        <div className="p11-kpi-grid">
          <div className="p11-kpi-tile headline">
            <div className="p11-kpi-label">Pending Review</div>
            <div className="p11-kpi-value num">{pendingClaims.length}</div>
            <div className="p11-kpi-delta">Awaiting action</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">In Review</div>
            <div className="p11-kpi-value num">{inReviewClaims.length}</div>
            <div className="p11-kpi-delta">Being processed</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">KINGA Complete</div>
            <div className="p11-kpi-value num">{aiFlaggedClaims.length}</div>
            <div className="p11-kpi-delta up">AI analysis done</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Completed</div>
            <div className="p11-kpi-value num">{completedClaims.length}</div>
            <div className="p11-kpi-delta up">Resolved</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">SLA Breached</div>
            <div className="p11-kpi-value num">{allClaims.filter((c: any) => (Date.now() - new Date(c.createdAt).getTime()) / 3600000 > 72).length}</div>
            <div className="p11-kpi-delta down">&gt;72h outstanding</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">SLA Critical</div>
            <div className="p11-kpi-value num">{allClaims.filter((c: any) => { const h = (Date.now() - new Date(c.createdAt).getTime()) / 3600000; return h > 48 && h <= 72; }).length}</div>
            <div className="p11-kpi-delta down">48–72h window</div>
          </div>
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <nav className="p11-tab-bar">
        {[
          { id: 'pending', label: 'Pending', count: pendingClaims.length, countClass: 'amber' },
          { id: 'review', label: 'In Review', count: inReviewClaims.length, countClass: '' },
          { id: 'ai_complete', label: 'KINGA Complete', count: aiFlaggedClaims.length, countClass: '' },
          { id: 'completed', label: 'Completed', count: completedClaims.length, countClass: '' },
          { id: 'notifications', label: 'Notifications', count: 0, countClass: '' },
        ].map(tab => (
          <div
            key={tab.id}
            className={`p11-tab-item${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`p11-tab-badge${tab.countClass === 'amber' ? ' alert' : ''}`}>{tab.count}</span>
            )}
          </div>
        ))}
      </nav>

      {/* ── ALERT BAR ── */}
      {(aiFlaggedClaims.length > 0 || pendingClaims.length > 0) && (
        <div className="p11-alert-bar">
          {aiFlaggedClaims.length > 0 && (
            <div className="p11-alert-item red">
              <span className="p11-alert-count">{aiFlaggedClaims.length}</span>
              <span>claim(s) completed KINGA analysis — awaiting processor action</span>
            </div>
          )}
          {pendingClaims.length > 0 && (
            <div className="p11-alert-item amber">
              <span className="p11-alert-count">{pendingClaims.length}</span>
              <span>claim(s) pending intake processing</span>
            </div>
          )}
          <div className="p11-alert-cta" onClick={() => setActiveTab('pending')}>
            View queue →
          </div>
        </div>
      )}

      {/* ── BODY ── */}
      <div className="p11-body">
        {activeTab === 'notifications' ? (
          <NotificationsInbox />
        ) : (
          <div className="p11-body-2col">
            {/* ── MAIN COLUMN ── */}
            <div className="p11-card">
              {/* Filter bar */}
              <div className="p11-filter-bar">
                <div className="p11-search-wrap">
                  <Search className="p11-search-icon" style={{ width: 14, height: 14 }} />
                  <input
                    className="p11-search-input"
                    placeholder="Search by claim number, policyholder, vehicle reg, or policy…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <select className="p11-select" value={activeTab} onChange={e => setActiveTab(e.target.value)}>
                  <option value="pending">Pending ({pendingClaims.length})</option>
                  <option value="review">In Review ({inReviewClaims.length})</option>
                  <option value="ai_complete">KINGA Complete ({aiFlaggedClaims.length})</option>
                  <option value="completed">Completed ({completedClaims.length})</option>
                </select>
                <button className="p11-btn-outline" onClick={() => refetchAll()}>
                  <RefreshCw style={{ width: 13, height: 13 }} />
                  Refresh
                </button>
              </div>

              {/* Claims table */}
              {allClaimsLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                  <Loader2 style={{ width: 24, height: 24, margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
                  Loading claims…
                </div>
              ) : activeClaims.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                  <FileText style={{ width: 32, height: 32, margin: '0 auto 8px', color: 'var(--muted-2)' }} />
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>No claims in this queue</div>
                  <div style={{ fontSize: 12 }}>
                    {activeTab === 'pending' ? 'Upload a new claim document to get started.' : 'Claims will appear here when they reach this stage.'}
                  </div>
                </div>
              ) : (
                <div className="p11-table-wrap">
                  <table className="p11-table">
                    <thead>
                      <tr>
                        <th>Claim ID</th>
                        <th>Policyholder</th>
                        <th>Vehicle</th>
                        <th>Status</th>
                        <th>SLA</th>
                        <th>Submitted</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeClaims.slice(0, 20).map((claim: any) => {
                        const isAlreadyComplete = claim.status === "assessment_complete" || claim.status === "closed";
                        const isProcessing = !isAlreadyComplete && (
                          aiProcessingClaimIds.has(claim.id) ||
                          claim.documentProcessingStatus === "parsing" ||
                          claim.documentProcessingStatus === "processing"
                        );
                        const hoursOld = (Date.now() - new Date(claim.createdAt).getTime()) / 3600000;
                        const slaClass = hoursOld > 72 ? 'red' : hoursOld > 48 ? 'amber' : 'green';
                        const statusMap: Record<string, { label: string; cls: string }> = {
                          intake_pending: { label: 'Pending', cls: 'amber' },
                          assessment_in_progress: { label: 'In Review', cls: 'blue' },
                          quotes_pending: { label: 'Quotes Pending', cls: 'blue' },
                          assessment_complete: { label: 'KINGA Complete', cls: 'green' },
                          closed: { label: 'Completed', cls: 'green' },
                        };
                        const st = statusMap[claim.status] || { label: claim.status, cls: 'muted' };
                        return (
                          <tr key={claim.id}>
                            <td>
                              <span className="p11-id-mono">{claim.claimNumber || `#${claim.id}`}</span>
                            </td>
                            <td style={{ fontWeight: 500 }}>{claim.claimantName || claim.policyholderName || '—'}</td>
                            <td style={{ color: 'var(--muted)' }}>{claim.vehicleRegistration || '—'}</td>
                            <td>
                              {isProcessing ? (
                                <span className="p11-badge blue">
                                  <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} />
                                  Processing…
                                </span>
                              ) : (
                                <span className={`p11-badge ${st.cls}`}>{st.label}</span>
                              )}
                            </td>
                            <td>
                              <span className={`p11-badge ${slaClass}`}>
                                {hoursOld > 72 ? 'Breached' : hoursOld > 48 ? 'Critical' : 'On Track'}
                              </span>
                            </td>
                            <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                              {new Date(claim.createdAt).toLocaleDateString()}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="p11-btn-outline" style={{ padding: '4px 8px', fontSize: 11 }}
                                  onClick={() => handleViewDetails(claim.id)}>
                                  <Eye style={{ width: 11, height: 11 }} /> View
                                </button>
                                {claim.status === 'intake_pending' && (
                                  <button className="p11-btn-outline" style={{ padding: '4px 8px', fontSize: 11 }}
                                    onClick={() => handleTriggerAI(claim.id)}
                                    disabled={triggeringClaimId === claim.id}>
                                    <Brain style={{ width: 11, height: 11 }} /> KINGA
                                  </button>
                                )}
                                {claim.status === 'assessment_complete' && (
                                  <button className="p11-btn-outline" style={{ padding: '4px 8px', fontSize: 11 }}
                                    onClick={() => handleDownloadReport(claim.id)}>
                                    <Download style={{ width: 11, height: 11 }} /> Report
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {activeClaims.length > 0 && (
                <div className="p11-pagination">
                  <span>Showing {Math.min(activeClaims.length, 20)} of {activeClaims.length} claims</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="p11-page-btn" disabled>← Prev</button>
                    <button className="p11-page-btn" disabled={activeClaims.length <= 20}>Next →</button>
                  </div>
                </div>
              )}
            </div>

            {/* ── SIDEBAR ── */}
            <div className="p11-sidebar">
              {/* Attention Required */}
              <div className="p11-card">
                <div className="p11-card-header">
                  <div>
                    <div className="p11-card-title">
                      <AlertCircle style={{ width: 14, height: 14, color: 'var(--red)' }} />
                      Attention Required
                    </div>
                    <div className="p11-card-subtitle">Claims needing immediate action</div>
                  </div>
                </div>
                <div className="p11-card-body">
                  {pendingClaims.length === 0 && aiFlaggedClaims.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)' }}>
                      <CheckCircle style={{ width: 24, height: 24, margin: '0 auto 6px', color: 'var(--g-500)' }} />
                      <div style={{ fontSize: 12 }}>All clear</div>
                    </div>
                  ) : (
                    <>
                      {aiFlaggedClaims.slice(0, 3).map((c: any) => (
                        <div key={c.id} className="p11-attention-item">
                          <div className="p11-attention-dot green" />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }} className="p11-id-mono">
                              {c.claimNumber || `#${c.id}`}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>KINGA complete — review ready</div>
                          </div>
                          <button className="p11-btn-outline" style={{ padding: '3px 7px', fontSize: 10 }}
                            onClick={() => handleViewDetails(c.id)}>View</button>
                        </div>
                      ))}
                      {pendingClaims.slice(0, 3).map((c: any) => (
                        <div key={c.id} className="p11-attention-item">
                          <div className="p11-attention-dot amber" />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }} className="p11-id-mono">
                              {c.claimNumber || `#${c.id}`}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Pending intake processing</div>
                          </div>
                          <button className="p11-btn-outline" style={{ padding: '3px 7px', fontSize: 10 }}
                            onClick={() => handleTriggerAI(c.id)}>KINGA</button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* Queue Summary */}
              <div className="p11-card">
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <TrendingUp style={{ width: 14, height: 14, color: 'var(--g-600)' }} />
                    Queue Summary
                  </div>
                </div>
                <div className="p11-card-body">
                  {[
                    { label: 'Pending', value: pendingClaims.length, cls: 'amber', pct: allClaims.length > 0 ? Math.round(pendingClaims.length / allClaims.length * 100) : 0 },
                    { label: 'In Review', value: inReviewClaims.length, cls: 'blue', pct: allClaims.length > 0 ? Math.round(inReviewClaims.length / allClaims.length * 100) : 0 },
                    { label: 'KINGA Complete', value: aiFlaggedClaims.length, cls: 'green', pct: allClaims.length > 0 ? Math.round(aiFlaggedClaims.length / allClaims.length * 100) : 0 },
                    { label: 'Completed', value: completedClaims.length, cls: 'muted', pct: allClaims.length > 0 ? Math.round(completedClaims.length / allClaims.length * 100) : 0 },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`p11-badge ${row.cls}`}>{row.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{row.pct}%</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SLA Status */}
              <div className="p11-card">
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <Clock style={{ width: 14, height: 14, color: 'var(--amber)' }} />
                    SLA Status
                  </div>
                </div>
                <div className="p11-card-body">
                  {[
                    { label: 'On Track (0–48h)', value: allClaims.filter((c: any) => (Date.now() - new Date(c.createdAt).getTime()) / 3600000 <= 48).length, cls: 'green' },
                    { label: 'Critical (48–72h)', value: allClaims.filter((c: any) => { const h = (Date.now() - new Date(c.createdAt).getTime()) / 3600000; return h > 48 && h <= 72; }).length, cls: 'amber' },
                    { label: 'Breached (>72h)', value: allClaims.filter((c: any) => (Date.now() - new Date(c.createdAt).getTime()) / 3600000 > 72).length, cls: 'red' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                      <span className={`p11-badge ${row.cls}`}>{row.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

            {/* Upload Evidence Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Additional Evidence</DialogTitle>
            <DialogDescription>
              Upload PDF documents or images as additional evidence for this claim
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="border-2 border-dashed border-slate-300 dark:border-border rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 text-slate-600 dark:text-slate-400 dark:text-muted-foreground/70 mx-auto mb-3" />
              <Label
                htmlFor="evidence-upload"
                className="cursor-pointer text-primary hover:text-primary/90 font-medium"
              >
                Click to select file
              </Label>
              <input
                id="evidence-upload"
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileUpload(file);
                  }
                }}
                disabled={uploadingFile}
              />
              <p className="text-xs text-slate-700 dark:text-slate-400 dark:text-muted-foreground mt-2">
                PDF or image files, max 16MB
              </p>
            </div>
            {uploadingFile && (
              <div className="flex items-center justify-center gap-2 text-sm text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading evidence...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Human Assessor Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={(open) => {
        setAssignDialogOpen(open);
        if (!open) {
          setSelectedAssessorId(null);
          setAssessorSearchQuery("");
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" style={{ color: KINGA_BLUE }} />
              Assign Human Assessor
            </DialogTitle>
            <DialogDescription>
              Search and select an assessor to assign this claim for manual inspection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Assessor Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600 dark:text-slate-400 dark:text-muted-foreground/70" />
              <Input
                placeholder="Search assessors by name or email..."
                value={assessorSearchQuery}
                onChange={(e) => setAssessorSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Assessor List */}
            <div className="max-h-[300px] overflow-y-auto border rounded-lg divide-y">
              {assessorsLoading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-slate-700 dark:text-slate-400 dark:text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading assessors...</span>
                </div>
              ) : filteredAssessors.length === 0 ? (
                <div className="text-center py-8 text-slate-700 dark:text-slate-400 dark:text-muted-foreground">
                  <UserPlus className="h-8 w-8 text-slate-600 dark:text-slate-300 mx-auto mb-2" />
                  <p className="text-sm">
                    {assessorSearchQuery ? "No assessors match your search" : "No assessors available"}
                  </p>
                </div>
              ) : (
                filteredAssessors.map((assessor: any) => {
                  const isSelected = selectedAssessorId === assessor.id;
                  return (
                    <button
                      key={assessor.id}
                      onClick={() => setSelectedAssessorId(isSelected ? null : assessor.id)}
                      className={`w-full text-left p-3 transition-colors flex items-center gap-3 ${isSelected ? 'border-l-4' : ''}`}
                      style={isSelected ? { background: KINGA_BLUE_BG, borderLeftColor: KINGA_BLUE } : {}}
                    >
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold ${
                        isSelected ? "text-white" : "bg-slate-200 text-slate-600 dark:text-muted-foreground"
                      }`}>
                        {(assessor.name || "A").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-900 dark:text-foreground truncate">
                          {assessor.userName || assessor.name || "Unnamed Assessor"}
                        </p>
                        <p className="text-xs text-slate-700 dark:text-slate-400 dark:text-muted-foreground truncate">
                          {assessor.userEmail || assessor.email || "No email"}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {assessor.specializations && assessor.specializations.length > 0 && (
                            assessor.specializations.slice(0, 2).map((spec: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs bg-slate-50 dark:bg-muted/50">
                                {spec}
                              </Badge>
                            ))
                          )}
                          {assessor.performanceRating && (
                            <Badge variant="outline" className="text-xs" style={{ background: KINGA_AMBER_BG, color: KINGA_AMBER, borderColor: '#E8C97A' }}>
                              ★ {Number(assessor.performanceRating).toFixed(1)}
                            </Badge>
                          )}
                          {assessor.totalAssignmentsCompleted > 0 && (
                            <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                              {assessor.totalAssignmentsCompleted} completed
                            </Badge>
                          )}
                          {assessor.insurerRole && !assessor.specializations && (
                            <Badge variant="outline" className="text-xs">
                              {assessor.insurerRole.replace(/_/g, " ")}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle className="h-5 w-5 flex-shrink-0" style={{ color: KINGA_BLUE }} />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Selected Assessor Confirmation */}
            {selectedAssessorId && (
              <div className="rounded-lg p-3 flex items-center gap-2" style={{ background: KINGA_BLUE_BG, border: '1px solid #BDD4EC' }}>
                <CheckCircle className="h-4 w-4 flex-shrink-0" style={{ color: KINGA_BLUE }} />
                <p className="text-sm" style={{ color: KINGA_BLUE }}>
                  <strong>Selected:</strong>{" "}
                  {(() => { const a: any = filteredAssessors.find((a: any) => a.id === selectedAssessorId); return a?.userName || a?.name || "Assessor"; })()}
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (assignClaimId) {
                  handleTriggerAI(assignClaimId);
                }
                setAssignDialogOpen(false);
              }}
              className=""
              style={{ color: KINGA_BLUE, borderColor: '#BDD4EC', background: KINGA_BLUE_BG }}
            >
              <Brain className="h-4 w-4 mr-2" />
              Run KINGA Instead
            </Button>
            <Button
              variant="default"
              onClick={handleConfirmAssignment}
              disabled={!selectedAssessorId || assignToAssessorMutation.isPending}
              className=""
              style={{ background: KINGA_BLUE, color: '#fff' }}
            >
              {assignToAssessorMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Assign Assessor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
