// apps/functions/src/task/task-diary.ts
//
// Writes a completed task's name as one line into the assignee's diary of the day it was
// completed — and removes it again on reopen (spec 1.73 §9). Runs from `onTaskWritten`, gated
// on `app-config.taskDiaryTenantId` (Task 5): '' means the fleet has no diary tenant and this
// module is never reached.

import { FieldValue, type Firestore } from 'firebase-admin/firestore';

const USERS_COLLECTION = 'users';
const DIARY_COLLECTION = 'diaries';

/** The weather defaults a freshly created diary entry starts with (DiaryModel.DEFAULT_DIARY_WEATHER). */
const DEFAULT_DIARY_WEATHER = { code: -1, min: 0, max: 0, precip: 0, sunrise: '', sunset: '' };

/**
 * Completes or reopens the assignee's diary line for `date` in `diaryTenantId`.
 *
 * 1. Resolves `assigneeKey` (a `PersonModel.okey`) to a Firebase uid via `users.personKey` —
 *    preferring the user doc whose `tenants` already includes the diary tenant (spec 1.73 §9.2),
 *    since a person can hold one `users/{uid}` doc per tenant. No matching user → `'skipped-no-user'`,
 *    the diary of someone who has no account in the diary tenant.
 * 2. Looks up the day entry by (authorKey, tenant, scope, date). A `final` entry is a closed
 *    day — never mutated by this sync; `'skipped-final'`.
 * 3. `complete`: `arrayUnion` onto an existing entry, or creates a fresh draft entry (every
 *    `DiaryModel` field inlined — functions never `new` a `shared-models` class, see `TaskDocLike`).
 * 4. `reopen`: `arrayRemove` on an existing, non-final entry; a missing entry is a no-op (nothing
 *    to remove — reopening a task whose completion was never diarised writes nothing).
 */
export async function applyTaskToDiary(
  db: Firestore,
  diaryTenantId: string,
  assigneeKey: string,
  date: string,
  line: string,
  mode: 'complete' | 'reopen',
): Promise<'written' | 'skipped-final' | 'skipped-no-user'> {
  const usersSnap = await db.collection(USERS_COLLECTION).where('personKey', '==', assigneeKey).get();
  if (usersSnap.empty) return 'skipped-no-user';
  const userDoc = usersSnap.docs.find((doc) => ((doc.get('tenants') as string[] | undefined) ?? []).includes(diaryTenantId))
    ?? usersSnap.docs[0];
  const uid = userDoc.id;

  const entrySnap = await db.collection(DIARY_COLLECTION)
    .where('authorKey', '==', uid)
    .where('tenants', 'array-contains', diaryTenantId)
    .where('scope', '==', 'day')
    .where('date', '==', date)
    .limit(1)
    .get();
  const entryDoc = entrySnap.docs[0];

  if (entryDoc && (entryDoc.get('status') as string | undefined) === 'final') return 'skipped-final';

  if (mode === 'reopen') {
    if (!entryDoc) return 'written';
    await entryDoc.ref.update({ done: FieldValue.arrayRemove(line) });
    return 'written';
  }

  if (entryDoc) {
    await entryDoc.ref.update({ done: FieldValue.arrayUnion(line) });
    return 'written';
  }

  await db.collection(DIARY_COLLECTION).add({
    isArchived: false,
    authorKey: uid,
    date,
    scope: 'day',
    title: '',
    text: '',
    done: [line],
    status: 'draft',
    people: [],
    customPeopleLabels: [],
    places: [],
    events: [],
    tripKey: '',
    weather: { ...DEFAULT_DIARY_WEATHER },
    driveFolderId: '',
    media: [],
    sourceDocument: '',
    customLocationLabel: '',
    index: '',
    tags: '',
    tenants: [diaryTenantId],
  });
  return 'written';
}
