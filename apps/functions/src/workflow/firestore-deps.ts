// apps/functions/src/workflow/firestore-deps.ts
//
// The Firestore implementation of WorkflowDeps
// (planning/specs/2026-08-12-workflow-trigger-rules-design.md).
//
// Every query filters on ONE indexed equality field and narrows the rest in memory.
// The result sets are tiny (a handful of rules per tenant, the ownerships/invoices of
// one person) and this keeps the feature from needing new composite indexes — the
// firestore.indexes.json file is known to drift from the deployed set.

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

import { AvatarInfo, TaskModel, WorkflowRuleCollection } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { getTaskIndex } from '@okr/task-util';

import { shiftDaysBack } from '../auth/account-sync.decide';
import { InvoiceDoc, NewTask, OwnershipDoc, ResponsibilityDoc, WorkflowDeps, WorkflowRuleDoc } from './types';

const CF_NAME = 'workflow';

/** Author stamped on tasks and activities created by the engine. */
export const SYSTEM_AUTHOR: AvatarInfo = {
  key: '',
  name1: 'System',
  name2: '',
  modelType: 'user',
  type: '',
  subType: '',
  label: 'System',
};

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
async function translate(tenantId: string, messageKey: string, subjectName: string): Promise<string> {
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
  // ever reaches the engine (see the i18n skill), so the placeholder is {name}.
  return text.replace(/\{name\}/g, subjectName);
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
      task.index = getTaskIndex(task);
      const { okey, ...doc } = task;   // okey is the document id, never a field
      void okey;
      await db.collection('tasks').add(doc);
      logger.info(`${CF_NAME}: opened task "${task.name}" for ${t.assignee.key} (${t.relatedKey})`);
    },

    translate,

    async logActivity(tenantId, payload): Promise<void> {
      try {
        const timestamp = getTodayStr(DateFormat.StoreDateTime);
        await db.collection('activities').add({
          tenants: [tenantId],
          isArchived: false,
          timestamp,
          scope: 'workflow',
          action: 'update',
          roleNeeded: 'admin',
          payload: JSON.stringify(payload),
          author: SYSTEM_AUTHOR,
          index: `t:${timestamp} c:workflow a:update p:System`,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (error) {
        logger.error(`${CF_NAME}: could not write activity`, error);
      }
    },
  };
}
