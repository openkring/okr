/**
 * Spec 1.164 §6.4: who is told about a move. memberAdmins get a task (it stays until handled), the
 * person gets a push. The push text carries no address: it shows on lock screens.
 */
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
  oldText: string;
  newText: string;
  /** StoreDate; '' = unknown */
  validFrom: string;
  recorder: { personKey: string; isOwner: boolean; tenantId: string };
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

const TASK_NAME_PREFIX: Record<MoveNoticeKind, string> = { move: 'Umzug', correction: 'Adresse korrigiert', cancel: 'Umzug abgesagt' };

export function moveTaskName(n: Pick<MoveNotice, 'kind' | 'parentName'>): string {
  return `${TASK_NAME_PREFIX[n.kind]}: ${n.parentName}`;
}

const viewDate = (d: string): string => (/^\d{8}$/.test(d) ? convertDateFormatToString(d, DateFormat.StoreDate, DateFormat.ViewDate, false) : '');

export function moveTaskNotes(n: MoveNotice, recorderName: string): string {
  const from = viewDate(n.validFrom);
  return [
    `${n.oldText || '–'} → ${n.newText || '–'}`,
    from ? `ab ${from}` : '',
    `erfasst von ${recorderName}`,
  ].filter(Boolean).join('\n');
}

/** Push text without the address (lock screens). */
export function movePushText(n: Pick<MoveNotice, 'kind' | 'validFrom'>, recorderName: string): { title: string; body: string } {
  const from = viewDate(n.validFrom);
  const ab = from ? `, gültig ab ${from}` : '';
  switch (n.kind) {
    case 'correction':
      return { title: 'Adresse korrigiert', body: `${recorderName} hat deine Adresse korrigiert.` };
    case 'cancel':
      return { title: 'Umzug abgesagt', body: `${recorderName} hat deinen erfassten Umzug abgesagt.` };
    default:
      return { title: 'Adresse geändert', body: `${recorderName} hat deinen Umzug erfasst${ab}.` };
  }
}

async function newTask(n: MoveNotice, tenantId: string, assignee: AvatarInfo, recorder: AvatarInfo | undefined, recorderName: string): Promise<Omit<TaskModel, 'okey'>> {
  const task = new TaskModel(tenantId);
  task.name = moveTaskName(n);
  task.notes = moveTaskNotes(n, recorderName);
  task.tags = MOVE_NOTICE_TAG;
  task.author = recorder ?? SYSTEM_AUTHOR;
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
          const doc = await newTask(n, tenantId, admin, recorder, recorderName);
          await db.collection(TaskCollection).add(Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined)));
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
