import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileIcon, UploadIcon, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface UploadFile {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
}

export default function UploadDocuments() {
  const [batchName, setBatchName] = useState("");
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  // Using sonner toast

  const uploadMutation = trpc.documentIngestion.uploadDocuments.useMutation();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadFile[] = acceptedFiles.map((file) => ({
      file,
      status: "pending" as const,
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error("No files selected", {
        description: "Please add files before uploading",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Convert files to base64 for upload
      const filePromises = files.map(async ({ file }) => {
        return new Promise<{ filename: string; content: string; mimeType: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(",")[1];
            resolve({
              filename: file.name,
              content: base64,
              mimeType: file.type,
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const fileData = await Promise.all(filePromises);

      // Upload batch
      const result = await uploadMutation.mutateAsync({
        batch_name: batchName || `Batch ${new Date().toISOString()}`,
        ingestion_source: "processor_upload" as const,
        documents: fileData.map((f) => ({
          filename: f.filename,
          file_data: f.content,
          mime_type: f.mimeType,
        })),
      });

      // Update file statuses
      setFiles((prev) =>
        prev.map((f) => ({
          ...f,
          status: "success" as const,
          progress: 100,
        }))
      );

      toast.success("Upload successful", {
        description: `Uploaded ${result.uploaded} documents in batch ${result.batch_id}`,
      });

      // Redirect to Claims Processor Dashboard after short delay
      setTimeout(() => {
        window.location.href = "/insurer-portal/claims-processor";
      }, 1500);
    } catch (error) {
      console.error("Upload error:", error);
      setFiles((prev) =>
        prev.map((f) => ({
          ...f,
          status: "error" as const,
          error: error instanceof Error ? error.message : "Upload failed",
        }))
      );

      toast.error("Upload failed", {
        description: error instanceof Error ? error.message : "An error occurred during upload",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Upload Claim Documents</h1>
        <p className="text-muted-foreground mt-2">
          Upload claim forms, police reports, damage photos, and supporting documents for processing
        </p>
      </div>

      <div className="grid gap-6">
        {/* Batch Name Input */}
        <Card>
          <CardHeader>
            <CardTitle>Batch Information</CardTitle>
            <CardDescription>Provide a name for this document batch (optional)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="batchName">Batch Name</Label>
              <Input
                id="batchName"
                placeholder="e.g., Claims Batch - Feb 12, 2026"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                disabled={isUploading}
              />
            </div>
          </CardContent>
        </Card>

        {/* File Upload Dropzone */}
        <Card>
          <CardHeader>
            <CardTitle>Document Upload</CardTitle>
            <CardDescription>
              Drag and drop files or click to browse. Supports images, PDFs, Word, and Excel files (max 50MB each)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
              }`}
            >
              <input {...getInputProps()} />
              <UploadIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              {isDragActive ? (
                <p className="text-lg font-medium">Drop files here...</p>
              ) : (
                <>
                  <p className="text-lg font-medium mb-2">Drag & drop files here</p>
                  <p className="text-sm text-muted-foreground">or click to select files from your computer</p>
                </>
              )}
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Selected Files ({files.length})</h3>
                  <Button variant="outline" size="sm" onClick={() => setFiles([])} disabled={isUploading}>
                    Clear All
                  </Button>
                </div>

                <div className="space-y-2">
                  {files.map((uploadFile, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                      <FileIcon className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{uploadFile.file.name}</p>
                        <p className="text-sm text-muted-foreground">{formatFileSize(uploadFile.file.size)}</p>
                        {uploadFile.status === "uploading" && (
                          <Progress value={uploadFile.progress} className="mt-2" />
                        )}
                        {uploadFile.status === "error" && (
                          <Alert variant="destructive" className="mt-2">
                            <AlertDescription>{uploadFile.error}</AlertDescription>
                          </Alert>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {uploadFile.status === "pending" && (
                          <Button variant="ghost" size="icon" onClick={() => removeFile(index)} disabled={isUploading}>
                            <XCircle className="h-5 w-5" />
                          </Button>
                        )}
                        {uploadFile.status === "uploading" && <Loader2 className="h-5 w-5 animate-spin" />}
                        {uploadFile.status === "success" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                        {uploadFile.status === "error" && <XCircle className="h-5 w-5 text-red-600" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Button */}
            {files.length > 0 && (
              <div className="mt-6">
                <Button onClick={handleUpload} disabled={isUploading} className="w-full" size="lg">
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <UploadIcon className="mr-2 h-5 w-5" />
                      Upload {files.length} {files.length === 1 ? "Document" : "Documents"}
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
