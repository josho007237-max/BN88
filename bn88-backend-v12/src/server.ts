// src/server.ts
process.on("unhandledRejection", (err) =>
  console.error("[UNHANDLED REJECTION]", err)
);
process.on("uncaughtException", (err) =>
  console.error("[UNCAUGHT EXCEPTION]", err)
);

import dotenv from "dotenv";
dotenv.config();

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import { ZodError } from "zod";

import { config } from "./config";
import { logger } from "./mw/logger";
import { authGuard } from "./mw/auth";
import { sseHandler } from "./live";
import { metricsSseHandler, metricsStreamHandler } from "./routes/metrics.live";
import { startEngagementScheduler } from "./services/engagementScheduler";
import { events } from "./routes/events";

/* Core routes */
import health from "./routes/health";
import authRoutes from "./routes/auth";
import casesRoutes from "./routes/cases";
import statsRoutes from "./routes/stats";
import botsRoutes from "./routes/bots";
import botsSummary from "./routes/bots.summary";

/* Webhooks */
import lineWebhookRouter from "./routes/webhooks/line";
import telegramWebhookRouter from "./routes/webhooks/telegram";
import facebookWebhookRouter from "./routes/webhooks/facebook";

/* Admin */
import adminBotsRouter from "./routes/admin/bots";
import adminBotIntentsRouter from "./routes/admin/botIntents";
import adminRouter from "./routes/admin";
import presetsAdmin from "./routes/admin/ai/presets";
import knowledgeAdmin from "./routes/admin/ai/knowledge";
import adminPersonaRoutes from "./routes/admin/personas";
import { chatAdminRouter } from "./routes/admin/chat";
import lepAdminRouter from "./routes/admin/lep";
import { telegramLiveAdminRouter } from "./routes/admin/telegramLive";
import adminRolesRouter from "./routes/admin/roles";
import botAutomationRouter from "./routes/admin/botAutomation";
import { startCampaignScheduleWorker } from "./queues/campaign.queue";
import { startMessageWorker } from "./queues/message.queue";

/* Dev & tools */
import devRoutes from "./routes/dev";
import lineTools from "./routes/tools/line";
import aiAnswerRoute from "./routes/ai/answer";

const app = express();
app.set("trust proxy", 1);

startCampaignScheduleWorker();
startMessageWorker();

/* ---------- Body parsers ---------- */

// LINE ต้องใช้ raw body เพื่อ verify signature
app.use("/api/webhooks/line", express.raw({ type: "application/json" }));

// parsers ทั่วไป
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "200kb" }));

app.use(
  (err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ ok: false, message: "payload_too_large" });
    }
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ ok: false, message: "invalid_json" });
    }
    return next(err);
  }
);

/* Security / CORS / Log */

const allowList = new Set(
  (config.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowList.has(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-tenant"],
  })
);

app.use(morgan("dev"));
app.use(logger);

/* Compression (skip SSE) */

app.use(
  compression({
    filter: (req, res) => {
      if (req.path.startsWith("/api/live/")) return false;
      return compression.filter(req, res as any);
    },
  })
);

/* Rate limit */

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    req.path.startsWith("/webhooks/") ||
    req.path === "/health" ||
    req.path.startsWith("/live/") ||
    req.path.startsWith("/events") ||
    req.path.startsWith("/admin/chat"),
});

app.use("/api", limiter);

/* Health */

app.use("/api/health", health);

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    time: new Date().toISOString(),
    adminApi: true,
  })
);

/* Dev & tools */

app.use("/api", devRoutes);
app.use("/api", lineTools);
app.use("/api", events);

/* Core */

app.use("/api/auth", authRoutes);
app.use("/api/bots", botsRoutes);
app.use("/api/bots", botsSummary);
app.use("/api/cases", casesRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/ai/answer", aiAnswerRoute);

/* Realtime */

app.get("/api/live/:tenant", sseHandler);
app.get("/api/live/metrics", metricsSseHandler);
app.get("/metrics/stream", metricsStreamHandler);

startEngagementScheduler().catch((err) =>
  console.error("[BOOT] engagement scheduler error", err)
);

/* Webhooks */

app.use("/api/webhooks/line", lineWebhookRouter);
app.use("/api/webhooks/facebook", facebookWebhookRouter);
app.use("/api/webhooks/telegram", telegramWebhookRouter);

/* Admin */

if (config.ENABLE_ADMIN_API === "1") {
  console.log("[BOOT] Admin API enabled (guarded by JWT)");

  app.use("/api/admin/bots", authGuard, adminBotsRouter);
  app.use("/api/admin/bots", authGuard, adminBotIntentsRouter);
  app.use("/api/admin/chat", authGuard, chatAdminRouter);
  app.use("/api/admin/lep", authGuard, lepAdminRouter);
  app.use("/api/admin/telegram", authGuard, telegramLiveAdminRouter);
  app.use("/api/admin/roles", authGuard, adminRolesRouter);
  app.use("/api/admin/bot", authGuard, botAutomationRouter);

  app.use("/api/admin", authGuard, adminRouter);
  app.use("/api/admin/ai/presets", authGuard, presetsAdmin);
  app.use("/api/admin/ai/knowledge", authGuard, knowledgeAdmin);
  app.use("/api/admin/ai/personas", authGuard, adminPersonaRoutes);
}

/* 404 & Errors */

app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ ok: false, message: "not_found" });
});

app.use(
  (err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res
        .status(400)
        .json({ ok: false, message: "invalid_input", issues: err.issues });
    }
    if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
      return res.status(400).json({ ok: false, message: "invalid_json" });
    }
    console.error("[INTERNAL ERROR]", err);
    return res.status(500).json({ ok: false, message: "internal_error" });
  }
);

const PORT = Number(config.PORT ?? process.env.PORT ?? 3000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`BN9 backend listening on :${PORT}`);
});

export default app;
