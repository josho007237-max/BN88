// src/routes/admin/lep.ts
import { Router } from "express";
import { getLepHealth } from "../../services/lepClient";

export const lepAdminRouter = Router();

/**
 * GET /admin/lep/health
 * ใช้ตรวจว่า backend คุยกับ line-engagement-platform ได้ไหม
 */
lepAdminRouter.get("/health", async (req, res) => {
  try {
    const result = await getLepHealth();

    res.json({
      ok: true,
      target: "lep",
      lepBaseUrl: result.lepBaseUrl,
      status: result.status,
      lepResponse: result.data,
    });
  } catch (err: any) {
    console.error("[lep:health] error", err?.message || err);
    res.status(500).json({
      ok: false,
      target: "lep",
      error: err?.message || "LEP health check failed",
    });
  }
});

// default export ไว้เผื่อมีที่อื่นต้องใช้แบบ default
export default lepAdminRouter;
