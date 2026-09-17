import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

import {
  AccountingConfigCollection, AccountingConfigModel,
  InvoiceCollection, InvoiceModel,
  InvoicePositionCollection, InvoicePositionModel,
  MemberFeeCollection, MemberFeeModel,
} from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkRoles } from '@okr/shared-util-functions';
import { addDuration, DateFormat, generateRandomString, getTodayStr, getYear, removeKeyFromOkrModel } from '@okr/shared-util-core';
import { getFeeTotal } from '@okr/relationship-membership-util';
import { getInvoiceIndex, getNextInvoiceNo } from '@okr/finance-invoice-util';

const REGION = 'europe-west6';

/**
 * The next `invoiceNo` for one (accountingTenantId, fiscal year) sequence. This is the SAME
 * allocator `InvoiceService.nextInvoiceNo` uses client-side (libs/finance/invoice/data-access) —
 * both fetch the existing invoiceNos their own way (rxfire vs. admin SDK) and hand them to the
 * shared, pure `getNextInvoiceNo` from `@okr/finance-invoice-util`. There is exactly one invoice-
 * number sequence per accounting tenant; this function must never invent a second one.
 */
async function nextInvoiceNo(db: Firestore, tenantId: string, accountingTenantId: string, year: number): Promise<number> {
  const snap = await db.collection(InvoiceCollection)
    .where('tenants', 'array-contains', tenantId)
    .where('isArchived', '==', false)
    .get();
  const invoiceNos = snap.docs
    .filter(d => d.data()['accountingTenantId'] === accountingTenantId)
    .map(d => (d.data()['invoiceNo'] as number) ?? 0);
  return getNextInvoiceNo(invoiceNos, year);
}

/**
 * Post every 'ready' member-fee row of a tenant as a real in-house invoice: one `InvoiceModel`
 * plus one `InvoicePositionModel` per fee position, written in a single Firestore batch per fee
 * row so a row is never left half-posted (invoice without positions, or positions without the
 * fee record being flipped to 'invoiced'). This is the 'native' counterpart to
 * uploadToBexio/createBexioInvoice: `AccountingConfigModel.accountingBackend` decides which path
 * a tenant's UI calls, and this callable also refuses to run for a 'bexio' tenant — defense in
 * depth in case something ever calls it directly instead of going through the store's routing.
 */
export const postMemberFees = onCall(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 540 },
  async (request: CallableRequest<{ tenantId?: string; accountingTenantId?: string }>) => {
    const CF_NAME = 'postMemberFees';
    checkAppCheckToken(request, CF_NAME);
    checkAuthentication(request, CF_NAME);
    // Creates invoices for member contacts — treasurer flows + privileged/admin (privacy inventory §7.2),
    // mirrors createBexioInvoice's access check.
    await checkRoles(request, CF_NAME, ['treasurer', 'privileged']);

    const { tenantId, accountingTenantId } = request.data ?? {};
    if (!tenantId) throw new HttpsError('invalid-argument', 'tenantId is required');
    if (!accountingTenantId) throw new HttpsError('invalid-argument', 'accountingTenantId is required');

    const db = getFirestore();

    const configSnap = await db.collection(AccountingConfigCollection).doc(accountingTenantId).get();
    const config = configSnap.data() as AccountingConfigModel | undefined;
    const backend = config?.accountingBackend ?? 'native';
    if (backend === 'bexio') {
      logger.error(`${CF_NAME}: accountingTenantId ${accountingTenantId} books through Bexio — refusing to post native invoices`);
      throw new HttpsError('failed-precondition', 'This accounting tenant books through Bexio; use the Bexio upload instead.');
    }

    const feeSnap = await db.collection(MemberFeeCollection)
      .where('tenants', 'array-contains', tenantId)
      .where('isArchived', '==', false)
      .where('state', '==', 'ready')
      .get();

    const scheduleYear = getYear();
    const invoiceDate = getTodayStr(DateFormat.StoreDate);
    const dueDate = addDuration(invoiceDate, { days: 30 });

    let invoiced = 0;
    for (const feeDoc of feeSnap.docs) {
      const fee = feeDoc.data() as MemberFeeModel;

      const invoice = new InvoiceModel(tenantId);
      invoice.accountingTenantId = accountingTenantId;
      invoice.receiver = fee.member;
      invoice.invoiceNo = await nextInvoiceNo(db, tenantId, accountingTenantId, scheduleYear);
      invoice.invoiceId = String(invoice.invoiceNo);
      invoice.invoiceDate = invoiceDate;
      invoice.dueDate = dueDate;
      invoice.title = `${scheduleYear} ${fee.member?.label ?? ''}`.trim();
      const totalChf = getFeeTotal(fee.positions ?? []);
      invoice.totalAmount = { amount: Math.round(totalChf * 100), currency: 'CHF', periodicity: 'one-time' };
      invoice.index = getInvoiceIndex(invoice);

      const invoiceKey = generateRandomString(20);
      const invoiceRef = db.collection(InvoiceCollection).doc(invoiceKey);

      const batch = db.batch();
      batch.set(invoiceRef, removeKeyFromOkrModel(invoice));

      for (const p of fee.positions ?? []) {
        const position = new InvoicePositionModel(tenantId);
        position.invoiceKey = invoiceKey;
        position.name = p.label;
        position.amount = p.amount;
        position.invoicePositionUsage = p.usage;
        position.invoicePositionType = p.type;
        position.accountKey = p.accountKey;
        position.vatCodeKey = p.vatCodeKey;
        position.personKey = fee.member?.key ?? '';
        position.firstName = fee.member?.name1 ?? '';
        position.lastName = fee.member?.name2 ?? '';
        position.year = scheduleYear;

        const positionKey = generateRandomString(20);
        batch.set(db.collection(InvoicePositionCollection).doc(positionKey), removeKeyFromOkrModel(position));
      }

      batch.update(feeDoc.ref, { invoiceKey, state: 'invoiced' });

      await batch.commit();
      invoiced++;
    }

    logger.info(`${CF_NAME}: posted ${invoiced} of ${feeSnap.size} 'ready' member-fee(s) for tenant ${tenantId} (accountingTenantId ${accountingTenantId})`);
    return { processed: feeSnap.size, invoiced };
  },
);
