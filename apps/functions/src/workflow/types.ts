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
  event: string;              // 'membership.created' | 'membership.ended' | 'membership.categoryChanged'
  personKey: string;
  relatedKey: string;         // '<modelType>.<okey>', prefixed per the addresses parentKey convention
  subjectName: string;        // e.g. 'Anna Muster' — filled into the {name} placeholder of the message
  subjectCategory: string;    // the membership category AFTER the event ('' for non-membership events)
  categoryAbbr: string;       // its abbreviation from relLog, e.g. 'A1' — the {category} placeholder
  previousAbbr: string;       // the abbreviation before the change, e.g. 'A' — the {fromCategory} placeholder
  today: string;              // StoreDate (yyyyMMdd); a parameter so the engine has no clock
}

export interface WorkflowRuleDoc {
  okey: string;
  event?: string;
  probe?: string;
  probeArg?: string;
  action?: string;
  responsibilityKey?: string;
  messageKey?: string;
  dueInDays?: number;
  order?: number;
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
  /** i18nTenantOverride → i18nDefault; `{placeholder}`s are filled from params */
  translate(tenantId: string, messageKey: string, params: Record<string, string>): Promise<string>;
  logActivity(tenantId: string, payload: Record<string, unknown>): Promise<void>;
}
