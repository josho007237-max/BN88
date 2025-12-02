import { randomUUID } from "node:crypto";
import type { Request } from "express";

export function getRequestId(req?: Request): string {
  const fromHeader = req?.headers?.["x-request-id"];
  if (typeof fromHeader === "string" && fromHeader.trim().length > 0) {
    return fromHeader;
  }
  return randomUUID();
}

export function createRequestLogger(requestId?: string) {
  const prefix = requestId ? `[req:${requestId}]` : "[req:unknown]";
  return {
    info: (...args: unknown[]) => console.info(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  };
}
