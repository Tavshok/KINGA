import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Loader2, ArrowLeft } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useState } from "react";


export default function InsurerExternalAssessmentUpload() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const uploadAssessment = trpc.insurers.uploadExternalAssessment.useMutation({
    onSuccess: (data) => {
      console.log("✅ [PDF Upload] Upload success! Data received:", data);
      
      // Store data in sessionStorage for the results page
      sessionStorage.setItem('assessmentResults', JSON.stringify(data));
      console.log("✅ [PDF Upload] Data stored in sessionStorage");
      
      // Show success message
      toast.success("Assessment uploaded and analyzed successfully!");
      console.log("✅ [PDF Upload] Toast shown");
      
      // Redirect to results page immediately
      console.log("🚀 [PDF Upload] Attempting redirect to /assessment-results");
      setLocation("/assessment-results");
      console.log("✅ [PDF Upload] setLocation called");
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


        </div>
      </main>
    </div>
  );
}
