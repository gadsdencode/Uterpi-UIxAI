import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import { setupVite, serveStatic, log } from "./vite";
import dotenv from "dotenv";
import fs from "fs";

// Load environment variables from multiple sources FIRST
if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
}
dotenv.config(); // Also load from .env if it exists

// Now import modules that depend on environment variables
import { registerRoutes } from "./routes-refactored";
import passport from "./auth";
import { handleStripeWebhook } from "./webhooks";
import { errorHandler, handleUnhandledErrors } from "./error-handler";
import { embeddingWorkerPool, initializeWorkerPool } from "./services/embedding-worker-pool";
import { vectorProcessor } from "./vector-processor";

const app = express();

// Register Stripe webhook BEFORE any body parsers to preserve raw body for signature verification
app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), handleStripeWebhook);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Sensible defaults to enable vector features for file management locally
// Enable vectorization unless explicitly disabled
if (!process.env.VECTORIZATION_DISABLED && !process.env.DISABLE_VECTORIZATION) {
  if (!process.env.VECTORS_ENABLED && !process.env.ENABLE_VECTORIZATION) {
    process.env.VECTORS_ENABLED = "true";
  }
}

// Set a default transformers cache directory to avoid repeated downloads
if (!process.env.TRANSFORMERS_CACHE_DIR) {
  process.env.TRANSFORMERS_CACHE_DIR = ".cache/transformers";
}

// Session configuration
const PgSession = ConnectPgSimple(session);

app.use(
  session({
    store: process.env.DATABASE_URL
      ? new PgSession({
          conString: process.env.DATABASE_URL,
          tableName: "session", // Optional: specify session table name
          createTableIfMissing: true,
        })
      : undefined, // Use memory store if no database URL
    secret: process.env.SESSION_SECRET || "your-session-secret-change-this-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to false for Replit deployments - Replit handles HTTPS at the edge
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      sameSite: 'lax', // Allow cookies to be sent with same-site requests
    },
  })
);

// Initialize Passport middleware
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Use centralized error handler
  app.use(errorHandler);

  // Setup unhandled error handling
  handleUnhandledErrors();

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    // Pre-warm the embedding worker pool in background (non-blocking)
    if (process.env.VECTORS_ENABLED === "true" || process.env.ENABLE_VECTORIZATION === "true") {
      log("🧵 Initializing embedding worker pool...");
      initializeWorkerPool()
        .then(() => log("🧵 Embedding worker pool ready"))
        .catch(err => log(`⚠️ Worker pool init deferred: ${err.message}`));
    }
  });

  // ============================================================================
  // GRACEFUL SHUTDOWN HANDLING
  // ============================================================================
  
  const gracefulShutdown = async (signal: string) => {
    log(`\n🛑 ${signal} received. Starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close(async () => {
      log("📡 HTTP server closed");
      
      try {
        // Shutdown vector processor first (clears queues)
        log("🔄 Shutting down vector processor...");
        await vectorProcessor.shutdown();
        log("✅ Vector processor shutdown complete");
        
        // Shutdown worker pool (waits for pending tasks)
        log("🧵 Shutting down embedding worker pool...");
        await embeddingWorkerPool.shutdown();
        log("✅ Worker pool shutdown complete");
        
        log("👋 Graceful shutdown complete");
        process.exit(0);
      } catch (error) {
        log(`❌ Error during shutdown: ${error}`);
        process.exit(1);
      }
    });
    
    // Force exit after timeout
    setTimeout(() => {
      log("⚠️ Shutdown timeout - forcing exit");
      process.exit(1);
    }, 30000);
  };
  
  // Handle shutdown signals
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
})();
