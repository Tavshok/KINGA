/**
 * SIMPLIFIED PDF UPLOAD PAGE - COMPLETE REBUILD
 * Clean implementation that actually works
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, FileText, Loader2, CheckCircle2 } from "lucide-react";

export default function SimpleUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== "application/pdf") {
        toast.error("Please select a PDF file");
        return;
      }
      setFile(selectedFile);
      setResult(null); // Clear previous results
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    setUploading(true);
    console.log("🚀 Starting upload...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      console.log("📤 Sending request to /api/simple-upload");
      const response = await fetch("/api/simple-upload", {
        method: "POST",
        body: formData,
      });

      console.log("📥 Response status:", response.status);
      const data = await response.json();
      console.log("📦 Response data:", data);

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      if (data.success && data.data) {
        console.log("✅ Upload successful!");
        console.log("🎯 Extracted data:", data.data);
        setResult(data.data);
        toast.success("PDF processed successfully!");
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error: any) {
      console.error("❌ Upload error:", error);
      toast.error(error.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-accent/5 to-primary/10 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-foreground mb-2">
            PDF Assessment Upload (New System)
          </h1>
          <p className="text-gray-600 dark:text-muted-foreground">
            Upload your assessment PDF and extract vehicle information
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Upload PDF</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                disabled={uploading}
                className="flex-1"
              />
              <Button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="min-w-[140px]"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload & Extract
                  </>
                )}
              </Button>
            </div>

            {file && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>
                  {file.name} ({(file.size / 1024).toFixed(0)} KB)
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {result && (
          <Card className="border-2 border-green-500 bg-green-50 dark:bg-green-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-900 dark:text-green-200">
                <CheckCircle2 className="h-6 w-6" />
                Extraction Complete!
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-white dark:bg-card rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-lg text-gray-900 dark:text-foreground">
                  Vehicle Information
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="font-medium text-gray-700 dark:text-foreground/80">Make:</span>
                    <span className="ml-2 text-gray-900 dark:text-foreground">
                      {result.vehicleMake || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700 dark:text-foreground/80">Model:</span>
                    <span className="ml-2 text-gray-900 dark:text-foreground">
                      {result.vehicleModel || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700 dark:text-foreground/80">Year:</span>
                    <span className="ml-2 text-gray-900 dark:text-foreground">
                      {result.vehicleYear || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700 dark:text-foreground/80">
                      Registration:
                    </span>
                    <span className="ml-2 text-gray-900 dark:text-foreground">
                      {result.vehicleRegistration || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700 dark:text-foreground/80">Claimant:</span>
                    <span className="ml-2 text-gray-900 dark:text-foreground">
                      {result.claimantName || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700 dark:text-foreground/80">
                      Estimated Cost:
                    </span>
                    <span className="ml-2 text-gray-900 dark:text-foreground font-semibold">
                      ${result.estimatedCost || "0"}
                    </span>
                  </div>
                </div>
              </div>

              <details className="bg-white dark:bg-card rounded-lg p-4">
                <summary className="font-semibold cursor-pointer text-gray-900 dark:text-foreground">
                  View Full JSON Response
                </summary>
                <pre className="mt-3 text-xs overflow-auto max-h-96 bg-gray-50 dark:bg-muted/50 p-3 rounded">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>

              <Button
                onClick={() => {
                  sessionStorage.setItem(
                    "assessmentResults",
                    JSON.stringify(result)
                  );
                  window.location.href = "/assessment-results";
                }}
                className="w-full"
              >
                View Full Analysis Report
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
