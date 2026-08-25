import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

/**
 * A tenant-scoped rule: on this domain event, if this condition holds, open a task for
 * whoever is responsible (planning/specs/2026-08-12-workflow-trigger-rules-design.md).
 *
 * Replaces the hard-coded `if` blocks that used to create treasurer/resourceAdmin tasks
 * in MembershipStore. Evaluated server-side by apps/functions/src/workflow, so imports,
 * bexio sync and Cloud Function writes produce the same consequences as the UI.
 *
 * `event`, `probe` and the `action` of each step are strings backed by DB categories
 * (workflow_event, workflow_probe, workflow_action), not TypeScript enums — the set can
 * grow without a model change and an admin sees translated labels.
 *
 * Invariants (opening/closing a user account) are NOT rules: deleting a rule must never
 * be able to leave an ex-member with a live account.
 */

/**
 * One consequence of a rule. A rule may have several — 'open a task AND start a chat with the
 * group' is one intent, one probe, one responsibility, two steps.
 *
 * `actionArg` stays the ONE variable string per action (email template, esign storage path,
 * approval kind, openChat group key). A JSON blob here would be an expression language by the
 * back door.
 */
export interface WorkflowActionStep {
  action: string;      // category workflow_action: openTask | sendEmail | sendMessage | esign | requestApproval | openChat
  actionArg: string;
  messageKey: string;  // i18n key for the task name / message body
  dueInDays: number;   // openTask only; 0 = no due date
  writeBack: string;   // requestApproval only; 'collection.field', '' = none
}

/** A fresh step. `openTask` is the default action, as it was for the whole rule before. */
export function newWorkflowActionStep(action = 'openTask'): WorkflowActionStep {
  return { action, actionArg: '', messageKey: '', dueInDays: 0, writeBack: '' };
}

export class WorkflowRuleModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public name = DEFAULT_NAME;    // admin-facing label, e.g. 'Austritt → Kassier'
  public event = '';             // category workflow_event, e.g. 'membership.ended'
  public probe = '';             // '' = always fires; else a name from the probe registry
  public probeArg = '';          // optional single argument, e.g. 'key' | 'locker'
  public responsibilityKey = ''; // ResponsibilityModel.okey → who gets the task
  /** The consequences, in order. Never empty for a usable rule — the form seeds one. */
  public steps: WorkflowActionStep[] = [newWorkflowActionStep()];

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const WorkflowRuleCollection = 'workflow-rules';
export const WorkflowRuleModelName = 'workflowRule';
