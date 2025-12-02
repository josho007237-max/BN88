// src/routes/index.ts
import { Router } from "express";

/**
 * NOTE:
 * - health/auth/bots/stats/cases/dev: ในโปรเจกต์เดิมรันได้แล้ว → ใช้ default import เป็น router ตามเดิม
 * - events, admin/bots: เราใช้ require แบบยืดหยุ่น เพื่อกันเคสไม่มี default export หรือ export เป็นชื่ออื่น
 * - admin/chat: เราเขียนเอง ให้ export เป็น named: chatAdminRouter
 */

import healthRouter from "./health";
import authRouter from "./auth";
import botsRouter from "./bots";
import statsRouter from "./stats";
import casesRouter from "./cases";
import devRouter from "./dev";

// webhooks
import lineWebhookRouter from "./webhooks/line";

// admin chat (ไฟล์ใหม่ของเรา)
import { chatAdminRouter } from "./admin/chat";
// admin LEP (ไฟล์ใหม่สำหรับเชื่อม LEP)
import { lepAdminRouter } from "./admin/lep";

export const router = Router();

/* ---------------------- helper: ดึง router จาก module ---------------------- */

function pickRouter(mod: any): any {
  if (!mod) return undefined;
  if (typeof mod.default === "function") return mod.default;
  if (typeof mod === "function") return mod;
  if (mod.router && typeof mod.router === "function") return mod.router;
  if (mod.eventsRouter && typeof mod.eventsRouter === "function")
    return mod.eventsRouter;
  if (mod.adminBotsRouter && typeof mod.adminBotsRouter === "function")
    return mod.adminBotsRouter;
  return undefined;
}

/* ---------------- require modules ที่เคยมีปัญหา (events/admin-bots) ---------------- */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const eventsModule = require("./events");
const eventsRouter = pickRouter(eventsModule);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminBotsModule = require("./admin/bots");
const adminBotsRouter = pickRouter(adminBotsModule);

/* --------------------------- public / basic API --------------------------- */

router.use("/health", healthRouter);
router.use("/auth", authRouter);
router.use("/bots", botsRouter);
router.use("/stats", statsRouter);
router.use("/cases", casesRouter);
router.use("/dev", devRouter);

// events อาจ export แบบไหนก็ได้ → ถ้าเจอ router ถึงจะ mount
if (eventsRouter) {
  router.use("/events", eventsRouter);
}

/* ------------------------------- webhooks -------------------------------- */

router.use("/webhooks/line", lineWebhookRouter);

/* -------------------------------- admin ---------------------------------- */

// admin/bots: ใช้ router ที่ดึงจาก module เหมือนกัน
if (adminBotsRouter) {
  router.use("/admin/bots", adminBotsRouter);
}

// admin/chat: router ใหม่ที่เราเขียนเอง
router.use("/admin/chat", chatAdminRouter);

// admin/lep: router สำหรับเชื่อม line-engagement-platform
router.use("/admin/lep", lepAdminRouter);

export default router;
