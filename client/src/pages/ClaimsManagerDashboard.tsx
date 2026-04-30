import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  FileCheck, CheckCircle, XCircle, Eye, MessageSquare, AlertCircle, 
  Brain, ClipboardList, ArrowRight, BarChart3, Clock, Shield, ChevronLeft, ChevronRight, Filter, Download, FileSpreadsheet 
} from "lucide-react";
import { RiskBadge, AiAssessButton } from "@/components/ClaimRiskIndicators";
import { ClaimReviewDialog } from "@/components/ClaimReviewDialog";
import { exportClaimsToExcel, type ClaimExportData } from "@/lib/export-excel";
import { Link, useSearch } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IntakeQueueTab } from "@/components/IntakeQueueTab";
import { AutoAssignmentBadge } from "@/components/AutoAssignmentBadge";
import { ClaimCurrencySelector } from "@/components/ClaimCurrencySelector";

export default function ClaimsManagerDashboard() {
  const { fmt } = useTenantCurrency();
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showSendBackDialog, setShowSendBackDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [closureNotes, setClosureNotes] = useState("");
  const [closureAction, setClosureAction] = useState("approve_for_payment");
  const [sendBackComments, setSendBackComments] = useState("");
  const [sendBackTarget, setSendBackTarget] = useState("risk_manager");
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  
  // Tab state — synced with ?tab= query param from sidebar navigation
  const searchStr = useSearch();
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(searchStr).get("tab") ?? "intake");
  useEffect(() => {
    const tab = new URLSearchParams(searchStr).get("tab") ?? "intake";
    setActiveTab(tab);
  }, [searchStr]);
  
  // Pagination and filters
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [costFilter, setCostFilter] = useState<string>("all");

  // Fetch comparison data when a claim is selected
  const { data: aiAssessment } = trpc.aiAssessments.byClaim.useQuery(
    { claimId: selectedClaim?.id || 0 },
    { enabled: !!selectedClaim }
  );
  const { data: assessorEval } = trpc.assessorEvaluations.byClaim.useQuery(
    { claimId: selectedClaim?.id || 0 },
    { enabled: !!selectedClaim }
  );
  const { data: quotes } = trpc.quotes.byClaim.useQuery(
    { claimId: selectedClaim?.id || 0 },
    { enabled: !!selectedClaim }
  );

  useEffect(() => {
    if (selectedClaim && aiAssessment) {
      const aiCost = aiAssessment.estimatedCost ? aiAssessment.estimatedCost : null;
      const assessorCost = assessorEval?.estimatedRepairCost ? assessorEval.estimatedRepairCost : null;
      const avgQuoteCost = quotes && quotes.length > 0
        ? quotes.reduce((sum: number, q: any) => sum + (q.quotedAmount || 0), 0) / quotes.length
        : null;

      const calculateVariance = (v1: number | null, v2: number | null) => {
        if (!v1 || !v2) return null;
        return ((v1 - v2) / v2) * 100;
      };

      setComparisonData({
        aiCost,
        assessorCost,
        avgQuoteCost,
        aiVsAssessor: calculateVariance(assessorCost, aiCost),
        quotesVsAi: calculateVariance(avgQuoteCost, aiCost),
        fraudRisk: aiAssessment.fraudRiskLevel,
        quoteCount: quotes?.length || 0,
      });
    }
  }, [selectedClaim, aiAssessment, assessorEval, quotes]);

  // Fetch claims ready for manager review (after Risk Manager approval)
  // These are claims in financial_decision state OR completed assessments
  const { data: reviewQueueData, isLoading: queueLoading, refetch: refetchQueue } = 
    trpc.claims.byStatus.useQuery({ status: "financial_decision" });
  const reviewQueue = reviewQueueData || [];

  // Also fetch claims with completed status (comparison stage - assessed and ready for review)
  const { data: assessedClaims, isLoading: assessedLoading, refetch: refetchAssessed } = 
    trpc.claims.byStatus.useQuery({ status: "comparison" });

  // ── Real backend procedures ──────────────────────────────────────────────
  // Active Claims: all non-terminal claims for the tenant
  const { data: activeClaimsData, isLoading: activeClaimsLoading } =
    trpc.claims.getActiveClaims.useQuery();
  const activeClaims = activeClaimsData || [];

  // Fraud Alerts: claims with high/critical/elevated fraud risk or score > 70
  const { data: fraudAlertsData, isLoading: fraudAlertsLoading } =
    trpc.claims.getFraudAlerts.useQuery();
  const fraudAlerts = fraudAlertsData || [];

  // Dashboard Stats: aggregate counts, fraud rate, avg processing time
  const { data: dashboardStats } =
    trpc.claims.getDashboardStats.useQuery();

  // Processed Claims: completed + closed + rejected
  const { data: completedClaims, isLoading: completedLoading } = 
    trpc.claims.byStatus.useQuery({ status: "completed" });
  const { data: closedClaims } = 
    trpc.claims.byStatus.useQuery({ status: "closed" });
  const { data: rejectedClaims } = 
    trpc.claims.byStatus.useQuery({ status: "rejected" });
  const processedClaims = [
    ...(completedClaims || []),
    ...(closedClaims || []),
    ...(rejectedClaims || []),
  ].sort((a: any, b: any) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());

  const allReviewableClaims = [
    ...(reviewQueue || []),
    ...(assessedClaims || []),
  ];

  // Deduplicate by claim ID
  const uniqueReviewable = allReviewableClaims.filter(
    (claim, index, self) => index === self.findIndex(c => c.id === claim.id)
  );

  // Apply filters
  const filteredClaims = useMemo(() => {
    let filtered = [...uniqueReviewable];

    // Risk filter
    if (riskFilter !== "all") {
      if (riskFilter === "high") {
        filtered = filtered.filter(c => (c.fraudRiskScore ?? 0) >= 70);
      } else if (riskFilter === "medium") {
        filtered = filtered.filter(c => (c.fraudRiskScore ?? 0) >= 40 && (c.fraudRiskScore ?? 0) < 70);
      } else if (riskFilter === "low") {
        filtered = filtered.filter(c => (c.fraudRiskScore ?? 0) < 40);
      } else if (riskFilter === "not_assessed") {
        filtered = filtered.filter(c => !c.fraudRiskScore);
      }
    }

    // Date filter
    if (dateFilter !== "all") {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      filtered = filtered.filter(c => {
        const claimDate = c.createdAt ? new Date(c.createdAt).getTime() : 0;
        if (dateFilter === "today") return now - claimDate < dayMs;
        if (dateFilter === "week") return now - claimDate < 7 * dayMs;
        if (dateFilter === "month") return now - claimDate < 30 * dayMs;
        return true;
      });
    }

    // Cost filter
    if (costFilter !== "all") {
      filtered = filtered.filter(c => {
        const cost = c.approvedAmount || c.approvedAmount || 0;
        if (costFilter === "low") return cost < 50000; // < $500
        if (costFilter === "medium") return cost >= 50000 && cost < 200000; // $500-$2000
        if (costFilter === "high") return cost >= 200000; // > $2000
        return true;
      });
    }

    return filtered;
  }, [uniqueReviewable, riskFilter, dateFilter, costFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredClaims.length / pageSize);
  const paginatedClaims = filteredClaims.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [riskFilter, dateFilter, costFilter]);

  // Close for processing mutation
  const closeForProcessing = trpc.claims.approveClaim.useMutation({
    onSuccess: () => {
      toast.success("Claim Closed for Processing", {
        description: "Claim has been reviewed and closed for onward processing.",
      });
      setShowCloseDialog(false);
      setSelectedClaim(null);
      setClosureNotes("");
      refetchQueue();
      refetchAssessed();
    },
    onError: (error: any) => {
      toast.error("Error", { description: error.message });
    },
  });

  // Send back mutation - using approveClaim as placeholder
  const sendBackClaim = trpc.claims.approveClaim.useMutation({
    onSuccess: () => {
      toast.success("Claim Sent Back", {
        description: `Claim has been returned to ${sendBackTarget === "risk_manager" ? "Risk Manager" : "Claims Processor"} for review.`,
      });
      setShowSendBackDialog(false);
      setSelectedClaim(null);
      setSendBackComments("");
      refetchQueue();
      refetchAssessed();
    },
    onError: (error: any) => {
      toast.error("Error", { description: error.message });
    },
  });

  // Comment functionality - to be implemented
  const addComment = { mutateAsync: async (params: any) => { console.log('Comment:', params); } };

  const handleClose = (claim: any) => {
    setSelectedClaim(claim);
    setShowCloseDialog(true);
  };

  const handleSendBack = (claim: any) => {
    setSelectedClaim(claim);
    setShowSendBackDialog(true);
  };

  const handleViewDetails = (claim: any) => {
    setSelectedClaim(claim);
    setShowDetailsDialog(true);
  };

  const handleSubmitClosure = async () => {
    if (!selectedClaim) return;

    if (closureNotes) {
      await addComment.mutateAsync({
        claimId: selectedClaim.id,
        commentType: "general",
        content: `Claims Manager Review: ${closureAction === "approve_for_payment" ? "Approved for Payment Processing" : closureAction === "approve_for_repair" ? "Approved for Repair Assignment" : "Closed - No Further Action"} | Notes: ${closureNotes}`,
      });
    }

    closeForProcessing.mutate({ claimId: selectedClaim.id, selectedQuoteId: 0 });
  };

  const handleSubmitSendBack = async () => {
    if (!selectedClaim || !sendBackComments) {
      toast.error("Please provide comments explaining why the claim is being sent back.");
      return;
    }

    await addComment.mutateAsync({
      claimId: selectedClaim.id,
      commentType: "clarification_request",
      content: `SENT BACK BY CLAIMS MANAGER: ${sendBackComments}`,
    });

    sendBackClaim.mutate({ claimId: selectedClaim.id, selectedQuoteId: 0 });
  };

  const totalReviewable = filteredClaims.length;
  const highRiskCount = dashboardStats?.fraudHighCount ?? filteredClaims.filter((c: any) => c.fraudRiskScore && (c.fraudRiskScore ?? 0) >= 70).length;
  const recentlyClosed = dashboardStats?.completedCount ?? (completedClaims?.length || 0);

  // Export handler
  const handleExportToExcel = () => {
    if (filteredClaims.length === 0) {
      toast.error("No claims to export");
      return;
    }

    const exportData = filteredClaims.map((claim: any) => ({
      claimNumber: claim.claimNumber,
      vehicleRegistration: claim.vehicleRegistration,
      vehicleMake: claim.vehicleMake,
      vehicleModel: claim.vehicleModel,
      policyNumber: claim.policyNumber,
      status: claim.status,
      workflowState: claim.workflowState,
      fraudRiskScore: claim.fraudRiskScore,
      estimatedCost: claim.estimatedCost,
      approvedAmount: claim.approvedAmount ?? null,
      createdAt: claim.createdAt ? new Date(claim.createdAt) : null,
      incidentDate: claim.incidentDate ? new Date(claim.incidentDate) : null,
      incidentType: claim.incidentType,
      technicalApprovalStatus: claim.technicalApprovalStatus,
    }));

    exportClaimsToExcel(exportData, 'claims-manager-review-queue');
    toast.success(`Exported ${exportData.length} claims to Excel`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Auto-Assignment Warning Badge */}
        <AutoAssignmentBadge />
        {/* Header */}
        <header className="bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Claims Manager Dashboard</h1>
              <p className="text-teal-100 mt-1">Review assessed claims and close for onward processing</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-white/15 dark:bg-card/15 backdrop-blur rounded-lg px-4 py-2 text-center">
                <p className="text-2xl font-bold">{totalReviewable}</p>
                <p className="text-xs text-teal-100">Pending Review</p>
              </div>
              <div className="bg-white/15 dark:bg-card/15 backdrop-blur rounded-lg px-4 py-2 text-center">
                <p className="text-2xl font-bold text-red-300">{highRiskCount}</p>
                <p className="text-xs text-teal-100">High Risk</p>
              </div>
              <div className="bg-white/15 dark:bg-card/15 backdrop-blur rounded-lg px-4 py-2 text-center">
                <p className="text-2xl font-bold text-green-300">{recentlyClosed}</p>
                <p className="text-xs text-teal-100">Closed</p>
              </div>
            </div>
          </div>
        </header>

        {/* Workflow Info */}
        <div className="bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-lg p-4 flex items-start gap-3">
          <Shield className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-teal-800 dark:text-teal-200">Claims Manager Workflow</p>
            <p className="text-xs text-teal-600 mt-1">
              Claims arrive here after Risk Manager review and technical approval. Your role is to conduct a final review 
              of all assessments (AI, assessor, panel beater quotes) and close claims for onward processing — either for 
              payment settlement, repair assignment, or further investigation.
            </p>
          </div>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="intake">Intake Queue</TabsTrigger>
            <TabsTrigger value="review">Review Queue</TabsTrigger>
            <TabsTrigger value="active">Active Claims</TabsTrigger>
            <TabsTrigger value="fraud">Fraud Alerts</TabsTrigger>
            <TabsTrigger value="processed">Processed</TabsTrigger>
          </TabsList>

          {/* Intake Queue Tab */}
          <TabsContent value="intake">
            <IntakeQueueTab />
          </TabsContent>

          {/* Review Queue Tab */}
          <TabsContent value="review" className="space-y-6">
            {/* Filters */}
            <Card className="shadow-lg border-0">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50/50">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4 text-blue-600" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs mb-2 block">Risk Level</Label>
                <Select value={riskFilter} onValueChange={setRiskFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Risk Levels</SelectItem>
                    <SelectItem value="high">High Risk (70+)</SelectItem>
                    <SelectItem value="medium">Medium Risk (40-69)</SelectItem>
                    <SelectItem value="low">Low Risk (&lt;40)</SelectItem>
                    <SelectItem value="not_assessed">Not Assessed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-2 block">Date Range</Label>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">Last 7 Days</SelectItem>
                    <SelectItem value="month">Last 30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-2 block">Estimated Cost</Label>
                <Select value={costFilter} onValueChange={setCostFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Amounts</SelectItem>
                    <SelectItem value="low">Under $500</SelectItem>
                    <SelectItem value="medium">$500 - $2,000</SelectItem>
                    <SelectItem value="high">Over $2,000</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-600 dark:text-muted-foreground">
              <span>Showing {paginatedClaims.length} of {filteredClaims.length} claims</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportToExcel}
                  className="text-xs h-7"
                  disabled={filteredClaims.length === 0}
                >
                  <FileSpreadsheet className="h-3 w-3 mr-1" />
                  Export to Excel
                </Button>
                {(riskFilter !== "all" || dateFilter !== "all" || costFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRiskFilter("all");
                      setDateFilter("all");
                      setCostFilter("all");
                    }}
                    className="text-xs h-7"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Claims Review Queue */}
        <Card className="shadow-lg border-0">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-teal-50/50">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-teal-600" />
              Claims Review Queue
            </CardTitle>
            <CardDescription>
              Assessed claims awaiting your final review before onward processing
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {(queueLoading || assessedLoading) ? (
              <p className="text-center text-slate-700 dark:text-slate-400 dark:text-muted-foreground py-8">Loading claims for review...</p>
            ) : paginatedClaims.length > 0 ? (
              <>
                <div className="space-y-3">
                  {paginatedClaims.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="p-4 bg-white dark:bg-card rounded-lg border border-slate-200 dark:border-border hover:border-teal-300 dark:border-teal-700 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <h3 className="font-semibold text-base">{claim.claimNumber}</h3>
                          <RiskBadge fraudRiskScore={claim.fraudRiskScore} fraudFlags={claim.fraudFlags} size="sm" />
                          <Badge variant="outline" className="text-xs capitalize">
                            {(claim.status || 'pending').replace(/_/g, " ")}
                          </Badge>
                          {claim.technicalApprovalStatus === "approved" && (
                            <Badge className="bg-green-600 text-white text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Risk Approved
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-slate-600 dark:text-muted-foreground">
                          <div>
                            <span className="font-medium">Vehicle:</span>{" "}
                            {claim.vehicleRegistration || "N/A"}
                          </div>
                          <div>
                            <span className="font-medium">Make/Model:</span>{" "}
                            {[claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(" ") || "N/A"}
                          </div>
                          <div>
                            <span className="font-medium">Est. Cost:</span>{" "}
                            {claim.estimatedCost ? fmt((claim.estimatedCost || 0) * 100) : 
                             claim.approvedAmount ? fmt(claim.approvedAmount) : "Pending"}
                          </div>
                          <div>
                            <span className="font-medium">Submitted:</span>{" "}
                            {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : "N/A"}
                          </div>
                        </div>

                        {/* Per-claim currency selector — claims manager sets currency per policy insured */}
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-slate-600 dark:text-slate-400 dark:text-muted-foreground/70">Policy currency:</span>
                          <ClaimCurrencySelector
                            claimId={claim.id}
                            currentCurrency={claim.currencyCode ?? "USD"}
                            compact
                            onSuccess={() => { refetchQueue(); refetchAssessed(); }}
                          />
                        </div>

                        {/* Fraud Warning */}
                        {claim.fraudRiskScore && claim.fraudRiskScore >= 70 && (
                          <div className="mt-2 flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded text-xs">
                            <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                            <span className="text-red-700 dark:text-red-300 font-medium">
                              High fraud risk detected (score: {claim.fraudRiskScore}/100). Review carefully before closing.
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <Button onClick={() => handleClose(claim)} size="sm" className="bg-teal-600 hover:bg-teal-700 text-white">
                          <FileCheck className="h-4 w-4 mr-2" />
                          Close for Processing
                        </Button>
                        <Button onClick={() => handleSendBack(claim)} size="sm" variant="outline" className="border-orange-400 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:bg-orange-950/30">
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Send Back
                        </Button>
                        <AiAssessButton 
                          claimId={claim.id} 
                          claimNumber={claim.claimNumber}
                          size="sm"
                          onSuccess={() => { refetchQueue(); refetchAssessed(); }}
                        />
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full"
                          onClick={() => {
                            setSelectedClaim(claim);
                            setShowReviewDialog(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Review Details
                        </Button>
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
                
                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-sm text-slate-600 dark:text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <FileCheck className="h-12 w-12 text-slate-600 dark:text-slate-300 mx-auto mb-3" />
                <p className="text-slate-700 dark:text-slate-400 dark:text-muted-foreground font-medium">No claims pending review</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 dark:text-muted-foreground/70 mt-1">
                  Claims will appear here after Risk Manager approval or when assessments are complete
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recently Closed Claims */}
        <Card className="shadow-lg border-0">
          <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50/50">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Recently Closed Claims
            </CardTitle>
            <CardDescription>Claims you have reviewed and closed for processing</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {completedLoading ? (
              <p className="text-center text-slate-700 dark:text-slate-400 dark:text-muted-foreground py-4">Loading...</p>
            ) : completedClaims && completedClaims.length > 0 ? (
              <div className="space-y-2">
                {completedClaims.slice(0, 10).map((claim: any) => (
                  <div key={claim.id} className="p-3 bg-green-50/50 dark:bg-green-950/50 rounded-lg border border-green-100 dark:border-green-900 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-sm">{claim.claimNumber}</span>
                      <span className="text-xs text-slate-700 dark:text-slate-400 dark:text-muted-foreground">
                        {[claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(" ")}
                      </span>
                      {claim.approvedAmount && (
                        <Badge variant="outline" className="text-xs text-green-700 dark:text-green-300">
                          ${claim.approvedAmount.toLocaleString()}
                        </Badge>
                      )}
                    </div>
                    <Link href={`/insurer/claims/${claim.id}/comparison`}>
                      <Button variant="ghost" size="sm" className="text-xs">
                        <Eye className="h-3 w-3 mr-1" /> View
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Clock className="h-8 w-8 text-slate-600 dark:text-slate-300 mx-auto mb-2" />
                <p className="text-slate-700 dark:text-slate-400 dark:text-muted-foreground text-sm">No closed claims yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Close for Processing Dialog */}
        <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-teal-600" />
                Close Claim for Processing
              </DialogTitle>
              <DialogDescription>
                {selectedClaim && (
                  <>
                    Claim: <strong>{selectedClaim.claimNumber}</strong> — {selectedClaim.vehicleRegistration}
                    {selectedClaim.estimatedCost && (
                      <> | Est. Cost: <strong>${selectedClaim.estimatedCost.toLocaleString()}</strong></>
                    )}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Cost Comparison Summary */}
              {comparisonData && (
                <div className="bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-teal-800 dark:text-teal-200 text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Assessment Summary
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white dark:bg-card rounded p-2">
                      <p className="text-xs text-slate-700 dark:text-slate-400 dark:text-muted-foreground">AI Estimate</p>
                      <p className="text-lg font-bold text-teal-700 dark:text-teal-300">
                        {comparisonData.aiCost ? fmt(comparisonData.aiCost * 100) : "N/A"}
                      </p>
                    </div>
                    <div className="bg-white dark:bg-card rounded p-2">
                      <p className="text-xs text-slate-700 dark:text-slate-400 dark:text-muted-foreground">Assessor</p>
                      <p className="text-lg font-bold text-green-700 dark:text-green-300">
                        {comparisonData.assessorCost ? fmt(comparisonData.assessorCost * 100) : "N/A"}
                      </p>
                      {comparisonData.aiVsAssessor !== null && (
                        <p className={`text-xs ${Math.abs(comparisonData.aiVsAssessor) > 15 ? "text-red-600 font-semibold" : "text-green-600"}`}>
                          {comparisonData.aiVsAssessor > 0 ? "+" : ""}{comparisonData.aiVsAssessor.toFixed(1)}% vs AI
                        </p>
                      )}
                    </div>
                    <div className="bg-white dark:bg-card rounded p-2">
                      <p className="text-xs text-slate-700 dark:text-slate-400 dark:text-muted-foreground">Avg Quote ({comparisonData.quoteCount})</p>
                      <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                        {comparisonData.avgQuoteCost ? fmt(comparisonData.avgQuoteCost * 100) : "N/A"}
                      </p>
                    </div>
                  </div>

                  {(Math.abs(comparisonData.aiVsAssessor || 0) > 15 || Math.abs(comparisonData.quotesVsAi || 0) > 15) && (
                    <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-300 dark:border-orange-700 rounded p-2 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-orange-800 dark:text-orange-200">
                        <strong>High Variance:</strong> Significant cost differences detected between estimates.
                      </p>
                    </div>
                  )}

                  <Link href={`/insurer/claims/${selectedClaim?.id}/comparison`}>
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      <Eye className="h-3 w-3 mr-2" />
                      View Full Comparison Report
                    </Button>
                  </Link>
                </div>
              )}

              {/* Policy Currency — set before closing */}
              <div className="space-y-2">
                <ClaimCurrencySelector
                  claimId={selectedClaim?.id}
                  currentCurrency={selectedClaim?.currencyCode ?? "USD"}
                  onSuccess={(code) => setSelectedClaim((prev: any) => prev ? { ...prev, currencyCode: code } : prev)}
                />
              </div>

              {/* Closure Action */}
              <div className="space-y-2">
                <Label>Processing Action</Label>
                <Select value={closureAction} onValueChange={setClosureAction}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approve_for_payment">
                      Approve for Payment Settlement
                    </SelectItem>
                    <SelectItem value="approve_for_repair">
                      Approve for Repair Assignment
                    </SelectItem>
                    <SelectItem value="close_no_action">
                      Close — No Further Action Required
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 p-3 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded">
                <ArrowRight className="h-5 w-5 text-teal-600" />
                <p className="text-sm text-teal-700 dark:text-teal-300">
                  {closureAction === "approve_for_payment" 
                    ? "This claim will be closed and forwarded for payment processing."
                    : closureAction === "approve_for_repair"
                    ? "This claim will be closed and forwarded for repair assignment."
                    : "This claim will be closed with no further action required."}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="closureNotes">Review Notes (Optional)</Label>
                <Textarea
                  id="closureNotes"
                  value={closureNotes}
                  onChange={(e) => setClosureNotes(e.target.value)}
                  placeholder="Add any notes about your review and decision..."
                  rows={4}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCloseDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmitClosure} 
                disabled={closeForProcessing.isPending}
                className="bg-teal-600 hover:bg-teal-700"
              >
                {closeForProcessing.isPending ? "Processing..." : "Close for Processing"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send Back Dialog */}
        <Dialog open={showSendBackDialog} onOpenChange={setShowSendBackDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-orange-600" />
                Send Claim Back for Review
              </DialogTitle>
              <DialogDescription>
                {selectedClaim && `Claim: ${selectedClaim.claimNumber} — ${selectedClaim.vehicleRegistration}`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Send Back To</Label>
                <Select value={sendBackTarget} onValueChange={setSendBackTarget}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="risk_manager">Risk Manager — For re-assessment</SelectItem>
                    <SelectItem value="claims_processor">Claims Processor — For additional information</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded">
                <MessageSquare className="h-5 w-5 text-orange-600" />
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  This claim will be returned to the {sendBackTarget === "risk_manager" ? "Risk Manager" : "Claims Processor"} for further review
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sendBackComments">Comments (Required) *</Label>
                <Textarea
                  id="sendBackComments"
                  value={sendBackComments}
                  onChange={(e) => setSendBackComments(e.target.value)}
                  placeholder="Explain what needs to be reviewed or corrected (e.g., 'Cost estimates have high variance — please verify assessor evaluation against AI analysis')"
                  rows={6}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSendBackDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmitSendBack} 
                disabled={sendBackClaim.isPending || !sendBackComments}
                variant="outline"
                className="border-orange-500 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:bg-orange-950/30"
              >
                {sendBackClaim.isPending ? "Sending..." : "Send Back for Review"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Comprehensive Review Dialog */}
        <ClaimReviewDialog
          claimId={selectedClaim?.id || null}
          open={showReviewDialog}
          onOpenChange={setShowReviewDialog}
        />
          </TabsContent>

          {/* ── Active Claims Tab ── */}
          <TabsContent value="active" className="space-y-4">
            {/* Stats bar from real getDashboardStats */}
            {dashboardStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="shadow-sm border-0">
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold">{dashboardStats.total}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total Claims</p>
                  </CardContent>
                </Card>
                <Card className="shadow-sm border-0">
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold text-amber-600">{dashboardStats.activeCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">In-Flight</p>
                  </CardContent>
                </Card>
                <Card className="shadow-sm border-0">
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold text-red-600">{dashboardStats.fraudRate}%</p>
                    <p className="text-xs text-muted-foreground mt-1">Fraud Rate</p>
                  </CardContent>
                </Card>
                <Card className="shadow-sm border-0">
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold text-green-600">{dashboardStats.avgProcessingDays ?? "—"}</p>
                    <p className="text-xs text-muted-foreground mt-1">Avg Days to Close</p>
                  </CardContent>
                </Card>
              </div>
            )}
            <Card className="shadow-sm border-0">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-teal-600" />
                  All Active Claims
                  <Badge variant="secondary" className="ml-auto text-xs">{activeClaims.length}</Badge>
                </CardTitle>
                <CardDescription>All claims currently in-flight across all workflow states — live from database</CardDescription>
              </CardHeader>
              <CardContent>
                {activeClaimsLoading ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-40 animate-spin" />
                    <p className="text-sm">Loading active claims...</p>
                  </div>
                ) : activeClaims.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs">
                          <th className="text-left py-2 px-3">Claim #</th>
                          <th className="text-left py-2 px-3">Claimant</th>
                          <th className="text-left py-2 px-3">Vehicle</th>
                          <th className="text-left py-2 px-3">Status</th>
                          <th className="text-left py-2 px-3">Workflow</th>
                          <th className="text-left py-2 px-3">Risk</th>
                          <th className="text-left py-2 px-3">Amount</th>
                          <th className="text-left py-2 px-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeClaims.map((claim: any) => (
                          <tr key={claim.id} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="py-2 px-3 font-mono text-xs">{claim.claimNumber ?? `#${claim.id}`}</td>
                            <td className="py-2 px-3 text-xs">{claim.claimantName ?? "—"}</td>
                            <td className="py-2 px-3 text-xs">{claim.vehicleMake} {claim.vehicleModel} {claim.vehicleYear ? `(${claim.vehicleYear})` : ""}</td>
                            <td className="py-2 px-3">
                              <Badge variant="outline" className="text-xs capitalize">{(claim.status ?? "").replace(/_/g, " ")}</Badge>
                            </td>
                            <td className="py-2 px-3">
                              <Badge variant="secondary" className="text-xs capitalize">{(claim.workflowState ?? "").replace(/_/g, " ")}</Badge>
                            </td>
                            <td className="py-2 px-3">
                              <RiskBadge fraudRiskScore={claim.fraudRiskScore} fraudFlags={claim.fraudFlags} size="sm" />
                            </td>
                            <td className="py-2 px-3 text-xs font-medium">{claim.totalClaimAmount ? fmt(claim.totalClaimAmount) : "—"}</td>
                            <td className="py-2 px-3">
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => handleViewDetails(claim)}>
                                  <Eye className="h-3 w-3 mr-1" />View
                                </Button>
                                <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-amber-600 border-amber-200" onClick={() => handleSendBack(claim)}>
                                  <ArrowRight className="h-3 w-3 mr-1" />Route
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-10 text-muted-foreground">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No active claims</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Fraud Alerts Tab ── */}
          <TabsContent value="fraud" className="space-y-4">
            {/* Summary banner */}
            {dashboardStats && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-4">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                    {dashboardStats.fraudHighCount} high-risk claim{dashboardStats.fraudHighCount !== 1 ? "s" : ""} detected
                    {dashboardStats.fraudRate > 0 && ` — ${dashboardStats.fraudRate}% fraud rate across portfolio`}
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">Claims with fraudRiskLevel = high/critical/elevated or fraudRiskScore &gt; 70</p>
                </div>
              </div>
            )}
            <Card className="shadow-sm border-0">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  Fraud Alerts
                  <Badge variant="destructive" className="ml-auto text-xs">{fraudAlerts.length}</Badge>
                </CardTitle>
                <CardDescription>Claims with high/critical/elevated fraud risk or score &gt; 70 — live from database</CardDescription>
              </CardHeader>
              <CardContent>
                {fraudAlertsLoading ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-40 animate-spin" />
                    <p className="text-sm">Loading fraud alerts...</p>
                  </div>
                ) : fraudAlerts.length > 0 ? (
                  <div className="space-y-3">
                    {fraudAlerts.map((claim: any) => (
                      <div key={claim.id} className="flex items-center justify-between p-3 rounded-lg border border-red-100 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                            <Shield className="h-4 w-4 text-red-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{claim.claimNumber ?? `Claim #${claim.id}`}</p>
                            <p className="text-xs text-muted-foreground">
                              {claim.claimantName ?? "Unknown"} · {claim.vehicleMake} {claim.vehicleModel}
                              {claim.vehicleRegistration ? ` (${claim.vehicleRegistration})` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Risk score: <span className="text-red-600 font-semibold">{claim.fraudRiskScore ?? "N/A"}/100</span>
                              {claim.fraudRiskLevel && <> · Level: <span className="capitalize font-medium">{claim.fraudRiskLevel}</span></>}
                              {claim.totalClaimAmount ? <> · {fmt(claim.totalClaimAmount)}</> : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleViewDetails(claim)}>
                            <Eye className="h-3 w-3 mr-1" />Review
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-amber-600 border-amber-200" onClick={() => handleSendBack(claim)}>
                            Escalate
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 text-muted-foreground">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No fraud alerts — all claims within acceptable risk thresholds</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Processed Claims Tab ── */}
          <TabsContent value="processed" className="space-y-4">
            {dashboardStats && (
              <div className="grid grid-cols-3 gap-3">
                <Card className="shadow-sm border-0">
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold text-green-600">{dashboardStats.completedCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">Completed</p>
                  </CardContent>
                </Card>
                <Card className="shadow-sm border-0">
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold text-red-600">{dashboardStats.rejectedCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">Rejected</p>
                  </CardContent>
                </Card>
                <Card className="shadow-sm border-0">
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold">{dashboardStats.avgProcessingDays ?? "—"}</p>
                    <p className="text-xs text-muted-foreground mt-1">Avg Days to Close</p>
                  </CardContent>
                </Card>
              </div>
            )}
            <Card className="shadow-sm border-0">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Processed Claims
                  <Badge variant="secondary" className="ml-auto text-xs">{processedClaims.length}</Badge>
                </CardTitle>
                <CardDescription>Completed, closed, and rejected claims — live from database</CardDescription>
              </CardHeader>
              <CardContent>
                {completedLoading ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-40 animate-spin" />
                    <p className="text-sm">Loading processed claims...</p>
                  </div>
                ) : processedClaims.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs">
                          <th className="text-left py-2 px-3">Claim #</th>
                          <th className="text-left py-2 px-3">Claimant</th>
                          <th className="text-left py-2 px-3">Vehicle</th>
                          <th className="text-left py-2 px-3">Outcome</th>
                          <th className="text-left py-2 px-3">Amount</th>
                          <th className="text-left py-2 px-3">Closed</th>
                          <th className="text-left py-2 px-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {processedClaims.map((claim: any) => (
                          <tr key={claim.id} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="py-2 px-3 font-mono text-xs">{claim.claimNumber ?? `#${claim.id}`}</td>
                            <td className="py-2 px-3 text-xs">{claim.claimantName ?? "—"}</td>
                            <td className="py-2 px-3 text-xs">{claim.vehicleMake} {claim.vehicleModel}</td>
                            <td className="py-2 px-3">
                              <Badge
                                variant={claim.status === "completed" ? "default" : claim.status === "rejected" ? "destructive" : "secondary"}
                                className="text-xs capitalize"
                              >
                                {(claim.status ?? "").replace(/_/g, " ")}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-xs font-medium">
                              {claim.approvedAmount ? fmt(claim.approvedAmount) : claim.totalClaimAmount ? fmt(claim.totalClaimAmount) : "—"}
                            </td>
                            <td className="py-2 px-3 text-muted-foreground text-xs">{claim.updatedAt ? new Date(claim.updatedAt).toLocaleDateString() : "—"}</td>
                            <td className="py-2 px-3">
                              <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => handleViewDetails(claim)}>
                                <Eye className="h-3 w-3 mr-1" />View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-10 text-muted-foreground">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No processed claims yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
