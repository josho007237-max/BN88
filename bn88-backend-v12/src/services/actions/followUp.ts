import { enqueueFollowUpJob } from "../../queues/message.queue";
import { ActionContext, ActionExecutionResult, FollowUpAction } from "./types";
import { normalizeActionMessage } from "./utils";
import { executeSendAction } from "./sendMessage";

const defaultDeps = {
  enqueueFollowUpJob,
  sendAction: executeSendAction,
};

type FollowDeps = typeof defaultDeps;

export async function executeFollowUpAction(
  action: FollowUpAction,
  ctx: ActionContext,
  deps: FollowDeps = defaultDeps,
): Promise<ActionExecutionResult> {
  const normalized = normalizeActionMessage(
    action.message,
    action.message.attachmentUrl ? "attachment" : "",
  );
  const delayMs = Math.max(1, (action.delaySeconds ?? 60) * 1000);
  const jobId = `${ctx.session.id}:${normalized.type}:${delayMs}`;

  try {
    await deps.enqueueFollowUpJob({
      id: jobId,
      delayMs,
      payload: normalized,
      requestId: ctx.requestId,
      handler: async (payload) => {
        await deps.sendAction({ type: "send_message", message: payload }, ctx);
      },
    });

    ctx.log.info("[action] follow_up scheduled", {
      sessionId: ctx.session.id,
      delayMs,
      requestId: ctx.requestId,
    });

    return { type: action.type, status: "scheduled", detail: jobId };
  } catch (err) {
    ctx.log.error("[action] follow_up error", err);
    return { type: action.type, status: "error", detail: String(err) };
  }
}
