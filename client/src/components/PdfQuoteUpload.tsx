import { useState } from "react";
import { Upload, FileText, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
// Toast notifications will be handled by parent component

interface ExtractedQuoteData {
  laborCost: number;
  partsCost: number;
  laborHours: number;
  estimatedDuration: number;
  components: Array<{
    name: string;
    partCost: number;
    laborCost: number;
    laborHours: number;
  }>;
  notes?: string;
}

interface PdfQuoteUploadProps {
  claimId: number;
  onExtracted: (data: ExtractedQuoteData) => void;
}

export function PdfQuoteUpload({ claimId, onExtracted }: PdfQuoteUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedQuoteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Toast function passed from parent
  const uploadMutation = trpc.panelBeaters.uploadQuotePdf.useMutation();
  const extractMutation = trpc.panelBeaters.extractQuoteFromPdf.useMutation();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.includes('pdf') && !file.type.includes('image')) {
      setError("Please upload a PDF or image file (JPG, PNG)");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB");
      return;
    }

    setUploadedFile(file);
    setError(null);
    
    // Start upload and extraction
    await handleUploadAndExtract(file);
  };

  const handleUploadAndExtract = async (file: File) => {
    setUploading(true);
    setExtracting(false);
    setError(null);

    try {
      // Convert file to base64
      const base64 = await fileToBase64(file);
      
      // Upload to S3
      const uploadResult = await uploadMutation.mutateAsync({
        claimId,
        fileName: file.name,
        fileData: base64,
        mimeType: file.type,
      });

      setUploading(false);
      setExtracting(true);

      // Extract quote data using AI
      const extractedData = await extractMutation.mutateAsync({
        fileUrl: uploadResult.url,
        mimeType: file.type,
      });

      setExtracting(false);
      setExtractedData(extractedData);
      onExtracted(extractedData);

      console.log("Quote extracted successfully", extractedData);
    } catch (err: any) {
      setUploading(false);
      setExtracting(false);
      setError(err.message || "Failed to process quote document");
      console.error("Extraction failed", err);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        // Remove data:image/png;base64, prefix
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Quote Document
        </CardTitle>
        <CardDescription>
          Upload a PDF or image of your handwritten or typed quote. Our AI will automatically extract the details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Area */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary transition-colors">
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={handleFileSelect}
            className="hidden"
            id="quote-pdf-upload"
            disabled={uploading || extracting}
          />
          <label
            htmlFor="quote-pdf-upload"
            className="cursor-pointer flex flex-col items-center gap-2"
          >
            {uploading || extracting ? (
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
            ) : uploadedFile && extractedData ? (
              <CheckCircle className="h-12 w-12 text-green-600" />
            ) : error ? (
              <XCircle className="h-12 w-12 text-red-600" />
            ) : (
              <FileText className="h-12 w-12 text-gray-400" />
            )}
            
            <div className="mt-2">
              {uploading && <p className="text-sm font-medium">Uploading document...</p>}
              {extracting && <p className="text-sm font-medium">Extracting quote details with AI...</p>}
              {uploadedFile && extractedData && (
                <p className="text-sm font-medium text-green-600">Quote extracted successfully!</p>
              )}
              {error && <p className="text-sm font-medium text-red-600">{error}</p>}
              {!uploading && !extracting && !uploadedFile && (
                <>
                  <p className="text-sm font-medium">Click to upload or drag and drop</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF or Image (JPG, PNG) up to 10MB
                  </p>
                </>
              )}
            </div>
          </label>
        </div>

        {/* Extracted Data Preview */}
        {extractedData && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-green-900 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Extracted Quote Details
            </h4>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Labor Cost</p>
                <p className="font-medium">${(extractedData.laborCost / 100).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Parts Cost</p>
                <p className="font-medium">${(extractedData.partsCost / 100).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Labor Hours</p>
                <p className="font-medium">{extractedData.laborHours} hrs</p>
              </div>
              <div>
                <p className="text-muted-foreground">Duration</p>
                <p className="font-medium">{extractedData.estimatedDuration} days</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                Components ({extractedData.components.length})
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {extractedData.components.map((comp, idx) => (
                  <div key={idx} className="text-xs bg-white rounded px-2 py-1 flex justify-between">
                    <span>{comp.name}</span>
                    <span className="text-muted-foreground">
                      ${((comp.partCost + comp.laborCost) / 100).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {extractedData.notes && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Notes</p>
                <p className="text-xs text-gray-700 mt-1">{extractedData.notes}</p>
              </div>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setUploadedFile(null);
                setExtractedData(null);
                setError(null);
              }}
              className="w-full"
            >
              Upload Different Document
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          💡 Tip: For best results, ensure the document is clear and well-lit. The AI can read both handwritten and typed quotes.
        </p>
      </CardContent>
    </Card>
  );
}
