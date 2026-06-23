import { useState, useRef } from "react";
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
import { Download, Upload, Plus, Car, FileSpreadsheet, Trash2, Edit, Shield } from "lucide-react";

export default function FleetManagement() {
  const [selectedFleet, setSelectedFleet] = useState<number | null>(null);
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);
  const [isCreateFleetDialogOpen, setIsCreateFleetDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [activeFleetTab, setActiveFleetTab] = useState("vehicles");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: fleets, refetch: refetchFleets } = trpc.fleet.getMyFleets.useQuery();
  const { data: vehicles, refetch: refetchVehicles } = trpc.fleet.getMyVehicles.useQuery();

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
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 24px", background: "#fff", borderBottom: "1px solid #E5E7EB", position: "sticky", top: 0, zIndex: 50 }}>
        <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/dOfoldGKvKSMqKYG.png" alt="KINGA" style={{ height: 32, width: "auto" }} />
        <div style={{ width: 1, height: 24, background: "#E5E7EB" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#103A23", letterSpacing: "0.01em" }}>Fleet Management</span>
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
            <button className="p11-btn-ghost" onClick={() => window.location.href = "/portal-hub"}>
              Portal Hub
            </button>
            <button className="p11-btn-gold" onClick={() => setIsRegisterDialogOpen(true)}>
              <Car style={{ width: 13, height: 13 }} />
              Register Vehicle
            </button>
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
                        <Button onClick={() => setIsRegisterDialogOpen(true)}>
                          <Car className="mr-2 h-4 w-4" />
                          Register Vehicle
                        </Button>
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
                  <button className="p11-btn-gold" style={{ width: "100%", justifyContent: "center" }} onClick={() => setIsRegisterDialogOpen(true)}>
                    <Car style={{ width: 13, height: 13 }} />
                    Register Vehicle
                  </button>
                  <button className="p11-btn-outline" style={{ width: "100%", justifyContent: "center" }} onClick={() => setIsCreateFleetDialogOpen(true)}>
                    <Plus style={{ width: 13, height: 13 }} />
                    Create Fleet
                  </button>
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
