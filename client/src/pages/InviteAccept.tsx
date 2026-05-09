/**
 * InviteAccept.tsx
 *
 * Public invitation acceptance page — accessible without authentication.
 *
 * Flow:
 *  1. Extract the token from the URL (/invite/accept/:token)
 *  2. Fetch invitation details (email, role, tenant name, expiry) via
 *     trpc.admin.getInvitationByToken (public procedure)
 *  3. If the user is already signed in AND their email matches the invitation,
 *     call trpc.admin.acceptInvitation to provision their account, then
 *     redirect to the insurer portal.
 *  4. If the user is not signed in, show the invitation details and a
 *     "Sign in with KINGA" button that encodes the return path so the OAuth
 *     callback brings them back here after authentication.
 *  5. Handle already-accepted and expired states gracefully.
 */

import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import KingaLogo from "@/components/KingaLogo";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  UserCheck,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

const ROLE_COLORS: Record<string, string> = {
  claims_processor:  "bg-emerald-100 text-emerald-700 border-emerald-200",
  assessor_internal: "bg-orange-100 text-orange-700 border-orange-200",
  risk_manager:      "bg-amber-100 text-amber-700 border-amber-200",
  claims_manager:    "bg-blue-100 text-blue-700 border-blue-200",
  executive:         "bg-violet-100 text-violet-700 border-violet-200",
  insurer_admin:     "bg-rose-100 text-rose-700 border-rose-200",
  recovery_officer:  "bg-lime-100 text-lime-700 border-lime-200",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function InviteAccept() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();

  const [accepted, setAccepted] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  // ── Fetch invitation details ──
  const {
    data: invitation,
    isLoading: invLoading,
    error: invError,
  } = trpc.admin.getInvitationByToken.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  // ── Accept mutation ──
  const acceptMutation = trpc.admin.acceptInvitation.useMutation({
    onSuccess: () => {
      setAccepted(true);
      // Redirect to insurer portal after a short delay
      setTimeout(() => setLocation("/insurer-portal"), 2500);
    },
    onError: (err) => {
      setAcceptError(err.message);
    },
  });

  // ── Auto-accept when user is signed in and email matches ──
  useEffect(() => {
    if (
      !authLoading &&
      user &&
      invitation &&
      !accepted &&
      !acceptMutation.isPending &&
      !acceptError
    ) {
      // Only auto-accept if the signed-in user's email matches the invitation
      if (user.email && user.email === invitation.email) {
        acceptMutation.mutate({
          token,
          name: user.name ?? user.email ?? "Unknown",
          openId: user.openId ?? user.id?.toString() ?? "",
        });
      }
    }
  }, [authLoading, user, invitation, accepted, acceptMutation.isPending]);

  // ─────────────────────────────────────────────────────────────────────────

  const isLoading = invLoading || authLoading;

  // ── Full-page loading ──
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          <p className="text-sm text-muted-foreground">Loading invitation…</p>
        </div>
      </div>
    );
  }

  // ── Error states ──
  const errorMessage = invError?.message ?? acceptError;
  if (errorMessage && !accepted) {
    const isExpired = errorMessage.toLowerCase().includes("expired");
    const isAlreadyAccepted = errorMessage.toLowerCase().includes("already been accepted");

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100 p-4">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <KingaLogo size="md" />
            </div>
            <div className="flex justify-center mb-3">
              {isAlreadyAccepted ? (
                <CheckCircle2 className="h-12 w-12 text-teal-500" />
              ) : (
                <XCircle className="h-12 w-12 text-destructive" />
              )}
            </div>
            <CardTitle className="text-xl">
              {isAlreadyAccepted
                ? "Invitation Already Accepted"
                : isExpired
                ? "Invitation Expired"
                : "Invalid Invitation"}
            </CardTitle>
            <CardDescription className="mt-1">
              {isAlreadyAccepted
                ? "This invitation has already been used. If you have an account, please sign in."
                : isExpired
                ? "This invitation link has expired. Please ask your administrator to send a new invitation."
                : errorMessage}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 flex justify-center">
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => setLocation("/login")}
            >
              Go to Sign In
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Success state ──
  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100 p-4">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <KingaLogo size="md" />
            </div>
            <div className="flex justify-center mb-3">
              <CheckCircle2 className="h-12 w-12 text-teal-500" />
            </div>
            <CardTitle className="text-xl">Welcome to KINGA!</CardTitle>
            <CardDescription className="mt-1">
              Your account has been set up successfully. Redirecting you to the portal…
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Invitation details + sign-in CTA ──
  if (!invitation) return null;

  const roleLabel = invitation.insurerRole
    ? toTitleCase(invitation.insurerRole)
    : toTitleCase(invitation.role);
  const roleColor = ROLE_COLORS[invitation.insurerRole ?? ""] ?? "bg-gray-100 text-gray-700 border-gray-200";

  // Build login URL that returns the user to this page after OAuth
  const returnPath = `/invite/accept/${token}`;
  const loginUrl = getLoginUrl(returnPath);

  // If user is signed in but email doesn't match
  const emailMismatch = user && user.email && user.email !== invitation.email;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100 p-4">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <KingaLogo size="md" />
          </div>
          <CardTitle className="text-xl">You've Been Invited!</CardTitle>
          <CardDescription className="mt-1">
            You have been invited to join the KINGA AI Insurance Platform.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Invitation details */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-4 w-4 text-teal-600 flex-shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Organisation</p>
                <p className="text-sm font-semibold">{invitation.tenantName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <UserCheck className="h-4 w-4 text-teal-600 flex-shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Your Role</p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${roleColor}`}>
                  {roleLabel}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Expires</p>
                <p className="text-sm">{fmtDate(invitation.expiresAt)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-teal-600 flex-shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Invited Email</p>
                <p className="text-sm font-mono">{invitation.email}</p>
              </div>
            </div>
          </div>

          {/* Email mismatch warning */}
          {emailMismatch && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              <p className="font-medium">Wrong account signed in</p>
              <p className="text-xs mt-0.5">
                You are currently signed in as <span className="font-mono">{user.email}</span>.
                This invitation is for <span className="font-mono">{invitation.email}</span>.
                Please sign out and sign in with the correct account.
              </p>
            </div>
          )}

          {/* CTA */}
          {!user ? (
            <div className="space-y-2">
              <Button
                className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => { window.location.href = loginUrl; }}
              >
                Sign in with KINGA to Accept
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                You will be redirected back here after signing in.
              </p>
            </div>
          ) : emailMismatch ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { window.location.href = loginUrl; }}
            >
              Sign in with a different account
            </Button>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
              <p className="text-sm text-muted-foreground">Setting up your account…</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
