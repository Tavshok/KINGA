import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Users, DollarSign, TrendingUp, Shield, Building2, Settings, CheckCircle, Lock } from "lucide-react";

type Tier = "free" | "premium" | "enterprise";
type InsurerTier = "process" | "protect" | "prove";

const INSURER_TIERS: Record<InsurerTier, { label: string; monthlyFee: number; perClaimFee: number; color: string; badgeClass: string; features: string[] }> = {
  process: {
    label: "Process",
    monthlyFee: 900,
    perClaimFee: 12,
    color: "text-blue-600",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
    features: ["Claims intake & workflow", "Basic fraud scoring", "Assessor assignment", "Standard reports", "Email notifications"],
  },
  protect: {
    label: "Protect",
    monthlyFee: 1300,
    perClaimFee: 12,
    color: "text-purple-600",
    badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
    features: ["All Process features", "Advanced fraud analytics", "Risk heatmaps", "Leakage analysis", "Panel beater benchmarking", "Priority support"],
  },
  prove: {
    label: "Prove",
    monthlyFee: 1600,
    perClaimFee: 12,
    color: "text-amber-600",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
    features: ["All Protect features", "Executive command center", "Full fraud score breakdown", "12-month trend analytics", "Governance & audit trail", "API access", "Dedicated account manager"],
  },
};

function InsurerTierBadge({ tier }: { tier: string | null }) {
  const t = tier as InsurerTier;
  if (!t || !INSURER_TIERS[t]) return <Badge variant="outline">Unassigned</Badge>;
  return <Badge className={`text-xs ${INSURER_TIERS[t].badgeClass}`}>{INSURER_TIERS[t].label}</Badge>;
}

function InsurerTierSection() {
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [editTier, setEditTier] = useState<InsurerTier>("process");
  const [editMonthlyFee, setEditMonthlyFee] = useState<number>(900);
  const [editPerClaimFee, setEditPerClaimFee] = useState<number>(12);

  const { data: tenants, isLoading, refetch } = trpc.claims.getTierConfig.useQuery();
  const updateTier = trpc.claims.updateTierConfig.useMutation({
    onSuccess: () => {
      toast.success("Insurer tier updated successfully");
      refetch();
      setEditingTenant(null);
    },
    onError: (e: any) => toast.error("Update failed", { description: e.message }),
  });

  const openEdit = (tenant: any) => {
    setEditingTenant(tenant);
    setEditTier((tenant.pricingTier as InsurerTier) || "process");
    setEditMonthlyFee(tenant.monthlyPlatformFee ?? INSURER_TIERS[tenant.pricingTier as InsurerTier]?.monthlyFee ?? 900);
    setEditPerClaimFee(tenant.perClaimFee ?? 12);
  };

  const handleSave = () => {
    if (!editingTenant) return;
    updateTier.mutate({
      tenantId: editingTenant.id,
      pricingTier: editTier,
      monthlyPlatformFee: editMonthlyFee,
      perClaimFee: editPerClaimFee,
      tierFeatureFlags: Object.fromEntries(INSURER_TIERS[editTier].features.map(f => [f, true])),
    });
  };

  // Revenue summary
  const tenantList = Array.isArray(tenants) ? tenants : [];
  const totalMonthlyRevenue = tenantList.reduce((s: number, t: any) => s + (t.monthlyPlatformFee ?? 0), 0);
  const tierCounts = tenantList.reduce((acc: Record<string, number>, t: any) => {
    const tier = t.pricingTier || "unassigned";
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Revenue KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Monthly Platform Revenue</p>
            <p className="text-2xl font-bold mt-1 text-green-600">${totalMonthlyRevenue.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">From {tenantList.length} insurer tenants</p>
          </CardContent>
        </Card>
        {(["process", "protect", "prove"] as InsurerTier[]).map((tier) => (
          <Card key={tier}>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{INSURER_TIERS[tier].label} Tier</p>
              <p className={`text-2xl font-bold mt-1 ${INSURER_TIERS[tier].color}`}>{tierCounts[tier] ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">${INSURER_TIERS[tier].monthlyFee}/mo + ${INSURER_TIERS[tier].perClaimFee}/claim</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tier Feature Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tier Feature Matrix</CardTitle>
          <CardDescription>Features included per insurer tier — all tiers at $12/claim</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["process", "protect", "prove"] as InsurerTier[]).map((tier) => (
              <div key={tier} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`font-semibold text-sm ${INSURER_TIERS[tier].color}`}>{INSURER_TIERS[tier].label}</span>
                  <span className="text-xs text-muted-foreground">${INSURER_TIERS[tier].monthlyFee}/mo</span>
                </div>
                <ul className="space-y-1.5">
                  {INSURER_TIERS[tier].features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Insurer Tenants Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Insurer Tenants</CardTitle>
          <CardDescription>Manage pricing tier and fee configuration per insurer</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : tenantList.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No insurer tenants found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Insurer</TableHead>
                  <TableHead>Current Tier</TableHead>
                  <TableHead>Monthly Fee</TableHead>
                  <TableHead>Per-Claim Fee</TableHead>
                  <TableHead>Est. Monthly Revenue</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantList.map((tenant: any) => {
                  const claimsThisMonth = tenant.claimsThisMonth ?? 0;
                  const estRevenue = (tenant.monthlyPlatformFee ?? 0) + claimsThisMonth * (tenant.perClaimFee ?? 12);
                  return (
                    <TableRow key={tenant.id}>
                      <TableCell className="font-medium">{tenant.name ?? `Tenant #${tenant.id}`}</TableCell>
                      <TableCell><InsurerTierBadge tier={tenant.pricingTier} /></TableCell>
                      <TableCell>${(tenant.monthlyPlatformFee ?? 0).toLocaleString()}</TableCell>
                      <TableCell>${tenant.perClaimFee ?? 12}/claim</TableCell>
                      <TableCell className="text-green-600 font-medium">${estRevenue.toLocaleString()}</TableCell>
                      <TableCell>
                        <Dialog open={editingTenant?.id === tenant.id} onOpenChange={(open) => { if (!open) setEditingTenant(null); }}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => openEdit(tenant)}>
                              <Settings className="h-3.5 w-3.5 mr-1.5" /> Configure
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Configure Tier — {tenant.name ?? `Tenant #${tenant.id}`}</DialogTitle>
                              <DialogDescription>Set pricing tier and fee structure for this insurer</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label>Pricing Tier</Label>
                                <Select value={editTier} onValueChange={(v) => {
                                  const t = v as InsurerTier;
                                  setEditTier(t);
                                  setEditMonthlyFee(INSURER_TIERS[t].monthlyFee);
                                  setEditPerClaimFee(INSURER_TIERS[t].perClaimFee);
                                }}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="process">Process — $900/mo</SelectItem>
                                    <SelectItem value="protect">Protect — $1,300/mo</SelectItem>
                                    <SelectItem value="prove">Prove — $1,600/mo</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Monthly Platform Fee ($)</Label>
                                  <Input type="number" min="0" value={editMonthlyFee} onChange={(e) => setEditMonthlyFee(Number(e.target.value))} />
                                </div>
                                <div className="space-y-2">
                                  <Label>Per-Claim Fee ($)</Label>
                                  <Input type="number" min="0" step="0.50" value={editPerClaimFee} onChange={(e) => setEditPerClaimFee(Number(e.target.value))} />
                                </div>
                              </div>
                              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
                                <p className="font-medium text-foreground mb-1">Features included in {INSURER_TIERS[editTier].label}:</p>
                                <ul className="space-y-0.5">
                                  {INSURER_TIERS[editTier].features.map((f, i) => (
                                    <li key={i} className="flex items-center gap-1.5"><CheckCircle className="h-3 w-3 text-green-500" />{f}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setEditingTenant(null)}>Cancel</Button>
                              <Button onClick={handleSave} disabled={updateTier.isPending}>
                                {updateTier.isPending ? "Saving…" : "Save Configuration"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminTierManagement() {
  const { user } = useAuth();
  const [selectedAssessor, setSelectedAssessor] = useState<number | null>(null);
  const [newTier, setNewTier] = useState<Tier>("free");
  const [expiryMonths, setExpiryMonths] = useState<number>(1);

  const { data: assessors, isLoading, refetch } = trpc.assessors.list.useQuery();

  const updateTierMutation = trpc.assessorSubscription.adminSetTier.useMutation({
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
      tier: newTier === "premium" ? "pro" : newTier === "enterprise" ? "pro" : "free",
      expiresAt: expiresAt.toISOString(),
    });
  };

  const getTierBadge = (tier: string | null) => {
    switch (tier) {
      case "premium": return <Badge className="bg-primary/80">Premium</Badge>;
      case "enterprise": return <Badge className="bg-purple-500">Enterprise</Badge>;
      default: return <Badge variant="outline">Free</Badge>;
    }
  };

  const calculateRevenue = () => {
    if (!assessors) return { monthly: 0, annual: 0, premium: 0, enterprise: 0 };
    const premiumCount = assessors.filter((a) => (a as any).assessorTier === "premium").length;
    const enterpriseCount = assessors.filter((a) => (a as any).assessorTier === "enterprise").length;
    const monthly = premiumCount * 50 + enterpriseCount * 150;
    return { monthly, annual: monthly * 12, premium: premiumCount, enterprise: enterpriseCount };
  };

  const revenue = calculateRevenue();

  if (!user || user.role !== "admin") {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">Access denied. Admin privileges required.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Tier Management</h1>
        <p className="text-muted-foreground mt-2">Manage insurer tenant tiers and assessor subscription tiers</p>
      </div>

      <Tabs defaultValue="insurers">
        <TabsList className="grid grid-cols-2 w-full max-w-sm">
          <TabsTrigger value="insurers">
            <Building2 className="h-4 w-4 mr-1.5" /> Insurer Tiers
          </TabsTrigger>
          <TabsTrigger value="assessors">
            <Users className="h-4 w-4 mr-1.5" /> Assessor Tiers
          </TabsTrigger>
        </TabsList>

        {/* ── Insurer Tenant Tier Management ── */}
        <TabsContent value="insurers" className="mt-6">
          <InsurerTierSection />
        </TabsContent>

        {/* ── Assessor Tier Management (existing) ── */}
        <TabsContent value="assessors" className="mt-6 space-y-6">
          {/* Revenue Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${revenue.monthly}</div>
                <p className="text-xs text-muted-foreground">From {revenue.premium + revenue.enterprise} paid assessors</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Annual Projection</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${revenue.annual}</div>
                <p className="text-xs text-muted-foreground">Based on current subscriptions</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Premium Tier</CardTitle>
                <Shield className="h-4 w-4 text-primary/80" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{revenue.premium}</div>
                <p className="text-xs text-muted-foreground">$50/month each</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Enterprise Tier</CardTitle>
                <Shield className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{revenue.enterprise}</div>
                <p className="text-xs text-muted-foreground">$150/month each</p>
              </CardContent>
            </Card>
          </div>

          {/* Assessors Table */}
          <Card>
            <CardHeader>
              <CardTitle>All Assessors</CardTitle>
              <CardDescription>Manage tier assignments and subscription status</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : !assessors || assessors.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No assessors found</p>
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
                        <TableCell className="font-medium">{assessor.name || "Unknown"}</TableCell>
                        <TableCell>{assessor.email || "N/A"}</TableCell>
                        <TableCell>{getTierBadge(assessor.assessorTier)}</TableCell>
                        <TableCell>{(assessor.performanceScore || 0).toFixed(1)}</TableCell>
                        <TableCell>{assessor.totalAssessmentsCompleted || 0}</TableCell>
                        <TableCell>{assessor.tierExpiresAt ? new Date(assessor.tierExpiresAt).toLocaleDateString() : "N/A"}</TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => {
                                setSelectedAssessor(assessor.id);
                                const currentTier = (assessor.assessorTier as string);
                                setNewTier(currentTier === "premium" ? "premium" : currentTier === "enterprise" ? "enterprise" : "free");
                              }}>
                                Manage
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Update Tier for {assessor.name}</DialogTitle>
                                <DialogDescription>Change the subscription tier and set expiry date</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <Label htmlFor="tier">New Tier</Label>
                                  <Select value={newTier} onValueChange={(value: Tier) => setNewTier(value)}>
                                    <SelectTrigger id="tier"><SelectValue placeholder="Select tier" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="free">Free</SelectItem>
                                      <SelectItem value="premium">Premium ($50/month)</SelectItem>
                                      <SelectItem value="enterprise">Enterprise ($150/month)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {newTier !== "free" && (
                                  <div className="space-y-2">
                                    <Label htmlFor="expiry">Subscription Duration (months)</Label>
                                    <Input id="expiry" type="number" min="1" max="24" value={expiryMonths} onChange={(e) => setExpiryMonths(parseInt(e.target.value))} />
                                    <p className="text-xs text-muted-foreground">
                                      Expires on: {new Date(new Date().setMonth(new Date().getMonth() + expiryMonths)).toLocaleDateString()}
                                    </p>
                                  </div>
                                )}
                              </div>
                              <DialogFooter>
                                <Button onClick={handleUpdateTier} disabled={updateTierMutation.isPending}>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
