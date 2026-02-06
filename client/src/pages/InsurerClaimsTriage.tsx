import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {  ArrowLeft, CheckCircle, XCircle, Zap, Eye, BarChart3 } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useState, useMemo } from "react";

export default function InsurerClaimsTriage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedAssessors, setSelectedAssessors] = useState<Record<number, number>>({});
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Get pending claims
  const { data: claims = [], refetch: refetchClaims } = trpc.claims.byStatus.useQuery({
    status: "submitted",
  });

  // Get list of assessors
  const { data: assessors = [] } = trpc.assessors.list.useQuery();

  // Mutations
  const verifyPolicy = trpc.claims.verifyPolicy.useMutation({
    onSuccess: () => {
      toast.success("Policy verification updated");
      refetchClaims();
    },
    onError: (error) => {
      toast.error(`Failed to verify policy: ${error.message}`);
    },
  });

  const assignToAssessor = trpc.claims.assignToAssessor.useMutation({
    onSuccess: () => {
      toast.success("Claim assigned to assessor");
      refetchClaims();
    },
    onError: (error) => {
      toast.error(`Failed to assign claim: ${error.message}`);
    },
  });

  const triggerAiAssessment = trpc.claims.triggerAiAssessment.useMutation({
    onSuccess: () => {
      toast.success("AI assessment triggered");
      refetchClaims();
    },
    onError: (error) => {
      toast.error(`Failed to trigger AI assessment: ${error.message}`);
    },
  });

  const handleVerifyPolicy = (claimId: number, verified: boolean) => {
    verifyPolicy.mutate({ claimId, verified });
  };

  const handleAssignAssessor = (claimId: number) => {
    const assessorId = selectedAssessors[claimId];
    if (!assessorId) {
      toast.error("Please select an assessor");
      return;
    }
    assignToAssessor.mutate({ claimId, assessorId });
  };

  const handleTriggerAi = (claimId: number) => {
    triggerAiAssessment.mutate({ claimId });
  };

  // Paginate claims
  const paginatedClaims = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return claims.slice(startIndex, endIndex);
  }, [claims, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(claims.length / itemsPerPage);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      submitted: { variant: "secondary", label: "Pending Triage" },
      triage: { variant: "default", label: "In Triage" },
      assessment_pending: { variant: "outline", label: "Assessment Pending" },
      assessment_in_progress: { variant: "default", label: "Assessment In Progress" },
      quotes_pending: { variant: "outline", label: "Quotes Pending" },
      comparison: { variant: "default", label: "In Comparison" },
      repair_assigned: { variant: "default", label: "Repair Assigned" },
      repair_in_progress: { variant: "default", label: "Repair In Progress" },
      completed: { variant: "default", label: "Completed" },
      rejected: { variant: "destructive", label: "Rejected" },
    };
    const config = variants[status] || { variant: "outline" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <KingaLogo />
              <div>
                <p className="text-sm text-muted-foreground">Claims Triage</p>
                <p className="text-sm text-muted-foreground">Review and process submitted claims</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setLocation("/insurer/dashboard")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Pending Claims</CardTitle>
            <CardDescription>
              {claims.length} claim(s) awaiting triage and processing
            </CardDescription>
          </CardHeader>
          <CardContent>
            {claims.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No pending claims</p>
                <p className="text-sm mt-2">Claims submitted by claimants will appear here</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim #</TableHead>
                    <TableHead>Claimant</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Policy</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedClaims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-mono text-sm">
                        {claim.claimNumber}
                      </TableCell>
                      <TableCell>Claimant #{claim.claimantId}</TableCell>
                      <TableCell>
                        {claim.vehicleMake} {claim.vehicleModel} ({claim.vehicleYear})
                      </TableCell>
                      <TableCell>
                        {claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString() : "N/A"}
                      </TableCell>
                      <TableCell>{getStatusBadge(claim.status)}</TableCell>
                      <TableCell>
                        {claim.policyVerified === null ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              onClick={() => handleVerifyPolicy(claim.id, true)}
                              disabled={verifyPolicy.isPending}
                            >
                              <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
                              Verify
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              onClick={() => handleVerifyPolicy(claim.id, false)}
                              disabled={verifyPolicy.isPending}
                            >
                              <XCircle className="h-3 w-3 mr-1 text-red-600" />
                              Reject
                            </Button>
                          </div>
                        ) : claim.policyVerified ? (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            Rejected
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          <div className="flex gap-1">
                            <Select
                              value={selectedAssessors[claim.id]?.toString() || ""}
                              onValueChange={(value) =>
                                setSelectedAssessors((prev) => ({
                                  ...prev,
                                  [claim.id]: parseInt(value),
                                }))
                              }
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Select assessor" />
                              </SelectTrigger>
                              <SelectContent>
                                {assessors.map((assessor) => (
                                  <SelectItem key={assessor.id} value={assessor.id.toString()}>
                                    {assessor.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 px-2"
                              onClick={() => handleAssignAssessor(claim.id)}
                              disabled={!selectedAssessors[claim.id] || assignToAssessor.isPending}
                            >
                              Assign
                            </Button>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 flex-1"
                              onClick={() => handleTriggerAi(claim.id)}
                              disabled={triggerAiAssessment.isPending}
                            >
                              <Zap className="h-3 w-3 mr-1" />
                              AI Assess
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              onClick={() => setLocation(`/insurer/claims/${claim.id}`)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => setLocation(`/insurer/claims/${claim.id}/comparison`)}
                            >
                              <BarChart3 className="h-3 w-3 mr-1" />
                              Compare
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            
            {/* Pagination Controls */}
            {claims.length > itemsPerPage && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, claims.length)} of {claims.length} claims
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <Button
                        key={page}
                        variant={page === currentPage ? "default" : "outline"}
                        size="sm"
                        className="w-8 h-8 p-0"
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
