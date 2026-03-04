import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { getDb } from "../db";
import { tenantIsolationViolations, systemErrors } from "../../drizzle/schema";

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
 * Platform Super Admin procedure middleware
 *
 * Only platform_super_admin users can call procedures wrapped with this.
 * These users have no tenantId and have cross-tenant read + management access.
 */
const requireSuperAdmin = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  if (ctx.user.role !== 'platform_super_admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Platform super admin access required.',
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const superAdminProcedure = t.procedure.use(requireSuperAdmin);

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

// ─── Tenant Isolation Violation Logger ───────────────────────────────────────

/**
 * Asynchronously logs a tenant isolation FORBIDDEN event to the
 * tenant_isolation_violations table.
 *
 * Design constraints:
 * - Fire-and-forget: the promise is intentionally not awaited so that
 *   a DB write failure NEVER blocks or delays the FORBIDDEN exception
 *   being thrown to the caller.
 * - All errors are swallowed and written to stderr only, ensuring zero
 *   performance regression on the hot path.
 */
function logTenantIsolationViolation(params: {
  userId: number | null;
  userTenantId: string | null;
  targetTenantId: string | null;
  procedureName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}): void {
  // Intentionally not awaited — fire-and-forget
  (async () => {
    try {
      const db = await getDb();
      if (!db) return; // DB unavailable — skip logging, never throw
      await db.insert(tenantIsolationViolations).values({
        userId: params.userId ?? undefined,
        userTenantId: params.userTenantId ?? undefined,
        targetTenantId: params.targetTenantId ?? undefined,
        procedureName: params.procedureName ?? undefined,
        ipAddress: params.ipAddress ?? undefined,
        userAgent: params.userAgent ?? undefined,
      });
    } catch (err) {
      // Logging failure must never surface to the caller
      console.error("[TenantIsolation] Failed to write violation log:", err);
    }
  })();
}

/**
 * Extracts the client IP from the request, honouring X-Forwarded-For
 * when the app is behind a proxy/load balancer.
 */
function extractIp(req: TrpcContext["req"] | undefined): string | null {
  if (!req) return null;
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return (first ?? "").trim() || null;
  }
  return (req as any).ip ?? null;
}

/**
 * Extracts the procedure path from the tRPC middleware options.
 * tRPC v11 exposes the path on opts.path.
 */
function extractProcedureName(opts: { path?: string }): string | null {
  return opts.path ?? null;
}

// ─── Insurer Domain Procedure middleware ─────────────────────────────────────

/**
 * Insurer Domain Procedure middleware
 *
 * Enforces backend-level tenant isolation for all insurer-facing procedures:
 * - Requires authenticated user → throws UNAUTHORIZED (not logged as violation)
 * - Requires ctx.user.tenantId to be non-null → throws FORBIDDEN (logged)
 * - Injects ctx.insurerTenantId for downstream query filtering
 * - Any attempt to access data outside this tenant must throw FORBIDDEN
 *
 * Violation logging:
 * - FORBIDDEN events are asynchronously written to tenant_isolation_violations
 * - Logging is fire-and-forget; failure never blocks the exception
 * - UNAUTHORIZED events are NOT logged (no tenant context to record)
 */
const requireInsurerDomain = t.middleware(async opts => {
  const { ctx, next } = opts;

  // ── 1. Authentication check ───────────────────────────────────────────────
  // UNAUTHORIZED is not a tenant isolation violation — the user simply has no
  // session. Do NOT log this to the violation table.
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  // ── 2. Tenant isolation check ─────────────────────────────────────────────
  // A missing tenantId on an authenticated user IS a tenant isolation violation:
  // the user has a valid session but is not scoped to any insurer tenant.
  const tenantId = ctx.user.tenantId;
  if (!tenantId) {
    // Log asynchronously — do not await
    logTenantIsolationViolation({
      userId: ctx.user.id,
      userTenantId: null,
      targetTenantId: null,
      procedureName: extractProcedureName(opts as any),
      ipAddress: extractIp(ctx.req),
      userAgent: ctx.req?.headers?.["user-agent"] as string ?? null,
    });

    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'User is not associated with an insurer tenant. Access denied.',
    });
  }

  // ── 3. Proceed — inject insurerTenantId ──────────────────────────────────
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

// ─── Global Error Logger ─────────────────────────────────────────────────────

/**
 * Asynchronously writes an unhandled procedure error to the system_errors table.
 * Fire-and-forget — never throws, never blocks the original exception.
 */
function logSystemError(params: {
  procedureName: string | null;
  userId: number | null;
  tenantId: string | null;
  errorMessage: string;
  stackTrace: string | null;
  errorCode: string | null;
}): void {
  (async () => {
    try {
      const db = await getDb();
      if (!db) return;
      await db.insert(systemErrors).values({
        procedureName: params.procedureName ?? undefined,
        userId: params.userId ?? undefined,
        tenantId: params.tenantId ?? undefined,
        errorMessage: params.errorMessage.slice(0, 500),
        stackTrace: params.stackTrace?.slice(0, 4000) ?? undefined,
        errorCode: params.errorCode ?? undefined,
      });
    } catch (err) {
      console.error("[SystemErrorLog] Failed to write error log:", err);
    }
  })();
}

/**
 * Global error logger middleware.
 * Wraps every procedure — catches unhandled errors, logs them to system_errors,
 * then re-throws so the caller still receives the original error.
 *
 * Only logs INTERNAL_SERVER_ERROR and unexpected errors.
 * Intentionally skips expected client errors (UNAUTHORIZED, FORBIDDEN, NOT_FOUND,
 * BAD_REQUEST, PRECONDITION_FAILED) to avoid noise in the error log.
 */
const SKIP_CODES = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "BAD_REQUEST",
  "PRECONDITION_FAILED",
  "CONFLICT",
  "UNPROCESSABLE_CONTENT",
]);

const globalErrorLogger = t.middleware(async opts => {
  const { ctx, next } = opts;
  try {
    return await next();
  } catch (err) {
    const isTrpc = err instanceof TRPCError;
    const code = isTrpc ? err.code : "INTERNAL_SERVER_ERROR";

    if (!SKIP_CODES.has(code)) {
      logSystemError({
        procedureName: (opts as any).path ?? null,
        userId: ctx.user?.id ?? null,
        tenantId: ctx.user?.tenantId ?? null,
        errorMessage: err instanceof Error ? err.message : String(err),
        stackTrace: err instanceof Error ? (err.stack ?? null) : null,
        errorCode: code,
      });
    }

    throw err; // Always re-throw — never swallow
  }
});

/**
 * Base procedure with global error logging.
 * All exported procedure builders below are derived from this.
 */
const loggedProcedure = t.procedure.use(globalErrorLogger);

// Re-export public procedure with error logging
export { loggedProcedure as publicProcedureWithLogging };

// ─── Exported helpers (for testing) ──────────────────────────────────────────
export { logTenantIsolationViolation, extractIp, logSystemError };
