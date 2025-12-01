// src/scripts/setTelegramToken.ts
import { prisma } from "../lib/prisma";

async function main() {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TARGET_BOT_ID = process.env.BOT_ID;

  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("Please provide TELEGRAM_BOT_TOKEN in env (never hard-code secrets)");
  }

  if (!TARGET_BOT_ID) {
    throw new Error("Please provide BOT_ID in env to select which bot to update");
  }

  const bot = await prisma.bot.findUnique({
    where: { id: TARGET_BOT_ID },
  });

  if (!bot) {
    throw new Error(`Bot not found: id=${TARGET_BOT_ID}`);
  }

  console.log(
    "Updating telegramBotToken for botId =",
    bot.id,
    "name =",
    bot.name,
    "platform =",
    bot.platform,
    "tenant =",
    bot.tenant
  );

  await prisma.botSecret.upsert({
    where: { botId: bot.id },
    update: {
      telegramBotToken: TELEGRAM_BOT_TOKEN,
    },
    create: {
      botId: bot.id,
      telegramBotToken: TELEGRAM_BOT_TOKEN,
    },
  });

  console.log("✅ Updated telegramBotToken for botId =", bot.id);
}

main()
  .catch((e) => {
    console.error("[setTelegramToken] ERROR", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
