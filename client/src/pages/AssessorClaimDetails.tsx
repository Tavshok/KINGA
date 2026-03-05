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
import PoliceReportForm from "@/components/PoliceReportForm";
import VehicleValuationCard from "@/components/VehicleValuationCard";
import PanelBeaterChoicesCard from "@/components/PanelBeaterChoicesCard";
import { AiStatusBadge } from "@/components/AiStatusBadge";

export default function AssessorClaimDetails() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/assessor/claims/:id");
  const claimId = Number(params?.id ? parseInt(params.id) : 0);

  // Form state for evaluation
  const [evaluation, setEvaluation] = useState({
    estimatedRepairCost: "",
    laborCost: "",
    partsCost: "",
    estimatedDuration: "",
    damageAssessment: "",
    recommendations: "",
    fraudRiskLevel: "low" as "low" | "medium" | "high",
    disagreesWithAi: false,
    aiDisagreementReason: "",
  });

  // Get claim details
  const { data: claim, isLoading } = trpc.claims.getById.useQuery({ id: claimId });

  // Get existing evaluation if any
  const { data: existingEvaluation } = trpc.assessorEvaluations.byClaim.useQuery({ claimId });

  // Get AI assessment for this claim
  const { data: aiAssessment, isLoading: aiLoading } = trpc.aiAssessments.byClaim.useQuery({ claimId });

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
      assessorId: Number(user!.id),
      estimatedRepairCost: Math.round(estimatedCost * 100), // Convert to cents
      laborCost: evaluation.laborCost ? Math.round(parseFloat(evaluation.laborCost) * 100) : undefined,
      partsCost: evaluation.partsCost ? Math.round(parseFloat(evaluation.partsCost) * 100) : undefined,
      estimatedDuration: parseInt(evaluation.estimatedDuration) || 7,
      damageAssessment: evaluation.damageAssessment,
      recommendations: evaluation.recommendations || undefined,
      fraudRiskLevel: evaluation.fraudRiskLevel,
      disagreesWithAi: evaluation.disagreesWithAi,
      aiDisagreementReason: evaluation.disagreesWithAi ? evaluation.aiDisagreementReason : undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
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
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Claim Assessment</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-sm text-muted-foreground font-mono">{claim.claimNumber}</p>
                  <AiStatusBadge claim={claim} aiAssessment={aiAssessment ?? null} />
                </div>
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

            {/* Panel Beater Choices */}
            <PanelBeaterChoicesCard claimId={claimId} />

            {/* AI Co-Pilot Assessment */}
            {aiAssessment && (
              <Card className="border-l-4 border-l-primary bg-primary/5/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        AI Co-Pilot Assessment
                      </CardTitle>
                      <CardDescription className="text-primary/90">
                        AI-powered pre-assessment to assist your evaluation
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="bg-primary/10 text-primary/90">
                      Confidence: {aiAssessment.confidenceScore || 0}%
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Cost Recommendations */}
                  <div className="bg-white rounded-lg p-4 space-y-3">
                    <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Cost Optimization
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 rounded p-3">
                        <p className="text-xs text-slate-600">AI Estimated Cost</p>
                        <p className="text-lg font-bold text-slate-900">
                          ${((aiAssessment.estimatedCost || 0) / 100).toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-slate-50 rounded p-3">
                        <p className="text-xs text-slate-600">Market Average</p>
                        <p className="text-lg font-bold text-slate-900">
                          ${(((aiAssessment.estimatedCost || 0) * 1.1) / 100).toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-500">±10% variance</p>
                      </div>
                    </div>
                  </div>

                  {/* Fraud Detection Alerts */}
                  {aiAssessment.fraudRiskLevel && aiAssessment.fraudRiskLevel !== "low" && (
                    <div className={`rounded-lg p-4 ${
                      aiAssessment.fraudRiskLevel === "high" 
                        ? "bg-red-50 border border-red-200" 
                        : "bg-orange-50 border border-orange-200"
                    }`}>
                      <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className={aiAssessment.fraudRiskLevel === "high" ? "text-red-700" : "text-orange-700"}>
                          {aiAssessment.fraudRiskLevel === "high" ? "High" : "Medium"} Fraud Risk Detected
                        </span>
                      </h3>
                      {aiAssessment.fraudIndicators && (
                        <ul className="text-sm space-y-1 ml-6">
                          {JSON.parse(aiAssessment.fraudIndicators).map((indicator: string, idx: number) => (
                            <li key={idx} className={aiAssessment.fraudRiskLevel === "high" ? "text-red-700" : "text-orange-700"}>
                              • {indicator}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Damage Analysis */}
                  <div className="bg-white rounded-lg p-4">
                    <h3 className="font-semibold text-sm text-slate-700 mb-2">AI Damage Analysis</h3>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">
                      {aiAssessment.damageDescription || "No detailed analysis available"}
                    </p>
                    {aiAssessment.detectedDamageTypes && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {JSON.parse(aiAssessment.detectedDamageTypes).map((type: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {type}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Physics Analysis */}
                  {aiAssessment.physicsAnalysis && (
                    <div className="bg-white rounded-lg p-4">
                      <h3 className="font-semibold text-sm text-slate-700 mb-2 flex items-center gap-2">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        Physics-Based Validation
                      </h3>
                      <p className="text-sm text-slate-600">
                        {typeof aiAssessment.physicsAnalysis === 'string' 
                          ? aiAssessment.physicsAnalysis 
                          : JSON.stringify(aiAssessment.physicsAnalysis, null, 2)}
                      </p>
                    </div>
                  )}

                  <div className="bg-primary/10 rounded-lg p-3 text-sm text-secondary">
                    <strong>Note:</strong> This AI assessment is provided as guidance. You should use your professional judgment and expertise to make the final evaluation.
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Damage Photos */}
            <Card>
              <CardHeader>
                <CardTitle>Damage Photos</CardTitle>
                <CardDescription>{damagePhotos.length} photo(s) uploaded</CardDescription>
              </CardHeader>
              <CardContent>
                {damagePhotos.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {damagePhotos.map((photoUrl: string, index: number) => {
                      // Extract CDN URL from manus-upload-file output if needed
                      const cdnUrlMatch = photoUrl.match(/CDN URL: (https:\/\/[^\s]+)/);
                      const imageUrl = cdnUrlMatch ? cdnUrlMatch[1] : photoUrl;
                      
                      return (
                        <a 
                          key={index} 
                          href={imageUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="aspect-square bg-muted rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
                        >
                          <img 
                            src={imageUrl} 
                            alt={`Damage photo ${index + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback to icon if image fails to load
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg class="h-12 w-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></div>';
                            }}
                          />
                        </a>
                      );
                    })}
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

                  {/* AI Disagreement Section */}
                  {aiAssessment && (
                    <div className="col-span-full space-y-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="disagreesWithAi"
                          checked={evaluation.disagreesWithAi}
                          onChange={(e) => setEvaluation(prev => ({ ...prev, disagreesWithAi: e.target.checked }))}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <Label htmlFor="disagreesWithAi" className="font-semibold text-amber-900 cursor-pointer">
                          I disagree with the AI assessment
                        </Label>
                      </div>
                      {evaluation.disagreesWithAi && (
                        <div className="space-y-2">
                          <Label htmlFor="aiDisagreementReason" className="text-amber-900">
                            Please explain why you disagree with the AI's analysis *
                          </Label>
                          <Textarea
                            id="aiDisagreementReason"
                            value={evaluation.aiDisagreementReason}
                            onChange={(e) => setEvaluation(prev => ({ ...prev, aiDisagreementReason: e.target.value }))}
                            placeholder="E.g., AI underestimated structural damage, missed paint work, overestimated labor hours, etc."
                            rows={4}
                            required={evaluation.disagreesWithAi}
                            className="bg-white"
                          />
                          <p className="text-xs text-amber-700">
                            Your professional judgment helps improve the AI model. This feedback will be reviewed by the Risk Manager.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

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
                    <Badge>{claim.status?.replace(/_/g, " ") || "unknown".toUpperCase()}</Badge>
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

            {/* Police Report */}
            <PoliceReportForm claimId={claimId} />

            {/* Vehicle Market Valuation */}
            <VehicleValuationCard claimId={claimId} />
          </div>
        </div>
      </main>
    </div>
  );
}
