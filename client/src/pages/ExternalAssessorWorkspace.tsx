import { useMemo } from "react";
import { useLocation } from "wouter";
import { ClipboardCheck, FileText, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

const ACTIVE_STATES = new Set(["assigned", "under_assessment"]);

function claimState(claim: any) {
  return claim.workflowState ?? claim.status ?? "assigned";
}

export default function ExternalAssessorWorkspace() {
  const [, setLocation] = useLocation();
  const { data: assignments = [], isLoading, refetch } = trpc.claims.myAssignments.useQuery();
  const acceptAssignment = trpc.assessorEvaluations.acceptAssignment.useMutation({
    onSuccess: async (_result, { claimId }) => {
      await refetch();
      setLocation(`/insurer-portal/external-assessor/claims/${claimId}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const { activeAssignments, submittedReports } = useMemo(() => {
    const active: any[] = [];
    const history: any[] = [];
    assignments.forEach((claim: any) => {
      if (ACTIVE_STATES.has(claimState(claim))) active.push(claim);
      else history.push(claim);
    });
    return { activeAssignments: active, submittedReports: history };
  }, [assignments]);

  const openAssignment = (claimId: number) => {
    setLocation(`/insurer-portal/external-assessor/claims/${claimId}`);
  };

  return (
    <div className="min-h-full space-y-6 p-6 lg:p-8">
      <section className="border-b border-border pb-6">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2.5 text-primary"><ClipboardCheck className="h-6 w-6" /></div>
          <div>
            <p className="text-sm font-medium text-primary">KINGA Risk Intelligence Platform</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">External Assessor Workspace</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Work only on claims formally assigned to you. Your attested report is routed to the designated claims reviewer; it does not approve a claim, cost, or settlement.</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Assigned work</p><p className="mt-1 text-3xl font-semibold">{activeAssignments.length}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Report history</p><p className="mt-1 text-3xl font-semibold">{submittedReports.length}</p></CardContent></Card>
        <Card><CardContent className="flex gap-3 pt-5"><ShieldCheck className="mt-0.5 h-5 w-5 text-primary" /><p className="text-sm text-muted-foreground">Assignments, evidence, and report authority remain tenant- and user-bound.</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" />Assigned assessments</CardTitle>
          <CardDescription>Only assignments addressed to your authenticated account appear here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your assignments…</div> : null}
          {!isLoading && activeAssignments.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">No active assignment is currently addressed to you. When a claim is assigned, it will appear here and in your in-app notifications.</div> : null}
          {activeAssignments.map((claim: any) => {
            const state = claimState(claim);
            const isAwaitingAcceptance = state === "assigned";
            return <div key={claim.id} className="flex flex-col gap-4 border-t border-border pt-4 first:border-t-0 first:pt-0 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{claim.claimNumber ?? `Claim #${claim.id}`}</p><Badge variant="secondary">{state.replace(/_/g, " ")}</Badge></div>
                <p className="mt-1 text-sm text-muted-foreground">{[claim.vehicleRegistration, claim.vehicleMake, claim.vehicleModel].filter(Boolean).join(" · ") || "Vehicle details available in the assigned claim"}</p>
              </div>
              <Button disabled={acceptAssignment.isPending} onClick={() => isAwaitingAcceptance ? acceptAssignment.mutate({ claimId: claim.id }) : openAssignment(claim.id)}>
                {acceptAssignment.isPending && acceptAssignment.variables?.claimId === claim.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                {isAwaitingAcceptance ? "Accept & open assessment" : "Open assessment"}
              </Button>
            </div>;
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Report history</CardTitle><CardDescription>Completed or reviewer-routed work remains visible as assignment history.</CardDescription></CardHeader>
        <CardContent>{submittedReports.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No report history is available yet.</p> : <div className="space-y-2">{submittedReports.map((claim: any) => <div key={claim.id} className="flex items-center justify-between border-t border-border py-3 first:border-t-0 first:pt-0"><div><p className="font-medium">{claim.claimNumber ?? `Claim #${claim.id}`}</p><p className="text-sm text-muted-foreground">{claimState(claim).replace(/_/g, " ")}</p></div><Badge variant="outline">History</Badge></div>)}</div>}</CardContent>
      </Card>
    </div>
  );
}
