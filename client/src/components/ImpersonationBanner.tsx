/**
 * ImpersonationBanner — Persistent, unmissable banner shown during impersonation sessions.
 * Visible on every screen. Shows who is being impersonated and provides an Exit button.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { COOKIE_NAME } from "@shared/const";
import { getLoginUrl } from "@/const";

export function ImpersonationBanner() {
  const { data: state } = trpc.impersonation.getState.useQuery(undefined, {
    retry: false,
    refetchInterval: 30_000, // re-check every 30s to catch expiry
  });
  const endMutation = trpc.impersonation.end.useMutation();
  const [, setLocation] = useLocation();
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    if (!state?.expiresAt) return;
    const update = () => {
      const ms = state.expiresAt - Date.now();
      if (ms <= 0) { setTimeLeft("Expired"); return; }
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      setTimeLeft(`${mins}m ${secs}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [state?.expiresAt]);

  if (!state?.isImpersonating) return null;

  const handleExit = async () => {
    try {
      await endMutation.mutateAsync();
    } catch { /* ignore — still exit */ }
    // Clear the impersonation cookie by redirecting to logout then back to admin
    // The simplest approach: redirect to /api/auth/logout which clears the cookie
    window.location.href = "/api/oauth/logout?returnTo=/platform/overview";
  };

  const role = state.targetUser.insurerRole
    ? `${state.targetUser.role}/${state.targetUser.insurerRole}`
    : state.targetUser.role;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: "rgba(220, 38, 38, 0.95)",
        color: "#fff",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "13px",
        fontWeight: 600,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <span>
        🔍 SUPERADMIN VIEW — Viewing as{" "}
        <strong>{state.targetUser.name || state.targetUser.email}</strong>
        {" "}({role}) · Expires in {timeLeft}
      </span>
      <button
        onClick={handleExit}
        disabled={endMutation.isPending}
        style={{
          background: "rgba(255,255,255,0.2)",
          border: "1px solid rgba(255,255,255,0.4)",
          color: "#fff",
          padding: "4px 12px",
          borderRadius: "4px",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: "12px",
        }}
      >
        {endMutation.isPending ? "Exiting..." : "Exit View As"}
      </button>
    </div>
  );
}
