import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText, UserPlus, Clock, CheckCircle, AlertCircle, Upload, Eye, RefreshCw, MessageSquare } from "lucide-react";

/**
 * Claims Processor Dashboard
 * 
 * Responsibilities:
 * - View claims submitted by claimants (NOT create claims - that's a claimant-only function)
 * - Upload additional documents (PDFs) for existing claims (e.g., historical claims received via email)
 * - Assign external assessors to claims
 * - View AI assessment results (triage, damage analysis, physics reports)
 * - Handle claims returned by Claims Manager for review
 */
export default function ClaimsProcessorDashboard() {
  const [selectedClaimForUpload, setSelectedClaimForUpload] = useState<number | null>(null);
  const [selectedClaimForAI, setSelectedClaimForAI] = useState<number | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Fetch pending claims (submitted by claimants, awaiting processor action)
  const { data: pendingClaims, isLoading: pendingLoading, refetch: refetchPending } = 
    trpc.workflow.getClaimsByState.useQuery({ state: "created" });

  // Fetch returned claims (sent back by Claims Manager)
  const { data: returnedClaims, isLoading: returnedLoading } = 
    trpc.workflow.getClaimsByState.useQuery({ state: "created" });

  // Fetch available external assessors
  const { data: assessors, isLoading: assessorsLoading } = trpc.assessors.list.useQuery();

  // Fetch AI assessment for selected claim
  const { data: aiAssessment, isLoading: aiLoading } = trpc.aiAssessments.byClaim.useQuery(
    { claimId: selectedClaimForAI! },
    { enabled: !!selectedClaimForAI }
  );

  // Assign assessor mutation
  const assignAssessor = trpc.claims.assignToAssessor.useMutation({
    onSuccess: () => {
      toast.success("Assessor Assigned", {
        description: "External assessor has been assigned to the claim.",
      });
      refetchPending();
    },
    onError: (error: any) => {
      toast.error("Error", {
        description: error.message,
      });
    },
  });

  // Upload document mutation
  const uploadDocument = trpc.documents.upload.useMutation({
    onSuccess: () => {
      toast.success("Document Uploaded", {
        description: "PDF document has been successfully attached to the claim.",
      });
      setSelectedClaimForUpload(null);
      refetchPending();
    },
    onError: (error: any) => {
      toast.error("Upload Error", {
        description: error.message,
      });
      setUploadingFile(false);
    },
  });

  const handleFileUpload = async (claimId: number, file: File) => {
    if (!file.type.includes("pdf")) {
      toast.error("Invalid File Type", {
        description: "Only PDF files are supported for claims processing.",
      });
      return;
    }

    if (file.size > 16 * 1024 * 1024) {
      toast.error("File Too Large", {
        description: "PDF file must be smaller than 16MB.",
      });
      return;
    }

    setUploadingFile(true);

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        
        await uploadDocument.mutateAsync({
          claimId,
          fileName: file.name,
          fileData: base64,
          fileSize: file.size,
          mimeType: file.type,
          documentTitle: file.name,
          documentDescription: "Historical claim document uploaded by Claims Processor",
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

  const handleAssignAssessor = (claimId: number, assessorId: number) => {
    assignAssessor.mutate({ claimId, assessorId });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", icon: any }> = {
      pending_triage: { variant: "outline", icon: Clock },
      pending_assignment: { variant: "outline", icon: Clock },
      pending_assessment: { variant: "secondary", icon: UserPlus },
      assessment_complete: { variant: "default", icon: CheckCircle },
      disputed: { variant: "destructive", icon: AlertCircle },
    };

    const config = statusConfig[status] || { variant: "outline" as const, icon: Clock };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status.replace(/_/g, " ")}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Claims Processor Dashboard</h1>
            <p className="text-slate-600 mt-1">Process claims, upload documents, and assign assessors</p>
          </div>
        </div>

        {/* Info Banner */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-900">Claims Processing Workflow</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Claims are submitted by claimants through their portal. Your role is to review submitted claims,
                  upload additional documents (e.g., historical PDFs received via email), assign assessors, and
                  view AI assessment results.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Returned Claims (Sent Back by Claims Manager) */}
        {returnedClaims && returnedClaims.length > 0 && (
          <Card className="shadow-lg border-l-4 border-l-orange-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-orange-600" />
                Claims Returned for Review
              </CardTitle>
              <CardDescription>
                Claims sent back by Claims Manager requiring additional validation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {returnedClaims.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="p-4 bg-orange-50 rounded-lg border border-orange-200 hover:border-orange-400 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{claim.claimNumber}</h3>
                          <Badge variant="outline" className="border-orange-500 text-orange-700">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Returned for Review
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-slate-600 mb-3">
                          <div>
                            <span className="font-medium">Vehicle:</span> {claim.vehicleRegistration}
                          </div>
                          <div>
                            <span className="font-medium">Make/Model:</span> {claim.vehicleMake} {claim.vehicleModel}
                          </div>
                          <div>
                            <span className="font-medium">Policy:</span> {claim.policyNumber}
                          </div>
                          <div>
                            <span className="font-medium">Created:</span>{" "}
                            {new Date(claim.createdAt).toLocaleDateString()}
                          </div>
                        </div>

                        {/* Claims Manager Comments */}
                        <div className="p-3 bg-white border border-orange-300 rounded mb-2">
                          <div className="flex items-center gap-2 mb-2">
                            <MessageSquare className="h-4 w-4 text-orange-600" />
                            <span className="text-sm font-medium text-orange-700">Claims Manager Comments:</span>
                          </div>
                          <p className="text-sm text-slate-700 italic">
                            "Please review and validate the assessment - additional verification needed"
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Note: Full comment history available in claim details
                          </p>
                        </div>
                      </div>

                      <div className="ml-4 flex flex-col gap-2">
                        <Button size="sm" variant="outline" className="border-orange-500 text-orange-700">
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Reassign Assessor
                        </Button>
                        <Button size="sm" variant="outline">
                          <MessageSquare className="h-4 w-4 mr-2" />
                          View Comments
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending Claims (Awaiting Processor Action) */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Pending Claims
            </CardTitle>
            <CardDescription>Claims submitted by claimants awaiting your action</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingLoading ? (
              <p className="text-center text-slate-500 py-8">Loading claims...</p>
            ) : pendingClaims && pendingClaims.length > 0 ? (
              <div className="space-y-3">
                {pendingClaims.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{claim.claimNumber}</h3>
                          {getStatusBadge(claim.workflowState)}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-slate-600">
                          <div>
                            <span className="font-medium">Claimant:</span> {claim.claimantName || "N/A"}
                          </div>
                          <div>
                            <span className="font-medium">Vehicle:</span> {claim.vehicleRegistration}
                          </div>
                          <div>
                            <span className="font-medium">Policy:</span> {claim.policyNumber}
                          </div>
                          <div>
                            <span className="font-medium">Submitted:</span>{" "}
                            {new Date(claim.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="ml-4 flex flex-col gap-2 min-w-[220px]">
                        {/* Upload PDF Document */}
                        <Dialog open={selectedClaimForUpload === claim.id} onOpenChange={(open) => !open && setSelectedClaimForUpload(null)}>
                          <DialogTrigger asChild>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => setSelectedClaimForUpload(claim.id)}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload PDF
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Upload Claim Document</DialogTitle>
                              <DialogDescription>
                                Upload additional PDF documents for claim {claim.claimNumber}
                                (e.g., historical claims received via email)
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 pt-4">
                              <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
                                <Upload className="h-12 w-12 text-slate-400 mx-auto mb-3" />
                                <Label
                                  htmlFor={`file-upload-${claim.id}`}
                                  className="cursor-pointer text-blue-600 hover:text-blue-700 font-medium"
                                >
                                  Click to select PDF file
                                </Label>
                                <input
                                  id={`file-upload-${claim.id}`}
                                  type="file"
                                  accept=".pdf"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleFileUpload(claim.id, file);
                                    }
                                  }}
                                  disabled={uploadingFile}
                                />
                                <p className="text-xs text-slate-500 mt-2">
                                  PDF files only, max 16MB
                                </p>
                              </div>
                              {uploadingFile && (
                                <p className="text-center text-sm text-blue-600">
                                  Uploading document...
                                </p>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>

                        {/* Assign Assessor */}
                        {(claim.workflowState === "created" || claim.workflowState === "assigned") && (
                          <div>
                            <Label className="text-xs mb-1">Assign Assessor</Label>
                            <Select
                              onValueChange={(value) => handleAssignAssessor(claim.id, parseInt(value))}
                              disabled={assignAssessor.isPending || assessorsLoading}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select assessor" />
                              </SelectTrigger>
                              <SelectContent>
                                {assessorsLoading ? (
                                  <SelectItem value="loading">Loading...</SelectItem>
                                ) : assessors && assessors.length > 0 ? (
                                  assessors.map((assessor: any) => (
                                    <SelectItem key={assessor.id} value={assessor.id.toString()}>
                                      {assessor.name}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <SelectItem value="none">No assessors available</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* View AI Assessment */}
                        <Dialog open={selectedClaimForAI === claim.id} onOpenChange={(open) => !open && setSelectedClaimForAI(null)}>
                          <DialogTrigger asChild>
                            <Button 
                              size="sm" 
                              variant="default"
                              onClick={() => setSelectedClaimForAI(claim.id)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View AI Assessment
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>AI Assessment Results</DialogTitle>
                              <DialogDescription>
                                Triage, damage analysis, and physics validation for claim {claim.claimNumber}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 pt-4">
                              {aiLoading ? (
                                <p className="text-center text-slate-500 py-8">Loading AI assessment...</p>
                              ) : aiAssessment ? (
                                <div className="space-y-4">
                                  {/* Triage Results */}
                                  <Card>
                                    <CardHeader>
                                      <CardTitle className="text-lg">Triage Assessment</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                      <div className="space-y-2">
                                        <div className="flex justify-between">
                                          <span className="font-medium">Confidence Score:</span>
                                          <Badge>{aiAssessment.confidenceScore ? `${aiAssessment.confidenceScore}%` : "N/A"}</Badge>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="font-medium">Fraud Risk:</span>
                                          <Badge variant={aiAssessment.fraudRiskLevel === "high" ? "destructive" : "secondary"}>
                                            {aiAssessment.fraudRiskLevel || "N/A"}
                                          </Badge>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="font-medium">Estimated Cost:</span>
                                          <span>${aiAssessment.estimatedCost?.toLocaleString() || "N/A"}</span>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>

                                  {/* Damage Analysis */}
                                  <Card>
                                    <CardHeader>
                                      <CardTitle className="text-lg">Damage Analysis</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                      <p className="text-sm text-slate-700 whitespace-pre-wrap">
                                        {aiAssessment.damageDescription || "No damage analysis available"}
                                      </p>
                                    </CardContent>
                                  </Card>

                                  {/* Physics Validation */}
                                  {aiAssessment.physicsAnalysis && (
                                    <Card>
                                      <CardHeader>
                                        <CardTitle className="text-lg">Physics Analysis</CardTitle>
                                      </CardHeader>
                                      <CardContent>
                                        <p className="text-sm text-slate-700 whitespace-pre-wrap">
                                          {aiAssessment.physicsAnalysis}
                                        </p>
                                      </CardContent>
                                    </Card>
                                  )}
                                </div>
                              ) : (
                                <div className="text-center py-8">
                                  <AlertCircle className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                                  <p className="text-slate-500">No AI assessment available for this claim</p>
                                  <p className="text-sm text-slate-400 mt-1">
                                    AI assessment will be generated after claim triage
                                  </p>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No pending claims</p>
                <p className="text-sm text-slate-400">Claims submitted by claimants will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
