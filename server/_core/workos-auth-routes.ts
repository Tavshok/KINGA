import { parse as parseCookie } from "cookie";
import type { NextFunction, Request, Response, Router } from "express";
import express from "express";
import rateLimit from "express-rate-limit";

import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

import {
  consumeHumanAuthTransaction,
  createHumanAuthTransaction,
  normalizeAuthReturnPath,
  type CreatedHumanAuthTransaction,
  type HumanAuthTransactionStore,
} from "./auth-transaction";
import {
  getAuthTransactionCookieOptions,
  getSessionCookieOptions,
} from "./cookies";
import { sdk } from "./sdk";
import {
  createWorkOSAuthProvider,
  getWorkOSProviderConfig,
  type WorkOSAuthProvider,
} from "./workos";
import {
  WORKOS_AUTH_BINDING_COOKIE_NAME,
  WORKOS_AUTH_CALLBACK_PATH,
  WORKOS_AUTH_FAILURE_RETURN_PATH,
  WORKOS_AUTH_START_PATH,
} from "./workos-auth-constants";
import { DatabaseHumanAuthTransactionStore } from "./workos-auth-transaction-store";
import {
  linkExistingWorkOSIdentity,
  type LinkedWorkOSUser,
  type WorkOSLocalLinkAudit,
} from "./workos-local-link";

export type WorkOSRouteDependencies = {
  provider?: WorkOSAuthProvider;
  /** Test-only injection; production reads the validated WorkOS configuration. */
  redirectUri?: string;
  transactionStore?: HumanAuthTransactionStore & {
    discardByState?(state: string): Promise<void>;
  };
  linkIdentity?: (
    identity: Awaited<ReturnType<WorkOSAuthProvider["exchangeCode"]>>,
    audit: WorkOSLocalLinkAudit
  ) => Promise<LinkedWorkOSUser>;
  issueSession?: (input: {
    openId: string;
    name: string | null;
  }) => Promise<string>;
  startLimiter?: (req: Request, res: Response, next: NextFunction) => void;
  onLinkDenied?: WorkOSLocalLinkAudit["onDenied"];
};

const genericFailureHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function readSingleQueryValue(req: Request, name: string): string | null {
  const value = req.query[name];
  return typeof value === "string" ? value : null;
}

function hasOnlySingleQueryValue(req: Request, name: string): boolean {
  const value = req.query[name];
  return typeof value === "string";
}

function readBindingCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  try {
    const value = parseCookie(header)[WORKOS_AUTH_BINDING_COOKIE_NAME];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function clearBindingCookie(req: Request, res: Response): void {
  const { maxAge: _maxAge, ...clearOptions } =
    getAuthTransactionCookieOptions(req);
  res.clearCookie(WORKOS_AUTH_BINDING_COOKIE_NAME, {
    ...clearOptions,
  });
}

function redirectFailure(req: Request, res: Response): void {
  clearBindingCookie(req, res);
  res.set(genericFailureHeaders).redirect(302, WORKOS_AUTH_FAILURE_RETURN_PATH);
}

async function invalidateJustCreatedTransaction(
  store: WorkOSRouteDependencies["transactionStore"],
  created: CreatedHumanAuthTransaction | undefined
): Promise<void> {
  if (!created || !store?.discardByState) return;
  try {
    await store.discardByState(created.state);
  } catch {
    // The route remains failed and does not redirect to WorkOS. The next store
    // operation deletes expired rows; operational cleanup is separately owned.
  }
}

function defaultStartLimiter() {
  return rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "AUTHENTICATION_UNAVAILABLE" },
  });
}

/**
 * Constructs the otherwise-unmounted WorkOS human-auth router. The server index
 * mounts it only when WORKOS_HUMAN_AUTH_ENABLED is exactly "true".
 */
export function createWorkOSHumanAuthRouter(
  dependencies: WorkOSRouteDependencies = {}
): Router {
  const router = express.Router();
  const transactionStore =
    dependencies.transactionStore ?? new DatabaseHumanAuthTransactionStore();
  const provider =
    dependencies.provider ??
    createWorkOSAuthProvider(getWorkOSProviderConfig(process.env));
  const redirectUri =
    dependencies.redirectUri ??
    getWorkOSProviderConfig(process.env).redirectUri;
  const linkIdentity = dependencies.linkIdentity ?? linkExistingWorkOSIdentity;
  const issueSession =
    dependencies.issueSession ??
    (async ({ openId, name }) =>
      await sdk.createSessionToken(openId, {
        name: name ?? openId,
        expiresInMs: ONE_YEAR_MS,
      }));
  const onLinkDenied =
    dependencies.onLinkDenied ??
    (reason => {
      // Fixed category only: no state, code, provider identity, email, tenant,
      // or WorkOS organization value is emitted to logs.
      console.warn(`[WorkOS] Human-auth admission denied: ${reason}`);
    });

  router.get(
    "/start",
    dependencies.startLimiter ?? defaultStartLimiter(),
    async (req, res) => {
      let created: CreatedHumanAuthTransaction | undefined;
      try {
        if (
          Object.keys(req.query).some(key => key !== "returnTo") ||
          (req.query.returnTo !== undefined &&
            !hasOnlySingleQueryValue(req, "returnTo"))
        ) {
          throw new Error("Invalid start request");
        }
        const returnTo = readSingleQueryValue(req, "returnTo") ?? "/";
        created = await createHumanAuthTransaction(transactionStore, {
          provider: "workos",
          redirectUri,
          returnTo,
        });

        res.cookie(
          WORKOS_AUTH_BINDING_COOKIE_NAME,
          created.browserBinding,
          getAuthTransactionCookieOptions(req)
        );

        const authorizationUrl = await provider.getAuthorizationUrl({
          redirectUri,
          state: created.state,
          codeChallenge: created.codeChallenge,
        });
        res.set(genericFailureHeaders).redirect(302, authorizationUrl);
      } catch {
        clearBindingCookie(req, res);
        await invalidateJustCreatedTransaction(transactionStore, created);
        res
          .set(genericFailureHeaders)
          .status(503)
          .json({ error: "AUTHENTICATION_UNAVAILABLE" });
      }
    }
  );

  router.get("/callback", async (req, res) => {
    try {
      // OAuth's state and code are deliberately allowed only at this required
      // provider callback boundary. Duplicates, provider errors, or unexpected
      // query values cannot proceed to exchange or session issuance.
      if (
        Object.keys(req.query).some(
          key => !["code", "state", "error"].includes(key)
        ) ||
        !hasOnlySingleQueryValue(req, "code") ||
        !hasOnlySingleQueryValue(req, "state") ||
        req.query.error !== undefined
      ) {
        return redirectFailure(req, res);
      }

      const state = readSingleQueryValue(req, "state");
      const code = readSingleQueryValue(req, "code");
      const browserBinding = readBindingCookie(req);
      if (!state || !code || !browserBinding) {
        return redirectFailure(req, res);
      }

      const transaction = await consumeHumanAuthTransaction(transactionStore, {
        provider: "workos",
        state,
        browserBinding,
      });
      // The durable record is still treated as untrusted input at the browser
      // boundary. A corrupt record cannot choose another callback URI or turn
      // the final redirect into an external destination.
      if (transaction.redirectUri !== redirectUri) {
        throw new Error("Stored redirect URI mismatch");
      }
      const returnTo = normalizeAuthReturnPath(transaction.returnTo);

      const identity = await provider.exchangeCode({
        code,
        codeVerifier: transaction.codeVerifier,
      });
      const linked = await linkIdentity(identity, { onDenied: onLinkDenied });
      const sessionToken = await issueSession({
        openId: linked.openId,
        name: linked.name,
      });

      clearBindingCookie(req, res);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });
      res.set(genericFailureHeaders).redirect(302, returnTo);
    } catch {
      redirectFailure(req, res);
    }
  });

  return router;
}

/** The exact paths are exported for composition and route-invariance tests. */
export const WORKOS_HUMAN_AUTH_ROUTE_PATHS = {
  start: WORKOS_AUTH_START_PATH,
  callback: WORKOS_AUTH_CALLBACK_PATH,
} as const;
