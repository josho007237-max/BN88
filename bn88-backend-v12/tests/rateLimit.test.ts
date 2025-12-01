import assert from "node:assert/strict";

process.env.SECRET_ENC_KEY_BN9 ||= "12345678901234567890123456789012";
process.env.JWT_SECRET ||= "test-jwt";
process.env.ENABLE_ADMIN_API ||= "1";
process.env.DATABASE_URL ||= "file:./dev.db";
process.env.REDIS_URL ||= "redis://127.0.0.1:6379";
process.env.REDIS_RATE_LIMIT ||= "1";
process.env.MESSAGE_RATE_LIMIT_PER_MIN ||= "1";
process.env.MESSAGE_RATE_LIMIT_WINDOW_SECONDS ||= "1";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const { enqueueRateLimitedSend } = await import("../src/queues/message.queue");

  let sent = 0;
  await enqueueRateLimitedSend({
    id: "rl-job-1",
    channelId: "rl-channel-1",
    handler: async () => {
      sent += 1;
    },
    requestId: "rl-test-1",
    backoffBaseMs: 50,
  });

  await enqueueRateLimitedSend({
    id: "rl-job-2",
    channelId: "rl-channel-1",
    handler: async () => {
      sent += 1;
    },
    requestId: "rl-test-1",
    backoffBaseMs: 50,
  });

  // first should run quickly
  await sleep(120);
  assert.equal(sent, 1, "first job should fire immediately before limit");

  // second should run after throttle window/backoff
  await sleep(1200);
  assert.equal(sent, 2, "second job should run after rate-limit delay");

  // idempotency: enqueue same id while pending should not duplicate
  let duplicateRun = 0;
  await enqueueRateLimitedSend({
    id: "rl-job-dupe",
    channelId: "rl-channel-2",
    handler: async () => {
      duplicateRun += 1;
    },
    requestId: "rl-test-dup",
    backoffBaseMs: 50,
  });

  await enqueueRateLimitedSend({
    id: "rl-job-dupe",
    channelId: "rl-channel-2",
    handler: async () => {
      duplicateRun += 10;
    },
    requestId: "rl-test-dup",
    backoffBaseMs: 50,
  });

  await sleep(300);
  assert.equal(duplicateRun, 1, "idempotent job should execute once");

  console.log("rate limit tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
