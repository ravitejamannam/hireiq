export type WorkflowRuleDraft = {
  id: number;
  version: number;
  trigger: "STAGE_CHANGE" | "TIME_ELAPSED" | "FORM_SUBMITTED" | "SCORECARD_OVERDUE";
  condition: { status?: string; hours?: number };
  action: { type: "EMAIL" | "ASSIGN" | "TASK" | "WEBHOOK" | "REJECT"; templateId?: string };
};

export type WorkflowEvent = {
  trigger: WorkflowRuleDraft["trigger"];
  status?: string;
  hoursElapsed?: number;
  knockoutFailed?: boolean;
  humanConfirmed?: boolean;
  unsubscribed?: boolean;
  sendsInWindow?: number;
};

const SEND_LIMIT = 20;

export function previewWorkflow(rule: WorkflowRuleDraft, event: WorkflowEvent) {
  const matched = matches(rule, event);
  return {
    ruleId: rule.id,
    ruleVersion: rule.version,
    dryRun: true,
    matched,
    action: matched ? rule.action : null,
  };
}

export function executeWorkflow(rule: WorkflowRuleDraft, event: WorkflowEvent) {
  if (!matches(rule, event)) {
    return log(rule, "SKIPPED", { reason: "condition" });
  }
  if (rule.action.type === "REJECT" && !event.knockoutFailed && !event.humanConfirmed) {
    return log(rule, "BLOCKED", { reason: "rejection requires a human or a knockout answer" });
  }
  if (rule.action.type === "EMAIL") {
    if (event.unsubscribed) return log(rule, "BLOCKED", { reason: "unsubscribed" });
    if ((event.sendsInWindow ?? 0) >= SEND_LIMIT) {
      return log(rule, "BLOCKED", { reason: "send rate limit" });
    }
  }
  return log(rule, "EXECUTED", { action: rule.action });
}

function matches(rule: WorkflowRuleDraft, event: WorkflowEvent) {
  if (rule.trigger !== event.trigger) return false;
  if (rule.condition.status && rule.condition.status !== event.status) return false;
  if (rule.condition.hours !== undefined && (event.hoursElapsed ?? 0) < rule.condition.hours) {
    return false;
  }
  return true;
}

function log(rule: WorkflowRuleDraft, outcome: string, detail: unknown) {
  return {
    ruleId: rule.id,
    ruleVersion: rule.version,
    dryRun: false,
    outcome,
    detail,
  };
}
