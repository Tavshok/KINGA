// @ts-nocheck
/**
 * Vehicle Structural Intelligence Router
 *
 * Procedures:
 *   vehicleStructural.getProfile          — Full structural profile for a vehicle (ANCAP + CRASH3 + NHTSA VIN)
 *   vehicleStructural.decodeVIN           — Decode a VIN via NHTSA vPIC API
 *   vehicleStructural.lookupSafetyRating  — Lookup ANCAP / Global NCAP Africa rating
 *   vehicleStructural.getCrash3Class      — Get CRASH3 stiffness coefficients for a vehicle
 *   vehicleStructural.getClaimProfile     — Get structural profile for a claim's vehicle(s)
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  buildVehicleStructuralProfile,
  decodeVINNHTSA,
  lookupANCAPRating,
  lookupGlobalNCAP,
  getCRASH3Class,
} from "../vehicle-structural-intelligence";
import { getDb } from "../db";
import { claims } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const vehicleStructuralIntelligenceRouter = router({
  /**
   * Full structural intelligence profile for a vehicle.
   * Combines NHTSA VIN decode, ANCAP/Global NCAP ratings, and CRASH3 coefficients.
   */
  getProfile: protectedProcedure
    .input(
      z.object({
        vin: z.string().optional(),
        make: z.string().min(1),
        model: z.string().min(1),
        year: z.number().int().min(1950).max(2030).optional(),
        counterpartMake: z.string().optional(),
        counterpartModel: z.string().optional(),
        counterpartYear: z.number().int().min(1950).max(2030).optional(),
        generateNarrative: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      return buildVehicleStructuralProfile({
        vin: input.vin,
        make: input.make,
        model: input.model,
        year: input.year,
        counterpartMake: input.counterpartMake,
        counterpartModel: input.counterpartModel,
        counterpartYear: input.counterpartYear,
        generateNarrative: input.generateNarrative,
      });
    }),

  /**
   * Decode a VIN using NHTSA vPIC API.
   */
  decodeVIN: protectedProcedure
    .input(
      z.object({
        vin: z.string().min(11).max(17),
      })
    )
    .query(async ({ input }) => {
      return decodeVINNHTSA(input.vin);
    }),

  /**
   * Lookup ANCAP and Global NCAP Africa safety ratings for a vehicle.
   */
  lookupSafetyRating: protectedProcedure
    .input(
      z.object({
        make: z.string().min(1),
        model: z.string().min(1),
        year: z.number().int().min(1950).max(2030).optional(),
      })
    )
    .query(async ({ input }) => {
      const ancap = lookupANCAPRating(input.make, input.model, input.year);
      const globalNcap = lookupGlobalNCAP(input.make, input.model);
      return { ancap, globalNcap };
    }),

  /**
   * Get CRASH3 stiffness coefficients for a vehicle.
   */
  getCrash3Class: protectedProcedure
    .input(
      z.object({
        make: z.string().min(1),
        model: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      return getCRASH3Class(input.make, input.model);
    }),

  /**
   * Get structural profile for a claim's insured and third-party vehicles.
   * Reads vehicle data directly from the claims table.
   */
  getClaimProfile: protectedProcedure
    .input(
      z.object({
        claimId: z.number().int().positive(),
        generateNarrative: z.boolean().default(true),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const [claim] = await db
        .select({
          vehicleMake: claims.vehicleMake,
          vehicleModel: claims.vehicleModel,
          vehicleYear: claims.vehicleYear,
          vehicleVin: claims.vehicleVin,
          thirdPartyVehicle: claims.thirdPartyVehicle,
          tenantId: claims.tenantId,
        })
        .from(claims)
        .where(eq(claims.id, input.claimId))
        .limit(1);

      if (!claim) return null;
      // Tenant isolation
      if (claim.tenantId && claim.tenantId !== ctx.user.tenantId) return null;

      // Parse third-party vehicle string (format: "Make Model Year" or JSON)
      let tpMake: string | undefined;
      let tpModel: string | undefined;
      let tpYear: number | undefined;
      if (claim.thirdPartyVehicle) {
        try {
          const parsed = JSON.parse(claim.thirdPartyVehicle);
          tpMake = parsed.make;
          tpModel = parsed.model;
          tpYear = parsed.year;
        } catch {
          // Try "Make Model Year" string format
          const parts = claim.thirdPartyVehicle.split(/\s+/);
          if (parts.length >= 2) {
            tpMake = parts[0];
            tpModel = parts.slice(1, -1).join(" ") || parts[1];
            const lastPart = parts[parts.length - 1];
            if (/^\d{4}$/.test(lastPart)) tpYear = parseInt(lastPart);
          }
        }
      }

      // Build insured vehicle profile
      const insuredProfile = claim.vehicleMake && claim.vehicleModel
        ? await buildVehicleStructuralProfile({
            vin: claim.vehicleVin ?? undefined,
            make: claim.vehicleMake,
            model: claim.vehicleModel,
            year: claim.vehicleYear ?? undefined,
            counterpartMake: tpMake,
            counterpartModel: tpModel,
            counterpartYear: tpYear,
            generateNarrative: input.generateNarrative,
          })
        : null;

      // Build third-party vehicle profile (no narrative to save LLM calls)
      const thirdPartyProfile = tpMake && tpModel
        ? await buildVehicleStructuralProfile({
            make: tpMake,
            model: tpModel,
            year: tpYear,
            counterpartMake: claim.vehicleMake ?? undefined,
            counterpartModel: claim.vehicleModel ?? undefined,
            counterpartYear: claim.vehicleYear ?? undefined,
            generateNarrative: false,
          })
        : null;

      return {
        claimId: input.claimId,
        insuredVehicle: insuredProfile,
        thirdPartyVehicle: thirdPartyProfile,
      };
    }),
});
