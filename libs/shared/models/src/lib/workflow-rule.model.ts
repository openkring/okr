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
 * `event`, `probe` and `action` are strings backed by DB categories (workflow_event,
 * workflow_probe, workflow_action), not TypeScript enums — the set can grow without a
 * model change and an admin sees translated labels.
 *
 * Invariants (opening/closing a user account) are NOT rules: deleting a rule must never
 * be able to leave an ex-member with a live account.
 */
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
  public action = 'openTask';    // category workflow_action: openTask | sendEmail | sendMessage | esign | requestApproval
  // The one variable piece of the chosen action: an email template name, the esign
  // storage path (with {relatedKey}), or the approval kind. Deliberately ONE string —
  // a JSON blob here would be an expression language by the back door.
  public actionArg = '';
  // 'collection.field' the approval outcome patches, '' = none. Only pairs listed in the
  // WRITE_BACK table in code are accepted, so a rule can never become a write primitive
  // over the whole database (spec 2026-08-15 §3.4).
  public writeBack = '';
  public responsibilityKey = ''; // ResponsibilityModel.okey → who gets the task
  public messageKey = '';        // i18n key for the task name
  public dueInDays = 0;          // 0 = no due date

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const WorkflowRuleCollection = 'workflow-rules';
export const WorkflowRuleModelName = 'workflowRule';
