import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Clock, FileText, Shield } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface ClaimDrillDownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: "all" | "high_fraud" | "overridden";
  title: string;
}

function unavailable(message: string) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-8 text-center text-muted-foreground">
      <AlertTriangle className="h-10 w-10 opacity-50" />
      <p className="max-w-md text-sm">{message}</p>
    </div>
  );
}

function recordedAmount(cents: number | null) {
  return cents === null ? "Not recorded" : `${cents.toLocaleString()} cents`;
}

function recordedScore(score: number | null) {
  return score === null ? "Not recorded" : `${score}%`;
}

function recordedText(value: string | null) {
  return value ?? "Not recorded";
}

function displayDate(value: unknown) {
  if (!value) return "Not recorded";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

export function ClaimDrillDownModal({ open, onOpenChange, filter, title }: ClaimDrillDownModalProps) {
  const detail = trpc.executive.getOperationalClaimDetail.useQuery(
    { filter },
    { enabled: open, retry: 0 },
  );
  const data = detail.data;
  const claims = data?.claims ?? [];
  const workflowHistory = data?.workflowHistory ?? [];
  const overrideHistory = data?.overrideHistory ?? [];
  const unavailableMessage = data?.reason ?? "Operational detail is unavailable. Please retry when the authorised data source is available.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Authorised operational claim detail. Missing fields remain unavailable rather than being estimated.
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading ? unavailable("Loading authorised operational detail…") : detail.isError || data?.state === "unavailable" ? unavailable(unavailableMessage) : (
          <Tabs defaultValue="claims" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="claims">Claims List</TabsTrigger>
              <TabsTrigger value="routing">Workflow History</TabsTrigger>
              <TabsTrigger value="overrides">Override History</TabsTrigger>
            </TabsList>

            <TabsContent value="claims" className="space-y-4">
              <ScrollArea className="h-[500px] pr-4">
                {claims.length === 0 ? unavailable("No authorised operational claim records are available for this view.") : claims.map((claim) => (
                  <Card key={claim.id} className="mb-4">
                    <CardContent className="pt-6">
                      <div className="mb-4 flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-lg">{recordedText(claim.claimNumber)}</h3>
                          <p className="text-sm text-muted-foreground">Claim record {claim.id}</p>
                        </div>
                        <Badge variant="outline">{recordedText(claim.status)}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <div><p className="text-xs text-muted-foreground">Incident type</p><p className="font-medium">{recordedText(claim.incidentType)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Recorded amount</p><p className="font-medium">{recordedAmount(claim.totalClaimAmount)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Fraud risk score</p><p className="font-medium">{recordedScore(claim.fraudRiskScore)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Fraud risk level</p><p className="font-medium">{recordedText(claim.fraudRiskLevel)}</p></div>
                      </div>
                      <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" /><span>Created: {displayDate(claim.createdAt)}</span><span>•</span><span>Workflow: {recordedText(claim.workflowState)}</span></div>
                    </CardContent>
                  </Card>
                ))}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="routing" className="space-y-4">
              <ScrollArea className="h-[500px] pr-4">
                {workflowHistory.length === 0 ? unavailable("No workflow history is available for the authorised claim records.") : workflowHistory.map((event, index) => (
                  <Card key={`${String(event.claimId)}-${index}`} className="mb-4">
                    <CardContent className="pt-5"><p className="font-medium">Claim {String(event.claimId)}</p><p className="text-sm text-muted-foreground">{recordedText(event.previousState as string | null)} → {recordedText(event.newState as string | null)}</p><p className="mt-2 text-xs text-muted-foreground">{displayDate(event.createdAt)} · {recordedText(event.userRole as string | null)}</p></CardContent>
                  </Card>
                ))}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="overrides" className="space-y-4">
              <ScrollArea className="h-[500px] pr-4">
                {overrideHistory.length === 0 ? unavailable("No authorised executive override history is available for these claim records.") : overrideHistory.map((event, index) => (
                  <Card key={`${String(event.claimId)}-${index}`} className="mb-4 border-l-4 border-l-amber-500">
                    <CardContent className="pt-5"><div className="flex gap-3"><Shield className="mt-1 h-5 w-5 text-amber-600" /><div><p className="font-medium">Claim {String(event.claimId)}</p><p className="text-sm text-muted-foreground">{recordedText(event.previousState as string | null)} → {recordedText(event.newState as string | null)}</p><p className="mt-2 text-sm">Reason: {recordedText(event.overrideReason as string | null)}</p><p className="mt-2 text-xs text-muted-foreground">{displayDate(event.createdAt)} · {recordedText(event.userRole as string | null)}</p></div></div></CardContent>
                  </Card>
                ))}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
