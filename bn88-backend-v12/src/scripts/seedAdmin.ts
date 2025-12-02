// src/scripts/seedAdmin.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || "root@bn9.local";
  const plain = process.env.ADMIN_PASSWORD || "bn9@12345";

  const hash = await bcrypt.hash(plain, 10);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { password: hash },
    create: { email, password: hash },
  });

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


