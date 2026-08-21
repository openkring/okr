// apps/functions/src/workflow/types.ts
//
// The data seam of the workflow engine
// (planning/specs/2026-08-12-workflow-trigger-rules-design.md).
//
// Read-side document shapes are inlined subsets (same pattern as account-sync.decide.ts
// and task/index.ts); the write side builds a real TaskModel in firestore-deps.ts.

import { AvatarInfo } from '@okr/shared-models';

/** What the engine is told about the event that fired. */
export interface WorkflowContext {
  tenantId: string;
  event: string;              // see the event catalogue, e.g. 'membership.ended' | 'expense.created'
  personKey: string;          // the SUBJECT of the event; '' when it has none (anonymous form submission)
  relatedKey: string;         // '<modelType>.<okey>', prefixed per the addresses parentKey convention
  subjectName: string;        // e.g. 'Anna Muster' — filled into the {name} placeholder of the message
  today: string;              // StoreDate (yyyyMMdd); a parameter so the engine has no clock
  /**
   * Everything event-specific: message placeholders AND probe input. The membership
   * emitter fills { category, categoryAbbr, fromCategory }; an expense fills
   * { amount, currency, … }. Keeping it a bag is what stopped this seam from being
   * membership-shaped (spec 2026-08-15-approval-workflow-spec.md §1.1).
   */
  params: Record<string, string>;
}

export interface WorkflowRuleDoc {
  okey: string;
  event?: string;
  probe?: string;
  probeArg?: string;
  action?: string;
  actionArg?: string;         // email template | esign storage path | approval kind
  writeBack?: string;         // 'collection.field' patched on an approval outcome, '' = none
  responsibilityKey?: string;
  messageKey?: string;
  dueInDays?: number;
  isArchived?: boolean;
}

export interface ResponsibilityDoc {
  okey?: string;
  isArchived?: boolean;
  responsibleAvatar?: AvatarInfo;
  delegateAvatar?: AvatarInfo;
  delegateValidFrom?: string;
  delegateValidTo?: string;
  validFrom?: string;
  validTo?: string;
}

export interface OwnershipDoc {
  state?: string;
  resourceType?: string;
  isArchived?: boolean;
}

export interface InvoiceDoc {
  state?: string;
  isArchived?: boolean;
}

export interface NewTask {
  tenantId: string;
  name: string;
  assignee: AvatarInfo;
  dueInDays: number;
  relatedModelType: string;
  relatedKey: string;
  /**
   * Optional link target of the task ('<modelType>.<okey>'), from `ctx.params['linkKey']`.
   * Needed wherever relatedKey is a per-occurrence dedup key with no document behind it —
   * a damage report's 'report.<uuid>' points nowhere, its trip does.
   */
  linkKey?: string;
  /**
   * Free text of the event, from `ctx.params['notes']`. The task NAME comes from the rule's
   * messageKey and is the same for every occurrence; anything the reporter actually typed
   * (a damage description) would otherwise have nowhere to go.
   */
  notes: string;
}

export interface OutgoingEmail {
  tenantId: string;
  ruleKey: string;
  to: string;
  subject: string;
  body: string;
  template: string;           // '' = plain HTML send
}

export interface OutgoingChatMessage {
  tenantId: string;
  ruleKey: string;
  matrixUserId: string;       // '@localpart:server'
  body: string;
  txnId: string;
}

export interface EsignRequest {
  tenantId: string;
  ruleKey: string;
  storagePath: string;
  signee: AvatarInfo;
  documentName: string;
  relatedKey: string;
}

export interface NewApproval {
  tenantId: string;
  kind: string;
  subjectModelType: string;
  subjectKey: string;
  subjectName: string;
  requestedBy: AvatarInfo | undefined;
  /** undefined = no second pair of eyes was found; the approval stalls unassigned */
  approver: AvatarInfo | undefined;
  ruleKey: string;
  writeBack: string;
  taskName: string;
  dueInDays: number;
}

/**
 * Every I/O the engine needs. One interface, one Firestore implementation
 * (firestore-deps.ts), one fake in the spec — no emulator required.
 */
export interface WorkflowDeps {
  /** non-archived rules of the tenant for this event */
  rules(tenantId: string, event: string): Promise<WorkflowRuleDoc[]>;
  ownerships(personKey: string, tenantId: string): Promise<OwnershipDoc[]>;
  invoices(personKey: string, tenantId: string): Promise<InvoiceDoc[]>;
  responsibility(key: string, tenantId: string): Promise<ResponsibilityDoc | undefined>;
  /** today's fallback: groups/<roleName>.admins[0] */
  groupAdmin(roleName: string, tenantId: string): Promise<AvatarInfo | undefined>;
  tenantAdmin(tenantId: string): Promise<AvatarInfo | undefined>;
  /** a non-done, non-archived task with the same relatedKey and assignee already exists */
  hasOpenTask(relatedKey: string, assigneeKey: string, tenantId: string): Promise<boolean>;
  createTask(task: NewTask): Promise<void>;
  /** the person's own avatar — the requester of an approval */
  avatarFor(personKey: string, tenantId: string): Promise<AvatarInfo | undefined>;
  /** favourite email address of the person, '' when there is none */
  emailFor(personKey: string, tenantId: string): Promise<string>;
  /** '@localpart:server' of the person's Matrix account, '' when not provisioned */
  matrixIdFor(personKey: string): Promise<string>;
  /** how many sends this rule already did today — the per-rule daily cap */
  sendCount(tenantId: string, ruleKey: string, today: string): Promise<number>;
  sendEmail(mail: OutgoingEmail): Promise<void>;
  sendChatMessage(msg: OutgoingChatMessage): Promise<void>;
  startEsign(req: EsignRequest): Promise<void>;
  /** a non-archived approval for the same subject and kind is still pending */
  hasPendingApproval(subjectKey: string, kind: string, tenantId: string): Promise<boolean>;
  /** writes the approval AND its task in one batch, so neither can exist without the other */
  createApproval(approval: NewApproval): Promise<void>;
  /** i18nTenantOverride → i18nDefault; `{placeholder}`s are filled from params */
  translate(tenantId: string, messageKey: string, params: Record<string, string>): Promise<string>;
  logActivity(tenantId: string, payload: Record<string, unknown>): Promise<void>;
}
