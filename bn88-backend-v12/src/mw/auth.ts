// src/mw/auth.ts
import type { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

declare module "express-serve-static-core" {
  interface Request {
    admin?: { id: string; email: string };
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export function authGuard(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return res.status(401).json({ ok: false, message: "unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & {
      id?: string;
      email?: string;
    };
    req.admin = { id: String(decoded.id ?? ""), email: String(decoded.email ?? "") };
    return next();
  } catch {
    return res.status(401).json({ ok: false, message: "invalid_token" });
  }
}


