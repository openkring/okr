// apps/functions/src/cost-center/migrate-cost-centers.ts
//
// One-off migrations of spec 1.65 §6.4, triggered from the Kostenstellen list (treasurer):
//   free-text — expenses.costCenterId, ocr-rules.costCenterId, assets.costCenter were free text
//               and become the okey of an active leaf cost centre (or '' when nothing matches);
//   backfill  — posted booking lines of the CURRENT fiscal year without a cost centre get the
//               default of their account. Earlier years stay untouched.
// Idempotent: a second run finds nothing to change. `dryRun` counts and lists without writing.

import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore, type WriteBatch } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';
import { getTodayStr } from '@okr/shared-util-core';

import { fiscalYear } from '../bank-import/bank-import.util';
import { loadFiscalYearStart } from '../booking/period-lock';
import { costCenterKeyForLine, loadCostCenterContext } from './cost-center-context';
import { bookOfDoc, decideFreeText } from './cost-center-migration.util';

const REGION = 'europe-west6';
const CF_NAME = 'migrateCostCenters';
const BATCH = 400;
const IN_CHUNK = 30;

interface MigrateRequest { accountingTenantId?: string; step?: 'free-text' | 'backfill'; dryRun?: boolean }
interface Unmatched { collection: string; okey: string; value: string }
interface MigrateResponse { scanned: number; updated: number; unmatched: Unmatched[]; unattributed: Unmatched[] }

/** [collection, field] of the free-text sources. */
const FREE_TEXT_SOURCES: [string, string][] = [['expenses', 'costCenterId'], ['ocr-rules', 'costCenterId'], ['assets', 'costCenter']];

/** Commits in chunks of BATCH writes. */
class BatchWriter {
  private batch: WriteBatch;
  private pending = 0;
  constructor(private readonly db: Firestore) { this.batch = db.batch(); }
  public async update(ref: FirebaseFirestore.DocumentReference, patch: Record<string, unknown>): Promise<void> {
    this.batch.update(ref, patch);
    if (++this.pending >= BATCH) await this.flush();
  }
  public async flush(): Promise<void> {
    if (this.pending === 0) return;
    await this.batch.commit();
    this.batch = this.db.batch();
    this.pending = 0;
  }
}

export const migrateCostCenters = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, timeoutSeconds: 540, memory: '512MiB' },
  async (request: CallableRequest<MigrateRequest>): Promise<MigrateResponse> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const accountingTenantId = (request.data?.accountingTenantId ?? '').trim();
    const step = request.data?.step;
    const dryRun = request.data?.dryRun === true;
    if (!accountingTenantId) throw new HttpsError('invalid-argument', 'accountingTenantId is required');
    if (step !== 'free-text' && step !== 'backfill') throw new HttpsError('invalid-argument', 'step must be free-text or backfill');

    const db = getFirestore();
    const config = await db.collection('accounting-configs').doc(accountingTenantId).get();
    if (((config.data()?.['accountingBackend'] as string | undefined) ?? 'native') !== 'native') {
      throw new HttpsError('failed-precondition', 'accounting-backend-not-native');
    }

    const result = step === 'free-text'
      ? await migrateFreeText(db, tenantId, accountingTenantId, dryRun)
      : await backfillCurrentYear(db, tenantId, accountingTenantId, dryRun);
    logger.info(`${CF_NAME}: ${step} ${dryRun ? 'dry run' : 'applied'} scanned=${result.scanned} updated=${result.updated} unmatched=${result.unmatched.length}`);
    return result;
  },
);

async function migrateFreeText(db: Firestore, tenantId: string, accountingTenantId: string, dryRun: boolean): Promise<MigrateResponse> {
  const ctx = await loadCostCenterContext(db, tenantId, accountingTenantId);
  // every centre of the tenant, whatever its book or archive state: such an okey is never cleared
  const allCenters = await db.collection('cost-centers').where('tenants', 'array-contains', tenantId).get();
  const allKeys = new Set(allCenters.docs.map(d => d.id));
  // account okey → its book, over ALL books of the tenant: a doc whose account sits in another book is skipped, not unattributed
  const accountSnap = await db.collection('accounts').where('tenants', 'array-contains', tenantId).get();
  const accountBook = new Map<string, string>();
  for (const a of accountSnap.docs) {
    const book = a.data()['accountingTenantId'];
    if (typeof book === 'string' && book !== '') accountBook.set(a.id, book);
  }
  const writer = new BatchWriter(db);
  const unmatched: Unmatched[] = [];
  const unattributed: Unmatched[] = [];
  let scanned = 0;
  let updated = 0;
  for (const [collection, field] of FREE_TEXT_SOURCES) {
    const snap = await db.collection(collection).where('tenants', 'array-contains', tenantId).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const value = typeof data[field] === 'string' ? (data[field] as string) : '';
      if (value.trim() === '') continue;
      scanned++;
      // the document's book: its own field, else the book of its account (ocr-rules have no field)
      const docBook = bookOfDoc(data['accountingTenantId'] as string | undefined, data['accountKey'] as string | undefined, accountBook);
      const decision = decideFreeText(value, docBook, accountingTenantId, ctx.costCenters, allKeys);
      if (decision.action === 'unattributed') { unattributed.push({ collection, okey: doc.id, value }); continue; }
      if (decision.action !== 'rewrite' && decision.action !== 'clear') continue;
      if (decision.action === 'clear') unmatched.push({ collection, okey: doc.id, value });
      updated++;
      if (!dryRun) await writer.update(doc.ref, { [field]: decision.action === 'rewrite' ? decision.newValue : '' });
    }
  }
  await writer.flush();
  return { scanned, updated, unmatched, unattributed };
}

async function backfillCurrentYear(db: Firestore, tenantId: string, accountingTenantId: string, dryRun: boolean): Promise<MigrateResponse> {
  const fiscalYearStart = await loadFiscalYearStart(db, accountingTenantId);
  const today = getTodayStr();
  const currentYear = fiscalYear(today, fiscalYearStart);

  const bookings = await db.collection('bookings')
    .where('accountingTenantId', '==', accountingTenantId)
    .where('tenants', 'array-contains', tenantId)
    .get();
  const bookingKeys = bookings.docs
    .filter(b => b.data()['status'] === 'posted')
    .filter(b => {
      const date = b.data()['date'];
      return typeof date === 'string' && /^\d{8}$/.test(date) && fiscalYear(date, fiscalYearStart) === currentYear;
    })
    .map(b => b.id);

  const ctx = await loadCostCenterContext(db, tenantId, accountingTenantId);
  const writer = new BatchWriter(db);
  let scanned = 0;
  let updated = 0;
  for (let i = 0; i < bookingKeys.length; i += IN_CHUNK) {
    const lines = await db.collection('booking-lines').where('bookingKey', 'in', bookingKeys.slice(i, i + IN_CHUNK)).get();
    for (const line of lines.docs) {
      const data = line.data();
      if (!((data['tenants'] as string[] | undefined) ?? []).includes(tenantId) || data['accountingTenantId'] !== accountingTenantId) continue;
      scanned++;
      if (typeof data['costCenterKey'] === 'string' && data['costCenterKey'].trim() !== '') continue;
      const key = costCenterKeyForLine(ctx, String(data['accountKey'] ?? ''));
      if (!key) continue;
      updated++;
      if (!dryRun) await writer.update(line.ref, { costCenterKey: key });
    }
  }
  await writer.flush();
  return { scanned, updated, unmatched: [], unattributed: [] };
}
