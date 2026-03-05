/**
 * Replay Trigger Form
 * 
 * Interface for triggering single and batch claim replays.
 * Supports historical claim search, selection, and replay execution.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, Search, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

export function ReplayTriggerForm() {
  const { fmt } = useTenantCurrency();
  const [singleClaimId, setSingleClaimId] = useState("");
  const [batchClaimIds, setBatchClaimIds] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  
  // tRPC mutations
  const replaySingle = trpc.claimReplay.replayHistoricalClaim.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.message);
      setSingleClaimId("");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
  
  const replayBatch = trpc.claimReplay.batchReplayHistoricalClaims.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Batch replay complete: ${data.successCount}/${data.totalProcessed} succeeded`);
      setBatchClaimIds("");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
  
  // Query eligible claims
  const { data: eligibleClaims, isLoading: loadingClaims } = trpc.claimReplay.getEligibleHistoricalClaims.useQuery({
    limit: 20,
    offset: 0,
    onlyUnreplayed: false,
  });
  
  const handleSingleReplay = () => {
    const claimId = parseInt(singleClaimId);
    if (isNaN(claimId) || claimId <= 0) {
      toast.error("Please enter a valid claim ID");
      return;
    }
    
    replaySingle.mutate({ historicalClaimId: claimId });
  };
  
  const handleBatchReplay = () => {
    const ids = batchClaimIds
      .split(",")
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id) && id > 0);
    
    if (ids.length === 0) {
      toast.error("Please enter valid claim IDs separated by commas");
      return;
    }
    
    if (ids.length > 100) {
      toast.error("Batch replay supports up to 100 claims per request");
      return;
    }
    
    replayBatch.mutate({ historicalClaimIds: ids });
  };
  
  const filteredClaims = eligibleClaims?.filter((claim: any) =>
    claim.claimReference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    claim.id.toString().includes(searchTerm)
  );
  
  return (
    <Tabs defaultValue="single" className="space-y-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="single">Single Claim</TabsTrigger>
        <TabsTrigger value="batch">Batch Replay</TabsTrigger>
      </TabsList>
      
      {/* Single Claim Replay */}
      <TabsContent value="single" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Single Claim Replay</CardTitle>
            <CardDescription>
              Re-process a single historical claim through current KINGA AI system
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="singleClaimId">Historical Claim ID</Label>
              <Input
                id="singleClaimId"
                type="number"
                placeholder="Enter claim ID (e.g., 12345)"
                value={singleClaimId}
                onChange={(e) => setSingleClaimId(e.target.value)}
                disabled={replaySingle.isPending}
              />
            </div>
            
            <Button
              onClick={handleSingleReplay}
              disabled={!singleClaimId || replaySingle.isPending}
              className="w-full"
            >
              {replaySingle.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Replaying...
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Replay Claim
                </>
              )}
            </Button>
          </CardContent>
        </Card>
        
        {/* Eligible Claims List */}
        <Card>
          <CardHeader>
            <CardTitle>Eligible Historical Claims</CardTitle>
            <CardDescription>
              Select from recently uploaded historical claims
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search Claims</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by claim reference or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            
            {loadingClaims ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredClaims && filteredClaims.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredClaims.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer"
                    onClick={() => setSingleClaimId(claim.id.toString())}
                  >
                    <div className="flex-1">
                      <div className="font-medium">{claim.claimReference || `Claim #${claim.id}`}</div>
                      <div className="text-sm text-muted-foreground">
                        ID: {claim.id} | Decision: {claim.repairDecision || "N/A"} | 
                        Payout: {fmt(Number(claim.finalApprovedCost) || 0)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {claim.replayMode === 1 ? (
                        <Badge variant="secondary">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Replayed ({claim.replayCount}x)
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not Replayed</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Alert>
                <AlertDescription>
                  No eligible historical claims found. Upload historical claims first.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      
      {/* Batch Replay */}
      <TabsContent value="batch" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Batch Claim Replay</CardTitle>
            <CardDescription>
              Re-process multiple historical claims (up to 100 per batch)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="batchClaimIds">Historical Claim IDs</Label>
              <Input
                id="batchClaimIds"
                placeholder="Enter claim IDs separated by commas (e.g., 123, 456, 789)"
                value={batchClaimIds}
                onChange={(e) => setBatchClaimIds(e.target.value)}
                disabled={replayBatch.isPending}
              />
              <p className="text-sm text-muted-foreground">
                Maximum 100 claims per batch. Separate IDs with commas.
              </p>
            </div>
            
            <Button
              onClick={handleBatchReplay}
              disabled={!batchClaimIds || replayBatch.isPending}
              className="w-full"
            >
              {replayBatch.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Replaying Batch...
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Replay Batch
                </>
              )}
            </Button>
            
            {replayBatch.isSuccess && replayBatch.data && (
              <Alert>
                <AlertDescription>
                  <div className="space-y-2">
                    <div className="font-medium">Batch Replay Results:</div>
                    <div className="text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span>{replayBatch.data.successCount} claims succeeded</span>
                      </div>
                      {replayBatch.data.errorCount > 0 && (
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-600" />
                          <span>{replayBatch.data.errorCount} claims failed</span>
                        </div>
                      )}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
