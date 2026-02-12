import * as Sentry from "@sentry/react";

/**
 * Initialize Sentry for client-side error tracking
 * 
 * Features:
 * - Automatic error capture with stack traces
 * - User context tracking
 * - Performance monitoring
 * - React error boundaries
 */
export function initializeSentry() {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  
  // Skip initialization if DSN not configured (development/testing)
  if (!sentryDsn) {
    console.log("[Sentry] DSN not configured, skipping client initialization");
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE || "development",
    
    // Performance monitoring - 10% sample rate
    tracesSampleRate: 0.1,
    
    // React-specific integrations
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    
    // Session replay - 10% sample rate
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });

  console.log(`[Sentry] Client initialized for environment: ${import.meta.env.MODE || "development"}`);
}

/**
 * Set user context for error tracking
 * 
 * @param user - User information to attach to errors
 */
export function setUser(user: { id: number; email?: string; tenantId?: string } | null) {
  if (user) {
    Sentry.setUser({
      id: user.id.toString(),
      email: user.email,
    });
    Sentry.setTag("tenantId", user.tenantId || "unknown");
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Capture an error with additional context
 * 
 * @param error - The error to capture
 * @param context - Additional context
 */
export function captureError(
  error: Error,
  context?: {
    extra?: Record<string, any>;
  }
) {
  Sentry.withScope((scope) => {
    if (context?.extra) {
      scope.setContext("extra", context.extra);
    }
    Sentry.captureException(error);
  });
}
