import { describe, expect, it } from "vitest";
import { AUTH_TRANSACTION_TTL_MS } from "./auth-transaction-policy";
import {
  getAuthTransactionCookieOptions,
  getSessionCookieOptions,
} from "./cookies";

function requestForHost(hostname: string) {
  return { hostname } as Parameters<typeof getSessionCookieOptions>[0];
}

describe("authentication transaction cookie options", () => {
  it("uses a short-lived host-only HTTP-only Lax binding cookie on deployed hosts", () => {
    expect(
      getAuthTransactionCookieOptions(requestForHost("kinga.example.test"))
    ).toEqual({
      httpOnly: true,
      maxAge: AUTH_TRANSACTION_TTL_MS,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });

  it.each(["localhost", "127.0.0.1", "::1"])(
    "allows local HTTP development without broadening cookie scope: %s",
    hostname => {
      expect(getAuthTransactionCookieOptions(requestForHost(hostname))).toEqual(
        {
          httpOnly: true,
          maxAge: AUTH_TRANSACTION_TTL_MS,
          path: "/",
          sameSite: "lax",
          secure: false,
        }
      );
    }
  );

  it("does not change the existing KINGA session cookie contract", () => {
    expect(
      getSessionCookieOptions(requestForHost("kinga.example.test"))
    ).toEqual({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });
});
