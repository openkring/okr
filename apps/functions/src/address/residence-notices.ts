/**
 * Spec 1.164 §6.4: who is told about a move. memberAdmins get a task (it stays until handled), the
 * person gets a push. Neither carries an address: the push shows on lock screens, and the task reaches
 * every memberAdmin of the club (also eventAdmins through taskStaff) and stays after the person left
 * the club. The admin opens the person (the task's relatedKey) to see the address.
 */
import { createHash } from 'node:crypto';
import { logger } from 'firebase-functions/v2';
import type { Firestore } from 'firebase-admin/firestore';
import { AvatarInfo, PersonCollection, TaskCollection, TaskModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { getTaskIndex } from '@okr/project-task-util';
import { getMemberAdminPersons, personAvatarInfo } from '@okr/shared-util-functions';

import { SYSTEM_AUTHOR } from '../workflow/activity';
import { pushToPersons } from '../srv/push';

export type MoveNoticeKind = 'move' | 'correction' | 'cancel';

export interface MoveNotice {
  kind: MoveNoticeKind;
  /** `person.<okey>` or `org.<okey>` */
  parentKey: string;
  parentName: string;
  parentTenants: string[];
  /** StoreDate; '' = unknown */
  validFrom: string;
  recorder: { personKey: string; isOwner: boolean; tenantId: string };
  /**
   * Tells two notices of the same parent, kind and date apart (two corrections of one row): the new
   * locationKey for a move, `<residenceKey>|<locationKey>` for a correction, the residence key for a
   * cancel. Part of the task id; absent = the id of the earlier version.
   */
  noticeKey?: string;
}

export const MOVE_NOTICE_TAG = 'umzug';

/** Who is told, per spec §6.4. Pure. */
export function noticeRecipients(n: MoveNotice): { taskTenants: string[]; pushPerson: string | undefined } {
  const all = [...new Set(n.parentTenants)];
  if (n.recorder.isOwner) return { taskTenants: all, pushPerson: undefined };
  const taskTenants = all.filter((t) => t !== n.recorder.tenantId);
  const isPerson = n.parentKey.startsWith('person.');
  return { taskTenants, pushPerson: isPerson ? n.parentKey.substring('person.'.length) : undefined };
}

/** Deterministic task id: a retried callable writes the same ids, so `create()` cannot duplicate. */
export function moveTaskId(n: Pick<MoveNotice, 'kind' | 'parentKey' | 'validFrom' | 'noticeKey'>, tenantId: string, adminKey: string): string {
  const parts = [n.parentKey, n.kind, n.validFrom, tenantId, adminKey];
  if (n.noticeKey) parts.push(n.noticeKey);
  return 'umzug-' + createHash('sha256').update(parts.join('|')).digest('hex').substring(0, 32);
}

const TASK_NAME_PREFIX: Record<MoveNoticeKind, string> = { move: 'Umzug', correction: 'Adresse korrigiert', cancel: 'Umzug abgesagt' };

export function moveTaskName(n: Pick<MoveNotice, 'kind' | 'parentName'>): string {
  return `${TASK_NAME_PREFIX[n.kind]}: ${n.parentName}`;
}

const viewDate = (d: string): string => (/^\d{8}$/.test(d) ? convertDateFormatToString(d, DateFormat.StoreDate, DateFormat.ViewDate, false) : '');

/** Name, kind, «ab <date>» for a move, the recorder — never an address. */
export function moveTaskNotes(n: Pick<MoveNotice, 'kind' | 'parentName' | 'validFrom'>, recorderName: string): string {
  const from = n.kind === 'move' ? viewDate(n.validFrom) : '';
  return [
    moveTaskName(n),
    from ? `ab ${from}` : '',
    `erfasst von ${recorderName}`,
  ].filter(Boolean).join('\n');
}

/** Push text without the address (lock screens). */
export function movePushText(n: Pick<MoveNotice, 'kind' | 'validFrom'>, recorderName: string): { title: string; body: string } {
  const from = viewDate(n.validFrom);
  const ab = from ? ` ab ${from}` : '';
  switch (n.kind) {
    case 'correction':
      return { title: 'Adresse korrigiert', body: `${recorderName} hat deine Adresse korrigiert.` };
    case 'cancel':
      return { title: 'Umzug abgesagt', body: `${recorderName} hat deinen erfassten Umzug abgesagt.` };
    default:
      return { title: 'Adresse geändert', body: `${recorderName} hat deinen Umzug${ab} erfasst.` };
  }
}

/**
 * The notice task for one memberAdmin. The author is the system, never the recorder: an owner who
 * recorded their own move must not be able to archive the admins' notices about it (the recorder
 * appears in the notes only).
 */
export function moveTask(n: MoveNotice, tenantId: string, assignee: AvatarInfo, recorderName: string): Omit<TaskModel, 'okey'> {
  const task = new TaskModel(tenantId);
  task.name = moveTaskName(n);
  task.notes = moveTaskNotes(n, recorderName);
  task.tags = MOVE_NOTICE_TAG;
  task.author = SYSTEM_AUTHOR;
  task.assignee = assignee;
  task.relatedKey = n.parentKey;
  task.relatedModelType = n.parentKey.startsWith('org.') ? 'org' : 'person';
  task.index = getTaskIndex(task);
  const { okey, ...doc } = task;   // okey is the document id, never a field
  void okey;
  return doc;
}

/** Never throws: a notice is an extra, the move itself is already saved. */
export async function sendMoveNotices(db: Firestore, n: MoveNotice): Promise<void> {
  try {
    const recorderData = n.recorder.personKey ? (await db.collection(PersonCollection).doc(n.recorder.personKey).get()).data() : undefined;
    const recorder = personAvatarInfo(n.recorder.personKey, recorderData);
    const recorderName = recorder?.label || 'Jemand';
    const { taskTenants, pushPerson } = noticeRecipients(n);

    for (const tenantId of taskTenants) {
      try {
        const admins = await getMemberAdminPersons(db, tenantId);
        if (admins.length === 0) {
          logger.info(`residence-notices: tenant ${tenantId} has no memberAdmin, no task for ${n.parentKey}`);
          continue;
        }
        for (const admin of admins) {
          const doc = moveTask(n, tenantId, admin, recorderName);
          const clean = Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined));
          try {
            await db.collection(TaskCollection).doc(moveTaskId(n, tenantId, admin.key)).create(clean);
          } catch (err) {
            if ((err as { code?: number }).code !== 6) throw err;   // 6 = ALREADY_EXISTS: a retry, already written
          }
        }
      } catch (err) {
        logger.error(`residence-notices: tasks for tenant ${tenantId} failed`, err);
      }
    }

    if (pushPerson) {
      const text = movePushText(n, recorderName);
      await pushToPersons([pushPerson], { type: 'address', tenantId: n.recorder.tenantId, ...text, url: '/' }, 'sendMoveNotices');
    }
  } catch (err) {
    logger.error(`residence-notices: notices for ${n.parentKey} failed`, err);
  }
}
