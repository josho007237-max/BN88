import { ActionContext, ActionExecutionResult, ActionItem } from "./types";
import { executeSendAction } from "./sendMessage";
import { executeFollowUpAction } from "./followUp";
import { executeSegmentAction, executeTagAction } from "./tagSegment";

export async function executeActions(
  actions: ActionItem[],
  ctx: ActionContext,
): Promise<ActionExecutionResult[]> {
  const results: ActionExecutionResult[] = [];

  for (const action of actions) {
    if (!action || typeof action !== "object" || !("type" in action)) continue;

    if (action.type === "send_message") {
      results.push(await executeSendAction(action, ctx));
      continue;
    }

    if (action.type === "tag_add" || action.type === "tag_remove") {
      results.push(await executeTagAction(action, ctx));
      continue;
    }

    if (action.type === "segment_update") {
      results.push(await executeSegmentAction(action, ctx));
      continue;
    }

    if (action.type === "follow_up") {
      results.push(await executeFollowUpAction(action, ctx));
      continue;
    }
  }

  return results;
}

export * from "./types";
export * from "./utils";
export * from "./sendMessage";
export * from "./followUp";
export * from "./tagSegment";
