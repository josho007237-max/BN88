# Scripts (Prisma + Bot maintenance)

Use these helper scripts from the backend root (`bn88-backend-v12`). All commands assume `npm install` has been run and that you have a valid `.env` (see `../.env.example`).

## Open Prisma Studio (port 5556)

```bash
npx prisma studio --port 5556
```

## List all bots and secret status

```bash
npx tsx src/scripts/listBots.ts
```

This prints bot id, tenant, platform, intents, and whether LINE / Telegram / OpenAI secrets exist.

## Set Telegram bot token for a specific bot

```bash
BOT_ID="<bot-id>" TELEGRAM_BOT_TOKEN="<your-telegram-token>" npx tsx src/scripts/setTelegramToken.ts
```

- Do **not** hard-code real tokens in the script.
- BOT_ID is the `bot.id` you want to update; the script upserts `BotSecret.telegramBotToken`.

## Debug Telegram bot secrets for tenant `bn9`

```bash
npx tsx src/scripts/debugTelegramBotSecret.ts
```

This shows Telegram bots for tenant `bn9` and prints whether a token exists.
