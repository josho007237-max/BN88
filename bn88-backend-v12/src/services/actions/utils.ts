import { MessageType } from "@prisma/client";
import { sseHub } from "../../lib/sseHub";
import { ActionMessagePayload } from "./types";

export function normalizeActionMessage(
  payload: ActionMessagePayload,
  fallbackText: string,
): Required<ActionMessagePayload> {
  const type = payload.type ?? MessageType.TEXT;
  const text = payload.text ?? (payload.attachmentUrl ? fallbackText : "");
  return {
    type,
    text,
    attachmentUrl: payload.attachmentUrl ?? null,
    attachmentMeta: payload.attachmentMeta ?? undefined,
  };
}

export function safeBroadcast(event: any) {
  try {
    (sseHub as any).broadcast?.(event);
  } catch (err) {
    console.warn("[inbound] SSE broadcast error", err);
  }
}
