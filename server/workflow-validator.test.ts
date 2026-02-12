/**
 * Workflow Validator Tests
 * 
 * Tests for state transition validation to prevent invalid workflow state jumps.
 */

import { describe, it, expect } from "vitest";
import { 
  validateStateTransition, 
  getValidNextStates, 
  isTerminalState,
  validateWorkflowPath,
  ALLOWED_TRANSITIONS,
  type ClaimStatus
} from "./workflow-validator";
import { TRPCError } from "@trpc/server";

describe("Workflow Validator", () => {
  describe("ALLOWED_TRANSITIONS Map", () => {
    it("should define all claim statuses", () => {
      const expectedStatuses: ClaimStatus[] = [
        "submitted",
        "triage",
        "assessment_pending",
        "assessment_in_progress",
        "quotes_pending",
        "comparison",
        "repair_assigned",
        "repair_in_progress",
        "completed",
        "rejected"
      ];
      
      const definedStatuses = Object.keys(ALLOWED_TRANSITIONS);
      expect(definedStatuses.sort()).toEqual(expectedStatuses.sort());
    });
    
    it("should have terminal states with no outgoing transitions", () => {
      expect(ALLOWED_TRANSITIONS.completed).toEqual([]);
      expect(ALLOWED_TRANSITIONS.rejected).toEqual([]);
    });
    
    it("should allow rejection from any non-terminal state", () => {
      const nonTerminalStatuses: ClaimStatus[] = [
        "submitted",
        "triage",
        "assessment_pending",
        "assessment_in_progress",
        "quotes_pending",
        "comparison",
        "repair_assigned",
        "repair_in_progress"
      ];
      
      nonTerminalStatuses.forEach(status => {
        expect(ALLOWED_TRANSITIONS[status]).toContain("rejected");
      });
    });
  });

  describe("validateStateTransition", () => {
    describe("Valid Transitions", () => {
      it("should allow submitted → triage", () => {
        expect(validateStateTransition("submitted", "triage")).toBe(true);
      });
      
      it("should allow submitted → assessment_pending", () => {
        expect(validateStateTransition("submitted", "assessment_pending")).toBe(true);
      });
      
      it("should allow triage → assessment_pending", () => {
        expect(validateStateTransition("triage", "assessment_pending")).toBe(true);
      });
      
      it("should allow assessment_pending → assessment_in_progress", () => {
        expect(validateStateTransition("assessment_pending", "assessment_in_progress")).toBe(true);
      });
      
      it("should allow assessment_in_progress → quotes_pending", () => {
        expect(validateStateTransition("assessment_in_progress", "quotes_pending")).toBe(true);
      });
      
      it("should allow quotes_pending → comparison", () => {
        expect(validateStateTransition("quotes_pending", "comparison")).toBe(true);
      });
      
      it("should allow comparison → repair_assigned (approval path)", () => {
        expect(validateStateTransition("comparison", "repair_assigned")).toBe(true);
      });
      
      it("should allow repair_assigned → repair_in_progress", () => {
        expect(validateStateTransition("repair_assigned", "repair_in_progress")).toBe(true);
      });
      
      it("should allow repair_in_progress → completed", () => {
        expect(validateStateTransition("repair_in_progress", "completed")).toBe(true);
      });
      
      it("should allow staying in the same state (no-op)", () => {
        expect(validateStateTransition("submitted", "submitted")).toBe(true);
        expect(validateStateTransition("assessment_pending", "assessment_pending")).toBe(true);
        expect(validateStateTransition("completed", "completed")).toBe(true);
      });
      
      it("should allow rejection from any non-terminal state", () => {
        expect(validateStateTransition("submitted", "rejected")).toBe(true);
        expect(validateStateTransition("triage", "rejected")).toBe(true);
        expect(validateStateTransition("assessment_pending", "rejected")).toBe(true);
        expect(validateStateTransition("assessment_in_progress", "rejected")).toBe(true);
        expect(validateStateTransition("quotes_pending", "rejected")).toBe(true);
        expect(validateStateTransition("comparison", "rejected")).toBe(true);
        expect(validateStateTransition("repair_assigned", "rejected")).toBe(true);
        expect(validateStateTransition("repair_in_progress", "rejected")).toBe(true);
      });
    });

    describe("Invalid Transitions", () => {
      it("should reject submitted → completed (skipping workflow)", () => {
        expect(() => {
          validateStateTransition("submitted", "completed");
        }).toThrow(TRPCError);
        
        try {
          validateStateTransition("submitted", "completed");
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          expect((error as TRPCError).code).toBe("BAD_REQUEST");
          expect((error as TRPCError).message).toContain("Invalid state transition");
          expect((error as TRPCError).message).toContain("submitted");
          expect((error as TRPCError).message).toContain("completed");
        }
      });
      
      it("should reject submitted → repair_assigned (skipping assessment)", () => {
        expect(() => {
          validateStateTransition("submitted", "repair_assigned");
        }).toThrow(TRPCError);
      });
      
      it("should reject assessment_pending → completed (skipping quotes)", () => {
        expect(() => {
          validateStateTransition("assessment_pending", "completed");
        }).toThrow(TRPCError);
      });
      
      it("should reject quotes_pending → completed (skipping approval)", () => {
        expect(() => {
          validateStateTransition("quotes_pending", "completed");
        }).toThrow(TRPCError);
      });
      
      it("should reject backward transitions (completed → submitted)", () => {
        expect(() => {
          validateStateTransition("completed", "submitted");
        }).toThrow(TRPCError);
      });
      
      it("should reject backward transitions (repair_assigned → assessment_pending)", () => {
        expect(() => {
          validateStateTransition("repair_assigned", "assessment_pending");
        }).toThrow(TRPCError);
      });
      
      it("should reject transitions from terminal states (completed → anything)", () => {
        expect(() => {
          validateStateTransition("completed", "repair_in_progress");
        }).toThrow(TRPCError);
        
        try {
          validateStateTransition("completed", "repair_in_progress");
        } catch (error) {
          expect((error as TRPCError).message).toContain("none (terminal state)");
        }
      });
      
      it("should reject transitions from rejected state", () => {
        expect(() => {
          validateStateTransition("rejected", "submitted");
        }).toThrow(TRPCError);
      });
    });

    describe("Error Messages", () => {
      it("should provide clear error message with current and target states", () => {
        try {
          validateStateTransition("submitted", "completed");
          expect.fail("Should have thrown error");
        } catch (error) {
          const trpcError = error as TRPCError;
          expect(trpcError.message).toContain("submitted");
          expect(trpcError.message).toContain("completed");
          expect(trpcError.message).toContain("Invalid state transition");
        }
      });
      
      it("should list allowed transitions in error message", () => {
        try {
          validateStateTransition("submitted", "completed");
          expect.fail("Should have thrown error");
        } catch (error) {
          const trpcError = error as TRPCError;
          expect(trpcError.message).toContain("triage");
          expect(trpcError.message).toContain("assessment_pending");
          expect(trpcError.message).toContain("rejected");
        }
      });
      
      it("should indicate terminal state in error message", () => {
        try {
          validateStateTransition("completed", "submitted");
          expect.fail("Should have thrown error");
        } catch (error) {
          const trpcError = error as TRPCError;
          expect(trpcError.message).toContain("terminal state");
        }
      });
    });
  });

  describe("getValidNextStates", () => {
    it("should return valid next states for submitted", () => {
      const nextStates = getValidNextStates("submitted");
      expect(nextStates).toContain("triage");
      expect(nextStates).toContain("assessment_pending");
      expect(nextStates).toContain("rejected");
      expect(nextStates.length).toBe(3);
    });
    
    it("should return valid next states for comparison", () => {
      const nextStates = getValidNextStates("comparison");
      expect(nextStates).toContain("repair_assigned");
      expect(nextStates).toContain("rejected");
      expect(nextStates.length).toBe(2);
    });
    
    it("should return empty array for terminal states", () => {
      expect(getValidNextStates("completed")).toEqual([]);
      expect(getValidNextStates("rejected")).toEqual([]);
    });
  });

  describe("isTerminalState", () => {
    it("should identify completed as terminal state", () => {
      expect(isTerminalState("completed")).toBe(true);
    });
    
    it("should identify rejected as terminal state", () => {
      expect(isTerminalState("rejected")).toBe(true);
    });
    
    it("should identify non-terminal states correctly", () => {
      expect(isTerminalState("submitted")).toBe(false);
      expect(isTerminalState("assessment_pending")).toBe(false);
      expect(isTerminalState("repair_in_progress")).toBe(false);
    });
  });

  describe("validateWorkflowPath", () => {
    it("should validate complete happy path workflow", () => {
      const happyPath: ClaimStatus[] = [
        "submitted",
        "assessment_pending",
        "assessment_in_progress",
        "quotes_pending",
        "comparison",
        "repair_assigned",
        "repair_in_progress",
        "completed"
      ];
      
      expect(validateWorkflowPath(happyPath)).toBe(true);
    });
    
    it("should validate workflow with triage step", () => {
      const triagePath: ClaimStatus[] = [
        "submitted",
        "triage",
        "assessment_pending",
        "assessment_in_progress",
        "quotes_pending",
        "comparison",
        "repair_assigned",
        "repair_in_progress",
        "completed"
      ];
      
      expect(validateWorkflowPath(triagePath)).toBe(true);
    });
    
    it("should validate rejection path", () => {
      const rejectionPath: ClaimStatus[] = [
        "submitted",
        "assessment_pending",
        "rejected"
      ];
      
      expect(validateWorkflowPath(rejectionPath)).toBe(true);
    });
    
    it("should reject invalid path with state jump", () => {
      const invalidPath: ClaimStatus[] = [
        "submitted",
        "completed" // Invalid jump
      ];
      
      expect(() => {
        validateWorkflowPath(invalidPath);
      }).toThrow(TRPCError);
    });
    
    it("should reject path with backward transition", () => {
      const backwardPath: ClaimStatus[] = [
        "submitted",
        "assessment_pending",
        "assessment_in_progress",
        "assessment_pending" // Backward
      ];
      
      expect(() => {
        validateWorkflowPath(backwardPath);
      }).toThrow(TRPCError);
    });
    
    it("should handle single-status path", () => {
      expect(validateWorkflowPath(["submitted"])).toBe(true);
    });
    
    it("should handle empty path", () => {
      expect(validateWorkflowPath([])).toBe(true);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should prevent claim from jumping to completed without approval", () => {
      // Scenario: Claim tries to go from quotes_pending to completed
      expect(() => {
        validateStateTransition("quotes_pending", "completed");
      }).toThrow(TRPCError);
    });
    
    it("should prevent claim from skipping assessment", () => {
      // Scenario: Claim tries to go from submitted to quotes_pending
      expect(() => {
        validateStateTransition("submitted", "quotes_pending");
      }).toThrow(TRPCError);
    });
    
    it("should prevent reopening completed claim via normal transition", () => {
      // Scenario: Completed claim tries to go back to repair_in_progress
      // Note: Reopening should be handled by special reopenClaim procedure
      expect(() => {
        validateStateTransition("completed", "repair_in_progress");
      }).toThrow(TRPCError);
    });
    
    it("should allow early rejection at any stage", () => {
      // Scenario: Claim can be rejected at any point
      expect(validateStateTransition("submitted", "rejected")).toBe(true);
      expect(validateStateTransition("assessment_in_progress", "rejected")).toBe(true);
      expect(validateStateTransition("comparison", "rejected")).toBe(true);
    });
  });
});
