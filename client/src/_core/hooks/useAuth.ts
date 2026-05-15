import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isDevRoleOverrideEnabled,
  getDevRoleFromURL,
  generateMockUser,
  logDevRoleOverrideWarning,
  type MockUser,
} from "../devRoleOverride";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

/** Read the last known user from localStorage so we can show a non-null user
 *  while the server is warming up (cold start / restart). This prevents the
 *  ProtectedRoute from immediately redirecting to /login during transient
 *  server unavailability. The value is cleared on explicit logout. */
function getCachedUser(): any | null {
  try {
    const raw = localStorage.getItem("manus-runtime-user-info");
    if (!raw || raw === "null" || raw === "undefined") return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();

  // Dev role override state (only active in development)
  const [devMockUser, setDevMockUser] = useState<MockUser | null>(null);

  // Check for dev role override on mount
  useEffect(() => {
    if (isDevRoleOverrideEnabled()) {
      const devRole = getDevRoleFromURL();
      if (devRole) {
        const mockUser = generateMockUser(devRole);
        setDevMockUser(mockUser);
        logDevRoleOverrideWarning(devRole);
      }
    }
  }, []);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    // Retry on network/server errors (5xx, cold starts) but NOT on 401 Unauthorized
    retry: (failureCount, error) => {
      if (failureCount >= 3) return false;
      // Don't retry on explicit 401 (user is genuinely not authenticated)
      if (error && (error as any)?.data?.httpStatus === 401) return false;
      if (error && (error as any)?.data?.code === "UNAUTHORIZED") return false;
      // Retry on network errors / server restarts (503, 500, ECONNREFUSED, etc.)
      return true;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
    refetchOnWindowFocus: false,
    // Skip real auth query if dev role override is active
    enabled: !devMockUser,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
      // Clear cached user on explicit logout
      localStorage.removeItem("manus-runtime-user-info");
    },
  });

  const logout = useCallback(async () => {
    // If dev role override is active, just clear the mock user and reload
    if (devMockUser) {
      setDevMockUser(null);
      // Remove devRole query parameter and reload
      const url = new URL(window.location.href);
      url.searchParams.delete("devRole");
      window.location.href = url.toString();
      return;
    }

    // Normal logout flow
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      localStorage.removeItem("manus-runtime-user-info");
      await utils.auth.me.invalidate();
      // Redirect to home page after logout
      window.location.href = "/";
    }
  }, [logoutMutation, utils, devMockUser]);

  const state = useMemo(() => {
    // If dev role override is active, use mock user
    if (devMockUser) {
      localStorage.setItem(
        "manus-runtime-user-info",
        JSON.stringify(devMockUser)
      );
      return {
        user: devMockUser,
        loading: false,
        error: null,
        isAuthenticated: true,
        isDevOverride: true,
      };
    }

    // While the query is loading (including retries), use cached user from
    // localStorage so ProtectedRoute doesn't redirect during cold starts.
    const isQueryLoading = meQuery.isLoading || meQuery.isFetching;
    const cachedUser = isQueryLoading ? getCachedUser() : null;
    const resolvedUser = meQuery.data ?? cachedUser ?? null;

    // Persist the resolved user to localStorage (cleared on logout)
    if (meQuery.data) {
      localStorage.setItem(
        "manus-runtime-user-info",
        JSON.stringify(meQuery.data)
      );
    }

    // Only consider unauthenticated once the query has settled (not loading/retrying)
    // AND there is no cached user to fall back on.
    const settled = !meQuery.isLoading && !meQuery.isFetching;
    const isAuthenticated = settled
      ? Boolean(meQuery.data)
      : Boolean(resolvedUser);

    return {
      user: resolvedUser,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated,
      isDevOverride: false,
    };
  }, [
    devMockUser,
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    meQuery.isFetching,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || meQuery.isFetching || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    meQuery.isFetching,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
