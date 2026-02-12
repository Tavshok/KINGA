import * as Sentry from "@sentry/node";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Read version from package.json for release tracking
let version = "unknown";
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const packageJson = JSON.parse(
    readFileSync(join(__dirname, "../../package.json"), "utf-8")
  );
  version = packageJson.version || "unknown";
} catch (error) {
  console.error("Failed to read version from package.json:", error);
}

/**
 * Initialize Sentry for server-side error tracking
 * 
 * Features:
 * - Automatic error capture with stack traces
 * - Request context (user, tenantId, request details)
 * - Performance monitoring (10% sample rate)
 * - Environment-based configuration
 */
export function initializeSentry() {
  const sentryDsn = process.env.SENTRY_DSN;
  
  // Skip initialization if DSN not configured (development/testing)
  if (!sentryDsn) {
    console.log("[Sentry] DSN not configured, skipping initialization");
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV || "development",
    release: `kinga@${version}`,
    
    // Performance monitoring - 10% sample rate
    tracesSampleRate: 0.1,
    
    // Capture user context automatically
    beforeSend(event, hint) {
      // Add custom context if available
      if (hint.originalException) {
        console.error("[Sentry] Capturing error:", hint.originalException);
      }
      return event;
    },
  });

  console.log(`[Sentry] Initialized for environment: ${process.env.NODE_ENV || "development"}`);
}

/**
 * Capture an error with additional context
 * 
 * @param error - The error to capture
 * @param context - Additional context (user, tenantId, request details)
 */
export function captureError(
  error: Error,
  context?: {
    user?: { id: number; email?: string; tenantId?: string };
    tenantId?: string;
    request?: { method: string; url: string; body?: any };
    extra?: Record<string, any>;
  }
) {
  Sentry.withScope((scope) => {
    // Set user context
    if (context?.user) {
      scope.setUser({
        id: context.user.id.toString(),
        email: context.user.email,
      });
      scope.setTag("tenantId", context.user.tenantId || "unknown");
    }

    // Set tenant context
    if (context?.tenantId) {
      scope.setTag("tenantId", context.tenantId);
    }

    // Set request context
    if (context?.request) {
      scope.setContext("request", {
        method: context.request.method,
        url: context.request.url,
        body: context.request.body,
      });
    }

    // Set extra context
    if (context?.extra) {
      scope.setContext("extra", context.extra);
    }

    Sentry.captureException(error);
  });
}

/**
 * Capture a message (non-error event)
 * 
 * @param message - The message to capture
 * @param level - Severity level (info, warning, error)
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info"
) {
  Sentry.captureMessage(message, level);
}
