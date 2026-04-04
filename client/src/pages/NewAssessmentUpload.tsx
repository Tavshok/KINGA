import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function NewAssessmentUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
      setResult(null);
    } else {
      toast.error("Please select a PDF file");
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file");
      return;
    }

    setUploading(true);
    console.log("🚀 NEW UPLOAD PAGE: Starting upload...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      console.log("🚀 NEW UPLOAD PAGE: Calling /api/upload-assessment");
      const response = await fetch("/api/upload-assessment", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      console.log("🚀 NEW UPLOAD PAGE: Response status:", response.status);
      console.log("🚀 NEW UPLOAD PAGE: Response headers:", Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }

      const data = await response.json();
      console.log("🚀 NEW UPLOAD PAGE: Response data:", data);
      console.log("🚀 NEW UPLOAD PAGE: Vehicle Make:", data.vehicleMake);
      console.log("🚀 NEW UPLOAD PAGE: Vehicle Model:", data.vehicleModel);

      setResult(data);
      toast.success("Upload successful!");
    } catch (error: any) {
      console.error("🚀 NEW UPLOAD PAGE: Error:", error);
      toast.error(error.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">New Assessment Upload (Debug Version)</h1>

        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Upload PDF</h2>
          <div className="space-y-4">
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-700 dark:text-gray-400 dark:text-muted-foreground
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-primary/5 file:text-primary/90
                hover:file:bg-primary/10"
            />
            {file && (
              <p className="text-sm text-gray-600 dark:text-muted-foreground">
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload & Process
                </>
              )}
            </Button>
          </div>
        </Card>

        {result && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Extraction Results</h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-400 dark:text-muted-foreground">Vehicle Make</p>
                  <p className="font-semibold text-lg">
                    {result.vehicleMake || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-400 dark:text-muted-foreground">Vehicle Model</p>
                  <p className="font-semibold text-lg">
                    {result.vehicleModel || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-400 dark:text-muted-foreground">Year</p>
                  <p className="font-semibold text-lg">
                    {result.vehicleYear || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-400 dark:text-muted-foreground">Registration</p>
                  <p className="font-semibold text-lg">
                    {result.vehicleRegistration || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-400 dark:text-muted-foreground">Claimant</p>
                  <p className="font-semibold text-lg">
                    {result.claimantName || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-400 dark:text-muted-foreground">Estimated Cost</p>
                  <p className="font-semibold text-lg">
                    ${result.estimatedCost?.toFixed(2) || "0.00"}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm text-gray-700 dark:text-gray-400 dark:text-muted-foreground mb-2">Full Response (JSON)</p>
                <pre className="bg-gray-100 dark:bg-muted p-4 rounded-lg overflow-auto max-h-96 text-xs">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
