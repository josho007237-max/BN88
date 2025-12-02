// src/queues/message.queue.ts
// Lightweight in-memory follow-up scheduler + rate-limited send helper

import { Queue, Worker, JobsOptions } from "bullmq";
import { config } from "../config";
import { createRequestLogger } from "../utils/logger";

// -----------------------------
// Redis (with graceful fallback)
// -----------------------------
type Redisish = {
  connect: () => Promise<void>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number, mode?: string) => Promise<number>;
  ttl: (key: string) => Promise<number>;
  multi: () => {
    incr: (key: string) => any;
    expire: (key: string, seconds: number, mode?: string) => any;
    exec: () => Promise<(number | string | null)[] | null>;
  };
};

class InMemoryRedis implements Redisish {
  private store = new Map<
    string,
    { value: number; expiresAt: number | null }
  >();

  async connect() {
    return;
  }

  async incr(key: string) {
    const now = Date.now();
    const item = this.store.get(key);
    if (item && item.expiresAt && item.expiresAt < now) {
      this.store.delete(key);
      this.store.set(key, { value: 1, expiresAt: null });
      return 1;
    }

    if (!item) {
      this.store.set(key, { value: 1, expiresAt: null });
      return 1;
    }

    item.value += 1;
    this.store.set(key, item);
    return item.value;
  }

  async expire(key: string, seconds: number, mode?: string) {
    const now = Date.now();
    const item = this.store.get(key);
    if (!item) return 0;
    if (mode === "NX" && item.expiresAt && item.expiresAt > now) return 0;
    item.expiresAt = now + seconds * 1000;
    this.store.set(key, item);
    return 1;
  }

  async ttl(key: string) {
    const now = Date.now();
    const item = this.store.get(key);
    if (!item) return -2;
    if (!item.expiresAt) return -1;
    const diff = item.expiresAt - now;
    if (diff <= 0) {
      this.store.delete(key);
      return -2;
    }
    return Math.floor(diff / 1000);
  }

  multi() {
    const operations: (() => Promise<number | null>)[] = [];
    const multiObj = {
      incr: (key: string) => {
        operations.push(() => this.incr(key));
        return multiObj;
      },
      expire: (key: string, seconds: number, mode?: string) => {
        operations.push(() => this.expire(key, seconds, mode));
        return multiObj;
      },
      exec: async () => {
        const results: (number | null)[] = [];
        for (const op of operations) {
          results.push(await op());
        }
        return results;
      },
    };
    return multiObj;
  }
}

let redisClientPromise: Promise<Redisish> | null = null;

async function getRedisClient() {
  if (redisClientPromise) return redisClientPromise;

  redisClientPromise = (async () => {
    try {
      const mod = await import("redis");
      const client = mod.createClient({ url: config.REDIS_URL }) as Redisish;
      await client.connect();
      return client;
    } catch (err) {
      console.warn(
        "[rate-limit] redis unavailable, falling back to in-memory store",
        err
      );
      return new InMemoryRedis();
    }
  })();

  return redisClientPromise;
}

// -----------------------------
// Follow-up scheduler
// -----------------------------
export type FollowUpJob<TPayload> = {
  id: string; // idempotency key
  delayMs: number;
  payload: TPayload;
  handler: (payload: TPayload) => Promise<void>;
  requestId?: string;
};

const followUpTimers = new Map<string, NodeJS.Timeout>();

export async function enqueueFollowUpJob<TPayload>(job: FollowUpJob<TPayload>) {
  const log = createRequestLogger(job.requestId);

  if (followUpTimers.has(job.id)) {
    log.info("[follow-up] already scheduled", { id: job.id });
    return job.id;
  }

  const timer = setTimeout(async () => {
    followUpTimers.delete(job.id);
    try {
      await job.handler(job.payload);
    } catch (err) {
      log.error("[follow-up] execution error", err);
    }
  }, Math.max(0, job.delayMs));

  followUpTimers.set(job.id, timer);
  log.info("[follow-up] scheduled", { id: job.id, delayMs: job.delayMs });
  return job.id;
}

export async function flushFollowUps() {
  for (const [id, timer] of followUpTimers.entries()) {
    clearTimeout(timer);
    followUpTimers.delete(id);
  }
}

// -----------------------------
// Rate-limited sender
// -----------------------------
type RateLimitedJob = {
  id: string; // idempotency key for a message
  channelId: string; // channel/bot id to rate-limit
  handler: () => Promise<any>;
  requestId?: string;
  backoffBaseMs?: number;
};

type ScheduledMessageJob = RateLimitedJob & {
  cron?: string;
  timezone?: string;
  delayMs?: number;
  handlerKey: string;
  attempt?: number;
};

const messageQueue = new Queue<ScheduledMessageJob>("message-dispatch", {
  connection: { url: config.REDIS_URL },
});

const handlerRegistry = new Map<string, () => Promise<any>>();

let messageWorkerStarted = false;

function getBackoffDelayMs(base: number, attempt: number, fallback: number) {
  const multiplier = Math.pow(2, Math.max(0, attempt - 1));
  return Math.max(fallback, base * multiplier);
}

export function startMessageWorker() {
  if (messageWorkerStarted) return;
  messageWorkerStarted = true;

  const worker = new Worker(
    "message-dispatch",
    async (job) => {
      const log = createRequestLogger(job.data.requestId || job.id);
      log.info("[message.queue] firing job", { id: job.id, channelId: job.data.channelId });

      const check = await consumeRateLimit(job.data.channelId, job.data.requestId);
      if (!check.allowed) {
        const attempt = (job.data.attempt || 0) + 1;
        const backoffMs = getBackoffDelayMs(
          job.data.backoffBaseMs || 1000,
          attempt,
          check.delayMs || 1000,
        );
        log.warn("[message.queue] rate-limit hit, rescheduling", {
          delayMs: backoffMs,
          channelId: job.data.channelId,
          attempt,
        });
        await job.updateData({ ...job.data, attempt });
        await job.moveToDelayed(Date.now() + backoffMs);
        return;
      }

      const handler = handlerRegistry.get(job.data.handlerKey);
      if (handler) {
        await handler();
      } else {
        log.warn("[message.queue] handler missing", { handlerKey: job.data.handlerKey });
      }
    },
    { connection: { url: config.REDIS_URL } },
  );

  worker.on("failed", (job, err) => {
    const log = createRequestLogger(job?.data?.requestId || job?.id);
    log.error("[message.queue] worker failed", err);
  });
}

async function consumeRateLimit(channelId: string, requestId?: string) {
  const log = createRequestLogger(requestId);
  try {
    const redis = await getRedisClient();
    const minuteKey = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
    const key = `rate:${channelId}:${minuteKey}`;
    const windowSeconds = config.MESSAGE_RATE_LIMIT_WINDOW_SECONDS;
    const multi = redis.multi();
    const results = await multi.incr(key).expire(key, windowSeconds, "NX").exec();
    const count = Number(results?.[0] ?? 0);

    let ttlSeconds = await redis.ttl(key);
    if (ttlSeconds < 0) {
      await redis.expire(key, windowSeconds);
      ttlSeconds = windowSeconds;
    }

    const allowed = count <= config.MESSAGE_RATE_LIMIT_PER_MIN;
    const delayMs = allowed ? 0 : Math.max(1000, ttlSeconds * 1000);

    return { allowed, delayMs, ttlMs: Math.max(0, ttlSeconds) * 1000, count };
  } catch (err) {
    log.warn("[rate-limit] redis check failed, allowing send", err);
    return { allowed: true, delayMs: 0, ttlMs: 0, count: 0 };
  }
}

export async function enqueueRateLimitedSend(job: RateLimitedJob): Promise<{
  scheduled: boolean;
  delayMs?: number;
  result?: any;
}> {
  startMessageWorker();
  const log = createRequestLogger(job.requestId);
  handlerRegistry.set(job.id, job.handler);

  try {
    await messageQueue.add(
      "message.rate", 
      { ...job, handlerKey: job.id, attempt: 0 },
      {
        jobId: job.id,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    log.info("[rate-limit] enqueued", { jobId: job.id, channelId: job.channelId });
    return { scheduled: true };
  } catch (err: any) {
    if (err?.message?.includes("jobId")) {
      log.info("[rate-limit] job already enqueued", { jobId: job.id });
      return { scheduled: true };
    }
    log.error("[rate-limit] enqueue error", err);
    throw err;
  }
}

export async function scheduleMessageJob(options: {
  id: string;
  channelId: string;
  handler: () => Promise<any>;
  cron?: string;
  timezone?: string;
  delayMs?: number;
  requestId?: string;
}) {
  startMessageWorker();
  const log = createRequestLogger(options.requestId);
  handlerRegistry.set(options.id, options.handler);
  const repeat: JobsOptions["repeat"] | undefined = options.cron
    ? { cron: options.cron, tz: options.timezone }
    : undefined;

  await messageQueue.add(
    "message.scheduled",
    { ...options, handlerKey: options.id },
    {
      jobId: options.id,
      repeat,
      delay: options.delayMs,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );

  log.info("[message.queue] scheduled", {
    id: options.id,
    cron: options.cron,
    timezone: options.timezone,
    delayMs: options.delayMs,
  });
}
