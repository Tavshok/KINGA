import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface ReportGenerationDialogProps {
  claimId: string;
  claimNumber: string;
}

export function ReportGenerationDialog({ claimId, claimNumber }: ReportGenerationDialogProps) {

  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"insurer" | "assessor" | "regulatory">("insurer");
  const [includeVisualizations, setIncludeVisualizations] = useState(true);
  const [includeSupportingEvidence, setIncludeSupportingEvidence] = useState(true);

  // Validation query
  const { data: validation, isLoading: isValidating } = trpc.reports.validate.useQuery(
    { claimId, role },
    { enabled: open }
  );

  // Generate report mutation
  const generateReport = trpc.reports.generate.useMutation({
    onSuccess: (data) => {
      // Convert base64 to blob and download
      const byteCharacters = atob(data.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`${data.filename} has been downloaded successfully.`);

      setOpen(false);
    },
    onError: (error) => {
      toast.error(`Report generation failed: ${error.message}`);
    },
  });

  const handleGenerate = () => {
    generateReport.mutate({
      claimId,
      role,
      includeVisualizations,
      includeSupportingEvidence,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileText className="mr-2 h-4 w-4" />
          Generate Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Generate Insurance Report</DialogTitle>
          <DialogDescription>
            Generate a professional PDF report for claim {claimNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Report Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="report-type">Report Type</Label>
            <Select value={role} onValueChange={(value: any) => setRole(value)}>
              <SelectTrigger id="report-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="insurer">Insurer Assessment Report</SelectItem>
                <SelectItem value="assessor">Professional Assessor Report</SelectItem>
                <SelectItem value="regulatory">Regulatory Compliance Report</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {role === "insurer" && "Comprehensive claim assessment for insurance decision-making"}
              {role === "assessor" && "Professional evaluation report with technical analysis"}
              {role === "regulatory" && "Audit-ready report with complete compliance documentation"}
            </p>
          </div>

          {/* Report Options */}
          <div className="space-y-3">
            <Label>Report Options</Label>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="visualizations"
                checked={includeVisualizations}
                onCheckedChange={(checked) => setIncludeVisualizations(checked as boolean)}
              />
              <label
                htmlFor="visualizations"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Include visualizations (charts, gauges, timelines)
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="evidence"
                checked={includeSupportingEvidence}
                onCheckedChange={(checked) => setIncludeSupportingEvidence(checked as boolean)}
              />
              <label
                htmlFor="evidence"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Include supporting evidence (damage photos)
              </label>
            </div>
          </div>

          {/* Validation Status */}
          {isValidating && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validating report data...
            </div>
          )}

          {validation && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {validation.overallStatus === "ready" && (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-green-600">Report ready to generate</span>
                  </>
                )}
                {validation.overallStatus === "warnings" && (
                  <>
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                    <span className="text-sm font-medium text-amber-600">Report can be generated with warnings</span>
                  </>
                )}
                {validation.overallStatus === "errors" && (
                  <>
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <span className="text-sm font-medium text-red-600">Report cannot be generated</span>
                  </>
                )}
              </div>

              {/* Completeness Score */}
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Completeness Score</span>
                  <span className="font-medium">{validation.dataValidation.completenessScore}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${validation.dataValidation.completenessScore}%` }}
                  />
                </div>
              </div>

              {/* Errors */}
              {validation.dataValidation.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-red-600">Errors:</p>
                  <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
                    {validation.dataValidation.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {validation.dataValidation.warnings.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-600">Warnings:</p>
                  <ul className="list-disc list-inside text-sm text-amber-600 space-y-1">
                    {validation.dataValidation.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={
              isValidating ||
              validation?.overallStatus === "errors" ||
              generateReport.isPending
            }
          >
            {generateReport.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Generate PDF
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
