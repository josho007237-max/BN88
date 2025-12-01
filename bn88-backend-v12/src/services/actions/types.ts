import { MessageType } from "@prisma/client";
import { createRequestLogger } from "../../utils/logger";

export type SupportedPlatform = "line" | "telegram" | "facebook";

export type ActionMessagePayload = {
  type?: MessageType;
  text?: string;
  attachmentUrl?: string | null;
  attachmentMeta?: unknown;
};

export type SendMessageAction = {
  type: "send_message";
  message: ActionMessagePayload;
};

export type TagAction = { type: "tag_add" | "tag_remove"; tag: string };
export type SegmentAction = { type: "segment_update"; segment: unknown };
export type FollowUpAction = {
  type: "follow_up";
  delaySeconds?: number;
  message: ActionMessagePayload;
};

export type ActionItem =
  | SendMessageAction
  | TagAction
  | SegmentAction
  | FollowUpAction;

export type ActionExecutionResult = {
  type: ActionItem["type"];
  status: "handled" | "skipped" | "scheduled" | "error";
  detail?: string;
};

export type ActionContext = {
  bot: {
    id: string;
    tenant: string;
    secret?: any;
    config?: any;
  };
  session: { id: string };
  conversation?: { id: string };
  platform: SupportedPlatform;
  userId: string;
  requestId?: string;
  log: ReturnType<typeof createRequestLogger>;
};
