/**
 * Admin Seed Data Page
 * 
 * Allows super-admins to populate the database with test claims and vehicle damage images.
 * Uses the admin.bulkSeedClaims tRPC procedure to upload images to S3 and create claims
 * with automatic AI assessment triggering.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Loader2, Database, Image, FileText, Brain } from "lucide-react";

export default function AdminSeedData() {
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedReport, setSeedReport] = useState<any>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiGenReport, setAiGenReport] = useState<any>(null);

  const bulkSeedMutation = trpc.admin.bulkSeedClaims.useMutation({
    onSuccess: (data) => {
      setSeedReport(data.report);
      setIsSeeding(false);
    },
    onError: (error) => {
      console.error("Bulk seed failed:", error);
      setIsSeeding(false);
    },
  });

  const bulkAiGenMutation = trpc.admin.bulkGenerateAiAssessments.useMutation({
    onSuccess: (data) => {
      setAiGenReport(data);
      setIsGeneratingAi(false);
    },
    onError: (error) => {
      console.error("Bulk AI generation failed:", error);
      setIsGeneratingAi(false);
    },
  });

  const handleBulkSeed = () => {
    if (confirm("This will create 20 test claims with real vehicle damage images. Continue?")) {
      setIsSeeding(true);
      setSeedReport(null);
      bulkSeedMutation.mutate({
        imageDirectory: "/home/ubuntu/upload",
        claimCount: 20,
      });
    }
  };

  const handleBulkAiGen = () => {
    if (confirm("This will generate AI assessments for all claims with damage photos that don't have assessments. Continue?")) {
      setIsGeneratingAi(true);
      setAiGenReport(null);
      bulkAiGenMutation.mutate({
        batchSize: 5,
        maxClaims: 20,
      });
    }
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Seed Test Data</h1>
        <p className="text-muted-foreground">
          Populate the database with test claims and vehicle damage images for development and testing.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Bulk Seed Claims with Vehicle Damage Images</CardTitle>
          <CardDescription>
            Creates 20 test claims with real vehicle damage photos from /home/ubuntu/upload directory.
            Each claim will have 1-3 randomly selected damage photos and will automatically trigger AI assessment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button
                onClick={handleBulkSeed}
                disabled={isSeeding}
                size="lg"
                className="w-full sm:w-auto"
              >
                {isSeeding ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Seeding Database...
                  </>
                ) : (
                  <>
                    <Database className="mr-2 h-4 w-4" />
                    Start Bulk Seed
                  </>
                )}
              </Button>
            </div>

            {bulkSeedMutation.error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {bulkSeedMutation.error.message}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Generate AI Assessments for Existing Claims</CardTitle>
          <CardDescription>
            Generates AI assessments for all claims with damage photos that don't have assessments yet.
            Useful for backfilling assessments after bulk claim seeding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button
                onClick={handleBulkAiGen}
                disabled={isGeneratingAi}
                size="lg"
                className="w-full sm:w-auto"
                variant="secondary"
              >
                {isGeneratingAi ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating AI Assessments...
                  </>
                ) : (
                  <>
                    <Brain className="mr-2 h-4 w-4" />
                    Generate Missing AI Assessments
                  </>
                )}
              </Button>
            </div>

            {bulkAiGenMutation.error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {bulkAiGenMutation.error.message}
                </AlertDescription>
              </Alert>
            )}

            {aiGenReport && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div className="font-semibold">{aiGenReport.message}</div>
                    <div className="text-sm">
                      Coverage: {aiGenReport.coverage?.coveragePercent}% 
                      ({aiGenReport.coverage?.totalAssessments}/{aiGenReport.coverage?.totalClaimsWithPhotos} claims)
                    </div>
                    {aiGenReport.errors && aiGenReport.errors.length > 0 && (
                      <div className="text-sm text-red-600">
                        {aiGenReport.errors.length} error(s) occurred
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Seed Production Ecosystem</CardTitle>
          <CardDescription>
            Creates 3 assessors, 4 panel beaters, assigns assessors to 5 claims, and generates 10 quotes.
            This populates the Assessors and Panel Beaters dashboards with realistic data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button
                onClick={() => {
                  if (confirm("This will create assessors, panel beaters, and quotes for 5 claims. Continue?")) {
                    trpc.admin.seedProductionEcosystem.mutate(undefined, {
                      onSuccess: (data) => {
                        alert(`Success! Created:\n- ${data.claimsAssigned} claims assigned\n- ${data.panelBeatersCreated} panel beaters\n- ${data.quotesCreated} quotes\n- ${data.claimsUpdated} claims updated`);
                      },
                      onError: (error) => {
                        alert(`Error: ${error.message}`);
                      },
                    });
                  }
                }}
                size="lg"
                className="w-full sm:w-auto"
              >
                <Database className="mr-2 h-4 w-4" />
                Seed Ecosystem
              </Button>
            </div>

            <div className="text-sm text-muted-foreground space-y-1">
              <div>• Creates 3 assessor users</div>
              <div>• Assigns assessors to 5 random claims</div>
              <div>• Creates 4 panel beater companies</div>
              <div>• Generates 2 quotes per claim (10 total)</div>
              <div>• Updates claim statuses to 'quotes_pending'</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {seedReport && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Seed Operation Complete
            </CardTitle>
            <CardDescription>
              Generated at {new Date(seedReport.timestamp).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex flex-col items-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <Image className="h-8 w-8 text-blue-600 mb-2" />
                <div className="text-2xl font-bold">{seedReport.imagesUploaded}</div>
                <div className="text-sm text-muted-foreground">Images Uploaded</div>
              </div>

              <div className="flex flex-col items-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <FileText className="h-8 w-8 text-green-600 mb-2" />
                <div className="text-2xl font-bold">{seedReport.claimsCreated}</div>
                <div className="text-sm text-muted-foreground">Claims Created</div>
              </div>

              <div className="flex flex-col items-center p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                <Brain className="h-8 w-8 text-purple-600 mb-2" />
                <div className="text-2xl font-bold">{seedReport.aiAssessmentsTriggered}</div>
                <div className="text-sm text-muted-foreground">AI Assessments</div>
              </div>

              <div className="flex flex-col items-center p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                <XCircle className="h-8 w-8 text-red-600 mb-2" />
                <div className="text-2xl font-bold">{seedReport.errors.length}</div>
                <div className="text-sm text-muted-foreground">Errors</div>
              </div>
            </div>

            {/* Uploaded Images */}
            {seedReport.uploadedImages.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Uploaded Images</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {seedReport.uploadedImages.map((img: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
                      <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <span className="truncate">{img.filename}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Created Claims */}
            {seedReport.createdClaims.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Created Claims</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {seedReport.createdClaims.map((claim: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-muted rounded">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <div>
                          <div className="font-medium">{claim.claimNumber}</div>
                          <div className="text-sm text-muted-foreground">
                            {claim.imageCount} photo{claim.imageCount !== 1 ? "s" : ""}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        ID: {claim.claimId}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {seedReport.errors.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3 text-red-600">Errors</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {seedReport.errors.map((error: string, idx: number) => (
                    <Alert key={idx} variant="destructive">
                      <XCircle className="h-4 w-4" />
                      <AlertDescription className="text-sm">{error}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
