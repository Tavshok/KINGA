// @ts-nocheck
/**
 * Interactive Report Renderer
 * 
 * Renders dynamic, interactive living intelligence reports with drill-down analytics.
 * Provides real-time data access for web-based report viewing.
 */

import { getDb } from "./db";
import { reportSnapshots } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export interface InteractiveReportData {
  claimNumber: string;
  claimantName: string;
  reportType: string;
  generatedAt: Date;
  version: number;
  
  // Core data sections
  damageAssessment: {
    aiEstimate: number;
    assessorEstimate: number;
    variance: number;
    confidenceScore: number;
    damageTypes: string[];
    severityLevel: string;
  };
  
  costAnalysis: {
    quotes: Array<{
      panelBeater: string;
      totalCost: number;
      laborCost: number;
      partsCost: number;
      estimatedDays: number;
    }>;
    lowestQuote: number;
    highestQuote: number;
    averageQuote: number;
    recommendedQuote: number;
  };
  
  fraudRisk: {
    overallLevel: string;
    indicators: string[];
    mlScore?: number;
    physicsValidation?: {
      passed: boolean;
      deltaV?: number;
      speedEstimate?: number;
    };
  };
  
  workflowAudit: Array<{
    event: string;
    timestamp: Date;
    actor: string;
    details: string;
  }>;
}

/**
 * Get interactive report data for rendering
 */
export async function getInteractiveReportData(
  snapshotId: string,
  tenantId: string
): Promise<InteractiveReportData> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
  
  // Fetch the snapshot
  const [snapshot] = await db
    .select()
    .from(reportSnapshots)
    .where(
      and(
        eq(reportSnapshots.id, snapshotId),
        eq(reportSnapshots.tenantId, tenantId)
      )
    );

  if (!snapshot) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Report snapshot not found or access denied",
    });
  }

  // Parse the snapshot data
  const snapshotData = typeof snapshot.intelligenceData === 'string' 
    ? JSON.parse(snapshot.intelligenceData) 
    : snapshot.intelligenceData;

  // Extract and structure data for interactive display
  const damageAssessment = {
    aiEstimate: snapshotData.aiAssessment?.estimatedCost || 0,
    assessorEstimate: snapshotData.assessorEvaluation?.estimatedRepairCost || 0,
    variance: Math.abs(
      (snapshotData.aiAssessment?.estimatedCost || 0) -
      (snapshotData.assessorEvaluation?.estimatedRepairCost || 0)
    ),
    confidenceScore: snapshotData.aiAssessment?.confidenceScore || 0,
    damageTypes: snapshotData.aiAssessment?.damageTypes || [],
    severityLevel: snapshotData.aiAssessment?.severityLevel || "unknown",
  };

  // Process quotes for cost analysis
  const quotes = (snapshotData.quotes || []).map((q: any) => ({
    panelBeater: q.panelBeaterName || "Unknown",
    totalCost: q.totalCost || 0,
    laborCost: q.laborCost || 0,
    partsCost: q.partsCost || 0,
    estimatedDays: q.estimatedDays || 0,
  }));

  const quoteCosts = quotes.map((q: any) => q.totalCost).filter((c: number) => c > 0);
  const costAnalysis = {
    quotes,
    lowestQuote: quoteCosts.length > 0 ? Math.min(...quoteCosts) : 0,
    highestQuote: quoteCosts.length > 0 ? Math.max(...quoteCosts) : 0,
    averageQuote:
      quoteCosts.length > 0
        ? quoteCosts.reduce((a: number, b: number) => a + b, 0) / quoteCosts.length
        : 0,
    recommendedQuote: quoteCosts.length > 0 ? Math.min(...quoteCosts) : 0,
  };

  // Fraud risk analysis
  const fraudRisk = {
    overallLevel: snapshotData.assessorEvaluation?.fraudRiskLevel || "unknown",
    indicators: snapshotData.fraudIndicators || [],
    mlScore: snapshotData.fraudMlScore,
    physicsValidation: snapshotData.physicsValidation,
  };

  // Workflow audit trail
  const workflowAudit = (snapshotData.workflowEvents || []).map((event: any) => ({
    event: event.eventType || "unknown",
    timestamp: new Date(event.emittedAt || Date.now()),
    actor: event.userName || "System",
    details: event.eventPayload ? JSON.stringify(event.eventPayload) : "",
  }));

  return {
    claimNumber: snapshotData.claim?.claimNumber || "Unknown",
    claimantName: snapshotData.claim?.claimantName || "Unknown",
    reportType: snapshot.reportType,
    generatedAt: snapshot.generatedAt,
    version: snapshot.version,
    damageAssessment,
    costAnalysis,
    fraudRisk,
    workflowAudit,
  };
}

/**
 * Get drill-down data for specific report section
 */
export async function getDrillDownData(
  snapshotId: string,
  section: string,
  tenantId: string
): Promise<any> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
  
  const [snapshot] = await db
    .select()
    .from(reportSnapshots)
    .where(
      and(
        eq(reportSnapshots.id, snapshotId),
        eq(reportSnapshots.tenantId, tenantId)
      )
    );

  if (!snapshot) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Report snapshot not found",
    });
  }

  const snapshotData = typeof snapshot.intelligenceData === 'string' 
    ? JSON.parse(snapshot.intelligenceData) 
    : snapshot.intelligenceData;

  // Return specific section data based on request
  switch (section) {
    case "damage_details":
      return {
        aiAssessment: snapshotData.aiAssessment,
        assessorEvaluation: snapshotData.assessorEvaluation,
        damagePhotos: snapshotData.damagePhotos || [],
      };

    case "cost_breakdown":
      return {
        quotes: snapshotData.quotes,
        costComparison: snapshotData.costComparison,
      };

    case "fraud_analysis":
      return {
        fraudIndicators: snapshotData.fraudIndicators,
        fraudMlScore: snapshotData.fraudMlScore,
        physicsValidation: snapshotData.physicsValidation,
        driverDemographics: snapshotData.driverDemographics,
      };

    case "workflow_history":
      return {
        workflowEvents: snapshotData.workflowEvents,
        approvalHistory: snapshotData.approvalHistory,
      };

    default:
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Unknown section: ${section}`,
      });
  }
}
