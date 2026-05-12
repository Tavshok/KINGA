"""
Patch server/routers/fleet-accounts.ts to:
1. Fix import to include fleetManagerRequests
2. Replace registerAsFleetManager + closing }); with the full new implementation
"""
import sys

with open('server/routers/fleet-accounts.ts', 'r') as f:
    content = f.read()

# ── 1. Fix the import line to include fleetManagerRequests ───────────────────
OLD_IMPORT = 'import { fleetAccounts, claims, users } from "../../drizzle/schema";'
NEW_IMPORT = 'import { fleetAccounts, claims, users, fleetManagerRequests } from "../../drizzle/schema";'

if OLD_IMPORT in content:
    content = content.replace(OLD_IMPORT, NEW_IMPORT, 1)
    print('Patch 1 applied: import updated')
else:
    # Already patched from previous run
    print('Patch 1 skipped: import already updated')

# ── 2. Use marker-based replacement ─────────────────────────────────────────
# Find the start of the registerAsFleetManager comment block
START_MARKER = '  /**\n   * Self-register as fleet manager for a company.\n   * The claimant provides the company name; if a matching fleet account exists,'
END_MARKER = '});'  # closing of the router

start_idx = content.find(START_MARKER)
if start_idx == -1:
    print('ERROR: start marker not found')
    sys.exit(1)

# Find the last });  which closes the router
end_idx = content.rfind(END_MARKER)
if end_idx == -1:
    print('ERROR: end marker not found')
    sys.exit(1)

end_idx += len(END_MARKER)  # include the });

print(f'Replacing from index {start_idx} to {end_idx} (length {end_idx - start_idx})')

NEW_TAIL = '''  /**
   * Self-register as fleet manager for a company.
   * Creates a pending fleet_manager_requests row for claims manager review.
   * Does NOT upgrade the user role yet — that happens on approval.
   * Safe to call multiple times; returns existing pending request if one exists.
   */
  registerAsFleetManager: protectedProcedure
    .input(z.object({
      companyName: z.string().min(2).max(255),
      companyReg: z.string().max(100).optional(),
      jobTitle: z.string().max(255).optional(),
      contactPhone: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const normalised = input.companyName.trim();
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      // Check for an existing pending/approved request from this user
      const [existing] = await db
        .select({ id: fleetManagerRequests.id, status: fleetManagerRequests.status, fleetAccountId: fleetManagerRequests.fleetAccountId })
        .from(fleetManagerRequests)
        .where(eq(fleetManagerRequests.userId, ctx.user.id))
        .orderBy(desc(fleetManagerRequests.createdAt))
        .limit(1);
      if (existing && existing.status === "approved") {
        return { success: true, requestId: existing.id, status: "approved" as const, message: "Your fleet manager access is already approved." };
      }
      if (existing && existing.status === "pending") {
        return { success: true, requestId: existing.id, status: "pending" as const, message: "Your fleet manager registration is already pending approval." };
      }
      // Find or create the fleet account (without granting access yet)
      const [account] = await db
        .select({ id: fleetAccounts.id, accountName: fleetAccounts.accountName })
        .from(fleetAccounts)
        .where(sql`LOWER(${fleetAccounts.accountName}) = LOWER(${normalised})`)
        .limit(1);
      let fleetAccountId: number | null = null;
      if (account) {
        fleetAccountId = account.id;
      } else {
        // Auto-create fleet account in pending state
        const accountCode = `FLT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const insertResult = await db.insert(fleetAccounts).values({
          ownerUserId: ctx.user.id,
          accountName: normalised,
          accountCode,
          status: "pending" as any,
          subscriptionTier: "free",
          vehicleCount: 0,
          verificationStatus: "pending" as any,
          notes: input.companyReg ? `Company Reg: ${input.companyReg}` : null,
          createdAt: now,
          updatedAt: now,
        } as any);
        fleetAccountId = (insertResult as any).insertId as number;
      }
      // Create the pending request row
      const reqResult = await db.insert(fleetManagerRequests).values({
        userId: ctx.user.id,
        fleetAccountId,
        companyName: normalised,
        companyReg: input.companyReg ?? null,
        jobTitle: input.jobTitle ?? null,
        contactPhone: input.contactPhone ?? null,
        status: "pending" as any,
        createdAt: now,
        updatedAt: now,
      } as any);
      const requestId = (reqResult as any).insertId as number;
      console.log(`[FleetAccounts] Fleet manager request created: requestId=${requestId} userId=${ctx.user.id} company=${normalised}`);
      return {
        success: true,
        requestId,
        fleetAccountId,
        status: "pending" as const,
        message: `Your fleet manager registration for ${normalised} has been submitted and is awaiting approval from a claims manager.`,
      };
    }),
  /**
   * Get the current user's fleet manager registration status.
   * Used by FleetManagerDashboard to gate access.
   */
  getMyRegistrationStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [request] = await db
        .select({
          id: fleetManagerRequests.id,
          status: fleetManagerRequests.status,
          companyName: fleetManagerRequests.companyName,
          fleetAccountId: fleetManagerRequests.fleetAccountId,
          reviewNotes: fleetManagerRequests.reviewNotes,
          createdAt: fleetManagerRequests.createdAt,
          reviewedAt: fleetManagerRequests.reviewedAt,
        })
        .from(fleetManagerRequests)
        .where(eq(fleetManagerRequests.userId, ctx.user.id))
        .orderBy(desc(fleetManagerRequests.createdAt))
        .limit(1);
      if (!request) return { status: "none" as const, request: null };
      return { status: request.status as "pending" | "approved" | "rejected", request };
    }),
  /**
   * List all fleet manager requests (filtered by status).
   * Accessible by claims managers and insurer admins only.
   */
  listPendingRequests: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const allowedRoles = ["claims_manager", "insurer_admin", "admin"];
      const allowedInsurerRoles = ["claims_manager", "insurer_admin"];
      const isAllowed =
        allowedRoles.includes((ctx.user as any).role ?? "") ||
        allowedInsurerRoles.includes((ctx.user as any).insurerRole ?? "");
      if (!isAllowed) throw new TRPCError({ code: "FORBIDDEN", message: "Claims manager access required" });
      const conditions = input.status === "all"
        ? undefined
        : eq(fleetManagerRequests.status, input.status as any);
      const rows = await db
        .select({
          id: fleetManagerRequests.id,
          userId: fleetManagerRequests.userId,
          fleetAccountId: fleetManagerRequests.fleetAccountId,
          companyName: fleetManagerRequests.companyName,
          companyReg: fleetManagerRequests.companyReg,
          jobTitle: fleetManagerRequests.jobTitle,
          contactPhone: fleetManagerRequests.contactPhone,
          status: fleetManagerRequests.status,
          reviewNotes: fleetManagerRequests.reviewNotes,
          reviewedAt: fleetManagerRequests.reviewedAt,
          createdAt: fleetManagerRequests.createdAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(fleetManagerRequests)
        .leftJoin(users, eq(users.id, fleetManagerRequests.userId))
        .where(conditions)
        .orderBy(desc(fleetManagerRequests.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return { requests: rows, total: rows.length };
    }),
  /**
   * Approve a fleet manager registration request.
   * Upgrades the user role to fleet_manager and marks the fleet account as approved.
   */
  approveFleetManagerRequest: protectedProcedure
    .input(z.object({
      requestId: z.number(),
      notes: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const allowedRoles = ["claims_manager", "insurer_admin", "admin"];
      const allowedInsurerRoles = ["claims_manager", "insurer_admin"];
      const isAllowed =
        allowedRoles.includes((ctx.user as any).role ?? "") ||
        allowedInsurerRoles.includes((ctx.user as any).insurerRole ?? "");
      if (!isAllowed) throw new TRPCError({ code: "FORBIDDEN", message: "Claims manager access required" });
      const [request] = await db
        .select()
        .from(fleetManagerRequests)
        .where(eq(fleetManagerRequests.id, input.requestId))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Request is already ${request.status}` });
      }
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      // 1. Mark request as approved
      await db.update(fleetManagerRequests)
        .set({ status: "approved" as any, reviewedByUserId: ctx.user.id, reviewedAt: now, reviewNotes: input.notes ?? null, updatedAt: now } as any)
        .where(eq(fleetManagerRequests.id, input.requestId));
      // 2. Upgrade user role to fleet_manager
      await db.update(users)
        .set({ role: "fleet_manager" as any, updatedAt: now } as any)
        .where(eq(users.id, request.userId));
      // 3. Mark fleet account as approved
      if (request.fleetAccountId) {
        await db.update(fleetAccounts)
          .set({ verificationStatus: "approved" as any, verifiedByUserId: ctx.user.id, verifiedAt: now, status: "active" as any, updatedAt: now } as any)
          .where(eq(fleetAccounts.id, request.fleetAccountId));
      }
      console.log(`[FleetAccounts] Request ${input.requestId} APPROVED by ${ctx.user.id}. User ${request.userId} upgraded to fleet_manager.`);
      return { success: true, message: `Fleet manager request approved. User granted fleet manager access for ${request.companyName}.` };
    }),
  /**
   * Reject a fleet manager registration request.
   */
  rejectFleetManagerRequest: protectedProcedure
    .input(z.object({
      requestId: z.number(),
      notes: z.string().min(1).max(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const allowedRoles = ["claims_manager", "insurer_admin", "admin"];
      const allowedInsurerRoles = ["claims_manager", "insurer_admin"];
      const isAllowed =
        allowedRoles.includes((ctx.user as any).role ?? "") ||
        allowedInsurerRoles.includes((ctx.user as any).insurerRole ?? "");
      if (!isAllowed) throw new TRPCError({ code: "FORBIDDEN", message: "Claims manager access required" });
      const [request] = await db
        .select({ id: fleetManagerRequests.id, status: fleetManagerRequests.status, userId: fleetManagerRequests.userId, companyName: fleetManagerRequests.companyName, fleetAccountId: fleetManagerRequests.fleetAccountId })
        .from(fleetManagerRequests)
        .where(eq(fleetManagerRequests.id, input.requestId))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Request is already ${request.status}` });
      }
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      await db.update(fleetManagerRequests)
        .set({ status: "rejected" as any, reviewedByUserId: ctx.user.id, reviewedAt: now, reviewNotes: input.notes, updatedAt: now } as any)
        .where(eq(fleetManagerRequests.id, input.requestId));
      if (request.fleetAccountId) {
        await db.update(fleetAccounts)
          .set({ verificationStatus: "rejected" as any, updatedAt: now } as any)
          .where(eq(fleetAccounts.id, request.fleetAccountId));
      }
      console.log(`[FleetAccounts] Request ${input.requestId} REJECTED by ${ctx.user.id}.`);
      return { success: true, message: `Fleet manager request for ${request.companyName} has been rejected.` };
    }),
});'''

content = content[:start_idx] + NEW_TAIL
print('Patch 2 applied: registerAsFleetManager rewritten + approval procedures added')

with open('server/routers/fleet-accounts.ts', 'w') as f:
    f.write(content)

print('SUCCESS: fleet-accounts.ts patched')
