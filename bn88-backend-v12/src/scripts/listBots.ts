// src/scripts/listBots.ts
import { prisma } from "../lib/prisma";

async function main() {
  const bots = await prisma.bot.findMany({
    orderBy: { createdAt: "asc" },
    include: { secret: true, config: true, intents: true },
  });

  if (bots.length === 0) {
    console.log("No bots found");
    return;
  }

  console.log(`Found ${bots.length} bots`);
  for (const bot of bots) {
    const hasLine = !!bot.secret?.channelAccessToken;
    const hasTelegram = !!bot.secret?.telegramBotToken;
    const hasOpenAI = !!bot.secret?.openaiApiKey;
    const intents = bot.intents?.map((i) => i.code).join(", ") || "(none)";
    console.log("------------------------------");
    console.log("botId   =", bot.id);
    console.log("name    =", bot.name);
    console.log("tenant  =", bot.tenant);
    console.log("platform=", bot.platform);
    console.log("intents =", intents);
    console.log("has LINE token    =", hasLine);
    console.log("has Telegram token=", hasTelegram);
    console.log("has OpenAI key    =", hasOpenAI);
  }
}

main()
  .catch((e) => {
    console.error("[listBots] ERROR", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
