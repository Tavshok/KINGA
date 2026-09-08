import { describe, expect, it, vi } from "vitest";

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
}));

vi.mock("../client/src/pages/PortalSelection", () => ({
  default: () => null,
}));

import Home from "../client/src/pages/Home";

describe("Home public root bootstrap", () => {
  it("evaluates with an unauthenticated auth context and creates the portal-selection view", () => {
    const view = Home() as { props: { loggedInUser: unknown; onGoToPortal: () => void } };

    expect(view.props.loggedInUser).toBeNull();
    expect(view.props.onGoToPortal).toBeTypeOf("function");
  });
});
