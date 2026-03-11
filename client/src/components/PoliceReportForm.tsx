import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface PoliceReportFormProps {
  claimId: number;
}

export default function PoliceReportForm({ claimId }: PoliceReportFormProps) {
  const [formData, setFormData] = useState({
    reportNumber: "",
    policeStation: "",
    officerName: "",
    reportDate: "",
    reportedSpeed: "",
    reportedWeather: "",
    reportedRoadCondition: "",
    accidentLocation: "",
    accidentDescription: "",
  });

  // Get existing police report
  const { data: existingReport, refetch } = trpc.policeReports.byClaim.useQuery({ claimId });

  // Create police report mutation
  const createReport = trpc.policeReports.create.useMutation({
    onSuccess: (data) => {
      if (data.speedDiscrepancy && data.speedDiscrepancy > 10) {
        toast.warning(`Police report added with speed discrepancy: ${data.speedDiscrepancy} km/h`, {
          description: "This has been flagged for fraud investigation",
        });
      } else {
        toast.success("Police report added successfully");
      }
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to add police report: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.reportNumber.trim()) {
      toast.error("Please enter a police report number");
      return;
    }

    createReport.mutate({
      claimId,
      reportNumber: formData.reportNumber,
      policeStation: formData.policeStation || undefined,
      officerName: formData.officerName || undefined,
      reportDate: formData.reportDate || undefined,
      reportedSpeed: formData.reportedSpeed ? parseInt(formData.reportedSpeed) : undefined,
      reportedWeather: formData.reportedWeather || undefined,
      reportedRoadCondition: formData.reportedRoadCondition || undefined,
      accidentLocation: formData.accidentLocation || undefined,
      accidentDescription: formData.accidentDescription || undefined,
    });
  };

  if (existingReport) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Police Report
              </CardTitle>
              <CardDescription>Official police accident report</CardDescription>
            </div>
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Report Number</Label>
              <p className="font-medium">{existingReport.reportNumber}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Police Station</Label>
              <p>{existingReport.policeStation || "N/A"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Officer Name</Label>
              <p>{existingReport.officerName || "N/A"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Report Date</Label>
              <p>
                {existingReport.reportDate
                  ? new Date(existingReport.reportDate).toLocaleDateString()
                  : "N/A"}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">Reported Speed</Label>
              <p>{existingReport.reportedSpeed ? `${existingReport.reportedSpeed} km/h` : "N/A"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Weather</Label>
              <p>{existingReport.reportedWeather || "N/A"}</p>
            </div>
          </div>

          {existingReport.accidentDescription && (
            <div>
              <Label className="text-muted-foreground">Accident Description</Label>
              <p className="text-sm mt-1">{existingReport.accidentDescription}</p>
            </div>
          )}

          {/* Cross-validation warnings with severity levels */}
          {(existingReport.speedDiscrepancy || existingReport.locationMismatch) && (
            <div className="space-y-3">
              {existingReport.speedDiscrepancy && existingReport.speedDiscrepancy > 0 && (
                <div className={
                  existingReport.speedDiscrepancy > 30 
                    ? "bg-red-50 dark:bg-red-950/30 border-2 border-red-300 dark:border-red-700 rounded-lg p-4" 
                    : existingReport.speedDiscrepancy > 20
                    ? "bg-orange-50 dark:bg-orange-950/30 border-2 border-orange-300 dark:border-orange-700 rounded-lg p-4"
                    : "bg-yellow-50 dark:bg-yellow-950/30 border-2 border-yellow-300 dark:border-yellow-700 rounded-lg p-4"
                }>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={
                      existingReport.speedDiscrepancy > 30 
                        ? "h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" 
                        : existingReport.speedDiscrepancy > 20
                        ? "h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5"
                        : "h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5"
                    } />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <strong className={
                          existingReport.speedDiscrepancy > 30 
                            ? "text-red-800 dark:text-red-200" 
                            : existingReport.speedDiscrepancy > 20
                            ? "text-orange-800 dark:text-orange-200"
                            : "text-yellow-800 dark:text-yellow-200"
                        }>
                          Speed Discrepancy: {existingReport.speedDiscrepancy} km/h
                        </strong>
                        <Badge variant={
                          existingReport.speedDiscrepancy > 30 
                            ? "destructive" 
                            : existingReport.speedDiscrepancy > 20
                            ? "default"
                            : "secondary"
                        }>
                          {existingReport.speedDiscrepancy > 30 
                            ? "Critical" 
                            : existingReport.speedDiscrepancy > 20
                            ? "High"
                            : "Medium"}
                        </Badge>
                      </div>
                      <p className={
                        existingReport.speedDiscrepancy > 30 
                          ? "text-sm text-red-700 dark:text-red-300" 
                          : existingReport.speedDiscrepancy > 20
                          ? "text-sm text-orange-700 dark:text-orange-300"
                          : "text-sm text-yellow-700 dark:text-yellow-300"
                      }>
                        {existingReport.speedDiscrepancy > 30 
                          ? "⚠️ Significant discrepancy detected. This may indicate intentional misrepresentation. Recommend immediate investigation and possible claim rejection."
                          : existingReport.speedDiscrepancy > 20
                          ? "⚠️ Notable discrepancy detected. Could be honest mistake or intentional fraud. Request clarification from claimant and review dashcam/witness statements."
                          : "ℹ️ Minor discrepancy detected. Likely an honest estimation error. Consider requesting clarification, but may not warrant fraud investigation."}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {existingReport.locationMismatch === 1 && (
                <div className="bg-orange-50 dark:bg-orange-950/30 border-2 border-orange-300 dark:border-orange-700 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <strong className="text-orange-800 dark:text-orange-200">Location Mismatch</strong>
                        <Badge variant="default">High</Badge>
                      </div>
                      <p className="text-sm text-orange-700 dark:text-orange-300">
                        ⚠️ Accident location differs between claim and police report. Verify GPS coordinates, dashcam footage, or witness statements to resolve discrepancy.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Add Police Report
        </CardTitle>
        <CardDescription>
          Enter police report details for cross-validation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="reportNumber">
                Report Number <span className="text-red-500">*</span>
              </Label>
              <Input
                id="reportNumber"
                value={formData.reportNumber}
                onChange={(e) => setFormData({ ...formData, reportNumber: e.target.value })}
                placeholder="e.g., ZRP-TAB 95/24"
                required
              />
            </div>
            <div>
              <Label htmlFor="policeStation">Police Station</Label>
              <Input
                id="policeStation"
                value={formData.policeStation}
                onChange={(e) => setFormData({ ...formData, policeStation: e.target.value })}
                placeholder="e.g., Mutare Rural ZRP"
              />
            </div>
            <div>
              <Label htmlFor="officerName">Officer Name</Label>
              <Input
                id="officerName"
                value={formData.officerName}
                onChange={(e) => setFormData({ ...formData, officerName: e.target.value })}
                placeholder="Officer name"
              />
            </div>
            <div>
              <Label htmlFor="reportDate">Report Date</Label>
              <Input
                id="reportDate"
                type="date"
                value={formData.reportDate}
                onChange={(e) => setFormData({ ...formData, reportDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="reportedSpeed">Reported Speed (km/h)</Label>
              <Input
                id="reportedSpeed"
                type="number"
                value={formData.reportedSpeed}
                onChange={(e) => setFormData({ ...formData, reportedSpeed: e.target.value })}
                placeholder="e.g., 80"
              />
            </div>
            <div>
              <Label htmlFor="reportedWeather">Weather Conditions</Label>
              <Input
                id="reportedWeather"
                value={formData.reportedWeather}
                onChange={(e) => setFormData({ ...formData, reportedWeather: e.target.value })}
                placeholder="e.g., Clear, Rainy"
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="accidentLocation">Accident Location</Label>
              <Input
                id="accidentLocation"
                value={formData.accidentLocation}
                onChange={(e) => setFormData({ ...formData, accidentLocation: e.target.value })}
                placeholder="Location as stated in police report"
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="accidentDescription">Accident Description</Label>
              <Textarea
                id="accidentDescription"
                value={formData.accidentDescription}
                onChange={(e) => setFormData({ ...formData, accidentDescription: e.target.value })}
                placeholder="Description from police report"
                rows={3}
              />
            </div>
          </div>

          <Button type="submit" disabled={createReport.isPending} className="w-full">
            {createReport.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding Report...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Add Police Report
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
