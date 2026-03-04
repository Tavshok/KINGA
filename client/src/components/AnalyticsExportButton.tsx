/**
 * Analytics Export Button Component
 * 
 * Provides UI for exporting fast-track analytics reports in PDF or CSV format.
 * Includes date range picker and format selection.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Download, FileText, FileSpreadsheet, Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface AnalyticsExportButtonProps {
  tenantId: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function AnalyticsExportButton({
  tenantId,
  variant = "default",
  size = "default",
}: AnalyticsExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1) // Start of current month
  );
  const [endDate, setEndDate] = useState<Date | undefined>(new Date()); // Today
  const [exportFormat, setExportFormat] = useState<"pdf" | "csv">("pdf");
  // Using sonner toast (imported above)

  const exportPDF = trpc.analytics.exportFastTrackPDF.useMutation({
    onSuccess: (data: any) => {
      // Convert base64 to blob and trigger download
      const byteCharacters = atob(data.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: data.mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Export successful: " + `PDF report downloaded as ${data.filename}`);
      setOpen(false);
    },
    onError: (error) => {
      toast.error("Export failed: " + error.message || "Failed to generate PDF report");
    },
  });

  const exportCSV = trpc.analytics.exportFastTrackCSV.useMutation({
    onSuccess: (data: any) => {
      // Create blob and trigger download
      const blob = new Blob([data.data], { type: data.mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Export successful: " + `CSV report downloaded as ${data.filename}`);
      setOpen(false);
    },
    onError: (error) => {
      toast.error("Export failed: " + error.message || "Failed to generate CSV report");
    },
  });

  const handleExport = () => {
    if (!startDate || !endDate) {
      toast.error("Invalid date range: " + "Please select both start and end dates");
      return;
    }

    if (startDate > endDate) {
      toast.error("Invalid date range: " + "Start date must be before end date");
      return;
    }

    const params = {
      tenantId,
      startDate: startDate instanceof Date ? startDate.toISOString().split("T")[0] : String(startDate),
      endDate: endDate instanceof Date ? endDate.toISOString().split("T")[0] : String(endDate),
    };

    if (exportFormat === "pdf") {
      exportPDF.mutate(params);
    } else {
      exportCSV.mutate(params);
    }
  };

  const isLoading = exportPDF.isPending || exportCSV.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <Download className="mr-2 h-4 w-4" />
          Export Report
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Export Analytics Report</DialogTitle>
          <DialogDescription>
            Generate a comprehensive fast-track analytics report with all key performance metrics.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          {/* Date Range Selection */}
          <div className="grid gap-2">
            <Label>Report Period</Label>
            <div className="grid grid-cols-2 gap-4">
              {/* Start Date */}
              <div className="grid gap-2">
                <Label htmlFor="start-date" className="text-sm text-muted-foreground">
                  Start Date
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="start-date"
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End Date */}
              <div className="grid gap-2">
                <Label htmlFor="end-date" className="text-sm text-muted-foreground">
                  End Date
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="end-date"
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Format Selection */}
          <div className="grid gap-2">
            <Label>Export Format</Label>
            <div className="grid grid-cols-2 gap-4">
              <Button
                type="button"
                variant={exportFormat === "pdf" ? "default" : "outline"}
                onClick={() => setExportFormat("pdf")}
                className="justify-start"
              >
                <FileText className="mr-2 h-4 w-4" />
                PDF Report
              </Button>
              <Button
                type="button"
                variant={exportFormat === "csv" ? "default" : "outline"}
                onClick={() => setExportFormat("csv")}
                className="justify-start"
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                CSV Data
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {exportFormat === "pdf"
                ? "Professional PDF report with tables and formatting"
                : "Raw data in CSV format for further analysis"}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? "Generating..." : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
