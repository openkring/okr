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
import { MembershipCollection, TaskCollection, TaskModel, UserCollection } from '@okr/shared-models';
import { addDuration, convertDateFormatToString, DateFormat, getTodayStr } from '@okr/shared-util-core';
import { getTaskIndex } from '@okr/project-task-util';
import {
  computeExitSettlement, EXIT_SETTLEMENT_TAG, ExitSettlement, exitSettlementTaskName, exitSettlementTaskNotes,
} from '@okr/relationship-membership-util';

import { SYSTEM_AUTHOR } from '../workflow/activity';
import { withoutUndefined } from '../invoice/invoice.logic';
import { CLOSE_NOTE, ExitContext, findSettlementTask, loadExitContext, treasurerAssignee } from './exit-settlement.context';

const REGION = 'europe-west6';
const CF_NAME = 'onMembershipExitWritten';
const DUE_IN_DAYS = 14;

export type UpsertDecision = 'create' | 'update' | 'close' | 'noop';

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
 * How to treat the writer of the event. The SDK's AuthType union lacks 'app_user' (a Firebase Auth
 * user), which Firestore does send; hence the plain string. Admin SDK and system writes pass.
 */
export function writerCheck(authType: string): 'allow' | 'check-user' | 'deny' {
  if (authType === 'app_user') return 'check-user';
  if (authType === 'unauthenticated') return 'deny';
  return 'allow';
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
  const found = await findSettlementTask(db, ctx.tenantId, ctx.membershipKey);
  const decision = upsertDecision(settlement, found ? (found.done ? 'done' : 'open') : 'missing');
  if (decision === 'noop') return decision;

  if (decision === 'close' && found) {
    const notes = typeof found.data['notes'] === 'string' ? (found.data['notes'] as string) : '';
    await found.ref.update({ state: 'done', completionDate: today, notes: notes ? `${notes}\n${CLOSE_NOTE}` : CLOSE_NOTE });
    return decision;
  }

  const exitViewDate = convertDateFormatToString(ctx.membership.dateOfExit, DateFormat.StoreDate, DateFormat.ViewDate, false);
  const name = exitSettlementTaskName(ctx.memberLabel, settlement);
  const generated = exitSettlementTaskNotes(settlement, exitViewDate);

  if (decision === 'update' && found) {
    const notes = mergeTaskNotes(typeof found.data['notes'] === 'string' ? (found.data['notes'] as string) : '', generated);
    const task = { ...(found.data as TaskModel), name, notes };
    await found.ref.update({ name, notes, index: getTaskIndex(task) });
    return decision;
  }

  const task = new TaskModel(ctx.tenantId);
  task.name = name;
  task.notes = mergeTaskNotes(undefined, generated);
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

/** Settle one membership, unless the writer of the event may not act in its tenant. */
async function settleMembership(db: Firestore, membershipKey: string, writer: { authType: string; authId?: string }, today: string): Promise<void> {
  const ctx = await loadExitContext(db, membershipKey, today);
  if (!ctx) return;
  const check = writerCheck(writer.authType);
  if (check === 'deny') {
    logger.warn(`${CF_NAME}: membership ${membershipKey} written ${writer.authType}, skipped`);
    return;
  }
  if (check === 'check-user') {
    const user = writer.authId ? (await db.collection(UserCollection).doc(writer.authId).get()).data() : undefined;
    if (!isSettlementWriter(user, ctx.tenantId)) {
      logger.warn(`${CF_NAME}: writer ${writer.authId ?? '?'} may not settle membership ${membershipKey} in tenant ${ctx.tenantId}, skipped`);
      return;
    }
  }
  const settlement = computeExitSettlement(ctx.input);
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
