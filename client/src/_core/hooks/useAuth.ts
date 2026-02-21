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
    retry: false,
    refetchOnWindowFocus: false,
    // Skip real auth query if dev role override is active
    enabled: !devMockUser,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
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
        isDevOverride: true, // Flag to indicate dev override is active
      };
    }

    // Normal auth state
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(meQuery.data)
    );
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
      isDevOverride: false,
    };
  }, [
    devMockUser,
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
