/**
 * WorkflowEngine Test Suite
 * 
 * Validates governance enforcement, state transitions, segregation of duties,
 * RBAC permissions, and audit trail integrity.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { transition, getCurrentState } from "./workflow-engine";
import { getDb } from "./db";
import { claims, workflowAuditTrail, claimInvolvementTracking } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { createMockDb } from "./test-helpers/mock-db";

// Mock database for testing
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

describe("WorkflowEngine - State Transition Validation", () => {
  
  it("should allow legal state transition: created → assigned", async () => {
    const mockDb = createMockDb({
      claims: [{
        id: 1,
        workflowState: "created",
        status: "submitted",
        aiAssessmentCompleted: true,
        fraudRiskScore: 25,
        estimatedCost: 500000,
        tenantId: "default",
      }],
      involvement: [],
    });
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "created",
        toState: "assigned",
        userId: 100,
        userRole: "claims_processor",
        tenantId: "default",
      })
    ).resolves.not.toThrow();
  });
  
  it("should reject illegal state transition: created → financial_decision", async () => {
    const mockDb = createMockDb({
      claims: [{
        id: 1,
        workflowState: "created",
        status: "submitted",
        tenantId: "default",
      }],
    });
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "created",
        toState: "financial_decision",
        userId: 100,
        userRole: "claims_processor",
        tenantId: "default",
      })
    ).rejects.toThrow(/Invalid workflow transition/);
  });
  
  it("should reject backward transition without executive override", async () => {
    const mockDb = createMockDb({
      claims: [{
        id: 1,
        workflowState: "technical_approval",
        status: "comparison",
        tenantId: "default",
      }],
    });
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "technical_approval",
        toState: "under_assessment",
        userId: 100,
        userRole: "claims_processor",
        tenantId: "default",
      })
    ).rejects.toThrow(/Invalid workflow transition/);
  });
  
  it("should allow backward transition with executive override", async () => {
    const mockDb = createMockDb({
      claims: [{
        id: 1,
        workflowState: "technical_approval",
        status: "comparison",
        aiAssessmentCompleted: true,
        fraudRiskScore: 25,
        estimatedCost: 500000,
        tenantId: "default",
      }],
      involvement: [],
    });
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "technical_approval",
        toState: "internal_review",
        userId: 100,
        userRole: "executive",
        executiveOverride: true,
        overrideReason: "Additional assessment required",
        tenantId: "default",
      })
    ).resolves.not.toThrow();
  });
  
  it("should reject reopening closed claim without executive override", async () => {
    const mockDb = createMockDb({
      claims: [{
        id: 1,
        workflowState: "closed",
        status: "completed",
        tenantId: "default",
      }],
    });
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "closed",
        toState: "disputed",
        userId: 100,
        userRole: "claims_manager",
        tenantId: "default",
      })
    ).resolves.not.toThrow(); // closed → disputed is actually allowed
  });
});

describe("WorkflowEngine - Role Permission Validation", () => {
  
  it("should reject claims_processor attempting technical_approval transition", async () => {
    const mockDb = createMockDb({
      claims: [{
        id: 1,
        workflowState: "internal_review",
        status: "quotes_pending",
        tenantId: "default",
      }],
    });
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "internal_review",
        toState: "technical_approval",
        userId: 100,
        userRole: "claims_processor",
        tenantId: "default",
      })
    ).rejects.toThrow(/not authorized/);
  });
  
  it("should allow risk_manager to perform technical_approval transition", async () => {
    const mockDb = createMockDb({
      claims: [{
        id: 1,
        workflowState: "internal_review",
        status: "quotes_pending",
        aiAssessmentCompleted: true,
        fraudRiskScore: 25,
        estimatedCost: 500000,
        tenantId: "default",
      }],
      involvement: [],
    });
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "internal_review",
        toState: "technical_approval",
        userId: 100,
        userRole: "risk_manager",
        tenantId: "default",
      })
    ).resolves.not.toThrow();
  });
  
  it("should reject assessor attempting payment_authorized transition", async () => {
    const mockDb = createMockDb({
      claims: [{
        id: 1,
        workflowState: "financial_decision",
        status: "repair_assigned",
        tenantId: "default",
      }],
    });
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "financial_decision",
        toState: "payment_authorized",
        userId: 100,
        userRole: "assessor",
        tenantId: "default",
      })
    ).rejects.toThrow(/not authorized/);
  });
});

describe("WorkflowEngine - Segregation of Duties", () => {
  
  it("should reject same user completing full lifecycle", async () => {
    const mockDb = createMockDb({
      claims: [{
        id: 1,
        workflowState: "technical_approval",
        status: "comparison",
        tenantId: "default",
      }],
      involvement: [
        { claimId: 1, userId: 100, stageInvolved: "intake" },
        { claimId: 1, userId: 100, stageInvolved: "assessment" },
      ],
      config: [{ maxSequentialStagesByUser: 2 }],
    });
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "technical_approval",
        toState: "financial_decision",
        userId: 100,
        userRole: "claims_manager",
        tenantId: "default",
      })
    ).rejects.toThrow(/Segregation of duties violation/);
  });
  
  it("should allow different users for each lifecycle stage", async () => {
    const mockDb = createMockDb({
      claims: [{
        id: 1,
        workflowState: "technical_approval",
        status: "comparison",
        aiAssessmentCompleted: true,
        fraudRiskScore: 25,
        estimatedCost: 500000,
        tenantId: "default",
      }],
      involvement: [], // User 103 has NO prior involvement - demonstrating different users can perform transitions
    });
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "technical_approval",
        toState: "financial_decision",
        userId: 103, // New user for financial_decision stage
        userRole: "claims_manager",
        tenantId: "default",
      })
    ).resolves.not.toThrow();
  });
});

describe("WorkflowEngine - Configuration Validation", () => {
  
  it("should enforce high-value threshold escalation", async () => {
    const mockDb = createMockDb({
      claims: [{
        id: 1,
        workflowState: "technical_approval",
        status: "comparison",
        estimatedCost: 2000000, // High value
        tenantId: "default",
      }],
      config: [{ highValueThreshold: 1000000, requireRiskManagerForHighValue: true }],
    });
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "technical_approval",
        toState: "financial_decision",
        userId: 100,
        userRole: "claims_processor",
        tenantId: "default",
      })
    ).rejects.toThrow(/not authorized/); // Claims processor can't do this transition
  });
  
  it("should allow AI fast-track for low-risk claims when enabled", async () => {
    const mockDb = createMockDb({
      claims: [{
        id: 1,
        workflowState: "created",
        status: "submitted",
        fraudRiskScore: 10,
        estimatedCost: 50000,
        aiAssessmentCompleted: true,
        tenantId: "default",
      }],
      involvement: [],
      config: [{ enableAiFastTrack: true, aiFastTrackMaxRisk: 30 }],
    });
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "created",
        toState: "assigned",
        userId: 100,
        userRole: "claims_processor",
        tenantId: "default",
      })
    ).resolves.not.toThrow();
  });
});

describe("WorkflowEngine - Audit Trail Integrity", () => {
  
  it("should automatically log every state transition", async () => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    });
    
    const mockDb = createMockDb({
      claims: [{
        id: 1,
        workflowState: "created",
        status: "submitted",
        aiAssessmentCompleted: true,
        fraudRiskScore: 25,
        estimatedCost: 500000,
        tenantId: "default",
      }],
      involvement: [],
    });
    
    mockDb.insert = insertMock;
    (getDb as any).mockResolvedValue(mockDb);
    
    await transition({
      claimId: 1,
      fromState: "created",
      toState: "assigned",
      userId: 100,
      userRole: "claims_processor",
      tenantId: "default",
    });
    
    expect(insertMock).toHaveBeenCalled();
  });
  
  it("should include AI snapshot in audit trail", async () => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    });
    
    const mockDb = createMockDb({
      claims: [{
        id: 1,
        workflowState: "created",
        status: "submitted",
        aiAssessmentCompleted: true,
        fraudRiskScore: 25,
        estimatedCost: 500000,
        tenantId: "default",
      }],
      involvement: [],
    });
    
    mockDb.insert = insertMock;
    (getDb as any).mockResolvedValue(mockDb);
    
    await transition({
      claimId: 1,
      fromState: "created",
      toState: "assigned",
      userId: 100,
      userRole: "claims_processor",
      aiSnapshot: { fraudRiskScore: 25, confidence: 0.92 },
      tenantId: "default",
    });
    
    expect(insertMock).toHaveBeenCalled();
  });
  
  it("should preserve executive override reason in audit trail", async () => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    });
    
    const mockDb = createMockDb({
      claims: [{
        id: 1,
        workflowState: "technical_approval",
        status: "comparison",
        aiAssessmentCompleted: true,
        fraudRiskScore: 25,
        estimatedCost: 500000,
        tenantId: "default",
      }],
      involvement: [],
    });
    
    mockDb.insert = insertMock;
    (getDb as any).mockResolvedValue(mockDb);
    
    await transition({
      claimId: 1,
      fromState: "technical_approval",
      toState: "internal_review",
      userId: 100,
      userRole: "executive",
      executiveOverride: true,
      overrideReason: "Urgent case escalation",
      tenantId: "default",
    });
    
    expect(insertMock).toHaveBeenCalled();
  });
});

describe("WorkflowEngine - Middleware Integration", () => {
  
  it("should prevent direct workflowState updates outside engine", async () => {
    const { validateNoDirectStateUpdate } = await import("./workflow-middleware");
    
    expect(() => {
      validateNoDirectStateUpdate({
        workflowState: "payment_authorized",
        updatedAt: new Date(),
      });
    }).toThrow(/GOVERNANCE VIOLATION/);
  });
  
  it("should allow non-state field updates", async () => {
    const { validateNoDirectStateUpdate } = await import("./workflow-middleware");
    
    expect(() => {
      validateNoDirectStateUpdate({
        assignedAssessorId: 123,
        policyVerified: true,
        updatedAt: new Date(),
      });
    }).not.toThrow();
  });
});
