import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Upload, Plus, Car, FileSpreadsheet, Trash2, Edit } from "lucide-react";

export default function FleetManagement() {
  const [selectedFleet, setSelectedFleet] = useState<number | null>(null);
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);
  const [isCreateFleetDialogOpen, setIsCreateFleetDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
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
      // Convert base64 to blob and download
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

  // Handle file import
  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedFleet) {
      toast.error("Please select a fleet first");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target?.result as string;
      const base64Content = base64Data.split(",")[1]; // Remove data:...;base64, prefix

      bulkImport.mutate({
        fleetId: selectedFleet,
        fileData: base64Content,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  // Handle create fleet form submission
  const handleCreateFleet = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createFleet.mutate({
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      businessType: formData.get("businessType") as any,
    });
  };

  // Handle register vehicle form submission
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

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Fleet Management</h1>
          <p className="text-muted-foreground">Manage your vehicle fleet and maintenance schedules</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isCreateFleetDialogOpen} onOpenChange={setIsCreateFleetDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Create Fleet
              </Button>
            </DialogTrigger>
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

          <Dialog open={isRegisterDialogOpen} onOpenChange={setIsRegisterDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Car className="mr-2 h-4 w-4" />
                Register Vehicle
              </Button>
            </DialogTrigger>
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
      </div>

      {/* Fleet Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Vehicles</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vehicles?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Across all fleets</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Fleets</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fleets?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Fleet groups</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Risk Score</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {vehicles && vehicles.length > 0
                ? Math.round(vehicles.reduce((acc, v) => acc + (v.riskScore || 50), 0) / vehicles.length)
                : 0}
            </div>
            <p className="text-xs text-muted-foreground">Out of 100</p>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Operations */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Bulk Operations</CardTitle>
          <CardDescription>Import or export vehicle data in bulk</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
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
        </CardContent>
      </Card>

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
      <Card>
        <CardHeader>
          <CardTitle>Registered Vehicles</CardTitle>
          <CardDescription>
            {selectedFleet
              ? `Vehicles in selected fleet`
              : `All vehicles across your fleets`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {vehicles && vehicles.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registration</TableHead>
                  <TableHead>Make & Model</TableHead>
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
                      <TableCell>
                        {vehicle.make} {vehicle.model}
                      </TableCell>
                      <TableCell>{vehicle.year}</TableCell>
                      <TableCell>{getStatusBadge(vehicle.status || "active")}</TableCell>
                      <TableCell>
                        <Badge variant={vehicle.riskScore && vehicle.riskScore > 70 ? "destructive" : "default"}>
                          {vehicle.riskScore || 50}/100
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            vehicle.maintenanceComplianceScore && vehicle.maintenanceComplianceScore < 50
                              ? "destructive"
                              : "default"
                          }
                        >
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
        </CardContent>
      </Card>
    </div>
  );
}
