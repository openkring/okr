import { WorkflowRuleModel } from '@okr/shared-models';
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
 */
const PROBES_WITH_ARG = ['hasOwnershipOfType', 'categoryIs'];

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
 */
const ACTIONS_WITH_ARG = ['sendEmail', 'esign', 'requestApproval'];

/** Does this action still need the rule's `actionArg`? */
export function actionNeedsArg(action?: string): boolean {
  return ACTIONS_WITH_ARG.includes(action ?? '');
}

/** Only an approval has an outcome, so only it can patch a record with one. */
export function isApprovalAction(action?: string): boolean {
  return (action ?? '') === 'requestApproval';
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
 * One-line summary of what a rule does, shown as the list subtitle:
 * 'membership.ended · hasActiveOwnerships:key → Materialwart'.
 * @param rule the rule to describe
 * @param resolveResponsibility maps `responsibilityKey` to the responsibility's name;
 *        defaults to the raw key — a key is more useful than an empty arrow while the
 *        responsibilities are still loading or the referenced one was deleted.
 */
export function getWorkflowRuleSummary(
  rule: WorkflowRuleModel,
  resolveResponsibility: (key: string) => string = (key) => key): string {
  const probe = rule.probe ? (rule.probeArg ? `${rule.probe}:${rule.probeArg}` : rule.probe) : '';
  const responsibility = rule.responsibilityKey ? `→ ${resolveResponsibility(rule.responsibilityKey)}` : '';
  return [rule.event, probe, responsibility]
    .filter((part) => part.length > 0)
    .join(' · ');
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
    { header: i18n.messageKey_label(),        value: (r) => r.messageKey ?? '' },
    { header: i18n.dueInDays_label(),         value: (r) => String(r.dueInDays ?? 0) },
    { header: i18n.notes_label(),             value: (r) => r.notes ?? '' },
  ];
}
