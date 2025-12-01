// src/routes/admin/auth.ts
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { signJwt, verifyJwt } from "../../lib/jwt";
import { config } from "../../config";

const router = Router();

/* ---------- Schemas ---------- */

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/* ---------- Types ---------- */

export type AuthPayload = {
  sub: string;
  email: string;
  roles: string[];
};

/* ---------- Helpers ---------- */

function getExpiresIn(): string | number {
  // รองรับทั้ง JWT_EXPIRE และ JWT_EXPIRES เผื่อสะกดต่างกัน
  const cfg = config as any;
  return (config.JWT_EXPIRE ?? cfg.JWT_EXPIRES ?? "1d") as string | number;
}

/* ---------- POST /api/admin/auth/login ---------- */

router.post(
  "/login",
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const parsed = loginSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          message: "invalid_input",
          issues: parsed.error.issues,
        });
      }

      const { email, password } = parsed.data;

      // ดึงจากตาราง adminUser (ดู schema.prisma)
      const user = await prisma.adminUser.findUnique({
        where: { email },
        select: { id: true, email: true, password: true },
      });

      if (!user) {
        return res
          .status(401)
          .json({ ok: false, message: "invalid_credentials" });
      }

      const ok = await bcrypt.compare(password, user.password ?? "");
      if (!ok) {
        return res
          .status(401)
          .json({ ok: false, message: "invalid_credentials" });
      }

      const roleLinks = await prisma.adminUserRole.findMany({
        where: { adminId: user.id },
        include: { role: true },
      });
      const roleNames = roleLinks.map((r) => r.role.name);

      const payload: AuthPayload = {
        sub: String(user.id),
        email: user.email,
        roles: roleNames,
      };

      const expiresIn = getExpiresIn();

      // แคสต์เป็น any กัน type mismatch ของ jsonwebtoken
      const token = signJwt(payload, {
        expiresIn: expiresIn as any,
        subject: "admin-api",
      });

      const safeUser = { id: user.id, email: user.email, roles: roleNames };

      return res.json({ ok: true, token, user: safeUser });
    } catch (err) {
      console.error("POST /api/admin/auth/login error:", err);
      return res
        .status(500)
        .json({ ok: false, message: "internal_error" });
    }
  }
);

/* ---------- JWT Guard ---------- */

export const adminJwtGuard = (
  req: Request,
  res: Response,
  next: NextFunction
): Response | void => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ ok: false, message: "missing_authorization" });
    }

    const token = auth.split(" ")[1]!;
    const decoded = verifyJwt<AuthPayload>(token);
    (req as any).authPayload = decoded;
    return next();
  } catch (err) {
    console.error("adminJwtGuard error:", err);
    return res.status(401).json({ ok: false, message: "invalid_token" });
  }
};

export default router;
