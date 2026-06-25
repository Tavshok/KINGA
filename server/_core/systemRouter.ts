import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { getDb } from "../db";
import { storagePut, storageGet } from "../storage";

// Read version from package.json
// IMPORTANT: Use process.cwd() not __dirname — in production the server bundle
// is at /usr/src/app/dist/index.js so __dirname-relative paths break.
let version = "unknown";
try {
  const packageJson = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf-8")
  );
  version = packageJson.version || "unknown";
} catch (error) {
  // Silently ignore — version is non-critical
  version = "unknown";
}

const startTime = Date.now();

export const systemRouter = router({
  // Health check endpoint for load balancers
  // Returns uptime and version information
  health: publicProcedure.query(() => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    return {
      ok: true,
      uptime: uptimeSeconds,
      version,
      timestamp: new Date().toISOString(),
    };
  }),

  // Readiness check endpoint for load balancers
  // Returns true if database is connected and ready
  ready: publicProcedure.query(async () => {
    try {
      const db = await getDb();
      if (!db) {
        return { ready: false, reason: "Database not available" };
      }
      
      // Test database connectivity with a simple query
      await db.execute("SELECT 1");
      
      return { ready: true };
    } catch (error: any) {
      return {
        ready: false,
        reason: error.message || "Database connection failed",
      };
    }
  }),

  /**
   * Diagnostic: test storagePut and storageGet in the current environment.
   * Used to confirm BUILT_IN_FORGE_API_KEY is valid and uploads work in production.
   */
  testStorage: adminProcedure.query(async () => {
    const results: Record<string, any> = {};
    // Test 1: small upload
    try {
      const buf = Buffer.from(`kinga-storage-test-${Date.now()}`);
      const r = await storagePut('diagnostics/storage-test.txt', buf, 'text/plain');
      results.upload = { ok: true, url: r.url };
    } catch (e: any) {
      results.upload = { ok: false, error: e.message };
    }
    // Test 2: storageGet presign
    try {
      const r = await storageGet('diagnostics/storage-test.txt', 3600);
      results.presign = { ok: true, url: r.url.substring(0, 80) };
    } catch (e: any) {
      results.presign = { ok: false, error: e.message };
    }
    // Test 3: medium upload (500KB — representative of a PDF page PNG)
    try {
      const buf = Buffer.alloc(512 * 1024, 0x89);
      const r = await storagePut('diagnostics/storage-test-500kb.bin', buf, 'application/octet-stream');
      results.upload500kb = { ok: true, url: r.url.substring(0, 80) };
    } catch (e: any) {
      results.upload500kb = { ok: false, error: e.message };
    }
    return results;
  }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
