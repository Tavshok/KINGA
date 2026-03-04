import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Executive-only procedure middleware
 * Validates that the user has insurerRole === "executive"
 * Ensures tenantId is present in session context
 */
const requireExecutive = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ 
      code: "UNAUTHORIZED", 
      message: "Authentication required" 
    });
  }

  if (!ctx.user.tenantId) {
    throw new TRPCError({ 
      code: "FORBIDDEN", 
      message: "User must be associated with a tenant to access analytics" 
    });
  }

  if (ctx.user.insurerRole !== 'executive') {
    throw new TRPCError({ 
      code: "FORBIDDEN", 
      message: "Only executives can access analytics endpoints" 
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const executiveOnlyProcedure = t.procedure.use(requireExecutive)

/**
 * Insurer Domain Procedure middleware
 *
 * Enforces backend-level tenant isolation for all insurer-facing procedures:
 * - Requires authenticated user
 * - Requires ctx.user.tenantId to be non-null (the insurer's tenant ID)
 * - Injects ctx.insurerTenantId for downstream query filtering
 * - Any attempt to access data outside this tenant must throw FORBIDDEN
 */
const requireInsurerDomain = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  const tenantId = ctx.user.tenantId;
  if (!tenantId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'User is not associated with an insurer tenant. Access denied.',
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      insurerTenantId: tenantId,
    },
  });
});

/**
 * Use this procedure for ALL insurer-facing endpoints.
 * It guarantees ctx.insurerTenantId is always a non-null string,
 * so every query MUST filter by this value to prevent cross-tenant leakage.
 */
export const insurerDomainProcedure = t.procedure.use(requireInsurerDomain);
