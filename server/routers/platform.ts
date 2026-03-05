/**
 * Platform Router
 *
 * Provides admin-level operations accessible to users with role="admin"
 * (as opposed to platformUserRoles which requires platform_super_admin).
 *
 * Procedures:
 *   - platform.assignUserRole  — assign a role (and optional insurer sub-role) to any user
 *   - platform.listAllUsers    — list all users for the admin role-setup table
 *   - platform.simulateClaim   — generate a synthetic claim for workflow testing
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { router, adminProcedure } from "../_core/trpc";
import { users, claims, claimDocuments, panelBeaterQuotes } from "../../drizzle/schema";
import { triggerAiAssessment } from "../db";

// ─── Enums (kept in sync with drizzle schema) ─────────────────────────────────
const ASSIGNABLE_ROLES = [
  "claimant",
  "insurer",
  "admin",
] as const;

// Note: these values must match the mysqlEnum in drizzle/schema.ts users.insurerRole
const INSURER_ROLES = [
  "claims_processor",
  "internal_assessor",
  "risk_manager",
  "claims_manager",
  "executive",
] as const;

// ─── Simulation constants ──────────────────────────────────────────────────────

/** Damage-type → canonical parts list used by the AI pipeline. */
const DAMAGE_PARTS: Record<string, string[]> = {
  front_collision: ["Hood", "Front Bumper", "Front Grille", "Left Headlight", "Right Headlight", "Radiator Support", "Front Fender Left", "Front Fender Right"],
  rear_collision:  ["Rear Bumper", "Boot Lid", "Left Tail Light", "Right Tail Light", "Rear Apron", "Rear Panel"],
  side_collision:  ["Front Door Left", "Rear Door Left", "Left Sill", "Left Mirror", "Left A-Pillar"],
  hail_damage:     ["Hood", "Roof Panel", "Boot Lid", "Front Fender Left", "Front Fender Right", "Rear Quarter Panel Left", "Rear Quarter Panel Right"],
};

/** Base repair cost estimates (ZAR) per damage type × severity multiplier. */
const BASE_COSTS: Record<string, number> = {
  front_collision: 18_000,
  rear_collision:  12_000,
  side_collision:  9_000,
  hail_damage:     7_500,
};

const SEVERITY_MULTIPLIER: Record<string, number> = {
  minor:    0.4,
  moderate: 1.0,
  severe:   1.9,
};

/** Garage names used for simulated quotes. */
const GARAGE_NAMES = [
  "AutoFix Panel Shop",
  "Premier Body Works",
  "QuickRepair Centre",
  "Elite Collision Specialists",
];

// ─── Input schemas ─────────────────────────────────────────────────────────────
const assignUserRoleInput = z.object({
  userId: z.number().int().positive(),
  role: z.enum(ASSIGNABLE_ROLES),
  insurerRole: z.enum(INSURER_ROLES).optional(),
});

const simulateClaimInput = z.object({
  vehicleMake:       z.string().min(1).max(100),
  vehicleModel:      z.string().min(1).max(100),
  vehicleYear:       z.number().int().min(1980).max(new Date().getFullYear() + 1),
  damageType:        z.enum(["front_collision", "rear_collision", "side_collision", "hail_damage"]),
  estimatedSeverity: z.enum(["minor", "moderate", "severe"]),
  numberOfQuotes:    z.number().int().min(2).max(4),
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Generate quote amounts with deliberate outliers to stress-test cost optimisation. */
function generateQuoteAmounts(base: number, count: number): number[] {
  const amounts: number[] = [];
  for (let i = 0; i < count; i++) {
    let multiplier: number;
    if (i === 0) {
      // First quote: close to base (±5%)
      multiplier = 0.95 + Math.random() * 0.10;
    } else if (i === count - 1 && count >= 3) {
      // Last quote (when ≥3): deliberate outlier (+40–80%) to test fraud detection
      multiplier = 1.40 + Math.random() * 0.40;
    } else {
      // Middle quotes: ±15% variance
      multiplier = 0.85 + Math.random() * 0.30;
    }
    amounts.push(Math.round(base * multiplier));
  }
  return amounts;
}

/** Build a simple itemised breakdown string for a quote. */
function buildItemisedBreakdown(parts: string[], totalAmount: number): string {
  const perPart = Math.round(totalAmount / parts.length);
  return parts.map((p) => `${p}: R${perPart.toLocaleString()}`).join("\n");
}

// ─── Router ────────────────────────────────────────────────────────────────────
export const platformRouter = router({
  /**
   * Assign a role (and optional insurer sub-role) to a user.
   * Only accessible by users with role="admin".
   */
  assignUserRole: adminProcedure
    .input(assignUserRoleInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;

      if (ctx.user.id === input.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot change your own role.",
        });
      }

      const [target] = await db
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      const updatePayload: {
        role: (typeof ASSIGNABLE_ROLES)[number];
        insurerRole?: (typeof INSURER_ROLES)[number] | null;
      } = {
        role: input.role,
        insurerRole: input.role === "insurer" ? (input.insurerRole ?? null) : null,
      };

      await db
        .update(users)
        .set(updatePayload)
        .where(eq(users.id, input.userId));

      return {
        success: true,
        userId: input.userId,
        newRole: input.role,
        newInsurerRole: updatePayload.insurerRole ?? null,
      };
    }),

  /**
   * List all users for the admin role-setup table.
   */
  listAllUsers: adminProcedure.query(async ({ ctx }) => {
    const db = ctx.db;

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        insurerRole: users.insurerRole,
      })
      .from(users)
      .orderBy(users.email);

    return rows;
  }),

  /**
   * Generate a fully synthetic claim for workflow testing.
   *
   * Steps:
   *   1. Insert a claim record with is_simulated=1 and claimSource="simulator"
   *   2. Insert a placeholder claim_document (damage photo stub)
   *   3. Insert N panel_beater_quotes with deliberate cost variance
   *   4. Fire triggerAiAssessment as a background job (fire-and-forget)
   *
   * The claim is tagged with is_simulated=1 so it can be filtered out of
   * production dashboards and reports.
   */
  simulateClaim: adminProcedure
    .input(simulateClaimInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;

      // ── 1. Create the claim record ──────────────────────────────────────────
      const claimNumber = `SIM-${nanoid(10).toUpperCase()}`;
      const baseCost = Math.round(
        BASE_COSTS[input.damageType] * SEVERITY_MULTIPLIER[input.estimatedSeverity]
      );
      const parts = DAMAGE_PARTS[input.damageType];

      const incidentDate = new Date();
      incidentDate.setDate(incidentDate.getDate() - Math.floor(Math.random() * 14 + 1));

      await db.insert(claims).values({
        claimNumber,
        tenantId: ctx.user.tenantId ?? "simulator",
        vehicleMake: input.vehicleMake,
        vehicleModel: input.vehicleModel,
        vehicleYear: input.vehicleYear,
        vehicleRegistration: `SIM-${nanoid(6).toUpperCase()}`,
        incidentDate: incidentDate.toISOString().slice(0, 19).replace("T", " "),
        incidentDescription: `[SIMULATED] ${input.estimatedSeverity} ${input.damageType.replace(/_/g, " ")} on a ${input.vehicleYear} ${input.vehicleMake} ${input.vehicleModel}.`,
        incidentLocation: "Simulation Test Environment, Johannesburg",
        status: "submitted",
        workflowState: "created",
        claimSource: "simulator",
        isSimulated: 1,
        documentProcessingStatus: "pending",
        damagePhotos: JSON.stringify([
          "https://placehold.co/800x600/1a1a2e/ffffff?text=Simulated+Damage+Photo",
        ]),
        metadata: {
          simulatedDamageParts: parts,
          estimatedSeverity: input.estimatedSeverity,
          damageType: input.damageType,
          baseCostEstimate: baseCost,
          generatedAt: new Date().toISOString(),
        },
      });

      // Retrieve the inserted claim id
      const [inserted] = await db
        .select({ id: claims.id })
        .from(claims)
        .where(eq(claims.claimNumber, claimNumber))
        .limit(1);

      if (!inserted) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create simulated claim." });
      }
      const claimId = inserted.id;

      // ── 2. Insert a placeholder claim document ──────────────────────────────
      await db.insert(claimDocuments).values({
        claimId,
        uploadedBy: ctx.user.id,
        fileName: `simulated-damage-${claimNumber}.jpg`,
        fileKey: `simulator/${claimNumber}/damage-photo.jpg`,
        fileUrl: "https://placehold.co/800x600/1a1a2e/ffffff?text=Simulated+Damage+Photo",
        fileSize: 204_800, // 200 KB placeholder
        mimeType: "image/jpeg",
        documentTitle: "Simulated Damage Photo",
        documentDescription: `Auto-generated damage photo for simulation ${claimNumber}`,
        documentCategory: "damage_photo",
        visibleToRoles: JSON.stringify(["insurer", "assessor", "admin"]),
      });

      // ── 3. Insert panel beater quotes with deliberate variance ──────────────
      const quoteAmounts = generateQuoteAmounts(baseCost, input.numberOfQuotes);

      // We need at least one panel beater record — use a synthetic one if none exist
      // by inserting quotes with panelBeaterId = 0 (a sentinel for simulated garages).
      // In production, real panel beater IDs would be used.
      const quoteInserts = quoteAmounts.map((amount, idx) => ({
        claimId,
        panelBeaterId: 0, // Sentinel: simulated garage, not a real panel beater
        quotedAmount: amount,
        laborCost: Math.round(amount * 0.35),
        partsCost: Math.round(amount * 0.65),
        estimatedDuration: input.estimatedSeverity === "minor" ? 3 : input.estimatedSeverity === "moderate" ? 7 : 14,
        laborHours: input.estimatedSeverity === "minor" ? 8 : input.estimatedSeverity === "moderate" ? 20 : 40,
        itemizedBreakdown: buildItemisedBreakdown(parts, amount),
        notes: `[SIMULATED] Quote from ${GARAGE_NAMES[idx % GARAGE_NAMES.length]}. ${idx === input.numberOfQuotes - 1 && input.numberOfQuotes >= 3 ? "⚠ Outlier quote — intentionally inflated for cost optimisation testing." : ""}`,
        status: "submitted" as const,
        partsQuality: "aftermarket" as const,
        warrantyMonths: 12,
        tenantId: ctx.user.tenantId ?? "simulator",
        componentsJson: JSON.stringify(
          parts.map((part) => ({
            name: part,
            quantity: 1,
            unitPrice: Math.round(amount * 0.65 / parts.length),
            laborHours: Math.round((input.estimatedSeverity === "minor" ? 8 : input.estimatedSeverity === "moderate" ? 20 : 40) / parts.length),
          }))
        ),
      }));

      await db.insert(panelBeaterQuotes).values(quoteInserts);

      // ── 4. Trigger AI assessment (fire-and-forget) ──────────────────────────
      triggerAiAssessment(claimId).catch((err: unknown) => {
        console.error(`[SimulateClaim] AI assessment failed for claim ${claimId}:`, err);
      });

      return {
        success: true,
        claimId,
        claimNumber,
        isSimulated: true,
        vehicleMake: input.vehicleMake,
        vehicleModel: input.vehicleModel,
        vehicleYear: input.vehicleYear,
        damageType: input.damageType,
        estimatedSeverity: input.estimatedSeverity,
        baseCostEstimate: baseCost,
        quotesGenerated: quoteAmounts.length,
        quoteAmounts,
        garageNames: GARAGE_NAMES.slice(0, input.numberOfQuotes),
        damageParts: parts,
        message: `Simulated claim ${claimNumber} created with ${input.numberOfQuotes} quotes. AI assessment triggered in background.`,
      };
    }),
});
