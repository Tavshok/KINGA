import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, FileText, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { generateDamageReportPDF } from "@/lib/pdfExport";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function BatchExport() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedClaims, setSelectedClaims] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  // Fetch all claims
  const { data: submittedClaims = [] } = trpc.claims.byStatus.useQuery({ status: 'submitted' });
  const { data: triageClaims = [] } = trpc.claims.byStatus.useQuery({ status: 'triage' });
  const { data: assessmentClaims = [] } = trpc.claims.byStatus.useQuery({ status: 'assessment_in_progress' });
  const { data: comparisonClaims = [] } = trpc.claims.byStatus.useQuery({ status: 'comparison' });
  const { data: completedClaims = [] } = trpc.claims.byStatus.useQuery({ status: 'completed' });

  // Combine all claims
  const allClaims = [
    ...submittedClaims,
    ...triageClaims,
    ...assessmentClaims,
    ...comparisonClaims,
    ...completedClaims
  ];

  // Fetch all AI assessments
  const { data: aiAssessments = [] } = trpc.aiAssessments.all.useQuery();

  const toggleClaim = (claimId: number) => {
    const newSelected = new Set(selectedClaims);
    if (newSelected.has(claimId)) {
      newSelected.delete(claimId);
    } else {
      newSelected.add(claimId);
    }
    setSelectedClaims(newSelected);
  };

  const selectAll = () => {
    if (selectedClaims.size === allClaims.length) {
      setSelectedClaims(new Set());
    } else {
      setSelectedClaims(new Set(allClaims.map((c: any) => c.id)));
    }
  };

  const handleBatchExport = async () => {
    if (selectedClaims.size === 0) {
      toast.error("Please select at least one claim to export");
      return;
    }

    setIsExporting(true);

    try {
      let exportedCount = 0;

      for (const claimId of Array.from(selectedClaims)) {
        const claim = allClaims.find((c: any) => c.id === claimId);
        const aiAssessment = aiAssessments.find((a: any) => a.claimId === claimId);

        if (!claim || !aiAssessment) {
          console.warn(`Skipping claim ${claimId}: missing data`);
          continue;
        }

        // Parse damaged components
        const damagedComponents = aiAssessment.detectedDamageTypes 
          ? JSON.parse(aiAssessment.detectedDamageTypes) 
          : [];

        // Component categories for categorization
        const componentCategories = {
          "Exterior Panels": ["fender", "bumper", "door", "hood", "trunk", "quarter panel", "rocker panel"],
          "Lighting": ["headlight", "taillight", "fog light", "turn signal"],
          "Glass": ["windshield", "window", "mirror"],
          "Structural": ["frame", "pillar", "subframe", "crossmember"],
          "Mechanical": ["radiator", "condenser", "suspension", "wheel", "tire", "axle"],
          "Interior": ["dashboard", "airbag", "seat", "console"],
        };

        // Categorize detected components
        const categorizedDamage: Record<string, string[]> = {};
        Object.entries(componentCategories).forEach(([category, keywords]) => {
          const matchedComponents = damagedComponents.filter((comp: string) =>
            keywords.some(keyword => comp.toLowerCase().includes(keyword))
          );
          if (matchedComponents.length > 0) {
            categorizedDamage[category] = matchedComponents;
          }
        });

        // Infer hidden damage
        const inferredHiddenDamage: Array<{ component: string; reason: string; confidence: string }> = [];
        const damageDescription = aiAssessment.damageDescription || "";
        
        if (damagedComponents.some((c: string) => c.toLowerCase().includes("bumper") || c.toLowerCase().includes("fender"))) {
          if ((aiAssessment as any).accidentType === "frontal" || damageDescription.toLowerCase().includes("front")) {
            inferredHiddenDamage.push({
              component: "Radiator / AC Condenser",
              reason: "Front-end impact typically damages cooling system components",
              confidence: "High"
            });
            inferredHiddenDamage.push({
              component: "Front Subframe / Crash Bar",
              reason: "Significant frontal collision often affects structural supports",
              confidence: "Medium"
            });
          }
        }

        if ((aiAssessment as any).accidentType?.includes("side")) {
          inferredHiddenDamage.push({
            component: "Door Intrusion Beam",
            reason: "Side impact typically damages internal door reinforcement",
            confidence: "High"
          });
          if (damagedComponents.some((c: string) => c.toLowerCase().includes("door"))) {
            inferredHiddenDamage.push({
              component: "B-Pillar / Side Structure",
              reason: "Severe door damage may indicate pillar deformation",
              confidence: "Medium"
            });
          }
        }

        if ((aiAssessment as any).accidentType === "rollover") {
          inferredHiddenDamage.push({
            component: "Roof Structure / Pillars",
            reason: "Rollover accidents cause structural deformation",
            confidence: "High"
          });
        }

        if ((aiAssessment as any).structuralDamage) {
          inferredHiddenDamage.push({
            component: "Frame / Unibody Structure",
            reason: "AI detected structural damage indicators",
            confidence: "High"
          });
        }

        if ((aiAssessment as any).airbagDeployment) {
          inferredHiddenDamage.push({
            component: "Airbag Control Module / Sensors",
            reason: "Airbag deployment requires system replacement",
            confidence: "High"
          });
        }

        // Generate PDF
        generateDamageReportPDF({
          claimNumber: claim.claimNumber,
          vehicle: `${claim.vehicleMake} ${claim.vehicleModel} (${claim.vehicleYear})`,
          registration: claim.vehicleRegistration || "",
          incidentDate: (claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString() : "N/A"),
          accidentType: (aiAssessment as any).accidentType || "unknown" as string,
          damagedComponents,
          categorizedDamage,
          inferredHiddenDamage,
          structuralDamage: (aiAssessment as any).structuralDamage || false,
          airbagDeployment: (aiAssessment as any).airbagDeployment || false,
          estimatedCost: aiAssessment.estimatedCost || 0,
          partsCost: (aiAssessment as any).partsCost || (aiAssessment.estimatedCost || 0) * 0.6,
          laborCost: (aiAssessment as any).laborCost || (aiAssessment.estimatedCost || 0) * 0.4,
          damageDescription: aiAssessment.damageDescription || "",
        });

        exportedCount++;

        // Add small delay between exports to prevent browser freezing
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      toast.success(`Successfully exported ${exportedCount} damage reports!`);
      setSelectedClaims(new Set());
    } catch (error) {
      console.error("Batch export error:", error);
      toast.error("Failed to export some reports. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      submitted: { label: "Submitted", variant: "secondary" },
      triage: { label: "Triage", variant: "default" },
      assessment_in_progress: { label: "Assessment", variant: "default" },
      comparison: { label: "Comparison", variant: "default" },
      completed: { label: "Completed", variant: "outline" },
    };

    const config = statusConfig[status] || { label: status, variant: "secondary" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => setLocation("/insurer/dashboard")}>
            ← Back to Dashboard
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <FileText className="h-6 w-6" />
                  Batch Export Damage Reports
                </CardTitle>
                <CardDescription>
                  Select claims to export damage component breakdown reports in bulk
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={selectAll}
                  disabled={allClaims.length === 0}
                >
                  {selectedClaims.size === allClaims.length ? "Deselect All" : "Select All"}
                </Button>
                <Button
                  onClick={handleBatchExport}
                  disabled={selectedClaims.size === 0 || isExporting}
                  className="gradient-primary text-white"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Exporting {selectedClaims.size} Reports...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Export {selectedClaims.size} Selected
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {allClaims.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p>No claims available for export</p>
                <p className="text-sm mt-2">Claims with AI assessments will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allClaims.map((claim: any) => {
                  const aiAssessment = aiAssessments.find((a: any) => a.claimId === claim.id);
                  const hasAssessment = !!aiAssessment;

                  return (
                    <div
                      key={claim.id}
                      className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all ${
                        selectedClaims.has(claim.id)
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      } ${!hasAssessment ? "opacity-50" : ""}`}
                    >
                      <Checkbox
                        checked={selectedClaims.has(claim.id)}
                        onCheckedChange={() => toggleClaim(claim.id)}
                        disabled={!hasAssessment}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <p className="font-semibold">{claim.claimNumber}</p>
                          {getStatusBadge(claim.status)}
                          {hasAssessment && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              AI Assessment Available
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          {claim.vehicleMake} {claim.vehicleModel} ({claim.vehicleYear}) • {claim.vehicleRegistration}
                        </p>
                        {claim.incidentDate && (
                          <p className="text-xs text-gray-500 mt-1">
                            Incident: {new Date(claim.incidentDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      {hasAssessment && (
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-700">
                            ${((aiAssessment.estimatedCost || 0) / 100).toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-500">Estimated Cost</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
