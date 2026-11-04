//
// Spec 1.77 — the server half of the line transfers: the diaries come from `resolveDiaryPulls`, the
// author in each is the person's user IN that tenant (D6), the writes are `appendToDiary`, unchanged.

import type { Firestore } from 'firebase-admin/firestore';

import { DiarySource } from '@okr/shared-models';

import { appendToDiary, type DiaryLineField, type DiaryLineMode, type DiaryLineResult } from './append-to-diary';
import { resolveDiaryPulls } from './diary-pull';

export type DiaryTargetResult = DiaryLineResult | 'skipped-no-consent';
export type DiarySummary = 'written' | 'skipped-final' | 'skipped-missing' | 'skipped-no-target';

/** One status for a caller that wants a single answer (the Jasstafel toast). Pure. */
export function summariseDiaryResults(results: Record<string, DiaryTargetResult>): DiarySummary {
  const values = Object.values(results).filter(v => v !== 'skipped-no-consent');
  if (values.length === 0) return 'skipped-no-target';
  if (values.includes('written')) return 'written';
  if (values.includes('skipped-final')) return 'skipped-final';
  return 'skipped-missing';
}

/**
 * Resolves the diaries for one item (`resolveDiaryPulls`) and writes (or removes) its line in each.
 * Returns one status per diary tenant that asked for it; {} = none did.
 */
export async function sendToDiaries(db: Firestore, args: {
  personKey: string; sourceTenant: string; source: DiarySource; date: string;
  field: DiaryLineField; line: string; mode: DiaryLineMode;
}): Promise<Record<string, DiaryTargetResult>> {
  if (!args.personKey) return {};
  const { personKey, sourceTenant, source, date } = args;
  const results: Record<string, DiaryTargetResult> = {};
  for (const pull of await resolveDiaryPulls(db, { personKey, sourceTenant, source, date })) {
    results[pull.tenantId] = pull.status === 'ok'
      ? await appendToDiary(db, pull.tenantId, pull.uid, date, args.field, args.line, args.mode)
      : pull.status;
  }
  return results;
}
