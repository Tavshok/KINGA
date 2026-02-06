import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ClipboardCheck, ArrowLeft, Save, Calendar, FileText, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { useState } from "react";

export default function AssessorClaimDetails() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/assessor/claims/:id");
  const claimId = params?.id ? parseInt(params.id) : 0;

  // Form state for evaluation
  const [evaluation, setEvaluation] = useState({
    estimatedRepairCost: "",
    laborCost: "",
    partsCost: "",
    estimatedDuration: "",
    damageAssessment: "",
    recommendations: "",
    fraudRiskLevel: "low" as "low" | "medium" | "high",
  });

  // Get claim details
  const { data: claim, isLoading } = trpc.claims.getById.useQuery({ id: claimId });

  // Get existing evaluation if any
  const { data: existingEvaluation } = trpc.assessorEvaluations.byClaim.useQuery({ claimId });

  // Submit evaluation mutation
  const submitEvaluation = trpc.assessorEvaluations.submit.useMutation({
    onSuccess: () => {
      toast.success("Evaluation submitted successfully");
      setLocation("/assessor/dashboard");
    },
    onError: (error) => {
      toast.error(`Failed to submit evaluation: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const estimatedCost = parseFloat(evaluation.estimatedRepairCost);
    if (isNaN(estimatedCost) || estimatedCost <= 0) {
      toast.error("Please enter a valid repair cost");
      return;
    }

    submitEvaluation.mutate({
      claimId,
      assessorId: user!.id,
      estimatedRepairCost: Math.round(estimatedCost * 100), // Convert to cents
      laborCost: evaluation.laborCost ? Math.round(parseFloat(evaluation.laborCost) * 100) : undefined,
      partsCost: evaluation.partsCost ? Math.round(parseFloat(evaluation.partsCost) * 100) : undefined,
      estimatedDuration: parseInt(evaluation.estimatedDuration) || 7,
      damageAssessment: evaluation.damageAssessment,
      recommendations: evaluation.recommendations || undefined,
      fraudRiskLevel: evaluation.fraudRiskLevel,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Claim Not Found</CardTitle>
            <CardDescription>The requested claim could not be found</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/assessor/dashboard")}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const damagePhotos = claim.damagePhotos ? JSON.parse(claim.damagePhotos) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Claim Assessment</h1>
                <p className="text-sm text-muted-foreground font-mono">{claim.claimNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setLocation("/assessor/dashboard")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Claim Details - Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Vehicle & Incident Information */}
            <Card>
              <CardHeader>
                <CardTitle>Vehicle & Incident Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-muted-foreground">Vehicle</Label>
                    <p className="font-medium">
                      {claim.vehicleMake} {claim.vehicleModel} ({claim.vehicleYear})
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Registration</Label>
                    <p className="font-medium">{claim.vehicleRegistration}</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <Label className="text-muted-foreground">Incident Date</Label>
                  <p className="font-medium">
                    {claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString() : "N/A"}
                  </p>
                </div>

                <div>
                  <Label className="text-muted-foreground">Location</Label>
                  <p className="font-medium">{claim.incidentLocation}</p>
                </div>

                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="text-sm">{claim.incidentDescription}</p>
                </div>

                <div>
                  <Label className="text-muted-foreground">Policy Number</Label>
                  <p className="font-medium">{claim.policyNumber}</p>
                </div>
              </CardContent>
            </Card>

            {/* Damage Photos */}
            <Card>
              <CardHeader>
                <CardTitle>Damage Photos</CardTitle>
                <CardDescription>{damagePhotos.length} photo(s) uploaded</CardDescription>
              </CardHeader>
              <CardContent>
                {damagePhotos.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {damagePhotos.map((url: string, index: number) => (
                      <div key={index} className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                        <FileText className="h-12 w-12 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No photos uploaded</p>
                )}
              </CardContent>
            </Card>

            {/* Evaluation Form */}
            <Card>
              <CardHeader>
                <CardTitle>Your Assessment</CardTitle>
                <CardDescription>
                  {existingEvaluation ? "Update your evaluation" : "Submit your independent evaluation"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="estimatedRepairCost">Total Repair Cost ($) *</Label>
                      <Input
                        id="estimatedRepairCost"
                        type="number"
                        step="0.01"
                        required
                        value={evaluation.estimatedRepairCost}
                        onChange={(e) => setEvaluation(prev => ({ ...prev, estimatedRepairCost: e.target.value }))}
                        placeholder="5000.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="laborCost">Labor Cost ($)</Label>
                      <Input
                        id="laborCost"
                        type="number"
                        step="0.01"
                        value={evaluation.laborCost}
                        onChange={(e) => setEvaluation(prev => ({ ...prev, laborCost: e.target.value }))}
                        placeholder="2000.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="partsCost">Parts Cost ($)</Label>
                      <Input
                        id="partsCost"
                        type="number"
                        step="0.01"
                        value={evaluation.partsCost}
                        onChange={(e) => setEvaluation(prev => ({ ...prev, partsCost: e.target.value }))}
                        placeholder="3000.00"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="estimatedDuration">Estimated Duration (days) *</Label>
                    <Input
                      id="estimatedDuration"
                      type="number"
                      required
                      value={evaluation.estimatedDuration}
                      onChange={(e) => setEvaluation(prev => ({ ...prev, estimatedDuration: e.target.value }))}
                      placeholder="7"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="damageAssessment">Damage Assessment *</Label>
                    <Textarea
                      id="damageAssessment"
                      required
                      value={evaluation.damageAssessment}
                      onChange={(e) => setEvaluation(prev => ({ ...prev, damageAssessment: e.target.value }))}
                      placeholder="Detailed assessment of the damage..."
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recommendations">Recommendations</Label>
                    <Textarea
                      id="recommendations"
                      value={evaluation.recommendations}
                      onChange={(e) => setEvaluation(prev => ({ ...prev, recommendations: e.target.value }))}
                      placeholder="Any additional recommendations..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fraudRiskLevel">Fraud Risk Assessment</Label>
                    <select
                      id="fraudRiskLevel"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={evaluation.fraudRiskLevel}
                      onChange={(e) => setEvaluation(prev => ({ ...prev, fraudRiskLevel: e.target.value as any }))}
                    >
                      <option value="low">Low Risk</option>
                      <option value="medium">Medium Risk</option>
                      <option value="high">High Risk</option>
                    </select>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setLocation("/assessor/dashboard")}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={submitEvaluation.isPending}
                    >
                      {submitEvaluation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Submit Evaluation
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Right Column */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Claim Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge>{claim.status.replace(/_/g, " ").toUpperCase()}</Badge>
                  </div>
                </div>

                <Separator />

                <div>
                  <Label className="text-muted-foreground">Policy Verified</Label>
                  <div className="mt-1">
                    {claim.policyVerified === null ? (
                      <Badge variant="outline">Pending</Badge>
                    ) : claim.policyVerified ? (
                      <Badge variant="default" className="bg-green-600">Verified</Badge>
                    ) : (
                      <Badge variant="destructive">Rejected</Badge>
                    )}
                  </div>
                </div>

                <Separator />

                <div>
                  <Label className="text-muted-foreground">Submitted</Label>
                  <p className="text-sm mt-1">
                    {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : "N/A"}
                  </p>
                </div>
              </CardContent>
            </Card>

            {existingEvaluation && (
              <Card>
                <CardHeader>
                  <CardTitle>Previous Evaluation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Estimated Cost</Label>
                    <p className="font-medium">
                      {existingEvaluation.estimatedRepairCost 
                        ? `$${(existingEvaluation.estimatedRepairCost / 100).toFixed(2)}`
                        : "N/A"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Duration</Label>
                    <p>{existingEvaluation.estimatedDuration} days</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Fraud Risk</Label>
                    <Badge variant={existingEvaluation.fraudRiskLevel === "high" ? "destructive" : "outline"}>
                      {existingEvaluation.fraudRiskLevel}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
