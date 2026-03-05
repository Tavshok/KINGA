import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  UserPlus, Clock, DollarSign, AlertTriangle, CheckCircle2, Loader2 
} from "lucide-react";

export function IntakeQueueTab() {
  const { fmt } = useTenantCurrency();
  const [assignmentState, setAssignmentState] = useState<Record<number, {
    processorId?: number;
    priority?: "low" | "medium" | "high";
    earlyFraudSuspicion?: boolean;
  }>>({});

  // Fetch intake queue claims
  const { data: intakeClaims, isLoading, refetch } = trpc.intakeGate.getIntakeQueue.useQuery();
  
  // Fetch available processors
  const { data: processors } = trpc.intakeGate.getAvailableProcessors.useQuery();

  // Assignment mutation
  const assignToProcessor = trpc.intakeGate.assignToProcessor.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.message);
      refetch();
      // Clear assignment state for this claim
      setAssignmentState(prev => {
        const newState = { ...prev };
        delete newState[data.claimId];
        return newState;
      });
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleAssign = (claimId: number) => {
    const state = assignmentState[claimId];
    
    if (!state?.processorId) {
      toast.error("Please select a processor");
      return;
    }

    assignToProcessor.mutate({
      claimId,
      processorId: state.processorId,
      priority: state.priority,
      earlyFraudSuspicion: state.earlyFraudSuspicion,
    });
  };

  const updateAssignmentState = (claimId: number, updates: Partial<typeof assignmentState[number]>) => {
    setAssignmentState(prev => ({
      ...prev,
      [claimId]: {
        ...prev[claimId],
        ...updates,
      },
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (!intakeClaims || intakeClaims.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <p className="text-lg font-medium">No claims in intake queue</p>
            <p className="text-sm mt-2">All new claims have been assigned to processors</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total in Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{intakeClaims.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">High Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {intakeClaims.filter((c: any) => c.priority === "high").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">With AI Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {intakeClaims.filter((c: any) => c.aiPreliminaryScore !== null).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Available Processors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-teal-600">
              {processors?.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Intake Queue Table */}
      <Card>
        <CardHeader>
          <CardTitle>Intake Queue</CardTitle>
          <CardDescription>
            Assign new claims to processors for handling
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {intakeClaims.map((claim: any) => {
              const state = assignmentState[claim.id] || {};
              
              return (
                <div
                  key={claim.id}
                  className="border rounded-lg p-4 space-y-4 hover:bg-slate-50 transition-colors"
                >
                  {/* Claim Info Row */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Claim Number</Label>
                      <p className="font-mono font-semibold">{claim.claimNumber}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Submission Time</Label>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <p className="text-sm">
                          {new Date(claim.createdAt).toLocaleDateString()} {new Date(claim.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Claim Type</Label>
                      <Badge variant="outline">{claim.claimType || "General"}</Badge>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Estimated Value</Label>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-muted-foreground" />
                        <p className="font-semibold">
                          {claim.estimatedValue ? fmt(claim.estimatedValue) : "N/A"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">AI Preliminary Score</Label>
                      {claim.aiPreliminaryScore !== null ? (
                        <Badge 
                          variant={
                            claim.aiPreliminaryScore >= 80 ? "default" : 
                            claim.aiPreliminaryScore >= 60 ? "secondary" : 
                            "destructive"
                          }
                        >
                          {claim.aiPreliminaryScore}%
                        </Badge>
                      ) : (
                        <p className="text-sm text-muted-foreground">Not run</p>
                      )}
                    </div>
                  </div>

                  {/* Assignment Controls Row */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                      <Label htmlFor={`processor-${claim.id}`}>Assign to Processor</Label>
                      <Select
                        value={state.processorId?.toString()}
                        onValueChange={(value) => updateAssignmentState(claim.id, { processorId: parseInt(value) })}
                      >
                        <SelectTrigger id={`processor-${claim.id}`}>
                          <SelectValue placeholder="Select processor" />
                        </SelectTrigger>
                        <SelectContent>
                          {processors?.map((processor: any) => (
                            <SelectItem key={processor.id} value={processor.id.toString()}>
                              {processor.name} ({processor.assignedClaimsCount} active)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor={`priority-${claim.id}`}>Priority</Label>
                      <Select
                        value={state.priority || claim.priority || "medium"}
                        onValueChange={(value: "low" | "medium" | "high") => 
                          updateAssignmentState(claim.id, { priority: value })
                        }
                      >
                        <SelectTrigger id={`priority-${claim.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`fraud-${claim.id}`}
                        checked={state.earlyFraudSuspicion || !!claim.earlyFraudSuspicion}
                        onCheckedChange={(checked) => 
                          updateAssignmentState(claim.id, { earlyFraudSuspicion: !!checked })
                        }
                      />
                      <Label 
                        htmlFor={`fraud-${claim.id}`}
                        className="text-sm font-normal cursor-pointer flex items-center gap-1"
                      >
                        <AlertTriangle className="h-3 w-3 text-orange-500" />
                        Early Fraud Suspicion
                      </Label>
                    </div>

                    <Button
                      onClick={() => handleAssign(claim.id)}
                      disabled={!state.processorId || assignToProcessor.isPending}
                      className="w-full"
                    >
                      {assignToProcessor.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Assigning...
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Assign
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
