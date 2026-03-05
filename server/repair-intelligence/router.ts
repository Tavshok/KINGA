/**
 * Quote Intelligence tRPC Router
 *
 * Procedures:
 *   quoteIntelligence.getReport  — generate the Repair Intelligence Report for a claim
 *
 * All procedures are read-only advisory — they do not modify any existing data.
 * Access is restricted to insurer roles (claims_processor, underwriter, etc.)
 * and assessors.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { generateIntelligenceReport } from "./quote-intelligence";

export const quoteIntelligenceRouter = router({
  /**
   * Generate the Repair Quote Intelligence report for a claim.
   *
   * Returns detected parts, quoted parts, reconciliation, historical deviation,
   * country context, and risk classification.
   *
   * This procedure is advisory only — it does not modify any claim data.
   */
  getReport: protectedProcedure
    .input(
      z.object({
        claimId: z.number().int().positive(),
        countryCode: z.string().length(2).default("ZA").optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { user } = ctx;

      // Allow insurer roles and assessors
      const allowedRoles = ["insurer", "assessor", "admin", "platform_super_admin"];
      if (!allowedRoles.includes(user.role ?? "")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only insurer users and assessors can view repair intelligence reports",
        });
      }

      const tenantId = user.tenantId;
      if (!tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User must belong to a tenant",
        });
      }

      const report = await generateIntelligenceReport(
        input.claimId,
        tenantId,
        input.countryCode ?? "ZA"
      );

      return report;
    }),
});
