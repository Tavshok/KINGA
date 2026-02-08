import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Users, DollarSign, TrendingUp, Shield } from "lucide-react";

export default function AdminTierManagement() {
  const { user } = useAuth();
  const [selectedAssessor, setSelectedAssessor] = useState<number | null>(null);
  const [newTier, setNewTier] = useState<"free" | "premium" | "enterprise">("free");
  const [expiryMonths, setExpiryMonths] = useState<number>(1);

  // Fetch all assessors
  const { data: assessors, isLoading, refetch } = trpc.assessors.list.useQuery();

  // Update tier mutation
  const updateTierMutation = trpc.admin.updateAssessorTier.useMutation({
    onSuccess: () => {
      toast.success("Assessor tier updated successfully");
      refetch();
      setSelectedAssessor(null);
    },
    onError: (error) => {
      toast.error(`Failed to update tier: ${error.message}`);
    },
  });

  const handleUpdateTier = () => {
    if (!selectedAssessor) return;

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + expiryMonths);

    updateTierMutation.mutate({
      assessorId: selectedAssessor,
      tier: newTier,
      expiresAt: expiresAt.toISOString(),
    });
  };

  const getTierBadge = (tier: string | null) => {
    switch (tier) {
      case "premium":
        return <Badge className="bg-blue-500">Premium</Badge>;
      case "enterprise":
        return <Badge className="bg-purple-500">Enterprise</Badge>;
      default:
        return <Badge variant="outline">Free</Badge>;
    }
  };

  const calculateRevenue = () => {
    if (!assessors) return { monthly: 0, annual: 0, premium: 0, enterprise: 0 };

    const premiumCount = assessors.filter((a) => a.assessorTier === "premium").length;
    const enterpriseCount = assessors.filter((a) => a.assessorTier === "enterprise").length;

    const monthly = premiumCount * 50 + enterpriseCount * 150;
    const annual = monthly * 12;

    return { monthly, annual, premium: premiumCount, enterprise: enterpriseCount };
  };

  const revenue = calculateRevenue();

  if (!user || user.role !== "admin") {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              Access denied. Admin privileges required.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Assessor Tier Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage assessor subscription tiers and track revenue
        </p>
      </div>

      {/* Revenue Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${revenue.monthly}</div>
            <p className="text-xs text-muted-foreground">
              From {revenue.premium + revenue.enterprise} paid assessors
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Annual Projection</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${revenue.annual}</div>
            <p className="text-xs text-muted-foreground">
              Based on current subscriptions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Premium Tier</CardTitle>
            <Shield className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{revenue.premium}</div>
            <p className="text-xs text-muted-foreground">
              $50/month each
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enterprise Tier</CardTitle>
            <Shield className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{revenue.enterprise}</div>
            <p className="text-xs text-muted-foreground">
              $150/month each
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Assessors Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Assessors</CardTitle>
          <CardDescription>
            Manage tier assignments and subscription status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !assessors || assessors.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No assessors found
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Current Tier</TableHead>
                  <TableHead>Performance Score</TableHead>
                  <TableHead>Total Assessments</TableHead>
                  <TableHead>Tier Expires</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessors.map((assessor) => (
                  <TableRow key={assessor.id}>
                    <TableCell className="font-medium">
                      {assessor.name || "Unknown"}
                    </TableCell>
                    <TableCell>{assessor.email || "N/A"}</TableCell>
                    <TableCell>{getTierBadge(assessor.assessorTier)}</TableCell>
                    <TableCell>
                      {(assessor.performanceScore || 0).toFixed(1)}
                    </TableCell>
                    <TableCell>
                      {assessor.totalAssessmentsCompleted || 0}
                    </TableCell>
                    <TableCell>
                      {assessor.tierExpiresAt
                        ? new Date(assessor.tierExpiresAt).toLocaleDateString()
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedAssessor(assessor.id);
                              setNewTier(assessor.assessorTier || "free");
                            }}
                          >
                            Manage
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Update Tier for {assessor.name}</DialogTitle>
                            <DialogDescription>
                              Change the subscription tier and set expiry date
                            </DialogDescription>
                          </DialogHeader>

                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="tier">New Tier</Label>
                              <Select
                                value={newTier}
                                onValueChange={(value: "free" | "premium" | "enterprise") =>
                                  setNewTier(value)
                                }
                              >
                                <SelectTrigger id="tier">
                                  <SelectValue placeholder="Select tier" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="free">Free</SelectItem>
                                  <SelectItem value="premium">Premium ($50/month)</SelectItem>
                                  <SelectItem value="enterprise">
                                    Enterprise ($150/month)
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {newTier !== "free" && (
                              <div className="space-y-2">
                                <Label htmlFor="expiry">Subscription Duration (months)</Label>
                                <Input
                                  id="expiry"
                                  type="number"
                                  min="1"
                                  max="24"
                                  value={expiryMonths}
                                  onChange={(e) => setExpiryMonths(parseInt(e.target.value))}
                                />
                                <p className="text-xs text-muted-foreground">
                                  Expires on:{" "}
                                  {new Date(
                                    new Date().setMonth(new Date().getMonth() + expiryMonths)
                                  ).toLocaleDateString()}
                                </p>
                              </div>
                            )}
                          </div>

                          <DialogFooter>
                            <Button
                              onClick={handleUpdateTier}
                              disabled={updateTierMutation.isPending}
                            >
                              {updateTierMutation.isPending ? "Updating..." : "Update Tier"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
