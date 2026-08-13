import { WorkflowRuleModel } from '@okr/shared-models';
import { addIndexElement } from '@okr/shared-util-core';

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
 * 'membership.ended · hasActiveOwnerships:key → resourceAdmin'.
 * @param rule the rule to describe
 */
export function getWorkflowRuleSummary(rule: WorkflowRuleModel): string {
  const probe = rule.probe ? (rule.probeArg ? `${rule.probe}:${rule.probeArg}` : rule.probe) : '';
  return [rule.event, probe, rule.responsibilityKey ? `→ ${rule.responsibilityKey}` : '']
    .filter((part) => part.length > 0)
    .join(' · ');
}
