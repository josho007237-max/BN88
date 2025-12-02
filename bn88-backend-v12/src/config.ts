// src/config.ts
import "dotenv/config";
import { z } from "zod";

/** ตรวจ ENV ที่ระบบต้องใช้ */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Server / DB
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).default("file:./prisma/dev.db"),

  // Auth / Security
  JWT_SECRET: z.string().min(1).default("bn9_dev_secret"),
  JWT_EXPIRE: z.string().min(1).default("7d"),
  SECRET_ENC_KEY_BN9: z.string().length(32, { message: "SECRET_ENC_KEY_BN9 must be 32 characters long" }),

  // CORS / Admin API
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  ENABLE_ADMIN_API: z.enum(["1", "0"]).default("0"),

  // OpenAI (optional)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  // LINE Webhook (ใหม่)
  TENANT_DEFAULT: z.string().default("bn9"),
  LINE_CHANNEL_SECRET: z.string().optional(),
  LINE_DEV_SKIP_VERIFY: z.enum(["1", "0"]).default("1"), // dev = ข้ามตรวจลายเซ็นได้

  // LINE Engagement Platform (LEP)
  LEP_BASE_URL: z.string().default("http://localhost:8080"),

  // Messaging / rate limit
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  REDIS_RATE_LIMIT: z.coerce.number().int().positive().default(60),
  MESSAGE_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(60),
  MESSAGE_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(90),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("[INVALID ENV]", parsed.error.format());
  process.exit(1);
}
const env = parsed.data;

if (!env.OPENAI_API_KEY) {
  console.warn("[BOOT][WARN] OPENAI_API_KEY is not set. AI replies will be skipped.");
}

export const config = {
  env,

  PORT: env.PORT,
  DATABASE_URL: env.DATABASE_URL,

  JWT_SECRET: env.JWT_SECRET,
  JWT_EXPIRE: env.JWT_EXPIRE,

  SECRET_ENC_KEY_BN9: env.SECRET_ENC_KEY_BN9,

  ENABLE_ADMIN_API: env.ENABLE_ADMIN_API,

  ALLOWED_ORIGINS: env.ALLOWED_ORIGINS,
  ALLOWED_ORIGIN_SET: new Set(env.ALLOWED_ORIGINS.split(",").map((s: string) => s.trim()).filter(Boolean)),

  OPENAI_API_KEY: env.OPENAI_API_KEY,
  OPENAI_MODEL: env.OPENAI_MODEL,

  // LINE
  TENANT_DEFAULT: env.TENANT_DEFAULT,
  LINE_CHANNEL_SECRET: env.LINE_CHANNEL_SECRET,
  LINE_DEV_SKIP_VERIFY: env.LINE_DEV_SKIP_VERIFY,

  LEP_BASE_URL: env.LEP_BASE_URL,

  // Messaging / rate limit
  REDIS_URL: env.REDIS_URL,
  MESSAGE_RATE_LIMIT_PER_MIN: env.REDIS_RATE_LIMIT || env.MESSAGE_RATE_LIMIT_PER_MIN,
  MESSAGE_RATE_LIMIT_WINDOW_SECONDS: env.MESSAGE_RATE_LIMIT_WINDOW_SECONDS,

  isProd: env.NODE_ENV === "production",
  isDev: env.NODE_ENV === "development",
} as const;


