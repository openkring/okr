import { logger } from 'firebase-functions/v2';
import type { Firestore } from 'firebase-admin/firestore';

import { FINANCE_HISTORY_COLLECTION, FinanceHistoryKind, historyEntry } from './finance-history.logic';

export * from './finance-history.logic';

/**
 * Append an event to the Verlauf of an invoice (`invoice.<okey>`) or bill (`bill.<okey>`). Best-effort: it is
 * called after the action succeeded, so a failure is logged and never undoes or fails that action. The author
 * is the calling user (users/{uid}: personKey + name); '' when unknown.
 */
export async function writeFinanceHistory(db: Firestore, input: {
  tenantId: string; uid: string | undefined; parentKey: string; kind: FinanceHistoryKind; details?: string;
}): Promise<void> {
  try {
    const user = input.uid ? (await db.collection('users').doc(input.uid).get()).data() : undefined;
    const authorName = [user?.['firstName'], user?.['lastName']].filter((s) => typeof s === 'string' && s.trim()).join(' ');
    await db.collection(FINANCE_HISTORY_COLLECTION).add(historyEntry({
      tenantId: input.tenantId, parentKey: input.parentKey, kind: input.kind, details: input.details,
      authorKey: String(user?.['personKey'] ?? ''), authorName, now: new Date(),
    }));
  } catch (e) {
    logger.error(`writeFinanceHistory: ${input.kind} for ${input.parentKey} not recorded`, { detail: String((e as Error)?.message ?? e).slice(0, 300) });
  }
}
