import { useState } from "react";
import { CheckCircle2, FileText, RotateCcw, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function AssessorReportReviewQueue() {
  const { data: queue = [], isLoading, refetch } = trpc.assessorReports.myReviewQueue.useQuery();
  const decideReview = trpc.assessorReports.decideReview.useMutation({
    onSuccess: () => {
      toast.success("Assessor report decision recorded");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const [reasons, setReasons] = useState<Record<number, string>>({});

  const decide = (reviewId: number, decision: "accepted" | "returned" | "rejected") => {
    const decisionReason = reasons[reviewId]?.trim();
    if (!decisionReason) {
      toast.error("Record the review decision reason before continuing");
      return;
    }
    decideReview.mutate({ reviewId, decision, decisionReason });
  };

  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Assessor Report Review Queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">Only an accepted assessor report becomes the professional evaluation shown to Claims Manager.</p>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading assigned reports…</p> : queue.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No assessor reports are awaiting your review.</CardContent></Card>
      ) : (
        queue.map(({ review, report }: any) => (
          <Card key={review.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />{report.title}</CardTitle>
                  <CardDescription className="mt-1">Claim #{report.claimId} · Version {report.versionNumber} · {report.creationMethod === "kinga_assisted" ? "KINGA-assisted assessor report" : "Assessor uploaded report"}</CardDescription>
                </div>
                <Badge variant="outline">{review.routeReason.replace(/_/g, " ")}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <p><strong>Assessor:</strong> User #{report.assessorUserId}</p>
                <p><strong>Attested:</strong> {report.attestedAt ? new Date(report.attestedAt).toLocaleString() : "Not recorded"}</p>
                <p><strong>Original evidence:</strong> {report.sourceFileName || "KINGA-assisted draft without an uploaded original"}</p>
              </div>
              <Textarea value={reasons[review.id] || ""} onChange={(event) => setReasons((current) => ({ ...current, [review.id]: event.target.value }))} placeholder="Record the reason for your decision" rows={3} />
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => decide(review.id, "accepted")} disabled={decideReview.isPending}><CheckCircle2 className="mr-2 h-4 w-4" />Accept report</Button>
                <Button variant="outline" onClick={() => decide(review.id, "returned")} disabled={decideReview.isPending}><RotateCcw className="mr-2 h-4 w-4" />Return for clarification</Button>
                <Button variant="destructive" onClick={() => decide(review.id, "rejected")} disabled={decideReview.isPending}><XCircle className="mr-2 h-4 w-4" />Reject report</Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
