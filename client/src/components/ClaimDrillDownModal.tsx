import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Clock, Shield, TrendingUp, FileText, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface ClaimDrillDownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: "all" | "high_fraud" | "overridden";
  title: string;
}

export function ClaimDrillDownModal({ open, onOpenChange, filter, title }: ClaimDrillDownModalProps) {
  // Mock data - replace with actual tRPC query
  const mockClaims = [
    {
      id: "CLM-2024-001",
      policyHolder: "John Doe",
      claimType: "Collision",
      status: "Under Review",
      fraudScore: 85,
      aiConfidence: 92,
      amount: 45000,
      submittedAt: "2024-02-15",
      workflowState: "technical_review",
    },
    {
      id: "CLM-2024-002",
      policyHolder: "Jane Smith",
      claimType: "Theft",
      status: "Approved",
      fraudScore: 15,
      aiConfidence: 98,
      amount: 32000,
      submittedAt: "2024-02-14",
      workflowState: "financial_decision",
    },
  ];

  const mockOverrideHistory = [
    {
      claimId: "CLM-2024-001",
      timestamp: "2024-02-16 14:30",
      user: "Executive User",
      action: "Override AI Rejection",
      reason: "Customer loyalty consideration",
      previousState: "ai_rejected",
      newState: "technical_review",
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "approved":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      case "under review":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getFraudRiskColor = (score: number) => {
    if (score >= 70) return "text-red-600";
    if (score >= 40) return "text-yellow-600";
    return "text-green-600";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Detailed claim information and workflow history
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="claims" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="claims">Claims List</TabsTrigger>
            <TabsTrigger value="routing">Routing Paths</TabsTrigger>
            <TabsTrigger value="overrides">Override History</TabsTrigger>
          </TabsList>

          <TabsContent value="claims" className="space-y-4">
            <ScrollArea className="h-[500px] pr-4">
              {mockClaims.map((claim) => (
                <Card key={claim.id} className="mb-4">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">{claim.id}</h3>
                        <p className="text-sm text-slate-600">{claim.policyHolder}</p>
                      </div>
                      <Badge className={getStatusColor(claim.status)}>
                        {claim.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-slate-500">Claim Type</p>
                        <p className="font-medium">{claim.claimType}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Amount</p>
                        <p className="font-medium">R {claim.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Fraud Risk</p>
                        <p className={`font-bold ${getFraudRiskColor(claim.fraudScore)}`}>
                          {claim.fraudScore}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">AI Confidence</p>
                        <p className="font-medium text-blue-600">{claim.aiConfidence}%</p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                      <Clock className="h-4 w-4" />
                      <span>Submitted: {claim.submittedAt}</span>
                      <span className="mx-2">•</span>
                      <span>Current: {claim.workflowState.replace(/_/g, " ")}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="routing" className="space-y-4">
            <ScrollArea className="h-[500px] pr-4">
              {mockClaims.map((claim) => (
                <Card key={claim.id} className="mb-4">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-4">{claim.id} - Routing Path</h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <div className="flex-1">
                          <p className="font-medium">Claim Submitted</p>
                          <p className="text-xs text-slate-500">2024-02-15 09:00</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <div className="flex-1">
                          <p className="font-medium">AI Assessment</p>
                          <p className="text-xs text-slate-500">2024-02-15 09:15</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <div className="flex-1">
                          <p className="font-medium">Technical Review</p>
                          <p className="text-xs text-slate-500">2024-02-15 14:30</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-slate-300"></div>
                        <div className="flex-1">
                          <p className="font-medium text-slate-500">Financial Decision (Pending)</p>
                          <p className="text-xs text-slate-500">Awaiting approval</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="overrides" className="space-y-4">
            <ScrollArea className="h-[500px] pr-4">
              {mockOverrideHistory.length > 0 ? (
                mockOverrideHistory.map((override, index) => (
                  <Card key={index} className="mb-4 border-l-4 border-l-amber-500">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <Shield className="h-5 w-5 text-amber-600 mt-1" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold">{override.claimId}</h3>
                            <span className="text-xs text-slate-500">{override.timestamp}</span>
                          </div>
                          <p className="text-sm font-medium text-amber-700 mb-2">
                            {override.action}
                          </p>
                          <p className="text-sm text-slate-600 mb-3">
                            <span className="font-medium">Reason:</span> {override.reason}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Badge variant="outline">{override.previousState}</Badge>
                            <ArrowRight className="h-3 w-3" />
                            <Badge variant="outline">{override.newState}</Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-2">
                            By: {override.user}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No executive overrides recorded</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
