import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, ArrowLeft } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { EnhancedDocumentUpload } from "@/components/EnhancedDocumentUpload";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useState } from "react";


export default function InsurerExternalAssessmentUpload() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [extractedResult, setExtractedResult] = useState<any>(null);

  const handleUploadSuccess = (data: any) => {
    console.log("✅ [PDF Upload] Upload success! Data received:", data);
    
    // Display result inline
    setExtractedResult(data);
    
    // Store data in sessionStorage for compatibility
    sessionStorage.setItem('assessmentResults', JSON.stringify(data));
    
    console.log("✅ [PDF Upload] Data stored and displayed");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <KingaLogo />
              <div>
                <p className="text-sm text-muted-foreground">Upload External Assessment</p>
                <p className="text-sm text-muted-foreground">Analyze assessments from external sources with AI</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setLocation("/insurer-portal")}
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
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Upload Card */}
          <Card>
            <CardHeader>
              <CardTitle>Upload External Assessment Document</CardTitle>
              <CardDescription>
                Upload damage assessment reports from external sources to get AI analysis, physics validation, and fraud detection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Enhanced Upload Component */}
              <EnhancedDocumentUpload
                onSuccess={handleUploadSuccess}
                maxFileSizeMB={10}
                uploadEndpoint="/api/upload-assessment"
              />

              {/* Instructions */}
              {!extractedResult && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-secondary">What happens after upload:</p>
                  <ul className="text-sm text-secondary space-y-1 ml-4 list-disc">
                    <li>AI extracts vehicle information, damage details, and photos from the PDF</li>
                    <li>Automatic damage assessment with component-level analysis</li>
                    <li>Physics-based validation of accident dynamics and forces</li>
                    <li>Fraud detection with impossible damage pattern analysis</li>
                    <li>Side-by-side comparison: Original Assessment vs KINGA AI Analysis</li>
                  </ul>
                </div>
              )}
              
              {/* Inline Results Display */}
              {extractedResult && (
                <div className="bg-green-50 border-2 border-green-500 rounded-lg p-6 space-y-4">
                  <h3 className="text-xl font-bold text-green-900">✅ Extraction Complete!</h3>
                  
                  <div className="bg-white rounded p-4 space-y-2">
                    <h4 className="font-semibold text-gray-900">Vehicle Information:</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="font-medium">Make:</span> {extractedResult.vehicleMake || 'N/A'}</div>
                      <div><span className="font-medium">Model:</span> {extractedResult.vehicleModel || 'N/A'}</div>
                      <div><span className="font-medium">Year:</span> {extractedResult.vehicleYear || 'N/A'}</div>
                      <div><span className="font-medium">Registration:</span> {extractedResult.vehicleRegistration || 'N/A'}</div>
                      <div><span className="font-medium">Claimant:</span> {extractedResult.claimantName || 'N/A'}</div>
                      <div><span className="font-medium">Estimated Cost:</span> ${extractedResult.estimatedCost || '0'}</div>
                    </div>
                  </div>
                  
                  <details className="bg-white rounded p-4">
                    <summary className="font-semibold cursor-pointer">View Full JSON Response</summary>
                    <pre className="text-xs mt-2 overflow-auto max-h-96 bg-gray-50 p-2 rounded">
                      {JSON.stringify(extractedResult, null, 2)}
                    </pre>
                  </details>
                  
                  <Button onClick={() => setLocation('/assessment-results')} className="w-full">
                    View Full Analysis Report
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>


        </div>
      </main>
    </div>
  );
}
