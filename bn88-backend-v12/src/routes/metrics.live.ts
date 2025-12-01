import type { Request, Response } from "express";
import { createRequestLogger, getRequestId } from "../utils/logger";

export type MetricsSnapshot = {
  deliveryTotal: number;
  errorTotal: number;
  perChannel: Record<string, { sent: number; errors: number }>;
  updatedAt: string;
};

const metricsState: {
  deliveryTotal: number;
  errorTotal: number;
  perChannel: Map<string, { sent: number; errors: number }>;
} = {
  deliveryTotal: 0,
  errorTotal: 0,
  perChannel: new Map(),
};

export function recordDeliveryMetric(
  channelId: string,
  success: boolean,
  requestId?: string
) {
  const log = createRequestLogger(requestId);
  const channel = metricsState.perChannel.get(channelId) ?? { sent: 0, errors: 0 };

  if (success) {
    metricsState.deliveryTotal += 1;
    channel.sent += 1;
  } else {
    metricsState.errorTotal += 1;
    channel.errors += 1;
  }

  metricsState.perChannel.set(channelId, channel);
  log.info("[metrics] delivery", { channelId, success });
}

export function getMetricsSnapshot(): MetricsSnapshot {
  const perChannel: Record<string, { sent: number; errors: number }> = {};
  for (const [key, val] of metricsState.perChannel.entries()) {
    perChannel[key] = { sent: val.sent, errors: val.errors };
  }
  return {
    deliveryTotal: metricsState.deliveryTotal,
    errorTotal: metricsState.errorTotal,
    perChannel,
    updatedAt: new Date().toISOString(),
  };
}

export function metricsSseHandler(req: Request, res: Response) {
  const requestId = getRequestId(req);
  const log = createRequestLogger(requestId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // @ts-ignore
  res.flushHeaders?.();

  const send = (data: MetricsSnapshot) => {
    res.write(`event: metrics\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const hb = setInterval(() => {
    res.write(`event: hb\n`);
    res.write(`data: {"t":${Date.now()}}\n\n`);
  }, 25_000);

  const tick = setInterval(() => send(getMetricsSnapshot()), 5_000);

  send(getMetricsSnapshot());
  log.info("[metrics] client connected", { requestId, path: req.path });

  req.on("close", () => {
    clearInterval(hb);
    clearInterval(tick);
    log.info("[metrics] client disconnected", { requestId, path: req.path });
  });
}

// Backwards-compatible alias for the new /metrics/stream endpoint
export const metricsStreamHandler = metricsSseHandler;
