/**
 * Exit fee settlement, detection side (spec 1.105 §4): when a membership's exit date changes,
 * open, update or close the treasurer's settlement task. Nothing is paid or sent here; a failure
 * only means the treasurer settles by hand.
 *
 * §4.6 (rebuilding a not-yet-invoiced fee row) is deliberately NOT done here: the membership rules
 * let a user write a membership that merely contains one of their tenants, so an automatic write
 * into member-fees would be a cross-tenant tampering path. The no-invoice task text tells the
 * treasurer to reload the row in the fee run instead.
 */
import { logger } from 'firebase-functions/v2';
import { onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';
import { DocumentData, Firestore, getFirestore } from 'firebase-admin/firestore';
import { AvatarInfo, MembershipCollection, TaskCollection, TaskModel, UserCollection } from '@okr/shared-models';
import { addDuration, convertDateFormatToString, DateFormat, getTodayStr } from '@okr/shared-util-core';
import { getTaskIndex } from '@okr/project-task-util';
import {
  computeExitSettlement, EXIT_SETTLEMENT_TAG, ExitSettlement, exitSettlementTaskName, exitSettlementTaskNotes, noExitSettlement,
} from '@okr/relationship-membership-util';

import { SYSTEM_AUTHOR } from '../workflow/activity';
import { withoutUndefined } from '../invoice/invoice.logic';
import { CLOSE_NOTE, ExitContext, isAutoClosed, loadExitContext, settlementTaskId, treasurerAssignee } from './exit-settlement.context';
import { claimedInvoiceKey } from './settle-membership-exit.logic';

const REGION = 'europe-west6';
const CF_NAME = 'onMembershipExitWritten';
const DUE_IN_DAYS = 14;

export type UpsertDecision = 'create' | 'update' | 'close' | 'reopen' | 'noop';
export type TaskState = 'missing' | 'open' | 'claimed' | 'done' | 'auto-closed' | 'foreign';

/** Replaces the close note when an auto-closed task is reopened: keeps the history, no longer reads as auto-closed. */
export const REOPEN_NOTE = 'Wieder geöffnet: Austritt erneut geändert.';

/** Separates the generated figures (above) from what the treasurer writes (below). */
export const NOTES_MARKER = '--- Notizen ---';

/**
 * The task notes with a fresh generated block: everything below the marker is kept. An unmarked
 * note (legacy or marker deleted) is kept whole below the marker, so nothing typed by hand is lost.
 */
export function mergeTaskNotes(existing: string | undefined, generated: string): string {
  const old = existing ?? '';
  const at = old.indexOf(NOTES_MARKER);
  const own = at >= 0 ? old.substring(at + NOTES_MARKER.length).replace(/^\n/, '') : old;
  return `${generated}\n${NOTES_MARKER}\n${own}`;
}

const SETTLEMENT_WRITER_ROLES = ['memberAdmin', 'privileged', 'treasurer', 'admin'];

/** The user doc belongs to the tenant and holds a role that may end memberships or settle fees. */
export function isSettlementWriter(user: DocumentData | undefined, tenantId: string): boolean {
  if (!user || !(Array.isArray(user['tenants']) && (user['tenants'] as string[]).includes(tenantId))) return false;
  const roles = (user['roles'] ?? {}) as Record<string, unknown>;
  return SETTLEMENT_WRITER_ROLES.some(r => roles[r] === true);
}

/**
 * How to treat the writer of the event — fail closed. Only Admin SDK (service account) and system
 * writes pass unchecked; every other value ('unknown', 'api_key', 'app_user', 'unauthenticated',
 * anything new) needs a user doc with a settlement role in the tenant. The docs do not say which
 * authType a signed-in client write carries, so none is trusted.
 */
export function writerCheck(authType: string): 'allow' | 'check-user' {
  return authType === 'service_account' || authType === 'system' ? 'allow' : 'check-user';
}

const isSettleableExit = (exit: string, thisYear: number): boolean => {
  if (!/^\d{8}$/.test(exit) || exit.startsWith('9999') || exit.substring(4) === '1231') return false;
  const year = Number(exit.substring(0, 4));
  return year === thisYear || year === thisYear - 1;
};

/**
 * On a membership create: the other memberships of the same member in the same org that ended in
 * this or the previous year (I1). A category change ends the old membership before it creates the
 * new one, so the old one's settlement ran while it still looked like the only one; re-run it now.
 */
export function siblingsToSettle(
  created: { okey: string; memberKey: string; orgKey: string },
  memberships: { okey: string; memberKey?: string; orgKey?: string; dateOfExit?: string; isArchived?: boolean }[],
  today: string,
): string[] {
  const thisYear = Number(today.substring(0, 4));
  return memberships
    .filter(m => m.okey !== created.okey && m.isArchived !== true && m.memberKey === created.memberKey &&
      m.orgKey === created.orgKey && isSettleableExit(m.dateOfExit ?? '', thisYear))
    .map(m => m.okey);
}

/** '' and 99991231 both mean «no exit». */
const exitOf = (d: DocumentData | undefined): string => {
  const exit = typeof d?.['dateOfExit'] === 'string' ? (d['dateOfExit'] as string) : '';
  return exit.startsWith('9999') ? '' : exit;
};

/** Whether the exit date moved or the membership was (un)archived; a deleted membership never counts. */
export function exitChanged(before: DocumentData | undefined, after: DocumentData | undefined): boolean {
  if (!after) return false;
  return exitOf(before) !== exitOf(after) || (before?.['isArchived'] === true) !== (after['isArchived'] === true);
}

/** An archived membership has nothing to settle: its open task closes (I1). */
export function exitSettlementFor(membership: { isArchived?: boolean }, compute: () => ExitSettlement): ExitSettlement {
  return membership.isArchived === true ? noExitSettlement() : compute();
}

const notesOf = (t: DocumentData | undefined): string => (typeof t?.['notes'] === 'string' ? (t['notes'] as string) : '');

/**
 * The settlement task as `upsertDecision` sees it. A task of another tenant (the id is guessable,
 * tasks are client-writable) and an archived task are never touched; a done task the trigger closed
 * itself is 'auto-closed', every other done task is the treasurer's decision.
 */
export function taskStateOf(task: DocumentData | undefined, tenantId: string): TaskState {
  if (!task) return 'missing';
  if (!(Array.isArray(task['tenants']) && (task['tenants'] as string[]).includes(tenantId))) return 'foreign';
  if (task['isArchived'] === true) return 'done';
  const done = task['state'] === 'done' || (typeof task['completionDate'] === 'string' && task['completionDate'] !== '');
  if (done) return isAutoClosed(task) ? 'auto-closed' : 'done';
  return claimedInvoiceKey(task) !== '' ? 'claimed' : 'open';
}

/**
 * What to do with the settlement task (§4.5). A done task is a decision already taken: never
 * reopened, never duplicated. A claimed task (an invoice adjustment in progress, the storno possibly
 * written) is left alone too: closing or rewriting it would strand a cancelled invoice. A task the
 * trigger closed itself is reopened in place when something is due again.
 */
export function upsertDecision(s: ExitSettlement, task: TaskState): UpsertDecision {
  if (task === 'done' || task === 'claimed' || task === 'foreign') return 'noop';
  if (s.case === 'none') return task === 'open' ? 'close' : 'noop';
  if (task === 'auto-closed') return 'reopen';
  return task === 'open' ? 'update' : 'create';
}

/** The one decision function of the trigger, the backfill and its dry run. */
export function settlementTaskDecision(s: ExitSettlement, task: DocumentData | undefined, tenantId: string): UpsertDecision {
  return upsertDecision(s, taskStateOf(task, tenantId));
}

/** The notes of a reopened task: fresh figures, the treasurer text kept, the close note turned into history. */
export function reopenedTaskNotes(existing: string | undefined, generated: string): string {
  return mergeTaskNotes((existing ?? '').split(CLOSE_NOTE).join(REOPEN_NOTE), generated);
}

/**
 * Create, update, close or reopen the membership's settlement task (`exit-<membershipKey>`) in ONE
 * transaction, so two trigger events racing on the same membership (a category change writes the old
 * and the new membership) end in one task. Reused by the backfill.
 */
export async function openOrUpdateSettlementTask(db: Firestore, ctx: ExitContext, settlement: ExitSettlement): Promise<UpsertDecision> {
  const today = getTodayStr(DateFormat.StoreDate);
  const ref = db.collection(TaskCollection).doc(settlementTaskId(ctx.membershipKey));
  const exitViewDate = convertDateFormatToString(ctx.membership.dateOfExit, DateFormat.StoreDate, DateFormat.ViewDate, false);
  const name = exitSettlementTaskName(ctx.memberLabel, settlement);
  const generated = exitSettlementTaskNotes(settlement, exitViewDate);
  const dueDate = addDuration(today, { days: DUE_IN_DAYS });

  return db.runTransaction(async (tx) => {
    const found = (await tx.get(ref)).data();
    const state = taskStateOf(found, ctx.tenantId);
    const decision = upsertDecision(settlement, state);
    if (state === 'claimed') logger.info(`${CF_NAME}: task of membership ${ctx.membershipKey} is claimed by an invoice adjustment, left alone`);
    if (state === 'foreign') logger.warn(`${CF_NAME}: task ${ref.id} does not belong to tenant ${ctx.tenantId}, left alone`);

    switch (decision) {
      case 'noop':
        break;
      case 'close': {
        const notes = notesOf(found);
        tx.update(ref, { state: 'done', completionDate: today, notes: notes ? `${notes}\n${CLOSE_NOTE}` : CLOSE_NOTE });
        break;
      }
      case 'update': {
        const notes = mergeTaskNotes(notesOf(found), generated);
        tx.update(ref, { name, notes, index: getTaskIndex({ ...(found as TaskModel), name, notes }) });
        break;
      }
      case 'reopen': {
        const assignee = await treasurerAssignee(db, ctx.tenantId, today);
        const open = new TaskModel(ctx.tenantId).state;
        const patch: Partial<TaskModel> = {
          state: open, completionDate: '', name, notes: reopenedTaskNotes(notesOf(found), generated), dueDate,
          ...(assignee ? { assignee } : {}),
        };
        tx.update(ref, withoutUndefined({ ...patch, index: getTaskIndex({ ...(found as TaskModel), ...patch }) }));
        break;
      }
      case 'create': {
        const assignee = await treasurerAssignee(db, ctx.tenantId, today);
        tx.create(ref, withoutUndefined(newSettlementTask(ctx, name, generated, dueDate, assignee)));
        break;
      }
    }
    return decision;
  });
}

function newSettlementTask(ctx: ExitContext, name: string, generated: string, dueDate: string, assignee: AvatarInfo | undefined): Omit<TaskModel, 'okey'> {
  const task = new TaskModel(ctx.tenantId);
  task.name = name;
  task.notes = mergeTaskNotes(undefined, generated);
  task.tags = EXIT_SETTLEMENT_TAG;
  task.relatedKey = `membership.${ctx.membershipKey}`;
  task.relatedModelType = 'membership';
  task.author = SYSTEM_AUTHOR;
  task.assignee = assignee;
  task.dueDate = dueDate;
  task.index = getTaskIndex(task);
  const { okey, ...doc } = task;   // okey is the document id, never a field
  void okey;
  return doc;
}

/** Settle one membership, unless the writer of the event may not act in its tenant. */
async function settleMembership(db: Firestore, membershipKey: string, writer: { authType: string; authId?: string }, today: string): Promise<void> {
  // an archived membership is loaded too, so its open task closes
  const ctx = await loadExitContext(db, membershipKey, today, { includeArchived: true });
  if (!ctx) return;
  if (writerCheck(writer.authType) === 'check-user') {
    const user = writer.authId ? (await db.collection(UserCollection).doc(writer.authId).get()).data() : undefined;
    if (!isSettlementWriter(user, ctx.tenantId)) {
      logger.warn(`${CF_NAME}: writer ${writer.authType}/${writer.authId ?? '-'} may not settle membership ${membershipKey} in tenant ${ctx.tenantId}, skipped`);
      return;
    }
  }
  const settlement = exitSettlementFor(ctx.membership, () => computeExitSettlement(ctx.input));
  const decision = await openOrUpdateSettlementTask(db, ctx, settlement);
  logger.info(`${CF_NAME}: membership ${membershipKey} case ${settlement.case}${settlement.manualReason ? ` (${settlement.manualReason})` : ''} -> ${decision}`);
}

export const onMembershipExitWritten = onDocumentWrittenWithAuthContext(
  { document: 'memberships/{key}', region: REGION },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const membershipKey = event.params['key'] as string;
    const db = getFirestore();
    const today = getTodayStr(DateFormat.StoreDate);
    const writer = { authType: String(event.authType), authId: event.authId };

    const keys: string[] = exitChanged(before, after) ? [membershipKey] : [];
    if (!before && after) {
      try {
        const memberKey = typeof after['memberKey'] === 'string' ? (after['memberKey'] as string) : '';
        const orgKey = typeof after['orgKey'] === 'string' ? (after['orgKey'] as string) : '';
        if (memberKey && orgKey) {
          const snap = await db.collection(MembershipCollection).where('memberKey', '==', memberKey).get();
          keys.push(...siblingsToSettle({ okey: membershipKey, memberKey, orgKey },
            snap.docs.map(d => ({ ...(d.data() as { memberKey?: string; orgKey?: string; dateOfExit?: string; isArchived?: boolean }), okey: d.id })), today));
        }
      } catch (err) {
        logger.error(`${CF_NAME}: sibling lookup failed for membership ${membershipKey}`, err);
      }
    }

    for (const key of keys) {
      try {
        // the live document, not the event's snapshot: out-of-order delivery must not resurrect an old exit
        await settleMembership(db, key, writer, today);
      } catch (err) {
        logger.error(`${CF_NAME}: settlement task failed for membership ${key}`, err);
      }
    }
  },
);
