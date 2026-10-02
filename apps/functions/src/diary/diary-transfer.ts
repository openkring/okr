//
// Spec 1.77 — the server half of the diary transfer: which diaries receive an item (the shared
// `resolveDiaryTargets` rule), who the author is in each (personKey → the user IN that tenant,
// D6), and the writes themselves (`appendToDiary`, unchanged).

import type { Firestore } from 'firebase-admin/firestore';

import { resolveDiaryTargets } from '@okr/content-diary-util';
import { AppConfigCollection, DiaryPeriod, DiarySource, DiaryTarget, UserCollection } from '@okr/shared-models';

import { appendToDiary, type DiaryLineField, type DiaryLineMode, type DiaryLineResult } from './append-to-diary';

export type DiaryTargetResult = DiaryLineResult | 'skipped-no-user';
export type DiarySummary = 'written' | 'skipped-final' | 'skipped-missing' | 'skipped-no-target';

/** The person's active user doc in `diaryTenantId` — its id is the diary's `authorKey`. Pure. */
export function pickDiaryAuthor(
  users: { id: string; tenants?: string[]; isArchived?: boolean }[],
  diaryTenantId: string,
): string | undefined {
  return users.find(u => u.isArchived !== true && (u.tenants ?? []).includes(diaryTenantId))?.id;
}

/** One status for a caller that wants a single answer (the Jasstafel toast). Pure. */
export function summariseDiaryResults(results: Record<string, DiaryTargetResult>): DiarySummary {
  const values = Object.values(results).filter(v => v !== 'skipped-no-user');
  if (values.length === 0) return 'skipped-no-target';
  if (values.includes('written')) return 'written';
  if (values.includes('skipped-final')) return 'skipped-final';
  return 'skipped-missing';
}

/** Published travel periods of the given diary tenants (missing doc/field → ''). */
export async function readDiaryPeriods(db: Firestore, tenantIds: string[]): Promise<Record<string, DiaryPeriod>> {
  const unique = [...new Set(tenantIds.filter(Boolean))];
  const snaps = await Promise.all(unique.map(id => db.collection(AppConfigCollection).doc(id).get()));
  const out: Record<string, DiaryPeriod> = {};
  snaps.forEach((snap, i) => {
    const data = snap.data() ?? {};
    out[unique[i]] = {
      travelFrom: typeof data['travelFrom'] === 'string' ? data['travelFrom'] : '',
      travelTo: typeof data['travelTo'] === 'string' ? data['travelTo'] : '',
    };
  });
  return out;
}

/**
 * Resolves the targets for one item and writes (or removes) its line in each matching diary.
 * Returns one status per diary tenant that matched; {} = nothing matched.
 */
export async function sendToDiaries(db: Firestore, args: {
  personKey: string; targets: DiaryTarget[] | undefined; source: DiarySource; date: string;
  field: DiaryLineField; line: string; mode: DiaryLineMode;
}): Promise<Record<string, DiaryTargetResult>> {
  const ticked = (args.targets ?? []).filter(t => (t.sources ?? []).includes(args.source)).map(t => t.tenantId);
  if (ticked.length === 0 || !args.personKey) return {};
  const periods = await readDiaryPeriods(db, ticked);
  const diaryTenants = resolveDiaryTargets(args.targets, args.source, args.date, periods);
  if (diaryTenants.length === 0) return {};

  const usersSnap = await db.collection(UserCollection).where('personKey', '==', args.personKey).get();
  const users = usersSnap.docs.map(d => ({
    id: d.id, tenants: d.get('tenants') as string[] | undefined, isArchived: d.get('isArchived') as boolean | undefined,
  }));

  const results: Record<string, DiaryTargetResult> = {};
  for (const diaryTenantId of diaryTenants) {
    const authorKey = pickDiaryAuthor(users, diaryTenantId);
    results[diaryTenantId] = authorKey
      ? await appendToDiary(db, diaryTenantId, authorKey, args.date, args.field, args.line, args.mode)
      : 'skipped-no-user';
  }
  return results;
}
