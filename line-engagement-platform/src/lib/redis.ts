// src/lib/redis.ts
import IORedis from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = process.env.REDIS_PORT
  ? Number(process.env.REDIS_PORT)
  : 6379;

// ถ้าไม่ได้ตั้งค่า REDIS_HOST = ปิด Redis ใน dev ไปก่อน
if (!REDIS_HOST) {
  console.warn("[LEP] REDIS_HOST not set, skip Redis connection (dev mode)");
}

export const redis =
  REDIS_HOST
    ? new IORedis({
        host: REDIS_HOST,
        port: REDIS_PORT,
      })
    : (null as unknown as IORedis); // ให้โค้ดอื่นเช็คก่อนใช้อีกที
