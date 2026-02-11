import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { extractTenantContext, type Tenant } from "./tenant-middleware";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  tenant: Tenant | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let tenant: Tenant | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // Extract tenant context if user is authenticated
  if (user) {
    try {
      tenant = await extractTenantContext({ req: opts.req, res: opts.res, user, tenant: null });
    } catch (error) {
      // Tenant extraction failure should not block request
      tenant = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    tenant,
  };
}
