// src/scripts/seedAdmin.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || "root@bn9.local";
  const plain = process.env.ADMIN_PASSWORD || "bn9@12345";

  const hash = await bcrypt.hash(plain, 10);

  const permissions = [
    { name: "manageBots", description: "Manage bots and secrets" },
    { name: "manageCampaigns", description: "Manage campaigns and chat operations" },
    { name: "viewReports", description: "View dashboards and reports" },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: perm,
      create: perm,
    });
  }

  const ROLE_PERMS: Record<string, string[]> = {
    Admin: ["manageBots", "manageCampaigns", "viewReports"],
    Editor: ["manageBots", "manageCampaigns", "viewReports"],
    Viewer: ["viewReports"],
  };

  const roleIds: Record<string, string> = {};

  for (const roleName of Object.keys(ROLE_PERMS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
    roleIds[roleName] = role.id;

    // link permissions
    const targets = ROLE_PERMS[roleName];
    for (const permName of targets) {
      const perm = await prisma.permission.findUnique({ where: { name: permName } });
      if (!perm) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { password: hash },
    create: { email, password: hash },
  });

  // Ensure admin assigned Admin role
  const adminRoleId = roleIds.Admin;
  if (adminRoleId) {
    await prisma.adminUserRole.upsert({
      where: { adminId_roleId: { adminId: admin.id, roleId: adminRoleId } },
      update: {},
      create: { adminId: admin.id, roleId: adminRoleId },
    });
  }

  console.log("Seeded admin:", { email, password: plain, id: admin.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


