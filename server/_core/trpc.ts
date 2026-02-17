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
