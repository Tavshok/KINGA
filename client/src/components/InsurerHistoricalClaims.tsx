import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileIcon, UploadIcon, CheckCircle2, XCircle, Loader2,
  FileText, Database, Search, ChevronLeft, ChevronRight
} from "lucide-react";
import { toast } from "sonner";

// ============================================================
// TYPES
// ============================================================

interface UploadFile {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
}

const statusColors: Record<string, string> = {
  documents_uploaded: "bg-primary/10 text-primary/90",
  extraction_complete: "bg-green-100 text-green-700",
  ground_truth_captured: "bg-emerald-100 text-emerald-700",
  variance_generated: "bg-purple-100 text-purple-700",
  failed: "bg-red-100 text-red-700",
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function InsurerHistoricalClaims() {
  const [activeTab, setActiveTab] = useState("upload");

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="upload" className="flex items-center gap-1.5">
            <UploadIcon className="h-4 w-4" />
            Upload PDFs
          </TabsTrigger>
          <TabsTrigger value="claims" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            Historical Claims
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="upload">
            <BulkUploadSection />
          </TabsContent>
          <TabsContent value="claims">
            <ClaimsListSection />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ============================================================
// BULK UPLOAD SECTION (Insurer can upload PDFs)
// ============================================================

function BulkUploadSection() {
  const [batchName, setBatchName] = useState("");
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingResult, setProcessingResult] = useState<any>(null);

  const uploadMutation = trpc.historicalClaims.uploadAndProcess.useMutation();

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
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
      "application/pdf": [".pdf"],
    },
    maxSize: 50 * 1024 * 1024,
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProcess = async () => {
    if (files.length === 0) {
      toast.error("No files selected");
      return;
    }

    setIsProcessing(true);
    setProcessingResult(null);

    try {
      const documents = await Promise.all(
        files.map(async (f) => {
          const buffer = await f.file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
          );
          return {
            filename: f.file.name,
            fileData: base64,
            mimeType: f.file.type,
          };
        })
      );

      setFiles((prev) => prev.map((f) => ({ ...f, status: "uploading" as const, progress: 50 })));

      const result = await uploadMutation.mutateAsync({
        batchName: batchName || undefined,
        documents,
      });

      setProcessingResult(result);
      setFiles((prev) =>
        prev.map((f) => ({ ...f, status: "success" as const, progress: 100 }))
      );

      toast.success("Pipeline processing complete", {
        description: `${result.documentsProcessed} documents processed, ${result.documentsFailed} failed`,
      });
    } catch (error: any) {
      toast.error("Processing failed", { description: error.message });
      setFiles((prev) => prev.map((f) => ({ ...f, status: "error" as const })));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <UploadIcon className="h-5 w-5 text-emerald-600" />
            Upload Historical Assessment PDFs
          </CardTitle>
          <CardDescription>
            Upload panel beater quotes, assessor reports, and police reports. The AI pipeline extracts structured data from each document to build your intelligence database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="batchName">Batch Name (optional)</Label>
            <Input
              id="batchName"
              placeholder="e.g., Q4 2025 Historical Claims"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              className="max-w-md mt-1"
            />
          </div>

          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
              ${isDragActive ? "border-emerald-500 bg-emerald-50" : "border-muted-foreground/25 hover:border-emerald-400/50"}`}
          >
            <input {...getInputProps()} />
            <UploadIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            {isDragActive ? (
              <p className="text-emerald-600 font-medium">Drop files here...</p>
            ) : (
              <>
                <p className="font-medium text-foreground">Drag and drop claim documents here</p>
                <p className="text-sm text-muted-foreground mt-1">
                  PDF, JPG, PNG up to 50MB each. Supports handwritten quotes.
                </p>
              </>
            )}
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{files.length} file(s) selected</Label>
                <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
                  Clear all
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded bg-muted/50">
                    <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm flex-1 truncate">{f.file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {(f.file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    {f.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />}
                    {f.status === "success" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {f.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                    {f.status === "pending" && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeFile(i)}>
                        <XCircle className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={65} className="h-2" />
                  <p className="text-sm text-muted-foreground text-center">
                    Processing documents through AI pipeline...
                  </p>
                </div>
              )}

              <Button
                onClick={handleProcess}
                disabled={isProcessing || files.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing {files.length} Document(s)...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 mr-2" />
                    Process {files.length} Document(s) Through AI Pipeline
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Processing Result */}
          {processingResult && (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span className="font-semibold text-emerald-800">Processing Complete</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Documents Processed</span>
                    <div className="text-lg font-bold text-emerald-700">{processingResult.documentsProcessed}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Failed</span>
                    <div className="text-lg font-bold text-red-600">{processingResult.documentsFailed}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <Badge className={statusColors[processingResult.pipelineStatus] || "bg-gray-100 text-gray-700"}>
                      {processingResult.pipelineStatus?.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </div>
                {processingResult.errors?.length > 0 && (
                  <div className="mt-3 p-2 bg-red-50 rounded text-sm text-red-700">
                    {processingResult.errors.map((e: string, i: number) => (
                      <div key={i}>{e}</div>
                    ))}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setFiles([]);
                    setProcessingResult(null);
                    setBatchName("");
                  }}
                >
                  Upload More Documents
                </Button>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// CLAIMS LIST SECTION (Insurer can view extracted data)
// ============================================================

function ClaimsListSection() {
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading } = trpc.historicalClaims.listClaims.useQuery({
    limit: 15,
    offset: page * 15,
  });

  const filteredClaims = data?.claims?.filter((claim: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      claim.claimReference?.toLowerCase().includes(q) ||
      claim.vehicleMake?.toLowerCase().includes(q) ||
      claim.vehicleModel?.toLowerCase().includes(q) ||
      claim.claimantName?.toLowerCase().includes(q)
    );
  }) || [];

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by claim ref, vehicle, or claimant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="secondary">{data?.total || 0} total claims</Badge>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredClaims.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold text-lg">No Historical Claims Yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Upload historical assessment PDFs to start building your intelligence database.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim Ref</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Claimant</TableHead>
                    <TableHead>Quote Amount</TableHead>
                    <TableHead>Assessor Estimate</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClaims.map((claim: any) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-medium">{claim.claimReference || "—"}</TableCell>
                      <TableCell>
                        {claim.vehicleMake && claim.vehicleModel
                          ? `${claim.vehicleMake} ${claim.vehicleModel} ${claim.vehicleYear || ""}`
                          : "—"}
                      </TableCell>
                      <TableCell>{claim.claimantName || "—"}</TableCell>
                      <TableCell>
                        {claim.totalPanelBeaterQuote
                          ? `$ ${parseFloat(claim.totalPanelBeaterQuote).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {claim.totalAssessorEstimate
                          ? `$ ${parseFloat(claim.totalAssessorEstimate).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Progress value={claim.dataQualityScore || 0} className="w-12 h-2" />
                          <span className="text-xs text-muted-foreground">{claim.dataQualityScore || 0}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${statusColors[claim.pipelineStatus] || "bg-gray-100 text-gray-700"}`}>
                          {claim.pipelineStatus?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString("en-US") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {page * 15 + 1}–{Math.min((page + 1) * 15, data?.total || 0)} of {data?.total || 0}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * 15 >= (data?.total || 0)}
                onClick={() => setPage(page + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
