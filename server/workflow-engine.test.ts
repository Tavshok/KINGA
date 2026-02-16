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

// Mock database for testing
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

describe("WorkflowEngine - State Transition Validation", () => {
  
  it("should allow legal state transition: created → assigned", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 1,
            workflowState: "created",
            status: "submitted",
            aiAssessmentCompleted: true,
            fraudRiskScore: 25,
            estimatedCost: 500000,
          }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue({}),
      }),
      execute: vi.fn().mockResolvedValue([]),
    };
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "created",
        toState: "assigned",
        userId: 100,
        userRole: "claims_processor",
      })
    ).resolves.not.toThrow();
  });
  
  it("should reject illegal state transition: created → financial_decision", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 1,
            workflowState: "created",
            status: "submitted",
          }]),
        }),
      }),
    };
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "created",
        toState: "financial_decision",
        userId: 100,
        userRole: "claims_processor",
      })
    ).rejects.toThrow(/Illegal state transition/);
  });
  
  it("should reject backward transition without executive override", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 1,
            workflowState: "technical_approval",
            status: "comparison",
          }]),
        }),
      }),
    };
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "technical_approval",
        toState: "under_assessment",
        userId: 100,
        userRole: "risk_manager",
      })
    ).rejects.toThrow(/Backward transition not allowed/);
  });
  
  it("should allow backward transition with executive override", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 1,
            workflowState: "technical_approval",
            status: "comparison",
            aiAssessmentCompleted: true,
            fraudRiskScore: 25,
            estimatedCost: 500000,
          }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue({}),
        }),
      execute: vi.fn().mockResolvedValue([]),
    };
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "technical_approval",
        toState: "under_assessment",
        userId: 100,
        userRole: "executive",
        executiveOverride: true,
        overrideReason: "Additional assessment required",
      })
    ).resolves.not.toThrow();
  });
  
  it("should reject reopening closed claim without executive override", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 1,
            workflowState: "closed",
            status: "completed",
          }]),
        }),
      }),
    };
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "closed",
        toState: "disputed",
        userId: 100,
        userRole: "claims_manager",
      })
    ).rejects.toThrow(/Closed claims cannot be reopened/);
  });
});

describe("WorkflowEngine - Role Permission Validation", () => {
  
  it("should reject claims_processor attempting technical_approval transition", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 1,
            workflowState: "internal_review",
            status: "quotes_pending",
          }]),
        }),
      }),
    };
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "internal_review",
        toState: "technical_approval",
        userId: 100,
        userRole: "claims_processor",
      })
    ).rejects.toThrow(/not authorized/);
  });
  
  it("should allow risk_manager to perform technical_approval transition", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 1,
            workflowState: "internal_review",
            status: "quotes_pending",
            aiAssessmentCompleted: true,
            fraudRiskScore: 25,
            estimatedCost: 500000,
          }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue({}),
      }),
      execute: vi.fn().mockResolvedValue([]),
    };
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "internal_review",
        toState: "technical_approval",
        userId: 100,
        userRole: "risk_manager",
      })
    ).resolves.not.toThrow();
  });
  
  it("should reject assessor attempting payment_authorized transition", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 1,
            workflowState: "financial_decision",
            status: "repair_assigned",
          }]),
        }),
      }),
    };
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "financial_decision",
        toState: "payment_authorized",
        userId: 100,
        userRole: "assessor",
      })
    ).rejects.toThrow(/not authorized/);
  });
});

describe("WorkflowEngine - Segregation of Duties", () => {
  
  it("should reject same user completing full lifecycle", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 1,
            workflowState: "financial_decision",
            status: "repair_assigned",
          }]),
        }),
      }),
      execute: vi.fn().mockResolvedValue([
        { userId: 100, role: "claims_processor", state: "created" },
        { userId: 100, role: "assessor", state: "under_assessment" },
        { userId: 100, role: "risk_manager", state: "technical_approval" },
      ]),
    };
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "financial_decision",
        toState: "payment_authorized",
        userId: 100, // Same user who did all previous steps
        userRole: "claims_manager",
      })
    ).rejects.toThrow(/Segregation of duties violation/);
  });
  
  it("should allow different users for each lifecycle stage", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 1,
            workflowState: "financial_decision",
            status: "repair_assigned",
            aiAssessmentCompleted: true,
            fraudRiskScore: 25,
            estimatedCost: 500000,
          }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue({}),
      }),
      execute: vi.fn().mockResolvedValue([
        { userId: 101, role: "claims_processor", state: "created" },
        { userId: 102, role: "assessor", state: "under_assessment" },
        { userId: 103, role: "risk_manager", state: "technical_approval" },
      ]),
    };
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "financial_decision",
        toState: "payment_authorized",
        userId: 104, // Different user
        userRole: "claims_manager",
      })
    ).resolves.not.toThrow();
  });
});

describe("WorkflowEngine - Configuration Validation", () => {
  
  it("should enforce high-value threshold escalation", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 1,
              workflowState: "technical_approval",
              status: "comparison",
              estimatedCost: 3000000, // 30,000 USD - above threshold
            },
            {
              id: 1,
              highValueThreshold: 2500000, // 25,000 USD threshold
              requireRiskManagerApproval: true,
            },
          ]),
        }),
      }),
    };
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await expect(
      transition({
        claimId: 1,
        fromState: "technical_approval",
        toState: "payment_authorized",
        userId: 100,
        userRole: "claims_manager",
      })
    ).rejects.toThrow(/High-value claim requires risk manager approval/);
  });
  
  it("should allow AI fast-track for low-risk claims when enabled", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 1,
              workflowState: "created",
              status: "submitted",
              fraudRiskScore: 10, // Low risk
              estimatedCost: 100000, // 1,000 USD
              aiAssessmentCompleted: true,
            },
            {
              id: 1,
              enableAiFastTrack: true,
              aiFastTrackMaxRisk: 20,
              aiFastTrackMaxAmount: 150000,
            },
          ]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue({}),
      }),
      execute: vi.fn().mockResolvedValue([]),
    };
    
    (getDb as any).mockResolvedValue(mockDb);
    
    // AI fast-track should allow skipping some manual steps
    await expect(
      transition({
        claimId: 1,
        fromState: "created",
        toState: "technical_approval",
        userId: 100,
        userRole: "claims_processor",
      })
    ).resolves.not.toThrow();
  });
});

describe("WorkflowEngine - Audit Trail Integrity", () => {
  
  it("should automatically log every state transition", async () => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    });
    
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 1,
            workflowState: "created",
            status: "submitted",
            aiAssessmentCompleted: true,
            fraudRiskScore: 25,
            estimatedCost: 500000,
          }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
      insert: insertMock,
      execute: vi.fn().mockResolvedValue([]),
    };
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await transition({
      claimId: 1,
      fromState: "created",
      toState: "assigned",
      userId: 100,
      userRole: "claims_processor",
    });
    
    // Verify audit trail insert was called
    expect(insertMock).toHaveBeenCalled();
  });
  
  it("should include AI snapshot in audit trail", async () => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn((data: any) => {
        expect(data.aiRiskScore).toBeDefined();
        expect(data.aiConfidenceScore).toBeDefined();
        return Promise.resolve({});
      }),
    });
    
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 1,
            workflowState: "created",
            status: "submitted",
            aiAssessmentCompleted: true,
            fraudRiskScore: 35,
            confidenceScore: 92,
            estimatedCost: 500000,
          }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
      insert: insertMock,
      execute: vi.fn().mockResolvedValue([]),
    };
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await transition({
      claimId: 1,
      fromState: "created",
      toState: "assigned",
      userId: 100,
      userRole: "claims_processor",
    });
  });
  
  it("should preserve executive override reason in audit trail", async () => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn((data: any) => {
        expect(data.executiveOverride).toBe(true);
        expect(data.overrideReason).toBe("Urgent case escalation");
        return Promise.resolve({});
      }),
    });
    
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 1,
            workflowState: "technical_approval",
            status: "comparison",
            aiAssessmentCompleted: true,
            fraudRiskScore: 25,
            estimatedCost: 500000,
          }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
      insert: insertMock,
      execute: vi.fn().mockResolvedValue([]),
    };
    
    (getDb as any).mockResolvedValue(mockDb);
    
    await transition({
      claimId: 1,
      fromState: "technical_approval",
      toState: "under_assessment",
      userId: 100,
      userRole: "executive",
      executiveOverride: true,
      overrideReason: "Urgent case escalation",
    });
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
