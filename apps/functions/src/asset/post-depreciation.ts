import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';
import { AssetModel, AssetMovementModel } from '@okr/shared-models';
import { depreciationBookingKey, depreciationMovementKey, depreciationPlan } from '@okr/finance-asset-util';
import { fiscalYear } from '@okr/finance-reporting-util';

import { costCenterKeyForLine, loadCostCenterContext } from '../cost-center/cost-center-context';
import { assertPeriodsOpen, loadFiscalYearStart, touchedPeriodKeys } from '../booking/period-lock';
import { allocateBookingNo } from '../booking/booking-no';
import { isBexioBackend } from '../bexio/backend-gate';

const REGION = 'europe-west6';
const CF_NAME = 'postDepreciation';

interface PostDepreciationData { accountingTenantId?: string; year?: number }

export interface PostDepreciationResult { bookingKey: string; bookingNo: number; total: number; assets: number }

/**
 * Books the depreciation of one fiscal year (spec 1.103): ONE booking per books and year
 * (`depreciation-{books}-{year}`, so a second run is refused), dated the fiscal-year end — per asset a
 * debit on its expense account and a credit on its balance account — and per asset an
 * `asset-movements` doc (`movementType: 'depreciation'`) carrying the booking key. The amounts are
 * computed here from the assets and their earlier movements (`depreciationPlan`, the same function
 * the screen previews with); the client sends only books and year.
 */
export const postDepreciation = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<PostDepreciationData>): Promise<PostDepreciationResult> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const accountingTenantId = (request.data?.accountingTenantId ?? '').trim();
    const year = Number(request.data?.year);
    if (!accountingTenantId) throw new HttpsError('invalid-argument', 'accountingTenantId is required');
    if (!Number.isInteger(year) || year < 1900 || year > 2999) throw new HttpsError('invalid-argument', 'year must be a fiscal year');

    const db = getFirestore();
    // the books must belong to the caller's tenant — never trust the id alone
    const config = (await db.collection('accounting-configs').doc(accountingTenantId).get()).data();
    if (!config || !((config['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
      throw new HttpsError('permission-denied', `books ${accountingTenantId} do not belong to tenant ${tenantId}`);
    }
    if (isBexioBackend(config as { accountingBackend?: string })) {
      throw new HttpsError('failed-precondition', 'bexio books are read-only', { reason: 'read-only-books' });
    }

    const fiscalYearStart = await loadFiscalYearStart(db, accountingTenantId);
    const fy = fiscalYear(year, fiscalYearStart);
    const bookingKey = depreciationBookingKey(accountingTenantId, fy.year);
    const bookingRef = db.collection('bookings').doc(bookingKey);

    const scope = (col: string) => db.collection(col)
      .where('accountingTenantId', '==', accountingTenantId)
      .where('tenants', 'array-contains', tenantId)
      .where('isArchived', '==', false);
    const [assetSnap, movementSnap] = await Promise.all([scope('assets').get(), scope('asset-movements').get()]);
    const assets = assetSnap.docs.map(d => ({ ...d.data(), okey: d.id }) as AssetModel);
    const movements = movementSnap.docs.map(d => ({ ...d.data(), okey: d.id }) as AssetMovementModel);

    const rows = depreciationPlan(assets, movements, fy).filter(r => r.booked === undefined && r.amount > 0);
    if (rows.length === 0) throw new HttpsError('failed-precondition', `nothing to book for ${fy.label}`, { reason: 'nothing-to-book' });
    const missing = rows.filter(r => !r.expenseAccountKey || !r.balanceAccountKey);
    if (missing.length > 0) {
      throw new HttpsError('failed-precondition', 'assets without expense or balance account',
        { reason: 'asset-accounts-missing', assets: missing.map(r => `${r.assetNo} ${r.name}`.trim()) });
    }

    const ctx = await loadCostCenterContext(db, tenantId, accountingTenantId, rows.map(r => r.expenseAccountKey));
    const periodKeys = touchedPeriodKeys(accountingTenantId, [fy.to], fiscalYearStart);
    const title = `Abschreibungen ${fy.label}`;
    const total = rows.reduce((s, r) => s + r.amount, 0);

    const bookingNo = await db.runTransaction(async (tx) => {
      await assertPeriodsOpen(db, periodKeys, tx);
      if ((await tx.get(bookingRef)).exists) {
        throw new HttpsError('already-exists', `${bookingKey} is already booked`, { reason: 'already-booked' });
      }
      const no = await allocateBookingNo(db, tx, accountingTenantId, Number(fy.to.substring(0, 4)));
      tx.set(bookingRef, {
        title, date: fy.to, bookingNo: no, status: 'posted', accountingTenantId,
        tenants: [tenantId], isArchived: false, notes: '', tags: '', index: `n:${title}`,
      });
      for (const r of rows) {
        const amount = { amount: r.amount, currency: 'CHF', periodicity: 'one-time' };
        const description = `${r.assetNo} ${r.name}`.trim().slice(0, 200);
        const costCenterKey = costCenterKeyForLine(ctx, r.expenseAccountKey, { source: r.costCenter });
        tx.set(db.collection('booking-lines').doc(), {
          tenants: [tenantId], isArchived: false, bookingKey, accountingTenantId,
          accountKey: r.expenseAccountKey, debitAmount: amount, description,
          ...(costCenterKey ? { costCenterKey } : {}),
        });
        tx.set(db.collection('booking-lines').doc(), {
          tenants: [tenantId], isArchived: false, bookingKey, accountingTenantId,
          accountKey: r.balanceAccountKey, creditAmount: amount, description,
        });
        tx.set(db.collection('asset-movements').doc(depreciationMovementKey(bookingKey, r.assetKey)), {
          tenants: [tenantId], isArchived: false, accountingTenantId,
          assetKey: r.assetKey, movementType: 'depreciation', date: fy.to, amount, reason: title, bookingKey,
        });
      }
      return no;
    });

    logger.info(`${CF_NAME}: booked ${bookingKey} (no=${bookingNo}, ${rows.length} asset(s), total=${total}, tenant=${tenantId})`);
    return { bookingKey, bookingNo, total, assets: rows.length };
  },
);
