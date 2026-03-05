import "dotenv/config";
// Initialize Sentry FIRST for error tracking
import { initializeSentry } from "./sentry";
initializeSentry();

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
import { setupWebSocketServer } from "../websocket";
import { startIntakeEscalationJob } from "../intake-escalation-job";

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

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Trust proxy for rate limiting (required for X-Forwarded-For)
  app.set('trust proxy', 1);
  
  // Rate limiters
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
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
    
    // Start intake escalation cron job
    startIntakeEscalationJob();
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

