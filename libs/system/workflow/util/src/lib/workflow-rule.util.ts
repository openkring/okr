import { newWorkflowActionStep, WorkflowActionStep, WorkflowRuleModel } from '@okr/shared-models';
import { addIndexElement, ExportColumn } from '@okr/shared-util-core';

import { WorkflowI18n } from './workflow-i18n';

/*-------------------------- factory --------------------------------*/
/**
 * Create a new WorkflowRuleModel. A rule with an empty probe fires on every occurrence
 * of its event — that is the intended default, the probe narrows it.
 * @param tenantId the tenant the rule belongs to
 * @param event the domain event the rule listens to, e.g. 'membership.ended'
 */
export function newWorkflowRuleModel(tenantId: string, event = ''): WorkflowRuleModel {
  const rule = new WorkflowRuleModel(tenantId);
  rule.event = event;
  // redundant with the class field initializer (each `new WorkflowRuleModel` already gets its
  // own steps array) — kept explicit here so the factory's output is self-evident without
  // having to go read the class
  rule.steps = [newWorkflowActionStep()];
  return rule;
}

/** One selectable responsibility in the rule form: the okey stored on the rule + its name. */
export interface ResponsibilityOption {
  key: string;
  name: string;
}

/**
 * Reserved `responsibilityKey`: address the person the event is ABOUT rather than a role —
 * e.g. the author of a task that somebody else completed. Mirrors SUBJECT_RECIPIENT in
 * `apps/functions/src/workflow/engine.ts`; a lib cannot import the functions app.
 */
export const SUBJECT_RECIPIENT = 'subject';

/*-------------------------- probes --------------------------------*/
/**
 * Probes that consume `probeArg`. Mirrors the PROBES registry in
 * `apps/functions/src/workflow/engine.ts` — a lib cannot import the functions app, so a new
 * argument-taking probe has to be added here too, next to its category item.
 *
 * Drift here is SILENT and disabling: a missing entry hides the probeArg field, so the admin
 * cannot enter the discriminator and the probe is unusable through the UI even though the
 * engine supports it. That is what happened to `decisionIs` (shipped with the approval spec)
 * and to `paramIs` (spec 2026-08-29 §1).
 */
const PROBES_WITH_ARG = ['hasOwnershipOfType', 'categoryIs', 'decisionIs', 'paramIs'];

/**
 * Does this probe still need the rule's `probeArg`?
 *
 * `probe` may be a comma-separated AND-list whose items can carry their own inline `:arg`
 * (e.g. 'categoryIs:passive,hasActiveOwnerships'). The engine prefers the inline argument, so
 * an item that brings one does NOT need the field — only a bare argument-taking probe does.
 * @param probe the rule's probe string
 */
export function probeNeedsArg(probe?: string): boolean {
  return (probe ?? '').split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
    .some((entry) => !entry.includes(':') && PROBES_WITH_ARG.includes(entry));
}

/*-------------------------- actions --------------------------------*/
/**
 * Actions that consume `actionArg`. Mirrors the action dispatch in
 * `apps/functions/src/workflow/engine.ts` — a lib cannot import the functions app.
 *  - sendEmail: an optional provider template name
 *  - esign:     the storage path of the document (may contain {relatedKey})
 *  - requestApproval: the approval kind, e.g. 'skiffPlatz'
 *  - openChat:  the okey of the group that answers, e.g. 'support'
 */
const ACTIONS_WITH_ARG = ['sendEmail', 'esign', 'requestApproval', 'openChat'];

/** Does this action still need the rule's `actionArg`? */
export function actionNeedsArg(action?: string): boolean {
  return ACTIONS_WITH_ARG.includes(action ?? '');
}

/** Only an approval has an outcome, so only it can patch a record with one. */
export function isApprovalAction(action?: string): boolean {
  return (action ?? '') === 'requestApproval';
}

/*-------------------------- steps --------------------------------*/
/**
 * The steps of a rule, never empty: a legacy document written before the model grew
 * `steps[]` has none, and the editor must not open on an empty list.
 * @param steps the rule's steps, possibly undefined
 */
export function getWorkflowSteps(steps?: WorkflowActionStep[]): WorkflowActionStep[] {
  return steps?.length ? steps : [newWorkflowActionStep()];
}

/**
 * Patch one step of a rule and return a new array — the steps array is never mutated in
 * place, otherwise the signal holding the rule would not see the change.
 * @param steps the rule's steps
 * @param index the step to patch
 * @param patch the fields to change
 */
export function patchWorkflowStep(
  steps: WorkflowActionStep[] | undefined, index: number, patch: Partial<WorkflowActionStep>): WorkflowActionStep[] {
  const next = [...getWorkflowSteps(steps)];
  if (index < 0 || index >= next.length) return next;
  next[index] = { ...next[index], ...patch };
  return next;
}

/**
 * Switch a step's action and drop the arguments the form no longer shows: data nobody can
 * see, correct or explain — and a stale `writeBack` would patch a record on an action that
 * never asks anyone.
 * @param steps the rule's steps
 * @param index the step to change
 * @param action the new action, a `workflow_action` category item
 */
export function setWorkflowStepAction(
  steps: WorkflowActionStep[] | undefined, index: number, action: string): WorkflowActionStep[] {
  return patchWorkflowStep(steps, index, {
    action,
    ...(actionNeedsArg(action) ? {} : { actionArg: '' }),
    ...(isApprovalAction(action) ? {} : { writeBack: '' }),
  });
}

/**
 * Append a fresh step. `openTask` is the default action, as it was for the whole rule
 * before a rule could have several.
 * @param steps the rule's steps
 */
export function addWorkflowStep(steps: WorkflowActionStep[] | undefined): WorkflowActionStep[] {
  return [...getWorkflowSteps(steps), newWorkflowActionStep()];
}

/**
 * Remove one step. The LAST step is never removed: a rule without a consequence does
 * nothing, the engine skips it, and the validation suite rejects it — so the editor keeps
 * one step and lets the admin delete the whole rule instead.
 * @param steps the rule's steps
 * @param index the step to remove
 */
export function removeWorkflowStep(steps: WorkflowActionStep[] | undefined, index: number): WorkflowActionStep[] {
  const current = getWorkflowSteps(steps);
  if (current.length <= 1 || index < 0 || index >= current.length) return current;
  return current.filter((_, i) => i !== index);
}

/**
 * Is this step fully configured? Mirrors the mandatory rules of the validation suite, so the
 * editor can mark the offending step in a collapsed list instead of only refusing to save.
 * @param step the step to check
 */
export function isWorkflowStepComplete(step: WorkflowActionStep): boolean {
  if (!step.action) return false;
  if (actionNeedsArg(step.action) && !step.actionArg) return false;
  return step.messageKey.length > 0;
}

/**
 * The collapsed one-line description of a step: its argument and its message key, i.e. the
 * two fields that distinguish two steps with the same action. Pure data — the action's own
 * label is translated from the `workflow_action` category by the caller.
 * @param step the step to describe
 */
export function getWorkflowStepSummary(step: WorkflowActionStep): string {
  return [step.actionArg, step.messageKey].filter((part) => part?.length > 0).join(' · ');
}

/**
 * The actions of a rule, in execution order — what the list shows instead of only the
 * trigger. Empty for a legacy document with no steps.
 * @param rule the rule to describe
 */
export function getWorkflowRuleActions(rule: WorkflowRuleModel): string[] {
  return (rule.steps ?? []).map((step) => step.action).filter((action) => action?.length > 0);
}

/**
 * Is every step of this rule fully configured? A rule that is missing a mandatory field
 * cannot be saved from the editor, but an import or a hand-written document can carry one.
 * @param rule the rule to check
 */
export function isWorkflowRuleComplete(rule: WorkflowRuleModel): boolean {
  const steps = rule.steps ?? [];
  return steps.length > 0 && steps.every((step) => isWorkflowStepComplete(step));
}

/*-------------------------- search index --------------------------------*/
/**
 * Build the search index string for a WorkflowRuleModel.
 * @param rule the rule to index
 */
export function getWorkflowRuleIndex(rule: WorkflowRuleModel): string {
  let index = '';
  index = addIndexElement(index, 'n', rule.name);
  index = addIndexElement(index, 'e', rule.event);
  index = addIndexElement(index, 'r', rule.responsibilityKey);
  return index;
}

/**
 * Returns a human-readable description of the index structure.
 */
export function getWorkflowRuleIndexInfo(): string {
  return 'n:ame e:vent r:esponsibility';
}

/*-------------------------- display --------------------------------*/
/**
 * The condition half of a rule, for a list that already shows the event as its group header:
 * 'hasActiveOwnerships:key → Materialwart'. Empty for an unconditional rule with no
 * responsibility, which is exactly what there is to say about it.
 * @param rule the rule to describe
 * @param resolveResponsibility maps `responsibilityKey` to the responsibility's name
 */
export function getWorkflowRuleCondition(
  rule: WorkflowRuleModel,
  resolveResponsibility: (key: string) => string = (key) => key): string {
  const probe = rule.probe ? (rule.probeArg ? `${rule.probe}:${rule.probeArg}` : rule.probe) : '';
  const responsibility = rule.responsibilityKey ? `→ ${resolveResponsibility(rule.responsibilityKey)}` : '';
  return [probe, responsibility].filter((part) => part.length > 0).join(' ');
}

/*-------------------------- export --------------------------------*/
/**
 * Columns of the workflow-rule CSV export, in display order.
 * @param i18n the resolved workflow labels (the form labels double as headers)
 * @param resolveResponsibility maps `responsibilityKey` to the responsibility's name
 */
export function getWorkflowRuleExportColumns(
  i18n: WorkflowI18n,
  resolveResponsibility: (key: string) => string = (key) => key): ExportColumn<WorkflowRuleModel>[] {
  return [
    { header: i18n.name_label(),              value: (r) => r.name ?? '' },
    { header: i18n.event_label(),             value: (r) => r.event ?? '' },
    { header: i18n.probe_label(),             value: (r) => r.probe ?? '' },
    { header: i18n.probeArg_label(),          value: (r) => r.probeArg ?? '' },
    { header: i18n.responsibilityKey_label(), value: (r) => resolveResponsibility(r.responsibilityKey ?? '') },
    // a CSV row is one line per rule; a multi-step rule's export shows its first step only —
    // the full sequence is what the detail view is for
    { header: i18n.messageKey_label(),        value: (r) => r.steps?.[0]?.messageKey ?? '' },
    { header: i18n.dueInDays_label(),         value: (r) => String(r.steps?.[0]?.dueInDays ?? 0) },
    { header: i18n.notes_label(),             value: (r) => r.notes ?? '' },
  ];
}
