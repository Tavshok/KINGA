import { useLocation, Link } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, FileText, Car, DollarSign, AlertTriangle, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ExtractedData {
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleRegistration?: string;
  registration?: string;
  claimantName?: string;
  claimNumber?: string;
  damageDescription?: string;
  estimatedCost?: number;
  pdfUrl?: string;
  damagePhotos?: string[];
}

export default function AssessmentResults() {
  const [, setLocation] = useLocation();
  const [isCreatingClaim, setIsCreatingClaim] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  
  // Load data from sessionStorage on mount
  useEffect(() => {
    const storedData = sessionStorage.getItem('assessmentResults');
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
        setExtractedData(data);
        // Clear the data after loading to prevent stale data on refresh
        sessionStorage.removeItem('assessmentResults');
      } catch (error) {
        console.error('Error parsing assessment results:', error);
        toast.error('Failed to load assessment results');
        setLocation('/insurer/external-assessment');
      }
    } else {
      // No data found, redirect back to upload page
      toast.error('No assessment data found');
      setLocation('/insurer/external-assessment');
    }
  }, [setLocation]);

  // Create claim mutation
  const createClaim = trpc.claims.submit.useMutation({
    onSuccess: (data) => {
      toast.success("Claim Created Successfully", {
        description: "Claim has been created and is ready for assessor assignment.",
      });
      setIsCreatingClaim(false);
      // Redirect to claims processor dashboard
      setLocation("/claims-processor");
    },
    onError: (error: any) => {
      toast.error("Error Creating Claim", {
        description: error.message,
      });
      setIsCreatingClaim(false);
    },
  });

  const handleCreateClaim = () => {
    if (!extractedData) {
      toast.error("No Data Available", {
        description: "Assessment data is missing. Please upload again.",
      });
      return;
    }

    const vehicleReg = extractedData.vehicleRegistration || extractedData.registration;
    
    if (!vehicleReg || !extractedData.vehicleMake) {
      toast.error("Missing Required Data", {
        description: "Vehicle registration and make are required to create a claim.",
      });
      return;
    }

    setIsCreatingClaim(true);
    createClaim.mutate({
      vehicleMake: extractedData.vehicleMake || "",
      vehicleModel: extractedData.vehicleModel || "",
      vehicleYear: extractedData.vehicleYear || 2020,
      vehicleRegistration: vehicleReg,
      incidentDate: new Date().toISOString().split('T')[0],
      incidentDescription: extractedData.damageDescription || "Extracted from external assessment",
      incidentLocation: "Unknown",
      policyNumber: extractedData.claimNumber || `POL-${Date.now()}`,
      damagePhotos: extractedData.damagePhotos || [],
      selectedPanelBeaterIds: [], // Will be assigned later by claims processor
    });
  };

  // Show loading state while data is being loaded
  if (!extractedData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading assessment results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Assessment Analysis Complete
          </h1>
          <p className="text-gray-600">
            AI has successfully extracted and analyzed the assessment document
          </p>
        </div>

        {/* Extracted Data Cards */}
        <div className="grid gap-6 mb-8">
          {/* Vehicle Information */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Car className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="text-xl font-semibold">Vehicle Information</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Make & Model</p>
                <p className="font-medium">
                  {extractedData.vehicleMake} {extractedData.vehicleModel}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Year</p>
                <p className="font-medium">{extractedData.vehicleYear || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Registration</p>
                <p className="font-medium">
                  {extractedData.vehicleRegistration || extractedData.registration || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Claimant</p>
                <p className="font-medium">{extractedData.claimantName || "N/A"}</p>
              </div>
            </div>
          </Card>

          {/* Damage Assessment */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-orange-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              </div>
              <h2 className="text-xl font-semibold">Damage Description</h2>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap">
              {extractedData.damageDescription || "No damage description extracted"}
            </p>
          </Card>

          {/* Cost Estimate */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold">Estimated Repair Cost</h2>
            </div>
            <p className="text-3xl font-bold text-green-600">
              ${extractedData.estimatedCost?.toLocaleString() || "0"}
            </p>
          </Card>

          {/* Original Document */}
          {extractedData.pdfUrl && (
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <h2 className="text-xl font-semibold">Original Document</h2>
              </div>
              <a
                href={extractedData.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                View Original Assessment PDF →
              </a>
            </Card>
          )}

          {/* Extracted Photos */}
          {extractedData.damagePhotos && extractedData.damagePhotos.length > 0 && (
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <FileText className="w-5 h-5 text-indigo-600" />
                </div>
                <h2 className="text-xl font-semibold">Damage Photos</h2>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                {extractedData.damagePhotos.length} photo(s) extracted from the assessment
              </p>
              <div className="grid grid-cols-3 gap-4">
                {extractedData.damagePhotos.slice(0, 6).map((photo, index) => (
                  <div key={index} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                    <img 
                      src={photo} 
                      alt={`Damage photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
              {extractedData.damagePhotos.length > 6 && (
                <p className="text-sm text-gray-500 mt-2">
                  +{extractedData.damagePhotos.length - 6} more photos
                </p>
              )}
            </Card>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center">
          <Button
            onClick={handleCreateClaim}
            size="lg"
            disabled={isCreatingClaim}
            className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
          >
            {isCreatingClaim ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Claim...
              </>
            ) : (
              "Create Claim with This Data"
            )}
          </Button>
          <Link href="/insurer/external-assessment">
            <Button variant="outline" size="lg">
              Upload Another Assessment
            </Button>
          </Link>
          <Link href="/portal-hub">
            <Button variant="ghost" size="lg">
              Back to Portal
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
