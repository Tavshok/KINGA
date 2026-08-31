/**
 * PURPOSE: Render the Fleet Management route and coordinate its role-specific KINGA client experience.
 * PRIMARY CALLERS: The client route registry and authenticated user navigation.
 * NEVER: Bypass typed tRPC contracts or decide tenant, role, or workflow authority in the browser.
 */

import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Upload, Plus, Car, FileSpreadsheet, Trash2, Edit, Shield, Users, Wrench, AlertTriangle, BarChart2, UserPlus, RefreshCw, ChevronRight, CheckCircle, XCircle, Clock } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { exportFleetClaimsSummaryToPdf } from "@/lib/fleetReportExport";

export default function FleetManagement() {
  const { user } = useAuth();
  const { fmt } = useTenantCurrency();
  const [selectedFleet, setSelectedFleet] = useState<number | null>(null);
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);
  const [isCreateFleetDialogOpen, setIsCreateFleetDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isDriverDialogOpen, setIsDriverDialogOpen] = useState(false);
  const [driverForm, setDriverForm] = useState({ fleetId: "", driverEmail: "", driverLicenseNumber: "", licenseExpiry: "", licenseClass: "", hireDate: "" });
  const [activeFleetTab, setActiveFleetTab] = useState("vehicles");
  const [analysisPeriodDays, setAnalysisPeriodDays] = useState<30 | 90 | 365>(365);
  const [analysisRangeMode, setAnalysisRangeMode] = useState<"preset" | "custom">("preset");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDriver = user?.role === "fleet_driver";
  const isManager = ["fleet_manager", "fleet_admin", "admin", "platform_super_admin"].includes(user?.role ?? "");

  // Queries
  const { data: fleets, refetch: refetchFleets } = trpc.fleet.getMyFleets.useQuery();
  const { data: vehicles, refetch: refetchVehicles } = trpc.fleet.getMyVehicles.useQuery();
  const { data: drivers = [], refetch: refetchDrivers } = trpc.fleet.getMyDrivers.useQuery();
  const { data: maintenanceAlerts = [] } = trpc.fleet.getMaintenanceAlerts.useQuery({});
  const customRangeIsValid = Boolean(customStartDate && customEndDate && customStartDate <= customEndDate);
  const managerIntelligenceInput = useMemo(() => {
    if (analysisRangeMode === "custom" && customRangeIsValid) {
      return {
        periodDays: 365 as const,
        startDate: new Date(`${customStartDate}T00:00:00.000Z`).toISOString(),
        endDate: new Date(`${customEndDate}T23:59:59.999Z`).toISOString(),
      };
    }
    return { periodDays: analysisPeriodDays };
  }, [analysisPeriodDays, analysisRangeMode, customEndDate, customRangeIsValid, customStartDate]);
  const reportPeriodLabel = analysisRangeMode === "custom" && customRangeIsValid
    ? `${customStartDate} to ${customEndDate}`
    : analysisPeriodDays === 365 ? "Last 12 months" : `Last ${analysisPeriodDays} days`;
  const { data: managerIntelligence, isLoading: isIntelligenceLoading } = trpc.fleet.getManagerIntelligence.useQuery(managerIntelligenceInput, { enabled: isManager });

  const exportFleetClaimsReport = () => {
    if (!managerIntelligence) {
      toast.error("Fleet intelligence is still loading. Please try again shortly.");
      return;
    }
    const opened = exportFleetClaimsSummaryToPdf({
      periodDays: analysisPeriodDays,
      periodLabel: reportPeriodLabel,
      summary: managerIntelligence.summary,
      vehicleInsights: managerIntelligence.vehicleInsights,
      driverInsights: managerIntelligence.driverInsights,
      timeSeries: managerIntelligence.timeSeries ?? [],
    }, fmt);
    if (!opened) toast.error("Your browser blocked the report window. Please allow pop-ups and try again.");
  };

  // Mutations
  const createFleet = trpc.fleet.createFleet.useMutation({
    onSuccess: () => {
      toast.success("Fleet created successfully");
      refetchFleets();
      setIsCreateFleetDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`Failed to create fleet: ${error.message}`);
    },
  });

  const registerVehicle = trpc.fleet.registerVehicle.useMutation({
    onSuccess: () => {
      toast.success("Vehicle registered successfully");
      refetchVehicles();
      refetchFleets();
      setIsRegisterDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`Failed to register vehicle: ${error.message}`);
    },
  });

  const onboardDriver = trpc.fleet.onboardFleetDriver.useMutation({
    onSuccess: () => {
      toast.success("Fleet Driver assigned successfully. They can now access their dedicated driver workspace.");
      refetchDrivers();
      setIsDriverDialogOpen(false);
      setDriverForm({ fleetId: "", driverEmail: "", driverLicenseNumber: "", licenseExpiry: "", licenseClass: "", hireDate: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  const downloadTemplate = trpc.fleet.downloadImportTemplate.useMutation({
    onSuccess: (data) => {
      const byteCharacters = atob(data.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: data.mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Template downloaded");
    },
    onError: (error) => {
      toast.error(`Failed to download template: ${error.message}`);
    },
  });

  const bulkImport = trpc.fleet.bulkImportVehicles.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Successfully imported ${result.successCount} vehicles`);
        refetchVehicles();
        refetchFleets();
        setIsImportDialogOpen(false);
      } else {
        toast.error(`Import failed: ${result.errorCount} errors found`);
        console.error("Import errors:", result.errors);
      }
    },
    onError: (error) => {
      toast.error(`Failed to import vehicles: ${error.message}`);
    },
  });

  const exportToExcel = trpc.fleet.exportFleetToExcel.useMutation({
    onSuccess: (data) => {
      const byteCharacters = atob(data.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: data.mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Fleet data exported to Excel");
    },
    onError: (error) => {
      toast.error(`Failed to export: ${error.message}`);
    },
  });

  const exportToCSV = trpc.fleet.exportFleetToCSV.useMutation({
    onSuccess: (data) => {
      const byteCharacters = atob(data.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: data.mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Fleet data exported to CSV");
    },
    onError: (error) => {
      toast.error(`Failed to export: ${error.message}`);
    },
  });

  const deleteVehicle = trpc.fleet.deleteVehicle.useMutation({
    onSuccess: () => {
      toast.success("Vehicle deleted successfully");
      refetchVehicles();
      refetchFleets();
    },
    onError: (error) => {
      toast.error(`Failed to delete vehicle: ${error.message}`);
    },
  });

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedFleet) {
      toast.error("Please select a fleet first");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target?.result as string;
      const base64Content = base64Data.split(",")[1];
      bulkImport.mutate({ fleetId: selectedFleet, fileData: base64Content, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const handleCreateFleet = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createFleet.mutate({
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      businessType: formData.get("businessType") as any,
    });
  };

  const handleRegisterVehicle = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    registerVehicle.mutate({
      fleetId: selectedFleet || undefined,
      registrationNumber: formData.get("registrationNumber") as string,
      vin: formData.get("vin") as string || undefined,
      make: formData.get("make") as string,
      model: formData.get("model") as string,
      year: parseInt(formData.get("year") as string),
      color: formData.get("color") as string || undefined,
      fuelType: formData.get("fuelType") as any || undefined,
      transmissionType: formData.get("transmissionType") as any || undefined,
      usageType: formData.get("usageType") as any || undefined,
      purchasePrice: formData.get("purchasePrice") ? parseFloat(formData.get("purchasePrice") as string) : undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      inactive: "secondary",
      sold: "outline",
      written_off: "destructive",
      under_repair: "secondary",
    };
    return <Badge variant={variants[status] || "default"}>{status.replace("_", " ")}</Badge>;
  };

  const totalVehicles = vehicles?.length ?? 0;
  const activeVehicles = vehicles?.filter((v) => v.status === "active").length ?? 0;
  const avgRisk = vehicles && vehicles.length > 0
    ? Math.round(vehicles.reduce((a, v) => a + (v.riskScore ?? 50), 0) / vehicles.length)
    : 0;

  return (
    <div style={{ background: "var(--body-bg)", fontFamily: "Inter, sans-serif", minHeight: "100vh" }}>
      {/* ── IDENTITY STRIP ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", background: "#FFFFFF", borderBottom: "1px solid #E7E2D6", position: "sticky", top: 0, zIndex: 100, height: "52px", fontFamily: "Inter, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style={{ height: 28, width: "auto", objectFit: "contain", flexShrink: 0 }} />
          <div style={{ width: 1, height: 22, background: "#C8C4BA" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#15201A", letterSpacing: "-0.01em" }}>Fleet Management</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button title="Notifications" style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, cursor: "pointer", color: "#6B7568", background: "none", border: "none" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
        </div>
      </div>

      {/* ── HERO BAND ── */}
      <div className="p11-hero">
        <div className="p11-hero-top">
          <div>
            <div className="p11-breadcrumb">KINGA · Fleet Management</div>
            <div className="p11-hero-title">Fleet Management Portal</div>
            <div className="p11-hero-subtitle">Register, manage and track your vehicle fleet</div>
          </div>
          <div className="p11-hero-actions">
            {isManager ? (
              <button className="p11-btn-gold" onClick={() => setIsRegisterDialogOpen(true)}>
                <Car style={{ width: 13, height: 13 }} />
                Register Vehicle
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">Vehicle registration is managed by your fleet manager.</span>
            )}
          </div>
        </div>
        <div className="p11-kpi-grid">
          <div className="p11-kpi-tile headline">
            <div className="p11-kpi-label">Total Vehicles</div>
            <div className="p11-kpi-value num">{totalVehicles}</div>
            <div className="p11-kpi-delta">Across all fleets</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Active Fleets</div>
            <div className="p11-kpi-value num">{fleets?.length ?? 0}</div>
            <div className="p11-kpi-delta">Fleet groups</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Active Vehicles</div>
            <div className="p11-kpi-value num">{activeVehicles}</div>
            <div className="p11-kpi-delta">Operational</div>
          </div>
          <div className="p11-kpi-tile">
            <div className="p11-kpi-label">Avg Risk Score</div>
            <div className="p11-kpi-value num">{avgRisk}</div>
            <div className="p11-kpi-delta">Out of 100</div>
          </div>
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <nav className="p11-tab-bar">
        {[
          { id: "vehicles", label: "Vehicles", count: totalVehicles },
          { id: "drivers", label: "Drivers", count: isDriver ? undefined : (drivers?.length ?? 0) },
          { id: "maintenance", label: "Maintenance", count: (maintenanceAlerts as any[]).filter((a: any) => a.severity === 'critical').length || undefined },
          { id: "claims", label: "Claims" },
          { id: "compliance", label: "Compliance" },
          { id: "analytics", label: "Analytics" },
          { id: "bulk", label: "Bulk Operations" },
        ].map(t => (
          <div
            key={t.id}
            className={`p11-tab-item${activeFleetTab === t.id ? " active" : ""}`}
            onClick={() => setActiveFleetTab(t.id)}
          >
            {t.label}
            {t.count ? <span className="p11-tab-badge">{t.count}</span> : null}
          </div>
        ))}
      </nav>

      {/* ── BODY ── */}
      <div className="p11-body">
        <div className="p11-body-2col">
          {/* ── MAIN COLUMN ── */}
          <div>

            {/* ── Vehicles Tab ── */}
            {activeFleetTab === "vehicles" && (
              <div>
                {/* Fleet Selector */}
                {fleets && fleets.length > 0 && (
                  <div className="mb-4">
                    <Label>Filter by Fleet</Label>
                    <Select
                      value={selectedFleet?.toString() || "all"}
                      onValueChange={(value) => setSelectedFleet(value === "all" ? null : parseInt(value))}
                    >
                      <SelectTrigger className="w-[300px]">
                        <SelectValue placeholder="All Vehicles" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Vehicles</SelectItem>
                        {fleets.map((fleet) => (
                          <SelectItem key={fleet.id} value={fleet.id.toString()}>
                            {fleet.fleetName} ({fleet.totalVehicles || 0} vehicles)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Vehicles Table */}
                <div className="p11-card">
                  <div className="p11-card-header">
                    <div className="p11-card-title">
                      <Car style={{ width: 14, height: 14, color: "var(--g-600)" }} />
                      Registered Vehicles
                    </div>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>
                      {selectedFleet ? "Selected fleet" : "All fleets"}
                    </span>
                  </div>
                  <div className="p11-card-body" style={{ padding: 0 }}>
                    {vehicles && vehicles.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Registration</TableHead>
                            <TableHead>Make &amp; Model</TableHead>
                            <TableHead>Year</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Risk Score</TableHead>
                            <TableHead>Compliance</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vehicles
                            .filter((v) => !selectedFleet || v.fleetId === selectedFleet)
                            .map((vehicle) => (
                              <TableRow key={vehicle.id}>
                                <TableCell className="font-medium">{vehicle.registrationNumber}</TableCell>
                                <TableCell>{vehicle.make} {vehicle.model}</TableCell>
                                <TableCell>{vehicle.year}</TableCell>
                                <TableCell>{getStatusBadge(vehicle.status || "active")}</TableCell>
                                <TableCell>
                                  <Badge variant={vehicle.riskScore && vehicle.riskScore > 70 ? "destructive" : "default"}>
                                    {vehicle.riskScore || 50}/100
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={vehicle.maintenanceComplianceScore && vehicle.maintenanceComplianceScore < 50 ? "destructive" : "default"}>
                                    {vehicle.maintenanceComplianceScore || 70}%
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="sm">
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        if (confirm("Are you sure you want to delete this vehicle?")) {
                                          deleteVehicle.mutate({ id: vehicle.id });
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-12">
                        <Car className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No vehicles registered</h3>
                        <p className="text-muted-foreground mb-4">
                          Get started by registering your first vehicle or importing from a file
                        </p>
                        {isManager ? (
                          <Button onClick={() => setIsRegisterDialogOpen(true)}>
                            <Car className="mr-2 h-4 w-4" />
                            Register Vehicle
                          </Button>
                        ) : (
                          <p className="text-sm text-muted-foreground">Ask your fleet manager to register a vehicle.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Bulk Operations Tab ── */}
            {activeFleetTab === "bulk" && (
              <div className="p11-card">
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <FileSpreadsheet style={{ width: 14, height: 14, color: "var(--g-600)" }} />
                    Bulk Operations
                  </div>
                </div>
                <div className="p11-card-body">
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
                    Import or export vehicle data in bulk using Excel or CSV files.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <Button
                      variant="outline"
                      onClick={() => downloadTemplate.mutate()}
                      disabled={downloadTemplate.isPending}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {downloadTemplate.isPending ? "Downloading..." : "Download Template"}
                    </Button>

                    <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" disabled={!selectedFleet && (!fleets || fleets.length === 0)}>
                          <Upload className="mr-2 h-4 w-4" />
                          Import Vehicles
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Import Vehicles</DialogTitle>
                          <DialogDescription>
                            Upload an Excel or CSV file to import multiple vehicles at once
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="fleet-select">Select Fleet</Label>
                            <Select
                              value={selectedFleet?.toString() || ""}
                              onValueChange={(value) => setSelectedFleet(parseInt(value))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Choose a fleet" />
                              </SelectTrigger>
                              <SelectContent>
                                {fleets?.map((fleet) => (
                                  <SelectItem key={fleet.id} value={fleet.id.toString()}>
                                    {fleet.fleetName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="file-upload">Upload File</Label>
                            <Input
                              id="file-upload"
                              type="file"
                              accept=".xlsx,.xls,.csv"
                              ref={fileInputRef}
                              onChange={handleFileImport}
                              disabled={!selectedFleet || bulkImport.isPending}
                            />
                            <p className="text-xs text-muted-foreground">
                              Accepts Excel (.xlsx, .xls) and CSV (.csv) files
                            </p>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>

                    {selectedFleet && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => exportToExcel.mutate({ fleetId: selectedFleet })}
                          disabled={exportToExcel.isPending}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          {exportToExcel.isPending ? "Exporting..." : "Export to Excel"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => exportToCSV.mutate({ fleetId: selectedFleet })}
                          disabled={exportToCSV.isPending}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          {exportToCSV.isPending ? "Exporting..." : "Export to CSV"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>


            {/* ── Drivers Tab ── */}
            {activeFleetTab === "drivers" && (
              <div>
                <div className="p11-card">
                  <div className="p11-card-header">
                    <div className="p11-card-title">
                      <Users style={{ width: 14, height: 14, color: "var(--g-600)" }} />
                      Fleet Drivers
                      <span className="p11-badge green" style={{ marginLeft: 6 }}>{drivers.length}</span>
                    </div>
                    {isManager && <button className="p11-btn-gold" onClick={() => setIsDriverDialogOpen(true)}><UserPlus style={{ width: 13, height: 13 }} /> Assign Driver</button>}
                  </div>
                  <div className="p11-card-body" style={{ padding: 0 }}>
                    {drivers.length === 0 ? (
                      <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                        <Users style={{ width: 32, height: 32, margin: "0 auto 12px", opacity: 0.3 }} />
                        <p>No drivers registered yet.</p>
                        {isManager && <p style={{ fontSize: 11, marginTop: 4 }}>Use the Onboard Driver option to add drivers to your fleet.</p>}
                      </div>
                    ) : (
                      <table className="p11-table">
                        <thead><tr><th>Driver</th><th>License #</th><th>Class</th><th>Expiry</th><th>Fleet</th></tr></thead>
                        <tbody>
                          {drivers.map((d: any) => {
                            const expiry = d.licenseExpiry ? new Date(d.licenseExpiry) : null;
                            const isExpired = expiry && expiry < new Date();
                            const isExpiringSoon = expiry && !isExpired && (expiry.getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000;
                            return (
                              <tr key={d.id}>
                                <td><div style={{ fontWeight: 600, fontSize: 12 }}>{d.userName ?? `User #${d.userId}`}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>{d.userEmail ?? ""}</div></td>
                                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{d.driverLicenseNumber}</td>
                                <td>{d.licenseClass ?? "—"}</td>
                                <td><span className={`p11-badge ${isExpired ? "red" : isExpiringSoon ? "amber" : "green"}`}>{d.licenseExpiry ?? "—"}</span></td>
                                <td style={{ fontSize: 11, color: "var(--muted)" }}>{(d as any).fleetName ?? `Fleet #${d.fleetId}`}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Maintenance Tab ── */}
            {activeFleetTab === "maintenance" && (
              <div>
                <div className="p11-card">
                  <div className="p11-card-header">
                    <div className="p11-card-title">
                      <Wrench style={{ width: 14, height: 14, color: "var(--g-600)" }} />
                      Maintenance Alerts
                      {(maintenanceAlerts as any[]).length > 0 && <span className="p11-badge amber" style={{ marginLeft: 6 }}>{(maintenanceAlerts as any[]).length}</span>}
                    </div>
                  </div>
                  <div className="p11-card-body" style={{ padding: 0 }}>
                    {(maintenanceAlerts as any[]).length === 0 ? (
                      <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                        <CheckCircle style={{ width: 32, height: 32, margin: "0 auto 12px", color: "#059669", opacity: 0.6 }} />
                        <p>All vehicles are up to date on maintenance.</p>
                      </div>
                    ) : (
                      <table className="p11-table">
                        <thead><tr><th>Vehicle</th><th>Service</th><th>Due Date</th><th>Severity</th></tr></thead>
                        <tbody>
                          {(maintenanceAlerts as any[]).map((alert: any, i: number) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 600, fontSize: 12 }}>{alert.vehicleRegistration ?? `Vehicle #${alert.vehicleId}`}</td>
                              <td>{alert.serviceType}</td>
                              <td style={{ fontSize: 11 }}>{alert.nextDueDate ?? "—"}</td>
                              <td><span className={`p11-badge ${alert.severity === "critical" ? "red" : alert.severity === "high" ? "amber" : "green"}`}>{alert.severity ?? "low"}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Claims Tab ── */}
            {activeFleetTab === "claims" && (
              <div className="p11-card">
                <div className="p11-card-header">
                  <div className="p11-card-title"><AlertTriangle style={{ width: 14, height: 14, color: "var(--g-600)" }} />Fleet Claims & Cost Exposure</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>Vehicle registration matched</span>
                    <Select value={analysisRangeMode === "custom" ? "custom" : String(analysisPeriodDays)} onValueChange={(value) => {
                      if (value === "custom") { setAnalysisRangeMode("custom"); return; }
                      setAnalysisRangeMode("preset");
                      setAnalysisPeriodDays(Number(value) as 30 | 90 | 365);
                    }}>
                      <SelectTrigger style={{ height: 28, width: 118, fontSize: 11 }}><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem><SelectItem value="365">Last 12 months</SelectItem><SelectItem value="custom">Custom range</SelectItem></SelectContent>
                    </Select>
                    {analysisRangeMode === "custom" && <><Input aria-label="Fleet report start date" type="date" value={customStartDate} onChange={(event) => setCustomStartDate(event.target.value)} style={{ height: 28, width: 136, fontSize: 11 }} /><Input aria-label="Fleet report end date" type="date" value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} style={{ height: 28, width: 136, fontSize: 11 }} /></>}
                    <Button variant="outline" size="sm" onClick={exportFleetClaimsReport} disabled={!managerIntelligence || isIntelligenceLoading || (analysisRangeMode === "custom" && !customRangeIsValid)}>
                      <Download className="mr-1 h-3.5 w-3.5" /> Export PDF
                    </Button>
                  </div>
                </div>
                <div className="p11-card-body">
                  {!isManager ? <p style={{ color: "var(--muted)", fontSize: 13 }}>Fleet claim intelligence is available to fleet managers.</p> : isIntelligenceLoading ? <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading fleet claim intelligence…</p> : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 18 }}>
                        {[
                          { label: "Claims", value: managerIntelligence?.summary.totalClaims ?? 0 },
                          { label: "Open Claims", value: managerIntelligence?.summary.openClaims ?? 0 },
                          { label: "Cost Exposure", value: fmt(managerIntelligence?.summary.totalCostCents ?? 0) },
                          { label: "Average Claim", value: fmt(managerIntelligence?.summary.averageCostCents ?? 0) },
                        ].map((metric) => <div key={metric.label} style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)" }}><div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>{metric.label}</div><div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{metric.value}</div></div>)}
                      </div>
                      {analysisRangeMode === "custom" && !customRangeIsValid ? <div style={{ padding: "24px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Select both valid dates to run custom Fleet intelligence.</div> : (managerIntelligence?.vehicleInsights.length ?? 0) === 0 ? <div style={{ padding: "24px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}><CheckCircle style={{ width: 30, height: 30, margin: "0 auto 10px", color: "#059669", opacity: 0.7 }} /><p>No fleet-linked claims were recorded for {reportPeriodLabel.toLowerCase()}.</p></div> : <table className="p11-table"><thead><tr><th>Vehicle</th><th>Claims</th><th>Open</th><th>Cost</th><th>Risk Signal</th></tr></thead><tbody>{managerIntelligence?.vehicleInsights.map((vehicle) => <tr key={vehicle.vehicleId}><td><div style={{ fontWeight: 600 }}>{vehicle.registrationNumber}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>{vehicle.vehicle} · {vehicle.year}</div></td><td>{vehicle.claimCount}</td><td>{vehicle.openClaimCount}</td><td>{fmt(vehicle.totalCostCents)}</td><td><span className={`p11-badge ${vehicle.highRisk ? "red" : "green"}`}>{vehicle.highRisk ? (vehicle.elevatedFrequency ? "Elevated frequency" : `${vehicle.riskScore}/100 risk`) : "Within threshold"}</span></td></tr>)}</tbody></table>}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Compliance Tab ── */}
            {activeFleetTab === "compliance" && (
              <div>
                <div className="p11-card">
                  <div className="p11-card-header">
                    <div className="p11-card-title">
                      <Shield style={{ width: 14, height: 14, color: "var(--g-600)" }} />
                      Fleet Compliance
                    </div>
                  </div>
                  <div className="p11-card-body" style={{ padding: 0 }}>
                    {!vehicles || vehicles.length === 0 ? (
                      <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                        <Shield style={{ width: 32, height: 32, margin: "0 auto 12px", opacity: 0.3 }} />
                        <p>No vehicles registered yet.</p>
                      </div>
                    ) : (
                      <table className="p11-table">
                        <thead><tr><th>Vehicle</th><th>Status</th><th>Risk</th><th>Compliance</th><th>Policy Expiry</th></tr></thead>
                        <tbody>
                          {vehicles.map((v: any) => {
                            const policyExpiry = v.policyEndDate ? new Date(v.policyEndDate) : null;
                            const policyExpired = policyExpiry && policyExpiry < new Date();
                            const policyExpiringSoon = policyExpiry && !policyExpired && (policyExpiry.getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000;
                            return (
                              <tr key={v.id}>
                                <td><div style={{ fontWeight: 600, fontSize: 12 }}>{v.registrationNumber}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>{v.make} {v.model} {v.year}</div></td>
                                <td><span className={`p11-badge ${v.status === "active" ? "green" : "amber"}`}>{v.status}</span></td>
                                <td><span className={`p11-badge ${(v.riskScore ?? 50) > 70 ? "red" : (v.riskScore ?? 50) > 50 ? "amber" : "green"}`}>{v.riskScore ?? 50}/100</span></td>
                                <td><span className={`p11-badge ${(v.maintenanceComplianceScore ?? 70) >= 80 ? "green" : (v.maintenanceComplianceScore ?? 70) >= 60 ? "amber" : "red"}`}>{v.maintenanceComplianceScore ?? 70}%</span></td>
                                <td>{policyExpiry ? <span className={`p11-badge ${policyExpired ? "red" : policyExpiringSoon ? "amber" : "green"}`}>{policyExpiry.toLocaleDateString()}</span> : <span style={{ color: "var(--muted)", fontSize: 11 }}>No policy</span>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Analytics Tab ── */}
            {activeFleetTab === "analytics" && (
              <div className="p11-card">
                <div className="p11-card-header">
                  <div className="p11-card-title">
                    <BarChart2 style={{ width: 14, height: 14, color: "var(--g-600)" }} />
                    Fleet Analytics
                  </div>
                </div>
                <div className="p11-card-body">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                    {[
                      { label: "Total Vehicles", value: totalVehicles, color: "var(--g-600)" },
                      { label: "Active Vehicles", value: activeVehicles, color: "#059669" },
                      { label: "Total Drivers", value: drivers.length, color: "#2563EB" },
                      { label: "Claim Cost (12m)", value: fmt(managerIntelligence?.summary.totalCostCents ?? 0), color: "#2563EB" },
                      { label: "High-Risk Vehicles", value: managerIntelligence?.summary.highRiskVehicleCount ?? 0, color: (managerIntelligence?.summary.highRiskVehicleCount ?? 0) > 0 ? "#DC2626" : "#059669" },
                      { label: "High-Risk Drivers", value: managerIntelligence?.summary.highRiskDriverCount ?? 0, color: (managerIntelligence?.summary.highRiskDriverCount ?? 0) > 0 ? "#DC2626" : "#059669" },
                    ].map(stat => (
                      <div key={stat.label} style={{ background: "var(--surface)", borderRadius: 8, padding: "16px", border: "1px solid var(--line)" }}>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>{stat.label}</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                      </div>
                    ))}
                  </div>
                  {vehicles && vehicles.length > 0 && (
                    <div style={{ background: "var(--surface)", borderRadius: 8, padding: "16px", border: "1px solid var(--line)" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>Vehicle Status Distribution</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {["active", "inactive", "under_repair", "sold", "written_off"].map(status => {
                          const cnt = vehicles.filter((v: any) => v.status === status).length;
                          const pct = totalVehicles > 0 ? Math.round((cnt / totalVehicles) * 100) : 0;
                          if (cnt === 0) return null;
                          return (
                            <div key={status}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                                <span style={{ color: "var(--muted)", textTransform: "capitalize" }}>{status.replace("_", " ")}</span>
                                <span style={{ fontWeight: 600 }}>{cnt} ({pct}%)</span>
                              </div>
                              <div style={{ height: 6, background: "var(--line)", borderRadius: 3 }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: status === "active" ? "var(--g-600)" : status === "under_repair" ? "#D97706" : "#9CA3AF", borderRadius: 3 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {isManager && (managerIntelligence?.driverInsights.length ?? 0) > 0 && <div style={{ marginTop: 16, background: "var(--surface)", borderRadius: 8, padding: "16px", border: "1px solid var(--line)" }}><div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>Driver Claims Signals</div><table className="p11-table"><thead><tr><th>Driver</th><th>Claims</th><th>Open</th><th>Cost</th><th>Signal</th></tr></thead><tbody>{managerIntelligence?.driverInsights.map((driver) => <tr key={driver.driverId}><td><div style={{ fontWeight: 600 }}>{driver.name}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>{driver.email ?? ""}</div></td><td>{driver.claimCount}</td><td>{driver.openClaimCount}</td><td>{fmt(driver.totalCostCents)}</td><td><span className={`p11-badge ${driver.elevatedFrequency ? "red" : "green"}`}>{driver.elevatedFrequency ? "Elevated frequency" : "Within threshold"}</span></td></tr>)}</tbody></table></div>}
                  {isManager && (managerIntelligence?.timeSeries.length ?? 0) > 0 && <div style={{ marginTop: 16, background: "var(--surface)", borderRadius: 8, padding: "16px", border: "1px solid var(--line)" }}><div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: "var(--text)" }}>Cost by Period</div><table className="p11-table"><thead><tr><th>Month</th><th>Claims</th><th>Cost</th></tr></thead><tbody>{managerIntelligence?.timeSeries.map((period) => <tr key={period.period}><td>{period.period}</td><td>{period.claimCount}</td><td>{fmt(period.totalCostCents)}</td></tr>)}</tbody></table></div>}
                </div>
              </div>
            )}

          {/* ── SIDEBAR ── */}
          <div className="p11-sidebar">
            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <Car style={{ width: 14, height: 14, color: "var(--g-600)" }} />
                  Fleet Summary
                </div>
              </div>
              <div className="p11-card-body">
                {[
                  { label: "Total Vehicles", value: totalVehicles, cls: "green" },
                  { label: "Active Fleets", value: fleets?.length ?? 0, cls: "muted" },
                  { label: "Active Vehicles", value: activeVehicles, cls: "green" },
                  { label: "Avg Risk Score", value: avgRisk, cls: avgRisk > 70 ? "red" : avgRisk > 50 ? "amber" : "green" },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{row.label}</span>
                    <span className={`p11-badge ${row.cls}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p11-card">
              <div className="p11-card-header">
                <div className="p11-card-title">
                  <Shield style={{ width: 14, height: 14, color: "var(--g-600)" }} />
                  Quick Actions
                </div>
              </div>
              <div className="p11-card-body">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {isManager ? (
                    <>
                      <button className="p11-btn-gold" style={{ width: "100%", justifyContent: "center" }} onClick={() => setIsRegisterDialogOpen(true)}>
                        <Car style={{ width: 13, height: 13 }} />
                        Register Vehicle
                      </button>
                      <button className="p11-btn-outline" style={{ width: "100%", justifyContent: "center" }} onClick={() => setIsCreateFleetDialogOpen(true)}>
                        <Plus style={{ width: 13, height: 13 }} />
                        Create Fleet
                      </button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Vehicle and fleet setup is managed by your fleet manager.</p>
                  )}
                  {isManager && <button className="p11-btn-outline" style={{ width: "100%", justifyContent: "center" }} onClick={() => setIsDriverDialogOpen(true)}><UserPlus style={{ width: 13, height: 13 }} /> Assign Driver</button>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── DIALOGS ── */}

      {/* Create Fleet Dialog */}
      <Dialog open={isCreateFleetDialogOpen} onOpenChange={setIsCreateFleetDialogOpen}>
        <DialogContent>
          <form onSubmit={handleCreateFleet}>
            <DialogHeader>
              <DialogTitle>Create New Fleet</DialogTitle>
              <DialogDescription>Add a new fleet to organize your vehicles</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Fleet Name</Label>
                <Input id="name" name="name" placeholder="e.g., Mining Fleet A" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="businessType">Business Type</Label>
                <Select name="businessType" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="logistics">Logistics</SelectItem>
                    <SelectItem value="mining">Mining</SelectItem>
                    <SelectItem value="agriculture">Agriculture</SelectItem>
                    <SelectItem value="public_transport">Public Transport</SelectItem>
                    <SelectItem value="corporate">Corporate</SelectItem>
                    <SelectItem value="rental">Rental</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Input id="description" name="description" placeholder="Fleet description" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createFleet.isPending}>
                {createFleet.isPending ? "Creating..." : "Create Fleet"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDriverDialogOpen} onOpenChange={setIsDriverDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Fleet Driver</DialogTitle>
            <DialogDescription>Assign an existing registered account with the Fleet Driver role to a fleet you manage.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Fleet *</Label>
              <Select value={driverForm.fleetId} onValueChange={(fleetId) => setDriverForm({ ...driverForm, fleetId })}>
                <SelectTrigger><SelectValue placeholder="Select fleet" /></SelectTrigger>
                <SelectContent>{(fleets ?? []).map((fleet: any) => <SelectItem key={fleet.id} value={String(fleet.id)}>{fleet.fleetName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Registered Driver Email *</Label><Input type="email" value={driverForm.driverEmail} onChange={(e) => setDriverForm({ ...driverForm, driverEmail: e.target.value })} placeholder="driver@company.com" /></div>
            <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Licence Number *</Label><Input value={driverForm.driverLicenseNumber} onChange={(e) => setDriverForm({ ...driverForm, driverLicenseNumber: e.target.value })} placeholder="Licence number" /></div><div className="grid gap-2"><Label>Licence Class</Label><Input value={driverForm.licenseClass} onChange={(e) => setDriverForm({ ...driverForm, licenseClass: e.target.value })} placeholder="Class 2" /></div></div>
            <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Licence Expiry *</Label><Input type="date" value={driverForm.licenseExpiry} onChange={(e) => setDriverForm({ ...driverForm, licenseExpiry: e.target.value })} /></div><div className="grid gap-2"><Label>Hire Date</Label><Input type="date" value={driverForm.hireDate} onChange={(e) => setDriverForm({ ...driverForm, hireDate: e.target.value })} /></div></div>
          </div>
          <DialogFooter><Button disabled={!driverForm.fleetId || !driverForm.driverEmail || !driverForm.driverLicenseNumber || !driverForm.licenseExpiry || onboardDriver.isPending} onClick={() => onboardDriver.mutate({ fleetId: Number(driverForm.fleetId), driverEmail: driverForm.driverEmail, driverLicenseNumber: driverForm.driverLicenseNumber, licenseExpiry: driverForm.licenseExpiry, licenseClass: driverForm.licenseClass || undefined, hireDate: driverForm.hireDate || undefined })}>{onboardDriver.isPending ? "Assigning…" : "Assign Driver"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Register Vehicle Dialog */}
      <Dialog open={isRegisterDialogOpen} onOpenChange={setIsRegisterDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <form onSubmit={handleRegisterVehicle}>
            <DialogHeader>
              <DialogTitle>Register New Vehicle</DialogTitle>
              <DialogDescription>Add a vehicle to your fleet</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="registrationNumber">Registration Number *</Label>
                <Input id="registrationNumber" name="registrationNumber" placeholder="ABC123GP" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="make">Make *</Label>
                  <Input id="make" name="make" placeholder="Toyota" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="model">Model *</Label>
                  <Input id="model" name="model" placeholder="Hilux" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="year">Year *</Label>
                  <Input id="year" name="year" type="number" placeholder="2020" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="color">Color</Label>
                  <Input id="color" name="color" placeholder="White" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vin">VIN (Optional)</Label>
                <Input id="vin" name="vin" placeholder="1HGBH41JXMN109186" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="fuelType">Fuel Type</Label>
                  <Select name="fuelType">
                    <SelectTrigger>
                      <SelectValue placeholder="Select fuel type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="petrol">Petrol</SelectItem>
                      <SelectItem value="diesel">Diesel</SelectItem>
                      <SelectItem value="electric">Electric</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="transmissionType">Transmission</Label>
                  <Select name="transmissionType">
                    <SelectTrigger>
                      <SelectValue placeholder="Select transmission" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="automatic">Automatic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="usageType">Usage Type</Label>
                <Select name="usageType">
                  <SelectTrigger>
                    <SelectValue placeholder="Select usage type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="logistics">Logistics</SelectItem>
                    <SelectItem value="mining">Mining</SelectItem>
                    <SelectItem value="agriculture">Agriculture</SelectItem>
                    <SelectItem value="public_transport">Public Transport</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="purchasePrice">Purchase Price (USD)</Label>
                <Input id="purchasePrice" name="purchasePrice" type="number" step="0.01" placeholder="45000" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={registerVehicle.isPending}>
                {registerVehicle.isPending ? "Registering..." : "Register Vehicle"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
