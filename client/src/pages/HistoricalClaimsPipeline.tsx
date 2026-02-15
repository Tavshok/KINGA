import { useState, useCallback, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileIcon, UploadIcon, CheckCircle2, XCircle, Loader2,
  FileText, Eye, Edit2, DollarSign, BarChart3, ArrowLeft,
  Database, Brain, Shield, TrendingUp, AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

// ============================================================
// TYPES
// ============================================================

interface UploadFile {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
}

interface GroundTruthForm {
  finalDecision: string;
  finalApprovedAmount: string;
  finalLaborCost: string;
  finalPartsCost: string;
  finalPaintCost: string;
  finalSubletCost: string;
  finalBetterment: string;
  approvedByName: string;
  approvedByRole: string;
  approvalDate: string;
  assessorName: string;
  assessorLicenseNumber: string;
  assessorEstimate: string;
  repairShopName: string;
  actualRepairDuration: string;
  customerSatisfaction: string;
  approvalNotes: string;
  dataSource: string;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function HistoricalClaimsPipeline() {
  const [activeTab, setActiveTab] = useState("upload");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container py-4">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/portal-hub">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </Link>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Database className="h-6 w-6 text-primary" />
                Historical Claims Intelligence
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Ingest historical claim documents, extract structured data, and generate training datasets
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="container py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 max-w-2xl">
            <TabsTrigger value="upload" className="flex items-center gap-1.5">
              <UploadIcon className="h-4 w-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="claims" className="flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              Claims
            </TabsTrigger>
            <TabsTrigger value="ground-truth" className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" />
              Ground Truth
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="upload">
              <BulkUploadTab />
            </TabsContent>
            <TabsContent value="claims">
              <ClaimsListTab />
            </TabsContent>
            <TabsContent value="ground-truth">
              <GroundTruthTab />
            </TabsContent>
            <TabsContent value="analytics">
              <AnalyticsTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

// ============================================================
// BULK UPLOAD TAB
// ============================================================

function BulkUploadTab() {
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
      // Convert files to base64
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

      // Update file statuses
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
    <div className="space-y-6">
      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadIcon className="h-5 w-5" />
            Bulk Document Upload
          </CardTitle>
          <CardDescription>
            Upload historical claim PDFs, panel beater quotes, police reports, and assessor reports.
            The AI pipeline will extract structured data from each document.
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
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}`}
          >
            <input {...getInputProps()} />
            <UploadIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            {isDragActive ? (
              <p className="text-primary font-medium">Drop files here...</p>
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
              <div className="max-h-60 overflow-y-auto space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded bg-muted/50">
                    <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm flex-1 truncate">{f.file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {(f.file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    {f.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {f.status === "success" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {f.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                    {f.status === "pending" && (
                      <Button variant="ghost" size="sm" onClick={() => removeFile(i)}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            onClick={handleProcess}
            disabled={files.length === 0 || isProcessing}
            className="w-full"
            size="lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing through AI Pipeline...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4 mr-2" />
                Process {files.length} Document(s) through Intelligence Pipeline
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Processing Result */}
      {processingResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Processing Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="p-3 rounded bg-muted/50">
                <div className="text-2xl font-bold">{processingResult.totalDocuments}</div>
                <div className="text-xs text-muted-foreground">Total Documents</div>
              </div>
              <div className="p-3 rounded bg-green-50 dark:bg-green-950/20">
                <div className="text-2xl font-bold text-green-600">{processingResult.documentsProcessed}</div>
                <div className="text-xs text-muted-foreground">Processed</div>
              </div>
              <div className="p-3 rounded bg-red-50 dark:bg-red-950/20">
                <div className="text-2xl font-bold text-red-600">{processingResult.documentsFailed}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
              <div className="p-3 rounded bg-blue-50 dark:bg-blue-950/20">
                <div className="text-2xl font-bold text-blue-600">
                  {processingResult.historicalClaimId || "—"}
                </div>
                <div className="text-xs text-muted-foreground">Claim ID</div>
              </div>
            </div>

            {/* Extraction Summary */}
            {processingResult.extractionSummary?.length > 0 && (
              <div className="space-y-2">
                <Label>Extraction Summary</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Repair Items</TableHead>
                      <TableHead>Total Cost</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead>Handwritten</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processingResult.extractionSummary.map((s: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge variant="outline">{s.type?.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className={s.confidence > 0.7 ? "text-green-600" : s.confidence > 0.4 ? "text-yellow-600" : "text-red-600"}>
                            {(s.confidence * 100).toFixed(0)}%
                          </span>
                        </TableCell>
                        <TableCell>{s.repairItems}</TableCell>
                        <TableCell>$ {s.totalCost?.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell>
                          <Progress value={s.qualityScore} className="w-16 h-2" />
                          <span className="text-xs ml-1">{s.qualityScore}%</span>
                        </TableCell>
                        <TableCell>
                          {s.isHandwritten ? (
                            <Badge variant="secondary">Handwritten</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">Typed</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {processingResult.errors?.length > 0 && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>
                  <strong>Errors:</strong>
                  <ul className="list-disc list-inside mt-1">
                    {processingResult.errors.map((e: string, i: number) => (
                      <li key={i} className="text-sm">{e}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pipeline Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950/30">
                <Brain className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">AI-Powered OCR</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Extracts printed and handwritten content, tables, and itemised costs using LLM vision
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-950/30">
                <Shield className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Auto Classification</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Automatically detects document type: quote, police report, claim form, or assessor report
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-950/30">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Training Data</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Generates structured datasets for ML model training and assessor benchmarking
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// CLAIMS LIST TAB
// ============================================================

function ClaimsListTab() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data, isLoading } = trpc.historicalClaims.listClaims.useQuery({
    limit: 20,
    offset: page * 20,
    status: statusFilter || undefined,
  });

  const statusColors: Record<string, string> = {
    documents_uploaded: "bg-blue-100 text-blue-700",
    extraction_complete: "bg-yellow-100 text-yellow-700",
    ground_truth_captured: "bg-green-100 text-green-700",
    variance_calculated: "bg-purple-100 text-purple-700",
    ml_ready: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Historical Claims</h2>
          <p className="text-sm text-muted-foreground">
            {data?.total || 0} claims in the intelligence pipeline
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="documents_uploaded">Documents Uploaded</SelectItem>
            <SelectItem value="extraction_complete">Extraction Complete</SelectItem>
            <SelectItem value="ground_truth_captured">Ground Truth Captured</SelectItem>
            <SelectItem value="variance_calculated">Variance Calculated</SelectItem>
            <SelectItem value="ml_ready">ML Ready</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : data?.claims?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold text-lg">No Historical Claims Yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Upload historical claim documents to start building your intelligence database
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Claim Ref</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Quote</TableHead>
                <TableHead>Final Cost</TableHead>
                <TableHead>Quality</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.claims?.map((claim: any) => (
                <TableRow key={claim.id}>
                  <TableCell className="font-mono text-xs">{claim.id}</TableCell>
                  <TableCell>{claim.claimReference || "—"}</TableCell>
                  <TableCell>
                    {claim.vehicleMake && claim.vehicleModel
                      ? `${claim.vehicleMake} ${claim.vehicleModel} ${claim.vehicleYear || ""}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {claim.totalPanelBeaterQuote
                      ? `$ ${parseFloat(claim.totalPanelBeaterQuote).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {claim.finalApprovedCost
                      ? `$ ${parseFloat(claim.finalApprovedCost).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      : <Badge variant="outline" className="text-xs">Pending</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Progress value={claim.dataQualityScore || 0} className="w-12 h-2" />
                      <span className="text-xs">{claim.dataQualityScore || 0}%</span>
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

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {page * 20 + 1}–{Math.min((page + 1) * 20, data?.total || 0)} of {data?.total || 0}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * 20 >= (data?.total || 0)}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// GROUND TRUTH TAB
// ============================================================

function GroundTruthTab() {
  const [selectedClaimId, setSelectedClaimId] = useState<number | null>(null);
  const [form, setForm] = useState<GroundTruthForm>({
    finalDecision: "",
    finalApprovedAmount: "",
    finalLaborCost: "",
    finalPartsCost: "",
    finalPaintCost: "",
    finalSubletCost: "",
    finalBetterment: "",
    approvedByName: "",
    approvedByRole: "",
    approvalDate: "",
    assessorName: "",
    assessorLicenseNumber: "",
    assessorEstimate: "",
    repairShopName: "",
    actualRepairDuration: "",
    customerSatisfaction: "",
    approvalNotes: "",
    dataSource: "manual_entry",
  });

  const { data: claims } = trpc.historicalClaims.listClaims.useQuery({
    limit: 100,
    offset: 0,
    status: "extraction_complete",
  });

  const captureMutation = trpc.historicalClaims.captureGroundTruth.useMutation();

  const handleSubmit = async () => {
    if (!selectedClaimId || !form.finalDecision || !form.finalApprovedAmount) {
      toast.error("Please fill in required fields: Claim, Decision, and Final Amount");
      return;
    }

    try {
      await captureMutation.mutateAsync({
        historicalClaimId: selectedClaimId,
        finalDecision: form.finalDecision as any,
        finalApprovedAmount: parseFloat(form.finalApprovedAmount),
        finalLaborCost: form.finalLaborCost ? parseFloat(form.finalLaborCost) : undefined,
        finalPartsCost: form.finalPartsCost ? parseFloat(form.finalPartsCost) : undefined,
        finalPaintCost: form.finalPaintCost ? parseFloat(form.finalPaintCost) : undefined,
        finalSubletCost: form.finalSubletCost ? parseFloat(form.finalSubletCost) : undefined,
        finalBetterment: form.finalBetterment ? parseFloat(form.finalBetterment) : undefined,
        approvedByName: form.approvedByName || undefined,
        approvedByRole: form.approvedByRole || undefined,
        approvalDate: form.approvalDate || undefined,
        assessorName: form.assessorName || undefined,
        assessorLicenseNumber: form.assessorLicenseNumber || undefined,
        assessorEstimate: form.assessorEstimate ? parseFloat(form.assessorEstimate) : undefined,
        repairShopName: form.repairShopName || undefined,
        actualRepairDuration: form.actualRepairDuration ? parseInt(form.actualRepairDuration) : undefined,
        customerSatisfaction: form.customerSatisfaction ? parseInt(form.customerSatisfaction) : undefined,
        approvalNotes: form.approvalNotes || undefined,
        dataSource: form.dataSource as any,
      });

      toast.success("Ground truth captured", {
        description: "Variance datasets have been generated automatically",
      });

      // Reset form
      setSelectedClaimId(null);
      setForm({
        finalDecision: "", finalApprovedAmount: "", finalLaborCost: "", finalPartsCost: "",
        finalPaintCost: "", finalSubletCost: "", finalBetterment: "", approvedByName: "",
        approvedByRole: "", approvalDate: "", assessorName: "", assessorLicenseNumber: "",
        assessorEstimate: "", repairShopName: "", actualRepairDuration: "", customerSatisfaction: "",
        approvalNotes: "", dataSource: "manual_entry",
      });
    } catch (error: any) {
      toast.error("Failed to capture ground truth", { description: error.message });
    }
  };

  const updateField = (field: keyof GroundTruthForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Capture Ground Truth
          </CardTitle>
          <CardDescription>
            Record the final insurer-approved cost and repair decision for historical claims.
            This data becomes the training label for ML models and enables variance analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Claim Selection */}
          <div className="space-y-2">
            <Label>Select Historical Claim *</Label>
            <Select
              value={selectedClaimId?.toString() || ""}
              onValueChange={(v) => setSelectedClaimId(parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a claim awaiting ground truth..." />
              </SelectTrigger>
              <SelectContent>
                {claims?.claims?.map((c: any) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    #{c.id} — {c.claimReference || "No ref"} — {c.vehicleMake} {c.vehicleModel}
                    {c.totalPanelBeaterQuote ? ` — Quote: $ ${parseFloat(c.totalPanelBeaterQuote).toLocaleString("en-US")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {claims?.claims?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No claims with extraction complete. Upload and process documents first.
              </p>
            )}
          </div>

          {selectedClaimId && (
            <>
              {/* Decision & Amount */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Final Decision *</Label>
                  <Select value={form.finalDecision} onValueChange={(v) => updateField("finalDecision", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select decision..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved_repair">Approved — Repair</SelectItem>
                      <SelectItem value="approved_total_loss">Approved — Total Loss</SelectItem>
                      <SelectItem value="cash_settlement">Cash Settlement</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="withdrawn">Withdrawn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Final Approved Amount (USD) *</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 45000.00"
                    value={form.finalApprovedAmount}
                    onChange={(e) => updateField("finalApprovedAmount", e.target.value)}
                  />
                </div>
              </div>

              {/* Cost Breakdown */}
              <div>
                <Label className="text-sm font-semibold">Cost Breakdown (optional)</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Labour Cost</Label>
                    <Input type="number" placeholder="0.00" value={form.finalLaborCost} onChange={(e) => updateField("finalLaborCost", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Parts Cost</Label>
                    <Input type="number" placeholder="0.00" value={form.finalPartsCost} onChange={(e) => updateField("finalPartsCost", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Paint Cost</Label>
                    <Input type="number" placeholder="0.00" value={form.finalPaintCost} onChange={(e) => updateField("finalPaintCost", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sublet Cost</Label>
                    <Input type="number" placeholder="0.00" value={form.finalSubletCost} onChange={(e) => updateField("finalSubletCost", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Betterment</Label>
                    <Input type="number" placeholder="0.00" value={form.finalBetterment} onChange={(e) => updateField("finalBetterment", e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Assessor & Approval Info */}
              <div>
                <Label className="text-sm font-semibold">Assessor & Approval Details</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Assessor Name</Label>
                    <Input placeholder="Name" value={form.assessorName} onChange={(e) => updateField("assessorName", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Assessor License #</Label>
                    <Input placeholder="License number" value={form.assessorLicenseNumber} onChange={(e) => updateField("assessorLicenseNumber", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Assessor Estimate (USD)</Label>
                    <Input type="number" placeholder="0.00" value={form.assessorEstimate} onChange={(e) => updateField("assessorEstimate", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Approved By</Label>
                    <Input placeholder="Name" value={form.approvedByName} onChange={(e) => updateField("approvedByName", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Approval Date</Label>
                    <Input type="date" value={form.approvalDate} onChange={(e) => updateField("approvalDate", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Repair Shop</Label>
                    <Input placeholder="Panel beater name" value={form.repairShopName} onChange={(e) => updateField("repairShopName", e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Data Source */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data Source</Label>
                  <Select value={form.dataSource} onValueChange={(v) => updateField("dataSource", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual_entry">Manual Entry</SelectItem>
                      <SelectItem value="extracted_from_document">Extracted from Document</SelectItem>
                      <SelectItem value="system_import">System Import</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Any additional notes about this approval..."
                    value={form.approvalNotes}
                    onChange={(e) => updateField("approvalNotes", e.target.value)}
                    rows={2}
                  />
                </div>
              </div>

              <Button onClick={handleSubmit} disabled={captureMutation.isPending} size="lg">
                {captureMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Capturing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Capture Ground Truth & Generate Variance Datasets
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// ANALYTICS TAB
// ============================================================

function AnalyticsTab() {
  const { data: summary, isLoading } = trpc.historicalClaims.getAnalyticsSummary.useQuery();
  const { data: assessorBenchmarks } = trpc.historicalClaims.getAssessorBenchmarks.useQuery();
  const { data: vehiclePatterns } = trpc.historicalClaims.getVehicleCostPatterns.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalClaims = summary?.qualityStats?.totalClaims || 0;
  const avgQuality = summary?.qualityStats?.avgQuality ? parseFloat(String(summary.qualityStats.avgQuality)) : 0;
  const totalPredictions = summary?.accuracyStats?.totalPredictions || 0;
  const accuratePredictions = summary?.accuracyStats?.accuratePredictions || 0;
  const aiAccuracy = totalPredictions > 0 ? ((accuratePredictions / totalPredictions) * 100) : 0;
  const fraudSuspected = summary?.fraudStats?.suspected || 0;
  const outliers = summary?.fraudStats?.outliers || 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{totalClaims}</div>
            <div className="text-sm text-muted-foreground">Total Claims</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{avgQuality.toFixed(0)}%</div>
            <div className="text-sm text-muted-foreground">Avg Data Quality</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-green-600">{aiAccuracy.toFixed(1)}%</div>
            <div className="text-sm text-muted-foreground">AI Accuracy</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-red-600">{fraudSuspected}</div>
            <div className="text-sm text-muted-foreground">Fraud Suspected</div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Status Breakdown */}
      {summary?.statusCounts && summary.statusCounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {summary.statusCounts.map((s: any) => (
                <div key={s.status} className="flex items-center justify-between p-3 rounded bg-muted/50">
                  <span className="text-sm capitalize">{s.status?.replace(/_/g, " ")}</span>
                  <Badge variant="secondary">{s.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Variance Analysis */}
      {summary?.varianceStats && summary.varianceStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Average Cost Variance by Comparison Type</CardTitle>
            <CardDescription>How different cost sources compare to each other</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Comparison</TableHead>
                  <TableHead>Avg Variance %</TableHead>
                  <TableHead>Avg Absolute Variance %</TableHead>
                  <TableHead>Sample Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.varianceStats.map((v: any) => (
                  <TableRow key={v.comparisonType}>
                    <TableCell className="capitalize">{v.comparisonType?.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <span className={parseFloat(v.avgVariancePercent || "0") > 0 ? "text-red-600" : "text-green-600"}>
                        {parseFloat(v.avgVariancePercent || "0").toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>{parseFloat(v.avgAbsVariancePercent || "0").toFixed(1)}%</TableCell>
                    <TableCell>{v.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Repair vs Replace */}
      {summary?.repairActionStats && summary.repairActionStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Repair vs Replace Frequency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {summary.repairActionStats.map((r: any) => (
                <div key={r.action || "unknown"} className="flex items-center justify-between p-3 rounded bg-muted/50">
                  <span className="text-sm capitalize">{r.action || "Unknown"}</span>
                  <Badge variant="secondary">{r.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assessor Benchmarks */}
      {assessorBenchmarks && assessorBenchmarks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Assessor Performance Benchmarks
            </CardTitle>
            <CardDescription>
              Ranked by average absolute variance from final approved cost
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assessor</TableHead>
                  <TableHead>License #</TableHead>
                  <TableHead>Claims</TableHead>
                  <TableHead>Avg Variance</TableHead>
                  <TableHead>Avg Abs Variance</TableHead>
                  <TableHead>Fraud Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessorBenchmarks.map((a: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{a.assessorName || "Unknown"}</TableCell>
                    <TableCell className="text-xs font-mono">{a.assessorLicenseNumber || "—"}</TableCell>
                    <TableCell>{a.claimsAssessed}</TableCell>
                    <TableCell>
                      <span className={parseFloat(a.avgVariancePercent || "0") > 0 ? "text-red-600" : "text-green-600"}>
                        {parseFloat(a.avgVariancePercent || "0").toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>{parseFloat(a.avgAbsVariancePercent || "0").toFixed(1)}%</TableCell>
                    <TableCell>
                      {a.fraudSuspected > 0 ? (
                        <Badge variant="destructive" className="text-xs">{a.fraudSuspected}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Vehicle Cost Patterns */}
      {vehiclePatterns && vehiclePatterns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vehicle Cost Patterns</CardTitle>
            <CardDescription>Average costs by vehicle make/model</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Claims</TableHead>
                  <TableHead>Avg Quote</TableHead>
                  <TableHead>Avg Final Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehiclePatterns.map((v: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {v.vehicleMake} {v.vehicleModel || ""}
                    </TableCell>
                    <TableCell>{v.claimCount}</TableCell>
                    <TableCell>
                      {v.avgQuoteCost
                        ? `$ ${parseFloat(v.avgQuoteCost).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {v.avgFinalCost
                        ? `$ ${parseFloat(v.avgFinalCost).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {totalClaims === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold text-lg">No Analytics Data Yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Upload historical claims and capture ground truth to see analytics
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
