/**
 * ClaimDocuments Page
 * 
 * Dedicated page for managing documents associated with a specific claim.
 * Combines DocumentUpload and DocumentList components with claim context.
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { trpc } from "@/lib/trpc";
import { useLocation, useRoute } from "wouter";
import DocumentUpload from "@/components/DocumentUpload";
import DocumentList from "@/components/DocumentList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ClaimDocuments() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/claims/:id/documents");
  
  const claimId = params?.id ? parseInt(params.id) : 0;

  // Get claim details
  const { data: claims, isLoading } = trpc.claims.byStatus.useQuery({ status: "submitted" });
  const claim = claims?.find(c => c.id === claimId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-muted/50 flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-muted/50 flex items-center justify-center">
        <Card className="p-6">
          <p>Claim not found</p>
          <Button onClick={() => setLocation("/")} className="mt-4">
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-muted/50">
      {/* Header */}
      <header className="bg-white dark:bg-card border-b border-gray-200 dark:border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <KingaLogo />
            <div className="h-8 w-px bg-gray-300" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">Document Management</h1>
              <p className="text-sm text-gray-600 dark:text-muted-foreground">
                Claim #{claimId} - {claim.vehicleMake} {claim.vehicleModel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 dark:text-muted-foreground">
              {user?.name}
              <span className="block text-xs text-gray-500 dark:text-muted-foreground capitalize">{user?.role}</span>
            </span>
            <Button variant="outline" onClick={logout}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => window.history.back()}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Claim
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Section */}
          <div className="lg:col-span-1">
            <DocumentUpload
              claimId={claimId}
              onUploadComplete={() => {
                // Refresh will be handled by DocumentList's query
              }}
            />
          </div>

          {/* Documents List */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Claim Documents
                </CardTitle>
                <CardDescription>
                  All documents uploaded for this claim
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentList claimId={claimId} />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Claim Summary Card */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Claim Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Vehicle</p>
                <p className="font-medium">
                  {claim.vehicleMake} {claim.vehicleModel} ({claim.vehicleYear})
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Registration</p>
                <p className="font-medium">{claim.vehicleRegistration}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="font-medium capitalize">{claim.status.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Incident Date</p>
                <p className="font-medium">
                  {claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
