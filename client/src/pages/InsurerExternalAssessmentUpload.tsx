import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

export default function InsurerExternalAssessmentUpload() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);

  const uploadAssessment = trpc.insurers.uploadExternalAssessment.useMutation({
    onSuccess: (data) => {
      toast.success("Assessment uploaded and analyzed successfully!");
      setExtractedData(data);
      setUploading(false);
      
      // Redirect to results page with extracted data
      setLocation("/assessment-results", {
        state: { extractedData: data }
      });
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
      setUploading(false);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast.error("Please select a PDF file");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      setSelectedFile(file);
      setExtractedData(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a file first");
      return;
    }

    setUploading(true);

    // Convert file to base64
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      const base64Data = base64.split(",")[1]; // Remove data:application/pdf;base64, prefix

      uploadAssessment.mutate({
        fileName: selectedFile.name,
        fileData: base64Data,
      });
    };
    reader.readAsDataURL(selectedFile);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50">
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
                onClick={() => setLocation("/insurer/dashboard")}
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
              {/* File Upload */}
              <div className="space-y-2">
                <Label htmlFor="assessment-file">Assessment Document (PDF)</Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="assessment-file"
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileSelect}
                    disabled={uploading}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleUpload}
                    disabled={!selectedFile || uploading}
                    className="min-w-[120px]"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload & Analyze
                      </>
                    )}
                  </Button>
                </div>
                {selectedFile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-blue-900">What happens after upload:</p>
                <ul className="text-sm text-blue-800 space-y-1 ml-4 list-disc">
                  <li>AI extracts vehicle information, damage details, and photos from the PDF</li>
                  <li>Automatic damage assessment with component-level analysis</li>
                  <li>Physics-based validation of accident dynamics and forces</li>
                  <li>Fraud detection with impossible damage pattern analysis</li>
                  <li>Side-by-side comparison: Original Assessment vs KINGA AI Analysis</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Extracted Data Preview */}
          {extractedData && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Analysis Complete
                </CardTitle>
                <CardDescription>
                  AI has analyzed the uploaded assessment document
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Claim Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Claim Number</Label>
                    <p className="font-mono text-sm">{extractedData.claimNumber}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Vehicle Registration</Label>
                    <p className="font-semibold">{extractedData.vehicleRegistration}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Vehicle</Label>
                    <p>{extractedData.vehicleMake} {extractedData.vehicleModel} ({extractedData.vehicleYear})</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Photos Extracted</Label>
                    <p>{extractedData.photosExtracted || 0} photo(s)</p>
                  </div>
                </div>

                {/* AI Analysis Status */}
                <div className="space-y-2">
                  <Label>AI Analysis Status</Label>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Damage Assessment Complete
                    </Badge>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Physics Validation Complete
                    </Badge>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Fraud Detection Complete
                    </Badge>
                  </div>
                </div>

                {/* View Comparison Button */}
                <div className="pt-4">
                  <Button
                    onClick={() => setLocation(`/insurer/claims/${extractedData.claimId}/comparison`)}
                    className="w-full"
                  >
                    View Detailed Comparison Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
