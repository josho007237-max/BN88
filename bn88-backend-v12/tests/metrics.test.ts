import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import {
  metricsStreamHandler,
  recordDeliveryMetric,
} from "../src/routes/metrics.live";
import { getRequestId } from "../src/utils/logger";

type MockReq = EventEmitter & { path: string; headers: Record<string, string> };
type MockRes = EventEmitter & {
  setHeader: (k: string, v: string) => void;
  write: (chunk: string) => void;
  flushHeaders?: () => void;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const requestId = getRequestId();
  recordDeliveryMetric("test:channel", true, requestId);

  const chunks: string[] = [];
  const req: MockReq = Object.assign(new EventEmitter(), {
    path: "/metrics/stream",
    headers: {},
  });
  const res: MockRes = Object.assign(new EventEmitter(), {
    setHeader: () => {},
    write: (chunk: string) => chunks.push(String(chunk)),
    flushHeaders: () => {},
  });

  metricsStreamHandler(req as any, res as any);

  // wait for initial send
  await sleep(20);
  req.emit("close");
  await sleep(5);

  const joined = chunks.join("");
  assert.match(joined, /event: metrics/, "should emit metrics event");

  const dataLine = joined
    .split("\n")
    .find((line) => line.startsWith("data: "));
  assert.ok(dataLine, "metrics event should include data line");

  const payload = JSON.parse(dataLine!.replace("data: ", ""));
  assert.ok(typeof payload.deliveryTotal === "number");
  assert.ok(payload.deliveryTotal >= 1, "delivery total should reflect recorded metric");
  assert.ok(payload.perChannel?.["test:channel"], "per-channel stats should include channel");

  console.log("metrics SSE tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
