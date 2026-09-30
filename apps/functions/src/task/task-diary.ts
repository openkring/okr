// apps/functions/src/task/task-diary.ts
//
// Writes a completed task's name as one line into the assignee's diary of the day it was
// completed — and removes it again on reopen (spec 1.72 §9). Runs from `onTaskWritten`, gated
// on `app-config.diaryTenantId` (shared with the Jasstafel, spec 1.67 §7): '' means the tenant
// has no diary tenant and this module is never reached.

import type { Firestore } from 'firebase-admin/firestore';

import { appendToDiary, type DiaryLineResult } from '../diary/append-to-diary';

const USERS_COLLECTION = 'users';

/**
 * Completes or reopens the assignee's diary line for `date` in `diaryTenantId`.
 *
 * Resolves `assigneeKey` (a `PersonModel.okey`) to a Firebase uid via `users.personKey`,
 * requiring the user doc whose `tenants` already includes the diary tenant (spec 1.72 §9.1),
 * since a person can hold one `users/{uid}` doc per tenant. No matching user →
 * `'skipped-no-user'`: never falling back to an unrelated user doc of the same person in a
 * foreign tenant. The write itself is `appendToDiary` (the `done` list of the one deterministic
 * day entry; a `final` entry is never touched; a reopen on a missing entry is a no-op).
 *
 * A task renamed while completed leaves its old name as the diary line — the caller removes
 * `before.name` on reopen, the line that was actually written (accepted limit, spec §9 does not
 * ask for line rewrites).
 */
export async function applyTaskToDiary(
  db: Firestore,
  diaryTenantId: string,
  assigneeKey: string,
  date: string,
  line: string,
  mode: 'complete' | 'reopen',
): Promise<DiaryLineResult | 'skipped-no-user'> {
  const usersSnap = await db.collection(USERS_COLLECTION).where('personKey', '==', assigneeKey).get();
  const userDoc = usersSnap.docs.find((doc) => ((doc.get('tenants') as string[] | undefined) ?? []).includes(diaryTenantId));
  if (!userDoc) return 'skipped-no-user';
  return appendToDiary(db, diaryTenantId, userDoc.id, date, 'done', line, mode === 'complete' ? 'add' : 'remove');
}
