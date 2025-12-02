import 'dotenv/config';

export const env = {
  PORT: Number(process.env.PORT || 8080),
  BASE_URL: process.env.BASE_URL || 'http://localhost:8080',

  DATABASE_URL: process.env.DATABASE_URL!,
  REDIS_URL: process.env.REDIS_URL || 'redis://redis:6379',
  REDIS_HOST: process.env.REDIS_HOST || 'redis',
  REDIS_PORT: Number(process.env.REDIS_PORT || 6379),

  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET!,

  LOGIN: {
    ID: process.env.LINE_LOGIN_CHANNEL_ID!,
    SECRET: process.env.LINE_LOGIN_CHANNEL_SECRET!,
    REDIRECT: process.env.LINE_LOGIN_REDIRECT_URI!,
  },

  LIFF_APP_ID: process.env.LIFF_APP_ID!,
  ADS_ACCESS_TOKEN: process.env.ADS_ACCESS_TOKEN || '',

  PAY: {
    CHANNEL_ID: process.env.LINE_PAY_CHANNEL_ID!,
    CHANNEL_SECRET: process.env.LINE_PAY_CHANNEL_SECRET!,
    BASE: process.env.LINE_PAY_BASE!,
    CONFIRM_URL: process.env.LINE_PAY_CONFIRM_URL!,
  },

  BULL_BOARD_USER: process.env.BULL_BOARD_USER || 'admin',
  BULL_BOARD_PASS: process.env.BULL_BOARD_PASS || 'password',

  WORKER: {
    CONCURRENCY: Number(process.env.WORKER_CONCURRENCY || 5),
    RATE_MAX: Number(process.env.WORKER_RATE_MAX || 25),
    RATE_DURATION_MS: Number(process.env.WORKER_RATE_DURATION_MS || 1000),
  },
};
