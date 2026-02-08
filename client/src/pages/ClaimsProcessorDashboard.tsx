import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, UserPlus, Clock, CheckCircle, AlertCircle, Plus } from "lucide-react";

export default function ClaimsProcessorDashboard() {
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    claimantName: "",
    claimantEmail: "",
    claimantPhone: "",
    policyNumber: "",
    vehicleRegistration: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleYear: "",
    incidentDate: "",
    incidentDescription: "",
    estimatedCost: "",
  });

  // Fetch my created claims
  const { data: myClaims, isLoading: claimsLoading, refetch: refetchClaims } = trpc.claims.myClaims.useQuery();

  // Fetch available external assessors (will be added later)
  const assessors: any[] = [];
  const assessorsLoading = false;

  // Create claim mutation
  const createClaim = trpc.claims.submit.useMutation({
    onSuccess: () => {
      toast.success("Claim Created", {
        description: "Claim has been successfully created and is pending assignment.",
      });
      setShowCreateForm(false);
      setFormData({
        claimantName: "",
        claimantEmail: "",
        claimantPhone: "",
        policyNumber: "",
        vehicleRegistration: "",
        vehicleMake: "",
        vehicleModel: "",
        vehicleYear: "",
        incidentDate: "",
        incidentDescription: "",
        estimatedCost: "",
      });
      refetchClaims();
    },
    onError: (error: any) => {
      toast.error("Error", {
        description: error.message,
      });
    },
  });

  // Assign assessor mutation
  const assignAssessor = trpc.claims.assignToAssessor.useMutation({
    onSuccess: () => {
      toast.success("Assessor Assigned", {
        description: "External assessor has been assigned to the claim.",
      });
      refetchClaims();
    },
    onError: (error: any) => {
      toast.error("Error", {
        description: error.message,
      });
    },
  });

  const handleCreateClaim = () => {
    if (!formData.claimantName || !formData.policyNumber || !formData.vehicleRegistration) {
      toast.error("Validation Error", {
        description: "Please fill in all required fields.",
      });
      return;
    }

    createClaim.mutate({
      vehicleMake: formData.vehicleMake,
      vehicleModel: formData.vehicleModel,
      vehicleYear: formData.vehicleYear ? parseInt(formData.vehicleYear) : 2020,
      vehicleRegistration: formData.vehicleRegistration,
      incidentDate: formData.incidentDate || new Date().toISOString().split('T')[0],
      incidentDescription: formData.incidentDescription || "No description provided",
      incidentLocation: "Not specified",
      damagePhotos: [],
      policyNumber: formData.policyNumber,
      selectedPanelBeaterIds: [1, 2, 3], // Default panel beaters
    });
  };

  const handleAssignAssessor = (claimId: number, assessorId: number) => {
    assignAssessor.mutate({ claimId, assessorId });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", icon: any }> = {
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
            <p className="text-slate-600 mt-1">Create and manage insurance claims</p>
          </div>
          <Button onClick={() => setShowCreateForm(!showCreateForm)} size="lg">
            <Plus className="h-5 w-5 mr-2" />
            {showCreateForm ? "Cancel" : "New Claim"}
          </Button>
        </div>

        {/* Create Claim Form */}
        {showCreateForm && (
          <Card className="shadow-lg border-l-4 border-l-blue-500">
            <CardHeader>
              <CardTitle>Create New Claim</CardTitle>
              <CardDescription>Enter claim details to initiate the assessment process</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Claimant Information */}
                <div className="space-y-2">
                  <Label htmlFor="claimantName">Claimant Name *</Label>
                  <Input
                    id="claimantName"
                    value={formData.claimantName}
                    onChange={(e) => setFormData({ ...formData, claimantName: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="claimantEmail">Claimant Email</Label>
                  <Input
                    id="claimantEmail"
                    type="email"
                    value={formData.claimantEmail}
                    onChange={(e) => setFormData({ ...formData, claimantEmail: e.target.value })}
                    placeholder="john@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="claimantPhone">Claimant Phone</Label>
                  <Input
                    id="claimantPhone"
                    value={formData.claimantPhone}
                    onChange={(e) => setFormData({ ...formData, claimantPhone: e.target.value })}
                    placeholder="+1234567890"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="policyNumber">Policy Number *</Label>
                  <Input
                    id="policyNumber"
                    value={formData.policyNumber}
                    onChange={(e) => setFormData({ ...formData, policyNumber: e.target.value })}
                    placeholder="POL-2025-001"
                  />
                </div>

                {/* Vehicle Information */}
                <div className="space-y-2">
                  <Label htmlFor="vehicleRegistration">Vehicle Registration *</Label>
                  <Input
                    id="vehicleRegistration"
                    value={formData.vehicleRegistration}
                    onChange={(e) => setFormData({ ...formData, vehicleRegistration: e.target.value })}
                    placeholder="ABC123GP"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vehicleMake">Vehicle Make</Label>
                  <Input
                    id="vehicleMake"
                    value={formData.vehicleMake}
                    onChange={(e) => setFormData({ ...formData, vehicleMake: e.target.value })}
                    placeholder="Toyota"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vehicleModel">Vehicle Model</Label>
                  <Input
                    id="vehicleModel"
                    value={formData.vehicleModel}
                    onChange={(e) => setFormData({ ...formData, vehicleModel: e.target.value })}
                    placeholder="Corolla"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vehicleYear">Vehicle Year</Label>
                  <Input
                    id="vehicleYear"
                    type="number"
                    value={formData.vehicleYear}
                    onChange={(e) => setFormData({ ...formData, vehicleYear: e.target.value })}
                    placeholder="2020"
                  />
                </div>

                {/* Incident Information */}
                <div className="space-y-2">
                  <Label htmlFor="incidentDate">Incident Date</Label>
                  <Input
                    id="incidentDate"
                    type="date"
                    value={formData.incidentDate}
                    onChange={(e) => setFormData({ ...formData, incidentDate: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="estimatedCost">Estimated Cost ($)</Label>
                  <Input
                    id="estimatedCost"
                    type="number"
                    value={formData.estimatedCost}
                    onChange={(e) => setFormData({ ...formData, estimatedCost: e.target.value })}
                    placeholder="5000"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="incidentDescription">Incident Description</Label>
                <Textarea
                  id="incidentDescription"
                  value={formData.incidentDescription}
                  onChange={(e) => setFormData({ ...formData, incidentDescription: e.target.value })}
                  placeholder="Describe the incident..."
                  rows={4}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateClaim} disabled={createClaim.isPending}>
                  {createClaim.isPending ? "Creating..." : "Create Claim"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* My Claims */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              My Claims
            </CardTitle>
            <CardDescription>Claims you have created and their current status</CardDescription>
          </CardHeader>
          <CardContent>
            {claimsLoading ? (
              <p className="text-center text-slate-500 py-8">Loading claims...</p>
            ) : myClaims && myClaims.length > 0 ? (
              <div className="space-y-3">
                {myClaims.map((claim: any) => (
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
                            <span className="font-medium">Claimant:</span> {claim.claimantName}
                          </div>
                          <div>
                            <span className="font-medium">Vehicle:</span> {claim.vehicleRegistration}
                          </div>
                          <div>
                            <span className="font-medium">Policy:</span> {claim.policyNumber}
                          </div>
                          <div>
                            <span className="font-medium">Created:</span>{" "}
                            {new Date(claim.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      {/* Assign Assessor */}
                      {claim.workflowState === "pending_assignment" && (
                        <div className="ml-4 min-w-[200px]">
                          <Label className="text-xs mb-1">Assign Assessor</Label>
                          <Select
                            onValueChange={(value) => handleAssignAssessor(claim.id, parseInt(value))}
                            disabled={assignAssessor.isPending}
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
                                    {assessor.name} ({assessor.tier})
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="none">No assessors available</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No claims created yet</p>
                <p className="text-sm text-slate-400">Click "New Claim" to create your first claim</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
