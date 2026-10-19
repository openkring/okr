/**
 * Exit fee settlement, detection side (spec 1.105 §4): when a membership's exit date changes,
 * open, update or close the treasurer's settlement task, and rebuild a not-yet-invoiced fee row of
 * the running year (§4.6). Nothing is paid or sent here; a failure only means the treasurer settles
 * by hand.
 *
 * The tenant is the WRITER's tenant (`users/{authId}.tenants[0]`, as `getCallerTenantId` reads it for
 * callables), never guessed from the membership's `tenants` array; the membership must belong to it
 * and the writer must hold a settlement role. Admin SDK / system writes and writes without an authId
 * do nothing: the callable's «extend» already set its task done, the backfill passes its tenant itself.
 */
import { logger } from 'firebase-functions/v2';
import { onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';
import { DocumentData, Firestore, getFirestore } from 'firebase-admin/firestore';
import { AvatarInfo, MembershipCollection, TaskCollection, TaskModel, UserCollection } from '@okr/shared-models';
import { addDuration, convertDateFormatToString, DateFormat, getTodayStr } from '@okr/shared-util-core';
import { getTaskIndex } from '@okr/project-task-util';
import { tenantIdOfUserData } from '@okr/shared-util-functions';
import {
  computeExitSettlement, EXIT_SETTLEMENT_TAG, ExitSettlement, exitSettlementTaskName, exitSettlementTaskNotes, noExitSettlement,
} from '@okr/relationship-membership-util';

import { SYSTEM_AUTHOR } from '../workflow/activity';
import { withoutUndefined } from '../invoice/invoice.logic';
import {
  CLOSE_NOTE, ExitContext, isAutoClosed, isExitContext, isServerTask, loadExitContext, settlementTaskId, treasurerAssignee,
} from './exit-settlement.context';
import { rebuildFeeRow, settlementAfterRebuild } from './exit-settlement.fee-row';
import { claimedInvoiceKey } from './settle-membership-exit.logic';

const REGION = 'europe-west6';
const CF_NAME = 'onMembershipExitWritten';
const DUE_IN_DAYS = 14;

export type UpsertDecision = 'create' | 'update' | 'close' | 'reopen' | 'replace' | 'noop';
export type TaskState = 'missing' | 'open' | 'claimed' | 'done' | 'auto-closed' | 'squatted' | 'squatted-locked';

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
 * How to treat the writer of the event — fail closed. Admin SDK (service account) and system writes
 * and writes without an authId have no writer tenant, so the trigger does nothing ('skip'): the
 * callable's «extend» already set its task done, the backfill runs with its own tenant. Every other
 * value ('unknown', 'api_key', 'app_user', 'unauthenticated', anything new) needs a user doc with a
 * settlement role; the docs do not say which authType a signed-in client write carries.
 */
export function writerCheck(authType: string, authId: string | undefined): 'skip' | 'check-user' {
  if (authType === 'service_account' || authType === 'system' || !authId) return 'skip';
  return 'check-user';
}

/** The writer's tenant: `users/{authId}.tenants[0]`, the value `getCallerTenantId` uses; '' when none. */
export function writerTenant(user: DocumentData | undefined): string {
  return tenantIdOfUserData(user);
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
 * The settlement task as `upsertDecision` sees it. A doc that is not a server task (`isServerTask`)
 * is 'squatted' when open and unclaimed, else 'squatted-locked'; an archived task is never touched; a done task the
 * trigger closed itself is 'auto-closed', every other done task is the treasurer's decision.
 */
export function taskStateOf(task: DocumentData | undefined, tenantId: string, membershipKey: string): TaskState {
  if (!task) return 'missing';
  if (!isServerTask(task, tenantId, membershipKey)) {
    // never set over a done or claimed doc: it may hold a decision or a storno in progress
    const locked = task['state'] === 'done' || (typeof task['completionDate'] === 'string' && task['completionDate'] !== '') ||
      claimedInvoiceKey(task) !== '';
    return locked ? 'squatted-locked' : 'squatted';
  }
  if (task['isArchived'] === true) return 'done';
  const done = task['state'] === 'done' || (typeof task['completionDate'] === 'string' && task['completionDate'] !== '');
  if (done) return isAutoClosed(task) ? 'auto-closed' : 'done';
  return claimedInvoiceKey(task) !== '' ? 'claimed' : 'open';
}

/**
 * What to do with the settlement task (§4.5). A done task is a decision already taken: never
 * reopened, never duplicated. A claimed task (an invoice adjustment in progress, the storno possibly
 * written) is left alone too: closing or rewriting it would strand a cancelled invoice. A task the
 * trigger closed itself is reopened in place when something is due again. An open, unclaimed
 * squatted doc at the task id is overwritten with a fresh server task once something is due (the id
 * is ours by convention); while nothing is due no task is needed. A done or claimed squat is never
 * overwritten.
 */
export function upsertDecision(s: ExitSettlement, task: TaskState): UpsertDecision {
  if (task === 'squatted-locked') return 'noop';
  if (task === 'squatted') return s.case === 'none' ? 'noop' : 'replace';
  if (task === 'done' || task === 'claimed') return 'noop';
  if (s.case === 'none') return task === 'open' ? 'close' : 'noop';
  if (task === 'auto-closed') return 'reopen';
  return task === 'open' ? 'update' : 'create';
}

/** The one decision function of the trigger, the backfill and its dry run. */
export function settlementTaskDecision(s: ExitSettlement, task: DocumentData | undefined, tenantId: string, membershipKey: string): UpsertDecision {
  return upsertDecision(s, taskStateOf(task, tenantId, membershipKey));
}

/** The notes of a reopened task: fresh figures, the treasurer text kept, the close note turned into history. */
export function reopenedTaskNotes(existing: string | undefined, generated: string): string {
  return mergeTaskNotes((existing ?? '').split(CLOSE_NOTE).join(REOPEN_NOTE), generated);
}

/**
 * Create, update, close or reopen the membership's settlement task (`exit-<tenantId>-<membershipKey>`) in ONE
 * transaction, so two trigger events racing on the same membership (a category change writes the old
 * and the new membership) end in one task. Reused by the backfill.
 */
export async function openOrUpdateSettlementTask(db: Firestore, ctx: ExitContext, settlement: ExitSettlement): Promise<UpsertDecision> {
  const today = getTodayStr(DateFormat.StoreDate);
  const ref = db.collection(TaskCollection).doc(settlementTaskId(ctx.tenantId, ctx.membershipKey));
  const exitViewDate = convertDateFormatToString(ctx.membership.dateOfExit, DateFormat.StoreDate, DateFormat.ViewDate, false);
  const name = exitSettlementTaskName(ctx.memberLabel, settlement);
  const generated = exitSettlementTaskNotes(settlement, exitViewDate);
  const dueDate = addDuration(today, { days: DUE_IN_DAYS });

  return db.runTransaction(async (tx) => {
    const found = (await tx.get(ref)).data();
    const state = taskStateOf(found, ctx.tenantId, ctx.membershipKey);
    const decision = upsertDecision(settlement, state);
    if (state === 'claimed') logger.info(`${CF_NAME}: task of membership ${ctx.membershipKey} is claimed by an invoice adjustment, left alone`);
    if (state === 'squatted-locked') logger.warn(`${CF_NAME}: doc ${ref.id} is not a settlement task but is done or claimed, left alone`);
    if (state === 'squatted') {
      logger.warn(`${CF_NAME}: doc ${ref.id} is not a settlement task of tenant ${ctx.tenantId} / membership ${ctx.membershipKey}` +
        (decision === 'replace' ? ', overwritten with a fresh task' : ', nothing due, left alone'));
    }

    switch (decision) {
      case 'noop':
        break;
      case 'close': {
        const notes = notesOf(found);
        tx.update(ref, { state: 'done', completionDate: today, notes: notes ? `${notes}\n${CLOSE_NOTE}` : CLOSE_NOTE });
        break;
      }
      case 'update': {
        // a task reopened by hand still carries the close note: turn it into history here too
        const notes = reopenedTaskNotes(notesOf(found), generated);
        tx.update(ref, { name, notes, index: getTaskIndex({ ...(found as TaskModel), name, notes }) });
        break;
      }
      case 'reopen': {
        const assignee = await treasurerAssignee(db, ctx.tenantId, today);
        const open = new TaskModel(ctx.tenantId).state;
        const patch: Partial<TaskModel> = {
          state: open, completionDate: '', name, notes: reopenedTaskNotes(notesOf(found), generated), dueDate,
          linkKey: '', linkModelType: '',
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
      case 'replace': {
        const assignee = await treasurerAssignee(db, ctx.tenantId, today);
        // a fresh server task; the text typed below the marker survives, the generated block is ours
        tx.set(ref, withoutUndefined(newSettlementTask(ctx, name, generated, dueDate, assignee, notesOf(found))));
        break;
      }
    }
    return decision;
  });
}

function newSettlementTask(
  ctx: ExitContext, name: string, generated: string, dueDate: string, assignee: AvatarInfo | undefined, existingNotes?: string,
): Omit<TaskModel, 'okey'> {
  const task = new TaskModel(ctx.tenantId);
  task.name = name;
  task.notes = mergeTaskNotes(existingNotes, generated);
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

/** Settle one membership in the writer's tenant, rebuilding its open fee row first (§4.6). */
async function settleMembership(db: Firestore, membershipKey: string, tenantId: string, today: string): Promise<void> {
  // an archived membership is loaded too, so its open task closes
  const ctx = await loadExitContext(db, membershipKey, tenantId, today, { includeArchived: true });
  if (!isExitContext(ctx)) {
    logger.info(`${CF_NAME}: membership ${membershipKey} not settled in tenant ${tenantId}: ${ctx}`);
    return;
  }
  const settlement = exitSettlementFor(ctx.membership, () => computeExitSettlement(ctx.input));
  let rebuilt = false;
  try {
    rebuilt = await rebuildFeeRow(db, ctx, today);
    if (rebuilt) logger.info(`${CF_NAME}: rebuilt the open fee row of membership ${membershipKey}`);
  } catch (err) {
    logger.error(`${CF_NAME}: fee row rebuild failed for membership ${membershipKey}`, err);
  }
  const forTask = settlementAfterRebuild(settlement, rebuilt);
  const decision = await openOrUpdateSettlementTask(db, ctx, forTask);
  logger.info(`${CF_NAME}: membership ${membershipKey} case ${settlement.case}${settlement.manualReason ? ` (${settlement.manualReason})` : ''}` +
    `${forTask !== settlement ? ' (row rebuilt, no task needed)' : ''} -> ${decision}`);
}

/** The writer's tenant when the writer may settle there; undefined (with a log line) otherwise. */
async function settlementTenantOf(db: Firestore, membershipKey: string, writer: { authType: string; authId?: string }): Promise<string | undefined> {
  if (writerCheck(writer.authType, writer.authId) === 'skip') {
    logger.info(`${CF_NAME}: membership ${membershipKey} written by ${writer.authType}/${writer.authId ?? '-'}, no writer tenant, skipped`);
    return undefined;
  }
  const user = writer.authId ? (await db.collection(UserCollection).doc(writer.authId).get()).data() : undefined;
  const tenantId = writerTenant(user);
  if (!tenantId || !isSettlementWriter(user, tenantId)) {
    logger.warn(`${CF_NAME}: writer ${writer.authType}/${writer.authId ?? '-'} may not settle membership ${membershipKey} in tenant ${tenantId || '-'}, skipped`);
    return undefined;
  }
  return tenantId;
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
    // the writer (users read) is resolved only when there is something to settle
    if (keys.length === 0) return;
    let tenantId: string | undefined;
    try {
      tenantId = await settlementTenantOf(db, membershipKey, writer);
    } catch (err) {
      logger.error(`${CF_NAME}: writer check failed for membership ${membershipKey}`, err);
    }
    if (!tenantId) return;

    for (const key of keys) {
      try {
        // the live document, not the event's snapshot: out-of-order delivery must not resurrect an old exit
        await settleMembership(db, key, tenantId, today);
      } catch (err) {
        logger.error(`${CF_NAME}: settlement task failed for membership ${key}`, err);
      }
    }
  },
);
