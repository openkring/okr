// apps/functions/src/workflow/firestore-deps.ts
//
// The Firestore implementation of WorkflowDeps
// (planning/specs/2026-08-12-workflow-trigger-rules-design.md).
//
// Every query filters on ONE indexed equality field and narrows the rest in memory.
// The result sets are tiny (a handful of rules per tenant, the ownerships/invoices of
// one person) and this keeps the feature from needing new composite indexes — the
// firestore.indexes.json file is known to drift from the deployed set.

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

import { ApprovalCollection, ApprovalModel, ApprovalModelName, AvatarInfo, TaskModel, WorkflowRuleCollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { getTaskIndex } from '@okr/task-util';

import { shiftDaysBack } from '../auth/account-sync.decide';
import { serverHostname } from '../matrix-simple/shared';
import { SYSTEM_AUTHOR, logWorkflowActivity } from './activity';
import { OutboxDoc, WorkflowOutboxCollection } from './outbox';
import { InvoiceDoc, NewTask, OwnershipDoc, ResponsibilityDoc, WorkflowDeps, WorkflowRuleDoc } from './types';

const CF_NAME = 'workflow';

export { SYSTEM_AUTHOR };

/** '@workflow/messages.exitTreasurer' → module 'workflow/messages', key 'exitTreasurer'. */
export function splitMessageKey(messageKey: string): { module: string; key: string } {
  const bare = messageKey.startsWith('@') ? messageKey.slice(1) : messageKey;
  const dot = bare.indexOf('.');
  if (dot < 0) return { module: '', key: bare };
  return { module: bare.slice(0, dot), key: bare.slice(dot + 1) };
}

/**
 * Cloud Functions have no Transloco, so the message is read from the same Firestore
 * i18n rows the CMS edits: the tenant override wins, the default catalog is the
 * fallback, and an unknown key degrades to itself (visible, not silent).
 *
 * German only — a task name is written once, for one assignee, and every tenant today
 * runs on the default language.
 */
async function translate(tenantId: string, messageKey: string, params: Record<string, string>): Promise<string> {
  if (!messageKey) return '';
  const db = getFirestore();
  const { module, key } = splitMessageKey(messageKey);

  const read = async (collection: string, extra?: [string, string]): Promise<string> => {
    let query = db.collection(collection).where('key', '==', key).where('module', '==', module);
    if (extra) query = query.where(extra[0], '==', extra[1]);
    const snap = await query.limit(5).get();
    const row = snap.docs.map((d) => d.data()).find((d) => !d['isArchived']);
    return (row?.['de'] as string | undefined) ?? '';
  };

  const text = (await read('i18nTenantOverride', ['tenantId', tenantId])) || (await read('i18nDefault')) || messageKey;
  // single braces: translateAll()/Transloco would consume {{…}} params before this text
  // ever reaches the engine (see the i18n skill), so the placeholders are {name},
  // {category}, {fromCategory}. An unknown placeholder is left standing, not blanked.
  // trimmed: a report started outside a trip leaves '{tripName}' empty, and a message must not
  // end in the dangling space that would leave behind
  return text.replaceAll(/\{(\w+)\}/g, (match, key: string) => params[key] ?? match).trim();
}

/**
 * Queue a side effect for `onWorkflowOutbox`, which is the only function holding the mail
 * / Matrix / DeepSign secrets. See outbox.ts for why the engine does not send directly.
 */
async function enqueue(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  ruleKey: string,
  kind: OutboxDoc['kind'],
  payload: Record<string, string>,
): Promise<void> {
  const doc: OutboxDoc = {
    tenants: [tenantId],
    kind,
    ruleKey,
    day: getTodayStr(DateFormat.StoreDate),
    state: 'pending',
    payload,
  };
  await db.collection(WorkflowOutboxCollection).add(doc);
  logger.info(`${CF_NAME}: queued ${kind} for rule ${ruleKey} (tenant ${tenantId})`);
}

/** AvatarInfo for a user document (the tenant-admin fallback). */
function avatarFromUser(u: Record<string, unknown>): AvatarInfo {
  return {
    key: (u['personKey'] as string) ?? '',
    name1: (u['firstName'] as string) ?? '',
    name2: (u['lastName'] as string) ?? '',
    modelType: 'person',
    type: '',
    subType: '',
    label: '',
  };
}

export function createFirestoreDeps(): WorkflowDeps {
  const db = getFirestore();

  return {
    async rules(tenantId, event): Promise<WorkflowRuleDoc[]> {
      const snap = await db.collection(WorkflowRuleCollection).where('event', '==', event).get();
      return snap.docs
        .map((d) => ({ ...(d.data() as WorkflowRuleDoc), okey: d.id }))
        .filter((r) => !r.isArchived)
        .filter((r) => ((r as unknown as { tenants?: string[] }).tenants ?? []).includes(tenantId));
    },

    async ownerships(personKey, tenantId): Promise<OwnershipDoc[]> {
      const snap = await db.collection('ownerships').where('ownerKey', '==', personKey).get();
      return snap.docs
        .map((d) => d.data() as OwnershipDoc & { tenants?: string[]; ownerModelType?: string })
        .filter((o) => (o.tenants ?? []).includes(tenantId) && o.ownerModelType !== 'org');
    },

    async invoices(personKey, tenantId): Promise<InvoiceDoc[]> {
      const snap = await db.collection('invoices').where('receiver.key', '==', personKey).get();
      return snap.docs
        .map((d) => d.data() as InvoiceDoc & { tenants?: string[] })
        .filter((i) => (i.tenants ?? []).includes(tenantId));
    },

    async responsibility(key, tenantId): Promise<ResponsibilityDoc | undefined> {
      const snap = await db.collection('responsibilities').doc(key).get();
      if (!snap.exists) return undefined;
      const data = snap.data() as ResponsibilityDoc & { tenants?: string[] };
      if (!(data.tenants ?? []).includes(tenantId)) return undefined;
      return { ...data, okey: snap.id };
    },

    async groupAdmin(roleName, tenantId): Promise<AvatarInfo | undefined> {
      const snap = await db.collection('groups').doc(roleName).get();
      if (!snap.exists) return undefined;
      const data = snap.data() as { admins?: AvatarInfo[]; tenants?: string[] };
      if (!(data.tenants ?? []).includes(tenantId)) return undefined;
      return data.admins?.[0];
    },

    async tenantAdmin(tenantId): Promise<AvatarInfo | undefined> {
      const snap = await db.collection('users').where('roles.admin', '==', true).get();
      const admin = snap.docs
        .map((d) => d.data() as Record<string, unknown>)
        .find((u) => ((u['tenants'] as string[]) ?? []).includes(tenantId));
      return admin ? avatarFromUser(admin) : undefined;
    },

    async hasOpenTask(relatedKey, assigneeKey, tenantId): Promise<boolean> {
      if (!relatedKey) return false;
      const snap = await db.collection('tasks').where('relatedKey', '==', relatedKey).get();
      return snap.docs
        .map((d) => d.data() as Record<string, unknown>)
        .some((t) =>
          !t['isArchived'] &&
          t['state'] !== 'done' &&
          (t['completionDate'] ?? '') === '' &&
          ((t['assignee'] as AvatarInfo | undefined)?.key ?? '') === assigneeKey &&
          ((t['tenants'] as string[]) ?? []).includes(tenantId));
    },

    async createTask(t: NewTask): Promise<void> {
      const task = new TaskModel(t.tenantId);
      task.name = t.name;
      task.author = SYSTEM_AUTHOR;
      task.assignee = t.assignee;
      // shiftDaysBack with a negative offset shifts forward — the only date arithmetic
      // helper in the functions app, reused rather than duplicated.
      task.dueDate = t.dueInDays > 0 ? shiftDaysBack(getTodayStr(DateFormat.StoreDate), -t.dueInDays) : '';
      task.relatedModelType = t.relatedModelType;
      task.relatedKey = t.relatedKey;
      task.linkKey = t.linkKey ?? '';
      task.linkModelType = task.linkKey.split('.')[0] ?? '';
      task.notes = t.notes ?? '';
      task.index = getTaskIndex(task);
      const { okey, ...doc } = task;   // okey is the document id, never a field
      void okey;
      await db.collection('tasks').add(doc);
      logger.info(`${CF_NAME}: opened task "${task.name}" for ${t.assignee.key} (${t.relatedKey})`);
    },

    async avatarFor(personKey, tenantId): Promise<AvatarInfo | undefined> {
      if (!personKey) return undefined;
      const snap = await db.collection('persons').doc(personKey).get();
      if (!snap.exists) return undefined;
      const p = snap.data() as Record<string, unknown>;
      if (!((p['tenants'] as string[]) ?? []).includes(tenantId)) return undefined;
      return {
        key: snap.id,
        name1: (p['firstName'] as string) ?? '',
        name2: (p['lastName'] as string) ?? '',
        modelType: 'person',
        type: '',
        subType: '',
        label: '',
      };
    },

    async emailFor(personKey, tenantId): Promise<string> {
      if (!personKey) return '';
      // addresses.parentKey is the PREFIXED key — 'person.<okey>', not the raw okey.
      const snap = await db.collection('addresses').where('parentKey', '==', `person.${personKey}`).get();
      const emails = snap.docs
        .map((d) => d.data() as Record<string, unknown>)
        .filter((a) => !a['isArchived'] && a['addressChannel'] === 'email' && ((a['tenants'] as string[]) ?? []).includes(tenantId))
        .filter((a) => ((a['email'] as string) ?? '').length > 0);
      const favorite = emails.find((a) => a['isFavorite'] === true) ?? emails[0];
      return (favorite?.['email'] as string) ?? '';
    },

    async matrixIdFor(personKey): Promise<string> {
      // The localpart is the person okey, lowercased (matrix-simple/shared.ts). A person
      // with no user account has no Matrix account either.
      if (!personKey) return '';
      const snap = await db.collection('users').where('personKey', '==', personKey).limit(1).get();
      if (snap.empty) return '';
      return `@${personKey.toLowerCase()}:${serverHostname()}`;
    },

    async sendCount(tenantId, ruleKey, today): Promise<number> {
      // The outbox IS the counter — one row per intent, stamped with the day.
      const snap = await db.collection(WorkflowOutboxCollection).where('ruleKey', '==', ruleKey).get();
      return snap.docs
        .map((d) => d.data() as { tenants?: string[]; day?: string })
        .filter((o) => (o.tenants ?? []).includes(tenantId) && o.day === today)
        .length;
    },

    async sendEmail(mail): Promise<void> {
      await enqueue(db, mail.tenantId, mail.ruleKey, 'sendEmail', {
        to: mail.to, subject: mail.subject, body: mail.body, template: mail.template,
      });
    },

    async sendChatMessage(msg): Promise<void> {
      await enqueue(db, msg.tenantId, msg.ruleKey, 'sendMessage', {
        matrixUserId: msg.matrixUserId, body: msg.body, txnId: msg.txnId,
      });
    },

    async openChatRoom(req): Promise<void> {
      await enqueue(db, req.tenantId, req.ruleKey, 'openChat', {
        groupId: req.groupId, personKey: req.personKey, body: req.body, txnId: req.txnId,
      });
    },

    async startEsign(req): Promise<void> {
      await enqueue(db, req.tenantId, req.ruleKey, 'esign', {
        storagePath: req.storagePath,
        documentName: req.documentName || req.relatedKey,
        // DeepSign picks the signees out of the PDF's predefined fields, so the resolved
        // responsible person is recorded as the initiator, not as a signee.
        signeePersonKey: req.signee.key,
        relatedKey: req.relatedKey,
      });
    },

    async hasPendingApproval(subjectKey, kind, tenantId): Promise<boolean> {
      const snap = await db.collection(ApprovalCollection).where('subjectKey', '==', subjectKey).get();
      return snap.docs
        .map((d) => d.data() as Record<string, unknown>)
        .some((a) =>
          !a['isArchived'] &&
          a['state'] === 'pending' &&
          (a['kind'] ?? '') === kind &&
          ((a['tenants'] as string[]) ?? []).includes(tenantId));
    },

    async createApproval(a): Promise<void> {
      const approval = new ApprovalModel(a.tenantId);
      approval.kind = a.kind;
      approval.subjectModelType = a.subjectModelType;
      approval.subjectKey = a.subjectKey;
      approval.subjectName = a.subjectName;
      approval.requestedBy = a.requestedBy;
      approval.approver = a.approver;
      approval.ruleKey = a.ruleKey;
      approval.writeBack = a.writeBack;
      approval.index = `k:${a.kind} s:${a.subjectKey} n:${a.subjectName}`.toLowerCase();

      const approvalRef = db.collection(ApprovalCollection).doc();
      const batch = db.batch();

      // No approver means no second pair of eyes was found: the approval is created so it
      // is visible in the admin's unassigned filter, but there is nobody to task.
      if (a.approver?.key) {
        const task = new TaskModel(a.tenantId);
        task.name = a.taskName;
        task.author = SYSTEM_AUTHOR;
        task.assignee = a.approver;
        task.dueDate = a.dueInDays > 0 ? shiftDaysBack(getTodayStr(DateFormat.StoreDate), -a.dueInDays) : '';
        task.relatedModelType = ApprovalModelName;
        task.relatedKey = `${ApprovalModelName}.${approvalRef.id}`;
        task.index = getTaskIndex(task);
        const { okey: taskOkey, ...taskDoc } = task;
        void taskOkey;
        const taskRef = db.collection('tasks').doc();
        batch.set(taskRef, taskDoc);
        approval.taskKey = taskRef.id;
      }

      const { okey, ...doc } = approval;
      void okey;
      batch.set(approvalRef, doc);
      // One batch, so an approval can never exist without its task or the other way round.
      await batch.commit();
      logger.info(`${CF_NAME}: approval ${approvalRef.id} (${a.kind}) for ${a.subjectKey} → ${a.approver?.key ?? 'unassigned'}`);
    },

    translate,

    async logActivity(tenantId, payload): Promise<void> {
      await logWorkflowActivity(tenantId, payload);
    },
  };
}
