/**
 * Admin Seed Data Page
 * 
 * Allows super-admin users to populate the database with test claims and vehicle damage images.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Loader2, Image, FileText, Brain } from "lucide-react";

export default function SeedData() {
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<any>(null);

  const bulkSeedMutation = trpc.admin.bulkSeedClaims.useMutation({
    onSuccess: (data: any) => {
      setSeedResult(data);
      setIsSeeding(false);
    },
    onError: (error: any) => {
      setSeedResult({ success: false, error: error.message });
      setIsSeeding(false);
    },
  });

  const handleSeedClaims = async () => {
    setIsSeeding(true);
    setSeedResult(null);
    
    try {
      await bulkSeedMutation.mutateAsync({
        imageDirectory: "/home/ubuntu/upload",
        claimCount: 20,
      });
    } catch (error: any) {
      console.error("Seed operation failed:", error);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Seed Test Data</h1>
        <p className="text-muted-foreground">
          Populate the database with test claims and vehicle damage images for development and testing.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Bulk Seed Claims with Images</CardTitle>
          <CardDescription>
            This operation will:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Upload 15 vehicle damage images from /home/ubuntu/upload to S3</li>
              <li>Create 20 test claims with populated damage_photos arrays</li>
              <li>Automatically trigger AI assessments for each claim</li>
              <li>Generate quantitative physics analysis for impact validation</li>
            </ul>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleSeedClaims}
            disabled={isSeeding}
            size="lg"
            className="w-full"
          >
            {isSeeding ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Seeding Data...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-5 w-5" />
                Start Bulk Seed Operation
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {seedResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {seedResult.success ? (
                <>
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                  Seed Operation Complete
                </>
              ) : (
                <>
                  <XCircle className="h-6 w-6 text-red-600" />
                  Seed Operation Failed
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {seedResult.success ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center gap-2 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                    <Image className="h-8 w-8 text-blue-600" />
                    <div>
                      <div className="text-2xl font-bold">{seedResult.report.imagesUploaded}</div>
                      <div className="text-sm text-muted-foreground">Images Uploaded</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-950/30 rounded-lg">
                    <FileText className="h-8 w-8 text-green-600" />
                    <div>
                      <div className="text-2xl font-bold">{seedResult.report.claimsCreated}</div>
                      <div className="text-sm text-muted-foreground">Claims Created</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                    <Brain className="h-8 w-8 text-purple-600" />
                    <div>
                      <div className="text-2xl font-bold">{seedResult.report.aiAssessmentsTriggered}</div>
                      <div className="text-sm text-muted-foreground">AI Assessments</div>
                    </div>
                  </div>
                </div>

                {seedResult.report.errors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      <div className="font-semibold mb-2">Errors Encountered:</div>
                      <ul className="list-disc list-inside space-y-1">
                        {seedResult.report.errors.map((error: string, index: number) => (
                          <li key={index} className="text-sm">{error}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="mt-4">
                  <h3 className="font-semibold mb-2">Created Claims:</h3>
                  <div className="max-h-64 overflow-y-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Claim Number</th>
                          <th className="p-2 text-left">Claim ID</th>
                          <th className="p-2 text-left">Images</th>
                        </tr>
                      </thead>
                      <tbody>
                        {seedResult.report.createdClaims.map((claim: any, index: number) => (
                          <tr key={index} className="border-t">
                            <td className="p-2">{claim.claimNumber}</td>
                            <td className="p-2">{claim.claimId}</td>
                            <td className="p-2">{claim.imageCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertDescription>
                  {seedResult.error || "An unknown error occurred during the seed operation."}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
