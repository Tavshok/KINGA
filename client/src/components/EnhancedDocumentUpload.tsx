import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  RefreshCw,
  File
} from "lucide-react";
import { toast } from "sonner";

interface UploadError {
  type: "validation" | "network" | "server" | "extraction";
  message: string;
  details?: string;
  retryable: boolean;
}

interface EnhancedDocumentUploadProps {
  onSuccess: (data: any) => void;
  onError?: (error: UploadError) => void;
  acceptedFileTypes?: string[];
  maxFileSizeMB?: number;
  uploadEndpoint?: string;
}

export function EnhancedDocumentUpload({
  onSuccess,
  onError,
  acceptedFileTypes = ["application/pdf"],
  maxFileSizeMB = 10,
  uploadEndpoint = "/api/upload-assessment"
}: EnhancedDocumentUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState("");
  const [uploadError, setUploadError] = useState<UploadError | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  const validateFile = (file: File): UploadError | null => {
    // Check file type
    if (!acceptedFileTypes.includes(file.type)) {
      return {
        type: "validation",
        message: "Invalid file type",
        details: `Please select a ${acceptedFileTypes.join(", ")} file. Selected: ${file.type}`,
        retryable: false
      };
    }

    // Check file size
    const maxSizeBytes = maxFileSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return {
        type: "validation",
        message: "File too large",
        details: `File size must be less than ${maxFileSizeMB}MB. Selected file: ${(file.size / 1024 / 1024).toFixed(2)}MB`,
        retryable: false
      };
    }

    // Check file name
    if (file.name.length > 200) {
      return {
        type: "validation",
        message: "File name too long",
        details: "File name must be less than 200 characters",
        retryable: false
      };
    }

    return null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset previous state
    setUploadError(null);
    setUploadSuccess(false);
    setUploadProgress(0);
    setProcessingStage("");

    // Validate file
    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError);
      toast.error(validationError.message, {
        description: validationError.details
      });
      return;
    }

    setSelectedFile(file);
    toast.success("File selected", {
      description: `${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`
    });
  };

  const performUpload = async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev < 90) {
          const increment = Math.random() * 10;
          const newProgress = Math.min(prev + increment, 90);
          
          // Update stage based on progress
          if (newProgress > 20 && newProgress < 40) {
            setProcessingStage("Extracting images from PDF...");
          } else if (newProgress >= 40 && newProgress < 60) {
            setProcessingStage("Running physics validation...");
          } else if (newProgress >= 60 && newProgress < 80) {
            setProcessingStage("Analyzing fraud indicators...");
          } else if (newProgress >= 80) {
            setProcessingStage("Generating comprehensive report...");
          }
          
          return newProgress;
        }
        return prev;
      });
    }, 800);

    try {
      const response = await fetch(uploadEndpoint, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        // Handle different HTTP error codes
        if (response.status === 413) {
          throw {
            type: "server",
            message: "File too large for server",
            details: "The server rejected the file size. Try a smaller file.",
            retryable: false
          } as UploadError;
        }

        if (response.status === 401 || response.status === 403) {
          throw {
            type: "server",
            message: "Authentication error",
            details: "You don't have permission to upload files. Please log in again.",
            retryable: false
          } as UploadError;
        }

        if (response.status >= 500) {
          throw {
            type: "server",
            message: "Server error",
            details: `Server returned error ${response.status}. This may be temporary.`,
            retryable: true
          } as UploadError;
        }

        // Try to parse error message from response
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const error = await response.json();
          throw {
            type: "server",
            message: error.message || 'Upload failed',
            details: error.details || `HTTP ${response.status}`,
            retryable: response.status >= 500
          } as UploadError;
        }

        throw {
          type: "server",
          message: `Upload failed (${response.status})`,
          details: response.statusText,
          retryable: response.status >= 500
        } as UploadError;
      }

      // Guard against non-JSON responses (e.g. HTML 413 from body-parser)
      const contentType = response.headers.get("content-type");
      let data: any;
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw {
          type: "server",
          message: "Unexpected response from server",
          details: text.slice(0, 200),
          retryable: false,
        } as UploadError;
      }

      // Check if extraction was successful
      if (!data || typeof data !== 'object') {
        throw {
          type: "extraction",
          message: "Invalid response from server",
          details: "Server returned unexpected data format",
          retryable: true
        } as UploadError;
      }

      setUploadProgress(100);
      setProcessingStage("Complete!");
      
      return data;

    } catch (error: any) {
      clearInterval(progressInterval);
      
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw {
          type: "network",
          message: "Network error",
          details: "Could not connect to server. Check your internet connection.",
          retryable: true
        } as UploadError;
      }

      // Re-throw UploadError objects
      if (error.type && error.message) {
        throw error;
      }

      // Unknown error
      throw {
        type: "server",
        message: "Upload failed",
        details: error.message || "An unknown error occurred",
        retryable: true
      } as UploadError;
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a file first");
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    setProcessingStage("Uploading PDF...");
    setUploadError(null);

    try {
      const data = await performUpload(selectedFile);
      
      setUploadSuccess(true);
      setRetryCount(0);
      toast.success("Upload successful!", {
        description: "Assessment analyzed successfully"
      });
      
      onSuccess(data);

    } catch (error: any) {
      const uploadError = error as UploadError;
      setUploadError(uploadError);
      setUploading(false);
      setUploadProgress(0);
      setProcessingStage("");
      
      toast.error(uploadError.message, {
        description: uploadError.details
      });

      if (onError) {
        onError(uploadError);
      }
    }
  };

  const handleRetry = () => {
    if (retryCount >= maxRetries) {
      toast.error("Maximum retries exceeded", {
        description: "Please try again later or contact support"
      });
      return;
    }

    setRetryCount(retryCount + 1);
    setUploadError(null);
    handleUpload();
  };

  const handleReset = () => {
    setSelectedFile(null);
    setUploading(false);
    setUploadProgress(0);
    setProcessingStage("");
    setUploadError(null);
    setUploadSuccess(false);
    setRetryCount(0);
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* File Selection */}
        <div>
          <Label htmlFor="file-upload" className="text-base font-semibold mb-2 block">
            Select Assessment Document
          </Label>
          <div className="flex items-center gap-4">
            <Input
              id="file-upload"
              type="file"
              accept={acceptedFileTypes.join(",")}
              onChange={handleFileSelect}
              disabled={uploading || uploadSuccess}
              className="flex-1"
            />
            {selectedFile && !uploading && !uploadSuccess && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
              >
                Clear
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Accepted: PDF files up to {maxFileSizeMB}MB
          </p>
        </div>

        {/* Selected File Info */}
        {selectedFile && !uploadSuccess && (
          <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <File className="w-8 h-8 text-primary" />
            <div className="flex-1">
              <p className="font-medium text-secondary">{selectedFile.name}</p>
              <p className="text-sm text-primary/90">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
        )}

        {/* Upload Progress */}
        {uploading && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{processingStage}</span>
              <span className="text-muted-foreground">{Math.round(uploadProgress)}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Processing... This may take a minute.</span>
            </div>
          </div>
        )}

        {/* Error Display */}
        {uploadError && (
          <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg space-y-3">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-900 dark:text-red-200">{uploadError.message}</p>
                {uploadError.details && (
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">{uploadError.details}</p>
                )}
              </div>
            </div>
            
            {uploadError.retryable && retryCount < maxRetries && (
              <div className="flex items-center justify-between pt-2 border-t border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300">
                  Retry attempt {retryCount} of {maxRetries}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  className="border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-100 dark:bg-red-900/30"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry Upload
                </Button>
              </div>
            )}

            {(!uploadError.retryable || retryCount >= maxRetries) && (
              <div className="pt-2 border-t border-red-200 dark:border-red-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-100 dark:bg-red-900/30"
                >
                  Select Different File
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Success Display */}
        {uploadSuccess && (
          <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div className="flex-1">
                <p className="font-semibold text-green-900 dark:text-green-200">Upload Successful!</p>
                <p className="text-sm text-green-700 dark:text-green-300">Assessment analyzed and ready for review</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-100 dark:bg-green-900/30"
              >
                Upload Another
              </Button>
            </div>
          </div>
        )}

        {/* Upload Button */}
        {selectedFile && !uploading && !uploadSuccess && !uploadError && (
          <Button
            onClick={handleUpload}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            size="lg"
          >
            <Upload className="w-5 h-5 mr-2" />
            Upload and Analyze
          </Button>
        )}
      </div>
    </Card>
  );
}
