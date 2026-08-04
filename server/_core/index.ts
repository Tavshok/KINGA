import "dotenv/config";
// Initialize Sentry FIRST for error tracking
import { initializeSentry } from "./sentry";
initializeSentry();

// ── PROCESS STABILITY GUARD ──────────────────────────────────────────────────
// Prevent unhandled errors from crashing the server process.
// The pipeline runs in-process and can throw unhandled rejections or exceptions
// that would otherwise terminate the Node.js process, causing 503 on next request.
process.on('uncaughtException', (err) => {
  console.error('[PROCESS] Uncaught exception (server NOT crashing):', err?.message ?? err);
  console.error('[PROCESS] Stack:', err?.stack ?? 'No stack');
  // Do NOT call process.exit() — keep the server alive
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[PROCESS] Unhandled rejection (server NOT crashing):', reason);
  // Do NOT call process.exit() — keep the server alive
});

// ── MEMORY MONITORING ────────────────────────────────────────────────────────
// Log memory usage every 60s so we can detect leaks before they cause OOM.
// Also trigger manual GC when heap exceeds 80% of the limit (1.2GB of 1.5GB).
const HEAP_GC_THRESHOLD = 1.2 * 1024 * 1024 * 1024; // 1.2 GB
setInterval(() => {
  const mem = process.memoryUsage();
  const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(0);
  const rssMB = (mem.rss / 1024 / 1024).toFixed(0);
  const externalMB = (mem.external / 1024 / 1024).toFixed(0);
  console.log(`[MEMORY] heap=${heapMB}MB rss=${rssMB}MB external=${externalMB}MB`);
  // Trigger GC when heap is high (--expose-gc must be set)
  if (mem.heapUsed > HEAP_GC_THRESHOLD && typeof globalThis.gc === 'function') {
    console.log('[MEMORY] Heap exceeds threshold — triggering manual GC');
    globalThis.gc();
    const after = process.memoryUsage();
    console.log(`[MEMORY] Post-GC: heap=${(after.heapUsed / 1024 / 1024).toFixed(0)}MB rss=${(after.rss / 1024 / 1024).toFixed(0)}MB`);
  }
}, 60_000);

import express from "express";
import { createServer } from "http";
import net from "net";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { uploadAssessmentRouter } from "../upload-assessment";
import { uploadDocumentsRouter } from "../upload-documents";
import { setupWebSocketServer } from "../websocket";
import { runIntakeEscalationJob, startIntakeEscalationJob } from "../intake-escalation-job";
import { runStuckAssessmentRecoveryJob, startStuckAssessmentRecoveryJob } from "../stuck-assessment-recovery-job";
import { checkRecoveryDeadlines } from "../recovery/recoveryDeadlineAlerts";
import { sdk } from "./sdk";
import { ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// ── R-INF-08: DATABASE_URL startup validation ────────────────────────────────
// Hard fail in production if DATABASE_URL is absent — the server cannot serve
// any meaningful request without a database. In development/test, emit a warning
// and allow boot to continue so local dev without a DB still works.
function validateStartupEnv(): void {
  if (!process.env.DATABASE_URL) {
    const msg = '[STARTUP] FATAL: DATABASE_URL environment variable is not set. The server cannot start without a database connection.';
    if (process.env.NODE_ENV === 'production') {
      console.error(msg);
      process.exit(1);
    } else {
      console.warn('[STARTUP] WARNING: DATABASE_URL is not set. DB-dependent features will be unavailable. Set DATABASE_URL to enable full functionality.');
    }
  }
}
validateStartupEnv();

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Trust proxy for rate limiting (required for X-Forwarded-For)
  app.set('trust proxy', 1);
  
  // Rate limiters
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per window — pipeline polling + normal usage needs headroom
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // 10 auth attempts per window
    message: { error: 'Too many authentication attempts.' },
  });

  // Configure body parser with size limits.
  // IMPORTANT: per-route overrides must be registered BEFORE the global 1 MB parser
  // because Express applies the first matching body-parser and stops.
  app.use("/api/trpc/documentIngestion.uploadDocuments", express.json({ limit: "50mb" }));
  app.use("/api/upload", express.json({ limit: "15mb" }));
  app.use("/api/trpc/documents.upload", express.json({ limit: "15mb" }));
  app.use("/api/trpc/claims.uploadImage", express.json({ limit: "15mb" }));
  app.use(express.json({ limit: "1mb" })); // Default 1MB — must come AFTER per-route overrides
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  // Apply rate limiters
  app.use('/api/trpc', globalLimiter);
  app.use('/api/oauth', authLimiter);
  
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
  // Assessment upload endpoint (the REAL processor with LLM extraction)
  app.use("/api", uploadAssessmentRouter);
  // Multipart document upload endpoint — bypasses Cloud Run 30s JSON body timeout
  app.use("/api", uploadDocumentsRouter);
  
  // Audit Export REST download endpoint
  // GET /api/claims/:claimId/audit-export.json
  // Returns the full tamper-evident audit export as a downloadable JSON file.
  app.get("/api/claims/:claimId/audit-export.json", async (req: express.Request, res: express.Response) => {
    try {
      const { claimId } = req.params;
      if (!claimId || typeof claimId !== 'string') {
        return res.status(400).json({ error: 'Missing claimId' });
      }
      const { generateAuditExport, AuditExportBlockedError } = await import('../audit-export');
      try {
        const exportData = await generateAuditExport(claimId);
        const filename = `audit-export-${claimId}-${Date.now()}.json`;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('X-Payload-Hash', exportData.payload_hash);
        res.status(200).send(JSON.stringify(exportData, null, 2));
      } catch (err) {
        if (err instanceof AuditExportBlockedError) {
          // Spec-required blocked response — 422 Unprocessable Entity
          return res.status(422).json({
            export_allowed: false,
            reason: 'Missing or inconsistent audit data',
            checks: err.checks,
          });
        }
        throw err; // re-throw to outer catch
      }
    } catch (err) {
      console.error('[AuditExport] Error generating export:', err);
      res.status(500).json({ error: 'Failed to generate audit export' });
    }
  });

  // ── Scheduled task endpoint: recovery deadline sweep ────────────────────
  // Called daily by the Manus scheduled task agent:
  //   POST /api/scheduled/recovery-deadline-sweep
  //   Cookie: app_session_id=$SCHEDULED_TASK_COOKIE
  // The platform injects a "user" role session cookie — any valid session is
  // sufficient to authenticate. insurer_admin is excluded from the live badge
  // but this sweep endpoint is accessible to any authenticated session.
  // Keep-warm endpoint — called every 4 minutes by Heartbeat cron to prevent Cloud Run cold starts
  app.post("/api/scheduled/keepwarm", (_req: express.Request, res: express.Response) => {
    res.json({ ok: true, ts: Date.now() });
  });

  app.post("/api/scheduled/recovery-deadline-sweep", async (req: express.Request, res: express.Response) => {
    try {
      // Require a valid session cookie (scheduled task cookie counts)
      try {
        await sdk.authenticateRequest(req);
      } catch {
        return res.status(401).json({ error: 'Unauthorized — valid session cookie required' });
      }
      console.log('[ScheduledSweep] Running recovery deadline sweep...');
      await checkRecoveryDeadlines();
      console.log('[ScheduledSweep] Recovery deadline sweep complete.');
      return res.status(200).json({ ok: true, message: 'Recovery deadline sweep complete' });
    } catch (err: any) {
      console.error('[ScheduledSweep] Recovery deadline sweep failed:', err);
      return res.status(500).json({ error: 'Sweep failed', detail: err?.message ?? String(err) });
    }
  });

  // ── Heartbeat: intake escalation job (every 30 minutes) ───────────────────────────────────────
  // Replaces the in-process setInterval in intake-escalation-job.ts once deployed.
  // The setInterval remains as a fallback until Heartbeat registration is confirmed.
  app.post("/api/scheduled/intake-escalation", async (req: express.Request, res: express.Response) => {
    try {
      let cronUser: any = null;
      try {
        const user = await sdk.authenticateRequest(req);
        if ((user as any).isCron) cronUser = user;
      } catch {
        return res.status(401).json({ error: 'Unauthorized — valid session cookie required' });
      }
      if (!cronUser) {
        return res.status(403).json({ error: 'Forbidden — Heartbeat cron callers only' });
      }
      // Allowlist check: when HEARTBEAT_ALLOWED_TASK_UIDS is set (not "*"),
      // only the registered task UIDs may trigger this endpoint.
      if (ENV.heartbeatAllowedTaskUids !== "*") {
        const allowed = ENV.heartbeatAllowedTaskUids.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (!cronUser.taskUid || !allowed.includes(cronUser.taskUid)) {
          console.warn(`[Security] intake-escalation: rejected taskUid "${cronUser.taskUid}" — not in allowlist`);
          return res.status(403).json({ error: 'Forbidden — task UID not in allowlist' });
        }
      }
      console.log(`[Heartbeat] intake-escalation triggered (taskUid: ${cronUser.taskUid ?? 'wildcard'})`);
      await runIntakeEscalationJob();
      console.log('[Heartbeat] intake-escalation complete');
      return res.status(200).json({ ok: true, job: 'intake-escalation', ts: Date.now() });
    } catch (err: any) {
      console.error('[Heartbeat] intake-escalation failed:', err);
      return res.status(500).json({
        error: 'Job failed',
        detail: err?.message ?? String(err),
        context: { url: req.url },
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ── Heartbeat: stuck assessment recovery job (every 5 minutes) ───────────────────────────────
  // Replaces the in-process setInterval in stuck-assessment-recovery-job.ts once deployed.
  // The setInterval remains as a fallback until Heartbeat registration is confirmed.
  app.post("/api/scheduled/stuck-recovery", async (req: express.Request, res: express.Response) => {
    try {
      let cronUser: any = null;
      try {
        const user = await sdk.authenticateRequest(req);
        if ((user as any).isCron) cronUser = user;
      } catch {
        return res.status(401).json({ error: 'Unauthorized — valid session cookie required' });
      }
      if (!cronUser) {
        return res.status(403).json({ error: 'Forbidden — Heartbeat cron callers only' });
      }
      // Allowlist check: when HEARTBEAT_ALLOWED_TASK_UIDS is set (not "*"),
      // only the registered task UIDs may trigger this endpoint.
      if (ENV.heartbeatAllowedTaskUids !== "*") {
        const allowed = ENV.heartbeatAllowedTaskUids.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (!cronUser.taskUid || !allowed.includes(cronUser.taskUid)) {
          console.warn(`[Security] stuck-recovery: rejected taskUid "${cronUser.taskUid}" — not in allowlist`);
          return res.status(403).json({ error: 'Forbidden — task UID not in allowlist' });
        }
      }
      console.log(`[Heartbeat] stuck-recovery triggered (taskUid: ${cronUser.taskUid ?? 'wildcard'})`);
      await runStuckAssessmentRecoveryJob();
      console.log('[Heartbeat] stuck-recovery complete');
      return res.status(200).json({ ok: true, job: 'stuck-recovery', ts: Date.now() });
    } catch (err: any) {
      console.error('[Heartbeat] stuck-recovery failed:', err);
      return res.status(500).json({
        error: 'Job failed',
        detail: err?.message ?? String(err),
        context: { url: req.url },
        timestamp: new Date().toISOString(),
      });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Global error handler — converts body-parser PayloadTooLargeError to JSON
  // so the frontend never receives an HTML 413 response.
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && err.type === "entity.too.large") {
      return res.status(413).json({
        error: "PAYLOAD_TOO_LARGE",
        message: "Uploaded document exceeds the allowed size limit.",
      });
    }
    next(err);
  });

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);

    // ── Startup health check: pdftoppm (poppler-utils) ───────────────────────────────────
    // PDF pages are rendered using pdftoppm (poppler-utils), declared in apt.txt.
    // Verify availability at startup so any missing binary is caught immediately.
    import('child_process').then(({ execFile }) => {
      execFile('pdftoppm', ['-v'], { timeout: 5000 }, (err) => {
        if (err) {
          // Degraded mode: pdftoppm is unavailable. PDF claims will fall back to
          // embedded image extraction (pdfjs-dist path). Do NOT exit — a missing
          // binary must never prevent logins or non-PDF claim processing.
          // Ensure poppler-utils is listed in apt.txt and the deployment image
          // has been rebuilt to restore full PDF page rendering.
          console.warn('[Startup] ⚠️  pdftoppm not found — PDF page rendering unavailable.');
          console.warn('[Startup] ⚠️  PDF claims will fall back to embedded image extraction.');
          console.warn('[Startup] ⚠️  Ensure poppler-utils is in apt.txt and the deployment has been rebuilt.');
        } else {
          console.log('[Startup] ✅ pdftoppm (poppler-utils) available — PDF page rendering enabled in all environments');
        }
      });
    }).catch(() => {});
    
    // ── Heartbeat task UID allowlist security check ──────────────────────────
    // HEARTBEAT_ALLOWED_TASK_UIDS defaults to "*" (permissive) until the two
    // Heartbeat crons are registered post-deploy and their task UIDs are set.
    // Log a visible warning so this is discoverable if step 4 of the post-deploy
    // runbook is skipped.
    if (ENV.heartbeatAllowedTaskUids === "*") {
      console.warn('[Security] ⚠️  HEARTBEAT_ALLOWED_TASK_UIDS is not set (wildcard "*" active).');
      console.warn('[Security] ⚠️  /api/scheduled/intake-escalation and /api/scheduled/stuck-recovery');
      console.warn('[Security] ⚠️  will accept any authenticated Heartbeat cron identity.');
      console.warn('[Security] ⚠️  After registering Heartbeat crons, set HEARTBEAT_ALLOWED_TASK_UIDS');
      console.warn('[Security] ⚠️  to the comma-separated task UIDs and redeploy (post-deploy runbook step 4).');
    } else {
      const uids = ENV.heartbeatAllowedTaskUids.split(',').map(s => s.trim()).filter(Boolean);
      console.log(`[Security] ✅ HEARTBEAT_ALLOWED_TASK_UIDS locked to ${uids.length} task UID(s): ${uids.join(', ')}`);
    }

    // Start intake escalation cron job
    startIntakeEscalationJob();
    // Start stuck assessment recovery job (clears claims stuck in assessment_in_progress)
    startStuckAssessmentRecoveryJob();
    // Recovery deadline alerts for recovery cases (runs 15s after startup, then daily)
    setTimeout(() => {
      checkRecoveryDeadlines().catch(err =>
        console.error('[RecoveryDeadlineAlerts] Startup check failed:', err)
      );
    }, 15000);
  });

  // Start WebSocket server on port 8080 for real-time analytics
  const wsPort = 8080;
  try {
    setupWebSocketServer(wsPort);
  } catch (error) {
    console.error(`Failed to start WebSocket server on port ${wsPort}:`, error);
  }
}

startServer().catch(console.error);

