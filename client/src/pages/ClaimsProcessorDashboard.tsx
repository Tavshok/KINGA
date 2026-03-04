import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  FileText, 
  Clock, 
  AlertCircle, 
  Upload, 
  RefreshCw, 
  CheckCircle,
  Brain,
  Shield
} from "lucide-react";
import { ClaimCard } from "@/components/ClaimCard";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * Claims Processor Dashboard
 * 
 * Organized into 4 sections:
 * 1. Pending Claims - Newly submitted, awaiting initial review
 * 2. In Review - Currently being processed
 * 3. AI Flagged - Flagged by AI for attention
 * 4. Completed - Processed and closed
 */
export default function ClaimsProcessorDashboard() {
  const { user } = useAuth();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<number | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Role validation — allow admin users to bypass for testing
  if (user?.role !== "admin" && user?.insurerRole !== "claims_processor") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
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

  // Fetch claims by different states
  const { data: pendingData, isLoading: pendingLoading, refetch: refetchPending } = 
    trpc.workflowQueries.getClaimsByState.useQuery({ state: "intake_queue", limit: 100, offset: 0 });
  
  const { data: inReviewData, isLoading: inReviewLoading, refetch: refetchInReview } = 
    trpc.workflowQueries.getClaimsByState.useQuery({ state: "assigned", limit: 100, offset: 0 });
  
  const { data: aiFlaggedData, isLoading: aiFlaggedLoading, refetch: refetchAIFlagged } = 
    trpc.workflowQueries.getClaimsByState.useQuery({ state: "disputed", limit: 100, offset: 0 });
  
  const { data: completedData, isLoading: completedLoading, refetch: refetchCompleted } = 
    trpc.workflowQueries.getClaimsByState.useQuery({ state: "closed", limit: 100, offset: 0 });

  const pendingClaims = pendingData?.claims || pendingData?.items || [];
  const inReviewClaims = inReviewData?.claims || inReviewData?.items || [];
  const aiFlaggedClaims = aiFlaggedData?.claims || aiFlaggedData?.items || [];
  const completedClaims = completedData?.claims || completedData?.items || [];

  // Upload document mutation
  const uploadDocument = trpc.documents.upload.useMutation({
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

  const refetchAll = () => {
    refetchPending();
    refetchInReview();
    refetchAIFlagged();
    refetchCompleted();
  };

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
    window.location.href = `/insurer/claims/${claimId}`;
  };

  const handleDownloadReport = async (claimId: number) => {
    toast.info("Generating Report", {
      description: "AI assessment report is being generated...",
    });
    // TODO: Implement PDF download
  };

  const handleUploadEvidence = (claimId: number) => {
    setSelectedClaimId(claimId);
    setUploadDialogOpen(true);
  };

  const handleEscalate = (claimId: number) => {
    toast.info("Escalation", {
      description: "Escalation workflow will be implemented in the next update.",
    });
    // TODO: Implement escalation to underwriter
  };

  const handleTriggerAI = (claimId: number) => {
    toast.info("AI Assessment", {
      description: "Triggering AI assessment for this claim...",
    });
    // TODO: Implement AI assessment trigger via tRPC
  };

  const handleAssignAssessor = (claimId: number) => {
    toast.info("Assign Assessor", {
      description: "Assessor assignment workflow will be implemented in the next update.",
    });
    // TODO: Implement assessor assignment dialog
  };

  const renderSection = (
    title: string,
    icon: any,
    claims: any[],
    isLoading: boolean,
    emptyMessage: string,
    borderColor: string
  ) => {
    const Icon = icon;

    return (
      <Card className={`shadow-lg border-l-4 ${borderColor}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {title}
            <span className="ml-auto text-sm font-normal text-slate-500">
              ({claims.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-slate-500 py-8">Loading claims...</p>
          ) : claims.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
              <Icon className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">{emptyMessage}</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4"
                onClick={refetchAll}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {claims.map((claim: any) => (
                <ClaimCard
                  key={claim.id}
                  claim={{
                    id: claim.id,
                    claimNumber: claim.claimNumber,
                    policyholderName: claim.claimantName || claim.policyholderName,
                    claimType: "Motor Vehicle",
                    vehicleRegistration: claim.vehicleRegistration,
                    vehicleMake: claim.vehicleMake,
                    vehicleModel: claim.vehicleModel,
                    policyNumber: claim.policyNumber,
                    aiConfidenceScore: claim.aiConfidenceScore || 0,
                    fraudRiskScore: claim.fraudRiskScore || 0,
                    status: claim.workflowState,
                    createdAt: claim.createdAt,
                  }}
                  onViewDetails={handleViewDetails}
                  onDownloadReport={handleDownloadReport}
                  onUploadEvidence={handleUploadEvidence}
                  onEscalate={handleEscalate}
                  onTriggerAI={handleTriggerAI}
                  onAssignAssessor={handleAssignAssessor}
                  showAITrigger={!claim.aiConfidenceScore || claim.aiConfidenceScore === 0}
                  showAssignAssessor={claim.workflowState === "created" || claim.workflowState === "pending"}
                />
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
              className="bg-white text-teal-700 hover:bg-white/90 font-medium"
              onClick={() => window.location.href = "/processor/upload-documents"}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload New Claim
            </Button>
            <Button 
              variant="outline" 
              className="border-white/30 text-white hover:bg-white/10"
              onClick={refetchAll}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh All
            </Button>
            <Button 
              variant="outline" 
              className="border-white/30 text-white hover:bg-white/10"
              onClick={() => window.location.href = "/portal-hub"}
            >
              Portal Hub
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto space-y-6 p-6">
        {/* Pending Claims */}
        {renderSection(
          "Pending Claims",
          Clock,
          pendingClaims,
          pendingLoading,
          "No pending claims assigned to you",
          "border-l-slate-400"
        )}

        {/* In Review */}
        {renderSection(
          "In Review",
          FileText,
          inReviewClaims,
          inReviewLoading,
          "No claims currently in review",
          "border-l-blue-400"
        )}

        {/* AI Flagged */}
        {renderSection(
          "AI Flagged",
          Brain,
          aiFlaggedClaims,
          aiFlaggedLoading,
          "No claims flagged by AI",
          "border-l-orange-500"
        )}

        {/* Completed */}
        {renderSection(
          "Completed",
          CheckCircle,
          completedClaims,
          completedLoading,
          "No completed claims",
          "border-l-green-500"
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
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 text-slate-400 mx-auto mb-3" />
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
              <p className="text-xs text-slate-500 mt-2">
                PDF or image files, max 16MB
              </p>
            </div>
            {uploadingFile && (
              <p className="text-center text-sm text-primary">
                Uploading evidence...
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
