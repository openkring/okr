/**
 * Exit fee settlement, detection side (spec 1.105 §4): when a membership's exit date changes,
 * open, update or close the treasurer's settlement task, and refresh a not-yet-invoiced fee row.
 * Nothing is paid or sent here; a failure only means the treasurer settles by hand.
 */
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { DocumentData, Firestore, getFirestore } from 'firebase-admin/firestore';
import { AccountingConfigCollection, FeeScheduleEntry, MemberFeeCollection, OwnershipCollection, TaskCollection, TaskModel } from '@okr/shared-models';
import { addDuration, convertDateFormatToString, DateFormat, getTodayStr, isAfterDate } from '@okr/shared-util-core';
import { getTaskIndex } from '@okr/project-task-util';
import {
  buildPositions, computeExitSettlement, EXIT_SETTLEMENT_TAG, ExitSettlement, exitSettlementTaskName,
  exitSettlementTaskNotes, rebatePosition,
} from '@okr/relationship-membership-util';

import { SYSTEM_AUTHOR } from '../workflow/activity';
import { withoutUndefined } from '../invoice/invoice.logic';
import { CLOSE_NOTE, ExitContext, findSettlementTask, loadExitContext, treasurerAssignee } from './exit-settlement.context';

const REGION = 'europe-west6';
const CF_NAME = 'onMembershipExitWritten';
const DUE_IN_DAYS = 14;

export type UpsertDecision = 'create' | 'update' | 'close' | 'noop';

/** '' and 99991231 both mean «no exit». */
const exitOf = (d: DocumentData | undefined): string => {
  const exit = typeof d?.['dateOfExit'] === 'string' ? (d['dateOfExit'] as string) : '';
  return exit.startsWith('9999') ? '' : exit;
};

/** Whether the exit date moved; a deleted membership never counts. */
export function exitChanged(before: DocumentData | undefined, after: DocumentData | undefined): boolean {
  if (!after) return false;
  return exitOf(before) !== exitOf(after);
}

/**
 * What to do with the settlement task (§4.5). A done task is a decision already taken: never
 * reopened, never duplicated.
 */
export function upsertDecision(s: ExitSettlement, task: 'missing' | 'open' | 'done'): UpsertDecision {
  if (task === 'done') return 'noop';
  if (s.case === 'none') return task === 'open' ? 'close' : 'noop';
  return task === 'open' ? 'update' : 'create';
}

/** Find the membership's settlement task and create, update or close it. Reused by the backfill. */
export async function openOrUpdateSettlementTask(db: Firestore, ctx: ExitContext, settlement: ExitSettlement): Promise<UpsertDecision> {
  const today = getTodayStr(DateFormat.StoreDate);
  const found = await findSettlementTask(db, ctx.tenantId, ctx.membershipKey, settlement.exitYear);
  const decision = upsertDecision(settlement, found ? (found.done ? 'done' : 'open') : 'missing');
  if (decision === 'noop') return decision;

  if (decision === 'close' && found) {
    const notes = typeof found.data['notes'] === 'string' ? (found.data['notes'] as string) : '';
    await found.ref.update({ state: 'done', completionDate: today, notes: notes ? `${notes}\n${CLOSE_NOTE}` : CLOSE_NOTE });
    return decision;
  }

  const exitViewDate = convertDateFormatToString(ctx.membership.dateOfExit, DateFormat.StoreDate, DateFormat.ViewDate, false);
  const name = exitSettlementTaskName(ctx.memberLabel, settlement);
  const notes = exitSettlementTaskNotes(settlement, exitViewDate);

  if (decision === 'update' && found) {
    const task = { ...(found.data as TaskModel), name, notes };
    await found.ref.update({ name, notes, index: getTaskIndex(task) });
    return decision;
  }

  const task = new TaskModel(ctx.tenantId);
  task.name = name;
  task.notes = notes;
  task.tags = EXIT_SETTLEMENT_TAG;
  task.relatedKey = `membership.${ctx.membershipKey}`;
  task.relatedModelType = 'membership';
  task.author = SYSTEM_AUTHOR;
  task.assignee = await treasurerAssignee(db, ctx.tenantId, today);
  task.dueDate = addDuration(today, { days: DUE_IN_DAYS });
  task.index = getTaskIndex(task);
  const { okey, ...doc } = task;   // okey is the document id, never a field
  void okey;
  await db.collection(TaskCollection).add(withoutUndefined(doc));
  return decision;
}

/** Whether the member holds a locker today, derived like the member-fee store (`lockerOwnerKeys`). */
async function hasLockerToday(db: Firestore, tenantId: string, memberKey: string, today: string): Promise<boolean> {
  const snap = await db.collection(OwnershipCollection).where('ownerKey', '==', memberKey).get();
  return snap.docs.some(d => {
    const o = d.data();
    return o['resourceType'] === 'locker' && o['isArchived'] !== true &&
      ((o['tenants'] as string[] | undefined) ?? []).includes(tenantId) && isAfterDate(String(o['validTo'] ?? ''), today);
  });
}

/**
 * §4.6: a fee row of the running year that is not yet on its way to an invoice (`initial`/`review`)
 * gets its positions rebuilt from the year's price list, so the pro rata follows the new exit.
 * The row is matched to the membership by member, entry date and category (the row has no
 * membership key). Returns the number of rows rewritten.
 */
export async function rebuildFeeRow(db: Firestore, ctx: ExitContext, today: string): Promise<number> {
  const { membership: m, tenantId } = ctx;
  const year = Number(today.substring(0, 4));
  const exit = m.dateOfExit ?? '';
  const hasExit = /^\d{8}$/.test(exit) && !exit.startsWith('9999');
  // an exit in another year leaves this year's row alone; a cleared exit restores the full year
  if (hasExit && Number(exit.substring(0, 4)) !== year) return 0;

  const rows = (await db.collection(MemberFeeCollection).where('member.key', '==', m.memberKey).get()).docs.filter(d => {
    const f = d.data();
    return f['isArchived'] !== true && ((f['tenants'] as string[] | undefined) ?? []).includes(tenantId) &&
      (f['state'] === 'initial' || f['state'] === 'review') && f['dateOfEntry'] === m.dateOfEntry && f['category'] === m.category;
  });
  if (rows.length === 0) return 0;

  const configSnap = await db.collection(AccountingConfigCollection).doc(m.orgKey).get();
  const schedule = ((configSnap.data()?.['feeSchedule'] ?? []) as FeeScheduleEntry[]).find(e => e.year === year);
  if (!schedule) return 0;

  const positions = buildPositions(m, schedule, {
    hasLocker: await hasLockerToday(db, tenantId, m.memberKey, today),
    currentYear: year,
    categoryLists: ctx.input.categoryLists,
    defaultCategoryList: ctx.input.defaultCategoryList,
  });
  const rebate = rebatePosition(m.rebate, m.rebateReason, positions);
  if (rebate) positions.push(rebate);
  await Promise.all(rows.map(r => r.ref.update({ positions })));
  return rows.length;
}

export const onMembershipExitWritten = onDocumentWritten(
  { document: 'memberships/{key}', region: REGION },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!exitChanged(before, after)) return;
    const membershipKey = event.params['key'] as string;
    const db = getFirestore();
    const today = getTodayStr(DateFormat.StoreDate);
    let ctx: ExitContext | undefined;
    try {
      // the live document, not the event's snapshot: out-of-order delivery must not resurrect an old exit
      ctx = await loadExitContext(db, membershipKey, today);
      if (!ctx) return;
      const settlement = computeExitSettlement(ctx.input);
      const decision = await openOrUpdateSettlementTask(db, ctx, settlement);
      logger.info(`${CF_NAME}: membership ${membershipKey} case ${settlement.case}${settlement.manualReason ? ` (${settlement.manualReason})` : ''} -> ${decision}`);
    } catch (err) {
      logger.error(`${CF_NAME}: settlement task failed for membership ${membershipKey}`, err);
    }
    if (!ctx) return;
    try {
      const rebuilt = await rebuildFeeRow(db, ctx, today);
      if (rebuilt) logger.info(`${CF_NAME}: rebuilt ${rebuilt} fee row(s) for membership ${membershipKey}`);
    } catch (err) {
      logger.error(`${CF_NAME}: fee row rebuild failed for membership ${membershipKey}`, err);
    }
  },
);
