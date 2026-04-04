import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ClipboardList, AlertTriangle, CheckCircle2, FileSearch, Flag, Brain } from "lucide-react";
import { RiskBadge, AiAssessButton } from "@/components/ClaimRiskIndicators";
import { Link } from "wouter";

export default function InternalAssessorDashboard() {
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [showAssessmentDialog, setShowAssessmentDialog] = useState(false);

  // Assessment form state
  const [assessmentData, setAssessmentData] = useState({
    estimatedRepairCost: "",
    laborCost: "",
    partsCost: "",
    estimatedDuration: "",
    damageAssessment: "",
    recommendations: "",
    fraudRiskLevel: "low" as "low" | "medium" | "high",
  });

  // Fetch claims pending internal assessment
  const { data: assessmentQueue, isLoading: queueLoading, refetch: refetchQueue } = 
    trpc.claims.byStatus.useQuery({ status: "assessment_pending" });

  // Submit internal assessment mutation
  const submitAssessment = trpc.assessorEvaluations.submit.useMutation({
    onSuccess: () => {
      toast.success("Assessment Submitted", {
        description: "Internal assessment has been successfully submitted.",
      });
      setShowAssessmentDialog(false);
      setSelectedClaim(null);
      setAssessmentData({
        estimatedRepairCost: "",
        laborCost: "",
        partsCost: "",
        estimatedDuration: "",
        damageAssessment: "",
        recommendations: "",
        fraudRiskLevel: "low",
      });
      refetchQueue();
    },
    onError: (error: any) => {
      toast.error("Error", {
        description: error.message,
      });
    },
  });

  const handleStartAssessment = (claim: any) => {
    setSelectedClaim(claim);
    setShowAssessmentDialog(true);
  };

  const handleSubmitAssessment = () => {
    if (!selectedClaim || !assessmentData.estimatedRepairCost || !assessmentData.damageAssessment) {
      toast.error("Validation Error", {
        description: "Please fill in all required fields.",
      });
      return;
    }

    submitAssessment.mutate({
      claimId: selectedClaim.id,
      assessorId: 1, // Will be replaced with actual assessor ID
      estimatedRepairCost: parseInt(assessmentData.estimatedRepairCost) * 100, // Convert to cents
      laborCost: assessmentData.laborCost ? parseInt(assessmentData.laborCost) * 100 : undefined,
      partsCost: assessmentData.partsCost ? parseInt(assessmentData.partsCost) * 100 : undefined,
      estimatedDuration: parseInt(assessmentData.estimatedDuration),
      damageAssessment: assessmentData.damageAssessment,
      recommendations: assessmentData.recommendations || undefined,
      fraudRiskLevel: assessmentData.fraudRiskLevel,
    });
  };

  const getFraudBadge = (level: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive", color: string }> = {
      low: { variant: "secondary", color: "text-green-600" },
      medium: { variant: "default", color: "text-yellow-600" },
      high: { variant: "destructive", color: "text-red-600" },
    };

    const { variant, color } = config[level] || config.low;

    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Flag className={`h-3 w-3 ${color}`} />
        {level.toUpperCase()} RISK
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-foreground">Internal Assessor Dashboard</h1>
            <p className="text-slate-600 dark:text-muted-foreground mt-1">Review external assessments and conduct internal evaluations</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-lg px-4 py-2">
              <ClipboardList className="h-5 w-5 mr-2" />
              {assessmentQueue?.length || 0} Pending
            </Badge>
          </div>
        </div>

        {/* Assessment Queue */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-teal-600" />
              Assessment Queue
            </CardTitle>
            <CardDescription>Claims requiring internal assessment and verification</CardDescription>
          </CardHeader>
          <CardContent>
            {queueLoading ? (
              <p className="text-center text-slate-700 dark:text-slate-400 dark:text-muted-foreground py-8">Loading assessment queue...</p>
            ) : assessmentQueue && assessmentQueue.length > 0 ? (
              <div className="space-y-3">
                {assessmentQueue.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="p-4 bg-slate-50 dark:bg-muted/50 rounded-lg border border-slate-200 dark:border-border hover:border-teal-300 dark:border-teal-700 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{claim.claimNumber}</h3>
                          <Badge variant="outline">Pending Internal Assessment</Badge>
                          <RiskBadge fraudRiskScore={claim.fraudRiskScore} fraudFlags={claim.fraudFlags} size="sm" />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-slate-600 dark:text-muted-foreground mb-3">
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
                            <span className="font-medium">Submitted:</span>{" "}
                            {new Date(claim.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        {claim.incidentDescription && (
                          <p className="text-sm text-slate-600 dark:text-muted-foreground mb-2">
                            <span className="font-medium">Incident:</span> {claim.incidentDescription}
                          </p>
                        )}
                      </div>

                      <div className="ml-4 flex flex-col gap-2">
                        <Button onClick={() => handleStartAssessment(claim)} size="sm">
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Conduct Assessment
                        </Button>
                        <AiAssessButton 
                          claimId={claim.id}
                          claimNumber={claim.claimNumber}
                          size="sm"
                        />
                        <Link href={`/insurer/comparison/${claim.id}`}>
                          <Button variant="outline" size="sm" className="w-full">
                            <FileSearch className="h-4 w-4 mr-2" />
                            View Details
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <ClipboardList className="h-12 w-12 text-slate-600 dark:text-slate-300 mx-auto mb-3" />
                <p className="text-slate-700 dark:text-slate-400 dark:text-muted-foreground">No claims pending internal assessment</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 dark:text-muted-foreground/70">New claims will appear here when external assessments are complete</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assessment Dialog */}
        <Dialog open={showAssessmentDialog} onOpenChange={setShowAssessmentDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Conduct Internal Assessment</DialogTitle>
              <DialogDescription>
                {selectedClaim && `Claim: ${selectedClaim.claimNumber} - ${selectedClaim.vehicleRegistration}`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Cost Estimates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="estimatedRepairCost">Estimated Repair Cost ($) *</Label>
                  <Input
                    id="estimatedRepairCost"
                    type="number"
                    value={assessmentData.estimatedRepairCost}
                    onChange={(e) => setAssessmentData({ ...assessmentData, estimatedRepairCost: e.target.value })}
                    placeholder="5000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="estimatedDuration">Estimated Duration (days) *</Label>
                  <Input
                    id="estimatedDuration"
                    type="number"
                    value={assessmentData.estimatedDuration}
                    onChange={(e) => setAssessmentData({ ...assessmentData, estimatedDuration: e.target.value })}
                    placeholder="7"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="laborCost">Labor Cost ($)</Label>
                  <Input
                    id="laborCost"
                    type="number"
                    value={assessmentData.laborCost}
                    onChange={(e) => setAssessmentData({ ...assessmentData, laborCost: e.target.value })}
                    placeholder="2000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="partsCost">Parts Cost ($)</Label>
                  <Input
                    id="partsCost"
                    type="number"
                    value={assessmentData.partsCost}
                    onChange={(e) => setAssessmentData({ ...assessmentData, partsCost: e.target.value })}
                    placeholder="3000"
                  />
                </div>
              </div>

              {/* Fraud Risk Level */}
              <div className="space-y-2">
                <Label htmlFor="fraudRiskLevel">Fraud Risk Level *</Label>
                <Select
                  value={assessmentData.fraudRiskLevel}
                  onValueChange={(value: "low" | "medium" | "high") =>
                    setAssessmentData({ ...assessmentData, fraudRiskLevel: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low Risk</SelectItem>
                    <SelectItem value="medium">Medium Risk</SelectItem>
                    <SelectItem value="high">High Risk - Flag for Review</SelectItem>
                  </SelectContent>
                </Select>
                {assessmentData.fraudRiskLevel === "high" && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <p className="text-sm text-red-700 dark:text-red-300">
                      High-risk claims will be flagged for executive review and fraud investigation
                    </p>
                  </div>
                )}
              </div>

              {/* Damage Assessment */}
              <div className="space-y-2">
                <Label htmlFor="damageAssessment">Damage Assessment *</Label>
                <Textarea
                  id="damageAssessment"
                  value={assessmentData.damageAssessment}
                  onChange={(e) => setAssessmentData({ ...assessmentData, damageAssessment: e.target.value })}
                  placeholder="Detailed assessment of vehicle damage, repair requirements, and technical findings..."
                  rows={6}
                />
              </div>

              {/* Recommendations */}
              <div className="space-y-2">
                <Label htmlFor="recommendations">Recommendations</Label>
                <Textarea
                  id="recommendations"
                  value={assessmentData.recommendations}
                  onChange={(e) => setAssessmentData({ ...assessmentData, recommendations: e.target.value })}
                  placeholder="Additional recommendations, repair considerations, or special instructions..."
                  rows={4}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAssessmentDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitAssessment} disabled={submitAssessment.isPending}>
                {submitAssessment.isPending ? "Submitting..." : "Submit Assessment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
