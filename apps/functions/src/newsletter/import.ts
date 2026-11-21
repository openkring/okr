// apps/functions/src/newsletter/import.ts
//
// Mailchimp import (spec 1.169 §5.10): moves the current subscribers over with the consent they already
// gave — no confirmation mail, `source: 'import'`, Mailchimp's timestamps kept. The CSV is parsed in the
// browser; the rows arrive here and are re-validated. The response is five counts; an address is never
// returned or logged.

import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { UserCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { toStoreDate } from '../srv/zurich-time';
import { countResult, emptySummary, entryDate, MAX_IMPORT_ROWS, validateImportRow, type ImportSummary } from './import.logic';
import { checkNewsletterGroup } from './signup';
import { subscribePerson, type SubscribeInput, type SubscribeResult } from './subscriber';

const REGION = 'europe-west6';
const CONCURRENCY = 5;

interface ImportRequest { tenantId?: unknown; groupKey?: unknown; rows?: unknown }

/** Imports the rows one batch of `CONCURRENCY` after the other. `subscribe` is injectable for the tests. */
export async function runImport(
  db: Firestore,
  input: { tenantId: string; groupKey: string; groupName: string; rows: unknown[]; today: string },
  subscribe: (db: Firestore, input: SubscribeInput) => Promise<SubscribeResult> = subscribePerson,
): Promise<ImportSummary> {
  const summary = emptySummary();
  for (let i = 0; i < input.rows.length; i += CONCURRENCY) {
    await Promise.all(input.rows.slice(i, i + CONCURRENCY).map(async (raw) => {
      const row = validateImportRow(raw);
      if (!row) { summary.invalid++; return; }
      try {
        const result = await subscribe(db, {
          tenantId: input.tenantId,
          groupKey: input.groupKey,
          groupName: input.groupName,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          city: '',
          source: 'import',
          importOptinAt: row.optinAt,
          importConfirmAt: row.confirmAt,
          dateOfEntry: entryDate(row.confirmAt, input.today),
        });
        countResult(summary, result);
      } catch (err) {
        // one bad row must not stop the import; counted as invalid, the message may carry an address so it is not logged
        summary.invalid++;
        logger.warn(`importNewsletterSubscribers: a row failed (${(err as { code?: string })?.code ?? 'error'})`);
      }
    }));
  }
  return summary;
}

export const importNewsletterSubscribers = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, timeoutSeconds: 540, memory: '512MiB' },
  async (request: CallableRequest<ImportRequest>): Promise<ImportSummary> => {
    const CF_NAME = 'importNewsletterSubscribers';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const { tenantId, groupKey, rows } = request.data ?? {};
    if (typeof tenantId !== 'string' || !tenantId) throw new HttpsError('invalid-argument', 'tenantId is required.');
    if (typeof groupKey !== 'string' || !groupKey) throw new HttpsError('invalid-argument', 'groupKey is required.');
    if (!Array.isArray(rows)) throw new HttpsError('invalid-argument', 'rows must be a list.');
    if (rows.length > MAX_IMPORT_ROWS) throw new HttpsError('invalid-argument', `At most ${MAX_IMPORT_ROWS} rows per call.`);

    const db = getFirestore();
    // roles from the users doc: role claims are never minted
    const caller = (await db.collection(UserCollection).doc(request.auth?.uid ?? '').get()).data();
    const callerTenants = (caller?.['tenants'] ?? []) as string[];
    const roles = (caller?.['roles'] ?? {}) as Record<string, unknown>;
    if (!caller || !callerTenants.includes(tenantId)) throw new HttpsError('permission-denied', 'Caller does not belong to this tenant.');
    if (roles['memberAdmin'] !== true && roles['admin'] !== true) throw new HttpsError('permission-denied', 'Only a member admin or admin may import subscribers.');

    const group = await checkNewsletterGroup(db, tenantId, groupKey);
    if (!group.ok) throw new HttpsError('failed-precondition', 'Not a live newsletter of this tenant.');

    const summary = await runImport(db, { tenantId, groupKey, groupName: group.name, rows, today: toStoreDate(new Date()) });
    logger.info(`${CF_NAME}: tenant ${tenantId}, ${rows.length} rows: ${JSON.stringify(summary)}`);
    return summary;
  },
);
