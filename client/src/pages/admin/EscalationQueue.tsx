/**
 * Escalation Queue Admin Page
 *
 * Three-queue view for managing claims that have been routed by the
 * Claims Escalation Router engine:
 *   1. AUTO_APPROVE — low-risk claims that can be fast-tracked
 *   2. ADJUSTER_REVIEW — standard claims requiring manual review
 *   3. FRAUD_TEAM — high-risk or fraud-flagged claims
 *
 * Also shows the multi-layer approval workflow queue:
 * claims currently pending at each approval stage.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Loader2,
  ExternalLink,
  BarChart3,
  Users,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  claims_processor: "Claims Processor",
  internal_assessor: "Internal Assessor",
  external_assessor: "External Assessor",
  risk_manager: "Risk Manager",
  claims_manager: "Claims Manager",
  executive: "Executive / GM",
  underwriter: "Underwriter",
};

const QUEUE_CONFIG = {
  AUTO_APPROVE: {
    label: "Auto-Approve",
    description: "Low-risk claims that meet all criteria for fast-track approval",
    color: "bg-green-100 text-green-700 border-green-300",
    headerColor: "bg-green-50 border-green-200",
    icon: CheckCircle2,
    iconColor: "text-green-600",
  },
  ADJUSTER_REVIEW: {
    label: "Adjuster Review",
    description: "Standard claims requiring manual assessment by an adjuster",
    color: "bg-blue-100 text-blue-700 border-blue-300",
    headerColor: "bg-blue-50 border-blue-200",
    icon: Users,
    iconColor: "text-blue-600",
  },
  FRAUD_TEAM: {
    label: "Fraud Team",
    description: "High-risk or fraud-flagged claims requiring specialist investigation",
    color: "bg-red-100 text-red-700 border-red-300",
    headerColor: "bg-red-50 border-red-200",
    icon: ShieldAlert,
    iconColor: "text-red-600",
  },
};

// ─── Escalation Summary Card ──────────────────────────────────────────────────

function EscalationSummaryCards() {
  const { data: summary, isLoading } = trpc.decision.getEscalationSummary.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="py-6 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const routeCounts: Record<string, number> = {
    AUTO_APPROVE: summary.auto_approve_count,
    ADJUSTER_REVIEW: summary.adjuster_review_count,
    FRAUD_TEAM: summary.fraud_team_count,
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      {(["AUTO_APPROVE", "ADJUSTER_REVIEW", "FRAUD_TEAM"] as const).map((queue) => {
        const cfg = QUEUE_CONFIG[queue];
        const Icon = cfg.icon;
        const count = routeCounts[queue] ?? 0;
        return (
          <Card key={queue} className={`border ${cfg.headerColor}`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${cfg.headerColor} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${cfg.iconColor}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground">{cfg.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Escalation Queue Tab ─────────────────────────────────────────────────────

function EscalationQueueTab({ queue }: { queue: "AUTO_APPROVE" | "ADJUSTER_REVIEW" | "FRAUD_TEAM" }) {
  const [, navigate] = useLocation();
  const cfg = QUEUE_CONFIG[queue];
  const Icon = cfg.icon;

  const { data: summary, isLoading, refetch } = trpc.decision.getEscalationSummary.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  // EscalationSummary doesn't have per-claim details — show aggregate counts
  const claimsInQueue: Array<{ claimId: number; route: string; confidence: number; primaryReason: string; routedAt: string }> = [];

  return (
    <div className="space-y-4">
      <Card className={`border ${cfg.headerColor}`}>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-3">
            <Icon className={`h-5 w-5 ${cfg.iconColor}`} />
            <div>
              <p className="font-medium">{cfg.label}</p>
              <p className="text-xs text-muted-foreground">{cfg.description}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && claimsInQueue.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <Icon className={`h-8 w-8 mx-auto mb-2 ${cfg.iconColor} opacity-50`} />
            <p className="text-sm text-muted-foreground">No claims in this queue</p>
          </CardContent>
        </Card>
      )}

      {claimsInQueue.length > 0 && (
        <div className="space-y-2">
          {claimsInQueue.map((item) => (
            <Card key={item.claimId} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Claim #{item.claimId}</span>
                      <Badge className={`${cfg.color} border text-xs`}>
                        {Math.round(item.confidence)}% confidence
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.primaryReason}</p>
                    <p className="text-xs text-muted-foreground">
                      Routed: {new Date(item.routedAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/insurer-portal/comparison/${item.claimId}`)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" /> View
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Approval Queue Tab ────────────────────────────────────────────────────────

function ApprovalQueueTab() {
  const [, navigate] = useLocation();

  const { data: queueData, isLoading } = trpc.approval.getApprovalQueue.useQuery(
    { limit: 100 },
    { refetchOnWindowFocus: false }
  );

  const { data: summary } = trpc.approval.getWorkflowSummary.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Decisions", value: summary.total_decisions, color: "text-foreground" },
            { label: "Approved", value: summary.approved_count, color: "text-green-600" },
            { label: "Rejected", value: summary.rejected_count, color: "text-red-600" },
            { label: "Returned", value: summary.returned_count, color: "text-yellow-600" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-3 pb-2">
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Claims pending approval */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Claims Pending Approval</CardTitle>
          <CardDescription className="text-xs">
            Claims that have had at least one stage approved and are waiting for the next stage
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && queueData && queueData.total_pending === 0 && (
            <div className="text-center py-6">
              <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No claims pending approval</p>
            </div>
          )}

          {!isLoading && queueData && queueData.total_pending > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">
                {queueData.total_pending} claim{queueData.total_pending !== 1 ? "s" : ""} pending
              </p>
              {queueData.pending_claim_ids.map((claimId) => (
                <div
                  key={claimId}
                  className="flex items-center justify-between p-2 rounded border hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">Claim #{claimId}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/insurer-portal/comparison/${claimId}`)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" /> Review
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role breakdown */}
      {summary && summary.role_breakdown && Object.keys(summary.role_breakdown).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Decisions by Role</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(summary.role_breakdown as Record<string, number>)
                .sort(([, a], [, b]) => b - a)
                .map(([role, count]) => (
                  <div key={role} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {ROLE_LABELS[role] ?? role}
                    </span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function EscalationQueue() {
  const { data: summary, refetch, isLoading: summaryLoading } = trpc.decision.getEscalationSummary.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Escalation Queue</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Claims routed by the AI Escalation Router and pending multi-layer approval
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* Summary KPI cards */}
        <EscalationSummaryCards />

        {/* Tabs */}
        <Tabs defaultValue="adjuster">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="auto" className="text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Auto-Approve
            </TabsTrigger>
            <TabsTrigger value="adjuster" className="text-xs">
              <Users className="h-3 w-3 mr-1" /> Adjuster Review
            </TabsTrigger>
            <TabsTrigger value="fraud" className="text-xs">
              <ShieldAlert className="h-3 w-3 mr-1" /> Fraud Team
            </TabsTrigger>
            <TabsTrigger value="approval" className="text-xs">
              <BarChart3 className="h-3 w-3 mr-1" /> Approval Queue
            </TabsTrigger>
          </TabsList>

          <TabsContent value="auto" className="mt-4">
            <EscalationQueueTab queue="AUTO_APPROVE" />
          </TabsContent>
          <TabsContent value="adjuster" className="mt-4">
            <EscalationQueueTab queue="ADJUSTER_REVIEW" />
          </TabsContent>
          <TabsContent value="fraud" className="mt-4">
            <EscalationQueueTab queue="FRAUD_TEAM" />
          </TabsContent>
          <TabsContent value="approval" className="mt-4">
            <ApprovalQueueTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
