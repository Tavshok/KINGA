/**
 * Phase 9 — Personal Vehicle Registry
 * tRPC procedures for individual client-owned vehicles.
 * Distinct from corporate fleet vehicles (fleet_accounts / fleet_vehicles tables).
 * Any authenticated user can manage their personal vehicles here.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { personalVehicles } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const personalVehiclesRouter = router({
  /**
   * List all personal vehicles for the current user.
   */
  listMyVehicles: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.select()
        .from(personalVehicles)
        .where(eq(personalVehicles.userId, ctx.user.id))
        .orderBy(desc(personalVehicles.isPrimary), desc(personalVehicles.createdAt));
      return rows;
    }),

  /**
   * Add a personal vehicle.
   */
  addVehicle: protectedProcedure
    .input(z.object({
      make: z.string().min(1).max(100),
      model: z.string().min(1).max(100),
      year: z.number().int().min(1970).max(new Date().getFullYear() + 1),
      registration: z.string().max(50).optional(),
      vin: z.string().max(50).optional(),
      colour: z.string().max(50).optional(),
      engineSize: z.string().max(20).optional(),
      fuelType: z.enum(['petrol','diesel','electric','hybrid','other']).default('petrol'),
      notes: z.string().max(1000).optional(),
      isPrimary: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // If marking as primary, unset existing primary
      if (input.isPrimary) {
        await db.update(personalVehicles)
          .set({ isPrimary: 0 } as any)
          .where(eq(personalVehicles.userId, ctx.user.id));
      }
      const [result] = await db.insert(personalVehicles).values({
        userId: ctx.user.id,
        make: input.make,
        model: input.model,
        year: input.year,
        registration: input.registration ?? null,
        vin: input.vin ?? null,
        colour: input.colour ?? null,
        engineSize: input.engineSize ?? null,
        fuelType: input.fuelType,
        notes: input.notes ?? null,
        isPrimary: input.isPrimary ? 1 : 0,
      } as any);
      return { success: true, id: (result as any).insertId };
    }),

  /**
   * Update a personal vehicle (owner only).
   */
  updateVehicle: protectedProcedure
    .input(z.object({
      id: z.number(),
      make: z.string().min(1).max(100).optional(),
      model: z.string().min(1).max(100).optional(),
      year: z.number().int().min(1970).max(new Date().getFullYear() + 1).optional(),
      registration: z.string().max(50).optional(),
      vin: z.string().max(50).optional(),
      colour: z.string().max(50).optional(),
      engineSize: z.string().max(20).optional(),
      fuelType: z.enum(['petrol','diesel','electric','hybrid','other']).optional(),
      notes: z.string().max(1000).optional(),
      isPrimary: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [existing] = await db.select()
        .from(personalVehicles)
        .where(and(eq(personalVehicles.id, input.id), eq(personalVehicles.userId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
      if (input.isPrimary) {
        await db.update(personalVehicles)
          .set({ isPrimary: 0 } as any)
          .where(eq(personalVehicles.userId, ctx.user.id));
      }
      const { id, ...updates } = input;
      await db.update(personalVehicles)
        .set({
          ...Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined)),
          isPrimary: input.isPrimary !== undefined ? (input.isPrimary ? 1 : 0) : existing.isPrimary,
        } as any)
        .where(and(eq(personalVehicles.id, input.id), eq(personalVehicles.userId, ctx.user.id)));
      return { success: true };
    }),

  /**
   * Delete a personal vehicle (owner only).
   */
  deleteVehicle: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [existing] = await db.select()
        .from(personalVehicles)
        .where(and(eq(personalVehicles.id, input.id), eq(personalVehicles.userId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
      await db.delete(personalVehicles)
        .where(and(eq(personalVehicles.id, input.id), eq(personalVehicles.userId, ctx.user.id)));
      return { success: true };
    }),
});
