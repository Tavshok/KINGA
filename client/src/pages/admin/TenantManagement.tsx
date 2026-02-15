import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Building2,
  Plus,
  Edit,
  Settings,
  FileText,
  Users,
  Workflow,
  ArrowLeft
} from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
// Toast functionality to be added later

export default function TenantManagement() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  // Toast hook to be added later
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    displayName: "",
    logoUrl: "",
    primaryColor: "#10b981",
    secondaryColor: "#64748b"
  });

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    
    alert(`Successfully created tenant: ${formData.displayName}`);

    setShowCreateForm(false);
    setFormData({
      id: "",
      name: "",
      displayName: "",
      logoUrl: "",
      primaryColor: "#10b981",
      secondaryColor: "#64748b"
    });
  };

  // Mock tenant data (will be replaced with tRPC query)
  const tenants = [
    {
      id: "kinga-default",
      name: "KINGA",
      displayName: "KINGA AutoVerify AI",
      primaryColor: "#10b981",
      secondaryColor: "#64748b",
      documentRetentionYears: 7,
      fraudRetentionYears: 10
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-accent/5">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Tenant Management</h1>
                <p className="text-sm text-muted-foreground">Configure insurance companies and their settings</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setLocation("/admin")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Admin
              </Button>
              <Button size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
                <Plus className="mr-2 h-4 w-4" />
                New Tenant
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Create Tenant Form */}
          {showCreateForm && (
            <Card className="border-2 border-primary/50">
              <CardHeader>
                <CardTitle>Create New Tenant</CardTitle>
                <CardDescription>
                  Add a new insurance company to the platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateTenant} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="id">Tenant ID *</Label>
                      <Input
                        id="id"
                        placeholder="e.g., santam-insurance"
                        value={formData.id}
                        onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                        required
                      />
                      <p className="text-xs text-muted-foreground">Unique identifier (lowercase, hyphens only)</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="name">Short Name *</Label>
                      <Input
                        id="name"
                        placeholder="e.g., Santam"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name *</Label>
                    <Input
                      id="displayName"
                      placeholder="e.g., Santam Insurance Company"
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="logoUrl">Logo URL</Label>
                    <Input
                      id="logoUrl"
                      type="url"
                      placeholder="https://example.com/logo.png"
                      value={formData.logoUrl}
                      onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="primaryColor">Primary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="primaryColor"
                          type="color"
                          value={formData.primaryColor}
                          onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                          className="w-20 h-10"
                        />
                        <Input
                          value={formData.primaryColor}
                          onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                          placeholder="#10b981"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="secondaryColor">Secondary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="secondaryColor"
                          type="color"
                          value={formData.secondaryColor}
                          onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                          className="w-20 h-10"
                        />
                        <Input
                          value={formData.secondaryColor}
                          onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                          placeholder="#64748b"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button type="submit">Create Tenant</Button>
                    <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Tenant List */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Existing Tenants</h2>
            
            {tenants.map((tenant) => (
              <Card key={tenant.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-2xl">{tenant.displayName}</CardTitle>
                      <CardDescription className="text-base mt-1">
                        ID: {tenant.id} • Name: {tenant.name}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <div 
                        className="w-8 h-8 rounded border-2 border-gray-300" 
                        style={{ backgroundColor: tenant.primaryColor }}
                        title="Primary Color"
                      />
                      <div 
                        className="w-8 h-8 rounded border-2 border-gray-300" 
                        style={{ backgroundColor: tenant.secondaryColor }}
                        title="Secondary Color"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div>
                      <p className="text-sm text-muted-foreground">Document Retention</p>
                      <p className="text-lg font-semibold">{tenant.documentRetentionYears} years</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Fraud Retention</p>
                      <p className="text-lg font-semibold">{tenant.fraudRetentionYears} years</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => setLocation(`/admin/tenants/${tenant.id}/roles`)}
                    >
                      <Users className="mr-2 h-4 w-4" />
                      Roles
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => setLocation(`/admin/tenants/${tenant.id}/workflow`)}
                    >
                      <Workflow className="mr-2 h-4 w-4" />
                      Workflow
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => setLocation(`/admin/tenants/${tenant.id}/documents`)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Documents
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => setLocation(`/admin/tenants/${tenant.id}/edit`)}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
