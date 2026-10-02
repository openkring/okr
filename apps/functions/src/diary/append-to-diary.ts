import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

import { newDiary } from '@okr/content-diary-util';
import { DiaryCollection } from '@okr/shared-models';
import { removeKeyFromOkrModel } from '@okr/shared-util-core';

/** The list fields of a diary entry that a feature may append a line to. */
export type DiaryLineField = 'done' | 'events';
export type DiaryLineMode = 'add' | 'remove';
export type DiaryLineResult = 'written' | 'skipped-final' | 'skipped-missing';

/**
 * What to do with the day entry for one line. A `final` entry is never touched; removing from an
 * entry that does not exist is a no-op; adding to a missing entry creates it as a draft.
 * Pure — shared by the Jasstafel callable (spec 1.67) and the task diary branch (spec 1.72 §9).
 */
export function decideDiaryLine(existing: { status?: string } | undefined, mode: DiaryLineMode): 'create' | 'update' | DiaryLineResult {
  if (!existing) return mode === 'add' ? 'create' : 'skipped-missing';
  if (existing.status === 'final') return 'skipped-final';
  return 'update';
}

/**
 * Adds a line to (or removes it from) a list field of the author's diary entry for one day in
 * `diaryTenantId`. The entry id is deterministic (`diaryKey`), so a transaction on that one
 * document is enough — no query. `arrayUnion` de-duplicates: the same line twice on one day stays
 * one line. Runs with the Admin SDK and therefore bypasses the author-only `diaries` rule; the
 * caller must already have checked that `authorKey` is the person the line belongs to.
 */
export async function appendToDiary(
  db: Firestore, diaryTenantId: string, authorKey: string, date: string,
  field: DiaryLineField, line: string, mode: DiaryLineMode = 'add',
): Promise<DiaryLineResult> {
  const blank = newDiary(diaryTenantId, authorKey, date);
  const ref = db.collection(DiaryCollection).doc(blank.okey);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const decision = decideDiaryLine(snap.exists ? (snap.data() as { status?: string }) : undefined, mode);
    if (decision === 'create') {
      blank[field] = [line];
      // JSON round-trip drops `undefined` fields, which the Admin SDK rejects
      tx.set(ref, JSON.parse(JSON.stringify(removeKeyFromOkrModel(blank))));
      return 'written';
    }
    if (decision === 'update') {
      tx.update(ref, { [field]: mode === 'add' ? FieldValue.arrayUnion(line) : FieldValue.arrayRemove(line) });
      return 'written';
    }
    return decision;
  });
}
