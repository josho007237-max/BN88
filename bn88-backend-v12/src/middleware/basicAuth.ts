import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { createRequestLogger, getRequestId } from "../utils/logger";

export type PermissionName =
  | "manageBots"
  | "manageCampaigns"
  | "viewReports";

const ROLE_PERMISSIONS: Record<string, PermissionName[]> = {
  Admin: ["manageBots", "manageCampaigns", "viewReports"],
  Editor: ["manageBots", "manageCampaigns", "viewReports"],
  Viewer: ["viewReports"],
};

function permissionsFromRoles(roles?: string[]): Set<PermissionName> {
  const set = new Set<PermissionName>();
  if (!roles) return set;
  roles.forEach((r: string) => {
    const mapped = ROLE_PERMISSIONS[r];
    if (mapped) mapped.forEach((p) => set.add(p));
  });
  return set;
}

async function collectPermissions(adminId: string): Promise<Set<string>> {
  const hasDelegates =
    typeof (prisma as any).adminUserRole?.findMany === "function" &&
    typeof (prisma as any).rolePermission?.findMany === "function";
  if (!hasDelegates) return new Set<string>();

  const user = await prisma.adminUser.findUnique({
    where: { id: adminId },
    include: {
      roles: {
        include: {
          role: {
            include: { permissions: { include: { permission: true } } },
          },
        },
      },
    },
  });

  const set = new Set<string>();
  user?.roles.forEach((link: any) => {
    link.role.permissions.forEach((rp: any) => {
      if (rp.permission?.name) set.add(rp.permission.name);
    });
  });
  return set;
}

export function requirePermission(required: PermissionName[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const requestId = getRequestId(req);
    const log = createRequestLogger(requestId);

    if (!req.admin?.id) {
      return res.status(401).json({ ok: false, message: "unauthorized" });
    }

    try {
      const claimPerms = permissionsFromRoles(req.admin.roles);
      if (claimPerms.size > 0 && required.some((perm) => claimPerms.has(perm))) {
        return next();
      }

      const canCheckDb =
        typeof (prisma as any).role?.count === "function" &&
        typeof (prisma as any).adminUserRole?.count === "function";

      if (canCheckDb) {
        // Backward compatibility: if no roles/assignments are configured, allow all.
        const [totalRoles, totalAssignments] = await Promise.all([
          prisma.role.count(),
          prisma.adminUserRole.count(),
        ]);
        if (totalRoles === 0 || totalAssignments === 0) return next();
      }

      const granted = await collectPermissions(req.admin.id);
      if (granted.size === 0) {
        log.warn("RBAC deny: no permissions for admin", req.admin.id);
        return res.status(403).json({ ok: false, message: "forbidden" });
      }

      const ok = required.some((perm) => granted.has(perm));
      if (!ok) {
        log.warn("RBAC deny: missing permission", { required, adminId: req.admin.id });
        return res.status(403).json({ ok: false, message: "forbidden" });
      }

      return next();
    } catch (err) {
      log.error("RBAC error", err);
      return res.status(500).json({ ok: false, message: "rbac_error" });
    }
  };
}
