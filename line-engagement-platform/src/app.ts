import express, { Request, Response } from "express";
import cors from "cors";

import { errorHandler } from "./middleware/error";
import { basicAuthMiddleware } from "./middleware/basicAuth";
import { messageQueue } from "./queues/message.queue";

import { ExpressAdapter } from "@bull-board/express";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { createBullBoard } from "@bull-board/api";

export const createApp = () => {
  const app = express();

  // 기본 미들웨어
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "line-engagement-platform" });
  });

  // TODO: ภายหลังค่อยมาใช้ router จริง ๆ
  // ตัวอย่าง (ยังไม่บังคับใช้):
  // const webhookRoutes = require("./routes/webhook.routes") as any;
  // app.use("/webhook/line", webhookRoutes.router ?? webhookRoutes.default ?? webhookRoutes);

  /* ------------------------------------------------------------------ */
  /* Bull Board                                                          */
  /* ------------------------------------------------------------------ */

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    // cast เป็น any เพื่อกัน TypeScript งอแงเรื่อง type ของ Job
    queues: [new BullMQAdapter(messageQueue as any) as any],
    serverAdapter,
  });

  app.use(
    "/admin/queues",
    basicAuthMiddleware,
    serverAdapter.getRouter() as any
  );

  /* ------------------------------------------------------------------ */
  /* Error handler                                                       */
  /* ------------------------------------------------------------------ */

  app.use(errorHandler);

  return app;
};
