// apps/functions/src/task/task-diary.ts
//
// Writes a completed task's name as one line into the assignee's diary of the day it was
// completed — and removes it again on reopen (spec 1.72 §9). Runs from `onTaskWritten`, gated
// on `app-config.taskDiaryTenantId` (Task 5): '' means the fleet has no diary tenant and this
// module is never reached.

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { diaryKey } from '@okr/content-diary-util';

const USERS_COLLECTION = 'users';
const DIARY_COLLECTION = 'diaries';

/** The weather defaults a freshly created diary entry starts with (DiaryModel.DEFAULT_DIARY_WEATHER). */
const DEFAULT_DIARY_WEATHER = { code: -1, min: 0, max: 0, precip: 0, sunrise: '', sunset: '' };

/** gRPC ALREADY_EXISTS — the `.create()` race signal, same constant as `alias/mint-alias.ts`. */
const ALREADY_EXISTS = 6;

const isAlreadyExists = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === ALREADY_EXISTS;

/**
 * Completes or reopens the assignee's diary line for `date` in `diaryTenantId`.
 *
 * 1. Resolves `assigneeKey` (a `PersonModel.okey`) to a Firebase uid via `users.personKey`,
 *    requiring the user doc whose `tenants` already includes the diary tenant (spec 1.72 §9.1),
 *    since a person can hold one `users/{uid}` doc per tenant. No matching user → `'skipped-no-user'`,
 *    the diary of someone who has no account in the diary tenant — never falling back to an
 *    unrelated user doc for the same person in a foreign tenant.
 * 2. Addresses the day entry directly by its deterministic id, `diaryKey(diaryTenantId, uid,
 *    date)` (`@okr/content-diary-util`, the same id `newDiary`/`DiaryStore.add` and the diary
 *    import function use — spec §9.1 "one entry per author, tenant and day"). A query-then-write
 *    here would risk creating a second, randomly-keyed entry for the same day (a race between two
 *    completions, or the app already holding a live entry the query missed); addressing the id
 *    directly makes every write an upsert onto the ONE entry for that day, never a duplicate.
 * 3. A `final` entry is a closed day — never mutated by this sync; `'skipped-final'`.
 * 4. `complete`: `create()`s a fresh draft entry at that id (every `DiaryModel` field inlined —
 *    functions never `new` a `shared-models` class, see `TaskDocLike`), and on `ALREADY_EXISTS`
 *    (the entry already existed, e.g. authored in the app) re-reads it and, unless `final`,
 *    `arrayUnion`s the line — never re-creating and never losing the concurrent write.
 * 5. `reopen`: reads the entry by id; missing → `'skipped-missing'`, `final` → `'skipped-final'`,
 *    else `arrayRemove`s the line and returns `'written'`.
 *
 * A task renamed while completed leaves its old name as the diary line — this sync only ever
 * arrayUnion/arrayRemove's the CURRENT name, so a rename after completion is not retro-applied
 * to an already-written line (accepted limit, spec §9 does not ask for line rewrites).
 */
export async function applyTaskToDiary(
  db: Firestore,
  diaryTenantId: string,
  assigneeKey: string,
  date: string,
  line: string,
  mode: 'complete' | 'reopen',
): Promise<'written' | 'skipped-final' | 'skipped-no-user' | 'skipped-missing'> {
  const usersSnap = await db.collection(USERS_COLLECTION).where('personKey', '==', assigneeKey).get();
  const userDoc = usersSnap.docs.find((doc) => ((doc.get('tenants') as string[] | undefined) ?? []).includes(diaryTenantId));
  if (!userDoc) return 'skipped-no-user';
  const uid = userDoc.id;

  const ref = db.collection(DIARY_COLLECTION).doc(diaryKey(diaryTenantId, uid, date));

  if (mode === 'reopen') {
    const snap = await ref.get();
    if (!snap.exists) return 'skipped-missing';
    if ((snap.get('status') as string | undefined) === 'final') return 'skipped-final';
    await ref.update({ done: FieldValue.arrayRemove(line) });
    return 'written';
  }

  try {
    await ref.create({
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
      tags: 'diary',
      tenants: [diaryTenantId],
    });
    return 'written';
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }

  const snap = await ref.get();
  if ((snap.get('status') as string | undefined) === 'final') return 'skipped-final';
  await ref.update({ done: FieldValue.arrayUnion(line) });
  return 'written';
}
