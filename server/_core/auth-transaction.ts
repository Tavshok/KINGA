import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { AUTH_TRANSACTION_TTL_MS } from "./auth-transaction-policy";

/**
 * Package C1 is intentionally route-free. It defines the local, server-owned
 * transaction material that a later, separately approved callback can use.
 * No production store is provided here; Package D must inject a reviewed,
 * durable store with an atomic consume implementation.
 */
export type HumanAuthProvider = "workos";

export type PendingHumanAuthTransaction = {
  provider: HumanAuthProvider;
  stateHash: string;
  browserBindingHash: string;
  codeVerifier: string;
  redirectUri: string;
  returnTo: string;
  createdAt: Date;
  expiresAt: Date;
};

export type CreateHumanAuthTransactionInput = {
  provider: HumanAuthProvider;
  redirectUri: string;
  returnTo: string;
  now?: Date;
};

export type CreatedHumanAuthTransaction = {
  state: string;
  browserBinding: string;
  codeChallenge: string;
  expiresAt: Date;
};

export type ConsumeHumanAuthTransactionInput = {
  provider: HumanAuthProvider;
  state: string;
  browserBinding: string;
  now?: Date;
};

/**
 * Implementations must atomically return-and-remove (or mark consumed) exactly
 * one non-expired transaction. Package C1 supplies only test fakes.
 */
export interface HumanAuthTransactionStore {
  create(transaction: PendingHumanAuthTransaction): Promise<void>;
  consume(input: {
    provider: HumanAuthProvider;
    stateHash: string;
    browserBindingHash: string;
    now: Date;
  }): Promise<PendingHumanAuthTransaction | null>;
}

export type AuthTransactionErrorCode =
  | "AUTH_TRANSACTION_INVALID_RETURN_PATH"
  | "AUTH_TRANSACTION_INVALID_INPUT"
  | "AUTH_TRANSACTION_NOT_FOUND"
  | "AUTH_TRANSACTION_EXPIRED"
  | "AUTH_TRANSACTION_MISMATCH";

/** A deliberately generic error surface that never contains transaction secrets. */
export class AuthTransactionError extends Error {
  constructor(
    readonly code: AuthTransactionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AuthTransactionError";
  }
}

const OPAQUE_VALUE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function requireNonEmptyString(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_INVALID_INPUT",
      "Authentication transaction input is invalid."
    );
  }
}

function nowOrThrow(value: Date | undefined): Date {
  const now = value ?? new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_INVALID_INPUT",
      "Authentication transaction input is invalid."
    );
  }
  return now;
}

function hashOpaqueValue(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function createOpaqueValue(): string {
  return randomBytes(32).toString("base64url");
}

function requireOpaqueValue(value: unknown): asserts value is string {
  if (typeof value !== "string" || !OPAQUE_VALUE_PATTERN.test(value)) {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_INVALID_INPUT",
      "Authentication transaction input is invalid."
    );
  }
}

function decodeOnce(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_INVALID_RETURN_PATH",
      "Authentication return path is invalid."
    );
  }
}

function decodeToFixedPoint(value: string): string {
  let current = value;

  // The input is capped at 2,048 characters. Each successful percent decode
  // strictly reduces its encoded representation, so this loop terminates while
  // rejecting every reachable nested representation rather than guessing a
  // safe fixed depth.
  while (true) {
    const decoded = decodeOnce(current);
    if (decoded === current) return current;
    current = decoded;
  }
}

function hasUnsafePathCharacters(value: string): boolean {
  return /[\\\u0000-\u001f\u007f-\u009f]/.test(value);
}

function hasTraversalSegments(value: string): boolean {
  const pathEnd = value.search(/[?#]/);
  const pathname = pathEnd === -1 ? value : value.slice(0, pathEnd);
  return pathname
    .split("/")
    .some(segment => segment === "." || segment === "..");
}

/**
 * Restricts a post-login destination to a non-looping, root-relative KINGA
 * route. It never permits an origin to be supplied by the browser.
 */
export function normalizeAuthReturnPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_INVALID_RETURN_PATH",
      "Authentication return path is invalid."
    );
  }

  const canonical = decodeToFixedPoint(value);
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    !canonical.startsWith("/") ||
    canonical.startsWith("//") ||
    hasUnsafePathCharacters(canonical) ||
    hasTraversalSegments(canonical)
  ) {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_INVALID_RETURN_PATH",
      "Authentication return path is invalid."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(canonical, "https://kinga.invalid");
  } catch {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_INVALID_RETURN_PATH",
      "Authentication return path is invalid."
    );
  }

  if (
    parsed.origin !== "https://kinga.invalid" ||
    parsed.pathname.startsWith("//") ||
    hasUnsafePathCharacters(parsed.pathname)
  ) {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_INVALID_RETURN_PATH",
      "Authentication return path is invalid."
    );
  }

  const routePathname = parsed.pathname.replace(/\/+$/, "") || "/";
  if (routePathname === "/login" || routePathname === "/portal-hub") {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_INVALID_RETURN_PATH",
      "Authentication return path is invalid."
    );
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function requirePkceVerifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9\-._~]{43,128}$/.test(value)) {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_INVALID_INPUT",
      "Authentication transaction input is invalid."
    );
  }
}

/**
 * Derives the only PKCE challenge method supported by the WorkOS Package B
 * adapter. The verifier stays in the server-owned transaction record.
 */
export function deriveS256CodeChallenge(codeVerifier: string): string {
  requirePkceVerifier(codeVerifier);
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

function requireStore(
  value: unknown
): asserts value is HumanAuthTransactionStore {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as HumanAuthTransactionStore).create !== "function" ||
    typeof (value as HumanAuthTransactionStore).consume !== "function"
  ) {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_INVALID_INPUT",
      "Authentication transaction input is invalid."
    );
  }
}

/**
 * Creates a transaction without constructing a provider, setting a cookie,
 * registering a route, issuing a session, or accessing a database.
 */
export async function createHumanAuthTransaction(
  store: HumanAuthTransactionStore,
  input: CreateHumanAuthTransactionInput
): Promise<CreatedHumanAuthTransaction> {
  requireStore(store);
  if (!input || typeof input !== "object" || input.provider !== "workos") {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_INVALID_INPUT",
      "Authentication transaction input is invalid."
    );
  }

  requireNonEmptyString(input.redirectUri);
  const now = nowOrThrow(input.now);
  const returnTo = normalizeAuthReturnPath(input.returnTo);
  const state = createOpaqueValue();
  const browserBinding = createOpaqueValue();
  const codeVerifier = createOpaqueValue();
  const expiresAt = new Date(now.getTime() + AUTH_TRANSACTION_TTL_MS);

  await store.create({
    provider: input.provider,
    stateHash: hashOpaqueValue(state),
    browserBindingHash: hashOpaqueValue(browserBinding),
    codeVerifier,
    redirectUri: input.redirectUri,
    returnTo,
    createdAt: now,
    expiresAt,
  });

  return {
    state,
    browserBinding,
    codeChallenge: deriveS256CodeChallenge(codeVerifier),
    expiresAt,
  };
}

/**
 * Reads one transaction from an injected durable store. A future Package D
 * callback must invoke this before any provider code exchange.
 */
export async function consumeHumanAuthTransaction(
  store: HumanAuthTransactionStore,
  input: ConsumeHumanAuthTransactionInput
): Promise<PendingHumanAuthTransaction> {
  requireStore(store);
  if (!input || typeof input !== "object" || input.provider !== "workos") {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_INVALID_INPUT",
      "Authentication transaction input is invalid."
    );
  }

  requireOpaqueValue(input.state);
  requireOpaqueValue(input.browserBinding);
  const now = nowOrThrow(input.now);
  const stateHash = hashOpaqueValue(input.state);
  const browserBindingHash = hashOpaqueValue(input.browserBinding);
  const transaction = await store.consume({
    provider: input.provider,
    stateHash,
    browserBindingHash,
    now,
  });

  if (!transaction) {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_NOT_FOUND",
      "Authentication transaction is unavailable."
    );
  }

  if (
    transaction.provider !== input.provider ||
    !constantTimeEqual(transaction.stateHash, stateHash) ||
    !constantTimeEqual(transaction.browserBindingHash, browserBindingHash)
  ) {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_MISMATCH",
      "Authentication transaction is unavailable."
    );
  }

  if (
    !(transaction.expiresAt instanceof Date) ||
    transaction.expiresAt <= now
  ) {
    throw new AuthTransactionError(
      "AUTH_TRANSACTION_EXPIRED",
      "Authentication transaction has expired."
    );
  }

  return transaction;
}
