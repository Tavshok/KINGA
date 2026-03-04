import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { extractTenantContext, type Tenant } from "./tenant-middleware";
import { getDb } from "../db";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../drizzle/schema";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  tenant: Tenant | null;
  db: MySql2Database<typeof schema>;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let tenant: Tenant | null = null;

  // Resolve db first so it can be passed to extractTenantContext
  const rawDb = await getDb();
  // Cast: at runtime the DB is always initialised before requests arrive.
  // If it is null the server would have failed to start, so this cast is safe.
  const db = rawDb as unknown as MySql2Database<typeof schema>;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    // Authentication is optional for public procedures.
    user = null;
  }

  // Extract tenant context if user is authenticated
  if (user) {
    try {
      const partialCtx: TrpcContext = {
        req: opts.req,
        res: opts.res,
        user,
        tenant: null,
        db,
      };
      tenant = await extractTenantContext(partialCtx);
    } catch {
      // Tenant extraction failure should not block request
      tenant = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    tenant,
    db,
  };
}
