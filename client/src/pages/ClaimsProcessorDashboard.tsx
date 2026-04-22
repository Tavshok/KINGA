import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { parseUtcTimestamp } from "@/lib/parseUtcTimestamp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  FileText, 
  Clock, 
  AlertCircle, 
  Upload, 
  RefreshCw, 
  CheckCircle,
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
  RotateCcw
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * Claims Processor Dashboard
 * 
 * Organized into 4 sections:
 * 1. Pending Claims - Newly submitted, awaiting initial review
 * 2. In Review - Currently being processed / AI running
 * 3. AI Flagged - AI assessment complete, ready for review
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
  const [searchQuery, setSearchQuery] = useState("");

  // Role validation — allow admin users to bypass for testing
  if (user?.role !== "admin" && user?.insurerRole !== "claims_processor") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-muted/50">
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
        // Poll every 5s when AI is actively running (either in this session or detected from DB status)
        // This ensures the page auto-refreshes even after a browser refresh.
        refetchInterval: (data) => {
          const claims = (data as any)?.claims || (data as any)?.items || [];
          const hasInProgress = claims.some((c: any) => c.status === "assessment_in_progress");
          return (aiProcessingClaimIds.size > 0 || hasInProgress) ? 5_000 : 30_000;
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

  // Detect when AI processing completes (claim moves from in_review to ai_flagged)
  useEffect(() => { // eslint-disable-line react-hooks/rules-of-hooks
    if (aiProcessingClaimIds.size === 0) return;
    
    const completedIds = new Set<number>();
    const failedIds = new Set<number>();
    aiProcessingClaimIds.forEach(id => {
      const claim = allClaims.find((c: any) => c.id === id);
      if (!claim) return;
      // Claim finished successfully
      if (claim.status === "assessment_complete") {
        completedIds.add(id);
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
        toast.success("AI Assessment Complete", {
          description: `Assessment ready for ${claim?.claimNumber || `Claim #${id}`}`,
          action: {
            label: "View Report",
            onClick: () => window.location.href = `/insurer/claims/${id}/comparison`,
          },
          duration: 10000,
        });
      });

      failedIds.forEach(id => {
        const claim = allClaims.find((c: any) => c.id === id);
        toast.error("AI Assessment Failed", {
          description: `Processing failed for ${claim?.claimNumber || `Claim #${id}`}. Please check that documents are uploaded and try again.`,
          duration: 8000,
        });
      });
    }
  }, [allClaims, aiProcessingClaimIds]);

  // Trigger AI Assessment mutation
  const triggerAiMutation = trpc.claims.triggerAiAssessment.useMutation({ // eslint-disable-line react-hooks/rules-of-hooks
    onSuccess: (_data, variables) => {
      setAiProcessingClaimIds(prev => new Set(prev).add(variables.claimId));
      setTriggeringClaimId(null);
      toast.info("AI Assessment Started", {
        description: "The AI is analyzing this claim. You'll be notified when it's complete. The claim has moved to 'In Review'.",
        duration: 6000,
      });
      refetchAll();
    },
    onError: (error: any) => {
      setTriggeringClaimId(null);
      toast.error("AI Assessment Failed", {
        description: error.message || "Could not trigger AI assessment. Please try again.",
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
        description: "The claim has been reset to Pending. You can now re-run the AI assessment.",
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
    // Navigate to the comparison view which shows full AI assessment details
    window.location.href = `/insurer/claims/${claimId}/comparison`;
  };

  const handleDownloadReport = async (claimId: number) => {
    // Navigate to comparison view where the PDF download button exists
    window.location.href = `/insurer/claims/${claimId}/comparison`;
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
    const isProcessing = aiProcessingClaimIds.has(claim.id);
    const isTriggering = triggeringClaimId === claim.id;
    
    const getStatusBadge = () => {
      if (isProcessing) {
        return (
          <Badge className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-700 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            AI Processing...
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
          <Badge className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-700 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            AI Analyzing... {elapsedLabel}
          </Badge>
        );
      }

      const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
        intake_pending: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-800 dark:text-amber-200", label: "PENDING REVIEW" },
        quotes_pending: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-200", label: "QUOTES PENDING" },
        assessment_complete: { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-800 dark:text-teal-200", label: "ASSESSMENT COMPLETE" },
        closed: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-800 dark:text-green-200", label: "COMPLETED" },
      };
      
      const config = statusConfig[claim.status] || { bg: "bg-slate-100 dark:bg-muted", text: "text-slate-800 dark:text-foreground", label: claim.status?.replace(/_/g, " ").toUpperCase() };
      
      return (
        <Badge className={`${config.bg} ${config.text} border-0`}>
          {config.label}
        </Badge>
      );
    };

    return (
      <Card className={`hover:shadow-md transition-shadow ${
        isProcessing ? "border-l-4 border-l-purple-500 bg-purple-50/30 dark:bg-purple-950/30" :
        section === "pending" ? "border-l-4 border-l-amber-400" :
        section === "in_review" ? "border-l-4 border-l-blue-400" :
        section === "ai_flagged" ? "border-l-4 border-l-teal-500" :
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
                  <Badge variant="outline" className="text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    AI: {claim.aiConfidenceScore}%
                  </Badge>
                )}
                {claim.fraudRiskScore > 0 && (
                  <Badge variant={claim.fraudRiskScore >= 70 ? "destructive" : "outline"} className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {claim.fraudRiskScore >= 70 ? "High Risk" : claim.fraudRiskScore >= 40 ? "Medium Risk" : "Low Risk"} ({claim.fraudRiskScore}%)
                  </Badge>
                )}
              </div>

              {/* Data Source Badge */}
              {claim.sourceDocumentId && (
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-xs text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    PDF Document Ingestion
                  </Badge>
                  {claim.documentProcessingStatus === "parsing" && (
                    <Badge variant="outline" className="text-xs text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/30 flex items-center gap-1">
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
                    <span className="font-medium text-slate-600 dark:text-muted-foreground">AI Assessed:</span>
                    <p className="text-slate-900 dark:text-foreground text-xs">
                      {new Date((claim as any).aiAssessmentCompletedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Action Buttons — context-dependent */}
            <div className="flex flex-col gap-2 min-w-[200px]">
              {/* PENDING CLAIMS: Trigger AI or Assign Assessor */}
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
                      title="This claim appears stuck in AI processing. Click to reset it to Pending."
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
                    className="w-full justify-start bg-purple-600 hover:bg-purple-700"
                  >
                    {isTriggering ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Brain className="h-4 w-4 mr-2" />
                    )}
                    Run AI Assessment
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleAssignAssessor(claim.id)}
                    className="w-full justify-start border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:bg-blue-950/30"
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
                      <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/30 rounded-md p-3">
                        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                        <span className="truncate">
                          {(claim as any).pipelineCurrentStage
                            ? (claim as any).pipelineCurrentStage
                            : "AI is analyzing this claim..."}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResetStuckClaim(claim.id)}
                        disabled={resetStuckClaimMutation.isPending}
                        className="w-full justify-start border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:bg-orange-950/30 text-xs"
                        title="Use this if the AI has been processing for more than 5 minutes without completing"
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

              {/* AI FLAGGED: View Report, Download, Escalate */}
              {section === "ai_flagged" && (
                <>
                  <Button 
                    size="sm" 
                    variant="default"
                    onClick={() => handleViewDetails(claim.id)}
                    className="w-full justify-start bg-teal-600 hover:bg-teal-700"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View AI Report
                    <ArrowRight className="h-3 w-3 ml-auto" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleAssignAssessor(claim.id)}
                    className="w-full justify-start border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:bg-blue-950/30"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assign Human Assessor
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleTriggerAI(claim.id)}
                    disabled={triggerAiMutation.isPending}
                    className="w-full justify-start border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:bg-purple-950/30"
                  >
                    <Brain className="h-4 w-4 mr-2" />
                    Re-run AI Assessment
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

              {/* COMPLETED: View only */}
              {section === "completed" && (
                <>
                  <Button 
                    size="sm" 
                    variant="default"
                    onClick={() => handleViewDetails(claim.id)}
                    className="w-full justify-start"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleDownloadReport(claim.id)}
                    className="w-full justify-start"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Report
                  </Button>
                </>
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

    return (
      <Card className={`shadow-lg border-t-4 ${borderColor}`}>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-secondary/5">
      {/* Header */}
      <header className="bg-gradient-to-r from-teal-600 via-teal-700 to-teal-800 text-white py-6 px-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Claims Processor Dashboard</h1>
            <p className="text-teal-100 text-sm">Process and manage insurance claims</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="default" 
              className="bg-white dark:bg-card text-teal-700 dark:text-teal-300 hover:bg-white/90 dark:bg-card/90 font-medium"
              onClick={() => window.location.href = "/processor/upload-documents"}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload New Claim
            </Button>
            <Button 
              variant="outline" 
              className="border-white/30 text-white hover:bg-white/10 dark:bg-card/10"
              onClick={() => refetchAll()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh All
            </Button>
            <Button 
              variant="outline" 
              className="border-white/30 text-white hover:bg-white/10 dark:bg-card/10"
              onClick={() => window.location.href = "/portal-hub"}
            >
              Portal Hub
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto space-y-6 p-6">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600 dark:text-slate-400 dark:text-muted-foreground/70" />
          <Input
            placeholder="Search by claim number, policyholder, vehicle registration, or policy number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white dark:bg-card"
          />
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{pendingClaims.length}</p>
              <p className="text-xs text-amber-600 font-medium">Pending Review</p>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{inReviewClaims.length}</p>
              <p className="text-xs text-blue-600 font-medium">In Review</p>
            </CardContent>
          </Card>
          <Card className="bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">{aiFlaggedClaims.length}</p>
              <p className="text-xs text-teal-600 font-medium">AI Complete</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{completedClaims.length}</p>
              <p className="text-xs text-green-600 font-medium">Completed</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Claims */}
        {renderSection(
          "Pending Claims",
          Clock,
          pendingClaims,
          "pending",
          "No pending claims. Upload a new claim document to get started.",
          "border-t-amber-400",
          "bg-amber-50/50 dark:bg-amber-950/50"
        )}

        {/* In Review */}
        {renderSection(
          "In Review",
          Brain,
          inReviewClaims,
          "in_review",
          "No claims currently in review",
          "border-t-blue-400",
          "bg-blue-50/50 dark:bg-blue-950/50"
        )}

        {/* AI Flagged / Assessment Complete */}
        {renderSection(
          "AI Assessment Complete",
          CheckCircle,
          aiFlaggedClaims,
          "ai_flagged",
          "No claims with completed AI assessment",
          "border-t-teal-500",
          "bg-teal-50/50 dark:bg-teal-950/50"
        )}

        {/* Completed */}
        {renderSection(
          "Completed",
          FileText,
          completedClaims,
          "completed",
          "No completed claims",
          "border-t-green-500",
          "bg-green-50/50 dark:bg-green-950/50"
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
              <UserPlus className="h-5 w-5 text-blue-600" />
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
                      className={`w-full text-left p-3 hover:bg-blue-50 dark:bg-blue-950/30 transition-colors flex items-center gap-3 ${
                        isSelected ? "bg-blue-100 dark:bg-blue-900/30 border-l-4 border-l-blue-600" : ""
                      }`}
                    >
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold ${
                        isSelected ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600 dark:text-muted-foreground"
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
                            <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
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
                        <CheckCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Selected Assessor Confirmation */}
            {selectedAssessorId && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <p className="text-sm text-blue-800 dark:text-blue-200">
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
              className="border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:bg-purple-950/30"
            >
              <Brain className="h-4 w-4 mr-2" />
              Run AI Instead
            </Button>
            <Button
              variant="default"
              onClick={handleConfirmAssignment}
              disabled={!selectedAssessorId || assignToAssessorMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
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
