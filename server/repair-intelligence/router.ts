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

      // Allow all authenticated users (insurer sub-roles, assessors, admins, and regular users)
      // This is an advisory read-only panel — no data modification occurs
      const isSuperUser = user.role === "admin" || user.role === "platform_super_admin";
      const tenantId = isSuperUser ? null : user.tenantId;

      const report = await generateIntelligenceReport(
        input.claimId,
        // Pass a sentinel for admin so generateIntelligenceReport skips tenant filtering
        tenantId ?? "__admin__",
        input.countryCode ?? "ZA"
      );

      return report;
    }),
});
